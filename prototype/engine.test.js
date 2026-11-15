// Run: node engine.test.js
const E = require('./engine.js');
const assert = require('assert');
const flow = (n, wc) => E.planStages(n, wc).map(s => (s.final ? 'GF' : s.entering + '>' + s.advancing) + (s.wcJoin ? '(+' + s.wcJoin + ')' : ''));

assert.deepStrictEqual(E.distribute(252).length, 21);
assert.deepStrictEqual(E.distribute(250).filter(n => n === 11).length, 2);
assert.ok(E.distribute(500).every(n => n <= 12));

assert.deepStrictEqual(flow(252, 6), ['252>168', '168>84', '84>42', '48>24(+6)', '24>12', 'GF']);
assert.deepStrictEqual(E.planStages(252, 6).map(s => s.sizes.length), [21, 14, 7, 4, 2, 1]);
assert.deepStrictEqual(flow(180, 6), ['180>120', '120>60', '60>30', '36>18(+6)', '18>12', 'GF']);
assert.deepStrictEqual(flow(252, 0), ['252>168', '168>84', '84>42', '42>24', '24>12', 'GF']);
[24, 96, 180, 230, 252, 300, 500, 1000].forEach(n => [0, 3, 6, 12].forEach(wc => {
  const st = E.planStages(n, wc), last = st[st.length - 1];
  assert.ok(last.final && last.entering === 12, n + '/' + wc + ' final has 12');
  assert.strictEqual(st.reduce((s, x) => s + x.wcJoin, 0), wc, n + '/' + wc + ' wild cards join once');
  st.forEach(s => assert.ok(s.sizes.every(z => z <= 12)));
}));

