'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';

type ConversationMessage = { role: 'user' | 'assistant'; content: string };
type KnowledgeResult = { context?: string };
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
  const livePeerRef = useRef<RTCPeerConnection | null>(null);
  const liveChannelRef = useRef<RTCDataChannel | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const livePartialRef = useRef({ user: '', assistant: '' });
  const liveMessagesRef = useRef<ConversationMessage[]>([]);
  const liveResponsePendingRef = useRef(false);
  const { user } = useAuth();
  const bottomRef = useRef<HTMLDivElement>(null);
  const liveEnabled = process.env.NEXT_PUBLIC_ENABLE_LIVE_COACHING === 'true';

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

  const handleLiveEvent = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data as string) as { type?: string; delta?: string; transcript?: string; text?: string };
      const type = payload.type || '';
      const userDelta = type.includes('input_audio_transcription.delta') || type === 'session.input_transcript.delta';
      const userFinal = type.includes('input_audio_transcription.completed') || type === 'session.input_transcript.done' || type === 'session.input_transcript.completed';
      const assistantDelta = type === 'response.text.delta' || type === 'response.audio_transcript.delta' || type === 'response.output_audio_transcript.delta' || type === 'session.output_transcript.delta';
      const assistantFinal = type === 'response.text.done' || type === 'response.output_text.done' || type === 'response.audio_transcript.done' || type === 'response.output_audio_transcript.done' || type === 'session.output_transcript.done' || type === 'session.output_transcript.completed';
      if (!userDelta && !userFinal && !assistantDelta && !assistantFinal) return;
      const role = userDelta || userFinal ? 'user' : 'assistant';
      if (userDelta || assistantDelta) {
        livePartialRef.current[role] += payload.delta || '';
        return;
      }
      const text = (payload.transcript || payload.text || livePartialRef.current[role]).trim();
      livePartialRef.current[role] = '';
      if (!text) return;
      const previous = liveMessagesRef.current.at(-1);
      if (previous?.role === role && previous.content === text) return;
      const message = { role, content: text } as ConversationMessage;
      liveMessagesRef.current.push(message);
      addMessage(message);
      if (role === 'user') void requestLiveResponse(text);
      if (role === 'assistant') void speakLiveResponse(text);
    } catch { /* Ignore non-JSON WebRTC events. */ }
  };

  const requestLiveResponse = async (question: string) => {
    const channel = liveChannelRef.current;
    if (!channel || channel.readyState !== 'open' || liveResponsePendingRef.current) return;
    liveResponsePendingRef.current = true;
    try {
      const token = await user?.getIdToken();
      if (!token) return;
      const response = await fetch('/api/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ query: question }) });
      const result = await response.json() as KnowledgeResult;
      const context = response.ok && result.context ? result.context : 'No directly relevant excerpt was found in the indexed Curtis material. Do not pretend a generic answer came from Curtis’s books; say the material does not directly cover it and ask one clarifying question.';
      channel.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text'], max_output_tokens: 260, instructions: `Answer the user's latest question from Curtis Riggleman's teachings below, not from generic sales advice. First identify the applicable Curtis principle or framework in your own words, then apply it to the situation. Whenever the excerpts contain a word track, question, example, or key takeaway, use that language faithfully and give one exact word track the salesperson can say. Prefer Curtis's methods such as asking why, uncovering the problem, emotion creating motion, value over price, keeping yourself in the middle, getting comfortable with silence, and using the customer's own hot points—but only when supported by the excerpts. Give 2-4 short spoken sentences, usually under 90 words. Be specific and practical, with natural punctuation and pauses. Do not mention retrieval, excerpts, or source labels unless asked. Do not invent details or present generic advice as Curtis's teaching.\n\nCURTIS BOOK EXCERPTS:\n${context}` } }));
    } catch {
      channel.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text'], max_output_tokens: 260, instructions: 'Answer as Curtis AI using a specific principle from Curtis Riggleman’s books. Do not give generic sales advice. Name the principle naturally, apply it to the user’s situation, and include a concise word track or question the salesperson can use. Give 2-4 short spoken sentences with natural pauses. If you cannot tie the answer to a known Curtis teaching, say that plainly instead of inventing one.' } }));
    } finally {
      liveResponsePendingRef.current = false;
    }
  };

  const speakLiveResponse = async (text: string) => {
    try {
      setStage('speaking');
      const token = await user?.getIdToken();
      if (!token) return;
      const response = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ text }) });
      const result = await response.json() as { audio?: string };
      if (response.ok && result.audio) await playAudio(result.audio);
      if (livePeerRef.current) setStage('live');
    } catch { if (livePeerRef.current) setStage('live'); }
  };

  const startLive = async () => {
    let stream: MediaStream | null = null;
    try {
      setError(null); setStage('connecting'); liveMessagesRef.current = []; livePartialRef.current = { user: '', assistant: '' };
      const token = await user?.getIdToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      liveStreamRef.current = stream;
      const peer = new RTCPeerConnection();
      livePeerRef.current = peer;
      // Do not attach OpenAI's stock audio track. Responses are synthesized by ElevenLabs below.
      stream.getTracks().forEach((track) => peer.addTrack(track, stream as MediaStream));
      const channel = peer.createDataChannel('oai-events');
      liveChannelRef.current = channel;
      channel.addEventListener('message', handleLiveEvent);
      channel.addEventListener('open', () => {
        setStage('live');
        channel.send(JSON.stringify({ type: 'session.update', session: { modalities: ['text'], instructions: 'You are Curtis AI, an AI advisor grounded in Curtis Riggleman’s books. Never answer with generic sales advice when a Curtis teaching applies. Before each answer, use the book excerpts supplied in the response instructions to identify a named principle, example, question, or word track, then make it practical for the user. Be direct and conversational, but specific. Give 2-4 short spoken sentences, usually under 90 words, with natural pauses. Do not pretend to be the real Curtis or invent unsupported facts. If the books do not directly cover the question, say that briefly instead of fabricating a Curtis method.', input_audio_transcription: { model: 'gpt-4o-transcribe' }, turn_detection: { type: 'server_vad', create_response: false, interrupt_response: true } } }));
        channel.send(JSON.stringify({ type: 'response.create', response: { modalities: ['text'], max_output_tokens: 80, instructions: 'Welcome the user in one relaxed sentence, then ask what sales question you can help with.' } }));
      });
      channel.addEventListener('error', () => setError('Live voice connection failed. Try again.'));
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
      stream?.getTracks().forEach((track) => track.stop());
      livePeerRef.current?.close(); livePeerRef.current = null; liveChannelRef.current = null;
      setStage('error'); setError(cause instanceof Error ? cause.message : 'Could not start live voice');
    }
  };

  const stopLive = () => {
    liveChannelRef.current?.close(); livePeerRef.current?.close(); liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveChannelRef.current = null; livePeerRef.current = null; liveStreamRef.current = null; liveResponsePendingRef.current = false;
    setStage('idle');
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
  useEffect(() => () => stopLive(), []);

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
      {liveEnabled ? <button onClick={stage === 'live' || stage === 'speaking' ? stopLive : startLive} disabled={busy && stage !== 'live' && stage !== 'speaking'} className={`w-full rounded-xl px-6 py-4 text-lg font-bold shadow-lg transition-all disabled:opacity-50 ${stage === 'live' || stage === 'speaking' ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-500 hover:to-emerald-600'}`}>{stage === 'live' || stage === 'speaking' ? 'End conversation' : 'Talk to Curtis'}</button> : !mediaRecorderRef.current || stage !== 'recording' ? <button onClick={startRecording} disabled={busy} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 text-lg font-bold text-white shadow-lg transition-all hover:from-emerald-500 hover:to-emerald-600 disabled:opacity-50"><span className="text-2xl">🎙️</span>{conversation.length ? 'Ask another question' : 'Talk to Curtis'}</button> : <button onClick={stopRecording} className="flex w-full items-center justify-center gap-3 rounded-xl bg-gradient-to-r from-red-600 to-red-700 px-6 py-4 text-lg font-bold text-white shadow-lg"><span className="text-2xl">⏹️</span>Done speaking</button>}
      <p className="mt-2 text-center text-xs text-slate-500">Voice answers grounded in Curtis’s sales and leadership material.</p>
    </div>
  </div>;
}
