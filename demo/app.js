// Squad Cup prototype: all data lives in this browser (localStorage).
const E = window.Engine;
const KEY = 'squadcup-v1', SKEY = 'squadcup-session';
const MAPS = ['Bermuda', 'Purgatory', 'Kalahari', 'Alpine', 'NeXTerra', 'Bermuda Remastered'];

// ---------- storage ----------
function fresh() {
  return { settings: { name: 'Squad Cup', slots: 252, wildCards: 6, regOpen: true, regCloses: '2026-12-20', prize: '₹50,000', organiser: 'Squad Cup Esports', startDate: '2026-12-27' },
    teams: [], seq: 0, stages: [], log: [], complaints: [], groupLinks: {}, notifications: [], wcInvites: [] };
}
let S = (window.Cloud && Cloud.on) ? fresh() : (load(KEY) || fresh());
S.groupLinks = S.groupLinks || {}; S.notifications = S.notifications || []; S.wcInvites = S.wcInvites || [];
S.settings = Object.assign(fresh().settings, S.settings);
let session = load(SKEY) || { role: null, teamCode: null };
function load(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function save() {
  try { if (!Cloud.on) localStorage.setItem(KEY, JSON.stringify(S)); localStorage.setItem(SKEY, JSON.stringify(session)); } catch { toast('Could not save in this browser'); }
  if (Cloud.on) Cloud.sync();
}
// ---------- WhatsApp hybrid: captain messages ----------
// Every message is queued here, shown in the team portal (fallback) and sent to the captain from the WhatsApp tab.
function notify(teamId, type, ref, text) {
  if (S.settings.notifyPaused) return;
  const key = type + '|' + teamId + '|' + ref;
  if (S.notifications.some(n => n.key === key)) return;   // duplicate-send protection
  S.notifications.unshift({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), key, teamId, type, text, status: 'queued', at: new Date().toISOString() });
}
const linkKey = (stage, g) => stage.index + '|' + g.label;
const waUrl = (mobile, text) => 'https://wa.me/91' + mobile + '?text=' + encodeURIComponent(text);
function log(action, what) { S.log.unshift({ at: new Date().toISOString(), who: session.role || 'public', action, what, _new: true }); S.log = S.log.slice(0, 500); }