// Full groups of 12: slots are multiples of 12, and every stage of the format must divide into 12s.
assert.ok(E.slotsOk(252) && E.slotsOk(24) && !E.slotsOk(250) && !E.slotsOk(12) && !E.slotsOk('252.5'));
assert.deepStrictEqual(E.checkPlan(E.planStages(252, 6)), []);                         // standard: 252 → 168 → 84 → 42+6=48 → 24 → 12
assert.ok(E.checkPlan(E.planStages(252, 6, { top1: 6, topN: 6 }))[0].includes('126 teams for Stage 2'));   // 21 × 6 = 126
assert.ok(E.checkPlan(E.planStages(180, 6)).length > 0);                               // 60 → 30 → 36 → 18: not full groups
// Team-count bracket: the admin types how many teams enter each stage (multiples of 12); groups and qualifiers follow.
const sp = E.suggestPath(252, 12, 8, 6);
assert.deepStrictEqual(sp, { path: [168, 84, 48, 24, 12], wcStage: 3 });                // Standard with 12 Wild Cards joining Stage 4
assert.deepStrictEqual(E.checkPath(252, 12, sp.path, sp.wcStage), []);
const pp = E.planPath(252, 12, sp.path, sp.wcStage);
assert.deepStrictEqual(pp.map(s => [s.sizes.length, s.topN, s.extra]), [[21, 8, 0], [14, 6, 0], [7, 5, 1], [4, 6, 0], [2, 6, 0], [1, null, 0]]);
assert.strictEqual(pp[3].wcJoin, 12); assert.strictEqual(pp[2].advancing, 36);          // 36 qualify + 12 Wild Cards = 48
// Wild Cards are counted in teams like every stage: a multiple of 12, and the stage they join must have room for them.
assert.ok(E.checkPath(252, 6, sp.path, sp.wcStage).some(e => e.includes('multiple of 12')));
assert.deepStrictEqual(E.checkPath(252, 24, [168, 84, 48, 24, 12], 3), []);             // 24 Wild Cards + 24 qualifiers = 48
assert.ok(E.checkPath(252, 24, [168, 84, 48, 24, 12], 4).some(e => e.includes('only 24 teams')));
const odd = E.planPath(252, 0, [120, 60, 24, 12], 0);                                    // 120 from 21 groups: Top 5 + 15 best 6th places
assert.deepStrictEqual([odd[0].topN, odd[0].extra], [5, 15]);
assert.deepStrictEqual(E.checkPath(252, 0, [120, 60, 24, 12], 0), []);
assert.ok(E.checkPath(252, 0, [126, 60, 24, 12], 0)[0].includes('not a multiple of 12'));
assert.deepStrictEqual(E.checkPath(252, 0, [168, 84, 24], 0), []);                        // the admin may choose a 24-team final (2 groups)
assert.deepStrictEqual(E.planPath(252, 0, [168, 84, 24], 0)[3].sizes, [12, 12]);
// Matches per stage: each stage has its own number; without a list, one number for the stages and one for the final.
assert.deepStrictEqual(E.planPath(252, 0, [96, 36, 12], 0, { matchesList: [4, 6, 8, 10] }).map(s => s.matches), [4, 6, 8, 10]);
assert.deepStrictEqual(E.planPath(252, 0, [96, 36, 12], 0, { matches: 5, finalMatches: 9 }).map(s => s.matches), [5, 5, 5, 9]);
assert.deepStrictEqual(E.planPath(252, 0, [96, 36, 12], 0, { matchesList: [4, 0, 99], matches: 6 }).map(s => s.matches), [4, 6, 6, 12]);   // bad values fall back
// Stage names: the admin's names, or Stage N / Grand Final; only safe characters are kept.
assert.deepStrictEqual(E.planPath(252, 0, [96, 36, 12], 0, { names: ['Qualifiers', '', 'Semi Finals', 'Finals'] }).map(s => s.name), ['Qualifiers', 'Stage 2', 'Semi Finals', 'Finals']);
assert.strictEqual(E.cleanStageName('  <b>Quarter</b> "Finals" & more  '), 'bQuarter/b Finals more');
assert.strictEqual(E.cleanStageName('சுற்று 1 · Round-2 (A/B)'), 'சுற்று 1 Round-2 (A/B)');
assert.ok(E.checkPath(252, 0, [126, 12], 0, 0, ['Open', 'Last 126']).some(e => e.startsWith('Last 126:')));
// The admin picks the number of stages and the final's size; the counts in between are spread evenly.
assert.deepStrictEqual(E.spreadPath(252, 4, 12), [96, 36, 12]);
assert.deepStrictEqual(E.spreadPath(252, 3, 24), [72, 24]);
assert.strictEqual(E.spreadPath(252, 2, 12), null);                                         // 21 groups can't each send a team into 12 places
assert.deepStrictEqual(E.spreadPath(132, 2, 12), [12]);                                     // 11 groups → 12: fine
assert.strictEqual(E.spreadPath(36, 4, 12), null);                                          // 36 → ? → ? → 12 can't keep shrinking by 12
assert.deepStrictEqual(E.spreadPath(252, 5, 12, [168]), [168, 72, 24, 12]);                // keeps a fixed first count
[[252, 3], [252, 6], [504, 8], [96, 3], [48, 3], [132, 2]].forEach(([n, st]) => { const p = E.spreadPath(n, st, 12);
  assert.ok(p && p.length === st - 1 && !E.checkPath(n, 0, p, 0).length, n + ' in ' + st + ' stages: ' + p); });
assert.ok(E.checkPath(252, 0, [264, 12], 0)[0].includes('fewer than'));
assert.ok(E.checkPath(252, 0, [12], 0)[0].includes('fewer than the 21 groups'));
assert.ok(E.checkPath(252, 12, [168, 84, 48, 24, 12], 0).some(e => e.includes('Wild Cards join')));
[[24, 0], [96, 12], [252, 0], [252, 12], [504, 12], [1008, 24]].forEach(([n, wc]) => {         // every suggestion is valid
  const s = E.suggestPath(n, wc, 8, 6); assert.deepStrictEqual(E.checkPath(n, wc, s.path, s.wcStage), [], n + '/' + wc);
});

assert.strictEqual(E.matchPoints(2, 7), 16);
assert.strictEqual(E.matchPoints(12, 3), 3);
const st = E.standings(['a', 'b', 'c'], [
  { a: { place: 1, kills: 0 }, b: { place: 4, kills: 5 }, c: { place: 2, kills: 0 } }, // a 12, b 12, c 9
]);
assert.deepStrictEqual(st.map(r => r.teamId), ['a', 'b', 'c']); // a wins tie on Booyahs

const ok = { name: 'Team Thunder', players: [1, 2, 3, 4].map(i => ({ name: 'P' + i, mobile: '987654321' + i, email: 'p' + i + '@x.in', uid: '51234567' + i })) };
assert.deepStrictEqual(E.validateTeam(ok, [], []), []);
assert.ok(E.validateTeam(ok, [{ uid: '512345671', mobile: '9000000000' }], []).some(e => e.includes('already in another team')));
assert.ok(E.validateTeam(ok, [], ['team thunder']).includes('Team name already taken'));

