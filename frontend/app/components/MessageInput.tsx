'use client';

import { useState, useRef, useEffect } from 'react';
import { ArrowUp, FileText, X } from 'lucide-react';
import Spinner from './Spinner';

interface MessageInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

// Pasting more than this many characters collapses into a file chip instead of filling up
// the textarea (matches ChatGPT's long-paste behavior).
const PASTE_TO_FILE_THRESHOLD = 1000;
// Mirrors the backend's ChatRequest.content max_length (app/schemas/interview.py) — checked
// here purely so a too-long message gets a friendly inline error instead of a failed request.
const MAX_MESSAGE_LENGTH = 8000;

export default function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.length > PASTE_TO_FILE_THRESHOLD) {
      e.preventDefault();
      setAttachment(new File([pasted], 'Pasted text.txt', { type: 'text/plain' }));
      setError(null);
    }
  };

  const removeAttachment = () => {
    setAttachment(null);
    setError(null);
  };

  const handleSubmit = async () => {
    if (disabled || (!message.trim() && !attachment)) return;

    let content = message.trim();
    if (attachment) {
      const fileText = await attachment.text();
      content = [content, fileText].filter(Boolean).join('\n\n');
    }

    if (content.length > MAX_MESSAGE_LENGTH) {
      setError(
        `Message is too long (${content.length.toLocaleString()} / ${MAX_MESSAGE_LENGTH.toLocaleString()} characters). Please shorten it.`
      );
      return;
    }

    onSend(content);
    setMessage('');
    setAttachment(null);
    setError(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const canSend = (message.trim() || attachment) && !disabled;

  return (
    <div className="px-4 pb-6 pt-2">
      <div className="max-w-3xl mx-auto">
        {error && (
          <div className="mb-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-[13px] text-red-400">
            {error}
          </div>
        )}

        <div className="relative bg-zinc-800 rounded-2xl border border-zinc-700 shadow-lg shadow-black/20 transition-all duration-200 focus-within:border-zinc-600 focus-within:shadow-xl focus-within:shadow-black/30">
          {attachment && (
            <div className="flex items-center gap-2 mx-3 mt-3 px-3 py-2 rounded-xl border border-zinc-600 bg-zinc-900/60 w-fit max-w-[calc(100%-1.5rem)]">
              <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center shrink-0">
                <FileText className="w-4 h-4 text-pink-400" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] text-zinc-200 truncate">{attachment.name}</p>
                <p className="text-[11px] text-zinc-500">Document</p>
              </div>
              <button
                onClick={removeAttachment}
                className="ml-1 p-1 rounded-full text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors duration-150 shrink-0"
                aria-label="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              setError(null);
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={disabled ? 'The coach is replying…' : 'Ask about DSA, system design, behavioral prep…'}
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent text-zinc-100 placeholder-zinc-500 text-[15px] px-4 pt-4 pb-2 pr-12 resize-none outline-none leading-relaxed disabled:opacity-60"
          />

          {/* Bottom Bar */}
          <div className="flex items-center justify-end px-3 pb-3">
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSend}
              className={`
                p-2 rounded-xl transition-all duration-200
                ${
                  canSend
                    ? 'bg-white text-black hover:bg-zinc-200 active:scale-95 shadow-md'
                    : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                }
              `}
            >
              {disabled ? <Spinner className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" strokeWidth={2.5} />}
            </button>
          </div>
        </div>

        <p className="text-center text-[11px] text-zinc-600 mt-2 px-2 wrap-break-word">
          <span className="sm:hidden">Interview prep only — coding, system design, behavioral, resume, negotiation.</span>
          <span className="hidden sm:inline">
            This coach only helps with interview preparation — coding, system design, behavioral, resume, and
            negotiation.
          </span>
        </p>
      </div>
    </div>
  );
}
