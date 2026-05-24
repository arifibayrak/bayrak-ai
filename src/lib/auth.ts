import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema/auth';
import { isAllowed } from './auth-allowlist';

// Re-export for convenience so callers can import from a single module
export { isAllowed } from './auth-allowlist';

// ---------------------------------------------------------------------------
// Auth.js v5 config
// ---------------------------------------------------------------------------

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY,
      from: 'no-reply@bayrak.ai',
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Fires BEFORE the magic-link email is sent (verificationRequest=true)
      // AND again when the user clicks the link (verificationRequest=false/undefined).
      // We block on BOTH calls — neither email delivery nor session creation
      // happens for non-allowlisted addresses (Pitfall 2, D-11).
      const incomingEmail = (user?.email ?? '').toLowerCase();
      return isAllowed(incomingEmail);
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});
