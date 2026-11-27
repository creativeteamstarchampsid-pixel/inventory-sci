-- =============================================================================
-- StarOps Migration: Inventory Hierarchy, Legacy Barcode Mapping & Stock Opname
-- Date: 2026-11-27
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. BACKUP SNAPSHOT TABLE & ROLLBACK FUNCTION
-- -----------------------------------------------------------------------------
create table if not exists public.inventory_migration_backups (
  batch_id uuid primary key default gen_random_uuid(),
  label text not null,
  items_snapshot jsonb not null,
  kits_snapshot jsonb not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_migration_backups_created_by
  on public.inventory_migration_backups (created_by)
  where created_by is not null;

alter table public.inventory_migration_backups enable row level security;
revoke all on public.inventory_migration_backups from anon;

drop policy if exists "inventory_migration_backups_select_admins" on public.inventory_migration_backups;
create policy "inventory_migration_backups_select_admins"
  on public.inventory_migration_backups
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

-- -----------------------------------------------------------------------------
-- 2. HIERARCHY COLUMN & INDEX ON items_master
-- -----------------------------------------------------------------------------
alter table public.items_master
  add column if not exists has_sub_items boolean not null default false;

create index if not exists idx_items_master_parent_id
  on public.items_master (parent_item_id);

-- Backfill has_sub_items for any existing parent that already has children
update public.items_master p
set has_sub_items = true
where exists (
  select 1
  from public.items_master c
  where c.parent_item_id = p.id
    and c.deleted_at is null
);

-- -----------------------------------------------------------------------------
-- 3. HIERARCHY VALIDATION & AUTOMATIC PARENT STOCK AGGREGATION TRIGGERS
-- -----------------------------------------------------------------------------
create or replace function public.validate_item_hierarchy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_parent_id uuid;
begin
  if new.parent_item_id is not null then
    if new.parent_item_id = new.id then
      raise exception 'Item tidak dapat menjadi Parent bagi dirinya sendiri.';
    end if;

    if new.has_sub_items then
      raise exception 'Sub-Item tidak boleh ditandai sebagai Memiliki Sub-Item (maksimal 2 level hierarki).';
    end if;

    select parent_item_id into v_parent_parent_id
    from public.items_master
    where id = new.parent_item_id;

    if not found then
      raise exception 'Parent Item tidak ditemukan.';
    end if;

    if v_parent_parent_id is not null then
      raise exception 'Parent Item yang dipilih merupakan Sub-Item. Sub-Item tidak dapat memiliki turunan bertingkat.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_items_master_hierarchy_validate on public.items_master;
create trigger trg_items_master_hierarchy_validate
  before insert or update on public.items_master
  for each row execute function public.validate_item_hierarchy();

create or replace function public.recalculate_parent_item_stock(p_parent_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_children integer := 0;
  v_usable_stock integer := 0;
  v_parent_has_sub boolean := false;
  v_parent_stock integer := 0;
  v_prev_sync text;
begin
  if p_parent_id is null then
    return;
  end if;

  select has_sub_items, stock_qty
  into v_parent_has_sub, v_parent_stock
  from public.items_master
  where id = p_parent_id;

  if not found then
    return;
  end if;

  select
    count(*) filter (where deleted_at is null),
    coalesce(sum(stock_qty) filter (where deleted_at is null and condition <> 'DIHAPUSBUKU'), 0)
  into v_active_children, v_usable_stock
  from public.items_master
  where parent_item_id = p_parent_id;

  if v_active_children > 0 then
    if v_parent_has_sub is distinct from true or v_parent_stock is distinct from v_usable_stock then
      v_prev_sync := current_setting('app.internal_parent_sync', true);
      perform set_config('app.internal_parent_sync', 'on', true);
      update public.items_master
      set has_sub_items = true,
          stock_qty = v_usable_stock
      where id = p_parent_id;
      perform set_config('app.internal_parent_sync', coalesce(v_prev_sync, ''), true);
    end if;
  elsif v_parent_has_sub then
    if v_parent_stock is distinct from 0 then
      v_prev_sync := current_setting('app.internal_parent_sync', true);
      perform set_config('app.internal_parent_sync', 'on', true);
      update public.items_master
      set stock_qty = 0
      where id = p_parent_id;
      perform set_config('app.internal_parent_sync', coalesce(v_prev_sync, ''), true);
    end if;
  end if;
end;
$$;

create or replace function public.trg_fn_sync_parent_item_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'DELETE' then
    if old.parent_item_id is not null then
      perform public.recalculate_parent_item_stock(old.parent_item_id);
    end if;
    return old;
  end if;

  if TG_OP = 'INSERT' then
    if new.parent_item_id is not null then
      perform public.recalculate_parent_item_stock(new.parent_item_id);
    elsif new.has_sub_items then
      perform public.recalculate_parent_item_stock(new.id);
    end if;
    return new;
  end if;

  -- UPDATE
  if old.parent_item_id is not null and old.parent_item_id is distinct from new.parent_item_id then
    perform public.recalculate_parent_item_stock(old.parent_item_id);
  end if;

  if new.parent_item_id is not null then
    if new.parent_item_id is distinct from old.parent_item_id
       or new.stock_qty is distinct from old.stock_qty
       or new.deleted_at is distinct from old.deleted_at
       or new.condition is distinct from old.condition then
      perform public.recalculate_parent_item_stock(new.parent_item_id);
    end if;
  elsif new.has_sub_items and (new.has_sub_items is distinct from old.has_sub_items) then
    perform public.recalculate_parent_item_stock(new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_parent_item_stock on public.items_master;
create trigger trg_sync_parent_item_stock
  after insert or update or delete on public.items_master
  for each row execute function public.trg_fn_sync_parent_item_stock();

-- Update guard_item_update_by_role so:
--   1) internal parent stock sync trigger can update stock_qty & has_sub_items on parent items;
--   2) validated Stock Opname RPC (OWNER / SUPER_ADMIN / TEAM_LEADER) can update physical counts safely;
--   3) all other direct edits remain strictly guarded by role.
create or replace function public.guard_item_update_by_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_internal_sync boolean := current_setting('app.internal_parent_sync', true) = 'on';
  v_opname_write boolean := current_setting('app.stock_opname_write', true) = 'on';
