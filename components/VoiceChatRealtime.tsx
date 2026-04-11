'use client';

import { useState, useRef, useEffect } from 'react';

interface VoiceChatProps {
  onTranscriptUpdate: (message: { role: string; content: string }) => void;
}

// Type definitions for OpenAI Realtime API
interface RealtimeMessage {
  type: string;
  [key: string]: any;
}

export default function VoiceChatRealtime({ onTranscriptUpdate }: VoiceChatProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ready' | 'connecting' | 'connected' | 'listening' | 'responding'>('ready');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const realtimeTokenRef = useRef<string | null>(null);
  const connectionAttemptRef = useRef(0);

  // Initialize WebSocket connection to OpenAI Realtime API
  const initializeRealtime = async () => {
    try {
      setConnectionStatus('connecting');
      connectionAttemptRef.current += 1;
      
      // Get ephemeral token from backend proxy
      const tokenResponse = await fetch('/api/realtime-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-session' }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get realtime token');
      }

      const responseData = await tokenResponse.json();
      if (!tokenResponse.ok || !responseData.token) {
        throw new Error(responseData.error || 'No token in response');
      }
      const { token } = responseData;
      realtimeTokenRef.current = token;
      console.log('✅ Got ephemeral token');

      // WebSocket URL with model parameter and token in URL
      // Using ephemeral token which is already authorized server-side
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26&Authorization=${encodeURIComponent(`Bearer ${token}`})`;
      
      const ws = new WebSocket(wsUrl, 'realtime');
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        console.log('✅ WebSocket opened');
        setIsConnected(true);
        setConnectionStatus('connected');
        connectionAttemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message: RealtimeMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'session.created':
              console.log('📋 Session created');
              break;

            case 'session.updated':
              console.log('📋 Session updated');
              break;

            case 'response.audio.delta':
              if (message.delta) {
                playAudioChunk(message.delta);
              }
              break;

            case 'response.text.delta':
              if (message.delta) {
                console.log('💬 Response:', message.delta);
              }
              break;

            case 'response.audio_transcript.delta':
              if (message.delta) {
                console.log('💬 Assistant:', message.delta);
              }
              break;

            case 'conversation.item.input_audio_transcription.completed':
              if (message.transcript) {
                console.log('🎤 You:', message.transcript);
                onTranscriptUpdate({ role: 'user', content: message.transcript });
              }
              break;

            case 'response.done':
              setConnectionStatus('connected');
              break;

            case 'error':
              console.error('🚨 API Error:', message.error);
              const errorMsg = message.error?.message || 'API error';
              setError(`Error: ${errorMsg}`);
              break;

            default:
              console.log('📨', message.type);
          }
        } catch (err) {
          console.error('Parse error:', err);
        }
      };

      ws.onerror = (event) => {
        console.error('🚨 WebSocket error:', event);
        const errorMessage = `Connection error (attempt ${connectionAttemptRef.current})`;
        setError(errorMessage);
      };

      ws.onclose = (event) => {
        console.log('❌ WebSocket closed:', event.code, event.reason);
        setIsConnected(false);
        setConnectionStatus('ready');
        
        if (event.code !== 1000 && connectionAttemptRef.current < 3) {
          // Auto-retry on unexpected closure
          setTimeout(() => initializeRealtime(), 2000);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Initialization failed';
      console.error('🚨 Init error:', errorMsg);
      setError(errorMsg);
      setConnectionStatus('ready');
    }
  };

  // Start recording and streaming audio
  const startRecording = async () => {
    try {
      setError(null);

      if (!isConnected) {
        await initializeRealtime();
        setTimeout(() => startRecording(), 800);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 16000,
        },
      });

      streamRef.current = stream;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (wsRef.current?.readyState === WebSocket.OPEN && isRecording) {
          const pcmData = float32ToPCM16(event.inputBuffer.getChannelData(0));
          const audioBase64 = arrayBufferToBase64(pcmData);
          
          wsRef.current.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: audioBase64,
          }));
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setConnectionStatus('listening');
      console.log('🎤 Recording started');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Microphone failed';
      console.error('🚨 Recording error:', errorMsg);
      setError(errorMsg);
    }
  };

  // Stop recording
  const stopRecording = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current?.disconnect();
    
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }

    setIsRecording(false);
    
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit',
      }));
      setConnectionStatus('responding');
    }
  };

  // Audio conversion helpers
  const float32ToPCM16 = (float32: Float32Array): Int16Array => {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  };

  const arrayBufferToBase64 = (buffer: ArrayBuffer | Int16Array): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  const playAudioChunk = (base64Audio: string) => {
    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const ctx = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      const pcm16 = new Int16Array(bytes.buffer);
      const audio = ctx.createBuffer(1, pcm16.length, 24000);
      const channel = audio.getChannelData(0);

      for (let i = 0; i < pcm16.length; i++) {
        channel[i] = pcm16[i] / 32768;
      }

      const source = ctx.createBufferSource();
      source.buffer = audio;
      source.connect(ctx.destination);
      source.start(0);
    } catch (err) {
      console.warn('⚠️ Playback error:', err);
    }
  };

  const handleStartClick = async () => {
    if (!isConnected) {
      await initializeRealtime();
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="mb-8 text-center">
        <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
          connectionStatus === 'ready' ? 'bg-slate-700 text-slate-300' :
          connectionStatus === 'connecting' ? 'bg-yellow-700 text-yellow-300' :
          connectionStatus === 'listening' ? 'bg-blue-700 text-blue-300' :
          connectionStatus === 'responding' ? 'bg-purple-700 text-purple-300' :
          'bg-emerald-700 text-emerald-300'
        }`}>
          {connectionStatus === 'ready' && '📡 Ready'}
          {connectionStatus === 'connecting' && '🔗 Connecting...'}
          {connectionStatus === 'listening' && '🎤 Listening...'}
          {connectionStatus === 'responding' && '💭 Thinking...'}
          {connectionStatus === 'connected' && '✅ Connected'}
        </div>
      </div>

      <div className="mb-8">
        {!isRecording ? (
          <button
            onClick={handleStartClick}
            className="px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3"
          >
            <span className="text-2xl">🎤</span>
            {isConnected ? 'Start Coaching' : 'Connect & Start'}
          </button>
        ) : (
          <button
            onClick={stopRecording}
            className="px-8 py-4 bg-red-600 hover:bg-red-700 text-white font-bold text-lg rounded-full shadow-lg hover:shadow-xl transition-all flex items-center gap-3 animate-pulse"
          >
            <span className="text-2xl">⏹️</span>
            Stop Recording
          </button>
        )}
      </div>

      {error && (
        <div className="mt-8 p-4 bg-red-900 border border-red-700 rounded-lg text-red-300 max-w-md">
          <p className="font-semibold">⚠️ Error</p>
          <p className="text-sm mt-2">{error}</p>
          <button 
            onClick={() => {
              setError(null);
              setIsConnected(false);
              setConnectionStatus('ready');
              wsRef.current?.close();
            }}
            className="mt-3 px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs rounded"
          >
            Retry
          </button>
        </div>
      )}

      <div className="mt-12 text-center text-slate-400 max-w-md">
        <p className="text-sm">Click to start your real-time coaching session.</p>
        <p className="text-xs mt-2 text-slate-500">Powered by OpenAI Realtime API</p>
      </div>
    </div>
  );
}
