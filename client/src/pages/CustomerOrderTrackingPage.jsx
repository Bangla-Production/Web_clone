import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bike,
  CheckCircle2,
  Clock,
  MapPin,
  Phone,
  ShieldCheck,
  Store,
  Sun,
  Moon,
  AlertCircle,
  Play,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { subscribeToOnlineOrderById, updateOnlineOrderStatus } from '../services/onlineOrderService';
import {
  subscribeToDeliveryTracking,
  startSimulatedRiderMovement,
  stopRiderLocationBroadcast,
} from '../services/deliveryTrackingService';
import { DELIVERY_STATUS, DELIVERY_STATUS_LABELS } from '../services/deliveryService';
import LiveTrackingMap from '../components/delivery/LiveTrackingMap';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';

const TIMELINE_STEPS = [
  { key: 'PLACED', label: 'Order Placed', desc: 'Sent to restaurant' },
  { key: 'CONFIRMED', label: 'Confirmed', desc: 'Restaurant accepted order' },
  { key: 'PREPARING', label: 'Preparing', desc: 'Chef is cooking your meal' },
  { key: 'RIDER_ASSIGNED', label: 'Rider Assigned', desc: 'Partner heading to restaurant' },
  { key: 'PICKED_UP', label: 'Picked Up', desc: 'Food collected, on the way' },
  { key: 'OUT_FOR_DELIVERY', label: 'Out for Delivery', desc: 'Nearby your location' },
  { key: 'DELIVERED', label: 'Delivered', desc: 'Enjoy your food!' },
];

