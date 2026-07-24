'use client';

import { useState } from 'react';
import { X, MessageSquareText, CheckCircle2 } from 'lucide-react';
import { submitFeedback } from '../lib/feedbackApi';
import { getErrorMessage } from '../lib/axios';
import Spinner from './Spinner';

interface FeedbackDialogProps {
  onClose: () => void;
}

const textareaClasses =
  'w-full rounded-xl bg-zinc-900/60 border border-zinc-700 px-3.5 py-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-colors duration-200 resize-none';

export default function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting || !message.trim()) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await submitFeedback(message.trim());
      setIsSubmitted(true);
    } catch (err) {
      setError(getErrorMessage(err, 'Could not submit your feedback.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 animate-fadeIn" onClick={onClose} />
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl p-5 animate-slideUp">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white">Send feedback</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors duration-150"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isSubmitted ? (
          <div className="flex flex-col items-center text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
            <p className="text-sm text-white font-medium">Thanks for the feedback!</p>
            <p className="text-[13px] text-zinc-500 mt-1">We read every message you send.</p>
            <button
              onClick={onClose}
              className="mt-4 rounded-xl border border-zinc-700 hover:border-zinc-500 px-4 py-2 text-sm transition-colors duration-200 hover:bg-zinc-800"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-[13px] text-zinc-500 mb-3">
              Tell us what's working, what's not, or what you'd like to see.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Type your feedback…"
              className={textareaClasses}
              autoFocus
            />
            {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
            <button
              onClick={() => void handleSubmit()}
              disabled={isSubmitting || !message.trim()}
              className="mt-4 flex items-center justify-center gap-2 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting && <Spinner className="w-3.5 h-3.5" />}
              {isSubmitting ? 'Sending…' : 'Send feedback'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
