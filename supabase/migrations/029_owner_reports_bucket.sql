-- Migration: owner-reports storage bucket
--
-- Holds the weekly monthly-to-date PDF report sent to each owner over
-- WhatsApp. Meta's WhatsApp Cloud API fetches the document URL when the
-- message is dispatched, so the bucket must be publicly readable. Object
-- paths are namespaced by owner_id and use a UUID suffix, so they're
-- effectively unguessable.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'owner-reports',
  'owner-reports',
  true,
  10485760, -- 10MB cap; report is small but leaves headroom for tables
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = true,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read so Meta and the owner clicking the WhatsApp attachment can
-- both fetch the file. Writes stay service-role-only via the API.
DROP POLICY IF EXISTS "owner_reports_public_read" ON storage.objects;
CREATE POLICY "owner_reports_public_read" ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'owner-reports');
