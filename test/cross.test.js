// Roulage qui traverse une piste : instruction « maintenez avant », traversée, incursion
const { AtcEngine } = require('../src/engine.js');
const Airport = require('../src/airport.js');
const base = { lat: 48.72, lon: 2.37 }, off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
const way = (id0, tags, pts) => ({ type: 'way', tags, nodes: pts.map((_, i) => id0 + i), geometry: pts });
// parking (0,0) → W vers l'est, coupe la piste 02/20 (axe nord-sud en x=500), puis point d'arrêt piste 24 (piste est-ouest au nord)
const L = Airport.parse({ elements: [
  way(1, { aeroway: 'taxiway', ref: 'W' }, [off(0, 0), off(250, 0), off(500, 0), off(750, 0), off(1000, 0)]),
  way(5, { aeroway: 'taxiway', ref: 'W5' }, [off(1000, 0), off(1000, 300)]),
  { type: 'way', tags: { aeroway: 'runway', ref: '02/20' }, geometry: [off(500 - 300 * 0.34, -1500), off(500 + 300 * 0.34, 1500)] },
  { type: 'way', tags: { aeroway: 'runway', ref: '09/27' }, geometry: [off(-2000, 400), off(1100, 400)] },
  { type: 'node', id: 6, tags: { aeroway: 'holding_position', ref: 'W5' }, ...off(1000, 300) },
] });
const r = Airport.taxiToRunway(L, off(0, 0), '27');
console.log('itinéraire via', r.via.join(', '), '| traversées', JSON.stringify(r.crossings));
const log = []; let now = 0;
const e = new AtcEngine({ lang: 'fr', onMessage: (m) => log.push(m) });
e.load({ callsign: 'AFR1511', cruise: 35000, dep: { icao: 'LFPO', city: 'Paris', rwy: '27', elev: 291, ...base }, arr: { icao: 'LFMN', city: 'Nice', rwy: '04L', elev: 12, lat: 43.66, lon: 7.22 } });
e.flight.dep.taxiVia = r.via; e.flight.dep.crossings = r.crossings; e.flight.dep.rwyStrip = '09/27';
const tick = (tel, n = 3) => { for (let i = 0; i < n; i++) { now += 3000; e.tick(now, tel); if (e.pending) e.pilotAction('readback'); } };
const at = (x, y) => ({ connected: true, inFlight: true, ...off(x, y), alt: 291, onGround: true, gs: 10, ias: 0, hdg: 90, hdgTrue: 90 });
e.phase = 'STARTUP'; e.station = e._st('GND', 'dep');
e.pilotAction('req_taxi'); tick(at(0, 0));
const ground = (x) => { const p = off(x, 0); e.ground = { onRunway: Airport.runwayAt(L, p), ahead: (() => { for (let d = 20; d <= 260; d += 20) { const q = off(x + d, 0); const ref = Airport.runwayAt(L, q); if (ref && ref !== Airport.runwayAt(L, p)) return { ref, dist: d }; } return null; })() }; };
ground(350); console.log('actions avant la piste :', e.actions().map((a) => a.label).join(' / '));
e.pilotAction('cross_req'); tick(at(350, 0));
ground(500); tick(at(500, 0));
// second vol : entre sur la piste sans autorisation
const e2 = new AtcEngine({ lang: 'fr', onMessage: (m) => log.push({ ...m, text: '[vol 2] ' + m.text }) });
e2.load({ callsign: 'AFR22', cruise: 35000, dep: { icao: 'LFPO', city: 'Paris', rwy: '27', elev: 291, ...base }, arr: { icao: 'LFMN', city: 'Nice', rwy: '04L', elev: 12, lat: 43.66, lon: 7.22 } });
e2.phase = 'TAXI_OUT'; e2.station = e2._st('GND', 'dep'); e2.ground = { onRunway: '02/20', ahead: null };
now += 3000; e2.tick(now, at(500, 0)); now += 4000; e2.tick(now, at(500, 0));
log.filter((m) => m.from !== 'system').forEach((m) => console.log(`[${m.from}] ${m.text}`));
