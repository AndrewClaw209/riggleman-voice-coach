# Firebase Authentication Setup Guide

This guide walks you through setting up Firebase Authentication for the Riggleman Sales Coach app.

---

## Step 1: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard
4. Enable Google Analytics (optional but recommended)

---

## Step 2: Enable Authentication

1. In Firebase Console, go to **Build > Authentication**
2. Click "Get started"
3. Go to the **Sign-in method** tab
4. Enable **Email/Password** authentication
5. Click "Save"

---

## Step 3: Create Firestore Database

1. In Firebase Console, go to **Build > Firestore Database**
2. Click "Create database"
3. Choose **Production mode** (we'll set rules next)
4. Select a Firestore location (choose closest to your users)
5. Click "Enable"

---

## Step 4: Set Firestore Security Rules

1. In Firestore Database, go to the **Rules** tab
2. Replace the default rules with:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection - users can only read/write their own profile
    match /users/{userId} {
      allow read: if request.auth != null && request.auth.uid == userId;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Sessions collection - users can only read/write their own sessions
    match /sessions/{sessionId} {
      allow read: if request.auth != null && resource.data.userId == request.auth.uid;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
    }
    
    // Admin read access (optional - create admin collection to define admin users)
    match /users/{userId} {
      allow read: if request.auth != null && 
                     exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }
  }
}
```

3. Click "Publish"

---

## Step 5: Get Firebase Configuration

1. In Firebase Console, go to **Project Settings** (gear icon)
2. Scroll down to "Your apps"
3. Click the **Web** icon (`</>`)
4. Register your app with a nickname (e.g., "Riggleman Coach")
5. **Copy the Firebase configuration object**

You'll see something like:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyB...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## Step 6: Configure Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Fill in your Firebase config from Step 5:

```env
# OpenAI API Configuration
OPENAI_API_KEY=your_openai_api_key_here

# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyB...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
```

3. **Never commit `.env.local` to Git** (it's already in `.gitignore`)

---

## Step 7: Configure Vercel Environment Variables

For production deployment:

1. Go to your Vercel project dashboard
2. Navigate to **Settings > Environment Variables**
3. Add each variable from `.env.local`:
   - `OPENAI_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`

4. Make sure to add them for all environments (Production, Preview, Development)
5. Redeploy your app

---

## Step 8: Test Authentication

1. Start the dev server:
   ```bash
   npm run dev
   ```

2. Go to `http://localhost:3000`
3. Click "Sign Up"
4. Create a test account:
   - Full Name: Test User
   - Email: test@example.com
   - Dealership: Test Dealership
   - Password: test123

5. You should be redirected to `/coaching`
6. Check Firebase Console > Authentication to see your new user

---

## User Profile Structure

When a user signs up, a profile is automatically created in Firestore:

```typescript
{
  uid: string;              // Firebase Auth UID
  email: string;            // User email
  displayName: string;      // Full name
  role: "sales_rep";        // User role
  dealership: string;       // Dealership name
  createdAt: string;        // ISO timestamp
  lastActive: string;       // ISO timestamp
  totalSessions: number;    // Session count (auto-incremented)
  totalMessages: number;    // Message count (auto-incremented)
}
```

---

## Optional: Create Admin Users

To give certain users admin access:

1. In Firestore, create a new collection called `admins`
2. Add a document with the user's UID as the document ID
3. Add a field `role: "admin"`

Admin users can read all user profiles (based on the security rules above).

---

## Firestore Collections

### `users` Collection
- **Document ID**: User UID
- **Purpose**: Store user profiles and statistics
- **Access**: Users can only read/write their own profile

### `sessions` Collection (Future Enhancement)
- **Document ID**: Auto-generated
- **Purpose**: Store conversation history per session
- **Fields**:
  - `userId`: User UID
  - `startedAt`: ISO timestamp
  - `endedAt`: ISO timestamp (optional)
  - `messages`: Array of conversation messages
  - `messageCount`: Number of messages
  - `duration`: Session duration in seconds

---

## Security Best Practices

✅ **Environment Variables**
- Never commit `.env.local` to Git
- Use Vercel environment variables for production
- Keep Firebase API keys secure (they're restricted by domain in Firebase Console)

✅ **Firestore Security Rules**
- Users can only access their own data
- All reads/writes require authentication
- No public read/write access

✅ **Authentication**
- Enforce minimum 6-character passwords
- Consider adding email verification for production
- Consider adding password reset functionality

---

## Troubleshooting

### "Firebase: Error (auth/configuration-not-found)"
- Check that all `NEXT_PUBLIC_FIREBASE_*` variables are set correctly
- Verify Firebase project is properly configured in Firebase Console

### "Missing or insufficient permissions"
- Check Firestore security rules
- Verify user is authenticated before accessing Firestore
- Check that document paths match security rules

### User can't sign in
- Check Firebase Console > Authentication > Users to see if account exists
- Verify email/password are correct
- Check browser console for detailed error messages

### Sessions not tracking
- Check Firestore Database to see if `users` collection is being updated
- Verify user is authenticated when calling `updateDoc`
- Check browser console for Firestore errors

---

## Next Steps

### Immediate (Production-Ready)
- ✅ User authentication (Email/Password)
- ✅ User profiles with dealership tracking
- ✅ Session and message count tracking
- ✅ Protected coaching route

### Near-Term Enhancements
- [ ] Save full conversation history to Firestore
- [ ] Add user dashboard with session history
- [ ] Add password reset functionality
- [ ] Add email verification
- [ ] Add user metrics dashboard for managers

### Long-Term Features
- [ ] Multi-dealership management
- [ ] Team performance leaderboards
- [ ] Session replay and review
- [ ] Curtis AI coaching insights based on conversation patterns
- [ ] Integration with CRM systems

---

## Support

For Firebase-specific issues:
- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Support](https://firebase.google.com/support)

For app-specific issues:
- Check the GitHub repo
- Contact AWEVO Software Solutions

---

**Your sales team can now sign up, track their coaching sessions, and improve their phone sales skills with Curtis Riggleman's proven methodology!**
