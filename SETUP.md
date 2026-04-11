# Riggleman Sales Coach - Setup Guide

## ✅ Project Created Successfully

The Riggleman Sales Coach app has been built and is ready to use. This guide will help you get started.

## 📦 What's Included

### Core Application
- **Next.js 16** with TypeScript
- **Tailwind CSS** for dark-themed UI with green accents
- **OpenAI Integration** (Whisper, GPT-4, TTS)
- **Voice Chat** using Web Audio API
- **Transcript Display** with real-time updates

### Project Structure
```
riggleman-voice-coach/
├── app/
│   ├── page.tsx                 # Home page with CTA
│   ├── coaching/page.tsx        # Coaching session page
│   ├── api/
│   │   ├── simple-coach/route.ts    # Main API (Whisper + GPT + TTS)
│   │   ├── coach/route.ts           # Alternative API
│   │   └── realtime-token/route.ts  # Realtime API support
│   └── layout.tsx               # Root layout
├── components/
│   └── VoiceChat.tsx            # Voice chat UI component
├── public/                       # Static assets
├── README.md                     # User documentation
├── SETUP.md                      # This file
├── vercel.json                   # Vercel deployment config
├── .env.local                    # Environment variables
└── package.json                  # Dependencies
```

## 🚀 Quick Start

### 1. Get an OpenAI API Key

Go to [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys) and create an API key.

### 2. Configure the App

Edit `.env.local` and add your OpenAI API key:

```bash
OPENAI_API_KEY=sk-your-key-here
```

### 3. Run Locally

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000)

### 4. Test the App

1. Click "Start Coaching Session"
2. Click the microphone button and speak
3. The app will:
   - Record your audio
   - Transcribe it with Whisper
   - Get coaching advice from GPT-4
   - Generate spoken response with TTS
   - Display everything in the transcript

## 🌐 Deploy to Vercel

### Option A: Using Vercel CLI

```bash
npm i -g vercel
vercel
```

When prompted, add `OPENAI_API_KEY` to environment variables.

### Option B: Using GitHub

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com)
3. Import your repository
4. Add `OPENAI_API_KEY` environment variable
5. Deploy

## 💰 Cost Estimates

Per coaching session (5-10 minute conversation):
- Whisper: ~$0.01-0.02
- GPT-4 Turbo: ~$0.02-0.04
- TTS: ~$0.01-0.02
- **Total: ~$0.04-0.08 per session**

Set up usage alerts in your OpenAI dashboard to avoid surprises.

## 🔧 Customization

### Change the Coach's Personality

Edit the `SYSTEM_PROMPT` in:
- `app/api/simple-coach/route.ts` (main API)
- `app/api/coach/route.ts` (alternative)

### Change the UI Theme

Modify Tailwind classes in:
- `app/page.tsx` (home page)
- `app/coaching/page.tsx` (coaching page)
- `components/VoiceChat.tsx` (voice chat UI)

Current theme: Dark (slate-900) with green accents (emerald-600)

### Change the AI Model

In `app/api/simple-coach/route.ts`, update:
- `model: 'gpt-4-turbo'` → other available models
- `voice: 'onyx'` → 'alloy', 'echo', 'fable', 'nova', 'shimmer'

## 🐛 Troubleshooting

### "Microphone not working"
- Allow microphone permissions in browser
- Ensure HTTPS in production
- Try Chrome/Edge/Safari (not all browsers support Web Audio API)

### "API errors"
- Check `OPENAI_API_KEY` is set correctly
- Verify your OpenAI account has credits
- Check browser console for detailed errors

### "Audio playback not working"
- Browser may require user interaction before audio plays
- Check browser autoplay policy
- Verify speaker volume is not muted

### "Build errors"
- Clear `.next` folder: `rm -rf .next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Rebuild: `npm run build`

## 📋 Features Implemented

- [x] Home page with "Start Coaching Session" button
- [x] Coaching page with voice chat
- [x] Microphone input with recording
- [x] Audio transcription (Whisper)
- [x] AI coaching responses (GPT-4)
- [x] Text-to-speech output (OpenAI TTS)
- [x] Real-time transcript display
- [x] Dark theme with green accents
- [x] Session management
- [x] AWEVO Software Solutions footer
- [x] Production-ready build
- [x] Vercel deployment config
- [x] TypeScript support
- [x] Error handling

## 📝 Next Steps

1. **Test locally** - Verify all features work
2. **Add OpenAI key** - Configure your API key
3. **Deploy to Vercel** - Make it available online
4. **Monitor usage** - Set up cost alerts
5. **Customize** - Adjust prompts and styling as needed

## 📚 Documentation

- **User Guide**: See `README.md`
- **API Routes**: Check comments in `app/api/*/route.ts`
- **UI Components**: See `components/VoiceChat.tsx`

## 🔐 Security Notes

- Never commit `.env.local` to git
- Use environment variables for all secrets
- OpenAI API key is only used server-side (API routes)
- Audio files are processed and deleted immediately
- No data is stored or logged

## ⚠️ Important

- Audio processing happens on your server
- Each coaching session will use OpenAI API credits
- Set up usage alerts on OpenAI dashboard
- Test with small amounts first to understand costs

## 📞 Support

For issues:
1. Check the troubleshooting section above
2. Review browser console for error messages
3. Check OpenAI account status and API access
4. Verify `.env.local` configuration

---

**Built with ❤️ for sales professionals at AWEVO Software Solutions**

© 2026 AWEVO Software Solutions
