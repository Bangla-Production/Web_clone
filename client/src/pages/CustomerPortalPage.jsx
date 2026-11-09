import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Utensils, Search, Star, MapPin, Clock, ChevronRight,
  User, LogIn, LogOut, Mail, Lock, Phone, Eye, EyeOff,
  CheckCircle2, AlertCircle, Sparkles, Sun, Moon, ArrowLeft,
  ShoppingBag, Package, Bike, Truck, Navigation2, RefreshCw
} from 'lucide-react';
import { getAllRestaurants } from '../services/firestoreService';
import { getOnlineOrdersAcrossRestaurants } from '../services/onlineOrderService';
import { calculateDistanceKm, getSavedCustomerLocation } from '../services/locationService';
import LocationPermissionModal from '../components/delivery/LocationPermissionModal';
import AddressSelectorModal from '../components/delivery/AddressSelectorModal';
import { useCustomerAuth } from '../context/CustomerAuthContext';
import { useTheme } from '../context/ThemeContext';
import { validateIndianPhone } from '../utils/phoneValidation';

// ─── Auth Panel (login / register) ───────────────────────────────────────────

function AuthPanel({ onClose }) {
  const { login, register, resetPassword } = useCustomerAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'reset'
  const [name, setName]       = useState('');
  const [email, setEmail]     = useState('');
  const [phone, setPhone]     = useState('');
  const [password, setPass]   = useState('');
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [success, setSuccess] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setSuccess('');

    if (mode === 'register') {
      const phoneCheck = validateIndianPhone(phone);
      if (!phoneCheck.isValid) {
        setError(phoneCheck.message);
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        onClose();
      } else if (mode === 'register') {
        const phoneCheck = validateIndianPhone(phone);
        await register({ name, email, phone: phoneCheck.cleaned, password });
        setSuccess('Account created! Check your email to verify, then log in.');
        setMode('login');
      } else {
        await resetPassword(email);
        setSuccess('Reset link sent — check your email.');
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xl font-bold">✕</button>

        <div className="flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 dark:text-white text-lg leading-none">
              {mode === 'login' ? 'Customer Login' : mode === 'register' ? 'Create Account' : 'Reset Password'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Abar Khabo Customer Portal</p>
          </div>
        </div>

        {error   && <div className="mb-3 p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300 text-xs flex gap-2 items-start"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0"/>{error}</div>}
        {success && <div className="mb-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-xs flex gap-2 items-start"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0"/>{success}</div>}

        <form onSubmit={submit} className="space-y-3">
          {mode === 'register' && (
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Your full name"
                value={name} onChange={e => setName(e.target.value)} required
              />
            </div>
          )}
          {mode === 'register' && (
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Phone number"
                value={phone} onChange={e => setPhone(e.target.value)}
              />
            </div>
          )}
          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="email"
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Email address"
              value={email} onChange={e => setEmail(e.target.value)} required
            />
          </div>
          {mode !== 'reset' && (
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type={showPw ? 'text' : 'password'}
                className="w-full pl-9 pr-10 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Password"
                value={password} onChange={e => setPass(e.target.value)} required
              />
              <button type="button" onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                {showPw ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-sm shadow-lg shadow-amber-500/30 transition-all disabled:opacity-60"
          >
            {loading ? 'Please wait...' : mode === 'login' ? 'Login' : mode === 'register' ? 'Create Account' : 'Send Reset Link'}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1.5">
          {mode === 'login' && (
            <>
              <button onClick={() => setMode('reset')} className="text-amber-600 dark:text-amber-400 hover:underline block w-full">Forgot password?</button>
              <button onClick={() => setMode('register')} className="text-slate-600 dark:text-slate-300 hover:underline block w-full">New here? Create a free account →</button>
            </>
          )}
          {mode === 'register' && (
            <button onClick={() => setMode('login')} className="text-slate-600 dark:text-slate-300 hover:underline">Already have an account? Log in</button>
          )}
          {mode === 'reset' && (
            <button onClick={() => setMode('login')} className="text-slate-600 dark:text-slate-300 hover:underline flex items-center gap-1 justify-center"><ArrowLeft className="w-3 h-3"/>Back to login</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Customer Orders Modal ───────────────────────────────────────────────────

function CustomerOrdersModal({ onClose, defaultPhone }) {
  const [phone, setPhone] = useState(defaultPhone || '');
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const fetchOrders = async (phoneToQuery) => {
    if (!phoneToQuery) return;
    setLoading(true);
    try {
      const list = await getOnlineOrdersAcrossRestaurants(phoneToQuery.trim());
      setOrders(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  useEffect(() => {
    if (defaultPhone) {
      fetchOrders(defaultPhone);
    }
  }, [defaultPhone]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 relative max-h-[90vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-white text-xl font-bold">✕</button>

        <div className="flex items-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <Package className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="font-extrabold text-slate-900 dark:text-white text-lg leading-none">My Orders & Live Tracking</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Track your takeaway and live delivery orders</p>
          </div>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          const check = validateIndianPhone(phone);
          if (!check.isValid) {
            alert(check.message);
            return;
          }
          fetchOrders(check.cleaned);
        }} className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="tel"
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-400"
              placeholder="Enter 10-digit mobile number"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow transition-all disabled:opacity-60 flex items-center gap-1.5"
          >
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
          </button>
        </form>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-xs">Finding your orders...</div>
          ) : orders.length === 0 ? (
            searched ? (
              <div className="py-12 text-center text-slate-400 text-xs">
                No orders found for this phone number.
              </div>
            ) : (
              <div className="py-12 text-center text-slate-400 text-xs">
                Enter your mobile number above to view all past and active orders.
              </div>
            )
          ) : (
            orders.map(order => (
              <div key={order.id} className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900 dark:text-white">
                    {order.orderType === 'DELIVERY' ? <Bike className="w-3.5 h-3.5 text-cyan-500"/> : <Package className="w-3.5 h-3.5 text-teal-500"/>}
                    <span>#{order.id.slice(-6).toUpperCase()}</span>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                      {order.orderType}
                    </span>
                  </div>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">
                    ₹{(order.totalAmount || 0).toFixed(0)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                  <span>Status: <strong className="text-amber-600 dark:text-amber-400 uppercase font-black">{order.status}</strong></span>
                  <span>{order.items?.length || 0} item(s)</span>
                </div>

                {order.orderType === 'DELIVERY' && (
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
                    <a
                      href={`/track/${order.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
                    >
                      <Navigation2 className="w-3.5 h-3.5" /> Live GPS Map & Rider Tracking →
                    </a>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Restaurant Card ──────────────────────────────────────────────────────────

function RestaurantCard({ restaurant, customerLoc }) {
  const cuisines = restaurant.cuisine || restaurant.cuisines || '';

  // Distance & serviceability calculation
  const rLat = restaurant.coordinates?.lat ?? restaurant.lat;
  const rLng = restaurant.coordinates?.lng ?? restaurant.lng;
  let distanceKm = null;
  if (customerLoc?.lat && customerLoc?.lng && rLat && rLng) {
    distanceKm = calculateDistanceKm(customerLoc.lat, customerLoc.lng, rLat, rLng);
  }
  const maxRadius = restaurant.deliveryRadiusKm || 12;
  const isServiceable = distanceKm !== null ? distanceKm <= maxRadius : true;

  return (
    <Link
      to={`/menu/${restaurant.id}`}
      className="group block bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 rounded-2xl overflow-hidden hover:shadow-xl hover:shadow-amber-500/10 hover:border-amber-300 dark:hover:border-amber-500/50 transition-all duration-200"
    >
      {/* Cover image or gradient */}
      <div className="relative h-36 bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 overflow-hidden">
        {restaurant.coverImage ? (
          <img src={restaurant.coverImage} alt={restaurant.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Utensils className="w-16 h-16 text-white/40" />
          </div>
        )}

        {/* Status Badge */}
        {restaurant.status === 'active' ? (
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wide shadow">Open</span>
        ) : (
          <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-slate-600 text-slate-200 text-[10px] font-bold uppercase tracking-wide">Closed</span>
        )}

        {/* Distance Badge if available */}
        {distanceKm !== null && (
          <span className="absolute bottom-3 left-3 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-white text-[11px] font-semibold flex items-center gap-1 shadow">
            <Navigation2 className="w-3 h-3 text-amber-400" />
            {distanceKm.toFixed(1)} km
          </span>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-extrabold text-slate-900 dark:text-white text-base leading-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">{restaurant.name}</h3>
          {distanceKm !== null && !isServiceable && (
            <span className="text-[10px] font-bold text-rose-500 bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded-md shrink-0">
              Takeaway Only
            </span>
          )}
        </div>

        {cuisines && <p className="text-xs text-amber-600 dark:text-amber-400 font-semibold mt-0.5">{cuisines}</p>}
        {restaurant.address && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 flex items-center gap-1 leading-snug">
            <MapPin className="w-3 h-3 shrink-0" />{restaurant.address}
          </p>
        )}
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
            {restaurant.openHours && <span className="flex items-center gap-1"><Clock className="w-3 h-3"/>{restaurant.openHours}</span>}
            {restaurant.rating   && <span className="flex items-center gap-1"><Star className="w-3 h-3 text-amber-400 fill-amber-400"/>{restaurant.rating}</span>}
          </div>
          <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-0.5 group-hover:gap-1.5 transition-all">
            View Menu <ChevronRight className="w-3.5 h-3.5"/>
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerPortalPage() {
  const { customer, logout, loading: authLoading } = useCustomerAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  const navigate = useNavigate();

  const [restaurants, setRestaurants]   = useState([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [showAuthPanel, setShowAuth]    = useState(false);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [customerLoc, setCustomerLoc]   = useState(() => getSavedCustomerLocation());
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showAddressSelector, setShowAddressSelector] = useState(false);

  useEffect(() => {
    document.title = 'Abar Khabo — Online Food Delivery & Takeaway';
    getAllRestaurants()
      .then((list) => setRestaurants(list.filter(r => r.status !== 'suspended')))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = restaurants.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.name?.toLowerCase().includes(q) ||
      r.cuisine?.toLowerCase().includes(q) ||
      r.address?.toLowerCase().includes(q)
    );
  });

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors`}>

      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur border-b border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow">
              <Utensils className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold text-lg tracking-tight text-slate-900 dark:text-white">Abar Khabo</span>
            <span className="hidden md:inline text-xs font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full border border-amber-200 dark:border-amber-700">Food Discovery & Delivery</span>
          </div>

          {/* Location Delivery Selector Pill */}
          <button
            onClick={() => {
              if (customer) setShowAddressSelector(true);
              else setShowLocationModal(true);
            }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 border border-slate-200 dark:border-slate-700 text-xs text-left max-w-[170px] sm:max-w-xs transition-colors"
            title={customerLoc?.formattedAddress || 'Set delivery location'}
          >
            <MapPin className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <div className="truncate flex-1">
              <span className="text-[10px] text-slate-400 block leading-tight">Deliver to</span>
              <span className="font-bold text-slate-800 dark:text-slate-200 truncate block leading-tight">
                {customerLoc?.shortAddress || customerLoc?.label || 'Set your location'}
              </span>
            </div>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">▾</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300"
              title={isDark ? 'Light mode' : 'Dark mode'}
            >
              {isDark ? <Sun className="w-4 h-4"/> : <Moon className="w-4 h-4"/>}
            </button>

            {!authLoading && (
              customer ? (
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                      <User className="w-3 h-3 text-white"/>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">{customer.name || customer.email}</span>
                  </div>
                  <button
                    onClick={logout}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-red-100 dark:hover:bg-red-900/40 text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                    title="Sign out"
                  >
                    <LogOut className="w-4 h-4"/>
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowAuth(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white text-xs font-bold shadow hover:from-amber-600 hover:to-orange-600 transition-all"
                >
                  <LogIn className="w-3.5 h-3.5"/>
                  Sign In
                </button>
              )
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <div className="bg-gradient-to-br from-amber-50 via-orange-50 to-rose-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 border-b border-amber-100 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 py-10 text-center">
          <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700">
            <Sparkles className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400"/>
            <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Takeaway · Delivery · Dine-In</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mb-2">
            Discover & Order from <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-500 to-orange-500">Every Restaurant</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-lg mx-auto mb-6">
            Browse menus from all restaurants, place takeaway or delivery orders, and track your food — all in one place.
          </p>

          {/* Search */}
          <div className="relative max-w-md mx-auto">
            <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"/>
            <input
              className="w-full pl-11 pr-4 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 shadow-sm"
              placeholder="Search restaurants, cuisines..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Quick links */}
          <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
            <button
              onClick={() => {
                if (customer) setShowAddressSelector(true);
                else setShowLocationModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-amber-300 dark:hover:border-amber-500 transition-colors shadow-sm cursor-pointer"
            >
              <MapPin className="w-3.5 h-3.5 text-amber-500"/>
              {customerLoc?.shortAddress ? `Deliver to: ${customerLoc.shortAddress}` : 'Set Delivery Location'}
            </button>
            <button
              onClick={() => setShowOrdersModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:border-amber-300 dark:hover:border-amber-500 transition-colors shadow-sm cursor-pointer"
            >
              <Package className="w-3.5 h-3.5 text-amber-500"/> My Orders & Tracking
            </button>
          </div>
        </div>
      </div>

      {/* Restaurant Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1,2,3,4,5,6].map(i => (
              <div key={i} className="rounded-2xl bg-slate-200 dark:bg-slate-800 h-56 animate-pulse"/>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 dark:text-slate-500">
            <Utensils className="w-12 h-12 mx-auto mb-3 opacity-30"/>
            <p className="font-semibold">No restaurants found</p>
            <p className="text-sm mt-1">Try a different search term</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-extrabold text-slate-900 dark:text-white text-lg">
                {search ? `Results for "${search}"` : 'All Restaurants'}
                <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">({filtered.length})</span>
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filtered.map(r => <RestaurantCard key={r.id} restaurant={r} customerLoc={customerLoc}/>)}
            </div>
          </>
        )}
      </div>

      {/* Auth Modal */}
      {showAuthPanel && <AuthPanel onClose={() => setShowAuth(false)}/>}

      {/* Orders Tracking Modal */}
      {showOrdersModal && (
        <CustomerOrdersModal
          onClose={() => setShowOrdersModal(false)}
          defaultPhone={customer?.phone}
        />
      )}

      {/* Location Selection Modals */}
      <LocationPermissionModal
        isOpen={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onLocationConfirmed={(loc) => setCustomerLoc(loc)}
      />

      <AddressSelectorModal
        isOpen={showAddressSelector}
        onClose={() => setShowAddressSelector(false)}
        customerId={customer?.uid}
        onAddressSelected={(addr) => setCustomerLoc(addr)}
      />
    </div>
  );
}
