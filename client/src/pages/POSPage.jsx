import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  Coffee
} from 'lucide-react';
import {
  getCategories,
  getMenuItems,
  subscribeToTables,
  subscribeToActiveOrders,
  claimTableAtomic,
  createOrderWithKOT,
  addRunningKOTToOrder,
  requestBillForTable,
  settleAndReleaseTableAtomic
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
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
          setCategories(cats);
          setMenuItems(items);
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
      setTables(liveTables);
      // If currently selected table doesn't exist, pick the first available
      if (!selectedTableId && liveTables.length > 0) {
        const firstAvail = liveTables.find(t => t.status === 'AVAILABLE') || liveTables[0];
        setSelectedTableId(firstAvail.id);
      }
    });

    const unsubOrders = subscribeToActiveOrders(activeRestaurantId, (liveOrders) => {
      setActiveOrders(liveOrders);
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

  // Is this an occupied table with a running order?
  const isRunningOrder = !!currentActiveOrder;

  // Add Item to Cart
  const addToCart = (item) => {
    if (!item.isAvailable) {
      toast.warning(`${item.name} is currently out of stock!`);
      return;
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

  // Cart financial calculations (for new items)
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

  // Table selection handler
  const handleSelectTable = async (table) => {
    setSelectedTableId(table.id);
    setOrderType('DINE_IN');

    // If available, attempt atomic claim
    if (table.status === 'AVAILABLE') {
      try {
        await claimTableAtomic(activeRestaurantId, table.id, {
          uid: user?.uid,
          name: user?.name,
          role: user?.role
        });
      } catch (err) {
        console.warn('Table already claimed by another waiter');
      }
    }
  };

  // 1. Send Order to Kitchen (New Order or Running KOT)
  const handleSendToKitchen = async () => {
    if (cart.length === 0) {
      toast.warning('Please add items to cart before sending to kitchen.');
      return;
    }

    if (orderType === 'DINE_IN' && !selectedTableId) {
      toast.warning('Please select a table for Dine-In.');
      return;
    }

    if (isSubmitting) return; // Prevent double clicks

    try {
      setIsSubmitting(true);

      const waiterData = {
        uid: user?.uid,
        name: user?.name || 'Waiter',
        role: user?.role || 'staff'
      };

      if (isRunningOrder && currentActiveOrder) {
        // Appending Running KOT #2, #3 to existing active order
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
        // Creating Initial Order + KOT #1
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
      toast.error('Failed to send order to kitchen. Please retry.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Request Bill (Waiter action)
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

    try {
      setIsSubmitting(true);

      let targetOrderId = currentActiveOrder?.id;

      // If there was no active order but there were items in cart (e.g. quick takeaway walk-in)
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
        // If there were extra un-sent cart items on an active table, append them first
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

      // Show final customer receipt
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

  return (
    <div className="space-y-3 flex flex-col h-[calc(100vh-4.5rem)]">
      {/* 1. TOP LIVE FLOOR & STATUS BAR */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 shrink-0 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
        {/* Table Filter Pills */}
        <div className="flex items-center space-x-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-2 flex items-center shrink-0">
            <Utensils className="w-3.5 h-3.5 mr-1 text-emerald-400" />
            Floor Tables:
          </span>
          {['ALL', 'AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED'].map((filter) => (
            <button
              key={filter}
              onClick={() => setTableFilter(filter)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                tableFilter === filter
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {filter === 'ALL' ? 'All Tables' : filter.replace('_', ' ')}
            </button>
          ))}
        </div>

        {/* Live Network & Active Status */}
        <div className="flex items-center space-x-3 text-xs shrink-0 self-end sm:self-auto">
          <div className="flex items-center space-x-1 px-2 py-1 rounded-md bg-slate-950 border border-slate-800">
            {isOnline ? (
              <span className="flex items-center text-emerald-400">
                <Wifi className="w-3.5 h-3.5 mr-1 animate-pulse" /> Live Real-Time
              </span>
            ) : (
              <span className="flex items-center text-rose-400">
                <WifiOff className="w-3.5 h-3.5 mr-1" /> Offline Reconnecting...
              </span>
            )}
          </div>
          <div className="text-slate-400">
            Active Orders: <strong className="text-white">{activeOrders.length}</strong>
          </div>
        </div>
      </div>

      {/* 2. TABLE CHIPS ROW */}
      <div className="flex items-center space-x-2 overflow-x-auto py-1 shrink-0 scrollbar-thin">
        {tables
          .filter(t => tableFilter === 'ALL' || t.status === tableFilter)
          .map((table) => {
            const isSelected = selectedTableId === table.id && orderType === 'DINE_IN';
            const isOcc = table.status === 'OCCUPIED';
            const isBillReq = table.status === 'BILL_REQUESTED';

            let badgeBg = 'bg-slate-900 border-slate-800 text-slate-300';
            if (isBillReq) badgeBg = 'bg-purple-950/80 border-purple-600 text-purple-200 animate-pulse';
            else if (isOcc) badgeBg = 'bg-amber-950/70 border-amber-600/80 text-amber-200';
            else badgeBg = 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300';

            if (isSelected) {
              badgeBg += ' ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950 font-bold';
            }

            return (
              <button
                key={table.id}
                type="button"
                onClick={() => handleSelectTable(table)}
                className={`px-3 py-2 rounded-xl border text-left shrink-0 transition-all flex flex-col justify-between min-w-[105px] ${badgeBg}`}
              >
                <div className="flex items-center justify-between text-xs w-full">
                  <span className="font-bold">Table {table.tableNumber}</span>
                  <span className="text-[10px] opacity-75">👥 {table.capacity}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span>{isBillReq ? 'Bill Req' : isOcc ? 'Occupied' : 'Free'}</span>
                  {isOcc && table.activeOrder?.totalAmount > 0 && (
                    <span className="font-extrabold text-amber-400">
                      {currencySymbol}{table.activeOrder.totalAmount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
      </div>

      {/* 3. MAIN POS LAYOUT (2 COLUMNS: LEFT MENU, RIGHT CART/ORDER) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 flex-1 min-h-0">
        {/* LEFT COLUMN: CATEGORIES + MENU ITEMS (8 Cols) */}
        <div className="lg:col-span-7 xl:col-span-8 flex flex-col bg-slate-900/80 border border-slate-800 rounded-2xl p-3 overflow-hidden">
          {/* Search, Veg Filter, and Categories */}
          <div className="space-y-2.5 shrink-0 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search food, drinks, SKU..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Veg / Non-Veg filter */}
              <div className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-xl text-xs">
                {['ALL', 'VEG', 'NON_VEG'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setVegFilter(type)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${
                      vegFilter === type
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type === 'ALL' ? 'All' : type === 'VEG' ? '🟢 Veg' : '🔴 Non-Veg'}
                  </button>
                ))}
              </div>
            </div>

            {/* Category Pills */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-thin">
              <button
                onClick={() => setSelectedCategory('ALL')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === 'ALL'
                    ? 'bg-emerald-600 text-white shadow'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                All Menu
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                    selectedCategory === cat.id
                      ? 'bg-emerald-600 text-white shadow'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>

          {/* Menu Items Grid */}
          <div className="flex-1 overflow-y-auto pt-3 pr-1 scrollbar-thin">
            {loading ? (
              <div className="flex items-center justify-center h-48 text-emerald-400">
                <div className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-slate-500">
                <Utensils className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-xs">No menu items found</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
                {filteredItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    disabled={!item.isAvailable}
                    className={`group relative p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all duration-150 active:scale-95 ${
                      !item.isAvailable
                        ? 'bg-slate-950/50 border-slate-900 opacity-50 cursor-not-allowed'
                        : 'bg-slate-950 border-slate-800 hover:border-emerald-500 hover:shadow-lg hover:shadow-emerald-950/40'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-1 mb-1">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                          item.isVeg
                            ? 'bg-emerald-950/60 border-emerald-700 text-emerald-400'
                            : 'bg-rose-950/60 border-rose-700 text-rose-400'
                        }`}>
                          {item.isVeg ? 'VEG' : 'NON'}
                        </span>
                        {item.printerDestination === 'BAR' && (
                          <span className="text-[9px] bg-purple-950/60 border border-purple-700 text-purple-300 px-1 rounded">
                            BAR
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-white group-hover:text-emerald-300 line-clamp-2 leading-tight">
                        {item.name}
                      </h4>
                      {item.description && (
                        <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-2.5 pt-1.5 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-xs font-black text-emerald-400">
                        {currencySymbol}{item.price?.toFixed(2)}
                      </span>
                      <span className="p-1 rounded-md bg-slate-900 group-hover:bg-emerald-600 group-hover:text-white text-slate-400 transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: ACTIVE ORDER / CART & KOT DISPATCH (4-5 Cols) */}
        <div className="lg:col-span-5 xl:col-span-4 flex flex-col bg-slate-900/90 border border-slate-800 rounded-2xl p-3 overflow-hidden">
          {/* Header & Order Type Switcher */}
          <div className="pb-2.5 border-b border-slate-800 shrink-0 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-1.5">
                  <ShoppingBag className="w-4 h-4 text-emerald-400" />
                  <span>
                    {isRunningOrder ? `Table ${currentTable?.tableNumber} Order` : 'Current Order'}
                  </span>
                </h3>
                {isRunningOrder && (
                  <p className="text-[10px] text-amber-400 font-semibold flex items-center space-x-1 mt-0.5">
                    <span>Order #{currentActiveOrder.orderNumber}</span>
                    <span>• {currentActiveOrder.orderStatus}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center space-x-1 bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs">
                {['DINE_IN', 'TAKEAWAY'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                      orderType === type
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {type === 'DINE_IN' ? 'Dine In' : 'Takeaway'}
                  </button>
                ))}
              </div>
            </div>

            {/* Server / Table banner */}
            {orderType === 'DINE_IN' && (
              <div className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300">
                <span>Selected: <strong>Table {currentTable?.tableNumber || 'None'}</strong></span>
                <span className="text-[11px] text-slate-400">Server: {user?.name || 'Staff'}</span>
              </div>
            )}
          </div>

          {/* Items Container: Existing Kitchen Items + New Cart Items */}
          <div className="flex-1 overflow-y-auto py-2 space-y-3 scrollbar-thin">
            {/* 1. Existing Active Order Items (Sent to Kitchen) */}
            {isRunningOrder && currentActiveOrder.items?.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-bold text-amber-400 px-1">
                  <span>🔥 ALREADY IN KITCHEN ({currentActiveOrder.items.length})</span>
                  <span className="text-[10px] text-slate-400">{currentActiveOrder.orderStatus}</span>
                </div>
                <div className="bg-slate-950/80 border border-amber-950/60 rounded-xl p-2 divide-y divide-slate-800/60 text-xs">
                  {currentActiveOrder.items.map((item, idx) => (
                    <div key={idx} className="py-1.5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="font-bold text-white">{item.quantity}x</span>
                          <span className="text-slate-200">{item.name}</span>
                          {item.kotNumber && (
                            <span className="text-[9px] bg-slate-900 border border-slate-700 text-slate-400 px-1 rounded">
                              {item.kotNumber.split('-').slice(-2).join('-')}
                            </span>
                          )}
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-amber-300 italic pl-5">Note: {item.notes}</p>
                        )}
                      </div>
                      <span className="font-semibold text-slate-300">
                        {currencySymbol}{(item.itemTotal || (item.price * item.quantity)).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 2. New Cart Items to be dispatched */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-emerald-400 px-1">
                <span>
                  {isRunningOrder ? '➕ NEW ITEMS TO ADD (KOT)' : `CART ITEMS (${cart.length})`}
                </span>
                {cart.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-[10px] text-rose-400 hover:text-rose-300 flex items-center space-x-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {cart.length === 0 ? (
                <div className="p-4 rounded-xl border border-dashed border-slate-800 text-center text-slate-500 text-xs">
                  {isRunningOrder
                    ? 'Tap menu items to add running KOT to Table ' + currentTable?.tableNumber
                    : 'Select menu items on the left to start order'}
                </div>
              ) : (
                <div className="space-y-1.5">
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="p-2 rounded-xl bg-slate-950 border border-slate-800 flex flex-col space-y-1"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-white truncate max-w-[140px]">
                          {item.name}
                        </span>
                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => updateQuantity(item.id, -1)}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-xs w-5 text-center text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, 1)}
                            className="p-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                          <span className="font-extrabold text-xs text-emerald-400 ml-1 w-14 text-right">
                            {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Cooking note button */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                        <button
                          onClick={() => openNoteModal(item)}
                          className="hover:text-emerald-400 underline italic flex items-center space-x-1"
                        >
                          <span>{item.notes ? `Note: "${item.notes}"` : '+ Add cooking note'}</span>
                        </button>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-slate-500 hover:text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Financial Calculation Summary */}
          <div className="pt-2 border-t border-slate-800 shrink-0 space-y-1 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal:</span>
              <span className="text-slate-200">
                {currencySymbol}{runningOrderTotals.subtotal.toFixed(2)}
              </span>
            </div>
            {runningOrderTotals.discountAmount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Discount:</span>
                <span>- {currencySymbol}{runningOrderTotals.discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between text-slate-400">
              <span>{restaurant?.taxName || 'GST'} ({restaurant?.taxRate || 5}%):</span>
              <span className="text-slate-200">
                {currencySymbol}{runningOrderTotals.taxAmount.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between font-black text-base text-white pt-1 border-t border-slate-800">
              <span>Total:</span>
              <span className="text-emerald-400">
                {currencySymbol}{runningOrderTotals.grandTotal.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Action Buttons: KOT Send vs Bill Settlement */}
          <div className="pt-3 border-t border-slate-800 shrink-0 grid grid-cols-2 gap-2">
            {/* Send to Kitchen / Send New KOT */}
            <button
              type="button"
              onClick={handleSendToKitchen}
              disabled={isSubmitting || cart.length === 0}
              className="py-2.5 px-3 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-orange-950 flex items-center justify-center space-x-1.5 transition-all active:scale-95"
            >
              {isSubmitting ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>{isRunningOrder ? 'Send New KOT' : 'Send to Kitchen'}</span>
                </>
              )}
            </button>

            {/* Settle Bill & Print */}
            <button
              type="button"
              onClick={handleOpenSettleModal}
              disabled={isSubmitting || (!currentActiveOrder && cart.length === 0)}
              className="py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-emerald-950 flex items-center justify-center space-x-1.5 transition-all active:scale-95"
            >
              <CreditCard className="w-4 h-4" />
              <span>Settle & Release</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4. SETTLEMENT / PAYMENT MODAL */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-emerald-400" />
                <span>Bill Settlement & Checkout</span>
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Bill Summary */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-300">
                <span>Table / Target:</span>
                <strong className="text-white">
                  {orderType === 'DINE_IN' ? `Table ${currentTable?.tableNumber}` : 'Takeaway'}
                </strong>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Subtotal:</span>
                <span>{currencySymbol}{runningOrderTotals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Tax ({restaurant?.taxRate || 5}%):</span>
                <span>{currencySymbol}{runningOrderTotals.taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-white pt-1 border-t border-slate-800">
                <span>Grand Total:</span>
                <span className="text-emerald-400 font-extrabold text-base">
                  {currencySymbol}{runningOrderTotals.grandTotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Select Payment Mode:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['CASH', 'UPI', 'CARD'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2.5 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === m
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {m === 'CASH' ? '💵 Cash' : m === 'UPI' ? '📱 UPI / QR' : '💳 Card'}
                  </button>
                ))}
              </div>
            </div>

            {/* Customer Details */}
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Customer Name"
                className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="Phone (Optional)"
                className="px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCompleteSettlement}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/50 flex items-center space-x-1.5"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm & Print Bill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ITEM COOKING NOTE MODAL */}
      {editingNoteItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-2xl">
            <h4 className="text-xs font-bold text-white">
              Special Cooking Note for <span className="text-emerald-400">{editingNoteItem.name}</span>
            </h4>
            <input
              type="text"
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder="e.g. Less spicy, No onion, Extra cheese, Allergies..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              autoFocus
            />
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setEditingNoteItem(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                onClick={saveItemNote}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-xs"
              >
                Save Note
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
