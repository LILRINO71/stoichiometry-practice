// Run: node test.js
// Recomputes everything with its own parser and atomic masses, then compares with the page's code.
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const core = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1];
const app = new Function(core + "; return { REACTIONS, makeProblem, molarMass, parseAnswer, amountOk, solve, sig3 };")();

const W = { H:1.008, C:12.011, N:14.007, O:15.999, Na:22.98977, Mg:24.305, Al:26.98154, P:30.97376,
  S:32.06, Cl:35.45, K:39.0983, Ca:40.078, Fe:55.845, Cu:63.546, Zn:65.38, Ag:107.8682 };

function count(formula) {
  // expand (XY)n groups, then count element by element
  let f = formula;
  while (f.includes("(")) f = f.replace(/\(([^()]*)\)(\d*)/, (_, inner, n) => inner.repeat(Number(n || 1)));
  const out = {};
  for (const [, el, n] of f.matchAll(/([A-Z][a-z]?)(\d*)/g)) out[el] = (out[el] || 0) + Number(n || 1);
  return out;
}
const mass = f => Object.entries(count(f)).reduce((s, [el, n]) => s + W[el] * n, 0);

// Published molar masses, g/mol
const known = { H2O:18.015, CO2:44.009, NaCl:58.44, H2SO4:98.07, "Ca(OH)2":74.09, "Cu(NO3)2":187.55,
  Fe2O3:159.69, P4O10:283.89, AgNO3:169.87, Na2SO4:142.04 };
for (const f in known) assert(Math.abs(app.molarMass(f) - known[f]) < 0.02, "molar mass " + f);

for (const [i, sides] of app.REACTIONS.entries()) {
  const totals = sides.map(side => {
    const t = {};
    for (const [c, f] of side) for (const [el, n] of Object.entries(count(f))) t[el] = (t[el] || 0) + c * n;
    return t;
  });
  assert.deepStrictEqual(totals[0], totals[1], "unbalanced reaction " + i);
  assert.strictEqual(sides[0].length, 2, "limiting problems need two reactants");
  for (const [, f] of sides.flat()) assert(Math.abs(app.molarMass(f) - mass(f)) < 0.01, "molar mass " + f);
}

// Seeded so a failure can be reproduced
let seed = 12345;
const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;

const N = 100000;
const seen = new Set();
for (let k = 0; k < N; k++) {
  const type = k % 2 ? "ratio" : "limiting";
  const p = app.makeProblem(type, rand);
  const [reactants, products] = app.REACTIONS[p.index];
  const all = reactants.concat(products);
  const coef = f => all.find(x => x[1] === f)[0];
  const moles = q => (q.unit === "g" ? q.value / mass(q.formula) : q.value);
  const info = JSON.stringify(p);

  for (const q of p.given) {
    assert(q.value > 0 && Number.isFinite(q.value), info);
    assert.strictEqual(q.coef, coef(q.formula), info);
  }
  assert.strictEqual(p.target.coef, coef(p.target.formula), info);

  const extents = p.given.map(q => moles(q) / coef(q.formula));
  if (type === "ratio") {
    assert.notStrictEqual(p.given[0].formula, p.target.formula, info);
  } else {
    assert.deepStrictEqual(p.given.map(q => q.formula), reactants.map(x => x[1]), info);
    assert(products.some(x => x[1] === p.target.formula), info);
    assert.strictEqual(p.limiting, extents[0] < extents[1] ? 0 : 1, info);
    assert(Math.max(...extents) / Math.min(...extents) > 1.1, "near tie " + info);
  }
  const n = Math.min(...extents) * coef(p.target.formula);
  const expected = p.target.unit === "g" ? n * mass(p.target.formula) : n;
  // the page rounds molar masses to 2 decimals (H2 = 2.02), at most about 0.2% off
  assert(Math.abs(p.answer - expected) / expected < 0.0025, "answer " + info);

  // checker: accepts the exact, independent and 3 s.f. answers; rejects wrong ones
  for (const v of [p.answer, expected, app.parseAnswer(app.sig3(p.answer))]) assert(app.amountOk(v, p.answer), "rejected " + v + " " + info);
  for (const v of [p.answer * 1.03, p.answer * 0.97, p.answer * 2, 0]) assert(!app.amountOk(v, p.answer), "accepted " + v + " " + info);

  const steps = app.solve(p);
  assert(steps.at(-1).startsWith(`Answer: ${app.sig3(p.answer)} ${p.target.unit}`), info);
  assert(!/NaN|undefined|Infinity/.test(steps.join(" ")), info);

  seen.add([p.index, type].join());
  seen.add([type, p.target.unit, ...p.given.map(q => q.unit)].join());
}
// every reaction in both types, and every mol/g combination
assert.strictEqual(seen.size, app.REACTIONS.length * 2 + 4 + 8);

for (const [text, v] of [["2.5", 2.5], [" .5 ", 0.5], ["3.", 3], ["1,25", 1.25], ["1.2e3", 1200]]) assert.strictEqual(app.parseAnswer(text), v, text);
for (const text of ["", "abc", "-2", "2 g", "1,000.5", "0x10", "Infinity"]) assert(Number.isNaN(app.parseAnswer(text)), text);

console.log(`OK: ${app.REACTIONS.length} equations balanced, ${N} random problems verified.`);
