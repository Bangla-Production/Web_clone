import React, { useState } from 'react';
import { Database, Search, FileSpreadsheet, Trash2, ShieldCheck, CalendarDays } from 'lucide-react';
import {
  previewOldRecords,
  deleteOldRecords,
  saveCleanupMeta,
  CLEANUP_CAP_PER_COLLECTION
} from '../../services/firestoreService';
import { downloadXlsx } from '../../utils/xlsxExport';
import { buildBackupSheets, toInputDate } from '../../utils/dataBackup';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import CleanupDisclaimer from './CleanupDisclaimer';

const daysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
};

// "Up to and including 2026-06-30" => everything BEFORE 1 July 00:00 local.
const cutoffFromInput = (value) => {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d + 1, 0, 0, 0, 0);
};

export default function DataCleanupPanel({ restaurantId }) {
  const { user } = useAuth();
  const toast = useToast();

  const today = toInputDate(new Date());
  const [upTo, setUpTo] = useState(toInputDate(daysAgo(7)));
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [backedUp, setBackedUp] = useState(false);
  const [metaKey, setMetaKey] = useState(0);

  const total = preview ? preview.orders.length + preview.kots.length + preview.invoices.length : 0;
  const needsBackup = total > 0 && !backedUp;
  const dateValid = !!upTo && upTo <= today;

  const resetResult = () => {
    setPreview(null);
    setBackedUp(false);
    setProgress(null);
  };

  const handleScan = async () => {
    if (!dateValid) {
      toast.error('Pick today or an earlier date.');
      return;
    }
    try {
      setScanning(true);
      setBackedUp(false);
      setPreview(await previewOldRecords(restaurantId, cutoffFromInput(upTo)));
    } catch (err) {
      console.error('Scan old records failed:', err);
      toast.error(err?.code === 'permission-denied'
        ? 'Permission denied: only the restaurant admin can scan and clean data.'
        : `Could not scan old records. ${err?.message || ''}`);
    } finally {
      setScanning(false);
    }
  };

  const handleDownload = async () => {
    if (!preview || total === 0) return;
    try {
      downloadXlsx(`restaurant-data-up-to-${upTo}.xlsx`, buildBackupSheets(preview, upTo));
      setBackedUp(true);
      await saveCleanupMeta(restaurantId, ['lastBackupAt']);
      setMetaKey((k) => k + 1);
      toast.success('Excel backup downloaded. You can delete now.');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('Could not create the Excel file. Nothing was deleted.');
    }
  };

  const handleDelete = async () => {
    if (!preview || total === 0 || !backedUp) return;
    if (!window.confirm(
      `Excel downloaded and saved?\n\nThis will permanently delete ${total} records up to ${upTo} from Firebase. This cannot be undone.`
    )) return;

    try {
      setDeleting(true);
      setProgress({ done: 0, total });
      const { deleted } = await deleteOldRecords(restaurantId, preview, user, (done, all) =>
        setProgress({ done, total: all })
      );
      toast.success(`${deleted} records deleted from Firebase (verified).`);
      resetResult();
      setMetaKey((k) => k + 1);
    } catch (err) {
      console.error('Delete old records failed:', err);
      toast.error(err?.code === 'permission-denied'
        ? 'Permission denied: only the restaurant admin can delete records. Publish the latest firestore.rules.'
        : `Cleanup stopped. ${err?.message || ''} Scan again to see what is left.`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <CleanupDisclaimer restaurantId={restaurantId} refreshKey={metaKey} />

      <div className="space-y-5 bg-white dark:bg-pos-card border border-slate-200 dark:border-pos-border rounded-xl p-6 shadow-sm dark:shadow-xl text-xs">
        <h3 className="font-bold text-sm text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-200 dark:border-pos-border flex items-center space-x-2">
          <Database className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>Data Cleanup</span>
        </h3>

        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-pos-border text-slate-600 dark:text-slate-400 space-y-1.5 leading-relaxed">
          <p>
            Old records are <strong className="text-slate-900 dark:text-slate-200">never deleted automatically</strong>. Pick a date,
            download the Excel backup, then delete everything up to that date to keep the database light.
          </p>
          <p className="flex items-start space-x-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Only finished data is removed: paid/closed/cancelled orders, their kitchen tickets and invoices. Menu,
              tables, staff, inventory and any open (unpaid) order are never touched.
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">Delete all data up to (and including)</label>
            <div className="relative">
              <CalendarDays className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                value={upTo}
                max={today}
                onChange={(e) => {
                  setUpTo(e.target.value);
                  resetResult();
                }}
                className="pl-9 pr-3 py-2 bg-slate-100 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={handleScan}
            disabled={scanning || deleting || !dateValid}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold border border-slate-300 dark:border-slate-700 disabled:opacity-50 transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span>{scanning ? 'Scanning...' : 'Scan records'}</span>
          </button>
        </div>

        {preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                ['Finished orders', preview.orders.length],
                ['Kitchen tickets', preview.kots.length],
                ['Invoices', preview.invoices.length]
              ].map(([label, count]) => (
                <div key={label} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
                  <p className="text-lg font-extrabold text-slate-900 dark:text-white">{count}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
                </div>
              ))}
            </div>

            {preview.capped && (
              <p className="text-amber-600 dark:text-amber-300 font-semibold">
                Showing the first {CLEANUP_CAP_PER_COLLECTION} per type. Delete these, then scan again for the rest.
              </p>
            )}

            {total === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">Nothing finished up to {upTo}. Nothing to clean up.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={deleting}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-bold disabled:opacity-40"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>{backedUp ? '1. Download Excel again' : '1. Download Excel backup'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting || needsBackup}
                  title={needsBackup ? 'Download the Excel backup first' : ''}
                  className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {deleting && progress
                      ? `Deleting ${progress.done}/${progress.total}...`
                      : `2. Download done - Delete ${total} records`}
                  </span>
                </button>
              </div>
            )}
            {needsBackup && (
              <p className="text-slate-500">Download the Excel first. Then click "Download done" to delete the data.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
