import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { getStockQty, isItemSoldOut, isLowStock } from '../utils/stock';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  CreditCard,
  RotateCcw,
  ShoppingBag,
  AlertCircle,
  Clock,
  Printer,
  FileText,
  Utensils,
  CheckCircle2,
  Wifi,
  WifiOff,
  Flame,
  User,
  Coffee,
  Sparkles,
  Percent,
  X,
  Layers,
  ChevronRight,
  ShieldCheck,
  Smartphone
} from 'lucide-react';
import {
  getCategories,
  getMenuItems,
  subscribeToTables,
  subscribeToActiveOrders,
  createOrderWithKOT,
  addRunningKOTToOrder,
  requestBillForTable,
  settleAndReleaseTableAtomic
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import { validateIndianPhone } from '../utils/phoneValidation';
import InvoiceModal from '../components/invoice/InvoiceModal';

export default function POSPage() {
  const { user, activeRestaurantId } = useAuth();
  const { restaurant, currencySymbol, taxName } = useRestaurant();
  const toast = useToast();

  // Network connection state
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Menu data
  const [categories, setCategories] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegFilter, setVegFilter] = useState('ALL');
  const [tableFilter, setTableFilter] = useState('ALL'); // 'ALL' | 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED'

  // Order Mode: 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY'
  const [orderType, setOrderType] = useState('DINE_IN');
  const [selectedTableId, setSelectedTableId] = useState('');

  // Cart / New items state
  const [cart, setCart] = useState([]);
  const [discountType, setDiscountType] = useState(null); // 'PERCENTAGE' | 'FIXED'
  const [discountValue, setDiscountValue] = useState(0);
  const [orderNotes, setOrderNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // Modals & Printing
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [previewInvoice, setPreviewInvoice] = useState(null);
  const [previewKOT, setPreviewKOT] = useState(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  // Note editing modal
  const [editingNoteItem, setEditingNoteItem] = useState(null);
  const [noteInput, setNoteInput] = useState('');

  // 1. Initial Menu Fetch
  useEffect(() => {
    let isMounted = true;
    async function loadMenu() {
      try {
        setLoading(true);
        const [cats, items] = await Promise.all([
          getCategories(activeRestaurantId),
          getMenuItems(activeRestaurantId)
        ]);
        if (isMounted) {
          setCategories(cats || []);
          setMenuItems(items || []);
        }
      } catch (err) {
        toast.error('Failed to load menu data.');
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadMenu();
    return () => { isMounted = false; };
  }, [activeRestaurantId, toast]);

  // 2. Real-Time Table & Active Order Subscriptions
  useEffect(() => {
    const unsubTables = subscribeToTables(activeRestaurantId, (liveTables) => {
      setTables(liveTables || []);
      if (!selectedTableId && liveTables && liveTables.length > 0) {
        const firstAvail = liveTables.find(t => t.status === 'AVAILABLE') || liveTables[0];
        setSelectedTableId(firstAvail.id);
      }
    });

    const unsubOrders = subscribeToActiveOrders(activeRestaurantId, (liveOrders) => {
      setActiveOrders(liveOrders || []);
    }, (err) => {
      toast.error(err?.code === 'permission-denied'
        ? 'Permission denied while loading live orders.'
        : `Could not load live orders: ${err?.message || 'unknown error'}`);
    });

    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [activeRestaurantId, selectedTableId]);

  // Find currently selected table and its live active order
  const currentTable = useMemo(() => {
    return tables.find(t => t.id === selectedTableId) || null;
  }, [tables, selectedTableId]);

  const currentActiveOrder = useMemo(() => {
    if (!currentTable || !currentTable.activeOrder?.orderId) {
      return activeOrders.find(o => o.tableId === selectedTableId) || null;
    }
    return activeOrders.find(o => o.id === currentTable.activeOrder.orderId) || null;
  }, [activeOrders, currentTable, selectedTableId]);

  const isRunningOrder = !!currentActiveOrder;

  // Add Item to Cart
  const addToCart = (item) => {
    if (isItemSoldOut(item)) {
      toast.warning(`${item.name} is currently out of stock!`);
      return;
    }

    const stockLimit = getStockQty(item);
    if (stockLimit !== null) {
      const inCart = cart.find((i) => (i.menuItemId || i.id) === item.id)?.quantity || 0;
      if (inCart + 1 > stockLimit) {
        toast.warning(`Only ${stockLimit} ${item.name} left in stock.`);
        return;
      }
    }

    setCart((prev) => {
      const existing = prev.find((i) => (i.menuItemId || i.id) === item.id);
      if (existing) {
        return prev.map((i) =>
          (i.menuItemId || i.id) === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: item.id,
          menuItemId: item.id,
          name: item.name,
          price: item.price,
          isVeg: item.isVeg,
          quantity: 1,
          notes: '',
          printerDestination: item.printerDestination || 'KITCHEN'
        }
      ];
    });
  };

  const updateQuantity = (itemId, delta) => {
    if (delta > 0) {
      const menuItem = menuItems.find((m) => m.id === itemId);
      const stockLimit = getStockQty(menuItem);
      const inCart = cart.find((i) => (i.menuItemId || i.id) === itemId)?.quantity || 0;
      if (stockLimit !== null && inCart + delta > stockLimit) {
        toast.warning(`Only ${stockLimit} ${menuItem?.name || 'item'} left in stock.`);
        return;
      }
    }
    setCart((prev) =>
      prev
        .map((i) => {
          if ((i.menuItemId || i.id) === itemId) {
            const newQty = i.quantity + delta;
            return newQty > 0 ? { ...i, quantity: newQty } : null;
          }
          return i;
        })
        .filter(Boolean)
    );
  };

  const removeItem = (itemId) => {
    setCart((prev) => prev.filter((i) => (i.menuItemId || i.id) !== itemId));
  };

  const openNoteModal = (item) => {
    setEditingNoteItem(item);
    setNoteInput(item.notes || '');
  };

  const saveItemNote = () => {
    if (!editingNoteItem) return;
    setCart((prev) =>
      prev.map((i) =>
        (i.menuItemId || i.id) === (editingNoteItem.menuItemId || editingNoteItem.id)
          ? { ...i, notes: noteInput.trim() }
          : i
      )
    );
    setEditingNoteItem(null);
    setNoteInput('');
  };

  const clearCart = () => {
    setCart([]);
    setDiscountType(null);
    setDiscountValue(0);
    setOrderNotes('');
  };

  // Cart financial calculations
  const cartCalculations = useMemo(() => {
    const subtotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);

    let discountAmount = 0;
    const discVal = parseFloat(discountValue) || 0;
    if (discountType === 'PERCENTAGE' && discVal > 0) {
      discountAmount = (subtotal * Math.min(discVal, 100)) / 100;
    } else if (discountType === 'FIXED' && discVal > 0) {
      discountAmount = Math.min(discVal, subtotal);
    }

    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRateValue = restaurant?.taxRate !== undefined ? restaurant.taxRate : 5.0;
    const taxAmount = (taxableAmount * taxRateValue) / 100;
    const grandTotal = taxableAmount + taxAmount;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [cart, discountType, discountValue, restaurant]);

  // Combined calculations when settling an existing running order
  const runningOrderTotals = useMemo(() => {
    if (!currentActiveOrder) return cartCalculations;

    const existingItemsTotal = (currentActiveOrder.items || []).reduce(
      (sum, i) => sum + (i.itemTotal || (i.price * i.quantity)),
      0
    );
    const newItemsTotal = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const totalSubtotal = existingItemsTotal + newItemsTotal;

    let discountAmount = 0;
    const discVal = parseFloat(discountValue) || (currentActiveOrder.discountValue || 0);
    const activeDiscType = discountType || currentActiveOrder.discountType;

    if (activeDiscType === 'PERCENTAGE' && discVal > 0) {
      discountAmount = (totalSubtotal * Math.min(discVal, 100)) / 100;
    } else if (activeDiscType === 'FIXED' && discVal > 0) {
      discountAmount = Math.min(discVal, totalSubtotal);
    }

    const taxable = Math.max(0, totalSubtotal - discountAmount);
    const taxRateVal = restaurant?.taxRate !== undefined ? restaurant.taxRate : 5.0;
    const taxAmount = (taxable * taxRateVal) / 100;
    const grandTotal = taxable + taxAmount;

    return {
      subtotal: Math.round(totalSubtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      grandTotal: Math.round(grandTotal * 100) / 100
    };
  }, [currentActiveOrder, cart, discountType, discountValue, restaurant, cartCalculations]);

  // Filtered Menu Items
  const filteredItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory =
        selectedCategory === 'ALL' || item.categoryId === selectedCategory;
      const matchesSearch =
        searchQuery === '' ||
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.sku && item.sku.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesVeg =
        vegFilter === 'ALL' ||
        (vegFilter === 'VEG' && item.isVeg) ||
        (vegFilter === 'NON_VEG' && !item.isVeg);

      return matchesCategory && matchesSearch && matchesVeg;
    });
  }, [menuItems, selectedCategory, searchQuery, vegFilter]);

  const handleSelectTable = (table) => {
    setSelectedTableId(table.id);
    setOrderType('DINE_IN');
  };

  // 1. Send Order to Kitchen (New Order or Running KOT)
  const handleSendToKitchen = async () => {
    if (cart.length === 0) {
      toast.warning('Please select food items before sending to kitchen.');
      return;
    }

    if (orderType === 'DINE_IN' && !selectedTableId) {
      toast.warning('Please select a dining table.');
      return;
    }

    if (isSubmitting) return;

    try {
      setIsSubmitting(true);

      const waiterData = {
        uid: user?.uid,
        name: user?.name || 'Server',
        role: user?.role || 'staff'
      };

      if (isRunningOrder && currentActiveOrder) {
        const res = await addRunningKOTToOrder(
          activeRestaurantId,
          currentActiveOrder.id,
          cart,
          waiterData,
          orderNotes
        );

        toast.success(`Running KOT #${res.kot.kotNumber} sent to kitchen!`);
        setPreviewKOT(res.kot);
        setPreviewInvoice(null);
        setIsInvoiceModalOpen(true);
        clearCart();
      } else {
        const orderData = {
          orderType,
          tableId: orderType === 'DINE_IN' ? selectedTableId : null,
          tableNumber: orderType === 'DINE_IN' ? (currentTable?.tableNumber || 'Table') : null,
          subtotal: cartCalculations.subtotal,
          discountType,
          discountValue,
          discountAmount: cartCalculations.discountAmount,
          taxRate: restaurant?.taxRate || 5.0,
          taxAmount: cartCalculations.taxAmount,
          totalAmount: cartCalculations.grandTotal,
          orderNotes,
          customerName,
          customerPhone
        };

        const res = await createOrderWithKOT(
          activeRestaurantId,
          orderData,
          cart,
          waiterData
        );

        toast.success(`Order #${res.order.orderNumber} & KOT #${res.kot.kotNumber} dispatched!`);
        setPreviewKOT(res.kot);
        setPreviewInvoice(null);
        setIsInvoiceModalOpen(true);
        clearCart();
      }
    } catch (err) {
      console.error('Send to kitchen error:', err);
      toast.error(
        err?.message?.includes('already has an open order')
          ? err.message
          : 'Failed to send order to kitchen. Please retry.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Request Bill
  const handleRequestBill = async () => {
    if (!currentActiveOrder) return;
    try {
      await requestBillForTable(
        activeRestaurantId,
        selectedTableId,
        currentActiveOrder.id,
        user
      );
      toast.info(`Bill requested for Table ${currentTable?.tableNumber}!`);
    } catch (err) {
      toast.error('Failed to request bill.');
    }
  };

  // 3. Open Billing / Settlement Modal
  const handleOpenSettleModal = () => {
    if (!currentActiveOrder && cart.length === 0) {
      toast.warning('No active order or cart items to settle.');
      return;
    }
    setIsPaymentModalOpen(true);
  };

  // 4. Complete Payment & Atomic Table Release
  const handleCompleteSettlement = async () => {
    if (isSubmitting) return;

    if (customerPhone && customerPhone.trim()) {
      const phoneValidation = validateIndianPhone(customerPhone, false);
      if (!phoneValidation.isValid) {
        toast.error(phoneValidation.message);
        return;
      }
    }

    try {
      setIsSubmitting(true);

      let targetOrderId = currentActiveOrder?.id;

      if (!targetOrderId) {
        const orderData = {
          orderType,
          tableId: orderType === 'DINE_IN' ? selectedTableId : null,
          tableNumber: orderType === 'DINE_IN' ? (currentTable?.tableNumber || 'Table') : null,
          subtotal: cartCalculations.subtotal,
          discountType,
          discountValue,
          discountAmount: cartCalculations.discountAmount,
          taxRate: restaurant?.taxRate || 5.0,
          taxAmount: cartCalculations.taxAmount,
          totalAmount: cartCalculations.grandTotal,
          orderNotes,
          customerName,
          customerPhone
        };
        const created = await createOrderWithKOT(activeRestaurantId, orderData, cart, user);
        targetOrderId = created.order.id;
      } else if (cart.length > 0) {
        await addRunningKOTToOrder(activeRestaurantId, targetOrderId, cart, user, orderNotes);
      }

      const paymentData = {
        tableId: orderType === 'DINE_IN' ? selectedTableId : null,
        tableNumber: orderType === 'DINE_IN' ? (currentTable?.tableNumber || 'Table') : null,
        customerName: customerName || currentActiveOrder?.customerName,
        customerPhone: customerPhone || currentActiveOrder?.customerPhone,
        subtotal: runningOrderTotals.subtotal,
        discountAmount: runningOrderTotals.discountAmount,
        taxAmount: runningOrderTotals.taxAmount,
        totalAmount: runningOrderTotals.grandTotal,
        paymentMethod
      };

      const settledInvoice = await settleAndReleaseTableAtomic(
        activeRestaurantId,
        targetOrderId,
        paymentData,
        user
      );

      toast.success(`Payment ₹${paymentData.totalAmount} recorded! Table released.`);
      setIsPaymentModalOpen(false);
      clearCart();

      setPreviewInvoice(settledInvoice);
      setPreviewKOT(null);
      setIsInvoiceModalOpen(true);
    } catch (err) {
      console.error('Settlement error:', err);
      toast.error('Payment failed: ' + (err.message || 'Could not settle.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const freeTablesCount = tables.filter(t => t.status === 'AVAILABLE').length;
  const occupiedTablesCount = tables.filter(t => t.status === 'OCCUPIED').length;
  const billReqCount = tables.filter(t => t.status === 'BILL_REQUESTED').length;

  return (
    <div className="space-y-2.5 flex flex-col h-[calc(100vh-4.75rem)] select-none transition-colors duration-200">
      {/* 1. TOP LIVE FLOOR STATUS & TABLE STRIP */}
      <div className="pos-surface-glass rounded-2xl p-3 shrink-0 flex flex-col gap-2.5 border border-pos-border">
        {/* Table Filter Tabs + Live Statistics Bar */}
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 sm:pb-0">
          <div className="flex items-center space-x-1.5 shrink-0">
            <span className="text-[11px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center mr-1">
              <Utensils className="w-3.5 h-3.5 mr-1" />
              Floor View:
            </span>
            {[
              { id: 'ALL', label: `All Tables (${tables.length})` },
              { id: 'AVAILABLE', label: `🟢 Free (${freeTablesCount})` },
              { id: 'OCCUPIED', label: `🟡 Busy (${occupiedTablesCount})` },
              { id: 'BILL_REQUESTED', label: `🟣 Bill Req (${billReqCount})` }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setTableFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all pos-btn-touch ${
                  tableFilter === tab.id
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black shadow-pos-amber'
                    : 'bg-pos-card text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center space-x-2 text-xs shrink-0">
            <div className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-pos-card border border-pos-border text-[11px]">
              {isOnline ? (
                <span className="flex items-center font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse mr-1.5"></span>
                  Petpooja Cloud Live
                </span>
              ) : (
                <span className="flex items-center font-bold text-rose-600 dark:text-rose-400">
                  <WifiOff className="w-3 h-3 mr-1" /> Offline / Syncing
                </span>
              )}
            </div>
            <div className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-pos-card border border-pos-border text-slate-600 dark:text-slate-300 text-[11px]">
              <span>Active KOTs:</span>
              <strong className="text-amber-600 dark:text-amber-400 font-mono font-black">{activeOrders.length}</strong>
            </div>
          </div>
        </div>

        {/* Real-Time Table Chips Slider */}
        <div className="flex items-center space-x-2 overflow-x-auto py-0.5 scrollbar-thin">
          {tables
            .filter(t => tableFilter === 'ALL' || t.status === tableFilter)
            .map((table) => {
              const isSelected = selectedTableId === table.id && orderType === 'DINE_IN';
              const isOcc = table.status === 'OCCUPIED';
              const isBillReq = table.status === 'BILL_REQUESTED';

              let chipStyle = 'bg-pos-card border-pos-border text-slate-700 dark:text-slate-300 hover:border-amber-500/50';
              if (isBillReq) {
                chipStyle = 'bg-purple-100 dark:bg-purple-950/70 border-purple-400 dark:border-purple-500 text-purple-900 dark:text-purple-200 shadow-pos-purple animate-pulse-subtle';
              } else if (isOcc) {
                chipStyle = 'bg-amber-100 dark:bg-amber-950/50 border-amber-400 dark:border-amber-500/70 text-amber-900 dark:text-amber-200 shadow-sm';
              } else {
                chipStyle = 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-300';
              }

              if (isSelected) {
                chipStyle += ' ring-2 ring-amber-400 ring-offset-2 ring-offset-pos-dark font-black shadow-pos-amber';
              }

              return (
                <button
                  key={table.id}
                  type="button"
                  onClick={() => handleSelectTable(table)}
                  className={`px-3.5 py-2 rounded-xl border text-left shrink-0 transition-all duration-150 flex flex-col justify-between min-w-[115px] pos-btn-touch ${chipStyle}`}
                >
                  <div className="flex items-center justify-between text-xs w-full">
                    <span className="font-extrabold tracking-tight font-display text-slate-900 dark:text-white">T-{table.tableNumber}</span>
                    <span className="text-[10px] opacity-80 font-mono">👥 {table.capacity}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[10px] uppercase">
                      {isBillReq ? 'Bill Req' : isOcc ? 'Occupied' : 'Vacant'}
                    </span>
                    {isOcc && table.activeOrder?.totalAmount > 0 && (
                      <span className="font-black text-amber-600 dark:text-amber-400 font-num">
                        {currencySymbol}{table.activeOrder.totalAmount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* 2. MAIN POS WORKSPACE (2 COLUMNS: LEFT MENU CATALOG, RIGHT TICKET CART) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        
        {/* LEFT COLUMN: CATEGORIES + MENU ITEMS GRID (7-8 Cols) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col pos-surface-glass rounded-2xl p-3.5 overflow-hidden border border-pos-border shadow-sm">
          
          {/* Top Search, Diet Toggle, and Category Pills */}
          <div className="space-y-3 shrink-0 pb-3 border-b border-pos-border">
            <div className="flex items-center gap-2.5">
              {/* Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search dishes, drinks, shortcodes (e.g. Biryani, Paneer, 101)..."
                  className="w-full pl-10 pr-8 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-all font-medium"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Veg / Non-Veg Standard Food Indicators */}
              <div className="flex items-center bg-pos-dark border border-pos-border p-1 rounded-xl text-xs shrink-0 space-x-1">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'VEG', label: '🟢 Veg Only' },
                  { id: 'NON_VEG', label: '🔴 Non-Veg' }
                ].map((type) => (
                  <button
                    key={type.id}
                    onClick={() => setVegFilter(type.id)}
                    className={`px-3 py-1 rounded-lg font-bold text-xs transition-all pos-btn-touch ${
                      vegFilter === type.id
                        ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Selector Pills */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-0.5 scrollbar-thin">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all pos-btn-touch ${
                  selectedCategory === 'ALL'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black shadow-pos-amber'
                    : 'bg-pos-dark text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
                }`}
              >
                🍽️ All Categories ({menuItems.length})
              </button>
              {categories.map((cat) => {
                const count = menuItems.filter(m => m.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-all pos-btn-touch ${
                      selectedCategory === cat.id
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black shadow-pos-amber'
                        : 'bg-pos-dark text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
                    }`}
                  >
                    {cat.name} {count > 0 && <span className="opacity-70 font-mono text-[10px]">({count})</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Items Grid */}
          <div className="flex-1 overflow-y-auto pt-3 pr-1 scrollbar-thin">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-56 text-amber-500">
                <div className="w-10 h-10 border-3 border-amber-500/30 border-t-amber-500 rounded-full animate-spin mb-3"></div>
                <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">Loading Petpooja menu catalog...</p>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-56 text-slate-400 text-xs">
                <Utensils className="w-10 h-10 mb-2 opacity-40 text-slate-400" />
                <p className="font-semibold text-slate-700 dark:text-slate-300">No matching dishes found</p>
                <p className="text-[11px] text-slate-500 mt-0.5">Try searching a different item or category</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                {filteredItems.map((item) => {
                  const soldOut = isItemSoldOut(item);
                  const lowStock = isLowStock(item);
                  const qtyLeft = getStockQty(item);

                  return (
                    <button
                      key={item.id}
                      onClick={() => addToCart(item)}
                      disabled={soldOut}
                      className={`group relative p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 pos-btn-touch shadow-sm ${
                        soldOut
                          ? 'bg-pos-card/40 border-pos-border opacity-50 cursor-not-allowed'
                          : 'pos-card-glass hover:border-amber-400 hover:shadow-pos-amber hover:scale-[1.01]'
                      }`}
                    >
                      <div>
                        {/* Top Indicator Tags */}
                        <div className="flex items-start justify-between gap-1 mb-2">
                          <div className="flex items-center space-x-1.5">
                            {/* Standard Indian Veg / Non-Veg */}
                            <span className={item.isVeg ? 'badge-veg' : 'badge-nonveg'} title={item.isVeg ? 'Vegetarian' : 'Non-Vegetarian'}>
                              <span className={item.isVeg ? 'badge-veg-dot' : 'badge-nonveg-dot'} />
                            </span>
                            {item.printerDestination === 'BAR' && (
                              <span className="text-[9px] bg-purple-100 dark:bg-purple-950/80 border border-purple-400 dark:border-purple-500 text-purple-700 dark:text-purple-300 px-1.5 py-0.2 rounded font-extrabold">
                                🍸 BAR
                              </span>
                            )}
                          </div>

                          {soldOut ? (
                            <span className="text-[9px] font-black text-rose-700 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/90 px-2 py-0.5 rounded-md border border-rose-300 dark:border-rose-700">
                              SOLD OUT
                            </span>
                          ) : lowStock ? (
                            <span className="text-[9px] font-black text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/90 px-2 py-0.5 rounded-md border border-amber-300 dark:border-amber-700 font-mono">
                              {qtyLeft} left
                            </span>
                          ) : null}
                        </div>

                        {/* Title & Description */}
                        <h4 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white group-hover:text-amber-600 dark:group-hover:text-amber-300 line-clamp-2 leading-snug">
                          {item.name}
                        </h4>
                        {item.description && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-1">
                            {item.description}
                          </p>
                        )}
                      </div>

                      {/* Price & Add Button */}
                      <div className="mt-3.5 pt-2.5 border-t border-pos-border/70 flex items-center justify-between">
                        <span className="text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 font-num">
                          {currencySymbol}{item.price?.toFixed(2)}
                        </span>
                        <span className="p-1.5 rounded-xl bg-pos-dark group-hover:bg-amber-400 group-hover:text-slate-950 text-slate-500 dark:text-slate-400 border border-pos-border group-hover:border-amber-400 transition-all shadow-sm">
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: POS TICKET / BILL BUILDER (4-5 Cols) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col pos-surface-glass rounded-2xl p-4 overflow-hidden shadow-xl border border-pos-border">
          
          {/* Ticket Header & Dine-In / Takeaway Toggle */}
          <div className="pb-3 border-b border-pos-border shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center space-x-2 font-display">
                  <ShoppingBag className="w-4 h-4 text-amber-500" />
                  <span>
                    {isRunningOrder ? `Table ${currentTable?.tableNumber} Ticket` : 'Current Ticket'}
                  </span>
                </h3>
                {isRunningOrder && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-300 font-bold flex items-center space-x-1 mt-0.5 font-mono">
                    <span>Order #{currentActiveOrder.orderNumber}</span>
                    <span>• {currentActiveOrder.orderStatus}</span>
                  </p>
                )}
              </div>

              {/* Order Mode Switch */}
              <div className="flex items-center space-x-1 bg-pos-dark border border-pos-border p-1 rounded-xl text-xs">
                {['DINE_IN', 'TAKEAWAY'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all pos-btn-touch ${
                      orderType === type
                        ? 'bg-amber-500 text-slate-950 font-extrabold shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {type === 'DINE_IN' ? '🍽️ Dine In' : '🥡 Takeaway'}
                  </button>
                ))}
              </div>
            </div>

            {/* Server / Table banner */}
            {orderType === 'DINE_IN' && (
              <div className="flex items-center justify-between text-xs px-3 py-2 rounded-xl bg-pos-dark border border-pos-border text-slate-700 dark:text-slate-300">
                <span>Selected: <strong className="text-slate-900 dark:text-white font-display">Table {currentTable?.tableNumber || 'None'}</strong></span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400">Server: <strong className="text-slate-800 dark:text-slate-200">{user?.name || 'Staff'}</strong></span>
              </div>
            )}
          </div>

          {/* Ticket Body: Already Cooking items + New Cart Items */}
          <div className="flex-1 overflow-y-auto py-3 space-y-4 scrollbar-thin">
            
            {/* 1. Already Sent To Kitchen (Active KOT Items) */}
            {isRunningOrder && currentActiveOrder.items?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-[11px] font-extrabold text-amber-600 dark:text-amber-400 px-1">
                  <span className="flex items-center">
                    <Flame className="w-3.5 h-3.5 mr-1 fill-current text-amber-500" />
                    COOKING IN KITCHEN ({currentActiveOrder.items.length})
                  </span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">{currentActiveOrder.orderStatus}</span>
                </div>
                <div className="bg-pos-dark border border-pos-border rounded-2xl p-3 divide-y divide-pos-border/60 text-xs shadow-inner">
                  {currentActiveOrder.items.map((item, idx) => (
                    <div key={idx} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-black text-amber-600 dark:text-amber-400 font-num">{item.quantity}x</span>
                          <span className="text-slate-900 dark:text-slate-100 font-bold">{item.name}</span>
                          {item.kotNumber && (
                            <span className="text-[9px] bg-pos-surface border border-pos-border text-slate-500 dark:text-slate-400 px-1.5 py-0.2 rounded font-mono">
                              {item.kotNumber.split('-').slice(-2).join('-')}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-300 italic pl-6 mt-0.5">Note: {item.notes}</p>
                        )}
                      </div>
                      <span className="font-bold text-slate-900 dark:text-slate-200 font-num">
                        {currencySymbol}{(item.itemTotal || (item.price * item.quantity)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. New Cart Items (To be punched) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 px-1">
                <span>
                  {isRunningOrder ? '➕ NEW ITEMS TO DISPATCH' : `CART ITEMS (${cart.length})`}
                </span>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline flex items-center space-x-1 pos-btn-touch"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-6 rounded-2xl border border-dashed border-pos-border text-center text-slate-400 text-xs bg-pos-dark/40">
                  {isRunningOrder
                    ? `Tap dishes on left to add Running KOT to Table ${currentTable?.tableNumber}`
                    : 'Select dishes from the menu on the left to punch order'}
                </div>
              ) : (
                <div className="space-y-2">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="p-3 rounded-2xl bg-pos-dark border border-pos-border flex flex-col space-y-1.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-slate-900 dark:text-white truncate max-w-[150px]">
                          {item.name}
                        </span>
                        
                        {/* Quantity Stepper */}
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="w-6 h-6 rounded-lg bg-pos-surface hover:bg-pos-card-hover text-slate-700 dark:text-slate-200 flex items-center justify-center border border-pos-border pos-btn-touch shadow-sm"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-black text-xs w-6 text-center text-slate-900 dark:text-white font-num">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="w-6 h-6 rounded-lg bg-pos-surface hover:bg-pos-card-hover text-slate-700 dark:text-slate-200 flex items-center justify-center border border-pos-border pos-btn-touch shadow-sm"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <span className="font-black text-xs text-amber-600 dark:text-amber-400 ml-1.5 w-16 text-right font-num">
                            {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Item Cooking Note & Delete */}
                      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 pt-1.5 border-t border-pos-border/40">
                        <button
                          onClick={() => openNoteModal(item)}
                          className="hover:text-amber-600 dark:hover:text-amber-300 font-bold italic flex items-center space-x-1"
                        >
                          <span>{item.notes ? `✍️ "${item.notes}"` : '+ Add cooking note'}</span>
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-slate-400 hover:text-rose-500 p-1 transition-colors"
                          title="Remove item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Financial Calculation Summary (Receipt Bottom Style) */}
          <div className="pt-3 border-t border-pos-border shrink-0 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Subtotal:</span>
              <span className="text-slate-900 dark:text-slate-200 font-num font-bold">
                {currencySymbol}{runningOrderTotals.subtotal.toFixed(2)}
              </span>
            </div>
            {runningOrderTotals.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                <span>Discount Applied:</span>
                <span className="font-num">- {currencySymbol}{runningOrderTotals.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>{restaurant?.taxName || 'GST'} ({restaurant?.taxRate || 5}%):</span>
              <span className="text-slate-900 dark:text-slate-200 font-num">
                {currencySymbol}{runningOrderTotals.taxAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between items-center font-black text-base text-slate-900 dark:text-white pt-2 border-t border-pos-border">
              <span className="text-slate-700 dark:text-slate-200 font-display">Grand Total:</span>
              <span className="text-amber-600 dark:text-amber-400 font-black text-xl font-num">
                {currencySymbol}{runningOrderTotals.grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Petpooja High-Action Billing Bar */}
          <div className="pt-3.5 border-t border-pos-border shrink-0 grid grid-cols-2 gap-2.5">
            {/* Send to Kitchen / KOT (Petpooja Amber/Yellow) */}
            <button
              type="button"
              onClick={handleSendToKitchen}
              disabled={isSubmitting || cart.length === 0}
              className="petpooja-btn-kot py-3 px-3 rounded-2xl disabled:opacity-40 flex items-center justify-center space-x-2 transition-all text-xs"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div>
              ) : (
                <>
                  <Flame className="w-4 h-4 fill-current text-slate-950" />
                  <span>{isRunningOrder ? 'Send New KOT' : 'Send to Kitchen (KOT)'}</span>
                </>
              )}
            </button>

            {/* Settle Bill & Release (Petpooja Emerald Green) */}
            <button
              type="button"
              onClick={handleOpenSettleModal}
              disabled={isSubmitting || (!currentActiveOrder && cart.length === 0)}
              className="petpooja-btn-pay py-3 px-3 rounded-2xl disabled:opacity-40 flex items-center justify-center space-x-2 transition-all text-xs"
            >
              <CreditCard className="w-4 h-4 text-slate-950" />
              <span>Settle & Pay</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. SETTLEMENT / PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-pos-surface border border-pos-border rounded-3xl max-w-md w-full p-5 space-y-4 shadow-2xl transition-colors">
            <div className="flex items-center justify-between pb-3 border-b border-pos-border">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center space-x-2 font-display">
                <CreditCard className="w-5 h-5 text-amber-500" />
                <span>Petpooja Fast Checkout</span>
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Bill Summary Box */}
            <div className="p-4 bg-pos-dark rounded-2xl border border-pos-border space-y-1.5 text-xs shadow-inner">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Table / Order:</span>
                <strong className="text-slate-900 dark:text-white font-display">
                  {orderType === 'DINE_IN' ? `Table ${currentTable?.tableNumber}` : 'Takeaway Walk-in'}
                </strong>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Items Subtotal:</span>
                <span className="font-num">{currencySymbol}{runningOrderTotals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Tax ({restaurant?.taxRate || 5}%):</span>
                <span className="font-num">{currencySymbol}{runningOrderTotals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-black text-sm text-slate-900 dark:text-white pt-2 border-t border-pos-border">
                <span className="text-slate-700 dark:text-slate-200 font-display">Payable Amount:</span>
                <span className="text-amber-600 dark:text-amber-400 font-black text-lg font-num">
                  {currencySymbol}{runningOrderTotals.grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Payment Tender Mode:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'CASH', label: '💵 Cash' },
                  { id: 'UPI', label: '📱 UPI / QR' },
                  { id: 'CARD', label: '💳 Card' }
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`py-3 rounded-2xl border text-xs font-extrabold transition-all pos-btn-touch ${
                      paymentMethod === m.id
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-400 border-amber-400 text-slate-950 font-black shadow-pos-amber'
                        : 'bg-pos-dark border-pos-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Details Inputs */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Guest Name (Optional)"
                className="px-3.5 py-2.5 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone (For SMS Bill)"
                className="px-3.5 py-2.5 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 font-mono"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-pos-border">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteSettlement}
                disabled={isSubmitting}
                className="petpooja-btn-pay px-5 py-2.5 rounded-2xl text-slate-950 font-black text-xs shadow-pos-glow flex items-center space-x-2"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Settle & Print Receipt</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. PETPOOJA QUICK COOKING NOTE MODAL WITH PRESET CHIPS */}
      {editingNoteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-pos-surface border border-pos-border rounded-3xl max-w-sm w-full p-4.5 space-y-3.5 shadow-2xl">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white">
              Special Instructions for <span className="text-amber-600 dark:text-amber-400">{editingNoteItem.name}</span>
            </h4>
            
            {/* Quick preset tags */}
            <div className="flex flex-wrap gap-1.5">
              {[
                'Less Spicy',
                'Extra Spicy',
                'No Onion Garlic',
                'Extra Cheese',
                'Jain Prep',
                'Pack Separately',
                'Serve Hot',
                'No Ice'
              ].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => setNoteInput(prev => prev ? `${prev}, ${chip}` : chip)}
                  className="px-2.5 py-1 rounded-lg bg-pos-dark hover:bg-pos-card border border-pos-border text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-300 transition-colors pos-btn-touch shadow-sm"
                >
                  +{chip}
                </button>
              ))}
            </div>

            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Type or click chips above..."
              className="w-full px-3.5 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
              autoFocus
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingNoteItem(null)}
                className="px-3.5 py-2 text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveItemNote}
                className="petpooja-btn-kot px-4 py-2 rounded-xl text-slate-950 font-black text-xs"
              >
                Apply Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. INVOICE / KOT THERMAL PRINT MODAL */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={() => setIsInvoiceModalOpen(false)}
        invoice={previewInvoice}
        kot={previewKOT}
      />
    </div>
  );
}
