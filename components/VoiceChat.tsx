'use client';

import { ConversationProvider, useConversation } from '@elevenlabs/react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

interface VoiceChatProps {
  onTranscriptUpdate: (message: ConversationMessage) => void;
}

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID || 'agent_3901m38dqc35exzr69sjdmsgk9m8';

type AgentMessage = {
  source?: 'user' | 'ai';
  message?: string;
  type?: string;
  user_transcription_event?: { user_transcript?: string };
  agent_response_event?: { agent_response?: string };
};

function AgentVoiceChat({ onTranscriptUpdate }: VoiceChatProps) {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const seenMessagesRef = useRef(new Set<string>());

  const addMessage = useCallback((message: ConversationMessage) => {
    const key = `${message.role}:${message.content}`;
    if (!message.content.trim() || seenMessagesRef.current.has(key)) return;
    seenMessagesRef.current.add(key);
    setConversation((current) => [...current, message]);
    onTranscriptUpdate(message);
  }, [onTranscriptUpdate]);

  const handleMessage = useCallback((payload: AgentMessage) => {
    if (payload.type === 'user_transcript' && payload.user_transcription_event?.user_transcript) {
      addMessage({ role: 'user', content: payload.user_transcription_event.user_transcript });
      return;
    }
    if (payload.type === 'agent_response' && payload.agent_response_event?.agent_response) {
      addMessage({ role: 'assistant', content: payload.agent_response_event.agent_response });
      return;
    }
    if (payload.source && payload.message) {
      addMessage({ role: payload.source === 'user' ? 'user' : 'assistant', content: payload.message });
    }
  }, [addMessage]);

  const {
    startSession,
    endSession,
    status,
    mode,
  } = useConversation({
    onMessage: handleMessage,
    onError: (message) => {
      setError(typeof message === 'string' ? message : 'The Curtis connection encountered an error.');
    },
    onDisconnect: () => undefined,
  });

  const start = async () => {
    try {
      setError(null);
      seenMessagesRef.current.clear();
      await startSession({
        agentId: AGENT_ID,
        connectionType: 'webrtc',
        userId: undefined,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to Curtis.');
    }
  };

  const stop = async () => {
    await endSession();
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation.length]);

  const connected = status === 'connected';
  const connecting = status === 'connecting';
  const busy = connected || connecting;
  const statusText = status === 'connecting'
    ? 'Connecting to Curtis…'
    : connected
        ? mode === 'speaking' ? 'Curtis is speaking' : 'Curtis is listening'
        : '';

  return <div className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex w-full max-w-2xl flex-col px-4 ${conversation.length ? 'py-5' : 'py-10'}`}>
        {!conversation.length && !busy ? <div className="mb-8 text-center">
          <div className="relative mx-auto mb-6 h-48 w-48 sm:h-60 sm:w-60"><Image src="/curtis-ai-logo.png" alt="Curtis AI" fill sizes="240px" className="object-contain" priority /></div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Talk to Curtis.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">A hands-free conversation with Curtis AI, grounded in his sales training and delivered in his authorized voice.</p>
        </div> : null}
        {statusText ? <div className="mb-5 self-center rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200" aria-live="polite">{statusText}</div> : null}
        {error ? <div className="mb-5 rounded-xl border border-red-900 bg-red-950/60 p-4 text-center text-sm text-red-200"><p>{error}</p><button onClick={() => setError(null)} className="mt-3 font-semibold text-white underline">Dismiss</button></div> : null}
        <div className="space-y-3">
          {conversation.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'ml-auto bg-emerald-900/60 text-emerald-50' : 'mr-auto border border-slate-700 bg-slate-800/80 text-slate-100'}`}><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{message.role === 'user' ? 'You' : 'Curtis'}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p></div>)}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
    <div className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      <button onClick={busy ? stop : start} disabled={connecting} className={`w-full rounded-xl px-6 py-4 text-lg font-bold shadow-lg transition-all disabled:opacity-50 ${connected ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-emerald-600'}`}>{connected ? 'End conversation' : connecting ? 'Connecting…' : 'Talk to Curtis'}</button>
      <p className="mt-2 text-center text-xs text-slate-500">Hands-free voice conversation with Curtis AI.</p>
    </div>
  </div>;
}

export default function VoiceChat(props: VoiceChatProps) {
  return <ConversationProvider><AgentVoiceChat {...props} /></ConversationProvider>;
}
