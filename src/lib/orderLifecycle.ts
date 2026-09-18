import { LocalDB, Order, OrderTimelineEvent, supabase } from "./db";
import { OrderStatus, StaffRole, StaffMember, PermissionKey, OrderTransitionContext, OrderTransitionValidation, OrderLifecycleMetrics } from "../types";
import { RBACService } from "./rbac";

/**
 * Normalizes status strings for consistent transition checking.
 */
export function normalizeStatus(status: OrderStatus | string): string {
  const s = (status || "").trim().toLowerCase();
  if (s === "draft") return "draft";
  if (s === "new order" || s === "confirmed" || s === "accepted") return "confirmed";
  if (s === "preparing" || s === "in kitchen") return "preparing";
  if (s === "ready") return "ready";
  if (s === "served") return "served";
  if (s === "packed") return "packed";
  if (s === "out for delivery" || s === "out_for_delivery") return "out_for_delivery";
  if (s === "delivered") return "delivered";
  if (s === "completed") return "completed";
  if (s === "cancelled") return "cancelled";
  if (s === "voided") return "voided";
  if (s === "rejected") return "rejected";
  return s;
}

/**
 * Standard progression sequence per order type
 */
export const ORDER_WORKFLOW_STAGES: Record<"dine-in" | "takeaway" | "delivery", Array<{ key: string; label: string; description: string }>> = {
  "dine-in": [
    { key: "confirmed", label: "Confirmed", description: "Order confirmed & assigned to table" },
    { key: "preparing", label: "In Kitchen", description: "KOT dispatched & cooking" },
    { key: "ready", label: "Ready", description: "Food prepared & ready at pass" },
    { key: "served", label: "Served", description: "Delivered to dining table" },
    { key: "completed", label: "Completed", description: "Order fulfilled & closed" }
  ],
  "takeaway": [
    { key: "confirmed", label: "Confirmed", description: "Order confirmed for pickup" },
    { key: "preparing", label: "Preparing", description: "KOT cooking in kitchen" },
    { key: "ready", label: "Ready", description: "Food prepared, awaiting packaging" },
    { key: "packed", label: "Packed", description: "Packaged & awaiting customer pickup" },
    { key: "completed", label: "Completed", description: "Handed over to customer" }
  ],
  "delivery": [
    { key: "confirmed", label: "Confirmed", description: "Order confirmed for delivery" },
    { key: "preparing", label: "Preparing", description: "Kitchen cooking order items" },
    { key: "ready", label: "Ready", description: "Food prepared & packed" },
    { key: "out_for_delivery", label: "Out for Delivery", description: "Dispatched with rider" },
    { key: "delivered", label: "Delivered", description: "Delivered to guest address" },
    { key: "completed", label: "Completed", description: "Delivery run completed" }
  ]
};

export class OrderLifecycleService {
  /**
   * Evaluates valid transitions from the current state.
   */
  static getStandardNextStatus(order: Order): OrderStatus | null {
    const norm = normalizeStatus(order.orderStatus);
    const type = order.orderType || "dine-in";

    if (norm === "draft") return "Confirmed";

    if (type === "dine-in") {
      switch (norm) {
        case "confirmed": return "Preparing";
        case "preparing": return "Ready";
        case "ready": return "Served";
        case "served": return "Completed";
        default: return null;
      }
    } else if (type === "takeaway") {
      switch (norm) {
        case "confirmed": return "Preparing";
        case "preparing": return "Ready";
        case "ready": return "Packed";
        case "packed": return "Completed";
        default: return null;
      }
    } else if (type === "delivery") {
      switch (norm) {
        case "confirmed": return "Preparing";
        case "preparing": return "Ready";
        case "ready": return "Out for Delivery";
        case "out_for_delivery": return "Delivered";
        case "delivered": return "Completed";
        default: return null;
      }
    }

    return null;
  }

