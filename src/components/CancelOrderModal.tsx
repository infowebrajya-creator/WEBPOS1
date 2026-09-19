import React, { useState, useEffect } from "react";
import { Order, LocalDB } from "../lib/db";
import { X, AlertCircle, KeyRound, FileText } from "lucide-react";

interface CancelOrderModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (cancelledOrder: Order) => void;
  operatorName?: string;
}

export const CancelOrderModal: React.FC<CancelOrderModalProps> = ({
  order,
  isOpen,
  onClose,
  onSuccess,
  operatorName = "Staff"
}) => {
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPassword("");
      setReason("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen || !order) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError("Incorrect cancellation password.");
      return;
    }

    if (!reason || !reason.trim()) {
      setError("Please enter a reason for cancellation.");
      return;
    }

    setIsSubmitting(true);
    try {
      const cancelledOrder = await LocalDB.apiCancelOrder(
        order.id,
        password,
        reason,
        operatorName
      );
      onSuccess(cancelledOrder);
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to cancel order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-stone-200 overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="bg-stone-900 text-white px-6 py-4 flex items-center justify-between border-b border-stone-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-stone-100 tracking-wide uppercase">CANCEL ORDER</h3>
              <p className="text-[11px] text-stone-400 font-mono">Order #{order.id}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-white transition-colors cursor-pointer p-1 rounded-lg hover:bg-stone-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Order Details Summary */}
        <div className="bg-stone-50 border-b border-stone-200 px-6 py-3 flex items-center justify-between text-xs font-mono">
          <div>
            <span className="text-stone-500 uppercase">Table: </span>
            <span className="font-bold text-stone-900">{order.tableNumber ? `#${order.tableNumber}` : "N/A (Takeaway)"}</span>
          </div>
          <div>
            <span className="text-stone-500 uppercase">Amount: </span>
            <span className="font-bold text-red-600">₹{order.grandTotal}</span>
          </div>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs font-semibold text-red-700 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-stone-500" />
              Cancellation Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter authorization password"
              autoFocus
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-stone-700 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-stone-500" />
              Reason for Cancellation
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Please describe why this order is being cancelled..."
              rows={3}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-300 rounded-xl text-stone-900 text-xs focus:outline-none focus:ring-2 focus:ring-stone-900 focus:bg-white transition-all resize-none"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-md disabled:opacity-50"
            >
              {isSubmitting ? "CANCELLING..." : "CONFIRM CANCELLATION"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
