# Riggleman Sales Coach

An AI-powered voice coaching application for Hyundai and Kia sales professionals. Have natural conversations with your personal sales coach to improve call handling, objection management, and closing techniques.

## Features

- 🎤 **Voice-First Interface**: Natural conversations with AI coach via microphone
- 📊 **Performance Discussion**: Talk about call volume, conversion rates, and metrics
- 💡 **Actionable Advice**: Get practical tips for automotive sales
- 📝 **Transcript Tracking**: See your conversation history in real-time
- 🎯 **Hyundai/Kia Focused**: Coaching tailored to automotive sales challenges
- 🌙 **Dark Theme**: Professional, easy-on-the-eyes design with green accents

## Prerequisites

- Node.js 18+ and npm
- OpenAI API key (for Whisper, GPT-4, and TTS)

## Installation

1. Clone or download this project
2. Navigate to the project directory:
   ```bash
   cd riggleman-voice-coach
   ```

3. Install dependencies:
   ```bash
   npm install
   ```

4. Set up environment variables:
   ```bash
   cp .env.local.example .env.local
   ```
   Edit `.env.local` and add your OpenAI API key:
   ```
   OPENAI_API_KEY=sk-...
   ```

## Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Home Page**: Click "Start Coaching Session" to begin
2. **Coaching Page**: 
   - Click the microphone button to start recording
   - Speak naturally about your sales challenges
   - Your coach will listen, transcribe, and respond
   - See your conversation in the right sidebar
   - Audio responses are played automatically
3. **End Session**: Click "End Session" when done

## Technology Stack

- **Framework**: Next.js 16 with TypeScript
- **Styling**: Tailwind CSS
- **AI/ML**: 
  - OpenAI Whisper (speech-to-text)
  - GPT-4 Turbo (coaching intelligence)
  - OpenAI TTS (text-to-speech)
- **Audio**: Web Audio API, MediaRecorder API

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key (required) |
| `NEXT_PUBLIC_API_URL` | API base URL (default: http://localhost:3000) |

## Deployment

### Vercel

1. Push your code to a Git repository (GitHub, GitLab, etc.)
2. Import the project to [Vercel](https://vercel.com)
3. Add `OPENAI_API_KEY` to Environment Variables
4. Deploy

### Other Platforms

This is a standard Next.js app and can be deployed to any Node.js hosting:

```bash
npm run build
npm run start
```

## API Routes

- `POST /api/simple-coach` - Main coaching endpoint
  - Accepts audio (base64), returns transcription and coach response

## System Prompt

The coach uses this personality:

> You are a sales coaching expert specializing in Hyundai and Kia vehicle sales. Your role is to help sales professionals improve their performance. Ask about their call volume, conversion rates, and common objections they face. Provide actionable, practical advice based on their responses.

## Cost Considerations

This app uses OpenAI APIs which have associated costs:
- Whisper API: ~$0.02 per minute of audio
- GPT-4 Turbo: ~$0.01 per 1K input tokens
- TTS: ~$0.015 per 1K characters

Typical conversation: ~$0.05-$0.10 per coaching session

## Troubleshooting

**Microphone not working?**
- Check browser permissions for microphone access
- Ensure HTTPS in production (required for Web Audio API)
- Try a different browser

**API errors?**
- Verify `OPENAI_API_KEY` is set correctly
- Check OpenAI account has API access and credits
- Review browser console for detailed error messages

**Audio playback not working?**
- Ensure browser allows audio playback
- Try clicking on the page first (some browsers require user interaction)

## License

© 2026 AWEVO Software Solutions

## Support

For issues or feature requests, contact support@awevo.com

---

**Built for sales professionals who want to improve, by AWEVO Software Solutions**
