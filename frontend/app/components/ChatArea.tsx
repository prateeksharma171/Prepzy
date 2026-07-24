'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Sparkles, Code2, Users, FileText, DollarSign } from 'lucide-react';
import { useInfiniteScroll } from 'react-infinite-scroll-component';
import Skeleton from 'react-loading-skeleton';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import Spinner from './Spinner';
import { useChat } from '../context/ChatContext';

const SUGGESTIONS = [
  { icon: Code2, label: 'Practice a coding question', color: 'from-emerald-400 to-emerald-600' },
  { icon: Users, label: 'Mock behavioral interview', color: 'from-teal-400 to-teal-600' },
  { icon: FileText, label: 'Review my resume', color: 'from-green-400 to-green-600' },
  { icon: DollarSign, label: 'Negotiate my offer', color: 'from-emerald-500 to-cyan-600' },
];

const QUICK_PROMPTS = [
  'Walk me through reversing a linked list',
  'Design a URL shortener like bit.ly',
  'Give me a STAR-method behavioral question',
  'What should I ask my interviewer?',
];

export default function ChatArea() {
  const {
    activeMessages,
    isLoadingActiveConversation,
    hasMoreMessages,
    loadOlderMessages,
    isStreaming,
    sendMessage,
  } = useChat();
  // Plain ref for imperative DOM reads/writes (scrollTop, scrollHeight, scrollTo) — kept
  // separate from the state below because mutating a useState-returned value directly isn't
  // allowed (the value itself is only ever read here, never mutated).
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  // useInfiniteScroll's `scrollableTarget` needs a fresh value once the div actually mounts,
  // and a plain ref's `.current` change doesn't trigger a re-render on its own — state does.
  const [scrollContainerNode, setScrollContainerNode] = useState<HTMLDivElement | null>(null);

  const attachScrollContainer = useCallback((node: HTMLDivElement | null) => {
    scrollContainerRef.current = node;
    setScrollContainerNode(node);
  }, []);

  // Set right before loadOlderMessages prepends a page, so the effect below can tell "older
  // messages were just prepended" (preserve scroll position) apart from "a new message arrived
  // at the bottom" (scroll to bottom) — both show up as the same activeMessages change otherwise.
  const isPrependingRef = useRef(false);
  const prevScrollHeightRef = useRef(0);

  const scrollToBottom = () => {
    // Scroll the messages container itself directly, rather than
    // scrollIntoView() on an end marker — scrollIntoView walks up the
    // ancestor chain for the "nearest" scrollable element, and if this
    // container isn't recognized as one at that exact moment, it can end up
    // scrolling the whole page (dragging the sidebar up with it) instead.
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  };

  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (isPrependingRef.current) {
      isPrependingRef.current = false;
      if (container) {
        container.scrollTop += container.scrollHeight - prevScrollHeightRef.current;
      }
    } else {
      scrollToBottom();
    }
  }, [activeMessages]);

  const handleLoadOlderMessages = useCallback(async () => {
    const container = scrollContainerRef.current;
    if (container) {
      prevScrollHeightRef.current = container.scrollHeight;
      isPrependingRef.current = true;
    }
    await loadOlderMessages();
  }, [loadOlderMessages]);

  const { sentinelRef, isLoading: isLoadingOlderMessages } = useInfiniteScroll({
    next: handleLoadOlderMessages,
    hasMore: hasMoreMessages,
    dataLength: activeMessages.length,
    inverse: true,
    scrollableTarget: scrollContainerNode,
  });

  const handleSend = (content: string) => {
    void sendMessage(content);
  };

  const showWelcome = activeMessages.length === 0 && !isLoadingActiveConversation;

  return (
    // flex-1 min-h-0 (not h-full): this is a flex-col child of Dashboard's content column
    // alongside Header, sized by flex distribution rather than an explicit height — h-full
    // resolved against the column's full height regardless of what Header already took,
    // overflowing past the viewport by about Header's height instead of filling just what's left.
    <div className="flex flex-1 min-h-0 flex-col">
      {/* Messages Area */}
      {/* min-h-0 is load-bearing: a flex-col child defaults to min-height:auto, so without it this
          refuses to shrink below its own content's natural height once that content (e.g. the
          welcome screen) is tall, pushing the whole page past the viewport instead of scrolling
          internally — and since the app shell uses overflow-hidden rather than scroll, the excess
          (often the footer below it) gets silently clipped instead of ever being reachable. */}
      <div ref={attachScrollContainer} className="flex-1 min-h-0 overflow-y-auto">
        {isLoadingActiveConversation ? (
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6 animate-fadeIn">
            {[0, 1].map((i) => (
              <Skeleton key={i} height={64} borderRadius={16} />
            ))}
          </div>
        ) : showWelcome ? (
          /* Welcome / Empty State */
          // `min-h-full` + `m-auto` on the inner block (rather than `h-full` + `justify-center`
          // here) centers it when it fits, but still scrolls to reveal the whole thing when it's
          // taller than the viewport — `justify-content: center` on a scroll container clips
          // whatever overflows past the start edge instead of letting you scroll to it.
          <div className="min-h-full flex flex-col px-4 py-8">
            <div className="m-auto flex flex-col items-center w-full animate-fadeIn">
              <div className="w-16 h-16 rounded-2xl bg-linear-to-br from-emerald-400 to-teal-500 flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20 animate-pulse-slow">
                <Sparkles className="w-8 h-8 text-white" />
              </div>

              <h1 className="text-3xl font-semibold text-white mb-2 text-balance text-center">
                Ready to prep for your interview?
              </h1>
              <p className="text-zinc-400 text-center max-w-md mb-10">
                I&apos;m your interview coach — coding &amp; DSA, system design, behavioral, resume feedback, and
                negotiation. I&apos;ll only talk shop about interview prep, but I&apos;ll go deep on it.
              </p>

              {/* Quick Actions Grid */}
              <div className="grid grid-cols-2 gap-3 max-w-lg w-full mb-8">
                {SUGGESTIONS.map(({ icon: Icon, label, color }) => (
                  <button
                    key={label}
                    onClick={() => handleSend(label)}
                    disabled={isStreaming}
                    className="flex items-center gap-3 p-4 rounded-xl border border-zinc-700/50 bg-zinc-800/40 hover:bg-zinc-800 hover:border-zinc-600 transition-all duration-300 text-left group hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                  >
                    <div
                      className={`w-9 h-9 rounded-lg bg-linear-to-br ${color} flex items-center justify-center shrink-0 shadow-md group-hover:scale-110 transition-transform duration-300`}
                    >
                      <Icon className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-sm text-zinc-300 group-hover:text-white transition-colors duration-200">
                      {label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Quick Prompts */}
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {QUICK_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={isStreaming}
                    className="px-4 py-2 rounded-full border border-zinc-700 text-sm text-zinc-400 hover:text-white hover:border-zinc-500 hover:bg-zinc-800/50 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Messages */
          <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
            <div ref={sentinelRef} />
            {isLoadingOlderMessages && (
              <div className="flex justify-center">
                <Spinner className="w-4 h-4 text-zinc-500" />
              </div>
            )}
            {activeMessages.map((msg) => (
              <MessageBubble
                key={msg.id}
                role={msg.role}
                content={msg.content}
                isStreaming={msg.isStreaming}
                isError={msg.isError}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <MessageInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}
