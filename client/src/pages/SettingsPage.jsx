import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  DollarSign,
  Receipt,
  Users,
  Shield,
  Save,
  Plus,
  CheckCircle2,
  Image as ImageIcon,
  Key,
  Trash2,
  Lock,
  Phone,
  Database,
  Bike,
  Navigation
} from 'lucide-react';
import {
  getRestaurantById,
  updateRestaurant,
  getStaffByRestaurant,
  createRestaurantStaff,
  updateProvisionedUser,
  deleteRestaurantStaff
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import ImgBBUploader from '../components/common/ImgBBUploader';
import DataCleanupPanel from '../components/settings/DataCleanupPanel';

export default function SettingsPage() {
  const { activeRestaurantId, user } = useAuth();
  const { restaurant, updateRestaurant: updateContextRest, refetch } = useRestaurant();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('GENERAL');

  // Restaurant details form state
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [currencySymbol, setCurrencySymbol] = useState('₹');
  const [taxRate, setTaxRate] = useState('5.0');
  const [taxName, setTaxName] = useState('GST');
  const [invoiceHeader, setInvoiceHeader] = useState('');
  const [invoiceFooter, setInvoiceFooter] = useState('');

  // Delivery Fee configuration state
  const [deliveryFeeMode, setDeliveryFeeMode] = useState('DISTANCE_BASED'); // 'DISTANCE_BASED' | 'FIXED' | 'FREE'
  const [fixedDeliveryFee, setFixedDeliveryFee] = useState('30');
  const [baseDeliveryFee, setBaseDeliveryFee] = useState('30');
  const [baseDeliveryKm, setBaseDeliveryKm] = useState('3');
  const [perKmDeliveryFee, setPerKmDeliveryFee] = useState('10');
  const [freeDeliveryAbove, setFreeDeliveryAbove] = useState('500');
  const [deliveryRadiusKm, setDeliveryRadiusKm] = useState('12');
  const [prepTimeMinutes, setPrepTimeMinutes] = useState('20');

  // Staff accounts state
  const [staffList, setStaffList] = useState([]);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [customStaffId, setCustomStaffId] = useState('');
  const [staffPass, setStaffPass] = useState('');
  const [staffRole, setStaffRole] = useState('waiter');
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [staffResult, setStaffResult] = useState(null);

  useEffect(() => {
    if (restaurant) {
      setName(restaurant.name || '');
      setTagline(restaurant.tagline || '');
      setLogoUrl(restaurant.logoUrl || '');
      setBannerUrl(restaurant.bannerUrl || '');
      setAddress(restaurant.address || '');
      setPhone(restaurant.phone || '');
      setEmail(restaurant.email || '');
      setGstin(restaurant.gstin || '');
      setCurrency(restaurant.currency || 'INR');
      setCurrencySymbol(restaurant.currencySymbol || '₹');
      setTaxRate(restaurant.taxRate !== undefined ? String(restaurant.taxRate) : '5.0');
      setTaxName(restaurant.taxName || 'GST');
      setInvoiceHeader(restaurant.invoiceHeader || '');
      setInvoiceFooter(restaurant.invoiceFooter || '');
      setDeliveryFeeMode(restaurant.deliveryFeeMode || 'DISTANCE_BASED');
      setFixedDeliveryFee(restaurant.fixedDeliveryFee !== undefined ? String(restaurant.fixedDeliveryFee) : '30');
      setBaseDeliveryFee(restaurant.baseDeliveryFee !== undefined ? String(restaurant.baseDeliveryFee) : '30');
      setBaseDeliveryKm(restaurant.baseDeliveryKm !== undefined ? String(restaurant.baseDeliveryKm) : '3');
      setPerKmDeliveryFee(restaurant.perKmDeliveryFee !== undefined ? String(restaurant.perKmDeliveryFee) : '10');
      setFreeDeliveryAbove(restaurant.freeDeliveryAbove !== undefined ? String(restaurant.freeDeliveryAbove) : '500');
      setDeliveryRadiusKm(restaurant.deliveryRadiusKm !== undefined ? String(restaurant.deliveryRadiusKm) : '12');
      setPrepTimeMinutes(restaurant.prepTimeMinutes !== undefined ? String(restaurant.prepTimeMinutes) : '20');
    }
  }, [restaurant]);

  useEffect(() => {
    if (activeTab === 'STAFF') {
      getStaffByRestaurant(activeRestaurantId)
        .then(list => setStaffList((list || []).filter(u => u.role !== 'restaurant_admin')))
        .catch(() => {});
    }
  }, [activeTab, activeRestaurantId]);

  const handleSaveRestaurant = async (e) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      const payload = {
        name,
        tagline,
        logoUrl,
        bannerUrl,
        address,
        phone,
        email,
        gstin,
        currency,
        currencySymbol,
        taxRate: parseFloat(taxRate) || 0,
        taxName,
        invoiceHeader,
        invoiceFooter,
        deliveryFeeMode,
        fixedDeliveryFee: parseFloat(fixedDeliveryFee) || 0,
        baseDeliveryFee: parseFloat(baseDeliveryFee) || 0,
        baseDeliveryKm: parseFloat(baseDeliveryKm) || 3,
        perKmDeliveryFee: parseFloat(perKmDeliveryFee) || 0,
        freeDeliveryAbove: parseFloat(freeDeliveryAbove) || 0,
        deliveryRadiusKm: parseFloat(deliveryRadiusKm) || 12,
        prepTimeMinutes: parseInt(prepTimeMinutes, 10) || 20
      };
      await updateContextRest(payload);
    } finally {
      setIsSaving(false);
    }
  };

  const generateStaffPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '@' + Math.floor(10 + Math.random() * 90);
    setStaffPass(result);
  };

  const generateNumericId = () => {
    const randomId = String(Math.floor(100000 + Math.random() * 900000));
    setCustomStaffId(randomId);
  };

  const handleOpenAddStaff = () => {
    setStaffName('');
    setStaffPhone('');
    setStaffRole('waiter');
    generateNumericId();
    generateStaffPassword();
    setIsAddStaffOpen(true);
  };

  const refreshStaff = async () => {
    const updated = await getStaffByRestaurant(activeRestaurantId);
    setStaffList(updated.filter(u => u.role !== 'restaurant_admin'));
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!staffName.trim() || !staffPhone.trim() || !staffPass.trim()) {
      toast.warning('Name, phone number and password are required.');
      return;
    }
    if (customStaffId && !/^\d+$/.test(customStaffId.trim())) {
      toast.warning('Staff ID must be purely numerical (digits only).');
      return;
    }
    if (staffPass.trim().length < 6) {
      toast.warning('Password must be at least 6 characters.');
      return;
    }

    try {
      setIsCreatingStaff(true);
      const { account, staffId } = await createRestaurantStaff(activeRestaurantId, restaurant?.name || activeRestaurantId, {
        name: staffName.trim(),
        phone: staffPhone.trim(),
        staffId: customStaffId.trim(),
        password: staffPass.trim(),
        role: staffRole,
        createdBy: user?.email || 'Restaurant Admin'
      });

      toast.success(`Staff account created for ${account.name}. Staff ID: ${staffId}`);

      setIsAddStaffOpen(false);
      setStaffResult({
        staffId,
        name: account.name,
        role: account.role,
        password: staffPass.trim()
      });
      await refreshStaff();
    } catch (err) {
      console.error('handleCreateStaff error:', err);
      toast.error(err?.message || 'Failed to create staff account.');
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const handleToggleStaffStatus = async (member) => {
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    try {
      await updateProvisionedUser(member.id, { status: nextStatus });
      toast.success(`Account ${nextStatus}!`);
      await refreshStaff();
    } catch (err) {
      toast.error('Failed to update account status.');
    }
  };

  const handleDeleteStaff = async (member) => {
    if (!window.confirm(`Remove login access for "${member.name}" (Staff ID ${member.staffId || '—'})?`)) return;
    try {
      await deleteRestaurantStaff(member);
      toast.success('Staff account removed.');
      await refreshStaff();
    } catch (err) {
      toast.error('Failed to remove staff account.');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="pos-surface-glass p-5 rounded-2xl flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 dark:text-amber-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight font-display">
                Restaurant Settings
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-medium">
                Branding, ImgBB logo assets, tax configuration, and staff management
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pos-surface-glass p-2 rounded-2xl flex flex-wrap items-center gap-2 shadow-md">
        <button
          onClick={() => setActiveTab('GENERAL')}
          className={`pos-btn-touch flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'GENERAL'
              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-surface'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>General & ImgBB Branding</span>
        </button>

        <button
          onClick={() => setActiveTab('TAX_INVOICE')}
          className={`pos-btn-touch flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'TAX_INVOICE'
              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-surface'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Taxes & Receipts</span>
        </button>

        <button
          onClick={() => setActiveTab('DELIVERY')}
          className={`pos-btn-touch flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'DELIVERY'
              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-surface'
          }`}
        >
          <Bike className="w-4 h-4" />
          <span>Delivery & Fees</span>
        </button>

        <button
          onClick={() => setActiveTab('STAFF')}
          className={`pos-btn-touch flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'STAFF'
              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-surface'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Accounts</span>
        </button>

        <button
          onClick={() => setActiveTab('DATA')}
          className={`pos-btn-touch flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'DATA'
              ? 'bg-emerald-500 text-slate-950 font-extrabold shadow-pos-glow'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-surface'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>Data Cleanup</span>
        </button>
      </div>

      {/* DATA & STORAGE TAB */}
      {activeTab === 'DATA' && <DataCleanupPanel restaurantId={activeRestaurantId} />}

      {/* GENERAL TAB */}
      {activeTab === 'GENERAL' && (
        <form onSubmit={handleSaveRestaurant} className="space-y-5 pos-card-glass rounded-2xl p-6 shadow-xl text-xs">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-200 pb-2 border-b border-pos-border font-display">
            Restaurant Profile & ImgBB Brand Assets
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Restaurant Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tagline / Slogan</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Authentic Flavors & Fine Dining"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Logo ImgBB Uploader */}
            <ImgBBUploader
              label="Restaurant Logo (Uploaded to ImgBB)"
              value={logoUrl}
              onChange={setLogoUrl}
            />

            {/* Banner ImgBB Uploader */}
            <ImgBBUploader
              label="Customer Menu Banner (Uploaded to ImgBB)"
              value={bannerUrl}
              onChange={setBannerUrl}
            />
          </div>

          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Restaurant Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">GSTIN / Tax ID</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="19AABCS1429B1Z8"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-pos-border">
            <button
              type="submit"
              disabled={isSaving}
              className="pos-btn-touch flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving to Firestore...' : 'Save General Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAX & INVOICE TAB */}
      {activeTab === 'TAX_INVOICE' && (
        <form onSubmit={handleSaveRestaurant} className="space-y-5 pos-card-glass rounded-2xl p-6 shadow-xl text-xs">
          <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-200 pb-2 border-b border-pos-border font-display">
            Tax Engine & Receipt Customization
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Currency Code</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="INR, USD, EUR"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Currency Symbol</label>
              <input
                type="text"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="₹, $, €"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="5.0"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-num"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Tax Display Name</label>
              <input
                type="text"
                value={taxName}
                onChange={(e) => setTaxName(e.target.value)}
                placeholder="GST, VAT, Sales Tax"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Invoice Header</label>
              <input
                type="text"
                value={invoiceHeader}
                onChange={(e) => setInvoiceHeader(e.target.value)}
                placeholder="Tax Invoice / Cash Memo"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Invoice Footer Note / FSSAI License</label>
              <input
                type="text"
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                placeholder="FSSAI Lic: 12822019000123 • Thank you for dining with us!"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-pos-border">
            <button
              type="submit"
              disabled={isSaving}
              className="pos-btn-touch flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Tax & Receipt Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* DELIVERY & CHARGES TAB */}
      {activeTab === 'DELIVERY' && (
        <form onSubmit={handleSaveRestaurant} className="space-y-6 pos-card-glass rounded-2xl p-6 shadow-xl text-xs">
          <div>
            <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-200 pb-2 border-b border-pos-border font-display flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Bike className="w-4 h-4 text-emerald-500" />
                <span>Delivery Pricing Engine & Service Controls</span>
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                Mode: {deliveryFeeMode === 'FREE' ? 'Free Delivery' : deliveryFeeMode === 'FIXED' ? 'Flat Fee' : 'Distance Auto'}
              </span>
            </h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1.5 text-xs">
              Configure how delivery fees are calculated for consumers during online checkout.
            </p>
          </div>

          {/* Pricing Mode Selector */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-2">
              Delivery Fee Pricing Model *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryFeeMode('DISTANCE_BASED')}
                className={`p-3.5 rounded-xl border text-left transition-all pos-btn-touch ${
                  deliveryFeeMode === 'DISTANCE_BASED'
                    ? 'bg-emerald-500/15 border-emerald-500 text-slate-900 dark:text-white shadow-pos-glow'
                    : 'bg-pos-dark border-pos-border text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs">🚗 Distance-Based</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-500">Auto Per Km</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Calculates base fee for initial km, plus rate per additional km to customer.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryFeeMode('FIXED')}
                className={`p-3.5 rounded-xl border text-left transition-all pos-btn-touch ${
                  deliveryFeeMode === 'FIXED'
                    ? 'bg-amber-500/15 border-amber-500 text-slate-900 dark:text-white shadow-pos-amber'
                    : 'bg-pos-dark border-pos-border text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs">🏷️ Fixed Flat Fee</span>
                  <span className="text-[10px] font-mono font-bold text-amber-500">Fixed ₹</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Charge a consistent delivery fee on every order regardless of distance.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setDeliveryFeeMode('FREE')}
                className={`p-3.5 rounded-xl border text-left transition-all pos-btn-touch ${
                  deliveryFeeMode === 'FREE'
                    ? 'bg-purple-500/15 border-purple-500 text-slate-900 dark:text-white shadow-pos-purple'
                    : 'bg-pos-dark border-pos-border text-slate-600 dark:text-slate-400 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-xs">🎁 Always Free</span>
                  <span className="text-[10px] font-mono font-bold text-purple-500">₹0 Delivery</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-snug">
                  Zero delivery fee for all customers to promote higher online order volume.
                </p>
              </button>
            </div>
          </div>

          {/* Conditional Controls based on mode */}
          {deliveryFeeMode === 'FIXED' && (
            <div className="p-4 rounded-xl bg-pos-dark border border-pos-border space-y-3">
              <label className="block font-bold text-slate-700 dark:text-slate-300">
                Fixed Flat Delivery Fee (₹) *
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={fixedDeliveryFee}
                onChange={(e) => setFixedDeliveryFee(e.target.value)}
                placeholder="e.g. 30"
                className="w-full sm:w-64 px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-num font-bold focus:outline-none focus:border-amber-500"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Customers will be charged exactly ₹{fixedDeliveryFee || 0} for delivery.
              </p>
            </div>
          )}

          {deliveryFeeMode === 'DISTANCE_BASED' && (
            <div className="p-4 rounded-xl bg-pos-dark border border-pos-border space-y-4">
              <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-200">
                Auto Per-Kilometer Distance Rules
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Base Delivery Fee (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={baseDeliveryFee}
                    onChange={(e) => setBaseDeliveryFee(e.target.value)}
                    placeholder="30"
                    className="w-full px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-num focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Starting charge</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Base Distance Covered (km)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={baseDeliveryKm}
                    onChange={(e) => setBaseDeliveryKm(e.target.value)}
                    placeholder="3"
                    className="w-full px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-num focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Included in base fee</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Rate per Extra Km (₹/km)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={perKmDeliveryFee}
                    onChange={(e) => setPerKmDeliveryFee(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 bg-pos-surface border border-pos-border rounded-xl text-slate-900 dark:text-white font-num focus:outline-none focus:border-emerald-500"
                  />
                  <span className="text-[10px] text-slate-500">Beyond base km</span>
                </div>
              </div>
            </div>
          )}

          {/* Common Delivery Thresholds & Constraints */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-pos-border">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Free Delivery Above Order (₹)
              </label>
              <input
                type="number"
                min="0"
                value={freeDeliveryAbove}
                onChange={(e) => setFreeDeliveryAbove(e.target.value)}
                placeholder="500 (0 to disable)"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white font-num focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500">0 disables free threshold</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Max Service Radius (km)
              </label>
              <input
                type="number"
                min="1"
                value={deliveryRadiusKm}
                onChange={(e) => setDeliveryRadiusKm(e.target.value)}
                placeholder="12"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white font-num focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500">Orders beyond are blocked</span>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                Kitchen Prep Time (mins)
              </label>
              <input
                type="number"
                min="5"
                value={prepTimeMinutes}
                onChange={(e) => setPrepTimeMinutes(e.target.value)}
                placeholder="20"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white font-num focus:outline-none focus:border-emerald-500"
              />
              <span className="text-[10px] text-slate-500">Estimated cooking duration</span>
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-pos-border">
            <button
              type="submit"
              disabled={isSaving}
              className="pos-btn-touch flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow transition-all"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Delivery & Fee Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* STAFF ACCOUNTS TAB */}
      {activeTab === 'STAFF' && (
        <div className="space-y-4 pos-card-glass rounded-2xl p-6 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-pos-border">
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 dark:text-slate-200 font-display">Staff Accounts ({activeRestaurantId})</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Manage waiter, kitchen and cashier logins</p>
            </div>
            <button
              onClick={handleOpenAddStaff}
              className="pos-btn-touch flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold shadow-pos-glow"
            >
              <Key className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>Create Staff Login</span>
            </button>
          </div>

          <div className="p-3 bg-sky-500/10 border border-sky-500/25 rounded-xl text-[11px] text-sky-800 dark:text-sky-300 flex items-center space-x-2">
            <Lock className="w-4 h-4 text-sky-500 shrink-0" />
            <span>Each staff member gets a unique numeric Staff ID and password — no email needed. Accounts are active immediately and scoped to this restaurant only. Only you (the Restaurant Admin) can see this list.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-pos-dark text-slate-600 dark:text-slate-400 border-b border-pos-border">
                <tr>
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Staff Member</th>
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Phone</th>
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Staff ID</th>
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Role</th>
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px]">Status</th>
                  <th className="py-2.5 px-3 font-bold uppercase tracking-wider text-[10px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pos-border">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-500 font-semibold">
                      No staff members added yet.
                    </td>
                  </tr>
                ) : (
                  staffList.map((u) => {
                    return (
                      <tr key={u.id} className="hover:bg-pos-surface/60 transition-colors">
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-slate-200">{u.name}</td>
                        <td className="py-3 px-3 text-slate-600 dark:text-slate-400 font-mono">{u.phone || '—'}</td>
                        <td className="py-3 px-3 text-slate-900 dark:text-white font-mono font-bold">{u.staffId || '—'}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                              u.role === 'kitchen'
                                ? 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30'
                                : u.role === 'cashier'
                                ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30'
                                : 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border border-blue-500/30'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <button
                            type="button"
                            onClick={() => handleToggleStaffStatus(u)}
                            className={`px-2.5 py-0.5 rounded text-[10px] font-extrabold uppercase transition-all ${
                              (u.status || 'active') === 'active'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                            }`}
                            title="Toggle status"
                          >
                            {u.status || 'active'}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(u)}
                            className="p-1.5 rounded-xl bg-pos-dark hover:bg-rose-500/15 text-slate-600 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 border border-pos-border transition-colors shadow-sm"
                            title="Remove Login"
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
        </div>
      )}

      {/* Add Staff Modal */}
      {isAddStaffOpen && (
        <Modal
          isOpen={isAddStaffOpen}
          onClose={() => setIsAddStaffOpen(false)}
          title="Create Staff Login (Waiter / Cooker / Cashier)"
        >
          <form onSubmit={handleCreateStaff} className="space-y-3.5 text-xs">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="e.g. Suman Sen"
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number *</label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="tel"
                  required
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300">Unique Numerical ID *</label>
                <button
                  type="button"
                  onClick={generateNumericId}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                >
                  Generate ID
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono font-bold text-xs">#</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={customStaffId}
                  onChange={(e) => setCustomStaffId(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 482913"
                  className="w-full pl-8 pr-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1 font-medium">This unique number is used by the staff member to log into their panel.</p>
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">Staff Role *</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
              >
                <option value="waiter" className="bg-pos-card text-slate-900 dark:text-white">Waiter / Captain (POS, Table Orders & Floor)</option>
                <option value="kitchen" className="bg-pos-card text-slate-900 dark:text-white">Kitchen Cooker / Chef (Whole Table Orders & KDS Display)</option>
                <option value="cashier" className="bg-pos-card text-slate-900 dark:text-white">Cashier (Table Pricing & Cash/UPI/Card Billing)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-bold text-slate-700 dark:text-slate-300">Unique Password *</label>
                <button
                  type="button"
                  onClick={generateStaffPassword}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold"
                >
                  Generate Password
                </button>
              </div>
              <input
                type="text"
                required
                value={staffPass}
                onChange={(e) => setStaffPass(e.target.value)}
                className="w-full px-3 py-2 bg-pos-dark border border-pos-border rounded-xl text-slate-900 dark:text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2 border-t border-pos-border">
              <button
                type="button"
                onClick={() => setIsAddStaffOpen(false)}
                className="px-4 py-2 rounded-xl bg-pos-dark text-slate-700 dark:text-slate-300 font-bold hover:bg-pos-surface border border-pos-border"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingStaff}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow disabled:opacity-50"
              >
                {isCreatingStaff ? 'Registering Staff...' : 'Create Staff Login'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Staff created — share the Staff ID + password */}
      {staffResult && (
        <Modal
          isOpen={!!staffResult}
          onClose={() => setStaffResult(null)}
          title="✅ Staff Login Created"
        >
          <div className="space-y-3.5 text-xs">
            <div className="p-3.5 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-800 dark:text-emerald-200 font-medium">
              {staffResult.name}'s <strong>{staffResult.role}</strong> login is active right now — share these credentials with them.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 bg-pos-dark border border-pos-border rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Staff ID</p>
                <code className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">{staffResult.staffId}</code>
              </div>
              <div className="p-3.5 bg-pos-dark border border-pos-border rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1">Password</p>
                <code className="font-mono text-lg font-black text-emerald-600 dark:text-emerald-400">{staffResult.password}</code>
              </div>
            </div>
            <p className="text-slate-500 dark:text-slate-400">
              They can sign in on the <strong>Staff Login</strong> tab of the login screen with just this Staff ID and password.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStaffResult(null)}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold shadow-pos-glow"
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
