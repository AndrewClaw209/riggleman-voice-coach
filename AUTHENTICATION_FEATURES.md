# Firebase Authentication Features

Complete user authentication and profile system for the Riggleman Sales Coach.

---

## Features Implemented

### ✅ User Authentication
- **Sign Up**: Create new user accounts with email/password
- **Sign In**: Existing users can log in
- **Sign Out**: Secure logout functionality
- **Protected Routes**: Coaching page requires authentication

### ✅ User Profiles
Each user profile includes:
- **uid**: Firebase Auth UID
- **email**: User email address
- **displayName**: Full name
- **dealership**: Dealership name (e.g., "Merced Hyundai KIA VW")
- **role**: User role (default: "sales_rep")
- **createdAt**: Account creation timestamp
- **lastActive**: Last activity timestamp
- **totalSessions**: Total coaching sessions (auto-incremented)
- **totalMessages**: Total messages sent (auto-incremented)

### ✅ Session Tracking
- Automatic session count increment when starting coaching
- Message count tracking for each user interaction
- Last active timestamp updates on every action
- Session number displayed in coaching interface

### ✅ UI Updates
**Home Page**
- Shows "Sign In / Sign Up" buttons for anonymous users
- Shows welcome message with user name and dealership for logged-in users
- "Start Coaching Session" button for authenticated users

**Coaching Page**
- Header displays user name and dealership
- Session number and message count in sidebar
- "End Session" button to return home
- "Sign Out" button for logging out

**Login Page**
- Clean, professional design
- Email and password inputs
- Error handling
- Link to signup page

**Signup Page**
- Full name input
- Email input
- Dealership input
- Password input (min 6 characters)
- Error handling
- Link to login page

---

## File Structure

```
riggleman-voice-coach/
├── lib/
│   ├── firebase.ts              # Firebase initialization
│   └── AuthContext.tsx          # Auth state management
├── components/
│   ├── ClientLayout.tsx         # Auth provider wrapper
│   └── ProtectedRoute.tsx       # Route protection HOC
├── app/
│   ├── layout.tsx               # Updated with ClientLayout
│   ├── page.tsx                 # Home with auth-aware UI
│   ├── login/
│   │   └── page.tsx             # Login page
│   ├── signup/
│   │   └── page.tsx             # Signup page
│   └── coaching/
│       └── page.tsx             # Protected coaching page
├── .env.local.example           # Environment template
├── FIREBASE_SETUP.md            # Complete setup guide
└── AUTHENTICATION_FEATURES.md   # This file
```

---

## Tech Stack

- **Firebase Authentication**: Email/password auth
- **Firestore Database**: User profiles and session data
- **React Context API**: Global auth state management
- **Next.js 16**: App router with client components
- **TypeScript**: Type-safe authentication flow

---

## Security

### Firestore Rules
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only read/write their own profile
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### Environment Variables
All Firebase config is stored in environment variables:
- Development: `.env.local` (not committed)
- Production: Vercel environment variables

### Password Security
- Minimum 6 characters enforced
- Firebase handles password hashing and security
- No plain-text password storage

---

## Usage Flow

### New User
1. Visit home page → Click "Sign Up"
2. Fill in: Full Name, Email, Dealership, Password
3. Account created → Redirected to coaching page
4. Profile created in Firestore with initial stats

### Returning User
1. Visit home page → Click "Sign In"
2. Enter email and password
3. Authenticated → See welcome message with stats
4. Click "Start Coaching Session"
5. Session count increments automatically

### During Session
- User name and dealership displayed in header
- Message count increments with each user message
- Last active timestamp updates continuously
- Session number shown in sidebar
- "End Session" returns to home
- "Sign Out" logs out and returns to home

---

## Metrics Tracked

### Per User
- **Total Sessions**: Number of coaching sessions started
- **Total Messages**: Number of user messages sent to Curtis
- **Last Active**: Most recent activity timestamp
- **Account Age**: Time since account creation

### Future Metrics (Ready to Implement)
- **Average Session Duration**: Track session start/end times
- **Topics Discussed**: Analyze conversation patterns
- **Improvement Trends**: Track metrics over time
- **Team Rankings**: Compare users within dealership

---

## Environment Variables Required

### Development (.env.local)
```env
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### Production (Vercel)
Add the same variables in Vercel project settings.

---

## API Integration

### Authentication Flow
```typescript
// Sign Up
await signUp(email, password, displayName, dealership);
// → Creates Firebase Auth user
// → Creates Firestore user profile
// → Redirects to /coaching

// Sign In
await signIn(email, password);
// → Authenticates with Firebase
// → Loads user profile from Firestore
// → Redirects to /coaching

// Sign Out
await signOut();
// → Signs out from Firebase
// → Clears local auth state
// → Redirects to /
```

### Profile Updates
```typescript
// Track session start
updateDoc(doc(db, 'users', userId), {
  totalSessions: increment(1),
  lastActive: new Date().toISOString(),
});

// Track messages
updateDoc(doc(db, 'users', userId), {
  totalMessages: increment(1),
  lastActive: new Date().toISOString(),
});
```

---

## Future Enhancements

### Phase 2: Conversation History
- Save full conversation transcripts to Firestore
- Allow users to review past sessions
- Search and filter past conversations
- Export conversation history

### Phase 3: Team Management
- Admin dashboard for managers
- View all team member profiles
- Team performance metrics
- Leaderboards and gamification

### Phase 4: Advanced Analytics
- Topic analysis (what objections are common)
- Improvement tracking (show rate, conversion rate)
- Curtis AI insights based on conversation patterns
- Personalized coaching recommendations

### Phase 5: Integrations
- CRM integration (Salesforce, HubSpot)
- Calendar integration for session scheduling
- Slack/Teams notifications
- Mobile app (React Native)

---

## Testing Checklist

✅ Sign up with new account
✅ Sign in with existing account
✅ Protected route redirect to login
✅ Start coaching session (session count increments)
✅ Send messages (message count increments)
✅ End session (return to home)
✅ Sign out (clear auth state)
✅ Welcome message shows user info
✅ Session stats display correctly
✅ Error handling for invalid credentials

---

## Known Issues / TODOs

- [ ] Add password reset functionality
- [ ] Add email verification
- [ ] Add "Remember me" checkbox
- [ ] Add loading states during auth operations
- [ ] Add success messages after signup
- [ ] Add profile edit page
- [ ] Add session history page
- [ ] Add admin dashboard
- [ ] Add mobile-responsive sidebar

---

## Deployment Checklist

Before deploying to production:

1. ✅ Set up Firebase project
2. ✅ Enable Email/Password authentication
3. ✅ Create Firestore database
4. ✅ Configure Firestore security rules
5. ✅ Add Firebase config to Vercel environment variables
6. ✅ Test sign up flow
7. ✅ Test sign in flow
8. ✅ Test protected routes
9. ✅ Verify Firestore tracking works
10. ✅ Test on mobile devices

---

**The Riggleman Sales Coach now has a complete authentication system for tracking individual sales rep progress and coaching sessions!**

All sales team members can:
- Create their own accounts
- Track their coaching sessions
- See their progress over time
- Access Curtis Riggleman's coaching from anywhere

Managers can (future):
- View team performance
- Track adoption and usage
- Identify coaching opportunities
- Measure ROI of coaching investment
