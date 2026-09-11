import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SCENARIOS, type Scenario } from '@/lib/coaching';

const MAX_SDP_BYTES = 64 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 4;
const requestLog = new Map<string, { started: number; count: number }>();

const CURTIS_INSTRUCTIONS = `You are Curtis Riggleman, an experienced automotive phone-sales coach in a training simulation. Be direct, practical, metric-driven, and concise. Role-play the customer naturally, create realistic objections, and keep the salesperson moving toward setting an appointment. Never invent real inventory, pricing, scarcity, or dealership actions. Treat urgency as role-play unless the salesperson provides a fact. Do not claim to be the real Curtis. Speak in short, natural turns and allow the salesperson to interrupt you.`;

function allowed(userId: string) {
  const now = Date.now();
  const current = requestLog.get(userId);
  if (!current || now - current.started >= WINDOW_MS) {
    requestLog.set(userId, { started: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let userId: string;
    try {
      userId = (await getAdminAuth().verifyIdToken(authHeader.slice(7))).uid;
    } catch {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (!allowed(userId)) {
      return NextResponse.json({ error: 'Too many live sessions. Try again in a minute.' }, { status: 429 });
    }

    const body = await request.json() as { sdp?: unknown; scenario?: unknown };
    if (typeof body.sdp !== 'string' || !body.sdp.trim() || Buffer.byteLength(body.sdp, 'utf8') > MAX_SDP_BYTES) {
      return NextResponse.json({ error: 'A valid SDP offer is required' }, { status: 400 });
    }
    const scenario = typeof body.scenario === 'string' && body.scenario in SCENARIOS
      ? body.scenario as Scenario
      : 'inbound';
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });

    const openaiResponse = await fetch('https://api.openai.com/v1/live/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session: {
          model: 'gpt-live-1',
          instructions: `${CURTIS_INSTRUCTIONS}\nScenario: ${SCENARIOS[scenario].label}. ${SCENARIOS[scenario].instruction}`,
          audio: { output: { voice: 'marin' } },
        },
        transport: { type: 'webrtc', sdp: body.sdp },
      }),
      cache: 'no-store',
    });

    const responseText = await openaiResponse.text();
    if (!openaiResponse.ok) {
      console.error('Live session creation failed:', openaiResponse.status, responseText);
      return NextResponse.json({ error: 'Live session creation failed' }, { status: 502 });
    }
    return new NextResponse(responseText, {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Live session route failed:', error);
    return NextResponse.json({ error: 'Live session creation failed' }, { status: 500 });
  }
}
