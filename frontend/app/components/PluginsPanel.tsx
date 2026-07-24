'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, GitFork, Lock, Plus, Puzzle, Unlink, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { disconnectGithub, getGithubConnectUrl, getGithubConnection, listGithubRepos } from '../lib/githubApi';
import { getErrorMessage } from '../lib/axios';
import type { GithubRepo } from '../lib/types';
import Spinner from './Spinner';

interface PluginsPanelProps {
  onClose: () => void;
  onSelectRepo: (repoFullName: string) => Promise<void>;
  initialError?: string | null;
}

// Only one plugin exists today (GitHub repo chat) — this renders as a one-item list rather than
// a real multi-plugin grid, but is structured so a second plugin card is a straightforward add.
export default function PluginsPanel({ onClose, onSelectRepo, initialError = null }: PluginsPanelProps) {
  const [view, setView] = useState<'grid' | 'repos'>('grid');
  const [isCheckingConnection, setIsCheckingConnection] = useState(true);
  const [username, setUsername] = useState<string | null>(null);
  const [repos, setRepos] = useState<GithubRepo[]>([]);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [selectingRepo, setSelectingRepo] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  useEffect(() => {
    let cancelled = false;
    getGithubConnection()
      .then((connection) => {
        if (cancelled) return;
        setUsername(connection.connected ? connection.github_username : null);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, 'Could not check your GitHub connection.'));
      })
      .finally(() => {
        if (!cancelled) setIsCheckingConnection(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadRepos = async (nextPage: number) => {
    const result = await listGithubRepos(nextPage);
    setRepos((prev) => (nextPage === 1 ? result.items : [...prev, ...result.items]));
    setHasMore(result.has_more);
    setPage(nextPage);
  };

  const openRepoPicker = async () => {
    setView('repos');
    if (repos.length > 0) return; // already loaded from an earlier visit to this view
    setIsLoadingRepos(true);
    try {
      await loadRepos(1);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load your repositories.'));
    } finally {
      setIsLoadingRepos(false);
    }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      await loadRepos(page + 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not load more repositories.'));
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleSelect = async (repo: GithubRepo) => {
    if (selectingRepo) return;
    setSelectingRepo(repo.full_name);
    try {
      await onSelectRepo(repo.full_name);
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Could not start a chat about this repository.'));
      setSelectingRepo(null);
    }
  };

  const handleDisconnect = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      await disconnectGithub();
      setUsername(null);
      setRepos([]);
      setView('grid');
    } catch (err) {
      setError(getErrorMessage(err, 'Could not disconnect GitHub.'));
    } finally {
      setIsDisconnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 animate-fadeIn" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5 animate-slideUp">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {view === 'repos' && (
              <button
                onClick={() => setView('grid')}
                className="p-1 -ml-1 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Puzzle className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">{view === 'grid' ? 'Plugins' : 'Select a repository'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {view === 'grid' && (
          <p className="text-[13px] text-zinc-500 mb-4">Work with the coach across your favorite tools.</p>
        )}

        {error && <p className="text-sm text-red-400 mb-3">{error}</p>}

        {view === 'grid' ? (
          isCheckingConnection ? (
            <Skeleton height={56} borderRadius={12} />
          ) : username ? (
            <button
              onClick={() => void openRepoPicker()}
              className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-3 hover:bg-zinc-800/60 transition-colors duration-150"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                <GitFork className="w-5 h-5 text-zinc-200" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">GitHub</p>
                <p className="text-[12px] text-zinc-500 truncate">Chat with a connected repo about its code</p>
              </div>
              <span className="text-[11px] text-emerald-400 shrink-0">Connected</span>
            </button>
          ) : (
            <a
              href={getGithubConnectUrl()}
              className="flex items-center gap-3 w-full text-left rounded-xl px-3 py-3 hover:bg-zinc-800/60 transition-colors duration-150"
            >
              <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center shrink-0">
                <GitFork className="w-5 h-5 text-zinc-200" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white">GitHub</p>
                <p className="text-[12px] text-zinc-500 truncate">Chat with a connected repo about its code</p>
              </div>
              <span className="w-7 h-7 rounded-full border border-zinc-600 flex items-center justify-center text-zinc-400 shrink-0">
                <Plus className="w-3.5 h-3.5" />
              </span>
            </a>
          )
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[12px] text-zinc-500">
                Connected as <span className="text-zinc-300">{username}</span>
              </p>
              <button
                onClick={handleDisconnect}
                disabled={isDisconnecting}
                className="flex items-center gap-1 text-[12px] text-zinc-500 hover:text-red-400 disabled:opacity-50 transition-colors duration-150"
              >
                {isDisconnecting ? <Spinner className="w-3 h-3" /> : <Unlink className="w-3 h-3" />}
                Disconnect
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1">
              {isLoadingRepos ? (
                [0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} borderRadius={12} />)
              ) : repos.length === 0 ? (
                <p className="text-sm text-zinc-500 py-4 text-center">No repositories found.</p>
              ) : (
                repos.map((repo) => (
                  <button
                    key={repo.id}
                    onClick={() => handleSelect(repo)}
                    disabled={!!selectingRepo}
                    className="flex items-center justify-between w-full text-left rounded-xl px-3 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50 transition-colors duration-150"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {repo.private && <Lock className="w-3 h-3 text-zinc-500 shrink-0" />}
                      <span className="truncate">{repo.full_name}</span>
                    </span>
                    {selectingRepo === repo.full_name && <Spinner className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                ))
              )}

              {!isLoadingRepos && hasMore && (
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="w-full text-center text-[12px] text-zinc-500 hover:text-zinc-300 py-2 transition-colors duration-150"
                >
                  {isLoadingMore ? 'Loading…' : 'Show more'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
