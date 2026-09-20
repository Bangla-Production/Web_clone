import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldAlert,
  Building,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Search,
  IndianRupee,
  RefreshCw,
  LogOut,
  Mail,
  Send,
  Clock,
  MailWarning,
  Power,
  Key
} from 'lucide-react';
import {
  getAllRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  getAllUsers,
  createAccountWithEmail,
  resendAccountVerification,
  syncAccountVerification,
  updateProvisionedUser,
  deleteProvisionedUser
} from '../services/firestoreService';
import { SPAM_NOTICE, sendPasswordReset, changePasswordWithCurrent } from '../services/authAccountService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

const slugify = (text) =>
  (text || 'restaurant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'restaurant';

const makePassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let result = 'Alt';
  for (let i = 0; i < 4; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result + '$' + Math.floor(10 + Math.random() * 90);
};

const explainError = (err) =>
  err?.code === 'permission-denied'
    ? 'Firestore blocked this action (permission-denied). Publish the updated firestore.rules: Firebase Console → Firestore Database → Rules.'
    : err?.message || 'Unknown error';

const formatINR = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

/**
 * Super Admin = platform owner. Only does three things:
 *  1. Creates a Restaurant Admin login (hotel name + email + password)
 *  2. Sees how many restaurants are registered / active
 *  3. Sees the monthly income (sum of monthly fee of active restaurants)
 * No orders, menu, sales or any restaurant-level data is shown here.
 */
export default function SuperAdminPage() {
  const [restaurants, setRestaurants] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add / Edit modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [hotelName, setHotelName] = useState('');
  const [adminName, setAdminName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [sentEmailModal, setSentEmailModal] = useState(null);

  // Change admin password modal
  const [pwRow, setPwRow] = useState(null);
  const [pwMode, setPwMode] = useState('reset'); // 'reset' | 'direct'
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwDone, setPwDone] = useState('');

  const { user, logout } = useAuth();
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [restList, uList] = await Promise.all([getAllRestaurants(), getAllUsers()]);
      setRestaurants(restList || []);
      setUsersList(uList || []);
    } catch (err) {
      console.error('SuperAdminPage fetchData error:', err);
      toast.error('Failed to load platform data from Firestore.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One row per restaurant, joined with its Restaurant Admin login
  const rows = useMemo(
    () =>
      restaurants.map((rest) => {
        const admin = usersList.find(
          (u) => u.role === 'restaurant_admin' && u.restaurantId === rest.id
        );
        const status = admin ? admin.status || 'active' : rest.status || 'active';
        return { rest, admin, status };
      }),
    [restaurants, usersList]
  );

  const totalRegistered = rows.length;
  const activeRows = rows.filter((r) => r.status === 'active');
  const monthlyIncome = activeRows.reduce((sum, r) => sum + (Number(r.rest.monthlyFee) || 0), 0);
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const filteredRows = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.rest.name?.toLowerCase().includes(q) ||
      r.admin?.email?.toLowerCase().includes(q)
    );
  });

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let result = 'Alt';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '$' + Math.floor(10 + Math.random() * 90);
    setAdminPassword(result);
  };

  const openAddModal = () => {
    setEditingRow(null);
    setHotelName('');
    setAdminName('');
    setAdminEmail('');
    setMonthlyFee('');
    generateRandomPassword();
    setIsModalOpen(true);
  };

  const openEditModal = (row) => {
    setEditingRow(row);
    setHotelName(row.rest.name || '');
    setMonthlyFee(String(row.rest.monthlyFee ?? ''));
    setIsModalOpen(true);
  };

  const loginUrl = () => (window.location.origin ? `${window.location.origin}/login` : 'http://localhost:5173/login');

  const handleSave = async (e) => {
    e.preventDefault();
    const fee = parseFloat(monthlyFee);
    if (!hotelName.trim()) {
      toast.warning('Hotel / restaurant name is required.');
      return;
    }
    if (monthlyFee !== '' && (Number.isNaN(fee) || fee < 0)) {
      toast.warning('Monthly fee must be a valid number.');
      return;
    }

    // ---- EDIT ----
    if (editingRow) {
      try {
        setIsSaving(true);
        await updateRestaurant(editingRow.rest.id, { name: hotelName.trim(), monthlyFee: fee || 0 });
        const related = usersList.filter((u) => u.restaurantId === editingRow.rest.id);
        await Promise.all(
          related.map((u) => updateProvisionedUser(u.id, { restaurantName: hotelName.trim() }))
        );
        toast.success('Restaurant updated.');
        setIsModalOpen(false);
        fetchData();
      } catch (err) {
        toast.error(`Failed to update: ${explainError(err)}`, 9000);
      } finally {
        setIsSaving(false);
      }
      return;
    }

    // ---- CREATE ----
    const email = adminEmail.trim().toLowerCase();
    if (!email || !adminPassword.trim()) {
      toast.warning('Email and password are required.');
      return;
    }
    if (adminPassword.trim().length < 6) {
      toast.warning('Password must be at least 6 characters.');
      return;
    }
    if (usersList.some((u) => u.email?.toLowerCase() === email)) {
      toast.warning('An account with this email already exists.');
      return;
    }

    const createdByLabel = user?.email || 'Super Admin';
    const newRestId = `${slugify(hotelName)}-${Math.random().toString(36).slice(2, 6)}`;

    try {
      setIsSaving(true);

      await createRestaurant(
        {
          name: hotelName.trim(),
          email,
          monthlyFee: fee || 0,
          currency: 'INR',
          currencySymbol: '₹',
          taxRate: 5.0,
          status: 'active'
        },
        newRestId
      );

      let result;
      try {
        // Saved as "pending" until the email is confirmed.
        result = await createAccountWithEmail(
          {
            name: adminName.trim() || `${hotelName.trim()} Admin`,
            email,
            username: email,
            password: adminPassword.trim(),
            role: 'restaurant_admin',
            restaurantId: newRestId,
            restaurantName: hotelName.trim(),
            createdBy: createdByLabel
          },
          createdByLabel
        );
      } catch (accErr) {
        // Do not leave an orphan restaurant behind.
        try { await deleteRestaurant(newRestId); } catch (e2) { /* ignore */ }
        throw accErr;
      }

      const { account, emailResult } = result;
      if (emailResult.success && !emailResult.alreadyVerified) {
        toast.warning(`Confirmation email sent to ${account.email}. Account is PENDING. It may go to Spam — check there too.`, 8000);
      } else if (emailResult.alreadyVerified) {
        toast.success(`${account.email} was already confirmed — restaurant is active.`);
      } else {
        toast.error(`Saved as PENDING, but the email could not be sent: ${emailResult.error}`, 9000);
      }

      setIsModalOpen(false);
      await fetchData();
      setSentEmailModal({
        hotel: hotelName.trim(),
        recipientEmail: account.email,
        password: adminPassword.trim(),
        loginUrl: loginUrl(),
        sent: emailResult.success,
        alreadyVerified: !!emailResult.alreadyVerified,
        passwordReset: !!emailResult.passwordReset,
        error: emailResult.error || ''
      });
    } catch (err) {
      console.error('handleSave error:', err);
      toast.error(`Failed to register: ${explainError(err)}`, 9000);
    } finally {
      setIsSaving(false);
    }
  };

  // Passwords are not stored anywhere, so checking / re-sending needs the password you set.
  const askPassword = (row) =>
    window.prompt(`Enter the password you set for ${row.admin?.email} to continue:`) || '';

  const openPasswordModal = (row) => {
    setPwRow(row);
    setPwMode('reset');
    setPwCurrent('');
    setPwNew(makePassword());
    setPwDone('');
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!pwRow?.admin) return;
    setPwBusy(true);
    try {
      if (pwMode === 'reset') {
        const res = await sendPasswordReset(pwRow.admin.email);
        if (res.success) {
          toast.warning(`Password-reset email sent to ${pwRow.admin.email}. It may go to Spam — check there too.`, 8000);
          setPwRow(null);
        } else {
          toast.error(res.error || 'Could not send the password-reset email.');
        }
      } else {
        if (!pwCurrent.trim()) {
          toast.warning("Enter the admin's current password.");
          return;
        }
        if (pwNew.trim().length < 6) {
          toast.warning('New password must be at least 6 characters.');
          return;
        }
        const res = await changePasswordWithCurrent(pwRow.admin.email, pwCurrent, pwNew.trim());
        if (res.success) {
          toast.success(`Password changed for ${pwRow.admin.email}.`);
          setPwDone(pwNew.trim());
        } else {
          toast.error(res.error || 'Could not change the password.');
        }
      }
    } finally {
      setPwBusy(false);
    }
  };

  const handleCheckVerification = async (row) => {
    if (!row.admin) return;
    const pw = askPassword(row);
    if (!pw) return;
    try {
      const { verified, error } = await syncAccountVerification(row.admin, pw);
      if (verified) {
        toast.success(`${row.admin.email} confirmed their email — ${row.rest.name} is now ACTIVE.`);
      } else if (error) {
        toast.error(error);
      } else {
        toast.info(`${row.admin.email} has not confirmed yet. Ask them to check Spam / Junk too.`);
      }
      fetchData();
    } catch (err) {
      toast.error(`Could not check confirmation status: ${explainError(err)}`);
    }
  };

  const handleResend = async (row) => {
    if (!row.admin) return;
    const pw = askPassword(row);
    if (!pw) return;
    try {
      const result = await resendAccountVerification(row.admin, pw);
      if (result.success && !result.alreadyVerified) {
        toast.warning(`Confirmation email resent to ${row.admin.email}. It may go to Spam — check there too.`, 8000);
        setSentEmailModal({
          hotel: row.rest.name,
          recipientEmail: row.admin.email,
          password: pw,
          loginUrl: loginUrl(),
          sent: true,
          alreadyVerified: false,
          error: ''
        });
      } else if (result.alreadyVerified) {
        toast.success(`${row.admin.email} is already confirmed — activated.`);
      } else {
        toast.error(result.error || 'Failed to resend confirmation email.');
      }
      fetchData();
    } catch (err) {
      toast.error(`Failed to resend confirmation email: ${explainError(err)}`);
    }
  };

  const handleToggleStatus = async (row) => {
    if (row.status === 'pending') {
      await handleCheckVerification(row);
      return;
    }
    const next = row.status === 'active' ? 'suspended' : 'active';
    try {
      if (row.admin) await updateProvisionedUser(row.admin.id, { status: next });
      try { await updateRestaurant(row.rest.id, { status: next }); } catch (e) { /* non-blocking */ }
      toast.success(`${row.rest.name} ${next}.`);
      fetchData();
    } catch (err) {
      toast.error(`Failed to update status: ${explainError(err)}`, 9000);
    }
  };

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete "${row.rest.name}"? The admin login and all staff logins of this restaurant will also be removed.`)) return;
    try {
      const related = usersList.filter((u) => u.restaurantId === row.rest.id);
      for (const u of related) {
        await deleteProvisionedUser(u.id);
      }
      await deleteRestaurant(row.rest.id);
      toast.success(`Deleted ${row.rest.name}.`);
      fetchData();
    } catch (err) {
      toast.error(`Failed to delete: ${explainError(err)}`, 9000);
    }
  };

  const statusBadge = (row) => {
    const base = 'px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all border';
    if (row.status === 'pending') {
      return (
        <button
          onClick={() => handleToggleStatus(row)}
          className={`${base} bg-amber-950/80 text-amber-300 border-amber-700`}
          title="Pending email confirmation — click to check status"
        >
          ⏳ pending
        </button>
      );
    }
    return (
      <button
        onClick={() => handleToggleStatus(row)}
        className={`${base} ${
          row.status === 'active'
            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
            : 'bg-rose-950/80 text-rose-300 border-rose-700'
        }`}
        title="Click to suspend / activate"
      >
        {row.status}
      </button>
    );
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 space-y-6 overflow-hidden">
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-3 rounded-2xl bg-purple-950/80 border border-purple-700/60 text-purple-400 shadow-xl shadow-purple-950">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">Super Admin Platform Portal</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-900/80 text-purple-300 border border-purple-700">
                PLATFORM ROOT
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Logged in as <strong className="text-purple-300">{user?.email}</strong> • Register restaurants, set admin logins & track monthly income
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={openAddModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/40 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add Restaurant</span>
          </button>
          <button
            onClick={logout}
            className="p-2 rounded-xl bg-slate-900 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border border-slate-800 transition-colors"
            title="Sign Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Registered Restaurants</span>
            <Building className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">{totalRegistered}</h3>
          <p className="text-[11px] text-purple-400 mt-1">Total on the platform</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Restaurants</span>
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">{activeRows.length}</h3>
          <p className="text-[11px] text-emerald-400 mt-1">Email confirmed & running</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Confirmation</span>
            <Clock className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">{pendingCount}</h3>
          <p className="text-[11px] text-amber-400 mt-1">Waiting for admin's email confirm</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Monthly Income</span>
            <IndianRupee className="w-5 h-5 text-sky-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">{formatINR(monthlyIncome)}</h3>
          <p className="text-[11px] text-sky-400 mt-1">Monthly fee of active restaurants</p>
        </div>
      </div>

      {/* Section tab */}
      <div className="relative flex items-center space-x-2 border-b border-slate-800 pb-2">
        <span className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white shadow-lg shadow-purple-900/40 flex items-center space-x-2">
          <Building className="w-3.5 h-3.5" />
          <span>Restaurant Directory ({totalRegistered})</span>
        </span>
      </div>

      {/* Restaurants table */}
      <div className="relative bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-white">Registered Restaurants & Admin Logins</h3>
            <p className="text-xs text-slate-400">
              Set the hotel name, admin email and password. The restaurant stays Pending until the admin confirms their email and logs in.
            </p>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search hotel or email..."
              className="pl-9 pr-4 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 w-full sm:w-64"
            />
          </div>
        </div>

        <div className="p-3 bg-amber-950/40 border border-amber-700/70 rounded-xl text-[11px] text-amber-200 flex items-start space-x-2">
          <MailWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            <strong>Heads up:</strong> confirmation emails often land in the <strong>Spam / Junk</strong> folder. {SPAM_NOTICE} Restaurants stay <strong>Pending</strong> and their admin cannot log in until confirmed.
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 font-bold">Hotel / Restaurant</th>
                <th className="py-3 px-4 font-bold">Admin Email</th>
                <th className="py-3 px-4 font-bold">Monthly Fee</th>
                <th className="py-3 px-4 font-bold">Status</th>
                <th className="py-3 px-4 font-bold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading && rows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500">Loading...</td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan="5" className="py-8 text-center text-slate-500">
                    No restaurants yet. Click "Add Restaurant" to register one.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  return (
                    <tr key={row.rest.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">{row.rest.name}</td>
                      <td className="py-3.5 px-4 font-mono text-emerald-400">{row.admin?.email || '—'}</td>
                      <td className="py-3.5 px-4 text-slate-300 font-semibold">{formatINR(row.rest.monthlyFee)}</td>
                      <td className="py-3.5 px-4">{statusBadge(row)}</td>
                      <td className="py-3.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {row.status === 'pending' && row.admin && (
                          <>
                            <button
                              onClick={() => handleCheckVerification(row)}
                              className="p-1.5 rounded-lg bg-slate-950 hover:bg-emerald-950 text-slate-400 hover:text-emerald-300 border border-slate-800 transition-colors"
                              title="Check if email is confirmed"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleResend(row)}
                              className="p-1.5 rounded-lg bg-slate-950 hover:bg-sky-950 text-slate-400 hover:text-sky-300 border border-slate-800 transition-colors"
                              title="Resend confirmation email"
                            >
                              <Mail className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                        {row.status !== 'pending' && (
                          <button
                            onClick={() => handleToggleStatus(row)}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-amber-950 text-slate-400 hover:text-amber-300 border border-slate-800 transition-colors"
                            title={row.status === 'active' ? 'Suspend' : 'Activate'}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {row.admin && (
                          <button
                            onClick={() => openPasswordModal(row)}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-sky-950 text-slate-400 hover:text-sky-300 border border-slate-800 transition-colors"
                            title="Change admin password"
                          >
                            <Key className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(row)}
                          className="p-1.5 rounded-lg bg-slate-950 hover:bg-purple-950 text-slate-400 hover:text-purple-300 border border-slate-800 transition-colors"
                          title="Edit name / fee"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(row)}
                          className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                          title="Delete"
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

      {/* Add / Edit modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRow ? `Edit ${editingRow.rest.name}` : 'Add Restaurant & Admin Login'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {!editingRow && (
            <div className="p-3 bg-purple-950/40 border border-purple-800/80 rounded-xl text-[11px] text-purple-200">
              A confirmation email is sent to the admin. The restaurant stays <strong>Pending</strong> until it is confirmed (the mail may land in <strong>Spam / Junk</strong>).
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Hotel / Restaurant Name *</label>
            <input
              type="text"
              required
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              placeholder="e.g. Spice Haven Bistro"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          {!editingRow && (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Admin Name</label>
                <input
                  type="text"
                  value={adminName}
                  onChange={(e) => setAdminName(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Admin Gmail / Email * (real, working)</label>
                <input
                  type="email"
                  required
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="owner@gmail.com"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">Password *</label>
                  <button
                    type="button"
                    onClick={generateRandomPassword}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-bold underline"
                  >
                    Generate New Password
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-purple-300 focus:outline-none focus:border-purple-500"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">Monthly Fee (₹)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={monthlyFee}
              onChange={(e) => setMonthlyFee(e.target.value)}
              placeholder="e.g. 1500"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Used to calculate Monthly Income (only active restaurants are counted).</p>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 disabled:opacity-50"
            >
              {isSaving ? (
                <span>{editingRow ? 'Saving...' : 'Registering & Sending Email...'}</span>
              ) : editingRow ? (
                <span>Save Changes</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Register & Send Confirmation Email</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Change admin password modal */}
      {pwRow && (
        <Modal
          isOpen={!!pwRow}
          onClose={() => setPwRow(null)}
          title={`🔑 Change Password — ${pwRow.rest.name}`}
          maxWidth="max-w-lg"
        >
          {pwDone ? (
            <div className="space-y-4 text-xs">
              <div className="p-3 bg-emerald-950/60 border border-emerald-700 rounded-xl text-emerald-200 flex items-start space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Password changed for {pwRow.admin.email}</p>
                  <p className="text-[11px]">New password (shown only now — share it separately):</p>
                  <code className="inline-block font-mono bg-slate-950 px-2 py-1 rounded text-rose-300 font-bold">{pwDone}</code>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setPwRow(null)}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleChangePassword} className="space-y-4 text-xs">
              <p className="text-slate-400">
                Admin: <strong className="text-emerald-400 font-mono">{pwRow.admin.email}</strong>
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPwMode('reset')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    pwMode === 'reset' ? 'bg-purple-950/60 border-purple-600 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <p className="font-bold">📧 Send reset email</p>
                  <p className="text-[11px] mt-1 opacity-80">Admin sets a new password from the email. Works even if the old password is forgotten.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setPwMode('direct')}
                  className={`p-3 rounded-xl border text-left transition-colors ${
                    pwMode === 'direct' ? 'bg-purple-950/60 border-purple-600 text-white' : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  <p className="font-bold">🔑 Set password now</p>
                  <p className="text-[11px] mt-1 opacity-80">You type the new password. Needs the admin's current password.</p>
                </button>
              </div>

              {pwMode === 'reset' ? (
                <div className="p-3 bg-amber-950/40 border border-amber-700/70 rounded-xl text-amber-200 flex items-start space-x-2">
                  <MailWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>A password-reset email will be sent to the admin. It may land in <strong>Spam / Junk</strong>.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block font-semibold uppercase tracking-wider text-slate-300 mb-1">Current Password *</label>
                    <input
                      type="text"
                      value={pwCurrent}
                      onChange={(e) => setPwCurrent(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block font-semibold uppercase tracking-wider text-slate-300">New Password *</label>
                      <button
                        type="button"
                        onClick={() => setPwNew(makePassword())}
                        className="text-[11px] text-purple-400 hover:text-purple-300 font-bold underline"
                      >
                        Generate New Password
                      </button>
                    </div>
                    <input
                      type="text"
                      value={pwNew}
                      onChange={(e) => setPwNew(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-purple-300 focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Firebase does not let anyone set another person's password without knowing the current one. If it is unknown, use "Send reset email".
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={() => setPwRow(null)} className="px-4 py-2 rounded-lg font-medium text-slate-400 hover:text-white">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pwBusy}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold shadow-lg shadow-purple-900/40 disabled:opacity-50"
                >
                  {pwBusy ? 'Working...' : pwMode === 'reset' ? 'Send Reset Email' : 'Change Password'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}

      {/* Confirmation email status modal */}
      {sentEmailModal && (
        <Modal
          isOpen={!!sentEmailModal}
          onClose={() => setSentEmailModal(null)}
          title={
            sentEmailModal.alreadyVerified
              ? '✅ Restaurant Active'
              : sentEmailModal.sent
              ? '⏳ Pending — Confirmation Email Sent'
              : '⚠️ Pending — Email Not Sent'
          }
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 text-xs">
            {sentEmailModal.alreadyVerified ? (
              <div className="p-3 bg-emerald-950/60 border border-emerald-700 rounded-xl text-emerald-200 flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <p className="font-bold">{sentEmailModal.recipientEmail} was already confirmed. The restaurant is active.</p>
              </div>
            ) : sentEmailModal.sent ? (
              <>
                <div className="p-3 bg-amber-950/60 border border-amber-700 rounded-xl text-amber-100 flex items-start space-x-2">
                  <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-bold">Waiting for {sentEmailModal.recipientEmail} to confirm</p>
                    <p className="text-[11px] text-amber-200/90">
                      {sentEmailModal.hotel} shows as <strong>Pending</strong>. The admin cannot log in until the link is clicked.
                    </p>
                  </div>
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
                  <p className="text-[11px] text-rose-200/90">{sentEmailModal.error}</p>
                  <p className="text-[11px] text-rose-200/90">Saved as Pending. Use the ✉ Resend button in the table after fixing the problem.</p>
                </div>
              </div>
            )}

            {sentEmailModal.passwordReset && (
              <div className="p-3 bg-purple-950/50 border border-purple-700/70 rounded-xl text-purple-100 flex items-start space-x-2">
                <Key className="w-5 h-5 text-purple-300 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">This email had a login before</p>
                  <p className="text-[11px] text-purple-200/90">
                    A <strong>password-reset email</strong> was sent instead. The admin must set their new password from that email — the password below will <strong>not</strong> work.
                  </p>
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Restaurant:</span>
                <span className="font-bold text-white">{sentEmailModal.hotel}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Admin Email:</span>
                <span className="font-bold text-white">{sentEmailModal.recipientEmail}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Password (shown only now — share it separately):</span>
                <code className="font-mono bg-slate-900 px-2 py-0.5 rounded text-rose-300 font-bold">{sentEmailModal.password}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Login URL:</span>
                <a href={sentEmailModal.loginUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline font-mono">
                  {sentEmailModal.loginUrl}
                </a>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSentEmailModal(null)}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold"
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
