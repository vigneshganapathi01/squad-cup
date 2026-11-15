-- Squad Cup – teams can log in with the captain email OR the Team ID (e.g. FF-0001), plus the password.
-- Run AFTER admin-passwords.sql. Safe to run again. NOT applied to any database yet.

create or replace function team_login(p_email text, p_password text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t teams; sec team_secrets; tok text; generic text := 'Email, Team ID or password is wrong. No password yet? Use “Email me a new password”.';
begin
  if not rate_ok('login', 20, interval '15 minutes') then return jsonb_build_object('error', 'Too many tries from this connection. Wait 15 minutes.'); end if;
  if length(coalesce(p_email, '')) > 100 or length(coalesce(p_password, '')) > 100 then return jsonb_build_object('error', generic); end if;
  select * into t from teams where (lower(players->0->>'email') = lower(trim(p_email)) or lower(code) = lower(trim(p_email))) and status not in ('rejected', 'withdrawn') order by created_at desc limit 1;
  if t.id is null then return jsonb_build_object('error', generic); end if;
  select * into sec from team_secrets where team_id = t.id;
  if sec.team_id is null then return jsonb_build_object('error', generic); end if;
  if sec.locked_until > now() then return jsonb_build_object('error', 'Too many wrong tries. Try again in 15 minutes.'); end if;
  if sec.pass_hash <> crypt(coalesce(p_password, ''), sec.pass_hash) then
    update team_secrets set failed_logins = failed_logins + 1,
      locked_until = case when failed_logins + 1 >= 5 then now() + interval '15 minutes' end where team_id = t.id;
    return jsonb_build_object('error', generic);
  end if;
  update team_secrets set failed_logins = 0, locked_until = null where team_id = t.id;
  delete from team_sessions where expires_at < now();
  tok := encode(gen_random_bytes(24), 'hex');
  insert into team_sessions (token, team_id, expires_at) values (tok, t.id, now() + interval '30 days');
  return jsonb_build_object('token', tok, 'code', t.code);
end $$;
