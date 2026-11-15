-- Squad Cup – ad videos for the landing page (Admin → Ads). Safe to run again.
-- Images don't need this (they are kept in settings like the logo); videos are uploaded to this public bucket.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ads', 'ads', true, 26214400, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = true, file_size_limit = 26214400, allowed_mime_types = array['video/mp4', 'video/webm'];

-- Everyone can watch the videos; only admins can upload, replace or delete them.
drop policy if exists ads_read on storage.objects;
drop policy if exists ads_admin_insert on storage.objects;
drop policy if exists ads_admin_update on storage.objects;
drop policy if exists ads_admin_delete on storage.objects;
create policy ads_read on storage.objects for select using (bucket_id = 'ads');
create policy ads_admin_insert on storage.objects for insert to authenticated with check (bucket_id = 'ads' and public.is_admin());
create policy ads_admin_update on storage.objects for update to authenticated using (bucket_id = 'ads' and public.is_admin()) with check (bucket_id = 'ads' and public.is_admin());
create policy ads_admin_delete on storage.objects for delete to authenticated using (bucket_id = 'ads' and public.is_admin());
