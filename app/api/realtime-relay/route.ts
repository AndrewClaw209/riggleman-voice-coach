import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Streaming relay endpoint for Realtime API
 * 
 * Browser POST JSON with audio chunks/messages
 * Backend maintains connection to OpenAI and streams back responses
 */

interface RelayRequest {
  action: 'create-session' | 'send-audio' | 'commit';
  token?: string;
  audio?: string; // base64
  sessionId?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: RelayRequest = await req.json();

    if (body.action === 'create-session') {
      // Create ephemeral session
      const session = await client.beta.realtime.sessions.create({
        model: 'gpt-4o-realtime-preview-2024-12-26',
        voice: 'alloy',
        instructions: `You are Riggleman Sales Coach, an expert automotive sales coach.
Your role is to provide real-time coaching and feedback to help sales associates improve their performance.
Be direct, actionable, and focused on practical sales techniques.
Keep responses concise and conversational.
When appropriate, ask clarifying questions about their sales situation.`,
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1',
        },
      });

      return NextResponse.json({
        token: session.client_secret.value,
        sessionId: session.id,
      });
    }

    // For now, return error for other actions
    // Full relay implementation would require WebSocket support
    return NextResponse.json(
      { error: 'Use fallback REST API for now' },
      { status: 400 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Relay error';
    console.error('[Realtime Relay] Error:', message);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
