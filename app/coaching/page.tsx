'use client';

import { useState, useEffect, useRef } from 'react';
import VoiceChat from '@/components/VoiceChat';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { addDoc, collection, doc, getDocs, increment, query, setDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SCENARIOS, emptyScore, type Scenario, type Score } from '@/lib/coaching';
import { buildLeaderboardEntry } from '@/lib/leaderboard';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionScorecard {
  summary: string;
  strengths: string[];
  improvements: string[];
}

interface RecentScorecard {
  id: string;
  scenario: Scenario;
  endedAt?: string;
  score: Score;
  scorecard: SessionScorecard;
  messages: ConversationMessage[];
}

const formatScorecardDate = (value?: string) => value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value))
  : 'Recent session';

const scenarioLabel = (value: Scenario) => SCENARIOS[value]?.label || 'Coaching session';

function CoachingPageContent() {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('inbound');
  const [score, setScore] = useState<Score>(emptyScore());
  const [scorecard, setScorecard] = useState<SessionScorecard | null>(null);
  const [showScorecardModal, setShowScorecardModal] = useState(false);
  const [recentScorecards, setRecentScorecards] = useState<RecentScorecard[]>([]);
  const [activeScorecardIndex, setActiveScorecardIndex] = useState(0);
  const [selectedRecentScorecard, setSelectedRecentScorecard] = useState<RecentScorecard | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const sessionId = useRef<string | null>(null);
  const sessionStatus = useRef<'active' | 'completed' | null>(null);
  const conversationRef = useRef<ConversationMessage[]>([]);
  const deckDragStart = useRef<number | null>(null);
  const { user, userProfile, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'sessions'), where('userId', '==', user.uid)))
      .then((snapshot) => {
        const completed = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() } as RecentScorecard & { status?: string }))
          .filter((item) => item.status === 'completed' && item.scorecard && item.score)
          .sort((a, b) => new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime())
          .slice(0, 3)
          .map((item) => ({ ...item, messages: item.messages || [] }));
        setRecentScorecards(completed);
      })
      .catch((error) => console.error('Could not load recent scorecards:', error));
  }, [user]);

  const handleSessionStarted = async () => {
    if (!user || sessionStatus.current === 'active') return;
    const now = new Date().toISOString();
    const ref = await addDoc(collection(db, 'sessions'), {
      userId: user.uid,
      scenario,
      status: 'active',
      messages: [],
      score: emptyScore(),
      startedAt: now,
      updatedAt: now,
    });
    sessionId.current = ref.id;
    sessionStatus.current = 'active';
    setIsSessionActive(true);
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Sales Rep',
      role: 'sales_rep',
      lastActive: now,
    }, { merge: true });
  };

  // Check screen size - hide sidebar on mobile
  useEffect(() => {
    const checkScreen = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const handleTranscriptUpdate = (message: ConversationMessage) => {
    const nextConversation = [...conversationRef.current, message];
    conversationRef.current = nextConversation;
    setConversation(nextConversation);

    if (sessionId.current && user) {
      setDoc(doc(db, 'sessions', sessionId.current), {
        messages: nextConversation,
        updatedAt: new Date().toISOString(),
      }, { merge: true }).catch(console.error);
    }
    
    // Track message count
    if (user && message.role === 'user') {
      setDoc(doc(db, 'users', user.uid), {
        totalMessages: increment(1),
        lastActive: new Date().toISOString(),
      }, { merge: true }).catch(console.error);
    }
  };

  const handleTurnComplete = async (turn: { userText: string; coachResponse: string; score: Score }) => {
    setScore(turn.score);
    if (!sessionId.current || !user) return;
    await setDoc(doc(db, 'sessions', sessionId.current), {
      messages: conversationRef.current.length > 0 ? conversationRef.current : [
        { role: 'user', content: turn.userText }, { role: 'assistant', content: turn.coachResponse },
      ],
      score: turn.score, scenario, updatedAt: new Date().toISOString(),
    }, { merge: true }).catch(console.error);
  };

  const handleSessionScored = async (result: { score: Score; summary: string; strengths: string[]; improvements: string[]; transcript: ConversationMessage[] }) => {
    setScore(result.score);
    setScorecard({ summary: result.summary, strengths: result.strengths, improvements: result.improvements });
    setShowScorecardModal(true);
    if (!sessionId.current) return;
    const completedSessionId = sessionId.current;
    const endedAt = new Date().toISOString();
    await setDoc(doc(db, 'sessions', completedSessionId), {
      status: 'completed',
      messages: result.transcript,
      score: result.score,
      scorecard: { summary: result.summary, strengths: result.strengths, improvements: result.improvements },
      endedAt,
      updatedAt: endedAt,
    }, { merge: true }).then(async () => {
      const recent: RecentScorecard = {
        id: completedSessionId,
        scenario,
        endedAt,
        score: result.score,
        scorecard: { summary: result.summary, strengths: result.strengths, improvements: result.improvements },
        messages: result.transcript,
      };
      setRecentScorecards((previous) => [recent, ...previous.filter((item) => item.id !== recent.id)].slice(0, 3));
      setActiveScorecardIndex(0);
      sessionStatus.current = 'completed';
      setIsSessionActive(false);
      sessionId.current = null;
      if (user) await setDoc(doc(db, 'users', user.uid), {
        totalSessions: increment(1),
        lastActive: endedAt,
      }, { merge: true });
      if (user && userProfile?.leaderboardOptIn) {
        const snapshot = await getDocs(query(collection(db, 'sessions'), where('userId', '==', user.uid)));
        const completed = snapshot.docs.map((item) => item.data())
          .filter((item) => item.status === 'completed' && item.scorecard && item.score && typeof item.score.total === 'number')
          .map((item) => ({ score: item.score as Score, scenario: item.scenario as Scenario, endedAt: item.endedAt as string | undefined }));
        const entry = buildLeaderboardEntry(user.uid, user.displayName || 'Sales Rep', completed);
        if (entry) await setDoc(doc(db, 'leaderboard', user.uid), entry);
      }
    }).catch(console.error);
  };

  const openRecentScorecard = (item: RecentScorecard) => {
    setSelectedRecentScorecard(item);
    setScore(item.score);
    setScorecard(item.scorecard);
    setShowScorecardModal(true);
  };

  const rotateScorecards = (direction: 1 | -1) => {
    if (recentScorecards.length < 2) return;
    setActiveScorecardIndex((current) => (current + direction + recentScorecards.length) % recentScorecards.length);
  };

  const handleSignOut = async () => {
    if (confirm('Sign out of your account?')) {
      await signOut();
      router.push('/');
    }
  };

  return (
    <div className="flex h-[100dvh] bg-slate-900">
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0">
        {/* Compact header */}
        <header className="shrink-0 px-4 sm:px-6 pt-3 pb-3 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-semibold text-white leading-tight truncate">
                Coaching Session
              </h1>
              <p className="text-slate-400 text-xs sm:text-sm leading-tight truncate">
                {userProfile?.displayName} • {userProfile?.dealership}
              </p>
      </div>

      {showScorecardModal && scorecard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="scorecard-title">
          <div className="max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#c58b2a]/70 bg-slate-800 p-4 sm:max-h-[90dvh] sm:p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#f2cd7f]">{selectedRecentScorecard ? `${scenarioLabel(selectedRecentScorecard.scenario)} • ${formatScorecardDate(selectedRecentScorecard.endedAt)}` : 'Session complete'}</p>
                <h2 id="scorecard-title" className="mt-1 text-xl font-bold text-white sm:text-2xl">Your Scorecard</h2>
              </div>
              <div className="flex items-start gap-3">
                <div className="text-right">
                  <p className="text-3xl font-bold text-white">{score.total}<span className="text-lg text-slate-400">/30</span></p>
                  <p className="text-xs text-slate-400">Overall score</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowScorecardModal(false)}
                  className="-mr-1 -mt-1 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                  aria-label="Close scorecard"
                >
                  <span aria-hidden="true" className="text-2xl leading-none">×</span>
                </button>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-200">{scorecard.summary}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {Object.entries(score).filter(([key]) => key !== 'total').map(([key, value]) => (
                <div key={key} className="rounded-xl bg-slate-700/70 p-3">
                  <p className="text-xs capitalize text-slate-400">{key.replace(/([A-Z])/g, ' $1')}</p>
                  <p className="mt-1 text-xl font-bold text-white">{value}<span className="text-sm font-normal text-slate-400">/5</span></p>
                </div>
              ))}
            </div>
            {scorecard.strengths.length > 0 && (
              <div className="mt-5">
                <h3 className="font-semibold text-emerald-300">Strengths</h3>
                <ul className="mt-2 space-y-1 text-sm text-emerald-100">
                  {scorecard.strengths.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>
            )}
            {scorecard.improvements.length > 0 && (
              <div className="mt-5">
                <h3 className="font-semibold text-amber-300">Next focus</h3>
                <ul className="mt-2 space-y-1 text-sm text-amber-100">
                  {scorecard.improvements.map((item) => <li key={item}>• {item}</li>)}
                </ul>
              </div>
            )}
            {selectedRecentScorecard && (
              <details className="mt-5 rounded-xl bg-slate-900/60 p-4">
                <summary className="cursor-pointer font-semibold text-slate-200">View conversation</summary>
                <div className="mt-4 space-y-3">
                  {selectedRecentScorecard.messages.map((message, index) => (
                    <div key={`${message.content}-${index}`} className={`rounded-lg p-3 text-sm ${message.role === 'user' ? 'bg-emerald-900/50 text-emerald-100' : 'bg-slate-700 text-slate-200'}`}>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wider opacity-70">{message.role === 'user' ? 'You' : 'Customer'}</p>
                      {message.content}
                    </div>
                  ))}
                </div>
              </details>
            )}
            <button
              type="button"
              onClick={() => { setShowScorecardModal(false); setSelectedRecentScorecard(null); }}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#f2cd7f] to-[#c58b2a] px-4 py-3 font-semibold text-[#17120a] shadow-[0_6px_18px_rgba(226,167,63,0.25)] transition-colors hover:from-[#f7d995] hover:to-[#e2a73f]"
            >
              Close scorecard
            </button>
          </div>
        </div>
      )}
    </div>
          <div className="flex w-full items-center justify-between gap-2 sm:w-auto">
            <label className="flex min-w-0 flex-1 flex-col items-start gap-1 text-xs font-medium text-slate-400 sm:flex-none sm:flex-row sm:items-center sm:gap-2">
              <span className="shrink-0">Pick a scenario for better context</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)} disabled={conversation.length > 0} className="w-full min-w-0 rounded bg-slate-700 px-2 py-2 text-sm text-white sm:w-auto">
                {Object.entries(SCENARIOS).map(([value, details]) => <option key={value} value={value}>{details.label}</option>)}
              </select>
            </label>
            <button
              onClick={() => router.push('/progress')}
              className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-[#c58b2a] hover:text-white"
            >
              Progress
            </button>
            <button onClick={() => router.push('/leaderboard')} className="shrink-0 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 transition-colors hover:border-[#c58b2a] hover:text-white">Leaderboard</button>
            <button
              onClick={handleSignOut}
              className="shrink-0 px-2 py-2 text-sm text-slate-400 transition-colors hover:text-white"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Voice Chat Component */}
        <div className="flex-1 flex flex-col min-h-0">
          {scorecard && (
            <div className="mx-3 mt-3 shrink-0 rounded-xl border border-[#c58b2a]/70 bg-slate-800 p-4 shadow-lg sm:mx-4 lg:hidden">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-[#f2cd7f]">Session Scorecard</h2>
                  <p className="text-sm text-slate-200 mt-1">{scorecard.summary}</p>
                </div>
                <div className="flex shrink-0 items-start gap-2">
                  <span className="text-xl font-bold text-white">{score.total}/30</span>
                  <button
                    type="button"
                    onClick={() => setScorecard(null)}
                    className="-mr-2 -mt-2 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
                    aria-label="Close scorecard"
                  >
                    <span aria-hidden="true" className="text-xl leading-none">×</span>
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                {Object.entries(score).filter(([key]) => key !== 'total').map(([key, value]) => (
                  <div key={key} className="rounded bg-slate-700/70 p-2">
                    <p className="text-[10px] text-slate-400 capitalize truncate">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-base font-bold text-white">{value}/5</p>
                  </div>
                ))}
              </div>
              {scorecard.improvements.length > 0 && <p className="text-xs text-amber-200 mt-3"><span className="font-semibold">Next focus:</span> {scorecard.improvements.join(' • ')}</p>}
            </div>
          )}
          <VoiceChat onTranscriptUpdate={handleTranscriptUpdate} onSessionStarted={handleSessionStarted} onTurnComplete={handleTurnComplete} onSessionScored={handleSessionScored} scenario={scenario} />
        </div>
      </div>

      {/* Desktop activity panel: live transcript during a call, scorecard deck when idle */}
      {isLargeScreen && (
        <aside className="w-96 shrink-0 border-l border-slate-700 bg-slate-800 p-5">
          {isSessionActive ? (
            <>
              <div className="border-b border-slate-700 pb-4">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#f2cd7f]" />
                  <h2 className="text-lg font-semibold text-white">Live conversation</h2>
                </div>
                <p className="mt-1 text-xs text-slate-400">{conversation.length} messages captured</p>
              </div>
              <div className="flex max-h-[calc(100dvh-10rem)] flex-col gap-3 overflow-y-auto py-4">
                {conversation.length === 0 ? <p className="text-sm text-slate-500">Your conversation will appear here as you speak.</p> : conversation.map((msg, idx) => (
                  <div key={idx} className={`text-sm ${msg.role === 'user' ? 'text-[#f2cd7f]' : 'text-slate-300'}`}>
                    <span className="font-semibold">{msg.role === 'user' ? 'You' : 'Customer'}: </span>{msg.content}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f2cd7f]">Your progress</p>
                  <h2 className="mt-1 text-xl font-bold text-white">Recent scorecards</h2>
                </div>
                <button onClick={() => router.push('/progress')} className="text-xs font-semibold text-[#f2cd7f] hover:text-white">View all</button>
              </div>
              <p className="mt-2 text-sm text-slate-400">Drag the cards to revisit your latest sessions.</p>
              {recentScorecards.length > 0 ? (
                <div
                  className="relative mt-5 h-[390px] touch-pan-y"
                  onPointerDown={(event) => { deckDragStart.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }}
                  onPointerUp={(event) => {
                    if (deckDragStart.current === null) return;
                    const distance = event.clientX - deckDragStart.current;
                    if (Math.abs(distance) > 45) rotateScorecards(distance < 0 ? 1 : -1);
                    deckDragStart.current = null;
                  }}
                >
                  {recentScorecards.map((item, offset) => {
                    const position = (offset - activeScorecardIndex + recentScorecards.length) % recentScorecards.length;
                    return <button
                      key={item.id}
                      type="button"
                      onClick={() => position === 0 ? openRecentScorecard(item) : rotateScorecards(position === 1 ? 1 : -1)}
                      className="absolute inset-x-0 top-0 flex h-[350px] cursor-grab flex-col rounded-2xl border border-[#c58b2a]/70 bg-gradient-to-br from-slate-700 to-slate-900 p-5 text-left shadow-2xl transition-all duration-300 active:cursor-grabbing"
                      style={{ zIndex: recentScorecards.length - position, transform: `translateY(${position * 18}px) scale(${1 - position * 0.045})`, opacity: position === 0 ? 1 : 0.72 }}
                      aria-label={`${scenarioLabel(item.scenario)} scorecard`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div><p className="text-xs font-semibold uppercase tracking-wider text-[#f2cd7f]">{formatScorecardDate(item.endedAt)}</p><h3 className="mt-2 text-lg font-bold text-white">{scenarioLabel(item.scenario)}</h3></div>
                        <span className="text-3xl font-bold text-[#f2cd7f]">{item.score.total}<span className="text-sm font-normal text-slate-400">/30</span></span>
                      </div>
                      <p className="mt-5 line-clamp-4 text-sm leading-6 text-slate-300">{item.scorecard.summary}</p>
                      <div className="mt-auto border-t border-slate-600 pt-4"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Next focus</p><p className="mt-2 line-clamp-2 text-sm text-amber-100">{item.scorecard.improvements[0] || 'Keep building consistency.'}</p></div>
                    </button>;
                  })}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-600 p-6 text-center"><p className="text-sm text-slate-300">Your completed scorecards will stack here after your first call.</p><button onClick={() => router.push('/progress')} className="mt-4 text-sm font-semibold text-[#f2cd7f] hover:text-white">Open progress dashboard</button></div>
              )}
              {recentScorecards.length > 1 && <div className="flex items-center justify-center gap-3"><button onClick={() => rotateScorecards(-1)} className="rounded-full border border-slate-600 px-3 py-1 text-slate-300 hover:border-[#c58b2a] hover:text-white" aria-label="Previous scorecard">←</button><span className="text-xs text-slate-500">{activeScorecardIndex + 1} of {recentScorecards.length}</span><button onClick={() => rotateScorecards(1)} className="rounded-full border border-slate-600 px-3 py-1 text-slate-300 hover:border-[#c58b2a] hover:text-white" aria-label="Next scorecard">→</button></div>}
            </>
          )}
        </aside>
      )}
    </div>
  );
}

export default function CoachingPage() {
  return (
    <ProtectedRoute>
      <CoachingPageContent />
    </ProtectedRoute>
  );
}
