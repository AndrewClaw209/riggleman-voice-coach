import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try { await getAdminAuth().verifyIdToken(authHeader.slice(7)); } catch { return NextResponse.json({ error: 'Authentication required' }, { status: 401 }); }

  const body = await request.json() as { text?: unknown };
  if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 6000) return NextResponse.json({ error: 'Invalid speech text' }, { status: 400 });

  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const openaiKey = process.env.OPENAI_API_KEY;
  let response: Response;
  if (elevenLabsKey && voiceId) {
    response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': elevenLabsKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text: body.text.trim(), model_id: 'eleven_turbo_v2_5', voice_settings: { stability: 0.38, similarity_boost: 0.95, style: 0.2, use_speaker_boost: true } }),
    });
  } else if (openaiKey) {
    response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input: body.text.trim(), response_format: 'mp3' }),
    });
  } else return NextResponse.json({ error: 'No speech provider configured' }, { status: 500 });
  if (!response.ok) return NextResponse.json({ error: 'Voice response failed' }, { status: 502 });
  return NextResponse.json({ audio: Buffer.from(await response.arrayBuffer()).toString('base64') });
}
