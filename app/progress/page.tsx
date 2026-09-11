'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { SCORE_DIMENSIONS, SCENARIOS, type Scenario, type Score } from '@/lib/coaching';

type Message = { role: 'user' | 'assistant'; content: string };
type StoredSession = {
  id: string;
  scenario: Scenario;
  endedAt?: string;
  startedAt?: string;
  score: Score;
  scorecard?: { summary?: string; strengths?: string[]; improvements?: string[] };
  messages?: Message[];
};

const labelFor = (key: string) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase());
const dateFor = (value?: string) => value ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value)) : 'Completed session';

function ProgressPageContent() {
  const { user, userProfile, signOut } = useAuth();
  const router = useRouter();
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<StoredSession | null>(null);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, 'sessions'), where('userId', '==', user.uid)))
      .then((snapshot) => {
        const completed = snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as StoredSession))
          .filter((item) => item.scorecard && item.score && typeof item.score.total === 'number')
          .sort((a, b) => new Date(b.endedAt || b.startedAt || 0).getTime() - new Date(a.endedAt || a.startedAt || 0).getTime());
        setSessions(completed);
      })
      .catch((error) => console.error('Could not load progress:', error))
      .finally(() => setLoading(false));
  }, [user]);

  const metrics = useMemo(() => {
    if (!sessions.length) return { average: 0, best: 0, recentChange: null as number | null, categoryAverages: Object.fromEntries(SCORE_DIMENSIONS.map((key) => [key, 0])) as Record<string, number> };
    const average = sessions.reduce((sum, item) => sum + item.score.total, 0) / sessions.length;
    const recent = sessions.slice(0, 5);
    const previous = sessions.slice(5, 10);
    const recentAverage = recent.reduce((sum, item) => sum + item.score.total, 0) / recent.length;
    const previousAverage = previous.length ? previous.reduce((sum, item) => sum + item.score.total, 0) / previous.length : null;
    const categoryAverages = Object.fromEntries(SCORE_DIMENSIONS.map((key) => [
      key,
      sessions.reduce((sum, item) => sum + Number(item.score[key] || 0), 0) / sessions.length,
    ]));
    return { average, best: Math.max(...sessions.map((item) => item.score.total)), recentChange: previousAverage === null ? null : recentAverage - previousAverage, categoryAverages };
  }, [sessions]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <main className="min-h-[100dvh] bg-slate-900 text-white">
      <header className="border-b border-slate-800 px-4 py-4 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f2cd7f]">Curtis AI</p>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">Your progress</h1>
            <p className="text-sm text-slate-400">{userProfile?.displayName || 'Sales professional'} • long-term coaching dashboard</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => router.push('/coaching')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-[#c58b2a] hover:text-white">Coach</button>
            <button onClick={() => router.push('/leaderboard')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-[#c58b2a] hover:text-white">Leaderboard</button>
            <button onClick={handleSignOut} className="px-2 py-2 text-sm text-slate-400 hover:text-white">Sign out</button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8 sm:py-8">
        {loading ? <div className="rounded-2xl border border-slate-800 bg-slate-800/60 p-8 text-center text-slate-400">Loading your scorecards…</div> : sessions.length === 0 ? (
          <div className="rounded-2xl border border-[#c58b2a]/40 bg-slate-800/70 p-8 text-center sm:p-12">
            <p className="text-lg font-semibold text-white">Your progress starts with your first completed call.</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-400">Complete a coaching session and your scorecard, transcript, and trends will appear here.</p>
            <button onClick={() => router.push('/coaching')} className="mt-6 rounded-xl bg-gradient-to-r from-[#f2cd7f] to-[#c58b2a] px-5 py-3 font-bold text-[#17120a] shadow-[0_8px_24px_rgba(226,167,63,0.25)]">Start coaching</button>
          </div>
        ) : <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ['Sessions', sessions.length.toString(), 'completed calls'],
              ['Average score', `${metrics.average.toFixed(1)}/30`, 'across all sessions'],
              ['Best score', `${metrics.best}/30`, 'personal best'],
              ['Recent trend', metrics.recentChange === null ? 'Building' : `${metrics.recentChange >= 0 ? '+' : ''}${metrics.recentChange.toFixed(1)}`, metrics.recentChange === null ? 'complete 10 sessions to compare' : 'vs. previous 5 sessions'],
            ].map(([title, value, note]) => <div key={title} className="rounded-2xl border border-slate-800 bg-slate-800/70 p-4 sm:p-5"><p className="text-xs uppercase tracking-wider text-slate-400">{title}</p><p className="mt-2 text-2xl font-bold text-white sm:text-3xl">{value}</p><p className="mt-1 text-xs text-slate-500">{note}</p></div>)}
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-2xl border border-slate-800 bg-slate-800/70 p-5 sm:p-6">
              <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Skill breakdown</h2><p className="mt-1 text-sm text-slate-400">Average across your completed scorecards</p></div><span className="text-sm text-[#f2cd7f]">out of 5</span></div>
              <div className="mt-6 space-y-4">{SCORE_DIMENSIONS.map((key) => { const value = metrics.categoryAverages[key]; return <div key={key}><div className="mb-1 flex justify-between text-sm"><span className="text-slate-300">{labelFor(key)}</span><span className="font-semibold text-[#f2cd7f]">{value.toFixed(1)}/5</span></div><div className="h-2 rounded-full bg-slate-700"><div className="h-2 rounded-full bg-gradient-to-r from-[#c58b2a] to-[#f2cd7f]" style={{ width: `${Math.min(100, value / 5 * 100)}%` }} /></div></div>; })}</div>
            </div>
            <div className="rounded-2xl border border-slate-800 bg-slate-800/70 p-5 sm:p-6"><h2 className="text-lg font-bold">Score trend</h2><p className="mt-1 text-sm text-slate-400">Most recent sessions</p><div className="mt-6 flex h-40 items-end gap-2">{sessions.slice(0, 10).reverse().map((item) => <button key={item.id} title={`${item.score.total}/30 — ${dateFor(item.endedAt)}`} onClick={() => setSelected(item)} className="group flex h-full flex-1 flex-col justify-end"><span className="mb-2 text-xs text-slate-400 opacity-0 group-hover:opacity-100">{item.score.total}</span><span className="min-h-2 w-full rounded-t bg-gradient-to-t from-[#c58b2a] to-[#f2cd7f]" style={{ height: `${Math.max(8, item.score.total / 30 * 100)}%` }} /></button>)}</div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>Older</span><span>Recent</span></div></div>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-800/70 p-5 sm:p-6"><div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold">Session history</h2><p className="mt-1 text-sm text-slate-400">Select a scorecard to review the full transcript and coaching notes.</p></div></div><div className="mt-4 divide-y divide-slate-700">{sessions.map((item) => <button key={item.id} onClick={() => setSelected(item)} className="flex w-full items-center justify-between gap-3 py-4 text-left hover:bg-slate-700/20"><div className="min-w-0"><p className="truncate font-semibold text-white">{SCENARIOS[item.scenario]?.label || 'Coaching session'}</p><p className="mt-1 text-xs text-slate-400">{dateFor(item.endedAt)} • {item.messages?.filter((message) => message.role === 'user').length || 0} salesperson responses</p></div><span className="shrink-0 text-lg font-bold text-[#f2cd7f]">{item.score.total}<span className="text-sm font-normal text-slate-500">/30</span></span></button>)}</div></section>
        </>}
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-6" role="dialog" aria-modal="true"><div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#c58b2a]/60 bg-slate-800 p-5 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wider text-[#f2cd7f]">{dateFor(selected.endedAt)}</p><h2 className="mt-1 text-2xl font-bold">{SCENARIOS[selected.scenario]?.label || 'Coaching session'}</h2></div><button onClick={() => setSelected(null)} aria-label="Close scorecard" className="rounded-full p-2 text-2xl leading-none text-slate-400 hover:bg-slate-700 hover:text-white">×</button></div><div className="mt-5 flex items-end gap-2"><span className="text-5xl font-bold text-white">{selected.score.total}</span><span className="mb-1 text-slate-400">/30</span></div><p className="mt-4 leading-6 text-slate-200">{selected.scorecard?.summary}</p><div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">{SCORE_DIMENSIONS.map((key) => <div key={key} className="rounded-xl bg-slate-700/70 p-3"><p className="text-xs text-slate-400">{labelFor(key)}</p><p className="mt-1 text-xl font-bold">{selected.score[key]}/5</p></div>)}</div><div className="mt-6 grid gap-5 sm:grid-cols-2"><div><h3 className="font-semibold text-emerald-300">Strengths</h3><ul className="mt-2 space-y-1 text-sm text-emerald-100">{(selected.scorecard?.strengths || []).map((item) => <li key={item}>• {item}</li>)}</ul></div><div><h3 className="font-semibold text-amber-300">Next focus</h3><ul className="mt-2 space-y-1 text-sm text-amber-100">{(selected.scorecard?.improvements || []).map((item) => <li key={item}>• {item}</li>)}</ul></div></div><details className="mt-6 rounded-xl bg-slate-900/60 p-4"><summary className="cursor-pointer font-semibold text-slate-200">View transcript</summary><div className="mt-4 space-y-3">{(selected.messages || []).map((message, index) => <div key={`${message.content}-${index}`} className={`rounded-lg p-3 text-sm ${message.role === 'user' ? 'bg-emerald-900/50 text-emerald-100' : 'bg-slate-700 text-slate-200'}`}><p className="mb-1 text-xs font-semibold uppercase tracking-wider opacity-70">{message.role === 'user' ? 'You' : 'Customer'}</p>{message.content}</div>)}</div></details><button onClick={() => setSelected(null)} className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#f2cd7f] to-[#c58b2a] px-4 py-3 font-bold text-[#17120a]">Close</button></div></div>}
    </main>
  );
}

export default function ProgressPage() { return <ProtectedRoute><ProgressPageContent /></ProtectedRoute>; }
