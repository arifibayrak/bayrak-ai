import type { DefaultSession } from 'next-auth';

// Expose the RBAC role on the Auth.js session + user types.
declare module 'next-auth' {
  interface Session {
    user: { role?: string } & DefaultSession['user'];
  }
  interface User {
    role?: string;
  }
}

export {};
