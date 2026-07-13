import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { ApiError, unauthorized, forbidden } from "@/lib/errors";

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
      if (err instanceof ApiError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.status }
        );
      }
      console.error("Unhandled API error:", err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again.", code: "INTERNAL" },
        { status: 500 }
      );
    }
  };
}