// ---------- helpers ----------
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const app = document.getElementById('app');
const team = id => S.teams.find(t => t.id === id);
const COLORS = ['#ff7a1a', '#5b8cff', '#2fbf71', '#ef5350', '#f2b230', '#b86bff', '#18b7c9', '#ff5fa2'];
function avatar(t, size = 22) {
  if (!t) return '';
  // Only real image data is ever used as a logo (blocks script injection through the logo field).
  if (t.logo && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(t.logo)) return `<img class="av" src="${esc(t.logo)}" alt="" width="${size}" height="${size}" style="width:${size}px;height:${size}px">`;
  const ini = t.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const c = COLORS[[...t.name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % COLORS.length];
  const ic = teamIcon(t.name);
  if (ic) return `<span class="av av-ic" role="img" aria-label="${esc(ini)}" style="width:${size}px;height:${size}px;background:${c};color:${c};--tc:${c}"><svg viewBox="0 0 512 512" aria-hidden="true"><use href="art/team-icons.svg#ti-${ic}"/></svg></span>`;
  // no emblem for this name: an A–Z letter badge (team colour tile, big slashed letter)
  const letter = (t.name.toUpperCase().match(/[A-Z]/) || ['?'])[0];
  return `<span class="av av-letter" role="img" aria-label="${esc(ini)}" style="width:${size}px;height:${size}px;background:${c};--tc:${c};font-size:${Math.round(size * .66)}px"><b>${letter}</b></span>`;
}
// UI only: pick a placeholder emblem (art/team-icons.svg, game-icons.net CC BY 3.0) from a word in the team name.
const TEAM_ICONS = ['thunder', 'blaze', 'cobra', 'storm', 'ghost', 'rider', 'titan', 'wolf', 'venom', 'hawk', 'viper', 'joker', 'shadow', 'phoenix', 'raptor', 'falcon', 'rogue', 'inferno', 'fury', 'spartan', 'kraken', 'nova', 'reaper', 'panther', 'sniper', 'dragon', 'bullet', 'ninja', 'legend', 'alpha', 'warriors'];
function teamIcon(name) {
  const words = String(name || '').toLowerCase().split(/\s+/).map(w => w.replace(/s$/, ''));
  for (const w of words) { const k = TEAM_ICONS.find(i => i === w || i === w + 's'); if (k) return k; }
  return null;
}
const tname = id => { const t = team(id); return t ? `<span class="tn">${avatar(t)}<span>${esc(t.name)}</span>${t.entry === 'WC' ? ' <span class="badge b-wc">WC</span>' : ''}</span>` : '?'; };
const slotTeams = () => S.teams.filter(t => t.entry === 'SLOT');
const usedSlots = () => slotTeams().filter(t => t.status === 'pending' || t.status === 'approved').length;
const maskMobile = m => m ? m.slice(0, 2) + 'xxxxxx' + m.slice(-2) : '';
let toastTimer;
function toast(msg) { const el = document.getElementById('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600); }
function statusBadge(s) {
  const m = { pending: 'b-warn', approved: 'b-ok', rejected: 'b-bad', waitlist: 'b-warn', withdrawn: 'b-bad' };
  return `<span class="badge ${m[s] || ''}">${esc(s)}</span>`;
}
function nextCode() { if (Cloud.on) return null; // the database assigns Team IDs online
  S.seq++; return 'FF-' + String(S.seq).padStart(4, '0'); }
function allPlayers(exceptId) { return S.teams.filter(t => t.id !== exceptId && t.status !== 'rejected' && t.status !== 'withdrawn').flatMap(t => t.players); }

function makeTeam(data, entry, source) {
  const t = { id: 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), code: nextCode(), name: data.name.trim(),
    logo: data.logo || null, players: data.players, captainMobile: data.players[0].mobile, entry, source, createdAt: new Date().toISOString(), status: 'pending', slotNo: null };
  if (entry === 'SLOT') {
    if (usedSlots() < S.settings.slots) t.slotNo = freeSlotNo(); else t.status = 'waitlist';
  } else t.status = 'approved';
  S.teams.push(t);
  return t;
}
function freeSlotNo() {
  const taken = new Set(slotTeams().filter(t => t.slotNo && (t.status === 'pending' || t.status === 'approved')).map(t => t.slotNo));
  for (let i = 1; i <= S.settings.slots; i++) if (!taken.has(i)) return i;
  return null;
}
function promoteWaitlist() {
  while (usedSlots() < S.settings.slots) {
    const w = slotTeams().filter(t => t.status === 'waitlist').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (!w) break;
    w.status = 'pending'; w.slotNo = freeSlotNo(); log('Waitlist promoted', w.name + ' → slot ' + w.slotNo);
  }
}

// ---------- stage logic using actual data ----------
const curStage = () => S.stages[S.stages.length - 1];
const groupResults = g => g.matches.filter(m => m.resultStatus === 'approved').map(m => m.results);
const wcTeams = () => S.teams.filter(t => t.entry === 'WC' && t.status === 'approved');
const wcJoined = () => S.stages.some(s => s.wcJoin > 0);
function approvedSlotCount() { return slotTeams().filter(t => t.status === 'approved').length; }
// Visitors can't see Wild Card teams before they play, so public pages plan with the configured number.
const wcPlanned = () => (Cloud.on && !Cloud.role) ? S.settings.wildCards : wcTeams().length;
// Format options the admin can change in Settings (defaults: Top 8 in Stage 1, Top 6 after, 6 matches a group, 12 in the final).
// Ready-made bracket formats (Settings and Stages). Picking one fills the format fields.
const FORMATS = {
  standard: { label: 'Standard: Top 8 → Top 6, MT 6, Final MT 12', stage1Top: 8, laterTop: 6, matchesPerStage: 6, finalMatches: 12, finalMode: 'normal' },
  quick: { label: 'Quick: Top 6 → Top 4, MT 4, Final MT 8', stage1Top: 6, laterTop: 4, matchesPerStage: 4, finalMatches: 8, finalMode: 'normal' },
  long: { label: 'Long: Top 9 → Top 8, MT 8, Final MT 12', stage1Top: 9, laterTop: 8, matchesPerStage: 8, finalMatches: 12, finalMode: 'normal' },
  rush: { label: 'Champion Rush final: Top 8 → Top 6, MT 6, Final MT 12', stage1Top: 8, laterTop: 6, matchesPerStage: 6, finalMatches: 12, finalMode: 'rush' },
};
const FORMAT_KEYS = ['stage1Top', 'laterTop', 'matchesPerStage', 'finalMatches', 'finalMode'];
function formatOf(s) {
  const cur = { stage1Top: Number(s.stage1Top) || 8, laterTop: Number(s.laterTop) || 6, matchesPerStage: Number(s.matchesPerStage) || 6, finalMatches: Number(s.finalMatches) || 12, finalMode: s.finalMode === 'rush' ? 'rush' : 'normal' };
  return Object.keys(FORMATS).find(k => FORMAT_KEYS.every(f => FORMATS[k][f] === cur[f])) || 'custom';
}
const formatSelect = (s, name) => `<select name="${name}" data-act="preset">${Object.entries(FORMATS).map(([k, f]) => `<option value="${k}" ${formatOf(s) === k ? 'selected' : ''}>${f.label}</option>`).join('')}<option value="custom" ${formatOf(s) === 'custom' ? 'selected' : ''}>Custom (your own numbers)</option></select>`;
const planOpts = () => ({ top1: S.settings.stage1Top, topN: S.settings.laterTop, matches: S.settings.matchesPerStage, finalMatches: S.settings.finalMatches });
// Stages already generated keep their real numbers; only the stages still to come follow the current format.
function plan() {
  if (!S.stages.length) return E.planStages(approvedSlotCount(), wcPlanned(), planOpts());
  const wcLeft = wcJoined() ? 0 : wcPlanned();
  const out = S.stages.map((b, i) => {
    const sizes = b.groups.map(g => g.teamIds.length);
    let advancing = null, fill = 0;
    if (!b.final) {
      if (b.status === 'done') advancing = (b.qualified || []).length;
      else {
        advancing = sizes.reduce((a, n) => a + Math.min(n, b.topN), 0);
        const wcNext = wcLeft && advancing + wcLeft <= E.MERGE_MAX ? wcLeft : 0;
        if (advancing + wcNext < E.FINAL_TEAMS) { fill = Math.max(0, Math.min(b.entering, E.FINAL_TEAMS - wcNext) - advancing); advancing += fill; }
      }
    }
    return { index: i, name: b.name, final: b.final, entering: b.entering, wcJoin: b.wcJoin || 0, sizes, topN: b.topN, advancing, fill, matches: b.matchCount || (b.final ? E.FINAL_MATCHES : E.MATCHES) };
  });
  const last = out[out.length - 1];
  if (last.final) return out;
  const o = planOpts();
  E.planStages(last.advancing, wcLeft, { ...o, top1: o.topN }).forEach(r => { r.index = out.length; if (!r.final) r.name = 'Stage ' + (out.length + 1); out.push(r); });
  return out;
}
// Groups are shown as numbers (Group 1, 2, 3 …). Older data stores letters (A, B, C …).
const GL = l => /^[A-Z]\d*$/.test(String(l)) ? String(l.charCodeAt(0) - 64 + 26 * (Number(String(l).slice(1)) || 0)) : String(l);
// Real match dates: a stage starts the day after the previous one ends, unless the admin set its own start date.
function stageStart(st) {
  if (st.startDate) return st.startDate;
  if (!S.settings.startDate) return '';
  let d = new Date(S.settings.startDate + 'T00:00:00');
  for (const prev of S.stages) { if (prev.index >= st.index) break;
    if (prev.startDate) d = new Date(prev.startDate + 'T00:00:00');
    const days = Math.max(1, ...prev.groups.flatMap(g => g.matches.map(m => m.day)), prev.groups.length ? 1 + Math.floor((prev.groups.length - 1) / 4) : 1);
    d.setDate(d.getDate() + days); }
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function matchDate(st, m) {
  const s0 = stageStart(st); if (!s0) return 'Day ' + m.day;
  const d = new Date(s0 + 'T00:00:00'); d.setDate(d.getDate() + (m.day - 1));
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
const stageOfMatch = m => S.stages.find(st => st.groups.some(g => g.matches.includes(m)));
const mDate = m => { const st = stageOfMatch(m); return st ? matchDate(st, m) : 'Day ' + m.day; };
// Maps are announced only once a match is live or finished (staff always see them).
const mapShown = m => !!session.role || m.status === 'live' || m.status === 'completed' || m.resultStatus !== 'none';
const mapOf = m => mapShown(m) ? m.map : 'Map TBA';

// Standings of one group. In the Grand Final with Champion Rush on, the rush winner is ranked first.
const RULES_MATCH = ['Check in on My Team before every match', 'Room ID and password appear 15 minutes before the start', 'Join with your slot number. Late teams get 0 points', 'No restart for disconnects', 'Never share room details'];
const RULES_FAIR = ['Only your 4 registered players may play', 'No hacks, panels, emulators or teaming', 'Complaints within 30 minutes, with a screenshot', "The organiser's decision is final"];
const rushOn = () => S.settings.finalMode === 'rush';
const rushTarget = () => Math.max(1, Number(S.settings.rushTarget) || 80);
// Champion Rush: a team that has reached the points target is on "match point"; the first such team to win a Booyah is champion.
function rushState(g) {
  const tot = {}, target = rushTarget(); let champion = null, wonIn = null;
  g.teamIds.forEach(id => tot[id] = 0);
  for (const m of g.matches) {
    if (m.resultStatus !== 'approved' || !m.results) continue;
    if (!champion) { const w = Object.keys(m.results).find(id => m.results[id].place === 1 && !m.results[id].noShow); if (w && tot[w] >= target) { champion = w; wonIn = m.no; } }
    for (const id of Object.keys(m.results)) { const r = m.results[id]; if (!r.noShow) tot[id] = (tot[id] || 0) + E.matchPoints(r.place, r.kills); }
  }
  return { champion, wonIn, target, matchPoint: g.teamIds.filter(id => tot[id] >= target) };
}
function rowsOf(g) {
  const rows = E.standings(g.teamIds, groupResults(g));
  const st = S.stages.find(x => x.groups.includes(g));
  if (!st || !st.final || !rushOn()) return rows;
  const c = rushState(g).champion; if (!c) return rows;
  const i = rows.findIndex(r => r.teamId === c); if (i > 0) rows.unshift(rows.splice(i, 1)[0]);
  rows.forEach((r, k) => r.rank = k + 1);
  return rows;
}
// Tournament logo (uploaded in Settings) or the default badge.
const logoOk = () => /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(S.settings.logo || '');
const tlogo = cls => logoOk() ? `<img class="${cls} tl-img" src="${S.settings.logo}" alt="${esc(S.settings.name)} logo">` : `<span class="${cls}">SC</span>`;
function qualifiersOf(stage) {
  // Top N of each group, seeded overall: all 1st places by points, then all 2nd places, ...
  const per = stage.groups.map(g => rowsOf(g).slice(0, stage.topN));
  const seeded = [];
  const order = (a, b) => b.points - a.points || b.booyahs - a.booyahs || b.placePts - a.placePts || b.kills - a.kills;
  for (let r = 0; r < stage.topN; r++) per.map(list => list[r]).filter(Boolean).sort(order).forEach(x => seeded.push(x.teamId));
  // Keep the Grand Final at 12 teams: if the cut leaves fewer, the best of the rest (by points) go through too.
  const wcNext = !wcJoined() && wcTeams().length && seeded.length + wcTeams().length <= E.MERGE_MAX ? wcTeams().length : 0;
  if (seeded.length + wcNext < E.FINAL_TEAMS) {
    const rest = stage.groups.flatMap(g => rowsOf(g).slice(stage.topN)).sort(order);
    rest.slice(0, E.FINAL_TEAMS - wcNext - seeded.length).forEach(x => seeded.push(x.teamId));
  }
  return seeded;
}

function buildStage(index, teamIds, mode) {
  const wcIds = (!wcJoined() && wcTeams().length && teamIds.length + wcTeams().length <= E.MERGE_MAX)
    ? wcTeams().map(t => t.id) : [];
  const entering = teamIds.length + wcIds.length;
  const final = entering <= E.FINAL_TEAMS;
  const sizes = E.distribute(entering);
  // Leave room for Wild Cards: spread their places over the groups (largest groups first).
  const cap = sizes.slice(); let left = wcIds.length, g = 0;
  while (left > 0) { if (cap[g] > 0) { cap[g]--; left--; } g = (g + 1) % cap.length; }
  const ordered = mode === 'random' ? E.shuffle(teamIds) : teamIds;
  const alloc = mode === 'seeded' ? E.snakeAllocate(ordered, cap) : E.sequentialAllocate(ordered, cap);
  const stage = { index, name: final ? 'Grand Final' : 'Stage ' + (index + 1), final, status: 'draft', entering, wcJoin: wcIds.length,
    topN: final ? null : Math.min(11, Math.max(1, Number(index === 0 ? S.settings.stage1Top : S.settings.laterTop) || (index === 0 ? 8 : 6))),
    matchCount: Math.min(30, Math.max(1, Number(final ? S.settings.finalMatches : S.settings.matchesPerStage) || (final ? E.FINAL_MATCHES : E.MATCHES))), wcTray: wcIds, sizes, groups: [] };
  stage.groups = alloc.map((ids, gi) => ({ label: final ? 'Final' : String.fromCharCode(65 + (gi % 26)) + (gi >= 26 ? Math.floor(gi / 26) : ''), teamIds: ids, matches: [] }));
  return stage;
}
function makeMatches(stage) {
  const n = stage.matchCount || (stage.final ? E.FINAL_MATCHES : E.MATCHES), half = Math.ceil(n / 2);
  stage.groups.forEach((g, gi) => {
    g.matches = Array.from({ length: n }, (_, i) => {
      const day = stage.final ? (i < half ? 1 : 2) : 1 + Math.floor(gi / 4);
      const k = stage.final ? i % half : i;
      const mins = 18 * 60 + k * 40;
      return { id: 'm' + stage.index + '-' + gi + '-' + i, no: i + 1, map: MAPS[i % MAPS.length], day, time: `${(Math.floor(mins / 60) - 12)}:${String(mins % 60).padStart(2, '0')} PM`,
        status: 'scheduled', roomId: '', roomPass: '', checkins: [], results: null, resultStatus: 'none', screenshots: [] };
    });
  });
}
function findTeamPlace(teamId) {
  for (let si = S.stages.length - 1; si >= 0; si--) {
    const st = S.stages[si];
    const gi = st.groups.findIndex(g => g.teamIds.includes(teamId));
    if (gi >= 0) return { stage: st, group: st.groups[gi], slot: st.groups[gi].teamIds.indexOf(teamId) + 1 };
  }
  return null;
}
function allApproved(stage) { return stage.groups.every(g => g.matches.every(m => m.resultStatus === 'approved')); }

// ---------- sample data ----------
// Sample In Game Names: gamer-tag style, unique, at most 12 characters.
const TAG = ['Ravi', 'Arun', 'Karthi', 'Vijay', 'Surya', 'Ajith', 'Dinesh', 'Hari', 'Praveen', 'Siva', 'Ganesh', 'Naveen', 'Kumar', 'Bala', 'Mani', 'Prakash', 'Sathish', 'Vimal', 'Rahul', 'Deepak', 'Priya', 'Divya', 'Kavya', 'Anu', 'Meena', 'Rohit', 'Imran', 'Joseph', 'Arjun', 'Vikram'];
const TAG_STYLE = [n => n + 'FF', n => 'xX' + n, n => n + 'Op', n => 'Pro' + n, n => n + 'YT', n => 'Its' + n, n => n + 'Gg', n => 'Mr' + n];
const ADJ = ['Thunder', 'Blaze', 'Cobra', 'Storm', 'Ghost', 'Rider', 'Titan', 'Wolf', 'Venom', 'Hawk', 'Viper', 'Joker', 'Shadow', 'Phoenix', 'Raptor', 'Falcon', 'Rogue', 'Inferno', 'Fury', 'Spartan', 'Kraken', 'Nova', 'Reaper', 'Panther', 'Sniper', 'Dragon', 'Bullet', 'Ninja', 'Legend', 'Alpha'];
const NOUN = ['Squad', 'Army', 'Gaming', 'Esports', 'Clan', 'Force', 'Kings', 'Gang', 'Boys', 'Unit', 'Crew', 'X'];
function loadSample() {
  S = fresh(); S.settings = Object.assign({}, S.settings);
  let mob = 9000000000, uid = 612340000, k = 0;  // dummy UIDs start at 6123…, away from Team Thunder's 5123… UIDs
  const mk = (name, entry) => {
    const players = [0, 1, 2, 3].map(() => {
      const n = TAG[k % TAG.length], style = TAG_STYLE[Math.floor(k / TAG.length) % TAG_STYLE.length], round = Math.floor(k / (TAG.length * TAG_STYLE.length));
      const ign = (style(n) + (round ? round : '')).slice(0, 12); k++; mob += 7; uid += 13;
      return { name: ign, mobile: String(mob), email: n.toLowerCase() + (mob % 10000) + '@mail.in', uid: String(uid) };
    });
    const t = makeTeam({ name, players }, entry, 'sample'); t.status = 'approved'; return t;
  };
  const thunder = mk('Team Thunder', 'SLOT');
  thunder.players = [
    { name: 'THxRavi', mobile: '9876543210', email: 'ravi@mail.in', uid: '512345678' },
    { name: 'THxArun', mobile: '9876543211', email: 'arun@mail.in', uid: '512345679' },
    { name: 'THxKarthik', mobile: '9876543212', email: 'karthik@mail.in', uid: '512345680' },
    { name: 'THxVijay', mobile: '9876543213', email: 'vijay@mail.in', uid: '512345681' }];
  thunder.captainMobile = '9876543210';
  for (let i = 1; i < 252; i++) mk(ADJ[i % ADJ.length] + ' ' + NOUN[Math.floor(i / ADJ.length) % NOUN.length] + (i >= ADJ.length * NOUN.length ? ' ' + i : ''), 'SLOT');
  ['Creator Kings', 'Stream Legends', 'YT Warriors', 'Live Snipers', 'Insta Rush', 'Shorts Squad'].forEach(n => mk(n, 'WC'));
  log('Sample data loaded', '252 slot teams + 6 Wild Cards');
  save();
}

// ---------- registration form ----------
function playerFields(prefix, i, p = {}) {
  return `<div class="player"><h4>Player ${i + 1}${i === 0 ? ' · Captain (contact)' : ''}</h4><div class="pf">
    <div><label>In Game Name *</label><input name="${prefix}${i}name" value="${esc(p.name)}" required maxlength="20" autocomplete="off" placeholder="As shown in Free Fire"></div>
    <div><label>Mobile *</label><input name="${prefix}${i}mobile" value="${esc(p.mobile)}" inputmode="numeric" maxlength="10" required placeholder="10 digits"></div>
    <div><label>Email *</label><input name="${prefix}${i}email" value="${esc(p.email)}" type="email" required></div>
    <div><label>Free Fire UID *</label><input name="${prefix}${i}uid" value="${esc(p.uid)}" inputmode="numeric" maxlength="12" required placeholder="8–12 digits"></div>
  </div></div>`;
}
function readTeamForm(form) {
  const f = new FormData(form);
  return { name: (f.get('teamName') || '').trim(), players: [0, 1, 2, 3].map(i => ({
    name: (f.get('p' + i + 'name') || '').trim(), mobile: (f.get('p' + i + 'mobile') || '').replace(/\D/g, ''),
    email: (f.get('p' + i + 'email') || '').trim().toLowerCase(), uid: (f.get('p' + i + 'uid') || '').replace(/\D/g, '') })) };
}
let formDraft = null, formErrors = [], formLogo = null, wcLogo = null;
function logoField(cur) {
  return `<label>Team logo * <span class="muted">(PNG or JPG, square works best)</span></label>
  <div class="row"><span class="logo-prev">${cur ? `<img src="${cur}" alt="Team logo preview">` : 'No logo'}</span><input type="file" name="logo" accept="image/png,image/jpeg,image/webp" data-act="logo" style="flex:1;min-width:200px"></div>`;
}
// Shrink the uploaded logo to 128px so it fits in browser storage.
// Complaint screenshots: shrink to at most 1280px wide (JPEG) so they can be stored and shown to the admin.
function readShot(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.size) return resolve(null);
    if (!file.type.startsWith('image/')) return reject(new Error('The screenshot must be an image'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('Screenshot must be under 15 MB'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = Math.min(1280, img.width), h = Math.round(img.height * w / img.width), q = 0.72, out;
      for (let i = 0; i < 4; i++) {
        const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
        out = c.toDataURL('image/jpeg', q);
        if (out.length <= 600000) break;
        w = Math.round(w * 0.75); h = Math.round(h * 0.75); q -= 0.08;
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')); };
    img.src = url;
  });
}
// Change one team's position/kills in a match. If another team already has that position, the two swap.
function changeResult(m, g, teamId, place, kills, noShow) {
  const r = m.results[teamId] || {}, before = { ...r };
  if (!noShow && place && r.place !== place) {
    const other = Object.keys(m.results).find(id => id !== teamId && m.results[id].place === place && !m.results[id].noShow);
    if (other) m.results[other].place = r.noShow ? null : r.place;
    if (other && !m.results[other].place) { const used = new Set(Object.values(m.results).filter(x => !x.noShow).map(x => x.place)); for (let p = 1; p <= g.teamIds.length; p++) if (!used.has(p) && p !== place) { m.results[other].place = p; break; } }
  }
  m.results[teamId] = noShow ? { noShow: true, place: null, kills: 0 } : { place, kills: Math.max(0, kills | 0) };
  return { before, after: m.results[teamId] };
}
const resultText = r => !r || r.noShow ? 'no-show' : '#' + r.place + ', ' + r.kills + ' kills (' + E.matchPoints(r.place, r.kills) + ' pts)';
function resultEditor(m, g, teamId, attrs) {
  const r = m.results?.[teamId] || {};
  return `<form data-form="fixresult" ${attrs} class="fixer">
    <div class="small muted">Now: <b>${resultText(r)}</b></div>
    <div class="row" style="margin-top:6px"><label class="inl">Position<select name="place">${g.teamIds.map((_, k) => `<option ${r.place === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></label>
      <label class="inl">Kills<input name="kills" type="number" min="0" max="99" value="${r.noShow ? 0 : (r.kills ?? 0)}"></label>
      <label class="inl chk"><input type="checkbox" name="ns" ${r.noShow ? 'checked' : ''}> No-show</label>
      <button class="btn small">Save</button></div>
    <div class="small muted" style="margin-top:4px">If another team already has that position, the two swap automatically.</div></form>`;
}
let openFix = null;
function readLogo(file, cb) {
  if (!file || !file.type.startsWith('image/')) { toast('Please choose an image'); return; }
  if (file.size > 3 * 1024 * 1024) { toast('Logo must be under 3 MB'); return; }
  const img = new Image(), url = URL.createObjectURL(file);
  img.onload = () => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const s = Math.min(img.width, img.height); x.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, 128, 128);
    URL.revokeObjectURL(url); cb(c.toDataURL('image/jpeg', .85));
  };
  img.onerror = () => toast('Could not read that image');
  img.src = url;
}
function viewRegister() {
  const used = usedSlots(), total = S.settings.slots, left = Math.max(0, total - used);
  const closed = !S.settings.regOpen || S.stages.length > 0;
  const d = formDraft || { name: '', players: [{}, {}, {}, {}] };
  return `<div class="reg">
  <div class="card glass">
    <div class="eyebrow">Squad registration</div><h2 style="margin:4px 0 14px">Enter your team</h2>
    <div class="slots"><span><b style="color:var(--ink)">${left}</b> of ${total} slots left</span><div class="bar"><i style="width:${total ? Math.min(100, used / total * 100) : 0}%"></i></div></div>
    ${closed ? `<div class="notice" style="margin-top:12px">Registration is closed.</div>` : `
    ${left === 0 ? `<div class="notice" style="margin-top:12px">All slots are full. You can still register and join the <b>waitlist</b>; you get a slot if a team drops out.</div>` : ''}
    ${formErrors.length ? `<div class="errors"><b>Please fix:</b><ul>${formErrors.map(e => '<li>' + esc(e) + '</li>').join('')}</ul></div>` : ''}
    <form data-form="register" novalidate>
      <label>Team name *</label><input name="teamName" value="${esc(d.name)}" required maxlength="30">
      ${logoField(formLogo)}
      ${d.players.map((p, i) => playerFields('p', i, p)).join('')}
      <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;color:var(--ink)"><input type="checkbox" name="agree" required> I accept the <a href="#/info">rules</a> and confirm all players are 18+ or have a parent's permission.</label>
      <div class="row" style="margin-top:14px"><button class="btn btn-lg" type="submit">Submit registration</button></div>
    </form>`}
  </div>
  <aside class="reg-side">
    <div class="card glass prize-card"><div class="eyebrow">Prize pool</div><div class="prize">${esc(S.settings.prize || 'Free entry')}</div><div class="muted small">Free entry · Squad of 4</div></div>
    ${countdownCard()}
    <div class="card glass"><div class="eyebrow">How it works</div>
      <ol class="steps">
        <li><b>Register</b><span>Fill in your team, logo and 4 players.</span></li>
        <li><b>Get approved</b><span>Save your Team ID. We check every entry.</span></li>
        <li><b>Check in & play</b><span>Room ID appears on My Team before each match.</span></li>
      </ol>
    </div>
    <div class="small muted" style="text-align:center">Registration closes ${fmtDate(S.settings.regCloses)}</div>
  </aside></div>`;
}
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
function countdownCard() {
  const t = S.settings.startDate ? new Date(S.settings.startDate + 'T18:00:00+05:30') - Date.now() : 0;
  if (t <= 0) return '';
  const d = Math.floor(t / 864e5), h = Math.floor(t / 36e5) % 24, m = Math.floor(t / 6e4) % 60;
  return `<div class="card glass"><div class="eyebrow">Tournament starts in</div><div class="cd" data-cd="${S.settings.startDate}"><div><b>${d}</b><span>Days</span></div><div><b>${h}</b><span>Hours</span></div><div><b>${m}</b><span>Mins</span></div></div><div class="small muted">${fmtDate(S.settings.startDate)} · 6:00 PM IST</div></div>`;
}
function submitRegister(form) {
  const data = readTeamForm(form);
  formDraft = data;
  const errors = E.validateTeam(data, allPlayers(), S.teams.filter(t => t.status !== 'rejected').map(t => t.name));
  if (!formLogo) errors.push('Team logo is required');
  if (!new FormData(form).get('agree')) errors.push('Please accept the rules');
  data.logo = formLogo;
  formErrors = errors;
  if (errors.length) { render(); window.scrollTo(0, 0); return; }
  if (Cloud.on) {
    const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Submitting…';
    Cloud.register(data).then(r => {
      lastRegistered = { ...r, players: [] }; S.teams.push(lastRegistered);
      formDraft = null; formErrors = []; formLogo = null; save();
      location.hash = '#/registered/' + r.code;
    }, err => { formErrors = [err.message]; render(); window.scrollTo(0, 0); });
    return;
  }
  const t = makeTeam(data, 'SLOT', 'form');
  log('Team registered', t.code + ' ' + t.name);
  formDraft = null; formErrors = []; formLogo = null; save();
  location.hash = '#/registered/' + t.code;
}
let lastRegistered = null;
function viewRegistered(code) {
  const t = S.teams.find(x => x.code === code) || (lastRegistered && lastRegistered.code === code ? lastRegistered : null);
  if (!t) return `<p>Team not found.</p>`;
  const msg = `${t.name} is registered for ${S.settings.name}. Team ID: ${t.code}.`;
  const wcNote = t.entry === 'WC' ? '<div class="notice" style="text-align:left;margin-bottom:10px">★ <b>Wild Card entry received.</b> The organiser will approve it and place your team in its stage. Until then, your team is not shown on the public site.</div>' : '';
  const mailNote = wcNote + (!Cloud.on ? '<p class="muted">Save your Team ID. You need it with the captain\'s mobile to open your dashboard.</p>'
    : t.emailed ? `<div class="notice" style="text-align:left">📧 We emailed your <b>Team ID and password</b> to <b>${esc(t.emailTo || 'the captain email')}</b>. Use that email + password on <b>My Team</b>. Check spam if you don't see it in a few minutes.</div>`
    : '<div class="notice" style="text-align:left">📧 Your login password will be emailed to the captain email soon. Then log in on <b>My Team</b>.</div>');
  return `<div class="card ok" style="max-width:560px;margin:auto;text-align:center">
    <h1>Registered! 🎉</h1>
    ${mailNote}
    <div style="margin:10px 0">${avatar(t, 72)}</div>
    <div class="big-code">${esc(t.code)}</div>
    <p>${esc(t.name)} · ${t.entry === 'WC' ? '<span class="badge b-wc">Wild Card</span> ' + statusBadge(t.status) : t.status === 'waitlist' ? '<span class="badge b-warn">Waitlist</span> All slots are full right now.' : 'Slot ' + t.slotNo + ' · ' + statusBadge(t.status) + ' (waiting for admin approval)'}</p>
    <div class="row" style="justify-content:center">
      <button class="btn" data-act="copy" data-text="${esc(t.code)}">Copy Team ID</button>
      <a class="btn ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(msg)}">Share on WhatsApp</a>
      <a class="btn ghost" href="#/my-team">Open My Team</a>
    </div></div>`;
}

// ---------- team dashboard ----------
let loginError = '';
let resetMsg = '';
function viewMyTeamLogin() {
  if (Cloud.on) return `<div class="card glass" style="max-width:420px;margin:auto">
    <h1>My Team</h1><p class="sub">Log in with the captain's email or your Team ID, and your password.</p>
    ${loginError ? `<div class="errors">${esc(loginError)}</div>` : ''}
    <form data-form="teamlogin">
      <label>Captain email or Team ID</label><input name="email" type="text" required autocomplete="username" placeholder="captain@email.com or FF-0001">
      <label>Password</label><input name="password" type="password" required autocomplete="current-password">
      <div class="row" style="margin-top:14px"><button class="btn">Log in</button></div>
    </form>
    <details style="margin-top:16px"${resetMsg ? ' open' : ''}><summary class="small">Forgot or didn't get the password?</summary>
      <form data-form="forgot" style="margin-top:8px"><label>Captain email</label><input name="email" type="email" required>
        <div class="row" style="margin-top:10px"><button class="btn ghost small">Email me a new password</button></div></form>
      ${resetMsg ? `<p class="small" style="margin-top:8px">${esc(resetMsg)}</p>` : ''}
    </details>
  </div>`;
  return `<div class="card" style="max-width:420px;margin:auto">
    <h1>My Team</h1><p class="sub">Enter your Team ID and the captain's mobile.</p>
    ${loginError ? `<div class="errors">${esc(loginError)}</div>` : ''}
    <form data-form="teamlogin">
      <label>Team ID</label><input name="code" placeholder="FF-0001" required>
      <label>Captain mobile</label><input name="mobile" inputmode="numeric" maxlength="10" required>
      <div class="row" style="margin-top:14px"><button class="btn">Open dashboard</button></div>
    </form>
    ${Cloud.on ? '' : '<p class="small muted" style="margin-top:12px">Demo: Team Thunder → <b>FF-0001</b> · <b>9876543210</b> (after loading sample data in Staff → Settings)</p>'}
  </div>`;
}
function nextAction(t) {
  if (t.status === 'pending') return { label: 'Status', main: 'Waiting for admin approval', sub: t.entry === 'WC' ? 'Your Wild Card entry has been received.' : 'Slot ' + t.slotNo + ' is reserved for you.' };
  if (t.status === 'waitlist') return { label: 'Status', main: 'On the waitlist', sub: 'You get a slot if a registered team drops out.' };
  if (t.status === 'rejected') return { label: 'Status', main: 'Registration rejected', sub: t.reason || '' };
  const place = findTeamPlace(t.id);
  if (!place) {
    if (t.entry === 'WC') { const p = plan(), j = p.find(s => s.wcJoin); return { label: 'Wild Card', main: 'You enter at ' + (j ? j.name : 'a later stage'), sub: 'The admin will place you in a group and slot.' }; }
    return { label: 'Approved ✅', main: 'Groups are being prepared', sub: 'You will see your group and slot here.' };
  }
  const { stage, group, slot } = place;
  if (stage.status === 'draft') return { label: stage.name, main: 'Groups are being prepared', sub: '' };
  if (stage.status === 'done') {
    if (stage.final) { const r = rowsOf(group).find(x => x.teamId === t.id); return { label: 'Grand Final finished', main: r.rank === 1 ? '🏆 Champions!' : 'Final rank: #' + r.rank, sub: r.points + ' points' }; }
    if ((stage.qualified || []).includes(t.id)) return { label: stage.name + ' finished', main: 'Qualified ✅', sub: 'Next stage groups are being prepared.' };
    const r = rowsOf(group).find(x => x.teamId === t.id);
    return { label: stage.name + ' finished', main: 'Eliminated', sub: 'Rank #' + r.rank + ' in Group ' + GL(group.label) + ' · ' + r.points + ' points' };
  }
  const m = group.matches.find(x => x.resultStatus !== 'approved');
  const where = `${stage.name} · Group ${GL(group.label)} · Slot ${slot}`;
  if (!m) return { label: where, main: 'All matches played', sub: 'Waiting for qualifiers to be approved.' };
  const head = `Match ${m.no} · ${mapOf(m)} · ${matchDate(stage, m)}, ${m.time}`;
  const checked = m.checkins.includes(t.id);
  if (m.status === 'scheduled') return { label: where, main: head, sub: 'Check-in opens 30 minutes before the match.' };
  if (!checked && (m.status === 'checkin' || m.status === 'room')) return { label: where, main: head, sub: 'Check in now to see the room details.', action: `<button class="btn" data-act="checkin" data-m="${m.id}" data-t="${t.id}">Check in</button>` };
  if (!checked) return { label: where, main: head, sub: 'You did not check in for this match.' };
  if (m.status === 'checkin') return { label: where, main: head, sub: 'Checked in ✅ Room ID and password will appear here 15 minutes before the start.' };
  if (m.status === 'room') return { label: where, main: head, sub: 'Join the custom room in Free Fire with your slot number ' + slot + '.',
    room: `<div class="room"><div><span>Room ID</span><b>${esc(m.roomId)}</b><button class="btn small ghost" data-act="copy" data-text="${esc(m.roomId)}">Copy</button></div><div><span>Password</span><b>${esc(m.roomPass)}</b><button class="btn small ghost" data-act="copy" data-text="${esc(m.roomPass)}">Copy</button></div></div>` };
  if (m.status === 'live') return { label: where, main: head + ' · LIVE', sub: 'Good luck!' };
  return { label: where, main: 'Match ' + m.no + ' finished', sub: m.resultStatus === 'submitted' ? 'Results are being checked by the admin.' : 'Results will be posted soon.' };
}
function viewTeamDash() {
  const t = S.teams.find(x => x.code === session.teamCode);
  if (!t) { if (Cloud.on) { Cloud.refreshTeam().then(ok => ok && render()); return '<p class="muted">Loading…</p>'; } session.teamCode = null; save(); return viewMyTeamLogin(); }
  const na = nextAction(t);
  const history = S.stages.map(st => {
    const g = st.groups.find(g => g.teamIds.includes(t.id)); if (!g) return '';
    const rows = g.matches.filter(m => m.resultStatus === 'approved').map(m => { const r = m.results[t.id] || {}; return `<tr><td>${m.no}</td><td>${esc(m.map)}</td><td>${r.noShow ? 'No-show' : '#' + r.place}</td><td>${r.noShow ? 0 : r.kills}</td><td><b>${r.noShow ? 0 : E.matchPoints(r.place, r.kills)}</b></td></tr>`; }).join('');
    const me = rowsOf(g).find(x => x.teamId === t.id);
    return `<h3 style="margin-top:16px">${st.name} · Group ${GL(g.label)} <span class="muted small">· rank #${me.rank} · ${me.points} pts</span></h3>
      ${rows ? `<div class="tw"><table><thead><tr><th>Match</th><th>Map</th><th>Position</th><th>Kills</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted small">No results yet.</p>'}`;
  }).join('');
  const myMatches = S.stages.flatMap(st => st.groups.filter(g => g.teamIds.includes(t.id)).flatMap(g => g.matches.filter(m => m.resultStatus === 'approved').map(m => ({ m, st }))));
  return `<div class="row between"><div class="row" style="gap:14px">${avatar(t, 64)}<div><h1>${esc(t.name)} ${t.entry === 'WC' ? '<span class="badge b-wc">Wild Card</span>' : ''}</h1><p class="sub">Team ID ${esc(t.code)} ${t.slotNo ? '· Slot ' + t.slotNo : ''} · ${statusBadge(t.status)}</p></div></div>
    <button class="btn ghost small" data-act="teamlogout">Log out</button></div>
  <div class="next"><div class="label">${esc(na.label)}</div><div class="main">${esc(na.main)}</div><div class="muted">${esc(na.sub)}</div>${na.room || ''}${na.action ? '<div style="margin-top:10px">' + na.action + '</div>' : ''}</div>
  ${statCards(t)}
  ${myPath(t)}
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Players</h3><div class="tw"><table><thead><tr><th>#</th><th>In Game Name</th><th>UID</th><th>Mobile</th></tr></thead><tbody>
      ${t.players.map((p, i) => `<tr><td>${i + 1}${i === 0 ? ' 👑' : ''}</td><td>${esc(p.name)}</td><td>${esc(p.uid)}</td><td>${maskMobile(p.mobile)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h3>Complaint about a result</h3><p class="small muted">Within 30 minutes of the result, with a screenshot.</p>
      ${myMatches.length ? `<form data-form="complaint"><input type="hidden" name="team" value="${t.id}">
        <label>Match</label><select name="match">${myMatches.map(({ m, st }) => `<option value="${m.id}">${st.name} · Match ${m.no}</option>`).join('')}</select>
        <label>What is wrong?</label><textarea name="reason" rows="2" required></textarea>
        <label>Screenshot</label><input type="file" name="shot" accept="image/*">
        <div class="row" style="margin-top:10px"><button class="btn small">Send complaint</button></div></form>` : '<p class="muted small">Available after your first result.</p>'}
      ${S.complaints.filter(c => c.teamId === t.id).map(c => `<p class="small">• ${esc(c.reason)} — ${statusBadge(c.status)} ${c.answer ? esc(c.answer) : ''}</p>`).join('')}
    </div>
  </div>
  ${teamWaCard(t)}
  <h2>Results</h2>${history || '<p class="muted">No matches yet.</p>'}`;
}

function myPath(t) {
  if (!S.stages.length || !findTeamPlace(t.id)) return '';
  const p = plan();
  const steps = p.map((ps, i) => {
    const st = S.stages[i];
    const g = st && st.groups.find(x => x.teamIds.includes(t.id));
    if (!st || st.status === 'draft') return { name: ps.name, state: 'next', txt: 'Coming up' };
    if (!g) return { name: ps.name, state: 'out', txt: '—' };
    const r = rowsOf(g).find(x => x.teamId === t.id);
    const where = st.final ? 'Grand Final' : 'Group ' + GL(g.label);
    if (st.status !== 'done') return { name: ps.name, state: 'live', txt: `${where} · #${r.rank}` };
    if (st.final) return { name: ps.name, state: r.rank === 1 ? 'win' : 'ok', txt: r.rank === 1 ? '🏆 Champions' : 'Finished #' + r.rank };
    return (st.qualified || []).includes(t.id) ? { name: ps.name, state: 'ok', txt: `${where} · #${r.rank} ✓` } : { name: ps.name, state: 'bad', txt: `${where} · #${r.rank} · Out` };
  });
  const cut = steps.findIndex(x => x.state === 'bad');
  const shown = cut >= 0 ? steps.slice(0, cut + 1) : steps;
  return `<div class="card glass" style="margin-top:14px"><div class="row between"><h3>Your path</h3><a class="small" href="#/bracket">Full bracket →</a></div>
    <div class="path">${shown.map(x => `<div class="pstep ${x.state}"><b>${esc(x.name)}</b><span>${esc(x.txt)}</span></div>`).join('<i></i>')}</div></div>`;
}
function teamWaCard(t) {
  const pl = findTeamPlace(t.id);
  const link = pl && pl.stage.status !== 'draft' ? (S.groupLinks[linkKey(pl.stage, pl.group)]?.link || '') : '';
  const msgs = S.notifications.filter(n => n.teamId === t.id).slice(0, 8);
  if (!link && !msgs.length) return '';
  return `<div class="card" style="margin-top:14px"><div class="row between"><h3>Messages</h3>${link ? `<a class="btn small green" target="_blank" rel="noopener" href="${esc(link)}">Join ${pl.stage.final ? 'Grand Final' : 'Group ' + GL(pl.group.label)} WhatsApp group</a>` : ''}</div>
    ${msgs.map(n => `<div style="border-top:1px solid var(--line);padding:8px 0"><div class="small muted">${new Date(n.at).toLocaleString('en-IN')}</div><div style="white-space:pre-line">${esc(n.text)}</div></div>`).join('')}</div>`;
}
function statCards(t) {
  const pl = findTeamPlace(t.id); if (!pl) return '';
  const all = S.stages.flatMap(st => st.groups.filter(g => g.teamIds.includes(t.id)).map(g => rowsOf(g).find(r => r.teamId === t.id)));
  const sum = k => all.reduce((a, r) => a + r[k], 0);
  const me = rowsOf(pl.group).find(r => r.teamId === t.id);
  const ic = d => `<svg class="sicon" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  return `<div class="grid g4" style="margin-top:14px">
    <div class="card stat">${ic('M7 3h10v3a5 5 0 0 1-4 4.9V14h3v2H8v-2h3v-3.1A5 5 0 0 1 7 6zm-4 1h3v2a3 3 0 0 0 1 2.2A4 4 0 0 1 3 6zm18 0v2a4 4 0 0 1-4 2.2A3 3 0 0 0 18 6V4zM6 18h12v3H6z')}<b>#${me.rank}</b><span>Rank in ${pl.stage.final ? 'Grand Final' : 'Group ' + GL(pl.group.label)}</span></div>
    <div class="card stat">${ic('M12 2l2.9 6.9L22 9.3l-5.5 4.7L18.2 21 12 17.3 5.8 21l1.7-7L2 9.3l7.1-.4z')}<b>${me.points}</b><span>${esc(pl.stage.name)} points</span></div>
    <div class="card stat">${ic('M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 17.9V17h-2v2.9A8 8 0 0 1 4.1 13H7v-2H4.1A8 8 0 0 1 11 4.1V7h2V4.1A8 8 0 0 1 19.9 11H17v2h2.9A8 8 0 0 1 13 19.9zM12 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2z')}<b>${sum('kills')}</b><span>Total kills</span></div>
    <div class="card stat">${ic('M18 2H6v2H2v3a4 4 0 0 0 4 4h.3A6 6 0 0 0 11 14.9V18H8v2h8v-2h-3v-3.1a6 6 0 0 0 4.7-3.9H18a4 4 0 0 0 4-4V4h-4zM4 7V6h2v3a2 2 0 0 1-2-2zm16 0a2 2 0 0 1-2 2V6h2z')}<b>${sum('booyahs')}</b><span>Booyahs</span></div></div>
    <p class="small muted" style="margin:6px 2px 0">Points and ranks update when the organiser approves or corrects a result.</p>`;
}

// ---------- public pages ----------
function stagePicker(route) {
  if (!S.stages.length) return '';
  const sel = Number(params().stage ?? S.stages.length - 1);
  return `<div class="tabs">${S.stages.map((s, i) => `<a href="#/${route}?stage=${i}" class="${i === sel ? 'on' : ''}">${s.name}</a>`).join('')}</div>`;
}
const pickStage = () => S.stages[Number(params().stage ?? S.stages.length - 1)] || curStage();
// ---------- tournament header (public pages) ----------
function tourStatus() {
  const st = curStage();
  if (!st) return S.settings.regOpen ? ['Registration open', 'b-ok'] : ['Registration closed', 'b-warn'];
  if (st.final && st.status === 'done') return ['Finished', ''];
  const live = st.groups.some(g => g.matches.some(m => m.status === 'live'));
  return live ? ['● LIVE · ' + st.name, 'b-bad'] : [st.name + (st.status === 'draft' ? ' · coming soon' : ''), 'b-acc'];
}
function allMatches() { return S.stages.flatMap(st => st.groups.flatMap(g => g.matches.map(m => ({ st, g, m })))); }
const IC = {
  pad: '<svg viewBox="0 0 24 24"><path d="M7 6h10a5 5 0 0 1 5 5v2a5 5 0 0 1-8.6 3.5L12 15l-1.4 1.5A5 5 0 0 1 2 13v-2a5 5 0 0 1 5-5zm0 3v2H5v2h2v2h2v-2h2v-2H9V9zm9.5 1a1.5 1.5 0 1 0 1.5 1.5 1.5 1.5 0 0 0-1.5-1.5z"/></svg>',
  users: '<svg viewBox="0 0 24 24"><path d="M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1.1.4-2.1 1.2-3A11 11 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z"/></svg>',
  cup: '<svg viewBox="0 0 24 24"><path d="M18 2H6v2H2v3a4 4 0 0 0 4 4h.3A6 6 0 0 0 11 14.9V18H8v2h8v-2h-3v-3.1a6 6 0 0 0 4.7-3.9H18a4 4 0 0 0 4-4V4h-4zM4 7V6h2v3a2 2 0 0 1-2-2zm16 0a2 2 0 0 1-2 2V6h2z"/></svg>',
  cal: '<svg viewBox="0 0 24 24"><path d="M7 2h2v2h6V2h2v2h3v18H4V4h3zm-1 8v10h12V10z"/></svg>',
  pin: '<svg viewBox="0 0 24 24"><path d="M12 2a7 7 0 0 1 7 7c0 5-7 13-7 13S5 14 5 9a7 7 0 0 1 7-7zm0 4a3 3 0 1 0 3 3 3 3 0 0 0-3-3z"/></svg>',
  coin: '<svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 15.9V19h-2v-1.1a3.6 3.6 0 0 1-3-3.4h2a1.8 1.8 0 0 0 2 1.6c1.3 0 2-.6 2-1.4s-.6-1.2-2.4-1.6c-2-.5-3.4-1.2-3.4-3a3.2 3.2 0 0 1 2.8-3V6h2v1.1a3.3 3.3 0 0 1 2.7 3.1h-2a1.6 1.6 0 0 0-1.8-1.4c-1.1 0-1.7.5-1.7 1.2s.7 1.1 2.3 1.5c2 .5 3.5 1.2 3.5 3.2a3.3 3.3 0 0 1-3 3.2z"/></svg>',
  skull: '<svg viewBox="0 0 24 24"><path d="M12 2C7 2 3 5.6 3 10.5c0 2.6 1.2 4.6 3 5.9V20h3v-2h2v2h2v-2h2v2h3v-3.6c1.8-1.3 3-3.3 3-5.9C21 5.6 17 2 12 2zm-3.5 11a2 2 0 1 1 2-2 2 2 0 0 1-2 2zm7 0a2 2 0 1 1 2-2 2 2 0 0 1-2 2z"/></svg>'
};
// Tournament header (app style): logo, title, team avatars, meta chips, organiser, quick stats, then the section tabs.
function hero(route) {
  const [label, cls] = tourStatus();
  const teams = S.teams.filter(t => t.status === 'approved');
  const ms = allMatches(), played = ms.filter(x => x.m.resultStatus === 'approved').length;
  const kills = ms.filter(x => x.m.resultStatus === 'approved').reduce((a, x) => a + Object.values(x.m.results).reduce((b, r) => b + (r.kills || 0), 0), 0);
  const p0 = plan()[0], fmt = p0 ? `Groups (Top ${p0.topN ?? '-'} → Top ${Number(S.settings.laterTop) || 6}) then Grand Final` : 'Groups then Grand Final';
  const shown = teams.filter(t => t.entry === 'SLOT').slice(0, 4);
  const tabs = [['', 'Register', !S.stages.length], ['overview', 'Overview', true], ['groups', 'Group Stage', true], ['bracket', 'Bracket', true], ['schedule', 'Matches', true], ['leaderboard', 'Standings', true], ['info', 'Rules', true]].filter(t => t[2]);
  return `<section class="th">
    <div class="th-art" aria-hidden="true"></div>
    <div class="th-in">
      <div class="th-logo">${logoOk() ? `<img src="${S.settings.logo}" alt="">` : IC.cup}</div>
      <div class="th-main">
        <div class="th-title"><h1>${esc(S.settings.name)}</h1>${shown.length ? `<span class="th-avs">${shown.map(t => avatar(t, 26)).join('')}${teams.length > 4 ? `<em>+${teams.length - 4}</em>` : ''}</span>` : ''}</div>
        <div class="th-meta"><span>${IC.pad} Free Fire</span><span>${IC.users} ${usedSlots()}/${S.settings.slots} Teams (4v4 squad)</span><span>${IC.cup} ${esc(fmt)}</span>${S.settings.startDate ? `<span>${IC.cal} ${fmtDate(S.settings.startDate)}</span>` : ''}<span class="badge ${cls}">${esc(label)}</span></div>
      </div>
      <div class="th-side">${S.settings.organiser ? `<div class="th-org"><span>Organized by</span>${tlogo('org-logo')}<b>${esc(S.settings.organiser)}</b></div>` : ''}
        <div class="row">${!S.stages.length && S.settings.regOpen ? '<a class="btn" href="#/">+ Register team</a>' : '<a class="btn" href="#/leaderboard">View standings</a>'}<a class="btn ghost" href="#/my-team">My Team</a></div></div>
    </div>
    <div class="th-stats">
      <div>${IC.coin}<b>${esc(S.settings.prize || 'Free')}</b><span>Prize pool</span></div>
      <div>${IC.users}<b>${usedSlots()}/${S.settings.slots}</b><span>Slots filled</span></div>
      <div>${IC.pad}<b>${played}${ms.length ? '/' + ms.length : ''}</b><span>Matches played</span></div>
      <div>${IC.skull}<b>${kills.toLocaleString('en-IN')}</b><span>Total kills</span></div>
    </div>
    <nav class="ptabs">${tabs.map(([h, l]) => `<a href="#/${h}" class="${(route.split('?')[0] || '') === h ? 'on' : ''}">${l}</a>`).join('')}</nav>
  </section>`;
}
function viewOverview() {
  const st = curStage();
  const ms = allMatches();
  const live = ms.filter(x => x.m.status === 'live');
  const upcoming = ms.filter(x => x.st.status === 'published' && x.m.resultStatus !== 'approved' && x.m.status !== 'live').slice(0, 6);
  const recent = ms.filter(x => x.m.resultStatus === 'approved').slice(-4).reverse();
  const matchCard = ({ st, g, m }) => {
    const top = m.results ? Object.entries(m.results).filter(([, r]) => r.place === 1)[0] : null;
    return `<div class="mcard${m.status === 'live' ? ' is-live' : ''}" data-map="${mapShown(m) ? esc(String(m.map).toLowerCase().replace(/\s+/g, '-')) : ''}"><div class="row between"><span class="small muted">${st.final ? 'Grand Final' : st.name + ' · Group ' + GL(g.label)}</span>${matchBadge(m)}</div>
      <div class="mtitle">Match ${m.no}${mapShown(m) ? ' · ' + esc(m.map) : ''}</div><div class="small muted">${matchDate(st, m)} · ${m.time}</div>
      ${top ? `<div class="small" style="margin-top:6px">🏆 Booyah: ${tname(top[0])}</div>` : `<div class="avs">${g.teamIds.slice(0, 8).map(id => avatar(team(id), 22)).join('')}${g.teamIds.length > 8 ? `<span class="small muted">+${g.teamIds.length - 8}</span>` : ''}</div>`}</div>`;
  };
  // Tournament-wide team totals for the "top performers" cards.
  const tot = {};
  ms.filter(x => x.m.resultStatus === 'approved').forEach(({ m }) => Object.entries(m.results).forEach(([id, r]) => {
    const t = tot[id] = tot[id] || { id, kills: 0, booyahs: 0, matches: 0 };
    t.matches++; if (!r.noShow) { t.kills += r.kills; if (r.place === 1) t.booyahs++; }
  }));
  const list = Object.values(tot);
  const topBy = k => list.slice().sort((a, b) => b[k] - a[k]).slice(0, 5);
  const perf = (title, k, unit) => `<div class="card"><h3>${title}</h3>${list.length ? topBy(k).map((x, i) => `<div class="prow"><span class="rk">${i + 1}</span>${tname(x.id)}<b>${x[k]}<span class="muted small"> ${unit}</span></b></div>`).join('') : '<p class="muted small">After the first results.</p>'}</div>`;
  const ranking = st && st.status !== 'draft' ? overallRows(st).slice(0, 10) : [];
  let champ = '';
  if (st && st.final && st.status === 'done') { const r = rowsOf(st.groups[0]); champ = `<div class="champion" style="margin-bottom:16px">${avatar(team(r[0].teamId), 64)}<span class="muted">🏆 Champion</span><b>${esc(team(r[0].teamId).name)}</b><span>${r[0].points} points</span></div>`; }
  return `${champ}
  ${live.length ? `<h2><span class="dot-live"></span> Live now</h2><div class="grid g3">${live.map(matchCard).join('')}</div>` : ''}
  <div class="grid ov">
    <div>
      <h2>${st && st.status !== 'draft' ? 'Top teams · ' + st.name : 'Get ready'}</h2>
      ${ranking.length ? `<div class="card lb"><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th>Group</th><th>${BOOYAH}</th><th>Kills</th><th>Total</th></tr></thead><tbody>
        ${ranking.map((r, i) => `<tr><td class="rk">${i + 1}</td><td>${tname(r.teamId)}</td><td>${GL(r.group)}</td><td>${r.booyahs}</td><td>${r.kills}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:10px"><a class="btn ghost small" href="#/leaderboard">Full leaderboard →</a></div></div>` : `<div class="grid g2">${countdownCard() || '<div class="card glass"><div class="eyebrow">Status</div><div class="prize" style="font-size:26px">Groups coming soon</div></div>'}
          <div class="card glass"><div class="eyebrow">Slots</div><div class="prize" style="font-size:30px">${usedSlots()}<span class="muted" style="font-size:16px"> / ${S.settings.slots}</span></div><div class="bar" style="margin:10px 0"><i style="width:${Math.min(100, usedSlots() / S.settings.slots * 100)}%"></i></div>${!S.stages.length && S.settings.regOpen ? '<a class="btn" href="#/">Register your team</a>' : ''}</div></div>`}
      <h2>${upcoming.length ? 'Upcoming matches' : recent.length ? 'Latest results' : 'Matches'}</h2>
      ${upcoming.length || recent.length ? `<div class="grid g2">${(upcoming.length ? upcoming : recent).map(matchCard).join('')}</div>` : '<p class="muted">The schedule appears when groups are published.</p>'}
    </div>
    <div>
      <h2>Top performers</h2>
      <div class="grid">${perf('Most kills', 'kills', 'kills')}${perf('Most Booyahs', 'booyahs', '🏆')}</div>
      <div class="card glass prize-card" style="margin-top:14px"><div class="eyebrow">Prize pool</div><div class="prize">${esc(S.settings.prize || 'Free entry')}</div><a class="small" href="#/info">Rules & points →</a></div>
    </div>
  </div>`;
}
// ---------- bracket (team journey, knockout-poster style) ----------
const TROPHY = '<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="tg" x1="0" x2="1"><stop offset="0" stop-color="#b9adff"/><stop offset=".5" stop-color="#7b61ff"/><stop offset="1" stop-color="#5a43d6"/></linearGradient></defs><path fill="url(#tg)" d="M18 6h28v6h10v6c0 8-6 14-13 15a14 14 0 0 1-8 7v7h9v7H20v-7h9v-7a14 14 0 0 1-8-7C14 32 8 26 8 18v-6h10zm-4 12c0 4 3 8 6 9V18zm36 0h-6v9c3-1 6-5 6-9z"/></svg>';
function myTeamId() { const t = session.teamCode && S.teams.find(x => x.code === session.teamCode); return t ? t.id : null; }
function bracketCols() {
  const p = plan(), me = myTeamId(), cols = [];
  p.forEach((ps, i) => {
    const st = S.stages[i];
    if (!st || st.status === 'draft') { cols.push({ name: ps.name, final: ps.final, tbd: true, count: ps.sizes.length, wc: ps.wcJoin }); return; }
    const groups = st.groups.map(g => {
      const rows = rowsOf(g);
      const played = g.matches.filter(m => m.resultStatus === 'approved').length;
      const shown = st.status === 'done' && !st.final ? rows.filter(r => (st.qualified || []).includes(r.teamId)) : rows;
      const days = [...new Set(g.matches.map(m => m.day))];
      return { label: st.final ? 'Grand Final' : 'Group ' + GL(g.label), rows: shown, all: rows, played, total: g.matches.length, mine: g.teamIds.includes(me),
        when: (days.length > 1 ? matchDate(st, g.matches[0]) + ' – ' + matchDate(st, g.matches[g.matches.length - 1]) : matchDate(st, g.matches[0])) + ', ' + g.matches[0].time, idx: st.groups.indexOf(g) };
    });
    cols.push({ name: st.name, final: st.final, done: st.status === 'done', groups, wc: st.wcJoin || 0 });
  });
  return cols;
}
let bracketQuery = '';
function viewBracketTeams() {
  const phase = params().phase || 'summary';
  const wc = phase === 'wc';
  const st = phase === 'summary' || phase === 'poster' || phase === 'road' || wc ? null : S.stages[Number(phase)];
  const tabs = `<div class="ph-tabs"><a href="#/bracket" class="${phase === 'summary' ? 'on' : ''}"><b>Summary</b><span>${S.stages.length ? S.stages[0].entering + wcTeams().length + ' teams' : 'Coming soon'}</span></a>
    <a href="#/bracket?phase=road" class="${phase === 'road' ? 'on' : ''}"><b>Road map</b><span>Top to bottom</span></a>
    <a href="#/bracket?phase=poster" class="${phase === 'poster' ? 'on' : ''}"><b>Poster</b><span>Wide view</span></a>
    <a href="#/bracket?phase=wc" class="${wc ? 'on' : ''}"><b>★ Wild Card entry</b><span>Route into ${esc((S.stages.length ? plan() : E.planStages(S.settings.slots, S.settings.wildCards, planOpts())).find(x => x.wcJoin)?.name || 'a later stage')}</span></a>
    ${S.stages.map((x, i) => `<a href="#/bracket?phase=${i}" class="${st === x ? 'on' : ''}"><b><i class="dot-${x.status}"></i>${esc(x.name)}${x.wcJoin ? ' <em class="lx-wc-tag">★ WC</em>' : ''}</b><span>${x.final ? '12 teams' : x.groups.length + ' groups'}${x.wcJoin ? ' · +' + x.wcJoin + ' Wild Cards' : ''}</span></a>`).join('')}</div>`;
  const search = S.stages.length && !wc ? `<div class="ph-search"><input type="search" placeholder="Search your team" value="${esc(bracketQuery)}" data-act="bsearch" aria-label="Search team"></div>` : '';
  return `<div class="row between ph-bar">${tabs}${search}</div>${wc ? viewWcRoute() : phase === 'poster' ? viewBracketPoster() : phase === 'road' ? viewRoadmap(false) : st ? viewPools(st) : viewColBracket() + (S.stages.length ? finalStandings() : '')}`;
}
// Column bracket (reference: left-to-right rounds, small header pills, boxed slots with a score chip).
// One column per stage; each box is a group with its top teams and points.
function viewColBracket() {
  const p = S.stages.length ? plan() : E.planStages(S.settings.slots, wcPlanned() || S.settings.wildCards, planOpts()), me = myTeamId();
  const q = bracketQuery.trim().toLowerCase();
  const MAXBOX = 8;
  const cols = p.map((ps, i) => {
    const b = S.stages[i] && S.stages[i].status !== 'draft' ? S.stages[i] : null;
    const mt = b ? (b.matchCount || ps.matches) : ps.matches, topN = b && !b.final ? b.topN : ps.topN;
    const head = `${esc(ps.name)} <em>(${ps.final ? 'MT ' + mt : 'Top ' + topN + ' · MT ' + mt})</em>`;
    let boxes = '';
    if (b) {
      const list = b.groups.map((g, gi) => ({ g, gi, rows: rowsOf(g) }));
      const hit = list.filter(x => (me && x.g.teamIds.includes(me)) || (q && x.g.teamIds.some(id => (team(id)?.name || '').toLowerCase().includes(q))));
      const pick = (hit.length ? hit.concat(list.filter(x => !hit.includes(x))) : list).slice(0, ps.final ? 1 : MAXBOX);
      const show = ps.final ? 12 : Math.min(3, topN || 3);
      boxes = pick.map(({ g, gi, rows }) => {
        const done = g.matches.filter(m => m.resultStatus === 'approved').length;
        const top = rows.slice(0, show);
        const extra = me && !top.some(r => r.teamId === me) && rows.find(r => r.teamId === me);
        const line = (r) => { const q2 = !ps.final && r.rank <= topN, mine = r.teamId === me; return `<div class="cb-row${mine ? ' me' : ''}${q && (team(r.teamId)?.name || '').toLowerCase().includes(q) ? ' hit' : ''}"><span class="cb-seed">${r.rank}</span>${tname(r.teamId)}<b class="${q2 || (ps.final && r.rank === 1 && b.status === 'done') ? 'on' : ''}">${done ? r.points : '–'}</b></div>`; };
        return `<div class="cb-box"><span class="cb-no">${ps.final ? '★' : gi + 1}</span><a class="cb-h" href="#/leaderboard?stage=${i}">${ps.final ? 'Grand Final' : 'Group ' + GL(g.label)} <span>${done}/${g.matches.length}</span></a>${top.map(line).join('')}${extra ? '<div class="cb-gap">⋯</div>' + line(extra) : ''}${!ps.final && g.teamIds.length > show ? `<div class="cb-more">+${g.teamIds.length - show} more teams</div>` : ''}</div>`;
      }).join('') + (!ps.final && b.groups.length > MAXBOX ? `<a class="cb-all" href="#/bracket?phase=${i}">Show all ${b.groups.length} groups →</a>` : '');
    } else {
      const n = Math.min(ps.final ? 1 : ps.sizes.length, ps.final ? 1 : 4);
      boxes = Array.from({ length: n }, (_, k) => `<div class="cb-box tbd"><span class="cb-no">${ps.final ? '★' : k + 1}</span><div class="cb-h">${ps.final ? 'Grand Final' : 'Group ' + (k + 1)} <span>TBD</span></div>${'<div class="cb-row"><span class="cb-seed">–</span><span class="muted">To be decided</span><b>–</b></div>'.repeat(2)}</div>`).join('') + (!ps.final && ps.sizes.length > n ? `<div class="cb-more">+${ps.sizes.length - n} more groups</div>` : '');
    }
    return `<div class="cb-col${ps.final ? ' final' : ''}"><div class="cb-pill">${head}</div>${ps.wcJoin ? `<div class="cb-wc">★ ${ps.wcJoin} Wild Cards join</div>` : ''}${boxes}</div>`;
  }).join('');
  return `<div class="cb-scroll"><div class="cb">${cols}</div></div>`;
}
// Roadmap: the whole tournament, top to bottom. Used on the public Bracket page and the admin Stages page.
function viewRoadmap(admin) {
  const p = S.stages.length ? plan() : E.planStages(S.settings.slots, wcPlanned() || S.settings.wildCards, planOpts());
  const rows = p.map((ps, i) => {
    const b = S.stages[i], live = b && b.status === 'published', done = b && b.status === 'done';
    const entering = b ? b.entering : ps.entering, groups = b ? b.groups.length : ps.sizes.length;
    const mt = b ? (b.matchCount || ps.matches) : ps.matches, topN = b && !b.final ? b.topN : ps.topN;
    const adv = b && done && !ps.final ? (b.qualified || []).length : ps.advancing;
    const state = done ? ['Completed', 'b-ok'] : live ? ['Live', 'b-bad'] : b ? ['Draft', 'b-warn'] : ['Coming up', ''];
    const g0 = b && ps.final ? b.groups[0] : null, champ = g0 && done ? rowsOf(g0)[0] : null;
    const date = b && stageStart(b) ? matchDate(b, { day: 1 }) : '';
    return `<div class="rm-step${live ? ' live' : ''}${done ? ' done' : ''}${ps.final ? ' final' : ''}">
      <div class="rm-no">${ps.final ? '★' : String(i + 1).padStart(2, '0')}</div>
      <div class="rm-card"><div class="rm-main"><div class="rm-name">${esc(ps.name)} <span class="badge ${state[1]}">${state[0]}</span></div>
          <div class="rm-facts"><span><b>${entering}</b> teams</span><span><b>${groups}</b> group${groups > 1 ? 's' : ''}</span><span><b>MT ${mt}</b> matches each</span>${date ? `<span>${date}</span>` : ''}${ps.final && rushOn() ? `<span>Champion Rush · ${rushTarget()} pts</span>` : ''}</div></div>
        <div class="rm-out">${ps.final ? (champ ? `<span class="rm-champ">Champion</span>${tname(champ.teamId)}` : '<span class="rm-champ">Champion</span><span class="muted">To be decided</span>') : `<span class="rm-top">Top ${topN}</span><span class="muted small">per group qualify</span>`}</div>
        ${b && b.status !== 'draft' ? `<a class="btn ghost small" href="${admin ? '#/leaderboard?stage=' + i : '#/bracket?phase=' + i}">View</a>` : ''}</div>
      ${ps.wcJoin ? `<div class="rm-wc"><b>★ ${ps.wcJoin} Wild Cards</b><span>join here</span></div>` : ''}
    </div>${ps.final ? '' : `<div class="rm-link"><i></i><span><b>${adv}</b> teams advance${ps.fill && !(b && done) ? ` (incl. best ${ps.fill} of the rest, so the final has 12)` : ''}</span></div>`}`;
  }).join('');
  return `<div class="rm">${rows}</div>`;
}
// Two-lane route: Wild Card entry above, main tournament below, a dashed gold line where the Wild Cards join.
function viewWcRoute() {
  // Before groups exist, plan from the slot limit (e.g. 252), not from the few teams registered so far.
  const p = S.stages.length ? plan() : E.planStages(S.settings.slots, wcPlanned() || S.settings.wildCards, planOpts()), j = p.findIndex(x => x.wcJoin), n = p.length;
  const js = j >= 0 ? p[j] : null, wcN = js ? js.wcJoin : 0;
  const built = i => S.stages[i] && S.stages[i].status !== 'draft' ? S.stages[i] : null;
  const state = i => { const b = built(i); return b ? (b.status === 'done' ? ['Completed', 'done'] : ['Live', 'live']) : ['Coming up', 'next']; };
  // Wild Card team names appear only once their stage is published (before that they are private).
  const joined = js && built(j) ? built(j).groups.flatMap(g => g.teamIds).filter(id => team(id)?.entry === 'WC') : [];
  const slots = Array.from({ length: wcN }, (_, k) => joined[k] ? `<span class="rt-chip named">${avatar(team(joined[k]), 18)}${esc(team(joined[k]).name)}</span>` : `<span class="rt-chip">★ Wild Card ${k + 1}</span>`).join('');
  const cards = (ps, i) => {
    const b = built(i), sizes = b ? b.groups.map(g => g.teamIds.length) : ps.sizes, labels = b ? b.groups.map(g => GL(g.label)) : sizes.map((_, k) => String.fromCharCode(65 + (k % 26)));
    const rule = ps.final ? 'Final ranking' : 'Top ' + ps.topN + ' qualify';
    return sizes.slice(0, 2).map((z, k) => `<div class="rt-card${i === j ? ' wc' : ''}"><b>${ps.final ? 'Grand Final' : 'Group ' + labels[k]}</b><span>${z} teams · ${rule}</span></div>`).join('')
      + (sizes.length > 2 ? `<div class="rt-more">+${sizes.length - 2} more groups</div>` : '');
  };
  const cols = `grid-template-columns:repeat(${n}, minmax(168px, 1fr))`;
  return `<div class="rt">
    <div class="rt-scroll"><div class="rt-inner" style="--n:${n}">
      <div class="rt-lane wc"><div class="rt-lane-h"><b>★ Wild Card entry</b><span>${wcN ? `${wcN} invited teams · they skip the early stages and join ${esc(js.name)}` : 'No Wild Cards set for this tournament'}</span></div></div>
      <div class="rt-grid" style="${cols}">
        ${p.map((ps, i) => i === j ? `<div class="rt-wcbox"><div class="rt-wcbox-h"><b>Wild Card teams</b><span>${wcN} teams · invited by the organiser</span></div><div class="rt-chips">${slots}</div>
          <div class="rt-steps"><span>Invite</span><i>→</i><span>Register</span><i>→</i><span>Approved</span><i>→</i><span>Placed in ${esc(js.name)}</span></div></div>` : '<div></div>').join('')}
      </div>
      ${js ? `<div class="rt-grid rt-link-row" style="${cols}">${p.map((ps, i) => i === j ? `<div class="rt-link"><span class="rt-pill">${wcN} WILD CARDS → ${esc(js.name.toUpperCase())}</span></div>` : '<div></div>').join('')}</div>` : ''}
      <div class="rt-lane main"><div class="rt-lane-h"><b>Main tournament</b><span>${p[0].entering} teams entering · ${p[n - 1].entering} in the Grand Final</span></div></div>
      <div class="rt-grid rt-stages" style="${cols}">
        ${p.map((ps, i) => { const [lbl, cls] = state(i); return `<div class="rt-col${i === j ? ' wc' : ''}">
          <div class="rt-col-h"><b>${esc(ps.name)}${i === j ? ' <em class="lx-wc-tag">★ +' + wcN + ' WC</em>' : ''}</b><span>${ps.entering} teams · ${ps.sizes.length} group${ps.sizes.length > 1 ? 's' : ''} · <i class="st-${cls}">${lbl}</i></span></div>
          ${cards(ps, i)}
          ${i === j ? `<div class="rt-merge">${ps.entering - wcN} qualified + ${wcN} Wild Card${wcN > 1 ? 's' : ''}</div>` : ''}
          ${i < n - 1 ? '<i class="rt-arrow" aria-hidden="true">→</i>' : ''}</div>`; }).join('')}
      </div>
    </div></div>
    <p class="small muted" style="margin:10px 4px 0">${joined.length ? 'Wild Card teams are shown in their groups now that ' + esc(js.name) + ' is published.' : 'Wild Card team names stay private until the organiser places them and publishes ' + esc(js ? js.name : 'their stage') + '.'}</p>
  </div>`;
}
// start.gg-style pool list for one stage: status, qualified chips with arrows, "+N more".
function viewPools(st) {
  const q = bracketQuery.trim().toLowerCase(), me = myTeamId(), next = S.stages[st.index + 1];
  const statusOf = g => { const d = g.matches.filter(m => m.resultStatus === 'approved').length; return st.status === 'draft' ? ['Upcoming', ''] : d === g.matches.length ? ['Complete', 'b-ok'] : d ? ['In progress', 'b-acc'] : ['Not started', '']; };
  const groups = st.groups.filter(g => !q || g.teamIds.some(id => (team(id)?.name || '').toLowerCase().includes(q)));
  const adv = st.final ? 'Final ranking' : `Top ${st.topN}/group → ${next ? esc(next.name) : 'next stage'}`;
  return `<div class="card glass ph-head"><div class="row between"><div><h2 style="margin:0">${esc(st.name)}</h2>
      <div class="ph-facts"><span>${st.groups.length} group${st.groups.length > 1 ? 's' : ''}</span><span>${st.entering} teams</span>${st.wcJoin ? `<span>incl. ${st.wcJoin} Wild Cards</span>` : ''}<span>${adv}</span></div></div>
      <span class="badge ${st.status === 'done' ? 'b-ok' : st.status === 'published' ? 'b-acc' : ''}">${st.status === 'done' ? 'Complete' : st.status === 'published' ? 'Live' : 'Upcoming'}</span></div></div>
    ${groups.length ? groups.map(g => {
      const rows = rowsOf(g), [sl, sc] = statusOf(g);
      const hit = id => q && (team(id)?.name || '').toLowerCase().includes(q);
      const shownIds = [...rows.slice(0, st.final ? 12 : st.topN).map(r => r.teamId), ...rows.filter(r => hit(r.teamId) || r.teamId === me).map(r => r.teamId)].filter((v, i, a) => a.indexOf(v) === i);
      return `<div class="pool${g.teamIds.includes(me) ? ' mine' : ''}"><div class="pool-h"><b>${st.final ? 'Grand Final' : 'Group ' + GL(g.label)}</b><span class="badge ${sc}">${sl}</span>
          <a class="small" href="#/leaderboard?stage=${st.index}">Full table →</a></div>
        <div class="chips">${shownIds.map(id => { const r = rows.find(x => x.teamId === id), up = st.status === 'done' && (st.qualified || []).includes(id), top = !st.final && r.rank <= st.topN;
          return `<span class="tchip${up || (st.final && r.rank === 1 && st.status === 'done') ? ' up' : top && st.status !== 'done' ? ' lead' : ''}${hit(id) ? ' hit' : ''}${id === me ? ' me' : ''}">${avatar(team(id), 18)}<span>${esc(team(id).name)}</span>${team(id).entry === 'WC' ? '<b class="lx-wcchip">WC</b>' : ''}${g.matches.some(m => m.resultStatus === 'approved') ? `<em>${r.points}</em>` : ''}${up ? '<i>→</i>' : ''}</span>`; }).join('')}
          ${rows.length > shownIds.length ? `<span class="more">+${rows.length - shownIds.length} more</span>` : ''}</div></div>`;
    }).join('') : `<p class="muted">No group has a team called “${esc(bracketQuery)}”.</p>`}`;
}
// VLR-style final placements under the bracket once the Grand Final is done.
function finalStandings() {
  const last = S.stages[S.stages.length - 1];
  if (!last.final || last.status !== 'done') return '';
  const rows = rowsOf(last.groups[0]);
  const medal = ['🥇', '🥈', '🥉'];
  return `<h2 style="margin-top:26px">Final standings</h2><div class="card glass"><div class="tw"><table><thead><tr><th>Place</th><th>Team</th><th>${BOOYAH}</th><th>Kills</th><th>Points</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r.rank <= 3 ? 'podium p' + r.rank : ''}"><td class="rk">${medal[r.rank - 1] || r.rank + (r.rank > 3 ? 'th' : '')}</td><td>${tname(r.teamId)}</td><td>${r.booyahs}</td><td>${r.kills}</td><td><b>${r.points}</b></td></tr>`).join('')}</tbody></table></div></div>`;
}
function viewBracketPoster() {
  if (!S.stages.length) return `<div class="lx lx-empty"><h2 class="lx-title">${esc(S.settings.name)}</h2><p>The bracket appears when the first groups are published.</p></div>`;
  const cols = bracketCols(), me = myTeamId();
  const last = S.stages[S.stages.length - 1];
  const champ = last.final && last.status === 'done' ? rowsOf(last.groups[0])[0] : null;
  const stageOf = name => S.stages.find(x => x.name === name);
  const isWc = id => team(id)?.entry === 'WC';
  const plate = (r, side, score, hi) => `<div class="lx-plate ${side}${hi ? ' hi' : ''}${r.teamId === me ? ' me' : ''}${isWc(r.teamId) ? ' wc' : ''}">${avatar(team(r.teamId), 22)}<span>${esc(team(r.teamId)?.name || '')}</span>${isWc(r.teamId) ? '<b class="lx-wcchip">WC</b>' : ''}<i>${score}</i></div>`;
  // Wild Card roadmap: a gold entry block at the top of the stage where the Wild Cards join (split across both halves).
  const wcBlock = (c, side, ids, count) => `<div class="lx-wc ${side}"><div class="lx-wc-h">★ Wild Card entry</div>
    ${ids && ids.length ? ids.map(id => `<div class="lx-plate ${side} wc${id === me ? ' me' : ''}">${avatar(team(id), 22)}<span>${esc(team(id)?.name || '')}</span><b class="lx-wcchip">WC</b></div>`).join('')
      : `<div class="lx-wc-n">+${count} Wild Card team${count === 1 ? '' : 's'}</div>`}
    <div class="lx-wc-to">Join ${esc(c.name)} ↓</div></div>`;
  const block = (g, c, side) => {
    const st = stageOf(c.name), rows = c.done ? g.rows : g.all;
    return `<div class="lx-blk${g.mine ? ' mine' : ''}" data-col><div class="lx-lbl">${esc(GL(g.label))} <em>${g.played}/${g.total}</em></div>
      ${rows.slice(0, 3).map(r => plate(r, side, g.played ? r.points : '–', g.played && st?.status === 'done')).join('')}
      ${rows.length > 3 ? `<div class="lx-more">+${rows.length - 3} more</div>` : ''}</div>`;
  };
  const summary = (gs, c, side) => {
    const teams = gs.reduce((a, g) => a + g.all.length, 0), q = c.done ? gs.reduce((a, g) => a + g.rows.length, 0) : null, mine = gs.find(g => g.mine);
    const idx = S.stages.findIndex(x => x.name === c.name);
    return `<a class="lx-blk lx-sum" data-col href="#/bracket?phase=${idx}"><div class="lx-lbl">${gs.length} groups <em>View →</em></div>
      <div class="lx-plate ${side} hi"><span>Teams</span><i>${teams}</i></div><div class="lx-plate ${side}"><span>${q != null ? 'Qualified' : 'Playing'}</span><i>${q != null ? q : '…'}</i></div></a>${mine ? block(mine, c, side) : ''}`;
  };
  const tbd = (n, side) => Array.from({ length: n }, () => `<div class="lx-blk tbd" data-col><div class="lx-lbl">TBD</div><div class="lx-plate ${side}"><span>Qualified teams</span><i>–</i></div></div>`).join('');
  // Split every stage's groups into a left and a right half that meet at the Grand Final.
  const sideCols = side => cols.filter(c => !c.final).map(c => {
    if (c.tbd) {
      const n = Math.ceil(c.count / 2), k = side === 'L' ? n : c.count - n;
      const w = c.wc ? (side === 'L' ? Math.ceil(c.wc / 2) : Math.floor(c.wc / 2)) : 0;
      return { c, html: (w ? wcBlock(c, side, null, w) : '') + tbd(Math.min(Math.max(k, 1), 3), side) };
    }
    const half = Math.ceil(c.groups.length / 2), gs = side === 'L' ? c.groups.slice(0, half) : c.groups.slice(half);
    const wcIds = c.wc ? gs.flatMap(g => g.all.map(r => r.teamId)).filter(isWc) : [];
    return { c, html: (wcIds.length ? wcBlock(c, side, wcIds) : '') + (gs.length > 3 ? summary(gs, c, side) : gs.map(g => block(g, c, side)).join('')) };
  });
  const L = sideCols('L'), R = sideCols('R').reverse();
  const fc = cols.find(c => c.final), fg = fc && !fc.tbd ? fc.groups[0] : null;
  const col = (x, side) => `<div class="lx-col" data-side="${side}"><div class="lx-stack">${x.html}</div></div>`;
  const head = c => esc(c.name) + (c.wc ? ` <span class="lx-wc-tag">★ +${c.wc} WC</span>` : '');
  const heads = [...L.map(x => head(x.c)), 'Grand Final', ...R.map(x => head(x.c))];
  return `<div class="lx">
    <div class="lx-rays" aria-hidden="true"></div>
    <h2 class="lx-title">${esc(S.settings.name)} ${new Date(S.settings.startDate || Date.now()).getFullYear()}</h2>
    <div class="lx-scroll"><div class="lx-grid" style="grid-template-columns:repeat(${L.length},minmax(176px,1fr)) minmax(230px,1.2fr) repeat(${R.length},minmax(176px,1fr))">
      ${heads.map(h => `<div class="lx-head">${h}</div>`).join('')}
      ${L.map(x => col(x, 'L')).join('')}
      <div class="lx-col lx-center" data-side="C"><div class="lx-stack">
        <div class="lx-champ" data-col><div class="lx-champ-t">${champ ? '¡Champion!' : 'Champion'}</div><div class="lx-champ-n">${champ ? esc(team(champ.teamId).name) : 'To be decided'}</div>
          <div class="lx-cup">${TROPHY}</div>${champ ? `<div class="lx-crest">${avatar(team(champ.teamId), 64)}<b>${champ.points} pts</b></div>` : ''}</div>
        ${fg ? `<div class="lx-final">${fg.all.slice(0, 4).map((r, i) => plate(r, 'L', fg.played ? r.points : '–', i === 0 && champ)).join('')}${fg.all.length > 4 ? `<a class="lx-more" href="#/leaderboard?stage=${S.stages.length - 1}">All 12 finalists →</a>` : ''}</div>` : `<div class="lx-final"><div class="lx-plate L"><span>12 finalists</span><i>–</i></div></div>`}
      </div></div>
      ${R.map(x => col(x, 'R')).join('')}
    </div><svg class="vb-lines lx-lines" aria-hidden="true"></svg></div>
    <div class="lx-foot"><span>${esc(S.settings.organiser || '')}</span><span>★ = where the Wild Cards join · Scroll sideways to follow every round${me ? ' · your team glows gold' : ''}</span></div>
  </div>`;
}
// Elbow lines: each column's boxes → a spine → the next column toward the centre (mirrored on the right).
function drawBracketLines() {
  const svg = document.querySelector('.lx-lines'), grid = document.querySelector('.lx-grid');
  if (!svg || !grid) return;
  const base = grid.getBoundingClientRect();
  const rects = el => [...el.querySelectorAll('[data-col]')].map(b => b.getBoundingClientRect());
  const L = [...grid.querySelectorAll('[data-side=L]')].map(rects), R = [...grid.querySelectorAll('[data-side=R]')].map(rects).reverse();
  const C = rects(grid.querySelector('[data-side=C]')).slice(0, 1);
  svg.setAttribute('width', base.width); svg.setAttribute('height', base.height);
  const X = v => v - base.left, Y = r => r.top + r.height / 2 - base.top;
  let d = '';
  const join = (a, b, dir) => {   // dir 1: left→right, -1: right→left
    if (!a.length || !b.length) return;
    const ax = dir > 0 ? Math.max(...a.map(r => r.right)) : Math.min(...a.map(r => r.left));
    const bx = dir > 0 ? Math.min(...b.map(r => r.left)) : Math.max(...b.map(r => r.right));
    const sx = (X(ax) + X(bx)) / 2, ys = [];
    a.forEach(r => { d += `M${X(dir > 0 ? r.right : r.left)} ${Y(r)}H${sx}`; ys.push(Y(r)); });
    b.forEach(r => { d += `M${sx} ${Y(r)}H${X(dir > 0 ? r.left : r.right)}`; ys.push(Y(r)); });
    d += `M${sx} ${Math.min(...ys)}V${Math.max(...ys)}`;
  };
  for (let i = 0; i < L.length; i++) join(L[i], L[i + 1] || C, 1);
  for (let i = 0; i < R.length; i++) join(R[i], R[i + 1] || C, -1);
  svg.innerHTML = `<path d="${d}"/>`;
}
window.addEventListener('resize', () => requestAnimationFrame(drawBracketLines));
function viewGroups() {
  const st = pickStage();
  if (!st || st.status === 'draft') return `<h1>Groups</h1><p class="muted">Groups are not published yet.</p>${st ? stagePicker('groups') : ''}`;
  return `<h1>Groups</h1><p class="sub">${st.name} · ${st.entering} teams</p>${stagePicker('groups')}
  <div class="grid g4">${st.groups.map(g => `<div class="groupcard"><h3>Group ${GL(g.label)} <span class="muted small">${g.teamIds.length} teams</span></h3><ol>${g.teamIds.map(id => `<li>${tname(id)}</li>`).join('')}</ol></div>`).join('')}</div>`;
}
function viewSchedule() {
  const st = pickStage();
  if (!st || st.status === 'draft') return `<h1>Schedule</h1><p class="muted">Schedule is not published yet.</p>`;
  const rows = st.groups.flatMap(g => g.matches.map(m => ({ g, m }))).sort((a, b) => a.m.day - b.m.day || a.m.time.localeCompare(b.m.time) || st.groups.indexOf(a.g) - st.groups.indexOf(b.g))
    .map(({ g, m }) => `<tr><td>${matchDate(st, m)}</td><td>${m.time}</td><td>${st.final ? 'Final' : 'Group ' + GL(g.label)}</td><td>Match ${m.no}</td><td>${mapShown(m) ? esc(m.map) : '<span class="muted">—</span>'}</td><td>${matchBadge(m)}</td><td>${m.resultStatus === 'approved' ? `<a class="btn ghost small" href="#/match/${encodeURIComponent(m.id)}">Check result</a>` : ''}</td></tr>`).join('');
  return `<h1>Schedule</h1><p class="sub">${st.name}</p>${stagePicker('schedule')}<div class="tw"><table><thead><tr><th>Date</th><th>Time</th><th>Group</th><th>Match</th><th>Map</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
// Public: the result of one finished match (opened from Schedule → Check result).
function viewMatchResult(id) {
  const fm = findMatch(id);
  if (!fm || fm.m.resultStatus !== 'approved' || !fm.m.results) return `<a class="small" href="#/schedule">← Schedule</a><h1>Match result</h1><p class="muted">This result is not published yet.</p>`;
  const { st, g, m } = fm;
  const order = Object.entries(m.results).sort((a, b) => (a[1].noShow ? 99 : a[1].place) - (b[1].noShow ? 99 : b[1].place));
  return `<a class="small" href="#/schedule?stage=${S.stages.indexOf(st)}">← Schedule</a>
  <h1>${esc(st.name)} · ${st.final ? 'Final' : 'Group ' + GL(g.label)} · Match ${m.no}</h1><p class="sub">${esc(m.map)} · ${matchDate(st, m)}, ${m.time}</p>
  <div class="card lb"><div class="tw"><table><thead><tr><th>Pos</th><th>Team</th><th>Pos pts</th><th>Kills</th><th>Total</th></tr></thead><tbody>
  ${order.map(([tid, r]) => { const pp = r.noShow ? 0 : (E.PLACEMENT_POINTS[r.place - 1] || 0);
    return `<tr class="${r.place === 1 ? 'q' : ''}"><td class="rk">${r.noShow ? '–' : r.place}</td><td>${tname(tid)}${r.place === 1 ? ' <span class="badge b-acc">Booyah</span>' : ''}${r.noShow ? ' <span class="badge b-bad">No-show</span>' : ''}</td><td>${pp}</td><td>${r.noShow ? 0 : r.kills}</td><td class="pts"><b>${r.noShow ? 0 : pp + r.kills * E.POINTS_PER_KILL}</b></td></tr>`; }).join('')}
  </tbody></table></div></div>`;
}
function matchBadge(m) {
  if (m.resultStatus === 'approved') return '<span class="badge b-ok">Result published</span>';
  if (m.resultStatus === 'submitted') return '<span class="badge b-warn">Result checking</span>';
  const map = { scheduled: ['', 'Scheduled'], checkin: ['b-acc', 'Check-in open'], room: ['b-acc', 'Room released'], live: ['b-bad', 'LIVE'], completed: ['b-warn', 'Completed'] };
  const [c, l] = map[m.status] || ['', m.status];
  return `<span class="badge ${c}">${l}</span>`;
}
// Leaderboard tables. Click a team to see its points match by match (position, position points, kills, total).
let lbOpen = new Set();
const BOOYAH = '<img class="boo-ic" src="booyah.png" alt="Booyahs" title="Booyahs">';
function matchBreakdown(g, teamId, cols) {
  const done = g.matches.filter(m => m.resultStatus === 'approved');
  if (!done.length) return `<tr class="lb-detail"><td colspan="${cols}"><span class="muted small">No approved matches yet.</span></td></tr>`;
  return `<tr class="lb-detail"><td colspan="${cols}"><table class="mini"><thead><tr><th>Match</th><th>Map</th><th>Position</th><th>Pos pts</th><th>Kills</th><th>Total</th></tr></thead><tbody>
    ${done.map(m => { const r = m.results[teamId]; if (!r) return `<tr><td>M${m.no}</td><td>${esc(m.map)}</td><td colspan="4" class="muted">Not in this match</td></tr>`;
      if (r.noShow) return `<tr><td>M${m.no}</td><td>${esc(m.map)}</td><td class="ns">No-show</td><td>0</td><td>0</td><td><b>0</b></td></tr>`;
      const pp = E.PLACEMENT_POINTS[r.place - 1] || 0;
      return `<tr${r.place === 1 ? ' class="boo"' : ''}><td>M${m.no}</td><td>${esc(m.map)}</td><td>#${r.place}${r.place === 1 ? ' · Booyah' : ''}</td><td>${pp}</td><td>${r.kills}</td><td><b>${pp + r.kills * E.POINTS_PER_KILL}</b></td></tr>`; }).join('')}
  </tbody></table></td></tr>`;
}
function lbRow(stage, g, r, rank, cls, withGroup) {
  const key = S.stages.indexOf(stage) + '|' + r.teamId, open = lbOpen.has(key), cols = withGroup ? 7 : 6;
  return `<tr class="lb-row ${cls}${open ? ' open' : ''}" data-act="lbOpen" data-k="${key}" title="Show points for each match"><td class="rk">${rank}</td><td><span class="lb-caret">${open ? '▾' : '▸'}</span> ${tname(r.teamId)}</td>${withGroup ? `<td>${esc(GL(g.label))}</td>` : ''}<td>${r.booyahs}</td><td>${r.placePts}</td><td>${r.kills}</td><td class="pts"><b>${r.points}</b></td></tr>
    ${open ? matchBreakdown(g, r.teamId, cols) : ''}`;
}
function standingsTable(stage, g) {
  const rows = rowsOf(g);
  const done = g.matches.filter(m => m.resultStatus === 'approved').length, waiting = g.matches.filter(m => m.resultStatus === 'submitted').length;
  return `<div class="card lb"><div class="row between"><h3>${stage.final ? 'Grand Final' : 'Group ' + GL(g.label)}</h3><span class="muted small">${done}/${g.matches.length} matches${waiting ? ` · ${waiting} result${waiting > 1 ? 's' : ''} being checked` : ''}</span></div>
  <div class="tw"><table><thead><tr><th>#</th><th>Team</th><th title="Booyahs">${BOOYAH}</th><th>Pos pts</th><th>Kills</th><th>Total</th></tr></thead><tbody>
  ${rows.map(r => lbRow(stage, g, r, r.rank, `${!stage.final && r.rank <= stage.topN ? 'q' : ''}${stage.final && r.rank <= 3 && stage.status === 'done' ? ' podium p' + r.rank : ''}`, false)).join('')}
  </tbody></table></div></div>`;
}
// Every team in the stage, ranked together (points, then tie-breakers).
function overallRows(st) {
  return st.groups.flatMap(g => rowsOf(g).map(r => ({ ...r, group: g.label, g })))
    .sort((a, b) => b.points - a.points || b.booyahs - a.booyahs || b.placePts - a.placePts || b.kills - a.kills);
}
function viewLeaderboard() {
  const st = pickStage();
  if (!st || st.status === 'draft') return `<h1>Leaderboard</h1><p class="muted">No published stage yet.</p>`;
  let champ = '';
  if (st.final && st.status === 'done') { const r = rowsOf(st.groups[0]); champ = `<div class="champion"><span class="muted">🏆 Champion</span><b>${esc(team(r[0].teamId).name)}</b><span>${r[0].points} points · 2nd ${esc(team(r[1].teamId).name)} · 3rd ${esc(team(r[2].teamId).name)}</span></div><br>`; }
  const view = params().view || 'groups';
  const q = `stage=${S.stages.indexOf(st)}`;
  const toggle = st.groups.length > 1 ? `<div class="seg"><a href="#/leaderboard?${q}&view=groups" class="${view === 'groups' ? 'on' : ''}">By group</a><a href="#/leaderboard?${q}&view=overall" class="${view === 'overall' ? 'on' : ''}">Overall</a></div>` : '';
  const waiting = st.groups.reduce((a, g) => a + g.matches.filter(m => m.resultStatus === 'submitted').length, 0);
  const overall = () => `<div class="card lb"><div class="tw"><table><thead><tr><th>#</th><th>Team</th><th>Group</th><th title="Booyahs">${BOOYAH}</th><th>Pos pts</th><th>Kills</th><th>Total</th></tr></thead><tbody>
    ${overallRows(st).map((r, i) => lbRow(st, r.g, r, i + 1, '', true)).join('')}</tbody></table></div></div>`;
  return `<div class="row between"><div><h1>Leaderboard</h1><p class="sub">${st.name}${st.topN ? ' · highlighted = qualifies' : ' · both final days combined'} · click a team for points per match</p></div>${toggle}</div>${stagePicker('leaderboard')}${champ}
  ${st.final && rushOn() ? (() => { const rs = rushState(st.groups[0]); return `<div class="notice" style="margin-bottom:12px"><b>Champion Rush · target ${rs.target} points.</b> ${rs.champion ? esc(team(rs.champion)?.name || '') + ' won a Booyah on match point in Match ' + rs.wonIn + ' and is the champion.' : rs.matchPoint.length ? 'On match point: ' + rs.matchPoint.map(id => esc(team(id)?.name || '')).join(', ') + '. The first of them to win a Booyah is the champion.' : 'No team has reached the target yet.'}</div>`; })() : ''}
  ${waiting ? `<div class="notice" style="margin-bottom:12px">${waiting} match result${waiting > 1 ? 's are' : ' is'} being checked by the admin. ${waiting > 1 ? 'They count' : 'It counts'} once approved.${session.role === 'admin' ? ' <a href="#/admin/results">Approve now →</a>' : ''}</div>` : ''}
  ${view === 'overall' ? overall() : `<div class="grid">${st.groups.map(g => standingsTable(st, g)).join('')}</div>`}`;
}
function planLine(p) {
  return `<div class="flowline">${p.map(s => `<span class="${s.final ? 'final' : s.wcJoin ? 'wc' : ''}">${s.final ? '🏆 Grand Final · 12 teams · MT ' + s.matches : `${s.name}: ${s.entering}${s.wcJoin ? ' (incl. ' + s.wcJoin + ' WC)' : ''} → ${s.sizes.length} groups · MT ${s.matches} → Top ${s.topN} → ${s.advancing}`}</span>`).join('<span style="border:0;background:none">→</span>')}</div>`;
}
function viewBracket() {
  const n = S.stages.length ? S.stages[0].entering : approvedSlotCount() || S.settings.slots;
  const p = E.planStages(n, S.stages.length ? wcTeams().length : S.settings.wildCards, planOpts());
  return `<h1>Stages</h1><p class="sub">Calculated from ${n} teams and ${S.settings.wildCards} Wild Cards with the fixed logic: groups of 12, Top 8 in Stage 1, Top 6 after, Wild Cards join the first stage with 60 teams or fewer, Grand Final always 12.</p>
  ${planLine(p)}
  <div class="tw" style="margin-top:16px"><table><thead><tr><th>Stage</th><th>Teams</th><th>Groups</th><th>Group sizes</th><th>Qualify</th><th>Next</th><th>Status</th></tr></thead><tbody>
  ${p.map((s, i) => `<tr><td>${s.name}</td><td>${s.entering}${s.wcJoin ? ' <span class="badge b-wc">+' + s.wcJoin + ' WC</span>' : ''}</td><td>${s.sizes.length}</td><td>${Math.min(...s.sizes)}–${Math.max(...s.sizes)}</td><td>${s.final ? 'Final ranking' : 'Top ' + s.topN + ' / group'}</td><td>${s.final ? '🏆' : s.advancing}</td><td>${S.stages[i] ? '<span class="badge ' + (S.stages[i].status === 'done' ? 'b-ok' : 'b-acc') + '">' + S.stages[i].status + '</span>' : '<span class="badge">planned</span>'}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function viewInfo() {
  const pts = E.PLACEMENT_POINTS;
  return `<div class="grid g2">
  <div class="card glass"><div class="eyebrow">Scoring</div><h2 style="margin:4px 0 12px">Points per match</h2>
    <div class="ptsgrid">${pts.map((p, i) => `<div class="${i === 0 ? 'boo' : ''}"><span>#${i + 1}</span><b>${p}</b></div>`).join('')}<div class="kill"><span>Each kill</span><b>+1</b></div></div>
    <p class="small muted">Example: 2nd place with 7 kills = 9 + 7 = <b style="color:var(--ink)">16 points</b>.</p>
    <h3 style="margin-top:14px">Equal points?</h3><p class="small muted">More Booyahs, then more position points, then more kills, then the better position in the last match.</p></div>
  <div class="grid">
    <div class="card glass"><div class="eyebrow">Match day</div><ul class="ticks">${(S.settings.rulesMatch?.length ? S.settings.rulesMatch : RULES_MATCH).map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>
    <div class="card glass"><div class="eyebrow">Fair play</div><ul class="ticks">${(S.settings.rulesFair?.length ? S.settings.rulesFair : RULES_FAIR).map(x => '<li>' + esc(x) + '</li>').join('')}</ul></div>
    ${rushOn() ? `<div class="card glass"><div class="eyebrow">Grand Final · Champion Rush</div><p class="small muted" style="margin:8px 0 0">A team that reaches <b style="color:var(--ink)">${rushTarget()} points</b> is on match point. The first team on match point to win a Booyah is the champion. If nobody does by the last match, the team with the most points wins.</p></div>` : ''}
  </div></div>`;
}

// ---------- staff ----------
let staffErr = '';
function viewStaff() {
  if (Cloud.on) return `<div class="card" style="max-width:420px;margin:auto"><h1>Staff login</h1>
    ${Cloud.role ? `<p>Signed in as <b>${Cloud.role === 'admin' ? 'Admin' : 'Room creator'}</b>.</p><div class="row"><a class="btn" href="#/${Cloud.role === 'admin' ? 'admin' : 'room'}">Open dashboard</a><button class="btn ghost" data-act="signout">Sign out</button></div>` : `
    ${staffErr ? `<div class="errors">${esc(staffErr)}</div>` : ''}
    <form data-form="stafflogin"><label>Email</label><input name="email" type="email" required autocomplete="username"><label>Password</label><input name="password" type="password" required autocomplete="current-password">
    <div class="row" style="margin-top:12px"><button class="btn">Sign in</button></div></form>`}</div>`;
  return `<div class="card" style="max-width:460px;margin:auto"><h1>Staff</h1><p class="sub">Prototype: pick a role. The real version uses a staff login.</p>
  <div class="row"><button class="btn" data-act="role" data-r="admin">Enter as Admin</button><button class="btn ghost" data-act="role" data-r="room">Enter as Room creator</button></div>
  ${session.role ? `<p class="small muted" style="margin-top:12px">Signed in as ${session.role}. <a href="#" data-act="role" data-r="">Sign out</a></p>` : ''}</div>`;
}
function adminTabs() { return ''; }  // navigation lives in the admin sidebar (adminShell)
const ICONS = {
  admin: 'M3 13h8V3H3zm10 8h8V11h-8zM3 21h8v-6H3zm10-18v6h8V3z',
  'admin/teams': 'M16 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3zm0 2c-2.7 0-8 1.3-8 4v3h8v-3c0-1.1.4-2.1 1.2-3A11 11 0 0 0 8 13zm8 0c-2.7 0-8 1.3-8 4v3h16v-3c0-2.7-5.3-4-8-4z',
  'admin/wildcards': 'M12 2l2.9 6.9L22 9.3l-5.5 4.7L18.2 21 12 17.3 5.8 21l1.7-7L2 9.3l7.1-.4z',
  'admin/stages': 'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 3h6v3h-6z',
  room: 'M4 6h16v10H4zm-2 12h20v2H2z',
  'admin/results': 'M5 3h14v18l-7-3-7 3zm3 5h8v2H8zm0 4h6v2H8z',
  'admin/whatsapp': 'M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .3-3.4-.7a11.6 11.6 0 0 1-4.5-4c-.3-.5-1.1-1.5-1.1-2.8s.7-2 1-2.3a1 1 0 0 1 .7-.3h.5c.2 0 .4 0 .6.5l.9 2.1c.1.2.1.4 0 .6l-.4.6-.4.5c-.1.1-.3.3-.1.6a8.6 8.6 0 0 0 1.6 2 7.9 7.9 0 0 0 2.3 1.4c.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.6-.1l2 1c.3.1.5.2.5.3a2.4 2.4 0 0 1-.2 1.6z',
  'admin/complaints': 'M12 2 1 21h22zm1 15h-2v-2h2zm0-4h-2V9h2z',
  'admin/settings': 'M19.4 13a7.5 7.5 0 0 0 0-2l2.1-1.6-2-3.5-2.5 1a7.4 7.4 0 0 0-1.7-1L15 3h-4l-.3 2.9a7.4 7.4 0 0 0-1.7 1l-2.5-1-2 3.5L6.6 11a7.5 7.5 0 0 0 0 2l-2.1 1.6 2 3.5 2.5-1a7.4 7.4 0 0 0 1.7 1L11 21h4l.3-2.9a7.4 7.4 0 0 0 1.7-1l2.5 1 2-3.5zM13 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5z',
  'admin/log': 'M13 3a9 9 0 1 0 9 9h-2a7 7 0 1 1-7-7zm-1 5v5l4 2.5.8-1.3-3.3-2V8z'
};
function adminCounts() {
  const matches = S.stages.flatMap(s => s.groups.flatMap(g => g.matches));
  return { pending: slotTeams().filter(t => t.status === 'pending').length, results: matches.filter(m => m.resultStatus === 'submitted').length,
    complaints: S.complaints.filter(c => c.status === 'open').length, wa: S.notifications.filter(n => n.status === 'queued').length,
    waFail: S.notifications.filter(n => n.status === 'failed').length };
}
function adminShell(route, body) {
  const c = adminCounts();
  const nav = [['Manage', [['admin', 'Dashboard'], ['admin/teams', 'Teams', c.pending], ['admin/wildcards', 'Wild Cards'], ['admin/stages', 'Stages & groups']]],
    ['Match day', [['room', 'Room panel'], ['admin/results', 'Results', c.results], ['admin/whatsapp', 'WhatsApp', c.wa], ['admin/complaints', 'Complaints', c.complaints]]],
    ['System', [['admin/settings', 'Settings'], ['admin/log', 'Activity log']]]];
  const [label, cls] = tourStatus();
  return `<div class="admin">
    <aside class="side">
      <div class="side-brand">${tlogo('logo')}<div><b>${esc(S.settings.name)}</b><span class="badge ${cls}">${esc(label)}</span></div></div>
      ${nav.map(([h, items]) => `<div class="side-h">${h}</div>${items.map(([r, l, n]) => `<a href="#/${r}" class="${route === r ? 'on' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[r]}"/></svg><span>${l}</span>${n ? `<em>${n > 999 ? '999+' : n}</em>` : ''}</a>`).join('')}`).join('')}
      <div class="side-foot"><a href="#/overview">View public site ↗</a><span class="muted small">Signed in as admin</span></div>
    </aside>
    <div class="admin-main">${body}</div>
  </div>`;
}
function viewAdmin() {
  const c = s => slotTeams().filter(t => t.status === s).length;
  const st = curStage(), n = adminCounts(), p = plan();
  const total = S.settings.slots, used = usedSlots();
  const ms = st && st.status !== 'draft' ? st.groups.flatMap(g => g.matches.map(m => ({ g, m }))) : [];
  const done = ms.filter(x => x.m.resultStatus === 'approved').length;
  const pct = ms.length ? Math.round(done / ms.length * 100) : 0;
  // Alerts: things that need a person now.
  const alerts = [];
  if (n.pending) alerts.push(['warn', `${n.pending} team${n.pending > 1 ? 's' : ''} waiting for approval`, '#/admin/teams', 'Review']);
  if (n.results) alerts.push(['warn', `${n.results} result${n.results > 1 ? 's' : ''} to check`, '#/admin/results', 'Approve']);
  if (n.complaints) alerts.push(['bad', `${n.complaints} open complaint${n.complaints > 1 ? 's' : ''}`, '#/admin/complaints', 'Answer']);
  if (n.waFail) alerts.push(['bad', `${n.waFail} WhatsApp message${n.waFail > 1 ? 's' : ''} failed`, '#/admin/whatsapp', 'Follow up']);
  if (n.wa) alerts.push(['acc', `${n.wa} captain message${n.wa > 1 ? 's' : ''} ready to send`, '#/admin/whatsapp', 'Send']);
  const noRoom = ms.filter(x => x.m.status === 'checkin' && !x.m.roomId).length;
  if (noRoom) alerts.push(['warn', `${noRoom} match${noRoom > 1 ? 'es' : ''} in check-in without room details`, '#/room', 'Open']);
  if (st && st.wcTray && st.wcTray.length) alerts.push(['acc', `${st.wcTray.length} Wild Card${st.wcTray.length > 1 ? 's' : ''} to place in groups`, '#/admin/stages', 'Place']);
  const regBars = [['Approved', c('approved'), 'ok'], ['Pending', c('pending'), 'warn'], ['Waitlist', c('waitlist'), 'acc'], ['Rejected', c('rejected'), 'bad']];
  const regMax = Math.max(1, ...regBars.map(b => b[1]));
  const live = ms.filter(x => x.m.status === 'live' || x.m.status === 'room' || x.m.status === 'checkin');
  const next = ms.filter(x => x.m.resultStatus !== 'approved' && x.m.status === 'scheduled').slice(0, 5);
  const timeline = [...live, ...next].slice(0, 7);
  const greet = (h => h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening')(new Date().getHours());
  return `<div class="dash-head"><div><div class="eyebrow">${greet}</div><h1>Dashboard</h1><p class="sub">${esc(S.settings.name)} · ${st ? esc(st.name) + ' · ' + st.status : 'Registration ' + (S.settings.regOpen ? 'open' : 'closed')}</p></div>
    <div class="row"><a class="btn ghost" href="#/overview">Public site</a>${st && st.status === 'published' ? '<a class="btn" href="#/room">Room panel</a>' : '<a class="btn" href="#/admin/stages">Stages & groups</a>'}</div></div>
  ${S.teams.length ? '' : `<div class="notice" style="margin-bottom:16px">No teams yet. Open <a href="#/admin/settings">Settings</a> and click <b>Load sample data</b> to try the full flow with 252 teams.</div>`}
  <div class="kgrid">
    <div class="kcard"><span>Slots filled</span><b>${used}<small>/${total}</small></b><div class="bar"><i style="width:${total ? Math.min(100, used / total * 100) : 0}%"></i></div></div>
    <div class="kcard"><span>Approved teams</span><b>${c('approved') + wcTeams().length}</b><em>${wcTeams().length} Wild Card${wcTeams().length === 1 ? '' : 's'}</em></div>
    <div class="kcard"><span>${st ? esc(st.name) + ' progress' : 'Current stage'}</span><b>${st ? pct + '<small>%</small>' : '—'}</b>${st ? `<div class="bar"><i style="width:${pct}%"></i></div>` : '<em>Not started</em>'}</div>
    <div class="kcard"><span>Needs attention</span><b>${n.pending + n.results + n.complaints + n.waFail}</b><em>approvals, results, complaints</em></div>
  </div>
  <div class="dgrid">
    <div class="card"><div class="row between"><h3>Next step</h3><span class="eyebrow" style="font-size:10px">Guide</span></div><div class="nextstep">${nextAdminStep()}</div>
      <h3 style="margin-top:18px">Needs attention</h3>
      ${alerts.length ? alerts.map(([k, t, h, b]) => `<a class="alert a-${k}" href="${h}"><i></i><span>${t}</span><b>${b} →</b></a>`).join('') : '<p class="muted small">All clear. Nothing waiting.</p>'}
    </div>
    <div class="card"><h3>Registrations</h3>
      ${regBars.map(([l, v, k]) => `<div class="hbar"><span>${l}</span><div><i class="h-${k}" style="width:${v / regMax * 100}%"></i></div><b>${v}</b></div>`).join('')}
      <div class="row between small muted" style="margin-top:10px"><span>Form ${S.settings.regOpen && !S.stages.length ? 'open' : 'closed'} · closes ${fmtDate(S.settings.regCloses)}</span><a href="#/admin/teams">All teams →</a></div>
    </div>
    <div class="card"><div class="row between"><h3>${st && st.status === 'published' ? 'Match timeline' : 'Matches'}</h3>${ms.length ? `<span class="small muted">${done}/${ms.length} approved</span>` : ''}</div>
      ${timeline.length ? timeline.map(({ g, m }) => `<a class="tl" href="#/room?m=${m.id}"><span class="tl-t">${matchDate(st, m)} · ${m.time}</span><span class="tl-n">${st.final ? 'Final' : 'Group ' + GL(g.label)} · M${m.no} <span class="muted small">${esc(m.map)}</span></span>${matchBadge(m)}</a>`).join('') : `<p class="muted small">${st && st.status === 'published' ? 'All matches have results.' : 'Matches appear here after a stage is published.'}</p>`}
    </div>
    <div class="card"><h3>Stage groups</h3>
      ${st && st.status !== 'draft' ? `<div class="gprog">${st.groups.map(g => { const d = g.matches.filter(m => m.resultStatus === 'approved').length; return `<div title="Group ${GL(g.label)}: ${d}/${g.matches.length}"><span>${st.final ? 'F' : GL(g.label)}</span><i style="height:${d / g.matches.length * 100}%"></i></div>`; }).join('')}</div><p class="small muted">Each bar = matches with approved results in that group.</p>` : '<p class="muted small">No published stage yet.</p>'}
    </div>
  </div>
  <div class="dgrid two">
    <div class="card"><h3>Stage plan</h3>${planLine(p)}</div>
    <div class="card"><div class="row between"><h3>Recent activity</h3><a class="small" href="#/admin/log">All →</a></div>
      ${S.log.slice(0, 7).map(l => `<div class="act"><span class="muted small">${new Date(l.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span><span><b>${esc(l.action)}</b> <span class="muted">${esc(l.what || '')}</span></span></div>`).join('') || '<p class="muted small">No activity yet.</p>'}
    </div>
  </div>`;
}
function nextAdminStep() {
  const st = curStage();
  if (!S.teams.length) return 'Load sample data or wait for registrations.';
  if (!st) return S.teams.some(t => t.status === 'pending') ? 'Approve pending teams in <a href="#/admin/teams">Teams</a>, then generate Stage 1 in <a href="#/admin/stages">Stages & groups</a>.' : 'Generate Stage 1 in <a href="#/admin/stages">Stages & groups</a>.';
  if (st.status === 'draft') return `Check ${st.name} groups${st.wcTray.length ? ' and place the Wild Cards' : ''}, then publish in <a href="#/admin/stages">Stages & groups</a>.`;
  if (st.status === 'published' && !allApproved(st)) return `Run ${st.name} matches in the <a href="#/room">Room panel</a> (or use <b>Simulate results</b> in Stages & groups), then approve results.`;
  if (st.status === 'published') return `All ${st.name} results approved. ${st.final ? 'Finish the tournament' : 'Approve qualifiers'} in <a href="#/admin/stages">Stages & groups</a>.`;
  if (st.final) return 'Tournament finished 🏆 See the <a href="#/leaderboard">leaderboard</a>.';
  return 'Generate the next stage in <a href="#/admin/stages">Stages & groups</a>.';
}
function viewSettings() {
  const s = S.settings;
  const p = E.planStages(S.stages.length ? S.stages[0].entering : (approvedSlotCount() || s.slots), s.wildCards, planOpts());
  return `${adminTabs('admin/settings')}<h1>Settings</h1>
  <div class="grid g2"><div class="card"><form data-form="settings">
    <label>Tournament name</label><input name="name" value="${esc(s.name)}">
    <label>Total slots</label><input name="slots" type="number" min="24" max="5000" value="${s.slots}" ${S.stages.length ? 'disabled' : ''}>
    <label>Wild Card teams (0–12)</label><input name="wildCards" type="number" min="0" max="12" value="${s.wildCards}" ${S.stages.length ? 'disabled' : ''}>
    <label>Prize pool (shown on the site)</label><input name="prize" value="${esc(s.prize || '')}" placeholder="₹50,000">
    <label>Organiser</label><input name="organiser" value="${esc(s.organiser || '')}">
    <label>Tournament starts</label><input name="startDate" type="date" value="${esc(s.startDate || '')}">
    ${Cloud.on ? `<label>Email sender (verified in Brevo)</label><input name="emailFrom" type="email" value="${esc(s.emailFrom || '')}" placeholder="you@gmail.com">
    <label>Email sender name</label><input name="emailName" value="${esc(s.emailName || '')}" placeholder="${esc(s.name)}">` : ''}
    <label>Registration closes</label><input name="regCloses" type="date" value="${esc(s.regCloses)}">
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" name="regOpen" ${s.regOpen ? 'checked' : ''}> Registration open</label>
    <label style="display:flex;gap:8px;align-items:center;color:var(--ink)"><input type="checkbox" name="notifyPaused" ${s.notifyPaused ? 'checked' : ''}> Pause captain messages</label>
    <h3 style="margin-top:20px">Tournament logo</h3>
    <div class="row">${logoOk() ? `<img class="set-logo" src="${s.logo}" alt="Tournament logo">` : '<span class="set-logo none">SC</span>'}
      <div><input type="file" accept="image/png,image/jpeg,image/webp" data-act="tlogo" aria-label="Upload tournament logo"><p class="small muted" style="margin:4px 0 0">PNG, JPG or WEBP. Shown in the header, the hero and the admin panel.${logoOk() ? ' <a href="#" data-act="tlogoRemove">Remove logo</a>' : ''}</p></div></div>
    <h3 style="margin-top:20px">Format</h3>
    <label>Bracket format</label>${formatSelect(s, 'preset')}
    <div class="pf"><div><label>Stage 1: teams that qualify per group</label><input name="stage1Top" type="number" min="1" max="11" value="${Number(s.stage1Top) || 8}"></div>
      <div><label>Later stages: qualify per group</label><input name="laterTop" type="number" min="1" max="11" value="${Number(s.laterTop) || 6}"></div>
      <div><label>Matches per group (MT)</label><input name="matchesPerStage" type="number" min="1" max="30" value="${Number(s.matchesPerStage) || 6}"></div>
      <div><label>Grand Final matches (MT)</label><input name="finalMatches" type="number" min="1" max="30" value="${Number(s.finalMatches) || 12}"></div>
      <div><label>Grand Final mode</label><select name="finalMode"><option value="normal" ${s.finalMode !== 'rush' ? 'selected' : ''}>Normal: most points wins</option><option value="rush" ${s.finalMode === 'rush' ? 'selected' : ''}>Champion Rush</option></select></div>
      <div><label>Champion Rush points target</label><input name="rushTarget" type="number" min="1" max="999" value="${Number(s.rushTarget) || 80}"></div></div>
    <p class="small muted">These apply to stages generated from now on. A stage still in draft can be changed on the Stages page.</p>
    <h3 style="margin-top:20px">Rules page</h3>
    <label>Match day rules (one per line)</label><textarea name="rulesMatch" rows="5">${esc((s.rulesMatch?.length ? s.rulesMatch : RULES_MATCH).join('\n'))}</textarea>
    <label>Fair play rules (one per line)</label><textarea name="rulesFair" rows="4">${esc((s.rulesFair?.length ? s.rulesFair : RULES_FAIR).join('\n'))}</textarea>
    <div class="row" style="margin-top:12px"><button class="btn">Save settings</button></div>
    ${S.stages.length ? '<p class="small muted">Slots and Wild Cards are locked once Stage 1 is generated.</p>' : ''}
  </form></div>
  <div class="card"><h3>Demo data</h3><div class="row"><button class="btn ghost" data-act="sample">Load sample data (252 + 6 WC)</button><button class="btn red" data-act="reset">Reset everything</button></div>
    <p class="small muted">Sample data replaces everything in this browser.</p></div></div>`;
}
let teamFilter = { q: '', status: 'all' }, emailLogRows = null;
let showPw = false, pwResult = null;
let loginNote = {};   // per team: why a login email was not sent
const emailReady = () => !!(S.settings.emailFrom || '').trim();
// Admin: a team's current password (online only). Passwords sent before the update are stored only as a hash.
function pwCell(t) {
  const r = Cloud.passwords[t.id];
  const pw = r && r.password;
  const val = !r ? '<span class="muted">Not set</span>' : !pw ? '<span class="muted" title="Sent before passwords were saved for the admin">Hidden · set a new one</span>'
    : showPw ? `<code class="pw">${esc(pw)}</code> <button class="btn ghost small" data-act="copy" data-text="${esc(pw)}" title="Copy password">Copy</button>` : '<code class="pw">••••••••••</code>';
  return `${val}<br><a class="small" href="#/admin/team/${t.id}">Change</a>`;
}
function passwordCard(t) {
  if (!Cloud.on) return `<div class="card glass" style="max-width:720px;margin-top:14px"><h3>Login password</h3><p class="small muted">Team passwords work on the online site. In this offline demo, teams open My Team with Team ID + captain mobile.</p></div>`;
  const r = Cloud.passwords[t.id], pw = r && r.password;
  const by = r && r.set_by ? { admin: 'set by admin', email: 'emailed to the captain' }[r.set_by] || r.set_by : '';
  return `<div class="card glass" id="pw" style="max-width:720px;margin-top:14px"><h3>Login password</h3>
    <p class="small muted">The team logs in on My Team with <b>${esc(t.players[0].email)}</b> and this password.</p>
    <div class="pw-now">${pw ? `<code class="pw big">${esc(pw)}</code> <button class="btn ghost small" data-act="copy" data-text="${esc(pw)}">Copy</button>`
      : r ? '<span class="muted">Hidden: this password was emailed before the admin could see passwords. Set a new one to see it.</span>' : '<span class="muted">No password yet.</span>'}
      ${r && r.set_at ? `<div class="small muted">Changed ${new Date(r.set_at).toLocaleString('en-IN')}${by ? ' · ' + esc(by) : ''}</div>` : ''}</div>
    ${pwResult && pwResult.id === t.id ? `<div class="notice" style="margin-top:10px">New password saved${pwResult.emailed ? ' and emailed to the captain' : ''}. The team's old logins were signed out.</div>` : ''}
    <form data-form="setpw" data-id="${t.id}" style="margin-top:12px" autocomplete="off">
      <label>New password</label><input name="pw" maxlength="40" placeholder="Leave empty to make a random one" autocomplete="new-password" spellcheck="false">
      <label class="check"><input type="checkbox" name="email"> Also email it to the captain (${esc(t.players[0].email)})</label>
      <div class="row" style="margin-top:10px"><button class="btn">Set password</button></div>
      <p class="small muted">6–40 characters, no spaces. Saving signs the team out on every device. Every change goes in the Activity log.</p>
    </form></div>`;
}
function viewTeams() {
  const q = teamFilter.q.toLowerCase();
  const list = slotTeams().filter(t => (teamFilter.status === 'all' || t.status === teamFilter.status) &&
    (!q || t.name.toLowerCase().includes(q) || t.code.toLowerCase().includes(q) || t.players.some(p => p.uid.includes(q) || p.mobile.includes(q))));
  const counts = {}; slotTeams().forEach(t => counts[t.uid] = 0);
  const flagged = t => {
    const others = S.teams.filter(o => o.id !== t.id && o.status !== 'rejected' && o.status !== 'withdrawn').flatMap(o => o.players);
    return t.players.some(p => others.some(o => o.uid === p.uid || o.mobile === p.mobile));
  };
  const shown = list.slice(0, 150);
  return `${adminTabs('admin/teams')}<div class="row between"><h1>Teams</h1><div class="row">
    <label class="btn ghost small" style="margin:0">Import Google Form CSV<input type="file" accept=".csv" data-act="import" hidden></label>
    <button class="btn ghost small" data-act="export">Export CSV</button>
    ${Cloud.on ? `<button class="btn ghost small" data-act="sendLoginsMissing" ${emailReady() ? '' : 'disabled title="Emails are off: add the sender email in Settings"'}>Email logins not sent yet</button><button class="btn ghost small" data-act="emailLog">Email log</button>` : ''}
    <button class="btn green small" data-act="approveAll">Approve all pending</button></div></div>
  ${emailLogRows ? `<div class="card" style="margin-bottom:12px"><div class="row between"><h3>Email log</h3><button class="btn ghost small" data-act="emailLogClose">Close</button></div><div class="tw"><table><thead><tr><th>When</th><th>To</th><th>Type</th><th>Result</th></tr></thead><tbody>
    ${emailLogRows.map(l => `<tr><td class="small">${new Date(l.at).toLocaleString('en-IN')}</td><td class="small">${esc(l.to_email)}</td><td>${esc(l.kind)}</td><td class="small">${l.note ? esc(l.note) : l.status ? (l.status < 300 ? '✅ Accepted by Brevo' : '❌ ' + l.status) : '⏳ Sending'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No emails yet.</td></tr>'}</tbody></table></div></div>` : ''}
  ${Cloud.on && !emailReady() ? `<div class="notice" style="margin-bottom:12px"><b>Emails are off.</b> Login emails can't be sent until you add the sender email in <a href="#/admin/settings">Settings</a> (and the Brevo key in Supabase). Until then, set a password on the team's Edit page and share it with the captain yourself.</div>` : ''}
  <p class="sub">${usedSlots()}/${S.settings.slots} slots filled. CSV columns: Team name, then for each of 4 players: In Game Name, Mobile, Email, UID.</p>
  <div class="row" style="margin-bottom:10px"><input placeholder="Search team, Team ID, UID or mobile" value="${esc(teamFilter.q)}" data-act="search" style="max-width:320px">
    <select data-act="filter" style="max-width:160px">${['all', 'pending', 'approved', 'waitlist', 'rejected'].map(s => `<option ${s === teamFilter.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
  <div class="tw"><table><thead><tr><th>Slot</th><th>Team ID</th><th>Team</th><th>Captain</th><th>Players (UID)</th><th>Status</th>${Cloud.on ? `<th>Login email</th><th>Password <button class="btn ghost small" data-act="togglePw" title="Show or hide passwords">${showPw ? 'Hide' : 'Show'}</button></th>` : ''}<th></th></tr></thead><tbody>
  ${shown.map(t => `<tr><td>${t.slotNo || '—'}</td><td>${esc(t.code)}</td><td>${tname(t.id)}${flagged(t) ? ' <span class="badge b-bad">Duplicate player</span>' : ''}</td><td>${esc(t.players[0].name)}<br><span class="small muted">${esc(t.captainMobile)}</span></td>
    <td class="small">${t.players.map(p => esc(p.name) + ' (' + esc(p.uid) + ')').join('<br>')}</td><td>${statusBadge(t.status)}${t.reason ? '<br><span class="small muted">' + esc(t.reason) + '</span>' : ''}</td>
    ${Cloud.on ? `<td class="small">${S.loginSent?.[t.id] ? '✅ Sent ' + new Date(S.loginSent[t.id]).toLocaleDateString('en-IN') : '<span class="muted">Not sent</span>'}<br><button class="btn ghost small" data-act="sendLogin" data-id="${t.id}" ${emailReady() ? '' : 'disabled title="Emails are off: add the sender email in Settings"'}>${S.loginSent?.[t.id] ? 'Resend' : 'Email login'}</button>${loginNote[t.id] ? `<div class="small" style="color:var(--red);margin-top:4px">${esc(loginNote[t.id])}</div>` : ''}</td><td class="small">${pwCell(t)}</td>` : ''}
    <td><div class="row"><a class="btn ghost small" href="#/admin/team/${t.id}">Edit</a><button class="btn red small" data-act="deleteTeam" data-id="${t.id}">Delete</button></div>${S.stages.length ? '' : `<div class="row" style="margin-top:6px">${t.status !== 'approved' && t.status !== 'waitlist' ? `<button class="btn green small" data-act="approve" data-id="${t.id}">Approve</button>` : ''}${t.status !== 'rejected' ? `<button class="btn red small" data-act="reject" data-id="${t.id}">Reject</button>` : ''}</div>`}</td></tr>`).join('')}
  </tbody></table></div>${list.length > shown.length ? `<p class="small muted">Showing 150 of ${list.length}. Use search to find a team.</p>` : ''}`;
}
let wcErrors = [], wcDraft = null;
function viewWildcards() {
  const list = S.teams.filter(t => t.entry === 'WC');
  const d = wcDraft || { name: '', players: [{}, {}, {}, {}] };
  const active = list.filter(t => t.status !== 'rejected' && t.status !== 'withdrawn').length;
  const open = S.wcInvites.filter(i => i.status === 'open');
  const left = Math.max(0, S.settings.wildCards - active - open.length);
  const join = plan().find(s => s.wcJoin);
  const closed = wcJoined();
  const link = i => location.origin + location.pathname + '#/wildcard/' + i.token;
  const inviteText = i => `You're invited as a Wild Card team in ${S.settings.name}! Register your squad here (private link, do not share): ${link(i)}`;
  return `${adminTabs('admin/wildcards')}<h1>Wild Cards</h1><p class="sub">${active} of ${S.settings.wildCards} places used${open.length ? ' · ' + open.length + ' invite' + (open.length > 1 ? 's' : '') + ' waiting' : ''} · they join ${join ? '<b>' + join.name + '</b>' : 'a later stage'}. Wild Card teams are <b>not shown on the public site</b> until you place them and publish that stage.</p>
  <div class="card"><div class="row between"><h3>Wild Card teams</h3><span class="small muted">Edit any team's name, logo or players</span></div>
    ${list.length ? `<div class="tw"><table><thead><tr><th>Team ID</th><th>Team</th><th>Captain</th><th>Players (UID)</th><th>Status</th><th></th></tr></thead><tbody>${list.map(t => `<tr><td>${esc(t.code || '…')}</td><td>${tname(t.id)}<br><span class="small muted">${t.source === 'invite' ? 'Registered by invite' : 'Added by admin'}</span></td><td>${esc(t.players[0].name)}<br><span class="small muted">${esc(t.players[0].email)}</span></td>
      <td class="small">${t.players.map(p => esc(p.name) + ' (' + esc(p.uid) + ')').join('<br>')}</td><td>${statusBadge(t.status)}</td>
      <td><div class="row"><a class="btn ghost small" href="#/admin/team/${t.id}">Edit</a><button class="btn red small" data-act="deleteTeam" data-id="${t.id}">Delete</button>${!closed && t.status === 'pending' ? `<button class="btn green small" data-act="approve" data-id="${t.id}">Approve</button>` : ''}${!closed && t.status !== 'rejected' ? `<button class="btn red small" data-act="reject" data-id="${t.id}">Reject</button>` : ''}</div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No Wild Card teams yet. Create an invite link below.</p>'}
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="card"><h3>Invite links</h3>
      <p class="small muted">Each link lets one team register as a Wild Card with the same form as everyone else. Send it privately by WhatsApp or email.</p>
      ${closed ? '<p class="muted">Wild Card entries are closed: the Wild Card stage has started.</p>' : left ? `<form data-form="wcinvite" class="row"><input name="note" placeholder="Who is it for? (e.g. Creator Kings)" maxlength="40" style="flex:1;min-width:180px"><button class="btn small">Create invite link</button></form>` : '<p class="muted small">All Wild Card places are used or invited. Raise the number in Settings to invite more.</p>'}
      ${S.wcInvites.length ? S.wcInvites.slice().reverse().map(i => `<div class="invite"><div class="row between"><b>${esc(i.note || 'Wild Card invite')}</b>${i.status === 'open' ? '<span class="badge b-acc">Waiting</span>' : i.status === 'used' ? '<span class="badge b-ok">Registered</span>' : '<span class="badge b-bad">Cancelled</span>'}</div>
        ${i.status === 'open' ? `<input readonly value="${esc(link(i))}" class="small" style="margin:8px 0">
        <div class="row"><button class="btn small" data-act="copy" data-text="${esc(link(i))}">Copy link</button>
          <a class="btn small ghost" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent(inviteText(i))}">WhatsApp</a>
          <button class="btn small ghost" data-act="wcRevoke" data-token="${i.token}">Cancel</button></div>
        <form data-form="wcemail" data-token="${i.token}" class="row" style="margin-top:8px"><input name="email" type="email" required placeholder="Captain email" value="${esc(i.email || '')}" style="flex:1;min-width:160px"><button class="btn small ghost">${i.emailedAt ? 'Resend email' : 'Send by email'}</button></form>
        ${i.emailedAt ? `<div class="small muted">📧 Emailed to ${esc(i.email)} · ${new Date(i.emailedAt).toLocaleString('en-IN')}</div>` : ''}`
        : i.status === 'used' ? `<div class="small muted">Used by ${i.teamId && team(i.teamId) ? tname(i.teamId) : 'a team'}</div>` : ''}</div>`).join('') : ''}
    </div>
    <div class="card"><details${wcErrors.length || wcDraft ? ' open' : ''}><summary><b>Or add a Wild Card team yourself</b></summary>
      ${closed || left === 0 && !wcDraft ? '<p class="muted small" style="margin-top:8px">No free Wild Card place.</p>' : `
      ${wcErrors.length ? `<div class="errors"><ul>${wcErrors.map(e => '<li>' + esc(e) + '</li>').join('')}</ul></div>` : ''}
      <form data-form="wildcard" novalidate style="margin-top:8px"><label>Team name *</label><input name="teamName" value="${esc(d.name)}">${logoField(wcLogo)}${d.players.map((p, i) => playerFields('p', i, p)).join('')}
      <button class="btn">Add Wild Card</button></form>`}</details></div>
  </div>`;
}
// Private Wild Card registration page (opened from an invite link). Not linked anywhere public.
let wcCheck = {}, wcFormErrors = [];
function viewWcInvite(token) {
  let info;
  if (Cloud.on) {
    info = wcCheck[token];
    if (!info) { wcCheck[token] = { loading: true }; Cloud.wcInviteInfo(token).then(r => { wcCheck[token] = r || { ok: false }; render(); }, () => { wcCheck[token] = { ok: false }; render(); }); return '<p class="muted">Checking your invite…</p>'; }
    if (info.loading) return '<p class="muted">Checking your invite…</p>';
  } else {
    const i = S.wcInvites.find(x => x.token === token);
    info = i ? { ok: i.status === 'open', status: i.status } : { ok: false };
    if (i && wcJoined()) info = { ok: false, status: 'closed' };
  }
  if (!info.ok) return `<div class="card glass" style="max-width:520px;margin:auto;text-align:center"><h1>Invite not available</h1>
    <p class="muted">${info.status === 'used' ? 'This invite has already been used to register a team.' : info.status === 'revoked' ? 'This invite was cancelled by the organiser.' : info.status === 'closed' ? 'Wild Card entries are closed.' : 'This invite link is not valid. Ask the organiser for a new one.'}</p></div>`;
  const d = formDraft || { name: '', players: [{}, {}, {}, {}] };
  return `<div class="card glass" style="max-width:680px;margin:auto">
    <div class="eyebrow">★ Wild Card invitation</div><h1 style="margin:6px 0">${esc(S.settings.name)}</h1>
    <p class="sub">You've been invited as a Wild Card team. Fill in your squad below. Your team joins a later stage directly and stays private until the organiser places it.</p>
    ${wcFormErrors.length ? `<div class="errors"><b>Please fix:</b><ul>${wcFormErrors.map(e => '<li>' + esc(e) + '</li>').join('')}</ul></div>` : ''}
    <form data-form="wcregister" data-token="${esc(token)}" novalidate>
      <label>Team name *</label><input name="teamName" value="${esc(d.name)}" required maxlength="30">
      ${logoField(formLogo)}
      ${d.players.map((p, i) => playerFields('p', i, p)).join('')}
      <label style="display:flex;gap:8px;align-items:flex-start;font-weight:500;color:var(--ink)"><input type="checkbox" name="agree" required> I accept the <a href="#/info">rules</a> and confirm all players are 18+ or have a parent's permission.</label>
      <div class="row" style="margin-top:14px"><button class="btn btn-lg" type="submit">Submit Wild Card entry</button></div>
    </form></div>`;
}
// Admin: edit a team's name, logo and players (normal and Wild Card teams). Same duplicate rules as registration.
let editErrors = [], editLogo = null, editFor = null;
function viewEditTeam(id) {
  const t = team(id);
  if (!t) return `${adminTabs('admin/teams')}<p>Team not found.</p>`;
  if (editFor !== id) { editFor = id; editLogo = t.logo || null; editErrors = []; }
  const back = t.entry === 'WC' ? '#/admin/wildcards' : '#/admin/teams';
  return `${adminTabs(t.entry === 'WC' ? 'admin/wildcards' : 'admin/teams')}<div class="row between"><div><a class="small" href="${back}">← Back</a><h1>Edit team</h1>
    <p class="sub">${esc(t.code || '')} · ${t.entry === 'WC' ? 'Wild Card' : 'Slot ' + (t.slotNo || '—')} · ${statusBadge(t.status)}</p></div></div>
    <div class="card glass" style="max-width:720px">
      ${editErrors.length ? `<div class="errors"><b>Not saved:</b><ul>${editErrors.map(e => '<li>' + esc(e) + '</li>').join('')}</ul></div>` : ''}
      <form data-form="editteam" data-id="${t.id}" novalidate>
        <label>Team name *</label><input name="teamName" value="${esc(t.name)}" maxlength="30">
        ${logoField(editLogo)}
        ${t.players.map((p, i) => playerFields('p', i, p)).join('')}
        <p class="small muted">Player 1 is the captain. ${Cloud.on ? 'If you change the captain email, set or email a new password below.' : ''} Every change is written in the Activity log.</p>
        <div class="row" style="margin-top:10px"><button class="btn">Save changes</button><a class="btn ghost" href="${back}">Cancel</a></div>
      </form></div>
    ${passwordCard(t)}
    ${teamResultsEditor(t)}`;
}
// Admin only: every approved result for one team, each with an ✎ edit. Points, rank, kills and Booyahs follow automatically.
function teamResultsEditor(t) {
  const rows = S.stages.flatMap(st => st.groups.filter(g => g.teamIds.includes(t.id)).flatMap(g => g.matches.filter(m => m.resultStatus === 'approved').map(m => ({ st, g, m }))));
  if (!rows.length) return '';
  return `<div class="card glass" style="max-width:720px;margin-top:14px"><h3>Match results</h3>
    <p class="small muted">Fix a position or kills here (for example after a complaint). The team's points, rank, kills and Booyahs update everywhere. ${rows.some(x => x.st.status === 'done') ? 'For stages already closed, who qualified does not change.' : ''}</p>
    <div class="tw"><table><thead><tr><th>Stage</th><th>Match</th><th>Position</th><th>Kills</th><th>Points</th><th></th></tr></thead><tbody>
    ${rows.map(({ st, g, m }) => { const r = m.results[t.id] || {}, k = 'r' + m.id; return `<tr><td>${esc(st.name)}${st.status === 'done' ? ' <span class="badge">closed</span>' : ''}</td><td>M${m.no} · ${esc(m.map)}</td><td>${r.noShow ? 'No-show' : '#' + r.place}</td><td>${r.noShow ? 0 : r.kills}</td><td><b>${r.noShow ? 0 : E.matchPoints(r.place, r.kills)}</b></td>
      <td><a class="btn small ghost" href="#/admin/match/${encodeURIComponent(m.id)}?t=${encodeURIComponent(t.id)}" title="Edit this match's points table">✎</a></td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
function viewStages() {
  const st = curStage();
  const p = plan();
  let body = '';
  if (!st) {
    const n = approvedSlotCount();
    body = `<div class="card"><h3>Generate Stage 1</h3><p>${n} approved teams → ${E.distribute(n).length} groups of up to 12.${S.teams.some(t => t.entry === 'SLOT' && t.status === 'pending') ? ' <span class="badge b-warn">Some teams are still pending</span>' : ''}</p>
      <div class="row"><button class="btn" data-act="gen1" data-mode="sequential" ${n < 24 ? 'disabled' : ''}>Generate in slot order</button><button class="btn ghost" data-act="gen1" data-mode="random" ${n < 24 ? 'disabled' : ''}>Generate random</button></div>
      ${n < 24 ? '<p class="small muted">At least 24 approved teams are needed.</p>' : '<p class="small muted">This closes registration.</p>'}</div>`;
  } else {
    const draft = st.status === 'draft';
    const groupOpts = (cur) => st.groups.map((g, gi) => `<option value="${gi}" ${gi === cur ? 'selected' : ''} ${g.teamIds.length >= 12 && gi !== cur ? 'disabled' : ''}>${st.final ? 'Final' : 'Group ' + GL(g.label)} (${g.teamIds.length}/12)</option>`).join('');
    const mt = st.matchCount || (st.final ? E.FINAL_MATCHES : E.MATCHES);
    const cfg = `<form data-form="stagecfg" class="stagecfg"><div><label>Start date</label><input type="date" name="startDate" value="${esc(stageStart(st))}"></div>
      <div><label>Matches per group (MT)</label><input type="number" name="matchCount" min="1" max="30" value="${mt}" ${draft ? '' : 'disabled'}></div>
      ${st.final ? `<div><label>Final mode</label><input value="${rushOn() ? 'Champion Rush · ' + rushTarget() + ' pts' : 'Normal'}" disabled></div>` : `<div><label>Qualify per group</label><input type="number" name="topN" min="1" max="11" value="${st.topN}" ${draft ? '' : 'disabled'}></div>`}
      <button class="btn ghost small">Save stage</button>${draft ? '' : '<span class="small muted">Matches and qualifiers lock once the stage is published.</span>'}</form>`;
    body = `<div class="card"><div class="row between"><h3>${st.name} · ${st.entering} teams · ${st.groups.length} group${st.groups.length > 1 ? 's' : ''} · MT ${mt} · <span class="badge b-acc">${st.status}</span></h3>
      <div class="row">${draft ? `<button class="btn green" data-act="publish" ${st.wcTray.length ? 'disabled' : ''}>Lock & publish</button>` : ''}
      ${st.status === 'published' && !allApproved(st) ? `<button class="btn ghost" data-act="simulate">Simulate all results</button>` : ''}
      ${st.status === 'published' && allApproved(st) ? `<button class="btn green" data-act="qualify">${st.final ? 'Finish tournament' : 'Approve Top ' + st.topN + ' & close stage'}</button>` : ''}
      ${st.status === 'done' && !st.final ? `<button class="btn" data-act="genNext">Generate ${p[st.index + 1] ? p[st.index + 1].name : 'next stage'}</button>` : ''}</div></div>
      ${cfg}
      ${draft ? '<p class="small muted">Draft: move teams between groups if needed. No group can go over 12. Publishing shows the groups and schedule to teams.</p>' : ''}
      ${st.wcTray.length ? `<div class="notice"><b>Place ${st.wcTray.length} Wild Card team${st.wcTray.length > 1 ? 's' : ''}</b> before publishing.
        <div class="tw" style="margin-top:8px"><table><tbody>${st.wcTray.map(id => `<tr><td>${tname(id)}</td><td><select data-act="placeWc" data-id="${id}"><option value="">Choose group…</option>${groupOpts(-1)}</select></td></tr>`).join('')}</tbody></table></div>
        <div class="row" style="margin-top:8px"><button class="btn small" data-act="autoWc">Auto place (spread evenly)</button></div></div>` : ''}
    </div>
    <div class="grid g3" style="margin-top:12px">${st.groups.map((g, gi) => draft ? `<div class="groupcard"><h3>${st.final ? 'Final' : 'Group ' + GL(g.label)} <span class="muted small">${g.teamIds.length}/12</span></h3><ol>${g.teamIds.map(id => `<li class="row between" style="display:list-item"><span>${tname(id)}</span> <select class="small" style="width:auto;padding:2px 4px;font-size:11px" data-act="move" data-id="${id}" data-from="${gi}">${groupOpts(gi)}</select></li>`).join('')}</ol></div>` : standingsTable(st, g)).join('')}</div>`;
  }
  const fmtLocked = S.stages.length && !S.stages.some(x => x.status === 'draft') && S.stages[S.stages.length - 1].final;
  const fmtForm = fmtLocked ? '' : `<form class="card fmt-pick" data-form="format"><div><label>Bracket format</label>${formatSelect(S.settings, 'preset')}</div>
    <button class="btn">Generate format</button><p class="small muted">Redraws the roadmap below. ${S.stages.length ? 'Applies to stages not generated yet.' : 'Fine-tune the numbers in Settings.'}</p></form>`;
  return `${adminTabs('admin/stages')}<h1>Stages & groups</h1>${fmtForm}${viewRoadmap(true)}<br>${body}
  ${S.stages.length > 1 ? `<h2>Earlier stages</h2><p>${S.stages.slice(0, -1).map((s, i) => `<a href="#/leaderboard?stage=${i}">${s.name}</a> (${s.entering} → ${(s.qualified || []).length})`).join(' · ')}</p>` : ''}`;
}
// Admin: the full points table of one match, editable (opened from a complaint's Fix result or a team's ✎).
let mpErr = '';
function viewMatchPoints(id) {
  const fm = findMatch(id), pr = params();
  if (!fm) return `${adminTabs('admin/complaints')}<p>Match not found.</p>`;
  const { st, g, m } = fm, c = pr.c !== undefined ? S.complaints[Number(pr.c)] : null, focus = pr.t;
  const back = c ? '#/admin/complaints' : focus ? '#/admin/team/' + focus : '#/admin/results';
  if (!m.results) return `${adminTabs('admin/complaints')}<a class="small" href="${back}">← Back</a><h1>Match points</h1><p class="muted">This match has no results yet.</p>`;
  const order = g.teamIds.slice().sort((a, b) => { const ra = m.results[a], rb = m.results[b]; return (ra && !ra.noShow ? ra.place : 99) - (rb && !rb.noShow ? rb.place : 99); });
  return `${adminTabs('admin/complaints')}<a class="small" href="${back}">← Back</a>
  <h1>${esc(st.name)} · ${st.final ? 'Grand Final' : 'Group ' + esc(GL(g.label))} · Match ${m.no}</h1>
  <p class="sub">${esc(m.map)} · ${m.resultStatus === 'approved' ? 'Published' : m.resultStatus === 'submitted' ? 'Waiting for approval' : 'Not published'}. Change positions or kills, then save. Points, ranks, kills and Booyahs update everywhere.${st.status === 'done' ? ' This stage is closed, so who qualified does not change.' : ''}</p>
  ${c ? `<div class="card complaint open" style="margin-bottom:14px"><div class="cmp-shot">${c.shotData && /^data:image\/(png|jpeg|webp);base64,/.test(c.shotData) ? `<img src="${esc(c.shotData)}" alt="Screenshot" data-act="viewShot">` : '<div class="noshot">No screenshot</div>'}</div>
    <div class="cmp-body"><b>Complaint from ${tname(c.teamId)}</b><p>${esc(c.reason)}</p><span class="small muted">Saving asks for a reply to the team and marks the complaint as corrected.</span></div></div>` : ''}
  ${mpErr ? `<div class="errors">${esc(mpErr)}</div>` : ''}
  <form data-form="matchpoints" data-m="${esc(m.id)}" data-c="${c ? esc(pr.c) : ''}"><div class="tw"><table><thead><tr><th>Team</th><th>Position</th><th>Kills</th><th>No-show</th><th>Pos pts</th><th>Total</th></tr></thead><tbody>
  ${order.map(tid => { const r = m.results[tid] || { noShow: true }, pp = r.noShow ? 0 : (E.PLACEMENT_POINTS[r.place - 1] || 0);
    return `<tr class="${tid === focus ? 'mp-focus' : ''}"><td>${tname(tid)}</td>
    <td><select name="place_${tid}" style="width:80px"><option value="">–</option>${g.teamIds.map((_, k) => `<option ${!r.noShow && r.place === k + 1 ? 'selected' : ''}>${k + 1}</option>`).join('')}</select></td>
    <td><input name="kills_${tid}" type="number" min="0" max="99" value="${r.noShow ? 0 : r.kills | 0}" style="width:80px"></td>
    <td><input type="checkbox" name="ns_${tid}" ${r.noShow ? 'checked' : ''}></td><td>${pp}</td><td><b>${r.noShow ? 0 : pp + (r.kills | 0) * E.POINTS_PER_KILL}</b></td></tr>`; }).join('')}
  </tbody></table></div>
  <div class="row" style="margin-top:12px"><button class="btn">Save points table</button><a class="btn ghost" href="${back}">Cancel</a></div></form>`;
}
function viewResults() {
  const items = S.stages.flatMap(st => st.groups.flatMap(g => g.matches.filter(m => m.resultStatus === 'submitted').map(m => ({ st, g, m }))));
  return `${adminTabs('admin/results')}<h1>Results to approve</h1><p class="sub">Check against the screenshots, then approve. Approved results appear on the leaderboard.</p>
  ${items.length ? `<div class="row" style="margin-bottom:10px"><button class="btn green small" data-act="approveAllResults">Approve all ${items.length}</button></div>` : '<p class="muted">Nothing waiting.</p>'}
  <div class="grid g2">${items.map(({ st, g, m }) => `<div class="card"><h3>${st.name} · ${st.final ? 'Final' : 'Group ' + GL(g.label)} · Match ${m.no} · ${esc(m.map)}</h3>
    <p class="small muted">Screenshots: ${m.screenshots.length ? m.screenshots.map(esc).join(', ') : 'none'}</p>
    <div class="tw"><table><thead><tr><th>Team</th><th>Pos</th><th>Kills</th><th>Pts</th></tr></thead><tbody>
    ${Object.entries(m.results).sort((a, b) => (a[1].noShow ? 99 : a[1].place) - (b[1].noShow ? 99 : b[1].place)).map(([id, r]) => `<tr><td>${tname(id)}</td><td>${r.noShow ? 'No-show' : r.place}</td><td>${r.noShow ? 0 : r.kills}</td><td>${r.noShow ? 0 : E.matchPoints(r.place, r.kills)}</td></tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:8px"><button class="btn green small" data-act="approveResult" data-m="${m.id}">Approve</button><button class="btn ghost small" data-act="returnResult" data-m="${m.id}">Send back to room creator</button></div></div>`).join('')}</div>`;
}
function approvedText(t) { return `${S.settings.name}: ${t.name} is APPROVED ✅ Team ID ${t.code || ''} · Slot ${t.slotNo || 'Wild Card'}. Watch My Team for your group and matches.`; }
let waFilter = 'queued';
function viewWhatsapp() {
  const st = curStage();
  const counts = s => S.notifications.filter(n => n.status === s).length;
  const list = S.notifications.filter(n => waFilter === 'all' || n.status === waFilter).slice(0, 100);
  const groups = st && st.status !== 'draft' ? st.groups : [];
  const inv = (g, id) => (S.groupLinks[linkKey(st, g)]?.invites || {})[id] || 'pending';
  const invBadge = v => `<span class="badge ${{ joined: 'b-ok', sent: 'b-acc', failed: 'b-bad' }[v] || 'b-warn'}">${v}</span>`;
  return `${adminTabs('admin/whatsapp')}<h1>WhatsApp</h1>
  <p class="sub">Group chats stay in WhatsApp (made by you). Important updates go to each captain one by one and are also shown on their My Team page.${S.settings.notifyPaused ? ' <span class="badge b-bad">Messages paused</span>' : ''}</p>
  <div class="notice small">Prototype: <b>Send</b> opens WhatsApp with the message ready for that captain. The live version can send automatically through the WhatsApp Business Platform (needs a Meta business account, approved templates and captain opt-in).</div>
  <h2>1. Group invite links ${st ? '· ' + st.name : ''}</h2>
  ${!groups.length ? '<p class="muted">Publish a stage first.</p>' : `<p class="small muted">Create the WhatsApp group in the app, copy its invite link, paste it here and save. Each captain in that group gets the link.</p>
  <div class="grid g2">${groups.map(g => { const L = S.groupLinks[linkKey(st, g)] || {}; const iv = L.invites || {};
    const joined = g.teamIds.filter(id => iv[id] === 'joined').length;
    return `<div class="card"><div class="row between"><h3>${st.final ? 'Grand Final' : 'Group ' + GL(g.label)}</h3><span class="small muted">${joined}/${g.teamIds.length} joined</span></div>
    <form data-form="walink" data-k="${esc(linkKey(st, g))}" class="row"><input name="link" placeholder="https://chat.whatsapp.com/…" value="${esc(L.link || '')}" style="flex:1;min-width:180px"><button class="btn small">${L.link ? 'Update' : 'Save'} link</button></form>
    ${L.link ? `<details style="margin-top:8px"><summary class="small">Captains (${g.teamIds.length})</summary><div class="tw" style="margin-top:6px"><table><tbody>${g.teamIds.map(id => `<tr><td>${tname(id)}</td><td>${invBadge(inv(g, id))}</td>
      <td class="row"><button class="btn small ghost" data-act="invite" data-k="${esc(linkKey(st, g))}" data-t="${id}" data-v="joined">Joined</button><button class="btn small ghost" data-act="invite" data-k="${esc(linkKey(st, g))}" data-t="${id}" data-v="failed">Failed</button></td></tr>`).join('')}</tbody></table></div></details>` : ''}</div>`; }).join('')}</div>`}
  <h2>2. Captain messages</h2>
  <div class="tabs">${['queued', 'sent', 'failed', 'all'].map(f => `<a href="#" data-act="waFilter" data-f="${f}" class="${f === waFilter ? 'on' : ''}">${f} (${f === 'all' ? S.notifications.length : counts(f)})</a>`).join('')}</div>
  ${waFilter === 'queued' && counts('queued') ? `<div class="row" style="margin-bottom:10px"><button class="btn ghost small" data-act="waMarkAll">Mark all queued as sent (sent through a provider)</button></div>` : ''}
  ${list.length ? `<div class="tw"><table><thead><tr><th>Team</th><th>Captain</th><th>Type</th><th>Message (preview)</th><th>Status</th><th></th></tr></thead><tbody>
  ${list.map(n => { const t = team(n.teamId); return `<tr><td>${tname(n.teamId)}</td><td class="small">${esc(t?.captainMobile || '')}</td><td><span class="badge">${esc(n.type)}</span></td><td class="small" style="white-space:pre-line;max-width:380px">${esc(n.text)}</td><td>${n.status === 'sent' ? '<span class="badge b-ok">sent</span>' : n.status === 'failed' ? '<span class="badge b-bad">failed</span>' : '<span class="badge b-warn">queued</span>'}</td>
    <td><div class="row">${t?.captainMobile ? `<a class="btn small" target="_blank" rel="noopener" href="${waUrl(t.captainMobile, n.text)}" data-act="waSend" data-id="${n.id}">${n.status === 'sent' ? 'Resend' : 'Send'}</a>` : ''}${n.status !== 'failed' ? `<button class="btn small ghost" data-act="waFail" data-id="${n.id}">Failed</button>` : ''}</div></td></tr>`; }).join('')}
  </tbody></table></div>` : '<p class="muted">No messages here.</p>'}
  <p class="small muted">If a message fails, it is still on the team's My Team page. Follow up with the captain by phone.</p>`;
}
function viewComplaints() {
  const open = S.complaints.filter(c => c.status === 'open').length;
  return `${adminTabs('admin/complaints')}<h1>Complaints</h1><p class="sub">${open} open · check the screenshot, then keep the result or fix it. Fixing updates the team's points, rank and kills straight away.</p>
  ${S.complaints.length ? S.complaints.map((c, i) => { const fm = c.matchId ? findMatch(c.matchId) : null; const r = fm?.m.results?.[c.teamId];
    return `<div class="card complaint${c.status === 'open' ? ' open' : ''}">
      <div class="cmp-shot">${c.shotData && /^data:image\/(png|jpeg|webp);base64,/.test(c.shotData) ? `<img src="${esc(c.shotData)}" alt="Screenshot from ${esc(team(c.teamId)?.name || 'team')}" data-act="viewShot">` : `<div class="noshot">No screenshot${c.shot ? '<br><span class="small">' + esc(c.shot) + ' (name only)</span>' : ''}</div>`}</div>
      <div class="cmp-body"><div class="row between"><div>${tname(c.teamId)} <span class="muted small">· ${esc(c.matchLabel)} · ${new Date(c.at).toLocaleString('en-IN')}</span></div>${statusBadge(c.status)}</div>
        <p class="cmp-reason">“${esc(c.reason)}”</p>
        <div class="small muted">Result on record: <b style="color:var(--ink)">${fm ? resultText(r) : 'match not found'}</b></div>
        ${c.answer ? `<div class="small" style="margin-top:6px">Reply sent: ${esc(c.answer)}</div>` : ''}
        ${c.status === 'open' ? `<div class="row" style="margin-top:10px"><button class="btn small green" data-act="resolve" data-i="${i}" data-v="kept">Keep result</button>${fm?.m.results ? `<a class="btn small" href="#/admin/match/${encodeURIComponent(fm.m.id)}?t=${encodeURIComponent(c.teamId)}&c=${i}">✎ Fix result</a>` : ''}</div>` : ''}
      </div></div>`; }).join('') : '<p class="muted">No complaints.</p>'}`;
}
function viewLog() {
  return `${adminTabs('admin/log')}<h1>Log</h1><div class="tw"><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Details</th></tr></thead><tbody>
  ${S.log.slice(0, 200).map(l => `<tr><td class="small">${new Date(l.at).toLocaleString('en-IN')}</td><td>${esc(l.who)}</td><td>${esc(l.action)}</td><td class="small">${esc(l.what)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------- room creator ----------
let roomErr = '';
function viewRoom() {
  const st = curStage();
  const tabs = session.role === 'admin' ? adminTabs('room') : '';
  if (!st || st.status !== 'published') return `${tabs}<h1>Room panel</h1><p class="muted">No published stage with matches right now.</p>`;
  const pr = params();
  const all = st.groups.flatMap((g, gi) => g.matches.map(m => ({ g, gi, m })));
  const queue = all.filter(x => x.m.resultStatus !== 'approved');
  const sel = all.find(x => x.m.id === pr.m) || queue[0];
  if (!sel) return `${tabs}<h1>Room panel</h1><p class="muted">All ${st.name} matches have approved results.</p>`;
  const { g, m } = sel;
  const editing = m.status === 'completed' && m.resultStatus === 'none';
  return `${tabs}<h1>Room panel</h1><p class="sub">${st.name} · ${queue.length} matches left</p>
  <div class="grid g3"><div class="card" style="max-height:540px;overflow:auto"><h3>Match queue</h3>
    ${queue.slice(0, 80).map(x => `<a href="#/room?m=${x.m.id}" class="row between" style="text-decoration:none;padding:6px 8px;border-radius:8px;${x.m.id === m.id ? 'background:var(--panel2)' : ''}"><span>${st.final ? 'Final' : 'G' + GL(x.g.label)} · M${x.m.no} <span class="muted small">${matchDate(st, x.m)} ${x.m.time}</span></span>${matchBadge(x.m)}</a>`).join('')}
  </div>
  <div class="card" style="grid-column:span 2"><div class="row between"><h3>${st.final ? 'Grand Final' : 'Group ' + GL(g.label)} · Match ${m.no} · ${esc(m.map)} · ${matchDate(st, m)}, ${m.time}</h3>${matchBadge(m)}</div>
    ${roomErr ? `<div class="errors">${esc(roomErr)}</div>` : ''}
    <div class="row" style="margin:6px 0 12px">
      ${m.status === 'scheduled' ? `<button class="btn" data-act="mstatus" data-m="${m.id}" data-s="checkin">Open check-in</button>` : ''}
      ${m.status === 'checkin' ? `<form data-form="room" data-m="${m.id}" class="row"><input name="roomId" placeholder="Room ID" style="width:140px" required><input name="roomPass" placeholder="Password" style="width:120px" required><button class="btn">Release room to teams</button>${prevRoom(g, m) ? `<button type="button" class="btn ghost small" data-act="sameRoom" data-m="${m.id}">Use same room as Match ${prevRoom(g, m).no}</button>` : ''}</form>` : ''}
      ${m.status === 'room' ? `<span class="small">Room <b>${esc(m.roomId)}</b> / <b>${esc(m.roomPass)}</b> released</span><button class="btn" data-act="mstatus" data-m="${m.id}" data-s="live">Mark LIVE</button>` : ''}
      ${m.status === 'live' ? `<button class="btn" data-act="mstatus" data-m="${m.id}" data-s="completed">Mark completed</button>` : ''}
      ${m.status !== 'completed' && m.status !== 'scheduled' ? `<button class="btn ghost small" data-act="checkinAll" data-m="${m.id}">Demo: check in all teams</button>` : ''}
    </div>
    ${editing ? `<form data-form="results" data-m="${m.id}"><div class="tw"><table><thead><tr><th>Slot</th><th>Team</th><th>Checked in</th><th>Position</th><th>Kills</th><th>No-show</th></tr></thead><tbody>
      ${g.teamIds.map((id, i) => `<tr><td>${i + 1}</td><td>${tname(id)}</td><td>${m.checkins.includes(id) ? '✅' : '—'}</td>
      <td><select name="place_${id}" style="width:80px"><option value="">–</option>${g.teamIds.map((_, k) => `<option>${k + 1}</option>`).join('')}</select></td>
      <td><input name="kills_${id}" type="number" min="0" max="99" value="0" style="width:80px"></td><td><input type="checkbox" name="ns_${id}" ${m.checkins.includes(id) ? '' : 'checked'}></td></tr>`).join('')}</tbody></table></div>
      <label>Screenshots (required)</label><input type="file" name="shots" accept="image/*" multiple>
      <div class="row" style="margin-top:10px"><button class="btn">${session.role === 'admin' ? 'Publish results' : 'Submit results to admin'}</button><button type="button" class="btn ghost" data-act="randomFill" data-m="${m.id}">Demo: random fill</button></div></form>`
      : `<div class="tw"><table><thead><tr><th>Slot</th><th>Team</th><th>Checked in</th>${m.results ? '<th>Pos</th><th>Kills</th>' : ''}</tr></thead><tbody>
      ${g.teamIds.map((id, i) => `<tr><td>${i + 1}</td><td>${tname(id)}</td><td>${m.checkins.includes(id) ? '✅' : '—'}</td>${m.results ? `<td>${m.results[id]?.noShow ? 'No-show' : m.results[id]?.place}</td><td>${m.results[id]?.kills ?? ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`}
  </div></div>`;
}
// The last earlier match of this group that had a room (for "use the same room").
const prevRoom = (g, m) => g.matches.filter(x => x.no < m.no && x.roomId).pop();
function findMatch(id) { for (const st of S.stages) for (const g of st.groups) for (const m of g.matches) if (m.id === id) return { st, g, m }; return null; }
function randomResults(teamIds, checkins) {
  const order = E.shuffle(teamIds), res = {};
  order.forEach((id, i) => { res[id] = { place: i + 1, kills: Math.max(0, Math.round((12 - i) * Math.random() * 1.4)) }; });
  return res;
}

// ---------- router ----------
function params() { const q = location.hash.split('?')[1] || ''; return Object.fromEntries(new URLSearchParams(q)); }
function route() { return (location.hash.replace(/^#\/?/, '').split('?')[0]) || ''; }
function render() {
  const r = route();
  document.getElementById('brandName').textContent = S.settings.name;
  { const b = document.querySelector('.top .brand'), cur = b.querySelector('.logo'); const want = logoOk() ? S.settings.logo : ''; if ((cur.getAttribute('src') || '') !== want) cur.outerHTML = tlogo('logo'); }
  document.getElementById('modeNote').textContent = Cloud.on ? 'Live' : 'Offline demo (data saved in this browser)';
  if (Cloud.on) session.role = Cloud.role;
  document.querySelectorAll('.mainnav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + r.split('/')[0]));
  { const k = r.split('/')[0] || (S.stages.length ? 'overview' : ''); document.querySelectorAll('.rail a').forEach(a => a.classList.toggle('on', a.dataset.r === k));
    const reg = document.querySelector('.rail-reg'); if (reg) reg.hidden = !!S.stages.length;
    const names = { '': 'Register', overview: 'Overview', groups: 'Group Stage', schedule: 'Matches', leaderboard: 'Standings', bracket: 'Bracket', info: 'Rules', 'my-team': 'My Team', staff: 'Staff login', registered: 'Registered', wildcard: 'Wild Card invite', match: 'Match result', room: 'Room panel' };
    const tt = document.getElementById('topTitle'); if (tt) tt.textContent = k.startsWith('admin') || session.role === 'admin' && r.startsWith('admin') ? 'Admin' : (names[k] ?? 'Tournament'); }
  const staffOnly = r.startsWith('admin') || r === 'room';
  if (staffOnly && !session.role) { app.innerHTML = viewStaff(); return; }
  if (r.startsWith('admin') && session.role !== 'admin') { app.innerHTML = `<p>Admins only.</p>${viewStaff()}`; return; }
  const views = { '': viewRegister, 'my-team': () => session.teamCode ? viewTeamDash() : viewMyTeamLogin(), groups: viewGroups, schedule: viewSchedule, leaderboard: viewLeaderboard,
    bracket: viewBracket, info: viewInfo, staff: viewStaff, admin: viewAdmin, 'admin/settings': viewSettings, 'admin/teams': viewTeams, 'admin/wildcards': viewWildcards,
    'admin/stages': viewStages, 'admin/results': viewResults, 'admin/complaints': viewComplaints, 'admin/log': viewLog, 'admin/whatsapp': viewWhatsapp, room: viewRoom };
  views.overview = viewOverview;
  views.bracket = viewBracketTeams;
  const pub = ['', 'overview', 'groups', 'schedule', 'leaderboard', 'bracket', 'info'];
  const key = r === '' && S.stages.length ? 'overview' : r;
  if (r.startsWith('registered/')) app.innerHTML = viewRegistered(r.split('/')[1]);
  else if (r.startsWith('wildcard/')) app.innerHTML = viewWcInvite(r.split('/')[1]);
  else if (r.startsWith('match/')) app.innerHTML = hero('schedule') + viewMatchResult(decodeURIComponent(r.split('/')[1]));
  else if (r.startsWith('admin/team/')) app.innerHTML = adminShell('admin/teams', viewEditTeam(r.split('/')[2]));
  else if (r.startsWith('admin/match/')) app.innerHTML = adminShell('admin/complaints', viewMatchPoints(decodeURIComponent(r.split('/')[2])));
  else {
    const html = (pub.includes(key) ? hero(key) : '') + `<div class="page-body">${(views[key] || viewRegister)()}</div>`;
    const shell = session.role === 'admin' && (key.startsWith('admin') || key === 'room');
    app.innerHTML = shell ? adminShell(key, html) : html;
  }
  // Wild Card route: bring the joining stage into view on narrow screens.
  const rs = document.querySelector('.rt-scroll'), rw = rs && rs.querySelector('.rt-wcbox');
  if (rw && rs.scrollWidth > rs.clientWidth) requestAnimationFrame(() => { rs.scrollLeft = rw.offsetLeft - rs.clientWidth / 2 + rw.offsetWidth / 2; });
  if (document.querySelector('.lx-lines')) { requestAnimationFrame(() => { const sc = document.querySelector('.lx-scroll'); if (sc) sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2; drawBracketLines(); }); document.fonts?.ready.then(() => requestAnimationFrame(drawBracketLines)); }
  document.body.classList.toggle('is-admin', session.role === 'admin' && (r.startsWith('admin') || r.split('?')[0] === 'room'));
}
window.addEventListener('hashchange', () => { roomErr = ''; pwResult = null; mpErr = ''; render(); window.scrollTo(0, 0); });

// ---------- events ----------
document.addEventListener('submit', e => {
  const f = e.target, kind = f.dataset.form; if (!kind) return;
  e.preventDefault();
  const fd = new FormData(f);
  if (kind === 'register') return submitRegister(f);
  if (kind === 'teamlogin' && Cloud.on) {
    const btn = f.querySelector('button'); btn.disabled = true;
    Cloud.teamLogin(String(fd.get('email')), String(fd.get('password'))).then(ok => { loginError = ok ? '' : 'Could not open your team. Try again.'; render(); }, err => { loginError = err.message; render(); });
    return;
  }
  if (kind === 'forgot') {
    Cloud.resetPassword(String(fd.get('email'))).then(m => { resetMsg = m; render(); }, err => { resetMsg = err.message; render(); });
    return;
  }
  if (kind === 'stafflogin') {
    Cloud.signIn(String(fd.get('email')), String(fd.get('password'))).then(r => { staffErr = ''; session.role = r; save(); location.hash = r === 'admin' ? '#/admin' : '#/room'; render(); }, err => { staffErr = err.message; render(); });
    return;
  }
  if (kind === 'teamlogin') {
    const t = S.teams.find(x => x.code.toLowerCase() === String(fd.get('code')).trim().toLowerCase() && x.captainMobile === String(fd.get('mobile')).replace(/\D/g, ''));
    if (!t) { loginError = 'Team ID and captain mobile do not match.'; render(); return; }
    loginError = ''; session.teamCode = t.code; save(); render(); return;
  }
  if (kind === 'complaint') {
    const fm = findMatch(fd.get('match')), file = fd.get('shot'), btn = f.querySelector('button'); btn.disabled = true;
    readShot(file).then(shotData => {
      if (Cloud.on) return Cloud.complain(fd.get('match'), fm.st.name + ' · Match ' + fm.m.no, String(fd.get('reason')), file?.name || '', shotData || '')
        .then(() => Cloud.refreshTeam()).then(() => { toast('Complaint sent'); render(); });
      S.complaints.unshift({ teamId: fd.get('team'), matchId: fd.get('match'), matchLabel: fm.st.name + ' · Match ' + fm.m.no, reason: String(fd.get('reason')), shot: file?.name || '', shotData, status: 'open', at: new Date().toISOString() });
      log('Complaint raised', team(fd.get('team')).name); save(); toast('Complaint sent'); render();
    }).catch(err => { btn.disabled = false; toast(err.message); });
    return;
  }
  if (kind === 'matchpoints') {
    const fm = findMatch(f.dataset.m); if (!fm || !fm.m.results) { toast('Match result not found'); return; }
    const { st, g, m } = fm, res = {}, used = new Set(); mpErr = '';
    for (const id of g.teamIds) {
      const ns = !!fd.get('ns_' + id), place = Number(fd.get('place_' + id)), kills = Math.max(0, Number(fd.get('kills_' + id)) || 0);
      if (ns) { res[id] = { noShow: true, place: null, kills: 0 }; continue; }
      if (!place) { mpErr = 'Choose a position for ' + team(id).name + ' or tick No-show.'; break; }
      if (used.has(place)) { mpErr = 'Position ' + place + ' is used twice.'; break; }
      used.add(place); res[id] = { place, kills };
    }
    if (mpErr) { render(); return; }
    const changed = g.teamIds.filter(id => JSON.stringify(m.results[id] || null) !== JSON.stringify(res[id]));
    if (!changed.length) { toast('Nothing changed'); return; }
    const what = changed.map(id => `${team(id)?.name}: ${resultText(m.results[id])} → ${resultText(res[id])}`).join('; ');
    const ci = f.dataset.c;
    if (ci !== undefined && ci !== '') {
      const c = S.complaints[Number(ci)], mine = res[c.teamId];
      const ans = prompt('Reply to the team:', `Result corrected: ${resultText(mine)} (was ${resultText(m.results[c.teamId])}).`); if (ans === null) return;
      c.status = 'corrected'; c.answer = ans; notify(c.teamId, 'complaint', c.matchId + '|' + Date.now(), `${S.settings.name} · ${c.matchLabel}: ${ans}`);
    }
    m.results = res;
    log('Points table corrected', `${st.name} M${m.no} · ${what}`); save(); toast('Points table saved'); if (ci !== undefined && ci !== '') location.hash = '#/admin/complaints'; else render(); return;
  }
  if (kind === 'fixresult') {
    const fm = findMatch(f.dataset.m); if (!fm || !fm.m.results) { toast('Match result not found'); return; }
    const teamId = f.dataset.t, ns = !!fd.get('ns'), place = Number(fd.get('place')), kills = Number(fd.get('kills')) || 0;
    const { before, after } = changeResult(fm.m, fm.g, teamId, place, kills, ns);
    const what = `${team(teamId)?.name}: ${fm.st.name} M${fm.m.no} ${resultText(before)} → ${resultText(after)}`;
    if (f.dataset.c !== undefined && f.dataset.c !== '') {
      const c = S.complaints[Number(f.dataset.c)];
      const ans = prompt('Reply to the team:', `Result corrected: ${resultText(after)} (was ${resultText(before)}).`); if (ans === null) { Object.assign(fm.m.results[teamId], before); return; }
      c.status = 'corrected'; c.answer = ans; notify(teamId, 'complaint', c.matchId + '|' + Date.now(), `${S.settings.name} · ${c.matchLabel}: ${ans}`);
    }
    log('Result corrected', what); openFix = null; save(); toast('Result updated'); render(); return;
  }
  if (kind === 'stagecfg') {
    const st = curStage(); if (!st) return;
    const d = String(fd.get('startDate') || ''); if (/^\d{4}-\d{2}-\d{2}$/.test(d)) st.startDate = d;
    if (st.status === 'draft') {
      const mc = Math.floor(Number(fd.get('matchCount'))); if (mc >= 1 && mc <= 30) st.matchCount = mc;
      if (!st.final) { const tn = Math.floor(Number(fd.get('topN'))); if (tn >= 1 && tn <= 11) st.topN = tn; }
    }
    log('Stage settings changed', `${st.name}: starts ${st.startDate || '-'}, MT ${st.matchCount || '-'}${st.final ? '' : ', Top ' + st.topN}`); save(); toast('Stage saved'); render(); return;
  }
  if (kind === 'format') {
    const f = FORMATS[fd.get('preset')];
    if (f) { FORMAT_KEYS.forEach(k => { S.settings[k] = f[k]; }); log('Bracket format changed', f.label); save(); toast('Format generated'); }
    else toast('Custom format: set the numbers in Settings');
    render(); return;
  }
  if (kind === 'settings') {
    const s = S.settings; s.name = String(fd.get('name') || 'Squad Cup').trim(); s.regCloses = String(fd.get('regCloses')); s.prize = String(fd.get('prize') || '').trim(); s.organiser = String(fd.get('organiser') || '').trim(); s.startDate = String(fd.get('startDate') || '');
    if (Cloud.on) { s.emailFrom = String(fd.get('emailFrom') || '').trim(); s.emailName = String(fd.get('emailName') || '').trim(); s.siteUrl = location.origin; }
    s.regOpen = !!fd.get('regOpen'); s.notifyPaused = !!fd.get('notifyPaused');
    { const num = (k, d, max) => { const v = Math.floor(Number(fd.get(k))); return v >= 1 && v <= max ? v : d; };
      s.stage1Top = num('stage1Top', 8, 11); s.laterTop = num('laterTop', 6, 11); s.matchesPerStage = num('matchesPerStage', 6, 30); s.finalMatches = num('finalMatches', 12, 30);
      s.finalMode = fd.get('finalMode') === 'rush' ? 'rush' : 'normal'; s.rushTarget = num('rushTarget', 80, 999);
      const lines = k => String(fd.get(k) || '').split('\n').map(x => x.trim().slice(0, 200)).filter(Boolean).slice(0, 20);
      s.rulesMatch = lines('rulesMatch'); s.rulesFair = lines('rulesFair'); }
    if (!S.stages.length) {
      s.slots = Math.max(24, Math.min(5000, Number(fd.get('slots')) || 252));
      s.wildCards = Math.max(0, Math.min(12, Number(fd.get('wildCards')) || 0));
      // Lowering slots pushes the latest registrations to the waitlist; raising pulls waitlist in.
      const active = slotTeams().filter(t => t.status === 'pending' || t.status === 'approved').sort((a, b) => a.slotNo - b.slotNo);
      active.slice(s.slots).forEach(t => { t.status = 'waitlist'; t.slotNo = null; });
      promoteWaitlist();
    }
    log('Settings saved', `slots ${s.slots}, wild cards ${s.wildCards}`); save(); toast('Saved'); render(); return;
  }
  if (kind === 'wildcard') {
    const data = readTeamForm(f); wcDraft = data;
    wcErrors = E.validateTeam(data, allPlayers(), S.teams.filter(t => t.status !== 'rejected').map(t => t.name));
    data.logo = wcLogo;
    if (!wcErrors.length) { const t = makeTeam(data, 'WC', 'admin'); wcLogo = null; log('Wild Card added', t.code + ' ' + t.name); wcDraft = null; save(); toast('Wild Card added: ' + t.code); }
    render(); return;
  }
  if (kind === 'wcinvite') {
    const a = new Uint8Array(16); crypto.getRandomValues(a);
    const inv = { token: [...a].map(b => b.toString(16).padStart(2, '0')).join(''), note: String(fd.get('note') || '').trim().slice(0, 40), status: 'open', createdAt: new Date().toISOString() };
    S.wcInvites.push(inv); log('Wild Card invite created', inv.note || inv.token.slice(0, 6)); save(); toast('Invite link created'); render(); return;
  }
  if (kind === 'wcemail') {
    const inv = S.wcInvites.find(i => i.token === f.dataset.token), email = String(fd.get('email') || '').trim().toLowerCase();
    if (!/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) { toast('Enter a valid email'); return; }
    if (!Cloud.on) { inv.email = email; save(); toast('Offline demo: no email is sent. Copy the link instead.'); render(); return; }
    const btn = f.querySelector('button'); btn.disabled = true;
    Cloud.sendWcInvite(inv.token, email).then(ok => { if (ok) { inv.email = email; inv.emailedAt = new Date().toISOString(); log('Wild Card invite emailed', email); save(); toast('Invite emailed to ' + email); } else toast('Not sent: email limit reached or email not set up'); render(); }, err => { toast(err.message); render(); });
    return;
  }
  if (kind === 'wcregister') {
    const token = f.dataset.token, data = readTeamForm(f); formDraft = data;
    const errors = E.validateTeam(data, allPlayers(), S.teams.filter(t => t.status !== 'rejected').map(t => t.name));
    if (!formLogo) errors.push('Team logo is required');
    if (!fd.get('agree')) errors.push('Please accept the rules');
    data.logo = formLogo; wcFormErrors = errors;
    if (errors.length) { render(); window.scrollTo(0, 0); return; }
    if (Cloud.on) {
      const btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Submitting…';
      Cloud.registerWildcard(token, data).then(r => { lastRegistered = { ...r, players: [] }; formDraft = null; formLogo = null; wcFormErrors = []; delete wcCheck[token]; location.hash = '#/registered/' + r.code; },
        err => { wcFormErrors = [err.message]; render(); window.scrollTo(0, 0); });
      return;
    }
    const inv = S.wcInvites.find(i => i.token === token);
    if (!inv || inv.status !== 'open') { wcFormErrors = ['This invite is no longer valid']; render(); return; }
    const t = makeTeam(data, 'WC', 'invite'); t.status = 'pending';
    inv.status = 'used'; inv.teamId = t.id; inv.usedAt = new Date().toISOString();
    log('Wild Card registered by invite', t.code + ' ' + t.name); formDraft = null; formLogo = null; wcFormErrors = []; save();
    location.hash = '#/registered/' + t.code; return;
  }
  if (kind === 'setpw') {
    const pw = String(fd.get('pw') || '').trim(), mail = !!fd.get('email'), t = team(f.dataset.id);
    if (pw && (pw.length < 6 || /\s/.test(pw))) { toast('Use 6–40 characters with no spaces'); return; }
    if (!confirm(`Set a new password for ${t.name}?${mail ? '\nIt will be emailed to ' + t.players[0].email + '.' : ''}\nThe team will be signed out on every device.`)) return;
    const btn = f.querySelector('button'); btn.disabled = true;
    Cloud.setPassword(t.id, pw, mail).then(res => { pwResult = { id: t.id, emailed: res.emailed }; toast(mail && !res.emailed ? 'Password saved, but not emailed: set up Brevo and the sender email first' : 'Password saved'); render(); },
      err => { btn.disabled = false; toast(err.message); });
    return;
  }
  if (kind === 'editteam') {
    const t = team(f.dataset.id), data = readTeamForm(f);
    const errors = E.validateTeam(data, allPlayers(t.id), S.teams.filter(x => x.id !== t.id && x.status !== 'rejected').map(x => x.name));
    // Teams added by CSV import may have no logo, so the admin can save without one (initials are shown instead).
    editErrors = errors;
    if (errors.length) { render(); const f2 = document.querySelector('[data-form=editteam]'); f2.teamName.value = data.name; data.players.forEach((p, i) => ['name', 'mobile', 'email', 'uid'].forEach(k => f2['p' + i + k].value = p[k])); window.scrollTo(0, 0); return; }
    const changes = [];
    if (t.name !== data.name) changes.push('name');
    if (t.logo !== editLogo) changes.push('logo');
    data.players.forEach((p, i) => ['name', 'mobile', 'email', 'uid'].forEach(k => { if ((t.players[i] || {})[k] !== p[k]) changes.push('P' + (i + 1) + ' ' + k); }));
    const emailChanged = (t.players[0] || {}).email !== data.players[0].email;
    t.name = data.name; t.logo = editLogo; t.players = data.players; t.captainMobile = data.players[0].mobile;
    log('Team edited', (t.code || '') + ' ' + t.name + ': ' + (changes.join(', ') || 'no changes'));
    editFor = null; save();
    toast(changes.length ? 'Saved' + (Cloud.on && emailChanged ? '. Captain email changed: send a new login from Teams.' : '') : 'No changes');
    location.hash = t.entry === 'WC' ? '#/admin/wildcards' : '#/admin/teams'; return;
  }
  if (kind === 'walink') {
    const k = f.dataset.k, link = String(fd.get('link')).trim();
    if (link && !/^https:\/\/(chat\.whatsapp\.com|wa\.me)\//.test(link)) { toast('Paste a WhatsApp invite link (https://chat.whatsapp.com/…)'); return; }
    const [si, label] = k.split('|'); const stg = S.stages[Number(si)], g = stg.groups.find(x => x.label === label);
    const L = S.groupLinks[k] = S.groupLinks[k] || { link: '', invites: {} };
    const changed = L.link !== link; L.link = link;
    if (link && changed) g.teamIds.forEach(id => {
      S.notifications = S.notifications.filter(n => !(n.key === 'invite|' + id + '|' + k && n.status === 'queued'));
      const old = S.notifications.find(n => n.key === 'invite|' + id + '|' + k); if (old) old.key += '|old';
      notify(id, 'invite', k, `${S.settings.name} · ${stg.name}: join your ${stg.final ? 'Grand Final' : 'Group ' + GL(g.label)} WhatsApp group: ${link}`);
      if (L.invites[id] !== 'joined') L.invites[id] = 'pending';
    });
    log('WhatsApp link saved', stg.name + ' ' + label); save(); toast('Link saved · invites queued'); render(); return;
  }
  if (kind === 'room') {
    const { m } = findMatch(f.dataset.m); m.roomId = String(fd.get('roomId')).trim(); m.roomPass = String(fd.get('roomPass')).trim();
    if (!m.roomId || !m.roomPass) return;
    m.status = 'room';
    { const fm = findMatch(f.dataset.m); m.checkins.forEach(id => notify(id, 'room', m.id, `${S.settings.name} · ${fm.st.name} Group ${GL(fm.g.label)} Match ${m.no} (${m.map}, ${m.time})\nRoom ID: ${m.roomId}\nPassword: ${m.roomPass}\nJoin with slot ${fm.g.teamIds.indexOf(id) + 1}. Do not share.`)); }
    log('Room released', m.id); save(); toast('Room details sent to checked-in teams'); render(); return;
  }
  if (kind === 'results') {
    const { g, m } = findMatch(f.dataset.m); const res = {}; const used = new Set(); roomErr = '';
    for (const id of g.teamIds) {
      const ns = !!fd.get('ns_' + id), place = Number(fd.get('place_' + id)), kills = Number(fd.get('kills_' + id)) || 0;
      if (ns) { res[id] = { noShow: true, place: null, kills: 0 }; continue; }
      if (!place) { roomErr = 'Choose a position for ' + team(id).name + ' or mark no-show.'; break; }
      if (used.has(place)) { roomErr = 'Position ' + place + ' is used twice.'; break; }
      used.add(place); res[id] = { place, kills };
    }
    const shots = [...f.querySelector('[name=shots]').files].map(x => x.name);
    if (!roomErr && !shots.length && !f.dataset.demo) roomErr = 'Upload at least one screenshot.';
    if (roomErr) { render(); return; }
    const admin = session.role === 'admin';   // the admin is the approver, so their own entry is published at once
    m.results = res; m.screenshots = shots.length ? shots : ['demo-screenshot.png']; m.resultStatus = admin ? 'approved' : 'submitted';
    log(admin ? 'Results entered and published' : 'Results submitted', m.id); save(); toast(admin ? 'Results published: points are on the leaderboard' : 'Sent to admin for approval. Points appear once approved.'); render(); return;
  }
});
document.addEventListener('change', e => {
  const el = e.target, act = el.dataset.act; if (!act) return;
  const st = curStage();
  if (act === 'filter') { teamFilter.status = el.value; render(); }
  if (act === 'preset') { const f = FORMATS[el.value], form = el.closest('form');
    if (f && form && form.dataset.form === 'settings') FORMAT_KEYS.forEach(k => { const inp = form.elements[k]; if (inp) inp.value = f[k]; }); }
  if (act === 'tlogo') { const file = el.files[0]; if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Use a PNG, JPG or WEBP image'); return; }
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 256 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); S.settings.logo = c.toDataURL('image/png'); log('Tournament logo changed', ''); save(); toast('Logo saved'); render(); };
    img.onerror = () => { URL.revokeObjectURL(url); toast('Could not read that image'); }; img.src = url; }
  if (act === 'logo') {
    const form = el.closest('form'), kind = form.dataset.form;
    const keep = readTeamForm(form);
    readLogo(el.files[0], url => {
      if (kind === 'wildcard') { wcLogo = url; wcDraft = keep; }
      else if (kind === 'editteam') { editLogo = url; const t = team(form.dataset.id); render(); const f2 = document.querySelector('[data-form=editteam]'); f2.teamName.value = keep.name; keep.players.forEach((p, i) => ['name', 'mobile', 'email', 'uid'].forEach(k => f2['p' + i + k].value = p[k])); return; }
      else { formLogo = url; formDraft = keep; }
      render();
    });
  }
  if (act === 'move') {
    const from = Number(el.dataset.from), to = Number(el.value), id = el.dataset.id;
    if (st.groups[to].teamIds.length >= 12) { toast('That group is full (12)'); render(); return; }
    st.groups[from].teamIds = st.groups[from].teamIds.filter(x => x !== id); st.groups[to].teamIds.push(id);
    log('Team moved', team(id).name + ' → Group ' + GL(st.groups[to].label)); save(); render();
  }
  if (act === 'placeWc' && el.value !== '') {
    const to = Number(el.value), id = el.dataset.id;
    if (st.groups[to].teamIds.length >= 12) { toast('That group is full (12)'); render(); return; }
    st.groups[to].teamIds.push(id); st.wcTray = st.wcTray.filter(x => x !== id);
    log('Wild Card placed', team(id).name + ' → Group ' + GL(st.groups[to].label) + ' slot ' + st.groups[to].teamIds.length); save(); render();
  }
  if (act === 'import') {
    const file = el.files[0]; if (!file) return;
    const rd = new FileReader();
    rd.onload = () => {
      const rows = parseCsv(String(rd.result)); let ok = 0; const bad = [];
      rows.slice(1).forEach((r, i) => {
        if (!r.some(x => x.trim())) return;
        // Google Forms adds a Timestamp column first; skip it if present.
        const c = /\d{1,2}\/\d{1,2}\/\d{4}/.test(r[0]) ? r.slice(1) : r;
        const data = { name: (c[0] || '').trim(), players: [0, 1, 2, 3].map(k => ({ name: (c[1 + k * 4] || '').trim(), mobile: (c[2 + k * 4] || '').replace(/\D/g, '').slice(-10), email: (c[3 + k * 4] || '').trim().toLowerCase(), uid: (c[4 + k * 4] || '').replace(/\D/g, '') })) };
        const errs = E.validateTeam(data, allPlayers(), S.teams.filter(t => t.status !== 'rejected').map(t => t.name));
        if (errs.length) bad.push('Row ' + (i + 2) + ': ' + errs[0]); else { makeTeam(data, 'SLOT', 'google_import'); ok++; }
      });
      log('Google Form import', ok + ' teams imported, ' + bad.length + ' skipped'); save(); render();
      toast(ok + ' imported' + (bad.length ? ', ' + bad.length + ' skipped' : ''));
      if (bad.length) alert('Skipped rows:\n' + bad.slice(0, 20).join('\n'));
    };
    rd.readAsText(file);
  }
});
document.addEventListener('input', e => {
  if (e.target.dataset.act === 'bsearch') { bracketQuery = e.target.value; const pos = e.target.selectionStart; render(); const el = document.querySelector('[data-act=bsearch]'); el.focus(); el.setSelectionRange(pos, pos);
    if (!params().phase && bracketQuery) { const st = curStage(); if (st) location.hash = '#/bracket?phase=' + st.index; } return; }
  if (e.target.dataset.act === 'search') { teamFilter.q = e.target.value; const pos = e.target.selectionStart; render(); const el = document.querySelector('[data-act=search]'); el.focus(); el.setSelectionRange(pos, pos); }
});
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const act = el.dataset.act, st = curStage();
  const done = (msg) => { save(); if (msg) toast(msg); render(); };
  switch (act) {
    case 'copy': e.preventDefault(); navigator.clipboard?.writeText(el.dataset.text).then(() => toast('Copied'), () => toast(el.dataset.text)); break;
    case 'waFilter': e.preventDefault(); waFilter = el.dataset.f; render(); break;
    case 'waSend': { const n = S.notifications.find(x => x.id === el.dataset.id); n.status = 'sent'; n.sentAt = new Date().toISOString();
      if (n.type === 'invite') { const L = S.groupLinks[n.key.split('|').slice(2, 4).join('|')]; if (L && L.invites[n.teamId] !== 'joined') L.invites[n.teamId] = 'sent'; }
      save(); setTimeout(render, 50); break; }
    case 'waFail': { const n = S.notifications.find(x => x.id === el.dataset.id); n.status = 'failed';
      if (n.type === 'invite') { const L = S.groupLinks[n.key.split('|').slice(2, 4).join('|')]; if (L) L.invites[n.teamId] = 'failed'; }
      log('Message failed', team(n.teamId)?.name + ' ' + n.type); done('Marked failed'); break; }
    case 'waMarkAll': { let c = 0; S.notifications.forEach(n => { if (n.status === 'queued') { n.status = 'sent'; c++;
      if (n.type === 'invite') { const L = S.groupLinks[n.key.split('|').slice(2, 4).join('|')]; if (L && L.invites[n.teamId] !== 'joined') L.invites[n.teamId] = 'sent'; } } });
      log('Messages marked sent', c); done(c + ' marked sent'); break; }
    case 'invite': { const L = S.groupLinks[el.dataset.k]; L.invites[el.dataset.t] = el.dataset.v; log('Invite ' + el.dataset.v, team(el.dataset.t).name); done(); break; }
    case 'sendLogin': { const t = team(el.dataset.id); if (!confirm('Email a new password to ' + t.players[0].email + '?')) break;
      Cloud.sendLogins([t.id]).then(n => { if (n) { delete loginNote[t.id]; toast('Login emailed to ' + t.players[0].email); } else { loginNote[t.id] = 'Not sent: email is not set up (Brevo key or sender missing)'; toast(loginNote[t.id]); } render(); }, err => { loginNote[t.id] = 'Not sent: ' + err.message; toast(err.message); render(); }); break; }
    case 'sendLoginsMissing': { const ids = S.teams.filter(t => t.status !== 'rejected' && !S.loginSent?.[t.id]).map(t => t.id);
      if (!ids.length) { toast('Every team already has its login'); break; }
      if (!confirm('Email login passwords to ' + ids.length + ' captains? (Brevo free plan: 300 emails/day)')) break;
      Cloud.sendLogins(ids.slice(0, 300)).then(n => { toast(n + ' login emails queued'); render(); }, err => toast(err.message)); break; }
    case 'emailLog': Cloud.emailLog().then(rows => { emailLogRows = rows || []; render(); }, err => toast(err.message)); break;
    case 'emailLogClose': emailLogRows = null; render(); break;
    case 'togglePw': showPw = !showPw; render(); break;
    case 'tlogoRemove': e.preventDefault(); delete S.settings.logo; log('Tournament logo removed', ''); done('Logo removed'); break;
    case 'sameRoom': { const fm = findMatch(el.dataset.m), pm = prevRoom(fm.g, fm.m), f = el.closest('form'); if (pm) { f.roomId.value = pm.roomId; f.roomPass.value = pm.roomPass; toast('Filled from Match ' + pm.no + '. Click Release room to send it.'); } break; }
    case 'deleteTeam': { const t = team(el.dataset.id); if (!t) break;
      const inStage = S.stages.some(st => st.groups.some(g => g.teamIds.includes(t.id)));
      if (!confirm(`Delete ${t.name} (${t.code || 'no ID'}) for good?${inStage ? '\nThis team is already in a group: it will be removed from its groups and results too.' : ''}\nThis cannot be undone.`)) break;
      S.stages.forEach(st => { st.groups.forEach(g => { g.teamIds = g.teamIds.filter(id => id !== t.id); g.matches.forEach(m => { if (m.results) delete m.results[t.id]; m.checkins = (m.checkins || []).filter(id => id !== t.id); }); });
        if (st.qualified) st.qualified = st.qualified.filter(id => id !== t.id); if (st.wcTray) st.wcTray = st.wcTray.filter(id => id !== t.id); });
      S.teams = S.teams.filter(x => x.id !== t.id); S.complaints = S.complaints.filter(c => c.teamId !== t.id); S.notifications = S.notifications.filter(n => n.teamId !== t.id);
      Object.values(S.groupLinks).forEach(L => { if (L.invites) delete L.invites[t.id]; });
      log('Team deleted', (t.code || '') + ' ' + t.name); if (!S.stages.length) promoteWaitlist(); done(t.name + ' deleted'); break; }
    case 'lbOpen': lbOpen.has(el.dataset.k) ? lbOpen.delete(el.dataset.k) : lbOpen.add(el.dataset.k); render(); break;
    case 'signout': Cloud.signOut().then(() => { session.role = null; save(); location.hash = '#/staff'; render(); }); break;
    case 'role': e.preventDefault(); session.role = el.dataset.r || null; save(); location.hash = session.role === 'admin' ? '#/admin' : session.role === 'room' ? '#/room' : '#/staff'; render(); break;
    case 'teamlogout': if (Cloud.on) { Cloud.teamLogout().then(render); break; } session.teamCode = null; done(); break;
    case 'checkin': if (Cloud.on && !Cloud.role) { el.disabled = true; Cloud.checkin(el.dataset.m).then(() => { toast('Checked in ✅'); render(); }, err => { toast(err.message); render(); }); break; }
    { const { m } = findMatch(el.dataset.m); if (!m.checkins.includes(el.dataset.t)) m.checkins.push(el.dataset.t); log('Checked in', team(el.dataset.t).name + ' ' + m.id); done('Checked in ✅'); break; }
    case 'sample': if (confirm('Replace ALL tournament data with 252 sample teams + 6 Wild Cards?')) { (Cloud.on ? Cloud.reset() : Promise.resolve()).then(() => { const keep = S.settings; loadSample(); if (Cloud.on) { S.settings = keep; save(); } toast('Sample data loaded'); render(); }, err => toast(err.message)); } break;
    case 'reset': if (confirm('Delete ALL teams, stages and results and start empty?')) { (Cloud.on ? Cloud.reset() : Promise.resolve()).then(() => { const keep = S.settings; S = fresh(); if (Cloud.on) S.settings = keep; session.teamCode = null; done('Reset'); }, err => toast(err.message)); } break;
    case 'approve': { const t = team(el.dataset.id); if (t.status === 'rejected' && t.entry === 'SLOT') { if (usedSlots() >= S.settings.slots) { toast('No free slot'); return; } t.slotNo = freeSlotNo(); } t.status = 'approved'; t.reason = ''; notify(t.id, 'approved', '', approvedText(t)); log('Team approved', t.code + ' ' + t.name); done(); break; }
    case 'reject': { const t = team(el.dataset.id); const why = prompt('Reason for rejecting ' + t.name + '?', 'Duplicate player'); if (why === null) return; t.status = 'rejected'; t.reason = why; t.slotNo = null; log('Team rejected', t.code + ' — ' + why); promoteWaitlist(); done(); break; }
    case 'approveAll': { const n = slotTeams().filter(t => t.status === 'pending').map(t => { t.status = 'approved'; notify(t.id, 'approved', '', approvedText(t)); }).length; log('Bulk approve', n + ' teams'); done(n + ' approved'); break; }
    case 'export': {
      const head = ['Team ID', 'Slot', 'Status', 'Entry', 'Team name', ...[1, 2, 3, 4].flatMap(i => ['P' + i + ' In Game Name', 'P' + i + ' Mobile', 'P' + i + ' Email', 'P' + i + ' UID'])];
      const rows = S.teams.map(t => [t.code, t.slotNo || '', t.status, t.entry, t.name, ...t.players.flatMap(p => [p.name, p.mobile, p.email, p.uid])]);
      // A leading = + - @ would run as a formula in Excel or Sheets; prefix it with ' so it stays text.
      const cell = x => { let v = String(x ?? ''); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
      const csv = [head, ...rows].map(r => r.map(cell).join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'teams.csv'; a.click(); break;
    }
    case 'wcRevoke': { const inv = S.wcInvites.find(i => i.token === el.dataset.token); if (!confirm('Cancel this invite link? It will stop working.')) break; inv.status = 'revoked'; log('Wild Card invite cancelled', inv.note || inv.token.slice(0, 6)); done('Invite cancelled'); break; }
    case 'removeWc': S.teams = S.teams.filter(t => t.id !== el.dataset.id); log('Wild Card removed', el.dataset.id); done(); break;
    case 'gen1': {
      const ids = slotTeams().filter(t => t.status === 'approved').sort((a, b) => a.slotNo - b.slotNo).map(t => t.id);
      const stage = buildStage(0, ids, el.dataset.mode); S.stages.push(stage); S.settings.regOpen = false;
      log('Stage 1 generated', ids.length + ' teams, ' + stage.groups.length + ' groups (' + el.dataset.mode + ')'); done(stage.groups.length + ' groups created'); break;
    }
    case 'autoWc': {
      st.wcTray.slice().forEach(id => { const g = st.groups.reduce((a, b) => b.teamIds.length < a.teamIds.length ? b : a); if (g.teamIds.length < 12) { g.teamIds.push(id); st.wcTray = st.wcTray.filter(x => x !== id); log('Wild Card placed', team(id).name + ' → Group ' + GL(g.label)); } });
      done('Wild Cards placed'); break;
    }
    case 'publish': {
      if (st.groups.some(g => g.teamIds.length > 12)) { toast('A group has more than 12 teams'); return; }
      makeMatches(st); st.status = 'published';
      st.groups.forEach(g => g.teamIds.forEach((id, i) => notify(id, 'group', st.index, `${S.settings.name} · ${st.name}: you are in ${st.final ? 'the Grand Final' : 'Group ' + GL(g.label)}, Slot ${i + 1}. First match ${matchDate(st, g.matches[0])}, ${g.matches[0].time} (${g.matches[0].map}). Check in on My Team before each match.`)));
      log(st.name + ' published', st.groups.length + ' groups'); done(st.name + ' published'); break;
    }
    case 'simulate': {
      st.groups.forEach(g => g.matches.forEach(m => { if (m.resultStatus !== 'approved') { m.checkins = g.teamIds.slice(); m.results = randomResults(g.teamIds); m.status = 'completed'; m.screenshots = ['simulated.png']; m.resultStatus = 'approved'; } }));
      log('Results simulated', st.name); done('All results simulated and approved'); break;
    }
    case 'qualify': {
      st.qualified = st.final ? [] : qualifiersOf(st); st.status = 'done';
      st.groups.forEach(g => rowsOf(g).forEach(r => notify(r.teamId, 'result', st.index,
        st.final ? `${S.settings.name} Grand Final: you finished #${r.rank} with ${r.points} points.${r.rank === 1 ? ' 🏆 Champions!' : ''}`
          : st.qualified.includes(r.teamId) ? `${S.settings.name} · ${st.name}: QUALIFIED ✅ (rank #${r.rank} in Group ${GL(g.label)}, ${r.points} pts). Next stage groups coming soon.`
          : `${S.settings.name} · ${st.name}: eliminated (rank #${r.rank} in Group ${GL(g.label)}, ${r.points} pts). Thanks for playing!`)));
      log(st.final ? 'Tournament finished' : st.name + ' qualifiers approved', st.final ? '' : st.qualified.length + ' teams'); done(st.final ? '🏆 Tournament finished' : st.qualified.length + ' teams qualified'); break;
    }
    case 'genNext': {
      const stage = buildStage(st.index + 1, st.qualified, 'seeded'); S.stages.push(stage);
      log(stage.name + ' generated', stage.entering + ' teams' + (stage.wcJoin ? ' incl. ' + stage.wcJoin + ' Wild Cards' : '')); done(stage.name + ' created'); break;
    }
    case 'approveResult': { const { m } = findMatch(el.dataset.m); m.resultStatus = 'approved'; log('Result approved', m.id); done('Approved'); break; }
    case 'returnResult': { const { m } = findMatch(el.dataset.m); m.resultStatus = 'none'; m.results = null; log('Result sent back', m.id); done('Sent back'); break; }
    case 'approveAllResults': { S.stages.forEach(s => s.groups.forEach(g => g.matches.forEach(m => { if (m.resultStatus === 'submitted') m.resultStatus = 'approved'; }))); log('Bulk result approve', ''); done('All approved'); break; }
    case 'openFix': openFix = openFix === el.dataset.k ? null : el.dataset.k; render(); break;
    case 'viewShot': { const box = document.createElement('div'); box.className = 'lightbox'; box.innerHTML = '<img alt="Screenshot">'; box.firstChild.src = el.src; box.addEventListener('click', () => box.remove()); document.body.appendChild(box); break; }
    case 'resolve': { const c = S.complaints[el.dataset.i]; const ans = prompt('Reply to the team:', el.dataset.v === 'kept' ? 'Result checked, no change.' : 'Result corrected.'); if (ans === null) return; c.status = el.dataset.v; c.answer = ans; log('Complaint ' + c.status, c.matchLabel); done(); break; }
    case 'mstatus': { const { m } = findMatch(el.dataset.m); m.status = el.dataset.s; log('Match ' + el.dataset.s, m.id); done(); break; }
    case 'checkinAll': { const { g, m } = findMatch(el.dataset.m); m.checkins = g.teamIds.slice(); done('All teams checked in'); break; }
    case 'randomFill': {
      const { g } = findMatch(el.dataset.m); const f = el.closest('form'); const r = randomResults(g.teamIds);
      g.teamIds.forEach(id => { f['place_' + id].value = String(r[id].place); f['kills_' + id].value = r[id].kills; f['ns_' + id].checked = false; });
      f.dataset.demo = '1'; break;
    }
  }
});
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
if (Cloud.on) {
  app.innerHTML = '<p class="muted">Loading…</p>';
  Cloud.init().then(r => { session.role = r; save(); render(); }, err => { app.innerHTML = `<div class="errors">Could not connect to the database: ${esc(err.message)}</div>`; });
} else render();