  /**
   * Validates if the target status transition is permissible, and whether manager override is needed.
   */
  static validateTransition(order: Order, targetStatus: OrderStatus, staff?: StaffMember): OrderTransitionValidation {
    const currentNorm = normalizeStatus(order.orderStatus);
    const targetNorm = normalizeStatus(targetStatus);
    const orderType = order.orderType || "dine-in";

    // Terminal states cannot transition normally
    if (currentNorm === "voided") {
      return { valid: false, reason: "Order has been permanently voided and cannot be modified." };
    }
    if (currentNorm === "cancelled" && targetNorm !== "confirmed" && targetNorm !== "draft") {
      return {
        valid: false,
        requiresManagerOverride: true,
        requiredPermission: "order.rollback",
        reason: "Cannot change status of a cancelled order without manager rollback approval."
      };
    }

    // Identical status
    if (currentNorm === targetNorm) {
      return { valid: true };
    }

    // Cancellation Validation
    if (targetNorm === "cancelled") {
      if (currentNorm === "completed" || currentNorm === "served" || currentNorm === "delivered") {
        return {
          valid: false,
          requiresManagerOverride: true,
          requiredPermission: "order.void",
          reason: "Order has already been fulfilled/completed. To invalidate, use 'Void Order' instead of cancellation.",
          suggestedAction: "void"
        };
      }
      if (currentNorm === "preparing" || currentNorm === "ready" || currentNorm === "packed" || currentNorm === "out_for_delivery") {
        return {
          valid: true,
          requiresManagerOverride: true,
          requiredPermission: "order.cancel",
          reason: `Food is already in ${order.orderStatus} state. Cancelling will waste inventory and requires manager authorization.`
        };
      }
      return { valid: true, requiredPermission: "order.cancel" };
    }

    // Voiding Validation
    if (targetNorm === "voided") {
      return {
        valid: true,
        requiresManagerOverride: true,
        requiredPermission: "order.void",
        reason: "Voiding an order permanently removes it from operational sales totals and requires manager authorization."
      };
    }

    // Rollback / Out-of-order check
    const stages = ORDER_WORKFLOW_STAGES[orderType] || ORDER_WORKFLOW_STAGES["dine-in"];
    const stageKeys = stages.map(s => s.key);
    const currentStageIdx = stageKeys.indexOf(currentNorm);
    const targetStageIdx = stageKeys.indexOf(targetNorm);

    // Rollback to earlier state
    if (currentStageIdx !== -1 && targetStageIdx !== -1 && targetStageIdx < currentStageIdx) {
      return {
        valid: true,
        requiresManagerOverride: true,
        requiredPermission: "order.rollback",
        reason: `Reverting order status from '${order.orderStatus}' back to '${targetStatus}' is an out-of-order action and requires manager authorization.`
      };
    }

    // Step-skipping check (e.g. going straight from Confirmed to Completed without prep/ready)
    if (currentStageIdx !== -1 && targetStageIdx !== -1 && targetStageIdx > currentStageIdx + 1) {
      return {
        valid: true,
        requiresManagerOverride: true,
        requiredPermission: "order.complete",
        reason: `Fast-forwarding order past intermediate stages (${stages[currentStageIdx + 1]?.label}) requires manager confirmation.`
      };
    }

    // Standard progression permission check
    let requiredPerm: PermissionKey = "order.confirm";
    if (targetNorm === "preparing") requiredPerm = "order.start_prep";
    else if (targetNorm === "ready") requiredPerm = "order.mark_ready";
    else if (targetNorm === "served" || targetNorm === "packed" || targetNorm === "out_for_delivery" || targetNorm === "delivered") requiredPerm = "order.fulfill";
    else if (targetNorm === "completed") requiredPerm = "order.complete";

    if (staff) {
      const hasPerm = RBACService.can(staff, requiredPerm);
      if (!hasPerm) {
        return {
          valid: false,
          requiresManagerOverride: true,
          requiredPermission: requiredPerm,
          reason: `Current staff role (${staff.role}) lacks '${requiredPerm}' permission. Manager approval required.`
        };
      }
    }

    return { valid: true, requiredPermission: requiredPerm };
  }