const g = E.snakeAllocate([...Array(48).keys()], E.distribute(48));
assert.deepStrictEqual(g.map(x => x.length), [12, 12, 12, 12]);
;

// OCR result validation
const gt = [1, 2].map(k => ({ id: 't' + k, name: 'T' + k, players: [1, 2, 3, 4].map(i => ({ uid: k + '00' + i, name: 'P' + k + i })) }));
const blk = (rank, k, over = {}) => ({ rank, teamId: 't' + k, players: [1, 2, 3, 4].map(i => ({ uid: k + '00' + i, name: 'P' + k + i, kills: i, exact: true })), ...over });
assert.deepStrictEqual(E.validateOcrResult([blk(1, 1), blk(2, 2)], gt).errors, []);
assert.ok(E.validateOcrResult([blk(1, 1), blk(1, 2)], gt).errors.some(e => e.includes('used twice')));
const dup = blk(2, 2); dup.players[1].uid = '2001';
assert.ok(E.validateOcrResult([blk(1, 1), dup], gt).errors.some(e => e.includes('listed twice')));
const neg = blk(2, 2); neg.players[0].kills = -1;
assert.ok(E.validateOcrResult([blk(1, 1), neg], gt).errors.some(e => e.includes('0 or more')));
const unsure = blk(2, 2); unsure.players[0].exact = false;
assert.ok(E.validateOcrResult([blk(1, 1), unsure], gt).errors.some(e => e.includes('Verified')));
unsure.players[0].ok = true; assert.deepStrictEqual(E.validateOcrResult([blk(1, 1), unsure], gt).errors, []);
const reread = blk(2, 2); reread.players[0].killsCheck = true;
assert.ok(E.validateOcrResult([blk(1, 1), reread], gt).errors.some(e => e.includes('eliminations were re-read')));
reread.players[0].ok = true; assert.deepStrictEqual(E.validateOcrResult([blk(1, 1), reread], gt).errors, []);
const short = blk(2, 2); short.players.pop();
assert.ok(E.validateOcrResult([blk(1, 1), short], gt).errors.some(e => e.includes('fewer than 4')));
short.shortOk = true; assert.deepStrictEqual(E.validateOcrResult([blk(1, 1), short], gt).errors, []);
assert.ok(E.validateOcrResult([blk(1, 1)], gt).warnings.some(w => w.includes('no-show')));
const cross = blk(2, 2); cross.players[0].otherTeam = 'Team One'; cross.players[0].read = 'P1a';
assert.ok(E.validateOcrResult([blk(1, 1), cross], gt).errors.some(e => e.includes('registered for Team One')));
const ps = E.playerStandings([{ t1: { players: [{ uid: 'a', name: 'A', kills: 3 }] } }, { t1: { players: [{ uid: 'a', name: 'A', kills: 5 }] } }]);
assert.strictEqual(ps[0].kills, 8); assert.strictEqual(ps[0].best, 5); assert.strictEqual(ps[0].matches, 2);
// Screenshot names vs registered names: look-alike letters, OCR mix-ups and the team's clan tag
assert.strictEqual(E.foldName('ᑌD ᴋᴜᴛᴛʏ ☣'), 'udkutty');
assert.strictEqual(E.foldName('KN.Dev!l⁰⁷'), 'kndeviio7');                          // ! and l fold to i, ⁰ to o, ⁷ to 7
assert.strictEqual(E.foldName('Ⓞ𝐁𝐈𝐓𝐎♡'), 'obito');
assert.strictEqual(E.foldName('TN_LEGEND✓'), 'tniegend');
const team1 = [{ uid: '1', name: 'ᑌD ᴋᴜᴛᴛʏ ☣' }, { uid: '2', name: 'ᑌD ᴊᴀᴄᴋ ☣' }, { uid: '3', name: 'ᑌD ʀɪᴛʜɪᴄᴋ ☣' }, { uid: '4', name: 'ᑌD ʜɪᴛʟᴇʀ ☣' }];
assert.strictEqual(E.teamTag(team1.map(p => p.name)), 'ud');
assert.deepStrictEqual(['KUTTY', 'SD JACK', 'RITHICK', 'JD HITLER'].map(r => { const m = E.matchName(r, team1); return m.how + ':' + m.player.uid; }), ['tag:1', 'tag:2', 'tag:3', 'tag:4']);
assert.strictEqual(E.matchName('ᑌD ᴋᴜᴛᴛʏ ☣', team1).how, 'exact');
assert.strictEqual(E.matchName('UD KUTTY', team1).how, 'lookalike');
const team2 = [{ uid: 'a', name: 'TONY' }, { uid: 'b', name: 'TN_LEGEND✓⁘' }, { uid: 'c', name: 'TOJI' }, { uid: 'd', name: 'The_ᴡɪᴛᴄʜᴇʀ♡' }];
assert.deepStrictEqual(['TONY', 'TN_LEGEND√', 'TOJI', 'The_WITCHER'].map(r => E.matchName(r, team2).player.uid), ['a', 'b', 'c', 'd']);
assert.ok(['lookalike', 'exact'].includes(E.matchName('The_WITCHER', team2).how));
const team3 = [{ uid: 'x', name: 'ᗩJAY' }, { uid: 'y', name: 'BABAYAGAAA' }, { uid: 'z', name: 'JERRY' }, { uid: 'w', name: 'Kutty' }];
assert.strictEqual(E.matchName('SJAY', team3).how, 'suggest');                       // a real misread is never linked on its own
assert.strictEqual(E.matchName('SJAY', team3).player.uid, 'x');
const twins = [{ uid: 'p', name: 'RK VIJAY' }, { uid: 'q', name: 'RK VIJAI' }, { uid: 'r', name: 'RK CHUTTI' }, { uid: 's', name: 'NKG.alpha07' }];
assert.notStrictEqual(E.matchName('RK VIJA', twins).how, 'tag');                    // two teammates could fit: no auto-link
assert.strictEqual(E.matchName('', team1).how, null);
// decorations at either end, √ as V only before a letter
assert.strictEqual(E.foldName('√J Lᴏʀᴅ'), 'vjiord'); assert.strictEqual(E.foldName('TN_LEGEND✓'), E.foldName('TN_LEGEND√'));
const team4 = [{ uid: 'v1', name: '√J Lᴏʀᴅ !!' }, { uid: 'v2', name: '√J Sᴘɪᴅʏ 모' }, { uid: 'v3', name: '⚠ NOBITA !!' }, { uid: 'v4', name: '√J Sᴘᴇᴇᴅ 모' }];
assert.strictEqual(E.teamTag(team4.map(p => p.name)), 'vj');
assert.deepStrictEqual(['VJ LORD', 'VJ SPIDY', '4 NOBITA', 'VJ SPEED'].map(r => E.matchName(r, team4).player.uid), ['v1', 'v2', 'v3', 'v4']);
assert.ok(['VJ LORD', 'VJ SPIDY', '4 NOBITA', 'VJ SPEED'].every(r => E.matchName(r, team4).how !== 'suggest'));
assert.strictEqual(E.matchName('RES.TOXIC', [{ uid: 't', name: 'RES.TOXIC¹²' }, { uid: 'u', name: 'RES.SABUJ07' }]).how, 'lookalike');

