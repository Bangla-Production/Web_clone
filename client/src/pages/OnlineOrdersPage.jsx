import React, { useState, useEffect, useCallback } from 'react';
import {
  ShoppingBag, Package, Bike, CheckCircle2, XCircle, Clock, ChevronDown,
  Truck, MapPin, Phone, User, AlertCircle, RefreshCw, Zap, Navigation2,
  ArrowRight, Receipt
} from 'lucide-react';
import {
  subscribeToOnlineOrders,
  updateOnlineOrderStatus
} from '../services/onlineOrderService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  PLACED:            { label: 'New Order',      color: 'bg-blue-500',    text: 'text-blue-700 dark:text-blue-300',    bg: 'bg-blue-50 dark:bg-blue-950/40',    border: 'border-blue-200 dark:border-blue-700' },
  CONFIRMED:         { label: 'Confirmed',      color: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-300',  bg: 'bg-amber-50 dark:bg-amber-950/40',  border: 'border-amber-200 dark:border-amber-700' },
  PREPARING:         { label: 'Preparing',      color: 'bg-orange-500',  text: 'text-orange-700 dark:text-orange-300', bg: 'bg-orange-50 dark:bg-orange-950/40', border: 'border-orange-200 dark:border-orange-700' },
  READY:             { label: 'Ready',          color: 'bg-purple-500',  text: 'text-purple-700 dark:text-purple-300', bg: 'bg-purple-50 dark:bg-purple-950/40', border: 'border-purple-200 dark:border-purple-700' },
  OUT_FOR_DELIVERY:  { label: 'Out for Delivery', color: 'bg-cyan-500', text: 'text-cyan-700 dark:text-cyan-300',    bg: 'bg-cyan-50 dark:bg-cyan-950/40',    border: 'border-cyan-200 dark:border-cyan-700' },
  COMPLETED:         { label: 'Completed',      color: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-950/40', border: 'border-emerald-200 dark:border-emerald-700' },
  CANCELLED:         { label: 'Cancelled',      color: 'bg-red-500',     text: 'text-red-700 dark:text-red-300',     bg: 'bg-red-50 dark:bg-red-950/40',     border: 'border-red-200 dark:border-red-700' },
};

const NEXT_STATUS = {
  PLACED:           'CONFIRMED',
  CONFIRMED:        'PREPARING',
  PREPARING:        null, // branching — READY or OUT_FOR_DELIVERY
  READY:            'COMPLETED',
  OUT_FOR_DELIVERY: 'COMPLETED',
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.PLACED;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide border ${cfg.text} ${cfg.bg} ${cfg.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.color}`}/>
      {cfg.label}
    </span>
  );
}

function OrderTypeBadge({ type }) {
  const isDelivery = type === 'DELIVERY';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
      isDelivery
        ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700'
        : 'bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-700'
    }`}>
      {isDelivery ? <Bike className="w-2.5 h-2.5"/> : <Package className="w-2.5 h-2.5"/>}
      {isDelivery ? 'Delivery' : 'Takeaway'}
    </span>
  );
}

// ─── Single Order Card ────────────────────────────────────────────────────────

