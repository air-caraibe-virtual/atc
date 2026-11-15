// Croisière : vrais vols autour du joueur, recalage sur les données réelles, info trafic du Contrôle
const { AtcEngine, utils } = require('../src/engine.js');
const Traffic = require('../src/traffic.js');
const move = (p, b, m) => ({ lat: p.lat + Math.cos(b * Math.PI / 180) * m / 111120, lon: p.lon + Math.sin(b * Math.PI / 180) * m / (111120 * Math.cos(p.lat * Math.PI / 180)) });
const log = [];
const e = new AtcEngine({ lang: 'fr', onMessage: (m) => log.push(m) });
e.load({ callsign: 'AFR1511', cruise: 35000, dep: { icao: 'LFPO', city: 'Paris', rwy: '24', elev: 291, lat: 48.72, lon: 2.38 }, arr: { icao: 'LFMN', city: 'Nice', rwy: '04L', elev: 12, lat: 43.66, lon: 7.22 } });
e.jumpTo('CRUISE');
let player = { lat: 46.5, lon: 4.5 };
const tel = () => ({ connected: true, inFlight: true, ...player, alt: 35000, agl: 34000, ias: 280, gs: 460, vs: 0, hdg: 135, hdgTrue: 135, onGround: false });
// vrais vols : un en face au FL360 qui vient vers nous, un loin derrière, un au sol (ignoré), un très bas (ignoré)
let live = [
  { cs: 'EZY45KL', icao24: '400abc', ...move(player, 135, 30 * 1852), alt: 36000, onGround: false, kts: 450, track: 315, vs: 0 },
  { cs: 'DLH1093', icao24: '3c4b21', ...move(player, 300, 25 * 1852), alt: 37000, onGround: false, kts: 470, track: 140, vs: 0 },
  { cs: 'AFR22', icao24: '39aaaa', ...move(player, 90, 10 * 1852), alt: 300, onGround: true, kts: 0, track: 0, vs: 0 },
];
let now = 0, spawned = [];
const tr = new Traffic({ max: 8, io: { models: () => [{ title: 'FSLTL A20N easyJet', livery: 'FSLTL_A20N_EZY' }, { title: 'FSLTL A21N Lufthansa', livery: 'FSLTL_A21N_DLH' }], live: () => live,
  spawn: (id, t, l) => { spawned.push(t); return true; }, move: () => {}, remove: () => {}, radio: () => {}, radioBusy: () => false, connected: () => true } });
tr.setEnabled(true); e.traffic = tr;
(async () => {
  let minD = 99;
  for (let i = 0; i < 4 * 60 * 10; i++) {
    if (i % 10 === 0) await new Promise((r) => setImmediate(r));
    now += 100; player = move(player, 135, 460 * 0.514444 * 0.1);
    // les vrais vols avancent aussi
    live = live.map((f) => f.onGround ? f : { ...f, ...move(f, f.track, f.kts * 0.514444 * 0.1) });
    const t = tel();
    tr.tick(now, 0.1, e, {}, t, () => true);
    e.tick(now, t);
    if (e.pending) e.pilotAction('readback');
    const ez = tr.ai.find((a) => a.cs === 'EZY45KL'); if (ez) minD = Math.min(minD, utils.distNm(ez.pos, t));
  }
  const ez = tr.ai.find((a) => a.cs === 'EZY45KL'), real = live[0];
  console.log('créés :', spawned.join(' | '));
  console.log('avions en route :', tr.ai.map((a) => `${a.cs} FL${Math.round(a.alt / 100)}`).join(', '));
  console.log('distance mini avec EZY45KL :', minD.toFixed(1), 'NM', ez ? `| écart avec le vrai vol : ${Math.round(utils.distNm(ez.pos, real) * 1852)} m` : '');
  log.filter((m) => m.from !== 'system').forEach((m) => console.log(`[${m.from}] ${m.text}`));
})();
