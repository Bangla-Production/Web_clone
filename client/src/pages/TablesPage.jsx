import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Grid2X2,
  Plus,
  Users,
  Utensils,
  CheckCircle,
  AlertCircle,
  Trash2,
  Clock,
  CreditCard,
  Send,
  Eye,
  FileText
} from 'lucide-react';
import {
  subscribeToTables,
  createTable,
  updateTableStatus,
  deleteTable,
  requestBillForTable
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

export default function TablesPage() {
  const [tables, setTables] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');

  const { activeRestaurantId, user } = useAuth();
  const { currencySymbol } = useRestaurant();
  const toast = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const unsubscribe = subscribeToTables(activeRestaurantId, (liveTables) => {
      setTables(liveTables || []);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, [activeRestaurantId]);

  const handleAddTable = async (e) => {
    e.preventDefault();
    if (!tableNumber.trim()) return;

    try {
      await createTable(activeRestaurantId, {
        tableNumber: tableNumber.trim(),
        capacity: parseInt(capacity, 10) || 4
      });

      toast.success(`Table ${tableNumber} created!`);
      setIsAddModalOpen(false);
      setTableNumber('');
      setCapacity('4');
    } catch (err) {
      toast.error('Failed to create table.');
    }
  };

  const handleRequestBill = async (table) => {
    if (!table.activeOrder?.orderId) {
      toast.warning('No active order on this table.');
      return;
    }

    try {
      await requestBillForTable(
        activeRestaurantId,
        table.id,
        table.activeOrder.orderId,
        user
      );
      toast.info(`Bill requested for Table ${table.tableNumber}`);
    } catch (err) {
      toast.error('Failed to request bill.');
    }
  };

  const handleToggleManualStatus = async (table) => {
    const newStatus = table.status === 'AVAILABLE' ? 'OCCUPIED' : 'AVAILABLE';
    try {
      await updateTableStatus(activeRestaurantId, table.id, newStatus, null);
      toast.success(`Table marked as ${newStatus}`);
    } catch (err) {
      toast.error('Failed to update table status.');
    }
  };

  const handleDeleteTable = async (tableId) => {
    if (!window.confirm('Delete this table permanently?')) return;
    try {
      await deleteTable(activeRestaurantId, tableId);
      toast.success('Table deleted!');
    } catch (err) {
      toast.error('Failed to delete table.');
    }
  };

  const availableCount = tables.filter((t) => t.status === 'AVAILABLE').length;
  const occupiedCount = tables.filter((t) => t.status === 'OCCUPIED').length;
  const billReqCount = tables.filter((t) => t.status === 'BILL_REQUESTED').length;

  return (
    <div className="space-y-5 transition-colors duration-200">
      {/* Top Header */}
      <div className="pos-surface-glass p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-pos-border">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
              <Grid2X2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 dark:text-white tracking-tight font-display">
                Table & Floor Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Petpooja multi-section floor layout • Real-time synchronization with waiter tablets and kitchen
              </p>
            </div>
          </div>
        </div>

        {/* Counter chips & Action */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-2 bg-pos-dark px-3 py-1.5 rounded-xl border border-pos-border text-xs">
            <span className="flex items-center space-x-1.5 text-emerald-600 dark:text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>{availableCount} Vacant</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="flex items-center space-x-1.5 text-amber-600 dark:text-amber-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>{occupiedCount} Occupied</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="flex items-center space-x-1.5 text-purple-600 dark:text-purple-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-purple-500 animate-ping"></span>
              <span>{billReqCount} Bill Req</span>
            </span>
          </div>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="petpooja-btn-kot flex items-center space-x-2 px-4 py-2.5 rounded-xl text-slate-950 text-xs font-black transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add New Table</span>
          </button>
        </div>
      </div>

      {/* Tables Visual Floor Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? (
          <div className="col-span-full py-20 text-center text-slate-400">
            <div className="w-10 h-10 border-3 border-amber-500/20 border-t-amber-400 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Connecting to real-time floor status...</p>
          </div>
        ) : tables.length === 0 ? (
          <div className="col-span-full py-20 text-center text-slate-400 text-sm pos-card-glass rounded-2xl border border-pos-border">
            <Grid2X2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="font-semibold text-slate-700 dark:text-slate-300">No dining tables configured yet.</p>
            <p className="text-xs text-slate-500 mt-1">Click "+ Add New Table" to create your dining floor layout.</p>
          </div>
        ) : (
          tables.map((table) => {
            const isAvailable = table.status === 'AVAILABLE';
            const isBillReq = table.status === 'BILL_REQUESTED';
            const isOcc = table.status === 'OCCUPIED';
            const activeOrder = table.activeOrder;

            let cardStyle = 'pos-card-glass hover:border-amber-400/50';
            if (isBillReq) {
              cardStyle = 'bg-purple-50 dark:bg-purple-950/30 border-purple-400 dark:border-purple-500/60 shadow-pos-purple ring-1 ring-purple-500/40';
            } else if (isOcc) {
              cardStyle = 'bg-amber-50 dark:bg-amber-950/25 border-amber-400 dark:border-amber-500/40 shadow-sm';
            }

            return (
              <div
                key={table.id}
                className={`p-4.5 rounded-2xl border flex flex-col justify-between transition-all duration-200 ${cardStyle}`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <h3 className="font-display font-black text-xl text-slate-900 dark:text-white">
                          Table {table.tableNumber}
                        </h3>
                      </div>
                      <div className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 mt-1">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>Seats {table.capacity} guests</span>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider ${
                        isAvailable
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                          : isBillReq
                          ? 'bg-purple-500/20 text-purple-800 dark:text-purple-300 border border-purple-500/50 animate-pulse'
                          : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {isAvailable ? 'Vacant' : isBillReq ? 'Bill Req' : 'Occupied'}
                    </span>
                  </div>

                  {/* Active Order Details */}
                  {!isAvailable && activeOrder && (
                    <div className="mt-3.5 p-3 rounded-xl bg-pos-dark border border-pos-border text-xs space-y-1.5 shadow-inner">
                      <div className="flex justify-between items-center text-slate-600 dark:text-slate-300">
                        <span className="text-slate-500 dark:text-slate-400">Order: <strong className="text-slate-900 dark:text-white">#{activeOrder.orderNumber}</strong></span>
                        <span className="font-num font-black text-amber-600 dark:text-amber-400 text-sm">
                          {currencySymbol}{activeOrder.totalAmount?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-pos-border/40">
                        <span>Server: <strong className="text-slate-800 dark:text-slate-200">{activeOrder.waiterName || 'Staff'}</strong></span>
                        <span>{activeOrder.itemCount || 0} items</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-pos-border flex items-center justify-between gap-2">
                  {isAvailable ? (
                    <button
                      type="button"
                      onClick={() => navigate('/pos')}
                      className="petpooja-btn-kot flex-1 py-2.5 px-3 rounded-xl text-slate-950 font-black text-xs flex items-center justify-center space-x-1.5 transition-all"
                    >
                      <Utensils className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Take Order</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate('/pos')}
                        className="pos-btn-touch flex-1 py-2 px-3 rounded-xl bg-pos-surface hover:bg-pos-card-hover text-slate-800 dark:text-white font-bold text-xs border border-pos-border flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        <span>View / Add</span>
                      </button>

                      {!isBillReq && (
                        <button
                          type="button"
                          onClick={() => handleRequestBill(table)}
                          className="pos-btn-touch py-2 px-3 rounded-xl bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 dark:hover:bg-purple-900/80 text-purple-800 dark:text-purple-200 font-bold text-xs border border-purple-300 dark:border-purple-700/60 flex items-center space-x-1.5 shadow-sm"
                          title="Request Bill"
                        >
                          <FileText className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                          <span>Bill</span>
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteTable(table.id)}
                    className="p-2 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                    title="Delete Table"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Add Table Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Dining Table">
        <form onSubmit={handleAddTable} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Table Number / Label
            </label>
            <input
              type="text"
              required
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. 1, 2, Patio-A, T-10"
              className="w-full px-3.5 py-2.5 bg-pos-dark border border-pos-border rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
              Seating Capacity
            </label>
            <input
              type="number"
              min="1"
              max="30"
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-pos-dark border border-pos-border rounded-xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-num"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-pos-border">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-pos-card-hover"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="pos-btn-touch px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs shadow-pos-glow"
            >
              Create Table
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
