'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/AuthContext';
import { SCENARIOS, type Scenario, type Score } from '@/lib/coaching';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface VoiceChatProps {
  onTranscriptUpdate: (message: ConversationMessage) => void;
  onSessionStarted?: () => void | Promise<void>;
  onTurnComplete?: (turn: { userText: string; coachResponse: string; score: Score }) => void;
  onSessionScored?: (result: { score: Score; summary: string; strengths: string[]; improvements: string[]; transcript: ConversationMessage[] }) => void;
  scenario: Scenario;
}

type ProcessingStage = 'idle' | 'connecting' | 'live' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export default function VoiceChat({ onTranscriptUpdate, onSessionStarted, onTurnComplete, onSessionScored, scenario }: VoiceChatProps) {
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [lastUserText, setLastUserText] = useState<string>('');
  const [showEndConfirmation, setShowEndConfirmation] = useState(false);
  const [liveCaptureCounts, setLiveCaptureCounts] = useState({ user: 0, assistant: 0 });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const livePeerRef = useRef<RTCPeerConnection | null>(null);
  const liveChannelRef = useRef<RTCDataChannel | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveTranscriptRef = useRef<ConversationMessage[]>([]);
  const livePartialTranscriptRef = useRef<{ user: string; assistant: string }>({ user: '', assistant: '' });
  const { user } = useAuth();
  const liveEnabled = process.env.NEXT_PUBLIC_ENABLE_LIVE_COACHING === 'true';
  const [useLive, setUseLive] = useState(liveEnabled);

  // 44-byte zero-length WAV — used once, synchronously in a user-gesture
  // handler, to unlock the Audio element on iOS Safari so later programmatic
  // .play() calls succeed.
  const SILENT_WAV =
    'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

  const primeAudio = () => {
    if (audioRef.current) return;
    const audio = new Audio();
    audio.src = SILENT_WAV;
    audio.play().catch(() => {});
    audioRef.current = audio;
  };

  const startRecording = async () => {
    try {
      setError(null);
      primeAudio();
      setProcessingStage('recording');

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      await onSessionStarted?.();

      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
        .find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType || mimeType || 'audio/webm' });
        
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Microphone access failed';
      setError(errorMsg);
      setProcessingStage('error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && processingStage === 'recording') {
      primeAudio();
      mediaRecorderRef.current.stop();
      setProcessingStage('transcribing');
    }
  };

  const handleLiveEvent = (event: MessageEvent) => {
    try {
      const payload = JSON.parse(event.data as string) as {
        type?: string;
        transcript?: string;
        delta?: string;
      };
      const type = payload.type || '';
      // Live emits these events independently from the audio stream. Keeping
      // them explicit is important: hearing audio does not mean we captured
      // text for the scorecard.
      const isUserDelta = type === 'session.input_transcript.delta' ||
        type === 'conversation.item.input_audio_transcription.delta';
      const isUserFinal = type === 'session.input_transcript.done' ||
        type === 'session.input_transcript.completed' ||
        type === 'conversation.item.input_audio_transcription.completed';
      const isAssistantDelta = type === 'session.output_transcript.delta' ||
        type === 'response.audio_transcript.delta' ||
        type === 'response.output_audio_transcript.delta' ||
        type === 'response.text.delta';
      const isAssistantFinal = type === 'session.output_transcript.done' ||
        type === 'session.output_transcript.completed' ||
        type === 'response.audio_transcript.done' ||
        type === 'response.output_audio_transcript.done' ||
        type === 'response.text.done';

      if (!isUserDelta && !isUserFinal && !isAssistantDelta && !isAssistantFinal) return;

      const role = isUserDelta || isUserFinal ? 'user' : 'assistant';
      const partial = livePartialTranscriptRef.current[role];
      const incoming = payload.delta || '';
      const finalized = payload.transcript || '';

      if (isUserDelta || isAssistantDelta) {
        if (!incoming) return;
        livePartialTranscriptRef.current[role] = `${partial}${incoming}`;
        return;
      }

      // Final events may contain the complete transcript, or may only signal
      // completion after a sequence of delta events. Prefer the complete text
      // and fall back to the accumulated partial transcript.
      const text = (finalized || livePartialTranscriptRef.current[role]).trim();
      livePartialTranscriptRef.current[role] = '';
      if (!text) return;

      const message: ConversationMessage = { role, content: text };
      // A provider can send a completed transcript after the final delta.
      // Do not add the same utterance twice.
      const previous = liveTranscriptRef.current[liveTranscriptRef.current.length - 1];
      if (previous?.role === role && previous.content === text) return;
      liveTranscriptRef.current.push(message);
      onTranscriptUpdate(message);
      setLiveCaptureCounts((counts) => ({ ...counts, [role]: counts[role] + 1 }));
      if (role === 'user') setLastUserText(text);
    } catch {
      // Ignore non-JSON browser events; the audio connection can continue.
    }
  };

  const startLiveSession = async () => {
    let stream: MediaStream | null = null;
    try {
      liveTranscriptRef.current = [];
      livePartialTranscriptRef.current = { user: '', assistant: '' };
      setLiveCaptureCounts({ user: 0, assistant: 0 });
      setError(null);
      setProcessingStage('connecting');
      primeAudio();
      const token = await user?.getIdToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');

      const microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = microphone;
      liveStreamRef.current = microphone;
      await onSessionStarted?.();
      const peer = new RTCPeerConnection();
      livePeerRef.current = peer;
      peer.ontrack = (event) => {
        const audio = audioRef.current;
        if (!audio) return;
        audio.srcObject = event.streams[0];
        audio.play().catch((err) => console.warn('[VoiceChat] Live audio play failed:', err));
      };
      microphone.getTracks().forEach((track) => peer.addTrack(track, microphone));

      const channel = peer.createDataChannel('oai-events');
      liveChannelRef.current = channel;
      channel.addEventListener('message', handleLiveEvent);
      channel.addEventListener('open', () => {
        setProcessingStage('live');
        // GPT Live does not speak until a response is requested. Ask for a
        // short, scenario-specific welcome so the user immediately knows the
        // connection worked and exactly how to begin the role-play.
        channel.send(JSON.stringify({
          type: 'response.create',
          response: {
            modalities: ['audio', 'text'],
            instructions: SCENARIOS[scenario].welcome,
          },
        }));
      });
      channel.addEventListener('error', () => setError('Live voice connection failed. Try the standard recorder.'));

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const response = await fetch('/api/live/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sdp: offer.sdp, scenario }),
      });
      const result = await response.json() as { error?: string; transport?: { sdp?: string }; sdp?: string };
      if (!response.ok) throw new Error(result.error || 'Could not start live coaching');
      const answerSdp = result.transport?.sdp || result.sdp;
      if (!answerSdp) throw new Error('Live session returned no SDP answer');
      await peer.setRemoteDescription({ type: 'answer', sdp: answerSdp });
      setProcessingStage('live');
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      livePeerRef.current?.close();
      livePeerRef.current = null;
      liveChannelRef.current = null;
      liveStreamRef.current = null;
      setError(err instanceof Error ? err.message : 'Could not start live coaching');
      setUseLive(false);
      setProcessingStage('error');
    }
  };

  const stopLiveSession = () => {
    setShowEndConfirmation(true);
  };

  const finalizeLiveSession = () => {
    setShowEndConfirmation(false);
    const transcript = liveTranscriptRef.current;

    // A user can end the call between a transcript delta and its finalized
    // event. Preserve that speech so a short final turn can still be scored.
    for (const role of ['user', 'assistant'] as const) {
      const pending = livePartialTranscriptRef.current[role].trim();
      if (pending) {
        const message: ConversationMessage = { role, content: pending };
        transcript.push(message);
        onTranscriptUpdate(message);
        setLiveCaptureCounts((counts) => ({ ...counts, [role]: counts[role] + 1 }));
      }
    }
    livePartialTranscriptRef.current = { user: '', assistant: '' };
    liveChannelRef.current?.close();
    livePeerRef.current?.close();
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
    liveChannelRef.current = null;
    livePeerRef.current = null;
    liveStreamRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setProcessingStage('idle');
    if (transcript.some((message) => message.role === 'user')) {
      void scoreLiveSession(transcript);
    } else {
      setError('No salesperson responses were captured, so there is nothing to score yet.');
    }
  };

  const scoreLiveSession = async (transcript: ConversationMessage[]) => {
    try {
      setProcessingStage('thinking');
      const token = await user?.getIdToken();
      if (!token) throw new Error('Your session expired. Please sign in again.');
      const response = await fetch('/api/score-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ transcript, scenario }),
      });
      const result = await response.json() as { error?: string; score?: Score; summary?: string; strengths?: string[]; improvements?: string[] };
      if (!response.ok || !result.score) throw new Error(result.error || 'Could not generate scorecard');
      onSessionScored?.({
        score: result.score,
        summary: result.summary || '',
        strengths: result.strengths || [],
        improvements: result.improvements || [],
        transcript,
      });
      setProcessingStage('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate scorecard');
      setProcessingStage('error');
    }
  };

  useEffect(() => () => {
    liveChannelRef.current?.close();
    livePeerRef.current?.close();
    liveStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const playBufferedAudio = async (stream: ReadableStream<Uint8Array>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const buffered = await new Response(stream).arrayBuffer();
    const blob = new Blob([buffered], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve) => {
        const finish = () => {
          audio.removeEventListener('ended', finish);
          audio.removeEventListener('error', finish);
          clearTimeout(timeout);
          resolve();
        };
        audio.addEventListener('ended', finish, { once: true });
        audio.addEventListener('error', finish, { once: true });
        const timeout = setTimeout(finish, 60000);
        audio.src = url;
        audio.play().catch((err) => {
          console.error('[VoiceChat] Audio play() failed:', err);
          finish();
        });
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read the recording'));
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.readAsDataURL(audioBlob);
      });
        setProcessingStage('thinking');
        const token = await user?.getIdToken();
        if (!token) throw new Error('Your session expired. Please sign in again.');

        const response = await fetch('/api/simple-coach', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            audio: base64Audio,
            audioType: audioBlob.type,
            conversation,
            scenario,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to get coaching response' }));
          const detail = [errorData.stage, errorData.detail]
            .filter((value): value is string => typeof value === 'string' && value.length > 0)
            .join(': ');
          throw new Error(
            [errorData.error || 'Failed to get coaching response', detail]
              .filter(Boolean)
              .join(' — ')
          );
        }

        const result = await response.json() as { userText: string; coachResponse: string; audio: string; score: Score };
        const { userText, coachResponse, score } = result;

        setConversation((prev) => [
          ...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: coachResponse },
        ]);
        setLastUserText(userText);
        onTranscriptUpdate({ role: 'user', content: userText });
        onTranscriptUpdate({ role: 'assistant', content: coachResponse });
        onTurnComplete?.({ userText, coachResponse, score });

        if (result.audio) {
          setProcessingStage('speaking');
          const bytes = Uint8Array.from(atob(result.audio), (char) => char.charCodeAt(0));
          await playBufferedAudio(new Response(bytes).body!);
        }

        setProcessingStage('idle');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMsg);
      setProcessingStage('error');
    }
  };

  const isProcessing = processingStage !== 'idle' && processingStage !== 'error';
  const isRecording = processingStage === 'recording';
  const hasConversation = conversation.length > 0;

  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conversation.length, processingStage]);

  // Stage info for display
  const stageInfo = {
    connecting: { emoji: '☎️', text: 'Connecting live coach...', color: 'bg-[#c58b2a] text-[#17120a]' },
    live: { emoji: '🟢', text: 'Live coaching', color: 'bg-emerald-600' },
    recording: { emoji: '🎤', text: 'Recording...', color: 'bg-red-600' },
    transcribing: { emoji: '📝', text: 'Transcribing...', color: 'bg-blue-600' },
    thinking: { emoji: '💭', text: 'Thinking...', color: 'bg-yellow-600' },
    speaking: { emoji: '🔊', text: 'Speaking...', color: 'bg-purple-600' },
    idle: { emoji: '✅', text: 'Ready', color: 'bg-emerald-600' },
    error: { emoji: '⚠️', text: 'Error', color: 'bg-red-700' },
  };

  const stage = stageInfo[processingStage];

  return (
    <div className="flex flex-col h-full w-full min-h-0">
      {/* Scrollable content region */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div
          className={`max-w-2xl mx-auto w-full flex flex-col items-center px-4 ${
            hasConversation ? 'py-4' : 'py-8'
          }`}
        >
          {/* Show live activity, errors, and processing states without a
              persistent "Ready" badge taking up the center of the page. */}
          {processingStage !== 'idle' && (
            <div
              className={`${stage.color} rounded-full text-white font-semibold flex items-center gap-2 transition-all ${
                hasConversation ? 'px-4 py-1.5 mb-4 text-sm' : 'px-6 py-3 mb-6 text-base'
              }`}
            >
              <span className={hasConversation ? 'text-base' : 'text-2xl'}>
                {stage.emoji}
              </span>
              <span>{stage.text}</span>
            </div>
          )}

          {/* Large visual progress indicator — only before the first turn */}
          {isProcessing && !hasConversation && (
            <div className="mb-6 w-24 h-24 flex items-center justify-center">
              <div className="relative w-full h-full">
                <div className="absolute inset-0 rounded-full border-4 border-slate-700 animate-pulse" />
                <div className="absolute inset-1 rounded-full border-4 border-transparent border-t-emerald-400 border-r-emerald-400 animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center text-3xl">
                  {processingStage === 'recording' && '🎙️'}
                  {processingStage === 'transcribing' && '📄'}
                  {processingStage === 'thinking' && '🧠'}
                  {processingStage === 'speaking' && '🔊'}
                </div>
              </div>
            </div>
          )}

          {/* Last transcribed text preview during processing (pre-conversation) */}
          {lastUserText && isProcessing && !hasConversation && (
            <div className="mb-6 px-5 py-3 bg-slate-700/80 rounded-lg max-w-sm w-full text-center">
              <p className="text-xs text-slate-400 mb-1">You said:</p>
              <p className="text-sm text-slate-200">{lastUserText}</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mb-6 px-5 py-3 bg-red-900/80 rounded-lg max-w-sm w-full text-center">
              <p className="text-sm text-red-200 font-semibold">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setProcessingStage('idle');
                }}
                className="mt-3 px-4 py-2 bg-red-700 hover:bg-red-600 text-white text-xs rounded-lg font-semibold transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Intro — only when idle and nothing has happened yet */}
          {processingStage === 'idle' && !hasConversation && (
            <div className="text-center mb-6 max-w-sm">
              <p className="text-base text-slate-300 font-semibold mb-2">
                Pick a scenario, then start live coaching
              </p>
              <p className="text-sm text-slate-400">
                Curtis will answer the phone and explain the role-play when you connect. After he finishes, start the call as the salesperson.
              </p>
              <div className="relative mx-auto mt-6 h-112 w-112 max-w-[calc(100vw-2rem)]">
                <Image
                  src="/curtis-ai-logo.png"
                  alt="Curtis Riggleman AI"
                  fill
                  sizes="(max-width: 640px) 100vw, 384px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>
          )}

          {/* Conversation transcript */}
          {hasConversation && (
            <div className="w-full space-y-2">
              {conversation.map((msg, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-emerald-900/60 text-emerald-100 ml-6'
                      : 'bg-blue-900/60 text-blue-100 mr-6'
                  }`}
                >
                  <p className="font-semibold text-xs mb-1 opacity-80">
                    {msg.role === 'user' ? '🎤 You (Salesperson)' : `🤖 ${useLive ? 'Customer' : 'Coach'}`}
                  </p>
                  <p className="text-sm break-words whitespace-pre-wrap">
                    {msg.content}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Pinned action bar */}
      <div
        className="shrink-0 border-t border-slate-800 bg-slate-900/95 backdrop-blur px-4 pt-3"
        style={{
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))',
        }}
      >
        {liveEnabled && useLive ? (
          <button
            onClick={processingStage === 'live' ? stopLiveSession : startLiveSession}
            disabled={processingStage === 'connecting' || isProcessing && processingStage !== 'live'}
            className={`w-full py-4 px-6 ${processingStage === 'live' ? 'bg-red-700 hover:bg-red-600' : 'bg-gradient-to-r from-[#f2cd7f] to-[#c58b2a] hover:from-[#f7d995] hover:to-[#e2a73f] text-[#17120a] shadow-[0_8px_24px_rgba(226,167,63,0.3)]'} disabled:from-slate-600 disabled:to-slate-600 disabled:opacity-50 font-bold text-lg rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3`}
          >
            {processingStage === 'live' && <span className="text-2xl">⏹️</span>}
            <span>{processingStage === 'live' ? 'End Live Coaching' : '2. Start Live Coaching'}</span>
          </button>
        ) : !isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="w-full py-4 px-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:from-slate-600 disabled:to-slate-600 disabled:opacity-50 text-white font-bold text-lg rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <span className="text-2xl">🎤</span>
            <span>{hasConversation ? 'Continue Talking' : 'Start Coaching'}</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full py-4 px-6 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-lg rounded-xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-3 animate-pulse"
          >
            <span className="text-2xl">⏹️</span>
            <span>Stop &amp; Process</span>
          </button>
        )}

        {liveEnabled && useLive && (
          <div className="mt-2 text-center text-xs text-slate-500">
            {processingStage === 'live' && (
              <p className="mt-1 text-slate-400" aria-live="polite">
                Curtis is on the line. Listen to his welcome, then begin as the salesperson.
                <span className="block mt-1 text-slate-500">
                  {liveCaptureCounts.user} salesperson response{liveCaptureCounts.user === 1 ? '' : 's'} · {liveCaptureCounts.assistant} customer response{liveCaptureCounts.assistant === 1 ? '' : 's'} captured
                </span>
              </p>
            )}
          </div>
        )}

        {hasConversation && (
          <p className="text-xs text-slate-500 text-center mt-2">
            {conversation.length / 2} turn
            {conversation.length / 2 !== 1 ? 's' : ''}
          </p>
        )}

        <footer className="mt-3 border-t border-slate-800 pt-2 text-center text-[11px] tracking-wide text-slate-500">
          AWEVO Software Solutions
        </footer>
      </div>

      {showEndConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="end-live-title">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl">
            <h2 id="end-live-title" className="text-xl font-bold text-white">Ready to end this session?</h2>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Choose Yes to end the live call and generate your scorecard, or No to continue practicing.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowEndConfirmation(false)}
                className="rounded-xl border border-slate-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-slate-700"
              >
                No, continue
              </button>
              <button
                type="button"
                onClick={finalizeLiveSession}
                className="rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                Yes, end session
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
