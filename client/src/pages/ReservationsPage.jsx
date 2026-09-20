import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarDays,
  Plus,
  Search,
  Users,
  Phone,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw
} from 'lucide-react';
import {
  getReservations,
  createReservation,
  updateReservationStatus,
  getTables
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

export default function ReservationsPage() {
  const [reservations, setReservations] = useState([]);
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [partySize, setPartySize] = useState('2');
  const [resDate, setResDate] = useState(new Date().toISOString().slice(0, 10));
  const [resTime, setResTime] = useState('19:30');
  const [tableNumber, setTableNumber] = useState('');
  const [notes, setNotes] = useState('');

  const { activeRestaurantId } = useAuth();
  const toast = useToast();

  const fetchList = useCallback(async () => {
    try {
      setLoading(true);
      const [resList, tblList] = await Promise.all([
        getReservations(activeRestaurantId),
        getTables(activeRestaurantId)
      ]);
      setReservations(resList);
      setTables(tblList);
    } catch (err) {
      toast.error('Failed to load reservations.');
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!customerName || !customerPhone) return;

    try {
      await createReservation(activeRestaurantId, {
        customerName,
        customerPhone,
        partySize: parseInt(partySize, 10) || 2,
        reservationDate: resDate,
        reservationTime: resTime,
        tableNumber: tableNumber || 'Assigned on Arrival',
        notes
      });
      toast.success(`Reservation created for ${customerName}!`);
      setIsAddOpen(false);
      setCustomerName('');
      setCustomerPhone('');
      fetchList();
    } catch (err) {
      toast.error('Failed to save reservation.');
    }
  };

  const handleStatus = async (resId, newStatus) => {
    try {
      await updateReservationStatus(activeRestaurantId, resId, newStatus);
      toast.success(`Reservation marked as ${newStatus}`);
      fetchList();
    } catch (err) {
      toast.error('Failed to update status.');
    }
  };

  const filtered = reservations.filter(r =>
    r.customerName?.toLowerCase().includes(search.toLowerCase()) ||
    r.customerPhone?.includes(search)
  );

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="pos-surface-glass p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-500 dark:text-blue-400">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight font-display">
                Table Reservations
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Manage upcoming dining table bookings and guest requests
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchList}
            className="pos-btn-touch flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-200 text-xs font-bold border border-pos-border shadow-sm transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsAddOpen(true)}
            className="pos-btn-touch flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-pos-glow transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="pos-surface-glass p-4 rounded-2xl max-w-sm shadow-md">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by guest name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-medium"
          />
        </div>
      </div>

      {/* Reservations Table */}
      <div className="pos-card-glass rounded-2xl overflow-hidden shadow-xl p-5 space-y-4">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-pos-dark text-slate-600 dark:text-slate-400 border-b border-pos-border">
              <tr>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Guest Details</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Party Size</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Date & Time</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Table</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Status</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-border">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400 font-semibold">Loading reservations...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500 font-semibold">
                    No reservations recorded. Click "New Booking" to reserve a table.
                  </td>
                </tr>
              ) : (
                filtered.map((res) => (
                  <tr key={res.id} className="hover:bg-pos-surface/60 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-slate-100">
                      <div>{res.customerName}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{res.customerPhone}</div>
                      {res.notes && <div className="text-[10px] text-amber-600 dark:text-amber-400 italic">"{res.notes}"</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2.5 py-1 rounded-lg bg-pos-dark border border-pos-border text-[11px] font-bold text-slate-700 dark:text-slate-300 font-num">
                        {res.partySize} Guests
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300">
                      <div className="font-bold">{res.reservationDate}</div>
                      <div className="text-[10px] text-slate-500 font-num">{res.reservationTime}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-semibold">
                      {res.tableNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                          res.status === 'CONFIRMED'
                            ? 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                            : res.status === 'SEATED'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {res.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {res.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleStatus(res.id, 'SEATED')}
                          className="pos-btn-touch px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30 font-bold"
                        >
                          Mark Seated
                        </button>
                      )}
                      {res.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleStatus(res.id, 'CANCELLED')}
                          className="pos-btn-touch px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 font-bold"
                        >
                          Cancel
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

      {/* Add Modal */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="Add Table Reservation">
          <form onSubmit={handleCreate} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Guest Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Vikram Singha"
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Guests</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-num"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Date</label>
                <input
                  type="date"
                  value={resDate}
                  onChange={(e) => setResDate(e.target.value)}
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Time</label>
                <input
                  type="time"
                  value={resTime}
                  onChange={(e) => setResTime(e.target.value)}
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Assign Table (Optional)</label>
              <select
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
              >
                <option value="" className="bg-pos-card text-slate-900 dark:text-white">-- Automatic / On Arrival --</option>
                {tables.map(t => (
                  <option key={t.id} value={t.tableNumber} className="bg-pos-card text-slate-900 dark:text-white">
                    {t.tableNumber} ({t.capacity} seats)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Special Request / Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anniversary celebration, window table preferred..."
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-pos-border">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 rounded-xl bg-pos-dark text-slate-700 dark:text-slate-300 font-bold hover:bg-pos-surface border border-pos-border"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow"
              >
                Save Reservation
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
