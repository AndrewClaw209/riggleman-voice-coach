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

Be encouraging, direct, and always focus on practical, implementable advice that works in automotive sales.`;

type ConversationMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export async function POST(request: NextRequest) {
  try {
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
      model: 'gpt-4-turbo',
      messages: messages.slice(-20),
      temperature: 0.8,
      max_tokens: 500,
    });

    const coachResponse =
      completion.choices[0].message.content || 'I understand. Tell me more.';

    const speechResponse = await openai.audio.speech.create({
      model: 'tts-1-hd',
      voice: 'onyx',
      input: coachResponse,
    });
    const speechBuffer = Buffer.from(await speechResponse.arrayBuffer());

    return NextResponse.json({
      userText,
      response: coachResponse,
      audio: speechBuffer.toString('base64'),
      audioType: 'audio/mpeg',
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
