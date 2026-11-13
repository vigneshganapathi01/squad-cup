-- Squad Cup – store the screenshot image a team attaches to a complaint, so the admin can see it.
-- Run AFTER wildcards.sql. Safe to run again.

alter table complaints add column if not exists shot_data text;

drop function if exists raise_complaint(text, text, text, text, text);
create or replace function raise_complaint(p_token text, p_match text, p_label text, p_reason text, p_shot text, p_shot_data text) returns boolean language plpgsql security definer set search_path = public as $$
declare t teams; img text := nullif(p_shot_data, '');
begin
  select * into t from teams where id = session_team(p_token);
  if t.id is null then raise exception 'Please log in again'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please write what is wrong'; end if;
  -- Only real image data, at most ~600 KB (the site shrinks screenshots before sending).
  if img is not null and (img !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' or length(img) > 700000) then raise exception 'The screenshot must be a PNG, JPG or WEBP image under 500 KB'; end if;
  if (select count(*) from complaints where team_id = t.id and status = 'open') >= 5 then raise exception 'You already have 5 open complaints. Wait for the organiser to answer them.'; end if;
  insert into complaints (team_id, match_id, match_label, reason, shot, shot_data)
  values (t.id, left(p_match, 80), left(p_label, 80), left(p_reason, 1000), left(p_shot, 200), img);
  insert into audit_log (who, action, what) values ('team', 'Complaint raised', t.name);
  return true;
end $$;

revoke all on function raise_complaint(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function raise_complaint(text, text, text, text, text, text) to anon, authenticated;
