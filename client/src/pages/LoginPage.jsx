import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Utensils,
  LogIn,
  AlertCircle,
  Lock,
  Mail,
  KeyRound,
  MailWarning,
  Send,
  Hash,
  ShieldCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useToast } from '../context/ToastContext';
import { resendVerification } from '../services/authAccountService';

export default function LoginPage() {
  const [mode, setMode] = useState('staff'); // 'staff' (Staff ID) or 'admin' (email)
  const [email, setEmail] = useState('');
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [resending, setResending] = useState(false);

  const { login, loginWithStaffId } = useAuth();
  const lastRestaurantId = localStorage.getItem('restopulse_active_rest_id') || '';
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
    } else if (role === 'cashier') {
      navigate('/cashier');
    } else {
      navigate('/pos');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setPendingEmail('');

    let result;
    if (mode === 'staff') {
      if (!staffId || !password) {
        setErrorMessage('Please enter both your Staff ID and password.');
        return;
      }
      setLoading(true);
      result = await loginWithStaffId(staffId, password);
    } else {
      if (!email || !password) {
        setErrorMessage('Please enter both your email address and password.');
        return;
      }
      setLoading(true);
      result = await login(email, password);
    }
    setLoading(false);

    if (result?.success) {
      handleNavigationByUser(result.user);
    } else {
      setErrorMessage(result?.error || 'Login Failed. Please verify your credentials.');
      if (result?.pending) setPendingEmail(result.pendingEmail || '');
    }
  };

  const handleResendVerification = async () => {
    try {
      setResending(true);
      const res = await resendVerification(pendingEmail, password);
      if (res.success) {
        toast.success(`Confirmation email sent to ${pendingEmail}. Check Spam / Junk too.`);
      } else {
        toast.error(res.error || 'Could not resend the confirmation email.');
      }
    } finally {
      setResending(false);
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
          {errorMessage && !pendingEmail && (
            <div className="p-3.5 rounded-xl bg-rose-950/80 border border-rose-600 text-rose-200 text-xs flex items-start space-x-2.5 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-rose-300">Authentication Failed</p>
                <p className="text-[11px] text-rose-200/90 mt-0.5">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Pending email confirmation banner */}
          {pendingEmail && (
            <div className="p-3.5 rounded-xl bg-amber-950/70 border border-amber-600 text-amber-100 text-xs flex items-start space-x-2.5">
              <MailWarning className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="font-bold text-amber-300">Account Pending — Email Not Confirmed</p>
                <p className="text-[11px] text-amber-100/90">{errorMessage}</p>
                <p className="text-[11px] font-semibold text-amber-200">
                  📥 The email can land in your Spam / Junk folder. Please check there and click the confirmation link.
                </p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resending}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white font-semibold text-[11px] disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  <span>{resending ? 'Sending...' : 'Resend confirmation email'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Staff vs Admin login toggle */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => { setMode('staff'); setErrorMessage(''); setPendingEmail(''); }}
              className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'staff' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff Login</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('admin'); setErrorMessage(''); setPendingEmail(''); }}
              className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                mode === 'admin' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Admin / Owner</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'staff' ? (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Staff ID
                </label>
                <div className="relative">
                  <Hash className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={staffId}
                    onChange={(e) => {
                      setStaffId(e.target.value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    placeholder="e.g. 482913"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">Given to you by your Restaurant Admin — waiter, kitchen and cashier accounts use this.</p>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (errorMessage) setErrorMessage('');
                      if (pendingEmail) setPendingEmail('');
                    }}
                    placeholder="you@example.com"
                    className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            )}

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
                    if (pendingEmail) setPendingEmail('');
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
            <span>
              {mode === 'staff'
                ? 'Self-registration is disabled. Ask your Restaurant Admin for your Staff ID and password.'
                : 'Self-registration is disabled. New admin accounts stay Pending until the email is confirmed — check your Spam / Junk folder for the confirmation mail.'}
            </span>
          </div>
        </div>

        {/* Public customer menu link & Seeder */}
        <div className="flex items-center justify-between text-xs text-slate-400 px-2">
          {lastRestaurantId ? (
            <Link
              to={`/menu/${lastRestaurantId}`}
              className="hover:text-emerald-400 underline transition-colors"
            >
              Open Public Customer Menu ↗
            </Link>
          ) : (
            <span />
          )}
        </div>
      </div>
    </div>
  );
}
