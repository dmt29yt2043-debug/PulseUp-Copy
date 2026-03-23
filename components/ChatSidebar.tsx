'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { ChatMessage, FilterState, Event, UserProfile } from '@/lib/types';
import ChatMessages from './ChatMessages';

interface ChatSidebarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onEventClick: (event: Event) => void;
}

type OnboardingStep = 'attendees' | 'childAges' | 'interests' | 'budget' | 'done';

const ONBOARDING_QUESTIONS: Record<string, { message: string; quickReplies: string[] }> = {
  attendees: {
    message: "Hi! I'm your event assistant. Who will be attending?",
    quickReplies: ['Just me', 'Me + kids', 'Family', 'Couple'],
  },
  childAges: {
    message: "Great! How old are your children?",
    quickReplies: ['Under 3', '3-5', '6-9', '10-13', 'Mixed ages'],
  },
  interests: {
    message: "What kinds of activities interest you?",
    quickReplies: ['Arts', 'Theater', 'Outdoor', 'Sports', 'Educational', 'Everything'],
  },
  budget: {
    message: "Any budget preference?",
    quickReplies: ['Free events', 'Under $20', 'Under $50', 'Any budget'],
  },
};

function getStoredProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('pulseup_profile');
    if (stored) return JSON.parse(stored) as UserProfile;
  } catch {
    // ignore
  }
  return null;
}

function storeProfile(profile: UserProfile) {
  try {
    localStorage.setItem('pulseup_profile', JSON.stringify(profile));
  } catch {
    // ignore
  }
}

