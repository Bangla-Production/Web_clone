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
  FileText,
  KeyRound,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { useDeliveryPartnerAuth } from '../context/DeliveryPartnerAuthContext';
import { useTheme } from '../context/ThemeContext';
import { validateIndianPhone } from '../utils/phoneValidation';
import { compressImageToBase64 } from '../utils/imageHelper';
import { validateIndianAadhaar, formatAadhaar, maskAadhaar } from '../utils/aadhaarValidation';

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

  // Aadhaar Details & Verification State
  const [aadhaarNumber, setAadhaarNumber] = useState('');
  const [aadhaarPhoto, setAadhaarPhoto] = useState('');
  const [aadhaarPhotoLoading, setAadhaarPhotoLoading] = useState(false);
  const [isAadhaarVerified, setIsAadhaarVerified] = useState(false);
  const [verifyingAadhaar, setVerifyingAadhaar] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [generatedOtp, setGeneratedOtp] = useState('');
  const [otpError, setOtpError] = useState('');

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

  const handleAadhaarPhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAadhaarPhotoLoading(true);
      setError('');
      const base64 = await compressImageToBase64(file, 600, 400, 0.8);
      setAadhaarPhoto(base64);
    } catch (err) {
      setError(err.message || 'Failed to process Aadhaar document photo');
    } finally {
      setAadhaarPhotoLoading(false);
    }
  };

  const handleAadhaarChange = (e) => {
    const raw = e.target.value;
    const formatted = formatAadhaar(raw);
    setAadhaarNumber(formatted);
    // If user changes number after verifying, reset verification
    if (isAadhaarVerified) {
      setIsAadhaarVerified(false);
    }
  };

  const initiateAadhaarVerification = () => {
    setError('');
    const val = validateIndianAadhaar(aadhaarNumber);
    if (!val.isValid) {
      setError(val.message);
      return;
    }

    const phoneVal = validateIndianPhone(phone);
    if (!phoneVal.isValid) {
      setError('Please provide a valid 10-digit mobile number before verifying Aadhaar');
      return;
    }

    setVerifyingAadhaar(true);
    // Generate simulated 4-digit UIDAI verification code
    const code = String(Math.floor(1000 + Math.random() * 9000));
    setGeneratedOtp(code);
    setOtpInput('');
    setOtpError('');
    setShowOtpModal(true);
    setVerifyingAadhaar(false);
  };

  const handleConfirmOtp = () => {
    if (otpInput.trim() !== generatedOtp) {
      setOtpError('Invalid OTP code. Please enter the 4-digit code shown above.');
      return;
    }
    setIsAadhaarVerified(true);
    setShowOtpModal(false);
    setError('');
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

        // 3. Profile photo validation
        if (!photoUrl) {
          setError('Profile photo / picture is mandatory. Please upload a clear photo.');
          setLoading(false);
          return;
        }

        // 4. Aadhaar validation & verification
        const aadhaarVal = validateIndianAadhaar(aadhaarNumber);
        if (!aadhaarVal.isValid) {
          setError(aadhaarVal.message);
          setLoading(false);
          return;
        }

        if (!isAadhaarVerified) {
          setError('Aadhaar verification is mandatory. Please click "Verify with UIDAI" and complete OTP verification.');
          setLoading(false);
          return;
        }

        if (!aadhaarPhoto) {
          setError('Please upload a clear picture/scan of your Aadhaar Card.');
          setLoading(false);
          return;
        }

        const riderEmail = email.trim() || `${phoneVal.cleaned}@rider.abarkhabo.local`;
        const riderPassword = password || `${phoneVal.cleaned}@123`;

        await register({
          name: cleanName,
          email: riderEmail,
          phone: phoneVal.cleaned,
          photoUrl,
          aadhaarNumber: aadhaarVal.cleaned,
          aadhaarPhoto,
          isAadhaarVerified: true,
          vehicleType,
          vehicleNumber: vehicleNumber.trim().toUpperCase(),
          password: riderPassword,
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
      setError(err.message || 'Authentication failed. Please check your credentials.');
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
            ? 'Join Abar Khabo as a verified delivery rider with UIDAI Aadhaar verification'
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

                {/* 3. Aadhaar Number & UIDAI Verification Box */}
                <div className="p-3.5 rounded-2xl bg-gradient-to-br from-slate-50 to-cyan-50/30 dark:from-slate-800/80 dark:to-cyan-950/20 border border-cyan-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-cyan-500" />
                      <span>UIDAI Aadhaar Verification *</span>
                    </span>
                    {isAadhaarVerified ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 text-[10px] font-black flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> UIDAI Verified
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 text-[10px] font-bold">
                        Verification Required
                      </span>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                      12-Digit Aadhaar Card Number *
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          maxLength={14}
                          value={aadhaarNumber}
                          onChange={handleAadhaarChange}
                          placeholder="XXXX XXXX XXXX"
                          disabled={isAadhaarVerified}
                          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono tracking-wider text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                        />
                      </div>

                      {!isAadhaarVerified ? (
                        <button
                          type="button"
                          onClick={initiateAadhaarVerification}
                          disabled={verifyingAadhaar}
                          className="px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow transition-all shrink-0 flex items-center gap-1"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          <span>Verify with UIDAI</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsAadhaarVerified(false)}
                          className="px-2.5 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-300 transition-all shrink-0"
                        >
                          Change
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Aadhaar Document Photo Upload */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden border border-slate-300 dark:border-slate-700">
                        {aadhaarPhoto ? (
                          <img src={aadhaarPhoto} alt="Aadhaar Doc" className="w-full h-full object-cover" />
                        ) : (
                          <FileText className="w-5 h-5 text-slate-400" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                          {aadhaarPhoto ? '✓ Aadhaar Document Uploaded' : 'Upload Aadhaar Card Copy *'}
                        </p>
                        <p className="text-[10px] text-slate-400">Front image or e-Aadhaar photo</p>
                      </div>
                    </div>

                    <label className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold text-[11px] shadow-sm shrink-0 flex items-center gap-1 transition-all">
                      <Upload className="w-3 h-3" />
                      <span>{aadhaarPhoto ? 'Replace' : 'Upload Card'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleAadhaarPhotoUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>

                {/* 4. Vehicle Details */}
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

            {/* Email (Optional in register, required in login) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRegister ? 'Email Address (Optional)' : 'Registered Mobile Phone or Email *'}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required={!isRegister}
                  type={isRegister ? 'email' : 'text'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={isRegister ? 'Auto-generated from mobile if left blank' : '9876543210 or rider@domain.com'}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            {/* Password / Security PIN */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                {isRegister ? 'Password / Security PIN (Optional)' : 'Password / PIN *'}
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  required={!isRegister}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'Default auto-pin (phone@123) if left empty' : '••••••••'}
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
                ? 'Processing Registration...'
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

      {/* UIDAI Aadhaar Verification OTP Modal */}
      {showOtpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 text-emerald-500 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">UIDAI Aadhaar OTP</h3>
                <p className="text-[11px] text-slate-400">Government Identity e-KYC</p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-300">
              <p className="font-semibold">Simulated OTP Sent to +91-{phone.slice(-4).padStart(10, '•')}:</p>
              <div className="mt-2 text-center">
                <span className="font-mono font-black text-xl tracking-widest bg-white dark:bg-slate-900 px-4 py-1 rounded-xl border border-emerald-400 shadow-sm inline-block">
                  {generatedOtp}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-2 text-center">
                (Enter this 4-digit verification code below to verify your Aadhaar)
              </p>
            </div>

            {otpError && (
              <p className="text-xs text-rose-500 font-semibold">{otpError}</p>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Enter 4-Digit UIDAI OTP
              </label>
              <input
                type="text"
                maxLength={4}
                value={otpInput}
                onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 1234"
                className="w-full text-center tracking-widest text-lg font-mono py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOtpInput(generatedOtp)}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
              >
                Auto-Fill OTP
              </button>
              <button
                type="button"
                onClick={handleConfirmOtp}
                className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition-all"
              >
                Verify & Confirm
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowOtpModal(false)}
              className="w-full text-center text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
