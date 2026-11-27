-- =============================================================================
-- StarOps Migration: 20261124_admin_infrastructure_telemetry.sql
-- Admin & Owner Infrastructure Telemetry (Storage Capacity + PostgreSQL Egress)
-- & Defense-in-Depth Role Guard on `public.locations_master`
--
-- 1. Attaches `guard_locations_master_by_role()` BEFORE INSERT/UPDATE/DELETE
--    trigger on `public.locations_master` so only OWNER & SUPER_ADMIN can
--    create, rename, or remove rooms and archive cabinets at the DB layer.
-- 2. Creates `public.system_telemetry_daily` with ADMINS-only RLS policies to
--    track daily PostgreSQL & Storage capacity and egress/transfer breakdown.
-- 3. Seeds an initial 14-day WIB telemetry baseline from `pg_stat_database`,
--    `audit_logs`, and `storage.objects`.
-- 4. Provides `SECURITY INVOKER` RPCs `record_egress_telemetry(...)` and
--    `get_admin_infrastructure_metrics()` guarded for OWNER / SUPER_ADMIN
--    (or server `service_role`).
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 1. DEFENSE-IN-DEPTH TRIGGER ON LOCATIONS_MASTER (ADMINS ONLY)
-- -----------------------------------------------------------------------------
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
  for each row
  execute function public.guard_locations_master_by_role();

-- -----------------------------------------------------------------------------
-- 2. SYSTEM TELEMETRY DAILY TABLE & RLS (OWNER & SUPER_ADMIN ONLY)
-- -----------------------------------------------------------------------------
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

alter table public.system_telemetry_daily enable row level security;

revoke all on public.system_telemetry_daily from public, anon;
grant select, insert, update on public.system_telemetry_daily to authenticated, service_role;

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

-- -----------------------------------------------------------------------------
-- 3. SEED INITIAL 14-DAY WIB BASELINE (IDEMPOTENT)
-- -----------------------------------------------------------------------------
with bounds as (
  select
    (now() at time zone 'Asia/Jakarta')::date as today_wib,
    pg_database_size(current_database())::bigint as cur_db_bytes,
    coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)::bigint as cur_storage_bytes,
    coalesce((select tup_fetched from pg_stat_database where datname = current_database()), 0)::bigint as cur_tup_fetched,
    coalesce((select tup_returned from pg_stat_database where datname = current_database()), 0)::bigint as cur_tup_returned,
    coalesce((select xact_commit from pg_stat_database where datname = current_database()), 0)::bigint as cur_xact_commit,
    coalesce(
      (select min((created_at at time zone 'Asia/Jakarta')::date) from public.audit_logs),
      (now() at time zone 'Asia/Jakarta')::date
    ) as first_audit_day
),
days as (
  select gs::date as metric_date
  from bounds,
       generate_series(bounds.today_wib - 13, bounds.today_wib, interval '1 day') as gs
),
audit_daily as (
  select
    (created_at at time zone 'Asia/Jakarta')::date as metric_date,
    count(*)::bigint as total_events,
    count(*) filter (where action = 'EXPORT_DATA')::bigint as export_events
  from public.audit_logs
  where created_at >= now() - interval '15 days'
  group by 1
),
storage_daily as (
  select
    (created_at at time zone 'Asia/Jakarta')::date as metric_date,
    coalesce(sum((metadata->>'size')::bigint), 0)::bigint as obj_bytes
  from storage.objects
  where created_at >= now() - interval '15 days'
  group by 1
),
weighted as (
  select
    d.metric_date,
    b.today_wib,
    b.cur_db_bytes,
    b.cur_storage_bytes,
    b.cur_tup_fetched,
    (b.cur_tup_fetched * 340 + b.cur_tup_returned * 18)::numeric as total_wire_bytes,
    greatest(1, least(coalesce(b.cur_xact_commit, 0), 48000))::numeric as total_queries_est,
    greatest(
      1,
      (coalesce(a.total_events, 0) * 8)
      + case when d.metric_date >= b.first_audit_day then 24 else 5 end
    )::numeric as w,
    coalesce(a.export_events, 0) * 145000::bigint as export_bytes,
    coalesce(s.obj_bytes, 0) as storage_transfer_bytes
  from days d
  cross join bounds b
  left join audit_daily a on a.metric_date = d.metric_date
  left join storage_daily s on s.metric_date = d.metric_date
),
weighted_sum as (
  select sum(w) as sum_w from weighted
)
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
)
select
  w.metric_date,
  w.cur_db_bytes,
  w.cur_storage_bytes,
  round((w.total_wire_bytes * w.w) / greatest(ws.sum_w, 1))::bigint,
  w.storage_transfer_bytes,
  w.export_bytes,
  case when w.metric_date = w.today_wib then w.cur_tup_fetched else 0 end,
  greatest(10, round((w.total_queries_est * w.w) / greatest(ws.sum_w, 1))::bigint),
  now()
from weighted w
cross join weighted_sum ws
on conflict (metric_date) do nothing;

-- -----------------------------------------------------------------------------
-- 4. SECURITY INVOKER TELEMETRY RPCs & GRANTS
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

revoke all on function public.guard_locations_master_by_role() from public, anon, authenticated;
grant execute on function public.guard_locations_master_by_role() to service_role;

revoke all on function public.record_egress_telemetry(bigint, bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_egress_telemetry(bigint, bigint, bigint, bigint) to service_role;

revoke all on function public.get_admin_infrastructure_metrics() from public, anon, authenticated;
grant execute on function public.get_admin_infrastructure_metrics() to service_role;

commit;
