'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import VoiceChatRealtime from '@/components/VoiceChatRealtime';

export default function CoachingPage() {
  const [transcript, setTranscript] = useState<Array<{ role: string; content: string }>>([]);
  const [sessionActive, setSessionActive] = useState(true);

  const handleEndSession = () => {
    setSessionActive(false);
  };

  const handleNewSession = () => {
    setTranscript([]);
    setSessionActive(true);
  };

  const handleTranscriptUpdate = (newMessage: { role: string; content: string }) => {
    setTranscript((prev) => [...prev, newMessage]);
  };

  return (
    <main className="flex flex-col h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 px-6 py-4">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-white">Coaching Session</h1>
            <p className="text-slate-400 text-sm">
              {sessionActive ? 'Talk to your AI sales coach' : 'Session ended'}
            </p>
          </div>
          <Link
            href="/"
            className="text-slate-400 hover:text-white transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Voice Chat Area */}
        <div className="flex-1 flex flex-col border-r border-slate-700">
          {sessionActive ? (
            <VoiceChatRealtime onTranscriptUpdate={handleTranscriptUpdate} />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-6">
              <div className="text-center">
                <div className="text-6xl mb-4">✓</div>
                <h2 className="text-2xl font-semibold mb-2">Session Complete</h2>
                <p className="text-slate-400 mb-6">
                  Thank you for your coaching session. Review your transcript on the right.
                </p>
                <button
                  onClick={handleNewSession}
                  className="py-2 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg transition-colors"
                >
                  Start New Session
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Transcript Sidebar */}
        <div className="w-80 bg-slate-800 border-l border-slate-700 flex flex-col">
          <div className="px-6 py-4 border-b border-slate-700">
            <h3 className="text-lg font-semibold text-white">Transcript</h3>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcript.length === 0 ? (
              <p className="text-slate-400 text-sm text-center mt-8">
                Conversation will appear here...
              </p>
            ) : (
              transcript.map((message, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg text-sm ${
                    message.role === 'user'
                      ? 'bg-emerald-900 text-emerald-100'
                      : 'bg-slate-700 text-slate-100'
                  }`}
                >
                  <p className="font-semibold text-xs mb-1 opacity-75">
                    {message.role === 'user' ? 'You' : 'Coach'}
                  </p>
                  <p className="break-words">{message.content}</p>
                </div>
              ))
            )}
          </div>

          {sessionActive && transcript.length > 0 && (
            <div className="border-t border-slate-700 p-4">
              <button
                onClick={handleEndSession}
                className="w-full py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-colors"
              >
                End Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-slate-800 border-t border-slate-700 px-6 py-3 text-center text-slate-500 text-sm">
        <p>© 2026 AWEVO Software Solutions</p>
      </footer>
    </main>
  );
}
