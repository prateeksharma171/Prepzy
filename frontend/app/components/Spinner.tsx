import { Loader2 } from 'lucide-react';

interface SpinnerProps {
  className?: string;
}

/** Shared loading indicator — use anywhere an async action is in flight (button, panel, list item). */
export default function Spinner({ className = 'w-4 h-4' }: SpinnerProps) {
  return <Loader2 className={`animate-spin ${className}`} />;
}
