import { API_BASE_URL, api } from './axios';
import type { GithubConnection, GithubRepo, Paginated } from './types';

export const GITHUB_REPOS_PAGE_SIZE = 30;

// A full browser navigation, not a fetch — this kicks off GitHub's OAuth consent screen, which
// has to happen as a top-level page load (see PluginsPanel.tsx for where it's used).
//
// Passes this page's own origin through so the backend's /callback (routers/github.py) can send
// the browser back to the SAME origin it started from, rather than a fixed default — auth
// cookies are host-scoped, so landing on a different origin than the one you're logged in on
// (e.g. if you're testing via a LAN IP instead of localhost) would look like a broken session.
export function getGithubConnectUrl(): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${API_BASE_URL}/api/v1/github/connect?origin=${encodeURIComponent(origin)}`;
}

export async function getGithubConnection(): Promise<GithubConnection> {
  const res = await api.get<GithubConnection>('/api/v1/github/connection');
  return res.data;
}

export async function disconnectGithub(): Promise<void> {
  await api.delete('/api/v1/github/connection');
}

export async function listGithubRepos(page = 1): Promise<Paginated<GithubRepo>> {
  const res = await api.get<{ items: GithubRepo[]; has_more: boolean }>('/api/v1/github/repos', {
    params: { page, per_page: GITHUB_REPOS_PAGE_SIZE },
  });
  return res.data;
}
