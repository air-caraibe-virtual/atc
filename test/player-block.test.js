// L'avion IA s'arrête devant le joueur au sol (pushback compris), même décalé sur le côté
const Traffic = require('../src/traffic.js');
const base = { lat: 48.72, lon: 2.37 };
const k = 111120 * Math.cos(base.lat * Math.PI / 180);
const off = (e, n) => ({ lat: base.lat + n / 111120, lon: base.lon + e / k });
const mk = (tel) => ({ ai: [], tel, now: 1e6 });
const a = { id: 1, pos: base, hdg: 90, blockedSince: null };
let bad = 0;
const chk = (name, tel, want) => { const r = Traffic.prototype.groundAhead.call(mk(tel), { ...a }, 75); console.log(name, r, r === want ? 'OK' : 'KO'); if (r !== want) bad++; };
chk('devant, 50 m', { ...off(50, 0), onGround: true }, true);
chk('devant décalé 30 m, 40 m', { ...off(40, 30), onGround: true }, true);
chk('travers, 20 m', { ...off(0, 20), onGround: true }, true);
chk('loin sur le côté, 80 m', { ...off(20, 80), onGround: true }, false);
chk('derrière, 60 m', { ...off(-60, 0), onGround: true }, false);
chk('en vol', { ...off(50, 0), onGround: false }, false);
// blocage > 45 s : l'IA ne passe jamais à travers le joueur
const r = Traffic.prototype.groundAhead.call(mk({ ...off(30, 0), onGround: true }), { ...a, blockedSince: 1e6 - 100000 }, 75);
console.log('blocage ancien, joueur devant', r, r === true ? 'OK' : 'KO'); if (r !== true) bad++;
process.exit(bad ? 1 : 0);
