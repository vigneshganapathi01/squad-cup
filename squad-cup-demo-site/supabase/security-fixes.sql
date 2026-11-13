-- Squad Cup – security fixes from the audit. Run AFTER schema.sql and email-login.sql. Safe to run again.
-- 1. Logos must be real image data (stops script injection through the logo field).
-- 2. Per-visitor rate limits on registration, login and password emails, plus a daily email cap.
-- 3. Length limits and a clean player record (only name, mobile, email, UID are stored).
-- 4. Login and check-in messages that don't reveal who is registered.

create table if not exists rate_limits (key text not null, at timestamptz not null default now());
create index if not exists rate_limits_key_at on rate_limits (key, at);
alter table rate_limits enable row level security;   -- no policies: only the functions below use it

-- The visitor's IP as seen by Supabase's API gateway.
create or replace function client_ip() returns text language sql stable as $$
  select coalesce(
    nullif(nullif(current_setting('request.headers', true), '')::json->>'cf-connecting-ip', ''),
    nullif(split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1), ''),
    'unknown')
$$;

-- true = allowed (and counted); false = limit reached.
create or replace function rate_ok(p_action text, p_max int, p_window interval) returns boolean language plpgsql security definer set search_path = public as $$
declare k text := p_action || ':' || client_ip(); n int;
begin
  delete from rate_limits where at < now() - interval '1 day';
  select count(*) into n from rate_limits where key = k and at > now() - p_window;
  if n >= p_max then return false; end if;
  insert into rate_limits (key) values (k);
  return true;
end $$;

-- Daily email cap (Brevo free plan = 300/day; keep a margin for admin resends).
create or replace function email_budget_ok() returns boolean language sql stable security definer set search_path = public as $$
  select count(*) < 280 from email_log where request_id is not null and at > now() - interval '1 day'
$$;

