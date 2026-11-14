// Team finding test: every rank on every screenshot must find its own team among ALL registered teams of all the
// screenshots (59 teams with clashing names such as ᑌD JACK in three teams), by cross-checking its players.
// Run: node eval_teams.mjs ../../screenshots        (the OCR service must be running on 127.0.0.1:8765)
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const E = createRequire(import.meta.url)('../prototype/engine.js');
const dir = process.argv[2] || '../../screenshots', URL_ = process.env.OCR_URL || 'http://127.0.0.1:8765';
const exp = JSON.parse(readFileSync(join(dir, 'expected.json'), 'utf8'));
// styled registered names where we have them (same screenshots as the samples)
const reg = JSON.parse(readFileSync('samples/registered.json', 'utf8')), styled = { '02.jpeg': 'match-c.webp', '05.jpeg': 'match-b.webp', '06.jpeg': 'match-a.webp' };
const files = readdirSync(dir).filter(f => /\.(png|jpe?g|webp)$/i.test(f) && exp[f]).sort();
const teams = [];
for (const f of files) for (const [rank, players] of Object.entries(exp[f])) {
  if (rank.startsWith('_')) continue;
  const names = (styled[f] && reg[styled[f]]?.[rank]) || players.map(p => p[0]);
  teams.push({ id: `${f}#${rank}`, name: `${f} rank ${rank}`, players: names.map((n, i) => ({ uid: `${f}#${rank}/${i}`, name: n })) });
}
const clashes = E.sameNames(teams);
console.log(`${teams.length} registered teams · ${clashes.length} names registered in more than one team, e.g. ${clashes.slice(0, 4).map(l => l[0].name + ' (' + l.length + ' teams)').join(', ')}`);
let ranks = 0, right = 0, wrong = 0, none = 0, sure = 0, sureWrong = 0, playersRight = 0, playersTotal = 0;
for (const f of files) {
  const fd = new FormData(); fd.append('shot1', new Blob([readFileSync(join(dir, f))]), f);
  const j = await (await fetch(URL_ + '/extract', { method: 'POST', body: fd })).json();
  const blocks = j.teams.filter(t => exp[f][String(t.rank)]);
  const res = E.assignTeams(blocks.map(t => t.players.map(p => [p.name, ...(p.alts || [])])), teams);
  const lines = [];
  blocks.forEach((t, i) => {
    const want = `${f}#${t.rank}`, a = res[i]; ranks++;
    if (a.teamId === want) right++; else if (a.teamId) wrong++; else none++;
    if (a.sure) { sure++; if (a.teamId !== want) sureWrong++; }
    // players linked to the right registered player
    a.pairs.forEach(p => { if (p && p.linked) { playersTotal++; if (p.uid.startsWith(want + '/')) playersRight++; } });
    if (a.teamId !== want || !a.sure) lines.push(`  rank ${t.rank}: ${a.teamId === want ? 'right team' : a.teamId ? 'WRONG → ' + a.teamId : 'no team'} · ${a.linked}/${t.players.length} players matched${a.sure ? '' : ' · not sure (admin checks)'}${a.second ? ' · next best ' + a.second.teamId + ' (' + a.second.linked + ')' : ''}`);
  });
  console.log(`== ${f}: ${res.filter((a, i) => a.teamId === `${f}#${blocks[i].rank}`).length}/${blocks.length} ranks found their team${lines.length ? '' : ' (all sure)'}`);
  lines.forEach(l => console.log(l));
}
console.log(`TOTAL: ${right}/${ranks} ranks → right team · ${wrong} wrong · ${none} no team · ${sure} marked sure (${sureWrong} of those wrong) · linked players on the right registered player ${playersRight}/${playersTotal}`);
