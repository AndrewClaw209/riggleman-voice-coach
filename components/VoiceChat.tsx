'use client';

import { useState, useRef } from 'react';

interface VoiceChatProps {
  onTranscriptUpdate: (message: { role: string; content: string }) => void;
}

export default function VoiceChat({ onTranscriptUpdate }: VoiceChatProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversation, setConversation] = useState<Array<{ role: string; content: string }>>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      setError(null);
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
      setIsRecording(true);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Microphone access failed';
      setError(errorMsg);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsProcessing(true);
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    try {
      setIsProcessing(true);

      // Convert blob to base64
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];

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

        // Update parent transcript
        onTranscriptUpdate({ role: 'user', content: userText });
        onTranscriptUpdate({ role: 'assistant', content: coachResponse });

        // Play audio response
        if (audioUrl) {
          const audio = new Audio(audioUrl);
          try {
            await audio.play();
          } catch (playErr) {
            console.warn('⚠️ Audio playback warning:', playErr);
          }
        }

        setIsProcessing(false);
      };
      reader.readAsDataURL(audioBlob);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMsg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Status Indicator */}
      <div className="mb-8 text-center">
        <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
          isRecording ? 'bg-red-700 text-red-300' :
          isProcessing ? 'bg-yellow-700 text-yellow-300' :
          'bg-emerald-700 text-emerald-300'
        }`}>
          {isRecording && '🎤 Recording...'}
          {isProcessing && '💭 Processing...'}
          {!isRecording && !isProcessing && '✅ Ready'}
        </div>
      </div>

      {/* Microphone Button */}
      <div className="mb-8">
        {!isRecording ? (
          <button
            onClick={startRecording}
            disabled={isProcessing}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3"
          >
            <span className="text-2xl">🎤</span>
            Start Coaching
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3 animate-pulse"
          >
            <span className="text-2xl">⏹️</span>
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
            onClick={() => setError(null)}
            className="mt-3 px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-12 text-center text-slate-400 max-w-md">
        <p className="text-sm">Click the button to start your coaching session.</p>
        <p className="text-xs mt-2 text-slate-500">Whisper + GPT-4 + TTS pipeline (6-15s latency)</p>
      </div>
    </div>
  );
}
