import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { prisma, serializableTx } from "@/lib/db";

export const ALLOWED_DOMAIN = (
  process.env.ALLOWED_EMAIL_DOMAIN || "match-trade.com"
).toLowerCase();

function isAllowedEmail(email: string | null | undefined): email is string {
  return (
    typeof email === "string" &&
    email.toLowerCase().endsWith(`@${ALLOWED_DOMAIN}`)
  );
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Ensure a DB user exists for a signed-in email and return it.
 *
 * - Emails may be pre-provisioned by an admin (e.g. management members added
 *   during setup before their first sign-in); the existing row — and its
 *   role — is reused and linked by email.
 * - The very first user ever to sign in becomes an ADMIN so the app can be
 *   bootstrapped; ADMIN_EMAILS entries are always promoted to ADMIN.
 */
async function upsertUser(email: string, name?: string | null, image?: string | null) {
  const normalized = email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email: normalized } });

  if (existing) {
    const promote = adminEmails().includes(normalized) && existing.role !== "ADMIN";
    return prisma.user.update({
      where: { id: existing.id },
      data: {
        name: name ?? existing.name,
        image: image ?? existing.image,
        ...(promote ? { role: "ADMIN" } : {}),
      },
    });
  }

  // Serializable so two concurrent first sign-ins can't both see count===0
  // and both bootstrap themselves as ADMIN.
  return serializableTx(async (tx) => {
    const raced = await tx.user.findUnique({ where: { email: normalized } });
    if (raced) return raced;
    const userCount = await tx.user.count();
    const role =
      userCount === 0 || adminEmails().includes(normalized)
        ? "ADMIN"
        : "EMPLOYEE";
    return tx.user.create({
      data: { email: normalized, name: name ?? null, image: image ?? null, role },
    });
  });
}

const providers = [
  Google({
    authorization: {
      params: {
        // Hint Google to only offer accounts from the company domain.
        // This is UX only — the signIn callback below is the enforcement.
        hd: ALLOWED_DOMAIN,
        prompt: "select_account",
      },
    },
  }),
];

// Development-only fake login so the app can be exercised without Google
// credentials. Guarded by an explicit env flag; never enable in production.
if (process.env.AUTH_DEV_LOGIN === "true") {
  providers.push(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Credentials({
      id: "dev-login",
      name: "Dev login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "").toLowerCase();
        if (!isAllowedEmail(email)) return null;
        const user = await upsertUser(email, email.split("@")[0]);
        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }) as any
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login", error: "/login" },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile, user }) {
      if (account?.provider === "dev-login") return true; // validated in authorize()
      if (account?.provider !== "google") return false;
      const email = profile?.email ?? user?.email;
      if (!isAllowedEmail(email)) return false;
      if (profile && profile.email_verified === false) return false;
      return true;
    },
    async jwt({ token, user, account }) {
      // Runs with `user`/`account` set only on sign-in: sync the DB user then.
      if (account && user?.email) {
        const dbUser = await upsertUser(user.email, user.name, user.image);
        token.uid = dbUser.id;
        token.role = dbUser.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) {
        // Re-read the user so role changes (and admin-deleted accounts)
        // take effect without waiting for the JWT to expire.
        const dbUser = await prisma.user.findUnique({
          where: { id: token.uid as string },
        });
        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.role = dbUser.role;
          session.user.name = dbUser.name;
          session.user.email = dbUser.email;
          session.user.image = dbUser.image;
        } else {
          session.user.id = "";
          session.user.role = "EMPLOYEE";
        }
      }
      return session;
    },
  },
});