  /**
   * Returns list of next available status options with metadata.
   */
  static getAvailableTransitions(order: Order, staff?: StaffMember): Array<{
    targetStatus: OrderStatus;
    label: string;
    description: string;
    variant: "primary" | "secondary" | "danger" | "warning";
    requiresOverride: boolean;
    reason?: string;
  }> {
    const currentNorm = normalizeStatus(order.orderStatus);
    const orderType = order.orderType || "dine-in";
    const transitions: Array<{
      targetStatus: OrderStatus;
      label: string;
      description: string;
      variant: "primary" | "secondary" | "danger" | "warning";
      requiresOverride: boolean;
      reason?: string;
    }> = [];

    if (currentNorm === "voided") return [];

    // Next natural progression step
    const nextStatus = this.getStandardNextStatus(order);
    if (nextStatus) {
      let actionLabel = `Mark ${nextStatus}`;
      if (nextStatus === "Preparing") actionLabel = "Send to Kitchen / Start Prep";
      else if (nextStatus === "Ready") actionLabel = "Mark Food Ready";
      else if (nextStatus === "Served") actionLabel = "Mark Served to Table";
      else if (nextStatus === "Packed") actionLabel = "Mark Packed for Pickup";
      else if (nextStatus === "Out for Delivery") actionLabel = "Dispatch / Out for Delivery";
      else if (nextStatus === "Delivered") actionLabel = "Mark Delivered";
      else if (nextStatus === "Completed") actionLabel = "Complete Order";

      const val = this.validateTransition(order, nextStatus, staff);
      transitions.push({
        targetStatus: nextStatus,
        label: actionLabel,
        description: `Advance order to ${nextStatus}`,
        variant: "primary",
        requiresOverride: !!val.requiresManagerOverride,
        reason: val.reason
      });
    }

    // Completed shortcut if not completed yet
    if (currentNorm !== "completed" && nextStatus !== "Completed") {
      const compVal = this.validateTransition(order, "Completed", staff);
      transitions.push({
        targetStatus: "Completed",
        label: "Complete Order",
        description: "Finalize and close operational workflow",
        variant: "secondary",
        requiresOverride: !!compVal.requiresManagerOverride,
        reason: compVal.reason
      });
    }

    // Cancellation option if active
    if (currentNorm !== "cancelled" && currentNorm !== "completed" && currentNorm !== "voided") {
      const cancelVal = this.validateTransition(order, "Cancelled", staff);
      transitions.push({
        targetStatus: "Cancelled",
        label: "Cancel Order",
        description: cancelVal.reason || "Cancel active order",
        variant: "danger",
        requiresOverride: !!cancelVal.requiresManagerOverride,
        reason: cancelVal.reason
      });
    }

    // Void option if completed or served
    if (currentNorm === "completed" || currentNorm === "served" || currentNorm === "delivered") {
      const voidVal = this.validateTransition(order, "Voided", staff);
      transitions.push({
        targetStatus: "Voided",
        label: "Void Order",
        description: "Administrative void of fulfilled order",
        variant: "danger",
        requiresOverride: true,
        reason: voidVal.reason
      });
    }

    return transitions;
  }

