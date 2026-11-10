import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChefHat,
  Clock,
  CheckCircle,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Bell,
  Printer,
  Flame,
  AlertTriangle,
  Sparkles,
  UtensilsCrossed,
  LogOut,
  ShoppingBag,
  Bike,
  Package,
  CheckCircle2,
  XCircle,
  MapPin,
  Phone,
  User,
  Check
} from 'lucide-react';
import {
  subscribeToKitchenKOTs,
  subscribeToActiveOrders,
  createOrderWithKOT,
  updateKOTStatus,
  markKOTPrinted
} from '../services/firestoreService';
import {
  subscribeToOnlineOrders,
  updateOnlineOrderStatus
} from '../services/onlineOrderService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { kitchenAudio, dispatchThermalPrint } from '../services/thermalPrintService';
import InvoiceModal from '../components/invoice/InvoiceModal';

export default function KitchenPage() {
  const [kots, setKots] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [onlineOrders, setOnlineOrders] = useState([]);
  const [onlineTab, setOnlineTab] = useState('ALL'); // 'ALL' | 'PLACED' | 'PREPARING' | 'READY'
  const [loading, setLoading] = useState(true);
  const [isSendingDemo, setIsSendingDemo] = useState(false);
  const [viewMode, setViewMode] = useState('WHOLE_TABLE'); // 'WHOLE_TABLE' | 'KANBAN' | 'ONLINE_ORDERS'
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [selectedKOTForPrint, setSelectedKOTForPrint] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [listenError, setListenError] = useState('');

  const { activeRestaurantId, user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const targetRestId = activeRestaurantId || user?.restaurantId || 'spice-haven';

  // Restrict waiters and cashiers from kitchen display station
  useEffect(() => {
    if (user && (user.role === 'waiter' || user.role === 'cashier')) {
      toast.error('Access restricted for your role.');
      navigate(user.role === 'cashier' ? '/cashier' : '/pos', { replace: true });
    }
  }, [user, navigate, toast]);

  // Track known KOT IDs to play audio only on genuinely NEW incoming KOTs
  const knownKotIdsRef = useRef(new Set());
  const isFirstLoadRef = useRef(true);

  useEffect(() => {
    setLoading(true);
    setListenError('');
    const unsubscribeKots = subscribeToKitchenKOTs(targetRestId, (liveKots) => {
      setListenError('');
      // Check for new KOTs
      if (!isFirstLoadRef.current) {
        const hasBrandNew = liveKots.some(
          k => !knownKotIdsRef.current.has(k.id) && k.status === 'NEW'
        );
        if (hasBrandNew && !isAudioMuted) {
          kitchenAudio.playOrderBell();
          toast.info('🔔 New Kitchen Order Ticket received!');
        }
      } else {
        isFirstLoadRef.current = false;
      }

      // Update known set
      knownKotIdsRef.current = new Set(liveKots.map(k => k.id));
      setKots(liveKots || []);
      setLoading(false);
    }, (err) => {
      setListenError(err?.code === 'permission-denied'
        ? 'Permission denied while loading kitchen tickets. Check this account\'s role, restaurant and email verification.'
        : (err?.message || 'Could not load kitchen tickets.'));
      setLoading(false);
    });

    const unsubscribeOrders = subscribeToActiveOrders(targetRestId, (liveOrders) => {
      setActiveOrders(liveOrders || []);
    });

    const unsubscribeOnline = subscribeToOnlineOrders(targetRestId, (liveOnline) => {
      const placedOrders = (liveOnline || []).filter(o => o.status === 'PLACED');
      if (!isFirstLoadRef.current && placedOrders.length > 0 && !isAudioMuted) {
        kitchenAudio.playOrderBell();
        toast.info(`🔔 New Online Consumer Order #${placedOrders[0].id.slice(-5).toUpperCase()} received!`);
      }
      setOnlineOrders(liveOnline || []);
    });

    return () => {
      unsubscribeKots();
      unsubscribeOrders();
      unsubscribeOnline();
    };
  }, [targetRestId, isAudioMuted, toast]);

  const toggleMute = () => {
    const nextState = !isAudioMuted;
    setIsAudioMuted(nextState);
    kitchenAudio.setMuted(nextState);
    toast.info(nextState ? 'Kitchen audio alerts muted.' : 'Kitchen audio alerts enabled.');
  };

  const handleTestSound = () => {
    kitchenAudio.playOrderBell();
    toast.info('Sound test played.');
  };

  const handleStatusChange = async (kot, newStatus) => {
    try {
      await updateKOTStatus(targetRestId, kot.id, newStatus, kot.orderId);
      toast.success(`KOT #${kot.kotNumber} moved to ${newStatus}`);
    } catch (err) {
      console.error('KOT status update failed:', err);
      toast.error(err?.code === 'permission-denied'
        ? 'Permission denied: this account cannot update kitchen tickets.'
        : 'Failed to update KOT status.');
    }
  };

  const handleAcceptOnlineOrder = async (order) => {
    try {
      await updateOnlineOrderStatus(targetRestId, order.id, 'PREPARING');
      toast.success(`Online Order #${order.id.slice(-5).toUpperCase()} accepted! Preparation started.`);
    } catch (err) {
      console.error('Accept online order failed:', err);
      toast.error('Failed to accept online order.');
    }
  };

  const handleRejectOnlineOrder = async (order) => {
    const reason = window.prompt('Reason for rejecting this order (optional):', 'Kitchen at full capacity');
    if (reason === null) return;
    try {
      await updateOnlineOrderStatus(targetRestId, order.id, 'CANCELLED', { rejectionReason: reason });
      toast.info(`Online Order #${order.id.slice(-5).toUpperCase()} rejected.`);
    } catch (err) {
      console.error('Reject online order failed:', err);
      toast.error('Failed to reject online order.');
    }
  };

  const handleMarkOnlineReady = async (order) => {
    try {
      await updateOnlineOrderStatus(targetRestId, order.id, 'READY');
      toast.success(`Online Order #${order.id.slice(-5).toUpperCase()} marked ready for pickup/delivery!`);
    } catch (err) {
      console.error('Mark online ready failed:', err);
      toast.error('Failed to update status.');
    }
  };

  const handlePrintKOT = (kot) => {
    setSelectedKOTForPrint(kot);
    setIsPrintModalOpen(true);
  };

  // Dispatch a demo order for quick testing
  const handleSendSampleOrder = async () => {
    try {
      setIsSendingDemo(true);
      const demoItems = [
        { name: 'Butter Chicken Special', price: 340, quantity: 2, notes: 'Medium Spicy, Extra Butter' },
        { name: 'Butter Garlic Naan', price: 60, quantity: 4, notes: 'Crispy' },
        { name: 'Paneer Butter Masala', price: 250, quantity: 1, notes: 'Less Oil' }
      ];

      const demoTableNum = String(Math.floor(1 + Math.random() * 8));
      await createOrderWithKOT(
        targetRestId,
        {
          orderType: 'DINE_IN',
          tableNumber: demoTableNum,
          subtotal: 990,
          taxRate: 5,
          taxAmount: 49.5,
          totalAmount: 1039.5,
          orderNotes: 'Demo Kitchen Order'
        },
        demoItems,
        { name: user?.name || 'Chef Server', role: 'kitchen', uid: user?.uid }
      );

      toast.success(`Demo Order sent to Kitchen for Table ${demoTableNum}!`);
    } catch (err) {
      console.error('Demo order error:', err);
      toast.error('Failed to send demo order.');
    } finally {
      setIsSendingDemo(false);
    }
  };

  // Group KOTs into columns for Kanban
  const newKots = kots.filter(k => k.status === 'NEW');
  const preparingKots = kots.filter(k => ['CONFIRMED', 'PREPARING'].includes(k.status));
  const readyKots = kots.filter(k => k.status === 'READY');

  // Group KOTs by Table for Whole Table Master View
  const tableGroupedOrders = useMemo(() => {
    const tableMap = {};

    kots.forEach(kot => {
      const key = kot.tableNumber ? `Table ${kot.tableNumber}` : (kot.orderType || 'Takeaway');
      if (!tableMap[key]) {
        tableMap[key] = {
          tableKey: key,
          tableNumber: kot.tableNumber || null,
          orderType: kot.orderType || 'DINE_IN',
          orderNumber: kot.orderNumber,
          waiterName: kot.waiterName || 'Staff',
          oldestCreatedAt: kot.createdAt,
          kots: [],
          allItems: []
        };
      }

      tableMap[key].kots.push(kot);

      (kot.items || []).forEach(item => {
        tableMap[key].allItems.push({
          ...item,
          kotNumber: kot.kotNumber,
          kotStatus: kot.status,
          kotId: kot.id
        });
      });
    });

    return Object.values(tableMap);
  }, [kots]);

  const getTimeElapsed = (createdAt) => {
    const time = typeof createdAt === 'string' ? new Date(createdAt).getTime() : Date.now();
    const diffMs = Date.now() - time;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just now';
    if (mins === 1) return '1m ago';
    return `${mins}m ago`;
  };

  const isKOTDelayed = (createdAt) => {
    const time = typeof createdAt === 'string' ? new Date(createdAt).getTime() : Date.now();
    const diffMs = Date.now() - time;
    return diffMs > 15 * 60 * 1000; // > 15 minutes
  };

  const activeOnlineOrders = useMemo(() => {
    return onlineOrders.filter(o => ['PLACED', 'CONFIRMED', 'PREPARING', 'READY', 'READY_FOR_PICKUP'].includes(o.status));
  }, [onlineOrders]);

  const newOnlineOrders = useMemo(() => {
    return onlineOrders.filter(o => o.status === 'PLACED');
  }, [onlineOrders]);

  return (
    <div className="space-y-3 h-[calc(100vh-4.75rem)] flex flex-col select-none transition-colors duration-200">
      {/* 1. TOP HEADER & AUDIO CONTROLS */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 pos-surface-glass rounded-2xl shrink-0 border border-pos-border">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-orange-600 to-amber-500 text-white shadow-pos-hot shrink-0">
            <ChefHat className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2 font-display">
              <span>Kitchen Display Station (KDS)</span>
              <span className="text-[11px] bg-orange-100 dark:bg-orange-950/80 border border-orange-400 dark:border-orange-600 text-orange-800 dark:text-orange-300 font-extrabold px-2.5 py-0.5 rounded-full font-mono shadow-sm">
                {kots.length} Active Tickets
              </span>
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Real-time incoming orders, preparation pipeline & audio chimes
            </p>
          </div>
        </div>

        {/* View Mode & Audio Toolbar */}
        <div className="flex items-center space-x-2 self-end sm:self-auto text-xs">
          {/* View Mode Toggle */}
          <div className="flex items-center space-x-1 bg-pos-dark p-1 rounded-xl border border-pos-border">
            <button
              type="button"
              onClick={() => setViewMode('WHOLE_TABLE')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all pos-btn-touch ${
                viewMode === 'WHOLE_TABLE'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-pos-hot'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              🍱 Whole Table ({tableGroupedOrders.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('KANBAN')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all pos-btn-touch ${
                viewMode === 'KANBAN'
                  ? 'bg-gradient-to-r from-orange-600 to-amber-600 text-white shadow-pos-hot'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              📋 KOT Pipeline
            </button>
            <button
              type="button"
              onClick={() => setViewMode('ONLINE_ORDERS')}
              className={`px-3 py-1 rounded-lg font-bold text-xs transition-all pos-btn-touch flex items-center space-x-1.5 ${
                viewMode === 'ONLINE_ORDERS'
                  ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-pos-purple'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Online Orders ({activeOnlineOrders.length})</span>
              {newOnlineOrders.length > 0 && (
                <span className="bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full animate-pulse ml-1">
                  {newOnlineOrders.length} NEW
                </span>
              )}
            </button>
          </div>

          <button
            type="button"
            onClick={toggleMute}
            className={`px-3 py-1.5 rounded-xl border font-bold flex items-center space-x-1.5 transition-all pos-btn-touch ${
              isAudioMuted
                ? 'bg-pos-dark border-pos-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                : 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-300 dark:border-emerald-700/80 text-emerald-800 dark:text-emerald-300 shadow-pos-glow'
            }`}
          >
            {isAudioMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            <span>{isAudioMuted ? 'Muted' : 'Sound ON'}</span>
          </button>

          <button
            type="button"
            onClick={handleTestSound}
            className="px-2.5 py-1.5 rounded-xl bg-pos-dark hover:bg-pos-card text-slate-700 dark:text-slate-200 border border-pos-border font-bold transition-colors flex items-center space-x-1 pos-btn-touch"
            title="Test kitchen chime"
          >
            <Bell className="w-3.5 h-3.5 text-amber-500 animate-pulse-subtle" />
            <span>Test Chime</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              try {
                await logout();
                toast.success('Kitchen staff logged out successfully.');
                navigate('/login');
              } catch (e) {
                console.error('Logout error:', e);
              }
            }}
            className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-bold flex items-center space-x-1.5 transition-all pos-btn-touch"
            title="Log Out Staff"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* INCOMING ONLINE CONSUMER ORDERS BANNER */}
      {newOnlineOrders.length > 0 && viewMode !== 'ONLINE_ORDERS' && (
        <div className="p-3 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-rose-500/20 border-2 border-amber-500/60 shadow-pos-amber flex items-center justify-between gap-3 animate-pulse-subtle shrink-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold shadow shrink-0">
              <Bell className="w-4 h-4 animate-bounce" />
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-xs text-slate-900 dark:text-white flex items-center space-x-2 truncate">
                <span>🔔 {newOnlineOrders.length} New Online Order{newOnlineOrders.length > 1 ? 's' : ''} from Consumers Awaiting Kitchen Acceptance!</span>
              </p>
              <p className="text-[11px] text-amber-800 dark:text-amber-300 truncate">
                Customer delivery / takeaway requests. Accept or reject now to notify the customer.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setViewMode('ONLINE_ORDERS')}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow flex items-center space-x-1 shrink-0 pos-btn-touch"
          >
            <span>Review & Accept →</span>
          </button>
        </div>
      )}

      {listenError && (
        <div className="p-3 rounded-2xl border border-rose-300 dark:border-rose-700 bg-rose-50 dark:bg-rose-950/70 text-rose-800 dark:text-rose-200 text-xs font-semibold shrink-0">
          ⚠️ Live kitchen connection problem: {listenError}
        </div>
      )}

      {/* VIEW 1: WHOLE TABLE MASTER VIEW */}
      {viewMode === 'WHOLE_TABLE' && (
        <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin">
          {tableGroupedOrders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-80 text-slate-400 text-xs pos-surface-glass rounded-3xl p-8 text-center max-w-lg mx-auto mt-6 shadow-xl border border-pos-border">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-orange-500/20 to-amber-500/20 border border-orange-500/30 flex items-center justify-center text-orange-600 dark:text-orange-400 mb-4 shadow-pos-hot">
                <ChefHat className="w-9 h-9" />
              </div>
              <h3 className="font-extrabold text-slate-900 dark:text-slate-100 text-base font-display">Kitchen Station is Ready</h3>
              <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 leading-relaxed">
                Waiting for tickets from table orders and waiters. When orders are placed, whole table dishes & tickets will appear here live with audio alerts.
              </p>
              <div className="mt-5 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={handleSendSampleOrder}
                  disabled={isSendingDemo}
                  className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-extrabold text-xs shadow-pos-hot flex items-center space-x-2 transition-all disabled:opacity-50 pos-btn-touch"
                >
                  <Flame className="w-4 h-4 fill-current text-amber-200" />
                  <span>{isSendingDemo ? 'Dispatching Demo Order...' : '🍳 Send Test Kitchen Order'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
              {tableGroupedOrders.map((tblGroup) => {
                const hasDelayed = tblGroup.kots.some(k => isKOTDelayed(k.createdAt));
                const allReady = tblGroup.kots.every(k => k.status === 'READY');
                const hasNew = tblGroup.kots.some(k => k.status === 'NEW');

                return (
                  <div
                    key={tblGroup.tableKey}
                    className={`p-4 rounded-3xl border pos-card-glass shadow-xl space-y-3.5 transition-all ${
                      hasDelayed
                        ? 'border-rose-400 dark:border-rose-600/80 ring-2 ring-rose-500/40 bg-rose-50 dark:bg-rose-950/20'
                        : allReady
                        ? 'border-emerald-400 dark:border-emerald-600/80 bg-emerald-50 dark:bg-emerald-950/20 shadow-pos-glow'
                        : hasNew
                        ? 'border-amber-400 dark:border-amber-600/80 ring-1 ring-amber-500/40'
                        : 'border-pos-border'
                    }`}
                  >
                    {/* Table Header */}
                    <div className="flex items-start justify-between pb-3 border-b border-pos-border">
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-sm shadow-md font-display ${
                          tblGroup.tableNumber ? 'bg-gradient-to-tr from-orange-600 to-amber-500 text-white' : 'bg-slate-200 dark:bg-slate-800 text-orange-600 dark:text-orange-400'
                        }`}>
                          {tblGroup.tableNumber ? `T${tblGroup.tableNumber}` : 'PKG'}
                        </div>
                        <div>
                          <h2 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center space-x-2 font-display">
                            <span>{tblGroup.tableKey}</span>
                            <span className="text-[10px] bg-pos-dark text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded-lg font-mono border border-pos-border">
                              {tblGroup.orderType}
                            </span>
                          </h2>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Server: <strong className="text-slate-800 dark:text-slate-200">{tblGroup.waiterName}</strong> • #{tblGroup.orderNumber}
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300 flex items-center justify-end space-x-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span>{getTimeElapsed(tblGroup.oldestCreatedAt)}</span>
                        </span>
                        {hasDelayed && (
                          <span className="text-[9px] font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950/90 px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-700 mt-1 inline-block animate-pulse">
                            ⚠️ DELAYED ({'>'}15m)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* All Items Ordered for this Table */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400 font-mono">
                        Dishes to Cook ({tblGroup.allItems.reduce((s, i) => s + (i.quantity || 1), 0)} total):
                      </h4>
                      <div className="space-y-1.5 divide-y divide-pos-border/60 bg-pos-dark p-3 rounded-2xl border border-pos-border shadow-inner">
                        {tblGroup.allItems.map((dish, dIdx) => (
                          <div key={dIdx} className="pt-2 first:pt-0 flex items-start justify-between text-xs">
                            <div className="flex items-start space-x-2.5">
                              <span className={`px-2 py-0.5 rounded-lg text-xs font-black shrink-0 font-num ${
                                dish.kotStatus === 'READY'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                  : dish.kotStatus === 'PREPARING'
                                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              }`}>
                                {dish.quantity}x
                              </span>
                              <div>
                                <span className="font-bold text-slate-900 dark:text-slate-100">{dish.name}</span>
                                {dish.notes && (
                                  <p className="text-[10px] text-amber-600 dark:text-amber-300 font-bold italic mt-0.5">
                                    👉 {dish.notes}
                                  </p>
                                )}
                              </div>
                            </div>

                            <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md shrink-0 font-mono ${
                              dish.kotStatus === 'READY'
                                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                : dish.kotStatus === 'PREPARING'
                                ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                                : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                            }`}>
                              {dish.kotStatus}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Table KOT Actions for Cookers */}
                    <div className="space-y-2 pt-2 border-t border-pos-border">
                      <h4 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 font-mono">
                        Kitchen Tickets ({tblGroup.kots.length}):
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tblGroup.kots.map(kot => (
                          <div key={kot.id} className="p-2.5 bg-pos-dark border border-pos-border rounded-xl space-y-2 text-xs shadow-inner">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px] text-slate-500 dark:text-slate-400 font-bold">{kot.kotNumber}</span>
                              <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded uppercase font-mono ${
                                kot.status === 'READY'
                                  ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300'
                                  : kot.status === 'PREPARING'
                                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300'
                                  : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
                              }`}>
                                {kot.status}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => handlePrintKOT(kot)}
                                className="p-1.5 rounded-lg bg-pos-surface hover:bg-pos-card text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border pos-btn-touch shadow-sm"
                                title="Print KOT"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                              {kot.status === 'NEW' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(kot, 'PREPARING')}
                                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-[10px] flex items-center justify-center space-x-1 shadow-sm pos-btn-touch"
                                >
                                  <Play className="w-2.5 h-2.5 fill-current" />
                                  <span>Start Cooking</span>
                                </button>
                              )}
                              {['NEW', 'PREPARING', 'CONFIRMED'].includes(kot.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(kot, 'READY')}
                                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-[10px] flex items-center justify-center space-x-1 shadow-pos-glow pos-btn-touch"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  <span>Mark Ready</span>
                                </button>
                              )}
                              {kot.status === 'READY' && (
                                <button
                                  type="button"
                                  onClick={() => handleStatusChange(kot, 'SERVED')}
                                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-bold border border-pos-border pos-btn-touch"
                                >
                                  Dismiss / Served
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: 3-STAGE KANBAN BOARD */}
      {viewMode === 'KANBAN' && (
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-3 overflow-hidden min-h-0">
        {/* COLUMN 1: NEW / INCOMING TICKETS */}
        <div className="pos-surface-glass rounded-3xl flex flex-col overflow-hidden shadow-xl border border-pos-border">
          <div className="p-3 bg-amber-100 dark:bg-amber-950/40 border-b border-amber-300 dark:border-amber-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-amber-800 dark:text-amber-200 font-display">
                1. New Incoming ({newKots.length})
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {newKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
                <ChefHat className="w-8 h-8 mb-2 opacity-50" />
                No new incoming tickets
              </div>
            ) : (
              newKots.map((kot) => (
                <div
                  key={kot.id}
                  className={`p-3 rounded-2xl border shadow-md space-y-2.5 transition-all ${
                    isKOTDelayed(kot.createdAt)
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-600/80 animate-pulse'
                      : 'bg-pos-card border-amber-400 dark:border-amber-600/60'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-pos-border">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-black text-amber-600 dark:text-amber-400 font-display">
                          {kot.tableNumber ? `Table ${kot.tableNumber}` : kot.orderType}
                        </span>
                        <span className="text-[10px] bg-pos-dark text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono border border-pos-border">
                          {kot.kotNumber}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Server: <strong className="text-slate-800 dark:text-slate-200">{kot.waiterName || 'Staff'}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-end space-x-1 font-mono">
                        <Clock className="w-3 h-3 text-amber-500" />
                        <span>{getTimeElapsed(kot.createdAt)}</span>
                      </span>
                      {isKOTDelayed(kot.createdAt) && (
                        <span className="text-[9px] font-black text-rose-700 dark:text-rose-300 bg-rose-100 dark:bg-rose-950 px-1.5 py-0.2 rounded-full border border-rose-300 dark:border-rose-700 mt-0.5 inline-block">
                          ⚠️ DELAYED
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Order Notes if any */}
                  {kot.orderNotes && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-800/80 rounded-xl text-[10px] text-amber-800 dark:text-amber-200 font-bold">
                      Note: {kot.orderNotes}
                    </div>
                  )}

                  {/* Items List */}
                  <div className="space-y-1.5 divide-y divide-pos-border/40">
                    {(kot.items || []).map((item, idx) => (
                      <div key={idx} className="pt-1.5 first:pt-0">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-700 dark:text-amber-300 font-black text-xs flex items-center justify-center shrink-0 font-num">
                            {item.quantity}x
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.name}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-300 font-bold italic pl-8 mt-0.5">
                            👉 {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions: Start Preparing & Print */}
                  <div className="pt-2 border-t border-pos-border flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintKOT(kot)}
                      className="p-2 rounded-xl bg-pos-dark hover:bg-pos-card text-slate-600 dark:text-slate-300 border border-pos-border text-xs font-bold flex items-center space-x-1 pos-btn-touch shadow-sm"
                      title="Print KOT Thermal Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(kot, 'PREPARING')}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-extrabold text-xs shadow-sm flex items-center justify-center space-x-1.5 transition-all pos-btn-touch"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Accept & Start Cooking</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 2: PREPARING (IN COOKING) */}
        <div className="pos-surface-glass rounded-3xl flex flex-col overflow-hidden shadow-xl border border-pos-border">
          <div className="p-3 bg-blue-100 dark:bg-blue-950/40 border-b border-blue-300 dark:border-blue-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <Flame className="w-4 h-4 text-blue-500 animate-pulse" />
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-blue-800 dark:text-blue-200 font-display">
                2. In Cooking / Preparing ({preparingKots.length})
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {preparingKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
                <UtensilsCrossed className="w-8 h-8 mb-2 opacity-50" />
                No tickets currently in preparation
              </div>
            ) : (
              preparingKots.map((kot) => (
                <div
                  key={kot.id}
                  className={`p-3 rounded-2xl border shadow-md space-y-2.5 transition-all ${
                    isKOTDelayed(kot.createdAt)
                      ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-300 dark:border-rose-600/80'
                      : 'bg-pos-card border-blue-300 dark:border-blue-800/60'
                  }`}
                >
                  {/* Ticket Header */}
                  <div className="flex items-center justify-between pb-2 border-b border-pos-border">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-base font-black text-blue-600 dark:text-blue-300 font-display">
                          {kot.tableNumber ? `Table ${kot.tableNumber}` : kot.orderType}
                        </span>
                        <span className="text-[10px] bg-pos-dark text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-mono border border-pos-border">
                          {kot.kotNumber}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Server: <strong className="text-slate-800 dark:text-slate-200">{kot.waiterName || 'Staff'}</strong>
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center justify-end space-x-1 font-mono">
                        <Clock className="w-3 h-3 text-blue-500" />
                        <span>{getTimeElapsed(kot.createdAt)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Items List */}
                  <div className="space-y-1.5 divide-y divide-pos-border/40">
                    {(kot.items || []).map((item, idx) => (
                      <div key={idx} className="pt-1.5 first:pt-0">
                        <div className="flex items-center space-x-2">
                          <span className="w-6 h-6 rounded-lg bg-blue-500/15 border border-blue-500/40 text-blue-700 dark:text-blue-300 font-black text-xs flex items-center justify-center shrink-0 font-num">
                            {item.quantity}x
                          </span>
                          <span className="text-xs font-bold text-slate-900 dark:text-white">
                            {item.name}
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-orange-600 dark:text-orange-400 font-bold italic pl-8 mt-0.5">
                            👉 {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Actions: Mark Ready & Print */}
                  <div className="pt-2 border-t border-pos-border flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => handlePrintKOT(kot)}
                      className="p-2 rounded-xl bg-pos-dark hover:bg-pos-card text-slate-600 dark:text-slate-300 border border-pos-border text-xs font-bold flex items-center space-x-1 pos-btn-touch shadow-sm"
                      title="Re-print KOT Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusChange(kot, 'READY')}
                      className="flex-1 py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-xs shadow-pos-glow flex items-center justify-center space-x-1.5 transition-all pos-btn-touch"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Mark Dishes Ready</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* COLUMN 3: READY / PLATED */}
        <div className="pos-surface-glass rounded-3xl flex flex-col overflow-hidden shadow-xl border border-pos-border">
          <div className="p-3 bg-emerald-100 dark:bg-emerald-950/40 border-b border-emerald-300 dark:border-emerald-900/60 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <h3 className="font-extrabold text-xs uppercase tracking-wider text-emerald-800 dark:text-emerald-200 font-display">
                3. Ready for Pickup ({readyKots.length})
              </h3>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin">
            {readyKots.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-400 text-xs">
                <CheckCircle className="w-8 h-8 mb-2 opacity-50" />
                No completed dishes waiting for pickup
              </div>
            ) : (
              readyKots.map((kot) => (
                <div
                  key={kot.id}
                  className="p-3 rounded-2xl border bg-pos-card border-emerald-300 dark:border-emerald-800/80 shadow-pos-glow space-y-2.5"
                >
                  <div className="flex items-center justify-between pb-2 border-b border-pos-border">
                    <div>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400 font-display">
                        {kot.tableNumber ? `Table ${kot.tableNumber}` : kot.orderType}
                      </span>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Server: <strong className="text-slate-800 dark:text-white">{kot.waiterName || 'Staff'}</strong>
                      </p>
                    </div>
                    <span className="text-[10px] font-extrabold text-emerald-800 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-700 font-mono">
                      READY TO SERVE
                    </span>
                  </div>

                  <div className="space-y-1 text-xs">
                    {(kot.items || []).map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                        <span>{item.quantity}x {item.name}</span>
                      </div>
                    ))}
                  </div>

                  <div className="pt-2 border-t border-pos-border flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleStatusChange(kot, 'SERVED')}
                      className="py-1.5 px-4 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs border border-pos-border transition-colors pos-btn-touch shadow-sm"
                    >
                      Dismiss / Served
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      )}

      {/* VIEW 3: ONLINE CONSUMER ORDERS (ACCEPT / REJECT / MARK READY) */}
      {viewMode === 'ONLINE_ORDERS' && (
        <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 scrollbar-thin">
          {/* Sub-header Filter Tabs */}
          <div className="flex items-center justify-between gap-3 p-3 pos-surface-glass rounded-2xl flex-wrap">
            <div className="flex items-center space-x-1.5 flex-wrap gap-1">
              {[
                { id: 'ALL', label: `All Active (${activeOnlineOrders.length})` },
                { id: 'PLACED', label: `⚡ New Requests (${newOnlineOrders.length})`, alert: newOnlineOrders.length > 0 },
                { id: 'PREPARING', label: `🍳 Cooking (${onlineOrders.filter(o => ['CONFIRMED', 'PREPARING'].includes(o.status)).length})` },
                { id: 'READY', label: `🛵 Ready for Rider (${onlineOrders.filter(o => ['READY', 'READY_FOR_PICKUP'].includes(o.status)).length})` },
              ].map(t => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOnlineTab(t.id)}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all pos-btn-touch ${
                    onlineTab === t.id
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md'
                      : t.alert
                      ? 'bg-amber-500/15 border border-amber-500/40 text-amber-500 animate-pulse'
                      : 'bg-pos-dark border border-pos-border text-slate-400 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
              Consumer online orders update in real-time
            </span>
          </div>

          {/* Orders Grid */}
          {(() => {
            const filteredOnline = activeOnlineOrders.filter(o => {
              if (onlineTab === 'PLACED') return o.status === 'PLACED';
              if (onlineTab === 'PREPARING') return ['CONFIRMED', 'PREPARING'].includes(o.status);
              if (onlineTab === 'READY') return ['READY', 'READY_FOR_PICKUP'].includes(o.status);
              return true;
            });

            if (filteredOnline.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-72 text-slate-400 text-xs pos-surface-glass rounded-3xl p-8 text-center max-w-md mx-auto mt-6 border border-pos-border shadow-xl">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center mb-3">
                    <ShoppingBag className="w-7 h-7" />
                  </div>
                  <h4 className="font-extrabold text-sm text-slate-900 dark:text-white">No Online Orders in this Tab</h4>
                  <p className="text-slate-500 mt-1">
                    When customers place orders on Abar Khabo, they will appear here with sound chimes for instant kitchen acceptance.
                  </p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredOnline.map((order) => {
                  const isNew = order.status === 'PLACED';
                  const isPreparing = ['CONFIRMED', 'PREPARING'].includes(order.status);
                  const isReady = ['READY', 'READY_FOR_PICKUP'].includes(order.status);
                  const isDelivery = order.orderType === 'DELIVERY';

                  return (
                    <div
                      key={order.id}
                      className={`p-4 rounded-3xl border pos-card-glass shadow-xl space-y-3 transition-all ${
                        isNew
                          ? 'border-amber-400 dark:border-amber-500 shadow-pos-amber ring-2 ring-amber-400/50'
                          : isReady
                          ? 'border-emerald-400 dark:border-emerald-500/80'
                          : 'border-pos-border'
                      }`}
                    >
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-pos-border">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-display font-black text-base text-slate-900 dark:text-white">
                              #{order.id.slice(-5).toUpperCase()}
                            </span>
                            <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                              isDelivery
                                ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
                                : 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border border-teal-500/30'
                            }`}>
                              {isDelivery ? <Bike className="w-2.5 h-2.5" /> : <Package className="w-2.5 h-2.5" />}
                              <span>{isDelivery ? 'Delivery' : 'Takeaway'}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                            Customer: <strong className="text-slate-800 dark:text-slate-200">{order.customerName || 'Consumer'}</strong>
                            {order.customerPhone ? ` • ${order.customerPhone}` : ''}
                          </p>
                        </div>

                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 ${
                          isNew
                            ? 'bg-amber-500 text-slate-950 animate-bounce'
                            : isPreparing
                            ? 'bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-500/40'
                            : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40'
                        }`}>
                          {isNew ? '⚡ Action Needed' : isPreparing ? '🍳 Cooking' : '✓ Ready'}
                        </span>
                      </div>

                      {/* Delivery Address if delivery */}
                      {isDelivery && order.deliveryAddress && (
                        <div className="p-2 rounded-xl bg-pos-dark border border-pos-border/60 text-[11px] text-slate-400 flex items-start space-x-1.5">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400 shrink-0 mt-0.5" />
                          <span className="truncate">{order.deliveryAddress}</span>
                        </div>
                      )}

                      {/* Items List */}
                      <div className="space-y-1.5 bg-pos-dark p-3 rounded-2xl border border-pos-border text-xs max-h-48 overflow-y-auto scrollbar-thin">
                        {(order.items || []).map((it, idx) => (
                          <div key={idx} className="flex items-start justify-between gap-2 text-slate-700 dark:text-slate-200">
                            <span className="font-medium">
                              <strong className="text-amber-500 font-num">{it.quantity}x</strong> {it.name}
                              {it.notes ? <span className="block text-[10px] text-slate-400 italic">"{it.notes}"</span> : null}
                            </span>
                            {it.price && (
                              <span className="font-num text-slate-500 shrink-0">
                                ₹{(it.price * (it.quantity || 1)).toFixed(0)}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Total & Action Buttons */}
                      <div className="pt-2 border-t border-pos-border flex flex-col gap-2">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Total Amount:</span>
                          <span className="font-num font-black text-sm text-slate-900 dark:text-white">
                            ₹{order.totalAmount || order.grandTotal || 0}
                          </span>
                        </div>

                        {/* Actions */}
                        {isNew && (
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => handleRejectOnlineOrder(order)}
                              className="py-2 px-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 font-black text-xs transition-all pos-btn-touch flex items-center justify-center space-x-1"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>Reject</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAcceptOnlineOrder(order)}
                              className="py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-pos-glow transition-all pos-btn-touch flex items-center justify-center space-x-1"
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>Accept & Cook</span>
                            </button>
                          </div>
                        )}

                        {isPreparing && (
                          <button
                            type="button"
                            onClick={() => handleMarkOnlineReady(order)}
                            className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-pos-glow transition-all pos-btn-touch flex items-center justify-center space-x-1.5"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>Mark Food Ready & Packed</span>
                          </button>
                        )}

                        {isReady && (
                          <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-center font-bold text-xs flex items-center justify-center space-x-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{isDelivery ? 'Ready for Rider Pickup' : 'Ready for Customer Pickup'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
      <InvoiceModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        kot={selectedKOTForPrint}
      />
    </div>
  );
}
