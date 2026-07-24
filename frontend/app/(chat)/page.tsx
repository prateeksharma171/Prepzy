// Renders nothing — this route exists only so Next.js resolves `/`. The visible chrome
// (Sidebar/Header/ChatArea) lives in `(chat)/layout.tsx`; `RouteSync` (in Dashboard.tsx)
// reads the URL and syncs ChatContext to the "new chat" state whenever this page is active.
export default function NewChatPage() {
  return null;
}
