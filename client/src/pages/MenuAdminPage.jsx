import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Search,
  Layers,
  Utensils,
  RefreshCw,
  Minus,
  AlertTriangle,
  ExternalLink,
  Link2,
  Eraser
} from 'lucide-react';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  updateMenuItemStock,
  toggleMenuItemAvailability,
  deleteMenuItem
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import ImgBBUploader from '../components/common/ImgBBUploader';
import { getStockQty, isItemSoldOut, isLowStock } from '../utils/stock';

const NEW_CATEGORY = '__new__';

// Demo dishes/categories that ship with the seed script. Offered for one-click removal.
const SAMPLE_SKUS = ['MAIN-01', 'MAIN-02', 'RICE-01', 'BRED-01', 'BEV-01'];
const SAMPLE_NAMES = [
  'Paneer Butter Masala',
  'Butter Chicken Special',
  'Hyderabadi Chicken Dum Biryani',
  'Butter Garlic Naan',
  'Royal Mango Lassi'
];
const SAMPLE_CATEGORIES = ['Starters & Appetizers', 'Main Course', 'Breads & Biryani', 'Beverages'];

// Turns a Firebase error into something the admin can act on.
function explainError(err, fallback) {
  if (err?.code === 'permission-denied') {
    return `${fallback} Permission denied: this account is not allowed to edit this restaurant's menu (check role, verified email and restaurant ID).`;
  }
  return err?.message ? `${fallback} (${err.message})` : fallback;
}

// Number cell that saves on Enter / blur, reverts on Escape.
function InlineNumber({ value, onCommit, prefix = '', step = '0.01', min = 0, width = 'w-20', placeholder = '' }) {
  const [draft, setDraft] = useState(value === null || value === undefined ? '' : String(value));
  const skipBlur = useRef(false);

  useEffect(() => {
    setDraft(value === null || value === undefined ? '' : String(value));
  }, [value]);

  const commit = () => {
    const original = value === null || value === undefined ? '' : String(value);
    if (draft.trim() === original) return;
    onCommit(draft.trim());
  };

  return (
    <div className="inline-flex items-center space-x-1">
      {prefix && <span className="text-slate-400 font-bold">{prefix}</span>}
      <input
        type="number"
        step={step}
        min={min}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (skipBlur.current) {
            skipBlur.current = false;
            return;
          }
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            skipBlur.current = true;
            setDraft(value === null || value === undefined ? '' : String(value));
            e.currentTarget.blur();
          }
        }}
        className={`${width} px-2 py-1 bg-pos-dark border border-pos-border hover:border-emerald-500 rounded-lg text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:border-emerald-500 shadow-inner`}
      />
    </div>
  );
}

