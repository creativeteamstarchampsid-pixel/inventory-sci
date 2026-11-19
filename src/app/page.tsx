import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_AUTHENTICATED_ROUTE } from "@/lib/rbac";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  if (!hasSupabaseEnv()) {
    redirect("/login");
  }

  const user = await getCurrentUser();
  redirect(user ? DEFAULT_AUTHENTICATED_ROUTE : "/login");
}
