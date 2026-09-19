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
      setTables(liveTables);
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
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-md">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
            <Grid2X2 className="w-5 h-5 text-emerald-400" />
            <span>Table & Floor Management</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time multi-waiter floor sync • {availableCount} Free • {occupiedCount} Occupied • {billReqCount} Bill Requested
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Table</span>
          </button>
        </div>
      </div>

      {/* Tables Visual Floor Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <div className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin mx-auto mb-2"></div>
            Connecting to real-time floor status...
          </div>
        ) : tables.length === 0 ? (
          <div className="col-span-full py-16 text-center text-slate-500 text-xs">
            No dining tables created yet. Click "Add New Table" to start.
          </div>
        ) : (
          tables.map((table) => {
            const isAvailable = table.status === 'AVAILABLE';
            const isBillReq = table.status === 'BILL_REQUESTED';
            const isOcc = table.status === 'OCCUPIED';
            const activeOrder = table.activeOrder;

            let cardStyle = 'bg-slate-900/90 border-slate-800 hover:border-emerald-500/50';
            if (isBillReq) cardStyle = 'bg-purple-950/30 border-purple-600 shadow-lg shadow-purple-950/30 ring-1 ring-purple-500';
            else if (isOcc) cardStyle = 'bg-amber-950/20 border-amber-700/60 shadow-lg shadow-amber-950/20';

            return (
              <div
                key={table.id}
                className={`p-4 rounded-2xl border flex flex-col justify-between transition-all duration-200 ${cardStyle}`}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-extrabold text-lg text-white">Table {table.tableNumber}</h3>
                      <div className="flex items-center space-x-1 text-xs text-slate-400 mt-0.5">
                        <Users className="w-3.5 h-3.5" />
                        <span>Capacity: {table.capacity} guests</span>
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        isAvailable
                          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                          : isBillReq
                          ? 'bg-purple-900/80 text-purple-200 border border-purple-500 animate-pulse'
                          : 'bg-amber-950/80 text-amber-300 border border-amber-700'
                      }`}
                    >
                      {isAvailable ? 'Available' : isBillReq ? 'Bill Requested' : 'Occupied'}
                    </span>
                  </div>

                  {/* Active Order Details */}
                  {!isAvailable && activeOrder && (
                    <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1">
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Order: <strong>#{activeOrder.orderNumber}</strong></span>
                        <span className="font-extrabold text-amber-400 text-sm">
                          {currencySymbol}{activeOrder.totalAmount?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-400 pt-0.5">
                        <span>Server: {activeOrder.waiterName || 'Staff'}</span>
                        <span>Items: {activeOrder.itemCount || 0}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-1.5">
                  {isAvailable ? (
                    <button
                      type="button"
                      onClick={() => navigate('/pos')}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow flex items-center justify-center space-x-1.5 transition-all"
                    >
                      <Utensils className="w-3.5 h-3.5" />
                      <span>Take Order (POS)</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => navigate('/pos')}
                        className="flex-1 py-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 flex items-center justify-center space-x-1"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>View / Add</span>
                      </button>

                      {!isBillReq && (
                        <button
                          type="button"
                          onClick={() => handleRequestBill(table)}
                          className="py-1.5 px-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 text-purple-200 font-semibold text-xs border border-purple-700 flex items-center space-x-1"
                          title="Request Bill"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Bill</span>
                        </button>
                      )}
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDeleteTable(table.id)}
                    className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
                    title="Delete Table"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Table Number / Label
            </label>
            <input
              type="text"
              required
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
              placeholder="e.g. 1, 2, Patio-A, T-10"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Seating Capacity
            </label>
            <input
              type="number"
              min="1"
              max="30"
              required
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsAddModalOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/30"
            >
              Create Table
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
