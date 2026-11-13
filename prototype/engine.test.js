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
console.log('All engine tests passed');
