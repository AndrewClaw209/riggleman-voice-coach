'use client';

import { useState, useRef, useEffect } from 'react';

interface VoiceChatProps {
  onTranscriptUpdate: (message: { role: string; content: string }) => void;
}

export default function VoiceChatRealtime({ onTranscriptUpdate }: VoiceChatProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'ready' | 'connecting' | 'connected' | 'listening' | 'responding'>('ready');
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const realtimeTokenRef = useRef<string | null>(null);

  // Initialize WebSocket connection to OpenAI Realtime API
  const initializeRealtime = async () => {
    try {
      setConnectionStatus('connecting');
      
      // First, get ephemeral token from our backend
      const tokenResponse = await fetch('/api/realtime-token', {
        method: 'POST',
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to get realtime token');
      }

      const { token } = await tokenResponse.json();
      realtimeTokenRef.current = token;

      // Connect to OpenAI Realtime API
      const ws = new WebSocket(
        `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26`,
        ['realtime', `ot_${token}`]
      );

      ws.onopen = () => {
        console.log('✅ Connected to OpenAI Realtime API');
        setIsConnected(true);
        setConnectionStatus('connected');
        
        // Send session update event with system prompt
        const sessionUpdate = {
          type: 'session.update',
          session: {
            model: 'gpt-4o-realtime-preview-2024-12-26',
            modalities: ['text', 'audio'],
            instructions: `You are Riggleman Sales Coach, an expert automotive sales coach. 
Your role is to provide real-time coaching and feedback to help sales associates improve their performance.
Be direct, actionable, and focused on practical sales techniques.
Keep responses concise (1-2 sentences) for real-time conversation flow.
When appropriate, ask clarifying questions about their sales situation.`,
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
          },
        };
        
        ws.send(JSON.stringify(sessionUpdate));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        
        switch (message.type) {
          case 'response.audio.delta':
            // Handle streaming audio chunks
            if (message.delta) {
              playAudioChunk(message.delta);
            }
            break;

          case 'response.text.done':
            // Text response complete
            if (message.text) {
              console.log('Coach:', message.text);
              onTranscriptUpdate({ role: 'assistant', content: message.text });
              setConnectionStatus('connected');
            }
            break;

          case 'conversation.item.input_audio_transcription.completed':
            // User's speech transcribed
            if (message.transcript) {
              console.log('You:', message.transcript);
              onTranscriptUpdate({ role: 'user', content: message.transcript });
            }
            break;

          case 'response.done':
            // Response fully complete
            setConnectionStatus('connected');
            break;

          case 'error':
            console.error('API Error:', message.error);
            setError(`API Error: ${message.error.message}`);
            break;
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error');
        setIsConnected(false);
      };

      ws.onclose = () => {
        console.log('WebSocket closed');
        setIsConnected(false);
        setConnectionStatus('ready');
      };

      wsRef.current = ws;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to initialize';
      console.error('Realtime init error:', errorMsg);
      setError(errorMsg);
      setConnectionStatus('ready');
    }
  };

  // Start recording and streaming audio
  const startRecording = async () => {
    try {
      setError(null);

      // Initialize realtime connection if not already done
      if (!isConnected) {
        await initializeRealtime();
        return; // Will call startRecording again after connection
      }

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;

      // Create AudioContext for real-time audio processing
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      // Create MediaRecorder for fallback
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      const source = audioContext.createMediaStreamSource(stream);

      // Create ScriptProcessor to capture audio chunks
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && isRecording) {
          // Convert Float32Array to PCM16
          const pcmData = float32ToPCM16(event.inputBuffer.getChannelData(0));
          
          // Send audio input event to Realtime API
          const audioEvent = {
            type: 'input_audio_buffer.append',
            audio: arrayBufferToBase64(pcmData),
          };
          
          wsRef.current.send(JSON.stringify(audioEvent));
        }
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setIsRecording(true);
      setConnectionStatus('listening');
      console.log('🎤 Recording started, streaming to Realtime API');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Microphone access failed';
      console.error('Recording error:', errorMsg);
      setError(errorMsg);
    }
  };

  // Stop recording
  const stopRecording = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
    }

    if (processorRef.current) {
      processorRef.current.disconnect();
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
    }

    setIsRecording(false);
    
    // Signal to API that input is complete
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'input_audio_buffer.commit',
      }));
      setConnectionStatus('responding');
    }
  };

  // Convert Float32 audio data to PCM16
  const float32ToPCM16 = (float32Array: Float32Array): Int16Array => {
    const pcm = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return pcm;
  };

  // Convert ArrayBuffer to base64 for transmission
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
      const binaryString = atob(base64Audio);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const audioContext = audioContextRef.current || new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioData = audioContext.createBuffer(1, bytes.length / 2, 24000);
      const channelData = audioData.getChannelData(0);

      // Convert PCM16 to Float32
      const pcm16 = new Int16Array(bytes.buffer);
      for (let i = 0; i < pcm16.length; i++) {
        channelData[i] = pcm16[i] / 32768;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioData;
      source.connect(audioContext.destination);
      source.start(0);
    } catch (err) {
      console.warn('Audio playback warning:', err);
    }
  };

  const handleStartClick = async () => {
    if (!isConnected) {
      await initializeRealtime();
      // Start recording after connection established
      setTimeout(() => startRecording(), 500);
    } else {
      startRecording();
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full p-8 bg-gradient-to-br from-slate-900 to-slate-800">
      {/* Status Indicator */}
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

      {/* Microphone Button */}
      <div className="mb-8">
        {!isRecording ? (
          <button
            onClick={handleStartClick}
            disabled={false}
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
            Stop Recording
          </button>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mt-8 p-4 bg-red-900 border border-red-700 rounded-lg text-red-300 max-w-md">
          <p className="font-semibold">⚠️ Error</p>
          <p className="text-sm mt-2">{error}</p>
        </div>
      )}

      {/* Instructions */}
      <div className="mt-12 text-center text-slate-400 max-w-md">
        <p className="text-sm">Click the button to start your coaching session.</p>
        <p className="text-xs mt-2 text-slate-500">Real-time conversation powered by OpenAI Realtime API</p>
      </div>
    </div>
  );
}
