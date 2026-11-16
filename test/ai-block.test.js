// Les avions IA s'attendent entre eux (carrefours compris), sans blocage définitif
const Traffic = require('../src/traffic.js');
const base = { lat: 48.72, lon: 2.37 };
const k = 111120 * Math.cos(base.lat * Math.PI / 180);
const off = (e, n) => ({ lat: base.lat + n / 111120, lon: base.lon + e / k });
const G = (a, others, now = 1e6) => Traffic.prototype.groundAhead.call({ ai: others, tel: null, now }, a, 75);
let bad = 0;
const chk = (n, r, w) => { console.log(n, r, r === w ? 'OK' : 'KO'); if (r !== w) bad++; };
const me = { id: 2, pos: base, hdg: 90, v: 10, state: 'taxi_out', onGround: true, blockedSince: null };
chk('avion en mouvement devant décalé 25 m', G(me, [{ id: 1, pos: off(40, 25), hdg: 0, v: 8, state: 'taxi_out', onGround: true }]), true);
chk('carrefour : l\'autre me coupe de côté (je suis plus récent)', G(me, [{ id: 1, pos: off(30, 20), hdg: 180, v: 8, state: 'taxi_out', onGround: true }]), true);
chk('carrefour : je suis le plus ancien, je passe', G({ ...me, id: 1 }, [{ id: 2, pos: off(30, 20), hdg: 180, v: 8, state: 'taxi_out', onGround: true }]), false);
chk('avion garé à 40 m sur le côté', G(me, [{ id: 1, pos: off(40, 40), hdg: 0, v: 0, state: 'parked', onGround: true }]), false);
chk('avion garé juste devant', G(me, [{ id: 1, pos: off(40, 0), hdg: 0, v: 0, state: 'parked', onGround: true }]), true);
chk('derrière moi', G(me, [{ id: 1, pos: off(-50, 0), hdg: 90, v: 8, state: 'taxi_out', onGround: true }]), false);
chk('bloqué depuis 130 s : on passe', G({ ...me, blockedSince: 1e6 - 130000 }, [{ id: 1, pos: off(40, 0), hdg: 0, v: 0, state: 'taxi_out', onGround: true }]), false);
process.exit(bad ? 1 : 0);
