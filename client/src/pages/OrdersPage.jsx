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
  updateOrderStatus
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

  const { activeRestaurantId } = useAuth();
  const { currencySymbol, restaurant } = useRestaurant();
  const toast = useToast();

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getOrders(activeRestaurantId);
      setOrders(list);
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

  const handleCancelOrder = async (orderId, tableId) => {
    if (!window.confirm('Cancel this order?')) return;
    try {
      await updateOrderStatus(activeRestaurantId, orderId, 'CANCELLED', tableId);
      toast.success('Order cancelled.');
      fetchOrders();
      setIsDetailsOpen(false);
    } catch (err) {
      toast.error('Failed to cancel order.');
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
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Orders Management</h1>
          <p className="text-xs text-slate-400">Track, manage, and bill live and past dining orders ({activeRestaurantId})</p>
        </div>
        <button
          onClick={fetchOrders}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh Orders</span>
        </button>
      </div>

      {/* Filter Row */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center gap-3 shadow-md">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by order #, customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <select
          value={orderStatus}
          onChange={(e) => setOrderStatus(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
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
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Payment Statuses</option>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </select>

        <select
          value={orderType}
          onChange={(e) => setOrderType(e.target.value)}
          className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="">All Order Types</option>
          <option value="DINE_IN">Dine-In</option>
          <option value="TAKEAWAY">Takeaway</option>
        </select>
      </div>

      {/* Orders Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Order #</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Type / Table</th>
                <th className="py-3 px-4 font-semibold">Items</th>
                <th className="py-3 px-4 font-semibold">Grand Total</th>
                <th className="py-3 px-4 font-semibold">Kitchen Status</th>
                <th className="py-3 px-4 font-semibold">Payment</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-400">Loading orders from Firestore...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="py-12 text-center text-slate-500">
                    No orders found. Create an order in POS!
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-100">{order.orderNumber}</td>
                    <td className="py-3.5 px-4 text-slate-400">
                      <div>{new Date(order.createdAt).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      {order.orderType === 'DINE_IN' ? (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold border border-slate-700">
                          {order.tableNumber || 'Dine-In'}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-semibold border border-blue-800">
                          Takeaway
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-medium">
                      {order.items?.length || 0} items
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                      {currencySymbol}{order.totalAmount?.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.orderStatus === 'CONFIRMED'
                            ? 'bg-amber-900/60 text-amber-300 border border-amber-700/50'
                            : order.orderStatus === 'PREPARING'
                            ? 'bg-blue-900/60 text-blue-300 border border-blue-700/50'
                            : order.orderStatus === 'READY'
                            ? 'bg-teal-900/60 text-teal-300 border border-teal-700/50'
                            : order.orderStatus === 'COMPLETED'
                            ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                            : 'bg-rose-900/60 text-rose-300 border border-rose-700/50'
                        }`}
                      >
                        {order.orderStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          order.paymentStatus === 'PAID'
                            ? 'bg-emerald-900/80 text-emerald-200 border border-emerald-700'
                            : 'bg-rose-900/80 text-rose-200 border border-rose-700'
                        }`}
                      >
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleOpenDetails(order)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="View Details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {order.paymentStatus === 'UNPAID' && order.orderStatus !== 'CANCELLED' && (
                        <button
                          onClick={() => setBillOrder(order)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow inline-flex items-center space-x-1"
                        >
                          <CreditCard className="w-3 h-3" />
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
              <div>
                <span className="text-slate-500 block text-[10px]">Type</span>
                <span className="font-bold text-slate-200">{selectedOrder.orderType}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Table</span>
                <span className="font-bold text-slate-200">{selectedOrder.tableNumber || 'N/A'}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Status</span>
                <span className="font-bold text-amber-400">{selectedOrder.orderStatus}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">Payment</span>
                <span className="font-bold text-emerald-400">{selectedOrder.paymentStatus}</span>
              </div>
            </div>

            <div>
              <h4 className="font-bold text-slate-300 mb-2">Ordered Items:</h4>
              <div className="border border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-800">
                {selectedOrder.items?.map((item, idx) => (
                  <div key={idx} className="p-2.5 bg-slate-950 flex justify-between items-center">
                    <div>
                      <span className="font-semibold text-slate-100">{item.name}</span>
                      <span className="text-slate-400 ml-2">x{item.quantity}</span>
                      {item.notes && <p className="text-[11px] text-amber-300/80">Note: {item.notes}</p>}
                    </div>
                    <span className="font-bold text-slate-200">
                      {currencySymbol}{(item.price * item.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Subtotal:</span>
                <span>{currencySymbol}{selectedOrder.subtotal?.toFixed(2)}</span>
              </div>
              {selectedOrder.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400">
                  <span>Discount:</span>
                  <span>- {currencySymbol}{selectedOrder.discountAmount?.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-400">
                <span>{restaurant?.taxName || 'GST'} ({selectedOrder.taxRate}%):</span>
                <span>{currencySymbol}{selectedOrder.taxAmount?.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-white pt-1 border-t border-slate-800">
                <span>Total Amount:</span>
                <span className="text-emerald-400">{currencySymbol}{selectedOrder.totalAmount?.toFixed(2)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800">
              {selectedOrder.orderStatus !== 'CANCELLED' && selectedOrder.paymentStatus === 'UNPAID' ? (
                <button
                  onClick={() => handleCancelOrder(selectedOrder.id, selectedOrder.tableId)}
                  className="px-3 py-1.5 rounded-lg bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 font-semibold"
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
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-center">
              <span className="text-xs text-slate-400">Total Payable</span>
              <h2 className="text-2xl font-bold text-emerald-400 mt-1">
                {currencySymbol}{billOrder.totalAmount?.toFixed(2)}
              </h2>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Payment Method:</label>
              <div className="grid grid-cols-3 gap-2">
                {['CASH', 'CARD', 'UPI'].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPaymentMethod(m)}
                    className={`py-2 rounded-lg font-bold text-xs border transition-all ${
                      paymentMethod === m
                        ? 'bg-emerald-600 border-emerald-500 text-white shadow-md'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
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
                className="flex-1 py-2.5 rounded-lg bg-slate-800 text-slate-300 font-semibold text-xs hover:bg-slate-700"
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
