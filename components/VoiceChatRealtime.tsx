'use client';

import { useState, useRef, useEffect } from 'react';

interface VoiceChatProps {
  onTranscriptUpdate: (message: { role: string; content: string }) => void;
}

/**
 * VoiceChat using OpenAI's Realtime API
 * 
 * Architecture:
 * 1. Backend creates ephemeral session → returns token
 * 2. Browser connects WebSocket with token embedded in URL
 * 3. Real-time bidirectional audio streaming (PCM16)
 * 4. Responses stream back with audio + transcript
 */

export default function VoiceChatRealtime({ onTranscriptUpdate }: VoiceChatProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ready' | 'connecting' | 'connected' | 'listening' | 'responding'>('ready');
  const [error, setError] = useState<string | null>(null);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLog((prev) => [...prev.slice(-4), msg]);
  };

  // Create session and connect to Realtime API
  const initializeRealtime = async () => {
    try {
      setConnectionStatus('connecting');
      addLog('📡 Requesting ephemeral session...');

      // Get token from backend
      const tokenResponse = await fetch('/api/realtime-proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-session' }),
      });

      const responseData = await tokenResponse.json();
      if (!tokenResponse.ok) {
        throw new Error(responseData.error || 'Failed to create session');
      }

      const { token } = responseData;
      if (!token) throw new Error('No token received');

      addLog(`✅ Got token: ${token.substring(0, 16)}...`);

      // Connect to OpenAI Realtime API
      // Documentation: https://platform.openai.com/docs/guides/realtime-webrtc
      // The token is sent as Bearer in URL (ephemeral session format)
      const wsUrl = `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26&authorization=${encodeURIComponent(`Bearer ${token}`)}`;

      addLog('🔗 Opening WebSocket...');
      const ws = new WebSocket(wsUrl);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        addLog('✅ WebSocket connected!');
        setIsConnected(true);
        setConnectionStatus('connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(
            typeof event.data === 'string'
              ? event.data
              : new TextDecoder().decode(event.data)
          );

          switch (message.type) {
            case 'session.created':
              addLog('📋 Session created on OpenAI');
              break;

            case 'response.audio.delta':
              // Received audio chunk - play it
              if (message.delta) {
                playAudioChunk(message.delta);
              }
              break;

            case 'response.text.done':
              // Full text response complete
              if (message.text) {
                addLog(`💬 Coach: ${message.text.substring(0, 50)}...`);
                onTranscriptUpdate({ role: 'assistant', content: message.text });
              }
              setConnectionStatus('connected');
              break;

            case 'conversation.item.input_audio_transcription.completed':
              // User speech transcribed
              if (message.transcript) {
                addLog(`🎤 You: ${message.transcript.substring(0, 50)}...`);
                onTranscriptUpdate({ role: 'user', content: message.transcript });
              }
              break;

            case 'error':
              const errorMsg = message.error?.message || JSON.stringify(message.error);
              addLog(`🚨 API Error: ${errorMsg}`);
              setError(`API Error: ${errorMsg}`);
              break;

            default:
              // Ignore other message types (response.done, session.updated, etc.)
              if (message.type !== 'response.done' && message.type !== 'session.updated') {
                addLog(`📨 ${message.type}`);
              }
          }
        } catch (err) {
          addLog(`⚠️ Parse error: ${err}`);
        }
      };

      ws.onerror = (event) => {
        addLog(`❌ WebSocket error`);
        setError('Connection error - check browser console');
      };

      ws.onclose = (event) => {
        addLog(`❌ WebSocket closed: ${event.code}`);
        setIsConnected(false);
        setConnectionStatus('ready');
      };

      wsRef.current = ws;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      addLog(`🚨 Init failed: ${msg}`);
      setError(msg);
      setConnectionStatus('ready');
    }
  };

  // Start recording and streaming audio to OpenAI
  const startRecording = async () => {
    try {
      setError(null);

      if (!isConnected) {
        addLog('⏳ Connecting first...');
        await initializeRealtime();
        setTimeout(() => startRecording(), 1000);
        return;
      }

      addLog('🎤 Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: { ideal: 24000 },
        },
      });

      streamRef.current = stream;

      // Create audio context with 24kHz sample rate (Realtime API standard)
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: 24000,
      });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);

      // Create processor for real-time audio capture
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;

      addLog('🎤 Recording started');
      setIsRecording(true);
      setConnectionStatus('listening');

      processor.onaudioprocess = (event) => {
        if (
          wsRef.current?.readyState === WebSocket.OPEN &&
          isRecording
        ) {
          // Convert float32 to PCM16
          const pcmData = float32ToPCM16(event.inputBuffer.getChannelData(0));
          const base64 = arrayBufferToBase64(pcmData);

          // Send audio to Realtime API
          wsRef.current.send(
            JSON.stringify({
              type: 'input_audio_buffer.append',
              audio: base64,
            })
          );
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone failed';
      addLog(`🚨 Recording error: ${msg}`);
      setError(msg);
    }
  };

  // Stop recording and commit audio buffer
  const stopRecording = () => {
    addLog('⏹️ Stopping recording...');
    
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current?.disconnect();
    audioContextRef.current?.close();

    setIsRecording(false);
    setConnectionStatus('responding');

    // Commit the audio buffer to trigger response
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'input_audio_buffer.commit',
        })
      );
      addLog('✅ Audio committed, waiting for response...');
    }
  };

  // Convert Float32 to PCM16 (16-bit signed integers)
  const float32ToPCM16 = (float32: Float32Array): Int16Array => {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      // Clamp to [-1, 1]
      const s = Math.max(-1, Math.min(1, float32[i]));
      // Convert to 16-bit integer
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  };

  // Encode ArrayBuffer to base64
  const arrayBufferToBase64 = (buffer: ArrayBuffer | Int16Array): string => {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  };

  // Play audio chunk from API response
  const playAudioChunk = (base64Audio: string) => {
    try {
      const binary = atob(base64Audio);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const ctx = audioContextRef.current;
      if (!ctx) return;

      // Decode PCM16 (24kHz from Realtime API)
      const pcm16 = new Int16Array(bytes.buffer);
      const audioBuffer = ctx.createBuffer(1, pcm16.length, 24000);
      const channel = audioBuffer.getChannelData(0);

      for (let i = 0; i < pcm16.length; i++) {
        channel[i] = pcm16[i] / 32768;
      }

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch (err) {
      addLog(`⚠️ Playback error: ${err}`);
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
      {/* Status Indicator */}
      <div className="mb-8 text-center">
        <div
          className={`inline-block px-4 py-2 rounded-full text-sm font-semibold ${
            connectionStatus === 'ready'
              ? 'bg-slate-700 text-slate-300'
              : connectionStatus === 'connecting'
              ? 'bg-yellow-700 text-yellow-300'
              : connectionStatus === 'listening'
              ? 'bg-blue-700 text-blue-300'
              : connectionStatus === 'responding'
              ? 'bg-purple-700 text-purple-300'
              : 'bg-emerald-700 text-emerald-300'
          }`}
        >
          {connectionStatus === 'ready' && '📡 Ready'}
          {connectionStatus === 'connecting' && '🔗 Connecting...'}
          {connectionStatus === 'listening' && '🎤 Listening...'}
          {connectionStatus === 'responding' && '💭 Thinking...'}
          {connectionStatus === 'connected' && '✅ Connected'}
        </div>
      </div>

      {/* Main Button */}
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
            Stop & Submit
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

      {/* Debug Log */}
      {debugLog.length > 0 && (
        <div className="mt-8 p-4 bg-slate-700 rounded-lg text-slate-300 max-w-md text-xs font-mono space-y-1 max-h-32 overflow-y-auto">
          {debugLog.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}

      {/* Instructions */}
      <div className="mt-12 text-center text-slate-400 max-w-md">
        <p className="text-sm">
          {isConnected
            ? 'Click "Start Coaching" to begin your real-time session'
            : 'Click "Connect & Start" to initialize Realtime API'}
        </p>
        <p className="text-xs mt-2 text-slate-500">
          Sub-second latency • Full-duplex audio streaming
        </p>
      </div>
    </div>
  );
}
