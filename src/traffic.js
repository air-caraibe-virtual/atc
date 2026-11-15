/* ATC — trafic IA créé et piloté par ATC : départs et arrivées autour de l'aéroport actif,
   séquencés avec le joueur, avec leurs échanges radio. Testable sous Node (io simulé). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./airport.js'));
  else root.Traffic = factory(root.ATC, root.Airport);
})(typeof self !== 'undefined' ? self : this, function (ATC, Airport) {
  'use strict';
  const { distNm, bearing, callsignSay, digits } = ATC.utils;
  const M = (a, b) => distNm(a, b) * 1852;
  const KT = 0.514444; // m/s
  function move(p, brg, meters) {
    const R = 6371000, d = meters / R, b = (brg * Math.PI) / 180;
    const la1 = (p.lat * Math.PI) / 180, lo1 = (p.lon * Math.PI) / 180;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
    const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
  }
  // Position et cap d'un avion garé : parkings MSFS = centre et cap exacts ;
  // parkings OSM = point d'arrêt du nez, donc on recule l'avion d'une demi-longueur, nez vers le terminal
  function standPose(L, g) {
    if (g.msfs && g.hdg != null) return { pos: { lat: g.lat, lon: g.lon }, hdg: g.hdg };
    let node = null, bd = Infinity;
    for (const [, p] of L.coords) { const d = M(p, g); if (d > 25 && d < bd) { bd = d; node = p; } }
    const hdg = node ? bearing(node, g) : 0;
    return { pos: move(g, (hdg + 180) % 360, 18), hdg };
  }
  // feux d'un avion IA selon ce qu'il fait
  const lightMode = (a) => (a.static || a.state === 'parked' || a.state === 'parked_in' || a.state === 'taxi_wait' ? 'park'
    : a.light ? 'rwy' : a.onGround ? 'taxi' : 'cruise');
  const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const turnTo = (h, target, maxDeg) => { const d = ((target - h + 540) % 360) - 180; return (h + Math.max(-maxDeg, Math.min(maxDeg, d)) + 360) % 360; };

  // Compagnies reconnues dans le nom des livrées
  const LIVERY_AIRLINES = [
    [/air france/i, 'AFR'], [/easy ?jet/i, 'EZY'], [/transavia/i, 'TVF'], [/lufthansa/i, 'DLH'], [/british/i, 'BAW'], [/klm/i, 'KLM'],
    [/iberia/i, 'IBE'], [/vueling/i, 'VLG'], [/ryanair/i, 'RYR'], [/swiss/i, 'SWR'], [/delta/i, 'DAL'], [/american/i, 'AAL'], [/united/i, 'UAL'],
    [/emirates/i, 'UAE'], [/qatar/i, 'QTR'], [/cara[iï]bes?/i, 'FWI'], [/corsair/i, 'CRL'], [/volotea/i, 'VOE'], [/\btap\b/i, 'TAP'],
    [/air canada/i, 'ACA'], [/condor/i, 'CFG'], [/\bita\b/i, 'ITY'], [/wizz/i, 'WZZ'], [/turkish/i, 'THY'], [/aer lingus/i, 'EIN'],
    [/\bsas\b|scandinavian/i, 'SAS'], [/finnair/i, 'FIN'], [/austrian/i, 'AUA'], [/brussels/i, 'BEL'], [/air europa/i, 'AEA'],
    [/jet2/i, 'EXS'], [/norwegian/i, 'NOZ'], [/\bhop\b/i, 'HOP'], [/french bee/i, 'FBU'], [/air tahiti/i, 'THT'], [/air austral/i, 'REU'],
  ];
  const REGION_AIRLINES = {
    L: ['AFR', 'AFR', 'TVF', 'EZY', 'VLG', 'HOP', 'DLH', 'BAW', 'KLM', 'IBE', 'SWR', 'VOE', 'RYR'],
    E: ['BAW', 'EZY', 'RYR', 'KLM', 'DLH', 'SAS', 'EIN', 'AFR', 'NOZ', 'FIN'],
    K: ['AAL', 'DAL', 'UAL', 'SWA', 'JBU', 'AAL', 'DAL', 'UAL'],
    C: ['ACA', 'ACA', 'TSC', 'UAL'],
    T: ['FWI', 'AFR', 'CRL', 'AAL', 'FWI', 'AFR'],
    S: ['FWI', 'AFR'],
    F: ['AFR', 'REU', 'FBU'],
    O: ['UAE', 'QTR', 'THY'],
  };
  const AIRLINER = /(A3[0-9]{2}|A220|A3[1-5]0|737|747|757|767|777|787|E1[79]\d|E-?Jet|CRJ|ATR|Dash ?8|Q400|MD-?8\d)/i;
  // Types OACI utilisés par FSLTL (A20N, B738, B77W, A359, E190, CRJ9, AT76…)
  const FSLTL_TYPE = /(?<![A-Za-z0-9])(A3[0-9]{2}|A3[0-9][0-9N]|A[123][0-9][NK]|A3[3-5][0-9]|A388|B7[0-9]{2}|B7[0-9][0-9A-Z]|B3[89]M|BCS[13]|E1[79][05]|E[0-9]{2}[0-9A-Z]|CRJ[0-9X]|AT[47][0-9]|DH8[A-D]|MD[89][0-9])(?![A-Za-z0-9])/i;
  const TYPE_NAMES = { A20N: 'A320', A21N: 'A321', A19N: 'A319', B38M: '737 MAX', B39M: '737 MAX', B738: '737', B737: '737', B739: '737', B77W: '777', B772: '777', B789: '787', B788: '787', A359: 'A350', A35K: 'A350', A388: 'A380', A332: 'A330', A333: 'A330', A339: 'A330', BCS1: 'A220', BCS3: 'A220', E190: 'Embraer', E195: 'Embraer', E75L: 'Embraer', CRJ9: 'CRJ', AT76: 'ATR', AT75: 'ATR', DH8D: 'Dash 8' };
  function typeOf(model) {
    const s = model.title + ' ' + model.livery;
    const f = s.match(FSLTL_TYPE), a = s.match(AIRLINER);
    const t = (f && f[0].toUpperCase()) || (a && a[0].toUpperCase()) || '';
    return TYPE_NAMES[t] || t;
  }
  const NOT_AIRLINER = /(cargo|freighter|tanker|military|\bkc-|bizjet|private)/i;

  class Traffic {
    constructor(opts) {
      this.io = opts.io;           // { spawn, move, remove, clear, radio, models }
      this.rand = opts.rand || Math.random;
      this.ai = []; this.nextId = 1; this.side = null; this.nextSpawn = 0; this.used = new Set(); this.live = null;
      this.models = null; this.modelsAsked = false;
      this.radioBusyUntil = 0; this.queue = [];
      this.enabled = false; this.max = opts.max || 8;
    }

    setEnabled(on) {
      this.enabled = on;
      if (!on) this.clear();
    }
    clear() {
      for (const a of this.ai) this.io.remove(a.id);
      this.ai = []; this.queue = []; this.side = null;
    }
    list() { return this.ai.filter((a) => a.state !== 'pending'); }

    // ---------- Contexte : aéroport actif et sa piste ----------
    context(engine, layouts, tel) {
      const f = engine.flight; if (!tel || tel.lat == null) return null;
      let side = null, a = null;
      if (f) {
        const pre = ['PRE', 'CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'LINEUP', 'TAKEOFF', 'DEP_CHECKIN'].includes(engine.phase);
        const dDep = distNm(tel, f.dep), dArr = distNm(tel, f.arr);
        if (pre && dDep < 25) side = 'dep';
        else if (dArr < 80 && !pre) side = 'arr';
        else if (dDep < 12) side = 'dep';
        if (!side) return null;
        a = f[side];
      } else {
        // sans plan de vol : l'aéroport où se trouve le joueur (trouvé par l'appli)
        const h = this.home;
        if (!h || !h.rwy || distNm(tel, h) > 20) return null;
        side = 'dep'; a = h;
      }
      const L = layouts[a.icao];
      if (!L || !a.rwy) return null;
      const geo = (name) => { const th = Airport.threshold(L, name); return th ? { name, th, end: th.end, hdg: bearing(th, th.end), len: M(th, th.end), strip: th.ref } : null; };
      const P = geo(a.rwy); if (!P) return null;
      // pistes réellement en service (si connues) : départs et arrivées peuvent être différentes
      const D = (a.rwyTakeoff && geo(a.rwyTakeoff)) || (side === 'dep' ? P : null) || P;
      const A = (a.rwyLand && geo(a.rwyLand)) || (side === 'arr' ? P : null) || P;
      return { side, a, L, P, D, A, th: P.th, end: P.end, hdg: P.hdg, elev: a.elev || 0 };
    }

    // ---------- Boucle (≈10 fois par seconde) ----------
    tick(now, dt, engine, layouts, tel, audible) {
      if (!this.enabled) return;
      if (!tel || tel.lat == null) return; // pas de données du simulateur pour l'instant : on ne vide rien
      this.now = now; this.engine = engine; this.tel = tel; this.audible = audible;
      const ctx = this.context(engine, layouts, tel);
      // hors des aéroports, en vol : trafic en route (vrais vols autour du joueur)
      const enroute = !ctx && tel && tel.lat != null && tel.onGround === false && (engine.flight || (tel.agl != null && tel.agl > 1500));
      const key = ctx ? ctx.a.icao + ctx.a.rwy + (ctx.a.rwyTakeoff || '') + (ctx.a.rwyLand || '') : enroute ? 'ENROUTE' : null;
      if (key !== this.side) { this.clear(); this.side = key; this.nextSpawn = now + 8000; this.liveAt = 0; this.live = null; this.conflictCache = {}; }
      if (enroute) { this.ctx = null; return this.enrouteTick(now, dt, tel); }
      if (!ctx) return;
      this.ctx = ctx;
      // liste des avions installés dans MSFS (redemandée tant qu'elle est vide)
      if ((!this.models || (!this.models.length && this.io.connected && this.io.connected())) && now - (this.modelsAt || -1e9) > 30000) {
        this.modelsAt = now;
        Promise.resolve(this.io.models()).then((m) => {
          const all = m || [];
          this.models = this.pickModels(all);
          // les avions créés « carte seulement » faute de modèles sont remplacés par de vrais avions
          if (this.models.length) this.ai.filter((x) => !x.model).forEach((x) => { x.state = 'gone'; this.used.delete(x.cs); });
          if (this.onModels) this.onModels(this.models.length, all.length);
        }).catch(() => { this.models = []; });
      }
      this.flushRadio();
      // vrais vols du moment (rafraîchis toutes les 90 s)
      if (this.io.live && now - (this.liveAt || 0) > 90000) {
        this.liveAt = now;
        Promise.resolve(this.io.live(ctx.a.lat, ctx.a.lon)).then((l) => { this.live = l; this.liveOk = Array.isArray(l); if (this.onLive) this.onLive(this.liveOk, l); this.wakeStatics(); }).catch(() => { this.liveOk = false; if (this.onLive) this.onLive(false, null); });
      }
      // connecté à MSFS mais aucun avion de ligne trouvé : on se rabat sur l'avion du joueur
      if (this.models && !this.models.length && this.io.connected && this.io.connected() && tel && tel.title && now - (this.modelsAt || 0) > 20000) {
        this.models = [{ title: tel.title, livery: '' }];
        if (this.onModels) this.onModels(-1, 0, tel.title);
      }
      const usable = this.models && (this.models.length || !(this.io.connected && this.io.connected()));
      // plein : on libère la place du plus ancien avion garé pour un vol réel en mouvement
      if (now >= this.nextSpawn && usable && this.live && this.list().length >= this.max) {
        const c = this.liveCandidates(ctx);
        const old = this.ai.filter((a) => a.static && a.state === 'static' && (!this.tel || M(a.pos, this.tel) > 300)).sort((x, y) => x.created - y.created)[0];
        if (old && (c.arr.length || c.dep.length)) old.state = 'gone';
      }
      if (now >= this.nextSpawn && usable && this.live) {
        this.nextSpawn = now + (10 + this.rand() * 12) * 1000;
        if (this.list().length < this.max) this.spawn(ctx);
      }
      // avions stationnés : on remplit les parkings avec les vrais avions au sol (2 toutes les 5 s)
      if (now >= (this.nextStatic || 0) && usable && this.live) {
        this.nextStatic = now + 4000;
        for (let i = 0; i < 3 && this.list().length < this.max; i++) if (!this.spawnStatic(ctx)) break;
      }
      for (const a of this.ai) this.step(a, dt, ctx);
      this.control(ctx);
      const done = this.ai.filter((a) => a.state === 'gone');
      done.forEach((a) => this.io.remove(a.id));
      this.ai = this.ai.filter((a) => a.state !== 'gone');
      // les avions stationnés ne sont positionnés qu'une fois (inutile de les renvoyer sans cesse)
      const moving = this.ai.filter((a) => a.ready && (!a.static || (a.sent || 0) < 20));
      moving.forEach((a) => { if (a.static) a.sent = (a.sent || 0) + 1; });
      this.io.move(moving.map((a) => {
        const vs = a.prevAlt != null && dt > 0 ? ((a.alt - a.prevAlt) / dt) * 60 : 0; a.prevAlt = a.alt;
        return {
        id: a.id, lat: a.pos.lat, lon: a.pos.lon, alt: a.alt, hdg: a.hdg, pitch: a.pitch, bank: a.bank || 0, v: a.static ? 0 : a.v, vs: a.onGround ? 0 : vs,
        onGround: a.onGround, gear: a.gear, light: a.light, lights: lightMode(a),
      }; }));
    }

    // Avions FSLTL en priorité (faits pour le trafic IA, nombreuses livrées), sinon les avions de ligne installés
    // ---------- Trafic en route ----------
    enrouteTick(now, dt, tel) {
      this.ensureModels(now, tel);
      // vrais vols autour du joueur, rafraîchis toutes les 60 s (la zone suit l'avion)
      if (this.io.live && now - (this.liveAt || 0) > 60000) {
        this.liveAt = now;
        Promise.resolve(this.io.live(tel.lat, tel.lon)).then((l) => { if (!Array.isArray(l)) return; this.live = l; this.liveTime = Date.now(); this.recalEnroute(); if (this.onLive) this.onLive(true, l); })
          .catch(() => { if (this.onLive) this.onLive(false, null); });
      }
      const usable = this.models && (this.models.length || !(this.io.connected && this.io.connected()));
      if (usable && this.live && now >= this.nextSpawn) {
        this.nextSpawn = now + 4000;
        const cands = this.live.filter((f) => !f.onGround && f.cs && /^[A-Z]{3}\d/.test(f.cs) && !this.used.has(f.cs) && f.alt != null && f.alt > 3000 && f.track != null)
          .map((f) => ({ ...f, d: distNm(f, tel) }))
          .filter((f) => f.d < 80 && (tel.alt == null || Math.abs(f.alt - tel.alt) < 20000))
          .sort((x, y) => x.d - y.d);
        for (let i = 0; i < 2 && cands.length && this.list().length < this.max; i++) this.spawnEnroute(cands.shift());
      }
      for (const a of this.ai) this.stepEnroute(a, dt, tel);
      const gone = this.ai.filter((a) => a.state === 'gone');
      gone.forEach((a) => { this.io.remove(a.id); this.used.delete(a.cs); });
      this.ai = this.ai.filter((a) => a.state !== 'gone');
      this.io.move(this.ai.filter((a) => a.ready).map((a) => ({
        id: a.id, lat: a.pos.lat, lon: a.pos.lon, alt: a.alt, hdg: a.hdg, pitch: a.pitch, bank: a.bank, v: a.v, vs: a.vs, onGround: false, gear: false, light: a.alt < 10000, lights: a.alt < 10000 ? 'rwy' : 'cruise',
      })));
    }
    ensureModels(now, tel) {
      if ((!this.models || (!this.models.length && this.io.connected && this.io.connected())) && now - (this.modelsAt || -1e9) > 30000) {
        this.modelsAt = now;
        Promise.resolve(this.io.models()).then((m) => { this.models = this.pickModels(m || []); if (this.onModels) this.onModels(this.models.length, (m || []).length); }).catch(() => { this.models = []; });
      }
      if (this.models && !this.models.length && this.io.connected && this.io.connected() && tel && tel.title && now - (this.modelsAt || 0) > 20000) this.models = [{ title: tel.title, livery: '' }];
    }
    spawnEnroute(f) {
      const a = this.newAircraft('enr', { a: { icao: 'L' } }, f);
      a.pos = { lat: f.lat, lon: f.lon }; a.alt = f.alt; a.hdg = f.track; a.v = f.kts || 420; a.vs = f.vs || 0;
      a.pitch = a.vs > 300 ? -3 : a.vs < -300 ? 1 : -1; a.bank = 0; a.onGround = false; a.gear = false; a.light = a.alt < 10000;
      a.real = { lat: f.lat, lon: f.lon, alt: f.alt, track: f.track, kts: a.v, vs: a.vs, t: this.now }; a.seen = this.now;
      a.state = 'enroute';
      return this.create(a, a.v);
    }
    // nouvelles données réelles : on recale la cible de chaque avion
    recalEnroute() {
      for (const a of this.ai) {
        if (a.kind !== 'enr') continue;
        const f = this.live.find((x) => x.cs === a.cs);
        if (!f) continue;
        if (f.onGround) { a.state = 'gone'; continue; }
        a.real = { lat: f.lat, lon: f.lon, alt: f.alt != null ? f.alt : a.alt, track: f.track != null ? f.track : a.hdg, kts: f.kts || a.v, vs: f.vs || 0, t: this.now };
        a.seen = this.now;
      }
    }
    stepEnroute(a, dt, tel) {
      if (a.kind !== 'enr') return;
      const r = a.real, since = (this.now - r.t) / 1000;
      // position réelle extrapolée, vers laquelle on converge doucement (≈ 15 s) pour éviter tout saut
      const target = move({ lat: r.lat, lon: r.lon }, r.track, r.kts * KT * since);
      const tAlt = r.alt + (r.vs / 60) * since;
      const prevHdg = a.hdg;
      a.hdg = turnTo(a.hdg, r.track, 2 * dt);
      a.v += (r.kts - a.v) * Math.min(1, dt * 0.2);
      a.pos = move(a.pos, a.hdg, a.v * KT * dt);
      const k = Math.min(1, dt / 15);
      a.pos = { lat: a.pos.lat + (target.lat - a.pos.lat) * k, lon: a.pos.lon + (target.lon - a.pos.lon) * k };
      const prevAlt = a.alt;
      a.alt += (r.vs / 60) * dt; a.alt += (tAlt - a.alt) * k;
      a.vs = dt > 0 ? ((a.alt - prevAlt) / dt) * 60 : 0;
      a.pitch = a.vs > 300 ? -3 : a.vs < -300 ? 1 : -1;
      const turn = dt > 0 ? ((((a.hdg - prevHdg + 540) % 360) - 180) / dt) : 0;
      a.bank = Math.max(-25, Math.min(25, -turn * 8));
      // trop loin, ou plus de nouvelles du vol réel depuis 4 minutes
      if (distNm(a.pos, tel) > 90 || this.now - a.seen > 240000) a.state = 'gone';
    }
    // Info trafic : avion proche (moins de 8 NM, moins de 2 500 ft d'écart) qui se rapproche, pas encore annoncé
    trafficInfo(tel) {
      if (!this.enabled || !tel || tel.lat == null) return null;
      this.announced = this.announced || new Set();
      let best = null;
      for (const a of this.ai) {
        if (a.kind !== 'enr' || this.announced.has(a.cs) || !a.pos) continue;
        const d = distNm(tel, a.pos), dz = a.alt - (tel.alt || 0);
        if (d > 8 || Math.abs(dz) > 2500) continue;
        a.lastD = a.lastD == null ? d : a.lastD;
        const closing = d <= a.lastD; a.lastD = d;
        if (!closing && d > 3) continue;
        if (!best || d < best.d) best = { a, d, dz };
      }
      if (!best) return null;
      this.announced.add(best.a.cs);
      const hdg = tel.hdgTrue != null ? tel.hdgTrue : tel.hdg || 0;
      const rel = ((bearing(tel, best.a.pos) - hdg) + 720) % 360;
      return { cs: best.a.cs, type: best.a.type, clock: Math.round(rel / 30) % 12 || 12, nm: Math.max(1, Math.round(best.d)), dz: Math.round(best.dz / 100) * 100, same: Math.abs(best.a.hdg - hdg) < 45 };
    }

    pickModels(list) {
      const fsltl = list.filter((m) => /fsltl/i.test(m.title + ' ' + m.livery) && (FSLTL_TYPE.test(m.title + ' ' + m.livery) || AIRLINER.test(m.title)) && !NOT_AIRLINER.test(m.title + ' ' + m.livery));
      this.fsltlCount = fsltl.length;
      if (fsltl.length && this.preferFsltl !== false) return fsltl;
      const ok = list.filter((m) => AIRLINER.test(m.title) && !NOT_AIRLINER.test(m.title + ' ' + m.livery));
      return ok.length ? ok : [];
    }

    // ---------- Création ----------
    identity(model, region) {
      let code = null;
      for (const [re, c] of LIVERY_AIRLINES) if (re.test((model && model.livery) || '') || re.test((model && model.title) || '')) { code = c; break; }
      if (!code) { const pool = REGION_AIRLINES[region] || REGION_AIRLINES.L; code = pool[Math.floor(this.rand() * pool.length)]; }
      let num = String(10 + Math.floor(this.rand() * 9000));
      if (this.rand() < 0.3) num = num.slice(0, 2) + String.fromCharCode(65 + Math.floor(this.rand() * 26)) + (this.rand() < 0.5 ? String.fromCharCode(65 + Math.floor(this.rand() * 26)) : '');
      const cs = code + num;
      const L3 = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(this.rand() * 26))).join('');
      const tail = region === 'L' || region === 'T' ? 'F-G' + L3() : region === 'K' ? 'N' + (100 + Math.floor(this.rand() * 899)) + L3().slice(0, 2) : 'D-A' + L3();
      return { cs, tail };
    }

    // Vols réels candidats : arrivées (en vol, en rapprochement, assez bas) et départs (au sol sur l'aéroport)
    liveCandidates(ctx) {
      const ap = ctx.a, out = { arr: [], dep: [], park: [] };
      for (const f of this.live || []) {
        if (this.used.has(f.cs) || !/^[A-Z]{3}\d/.test(f.cs)) continue;
        const d = distNm(f, ap);
        if (!f.onGround && d > 4 && d < 120 && (f.alt == null || f.alt - ctx.elev < 30000) && f.track != null && angDiff(f.track, bearing(f, ap)) < 80 && f.vs <= 500) out.arr.push({ ...f, d });
        else if (f.onGround && d < 4 && f.kts > 3) out.dep.push({ ...f, d });
        else if (f.onGround && d < 4) out.park.push({ ...f, d });
      }
      out.arr.sort((x, y) => x.d - y.d);
      return out;
    }
    spawn(ctx) {
      const deps = this.ai.filter((a) => a.kind === 'dep').length, arrs = this.ai.filter((a) => a.kind === 'arr').length;
      const c = this.liveCandidates(ctx);
      const cap = Math.max(3, Math.min(8, Math.round(this.max / 3)));
      const canDep = deps < cap && c.dep.length, canArr = arrs < cap && c.arr.length;
      const wantDep = ctx.side === 'dep' ? this.rand() < 0.6 : this.rand() < 0.3;
      let ok = false;
      if (canDep && (wantDep || !canArr)) ok = this.spawnDeparture(ctx, c.dep[Math.floor(this.rand() * c.dep.length)]);
      if (!ok && canArr) ok = this.spawnArrival(ctx, c.arr[0]);
      if (!ok && canDep && !wantDep) ok = this.spawnDeparture(ctx, c.dep[0]);
      if (!ok) this.nextSpawn = this.now + 10000; // rien de possible : nouvel essai bientôt
      return ok;
    }

    // Modèle dont la livrée correspond à la compagnie du vol réel, sinon un avion de ligne au hasard
    modelFor(cs) {
      if (!this.models.length) return null;
      const code = cs.slice(0, 3);
      const re = (LIVERY_AIRLINES.find(([, c]) => c === code) || [])[0];
      // code OACI de la compagnie dans le titre ou la livrée (convention FSLTL : « …_AFR », « AFR … »), ou nom de la compagnie
      const codeRe = new RegExp('(^|[^A-Z0-9])' + code + '([^A-Z0-9]|$)');
      const match = this.models.filter((m) => codeRe.test((m.title + ' ' + m.livery).toUpperCase()) || (re && (re.test(m.livery) || re.test(m.title))));
      const pool = match.length ? match : this.models;
      return pool[Math.floor(this.rand() * pool.length)];
    }
    newAircraft(kind, ctx, real) {
      const model = this.modelFor(real.cs);
      const id = this.nextId++;
      const cs = real.cs, tail = real.icao24 ? real.icao24.toUpperCase() : this.identity(model, ctx.a.icao[0]).tail;
      this.used.add(cs);
      return { id, kind, cs, tail, model, type: model ? typeOf(model) : '', state: 'pending', ready: false, created: this.now, gear: true, light: false, pitch: 0, bank: 0, v: 0 };
    }

    // Avion stationné immobile au parking le plus proche de sa vraie position, nez vers le terminal
    spawnStatic(ctx) {
      const c = this.liveCandidates(ctx);
      if (!c.park.length) return false;
      const real = c.park[Math.floor(this.rand() * c.park.length)];
      const L = ctx.L, tel = this.tel;
      const free = L.gates.filter((g) => M(g, tel) > 60 && this.ai.every((a) => !a.pos || M(a.pos, g) > 45));
      if (!free.length) { this.used.add(real.cs); return false; }
      const g = free.reduce((b, x) => (M(x, real) < M(b, real) ? x : b), free[0]);
      if (M(g, real) > 700) { this.used.add(real.cs); return false; }
      const a = this.newAircraft('park', ctx, real);
      const sp = standPose(L, g);
      a.pos = sp.pos; a.hdg = sp.hdg; a.alt = ctx.elev; a.onGround = true;
      a.state = 'static'; a.static = true; a.gate = g.ref; a.gateObj = g;
      return this.create(a, 0);
    }
    // Le vrai avion commence à rouler : son double quitte le parking et devient un départ
    wakeStatics() {
      const ctx = this.ctx; if (!ctx || !this.live) return;
      const deps = this.ai.filter((a) => a.kind === 'dep').length;
      const cap = Math.max(3, Math.min(8, Math.round(this.max / 3)));
      let n = deps;
      for (const a of this.ai) {
        if (!a.static || !a.gateObj || n >= cap) continue;
        const f = this.live.find((x) => x.cs === a.cs);
        if (!f || !f.onGround || f.kts <= 3) continue;
        const r = Airport.taxiToRunway(ctx.L, a.gateObj, ctx.D.name);
        if (!r || r.pts.length < 2) continue;
        a.static = false; a.kind = 'dep'; a.path = [{ ...a.pos }, ...r.pts]; a.via = r.via; a.hold = r.hold;
        a.state = 'parked'; a.until = this.now + 3000; n++;
      }
    }
    spawnDeparture(ctx, real) {
      const L = ctx.L, tel = this.tel;
      const gates = L.gates.filter((g) => M(g, tel) > 150 && this.ai.every((a) => !a.pos || M(a.pos, g) > 120));
      if (!gates.length) return false;
      // parkings les plus proches de la vraie position de l'avion au sol
      const order = real && real.lat != null ? [...gates].sort((x, y) => M(x, real) - M(y, real)) : gates;
      for (let tries = 0; tries < 6; tries++) {
        const g = real && real.lat != null ? order[tries] : gates[Math.floor(this.rand() * gates.length)];
        if (!g) break;
        const r = Airport.taxiToRunway(L, g, ctx.D.name);
        if (!r || r.pts.length < 2) continue;
        const a = this.newAircraft('dep', ctx, real);
        a.path = [{ lat: g.lat, lon: g.lon }, ...r.pts]; a.via = r.via; a.hold = r.hold;
        a.pos = { lat: g.lat, lon: g.lon }; a.hdg = bearing(a.path[0], a.path[1]); a.alt = ctx.elev; a.onGround = true;
        a.state = 'parked'; a.until = this.now + (15 + this.rand() * 45) * 1000; a.gate = g.ref;
        return this.create(a, 0);
      }
      return false;
    }

    spawnArrival(ctx, real) {
      const dist = 12; // NM
      const back = (ctx.A.hdg + 180) % 360;
      const p = move(ctx.A.th, back, dist * 1852);
      // pas d'autre avion à moins de 4 NM de ce point sur la finale (joueur compris)
      const others = this.ai.filter((a) => a.kind === 'arr' && a.pos).map((a) => a.pos);
      if (this.tel && !this.tel.onGround) others.push(this.tel);
      if (others.some((o) => distNm(o, p) < 4.5)) return false;
      const a = this.newAircraft('arr', ctx, real);
      a.pos = p; a.hdg = ctx.A.hdg; a.d = dist; a.alt = ctx.elev + dist * 318 + 50; a.onGround = false; a.v = 170;
      a.gear = false; a.light = true; a.pitch = -2; a.state = 'approach';
      return this.create(a, 170);
    }

    create(a, kts) {
      this.ai.push(a);
      const title = a.model ? a.model.title : null;
      if (!title) { a.ready = true; return true; } // pas de modèle (démo) : visible sur la carte uniquement
      a.ready = true;
      Promise.resolve(this.io.spawn(a.id, title, a.model.livery, a.tail, { lat: a.pos.lat, lon: a.pos.lon, alt: a.alt, hdg: a.hdg, onGround: a.onGround, kts }))
        .then((ok) => { if (ok === false) a.state = 'gone'; });
      return true;
    }
    failed(id) { const a = this.ai.find((x) => x.id === id); if (a) a.state = 'gone'; }

    // ---------- Mouvements ----------
    followPath(a, dt, speedKt) {
      // arrêt si un autre avion est juste devant (au sol)
      const ahead = this.groundAhead(a, 75);
      const target = ahead ? 0 : speedKt;
      a.v = a.v < target ? Math.min(target, a.v + 3 * dt) : Math.max(target, a.v - 6 * dt);
      let remain = a.v * KT * dt;
      while (remain > 0 && a.path.length > 1) {
        const nxt = a.path[1], d = M(a.pos, nxt);
        if (d <= remain) { a.pos = { lat: nxt.lat, lon: nxt.lon }; a.path.shift(); remain -= d; }
        else { a.pos = move(a.pos, bearing(a.pos, nxt), remain); remain = 0; }
      }
      if (a.path.length > 1) a.hdg = turnTo(a.hdg, bearing(a.pos, a.path[1]), 30 * dt);
      return a.path.length <= 1;
    }
    groundAhead(a, dist) {
      const inFront = (from, hdg, p) => { const d = M(from, p); return d < dist && d > 1 && angDiff(bearing(from, p), hdg) < 35; };
      // bloqué depuis trop longtemps : on passe (évite les blocages définitifs)
      if (a.blockedSince && this.now - a.blockedSince > 45000) { if (this.now - a.blockedSince > 60000) a.blockedSince = null; return false; }
      let blocked = false;
      for (const o of this.ai) {
        if (o === a || !o.onGround || !o.pos || !inFront(a.pos, a.hdg, o.pos)) continue;
        // face à face : le plus ancien passe, l'autre attend
        if (inFront(o.pos, o.hdg, a.pos) && o.v < 1 && a.id < o.id) continue;
        blocked = true; break;
      }
      if (!blocked && this.tel && this.tel.onGround && inFront(a.pos, a.hdg, this.tel)) blocked = true;
      if (blocked) { if (!a.blockedSince) a.blockedSince = this.now; } else a.blockedSince = null;
      return blocked;
    }

    step(a, dt, ctx0) {
      const t = this.now;
      const R = a.kind === 'dep' ? ctx0.D : ctx0.A;
      const ctx = { ...ctx0, th: R.th, end: R.end, hdg: R.hdg };
      switch (a.state) {
        case 'parked':
          if (t > a.until) this.request(a, 'taxi');
          break;
        case 'taxi_out':
          if (this.followPath(a, dt, 16)) { a.state = 'hold'; a.v = 0; a.holdSince = t; }
          break;
        case 'lineup':
          if (this.followPath(a, dt, 10)) { a.state = 'lined'; a.v = 0; }
          break;
        case 'lined':
          a.hdg = turnTo(a.hdg, ctx.hdg, 20 * dt);
          if (!a.linedAt) a.linedAt = t;
          // aligné : on ne part pas tant que le joueur occupe une piste en conflit (atterrissage, roulage sur la piste)
          if (a.afterLineup === 'takeoff' && angDiff(a.hdg, ctx.hdg) < 3 && t - a.linedAt > 4000 && !this.playerBlocks(this.rwyOf(a).strip)) { a.state = 'takeoff'; a.v = 0; }
          break;
        case 'takeoff': {
          a.light = true; a.hdg = turnTo(a.hdg, ctx.hdg, 5 * dt);
          if (a.onGround) {
            a.v = Math.min(165, a.v + 3.2 * dt);
            if (a.v > 148) { a.onGround = false; a.pitch = -8; a.alt = ctx.elev + 5; this.lastTakeoff = t; }
          } else {
            a.v = Math.min(220, a.v + 1.5 * dt);
            a.alt += (2400 / 60) * dt;
            if (a.alt - ctx.elev > 400) a.gear = false;
            if (!a.handedOff && distNm(a.pos, ctx.th) > 3) { a.handedOff = true; this.radio(a, 'TWR', 'depart'); }
            if (distNm(a.pos, ctx.th) > 25 || a.alt - ctx.elev > 12000) a.state = 'gone';
          }
          a.pos = move(a.pos, a.hdg, a.v * KT * dt);
          break;
        }
        case 'approach': {
          a.d = distNm(a.pos, ctx.th);
          // espacement : au moins 3 NM derrière l'avion qui précède sur la finale
          const ahead = this.arrivalAhead(a);
          let target = a.d > 5 ? 160 : 140;
          if (ahead != null && ahead < 3.2) target = 125;
          a.v = a.v < target ? Math.min(target, a.v + 1 * dt) : Math.max(target, a.v - 1.5 * dt);
          if (a.d < 9) a.gear = true;
          const brg = bearing(a.pos, ctx.th);
          a.hdg = turnTo(a.hdg, a.d > 0.3 ? brg : ctx.hdg, 3 * dt);
          a.alt = ctx.elev + Math.max(0, a.d * 318) + 50;
          a.pitch = -2.5;
          a.pos = move(a.pos, a.hdg, a.v * KT * dt);
          if (a.d < 0.7 && !a.cleared) { this.goAround(a); break; }
          // passage du seuil (on est au-delà)
          const al = Airport.alongRunway(a.pos, ctx.th, ctx.end);
          if (al.t > 0.03) { a.state = 'rollout'; a.onGround = true; a.pitch = 0; a.alt = ctx.elev; a.v = 135; }
          break;
        }
        case 'goaround':
          a.alt += (2000 / 60) * dt; a.v = Math.min(200, a.v + 2 * dt); a.pitch = -7; a.gear = a.alt - ctx.elev < 500;
          a.pos = move(a.pos, a.hdg, a.v * KT * dt);
          if (distNm(a.pos, ctx.th) > 6) a.state = 'gone';
          break;
        case 'rollout': {
          a.hdg = turnTo(a.hdg, ctx.hdg, 5 * dt);
          a.v = Math.max(22, a.v - 3.2 * dt);
          a.pos = move(a.pos, a.hdg, a.v * KT * dt);
          const al = Airport.alongRunway(a.pos, ctx.th, ctx.end);
          if (a.v <= 25 || al.t > 0.92) {
            const gates = ctx.L.gates.filter((g) => this.ai.every((o) => o === a || !o.gate || o.gate !== g.ref));
            const g = gates.length ? gates[Math.floor(this.rand() * gates.length)] : null;
            // on dégage par une vraie sortie (taxiway relié à la piste) en suivant l'axe jusqu'à elle
            const rx = Airport.runwayExit(ctx.L, a.pos, ctx.th, ctx.end, g, 60);
            if (rx) {
              a.path = [{ ...a.pos }, rx.abeam, ...rx.pts];
            } else {
              const ex = Airport.exitPoint(ctx.L, move(a.pos, a.hdg, 150), ctx.th, ctx.end);
              const r = ex && g ? Airport.taxiBetween(ctx.L, ex, g) : null;
              a.path = [{ ...a.pos }, ...(ex ? [ex] : []), ...(r ? r.pts : [])];
            }
            if (g) a.path.push({ lat: g.lat, lon: g.lon });
            a.gateTarget = g;
            a.gate = g && g.ref; a.state = 'vacate'; a.light = false;
            this.radio(a, 'TWR', 'vacate');
          }
          break;
        }
        case 'vacate':
        case 'taxi_in': {
          const doneP = this.followPath(a, dt, a.state === 'vacate' ? 14 : 16);
          if (a.state === 'vacate' && Airport.alongRunway(a.pos, ctx.th, ctx.end).xt > 70) a.state = 'taxi_in';
          if (doneP) {
            a.state = 'parked_in'; a.until = t + 45000; a.v = 0;
            const g = a.gateTarget;
            if (g) { const sp = standPose(ctx.L, g); a.pos = sp.pos; a.hdg = sp.hdg; a.gateObj = g; }
          }
          break;
        }
        case 'parked_in':
          // le vol réel est arrivé : il reste garé au parking, sauf s'il faut de la place pour d'autres vols
          if (t > a.until) { a.state = 'static'; a.static = true; a.kind = 'park'; a.until = Infinity; }
          break;
      }
    }

    // Distance (NM) à l'avion qui précède sur la finale (IA ou joueur)
    arrivalAhead(a) {
      let best = null;
      const consider = (p, d) => { if (d < a.d - 0.2) { const gap = a.d - d; if (best == null || gap < best) best = gap; } };
      for (const o of this.ai) if (o !== a && o.kind === 'arr' && (o.state === 'approach') && o.d != null) consider(o.pos, o.d);
      const pd = this.playerFinal(); if (pd != null) consider(this.tel, pd);
      return best;
    }
    // Distance du joueur au seuil s'il est en finale de cette piste
    playerFinal() {
      const tel = this.tel, c = this.ctx; if (!tel || tel.onGround || !c) return null;
      const d = distNm(tel, c.P.th);
      if (d > 15 || (tel.alt != null && tel.alt - c.elev > 5000)) return null;
      if (angDiff(bearing(tel, c.P.th), c.P.hdg) > 30) return null;
      return d;
    }

    // ---------- État de la piste ----------
    rwyOf(a) { const c = this.ctx; return a.kind === 'dep' ? c.D : c.A; }
    // avion qui occupe la piste (même bande de piste que « strip », ou n'importe laquelle si non précisée)
    // Deux pistes « en conflit » : la même, ou qui se croisent / passent à moins de 200 m l'une de l'autre
    stripsConflict(a, b) {
      if (!a || !b) return true;
      if (a === b) return true;
      const c = this.ctx; if (!c) return true;
      this.conflictCache = this.conflictCache || {};
      const key = a < b ? a + '|' + b : b + '|' + a;
      if (key in this.conflictCache) return this.conflictCache[key];
      const ra = c.L.runways.find((r) => r.ref === a), rb = c.L.runways.find((r) => r.ref === b);
      let res = true;
      if (ra && rb) {
        const A1 = ra.pts[0], A2 = ra.pts[ra.pts.length - 1], B1 = rb.pts[0], B2 = rb.pts[rb.pts.length - 1];
        // distance minimale entre les deux axes (échantillonnage tous les ~50 m)
        let min = Infinity;
        const n = Math.max(2, Math.ceil(M(A1, A2) / 50));
        for (let i = 0; i <= n; i++) {
          const p = { lat: A1.lat + (A2.lat - A1.lat) * i / n, lon: A1.lon + (A2.lon - A1.lon) * i / n };
          const al = Airport.alongRunway(p, B1, B2);
          const d = al.t >= 0 && al.t <= 1 ? al.xt : Math.min(M(p, B1), M(p, B2));
          if (d < min) min = d;
        }
        res = min < 200;
      }
      this.conflictCache[key] = res;
      return res;
    }
    // Piste occupée par le joueur : celle sur laquelle il roule, ou sa piste d'atterrissage en courte finale
    playerStrip() {
      const tel = this.tel, c = this.ctx; if (!tel || !c || tel.lat == null) return null;
      if (tel.onGround) return Airport.runwayAt(c.L, tel);
      const pd = this.playerFinal();
      return pd != null && pd < 3 ? c.P.strip : null;
    }
    playerBlocks(strip) { const ps = this.playerStrip(); return !!ps && this.stripsConflict(ps, strip); }

    runwayOccupant(exclude, strip) {
      const c = this.ctx; if (!c) return null;
      for (const a of this.ai) {
        if (a === exclude) continue;
        if (strip && !this.stripsConflict(this.rwyOf(a).strip, strip)) continue;
        if (['lined', 'rollout', 'cleared_to'].includes(a.state) || (a.state === 'takeoff' && a.onGround) || (a.state === 'lineup' && a.path && a.path.length <= 2) || a.state === 'vacate') return a;
      }
      return null;
    }
    playerOnRunway(R) {
      const tel = this.tel, c = this.ctx; if (!tel || !c || !tel.onGround) return false;
      R = R || c.P;
      const al = Airport.alongRunway(tel, R.th, R.end);
      return al.t > -0.03 && al.t < 1.03 && al.xt < 40;
    }
    // arrivée la plus proche sur une bande de piste donnée (IA ou joueur)
    nearestArrival(exclude, strip) {
      let best = null;
      for (const a of this.ai) if (a !== exclude && a.state === 'approach' && a.d != null && (!strip || this.stripsConflict(this.rwyOf(a).strip, strip))) best = best == null ? a.d : Math.min(best, a.d);
      const pd = this.playerFinal(); if (pd != null && (!strip || this.stripsConflict(this.ctx.P.strip, strip))) best = best == null ? pd : Math.min(best, pd);
      return best;
    }

    // Une piste (bande « 02/20 ») est-elle occupée, ou un avion est-il en courte finale dessus ?
    stripBusy(ref) {
      if (!this.enabled || !this.ctx) return null;
      const occ = this.runwayOccupant(null, ref);
      if (occ) return { who: occ, reason: occ.kind === 'arr' ? 'landing' : 'departure' };
      for (const a of this.ai) if (a.state === 'approach' && a.d != null && a.d < 3 && this.rwyOf(a).strip === ref) return { who: a, reason: 'landing' };
      return null;
    }
    // Pour le moteur ATC : le joueur peut-il décoller / atterrir ?
    departureBlock() {
      if (!this.enabled || !this.ctx || this.ctx.side !== 'dep') return null;
      const strip = this.ctx.P.strip;
      const occ = this.runwayOccupant(null, strip);
      if (occ) return { who: occ, reason: occ.kind === 'arr' ? 'landing' : 'departure' };
      for (const a of this.ai) if (a.state === 'approach' && a.d != null && a.d < 5 && this.rwyOf(a).strip === strip) return { who: a, reason: 'final' };
      const last = this.ai.find((a) => a.state === 'takeoff' && !a.onGround && this.rwyOf(a).strip === strip && this.now - (this.lastTakeoff || 0) < 60000);
      if (last) return { who: last, reason: 'departure' };
      return null;
    }
    landingBlock() {
      if (!this.enabled || !this.ctx) return null;
      const occ = this.runwayOccupant(null, this.ctx.P.strip);
      return occ ? { who: occ, reason: occ.kind === 'arr' ? 'landing' : 'departure' } : null;
    }
    typeSay(a) { return a.type ? { text: a.type, speech: a.type.replace(/^A(\d)/, 'A $1') } : { text: this.T('un avion', 'traffic'), speech: this.T('un avion', 'traffic') }; }

    // ---------- Contrôle de la Tour ----------
    control(ctx) {
      // départs IA en attente au point d'arrêt
      const holding = this.ai.filter((a) => a.state === 'hold').sort((x, y) => x.holdSince - y.holdSince);
      const playerWaiting = this.engine && ['HOLDING', 'LINEUP'].includes(this.engine.phase) && ctx.side === 'dep' && this.engine.flags.waitDep;
      const playerRolling = this.engine && ['LINEUP', 'TAKEOFF'].includes(this.engine.phase) && this.tel && this.tel.onGround && ctx.side === 'dep';
      const Ds = ctx.D.strip, As = ctx.A.strip;
      const playerOnD = playerRolling && this.stripsConflict(ctx.P.strip, Ds);
      if (holding.length && !playerWaiting && !playerOnD && !this.runwayOccupant(null, Ds) && !this.playerBlocks(Ds)) {
        const arr = this.nearestArrival(null, Ds);
        if ((arr == null || arr > 6) && this.now - (this.lastTakeoff || -1e9) > 75000) this.request(holding[0], 'takeoff');
      }
      // arrivées IA : autorisation d'atterrissage à 6 NM si piste libre (sinon plus tard, ou remise de gaz)
      for (const a of this.ai) {
        if (a.state !== 'approach' || a.cleared || a.d == null) continue;
        if (a.d < 6 && !this.runwayOccupant(a, As) && !this.playerBlocks(As) && !(playerRolling && this.stripsConflict(ctx.P.strip, As))) this.request(a, 'land');
        else if (a.d < 4 && !a.contApp) { a.contApp = true; this.radio(a, 'TWR', 'continue'); }
      }
    }

    request(a, what) {
      if (a.pendingReq) return;
      if (what === 'taxi') { a.pendingReq = true; this.radio(a, 'GND', 'taxi', () => { a.state = 'taxi_out'; a.pendingReq = false; }); a.state = 'taxi_wait'; }
      if (what === 'takeoff') {
        a.pendingReq = true; a.state = 'cleared_to';
        this.radio(a, 'TWR', 'takeoff', () => {
          a.pendingReq = false;
          const c = this.ctx.D;
          a.path = [{ ...a.pos }, move(c.th, c.hdg, 60)];
          a.state = 'lineup'; a.afterLineup = 'takeoff';
        });
      }
      if (what === 'land') { a.cleared = true; this.radio(a, 'TWR', 'land'); }
    }
    goAround(a) { a.state = 'goaround'; a.light = true; this.radio(a, 'TWR', 'goaround'); }

    // ---------- Radio ----------
    T(fr, en) { return this.engine ? this.engine.T(fr, en) : fr; }
    radio(a, role, kind, after) {
      const e = this.engine, c = this.ctx; if (!e || !c || !e.flight) { if (after) after(); return; } // sans plan de vol : pas de contrôleur à écouter
      // chaque avion parle anglais, ou sa langue s'il est chez lui (Iberia en Espagne…)
      if (!e.withLang || this._inLang) return this._radio(a, role, kind, after);
      const L = e.aiLang ? e.aiLang(a.cs, c.side) : e.lang;
      this._inLang = true;
      try { e.withLang(L, () => this._radio(a, role, kind, after, L)); } finally { this._inLang = false; }
    }
    _radio(a, role, kind, after, lang) {
      const e = this.engine, c = this.ctx;
      const cs = { text: a.cs, speech: callsignSay(a.cs, e.lang) };
      const rn = this.rwyOf(a).name;
      const rw = { text: rn, speech: digits(String(rn).replace(/[LRC]$/, ''), e.lang) + ({ L: e.T(' gauche', ' left'), R: e.T(' droite', ' right'), C: e.T(' centre', ' center') }[String(rn).slice(-1)] || '') };
      const W = e.wind ? e.wind(c.side) : null;
      const st = e._st(role === 'GND' ? 'GND' : 'TWR', c.side);
      let atc = null, pilot = null;
      const via = a.via && a.via.length ? { text: a.via.join(', '), speech: a.via.map((n) => digits(n, e.lang)).join(', ') } : null;
      switch (kind) {
        case 'taxi':
          pilot = e.M({ text: st.name, speech: st.name }, ',', cs, ',', e.T('prêt à rouler', 'ready to taxi'));
          atc = e.M(cs, ',', e.T("roulez point d'arrêt piste", 'taxi to holding point runway'), rw, via ? [',', e.T('via', 'via'), via] : null);
          break;
        case 'takeoff':
          atc = e.M(cs, ',', W, ',', e.T('piste', 'runway'), rw, ',', e.T('autorisé décollage', 'cleared for take-off'));
          pilot = e.M(e.T('Autorisé décollage piste', 'Cleared for take-off runway'), rw, ',', cs);
          [atc, pilot] = [atc, pilot]; break;
        case 'land':
          atc = e.M(cs, ',', W, ',', e.T('piste', 'runway'), rw, ',', e.T('autorisé atterrissage', 'cleared to land'));
          pilot = e.M(e.T('Autorisé atterrissage piste', 'Cleared to land runway'), rw, ',', cs);
          break;
        case 'continue':
          atc = e.M(cs, ',', e.T('continuez l\'approche, trafic sur la piste', 'continue approach, traffic on the runway'));
          pilot = e.M(e.T('Continuons', 'Continuing'), ',', cs);
          break;
        case 'goaround':
          atc = e.M(cs, ',', e.T('remettez les gaz, je répète, remettez les gaz', 'go around, I say again, go around'));
          pilot = e.M(e.T('Remettons les gaz', 'Going around'), ',', cs);
          break;
        case 'depart': {
          const d = e._st('DEP', c.side);
          atc = e.M(cs, ',', e.T('contactez', 'contact'), { text: d.name, speech: d.name }, e.fq(d.freq), ',', e.T('au revoir', 'good day'));
          pilot = e.M(e.fq(d.freq), ',', cs);
          break;
        }
        case 'vacate': {
          const g = e._st('GND', c.side);
          atc = e.M(cs, ',', e.T('dégagez dès que possible, contactez le Sol', 'vacate when able, contact Ground'), e.fq(g.freq));
          pilot = e.M(e.T('Dégageons', 'Vacating'), ',', e.fq(g.freq), ',', cs);
          break;
        }
      }
      const pilotFirst = kind === 'taxi';
      const msgs = pilotFirst ? [{ from: 'aipilot', m: pilot }, { from: 'atc', m: atc }] : [{ from: 'atc', m: atc }, { from: 'aipilot', m: pilot }];
      this.queue.push({ role, side: c.side, station: st, cs: a.cs, msgs, after, at: this.now, lang: lang || e.lang });
    }
    // Les échanges sont émis l'un après l'autre, sans couper le joueur ni son contrôleur
    flushRadio() {
      if (!this.queue.length || this.now < this.radioBusyUntil) return;
      const e = this.engine;
      const q = this.queue[0];
      const audible = this.audible ? this.audible(q.role, q.side) : false;
      if (audible && e && (e.busy || e.pending)) return;
      if (audible && this.io.radioBusy && this.io.radioBusy()) return;
      this.queue.shift();
      let delay = 0;
      if (audible) {
        q.msgs.forEach((x, i) => {
          setTimeout(() => this.io.radio({ from: x.from, station: q.station.name, freq: q.station.freq, role: q.role, cs: q.cs, text: x.m.text, speech: x.m.speech, lang: q.lang }), delay);
          delay += 1800 + x.m.text.length * 55;
        });
      }
      this.radioBusyUntil = this.now + delay + (audible ? 1500 : 0);
      if (q.after) setTimeout(q.after, audible ? delay : 0);
    }
  }

  return Traffic;
});
