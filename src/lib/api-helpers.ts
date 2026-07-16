import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ApiError, unauthorized, forbidden } from "@/lib/errors";
import { apiErrorMessage } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
};

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) throw unauthorized();
  return { id: u.id, email: u.email, name: u.name ?? null, role: u.role };
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw forbidden("Admin access required.");
  return user;
}

/** Wrap a route handler so thrown ApiErrors become clean JSON responses. */
export function handleApi<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      // Errors are localized here (from the request's locale cookie) so every
      // screen shows them in the user's language; the service-layer English
      // message is the fallback for codes without a translation.
      const locale = await getLocale().catch(() => "pl" as const);
      if (err instanceof ApiError) {
        return NextResponse.json(
          {
            error: apiErrorMessage(locale, err.code, err.params) ?? err.message,
            code: err.code,
          },
          { status: err.status }
        );
      }
      console.error("Unhandled API error:", err);
      return NextResponse.json(
        {
          error:
            apiErrorMessage(locale, "INTERNAL") ??
            "Something went wrong. Please try again.",
          code: "INTERNAL",
        },
        { status: 500 }
      );
    }
  };
}
