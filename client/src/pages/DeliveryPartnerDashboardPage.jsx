import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bike,
  Power,
  Navigation,
  MapPin,
  Phone,
  Store,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Sun,
  Moon,
  LogOut,
  AlertCircle,
  ExternalLink,
  Radio,
  Check,
} from 'lucide-react';
import { useDeliveryPartnerAuth } from '../context/DeliveryPartnerAuthContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import {
  subscribeToAvailableOrders,
  subscribeToRiderActiveOrder,
  acceptDeliveryOrder,
  updateDeliveryStep,
} from '../services/deliveryPartnerService';
import {
  startRiderLocationBroadcast,
  stopRiderLocationBroadcast,
} from '../services/deliveryTrackingService';
import { DELIVERY_STATUS, DELIVERY_STATUS_LABELS } from '../services/deliveryService';
import LiveTrackingMap from '../components/delivery/LiveTrackingMap';

export default function DeliveryPartnerDashboardPage() {
  const navigate = useNavigate();
  const { partner, partnerProfile, loading: authLoading, logout, setOnlineStatus } =
    useDeliveryPartnerAuth();
  const { theme, toggleTheme } = useTheme();
  const toast = useToast();
  const isDark = theme === 'dark';

  const [availableOrders, setAvailableOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [riderCoords, setRiderCoords] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Authentication check
  useEffect(() => {
    if (!authLoading && !partner) {
      navigate('/rider/login');
    }
  }, [authLoading, partner, navigate]);

  // Listen for available orders if online and not on an active delivery
  useEffect(() => {
    if (!partnerProfile?.isOnline || activeOrder) {
      setAvailableOrders([]);
      return;
    }
    const unsub = subscribeToAvailableOrders((orders) => {
      setAvailableOrders(orders);
    });
    return unsub;
  }, [partnerProfile?.isOnline, activeOrder]);

  // Listen for active order assigned to this rider
  useEffect(() => {
    if (!partner?.uid) return;
    const unsub = subscribeToRiderActiveOrder(partner.uid, (order) => {
      setActiveOrder(order);
    });
    return unsub;
  }, [partner?.uid]);

  // Handle GPS location broadcast when on active delivery
  useEffect(() => {
    if (activeOrder && partner?.uid) {
      startRiderLocationBroadcast(activeOrder.id, partner.uid, (coords) => {
        setRiderCoords(coords);
      });
    } else {
      stopRiderLocationBroadcast();
      setRiderCoords(null);
    }
    return () => {
      stopRiderLocationBroadcast();
    };
  }, [activeOrder?.id, partner?.uid]);

  const handleToggleOnline = async () => {
    const nextState = !partnerProfile?.isOnline;
    await setOnlineStatus(nextState);
    if (nextState) {
      toast.success('You are now Online and ready to receive deliveries!');
    } else {
      toast.info('You are now Offline.');
    }
  };

  const handleAcceptOrder = async (order) => {
    if (!partnerProfile) return;
    setIsUpdating(true);
    try {
      await acceptDeliveryOrder(order.id, {
        uid: partner.uid,
        name: partnerProfile.name || 'Delivery Partner',
        phone: partnerProfile.phone || '',
        vehicleType: partnerProfile.vehicleType || 'BIKE',
        vehicleNumber: partnerProfile.vehicleNumber || '',
      });
      toast.success('Delivery accepted! Proceed to restaurant for pickup.');
    } catch (err) {
      console.error(err);
      toast.error('Could not accept order.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleAdvanceStep = async () => {
    if (!activeOrder) return;
    setIsUpdating(true);

    const current = activeOrder.deliveryStatus || DELIVERY_STATUS.RIDER_ASSIGNED;
    let next = null;

    if (current === DELIVERY_STATUS.RIDER_ASSIGNED) {
      next = DELIVERY_STATUS.ARRIVED_AT_RESTAURANT;
    } else if (current === DELIVERY_STATUS.ARRIVED_AT_RESTAURANT) {
      next = DELIVERY_STATUS.PICKED_UP;
    } else if (current === DELIVERY_STATUS.PICKED_UP) {
      next = DELIVERY_STATUS.ARRIVED_AT_CUSTOMER;
    } else if (current === DELIVERY_STATUS.ARRIVED_AT_CUSTOMER) {
      next = DELIVERY_STATUS.DELIVERED;
    }

    if (!next) {
      setIsUpdating(false);
      return;
    }

    try {
      await updateDeliveryStep(activeOrder.id, next, partner.uid);
      if (next === DELIVERY_STATUS.DELIVERED) {
        toast.success('Order delivered successfully! Great job.');
      } else {
        toast.info(`Status updated: ${DELIVERY_STATUS_LABELS[next]}`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Could not update status.');
    } finally {
      setIsUpdating(false);
    }
  };

  if (authLoading || !partnerProfile) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-500">Loading rider dashboard...</p>
        </div>
      </div>
    );
  }

  const isOnline = Boolean(partnerProfile.isOnline);
  const currentStatus = activeOrder?.deliveryStatus || DELIVERY_STATUS.RIDER_ASSIGNED;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors">
      {/* Rider Header */}
      <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md overflow-hidden border border-cyan-400/40">
              {partnerProfile.photoUrl ? (
                <img src={partnerProfile.photoUrl} alt={partnerProfile.name} className="w-full h-full object-cover" />
              ) : (
                <Bike className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-sm text-slate-900 dark:text-white">
                  {partnerProfile.name}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                    isOnline
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                    }`}
                  />
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                {partnerProfile.vehicleType} • {partnerProfile.vehicleNumber || 'No plate'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Online / Offline Switch */}
            <button
              onClick={handleToggleOnline}
              disabled={Boolean(activeOrder)}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow transition-all flex items-center gap-1.5 ${
                isOnline
                  ? 'bg-rose-500 hover:bg-rose-600 text-white'
                  : 'bg-emerald-500 hover:bg-emerald-600 text-white'
              } disabled:opacity-50`}
              title={activeOrder ? 'Cannot go offline during an active delivery' : 'Toggle status'}
            >
              <Power className="w-3.5 h-3.5" />
              <span>{isOnline ? 'Go Offline' : 'Go Online'}</span>
            </button>

            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              onClick={logout}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-950/40 text-slate-600 dark:text-slate-300 hover:text-red-600"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        {/* If Active Delivery is In Progress */}
        {activeOrder ? (
          <div className="space-y-6">
            {/* Active Delivery Notification Card */}
            <div className="bg-gradient-to-r from-cyan-600 to-blue-700 rounded-3xl p-5 text-white shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-3 py-1 rounded-full bg-white/20 text-xs font-bold uppercase tracking-wider backdrop-blur-md">
                  Active Delivery In Progress
                </span>
                <span className="font-mono text-xs font-bold">
                  #{activeOrder.id.slice(-6).toUpperCase()}
                </span>
              </div>

              <div>
                <h2 className="text-xl font-black">
                  {DELIVERY_STATUS_LABELS[currentStatus] || currentStatus}
                </h2>
                <p className="text-xs text-cyan-100 mt-0.5">
                  Live GPS is broadcasting your location to customer & restaurant.
                </p>
              </div>

              {/* Progress Step Advance Button */}
              <div className="pt-2">
                <button
                  onClick={handleAdvanceStep}
                  disabled={isUpdating}
                  className="w-full py-3.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-900 font-black text-sm shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Check className="w-5 h-5 text-emerald-600" />
                  {isUpdating ? (
                    'Updating status...'
                  ) : currentStatus === DELIVERY_STATUS.RIDER_ASSIGNED ? (
                    'I Have Arrived at Restaurant'
                  ) : currentStatus === DELIVERY_STATUS.ARRIVED_AT_RESTAURANT ? (
                    'Order Picked Up (Start Trip to Customer)'
                  ) : currentStatus === DELIVERY_STATUS.ARRIVED_AT_CUSTOMER ? (
                    'Confirm Delivery (Cash Collected / Delivered)'
                  ) : (
                    'Arrived at Customer Doorstep'
                  )}
                </button>
              </div>
            </div>

            {/* Live Navigation Map */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-bold px-1">
                <span className="flex items-center gap-1.5 text-cyan-600 dark:text-cyan-400">
                  <Radio className="w-4 h-4 animate-pulse text-emerald-500" /> Live Turn-by-Turn GPS Radar
                </span>
                {riderCoords?.speed && (
                  <span className="font-mono text-slate-400 text-[11px]">
                    Speed: {riderCoords.speed} km/h
                  </span>
                )}
              </div>

              <LiveTrackingMap
                restaurantCoords={activeOrder.restaurantCoordinates}
                customerCoords={activeOrder.customerCoordinates}
                riderCoords={riderCoords}
                status={currentStatus}
                restaurantName={activeOrder.restaurantName || 'Restaurant'}
                customerAddress={activeOrder.deliveryAddress}
                className="h-80 w-full rounded-2xl"
              />
            </div>

            {/* Pickup & Dropoff Address Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Pickup info */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                    <Store className="w-3.5 h-3.5" /> Pickup
                  </span>
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {activeOrder.restaurantName || 'Restaurant'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeOrder.restaurantAddress || 'Restaurant Address'}
                </p>
              </div>

              {/* Dropoff info */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" /> Dropoff
                  </span>
                  {activeOrder.customerPhone && (
                    <a
                      href={`tel:${activeOrder.customerPhone}`}
                      className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-1 hover:underline"
                    >
                      <Phone className="w-3 h-3" /> Call
                    </a>
                  )}
                </div>
                <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  {activeOrder.customerName || 'Customer'}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {activeOrder.deliveryAddress}
                </p>
              </div>
            </div>
          </div>
        ) : !isOnline ? (
          /* Offline Prompt */
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mx-auto mb-4">
              <Power className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">You Are Offline</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-6">
              Switch your status to Online to start receiving delivery orders and track earnings.
            </p>
            <button
              onClick={handleToggleOnline}
              className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all inline-flex items-center gap-2"
            >
              <Power className="w-4 h-4" /> Go Online Now
            </button>
          </div>
        ) : (
          /* Online & Looking for Orders */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Available Delivery Requests ({availableOrders.length})
                </h3>
              </div>
              <span className="text-xs text-slate-400">Live Queue</span>
            </div>

            {availableOrders.length === 0 ? (
              <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
                <Bike className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3 animate-pulse" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">Searching for Nearby Orders...</h4>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                  Keep this app open. New delivery requests from restaurants will appear here instantly.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {availableOrders.map((ord) => (
                  <div
                    key={ord.id}
                    className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4 hover:border-cyan-400 transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                          #{ord.id.slice(-6).toUpperCase()}
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 text-[10px] font-bold">
                          {ord.items?.length || 0} item(s)
                        </span>
                      </div>
                      <span className="font-extrabold text-sm text-emerald-600 dark:text-emerald-400">
                        ₹{(ord.totalAmount || 0).toFixed(0)}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex items-start gap-2">
                        <Store className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {ord.restaurantName || 'Restaurant Pickup'}
                          </p>
                          <p className="text-[11px] text-slate-400">{ord.restaurantAddress || 'Address'}</p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">Deliver to</p>
                          <p className="text-[11px] text-slate-400">{ord.deliveryAddress}</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => handleAcceptOrder(ord)}
                        disabled={isUpdating}
                        className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-xs shadow-md shadow-cyan-500/20 transition-all flex items-center gap-1.5"
                      >
                        <Check className="w-4 h-4" /> Accept Delivery Request
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
