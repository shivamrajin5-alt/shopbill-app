import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  RefreshCw,
  ShieldAlert,
  Upload,
} from 'lucide-react';
import type { ApiBackupHistoryRecord } from '../services/shopApi';
import { validateBackupBundle, type ShopBackupBundle } from '../utils/backupRestore';

export function BackupRestoreView({
  shopId,
  shopName,
  history,
  hasCloudAuth,
  onBack,
  onExportSqlite,
  onExportFirestore,
  onRestoreBackup,
  fmtDate,
}: {
  shopId: string;
  shopName: string;
  history: ApiBackupHistoryRecord[];
  hasCloudAuth: boolean;
  onBack: () => void;
  onExportSqlite: () => Promise<ShopBackupBundle>;
  onExportFirestore: () => Promise<ShopBackupBundle>;
  onRestoreBackup: (bundle: ShopBackupBundle) => Promise<{ restoredItems: number; restoredBills: number }>;
  fmtDate: (iso: string) => string;
}) {
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pendingBundle, setPendingBundle] = useState<ShopBackupBundle | null>(null);

  const downloadJson = (bundle: ShopBackupBundle) => {
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BillKart_Backup_${bundle.shop.shopId}_${bundle.source}_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExport = async (mode: 'sqlite' | 'firestore') => {
    setErrorMsg('');
    setStatusMsg('');
    setBusy(true);
    try {
      const bundle = mode === 'sqlite' ? await onExportSqlite() : await onExportFirestore();
      downloadJson(bundle);
      setStatusMsg(
        `Backup exported (${bundle.items.length} items, ${bundle.bills.length} bills, checksum ${bundle.checksum}).`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Backup export failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg('');
    setStatusMsg('');
    setPendingBundle(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const check = validateBackupBundle(parsed, shopId);
      if (!check.valid || !check.bundle) {
        setErrorMsg(check.errors.join(' '));
        return;
      }
      setPendingBundle(check.bundle);
    } catch (_) {
      setErrorMsg('Selected file is not valid BillKart backup JSON.');
    } finally {
      e.target.value = '';
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingBundle) return;
    setErrorMsg('');
    setBusy(true);
    try {
      const res = await onRestoreBackup(pendingBundle);
      setPendingBundle(null);
      setStatusMsg(
        `Restore complete! Restored ${res.restoredItems} items and ${res.restoredBills} bills into SQLite.`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Restore failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Back to settings" className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold">Backup &amp; Restore</h2>
            <p className="text-[10px] text-emerald-200">
              {shopName} ({shopId})
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {errorMsg && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        {statusMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <div>{statusMsg}</div>
          </div>
        )}

        {/* Export Backup */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Create Backup File</h3>
          <p className="text-[11px] text-slate-500">
            Export a signed JSON backup containing your shop profile, inventory catalog, bills, and staff list.
          </p>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => handleExport('sqlite')}
              className="w-full py-2.5 px-3 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <Database className="w-4 h-4" />
              <Download className="w-3.5 h-3.5" />
              Export Local SQLite Backup
            </button>
            <button
              type="button"
              disabled={busy || !hasCloudAuth}
              onClick={() => handleExport('firestore')}
              className="w-full py-2.5 px-3 bg-sky-700 hover:bg-sky-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2"
            >
              <Cloud className="w-4 h-4" />
              <Download className="w-3.5 h-3.5" />
              {hasCloudAuth ? 'Export Cloud Firestore Backup' : 'Sign in Google to Export Firestore'}
            </button>
          </div>
        </div>

        {/* Restore Backup */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2.5">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Restore From Backup</h3>
          <p className="text-[11px] text-slate-500">
            Every backup is validated for Shop ID match and checksum integrity before restoring.
          </p>
          <label className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 border border-dashed border-slate-300 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>Select Backup JSON File</span>
            <input type="file" accept="application/json,.json" onChange={handleFilePick} className="hidden" />
          </label>

          {pendingBundle && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-2 text-xs">
              <div className="font-bold text-amber-900">Confirm Restore Operation</div>
              <div className="text-[11px] text-amber-800 space-y-0.5">
                <div>Shop: {pendingBundle.shop.shopName} ({pendingBundle.shop.shopId})</div>
                <div>Exported: {fmtDate(pendingBundle.exportedAt)} ({pendingBundle.source})</div>
                <div>
                  Contents: <span className="font-bold">{pendingBundle.items.length}</span> items &bull;{' '}
                  <span className="font-bold">{pendingBundle.bills.length}</span> bills
                </div>
                <div className="font-mono text-[10px]">Checksum Verified: {pendingBundle.checksum || 'Valid'}</div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setPendingBundle(null)}
                  className="flex-1 py-2 bg-white border border-slate-300 text-slate-700 font-bold rounded-lg text-[11px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmRestore}
                  className="flex-1 py-2 bg-amber-700 hover:bg-amber-800 text-white font-bold rounded-lg text-[11px] flex items-center justify-center gap-1"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
                  Confirm Restore
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Backup History */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Backup History</h3>
          {history.length === 0 ? (
            <p className="text-[11px] text-slate-400">No backups created yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((h) => (
                <div key={h.id} className="py-2 text-[11px] flex items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-800 uppercase">{h.source} backup</div>
                    <div className="text-[10px] text-slate-500">
                      {h.itemsCount} items &bull; {h.billsCount} bills &bull; {fmtDate(h.createdAt)}
                    </div>
                  </div>
                  <span className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                    {h.checksum.slice(0, 12)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
