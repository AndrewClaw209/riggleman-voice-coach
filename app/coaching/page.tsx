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
    <div className="flex h-screen bg-slate-900">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex flex-col p-4 sm:p-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Coaching Session</h1>
          <p className="text-slate-400 mb-4 text-sm sm:text-base">Talk to your AI sales coach</p>
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 mb-6 text-sm sm:text-base">
            ← Back to Home
          </Link>
          
          {/* Voice Chat Component - Full Width on Mobile */}
          <div className="flex-1 flex flex-col min-h-0">
            <VoiceChat onTranscriptUpdate={handleTranscriptUpdate} />
          </div>
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
