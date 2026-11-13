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

  const api = { GROUP_SIZE, FINAL_TEAMS, MERGE_MAX, PLACEMENT_POINTS, POINTS_PER_KILL, MATCHES, FINAL_MATCHES,
    distribute, planStages, matchPoints, standings, snakeAllocate, sequentialAllocate, shuffle, validateTeam };
  if (typeof module !== 'undefined') module.exports = api; else root.Engine = api;
})(this);
