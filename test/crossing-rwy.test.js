// Le joueur roule après l'atterrissage sur la 24 ; un avion IA attend pour décoller de la 02/20 qui la croise
const Traffic = require('../src/traffic.js');
const Airport = require('../src/airport.js');
const { AtcEngine } = require('../src/engine.js');
const B = { lat: 48.72, lon: 2.37 }, off = (dx, dy) => ({ lat: B.lat + dy / 111120, lon: B.lon + dx / (111120 * Math.cos(B.lat * Math.PI / 180)) });
const L = Airport.parse({ elements: [
  { type: 'way', tags: { aeroway: 'runway', ref: '06/24' }, geometry: [off(-1500, -600), off(1500, 600)] },   // ~ est-nord-est
  { type: 'way', tags: { aeroway: 'runway', ref: '02/20' }, geometry: [off(-300, -1500), off(300, 1500)] },   // ~ nord-sud, croise la 06/24
  { type: 'way', tags: { aeroway: 'runway', ref: '07L/25R' }, geometry: [off(-1500, 2600), off(1500, 3800)] }, // parallèle, 2,5 km au nord
] });
const run = (aiRunway, label) => {
  const e = new AtcEngine({ lang: 'fr', onMessage: () => {} });
  e.load({ callsign: 'AFR1511', cruise: 35000, dep: { icao: 'LFMN', city: 'Nice', rwy: '04', elev: 12, lat: 43.66, lon: 7.22 }, arr: { icao: 'LFPO', city: 'Orly', rwy: '24', elev: 291, ...B } });
  e.phase = 'LANDING'; e.flags.waitDep = false;
  const tr = new Traffic({ io: { models: () => [], live: () => null, spawn: () => true, move: () => {}, remove: () => {}, radio: () => {}, radioBusy: () => false } });
  tr.enabled = true; tr.engine = e;
  const geo = (n) => { const th = Airport.threshold(L, n); const { bearing } = require('../src/engine.js').utils; return { name: n, th, end: th.end, hdg: bearing(th, th.end), strip: th.ref }; };
  tr.ctx = { side: 'arr', a: { icao: 'LFPO', rwy: '24' }, L, P: geo('24'), D: geo(aiRunway), A: geo('24'), elev: 291 };
  const ai = { id: 1, kind: 'dep', cs: 'TVF3451', state: 'hold', holdSince: 0, pos: off(0, -1600), hdg: 10, onGround: true };
  tr.ai = [ai];
  let cleared = null;
  // le joueur roule sur la 24 d'est en ouest pendant 50 s, puis dégage vers le sud
  for (let s = 0; s <= 90; s++) {
    tr.now = s * 1000;
    const onRwy = s <= 50;
    const p = onRwy ? off(1300 - s * 40, 520 - s * 16) : off(-700, 300 - (s - 50) * 10 - 100);
    tr.tel = { ...p, onGround: true, alt: 291, hdgTrue: 248 };
    tr.request = (a, what) => { if (what === 'takeoff' && cleared == null) cleared = s; a.state = 'cleared_to'; };
    tr.control(tr.ctx);
    if (ai.state === 'cleared_to') break;
  }
  console.log(label.padEnd(44), cleared == null ? 'jamais autorisé' : `autorisé à t=${cleared}s`, '(joueur sur la piste jusqu\'à 50 s)');
};
run('20', 'IA au départ de la 20 (croise la 24) :');
run('25R', 'IA au départ de la 25R (parallèle, éloignée) :');