// Team found from its players; the same name in two teams is settled by the teammates
const T = (id, names) => ({ id, name: id, players: names.map((n, i) => ({ uid: id + i, name: n })) });
const udA = T('udA', ['ᑌD ᴋᴜᴛᴛʏ ☣', 'ᑌD ᴊᴀᴄᴋ ☣', 'ᑌD ʀɪᴛʜɪᴄᴋ', 'ᑌD ʜɪᴛʟᴇʀ']);
const udB = T('udB', ['ᑌD ʏᴀꜱʜ', 'ᑌD ᴅᴀɴɴʏ', 'ᑌD ᴊᴀᴄᴋ ☣', 'ᑌD ʀᴇx']);       // "ᑌD JACK" is registered in both
const tony = T('tony', ['TONY', 'TN_LEGEND✓', 'TOJI', 'The_ᴡɪᴛᴄʜᴇʀ♡']);
const rd = rs => rs.map(r => [r]);
const tm = E.teamMatch(rd(['KUTTY', 'SD JACK', 'RITHICK', 'JD HITLER']), udA.players);
assert.strictEqual(tm.linked, 4); assert.strictEqual(new Set(tm.pairs.map(p => p.uid)).size, 4);
const asg = E.assignTeams([rd(['JD YASH', 'DANNY', 'SD JACK', 'REX']), rd(['TONY', 'TN_LEGEND√', 'TOJI', 'The_WITCHER']), rd(['KUTTY', 'SD JACK', 'RITHICK', 'JD HITLER'])], [udA, udB, tony]);
assert.deepStrictEqual(asg.map(a => a.teamId), ['udB', 'tony', 'udA']);
assert.ok(asg.every(a => a.sure));
assert.strictEqual(asg[0].pairs[2].uid, 'udB2');                                     // that JACK is udB's, not udA's
assert.deepStrictEqual(E.nameMatches(['UD JACK'], [udA, udB, tony]).map(x => x.teamId).sort(), ['udA', 'udB']);
assert.deepStrictEqual(E.nameMatches(['JACK'], [udA, udB, tony]).map(x => x.teamId).sort(), ['udA', 'udB']);   // tag dropped
assert.deepStrictEqual(E.nameMatches(['32 -SUBASH'], [T('bz2', ['BZ சரண்', 'BZ தமிழ்', 'BZ ~SUBASH', 'BZ Sᴘᴇᴇᴅ'])]).length, 1);   // tag read as digits
const pro = T('pro', ['ProVijay', 'ProRavi', 'ProArun', 'ProKarthik']);
assert.deepStrictEqual(E.nameMatches(['RK VIJAY'], [pro]), []);                      // one letter off a tag: not "the same name"
assert.deepStrictEqual(E.sameNames([udA, udB, tony]).map(l => l.map(x => x.teamId).join('+')), ['udA+udB']);
const twoReadsOnePlayer = E.teamMatch(rd(['TONY', 'TONY']), tony.players);
assert.strictEqual(twoReadsOnePlayer.linked, 1);                                     // one registered player is never used twice
assert.strictEqual(E.assignTeams([rd(['nobody', 'here'])], [udA, tony])[0].teamId, '');
// another team's player with a different prefix is not "the same name"
const thx = T('thx', ['THxRavi', 'THxArun', 'THxKarthik', 'THxVijay']);
assert.notStrictEqual(E.matchName('RK VIJAY', thx.players).how, 'tag');
assert.deepStrictEqual(E.nameMatches(['RK VIJAY'], [thx]), []);
assert.deepStrictEqual(E.nameMatches(['VIJAY'], [thx]).map(x => x.name), ['THxVijay']);   // only the tag dropped: that IS the same name
const bz = T('bz', ['BZ சரண்', 'BZ தமிழ்', 'BZ ~SUBASH', 'BZ Sᴘᴇᴇᴅ']), tvk = T('tvk', ['TVK.Johnwick', 'TVK.JACK15', 'TVK.Shadow8!', 'TVK.SENSEI']);
assert.strictEqual(E.matchName('32 -SUBASH', bz.players).how, 'tag');                 // tag BZ read as "32"
assert.strictEqual(E.matchName('6MK.SENSEI', tvk.players).how, 'tag');               // tag TVK read as "6MK"

