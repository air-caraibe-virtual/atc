// Plan fictif autour de TFFR (pour tests uniquement)
const base = { lat: 16.2653, lon: -61.5318 };
const off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
const node = (id, dx, dy) => ({ id, ...off(dx, dy) });
const N = { p: node(1, 0, 0), a: node(2, 0, 150), b: node(3, -600, 150), c: node(4, -1200, 700), h: node(5, -1250, 900) };
const way = (tags, ns) => ({ type: 'way', tags, nodes: ns.map((n) => n.id), geometry: ns.map((n) => ({ lat: n.lat, lon: n.lon })) });
module.exports = { elements: [
  way({ aeroway: 'taxilane' }, [N.p, N.a]),
  way({ aeroway: 'taxiway', ref: 'W' }, [N.a, N.b]),
  way({ aeroway: 'taxiway', ref: 'M' }, [N.b, N.c]),
  way({ aeroway: 'taxiway', ref: 'M1' }, [N.c, N.h]),
  { type: 'way', tags: { aeroway: 'runway', ref: '12/30' }, geometry: [off(-1299, 1050), off(1299, -450)] },
  { type: 'node', id: 5, tags: { aeroway: 'holding_position', ref: 'M1' }, lat: N.h.lat, lon: N.h.lon },
  { type: 'node', id: 90, tags: { aeroway: 'parking_position', ref: 'K12' }, lat: N.p.lat, lon: N.p.lon },
] };
