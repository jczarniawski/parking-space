import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Badge } from "@/components/ui";
import { VehiclesManager } from "@/components/vehicles-manager";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Profile" };

type RoleTone = "slate" | "blue" | "purple";

const ROLE_BADGES: Record<string, { label: string; tone: RoleTone }> = {
  EMPLOYEE: { label: "Employee", tone: "slate" },
  MANAGEMENT: { label: "Management", tone: "purple" },
  ADMIN: { label: "Admin", tone: "blue" },
};

// ---------- Icons (inline, no icon library) ----------

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="m9.5 6 6 6-6 6" {...iconStroke} />
    </svg>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.5 5 6v5.2c0 4.3 2.9 7.6 7 9.3 4.1-1.7 7-5 7-9.3V6l-7-2.5Z"
        {...iconStroke}
      />
      <path d="m9.2 12 2 2 3.6-3.8" {...iconStroke} />
    </svg>
  );
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <rect x="7" y="3" width="10" height="18" rx="2.2" {...iconStroke} />
      <path d="M11 17.8h2" {...iconStroke} />
    </svg>
  );
}

function SignOutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M14 6.5V5a1.5 1.5 0 0 0-1.5-1.5h-7A1.5 1.5 0 0 0 4 5v14a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 14 19v-1.5" {...iconStroke} />
      <path d="M9.5 12H21m0 0-3-3m3 3-3 3" {...iconStroke} />
    </svg>
  );
}

// ---------- Page ----------

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = session.user;
  const displayName = user.name ?? user.email ?? "Account";
  const role = ROLE_BADGES[user.role] ?? ROLE_BADGES.EMPLOYEE;
  const initial = (displayName.trim()[0] ?? "?").toUpperCase();

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      <h1 className="px-1 text-xl font-semibold text-slate-900">Profile</h1>

      {/* Who am I */}
      <section className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full border border-slate-200 object-cover"
          />
        ) : (
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-900 to-brand-700 text-xl font-semibold text-white">
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-slate-900">
            {displayName}
          </p>
          {user.email ? (
            <p className="truncate text-sm text-slate-500">{user.email}</p>
          ) : null}
          <Badge tone={role.tone} className="mt-1.5">
            {role.label}
          </Badge>
        </div>
      </section>

      {/* Plates */}
      <VehiclesManager />

      {/* Admin entry point — the bottom nav has no admin tab on purpose. */}
      {user.role === "ADMIN" ? (
        <Link
          href="/admin"
          className="flex min-h-[64px] items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card transition-colors hover:bg-slate-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <ShieldIcon className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-slate-800">
              Admin panel
            </span>
            <span className="block text-xs text-slate-500">
              Zones, spots, people and all bookings
            </span>
          </span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-slate-300" />
        </Link>
      ) : null}

      {/* PWA install hint */}
      <section className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-50 text-accent-600">
          <PhoneIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-800">
            Install on your phone
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            Open your browser menu and choose{" "}
            <span className="font-medium text-slate-700">
              &ldquo;Add to Home Screen&rdquo;
            </span>{" "}
            to use MT Parking like a native app.
          </p>
        </div>
      </section>

      {/* Sign out */}
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-card transition-colors hover:bg-red-50"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <SignOutIcon className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-red-600">Sign out</span>
        </button>
      </form>
    </div>
  );
}