export default function CustomerOrderTrackingPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const isDark = theme === 'dark';

  const [order, setOrder] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isSimulating, setIsSimulating] = useState(false);

  // Subscribe to live order data
  useEffect(() => {
    if (!orderId) return;

    const unsubOrder = subscribeToOnlineOrderById(orderId, (data) => {
      setOrder(data);
      setLoading(false);
    });

    const unsubTracking = subscribeToDeliveryTracking(orderId, (data) => {
      setTracking(data);
    });

    return () => {
      unsubOrder();
      unsubTracking();
      stopRiderLocationBroadcast();
    };
  }, [orderId]);

  const handleSimulateRider = () => {
    if (isSimulating) {
      stopRiderLocationBroadcast();
      setIsSimulating(false);
      toast.info('GPS simulation stopped');
    } else {
      const restCoords = tracking?.restaurantCoordinates || { lat: 22.5726, lng: 88.3639 };
      const custCoords = tracking?.customerCoordinates || { lat: 22.5850, lng: 88.3750 };
      startSimulatedRiderMovement(orderId, restCoords, custCoords);
      setIsSimulating(true);
      toast.success('Simulated GPS rider movement started! Watch the live map.');
    }
  };

  const handleCancelOrder = async () => {
    if (!window.confirm('Are you sure you want to cancel this order?')) return;
    try {
      await updateOnlineOrderStatus(orderId, 'CANCELLED');
      toast.info('Order has been cancelled.');
    } catch (err) {
      toast.error('Could not cancel order.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Loading order tracking...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 text-center">
        <div className="max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-xl">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="text-lg font-black text-slate-900 dark:text-white">Order Not Found</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-6">
            We could not find any active order with ID #{orderId?.slice(-6).toUpperCase()}.
          </p>
          <Link
            to="/customer"
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow"
          >
            Return to Customer Portal
          </Link>
        </div>
      </div>
    );
  }

  const currentStatus = tracking?.status || order?.deliveryStatus || order?.status || 'PLACED';
  const currentStepIndex = TIMELINE_STEPS.findIndex((s) => s.key === currentStatus);
  const activeStepIdx = currentStepIndex >= 0 ? currentStepIndex : 0;
  const isCancelled = order.status === 'CANCELLED' || currentStatus === 'CANCELLED';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/customer')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm sm:text-base text-slate-900 dark:text-white leading-none">
                  Live Order Tracking
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 font-bold">
                  #{orderId.slice(-6).toUpperCase()}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {order.orderType === 'DELIVERY' ? 'Doorstep Delivery' : 'Takeaway Pickup'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Status Notification Banner */}
        {isCancelled ? (
          <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-3 text-xs">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-bold">This order has been cancelled.</p>
              <p className="text-[11px] opacity-80 mt-0.5">Contact restaurant for refund or assistance.</p>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-3xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                <Bike className="w-6 h-6 text-white animate-pulse" />
              </div>
              <div>
                <p className="text-xs font-semibold text-amber-100 uppercase tracking-wider">Status Update</p>
                <h1 className="text-lg font-black leading-tight">
                  {DELIVERY_STATUS_LABELS[currentStatus] || currentStatus}
                </h1>
              </div>
            </div>

            {/* Test Simulation Button */}
            <button
              onClick={handleSimulateRider}
              className="px-3.5 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow"
              title="Test GPS updates without moving"
            >
              <Play className="w-3.5 h-3.5" />
              {isSimulating ? 'Stop GPS Simulation' : 'Simulate GPS Movement'}
            </button>
          </div>
        )}

        {/* Live GPS Map */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 px-1">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-amber-500" /> Real-Time Live Map
            </span>
            {tracking?.riderCoordinates?.speed && (
              <span className="text-cyan-500 font-mono text-[11px]">
                Speed: {tracking.riderCoordinates.speed} km/h
              </span>
            )}
          </div>

          <LiveTrackingMap
            restaurantCoords={tracking?.restaurantCoordinates}
            customerCoords={tracking?.customerCoordinates}
            riderCoords={tracking?.riderCoordinates}
            status={currentStatus}
            restaurantName={tracking?.restaurantName || 'Restaurant'}
            customerAddress={order.deliveryAddress}
            className="h-80 w-full rounded-2xl"
          />
        </section>

        {/* Delivery Partner Profile Card */}
        {order.riderName && (
          <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md overflow-hidden border border-cyan-400/40">
                  {order.riderPhoto ? (
                    <img src={order.riderPhoto} alt={order.riderName} className="w-full h-full object-cover" />
                  ) : (
                    <Bike className="w-7 h-7" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white">
                      {order.riderName}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Verified Partner
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    {order.riderVehicle || 'Two Wheeler'} {order.riderVehicleNumber ? `• ${order.riderVehicleNumber}` : ''}
                  </p>
                </div>
              </div>

              {order.riderPhone && (
                <a
                  href={`tel:${order.riderPhone}`}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5" /> Call Rider
                </a>
              )}
            </div>
          </section>
        )}

        {/* Order Progress Stepper */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Delivery Timeline</h3>
          <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-800">
            {TIMELINE_STEPS.map((step, idx) => {
              const isPastOrCurrent = activeStepIdx >= idx && !isCancelled;
              const isCurrent = activeStepIdx === idx && !isCancelled;
              return (
                <div key={step.key} className="relative flex items-start gap-3">
                  <div
                    className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-all ${
                      isCurrent
                        ? 'bg-amber-500 text-white ring-4 ring-amber-100 dark:ring-amber-950/50'
                        : isPastOrCurrent
                        ? 'bg-emerald-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isPastOrCurrent ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <div className="flex-1">
                    <p
                      className={`text-xs font-bold leading-none ${
                        isCurrent
                          ? 'text-amber-600 dark:text-amber-400'
                          : isPastOrCurrent
                          ? 'text-slate-900 dark:text-white'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {step.label}
                    </p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Order Summary & Delivery Address */}
        <section className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">Order Details</h3>

          {order.deliveryAddress && (
            <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Delivering to</span>
              <p className="font-semibold text-slate-800 dark:text-slate-200">{order.deliveryAddress}</p>
              {order.notes && <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">Notes: {order.notes}</p>}
            </div>
          )}

          {/* Items List */}
          <div className="space-y-2 text-xs divide-y divide-slate-100 dark:divide-slate-800">
            {order.items?.map((it, i) => (
              <div key={i} className="pt-2 first:pt-0 flex items-center justify-between">
                <span className="text-slate-700 dark:text-slate-300 font-medium">
                  {it.qty} × {it.name}
                </span>
                <span className="font-mono text-slate-900 dark:text-white font-bold">
                  ₹{(it.price * it.qty).toFixed(0)}
                </span>
              </div>
            ))}
          </div>

          {/* Price Breakdown */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
            {order.deliveryFee !== undefined && (
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Delivery Fee</span>
                <span>{order.deliveryFee === 0 ? 'FREE' : `₹${order.deliveryFee}`}</span>
              </div>
            )}
            <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-1 border-t border-slate-100 dark:border-slate-800">
              <span>Total Paid</span>
              <span className="text-emerald-600 dark:text-emerald-400">₹{(order.totalAmount || 0).toFixed(0)}</span>
            </div>
          </div>

          {/* Cancel button if order is fresh */}
          {order.status === 'PLACED' && !isCancelled && (
            <div className="pt-2 flex justify-end">
              <button
                onClick={handleCancelOrder}
                className="text-xs text-rose-500 hover:text-rose-600 font-bold hover:underline"
              >
                Cancel Order
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
