import type { Scenario, Score } from './coaching';

export type LeaderboardEntry = {
  uid: string;
  displayName: string;
  bestScore: number;
  averageScore: number;
  sessions: number;
  bestScenario: Scenario;
  bestAt: string;
  updatedAt: string;
};

export type CompletedScore = {
  score: Score;
  scenario: Scenario;
  endedAt?: string;
};

export function buildLeaderboardEntry(
  uid: string,
  displayName: string,
  sessions: CompletedScore[],
): LeaderboardEntry | null {
  if (!sessions.length) return null;
  const best = [...sessions].sort((a, b) => {
    if (b.score.total !== a.score.total) return b.score.total - a.score.total;
    return new Date(b.endedAt || 0).getTime() - new Date(a.endedAt || 0).getTime();
  })[0];
  const averageScore = sessions.reduce((sum, item) => sum + item.score.total, 0) / sessions.length;
  const now = new Date().toISOString();
  return {
    uid,
    displayName: displayName.trim().slice(0, 80) || 'Sales Rep',
    bestScore: best.score.total,
    averageScore: Number(averageScore.toFixed(1)),
    sessions: sessions.length,
    bestScenario: best.scenario,
    bestAt: best.endedAt || now,
    updatedAt: now,
  };
}
