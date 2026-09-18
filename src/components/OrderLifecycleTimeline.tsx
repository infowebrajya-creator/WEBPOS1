import React, { useState, useEffect } from "react";
import { 
  CheckCircle2, Clock, ChefHat, Check, UtensilsCrossed, Package, 
  Bike, AlertCircle, ShieldAlert, ArrowRight, RotateCcw, Ban, 
  Trash2, FileText, ChevronDown, ChevronUp, User, Sparkles, Truck, CheckCheck,
  PackageCheck, Layers, Scale
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Order, OrderTimelineEvent } from "../lib/db";
import { OrderStatus, StaffMember } from "../types";
import { OrderLifecycleService, ORDER_WORKFLOW_STAGES, normalizeStatus } from "../lib/orderLifecycle";
import { RBACService } from "../lib/rbac";

interface OrderLifecycleTimelineProps {
  order: Order;
  activeStaff?: StaffMember;
  onOrderUpdated?: (updatedOrder: Order) => void;
  compact?: boolean;
}

export default function OrderLifecycleTimeline({
  order,
  activeStaff,
  onOrderUpdated,
  compact = false
}: OrderLifecycleTimelineProps) {
  const staff = activeStaff || RBACService.getActiveStaff();
  const [isProcessing, setIsProcessing] = useState(false);
  const [showLogs, setShowLogs] = useState(!compact);
  const [pendingTargetStatus, setPendingTargetStatus] = useState<OrderStatus | null>(null);
  const [cancelPromptOpen, setCancelPromptOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deliveryPromptOpen, setDeliveryPromptOpen] = useState(false);
  const [riderName, setRiderName] = useState(order.deliveryPartner || "");
  const [trackingId, setTrackingId] = useState(order.deliveryTrackingId || "");
  const [actionError, setActionError] = useState<string | null>(null);

  const orderType = order.orderType || "dine-in";
  const stages = ORDER_WORKFLOW_STAGES[orderType] || ORDER_WORKFLOW_STAGES["dine-in"];
  const metrics = OrderLifecycleService.calculateMetrics(order);
  const availableTransitions = OrderLifecycleService.getAvailableTransitions(order, staff);
  const isTerminated = normalizeStatus(order.orderStatus) === "cancelled" || normalizeStatus(order.orderStatus) === "voided";

  const handleActionClick = (targetStatus: OrderStatus) => {
    setActionError(null);
    const validation = OrderLifecycleService.validateTransition(order, targetStatus, staff);
    if (!validation.valid) {
      setActionError(validation.reason || "Transition is not permitted from current state.");
      return;
    }

    executeTransition(targetStatus);
  };

  const executeTransition = async (targetStatus: OrderStatus, reason?: string, authorizedBy?: string) => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await OrderLifecycleService.transitionStatus({
        orderId: order.id,
        targetStatus,
        user: staff.name,
        role: staff.role,
        reason,
        authorizedBy,
        deliveryPartner: riderName.trim() || undefined,
        trackingNumber: trackingId.trim() || undefined,
        expectedVersion: order.version
      });

      if (onOrderUpdated) {
        onOrderUpdated(res.order);
      }
      setCancelPromptOpen(false);
      setDeliveryPromptOpen(false);
      setCancelReason("");
    } catch (err: any) {
      setActionError(err.message || "Failed to update order status.");
    } finally {
      setIsProcessing(false);
    }
  };

  const badgeProps = OrderLifecycleService.getStatusBadgeProps(order.orderStatus);

  return (
    <div className="space-y-4">
      {/* Top Header Card with Status Badge & Turnaround Metrics */}
      <div className="bg-stone-50 border border-stone-200/80 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider border flex items-center gap-2 ${badgeProps.bgClass} ${badgeProps.textClass} ${badgeProps.borderClass}`}>
            <span className={`w-2 h-2 rounded-full ${badgeProps.dotClass}`} />
            {badgeProps.label}
          </div>
          <span className="text-xs text-stone-500 font-mono">
            Type: <span className="font-semibold uppercase text-stone-700">{order.orderType}</span>
            {order.tableNumber && ` • Table ${order.tableNumber}`}
          </span>
        </div>

        {/* Live Duration Stats */}
        <div className="flex items-center gap-2 font-mono text-xs text-stone-600">
          <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-stone-200 shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-stone-400" />
            <span>Turnaround: <strong>{metrics.totalTurnaroundMinutes}m</strong></span>
          </div>
          {metrics.preparationTimeMinutes !== undefined && (
            <div className="flex items-center gap-1 bg-white px-2.5 py-1 rounded-lg border border-stone-200 shadow-2xs">
              <ChefHat className="w-3.5 h-3.5 text-amber-500" />
              <span>Prep: <strong>{metrics.preparationTimeMinutes}m</strong></span>
            </div>
          )}
          {metrics.isDelayed && (
            <span className="px-2 py-0.5 rounded-md bg-red-100 text-red-700 font-bold text-[10px] flex items-center gap-1 border border-red-200 animate-pulse">
              <AlertCircle className="w-3 h-3" /> Delayed
            </span>
          )}
        </div>
      </div>

      {/* Workflow Stepper */}
      <div className="bg-white border border-stone-200/90 rounded-2xl p-4 sm:p-5 shadow-2xs">
        <div className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-400 mb-4 flex items-center justify-between">
          <span>Lifecycle Progression ({orderType})</span>
          <span className="text-stone-500">v{order.version || 1}</span>
        </div>

        {isTerminated ? (
          <div className="p-4 rounded-xl bg-red-50/70 border border-red-200 text-red-800 flex items-start gap-3">
            <Ban className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm font-serif">
                Order {order.orderStatus}
              </div>
              <p className="text-xs text-red-700 mt-0.5">
                {order.cancellationReason || order.voidReason || "Order workflow terminated."}
              </p>
              {order.cancelledAt && (
                <div className="text-[10px] text-red-500 font-mono mt-1">
                  At: {new Date(order.cancelledAt).toLocaleTimeString()} by {order.statusUpdatedBy || "Staff"}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="relative">
            {/* Stepper Progress Bar Line */}
            <div className="hidden sm:block absolute top-4 left-4 right-4 h-0.5 bg-stone-200 -z-0" />

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 relative z-10">
              {stages.map((stage, idx) => {
                const stageStatus = OrderLifecycleService.getStageStatus(order, stage.key);
                const isCurrent = stageStatus === "current";
                const isCompleted = stageStatus === "completed";

                return (
                  <div key={stage.key} className="flex flex-col items-center text-center group">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs font-bold transition-all ${
                        isCompleted
                          ? "bg-emerald-600 text-white shadow-xs"
                          : isCurrent
                          ? "bg-[#aa7c11] text-white ring-4 ring-amber-150 animate-pulse shadow-md"
                          : "bg-stone-100 text-stone-400 border border-stone-300"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        idx + 1
                      )}
                    </div>
                    <div className="mt-2">
                      <div className={`text-xs font-bold ${isCurrent ? "text-[#aa7c11]" : isCompleted ? "text-stone-900" : "text-stone-400"}`}>
                        {stage.label}
                      </div>
                      <div className="text-[10px] text-stone-500 font-mono hidden sm:block mt-0.5">
                        {stage.description}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Action Toolbar */}
        <div className="mt-6 pt-4 border-t border-stone-150 flex flex-wrap items-center justify-between gap-2.5">
          <div className="text-xs text-stone-500 font-mono">
            {isProcessing ? "Updating order state..." : "Available Actions:"}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {availableTransitions.map((t) => (
              <button
                key={t.targetStatus}
                type="button"
                disabled={isProcessing}
                onClick={() => handleActionClick(t.targetStatus)}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5 disabled:opacity-50 ${
                  t.variant === "primary"
                    ? "bg-[#aa7c11] hover:bg-[#8f680e] text-white shadow-xs active:scale-98"
                    : t.variant === "secondary"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : t.variant === "danger"
                    ? "bg-white hover:bg-red-50 text-red-600 border border-red-200"
                    : "bg-stone-100 hover:bg-stone-200 text-stone-700"
                }`}
              >
                {t.variant === "primary" && <ArrowRight className="w-3.5 h-3.5" />}
                {t.variant === "secondary" && <CheckCheck className="w-3.5 h-3.5" />}
                {t.variant === "danger" && <Ban className="w-3.5 h-3.5" />}
                {t.requiresOverride && <ShieldAlert className="w-3.5 h-3.5 text-amber-300" />}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {actionError && (
          <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded-xl flex items-center gap-2 font-mono">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionError}</span>
          </div>
        )}
      </div>

      {/* Cancellation / Void Reason Dialog */}
      <AnimatePresence>
        {cancelPromptOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-red-50/90 border border-red-200 rounded-2xl p-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 text-red-800 font-bold text-xs font-mono uppercase tracking-wider mb-2">
              <ShieldAlert className="w-4 h-4 text-red-600" />
              <span>Confirm {pendingTargetStatus} for Order #{order.id}</span>
            </div>
            <p className="text-xs text-red-700 mb-3">
              Please enter a mandatory reason or justification note. This will be recorded permanently in the audit ledger.
            </p>
            <input
              type="text"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Customer cancelled, kitchen unavailable, accidental entry"
              className="w-full px-3.5 py-2 text-xs bg-white border border-red-300 rounded-xl focus:outline-none focus:border-red-500 font-mono text-stone-900 mb-3"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelPromptOpen(false);
                  setPendingTargetStatus(null);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                disabled={!cancelReason.trim() || isProcessing}
                onClick={() => {
                  if (pendingTargetStatus) {
                    executeTransition(pendingTargetStatus, cancelReason.trim());
                  }
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-red-600 text-white hover:bg-red-700 cursor-pointer disabled:opacity-50 shadow-xs"
              >
                Confirm {pendingTargetStatus}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delivery Dispatch Dialog */}
      <AnimatePresence>
        {deliveryPromptOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="bg-purple-50/80 border border-purple-200 rounded-2xl p-4 overflow-hidden"
          >
            <div className="flex items-center gap-2 text-purple-900 font-bold text-xs font-mono uppercase tracking-wider mb-2">
              <Truck className="w-4 h-4 text-purple-600" />
              <span>Dispatch Delivery Order #{order.id}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-[10px] font-mono text-purple-800 uppercase mb-1">Rider / Partner Name</label>
                <input
                  type="text"
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  placeholder="e.g. Ramesh / Swiggy / Zomato"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-purple-200 rounded-xl focus:outline-none focus:border-purple-500 font-mono text-stone-900"
                />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-purple-800 uppercase mb-1">Tracking ID / Phone</label>
                <input
                  type="text"
                  value={trackingId}
                  onChange={(e) => setTrackingId(e.target.value)}
                  placeholder="e.g. TRK-99201"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-purple-200 rounded-xl focus:outline-none focus:border-purple-500 font-mono text-stone-900"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeliveryPromptOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono bg-white border border-stone-200 text-stone-600 hover:bg-stone-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => {
                  executeTransition("Out for Delivery", `Dispatched via ${riderName || 'Courier'}`);
                }}
                className="px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-purple-600 text-white hover:bg-purple-700 cursor-pointer shadow-xs"
              >
                Dispatch Order
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* Expandable Lifecycle Timeline Audit Log */}
      <div className="border border-stone-200/80 rounded-2xl bg-white overflow-hidden shadow-2xs">
        <button
          type="button"
          onClick={() => setShowLogs(!showLogs)}
          className="w-full px-4 py-3 bg-stone-50/60 hover:bg-stone-50 flex items-center justify-between text-xs font-mono font-bold text-stone-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-stone-400" />
            <span>Audit Trail & Event Log ({order.timeline?.length || 0} events)</span>
          </div>
          {showLogs ? <ChevronUp className="w-4 h-4 text-stone-400" /> : <ChevronDown className="w-4 h-4 text-stone-400" />}
        </button>

        {showLogs && (
          <div className="p-4 divide-y divide-stone-100 max-h-64 overflow-y-auto">
            {(!order.timeline || order.timeline.length === 0) ? (
              <div className="text-xs text-stone-400 font-mono py-2 text-center">
                No timeline events logged yet.
              </div>
            ) : (
              order.timeline.slice().reverse().map((ev, i) => (
                <div key={i} className="py-2.5 first:pt-0 last:pb-0 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-[#aa7c11] mt-1.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-stone-900 text-xs font-mono">{ev.event}</span>
                      <span className="text-[10px] text-stone-400 font-mono shrink-0">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {ev.details && (
                      <p className="text-xs text-stone-600 mt-0.5 leading-relaxed font-sans">{ev.details}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-stone-400 font-mono">
                      {ev.operator && <span>By: {ev.operator}</span>}
                      {ev.isManagerOverride && (
                        <span className="text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                          Manager Override
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
