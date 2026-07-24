import Dashboard from '../components/Dashboard';

// Shared by `/` and `/chat/[id]` (a route group — adds no URL segment of its own), so
// navigating between them doesn't remount Dashboard's chrome or refetch anything; only
// the route param changes, which `RouteSync` (inside Dashboard) picks up.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Dashboard />
      {children}
    </>
  );
}
