import React, { useState, useEffect } from 'react';
import {
  Bike,
  Store,
  MapPin,
  Clock,
  Phone,
  CheckCircle2,
  AlertCircle,
  ChefHat,
  Search,
  Filter,
  User,
  Radio,
  ExternalLink,
  RefreshCw,
  Navigation,
  Eye,
} from 'lucide-react';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DELIVERY_STATUS, DELIVERY_STATUS_LABELS } from '../services/deliveryService';
import { acceptDeliveryOrder, updateDeliveryStep } from '../services/deliveryPartnerService';
import LiveTrackingMap from '../components/delivery/LiveTrackingMap';
import Modal from '../components/common/Modal';

export default function RestaurantDeliveryManagementPage() {
  const { activeRestaurantId } = useAuth();
  const toast = useToast();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // 'ALL' | 'UNASSIGNED' | 'IN_TRANSIT' | 'DELIVERED'
  const [search, setSearch] = useState('');

  // Rider assignment modal
  const [assignModalOrder, setAssignModalOrder] = useState(null);
  const [availableRiders, setAvailableRiders] = useState([]);
  const [loadingRiders, setLoadingRiders] = useState(false);

  // Live Map tracking modal
  const [mapModalOrder, setMapModalOrder] = useState(null);

  // Subscribe to delivery orders for this restaurant
  useEffect(() => {
    if (!activeRestaurantId) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'onlineOrders'),
      where('restaurantId', '==', activeRestaurantId),
      where('orderType', '==', 'DELIVERY')
    );

    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const list = [];
        snapshot.forEach((d) => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        setOrders(list);
        setLoading(false);
      },
      (err) => {
        console.error('Delivery orders query error:', err);
        setLoading(false);
      }
    );

    return unsub;
  }, [activeRestaurantId]);

  // Load riders for manual assignment
  const openAssignModal = async (order) => {
    setAssignModalOrder(order);
    setLoadingRiders(true);
    try {
      const snap = await getDocs(collection(db, 'deliveryPartners'));
      const riders = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.status !== 'SUSPENDED') {
          riders.push({ id: d.id, ...data });
        }
      });
      setAvailableRiders(riders);
    } catch (err) {
      console.error(err);
      toast.error('Could not load delivery partners');
    } finally {
      setLoadingRiders(false);
    }
  };

  const handleAssignRider = async (rider) => {
    if (!assignModalOrder) return;
    try {
      await acceptDeliveryOrder(assignModalOrder.id, {
        uid: rider.id,
        name: rider.name || 'Delivery Partner',
        phone: rider.phone || '',
        vehicleType: rider.vehicleType || 'BIKE',
        vehicleNumber: rider.vehicleNumber || '',
      });
      toast.success(`Assigned to ${rider.name}`);
      setAssignModalOrder(null);
    } catch (err) {
      console.error(err);
      toast.error('Assignment failed');
    }
  };

  const handleUpdateStatus = async (orderId, newStatus) => {
    try {
      const orderRef = doc(db, 'onlineOrders', orderId);
      const updates = {
        deliveryStatus: newStatus,
        status: newStatus === 'READY_FOR_PICKUP' ? 'PREPARING' : newStatus,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(orderRef, updates);

      // Also sync tracking doc
      const trackingRef = doc(db, 'deliveryTracking', orderId);
      await updateDoc(trackingRef, {
        status: newStatus,
        lastUpdatedAt: serverTimestamp(),
      }).catch(() => {});

      toast.success(`Order updated to: ${DELIVERY_STATUS_LABELS[newStatus] || newStatus}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to update status');
    }
  };

  const filteredOrders = orders.filter((o) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !search ||
      o.id.toLowerCase().includes(q) ||
      o.customerName?.toLowerCase().includes(q) ||
      o.customerPhone?.includes(q) ||
      o.deliveryAddress?.toLowerCase().includes(q);

    if (!matchesSearch) return false;

    if (filter === 'UNASSIGNED') return !o.riderId && o.status !== 'COMPLETED' && o.status !== 'CANCELLED';
    if (filter === 'IN_TRANSIT')
      return o.riderId && ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.deliveryStatus || o.status);
    if (filter === 'DELIVERED') return o.status === 'COMPLETED' || o.deliveryStatus === 'DELIVERED';
    return true;
  });

  const activeCount = orders.filter((o) => o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  const unassignedCount = orders.filter((o) => !o.riderId && o.status !== 'COMPLETED' && o.status !== 'CANCELLED').length;
  const inTransitCount = orders.filter((o) => ['RIDER_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.deliveryStatus || o.status)).length;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold">
              <Bike className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
              Delivery Management & Live Dispatch
            </h1>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Dispatch online orders, assign delivery riders, and monitor live GPS movement.
          </p>
        </div>

        {/* Quick KPI stats */}
        <div className="flex items-center gap-3">
          <div className="px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Active</span>
            <span className="text-base font-black text-amber-500">{activeCount}</span>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">Unassigned</span>
            <span className="text-base font-black text-rose-500">{unassignedCount}</span>
          </div>
          <div className="px-3.5 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center">
            <span className="text-[10px] text-slate-400 block font-semibold">In Transit</span>
            <span className="text-base font-black text-cyan-500">{inTransitCount}</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Order ID, customer, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          {[
            { id: 'ALL', label: 'All Orders' },
            { id: 'UNASSIGNED', label: 'Needs Rider' },
            { id: 'IN_TRANSIT', label: 'In Transit' },
            { id: 'DELIVERED', label: 'Delivered' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                filter === tab.id
                  ? 'bg-cyan-600 text-white shadow'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="py-20 text-center text-xs text-slate-400 font-semibold">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-500" />
          Loading delivery queue...
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="text-center py-20 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 shadow-sm">
          <Bike className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Delivery Orders Found</h3>
          <p className="text-xs text-slate-400 mt-1">
            {filter === 'ALL'
              ? 'New home delivery orders will appear here automatically.'
              : `No orders match filter "${filter}".`}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map((ord) => {
            const currentStatus = ord.deliveryStatus || ord.status || 'PLACED';
            const isCompleted = ord.status === 'COMPLETED';
            return (
              <div
                key={ord.id}
                className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between space-y-4 hover:border-cyan-400/50 transition-colors"
              >
                <div>
                  {/* Top: ID + Status Pill */}
                  <div className="flex items-center justify-between text-xs mb-2">
                    <span className="font-mono font-black text-slate-900 dark:text-white">
                      #{ord.id.slice(-6).toUpperCase()}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">
                      {DELIVERY_STATUS_LABELS[currentStatus] || currentStatus}
                    </span>
                  </div>

                  {/* Customer & Address */}
                  <div className="space-y-1 text-xs">
                    <p className="font-bold text-slate-900 dark:text-white">
                      {ord.customerName} {ord.customerPhone && <span className="font-normal text-slate-400">({ord.customerPhone})</span>}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{ord.deliveryAddress}</span>
                    </p>
                  </div>

                  {/* Items Summary */}
                  <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-xs space-y-1">
                    {ord.items?.map((it, idx) => (
                      <div key={idx} className="flex justify-between text-slate-600 dark:text-slate-300 text-[11px]">
                        <span>{it.qty} × {it.name}</span>
                        <span className="font-mono">₹{(it.price * it.qty).toFixed(0)}</span>
                      </div>
                    ))}
                    <div className="pt-1 border-t border-slate-200 dark:border-slate-700 flex justify-between font-bold text-slate-900 dark:text-white text-xs">
                      <span>Total Amount</span>
                      <span className="text-emerald-600 dark:text-emerald-400">₹{(ord.totalAmount || 0).toFixed(0)}</span>
                    </div>
                  </div>

                  {/* Rider Info */}
                  <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    {ord.riderName ? (
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs">
                          <Bike className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white text-[11px] leading-tight">
                            {ord.riderName}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {ord.riderVehicle} • {ord.riderVehicleNumber || 'Rider'}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <span className="text-[11px] font-semibold text-rose-500 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" /> Rider not yet assigned
                      </span>
                    )}

                    {/* View Live Map Button */}
                    <button
                      onClick={() => setMapModalOrder(ord)}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 text-slate-700 dark:text-slate-300 hover:text-cyan-600 text-[11px] font-bold flex items-center gap-1 transition-colors"
                      title="View Live GPS Map"
                    >
                      <Eye className="w-3 h-3" /> Map
                    </button>
                  </div>
                </div>

                {/* Bottom Action Buttons */}
                {!isCompleted && (
                  <div className="pt-2 flex flex-wrap gap-1.5 justify-end">
                    {currentStatus === 'PLACED' && (
                      <button
                        onClick={() => handleUpdateStatus(ord.id, 'CONFIRMED')}
                        className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow"
                      >
                        Accept & Confirm
                      </button>
                    )}

                    {currentStatus === 'CONFIRMED' && (
                      <button
                        onClick={() => handleUpdateStatus(ord.id, 'PREPARING')}
                        className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs shadow flex items-center gap-1"
                      >
                        <ChefHat className="w-3.5 h-3.5" /> Send to Kitchen
                      </button>
                    )}

                    {currentStatus === 'PREPARING' && (
                      <button
                        onClick={() => handleUpdateStatus(ord.id, 'READY_FOR_PICKUP')}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow"
                      >
                        Mark Ready for Pickup
                      </button>
                    )}

                    {!ord.riderId && (
                      <button
                        onClick={() => openAssignModal(ord)}
                        className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow flex items-center gap-1"
                      >
                        <Bike className="w-3.5 h-3.5" /> Assign Rider
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Rider Modal */}
      {assignModalOrder && (
        <Modal
          isOpen={Boolean(assignModalOrder)}
          onClose={() => setAssignModalOrder(null)}
          title={`Assign Rider for #${assignModalOrder.id.slice(-6).toUpperCase()}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4 text-xs">
            <p className="text-slate-400">
              Select an available delivery partner to dispatch this order:
            </p>

            {loadingRiders ? (
              <div className="py-8 text-center text-slate-400">Loading delivery partners...</div>
            ) : availableRiders.length === 0 ? (
              <div className="py-8 text-center text-slate-400">
                No registered delivery partners found. Ask your riders to register at{' '}
                <a href="/rider/login" target="_blank" className="text-cyan-400 underline font-bold">
                  /rider/login
                </a>
                .
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {availableRiders.map((r) => (
                  <div
                    key={r.id}
                    className="p-3 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-between gap-3 hover:border-cyan-500 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
                        <Bike className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <p className="font-bold text-white">{r.name}</p>
                          <span
                            className={`w-2 h-2 rounded-full ${
                              r.isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                            }`}
                          />
                        </div>
                        <p className="text-[11px] text-slate-400">
                          {r.vehicleType} • {r.vehicleNumber || 'No plate'} • {r.phone}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => handleAssignRider(r)}
                      className="px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow"
                    >
                      Assign
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Live Map Modal */}
      {mapModalOrder && (
        <Modal
          isOpen={Boolean(mapModalOrder)}
          onClose={() => setMapModalOrder(null)}
          title={`Live GPS Map • #${mapModalOrder.id.slice(-6).toUpperCase()}`}
          maxWidth="max-w-2xl"
        >
          <div className="space-y-3">
            <LiveTrackingMap
              restaurantCoords={mapModalOrder.restaurantCoordinates}
              customerCoords={mapModalOrder.customerCoordinates}
              riderCoords={mapModalOrder.riderCoordinates}
              status={mapModalOrder.deliveryStatus || mapModalOrder.status}
              restaurantName={mapModalOrder.restaurantName || 'Restaurant'}
              customerAddress={mapModalOrder.deliveryAddress}
              className="h-96 w-full rounded-2xl"
            />
            <div className="flex justify-between items-center text-xs text-slate-400 pt-2">
              <span>Customer: <strong className="text-white">{mapModalOrder.customerName}</strong></span>
              <span>Rider: <strong className="text-cyan-400">{mapModalOrder.riderName || 'Unassigned'}</strong></span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
