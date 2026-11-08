import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
} from 'lucide-react';
import { useDeliveryPartnerAuth } from '../context/DeliveryPartnerAuthContext';
import { useTheme } from '../context/ThemeContext';

export default function DeliveryPartnerAuthPage() {
  const navigate = useNavigate();
  const { login, register, partner } = useDeliveryPartnerAuth();
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [vehicleType, setVehicleType] = useState('BIKE');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to /rider
  if (partner) {
    navigate('/rider');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        await register({
          name,
          email,
          phone,
          vehicleType,
          vehicleNumber,
          password,
        });
      } else {
        await login(email, password);
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
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 transition-colors">
      {/* Top Bar */}
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 shadow-sm"
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-14 h-14 mx-auto rounded-3xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-xl shadow-cyan-500/20 mb-3">
          <Bike className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          RestoPulse Delivery Partner
        </h2>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {isRegister ? 'Register your vehicle & start delivering' : 'Sign in to access your rider dashboard'}
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-xl border border-slate-200 dark:border-slate-800 rounded-3xl sm:px-10">
          {error && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            {isRegister && (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Full Name *
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      required
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Rahul Sharma"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Phone *
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      required
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="9876543210"
                      className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Vehicle Type
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
                      Vehicle Reg. Number
                    </label>
                    <input
                      type="text"
                      value={vehicleNumber}
                      onChange={(e) => setVehicleNumber(e.target.value)}
                      placeholder="WB 02 AX 1234"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 uppercase"
                    />
                  </div>
                </div>
              </>
            )}

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
                  placeholder="rider@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

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
                  placeholder="••••••••"
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-bold text-xs shadow-lg shadow-cyan-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? 'Processing...' : isRegister ? 'Register as Delivery Partner' : 'Sign In as Rider'}
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
              className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              {isRegister
                ? 'Already registered? Sign in here'
                : 'Need a rider account? Sign up to deliver'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
