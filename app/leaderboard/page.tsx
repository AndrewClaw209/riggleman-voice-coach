'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { useRouter } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { SCENARIOS, type Scenario } from '@/lib/coaching';
import { buildLeaderboardEntry, type LeaderboardEntry } from '@/lib/leaderboard';

function LeaderboardContent() {
  const { user, userProfile, signOut } = useAuth();
  const router = useRouter();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadEntries = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
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
  }, [user]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const currentRank = useMemo(() => entries.findIndex((entry) => entry.uid === user?.uid) + 1, [entries, user]);

  const toggleParticipation = async () => {
    if (!user || !userProfile) return;
    setSaving(true);
    try {
      if (userProfile.leaderboardOptIn) {
        await deleteDoc(doc(db, 'leaderboard', user.uid));
        await setDoc(doc(db, 'users', user.uid), { leaderboardOptIn: false }, { merge: true });
      } else {
        const snapshot = await getDocs(query(collection(db, 'sessions'), where('userId', '==', user.uid)));
        const completed = snapshot.docs.map((item) => item.data())
          .filter((item) => item.status === 'completed' && item.scorecard && item.score && typeof item.score.total === 'number')
          .map((item) => ({ score: item.score, scenario: item.scenario as Scenario, endedAt: item.endedAt as string | undefined }));
        const entry = buildLeaderboardEntry(user.uid, user.displayName || 'Sales Rep', completed);
        if (entry) await setDoc(doc(db, 'leaderboard', user.uid), entry);
        await setDoc(doc(db, 'users', user.uid), { leaderboardOptIn: true }, { merge: true });
      }
      window.location.reload();
    } catch (error) {
      console.error('Could not update leaderboard participation:', error);
      setSaving(false);
    }
  };

  return <main className="min-h-[100dvh] bg-slate-900 text-white">
    <header className="border-b border-slate-800 px-4 py-4 sm:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#f2cd7f]">Curtis AI</p><h1 className="mt-1 text-xl font-bold sm:text-2xl">Top performers</h1><p className="text-sm text-slate-400">Practice, improve, and see how you stack up.</p></div>
        <div className="flex items-center gap-2"><button onClick={() => router.push('/coaching')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-[#c58b2a] hover:text-white">Coach</button><button onClick={() => router.push('/progress')} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-[#c58b2a] hover:text-white">Progress</button><button onClick={async () => { await signOut(); router.push('/'); }} className="px-2 py-2 text-sm text-slate-400 hover:text-white">Sign out</button></div>
      </div>
    </header>
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-8 sm:py-10">
      <section className="rounded-2xl border border-[#c58b2a]/50 bg-gradient-to-br from-slate-800 to-slate-900 p-5 shadow-[0_12px_36px_rgba(197,139,42,0.12)] sm:p-7">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div><p className="text-sm font-semibold uppercase tracking-wider text-[#f2cd7f]">Social challenge</p><h2 className="mt-2 text-2xl font-bold">Compete on your best call</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Opt in to publish your display name, best score, average score, and completed session count. Your transcripts and coaching notes stay private.</p></div><button onClick={toggleParticipation} disabled={saving} className="shrink-0 rounded-xl bg-gradient-to-r from-[#f2cd7f] to-[#c58b2a] px-5 py-3 font-bold text-[#17120a] shadow-[0_8px_22px_rgba(226,167,63,0.2)]">{saving ? 'Updating…' : userProfile?.leaderboardOptIn ? 'Leave leaderboard' : 'Join leaderboard'}</button></div>
        {userProfile?.leaderboardOptIn && <p className="mt-4 text-sm text-emerald-300">You are ranked {currentRank > 0 ? `#${currentRank}` : 'when your next score syncs'}.</p>}
      </section>
      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-800/70">
        <div className="border-b border-slate-700 px-5 py-4 sm:px-6"><h2 className="text-lg font-bold">All-time leaderboard</h2><p className="mt-1 text-sm text-slate-400">Ranked by best score, then average score and consistency.</p></div>
        {loading ? <p className="p-8 text-center text-slate-400">Loading rankings…</p> : entries.length === 0 ? <p className="p-8 text-center text-slate-400">Be the first to join the leaderboard.</p> : <div className="divide-y divide-slate-700">{entries.slice(0, 50).map((entry, index) => <div key={entry.uid} className={`flex items-center gap-3 px-5 py-4 sm:px-6 ${entry.uid === user?.uid ? 'bg-[#c58b2a]/10' : ''}`}><span className={`w-8 text-center text-lg font-bold ${index < 3 ? 'text-[#f2cd7f]' : 'text-slate-500'}`}>{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-white">{entry.displayName}{entry.uid === user?.uid ? <span className="ml-2 text-xs font-normal text-[#f2cd7f]">You</span> : null}</p><p className="mt-1 text-xs text-slate-400">{SCENARIOS[entry.bestScenario]?.label || 'Coaching session'} • {entry.sessions} session{entry.sessions === 1 ? '' : 's'}</p></div><div className="text-right"><p className="text-xl font-bold text-[#f2cd7f]">{entry.bestScore}<span className="text-sm font-normal text-slate-500">/30</span></p><p className="text-xs text-slate-500">{entry.averageScore} avg</p></div></div>)}</div>}
      </section>
    </div>
  </main>;
}

export default function LeaderboardPage() { return <ProtectedRoute><LeaderboardContent /></ProtectedRoute>; }
