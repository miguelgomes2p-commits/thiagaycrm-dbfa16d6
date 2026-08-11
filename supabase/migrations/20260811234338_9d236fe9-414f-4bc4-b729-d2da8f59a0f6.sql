CREATE POLICY "vehicle_media_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'vehicle-media' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "vehicle_media_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'vehicle-media' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "vehicle_media_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'vehicle-media' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));

CREATE POLICY "vehicle_media_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'vehicle-media' AND public.is_workspace_member((storage.foldername(name))[1]::uuid, auth.uid()));