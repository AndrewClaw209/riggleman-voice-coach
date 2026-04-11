import { NextRequest } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26';

// Upgrade request to WebSocket
export const config = {
  api: {
    bodyParser: false,
  },
};

// Store active WebSocket connections
const connections = new Map<string, any>();

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId') || `session-${Date.now()}`;

  // This will be handled by Next.js upgrade to WebSocket
  // For now, return instructions
  return new Response(
    JSON.stringify({ error: 'WebSocket endpoint must be upgraded' }),
    { status: 400 }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, audioData } = body;

    if (!sessionId || !audioData) {
      return new Response(
        JSON.stringify({ error: 'Missing sessionId or audioData' }),
        { status: 400 }
      );
    }

    // For initial setup, create ephemeral token
    if (!body.isAudioData) {
      const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-realtime-preview-2024-12-26',
          voice: 'alloy',
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create realtime session');
      }

      const data = await response.json();
      return Response.json({
        token: data.client_secret.value,
        sessionId,
      });
    }

    return Response.json({ success: true });
  } catch (error) {
    console.error('WebSocket POST error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    );
  }
}
