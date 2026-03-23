'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import type { ChatMessage, FilterState, Event, UserProfile, ChildProfile } from '@/lib/types';
import ChatMessages from './ChatMessages';
import type { MultiSelectState } from './ChatMessages';

interface ChatSidebarProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
  onEventClick: (event: Event) => void;
}

type OnboardingStep =
  | 'q1_children'
  | 'q1_confirm'
  | 'q2_interests'
  | 'q2_summary'
  | 'q3_neighborhoods'
  | 'q4_budget'
  | 'q5_special'
  | 'ready'
  | 'done';

const INTEREST_OPTIONS = ['Active', 'Creative', 'Educational', 'Shows', 'Outdoor', 'Fun & Play', 'Adventure', 'Books', 'Social'];
const NEIGHBORHOOD_OPTIONS = ['Upper Manhattan', 'Midtown', 'Lower Manhattan', 'Brooklyn', 'Queens', 'Bronx', 'Staten Island', 'Anywhere in NYC'];
const BUDGET_OPTIONS = ['Free only', 'Under $25', 'Under $50', 'Under $75', 'Under $100', 'Any budget'];

const INTEREST_TO_CATEGORIES: Record<string, string[]> = {
  'Active': ['sports', 'attractions'],
  'Creative': ['arts', 'Art'],
  'Educational': ['books', "Children's Activities"],
  'Shows': ['theater'],
  'Outdoor': ['attractions'],
  'Fun & Play': ['family', "Children's Activities"],
  'Adventure': ['attractions'],
  'Books': ['books'],
  'Social': ['family'],
};

function genderEmoji(gender: string): string {
  return gender === 'girl' ? '👧' : gender === 'boy' ? '👦' : '🧒';
}

function getStoredProfile(): UserProfile | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem('pulseup_profile');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Migration: old profile shape has 'attendees', new has 'children'
    if ('attendees' in parsed && !('children' in parsed)) {
      localStorage.removeItem('pulseup_profile');
      return null;
    }
    return parsed as UserProfile;
  } catch {
    return null;
  }
}

function storeProfile(profile: UserProfile) {
  try {
    localStorage.setItem('pulseup_profile', JSON.stringify(profile));
  } catch { /* ignore */ }
}

