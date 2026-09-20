import React, { useState } from 'react';
import { FileSpreadsheet, Trash2, Eraser } from 'lucide-react';
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
import Modal from '../common/Modal';
import CleanupDisclaimer from './CleanupDisclaimer';

/**
 * Two extra buttons for the Reports header:
 *  - "Download Excel": every order / kitchen ticket / invoice -> one .xlsx
 *  - "Cleanup": removes completed + cancelled orders (and their kitchen
 *    tickets / invoices) from Firebase - unlocked only after an Excel download.
 * Reports numbers themselves are untouched; they simply cover whatever data
 * is still in Firebase.
 */
export default function ReportsCleanupTools({ restaurantId, onDone }) {
  const { user } = useAuth();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false); // scanning / preparing Excel
  const [deleting, setDeleting] = useState(false);
  const [progress, setProgress] = useState(null);
  const [preview, setPreview] = useState(null);
  const [backedUp, setBackedUp] = useState(false);
  const [metaKey, setMetaKey] = useState(0);

  const total = preview ? preview.orders.length + preview.kots.length + preview.invoices.length : 0;
  const cancelled = preview ? preview.orders.filter((o) => o.data.orderStatus === 'CANCELLED').length : 0;
  const completed = preview ? preview.orders.length - cancelled : 0;

  const errorText = (err, fallback) =>
    err?.code === 'permission-denied'
      ? 'Permission denied: only the restaurant admin can do this. Publish the latest firestore.rules.'
      : `${fallback} ${err?.message || ''}`;

  const scanNow = () => previewOldRecords(restaurantId, null); // null = all data, no date needed
  const fileName = () => `restaurant-data-${toInputDate(new Date())}.xlsx`;

  const saveExcel = async (data) => {
    downloadXlsx(fileName(), buildBackupSheets(data, `${toInputDate(new Date())} (all data)`));
    await saveCleanupMeta(restaurantId, ['lastBackupAt']);
    setMetaKey((k) => k + 1);
  };

  // Header button: download everything, nothing is deleted.
  const handleDownloadAll = async () => {
    try {
      setBusy(true);
      const data = await scanNow();
      const count = data.allOrders.length + data.allKots.length + data.invoices.length;
      if (count === 0) {
        toast.error('There is no data to download yet.');
        return;
      }
      await saveExcel(data);
      toast.success('Excel downloaded with all orders, kitchen tickets and invoices.');
    } catch (err) {
      console.error('Download all failed:', err);
      toast.error(errorText(err, 'Could not prepare the Excel file.'));
    } finally {
      setBusy(false);
    }
  };

  // Header button: open the cleanup window and scan right away.
  const handleOpenCleanup = async () => {
    setOpen(true);
    setPreview(null);
    setBackedUp(false);
    setProgress(null);
    try {
      setBusy(true);
      const data = await scanNow();
      console.info('Cleanup scan:', restaurantId, data.allOrders.length, 'orders,', data.allKots.length, 'kots,', data.invoices.length, 'invoices');
      setPreview(data);
    } catch (err) {
      console.error('Cleanup scan failed:', err);
      toast.error(errorText(err, 'Could not scan the data.'));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const handleBackupInModal = async () => {
    if (!preview) return;
    try {
      await saveExcel(preview);
      setBackedUp(true);
      toast.success('Excel backup downloaded. You can delete now.');
    } catch (err) {
      console.error('Excel export failed:', err);
      toast.error('Could not create the Excel file. Nothing was deleted.');
    }
  };

  // "Download done" -> removes the data from Firebase.
  const handleDelete = async () => {
    if (!preview || total === 0 || !backedUp) return;
    if (!window.confirm(
      `Excel downloaded and saved?\n\nThis will permanently delete ${total} completed / cancelled records from Firebase. This cannot be undone.`
    )) return;

    try {
      setDeleting(true);
      setProgress({ done: 0, total });
      const { deleted } = await deleteOldRecords(restaurantId, preview, user, (done, all) =>
        setProgress({ done, total: all })
      );
      toast.success(`${deleted} records deleted from Firebase (verified).`);
      setPreview(null);
      setBackedUp(false);
      setOpen(false);
      setMetaKey((k) => k + 1);
      if (onDone) onDone();
    } catch (err) {
      console.error('Cleanup failed:', err);
      toast.error(errorText(err, 'Cleanup stopped. Scan again to see what is left.'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 self-start">
        <button
          onClick={handleDownloadAll}
          disabled={busy}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold border border-sky-600 transition-colors disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>{busy && !open ? 'Preparing...' : 'Download Excel'}</span>
        </button>
        <button
          onClick={handleOpenCleanup}
          disabled={busy}
          className="flex items-center space-x-1.5 px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-semibold border border-rose-600 transition-colors disabled:opacity-50"
        >
          <Eraser className="w-3.5 h-3.5" />
          <span>Cleanup</span>
        </button>
      </div>

      <Modal
        isOpen={open}
        onClose={() => !deleting && setOpen(false)}
        title="Cleanup completed & cancelled data"
        maxWidth="max-w-xl"
      >
        <div className="space-y-4 text-xs">
          <CleanupDisclaimer restaurantId={restaurantId} refreshKey={metaKey} />

          {!preview ? (
            <p className="text-slate-500 dark:text-slate-400">Scanning Firebase...</p>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-2">
                {[
                  ['Completed orders', completed],
                  ['Cancelled orders', cancelled],
                  ['Kitchen tickets', preview.kots.length],
                  ['Invoices', preview.invoices.length]
                ].map(([label, count]) => (
                  <div key={label} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center">
                    <p className="text-lg font-extrabold text-slate-900 dark:text-white">{count}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight">{label}</p>
                  </div>
                ))}
              </div>

              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Open / unpaid orders, menu, tables, staff and inventory are never touched. Reports will only
                show data that is still in Firebase, so keep the Excel file for older figures.
              </p>

              {preview.capped && (
                <p className="text-amber-600 dark:text-amber-300 font-semibold">
                  Showing the first {CLEANUP_CAP_PER_COLLECTION} per type. Delete these, then run Cleanup again for the rest.
                </p>
              )}

              {total === 0 ? (
                <p className="text-slate-700 dark:text-slate-300">
                  No completed or cancelled data to clean up. Found in Firebase: {preview.allOrders.length} orders
                  ({preview.allOrders.length - preview.orders.length} still open), {preview.allKots.length} kitchen
                  tickets, {preview.invoices.length} invoices.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleBackupInModal}
                    disabled={deleting}
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-lg bg-sky-700 hover:bg-sky-600 text-white font-bold disabled:opacity-40"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>{backedUp ? '1. Download Excel again' : '1. Download Excel'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleting || !backedUp}
                    title={!backedUp ? 'Download the Excel first' : ''}
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
              {total > 0 && !backedUp && (
                <p className="text-slate-500">Download the Excel first. Then click "Download done" to delete the data.</p>
              )}
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
