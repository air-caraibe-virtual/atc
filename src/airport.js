/* ATC — plan au sol des aéroports (données OpenStreetMap) et calcul de l'itinéraire de roulage. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.Airport = factory(root.ATC);
})(typeof self !== 'undefined' ? self : this, function (ATC) {
  'use strict';
  const { distNm, bearing } = ATC.utils;
  const M = (a, b) => distNm(a, b) * 1852; // distance en mètres

  // Transforme la réponse Overpass en plan exploitable
  function parse(json) {
    const out = { runways: [], taxiways: [], holds: [], gates: [], graph: new Map(), coords: new Map() };
    const els = (json && json.elements) || [];
    for (const e of els) {
      const t = e.tags || {};
      if (e.type === 'way' && e.geometry) {
        const pts = e.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
        if (t.aeroway === 'runway') out.runways.push({ ref: t.ref || '', pts, width: +t.width || 45 });
        else if (t.aeroway === 'taxiway' || t.aeroway === 'taxilane') {
          // nom court seulement (« W47 Holding bay » → « W47 »)
          let ref = (t.ref || '').toUpperCase().trim();
          if (!ref && t.name) { const m = t.name.toUpperCase().replace(/^TAXIWAY\s+/, '').match(/^([A-Z]{1,2}\d{0,2})\b/); ref = m ? m[1] : ''; }
          ref = ref.split(/[;\s]/)[0];
          out.taxiways.push({ ref, pts, lane: t.aeroway === 'taxilane' });
          // graphe : nœuds OSM reliés le long du taxiway
          const ids = e.nodes || [];
          for (let i = 0; i < ids.length; i++) {
            out.coords.set(ids[i], pts[i]);
            if (!out.graph.has(ids[i])) out.graph.set(ids[i], []);
            if (i > 0) {
              const w = M(pts[i - 1], pts[i]);
              out.graph.get(ids[i - 1]).push({ to: ids[i], w, ref, lane: t.aeroway === 'taxilane' });
              out.graph.get(ids[i]).push({ to: ids[i - 1], w, ref, lane: t.aeroway === 'taxilane' });
            }
          }
        } else if (t.aeroway === 'holding_position') {
          const c = pts[Math.floor(pts.length / 2)];
          out.holds.push({ ref: t.ref || '', lat: c.lat, lon: c.lon, pts });
        }
      } else if (e.type === 'node') {
        if (t.aeroway === 'holding_position') out.holds.push({ ref: t.ref || '', lat: e.lat, lon: e.lon, id: e.id });
        else if (t.aeroway === 'parking_position' || t.aeroway === 'gate') out.gates.push({ ref: t.ref || t.name || '', lat: e.lat, lon: e.lon, gate: t.aeroway === 'gate' });
      }
    }
    return out;
  }

  // Seuil de la piste « 24 » (ou 24L…) : l'extrémité d'où l'on décolle
  function threshold(layout, rwy) {
    if (!rwy) return null;
    const m = String(rwy).toUpperCase().match(/^(\d{1,2})([LRC]?)$/); if (!m) return null;
    const num = String(+m[1]).padStart(2, '0') + m[2];
    const hdg = +m[1] * 10;
    let best = null, bestScore = Infinity;
    for (const r of layout.runways) {
      const parts = r.ref.toUpperCase().split('/').map((x) => x.trim().replace(/^0?(\d)([LRC]?)$/, '0$1$2'));
      const named = parts.includes(num);
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      for (const [s, e] of [[a, b], [b, a]]) {
        const diff = Math.abs(((bearing(s, e) - hdg + 540) % 360) - 180);
        const score = diff + (named ? 0 : 60);
        if (diff < 35 && score < bestScore) { bestScore = score; best = { lat: s.lat, lon: s.lon, end: e, ref: r.ref }; }
      }
    }
    return best;
  }

  function nearestNode(layout, p, maxM, filter) {
    let best = null, bd = maxM || Infinity;
    for (const [id, c] of layout.coords) {
      if (filter && !filter(id)) continue;
      const d = M(p, c);
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  // Dijkstra simple avec tas binaire
  function shortest(layout, from, goals) {
    const G = layout.graph, dist = new Map([[from, 0]]), prev = new Map(), goalSet = new Set(goals);
    const heap = [[0, from]];
    const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    while (heap.length) {
      const [d, u] = pop();
      if (d > (dist.get(u) ?? Infinity)) continue;
      if (goalSet.has(u)) {
        const path = [u], edges = [];
        let c = u; while (prev.has(c)) { const p = prev.get(c); edges.unshift(p.edge); c = p.node; path.unshift(c); }
        return { path, edges, len: d };
      }
      for (const e of G.get(u) || []) {
        const nd = d + e.w * (e.lane ? 1.15 : 1); // léger désavantage aux voies de parking
        if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, { node: u, edge: e }); push([nd, e.to]); }
      }
    }
    return null;
  }

  // Noms successifs des taxiways empruntés (sans doublons, sans voies sans nom)
  function viaNames(edges) {
    const names = [];
    let run = null, runLen = 0;
    const flush = () => { if (run && runLen > 40 && names[names.length - 1] !== run) names.push(run); };
    for (const e of edges) {
      if (e.ref !== run) { flush(); run = e.ref; runLen = 0; }
      runLen += e.w;
    }
    flush();
    return names.filter((n) => n && /^[A-Z]{1,2}\d{0,2}$/.test(n) && n.length <= 4);
  }

  // Itinéraire de la position actuelle jusqu'au point d'arrêt de la piste de départ
  function taxiToRunway(layout, from, rwy) {
    if (!layout || !layout.graph.size || !from) return null;
    const th = threshold(layout, rwy); if (!th) return null;
    const start = nearestNode(layout, from, 400); if (start == null) return null;
    // points d'arrêt proches du seuil, sinon nœuds de taxiway proches du seuil
    let goals = [];
    const holds = layout.holds.filter((h) => M(h, th) < 700).sort((a, b) => M(a, th) - M(b, th));
    for (const h of holds.slice(0, 4)) { const n = nearestNode(layout, h, 60); if (n != null) goals.push({ n, hold: h }); }
    if (!goals.length) {
      const n = nearestNode(layout, th, 350); if (n != null) goals.push({ n, hold: null });
    }
    if (!goals.length) return null;
    // garder le but le plus proche du seuil parmi ceux atteignables
    let best = null;
    for (const g of goals) {
      const r = shortest(layout, start, [g.n]);
      if (r && (!best || M(g.hold || layout.coords.get(g.n), th) + r.len * 0.05 < best.score)) best = { ...r, hold: g.hold, score: M(g.hold || layout.coords.get(g.n), th) + r.len * 0.05 };
    }
    if (!best) return null;
    const pts = best.path.map((id) => layout.coords.get(id));
    return {
      via: viaNames(best.edges),
      pts,
      crossings: crossingsOf(layout, pts, th.ref),
      hold: best.hold && best.hold.ref ? best.hold.ref : null,
      len: Math.round(best.len),
    };
  }

  // Pistes traversées le long d'un itinéraire (dans l'ordre), hors piste de départ
  function runwayAt(layout, p) {
    for (const r of layout.runways) {
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      const al = alongRunway(p, a, b);
      if (al.t > -0.01 && al.t < 1.01 && al.xt < Math.max(30, (r.width || 45) / 2 + 8)) return r.ref || '?';
    }
    return null;
  }
  function crossingsOf(layout, pts, exceptRef) {
    const out = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(M(a, b) / 10));
      for (let k = 0; k <= n; k++) {
        const p = { lat: a.lat + (b.lat - a.lat) * k / n, lon: a.lon + (b.lon - a.lon) * k / n };
        const ref = runwayAt(layout, p);
        if (ref && ref !== exceptRef && out[out.length - 1] !== ref) out.push(ref);
      }
    }
    return [...new Set(out)];
  }
  // Itinéraire entre deux points quelconques de l'aéroport (sortie de piste → parking…)
  function taxiBetween(layout, from, to) {
    if (!layout || !layout.graph.size) return null;
    const a = nearestNode(layout, from, 500), b = nearestNode(layout, to, 300);
    if (a == null || b == null) return null;
    const r = shortest(layout, a, [b]);
    return r ? { pts: r.path.map((id) => layout.coords.get(id)), via: viaNames(r.edges), len: r.len } : null;
  }
  // Nœud de taxiway le plus proche d'un point, mais à l'écart de l'axe de piste (pour dégager)
  function exitPoint(layout, p, th, end) {
    const id = nearestNode(layout, p, 400, (n) => {
      const c = layout.coords.get(n);
      return crossTrack(c, th, end) > 70;
    });
    return id == null ? null : layout.coords.get(id);
  }
  // Distance (m) d'un point à l'axe de piste
  function crossTrack(p, a, b) {
    const k = Math.cos(a.lat * Math.PI / 180);
    const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    const t = ((px - ax) * dx + (py - ay) * dy) / L2;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy)) * 111120;
  }
  // Position le long de la piste (0 = seuil, 1 = bout) et écart latéral
  function alongRunway(p, a, b) {
    const k = Math.cos(a.lat * Math.PI / 180);
    const dx = (b.lon - a.lon) * k, dy = b.lat - a.lat, L2 = dx * dx + dy * dy || 1e-12;
    return { t: ((p.lon - a.lon) * k * dx + (p.lat - a.lat) * dy) / L2, xt: crossTrack(p, a, b) };
  }

  return { parse, taxiToRunway, threshold, taxiBetween, exitPoint, alongRunway, crossTrack, runwayAt, crossingsOf };
});
