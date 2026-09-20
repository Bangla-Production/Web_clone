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
      setTables(liveTables);
      setLoading(false);
    });

    const unsubOrders = subscribeToActiveOrders(activeRestaurantId, (liveOrders) => {
      setActiveOrders(liveOrders);
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
      setInvoices(list);
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
      // Pick first bill-requested table, or first active table
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

  // QR Code Image Generator URL (QuickChart / Google Chart API safe fallback)
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

      // Open printable invoice modal (the service returns the invoice itself)
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
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-md">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-teal-950/80 border border-teal-700/60 text-teal-400 shadow">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
              <span>Cashier Billing & Settlement Terminal</span>
              <span className="text-[11px] bg-teal-950/60 border border-teal-600/80 text-teal-300 font-semibold px-2 py-0.5 rounded-full">
                {activeBillingTables.length} Tables to Settle
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Live table bill calculations, price breakdown, Cash/UPI/Card payment settlements ({activeRestaurantId})
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1 rounded-xl border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('LIVE_BILLING')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'LIVE_BILLING'
                ? 'bg-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Banknote className="w-3.5 h-3.5" />
            <span>Live Table Billing</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SETTLED_INVOICES')}
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'SETTLED_INVOICES'
                ? 'bg-teal-600 text-white shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Settled Invoices Archive</span>
          </button>
        </div>
      </div>

      {/* TAB 1: LIVE TABLE BILLING */}
      {activeTab === 'LIVE_BILLING' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* Left Column: Tables with Active Bills (4 cols) */}
          <div className="lg:col-span-4 space-y-3">
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl shadow">
              <h2 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Active Floor Tables ({activeBillingTables.length})</span>
                <span className="text-[10px] text-teal-400 font-medium">Click table to bill</span>
              </h2>

              {loading ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  <div className="w-6 h-6 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-2"></div>
                  Syncing live tables...
                </div>
              ) : activeBillingTables.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs bg-slate-950/40 rounded-xl border border-dashed border-slate-800 p-4">
                  <Utensils className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
                  <p className="font-semibold text-slate-400">No active orders pending billing.</p>
                  <p className="text-[11px] text-slate-600 mt-1">When waiters punch orders or request bills, tables will appear here for settlement.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-[calc(100vh-16rem)] overflow-y-auto pr-1">
                  {activeBillingTables.map((tbl) => {
                    const isSelected = tbl.id === selectedTableId;
                    const isBillReq = tbl.status === 'BILL_REQUESTED';
                    const activeOrd = tbl.activeOrder;

                    return (
                      <div
                        key={tbl.id}
                        onClick={() => setSelectedTableId(tbl.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-teal-950/40 border-teal-500 shadow-md ring-1 ring-teal-500'
                            : isBillReq
                            ? 'bg-purple-950/30 border-purple-600 hover:border-purple-400 animate-pulse'
                            : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex items-center space-x-2">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${
                              isBillReq ? 'bg-purple-600 text-white' : 'bg-slate-800 text-teal-400'
                            }`}>
                              T{tbl.tableNumber}
                            </div>
                            <div>
                              <h3 className="font-bold text-sm text-white flex items-center space-x-1.5">
                                <span>Table {tbl.tableNumber}</span>
                                {isBillReq && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-900 text-purple-200 border border-purple-600">
                                    Bill Requested
                                  </span>
                                )}
                              </h3>
                              <p className="text-[10px] text-slate-400 flex items-center space-x-1">
                                <User className="w-3 h-3 text-slate-500" />
                                <span>Waiter: {activeOrd?.waiterName || 'Staff'}</span>
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-sm font-bold text-emerald-400 font-mono">
                              {currencySymbol}{activeOrd?.totalAmount ? activeOrd.totalAmount.toFixed(2) : '0.00'}
                            </div>
                            <span className="text-[10px] text-slate-500 flex items-center justify-end space-x-1">
                              <Clock className="w-2.5 h-2.5" />
                              <span>{getTimeElapsed(activeOrd?.createdAt || activeOrd?.claimedAt)}</span>
                            </span>
                          </div>
                        </div>

                        {activeOrd?.orderNumber && (
                          <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                            <span className="font-mono text-slate-500">#{activeOrd.orderNumber}</span>
                            <span className="text-teal-400 font-medium flex items-center space-x-1">
                              <span>Ready to settle</span>
                              <ChevronRight className="w-3 h-3" />
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
              <div className="p-12 text-center text-slate-500 bg-slate-900 border border-slate-800 rounded-2xl">
                <Receipt className="w-12 h-12 mx-auto text-slate-600 mb-3 opacity-40" />
                <h3 className="font-bold text-sm text-slate-300">Select a table on the left to begin billing</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  The Cashier panel will automatically calculate total price, items, and taxes, and let you accept payment via Cash, UPI, or Card.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Order Summary Card */}
                <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800 gap-2">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2.5 py-1 rounded-lg bg-teal-600 text-white font-bold text-xs">
                          Table {currentTable.tableNumber}
                        </span>
                        <span className="font-mono text-xs text-slate-300 font-semibold">
                          Order #{currentOrder.orderNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                          {currentOrder.orderType || 'DINE_IN'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Punched by Waiter: <strong className="text-slate-200">{currentOrder.waiterName || 'Staff'}</strong> • {getTimeElapsed(currentOrder.createdAt)}
                      </p>
                    </div>

                    {/* Customer Info Form */}
                    <div className="flex items-center space-x-2 text-xs">
                      <input
                        type="text"
                        placeholder="Guest Name (Optional)"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs placeholder-slate-600 focus:outline-none focus:border-teal-500"
                      />
                      <input
                        type="tel"
                        placeholder="Phone (Optional)"
                        value={customerPhone}
                        onChange={(e) => setCustomerPhone(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-white text-xs placeholder-slate-600 focus:outline-none focus:border-teal-500 w-32 font-mono"
                      />
                    </div>
                  </div>

                  {/* Itemized Order Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-slate-400 border-b border-slate-800">
                        <tr>
                          <th className="py-2 font-semibold">Item & Details</th>
                          <th className="py-2 text-center font-semibold">Qty</th>
                          <th className="py-2 text-right font-semibold">Unit Price</th>
                          <th className="py-2 text-right font-semibold">Total Price</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {(currentOrder.items || []).map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/20">
                            <td className="py-2.5 text-slate-200 font-medium">
                              <div className="flex items-center space-x-1.5">
                                <span>{item.name}</span>
                                {item.kotNumber && (
                                  <span className="text-[9px] text-slate-500 font-mono">({item.kotNumber})</span>
                                )}
                              </div>
                              {item.notes && (
                                <span className="text-[10px] text-amber-400 italic">Note: {item.notes}</span>
                              )}
                            </td>
                            <td className="py-2.5 text-center font-bold text-slate-100">{item.quantity}</td>
                            <td className="py-2.5 text-right text-slate-400 font-mono">
                              {currencySymbol}{item.price?.toFixed(2)}
                            </td>
                            <td className="py-2.5 text-right font-bold text-slate-100 font-mono">
                              {currencySymbol}{(item.itemTotal || (item.price * item.quantity))?.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Financial Breakdown & Discounts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                    {/* Discount Tool */}
                    <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
                      <label className="block font-semibold text-slate-300">Apply Bill Discount</label>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => { setDiscountType(discountType === 'PERCENT' ? null : 'PERCENT'); }}
                          className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                            discountType === 'PERCENT'
                              ? 'bg-teal-600 border-teal-500 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          % Percent
                        </button>
                        <button
                          type="button"
                          onClick={() => { setDiscountType(discountType === 'FLAT' ? null : 'FLAT'); }}
                          className={`px-2 py-1 rounded text-[11px] font-bold border transition-colors ${
                            discountType === 'FLAT'
                              ? 'bg-teal-600 border-teal-500 text-white'
                              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                          }`}
                        >
                          {currencySymbol} Flat Off
                        </button>
                        {discountType && (
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder={discountType === 'PERCENT' ? 'e.g. 10%' : 'e.g. 50'}
                            value={discountValue}
                            onChange={(e) => setDiscountValue(e.target.value)}
                            className="w-24 px-2 py-1 bg-slate-900 border border-slate-700 rounded text-xs text-white font-mono focus:outline-none focus:border-teal-500"
                          />
                        )}
                      </div>
                    </div>

                    {/* Calculated Price Box */}
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between text-slate-400">
                        <span>Items Subtotal:</span>
                        <span className="font-mono text-slate-200">{currencySymbol}{billingCalculations.subtotal.toFixed(2)}</span>
                      </div>
                      {billingCalculations.discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-400 font-semibold">
                          <span>Discount Applied:</span>
                          <span className="font-mono">-{currencySymbol}{billingCalculations.discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-slate-400">
                        <span>{taxName || 'GST'} ({restaurant?.taxRate ?? 5}%):</span>
                        <span className="font-mono text-slate-200">{currencySymbol}{billingCalculations.taxAmount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-sm font-bold text-white pt-2 border-t border-slate-800">
                        <span className="text-teal-400">Grand Total Price:</span>
                        <span className="font-mono text-lg text-emerald-400">
                          {currencySymbol}{billingCalculations.grandTotal.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Payment Settlement Terminal */}
                <form onSubmit={handleSettleOrder} className="p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
                  <h3 className="font-bold text-sm text-slate-200 flex items-center justify-between">
                    <span>Payment Method & Final Settlement</span>
                    <span className="text-xs text-emerald-400 font-mono font-bold">
                      Payable: {currencySymbol}{billingCalculations.grandTotal.toFixed(2)}
                    </span>
                  </h3>

                  {/* 3 Payment Tabs: Cash, UPI, Card */}
                  <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        paymentMethod === 'CASH'
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Banknote className="w-4 h-4" />
                      <span>Cash Payment</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('UPI')}
                      className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        paymentMethod === 'UPI'
                          ? 'bg-teal-600 text-white shadow-lg shadow-teal-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <QrCode className="w-4 h-4" />
                      <span>UPI / QR Code</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CARD')}
                      className={`flex items-center justify-center space-x-2 py-2.5 rounded-lg text-xs font-bold transition-all ${
                        paymentMethod === 'CARD'
                          ? 'bg-blue-600 text-white shadow-lg shadow-blue-950'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Card Payment</span>
                    </button>
                  </div>

                  {/* Payment Details Form based on method */}
                  <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-xl">
                    {/* CASH MODE */}
                    {paymentMethod === 'CASH' && (
                      <div className="space-y-3 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block font-semibold text-slate-300 mb-1">
                              Cash Received Amount ({currencySymbol}) *
                            </label>
                            <input
                              type="number"
                              step="any"
                              required
                              value={cashReceived}
                              onChange={(e) => setCashReceived(e.target.value)}
                              placeholder={`e.g. ${billingCalculations.grandTotal}`}
                              className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-300 mb-1">
                              Change to Return ({currencySymbol})
                            </label>
                            <div className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg text-emerald-400 font-mono font-bold text-sm">
                              {currencySymbol}{cashChange.toFixed(2)}
                            </div>
                          </div>
                        </div>

                        {/* Quick Cash Buttons */}
                        <div className="flex items-center space-x-2 pt-1">
                          <span className="text-slate-500 text-[11px]">Exact:</span>
                          <button
                            type="button"
                            onClick={() => setCashReceived(String(billingCalculations.grandTotal))}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] font-mono font-semibold"
                          >
                            Exact ({currencySymbol}{billingCalculations.grandTotal})
                          </button>
                          {[100, 200, 500, 1000, 2000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setCashReceived(String(amt))}
                              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[11px] font-mono"
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
                        <div className="p-2 bg-white rounded-xl shadow-md shrink-0">
                          <img
                            src={upiQrImageUrl}
                            alt="Dynamic UPI QR Code"
                            className="w-32 h-32 object-contain"
                          />
                        </div>
                        <div className="space-y-2.5 flex-1">
                          <div>
                            <p className="font-bold text-slate-200">Scan QR Code via any UPI App</p>
                            <p className="text-[11px] text-slate-400">GPay, PhonePe, Paytm, BHIM</p>
                            <p className="text-xs font-mono font-bold text-teal-400 mt-1">
                              Amount: {currencySymbol}{billingCalculations.grandTotal.toFixed(2)}
                            </p>
                          </div>

                          <div>
                            <label className="block font-semibold text-slate-300 mb-1">
                              UPI Reference / UTR Number (Optional)
                            </label>
                            <input
                              type="text"
                              value={upiRefNumber}
                              onChange={(e) => setUpiRefNumber(e.target.value)}
                              placeholder="e.g. 423910482910"
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-xs focus:outline-none focus:border-teal-500"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* CARD MODE */}
                    {paymentMethod === 'CARD' && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">Card Network / Type</label>
                          <select
                            value={cardType}
                            onChange={(e) => setCardType(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                          >
                            <option value="VISA">Visa Card</option>
                            <option value="MASTERCARD">Mastercard</option>
                            <option value="RUPAY">RuPay Card</option>
                            <option value="AMEX">American Express</option>
                            <option value="DEBIT">Debit Card / Other</option>
                          </select>
                        </div>

                        <div>
                          <label className="block font-semibold text-slate-300 mb-1">Card Last 4 Digits (Optional)</label>
                          <input
                            type="text"
                            maxLength={4}
                            value={cardLast4}
                            onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, ''))}
                            placeholder="e.g. 4242"
                            className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono text-sm focus:outline-none focus:border-blue-500"
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
                      className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950 flex items-center space-x-2 transition-all disabled:opacity-50"
                    >
                      {isSettling ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Settle {currencySymbol}{billingCalculations.grandTotal.toFixed(2)} & Print Bill</span>
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
          <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl max-w-md shadow-md flex items-center space-x-2">
            <Search className="w-4 h-4 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Search invoice #, customer phone, order #..."
              value={invoiceSearch}
              onChange={(e) => setInvoiceSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Invoice #</th>
                    <th className="py-3 px-4 font-semibold">Date & Time</th>
                    <th className="py-3 px-4 font-semibold">Table / Order</th>
                    <th className="py-3 px-4 font-semibold">Guest</th>
                    <th className="py-3 px-4 font-semibold">Payment Mode</th>
                    <th className="py-3 px-4 font-semibold">Total Amount</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {invoicesLoading ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-400">Loading invoices...</td>
                    </tr>
                  ) : filteredInvoices.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="py-12 text-center text-slate-500">
                        No settled invoices found.
                      </td>
                    </tr>
                  ) : (
                    filteredInvoices.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-100 font-mono">{inv.invoiceNumber}</td>
                        <td className="py-3.5 px-4 text-slate-400">
                          <div>{new Date(inv.issuedAt || Date.now()).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-500">
                            {new Date(inv.issuedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          <span className="font-semibold text-teal-400">Table {inv.tableNumber || '—'}</span>
                          <div className="text-[10px] text-slate-500 font-mono">{inv.orderNumber}</div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          {inv.customerName || 'Walk-in Guest'}
                          {inv.customerPhone && <div className="text-[10px] text-slate-500">{inv.customerPhone}</div>}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            inv.paymentMethod === 'UPI'
                              ? 'bg-teal-950 text-teal-300 border border-teal-800'
                              : inv.paymentMethod === 'CARD'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          }`}>
                            {inv.paymentMethod || 'CASH'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm font-mono">
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
                            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs inline-flex items-center space-x-1.5 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" />
                            <span>View & Print</span>
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
