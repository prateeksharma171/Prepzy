"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  MessageSquarePlus,
  Trash2,
  Pin,
  PinOff,
  Mic,
  FileCheck2,
  FolderGit2,
  FileCode2,
  Target,
  Puzzle,
  Sparkles,
  User,
  LogOut,
  MessageSquareText,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import Menu, { MenuItem } from "rc-menu";
import { Collapse } from "react-collapse";
import { List, type RowComponentProps } from "react-window";
import Skeleton from "react-loading-skeleton";
import type { ConversationSummary } from "../lib/types";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import Spinner from "./Spinner";
import FeedbackDialog from "./FeedbackDialog";
import AdminPanel from "./admin/AdminPanel";

// Rows are absolutely positioned by react-window at exactly this height; the button inside
// renders a few px shorter to leave a visual gap, so this doubles as the row pitch.
const CHAT_ROW_HEIGHT = 44;
// Fixed height of the "Chats" toggle row above the list, subtracted from the measured
// container so the virtualized list's height matches the space actually left for it.
const CHATS_HEADER_HEIGHT = 28;
// Mirrors the backend's `DEFAULT_TITLE`/`MOCK_INTERVIEW_DEFAULT_TITLE` (interview_service.py) — a
// conversation still has one of these exact titles until its first user message is saved, at
// which point the backend renames it to a preview of that message. Shown as a loading placeholder
// instead of this literal text.
const PENDING_CONVERSATION_TITLES = new Set([
  "New interview prep session",
  "Mock interview session",
  "Resume review session",
  "Project Q&A session",
  "Code explanation session",
  "Weakness detection session",
]);

