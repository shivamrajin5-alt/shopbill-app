import React, { useState } from 'react';
import { ArrowLeft, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import type { ApiAuditLogRecord } from '../services/shopApi';

export function AuditLogsView({
  logs,
  title,
  onBack,
  onRefresh,
  fmtDate,
}: {
  logs: ApiAuditLogRecord[];
  title: string;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  fmtDate: (iso: string) => string;
}) {
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = logs.filter((log) => {
    const matchSearch =
      !search.trim() ||
      log.action.toLowerCase().includes(search.toLowerCase()) ||
      log.actorEmail.toLowerCase().includes(search.toLowerCase()) ||
      log.targetId.toLowerCase().includes(search.toLowerCase()) ||
      log.shopId.toLowerCase().includes(search.toLowerCase());
    const matchType =
      actionFilter === 'all' ||
      (actionFilter === 'auth' && log.action.includes('login')) ||
      (actionFilter === 'bills' && log.action.includes('bill')) ||
      (actionFilter === 'items' && (log.action.includes('item') || log.action.includes('stock'))) ||
      (actionFilter === 'security' &&
        (log.action.includes('pin') ||
          log.action.includes('shop') ||
          log.action.includes('admin') ||
          log.action.includes('backup') ||
          log.action.includes('employee')));
    return matchSearch && matchType;
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-slate-900 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Back" className="p-1 hover:bg-slate-800 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              {title}
            </h2>
            <p className="text-[10px] text-slate-400">Immutable activity &amp; security trail</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          aria-label="Refresh audit logs"
          className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="p-3 bg-white border-b border-slate-200 space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search actor, action, target ID..."
            className="w-full pl-9 pr-3 py-2 bg-slate-100 rounded-lg text-xs border border-slate-200"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'auth', label: 'Logins' },
            { id: 'bills', label: 'Bills' },
            { id: 'items', label: 'Inventory' },
            { id: 'security', label: 'Security/Admin' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActionFilter(tab.id)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                actionFilter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-xs text-slate-500">
            No audit events match your filter.
          </div>
        ) : (
          filtered.map((log) => (
            <div key={log.id} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm space-y-1 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-800 font-mono font-bold text-[10px]">
                  {log.action}
                </span>
                <span className="text-[10px] text-slate-400">{fmtDate(log.createdAt)}</span>
              </div>
              <div className="text-[11px] font-semibold text-slate-800">
                {log.actorEmail}{' '}
                <span className="text-[10px] text-slate-500 font-normal">({log.actorRole})</span>
              </div>
              <div className="text-[10px] text-slate-500">
                Shop: <span className="font-mono font-bold text-slate-700">{log.shopId}</span> &bull; Target:{' '}
                <span className="font-mono">{log.targetType}/{log.targetId}</span>
              </div>
              {Boolean(log.afterData) && (
                <div className="bg-slate-50 p-1.5 rounded border border-slate-100 text-[10px] font-mono text-slate-600 break-all">
                  {typeof log.afterData === 'string' ? log.afterData : JSON.stringify(log.afterData)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
