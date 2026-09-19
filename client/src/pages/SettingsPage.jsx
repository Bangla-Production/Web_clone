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
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import {
  getRestaurantById,
  updateRestaurant,
  getStaffByRestaurant,
  saveUserProfile
} from '../services/firestoreService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import ImgBBUploader from '../components/common/ImgBBUploader';

export default function SettingsPage() {
  const { activeRestaurantId } = useAuth();
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
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPass, setStaffPass] = useState('');
  const [staffRole, setStaffRole] = useState('staff');
  const [staffPhone, setStaffPhone] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
        .then(setStaffList)
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

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!staffName || !staffEmail) return;

    try {
      const newUid = `staff-${Date.now()}`;
      await saveUserProfile(newUid, {
        name: staffName,
        email: staffEmail,
        role: staffRole,
        phone: staffPhone,
        restaurantId: activeRestaurantId
      });

      toast.success(`Account created for ${staffName}!`);
      setIsAddStaffOpen(false);
      setStaffName('');
      setStaffEmail('');
      const updated = await getStaffByRestaurant(activeRestaurantId);
      setStaffList(updated);
    } catch (err) {
      toast.error('Failed to create staff account.');
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
      </div>

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
              <p className="text-xs text-slate-400">Manage POS captains and kitchen staff</p>
            </div>
            <button
              onClick={() => setIsAddStaffOpen(true)}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Staff Member</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 font-semibold">Staff Member</th>
                  <th className="py-2.5 font-semibold">Email</th>
                  <th className="py-2.5 font-semibold">Role</th>
                  <th className="py-2.5 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan="4" className="py-6 text-center text-slate-500">
                      No staff members added yet.
                    </td>
                  </tr>
                ) : (
                  staffList.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/30">
                      <td className="py-3 font-semibold text-slate-200">{u.name}</td>
                      <td className="py-3 text-slate-400 font-mono">{u.email}</td>
                      <td className="py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.role === 'restaurant_admin'
                              ? 'bg-purple-950 text-purple-300 border border-purple-800'
                              : u.role === 'staff'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800'
                              : 'bg-orange-950 text-orange-300 border border-orange-800'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex items-center space-x-1 text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Active</span>
                        </span>
                      </td>
                    </tr>
                  ))
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
          title="Create Staff Member"
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
              <label className="block font-semibold text-slate-300 mb-1">Login Email *</label>
              <input
                type="email"
                required
                value={staffEmail}
                onChange={(e) => setStaffEmail(e.target.value)}
                placeholder="suman@spicehaven.com"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Role *</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="staff">Staff / Captain (POS, Orders & Billing)</option>
                <option value="kitchen">Kitchen Chef (Kitchen KDS Screen)</option>
                <option value="restaurant_admin">Restaurant Admin (Full Restaurant Control)</option>
              </select>
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
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md"
              >
                Create Staff
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
