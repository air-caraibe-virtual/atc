// Simulation : joueur (démo) au départ de TFFR + trafic IA issu de « vrais vols » fictifs
const { AtcEngine, utils } = require('../src/engine.js');
const Airport = require('../src/airport.js');
const Traffic = require('../src/traffic.js');
const DemoSim = require('../src/demo.js');
const fx = JSON.parse(JSON.stringify(require('./fixture-tffr.js')));
// quelques parkings de plus, reliés au taxilane
const base = { lat: 16.2653, lon: -61.5318 }, off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
[[-200, 0, 'K10'], [200, 0, 'K14'], [-400, 50, 'K8']].forEach(([x, y, r], i) => {
  const g = off(x, y); fx.elements.push({ type: 'node', id: 200 + i, tags: { aeroway: 'parking_position', ref: r }, ...g });
  const a = off(x, 150);
  fx.elements.push({ type: 'way', tags: { aeroway: 'taxilane' }, nodes: [300 + i, 400 + i], geometry: [g, a] });
  fx.elements.push({ type: 'way', tags: { aeroway: 'taxiway', ref: 'W' }, nodes: [400 + i, 2], geometry: [a, off(0, 150)] });
});
const L = Airport.parse(fx);
let rnd = 11; const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
const log = [];
const eng = new AtcEngine({ lang: 'fr', rand, onMessage: (m) => log.push(m), delay: [1500, 2500] });
const fl = { callsign: 'FWI512', cruise: 15000, sid: null,
  dep: { icao: 'TFFR', city: 'Pointe-à-Pitre', rwy: '12', elev: 36, lat: base.lat, lon: base.lon, metar: { rawOb: 'X', wdir: 120, wspd: 10, altim: 1015 } },
  arr: { icao: 'TFFF', city: 'Fort-de-France', rwy: '10', elev: 16, lat: 14.591, lon: -61.0032, metar: { rawOb: 'X', wdir: 100, wspd: 8, altim: 1014 } } };
/* pas de plan de vol */
const sim = new DemoSim(fl);
// vrais vols : une arrivée à 30 NM, deux avions au sol
const thr = Airport.threshold(L, '12');
const arrPos = (() => { const b = (utils.bearing(thr, thr.end) + 180) % 360; const R = 6371000, d = 30 * 1852 / R, br = b * Math.PI / 180, la = thr.lat * Math.PI / 180, lo = thr.lon * Math.PI / 180;
  const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br)); const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2)); return { lat: la2 * 180 / Math.PI, lon: lo2 * 180 / Math.PI }; })();
const live = [
  { cs: 'AFR792', icao24: '3965a1', ...arrPos, alt: 8000, onGround: false, kts: 260, track: utils.bearing(arrPos, thr), vs: -1200 },
  { cs: 'TVF3451', icao24: '39e4b2', ...off(-390, 40), alt: 30, onGround: true, kts: 8, track: 0, vs: 0 },
  { cs: 'AAL1442', icao24: 'a1b2c3', ...off(190, 10), alt: 30, onGround: true, kts: 0, track: 0, vs: 0 },
];
const spawned = []; const radio = [];
let now = 0;
const tr = new Traffic({ rand, max: 4, io: {
  models: () => [{ title: 'Airbus A320neo', livery: 'Air France' }, { title: 'Boeing 737-800', livery: 'Transavia' }, { title: 'Airbus A321', livery: 'American Airlines' }],
  live: () => live, spawn: (id, t, l, tail) => { spawned.push(`${id}:${t}/${l}/${tail}`); return true; }, move: () => {}, remove: () => {}, radio: (m) => radio.push(m), radioBusy: () => false,
} });
tr.setEnabled(true); eng.traffic = tr;

tr.home = { icao: 'TFFR', city: 'Pointe-à-Pitre', rwy: '12', elev: 36, lat: base.lat, lon: base.lon };
const timers = []; global.setTimeout = (fn, ms) => timers.push({ at: now + ms, fn });
const tel = { connected: true, lat: base.lat + 0.002, lon: base.lon + 0.002, alt: 36, agl: 0, onGround: true, gs: 0, hdg: 0 };
let maxN = 0, states = new Set();
(async () => {
  for (let i = 0; i < 6000; i++) {
    now += 200;
    tr.tick(now, 0.2, eng, { TFFR: L }, tel, () => true);
    await null;
    timers.filter((x) => x.at <= now).forEach((x) => { timers.splice(timers.indexOf(x), 1); x.fn(); });
    maxN = Math.max(maxN, tr.list().length); tr.list().forEach((a) => states.add(a.state));
  }
  console.log('sans plan de vol -> avions max', maxN, 'spawned', spawned.length, 'états', [...states].join(','), 'radio', radio.length);
  if (!maxN) process.exitCode = 1;
})();
