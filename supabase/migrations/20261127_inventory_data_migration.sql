-- =============================================================================
-- StarOps Data Migration: Backup, Hierarchy Grouping & Safe Duplicate Mapping
-- Date: 2026-11-27
-- =============================================================================

do $$
declare
  v_batch_id uuid;
  v_kacang_parent_id uuid;
  v_buffalo_parent_id uuid;
  v_origami_parent_id uuid;
  v_sedotan_parent_id uuid;
  v_koral_parent_id uuid;
  v_dressing_parent_id uuid;
  v_puzzle_gdg_parent_id uuid;
  v_buku_emosi_r03_id uuid;
  v_fc3_r03_id uuid;
  v_fc2_r03_id uuid;
  v_cog_puzzle_r03_id uuid;
  v_knob_puzzle_r03_id uuid;
  v_nut_screw_r03_id uuid;
  v_tube_toy_r03_id uuid;
  v_rattle_r03_id uuid;
  v_nobie_puzzle_r03_id uuid;
  v_sub_name text;
begin
  -- ---------------------------------------------------------------------------
  -- 1. PRE-MIGRATION SNAPSHOT BACKUP
  -- ---------------------------------------------------------------------------
  insert into public.inventory_migration_backups (label, items_snapshot, kits_snapshot)
  select
    'pre_hierarchy_and_dedup_20261127',
    coalesce((select jsonb_agg(to_jsonb(i) order by i.item_code) from public.items_master i), '[]'::jsonb),
    coalesce((select jsonb_agg(to_jsonb(k) order by k.kit_code) from public.item_kits k), '[]'::jsonb)
  returning batch_id into v_batch_id;

  -- ---------------------------------------------------------------------------
  -- 2. GDG PARENT ITEMS & SUB-ITEMS (12 PARENT GROUPS)
  -- ---------------------------------------------------------------------------

  -- 2.1 Playdough (Fun Doh) — Reuse SC-HBP-GDG-0008 as Parent + 17 verified Sub-Items
  update public.items_master
  set name = 'Playdough (Fun Doh)',
      unit_label = 'toples',
      has_sub_items = true,
      rack_location = 'Storage Room',
      description = 'Parent Item Playdough (7 toples besar & 10 toples kecil hasil opname fisik 27 Nov 2026).'
  where id = '94a96444-53f6-4448-8033-228b431da4a5';

  -- Reuse existing SC-HBP-GDG-0008-A ("Fundoh merah") as Toples Besar - Merah (qty = 1)
  update public.items_master
  set parent_item_id = '94a96444-53f6-4448-8033-228b431da4a5',
      has_sub_items = false,
      name = 'Playdough Toples Besar - Merah',
      unit_label = 'toples',
      stock_qty = 1,
      min_stock_threshold = 0,
      rack_location = 'Storage Room',
      description = 'Playdough toples besar warna merah (hasil opname 27 Nov 2026).'
  where id = '635104ea-8fe5-44a8-998d-a1ce46662e96';

  foreach v_sub_name in array array[
    'Playdough Toples Besar - Kuning',
    'Playdough Toples Besar - Hijau',
    'Playdough Toples Besar - Biru',
    'Playdough Toples Besar - Putih',
    'Playdough Toples Besar - Pink',
    'Playdough Toples Besar - Oren',
    'Playdough Toples Kecil - Merah',
    'Playdough Toples Kecil - Kuning',
    'Playdough Toples Kecil - Biru',
    'Playdough Toples Kecil - Hitam',
    'Playdough Toples Kecil - Oren',
    'Playdough Toples Kecil - Pink',
    'Playdough Toples Kecil - Putih',
    'Playdough Toples Kecil - Coklat',
    'Playdough Toples Kecil - Ungu',
    'Playdough Toples Kecil - Hijau'
  ]
  loop
    insert into public.items_master (
      parent_item_id, has_sub_items, barcode_format, name, description,
      category_prefix, category, asset_type, room_code, rack_location,
      total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
      condition, hygiene_status
    )
    values (
      '94a96444-53f6-4448-8033-228b431da4a5', false, 'CODE128', v_sub_name,
      'Varian Playdough hasil opname fisik 27 Nov 2026.',
      'HBP', 'Barang Habis Pakai', 'CONSUMABLE', 'GDG', 'Storage Room',
      1, 1, 'toples', 1, 0, 'BAIK', 'STERIL'
    );
  end loop;

  -- Soft-delete duplicate Playdough sheet rows + map barcode aliases
  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Digabung ke Parent SC-HBP-GDG-0008 Playdough]'
  where id = '145b10f9-15b5-43d4-a5db-ed8edbcfb7d4'
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values
    ('SC-HBP-GDG-0020', '94a96444-53f6-4448-8033-228b431da4a5', '145b10f9-15b5-43d4-a5db-ed8edbcfb7d4', 'Play Doh / Fun Doh', 'MERGED_DUPLICATE', 'Duplikat sheet Consumables 2026 dialihkan ke Parent Playdough (Fun Doh).'),
    ('SC-HBP-GDG-0066', '94a96444-53f6-4448-8033-228b431da4a5', 'ceead4ac-3d71-4ead-ae42-4bd2ca0ea623', 'Fun-Doh / Playdough', 'MERGED_DUPLICATE', 'Barcode lama Fun-Doh IH-01 dialihkan ke Parent Playdough (Fun Doh).')
  on conflict (alias_code) do nothing;

  -- 2.2 Magic Sand — Reuse SC-HBP-GDG-0006 as Parent + reparent 6 color jars
  update public.items_master
  set name = 'Magic Sand',
      unit_label = 'toples',
      has_sub_items = true,
      description = 'Parent Item Magic Sand (6 varian warna kemasan 1kg).'
  where id = '4f9e8a98-559a-4930-9383-8d717cdeaece';

  update public.items_master
  set parent_item_id = '4f9e8a98-559a-4930-9383-8d717cdeaece',
      has_sub_items = false,
      unit_label = 'toples',
      min_stock_threshold = 0
  where id in (
    '567e9e62-124d-4368-8e30-ab5adc4392b3', -- Merah 0035
    '16c111ce-7c3b-4839-907c-b522a1ccdaa4', -- Kuning 0036
    'b8e3eb5e-14b9-463c-8508-628a1b91c1c9', -- Biru 0037
    '58aa2d11-75c6-4491-bfff-1c9e6596ba50', -- Hijau 0038
    '295e4db0-b998-4ef2-a99b-b211864e62ba', -- Pink 0039
    'd436394b-ef99-4c31-a1ce-8647a0b64cc2'  -- Oren 0040
  );

  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Digabung ke Parent SC-HBP-GDG-0006 Magic Sand]'
  where id = '304eff83-126d-4f49-971d-e2e4f9e4e19b'
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values (
    'SC-HBP-GDG-0064',
    '4f9e8a98-559a-4930-9383-8d717cdeaece',
    '304eff83-126d-4f49-971d-e2e4f9e4e19b',
    'Magic Sand Warna-Warni',
    'MERGED_DUPLICATE',
    'Entri ringkasan duplikat Magic Sand Warna-Warni dialihkan ke Parent Magic Sand.'
  )
  on conflict (alias_code) do nothing;

  -- Keep KIT-GDG-01 functional with active Magic Sand jars only (no soft-deleted 0064 or double-counted Parent 0006)
  update public.item_kits
  set bundled_item_ids = array[
    '567e9e62-124d-4368-8e30-ab5adc4392b3'::uuid,
    '16c111ce-7c3b-4839-907c-b522a1ccdaa4'::uuid,
    'b8e3eb5e-14b9-463c-8508-628a1b91c1c9'::uuid,
    '58aa2d11-75c6-4491-bfff-1c9e6596ba50'::uuid,
    '295e4db0-b998-4ef2-a99b-b211864e62ba'::uuid,
    'd436394b-ef99-4c31-a1ce-8647a0b64cc2'::uuid
  ]
  where kit_code = 'KIT-GDG-01';

  -- 2.3 Kacang (Sensory Play) — New Parent in GDG
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Kacang (Sensory Play)',
    'Parent Item biji kacang sensory play (Kacang Hijau, Kacang Merah, Kacang Kedelai).',
    'HBP', 'Barang Habis Pakai', 'CONSUMABLE', 'GDG', 'Storage Room',
    1, 1, 'gr', 0, 1, 'BAIK', 'STERIL'
  )
  returning id into v_kacang_parent_id;

  update public.items_master
  set parent_item_id = v_kacang_parent_id,
      has_sub_items = false,
      min_stock_threshold = 0
  where id in (
    'c3769fae-b62b-4b48-b562-ea505b03de0d', -- Biji Kacang Hijau 0003 (500 gr)
    '6d236085-c690-401c-9aeb-2cc5c0bb67d9', -- Biji Kacang Merah 0002 (500 gr)
    'daa00cd1-8bd8-400d-b172-7a06c8120e35'  -- Biji Kacang Kedelai 0005 (500 gr)
  );

  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Duplikat sheet kacang digabung ke Parent Kacang (Sensory Play)]'
  where id in (
    'c65bcac8-0ff0-4ae4-b46d-5a3ecf3efa26', -- 0068 Kacang Hijau
    '9543a839-aec8-4e7d-b230-c694c0663d1b', -- 0069 Kacang Merah
    '2c87fe98-b126-4139-8785-f305c0680962', -- 0022 Kacang Hijau 500gr DIHAPUSBUKU
    '67833834-0b2d-464f-9568-d63949f0cd1c', -- 0023 Kacang Merah 500gr DIHAPUSBUKU
    '6b1e08f2-2ce6-45bb-a453-257e33b2239e'  -- 0024 Kacang kedelai 500gr DIHAPUSBUKU
  )
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values
    ('SC-HBP-GDG-0068', 'c3769fae-b62b-4b48-b562-ea505b03de0d', 'c65bcac8-0ff0-4ae4-b46d-5a3ecf3efa26', 'Kacang Hijau', 'MERGED_DUPLICATE', 'Duplikat sheet IH-03 dialihkan ke Biji Kacang Hijau.'),
    ('SC-HBP-GDG-0022', 'c3769fae-b62b-4b48-b562-ea505b03de0d', '2c87fe98-b126-4139-8785-f305c0680962', 'Kacang Hijau 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-03 dialihkan ke Biji Kacang Hijau.'),
    ('SC-HBP-GDG-0069', '6d236085-c690-401c-9aeb-2cc5c0bb67d9', '9543a839-aec8-4e7d-b230-c694c0663d1b', 'Kacang Merah', 'MERGED_DUPLICATE', 'Duplikat sheet IH-04 dialihkan ke Biji Kacang Merah.'),
    ('SC-HBP-GDG-0023', '6d236085-c690-401c-9aeb-2cc5c0bb67d9', '67833834-0b2d-464f-9568-d63949f0cd1c', 'Kacang Merah 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-04 dialihkan ke Biji Kacang Merah.'),
    ('SC-HBP-GDG-0024', 'daa00cd1-8bd8-400d-b172-7a06c8120e35', '6b1e08f2-2ce6-45bb-a453-257e33b2239e', 'Kacang kedelai 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-05 dialihkan ke Biji Kacang Kedelai.')
  on conflict (alias_code) do nothing;

  -- 2.4 Beras Warna-Warni — Reuse SC-HBP-GDG-0001 as Parent
  update public.items_master
  set name = 'Beras Warna-Warni',
      unit_label = 'set/kg',
      has_sub_items = true,
      description = 'Parent Item Beras Warna-Warni sensory play (Merah, Hijau, Kuning, Biru).'
  where id = '8ae436ad-aaa1-49f8-b3c1-baca3abdf0bc';

  update public.items_master
  set parent_item_id = '8ae436ad-aaa1-49f8-b3c1-baca3abdf0bc',
      has_sub_items = false,
      unit_label = 'set/kg',
      min_stock_threshold = 0
  where id in (
    '02819864-0ed5-423a-acdd-261966de8a3a', -- Beras Merah 0073
    'bdd734e6-75a2-46b6-a8a8-d6ea5ae19644', -- Beras Hijau 0071
    'd8d4d609-98d7-4f52-8cb0-1bd0496e8c9d', -- Beras Kuning 0072
    'a8139458-a3da-407d-ac45-0b689f7dca7e'  -- Beras Biru 500gr 0027 (DIHAPUSBUKU -> visible sub-item, excluded from usable qty)
  );

  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Duplikat sheet CS-07/09/10 digabung ke varian Beras aktif]'
  where id in (
    'ba0dd7ee-8af3-4fdd-b1e2-33a59319b491', -- 0026
    '8a45ed3a-85ce-4df5-a3f1-0e85e76414ea', -- 0028
    '5d783b39-4e39-4eb6-ad8d-9c25f0b3cac2'  -- 0029
  )
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values
    ('SC-HBP-GDG-0026', '02819864-0ed5-423a-acdd-261966de8a3a', 'ba0dd7ee-8af3-4fdd-b1e2-33a59319b491', 'Beras Merah 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-07 dialihkan ke Beras Merah.'),
    ('SC-HBP-GDG-0028', 'bdd734e6-75a2-46b6-a8a8-d6ea5ae19644', '8a45ed3a-85ce-4df5-a3f1-0e85e76414ea', 'Beras Hijau 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-09 dialihkan ke Beras Hijau.'),
    ('SC-HBP-GDG-0029', 'd8d4d609-98d7-4f52-8cb0-1bd0496e8c9d', '5d783b39-4e39-4eb6-ad8d-9c25f0b3cac2', 'Beras Kuning 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-10 dialihkan ke Beras Kuning.')
  on conflict (alias_code) do nothing;

  -- 2.5 Cat Air Asturo — Reuse SC-HBP-GDG-0007 as Parent + 9 color bottles
  update public.items_master
  set name = 'Cat Air Asturo',
      unit_label = 'pcs',
      has_sub_items = true,
      description = 'Parent Item Cat Air Asturo (9 varian warna).'
  where id = '2b069c41-d0ec-4a6e-a10f-c8cc53075ae7';

  update public.items_master
  set parent_item_id = '2b069c41-d0ec-4a6e-a10f-c8cc53075ae7',
      has_sub_items = false,
      min_stock_threshold = 0
  where id in (
    '93a78dab-d250-402e-94a0-cfce7e572f50', -- 0045 Merah
    '6c255b26-094b-4e60-95ef-3bb43e84e41c', -- 0046 Kuning
    'd16fc55a-e547-40a6-a11a-287e8b0ae3c9', -- 0047 Biru
    'a041d216-d32d-41d2-bb52-ac653d2bca91', -- 0048 Hijau
    'e8000d65-5b53-41d9-a1a0-3d6e611c4481', -- 0049 Oren
    '25e06c15-576a-4869-bb55-28ca9591abe9', -- 0050 Pink
    'e506e6f0-28ff-43ed-9d30-f8550a047bab', -- 0051 Ungu
    'd51cdf3f-6f80-448c-a22e-2887f2027e3e', -- 0052 Hitam
    'fac3c2bb-2fa8-41bd-b070-aeba6f0826db'  -- 0053 Putih
  );

  -- 2.6 Kertas Buffalo F4 — New Parent + 3 color packs
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Kertas Buffalo F4',
    'Parent Item Kertas Buffalo F4 (Biru, Hijau, Putih @ 100 lembar/pack).',
    'HBP', 'Barang Habis Pakai', 'CONSUMABLE', 'GDG', 'Storage Room',
    1, 1, 'pack', 0, 1, 'BAIK', 'STERIL'
  )
  returning id into v_buffalo_parent_id;

  update public.items_master
  set parent_item_id = v_buffalo_parent_id,
      has_sub_items = false,
      min_stock_threshold = 0
  where id in (
    '29a21611-f970-44d1-81d7-2775a1cf0c01', -- 0058 Biru
    'b57cd9c1-2839-450f-b8f8-f45a182a4a02', -- 0057 Hijau
    '939684d7-09bc-4339-9813-a63d84267b07'  -- 0059 Putih
  );

  -- 2.7 Kertas Origami — New Parent + 3 size packs (preserving Rizka opname today!)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Kertas Origami',
    'Parent Item Kertas Origami (Kecil 12x12cm, Sedang 14x14cm, Besar 16x16cm).',
    'HBP', 'Barang Habis Pakai', 'CONSUMABLE', 'GDG', 'Storage Room',
    1, 1, 'pack', 0, 1, 'BAIK', 'STERIL'
  )
  returning id into v_origami_parent_id;

  update public.items_master
  set parent_item_id = v_origami_parent_id,
      has_sub_items = false,
      min_stock_threshold = 0
  where id in (
    'f1e762ba-33cc-4e2b-b28e-abf446802157', -- 0054 Kecil
    '82f6d250-913c-4834-adda-9a2a111f1365', -- 0055 Sedang
    '4a2803e3-a933-4e8e-abf2-3582e2450e16'  -- 0056 Besar
  );

  -- 2.8 Waterbeads — Reuse SC-HBP-GDG-0021 as Parent + 3 size variants
  update public.items_master
  set name = 'Waterbeads',
      unit_label = 'pack',
      has_sub_items = true,
      description = 'Parent Item Waterbeads (Kecil, Sedang, Jumbo).'
  where id = '9f0dde99-033c-422a-ad71-01dd3bdcc17f';

  update public.items_master
  set parent_item_id = '9f0dde99-033c-422a-ad71-01dd3bdcc17f',
      has_sub_items = false,
      unit_label = 'pack',
      min_stock_threshold = 0
  where id in (
    '649f25e6-79fd-4c1c-8570-2397e3511f3f', -- 0013 Kecil
    '02e5ae9e-d75d-4e34-a6b7-2d9368cc3edb', -- 0014 Sedang
    'a55a5716-15a4-4939-8a1b-646547a6900a'  -- 0012 Jumbo
  );

  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Duplikat ringkasan IH-02 digabung ke Parent Waterbeads]'
  where id = 'cc36f612-5b11-4bb0-8abe-da025903584b'
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values (
    'SC-HBP-GDG-0067',
    '9f0dde99-033c-422a-ad71-01dd3bdcc17f',
    'cc36f612-5b11-4bb0-8abe-da025903584b',
    'Waterbeads (Kecil, Sedang & Besar)',
    'MERGED_DUPLICATE',
    'Entri ringkasan IH-02 dialihkan ke Parent Waterbeads.'
  )
  on conflict (alias_code) do nothing;

  -- 2.9 Sedotan Warna-Warni — New Parent + 3 variants
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Sedotan Warna-Warni',
    'Parent Item Sedotan Warna-Warni (Besar, Kecil, Bubble).',
    'HBP', 'Barang Habis Pakai', 'CONSUMABLE', 'GDG', 'Storage Room',
    1, 1, 'pack', 0, 1, 'BAIK', 'STERIL'
  )
  returning id into v_sedotan_parent_id;

  update public.items_master
  set parent_item_id = v_sedotan_parent_id,
      has_sub_items = false,
      unit_label = 'pack',
      min_stock_threshold = 0
  where id in (
    '283c957f-927e-4fa2-8e0b-0b9b1807e64d', -- 0041 Besar
    'a6bdb489-36aa-4267-b4ad-037426bdcde1', -- 0042 Kecil
    'a7a18e89-41fa-42a8-a839-f14be21ec846'  -- 0011 Bubble
  );

  update public.items_master
  set name = 'Sedotan Bubble Warna-Warni'
  where id = 'a7a18e89-41fa-42a8-a839-f14be21ec846';

  -- 2.10 Batu Koral (Sensory) — New Parent + 2 color bags + deduplicate CS-42/43
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Batu Koral (Sensory)',
    'Parent Item Batu Koral terapi sensorik (Hitam 10kg & Putih 10kg).',
    'HBP', 'Barang Habis Pakai', 'CONSUMABLE', 'GDG', 'Storage Room',
    1, 1, 'karung', 0, 1, 'BAIK', 'STERIL'
  )
  returning id into v_koral_parent_id;

  update public.items_master
  set parent_item_id = v_koral_parent_id,
      has_sub_items = false,
      min_stock_threshold = 0
  where id in (
    '361560b4-c163-41e4-94bb-37e8b25dbe1f', -- 0016 Hitam
    '48e12ef3-0685-478e-97fe-dcf5fe71a3ef'  -- 0015 Putih
  );

  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Duplikat sheet CS-42/43 digabung ke Batu Koral aktif]'
  where id in (
    'b52c5293-6445-4116-a30a-b716c18365a8', -- 0061 Hitam CS-42
    'a4c5b5e6-4f2f-4d77-aeaf-b85a4c963392'  -- 0062 Putih CS-43
  )
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values
    ('SC-HBP-GDG-0061', '361560b4-c163-41e4-94bb-37e8b25dbe1f', 'b52c5293-6445-4116-a30a-b716c18365a8', 'Batu Koral hitam besar 9-10kg', 'MERGED_DUPLICATE', 'Duplikat CS-42 dialihkan ke Batu koral hitam.'),
    ('SC-HBP-GDG-0062', '48e12ef3-0685-478e-97fe-dcf5fe71a3ef', 'a4c5b5e6-4f2f-4d77-aeaf-b85a4c963392', 'Batu koral putih sedang 9-10kg', 'MERGED_DUPLICATE', 'Duplikat CS-43 dialihkan ke Batu koral putih.')
  on conflict (alias_code) do nothing;

  -- 2.11 Dressing Frame (GDG) — New Parent + Medium & Large
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Dressing Frame',
    'Parent Item Dressing Frame motorik halus (Medium & Large).',
    'MTR', 'Motorik Halus', 'THERAPY_TOY', 'GDG', 'Storage',
    1, 1, 'set', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_dressing_parent_id;

  update public.items_master
  set parent_item_id = v_dressing_parent_id,
      has_sub_items = false,
      name = 'Dressing Frame - Medium'
  where id = '2a3f0505-94f4-41ca-9aa8-2a23c968d9ce';

  update public.items_master
  set parent_item_id = v_dressing_parent_id,
      has_sub_items = false,
      name = 'Dressing Frame - Large'
  where id = '8de38d26-4d98-46a4-a0e0-58264b423332';

  -- 2.12 Puzzle Edukasi (Gudang) — New Parent + Hewan, Transportasi, Buah
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Puzzle Edukasi (Gudang)',
    'Parent Item koleksi Puzzle Edukasi di Gudang (Hewan, Transportasi, Buah).',
    'MTR', 'Motorik Halus', 'THERAPY_TOY', 'GDG', 'Office Storage',
    1, 1, 'set', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_puzzle_gdg_parent_id;

  update public.items_master
  set parent_item_id = v_puzzle_gdg_parent_id,
      has_sub_items = false
  where id in (
    '33f693ad-40a1-4a56-95cb-25aa1110cb9c', -- Puzzle Hewan 0028
    'ea5f6ba9-f947-4c57-b72c-863788cafa15', -- Puzzle Transportasi 0029
    '95d7185b-f40d-428d-bbc3-b46d10d2d079'  -- Puzzle Buah 0030
  );

  -- ---------------------------------------------------------------------------
  -- 3. R03 (CREATIVE STATION) PARENT ITEMS & SUB-ITEMS (9 PARENT GROUPS)
  -- ---------------------------------------------------------------------------

  -- 3.1 Buku Seri Emosi & Karakter (11 Sub-Items in R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Buku Seri Emosi & Karakter',
    'Parent Item seri 11 buku emosi & karakter (Takut, Marah, Sedih, Senang, Berbagi, Maaf, Tolong, Terima Kasih, Empati, Tangguh, Sikap Baik).',
    'WCR', 'Kognitif/Edukasi', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_buku_emosi_r03_id;

  update public.items_master
  set parent_item_id = v_buku_emosi_r03_id,
      has_sub_items = false
  where id in (
    'd37aa334-377c-45e4-ab8c-0b2c1808f432', -- Takut 0028
    'e612706a-45e9-48df-a448-cd42d704fed0', -- Marah 0029
    '81043ae3-0c3d-42d7-aeaa-197caafe3fe5', -- Sedih 0030
    'f975fae6-3934-4384-9236-8b7ed8802b51', -- Senang 0031
    'b72eb7f8-a65f-45dd-acc2-2f402cf921b9', -- Berbagi 0032
    '79aaf478-2eb7-49c5-aeed-f524bb6e47dc', -- Maaf 0033 (DIHAPUSBUKU)
    'b7ad62f5-f7db-4e3f-85a7-a19fdb33a2aa', -- Tolong 0034
    'b0bae1f1-b392-4a81-b609-68be9b4bc29c', -- Terima Kasih 0035
    'c3af0402-ac22-4d34-85d4-4849feedb8d6', -- Empati 0036
    '6728377b-df9f-4893-91d7-af79622d6f3d', -- Tangguh 0037
    '2fcf8c81-63cd-4146-91be-5d17fb9807b0'  -- Sikap Baik 0038
  );

  -- 3.2 Flashcard Anak 3 Bahasa (9 Sub-Items in R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Flashcard Anak 3 Bahasa',
    'Parent Item seri Flashcard Anak 3 Bahasa (Animals, Sea Animals, Things, Body Parts, Numbers, Transportation, Fruit & Vegs, Food, Colour & Shapes).',
    'WCR', 'Kognitif/Edukasi', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_fc3_r03_id;

  update public.items_master
  set parent_item_id = v_fc3_r03_id,
      has_sub_items = false
  where id in (
    '637d6bab-cca7-49db-96c6-b0c622995ca8', -- 0003
    '4486b864-4990-4986-9256-57cd537b8407', -- 0004
    '9672d529-269c-4d18-9a82-68e574638e0d', -- 0005
    '9fae044f-9bc4-4bda-aec1-63ba02629067', -- 0006
    '95a71292-6c41-4c7c-83b2-6bea94778408', -- 0007 (DIHAPUSBUKU)
    'fc11d329-bc4c-474d-acf1-ef93d501ab7c', -- 0008
    '9ec1bdb3-02c8-41f9-84ce-81a953c848c3', -- 0009
    '0d7e4e93-eac5-4d75-ba82-b0b359bb7bd6', -- 0010
    '89235f3f-a430-490e-88b8-617185ce04b5'  -- 0011
  );

  -- 3.3 Flashcard Anak 2 Bahasa (7 Sub-Items in R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Flashcard Anak 2 Bahasa',
    'Parent Item seri Flashcard Anak 2 Bahasa (7 tema kosakata).',
    'WCR', 'Kognitif/Edukasi', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_fc2_r03_id;

  update public.items_master
  set parent_item_id = v_fc2_r03_id,
      has_sub_items = false
  where id in (
    '1c41b4f5-474e-4187-bc74-9a05a85e0928', -- 0012
    'eaef0e70-f625-4a31-bec8-d79b23917bf0', -- 0016
    'd1117f2e-a50b-4c99-8d23-a7e07d1511cb', -- 0017
    '84dacb6b-7324-4a74-9e31-fb24459f1ab2', -- 0019
    '9d657a2e-76b5-451a-93b9-7a50ff8837e1', -- 0022
    '422d018e-f261-44a6-a715-6cfed807a6d7', -- 0023
    'a3609479-b12f-4dc8-b337-57792ee53f2a'  -- 0024
  );

  -- 3.4 Cognition Puzzle (R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Cognition Puzzle (Seri)',
    'Parent Item Cognition Puzzle R03 (Animal, Transportation, Fruits Vegetables).',
    'WCR', 'Kognitif/Edukasi', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_cog_puzzle_r03_id;

  update public.items_master
  set parent_item_id = v_cog_puzzle_r03_id,
      has_sub_items = false
  where id in (
    '5a0d4c07-c96e-4d28-be57-f23bb6a706d1', -- 0025
    '028585f4-b6f6-4b9d-ace2-b372558170aa', -- 0026
    'd7190697-7b7e-4928-ba2b-39c308f36de3'  -- 0027
  );

  -- 3.5 Wooden Knob Puzzle (R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Wooden Knob Puzzle',
    'Parent Item Wooden Knob Puzzle (Farm, Vehicle, Jungle Animals).',
    'MTR', 'Motorik Halus', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_knob_puzzle_r03_id;

  update public.items_master
  set parent_item_id = v_knob_puzzle_r03_id,
      has_sub_items = false
  where id in (
    '24876510-0012-4d61-9f35-8e9e0833493f', -- 0003 Farm
    'e8291438-0ef9-4043-b226-4bc05967243c', -- 0004 Vehicle
    'f4ed3fe4-30fe-4bd4-b39e-94d664bf9f59'  -- 0005 Jungle Animals
  );

  -- 3.6 Wooden Nut Pairing Screw (R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Wooden Nut Pairing Screw',
    'Parent Item Wooden Nut Pairing Screw (Wild Animals, Ocean Animals, Transportation).',
    'MTR', 'Motorik Halus', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_nut_screw_r03_id;

  update public.items_master
  set parent_item_id = v_nut_screw_r03_id,
      has_sub_items = false
  where id in (
    'eec5e25b-07ed-4e8a-a27a-c3098c7e22a4', -- 0006 Wild Animals
    '69481edf-47f4-4ef7-ada7-74322a5e3024', -- 0007 Ocean Animals
    '7aa6c086-fc07-4835-ab54-0cfd09db0a93'  -- 0008 Transportation
  );

  -- 3.7 Classification Toy (Tube) (R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Classification Toy (Tube)',
    'Parent Item Classification Toy Tube (Cute Animals, Transportation, Undersea).',
    'SNS', 'Sensorik', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_tube_toy_r03_id;

  update public.items_master
  set parent_item_id = v_tube_toy_r03_id,
      has_sub_items = false
  where id in (
    '24642f3d-0616-4c12-a57a-2dc39a687812', -- 0005 Cute Animals
    'e7d1e34b-abb3-41ab-a19e-83ca574c57f9', -- 0006 Transportation
    'cd60be13-ff36-4d44-a62c-d4c3b6310e89'  -- 0007 Undersea
  );

  -- 3.8 Wooden Handle Rattle (R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Wooden Handle Rattle',
    'Parent Item Wooden Handle Rattle (Orange & Yellow).',
    'SNS', 'Sensorik', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_rattle_r03_id;

  update public.items_master
  set parent_item_id = v_rattle_r03_id,
      has_sub_items = false
  where id in (
    '0daea79f-9d0d-4848-805b-0243afb9ffce', -- 0003 Orange
    '7d16ecca-f9be-4dd0-9224-8f7444dc89d0'  -- 0004 Yellow
  );

  -- 3.9 Nobie Puzzle (R03)
  insert into public.items_master (
    has_sub_items, barcode_format, name, description,
    category_prefix, category, asset_type, room_code, rack_location,
    total_parts, current_parts, unit_label, stock_qty, min_stock_threshold,
    condition, hygiene_status
  )
  values (
    true, 'CODE128', 'Nobie Puzzle',
    'Parent Item Nobie Puzzle (Transportasi & Buah-Buahan).',
    'MTR', 'Motorik Halus', 'THERAPY_TOY', 'R03', 'CREATIVE STATION',
    1, 1, 'pcs', 0, 0, 'BAIK', 'STERIL'
  )
  returning id into v_nobie_puzzle_r03_id;

  update public.items_master
  set parent_item_id = v_nobie_puzzle_r03_id,
      has_sub_items = false
  where id in (
    '39817854-dd02-4e2e-b6df-74d17a526d3d', -- 0012 Transportasi
    '45ec613f-ba50-410f-82c4-066694d64417'  -- 0013 Buah-Buahan
  );

  -- ---------------------------------------------------------------------------
  -- 4. CONFIRMED SAME-ROOM EXACT DUPLICATE SIMPLE ITEMS + BARCODE ALIASES
  -- ---------------------------------------------------------------------------
  update public.items_master
  set deleted_at = now(),
      description = coalesce(description, '') || ' [Duplikat sheet GDG terkonfirmasi; dialihkan via alias barcode]'
  where id in (
    'a25320a6-786c-4231-81cc-ffa66a7c063f', -- SC-ATK-GDG-0001 Alas pemotong kertas -> 0003
    '0d925eb8-b8a6-453a-a3f5-d50a76a0029c', -- SC-ATK-GDG-0004 Pensil segitiga -> 0002
    '64b561a8-40a5-48a7-a750-f181d9441db0', -- SC-HBP-GDG-0019 Pasir pantai halus -> 0060
    'fa9912e1-2e39-4ec1-8cd7-3d7cd7006f0c', -- SC-HBP-GDG-0070 Biji Jagung IH-05 -> 0004
    '32998beb-4b48-4295-804b-f2dc03873800', -- SC-HBP-GDG-0025 Biji Jagung 500gr DIHAPUSBUKU -> 0004
    '791f911b-e241-4351-a211-800c88d12094', -- SC-HBP-GDG-0076 Bubble IH-11 -> 0032
    '77747353-582b-428e-a232-a0fcf6968231', -- SC-HBP-GDG-0033 Refill water bubble CS-14 -> 0077
    'cd8b1489-3b50-4373-a15e-b68fac854de8', -- SC-HBP-GDG-0078 Jepitan Warna-Warni -> 0034
    'c7768f31-6fd5-4683-966b-3c357a206c6d', -- SC-MTR-GDG-0012 Capitan warna warni -> 0034
    '4b37db52-ff55-4469-b8b5-0c9ad4b7d76b', -- SC-MTR-GDG-0002 Jepitan qty=0 -> 0034
    '908c09d5-0b85-4ca7-962c-2def9692d989', -- SC-MTR-GDG-0041 Kelereng -> 0018
    'bc65ef7f-fd41-44b4-9ad9-d274de6c1eee', -- SC-SNS-GDG-0031 Mainan Telur -> 0009
    '44b7adde-4f06-44e8-bfbc-41525f758774', -- SC-SNS-GDG-0037 Pompom -> 0003
    '36dfe524-18f4-4f6f-adb1-0555e6cc7d88', -- SC-FRN-GDG-0018 Perlak -> 0010
    'df42f6ae-ff08-4ed7-850f-20b18b47efd4', -- SC-HBP-GDG-0063 Matras Sensory Karet -> 0012
    'd560a182-636c-47cd-bce9-ca3ce56e379b'  -- SC-SNS-GDG-0039 Matras Sensory M/K/B -> 0012
  )
    and deleted_at is null;

  insert into public.item_barcode_aliases (alias_code, target_item_id, legacy_item_id, legacy_name, alias_reason, notes)
  values
    ('SC-ATK-GDG-0001', '1adc5e0e-9bd8-421b-8a6f-1a8697b35fa1', 'a25320a6-786c-4231-81cc-ffa66a7c063f', 'Alas pemotong kertas', 'MERGED_DUPLICATE', 'Duplikat L26-04 dialihkan ke SC-ATK-GDG-0003 (Alas potong kertas A1).'),
    ('SC-ATK-GDG-0004', 'c3fec898-5b9d-4b03-80ad-856ca897a086', '0d925eb8-b8a6-453a-a3f5-d50a76a0029c', 'Pensil segitiga', 'MERGED_DUPLICATE', 'Duplikat L26-68 dialihkan ke SC-ATK-GDG-0002.'),
    ('SC-HBP-GDG-0019', '740b1ec5-1f41-4b97-9ca3-b4c34a6e971f', '64b561a8-40a5-48a7-a750-f181d9441db0', 'Pasir pantai halus', 'MERGED_DUPLICATE', 'Duplikat L26-65 dialihkan ke SC-HBP-GDG-0060.'),
    ('SC-HBP-GDG-0070', 'ae54971b-7561-4c8b-9df7-bd942a84d1dd', 'fa9912e1-2e39-4ec1-8cd7-3d7cd7006f0c', 'Biji Jagung (IH-05)', 'MERGED_DUPLICATE', 'Duplikat IH-05 dialihkan ke SC-HBP-GDG-0004.'),
    ('SC-HBP-GDG-0025', 'ae54971b-7561-4c8b-9df7-bd942a84d1dd', '32998beb-4b48-4295-804b-f2dc03873800', 'Biji Jagung 500gr', 'MERGED_DUPLICATE', 'Entri lama CS-06 dialihkan ke SC-HBP-GDG-0004.'),
    ('SC-HBP-GDG-0076', 'fd024952-57b4-45c2-9d8f-60d074a5c466', '791f911b-e241-4351-a211-800c88d12094', 'Bubble (IH-11)', 'MERGED_DUPLICATE', 'Duplikat IH-11 dialihkan ke SC-HBP-GDG-0032.'),
    ('SC-HBP-GDG-0033', 'ed844ee8-e24a-45eb-a387-be21364730ee', '77747353-582b-428e-a232-a0fcf6968231', 'Refill water bubble', 'MERGED_DUPLICATE', 'Duplikat CS-14 dialihkan ke SC-HBP-GDG-0077 (opname 27 Nov 2026).'),
    ('SC-HBP-GDG-0078', '10e63d6a-c02b-4f4e-a3a4-de41697af9ba', 'cd8b1489-3b50-4373-a15e-b68fac854de8', 'Jepitan Warna-Warni', 'MERGED_DUPLICATE', 'Duplikat IH-13 dialihkan ke SC-HBP-GDG-0034.'),
    ('SC-MTR-GDG-0012', '10e63d6a-c02b-4f4e-a3a4-de41697af9ba', 'c7768f31-6fd5-4683-966b-3c357a206c6d', 'Capitan warna warni', 'MERGED_DUPLICATE', 'Duplikat L26-44 dialihkan ke SC-HBP-GDG-0034.'),
    ('SC-MTR-GDG-0002', '10e63d6a-c02b-4f4e-a3a4-de41697af9ba', '4b37db52-ff55-4469-b8b5-0c9ad4b7d76b', 'Jepitan', 'MERGED_DUPLICATE', 'Duplikat A25-10 (qty 0) dialihkan ke SC-HBP-GDG-0034.'),
    ('SC-MTR-GDG-0041', '5b992054-9e30-47e9-8f2f-ff74489e4217', '908c09d5-0b85-4ca7-962c-2def9692d989', 'Kelereng (1set isi 100pcs)', 'MERGED_DUPLICATE', 'Duplikat IM-34 dialihkan ke SC-MTR-GDG-0018 (Kelereng Marble).'),
    ('SC-SNS-GDG-0031', '9c82a98e-2425-483a-a7f4-7febab968b35', 'bc65ef7f-fd41-44b4-9ad9-d274de6c1eee', 'Mainan Telur (1 Set Isi 100 pcs)', 'MERGED_DUPLICATE', 'Duplikat IM-36 dialihkan ke SC-SNS-GDG-0009 (Telur Mainan).'),
    ('SC-SNS-GDG-0037', 'be59db33-af38-470f-be1f-4d69a72b0a47', '44b7adde-4f06-44e8-bfbc-41525f758774', 'Pompom Warna-Warni', 'MERGED_DUPLICATE', 'Duplikat IM-46 dialihkan ke SC-SNS-GDG-0003 (Pom - Pom warna warni).'),
    ('SC-FRN-GDG-0018', 'd892989b-481f-4010-be47-bc6010f32cf5', '36dfe524-18f4-4f6f-adb1-0555e6cc7d88', 'Perlak', 'MERGED_DUPLICATE', 'Duplikat L26-57 dialihkan ke SC-FRN-GDG-0010 (Alas / Perlak).'),
    ('SC-HBP-GDG-0063', 'f04a5b08-58f3-474b-acf5-e6450d24786e', 'df42f6ae-ff08-4ed7-850f-20b18b47efd4', 'Matras Sensory Karet', 'MERGED_DUPLICATE', 'Duplikat IM-19 dialihkan ke SC-SNS-GDG-0012 (Karpet refleksi pijat kaki).'),
    ('SC-SNS-GDG-0039', 'f04a5b08-58f3-474b-acf5-e6450d24786e', 'd560a182-636c-47cd-bce9-ca3ce56e379b', 'Matras Sensory (M/K/B)', 'MERGED_DUPLICATE', 'Duplikat IM-51 dialihkan ke SC-SNS-GDG-0012 (Karpet refleksi pijat kaki).')
  on conflict (alias_code) do nothing;

  raise notice 'Inventory hierarchy & safe data migration completed cleanly (backup batch_id=%).', v_batch_id;
end $$;
