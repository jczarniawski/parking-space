import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { Button, Card } from "@/components/ui";

export const metadata: Metadata = {
  title: "Sign in",
};

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.17 3.57-8.81z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.93-2.91l-3.87-3.01c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.29 14.28A7.2 7.2 0 0 1 4.91 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.6 4.58 1.79l3.44-3.44A11.98 11.98 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77z"
      />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await auth();
  if (session?.user?.id) redirect("/");

  const { error } = await searchParams;
  const devLoginEnabled = process.env.AUTH_DEV_LOGIN === "true";

  return (
    <div className="flex min-h-[70vh] items-center justify-center">
      <Card className="w-full max-w-sm p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-xl font-bold text-white">
            P
          </span>
          <h1 className="text-xl font-semibold text-slate-900">MT Parking</h1>
          <p className="text-sm text-slate-500">
            Office parking bookings for Match-Trade.
          </p>
        </div>

        {error ? (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error === "AccessDenied"
              ? "That account can't sign in here. Use your @match-trade.com Google account."
              : "Sign-in failed. Use your @match-trade.com Google account."}
          </div>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
          className="mt-6"
        >
          <Button
            type="submit"
            variant="secondary"
            className="w-full gap-2 py-2.5"
          >
            <GoogleIcon />
            Sign in with Google
          </Button>
        </form>

        <p className="mt-3 text-center text-xs text-slate-400">
          Only @match-trade.com accounts can sign in.
        </p>

        {devLoginEnabled ? (
          <>
            <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              Dev login
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <form
              action={async (formData: FormData) => {
                "use server";
                const email = String(formData.get("email") ?? "");
                await signIn("dev-login", { email, redirectTo: "/" });
              }}
              className="mt-4 flex flex-col gap-2"
            >
              <input
                type="email"
                name="email"
                required
                placeholder="you@match-trade.com"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button type="submit" variant="primary" className="w-full">
                Sign in as dev user
              </Button>
            </form>
          </>
        ) : null}
      </Card>
    </div>
  );
}
