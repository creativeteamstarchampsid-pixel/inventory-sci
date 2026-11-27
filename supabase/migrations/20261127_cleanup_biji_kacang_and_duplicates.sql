-- ============================================================================
-- StarOps Inventory — Follow-up Data Cleanup: Biji/Kacang-Kacangan & Remaining
-- Same-Room Duplicates / Variant Families (Non-Destructive + Barcode Aliases)
-- Date: 2026-11-27
-- ============================================================================

-- 1) Safety backup snapshot before this cleanup pass
INSERT INTO public.inventory_migration_backups (label, items_snapshot, kits_snapshot)
SELECT
  'pre_biji_kacang_cleanup_20261127',
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.item_code) FROM public.items_master i WHERE i.deleted_at IS NULL),
    '[]'::jsonb
  ),
  COALESCE(
    (SELECT jsonb_agg(to_jsonb(k) ORDER BY k.kit_code) FROM public.item_kits k WHERE k.deleted_at IS NULL),
    '[]'::jsonb
  )
WHERE NOT EXISTS (
  SELECT 1 FROM public.inventory_migration_backups WHERE label = 'pre_biji_kacang_cleanup_20261127'
);

-- ============================================================================
-- 2) BIJI & KACANG-KACANGAN (SENSORY PLAY) — GDG / HBP
--    Unify standalone Biji Jagung (SC-HBP-GDG-0004) into Parent SC-HBP-GDG-0079
--    alongside Biji Kacang Merah, Hijau, Kedelai (total 2000 gr, 4 Sub-Items).
-- ============================================================================
UPDATE public.items_master
SET
  name = 'Biji & Kacang-Kacangan (Sensory Play)',
  description = 'Parent Item biji-bijian & kacang-kacangan sensory play (Biji Kacang Merah, Biji Kacang Hijau, Biji Kacang Kedelai, Biji Jagung).',
  has_sub_items = true,
  updated_at = now()
WHERE id = '6fcf544a-7430-4770-8f56-32c5ee625d28'
  AND deleted_at IS NULL;

UPDATE public.items_master
SET
  parent_item_id = '6fcf544a-7430-4770-8f56-32c5ee625d28',
  has_sub_items = false,
  min_stock_threshold = 0,
  updated_at = now()
WHERE id = 'ae54971b-7561-4c8b-9df7-bd942a84d1dd'
  AND deleted_at IS NULL;

-- ============================================================================
-- 3) KARET GELANG & KARET RAMBUT WARNA-WARNI — GDG / HBP
--    6 overlapping rows across L26/CS/IH -> 1 Parent (SC-HBP-GDG-0030)
--    + 3 distinct Sub-Items (0075 Besar, 0074 Kecil, 0031 Karet Rambut Kecil)
--    + 2 exact duplicates soft-deleted with barcode aliases (0009->0075, 0010->0074).
-- ============================================================================
UPDATE public.items_master
SET
  name = 'Karet Gelang & Karet Rambut Warna-Warni',
  unit_label = 'set',
  has_sub_items = true,
  min_stock_threshold = 1,
  description = 'Parent Item Karet Gelang & Karet Rambut warna-warni (Karet Gelang Besar, Karet Gelang Kecil, Karet Rambut Kecil).',
  updated_at = now()
WHERE id = '49974376-c032-4b08-944c-b13cd4cc9b88'
  AND deleted_at IS NULL;

UPDATE public.items_master
SET
  parent_item_id = '49974376-c032-4b08-944c-b13cd4cc9b88',
  has_sub_items = false,
  min_stock_threshold = 0,
  updated_at = now()
WHERE id IN (
  '3cad024c-d096-4f21-bb99-f0d242bbf46c', -- SC-HBP-GDG-0075 Karet Gelang Warna-Warni Besar
  '69e3f0fc-e66f-440d-824a-beabf03cd00a', -- SC-HBP-GDG-0074 Karet Gelang Warna-Warni Kecil
  '40bd14a7-bdb5-451e-ae27-8b7368584ae5'  -- SC-HBP-GDG-0031 Karet rambut warna warni kecil
)
  AND deleted_at IS NULL;

