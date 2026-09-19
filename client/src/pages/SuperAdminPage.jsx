import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldAlert,
  Building,
  Users,
  Plus,
  Edit2,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Search,
  DollarSign,
  TrendingUp,
  RefreshCw,
  LogOut,
  Sparkles,
  Key,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Mail,
  Send,
  UserCheck,
  ChefHat,
  CreditCard,
  Utensils
} from 'lucide-react';
import {
  getAllRestaurants,
  createRestaurant,
  updateRestaurant,
  deleteRestaurant,
  getAllUsers,
  createProvisionedUser,
  updateProvisionedUser,
  deleteProvisionedUser
} from '../services/firestoreService';
import { sendCredentialConfirmationEmail } from '../services/emailNotificationService';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import Modal from '../components/common/Modal';

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState('USERS'); // 'USERS' | 'RESTAURANTS'
  const [roleFilter, setRoleFilter] = useState('ALL'); // 'ALL' | 'restaurant_admin' | 'waiter' | 'kitchen' | 'cashier'
  const [restaurants, setRestaurants] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add / Edit Restaurant Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRest, setEditingRest] = useState(null);
  const [restId, setRestId] = useState('');
  const [name, setName] = useState('');
  const [tagline, setTagline] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [taxRate, setTaxRate] = useState('5.0');
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');

  // Provision New Account Modal
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userFullName, setUserFullName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userUsername, setUserUsername] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRole, setUserRole] = useState('restaurant_admin');
  const [selectedRestId, setSelectedRestId] = useState('');
  const [showPassword, setShowPassword] = useState({});
  const [copiedId, setCopiedId] = useState(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  // Email Confirmation Sent Success Modal
  const [sentEmailModal, setSentEmailModal] = useState(null);

  const { user, logout, selectActiveRestaurant } = useAuth();
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [restList, uList] = await Promise.all([
        getAllRestaurants(),
        getAllUsers()
      ]);
      setRestaurants(restList || []);
      setUsersList(uList || []);
      if (restList?.length > 0 && !selectedRestId) {
        setSelectedRestId(restList[0].id);
      }
    } catch (err) {
      console.error('SuperAdminPage fetchData error:', err);
      toast.error('Failed to load platform data from Firestore.');
    } finally {
      setLoading(false);
    }
  }, [selectedRestId, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate random password for provisioned accounts
  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let result = 'Alt';
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    result += '$' + Math.floor(10 + Math.random() * 90);
    setUserPassword(result);
  };

  const handleOpenUserModal = (defaultRole = 'restaurant_admin') => {
    setUserFullName('');
    setUserEmail('');
    setUserUsername('');
    setUserRole(defaultRole);
    generateRandomPassword();
    if (restaurants.length > 0) {
      setSelectedRestId(restaurants[0].id);
    }
    setIsUserModalOpen(true);
  };

  const handleProvisionUser = async (e) => {
    e.preventDefault();
    if (!userEmail.trim() || !userPassword.trim()) {
      toast.warning('Email and Password are required.');
      return;
    }

    const assignedRestaurant = restaurants.find(r => r.id === selectedRestId);
    const restName = assignedRestaurant?.name || selectedRestId || 'Spice Haven Bistro';

    try {
      setIsProvisioning(true);

      const createdUser = await createProvisionedUser({
        name: userFullName.trim() || `${userRole.replace('_', ' ').toUpperCase()}`,
        email: userEmail.trim(),
        username: userUsername.trim() || userEmail.trim(),
        password: userPassword.trim(),
        role: userRole,
        restaurantId: selectedRestId || 'spice-haven',
        restaurantName: restName,
        status: 'active'
      });

      // Send automated confirmation email notification to the registered email address
      const emailResult = await sendCredentialConfirmationEmail({
        recipientEmail: userEmail.trim(),
        recipientName: userFullName.trim() || 'Staff Member',
        role: userRole,
        username: userUsername.trim() || userEmail.trim(),
        password: userPassword.trim(),
        restaurantName: restName,
        restaurantId: selectedRestId || 'spice-haven',
        createdBy: user?.email || 'Super Admin (altcafe2026@gmail.com)'
      });

      setIsUserModalOpen(false);
      await fetchData();

      toast.success(`Account registered! Confirmation email sent to ${userEmail.trim()}`);
      setSentEmailModal(emailResult);
    } catch (err) {
      console.error('handleProvisionUser error:', err);
      toast.error('Failed to register and provision account.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleToggleUserStatus = async (targetUser) => {
    const nextStatus = targetUser.status === 'active' ? 'suspended' : 'active';
    try {
      await updateProvisionedUser(targetUser.id, { status: nextStatus });
      toast.success(`Account ${nextStatus}!`);
      fetchData();
    } catch (err) {
      toast.error('Failed to update account status.');
    }
  };

  const handleDeleteUser = async (userId, targetName) => {
    if (!window.confirm(`Delete account "${targetName}"? They will no longer be able to log in.`)) return;
    try {
      await deleteProvisionedUser(userId);
      toast.success('Account deleted successfully.');
      fetchData();
    } catch (err) {
      toast.error('Failed to delete account.');
    }
  };

  const handleCopyCredentials = (account) => {
    const roleLabel = account.role?.replace('_', ' ').toUpperCase();
    const text = `RestoPulse ${roleLabel} Login Credentials:\nRole: ${roleLabel}\nEmail/Username: ${account.email}\nPassword: ${account.password}\nRestaurant: ${account.restaurantName || account.restaurantId}\nLogin URL: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopiedId(account.id);
    toast.info('Credentials copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleResendConfirmation = async (account) => {
    try {
      const emailResult = await sendCredentialConfirmationEmail({
        recipientEmail: account.email,
        recipientName: account.name || 'Staff Member',
        role: account.role || 'staff',
        username: account.username || account.email,
        password: account.password,
        restaurantName: account.restaurantName || 'Restaurant',
        restaurantId: account.restaurantId || 'spice-haven',
        createdBy: user?.email || 'Super Admin'
      });
      toast.success(`Confirmation email resent to ${account.email}!`);
      setSentEmailModal(emailResult);
    } catch (err) {
      toast.error('Failed to resend confirmation email.');
    }
  };

  // Restaurant Handlers
  const handleOpenRestaurantModal = (rest = null) => {
    if (rest) {
      setEditingRest(rest);
      setRestId(rest.id);
      setName(rest.name || '');
      setTagline(rest.tagline || '');
      setAddress(rest.address || '');
      setPhone(rest.phone || '');
      setEmail(rest.email || '');
      setGstin(rest.gstin || '');
      setTaxRate(String(rest.taxRate || 5.0));
      setLogoUrl(rest.logoUrl || '');
      setBannerUrl(rest.bannerUrl || '');
    } else {
      setEditingRest(null);
      const generatedId = `rest-${Date.now().toString().slice(-4)}`;
      setRestId(generatedId);
      setName('');
      setTagline('');
      setAddress('');
      setPhone('');
      setEmail('');
      setGstin('');
      setTaxRate('5.0');
      setLogoUrl('');
      setBannerUrl('');
    }
    setIsModalOpen(true);
  };

  const handleSaveRestaurant = async (e) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.warning('Restaurant name is required.');
      return;
    }

    try {
      const payload = {
        name: name.trim(),
        tagline: tagline.trim(),
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        gstin: gstin.trim(),
        taxRate: parseFloat(taxRate) || 5.0,
        currency: 'INR',
        currencySymbol: '₹',
        logoUrl: logoUrl.trim(),
        bannerUrl: bannerUrl.trim(),
        status: 'active'
      };

      if (editingRest) {
        await updateRestaurant(editingRest.id, payload);
        toast.success(`Updated ${name}!`);
      } else {
        await createRestaurant(payload, restId.trim() || undefined);
        toast.success(`Created restaurant ${name}!`);
      }

      setIsModalOpen(false);
      fetchData();
    } catch (err) {
      toast.error('Failed to save restaurant.');
    }
  };

  const handleDeleteRestaurant = async (id, restName) => {
    if (!window.confirm(`Delete restaurant "${restName}" and all associated data?`)) return;
    try {
      await deleteRestaurant(id);
      toast.success(`Deleted ${restName}`);
      fetchData();
    } catch (err) {
      toast.error('Failed to delete restaurant.');
    }
  };

  const filteredUsers = usersList.filter(u => {
    // Hide super admin root record from staff list
    if (u.email === 'altcafe2026@gmail.com' || u.role === 'super_admin') return false;
    if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.restaurantName?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q)
    );
  });

  const getRoleBadge = (role) => {
    switch (role) {
      case 'restaurant_admin':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-700">🏢 RESTAURANT ADMIN</span>;
      case 'waiter':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-700">🛎️ WAITER / FLOOR</span>;
      case 'kitchen':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-950/80 text-orange-300 border border-orange-700">👨‍🍳 KITCHEN KDS</span>;
      case 'cashier':
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-teal-950/80 text-teal-300 border border-teal-700">💳 CASHIER / BILLING</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">{role?.toUpperCase()}</span>;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 space-y-6">
      {/* Top Navbar Header */}
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
              Logged in as <strong className="text-purple-300">altcafe2026@gmail.com</strong> • Full Authority to Provision Logins & Auto-Send Email Confirmations
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            onClick={fetchData}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-semibold border border-slate-700 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => handleOpenUserModal('restaurant_admin')}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-900/40 transition-all"
          >
            <Key className="w-4 h-4" />
            <span>Provision New User</span>
          </button>
          <button
            onClick={() => handleOpenRestaurantModal()}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg shadow-emerald-900/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Onboard Restaurant</span>
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

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Provisioned Accounts</span>
            <Users className="w-5 h-5 text-purple-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">{usersList.length}</h3>
          <p className="text-[11px] text-purple-400 mt-1">Super Admin generated credentials</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Restaurant Admins</span>
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">
            {usersList.filter(u => u.role === 'restaurant_admin').length}
          </h3>
          <p className="text-[11px] text-emerald-400 mt-1">Full restaurant management access</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Staff (Waiters/KDS/Cashiers)</span>
            <ChefHat className="w-5 h-5 text-orange-400" />
          </div>
          <h3 className="text-3xl font-extrabold text-white mt-2">
            {usersList.filter(u => ['waiter', 'kitchen', 'cashier'].includes(u.role)).length}
          </h3>
          <p className="text-[11px] text-orange-400 mt-1">Floor, kitchen & billing logins</p>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-lg">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-semibold uppercase tracking-wider">Confirmation Dispatch</span>
            <Mail className="w-5 h-5 text-sky-400" />
          </div>
          <h3 className="text-xl font-bold text-white mt-2">Instant Email Sent</h3>
          <p className="text-[11px] text-slate-400 mt-1">Sent upon registration</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('USERS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'USERS'
              ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Provisioned Accounts & Credentials ({usersList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('RESTAURANTS')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 ${
            activeTab === 'RESTAURANTS'
              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
              : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
          }`}
        >
          <Building className="w-3.5 h-3.5" />
          <span>Restaurant Directory ({restaurants.length})</span>
        </button>
      </div>

      {/* TAB 1: ALL PROVISIONED USERS & CREDENTIALS */}
      {activeTab === 'USERS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-base text-white flex items-center space-x-2">
                <span>Platform User Accounts Directory</span>
                <span className="text-[10px] bg-purple-950 border border-purple-700 text-purple-300 px-2 py-0.5 rounded-full font-bold">
                  Super Admin Exclusive Facility
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Only the Super Admin can register credentials. When registered, an official confirmation email is automatically sent.
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleOpenUserModal('restaurant_admin')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Restaurant Admin</span>
              </button>
              <button
                onClick={() => handleOpenUserModal('waiter')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Waiter</span>
              </button>
              <button
                onClick={() => handleOpenUserModal('kitchen')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Kitchen KDS</span>
              </button>
              <button
                onClick={() => handleOpenUserModal('cashier')}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold shadow transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Cashier</span>
              </button>
            </div>
          </div>

          {/* Filters & Search Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <div className="flex items-center space-x-2 overflow-x-auto w-full sm:w-auto pb-1">
              {['ALL', 'restaurant_admin', 'waiter', 'kitchen', 'cashier'].map(r => (
                <button
                  key={r}
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                    roleFilter === r
                      ? 'bg-purple-600 text-white font-bold'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {r === 'ALL' ? 'All Roles' : r.replace('_', ' ').toUpperCase()}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, email, role..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">User Name</th>
                  <th className="py-3 px-4 font-bold">Role</th>
                  <th className="py-3 px-4 font-bold">Registered Email / Username</th>
                  <th className="py-3 px-4 font-bold">Assigned Restaurant</th>
                  <th className="py-3 px-4 font-bold">Provisioned Password</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredUsers.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-slate-500">
                      No provisioned accounts found matching criteria. Click a "+ [Role]" button above to register new login credentials.
                    </td>
                  </tr>
                ) : (
                  filteredUsers.map((acc) => {
                    const isPassVisible = !!showPassword[acc.id];
                    return (
                      <tr key={acc.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">
                          {acc.name}
                        </td>
                        <td className="py-3.5 px-4">
                          {getRoleBadge(acc.role)}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-emerald-400">
                          {acc.email}
                        </td>
                        <td className="py-3.5 px-4 text-slate-300">
                          <span className="bg-slate-950 px-2 py-1 rounded border border-slate-800 font-semibold">
                            {acc.restaurantName || acc.restaurantId || 'Spice Haven'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 text-purple-300 font-bold">
                              {isPassVisible ? acc.password || '••••••••' : '••••••••'}
                            </span>
                            <button
                              onClick={() => setShowPassword(p => ({ ...p, [acc.id]: !p[acc.id] }))}
                              className="text-slate-500 hover:text-slate-300 p-1"
                              title={isPassVisible ? 'Hide Password' : 'Show Password'}
                            >
                              {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              onClick={() => handleCopyCredentials(acc)}
                              className="text-slate-500 hover:text-emerald-400 p-1"
                              title="Copy Credentials to Clipboard"
                            >
                              {copiedId === acc.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <button
                            onClick={() => handleToggleUserStatus(acc)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-all ${
                              acc.status === 'active'
                                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-700'
                                : 'bg-rose-950/80 text-rose-300 border border-rose-700'
                            }`}
                          >
                            {acc.status || 'active'}
                          </button>
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-2">
                          <button
                            onClick={() => handleResendConfirmation(acc)}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-sky-950 text-slate-400 hover:text-sky-300 border border-slate-800 transition-colors"
                            title="Resend Confirmation Email"
                          >
                            <Mail className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteUser(acc.id, acc.name)}
                            className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                            title="Delete Account"
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

      {/* TAB 2: RESTAURANT DIRECTORY */}
      {activeTab === 'RESTAURANTS' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="font-bold text-base text-white">Registered Restaurant Instances</h3>
              <p className="text-xs text-slate-400">Manage tenant restaurant instances and switch live operational context</p>
            </div>
            <button
              onClick={() => handleOpenRestaurantModal()}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-all self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Onboard Restaurant</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-bold">Restaurant</th>
                  <th className="py-3 px-4 font-bold">Tenant ID</th>
                  <th className="py-3 px-4 font-bold">Address & Contact</th>
                  <th className="py-3 px-4 font-bold">Status</th>
                  <th className="py-3 px-4 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {restaurants.map((rest) => (
                  <tr key={rest.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-3">
                        {rest.logoUrl ? (
                          <img src={rest.logoUrl} alt={rest.name} className="w-8 h-8 rounded-lg object-cover border border-slate-700" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-emerald-600/30 border border-emerald-500/40 text-emerald-400 flex items-center justify-center font-bold">
                            🍽️
                          </div>
                        )}
                        <div>
                          <p className="font-bold text-white">{rest.name}</p>
                          <p className="text-[10px] text-slate-400">{rest.tagline || 'Restaurant'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-400">
                      {rest.id}
                    </td>
                    <td className="py-3.5 px-4 text-slate-300">
                      <p>{rest.address || 'N/A'}</p>
                      <p className="text-[10px] text-slate-500">{rest.phone || rest.email}</p>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-700">
                        {rest.status || 'active'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-2">
                      <button
                        onClick={() => {
                          selectActiveRestaurant(rest.id);
                          toast.success(`Context switched to ${rest.name}`);
                        }}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-emerald-950 text-slate-300 hover:text-emerald-400 border border-slate-800 transition-colors"
                        title="Switch to this restaurant context"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleOpenRestaurantModal(rest)}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-colors"
                        title="Edit Restaurant"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteRestaurant(rest.id, rest.name)}
                        className="p-1.5 rounded-lg bg-slate-950 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                        title="Delete Restaurant"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: PROVISION NEW USER (ADMIN / WAITER / KITCHEN / CASHIER) */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title="👑 Provision New Login Credentials & Dispatch Confirmation Email"
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleProvisionUser} className="space-y-4">
          <div className="p-3 bg-purple-950/40 border border-purple-800/80 rounded-xl text-xs text-purple-200">
            <p className="font-bold flex items-center space-x-1.5">
              <Mail className="w-4 h-4 text-purple-300" />
              <span>Super Admin Exclusive Facility:</span>
            </p>
            <p className="text-[11px] text-purple-300/90 mt-1">
              When you submit this form, credentials will be stored in Firestore and an official <strong>Confirmation Email</strong> will be automatically dispatched to the registered address.
            </p>
          </div>

          {/* Role selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Select User Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setUserRole('restaurant_admin')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  userRole === 'restaurant_admin'
                    ? 'bg-purple-950/80 border-purple-500 text-purple-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <p className="font-bold">🏢 Restaurant Admin</p>
                <p className="text-[10px] text-slate-400">Full back-office control</p>
              </button>

              <button
                type="button"
                onClick={() => setUserRole('waiter')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  userRole === 'waiter'
                    ? 'bg-blue-950/80 border-blue-500 text-blue-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <p className="font-bold">🛎️ Waiter / Captain</p>
                <p className="text-[10px] text-slate-400">Table floor & KOT taking</p>
              </button>

              <button
                type="button"
                onClick={() => setUserRole('kitchen')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  userRole === 'kitchen'
                    ? 'bg-orange-950/80 border-orange-500 text-orange-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <p className="font-bold">👨‍🍳 Kitchen KDS</p>
                <p className="text-[10px] text-slate-400">Live order Kanban & chime</p>
              </button>

              <button
                type="button"
                onClick={() => setUserRole('cashier')}
                className={`p-2.5 rounded-xl border text-left text-xs font-semibold transition-all ${
                  userRole === 'cashier'
                    ? 'bg-teal-950/80 border-teal-500 text-teal-200 shadow-md'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <p className="font-bold">💳 Cashier</p>
                <p className="text-[10px] text-slate-400">Billing & settlements</p>
              </button>
            </div>
          </div>

          {/* Restaurant selection */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Assign Restaurant Tenant
            </label>
            <select
              value={selectedRestId}
              onChange={(e) => setSelectedRestId(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-purple-500"
            >
              {restaurants.map(r => (
                <option key={r.id} value={r.id}>{r.name} ({r.id})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={userFullName}
              onChange={(e) => setUserFullName(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Registered Email Address (Confirmation Email will be sent here)
            </label>
            <input
              type="email"
              required
              value={userEmail}
              onChange={(e) => {
                setUserEmail(e.target.value);
                setUserUsername(e.target.value.split('@')[0]);
              }}
              placeholder="e.g. ramesh@restaurant.com"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Generated Password
              </label>
              <button
                type="button"
                onClick={generateRandomPassword}
                className="text-[11px] text-purple-400 hover:text-purple-300 font-bold underline"
              >
                Generate New Password
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                required
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-purple-300 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={() => setIsUserModalOpen(false)}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProvisioning}
              className="flex items-center space-x-2 px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 disabled:opacity-50"
            >
              {isProvisioning ? (
                <span>Registering & Sending Email...</span>
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

      {/* MODAL 2: CONFIRMATION EMAIL SENT PREVIEW MODAL */}
      {sentEmailModal && (
        <Modal
          isOpen={!!sentEmailModal}
          onClose={() => setSentEmailModal(null)}
          title="✉️ Confirmation Email Successfully Dispatched"
          maxWidth="max-w-xl"
        >
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-emerald-950/60 border border-emerald-700 rounded-xl text-emerald-200 flex items-center space-x-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <p className="font-bold">Confirmation Email Sent to {sentEmailModal.recipientEmail}</p>
                <p className="text-[11px] text-emerald-300/80">
                  The user can now log into their designated portal with the generated credentials.
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-2.5">
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">To:</span>
                <span className="font-bold text-white">{sentEmailModal.recipientEmail} ({sentEmailModal.recipientName})</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Subject:</span>
                <span className="font-medium text-purple-300">{sentEmailModal.subject}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="font-bold text-emerald-400">{sentEmailModal.role}</span>
              </div>
              <div className="flex justify-between pb-2 border-b border-slate-800">
                <span className="text-slate-400">Password Provided:</span>
                <code className="font-mono bg-slate-900 px-2 py-0.5 rounded text-rose-300 font-bold">
                  {sentEmailModal.password}
                </code>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Login URL:</span>
                <a href={sentEmailModal.loginUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline font-mono">
                  {sentEmailModal.loginUrl}
                </a>
              </div>
            </div>

            {/* Direct Web Mail Relay Links for 100% In-Inbox Delivery */}
            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
              <p className="text-[11px] font-semibold text-slate-400">
                📤 1-Click Outbound Delivery (Direct from your Admin inbox):
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  href={`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(sentEmailModal.recipientEmail)}&su=${encodeURIComponent(sentEmailModal.subject)}&body=${encodeURIComponent(
                    `Hello ${sentEmailModal.recipientName},\n\nYou have been provisioned with access to RestoPulse Cloud POS.\n\nRole: ${sentEmailModal.role}\nEmail: ${sentEmailModal.recipientEmail}\nPassword: ${sentEmailModal.password}\nLogin URL: ${sentEmailModal.loginUrl}\n\nSuper Admin (altcafe2026@gmail.com)`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-200 border border-red-800/80 font-bold text-xs transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-red-400" />
                  <span>Send via Gmail Web ↗</span>
                </a>

                <a
                  href={`mailto:${sentEmailModal.recipientEmail}?subject=${encodeURIComponent(sentEmailModal.subject)}&body=${encodeURIComponent(
                    `Hello ${sentEmailModal.recipientName},\n\nYour RestoPulse login credentials for ${sentEmailModal.role}:\n\nEmail: ${sentEmailModal.recipientEmail}\nPassword: ${sentEmailModal.password}\nLogin URL: ${sentEmailModal.loginUrl}\n\nSuper Admin Provisioning.`
                  )}`}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-semibold text-xs transition-colors"
                >
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                  <span>Default Mail App</span>
                </a>
              </div>
            </div>

            <div className="flex justify-end items-center pt-2">
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

      {/* MODAL 3: ONBOARD RESTAURANT */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingRest ? `Edit ${editingRest.name}` : 'Onboard New Restaurant Tenant'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSaveRestaurant} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Restaurant Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Spice Haven Bistro"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Tagline
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Authentic Flavors & Fine Dining"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Phone
              </label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
                Tax Rate (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1">
              Address
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Full restaurant location..."
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
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
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-900/40"
            >
              Save Restaurant
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
