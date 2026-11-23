-- =============================================================================
-- StarOps Migration: 20261123_security_hardening.sql
-- Pre-Launch Security Hardening (Checks #14 DB Jangan Public & #15 Permission Ketat)
--
-- 1. Enforce `security_invoker = true` (preserving `security_barrier = true`)
--    on `public.subscriptions_vault_directory` so the view never bypasses RLS.
-- 2. Lock `search_path = public` on the 3 remaining helper/trigger functions
--    (`next_alpha_suffix`, `prevent_code_mutation`, `sync_item_master_state`).
-- 3. Revoke all table/view/sequence privileges from `anon` in `public` schema
--    and lock `ALTER DEFAULT PRIVILEGES` so future objects never grant `anon`.
-- 4. Harden all 4 private `storage.buckets` (`inventory-photos`,
--    `delivery-proofs`, `archives`, `backups`) with `public = false`, strict
--    `file_size_limit`, and strict `allowed_mime_types` blocking SVG/HTML/JS/exe.
--
-- Safe & idempotent: preserves all authenticated app functionality & data.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. VIEW RLS INVOKER ENFORCEMENT
-- -----------------------------------------------------------------------------
-- `public.subscriptions_vault` RLS policy `vault_select_admins` already grants
-- SELECT to authenticated OWNER & SUPER_ADMIN (and service_role bypasses RLS),
-- so enabling `security_invoker = true` preserves full admin functionality
-- while eliminating any SECURITY DEFINER view RLS bypass warning.
alter view public.subscriptions_vault_directory
  set (security_invoker = true, security_barrier = true);

revoke all on public.subscriptions_vault_directory from public, anon;
grant select on public.subscriptions_vault_directory to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 2. FUNCTION SEARCH_PATH HARDENING
-- -----------------------------------------------------------------------------
-- Lock explicit `search_path = public` on the remaining public functions so
-- 100% (29/29) of `public` functions have an immutable search_path.
alter function public.next_alpha_suffix(integer) set search_path = public;
alter function public.prevent_code_mutation() set search_path = public;
alter function public.sync_item_master_state() set search_path = public;

-- -----------------------------------------------------------------------------
-- 3. REVOKE ANON TABLE, VIEW & SEQUENCE PRIVILEGES IN PUBLIC SCHEMA
-- -----------------------------------------------------------------------------
-- All StarOps operational tables & views require an authenticated session.
-- Revoking `anon` privileges at the schema object layer provides defense in
-- depth alongside `TO authenticated` RLS policies (does not affect `auth` or
-- `authenticated` / `service_role` access).
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public
  revoke all on tables from anon;

alter default privileges in schema public
  revoke all on sequences from anon;

-- -----------------------------------------------------------------------------
-- 4. STORAGE BUCKETS HARDENING (PRIVATE + SIZE LIMITS + STRICT MIME WHITELIST)
-- -----------------------------------------------------------------------------
-- Explicitly enforces `public = false`, per-bucket `file_size_limit`, and
-- strict `allowed_mime_types` (blocking `image/svg+xml`, `text/html`,
-- `application/javascript`, and executables at the Supabase Storage layer).

-- 4.1 inventory-photos & delivery-proofs: max 5 MB, raster images only
update storage.buckets
set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
where id in ('inventory-photos', 'delivery-proofs');

-- 4.2 archives: max 10 MB, office documents, PDF, ZIP, and raster images only
update storage.buckets
set
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip'
  ]
where id = 'archives';

-- 4.3 backups: max 15 MB, JSON/CSV/TXT/ZIP/XLSX/PDF backup bundles only
update storage.buckets
set
  public = false,
  file_size_limit = 15728640,
  allowed_mime_types = array[
    'application/json',
    'text/csv',
    'text/plain',
    'application/zip',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf'
  ]
where id = 'backups';

commit;
