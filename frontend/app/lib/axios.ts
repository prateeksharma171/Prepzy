import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const REFRESH_URL = '/api/v1/auth/refresh';
// Requests to these auth endpoints should surface their own 401s rather than
// trigger a silent refresh (refreshing off a failed login/signup makes no sense,
// and retrying the refresh call itself would recurse).
const NO_REFRESH_RETRY_URLS = ['/api/v1/auth/login', '/api/v1/auth/signup', '/api/v1/auth/google', REFRESH_URL];

let refreshPromise: Promise<unknown> | null = null;

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler;
}

export function notifyUnauthorized() {
  onUnauthorized?.();
}

// Shared by the axios interceptor below and by the raw-fetch SSE streaming client (which bypasses
// axios entirely): refresh tokens are rotated on use, so two parallel refresh calls would make the
// second one look like reuse of an already-consumed token and nuke every session.
export function refreshSession(): Promise<unknown> {
  if (!refreshPromise) {
    refreshPromise = api.post(REFRESH_URL).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;

    const shouldAttemptRefresh =
      error.response?.status === 401 &&
      !!originalRequest &&
      !originalRequest._retry &&
      !NO_REFRESH_RETRY_URLS.some((url) => originalRequest.url?.includes(url));

    if (!shouldAttemptRefresh || !originalRequest) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      await refreshSession();
      return api(originalRequest);
    } catch {
      notifyUnauthorized();
      return Promise.reject(error);
    }
  }
);

interface ErrorDetailItem {
  msg?: string;
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const detail = (error.response?.data as { detail?: string | ErrorDetailItem[] } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length > 0 && typeof detail[0]?.msg === 'string') {
      return detail[0].msg as string;
    }
  }
  return fallback;
}
