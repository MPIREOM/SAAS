import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifies the session JWT against the project's signing keys
  // (fetched once from the CDN-cached JWKS endpoint) instead of calling the
  // Supabase Auth server the way getUser() does. getUser() added a full
  // network round-trip to EVERY request — page loads, RSC navigations and
  // prefetches alike — which made each tab switch visibly slower. Expired
  // sessions are still refreshed here, which is this middleware's job.
  const { data } = await supabase.auth.getClaims();
  const hasSession = Boolean(data?.claims?.sub);

  // Redirect unauthenticated users to login (except for auth pages and API routes)
  const isAuthPage = request.nextUrl.pathname.includes("/auth/");
  const isApiRoute = request.nextUrl.pathname.startsWith("/api/");
  const isPublicPage = request.nextUrl.pathname.includes("/maintenance-request/") ||
    request.nextUrl.pathname.includes("/tenant-portal/");

  if (!hasSession && !isAuthPage && !isApiRoute && !isPublicPage) {
    const pathLocale = request.nextUrl.pathname.split("/")[1] || "en";
    const locale = (pathLocale === "en" || pathLocale === "ar") ? pathLocale : "en";
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/auth/login`;
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
