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
  Printer
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRestaurant } from '../../context/RestaurantContext';

export default function Sidebar({ isOpen, setIsOpen }) {
  const { user, logout, isSuperAdmin, activeRestaurantId } = useAuth();
  const { restaurant } = useRestaurant();

  const allRoles = ['super_admin', 'restaurant_admin', 'staff', 'waiter', 'cashier'];
  const adminRoles = ['super_admin', 'restaurant_admin'];
  const operationalRoles = ['super_admin', 'restaurant_admin', 'staff', 'waiter', 'cashier'];

  const navItems = [
    {
      label: 'Super Admin',
      path: '/super-admin',
      icon: ShieldAlert,
      allowed: ['super_admin'],
      highlight: true
    },
    {
      label: 'Dashboard',
      path: '/dashboard',
      icon: LayoutDashboard,
      allowed: adminRoles
    },
    {
      label: 'POS & Waiter Terminal',
      path: '/pos',
      icon: UtensilsCrossed,
      allowed: operationalRoles
    },
    {
      label: 'Kitchen (KDS)',
      path: '/kitchen',
      icon: ChefHat,
      allowed: ['super_admin', 'restaurant_admin', 'staff', 'waiter', 'kitchen', 'cashier']
    },
    {
      label: 'Orders',
      path: '/orders',
      icon: ClipboardList,
      allowed: operationalRoles
    },
    {
      label: 'Menu Management',
      path: '/menu-admin',
      icon: BookOpen,
      allowed: adminRoles
    },
    {
      label: 'Floor Tables',
      path: '/tables',
      icon: Grid2X2,
      allowed: operationalRoles
    },
    {
      label: 'Reservations',
      path: '/reservations',
      icon: CalendarDays,
      allowed: operationalRoles
    },
    {
      label: 'Inventory',
      path: '/inventory',
      icon: Boxes,
      allowed: adminRoles
    },
    {
      label: 'Sales Reports',
      path: '/reports',
      icon: BarChart3,
      allowed: adminRoles
    },
    {
      label: 'Cashier Terminal',
      path: '/cashier',
      icon: Receipt,
      allowed: ['super_admin', 'restaurant_admin', 'cashier', 'staff']
    },
    {
      label: 'Invoices & Receipts',
      path: '/invoices',
      icon: ClipboardList,
      allowed: ['super_admin', 'restaurant_admin', 'cashier', 'staff']
    },
    {
      label: 'Settings',
      path: '/settings',
      icon: Settings,
      allowed: adminRoles
    }
  ];

  const isMasterSuperAdmin = user?.email === 'altcafe2026@gmail.com' || user?.role === 'super_admin';
  const userRole = user?.role || 'waiter';

  const filteredNav = navItems.filter((item) => {
    if (item.path === '/super-admin') {
      return isMasterSuperAdmin;
    }
    if (isMasterSuperAdmin) {
      return true;
    }
    return item.allowed.includes(userRole);
  });

  return (
    <aside
      className={`fixed lg:static top-0 left-0 z-40 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col justify-between transition-transform duration-200 ease-in-out ${
        isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      } no-print`}
    >
      {/* Top Branding */}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
              🍽️
            </div>
            <div className="truncate">
              <h2 className="font-bold text-sm text-white truncate">
                {restaurant?.name || 'RestoPulse'}
              </h2>
              <span className="text-[10px] text-slate-400 block truncate">
                {user?.role?.toUpperCase() || 'PORTAL'}
              </span>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1 scrollbar-thin">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setIsOpen && setIsOpen(false)}
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? item.highlight
                        ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                        : 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </div>

        {/* Public Menu link button */}
        <div className="p-3 border-t border-slate-800">
          <NavLink
            to={`/menu/${user?.restaurantId || activeRestaurantId}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 hover:text-emerald-400 hover:border-emerald-500/40 transition-colors"
          >
            <span className="flex items-center space-x-2 truncate">
              <span>📖 Public Menu</span>
            </span>
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
          </NavLink>
        </div>
      </div>

      {/* User Footer Profile & Logout */}
      <div className="p-3 border-t border-slate-800 bg-slate-950/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 truncate pr-2">
            <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold shrink-0">
              <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="truncate text-xs">
              <p className="font-semibold text-white truncate">{user?.name || 'User'}</p>
              <p className="text-[10px] text-slate-400 truncate">{user?.role}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 transition-colors"
            title="Log Out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
