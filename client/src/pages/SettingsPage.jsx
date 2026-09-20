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
  Image as ImageIcon,
  Key,
  Trash2,
  Lock,
  Mail,
  MailWarning,
  Clock,
  AlertCircle
} from 'lucide-react';
import {
  getRestaurantById,
  updateRestaurant,
  getStaffByRestaurant,
  createRestaurantStaff,
  updateProvisionedUser,
  deleteProvisionedUser,
  resendAccountVerification,
  syncAccountVerification
} from '../services/firestoreService';
import { SPAM_NOTICE } from '../services/authAccountService';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';
import ImgBBUploader from '../components/common/ImgBBUploader';

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
  const [staffEmail, setStaffEmail] = useState('');
  const [staffUsername, setStaffUsername] = useState('');
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

  const handleOpenAddStaff = () => {
    setStaffName('');
    setStaffEmail('');
    setStaffUsername('');
    setStaffRole('waiter');
    generateStaffPassword();
    setIsAddStaffOpen(true);
  };

  const refreshStaff = async () => {
    const updated = await getStaffByRestaurant(activeRestaurantId);
    setStaffList(updated.filter(u => u.role !== 'restaurant_admin'));
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    if (!staffName.trim() || !staffEmail.trim() || !staffPass.trim()) {
      toast.warning('Name, email and password are required.');
      return;
    }
    if (staffPass.trim().length < 6) {
      toast.warning('Password must be at least 6 characters.');
      return;
    }

    try {
      setIsCreatingStaff(true);
      // Same process as Super Admin: account is saved as "pending" and a real
      // confirmation email is sent. It becomes active only after confirmation.
      const { account, emailResult } = await createRestaurantStaff(activeRestaurantId, restaurant?.name || activeRestaurantId, {
        name: staffName.trim(),
        email: staffEmail.trim(),
        username: staffUsername.trim() || staffEmail.trim(),
        password: staffPass.trim(),
        role: staffRole,
        createdBy: user?.email || 'Restaurant Admin'
      });

      if (emailResult.success && !emailResult.alreadyVerified) {
        toast.warning(`Confirmation email sent to ${account.email}. Account is PENDING. It may go to Spam — check there too.`, 8000);
      } else if (emailResult.alreadyVerified) {
        toast.success(`${account.email} was already confirmed — account is active.`);
      } else {
        toast.error(`Account saved as PENDING, but the email could not be sent: ${emailResult.error}`, 9000);
      }

      setIsAddStaffOpen(false);
      setStaffResult({
        email: account.email,
        name: account.name,
        password: staffPass.trim(),
        sent: emailResult.success,
        alreadyVerified: !!emailResult.alreadyVerified,
        passwordReset: !!emailResult.passwordReset,
        error: emailResult.error || ''
      });
      await refreshStaff();
    } catch (err) {
      console.error('handleCreateStaff error:', err);
      toast.error('Failed to create staff account.');
    } finally {
      setIsCreatingStaff(false);
    }
  };

  const askStaffPassword = (member) =>
    window.prompt(`Passwords are not stored. Enter the password you set for ${member.email} to continue:`) || '';

  const handleCheckStaffVerification = async (member) => {
    const pw = askStaffPassword(member);
    if (!pw) return;
    try {
      const { verified, error } = await syncAccountVerification(member, pw);
      if (verified) {
        toast.success(`${member.email} confirmed their email — account is now ACTIVE.`);
      } else if (error) {
        toast.error(error);
      } else {
        toast.info(`${member.email} has not confirmed yet. Ask them to check Spam / Junk too.`);
      }
      await refreshStaff();
    } catch (err) {
      toast.error('Could not check confirmation status.');
    }
  };

  const handleResendStaffConfirmation = async (member) => {
    const pw = askStaffPassword(member);
    if (!pw) return;
    try {
      const result = await resendAccountVerification(member, pw);
      if (result.success && !result.alreadyVerified) {
        toast.warning(`Confirmation email resent to ${member.email}. It may go to Spam — check there too.`, 8000);
      } else if (result.alreadyVerified) {
        toast.success(`${member.email} is already confirmed — account activated.`);
      } else {
        toast.error(result.error || 'Failed to resend confirmation email.');
      }
      await refreshStaff();
    } catch (err) {
      toast.error('Failed to resend confirmation email.');
    }
  };

  const handleToggleStaffStatus = async (member) => {
    if (member.status === 'pending') {
      await handleCheckStaffVerification(member);
      return;
    }
    const nextStatus = member.status === 'active' ? 'suspended' : 'active';
    try {
      await updateProvisionedUser(member.id, { status: nextStatus });
      toast.success(`Account ${nextStatus}!`);
      const updated = await getStaffByRestaurant(activeRestaurantId);
      setStaffList(updated.filter(u => u.role !== 'restaurant_admin'));
    } catch (err) {
      toast.error('Failed to update account status.');
    }
  };

  const handleDeleteStaff = async (member) => {
    if (!window.confirm(`Remove login access for "${member.name}"?`)) return;
    try {
      await deleteProvisionedUser(member.id);
      toast.success('Staff account removed.');
      const updated = await getStaffByRestaurant(activeRestaurantId);
      setStaffList(updated.filter(u => u.role !== 'restaurant_admin'));
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
              onClick={handleOpenAddStaff}
              className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Create Staff Login</span>
            </button>
          </div>

          <div className="p-3 bg-sky-950/30 border border-sky-800/50 rounded-xl text-[11px] text-sky-300 flex items-center space-x-2">
            <Lock className="w-4 h-4 text-sky-400 shrink-0" />
            <span>Logins created here are scoped to this restaurant only. Each new login stays Pending until the staff member confirms their email — the email can land in Spam / Junk, so ask them to check there.</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 font-semibold">Staff Member</th>
                  <th className="py-2.5 font-semibold">Login Email / Username</th>
                  <th className="py-2.5 font-semibold">Role</th>
                  <th className="py-2.5 font-semibold">Status</th>
                  <th className="py-2.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-6 text-center text-slate-500">
                      No staff members added yet.
                    </td>
                  </tr>
                ) : (
                  staffList.map((u) => {
                    return (
                      <tr key={u.id} className="hover:bg-slate-800/30">
                        <td className="py-3 font-semibold text-slate-200">{u.name}</td>
                        <td className="py-3 text-slate-400 font-mono">{u.username || u.email}</td>
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
                              u.status === 'pending'
                                ? 'bg-amber-950/80 text-amber-300 border border-amber-700'
                                : (u.status || 'active') === 'active'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-700'
                            }`}
                            title={u.status === 'pending' ? 'Pending email confirmation — click to check status' : 'Toggle status'}
                          >
                            {u.status === 'pending' ? '⏳ pending' : (u.status || 'active')}
                          </button>
                        </td>
                        <td className="py-3 text-right space-x-1.5">
                          {u.status === 'pending' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleCheckStaffVerification(u)}
                                className="p-1.5 rounded-lg bg-slate-950 hover:bg-emerald-950 text-slate-400 hover:text-emerald-300 border border-slate-800 transition-colors"
                                title="Check if email is confirmed"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResendStaffConfirmation(u)}
                                className="p-1.5 rounded-lg bg-slate-950 hover:bg-sky-950 text-slate-400 hover:text-sky-300 border border-slate-800 transition-colors"
                                title="Resend Confirmation Email"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
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
          title="Create Staff Login (Confirmation Email Sent)"
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
                onChange={(e) => {
                  setStaffEmail(e.target.value);
                  if (!staffUsername) setStaffUsername(e.target.value.split('@')[0]);
                }}
                placeholder="suman@spicehaven.com"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              />
              <p className="text-[10px] text-slate-500 mt-1">Must be a real, working email. A confirmation link is sent here and the login stays Pending until it is clicked (it may land in Spam / Junk).</p>
            </div>

            <div>
              <label className="block font-semibold text-slate-300 mb-1">Role *</label>
              <select
                value={staffRole}
                onChange={(e) => setStaffRole(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="waiter">Waiter / Captain (POS, Orders & Billing)</option>
                <option value="kitchen">Kitchen Chef (Kitchen KDS Screen)</option>
                <option value="cashier">Cashier (Billing & Settlements)</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-300">Password *</label>
                <button
                  type="button"
                  onClick={generateStaffPassword}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold underline"
                >
                  Generate New Password
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
                {isCreatingStaff ? 'Creating...' : 'Create Staff Login'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Staff created — pending confirmation notice */}
      {staffResult && (
        <Modal
          isOpen={!!staffResult}
          onClose={() => setStaffResult(null)}
          title={staffResult.alreadyVerified ? '✅ Staff Login Active' : '⏳ Staff Login Pending Confirmation'}
        >
          <div className="space-y-3.5 text-xs">
            {staffResult.alreadyVerified ? (
              <div className="p-3 bg-emerald-950/60 border border-emerald-700 rounded-xl text-emerald-200">
                {staffResult.email} was already confirmed. The login is active.
              </div>
            ) : staffResult.sent ? (
              <>
                <div className="p-3 bg-amber-950/60 border border-amber-700 rounded-xl text-amber-100 flex items-start space-x-2">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <p>
                    Confirmation email sent to <strong>{staffResult.email}</strong>. The login shows as <strong>Pending</strong> and cannot be used until the link is clicked.
                  </p>
                </div>
                <div className="p-3 bg-sky-950/50 border border-sky-700/70 rounded-xl text-sky-100 flex items-start space-x-2">
                  <MailWarning className="w-5 h-5 text-sky-300 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">📥 Check the Spam / Junk folder</p>
                    <p className="text-[11px] text-sky-200/90">{SPAM_NOTICE}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-3 bg-rose-950/60 border border-rose-700 rounded-xl text-rose-200 flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">The confirmation email could not be sent</p>
                  <p className="text-[11px]">{staffResult.error}</p>
                  <p className="text-[11px]">The login is saved as Pending. Use the ✉ Resend button in the table.</p>
                </div>
              </div>
            )}
            {staffResult.passwordReset && (
              <div className="p-3 bg-purple-950/50 border border-purple-700/70 rounded-xl text-purple-100">
                This email had a login before, so a <strong>password-reset email</strong> was sent. {staffResult.name} must set their new password from it — the password below will not work.
              </div>
            )}
            <p className="text-slate-400">
              Password to share with {staffResult.name}: <code className="font-mono bg-slate-950 px-2 py-0.5 rounded text-emerald-300 font-bold">{staffResult.password}</code>
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
