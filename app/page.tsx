'use client';

import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  const handleStartSession = () => {
    router.push('/coaching');
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
            AI-Powered Sales Coaching for Hyundai & Kia
          </p>
          <p className="text-sm text-slate-400">
            Get personalized coaching to improve your sales performance
          </p>
        </div>

        {/* Main CTA Button */}
        <button
          onClick={handleStartSession}
          className="w-full py-4 px-6 mb-8 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-semibold rounded-lg transition-colors duration-200 shadow-lg hover:shadow-xl"
        >
          Start Coaching Session
        </button>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">🎯</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Sales Strategy</h3>
            <p className="text-slate-400 text-sm">
              Get expert advice on call handling, objection management, and closing techniques
            </p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">📊</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Performance Metrics</h3>
            <p className="text-slate-400 text-sm">
              Discuss call volume, conversion rates, and identify areas for improvement
            </p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">🎤</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Voice Coaching</h3>
            <p className="text-slate-400 text-sm">
              Have a natural conversation with your AI coach anytime, anywhere
            </p>
          </div>

          <div className="bg-slate-800 p-6 rounded-lg border border-slate-700">
            <div className="text-emerald-500 text-2xl mb-3">💡</div>
            <h3 className="text-lg font-semibold mb-2 text-white">Actionable Tips</h3>
            <p className="text-slate-400 text-sm">
              Receive practical, real-world advice tailored to Hyundai and Kia sales
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
