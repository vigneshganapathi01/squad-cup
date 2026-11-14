// Tournament engine: fixed logic, values come from admin settings.
(function (root) {
  const GROUP_SIZE = 12;          // always 12 teams per group
  const FINAL_TEAMS = 12;         // Grand Final always 12 teams
  const MERGE_MAX = 60;           // Wild Cards join the first stage with <= 60 teams (5 groups)
  const STAGE1_TOP = 8, LATER_TOP = 6, MATCHES = 6, FINAL_MATCHES = 12;
  const PLACEMENT_POINTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0];
  const POINTS_PER_KILL = 1;

  // Balanced group sizes, never above 12.
  function distribute(total) {
    total = Math.max(0, Math.floor(total || 0));
    if (!total) return [];
    const groups = Math.ceil(total / GROUP_SIZE), base = Math.floor(total / groups), rem = total % groups;
    return Array.from({ length: groups }, (_, i) => base + (i < rem ? 1 : 0));
  }

  // Full stage plan from the number of teams and wild cards.
  // opts (all optional): top1 = qualifiers per group in Stage 1, topN = in later stages, matches = matches per group, finalMatches.
  function planStages(teams, wildCards, opts) {
    opts = opts || {};
    const clamp = (v, d, max) => { v = Math.floor(Number(v)); return v >= 1 && v <= max ? v : d; };
    const top1 = clamp(opts.top1, STAGE1_TOP, GROUP_SIZE - 1), topL = clamp(opts.topN, LATER_TOP, GROUP_SIZE - 1);
    const mt = clamp(opts.matches, MATCHES, 30), fmt = clamp(opts.finalMatches, FINAL_MATCHES, 30);
    wildCards = Math.max(0, Math.floor(wildCards || 0));
    const stages = [];
    let x = Math.max(0, Math.floor(teams || 0)), merged = wildCards === 0;
    for (let i = 0; i < 20; i++) {
      let wcJoin = 0;
      if (!merged && x + wildCards <= MERGE_MAX) { x += wildCards; wcJoin = wildCards; merged = true; }
      const sizes = distribute(x);
      if (x <= FINAL_TEAMS) {
        stages.push({ index: i, name: 'Grand Final', final: true, entering: x, wcJoin, sizes, topN: null, advancing: null, matches: fmt });
        break;
      }
      const topN = i === 0 ? top1 : topL;
      let advancing = sizes.reduce((s, n) => s + Math.min(n, topN), 0), fill = 0;
      // Keep the Grand Final at 12: if the cut would leave fewer, the best of the rest fill the gap.
      const wcNext = !merged && advancing + wildCards <= MERGE_MAX ? wildCards : 0;
      if (advancing + wcNext < FINAL_TEAMS) { const want = Math.min(x, FINAL_TEAMS - wcNext); fill = Math.max(0, want - advancing); advancing += fill; }
      stages.push({ index: i, name: 'Stage ' + (i + 1), final: false, entering: x, wcJoin, sizes, topN, advancing, fill, matches: mt });
      x = advancing;
    }
    return stages;
  }

  // Total slots must make full groups: a multiple of 12, at least 2 groups.
  function slotsOk(n) { n = Number(n); return Number.isInteger(n) && n >= 2 * GROUP_SIZE && n % GROUP_SIZE === 0; }

  // Every stage must be full groups of exactly 12 and the Grand Final exactly 12.
  // stages: from planStages (or the app's plan()). skip: ignore stages before this index (already generated).
  // Returns plain-English problems; empty = the format works.
  function checkPlan(stages, skip) {
    const errors = [];
    stages.forEach((s, i) => {
      if (i < (skip || 0)) return;
      const bad = s.final ? s.entering !== FINAL_TEAMS : s.entering % GROUP_SIZE !== 0;
      if (!bad) return;
      const prev = stages[i - 1];
      const from = prev ? `${prev.name}: ${prev.sizes.length} groups × Top ${prev.topN}${prev.fill ? ' (+' + prev.fill + ' best of the rest)' : ''} = ${s.wcJoin ? prev.advancing + ' + ' + s.wcJoin + ' Wild Cards = ' : ''}`
        : (s.wcJoin ? `${s.entering - s.wcJoin} + ${s.wcJoin} Wild Cards = ` : '');
      errors.push(`${from}${s.entering} teams for ${s.name}, which ${s.final ? 'must be exactly 12' : 'is not a multiple of 12 (groups must be full)'}`);
    });
    return errors;
  }

  // Stage names: the admin may name every stage; otherwise "Stage 1", "Stage 2" … and "Grand Final" for the last.
  function defaultStageName(i, count) { return i === count - 1 ? 'Grand Final' : 'Stage ' + (i + 1); }
  // Names show on public pages, so keep only letters, numbers, spaces and simple punctuation (no HTML), at most 24 characters.
  function cleanStageName(s) { return String(s || '').normalize('NFC').replace(/[^\p{L}\p{M}\p{N} .,:#+()\/-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 24); }

  // ---- Bracket set by the admin as team counts ----
  // path[k] = teams entering stage k+1 (Stage 2, Stage 3 … the last is the Grand Final, always 12). Stage 1 = slots.
  // wcStage = index of the stage the Wild Cards join (1 = Stage 2). Each count is a multiple of 12, so groups = count ÷ 12.
  // How many of a stage's teams go through = next count − Wild Cards joining there:
  // Top N from every group, then the best next-placed teams (all the (N+1)th places, best first) until the count is reached.
  function qualifyRule(advancing, groups) {
    const topN = groups ? Math.floor(advancing / groups) : 0;
    return { topN, extra: advancing - topN * groups };
  }
  function planPath(slots, wildCards, path, wcStage, opts) {
    opts = opts || {};
    const clamp = (v, d) => { v = Math.floor(Number(v)); return v >= 1 && v <= 30 ? v : d; };
    // Matches: opts.matchesList[i] for each stage (the admin's choice per stage); otherwise one number for the stages and one for the final.
    const mt = clamp(opts.matches, MATCHES), fmt = clamp(opts.finalMatches, FINAL_MATCHES), list = opts.matchesList || [], names = opts.names || [];
    const wc = Math.max(0, Math.floor(wildCards || 0)), counts = [Math.floor(slots || 0), ...(path || []).map(n => Math.floor(Number(n) || 0))];
    const wcAt = i => (wc && i === wcStage ? wc : 0);
    return counts.slice(0, 21).map((entering, i) => {
      const final = i === counts.length - 1, sizes = distribute(entering), matches = clamp(list[i], final ? fmt : mt);
      if (final) return { index: i, name: names[i] || defaultStageName(i, counts.length), final: true, entering, wcJoin: wcAt(i), sizes, topN: null, extra: 0, fill: 0, advancing: null, matches };
      const advancing = counts[i + 1] - wcAt(i + 1), r = qualifyRule(advancing, sizes.length);
      return { index: i, name: names[i] || defaultStageName(i, counts.length), final: false, entering, wcJoin: wcAt(i), sizes, topN: r.topN, extra: r.extra, fill: r.extra, advancing, matches };
    });
  }
  // Plain-English problems with a team-count bracket; empty = it works. lockedUpTo: stages before this index already exist.
  function checkPath(slots, wildCards, path, wcStage, lockedUpTo, names) {
    const errors = [], wc = Math.max(0, Math.floor(wildCards || 0));
    if (!slotsOk(slots)) errors.push(`Total slots (${slots}) must be a multiple of 12, at least 24`);
    if (!Array.isArray(path) || !path.length) { errors.push('Add at least one stage after Stage 1: the last one is the Grand Final'); return errors; }
    const name = i => (names && names[i]) || defaultStageName(i, path.length + 1);
    let prev = Number(slots);
    path.forEach((raw, k) => {
      const i = k + 1, n = Number(raw), last = k === path.length - 1;
      if (i < (lockedUpTo || 0)) { prev = n; return; }
      if (!Number.isInteger(n) || n < GROUP_SIZE || n % GROUP_SIZE) errors.push(`${name(i)}: ${raw} teams is not a multiple of 12`);
      else {
        const joining = wc && i === wcStage ? wc : 0, q = n - joining, groups = Math.ceil(prev / GROUP_SIZE);
        if (joining && q < 1) errors.push(`${name(i)}: ${joining} Wild Cards join here, but the stage has only ${n} teams. Use a bigger stage, fewer Wild Cards, or a later stage`);
        else if (q >= prev) errors.push(`${name(i)}: ${n} teams${joining ? ` (${q} + ${joining} Wild Cards)` : ''} must be fewer than the ${prev} in ${name(i - 1)}`);
        else if (q < groups) errors.push(`${name(i)}: ${q} qualifiers is fewer than the ${groups} groups in ${name(i - 1)} (each group needs at least Top 1)`);
      }
      prev = n;
    });
    if (path.length > 20) errors.push('Too many stages (20 at most)');
    if (wc % GROUP_SIZE) errors.push(`Wild Card teams must be a multiple of 12 (12, 24, 36 …), not ${wc}`);
    if (wc && !(wcStage >= 1 && wcStage <= path.length)) errors.push('Choose the stage the Wild Cards join');
    return errors;
  }
  // The admin picks how many stages (Stage 1 + later stages, the last is the Grand Final) and the final's size:
  // spread the counts evenly (same shrink each stage) from start to finalTeams, in multiples of 12.
  // keep: counts already fixed at the front (stages that exist). Returns null if that many stages don't fit.
  function spreadPath(slots, stages, finalTeams, keep) {
    keep = (keep || []).map(Number); finalTeams = Number(finalTeams) || FINAL_TEAMS;
    const steps = Math.floor(stages) - 1 - keep.length;          // counts still to fill, the final included
    const start = keep.length ? keep[keep.length - 1] : Number(slots);
    if (steps < 1 || finalTeams >= start || finalTeams % GROUP_SIZE) return steps === 0 && keep.length ? keep : null;
    const out = keep.slice(), ratio = Math.pow(finalTeams / start, 1 / steps);
    let prev = start;
    for (let j = 1; j < steps; j++) {
      let c = Math.round(start * Math.pow(ratio, j) / GROUP_SIZE) * GROUP_SIZE;
      const room = (steps - j) * GROUP_SIZE + finalTeams;        // leave space to keep shrinking by at least 12 a stage
      const least = Math.ceil(Math.ceil(prev / GROUP_SIZE) / GROUP_SIZE) * GROUP_SIZE;   // every group of the stage before sends at least 1
      c = Math.min(c, prev - GROUP_SIZE); c = Math.max(c, room, least);
      if (c >= prev) return null;
      out.push(c); prev = c;
    }
    if (finalTeams >= prev || finalTeams < Math.ceil(prev / GROUP_SIZE)) return null;
    out.push(finalTeams);
    return out;
  }
  // Where Wild Cards join by default: the first stage with 60 qualifiers or fewer that still has room for them
  // (every group of the stage before sends at least one). If none, the latest stage with room; the final as a last resort.
  function defaultWcStage(path, wildCards, slots) {
    const wc = Math.max(0, Math.floor(wildCards || 0)), fits = k => path[k] - wc >= Math.ceil((k ? path[k - 1] : slots || Infinity) / GROUP_SIZE);
    for (let k = 0; k < path.length; k++) if (path[k] - wc <= MERGE_MAX && fits(k)) return k + 1;
    for (let k = path.length - 1; k >= 0; k--) if (fits(k)) return k + 1;
    return path.length;
  }

  // A ready-made team-count bracket: keep about keep1/12 of the teams after Stage 1, then keepN/12 after each later stage,
  // rounded down to full groups of 12. Wild Cards join the first stage with 60 teams or fewer.
  function suggestPath(slots, wildCards, keep1, keepN, startAt) {
    const wc = Math.max(0, Math.floor(wildCards || 0)), path = []; let x = Math.floor(slots || 0), wcStage = 0, i = 0;
    if (startAt) { path.push(...startAt.path); x = path[path.length - 1]; i = path.length; wcStage = startAt.wcStage || 0; }
    for (; i < 20 && x > FINAL_TEAMS; i++) {
      const raw = Math.floor(x * (i === 0 ? keep1 || STAGE1_TOP : keepN || LATER_TOP) / GROUP_SIZE);
      // Wild Cards join here only if the stage still has room for qualifiers: at least one from every group before it.
      const least = Math.ceil((wc + Math.ceil(x / GROUP_SIZE)) / GROUP_SIZE) * GROUP_SIZE;
      const join = wc && !wcStage && raw <= MERGE_MAX && least < x;   // the first stage with 60 qualifiers or fewer
      let next = Math.max(FINAL_TEAMS, Math.floor((raw + (join ? wc : 0)) / GROUP_SIZE) * GROUP_SIZE);
      if (join) next = Math.max(next, least);
      if (next >= x) next = x - GROUP_SIZE;
      if (join) wcStage = i + 1;
      path.push(next); x = next;
    }
    if (wc && !wcStage) wcStage = path.length;   // no earlier stage fits: they join the Grand Final
    return { path, wcStage };
  }

  function matchPoints(place, kills) {
    const p = PLACEMENT_POINTS[(place | 0) - 1] || 0;
    return p + Math.max(0, kills | 0) * POINTS_PER_KILL;
  }

  // results: [{teamId: {place, kills, noShow}}] one object per approved match.
  // Tie-breakers: Booyahs, placement points, kills, last-match placement.
  function standings(teamIds, results) {
    const rows = teamIds.map(id => ({ teamId: id, points: 0, placePts: 0, kills: 0, booyahs: 0, played: 0, noShows: 0, last: 99 }));
    const by = Object.fromEntries(rows.map(r => [r.teamId, r]));
    results.forEach(res => {
      Object.entries(res).forEach(([id, r]) => {
        const row = by[id]; if (!row) return;
        row.played++;
        if (r.noShow) { row.noShows++; row.last = 99; return; }
        const pp = PLACEMENT_POINTS[r.place - 1] || 0;
        row.placePts += pp; row.kills += r.kills | 0; row.points += pp + (r.kills | 0) * POINTS_PER_KILL;
        if (r.place === 1) row.booyahs++;
        row.last = r.place;
      });
    });
    rows.sort((a, b) => b.points - a.points || b.booyahs - a.booyahs || b.placePts - a.placePts || b.kills - a.kills || a.last - b.last);
    rows.forEach((r, i) => r.rank = i + 1);
    return rows;
  }

  // Seeded snake order: 1st→A, 2nd→B … then back. Keeps groups balanced in strength.
  function snakeAllocate(teamIds, sizes) {
    const groups = sizes.map(() => []);
    let g = 0, dir = 1;
    for (const id of teamIds) {
      let tries = 0;
      while (groups[g].length >= sizes[g] && tries++ < sizes.length * 2) { g += dir; if (g >= sizes.length || g < 0) { dir = -dir; g += dir; } }
      groups[g].push(id);
      g += dir; if (g >= sizes.length || g < 0) { dir = -dir; g += dir; }
    }
    return groups;
  }
  function sequentialAllocate(teamIds, sizes) {
    const groups = []; let k = 0;
    sizes.forEach(n => { groups.push(teamIds.slice(k, k + n)); k += n; });
    return groups;
  }
  function shuffle(a, rnd = Math.random) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Registration checks. existing = all players already registered (other teams).
  function validateTeam(team, existingPlayers, existingTeamNames) {
    const errors = [];
    if (!team.name || !team.name.trim()) errors.push('Team name is required');
    else if (existingTeamNames.some(n => n.toLowerCase() === team.name.trim().toLowerCase())) errors.push('Team name already taken');
    const uids = new Set(), mobiles = new Set(), igns = new Set();
    const ign = x => (x || '').trim().toLowerCase();
    (team.players || []).forEach((p, i) => {
      const n = 'Player ' + (i + 1);
      if (!p.name || !p.name.trim()) errors.push(n + ': In Game Name is required');
      else if (p.name.trim().length > 20) errors.push(n + ': In Game Name is too long (max 20 characters)');
      else if (igns.has(ign(p.name))) errors.push(n + ': same In Game Name used twice in this team');
      else if (existingPlayers.some(e => ign(e.name) === ign(p.name))) errors.push(n + ': In Game Name ' + p.name.trim() + ' is already in another team');
      igns.add(ign(p.name));
      if (!/^[6-9]\d{9}$/.test(p.mobile || '')) errors.push(n + ': mobile must be 10 digits starting 6–9');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email || '')) errors.push(n + ': email is not valid');
      if (!/^\d{8,12}$/.test(p.uid || '')) errors.push(n + ': Free Fire UID must be 8–12 digits');
      if (uids.has(p.uid)) errors.push(n + ': same UID used twice in this team');
      if (mobiles.has(p.mobile)) errors.push(n + ': same mobile used twice in this team');
      uids.add(p.uid); mobiles.add(p.mobile);
      if (existingPlayers.some(e => e.uid === p.uid)) errors.push(n + ': UID ' + p.uid + ' is already in another team');
      else if (existingPlayers.some(e => e.mobile === p.mobile)) errors.push(n + ': mobile ' + p.mobile + ' is already in another team');
    });
    if ((team.players || []).length !== 4) errors.push('4 players are required');
    return errors;
  }

  // ---- Screenshot (OCR) results ----
  // blocks: [{ rank, teamId, shortOk, players: [{ uid, name, kills, sub, exact, ok }] }]
  // groupTeams: [{ id, name, players: [{ uid, name }] }]
  // Identity is the registered UID (or, for an admin-confirmed substitute, the typed name). Never a fuzzy match.
  function validateOcrResult(blocks, groupTeams) {
    const errors = [], warnings = [];
    const n = groupTeams.length, byId = Object.fromEntries(groupTeams.map(t => [t.id, t]));
    const ranks = new Set(), teams = new Set(), ids = new Set();
    let players = 0;
    blocks.forEach(b => {
      const label = 'Rank ' + b.rank;
      if (!Number.isInteger(b.rank) || b.rank < 1 || b.rank > n) errors.push(label + ': placement must be between 1 and ' + n);
      else if (ranks.has(b.rank)) errors.push(label + ': placement used twice');
      ranks.add(b.rank);
      const t = byId[b.teamId];
      if (!t) { errors.push(label + ': choose which team this is'); return; }
      if (teams.has(b.teamId)) errors.push(label + ': ' + t.name + ' appears twice');
      teams.add(b.teamId);
      const ps = b.players || [];
      if (ps.length > 4) errors.push(label + ': more than 4 players');
      if (ps.length < 4 && !b.shortOk) errors.push(label + ': only ' + ps.length + ' player' + (ps.length === 1 ? '' : 's') + '. Tick "fewer than 4 confirmed" or add the missing player');
      ps.forEach((p, i) => {
        const who = label + ' player ' + (i + 1);
        players++;
        if (!Number.isInteger(p.kills) || p.kills < 0) errors.push(who + ': eliminations must be 0 or more');
        if (p.sub) {
          if (!p.name || !p.name.trim()) errors.push(who + ': type the substitute\'s In Game Name');
        } else if (!p.uid) errors.push(who + ': choose the registered player or mark as substitute');
        else if (!t.players.some(x => x.uid === p.uid)) errors.push(who + ': that player is not in ' + t.name);
        if (p.otherTeam) errors.push(who + ': ' + (p.read || p.name) + ' is registered for ' + p.otherTeam + ', not ' + t.name + '. Fix the team or the player');
        const key = p.sub ? 'sub:' + (p.name || '').trim() : 'uid:' + p.uid;
        if ((p.uid || p.sub) && ids.has(key)) errors.push(who + ': ' + (p.name || p.uid) + ' is listed twice in this match');
        ids.add(key);
        if ((!p.exact || p.sub) && !p.ok) errors.push(who + ': name is uncertain. Check it and tick Verified');
        else if (p.killsCheck && !p.ok) errors.push(who + ': eliminations were re-read from a close-up. Check the number and tick Verified');
      });
    });
    const missing = groupTeams.filter(t => !teams.has(t.id));
    if (missing.length) warnings.push(missing.length + ' team' + (missing.length > 1 ? 's' : '') + ' not on the screenshots will be marked no-show: ' + missing.map(t => t.name).join(', '));
    if (blocks.length && players !== blocks.length * 4) warnings.push(players + ' player records (' + blocks.length + ' teams × 4 = ' + blocks.length * 4 + ')');
    return { errors, warnings };
  }

  // ---- Names on screenshots vs registered In Game Names ----
  // Free Fire names use decorative letters (small capitals ᴍ, Canadian ᑌ, Greek ∂ …) that look like plain letters. In the
  // game font they look the same, so no OCR can tell which one was typed, and many are not in the OCR's alphabet at all.
  // foldName turns a name into its plain look-alike form so a screenshot reading can be compared with the exact
  // registered name. Unicode NFKC handles superscripts (¹ → 1), circled (Ⓞ → O), modifier (ᴼ → O) and full-width
  // letters; LOOK covers the rest. OCR mix-ups are folded too (0/o, 1/l/i/|/!, 5/s), then icons and spaces dropped.
  const LOOK = {
    'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm',
    'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ǫ': 'q', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
    'ᗩ': 'a', 'ᗷ': 'b', 'ᑕ': 'c', 'ᗪ': 'd', 'ᗴ': 'e', 'ᖴ': 'f', 'ᕼ': 'h', 'ᒍ': 'j', 'ᒪ': 'l', 'ᗰ': 'm', 'ᑎ': 'n', 'ᑭ': 'p',
    'ᖇ': 'r', 'ᔕ': 's', 'ᑌ': 'u', 'ᐯ': 'v', 'ᗯ': 'w', 'ᘔ': 'z', 'Ꭵ': 'i', 'Ꭺ': 'a', 'Ᏼ': 'b', 'Ꮯ': 'c', 'Ꭰ': 'd', 'Ꭼ': 'e',
    'Ꮐ': 'g', 'Ꮋ': 'h', 'Ꮶ': 'k', 'Ꮮ': 'l', 'Ꮇ': 'm', 'Ꮲ': 'p', 'Ꮪ': 's', 'Ꭲ': 't', 'Ꮩ': 'v', 'Ꮃ': 'w', 'Ꮓ': 'z',
    'α': 'a', 'в': 'b', 'ϲ': 'c', '∂': 'd', 'ε': 'e', 'є': 'e', 'ғ': 'f', 'н': 'h', 'ι': 'i', 'κ': 'k', 'ℓ': 'l', 'м': 'm', 'η': 'n',
    'и': 'n', 'σ': 'o', 'ø': 'o', 'ο': 'o', 'ρ': 'p', 'я': 'r', 'ѕ': 's', 'τ': 't', 'т': 't', 'υ': 'u', 'ν': 'v', 'ω': 'w', 'χ': 'x',
    'у': 'y', 'λ': 'a', 'Δ': 'a', 'Λ': 'a', 'Σ': 'e', 'Π': 'n', 'ð': 'd', 'ł': 'l', 'ɑ': 'a', 'ɛ': 'e', '฿': 'b', 'ß': 'b', '¢': 'c',
    '€': 'e', '£': 'l', '¥': 'y', '$': 's', '@': 'a', 'ä': 'a', 'å': 'a', 'ö': 'o', 'ü': 'u', 'ë': 'e', 'ï': 'i', 'ÿ': 'y',
    'ϯ': 't', '†': 't', '0': 'o', '1': 'i', 'l': 'i', '|': 'i', '!': 'i', '5': 's'
  };
  // √ is a V when a letter follows it (√J → VJ); anywhere else it is a check-mark decoration and is dropped.
  const vMark = s => String(s || '').replace(/√(?=\s*\p{L})/gu, 'v').replace(/√/g, '');
  function foldName(s) {
    let t = vMark(s).normalize('NFKC').toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');
    const pass = x => Array.from(x, ch => LOOK[ch] !== undefined ? LOOK[ch] : ch).join('');
    t = pass(pass(t));   // twice, so chains finish (small capital ʟ → l → i, the same as an OCR'd L)
    return t.replace(/[^\p{L}\p{N}]/gu, '');
  }
  // The same without decorations: symbols (✓ ☣ ♡ ★), punctuation (! ? . _ ~), superscript numbers (¹² ⁷) and raised
  // letters (ᴼᴾ) are removed first. The OCR often drops these at the ends of a name ("RES.TOXIC" for RES.TOXIC¹²).
  // √ and † stay: they look like letters (√J → VJ).
  function plainName(s) {
    // Chinese characters count as decoration here: the OCR turns icons (☣, 모 …) into them
    return foldName(vMark(s).normalize('NFC').replace(/[†ϯ]/g, m => LOOK[m]).replace(/[\p{P}\p{S}\p{No}\p{Lm}\p{Script=Han}]/gu, ''));
  }
  const nfcName = s => String(s || '').normalize('NFC').replace(/\s+/g, ' ').trim();
  // The clan tag most of the team's players share at the start of their names (e.g. "ud" for ᑌD KUTTY, ᑌD JACK …).
  // The prefix shared by the most players wins (VJ for 3 players beats VJSP for 2); a longer one wins a tie.
  function teamTag(names, fold = plainName) {
    const f = names.map(fold).filter(Boolean);
    let best = '', bestN = 1;
    for (let len = 2; len <= 4; len++) {
      const counts = {};
      f.forEach(n => { if (n.length > len + 1) counts[n.slice(0, len)] = (counts[n.slice(0, len)] || 0) + 1; });
      Object.entries(counts).forEach(([p, c]) => { if (c > bestN || (c === bestN && c >= 2 && p.length > best.length)) { best = p; bestN = c; } });
    }
    return bestN >= 2 ? best : '';
  }
  function editRatio(a, b) {
    if (!a || !b) return 0;
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return 1 - d[a.length][b.length] / Math.max(a.length, b.length);
  }
  // Does a prefix in front of a name look like the team's clan tag? The OCR often turns tag letters into digits
  // ("32" for BZ, "6MK" for TVK), so the usual digit look-alikes are folded first; a third of the letters must agree.
  // A different prefix ("rk" for a THx team) shares nothing and does not count.
  const TAG_DIGITS = { '3': 'b', '8': 'b', '2': 'z', '6': 'g', '9': 'g', '4': 'a', '7': 't', 'o': 'o' };
  function tagLike(extra, tag) {
    if (!extra) return true;
    if (!tag || extra.length > tag.length + 1) return false;
    const d = s => Array.from(s, c => TAG_DIGITS[c] || c).join('');
    return editRatio(d(extra), d(tag.slice(-extra.length))) >= 0.3;
  }
  // Match one screenshot reading against a team's registered players.
  // how: 'exact' (same text) | 'lookalike' (same after folding) | 'tag' (same once the team's clan tag is set aside,
  // which the OCR often drops or misreads) → the player is linked; otherwise 'suggest' with the closest player, or null.
  // A link needs exactly one registered player to fit, so two teammates can never be confused.
  function matchName(read, players) {
    const r = nfcName(read), fr = foldName(read);
    if (!fr) return { how: null, player: null, r: 0 };
    const one = list => list.length === 1 ? list[0] : null;
    let p = one(players.filter(x => nfcName(x.name) === r));
    if (p) return { how: 'exact', player: p, r: 1 };
    p = one(players.filter(x => foldName(x.name) === fr));
    if (p) return { how: 'lookalike', player: p, r: 1 };
    const pr = plainName(read);
    p = pr.length >= 3 && one(players.filter(x => plainName(x.name) === pr));
    if (p) return { how: 'lookalike', player: p, r: 1 };
    const tag = teamTag(players.map(x => x.name));
    if (tag && pr) {
      const core = n => { const f = plainName(n); return f.startsWith(tag) ? f.slice(tag.length) : f; };
      // tag dropped ("kutty" for ᑌD KUTTY) or misread ("sdjack" for ᑌD JACK): the reading ends with the name's core
      // and anything in front of it is no longer than the tag
      // anything in front of the core must look like the tag ("sd" for ud, "32" for bz), not some other prefix ("rk")
      p = one(players.filter(x => { const c = core(x.name); return c.length >= 3 && pr.endsWith(c) && tagLike(pr.slice(0, pr.length - c.length), tag); }));
      if (p) return { how: 'tag', player: p, r: 1 };
    }
    // a decoration of up to 2 characters dropped or misread at the start or end of the name (ⓄBITO♡ read "BITO",
    // ⚠ NOBITA read "4 NOBITA", LUFFY ¿? read "LUFFY i?"); the shorter side must keep at least 4 characters
    if (pr.length >= 4) {
      const fits = (a, b) => a.endsWith(b) || a.startsWith(b);
      p = one(players.filter(x => { const f = plainName(x.name); return f.length >= 4 && f !== pr && Math.abs(f.length - pr.length) <= 2 && (fits(f, pr) || fits(pr, f)); }));
      if (p) return { how: 'tag', player: p, r: 1 };
    }
    const scored = players.map(x => ({ x, r: editRatio(fr, foldName(x.name)) })).sort((a, b) => b.r - a.r);
    return scored[0] && scored[0].r >= 0.5 ? { how: 'suggest', player: scored[0].x, r: Math.round(scored[0].r * 100) / 100 } : { how: null, player: null, r: 0 };
  }

  // The service can send a name's other readings too (e.g. the Tamil model's). Use the first one that links; otherwise
  // the best suggestion among them.
  function matchReadings(reads, players) {
    let best = { how: null, player: null, r: 0, read: '' };
    for (const read of reads.filter(Boolean)) {
      const m = matchName(read, players);
      if (m.how && m.how !== 'suggest') return { ...m, read };
      if (m.how === 'suggest' && m.r > best.r) best = { ...m, read };
    }
    return best;
  }

  // ---- Which team is this rank? Cross-check all its players against the registrations ----
  // teamMatch: how well a rank's names (reads: one array of readings per player on screen) fit one team's registered
  // players, using every player at once and each registered player at most once. pairs[i] = what reading i links to.
  const LINKS = { exact: 1, lookalike: 1, tag: 1 };
  function teamMatch(reads, players) {
    const cand = reads.map((rs, i) => ({ i, m: matchReadings(rs, players) })).filter(x => x.m.player);
    // strongest first: linked names before suggestions, then by similarity
    cand.sort((a, b) => (LINKS[b.m.how] ? 2 : b.m.r) - (LINKS[a.m.how] ? 2 : a.m.r));
    const used = new Set(), pairs = reads.map(() => null);
    let score = 0, linked = 0;
    for (const { i, m } of cand) {
      if (used.has(m.player.uid)) continue;
      used.add(m.player.uid);
      const isLink = !!LINKS[m.how];
      pairs[i] = { uid: m.player.uid, how: m.how, linked: isLink, r: m.r };
      score += isLink ? 2 : m.r; if (isLink) linked++;
    }
    return { score: Math.round(score * 100) / 100, linked, pairs };
  }
  // assignTeams: give every rank its team at the same time. All rank–team pairs are scored, the best pairs are taken
  // first and each team is used once, so two ranks never fight over one team. sure = at least 2 players linked and
  // clearly ahead of the next-best team (by linked players, or by 2 points).
  function assignTeams(blocks, teams) {
    const all = [];
    blocks.forEach((reads, b) => teams.forEach(t => { const m = teamMatch(reads, t.players); if (m.score > 0) all.push({ b, t, ...m }); }));
    all.sort((x, y) => y.linked - x.linked || y.score - x.score);
    const out = blocks.map(() => ({ teamId: '', linked: 0, score: 0, second: null, sure: false, pairs: [] })), taken = new Set(), done = new Set();
    for (const x of all) {
      if (done.has(x.b) || taken.has(x.t.id) || x.score < 1) continue;
      done.add(x.b); taken.add(x.t.id);
      const rest = all.filter(y => y.b === x.b && y.t.id !== x.t.id)[0];
      out[x.b] = { teamId: x.t.id, linked: x.linked, score: x.score, pairs: x.pairs,
        second: rest ? { teamId: rest.t.id, linked: rest.linked, score: rest.score } : null,
        sure: x.linked >= 2 && (!rest || rest.linked < x.linked || x.score - rest.score >= 2) };
    }
    return out;
  }
  // nameMatches: every registered team with a player this name links to (same text, look-alike, or tag/decoration
  // dropped, judged inside that team). Used to catch the same name registered in more than one team.
  // Stricter than linking inside a team (no teammates to back it up): the same text, the same in plain letters, or the
  // same with only that team's clan tag dropped. Guessed misread prefixes don't count here.
  function nameMatches(reads, teams) {
    const out = [], plains = reads.filter(Boolean).map(plainName).filter(x => x.length >= 3);
    teams.forEach(t => {
      const tag = teamTag(t.players.map(x => x.name));
      // a prefix in front of the core counts only if it IS this team's tag once digit look-alikes are folded
      // ("32 subash" for BZ ~SUBASH). One letter off ("rk" for a "ro" tag) is too weak without teammates to confirm it.
      const dg = s => Array.from(s, c => TAG_DIGITS[c] || c).join('');
      const hit = t.players.find(x => { const f = plainName(x.name), core = tag && f.startsWith(tag) ? f.slice(tag.length) : '';
        return plains.some(r => r === f || (core.length >= 3 && (r === core || (r.endsWith(core) && dg(r.slice(0, r.length - core.length)) === dg(tag))))); });
      if (hit) out.push({ teamId: t.id, teamName: t.name, uid: hit.uid, name: hit.name, how: 'same' });
    });
    return out;
  }
  // Registered players in different teams whose names look the same (same plain look-alike form).
  function sameNames(teams) {
    const by = {};
    teams.forEach(t => t.players.forEach(p => { const k = plainName(p.name); if (k.length >= 3) (by[k] = by[k] || []).push({ teamId: t.id, teamName: t.name, uid: p.uid, name: p.name }); }));
    return Object.values(by).filter(list => new Set(list.map(x => x.teamId)).size > 1);
  }

  // Player totals from approved results. results: [{ teamId: { players: [{ slot, name, kills, sub }] } }]
  function playerStandings(results) {
    const by = {};
    results.forEach(res => Object.entries(res).forEach(([teamId, r]) => (r.players || []).forEach(p => {
      const key = p.sub ? 'sub:' + teamId + ':' + p.name : teamId + ':' + (p.slot ?? p.uid);
      const row = by[key] || (by[key] = { key, slot: p.slot, uid: p.uid, name: p.name, teamId, sub: !!p.sub, matches: 0, kills: 0, best: 0 });
      row.matches++; row.kills += p.kills | 0; row.best = Math.max(row.best, p.kills | 0); row.name = p.name;
    })));
    const rows = Object.values(by).sort((a, b) => b.kills - a.kills || b.best - a.best || a.matches - b.matches || a.name.localeCompare(b.name));
    rows.forEach((r, i) => r.rank = i + 1);
    return rows;
  }

  const api = { GROUP_SIZE, FINAL_TEAMS, MERGE_MAX, STAGE1_TOP, LATER_TOP, PLACEMENT_POINTS, POINTS_PER_KILL, MATCHES, FINAL_MATCHES,
    distribute, planStages, slotsOk, checkPlan, qualifyRule, planPath, checkPath, suggestPath, spreadPath, defaultWcStage, defaultStageName, cleanStageName, matchPoints, standings, snakeAllocate, sequentialAllocate, shuffle, validateTeam, validateOcrResult, playerStandings, foldName, plainName, teamTag, matchName, matchReadings, editRatio, teamMatch, assignTeams, nameMatches, sameNames };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
