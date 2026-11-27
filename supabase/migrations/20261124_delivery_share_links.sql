-- =============================================================================
-- StarOps Migration: 20261124_delivery_share_links.sql
-- Short, Readable & Customizable Preview Share Links for Surat Jalan, BAST &
-- Deliveries (`/s/<slug>`, strictly OWNER & SUPER_ADMIN)
-- =============================================================================

begin;

create table if not exists public.delivery_share_links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 2 and 60
  ),
  delivery_id uuid not null unique references public.deliveries_log(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_delivery_share_links_created_by
  on public.delivery_share_links (created_by);

create index if not exists idx_delivery_share_links_updated_by
  on public.delivery_share_links (updated_by);

drop trigger if exists trg_delivery_share_links_updated_at on public.delivery_share_links;
create trigger trg_delivery_share_links_updated_at
  before update on public.delivery_share_links
  for each row execute function public.set_updated_at();

alter table public.delivery_share_links enable row level security;

revoke all on public.delivery_share_links from public, anon;
grant select, insert, update, delete on public.delivery_share_links to authenticated, service_role;

drop policy if exists "delivery_share_links_select_admins" on public.delivery_share_links;
create policy "delivery_share_links_select_admins" on public.delivery_share_links
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "delivery_share_links_insert_admins" on public.delivery_share_links;
create policy "delivery_share_links_insert_admins" on public.delivery_share_links
  for insert to authenticated
  with check (
    (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists "delivery_share_links_update_admins" on public.delivery_share_links;
create policy "delivery_share_links_update_admins" on public.delivery_share_links
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "delivery_share_links_delete_admins" on public.delivery_share_links;
create policy "delivery_share_links_delete_admins" on public.delivery_share_links
  for delete to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

commit;
