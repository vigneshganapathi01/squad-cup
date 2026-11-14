// End-to-end name check: send each sample screenshot to the running OCR service, then link every name on screen to its
// team's registered players with the site's own rules (engine.js matchName). Scores what the admin would see.
// Run: node eval_names.mjs            (the OCR service must be running on 127.0.0.1:8765)
//      node eval_names.mjs -v          (list every player)
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../prototype/engine.js');
const URL_ = process.env.OCR_URL || 'http://127.0.0.1:8765';
const exp = JSON.parse(readFileSync('samples/expected.json', 'utf8')), reg = JSON.parse(readFileSync('samples/registered.json', 'utf8'));
const verbose = process.argv.includes('-v');
const tot = { players: 0, linked: 0, wrong: 0, suggested: 0, missed: 0, kills: 0, how: {} };
for (const [file, ranks] of Object.entries(reg)) {
  if (file.startsWith('_')) continue;
  const fd = new FormData();
  fd.append('shot1', new Blob([readFileSync('samples/' + file)]), file);
  const r = await fetch(URL_ + '/extract', { method: 'POST', body: fd }); const j = await r.json();
  const byRank = Object.fromEntries(j.teams.map(t => [String(t.rank), t]));
  const lines = [], s = { players: 0, linked: 0, wrong: 0, suggested: 0, missed: 0, kills: 0 };
  for (const [rank, names] of Object.entries(ranks)) {
    if (rank.startsWith('_')) continue;
    const players = names.map((name, i) => ({ uid: rank + '-' + i, name })), want = exp[file][rank];
    const reads = (byRank[rank]?.players || []).map(p => ({ p, m: E.matchReadings([p.name, ...(p.alts || [])], players) }));
    players.forEach((pl, i) => {
      s.players++;
      const hit = reads.find(x => x.m.player && x.m.player.uid === pl.uid && x.m.how !== 'suggest');
      const sug = reads.find(x => x.m.player && x.m.player.uid === pl.uid && x.m.how === 'suggest');
      const wrongLink = reads.find(x => x.m.how && x.m.how !== 'suggest' && x.m.player.uid !== pl.uid && x.p === (hit || sug || {}).p);
      const got = hit || sug;
      if (hit) { s.linked++; tot.how[hit.m.how] = (tot.how[hit.m.how] || 0) + 1; } else if (sug) s.suggested++; else s.missed++;
      if (wrongLink) s.wrong++;
      if (got && got.p.kills === want[i][1]) s.kills++;
      if (verbose || !hit) lines.push(`  #${rank} ${pl.name.padEnd(16)} read ${JSON.stringify(got ? got.p.name : '—').padEnd(18)} → ${hit ? hit.m.how.toUpperCase() + ' (auto-linked, shows "' + pl.name + '")' : sug ? 'suggestion (' + sug.m.r + '), admin verifies' : 'not matched'}${got && got.p.kills !== want[i][1] ? '  ✗ kills ' + got.p.kills + ' ≠ ' + want[i][1] : ''}`);
    });
    // a reading linked to the wrong registered player would be a real error
    reads.forEach(x => { if (x.m.how && x.m.how !== 'suggest') { const i = players.findIndex(p => p.uid === x.m.player.uid); const ok = E.editRatio(E.foldName(x.p.name), E.foldName(want[i][0])) >= 0.5 || x.m.how !== 'suggest'; if (!ok) s.wrong++; } });
  }
  console.log(`== ${file}: ${s.linked}/${s.players} auto-linked with the exact registered name · ${s.suggested} suggestions · ${s.missed} not matched · kills ${s.kills}/${s.players}`);
  lines.forEach(l => console.log(l));
  for (const k of Object.keys(s)) tot[k] += s[k];
}
console.log(`TOTAL: ${tot.linked}/${tot.players} auto-linked (${Math.round(tot.linked / tot.players * 100)}%) · ${tot.suggested} suggestions · ${tot.missed} not matched · ${tot.wrong} wrong links · kills ${tot.kills}/${tot.players}`);
console.log('how they linked:', JSON.stringify(tot.how));
