/* ATC — pistes réellement en service : D-ATIS (aéroports US) ou déduction à partir des vrais vols du moment. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./airport.js'));
  else root.RwyUse = factory(root.ATC, root.Airport);
})(typeof self !== 'undefined' ? self : this, function (ATC, Airport) {
  'use strict';
  const { distNm, bearing } = ATC.utils;
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const norm = (r) => String(r || '').toUpperCase().replace(/^(\d)([LRC]?)$/, '0$1$2');

  // Extrémités de piste : nom, seuil, autre bout, cap vrai
  function ends(layout, rwyEnds) {
    const out = [];
    for (const r of layout.runways) {
      const a = r.pts[0], b = r.pts[r.pts.length - 1];
      if (distNm(a, b) * 1852 < 800) continue;
      const e = rwyEnds(r.ref, a, b);
      out.push({ name: e[0].name, th: a, end: b, hdg: bearing(a, b), strip: r });
      out.push({ name: e[1].name, th: b, end: a, hdg: bearing(b, a), strip: r });
    }
    return out;
  }

  // D-ATIS (texte) → { arr: ['22L'], dep: ['22R'] }
  function parseAtis(text) {
    const t = String(text || '').toUpperCase().replace(/\s+/g, ' ');
    const list = (s) => (s.match(/\b\d{1,2}[LRC]?\b/g) || []).map(norm).filter((x) => +x.slice(0, 2) >= 1 && +x.slice(0, 2) <= 36);
    const grab = (re) => { const out = []; for (const m of t.matchAll(re)) out.push(...list(m[1])); return [...new Set(out)]; };
    const arr = grab(/(?:LDG|LANDING|ARRIVALS?|ARR|APPROACH(?:ES)?|APCH|ILS|RNAV|VISUAL)\b[^.]*?\bRWYS?\s+((?:\d{1,2}[LRC]?(?:\s*(?:,|AND|&|\/|OR)\s*)?)+)/g);
    const dep = grab(/(?:DEPG|DEPARTING|DEPARTURES?|DEP|TKOF|TAKEOFF)\b[^.]*?\bRWYS?\s+((?:\d{1,2}[LRC]?(?:\s*(?:,|AND|&|\/|OR)\s*)?)+)/g);
    const both = grab(/\bRWYS? IN USE\s+((?:\d{1,2}[LRC]?(?:\s*(?:,|AND|&|\/)\s*)?)+)/g);
    return { arr: arr.length ? arr : both, dep: dep.length ? dep : both };
  }

  // Déduction à partir des vrais vols : arrivées alignées en finale, départs en course ou en montée initiale
  function fromLive(layout, live, elev, rwyEnds) {
    const E = ends(layout, rwyEnds);
    if (!E.length || !live || !live.length) return null;
    const score = new Map(E.map((e) => [e.name, { arr: 0, dep: 0, e }]));
    for (const f of live) {
      if (f.lat == null || f.track == null) continue;
      let bestArr = null, bestDep = null;
      for (const e of E) {
        if (angDiff(f.track, e.hdg) > 25) continue;
        const al = Airport.alongRunway(f, e.th, e.end), xt = al.xt; // xt en mètres
        const len = distNm(e.th, e.end) * 1852;
        const agl = f.alt != null ? f.alt - (elev || 0) : null;
        // en finale : avant le seuil, jusqu'à 15 NM, aligné (±1,5 km), assez bas, pas en montée
        if (!f.onGround && al.t < 0.05 && -al.t * len < 15 * 1852 && xt < 1500 && (agl == null || agl < 5000) && f.vs < 500) { if (!bestArr || xt < bestArr.xt) bestArr = { e, xt }; }
        // au départ : en course de décollage sur la piste, ou en montée dans l'axe après le bout de piste
        else if ((f.onGround && f.kts > 50 && al.t > -0.02 && al.t < 1.02 && xt < 60) ||
          (!f.onGround && al.t > 0.6 && (al.t - 1) * len < 8 * 1852 && xt < 2500 && (agl == null || agl < 6000) && f.vs > 300)) { if (!bestDep || xt < bestDep.xt) bestDep = { e, xt }; }
      }
      // chaque avion compte pour une seule piste : celle dont il est le plus proche de l'axe
      if (bestArr) score.get(bestArr.e.name).arr++;
      if (bestDep) score.get(bestDep.e.name).dep++;
    }
    const best = (k) => [...score.values()].filter((x) => x[k] > 0).sort((a, b) => b[k] - a[k]);
    const arr = best('arr'), dep = best('dep');
    if (!arr.length && !dep.length) return null;
    return { arr: arr.map((x) => x.e.name), dep: dep.map((x) => x.e.name), counts: { arr: arr.map((x) => x.e.name + ':' + x.arr), dep: dep.map((x) => x.e.name + ':' + x.dep) } };
  }

  // Si une seule information (arrivées OU départs), on en déduit l'autre : même sens
  function complete(res, layout, rwyEnds) {
    if (!res) return null;
    const E = ends(layout, rwyEnds);
    const sameDir = (name) => { const e = E.find((x) => x.name === name); return e ? E.filter((x) => angDiff(x.hdg, e.hdg) < 30).map((x) => x.name) : [name]; };
    if (!res.arr.length && res.dep.length) res.arr = sameDir(res.dep[0]);
    if (!res.dep.length && res.arr.length) res.dep = sameDir(res.arr[0]);
    // ne garder que des pistes qui existent sur le plan
    const names = new Set(E.map((x) => x.name));
    res.arr = res.arr.map(norm).filter((n) => names.has(n));
    res.dep = res.dep.map(norm).filter((n) => names.has(n));
    return res.arr.length || res.dep.length ? res : null;
  }

  return { parseAtis, fromLive, complete, ends };
});
