import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  CreditCard,
  QrCode,
  Banknote,
  Receipt,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  FileText,
  User,
  Utensils,
  ArrowRight,
  RefreshCw,
  Percent,
  DollarSign,
  Check,
  Building2,
  Phone,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import {
  subscribeToTables,
  subscribeToActiveOrders,
  getInvoices,
  settleAndReleaseTableAtomic
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import InvoiceModal from '../components/invoice/InvoiceModal';

export default function CashierPage() {
  const { user, activeRestaurantId } = useAuth();
  const { restaurant, currencySymbol, taxName } = useRestaurant();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('LIVE_BILLING'); // 'LIVE_BILLING' | 'SETTLED_INVOICES'
  const [tables, setTables] = useState([]);
  const [activeOrders, setActiveOrders] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [invoicesLoading, setInvoicesLoading] = useState(false);

  // Selected table / order for billing
  const [selectedTableId, setSelectedTableId] = useState('');
  
  // Payment settlement state
  const [paymentMethod, setPaymentMethod] = useState('CASH'); // 'CASH' | 'UPI' | 'CARD'
  const [cashReceived, setCashReceived] = useState('');
  const [upiRefNumber, setUpiRefNumber] = useState('');
  const [cardLast4, setCardLast4] = useState('');
  const [cardType, setCardType] = useState('VISA');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountType, setDiscountType] = useState(null); // 'PERCENT' | 'FLAT'
  const [discountValue, setDiscountValue] = useState(0);

  // Modals & settlement state
  const [isSettling, setIsSettling] = useState(false);
  const [settledInvoice, setSettledInvoice] = useState(null);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [invoiceSearch, setInvoiceSearch] = useState('');

  // 1. Subscribe to Live Tables and Active Orders
  useEffect(() => {
    setLoading(true);
    const unsubTables = subscribeToTables(activeRestaurantId, (liveTables) => {
      setTables(liveTables || []);
      setLoading(false);
    });

    const unsubOrders = subscribeToActiveOrders(activeRestaurantId, (liveOrders) => {
      setActiveOrders(liveOrders || []);
    });

    return () => {
      unsubTables();
      unsubOrders();
    };
  }, [activeRestaurantId]);

  // Load settled invoices
  const fetchInvoices = useCallback(async () => {
    try {
      setInvoicesLoading(true);
      const list = await getInvoices(activeRestaurantId);
      setInvoices(list || []);
    } catch (err) {
      toast.error('Failed to load past invoices.');
    } finally {
      setInvoicesLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    if (activeTab === 'SETTLED_INVOICES') {
      fetchInvoices();
    }
  }, [activeTab, fetchInvoices]);

  // Find all occupied or bill-requested tables with active orders
  const activeBillingTables = useMemo(() => {
    return tables.filter(
      (t) => t.status === 'OCCUPIED' || t.status === 'BILL_REQUESTED' || t.activeOrder?.orderId
    );
  }, [tables]);

  // Default selection if current selection is invalid
  useEffect(() => {
    if (activeBillingTables.length > 0 && !selectedTableId) {
      const firstBillReq = activeBillingTables.find(t => t.status === 'BILL_REQUESTED');
      setSelectedTableId(firstBillReq ? firstBillReq.id : activeBillingTables[0].id);
    } else if (activeBillingTables.length === 0) {
      setSelectedTableId('');
    }
  }, [activeBillingTables, selectedTableId]);

  // Find current selected table & active order
  const currentTable = useMemo(() => {
    return tables.find((t) => t.id === selectedTableId) || null;
  }, [tables, selectedTableId]);

  const currentOrder = useMemo(() => {
    if (!currentTable) return null;
    if (currentTable.activeOrder?.orderId) {
      return activeOrders.find((o) => o.id === currentTable.activeOrder.orderId) || null;
    }
    return activeOrders.find((o) => o.tableId === currentTable.id) || null;
  }, [currentTable, activeOrders]);

  // Sync customer details when order changes
  useEffect(() => {
    if (currentOrder) {
      setCustomerName(currentOrder.customerName || '');
      setCustomerPhone(currentOrder.customerPhone || '');
    }
  }, [currentOrder]);

  // Financial Calculations for current order
  const billingCalculations = useMemo(() => {
    if (!currentOrder || !currentOrder.items) {
      return { subtotal: 0, discountAmount: 0, taxableAmount: 0, taxAmount: 0, grandTotal: 0 };
    }

    const subtotal = currentOrder.items.reduce(
      (sum, i) => sum + (i.itemTotal || (i.price * i.quantity)),
      0
    );

    let discountAmount = 0;
    const discVal = parseFloat(discountValue) || 0;
    if (discountType === 'PERCENT' && discVal > 0) {
      discountAmount = (subtotal * Math.min(discVal, 100)) / 100;
    } else if (discountType === 'FLAT' && discVal > 0) {
      discountAmount = Math.min(discVal, subtotal);
    }

    const taxableAmount = Math.max(0, subtotal - discountAmount);
    const taxRateVal = restaurant?.taxRate !== undefined ? restaurant.taxRate : 5.0;
    const taxAmount = (taxableAmount * taxRateVal) / 100;
    const grandTotal = Math.round((taxableAmount + taxAmount) * 100) / 100;

    return {
      subtotal: Math.round(subtotal * 100) / 100,
      discountAmount: Math.round(discountAmount * 100) / 100,
      taxableAmount: Math.round(taxableAmount * 100) / 100,
      taxAmount: Math.round(taxAmount * 100) / 100,
      grandTotal
    };
  }, [currentOrder, discountType, discountValue, restaurant]);

  // Change amount calculation for Cash mode
  const cashChange = useMemo(() => {
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - billingCalculations.grandTotal);
  }, [cashReceived, billingCalculations.grandTotal]);

  // UPI Dynamic QR Code Payload
  const upiQrString = useMemo(() => {
    const vpa = restaurant?.upiId || 'merchant@upi';
    const name = encodeURIComponent(restaurant?.name || 'Restaurant');
    const amount = billingCalculations.grandTotal.toFixed(2);
    const orderNum = currentOrder?.orderNumber || 'BILL';
    return `upi://pay?pa=${vpa}&pn=${name}&am=${amount}&cu=INR&tn=Table%20${currentTable?.tableNumber || ''}%20${orderNum}`;
  }, [restaurant, billingCalculations.grandTotal, currentOrder, currentTable]);

  const upiQrImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(upiQrString)}`;
  }, [upiQrString]);

  // Handle Payment Settlement
  const handleSettleOrder = async (e) => {
    e.preventDefault();
    if (!currentOrder || !currentTable) {
      toast.warning('No active order selected for billing.');
      return;
    }

    if (paymentMethod === 'CASH') {
      const received = parseFloat(cashReceived) || 0;
      if (received < billingCalculations.grandTotal && cashReceived !== '') {
        toast.warning(`Cash received (${currencySymbol}${received}) is less than total amount (${currencySymbol}${billingCalculations.grandTotal})`);
        return;
      }
    } else if (paymentMethod === 'CARD') {
      if (cardLast4 && !/^\d{4}$/.test(cardLast4.trim())) {
        toast.warning('Card digits must be exactly the last 4 digits.');
        return;
      }
    }

    try {
      setIsSettling(true);

      const paymentPayload = {
        tableId: currentTable.id,
        tableNumber: currentTable.tableNumber,
        customerName: customerName.trim() || 'Walk-in Guest',
        customerPhone: customerPhone.trim() || '',
        subtotal: billingCalculations.subtotal,
        discountAmount: billingCalculations.discountAmount,
        taxAmount: billingCalculations.taxAmount,
        totalAmount: billingCalculations.grandTotal,
        paymentMethod,
        paymentDetails: {
          method: paymentMethod,
          cashReceived: paymentMethod === 'CASH' ? parseFloat(cashReceived) || billingCalculations.grandTotal : null,
          cashChange: paymentMethod === 'CASH' ? cashChange : null,
          upiRef: paymentMethod === 'UPI' ? upiRefNumber.trim() : null,
          cardType: paymentMethod === 'CARD' ? cardType : null,
          cardLast4: paymentMethod === 'CARD' ? cardLast4.trim() : null
        }
      };

      const result = await settleAndReleaseTableAtomic(
        activeRestaurantId,
        currentOrder.id,
        paymentPayload,
        user
      );

      toast.success(`Bill for Table ${currentTable.tableNumber} settled successfully via ${paymentMethod}! Table released.`);

      // Reset form states
      setCashReceived('');
      setUpiRefNumber('');
      setCardLast4('');
      setDiscountType(null);
      setDiscountValue(0);

      const invoice = result?.invoice || result;
      if (invoice) {
        setSettledInvoice({
          ...invoice,
          order: {
            orderNumber: invoice.orderNumber,
            table: { tableNumber: invoice.tableNumber },
            items: invoice.items || currentOrder.items || []
          }
        });
        setIsInvoiceModalOpen(true);
      }
    } catch (err) {
      console.error('Settle order error:', err);
      toast.error(err?.message || 'Failed to settle bill.');
    } finally {
      setIsSettling(false);
    }
  };

  const getTimeElapsed = (claimedAt) => {
    const time = claimedAt ? new Date(claimedAt).getTime() : Date.now();
    const diffMs = Date.now() - time;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'Just started';
    if (mins === 1) return '1 min ago';
    return `${mins} mins ago`;
  };

  const filteredInvoices = invoices.filter(
    (inv) =>
      inv.invoiceNumber?.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.customerName?.toLowerCase().includes(invoiceSearch.toLowerCase()) ||
      inv.customerPhone?.includes(invoiceSearch) ||
      inv.orderNumber?.toLowerCase().includes(invoiceSearch.toLowerCase())
  );

  return (
    <div className="space-y-3.5 select-none transition-colors duration-200">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 pos-surface-glass rounded-2xl shadow-xl border border-pos-border">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-500 text-white shadow-pos-glow shrink-0">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center space-x-2 font-display">
              <span>Cashier Checkout & Settlement</span>
              <span className="text-[11px] bg-teal-100 dark:bg-teal-950/80 border border-teal-400 dark:border-teal-600 text-teal-800 dark:text-teal-300 font-extrabold px-2.5 py-0.5 rounded-full font-mono shadow-sm">
                {activeBillingTables.length} Bills Pending
              </span>
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Rapid bill settlement, itemized review, Cash/UPI/Card payment calculations
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-1.5 bg-pos-dark p-1 rounded-xl border border-pos-border">
          <button
            type="button"
            onClick={() => setActiveTab('LIVE_BILLING')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all pos-btn-touch ${
              activeTab === 'LIVE_BILLING'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-pos-glow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Live Table Bills</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SETTLED_INVOICES')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all pos-btn-touch ${
              activeTab === 'SETTLED_INVOICES'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-pos-glow'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Settled Receipts Archive</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE TABLE BILLING */}
      {activeTab === 'LIVE_BILLING' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-start">
          
          {/* Left Column: Tables with Active Bills (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="p-3.5 pos-surface-glass rounded-2xl shadow-xl border border-pos-border">
              <h2 className="text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-2.5 flex items-center justify-between font-display">
                <span>Tables to Settle ({activeBillingTables.length})</span>
                <span className="text-[10px] text-teal-600 dark:text-teal-400 font-bold font-mono">Select to bill</span>
              </h2>

              {loading ? (
                <div className="py-14 text-center text-slate-400 text-xs">
                  <div className="w-7 h-7 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-2"></div>
                  Syncing live bills...
                </div>
              ) : activeBillingTables.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs bg-pos-dark/40 rounded-2xl border border-dashed border-pos-border p-5">
                  <Utensils className="w-9 h-9 mx-auto mb-2 opacity-40" />
                  <p className="font-bold text-slate-700 dark:text-slate-300">No open bills waiting for checkout.</p>
                  <p className="text-[11px] text-slate-500 mt-1">When diners finish or request a bill, their table will pop up here instantly.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-17rem)] overflow-y-auto pr-1 scrollbar-thin">
                  {activeBillingTables.map((tbl) => {
                    const isSelected = tbl.id === selectedTableId;
                    const isBillReq = tbl.status === 'BILL_REQUESTED';
                    const activeOrd = tbl.activeOrder;

                    return (
                      <div
                        key={tbl.id}
                        onClick={() => setSelectedTableId(tbl.id)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all pos-btn-touch ${
                          isSelected
                            ? 'bg-teal-50 dark:bg-teal-950/40 border-teal-500 shadow-pos-glow ring-1 ring-teal-500'
                            : isBillReq
                            ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 dark:border-purple-500 animate-pulse-subtle shadow-pos-purple'
                            : 'bg-pos-card border-pos-border hover:border-slate-400 dark:hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2.5">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs font-display shadow ${
                              isBillReq ? 'bg-purple-600 text-white' : 'bg-slate-200 dark:bg-slate-800 text-teal-700 dark:text-teal-400'
                            }`}>
                              T{tbl.tableNumber}
                            </div>
                            <div>
                              <h3 className="font-extrabold text-sm text-slate-900 dark:text-white flex items-center space-x-1.5 font-display">
                                <span>Table {tbl.tableNumber}</span>
                                {isBillReq && (
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 border border-purple-300 dark:border-purple-600 font-mono">
                                    BILL REQ
                                  </span>
                                )}
                              </h3>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center space-x-1 mt-0.5">
                                <User className="w-3 h-3 text-slate-400" />
                                <span>Server: {activeOrd?.waiterName || 'Staff'}</span>
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-num">
                              {currencySymbol}{activeOrd?.totalAmount ? activeOrd.totalAmount.toFixed(2) : '0.00'}
                            </div>
                            <span className="text-[10px] text-slate-500 flex items-center justify-end space-x-1 font-mono">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{getTimeElapsed(activeOrd?.createdAt || activeOrd?.claimedAt)}</span>
                            </span>
                          </div>
                        </div>

                        {activeOrd?.orderNumber && (
                          <div className="mt-2.5 pt-2 border-t border-pos-border/50 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                            <span className="font-mono font-semibold">#{activeOrd.orderNumber}</span>
                            <span className="text-teal-600 dark:text-teal-400 font-bold flex items-center space-x-1">
                              <span>Ready to Settle</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Detailed Bill Breakdown & Payment Settlement (8 cols) */}
          <div className="lg:col-span-8">
            {!currentTable || !currentOrder ? (
              <div className="p-14 text-center text-slate-400 pos-surface-glass rounded-3xl border border-pos-border shadow-xl">
                <Receipt className="w-14 h-14 mx-auto mb-3 opacity-30" />
                <h3 className="font-extrabold text-base text-slate-800 dark:text-slate-300 font-display">Select a table on the left to begin checkout</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  The Cashier register calculates total items, applied discounts, GST, and presents one-touch settlement via Cash, UPI QR code, or Card.
                </p>
              </div>
            ) : (
              <div className="space-y-3.5">
                {/* 1. Order Summary Card */}
                <div className="p-4 pos-surface-glass rounded-3xl shadow-xl space-y-4 border border-pos-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-pos-border gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-3 py-1 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 text-white font-extrabold text-xs shadow-pos-glow">
                          Table {currentTable.tableNumber}
                        </span>
                        <span className="font-mono text-xs text-slate-700 dark:text-slate-300 font-bold">
                          Order #{currentOrder.orderNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-extrabold uppercase bg-pos-dark text-slate-600 dark:text-slate-300 border border-pos-border font-mono">
                          {currentOrder.orderType || 'DINE_IN'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        Punched by: <strong className="text-slate-800 dark:text-slate-200">{currentOrder.waiterName || 'Staff'}</strong> • {getTimeElapsed(currentOrder.createdAt)}
                      </p>
                    </div>

                    {/* Customer Info Form */}
                    <div className="flex items-center space-x-2 text-xs">
                      <input
                        type="text"
                        placeholder="Guest Name"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="px-3 py-1.5 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 font-medium"
                      />
                      <input
                        type="tel"
                        placeholder="Phone"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="px-3 py-1.5 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white text-xs placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-teal-500 w-32 font-mono"
                      />
                    </div>
                  </div>

                  {/* Itemized Order Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-500 dark:text-slate-400 border-b border-pos-border font-display">
                        <tr>
                          <th className="py-2.5 font-bold">Item Description</th>
                          <th className="py-2.5 text-center font-bold">Qty</th>
                          <th className="py-2.5 text-right font-bold">Price</th>
                          <th className="py-2.5 text-right font-bold">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-pos-border/50">
                        {(currentOrder.items || []).map((item, idx) => (
                          <tr key={idx} className="hover:bg-pos-card-hover transition-colors">
                            <td className="py-2.5 text-slate-900 dark:text-slate-100 font-semibold">
                              <div className="flex items-center space-x-1.5">
                                <span>{item.name}</span>
                                {item.kotNumber && (
                                  <span className="text-[9px] text-slate-500 font-mono">({item.kotNumber})</span>
                                )}
                              </div>
                              {item.notes && (
                                <span className="text-[10px] text-amber-600 dark:text-amber-300 italic font-medium">Note: {item.notes}</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center font-black text-slate-900 dark:text-slate-100 font-num">{item.quantity}</td>
                            <td className="py-2.5 text-right text-slate-500 dark:text-slate-400 font-num">
                              {currencySymbol}{item.price?.toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right font-black text-slate-900 dark:text-slate-100 font-num">
                              {currencySymbol}{(item.itemTotal || (item.price * item.quantity))?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Breakdown & Discounts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3.5 border-t border-pos-border">
                    {/* Discount Tool with Petpooja fast presets */}
                    <div className="p-3.5 bg-pos-dark rounded-2xl border border-pos-border space-y-2.5 text-xs shadow-inner">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 dark:text-slate-300 font-display">Bill Discount & Promotions</label>
                        {discountType && (
                          <button
                            type="button"
                            onClick={() => { setDiscountType(null); setDiscountValue(0); }}
                            className="text-[10px] text-rose-600 dark:text-rose-400 font-bold hover:underline"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {[
                          { type: 'PERCENT', val: 5, label: '5%' },
                          { type: 'PERCENT', val: 10, label: '10%' },
                          { type: 'PERCENT', val: 15, label: '15%' },
                          { type: 'PERCENT', val: 20, label: '20%' },
                          { type: 'FLAT', val: 50, label: '₹50 Off' },
                          { type: 'FLAT', val: 100, label: '₹100 Off' }
                        ].map((preset) => (
                          <button
                            key={`${preset.type}-${preset.val}`}
                            type="button"
                            onClick={() => {
                              setDiscountType(preset.type);
                              setDiscountValue(preset.val);
                            }}
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all pos-btn-touch ${
                              discountType === preset.type && Number(discountValue) === preset.val
                                ? 'bg-amber-500 border-amber-400 text-slate-950 font-black shadow-sm'
                                : 'bg-pos-surface border-pos-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center space-x-2 pt-1 border-t border-pos-border/40">
                        <button
                          type="button"
                          onClick={() => { setDiscountType(discountType === 'PERCENT' ? null : 'PERCENT'); }}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all pos-btn-touch ${
                            discountType === 'PERCENT'
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-black'
                              : 'bg-pos-surface border-pos-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Custom %
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDiscountType(discountType === 'FLAT' ? null : 'FLAT'); }}
                          className={`px-2.5 py-1 rounded-xl text-[11px] font-extrabold border transition-all pos-btn-touch ${
                            discountType === 'FLAT'
                              ? 'bg-amber-500 border-amber-400 text-slate-950 font-black'
                              : 'bg-pos-surface border-pos-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          Custom ₹
                        </button>
                        {discountType && (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder={discountType === 'PERCENT' ? 'e.g. 10%' : 'e.g. 50'}
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value)}
                            className="w-24 px-2.5 py-1 bg-pos-surface border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white font-num font-bold focus:outline-none focus:border-amber-500"
                          />
                        )}
                      </div>
                    </div>

                    {/* Calculated Price Box */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>Items Subtotal:</span>
                        <span className="font-num text-slate-800 dark:text-slate-200 font-bold">{currencySymbol}{billingCalculations.subtotal.toFixed(2)}</span>
                      </div>
                      {billingCalculations.discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                          <span>Discount Applied:</span>
                          <span className="font-num">-{currencySymbol}{billingCalculations.discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-500 dark:text-slate-400">
                        <span>{taxName || 'GST'} ({restaurant?.taxRate ?? 5}%):</span>
                        <span className="font-num text-slate-800 dark:text-slate-200">{currencySymbol}{billingCalculations.taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-black text-slate-900 dark:text-white pt-2 border-t border-pos-border">
                        <span className="text-amber-600 dark:text-amber-400 font-display">Payable Grand Total:</span>
                        <span className="font-num text-2xl text-amber-600 dark:text-amber-400 font-black">
                          {currencySymbol}{billingCalculations.grandTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Payment Settlement Terminal */}
                <form onSubmit={handleSettleOrder} className="p-5 pos-surface-glass rounded-3xl shadow-xl space-y-4 border border-pos-border">
                  <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-200 flex items-center justify-between font-display">
                    <span>Payment Mode & Tendered Amount</span>
                    <span className="text-base text-amber-600 dark:text-amber-400 font-num font-black">
                      Total: {currencySymbol}{billingCalculations.grandTotal.toFixed(2)}
                    </span>
                  </h3>

                  {/* 3 Payment Tabs: Cash, UPI, Card */}
                  <div className="grid grid-cols-3 gap-2 p-1 bg-pos-dark border border-pos-border rounded-2xl">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-extrabold transition-all pos-btn-touch ${
                        paymentMethod === 'CASH'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-pos-glow'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      <span>Cash</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-extrabold transition-all pos-btn-touch ${
                        paymentMethod === 'UPI'
                          ? 'bg-gradient-to-r from-teal-600 to-cyan-600 text-white shadow-pos-glow'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>UPI / QR</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CARD')}
                      className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-extrabold transition-all pos-btn-touch ${
                        paymentMethod === 'CARD'
                          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Card / POS</span>
                    </button>
                  </div>

                  {/* Payment Details Form based on method */}
                  <div className="p-4 bg-pos-dark rounded-2xl border border-pos-border shadow-inner">
                    {/* CASH MODE */}
                    {paymentMethod === 'CASH' && (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 font-display">
                              Cash Received Amount ({currencySymbol}) *
                            </label>
                            <input
                              type="number"
                              step="any"
                              required
                              value={cashReceived}
                              onChange={(e) => setCashReceived(e.target.value)}
                              placeholder={`e.g. ${billingCalculations.grandTotal}`}
                              className="w-full px-3.5 py-2.5 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-num font-bold text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 font-display">
                              Change to Return ({currencySymbol})
                            </label>
                            <div className="w-full px-3.5 py-2.5 bg-pos-surface border border-pos-border rounded-xl text-emerald-600 dark:text-emerald-400 font-num font-black text-sm flex items-center justify-between">
                              <span>Change:</span>
                              <span className="text-base">{currencySymbol}{cashChange.toFixed(2)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Quick Cash Buttons */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <span className="text-slate-500 text-[11px] font-mono">Quick Cash:</span>
                          <button
                            type="button"
                            onClick={() => setCashReceived(String(billingCalculations.grandTotal))}
                            className="px-3 py-1.5 bg-pos-surface hover:bg-pos-card text-slate-700 dark:text-slate-200 rounded-xl text-[11px] font-num font-bold border border-pos-border pos-btn-touch shadow-sm"
                          >
                            Exact ({currencySymbol}{billingCalculations.grandTotal})
                          </button>
                          {[100, 200, 500, 1000, 2000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setCashReceived(String(amt))}
                              className="px-2.5 py-1.5 bg-pos-surface hover:bg-pos-card text-slate-700 dark:text-slate-300 rounded-xl text-[11px] font-num font-bold border border-pos-border pos-btn-touch shadow-sm"
                            >
                              {currencySymbol}{amt}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* UPI MODE */}
                    {paymentMethod === 'UPI' && (
                      <div className="flex flex-col sm:flex-row items-center gap-4 text-xs">
                        <div className="p-2.5 bg-white rounded-2xl shadow-md shrink-0">
                          <img
                            src={upiQrImageUrl}
                            alt="Dynamic UPI QR Code"
                            className="w-32 h-32 object-contain"
                          />
                        </div>
                        <div className="space-y-2.5 flex-1">
                          <div>
                            <p className="font-extrabold text-slate-900 dark:text-slate-100 text-sm font-display">Scan QR Code on any UPI App</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">Google Pay, PhonePe, Paytm, BHIM</p>
                            <p className="text-sm font-num font-black text-teal-600 dark:text-teal-400 mt-1">
                              Payable: {currencySymbol}{billingCalculations.grandTotal.toFixed(2)}
                            </p>
                          </div>

                          <div>
                            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 font-display">
                              UPI Reference / UTR Number (Optional)
                            </label>
                            <input
                              type="text"
                              value={upiRefNumber}
                              onChange={(e) => setUpiRefNumber(e.target.value)}
                              placeholder="e.g. 423910482910"
                              className="w-full px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-mono text-xs focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD MODE */}
                    {paymentMethod === 'CARD' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 font-display">Card Network</label>
                          <select
                            value={cardType}
                            onChange={(e) => setCardType(e.target.value)}
                            className="w-full px-3 py-2.5 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-semibold focus:outline-none focus:border-blue-500"
                          >
                            <option value="VISA">Visa Card</option>
                            <option value="MASTERCARD">Mastercard</option>
                            <option value="RUPAY">RuPay Card</option>
                            <option value="AMEX">American Express</option>
                            <option value="DEBIT">Debit Card / Other</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 font-display">Card Last 4 Digits (Optional)</label>
                          <input
                            type="text"
                            maxLength={4}
                            value={cardLast4}
                            onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                            placeholder="e.g. 4242"
                            className="w-full px-3.5 py-2.5 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-num font-bold text-sm focus:outline-none focus:border-blue-500"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Settle Action Buttons */}
                  <div className="flex items-center justify-end space-x-3 pt-2">
                    <button
                      type="submit"
                      disabled={isSettling}
                      className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-sm shadow-pos-glow flex items-center space-x-2 transition-all disabled:opacity-50 pos-btn-touch"
                    >
                      {isSettling ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-200" />
                          <span>Settle {currencySymbol}{billingCalculations.grandTotal.toFixed(2)} & Print Receipt</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SETTLED INVOICES ARCHIVE */}
      {activeTab === 'SETTLED_INVOICES' && (
        <div className="space-y-4">
          <div className="p-3 pos-surface-glass rounded-2xl max-w-md shadow-lg flex items-center space-x-2.5 border border-pos-border">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search invoice #, customer phone, order #..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none font-medium"
            />
          </div>

          <div className="pos-surface-glass rounded-3xl overflow-hidden shadow-xl border border-pos-border">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-pos-card text-slate-500 dark:text-slate-400 border-b border-pos-border font-display">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Invoice #</th>
                    <th className="py-3.5 px-4 font-bold">Date & Time</th>
                    <th className="py-3.5 px-4 font-bold">Table / Order</th>
                    <th className="py-3.5 px-4 font-bold">Guest</th>
                    <th className="py-3.5 px-4 font-bold">Payment Mode</th>
                    <th className="py-3.5 px-4 font-bold">Total Amount</th>
                    <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-pos-border/50">
                  {invoicesLoading ? (
                    <tr>
                      <td colSpan="7" className="py-14 text-center text-slate-400">Loading invoices...</td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-14 text-center text-slate-400">
                        No settled invoices found.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-pos-card-hover transition-colors">
                        <td className="py-3.5 px-4 font-black text-slate-900 dark:text-slate-100 font-num">{inv.invoiceNumber}</td>
                        <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                          <div>{new Date(inv.issuedAt || Date.now()).toLocaleDateString()}</div>
                          <div className="text-[10px] font-mono">
                            {new Date(inv.issuedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          <span className="font-extrabold text-teal-600 dark:text-teal-400 font-display">Table {inv.tableNumber || '—'}</span>
                          <div className="text-[10px] text-slate-400 font-mono">{inv.orderNumber}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                          <span className="font-semibold">{inv.customerName || 'Walk-in Guest'}</span>
                          {inv.customerPhone && <div className="text-[10px] text-slate-400 font-mono">{inv.customerPhone}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold font-mono ${
                            inv.paymentMethod === 'UPI'
                              ? 'bg-teal-100 dark:bg-teal-950 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800'
                              : inv.paymentMethod === 'CARD'
                              ? 'bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800'
                              : 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                          }`}>
                            {inv.paymentMethod || 'CASH'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400 text-sm font-num">
                          {currencySymbol}{inv.totalAmount?.toFixed(2)}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={() => {
                              setSettledInvoice({
                                ...inv,
                                order: {
                                  orderNumber: inv.orderNumber,
                                  table: inv.tableNumber ? { tableNumber: inv.tableNumber } : null,
                                  items: inv.items || []
                                }
                              });
                              setIsInvoiceModalOpen(true);
                            }}
                            className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white font-bold text-xs inline-flex items-center space-x-1.5 shadow-pos-glow pos-btn-touch"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>Reprint Receipt</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Printable Invoice Modal */}
      {settledInvoice && (
        <InvoiceModal
          isOpen={isInvoiceModalOpen}
          onClose={() => {
            setIsInvoiceModalOpen(false);
            setSettledInvoice(null);
          }}
          invoice={settledInvoice}
          order={settledInvoice.order}
        />
      )}
    </div>
  );
}