export default function ChatSidebar({ filters, onFiltersChange, onEventClick }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>('q1_children');
  const [onboardingDone, setOnboardingDone] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Onboarding state
  const [parsedChildren, setParsedChildren] = useState<ChildProfile[]>([]);
  const [currentChildIndex, setCurrentChildIndex] = useState(0);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [parsingChildren, setParsingChildren] = useState(false);

  const partialProfileRef = useRef<Partial<UserProfile>>({});

  // Apply profile to filters
  const applyProfileFilters = useCallback((p: Partial<UserProfile>) => {
    const newFilters: FilterState = {};

    if (p.children && p.children.length > 0) {
      // ageMax = max age among children
      newFilters.ageMax = Math.max(...p.children.map((c) => c.age));

      // Collect all interests → categories
      const allInterests = new Set<string>();
      p.children.forEach((c) => c.interests.forEach((i) => allInterests.add(i)));
      if (allInterests.size > 0) {
        const cats = new Set<string>();
        allInterests.forEach((i) => {
          (INTEREST_TO_CATEGORIES[i] || []).forEach((c) => cats.add(c));
        });
        if (cats.size > 0) newFilters.categories = [...cats];
      }
    }

    if (p.neighborhoods && p.neighborhoods.length > 0 && !p.neighborhoods.includes('Anywhere in NYC')) {
      newFilters.neighborhoods = p.neighborhoods;
    }

    if (p.budget) {
      if (p.budget === 'Free only') newFilters.isFree = true;
      else if (p.budget === 'Under $25') newFilters.priceMax = 25;
      else if (p.budget === 'Under $50') newFilters.priceMax = 50;
      else if (p.budget === 'Under $75') newFilters.priceMax = 75;
      else if (p.budget === 'Under $100') newFilters.priceMax = 100;
    }

    onFiltersChange(newFilters);
  }, [onFiltersChange]);

  // On mount
  useEffect(() => {
    const stored = getStoredProfile();
    if (stored) {
      setProfile(stored);
      setOnboardingDone(true);
      setOnboardingStep('done');
      applyProfileFilters(stored);
      setMessages([{ role: 'assistant', content: 'Welcome back! I remember your preferences. Ask me anything about events!' }]);
    } else {
      setMessages([{ role: 'assistant', content: "Hi! I'm your event assistant. Tell me about your children — their ages and how many. For example: \"daughter 6 and son 3\"" }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, selectedItems]);

  // Parse children via LLM
  const parseChildren = useCallback(async (text: string) => {
    setParsingChildren(true);
    setLoading(true);
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'parse_children', message: text }),
      });
      if (!res.ok) throw new Error('Failed to parse');
      const data = await res.json();
      const children = (data.children || []) as ChildProfile[];

      if (children.length === 0) {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: "I couldn't understand that. Could you describe your children? For example: \"daughter 6 and son 3\"",
        }]);
        return;
      }

      setParsedChildren(children);
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Here is what I understood:',
        childSummary: children,
        quickReplies: ['Confirm', 'Let me rephrase'],
      }]);
      setOnboardingStep('q1_confirm');
    } catch {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again — describe your children.',
      }]);
    } finally {
      setParsingChildren(false);
      setLoading(false);
    }
  }, []);

  // Reset
  const resetProfile = useCallback(() => {
    localStorage.removeItem('pulseup_profile');
    setProfile(null);
    setOnboardingDone(false);
    setOnboardingStep('q1_children');
    setParsedChildren([]);
    setCurrentChildIndex(0);
    setSelectedItems(new Set());
    partialProfileRef.current = {};
    onFiltersChange({});
    setMessages([{ role: 'assistant', content: "Hi! I'm your event assistant. Tell me about your children — their ages and how many. For example: \"daughter 6 and son 3\"" }]);
  }, [onFiltersChange]);

  // Handle multi-select toggle
  const handleToggle = useCallback((item: string) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      // Special: "Anywhere in NYC" is exclusive
      if (onboardingStep === 'q3_neighborhoods') {
        if (item === 'Anywhere in NYC') {
          return next.has(item) ? new Set() : new Set([item]);
        } else {
          next.delete('Anywhere in NYC');
          if (next.has(item)) next.delete(item);
          else next.add(item);
          return next;
        }
      }
      if (next.has(item)) next.delete(item);
      else next.add(item);
      return next;
    });
  }, [onboardingStep]);

  // Handle multi-select Done
  const handleMultiDone = useCallback(() => {
    const selected = [...selectedItems];
    if (selected.length === 0) return;

    if (onboardingStep === 'q2_interests') {
      // Save interests for current child
      const updatedChildren = [...parsedChildren];
      updatedChildren[currentChildIndex] = { ...updatedChildren[currentChildIndex], interests: selected };
      setParsedChildren(updatedChildren);

      setMessages((prev) => [...prev, { role: 'user', content: selected.join(', ') }]);
      setSelectedItems(new Set());

      const nextIdx = currentChildIndex + 1;
      if (nextIdx < parsedChildren.length) {
        // Next child
        setCurrentChildIndex(nextIdx);
        const child = parsedChildren[nextIdx];
        const label = child.name || `your ${child.age}-year-old`;
        setMessages((prev) => [...prev, { role: 'assistant', content: `What does ${label} enjoy?` }]);
      } else {
        // All done — show summary
        partialProfileRef.current.children = updatedChildren;
        applyProfileFilters(partialProfileRef.current);
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: 'Great! Here are the interests I noted:',
          interestSummary: updatedChildren,
          quickReplies: ['Continue'],
        }]);
        setOnboardingStep('q2_summary');
      }
    } else if (onboardingStep === 'q3_neighborhoods') {
      partialProfileRef.current.neighborhoods = selected;
      applyProfileFilters(partialProfileRef.current);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: selected.join(', ') },
        { role: 'assistant', content: 'Any budget preference?', quickReplies: BUDGET_OPTIONS },
      ]);
      setSelectedItems(new Set());
      setOnboardingStep('q4_budget');
    }
  }, [selectedItems, onboardingStep, parsedChildren, currentChildIndex, applyProfileFilters]);

  // Handle skip (Q5)
  const handleSkip = useCallback(() => {
    partialProfileRef.current.specialNeeds = '';
    finishOnboarding();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Finish onboarding
  const finishOnboarding = useCallback(() => {
    const finalProfile: UserProfile = {
      children: partialProfileRef.current.children || parsedChildren,
      neighborhoods: partialProfileRef.current.neighborhoods || [],
      budget: partialProfileRef.current.budget || 'Any budget',
      specialNeeds: partialProfileRef.current.specialNeeds,
    };
    setProfile(finalProfile);
    storeProfile(finalProfile);
    setOnboardingDone(true);
    setOnboardingStep('done');
    applyProfileFilters(finalProfile);

    const childrenDesc = finalProfile.children.map((c) =>
      `${genderEmoji(c.gender)} ${c.name || `${c.age}yo`} — ${c.interests.join(', ')}`
    ).join('\n');

    setMessages((prev) => [...prev, {
      role: 'assistant',
      content: `All set! Here's your profile:\n\n${childrenDesc}\n📍 ${finalProfile.neighborhoods.length ? finalProfile.neighborhoods.join(', ') : 'Anywhere in NYC'}\n💰 ${finalProfile.budget}${finalProfile.specialNeeds ? `\n📝 ${finalProfile.specialNeeds}` : ''}\n\nAsk me anything about events!`,
    }]);
  }, [parsedChildren, applyProfileFilters]);

  // Handle quick reply
  const handleQuickReply = useCallback((reply: string) => {
    if (onboardingStep === 'q1_confirm') {
      setMessages((prev) => [...prev, { role: 'user', content: reply }]);
      if (reply === 'Confirm') {
        partialProfileRef.current.children = parsedChildren;
        applyProfileFilters(partialProfileRef.current);
        setCurrentChildIndex(0);
        setSelectedItems(new Set());
        setOnboardingStep('q2_interests');
        const child = parsedChildren[0];
        const label = child.name || `your ${child.age}-year-old`;
        setMessages((prev) => [...prev, { role: 'assistant', content: `What does ${label} enjoy?` }]);
      } else {
        // Let me rephrase
        setOnboardingStep('q1_children');
        setParsedChildren([]);
        setMessages((prev) => [...prev, { role: 'assistant', content: 'No problem! Describe your children again.' }]);
      }
    } else if (onboardingStep === 'q2_summary') {
      setMessages((prev) => [...prev, { role: 'user', content: reply }]);
      setSelectedItems(new Set());
      setOnboardingStep('q3_neighborhoods');
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Which neighborhoods are you interested in?' }]);
    } else if (onboardingStep === 'q4_budget') {
      partialProfileRef.current.budget = reply;
      applyProfileFilters(partialProfileRef.current);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: reply },
        { role: 'assistant', content: 'Any special preferences? (allergies, accessibility, indoor/outdoor, etc.)', showSkip: true },
      ]);
      setOnboardingStep('q5_special');
    } else if (onboardingDone) {
      sendMessage(reply);
    }
  }, [onboardingStep, parsedChildren, applyProfileFilters, onboardingDone]);

  // Send message
  const sendMessage = useCallback(async (text?: string) => {
    const msgText = (text || input).trim();
    if (!msgText || loading) return;

    // Reset commands
    if (msgText.toLowerCase() === 'reset' || msgText.toLowerCase() === '/start') {
      setInput('');
      resetProfile();
      return;
    }

    // Q1: parse children
    if (onboardingStep === 'q1_children') {
      setInput('');
      await parseChildren(msgText);
      return;
    }

    // Q5: save special needs
    if (onboardingStep === 'q5_special') {
      setInput('');
      setMessages((prev) => [...prev, { role: 'user', content: msgText }]);
      partialProfileRef.current.specialNeeds = msgText;
      finishOnboarding();
      return;
    }

    // Normal chat (post-onboarding)
    if (!onboardingDone) {
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
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: data.message || 'I found some events for you.',
        events: data.events,
        filters: data.filters,
      }]);

      if (data.filters && Object.keys(data.filters).length > 0) {
        onFiltersChange(data.filters);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, filters, onFiltersChange, profile, onboardingDone, onboardingStep, parseChildren, finishOnboarding, resetProfile]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Multi-select state to pass to ChatMessages
  const multiSelectState: MultiSelectState | null = useMemo(() => {
    if (onboardingStep === 'q2_interests') {
      return {
        options: INTEREST_OPTIONS,
        selected: selectedItems,
        onToggle: handleToggle,
        onDone: handleMultiDone,
        doneLabel: 'Done',
      };
    }
    if (onboardingStep === 'q3_neighborhoods') {
      return {
        options: NEIGHBORHOOD_OPTIONS,
        selected: selectedItems,
        onToggle: handleToggle,
        onDone: handleMultiDone,
        doneLabel: 'Done',
      };
    }
    return null;
  }, [onboardingStep, selectedItems, handleToggle, handleMultiDone]);

  // Placeholder text
  const placeholder = useMemo(() => {
    if (onboardingStep === 'q1_children') return 'e.g. "daughter 6 and son 3"';
    if (onboardingStep === 'q5_special') return 'e.g. "no nuts, wheelchair accessible"';
    if (onboardingDone) return 'Ask about events...';
    return '';
  }, [onboardingStep, onboardingDone]);

  // Show input only for free-text steps and post-onboarding
  const showInput = onboardingStep === 'q1_children' || onboardingStep === 'q5_special' || onboardingDone;

  const chatContent = (
    <div className="chat-sidebar-inner">
      <div className="chat-sidebar-header">
        <span className="font-semibold text-sm text-white">Chat Assistant</span>
        <button
          onClick={() => setMobileOpen(false)}
          className="md:hidden w-7 h-7 flex items-center justify-center rounded-full text-white/80 hover:text-white hover:bg-white/10"
        >
          &#10005;
        </button>
      </div>

      <div className="chat-sidebar-messages">
        <ChatMessages
          messages={messages}
          isLoading={loading || parsingChildren}
          onEventClick={onEventClick}
          onQuickReply={handleQuickReply}
          multiSelectState={multiSelectState}
          onSkip={handleSkip}
        />
        <div ref={messagesEndRef} />
      </div>

      {showInput && (
        <div className="chat-sidebar-input">
          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
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
      )}
    </div>
  );

  return (
    <>
      <aside className="chat-sidebar-desktop">{chatContent}</aside>

      <button onClick={() => setMobileOpen(true)} className="chat-mobile-fab" style={{ backgroundColor: '#e91e63' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-white text-[#e91e63] text-xs font-bold rounded-full flex items-center justify-center">
            {messages.length}
          </span>
        )}
      </button>

      {mobileOpen && (
        <>
          <div className="chat-mobile-backdrop" onClick={() => setMobileOpen(false)} />
          <div className="chat-mobile-panel">{chatContent}</div>
        </>
      )}
    </>
  );
}
