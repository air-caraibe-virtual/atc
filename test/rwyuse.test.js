global.self = { ATC: require('../src/engine.js') };
require('../src/map.js'); const rwyEnds = self.MapView._rwyEnds;
const R = require('../src/rwyuse.js'), A = require('../src/airport.js');
console.log(JSON.stringify(R.parseAtis('JFK ATIS INFO B 1451Z. 23015KT 10SM. ILS RWY 22L APCH IN USE, VISUAL APCH RWY 22R. DEPG RWY 22R, 31L. NOTAMS...')));
console.log(JSON.stringify(R.parseAtis('LAX ATIS. SIMUL APCHS IN USE. LDG RWYS 24R AND 25L. DEPG RWYS 24L AND 25R.')));
// Plan type Roissy : deux pistes parallèles 08L/26R (nord) et 08R/26L (sud), configuration face à l'ouest
const B = { lat: 49.0, lon: 2.55 }, off = (dx, dy) => ({ lat: B.lat + dy / 111120, lon: B.lon + dx / (111120 * Math.cos(B.lat * Math.PI / 180)) });
const dir = (p, h, m) => ({ lat: p.lat + Math.cos(h * Math.PI / 180) * m / 111120, lon: p.lon + Math.sin(h * Math.PI / 180) * m / (111120 * Math.cos(p.lat * Math.PI / 180)) });
const nW = off(-2000, 600), nE = dir(nW, 85, 4000), sW = off(-2000, -600), sE = dir(sW, 85, 4000);
const L = A.parse({ elements: [
  { type: 'way', tags: { aeroway: 'runway', ref: '08L/26R' }, geometry: [nW, nE] },
  { type: 'way', tags: { aeroway: 'runway', ref: '08R/26L' }, geometry: [sW, sE] },
] });
// arrivées sur 26L (sud, venant de l'est), départs sur 26R (nord, vers l'ouest)
const live = [
  { cs: 'A1', ...dir(sE, 85, 8 * 1852), alt: 2900, onGround: false, kts: 150, track: 265, vs: -700 },
  { cs: 'A2', ...dir(sE, 85, 13 * 1852), alt: 4300, onGround: false, kts: 170, track: 265, vs: -700 },
  { cs: 'D1', ...dir(nW, 265, 3 * 1852), alt: 2500, onGround: false, kts: 180, track: 265, vs: 2200 },
  { cs: 'D2', ...dir(nE, 265, 1500), alt: 400, onGround: true, kts: 120, track: 265, vs: 0 },
  { cs: 'X', ...off(0, 5000), alt: 30000, onGround: false, kts: 450, track: 265, vs: 0 },
];
const r = R.complete(R.fromLive(L, live, 392, rwyEnds), L, rwyEnds);
console.log('déduit :', JSON.stringify(r));
