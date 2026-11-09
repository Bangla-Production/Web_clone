import React, { useState } from 'react';
import {
  MapPin,
  Navigation,
  Store,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Compass,
  Clock,
  RotateCcw,
} from 'lucide-react';
import {
  requestCurrentPosition,
  reverseGeocode,
  calculateDistanceKm,
  saveCustomerLocation,
} from '../../services/locationService';

export default function CheckoutLocationSection({
  orderType, // 'DELIVERY' | 'TAKEAWAY'
  restaurant,
  deliveryAddress,
  onAddressChange,
  customerLoc,
  onLocationDetected,
  deliveryEstimate,
}) {
  const [detecting, setDetecting] = useState(false);
  const [detectError, setDetectError] = useState('');
  const [takeawayConfirmed, setTakeawayConfirmed] = useState(true);

  // Restaurant coordinates
  const rLat = restaurant?.coordinates?.lat ?? restaurant?.lat ?? 22.5726;
  const rLng = restaurant?.coordinates?.lng ?? restaurant?.lng ?? 88.3639;

  // Handle "Detect My Current Location" button click
  const handleDetectGPS = async () => {
    setDetecting(true);
    setDetectError('');
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
      onAddressChange(geocoded.formattedAddress);
      if (onLocationDetected) onLocationDetected(locObj);
    } catch (err) {
      console.warn('GPS detection failed:', err);
      if (err.code === 1) {
        setDetectError('Location access denied. Please type your delivery address manually below.');
      } else {
        setDetectError('Could not detect location. Please type your address manually below.');
      }
    } finally {
      setDetecting(false);
    }
  };

  if (orderType === 'TAKEAWAY') {
    const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      restaurant?.address || `${rLat},${rLng}`
    )}`;

    return (
      <div className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700/80 space-y-3 text-xs">
        <div className="flex items-center justify-between text-teal-400 font-bold">
          <span className="flex items-center gap-1.5">
            <Store className="w-4 h-4 text-teal-400" />
            <span>Self-Pickup at Restaurant</span>
          </span>
          <span className="px-2 py-0.5 rounded-full bg-teal-950/60 text-teal-300 text-[10px] font-bold border border-teal-800">
            No Delivery Fee (₹0)
          </span>
        </div>

        {/* Restaurant Pickup Location Card */}
        <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1.5">
          <p className="font-extrabold text-sm text-white">{restaurant?.name || 'Restaurant'}</p>
          <p className="text-slate-300 flex items-start gap-1 leading-snug">
            <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <span>{restaurant?.address || 'Pickup address provided upon order confirmation.'}</span>
          </p>
          {restaurant?.openHours && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-1">
              <Clock className="w-3 h-3" /> Pickup Hours: {restaurant.openHours}
            </p>
          )}
        </div>

        {/* Optional Distance & Directions */}
        <div className="flex items-center justify-between pt-1 text-[11px]">
          <button
            type="button"
            onClick={handleDetectGPS}
            disabled={detecting}
            className="text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 underline"
          >
            <Navigation className="w-3 h-3" />
            {detecting ? 'Calculating distance...' : 'Calculate distance from my location'}
          </button>

          <a
            href={mapsDirectionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
          >
            <ExternalLink className="w-3 h-3" /> Open in Maps
          </a>
        </div>

        {customerLoc?.lat && (
          <p className="text-[11px] text-emerald-400 font-medium">
            Distance to restaurant: {calculateDistanceKm(customerLoc.lat, customerLoc.lng, rLat, rLng).toFixed(1)} km
          </p>
        )}

        <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={takeawayConfirmed}
            onChange={(e) => setTakeawayConfirmed(e.target.checked)}
            className="w-4 h-4 rounded text-teal-500 focus:ring-0 bg-slate-900 border-slate-700"
          />
          <span className="text-slate-300 font-medium text-[11px]">
            I will collect the food directly from the restaurant counter.
          </span>
        </label>
      </div>
    );
  }

  // DELIVERY TYPE
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block font-bold text-slate-300 text-xs">
          Delivery Address *
        </label>
        <button
          type="button"
          onClick={handleDetectGPS}
          disabled={detecting}
          className="px-2.5 py-1 rounded-lg bg-cyan-600/30 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
        >
          <Navigation className={`w-3 h-3 ${detecting ? 'animate-spin' : ''}`} />
          {detecting ? 'Detecting GPS...' : 'Detect My Current Location'}
        </button>
      </div>

      {detectError && (
        <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-800 text-amber-300 text-[11px] flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{detectError}</span>
        </div>
      )}

      {/* Manual / Auto-filled Address Input */}
      <textarea
        required
        rows={2}
        value={deliveryAddress}
        onChange={(e) => onAddressChange(e.target.value)}
        placeholder="Flat / House no., Building, Street, Landmark *"
        className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-white text-xs focus:outline-none focus:border-cyan-500"
      />

      {/* Delivery Distance & Serviceability Feedback */}
      {deliveryEstimate && (
        deliveryEstimate.isServiceable ? (
          <div className="p-2.5 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-between text-[11px]">
            <span className="text-slate-300">
              Est. Distance: <strong className="text-white">{deliveryEstimate.distanceKm} km</strong> · ~{deliveryEstimate.estimatedTimeMins} mins
            </span>
            <span className="text-emerald-400 font-bold">
              {deliveryEstimate.isFree ? 'FREE Delivery' : `₹${deliveryEstimate.fee} fee`}
            </span>
          </div>
        ) : (
          <div className="p-2.5 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-[11px] space-y-0.5">
            <p className="font-bold">Outside Service Area</p>
            <p className="text-rose-400 text-[10px]">
              Distance ({deliveryEstimate.distanceKm} km) exceeds delivery radius ({deliveryEstimate.maxRadius} km). Please switch to Takeaway.
            </p>
          </div>
        )
      )}
    </div>
  );
}