function OrderCard({ order, restaurantId, onUpdated }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const advanceStatus = async (toStatus) => {
    setBusy(true);
    try {
      await updateOnlineOrderStatus(restaurantId, order.id, toStatus);
      toast.success(`Order #${order.id.slice(-5).toUpperCase()} → ${STATUS_CONFIG[toStatus]?.label}`);
      if (onUpdated) onUpdated();
    } catch (err) {
      toast.error('Could not update order status.');
    } finally {
      setBusy(false);
    }
  };

  const cancelOrder = async () => {
    if (!window.confirm('Cancel this order?')) return;
    await advanceStatus('CANCELLED');
  };

  const ts = order.createdAt?.toDate?.() || new Date();
  const timeStr = ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const dateStr = ts.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  const isDelivery = order.orderType === 'DELIVERY';
  const nextStatus = NEXT_STATUS[order.status];
  const cfg = STATUS_CONFIG[order.status] || STATUS_CONFIG.PLACED;

  return (
    <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} overflow-hidden transition-all`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl ${cfg.color} flex items-center justify-center shrink-0 shadow`}>
            {isDelivery ? <Bike className="w-5 h-5 text-white"/> : <Package className="w-5 h-5 text-white"/>}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold text-slate-900 dark:text-white text-sm">#{order.id.slice(-6).toUpperCase()}</span>
              <OrderTypeBadge type={order.orderType}/>
              <StatusBadge status={order.status}/>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {dateStr} · {timeStr}
              {order.customerName && <> · <User className="w-3 h-3 inline"/> {order.customerName}</>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-black text-slate-900 dark:text-white text-base">₹{(order.totalAmount || 0).toFixed(0)}</span>
          <button
            onClick={() => setExpanded(p => !p)}
            className="p-1.5 rounded-lg bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/40 transition-colors"
          >
            <ChevronDown className={`w-4 h-4 text-slate-500 dark:text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}/>
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-current/10">
          {/* Items */}
          {order.items?.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Items</p>
              <div className="space-y-1">
                {order.items.map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-slate-800 dark:text-slate-200">{item.qty || item.quantity || 1}× {item.name}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">₹{((item.price || 0) * (item.qty || item.quantity || 1)).toFixed(0)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contact & Address */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {order.customerPhone && (
              <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0"/>
                <a href={`tel:${order.customerPhone}`} className="hover:underline">{order.customerPhone}</a>
              </div>
            )}
            {isDelivery && order.deliveryAddress && (
              <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0"/>
                <span>{order.deliveryAddress}</span>
              </div>
            )}
          </div>

          {/* Live tracking link */}
          {isDelivery && (
            <a
              href={`/track/${order.id}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              <Navigation2 className="w-3.5 h-3.5"/> Live Delivery Map & Tracking →
            </a>
          )}

          {/* Notes */}
          {order.notes && (
            <div className="p-2.5 rounded-xl bg-white/50 dark:bg-black/20 border border-current/10 text-xs text-slate-600 dark:text-slate-300 italic">
              💬 {order.notes}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      {!['COMPLETED', 'CANCELLED'].includes(order.status) && (
        <div className="flex items-center gap-2 px-4 pb-4 flex-wrap">
          {/* Confirm / Preparing */}
          {nextStatus && order.status !== 'PREPARING' && (
            <button
              onClick={() => advanceStatus(nextStatus)}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow transition-all disabled:opacity-60"
            >
              <CheckCircle2 className="w-3.5 h-3.5"/>
              {STATUS_CONFIG[nextStatus]?.label}
            </button>
          )}

          {/* From PREPARING: branch to Ready (Takeaway) or Out for Delivery */}
          {order.status === 'PREPARING' && !isDelivery && (
            <button
              onClick={() => advanceStatus('READY')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-purple-500 hover:bg-purple-600 text-white text-xs font-bold shadow transition-all disabled:opacity-60"
            >
              <Zap className="w-3.5 h-3.5"/> Mark Ready for Pickup
            </button>
          )}
          {order.status === 'PREPARING' && isDelivery && (
            <button
              onClick={() => advanceStatus('OUT_FOR_DELIVERY')}
              disabled={busy}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow transition-all disabled:opacity-60"
            >
              <Bike className="w-3.5 h-3.5"/> Out for Delivery
            </button>
          )}

          <button
            onClick={cancelOrder}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-700 text-xs font-bold transition-all disabled:opacity-60"
          >
            <XCircle className="w-3.5 h-3.5"/> Cancel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const FILTERS = ['ALL', 'PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'COMPLETED', 'CANCELLED'];

export default function OnlineOrdersPage() {
  const { user, activeRestaurantId } = useAuth();
  const toast = useToast();

  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL'); // 'ALL' | 'TAKEAWAY' | 'DELIVERY'

  useEffect(() => {
    if (!activeRestaurantId) { setLoading(false); return; }
    setLoading(true);
    const unsub = subscribeToOnlineOrders(activeRestaurantId, (data) => {
      setOrders(data);
      setLoading(false);
    });
    return () => unsub();
  }, [activeRestaurantId]);

  const filtered = orders.filter(o => {
    if (filter !== 'ALL' && o.status !== filter) return false;
    if (typeFilter !== 'ALL' && o.orderType !== typeFilter) return false;
    return true;
  });

  const countFor = (s) => orders.filter(o => o.status === s).length;
  const newCount = countFor('PLACED');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingBag className="w-6 h-6 text-amber-500"/>
            Online Orders
            {newCount > 0 && (
              <span className="px-2.5 py-0.5 rounded-full bg-blue-500 text-white text-xs font-bold animate-pulse">{newCount} new</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Takeaway & Live Delivery Management</p>
        </div>
        {loading && <RefreshCw className="w-5 h-5 text-slate-400 animate-spin"/>}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Orders', value: orders.length, icon: Receipt, color: 'text-slate-700 dark:text-white', bg: 'bg-white dark:bg-slate-800' },
          { label: 'Active', value: orders.filter(o => !['COMPLETED','CANCELLED'].includes(o.status)).length, icon: Clock, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Deliveries', value: orders.filter(o => o.orderType === 'DELIVERY').length, icon: Bike, color: 'text-cyan-600 dark:text-cyan-400', bg: 'bg-cyan-50 dark:bg-cyan-900/20' },
          { label: 'Takeaways', value: orders.filter(o => o.orderType === 'TAKEAWAY').length, icon: Package, color: 'text-teal-600 dark:text-teal-400', bg: 'bg-teal-50 dark:bg-teal-900/20' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className={`${bg} rounded-2xl border border-slate-200 dark:border-slate-700 p-4 flex items-center gap-3`}>
            <Icon className={`w-6 h-6 ${color} shrink-0`}/>
            <div>
              <p className={`text-xl font-black ${color}`}>{value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {/* Type */}
        {['ALL', 'TAKEAWAY', 'DELIVERY'].map(t => (
          <button
            key={t}
            onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              typeFilter === t
                ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
            }`}
          >
            {t === 'ALL' ? 'All Types' : t === 'TAKEAWAY' ? '🛍 Takeaway' : '🛵 Delivery'}
          </button>
        ))}
        <div className="w-px bg-slate-200 dark:bg-slate-700 mx-1 self-stretch hidden sm:block"/>
        {/* Status */}
        {FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
              filter === s
                ? 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/30'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-500'
            }`}
          >
            {s === 'ALL' ? 'All Status' : STATUS_CONFIG[s]?.label || s}
            {s !== 'ALL' && countFor(s) > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-white/30 text-[9px] font-black">{countFor(s)}</span>
            )}
          </button>
        ))}
      </div>

      {/* Orders */}
      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-800 h-28 animate-pulse"/>)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400 dark:text-slate-500">
          <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-30"/>
          <p className="font-semibold">No orders found</p>
          <p className="text-sm mt-1">Orders from customers will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              restaurantId={activeRestaurantId}
              onUpdated={() => {}}
            />
          ))}
        </div>
      )}
    </div>
  );
}
