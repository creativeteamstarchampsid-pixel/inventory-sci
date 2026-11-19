const DEFAULT_SUPABASE_URL = "https://drkpyxguafgvxezggasg.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRya3B5eGd1YWZndnhlemdnYXNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNTgzMTUsImV4cCI6MjExMDYzNDMxNX0.HN1XqjDmseDi2mBadeoWu2fXZbl3u1nyM0pkHoqv4Ls";

/**
 * Public Supabase configuration. Read via direct `process.env.NEXT_PUBLIC_*`
 * references so Next.js can inline them into the client bundle.
 */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase env vars. Copy .env.example to .env.local and set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  return { url, anonKey };
}

export function hasSupabaseEnv(): boolean {
  const { url, anonKey } = getSupabaseEnv();
  return Boolean(url && anonKey);
}
