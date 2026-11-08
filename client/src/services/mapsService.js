let googleMapsPromise = null;

/**
 * Loads Google Maps JavaScript SDK dynamically
 */
export function loadGoogleMaps(apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY) {
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google.maps);
  }

  if (googleMapsPromise) {
    return googleMapsPromise;
  }

  if (!apiKey) {
    return Promise.reject(new Error('VITE_GOOGLE_MAPS_API_KEY not configured'));
  }

  googleMapsPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.google && window.google.maps) {
        resolve(window.google.maps);
      } else {
        reject(new Error('Google Maps script loaded but window.google.maps is undefined'));
      }
    };
    script.onerror = (err) => reject(err);
    document.head.appendChild(script);
  });

  return googleMapsPromise;
}

/**
 * Computes road directions between two lat/lng coordinates using Google DirectionsService
 */
export async function getGoogleRoute(origin, destination) {
  try {
    const maps = await loadGoogleMaps();
    const directionsService = new maps.DirectionsService();

    return new Promise((resolve, reject) => {
      directionsService.route(
        {
          origin: new maps.LatLng(origin.lat, origin.lng),
          destination: new maps.LatLng(destination.lat, destination.lng),
          travelMode: maps.TravelMode.TWO_WHEELER, // Optimal for delivery bikes/scooters
        },
        (result, status) => {
          if (status === maps.DirectionsStatus.OK) {
            const leg = result.routes[0].legs[0];
            resolve({
              distanceText: leg.distance.text,
              distanceValue: leg.distance.value, // meters
              durationText: leg.duration.text,
              durationValue: leg.duration.value, // seconds
              polyline: result.routes[0].overview_polyline,
              raw: result,
            });
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        }
      );
    });
  } catch (err) {
    console.warn('getGoogleRoute fallback:', err.message);
    return null;
  }
}
