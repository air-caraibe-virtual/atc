// Sortie de piste des arrivées : le chemin doit rester sur la piste ou les taxiways (pas sur l'herbe)
const Airport = require('../src/airport.js');
// aéroport synthétique : piste 09/27 de 3000 m, taxiway parallèle à 180 m, deux sorties (90° et grande vitesse) et des parkings
const o = { lat: 43.66, lon: 7.20 }, P = (x, y) => ({ lat: o.lat + y / 111120, lon: o.lon + x / (111120 * Math.cos(o.lat * Math.PI / 180)) });
let nid = 1; const el = [];
const way = (tags, pts) => { const ids = pts.map(() => nid++); el.push({ type: 'way', tags, nodes: ids, geometry: pts.map(([x, y]) => P(x, y)) }); return ids; };
way({ aeroway: 'runway', ref: '09/27' }, [[0, 0], [3000, 0]]);
// parallèle (nœuds partagés aux jonctions : mêmes coordonnées)
way({ aeroway: 'taxiway', ref: 'A' }, [[300, -180], [1200, -180], [1900, -180], [2600, -180]]);
way({ aeroway: 'taxiway', ref: 'B1' }, [[1200, 0], [1200, -180]]);        // sortie à 90°
way({ aeroway: 'taxiway', ref: 'B2' }, [[1600, 0], [1900, -180]]);        // grande vitesse
way({ aeroway: 'taxiway', ref: 'B3' }, [[2600, 0], [2600, -180]]);
way({ aeroway: 'taxilane' }, [[1200, -180], [1200, -320]]);
el.push({ type: 'node', id: nid++, tags: { aeroway: 'parking_position', ref: 'P1' }, ...P(1200, -330) });
// les nœuds de mêmes coordonnées doivent être fusionnés : on réécrit les identifiants par position
const key = (g) => g.lat.toFixed(7) + ',' + g.lon.toFixed(7), byPos = new Map();
el.filter((e) => e.type === 'way').forEach((w) => { w.nodes = w.geometry.map((g) => { const k = key(g); if (!byPos.has(k)) byPos.set(k, nid++); return byPos.get(k); }); });
const L = Airport.parse({ elements: el });
const th = Airport.threshold(L, '09');
const M = (a, b) => { const R = 6371000, r = Math.PI / 180, dl = (b.lat - a.lat) * r, dn = (b.lon - a.lon) * r; const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const segD = (p, a, b) => { const k = Math.cos(p.lat * Math.PI / 180); const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat; const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12; let t = ((px - ax) * dx + (py - ay) * dy) / L2; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111120; };
const edges = []; for (const [id, es] of L.graph) for (const e of es) edges.push([L.coords.get(id), L.coords.get(e.to)]);
const onPaved = (p) => segD(p, th, th.end) < 25 || edges.some(([a, b]) => segD(p, a, b) < 20);
let fail = 0;
for (const frac of [0.3, 0.5, 0.7]) {
  const pos = { lat: th.lat + (th.end.lat - th.lat) * frac, lon: th.lon + (th.end.lon - th.lon) * frac };
  const g = L.gates[0];
  const rx = Airport.runwayExit(L, pos, th, th.end, g, 60);
  if (!rx) { console.log(frac, 'aucune sortie devant'); continue; }
  const path = [pos, rx.abeam, ...rx.pts, g];
  let worst = 0;
  for (let i = 0; i < path.length - 2; i++) for (let s = 0; s <= 10; s++) { const p = { lat: path[i].lat + (path[i + 1].lat - path[i].lat) * s / 10, lon: path[i].lon + (path[i + 1].lon - path[i].lon) * s / 10 }; if (!onPaved(p)) worst++; }
  console.log(`à ${frac * 100}% de la piste : sortie ${Math.round(rx.ahead)} m devant, ${rx.pts.length} points, hors dur: ${worst}`);
  if (worst) fail++;
  // ancienne méthode, pour comparaison
  const ex = Airport.exitPoint(L, pos, th, th.end); let w2 = 0;
  if (ex) for (let s = 0; s <= 10; s++) { const p = { lat: pos.lat + (ex.lat - pos.lat) * s / 10, lon: pos.lon + (ex.lon - pos.lon) * s / 10 }; if (!onPaved(p)) w2++; }
  console.log('   ancienne méthode : points sur l\'herbe', w2);
}
process.exitCode = fail ? 1 : 0;
