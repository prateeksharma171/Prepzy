'use client';

import { useState } from 'react';
import { BrainCircuit, Menu } from 'lucide-react';
import MemoryPanel from './MemoryPanel';

interface HeaderProps {
  onOpenMobileMenu: () => void;
}

export default function Header({ onOpenMobileMenu }: HeaderProps) {
  const [memoryOpen, setMemoryOpen] = useState(false);

  return (
    <header className="flex items-center justify-between gap-3 px-4 h-14 border-b border-zinc-800/50 bg-[#212121]">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden -ml-2 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-700/50 transition-all duration-200 shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="text-sm font-medium text-white truncate">Interview Prep Coach</span>
      </div>

      <button
        onClick={() => setMemoryOpen(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-zinc-700/50 transition-all duration-200 shrink-0"
        title="What the coach remembers about you"
      >
        <BrainCircuit className="w-4 h-4" />
        <span className="hidden sm:inline">Memory</span>
      </button>

      {memoryOpen && <MemoryPanel onClose={() => setMemoryOpen(false)} />}
    </header>
  );
}
