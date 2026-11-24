import bcrypt from 'bcryptjs';
import NextAuth, { type NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { z } from 'zod';

import { db } from '@/lib/db';
import { redeemLoginCode } from '@/lib/loginCode';

export const googleEnabled = !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

const credentialsSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  password: z.string().min(1),
});

const codeSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase().trim()),
  code: z.string().trim().regex(/^\d{6}$/),
});

const config: NextAuthConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 24 * 60 },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) return null;
        if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    // A 6-digit code mailed to the address. A first sign-in creates the account, so this doubles as sign-up.
    Credentials({
      id: 'email-code',
      credentials: { email: {}, code: {} },
      async authorize(raw) {
        const parsed = codeSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, code } = parsed.data;
        if (!(await redeemLoginCode(email, code))) return null;
        const user = await db.user.upsert({ where: { email }, update: {}, create: { email, name: email.split('@')[0] } });
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
    ...(googleEnabled ? [Google] : []),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account?.provider === 'google' && token.email) {
        // One account per email: Google sign-in joins an email/password account with the same address.
        const email = token.email.toLowerCase();
        const row = await db.user.upsert({
          where: { email },
          update: { image: token.picture ?? undefined },
          create: { email, name: token.name, image: token.picture },
        });
        token.uid = row.id;
      } else if (user?.id) {
        token.uid = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid && session.user) session.user.id = token.uid as string;
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);
