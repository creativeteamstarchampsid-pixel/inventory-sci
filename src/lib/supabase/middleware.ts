import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { DEFAULT_AUTHENTICATED_ROUTE, isPublicRoute } from "@/lib/rbac";
import { getSupabaseEnv } from "@/lib/supabase/env";
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
 * Refreshes the Supabase session and enforces basic authentication redirects.
 * Called from `src/middleware.ts`.
 *
 * Role-based access and `is_active` profile checks are enforced authoritatively
 * in `src/lib/auth.ts` (deduplicated per request via React `cache()`), every
 * `(app)` layout/page (`requireUser` / `requireRouteAccess`), `/api/exports/[format]`,
 * all Server Actions (`requireAction`), and Postgres RLS — avoiding duplicate
 * `profiles` round-trips in middleware on every navigation.
 */
export async function updateSession(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { url, anonKey } = getSupabaseEnv();

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

  // IMPORTANT: no code between createServerClient and auth verification.
  // `getClaims()` refreshes expiring sessions and verifies the JWT locally via
  // edge-cached JWKS when asymmetric keys are active, falling back cleanly to
  // `getUser()` for symmetric keys or unexpected verification errors.
  let isAuthenticated = false;
  try {
    const { data, error } = await supabase.auth.getClaims();
    if (data?.claims?.sub) {
      isAuthenticated = true;
    } else if (error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      isAuthenticated = Boolean(user);
    }
  } catch {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isAuthenticated = Boolean(user);
  }

  if (isPublicRoute(pathname)) {
    if (isAuthenticated && pathname === "/login") {
      return redirectWithCookies(request, supabaseResponse, DEFAULT_AUTHENTICATED_ROUTE);
    }
    return supabaseResponse;
  }

  if (!isAuthenticated) {
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

  return supabaseResponse;
}
