-- Migration: 014_populate_existing_warehouses_units.sql
-- Description: Injeksi daftar 7 unit (pcs, lusin, pack, bal10, bal15, bal20, bal25) ke database 
-- untuk semua akun (owner_id) dan gudang (warehouses) yang sudah ada saat ini.
-- Sedangkan untuk gudang baru selanjutnya hanya akan mendapatkan default bawaan (pcs & lusin).

DO $$
DECLARE
  v_units jsonb := '[
    {"key": "pcs", "name": "Pcs", "baseType": "pcs", "baseValue": 1, "multiplier": 1, "isLocked": true, "description": "1 Pcs"},
    {"key": "lusin", "name": "Lusin", "baseType": "pcs", "baseValue": 12, "multiplier": 12, "isLocked": true, "description": "12 Pcs"},
    {"key": "pack", "name": "Pack", "baseType": "lusin", "baseValue": 5, "multiplier": 60, "isLocked": false, "description": "5 Lusin (60 Pcs)"},
    {"key": "bal10", "name": "Bal 10", "baseType": "lusin", "baseValue": 10, "multiplier": 120, "isLocked": false, "description": "10 Lusin (120 Pcs)"},
    {"key": "bal15", "name": "Bal 15", "baseType": "lusin", "baseValue": 15, "multiplier": 180, "isLocked": false, "description": "15 Lusin (180 Pcs)"},
    {"key": "bal20", "name": "Bal 20", "baseType": "lusin", "baseValue": 20, "multiplier": 240, "isLocked": false, "description": "20 Lusin (240 Pcs)"},
    {"key": "bal25", "name": "Bal 25", "baseType": "lusin", "baseValue": 25, "multiplier": 300, "isLocked": false, "description": "25 Lusin (300 Pcs)"}
  ]'::jsonb;
  rec RECORD;
BEGIN
  -- 1. Insert/Update custom_units untuk semua owner/tenant di tabel profiles
  FOR rec IN 
    SELECT DISTINCT owner_id FROM public.profiles WHERE owner_id IS NOT NULL
  LOOP
    INSERT INTO public.workspace_settings (owner_id, key, value)
    VALUES (rec.owner_id, 'custom_units', v_units)
    ON CONFLICT (owner_id, key) DO UPDATE
    SET value = EXCLUDED.value;
  END LOOP;

  -- 2. Jika tabel warehouses ada, insert/update custom_units_<warehouse_id> untuk tiap gudang yang sudah ada
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'warehouses') THEN
    FOR rec IN 
      SELECT id, owner_id FROM public.warehouses WHERE id IS NOT NULL AND owner_id IS NOT NULL
    LOOP
      INSERT INTO public.workspace_settings (owner_id, key, value)
      VALUES (rec.owner_id, 'custom_units_' || rec.id::text, v_units)
      ON CONFLICT (owner_id, key) DO UPDATE
      SET value = EXCLUDED.value;
    END LOOP;
  END IF;

END $$;
