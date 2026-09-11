'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { SCENARIOS, type Scenario } from '@/lib/coaching';
import { buildLeaderboardEntry, type LeaderboardEntry } from '@/lib/leaderboard';

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function PodiumCard({ entry, place }: { entry: LeaderboardEntry; place: 1 | 2 | 3 }) {
  const styles = {
    1: {
      order: 'order-1 md:order-2',
      height: 'min-h-[270px]',
      border: 'border-[#e2a73f]/80',
      glow: 'shadow-[0_0_55px_rgba(226,167,63,0.22)]',
      avatar: 'h-24 w-24 border-[#f2cd7f] bg-[#c58b2a] text-3xl text-[#17120a]',
      label: '1st',
      badge: 'bg-[#f2cd7f] text-[#17120a]',
    },
    2: {
      order: 'order-2 md:order-1',
      height: 'min-h-[228px]',
      border: 'border-slate-500/70',
      glow: 'shadow-[0_0_30px_rgba(148,163,184,0.1)]',
      avatar: 'h-20 w-20 border-slate-300 bg-slate-600 text-2xl text-white',
      label: '2nd',
      badge: 'bg-slate-300 text-slate-900',
    },
    3: {
      order: 'order-3',
      height: 'min-h-[210px]',
      border: 'border-[#a86f45]/70',
      glow: 'shadow-[0_0_30px_rgba(168,111,69,0.12)]',
      avatar: 'h-20 w-20 border-[#d89b70] bg-[#8d5738] text-2xl text-white',
      label: '3rd',
      badge: 'bg-[#d89b70] text-[#24140d]',
    },
  }[place];

  return (
    <article className={`relative flex w-full max-w-[260px] flex-col items-center justify-end rounded-t-[2rem] rounded-b-xl border bg-gradient-to-b from-slate-800 to-slate-900 px-4 pb-5 pt-6 text-center transition-transform hover:-translate-y-1 ${styles.order} ${styles.height} ${styles.border} ${styles.glow}`}>
      <span className={`absolute -top-3 rounded-full px-3 py-1 text-xs font-black uppercase tracking-widest ${styles.badge}`}>{styles.label}</span>
      {place === 1 ? <span className="mb-2 text-xl" aria-label="winner">♛</span> : null}
      <div className={`flex items-center justify-center rounded-full border-4 font-black ${styles.avatar}`}>{initials(entry.displayName)}</div>
      <p className="mt-3 max-w-full truncate px-2 text-base font-bold text-white">{entry.displayName}</p>
      <p className="mt-1 text-xs text-slate-400">{SCENARIOS[entry.bestScenario]?.label || 'Coaching session'}</p>
      <div className="mt-3 flex items-end gap-1">
        <span className="text-3xl font-black text-[#f2cd7f]">{entry.bestScore}</span>
        <span className="mb-1 text-sm text-slate-500">/30</span>
      </div>
      <p className="mt-1 text-xs text-slate-500">best call • {entry.sessions} session{entry.sessions === 1 ? '' : 's'}</p>
    </article>
  );
}

function LeaderboardContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const syncCurrentUser = useCallback(async () => {
    if (!user) return;
    const snapshot = await getDocs(query(collection(db, 'sessions'), where('userId', '==', user.uid)));
    const completed = snapshot.docs.map((item) => item.data())
      .filter((item) => item.status === 'completed' && item.scorecard && item.score && typeof item.score.total === 'number')
      .map((item) => ({ score: item.score, scenario: item.scenario as Scenario, endedAt: item.endedAt as string | undefined }));
    const entry = buildLeaderboardEntry(user.uid, user.displayName || 'Sales Rep', completed);
    if (entry) await setDoc(doc(db, 'leaderboard', user.uid), entry);
  }, [user]);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      await syncCurrentUser();
      const snapshot = await getDocs(query(collection(db, 'leaderboard')));
      setEntries(snapshot.docs.map((item) => item.data() as LeaderboardEntry).sort((a, b) => {
        if (b.bestScore !== a.bestScore) return b.bestScore - a.bestScore;
        if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
        return b.sessions - a.sessions;
      }));
    } catch (error) {
      console.error('Could not load leaderboard:', error);
    } finally {
      setLoading(false);
    }
  }, [syncCurrentUser, user]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const currentRank = useMemo(() => entries.findIndex((entry) => entry.uid === user?.uid) + 1, [entries, user]);
  // Keep empty podium slots in place so a single user is still shown as 1st,
  // rather than being compressed into the 2nd-place visual slot.
  const podium = [entries[1], entries[0], entries[2]];

  return <main className="min-h-[100dvh] bg-slate-900 text-white">
    <header className="border-b border-slate-800 px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f2cd7f]">Curtis AI</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">The Podium</h1><p className="text-sm text-slate-400">The best calls rise to the top.</p></div>
        <div className="flex items-center gap-2"><button onClick={() => router.push('/coaching')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-[#c58b2a] hover:text-white">Coach</button><button onClick={() => router.push('/progress')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-[#c58b2a] hover:text-white">Progress</button><button onClick={async () => { await signOut(); router.push('/'); }} className="px-2 py-2 text-sm text-slate-400 hover:text-white">Sign out</button></div>
      </div>
    </header>

    <div className="mx-auto max-w-6xl space-y-7 px-4 py-7 sm:px-8 sm:py-10">
      <section className="relative overflow-hidden rounded-[2rem] border border-[#c58b2a]/40 bg-[radial-gradient(circle_at_50%_0%,rgba(197,139,42,0.2),transparent_58%),linear-gradient(145deg,#1c2430,#0f131a)] px-4 pb-7 pt-8 shadow-[0_20px_60px_rgba(0,0,0,0.25)] sm:px-8 sm:pt-10">
        <div className="relative z-10 text-center"><p className="text-xs font-bold uppercase tracking-[0.28em] text-[#f2cd7f]">All-time rankings</p><h2 className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">Who’s on top?</h2><p className="mx-auto mt-3 max-w-lg text-sm text-slate-300">Bring your best call. Climb the podium. Keep sharpening your edge.</p></div>
        {loading ? <p className="py-16 text-center text-slate-400">Loading rankings…</p> : entries.length === 0 ? <p className="py-16 text-center text-slate-400">Complete a scored session to claim your spot.</p> : <div className="mx-auto mt-10 flex max-w-4xl items-end justify-center gap-2 sm:gap-5 md:gap-8">{podium.map((entry, index) => entry ? <PodiumCard key={entry.uid} entry={entry} place={([2, 1, 3] as const)[index]} /> : <div key={`podium-slot-${index}`} className="hidden w-full max-w-[260px] md:block" />)}</div>}
        {currentRank > 0 ? <div className="relative z-10 mx-auto mt-7 flex w-fit items-center gap-2 rounded-full border border-[#c58b2a]/40 bg-slate-900/70 px-4 py-2 text-sm text-[#f2cd7f]"><span className="h-2 w-2 rounded-full bg-[#f2cd7f]" />Your position: <strong>#{currentRank}</strong></div> : null}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/70">
        <div className="flex items-end justify-between border-b border-slate-700 px-5 py-4 sm:px-6"><div><h2 className="text-lg font-bold">The rankings</h2><p className="mt-1 text-sm text-slate-400">Best score first, then average score and consistency.</p></div><span className="hidden text-xs uppercase tracking-widest text-slate-500 sm:block">Top 50</span></div>
        {loading ? <p className="p-8 text-center text-slate-400">Loading rankings…</p> : entries.length === 0 ? <p className="p-8 text-center text-slate-400">No rankings yet.</p> : <div className="divide-y divide-slate-700">{entries.slice(0, 50).map((entry, index) => <div key={entry.uid} className={`flex items-center gap-3 px-5 py-4 sm:px-6 ${entry.uid === user?.uid ? 'bg-[#c58b2a]/10' : ''}`}><span className="w-8 text-center text-sm font-bold text-slate-500">{index + 1}</span><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-slate-300">{initials(entry.displayName)}</div><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{entry.displayName}{entry.uid === user?.uid ? <span className="ml-2 text-xs font-normal text-[#f2cd7f]">You</span> : null}</p><p className="mt-1 text-xs text-slate-400">{SCENARIOS[entry.bestScenario]?.label || 'Coaching session'} • {entry.sessions} session{entry.sessions === 1 ? '' : 's'}</p></div><div className="text-right"><p className="text-xl font-bold text-[#f2cd7f]">{entry.bestScore}<span className="text-sm font-normal text-slate-500">/30</span></p><p className="text-xs text-slate-500">{entry.averageScore} avg</p></div></div>)}</div>}
        {entries.length > 50 ? <p className="px-5 pb-5 text-center text-xs text-slate-500">Showing the top 50 sales professionals.</p> : null}
      </section>

      <section className="rounded-xl border border-slate-800/80 bg-slate-900/50 px-5 py-4 sm:px-6"><div className="flex gap-3"><span className="mt-0.5 text-[#f2cd7f]" aria-hidden="true">◆</span><div><h2 className="text-sm font-semibold text-slate-200">How the rankings work</h2><p className="mt-1 text-xs leading-5 text-slate-500">Every completed scorecard contributes automatically. Rankings use your best call, average score, and completed sessions. Your display name and aggregate stats are public; transcripts and coaching notes stay private.</p></div></div></section>
    </div>
  </main>;
}

export default function LeaderboardPage() { return <ProtectedRoute><LeaderboardContent /></ProtectedRoute>; }
