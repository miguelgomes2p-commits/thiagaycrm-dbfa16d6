CREATE POLICY "wa_media_insert_workspace"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'wa-media'
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id::text = split_part(storage.objects.name, '/', 1)
  )
);

CREATE POLICY "wa_media_update_workspace"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'wa-media'
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id::text = split_part(storage.objects.name, '/', 1)
  )
)
WITH CHECK (
  bucket_id = 'wa-media'
  AND EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.user_id = auth.uid()
      AND wm.workspace_id::text = split_part(storage.objects.name, '/', 1)
  )
);