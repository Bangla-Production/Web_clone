import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function ProtectedRoute({ allowedRoles, blockSuperAdmin = false }) {
  const { user, loading, isAuthenticated } = useAuth();

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

  // Super Admin only manages the platform (/super-admin) — never restaurant screens.
  if (blockSuperAdmin) {
    const r = (user?.role || '').toLowerCase();
    const e = (user?.email || '').toLowerCase().trim();
    if (r === 'super_admin' || e === 'altcafe2026@gmail.com') {
      return <Navigate to="/super-admin" replace />;
    }
  }

  if (allowedRoles) {
    const role = (user?.role || '').toLowerCase();
    const userEmail = (user?.email || '').toLowerCase().trim();
    const normalizedAllowed = allowedRoles.map(r => r.toLowerCase());

    const isSuperAdminUser = userEmail === 'altcafe2026@gmail.com' || role === 'super_admin';
    const isSuperAdminRoute = normalizedAllowed.length === 1 && normalizedAllowed[0] === 'super_admin';

    // Super Admin Route (/super-admin): Strictly only for altcafe2026@gmail.com / super_admin
    if (isSuperAdminRoute) {
      if (!isSuperAdminUser) {
        if (role === 'kitchen') return <Navigate to="/kitchen" replace />;
        if (role === 'restaurant_admin') return <Navigate to="/dashboard" replace />;
        return <Navigate to="/pos" replace />;
      }
      return <Outlet />;
    }

    // Role check for other routes: Super Admin has global access, or user must match allowedRoles
    if (isSuperAdminUser || normalizedAllowed.includes(role)) {
      return <Outlet />;
    }

    // Unauthorized access redirect
    if (role === 'kitchen') return <Navigate to="/kitchen" replace />;
    if (role === 'restaurant_admin') return <Navigate to="/dashboard" replace />;
    return <Navigate to="/pos" replace />;
  }

  return <Outlet />;
}
