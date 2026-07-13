import type { Metadata, Viewport } from "next";
import { ReactNode } from "react";
import Nav from "@/components/nav";
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
  icons: {
    icon: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "MT Parking",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1b5ff5",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // data-office-tz hands the runtime-configured office timezone to client
    // components (see officeTimeZone in src/lib/dates.ts).
    <html lang="en" data-office-tz={officeTimeZone()}>
      <body className="flex min-h-screen flex-col">
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
