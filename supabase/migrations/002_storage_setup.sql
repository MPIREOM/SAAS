-- Storage buckets for documents and attachments

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('documents', 'documents', false, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  ('maintenance-photos', 'maintenance-photos', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']);

-- Storage policies: authenticated users can upload/read from documents bucket
CREATE POLICY "documents_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

CREATE POLICY "documents_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

CREATE POLICY "documents_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents');

-- Maintenance photos policies
CREATE POLICY "maintenance_photos_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'maintenance-photos');

CREATE POLICY "maintenance_photos_read" ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'maintenance-photos');
