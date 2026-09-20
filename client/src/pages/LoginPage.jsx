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
  Users,
  ChefHat,
  Receipt,
  Sparkles,
  Zap,
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  Sun,
  Moon
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRestaurant } from '../context/RestaurantContext';
import { useTheme } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { resendVerification } from '../services/authAccountService';

export default function LoginPage() {
  const [mode, setMode] = useState('staff'); // 'staff' (Staff ID) or 'admin' (email)
  const [activeInput, setActiveInput] = useState('staffId'); // 'staffId' or 'password' (for numeric keypad)
  const [email, setEmail] = useState('');
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [pendingEmail, setPendingEmail] = useState('');
  const [resending, setResending] = useState(false);

  const { login, loginWithStaffId } = useAuth();
  const { theme, isDark, toggleTheme } = useTheme();
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
    if (e) e.preventDefault();
    setErrorMessage('');
    setPendingEmail('');

    let result;
    if (mode === 'staff') {
      if (!staffId || !password) {
        setErrorMessage('Please enter both your Staff ID and password/PIN.');
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

  // Keypad click handler for fast touchscreen POS operation
  const handleKeypadPress = (val) => {
    if (activeInput === 'staffId') {
      if (val === 'CLEAR') setStaffId('');
      else if (val === 'BACKSPACE') setStaffId((prev) => prev.slice(0, -1));
      else setStaffId((prev) => (prev.length < 12 ? prev + val : prev));
    } else {
      if (val === 'CLEAR') setPassword('');
      else if (val === 'BACKSPACE') setPassword((prev) => prev.slice(0, -1));
      else setPassword((prev) => (prev.length < 20 ? prev + val : prev));
    }
    if (errorMessage) setErrorMessage('');
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-10 bg-pos-dark text-slate-800 dark:text-slate-100 relative overflow-hidden transition-colors duration-200">
      {/* Top Floating Mood Switcher */}
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={toggleTheme}
          className="pos-btn-touch flex items-center space-x-2 px-4 py-2 rounded-2xl bg-pos-surface border border-pos-border hover:border-amber-400 text-xs font-black shadow-lg transition-all"
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 fill-amber-400 animate-spin-slow" />
              <span className="text-slate-200">White Mood ☀️</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-600 fill-indigo-600" />
              <span className="text-slate-800">Dark Mood 🌙</span>
            </>
          )}
        </button>
      </div>

      {/* Background ambient lighting glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-blue-500/5 dark:bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      <div className="max-w-5xl w-full z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        
        {/* Left Hero Section: Petpooja Brand & Live POS Highlights */}
        <div className="lg:col-span-5 space-y-6 text-center lg:text-left">
          {/* Brand Logo & Title */}
          <div className="space-y-3">
            <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-black tracking-wider uppercase">
              <Zap className="w-3.5 h-3.5 fill-current animate-bounce" />
              <span>Commercial Petpooja Cloud POS</span>
            </div>

            <div className="flex items-center justify-center lg:justify-start space-x-3">
              <div className="p-3.5 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 text-slate-950 shadow-pos-amber">
                <Utensils className="w-8 h-8 stroke-[2.5]" />
              </div>
              <div>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-slate-900 dark:text-white font-display">
                  {restaurant?.name || 'RestoPulse POS'}
                </h1>
                <p className="text-xs text-amber-600 dark:text-amber-400 font-bold tracking-wide">
                  High-Speed Cloud Billing & Kitchen Dispatch
                </p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              Enterprise restaurant management suite designed for rapid counter billing, live KDS kitchen automation, floor table orders, and instant revenue sync.
            </p>
          </div>

          {/* Feature Showcase Badges */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <div className="p-3.5 rounded-2xl bg-pos-surface border border-pos-border backdrop-blur-md flex items-center space-x-3 shadow-sm hover:border-amber-500/40 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/30">
                <ChefHat className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">Live KDS Display</p>
                <p className="text-[10px] text-amber-600 dark:text-amber-300/80 truncate">Instant Kitchen KOT</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-pos-surface border border-pos-border backdrop-blur-md flex items-center space-x-3 shadow-sm hover:border-emerald-500/40 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                <Receipt className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">Fast POS Billing</p>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-300/80 truncate">UPI, Cash & Split</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-pos-surface border border-pos-border backdrop-blur-md flex items-center space-x-3 shadow-sm hover:border-blue-500/40 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 border border-blue-500/30">
                <Users className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">Floor Tables</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-300/80 truncate">Color Visual Status</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-pos-surface border border-pos-border backdrop-blur-md flex items-center space-x-3 shadow-sm hover:border-purple-500/40 transition-colors">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-500/30">
                <Sparkles className="w-4 h-4 stroke-[2.5]" />
              </div>
              <div className="text-left overflow-hidden">
                <p className="text-xs font-black text-slate-900 dark:text-white truncate">Digital QR Menu</p>
                <p className="text-[10px] text-purple-600 dark:text-purple-300/80 truncate">Live Smartphone Orders</p>
              </div>
            </div>
          </div>

          {/* Cloud Status Footer Indicator */}
          <div className="hidden lg:flex items-center space-x-3 p-3 rounded-2xl bg-pos-surface border border-pos-border text-xs text-slate-500 dark:text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Station 01 Active • Cloud Firestore Realtime Sync</span>
          </div>
        </div>

        {/* Right Hero Section: Login Terminal Card */}
        <div className="lg:col-span-7">
          <div className="pos-surface-glass rounded-3xl p-6 sm:p-8 shadow-2xl border border-pos-border relative backdrop-blur-xl">
            
            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1.5 bg-pos-dark border border-pos-border rounded-2xl mb-6 shadow-inner">
              <button
                type="button"
                onClick={() => { setMode('staff'); setErrorMessage(''); setPendingEmail(''); }}
                className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-extrabold transition-all pos-btn-touch ${
                  mode === 'staff'
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-pos-amber'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-4 h-4 stroke-[2.5]" />
                <span>Waiter / Staff PIN</span>
              </button>
              <button
                type="button"
                onClick={() => { setMode('admin'); setErrorMessage(''); setPendingEmail(''); }}
                className={`flex items-center justify-center space-x-2 py-3 rounded-xl text-xs font-extrabold transition-all pos-btn-touch ${
                  mode === 'admin'
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 shadow-pos-glow'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ShieldCheck className="w-4 h-4 stroke-[2.5]" />
                <span>Admin / Owner Login</span>
              </button>
            </div>

            {/* Error Message Alert Banner */}
            {errorMessage && !pendingEmail && (
              <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/80 border border-rose-300 dark:border-rose-500 text-rose-800 dark:text-rose-200 text-xs flex items-start space-x-2.5 animate-shake mb-4 shadow-lg">
                <AlertCircle className="w-5 h-5 text-rose-500 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-extrabold text-rose-700 dark:text-rose-300">Terminal Authentication Notice</p>
                  <p className="text-[11px] text-rose-600 dark:text-rose-200/90 mt-0.5">{errorMessage}</p>
                </div>
              </div>
            )}

            {/* Pending Email Confirmation Banner */}
            {pendingEmail && (
              <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/80 border border-amber-300 dark:border-amber-500 text-amber-900 dark:text-amber-100 text-xs flex items-start space-x-3 mb-4 shadow-lg">
                <MailWarning className="w-5 h-5 text-amber-500 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="font-bold text-amber-700 dark:text-amber-300">Account Pending Verification</p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-100/90">{errorMessage}</p>
                  <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
                    📥 Please check your Spam / Junk folder and click the confirmation link.
                  </p>
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={resending}
                    className="pos-btn-touch inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] disabled:opacity-50"
                  >
                    <Send className="w-3 h-3" />
                    <span>{resending ? 'Sending...' : 'Resend confirmation email'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Form Fields */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'staff' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
                      Staff ID Code
                    </label>
                    <div className="relative">
                      <Hash className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-500" />
                      <input
                        type="text"
                        inputMode="numeric"
                        required
                        value={staffId}
                        onFocus={() => setActiveInput('staffId')}
                        onChange={(e) => {
                          setStaffId(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="e.g. 482913"
                        className={`w-full pl-10 pr-4 py-3 bg-pos-dark border rounded-2xl text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none transition-all font-num tracking-widest ${
                          activeInput === 'staffId' ? 'border-amber-500 ring-2 ring-amber-400/30 shadow-pos-amber' : 'border-pos-border'
                        }`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 mb-1.5">
                      Access PIN / Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onFocus={() => setActiveInput('password')}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="••••••••"
                        className={`w-full pl-10 pr-10 py-3 bg-pos-dark border rounded-2xl text-base text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none transition-all font-num tracking-widest ${
                          activeInput === 'password' ? 'border-amber-500 ring-2 ring-amber-400/30 shadow-pos-amber' : 'border-pos-border'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                      Admin Email Address
                    </label>
                    <div className="relative">
                      <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500" />
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errorMessage) setErrorMessage('');
                          if (pendingEmail) setPendingEmail('');
                        }}
                        placeholder="admin@restaurant.com"
                        className="w-full pl-10 pr-4 py-3 bg-pos-dark border border-pos-border rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5">
                      Admin Security Password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (errorMessage) setErrorMessage('');
                        }}
                        placeholder="••••••••"
                        className="w-full pl-10 pr-10 py-3 bg-pos-dark border border-pos-border rounded-2xl text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/30 transition-all font-num"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Touch Numeric Keypad for Staff Mode (Petpooja POS Style) */}
              {mode === 'staff' && (
                <div className="pt-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-2 px-1">
                    <span>Active Field: <strong className="text-amber-600 dark:text-amber-400 capitalize">{activeInput === 'staffId' ? 'Staff ID' : 'PIN / Password'}</strong></span>
                    <button
                      type="button"
                      onClick={() => setActiveInput(activeInput === 'staffId' ? 'password' : 'staffId')}
                      className="text-amber-600 dark:text-amber-400 hover:underline font-semibold"
                    >
                      Switch to {activeInput === 'staffId' ? 'PIN' : 'Staff ID'}
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-2xl bg-pos-dark border border-pos-border">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLEAR', '0', 'BACKSPACE'].map((keyVal) => (
                      <button
                        key={keyVal}
                        type="button"
                        onClick={() => handleKeypadPress(keyVal)}
                        className={`py-3.5 rounded-xl font-black text-sm transition-all pos-btn-touch ${
                          keyVal === 'CLEAR'
                            ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800/60 hover:bg-rose-200 text-xs'
                            : keyVal === 'BACKSPACE'
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-slate-300 text-xs'
                            : 'bg-pos-surface text-slate-900 dark:text-white border border-pos-border hover:border-amber-500/50 hover:bg-pos-card-hover font-num text-base shadow-sm'
                        }`}
                      >
                        {keyVal === 'BACKSPACE' ? '⌫' : keyVal}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit CTA Button */}
              <button
                type="submit"
                disabled={loading}
                className={`pos-btn-touch w-full py-4 px-6 rounded-2xl font-black text-sm flex items-center justify-center space-x-2 transition-all disabled:opacity-50 mt-4 shadow-xl ${
                  mode === 'staff' ? 'petpooja-btn-kot' : 'petpooja-btn-pay'
                }`}
              >
                {loading ? (
                  <div className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin"></div>
                ) : (
                  <>
                    <LogIn className="w-5 h-5 stroke-[2.5]" />
                    <span>AUTHENTICATE & LAUNCH TERMINAL</span>
                    <ArrowRight className="w-4 h-4 stroke-[2.5]" />
                  </>
                )}
              </button>
            </form>

            {/* Quick Demo Shortcuts Banner */}
            <div className="mt-5 pt-4 border-t border-pos-border flex items-center justify-between text-xs">
              <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
                <KeyRound className="w-4 h-4 text-amber-500" />
                <span className="text-[11px]">Multi-branch POS Station Ready</span>
              </div>
              {lastRestaurantId && (
                <Link
                  to={`/menu/${lastRestaurantId}`}
                  target="_blank"
                  className="text-amber-600 dark:text-amber-400 hover:underline font-bold text-[11px] flex items-center space-x-1"
                >
                  <span>QR Menu</span>
                  <span>↗</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
