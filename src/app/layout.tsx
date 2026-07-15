import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import BottomNav from "@/components/bottom-nav";
import { officeTimeZone } from "@/lib/dates";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MT Parking",
    template: "%s · MT Parking",
  },
  description: "Book office parking spots at Match-Trade.",
  applicationName: "MT Parking",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "MT Parking",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1c2a44",
};

/** Slim desktop-only top bar (the bottom nav is the primary navigation). */
function TopBar({ name }: { name: string }) {
  return (
    <header className="hidden bg-brand-900 text-white md:block">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-2">
        <Link href="/" className="flex items-center gap-2.5 text-sm font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="" className="h-7 w-7 rounded-lg" />
          MT Parking
        </Link>
        <div className="flex items-center gap-3">
          <span className="max-w-[14rem] truncate text-sm text-brand-100">
            {name}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button
              type="submit"
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-200 transition-colors hover:bg-brand-800 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;

  return (
    // data-office-tz hands the runtime-configured office timezone to client
    // components (see officeTimeZone in src/lib/dates.ts).
    <html lang="en" data-office-tz={officeTimeZone()}>
      <body className="flex min-h-screen flex-col bg-slate-50">
        {user ? <TopBar name={user.name ?? user.email ?? "Account"} /> : null}
        {/*
          Intentionally no max-width here: pages own their own column width.
          Regular pages wrap their content in `mx-auto max-w-md` (phone-app
          look on every viewport); admin pages use a wider `mx-auto max-w-5xl`.
          pb-28 keeps content clear of the fixed bottom nav + FAB.
        */}
        <main className="mx-auto w-full flex-1 px-4 pt-4 pb-28">{children}</main>
        <BottomNav signedIn={!!user} isAdmin={user?.role === "ADMIN"} />
      </body>
    </html>
  );
}
