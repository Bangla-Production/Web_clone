import React, { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Minus,
  AlertTriangle,
  History,
  Search,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  RefreshCw,
  PlusCircle
} from 'lucide-react';
import {
  getInventory,
  createInventoryItem,
  adjustInventoryStock
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

export default function InventoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [lowStockFilter, setLowStockFilter] = useState(false);

  // Add Item Modal
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('kg');
  const [quantity, setQuantity] = useState('');
  const [minThreshold, setMinThreshold] = useState('5');
  const [notes, setNotes] = useState('');

  // Adjust Stock Modal
  const [adjustItem, setAdjustItem] = useState(null);
  const [adjustType, setAdjustType] = useState('IN');
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [isAdjusting, setIsAdjusting] = useState(false);

  const { activeRestaurantId } = useAuth();
  const toast = useToast();

  const fetchStock = useCallback(async () => {
    try {
      setLoading(true);
      const list = await getInventory(activeRestaurantId);
      setItems(list);
    } catch (err) {
      toast.error('Failed to load inventory from Firestore.');
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    fetchStock();
  }, [fetchStock]);

  const handleCreateStock = async (e) => {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) return;

    try {
      await createInventoryItem(activeRestaurantId, {
        name: name.trim(),
        unit: unit.trim(),
        quantity: parseFloat(quantity) || 0,
        minThreshold: parseFloat(minThreshold) || 5,
        notes: notes.trim()
      });

      toast.success(`Added ${name} to inventory!`);
      setIsAddOpen(false);
      setName('');
      setQuantity('');
      fetchStock();
    } catch (err) {
      toast.error('Failed to add stock item.');
    }
  };

  const handleAdjustStock = async (e) => {
    e.preventDefault();
    if (!adjustItem || !adjustQty) return;

    try {
      setIsAdjusting(true);
      await adjustInventoryStock(
        activeRestaurantId,
        adjustItem.id,
        adjustItem.quantity,
        adjustType,
        adjustQty,
        adjustReason
      );

      toast.success(`Stock adjusted for ${adjustItem.name}`);
      setAdjustItem(null);
      setAdjustQty('');
      setAdjustReason('');
      fetchStock();
    } catch (err) {
      toast.error('Failed to adjust stock.');
    } finally {
      setIsAdjusting(false);
    }
  };

  const filtered = items.filter((item) => {
    const matchesSearch = item.name?.toLowerCase().includes(search.toLowerCase());
    const matchesLowStock = !lowStockFilter || item.isLowStock;
    return matchesSearch && matchesLowStock;
  });

  const lowStockCount = items.filter((i) => i.isLowStock).length;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Stock & Raw Material Inventory</h1>
          <p className="text-xs text-slate-400">
            Manual stock tracking, threshold warnings, and replenishment log
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={fetchStock}
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
            <span>Add Stock Item</span>
          </button>
        </div>
      </div>

      {/* Filter Row & Low Stock Toggle */}
      <div className="p-3.5 bg-slate-900 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search ingredient or material name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <button
          onClick={() => setLowStockFilter(!lowStockFilter)}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
            lowStockFilter
              ? 'bg-amber-950 text-amber-200 border-amber-600'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          <span>Low Stock Warning Only ({lowStockCount})</span>
        </button>
      </div>

      {/* Stock Items Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Material / Ingredient</th>
                <th className="py-3 px-4 font-semibold">Current Quantity</th>
                <th className="py-3 px-4 font-semibold">Min Threshold</th>
                <th className="py-3 px-4 font-semibold">Stock Status</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-400">Loading stock from Firestore...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-12 text-center text-slate-500">
                    No stock items found. Click "Add Stock Item" to create one.
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-800/40 transition-colors ${
                      item.isLowStock ? 'bg-amber-950/10' : ''
                    }`}
                  >
                    <td className="py-3.5 px-4 font-semibold text-slate-100">
                      <div>{item.name}</div>
                      {item.notes && <div className="text-[10px] text-slate-500">{item.notes}</div>}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`text-sm font-bold ${item.isLowStock ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {item.quantity} {item.unit}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {item.minThreshold} {item.unit}
                    </td>
                    <td className="py-3.5 px-4">
                      {item.isLowStock ? (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-950 text-amber-300 border border-amber-700/60 animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          <span>LOW STOCK</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700/60">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Adequate</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          setAdjustItem(item);
                          setAdjustType('IN');
                          setAdjustQty('');
                          setAdjustReason('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-800 font-semibold inline-flex items-center space-x-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Stock</span>
                      </button>

                      <button
                        onClick={() => {
                          setAdjustItem(item);
                          setAdjustType('OUT');
                          setAdjustQty('');
                          setAdjustReason('');
                        }}
                        className="px-2.5 py-1 rounded-lg bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 font-semibold inline-flex items-center space-x-1"
                      >
                        <Minus className="w-3 h-3" />
                        <span>Deduct</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Stock Item Modal */}
      {isAddOpen && (
        <Modal isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} title="New Inventory Stock Item">
          <form onSubmit={handleCreateStock} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Item / Ingredient Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Basmati Rice, Butter, Dairy Milk"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Measurement Unit *</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="kg">kg (Kilograms)</option>
                  <option value="L">L (Liters)</option>
                  <option value="pcs">pcs (Pieces)</option>
                  <option value="gm">gm (Grams)</option>
                  <option value="pkt">pkt (Packets)</option>
                  <option value="box">box (Boxes)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Opening Quantity</label>
                <input
                  type="number"
                  step="0.01"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Min Threshold Alert</label>
              <input
                type="number"
                step="0.01"
                value={minThreshold}
                onChange={(e) => setMinThreshold(e.target.value)}
                placeholder="5"
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
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                Create Item
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Adjust Stock Modal */}
      {adjustItem && (
        <Modal
          isOpen={!!adjustItem}
          onClose={() => setAdjustItem(null)}
          title={`Adjust Stock: ${adjustItem.name}`}
          maxWidth="max-w-md"
        >
          <form onSubmit={handleAdjustStock} className="space-y-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex justify-between items-center">
              <span className="text-slate-400">Current Stock Level:</span>
              <span className="font-bold text-white text-sm">
                {adjustItem.quantity} {adjustItem.unit}
              </span>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-2">Adjustment Operation:</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAdjustType('IN')}
                  className={`py-2 rounded-lg font-bold border transition-all ${
                    adjustType === 'IN'
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  + Add Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('OUT')}
                  className={`py-2 rounded-lg font-bold border transition-all ${
                    adjustType === 'OUT'
                      ? 'bg-rose-600 border-rose-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  - Deduct Stock
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustType('ADJUSTMENT')}
                  className={`py-2 rounded-lg font-bold border transition-all ${
                    adjustType === 'ADJUSTMENT'
                      ? 'bg-blue-600 border-blue-500 text-white'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  = Set Exact
                </button>
              </div>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">
                Quantity ({adjustItem.unit}) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
                placeholder="e.g. 5.0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Reason / Note</label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Morning vendor shipment"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustItem(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={isAdjusting}
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
              >
                {isAdjusting ? 'Updating...' : 'Save Stock Update'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
