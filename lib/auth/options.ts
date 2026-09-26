import "server-only";
import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { getDatabase } from "../db/client";
import { loginSchema } from "../validation/auth";
import { verifyPassword } from "./password";
import { limiter } from "../rate-limit";
export const googleEnabled = Boolean(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
);
export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Credentials({
      name: "Email and password",
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        const input = loginSchema.safeParse(credentials);
        if (!input.success) return null;
        let release: (() => void) | undefined;
        try {
          limiter.consume(`login:${input.data.email}`, 10, 15 * 60000);
          release = limiter.acquire("password-work", 4);
          const user = await getDatabase().user.findUnique({
            where: { email: input.data.email },
          });
          if (
            !(await verifyPassword(input.data.password, user?.passwordHash)) ||
            !user
          )
            return null;
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
          };
        } catch {
          return null;
        } finally {
          release?.();
        }
      },
    }),
    ...(googleEnabled
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      if (
        !(profile as { email_verified?: boolean })?.email_verified ||
        !user.email
      )
        return false;
      const db = getDatabase();
      const linked = await db.account.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: account.providerAccountId,
          },
        },
      });
      if (linked) {
        user.id = linked.userId;
        return true;
      }
      const email = user.email.trim().toLowerCase();
      // Never silently link OAuth to an existing password account.
      if (await db.user.findUnique({ where: { email } })) return false;
      const created = await db.user.create({
        data: {
          email,
          name: user.name,
          image: user.image,
          emailVerified: new Date(),
          settings: { create: {} },
          accounts: {
            create: {
              provider: "google",
              providerAccountId: account.providerAccountId,
              type: "oauth",
            },
          },
        },
      });
      user.id = created.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  logger: {
    error(code) {
      console.error("Authentication error:", code);
    },
    warn(code) {
      console.warn("Authentication warning:", code);
    },
    debug() {},
  },
};
