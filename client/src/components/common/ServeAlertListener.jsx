import { useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { subscribeToTables } from '../../services/firestoreService';
import { serveAudio } from '../../services/thermalPrintService';
import { canSeeServeAlerts, visibleServeAlerts, isServeSoundMuted } from '../../utils/serveAlerts';

/**
 * Lives in the app layout, so the waiter hears the "kitchen served" chime and
 * gets a toast on ANY page (POS, Orders, Floor Tables ...). Renders nothing.
 */
export default function ServeAlertListener() {
  const { user, activeRestaurantId } = useAuth();
  const toast = useToast();
  const seenRef = useRef(null); // null until the first snapshot has been read

  // Browsers block sound until the first tap/click - unlock it once.
  useEffect(() => {
    const unlock = () => serveAudio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  useEffect(() => {
    if (!activeRestaurantId || !canSeeServeAlerts(user)) return undefined;
    seenRef.current = null;

    const unsubscribe = subscribeToTables(activeRestaurantId, (tables) => {
      const alerts = visibleServeAlerts(tables, user);

      // First snapshot = alerts that were already waiting: show them, don't beep for them.
      if (seenRef.current === null) {
        seenRef.current = new Set(alerts.map((a) => a.alertId));
        return;
      }

      const fresh = alerts.filter((a) => !seenRef.current.has(a.alertId));
      if (fresh.length === 0) return;
      fresh.forEach((a) => seenRef.current.add(a.alertId));

      if (!isServeSoundMuted()) serveAudio.playServedChime();
      toast.info(`Kitchen served: Table ${fresh.map((a) => a.tableNumber).join(', ')}`);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRestaurantId, user?.uid, user?.role]);

  return null;
}