INSERT INTO public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
VALUES
  ('SC-HBP-GDG-0009', '3cad024c-d096-4f21-bb99-f0d242bbf46c', '9a77ac8b-0d82-42fc-888d-5f9f060252ea', 'Rubber Besar', 'MERGED_DUPLICATE', 'Duplikat lintas sheet L26-13 dengan SC-HBP-GDG-0075 (IH-10).'),
  ('SC-HBP-GDG-0010', '69e3f0fc-e66f-440d-824a-beabf03cd00a', 'a97eb355-2601-4b4d-8cfe-8b706029f992', 'Rubber kecil', 'MERGED_DUPLICATE', 'Duplikat lintas sheet L26-14 dengan SC-HBP-GDG-0074 (IH-09).')
ON CONFLICT (alias_code) DO NOTHING;

UPDATE public.items_master
SET deleted_at = now(), updated_at = now()
WHERE id IN (
  '9a77ac8b-0d82-42fc-888d-5f9f060252ea', -- SC-HBP-GDG-0009 Rubber Besar
  'a97eb355-2601-4b4d-8cfe-8b706029f992'  -- SC-HBP-GDG-0010 Rubber kecil
)
  AND deleted_at IS NULL;

-- ============================================================================
-- 4) EXACT CROSS-SHEET DUPLICATES IN GDG (A25 / L26 vs IM)
--    Soft-delete confirmed duplicate rows & register barcode aliases.
-- ============================================================================

-- 4a) Hula Hoop: A25-09 (5 pcs) + L26-05 ADDITIONAL (10 pcs) = IM-24 (15 set, 8 batang/set)
UPDATE public.items_master
SET
  purchase_price = CASE WHEN purchase_price = 0 THEN 73624 ELSE purchase_price END,
  description = '[ID: IM-24 | Gabungan A25-09 (5 pcs) + L26-05 (10 pcs) = 15 set] — Hula hoop copot pasang 8 batang/set | Status Asli: Baik',
  updated_at = now()
WHERE id = '63d4bff6-f12b-47d7-a3c0-eb70f51dc5fd' -- SC-MTR-GDG-0034
  AND deleted_at IS NULL;

INSERT INTO public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
VALUES
  ('SC-MTR-GDG-0001', '63d4bff6-f12b-47d7-a3c0-eb70f51dc5fd', '96b3cb16-8628-4820-b2f1-2339c574150d', 'Hula Hoop (A25-09)', 'MERGED_DUPLICATE', 'Bagian dari total 15 set Hulahoop SC-MTR-GDG-0034 (5 + 10 = 15).'),
  ('SC-MTR-GDG-0004', '63d4bff6-f12b-47d7-a3c0-eb70f51dc5fd', 'cc51d5a8-f051-4dde-8f78-dfb25aa242c6', 'Hula Hoop (L26-05)', 'MERGED_DUPLICATE', 'Bagian dari total 15 set Hulahoop SC-MTR-GDG-0034 (5 + 10 = 15).')
ON CONFLICT (alias_code) DO NOTHING;

UPDATE public.items_master
SET deleted_at = now(), updated_at = now()
WHERE id IN (
  '96b3cb16-8628-4820-b2f1-2339c574150d', -- SC-MTR-GDG-0001
  'cc51d5a8-f051-4dde-8f78-dfb25aa242c6'  -- SC-MTR-GDG-0004
)
  AND deleted_at IS NULL;

-- 4b) Koin Warna-Warni: L26-38 (3 pack, 150 pcs) vs IM-44 Koin (3 set)
INSERT INTO public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
VALUES
  ('SC-SNS-GDG-0036', '53298f1e-f2c0-485e-9f25-d4213a17fe64', '5ba0ea8a-d97c-48cc-907e-d5b505cc5097', 'Koin (IM-44)', 'MERGED_DUPLICATE', 'Duplikat lintas sheet IM-44 dengan SC-SNS-GDG-0013 (Koin Warna-Warni 3 pack).')
ON CONFLICT (alias_code) DO NOTHING;

UPDATE public.items_master
SET deleted_at = now(), updated_at = now()
WHERE id = '5ba0ea8a-d97c-48cc-907e-d5b505cc5097'
  AND deleted_at IS NULL;

-- 4c) Celengan Koin terbuka: L26-32 (2 pcs) vs IM-43 Celengan (2 pcs)
INSERT INTO public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
VALUES
  ('SC-FRN-GDG-0020', 'b41f10a1-1018-49a2-828d-ee487598e46b', '635d33c5-f9e5-45fe-9617-fea7d93b49aa', 'Celengan (IM-43)', 'MERGED_DUPLICATE', 'Duplikat lintas sheet IM-43 dengan SC-FRN-GDG-0013 (Celengan Koin terbuka 2 pcs).')
