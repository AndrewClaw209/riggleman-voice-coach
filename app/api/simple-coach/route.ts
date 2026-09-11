import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAdminAuth } from '@/lib/firebase-admin';
import { SCENARIOS, SCORE_DIMENSIONS, type Scenario } from '@/lib/coaching';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestLog = new Map<string, { started: number; count: number }>();

const SYSTEM_PROMPT = `You are Curtis Riggleman, an experienced automotive phone-sales coach. Be direct, practical, metric-driven, and concise. Coach the salesperson toward setting an appointment, not negotiating a vehicle over the phone. Never invent inventory, pricing, scarcity, or customer facts. Treat urgency as role-play unless the user provides a real fact. Give exact language when useful. This is a training simulation; do not claim to be the real Curtis or imply a real dealership action was taken.`;

type ConversationMessage = { role: 'user' | 'assistant'; content: string };

function unauthorized() { return NextResponse.json({ error: 'Authentication required' }, { status: 401 }); }

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

function validConversation(value: unknown): ConversationMessage[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_MESSAGES).flatMap((message) => {
    if (!message || typeof message !== 'object') return [];
    const candidate = message as Record<string, unknown>;
    if ((candidate.role !== 'user' && candidate.role !== 'assistant') || typeof candidate.content !== 'string') return [];
    const content = candidate.content.trim().slice(0, MAX_MESSAGE_CHARS);
    return content ? [{ role: candidate.role, content }] : [];
  });
}

export async function POST(request: NextRequest) {
  let stage = 'request validation';
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) return unauthorized();
    let userId: string;
    try { userId = (await getAdminAuth().verifyIdToken(authHeader.slice(7))).uid; }
    catch { return unauthorized(); }
    if (!allowed(userId)) return NextResponse.json({ error: 'Too many requests. Try again in a minute.' }, { status: 429 });

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 });
    const body = await request.json() as { audio?: unknown; audioType?: unknown; conversation?: unknown; scenario?: unknown };
    if (typeof body.audio !== 'string' || !body.audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    const audioBuffer = Buffer.from(body.audio, 'base64');
    if (!audioBuffer.length || audioBuffer.length > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio must be between 1 byte and 8 MB' }, { status: 413 });
    const scenario = typeof body.scenario === 'string' && body.scenario in SCENARIOS ? body.scenario as Scenario : 'inbound';
    const conversation = validConversation(body.conversation);
    const openai = new OpenAI({ apiKey });
    const audioType = typeof body.audioType === 'string' && /^(audio\/(webm|mp4|ogg|mpeg|wav))/.test(body.audioType) ? body.audioType : 'audio/webm';
    const extension = audioType.includes('mp4') ? 'mp4' : audioType.includes('ogg') ? 'ogg' : audioType.includes('wav') ? 'wav' : audioType.includes('mpeg') ? 'mp3' : 'webm';
    stage = 'audio transcription';
    const transcription = await openai.audio.transcriptions.create({ file: new File([audioBuffer], `audio.${extension}`, { type: audioType }), model: 'whisper-1' });
    const userText = transcription.text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!userText) return NextResponse.json({ error: 'No speech detected' }, { status: 422 });

    const scenarioInstruction = SCENARIOS[scenario].instruction;
    const messages = [
      { role: 'system' as const, content: `${SYSTEM_PROMPT}\nScenario: ${SCENARIOS[scenario].label}. ${scenarioInstruction}` },
      ...conversation,
      { role: 'user' as const, content: userText },
    ];
    stage = 'coach response';
    const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages, temperature: 0.7, max_tokens: 600 });
    const coachResponse = completion.choices[0]?.message.content?.trim() || 'Tell me more.';
    stage = 'response scoring';
    const scoreCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', temperature: 0, max_tokens: 180,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: `Score the salesperson's latest response from 0 to 5 on these dimensions: ${SCORE_DIMENSIONS.join(', ')}. Return JSON with those exact keys and integer values only.` }, { role: 'user', content: userText }],
    });
    let score: Record<string, number> = {};
    try { score = JSON.parse(scoreCompletion.choices[0]?.message.content || '{}'); } catch { /* keep empty */ }
    const normalizedScore = Object.fromEntries(SCORE_DIMENSIONS.map((key) => [key, Math.max(0, Math.min(5, Math.round(Number(score[key]) || 0)))]));
    const total = Object.values(normalizedScore).reduce((sum, value) => sum + value, 0);
    stage = 'voice response';
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input: coachResponse, response_format: 'mp3' }) });
    if (!ttsResponse.ok) {
      console.error('TTS request failed:', ttsResponse.status, await ttsResponse.text());
      return NextResponse.json({ error: 'Voice response failed', stage }, { status: 502 });
    }
    const audio = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    return NextResponse.json({ userText, coachResponse, audio, score: { ...normalizedScore, total }, scenario });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown server error';
    console.error(`Error in coach API during ${stage}:`, error);
    return NextResponse.json({ error: 'Failed to process coaching request', stage, detail }, { status: 500 });
  }
}
