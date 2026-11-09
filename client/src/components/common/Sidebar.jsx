import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  UtensilsCrossed,
  ChefHat,
  ClipboardList,
  BookOpen,
  Grid2X2,
  CalendarDays,
  Boxes,
  BarChart3,
  Receipt,
  Settings,
  ShieldAlert,
  ExternalLink,
  LogOut,
  UserCheck,
  Flame,
  CreditCard,
  Layers,
  Sparkles,
  ShoppingBag,
  Bike
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRestaurant } from '../../context/RestaurantContext';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { user, logout, isSuperAdmin, activeRestaurantId } = useAuth();
  const { restaurant } = useRestaurant();

  const allRoles = ['super_admin', 'restaurant_admin', 'staff', 'waiter', 'cashier'];
  const adminRoles = ['super_admin', 'restaurant_admin'];
  const operationalRoles = ['super_admin', 'restaurant_admin', 'staff', 'waiter', 'cashier'];

  const navSections = [
    {
      title: 'OPERATIONS',
      items: [
        {
          label: 'POS & Waiter Terminal',
          path: '/pos',
          icon: UtensilsCrossed,
          allowed: operationalRoles,
          badge: 'HOT',
          badgeColor: 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border border-amber-500/40'
        },
        {
          label: 'Kitchen Display (KDS)',
          path: '/kitchen',
          icon: ChefHat,
          allowed: ['super_admin', 'restaurant_admin', 'staff', 'kitchen', 'cashier'],
          badge: 'LIVE',
          badgeColor: 'bg-sky-500/20 text-sky-600 dark:text-sky-300 border border-sky-500/40'
        },
        {
          label: 'Floor Tables',
          path: '/tables',
          icon: Grid2X2,
          allowed: operationalRoles
        },
        {
          label: 'Cashier Terminal',
          path: '/cashier',
          icon: Receipt,
          allowed: ['super_admin', 'restaurant_admin', 'cashier', 'staff']
        },
        {
          label: 'Online Orders',
          path: '/online-orders',
          icon: ShoppingBag,
          allowed: operationalRoles,
          badge: 'NEW',
          badgeColor: 'bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 border border-indigo-500/40'
        },
        {
          label: 'Delivery Management',
          path: '/delivery-management',
          icon: Bike,
          allowed: operationalRoles,
          badge: 'GPS',
          badgeColor: 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border border-cyan-500/40'
        },
      ]
    },
    {
      title: 'MANAGEMENT',
      items: [
        {
          label: 'Active & Past Orders',
          path: '/orders',
          icon: ClipboardList,
          allowed: operationalRoles
        },
        {
          label: 'Menu & Dishes',
          path: '/menu-admin',
          icon: BookOpen,
          allowed: adminRoles
        },
        {
          label: 'Inventory & Stock',
          path: '/inventory',
          icon: Boxes,
          allowed: adminRoles
        },
        {
          label: 'Table Bookings',
          path: '/reservations',
          icon: CalendarDays,
          allowed: operationalRoles
        },
      ]
    },
    {
      title: 'ANALYTICS & ADMIN',
      items: [
        {
          label: 'Command Dashboard',
          path: '/dashboard',
          icon: LayoutDashboard,
          allowed: adminRoles
        },
        {
          label: 'Sales Reports & Audit',
          path: '/reports',
          icon: BarChart3,
          allowed: adminRoles
        },
        {
          label: 'Invoices & Receipts',
          path: '/invoices',
          icon: CreditCard,
          allowed: ['super_admin', 'restaurant_admin', 'cashier', 'staff']
        },
        {
          label: 'Restaurant Settings',
          path: '/settings',
          icon: Settings,
          allowed: adminRoles
        },
        {
          label: 'Super Admin Authority',
          path: '/super-admin',
          icon: ShieldAlert,
          allowed: ['super_admin'],
          highlight: true
        }
      ]
    }
  ];

  const isMasterSuperAdmin = user?.email === 'altcafe2026@gmail.com' || user?.role === 'super_admin';
  const userRole = user?.role || 'waiter';

  return (
    <aside
      className={`fixed lg:static top-0 left-0 z-40 h-screen w-64 bg-pos-surface border-r border-pos-border flex flex-col justify-between transition-all duration-200 ease-in-out select-none shadow-sm ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } no-print`}
    >
      {/* Top Branding Header */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="p-4 border-b border-pos-border flex items-center justify-between bg-pos-card/50">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 flex items-center justify-center text-slate-950 font-black text-xl shadow-pos-amber shrink-0">
              🍽️
            </div>
            <div className="truncate">
              <h2 className="font-black text-sm text-slate-900 dark:text-white truncate tracking-tight font-display">
                {restaurant?.name || 'Abar Khabo POS'}
              </h2>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-wider block truncate font-mono">
                  {user?.role?.replace('_', ' ') || 'PORTAL'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 scrollbar-thin">
          {navSections.map((section, sIdx) => {
            const visibleItems = section.items.filter((item) => {
              if (item.path === '/super-admin') return isMasterSuperAdmin;
              if (isMasterSuperAdmin) return true;
              return item.allowed.includes(userRole);
            });

            if (visibleItems.length === 0) return null;

            return (
              <div key={sIdx} className="space-y-1.5">
                <p className="px-3 text-[10px] font-black tracking-widest text-slate-400 dark:text-slate-500 uppercase font-mono">
                  {section.title}
                </p>
                <div className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setIsOpen && setIsOpen(false)}
                        className={({ isActive }) =>
                          `group relative flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all duration-150 ${
                            isActive
                              ? item.highlight
                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-pos-purple font-black'
                                : 'bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 shadow-pos-amber font-black'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-card-hover border border-transparent'
                          }`
                        }
                      >
                        {({ isActive }) => (
                          <>
                            <div className="flex items-center space-x-3 truncate">
                              <Icon className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                                isActive ? 'text-slate-950 stroke-[2.5]' : 'text-slate-500 dark:text-slate-400 group-hover:text-amber-500 stroke-[2]'
                              }`} />
                              <span className="truncate">{item.label}</span>
                            </div>
                            {item.badge && (
                              <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md font-mono shrink-0 ${
                                isActive ? 'bg-slate-950/20 text-slate-950' : item.badgeColor
                              }`}>
                                {item.badge}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Customer-facing links */}
        <div className="p-3 border-t border-pos-border bg-pos-card/30 space-y-2">
          <NavLink
            to="/order"
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-700/50 text-xs text-indigo-700 dark:text-indigo-300 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all font-bold"
          >
            <span className="flex items-center space-x-2 truncate">
              <ShoppingBag className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
              <span>Customer Order Portal</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
          </NavLink>
        </div>
        {/* Public Customer QR Menu Link */}
        <div className="px-3 pb-3 bg-pos-card/30">
          <NavLink
            to={`/menu/${user?.restaurantId || activeRestaurantId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3.5 py-2.5 rounded-2xl bg-pos-card border border-pos-border text-xs text-slate-600 dark:text-slate-300 hover:text-amber-600 dark:hover:text-amber-400 hover:border-amber-500/40 hover:shadow-pos-amber transition-all"
          >
            <span className="flex items-center space-x-2 truncate font-bold">
              <span>📖 QR Digital Menu</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0 text-slate-400" />
          </NavLink>
        </div>
      </div>

      {/* User Profile & Logout */}
      <div className="p-3 border-t border-pos-border bg-pos-card/60">
        <div className="flex items-center justify-between p-1">
          <div className="flex items-center space-x-2.5 truncate pr-2">
            <div className="w-9 h-9 rounded-2xl bg-pos-dark border border-pos-border flex items-center justify-center text-slate-400 text-xs font-bold shrink-0 shadow-inner">
              <UserCheck className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="truncate text-xs">
              <p className="font-black text-slate-900 dark:text-white truncate leading-tight">{user?.name || 'Operator'}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400 truncate capitalize font-mono mt-0.5">
                {user?.role?.replace('_', ' ')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="p-2.5 rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/60 border border-transparent hover:border-rose-300 dark:hover:border-rose-800/60 transition-all pos-btn-touch"
            title="Log Out & Lock Terminal"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