export default function ChatSidebar({ filters, onFiltersChange, onEventClick }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('attendees');
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const partialProfileRef = useRef<Partial<UserProfile>>({});

  // On mount, check for existing profile
  useEffect(() => {
    const stored = getStoredProfile();
    if (stored) {
      setProfile(stored);
      setOnboardingDone(true);
      setOnboardingStep('done');
      // Re-apply saved profile filters
      applyProfileFilters(stored);
      setMessages([
        {
          role: 'assistant',
          content: `Welcome back! I remember your preferences. Ask me anything about events!`,
        },
      ]);
    } else {
      // Start onboarding
      setMessages([
        {
          role: 'assistant',
          content: ONBOARDING_QUESTIONS.attendees.message,
          quickReplies: ONBOARDING_QUESTIONS.attendees.quickReplies,
        },
      ]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Convert partial profile to filters and apply them progressively
  const applyProfileFilters = useCallback((partial: Partial<UserProfile>) => {
    const newFilters: FilterState = {};

    // Child ages → ageMax filter
    if (partial.childAges) {
      const ageMap: Record<string, number> = {
        'Under 3': 3, '3-5': 5, '6-9': 9, '10-13': 13, 'Mixed ages': 18,
      };
      if (ageMap[partial.childAges]) {
        newFilters.ageMax = ageMap[partial.childAges];
      }
    }

    // Interests → categories filter
    if (partial.interests && partial.interests !== 'Everything') {
      const interestMap: Record<string, string[]> = {
        'Arts': ['arts', 'Art'],
        'Theater': ['theater'],
        'Outdoor': ['attractions'],
        'Sports': ['sports'],
        'Educational': ['books', "Children's Activities"],
      };
      if (interestMap[partial.interests]) {
        newFilters.categories = interestMap[partial.interests];
      }
    }

    // Budget → price filters
    if (partial.budget) {
      if (partial.budget === 'Free events') {
        newFilters.isFree = true;
      } else if (partial.budget === 'Under $20') {
        newFilters.priceMax = 20;
      } else if (partial.budget === 'Under $50') {
        newFilters.priceMax = 50;
      }
    }

    onFiltersChange(newFilters);
  }, [onFiltersChange]);

  const advanceOnboarding = useCallback((userAnswer: string) => {
    const userMsg: ChatMessage = { role: 'user', content: userAnswer };

    if (onboardingStep === 'attendees') {
      partialProfileRef.current.attendees = userAnswer;
      const needsChildAges = /kid|child|famil/i.test(userAnswer);
      const nextStep: OnboardingStep = needsChildAges ? 'childAges' : 'interests';
      if (!needsChildAges) {
        partialProfileRef.current.childAges = '';
      }
      const nextQ = ONBOARDING_QUESTIONS[nextStep];
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: 'assistant', content: nextQ.message, quickReplies: nextQ.quickReplies },
      ]);
      setOnboardingStep(nextStep);
    } else if (onboardingStep === 'childAges') {
      partialProfileRef.current.childAges = userAnswer;
      applyProfileFilters(partialProfileRef.current);
      const nextQ = ONBOARDING_QUESTIONS.interests;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: 'assistant', content: nextQ.message, quickReplies: nextQ.quickReplies },
      ]);
      setOnboardingStep('interests');
    } else if (onboardingStep === 'interests') {
      partialProfileRef.current.interests = userAnswer;
      applyProfileFilters(partialProfileRef.current);
      const nextQ = ONBOARDING_QUESTIONS.budget;
      setMessages((prev) => [
        ...prev,
        userMsg,
        { role: 'assistant', content: nextQ.message, quickReplies: nextQ.quickReplies },
      ]);
      setOnboardingStep('budget');
    } else if (onboardingStep === 'budget') {
      partialProfileRef.current.budget = userAnswer;
      const finalProfile: UserProfile = {
        attendees: partialProfileRef.current.attendees || '',
        childAges: partialProfileRef.current.childAges || '',
        interests: partialProfileRef.current.interests || '',
        budget: partialProfileRef.current.budget || '',
      };
      setProfile(finalProfile);
      storeProfile(finalProfile);
      setOnboardingDone(true);
      setOnboardingStep('done');
      applyProfileFilters(partialProfileRef.current);

      const summary = [
        `Attendees: ${finalProfile.attendees}`,
        finalProfile.childAges ? `Children ages: ${finalProfile.childAges}` : null,
        `Interests: ${finalProfile.interests}`,
        `Budget: ${finalProfile.budget}`,
      ]
        .filter(Boolean)
        .join('\n');

      setMessages((prev) => [
        ...prev,
        userMsg,
        {
          role: 'assistant',
          content: `Got it! Here's what I know about you:\n\n${summary}\n\nI'll keep these preferences in mind. Ask me anything about events!`,
        },
      ]);
    }
  }, [onboardingStep, applyProfileFilters]);

  const resetProfile = useCallback(() => {
    localStorage.removeItem('pulseup_profile');
    setProfile(null);
    setOnboardingDone(false);
    setOnboardingStep('attendees');
    partialProfileRef.current = {};
    onFiltersChange({});
    setMessages([
      {
        role: 'assistant',
        content: ONBOARDING_QUESTIONS.attendees.message,
        quickReplies: ONBOARDING_QUESTIONS.attendees.quickReplies,
      },
    ]);
  }, [onFiltersChange]);

  const sendMessage = useCallback(async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;

    // Handle reset command
    if (msgText.toLowerCase() === 'reset') {
      setInput('');
      resetProfile();
      return;
    }

    // If still onboarding, handle differently
    if (!onboardingDone && onboardingStep !== 'done') {
      advanceOnboarding(msgText);
      setInput('');
      return;
    }

    const userMessage: ChatMessage = { role: 'user', content: msgText };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msgText,
          filters,
          history: newMessages.map((m) => ({ role: m.role, content: m.content })),
          profile,
        }),
      });

      if (!res.ok) throw new Error('Chat request failed');

      const data = await res.json();
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: data.message || 'I found some events for you.',
        events: data.events,
        filters: data.filters,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (data.filters && Object.keys(data.filters).length > 0) {
        onFiltersChange(data.filters);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, filters, onFiltersChange, profile, onboardingDone, onboardingStep, advanceOnboarding]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleQuickReply = (reply: string) => {
    if (!onboardingDone && onboardingStep !== 'done') {
      advanceOnboarding(reply);
    } else {
      sendMessage(reply);
    }
  };

  const chatContent = (
    <div className="chat-sidebar-inner">
      {/* Header */}
      <div className="chat-sidebar-header">
        <span className="font-semibold text-sm text-white">Chat Assistant</span>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10"
        >
          &#10005;
        </button>
      </div>

      {/* Messages */}
      <div className="chat-sidebar-messages">
        <ChatMessages
          messages={messages}
          isLoading={loading}
          onEventClick={onEventClick}
          onQuickReply={handleQuickReply}
        />
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="chat-sidebar-input">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={onboardingDone ? 'Ask about events...' : 'Type your answer...'}
            rows={1}
            className="flex-1 resize-none px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-[#e91e63] max-h-24"
            style={{ minHeight: 38 }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: '#e91e63' }}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="text-lg leading-none">&uarr;</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <aside className="chat-sidebar-desktop">
        {chatContent}
      </aside>

      {/* Mobile floating button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="chat-mobile-fab"
        style={{ backgroundColor: '#e91e63' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-[#e91e63] text-xs font-bold rounded-full flex items-center justify-center">
            {messages.length}
          </span>
        )}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <>
          <div
            className="chat-mobile-backdrop"
            onClick={() => setMobileOpen(false)}
          />
          <div className="chat-mobile-panel">
            {chatContent}
          </div>
        </>
      )}
    </>
  );
}
