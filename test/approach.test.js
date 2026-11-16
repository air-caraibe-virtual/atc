// Choix de la meilleure approche selon la piste
const { AtcEngine } = require('../src/engine.js');
const e = new AtcEngine();
const mk = (rwy, approaches) => ({ callsign: 'AFR512', cruise: 15000, dep: { icao: 'TFFR', city: 'A', rwy: '04R', elev: 36, lat: 16.26, lon: -61.53, metar: { rawOb: 'X', wdir: 40, wspd: 8, altim: 1015 } }, arr: { icao: 'TFFF', city: 'B', rwy, elev: 16, lat: 14.59, lon: -61.0, approaches, metar: { rawOb: 'X', wdir: 100, wspd: 8, altim: 1014 } } });
const cases = [
  ['10', undefined, 'ILS'],
  ['10', [{ rwy: '10', kind: 'ILS' }, { rwy: '10', kind: 'RNAV' }], 'ILS'],
  ['10', [{ rwy: '10', kind: 'RNAV' }, { rwy: '10', kind: 'VOR' }], 'RNAV'],
  ['28', [{ rwy: '28', kind: 'VOR' }, { rwy: '10', kind: 'ILS' }], 'VOR'],
  ['04R', [{ rwy: '04R', kind: 'LOC' }, { rwy: '04R', kind: 'NDB' }], 'LOC'],
  ['22', [{ rwy: '04', kind: 'ILS' }], 'VIS'],
  ['04R', [{ rwy: '04', kind: 'RNAV' }], 'RNAV'],
];
let bad = 0;
for (const [rwy, ap, want] of cases) { e.load(mk(rwy, ap)); const k = e.apKind(); if (k !== want) { bad++; console.log('KO', rwy, JSON.stringify(ap), k, '≠', want); } }
e.load(mk('10', [{ rwy: '10', kind: 'RNAV' }, { rwy: '10', kind: 'VOR' }]));
console.log(e.approachAdvice());
e.uiLang = 'en'; console.log(e.approachAdvice());
for (const l of ['fr', 'en', 'es', 'de']) { e.lang = l; const a = e.apWord(); console.log(l, e.T(`approche ${a.fr} piste`, `${a.en} approach runway`)); }
console.log(bad ? 'ÉCHEC' : 'OK');
process.exit(bad ? 1 : 0);
