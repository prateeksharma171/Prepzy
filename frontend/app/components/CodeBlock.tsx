'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { copyToClipboard } from '../lib/clipboard';

interface CodeBlockProps {
  language: string;
  code: string;
}

export default function CodeBlock({ language, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard access denied/unavailable — nothing to recover into.
    }
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-zinc-700/60 bg-[#0b0b0d] shadow-inner">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-800/70 border-b border-zinc-700/60">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          <span className="ml-2 text-[11px] font-mono text-zinc-400 uppercase tracking-wide">
            {language || 'text'}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[12px] text-zinc-400 hover:text-white px-2 py-1 rounded-md hover:bg-zinc-700/60 transition-colors duration-150"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="overflow-x-auto px-4 py-3 text-[13px] leading-relaxed font-mono text-zinc-100">
        <code>{code}</code>
      </pre>
    </div>
  );
}
