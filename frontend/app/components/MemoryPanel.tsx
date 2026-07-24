'use client';

import { useEffect, useState } from 'react';
import { X, Trash2, BrainCircuit } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { clearMemory, getMemory } from '../lib/interviewApi';
import { getErrorMessage } from '../lib/axios';
import type { MemoryProfile } from '../lib/types';
import Spinner from './Spinner';

interface MemoryPanelProps {
  onClose: () => void;
}

const EMPTY_PROFILE: MemoryProfile = {
  permanent_user_details: {
    name: null,
    age: null,
    country: null,
    profession: null,
    long_term_goals: [],
    preferences: [],
  },
  normal_user_memory: [],
  updated_at: null,
};

const DETAIL_LABELS: { key: 'name' | 'age' | 'country' | 'profession'; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: 'country', label: 'Country' },
  { key: 'profession', label: 'Profession' },
];

function isProfileEmpty(profile: MemoryProfile): boolean {
  const details = profile.permanent_user_details;
  const hasDetails =
    DETAIL_LABELS.some(({ key }) => Boolean(details[key])) ||
    details.long_term_goals.length > 0 ||
    details.preferences.length > 0;
  return !hasDetails && profile.normal_user_memory.length === 0;
}

export default function MemoryPanel({ onClose }: MemoryPanelProps) {
  const [profile, setProfile] = useState<MemoryProfile | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMemory()
      .then((result) => {
        if (cancelled) return;
        setProfile(result);
        setUpdatedAt(result.updated_at);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not load your profile.'));
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await clearMemory();
      setProfile(EMPTY_PROFILE);
      setUpdatedAt(null);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not clear your profile.'));
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 animate-fadeIn" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5 animate-slideUp">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">What the coach remembers</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} height={12} />
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : profile && !isProfileEmpty(profile) ? (
          <>
            <div className="max-h-64 overflow-y-auto space-y-4">
              {(DETAIL_LABELS.some(({ key }) => Boolean(profile.permanent_user_details[key])) ||
                profile.permanent_user_details.long_term_goals.length > 0 ||
                profile.permanent_user_details.preferences.length > 0) && (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">Profile</h3>
                  <dl className="space-y-1">
                    {DETAIL_LABELS.map(
                      ({ key, label }) =>
                        profile.permanent_user_details[key] && (
                          <div key={key} className="flex gap-2 text-[13px]">
                            <dt className="text-zinc-500">{label}:</dt>
                            <dd className="text-zinc-200">{profile.permanent_user_details[key]}</dd>
                          </div>
                        )
                    )}
                  </dl>
                  {profile.permanent_user_details.long_term_goals.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] text-zinc-500 mb-1">Goals</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {profile.permanent_user_details.long_term_goals.map((goal) => (
                          <li key={goal} className="text-[12px] bg-zinc-800 text-zinc-300 rounded-full px-2 py-0.5">
                            {goal}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {profile.permanent_user_details.preferences.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] text-zinc-500 mb-1">Preferences</p>
                      <ul className="flex flex-wrap gap-1.5">
                        {profile.permanent_user_details.preferences.map((pref) => (
                          <li key={pref} className="text-[12px] bg-zinc-800 text-zinc-300 rounded-full px-2 py-0.5">
                            {pref}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {profile.normal_user_memory.length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-2">
                    Recent context
                  </h3>
                  <ul className="space-y-1 list-disc list-inside text-[13px] text-zinc-300">
                    {[...profile.normal_user_memory].reverse().map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {updatedAt && (
              <p className="text-[11px] text-zinc-500 mt-3">Last updated {new Date(updatedAt).toLocaleString()}</p>
            )}
            <button
              onClick={handleClear}
              disabled={isClearing}
              className="mt-4 flex items-center gap-2 text-[13px] text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors duration-150"
            >
              {isClearing ? <Spinner className="w-3.5 h-3.5" /> : <Trash2 className="w-3.5 h-3.5" />}
              {isClearing ? 'Clearing…' : 'Clear everything the coach remembers about me'}
            </button>
          </>
        ) : (
          <p className="text-sm text-zinc-500">
            Nothing yet — as you chat, the coach builds up notes on your target role, experience, and areas to
            focus on, and reuses them across every session.
          </p>
        )}
      </div>
    </div>
  );
}
