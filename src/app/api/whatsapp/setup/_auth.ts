import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/access-control";

/** Setup endpoints manage Meta credentials and templates: super admins only. */
export async function requireSuperAdmin(): Promise<NextResponse | null> {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

/** Public origin of this deployment, used when NEXT_PUBLIC_APP_URL is unset. */
export function requestOrigin(request: NextRequest): string | null {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return null;
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}
