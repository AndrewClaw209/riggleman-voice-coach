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
      {/* Header */}
      <div className="border-b border-slate-700 p-6">
        <h1 className="text-3xl font-bold text-white mb-2">Coaching Session</h1>
        <p className="text-slate-400">Talk to your AI sales coach</p>
        <a href="/" className="text-emerald-400 hover:text-emerald-300 text-sm mt-2 inline-block">
          ← Back to Home
        </a>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-8 p-8">
        {/* Voice Chat Interface */}
        <div className="flex-1 min-w-0">
          <VoiceChat onTranscriptUpdate={handleTranscriptUpdate} />
        </div>

        {/* Transcript Panel */}
        <div className="w-80 bg-slate-800 rounded-lg border border-slate-700 p-6 flex flex-col">
          <h3 className="text-xl font-bold text-white mb-4">Transcript</h3>
          <div className="flex-1 overflow-y-auto space-y-4">
            {transcript.length === 0 ? (
              <p className="text-slate-500 text-sm">Conversation will appear here...</p>
            ) : (
              transcript.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-emerald-900 text-emerald-100'
                      : 'bg-blue-900 text-blue-100'
                  }`}
                >
                  <p className="text-xs font-semibold mb-1">
                    {msg.role === 'user' ? '🎤 You' : '🤖 Coach'}
                  </p>
                  <p className="text-sm break-words">{msg.content}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-700 p-6 text-center text-slate-500 text-sm">
        © 2026 AWEVO Software Solutions
      </div>
    </div>
  );
}
