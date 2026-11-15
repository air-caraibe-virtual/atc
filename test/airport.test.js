const A = require('../src/airport.js');
// petit aéroport fictif : parking P -> taxiway W -> taxiway M -> point d'arrêt piste 24 (seuil à l'est)
const base = { lat: 48.72, lon: 2.37 }, off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
const node = (id, dx, dy) => ({ id, ...off(dx, dy) });
const N = { p: node(1, 0, -300), a: node(2, 0, -150), b: node(3, 0, 0), c: node(4, 800, 0), d: node(5, 1600, 0), h: node(6, 1600, 120), e: node(7, 1600, 200) };
const way = (tags, ns) => ({ type: 'way', tags, nodes: ns.map((n) => n.id), geometry: ns.map((n) => ({ lat: n.lat, lon: n.lon })) });
const json = { elements: [
  way({ aeroway: 'taxilane' }, [N.p, N.a]),
  way({ aeroway: 'taxiway', ref: 'W' }, [N.a, N.b]),
  way({ aeroway: 'taxiway', ref: 'M' }, [N.b, N.c, N.d]),
  way({ aeroway: 'taxiway', ref: 'M1' }, [N.d, N.h]),
  { type: 'way', tags: { aeroway: 'runway', ref: '06/24' }, geometry: [off(-1500, 250), off(1650, 250)].map((x) => ({ lat: x.lat, lon: x.lon })) },
  { type: 'node', id: 6, tags: { aeroway: 'holding_position', ref: 'M1' }, lat: N.h.lat, lon: N.h.lon },
  { type: 'node', id: 99, tags: { aeroway: 'parking_position', ref: 'K12' }, lat: N.p.lat, lon: N.p.lon },
] };
const L = A.parse(json);
console.log('runways', L.runways.length, 'taxiways', L.taxiways.length, 'holds', L.holds.length, 'gates', L.gates.length);
console.log('seuil 24 :', JSON.stringify(A.threshold(L, '24') && A.threshold(L, '24').ref), 'est ?', A.threshold(L, '24').lon > base.lon);
const r = A.taxiToRunway(L, N.p, '24');
console.log('via', r.via.join(', '), '| hold', r.hold, '| len', r.len, 'm |', r.pts.length, 'pts');
