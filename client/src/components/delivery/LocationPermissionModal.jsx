import React, { useState } from 'react';
import { MapPin, Navigation, X, AlertCircle, Search, Compass, CheckCircle2 } from 'lucide-react';
import { requestCurrentPosition, reverseGeocode, saveCustomerLocation } from '../../services/locationService';

export default function LocationPermissionModal({ isOpen, onClose, onLocationConfirmed }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [manualAddress, setManualAddress] = useState('');

  if (!isOpen) return null;

  const handleUseGPS = async () => {
    setLoading(true);
    setError('');
    try {
      const coords = await requestCurrentPosition();
      const geocoded = await reverseGeocode(coords.lat, coords.lng);
      const locObj = {
        lat: coords.lat,
        lng: coords.lng,
        formattedAddress: geocoded.formattedAddress,
        shortAddress: geocoded.shortAddress,
      };
      saveCustomerLocation(locObj);
      if (onLocationConfirmed) onLocationConfirmed(locObj);
      onClose();
    } catch (err) {
      console.warn('GPS request failed:', err);
      if (err.code === 1) {
        setError('Location permission was denied. You can enter your delivery address manually below.');
      } else {
        setError('Could not detect location. Please enter your address manually.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualAddress.trim()) return;
    const locObj = {
      lat: 22.5726, // Default city center fallback (e.g. Kolkata)
      lng: 88.3639,
      formattedAddress: manualAddress.trim(),
      shortAddress: manualAddress.trim().split(',')[0],
      isManual: true,
    };
    saveCustomerLocation(locObj);
    if (onLocationConfirmed) onLocationConfirmed(locObj);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md p-6 relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon & Title */}
        <div className="text-center space-y-3 pt-2">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center mx-auto shadow-lg shadow-amber-500/20">
            <Compass className="w-8 h-8 text-white animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">
              Discover Nearby Restaurants
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
              Enable your location to see restaurants delivering directly to your doorstep and calculate accurate delivery times.
            </p>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/60 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action: Use Current GPS */}
        <div className="mt-6 space-y-3">
          <button
            type="button"
            onClick={handleUseGPS}
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-extrabold text-sm shadow-xl shadow-amber-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Navigation className="w-4 h-4" />
            <span>{loading ? 'Detecting your location...' : 'Allow Location Access'}</span>
          </button>

          <div className="relative flex items-center justify-center my-3">
            <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
            <span className="bg-white dark:bg-slate-900 px-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Or enter manually
            </span>
          </div>

          {/* Action: Manual Address Form */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Enter your street, area, or city"
                value={manualAddress}
                onChange={(e) => setManualAddress(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <button
              type="submit"
              disabled={!manualAddress.trim()}
              className="w-full py-2.5 rounded-2xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold text-xs transition-colors disabled:opacity-50"
            >
              Set Delivery Location
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