ON CONFLICT (alias_code) DO NOTHING;

UPDATE public.items_master
SET deleted_at = now(), updated_at = now()
WHERE id = '635d33c5-f9e5-45fe-9617-fea7d93b49aa'
  AND deleted_at IS NULL;

-- 4d) Cetakan Pasir: L26-22 (1 set) vs IM-40 (2 set) -> keep IM-40 (2 set) + preserve details
UPDATE public.items_master
SET
  description = '[ID: IM-40 | Gabungan L26-22] — Cetakan pasir bentuk hewan, dsb (Qty Masuk: 2 set) | Status Asli: Baik',
  updated_at = now()
WHERE id = '534f0299-81b7-4eba-ab7f-167c1ee49797' -- SC-SNS-GDG-0033
  AND deleted_at IS NULL;

INSERT INTO public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
VALUES
  ('SC-SNS-GDG-0007', '534f0299-81b7-4eba-ab7f-167c1ee49797', 'f3959ee3-86c9-49d6-a5cd-b2784bd1176b', 'Cetakan Pasir (L26-22)', 'MERGED_DUPLICATE', 'Duplikat lintas sheet L26-22 dengan SC-SNS-GDG-0033 (Cetakan Pasir 2 set).')
ON CONFLICT (alias_code) DO NOTHING;

UPDATE public.items_master
SET deleted_at = now(), updated_at = now()
WHERE id = 'f3959ee3-86c9-49d6-a5cd-b2784bd1176b'
  AND deleted_at IS NULL;

-- 4e) Kerucut ring: L26-62 (2 set, 4 kerucut & 8 ring) vs IM-26 Cone Kerucut Ring (2 set)
INSERT INTO public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
VALUES
  ('SC-MTR-GDG-0035', 'c9d272dc-211b-4933-8715-4d61c943e34b', '22b03b6e-bb06-4887-9253-f37125620acc', 'Cone Kerucut Ring (IM-26)', 'MERGED_DUPLICATE', 'Duplikat lintas sheet IM-26 dengan SC-MTR-GDG-0020 (Kerucut ring 2 set).')
ON CONFLICT (alias_code) DO NOTHING;

UPDATE public.items_master
SET deleted_at = now(), updated_at = now()
WHERE id = '22b03b6e-bb06-4887-9253-f37125620acc'
  AND deleted_at IS NULL;

-- ============================================================================
-- 5) CLEAR VARIANT FAMILIES -> PARENT + SUB-ITEMS (Zero Data Loss)
-- ============================================================================

-- 5a) Baskom (Gudang) — SC-FRN-GDG-0022 (4 distinct baskets: 6 + 3 + 2 + 2 = 13 pcs)
INSERT INTO public.items_master (
  item_code, name, category_prefix, category, asset_type, room_code, rack_location,
  stock_qty, unit_label, min_stock_threshold, total_parts, current_parts,
  condition, hygiene_status, has_sub_items, description
)
SELECT
  'SC-FRN-GDG-0022', 'Baskom (Gudang)', 'FRN', 'Furniture & Peralatan', 'FIXED_ASSET', 'GDG', 'Storage Room',
  0, 'pcs', 0, 1, 1,
  'BAIK', 'STERIL', true, 'Parent Item koleksi Baskom Gudang (Baskom Air & Baskom Persegi).'
WHERE NOT EXISTS (SELECT 1 FROM public.items_master WHERE item_code = 'SC-FRN-GDG-0022');

UPDATE public.items_master
SET
  name = CASE id
    WHEN '7185b53f-aa85-45f2-bf54-6187daeba5f9'::uuid THEN 'Baskom Air (Hijau/Ungu/Pink)'
    WHEN 'a8cf19e4-4c24-4565-a03d-69393c5e4d05'::uuid THEN 'Baskom Air (Merah/Biru/Hijau)'
    WHEN '70c5550b-e5c1-4310-b078-0512b97b3cfa'::uuid THEN 'Baskom Persegi (30x20x9cm)'
    WHEN '3153778d-6460-436f-9257-d9e8d5bf4704'::uuid THEN 'Baskom Persegi XL (50x38x15cm)'
    ELSE name
  END,
  parent_item_id = (SELECT id FROM public.items_master WHERE item_code = 'SC-FRN-GDG-0022' LIMIT 1),
  has_sub_items = false,
  updated_at = now()
