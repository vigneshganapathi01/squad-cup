// Online mode: keeps the app's in-memory state (S) in sync with Supabase.
// Staff edits are diffed against the last loaded copy and only changed rows are written.
// Public visitors only read, and act through the safe database functions (register, team dashboard, check-in, complaint).
const Cloud = (() => {
  const cfg = window.SQUAD_CONFIG || {};
  const on = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase);
  const sb = on ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey) : null;
  let role = null, snap = emptySnap(), queue = Promise.resolve(), reloadTimer = null, busy = 0;

  function emptySnap() { return { settings: '', teams: {}, stages: {}, matches: {}, rooms: {}, checkins: new Set(), complaints: {}, notes: {}, links: {}, invites: {} }; }
  const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };
  async function selectAll(table, order = 'id') {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const rows = must(await sb.from(table).select('*').order(order).range(from, from + 999));
      out.push(...rows); if (rows.length < 1000) return out;
    }
  }

  // ---------- row mapping ----------
  const teamRow = t => {
    const r = { id: t.id, name: t.name, logo: t.logo || null, entry: t.entry, slot_no: t.slotNo || null, status: t.status, reason: t.reason || null,
      source: t.source || null, players: t.players, captain_mobile: t.captainMobile, created_at: t.createdAt };
    if (t.code) r.code = t.code;
    return r;
  };
  const teamFrom = r => ({ id: r.id, code: r.code, name: r.name, logo: r.logo, entry: r.entry, slotNo: r.slot_no, status: r.status, reason: r.reason,
    source: r.source, players: r.players || [], captainMobile: r.captain_mobile, createdAt: r.created_at });
  const noteFrom = n => ({ id: n.id, key: n.key, teamId: n.team_id, type: n.type, text: n.text, status: n.status, at: n.at, sentAt: n.sent_at });
  const noteRow = n => ({ id: n.id, key: n.key, team_id: n.teamId, type: n.type, text: n.text, status: n.status, at: n.at, sent_at: n.sentAt || null });
  const inviteRow = i => ({ token: i.token, note: i.note || null, email: i.email || null, status: i.status, team_id: i.teamId || null, created_at: i.createdAt, used_at: i.usedAt || null, emailed_at: i.emailedAt || null });
  const inviteFrom = r => ({ token: r.token, note: r.note, email: r.email, status: r.status, teamId: r.team_id, createdAt: r.created_at, usedAt: r.used_at, emailedAt: r.emailed_at });
  const complaintFrom = c => ({ id: c.id, teamId: c.team_id, matchId: c.match_id, matchLabel: c.match_label, reason: c.reason, shot: c.shot, shotData: c.shot_data || null, status: c.status, answer: c.answer, at: c.at });
  function splitStage(st) {
    const data = JSON.parse(JSON.stringify(st)), matches = [], rooms = [], checks = [];
    data.groups.forEach(g => {
      g.matches = (g.matches || []).map(m => {
        matches.push({ id: m.id, stage_id: st.index, status: m.status, results: m.results, result_status: m.resultStatus, screenshots: m.screenshots || [] });
        if (m.roomId || m.roomPass) rooms.push({ match_id: m.id, room_id: m.roomId, room_pass: m.roomPass });
        (m.checkins || []).forEach(t => checks.push(m.id + '|' + t));
        return { id: m.id, no: m.no, map: m.map, day: m.day, time: m.time };
      });
    });
    return { data, matches, rooms, checks };
  }
  function makeSnap() {
    const s = emptySnap();
    s.settings = JSON.stringify(S.settings);
    S.teams.forEach(t => s.teams[t.id] = JSON.stringify(teamRow(t)));
    S.stages.forEach(st => {
      const p = splitStage(st);
      s.stages[st.index] = JSON.stringify(p.data);
      p.matches.forEach(m => s.matches[m.id] = JSON.stringify(m));
      p.rooms.forEach(r => s.rooms[r.match_id] = JSON.stringify(r));
      p.checks.forEach(c => s.checkins.add(c));
    });
    S.notifications.forEach(n => s.notes[n.id] = JSON.stringify(noteRow(n)));
    (S.wcInvites || []).forEach(i => s.invites[i.token] = JSON.stringify(inviteRow(i)));
    Object.entries(S.groupLinks).forEach(([k, l]) => s.links[k] = JSON.stringify({ key: k, link: l.link || null, invites: l.invites || {} }));
    S.complaints.forEach(c => { if (c.id) s.complaints[c.id] = JSON.stringify({ status: c.status, answer: c.answer || null }); });
    return s;
  }

  // ---------- load ----------
  async function loadAll() {
    const staff = !!role;
    const [set, stages, matches, teams, rooms, checks, complaints, logs, notes, links, invites] = await Promise.all([
      sb.from('settings').select('data').eq('id', 1).single().then(must),
      selectAll('stages'), selectAll('matches'), selectAll(staff ? 'teams' : 'public_teams', staff ? 'created_at' : 'id'),
      staff ? selectAll('match_rooms', 'match_id') : [], staff ? selectAll('checkins', 'at') : [],
      staff ? sb.from('complaints').select('*').order('at', { ascending: false }).then(must) : [],
      staff ? sb.from('audit_log').select('*').order('id', { ascending: false }).limit(300).then(must) : [],
      staff ? selectAll('notifications', 'at') : [], staff ? selectAll('group_links', 'key') : [],
      role === 'admin' ? selectAll('wc_invites', 'created_at') : []
    ]);
    const md = Object.fromEntries(matches.map(m => [m.id, m]));
    const rm = Object.fromEntries(rooms.map(r => [r.match_id, r]));
    const ck = {}; checks.forEach(c => (ck[c.match_id] = ck[c.match_id] || []).push(c.team_id));
    S = { settings: Object.assign(fresh().settings, set.data), seq: 0, teams: teams.map(teamFrom),
      stages: stages.map(r => { const st = r.data; st.groups.forEach(g => g.matches = g.matches.map(m => {
        const d = md[m.id] || {};
        return { ...m, status: d.status || 'scheduled', results: d.results || null, resultStatus: d.result_status || 'none', screenshots: d.screenshots || [],
          roomId: rm[m.id]?.room_id || '', roomPass: rm[m.id]?.room_pass || '', checkins: ck[m.id] || [] };
      })); return st; }),
      complaints: complaints.map(complaintFrom),
      log: logs.map(l => ({ at: l.at, who: l.who, action: l.action, what: l.what })),
      wcInvites: invites.map(inviteFrom), notifications: notes.map(noteFrom).reverse(), groupLinks: Object.fromEntries(links.map(l => [l.key, { link: l.link, invites: l.invites || {} }])) };
    snap = makeSnap();
    if (!staff && session.teamToken) await refreshTeam();
    if (role === 'admin') {  // which teams already got their login email
      const st = await sb.rpc('admin_login_status'); S.loginSent = Object.fromEntries((st.data || []).map(r => [r.team_id, r.sent_at]));
      await teamPasswords().catch(() => {});
    }
  }

  // ---------- save (staff) ----------
  function sync() {
    if (!on || !role) return queue;
    busy++;
    queue = queue.then(doSync).catch(e => { console.error(e); toast('Could not save: ' + e.message); return loadAll().then(render); }).finally(() => busy--);
    return queue;
  }
  async function doSync() {
    const cur = makeSnap(), admin = role === 'admin';
    const changed = (a, b) => Object.keys(a).filter(k => a[k] !== b[k]).map(k => JSON.parse(a[k]));
    if (admin && cur.settings !== snap.settings) must(await sb.from('settings').update({ data: S.settings }).eq('id', 1));
    let newTeams = false;
    if (admin) {
      const gone = Object.keys(snap.teams).filter(id => !(id in cur.teams));
      if (gone.length) must(await sb.from('teams').delete().in('id', gone));
      const rows = changed(cur.teams, snap.teams), fresh = rows.filter(r => !r.code), old = rows.filter(r => r.code);
      for (let i = 0; i < fresh.length; i += 300) must(await sb.from('teams').insert(fresh.slice(i, i + 300), { defaultToNull: false }));
      for (let i = 0; i < old.length; i += 300) must(await sb.from('teams').upsert(old.slice(i, i + 300), { onConflict: 'id' }));
      newTeams = fresh.length > 0;
      const st = Object.keys(cur.stages).filter(k => cur.stages[k] !== snap.stages[k]).map(k => ({ id: Number(k), data: JSON.parse(cur.stages[k]) }));
      if (st.length) must(await sb.from('stages').upsert(st, { onConflict: 'id' }));
    }
    const ms = changed(cur.matches, snap.matches);
    for (let i = 0; i < ms.length; i += 300) must(await sb.from('matches').upsert(ms.slice(i, i + 300), { onConflict: 'id' }));
    const rs = changed(cur.rooms, snap.rooms);
    if (rs.length) must(await sb.from('match_rooms').upsert(rs, { onConflict: 'match_id' }));
    const cks = [...cur.checkins].filter(c => !snap.checkins.has(c)).map(c => { const [match_id, team_id] = c.split('|'); return { match_id, team_id }; });
    for (let i = 0; i < cks.length; i += 500) must(await sb.from('checkins').upsert(cks.slice(i, i + 500), { onConflict: 'match_id,team_id', ignoreDuplicates: true }));
    const gone = Object.keys(snap.notes).filter(id => !(id in cur.notes));
    if (gone.length) must(await sb.from('notifications').delete().in('id', gone));
    const ns = changed(cur.notes, snap.notes);
    for (let i = 0; i < ns.length; i += 300) must(await sb.from('notifications').upsert(ns.slice(i, i + 300), { onConflict: 'id' }));
    if (admin) { const iv = changed(cur.invites, snap.invites); if (iv.length) must(await sb.from('wc_invites').upsert(iv, { onConflict: 'token' })); }
    const ls = changed(cur.links, snap.links);
    if (ls.length) must(await sb.from('group_links').upsert(ls, { onConflict: 'key' }));
    for (const id of Object.keys(cur.complaints).filter(k => cur.complaints[k] !== snap.complaints[k])) must(await sb.from('complaints').update(JSON.parse(cur.complaints[id])).eq('id', id));
    const logs = S.log.filter(l => l._new);
    if (logs.length) { must(await sb.from('audit_log').insert(logs.reverse().map(({ who, action, what }) => ({ who, action, what })))); S.log.forEach(l => delete l._new); }
    snap = cur;
    if (newTeams) {  // the database gives new teams their Team ID
      const rows = must(await sb.from('teams').select('id,code'));
      const codes = Object.fromEntries(rows.map(r => [r.id, r.code]));
      S.teams.forEach(t => { if (!t.code) t.code = codes[t.id]; });
      snap = makeSnap(); render();
    }
  }

  // ---------- public actions ----------
  async function rpc(name, args) { const { data, error } = await sb.rpc(name, args); if (error) throw new Error(error.message); return data; }
  async function register(team) { return rpc('register_team', { p: team }); }
  async function refreshTeam() {
    const res = session.teamToken ? await rpc('team_dashboard', { p_token: session.teamToken }) : null;
    if (!res) { session.teamCode = null; session.teamToken = null; save(); return false; }
    session.teamCode = res.team.code;
    const t = teamFrom(res.team);
    S.teams = S.teams.filter(x => x.id !== t.id).concat(t);
    const rooms = Object.fromEntries(res.rooms.map(r => [r.matchId, r]));
    S.stages.forEach(st => st.groups.forEach(g => g.matches.forEach(m => {
      if (res.checkins.includes(m.id) && !m.checkins.includes(t.id)) m.checkins.push(t.id);
      if (rooms[m.id]) { m.roomId = rooms[m.id].roomId; m.roomPass = rooms[m.id].roomPass; }
    })));
    S.complaints = res.complaints.map(complaintFrom);
    S.notifications = res.notifications.map(noteFrom);
    S.groupLinks = Object.fromEntries(res.links.map(l => [l.key, { link: l.link, invites: {} }]));
    return true;
  }
  // Team login: captain email + the password that was emailed to it. Only a session token is kept in the browser.
  async function teamLogin(email, password) {
    const r = await rpc('team_login', { p_email: email.trim(), p_password: password });
    if (r.error) throw new Error(r.error);
    session.teamToken = r.token; session.teamCode = r.code; delete session.teamMobile;
    const ok = await refreshTeam(); save(); return ok;
  }
  async function teamLogout() { if (session.teamToken) await rpc('team_logout', { p_token: session.teamToken }).catch(() => {}); session.teamToken = null; session.teamCode = null; save(); }
  const resetPassword = email => rpc('team_reset_password', { p_email: email.trim() });
  const sendLogins = ids => rpc('admin_send_logins', { p_team_ids: ids }).then(async n => { const st = await sb.rpc('admin_login_status'); S.loginSent = Object.fromEntries((st.data || []).map(r => [r.team_id, r.sent_at])); await teamPasswords().catch(() => {}); return n; });
  const emailLog = () => rpc('admin_email_log', {});
  // Admin only: current team passwords (kept here, never in the saved tournament data).
  let passwords = {};
  const teamPasswords = () => rpc('admin_team_passwords', {}).then(rows => { passwords = Object.fromEntries((rows || []).map(r => [r.team_id, r])); return passwords; });
  const setPassword = (teamId, pw, email) => rpc('admin_set_password', { p_team: teamId, p_password: pw || '', p_email: !!email })
    .then(async res => { await teamPasswords(); const st = await sb.rpc('admin_login_status'); S.loginSent = Object.fromEntries((st.data || []).map(r => [r.team_id, r.sent_at])); return res; });
  // Wild Card invites: check a link, register through it, and email it (admin) through Brevo.
  const wcInviteInfo = token => rpc('wc_invite_info', { p_token: token });
  const registerWildcard = (token, team) => rpc('register_wildcard', { p_token: token, p: team });
  const sendWcInvite = async (token, email) => { await queue; return rpc('admin_send_wc_invite', { p_token: token, p_email: email }); };
  const checkin = matchId => rpc('team_checkin', { p_token: session.teamToken, p_match: matchId }).then(refreshTeam);
  const complain = (matchId, label, reason, shot, shotData) => rpc('raise_complaint', { p_token: session.teamToken, p_match: matchId, p_label: label, p_reason: reason, p_shot: shot, p_shot_data: shotData || '' });
  async function reset() { await queue; await rpc('admin_reset', {}); snap = emptySnap(); snap.settings = JSON.stringify(S.settings); }

  // ---------- staff login ----------
  async function loadRole() {
    const { data } = await sb.auth.getUser();
    if (!data?.user) { role = null; return null; }
    const rows = must(await sb.from('staff').select('role').eq('user_id', data.user.id));
    role = rows[0]?.role || null; return role;
  }
  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (!await loadRole()) { await sb.auth.signOut(); throw new Error('This account is not on the staff list'); }
    await loadAll(); return role;
  }
  async function signOut() { await sb.auth.signOut(); role = null; await loadAll(); }

  // ---------- live updates ----------
  function listen() {
    sb.channel('live').on('postgres_changes', { event: '*', schema: 'public' }, () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(async () => {
        if (busy) return listenReload();
        await queue; await loadAll();
        const a = document.activeElement;
        if (!(a && /INPUT|TEXTAREA|SELECT/.test(a.tagName))) render();
      }, 1200);
    }).subscribe();
  }
  function listenReload() { clearTimeout(reloadTimer); reloadTimer = setTimeout(() => queue.then(loadAll).then(render), 1500); }

  async function init() { await loadRole(); await loadAll(); listen(); return role; }
  const accessToken = async () => on ? (await sb.auth.getSession()).data.session?.access_token || null : null;
  return { on, accessToken, init, sync, loadAll, register, teamLogin, teamLogout, resetPassword, sendLogins, emailLog, teamPasswords, setPassword, get passwords() { return passwords; }, wcInviteInfo, registerWildcard, sendWcInvite, refreshTeam, checkin, complain, reset, signIn, signOut, get role() { return role; } };
})();
