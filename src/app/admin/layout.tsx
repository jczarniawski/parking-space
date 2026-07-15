import { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

const tabs = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/spots", label: "Spots" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/audit", label: "Audit" },
];

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/");

  return (
    // The root layout's <main> has no max-width — admin keeps the wide
    // table-friendly column while regular pages use max-w-md.
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Admin</h1>
        <nav
          aria-label="Admin sections"
          className="mt-3 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1"
        >
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className="whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-brand-50 hover:text-brand-700"
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
