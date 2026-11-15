// Screenshot results: the admin uploads the two Free Fire result screenshots of a match, the OCR service reads them,
// the admin checks every team and player, then publishes. Publishing writes the normal match result (place + kills per
// team) plus each player's eliminations, so the team Leaderboard, the Players leaderboard and match pages update.
// Loaded before app.js; it uses app.js helpers (S, E, team, findMatch, save, log, render, toast …) at run time only.
const OCR_URL = ((window.SQUAD_CONFIG || {}).ocrUrl || '').replace(/\/$/, '');
let ocr = null;   // { matchId, shots: [{ file, url }|null, …], status, msg, blocks, secs }

function ocrState(matchId) {
  if (!ocr || ocr.matchId !== matchId) ocr = { matchId, shots: [null, null], read: [], status: 'idle', msg: '', blocks: null, pop: null };
  return ocr;
}
const nfc = s => (s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
// The 12 teams of the match's group with their registered players (UID is the identity, slot is its place in the team).
function ocrRoster(g) {
  return g.teamIds.map(id => { const t = team(id); return { id, name: t.name, players: t.players.map((p, slot) => ({ uid: p.uid, name: p.name, slot })) }; });
}
// Link the names on screen to registered In Game Names (owner's rule, 14 Nov 2026): within the team's own 4 players,
// a name links on its own when it is the same text, the same after look-alike folding (ᑌ → U, ᴍ → M, ¹ → 1 …) or the
// same once the team's clan tag / an end decoration is set aside (E.matchName). The table then shows the registered
// name exactly, special characters and all. Anything else is only a suggestion until the admin ticks Verified.
const LINKED = new Set(['exact', 'lookalike', 'tag']);
// Every registered team in the tournament (not only this match), for cross-checking names.
function ocrAllTeams() {
  return S.teams.filter(t => t.status !== 'rejected').map(t => ({ id: t.id, name: t.name, players: t.players.map((p, slot) => ({ uid: p.uid, name: p.name, slot })) }));
}
const readsOf = p => [p.ocr, ...(p.alts || [])];
// Link a rank's players to a team's registered players using the whole team at once (each registered player once).
function linkTeamPlayers(b, t) {
  const r = t ? E.teamMatch(b.players.map(readsOf), t.players) : null;
  b.players.forEach((p, j) => {
    Object.assign(p, { uid: null, exact: false, how: null, suggested: false });
    const pr = r && r.pairs[j];
    if (pr && pr.linked) Object.assign(p, { uid: pr.uid, exact: true, how: pr.how });
    else if (pr && pr.r >= 0.6) Object.assign(p, { uid: pr.uid, suggested: true });
  });
  return r;
}
// Find each rank's team by cross-checking ALL its players against the registered players of the match's teams
// (E.assignTeams: best rank–team pairs first, each team once). Then check every name against every registration in the
// tournament, so a name registered in more than one team, or only in another team, is shown.
function ocrLink(blocks, roster) {
  const all = ocrAllTeams(), inMatch = new Set(roster.map(t => t.id));
  const res = E.assignTeams(blocks.map(b => b.players.map(readsOf)), roster);
  blocks.forEach((b, i) => {
    b.auto = res[i]; b.teamId = res[i].teamId || ''; b.outside = null;
    linkTeamPlayers(b, roster.find(x => x.id === b.teamId));
    // not sure inside this match: do these players belong to a team that is not in this match?
    if (!b.auto.sure) {
      const o = E.assignTeams([b.players.map(readsOf)], all.filter(t => !inMatch.has(t.id)))[0];
      if (o.teamId && o.linked >= 2 && o.linked > b.auto.linked) b.outside = { teamId: o.teamId, name: all.find(t => t.id === o.teamId).name, linked: o.linked };
    }
    b.players.forEach(p => {
      p.alsoIn = E.nameMatches(readsOf(p), all).filter(x => x.teamId !== b.teamId).map(x => ({ ...x, inMatch: inMatch.has(x.teamId) }));
      // close names elsewhere in the match, shown when nothing in the chosen team fits
      p.cands = p.exact ? [] : roster.flatMap(x => x.players.map(y => ({ ...y, teamId: x.id, r: E.editRatio(E.plainName(p.ocr), E.plainName(y.name)) })))
        .filter(x => x.r >= 0.45).sort((x, y) => y.r - x.r).slice(0, 3);
    });
  });
}
// Linked to a registered player and the eliminations are clear: nothing for the admin to check on this row.
const ocrSure = p => !p.sub && p.exact && !p.killsChecked && Number.isInteger(p.kills);
const HOW_LABEL = { exact: 'Exact', lookalike: 'Look-alike', tag: 'Matched' };
// How the rank's team was found (shown under the team box).
function teamBadge(b) {
  const a = b.auto, linked = b.players.filter(p => p.exact).length, n = b.players.length;
  const out = b.outside ? `<div class="notice small" style="margin:4px 0;padding:4px 6px">These players are registered for <b>${esc(b.outside.name)}</b> (${b.outside.linked} of ${n}), which is not in this match. Check the match chosen above.</div>` : '';
  if (!b.teamId) return out + '<span class="badge b-bad">Team not found · choose it</span>';
  if (a && a.manual) return out + `<span class="badge">Chosen by admin · ${linked}/${n} players match</span>`;
  if (a && a.sure && a.teamId === b.teamId) return out + `<span class="badge b-ok" title="All players cross-checked with the registrations">Found from players · ${linked}/${n}</span>`;
  return out + `<span class="badge b-warn" title="Few players match, or another team is close">Check team · ${linked}/${n} players match${a && a.second && a.second.linked ? ' · ' + esc(team(a.second.teamId)?.name || '') + ' also close' : ''}</span>`;
}
// Every In Game Name on the tournament list (all registered teams, not only this group), so a player who applied with
// another team is caught even when the OCR read their name perfectly.
function ocrRegistry() {
  const fm = findMatch(ocr.matchId), inMatch = new Set(fm ? fm.g.teamIds : []), reg = {};
  S.teams.filter(t => t.status !== 'rejected').forEach(t => t.players.forEach((p, slot) => { if (!p.name) return; const v = { teamId: t.id, teamName: t.name, uid: p.uid, name: p.name, slot, inMatch: inMatch.has(t.id) };
    reg[nfc(p.name)] = v; const k = '~' + E.plainName(p.name); if (k.length > 4) reg[k] = reg[k] && reg[k].teamId !== t.id ? { ...v, teamName: reg[k].teamName + ' / ' + t.name } : v; }));
  return reg;
}
// How one screenshot row compares with the tournament list. cls: ok | warn | bad
// A name that isn't linked in its own team but links to a player of another registered team with the same matcher used
// inside a team (look-alike letters, clan tag or a decoration dropped), e.g. "G_SHADOW" for KG_SHADOW or "SD JACK" for
// ᑌD ᴊᴀᴄᴋ ☣. A warning only: the screenshot may be cut off or misread, so the admin decides. Worked out once per row.
function looksElsewhere(b, p) {
  const key = b.teamId + '|' + readsOf(p).join('|');
  if (p._looksKey !== key) {
    const fm = findMatch(ocr.matchId), inMatch = new Set(fm ? fm.g.teamIds : []);
    p._looksKey = key;
    p._looks = ocrAllTeams().filter(t => t.id !== b.teamId).map(t => ({ t, m: E.matchReadings(readsOf(p), t.players) }))
      .filter(x => x.m.how && x.m.how !== 'suggest').slice(0, 3)
      .map(x => ({ teamName: x.t.name, player: x.m.player.name, inMatch: inMatch.has(x.t.id) }));
  }
  return p._looks;
}
function regCheck(b, p, t, reg) {
  const key = p.sub ? p.name : p.ocr, also = (p.alsoIn || []).filter(x => x.teamId !== b.teamId);
  const where = list => list.map(x => `<b>${esc(x.teamName)}</b>${x.inMatch ? '' : ' (not in this match)'}`).join(', ');
  // not linked in its own team but the name belongs to another team's registered player: a real problem
  if (!p.exact && also.length && (p.sub || !t || !t.players.some(x => x.uid === p.uid)))
    return { cls: 'bad', other: also.map(x => x.teamName).join(' / '), html: `Registered for ${where(also)}` };
  const seen = !also.length && (reg[nfc(key)] || (!p.exact && reg['~' + E.plainName(key)]));
  if (seen && seen.teamId !== b.teamId && (p.sub || !t || !t.players.some(x => x.uid === p.uid && nfc(x.name) === nfc(p.ocr))))
    return { cls: 'bad', other: seen.teamName, html: `Registered for <b>${esc(seen.teamName)}</b>${seen.inMatch ? '' : ' (not in this match)'}` };
  if (!t) return { cls: 'warn', html: 'Choose the team first' };
  const rp = p.sub ? null : t.players.find(x => x.uid === p.uid);
  const look = rp ? [] : looksElsewhere(b, p);
  const lookHtml = look.length ? `<br><b style="color:var(--red,#ef5350)">Looks like ${look.map(x => `${esc(x.player)}, registered for ${esc(x.teamName)}${x.inMatch ? '' : ' (not in this match)'}`).join(' · ')}.</b> <span class="muted">Check before choosing a player.</span>` : '';
  if (p.sub) return { cls: 'warn', look: look.length > 0, html: 'Not on the tournament list · substitute' + lookHtml };
  if (!rp) return { cls: 'warn', look: look.length > 0, html: 'Not linked to a registered player yet' + lookHtml };
  const same = p.exact || nfc(rp.name) === nfc(p.ocr);
  const alsoNote = also.length ? `<br><span class="muted">Same name also registered in ${where(also)} · matched here by teammates</span>` : '';
  return { cls: same ? 'ok' : 'warn', html: `✓ On ${esc(t.name)}'s list · slot ${rp.slot + 1}<br><span class="muted">UID ${esc(rp.uid || '—')}</span>${alsoNote}${p.how === 'lookalike' ? '<br><span class="muted">Same name in plain letters</span>' : p.how === 'tag' ? '<br><span class="muted">Same name; tag or decoration not read</span>' : same ? '' : '<br><span class="muted">Name on screen differs from registration</span>'}` };
}
function ocrCheck(roster) {
  const byId = Object.fromEntries(roster.map(t => [t.id, t])), reg = ocrRegistry();
  return E.validateOcrResult(ocr.blocks.map(b => ({
    rank: b.rank, teamId: b.teamId, shortOk: b.shortOk,
    players: b.players.map(p => ({ uid: p.sub ? null : p.uid, sub: p.sub, name: p.sub ? p.name : (byId[b.teamId]?.players.find(x => x.uid === p.uid)?.name || ''),
      kills: Number.isInteger(p.kills) ? p.kills : NaN, exact: !p.sub && p.exact, killsCheck: !!p.killsChecked, ok: p.ok, read: p.ocr,
      otherTeam: byId[b.teamId] ? regCheck(b, p, byId[b.teamId], reg).other : undefined })) })), roster);
}

// ---------- screen ----------
function viewOcr() {
  const pr = params();
  // ClashSquad games have no Battle Royale result screen: they are entered by hand in the Room panel.
  const list = S.stages.filter(s => s.status !== 'draft' && s.kind !== 'cs').flatMap(st => st.groups.flatMap(g => g.matches.map(m => ({ st, g, m }))));
  const open = list.filter(x => x.m.resultStatus !== 'approved');
  const sel = list.find(x => x.m.id === pr.m) || open[0];
  const head = `<h1>Upload screenshots</h1><p class="sub">Upload the Free Fire result screen of a match. The service reads every team, player and elimination; you check them, then publish to the Leaderboard.</p>`;
  if (!sel) return head + '<p class="muted">No published stage with matches yet.</p>';
  const { st, g, m } = sel, o = ocrState(m.id), roster = ocrRoster(g);
  const label = x => `${x.st.name} · ${gName(x.st, x.g, 1)} · M${x.m.no}${x.m.resultStatus === 'approved' ? ' (published)' : x.m.resultStatus === 'submitted' ? ' (waiting)' : ''}`;
  const picker = `<label class="inl">Match <select data-act="ocrMatch">${[...new Set([sel, ...open])].map(x => `<option value="${x.m.id}" ${x === sel ? 'selected' : ''}>${esc(label(x))}</option>`).join('')}</select></label>`;
  const slot = i => { const s = o.shots[i]; return `<label class="ocr-slot${s ? ' has' : ''}">
      ${s ? `<img src="${s.url}" alt="Screenshot ${i + 1} preview">` : `<span class="ocr-ph">＋</span>`}
      <span class="ocr-cap"><b>Screenshot ${i + 1}</b> ${i ? '(optional) · scrolled to the bottom of the list' : '· top of the list'}${s ? ' · ' + esc(s.file.name) : ''}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" data-act="ocrShot" data-slot="${i}" hidden></label>`; };
  const busy = o.status === 'busy';
  const status = { idle: '', busy: '<span class="spin"></span> Reading screenshots… this takes about 20–40 seconds.', done: `Read ${o.blocks?.length || 0} teams in ${o.secs}s. Check the rows marked in yellow.`, error: esc(o.msg) }[o.status];
  return `${head}
  ${OCR_URL ? '' : `<div class="notice" style="margin-bottom:12px"><b>OCR service not connected.</b> Start it (see <code>ocr-service/README.md</code>) and add <code>ocrUrl</code> to <code>config.js</code>.</div>`}
  <div class="card"><div class="row between">${picker}<span class="small muted">${esc(m.map)} · ${g.teamIds.length} teams in this ${st.final ? 'final' : 'group'}</span></div>
    ${m.resultStatus === 'approved' ? '<div class="notice" style="margin-top:10px">This match already has a published result. Publishing again replaces it.</div>' : ''}
    <div class="ocr-slots">${slot(0)}${slot(1)}</div>
    <div class="row">${o.blocks && o.shots.some((x, i) => x && !o.read.includes(i))
      ? `<button class="btn" data-act="ocrAdd" ${busy || !OCR_URL ? 'disabled' : ''}>${busy ? 'Processing…' : 'Add screenshot ' + o.shots.map((x, i) => x && !o.read.includes(i) ? i + 1 : 0).filter(Boolean).join(' + ') + ' to the table'}</button><button class="btn ghost small" data-act="ocrRun" data-again="1" ${busy || !OCR_URL ? 'disabled' : ''}>Read again from scratch</button>`
      : `<button class="btn" data-act="ocrRun" ${!o.shots.some(Boolean) || busy || !OCR_URL ? 'disabled' : ''}>${busy ? 'Processing…' : o.blocks ? 'Read again from scratch' : 'Process results'}</button>`}
      ${o.shots[0] || o.shots[1] || o.blocks ? '<button class="btn ghost small" data-act="ocrClear">Clear</button>' : ''}
      <span class="small ${o.status === 'error' ? 'bad' : 'muted'}">${status}</span></div>
  </div>
  ${o.blocks && o.added ? `<div class="notice" style="margin-top:10px">Screenshot ${o.added.shot}: ${o.added.added.length ? `added rank${o.added.added.length > 1 ? 's' : ''} ${o.added.added.join(', ')}` : 'no new teams'}${o.added.skipped ? ` · ${o.added.skipped} already in the table, left as they are` : ''}.</div>` : ''}
  ${o.blocks ? (() => { const mi = ocrMissing(roster); return mi.any ? `<div class="card ocr-missing"><h3>Missing from the screenshot${o.read.length > 1 ? 's' : ''} · ${mi.read} of ${mi.expected} teams read</h3>${missingHtml(mi)}</div>` : ''; })() : ''}
  ${o.blocks ? ocrReview(roster) : ''}
  ${o.pop && o.pop.any ? `<div class="ocr-pop" role="dialog" aria-modal="true" aria-label="Missing from the screenshot"><div class="card"><h3>Check: something is missing</h3><p>Every match has ${o.pop.expected} teams. The screenshot${o.read.length > 1 ? 's' : ''} showed ${o.pop.read}.</p>${missingHtml(o.pop)}<div class="row"><button class="btn" data-act="ocrPopOk">OK, I'll check</button></div></div></div>` : ''}`;
}

function ocrReview(roster) {
  const v = ocrCheck(roster), byId = Object.fromEntries(roster.map(t => [t.id, t])), reg = ocrRegistry();
  const ids = {}; ocr.blocks.forEach(b => b.players.forEach(p => { const k = p.sub ? 'sub:' + nfc(p.name) : p.uid; if (k && k !== 'sub:') ids[k] = (ids[k] || 0) + 1; }));
  const used = new Set(ocr.blocks.map(b => b.teamId).filter(Boolean));
  const players = ocr.blocks.reduce((a, b) => a + b.players.length, 0);
  const sorted = ocr.blocks.map((b, i) => ({ b, i })).sort((x, y) => (x.b.rank || 99) - (y.b.rank || 99));
  const tally = { ok: 0, warn: 0, bad: 0, sub: 0, look: 0 };
  const groups = sorted.map(({ b, i }) => {
    const t = byId[b.teamId], n = Math.max(b.players.length, 1);
    const k = b.players.reduce((a, p) => a + (Number.isInteger(p.kills) ? p.kills : 0), 0), pp = b.rank ? (E.PLACEMENT_POINTS[b.rank - 1] || 0) : 0;
    const rankCell = `<td class="ocr-tcell" rowspan="${n}"><input class="ocr-rank" type="number" min="1" max="${roster.length}" data-act="ocrF" data-b="${i}" data-k="rank" value="${b.rank || ''}" aria-label="Rank"></td>`;
    const teamCell = `<td class="ocr-tcell" rowspan="${n}"><select data-act="ocrF" data-b="${i}" data-k="team" aria-label="Team"><option value="">Choose team…</option>${roster.map(x => `<option value="${x.id}" ${x.id === b.teamId ? 'selected' : ''}>${esc(x.name)}${used.has(x.id) && x.id !== b.teamId ? ' (used)' : ''}</option>`).join('')}</select>
      ${teamBadge(b)}
      <div class="small muted">${b.players.length}/4 players · screenshot ${b.shot || '–'}${b.partial ? ' · cut off' : ''}</div>
      ${b.players.length < 4 ? `<label class="inl chk small"><input type="checkbox" data-act="ocrF" data-b="${i}" data-k="short" ${b.shortOk ? 'checked' : ''}> Fewer than 4 confirmed</label><br><a href="#" class="small" data-act="ocrAddP" data-b="${i}">+ Add player</a> · ` : ''}<a href="#" class="small" data-act="ocrDelB" data-b="${i}">Remove team</a></td>`;
    const totCells = `<td class="ocr-tcell num" rowspan="${n}"><b>${k}</b></td><td class="ocr-tcell num" rowspan="${n}">${pp}</td><td class="ocr-tcell num" rowspan="${n}"><b>${pp + k * E.POINTS_PER_KILL}</b></td>`;
    if (!b.players.length) return `<tbody class="ocr-grp"><tr>${rankCell}${teamCell}<td colspan="6" class="muted small">No players read for this team.</td>${totCells}</tr></tbody>`;
    const rows = b.players.map((p, j) => {
      const dup = (p.sub ? ids['sub:' + nfc(p.name)] : ids[p.uid]) > 1, sure = ocrSure(p), rc = regCheck(b, p, t, reg);
      tally[rc.cls]++; if (p.sub) tally.sub++; if (rc.look) tally.look++;
      const opts = (t ? t.players : []).map(x => `<option value="${esc(x.uid)}" ${!p.sub && p.uid === x.uid ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
      const conf = Math.round((p.conf || 0) * 100);
      return `<tr class="${dup || rc.cls === 'bad' ? 'dup' : !sure && !p.ok ? 'warn' : ''}">${j ? '' : rankCell + teamCell}
        <td>${p.crop ? `<img class="ocr-crop" src="${p.crop}" alt="Name as shown on the screenshot">` : ''}<span class="ocr-read">${esc(p.ocr || '—')}</span>
          <div><span class="badge ${conf >= 85 ? 'b-ok' : conf >= 60 ? 'b-warn' : 'b-bad'}">${conf}%</span>${p.exact ? ` <span class="badge b-ok" title="Linked automatically to the team's registered player">${HOW_LABEL[p.how] || 'Exact'}</span>` : p.suggested && !p.sub ? ' <span class="badge b-warn">Suggested</span>' : ''}${dup ? ' <span class="badge b-bad">Duplicate</span>' : ''}</div></td>
        <td><select data-act="ocrF" data-b="${i}" data-p="${j}" data-k="who" ${t ? '' : 'disabled'} aria-label="Registered player"><option value="">${t ? 'Choose player…' : 'Choose the team first'}</option>${opts}<option value="sub" ${p.sub ? 'selected' : ''}>Substitute (not registered)</option></select>
          ${!p.sub && p.uid && t ? `<div class="ocr-exact" title="Registered In Game Name, exactly as entered">${esc(byUid(b, p.uid))}</div>` : ''}
          ${p.sub ? `<input class="ocr-sub" data-act="ocrF" data-b="${i}" data-p="${j}" data-k="name" value="${esc(p.name)}" placeholder="In Game Name">` : ''}
          ${!p.exact && p.cands?.length ? `<div class="small muted">Close to: ${p.cands.map(c => esc(c.name) + ' (' + esc(byId[c.teamId].name) + ')').join(', ')}</div>` : ''}</td>
        <td class="ocr-reg ${rc.cls} small">${rc.html}</td>
        <td>${p.killsCrop ? `<img class="ocr-crop k" src="${p.killsCrop}" alt="Eliminations as shown">` : ''}<input class="ocr-k" type="number" min="0" max="99" data-act="ocrF" data-b="${i}" data-p="${j}" data-k="kills" value="${Number.isInteger(p.kills) ? p.kills : ''}" aria-label="Eliminations">${p.killsChecked ? '<br><span class="badge b-warn">Re-read</span>' : ''}</td>
        <td>${sure ? '<span class="badge b-ok">OK</span>' : `<label class="inl chk"><input type="checkbox" data-act="ocrF" data-b="${i}" data-p="${j}" data-k="ok" ${p.ok ? 'checked' : ''}> Verified</label>`}</td>
        <td><button class="btn ghost small" data-act="ocrDelP" data-b="${i}" data-p="${j}" title="Remove this row">×</button></td>
        ${j ? '' : totCells}</tr>`;
    }).join('');
    return `<tbody class="ocr-grp">${rows}</tbody>`;
  }).join('');
  const noShows = roster.filter(t => !used.has(t.id));
  const table = `<div class="card"><div class="row between"><h3>Match result: teams and players</h3><span class="small muted">${ocr.blocks.length} teams · ${players} player records</span></div>
    <p class="small ocr-tally">Tournament list check: <span class="good">${tally.ok} match their team's registration</span> · ${tally.warn} to check${tally.sub ? ` (${tally.sub} substitute${tally.sub > 1 ? 's' : ''})` : ''}${tally.bad ? ` · <span class="bad">${tally.bad} registered for another team</span>` : ''}${tally.look ? ` · <span class="bad">${tally.look} look like another team's player</span>` : ''}</p>
    <div class="tw"><table class="ocr-table"><thead><tr><th>Rank</th><th>Team</th><th>Name on screen</th><th>Registered player</th><th>Tournament list</th><th>Elims</th><th>Check</th><th></th><th>Team elims</th><th>Pos pts</th><th>Total</th></tr></thead>
    ${groups}
    ${noShows.length ? `<tbody class="ocr-grp">${noShows.map(t => `<tr class="muted"><td class="rk">–</td><td>${esc(t.name)}</td><td colspan="9">Not on the screenshots: no-show</td></tr>`).join('')}</tbody>` : ''}
    </table></div>
    <button class="btn ghost small" data-act="ocrAddB" style="margin-top:10px">+ Add a team the OCR missed</button></div>`;
  const checks = `<div class="card ocr-check ${v.errors.length ? 'bad' : 'ok'}">
    <div class="row between"><h3>${v.errors.length ? v.errors.length + ' thing' + (v.errors.length > 1 ? 's' : '') + ' to fix before publishing' : 'Ready to publish'}</h3>
      <span class="small muted">${ocr.blocks.length} teams · ${players} player records</span></div>
    ${v.errors.length ? `<ul class="small">${v.errors.slice(0, 12).map(e => `<li>${esc(e)}</li>`).join('')}${v.errors.length > 12 ? `<li>…and ${v.errors.length - 12} more</li>` : ''}</ul>` : ''}
    ${v.warnings.map(w => `<p class="small muted">⚠ ${esc(w)}</p>`).join('')}
    <div class="row"><button class="btn green" data-act="ocrPublish" ${v.errors.length ? 'disabled' : ''}>Publish results</button><span class="small muted">Updates the team Leaderboard, Players leaderboard and match page.</span></div></div>`;
  return `${checks}${table}${checks}`;
}

// ---------- actions ----------
async function ocrRun(addOnly) {
  const o = ocr; if (!o || !o.shots.some(Boolean)) return;
  // Add mode: read only the screenshots not yet in the table and keep every row already there (with the admin's edits).
  const slots = o.shots.map((s, i) => s && (!addOnly || !o.read.includes(i)) ? i : -1).filter(i => i >= 0);
  if (!slots.length) return;
  o.status = 'busy'; o.msg = ''; render();
  try {
    const fd = new FormData();
    slots.forEach((i, k) => fd.append('shot' + (k + 1), o.shots[i].file, o.shots[i].file.name));
    const headers = {}, token = Cloud.on ? await Cloud.accessToken() : null;
    if (token) headers.Authorization = 'Bearer ' + token;
    const r = await fetch(OCR_URL + '/extract', { method: 'POST', body: fd, headers });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.detail || 'OCR service error ' + r.status);
    const fresh = j.teams.map(t => ({ rank: t.rank, shot: slots[(t.shot || 1) - 1] + 1, partial: t.partial, teamId: '', shortOk: false,
      players: t.players.map(p => ({ ocr: p.name, alts: p.alts || [], conf: p.conf, crop: p.crop, kills: p.kills, killsCrop: p.kills_crop, killsChecked: p.kills_checked, uid: null, exact: false, ok: false, sub: false, name: '' })) }));
    const fm = findMatch(o.matchId), roster = ocrRoster(fm.g);
    ocrLink(fresh, roster);
    if (addOnly && o.blocks) {
      // the scrolled screenshot overlaps the first one: a rank or a team already in the table is not taken again
      const ranks = new Set(o.blocks.map(b => b.rank)), teams = new Set(o.blocks.map(b => b.teamId).filter(Boolean));
      const add = fresh.filter(b => !ranks.has(b.rank) && !(b.teamId && teams.has(b.teamId)));
      // a team the admin already has in the table can't be guessed again for a new rank
      add.forEach(b => { if (b.teamId && teams.has(b.teamId)) b.teamId = ''; teams.add(b.teamId); });
      o.blocks = o.blocks.concat(add);
      o.added = { shot: slots.map(i => i + 1).join(' + '), added: add.map(b => b.rank).sort((x, y) => x - y), skipped: fresh.length - add.length };
    } else { o.blocks = fresh; o.added = null; }
    o.read = [...new Set([...(addOnly ? o.read : []), ...slots])];
    o.status = 'done'; o.secs = j.seconds;
    o.pop = ocrMissing(roster);   // pop-up: teams or players missing from the screenshots
  } catch (err) {
    o.status = 'error'; o.msg = /fetch/i.test(err.message) ? 'Could not reach the OCR service at ' + OCR_URL + '. Is it running?' : err.message;
  }
  if (ocr === o) render();
}
// What the screenshots don't show: teams of the match not in the table, and teams showing fewer than 4 players
// (with the registered players that are not on the screen).
function ocrMissing(roster) {
  const used = new Set(ocr.blocks.map(b => b.teamId).filter(Boolean));
  const teams = roster.filter(t => !used.has(t.id));
  const short = ocr.blocks.filter(b => b.players.length < 4).sort((a, b) => a.rank - b.rank).map(b => {
    const t = roster.find(x => x.id === b.teamId), shownUids = new Set(b.players.map(p => p.uid).filter(Boolean));
    return { rank: b.rank, team: t ? t.name : '', shown: b.players.length, missing: t ? t.players.filter(x => !shownUids.has(x.uid)).map(x => x.name) : [] };
  });
  return { expected: roster.length, read: ocr.blocks.length, teams: teams.map(t => t.name), short, any: teams.length > 0 || short.length > 0 };
}
function missingHtml(mi) {
  return `${mi.teams.length ? `<p><b>${mi.teams.length} of ${mi.expected} teams are not on the screenshot${ocr.read.length > 1 ? 's' : ''}:</b> ${mi.teams.map(esc).join(', ')}. They will be marked no-show unless you add them.</p>` : ''}
    ${mi.short.length ? `<p><b>Teams with missing players:</b></p><ul>${mi.short.map(x => `<li>Rank ${x.rank}${x.team ? ' · ' + esc(x.team) : ''}: ${x.shown} of 4 players shown${x.missing.length ? ` · missing <b>${x.missing.map(esc).join(', ')}</b>` : ''}</li>`).join('')}</ul>` : ''}
    ${!ocr.shots[1] || !ocr.read.includes(1) ? '<p class="small muted">Tip: upload Screenshot 2 (the list scrolled to the bottom) to read the rest. Teams already in the table are kept as they are.</p>' : '<p class="small muted">Add the missing players with “+ Add player”, or tick “Fewer than 4 confirmed”.</p>'}`;
}
function ocrPublish() {
  const fm = findMatch(ocr.matchId); if (!fm) return;
  const { st, g, m } = fm, roster = ocrRoster(g), v = ocrCheck(roster);
  if (v.errors.length) { toast('Fix the listed problems first'); return; }
  const byId = Object.fromEntries(roster.map(t => [t.id, t])), res = {};
  ocr.blocks.forEach(b => {
    const t = byId[b.teamId];
    const players = b.players.map(p => p.sub
      ? { sub: true, name: nfc(p.name), kills: p.kills, ocr: p.ocr, conf: p.conf }
      : (rp => ({ slot: rp.slot, name: rp.name, kills: p.kills, ocr: p.ocr, conf: p.conf, match: p.how || 'manual', verified: !ocrSure(p) }))(t.players.find(x => x.uid === p.uid)));
    res[b.teamId] = { place: b.rank, kills: players.reduce((a, p) => a + p.kills, 0), players };
  });
  roster.forEach(t => { if (!res[t.id]) res[t.id] = { noShow: true, place: null, kills: 0 }; });
  const again = m.resultStatus === 'approved';
  Object.assign(m, { results: res, status: 'completed', resultStatus: 'approved', screenshots: ocr.shots.filter(Boolean).map(s => s.file.name), source: 'ocr' });
  log(again ? 'Results republished from screenshots' : 'Results published from screenshots', `${st.name} ${gName(st, g, 1)} M${m.no}`);
  save(); ocr = null; toast('Results published: Leaderboard updated');
  location.hash = '#/admin?mr=' + encodeURIComponent(m.id);
}

document.addEventListener('change', e => {
  const el = e.target, act = el.dataset.act;
  if (act === 'ocrMatch') { location.hash = '#/admin/ocr?m=' + encodeURIComponent(el.value); return; }
  if (act === 'ocrShot') {
    const f = el.files[0]; if (!f || !ocr) return;
    if (!/^image\/(png|jpeg|webp)$/.test(f.type)) { toast('Use a PNG, JPG or WEBP screenshot'); return; }
    if (f.size > 10 * 1024 * 1024) { toast('Screenshot must be under 10 MB'); return; }
    const old = ocr.shots[+el.dataset.slot]; if (old) URL.revokeObjectURL(old.url);
    ocr.shots[+el.dataset.slot] = { file: f, url: URL.createObjectURL(f) }; ocr.read = (ocr.read || []).filter(i => i !== +el.dataset.slot); render(); return;
  }
  if (act !== 'ocrF' || !ocr?.blocks) return;
  const b = ocr.blocks[+el.dataset.b], p = el.dataset.p !== undefined ? b.players[+el.dataset.p] : null, k = el.dataset.k;
  if (k === 'rank') b.rank = el.value === '' ? null : Number(el.value);
  if (k === 'team') {
    b.teamId = el.value; const fm = findMatch(ocr.matchId), t = fm && ocrRoster(fm.g).find(x => x.id === b.teamId);
    b.auto = { ...(b.auto || {}), manual: true };
    const subs = b.players.map(x => x.sub);
    linkTeamPlayers(b, t);
    b.players.forEach((x, j) => { if (subs[j]) Object.assign(x, { sub: true, uid: null, exact: false }); x.ok = false; x.alsoIn = (x.alsoIn || []).filter(y => y.teamId !== b.teamId); });
  }
  if (k === 'short') b.shortOk = el.checked;
  if (k === 'who') { p.sub = el.value === 'sub'; p.uid = p.sub ? null : el.value || null; p.suggested = false; p.ok = false;
    const t = team(b.teamId), m = !p.sub && p.uid && t ? E.matchReadings([p.ocr, ...(p.alts || [])], t.players.map(x => ({ uid: x.uid, name: x.name }))) : null;
    p.exact = !!(m && LINKED.has(m.how) && m.player.uid === p.uid); p.how = p.exact ? m.how : null; if (p.sub && !p.name) p.name = p.ocr; }
  if (k === 'name') { p.name = el.value; p.ok = false; }
  if (k === 'kills') p.kills = el.value === '' ? null : Number(el.value);
  if (k === 'ok') p.ok = el.checked;
  render();
});
function byUid(b, uid) { const t = team(b.teamId); return t?.players.find(x => x.uid === uid)?.name || ''; }
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
  const act = el.dataset.act; if (!act.startsWith('ocr') || !ocr) return;
  e.preventDefault();
  if (act === 'ocrRun') { if (el.dataset.again && ocr.blocks && !confirm('Read the screenshots again from scratch? Your changes in the table will be replaced.')) return; return void ocrRun(false); }
  if (act === 'ocrAdd') return void ocrRun(true);
  if (act === 'ocrPublish') return ocrPublish();
  if (act === 'ocrClear') { ocr.shots.forEach(s => s && URL.revokeObjectURL(s.url)); ocr = null; render(); return; }
  if (act === 'ocrPopOk') { ocr.pop = null; render(); return; }
  const b = ocr.blocks && ocr.blocks[+el.dataset.b];
  if (act === 'ocrDelP') b.players.splice(+el.dataset.p, 1);
  if (act === 'ocrAddP') b.players.push({ ocr: '', conf: 0, kills: 0, uid: null, exact: false, ok: false, sub: false, name: '' });
  if (act === 'ocrDelB' && confirm('Remove rank ' + (b.rank || '?') + ' from this result?')) ocr.blocks.splice(+el.dataset.b, 1);
  if (act === 'ocrAddB') { const usedR = new Set(ocr.blocks.map(x => x.rank)); let r = 1; while (usedR.has(r)) r++;
    ocr.blocks.push({ rank: r, shot: null, teamId: '', shortOk: false, players: [0, 1, 2, 3].map(() => ({ ocr: '', conf: 0, kills: 0, uid: null, exact: false, ok: false, sub: false, name: '' })) }); }
  render();
});
