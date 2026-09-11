import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SCENARIOS, SCORE_DIMENSIONS, type Scenario } from '@/lib/coaching';

const MAX_MESSAGES = 80;
const MAX_MESSAGE_CHARS = 4000;

type TranscriptMessage = { role: 'user' | 'assistant'; content: string };

function validTranscript(value: unknown): TranscriptMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_MESSAGES).flatMap((message) => {
    if (!message || typeof message !== 'object') return [];
    const candidate = message as Record<string, unknown>;
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.content !== 'string') return [];
    const content = candidate.content.trim().slice(0, MAX_MESSAGE_CHARS);
    return content ? [{ role: candidate.role, content }] : [];
  });
}

function unauthorized() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return unauthorized();
    try {
      await getAdminAuth().verifyIdToken(authHeader.slice(7));
    } catch {
      return unauthorized();
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });

    const body = await request.json() as { transcript?: unknown; scenario?: unknown };
    const transcript = validTranscript(body.transcript);
    if (!transcript.some((message) => message.role === 'user')) {
      return NextResponse.json({ error: 'At least one salesperson response is required' }, { status: 400 });
    }
    const scenario = typeof body.scenario === 'string' && body.scenario in SCENARIOS
      ? body.scenario as Scenario
      : 'inbound';

    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 700,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `You score an automotive sales role-play for a practical coaching scorecard. The transcript uses role "user" for the human salesperson and role "assistant" for the AI customer. Scenario: ${SCENARIOS[scenario].label}. Score the salesperson only, from 0 to 5, on: ${SCORE_DIMENSIONS.join(', ')}. Evaluate how well the salesperson handled the customer; do not score or imitate the customer. Return valid JSON with exactly these keys: ${SCORE_DIMENSIONS.join(', ')}, total, summary, strengths, improvements. total must equal the six scores added together. strengths and improvements must each be arrays of 2 or 3 concise strings. summary must be one concise sentence. Do not reward fabricated pricing, inventory, scarcity, or dealership claims.`,
        },
        { role: 'user', content: JSON.stringify(transcript) },
      ],
    });

    const raw = JSON.parse(completion.choices[0]?.message.content || '{}') as Record<string, unknown>;
    const score = Object.fromEntries(SCORE_DIMENSIONS.map((key) => [
      key,
      Math.max(0, Math.min(5, Math.round(Number(raw[key]) || 0))),
    ])) as Record<(typeof SCORE_DIMENSIONS)[number], number>;
    const total = Object.values(score).reduce((sum, value) => sum + value, 0);
    const list = (value: unknown) => Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : [];

    return NextResponse.json({
      score: { ...score, total },
      summary: typeof raw.summary === 'string' ? raw.summary.slice(0, 500) : 'Review your scorecard and practice the lowest-scoring areas next.',
      strengths: list(raw.strengths),
      improvements: list(raw.improvements),
      scenario,
    });
  } catch (error) {
    console.error('Session scoring failed:', error);
    return NextResponse.json({ error: 'Failed to score coaching session' }, { status: 500 });
  }
}
