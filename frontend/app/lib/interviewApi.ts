import { fetchEventSource } from '@microsoft/fetch-event-source';
import { API_BASE_URL, api, notifyUnauthorized, refreshSession } from './axios';
import type { ConversationDetail, ConversationMode, ConversationSummary, MemoryProfile, Paginated } from './types';

export const CONVERSATIONS_PAGE_SIZE = 20;
export const MESSAGES_PAGE_SIZE = 20;

export async function listConversations(offset = 0, pinned?: boolean): Promise<Paginated<ConversationSummary>> {
  const res = await api.get<Paginated<ConversationSummary>>('/api/v1/interview/conversations', {
    params: { limit: CONVERSATIONS_PAGE_SIZE, offset, pinned },
  });
  return res.data;
}

export async function createConversation(
  title?: string,
  mode?: ConversationMode,
  repoFullName?: string
): Promise<ConversationSummary> {
  const res = await api.post<ConversationSummary>('/api/v1/interview/conversations', {
    title,
    mode,
    repo_full_name: repoFullName,
  });
  return res.data;
}

export async function setConversationPinned(id: string, pinned: boolean): Promise<ConversationSummary> {
  const res = await api.patch<ConversationSummary>(`/api/v1/interview/conversations/${id}`, { pinned });
  return res.data;
}

export async function getConversation(id: string, offset = 0): Promise<ConversationDetail> {
  const res = await api.get<ConversationDetail>(`/api/v1/interview/conversations/${id}`, {
    params: { limit: MESSAGES_PAGE_SIZE, offset },
  });
  return res.data;
}

export async function deleteConversation(id: string): Promise<void> {
  await api.delete(`/api/v1/interview/conversations/${id}`);
}

export async function getMemory(): Promise<MemoryProfile> {
  const res = await api.get<MemoryProfile>('/api/v1/interview/memory');
  return res.data;
}

export async function clearMemory(): Promise<void> {
  await api.delete('/api/v1/interview/memory');
}

interface StreamHandlers {
  onToken: (chunk: string) => void;
  onDone: (messageId: string | null) => void;
  onError: (message: string) => void;
}

const UNAVAILABLE_MESSAGE = 'The interview coach is temporarily unavailable. Please try again.';

// Thrown from `onopen` to tell the catch block below "refresh the session and retry once,"
// as opposed to any other error, which just surfaces UNAVAILABLE_MESSAGE.
class UnauthorizedStreamError extends Error {}

/**
 * Streams a coach reply over Server-Sent Events using `@microsoft/fetch-event-source` (plain
 * `EventSource` can't send a POST body or custom headers, which this endpoint needs). Shares the
 * same cookie-refresh flow as the axios interceptor, so an expired access token during a chat send
 * behaves the same as everywhere else in the app: one silent refresh + retry, then sign the user
 * out if that still fails.
 */
export async function streamMessage(
  conversationId: string,
  content: string,
  handlers: StreamHandlers
): Promise<void> {
  const url = `${API_BASE_URL}/api/v1/interview/conversations/${conversationId}/messages`;
  let finished = false;

  const attempt = () =>
    fetchEventSource(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
      // Keep streaming even if the user switches tabs mid-reply — the default behavior pauses
      // (and eventually drops) the connection when the page isn't visible, which would silently
      // stall a reply that's still generating in the background.
      openWhenHidden: true,
      async onopen(response) {
        if (response.ok) return;
        if (response.status === 401) throw new UnauthorizedStreamError();
        throw new Error(`Unexpected response ${response.status}`);
      },
      onmessage(event) {
        const payload = JSON.parse(event.data) as
          | { type: 'token'; content: string }
          | { type: 'done'; message_id: string | null }
          | { type: 'error'; content: string };

        if (payload.type === 'token') handlers.onToken(payload.content);
        else if (payload.type === 'done') {
          finished = true;
          handlers.onDone(payload.message_id);
        } else if (payload.type === 'error') {
          finished = true;
          handlers.onError(payload.content);
        }
      },
      onclose() {
        // The server closed the connection without ever sending a "done"/"error" event (e.g. it
        // crashed mid-stream) — without this, the UI would be stuck showing "streaming" forever.
        if (!finished) {
          finished = true;
          handlers.onError(UNAVAILABLE_MESSAGE);
        }
      },
      onerror(err) {
        // Rethrowing stops fetch-event-source's built-in retry-forever behavior and rejects the
        // promise instead — we want one explicit retry (on 401) or a surfaced error, not silent
        // infinite reconnect attempts in the background.
        throw err;
      },
    });

  try {
    await attempt();
  } catch (err) {
    if (finished) return;
    if (err instanceof UnauthorizedStreamError) {
      try {
        await refreshSession();
        await attempt();
      } catch {
        if (!finished) {
          notifyUnauthorized();
          handlers.onError('Your session expired. Please sign in again.');
        }
      }
      return;
    }
    if (!finished) handlers.onError(UNAVAILABLE_MESSAGE);
  }
}
