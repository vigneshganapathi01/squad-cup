// Check every screenshot in a folder against its expected.json (same format as samples/expected.json).
// For each screenshot: teams found at each rank, players read, eliminations, names (raw OCR text, ≥ 80% similar
// after look-alike folding), and how many names would link if the expected names were the registered ones.
// Run: node eval_folder.mjs ../../screenshots        (the OCR service must be running on 127.0.0.1:8765)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../prototype/engine.js');
const dir = process.argv[2] || 'samples', URL_ = process.env.OCR_URL || 'http://127.0.0.1:8765', verbose = process.argv.includes('-v');
const exp = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
const files = readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f)).sort();
const T = { files: 0, teams: 0, teamsFound: 0, players: 0, playersRead: 0, kills: 0, names: 0, linked: 0, wrong: 0, secs: 0 };
for (const f of files) {
  const want = exp[f]; if (!want) { console.log(`== ${f}: no expected results, skipped`); continue; }
  const fd = new FormData(); fd.append('shot1', new Blob([readFileSync(join(dir, f))]), f);
  const t0 = Date.now(), r = await fetch(URL_ + '/extract', { method: 'POST', body: fd }), j = await r.json(), secs = (Date.now() - t0) / 1000;
  if (!r.ok) { console.log(`== ${f}: service error ${r.status} ${j.detail || ''}`); continue; }
  const byRank = Object.fromEntries(j.teams.map(t => [String(t.rank), t]));
  const s = { teams: 0, teamsFound: 0, players: 0, playersRead: 0, kills: 0, names: 0, linked: 0, wrong: 0 }, lines = [];
  for (const [rank, players] of Object.entries(want)) {
    if (rank.startsWith('_')) continue;
    s.teams++; const blk = byRank[rank]; if (blk) s.teamsFound++;
    const reads = blk ? blk.players : [];
    s.playersRead += Math.min(reads.length, players.length);
    const roster = players.map(([name], i) => ({ uid: String(i), name }));
    players.forEach(([name, kills], i) => {
      s.players++;
      // the reading that belongs to this player: the one linking to it, else the most similar
      const scored = reads.map(p => ({ p, m: E.matchReadings([p.name, ...(p.alts || [])], roster), r: E.editRatio(E.plainName(p.name), E.plainName(name)) }));
      const linkedTo = scored.find(x => x.m.how && x.m.how !== 'suggest' && x.m.player.uid === String(i));
      const best = linkedTo || scored.sort((a, b) => b.r - a.r)[0];
      const okName = best && best.r >= 0.8, okKills = best && best.p.kills === kills;
      if (okName) s.names++; if (okKills) s.kills++; if (linkedTo) s.linked++;
      if (verbose || !okKills || !linkedTo) lines.push(`  #${rank} ${name.padEnd(14)} ${String(kills).padStart(2)} | read ${JSON.stringify(best ? best.p.name : '—').padEnd(18)} ${best ? String(best.p.kills).padStart(2) : ' -'}${okKills ? '' : '  ✗ ELIMS'}${linkedTo ? '' : best && best.r >= 0.5 ? '  (suggestion)' : '  (not matched)'}`);
    });
    if (blk && reads.length > players.length) lines.push(`  #${rank} read ${reads.length} players, ${players.length} visible`);
  }
  const extra = j.teams.filter(t => !want[String(t.rank)]).map(t => t.rank);
  console.log(`== ${f}: ${secs.toFixed(1)}s · teams ${s.teamsFound}/${s.teams}${extra.length ? ' (+ ranks ' + extra.join(',') + ' read but not in expected)' : ''} · elims ${s.kills}/${s.players} · names read ${s.names}/${s.players} · would link ${s.linked}/${s.players}`);
  lines.forEach(l => console.log(l));
  for (const k of Object.keys(s)) T[k] += s[k]; T.files++; T.secs += secs;
}
console.log(`TOTAL ${T.files} screenshots: teams ${T.teamsFound}/${T.teams} · elims ${T.kills}/${T.players} (${Math.round(T.kills / T.players * 100)}%) · names read ${T.names}/${T.players} (${Math.round(T.names / T.players * 100)}%) · would link ${T.linked}/${T.players} (${Math.round(T.linked / T.players * 100)}%) · avg ${(T.secs / T.files).toFixed(1)}s each`);
