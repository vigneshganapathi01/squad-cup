-- Squad Cup – private Wild Card invites, admin edits and a database-wide duplicate guard.
-- Run AFTER security-fixes.sql. Safe to run again.

-- 1. Invite links (admin only). A team registers through one link, once.
create table if not exists wc_invites (
  token text primary key,
  note text,
  email text,
  status text not null default 'open' check (status in ('open', 'used', 'revoked')),
  team_id text references teams(id) on delete set null,
  created_at timestamptz not null default now(),
  used_at timestamptz,
  emailed_at timestamptz
);
alter table wc_invites enable row level security;
drop policy if exists wc_invites_admin on wc_invites;
create policy wc_invites_admin on wc_invites for all using (is_admin()) with check (is_admin());

-- 2. Wild Card teams stay off the public site until they are in a published stage.
create or replace view public_teams as
  select id, name, logo, entry, slot_no, status from teams t
  where t.entry = 'SLOT'
     or exists (select 1 from stages s, jsonb_array_elements(s.data->'groups') g
                where s.data->>'status' in ('published', 'done') and (g->'teamIds') ? t.id);
grant select on public_teams to anon, authenticated;

-- 3. No player (UID or mobile) may be in two active teams, whoever writes the row (form, invite, admin edit, import).
create or replace function teams_no_duplicates() returns trigger language plpgsql set search_path = public as $$
declare pl jsonb; clash text;
begin
  if new.status in ('rejected', 'withdrawn') then return new; end if;
  if (select count(distinct x->>'uid') from jsonb_array_elements(new.players) x) < jsonb_array_length(new.players) then raise exception 'Same UID used twice in team %', new.name; end if;
  if (select count(distinct x->>'mobile') from jsonb_array_elements(new.players) x) < jsonb_array_length(new.players) then raise exception 'Same mobile used twice in team %', new.name; end if;
  for pl in select * from jsonb_array_elements(new.players) loop
    select tt.name into clash from teams tt, jsonb_array_elements(tt.players) x
      where tt.id <> new.id and tt.status not in ('rejected', 'withdrawn') and (x->>'uid' = pl->>'uid' or x->>'mobile' = pl->>'mobile') limit 1;
    if clash is not null then raise exception 'Player % (UID %, mobile %) is already in team %', pl->>'name', pl->>'uid', pl->>'mobile', clash; end if;
  end loop;
  return new;
end $$;
drop trigger if exists teams_no_duplicates on teams;
create trigger teams_no_duplicates before insert or update of players, status on teams for each row execute function teams_no_duplicates();

