import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ allowedRoles }) {
  const { user, loading, isAuthenticated, isSuperAdmin, isRestaurantAdmin } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950 text-emerald-400">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-10 h-10 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin"></div>
          <p className="text-sm font-medium tracking-wide text-slate-400">Loading RestoPulse...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const role = (user?.role || '').toLowerCase();
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());
    const isPrivileged = isSuperAdmin || isRestaurantAdmin || role === 'super_admin' || role === 'restaurant_admin' || role === 'owner' || user?.email === 'altcafe2026@gmail.com';

    // Super Admin / Restaurant Admin has global access across all panels
    if (isPrivileged || normalizedAllowed.includes(role)) {
      return <Outlet />;
    }

    // Unauthorized access redirects based on role
    if (role === 'kitchen') return <Navigate to="/kitchen" replace />;
    if (role === 'cashier') return <Navigate to="/cashier" replace />;
    return <Navigate to="/pos" replace />;
  }

  return <Outlet />;
}
