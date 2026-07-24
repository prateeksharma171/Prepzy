import { Sparkles } from 'lucide-react';

interface LogoLoaderProps {
  className?: string;
}

/** Rotating brand mark — shown full-screen while the app performs its initial auth check. */
export default function LogoLoader({ className = 'w-10 h-10' }: LogoLoaderProps) {
  return <Sparkles className={`text-emerald-400 animate-[spin_1.4s_linear_infinite] ${className}`} />;
}
