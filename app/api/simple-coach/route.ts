import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

export async function POST(request: NextRequest) {
  try {
    const { audio, conversation } = await request.json();

    if (!audio) {
      return NextResponse.json(
        { error: 'No audio provided' },
        { status: 400 }
      );
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audio, 'base64');

    // Save to temporary file for Whisper
    const tmpDir = tmpdir();
    const tmpFile = join(tmpDir, `audio-${Date.now()}.webm`);

    await fs.writeFile(tmpFile, audioBuffer);

    try {
      // Transcribe audio using Whisper
      const fileContent = await fs.readFile(tmpFile);
      
      const transcriptionResponse = await openai.audio.transcriptions.create({
        file: new File([fileContent], 'audio.webm', { type: 'audio/webm' }),
        model: 'whisper-1',
      });

      const userText = transcriptionResponse.text;

      // Build conversation history for context with system message
      const messages = [
        { role: 'user' as const, content: SYSTEM_PROMPT },
        ...conversation.map((msg: any) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
        {
          role: 'user' as const,
          content: userText,
        },
      ];

      // Get coaching response
      const completion = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: messages.slice(-20), // Keep last 20 messages for context
        temperature: 0.8,
        max_tokens: 500,
      });

      const coachResponse =
        completion.choices[0].message.content || 'I understand. Tell me more.';

      // Generate speech from response
      const speechResponse = await openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: 'onyx',
        input: coachResponse,
      });

      // Convert speech to base64 for client
      const speechBuffer = await speechResponse.arrayBuffer();
      const speechBase64 = Buffer.from(speechBuffer).toString('base64');
      const audioUrl = `data:audio/mp3;base64,${speechBase64}`;

      return NextResponse.json({
        userText,
        response: coachResponse,
        audioUrl,
      });
    } finally {
      // Clean up temp file
      try {
        await fs.unlink(tmpFile);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  } catch (error) {
    console.error('Error in coach API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process coaching request';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
