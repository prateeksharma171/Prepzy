"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "./AuthContext";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  setConversationPinned,
  streamMessage,
} from "../lib/interviewApi";
import type { ChatMessage, ConversationSummary } from "../lib/types";

export interface DisplayMessage extends ChatMessage {
  isStreaming?: boolean;
  isError?: boolean;
}

interface ChatContextValue {
  conversations: ConversationSummary[];
  isLoadingConversations: boolean;
  hasMoreConversations: boolean;
  loadMoreConversations: () => Promise<void>;
  pinnedConversations: ConversationSummary[];
  isLoadingPinnedConversations: boolean;
  hasMorePinnedConversations: boolean;
  loadMorePinnedConversations: () => Promise<void>;
  togglePinned: (id: string, pinned: boolean) => Promise<void>;
  activeConversationId: string | null;
  activeMessages: DisplayMessage[];
  isLoadingActiveConversation: boolean;
  hasMoreMessages: boolean;
  loadOlderMessages: () => Promise<void>;
  isStreaming: boolean;
  startNewChat: () => void;
  startMockInterview: () => Promise<void>;
  startResumeReview: () => Promise<void>;
  startProjectQuestions: () => Promise<void>;
  startCodeExplanation: () => Promise<void>;
  startWeaknessDetection: () => Promise<void>;
  startGithubRepoChat: (repoFullName: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

let localIdCounter = 0;
function nextLocalId(prefix: string) {
  localIdCounter += 1;
  return `${prefix}-${localIdCounter}`;
}

/**
 * Mount this once per signed-in identity — the caller (Dashboard) passes `key={user?.id}` so a
 * sign-out or account switch remounts the whole provider with fresh state, instead of this
 * component manually clearing each piece of state itself (React's own recommended pattern for
 * "reset all state when an identity changes": https://react.dev/learn/you-might-not-need-an-effect).
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const router = useRouter();

  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingConversations, setIsLoadingConversations] = useState(
    () => !!user,
  );
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  // How many conversations have been loaded so far — the offset for the next page. A ref
  // (not state) since it's only ever read inside `loadMoreConversations`, never rendered.
  const conversationsOffsetRef = useRef(0);

  // Same shape as the above, for the "Pinned" section — a separate server-filtered list
  // (`pinned=true` vs `pinned=false`) rather than a client-side split of one list, so each
  // section paginates independently.
  const [pinnedConversations, setPinnedConversations] = useState<ConversationSummary[]>([]);
  const [isLoadingPinnedConversations, setIsLoadingPinnedConversations] = useState(
    () => !!user,
  );
  const [hasMorePinnedConversations, setHasMorePinnedConversations] = useState(false);
  const pinnedOffsetRef = useRef(0);

  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [activeMessages, setActiveMessages] = useState<DisplayMessage[]>([]);
  const [isLoadingActiveConversation, setIsLoadingActiveConversation] =
    useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(false);
  // Same idea as conversationsOffsetRef, but for the active conversation's messages —
  // reset whenever the active conversation changes (selectConversation/startNewChat).
  const messagesOffsetRef = useRef(0);
  const [isStreaming, setIsStreaming] = useState(false);

  // Guards against a slow, stale request (e.g. from a conversation the user already navigated
  // away from) overwriting state for whatever conversation is active by the time it resolves.
  const activeRequestId = useRef(0);

  const refreshConversations = useCallback(async () => {
    try {
      const [unpinnedPage, pinnedPage] = await Promise.all([
        listConversations(0, false),
        listConversations(0, true),
      ]);
      conversationsOffsetRef.current = unpinnedPage.items.length;
      setConversations(unpinnedPage.items);
      setHasMoreConversations(unpinnedPage.has_more);

      pinnedOffsetRef.current = pinnedPage.items.length;
      setPinnedConversations(pinnedPage.items);
      setHasMorePinnedConversations(pinnedPage.has_more);
    } catch {
      // A 401 here means the axios interceptor's silent refresh (see axios.ts) already failed
      // and called notifyUnauthorized() — AuthContext has already dropped the user and the
      // sign-in dialog is showing. Without this catch, callers that fire this off with `void`
      // (below, and sendMessage's onDone) turn that into an unhandled rejection for no reason.
    } finally {
      setIsLoadingConversations(false);
      setIsLoadingPinnedConversations(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void refreshConversations();
    }
  }, [user, refreshConversations]);

  const loadMoreConversations = useCallback(async () => {
    const page = await listConversations(conversationsOffsetRef.current, false);
    conversationsOffsetRef.current += page.items.length;
    setConversations((prev) => [...prev, ...page.items]);
    setHasMoreConversations(page.has_more);
  }, []);

  const loadMorePinnedConversations = useCallback(async () => {
    const page = await listConversations(pinnedOffsetRef.current, true);
    pinnedOffsetRef.current += page.items.length;
    setPinnedConversations((prev) => [...prev, ...page.items]);
    setHasMorePinnedConversations(page.has_more);
  }, []);

  const startNewChat = useCallback(() => {
    activeRequestId.current += 1;
    setActiveConversationId(null);
    setActiveMessages([]);
    messagesOffsetRef.current = 0;
    setHasMoreMessages(false);
  }, []);

  const startMockInterview = useCallback(async () => {
    if (isStreaming) return;
    const created = await createConversation(undefined, "mock_interview");
    setConversations((prev) => [created, ...prev]);
    // Deliberately not setting activeConversationId/activeMessages here — RouteSync (Dashboard.tsx)
    // sees the URL change to an id it doesn't recognize as active and calls selectConversation(id)
    // itself, which fetches and displays the seeded opening question through the same path any
    // other conversation load uses (loading skeleton included), instead of duplicating that fetch.
    router.push(`/chat/${created.id}`);
  }, [isStreaming, router]);

  const startResumeReview = useCallback(async () => {
    if (isStreaming) return;
    const created = await createConversation(undefined, "resume_review");
    setConversations((prev) => [created, ...prev]);
    // Same reasoning as startMockInterview above — let RouteSync's existing selectConversation
    // call fetch and display the seeded opening message instead of duplicating that fetch here.
    router.push(`/chat/${created.id}`);
  }, [isStreaming, router]);

  const startProjectQuestions = useCallback(async () => {
    if (isStreaming) return;
    const created = await createConversation(undefined, "project_questions");
    setConversations((prev) => [created, ...prev]);
    // Same reasoning as startMockInterview above — let RouteSync's existing selectConversation
    // call fetch and display the seeded opening message instead of duplicating that fetch here.
    router.push(`/chat/${created.id}`);
  }, [isStreaming, router]);

  const startCodeExplanation = useCallback(async () => {
    if (isStreaming) return;
    const created = await createConversation(undefined, "code_explanation");
    setConversations((prev) => [created, ...prev]);
    // Same reasoning as startMockInterview above — let RouteSync's existing selectConversation
    // call fetch and display the seeded opening message instead of duplicating that fetch here.
    router.push(`/chat/${created.id}`);
  }, [isStreaming, router]);

  const startWeaknessDetection = useCallback(async () => {
    if (isStreaming) return;
    const created = await createConversation(undefined, "weakness_detection");
    setConversations((prev) => [created, ...prev]);
    // Same reasoning as startMockInterview above — let RouteSync's existing selectConversation
    // call fetch and display the seeded opening message instead of duplicating that fetch here.
    router.push(`/chat/${created.id}`);
  }, [isStreaming, router]);

  const startGithubRepoChat = useCallback(
    async (repoFullName: string) => {
      if (isStreaming) return;
      const created = await createConversation(undefined, "github_repo", repoFullName);
      setConversations((prev) => [created, ...prev]);
      // Same reasoning as startMockInterview above — let RouteSync's existing selectConversation
      // call fetch and display the seeded opening message instead of duplicating that fetch here.
      router.push(`/chat/${created.id}`);
    },
    [isStreaming, router],
  );

  const selectConversation = useCallback(
    async (id: string) => {
      const requestId = ++activeRequestId.current;
      setActiveConversationId(id);
      setIsLoadingActiveConversation(true);
      try {
        const detail = await getConversation(id, 0);
        if (activeRequestId.current === requestId) {
          setActiveMessages(detail.messages.items);
          messagesOffsetRef.current = detail.messages.items.length;
          setHasMoreMessages(detail.messages.has_more);
        }
      } catch {
        // Deleted, not owned, or a malformed id (e.g. a stale/foreign bookmarked link) —
        // fall back to the new-chat state instead of leaving a broken/half-loaded conversation.
        if (activeRequestId.current === requestId) {
          setActiveConversationId(null);
          setActiveMessages([]);
          setHasMoreMessages(false);
          router.replace("/");
        }
      } finally {
        if (activeRequestId.current === requestId) {
          setIsLoadingActiveConversation(false);
        }
      }
    },
    [router],
  );

  const loadOlderMessages = useCallback(async () => {
    const id = activeConversationId;
    if (!id) return;
    const requestId = activeRequestId.current;
    const detail = await getConversation(id, messagesOffsetRef.current);
    if (activeRequestId.current !== requestId) return; // navigated away mid-fetch
    messagesOffsetRef.current += detail.messages.items.length;
    setHasMoreMessages(detail.messages.has_more);
    setActiveMessages((prev) => [...detail.messages.items, ...prev]);
  }, [activeConversationId]);

  const removeConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id);
      // The deleted chat could be in either list — filtering both is a no-op on whichever one
      // didn't have it. Keep each list's next-page offset correct: the deleted row no longer
      // shifts everything after it up by one on the server for whichever list actually had it.
      setConversations((prev) => {
        if (prev.some((c) => c.id === id)) {
          conversationsOffsetRef.current = Math.max(conversationsOffsetRef.current - 1, 0);
        }
        return prev.filter((c) => c.id !== id);
      });
      setPinnedConversations((prev) => {
        if (prev.some((c) => c.id === id)) {
          pinnedOffsetRef.current = Math.max(pinnedOffsetRef.current - 1, 0);
        }
        return prev.filter((c) => c.id !== id);
      });
      if (activeConversationId === id) {
        // RouteSync resets ChatContext state once the URL actually becomes `/`.
        router.push("/");
      }
    },
    [activeConversationId, router],
  );

  const togglePinned = useCallback(async (id: string, pinned: boolean) => {
    const updated = await setConversationPinned(id, pinned);
    if (pinned) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      conversationsOffsetRef.current = Math.max(conversationsOffsetRef.current - 1, 0);
      setPinnedConversations((prev) => [updated, ...prev]);
    } else {
      setPinnedConversations((prev) => prev.filter((c) => c.id !== id));
      pinnedOffsetRef.current = Math.max(pinnedOffsetRef.current - 1, 0);
      setConversations((prev) => [updated, ...prev]);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      // Re-entrancy guard + setting the flag as the very first synchronous statement (before any
      // `await`) matters: MessageInput/ChatArea disable themselves off this same flag, and if it
      // only flipped true after `createConversation()` resolved, a rapid double-tap on a brand-new
      // chat would race through and create two conversations before the button ever disabled.
      if (isStreaming) return;
      setIsStreaming(true);

      // Show the user's message and a streaming placeholder immediately — this is what
      // actually flips ChatArea from the welcome screen to the message view (it keys off
      // activeMessages, not the route), so it must not wait on the network. For a brand-new
      // chat, that network call (createConversation, below) hasn't even started yet.
      const userMessage: DisplayMessage = {
        id: nextLocalId("user"),
        role: "user",
        content,
        created_at: new Date().toISOString(),
      };
      const assistantId = nextLocalId("assistant");
      const assistantPlaceholder: DisplayMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        created_at: new Date().toISOString(),
        isStreaming: true,
      };
      setActiveMessages((prev) => [...prev, userMessage, assistantPlaceholder]);

      let conversationId = activeConversationId;

      if (!conversationId) {
        try {
          const created = await createConversation();
          conversationId = created.id;
          setActiveConversationId(created.id);
          setConversations((prev) => [created, ...prev]);
          // Replace (not push): the blank new-chat screen isn't a navigation the user would
          // want to undo via back — it's the same screen just acquiring an identity.
          router.replace(`/chat/${created.id}`);
        } catch {
          setIsStreaming(false);
          setActiveMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: "Could not start a new session. Please try again.",
                    isStreaming: false,
                    isError: true,
                  }
                : m,
            ),
          );
          return;
        }
      }

      const updateAssistant = (
        updater: (msg: DisplayMessage) => DisplayMessage,
      ) => {
        setActiveMessages((prev) =>
          prev.map((m) => (m.id === assistantId ? updater(m) : m)),
        );
      };

      await streamMessage(conversationId, content, {
        onToken: (chunk) => {
          updateAssistant((m) => ({ ...m, content: m.content + chunk }));
        },
        onDone: (messageId) => {
          updateAssistant((m) => ({
            ...m,
            id: messageId ?? m.id,
            isStreaming: false,
          }));
          setIsStreaming(false);
          void refreshConversations();
        },
        onError: (message) => {
          updateAssistant((m) => ({
            ...m,
            content: message,
            isStreaming: false,
            isError: true,
          }));
          setIsStreaming(false);
        },
      });
    },
    [activeConversationId, isStreaming, refreshConversations, router],
  );

  const value = useMemo<ChatContextValue>(
    () => ({
      conversations,
      isLoadingConversations,
      hasMoreConversations,
      loadMoreConversations,
      pinnedConversations,
      isLoadingPinnedConversations,
      hasMorePinnedConversations,
      loadMorePinnedConversations,
      togglePinned,
      activeConversationId,
      activeMessages,
      isLoadingActiveConversation,
      hasMoreMessages,
      loadOlderMessages,
      isStreaming,
      startNewChat,
      startMockInterview,
      startResumeReview,
      startProjectQuestions,
      startCodeExplanation,
      startWeaknessDetection,
      startGithubRepoChat,
      selectConversation,
      removeConversation,
      sendMessage,
    }),
    [
      conversations,
      isLoadingConversations,
      hasMoreConversations,
      loadMoreConversations,
      pinnedConversations,
      isLoadingPinnedConversations,
      hasMorePinnedConversations,
      loadMorePinnedConversations,
      togglePinned,
      activeConversationId,
      activeMessages,
      isLoadingActiveConversation,
      hasMoreMessages,
      loadOlderMessages,
      isStreaming,
      startNewChat,
      startMockInterview,
      startResumeReview,
      startProjectQuestions,
      startCodeExplanation,
      startWeaknessDetection,
      startGithubRepoChat,
      selectConversation,
      removeConversation,
      sendMessage,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return ctx;
}
