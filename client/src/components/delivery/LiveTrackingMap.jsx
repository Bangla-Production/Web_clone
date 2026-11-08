import React, { useEffect, useRef, useState } from 'react';
import { Navigation, Bike, MapPin, Store, ExternalLink, Compass } from 'lucide-react';
import { loadGoogleMaps, getGoogleRoute } from '../../services/mapsService';
import { calculateDistanceKm } from '../../services/locationService';

export default function LiveTrackingMap({
  restaurantCoords,
  customerCoords,
  riderCoords,
  status = 'OUT_FOR_DELIVERY',
  restaurantName = 'Restaurant',
  customerAddress = 'Customer Location',
  className = 'h-80 w-full rounded-2xl',
}) {
  const mapRef = useRef(null);
  const [googleMapLoaded, setGoogleMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);
  const markersRef = useRef({ restaurant: null, customer: null, rider: null, polyline: null });

  const rLat = restaurantCoords?.lat || 22.5726;
  const rLng = restaurantCoords?.lng || 88.3639;
  const cLat = customerCoords?.lat || 22.5850;
  const cLng = customerCoords?.lng || 88.3750;
  const riderLat = riderCoords?.lat || (rLat + cLat) / 2;
  const riderLng = riderCoords?.lng || (rLng + cLng) / 2;

  // Calculate live straight-line distance from rider to customer
  const remainingDistKm = calculateDistanceKm(riderLat, riderLng, cLat, cLng);
  const estMinsRemaining = Math.max(2, Math.round(remainingDistKm * 3.5));

  // Try loading Google Maps if API key exists
  useEffect(() => {
    let isMounted = true;
    loadGoogleMaps()
      .then((maps) => {
        if (!isMounted || !mapRef.current) return;
        setGoogleMapLoaded(true);

        const center = { lat: riderLat, lng: riderLng };
        const map = new maps.Map(mapRef.current, {
          center,
          zoom: 14,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          styles: [
            { featureType: 'poi', stylers: [{ visibility: 'off' }] },
            { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
          ],
        });
        setMapInstance(map);

        // Restaurant Marker
        markersRef.current.restaurant = new maps.Marker({
          position: { lat: rLat, lng: rLng },
          map,
          title: restaurantName,
          icon: {
            url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
          },
        });

        // Customer Marker
        markersRef.current.customer = new maps.Marker({
          position: { lat: cLat, lng: cLng },
          map,
          title: 'Delivery Address',
          icon: {
            url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          },
        });

        // Rider Marker
        markersRef.current.rider = new maps.Marker({
          position: { lat: riderLat, lng: riderLng },
          map,
          title: 'Delivery Partner',
          icon: {
            url: 'https://maps.google.com/mapfiles/ms/icons/blue-dot.png',
          },
        });

        // Fit bounds
        const bounds = new maps.LatLngBounds();
        bounds.extend({ lat: rLat, lng: rLng });
        bounds.extend({ lat: cLat, lng: cLng });
        bounds.extend({ lat: riderLat, lng: riderLng });
        map.fitBounds(bounds);
      })
      .catch((err) => {
        console.info('Google Maps API not available, falling back to Interactive Live Map Radar:', err.message);
        setGoogleMapLoaded(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Update Rider position smoothly on live GPS ticks
  useEffect(() => {
    if (mapInstance && markersRef.current.rider && window.google?.maps) {
      const newPos = new window.google.maps.LatLng(riderLat, riderLng);
      markersRef.current.rider.setPosition(newPos);
    }
  }, [riderLat, riderLng, mapInstance]);

  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${rLat},${rLng}&destination=${cLat},${cLng}&travelmode=two_wheeler`;

  return (
    <div className={`relative overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 ${className}`}>
      {googleMapLoaded ? (
        <div ref={mapRef} className="w-full h-full" />
      ) : (
        /* Fallback High-Fidelity Vector Live Radar Map */
        <div className="relative w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex flex-col justify-between p-4 overflow-hidden select-none">
          {/* Subtle Grid Background */}
          <div className="absolute inset-0 opacity-15 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]" />

          {/* Radar Circles */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-72 h-72 rounded-full border border-cyan-500/10 animate-ping" />
            <div className="w-56 h-56 rounded-full border border-cyan-500/20" />
            <div className="w-36 h-36 rounded-full border border-cyan-500/30" />
          </div>

          {/* Top Info Pill */}
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-slate-700/80 text-white shadow-lg text-xs">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-bold">Live GPS Tracking</span>
              <span className="text-slate-400">·</span>
              <span className="text-cyan-400 font-semibold">{remainingDistKm.toFixed(1)} km left</span>
            </div>

            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold shadow-md transition-all"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Open in Maps</span>
            </a>
          </div>

          {/* Center Visual Map Simulation */}
          <div className="relative z-10 my-auto flex items-center justify-between px-6 py-4">
            {/* Restaurant Node */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border-2 border-amber-400 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
                <Store className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-white max-w-[90px] text-center truncate">{restaurantName}</span>
              <span className="text-[9px] text-amber-400 uppercase font-semibold">Pickup</span>
            </div>

            {/* Path & Moving Rider */}
            <div className="relative flex-1 mx-4 flex items-center">
              <div className="w-full h-1.5 bg-slate-700/80 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-400 via-cyan-400 to-emerald-400 transition-all duration-700"
                  style={{
                    width: status === 'DELIVERED' ? '100%' : status === 'OUT_FOR_DELIVERY' ? '65%' : status === 'PICKED_UP' ? '40%' : '15%',
                  }}
                />
              </div>

              {/* Animated Rider Icon */}
              <div
                className="absolute -top-4 -translate-x-1/2 p-2 rounded-full bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/40 border-2 border-white transition-all duration-700 animate-bounce"
                style={{
                  left: status === 'DELIVERED' ? '95%' : status === 'OUT_FOR_DELIVERY' ? '65%' : status === 'PICKED_UP' ? '40%' : '15%',
                }}
              >
                <Bike className="w-4 h-4" />
              </div>
            </div>

            {/* Customer Node */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 border-2 border-emerald-400 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                <MapPin className="w-6 h-6" />
              </div>
              <span className="text-[11px] font-bold text-white max-w-[90px] text-center truncate">You</span>
              <span className="text-[9px] text-emerald-400 uppercase font-semibold">Delivery</span>
            </div>
          </div>

          {/* Bottom Bar: Estimated Arrival Time & Speed */}
          <div className="relative z-10 flex items-center justify-between p-3 rounded-xl bg-slate-900/90 backdrop-blur border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                <Compass className="w-4 h-4 animate-spin" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Estimated Delivery Time</p>
                <p className="font-extrabold text-white text-sm">~{estMinsRemaining} mins away</p>
              </div>
            </div>

            {riderCoords?.speed && (
              <div className="text-right">
                <p className="text-[10px] text-slate-400">Rider Speed</p>
                <p className="font-mono font-bold text-cyan-400">{riderCoords.speed} km/h</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