  /**
   * Executes authoritative order transition with optimistic locking, timestamp recording, KOT sync, and timeline logging.
   */
  static async transitionStatus(ctx: OrderTransitionContext): Promise<{ success: boolean; order: Order; message: string }> {
    const orders = LocalDB.getOrders();
    const idx = orders.findIndex(o => o.id === ctx.orderId);
    if (idx === -1) {
      throw new Error(`Order #${ctx.orderId} not found in database.`);
    }

    const order = orders[idx];
    const previousStatus = order.orderStatus;

    // Concurrency Protection / Version Check
    if (ctx.expectedVersion !== undefined && order.version !== undefined && order.version !== ctx.expectedVersion) {
      throw new Error(`Concurrency Conflict: Order #${order.id} was modified by another operator. Please refresh and retry.`);
    }

    const targetNorm = normalizeStatus(ctx.targetStatus);
    const nowIso = new Date().toISOString();

    // Validate Transition if not forced
    if (!ctx.forceOverride) {
      const validation = this.validateTransition(order, ctx.targetStatus);
      if (!validation.valid && !ctx.authorizedBy) {
        throw new Error(validation.reason || "Invalid status transition.");
      }
    }

    // Update operational status
    order.orderStatus = ctx.targetStatus;
    order.statusUpdatedBy = ctx.user;
    order.version = (order.version || 1) + 1;

    // Record lifecycle timestamp
    if (targetNorm === "confirmed") {
      order.confirmedAt = order.confirmedAt || nowIso;
    } else if (targetNorm === "preparing") {
      order.preparingAt = order.preparingAt || nowIso;
    } else if (targetNorm === "ready") {
      order.readyAt = order.readyAt || nowIso;
    } else if (targetNorm === "served") {
      order.servedAt = order.servedAt || nowIso;
    } else if (targetNorm === "packed") {
      order.packedAt = order.packedAt || nowIso;
    } else if (targetNorm === "out_for_delivery") {
      order.dispatchedAt = order.dispatchedAt || nowIso;
      if (ctx.deliveryPartner) order.deliveryPartner = ctx.deliveryPartner;
      if (ctx.trackingNumber) order.deliveryTrackingId = ctx.trackingNumber;
    } else if (targetNorm === "delivered") {
      order.deliveredAt = order.deliveredAt || nowIso;
    } else if (targetNorm === "completed") {
      order.completedAt = order.completedAt || nowIso;
    } else if (targetNorm === "cancelled") {
      order.cancelledAt = nowIso;
      order.cancellationReason = ctx.reason || "Cancelled by operator";
    } else if (targetNorm === "voided") {
      order.voidedAt = nowIso;
      order.voidReason = ctx.reason || "Voided by manager";
    }

    if (ctx.notes) {
      order.fulfillmentNotes = ctx.notes;
    }

    // Timeline event creation
    if (!order.timeline) order.timeline = [];
    const overrideText = ctx.authorizedBy ? ` (Authorized by ${ctx.authorizedBy})` : "";
    const reasonText = ctx.reason ? `. Reason: "${ctx.reason}"` : "";
    const notesText = ctx.notes ? `. Notes: "${ctx.notes}"` : "";

    const timelineEvent: OrderTimelineEvent = {
      event: `Status: ${ctx.targetStatus}`,
      timestamp: nowIso,
      operator: ctx.user,
      previousStatus,
      newStatus: ctx.targetStatus,
      reason: ctx.reason,
      isManagerOverride: !!ctx.authorizedBy,
      details: `Transitioned from '${previousStatus}' to '${ctx.targetStatus}' by ${ctx.user}${overrideText}${reasonText}${notesText}`
    };
    order.timeline.push(timelineEvent);

    // Save locally
    orders[idx] = order;
    LocalDB.saveOrders(orders);

    // Table Management Integration
    if (order.orderType === "dine-in" && order.tableNumber) {
      const tables = LocalDB.getTables();
      const targetTable = tables.find(t => t.tableNumber === order.tableNumber || t.id === order.tableNumber);
      if (targetTable) {
        if (targetNorm === "completed" || targetNorm === "cancelled" || targetNorm === "voided") {
          if (order.paymentStatus === "Paid" || targetNorm === "cancelled" || targetNorm === "voided") {
            targetTable.status = "Available";
            LocalDB.saveTables(tables);
          }
        } else if (targetNorm === "confirmed" || targetNorm === "preparing" || targetNorm === "ready" || targetNorm === "served") {
          if (targetTable.status !== "Occupied") {
            targetTable.status = "Occupied";
            LocalDB.saveTables(tables);
          }
        }
      }
    }

    // KOT Synchronization
    this.syncLinkedKOTStatus(order.id, ctx.targetStatus).catch(e => {
      console.warn("[KOT sync notice]:", e);
    });

    // Add Audit Log
    LocalDB.addAuditLog(
      `Order Lifecycle: ${ctx.targetStatus}`,
      `Order #${order.id} moved from '${previousStatus}' -> '${ctx.targetStatus}' by ${ctx.user}${overrideText}${reasonText}`,
      ctx.user
    );

    // Supabase Background Sync
    this.syncOrderLifecycleToSupabase(order).catch(e => {
      console.warn("[OrderLifecycle Supabase Sync Notice]:", e);
    });

    // Dispatch Events
    window.dispatchEvent(new CustomEvent("order_status_updated", {
      detail: {
        order,
        previousStatus,
        newStatus: ctx.targetStatus,
        operator: ctx.user
      }
    }));
    window.dispatchEvent(new CustomEvent("order_lifecycle_event", { detail: { order, timelineEvent } }));
    window.dispatchEvent(new Event("storage"));

    return {
      success: true,
      order,
      message: `Order #${order.id} status updated to '${ctx.targetStatus}'.`
    };
  }

  /**
   * Helper to cancel an order with audit trail.
   */
  static async cancelOrder(orderId: string, reason: string, user: string, authorizedBy?: string): Promise<{ success: boolean; order: Order; message: string }> {
    return this.transitionStatus({
      orderId,
      targetStatus: "Cancelled",
      user,
      reason,
      authorizedBy,
      forceOverride: !!authorizedBy
    });
  }

