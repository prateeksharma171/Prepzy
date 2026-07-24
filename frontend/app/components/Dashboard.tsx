'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import Header from './Header';
import ChatArea from './ChatArea';
import PluginsPanel from './PluginsPanel';
import LogoLoader from './LogoLoader';
import { useAuth } from '../context/AuthContext';
import { ChatProvider, useChat } from '../context/ChatContext';

// GitHub's OAuth redirect (see routers/github.py) lands back on this page with `?github=...` —
// read once from the URL, before React even mounts, since deriving it during render (rather than
// via a setState-in-effect) avoids an extra render and keeps it correct even though Sidebar
// (below) is mounted twice (desktop + mobile) and can't own this state itself.
function readGithubStatusParam(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('github');
}

// Renders the Plugins modal. Split out from Dashboard (rather than inlined) because it needs
// useChat() — which is only available to descendants of ChatProvider below, not to Dashboard
// itself, which renders that provider.
function PluginsPanelHost({
  isOpen,
  error,
  onClose,
}: {
  isOpen: boolean;
  error: string | null;
  onClose: () => void;
}) {
  const { startGithubRepoChat } = useChat();
  if (!isOpen) return null;
  return <PluginsPanel onClose={onClose} onSelectRepo={startGithubRepoChat} initialError={error} />;
}

// Reads the active route (`/` vs `/chat/[id]`) and syncs ChatContext to match. Lives inside
// ChatProvider (needs useChat()) and renders nothing — it's a pure side-effect component.
//
// The effect deliberately does NOT depend on `activeConversationId` (read via a ref instead) —
// it must only react to the URL itself changing, never to activeConversationId changing on its
// own. `router.replace`/`router.push` are async: `useParams()` doesn't update in the same commit
// as a local `setActiveConversationId` call. If activeConversationId were a dependency, e.g.
// sendMessage setting it right before calling router.replace() would re-fire this effect a beat
// before the URL caught up, see the (still-stale) params as "no id", and call startNewChat() —
// wiping out the conversation that was just created.
function RouteSync() {
  const params = useParams<{ id?: string }>();
  const { user } = useAuth();
  const { activeConversationId, startNewChat, selectConversation } = useChat();

  const activeConversationIdRef = useRef(activeConversationId);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (!user) return;
    const id = typeof params.id === 'string' ? params.id : null;
    if (id === activeConversationIdRef.current) return;
    if (id) void selectConversation(id);
    else startNewChat();
  }, [params.id, user, startNewChat, selectConversation]);

  return null;
}

export default function Dashboard() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isPluginsPanelOpen, setIsPluginsPanelOpen] = useState(
    () => readGithubStatusParam() === 'connected' || readGithubStatusParam() === 'error'
  );
  const [pluginsError, setPluginsError] = useState<string | null>(() =>
    readGithubStatusParam() === 'error' ? 'Could not connect your GitHub account. Please try again.' : null
  );
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const isAuthenticated = !isLoading && !!user;

  // Strips the `?github=...` flag once it's been read into state above — a plain URL cleanup,
  // not a state derivation, so it's the one thing this effect is actually meant to do.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('github')) return;
    params.delete('github');
    const query = params.toString();
    router.replace(query ? `${window.location.pathname}?${query}` : window.location.pathname);
  }, [router]);

  const handleOpenPlugins = () => {
    setPluginsError(null);
    setIsPluginsPanelOpen(true);
  };

  // While the silent session check is in flight, the sidebar/conversation state hasn't
  // been fetched yet either — rendering the shell now would flash an empty sidebar over
  // the (inert) dashboard for that brief window. Show the brand loader full-screen instead
  // until we actually know whether there's a signed-in user.
  if (isLoading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-[#212121]">
        <LogoLoader />
      </div>
    );
  }

  return (
    // The app is always visible behind the mandatory AuthDialog (layout.tsx), but `inert`
    // strips it of pointer AND keyboard interaction while logged out, so it can't actually
    // be used without signing in — just seen. Dashboard is now mounted unconditionally by
    // the (chat) layout, so it self-gates here instead of the old root page.tsx doing it.
    <div inert={!isAuthenticated}>
      {/* Keying by user id remounts ChatProvider (fresh state) on sign-out/sign-in or account
          switch, instead of it having to manually clear every piece of state itself. */}
      <ChatProvider key={user?.id ?? 'signed-out'}>
        <RouteSync />
        <PluginsPanelHost
          isOpen={isPluginsPanelOpen}
          error={pluginsError}
          onClose={() => setIsPluginsPanelOpen(false)}
        />
        {/* h-dvh (not h-screen/100vh) tracks the mobile browser's actually-visible viewport as its
            address bar shows/hides — with 100vh, bottom-pinned content like the input's disclaimer
            text can end up rendered behind that chrome and never fully visible. */}
        <div className="flex h-dvh bg-[#212121] overflow-hidden">
          {/* Mobile Overlay */}
          {mobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-fadeIn"
              onClick={() => setMobileMenuOpen(false)}
            />
          )}

          {/* Sidebar - Desktop */}
          <div className="hidden lg:flex">
            <Sidebar onOpenPlugins={handleOpenPlugins} />
          </div>

          {/* Sidebar - Mobile */}
          <div
            className={`
              fixed inset-y-0 left-0 z-50 lg:hidden
              transform transition-transform duration-300 ease-in-out
              ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            `}
          >
            <Sidebar onOpenPlugins={handleOpenPlugins} />
          </div>

          {/* Main Content */}
          <div className="flex-1 flex flex-col min-w-0">
            <Header onOpenMobileMenu={() => setMobileMenuOpen(true)} />
            <ChatArea />
          </div>
        </div>
      </ChatProvider>
    </div>
  );
}
