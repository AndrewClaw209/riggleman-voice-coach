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
  const [useLive, setUseLive] = useState(process.env.NEXT_PUBLIC_ENABLE_LIVE_COACHING === 'true');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const livePeerRef = useRef<RTCPeerConnection | null>(null);
  const liveChannelRef = useRef<RTCDataChannel | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveTranscriptRef = useRef<ConversationMessage[]>([]);
  const partialRef = useRef({ user: '', assistant: '' });
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

  const handleLiveEvent = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data as string) as { type?: string; transcript?: string; delta?: string };
      const type = payload.type || '';
      const userDelta = type.includes('input_audio_transcription.delta') || type === 'session.input_transcript.delta';
      const userFinal = type.includes('input_audio_transcription.completed') || type === 'session.input_transcript.done' || type === 'session.input_transcript.completed';
      const assistantDelta = type === 'response.audio_transcript.delta' || type === 'response.output_audio_transcript.delta' || type === 'response.text.delta' || type === 'session.output_transcript.delta';
      const assistantFinal = type === 'response.audio_transcript.done' || type === 'response.output_audio_transcript.done' || type === 'response.text.done' || type === 'session.output_transcript.done' || type === 'session.output_transcript.completed';
      if (!userDelta && !userFinal && !assistantDelta && !assistantFinal) return;
      const role = userDelta || userFinal ? 'user' : 'assistant';
      if (userDelta || assistantDelta) { partialRef.current[role] += payload.delta || ''; return; }
      const text = (payload.transcript || partialRef.current[role]).trim();
      partialRef.current[role] = '';
      if (!text) return;
      const previous = liveTranscriptRef.current.at(-1);
      if (previous?.role === role && previous.content === text) return;
      const message = { role, content: text } as ConversationMessage;
      liveTranscriptRef.current.push(message);
      addMessage(message);
    } catch { /* Ignore non-JSON WebRTC events. */ }
  };

  const startLive = async () => {
    try {
      setError(null); setStage('connecting');
      const token = await user?.getIdToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      liveStreamRef.current = stream;
      const peer = new RTCPeerConnection();
      livePeerRef.current = peer;
      peer.ontrack = (event) => { const audio = audioRef.current || new Audio(); audioRef.current = audio; audio.srcObject = event.streams[0]; audio.play().catch(() => {}); };
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const channel = peer.createDataChannel('oai-events');
      liveChannelRef.current = channel;
      channel.addEventListener('message', handleLiveEvent);
      channel.addEventListener('open', () => {
        setStage('live');
        channel.send(JSON.stringify({ type: 'response.create', response: { modalities: ['audio', 'text'], instructions: 'Welcome the user to Pocket Curtis in one short sentence, then ask what sales question you can help with.' } }));
      });
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch('/api/live/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ sdp: offer.sdp }) });
      const result = await response.json() as { error?: string; transport?: { sdp?: string }; sdp?: string };
      if (!response.ok) throw new Error(result.error || 'Could not start live voice');
      const answer = result.transport?.sdp || result.sdp;
      if (!answer) throw new Error('Live session returned no SDP answer');
      await peer.setRemoteDescription({ type: 'answer', sdp: answer });
      setStage('live');
    } catch (cause) {
      liveStreamRef.current?.getTracks().forEach((track) => track.stop());
      livePeerRef.current?.close();
      setUseLive(false);
      setStage('error');
      setError(cause instanceof Error ? cause.message : 'Could not start live voice');
    }
  };

  const stopLive = () => {
    liveChannelRef.current?.close(); livePeerRef.current?.close(); liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveChannelRef.current = null; livePeerRef.current = null; liveStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setStage('idle');
  };

  useEffect(() => () => stopLive(), []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [conversation.length, stage]);

  const busy = stage !== 'idle' && stage !== 'error';
  const status: Record<ProcessingStage, string> = { idle: '', connecting: 'Connecting to Curtis…', live: 'Curtis is listening', recording: 'Listening…', transcribing: 'Transcribing…', thinking: 'Curtis is thinking…', speaking: 'Curtis is speaking…', error: 'Something went wrong' };

  return <div className="flex h-full min-h-0 flex-col">
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className={`mx-auto flex w-full max-w-2xl flex-col px-4 ${conversation.length ? 'py-5' : 'py-10'}`}>
        {!conversation.length && stage === 'idle' ? <div className="mb-8 text-center">
          <div className="relative mx-auto mb-6 h-48 w-48 sm:h-60 sm:w-60"><Image src="/curtis-ai-logo.png" alt="Pocket Curtis" fill sizes="240px" className="object-contain" priority /></div>
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
      {process.env.NEXT_PUBLIC_ENABLE_LIVE_COACHING === 'true' && useLive ? <button onClick={stage === 'live' ? stopLive : startLive} disabled={busy && stage !== 'live'} className={`w-full rounded-xl px-6 py-4 text-lg font-bold shadow-lg transition-all disabled:opacity-50 ${stage === 'live' ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-gradient-to-r from-[#f2cd7f] to-[#c58b2a] text-[#17120a] hover:from-[#f7d995] hover:to-[#e2a73f]'}`}>{stage === 'live' ? 'End conversation' : 'Talk to Curtis'}</button> : !mediaRecorderRef.current || stage !== 'recording' ? <button onClick={startRecording} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-lg font-bold text-white shadow-lg transition-all hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50"><span className="text-2xl">🎙️</span>{conversation.length ? 'Ask another question' : 'Talk to Curtis'}</button> : <button onClick={stopRecording} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 text-lg font-bold text-white shadow-lg"><span className="text-2xl">⏹️</span>Done speaking</button>}
      <p className="mt-2 text-center text-xs text-slate-500">Voice answers grounded in Curtis’s sales and leadership material.</p>
    </div>
  </div>;
}
