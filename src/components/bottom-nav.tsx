"use client";

import type { ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "@/components/locale-provider";
import { cn } from "@/components/ui";

// Mobile-app style bottom navigation, shown on all signed-in pages at every
// viewport. Four tabs + a centered floating action button for quick booking.

type IconProps = { active: boolean };

const iconStroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HomeIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path
        d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19v-8.5Z"
        {...iconStroke}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : undefined}
      />
      <path d="M9.5 20.5v-5.5h5v5.5" {...iconStroke} />
    </svg>
  );
}

function CalendarIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect
        x="4"
        y="5.5"
        width="16"
        height="15"
        rx="2.5"
        {...iconStroke}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : undefined}
      />
      <path d="M8 3.5v4M16 3.5v4M4 10.5h16" {...iconStroke} />
    </svg>
  );
}

function GridIcon({ active }: IconProps) {
  const fill = active ? "currentColor" : "none";
  const fillOpacity = active ? 0.15 : undefined;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect x="4" y="4" width="7" height="7" rx="1.5" {...iconStroke} fill={fill} fillOpacity={fillOpacity} />
      <rect x="13" y="4" width="7" height="7" rx="1.5" {...iconStroke} fill={fill} fillOpacity={fillOpacity} />
      <rect x="4" y="13" width="7" height="7" rx="1.5" {...iconStroke} fill={fill} fillOpacity={fillOpacity} />
      <rect x="13" y="13" width="7" height="7" rx="1.5" {...iconStroke} fill={fill} fillOpacity={fillOpacity} />
    </svg>
  );
}

function PersonIcon({ active }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <circle
        cx="12"
        cy="8"
        r="3.5"
        {...iconStroke}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : undefined}
      />
      <path d="M5 20c.9-3.4 3.6-5.3 7-5.3s6.1 1.9 7 5.3" {...iconStroke} />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden="true">
      <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
    </svg>
  );
}

function NavItem({
  href,
  label,
  active,
  icon: Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ComponentType<IconProps>;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg transition-colors",
        active ? "text-brand-700" : "text-slate-400 hover:text-slate-600"
      )}
    >
      <Icon active={active} />
      <span className={cn("text-[11px] leading-none", active ? "font-semibold" : "font-medium")}>
        {label}
      </span>
    </Link>
  );
}

export default function BottomNav({
  signedIn,
  isAdmin,
}: {
  signedIn: boolean;
  isAdmin: boolean;
}) {
  const pathname = usePathname();
  const { t } = useLocale();
  if (!signedIn) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Admin pages are reached via the Profile tab, so keep it highlighted there.
  const profileActive =
    isActive("/profile") || (isAdmin && isActive("/admin"));

  return (
    <nav
      aria-label={t("nav.primary")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white pb-safe"
    >
      <div className="mx-auto grid h-16 w-full max-w-md grid-cols-5 items-stretch px-2">
        <NavItem href="/" label={t("nav.start")} active={isActive("/")} icon={HomeIcon} />
        <NavItem
          href="/my-bookings"
          label={t("nav.bookings")}
          active={isActive("/my-bookings")}
          icon={CalendarIcon}
        />
        <div className="relative flex items-center justify-center">
          <Link
            href="/book"
            aria-label={t("nav.quickBooking")}
            className="absolute -top-7 flex h-14 w-14 items-center justify-center rounded-full bg-accent-600 text-white shadow-fab transition-colors hover:bg-accent-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-600"
          >
            <PlusIcon />
          </Link>
        </div>
        <NavItem href="/board" label={t("nav.board")} active={isActive("/board")} icon={GridIcon} />
        <NavItem href="/profile" label={t("nav.profile")} active={profileActive} icon={PersonIcon} />
      </div>
    </nav>
  );
}
