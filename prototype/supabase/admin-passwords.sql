-- Squad Cup – the admin can set a team's password and see it on the admin Teams page.
-- Run AFTER complaint-screenshots.sql. Safe to run again.
-- Logins still check a bcrypt hash. Next to it we keep an encrypted copy so the admin can read it back;
-- the key lives in Supabase Vault and only admin functions decrypt it. Teams never see other teams' passwords.

alter table team_secrets add column if not exists pass_enc text;
alter table team_secrets add column if not exists set_at timestamptz;
alter table team_secrets add column if not exists set_by text;

-- One random encryption key, created once and kept in Vault.
do $$ begin
  if not exists (select 1 from vault.secrets where name = 'team_pass_key') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'team_pass_key', 'Encrypts team passwords so the admin can read them');
  end if;
end $$;

create or replace function pass_key() returns text language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'team_pass_key' limit 1
$$;

-- Saves a password (hash for login + encrypted copy for the admin) and logs the team out everywhere.
create or replace function store_team_password(p_team text, pw text, p_by text) returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into team_secrets (team_id, pass_hash, pass_enc, set_at, set_by)
  values (p_team, crypt(pw, gen_salt('bf', 8)), encode(pgp_sym_encrypt(pw, pass_key()), 'base64'), now(), p_by)
  on conflict (team_id) do update set pass_hash = excluded.pass_hash, pass_enc = excluded.pass_enc, set_at = now(), set_by = p_by,
    failed_logins = 0, locked_until = null;
  delete from team_sessions where team_id = p_team;
end $$;

-- Emails a given password with the Team ID to the captain. Returns false if email is not set up.
create or replace function mail_team_password(p_team text, p_kind text, pw text) returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare t teams; key text; s jsonb; sender text; site text; rid bigint; to_email text; html text;
begin
  select * into t from teams where id = p_team;
  if t.id is null then return false; end if;
  to_email := t.players->0->>'email';
  select decrypted_secret into key from vault.decrypted_secrets where name = 'brevo_api_key' limit 1;
  select data into s from settings where id = 1;
  sender := coalesce(s->>'emailFrom', '');
  if key is null or sender = '' then
    insert into email_log (team_id, to_email, kind, note) values (t.id, to_email, p_kind, 'not sent: email not set up');
    return false;
  end if;
  site := coalesce(nullif(s->>'siteUrl', ''), 'https://squad-cup.vercel.app');
  html := '<div style="font-family:Arial,sans-serif;background:#0d0c08;color:#f6f1e4;padding:28px;border-radius:14px;max-width:520px">'
    || '<h2 style="margin:0 0 6px;color:#f59e0b">' || esc_html(s->>'name') || '</h2>'
    || '<p style="margin:0 0 18px;color:#c9c1aa">' || case when p_kind in ('reset', 'admin') then 'Here is your new password.' else 'Your team is registered. Keep these details private.' end || '</p>'
    || '<table style="width:100%;border-collapse:collapse;font-size:15px">'
    || '<tr><td style="padding:8px 0;color:#a39d8a">Team</td><td style="padding:8px 0"><b>' || esc_html(t.name) || '</b></td></tr>'
    || '<tr><td style="padding:8px 0;color:#a39d8a">Team ID</td><td style="padding:8px 0"><b>' || t.code || '</b></td></tr>'
    || '<tr><td style="padding:8px 0;color:#a39d8a">Login email</td><td style="padding:8px 0"><b>' || esc_html(to_email) || '</b></td></tr>'
    || '<tr><td style="padding:8px 0;color:#a39d8a">Password</td><td style="padding:8px 0"><b style="font-size:20px;letter-spacing:2px;color:#fde68a">' || esc_html(pw) || '</b></td></tr></table>'
    || '<p style="margin:20px 0"><a href="' || esc_html(site) || '/#/my-team" style="background:#f59e0b;color:#130b00;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold">Open My Team</a></p>'
    || '<p style="font-size:12px;color:#7d745c">Do not share this password. If you did not register, ignore this email.</p></div>';
  select net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object('api-key', key, 'Content-Type', 'application/json', 'accept', 'application/json'),
    body := jsonb_build_object(
      'sender', jsonb_build_object('email', sender, 'name', coalesce(nullif(s->>'emailName', ''), s->>'name')),
      'to', jsonb_build_array(jsonb_build_object('email', to_email, 'name', t.players->0->>'name')),
      'subject', s->>'name' || ' login · Team ID ' || t.code,
      'htmlContent', html)
  ) into rid;
  update team_secrets set sent_at = now() where team_id = t.id;
  insert into email_log (team_id, to_email, kind, request_id) values (t.id, to_email, p_kind, rid);
  return true;
end $$;

-- Same behaviour as before (new random password, emailed), now also readable by the admin.
create or replace function send_login_email(p_team text, p_kind text) returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare t teams; pw text; key text; sender text;
begin
  select * into t from teams where id = p_team;
  if t.id is null then return false; end if;
  select decrypted_secret into key from vault.decrypted_secrets where name = 'brevo_api_key' limit 1;
  select coalesce(data->>'emailFrom', '') into sender from settings where id = 1;
  if key is null or sender = '' then
    insert into email_log (team_id, to_email, kind, note) values (t.id, t.players->0->>'email', p_kind, 'not sent: email not set up');
    return false;
  end if;
  pw := gen_team_password();
  perform store_team_password(t.id, pw, 'email');
  return mail_team_password(t.id, p_kind, pw);
end $$;

-- Admin: set a team's password (blank = make a random one), optionally email it to the captain.
create or replace function admin_set_password(p_team text, p_password text, p_email boolean) returns jsonb language plpgsql security definer set search_path = public as $$
declare t teams; pw text := trim(coalesce(p_password, '')); sent boolean := false;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  select * into t from teams where id = p_team;
  if t.id is null then raise exception 'Team not found'; end if;
  if pw = '' then pw := gen_team_password(); end if;
  if length(pw) < 6 or length(pw) > 40 then raise exception 'The password must be 6 to 40 characters'; end if;
  if pw ~ '\s' then raise exception 'The password cannot contain spaces'; end if;
  perform store_team_password(t.id, pw, 'admin');
  if p_email and email_budget_ok() then sent := mail_team_password(t.id, 'admin', pw); end if;
  insert into audit_log (who, action, what) values ('admin', 'Team password changed' || case when sent then ' and emailed' else '' end, t.code || ' ' || t.name);
  return jsonb_build_object('password', pw, 'emailed', sent);
end $$;

-- Admin: every team's current password. Passwords made before this update are only stored as a hash, so they show as null.
create or replace function admin_team_passwords() returns table (team_id text, password text, set_at timestamptz, set_by text, sent_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  return query select s.team_id, case when s.pass_enc is null then null else pgp_sym_decrypt(decode(s.pass_enc, 'base64'), pass_key()) end, s.set_at, s.set_by, s.sent_at
    from team_secrets s;
end $$;

revoke all on function pass_key(), store_team_password(text, text, text), mail_team_password(text, text, text), send_login_email(text, text) from public, anon, authenticated;
revoke all on function admin_set_password(text, text, boolean), admin_team_passwords() from public, anon, authenticated;
grant execute on function admin_set_password(text, text, boolean), admin_team_passwords() to authenticated;
