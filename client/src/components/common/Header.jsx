import React, { useState, useEffect } from 'react';
import { Menu, Clock, Building, Maximize2, Minimize2, Sparkles, Wifi, ShieldCheck, User, Utensils, Sun, Moon, LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRestaurant } from '../../context/RestaurantContext';
import { useTheme } from '../../context/ThemeContext';
import { getAllRestaurants } from '../../services/firestoreService';

export default function Header({ setIsSidebarOpen }) {
  const { user, isSuperAdmin, activeRestaurantId, selectActiveRestaurant, logout } = useAuth();
  const { restaurant } = useRestaurant();
  const { theme, isDark, toggleTheme } = useTheme();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [allRests, setAllRests] = useState([]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      getAllRestaurants().then(list => setAllRests(list || [])).catch(() => {});
    }
  }, [isSuperAdmin]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  return (
    <header className="h-16 bg-pos-surface/95 border-b border-pos-border backdrop-blur-xl flex items-center justify-between px-4 lg:px-6 shrink-0 no-print z-30 select-none shadow-sm transition-colors">
      {/* Left: Mobile Menu & Restaurant / Super Admin Switch */}
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="lg:hidden p-2.5 rounded-xl text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-pos-border transition-colors pos-btn-touch"
          title="Open Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {isSuperAdmin && allRests.length > 0 ? (
          <div className="flex items-center space-x-2.5 bg-purple-500/10 dark:bg-purple-950/60 border border-purple-500/40 dark:border-purple-600/70 px-3.5 py-1.5 rounded-2xl shadow-inner">
            <span className="text-[10px] text-purple-600 dark:text-purple-300 font-black uppercase tracking-wider hidden sm:inline">Active Branch:</span>
            <select
              value={activeRestaurantId || ''}
              onChange={(e) => selectActiveRestaurant(e.target.value)}
              className="px-2.5 py-1 bg-white dark:bg-slate-950 border border-purple-500 rounded-xl text-xs font-black text-purple-900 dark:text-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {allRests.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 flex items-center justify-center text-slate-950 font-black text-sm shadow-pos-amber">
              {restaurant?.name ? restaurant.name.substring(0, 1).toUpperCase() : '🍽️'}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs sm:text-sm font-black tracking-tight text-slate-900 dark:text-white truncate max-w-[160px] sm:max-w-xs font-display">
                  {restaurant?.name || 'RestoPulse POS'}
                </span>
                <span className="hidden md:inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 font-mono">
                  Station 01 • Main
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden sm:block font-medium">
                {restaurant?.city || 'Petpooja Multi-Terminal Cloud Live'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Right: Theme Toggle, Digital Clock, Status, Fullscreen */}
      <div className="flex items-center space-x-2 sm:space-x-3">
        {/* Sexy White / Dark Mode Toggle Pill */}
        <button
          onClick={toggleTheme}
          className="pos-btn-touch flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-pos-card border border-pos-border hover:border-amber-400 transition-all text-xs font-black shadow-sm"
          title={isDark ? 'Switch to White Mood' : 'Switch to Dark Mood'}
        >
          {isDark ? (
            <>
              <Sun className="w-4 h-4 text-amber-400 fill-amber-400 animate-spin-slow" />
              <span className="text-slate-200 hidden md:inline text-[11px] font-bold">White Mood</span>
            </>
          ) : (
            <>
              <Moon className="w-4 h-4 text-indigo-600 fill-indigo-600" />
              <span className="text-slate-800 hidden md:inline text-[11px] font-bold">Dark Mood</span>
            </>
          )}
        </button>

        {/* Live POS Clock */}
        <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-2xl bg-pos-card border border-pos-border text-xs font-mono shadow-inner">
          <Clock className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 animate-pulse-subtle" />
          <span className="text-slate-900 dark:text-white font-black tabular-nums">
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
          <span className="hidden md:inline text-slate-300 dark:text-slate-600 font-sans text-[11px]">|</span>
          <span className="hidden md:inline text-slate-500 dark:text-slate-400 font-sans text-[11px] font-semibold">
            {currentTime.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Live Cloud Status */}
        <div className="hidden sm:flex items-center space-x-2 px-3.5 py-1.5 rounded-2xl bg-pos-card border border-pos-border text-xs shadow-inner">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
          </span>
          <span className="text-emerald-600 dark:text-emerald-400 text-[11px] font-bold">Cloud Live</span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-amber-600 dark:text-amber-400 font-black font-mono text-[11px]">
            {restaurant?.currencySymbol || '₹'} {restaurant?.currency || 'INR'}
          </span>
        </div>

        {/* Fullscreen Toggle */}
        <button
          onClick={toggleFullscreen}
          className="p-2.5 rounded-2xl bg-pos-card hover:bg-pos-card-hover text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-pos-border transition-colors shadow-inner pos-btn-touch"
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter POS Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        {/* Staff Logout Button */}
        <button
          onClick={async () => {
            if (window.confirm('Are you sure you want to log out of your staff session?')) {
              await logout();
              window.location.href = '/login';
            }
          }}
          className="pos-btn-touch flex items-center space-x-1.5 px-3 py-1.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/60 hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all text-xs font-black shadow-sm"
          title="Log Out Staff Session"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