  /**
   * Helper to void an order with manager authorization.
   */
  static async voidOrder(orderId: string, reason: string, user: string, authorizedBy?: string): Promise<{ success: boolean; order: Order; message: string }> {
    return this.transitionStatus({
      orderId,
      targetStatus: "Voided",
      user,
      reason,
      authorizedBy: authorizedBy || user,
      forceOverride: true
    });
  }

  /**
   * Synchronizes linked KOT tickets when order status changes.
   */
  private static async syncLinkedKOTStatus(orderId: string, orderStatus: OrderStatus): Promise<void> {
    const norm = normalizeStatus(orderStatus);
    const kots = LocalDB.getKOTs();
    let updated = false;

    for (const kot of kots) {
      if (kot.orderId === orderId) {
        if (norm === "preparing" && kot.status === "New Order") {
          kot.status = "Preparing";
          updated = true;
        } else if (norm === "ready" && (kot.status === "Preparing" || kot.status === "New Order" || kot.status === "Accepted")) {
          kot.status = "Ready";
          updated = true;
        } else if (norm === "served" && kot.status !== "Served" && kot.status !== "Cancelled") {
          kot.status = "Served";
          updated = true;
        } else if ((norm === "cancelled" || norm === "voided") && kot.status !== "Cancelled") {
          kot.status = "Cancelled";
          updated = true;
        }
      }
    }

    if (updated) {
      LocalDB.saveKOTs(kots);
      window.dispatchEvent(new Event("kots_updated"));
    }
  }

  /**
   * Asynchronous Supabase sync helper.
   */
  private static async syncOrderLifecycleToSupabase(order: Order): Promise<void> {
    try {
      const payload: any = {
        order_status: order.orderStatus,
        confirmed_at: order.confirmedAt || null,
        preparing_at: order.preparingAt || null,
        ready_at: order.readyAt || null,
        served_at: order.servedAt || null,
        packed_at: order.packedAt || null,
        dispatched_at: order.dispatchedAt || null,
        delivered_at: order.deliveredAt || null,
        completed_at: order.completedAt || null,
        cancelled_at: order.cancelledAt || null,
        cancellation_reason: order.cancellationReason || null,
        status_updated_by: order.statusUpdatedBy || null,
        version: order.version || 1,
        fulfillment_notes: order.fulfillmentNotes || null,
        delivery_partner: order.deliveryPartner || null,
        delivery_tracking_id: order.deliveryTrackingId || null,
        timeline: order.timeline || []
      };

      await supabase.from("orders").update(payload).eq("id", order.id);
    } catch (err) {
      console.warn("[syncOrderLifecycleToSupabase] Supabase sync fallback:", err);
    }
  }

  /**
   * Computes operational stage durations and delays.
   */
  static calculateMetrics(order: Order): OrderLifecycleMetrics {
    const createdMs = new Date(order.createdAt).getTime();
    const confirmedMs = order.confirmedAt ? new Date(order.confirmedAt).getTime() : undefined;
    const preparingMs = order.preparingAt ? new Date(order.preparingAt).getTime() : undefined;
    const readyMs = order.readyAt ? new Date(order.readyAt).getTime() : undefined;
    const fulfillMs = (order.servedAt || order.packedAt || order.deliveredAt)
      ? new Date(order.servedAt || order.packedAt || order.deliveredAt || "").getTime()
      : undefined;
    const completedMs = order.completedAt ? new Date(order.completedAt).getTime() : undefined;

    const confirmationTimeMinutes = (confirmedMs && createdMs)
      ? Math.max(0, Math.round((confirmedMs - createdMs) / 60000))
      : undefined;

    const preparationTimeMinutes = (readyMs && preparingMs)
      ? Math.max(0, Math.round((readyMs - preparingMs) / 60000))
      : undefined;

    const fulfillmentTimeMinutes = (fulfillMs && readyMs)
      ? Math.max(0, Math.round((fulfillMs - readyMs) / 60000))
      : undefined;

    const endMs = completedMs || Date.now();
    const totalTurnaroundMinutes = Math.max(0, Math.round((endMs - createdMs) / 60000));

    // Delay warning: if preparing takes > 25 mins or total active time > 45 mins
    const isDelayed = (preparationTimeMinutes !== undefined && preparationTimeMinutes > 25) ||
      (order.orderStatus !== "Completed" && order.orderStatus !== "Cancelled" && order.orderStatus !== "Voided" && totalTurnaroundMinutes > 45);

    return {
      confirmationTimeMinutes,
      preparationTimeMinutes,
      fulfillmentTimeMinutes,
      totalTurnaroundMinutes,
      isDelayed
    };
  }

