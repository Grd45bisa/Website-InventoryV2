-- DocuFlow: repair access for existing staff accounts
-- Safe to run repeatedly on an existing database.

BEGIN;

SELECT pg_advisory_xact_lock(hashtext('docuflow_fix_existing_staff_access_v1'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS warehouse_id UUID;

-- Allow the canonical staff role before converting legacy admin accounts.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('super_admin', 'owner', 'staff', 'sales_person')) NOT VALID;

UPDATE public.profiles
SET role = 'staff',
    updated_at = now()
WHERE role = 'admin';

-- Keep Supabase Auth metadata consistent with public.profiles.
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{role}',
      '"staff"'::jsonb,
      true
    )
WHERE raw_user_meta_data->>'role' = 'admin';

-- Convert legacy module role entries without overwriting other settings.
UPDATE public.workspace_settings
SET value = replace(value::text, '"admin"', '"staff"')::jsonb,
    updated_at = now()
WHERE value::text LIKE '%"admin"%';

-- Repair staff assignments that are empty, point to another workspace,
-- or point to an archived warehouse. Existing valid assignments are retained.
UPDATE public.profiles AS profile
SET warehouse_id = (
      SELECT warehouse.id
      FROM public.warehouses AS warehouse
      WHERE warehouse.owner_id = profile.owner_id
        AND warehouse.status = 'active'
      ORDER BY warehouse.is_default DESC, warehouse.created_at ASC
      LIMIT 1
    ),
    updated_at = now()
WHERE profile.role IN ('staff', 'sales_person')
  AND EXISTS (
    SELECT 1
    FROM public.warehouses AS fallback
    WHERE fallback.owner_id = profile.owner_id
      AND fallback.status = 'active'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.warehouses AS assigned
    WHERE assigned.id = profile.warehouse_id
      AND assigned.owner_id = profile.owner_id
      AND assigned.status = 'active'
  );

-- Synchronize the repaired warehouse assignment into Auth metadata.
UPDATE auth.users AS auth_user
SET raw_user_meta_data = jsonb_set(
      coalesce(auth_user.raw_user_meta_data, '{}'::jsonb),
      '{warehouse_id}',
      to_jsonb(profile.warehouse_id::text),
      true
    )
FROM public.profiles AS profile
WHERE auth_user.id = profile.id
  AND profile.role IN ('staff', 'sales_person')
  AND profile.warehouse_id IS NOT NULL
  AND auth_user.raw_user_meta_data->>'warehouse_id'
      IS DISTINCT FROM profile.warehouse_id::text;

COMMIT;

-- A successful run returns one row per staff account and its access state.
SELECT
  profile.id,
  auth_user.email,
  profile.role,
  profile.status,
  profile.owner_id,
  profile.warehouse_id,
  warehouse.name AS warehouse_name,
  warehouse.status AS warehouse_status,
  CASE
    WHEN profile.status <> 'active' THEN 'ACCOUNT_DISABLED'
    WHEN profile.owner_id IS NULL THEN 'MISSING_OWNER'
    WHEN profile.warehouse_id IS NULL THEN 'NO_ACTIVE_WAREHOUSE'
    WHEN warehouse.id IS NULL THEN 'INVALID_WAREHOUSE'
    ELSE 'READY'
  END AS access_state
FROM public.profiles AS profile
LEFT JOIN auth.users AS auth_user ON auth_user.id = profile.id
LEFT JOIN public.warehouses AS warehouse
  ON warehouse.id = profile.warehouse_id
 AND warehouse.owner_id = profile.owner_id
 AND warehouse.status = 'active'
WHERE profile.role IN ('staff', 'sales_person')
ORDER BY auth_user.email NULLS LAST;
