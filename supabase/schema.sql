-- =============================================================================
-- StarOps SaaS — Complete PostgreSQL / Supabase Schema
-- Organisasi : Star Champs Indonesia (Pusat Terapi & Edukasi Anak)
-- Referensi  : PRD StarOps SaaS v2.0
-- =============================================================================
-- Catatan Eksekusi:
-- Jalankan script ini di Supabase SQL Editor (atau via Supabase CLI migration).
-- Script dirancang idempoten untuk tipe/tabel/trigger utama pada proyek baru.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- -----------------------------------------------------------------------------
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- -----------------------------------------------------------------------------
-- 2. ENUMS
-- -----------------------------------------------------------------------------
do $$ begin
  create type public.user_role as enum ('OWNER', 'SUPER_ADMIN', 'TEAM_LEADER', 'STAFF');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.code_category_prefix as enum (
    'SNS', 'MTR', 'WCR', 'ELK', 'FRN', 'ATK', 'HBP', 'DOC', 'SUB'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.location_code as enum (
    'R01', 'R02', 'R03', 'R04', 'R05', 'R06',
    'ADM', 'FO', 'GDG',
    'L01', 'L02', 'L03', 'L04',
    'DIG',
    'R07', 'R08', 'R09', 'R10', 'R11', 'R12',
    'FAC', 'RTG', 'KLS', 'UKS', 'DPR', 'MUS', 'LAB', 'GDG2', 'KTR1', 'KTR2',
    'L05', 'L06', 'L07', 'L08'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.barcode_format as enum ('CODE128', 'QR', 'COMBO');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.asset_type as enum ('THERAPY_TOY', 'FIXED_ASSET', 'CONSUMABLE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_condition as enum (
    'BAIK', 'PART_KURANG', 'RUSAK_RINGAN', 'RUSAK_BERAT', 'DALAM_PERBAIKAN', 'DIHAPUSBUKU'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.hygiene_status as enum ('STERIL', 'PERLU_DICUCI', 'SEDANG_DISANITASI');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.kit_status as enum ('TERSEDIA', 'DIPINJAM', 'TIDAK_LENGKAP', 'NONAKTIF');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.borrow_status as enum ('DIPINJAM', 'DIKEMBALIKAN', 'TERLAMBAT', 'HILANG_PART');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_cycle as enum ('BULANAN', 'TAHUNAN', 'SEKALI_BAYAR');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_method as enum (
    'GOPAY', 'KARTU_DEBIT', 'KARTU_KREDIT', 'TRANSFER_BANK', 'VA', 'LAINNYA'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.archive_physical_status as enum (
    'TERSEDIA_DI_LEMARI', 'DIPINJAM', 'ARSIP_LAMA'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_direction as enum ('INBOUND', 'OUTBOUND');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.delivery_status as enum (
    'DRAFT', 'DIKEMAS', 'DALAM_PERJALANAN', 'DITERIMA', 'SELESAI', 'DIBATALKAN'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_type as enum (
    'PENGADAAN_BARANG', 'LAPORAN_KERUSAKAN', 'PART_HILANG', 'AKSES_AKUN', 'PENGHAPUSAN_ASET'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status as enum (
    'MENUNGGU_TEAM_LEADER', 'MENUNGGU_ADMIN', 'MENUNGGU_OWNER', 'DISETUJUI', 'DITOLAK', 'SELESAI'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.backup_type as enum ('PRE_UPDATE', 'MONTHLY_CUTOFF', 'MANUAL');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 3. PROFILES & AUTH SYNCHRONIZATION
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text unique,
  role public.user_role not null default 'STAFF',
  is_active boolean not null default true,
  phone text,
  job_title text,
  offboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_role_active on public.profiles (role, is_active);

-- -----------------------------------------------------------------------------
-- 4. RBAC & TIMESTAMP HELPER FUNCTIONS
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true
  limit 1;
$$;

create or replace function public.has_role(roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
      and role = any(roles)
  );
$$;

create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and is_active = true
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_is_first_user boolean;
  v_provider text;
  v_is_oauth_stranger boolean;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  select not exists (select 1 from public.profiles) into v_is_first_user;

  v_provider := lower(coalesce(new.raw_app_meta_data ->> 'provider', 'email'));
  v_is_oauth_stranger := (not v_is_first_user) and (v_provider <> 'email');

  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    v_name,
    lower(new.email),
    case when v_is_first_user then 'OWNER'::public.user_role else 'STAFF'::public.user_role end,
    not v_is_oauth_stranger
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.guard_profile_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Allow service role / SQL migrations only when auth.uid() is null
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

  if not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.offboarded_at is distinct from old.offboarded_at
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Hanya Owner atau Admin Operasional yang dapat mengubah peran, email, atau status akun.';
    end if;
  elsif not public.has_role(array['OWNER']::public.user_role[]) then
    -- SUPER_ADMIN (Admin Operasional) dapat memperbarui profil pribadinya (tanpa kolom hak akses),
    -- namun hanya boleh mengelola akun TEAM_LEADER dan STAFF — tidak boleh mengelola OWNER atau sesama SUPER_ADMIN.
    if old.id = auth.uid() then
      if new.role is distinct from old.role
         or new.is_active is distinct from old.is_active
         or new.offboarded_at is distinct from old.offboarded_at
         or new.email is distinct from old.email
         or new.created_at is distinct from old.created_at then
        raise exception 'Hanya Owner yang dapat mengubah peran, email, atau status akun Owner maupun Admin Operasional.';
      end if;
    elsif old.role in ('OWNER', 'SUPER_ADMIN') or new.role in ('OWNER', 'SUPER_ADMIN') then
      raise exception 'Hanya Owner yang dapat menetapkan atau mengubah akun Owner maupun Admin Operasional.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists trg_profiles_guard on public.profiles;
create trigger trg_profiles_guard
  before update on public.profiles
  for each row execute function public.guard_profile_privilege_columns();

-- -----------------------------------------------------------------------------
-- 5. AUTO-CODING ENGINE (SC-[KATEGORI]-[LOKASI]-[4_DIGIT] & SUB-CODES)
-- -----------------------------------------------------------------------------
create table if not exists public.code_sequences (
  scope_key text not null,
  sub_key text not null,
  last_seq integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (scope_key, sub_key)
);

create or replace function public.next_alpha_suffix(p_index integer)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_n integer := p_index;
  v_res text := '';
  v_rem integer;
begin
  if v_n < 1 then
    return 'A';
  end if;

  while v_n > 0 loop
    v_rem := (v_n - 1) % 26;
    v_res := chr(65 + v_rem) || v_res;
    v_n := (v_n - 1) / 26;
  end loop;

  return v_res;
end;
$$;

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

create or replace function public.generate_prefixed_sequence(
  p_scope_key text,
  p_sub_key text,
  p_prefix text,
  p_pad integer default 4
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq integer;
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: autentikasi diperlukan untuk membuat nomor urut.';
    end if;
  elsif not public.is_active_user() then
    raise exception 'Akses ditolak: hanya pengguna aktif yang dapat membuat nomor urut.';
  end if;

  insert into public.code_sequences (scope_key, sub_key, last_seq)
  values (upper(p_scope_key), upper(p_sub_key), 1)
  on conflict (scope_key, sub_key) do update
    set last_seq = public.code_sequences.last_seq + 1,
        updated_at = now()
  returning last_seq into v_seq;

  return p_prefix || lpad(v_seq::text, p_pad, '0');
end;
$$;

create or replace function public.prevent_code_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_col text := TG_ARGV[0];
  v_old text;
  v_new text;
begin
  execute format('select ($1).%I::text, ($2).%I::text', v_col, v_col)
    into v_old, v_new
    using old, new;

  if v_new is distinct from v_old then
    raise exception 'Kode unik (%) bersifat permanen dan tidak boleh diubah.', v_col;
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. CORE TABLES (7 MODUL INTI + TABEL PENDUKUNG OPERASIONAL)
-- -----------------------------------------------------------------------------

-- 6.0 locations_master — Master Ruangan & Lemari Arsip Dinamis
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

create index if not exists idx_locations_master_sort on public.locations_master (sort_order, code);
create index if not exists idx_locations_master_created_by on public.locations_master (created_by) where created_by is not null;
create index if not exists idx_locations_master_updated_by on public.locations_master (updated_by) where updated_by is not null;

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

drop trigger if exists trg_locations_master_updated_at on public.locations_master;
create trigger trg_locations_master_updated_at
  before update on public.locations_master
  for each row execute function public.set_updated_at();

drop trigger if exists trg_locations_master_code_immutable on public.locations_master;
create trigger trg_locations_master_code_immutable
  before update on public.locations_master
  for each row execute function public.prevent_code_mutation('code');

create or replace function public.guard_locations_master_by_role()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: pengelolaan nama ruangan dan lemari arsip hanya untuk Owner dan Admin Operasional.'
        using errcode = '42501';
    end if;
  elsif not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Akses ditolak: pengelolaan nama ruangan dan lemari arsip hanya untuk Owner dan Admin Operasional.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_locations_master_role on public.locations_master;
create trigger trg_guard_locations_master_role
  before insert or update or delete on public.locations_master
  for each row execute function public.guard_locations_master_by_role();

-- 6.1 items_master — Inventaris, Aset Kantor & Mainan Terapi
create table if not exists public.items_master (
  id uuid primary key default gen_random_uuid(),
  item_code text not null unique,
  parent_item_id uuid references public.items_master(id) on delete set null,
  barcode_format public.barcode_format not null default 'CODE128',
  name text not null,
  description text,
  category_prefix public.code_category_prefix not null,
  category text not null,
  asset_type public.asset_type not null default 'THERAPY_TOY',
  room_code text not null references public.locations_master(code) on update cascade on delete restrict,
  rack_location text,
  pic_name text,
  photo_url text,
  acquisition_date date,
  purchase_price numeric(14, 2) not null default 0 check (purchase_price >= 0),
  useful_life_months integer check (useful_life_months is null or useful_life_months > 0),
  residual_value numeric(14, 2) not null default 0 check (residual_value >= 0),
  total_parts integer not null default 1 check (total_parts >= 1),
  current_parts integer not null default 1 check (current_parts >= 0 and current_parts <= total_parts),
  unit_label text not null default 'Pcs',
  stock_qty integer not null default 1 check (stock_qty >= 0),
  min_stock_threshold integer not null default 0 check (min_stock_threshold >= 0),
  condition public.item_condition not null default 'BAIK',
  hygiene_status public.hygiene_status not null default 'STERIL',
  last_sanitized_at timestamptz,
  next_sanitization_due date,
  source_delivery_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_items_master_code on public.items_master (item_code);
create index if not exists idx_items_master_room_type on public.items_master (room_code, asset_type) where deleted_at is null;
create index if not exists idx_items_master_condition on public.items_master (condition, hygiene_status) where deleted_at is null;
create index if not exists idx_items_master_deleted on public.items_master (deleted_at) where deleted_at is not null;

create or replace function public.before_insert_items_master()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_code text;
begin
  if auth.uid() is not null
     and new.condition = 'DIHAPUSBUKU'
     and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner yang dapat menetapkan status Dihapusbuku.';
  end if;

  if new.item_code is null or btrim(new.item_code) = '' then
    if new.parent_item_id is not null then
      select item_code into v_parent_code
      from public.items_master
      where id = new.parent_item_id;

      if v_parent_code is null then
        raise exception 'Parent item tidak ditemukan.';
      end if;

      new.item_code := public.generate_item_code(new.category_prefix::text, new.room_code::text, v_parent_code);
    else
      new.item_code := public.generate_item_code(new.category_prefix::text, new.room_code::text, null);
    end if;
  else
    new.item_code := upper(btrim(new.item_code));
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_by := coalesce(new.updated_by, auth.uid());

  return new;
end;
$$;

create or replace function public.sync_item_master_state()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_today_wib date := (timezone('Asia/Jakarta', now()))::date;
begin
  -- Otomatis tandai PART_KURANG bila kepingan berkurang
  if new.total_parts > 1 and new.current_parts < new.total_parts then
    if new.condition = 'BAIK' then
      new.condition := 'PART_KURANG';
    end if;
  elsif new.current_parts = new.total_parts then
    if TG_OP = 'UPDATE' and old.condition = 'PART_KURANG' and new.condition = 'PART_KURANG' then
      new.condition := 'BAIK';
    end if;
  end if;

  -- Jadwal sterilisasi mingguan untuk mainan terapi
  if new.asset_type = 'THERAPY_TOY' and new.hygiene_status = 'STERIL' then
    if TG_OP = 'INSERT' then
      new.last_sanitized_at := coalesce(new.last_sanitized_at, now());
      new.next_sanitization_due := coalesce(new.next_sanitization_due, v_today_wib + 7);
    elsif old.hygiene_status is distinct from 'STERIL' or old.asset_type is distinct from 'THERAPY_TOY' then
      if new.last_sanitized_at is null or new.last_sanitized_at is not distinct from old.last_sanitized_at then
        new.last_sanitized_at := now();
      end if;

      if new.next_sanitization_due is not null
         and new.next_sanitization_due is distinct from old.next_sanitization_due
         and new.next_sanitization_due > v_today_wib then
        new.next_sanitization_due := new.next_sanitization_due;
      else
        new.next_sanitization_due := v_today_wib + 7;
      end if;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.guard_item_update_by_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
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

  -- Penetapan/perubahan status DIHAPUSBUKU (write-off) khusus OWNER (writeoff.approve)
  if new.condition is distinct from old.condition
     and (new.condition = 'DIHAPUSBUKU' or old.condition = 'DIHAPUSBUKU')
     and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner yang dapat menetapkan atau mengubah status Dihapusbuku.';
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_items_master_bi on public.items_master;
create trigger trg_items_master_bi
  before insert on public.items_master
  for each row execute function public.before_insert_items_master();

drop trigger if exists trg_items_master_state on public.items_master;
create trigger trg_items_master_state
  before insert or update on public.items_master
  for each row execute function public.sync_item_master_state();

drop trigger if exists trg_items_master_code_immutable on public.items_master;
create trigger trg_items_master_code_immutable
  before update on public.items_master
  for each row execute function public.prevent_code_mutation('item_code');

drop trigger if exists trg_items_master_guard on public.items_master;
create trigger trg_items_master_guard
  before update on public.items_master
  for each row execute function public.guard_item_update_by_role();

drop trigger if exists trg_items_master_updated_at on public.items_master;
create trigger trg_items_master_updated_at
  before update on public.items_master
  for each row execute function public.set_updated_at();

-- 6.2 item_kits — Manajemen Paket Barang (Kit / Bundling)
create table if not exists public.item_kits (
  id uuid primary key default gen_random_uuid(),
  kit_code text not null unique,
  kit_name text not null,
  description text,
  bundled_item_ids uuid[] not null default '{}',
  assigned_room text references public.locations_master(code) on update cascade on delete set null,
  status public.kit_status not null default 'TERSEDIA',
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_item_kits_status on public.item_kits (status) where deleted_at is null;

create or replace function public.before_insert_item_kits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kit_code is null or btrim(new.kit_code) = '' then
    new.kit_code := public.generate_prefixed_sequence(
      'KIT',
      coalesce(new.assigned_room::text, 'GEN'),
      'KIT-' || coalesce(new.assigned_room::text, 'GEN') || '-',
      2
    );
  else
    new.kit_code := upper(btrim(new.kit_code));
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;

create or replace function public.guard_kit_update_by_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    if new.kit_name is distinct from old.kit_name
       or new.description is distinct from old.description
       or new.bundled_item_ids is distinct from old.bundled_item_ids
       or new.assigned_room is distinct from old.assigned_room
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.deleted_at is distinct from old.deleted_at
       or new.deleted_by is distinct from old.deleted_by then
      raise exception 'Hanya Owner atau Admin Operasional yang dapat mengubah komposisi kit.';
    end if;

    if new.status is distinct from old.status
       and (new.status = 'NONAKTIF' or old.status = 'NONAKTIF') then
      raise exception 'Hanya Owner atau Admin Operasional yang dapat mengaktifkan atau menonaktifkan kit.';
    end if;
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_item_kits_bi on public.item_kits;
create trigger trg_item_kits_bi
  before insert on public.item_kits
  for each row execute function public.before_insert_item_kits();

drop trigger if exists trg_item_kits_code_immutable on public.item_kits;
create trigger trg_item_kits_code_immutable
  before update on public.item_kits
  for each row execute function public.prevent_code_mutation('kit_code');

drop trigger if exists trg_item_kits_guard on public.item_kits;
create trigger trg_item_kits_guard
  before update on public.item_kits
  for each row execute function public.guard_kit_update_by_role();

drop trigger if exists trg_item_kits_updated_at on public.item_kits;
create trigger trg_item_kits_updated_at
  before update on public.item_kits
  for each row execute function public.set_updated_at();

-- 6.3 borrow_transactions — Peminjaman & Pengembalian via Scan Barcode / Kit
create table if not exists public.borrow_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_code text not null unique,
  item_id uuid references public.items_master(id) on delete set null,
  kit_id uuid references public.item_kits(id) on delete set null,
  borrower_id uuid not null references public.profiles(id) on delete restrict,
  room_code text references public.locations_master(code) on update cascade on delete set null,
  parts_before integer,
  parts_after integer,
  status public.borrow_status not null default 'DIPINJAM',
  borrowed_at timestamptz not null default now(),
  due_at timestamptz,
  returned_at timestamptz,
  returned_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  constraint chk_borrow_target check (item_id is not null or kit_id is not null)
);

create index if not exists idx_borrow_active on public.borrow_transactions (status, borrowed_at desc);
create index if not exists idx_borrow_borrower on public.borrow_transactions (borrower_id);

create or replace function public.before_insert_borrow_transactions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym text := to_char(timezone('Asia/Jakarta', now()), 'YYYYMM');
begin
  if new.transaction_code is null or btrim(new.transaction_code) = '' then
    new.transaction_code := public.generate_prefixed_sequence('TRX', v_ym, 'TRX-' || v_ym || '-', 4);
  else
    new.transaction_code := upper(btrim(new.transaction_code));
  end if;

  return new;
end;
$$;

drop trigger if exists trg_borrow_bi on public.borrow_transactions;
create trigger trg_borrow_bi
  before insert on public.borrow_transactions
  for each row execute function public.before_insert_borrow_transactions();

create or replace function public.guard_borrow_transaction_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.is_active_user() then
    raise exception 'Akses ditolak: akun pengguna tidak aktif.';
  end if;

  if new.item_id is distinct from old.item_id
     or new.kit_id is distinct from old.kit_id
     or new.borrower_id is distinct from old.borrower_id
     or new.borrowed_at is distinct from old.borrowed_at
     or new.created_at is distinct from old.created_at then
    raise exception 'Identitas barang, peminjam, dan waktu pinjam tidak dapat diubah.';
  end if;

  if not public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]) then
    if old.status not in ('DIPINJAM', 'TERLAMBAT') then
      raise exception 'Transaksi peminjaman yang sudah selesai tidak dapat diubah oleh Staff.';
    end if;

    if new.room_code is distinct from old.room_code
       or new.parts_before is distinct from old.parts_before
       or new.due_at is distinct from old.due_at then
      raise exception 'Staff hanya dapat memperbarui kolom pengembalian pada transaksi peminjaman aktif.';
    end if;

    if old.kit_id is not null and old.borrower_id is distinct from auth.uid() then
      raise exception 'Terapis hanya dapat mengembalikan kit yang dipinjam oleh akun sendiri.';
    end if;

    if old.borrower_id is distinct from auth.uid()
       and new.status not in ('DIKEMBALIKAN', 'HILANG_PART') then
      raise exception 'Hanya peminjam awal atau manajemen yang dapat mengubah transaksi yang belum dikembalikan.';
    end if;

    if new.status not in ('DIPINJAM', 'TERLAMBAT', 'DIKEMBALIKAN', 'HILANG_PART') then
      raise exception 'Status pengembalian transaksi tidak valid.';
    end if;

    if new.status in ('DIKEMBALIKAN', 'HILANG_PART') then
      if new.returned_by is not null and new.returned_by is distinct from auth.uid() then
        raise exception 'Identitas pengembali harus sesuai dengan akun yang sedang masuk.';
      end if;
      new.returned_by := auth.uid();
      new.returned_at := coalesce(new.returned_at, now());
    elsif new.returned_by is distinct from old.returned_by
          or new.returned_at is distinct from old.returned_at then
      raise exception 'Kolom pengembalian hanya boleh diisi saat status berubah menjadi Dikembalikan atau Hilang Part.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_borrow_code_immutable on public.borrow_transactions;
create trigger trg_borrow_code_immutable
  before update on public.borrow_transactions
  for each row execute function public.prevent_code_mutation('transaction_code');

drop trigger if exists trg_borrow_guard on public.borrow_transactions;
create trigger trg_borrow_guard
  before update on public.borrow_transactions
  for each row execute function public.guard_borrow_transaction_update();

-- 6.4 subscriptions_vault — Manajemen Langganan & Akun Digital (AES-256)
create table if not exists public.subscriptions_vault (
  id uuid primary key default gen_random_uuid(),
  sub_code text not null unique,
  service_name text not null,
  plan_name text,
  login_email text not null,
  password_encrypted bytea not null,
  pin_recovery_encrypted bytea,
  billing_cycle public.billing_cycle not null default 'BULANAN',
  cost numeric(14, 2) not null default 0 check (cost >= 0),
  currency text not null default 'IDR',
  payment_method public.payment_method not null default 'TRANSFER_BANK',
  payment_account_label text,
  renewal_date date,
  auto_renew boolean not null default true,
  max_slots integer not null default 1 check (max_slots >= 1),
  assigned_users_json jsonb not null default '[]'::jsonb,
  password_rotated_at timestamptz not null default now(),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subscriptions_renewal on public.subscriptions_vault (renewal_date) where deleted_at is null and is_active = true;

create or replace function public.before_insert_subscriptions_vault()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.sub_code is null or btrim(new.sub_code) = '' then
    new.sub_code := public.generate_item_code('SUB', 'DIG', null);
  else
    new.sub_code := upper(btrim(new.sub_code));
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;

create or replace function public.guard_vault_update_by_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Hanya Owner atau Admin Operasional yang dapat mengelola Subscription Vault.';
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_subscriptions_bi on public.subscriptions_vault;
create trigger trg_subscriptions_bi
  before insert on public.subscriptions_vault
  for each row execute function public.before_insert_subscriptions_vault();

drop trigger if exists trg_subscriptions_code_immutable on public.subscriptions_vault;
create trigger trg_subscriptions_code_immutable
  before update on public.subscriptions_vault
  for each row execute function public.prevent_code_mutation('sub_code');

drop trigger if exists trg_subscriptions_guard on public.subscriptions_vault;
create trigger trg_subscriptions_guard
  before update on public.subscriptions_vault
  for each row execute function public.guard_vault_update_by_role();

drop trigger if exists trg_subscriptions_updated_at on public.subscriptions_vault;
create trigger trg_subscriptions_updated_at
  before update on public.subscriptions_vault
  for each row execute function public.set_updated_at();

-- 6.5 archives_hybrid & archive_versions — Penyimpanan Berkas Fisik & Digital
create table if not exists public.archives_hybrid (
  id uuid primary key default gen_random_uuid(),
  doc_code text not null unique,
  title text not null,
  category text not null,
  branch_building text not null default 'Pusat',
  cabinet_code text not null references public.locations_master(code) on update cascade on delete restrict,
  drawer_no text not null,
  folder_code text,
  physical_status public.archive_physical_status not null default 'TERSEDIA_DI_LEMARI',
  borrowed_by uuid references public.profiles(id) on delete set null,
  digital_file_url text,
  digital_file_name text,
  drive_link text,
  version_no integer not null default 1 check (version_no >= 1),
  is_sop_public_to_staff boolean not null default false,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_archives_cabinet on public.archives_hybrid (cabinet_code, physical_status) where deleted_at is null;

create table if not exists public.archive_versions (
  id uuid primary key default gen_random_uuid(),
  archive_id uuid not null references public.archives_hybrid(id) on delete cascade,
  version_no integer not null,
  digital_file_url text,
  digital_file_name text,
  drive_link text,
  change_notes text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (archive_id, version_no)
);

create or replace function public.before_insert_archives_hybrid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.doc_code is null or btrim(new.doc_code) = '' then
    new.doc_code := public.generate_item_code('DOC', new.cabinet_code::text, null);
  else
    new.doc_code := upper(btrim(new.doc_code));
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_archives_bi on public.archives_hybrid;
create trigger trg_archives_bi
  before insert on public.archives_hybrid
  for each row execute function public.before_insert_archives_hybrid();

drop trigger if exists trg_archives_code_immutable on public.archives_hybrid;
create trigger trg_archives_code_immutable
  before update on public.archives_hybrid
  for each row execute function public.prevent_code_mutation('doc_code');

drop trigger if exists trg_archives_updated_at on public.archives_hybrid;
create trigger trg_archives_updated_at
  before update on public.archives_hybrid
  for each row execute function public.set_updated_at();

-- 6.6 deliveries_log — Informasi Pengiriman & Logistik (Inbound/Outbound)
create table if not exists public.deliveries_log (
  id uuid primary key default gen_random_uuid(),
  delivery_code text not null unique,
  direction public.delivery_direction not null,
  package_type text not null,
  courier_name text not null,
  tracking_number text,
  shipping_cost numeric(14, 2) not null default 0 check (shipping_cost >= 0),
  sender_name text not null,
  sender_address text,
  receiver_name text not null,
  receiver_address text,
  pic_name text,
  is_fragile boolean not null default true,
  items_payload_json jsonb not null default '[]'::jsonb,
  proof_photo_url text,
  status public.delivery_status not null default 'DRAFT',
  converted_to_stock_at timestamptz,
  shipped_at timestamptz,
  received_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_deliveries_direction_status on public.deliveries_log (direction, status) where deleted_at is null;

alter table public.items_master
  drop constraint if exists fk_items_master_source_delivery;
alter table public.items_master
  add constraint fk_items_master_source_delivery
  foreign key (source_delivery_id) references public.deliveries_log(id) on delete set null;

create or replace function public.before_insert_deliveries_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym text := to_char(timezone('Asia/Jakarta', now()), 'YYYYMM');
  v_dir text := case when new.direction = 'INBOUND' then 'IN' else 'OUT' end;
begin
  if new.delivery_code is null or btrim(new.delivery_code) = '' then
    new.delivery_code := public.generate_prefixed_sequence(
      'DLV-' || v_dir,
      v_ym,
      'DLV-' || v_dir || '-' || v_ym || '-',
      4
    );
  else
    new.delivery_code := upper(btrim(new.delivery_code));
  end if;

  if new.created_by is null then
    new.created_by := auth.uid();
  end if;
  new.updated_by := coalesce(new.updated_by, auth.uid());
  return new;
end;
$$;

create or replace function public.guard_delivery_update_by_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Hanya Owner atau Admin Operasional yang dapat mengelola data pengiriman.';
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

drop trigger if exists trg_deliveries_bi on public.deliveries_log;
create trigger trg_deliveries_bi
  before insert on public.deliveries_log
  for each row execute function public.before_insert_deliveries_log();

drop trigger if exists trg_deliveries_code_immutable on public.deliveries_log;
create trigger trg_deliveries_code_immutable
  before update on public.deliveries_log
  for each row execute function public.prevent_code_mutation('delivery_code');

drop trigger if exists trg_deliveries_guard on public.deliveries_log;
create trigger trg_deliveries_guard
  before update on public.deliveries_log
  for each row execute function public.guard_delivery_update_by_role();

drop trigger if exists trg_deliveries_updated_at on public.deliveries_log;
create trigger trg_deliveries_updated_at
  before update on public.deliveries_log
  for each row execute function public.set_updated_at();

-- 6.7 system_backups — Repositori Menu Backup & Bundel Laporan
create table if not exists public.system_backups (
  id uuid primary key default gen_random_uuid(),
  backup_code text not null unique,
  backup_type public.backup_type not null,
  period_ym text not null,
  snapshot_json_url text,
  export_xlsx_url text,
  export_csv_url text,
  export_pdf_url text,
  diff_summary_json jsonb not null default '{}'::jsonb,
  row_counts_json jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_system_backups_period on public.system_backups (period_ym, backup_type, created_at desc);

-- 6.8 monthly_reconciliations — Siklus Pengkinian Data Minggu Terakhir
create table if not exists public.monthly_reconciliations (
  id uuid primary key default gen_random_uuid(),
  period_ym text not null unique,
  opname_progress_pct numeric(5, 2) not null default 0 check (opname_progress_pct >= 0 and opname_progress_pct <= 100),
  opname_checklist_json jsonb not null default '{}'::jsonb,
  pre_update_backup_id uuid references public.system_backups(id) on delete set null,
  final_backup_id uuid references public.system_backups(id) on delete set null,
  verified_by_admin uuid references public.profiles(id) on delete set null,
  verified_by_admin_at timestamptz,
  approved_by_leader uuid references public.profiles(id) on delete set null,
  approved_by_leader_at timestamptz,
  approved_by_owner uuid references public.profiles(id) on delete set null,
  approved_by_owner_at timestamptz,
  locked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.guard_reconciliation_approvals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  if TG_OP = 'INSERT' then
    if (new.approved_by_owner is not null
        or new.approved_by_owner_at is not null
        or new.locked_at is not null)
       and not public.has_role(array['OWNER']::public.user_role[]) then
      raise exception 'Hanya Owner yang dapat menetapkan pengesahan atau penguncian laporan bulanan.';
    end if;

    if (new.verified_by_admin is not null
        or new.verified_by_admin_at is not null
        or new.pre_update_backup_id is not null
        or new.final_backup_id is not null)
       and not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
      raise exception 'Hanya Super Admin / Owner yang dapat menetapkan verifikasi admin atau referensi backup.';
    end if;

    if (new.approved_by_leader is not null
        or new.approved_by_leader_at is not null)
       and not public.has_role(array['OWNER', 'TEAM_LEADER']::public.user_role[]) then
      raise exception 'Hanya Team Leader / Owner yang dapat menetapkan persetujuan Team Leader.';
    end if;

    return new;
  end if;

  -- TG_OP = 'UPDATE'
  if old.locked_at is not null and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Periode rekonsiliasi ini sudah dikunci oleh Owner.';
  end if;

  if new.period_ym is distinct from old.period_ym then
    raise exception 'Periode (period_ym) rekonsiliasi tidak boleh diubah.';
  end if;

  if (new.approved_by_owner is distinct from old.approved_by_owner
      or new.approved_by_owner_at is distinct from old.approved_by_owner_at
      or new.locked_at is distinct from old.locked_at)
     and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner yang dapat memberikan pengesahan akhir & mengunci laporan bulanan.';
  end if;

  if (new.verified_by_admin is distinct from old.verified_by_admin
      or new.verified_by_admin_at is distinct from old.verified_by_admin_at
      or new.pre_update_backup_id is distinct from old.pre_update_backup_id
      or new.final_backup_id is distinct from old.final_backup_id)
     and not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Hanya Super Admin / Owner yang dapat memverifikasi pengkinian data atau mengubah tautan backup.';
  end if;

  if (new.approved_by_leader is distinct from old.approved_by_leader
      or new.approved_by_leader_at is distinct from old.approved_by_leader_at)
     and not public.has_role(array['OWNER', 'TEAM_LEADER']::public.user_role[]) then
    raise exception 'Hanya Team Leader / Owner yang dapat memberikan persetujuan Team Leader.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reconciliations_guard on public.monthly_reconciliations;
create trigger trg_reconciliations_guard
  before insert or update on public.monthly_reconciliations
  for each row execute function public.guard_reconciliation_approvals();

drop trigger if exists trg_reconciliations_updated_at on public.monthly_reconciliations;
create trigger trg_reconciliations_updated_at
  before update on public.monthly_reconciliations
  for each row execute function public.set_updated_at();

-- 6.9 internal_requests — Tiket Pengajuan Internal & E-Approval
create table if not exists public.internal_requests (
  id uuid primary key default gen_random_uuid(),
  request_code text not null unique,
  request_type public.request_type not null,
  title text not null,
  description text not null,
  related_item_id uuid references public.items_master(id) on delete set null,
  related_sub_id uuid references public.subscriptions_vault(id) on delete set null,
  estimated_cost numeric(14, 2) check (estimated_cost is null or estimated_cost >= 0),
  status public.request_status not null default 'MENUNGGU_TEAM_LEADER',
  requested_by uuid not null references public.profiles(id) on delete restrict,
  team_leader_approved_by uuid references public.profiles(id) on delete set null,
  team_leader_approved_at timestamptz,
  admin_verified_by uuid references public.profiles(id) on delete set null,
  admin_verified_at timestamptz,
  owner_approved_by uuid references public.profiles(id) on delete set null,
  owner_approved_at timestamptz,
  rejection_reason text,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_requests_status on public.internal_requests (status, created_at desc) where deleted_at is null;
create index if not exists idx_requests_requester on public.internal_requests (requested_by);

create or replace function public.before_insert_internal_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ym text := to_char(timezone('Asia/Jakarta', now()), 'YYYYMM');
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: sesi autentikasi tidak valid.';
    end if;
  else
    if new.requested_by is not null and new.requested_by is distinct from auth.uid() then
      raise exception 'Pengaju tiket harus sesuai dengan akun yang sedang masuk.';
    end if;
    if new.request_type = 'PENGHAPUSAN_ASET'
       and not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
      raise exception 'Hanya Owner atau Admin Operasional yang dapat mengajukan tiket Penghapusan Aset.';
    end if;
    new.requested_by := auth.uid();
    new.status := 'MENUNGGU_TEAM_LEADER';
    new.team_leader_approved_by := null;
    new.team_leader_approved_at := null;
    new.admin_verified_by := null;
    new.admin_verified_at := null;
    new.owner_approved_by := null;
    new.owner_approved_at := null;
    new.rejection_reason := null;
    new.deleted_at := null;
    new.deleted_by := null;
  end if;

  if new.request_code is null or btrim(new.request_code) = '' then
    new.request_code := public.generate_prefixed_sequence('REQ', v_ym, 'REQ-' || v_ym || '-', 4);
  else
    new.request_code := upper(btrim(new.request_code));
  end if;

  if new.requested_by is null then
    new.requested_by := auth.uid();
  end if;
  return new;
end;
$$;

create or replace function public.guard_internal_requests_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
  v_needs_owner boolean;
  v_content_changed boolean;
  v_delete_changed boolean;
  v_tl_changed boolean;
  v_admin_changed boolean;
  v_owner_changed boolean;
  v_reject_changed boolean;
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

  v_role := public.current_user_role();
  if v_role is null then
    raise exception 'Akses ditolak: akun pengguna tidak aktif.';
  end if;

  if new.requested_by is distinct from old.requested_by
     or new.request_type is distinct from old.request_type
     or new.created_at is distinct from old.created_at then
    raise exception 'Kolom identitas pengajuan (pengaju, jenis, tanggal dibuat) tidak dapat diubah.';
  end if;

  v_content_changed :=
    new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.related_item_id is distinct from old.related_item_id
    or new.related_sub_id is distinct from old.related_sub_id
    or new.estimated_cost is distinct from old.estimated_cost;

  v_delete_changed :=
    new.deleted_at is distinct from old.deleted_at
    or new.deleted_by is distinct from old.deleted_by;

  v_tl_changed :=
    new.team_leader_approved_by is distinct from old.team_leader_approved_by
    or new.team_leader_approved_at is distinct from old.team_leader_approved_at;

  v_admin_changed :=
    new.admin_verified_by is distinct from old.admin_verified_by
    or new.admin_verified_at is distinct from old.admin_verified_at;

  v_owner_changed :=
    new.owner_approved_by is distinct from old.owner_approved_by
    or new.owner_approved_at is distinct from old.owner_approved_at;

  v_reject_changed :=
    new.rejection_reason is distinct from old.rejection_reason;

  -- Soft-delete & Restore (Recycle Bin): hanya OWNER / SUPER_ADMIN
  if v_delete_changed then
    if v_role not in ('OWNER', 'SUPER_ADMIN') then
      raise exception 'Hanya Owner atau Super Admin yang dapat menghapus atau memulihkan pengajuan.';
    end if;

    if new.status is distinct from old.status
       or v_content_changed
       or v_tl_changed
       or v_admin_changed
       or v_owner_changed
       or v_reject_changed then
      raise exception 'Operasi hapus/pulihkan pengajuan tidak boleh disertai perubahan status atau isi pengajuan.';
    end if;

    if old.deleted_at is null and new.deleted_at is not null then
      new.deleted_by := coalesce(new.deleted_by, auth.uid());
    elsif old.deleted_at is not null and new.deleted_at is null then
      new.deleted_by := null;
    else
      raise exception 'Perubahan status penghapusan pengajuan tidak valid.';
    end if;

    return new;
  end if;

  if old.deleted_at is not null then
    raise exception 'Pengajuan yang berada di Recycle Bin harus dipulihkan terlebih dahulu sebelum diubah.';
  end if;

  -- Tanpa perubahan status: hanya edit detail oleh pengaju (atau Owner) saat MENUNGGU_TEAM_LEADER
  if new.status is not distinct from old.status then
    if v_tl_changed or v_admin_changed or v_owner_changed or v_reject_changed then
      raise exception 'Kolom persetujuan atau alasan penolakan hanya dapat diubah saat transisi status.';
    end if;

    if v_content_changed then
      if old.status <> 'MENUNGGU_TEAM_LEADER' then
        raise exception 'Isi pengajuan tidak dapat diubah setelah melewati tahap Menunggu Team Leader.';
      end if;
      if old.requested_by is distinct from auth.uid() and v_role not in ('OWNER', 'SUPER_ADMIN') then
        raise exception 'Hanya pengaju tiket atau Admin/Owner yang dapat mengubah detail pengajuan.';
      end if;
    end if;

    return new;
  end if;

  -- Detail pengajuan tidak boleh dimodifikasi bersamaan dengan transisi persetujuan/penolakan
  if v_content_changed then
    raise exception 'Detail pengajuan tidak boleh diubah bersamaan dengan transisi status persetujuan.';
  end if;

  v_needs_owner :=
    old.request_type = 'PENGHAPUSAN_ASET'
    or (old.request_type = 'PENGADAAN_BARANG' and coalesce(old.estimated_cost, 0) > 0);

  -- 1. MENUNGGU_TEAM_LEADER -> MENUNGGU_ADMIN | DITOLAK
  if old.status = 'MENUNGGU_TEAM_LEADER' and new.status = 'MENUNGGU_ADMIN' then
    if v_role not in ('TEAM_LEADER', 'SUPER_ADMIN', 'OWNER') then
      raise exception 'Hanya Team Leader, Super Admin, atau Owner yang dapat menyetujui tahap awal pengajuan.';
    end if;
    if v_admin_changed or v_owner_changed or v_reject_changed then
      raise exception 'Kolom verifikasi admin/owner tidak boleh diubah pada tahap Team Leader.';
    end if;
    if new.team_leader_approved_by is not null and new.team_leader_approved_by is distinct from auth.uid() then
      raise exception 'Identitas penyetuju Team Leader tidak valid.';
    end if;
    new.team_leader_approved_by := auth.uid();
    new.team_leader_approved_at := coalesce(new.team_leader_approved_at, now());
    return new;

  elsif old.status = 'MENUNGGU_TEAM_LEADER' and new.status = 'DITOLAK' then
    if v_role not in ('TEAM_LEADER', 'SUPER_ADMIN', 'OWNER') then
      raise exception 'Hanya Team Leader, Super Admin, atau Owner yang dapat menolak pengajuan.';
    end if;
    if v_admin_changed or v_owner_changed then
      raise exception 'Kolom verifikasi admin/owner tidak boleh diubah saat penolakan tahap awal.';
    end if;
    if new.team_leader_approved_by is not null and new.team_leader_approved_by is distinct from auth.uid() then
      raise exception 'Identitas penolak tidak valid.';
    end if;
    return new;

  -- 2. MENUNGGU_ADMIN -> MENUNGGU_OWNER | DISETUJUI | DITOLAK
  elsif old.status = 'MENUNGGU_ADMIN' and new.status = 'MENUNGGU_OWNER' then
    if v_role not in ('SUPER_ADMIN', 'OWNER') then
      raise exception 'Hanya Super Admin atau Owner yang dapat meneruskan pengajuan ke tahap Owner.';
    end if;
    if v_tl_changed or v_owner_changed or v_reject_changed then
      raise exception 'Kolom persetujuan Team Leader atau Owner tidak boleh diubah pada tahap verifikasi Admin.';
    end if;
    if new.admin_verified_by is not null and new.admin_verified_by is distinct from auth.uid() then
      raise exception 'Identitas verifikator Admin tidak valid.';
    end if;
    new.admin_verified_by := auth.uid();
    new.admin_verified_at := coalesce(new.admin_verified_at, now());
    return new;

  elsif old.status = 'MENUNGGU_ADMIN' and new.status = 'DISETUJUI' then
    if v_role not in ('SUPER_ADMIN', 'OWNER') then
      raise exception 'Hanya Super Admin atau Owner yang dapat menyetujui tahap Admin.';
    end if;
    if v_needs_owner and v_role <> 'OWNER' then
      raise exception 'Pengajuan Penghapusan Aset atau Pengadaan Barang beranggaran wajib diteruskan ke Owner (MENUNGGU_OWNER) untuk pengesahan akhir.';
    end if;
    if v_tl_changed or v_reject_changed then
      raise exception 'Kolom persetujuan Team Leader atau alasan penolakan tidak boleh diubah.';
    end if;
    if v_owner_changed and v_role <> 'OWNER' then
      raise exception 'Hanya Owner yang dapat mengisi kolom pengesahan Owner.';
    end if;
    if new.admin_verified_by is not null and new.admin_verified_by is distinct from auth.uid() then
      raise exception 'Identitas verifikator Admin tidak valid.';
    end if;
    new.admin_verified_by := coalesce(new.admin_verified_by, auth.uid());
    new.admin_verified_at := coalesce(new.admin_verified_at, now());
    if v_role = 'OWNER' then
      if new.owner_approved_by is not null and new.owner_approved_by is distinct from auth.uid() then
        raise exception 'Identitas pengesahan Owner tidak valid.';
      end if;
      new.owner_approved_by := coalesce(new.owner_approved_by, auth.uid());
      new.owner_approved_at := coalesce(new.owner_approved_at, now());
    end if;
    return new;

  elsif old.status = 'MENUNGGU_ADMIN' and new.status = 'DITOLAK' then
    if v_role not in ('SUPER_ADMIN', 'OWNER') then
      raise exception 'Hanya Super Admin atau Owner yang dapat menolak pada tahap Admin.';
    end if;
    if v_tl_changed or v_owner_changed then
      raise exception 'Kolom persetujuan Team Leader atau Owner tidak boleh diubah saat penolakan Admin.';
    end if;
    if new.admin_verified_by is not null and new.admin_verified_by is distinct from auth.uid() then
      raise exception 'Identitas verifikator Admin tidak valid.';
    end if;
    return new;

  -- 3. MENUNGGU_OWNER -> DISETUJUI | SELESAI | DITOLAK (KHUSUS OWNER)
  elsif old.status = 'MENUNGGU_OWNER' and new.status in ('DISETUJUI', 'SELESAI') then
    if v_role <> 'OWNER' then
      raise exception 'Hanya Owner yang berwenang memberikan pengesahan akhir pada tahap Menunggu Owner.';
    end if;
    if v_tl_changed or v_admin_changed or v_reject_changed then
      raise exception 'Kolom persetujuan tahap sebelumnya tidak boleh diubah saat pengesahan Owner.';
    end if;
    if new.owner_approved_by is not null and new.owner_approved_by is distinct from auth.uid() then
      raise exception 'Identitas pengesahan Owner tidak valid.';
    end if;
    new.owner_approved_by := auth.uid();
    new.owner_approved_at := coalesce(new.owner_approved_at, now());
    return new;

  elsif old.status = 'MENUNGGU_OWNER' and new.status = 'DITOLAK' then
    if v_role <> 'OWNER' then
      raise exception 'Hanya Owner yang berwenang menolak pengajuan pada tahap Menunggu Owner.';
    end if;
    if v_tl_changed or v_admin_changed then
      raise exception 'Kolom persetujuan tahap sebelumnya tidak boleh diubah.';
    end if;
    if new.owner_approved_by is not null and new.owner_approved_by is distinct from auth.uid() then
      raise exception 'Identitas penolak Owner tidak valid.';
    end if;
    return new;

  -- 4. DISETUJUI -> SELESAI (operasional oleh SUPER_ADMIN / OWNER)
  elsif old.status = 'DISETUJUI' and new.status = 'SELESAI' then
    if v_role not in ('SUPER_ADMIN', 'OWNER') then
      raise exception 'Hanya Super Admin atau Owner yang dapat menandai pengajuan yang telah disetujui menjadi Selesai.';
    end if;
    if v_tl_changed or v_admin_changed or v_owner_changed or v_reject_changed then
      raise exception 'Kolom persetujuan tidak boleh diubah saat menyelesaikan pengajuan.';
    end if;
    return new;

  else
    raise exception 'Transisi status pengajuan dari % ke % tidak diizinkan.', old.status, new.status;
  end if;
end;
$$;

drop trigger if exists trg_requests_bi on public.internal_requests;
create trigger trg_requests_bi
  before insert on public.internal_requests
  for each row execute function public.before_insert_internal_requests();

drop trigger if exists trg_requests_code_immutable on public.internal_requests;
create trigger trg_requests_code_immutable
  before update on public.internal_requests
  for each row execute function public.prevent_code_mutation('request_code');

drop trigger if exists trg_requests_guard on public.internal_requests;
create trigger trg_requests_guard
  before update on public.internal_requests
  for each row execute function public.guard_internal_requests_transition();

drop trigger if exists trg_requests_updated_at on public.internal_requests;
create trigger trg_requests_updated_at
  before update on public.internal_requests
  for each row execute function public.set_updated_at();

-- 6.10 audit_logs — Activity Stream & Jejak Audit Real-Time (Append-Only)
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text,
  actor_role public.user_role,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_code text,
  summary text not null,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);

-- 6.11 system_telemetry_daily — Kapasitas Penyimpanan & Egress PostgreSQL Harian
create table if not exists public.system_telemetry_daily (
  metric_date date primary key,
  db_size_bytes bigint not null default 0 check (db_size_bytes >= 0),
  storage_size_bytes bigint not null default 0 check (storage_size_bytes >= 0),
  db_egress_bytes bigint not null default 0 check (db_egress_bytes >= 0),
  storage_egress_bytes bigint not null default 0 check (storage_egress_bytes >= 0),
  export_egress_bytes bigint not null default 0 check (export_egress_bytes >= 0),
  pg_tuples_snapshot bigint not null default 0 check (pg_tuples_snapshot >= 0),
  query_count bigint not null default 0 check (query_count >= 0),
  updated_at timestamptz not null default now()
);

-- 6.12 share_short_links — Link Pendek Kustom Pratinjau Item & Arsip (/s/<slug>)
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

-- 6.13 delivery_share_links — Link Pendek Surat Jalan, BAST & Pengiriman (/s/<slug>)
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

-- -----------------------------------------------------------------------------
-- 7. AUDIT TRAIL TRIGGERS
-- -----------------------------------------------------------------------------
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

  -- Jangan pernah menyimpan bytea secret, data biaya/pembayaran, atau catatan vault ke audit log
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

drop trigger if exists trg_audit_items_master on public.items_master;
create trigger trg_audit_items_master
  after insert or update or delete on public.items_master
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_item_kits on public.item_kits;
create trigger trg_audit_item_kits
  after insert or update or delete on public.item_kits
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_subscriptions_vault on public.subscriptions_vault;
create trigger trg_audit_subscriptions_vault
  after insert or update or delete on public.subscriptions_vault
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_archives_hybrid on public.archives_hybrid;
create trigger trg_audit_archives_hybrid
  after insert or update or delete on public.archives_hybrid
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_deliveries_log on public.deliveries_log;
create trigger trg_audit_deliveries_log
  after insert or update or delete on public.deliveries_log
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_monthly_reconciliations on public.monthly_reconciliations;
create trigger trg_audit_monthly_reconciliations
  after insert or update or delete on public.monthly_reconciliations
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_system_backups on public.system_backups;
create trigger trg_audit_system_backups
  after insert or update or delete on public.system_backups
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_internal_requests on public.internal_requests;
create trigger trg_audit_internal_requests
  after insert or update or delete on public.internal_requests
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_borrow_transactions on public.borrow_transactions;
create trigger trg_audit_borrow_transactions
  after insert or update or delete on public.borrow_transactions
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.log_table_audit();

drop trigger if exists trg_audit_locations_master on public.locations_master;
create trigger trg_audit_locations_master
  after insert or update or delete on public.locations_master
  for each row execute function public.log_table_audit();

-- -----------------------------------------------------------------------------
-- 8. SUBSCRIPTION VAULT AES-256 ENCRYPTION & LIMITED-VIEW FUNCTIONS
-- -----------------------------------------------------------------------------
create or replace function public.encrypt_vault_secret(
  p_plaintext text,
  p_encryption_key text
)
returns bytea
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: hanya Owner, Admin Operasional, atau server terautentikasi yang dapat mengenkripsi kredensial vault.';
    end if;
  elsif not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Akses ditolak: hanya Owner atau Admin Operasional yang dapat mengenkripsi kredensial vault.';
  end if;

  if p_plaintext is null or p_plaintext = '' then
    return null;
  end if;

  if p_encryption_key is null or length(p_encryption_key) < 16 then
    raise exception 'Kunci enkripsi vault tidak valid.';
  end if;

  return pgp_sym_encrypt(p_plaintext, p_encryption_key, 'cipher-algo=aes256');
end;
$$;

create or replace function public.reveal_subscription_secret(
  p_sub_id uuid,
  p_encryption_key text
)
returns table (
  password_plain text,
  pin_recovery_plain text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_sub record;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role public.user_role;
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: hanya Owner atau Super Admin yang dapat membuka kata sandi.';
    end if;
  elsif not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Akses ditolak: hanya Owner atau Super Admin yang dapat membuka kata sandi.';
  end if;

  select id, sub_code, service_name, password_encrypted, pin_recovery_encrypted
  into v_sub
  from public.subscriptions_vault
  where id = p_sub_id and deleted_at is null;

  if v_sub.id is null then
    raise exception 'Akun langganan tidak ditemukan.';
  end if;

  if v_actor_id is not null then
    select full_name, role into v_actor_name, v_actor_role
    from public.profiles
    where id = v_actor_id;
  end if;

  insert into public.audit_logs (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    entity_code,
    summary
  ) values (
    v_actor_id,
    coalesce(v_actor_name, case when v_actor_id is null then 'Sistem' else 'Admin' end),
    v_actor_role,
    'VAULT_REVEAL',
    'subscriptions_vault',
    v_sub.id::text,
    v_sub.sub_code,
    format('Membuka kata sandi akun %s (%s)', v_sub.service_name, v_sub.sub_code)
  );

  return query
  select
    pgp_sym_decrypt(v_sub.password_encrypted, p_encryption_key),
    case
      when v_sub.pin_recovery_encrypted is not null
        then pgp_sym_decrypt(v_sub.pin_recovery_encrypted, p_encryption_key)
      else null
    end;
end;
$$;

-- Safe view for Admins (Owner & Admin Operasional; tanpa secret bytea)
create or replace view public.subscriptions_vault_directory
with (security_invoker = true, security_barrier = true)
as
select
  s.id,
  s.sub_code,
  s.service_name,
  s.plan_name,
  s.login_email,
  s.billing_cycle,
  case
    when public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then s.cost
    else null
  end as cost,
  case
    when public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then s.currency
    else null
  end as currency,
  case
    when public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then s.payment_method
    else null
  end as payment_method,
  case
    when public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then s.payment_account_label
    else null
  end as payment_account_label,
  s.renewal_date,
  s.auto_renew,
  s.max_slots,
  s.assigned_users_json,
  s.password_rotated_at,
  s.is_active,
  s.created_at,
  s.updated_at
from public.subscriptions_vault s
where s.deleted_at is null
  and public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]);

-- -----------------------------------------------------------------------------
-- 9. RECYCLE BIN PURGE HELPER (30 HARI)
-- -----------------------------------------------------------------------------
create or replace function public.purge_expired_recycle_bin(p_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cutoff timestamptz;
  v_items integer := 0;
  v_kits integer := 0;
  v_subs integer := 0;
  v_archives integer := 0;
  v_deliveries integer := 0;
  v_requests integer := 0;
  v_backups integer := 0;
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Hanya Owner atau Cron Server yang dapat mengosongkan Recycle Bin.';
    end if;
  elsif not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner atau Cron Server yang dapat mengosongkan Recycle Bin.';
  end if;

  if p_days is null or p_days < 0 then
    raise exception 'Parameter retensi hari (p_days) tidak valid.';
  end if;

  v_cutoff := now() - make_interval(days => p_days);

  delete from public.items_master where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_items = row_count;

  delete from public.item_kits where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_kits = row_count;

  delete from public.subscriptions_vault where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_subs = row_count;

  delete from public.archives_hybrid where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_archives = row_count;

  delete from public.deliveries_log where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_deliveries = row_count;

  delete from public.internal_requests where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_requests = row_count;

  delete from public.system_backups where deleted_at is not null and deleted_at < v_cutoff;
  get diagnostics v_backups = row_count;

  return jsonb_build_object(
    'cutoff', v_cutoff,
    'items_master', v_items,
    'item_kits', v_kits,
    'subscriptions_vault', v_subs,
    'archives_hybrid', v_archives,
    'deliveries_log', v_deliveries,
    'internal_requests', v_requests,
    'system_backups', v_backups
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 9B. TELEMETRI KAPASITAS & EGRESS POSTGRESQL (OWNER & SUPER_ADMIN ONLY)
-- -----------------------------------------------------------------------------
create or replace function public.record_egress_telemetry(
  p_db_bytes bigint default 0,
  p_storage_bytes bigint default 0,
  p_export_bytes bigint default 0,
  p_queries bigint default 1
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_db_size bigint;
  v_storage_size bigint;
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: telemetri sistem hanya dapat dicatat oleh server atau Admin.'
        using errcode = '42501';
    end if;
  elsif not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Akses ditolak: telemetri sistem hanya untuk Owner dan Admin Operasional.'
      using errcode = '42501';
  end if;

  v_db_size := pg_database_size(current_database())::bigint;
  v_storage_size := coalesce(
    (select sum((metadata->>'size')::bigint) from storage.objects),
    0
  )::bigint;

  insert into public.system_telemetry_daily (
    metric_date,
    db_size_bytes,
    storage_size_bytes,
    db_egress_bytes,
    storage_egress_bytes,
    export_egress_bytes,
    pg_tuples_snapshot,
    query_count,
    updated_at
  ) values (
    v_today,
    v_db_size,
    v_storage_size,
    greatest(0, coalesce(p_db_bytes, 0)),
    greatest(0, coalesce(p_storage_bytes, 0)),
    greatest(0, coalesce(p_export_bytes, 0)),
    coalesce((select tup_fetched from pg_stat_database where datname = current_database()), 0),
    greatest(0, coalesce(p_queries, 0)),
    now()
  )
  on conflict (metric_date) do update
    set db_size_bytes = excluded.db_size_bytes,
        storage_size_bytes = excluded.storage_size_bytes,
        db_egress_bytes = public.system_telemetry_daily.db_egress_bytes + greatest(0, coalesce(p_db_bytes, 0)),
        storage_egress_bytes = public.system_telemetry_daily.storage_egress_bytes + greatest(0, coalesce(p_storage_bytes, 0)),
        export_egress_bytes = public.system_telemetry_daily.export_egress_bytes + greatest(0, coalesce(p_export_bytes, 0)),
        query_count = public.system_telemetry_daily.query_count + greatest(0, coalesce(p_queries, 0)),
        updated_at = now();
end;
$$;

create or replace function public.get_admin_infrastructure_metrics()
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Jakarta')::date;
  v_month_start date := date_trunc('month', (now() at time zone 'Asia/Jakarta')::date)::date;
  v_db_bytes bigint;
  v_public_bytes bigint;
  v_storage_bytes bigint;
  v_total_files bigint;
  v_tup_fetched bigint := 0;
  v_tup_returned bigint := 0;
  v_tup_inserted bigint := 0;
  v_tup_updated bigint := 0;
  v_tup_deleted bigint := 0;
  v_xact_commit bigint := 0;
  v_xact_rollback bigint := 0;
  v_blks_hit bigint := 0;
  v_blks_read bigint := 0;
  v_backends bigint := 0;
  v_sessions bigint := 0;
  v_stats_reset timestamptz;
  v_prev_snapshot bigint := null;
  v_delta_tuples bigint := 0;
  v_delta_bytes bigint := 0;
  v_delta_queries bigint := 0;
  v_tables_json jsonb;
  v_buckets_json jsonb;
  v_daily_json jsonb;
  v_month_json jsonb;
  v_cache_ratio numeric := 100;
begin
  if auth.uid() is null then
    if not (
      coalesce(current_setting('role', true), '') = 'service_role'
      or (
        session_user = 'postgres'
        and coalesce(nullif(current_setting('role', true), ''), 'none') in ('none', 'postgres')
      )
    ) then
      raise exception 'Akses ditolak: telemetri kapasitas hanya untuk Owner dan Admin Operasional.'
        using errcode = '42501';
    end if;
  elsif not public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]) then
    raise exception 'Akses ditolak: telemetri kapasitas hanya untuk Owner dan Admin Operasional.'
      using errcode = '42501';
  end if;

  v_db_bytes := pg_database_size(current_database())::bigint;

  select
    coalesce(sum((metadata->>'size')::bigint), 0)::bigint,
    count(*)::bigint
  into v_storage_bytes, v_total_files
  from storage.objects;

  select
    coalesce(tup_fetched, 0)::bigint,
    coalesce(tup_returned, 0)::bigint,
    coalesce(tup_inserted, 0)::bigint,
    coalesce(tup_updated, 0)::bigint,
    coalesce(tup_deleted, 0)::bigint,
    coalesce(xact_commit, 0)::bigint,
    coalesce(xact_rollback, 0)::bigint,
    coalesce(blks_hit, 0)::bigint,
    coalesce(blks_read, 0)::bigint,
    coalesce(numbackends, 0)::bigint,
    coalesce(sessions, 0)::bigint,
    stats_reset
  into
    v_tup_fetched,
    v_tup_returned,
    v_tup_inserted,
    v_tup_updated,
    v_tup_deleted,
    v_xact_commit,
    v_xact_rollback,
    v_blks_hit,
    v_blks_read,
    v_backends,
    v_sessions,
    v_stats_reset
  from pg_stat_database
  where datname = current_database();

  if (v_blks_hit + v_blks_read) > 0 then
    v_cache_ratio := round((v_blks_hit::numeric / (v_blks_hit + v_blks_read)::numeric) * 100.0, 2);
  end if;

  select pg_tuples_snapshot
  into v_prev_snapshot
  from public.system_telemetry_daily
  where metric_date = v_today;

  if v_prev_snapshot is null then
    select coalesce(
      (
        select pg_tuples_snapshot
        from public.system_telemetry_daily
        where metric_date < v_today and pg_tuples_snapshot > 0
        order by metric_date desc
        limit 1
      ),
      0
    ) into v_prev_snapshot;
  end if;

  if v_prev_snapshot > 0 and v_tup_fetched >= v_prev_snapshot then
    v_delta_tuples := v_tup_fetched - v_prev_snapshot;
    v_delta_bytes := v_delta_tuples * 340;
    if v_delta_tuples > 0 then
      v_delta_queries := greatest(1, round(v_delta_tuples::numeric / 140.0)::bigint);
    end if;
  end if;

  insert into public.system_telemetry_daily (
    metric_date,
    db_size_bytes,
    storage_size_bytes,
    db_egress_bytes,
    storage_egress_bytes,
    export_egress_bytes,
    pg_tuples_snapshot,
    query_count,
    updated_at
  ) values (
    v_today,
    v_db_bytes,
    v_storage_bytes,
    v_delta_bytes,
    0,
    0,
    v_tup_fetched,
    greatest(1, v_delta_queries),
    now()
  )
  on conflict (metric_date) do update
    set db_size_bytes = excluded.db_size_bytes,
        storage_size_bytes = excluded.storage_size_bytes,
        db_egress_bytes = public.system_telemetry_daily.db_egress_bytes + v_delta_bytes,
        pg_tuples_snapshot = v_tup_fetched,
        query_count = public.system_telemetry_daily.query_count + v_delta_queries,
        updated_at = now();

  select
    coalesce(sum(t.total_bytes), 0)::bigint,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_name', t.table_name,
          'total_bytes', t.total_bytes,
          'estimated_rows', t.estimated_rows
        )
        order by t.total_bytes desc, t.table_name asc
      ),
      '[]'::jsonb
    )
  into v_public_bytes, v_tables_json
  from (
    select
      c.relname::text as table_name,
      pg_total_relation_size(c.oid)::bigint as total_bytes,
      greatest(c.reltuples::bigint, 0)::bigint as estimated_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
  ) t;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'bucket_id', bk.bucket_id,
        'is_public', bk.is_public,
        'file_size_limit', bk.file_size_limit,
        'used_bytes', bk.used_bytes,
        'file_count', bk.file_count
      )
      order by bk.used_bytes desc, bk.bucket_id asc
    ),
    '[]'::jsonb
  )
  into v_buckets_json
  from (
    select
      b.id::text as bucket_id,
      coalesce(b.public, false) as is_public,
      b.file_size_limit,
      coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as used_bytes,
      count(o.id)::bigint as file_count
    from storage.buckets b
    left join storage.objects o on o.bucket_id = b.id
    group by b.id, b.public, b.file_size_limit
  ) bk;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', to_char(d.day_date, 'YYYY-MM-DD'),
        'db_size_bytes', coalesce(st.db_size_bytes, v_db_bytes),
        'storage_size_bytes', coalesce(st.storage_size_bytes, v_storage_bytes),
        'db_egress_bytes', coalesce(st.db_egress_bytes, 0),
        'storage_egress_bytes', coalesce(st.storage_egress_bytes, 0),
        'export_egress_bytes', coalesce(st.export_egress_bytes, 0),
        'total_egress_bytes',
          coalesce(st.db_egress_bytes, 0)
          + coalesce(st.storage_egress_bytes, 0)
          + coalesce(st.export_egress_bytes, 0),
        'query_count', coalesce(st.query_count, 0)
      )
      order by d.day_date asc
    ),
    '[]'::jsonb
  )
  into v_daily_json
  from (
    select gs::date as day_date
    from generate_series(v_today - 13, v_today, interval '1 day') as gs
  ) d
  left join public.system_telemetry_daily st on st.metric_date = d.day_date;

  select jsonb_build_object(
    'month_start', to_char(v_month_start, 'YYYY-MM-DD'),
    'db_egress_bytes', coalesce(sum(db_egress_bytes), 0)::bigint,
    'storage_egress_bytes', coalesce(sum(storage_egress_bytes), 0)::bigint,
    'export_egress_bytes', coalesce(sum(export_egress_bytes), 0)::bigint,
    'total_egress_bytes',
      (
        coalesce(sum(db_egress_bytes), 0)
        + coalesce(sum(storage_egress_bytes), 0)
        + coalesce(sum(export_egress_bytes), 0)
      )::bigint,
    'query_count', coalesce(sum(query_count), 0)::bigint
  )
  into v_month_json
  from public.system_telemetry_daily
  where metric_date >= v_month_start;

  return jsonb_build_object(
    'captured_at', now(),
    'database', jsonb_build_object(
      'total_bytes', v_db_bytes,
      'public_tables_bytes', v_public_bytes,
      'system_catalog_bytes', greatest(0, v_db_bytes - v_public_bytes),
      'tables', v_tables_json
    ),
    'storage', jsonb_build_object(
      'total_bytes', v_storage_bytes,
      'total_files', v_total_files,
      'buckets', v_buckets_json
    ),
    'pg_performance', jsonb_build_object(
      'cache_hit_ratio', v_cache_ratio,
      'blks_hit', v_blks_hit,
      'blks_read', v_blks_read,
      'xact_commit', v_xact_commit,
      'xact_rollback', v_xact_rollback,
      'tup_returned', v_tup_returned,
      'tup_fetched', v_tup_fetched,
      'tup_inserted', v_tup_inserted,
      'tup_updated', v_tup_updated,
      'tup_deleted', v_tup_deleted,
      'active_backends', v_backends,
      'sessions', v_sessions,
      'stats_reset', v_stats_reset
    ),
    'daily_series', v_daily_json,
    'month_summary', v_month_json
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.locations_master enable row level security;
alter table public.code_sequences enable row level security;
alter table public.items_master enable row level security;
alter table public.item_kits enable row level security;
alter table public.borrow_transactions enable row level security;
alter table public.subscriptions_vault enable row level security;
alter table public.archives_hybrid enable row level security;
alter table public.archive_versions enable row level security;
alter table public.deliveries_log enable row level security;
alter table public.system_backups enable row level security;
alter table public.monthly_reconciliations enable row level security;
alter table public.internal_requests enable row level security;
alter table public.audit_logs enable row level security;
alter table public.system_telemetry_daily enable row level security;
alter table public.share_short_links enable row level security;
alter table public.delivery_share_links enable row level security;

-- profiles
drop policy if exists "profiles_select_active_or_self" on public.profiles;
create policy "profiles_select_active_or_self" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_active_user()));

drop policy if exists "profiles_insert_admins" on public.profiles;
create policy "profiles_insert_admins" on public.profiles
  for insert to authenticated
  with check (
    (select public.has_role(array['OWNER']::public.user_role[]))
    or (
      (select public.has_role(array['SUPER_ADMIN']::public.user_role[]))
      and role in ('TEAM_LEADER', 'STAFF')
    )
  );

drop policy if exists "profiles_update_admins_or_self" on public.profiles;
create policy "profiles_update_admins_or_self" on public.profiles
  for update to authenticated
  using (
    (id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.has_role(array['OWNER']::public.user_role[]))
    or (
      (select public.has_role(array['SUPER_ADMIN']::public.user_role[]))
      and role in ('TEAM_LEADER', 'STAFF')
    )
  )
  with check (
    (id = (select auth.uid()) and (select public.is_active_user()))
    or (select public.has_role(array['OWNER']::public.user_role[]))
    or (
      (select public.has_role(array['SUPER_ADMIN']::public.user_role[]))
      and role in ('TEAM_LEADER', 'STAFF')
    )
  );

drop policy if exists "profiles_delete_admins" on public.profiles;
create policy "profiles_delete_admins" on public.profiles
  for delete to authenticated
  using (
    (select public.has_role(array['OWNER']::public.user_role[]))
    or (
      (select public.has_role(array['SUPER_ADMIN']::public.user_role[]))
      and role in ('TEAM_LEADER', 'STAFF')
    )
  );

-- locations_master
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

-- code_sequences (admin-readable only; mutated by security definer functions)
drop policy if exists "code_sequences_select_admins" on public.code_sequences;
create policy "code_sequences_select_admins" on public.code_sequences
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

-- items_master
drop policy if exists "items_master_select_all" on public.items_master;
create policy "items_master_select_all" on public.items_master
  for select to authenticated
  using (
    (select public.is_active_user())
    and (deleted_at is null or (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  );

drop policy if exists "items_master_insert_admins" on public.items_master;
create policy "items_master_insert_admins" on public.items_master
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "items_master_update_operational" on public.items_master;
create policy "items_master_update_operational" on public.items_master
  for update to authenticated
  using (
    (select public.is_active_user())
    and (deleted_at is null or (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  )
  with check ((select public.is_active_user()));

drop policy if exists "items_master_delete_super_admin" on public.items_master;
drop policy if exists "items_master_delete_owner" on public.items_master;
create policy "items_master_delete_owner" on public.items_master
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- item_kits
drop policy if exists "item_kits_select_all" on public.item_kits;
create policy "item_kits_select_all" on public.item_kits
  for select to authenticated
  using (
    (select public.is_active_user())
    and (deleted_at is null or (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  );

drop policy if exists "item_kits_insert_admins" on public.item_kits;
create policy "item_kits_insert_admins" on public.item_kits
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "item_kits_update_operational" on public.item_kits;
create policy "item_kits_update_operational" on public.item_kits
  for update to authenticated
  using (
    (select public.is_active_user())
    and (deleted_at is null or (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  )
  with check ((select public.is_active_user()));

drop policy if exists "item_kits_delete_super_admin" on public.item_kits;
drop policy if exists "item_kits_delete_owner" on public.item_kits;
create policy "item_kits_delete_owner" on public.item_kits
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- borrow_transactions
drop policy if exists "borrow_select_all" on public.borrow_transactions;
create policy "borrow_select_all" on public.borrow_transactions
  for select to authenticated
  using ((select public.is_active_user()));

drop policy if exists "borrow_insert_all" on public.borrow_transactions;
create policy "borrow_insert_all" on public.borrow_transactions
  for insert to authenticated
  with check (
    (select public.is_active_user())
    and (
      borrower_id = (select auth.uid())
      or (select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]))
    )
  );

drop policy if exists "borrow_update_actor_or_mgmt" on public.borrow_transactions;
create policy "borrow_update_actor_or_mgmt" on public.borrow_transactions
  for update to authenticated
  using (
    (select public.is_active_user())
    and (
      status in ('DIPINJAM', 'TERLAMBAT')
      or (select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]))
    )
  )
  with check ((select public.is_active_user()));

drop policy if exists "borrow_delete_super_admin" on public.borrow_transactions;
drop policy if exists "borrow_delete_owner" on public.borrow_transactions;
create policy "borrow_delete_owner" on public.borrow_transactions
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- subscriptions_vault (khusus OWNER & SUPER_ADMIN; TEAM_LEADER & STAFF tidak punya akses)
drop policy if exists "vault_select_admins" on public.subscriptions_vault;
create policy "vault_select_admins" on public.subscriptions_vault
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "vault_insert_super_admin" on public.subscriptions_vault;
drop policy if exists "vault_insert_admins" on public.subscriptions_vault;
create policy "vault_insert_admins" on public.subscriptions_vault
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "vault_update_super_admin" on public.subscriptions_vault;
drop policy if exists "vault_update_admins" on public.subscriptions_vault;
create policy "vault_update_admins" on public.subscriptions_vault
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "vault_delete_super_admin" on public.subscriptions_vault;
drop policy if exists "vault_delete_owner" on public.subscriptions_vault;
create policy "vault_delete_owner" on public.subscriptions_vault
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- archives_hybrid & archive_versions
drop policy if exists "archives_select_by_role" on public.archives_hybrid;
create policy "archives_select_by_role" on public.archives_hybrid
  for select to authenticated
  using (
    (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    or (deleted_at is null and (select public.has_role(array['TEAM_LEADER']::public.user_role[])))
    or (deleted_at is null and is_sop_public_to_staff = true and (select public.is_active_user()))
  );

drop policy if exists "archives_insert_admins" on public.archives_hybrid;
create policy "archives_insert_admins" on public.archives_hybrid
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "archives_update_admins" on public.archives_hybrid;
create policy "archives_update_admins" on public.archives_hybrid
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "archives_delete_super_admin" on public.archives_hybrid;
drop policy if exists "archives_delete_owner" on public.archives_hybrid;
create policy "archives_delete_owner" on public.archives_hybrid
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

drop policy if exists "archive_versions_select_by_role" on public.archive_versions;
create policy "archive_versions_select_by_role" on public.archive_versions
  for select to authenticated
  using (
    exists (
      select 1 from public.archives_hybrid a
      where a.id = archive_versions.archive_id
        and (
          (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
          or (a.deleted_at is null and (select public.has_role(array['TEAM_LEADER']::public.user_role[])))
        )
    )
  );

drop policy if exists "archive_versions_insert_admins" on public.archive_versions;
create policy "archive_versions_insert_admins" on public.archive_versions
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

-- deliveries_log (khusus OWNER & SUPER_ADMIN)
drop policy if exists "deliveries_select_management" on public.deliveries_log;
drop policy if exists "deliveries_select_admins" on public.deliveries_log;
create policy "deliveries_select_admins" on public.deliveries_log
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "deliveries_insert_super_admin" on public.deliveries_log;
drop policy if exists "deliveries_insert_admins" on public.deliveries_log;
create policy "deliveries_insert_admins" on public.deliveries_log
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "deliveries_update_super_admin" on public.deliveries_log;
drop policy if exists "deliveries_update_admins" on public.deliveries_log;
create policy "deliveries_update_admins" on public.deliveries_log
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "deliveries_delete_super_admin" on public.deliveries_log;
drop policy if exists "deliveries_delete_owner" on public.deliveries_log;
create policy "deliveries_delete_owner" on public.deliveries_log
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- system_backups (OWNER & SUPER_ADMIN baca/buat/perbarui; hapus permanen khusus OWNER)
drop policy if exists "backups_select_admins" on public.system_backups;
create policy "backups_select_admins" on public.system_backups
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "backups_insert_super_admin" on public.system_backups;
drop policy if exists "backups_insert_admins" on public.system_backups;
create policy "backups_insert_admins" on public.system_backups
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "backups_update_super_admin" on public.system_backups;
drop policy if exists "backups_update_admins" on public.system_backups;
create policy "backups_update_admins" on public.system_backups
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "backups_delete_super_admin" on public.system_backups;
drop policy if exists "backups_delete_owner" on public.system_backups;
create policy "backups_delete_owner" on public.system_backups
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- monthly_reconciliations
drop policy if exists "reconciliations_select_management" on public.monthly_reconciliations;
create policy "reconciliations_select_management" on public.monthly_reconciliations
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "reconciliations_insert_management" on public.monthly_reconciliations;
create policy "reconciliations_insert_management" on public.monthly_reconciliations
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

drop policy if exists "reconciliations_update_management" on public.monthly_reconciliations;
create policy "reconciliations_update_management" on public.monthly_reconciliations
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[])));

-- internal_requests
drop policy if exists "requests_select_by_role" on public.internal_requests;
create policy "requests_select_by_role" on public.internal_requests
  for select to authenticated
  using (
    (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    or (deleted_at is null and (select public.has_role(array['TEAM_LEADER']::public.user_role[])))
    or (deleted_at is null and requested_by = (select auth.uid()) and (select public.is_active_user()))
  );

drop policy if exists "requests_insert_all" on public.internal_requests;
create policy "requests_insert_all" on public.internal_requests
  for insert to authenticated
  with check (
    (select public.is_active_user())
    and requested_by = (select auth.uid())
    and (
      request_type <> 'PENGHAPUSAN_ASET'
      or (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    )
  );

drop policy if exists "requests_update_management" on public.internal_requests;
create policy "requests_update_management" on public.internal_requests
  for update to authenticated
  using (
    (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    or (deleted_at is null and (select public.has_role(array['TEAM_LEADER']::public.user_role[])))
    or (
      deleted_at is null
      and requested_by = (select auth.uid())
      and status = 'MENUNGGU_TEAM_LEADER'
      and (select public.is_active_user())
    )
  )
  with check (
    (select public.has_role(array['OWNER']::public.user_role[]))
    or (
      (select public.has_role(array['SUPER_ADMIN']::public.user_role[]))
      and (
        deleted_at is not null
        or status not in ('DISETUJUI', 'SELESAI')
        or (
          request_type <> 'PENGHAPUSAN_ASET'
          and not (request_type = 'PENGADAAN_BARANG' and coalesce(estimated_cost, 0) > 0)
        )
        or owner_approved_by is not null
      )
    )
    or (
      (select public.has_role(array['TEAM_LEADER']::public.user_role[]))
      and deleted_at is null
      and deleted_by is null
      and status in ('MENUNGGU_TEAM_LEADER', 'MENUNGGU_ADMIN', 'DITOLAK')
      and admin_verified_by is null
      and admin_verified_at is null
      and owner_approved_by is null
      and owner_approved_at is null
    )
    or (
      (select public.is_active_user())
      and requested_by = (select auth.uid())
      and deleted_at is null
      and deleted_by is null
      and status = 'MENUNGGU_TEAM_LEADER'
      and team_leader_approved_by is null
      and team_leader_approved_at is null
      and admin_verified_by is null
      and admin_verified_at is null
      and owner_approved_by is null
      and owner_approved_at is null
      and rejection_reason is null
    )
  );

drop policy if exists "requests_delete_super_admin" on public.internal_requests;
drop policy if exists "requests_delete_owner" on public.internal_requests;
create policy "requests_delete_owner" on public.internal_requests
  for delete to authenticated
  using ((select public.has_role(array['OWNER']::public.user_role[])));

-- audit_logs (append-only; terbaca khusus OWNER & SUPER_ADMIN)
drop policy if exists "audit_logs_select_management" on public.audit_logs;
drop policy if exists "audit_logs_select_admins" on public.audit_logs;
create policy "audit_logs_select_admins" on public.audit_logs
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "audit_logs_insert_active" on public.audit_logs;
create policy "audit_logs_insert_active" on public.audit_logs
  for insert to authenticated
  with check (
    (select public.is_active_user())
    and actor_id = (select auth.uid())
    and (actor_role is null or actor_role = (select public.current_user_role()))
    and old_data is null
    and new_data is null
    and char_length(btrim(action)) > 0
    and char_length(btrim(summary)) > 0
    and (
      (
        (select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]))
        and action = 'STOCK_OPNAME'
        and entity_type = 'items_master'
      )
      or (
        (select public.has_role(array['TEAM_LEADER']::public.user_role[]))
        and action in ('EXPORT_DATA', 'EXPORT_CSV', 'EXPORT_XLSX', 'EXPORT_PDF')
        and entity_type not in ('subscriptions_vault', 'deliveries_log', 'audit_logs')
      )
      or (
        (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
        and action not in ('INSERT', 'UPDATE', 'SOFT_DELETE', 'RESTORE', 'PURGE', 'VAULT_REVEAL')
      )
    )
  );

-- system_telemetry_daily (khusus OWNER & SUPER_ADMIN)
drop policy if exists "system_telemetry_daily_select_admins" on public.system_telemetry_daily;
create policy "system_telemetry_daily_select_admins" on public.system_telemetry_daily
  for select to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "system_telemetry_daily_insert_admins" on public.system_telemetry_daily;
create policy "system_telemetry_daily_insert_admins" on public.system_telemetry_daily
  for insert to authenticated
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

drop policy if exists "system_telemetry_daily_update_admins" on public.system_telemetry_daily;
create policy "system_telemetry_daily_update_admins" on public.system_telemetry_daily
  for update to authenticated
  using ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])))
  with check ((select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[])));

-- share_short_links (pengguna aktif login; edit oleh pembuat atau MANAGEMENT)
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

-- delivery_share_links (khusus OWNER & SUPER_ADMIN)
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

-- -----------------------------------------------------------------------------
-- 11. SUPABASE PRIVATE STORAGE BUCKETS & POLICIES
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'inventory-photos',
    'inventory-photos',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'archives',
    'archives',
    false,
    10485760,
    array[
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
  ),
  (
    'delivery-proofs',
    'delivery-proofs',
    false,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'backups',
    'backups',
    false,
    15728640,
    array[
      'application/json',
      'text/csv',
      'text/plain',
      'application/zip',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/pdf'
    ]
  )
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "storage_inventory_read" on storage.objects;
create policy "storage_inventory_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'inventory-photos' and (select public.is_active_user()));

drop policy if exists "storage_inventory_write" on storage.objects;
create policy "storage_inventory_write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'inventory-photos'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  )
  with check (
    bucket_id = 'inventory-photos'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "storage_archives_read" on storage.objects;
create policy "storage_archives_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'archives'
    and (
      (select public.has_role(array['OWNER', 'SUPER_ADMIN', 'TEAM_LEADER']::public.user_role[]))
      or exists (
        select 1 from public.archives_hybrid a
        where a.digital_file_url = storage.objects.name
          and a.is_sop_public_to_staff = true
          and a.deleted_at is null
          and (select public.is_active_user())
      )
    )
  );

drop policy if exists "storage_archives_write" on storage.objects;
create policy "storage_archives_write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'archives'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  )
  with check (
    bucket_id = 'archives'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "storage_deliveries_read" on storage.objects;
create policy "storage_deliveries_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "storage_deliveries_write" on storage.objects;
create policy "storage_deliveries_write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'delivery-proofs'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  )
  with check (
    bucket_id = 'delivery-proofs'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "storage_backups_read" on storage.objects;
create policy "storage_backups_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'backups'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "storage_backups_write" on storage.objects;
create policy "storage_backups_write" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'backups'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  )
  with check (
    bucket_id = 'backups'
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

-- -----------------------------------------------------------------------------
-- 12. GRANTS & FUNCTION EXECUTION HARDENING
-- -----------------------------------------------------------------------------
-- Revoke all anonymous table, view & sequence grants in `public` (and lock defaults)
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

alter default privileges in schema public
  revoke all on tables from anon;

alter default privileges in schema public
  revoke all on sequences from anon;

revoke all on public.locations_master from public, anon;
grant select, insert, update, delete on public.locations_master to authenticated, service_role;

revoke all on public.system_telemetry_daily from public, anon;
grant select, insert, update on public.system_telemetry_daily to authenticated, service_role;

revoke all on public.share_short_links from public, anon;
grant select, insert, update, delete on public.share_short_links to authenticated, service_role;

revoke all on public.delivery_share_links from public, anon;
grant select, insert, update, delete on public.delivery_share_links to authenticated, service_role;

revoke all on public.subscriptions_vault_directory from public, anon;
grant select on public.subscriptions_vault_directory to authenticated, service_role;

-- RBAC & session helpers
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated, service_role;

revoke all on function public.has_role(public.user_role[]) from public, anon;
grant execute on function public.has_role(public.user_role[]) to authenticated, service_role;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated, service_role;

-- Auto-coding, Vault & Recycle Bin RPCs
revoke all on function public.next_alpha_suffix(integer) from public, anon, authenticated;
grant execute on function public.next_alpha_suffix(integer) to service_role;

revoke all on function public.generate_item_code(text, text, text) from public, anon;
grant execute on function public.generate_item_code(text, text, text) to authenticated, service_role;

revoke all on function public.generate_prefixed_sequence(text, text, text, integer) from public, anon, authenticated;
grant execute on function public.generate_prefixed_sequence(text, text, text, integer) to service_role;

revoke all on function public.encrypt_vault_secret(text, text) from public, anon;
grant execute on function public.encrypt_vault_secret(text, text) to authenticated, service_role;

revoke all on function public.reveal_subscription_secret(uuid, text) from public, anon;
grant execute on function public.reveal_subscription_secret(uuid, text) to authenticated, service_role;

revoke all on function public.purge_expired_recycle_bin(integer) from public, anon;
grant execute on function public.purge_expired_recycle_bin(integer) to authenticated, service_role;

-- Trigger functions (not directly callable via PostgREST RPC)
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to service_role;

revoke all on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to service_role;

revoke all on function public.guard_profile_privilege_columns() from public, anon, authenticated;
grant execute on function public.guard_profile_privilege_columns() to service_role;

revoke all on function public.prevent_code_mutation() from public, anon, authenticated;
grant execute on function public.prevent_code_mutation() to service_role;

revoke all on function public.before_insert_items_master() from public, anon, authenticated;
grant execute on function public.before_insert_items_master() to service_role;

revoke all on function public.sync_item_master_state() from public, anon, authenticated;
grant execute on function public.sync_item_master_state() to service_role;

revoke all on function public.guard_item_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_item_update_by_role() to service_role;

revoke all on function public.before_insert_item_kits() from public, anon, authenticated;
grant execute on function public.before_insert_item_kits() to service_role;

revoke all on function public.guard_kit_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_kit_update_by_role() to service_role;

revoke all on function public.before_insert_borrow_transactions() from public, anon, authenticated;
grant execute on function public.before_insert_borrow_transactions() to service_role;

revoke all on function public.guard_borrow_transaction_update() from public, anon, authenticated;
grant execute on function public.guard_borrow_transaction_update() to service_role;

revoke all on function public.before_insert_subscriptions_vault() from public, anon, authenticated;
grant execute on function public.before_insert_subscriptions_vault() to service_role;

revoke all on function public.guard_vault_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_vault_update_by_role() to service_role;

revoke all on function public.before_insert_archives_hybrid() from public, anon, authenticated;
grant execute on function public.before_insert_archives_hybrid() to service_role;

revoke all on function public.before_insert_deliveries_log() from public, anon, authenticated;
grant execute on function public.before_insert_deliveries_log() to service_role;

revoke all on function public.guard_delivery_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_delivery_update_by_role() to service_role;

revoke all on function public.guard_reconciliation_approvals() from public, anon, authenticated;
grant execute on function public.guard_reconciliation_approvals() to service_role;

revoke all on function public.before_insert_internal_requests() from public, anon, authenticated;
grant execute on function public.before_insert_internal_requests() to service_role;

revoke all on function public.guard_internal_requests_transition() from public, anon, authenticated;
grant execute on function public.guard_internal_requests_transition() to service_role;

revoke all on function public.log_table_audit() from public, anon, authenticated;
grant execute on function public.log_table_audit() to service_role;

revoke all on function public.guard_locations_master_by_role() from public, anon, authenticated;
grant execute on function public.guard_locations_master_by_role() to service_role;

revoke all on function public.record_egress_telemetry(bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_egress_telemetry(bigint, bigint, bigint, bigint) to service_role;

revoke all on function public.get_admin_infrastructure_metrics() from public, anon, authenticated;
grant execute on function public.get_admin_infrastructure_metrics() to service_role;

-- -----------------------------------------------------------------------------
-- 13. CATATAN PENJADWALAN CRON (OPSIONAL pg_cron / VERCEL CRON)
-- -----------------------------------------------------------------------------
-- Jika ekstensi `pg_cron` diaktifkan di Supabase Dashboard, jadwal pembersihan
-- Recycle Bin (> 30 hari) dapat didaftarkan pada pukul 01:00 WIB (18:00 UTC):
--   select cron.schedule('starops-recycle-purge', '0 18 * * *', $$select public.purge_expired_recycle_bin(30);$$);
-- Sementara jadwal Pre-Update, H-7 Pengkinian Data (tgl 24), dan Cut-Off Akhir
-- Bulan (23:59 WIB) dieksekusi oleh Vercel Cron /api/cron/monthly-backup.

-- -----------------------------------------------------------------------------
-- 14. BARCODE & LABEL PRINT STUDIO PRESETS (barcode_label_presets)
-- -----------------------------------------------------------------------------
create table if not exists public.barcode_label_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 80),
  description text,
  is_default boolean not null default false,
  config_json jsonb not null check (jsonb_typeof(config_json) = 'object'),
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_barcode_label_presets_single_default
  on public.barcode_label_presets (is_default)
  where is_default = true;

create index if not exists idx_barcode_label_presets_created_by
  on public.barcode_label_presets (created_by);

create index if not exists idx_barcode_label_presets_updated_by
  on public.barcode_label_presets (updated_by);

drop trigger if exists trg_barcode_label_presets_updated_at on public.barcode_label_presets;
create trigger trg_barcode_label_presets_updated_at
  before update on public.barcode_label_presets
  for each row execute function public.set_updated_at();

alter table public.barcode_label_presets enable row level security;

revoke all on public.barcode_label_presets from public, anon;
grant select, insert, update, delete on public.barcode_label_presets to authenticated, service_role;

drop policy if exists "barcode_label_presets_select_admins" on public.barcode_label_presets;
create policy "barcode_label_presets_select_admins" on public.barcode_label_presets
  for select to authenticated
  using (
    (select public.is_active_user())
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "barcode_label_presets_insert_admins" on public.barcode_label_presets;
create policy "barcode_label_presets_insert_admins" on public.barcode_label_presets
  for insert to authenticated
  with check (
    (select public.is_active_user())
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
    and (created_by is null or created_by = (select auth.uid()))
  );

drop policy if exists "barcode_label_presets_update_admins" on public.barcode_label_presets;
create policy "barcode_label_presets_update_admins" on public.barcode_label_presets
  for update to authenticated
  using (
    (select public.is_active_user())
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  )
  with check (
    (select public.is_active_user())
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

drop policy if exists "barcode_label_presets_delete_admins" on public.barcode_label_presets;
create policy "barcode_label_presets_delete_admins" on public.barcode_label_presets
  for delete to authenticated
  using (
    (select public.is_active_user())
    and (select public.has_role(array['OWNER', 'SUPER_ADMIN']::public.user_role[]))
  );

insert into public.barcode_label_presets (name, description, is_default, config_json)
select v.name, v.description, v.is_default, v.config_json
from (
  values
    (
      'Sekali Tempel 50×30 (QR Besar)',
      'Stiker thermal permanen 50×30 mm dengan QR besar 65% link pendek tanpa stok/part dinamis.',
      true,
      '{
        "symbology": "QR",
        "template": "THERMAL",
        "thermalSize": "50x30",
        "customThermalSize": { "widthMm": 60, "heightMm": 40 },
        "a4Preset": "TJ_121_24",
        "spineSize": "150x35",
        "spinePaperMode": "A4_SHEET",
        "content": {
          "showHeader": true,
          "customHeaderText": "STAR CHAMPS INDONESIA",
          "showHeaderSubtitle": true,
          "showTitle": true,
          "showCategory": true,
          "showCodeText": true,
          "showLocation": true,
          "showStockQty": false,
          "showPartCounter": false,
          "showArchiveDigitalIndicator": true,
          "showStatusTag": false,
          "showScanHint": true,
          "customScanHint": "Scan QR untuk detail & stok",
          "showBorderFrame": false,
          "qrPayloadMode": "SHORT_PREVIEW",
          "qrErrorLevel": "L",
          "qrSizePercent": 65,
          "qrLayout": "SIDE_BY_SIDE",
          "qrQuietZone": 1
        }
      }'::jsonb
    ),
    (
      'QR Dominan 80% Persegi 50×50',
      'Stiker persegi 50×50 mm dengan blok QR raksasa 80% untuk pindai cepat dan teks ringkas.',
      false,
      '{
        "symbology": "QR",
        "template": "THERMAL",
        "thermalSize": "50x50",
        "customThermalSize": { "widthMm": 60, "heightMm": 40 },
        "a4Preset": "A4_SQUARE_12",
        "spineSize": "150x35",
        "spinePaperMode": "A4_SHEET",
        "content": {
          "showHeader": false,
          "customHeaderText": "STAR CHAMPS INDONESIA",
          "showHeaderSubtitle": false,
          "showTitle": true,
          "showCategory": false,
          "showCodeText": true,
          "showLocation": false,
          "showStockQty": false,
          "showPartCounter": false,
          "showArchiveDigitalIndicator": false,
          "showStatusTag": false,
          "showScanHint": false,
          "customScanHint": "Scan QR untuk detail & stok",
          "showBorderFrame": false,
          "qrPayloadMode": "SHORT_PREVIEW",
          "qrErrorLevel": "L",
          "qrSizePercent": 80,
          "qrLayout": "QR_DOMINANT",
          "qrQuietZone": 1
        }
      }'::jsonb
    ),
    (
      'Label A4 Grid 24/Hal (Combo)',
      'Kertas label Tom & Jerry No. 121 (24 stiker/halaman A4) mode Combo 1D + QR tanpa stok/part.',
      false,
      '{
        "symbology": "COMBO",
        "template": "A4_GRID",
        "thermalSize": "50x30",
        "customThermalSize": { "widthMm": 60, "heightMm": 40 },
        "a4Preset": "TJ_121_24",
        "spineSize": "150x35",
        "spinePaperMode": "A4_SHEET",
        "content": {
          "showHeader": true,
          "customHeaderText": "STAR CHAMPS INDONESIA",
          "showHeaderSubtitle": true,
          "showTitle": true,
          "showCategory": true,
          "showCodeText": true,
          "showLocation": true,
          "showStockQty": false,
          "showPartCounter": false,
          "showArchiveDigitalIndicator": true,
          "showStatusTag": false,
          "showScanHint": true,
          "customScanHint": "Scan QR untuk detail & stok",
          "showBorderFrame": false,
          "qrPayloadMode": "SHORT_PREVIEW",
          "qrErrorLevel": "L",
          "qrSizePercent": 65,
          "qrLayout": "SIDE_BY_SIDE",
          "qrQuietZone": 1
        }
      }'::jsonb
    )
) as v(name, description, is_default, config_json)
where not exists (select 1 from public.barcode_label_presets);