-- 4. Check an invite link (public). Says only whether it can be used.
create or replace function wc_invite_info(p_token text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i wc_invites;
begin
  select * into i from wc_invites where token = left(p_token, 64);
  if i.token is null then return jsonb_build_object('ok', false, 'status', 'invalid'); end if;
  if i.status <> 'open' then return jsonb_build_object('ok', false, 'status', i.status); end if;
  if exists (select 1 from stages where coalesce((data->>'wcJoin')::int, 0) > 0) then return jsonb_build_object('ok', false, 'status', 'closed'); end if;
  return jsonb_build_object('ok', true, 'status', 'open');
end $$;

-- 5. Register through an invite (public). Same checks as the normal form; arrives as Pending for the admin.
create or replace function register_wildcard(p_token text, p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb; i wc_invites; pl jsonb; new_id text; t teams; sent boolean := false; em text; clean jsonb;
begin
  if not rate_ok('wcregister', 10, interval '1 hour') then raise exception 'Too many tries from this connection. Try again in an hour.'; end if;
  select data into s from settings where id = 1;
  select * into i from wc_invites where token = left(p_token, 64) for update;
  if i.token is null or i.status <> 'open' then raise exception 'This invite link is not valid any more'; end if;
  if exists (select 1 from stages where coalesce((data->>'wcJoin')::int, 0) > 0) then raise exception 'Wild Card entries are closed'; end if;
  if (select count(*) from teams where entry = 'WC' and status not in ('rejected', 'withdrawn')) >= coalesce((s->>'wildCards')::int, 0) then raise exception 'All Wild Card places are taken'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Team name is required'; end if;
  if length(trim(p->>'name')) > 30 then raise exception 'Team name is too long (30 characters max)'; end if;
  if coalesce(p->>'logo', '') !~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'Team logo must be a PNG, JPG or WEBP image'; end if;
  if length(p->>'logo') > 60000 then raise exception 'Team logo is too large'; end if;
  if jsonb_typeof(p->'players') <> 'array' or jsonb_array_length(p->'players') <> 4 then raise exception '4 players are required'; end if;
  if exists (select 1 from teams where lower(name) = lower(trim(p->>'name')) and status not in ('rejected', 'withdrawn')) then raise exception 'Team name already taken'; end if;
  for pl in select * from jsonb_array_elements(p->'players') loop
    if coalesce(trim(pl->>'name'), '') = '' then raise exception 'Every player needs a name'; end if;
    if length(trim(pl->>'name')) > 40 then raise exception 'Player names can be 40 characters at most'; end if;
    if coalesce(pl->>'mobile', '') !~ '^[6-9][0-9]{9}$' then raise exception 'Mobile % is not valid', left(pl->>'mobile', 15); end if;
    if length(pl->>'email') > 100 or coalesce(pl->>'email', '') !~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$' then raise exception 'Email % is not valid', left(pl->>'email', 60); end if;
    if coalesce(pl->>'uid', '') !~ '^[0-9]{8,12}$' then raise exception 'UID % is not valid', left(pl->>'uid', 15); end if;
  end loop;
  em := lower(trim(p->'players'->0->>'email'));
  if exists (select 1 from teams where status not in ('rejected', 'withdrawn') and lower(players->0->>'email') = em) then raise exception 'The captain email % is already used by another team', em; end if;
  select jsonb_agg(jsonb_build_object('name', trim(x->>'name'), 'mobile', x->>'mobile', 'email', lower(trim(x->>'email')), 'uid', x->>'uid') order by o)
    into clean from jsonb_array_elements(p->'players') with ordinality as a(x, o);
  new_id := 't' || replace(gen_random_uuid()::text, '-', '');
  -- The duplicate trigger rejects any UID or mobile already in another team.
  insert into teams (id, name, logo, entry, slot_no, status, source, players, captain_mobile)
  values (new_id, trim(p->>'name'), p->>'logo', 'WC', null, 'pending', 'invite', clean, clean->0->>'mobile')
  returning * into t;
  update wc_invites set status = 'used', team_id = t.id, used_at = now() where token = i.token;
  insert into audit_log (who, action, what) values ('public', 'Wild Card registered by invite', t.code || ' ' || t.name);
  if email_budget_ok() then sent := send_login_email(t.id, 'register'); end if;
  return jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'logo', t.logo, 'status', t.status, 'slotNo', null, 'entry', 'WC',
    'emailed', sent, 'emailTo', regexp_replace(em, '^(.{2}).*(@.*)$', '\1•••\2'));
end $$;

-- 6. Admin: email an invite link through Brevo.
create or replace function admin_send_wc_invite(p_token text, p_email text) returns boolean language plpgsql security definer set search_path = public as $$
declare i wc_invites; key text; s jsonb; sender text; site text; link text; rid bigint; em text := lower(trim(p_email));
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if em !~ '^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$' or length(em) > 100 then raise exception 'Enter a valid email'; end if;
  select * into i from wc_invites where token = p_token;
  if i.token is null or i.status <> 'open' then raise exception 'This invite is not open'; end if;
  if not email_budget_ok() then return false; end if;
  select decrypted_secret into key from vault.decrypted_secrets where name = 'brevo_api_key' limit 1;
  select data into s from settings where id = 1;
  sender := coalesce(s->>'emailFrom', '');
  if key is null or sender = '' then return false; end if;
  site := coalesce(nullif(s->>'siteUrl', ''), 'https://squad-cup.vercel.app');
  link := site || '/#/wildcard/' || i.token;
  select net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', key, 'Content-Type', 'application/json', 'accept', 'application/json'),
    body := jsonb_build_object(
      'sender', jsonb_build_object('email', sender, 'name', coalesce(nullif(s->>'emailName', ''), s->>'name')),
      'to', jsonb_build_array(jsonb_build_object('email', em)),
      'subject', 'Wild Card invite · ' || (s->>'name'),
      'htmlContent', '<div style="font-family:Arial,sans-serif;background:#0d0c08;color:#f6f1e4;padding:28px;border-radius:14px;max-width:520px">'
        || '<p style="color:#f59e0b;font-weight:bold;letter-spacing:2px;margin:0">★ WILD CARD INVITATION</p>'
        || '<h2 style="margin:6px 0 12px">' || esc_html(s->>'name') || '</h2>'
        || '<p style="color:#c9c1aa">Your squad is invited to join as a Wild Card team. Register your 4 players with this private link. Please do not share it.</p>'
        || '<p style="margin:22px 0"><a href="' || esc_html(link) || '" style="background:#f59e0b;color:#130b00;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Register Wild Card team</a></p>'
        || '<p style="font-size:12px;color:#7d745c">If the button does not work, open: ' || esc_html(link) || '</p></div>')
  ) into rid;
  update wc_invites set email = em, emailed_at = now() where token = i.token;
  insert into email_log (team_id, to_email, kind, request_id) values (null, em, 'wc-invite', rid);
  return true;
end $$;

-- 7. Admin reset also clears invites.
create or replace function admin_reset() returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  -- 'where true': Supabase refuses a DELETE without a WHERE clause when it comes through the API.
  delete from wc_invites where true; delete from team_sessions where true; delete from team_secrets where true; delete from email_log where true;
  delete from notifications where true; delete from group_links where true; delete from checkins where true; delete from match_rooms where true; delete from matches where true; delete from stages where true; delete from complaints where true; delete from teams where true;
  perform setval('team_code_seq', 1, false);
  return true;
end $$;
revoke all on function admin_reset() from public, anon;
grant execute on function admin_reset() to authenticated;

revoke all on function teams_no_duplicates() from public, anon, authenticated;
revoke all on function wc_invite_info(text), register_wildcard(text, jsonb), admin_send_wc_invite(text, text) from public, anon, authenticated;
grant execute on function wc_invite_info(text), register_wildcard(text, jsonb) to anon, authenticated;
grant execute on function admin_send_wc_invite(text, text) to authenticated;