begin
  if auth.uid() is null then
    if coalesce(current_setting('role', true), '') = 'service_role'
       or (
         session_user = 'postgres'
         and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
       ) then
      return new;
    end if;
    raise exception 'Akses ditolak: sesi autentikasi tidak valid.';
  end if;

  if v_internal_sync then
    -- Internal parent-child synchronization may only sync stock_qty and has_sub_items
    if new.parent_item_id is distinct from old.parent_item_id
       or new.barcode_format is distinct from old.barcode_format
       or new.name is distinct from old.name
       or new.description is distinct from old.description
       or new.category_prefix is distinct from old.category_prefix
       or new.category is distinct from old.category
       or new.asset_type is distinct from old.asset_type
       or new.room_code is distinct from old.room_code
       or new.rack_location is distinct from old.rack_location
       or new.pic_name is distinct from old.pic_name
       or new.photo_url is distinct from old.photo_url
       or new.acquisition_date is distinct from old.acquisition_date
       or new.purchase_price is distinct from old.purchase_price
       or new.useful_life_months is distinct from old.useful_life_months
       or new.residual_value is distinct from old.residual_value
       or new.total_parts is distinct from old.total_parts
       or new.unit_label is distinct from old.unit_label
       or new.min_stock_threshold is distinct from old.min_stock_threshold
       or new.source_delivery_id is distinct from old.source_delivery_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by then
      raise exception 'Sinkronisasi internal tidak diizinkan mengubah kolom master item.';
    end if;
    return new;
  end if;

  if v_opname_write then
    if not public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]) then
      raise exception 'Hanya Manajemen (Owner, Admin Operasional, atau Kepala Terapis) yang dapat menyimpan Stock Opname.';
    end if;

    if new.parent_item_id is distinct from old.parent_item_id
       or new.has_sub_items is distinct from old.has_sub_items
       or new.barcode_format is distinct from old.barcode_format
       or new.name is distinct from old.name
       or new.description is distinct from old.description
       or new.category_prefix is distinct from old.category_prefix
       or new.category is distinct from old.category
       or new.asset_type is distinct from old.asset_type
       or new.room_code is distinct from old.room_code
       or new.rack_location is distinct from old.rack_location
       or new.pic_name is distinct from old.pic_name
       or new.photo_url is distinct from old.photo_url
       or new.acquisition_date is distinct from old.acquisition_date
       or new.purchase_price is distinct from old.purchase_price
       or new.useful_life_months is distinct from old.useful_life_months
       or new.residual_value is distinct from old.residual_value
       or new.total_parts is distinct from old.total_parts
       or new.unit_label is distinct from old.unit_label
       or new.min_stock_threshold is distinct from old.min_stock_threshold
       or new.source_delivery_id is distinct from old.source_delivery_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by then
      raise exception 'Stock Opname tidak diizinkan mengubah metadata master item.';
    end if;

    if new.condition is distinct from old.condition
       and (new.condition = 'DIHAPUSBUKU' or old.condition = 'DIHAPUSBUKU')
       and not public.has_role(array['OWNER']::public.user_role[]) then
      raise exception 'Hanya Owner yang dapat menetapkan atau mengubah status Dihapusbuku.';
    end if;

    new.updated_by := coalesce(auth.uid(), new.updated_by);
    return new;
  end if;

  if not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    if new.parent_item_id is distinct from old.parent_item_id
       or new.has_sub_items is distinct from old.has_sub_items
       or new.barcode_format is distinct from old.barcode_format
       or new.name is distinct from old.name
       or new.description is distinct from old.description
       or new.category_prefix is distinct from old.category_prefix
       or new.category is distinct from old.category
       or new.asset_type is distinct from old.asset_type
       or new.room_code is distinct from old.room_code
       or new.rack_location is distinct from old.rack_location
       or new.pic_name is distinct from old.pic_name
       or new.photo_url is distinct from old.photo_url
       or new.acquisition_date is distinct from old.acquisition_date
       or new.purchase_price is distinct from old.purchase_price
       or new.useful_life_months is distinct from old.useful_life_months
       or new.residual_value is distinct from old.residual_value
       or new.total_parts is distinct from old.total_parts
       or new.unit_label is distinct from old.unit_label
       or new.stock_qty is distinct from old.stock_qty
       or new.min_stock_threshold is distinct from old.min_stock_threshold
       or new.source_delivery_id is distinct from old.source_delivery_id
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by then
      raise exception 'Hanya Owner atau Admin Operasional yang dapat mengubah data master atau menghapus item.';
    end if;
  end if;

  if new.condition is distinct from old.condition
     and (new.condition = 'DIHAPUSBUKU' or old.condition = 'DIHAPUSBUKU')
     and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner yang dapat menetapkan atau mengubah status Dihapusbuku.';
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 4. LEGACY & MERGED BARCODE MAPPING TABLE (item_barcode_aliases)
-- -----------------------------------------------------------------------------
create table if not exists public.item_barcode_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_code text not null unique,
  target_item_id uuid not null references public.items_master(id) on delete cascade,
  legacy_item_id uuid references public.items_master(id) on delete set null,
  legacy_name text,
  alias_reason text not null default 'MERGED_DUPLICATE'
    check (alias_reason in ('MERGED_DUPLICATE', 'LEGACY_BARCODE', 'SUB_ITEM_REDIRECT')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_barcode_aliases_target
  on public.item_barcode_aliases (target_item_id);
create index if not exists idx_barcode_aliases_legacy
  on public.item_barcode_aliases (legacy_item_id)
  where legacy_item_id is not null;
create index if not exists idx_barcode_aliases_created_by
  on public.item_barcode_aliases (created_by)
  where created_by is not null;

alter table public.item_barcode_aliases enable row level security;
revoke all on public.item_barcode_aliases from anon;

drop policy if exists "item_barcode_aliases_select_active" on public.item_barcode_aliases;
create policy "item_barcode_aliases_select_active"
  on public.item_barcode_aliases
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists "item_barcode_aliases_insert_admins" on public.item_barcode_aliases;
create policy "item_barcode_aliases_insert_admins"
  on public.item_barcode_aliases
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "item_barcode_aliases_update_admins" on public.item_barcode_aliases;
create policy "item_barcode_aliases_update_admins"
  on public.item_barcode_aliases
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "item_barcode_aliases_delete_admins" on public.item_barcode_aliases;
create policy "item_barcode_aliases_delete_admins"
  on public.item_barcode_aliases
  for delete to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

-- -----------------------------------------------------------------------------
-- 5. DEDICATED STOCK OPNAME TABLES (stock_opname_sessions & stock_opname_items)
-- -----------------------------------------------------------------------------
create table if not exists public.stock_opname_sessions (
  id uuid primary key default gen_random_uuid(),
  session_code text not null unique,
  period_ym text not null,
  room_code text references public.locations_master(code) on update cascade on delete set null,
  title text not null,
  status text not null default 'IN_PROGRESS'
    check (status in ('DRAFT', 'IN_PROGRESS', 'COMPLETED')),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_opname_sessions_period
  on public.stock_opname_sessions (period_ym, status);
create index if not exists idx_opname_sessions_room
  on public.stock_opname_sessions (room_code)
  where room_code is not null;
create index if not exists idx_opname_sessions_created_by
  on public.stock_opname_sessions (created_by)
  where created_by is not null;
create index if not exists idx_opname_sessions_completed_by
  on public.stock_opname_sessions (completed_by)
  where completed_by is not null;

create or replace function public.before_insert_stock_opname_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym text := coalesce(nullif(btrim(new.period_ym), ''), to_char(timezone('Asia/Jakarta', now()), 'YYYYMM'));
begin
  new.period_ym := v_ym;

  if new.session_code is null or btrim(new.session_code) = '' then
    new.session_code := public.generate_prefixed_sequence('OPN', v_ym, 'OPN-' || v_ym || '-', 4);
  else
    new.session_code := upper(btrim(new.session_code));
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists trg_opname_sessions_bi on public.stock_opname_sessions;
create trigger trg_opname_sessions_bi
  before insert on public.stock_opname_sessions
  for each row execute function public.before_insert_stock_opname_sessions();

drop trigger if exists trg_opname_sessions_code_immutable on public.stock_opname_sessions;
create trigger trg_opname_sessions_code_immutable
  before update on public.stock_opname_sessions
  for each row execute function public.prevent_code_mutation('session_code');

drop trigger if exists trg_opname_sessions_updated_at on public.stock_opname_sessions;
create trigger trg_opname_sessions_updated_at
  before update on public.stock_opname_sessions
  for each row execute function public.set_updated_at();

create table if not exists public.stock_opname_items (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.stock_opname_sessions(id) on delete cascade,
  item_id uuid not null references public.items_master(id) on delete cascade,
  parent_item_id uuid references public.items_master(id) on delete set null,
  status text not null default 'BELUM_DIPERIKSA'
    check (status in ('BELUM_DIPERIKSA', 'SEDANG_DIPERIKSA', 'MENUNGGU_PENYIMPANAN', 'SUDAH_DIPERIKSA')),
  system_stock integer not null check (system_stock >= 0),
  actual_stock integer check (actual_stock is null or actual_stock >= 0),
  stock_diff integer generated always as (
    case when actual_stock is null then null else actual_stock - system_stock end
  ) stored,
  system_parts integer not null default 1 check (system_parts >= 1),
  actual_parts integer check (actual_parts is null or actual_parts >= 0),
  condition public.item_condition,
  hygiene_status public.hygiene_status,
  notes text,
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz,
  saved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, item_id)
);

create index if not exists idx_opname_items_session_status
  on public.stock_opname_items (session_id, status);
create index if not exists idx_opname_items_item_id
  on public.stock_opname_items (item_id);
create index if not exists idx_opname_items_parent_id
  on public.stock_opname_items (parent_item_id)
  where parent_item_id is not null;
create index if not exists idx_opname_items_checked_by
  on public.stock_opname_items (checked_by)
  where checked_by is not null;

drop trigger if exists trg_opname_items_updated_at on public.stock_opname_items;
create trigger trg_opname_items_updated_at
  before update on public.stock_opname_items
  for each row execute function public.set_updated_at();

alter table public.stock_opname_sessions enable row level security;
alter table public.stock_opname_items enable row level security;
revoke all on public.stock_opname_sessions from anon;
revoke all on public.stock_opname_items from anon;

drop policy if exists "opname_sessions_select_management" on public.stock_opname_sessions;
create policy "opname_sessions_select_management"
  on public.stock_opname_sessions
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "opname_sessions_insert_management" on public.stock_opname_sessions;
create policy "opname_sessions_insert_management"
  on public.stock_opname_sessions
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "opname_sessions_update_management" on public.stock_opname_sessions;
create policy "opname_sessions_update_management"
  on public.stock_opname_sessions
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "opname_sessions_delete_admins" on public.stock_opname_sessions;
create policy "opname_sessions_delete_admins"
  on public.stock_opname_sessions
  for delete to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "opname_items_select_management" on public.stock_opname_items;
create policy "opname_items_select_management"
  on public.stock_opname_items
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "opname_items_insert_management" on public.stock_opname_items;
create policy "opname_items_insert_management"
  on public.stock_opname_items
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "opname_items_update_management" on public.stock_opname_items;
create policy "opname_items_update_management"
  on public.stock_opname_items
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "opname_items_delete_admins" on public.stock_opname_items;
create policy "opname_items_delete_admins"
  on public.stock_opname_items
  for delete to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

-- -----------------------------------------------------------------------------
-- 6. ATOMIC STOCK OPNAME BATCH RPC (supports Parent/Sub-Items & Simple Items)
-- -----------------------------------------------------------------------------
create or replace function public.submit_stock_opname_batch(
  p_session_id uuid,
  p_entries jsonb,
  p_parent_item_id uuid default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role public.user_role;
  v_session record;
  v_entry jsonb;
  v_item record;
  v_parent_before record;
  v_parent_after record;
  v_actual_stock integer;
  v_actual_parts integer;
  v_condition public.item_condition;
  v_hygiene public.hygiene_status;
  v_entry_notes text;
  v_now timestamptz := now();
  v_today_wib date := (timezone('Asia/Jakarta', now()))::date;
  v_prev_flag text;
  v_updated_count integer := 0;
  v_parent_old_stock integer := 0;
  v_parent_new_stock integer := 0;
begin
  if v_actor_id is null then
    raise exception 'Akses ditolak: pengguna harus login.';
  end if;

  if not public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]) then
    raise exception 'Hanya Owner, Admin Operasional, atau Kepala Terapis yang dapat menyimpan Stock Opname.';
  end if;

  select full_name, role into v_actor_name, v_actor_role
  from public.profiles
  where id = v_actor_id;

  select * into v_session
  from public.stock_opname_sessions
  where id = p_session_id;

  if not found then
    raise exception 'Sesi Stock Opname tidak ditemukan.';
  end if;

  if p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) = 0 then
    raise exception 'Minimal satu item harus diisi sebelum menyimpan hasil Stock Opname.';
  end if;

  if p_parent_item_id is not null then
    select id, item_code, name, stock_qty, unit_label, has_sub_items, total_parts, current_parts
    into v_parent_before
    from public.items_master
    where id = p_parent_item_id
      and deleted_at is null;

    if not found then
      raise exception 'Parent Item tidak ditemukan atau sudah dihapus.';
    end if;

    v_parent_old_stock := v_parent_before.stock_qty;
  end if;

  v_prev_flag := current_setting('app.stock_opname_write', true);
  perform set_config('app.stock_opname_write', 'on', true);

  for v_entry in select * from jsonb_array_elements(p_entries)
  loop
    if (v_entry ->> 'item_id') is null or btrim(v_entry ->> 'item_id') = '' then
      raise exception 'ID barang tidak boleh kosong.';
    end if;

    if (v_entry ->> 'actual_stock') is null or btrim(v_entry ->> 'actual_stock') = '' then
      raise exception 'Quantity aktual tidak boleh kosong. Isi angka valid (>= 0) terlebih dahulu.';
    end if;

    v_actual_stock := (v_entry ->> 'actual_stock')::integer;
    if v_actual_stock < 0 then
      raise exception 'Quantity aktual tidak boleh bernilai negatif.';
    end if;

    select * into v_item
    from public.items_master
    where id = (v_entry ->> 'item_id')::uuid
      and deleted_at is null;

    if not found then
      raise exception 'Barang tidak ditemukan atau sudah dihapus.';
    end if;

    if v_item.has_sub_items then
      raise exception 'Stok Parent Item (%) dihitung otomatis dari Sub-Item dan tidak boleh diisi langsung.', v_item.name;
    end if;

    if p_parent_item_id is not null and v_item.parent_item_id is distinct from p_parent_item_id then
      raise exception 'Sub-Item (%) tidak termasuk dalam Parent Item yang sedang diperiksa.', v_item.name;
    end if;

    v_actual_parts := coalesce(nullif(btrim(v_entry ->> 'actual_parts'), '')::integer, v_item.current_parts);
    v_actual_parts := greatest(0, least(v_item.total_parts, v_actual_parts));

    v_condition := coalesce(
      nullif(btrim(v_entry ->> 'condition'), '')::public.item_condition,
      v_item.condition
    );
    if v_item.total_parts > 1 and v_actual_parts < v_item.total_parts and v_condition = 'BAIK' then
      v_condition := 'PART_KURANG';
    elsif v_actual_parts = v_item.total_parts and v_item.condition = 'PART_KURANG' and v_condition = 'PART_KURANG' then
      v_condition := 'BAIK';
    end if;

    v_hygiene := coalesce(
      nullif(btrim(v_entry ->> 'hygiene_status'), '')::public.hygiene_status,
      v_item.hygiene_status
    );
    v_entry_notes := nullif(btrim(coalesce(v_entry ->> 'notes', p_notes, '')), '');

    update public.items_master
    set stock_qty = v_actual_stock,
        current_parts = v_actual_parts,
        condition = v_condition,
        hygiene_status = v_hygiene,
        last_sanitized_at = case when v_hygiene = 'STERIL' then v_now else last_sanitized_at end,
        next_sanitization_due = case when v_hygiene = 'STERIL' then v_today_wib + 7 else next_sanitization_due end,
        updated_by = v_actor_id
    where id = v_item.id;

    insert into public.stock_opname_items (
      session_id,
      item_id,
      parent_item_id,
      status,
      system_stock,
      actual_stock,
      system_parts,
      actual_parts,
      condition,
      hygiene_status,
      notes,
      checked_by,
      checked_at,
      saved_at
    )
    values (
      p_session_id,
      v_item.id,
      v_item.parent_item_id,
      'SUDAH_DIPERIKSA',
      v_item.stock_qty,
      v_actual_stock,
      v_item.total_parts,
      v_actual_parts,
      v_condition,
      v_hygiene,
      v_entry_notes,
      v_actor_id,
      v_now,
      v_now
    )
    on conflict (session_id, item_id) do update
      set status = 'SUDAH_DIPERIKSA',
          system_stock = excluded.system_stock,
          actual_stock = excluded.actual_stock,
          system_parts = excluded.system_parts,
          actual_parts = excluded.actual_parts,
          condition = excluded.condition,
          hygiene_status = excluded.hygiene_status,
          notes = coalesce(excluded.notes, public.stock_opname_items.notes),
          checked_by = v_actor_id,
          checked_at = v_now,
          saved_at = v_now;

    insert into public.audit_logs (
      actor_id,
      actor_name,
      actor_role,
      action,
      entity_type,
      entity_id,
      entity_code,
      summary,
      metadata
    )
    values (
      v_actor_id,
      coalesce(v_actor_name, 'Manajemen'),
      v_actor_role,
      'STOCK_OPNAME',
      'items_master',
      v_item.id::text,
      v_item.item_code,
      format(
        'Stock Opname %s (%s): Sistem %s -> Aktual %s %s (Selisih %s)%s',
        v_item.item_code,
        v_item.name,
        v_item.stock_qty,
        v_actual_stock,
        v_item.unit_label,
        case when v_actual_stock - v_item.stock_qty > 0 then '+' else '' end || (v_actual_stock - v_item.stock_qty)::text,
        case when v_entry_notes is not null then ' — ' || v_entry_notes else '' end
      ),
      jsonb_build_object(
        'session_id', p_session_id,
        'parent_item_id', v_item.parent_item_id,
        'previous_stock', v_item.stock_qty,
        'verified_stock', v_actual_stock,
        'stock_diff', v_actual_stock - v_item.stock_qty,
        'previous_parts', v_item.current_parts,
        'verified_parts', v_actual_parts,
        'condition', v_condition,
        'hygiene_status', v_hygiene,
        'notes', v_entry_notes
      )
    );

    v_updated_count := v_updated_count + 1;
  end loop;

  perform set_config('app.stock_opname_write', coalesce(v_prev_flag, ''), true);

  if p_parent_item_id is not null then
    perform public.recalculate_parent_item_stock(p_parent_item_id);

    select id, item_code, name, stock_qty, unit_label
    into v_parent_after
    from public.items_master
    where id = p_parent_item_id;

    v_parent_new_stock := coalesce(v_parent_after.stock_qty, 0);

    insert into public.stock_opname_items (
      session_id,
      item_id,
      parent_item_id,
      status,
      system_stock,
      actual_stock,
      system_parts,
      actual_parts,
      notes,
      checked_by,
      checked_at,
      saved_at
    )
    values (
      p_session_id,
      p_parent_item_id,
      null,
      'SUDAH_DIPERIKSA',
      v_parent_old_stock,
      v_parent_new_stock,
      coalesce(v_parent_before.total_parts, 1),
      coalesce(v_parent_before.current_parts, 1),
      coalesce(nullif(btrim(coalesce(p_notes, '')), ''), format('Akumulasi %s Sub-Item', v_updated_count)),
      v_actor_id,
      v_now,
      v_now
    )
    on conflict (session_id, item_id) do update
      set status = 'SUDAH_DIPERIKSA',
          system_stock = excluded.system_stock,
          actual_stock = excluded.actual_stock,
          notes = excluded.notes,
          checked_by = v_actor_id,
          checked_at = v_now,
          saved_at = v_now;
  end if;

  update public.stock_opname_sessions
  set status = 'IN_PROGRESS',
      updated_at = v_now
  where id = p_session_id
    and status = 'DRAFT';

  return jsonb_build_object(
    'updated_count', v_updated_count,
    'parent_item_id', p_parent_item_id,
    'parent_previous_stock', v_parent_old_stock,
    'parent_new_stock', v_parent_new_stock
  );
