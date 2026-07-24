'use client';

import { useState } from 'react';
import { Copy, Sparkles, Check, AlertTriangle } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import { copyToClipboard } from '../lib/clipboard';
import MarkdownContent from './MarkdownContent';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
  isError?: boolean;
}

export default function MessageBubble({ role, content, isStreaming = false, isError = false }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await copyToClipboard(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied/unavailable — nothing to recover into.
    }
  };

  if (role === 'user') {
    return (
      <div className="flex justify-end animate-slideUp">
        <div className="max-w-[75%] bg-zinc-700 text-white rounded-3xl rounded-br-lg px-5 py-3 text-[15px] leading-relaxed shadow-sm whitespace-pre-wrap">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-4 animate-slideUp ${isError ? 'items-center' : ''}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-md ${isError ? '' : 'mt-1'} ${
          isError ? 'bg-linear-to-br from-red-500 to-orange-500 shadow-red-500/20' : 'bg-linear-to-br from-emerald-400 to-teal-500 shadow-emerald-500/20'
        }`}
      >
        {isError ? <AlertTriangle className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-white" />}
      </div>

      {/* Message */}
      <div className="flex-1 min-w-0">
        {content ? (
          <div className={isError ? 'text-[15px] leading-relaxed text-red-300' : ''}>
            {isError ? content : <MarkdownContent content={content} />}
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-48 mt-1">
            <Skeleton height={12} />
            <Skeleton height={12} width="70%" />
          </div>
        )}

        {/* Action Buttons */}
        {content && !isStreaming && !isError && (
          <div className="flex items-center gap-1 mt-3 animate-fadeIn">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-700/50 transition-all duration-200"
              title="Copy full response"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
