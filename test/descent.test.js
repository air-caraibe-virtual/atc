// Descente par paliers jusqu'à l'approche (simulation complète)
const { AtcEngine } = require('../src/engine.js');
const DemoSim = require('../src/demo.js');
const fl = { callsign: 'FWI512', cruise: 35000, sid: null,
  dep: { icao: 'TFFR', city: 'Pointe-à-Pitre', rwy: '12', elev: 36, lat: 16.2653, lon: -61.5318, ta: 5000, tl: 6000, metar: { rawOb: 'X 9999', wdir: 90, wspd: 12, altim: 1015, temp: 28, dewp: 22 } },
  arr: { icao: 'LFPG', city: 'Paris', rwy: '27L', elev: 392, lat: 49.0097, lon: 2.5479, ta: 4000, tl: 5000, approaches: [{ rwy: '27L', kind: 'ILS' }], metar: { rawOb: 'X 9999', wdir: 250, wspd: 8, altim: 1021, temp: 8, dewp: 6 } }, steps: [] };
const log = []; let seed = 3; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const e = new AtcEngine({ lang: 'fr', rand, onMessage: (m) => log.push(m) }); e.load(fl); const sim = new DemoSim(fl);
let t = 0, last = 0, maxPhase = '';
for (let i = 0; i < 300000 && e.phase !== 'DONE'; i++) {
  t += 1000; const tel = sim.step(['CRUISE', 'CLIMB'].includes(e.phase) ? 20 : 1, e); e.tick(t, tel);
  const acts = e.actions();
  if (acts.length && t - last > 4000) { const a = acts.find((x) => x.primary) || acts.find((x) => x.id === 'req_descent'); if (a) { e.pilotAction(a.id); last = t; } }
}
console.log('fin:', e.phase);
log.filter((m) => /descend|maintenez|Approche conseillée|Paliers/.test(m.text) && /descendez|maintenez|conseillée/.test(m.text)).forEach((m) => console.log(`[${m.from}] ${m.text}`));
