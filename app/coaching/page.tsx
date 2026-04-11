'use client';

import { useState } from 'react';
import VoiceChat from '@/components/VoiceChat';

export default function CoachingPage() {
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string }>>([]);

  const handleTranscriptUpdate = (message: { role: string; content: string }) => {
    setTranscript((prev) => [...prev, message]);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 flex flex-col">
      {/* Header - Compact on mobile */}
      <div className="border-b border-slate-700 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Sales Coaching</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">AI-Powered Feedback</p>
          </div>
          <a 
            href="/" 
            className="text-emerald-400 hover:text-emerald-300 text-xs sm:text-sm px-3 py-2 rounded-lg hover:bg-slate-700/50 transition-colors"
          >
            ← Home
          </a>
        </div>
      </div>

      {/* Main Content - Mobile-first layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 lg:gap-6 overflow-hidden">
        {/* Voice Chat - Takes full width on mobile */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <VoiceChat onTranscriptUpdate={handleTranscriptUpdate} />
        </div>

        {/* Transcript Sidebar - Hidden on mobile, shown on desktop */}
        <div className="hidden lg:flex w-96 flex-col bg-slate-800 border-l border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-700 flex-shrink-0">
            <h3 className="text-lg font-bold text-white">Conversation</h3>
            <p className="text-xs text-slate-400 mt-1">{transcript.length / 2} turns</p>
          </div>
          
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {transcript.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <p className="text-slate-500 text-sm text-center">Start a conversation to see the transcript here</p>
              </div>
            ) : (
              transcript.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg text-sm ${
                    msg.role === 'user'
                      ? 'bg-emerald-900/50 text-emerald-100'
                      : 'bg-blue-900/50 text-blue-100'
                  }`}
                >
                  <p className="text-xs font-semibold mb-1">
                    {msg.role === 'user' ? '🎤 You' : '🤖 Coach'}
                  </p>
                  <p className="text-xs break-words">{msg.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer - Compact */}
      <div className="border-t border-slate-700 px-4 py-3 text-center text-slate-500 text-xs">
        © 2026 AWEVO Software Solutions
      </div>
    </div>
  );
}
