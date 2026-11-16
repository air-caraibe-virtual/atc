// Le nez de l'avion garé regarde vers le terminal (voie de circulation côté queue)
const Traffic = require('../src/traffic.js');
const base = { lat: 48.72, lon: 2.37 };
const north = (m) => ({ lat: base.lat + m / 111120, lon: base.lon });
// voie de circulation 50 m au sud de la porte, terminal au nord
const L = { coords: new Map([[1, north(-50)], [2, { lat: north(-50).lat, lon: base.lon + 0.0005 }]]) };
let bad = 0;
for (const hdg of [0, 180, 20, 200]) {
  const r = Traffic.standPose(L, { ...base, hdg, msfs: true });
  const nose = r.hdg; const ok = Math.min(nose, 360 - nose) < 40;
  console.log(`cap MSFS ${hdg} → ${Math.round(nose)} ${ok ? 'OK' : 'KO'}`); if (!ok) bad++;
}
process.exit(bad ? 1 : 0);
