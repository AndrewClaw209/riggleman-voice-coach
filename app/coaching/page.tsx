'use client';

import { useState } from 'react';
import VoiceChat from '@/components/VoiceChat';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

function PocketCurtisContent() {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const { userProfile, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <main className="flex h-[100dvh] flex-col bg-slate-950 text-white">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f2cd7f] to-[#c58b2a] text-xl shadow-[0_4px_18px_rgba(226,167,63,0.2)]">C</div>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold sm:text-lg">Pocket Curtis</h1>
            <p className="truncate text-xs text-slate-400">Your on-demand sales advisor</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-slate-500 sm:block">{userProfile?.displayName || 'Sales professional'}</span>
          <button onClick={handleSignOut} className="rounded-lg px-2 py-2 text-xs text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">Sign out</button>
        </div>
      </header>

      <section className="min-h-0 flex-1">
        <VoiceChat onTranscriptUpdate={(message) => setConversation((current) => [...current, message])} />
      </section>

      {conversation.length > 0 ? <span className="sr-only">{conversation.length} messages in this conversation</span> : null}
    </main>
  );
}

export default function CoachingPage() {
  return <ProtectedRoute><PocketCurtisContent /></ProtectedRoute>;
}