WHERE id IN (
  '7185b53f-aa85-45f2-bf54-6187daeba5f9',
  'a8cf19e4-4c24-4565-a03d-69393c5e4d05',
  '70c5550b-e5c1-4310-b078-0512b97b3cfa',
  '3153778d-6460-436f-9257-d9e8d5bf4704'
)
  AND deleted_at IS NULL;

-- 5b) Cone Ring (Gudang) — SC-MTR-GDG-0048 (Kecil 2 set + Besar 2 set = 4 set)
INSERT INTO public.items_master (
  item_code, name, category_prefix, category, asset_type, room_code, rack_location,
  stock_qty, unit_label, min_stock_threshold, total_parts, current_parts,
  condition, hygiene_status, has_sub_items, description
)
SELECT
  'SC-MTR-GDG-0048', 'Cone Ring (Gudang)', 'MTR', 'Alat Terapi Motorik', 'THERAPY_TOY', 'GDG', 'Storage Room',
  0, 'set', 0, 1, 1,
  'BAIK', 'STERIL', true, 'Parent Item Cone Ring motorik (Cone Ring Kecil & Cone Ring Besar).'
WHERE NOT EXISTS (SELECT 1 FROM public.items_master WHERE item_code = 'SC-MTR-GDG-0048');

UPDATE public.items_master
SET
  parent_item_id = (SELECT id FROM public.items_master WHERE item_code = 'SC-MTR-GDG-0048' LIMIT 1),
  has_sub_items = false,
  updated_at = now()
WHERE id IN (
  'f270a273-7cde-4a74-a17c-c946212f0a29', -- SC-MTR-GDG-0005 Cone ring kecil
  '677fd08b-efc4-4880-9df8-b22094beb84d'  -- SC-MTR-GDG-0006 Cone Ring Besar
)
  AND deleted_at IS NULL;

-- 5c) Buku Seri Emosi & Karakter (Gudang) — SC-WCR-GDG-0021 (9 books IB-01..09 = 9 pcs)
INSERT INTO public.items_master (
  item_code, name, category_prefix, category, asset_type, room_code, rack_location,
  stock_qty, unit_label, min_stock_threshold, total_parts, current_parts,
  condition, hygiene_status, has_sub_items, description
)
SELECT
  'SC-WCR-GDG-0021', 'Buku Seri Emosi & Karakter (Gudang)', 'WCR', 'Alat Terapi Wicara & Kognitif', 'THERAPY_TOY', 'GDG', 'Office Storage',
  0, 'pcs', 0, 1, 1,
  'BAIK', 'STERIL', true, 'Parent Item 9 judul Buku Seri Emosi & Karakter stok Gudang (Marah, Senang, Terima Kasih, Takut, Berbagi, Tolong, Sedih, Empati, Tangguh).'
WHERE NOT EXISTS (SELECT 1 FROM public.items_master WHERE item_code = 'SC-WCR-GDG-0021');

UPDATE public.items_master
SET
  parent_item_id = (SELECT id FROM public.items_master WHERE item_code = 'SC-WCR-GDG-0021' LIMIT 1),
  has_sub_items = false,
  updated_at = now()
WHERE id IN (
  '48dc2a7e-84a8-4a5c-a316-2654b5b8d350', -- Marah
  'f484ef1b-5b8d-4b29-9546-0f33ea929547', -- Senang
  '3eaa4c85-48e7-4c19-9aae-5484c8d3765b', -- Terima Kasih
  '10972fda-1c94-47dd-9ac7-b7775fbef26c', -- Takut
  '35cf4a2f-048d-41e3-8194-09ebb96aab94', -- Berbagi
  '0344a578-6596-440e-b66b-8cb923153d95', -- Tolong
  '27e62cf8-d0e2-47e8-8ad7-231b310a0b6a', -- Sedih
  '02347625-b8c0-4f94-9b06-b80bd748d017', -- Empati
  'e35b408c-0b45-4d48-99f0-f1f54a8358b4'  -- Tangguh
)
  AND deleted_at IS NULL;

-- 5d) Lakban Warna-Warni (R03) — SC-ATK-R03-0011 (Besar 4 pcs + Sedang 3 pcs = 7 pcs)
INSERT INTO public.items_master (
  item_code, name, category_prefix, category, asset_type, room_code, rack_location,
  stock_qty, unit_label, min_stock_threshold, total_parts, current_parts,
  condition, hygiene_status, has_sub_items, description
)
SELECT
  'SC-ATK-R03-0011', 'Lakban Warna-Warni', 'ATK', 'ATK & Perlengkapan Kreatif', 'CONSUMABLE', 'R03', 'CREATIVE STATION',
  0, 'pcs', 1, 1, 1,
  'BAIK', 'STERIL', true, 'Parent Item Lakban Warna-Warni Creative Station (Ukuran Besar & Sedang).'
