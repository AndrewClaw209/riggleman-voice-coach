'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/AuthContext';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const { user, userProfile, loading } = useAuth();

  const handleStartSession = () => {
    if (user) {
      router.push('/coaching');
    } else {
      router.push('/login');
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="max-w-2xl w-full mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold mb-4 text-white">
            Riggleman Sales Coach
          </h1>
          <p className="text-xl text-slate-300 mb-2">
            Master Phone Sales with Curtis Riggleman's "Dial For Dollars"
          </p>
          <p className="text-sm text-slate-400">
            AI-powered coaching that brings Curtis's proven psychology-driven techniques to life
          </p>
        </div>

        {/* Main CTA Buttons */}
        {loading ? (
          <div className="w-full py-4 px-6 mb-8 bg-slate-800 text-slate-400 text-lg font-semibold rounded-lg text-center">
            Loading...
          </div>
        ) : user ? (
          <div className="space-y-4 mb-8">
            <div className="bg-slate-800 p-4 rounded-lg border border-slate-700">
              <p className="text-slate-300 text-sm mb-1">Welcome back,</p>
              <p className="text-white font-semibold text-lg">{userProfile?.displayName}</p>
              <p className="text-slate-400 text-sm">{userProfile?.dealership}</p>
            </div>
            <button
              onClick={handleStartSession}
              className="w-full py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
            >
              Start Coaching Session
            </button>
          </div>
        ) : (
          <div className="flex gap-4 mb-8">
            <Link
              href="/login"
              className="flex-1 py-4 px-6 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl text-center"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              className="flex-1 py-4 px-6 bg-slate-700 hover:bg-slate-600 text-white text-lg font-semibold rounded-lg transition-colors duration-200 text-center"
            >
              Sign Up
            </Link>
          </div>
        )}

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">⏱️</div>
            <h3 className="text-lg font-semibold mb-2 text-white">The 7-Second Rule</h3>
            <p className="text-slate-400 text-sm">
              Master Curtis's technique to hook customers in 7 seconds or lose them forever
            </p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">🎯</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Psychology-Driven Scripts</h3>
            <p className="text-slate-400 text-sm">
              Learn exact language for pattern interrupts, fear of loss, and the winning scenario
            </p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">📞</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Appointment Setting</h3>
            <p className="text-slate-400 text-sm">
              Stop negotiating on the phone. Get them in the door with Curtis's proven tactics
            </p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">💪</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Direct Coaching</h3>
            <p className="text-slate-400 text-sm">
              No-nonsense feedback and exact scripts from Curtis's decades of automotive sales
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="text-center text-slate-500 text-sm border-t border-slate-700 pt-8">
          <p>© 2026 AWEVO Software Solutions</p>
        </footer>
      </div>
    </main>
  );
}
