import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { getCleanupMeta } from '../../services/firestoreService';
import { daysSince } from '../../utils/dataBackup';

/**
 * Big, hard-to-miss reminder: back up to Excel and clean up every 7 days.
 * Turns red when the last Excel backup is 7+ days old (or was never taken).
 * `refreshKey` changes -> the "last backup" line is re-read.
 */
export default function CleanupDisclaimer({ restaurantId, refreshKey = 0 }) {
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    let alive = true;
    if (!restaurantId) return undefined;
    getCleanupMeta(restaurantId).then((m) => alive && setMeta(m));
    return () => { alive = false; };
  }, [restaurantId, refreshKey]);

  const age = meta ? daysSince(meta.lastBackupAt) : null;
  const overdue = meta !== null && (age === null || age >= 7);

  const lastLine = meta === null
    ? ''
    : age === null
      ? 'No Excel backup has been recorded yet.'
      : age === 0
        ? 'Last Excel backup: today.'
        : `Last Excel backup: ${age} day${age === 1 ? '' : 's'} ago.`;

  return (
    <div
      className={`rounded-xl border-2 p-4 flex items-start space-x-3 ${
        overdue ? 'bg-rose-950/60 border-rose-500' : 'bg-amber-950/40 border-amber-500'
      }`}
    >
      <AlertTriangle className={`w-7 h-7 shrink-0 ${overdue ? 'text-rose-400' : 'text-amber-400'}`} />
      <div className="space-y-1 leading-relaxed">
        <p className="text-sm font-extrabold uppercase tracking-wide text-white">
          Important: download your data to Excel and clean up every 7 days
        </p>
        <p className="text-xs text-slate-200">
          Take the Excel backup at least once every 7 days, then remove the old data. Deleted data
          <strong> cannot be recovered</strong> - the Excel file you download is your only copy, so keep it safe.
        </p>
        {lastLine && (
          <p className={`text-xs font-bold ${overdue ? 'text-rose-300' : 'text-amber-300'}`}>
            {overdue && age !== null ? 'Overdue! ' : ''}{lastLine}
          </p>
        )}
      </div>
    </div>
  );
}
