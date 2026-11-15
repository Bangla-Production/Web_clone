import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  Bike,
  Mail,
  Lock,
  User,
  Phone,
  ShieldCheck,
  AlertCircle,
  Sun,
  Moon,
  ArrowRight,
  Camera,
  Upload,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useDeliveryPartnerAuth } from '../context/DeliveryPartnerAuthContext';
import { useTheme } from '../context/ThemeContext';
import { validateIndianPhone } from '../utils/phoneValidation';
import { compressImageToBase64 } from '../utils/imageHelper';

export default function DeliveryPartnerAuthPage({ defaultMode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, register, partner } = useDeliveryPartnerAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  // Determine initial mode based on route or prop
  const isRegisterRoute =
    defaultMode === 'register' ||
    location.pathname === '/rider/register' ||
    location.pathname === '/rider/signup';

  const [isRegister, setIsRegister] = useState(isRegisterRoute);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);

  const [vehicleType, setVehicleType] = useState('BIKE');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isRegisterRoute) {
      setIsRegister(true);
    }
  }, [isRegisterRoute]);

  // If already logged in, redirect to /rider
  if (partner) {
    navigate('/rider');
    return null;
  }

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setPhotoLoading(true);
      setError('');
      const base64 = await compressImageToBase64(file, 300, 300, 0.8);
      setPhotoUrl(base64);
    } catch (err) {
      setError(err.message || 'Failed to process profile photo');
    } finally {
      setPhotoLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        // 1. Name validation
        const cleanName = name.trim();
        if (!cleanName || cleanName.length < 3) {
          setError('Please enter a valid proper full name (at least 3 characters)');
          setLoading(false);
          return;
        }

        // 2. Phone validation
        const phoneVal = validateIndianPhone(phone);
        if (!phoneVal.isValid) {
          setError(phoneVal.message);
          setLoading(false);
          return;
        }

        // 3. Email validation
        const cleanEmail = email.trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
          setError('Please enter a valid email address');
          setLoading(false);
          return;
        }

        // 4. Password validation
        if (!password || password.length < 6) {
          setError('Password must be at least 6 characters long');
          setLoading(false);
          return;
        }

        await register({
          name: cleanName,
          email: cleanEmail,
          phone: phoneVal.cleaned,
          photoUrl: photoUrl || '',
          vehicleType,
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          password,
        });
      } else {
        const cleanLogin = email.trim();
        const isNumericPhone = /^[0-9]{10}$/.test(cleanLogin.replace(/\D/g, ''));
        const targetEmail = isNumericPhone && !cleanLogin.includes('@')
          ? `${cleanLogin.replace(/\D/g, '').slice(-10)}@rider.abarkhabo.local`
          : cleanLogin;
        const targetPass = password || `${cleanLogin.replace(/\D/g, '').slice(-10)}@123`;

        await login(targetEmail, targetPass);
      }
      navigate('/rider');
    } catch (err) {
      console.error(err);
      let msg = err?.message || 'Authentication failed. Please check your credentials.';
      if (err?.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered to an account. Please switch to Login.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col justify-center py-10 sm:px-6 lg:px-8 transition-colors">
      {/* Top Bar with theme toggle & home link */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
        <Link
          to="/"
          className="text-xs font-bold text-slate-500 hover:text-amber-500 transition-colors flex items-center gap-1"
        >
          ← Back to Abar Khabo
        </Link>
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-lg text-center mt-6">
        <div className="w-14 h-14 mx-auto rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-cyan-500/20 mb-3">
          <Bike className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          {isRegister ? 'Delivery Partner Registration' : 'Delivery Partner Sign In'}
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {isRegister
            ? 'Join Abar Khabo as a verified delivery rider with instant phone & email signup'
            : 'Sign in to access your live delivery orders & GPS dashboard'}
        </p>

        {/* Mode Switch Tabs */}
        <div className="flex items-center justify-center gap-1 mt-4 p-1 bg-slate-200 dark:bg-slate-800 rounded-2xl max-w-xs mx-auto">
          <button
            type="button"
            onClick={() => {
              setIsRegister(true);
              setError('');
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              isRegister
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Register
          </button>
          <button
            type="button"
            onClick={() => {
              setIsRegister(false);
              setError('');
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all ${
              !isRegister
                ? 'bg-white dark:bg-slate-900 text-cyan-600 dark:text-cyan-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Sign In
          </button>
        </div>
      </div>

      <div className="mt-5 sm:mx-auto sm:w-full sm:max-w-lg px-4">
        <div className="bg-white dark:bg-slate-900 py-6 px-6 shadow-xl border border-slate-200 dark:border-slate-800 rounded-3xl sm:px-8">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegister && (
              <>
                {/* 1. Mandatory Profile Photo */}
                <div className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border-2 border-dashed border-slate-300 dark:border-slate-700">
                  <div className="relative w-20 h-20 rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 border-2 border-cyan-500 shadow-md flex items-center justify-center mb-2">
                    {photoUrl ? (
                      <img src={photoUrl} alt="Rider Preview" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="w-8 h-8 text-slate-400" />
                    )}
                    {photoLoading && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-[10px] text-white font-bold">
                        Resizing...
                      </div>
                    )}
                  </div>
                  <label className="cursor-pointer px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow flex items-center gap-1.5 transition-all">
                    <Upload className="w-3.5 h-3.5" />
                    <span>{photoUrl ? 'Change Profile Picture' : 'Upload Rider Picture *'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  <span className="text-[10px] text-slate-400 mt-1">Proper facial photo required for verification</span>
                </div>

                {/* 2. Proper Name & Mobile Phone */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Proper Full Name *
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        required
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Rahul Sharma"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      10-Digit Mobile Phone *
                    </label>
                    <div className="relative">
                      <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        required
                        type="tel"
                        maxLength={10}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                        placeholder="e.g. 9876543210"
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                </div>

                {/* 3. Vehicle Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Type *
                    </label>
                    <select
                      value={vehicleType}
                      onChange={(e) => setVehicleType(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="BIKE">Motorcycle / Bike</option>
                      <option value="SCOOTER">Scooter</option>
                      <option value="EV">Electric Scooter / EV</option>
                      <option value="BICYCLE">Bicycle</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Number
                    </label>
                    <input
                      type="text"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      placeholder="e.g. WB 02 AX 1234"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 uppercase"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Email Address *
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. rider@domain.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-extrabold text-xs shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? 'Processing...'
                : isRegister
                ? 'Complete Registration & Start Delivering'
                : 'Sign In to Rider Terminal'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="mt-5 text-center">
            <button
              type="button"
              onClick={() => {
                setIsRegister(!isRegister);
                setError('');
              }}
              className="text-xs font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              {isRegister
                ? 'Already a delivery partner? Sign in here'
                : 'Need a rider account? Register as delivery partner →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
