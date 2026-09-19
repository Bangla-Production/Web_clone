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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Invoice Archive & Receipts</h1>
          <p className="text-xs text-slate-400">
            Historical billing invoices, customer receipts, and tax records ({activeRestaurantId})
          </p>
        </div>
        <button
          onClick={fetchInvoices}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors self-start"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl max-w-md shadow-md">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search invoice number, customer phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Invoice #</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Order / Table</th>
                <th className="py-3 px-4 font-semibold">Customer</th>
                <th className="py-3 px-4 font-semibold">Payment Mode</th>
                <th className="py-3 px-4 font-semibold">Total Amount</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-400">Loading invoices from Firestore...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-12 text-center text-slate-500">
                    No billing invoices generated yet. Settle an order in POS to generate an invoice.
                  </td>
                </tr>
              ) : (
                filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-100">{inv.invoiceNumber}</td>
                    <td className="py-3.5 px-4 text-slate-400">
                      <div>{new Date(inv.issuedAt || Date.now()).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-500">
                        {new Date(inv.issuedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <div className="font-medium">{inv.orderNumber}</div>
                      <div className="text-[10px] text-slate-500">
                        {inv.tableNumber || inv.orderType}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      {inv.customerName || 'Walk-in Guest'}
                      {inv.customerPhone && <div className="text-[10px] text-slate-500">{inv.customerPhone}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-200 border border-slate-700">
                        {inv.paymentMethod || 'CASH'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-bold text-emerald-400 text-sm">
                      {currencySymbol}{inv.totalAmount?.toFixed(2)}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => handleOpenInvoice(inv)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow inline-flex items-center space-x-1.5 transition-colors"
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
