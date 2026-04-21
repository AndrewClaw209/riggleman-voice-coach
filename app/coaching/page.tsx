'use client';

import { useState, useEffect } from 'react';
import VoiceChat from '@/components/VoiceChat';
import Link from 'next/link';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export default function CoachingPage() {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isLargeScreen, setIsLargeScreen] = useState(false);

  // Check screen size - hide sidebar on mobile
  useEffect(() => {
    const checkScreen = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const handleTranscriptUpdate = (message: ConversationMessage) => {
    setConversation((prev) => [...prev, message]);
  };

  return (
    <div className="flex h-[100dvh] bg-slate-900">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Compact header */}
        <header className="shrink-0 px-4 sm:px-6 pt-3 pb-2 border-b border-slate-800 flex items-center gap-3">
          <Link
            href="/"
            className="text-emerald-400 hover:text-emerald-300 text-sm shrink-0"
            aria-label="Back to home"
          >
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="text-base sm:text-xl font-semibold text-white leading-tight truncate">
              Coaching Session
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm leading-tight truncate">
              Talk to your AI sales coach
            </p>
          </div>
        </header>

        {/* Voice Chat Component */}
        <div className="flex-1 flex flex-col min-h-0">
          <VoiceChat onTranscriptUpdate={handleTranscriptUpdate} />
        </div>
      </div>

      {/* Sidebar - Only rendered on large screens */}
      {isLargeScreen && (
        <div className="w-96 flex flex-col bg-slate-800 border-l border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Conversation</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {conversation.length === 0 ? (
              <p className="text-slate-500 text-sm">Conversation will appear here...</p>
            ) : (
              conversation.map((msg, idx) => (
                <div key={idx} className={`text-sm ${msg.role === 'user' ? 'text-blue-300' : 'text-slate-300'}`}>
                  <span className="font-semibold">{msg.role === 'user' ? 'You' : 'Coach'}: </span>
                  {msg.content}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
