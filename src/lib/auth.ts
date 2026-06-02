import NextAuth from 'next-auth';
import Resend from 'next-auth/providers/resend';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '@/db';
import { users, accounts, sessions, verificationTokens } from '@/db/schema/auth';
import { isAllowed } from './auth-allowlist';
import { effectiveRole } from './authz';

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
    // Database-session strategy: `user` is the adapter row (carries `role`).
    // Re-derive the effective role on EVERY request — the trust boundary.
    // @bayrak.ai → admin; a non-@bayrak.ai stored 'admin' is clamped down.
    async session({ session, user }) {
      if (session.user) {
        const email = user?.email ?? session.user.email;
        session.user.role = effectiveRole(email, (user as { role?: string })?.role);
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
});
