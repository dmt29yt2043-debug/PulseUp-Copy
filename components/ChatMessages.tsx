'use client';

import { useState, useEffect } from 'react';
import type { ChatMessage, Event } from '@/lib/types';

const THINKING_STEPS = [
  'Understanding your request…',
  'Searching the event database…',
  'Matching your preferences…',
  'Picking the best options…',
];

function ThinkingIndicator() {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (stepIndex >= THINKING_STEPS.length - 1) return;
    const delay = 800 + Math.random() * 600;
    const timer = setTimeout(() => setStepIndex((s) => s + 1), delay);
    return () => clearTimeout(timer);
  }, [stepIndex]);

  return (
    <div className="inline-block max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed bg-gray-100 text-gray-800">
      <div className="space-y-1">
        {THINKING_STEPS.slice(0, stepIndex + 1).map((step, i) => {
          const isActive = i === stepIndex && stepIndex < THINKING_STEPS.length - 1;
          const isDone = i < stepIndex || stepIndex === THINKING_STEPS.length - 1;
          return (
            <div key={i} className="flex items-center gap-1.5 thinking-step-enter">
              {isDone && !isActive ? (
                <svg className="w-3.5 h-3.5 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <span className="flex-shrink-0 w-3.5 h-3.5 flex items-center justify-center">
                  <span className="thinking-dot" />
                </span>
              )}
              <span className={isDone && !isActive ? 'text-gray-400' : 'text-gray-700 font-medium'}>
                {step}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ChatMessagesProps {
  messages: ChatMessage[];
  isLoading?: boolean;
  onEventClick: (event: Event) => void;
  onQuickReply?: (reply: string) => void;
}

export default function ChatMessages({ messages, isLoading, onEventClick, onQuickReply }: ChatMessagesProps) {
  if (messages.length === 0 && !isLoading) return null;

  return (
    <div className="px-3 py-3 space-y-3">
      {messages.map((msg, i) => {
        const isLast = i === messages.length - 1;
        return (
          <div key={i}>
            <div
              className={`inline-block max-w-[85%] px-3 py-2 rounded-xl text-sm leading-relaxed whitespace-pre-line ${
                msg.role === 'user'
                  ? 'ml-auto bg-[#e91e63] text-white float-right'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {msg.content}
            </div>
            <div className="clear-both" />

            {/* Inline event cards from assistant */}
            {msg.role === 'assistant' && msg.events && msg.events.length > 0 && (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {msg.events.slice(0, 5).map((event) => (
                  <button
                    key={event.id}
                    onClick={() => onEventClick(event)}
                    className="flex-shrink-0 bg-white rounded-lg p-2 text-left shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                    style={{ width: 160 }}
                  >
                    {event.image_url && (
                      <img
                        src={event.image_url}
                        alt=""
                        className="w-full h-16 object-cover rounded mb-1"
                      />
                    )}
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2">
                      {event.title}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {event.is_free ? 'Free' : event.price_summary}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Quick reply buttons - only show on the last assistant message */}
            {msg.role === 'assistant' && isLast && msg.quickReplies && msg.quickReplies.length > 0 && onQuickReply && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {msg.quickReplies.map((reply) => (
                  <button
                    key={reply}
                    onClick={() => onQuickReply(reply)}
                    className="quick-reply-pill"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Thinking indicator */}
      {isLoading && (
        <div>
          <ThinkingIndicator />
          <div className="clear-both" />
        </div>
      )}
    </div>
  );
}
