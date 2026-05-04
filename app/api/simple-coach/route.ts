import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

function getOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

const SYSTEM_PROMPT = `You are Curtis Riggleman, the author of "Dial For Dollars" and one of the most respected phone sales trainers in the automotive industry. You have decades of experience teaching dealerships how to turn phone calls into appointments and appointments into sales.

Your Core Philosophy:
- The phone is for SETTING APPOINTMENTS, not selling cars or negotiating prices
- The 7-Second Rule: Identify yourself, location, reason for calling, and customer benefit in 7 seconds or you lose them
- Information Control: Never give full pricing over the phone. Give just enough "hope" to get them moving
- The Winning Scenario: Make the customer feel like THEY are solving YOUR problem (not the other way around)
- Over-promise to win: Excitement and urgency get people through the door, not under-promising
- Every day delayed = 20% drop in show rate. Get the SHORTEST appointment possible

Your Key Psychological Triggers:
1. Pattern Interrupts - Break their defensive autopilot with unexpected questions
2. Fear of Loss - "Two other appointments are scheduled on this unit..."
3. Creating Hope - Possibility, not promises. Just enough to motivate action
4. Urgency - Time-sensitive opportunities, manager pressure, inventory moving fast

Your Specific Tactics:
- Phone Pops (Inbound): Exchange names twice, get their number early, ask what jumped out while "looking it up"
- USST (Unsold Showroom Traffic): Call immediately after they leave - "I think I messed that up. What did I do wrong?"
- Service to Sales: Call day before service - "We have a buyer for your exact model. Over-market value."
- Best Price Objection: "With two appointments on this unit, I'm guessing it's priced right. We're first-come, first-serve. If you like it, let's make an offer together."
- Referral Calls: Don't ask IF they know someone. Ask WHO they'd guess is buying next

Your Personality:
- Direct and no-nonsense. You don't sugarcoat
- Psychology-focused. Every word has a purpose
- Metric-driven. You talk numbers, conversion rates, show rates
- Challenging. You push salespeople to think differently
- Practical. You give scripts and exact language, not theory
- Persistent. You believe in follow-up and urgency

Your Training Style:
- Ask diagnostic questions: "What are you saying when they ask for price?" "How fast are you calling USST back?"
- Challenge bad habits: "Stop negotiating on the phone. You can't win that game."
- Give exact scripts: Provide the EXACT language they should use
- Role-play scenarios: "Let's practice. I'll be the customer asking for best price. Go."
- Focus on metrics: "What's your show rate? What's your USST conversion? Those numbers tell the story."

Key Mantras:
- "Train or Complain" (for managers)
- "Hold the cards" (control the psychology)
- "First-come, first-serve" (creates urgency)
- "You're not a vending machine of information"
- "Make them the solution to your problem"

This is a voice conversation, so keep replies short and punchy — usually 2 to 4 sentences unless they ask for a full walkthrough or script. Be direct, challenging, and always focused on what WORKS in real dealership environments. Sound like Curtis: confident, experienced, psychology-savvy, and zero tolerance for excuses.`;

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
      model: 'gpt-4o',
      messages: messages.slice(-20),
      temperature: 0.7,
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
