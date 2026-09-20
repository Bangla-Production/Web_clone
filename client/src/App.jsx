import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
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
import CashierPage from './pages/CashierPage';
import SettingsPage from './pages/SettingsPage';
import PublicMenuPage from './pages/PublicMenuPage';
import ReservationsPage from './pages/ReservationsPage';
import SuperAdminPage from './pages/SuperAdminPage';

// Root redirect handler
function RootRedirect() {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-amber-400">
        <div className="w-8 h-8 border-3 border-amber-500/30 border-t-amber-400 rounded-full animate-spin"></div>
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

  if (role === 'cashier') {
    return <Navigate to="/cashier" replace />;
  }

  // Waiters (and any other operational staff) go straight to the POS/Waiter Terminal
  return <Navigate to="/pos" replace />;
}

export default function App() {
  const allRoles = ['super_admin', 'restaurant_admin', 'owner', 'staff', 'waiter', 'cashier', 'kitchen'];
  const operationalRoles = ['super_admin', 'restaurant_admin', 'owner', 'staff', 'waiter', 'cashier'];
  const cashierAndAdmin = ['super_admin', 'restaurant_admin', 'owner', 'cashier', 'staff'];
  const adminOnly = ['super_admin', 'restaurant_admin', 'owner'];

  return (
    <ThemeProvider>
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

                {/* Super Admin: platform management only (standalone page, no restaurant screens) */}
                <Route element={<ProtectedRoute allowedRoles={['super_admin']} />}>
                  <Route path="/super-admin" element={<SuperAdminPage />} />
                </Route>

                {/* Protected Staff & Restaurant Admin Area */}
                <Route element={<ProtectedRoute allowedRoles={allRoles} />}>
                  <Route element={<AppLayout />}>

                    {/* Kitchen Display (All authorized roles) */}
                    <Route path="/kitchen" element={<KitchenPage />} />

                    {/* POS & Table Floor (Waiters, Cashiers, Admins) */}
                    <Route element={<ProtectedRoute allowedRoles={operationalRoles} />}>
                      <Route path="/pos" element={<POSPage />} />
                      <Route path="/tables" element={<TablesPage />} />
                      <Route path="/orders" element={<OrdersPage />} />
                      <Route path="/reservations" element={<ReservationsPage />} />
                    </Route>

                    {/* Invoices, Billing & Cashier Terminal */}
                    <Route element={<ProtectedRoute allowedRoles={cashierAndAdmin} />}>
                      <Route path="/cashier" element={<CashierPage />} />
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
    </ThemeProvider>
  );
}
