-- =============================================================================
-- StarOps Migration: 20261127_barcode_label_presets.sql
-- Saved Organization Presets for Barcode & Label Print Studio
--
-- 1. Creates `public.barcode_label_presets` to persist reusable label layouts
--    (thermal sizes, A4 multi-grid, archive spine, QR size/payload, toggled
--    fields) with a single optional organization-wide default preset.
-- 2. Enforces at most one default preset via partial unique index
--    `idx_barcode_label_presets_single_default`, adds covering FK indexes on
--    `created_by` and `updated_by`, and attaches `trg_barcode_label_presets_updated_at`.
-- 3. Enables RLS strictly for active `OWNER` and `SUPER_ADMIN` users using
--    `(select ...)` InitPlan-friendly wrappers and revokes public/anon access.
-- 4. Idempotently seeds 3 starter presets only when the table is empty.
-- =============================================================================

begin;

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

-- Seed 3 built-in organization starter presets (idempotent: only when empty)
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

commit;
