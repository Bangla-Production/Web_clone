import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Edit2,
  Trash2,
  Search,
  Check,
  X,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Utensils,
  RefreshCw
} from 'lucide-react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  toggleMenuItemAvailability,
  deleteMenuItem
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import ImgBBUploader from '../components/common/ImgBBUploader';

export default function MenuAdminPage() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCat, setSelectedCat] = useState('ALL');

  // Category Modals
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCat, setEditingCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [catDesc, setCatDesc] = useState('');
  const [catOrder, setCatOrder] = useState(0);

  // Menu Item Modals
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCatId, setItemCatId] = useState('');
  const [itemImg, setItemImg] = useState('');
  const [itemSku, setItemSku] = useState('');
  const [itemIsVeg, setItemIsVeg] = useState(true);
  const [itemAvailable, setItemAvailable] = useState(true);

  const { activeRestaurantId } = useAuth();
  const { currencySymbol } = useRestaurant();
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [catList, itemList] = await Promise.all([
        getCategories(activeRestaurantId),
        getMenuItems(activeRestaurantId)
      ]);
      setCategories(catList);
      setItems(itemList);
    } catch (err) {
      toast.error('Failed to load menu catalog.');
    } finally {
      setLoading(false);
    }
  }, [activeRestaurantId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Category Actions
  const handleOpenCatModal = (cat = null) => {
    if (cat) {
      setEditingCat(cat);
      setCatName(cat.name);
      setCatDesc(cat.description || '');
      setCatOrder(cat.displayOrder || 0);
    } else {
      setEditingCat(null);
      setCatName('');
      setCatDesc('');
      setCatOrder(categories.length + 1);
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCategory = async (e) => {
    e.preventDefault();
    if (!catName.trim()) return;

    try {
      if (editingCat) {
        await updateCategory(activeRestaurantId, editingCat.id, {
          name: catName,
          description: catDesc,
          displayOrder: parseInt(catOrder, 10) || 0
        });
        toast.success('Category updated in Firestore!');
      } else {
        await createCategory(activeRestaurantId, {
          name: catName,
          description: catDesc,
          displayOrder: parseInt(catOrder, 10) || (categories.length + 1)
        });
        toast.success('Category created in Firestore!');
      }
      setIsCatModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to save category.');
    }
  };

  const handleDeleteCategory = async (catId) => {
    if (!window.confirm('Are you sure you want to delete this category?')) return;
    try {
      await deleteCategory(activeRestaurantId, catId);
      toast.success('Category deleted!');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete category.');
    }
  };

  // Item Actions
  const handleOpenItemModal = (item = null) => {
    if (item) {
      setEditingItem(item);
      setItemName(item.name);
      setItemDesc(item.description || '');
      setItemPrice(String(item.price));
      setItemCatId(item.categoryId);
      setItemImg(item.imageUrl || '');
      setItemSku(item.sku || '');
      setItemIsVeg(item.isVeg !== undefined ? item.isVeg : true);
      setItemAvailable(item.isAvailable !== undefined ? item.isAvailable : true);
    } else {
      setEditingItem(null);
      setItemName('');
      setItemDesc('');
      setItemPrice('');
      setItemCatId(categories[0]?.id || '');
      setItemImg('');
      setItemSku('');
      setItemIsVeg(true);
      setItemAvailable(true);
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();
    if (!itemName.trim() || !itemPrice || !itemCatId) {
      toast.warning('Name, price and category are required.');
      return;
    }

    try {
      const selectedCategoryObj = categories.find(c => c.id === itemCatId);

      const payload = {
        name: itemName.trim(),
        description: itemDesc.trim(),
        price: parseFloat(itemPrice),
        categoryId: itemCatId,
        categoryName: selectedCategoryObj?.name || '',
        imageUrl: itemImg.trim(),
        sku: itemSku.trim(),
        isVeg: itemIsVeg,
        isAvailable: itemAvailable
      };

      if (editingItem) {
        await updateMenuItem(activeRestaurantId, editingItem.id, payload);
        toast.success('Menu item updated in Firestore!');
      } else {
        await createMenuItem(activeRestaurantId, payload);
        toast.success('Menu item saved with ImgBB picture!');
      }
      setIsItemModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to save menu item.');
    }
  };

  const handleToggleAvailability = async (item) => {
    try {
      const newStatus = await toggleMenuItemAvailability(activeRestaurantId, item.id, item.isAvailable);
      toast.success(`Marked ${newStatus ? 'In Stock' : 'Out of Stock'}`);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isAvailable: newStatus } : i))
      );
    } catch (err) {
      toast.error('Failed to update availability.');
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('Delete this menu item?')) return;
    try {
      await deleteMenuItem(activeRestaurantId, itemId);
      toast.success('Menu item deleted!');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete item.');
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesCat = selectedCat === 'ALL' || item.categoryId === selectedCat;
    const matchesSearch =
      search === '' ||
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()));
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Menu Catalog & Dish ImgBB Assets</h1>
          <p className="text-xs text-slate-400">Configure food categories, item pricing, and ImgBB photos</p>
        </div>
        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchData}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            title="Refresh"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleOpenCatModal()}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Manage Categories</span>
          </button>
          <button
            onClick={() => handleOpenItemModal()}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md shadow-emerald-900/30 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Menu Item</span>
          </button>
        </div>
      </div>

      {/* Category Pills Strip */}
      <div className="flex items-center space-x-2 p-3 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
        <button
          onClick={() => setSelectedCat('ALL')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
            selectedCat === 'ALL'
              ? 'bg-emerald-600 text-white shadow'
              : 'bg-slate-950 text-slate-400 hover:text-white'
          }`}
        >
          All Items ({items.length})
        </button>
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center space-x-1 shrink-0">
            <button
              onClick={() => setSelectedCat(cat.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCat === cat.id
                  ? 'bg-emerald-600 text-white shadow'
                  : 'bg-slate-950 text-slate-400 hover:text-white'
              }`}
            >
              {cat.name} ({items.filter(i => i.categoryId === cat.id).length})
            </button>
            <button
              onClick={() => handleOpenCatModal(cat)}
              className="p-1 text-slate-500 hover:text-slate-300"
              title="Edit Category"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Search and Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl space-y-3 p-4">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search items by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/70 text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-semibold">Dish & Photo</th>
                <th className="py-3 px-4 font-semibold">Category</th>
                <th className="py-3 px-4 font-semibold">Type</th>
                <th className="py-3 px-4 font-semibold">Price</th>
                <th className="py-3 px-4 font-semibold">Stock Availability</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-slate-400">
                    Loading menu from Firestore...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-10 text-center text-slate-500">
                    No menu items found. Click "Add Menu Item" to create one.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center space-x-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-10 h-10 rounded-lg object-cover bg-slate-800 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 shrink-0">
                            <Utensils className="w-4 h-4" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-slate-100">{item.name}</p>
                          <p className="text-[10px] text-slate-400 line-clamp-1">{item.description}</p>
                          {item.sku && <span className="text-[10px] text-slate-500 font-mono">SKU: {item.sku}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-medium">
                      {item.categoryName || categories.find(c => c.id === item.categoryId)?.name || 'General'}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.isVeg
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                        <span>{item.isVeg ? 'Veg' : 'Non-Veg'}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-400 text-sm">
                      {currencySymbol}{item.price?.toFixed(2)}
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => handleToggleAvailability(item)}
                        className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                          item.isAvailable
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700/60 hover:bg-emerald-900'
                            : 'bg-rose-950/80 text-rose-300 border border-rose-700/60 hover:bg-rose-900'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${item.isAvailable ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
                        <span>{item.isAvailable ? 'In Stock' : 'Out of Stock'}</span>
                      </button>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleOpenItemModal(item)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white"
                        title="Edit Item"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-400"
                        title="Delete Item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category Modal */}
      {isCatModalOpen && (
        <Modal
          isOpen={isCatModalOpen}
          onClose={() => setIsCatModalOpen(false)}
          title={editingCat ? 'Edit Category' : 'Create New Category'}
        >
          <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Category Name *</label>
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Starters, Main Course, Drinks"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Short description"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Display Order</label>
              <input
                type="number"
                value={catOrder}
                onChange={(e) => setCatOrder(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-between items-center pt-2">
              {editingCat ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsCatModalOpen(false);
                    handleDeleteCategory(editingCat.id);
                  }}
                  className="px-3 py-2 rounded-lg bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 font-semibold"
                >
                  Delete Category
                </button>
              ) : <div />}

              <div className="space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Save Category
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Menu Item Modal */}
      {isItemModalOpen && (
        <Modal
          isOpen={isItemModalOpen}
          onClose={() => setIsItemModalOpen(false)}
          title={editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
          maxWidth="max-w-lg"
        >
          <form onSubmit={handleSaveItem} className="space-y-3.5 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Paneer Butter Masala"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">Price ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  placeholder="250.00"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-semibold text-slate-300 mb-1">Category *</label>
                <select
                  value={itemCatId}
                  onChange={(e) => setItemCatId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">SKU / Item Code</label>
                <input
                  type="text"
                  value={itemSku}
                  onChange={(e) => setItemSku(e.target.value)}
                  placeholder="e.g. MAIN-01"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* ImgBB Image Uploader */}
            <ImgBBUploader
              label="Dish Photo (Free ImgBB Image CDN)"
              value={itemImg}
              onChange={setItemImg}
            />

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Description</label>
              <textarea
                rows={2}
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                placeholder="Rich aromatic cottage cheese in spiced creamy tomato gravy..."
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-6 py-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemIsVeg}
                  onChange={(e) => setItemIsVeg(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span className="text-slate-200 font-semibold">Vegetarian Item</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemAvailable}
                  onChange={(e) => setItemAvailable(e.target.checked)}
                  className="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0"
                />
                <span className="text-slate-200 font-semibold">Available for Order</span>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-900/30"
              >
                {editingItem ? 'Update Menu Item' : 'Add Item to Menu'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
