import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Utensils,
  Shield,
  User,
  ChefHat,
  LogIn,
  AlertCircle,
  Database,
  CheckCircle2,
  CreditCard,
  Lock,
  Mail,
  ShieldAlert,
  KeyRound
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import { seedFirestoreDatabase } from '../firebase/seedFirestore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login } = useAuth();
  const { restaurant } = useRestaurant();
  const toast = useToast();
  const navigate = useNavigate();

  const handleNavigationByUser = (userObj) => {
    const role = userObj?.role;
    if (role === 'super_admin') {
      navigate('/super-admin');
    } else if (role === 'restaurant_admin') {
      navigate('/dashboard');
    } else if (role === 'kitchen') {
      navigate('/kitchen');
    } else {
      navigate('/pos');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    if (!email || !password) {
      setErrorMessage('Please enter both your email address and password.');
      return;
    }

    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result?.success) {
      handleNavigationByUser(result.user);
    } else {
      setErrorMessage(result?.error || 'Login Failed. Please verify your credentials.');
    }
  };

  const handleQuickLogin = async (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setErrorMessage('');
    setLoading(true);
    const result = await login(demoEmail, demoPass);
    setLoading(false);

    if (result?.success) {
      handleNavigationByUser(result.user);
    } else {
      setErrorMessage(result?.error || 'Login Failed.');
    }
  };

  const handleSeed = async () => {
    try {
      setSeeding(true);
      await seedFirestoreDatabase();
      toast.success('Firebase Firestore successfully initialized with demo data!');
    } catch (err) {
      toast.info('Firestore seeded / verified!');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-center items-center p-4 bg-slate-950 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-md w-full z-10 space-y-4">
        {/* Brand Header */}
        <div className="text-center">
          <div className="inline-flex p-3 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 mb-3 shadow-lg shadow-emerald-950">
            <Utensils className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{restaurant?.name || 'AltCafe Multi-Tenant POS'}</h1>
          <p className="text-xs text-slate-400 mt-1">Super Admin Authority & Provisioned Restaurant Portals</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-2xl p-6 shadow-2xl space-y-4">
          {/* Visual Error Message Alert Banner */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-start space-x-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-300">Authentication Failed</p>
                <p className="text-[11px] text-rose-200/90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Username / Email Address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="e.g. altcafe2026@gmail.com or superadmin@restopulse.com"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm shadow-lg shadow-emerald-900/30 flex items-center justify-center space-x-2 transition-all duration-200 disabled:opacity-50 mt-1"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Authenticate & Open Portal</span>
                </>
              )}
            </button>
          </form>

          {/* Super Admin Notice */}
          <div className="p-2.5 bg-purple-950/30 border border-purple-800/50 rounded-xl text-[11px] text-purple-300 flex items-center space-x-2">
            <KeyRound className="w-4 h-4 text-purple-400 shrink-0" />
            <span>Only the Super Admin can register credentials. Self-registration is disabled.</span>
          </div>

          {/* 1-Click Role Switchers */}
          <div className="pt-2 border-t border-slate-800 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 text-center">
              1-Click Portal Logins
            </p>

            {/* Super Admin Portal button */}
            <button
              type="button"
              onClick={() => handleQuickLogin('altcafe2026@gmail.com', 'Alt1234$')}
              className="w-full p-2 rounded-xl bg-purple-950/50 hover:bg-purple-900/60 border border-purple-700/80 text-left transition-all flex items-center justify-between"
            >
              <div className="flex items-center space-x-2">
                <ShieldAlert className="w-4 h-4 text-purple-400 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-purple-200">👑 Super Admin Portal</p>
                  <p className="text-[10px] text-slate-400">altcafe2026@gmail.com (Full Provisioning & Emails)</p>
                </div>
              </div>
              <span className="text-[10px] bg-purple-900 px-1.5 py-0.5 rounded text-purple-200 font-mono">
                Platform Root
              </span>
            </button>

            {/* Grid of Staff Demo Roles */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleQuickLogin('waiter@restopulse.com', 'password123')}
                className="p-2 rounded-xl bg-blue-950/40 hover:bg-blue-900/50 border border-blue-800/60 text-left transition-all"
              >
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4 text-blue-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-blue-200">🛎️ Waiter (Rahul)</p>
                    <p className="text-[10px] text-slate-400">Order taking & KOT</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('kitchen@restopulse.com', 'password123')}
                className="p-2 rounded-xl bg-orange-950/40 hover:bg-orange-900/50 border border-orange-800/60 text-left transition-all"
              >
                <div className="flex items-center space-x-2">
                  <ChefHat className="w-4 h-4 text-orange-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-orange-200">👨‍🍳 Kitchen KDS</p>
                    <p className="text-[10px] text-slate-400">Live chime & tickets</p>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('cashier@restopulse.com', 'password123')}
                className="col-span-2 p-2 rounded-xl bg-teal-950/40 hover:bg-teal-900/50 border border-teal-800/60 text-left transition-all"
              >
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-teal-400 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-teal-200">💳 Cashier (Anita)</p>
                    <p className="text-[10px] text-slate-400">Billing & receipts</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Public customer menu link & Seeder */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-2">
          <Link
            to="/menu"
            className="hover:text-emerald-400 underline transition-colors"
          >
            Open Public Customer Menu ↗
          </Link>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="hover:text-purple-400 transition-colors flex items-center space-x-1"
          >
            <Database className="w-3.5 h-3.5" />
            <span>{seeding ? 'Seeding...' : 'Seed Firestore Demo'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
