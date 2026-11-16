import React, { useState } from 'react';
import {
  ArrowLeft,
  Edit,
  Key,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import type { ApiUserRecord } from '../services/shopApi';

export function EmployeesView({
  employees,
  shopId,
  shopName,
  onBack,
  onAddEmployee,
  onUpdateEmployee,
  onToggleStatus,
  onResetPin,
  onDeleteEmployee,
}: {
  employees: ApiUserRecord[];
  shopId: string;
  shopName: string;
  onBack: () => void;
  onAddEmployee: (input: { email: string; displayName: string; pin: string }) => Promise<void>;
  onUpdateEmployee: (
    empUid: string,
    patch: { displayName?: string; email?: string }
  ) => Promise<void>;
  onToggleStatus: (empUid: string) => Promise<void>;
  onResetPin: (empUid: string, pin: string) => Promise<void>;
  onDeleteEmployee: (empUid: string) => Promise<void>;
}) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<ApiUserRecord | null>(null);
  const [resetPinEmp, setResetPinEmp] = useState<ApiUserRecord | null>(null);
  const [confirmDeleteUid, setConfirmDeleteUid] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const openAdd = () => {
    setError('');
    setDisplayName('');
    setEmail('');
    setPin('');
    setShowAddModal(true);
  };

  const openEdit = (emp: ApiUserRecord) => {
    setError('');
    setDisplayName(emp.displayName);
    setEmail(emp.email);
    setEditingEmp(emp);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await onAddEmployee({ displayName, email, pin });
      setShowAddModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add employee.');
    } finally {
      setBusy(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmp) return;
    setError('');
    setBusy(true);
    try {
      await onUpdateEmployee(editingEmp.uid, { displayName, email });
      setEditingEmp(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee.');
    } finally {
      setBusy(false);
    }
  };

  const handleResetPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetPinEmp) return;
    setError('');
    setBusy(true);
    try {
      await onResetPin(resetPinEmp.uid, newPinInput);
      setResetPinEmp(null);
      setNewPinInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset PIN.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-slate-100">
      <div className="bg-emerald-800 text-white p-4 shadow-sm shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onBack} aria-label="Back to home" className="p-1 hover:bg-emerald-700 rounded-full">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-base font-bold">Staff &amp; Employees</h2>
            <p className="text-[10px] text-emerald-200">
              {shopName} ({shopId})
            </p>
          </div>
        </div>
        <button
          onClick={openAdd}
          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow flex items-center gap-1"
        >
          <UserPlus className="w-3.5 h-3.5" /> Add Staff
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-3 text-[11px] text-sky-900 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
          <div>
            Employees sign in with their own registered Gmail, Shop ID <span className="font-mono font-bold">{shopId}</span>, and personal staff PIN. They can create bills, view items, and view basic reports — without access to settings, backups, or shop deletion.
          </div>
        </div>

        {employees.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-xs font-bold text-slate-700">No employees added yet</div>
            <p className="text-[11px] text-slate-500">
              Add cashiers or store staff with separate Gmail logins and individual PINs.
            </p>
          </div>
        ) : (
          employees.map((emp) => (
            <div
              key={emp.uid}
              className={`bg-white p-3.5 rounded-xl border shadow-sm space-y-2.5 ${
                emp.isActive ? 'border-slate-200' : 'border-red-200 bg-red-50/30'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-bold text-xs text-slate-900">{emp.displayName}</span>
                    <span
                      className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                        emp.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {emp.isActive ? 'Active' : 'Deactivated'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600 flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3 text-slate-400" />
                    <span>{emp.email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => openEdit(emp)}
                    aria-label={`Edit ${emp.displayName}`}
                    className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setError('');
                      setNewPinInput('');
                      setResetPinEmp(emp);
                    }}
                    aria-label={`Reset PIN for ${emp.displayName}`}
                    className="p-1.5 text-sky-600 hover:bg-sky-50 rounded-lg"
                  >
                    <Key className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px]">
                <button
                  onClick={() => onToggleStatus(emp.uid)}
                  className={`font-bold px-2.5 py-1 rounded-lg transition ${
                    emp.isActive
                      ? 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                      : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  {emp.isActive ? 'Deactivate' : 'Activate'}
                </button>

                {confirmDeleteUid === emp.uid ? (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={async () => {
                        await onDeleteEmployee(emp.uid);
                        setConfirmDeleteUid(null);
                      }}
                      className="px-2 py-1 bg-red-600 text-white font-bold rounded-lg text-[10px]"
                    >
                      Confirm Delete
                    </button>
                    <button
                      onClick={() => setConfirmDeleteUid(null)}
                      className="px-2 py-1 bg-slate-200 text-slate-700 font-semibold rounded-lg text-[10px]"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteUid(emp.uid)}
                    className="text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Employee Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900">Add Store Employee</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            {error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleAddSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="e.g. Sunil Kumar"
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Employee Gmail / Email *</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. sunil@quickmart.in"
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Staff PIN (4-6 digits) *</label>
                <input
                  type="password"
                  maxLength={6}
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="••••"
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono tracking-widest"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
              >
                {busy ? 'Saving...' : 'Create Employee'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit Employee Modal */}
      {editingEmp && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900">Edit Employee</h3>
              <button onClick={() => setEditingEmp(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            {error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleEditSubmit} className="space-y-2.5 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-700 block mb-1">Employee Gmail / Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl"
              >
                {busy ? 'Updating...' : 'Save Changes'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Reset Employee PIN Modal */}
      {resetPinEmp && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-xs p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="text-sm font-bold text-slate-900">Reset Staff PIN</h3>
              <button onClick={() => setResetPinEmp(null)} className="text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Set a new 4-6 digit PIN for <span className="font-bold text-slate-800">{resetPinEmp.displayName}</span>.
            </p>
            {error && (
              <div className="p-2 bg-red-50 border border-red-200 rounded-lg text-[11px] text-red-700">
                {error}
              </div>
            )}
            <form onSubmit={handleResetPinSubmit} className="space-y-2.5 text-xs">
              <input
                type="password"
                maxLength={6}
                required
                value={newPinInput}
                onChange={(e) => setNewPinInput(e.target.value)}
                placeholder="New PIN (4-6 digits)"
                className="w-full px-3 py-2 border rounded-xl bg-slate-50 font-mono text-center tracking-widest"
              />
              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-xl"
              >
                {busy ? 'Resetting...' : 'Reset PIN & Revoke Active Sessions'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
