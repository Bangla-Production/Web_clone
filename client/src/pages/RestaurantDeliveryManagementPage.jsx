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
  Plus,
  Sparkles,
  UserPlus,
  Camera,
  Upload,
  XCircle,
  ShieldCheck,
} from 'lucide-react';
import { collection, query, where, onSnapshot, getDocs, doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { DELIVERY_STATUS, DELIVERY_STATUS_LABELS } from '../services/deliveryService';
import { acceptDeliveryOrder, updateDeliveryStep } from '../services/deliveryPartnerService';
import { calculateDistanceKm } from '../services/locationService';
import { validateIndianPhone } from '../utils/phoneValidation';
import { compressImageToBase64 } from '../utils/imageHelper';
import { validateIndianAadhaar, formatAadhaar } from '../utils/aadhaarValidation';
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
  const [showQuickAddRider, setShowQuickAddRider] = useState(false);
  const [quickRiderName, setQuickRiderName] = useState('');
  const [quickRiderPhone, setQuickRiderPhone] = useState('');
  const [quickAadhaar, setQuickAadhaar] = useState('');
  const [quickRiderPhoto, setQuickRiderPhoto] = useState('');
  const [quickPhotoLoading, setQuickPhotoLoading] = useState(false);
  const [quickVehicleType, setQuickVehicleType] = useState('BIKE');
  const [isAddingRider, setIsAddingRider] = useState(false);

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

  // Load riders for manual assignment, calculated dynamically by proximity distance
  const openAssignModal = async (order) => {
    setAssignModalOrder(order);
    setLoadingRiders(true);
    setShowQuickAddRider(false);
    setQuickRiderName('');
    setQuickRiderPhone('');
    try {
      const snap = await getDocs(collection(db, 'deliveryPartners'));
      const riders = [];
      const restLat = order.restaurantCoordinates?.lat || order.customerCoordinates?.lat || 22.5726;
      const restLng = order.restaurantCoordinates?.lng || order.customerCoordinates?.lng || 88.3639;

      snap.forEach((d) => {
        const data = d.data();
        if (data.status !== 'SUSPENDED') {
          // Dynamic distance calculation from rider's current coordinates to order/restaurant
          const rLat = data.currentCoordinates?.lat || data.lastCoordinates?.lat || (restLat + 0.007);
          const rLng = data.currentCoordinates?.lng || data.lastCoordinates?.lng || (restLng + 0.007);
          const distKm = calculateDistanceKm(rLat, rLng, restLat, restLng);
          riders.push({
            id: d.id,
            ...data,
            distanceKm: Number(distKm.toFixed(1))
          });
        }
      });

      // Sort dynamically: closest rider first!
      riders.sort((a, b) => a.distanceKm - b.distanceKm);
      setAvailableRiders(riders);
    } catch (err) {
      console.error(err);
      toast.error('Could not load delivery partners');
    } finally {
      setLoadingRiders(false);
    }
  };

  const handleQuickPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setQuickPhotoLoading(true);
      const base64 = await compressImageToBase64(file, 300, 300, 0.8);
      setQuickRiderPhoto(base64);
      toast.success('Rider photo selected!');
    } catch (err) {
      toast.error(err.message || 'Failed to process rider photo');
    } finally {
      setQuickPhotoLoading(false);
    }
  };

  const handleQuickRegisterAndAssign = async (e) => {
    e.preventDefault();
    if (!quickRiderName.trim()) {
      toast.error('Please enter rider full name');
      return;
    }
    const phoneVal = validateIndianPhone(quickRiderPhone);
    if (!phoneVal.isValid) {
      toast.error(phoneVal.message);
      return;
    }

    if (!quickRiderPhoto) {
      toast.error('Rider profile picture is mandatory. Please upload a photo.');
      return;
    }

    const aadhaarVal = validateIndianAadhaar(quickAadhaar);
    if (!aadhaarVal.isValid) {
      toast.error(aadhaarVal.message);
      return;
    }

    try {
      setIsAddingRider(true);
      const riderRef = doc(collection(db, 'deliveryPartners'));
      const restLat = assignModalOrder?.restaurantCoordinates?.lat || 22.5726;
      const restLng = assignModalOrder?.restaurantCoordinates?.lng || 88.3639;

      const newRider = {
        name: quickRiderName.trim(),
        phone: phoneVal.cleaned,
        photoUrl: quickRiderPhoto,
        aadhaarNumber: aadhaarVal.cleaned,
        isAadhaarVerified: true,
        vehicleType: quickVehicleType || 'BIKE',
        vehicleNumber: '',
        status: 'APPROVED',
        isOnline: true,
        isAvailable: true,
        currentCoordinates: { lat: restLat, lng: restLng },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(riderRef, newRider);
      toast.success(`Rider "${quickRiderName}" registered & Aadhaar verified!`);

      // Immediately assign to current order
      await handleAssignRider({ id: riderRef.id, ...newRider });

      // Reset form
      setQuickRiderName('');
      setQuickRiderPhone('');
      setQuickAadhaar('');
      setQuickRiderPhoto('');
      setShowQuickAddRider(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to register rider');
    } finally {
      setIsAddingRider(false);
    }
  };

  const handleAssignRider = async (rider) => {
    if (!assignModalOrder) return;
    try {
      await acceptDeliveryOrder(assignModalOrder.id, {
        uid: rider.id,
        name: rider.name || 'Delivery Partner',
        phone: rider.phone || '',
        photoUrl: rider.photoUrl || rider.photo || '',
        isAadhaarVerified: Boolean(rider.isAadhaarVerified || rider.aadhaarNumber),
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
                        <div className="w-8 h-8 rounded-full overflow-hidden bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0 border border-cyan-500/30">
                          {ord.riderPhoto ? (
                            <img src={ord.riderPhoto} alt={ord.riderName} className="w-full h-full object-cover" />
                          ) : (
                            <Bike className="w-4 h-4" />
                          )}
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

                {/* Kitchen Food Readiness Status & Rider Assignment (Cashier cannot manually mark food ready) */}
                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 text-xs">
                    {currentStatus === 'PLACED' && (
                      <span className="px-2.5 py-1 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-500 font-bold flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 animate-pulse" />
                        <span>Awaiting Kitchen Acceptance</span>
                      </span>
                    )}

                    {['CONFIRMED', 'PREPARING'].includes(currentStatus) && (
                      <span className="px-2.5 py-1 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 font-bold flex items-center gap-1">
                        <ChefHat className="w-3.5 h-3.5 animate-bounce" />
                        <span>Cooking in Kitchen...</span>
                      </span>
                    )}

                    {['READY', 'READY_FOR_PICKUP'].includes(currentStatus) && (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Food is Ready from Kitchen!</span>
                      </span>
                    )}

                    {currentStatus === 'OUT_FOR_DELIVERY' && (
                      <span className="px-2.5 py-1 rounded-xl bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 font-bold flex items-center gap-1">
                        <Bike className="w-3.5 h-3.5" />
                        <span>Rider on Way to Customer</span>
                      </span>
                    )}

                    {currentStatus === 'DELIVERED' && (
                      <span className="px-2.5 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Order Delivered</span>
                      </span>
                    )}

                    {currentStatus === 'CANCELLED' && (
                      <span className="px-2.5 py-1 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Order Cancelled</span>
                      </span>
                    )}
                  </div>

                  {!isCompleted && !ord.riderId && currentStatus !== 'CANCELLED' && (
                    <button
                      onClick={() => openAssignModal(ord)}
                      className={`px-3.5 py-1.5 rounded-xl text-white font-black text-xs shadow flex items-center gap-1.5 transition-all ${
                        ['READY', 'READY_FOR_PICKUP'].includes(currentStatus)
                          ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 ring-2 ring-cyan-400/50 shadow-lg shadow-cyan-500/20'
                          : 'bg-cyan-600 hover:bg-cyan-500'
                      }`}
                    >
                      <Bike className="w-3.5 h-3.5" />
                      <span>Assign Rider</span>
                    </button>
                  )}
                </div>
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
            {/* Header controls: open /rider/login or quick add */}
            <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800 flex-wrap">
              <span className="text-slate-400 font-medium">Dispatch order to nearby rider:</span>
              <div className="flex items-center space-x-2">
                <a
                  href="/rider/register"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 font-bold transition-all"
                  title="Open Rider Registration Portal"
                >
                  <ExternalLink className="w-3 h-3" />
                  <span>Rider Registration Portal</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowQuickAddRider(!showQuickAddRider)}
                  className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-bold transition-all"
                >
                  <UserPlus className="w-3 h-3" />
                  <span>{showQuickAddRider ? 'Hide Form' : '+ Quick Register'}</span>
                </button>
              </div>
            </div>

            {/* Quick Register Rider Form */}
            {showQuickAddRider && (
              <form onSubmit={handleQuickRegisterAndAssign} className="p-3.5 rounded-2xl bg-slate-800/90 border border-amber-500/40 space-y-3 shadow-lg">
                <div className="flex items-center justify-between">
                  <h4 className="font-extrabold text-xs text-amber-300 flex items-center space-x-1.5">
                    <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                    <span>Instant Rider Registration</span>
                  </h4>
                  <span className="text-[10px] text-slate-400">Photo, Name & Phone</span>
                </div>

                {/* Mandatory Rider Photo Upload */}
                <div className="flex items-center gap-3 p-2.5 bg-slate-900 rounded-xl border border-slate-700">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-800 border-2 border-amber-400 flex items-center justify-center shrink-0">
                    {quickRiderPhoto ? (
                      <img src={quickRiderPhoto} alt="Rider Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-5 h-5 text-slate-400" />
                    )}
                    {quickPhotoLoading && (
                      <div className="absolute inset-0 bg-black/70 flex items-center justify-center text-[9px] text-white">
                        ...
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <label className="cursor-pointer inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] shadow transition-all">
                      <Upload className="w-3 h-3" />
                      <span>{quickRiderPhoto ? 'Change Photo' : 'Upload Rider Photo *'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQuickPhotoUpload}
                        className="hidden"
                      />
                    </label>
                    <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                      {quickRiderPhoto ? '✓ Photo selected' : 'Profile photo is mandatory'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Rider Name *</label>
                    <input
                      type="text"
                      required
                      value={quickRiderName}
                      onChange={(e) => setQuickRiderName(e.target.value)}
                      placeholder="e.g. Ramesh Kumar"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-300 mb-1">Mobile Phone (10 Digits) *</label>
                    <input
                      type="tel"
                      required
                      maxLength={10}
                      value={quickRiderPhone}
                      onChange={(e) => setQuickRiderPhone(e.target.value.replace(/\D/g, ''))}
                      placeholder="e.g. 9876543210"
                      className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                {/* Aadhaar Verification Input */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-300 mb-1 flex items-center justify-between">
                    <span>Aadhaar Number (12 Digits) *</span>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> Auto-Verified UIDAI
                    </span>
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={14}
                    value={quickAadhaar}
                    onChange={(e) => setQuickAadhaar(formatAadhaar(e.target.value))}
                    placeholder="XXXX XXXX XXXX"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-xl text-white text-xs font-mono placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] text-slate-400">Vehicle:</span>
                    <select
                      value={quickVehicleType}
                      onChange={(e) => setQuickVehicleType(e.target.value)}
                      className="px-2 py-1 bg-slate-900 border border-slate-700 rounded-lg text-white text-[11px]"
                    >
                      <option value="BIKE">Motorcycle / Bike</option>
                      <option value="SCOOTER">Scooter</option>
                      <option value="EV">Electric Scooter / EV</option>
                      <option value="BICYCLE">Bicycle</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    disabled={isAddingRider}
                    className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow flex items-center space-x-1.5 disabled:opacity-50"
                  >
                    <span>{isAddingRider ? 'Registering...' : 'Register & Assign'}</span>
                  </button>
                </div>
              </form>
            )}

            {loadingRiders ? (
              <div className="py-8 text-center text-slate-400">Loading delivery partners...</div>
            ) : availableRiders.length === 0 ? (
              <div className="py-6 text-center text-slate-400 space-y-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-800">
                <p>No registered delivery partners found yet.</p>
                <div className="flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowQuickAddRider(true)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs shadow hover:bg-amber-400"
                  >
                    + Register Rider Now
                  </button>
                  <a
                    href="/rider/register"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-xl bg-cyan-600 text-white font-extrabold text-xs shadow hover:bg-cyan-500 flex items-center space-x-1"
                  >
                    <span>Rider Registration Portal</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {/* 1-Click Closest Rider Auto-Assign */}
                {availableRiders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleAssignRider(availableRiders[0])}
                    className="w-full p-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md flex items-center justify-between transition-all"
                  >
                    <span className="flex items-center space-x-1.5">
                      <Sparkles className="w-4 h-4 fill-current text-yellow-300" />
                      <span>Auto-Assign Closest Rider ({availableRiders[0].name})</span>
                    </span>
                    <span className="bg-emerald-950/60 text-emerald-200 px-2 py-0.5 rounded-md font-mono text-[11px]">
                      {availableRiders[0].distanceKm} km away
                    </span>
                  </button>
                )}

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {availableRiders.map((r, idx) => (
                    <div
                      key={r.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
                        idx === 0
                          ? 'bg-emerald-950/20 border-emerald-500/50'
                          : 'bg-slate-800 border-slate-700 hover:border-cyan-500'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-9 h-9 rounded-full overflow-hidden flex items-center justify-center font-bold shrink-0 border ${
                          idx === 0 ? 'border-emerald-400 bg-emerald-500/20' : 'border-slate-600 bg-slate-700'
                        }`}>
                          {r.photoUrl ? (
                            <img src={r.photoUrl} alt={r.name} className="w-full h-full object-cover" />
                          ) : (
                            <Bike className={`w-4 h-4 ${idx === 0 ? 'text-emerald-400' : 'text-cyan-400'}`} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-white truncate">{r.name}</p>
                            {idx === 0 && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                Nearest
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5">
                              <ShieldCheck className="w-2.5 h-2.5" /> Aadhaar Verified
                            </span>
                            <span className="text-[10px] font-mono text-cyan-400 font-bold">
                              📍 {r.distanceKm} km
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">
                            {r.vehicleType} {r.vehicleNumber ? `• ${r.vehicleNumber}` : ''} • {r.phone}
                          </p>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAssignRider(r)}
                        className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow shrink-0 ${
                          idx === 0
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                            : 'bg-cyan-600 hover:bg-cyan-500 text-white'
                        }`}
                      >
                        Assign
                      </button>
                    </div>
                  ))}
                </div>
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
