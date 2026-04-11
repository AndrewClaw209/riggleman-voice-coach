'use client';

import { useState, useRef } from 'react';

interface VoiceChatProps {
  onTranscriptUpdate: (message: { role: string; content: string }) => void;
}

type ProcessingStage = 'idle' | 'recording' | 'transcribing' | 'thinking' | 'speaking' | 'error';

export default function VoiceChat({ onTranscriptUpdate }: VoiceChatProps) {
  const [processingStage, setProcessingStage] = useState<ProcessingStage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);
  const [lastUserText, setLastUserText] = useState<string>('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      setError(null);
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
        
        // Stop the stream tracks
        stream.getTracks().forEach((track) => track.stop());

        // Process the audio
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
      mediaRecorderRef.current.stop();
      setProcessingStage('transcribing');
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];

        // Move to thinking stage
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

        const { userText, response: coachResponse, audioUrl } = await response.json();

        // Add to conversation
        setConversation((prev) => [
          ...prev,
          { role: 'user', content: userText },
          { role: 'assistant', content: coachResponse },
        ]);

        setLastUserText(userText);

        // Update parent transcript
        onTranscriptUpdate({ role: 'user', content: userText });
        onTranscriptUpdate({ role: 'assistant', content: coachResponse });

        // Play audio response
        if (audioUrl) {
          setProcessingStage('speaking');
          const audio = new Audio(audioUrl);
          try {
            await new Promise<void>((resolve) => {
              audio.onended = () => resolve();
              audio.play().catch(() => resolve());
            });
          } catch (playErr) {
            console.warn('⚠️ Audio playback warning:', playErr);
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

  const isProcessing = processingStage !== 'idle';
  const isRecording = processingStage === 'recording';

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Status Indicator with Progress Stages */}
      <div className="mb-8 text-center">
        <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold transition-all ${
          isRecording ? 'bg-red-700 text-red-300' :
          processingStage === 'transcribing' ? 'bg-blue-700 text-blue-300' :
          processingStage === 'thinking' ? 'bg-yellow-700 text-yellow-300' :
          processingStage === 'speaking' ? 'bg-purple-700 text-purple-300' :
          processingStage === 'error' ? 'bg-red-900 text-red-300' :
          'bg-emerald-700 text-emerald-300'
        }`}>
          {isRecording && '🎤 Recording...'}
          {processingStage === 'transcribing' && '📝 Transcribing...'}
          {processingStage === 'thinking' && '💭 Thinking...'}
          {processingStage === 'speaking' && '🔊 Speaking...'}
          {processingStage === 'error' && '⚠️ Error'}
          {processingStage === 'idle' && '✅ Ready'}
        </div>

        {/* Progress Indicator Dots */}
        {isProcessing && processingStage !== 'error' && (
          <div className="mt-4 flex justify-center gap-3">
            <div className={`flex flex-col items-center gap-1`}>
              <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                processingStage === 'recording' || processingStage === 'transcribing' || processingStage === 'thinking' || processingStage === 'speaking'
                  ? 'bg-blue-400 scale-125'
                  : 'bg-slate-600'
              }`} />
              <span className="text-xs text-slate-500">Listen</span>
            </div>
            
            <div className="text-slate-500 text-xl">→</div>
            
            <div className={`flex flex-col items-center gap-1`}>
              <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                processingStage === 'transcribing' || processingStage === 'thinking' || processingStage === 'speaking'
                  ? 'bg-blue-400 scale-125'
                  : 'bg-slate-600'
              }`} />
              <span className="text-xs text-slate-500">Understand</span>
            </div>
            
            <div className="text-slate-500 text-xl">→</div>
            
            <div className={`flex flex-col items-center gap-1`}>
              <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                processingStage === 'thinking' || processingStage === 'speaking'
                  ? 'bg-yellow-400 scale-125'
                  : 'bg-slate-600'
              }`} />
              <span className="text-xs text-slate-500">Reason</span>
            </div>
            
            <div className="text-slate-500 text-xl">→</div>
            
            <div className={`flex flex-col items-center gap-1`}>
              <div className={`w-2.5 h-2.5 rounded-full transition-all ${
                processingStage === 'speaking'
                  ? 'bg-purple-400 scale-125'
                  : 'bg-slate-600'
              }`} />
              <span className="text-xs text-slate-500">Respond</span>
            </div>
          </div>
        )}

        {/* Last transcribed text preview */}
        {lastUserText && processingStage !== 'idle' && (
          <div className="mt-4 px-4 py-2 bg-slate-700 rounded-lg max-w-sm">
            <p className="text-xs text-slate-400">You said:</p>
            <p className="text-sm text-slate-300 italic">{lastUserText.substring(0, 100)}{lastUserText.length > 100 ? '...' : ''}</p>
          </div>
        )}
      </div>

      {/* Microphone Button */}
      <div className="mb-8">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 group"
          >
            <span className="text-2xl group-hover:scale-125 transition-transform">🎤</span>
            Start Coaching
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3 animate-pulse group"
          >
            <span className="text-2xl group-hover:scale-125 transition-transform">⏹️</span>
            Stop & Process
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-8 p-4 bg-red-900 border border-red-700 rounded-lg text-red-300 max-w-md">
          <p className="font-semibold">⚠️ Error</p>
          <p className="text-sm mt-2">{error}</p>
          <button 
            onClick={() => {
              setError(null);
              setProcessingStage('idle');
            }}
            className="mt-3 px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-12 text-center text-slate-400 max-w-md">
        <p className="text-sm">Click the button to start your coaching session.</p>
        <p className="text-xs mt-3 text-slate-500 space-y-1">
          <span className="block font-semibold text-slate-300">Pipeline:</span>
          <span className="block">🎤 Record → 📝 Transcribe (Whisper)</span>
          <span className="block">💭 Reason (GPT-4) → 🔊 Speak (TTS)</span>
          <span className="block text-slate-600 mt-2">Typical: 6-15 seconds per turn</span>
        </p>
      </div>

      {/* Conversation count */}
      {conversation.length > 0 && (
        <div className="absolute bottom-4 right-4 text-xs text-slate-500">
          {conversation.length / 2} turn{conversation.length / 2 === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
