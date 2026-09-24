import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { getAdminAuth } from '@/lib/firebase-admin';
import { formatKnowledgeContext, searchCurtisBooks } from '@/lib/curtis-knowledge';

const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 4000;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const requestLog = new Map<string, { started: number; count: number }>();

const SYSTEM_PROMPT = `You are Curtis AI, an AI sales advisor grounded in Curtis Riggleman's books and training material. Answer questions about automotive sales, objections, phone calls, discovery, closing, value, leadership, and dealership performance in Curtis's direct, practical coaching voice. Sound like a real coach speaking one-on-one: conversational, confident, concise, and energetic. Give clear advice and exact word tracks when useful. Focus on the customer's goals, emotion, value, and the next best action. Do not use markdown, bullet symbols, headings, or stage directions because your answer will be spoken aloud. Do not pretend to be the real Curtis, invent facts, pricing, inventory, or dealership actions, or present generic advice as if it came from Curtis's books. If the source material does not cover something, say so briefly and give the safest useful guidance. This is an advisor conversation, not a role-play or scored simulation.`;

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

async function synthesizeSpeech(input: string, openaiKey: string) {
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (elevenLabsKey && voiceId) {
    return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': elevenLabsKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: input,
        // The app is English-only. The English model preserves cloned vocal
        // identity more reliably than the multilingual model for this voice.
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.38, similarity_boost: 0.95, style: 0.2, use_speaker_boost: true },
      }),
    });
  }

  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input, response_format: 'mp3' }),
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
    const body = await request.json() as { audio?: unknown; audioType?: unknown; conversation?: unknown };
    if (typeof body.audio !== 'string' || !body.audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 });
    const audioBuffer = Buffer.from(body.audio, 'base64');
    if (!audioBuffer.length || audioBuffer.length > MAX_AUDIO_BYTES) return NextResponse.json({ error: 'Audio must be between 1 byte and 8 MB' }, { status: 413 });
    const conversation = validConversation(body.conversation);
    const openai = new OpenAI({ apiKey });
    const audioType = typeof body.audioType === 'string' && /^(audio\/(webm|mp4|ogg|mpeg|wav))/.test(body.audioType) ? body.audioType : 'audio/webm';
    const extension = audioType.includes('mp4') ? 'mp4' : audioType.includes('ogg') ? 'ogg' : audioType.includes('wav') ? 'wav' : audioType.includes('mpeg') ? 'mp3' : 'webm';
    stage = 'audio transcription';
    const transcription = await openai.audio.transcriptions.create({ file: new File([audioBuffer], `audio.${extension}`, { type: audioType }), model: 'whisper-1' });
    const userText = transcription.text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!userText) return NextResponse.json({ error: 'No speech detected' }, { status: 422 });
    const sourceContext = formatKnowledgeContext(searchCurtisBooks(userText));

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { role: 'system' as const, content: `Use the following relevant excerpts from Curtis's books as your source material. Do not mention retrieval or source labels unless asked, and do not invent details unsupported by the excerpts.\n\n${sourceContext}` },
      ...conversation,
      { role: 'user' as const, content: userText },
    ];
    stage = 'coach response';
    const completion = await openai.chat.completions.create({ model: 'gpt-4o', messages, temperature: 0.7, max_tokens: 600 });
    const coachResponse = completion.choices[0]?.message.content?.trim() || 'Tell me more.';
    stage = 'voice response';
    const ttsResponse = await synthesizeSpeech(coachResponse, apiKey);
    if (!ttsResponse.ok) {
      console.error('TTS request failed:', ttsResponse.status, await ttsResponse.text());
      return NextResponse.json({ error: 'Voice response failed', stage }, { status: 502 });
    }
    const audio = Buffer.from(await ttsResponse.arrayBuffer()).toString('base64');
    return NextResponse.json({ userText, coachResponse, audio });
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown server error';
    console.error(`Error in coach API during ${stage}:`, error);
    return NextResponse.json({ error: 'Failed to process coaching request', stage, detail }, { status: 500 });
  }
}
