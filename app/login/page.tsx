'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../../lib/AuthContext';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../lib/firebase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { signIn } = useAuth();

  useEffect(() => {
    const hasVisitedAuth = window.localStorage.getItem('curtis-auth-visited');
    if (!hasVisitedAuth) {
      window.localStorage.setItem('curtis-auth-visited', 'true');
      router.replace('/signup?welcome=1');
    }
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      router.push('/coaching');
    } catch (err: unknown) {
      const firebaseCode = typeof err === 'object' && err !== null && 'code' in err
        ? String((err as { code?: unknown }).code)
        : '';
      if (firebaseCode === 'auth/user-not-found') {
        router.push(`/signup?email=${encodeURIComponent(email)}&welcome=1`);
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to sign in');
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
            width={320}
            height={320}
            className="mx-auto mb-0 h-80 w-80 object-contain"
          />
          <h1 className="text-4xl font-bold mb-2">Welcome Back</h1>
          <p className="text-slate-400">Sign in to continue your coaching</p>
        </div>

        <div className="bg-slate-800 p-8 rounded-lg border border-slate-700">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500 text-red-500 px-4 py-3 rounded">
                {error}
              </div>
            )}

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
                className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-6 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-white font-semibold rounded-lg transition-colors duration-200"
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm">
              Don&apos;t have an account?{' '}
              <Link
                href="/signup"
                className="text-emerald-500 hover:text-emerald-400 font-medium"
              >
                Sign up
              </Link>
            </p>
          </div>
          <button type="button" onClick={() => email ? sendPasswordResetEmail(auth, email).then(() => setError('Password reset email sent.')).catch(() => setError('Could not send reset email.')) : setError('Enter your email first.')} className="w-full mt-4 text-sm text-slate-400 hover:text-white">
            Forgot password?
          </button>
        </div>

      </div>
    </main>
  );
}
