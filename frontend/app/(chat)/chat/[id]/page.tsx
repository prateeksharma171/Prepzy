// Renders nothing — this route exists only so Next.js resolves `/chat/:id`. The visible
// chrome (Sidebar/Header/ChatArea) lives in `(chat)/layout.tsx`; `RouteSync` (in
// Dashboard.tsx) reads the `id` param and syncs ChatContext to that conversation.
export default function ChatPage() {
  return null;
}
