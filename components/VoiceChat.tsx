'use client';

import { useState, useRef, useEffect } from 'react';

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

interface VoiceChatProps {
  onTranscriptUpdate: (message: ConversationMessage) => void;
}

type ProcessingStage = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export default function VoiceChat({ onTranscriptUpdate }: VoiceChatProps) {
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [lastUserText, setLastUserText] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
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

  const decodeHeader = (value: string | null): string => {
    if (!value) return '';
    try {
      const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return '';
    }
  };

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

  const playStreamingAudio = async (stream: ReadableStream<Uint8Array>) => {
    const audio = audioRef.current;
    if (!audio) return;

    const win = window as unknown as {
      ManagedMediaSource?: typeof MediaSource;
      MediaSource?: typeof MediaSource;
    };
    const MSCtor = win.ManagedMediaSource ?? win.MediaSource;

    if (
      !MSCtor ||
      typeof MSCtor.isTypeSupported !== 'function' ||
      !MSCtor.isTypeSupported('audio/mpeg')
    ) {
      await playBufferedAudio(stream);
      return;
    }

    if ('disableRemotePlayback' in audio) {
      (audio as HTMLAudioElement & { disableRemotePlayback: boolean }).disableRemotePlayback = true;
    }

    const mediaSource = new MSCtor();
    const objectUrl = URL.createObjectURL(mediaSource);
    audio.src = objectUrl;

    try {
      await new Promise<void>((resolve, reject) => {
        const onEnded = () => resolve();
        const onError = () => {
          console.error('[VoiceChat] Audio element error:', audio.error);
          resolve();
        };
        audio.addEventListener('ended', onEnded, { once: true });
        audio.addEventListener('error', onError, { once: true });

        mediaSource.addEventListener(
          'sourceopen',
          async () => {
            try {
              const sourceBuffer = mediaSource.addSourceBuffer('audio/mpeg');
              const reader = stream.getReader();
              let started = false;

              const waitForIdle = () =>
                new Promise<void>((r) => {
                  if (!sourceBuffer.updating) r();
                  else
                    sourceBuffer.addEventListener('updateend', () => r(), {
                      once: true,
                    });
                });

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                await waitForIdle();
                const chunk = new ArrayBuffer(value.byteLength);
                new Uint8Array(chunk).set(value);
                sourceBuffer.appendBuffer(chunk);
                if (!started) {
                  started = true;
                  audio.play().catch((err) => {
                    console.error('[VoiceChat] Audio play() failed:', err);
                  });
                }
              }
              await waitForIdle();
              try {
                mediaSource.endOfStream();
              } catch {
                /* already closed */
              }
            } catch (err) {
              reject(err);
            }
          },
          { once: true }
        );
      });
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        setProcessingStage('thinking');

        const response = await fetch('/api/simple-coach', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            audio: base64Audio,
            conversation,
          }),
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ error: 'Failed to get coaching response' }));
          throw new Error(
            errorData.error || 'Failed to get coaching response'
          );
        }

        const userText = decodeHeader(response.headers.get('x-user-text'));
        const coachResponse = decodeHeader(
          response.headers.get('x-coach-response')
        );

        setConversation((prev) => [
          ...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: coachResponse },
        ]);
        setLastUserText(userText);
        onTranscriptUpdate({ role: 'user', content: userText });
        onTranscriptUpdate({ role: 'assistant', content: coachResponse });

        if (response.body) {
          setProcessingStage('speaking');
          await playStreamingAudio(response.body);
        }

        setProcessingStage('idle');
      };
      reader.readAsDataURL(audioBlob);
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
          {/* Status badge (compact when a conversation is in progress) */}
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
                Ready to get coached?
              </p>
              <p className="text-sm text-slate-400">
                Tap the button below and speak naturally. The AI will listen,
                understand, and give you instant feedback.
              </p>
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
                    {msg.role === 'user' ? '🎤 You' : '🤖 Coach'}
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
        {!isRecording ? (
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

        {hasConversation && (
          <p className="text-xs text-slate-500 text-center mt-2">
            {conversation.length / 2} turn
            {conversation.length / 2 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
