import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RestaurantProvider } from './context/RestaurantContext';

import AppLayout from './components/common/AppLayout';
import ProtectedRoute from './components/common/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import POSPage from './pages/POSPage';
import KitchenPage from './pages/KitchenPage';
import OrdersPage from './pages/OrdersPage';
import MenuAdminPage from './pages/MenuAdminPage';
import TablesPage from './pages/TablesPage';
import InventoryPage from './pages/InventoryPage';
import ReportsPage from './pages/ReportsPage';
import InvoicesPage from './pages/InvoicesPage';
import SettingsPage from './pages/SettingsPage';
import PublicMenuPage from './pages/PublicMenuPage';
import ReservationsPage from './pages/ReservationsPage';
import SuperAdminPage from './pages/SuperAdminPage';

// Root redirect handler
function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-emerald-400">
        <div className="w-8 h-8 border-3 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  const role = (user?.role || '').toLowerCase();
  const email = (user?.email || '').toLowerCase().trim();

  // Super Admin goes straight to /super-admin
  if (email === 'altcafe2026@gmail.com' || role === 'super_admin') {
    return <Navigate to="/super-admin" replace />;
  }

  // Restaurant Admin goes to /dashboard
  if (role === 'restaurant_admin' || role === 'owner') {
    return <Navigate to="/dashboard" replace />;
  }

  if (role === 'kitchen') {
    return <Navigate to="/kitchen" replace />;
  }

  // All other staff/cashier/waiter go straight to POS Terminal
  return <Navigate to="/pos" replace />;
}

export default function App() {
  const allRoles = ['super_admin', 'restaurant_admin', 'owner', 'staff', 'waiter', 'cashier', 'kitchen'];
  const operationalRoles = ['super_admin', 'restaurant_admin', 'owner', 'staff', 'waiter', 'cashier'];
  const cashierAndAdmin = ['super_admin', 'restaurant_admin', 'owner', 'cashier', 'staff'];
  const adminOnly = ['super_admin', 'restaurant_admin', 'owner'];

  return (
    <ToastProvider>
      <AuthProvider>
        <RestaurantProvider>
          <BrowserRouter>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/menu" element={<PublicMenuPage />} />
              <Route path="/menu/:restaurantId" element={<PublicMenuPage />} />

              {/* Root Redirect */}
              <Route path="/" element={<RootRedirect />} />

              {/* Protected Staff, Restaurant Admin & Super Admin Area */}
              <Route element={<ProtectedRoute allowedRoles={allRoles} />}>
                <Route element={<AppLayout />}>
                  {/* Super Admin Platform Management */}
                  <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
                    <Route path="/super-admin" element={<SuperAdminPage />} />
                  </Route>

                  {/* Kitchen Display (All authorized roles) */}
                  <Route path="/kitchen" element={<KitchenPage />} />

                  {/* POS & Table Floor (Waiters, Cashiers, Admins) */}
                  <Route element={<ProtectedRoute allowedRoles={operationalRoles} />}>
                    <Route path="/pos" element={<POSPage />} />
                    <Route path="/tables" element={<TablesPage />} />
                    <Route path="/orders" element={<OrdersPage />} />
                    <Route path="/reservations" element={<ReservationsPage />} />
                  </Route>

                  {/* Invoices & Billing */}
                  <Route element={<ProtectedRoute allowedRoles={cashierAndAdmin} />}>
                    <Route path="/invoices" element={<InvoicesPage />} />
                  </Route>

                  {/* Menu, Inventory & Analytics Admin routes */}
                  <Route element={<ProtectedRoute allowedRoles={adminOnly} />}>
                    <Route path="/dashboard" element={<DashboardPage />} />
                    <Route path="/menu-admin" element={<MenuAdminPage />} />
                    <Route path="/inventory" element={<InventoryPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Route>
                </Route>
              </Route>

              {/* Fallback 404 */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </RestaurantProvider>
      </AuthProvider>
    </ToastProvider>
  );
}