WHERE NOT EXISTS (SELECT 1 FROM public.items_master WHERE item_code = 'SC-ATK-R03-0011');

UPDATE public.items_master
SET
  parent_item_id = (SELECT id FROM public.items_master WHERE item_code = 'SC-ATK-R03-0011' LIMIT 1),
  has_sub_items = false,
  min_stock_threshold = 0,
  updated_at = now()
WHERE id IN (
  '8ff1bc72-3dad-4800-b8f9-f7846ac558e5', -- SC-ATK-R03-0005 Lakban Besar Warna Warni
  '464066bb-6724-48e9-a3eb-e86d2af93532'  -- SC-ATK-R03-0006 Lakban Sedang Warna Warni
)
  AND deleted_at IS NULL;

-- 5e) Kursi Anak (Creative Room / R03) — SC-FRN-R03-0007 (Orange 22 + Hijau 8 = 30 pcs)
INSERT INTO public.items_master (
  item_code, name, category_prefix, category, asset_type, room_code, rack_location,
  stock_qty, unit_label, min_stock_threshold, total_parts, current_parts,
  condition, hygiene_status, has_sub_items, description
)
SELECT
  'SC-FRN-R03-0007', 'Kursi Anak (Creative Room)', 'FRN', 'Furniture & Peralatan', 'FIXED_ASSET', 'R03', 'CREATIVE ROOM',
  0, 'pcs', 0, 1, 1,
  'BAIK', 'STERIL', true, 'Parent Item Kursi Anak ruang R03 (Varian Warna Orange & Hijau).'
WHERE NOT EXISTS (SELECT 1 FROM public.items_master WHERE item_code = 'SC-FRN-R03-0007');

UPDATE public.items_master
SET
  parent_item_id = (SELECT id FROM public.items_master WHERE item_code = 'SC-FRN-R03-0007' LIMIT 1),
  has_sub_items = false,
  updated_at = now()
WHERE id IN (
  'cb94557a-b79e-4a52-9898-9194adcccf6b', -- SC-FRN-R03-0002 Kursi anak warna orange
  '4b780703-5ddd-4867-a4c3-7cee2599e081'  -- SC-FRN-R03-0004 Kursi anak warna hijau
)
  AND deleted_at IS NULL;

-- 5f) Bean Bag (Sensory Station / R01) — SC-SNS-R01-0010 (Besar 1 + Biasa 4 = 5 pcs)
INSERT INTO public.items_master (
  item_code, name, category_prefix, category, asset_type, room_code, rack_location,
  stock_qty, unit_label, min_stock_threshold, total_parts, current_parts,
  condition, hygiene_status, has_sub_items, description
)
SELECT
  'SC-SNS-R01-0010', 'Bean Bag (Sensory Station)', 'SNS', 'Alat Terapi Sensori', 'THERAPY_TOY', 'R01', 'Sensory Station',
  0, 'pcs', 0, 1, 1,
  'BAIK', 'STERIL', true, 'Parent Item Bean Bag Sensory Station R01 (Varian Besar & Biasa).'
WHERE NOT EXISTS (SELECT 1 FROM public.items_master WHERE item_code = 'SC-SNS-R01-0010');

UPDATE public.items_master
SET
  parent_item_id = (SELECT id FROM public.items_master WHERE item_code = 'SC-SNS-R01-0010' LIMIT 1),
  has_sub_items = false,
  updated_at = now()
WHERE id IN (
  '590d9cf2-5455-4b2c-92db-5e1315c28f22', -- SC-SNS-R01-0007 Bean Bag Besar
  'cc127295-0646-43e1-8722-3a67af1d0a6e'  -- SC-SNS-R01-0008 Bean Bag Biasa
)
  AND deleted_at IS NULL;

-- ============================================================================
-- 6) RECALCULATE ALL AFFECTED PARENT TOTALS (Safety guarantee)
-- ============================================================================
DO $$
DECLARE
  pid uuid;
BEGIN
  FOR pid IN
    SELECT id FROM public.items_master WHERE deleted_at IS NULL AND has_sub_items = true
  LOOP
    PERFORM public.recalculate_parent_item_stock(pid);
  END LOOP;
END $$;
