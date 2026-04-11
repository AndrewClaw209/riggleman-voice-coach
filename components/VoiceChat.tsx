'use client';

import { useState, useRef, useEffect } from 'react';

interface VoiceChatProps {
  onTranscriptUpdate: (message: { role: string; content: string }) => void;
}

export default function VoiceChat({ onTranscriptUpdate }: VoiceChatProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('ready');
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const conversationRef = useRef<Array<{ role: string; content: string }>>([]);

  // Initialize connection status
  useEffect(() => {
    setConnectionStatus('ready');
  }, []);

  const startRecording = async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Create media recorder
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendAudioToCoach(audioBlob);

        // Stop stream
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Could not access microphone'
      );
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendAudioToCoach = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Convert audio to base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];

        // Send to API for processing
        const response = await fetch('/api/simple-coach', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            audio: base64Audio,
            conversation: conversationRef.current,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          console.error('API Error:', errorData);
          throw new Error(errorData.error || 'Failed to get response from coach');
        }

        const result = await response.json();
        console.log('API Response received:', {
          hasUserText: !!result.userText,
          hasResponse: !!result.response,
          hasAudioUrl: !!result.audioUrl,
          audioUrlLength: result.audioUrl?.length || 0,
        });

        // Add user message to transcript
        if (result.userText) {
          onTranscriptUpdate({ role: 'user', content: result.userText });
          conversationRef.current.push({
            role: 'user',
            content: result.userText,
          });
        }

        // Add coach response
        if (result.response) {
          onTranscriptUpdate({ role: 'assistant', content: result.response });
          conversationRef.current.push({
            role: 'assistant',
            content: result.response,
          });

          // Play response audio if available
          if (result.audioUrl) {
            console.log('Audio URL received, playing after delay...');
            setTimeout(() => {
              console.log('Attempting to play audio...');
              playAudio(result.audioUrl);
            }, 500); // Slightly longer delay
          } else {
            console.warn('No audioUrl in response');
          }
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process audio');
    } finally {
      setIsProcessing(false);
    }
  };

  const playAudio = (audioUrl: string) => {
    try {
      console.log('Playing audio from:', audioUrl.substring(0, 50) + '...');
      const audio = new Audio(audioUrl);
      audio.volume = 1.0;
      
      // Try to play
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('✅ Audio playing successfully');
          })
          .catch((err) => {
            console.error('❌ Failed to play audio:', err);
            setError(`Audio failed: ${err.message}`);
          });
      }
    } catch (err) {
      console.error('Error creating audio element:', err);
      setError(`Audio error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      {/* Status Indicator */}
      <div className="mb-8">
        <div
          className={`w-4 h-4 rounded-full ${
            connectionStatus === 'ready'
              ? 'bg-emerald-500'
              : 'bg-red-500'
          }`}
        />
        <p className="text-sm text-slate-400 mt-2 capitalize">
          {connectionStatus === 'ready' ? 'Ready' : 'Error'}
        </p>
      </div>

      {/* Main Content */}
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold mb-2">Start Speaking</h2>
        <p className="text-slate-400">
          Click the microphone button below and share your sales challenges
        </p>
      </div>

      {/* Microphone Button */}
      <button
        onClick={isRecording ? stopRecording : startRecording}
        disabled={isProcessing || connectionStatus !== 'ready'}
        className={`mb-8 p-6 rounded-full transition-all ${
          isRecording
            ? 'bg-red-600 hover:bg-red-700 shadow-lg shadow-red-500/50'
            : 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/50'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <svg
          className="w-12 h-12 text-white"
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
          <path d="M17 16.91c-1.48 1.46-3.51 2.36-5.77 2.36-2.26 0-4.29-.9-5.77-2.36l-1.1 1.1c1.86 1.86 4.41 3 7.07 3 2.66 0 5.21-1.14 7.07-3l-1.1-1.1z" />
        </svg>
      </button>

      {/* Status Text */}
      <p className="text-lg font-semibold mb-2">
        {isRecording
          ? 'Listening...'
          : isProcessing
          ? 'Processing...'
          : 'Ready to listen'}
      </p>

      {/* Error Message */}
      {error && (
        <div className="mt-8 p-4 bg-red-900 border border-red-700 rounded-lg max-w-md">
          <p className="text-red-100 text-sm">{error}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-12 max-w-md text-slate-400 text-sm text-center">
        <p>
          {connectionStatus === 'ready'
            ? 'Your coach is ready. Click the microphone and speak naturally about your sales challenges, goals, or performance metrics.'
            : 'Connecting to your coach...'}
        </p>
      </div>
    </div>
  );
}
