'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, ShieldCheck, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { getUser, listFeedback, listUsers, setUserActive } from '../../lib/adminApi';
import { getErrorMessage } from '../../lib/axios';
import { useAuth } from '../../context/AuthContext';
import type { AdminUser, FeedbackEntry } from '../../lib/types';
import Spinner from '../Spinner';

interface AdminPanelProps {
  onClose: () => void;
}

type Tab = 'users' | 'feedback';

function RoleBadge({ role }: { role: AdminUser['role'] }) {
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded-md shrink-0 ${
        role === 'ADMIN' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-zinc-800 text-zinc-400'
      }`}
    >
      {role}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`text-[11px] px-1.5 py-0.5 rounded-md shrink-0 ${
        isActive ? 'bg-zinc-800 text-zinc-400' : 'bg-red-500/15 text-red-400'
      }`}
    >
      {isActive ? 'Active' : 'Inactive'}
    </span>
  );
}

export default function AdminPanel({ onClose }: AdminPanelProps) {
  const { user: currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const [feedback, setFeedback] = useState<FeedbackEntry[] | null>(null);
  const [isLoadingFeedback, setIsLoadingFeedback] = useState(false);

  const loadUsers = async () => {
    if (users !== null || isLoadingUsers) return;
    setIsLoadingUsers(true);
    setError(null);
    try {
      setUsers(await listUsers());
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load users.'));
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadFeedback = async () => {
    if (feedback !== null || isLoadingFeedback) return;
    setIsLoadingFeedback(true);
    setError(null);
    try {
      setFeedback(await listFeedback());
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load feedback.'));
    } finally {
      setIsLoadingFeedback(false);
    }
  };

  const handleSelectTab = (next: Tab) => {
    setTab(next);
    setError(null);
    if (next === 'users') void loadUsers();
    else void loadFeedback();
  };

  // Fetches on mount since the "Users" tab is the default (mirrors PluginsPanel's
  // "fetch what's visible on open" behavior rather than requiring an extra click).
  useEffect(() => {
    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleActive = async (target: AdminUser) => {
    if (updatingId) return;
    setUpdatingId(target.id);
    setError(null);
    try {
      const updated = await setUserActive(target.id, !target.is_active);
      setUsers((prev) => prev?.map((u) => (u.id === updated.id ? updated : u)) ?? prev);
      setSelectedUser((prev) => (prev?.id === updated.id ? updated : prev));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not update this user.'));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleViewUser = async (id: string) => {
    setIsLoadingDetail(true);
    setError(null);
    try {
      setSelectedUser(await getUser(id));
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load this user.'));
    } finally {
      setIsLoadingDetail(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 animate-fadeIn" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5 animate-slideUp">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {selectedUser && (
              <button
                onClick={() => setSelectedUser(null)}
                className="p-1 -ml-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">{selectedUser ? 'User details' : 'Admin'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {!selectedUser && (
          <div className="flex gap-1 p-1 rounded-xl bg-zinc-900/70 mb-4">
            <button
              onClick={() => handleSelectTab('users')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                tab === 'users' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => handleSelectTab('feedback')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors duration-200 ${
                tab === 'feedback' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Feedback
            </button>
          </div>
        )}

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {selectedUser ? (
          isLoadingDetail ? (
            <Skeleton height={16} count={5} className="mb-2" />
          ) : (
            <div>
              <dl className="space-y-1.5">
                <div className="flex gap-2 text-[13px]">
                  <dt className="text-zinc-500 w-28 shrink-0">Username</dt>
                  <dd className="text-zinc-200">{selectedUser.username}</dd>
                </div>
                <div className="flex gap-2 text-[13px]">
                  <dt className="text-zinc-500 w-28 shrink-0">Email</dt>
                  <dd className="text-zinc-200">{selectedUser.email}</dd>
                </div>
                <div className="flex gap-2 text-[13px]">
                  <dt className="text-zinc-500 w-28 shrink-0">Name</dt>
                  <dd className="text-zinc-200">
                    {[selectedUser.first_name, selectedUser.last_name].filter(Boolean).join(' ') || '—'}
                  </dd>
                </div>
                <div className="flex gap-2 items-center text-[13px]">
                  <dt className="text-zinc-500 w-28 shrink-0">Role</dt>
                  <dd>
                    <RoleBadge role={selectedUser.role} />
                  </dd>
                </div>
                <div className="flex gap-2 items-center text-[13px]">
                  <dt className="text-zinc-500 w-28 shrink-0">Status</dt>
                  <dd>
                    <StatusBadge isActive={selectedUser.is_active} />
                  </dd>
                </div>
                <div className="flex gap-2 text-[13px]">
                  <dt className="text-zinc-500 w-28 shrink-0">Joined</dt>
                  <dd className="text-zinc-200">{new Date(selectedUser.created_at).toLocaleString()}</dd>
                </div>
              </dl>

              {selectedUser.id !== currentUser?.id && (
                <button
                  onClick={() => void handleToggleActive(selectedUser)}
                  disabled={updatingId === selectedUser.id}
                  className={`mt-4 flex items-center gap-2 text-[13px] disabled:opacity-50 transition-colors duration-150 ${
                    selectedUser.is_active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'
                  }`}
                >
                  {updatingId === selectedUser.id && <Spinner className="w-3.5 h-3.5" />}
                  {selectedUser.is_active ? 'Deactivate account' : 'Activate account'}
                </button>
              )}
            </div>
          )
        ) : tab === 'users' ? (
          <div className="max-h-96 overflow-y-auto space-y-1">
            {isLoadingUsers ? (
              [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} borderRadius={12} />)
            ) : users && users.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No users found.</p>
            ) : (
              users?.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-zinc-800/60 transition-colors duration-150"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-zinc-200 truncate">{u.username}</p>
                    <p className="text-[12px] text-zinc-500 truncate">{u.email}</p>
                  </div>
                  <RoleBadge role={u.role} />
                  <StatusBadge isActive={u.is_active} />
                  <button
                    onClick={() => void handleViewUser(u.id)}
                    className="text-[12px] text-zinc-400 hover:text-white shrink-0"
                  >
                    View
                  </button>
                  {u.id === currentUser?.id ? null : updatingId === u.id ? (
                    <span className="p-1 shrink-0">
                      <Spinner className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <button
                      onClick={() => void handleToggleActive(u)}
                      className={`text-[12px] shrink-0 ${
                        u.is_active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'
                      }`}
                    >
                      {u.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto space-y-2">
            {isLoadingFeedback ? (
              [0, 1, 2].map((i) => <Skeleton key={i} height={56} borderRadius={12} />)
            ) : feedback && feedback.length === 0 ? (
              <p className="text-sm text-zinc-500 py-4 text-center">No feedback yet.</p>
            ) : (
              feedback?.map((f) => (
                <div key={f.id} className="rounded-xl px-3 py-2.5 bg-zinc-800/40">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-[12px] text-zinc-400 truncate">
                      {f.user.username} <span className="text-zinc-600">({f.user.email})</span>
                    </p>
                    <p className="text-[11px] text-zinc-500 shrink-0">{new Date(f.created_at).toLocaleString()}</p>
                  </div>
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap wrap-break-word">{f.message}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
