import { NextRequest } from 'next/server';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * This endpoint handles WebSocket upgrade for the Realtime API.
 * It relays browser <-> OpenAI connection with proper authentication.
 * 
 * Usage:
 * 1. Browser calls /api/realtime-proxy with action='create-session' → gets token
 * 2. Browser initiates WebSocket to /api/realtime-ws?token={token}
 * 3. This handler relays all frames to OpenAI's Realtime API
 */

export async function GET(request: NextRequest) {
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = request.headers.get('upgrade');
  if (upgradeHeader?.toLowerCase() !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 400 });
  }

  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return new Response('Missing token parameter', { status: 400 });
  }

  try {
    // Forward the WebSocket upgrade to OpenAI with Authorization header
    const openaiUrl = new URL('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-26');
    
    // Create forwarding request to OpenAI
    const response = await fetch(openaiUrl.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Upgrade': 'websocket',
        'Connection': 'Upgrade',
        'Sec-WebSocket-Key': request.headers.get('sec-websocket-key') || '',
        'Sec-WebSocket-Version': '13',
      },
      // @ts-ignore - Fetch API doesn't officially support WebSocket, but Node.js does
      duplex: 'half',
    });

    return response;
  } catch (error) {
    console.error('WebSocket relay error:', error);
    return new Response('WebSocket relay failed', { status: 500 });
  }
}
