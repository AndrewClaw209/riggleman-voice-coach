type VerifiedToken = { uid: string };

/**
 * Verify a Firebase ID token through Google's Identity Toolkit API.
 *
 * This deliberately avoids importing firebase-admin in the Next.js route.
 * firebase-admin 14 pulls an ESM-only jose dependency through a CommonJS
 * path, which crashes Vercel's server-function runtime before the handler
 * can return a response.
 */
export function getAdminAuth() {
  return {
    async verifyIdToken(idToken: string): Promise<VerifiedToken> {
      const apiKey = process.env.FIREBASE_WEB_API_KEY ?? process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
      if (!apiKey) throw new Error('Firebase web API key is not configured');

      const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          cache: 'no-store',
        },
      );
      if (!response.ok) throw new Error('Invalid Firebase ID token');

      const data = await response.json() as { users?: Array<{ localId?: string }> };
      const uid = data.users?.[0]?.localId;
      if (!uid) throw new Error('Firebase token has no user ID');
      return { uid };
    },
  };
}
