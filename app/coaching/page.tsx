'use client';

import { useState, useEffect, useRef } from 'react';
import VoiceChat from '@/components/VoiceChat';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { addDoc, collection, doc, setDoc, updateDoc, increment } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { SCENARIOS, emptyScore, type Scenario, type Score } from '@/lib/coaching';

interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface SessionScorecard {
  summary: string;
  strengths: string[];
  improvements: string[];
}

function CoachingPageContent() {
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [isLargeScreen, setIsLargeScreen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>('inbound');
  const [score, setScore] = useState<Score>(emptyScore());
  const [scorecard, setScorecard] = useState<SessionScorecard | null>(null);
  const [showScorecardModal, setShowScorecardModal] = useState(false);
  const sessionId = useRef<string | null>(null);
  const { user, userProfile, signOut } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user || sessionId.current) return;
    addDoc(collection(db, 'sessions'), {
      userId: user.uid, scenario, status: 'active', messages: [], score: emptyScore(),
      startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    }).then((ref) => { sessionId.current = ref.id; }).catch(console.error);
    // A user may have authenticated before their profile was written (or may
    // be an account created before profiles were introduced). `updateDoc`
    // fails when the document does not exist; merge writes create it safely.
    setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email || '',
      displayName: user.displayName || 'Sales Rep',
      role: 'sales_rep',
      dealership: '',
      totalSessions: increment(1),
      totalMessages: 0,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
    }, { merge: true }).catch(console.error);
  }, [user, scenario]);

  // Check screen size - hide sidebar on mobile
  useEffect(() => {
    const checkScreen = () => setIsLargeScreen(window.innerWidth >= 1024);
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);

  const handleTranscriptUpdate = (message: ConversationMessage) => {
    setConversation((prev) => [...prev, message]);
    
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
    await updateDoc(doc(db, 'sessions', sessionId.current), {
      messages: [...conversation, { role: 'user', content: turn.userText }, { role: 'assistant', content: turn.coachResponse }],
      score: turn.score, scenario, updatedAt: new Date().toISOString(),
    }).catch(console.error);
  };

  const handleSessionScored = async (result: { score: Score; summary: string; strengths: string[]; improvements: string[] }) => {
    setScore(result.score);
    setScorecard({ summary: result.summary, strengths: result.strengths, improvements: result.improvements });
    setShowScorecardModal(true);
    if (!sessionId.current) return;
    await updateDoc(doc(db, 'sessions', sessionId.current), {
      status: 'completed',
      score: result.score,
      scorecard: { summary: result.summary, strengths: result.strengths, improvements: result.improvements },
      endedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).catch(console.error);
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
        <header className="shrink-0 px-4 sm:px-6 pt-3 pb-2 border-b border-slate-800 flex items-center justify-between gap-3">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="scorecard-title">
          <div className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-emerald-700/60 bg-slate-800 p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wider text-emerald-400">Session complete</p>
                <h2 id="scorecard-title" className="mt-1 text-2xl font-bold text-white">Your Scorecard</h2>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-white">{score.total}<span className="text-lg text-slate-400">/30</span></p>
                <p className="text-xs text-slate-400">Overall score</p>
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
            <button
              type="button"
              onClick={() => setShowScorecardModal(false)}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-500"
            >
              Close scorecard
            </button>
          </div>
        </div>
      )}
    </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span>Pick a scenario for better context</span>
              <select value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)} disabled={conversation.length > 0} className="bg-slate-700 text-white rounded px-2 py-1.5 text-sm">
                {Object.entries(SCENARIOS).map(([value, details]) => <option key={value} value={value}>{details.label}</option>)}
              </select>
            </label>
            <button
              onClick={handleSignOut}
              className="px-3 py-1.5 text-sm text-slate-400 hover:text-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Voice Chat Component */}
        <div className="flex-1 flex flex-col min-h-0">
          {scorecard && (
            <div className="shrink-0 mx-4 mt-3 rounded-xl border border-emerald-700/60 bg-slate-800 p-4 shadow-lg lg:hidden">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold text-emerald-300">Session Scorecard</h2>
                  <p className="text-sm text-slate-200 mt-1">{scorecard.summary}</p>
                </div>
                <span className="text-xl font-bold text-white shrink-0">{score.total}/30</span>
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
          <VoiceChat onTranscriptUpdate={handleTranscriptUpdate} onTurnComplete={handleTurnComplete} onSessionScored={handleSessionScored} scenario={scenario} />
        </div>
      </div>

      {/* Sidebar - Only rendered on large screens */}
      {isLargeScreen && (
        <div className="w-96 flex flex-col bg-slate-800 border-l border-slate-700 overflow-hidden">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-lg font-semibold text-white">Conversation</h2>
            <p className="text-xs text-slate-400 mt-1">
              Session #{userProfile?.totalSessions || 1} • {conversation.length} messages • Score {score.total}/30
            </p>
          </div>
          {scorecard && (
            <div className="p-4 border-b border-slate-700 bg-slate-900/40">
              <h3 className="text-base font-semibold text-emerald-300">Session Scorecard</h3>
              <p className="text-sm text-white mt-1">{scorecard.summary}</p>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {Object.entries(score).filter(([key]) => key !== 'total').map(([key, value]) => (
                  <div key={key} className="rounded bg-slate-700/70 p-2">
                    <p className="text-[11px] text-slate-400 capitalize">{key.replace(/([A-Z])/g, ' $1')}</p>
                    <p className="text-lg font-bold text-white">{value}/5</p>
                  </div>
                ))}
              </div>
              {scorecard.strengths.length > 0 && <p className="text-xs text-emerald-200 mt-3"><span className="font-semibold">Strengths:</span> {scorecard.strengths.join(' • ')}</p>}
              {scorecard.improvements.length > 0 && <p className="text-xs text-amber-200 mt-2"><span className="font-semibold">Next focus:</span> {scorecard.improvements.join(' • ')}</p>}
            </div>
          )}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {conversation.length === 0 ? (
              <p className="text-slate-500 text-sm">Conversation will appear here...</p>
            ) : (
              conversation.map((msg, idx) => (
                <div key={idx} className={`text-sm ${msg.role === 'user' ? 'text-blue-300' : 'text-slate-300'}`}>
                  <span className="font-semibold">{msg.role === 'user' ? 'You' : 'Coach'}: </span>
                  {msg.content}
                </div>
              ))
            )}
          </div>
        </div>
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
