import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-pos-dark text-slate-800 dark:text-slate-100 selection:bg-amber-500 selection:text-slate-950 transition-colors duration-200">
      {/* Sidebar Navigation */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Backdrop for mobile */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden bg-pos-dark transition-colors duration-200">
        <Header setIsSidebarOpen={setIsSidebarOpen} />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 relative scrollbar-thin">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
