-- =============================================================================
-- StarOps Migration: 20261124_locations_master.sql
-- Dynamic Room & Archive Cabinet Management (`public.locations_master`)
--
-- 1. Creates `public.locations_master` to store editable room and archive
--    cabinet names, groups, PIC, opname inclusion flags, and active states.
-- 2. Seeds the 14 existing StarOps locations with their exact original names
--    so existing inventory/archive records stay intact until renamed by user.
-- 3. Expands `public.location_code` enum for immediate compatibility and
--    includes idempotent SQL-Editor upgrade to `text` + foreign keys so
--    arbitrary new room & archive cabinet codes are supported without DDL.
-- 4. Updates `generate_item_code` & `log_table_audit`, attaches triggers,
--    enables RLS, and configures least-privilege grants.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. LOCATIONS MASTER TABLE & INDEXES
-- -----------------------------------------------------------------------------
create table if not exists public.locations_master (
  code text primary key check (code ~ '^[A-Z0-9]{2,8}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  location_group text not null check (location_group in ('THERAPY', 'OFFICE', 'ARCHIVE', 'DIGITAL')),
  description text,
  pic_name text,
  include_in_opname boolean not null default false,
  is_active boolean not null default true,
  is_system boolean not null default false,
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_locations_master_sort
  on public.locations_master (sort_order, code);

create index if not exists idx_locations_master_created_by
  on public.locations_master (created_by)
  where created_by is not null;

create index if not exists idx_locations_master_updated_by
  on public.locations_master (updated_by)
  where updated_by is not null;

-- -----------------------------------------------------------------------------
-- 2. SEED THE 14 EXISTING LOCATIONS (EXACT ORIGINAL NAMES)
-- -----------------------------------------------------------------------------
insert into public.locations_master (
  code, name, location_group, include_in_opname, is_active, is_system, sort_order
)
values
  ('R01', 'Ruang Terapi 1', 'THERAPY', true, true, true, 10),
  ('R02', 'Ruang Terapi 2', 'THERAPY', true, true, true, 20),
  ('R03', 'Ruang Terapi 3', 'THERAPY', true, true, true, 30),
  ('R04', 'Ruang Terapi 4', 'THERAPY', true, true, true, 40),
  ('R05', 'Ruang Terapi 5', 'THERAPY', true, true, true, 50),
  ('R06', 'Ruang Terapi 6', 'THERAPY', true, true, true, 60),
  ('ADM', 'Admin', 'OFFICE', true, true, true, 70),
  ('FO', 'Resepsionis', 'OFFICE', false, true, true, 80),
  ('GDG', 'Gudang Utama', 'OFFICE', true, true, true, 90),
  ('L01', 'Lemari Arsip 1', 'ARCHIVE', false, true, true, 100),
  ('L02', 'Lemari Arsip 2', 'ARCHIVE', false, true, true, 110),
  ('L03', 'Lemari Arsip 3', 'ARCHIVE', false, true, true, 120),
  ('L04', 'Lemari Arsip 4', 'ARCHIVE', false, true, true, 130),
  ('DIG', 'Digital Vault', 'DIGITAL', false, true, true, 140)
on conflict (code) do nothing;

-- -----------------------------------------------------------------------------
-- 3. UPGRADE LOCATION COLUMNS FROM ENUM TO TEXT + FOREIGN KEYS (IDEMPOTENT)
-- -----------------------------------------------------------------------------
alter table public.archives_hybrid
  drop constraint if exists archives_hybrid_cabinet_code_check;

drop index if exists public.idx_archives_cabinet;
drop index if exists public.idx_items_master_room_type;

alter table public.items_master
  alter column room_code type text using room_code::text;

alter table public.item_kits
  alter column assigned_room type text using assigned_room::text;

alter table public.borrow_transactions
  alter column room_code type text using room_code::text;

alter table public.archives_hybrid
  alter column cabinet_code type text using cabinet_code::text;

create index if not exists idx_items_master_room_type
  on public.items_master (room_code, asset_type)
  where deleted_at is null;

create index if not exists idx_items_master_room_fk
  on public.items_master (room_code);

create index if not exists idx_archives_cabinet
  on public.archives_hybrid (cabinet_code, physical_status)
  where deleted_at is null;

create index if not exists idx_archives_cabinet_fk
  on public.archives_hybrid (cabinet_code);

create index if not exists idx_item_kits_assigned_room_fk
  on public.item_kits (assigned_room)
  where assigned_room is not null;

create index if not exists idx_borrow_transactions_room_fk
  on public.borrow_transactions (room_code)
  where room_code is not null;

alter table public.items_master
  drop constraint if exists fk_items_master_room;
alter table public.items_master
  add constraint fk_items_master_room
  foreign key (room_code) references public.locations_master(code)
  on update cascade on delete restrict;

alter table public.item_kits
  drop constraint if exists fk_item_kits_assigned_room;
alter table public.item_kits
  add constraint fk_item_kits_assigned_room
  foreign key (assigned_room) references public.locations_master(code)
  on update cascade on delete set null;

alter table public.borrow_transactions
  drop constraint if exists fk_borrow_transactions_room;
alter table public.borrow_transactions
  add constraint fk_borrow_transactions_room
  foreign key (room_code) references public.locations_master(code)
  on update cascade on delete set null;

alter table public.archives_hybrid
  drop constraint if exists fk_archives_hybrid_cabinet;
alter table public.archives_hybrid
  add constraint fk_archives_hybrid_cabinet
  foreign key (cabinet_code) references public.locations_master(code)
  on update cascade on delete restrict;

-- -----------------------------------------------------------------------------
-- 4. AUTO-CODING & AUDIT FUNCTIONS
-- -----------------------------------------------------------------------------
create or replace function public.generate_item_code(
  p_category text,
  p_location text,
  p_parent_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cat text := upper(btrim(coalesce(p_category, '')));
  v_loc text := upper(btrim(coalesce(p_location, '')));
  v_seq integer;
  v_child_count integer;
  v_candidate text;
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: autentikasi diperlukan untuk membuat kode item.';
    end if;
  elsif not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Akses ditolak: hanya Owner atau Super Admin yang dapat membuat kode item.';
  end if;

  if p_parent_code is not null and btrim(p_parent_code) <> '' then
    select count(*) into v_child_count
    from public.items_master
    where item_code like upper(btrim(p_parent_code)) || '-%';

    loop
      v_child_count := v_child_count + 1;
      v_candidate := upper(btrim(p_parent_code)) || '-' || public.next_alpha_suffix(v_child_count);
      exit when not exists (
        select 1 from public.items_master where item_code = v_candidate
      );
    end loop;

    return v_candidate;
  end if;

  if v_cat not in ('SNS', 'MTR', 'WCR', 'ELK', 'FRN', 'ATK', 'HBP', 'DOC', 'SUB') then
    raise exception 'Prefix kategori tidak valid: %', p_category;
  end if;

  if not exists (
    select 1 from public.locations_master where code = v_loc
  ) then
    raise exception 'Kode lokasi tidak valid: %', p_location;
  end if;

  insert into public.code_sequences (scope_key, sub_key, last_seq)
  values (v_cat, v_loc, 1)
  on conflict (scope_key, sub_key) do update
    set last_seq = public.code_sequences.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;

  return format('SC-%s-%s-%s', v_cat, v_loc, lpad(v_seq::text, 4, '0'));
end;
$$;

create or replace function public.log_table_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role public.user_role;
  v_action text;
  v_old jsonb;
  v_new jsonb;
  v_row jsonb;
  v_entity_id text;
  v_entity_code text;
begin
  if v_actor_id is not null then
    select full_name, role into v_actor_name, v_actor_role
    from public.profiles
    where id = v_actor_id;
  end if;

  if TG_OP = 'INSERT' then
    v_action := 'INSERT';
    v_new := to_jsonb(new);
    v_row := v_new;
  elsif TG_OP = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;

    if (v_old ? 'deleted_at') and (v_old ->> 'deleted_at') is null and (v_new ->> 'deleted_at') is not null then
      v_action := 'SOFT_DELETE';
    elsif (v_old ? 'deleted_at') and (v_old ->> 'deleted_at') is not null and (v_new ->> 'deleted_at') is null then
      v_action := 'RESTORE';
    else
      v_action := 'UPDATE';
    end if;
  else
    v_action := 'PURGE';
    v_old := to_jsonb(old);
    v_row := v_old;
  end if;

  if TG_TABLE_NAME = 'subscriptions_vault' then
    if v_old is not null then
      v_old := (
        v_old
        - 'password_encrypted'
        - 'pin_recovery_encrypted'
        - 'cost'
        - 'currency'
        - 'payment_method'
        - 'payment_account_label'
        - 'notes'
      );
    end if;
    if v_new is not null then
      v_new := (
        v_new
        - 'password_encrypted'
        - 'pin_recovery_encrypted'
        - 'cost'
        - 'currency'
        - 'payment_method'
        - 'payment_account_label'
        - 'notes'
      );
    end if;
  end if;

  v_entity_id := coalesce(v_row ->> 'id', v_row ->> 'code');
  v_entity_code := coalesce(
    v_row ->> 'item_code',
    v_row ->> 'kit_code',
    v_row ->> 'sub_code',
    v_row ->> 'doc_code',
    v_row ->> 'delivery_code',
    v_row ->> 'request_code',
    v_row ->> 'backup_code',
    v_row ->> 'transaction_code',
    v_row ->> 'period_ym',
    v_row ->> 'email',
    v_row ->> 'code'
  );

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    entity_code,
    summary,
    old_data,
    new_data
  ) values (
    v_actor_id,
    coalesce(v_actor_name, 'Sistem'),
    v_actor_role,
    v_action,
    TG_TABLE_NAME,
    v_entity_id,
    v_entity_code,
    format('%s pada %s (%s)', v_action, TG_TABLE_NAME, coalesce(v_entity_code, v_entity_id, '-')),
    v_old,
    v_new
  );

  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. TRIGGERS ON LOCATIONS MASTER
-- -----------------------------------------------------------------------------
drop trigger if exists trg_locations_master_updated_at on public.locations_master;
create trigger trg_locations_master_updated_at
  before update on public.locations_master
  for each row execute function public.set_updated_at();

drop trigger if exists trg_locations_master_code_immutable on public.locations_master;
create trigger trg_locations_master_code_immutable
  before update on public.locations_master
  for each row execute function public.prevent_code_mutation('code');

drop trigger if exists trg_audit_locations_master on public.locations_master;
create trigger trg_audit_locations_master
  after insert or update or delete on public.locations_master
  for each row execute function public.log_table_audit();

-- -----------------------------------------------------------------------------
-- 6. RLS & LEAST-PRIVILEGE GRANTS
-- -----------------------------------------------------------------------------
alter table public.locations_master enable row level security;

revoke all on public.locations_master from public, anon;
grant select, insert, update, delete on public.locations_master to authenticated, service_role;

drop policy if exists "locations_master_select_active" on public.locations_master;
create policy "locations_master_select_active" on public.locations_master
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists "locations_master_insert_admins" on public.locations_master;
create policy "locations_master_insert_admins" on public.locations_master
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "locations_master_update_admins" on public.locations_master;
create policy "locations_master_update_admins" on public.locations_master
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "locations_master_delete_admins" on public.locations_master;
create policy "locations_master_delete_admins" on public.locations_master
  for delete to authenticated
  using (
    (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    and is_system = false
  );

revoke all on function public.generate_item_code(text, text, text) from public, anon;
grant execute on function public.generate_item_code(text, text, text) to authenticated, service_role;

revoke all on function public.log_table_audit() from public, anon, authenticated;
grant execute on function public.log_table_audit() to service_role;

commit;
