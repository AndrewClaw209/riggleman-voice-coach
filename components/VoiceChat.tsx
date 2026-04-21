'use client';

import { useState, useRef } from 'react';

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
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to get coaching response');
        }

        const data = await response.json();
        const {
          userText,
          response: coachResponse,
          audio: audioBase64,
          audioType,
        } = data as {
          userText: string;
          response: string;
          audio?: string;
          audioType?: string;
        };

        setConversation((prev) => [
          ...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: coachResponse },
        ]);

        setLastUserText(userText);
        onTranscriptUpdate({ role: 'user', content: userText });
        onTranscriptUpdate({ role: 'assistant', content: coachResponse });

        if (audioBase64) {
          setProcessingStage('speaking');

          const binary = atob(audioBase64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const audioBlob = new Blob([bytes], {
            type: audioType ?? 'audio/mpeg',
          });
          const objectUrl = URL.createObjectURL(audioBlob);
          const audio = audioRef.current ?? new Audio();
          audioRef.current = audio;

          try {
            await new Promise<void>((resolve) => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                audio.removeEventListener('ended', finish);
                audio.removeEventListener('error', onError);
                resolve();
              };
              const onError = () => {
                console.error('[VoiceChat] Audio error:', audio.error);
                finish();
              };
              audio.addEventListener('ended', finish);
              audio.addEventListener('error', onError);
              const timeout = setTimeout(finish, 30000);

              audio.src = objectUrl;
              audio.play().catch((err) => {
                console.error('[VoiceChat] Audio play() failed:', err);
                finish();
              });
            });
          } finally {
            URL.revokeObjectURL(objectUrl);
          }
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
    <div className="flex flex-col h-full w-full justify-between">
      {/* Main Content - Centered */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
        {/* Status Badge */}
        <div className={`${stage.color} px-6 py-3 rounded-full text-white font-semibold mb-8 flex items-center gap-2 transition-all`}>
          <span className="text-2xl">{stage.emoji}</span>
          <span className="text-base">{stage.text}</span>
        </div>

        {/* Large Visual Progress Indicator */}
        {isProcessing && (
          <div className="mb-8 w-32 h-32 flex items-center justify-center">
            <div className="relative w-full h-full">
              {/* Animated circle background */}
              <div className="absolute inset-0 rounded-full border-4 border-slate-700 animate-pulse" />
              <div className="absolute inset-1 rounded-full border-4 border-transparent border-t-emerald-400 border-r-emerald-400 animate-spin" />
              
              {/* Center text */}
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-4xl mb-2">
                  {processingStage === 'recording' && '🎙️'}
                  {processingStage === 'transcribing' && '📄'}
                  {processingStage === 'thinking' && '🧠'}
                  {processingStage === 'speaking' && '🔊'}
                </div>
                <div className="text-xs text-slate-400 text-center px-4">
                  {processingStage === 'recording' && 'Listening...'}
                  {processingStage === 'transcribing' && 'Converting...'}
                  {processingStage === 'thinking' && 'Analyzing...'}
                  {processingStage === 'speaking' && 'Playing...'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Last transcribed text preview - only show during processing */}
        {lastUserText && isProcessing && (
          <div className="mb-6 px-5 py-3 bg-slate-700/80 rounded-lg max-w-xs text-center">
            <p className="text-xs text-slate-400 mb-1">You said:</p>
            <p className="text-sm text-slate-200">{lastUserText.substring(0, 150)}{lastUserText.length > 150 ? '...' : ''}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 px-5 py-3 bg-red-900/80 rounded-lg max-w-xs text-center">
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

        {/* Instructions - Only show when idle */}
        {processingStage === 'idle' && conversation.length === 0 && (
          <div className="text-center mb-8 max-w-sm">
            <p className="text-base text-slate-300 font-semibold mb-3">Ready to get coached?</p>
            <p className="text-sm text-slate-400">Tap the button below and speak naturally. The AI will listen, understand, and give you instant feedback.</p>
          </div>
        )}

        {/* Past messages - scrollable on mobile */}
        {conversation.length > 0 && (
          <div className="w-full max-h-xs overflow-y-auto mb-6 space-y-2 px-2">
            {conversation.slice(-4).map((msg, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg text-sm ${
                  msg.role === 'user'
                    ? 'bg-emerald-900/60 text-emerald-100 ml-6'
                    : 'bg-blue-900/60 text-blue-100 mr-6'
                }`}
              >
                <p className="font-semibold text-xs mb-1">
                  {msg.role === 'user' ? '🎤 You' : '🤖 Coach'}
                </p>
                <p className="text-xs sm:text-sm break-words">{msg.content.substring(0, 200)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom Button - Full Width, Large Touch Target */}
      <div className="px-4 py-6 bg-gradient-to-t from-slate-900 to-transparent">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="w-full py-5 px-6 bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 disabled:from-slate-600 disabled:to-slate-600 disabled:opacity-50 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <span className="text-3xl">🎤</span>
            <span>Start Coaching</span>
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="w-full py-5 px-6 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all active:scale-95 flex items-center justify-center gap-3 animate-pulse"
          >
            <span className="text-3xl">⏹️</span>
            <span>Stop & Process</span>
          </button>
        )}
        
        {/* Turn counter */}
        {conversation.length > 0 && (
          <p className="text-xs text-slate-500 text-center mt-3">
            {conversation.length / 2} conversation turn{conversation.length / 2 !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
