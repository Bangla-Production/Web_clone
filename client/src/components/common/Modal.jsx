import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  if (!isOpen) return null;

  // Render on <body>: a parent with backdrop-filter/transform would otherwise trap
  // this "fixed" overlay inside itself (it showed behind the page / got clipped).
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm no-print">
      <div
        className={`pos-card-glass rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150 border border-pos-border`}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-pos-border bg-pos-dark/60">
          <h3 className="font-extrabold text-base text-slate-900 dark:text-white font-display tracking-tight">{title}</h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-pos-surface border border-transparent hover:border-pos-border transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body
  );
}
