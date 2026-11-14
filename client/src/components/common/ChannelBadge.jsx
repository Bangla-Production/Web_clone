import React from 'react';

/**
 * Abar Khabo: Unified Channel Badge Component
 * Displays standardized visual branding per order source:
 * - ABAR KHABO — Emerald
 * - SWIGGY — Orange
 * - ZOMATO — Red
 * - POS — Blue
 * - TAKEAWAY — Neutral
 */
export const CHANNEL_CONFIGS = {
  ABAR_KHABO: {
    label: 'Abar Khabo',
    shortLabel: 'Direct',
    bg: 'bg-emerald-500/15',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-500/30',
    dot: 'bg-emerald-500'
  },
  SWIGGY: {
    label: 'Swiggy',
    shortLabel: 'Swiggy',
    bg: 'bg-orange-500/15',
    text: 'text-orange-700 dark:text-orange-300',
    border: 'border-orange-500/30',
    dot: 'bg-orange-500'
  },
  ZOMATO: {
    label: 'Zomato',
    shortLabel: 'Zomato',
    bg: 'bg-red-500/15',
    text: 'text-red-700 dark:text-red-300',
    border: 'border-red-500/30',
    dot: 'bg-red-500'
  },
  POS: {
    label: 'POS Dine-In',
    shortLabel: 'POS',
    bg: 'bg-blue-500/15',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-500/30',
    dot: 'bg-blue-500'
  },
  TAKEAWAY: {
    label: 'Takeaway',
    shortLabel: 'Takeaway',
    bg: 'bg-slate-500/15',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-500/30',
    dot: 'bg-slate-500'
  }
};

export default function ChannelBadge({ source, short = false, className = '' }) {
  const cleanSource = String(source || 'POS').toUpperCase();
  const config = CHANNEL_CONFIGS[cleanSource] || CHANNEL_CONFIGS.POS;

  return (
    <span
      className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border ${config.bg} ${config.text} ${config.border} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{short ? config.shortLabel : config.label}</span>
    </span>
  );
}
