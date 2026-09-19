import React, { useState, useEffect } from 'react';
import { Menu, Clock, Building, ChevronDown, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useRestaurant } from '../../context/RestaurantContext';
import { getAllRestaurants } from '../../services/firestoreService';

export default function Header({ setIsSidebarOpen }) {
  const { user, isSuperAdmin, activeRestaurantId, selectActiveRestaurant } = useAuth();
  const { restaurant } = useRestaurant();
  const [currentTime, setCurrentTime] = useState(new Date());
  const [allRests, setAllRests] = useState([]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      getAllRestaurants().then(list => setAllRests(list)).catch(() => {});
    }
  }, [isSuperAdmin]);

  return (
    <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 lg:px-6 shrink-0 no-print">
      <div className="flex items-center space-x-3">
        <button
          onClick={() => setIsSidebarOpen((prev) => !prev)}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <Menu className="w-6 h-6" />
        </button>

        {isSuperAdmin && allRests.length > 0 ? (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-purple-400 font-bold uppercase hidden sm:inline">Active Restaurant:</span>
            <select
              value={activeRestaurantId || ''}
              onChange={(e) => selectActiveRestaurant(e.target.value)}
              className="px-2.5 py-1 bg-slate-950 border border-purple-800/80 rounded-lg text-xs font-semibold text-purple-200 focus:outline-none"
            >
              {allRests.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name} ({r.id})
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              {restaurant?.name}
            </span>
            <div className="flex items-center space-x-2 text-[11px] text-slate-400">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>
                {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-3">
        <div className="hidden sm:flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-slate-300 font-medium">Cloud Firebase Online</span>
          <span className="text-slate-500">|</span>
          <span className="text-emerald-400 font-semibold">{restaurant?.currencySymbol || '₹'} {restaurant?.currency || 'INR'}</span>
        </div>
      </div>
    </header>
  );
}
