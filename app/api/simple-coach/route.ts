import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const SYSTEM_PROMPT = `You are a sales coaching expert specializing in Hyundai and Kia vehicle sales. Your role is to help sales professionals improve their performance.

Key responsibilities:
- Ask about their call volume, conversion rates, and common objections they face
- Provide actionable, practical advice based on their responses
- Be conversational, supportive, and focus on real-world strategies
- Share specific techniques for handling objections (price, features, warranty, etc.)
- Help them understand their sales metrics and how to improve them
- Offer tips on building rapport with customers
- Suggest ways to increase follow-ups and closing rates

This is a voice conversation, so keep replies short and natural — usually 2 to 4 sentences. Only go longer when the user explicitly asks for detail or a walkthrough. Be encouraging, direct, and always focus on practical, implementable advice that works in automotive sales.`;

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = getOpenAIClient();
    const { audio, conversation } = (await request.json()) as {
      audio?: string;
      conversation?: ConversationMessage[];
    };

    if (!audio) {
      return NextResponse.json(
        { error: 'No audio provided' },
        { status: 400 }
      );
    }

    const audioBuffer = Buffer.from(audio, 'base64');

    const transcriptionResponse = await openai.audio.transcriptions.create({
      file: new File([audioBuffer], 'audio.webm', { type: 'audio/webm' }),
      model: 'whisper-1',
    });
    const userText = transcriptionResponse.text;

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...(conversation ?? []).map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user' as const, content: userText },
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages.slice(-20),
      temperature: 0.8,
      max_tokens: 600,
    });

    const coachResponse =
      completion.choices[0].message.content || 'I understand. Tell me more.';

    const ttsResponse = await fetch(
      'https://api.openai.com/v1/audio/speech',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: 'onyx',
          input: coachResponse,
          response_format: 'mp3',
        }),
      }
    );

    if (!ttsResponse.ok || !ttsResponse.body) {
      const errorText = await ttsResponse.text().catch(() => '');
      console.error('TTS request failed:', ttsResponse.status, errorText);
      return NextResponse.json({ error: 'TTS request failed' }, { status: 502 });
    }

    return new Response(ttsResponse.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-User-Text': Buffer.from(userText, 'utf-8').toString('base64'),
        'X-Coach-Response': Buffer.from(coachResponse, 'utf-8').toString('base64'),
      },
    });
  } catch (error) {
    console.error('Error in coach API:', error);
    const errorMessage =
      error instanceof Error
        ? error.message
        : 'Failed to process coaching request';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