exception
  when others then
    perform set_config('app.stock_opname_write', coalesce(v_prev_flag, ''), true);
    raise;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. SAFE ROLLBACK FUNCTION FOR MIGRATION
-- -----------------------------------------------------------------------------
create or replace function public.rollback_inventory_hierarchy_migration(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap record;
  v_row jsonb;
  v_restored_items integer := 0;
  v_deleted_new_items integer := 0;
  v_snapshot_ids uuid[];
begin
  if auth.uid() is not null and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner atau Superuser Postgres yang dapat menjalankan rollback migrasi.';
  end if;

  select * into v_snap
  from public.inventory_migration_backups
  where batch_id = p_batch_id;

  if not found then
    raise exception 'Backup snapshot migrasi tidak ditemukan.';
  end if;

  alter table public.items_master disable trigger trg_sync_parent_item_stock;
  alter table public.items_master disable trigger trg_items_master_guard;

  select array_agg((el ->> 'id')::uuid)
  into v_snapshot_ids
  from jsonb_array_elements(v_snap.items_snapshot) as el;

  -- Remove newly inserted migration items not in original snapshot
  delete from public.items_master
  where id <> all(coalesce(v_snapshot_ids, array[]::uuid[]));
  get diagnostics v_deleted_new_items = row_count;

  -- Restore original fields on existing items
  for v_row in select * from jsonb_array_elements(v_snap.items_snapshot)
  loop
    update public.items_master
    set parent_item_id = nullif(v_row ->> 'parent_item_id', '')::uuid,
        has_sub_items = coalesce((v_row ->> 'has_sub_items')::boolean, false),
        name = v_row ->> 'name',
        description = v_row ->> 'description',
        rack_location = v_row ->> 'rack_location',
        unit_label = v_row ->> 'unit_label',
        stock_qty = (v_row ->> 'stock_qty')::integer,
        condition = (v_row ->> 'condition')::public.item_condition,
        deleted_at = nullif(v_row ->> 'deleted_at', '')::timestamptz,
        deleted_by = nullif(v_row ->> 'deleted_by', '')::uuid
    where id = (v_row ->> 'id')::uuid;
    v_restored_items := v_restored_items + 1;
  end loop;

  -- Restore kits snapshot
  for v_row in select * from jsonb_array_elements(v_snap.kits_snapshot)
  loop
    update public.item_kits
    set bundled_item_ids = coalesce(
          array(select jsonb_array_elements_text(v_row -> 'bundled_item_ids')::uuid),
          array[]::uuid[]
        )
    where id = (v_row ->> 'id')::uuid;
  end loop;

  delete from public.item_barcode_aliases
  where alias_reason = 'MERGED_DUPLICATE';

  alter table public.items_master enable trigger trg_items_master_guard;
  alter table public.items_master enable trigger trg_sync_parent_item_stock;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'restored_items', v_restored_items,
    'removed_new_items', v_deleted_new_items
  );
exception
  when others then
    alter table public.items_master enable trigger trg_items_master_guard;
    alter table public.items_master enable trigger trg_sync_parent_item_stock;
    raise;
end;
$$;

-- Tighten EXECUTE grants so trigger helpers & internal functions are never exposed to anon/unintended roles
revoke execute on function public.validate_item_hierarchy() from public, anon, authenticated;
revoke execute on function public.recalculate_parent_item_stock(uuid) from public, anon, authenticated;
revoke execute on function public.trg_fn_sync_parent_item_stock() from public, anon, authenticated;
revoke execute on function public.before_insert_stock_opname_sessions() from public, anon, authenticated;
revoke execute on function public.submit_stock_opname_batch(uuid, jsonb, uuid, text) from public, anon;
grant execute on function public.submit_stock_opname_batch(uuid, jsonb, uuid, text) to authenticated;
revoke execute on function public.rollback_inventory_hierarchy_migration(uuid) from public, anon;
grant execute on function public.rollback_inventory_hierarchy_migration(uuid) to authenticated;
