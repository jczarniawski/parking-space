import Link from "next/link";
import { auth, signOut } from "@/auth";
import { Button } from "@/components/ui";

function Avatar({ name, image }: { name: string; image: string | null }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={image}
        alt=""
        referrerPolicy="no-referrer"
        className="h-7 w-7 rounded-full border border-slate-200"
      />
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

export default async function Nav() {
  const session = await auth();
  const user = session?.user?.id ? session.user : null;

  const linkClass =
    "rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-2 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 py-3 text-base font-semibold text-slate-900"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            P
          </span>
          MT Parking
        </Link>

        {user ? (
          <>
            <nav className="order-last -mx-2 flex w-full items-center gap-1 pb-2 sm:order-none sm:mx-0 sm:ml-4 sm:w-auto sm:pb-0">
              <Link href="/" className={linkClass}>
                Book
              </Link>
              <Link href="/my-bookings" className={linkClass}>
                My bookings
              </Link>
              {user.role === "ADMIN" ? (
                <Link href="/admin" className={linkClass}>
                  Admin
                </Link>
              ) : null}
            </nav>

            <div className="ml-auto flex items-center gap-2 py-2">
              <Avatar
                name={user.name ?? user.email ?? "?"}
                image={user.image ?? null}
              />
              <span className="hidden max-w-[12rem] truncate text-sm text-slate-600 sm:inline">
                {user.name ?? user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/login" });
                }}
              >
                <Button variant="ghost" type="submit" className="px-2.5 py-1.5 text-xs">
                  Sign out
                </Button>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </header>
  );
}
