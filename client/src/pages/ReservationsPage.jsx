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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Table Reservations</h1>
          <p className="text-xs text-slate-400">Manage upcoming dining table bookings and guest requests</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchList}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setIsAddOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Booking</span>
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl max-w-sm shadow-md">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by guest name or phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>
      </div>

      {/* Reservations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Guest Details</th>
                <th className="py-3 px-4 font-semibold">Party Size</th>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Table</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-400">Loading reservations...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-12 text-center text-slate-500">
                    No reservations recorded. Click "New Booking" to reserve a table.
                  </td>
                </tr>
              ) : (
                filtered.map((res) => (
                  <tr key={res.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-100">
                      <div>{res.customerName}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{res.customerPhone}</div>
                      {res.notes && <div className="text-[10px] text-amber-400 italic">"{res.notes}"</div>}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] font-bold">
                        {res.partySize} Guests
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <div className="font-semibold">{res.reservationDate}</div>
                      <div className="text-[10px] text-slate-400">{res.reservationTime}</div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-medium">
                      {res.tableNumber}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          res.status === 'CONFIRMED'
                            ? 'bg-blue-950 text-blue-300 border border-blue-800'
                            : res.status === 'SEATED'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {res.status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      {res.status === 'CONFIRMED' && (
                        <button
                          onClick={() => handleStatus(res.id, 'SEATED')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800 font-semibold"
                        >
                          Mark Seated
                        </button>
                      )}
                      {res.status !== 'CANCELLED' && (
                        <button
                          onClick={() => handleStatus(res.id, 'CANCELLED')}
                          className="px-2 py-1 rounded-lg bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800"
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
                <label className="block font-semibold text-slate-300 mb-1">Guest Name *</label>
                <input
                  type="text"
                  required
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="e.g. Vikram Singha"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="9876543210"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Guests</label>
                <input
                  type="number"
                  min="1"
                  max="30"
                  value={partySize}
                  onChange={(e) => setPartySize(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Date</label>
                <input
                  type="date"
                  value={resDate}
                  onChange={(e) => setResDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Time</label>
                <input
                  type="time"
                  value={resTime}
                  onChange={(e) => setResTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Assign Table (Optional)</label>
              <select
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Automatic / On Arrival --</option>
                {tables.map(t => (
                  <option key={t.id} value={t.tableNumber}>
                    {t.tableNumber} ({t.capacity} seats)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Special Request / Notes</label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anniversary celebration, window table preferred..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
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
