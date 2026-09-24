'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };
type ProcessingStage = 'idle' | 'connecting' | 'live' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';

interface VoiceChatProps {
  onTranscriptUpdate: (message: ConversationMessage) => void;
}

export default function VoiceChat({ onTranscriptUpdate }: VoiceChatProps) {
  const [stage, setStage] = useState<ProcessingStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [lastUserText, setLastUserText] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);

  const addMessage = (message: ConversationMessage) => {
    setConversation((current) => [...current, message]);
    onTranscriptUpdate(message);
    if (message.role === 'user') setLastUserText(message.content);
  };

  const playAudio = async (base64: string) => {
    const audio = audioRef.current || new Audio();
    audioRef.current = audio;
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/mpeg' }));
    audio.src = url;
    try { await audio.play(); } catch { /* Browser may require another gesture. */ }
    audio.onended = () => URL.revokeObjectURL(url);
  };

  const startRecording = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(new Blob(audioChunksRef.current, { type: recorder.mimeType || mimeType || 'audio/webm' }));
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setStage('recording');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Microphone access failed');
      setStage('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && stage === 'recording') {
      mediaRecorderRef.current.stop();
      setStage('transcribing');
    }
  };

  const processAudio = async (blob: Blob) => {
    try {
      setStage('thinking');
      const token = await user?.getIdToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the recording'));
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(blob);
      });
      const response = await fetch('/api/simple-coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audio: base64, audioType: blob.type, conversation }),
      });
      const result = await response.json() as { error?: string; userText?: string; coachResponse?: string; audio?: string };
      if (!response.ok || !result.userText || !result.coachResponse) throw new Error(result.error || 'Could not get Curtis\'s response');
      addMessage({ role: 'user', content: result.userText });
      addMessage({ role: 'assistant', content: result.coachResponse });
      if (result.audio) { setStage('speaking'); await playAudio(result.audio); }
      setStage('idle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not process your question');
      setStage('error');
    }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation.length, stage]);

  const busy = stage !== 'idle' && stage !== 'error';
  const status: Record<ProcessingStage, string> = { idle: '', connecting: 'Connecting to Curtis…', live: 'Curtis is listening', recording: 'Listening…', transcribing: 'Transcribing…', thinking: 'Curtis is thinking…', speaking: 'Curtis is speaking…', error: 'Something went wrong' };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex w-full max-w-2xl flex-col px-4 ${conversation.length ? 'py-5' : 'py-10'}`}>
        {!conversation.length && stage === 'idle' ? <div className="mb-8 text-center">
          <div className="relative mx-auto mb-6 h-48 w-48 sm:h-60 sm:w-60"><Image src="/curtis-ai-logo.png" alt="Curtis AI" fill sizes="240px" className="object-contain" priority /></div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">Ask Curtis anything.</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-400">Get practical answers on sales, objections, calls, closing, leadership, and the principles from Curtis’s books.</p>
        </div> : null}
        {status[stage] ? <div className="mb-5 self-center rounded-full bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200" aria-live="polite">{status[stage]}</div> : null}
        {error ? <div className="mb-5 rounded-xl border border-red-900 bg-red-950/60 p-4 text-center text-sm text-red-200"><p>{error}</p><button onClick={() => { setError(null); setStage('idle'); }} className="mt-3 font-semibold text-white underline">Try again</button></div> : null}
        {lastUserText && stage !== 'idle' && !conversation.length ? <p className="mb-4 text-center text-sm text-slate-400">“{lastUserText}”</p> : null}
        <div className="space-y-3">
          {conversation.map((message, index) => <div key={`${message.role}-${index}`} className={`max-w-[88%] rounded-2xl px-4 py-3 ${message.role === 'user' ? 'ml-auto bg-emerald-900/60 text-emerald-50' : 'mr-auto border border-slate-700 bg-slate-800/80 text-slate-100'}`}><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">{message.role === 'user' ? 'You' : 'Curtis'}</p><p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p></div>)}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
    <div className="shrink-0 border-t border-slate-800 bg-slate-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
      {!mediaRecorderRef.current || stage !== 'recording' ? <button onClick={startRecording} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-lg font-bold text-white shadow-lg transition-all hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50"><span className="text-2xl">🎙️</span>{conversation.length ? 'Ask another question' : 'Talk to Curtis'}</button> : <button onClick={stopRecording} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 text-lg font-bold text-white shadow-lg"><span className="text-2xl">⏹️</span>Done speaking</button>}
      <p className="mt-2 text-center text-xs text-slate-500">Voice answers grounded in Curtis’s sales and leadership material.</p>
    </div>
  </div>;
}
