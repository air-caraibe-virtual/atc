global.self = { ATC: require('../src/engine.js') };
require('../src/map.js'); const rwyEnds = self.MapView._rwyEnds;
const base = { lat: 48.72, lon: 2.37 }, off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
const dir = (h, L) => off(Math.sin(h * Math.PI / 180) * L, Math.cos(h * Math.PI / 180) * L);
for (const [ref, h] of [['06/24', 62], ['', 62], ['0', 240], ['02L/20R', 20], ['6', 62], ['26R/08L', 82]]) {
  console.log(JSON.stringify(ref).padEnd(10), '->', rwyEnds(ref, off(0, 0), dir(h, 3000)).map((x) => x.name).join(' / '));
}
const A = require('../src/airport.js');
const L = A.parse({ elements: [{ type: 'way', tags: { aeroway: 'taxiway', name: 'W47 Holding bay' }, nodes: [1, 2], geometry: [{ lat: 1, lon: 1 }, { lat: 1.001, lon: 1 }] }, { type: 'way', tags: { aeroway: 'taxiway', ref: 'W2;W3' }, nodes: [3, 4], geometry: [{ lat: 1, lon: 1 }, { lat: 1.001, lon: 1 }] }] });
console.log('taxiways :', L.taxiways.map((t) => t.ref).join(', '));
