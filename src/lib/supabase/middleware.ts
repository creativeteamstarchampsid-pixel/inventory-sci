import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_ONLY_ROUTES,
  DEFAULT_AUTHENTICATED_ROUTE,
  canAccessRoute,
  isPublicRoute,
  isRole,
} from "@/lib/rbac";
import type { Database } from "@/types/database";

/**
 * Builds a redirect that keeps any refreshed Supabase auth cookies, so a
 * token refresh is never lost on a redirect.
 */
function redirectWithCookies(
  request: NextRequest,
  source: NextResponse,
  pathname: string,
  params?: Record<string, string>,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  return response;
}

/**
 * Refreshes the Supabase session and enforces authentication + role-based
 * route access. Called from `src/middleware.ts`.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without configuration nothing can be authenticated; let the login page
  // explain how to configure the app instead of crashing every request.
  if (!url || !anonKey) {
    if (isPublicRoute(pathname)) return NextResponse.next({ request });
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: no code between createServerClient and getUser(); getUser()
  // revalidates the JWT with Supabase Auth and refreshes expired sessions.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isPublicRoute(pathname)) {
    if (user && pathname === "/login") {
      return redirectWithCookies(request, supabaseResponse, DEFAULT_AUTHENTICATED_ROUTE);
    }
    return supabaseResponse;
  }

  if (!user) {
    const next = `${pathname}${search}`;
    return redirectWithCookies(
      request,
      supabaseResponse,
      "/login",
      next && next !== "/" ? { next } : undefined,
    );
  }

  if (pathname === "/") {
    return redirectWithCookies(request, supabaseResponse, DEFAULT_AUTHENTICATED_ROUTE);
  }

  if (AUTH_ONLY_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    return supabaseResponse;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !profile.is_active || !isRole(profile.role)) {
    return redirectWithCookies(request, supabaseResponse, "/forbidden", {
      reason: !profile ? "no-profile" : "inactive",
    });
  }

  if (!canAccessRoute(profile.role, pathname)) {
    return redirectWithCookies(request, supabaseResponse, "/forbidden", {
      from: pathname,
    });
  }

  return supabaseResponse;
}
