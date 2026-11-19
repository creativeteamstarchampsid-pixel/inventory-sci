-- =============================================================================
-- StarOps Migration: 20261119_sync_rbac_rls.sql
-- Synchronizes PostgreSQL triggers, RPCs, views, RLS policies, and Storage
-- policies with the Frozen RBAC Contract (OWNER > SUPER_ADMIN > TEAM_LEADER > STAFF).
--
-- Safe & idempotent: can be executed directly in the Supabase SQL Editor on an
-- existing StarOps database without data loss.
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. TRIGGER & RPC FUNCTION UPDATES
-- -----------------------------------------------------------------------------

-- 1.1 profiles: SUPER_ADMIN can edit own non-privilege profile fields and manage
--     TEAM_LEADER / STAFF only; OWNER manages all 4 roles (incl. OWNER & SUPER_ADMIN).
create or replace function public.guard_profile_privilege_columns()
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
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.offboarded_at is distinct from old.offboarded_at
       or new.email is distinct from old.email
       or new.created_at is distinct from old.created_at then
      raise exception 'Hanya Owner atau Admin Operasional yang dapat mengubah peran, email, atau status akun.';
    end if;
  elsif not public.has_role(array['OWNER']::public.user_role[]) then
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

-- 1.2 items_master: lock DIHAPUSBUKU (write-off) strictly to OWNER on INSERT & UPDATE.
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

  if new.condition is distinct from old.condition
     and (new.condition = 'DIHAPUSBUKU' or old.condition = 'DIHAPUSBUKU')
     and not public.has_role(array['OWNER']::public.user_role[]) then
    raise exception 'Hanya Owner yang dapat menetapkan atau mengubah status Dihapusbuku.';
  end if;

  new.updated_by := coalesce(auth.uid(), new.updated_by);
  return new;
end;
$$;

-- 1.3 item_kits: block non-ADMINS from setting or clearing status = 'NONAKTIF'.
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

-- 1.4 borrow_transactions: STAFF may only return kits they borrowed themselves.
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

-- 1.5 subscriptions_vault: allow both OWNER and SUPER_ADMIN to manage & encrypt secrets.
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

-- 1.6 subscriptions_vault_directory: ADMINS (OWNER & SUPER_ADMIN) only.
create or replace view public.subscriptions_vault_directory
with (security_barrier = true)
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

-- 1.7 deliveries_log: allow both OWNER and SUPER_ADMIN to manage deliveries.
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

-- 1.8 internal_requests: block non-ADMINS from submitting PENGHAPUSAN_ASET tickets.
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

-- 1.9 purge_expired_recycle_bin: restrict authenticated calls to OWNER only (service_role/cron preserved).
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
-- 2. ROW LEVEL SECURITY (RLS) POLICIES
-- -----------------------------------------------------------------------------

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

-- code_sequences
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

-- subscriptions_vault
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

-- deliveries_log
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

-- system_backups
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

-- audit_logs
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

-- -----------------------------------------------------------------------------
-- 3. STORAGE BUCKET POLICIES
-- -----------------------------------------------------------------------------

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
-- 4. RE-VERIFY LEAST-PRIVILEGE GRANTS
-- -----------------------------------------------------------------------------

revoke all on public.subscriptions_vault_directory from public, anon;
grant select on public.subscriptions_vault_directory to authenticated, service_role;

revoke all on function public.encrypt_vault_secret(text, text) from public, anon;
grant execute on function public.encrypt_vault_secret(text, text) to authenticated, service_role;

revoke all on function public.purge_expired_recycle_bin(integer) from public, anon;
grant execute on function public.purge_expired_recycle_bin(integer) to authenticated, service_role;

revoke all on function public.guard_profile_privilege_columns() from public, anon, authenticated;
grant execute on function public.guard_profile_privilege_columns() to service_role;

revoke all on function public.before_insert_items_master() from public, anon, authenticated;
grant execute on function public.before_insert_items_master() to service_role;

revoke all on function public.guard_item_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_item_update_by_role() to service_role;

revoke all on function public.guard_kit_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_kit_update_by_role() to service_role;

revoke all on function public.guard_borrow_transaction_update() from public, anon, authenticated;
grant execute on function public.guard_borrow_transaction_update() to service_role;

revoke all on function public.guard_vault_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_vault_update_by_role() to service_role;

revoke all on function public.guard_delivery_update_by_role() from public, anon, authenticated;
grant execute on function public.guard_delivery_update_by_role() to service_role;

revoke all on function public.before_insert_internal_requests() from public, anon, authenticated;
grant execute on function public.before_insert_internal_requests() to service_role;

commit;