console.log('All engine tests passed');

// Roadmap templates
{
const T = E.TEMPLATES, wcOf = k => E.tplPlan(T[k]).map(r => r.wcIn);
assert.deepStrictEqual(wcOf('rbz'), [0, 38, 6, 0, 0]);
assert.deepStrictEqual(wcOf('winter'), [0, 0, 48, 0, 3, 2]);
assert.deepStrictEqual(wcOf('tvk'), [0, 0, 12, 0, 0, 0]);
assert.deepStrictEqual(E.tplPlan(T.rbz).map(r => r.topN), [2, 3, 9, 4, null]);
assert.deepStrictEqual(E.tplPlan(T.rbz).map(r => r.units), [17, 6, 2, 3, 1]);
['rbz', 'winter', 'tvk'].forEach(k => assert.deepStrictEqual(E.checkTemplate(T[k]), [], k));
assert.ok(E.checkTemplate(T.rbz, { s4: { total: 20 } }).some(e => e.includes('3 groups')));
assert.ok(E.checkTemplate(T.rbz, { s2: { qualified: 72 } }).some(e => e.includes('fewer than')));
assert.ok(E.checkTemplate(T.winter, { ud2: { qualified: 11 }, wc2: { qualified: 10 } }).some(e => e.includes('qualify into it')));
assert.ok(E.checkTemplate(T.tvk, { cs: { total: 11 } }).some(e => e.includes('even number')));
assert.ok(E.checkTemplate(T.rbz, { s1: { qualified: 10 } }).some(e => e.includes('each of its 17 groups')));
assert.deepStrictEqual(E.checkTemplate(T.rbz, { s4: { total: 20 } }, new Set(['s4'])).filter(e => e.startsWith('Group Stage')), []);
assert.deepStrictEqual(E.tplPlan(T.rbz, { s1: { total: 240, qualified: 40 } }).slice(0, 2).map(r => [r.entering, r.units, r.topN, r.extra, r.wcIn]), [[240, 20, 2, 0, 0], [72, 6, 3, 0, 32]]);
assert.deepStrictEqual(E.pairLobbies(3), [[0, 1], [1, 2], [0, 2]]);
assert.deepStrictEqual(E.tierAllocate([1, 2, 3, 4, 5, 6], 3), [[1, 2], [3, 4], [5, 6]]);
assert.deepStrictEqual(E.pairsAllocate([[1], [2], [3], [4]], [[0, 1], [2, 3]]), [[1, 2], [3, 4]]);
// pool standings from paired lobbies count only that pool's teams
const lobbyAB = { a1: { place: 1, kills: 2 }, b1: { place: 2, kills: 0 } }, lobbyAC = { a1: { place: 3, kills: 1 }, c1: { place: 1, kills: 5 } };
const poolA = E.standings(['a1'], [lobbyAB, lobbyAC]);
assert.deepStrictEqual([poolA.length, poolA[0].played, poolA[0].points], [1, 2, 12 + 2 + 8 + 1]);
assert.deepStrictEqual(E.qualifyFromUnits([[{ teamId: 'x', points: 9 }, { teamId: 'y', points: 5 }], [{ teamId: 'z', points: 7 }, { teamId: 'w', points: 6 }]], 3), ['x', 'z', 'w']);
// ClashSquad
assert.ok(E.csGame({ a: { rounds: 4 }, b: { rounds: 4 } }, ['a', 'b']).errors.length);
assert.ok(E.csGame({ a: { rounds: 3 }, b: { rounds: 2 } }, ['a', 'b']).errors.length);
assert.strictEqual(E.csGame({ a: { rounds: 2 }, b: { rounds: 4 } }, ['a', 'b']).winner, 'b');
const g = (ra, rb) => ({ a: { rounds: ra }, b: { rounds: rb } });
assert.strictEqual(E.csTie(['a', 'b'], [g(4, 1), g(2, 4), g(4, 3)], 5).decided, false);
assert.strictEqual(E.csTie(['a', 'b'], [g(4, 1), g(2, 4), g(4, 3), g(4, 0)], 5).winner, 'a');
assert.deepStrictEqual(E.csRows(['a', 'b'], [g(1, 4)], 1).map(r => r.teamId), ['b', 'a']);
// a running (generated, not finished) stage still checks its Qualified number
assert.ok(E.checkTemplate(T.rbz, { s1: { qualified: 0 } }, new Set(['s1'])).some(e => e.includes('Open Qualifiers')));
assert.deepStrictEqual(E.checkTemplate(T.rbz, { s1: { qualified: 0 } }, new Set(['s1']), new Set(['s1'])).filter(e => e.startsWith('Open')), []);
// two teams with near-identical names in one lobby: exact names decide (RaviOp vs RaviOp2)
{ const tA = { id: 'A', players: ['RaviOp', 'ArunOp', 'KarthiOp', 'VijayOp'].map((n, i) => ({ uid: 'a' + i, name: n })) }, tB = { id: 'B', players: ['RaviOp2', 'ArunOp2', 'KarthiOp2', 'VijayOp2'].map((n, i) => ({ uid: 'b' + i, name: n })) };
  for (let k = 0; k < 2; k++) { const blocks = k ? [tB, tA] : [tA, tB]; const res = E.assignTeams(blocks.map(t => t.players.map(p => [p.name])), [tB, tA]);
    assert.deepStrictEqual(res.map(r => r.teamId), blocks.map(t => t.id)); } }
console.log('Template tests passed');
}

