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
  Database
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
        invoiceFooter
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
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight">Restaurant Settings</h1>
        <p className="text-xs text-slate-400">
          Branding, ImgBB logo assets, tax configuration, and staff management
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('GENERAL')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'GENERAL'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          <span>General & ImgBB Branding</span>
        </button>

        <button
          onClick={() => setActiveTab('TAX_INVOICE')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'TAX_INVOICE'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Taxes & Receipts</span>
        </button>

        <button
          onClick={() => setActiveTab('STAFF')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'STAFF'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Staff Accounts</span>
        </button>

        <button
          onClick={() => setActiveTab('DATA')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'DATA'
              ? 'bg-emerald-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
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
        <form onSubmit={handleSaveRestaurant} className="space-y-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-xs">
          <h3 className="font-bold text-sm text-slate-200 pb-2 border-b border-slate-800">
            Restaurant Profile & ImgBB Brand Assets
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Restaurant Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Tagline / Slogan</label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Authentic Flavors & Fine Dining"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
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
            <label className="block font-semibold text-slate-300 mb-1">Full Restaurant Address</label>
            <textarea
              rows={2}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">GSTIN / Tax ID</label>
              <input
                type="text"
                value={gstin}
                onChange={(e) => setGstin(e.target.value)}
                placeholder="19AABCS1429B1Z8"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/30 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving to Firestore...' : 'Save General Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* TAX & INVOICE TAB */}
      {activeTab === 'TAX_INVOICE' && (
        <form onSubmit={handleSaveRestaurant} className="space-y-5 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-xs">
          <h3 className="font-bold text-sm text-slate-200 pb-2 border-b border-slate-800">
            Tax Engine & Receipt Customization
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Currency Code</label>
              <input
                type="text"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="INR, USD, EUR"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Currency Symbol</label>
              <input
                type="text"
                value={currencySymbol}
                onChange={(e) => setCurrencySymbol(e.target.value)}
                placeholder="₹, $, €"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Default Tax Rate (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                placeholder="5.0"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Tax Display Name</label>
              <input
                type="text"
                value={taxName}
                onChange={(e) => setTaxName(e.target.value)}
                placeholder="GST, VAT, Sales Tax"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-4 pt-2">
            <div>
              <label className="block font-semibold text-slate-300 mb-1">Invoice Header</label>
              <input
                type="text"
                value={invoiceHeader}
                onChange={(e) => setInvoiceHeader(e.target.value)}
                placeholder="Tax Invoice / Cash Memo"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Invoice Footer Note / FSSAI License</label>
              <input
                type="text"
                value={invoiceFooter}
                onChange={(e) => setInvoiceFooter(e.target.value)}
                placeholder="FSSAI Lic: 12822019000123 • Thank you for dining with us!"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="flex justify-end pt-3 border-t border-slate-800">
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-2 px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-900/30 transition-colors"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Tax & Receipt Settings'}</span>
            </button>
          </div>
        </form>
      )}

      {/* STAFF ACCOUNTS TAB */}
      {activeTab === 'STAFF' && (
        <div className="space-y-4 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <h3 className="font-bold text-sm text-slate-200">Staff Accounts ({activeRestaurantId})</h3>
              <p className="text-xs text-slate-400">Manage waiter, kitchen and cashier logins</p>
            </div>
            <button
              onClick={handleOpenAddStaff}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Create Staff Login</span>
            </button>
          </div>

          <div className="p-3 bg-sky-950/30 border border-sky-800/50 rounded-xl text-[11px] text-sky-300 flex items-center space-x-2">
            <Lock className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Each staff member gets a unique numeric Staff ID and password — no email needed. Accounts are active immediately and scoped to this restaurant only. Only you (the Restaurant Admin) can see this list.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 font-semibold">Staff Member</th>
                  <th className="py-2.5 font-semibold">Phone</th>
                  <th className="py-2.5 font-semibold">Staff ID</th>
                  <th className="py-2.5 font-semibold">Role</th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-6 text-center text-slate-500">
                      No staff members added yet.
                    </td>
                  </tr>
                ) : (
                  staffList.map((u) => {
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="py-3 font-semibold text-slate-200">{u.name}</td>
                        <td className="py-3 text-slate-400">{u.phone || '—'}</td>
                        <td className="py-3 text-slate-200 font-mono font-bold">{u.staffId || '—'}</td>
                        <td className="py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              u.role === 'kitchen'
                                ? 'bg-orange-950 text-orange-300 border border-orange-800'
                                : u.role === 'cashier'
                                ? 'bg-teal-950 text-teal-300 border border-teal-800'
                                : 'bg-blue-950 text-blue-300 border border-blue-800'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => handleToggleStaffStatus(u)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                              (u.status || 'active') === 'active'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-700'
                            }`}
                            title="Toggle status"
                          >
                            {u.status || 'active'}
                          </button>
                        </td>
                        <td className="py-3 text-right space-x-1.5">
                          <button
                            type="button"
                            onClick={() => handleDeleteStaff(u)}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
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
              <label className="block font-semibold text-slate-300 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={staffName}
                onChange={(e) => setStaffName(e.target.value)}
                placeholder="e.g. Suman Sen"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Phone Number *</label>
              <div className="relative">
                <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="tel"
                  required
                  value={staffPhone}
                  onChange={(e) => setStaffPhone(e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-300">Unique Numerical ID *</label>
                <button
                  type="button"
                  onClick={generateNumericId}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline"
                >
                  Generate ID
                </button>
              </div>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-mono font-bold text-xs">#</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  required
                  value={customStaffId}
                  onChange={(e) => setCustomStaffId(e.target.value.replace(/\D/g, ''))}
                  placeholder="e.g. 482913"
                  className="w-full pl-8 pr-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono font-bold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">This unique number is used by the staff member to log into their panel.</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Staff Role *</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="waiter">Waiter / Captain (POS, Table Orders & Floor)</option>
                <option value="kitchen">Kitchen Cooker / Chef (Whole Table Orders & KDS Display)</option>
                <option value="cashier">Cashier (Table Pricing & Cash/UPI/Card Billing)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-300">Unique Password *</label>
                <button
                  type="button"
                  onClick={generateStaffPassword}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline"
                >
                  Generate Password
                </button>
              </div>
              <input
                type="text"
                required
                value={staffPass}
                onChange={(e) => setStaffPass(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAddStaffOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingStaff}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md disabled:opacity-50"
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
            <div className="p-3 bg-emerald-950/60 border border-emerald-700 rounded-xl text-emerald-200">
              {staffResult.name}'s <strong>{staffResult.role}</strong> login is active right now — share these credentials with them.
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Staff ID</p>
                <code className="font-mono text-lg font-bold text-emerald-300">{staffResult.staffId}</code>
              </div>
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Password</p>
                <code className="font-mono text-lg font-bold text-emerald-300">{staffResult.password}</code>
              </div>
            </div>
            <p className="text-slate-400">
              They can sign in on the <strong>Staff Login</strong> tab of the login screen with just this Staff ID and password.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setStaffResult(null)}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
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
