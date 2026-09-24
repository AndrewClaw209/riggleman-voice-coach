import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { formatKnowledgeContext, searchCurtisBooks } from '@/lib/curtis-knowledge';

const MAX_QUERY_CHARS = 1200;
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const requestLog = new Map<string, { started: number; count: number }>();

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

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  let userId: string;
  try { userId = (await getAdminAuth().verifyIdToken(authHeader.slice(7))).uid; }
  catch { return NextResponse.json({ error: 'Authentication required' }, { status: 401 }); }
  if (!allowed(userId)) return NextResponse.json({ error: 'Too many knowledge searches. Try again shortly.' }, { status: 429 });

  const body = await request.json() as { query?: unknown };
  if (typeof body.query !== 'string' || !body.query.trim()) return NextResponse.json({ error: 'A query is required' }, { status: 400 });
  const sources = searchCurtisBooks(body.query.trim().slice(0, MAX_QUERY_CHARS));
  return NextResponse.json({ context: formatKnowledgeContext(sources), sources: sources.map((source) => source.source) });
}