  /**
   * Determines stage state for timeline renderer ("completed" | "current" | "pending" | "failed")
   */
  static getStageStatus(order: Order, stageKey: string): "completed" | "current" | "pending" | "failed" {
    const currentNorm = normalizeStatus(order.orderStatus);
    if (currentNorm === "cancelled" || currentNorm === "voided" || currentNorm === "rejected") {
      return "failed";
    }

    const orderType = order.orderType || "dine-in";
    const stages = ORDER_WORKFLOW_STAGES[orderType] || ORDER_WORKFLOW_STAGES["dine-in"];
    const stageKeys = stages.map(s => s.key);
    const currentIdx = stageKeys.indexOf(currentNorm);
    const targetIdx = stageKeys.indexOf(stageKey);

    if (currentIdx === -1) {
      // If current status is New Order, treat as confirmed
      if (stageKey === "confirmed") return "current";
      return "pending";
    }

    if (targetIdx < currentIdx) return "completed";
    if (targetIdx === currentIdx) return "current";
    return "pending";
  }

  /**
   * Unified visual badge styling for order statuses.
   */
  static getStatusBadgeProps(status: OrderStatus | string): {
    label: string;
    bgClass: string;
    textClass: string;
    borderClass: string;
    dotClass: string;
  } {
    const norm = normalizeStatus(status);
    switch (norm) {
      case "draft":
        return {
          label: "Draft",
          bgClass: "bg-stone-100",
          textClass: "text-stone-700",
          borderClass: "border-stone-300",
          dotClass: "bg-stone-400"
        };
      case "confirmed":
        return {
          label: "Confirmed",
          bgClass: "bg-amber-50",
          textClass: "text-amber-800",
          borderClass: "border-amber-200",
          dotClass: "bg-amber-500 animate-pulse"
        };
      case "preparing":
        return {
          label: "Preparing",
          bgClass: "bg-blue-50",
          textClass: "text-blue-800",
          borderClass: "border-blue-200",
          dotClass: "bg-blue-500 animate-spin"
        };
      case "ready":
        return {
          label: "Ready",
          bgClass: "bg-emerald-50",
          textClass: "text-emerald-800",
          borderClass: "border-emerald-200",
          dotClass: "bg-emerald-500 animate-pulse"
        };
      case "served":
        return {
          label: "Served",
          bgClass: "bg-teal-50",
          textClass: "text-teal-800",
          borderClass: "border-teal-200",
          dotClass: "bg-teal-500"
        };
      case "packed":
        return {
          label: "Packed",
          bgClass: "bg-indigo-50",
          textClass: "text-indigo-800",
          borderClass: "border-indigo-200",
          dotClass: "bg-indigo-500"
        };
      case "out_for_delivery":
        return {
          label: "Out for Delivery",
          bgClass: "bg-purple-50",
          textClass: "text-purple-800",
          borderClass: "border-purple-200",
          dotClass: "bg-purple-500 animate-bounce"
        };
      case "delivered":
        return {
          label: "Delivered",
          bgClass: "bg-green-50",
          textClass: "text-green-800",
          borderClass: "border-green-200",
          dotClass: "bg-green-600"
        };
      case "completed":
        return {
          label: "Completed",
          bgClass: "bg-emerald-100",
          textClass: "text-emerald-900",
          borderClass: "border-emerald-300",
          dotClass: "bg-emerald-600"
        };
      case "cancelled":
        return {
          label: "Cancelled",
          bgClass: "bg-red-50",
          textClass: "text-red-800",
          borderClass: "border-red-200",
          dotClass: "bg-red-500"
        };
      case "voided":
        return {
          label: "Voided",
          bgClass: "bg-rose-100",
          textClass: "text-rose-900",
          borderClass: "border-rose-300",
          dotClass: "bg-rose-600"
        };
      default:
        return {
          label: String(status || "Unknown"),
          bgClass: "bg-stone-50",
          textClass: "text-stone-700",
          borderClass: "border-stone-200",
          dotClass: "bg-stone-400"
        };
    }
  }
}
