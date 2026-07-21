
CREATE POLICY "wa_media_read_workspace" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'wa-media' AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id::text = split_part(name, '/', 1)
  )
);
