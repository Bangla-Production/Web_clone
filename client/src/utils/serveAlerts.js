// Helpers for the "kitchen served" alert shown to waiters.

const ADMIN_ROLES = ['restaurant_admin', 'super_admin'];
const ALERT_ROLES = ['waiter', 'staff', 'cashier', ...ADMIN_ROLES];

export const canSeeServeAlerts = (user) => ALERT_ROLES.includes(user?.role);

/**
 * Alerts this user should see, sorted by table number.
 *  - a waiter sees alerts for the orders they took (alerts with no owner are shown to everyone)
 *  - admins see all
 *  - an alert is ignored once the table is vacant again or has a newer order
 */
export function visibleServeAlerts(tables, user) {
  if (!canSeeServeAlerts(user)) return [];
  const isAdmin = ADMIN_ROLES.includes(user.role);

  return (tables || [])
    .filter((t) => {
      const a = t.serveAlert;
      if (!a || !t.activeOrder || t.status === 'AVAILABLE') return false;
      if (a.orderNumber && a.orderNumber !== t.activeOrder.orderNumber) return false;
      return isAdmin || !a.waiterId || a.waiterId === user.uid;
    })
    .map((t) => {
      const info = t.servedInfo && t.servedInfo.orderNumber === t.activeOrder.orderNumber ? t.servedInfo : null;
      return {
        ...t.serveAlert,
        tableId: t.id,
        tableNumber: t.serveAlert.tableNumber || t.tableNumber,
        count: t.serveAlert.count || 1,
        servedKots: info ? info.kots.length : 1,
        totalKots: t.activeOrder.kotCount || 0
      };
    })
    .sort((x, y) => String(x.tableNumber).localeCompare(String(y.tableNumber), undefined, { numeric: true }));
}

const MUTE_KEY = 'serveSoundMuted';

export const isServeSoundMuted = () => {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch (e) {
    return false;
  }
};

export const setServeSoundMuted = (muted) => {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch (e) {
    /* ignore */
  }
};
