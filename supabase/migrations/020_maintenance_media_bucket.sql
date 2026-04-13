-- Migration: Ensure the maintenance-media bucket exists and is public
--
-- The original storage migration (002) created a bucket named
-- maintenance-photos, but the public maintenance request submit route
-- uploads to maintenance-media. Without the bucket existing — and being
-- public — uploads either silently fail or the resulting URLs return
-- 400/401 to anonymous viewers (admin clicking the link in an email).
--
-- File paths under this bucket are namespaced by property_id and use a
-- random suffix, so making the bucket public is acceptable: paths are
-- effectively unguessable. Read access is anonymous; uploads are still
-- service-role-only via the API.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'maintenance-media',
  'maintenance-media',
  true,
  52428800, -- 50MB to allow short videos
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'video/webm'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read policy so admins clicking the link in email/WhatsApp can
-- view the photo without authenticating. INSERT/UPDATE/DELETE are not
-- granted to anon — those go through the API which uses the service role.
DROP POLICY IF EXISTS "maintenance_media_public_read" ON storage.objects;
CREATE POLICY "maintenance_media_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'maintenance-media');
