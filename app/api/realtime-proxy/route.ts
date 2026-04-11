import { NextRequest, NextResponse } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(req: NextRequest) {
  try {
    const { action, data } = await req.json();

    if (action === 'create-session') {
      // Create ephemeral session
      const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-26',
          voice: 'alloy',
          instructions: `You are Riggleman Sales Coach, an expert automotive sales coach.
Your role is to provide real-time coaching and feedback to help sales associates improve their performance.
Be direct, actionable, and focused on practical sales techniques.
Keep responses concise for real-time conversation flow.
When appropriate, ask clarifying questions about their sales situation.`,
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1',
          },
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        console.error('OpenAI API error:', error);
        return NextResponse.json(
          { error: error.error?.message || 'Failed to create session' },
          { status: response.status }
        );
      }

      const data = await response.json();
      return NextResponse.json({
        token: data.client_secret.value,
        sessionId: data.id,
      });
    }

    return NextResponse.json(
      { error: 'Unknown action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Proxy error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
