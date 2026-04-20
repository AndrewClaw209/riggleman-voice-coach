import { NextRequest, NextResponse } from 'next/server';

// Import the shared audio buffer from parent route
// Note: This requires exporting latestAudio from the parent module
let latestAudio: Buffer | null = null;

// Audio retrieval endpoint
export async function GET(request: NextRequest) {
  // Get latest audio from global state
  const audioModule = await import('../route');
  const audioBuffer = (audioModule as any).getLatestAudio?.();
  
  if (!audioBuffer) {
    return new NextResponse('No audio available', { status: 404 });
  }

  return new NextResponse(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length.toString(),
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Accept-Ranges': 'bytes',
    },
  });
}
