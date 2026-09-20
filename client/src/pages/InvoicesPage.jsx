import React, { useState, useEffect, useCallback } from 'react';
import {
  Receipt,
  Search,
  Printer,
  RefreshCw
} from 'lucide-react';
import { getInvoices } from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import InvoiceModal from '../components/invoice/InvoiceModal';

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { activeRestaurantId } = useAuth();
  const { currencySymbol, restaurant } = useRestaurant();
  const toast = useToast();

  const fetchInvoices = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getInvoices(activeRestaurantId);
      setInvoices(list);
    } catch (err) {
      toast.error('Failed to load invoices from Firestore.');
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const handleOpenInvoice = (inv) => {
    setSelectedInvoice({
      ...inv,
      order: {
        orderNumber: inv.orderNumber,
        orderType: inv.orderType,
        table: inv.tableNumber ? { tableNumber: inv.tableNumber } : null,
        items: inv.items || []
      }
    });
    setIsModalOpen(true);
  };

  const filtered = invoices.filter(inv =>
    inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
    inv.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    inv.customerPhone?.includes(search) ||
    inv.orderNumber?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="pos-surface-glass p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center text-purple-500 dark:text-purple-400">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight font-display">
                Invoice Archive & Receipts
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Historical billing invoices, customer receipts, and tax records ({activeRestaurantId})
              </p>
            </div>
          </div>
        </div>
        <button
          onClick={fetchInvoices}
          className="pos-btn-touch flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-200 text-xs font-bold border border-pos-border shadow-sm transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      <div className="pos-surface-glass p-4 rounded-2xl max-w-md shadow-md">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice number, customer phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
          />
        </div>
      </div>

      <div className="pos-card-glass rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-pos-dark text-slate-600 dark:text-slate-400 border-b border-pos-border">
              <tr>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Invoice #</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Date & Time</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Order / Table</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Customer</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Payment Mode</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Total Amount</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-border">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400 font-semibold">Loading invoices from Firestore...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500 font-semibold">
                    No billing invoices generated yet. Settle an order in POS to generate an invoice.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-pos-surface/60 transition-colors">
                    <td className="py-3.5 px-4 font-black font-num text-slate-900 dark:text-slate-100">{inv.invoiceNumber}</td>
                    <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                      <div className="font-semibold text-slate-800 dark:text-slate-200">{new Date(inv.issuedAt || Date.now()).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-500 font-num">
                        {new Date(inv.issuedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                      <div className="font-bold">{inv.orderNumber}</div>
                      <div className="text-[10px] text-slate-500 font-medium">
                        {inv.tableNumber || inv.orderType}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                      <div className="font-bold">{inv.customerName || 'Walk-in Guest'}</div>
                      {inv.customerPhone && <div className="text-[10px] text-slate-500 font-mono">{inv.customerPhone}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg text-[10px] font-extrabold bg-pos-dark text-slate-700 dark:text-slate-300 border border-pos-border">
                        {inv.paymentMethod || 'CASH'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-emerald-600 dark:text-emerald-400 text-sm font-num">
                      {currencySymbol}{inv.totalAmount?.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenInvoice(inv)}
                        className="pos-btn-touch px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-pos-glow inline-flex items-center space-x-1.5 transition-colors"
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

      {isModalOpen && selectedInvoice && (
        <InvoiceModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          invoice={selectedInvoice}
        />
      )}
    </div>
  );
}
