-- 024_sync_auth_users_to_public_users.sql
--
-- Users added directly through the Supabase dashboard land in
-- `auth.users` but never in `public.users`, so they never appear in the
-- webapp's user management table (and have no role / property
-- assignments). The invite API in the app inserts into both tables,
-- but dashboard-added users skip that path.
--
-- This migration:
--   1. Backfills `public.users` for any existing auth users that are
--      missing a corresponding row.
--   2. Installs an AFTER INSERT trigger on `auth.users` so future
--      dashboard-added users auto-create a `public.users` row with
--      sensible defaults (role = property_manager, active = true).
--
-- The trigger reads role / full_name from `raw_user_meta_data` when
-- present (that's how the invite API passes them through), and falls
-- back to defaults otherwise. Unknown role values are coerced to
-- 'property_manager' so an invalid metadata value can never block auth
-- signup.

-- ---------------------------------------------------------------------
-- 1. Backfill
-- ---------------------------------------------------------------------

INSERT INTO public.users (id, email, full_name, role, is_active)
SELECT
  au.id,
  au.email,
  COALESCE(au.raw_user_meta_data->>'full_name', ''),
  CASE
    WHEN au.raw_user_meta_data->>'role' IN ('super_admin', 'property_manager')
      THEN (au.raw_user_meta_data->>'role')::user_role
    ELSE 'property_manager'::user_role
  END,
  true
FROM auth.users au
LEFT JOIN public.users pu ON pu.id = au.id
WHERE pu.id IS NULL
  AND au.email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------
-- 2. Trigger for future auth user inserts
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    CASE
      WHEN NEW.raw_user_meta_data->>'role' IN ('super_admin', 'property_manager')
        THEN (NEW.raw_user_meta_data->>'role')::user_role
      ELSE 'property_manager'::user_role
    END,
    true
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

NOTIFY pgrst, 'reload schema';
