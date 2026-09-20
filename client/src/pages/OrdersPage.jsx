import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList,
  Search,
  Filter,
  Eye,
  CreditCard,
  XCircle,
  RefreshCw,
  Printer,
  CheckCircle2,
  Clock
} from 'lucide-react';
import {
  getOrders,
  settleAndReleaseTableAtomic,
  cancelOrderAtomic
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import InvoiceModal from '../components/invoice/InvoiceModal';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [paymentStatus, setPaymentStatus] = useState('');
  const [orderType, setOrderType] = useState('');

  // Selected Order for viewing details
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  // Settle Bill Modal state
  const [billOrder, setBillOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [referenceNo, setReferenceNo] = useState('');
  const [isPaying, setIsPaying] = useState(false);

  // Invoice view modal
  const [invoiceToView, setInvoiceToView] = useState(null);
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  const { activeRestaurantId, user } = useAuth();
  const { currencySymbol, restaurant } = useRestaurant();
  const toast = useToast();

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getOrders(activeRestaurantId);
      setOrders(list || []);
    } catch (err) {
      toast.error('Failed to load orders from Firestore.');
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleOpenDetails = (order) => {
    setSelectedOrder(order);
    setIsDetailsOpen(true);
  };

  const handleSettlePayment = async () => {
    if (!billOrder) return;
    try {
      setIsPaying(true);
      const invoiceData = await settleAndReleaseTableAtomic(activeRestaurantId, billOrder.id, {
        orderNumber: billOrder.orderNumber,
        orderType: billOrder.orderType,
        tableId: billOrder.tableId,
        tableNumber: billOrder.tableNumber,
        customerName: billOrder.customerName,
        customerPhone: billOrder.customerPhone,
        subtotal: billOrder.subtotal,
        discountAmount: billOrder.discountAmount,
        taxAmount: billOrder.taxAmount,
        totalAmount: billOrder.totalAmount,
        paymentMethod
      }, {
        uid: activeRestaurantId,
        name: 'Cashier',
        role: 'cashier'
      });

      toast.success(`Payment of ${currencySymbol}${billOrder.totalAmount} settled!`);
      setInvoiceToView({
        ...invoiceData,
        order: billOrder
      });
      setBillOrder(null);
      setIsInvoiceOpen(true);
      fetchOrders();
    } catch (err) {
      toast.error('Payment settlement failed: ' + (err.message || ''));
    } finally {
      setIsPaying(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await cancelOrderAtomic(activeRestaurantId, orderId, {
        uid: user?.uid,
        name: user?.name,
        role: user?.role
      });
      toast.success('Order cancelled.');
      fetchOrders();
      setIsDetailsOpen(false);
    } catch (err) {
      console.error('Cancel order failed:', err);
      const reason = err?.code === 'permission-denied'
        ? 'Permission denied - check your login and the published Firestore rules.'
        : (err?.message || '');
      toast.error(`Failed to cancel order. ${reason}`.trim());
      fetchOrders();
    }
  };

  const filtered = orders.filter((order) => {
    const matchesSearch =
      search === '' ||
      order.orderNumber?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerName?.toLowerCase().includes(search.toLowerCase()) ||
      order.customerPhone?.includes(search);
    const matchesStatus = orderStatus === '' || order.orderStatus === orderStatus;
    const matchesPayment = paymentStatus === '' || order.paymentStatus === paymentStatus;
    const matchesType = orderType === '' || order.orderType === orderType;

    return matchesSearch && matchesStatus && matchesPayment && matchesType;
  });

  return (
    <div className="space-y-5 transition-colors duration-200">
      {/* Top Bar */}
      <div className="pos-surface-glass p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-pos-border">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight font-display">
                Orders Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Track, inspect, and bill active table orders & takeaway tickets ({activeRestaurantId})
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchOrders}
          className="pos-btn-touch flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-card text-slate-700 dark:text-slate-200 text-xs font-bold border border-pos-border transition-colors self-start sm:self-auto shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
          <span>Refresh Orders</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="pos-surface-glass p-4 rounded-2xl flex flex-wrap items-center gap-3 border border-pos-border">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by order #, customer, table..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <select
          value={orderStatus}
          onChange={(e) => setOrderStatus(e.target.value)}
          className="px-3.5 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Order Statuses</option>
          <option value="CONFIRMED">Confirmed / New</option>
          <option value="PREPARING">Preparing</option>
          <option value="READY">Ready</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <select
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value)}
          className="px-3.5 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Payment Statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </select>

        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value)}
          className="px-3.5 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-700 dark:text-slate-200 font-medium focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Order Types</option>
          <option value="DINE_IN">Dine-In</option>
          <option value="TAKEAWAY">Takeaway</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="pos-card-glass rounded-2xl overflow-hidden shadow-xl border border-pos-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-pos-dark text-slate-500 dark:text-slate-400 border-b border-pos-border">
              <tr>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Order #</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Date & Time</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Type / Table</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Items</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Grand Total</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Kitchen Status</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Payment</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-border/40">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-400">
                    <div className="w-8 h-8 border-3 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2"></div>
                    Loading orders from cloud Firestore...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-16 text-center text-slate-400 font-medium">
                    No matching orders found.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-pos-card-hover transition-colors">
                    <td className="py-3.5 px-4 font-extrabold text-slate-900 dark:text-white font-num">#{order.orderNumber}</td>
                    <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400">
                      <div>{new Date(order.createdAt).toLocaleDateString()}</div>
                      <div className="text-[10px] font-num">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {order.orderType === 'DINE_IN' ? (
                        <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-pos-dark text-amber-800 dark:text-slate-200 font-bold border border-amber-300 dark:border-pos-border">
                          {order.tableNumber || 'Dine-In'}
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 font-bold border border-blue-300 dark:border-blue-800/60">
                          Takeaway
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                      {order.items?.length || 0} items
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400 text-sm font-num">
                      {currencySymbol}{order.totalAmount?.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                          order.orderStatus === 'CONFIRMED'
                            ? 'bg-amber-100 dark:bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
                            : order.orderStatus === 'PREPARING'
                            ? 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-500/30'
                            : order.orderStatus === 'READY'
                            ? 'bg-teal-100 dark:bg-teal-500/15 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-500/30'
                            : order.orderStatus === 'COMPLETED'
                            ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                            : 'bg-rose-100 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
                        }`}
                      >
                        {order.orderStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${
                          order.paymentStatus === 'PAID'
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40'
                            : 'bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-500/40'
                        }`}
                      >
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenDetails(order)}
                        className="pos-btn-touch p-2 rounded-xl bg-pos-dark hover:bg-pos-card text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-pos-border inline-flex items-center justify-center shadow-sm"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {order.paymentStatus === 'UNPAID' && order.orderStatus !== 'CANCELLED' && (
                        <button
                          onClick={() => setBillOrder(order)}
                          className="pos-btn-touch px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-pos-glow inline-flex items-center space-x-1.5"
                        >
                          <CreditCard className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Settle Bill</span>
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Order Details Drawer Modal */}
      {isDetailsOpen && selectedOrder && (
        <Modal
          isOpen={isDetailsOpen}
          onClose={() => setIsDetailsOpen(false)}
          title={`Order Details #${selectedOrder.orderNumber}`}
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-pos-dark rounded-xl border border-pos-border">
              <div>
                <span className="text-slate-500 block text-[10px]">Type</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.orderType}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Table</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedOrder.tableNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Status</span>
                <span className="font-bold text-amber-600 dark:text-amber-400">{selectedOrder.orderStatus}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Payment</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{selectedOrder.paymentStatus}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-2">Ordered Items:</h4>
              <div className="border border-pos-border rounded-lg overflow-hidden divide-y divide-pos-border">
                {selectedOrder.items?.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-pos-card flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">{item.name}</span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2">x{item.quantity}</span>
                      {item.notes && <p className="text-[11px] text-amber-600 dark:text-amber-300">Note: {item.notes}</p>}
                    </div>
                    <span className="font-bold text-slate-900 dark:text-slate-200">
                      {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-pos-dark rounded-xl border border-pos-border space-y-1">
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>Subtotal:</span>
                <span>{currencySymbol}{selectedOrder.subtotal?.toFixed(2)}</span>
              </div>
              {selectedOrder.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Discount:</span>
                  <span>- {currencySymbol}{selectedOrder.discountAmount?.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500 dark:text-slate-400">
                <span>{restaurant?.taxName || 'GST'} ({selectedOrder.taxRate}%):</span>
                <span>{currencySymbol}{selectedOrder.taxAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-slate-900 dark:text-white pt-1 border-t border-pos-border">
                <span>Total Amount:</span>
                <span className="text-emerald-600 dark:text-emerald-400">{currencySymbol}{selectedOrder.totalAmount?.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-pos-border">
              {selectedOrder.orderStatus !== 'CANCELLED' && selectedOrder.paymentStatus === 'UNPAID' ? (
                <button
                  onClick={() => handleCancelOrder(selectedOrder.id)}
                  className="px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 hover:bg-rose-200 border border-rose-300 dark:border-rose-800 font-semibold"
                >
                  Cancel Order
                </button>
              ) : <div />}

              {selectedOrder.paymentStatus === 'UNPAID' && selectedOrder.orderStatus !== 'CANCELLED' && (
                <button
                  onClick={() => {
                    setIsDetailsOpen(false);
                    setBillOrder(selectedOrder);
                  }}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Settle Payment
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* Settle Bill Modal */}
      {billOrder && (
        <Modal
          isOpen={!!billOrder}
          onClose={() => setBillOrder(null)}
          title={`Settle Bill #${billOrder.orderNumber}`}
          maxWidth="max-w-md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-pos-dark rounded-xl border border-pos-border text-center">
              <span className="text-xs text-slate-500 dark:text-slate-400">Total Payable</span>
              <h2 className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                {currencySymbol}{billOrder.totalAmount?.toFixed(2)}
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Payment Method:</label>
              <div className="grid grid-cols-3 gap-2">
                {['CASH', 'CARD', 'UPI'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2 rounded-lg font-bold text-xs border transition-all ${
                      paymentMethod === m
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-pos-dark border-pos-border text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                onClick={() => setBillOrder(null)}
                className="flex-1 py-2.5 rounded-lg bg-pos-card text-slate-700 dark:text-slate-300 font-semibold text-xs hover:bg-pos-card-hover border border-pos-border"
              >
                Cancel
              </button>
              <button
                disabled={isPaying}
                onClick={handleSettlePayment}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/40"
              >
                {isPaying ? 'Processing...' : 'Complete Payment & Print'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Invoice Modal */}
      {isInvoiceOpen && invoiceToView && (
        <InvoiceModal
          isOpen={isInvoiceOpen}
          onClose={() => setIsInvoiceOpen(false)}
          invoice={invoiceToView}
        />
      )}
    </div>
  );
}
