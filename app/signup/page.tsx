'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../lib/AuthContext';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [dealership, setDealership] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signUp } = useAuth();

  useEffect(() => {
    window.localStorage.setItem('curtis-auth-visited', 'true');
    const params = new URLSearchParams(window.location.search);
    const invitedEmail = params.get('email');
    if (invitedEmail) setEmail(invitedEmail);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      setLoading(false);
      return;
    }

    try {
      await signUp(email, password, displayName, dealership);
      router.push('/coaching');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-slate-900 text-white">
      <div className="max-w-md w-full mx-auto px-6">
        <div className="text-center mb-8">
          <Image
            src="/curtis-ai-logo.png"
            alt="Curtis Riggleman AI"
            width={892}
            height={266}
            className="mx-auto my-0 h-auto w-full max-w-[28rem] object-contain py-2"
          />
          <p className="text-sm uppercase tracking-[0.24em] text-emerald-400 mb-3">
            Welcome to Curtis AI
          </p>
          <h1 className="text-4xl font-bold mb-3">Build confidence on every call</h1>
          <p className="text-slate-400 leading-relaxed">
            Create your free account to talk with Pocket Curtis about sales,
            sharpen your sales process, and get instant feedback after every session.
          </p>
        </div>

        <div className="bg-slate-800 p-8 rounded-lg border border-slate-700">
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="displayName"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Full Name
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="John Smith"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="dealership"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Dealership
              </label>
              <input
                id="dealership"
                type="text"
                value={dealership}
                onChange={(e) => setDealership(e.target.value)}
                required
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Merced Hyundai KIA VW"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-300 mb-2"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••••"
              />
              <p className="text-slate-500 text-xs mt-1">Must be at least 6 characters</p>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {loading ? 'Creating your account...' : 'Start Coaching Free'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              Already have an account?{' '}
              <Link
                href="/login"
                className="text-emerald-500 hover:text-emerald-400 font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </div>

      </div>
    </main>
  );
}