// The title-or-skeleton + hover actions shared by both the virtualized "Chats" row (react-window,
// for the potentially-large unpinned list) and the plain mapped "Pinned" row (a short list, not
// worth virtualizing) — kept as one component so the two lists can't visually drift apart.
interface ConversationRowContentProps {
  chat: ConversationSummary;
  isDeleting: boolean;
  isPinning: boolean;
  isHovered: boolean;
  onTogglePin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

function ConversationRowContent({
  chat,
  isDeleting,
  isPinning,
  isHovered,
  onTogglePin,
  onDelete,
}: ConversationRowContentProps) {
  return (
    <div className="flex items-center justify-between gap-2 w-full">
      {PENDING_CONVERSATION_TITLES.has(chat.title) ? (
        <Skeleton
          width={120}
          height={12}
          borderRadius={4}
          containerClassName="leading-none"
        />
      ) : (
        <span className="truncate">{chat.title}</span>
      )}
      {isDeleting ? (
        <span className="p-1 shrink-0">
          <Spinner className="w-3.5 h-3.5" />
        </span>
      ) : (
        isHovered && (
          <span className="flex items-center gap-0.5 shrink-0">
            {isPinning ? (
              <span className="p-1">
                <Spinner className="w-3.5 h-3.5" />
              </span>
            ) : (
              <span
                role="button"
                onClick={onTogglePin}
                className="p-1 rounded-md hover:bg-zinc-700 transition-colors duration-150"
                title={chat.pinned ? "Unpin chat" : "Pin chat"}
              >
                {chat.pinned ? (
                  <PinOff className="w-3.5 h-3.5" />
                ) : (
                  <Pin className="w-3.5 h-3.5" />
                )}
              </span>
            )}
            <span
              role="button"
              onClick={onDelete}
              className="p-1 rounded-md hover:bg-zinc-700 transition-colors duration-150"
              title="Delete chat"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </span>
          </span>
        )
      )}
    </div>
  );
}

interface ChatRowProps {
  conversations: ConversationSummary[];
  isLoadingMore: boolean;
  activeConversationId: string | null;
  deletingId: string | null;
  pinningId: string | null;
  hoveredId: string | null;
  onSelect: (id: string) => void;
  onHoverStart: (id: string) => void;
  onHoverEnd: () => void;
  onDelete: (e: React.MouseEvent, id: string) => void;
  onTogglePin: (e: React.MouseEvent, id: string, pinned: boolean) => void;
}

function ChatRow({
  index,
  style,
  ariaAttributes,
  conversations,
  isLoadingMore,
  activeConversationId,
  deletingId,
  pinningId,
  hoveredId,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onDelete,
  onTogglePin,
}: RowComponentProps<ChatRowProps>) {
  const rowStyle = {
    ...style,
    height: typeof style.height === "number" ? style.height - 4 : style.height,
  };

  // A synthetic row appended past the real data while the next page is loading — rendered
  // through the same virtualized list (rather than as a sibling below it) so it shows up
  // in-line at the bottom of the scrollable content, not as a fixed footer under a list
  // that already claims a fixed height for its own internal scrolling.
  if (isLoadingMore && index === conversations.length) {
    return (
      <div
        {...ariaAttributes}
        style={rowStyle}
        className="flex items-center px-3"
      >
        <Skeleton height={20} borderRadius={8} containerClassName="w-full" />
      </div>
    );
  }

  const chat = conversations[index];
  const isActive = chat.id === activeConversationId;
  const isDeleting = deletingId === chat.id;
  return (
    <button
      {...ariaAttributes}
      style={rowStyle}
      onClick={() => !isDeleting && onSelect(chat.id)}
      onMouseEnter={() => onHoverStart(chat.id)}
      onMouseLeave={onHoverEnd}
      disabled={isDeleting}
      className={`
        flex items-center text-left rounded-xl text-sm px-3
        transition-all duration-200 ease-out
        ${isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}
        ${isDeleting ? "opacity-50" : ""}
      `}
    >
      <ConversationRowContent
        chat={chat}
        isDeleting={isDeleting}
        isPinning={pinningId === chat.id}
        isHovered={hoveredId === chat.id}
        onTogglePin={(e) => onTogglePin(e, chat.id, !chat.pinned)}
        onDelete={(e) => onDelete(e, chat.id)}
      />
    </button>
  );
}

interface PinnedRowProps {
  chat: ConversationSummary;
  isActive: boolean;
  isDeleting: boolean;
  isPinning: boolean;
  isHovered: boolean;
  onSelect: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
  onTogglePin: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}

// Plain (non-virtualized) row for the Pinned section — pinned lists are expected to stay short,
// so a second react-window instance (with its own height measurement) isn't worth the complexity.
function PinnedRow({
  chat,
  isActive,
  isDeleting,
  isPinning,
  isHovered,
  onSelect,
  onHoverStart,
  onHoverEnd,
  onTogglePin,
  onDelete,
}: PinnedRowProps) {
  return (
    <button
      onClick={() => !isDeleting && onSelect()}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
      disabled={isDeleting}
      style={{ height: CHAT_ROW_HEIGHT - 4 }}
      className={`
        flex items-center text-left rounded-xl text-sm px-3 w-full shrink-0
        transition-all duration-200 ease-out
        ${isActive ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200"}
        ${isDeleting ? "opacity-50" : ""}
      `}
    >
      <ConversationRowContent
        chat={chat}
        isDeleting={isDeleting}
        isPinning={isPinning}
        isHovered={isHovered}
        onTogglePin={onTogglePin}
        onDelete={onDelete}
      />
    </button>
  );
}

interface ToolMenuItem {
  key: string;
  icon: LucideIcon;
  label: string;
}

const TOOL_MENU_ITEMS: ToolMenuItem[] = [
  { key: "mock-interview", icon: Mic, label: "Mock Interview" },
  { key: "resume-review", icon: FileCheck2, label: "Resume Talking Points" },
  { key: "project-questions", icon: FolderGit2, label: "Project Questions" },
  { key: "code-explanation", icon: FileCode2, label: "Code Explanation" },
  { key: "weakness-detection", icon: Target, label: "Weakness Detection" },
];

interface SidebarProps {
  onOpenPlugins: () => void;
  onNavigate?: () => void;
}

export default function Sidebar({ onOpenPlugins, onNavigate }: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pinningId, setPinningId] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isStartingMockInterview, setIsStartingMockInterview] = useState(false);
  const [isStartingResumeReview, setIsStartingResumeReview] = useState(false);
  const [isStartingProjectQuestions, setIsStartingProjectQuestions] =
    useState(false);
  const [isStartingCodeExplanation, setIsStartingCodeExplanation] =
    useState(false);
  const [isStartingWeaknessDetection, setIsStartingWeaknessDetection] =
    useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isAdminOpen, setIsAdminOpen] = useState(false);
  const [isChatsOpen, setIsChatsOpen] = useState(true);
  const [isPinnedOpen, setIsPinnedOpen] = useState(true);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);
  const listAreaRef = useRef<HTMLDivElement>(null);
  const [listAreaSize, setListAreaSize] = useState({ width: 0, height: 0 });
  const router = useRouter();
  const { user, isLoading, logout, openAuthDialog } = useAuth();
  const {
    conversations,
    isLoadingConversations,
    hasMoreConversations,
    loadMoreConversations,
    pinnedConversations,
    hasMorePinnedConversations,
    loadMorePinnedConversations,
    togglePinned,
    activeConversationId,
    removeConversation,
    startMockInterview,
    startResumeReview,
    startProjectQuestions,
    startCodeExplanation,
    startWeaknessDetection,
  } = useChat();

  // Measures the list's own flex-sized box (fixed by the sidebar's layout, independent of
  // react-collapse's animated child height below it) so react-window's <List> — which needs
  // an explicit pixel height rather than "fill remaining space" — gets a stable number.
  useLayoutEffect(() => {
    const el = listAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setListAreaSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isUserMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isUserMenuOpen]);

  useEffect(() => {
    if (!isToolsMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        toolsMenuRef.current &&
        !toolsMenuRef.current.contains(e.target as Node)
      ) {
        setIsToolsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [isToolsMenuOpen]);

  const handleDelete = useCallback(
    async (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      if (deletingId) return; // one delete in flight at a time is plenty, and avoids double-firing on the same row
      setDeletingId(id);
      try {
        await removeConversation(id);
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId, removeConversation],
  );

  const handleTogglePin = useCallback(
    async (e: React.MouseEvent, id: string, pinned: boolean) => {
      e.stopPropagation();
      if (pinningId) return; // one pin toggle in flight at a time, same guard as handleDelete
      setPinningId(id);
      try {
        await togglePinned(id, pinned);
      } finally {
        setPinningId(null);
      }
    },
    [pinningId, togglePinned],
  );

  const handleStartMockInterview = useCallback(async () => {
    if (isStartingMockInterview) return;
    setIsStartingMockInterview(true);
    try {
      await startMockInterview();
    } finally {
      setIsStartingMockInterview(false);
    }
  }, [isStartingMockInterview, startMockInterview]);

  const handleStartResumeReview = useCallback(async () => {
    if (isStartingResumeReview) return;
    setIsStartingResumeReview(true);
    try {
      await startResumeReview();
    } finally {
      setIsStartingResumeReview(false);
    }
  }, [isStartingResumeReview, startResumeReview]);

  const handleStartProjectQuestions = useCallback(async () => {
    if (isStartingProjectQuestions) return;
    setIsStartingProjectQuestions(true);
    try {
      await startProjectQuestions();
    } finally {
      setIsStartingProjectQuestions(false);
    }
  }, [isStartingProjectQuestions, startProjectQuestions]);

  const handleStartCodeExplanation = useCallback(async () => {
    if (isStartingCodeExplanation) return;
    setIsStartingCodeExplanation(true);
    try {
      await startCodeExplanation();
    } finally {
      setIsStartingCodeExplanation(false);
    }
  }, [isStartingCodeExplanation, startCodeExplanation]);

  const handleStartWeaknessDetection = useCallback(async () => {
    if (isStartingWeaknessDetection) return;
    setIsStartingWeaknessDetection(true);
    try {
      await startWeaknessDetection();
    } finally {
      setIsStartingWeaknessDetection(false);
    }
  }, [isStartingWeaknessDetection, startWeaknessDetection]);

  const isStartingAnyTool =
    isStartingMockInterview ||
    isStartingResumeReview ||
    isStartingProjectQuestions ||
    isStartingCodeExplanation ||
    isStartingWeaknessDetection;

  const handleToolsMenuClick = useCallback(
    (info: { key: string }) => {
      setIsToolsMenuOpen(false);
      switch (info.key) {
        case "mock-interview":
          void handleStartMockInterview();
          break;
        case "resume-review":
          void handleStartResumeReview();
          break;
        case "project-questions":
          void handleStartProjectQuestions();
          break;
        case "code-explanation":
          void handleStartCodeExplanation();
          break;
        case "weakness-detection":
          void handleStartWeaknessDetection();
          break;
      }
      onNavigate?.();
    },
    [
      handleStartMockInterview,
      handleStartResumeReview,
      handleStartProjectQuestions,
      handleStartCodeExplanation,
      handleStartWeaknessDetection,
      onNavigate,
    ],
  );

  const handleSelectChat = useCallback(
    (id: string) => {
      router.push(`/chat/${id}`);
      onNavigate?.();
    },
    [router, onNavigate],
  );
  const handleHoverStart = useCallback((id: string) => setHoveredId(id), []);
  const handleHoverEnd = useCallback(() => setHoveredId(null), []);

  // react-window's onRowsRendered has no built-in "only once per page, show a loader
  // meanwhile" behavior (unlike react-infinite-scroll-component) — this state fills both
  // gaps: it guards against re-triggering while a fetch is in flight, and doubles as the
  // flag that appends the loading skeleton row (see ChatRow) at the end of the list.
  const [isLoadingMoreConversations, setIsLoadingMoreConversations] =
    useState(false);

  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      if (!hasMoreConversations || isLoadingMoreConversations) return;
      if (visibleRows.stopIndex >= conversations.length - 1) {
        setIsLoadingMoreConversations(true);
        void loadMoreConversations().finally(() =>
          setIsLoadingMoreConversations(false),
        );
      }
    },
    [
      hasMoreConversations,
      isLoadingMoreConversations,
      conversations.length,
      loadMoreConversations,
    ],
  );

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsUserMenuOpen(false);
    setIsLoggingOut(true);
    try {
      await logout();
    } finally {
      setIsLoggingOut(false);
    }
  };

  const handleUserMenuClick = (info: { key: string }) => {
    setIsUserMenuOpen(false);
    switch (info.key) {
      case "feedback":
        setIsFeedbackOpen(true);
        break;
      case "admin":
        setIsAdminOpen(true);
        break;
      case "logout":
        void handleLogout();
        break;
    }
    onNavigate?.();
  };

  return (
    <aside className="w-65 h-full flex flex-col bg-[#171717] text-zinc-300 border-r border-zinc-800">
      {/* Top Section */}
      <div className="flex items-center p-3 h-14">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-400" />
          <span className="text-sm font-semibold text-white tracking-wide">
            Interview Coach
          </span>
        </div>
      </div>

      {/* New Chat Button */}
      <div className="px-3 mb-2">
        <button
          onClick={() => {
            router.push("/");
            onNavigate?.();
          }}
          className="flex items-center gap-2 w-full rounded-xl border border-zinc-700 hover:border-zinc-500 px-3 py-2.5 text-sm transition-all duration-200 ease-out hover:bg-zinc-800 active:scale-[0.98]"
        >
          <MessageSquarePlus className="w-4 h-4 shrink-0" />
          <span>New chat</span>
        </button>
      </div>

      {/* Plugins */}
      <div className="px-2 mb-2">
        <button
          onClick={() => {
            onOpenPlugins();
            onNavigate?.();
          }}
          style={{ height: CHAT_ROW_HEIGHT - 4 }}
          className="flex items-center gap-3 w-full rounded-xl px-3 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-all duration-200 ease-out"
        >
          <Puzzle className="w-4 h-4 shrink-0" />
          <span className="truncate flex-1 text-left">Plugins</span>
        </button>
      </div>

      {/* Tools */}
      <div className="px-2 mb-2 relative" ref={toolsMenuRef}>
        <button
          onClick={() => setIsToolsMenuOpen((open) => !open)}
          disabled={isStartingAnyTool}
          style={{ height: CHAT_ROW_HEIGHT - 4 }}
          className="flex items-center gap-3 w-full rounded-xl px-3 text-sm text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-all duration-200 ease-out disabled:opacity-50"
        >
          {isStartingAnyTool ? (
            <Spinner className="w-4 h-4 shrink-0" />
          ) : (
            <Wrench className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate flex-1 text-left">Tools</span>
        </button>

        {isToolsMenuOpen && (
          // Below `lg` the sidebar is a fixed-width mobile drawer with no room to spare, so the
          // menu drops down and matches the drawer's width there; only at `lg`+ (where Sidebar
          // renders next to open canvas, see Dashboard.tsx) does it flyout to the side with an arrow.
          <div
            className="
              absolute z-10 top-full left-0 right-0 mt-3 animate-slideDown
              lg:top-1/2 lg:-translate-y-1/2 lg:left-full lg:right-auto lg:mt-0 lg:ml-3 lg:w-56 lg:animate-slideInRight
            "
          >
            <div
              className="
                absolute left-4 -top-1 w-2.5 h-2.5 bg-zinc-900 border-t border-l border-zinc-700 rotate-45
                lg:-left-1 lg:top-1/2 lg:-translate-y-1/2 lg:border-t-0 lg:border-b lg:border-l
              "
            />
            <Menu
              selectable={false}
              onClick={handleToolsMenuClick}
              className="relative bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1 text-sm"
            >
              {TOOL_MENU_ITEMS.map(({ key, icon: Icon, label }) => (
                <MenuItem
                  key={key}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-300 cursor-pointer hover:bg-zinc-800 transition-colors duration-150"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </MenuItem>
              ))}
            </Menu>
          </div>
        )}
      </div>

      {/* Conversation Lists */}
      <div className="flex-1 min-h-0 flex flex-col px-2">
        {pinnedConversations.length > 0 && (
          <div className="mb-2 shrink-0">
            <button
              onClick={() => setIsPinnedOpen((open) => !open)}
              className="flex items-center justify-between w-full h-6 px-2 mb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors duration-150"
            >
              <span>Pinned</span>
              <ChevronDown
                className={`w-3.5 h-3.5 transition-transform duration-200 ${isPinnedOpen ? "" : "-rotate-90"}`}
              />
            </button>

            <Collapse isOpened={isPinnedOpen}>
              <div className="max-h-56 overflow-y-auto space-y-1">
                {pinnedConversations.map((chat) => (
                  <PinnedRow
                    key={chat.id}
                    chat={chat}
                    isActive={chat.id === activeConversationId}
                    isDeleting={deletingId === chat.id}
                    isPinning={pinningId === chat.id}
                    isHovered={hoveredId === chat.id}
                    onSelect={() => handleSelectChat(chat.id)}
                    onHoverStart={() => handleHoverStart(chat.id)}
                    onHoverEnd={handleHoverEnd}
                    onTogglePin={(e) =>
                      handleTogglePin(e, chat.id, !chat.pinned)
                    }
                    onDelete={(e) => handleDelete(e, chat.id)}
                  />
                ))}
                {hasMorePinnedConversations && (
                  <button
                    onClick={() => void loadMorePinnedConversations()}
                    className="w-full text-center text-[12px] text-zinc-500 hover:text-zinc-300 py-1.5 transition-colors duration-150"
                  >
                    Show more
                  </button>
                )}
              </div>
            </Collapse>
          </div>
        )}

        <div ref={listAreaRef} className="flex-1 min-h-0 overflow-hidden">
          <button
            onClick={() => setIsChatsOpen((open) => !open)}
            className="flex items-center justify-between w-full h-6 px-2 mb-1 text-[11px] font-medium text-zinc-500 uppercase tracking-wider hover:text-zinc-300 transition-colors duration-150"
          >
            <span>Chats</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isChatsOpen ? "" : "-rotate-90"}`}
            />
          </button>

          <Collapse isOpened={isChatsOpen}>
            {isLoadingConversations && conversations.length === 0 && (
              <div className="space-y-2 px-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} height={36} borderRadius={12} />
                ))}
              </div>
            )}

            {!isLoadingConversations && conversations.length === 0 && (
              <p className="px-3 py-2 text-[13px] text-zinc-500">
                No chats yet — start one below.
              </p>
            )}

            {conversations.length > 0 && (
              <List
                style={{
                  height: Math.max(
                    listAreaSize.height - CHATS_HEADER_HEIGHT,
                    0,
                  ),
                  width: listAreaSize.width,
                }}
                rowCount={
                  conversations.length + (isLoadingMoreConversations ? 1 : 0)
                }
                rowHeight={CHAT_ROW_HEIGHT}
                rowKey={(index, data) =>
                  index < data.conversations.length
                    ? data.conversations[index].id
                    : "loading-more"
                }
                overscanCount={6}
                onRowsRendered={handleRowsRendered}
                rowComponent={ChatRow}
                rowProps={{
                  conversations,
                  isLoadingMore: isLoadingMoreConversations,
                  activeConversationId,
                  deletingId,
                  pinningId,
                  hoveredId,
                  onSelect: handleSelectChat,
                  onHoverStart: handleHoverStart,
                  onHoverEnd: handleHoverEnd,
                  onDelete: handleDelete,
                  onTogglePin: handleTogglePin,
                }}
              />
            )}
          </Collapse>
        </div>
      </div>

      {/* Bottom User Section */}
      <div className="border-t border-zinc-800 p-3 relative" ref={userMenuRef}>
        {isLoading ? (
          <div className="flex items-center gap-3 px-3 py-2.5 w-full">
            <Skeleton
              circle
              width={32}
              height={32}
              containerClassName="shrink-0"
            />
          </div>
        ) : user ? (
          <>
            {isUserMenuOpen && (
              <div className="absolute bottom-full left-3 right-3 mb-2 animate-slideUp">
                <Menu
                  selectable={false}
                  onClick={handleUserMenuClick}
                  className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-1 text-sm"
                >
                  <MenuItem
                    key="feedback"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-300 cursor-pointer hover:bg-zinc-800 transition-colors duration-150"
                  >
                    <MessageSquareText className="w-3.5 h-3.5" />
                    Feedback
                  </MenuItem>
                  {user.role === "ADMIN" && (
                    <MenuItem
                      key="admin"
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-zinc-300 cursor-pointer hover:bg-zinc-800 transition-colors duration-150"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Admin
                    </MenuItem>
                  )}
                  <MenuItem
                    key="logout"
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-red-400 cursor-pointer hover:bg-zinc-800 transition-colors duration-150"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Log out
                  </MenuItem>
                </Menu>
              </div>
            )}
            <button
              onClick={() => setIsUserMenuOpen((open) => !open)}
              disabled={isLoggingOut}
              className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 hover:bg-zinc-800 disabled:opacity-60 transition-colors duration-150"
            >
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                {(user.first_name?.[0] ?? user.username[0]).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0 text-left animate-fadeIn">
                <div className="text-sm font-medium text-white truncate">
                  {[user.first_name, user.last_name]
                    .filter(Boolean)
                    .join(" ") || user.username}
                </div>
                <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                  {isLoggingOut && <Spinner className="w-3 h-3" />}
                  {isLoggingOut ? "Signing out…" : "Free"}
                </div>
              </div>
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              openAuthDialog("login");
              onNavigate?.();
            }}
            className="flex items-center gap-3 w-full rounded-xl px-3 py-2.5 text-sm hover:bg-zinc-800 transition-colors duration-200"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <span className="text-white font-medium animate-fadeIn">
              Sign in
            </span>
          </button>
        )}
      </div>

      {isFeedbackOpen &&
        createPortal(
          <FeedbackDialog onClose={() => setIsFeedbackOpen(false)} />,
          document.body,
        )}
      {isAdminOpen &&
        createPortal(
          <AdminPanel onClose={() => setIsAdminOpen(false)} />,
          document.body,
        )}
    </aside>
  );
}
