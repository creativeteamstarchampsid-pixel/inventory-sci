-- =============================================================================
-- StarOps Migration: 20261124_share_short_links.sql
-- Short, Readable & Customizable Preview Share Links (`/s/<slug>`)
--
-- 1. Creates `public.share_short_links` to map readable slugs (`bubble-tower`,
--    `sop-klinik`, etc.) uniquely to an Inventory Item (`ITEM`) or Hybrid
--    Archive (`ARCHIVE`).
-- 2. Attaches `trg_share_short_links_updated_at` and covering foreign-key
--    indexes on `created_by` and `updated_by`.
-- 3. Enables RLS requiring active authenticated users (`is_active_user()`) and
--    restricts slug updates to MANAGEMENT roles or the link creator.
-- =============================================================================

begin;

create table if not exists public.share_short_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 60
  ),
  target_type text not null check (target_type in ('ITEM', 'ARCHIVE')),
  target_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_share_short_links_target unique (target_type, target_id)
);

create index if not exists idx_share_short_links_created_by
  on public.share_short_links (created_by);

create index if not exists idx_share_short_links_updated_by
  on public.share_short_links (updated_by);

drop trigger if exists trg_share_short_links_updated_at on public.share_short_links;
create trigger trg_share_short_links_updated_at
  before update on public.share_short_links
  for each row execute function public.set_updated_at();

alter table public.share_short_links enable row level security;

revoke all on public.share_short_links from public, anon;
grant select, insert, update, delete on public.share_short_links to authenticated, service_role;

drop policy if exists "share_short_links_select_active" on public.share_short_links;
create policy "share_short_links_select_active" on public.share_short_links
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists "share_short_links_insert_active" on public.share_short_links;
create policy "share_short_links_insert_active" on public.share_short_links
  for insert to authenticated
  with check (
    (select public.is_active_user())
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists "share_short_links_update_allowed" on public.share_short_links;
create policy "share_short_links_update_allowed" on public.share_short_links
  for update to authenticated
  using (
    (select public.is_active_user())
    and (
      (select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]))
      or created_by = (select auth.uid())
    )
  )
  with check (
    (select public.is_active_user())
    and (
      (select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]))
      or created_by = (select auth.uid())
    )
  );

drop policy if exists "share_short_links_delete_admins" on public.share_short_links;
create policy "share_short_links_delete_admins" on public.share_short_links
  for delete to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

commit;