create or replace function register_team(p jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s jsonb; pl jsonb; used int; new_id text; t teams; sent boolean := false; em text; clean jsonb;
begin
  select data into s from settings where id = 1;
  if not coalesce((s->>'regOpen')::boolean, false) or exists (select 1 from stages) then raise exception 'Registration is closed'; end if;
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
    if exists (select 1 from teams tt, jsonb_array_elements(tt.players) x where tt.status not in ('rejected', 'withdrawn') and x->>'uid' = pl->>'uid') then raise exception 'UID % is already in another team', pl->>'uid'; end if;
    if exists (select 1 from teams tt, jsonb_array_elements(tt.players) x where tt.status not in ('rejected', 'withdrawn') and x->>'mobile' = pl->>'mobile') then raise exception 'Mobile % is already in another team', pl->>'mobile'; end if;
  end loop;
  if (select count(distinct x->>'uid') from jsonb_array_elements(p->'players') x) < 4 then raise exception 'Same UID used twice in this team'; end if;
  if (select count(distinct x->>'mobile') from jsonb_array_elements(p->'players') x) < 4 then raise exception 'Same mobile used twice in this team'; end if;
  em := lower(trim(p->'players'->0->>'email'));
  if exists (select 1 from teams where status not in ('rejected', 'withdrawn') and lower(players->0->>'email') = em) then raise exception 'The captain email % is already used by another team', em; end if;
  -- Only these four fields are kept for each player.
  select jsonb_agg(jsonb_build_object('name', trim(x->>'name'), 'mobile', x->>'mobile', 'email', lower(trim(x->>'email')), 'uid', x->>'uid') order by o)
    into clean from jsonb_array_elements(p->'players') with ordinality as a(x, o);
  -- Max 10 registrations an hour from one internet connection (gaming cafés share one).
  if not rate_ok('register', 10, interval '1 hour') then raise exception 'Too many registrations from this connection. Try again in an hour.'; end if;

  perform pg_advisory_xact_lock(42);
  select count(*) into used from teams where entry = 'SLOT' and status in ('pending', 'approved');
  new_id := 't' || replace(gen_random_uuid()::text, '-', '');
  insert into teams (id, name, logo, entry, slot_no, status, source, players, captain_mobile)
  values (new_id, trim(p->>'name'), p->>'logo', 'SLOT',
    case when used < (s->>'slots')::int then (select min(n) from generate_series(1, (s->>'slots')::int) n
      where n not in (select slot_no from teams where entry = 'SLOT' and status in ('pending', 'approved') and slot_no is not null)) end,
    case when used < (s->>'slots')::int then 'pending' else 'waitlist' end,
    'form', clean, clean->0->>'mobile')
  returning * into t;
  insert into audit_log (who, action, what) values ('public', 'Team registered', t.code || ' ' || t.name);
  if email_budget_ok() then sent := send_login_email(t.id, 'register'); end if;
  return jsonb_build_object('id', t.id, 'code', t.code, 'name', t.name, 'logo', t.logo, 'status', t.status, 'slotNo', t.slot_no, 'entry', t.entry,
    'emailed', sent, 'emailTo', regexp_replace(em, '^(.{2}).*(@.*)$', '\1•••\2'));
end $$;

create or replace function team_login(p_email text, p_password text) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare t teams; sec team_secrets; tok text; generic text := 'Email or password is wrong. No password yet? Use “Email me a new password”.';
begin
  if not rate_ok('login', 20, interval '15 minutes') then return jsonb_build_object('error', 'Too many tries from this connection. Wait 15 minutes.'); end if;
  if length(coalesce(p_email, '')) > 100 or length(coalesce(p_password, '')) > 100 then return jsonb_build_object('error', generic); end if;
  select * into t from teams where lower(players->0->>'email') = lower(trim(p_email)) and status not in ('rejected', 'withdrawn') order by created_at desc limit 1;
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

create or replace function team_reset_password(p_email text) returns text language plpgsql security definer set search_path = public as $$
declare t teams; last timestamptz;
begin
  if rate_ok('reset', 5, interval '1 hour') and email_budget_ok() then
    select * into t from teams where lower(players->0->>'email') = lower(trim(left(p_email, 100))) and status not in ('rejected', 'withdrawn') order by created_at desc limit 1;
    if t.id is not null then
      select sent_at into last from team_secrets where team_id = t.id;
      if last is null or last < now() - interval '10 minutes' then perform send_login_email(t.id, 'reset'); end if;
    end if;
  end if;
  return 'If that email belongs to a team captain, a new password is on its way. Check spam too.';
end $$;

create or replace function team_checkin(p_token text, p_match text) returns boolean language plpgsql security definer set search_path = public as $$
declare t teams; st jsonb;
begin
  select * into t from teams where id = session_team(p_token);
  if t.id is null then raise exception 'Please log in again'; end if;
  if t.status <> 'approved' then raise exception 'Your team is not approved yet'; end if;
  if not exists (select 1 from matches where id = p_match and status in ('checkin', 'room')) then raise exception 'Check-in is not open'; end if;
  select s.data into st from stages s join matches m on m.stage_id = s.id where m.id = p_match;
  if not exists (select 1 from jsonb_array_elements(st->'groups') g, jsonb_array_elements(g->'matches') mm
                 where mm->>'id' = p_match and (g->'teamIds') ? t.id) then raise exception 'Your team is not in this match'; end if;
  insert into checkins (match_id, team_id) values (p_match, t.id) on conflict do nothing;
  return true;
end $$;

-- The admin "email logins" button respects the daily cap too.
create or replace function admin_send_logins(p_team_ids text[]) returns int language plpgsql security definer set search_path = public as $$
declare id text; n int := 0;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  foreach id in array p_team_ids[1:300] loop
    exit when not email_budget_ok();
    if send_login_email(id, 'admin') then n := n + 1; end if;
  end loop;
  return n;
end $$;

revoke all on function client_ip(), rate_ok(text, int, interval), email_budget_ok() from public, anon, authenticated;
revoke all on function register_team(jsonb), team_login(text, text), team_reset_password(text), team_checkin(text, text), admin_send_logins(text[]) from public, anon, authenticated;
grant execute on function register_team(jsonb), team_login(text, text), team_reset_password(text), team_checkin(text, text) to anon, authenticated;
grant execute on function admin_send_logins(text[]) to authenticated;
drop table if exists qa_results;