export default function MenuAdminPage() {
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
  const [itemQty, setItemQty] = useState('');
  const [itemCatId, setItemCatId] = useState('');
  const [newCatName, setNewCatName] = useState('');
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

  // ------------------------------------------------------------------
  // Category actions
  // ------------------------------------------------------------------
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
      setSaving(true);
      if (editingCat) {
        await updateCategory(activeRestaurantId, editingCat.id, {
          name: catName.trim(),
          description: catDesc,
          displayOrder: parseInt(catOrder, 10) || 0
        });
        toast.success('Category updated!');
      } else {
        await createCategory(activeRestaurantId, {
          name: catName.trim(),
          description: catDesc,
          displayOrder: parseInt(catOrder, 10) || (categories.length + 1)
        });
        toast.success('Category created!');
      }
      setIsCatModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error(explainError(err, 'Failed to save category.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async (catId) => {
    const count = items.filter((i) => i.categoryId === catId).length;
    const msg = count > 0
      ? `This category has ${count} item(s). The items will stay in the menu but lose their category. Delete anyway?`
      : 'Are you sure you want to delete this category?';
    if (!window.confirm(msg)) return;
    try {
      await deleteCategory(activeRestaurantId, catId);
      toast.success('Category deleted!');
      if (selectedCat === catId) setSelectedCat('ALL');
      fetchData();
    } catch (err) {
      toast.error(explainError(err, 'Failed to delete category.'));
    }
  };

  // ------------------------------------------------------------------
  // Item actions
  // ------------------------------------------------------------------
  const handleOpenItemModal = (item = null) => {
    setNewCatName('');
    if (item) {
      const qty = getStockQty(item);
      setEditingItem(item);
      setItemName(item.name);
      setItemDesc(item.description || '');
      setItemPrice(String(item.price ?? ''));
      setItemQty(qty === null ? '' : String(qty));
      setItemCatId(item.categoryId || categories[0]?.id || NEW_CATEGORY);
      setItemImg(item.imageUrl || '');
      setItemSku(item.sku || '');
      setItemIsVeg(item.isVeg !== undefined ? item.isVeg : true);
      setItemAvailable(item.isAvailable !== undefined ? item.isAvailable : true);
    } else {
      setEditingItem(null);
      setItemName('');
      setItemDesc('');
      setItemPrice('');
      setItemQty('');
      // With no categories yet, go straight to "create new category".
      setItemCatId(selectedCat !== 'ALL' && categories.some((c) => c.id === selectedCat)
        ? selectedCat
        : (categories[0]?.id || NEW_CATEGORY));
      setItemImg('');
      setItemSku('');
      setItemIsVeg(true);
      setItemAvailable(true);
    }
    setIsItemModalOpen(true);
  };

  const handleSaveItem = async (e) => {
    e.preventDefault();

    const price = parseFloat(itemPrice);
    if (!itemName.trim()) {
      toast.warning('Item name is required.');
      return;
    }
    if (Number.isNaN(price) || price < 0) {
      toast.warning('Enter a valid price.');
      return;
    }
    if (itemCatId === NEW_CATEGORY && !newCatName.trim()) {
      toast.warning('Type a name for the new category (or pick an existing one).');
      return;
    }
    if (!itemCatId) {
      toast.warning('Please choose a category.');
      return;
    }

    let stockQty = null;
    if (itemQty.trim() !== '') {
      const parsed = parseInt(itemQty, 10);
      if (Number.isNaN(parsed) || parsed < 0) {
        toast.warning('Quantity must be 0 or more (leave blank for unlimited).');
        return;
      }
      stockQty = parsed;
    }

    try {
      setSaving(true);

      // Create the category on the fly if the admin asked for a new one.
      let categoryId = itemCatId;
      let categoryName = categories.find((c) => c.id === itemCatId)?.name || '';
      if (itemCatId === NEW_CATEGORY) {
        const created = await createCategory(activeRestaurantId, {
          name: newCatName.trim(),
          description: '',
          displayOrder: categories.length + 1
        });
        categoryId = created.id;
        categoryName = newCatName.trim();
      }

      const payload = {
        name: itemName.trim(),
        description: itemDesc.trim(),
        price,
        categoryId,
        categoryName,
        imageUrl: itemImg.trim(),
        sku: itemSku.trim(),
        isVeg: itemIsVeg,
        stockQty,
        // Quantity 0 always means sold out.
        isAvailable: stockQty === 0 ? false : itemAvailable
      };

      if (editingItem) {
        await updateMenuItem(activeRestaurantId, editingItem.id, payload);
        toast.success('Menu item updated!');
      } else {
        await createMenuItem(activeRestaurantId, payload);
        toast.success('Menu item added!');
      }
      setIsItemModalOpen(false);
      fetchData();
    } catch (err) {
      console.error('Save menu item failed:', err);
      toast.error(explainError(err, 'Failed to save menu item.'));
    } finally {
      setSaving(false);
    }
  };

  const patchLocalItem = (itemId, patch) => {
    setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
  };

  const handleToggleAvailability = async (item) => {
    const qty = getStockQty(item);
    if (!item.isAvailable && qty !== null && qty <= 0) {
      toast.warning('Quantity is 0. Increase the quantity first to put it back in stock.');
      return;
    }
    try {
      const newStatus = await toggleMenuItemAvailability(activeRestaurantId, item.id, item.isAvailable);
      toast.success(`Marked ${newStatus ? 'In Stock' : 'Out of Stock'}`);
      patchLocalItem(item.id, { isAvailable: newStatus });
    } catch (err) {
      toast.error(explainError(err, 'Failed to update availability.'));
    }
  };

  // Inline price edit
  const handleInlinePrice = async (item, raw) => {
    const price = parseFloat(raw);
    if (Number.isNaN(price) || price < 0) {
      toast.warning('Enter a valid price.');
      return;
    }
    try {
      await updateMenuItem(activeRestaurantId, item.id, { price });
      patchLocalItem(item.id, { price });
      toast.success(`${item.name} price set to ${currencySymbol}${price.toFixed(2)}`);
    } catch (err) {
      toast.error(explainError(err, 'Failed to update price.'));
    }
  };

  // Inline quantity edit ('' = unlimited)
  const handleQtyChange = async (item, raw) => {
    let qty = null;
    if (raw !== '' && raw !== null) {
      qty = parseInt(raw, 10);
      if (Number.isNaN(qty) || qty < 0) {
        toast.warning('Quantity must be 0 or more (leave blank for unlimited).');
        return;
      }
    }
    try {
      await updateMenuItemStock(activeRestaurantId, item.id, qty);
      const patch = { stockQty: qty };
      if (qty !== null) patch.isAvailable = qty > 0;
      patchLocalItem(item.id, patch);
      if (qty === 0) toast.info(`${item.name} is now Out of Stock.`);
    } catch (err) {
      toast.error(explainError(err, 'Failed to update quantity.'));
    }
  };

  const handleDeleteItem = async (item) => {
    if (!window.confirm(`Delete "${item.name}" from the menu?`)) return;
    try {
      await deleteMenuItem(activeRestaurantId, item.id);
      toast.success('Menu item deleted!');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      toast.error(explainError(err, 'Failed to delete item.'));
    }
  };

  const publicMenuPath = `/menu/${activeRestaurantId}`;

  const handleCopyPublicLink = async () => {
    const url = `${window.location.origin}${publicMenuPath}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Public menu link copied!');
    } catch (err) {
      window.prompt('Copy this public menu link:', url);
    }
  };

  const sampleItems = items.filter(
    (i) => SAMPLE_SKUS.includes(i.sku) && SAMPLE_NAMES.includes(i.name)
  );

  const handleRemoveSampleItems = async () => {
    if (sampleItems.length === 0) return;
    if (!window.confirm(
      `Remove ${sampleItems.length} sample dish(es) that came with the demo data (${sampleItems.map((i) => i.name).join(', ')})? Your own dishes are not touched.`
    )) return;

    try {
      setSaving(true);
      const sampleIds = new Set(sampleItems.map((i) => i.id));
      await Promise.all(sampleItems.map((i) => deleteMenuItem(activeRestaurantId, i.id)));

      // Also drop the demo categories, but only if nothing of yours is left in them.
      const emptyDemoCats = categories.filter(
        (c) =>
          SAMPLE_CATEGORIES.includes(c.name) &&
          !items.some((i) => i.categoryId === c.id && !sampleIds.has(i.id))
      );
      await Promise.all(emptyDemoCats.map((c) => deleteCategory(activeRestaurantId, c.id)));

      setSelectedCat('ALL');
      toast.success('Sample items removed.');
      fetchData();
    } catch (err) {
      toast.error(explainError(err, 'Failed to remove sample items.'));
    } finally {
      setSaving(false);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesCat = selectedCat === 'ALL' || item.categoryId === selectedCat;
    const q = search.toLowerCase();
    const matchesSearch =
      q === '' ||
      (item.name || '').toLowerCase().includes(q) ||
      (item.sku && item.sku.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  const soldOutCount = items.filter(isItemSoldOut).length;
  const lowStockCount = items.filter((i) => !isItemSoldOut(i) && isLowStock(i)).length;

  return (
    <div className="space-y-6">
      {/* Top Title & Quick Actions */}
      <div className="pos-surface-glass p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
              <Utensils className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight font-display">
                Menu & Catalog Management
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Add, edit or update dishes, live pricing, stock inventory, and digital QR availability
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchData}
            className="pos-btn-touch p-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-300 border border-pos-border shadow-sm"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-500 dark:text-emerald-400' : ''}`} />
          </button>
          <a
            href={publicMenuPath}
            target="_blank"
            rel="noreferrer"
            className="pos-btn-touch flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-200 text-xs font-bold border border-pos-border shadow-sm transition-colors"
            title="Open the customer-facing menu"
          >
            <ExternalLink className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
            <span>Public Menu</span>
          </a>
          <button
            onClick={handleCopyPublicLink}
            className="pos-btn-touch flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-200 text-xs font-bold border border-pos-border shadow-sm transition-colors"
            title="Copy the public menu link to share or put in a QR code"
          >
            <Link2 className="w-3.5 h-3.5 text-sky-500 dark:text-sky-400" />
            <span>Copy Link</span>
          </button>
          <button
            onClick={() => handleOpenCatModal()}
            className="pos-btn-touch flex items-center space-x-1.5 px-3.5 py-2.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-200 text-xs font-bold border border-pos-border shadow-sm transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
            <span>Add Category</span>
          </button>
          <button
            onClick={() => handleOpenItemModal()}
            className="pos-btn-touch flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-pos-glow transition-all"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Menu Item</span>
          </button>
        </div>
      </div>

      {/* Demo data notice */}
      {!loading && sampleItems.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-200 backdrop-blur-md">
          <span className="font-semibold">
            This menu still has {sampleItems.length} sample dish(es) from the demo data. Customers can see them on the public menu.
          </span>
          <button
            onClick={handleRemoveSampleItems}
            disabled={saving}
            className="pos-btn-touch flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold disabled:opacity-60 shrink-0 shadow"
          >
            <Eraser className="w-3.5 h-3.5" />
            <span>Remove sample items</span>
          </button>
        </div>
      )}

      {/* Stock summary */}
      {!loading && items.length > 0 && (soldOutCount > 0 || lowStockCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {soldOutCount > 0 && (
            <span className="px-3 py-1 rounded-full bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 font-bold font-num">
              {soldOutCount} out of stock
            </span>
          )}
          {lowStockCount > 0 && (
            <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-bold flex items-center space-x-1.5 font-num">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{lowStockCount} running low</span>
            </span>
          )}
        </div>
      )}

      {/* Category Pills Strip */}
      <div className="pos-surface-glass p-3.5 rounded-2xl flex items-center space-x-2 overflow-x-auto shadow-md">
        <button
          onClick={() => setSelectedCat('ALL')}
          className={`pos-btn-touch px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
            selectedCat === 'ALL'
              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
              : 'bg-pos-dark text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
          }`}
        >
          All Items ({items.length})
        </button>
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center space-x-1 shrink-0">
            <button
              onClick={() => setSelectedCat(cat.id)}
              className={`pos-btn-touch px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCat === cat.id
                  ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
                  : 'bg-pos-dark text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border'
              }`}
            >
              {cat.name} ({items.filter((i) => i.categoryId === cat.id).length})
            </button>
            <button
              onClick={() => handleOpenCatModal(cat)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              title="Edit / Delete Category"
            >
              <Edit2 className="w-3 h-3" />
            </button>
          </div>
        ))}
        {categories.length === 0 && !loading && (
          <span className="text-xs text-slate-500 px-2 font-medium">
            No categories yet. Click "Add Category" or just add an item and create one there.
          </span>
        )}
      </div>

      {/* Search and Table */}
      <div className="pos-card-glass rounded-2xl overflow-hidden shadow-xl space-y-4 p-5">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search items by name or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-pos-dark border border-pos-border rounded-xl text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 font-medium"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-pos-dark text-slate-600 dark:text-slate-400 border-b border-pos-border">
              <tr>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Dish & Photo</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Category</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Type</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Price</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Quantity</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px]">Status</th>
                <th className="py-3.5 px-4 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-pos-border">
              {loading ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-400 font-semibold">
                    Loading menu...
                  </td>
                </tr>
              ) : filteredItems.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-10 text-center text-slate-500 font-semibold">
                    No menu items found. Click "Add Menu Item" to create one.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  const qty = getStockQty(item);
                  const soldOut = isItemSoldOut(item);
                  const low = !soldOut && isLowStock(item);
                  return (
                    <tr key={item.id} className="hover:bg-pos-surface/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center space-x-3">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.name}
                              className="w-10 h-10 rounded-xl object-cover bg-pos-dark border border-pos-border shrink-0 shadow-sm"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-xl bg-pos-dark border border-pos-border flex items-center justify-center text-slate-400 shrink-0">
                              <Utensils className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <p className="font-extrabold text-slate-900 dark:text-slate-100">{item.name}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">{item.description}</p>
                            {item.sku && <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono font-bold">SKU: {item.sku}</span>}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-semibold">
                        {item.categoryName || categories.find((c) => c.id === item.categoryId)?.name || 'General'}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-extrabold ${
                            item.isVeg
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.isVeg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <span>{item.isVeg ? 'Veg' : 'Non-Veg'}</span>
                        </span>
                      </td>

                      {/* Inline price */}
                      <td className="py-3 px-4">
                        <InlineNumber
                          value={item.price}
                          prefix={currencySymbol}
                          step="0.01"
                          width="w-20"
                          onCommit={(v) => handleInlinePrice(item, v)}
                        />
                      </td>

                      {/* Inline quantity */}
                      <td className="py-3 px-4">
                        <div className="inline-flex items-center space-x-1">
                          <button
                            type="button"
                            disabled={qty === null || qty <= 0}
                            onClick={() => handleQtyChange(item, String(qty - 1))}
                            className="p-1 rounded-lg bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-300 border border-pos-border disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <InlineNumber
                            value={qty}
                            step="1"
                            width="w-16"
                            placeholder="∞"
                            onCommit={(v) => handleQtyChange(item, v)}
                          />
                          <button
                            type="button"
                            onClick={() => handleQtyChange(item, String((qty ?? 0) + 1))}
                            className="p-1 rounded-lg bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-300 border border-pos-border"
                            title="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="mt-1 text-[10px]">
                          {qty === null ? (
                            <span className="text-slate-400 dark:text-slate-500 font-semibold">Unlimited</span>
                          ) : low ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">Low stock</span>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleAvailability(item)}
                          className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold transition-colors ${
                            !soldOut
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30 hover:bg-rose-500/25'
                          }`}
                          title="Click to toggle In Stock / Out of Stock"
                        >
                          <span className={`w-2 h-2 rounded-full ${!soldOut ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
                          <span>{!soldOut ? 'In Stock' : 'Out of Stock'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                        <button
                          onClick={() => handleOpenItemModal(item)}
                          className="p-1.5 rounded-xl bg-pos-dark hover:bg-pos-surface text-slate-700 dark:text-slate-300 border border-pos-border hover:text-emerald-500 dark:hover:text-emerald-400 shadow-sm"
                          title="Edit Item"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1.5 rounded-xl bg-pos-dark hover:bg-rose-500/15 text-slate-700 dark:text-slate-300 border border-pos-border hover:text-rose-600 dark:hover:text-rose-400 shadow-sm"
                          title="Delete Item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
          Tip: click a price or quantity to edit it directly, then press Enter. Leave quantity empty for unlimited stock. Quantity 0 marks the dish Out of Stock automatically, and orders reduce quantity automatically.
        </p>
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
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Category Name *</label>
              <input
                type="text"
                required
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                placeholder="e.g. Starters, Main Course, Drinks"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={catDesc}
                onChange={(e) => setCatDesc(e.target.value)}
                placeholder="Short description"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Display Order</label>
              <input
                type="number"
                value={catOrder}
                onChange={(e) => setCatOrder(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
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
                  className="px-3.5 py-2 rounded-xl bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 font-bold"
                >
                  Delete Category
                </button>
              ) : <div />}

              <div className="space-x-2">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-pos-dark text-slate-700 dark:text-slate-300 font-bold hover:bg-pos-surface border border-pos-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Category'}
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
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Item Name *</label>
                <input
                  type="text"
                  required
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="e.g. Chicken Biryani"
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Price ({currencySymbol}) *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={itemPrice}
                  onChange={(e) => setItemPrice(e.target.value)}
                  placeholder="250.00"
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-num"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Category *</label>
                <select
                  value={itemCatId}
                  onChange={(e) => setItemCatId(e.target.value)}
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-pos-card text-slate-900 dark:text-white">
                      {c.name}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY} className="bg-pos-card text-slate-900 dark:text-white">+ Create new category...</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Quantity in stock</label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  value={itemQty}
                  onChange={(e) => setItemQty(e.target.value)}
                  placeholder="Blank = unlimited"
                  className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-num"
                />
              </div>
            </div>

            {itemCatId === NEW_CATEGORY && (
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">New Category Name *</label>
                <input
                  type="text"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  placeholder="e.g. Starters, Main Course, Drinks"
                  className="w-full px-3 py-2 bg-pos-dark border border-emerald-500 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>
            )}

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">SKU / Item Code</label>
              <input
                type="text"
                value={itemSku}
                onChange={(e) => setItemSku(e.target.value)}
                placeholder="e.g. MAIN-01"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* ImgBB Image Uploader */}
            <ImgBBUploader
              label="Dish Photo (optional)"
              value={itemImg}
              onChange={setItemImg}
            />

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Description</label>
              <textarea
                rows={2}
                value={itemDesc}
                onChange={(e) => setItemDesc(e.target.value)}
                placeholder="Short description of the dish..."
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex items-center space-x-6 py-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemIsVeg}
                  onChange={(e) => setItemIsVeg(e.target.checked)}
                  className="rounded bg-pos-dark border-pos-border text-emerald-500 focus:ring-0"
                />
                <span className="text-slate-700 dark:text-slate-200 font-bold">Vegetarian Item</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={itemAvailable}
                  onChange={(e) => setItemAvailable(e.target.checked)}
                  className="rounded bg-pos-dark border-pos-border text-emerald-500 focus:ring-0"
                />
                <span className="text-slate-700 dark:text-slate-200 font-bold">Available for Order</span>
              </label>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-pos-border">
              <button
                type="button"
                onClick={() => setIsItemModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-pos-dark text-slate-700 dark:text-slate-300 font-bold hover:bg-pos-surface border border-pos-border"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow disabled:opacity-60"
              >
                {saving ? 'Saving...' : editingItem ? 'Update Menu Item' : 'Add Item to Menu'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
