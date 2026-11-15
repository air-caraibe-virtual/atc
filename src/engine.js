/* ATC — moteur ATC (phases du vol, phraséologie FR/EN, surveillance).
   Fonctionne dans la fenêtre de l'appli et sous Node (tests). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ATC = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- Outils de phraséologie ----------
  const DIG = {
    fr: ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf'],
    en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'],
  };
  const PHON = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike',
    'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu'];
  const TELEPHONY = {
    FWI: 'French West', AFR: 'Air France', TVF: 'France Soleil', CRL: 'Corsair', ACX: 'French West', FWE: 'French West',
    TSC: 'Air Transat', ACA: 'Air Canada', EZY: 'Easy', EJU: 'Alpine', EZS: 'Topswiss', RYR: 'Ryanair', BAW: 'Speedbird',
    DLH: 'Lufthansa', KLM: 'KLM', IBE: 'Iberia', VLG: 'Vueling', TAP: 'Air Portugal', SWR: 'Swiss', AAL: 'American',
    DAL: 'Delta', UAL: 'United', JBU: 'Jetblue', SWA: 'Southwest', FDX: 'Fedex', UPS: 'UPS', UAE: 'Emirates',
    QTR: 'Qatari', ITY: 'Itarrow', AZA: 'Alitalia', BEL: 'Beeline', TRA: 'Transavia', TVS: 'Skytravel', HOP: 'Air Hop',
    VOE: 'Volotea', AEA: 'Europa', LBT: 'Nouvelair', RAM: 'Royalair Maroc', DAH: 'Air Algerie', CFG: 'Condor', WIF: 'Wideroe',
  };

  // Noms radio des stations quand la ville ne suffit pas (plusieurs aéroports)
  const STATION_NAMES = {
    LFPG: 'De Gaulle', LFPO: 'Orly', LFPB: 'Le Bourget', LFOB: 'Beauvais', LFLL: 'Lyon', LFML: 'Marseille', LFBO: 'Toulouse',
    LFSB: 'Bâle-Mulhouse', LFMN: 'Nice', LFRS: 'Nantes', LFBD: 'Bordeaux', LFQQ: 'Lille', LFST: 'Strasbourg', LFMP: 'Perpignan',
    TFFR: 'Pointe-à-Pitre', TFFF: 'Fort-de-France', TFFJ: 'Saint-Barth', TFFG: 'Grand-Case', SOCA: 'Cayenne', FMEE: 'Réunion',
    EGLL: 'Heathrow', EGKK: 'Gatwick', EGSS: 'Stansted', EGLC: 'City', KJFK: 'Kennedy', KLGA: 'La Guardia', KEWR: 'Newark',
    EDDF: 'Frankfurt', EDDM: 'München', EHAM: 'Schiphol', EBBR: 'Brussels', LEMD: 'Madrid', LEBL: 'Barcelona', LIRF: 'Roma',
    LIMC: 'Malpensa', LIML: 'Linate', LSGG: 'Genève', LSZH: 'Zürich', OMDB: 'Dubai', CYUL: 'Montréal', CYYZ: 'Toronto',
  };
  const letterSay = (c) => (/[A-Z]/.test(c) ? PHON[c.charCodeAt(0) - 65] : c);
  function digits(s, lang) {
    return String(s).split('').map((c) => {
      if (/\d/.test(c)) return DIG[lang][+c];
      if (c === '.') return lang === 'fr' ? 'décimal' : 'decimal';
      if (/[A-Z]/.test(c)) return letterSay(c);
      return c;
    }).filter((x) => x.trim()).join(' ');
  }
  function freqTxt(f) { return f == null ? '—' : Number(f).toFixed(3); }
  function freqSay(f, lang) {
    let s = Number(f).toFixed(3).replace(/0+$/, '');
    if (s.endsWith('.')) s += '0';
    return digits(s, lang);
  }
  function rwySay(r, lang) {
    const m = String(r || '').toUpperCase().match(/^(\d{1,2})([LRC]?)$/);
    if (!m) return String(r || '');
    const side = { L: { fr: 'gauche', en: 'left' }, R: { fr: 'droite', en: 'right' }, C: { fr: 'centre', en: 'center' } }[m[2]];
    return digits(m[1].padStart(2, '0'), lang) + (side ? ' ' + side[lang] : '');
  }
  function procSay(p, lang) {
    const m = String(p || '').toUpperCase().match(/^([A-Z]+)(\d)([A-Z]?)$/);
    if (!m) return p;
    const name = m[1].charAt(0) + m[1].slice(1).toLowerCase();
    return name + ' ' + DIG[lang][+m[2]] + (m[3] ? ' ' + letterSay(m[3]) : '');
  }
  function splitCallsign(cs) {
    const m = String(cs || '').toUpperCase().replace(/\s/g, '').match(/^([A-Z]{3})(\d[0-9A-Z]*)$/);
    return m ? { airline: m[1], number: m[2] } : null;
  }
  function callsignSay(cs, lang) {
    const p = splitCallsign(cs);
    if (p && TELEPHONY[p.airline]) return TELEPHONY[p.airline] + ' ' + digits(p.number, lang);
    return digits(String(cs || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), lang);
  }
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  }
  function hash(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---------- Géographie ----------
  const R_NM = 3440.065;
  const rad = (d) => (d * Math.PI) / 180;
  function distNm(a, b) {
    if (!a || !b || a.lat == null || b.lat == null) return null;
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function bearing(a, b) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  }

  // ---------- Fréquences de secours (si le simulateur ne les donne pas) ----------
  const RANGES = { DEL: [121.0, 121.45], GND: [121.6, 121.975], TWR: [118.0, 120.975], DEP: [119.0, 128.0], APP: [119.0, 136.0], CTR: [125.0, 135.975], ATIS: [126.0, 128.975] };
  function fakeFreq(seed, role) {
    const [lo, hi] = RANGES[role];
    const steps = Math.round((hi - lo) / 0.025);
    return +(lo + (hash(seed + role) % (steps + 1)) * 0.025).toFixed(3);
  }

  // ---------- Météo (METAR -> phrases) ----------
  function parseMetar(m) {
    if (!m) return null;
    const raw = m.rawOb || m.raw || '';
    const out = { raw, temp: m.temp, dew: m.dewp, wdir: m.wdir, wspd: m.wspd, wgst: m.wgst, qnh: m.altim != null ? Math.round(m.altim) : null, clouds: [], vis: null, cavok: /\bCAVOK\b/.test(raw), time: m.reportTime || m.obsTime };
    const v = raw.match(/\s(\d{4})(NDV)?\s/); if (v) out.vis = { m: +v[1] };
    const sm = raw.match(/\s(\d+)SM\s/); if (sm) out.vis = { sm: +sm[1] };
    for (const c of raw.matchAll(/\b(FEW|SCT|BKN|OVC)(\d{3})/g)) out.clouds.push({ cover: c[1], base: +c[2] * 100 });
    out.nsc = /\b(NSC|SKC|CLR|NCD)\b/.test(raw);
    return out;
  }
  function windParts(w, lang) {
    if (!w || w.wspd == null) return { text: lang === 'fr' ? 'vent non disponible' : 'wind not available', speech: lang === 'fr' ? 'vent non disponible' : 'wind not available' };
    const kt = lang === 'fr' ? 'nœuds' : 'knots';
    if (w.wspd < 1) return { text: lang === 'fr' ? 'vent calme' : 'wind calm', speech: lang === 'fr' ? 'vent calme' : 'wind calm' };
    if (w.wdir === 'VRB' || w.wdir == null) return { text: `${lang === 'fr' ? 'vent variable' : 'wind variable'} ${w.wspd} kt`, speech: `${lang === 'fr' ? 'vent variable' : 'wind variable'}, ${w.wspd} ${kt}` };
    const d = String(Math.round(w.wdir / 10) * 10 % 360 || 360).padStart(3, '0');
    const g = w.wgst ? (lang === 'fr' ? `, rafales ${w.wgst} ${kt}` : `, gusting ${w.wgst} ${kt}`) : '';
    return {
      text: `${lang === 'fr' ? 'vent' : 'wind'} ${d}° ${w.wspd} kt${w.wgst ? ' G' + w.wgst : ''}`,
      speech: `${lang === 'fr' ? 'vent' : 'wind'} ${digits(d, lang)} ${lang === 'fr' ? 'degrés' : 'degrees'}, ${w.wspd} ${kt}${g}`,
    };
  }
  function usesInHg(icao) { return /^[KPC]/.test(icao || '') && !/^PA$/.test(icao); }

  // ---------- Libellés ----------
  const ROLE = {
    fr: { DEL: 'Délivrance', GND: 'Sol', TWR: 'Tour', DEP: 'Départ', APP: 'Approche', CTR: 'Contrôle' },
    en: { DEL: 'Delivery', GND: 'Ground', TWR: 'Tower', DEP: 'Departure', APP: 'Approach', CTR: 'Control' },
  };
  const PHASE_LABEL = {
    fr: { IDLE: 'Aucun vol', PRE: 'Clairance', CLEARED: 'Autorisé', STARTUP: 'Mise en route', TAXI_OUT: 'Roulage', HOLDING: "Point d'arrêt", LINEUP: 'Alignement', TAKEOFF: 'Décollage', DEP_CHECKIN: 'Départ', CLIMB: 'Montée', CTR_CHECKIN: 'Contrôle', CRUISE: 'Croisière', DESCENT: 'Descente', APP_CHECKIN: 'Approche', APPROACH: 'Approche', FINAL: 'Finale', TWR_CHECKIN: 'Finale', LANDING: 'Atterrissage', VACATING: 'Dégagement', TAXI_IN: 'Roulage arrivée', DONE: 'Terminé' },
    en: { IDLE: 'No flight', PRE: 'Preflight', CLEARED: 'Cleared', STARTUP: 'Start-up', TAXI_OUT: 'Taxi', HOLDING: 'Holding point', LINEUP: 'Line-up', TAKEOFF: 'Take-off', DEP_CHECKIN: 'Departure', CLIMB: 'Climb', CTR_CHECKIN: 'Control', CRUISE: 'Cruise', DESCENT: 'Descent', APP_CHECKIN: 'Approach', APPROACH: 'Approach', FINAL: 'Final', TWR_CHECKIN: 'Final', LANDING: 'Landing', VACATING: 'Vacating', TAXI_IN: 'Taxi-in', DONE: 'Done' },
  };
  const AIRBORNE = ['TAKEOFF', 'DEP_CHECKIN', 'CLIMB', 'CTR_CHECKIN', 'CRUISE', 'DESCENT', 'APP_CHECKIN', 'APPROACH', 'FINAL', 'TWR_CHECKIN', 'LANDING'];
  const RESUME_POINTS = ['PRE', 'HOLDING', 'DEP_CHECKIN', 'CRUISE', 'DESCENT', 'APP_CHECKIN', 'TWR_CHECKIN', 'VACATING'];

  // ---------- Moteur ----------
  class AtcEngine {
    constructor(opts = {}) {
      this.lang = opts.lang || 'fr';
      this.onMessage = opts.onMessage || (() => {});
      this.onChange = opts.onChange || (() => {});
      this.rand = opts.rand || Math.random;
      this.delay = opts.delay || [1600, 3200];
      this.now = 0;
      this.queue = [];
      this.tel = null;
      this.reset();
    }

    reset() {
      this.greeted = {};
      this.flight = null; this.phase = 'IDLE'; this.station = null; this.pending = null; this.busy = false;
      this.cleared = null; this.clearDir = null; this.flags = {}; this.queue = []; this.lastWarn = 0; this.target = null; this.offer = null;
      this.onChange();
    }

    T(fr, en) { return this.lang === 'fr' ? fr : en; }

    // ----- chargement d'un vol -----
    load(fl) {
      this.reset();
      const f = (this.flight = fl);
      for (const side of ['dep', 'arr']) {
        const a = f[side];
        a.wx = parseMetar(a.metar);
        a.freqs = a.freqs || {};
        const need = side === 'dep' ? ['GND', 'TWR', 'DEP', 'ATIS'] : ['APP', 'TWR', 'GND', 'ATIS'];
        for (const r of need) if (!a.freqs[r]) a.freqs[r] = r === 'DEP' && a.freqs.APP ? a.freqs.APP : fakeFreq(a.icao, r);
        if (side === 'dep' && a.freqs.DEL === undefined) a.freqs.DEL = fakeFreq(a.icao, 'DEL');
        if (a.ta == null) a.ta = usesInHg(a.icao) ? 18000 : 5000;
        if (a.tl == null) a.tl = usesInHg(a.icao) ? 18000 : a.ta + 1000;
        a.city = STATION_NAMES[a.icao] || a.city || a.icao;
      }
      f.ctr = f.ctr || [fakeFreq(f.dep.icao, 'CTR'), fakeFreq(f.arr.icao, 'CTR')];
      f.squawk = f.squawk || this._squawk();
      f.total = distNm(f.dep, f.arr) || 0;
      f.initAlt = Math.min(f.cruise, Math.max(4000, Math.ceil(((f.dep.elev || 0) + 3000) / 1000) * 1000));
      f.depLevel = Math.min(f.cruise, f.cruise > 15000 ? 15000 : f.cruise);
      f.descAlt = 11000;
      f.steps = (f.steps || []).filter((x) => x && x.alt && x.lat != null).map((x) => ({ ...x, done: false }));
      this.target = f.cruise;
      f.appAlt = Math.max(3000, Math.ceil(((f.arr.elev || 0) + 2500) / 1000) * 1000);
      this.phase = 'PRE';
      this.station = f.dep.freqs.DEL ? this._st('DEL', 'dep') : this._st('GND', 'dep');
      this._sys(this.T(
        `Plan de vol chargé : ${f.callsign} ${f.dep.icao} → ${f.arr.icao}, niveau ${Math.round(f.cruise / 100)}. Contactez ${this.station.name} sur ${freqTxt(this.station.freq)}.`,
        `Flight plan loaded: ${f.callsign} ${f.dep.icao} → ${f.arr.icao}, FL${Math.round(f.cruise / 100)}. Contact ${this.station.name} on ${freqTxt(this.station.freq)}.`));
      this.onChange();
    }

    _squawk() {
      let s; do { s = Array.from({ length: 4 }, () => Math.floor(this.rand() * 8)).join(''); } while (/^(7500|7600|7700|1200|2000|7000|0000)$/.test(s));
      return s;
    }

    _st(role, side) {
      const f = this.flight;
      if (role === 'CTR') {
        const a = side === 'ctr2' ? f.arr : f.dep;
        return { role, side, name: `${a.city} ${ROLE[this.lang].CTR}`, freq: f.ctr[side === 'ctr2' ? 1 : 0] };
      }
      const a = f[side];
      return { role, side, name: `${a.city} ${ROLE[this.lang][role]}`, freq: a.freqs[role] };
    }

    // ----- mots -----
    cs() { return { text: this.flight.callsign, speech: callsignSay(this.flight.callsign, this.lang) }; }
    alt(ft, ref) {
      const fl = ft >= ref;
      if (fl) {
        const n = String(Math.round(ft / 100)).padStart(3, '0');
        return { text: this.T(`niveau ${Math.round(ft / 100)}`, `FL${Math.round(ft / 100)}`), speech: this.T(`niveau ${digits(n, 'fr')}`, `flight level ${digits(n, 'en')}`) };
      }
      const r = Math.round(ft / 100) * 100;
      return { text: this.T(`${r} pieds`, `${r} ft`), speech: this.T(`${r} pieds`, `${r} feet`) };
    }
    qnh(side) {
      const a = this.flight[side];
      const q = a.wx && a.wx.qnh ? a.wx.qnh : 1013;
      if (usesInHg(a.icao)) {
        const inhg = (q * 0.02953).toFixed(2);
        return { text: this.T(`altimètre ${inhg}`, `altimeter ${inhg}`), speech: this.T(`altimètre ${digits(inhg.replace('.', ''), 'fr')}`, `altimeter ${digits(inhg.replace('.', ''), 'en')}`) };
      }
      return { text: `QNH ${q}`, speech: `QNH ${digits(String(q), this.lang)}` };
    }
    rwy(side) { const r = this.flight[side].rwy || '—'; return { text: r, speech: rwySay(r, this.lang) }; }
    fq(f) { return { text: freqTxt(f), speech: freqSay(f, this.lang) }; }
    sid() { const s = this.flight.sid; return s ? { text: s, speech: procSay(s, this.lang) } : null; }
    wind(side) { return windParts(this.flight[side].wx, this.lang); }
    atisLetter(side) {
      const a = this.flight[side];
      const h = a.wx && a.wx.time ? new Date(a.wx.time.replace(' ', 'T') + (/(Z|[+-]\d\d:?\d\d)$/.test(a.wx.time) ? '' : 'Z')).getUTCHours() : new Date().getUTCHours();
      return PHON[(hash(a.icao) + (isNaN(h) ? 0 : h)) % 26];
    }
    notamSide() { return ['PRE', 'CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'LINEUP'].includes(this.phase) ? 'dep' : 'arr'; }
    // « piste 06/24 fermée pour travaux jusqu'à 1800 UTC »
    closureMsg(c) {
      const names = c.rwys.map((r) => ({ text: r, speech: rwySay(r, this.lang) }));
      const rw = { text: names.map((n) => n.text).join('/'), speech: names.map((n) => n.speech).join(this.T(' barre ', ' slash ')) };
      let until = null;
      if (c.until) {
        const d = new Date(c.until), now = new Date();
        const hhmm = String(d.getUTCHours()).padStart(2, '0') + String(d.getUTCMinutes()).padStart(2, '0');
        if (d - now < 20 * 3600000) until = { text: this.T(`jusqu'à ${hhmm} UTC`, `until ${hhmm} UTC`), speech: this.T(`jusqu'à ${digits(hhmm, 'fr')} UTC`, `until ${digits(hhmm, 'en')} UTC`) };
        else {
          const day = d.getUTCDate(), mo = d.getUTCMonth();
          const MO = { fr: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'], en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] };
          const t = this.T(`jusqu'au ${day} ${MO.fr[mo]}`, `until ${MO.en[mo]} ${day}`);
          until = { text: t, speech: t };
        }
      }
      return this.M(this.T('piste', 'runway'), rw, this.T(c.works ? 'fermée pour travaux' : 'fermée', c.works ? 'closed for works' : 'closed'), until);
    }
    faceSay(h) {
      const fr = ['au nord', 'au nord-est', "à l'est", 'au sud-est', 'au sud', 'au sud-ouest', "à l'ouest", 'au nord-ouest'];
      const en = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
      const i = Math.round((((h % 360) + 360) % 360) / 45) % 8;
      const t = this.T('face ' + fr[i], 'facing ' + en[i]);
      return { text: t, speech: t };
    }
    // ---- Traversées de piste au roulage ----
    rwyPair(ref) {
      const parts = String(ref).split('/');
      return { text: parts.join('/'), speech: parts.map((r) => rwySay(r.trim(), this.lang)).join(this.T(' barre ', ' slash ')) };
    }
    holdShort(ref) {
      return { atc: this.M(this.T('maintenez avant la piste', 'hold short runway'), this.rwyPair(ref)), pilot: this.M(this.T('maintenons avant la piste', 'holding short runway'), this.rwyPair(ref)) };
    }
    // piste devant l'avion (moins de 250 m) pas encore autorisée à la traversée
    crossAhead() {
      const g = this.ground; if (!g || !g.ahead || this.pending) return null;
      if (!['TAXI_OUT', 'TAXI_IN'].includes(this.phase)) return null;
      const ref = g.ahead.ref;
      if (this.phase === 'TAXI_OUT' && this.flight && ref === this.flight.dep.rwyStrip) return null; // piste de départ : c'est le point d'arrêt
      if ((this.crossOK || new Set()).has(ref) || this.flags.crossWait === ref) return null;
      return g.ahead.dist < 250 ? ref : null;
    }
    crossLabel() { const c = this.crossAhead(); return this.T(`Avant la piste ${c}`, `Holding short ${c}`); }
    _crossClear(ref) {
      const f = this.flight, cs = this.cs();
      this.crossOK = this.crossOK || new Set();
      // prochaine traversée prévue sur l'itinéraire
      const list = (this.phase === 'TAXI_OUT' && f.dep.crossings) || [];
      const next = list[list.indexOf(ref) + 1];
      const hs = next ? this.holdShort(next) : null;
      const m = this.M(cs, ',', this.T('traversez la piste', 'cross runway'), this.rwyPair(ref), hs ? [',', hs.atc] : null);
      const rb = this.M(this.T('Traversons la piste', 'Crossing runway'), this.rwyPair(ref), hs ? [',', hs.pilot] : null, ',', cs);
      this._instruct(m, rb, () => { this.crossOK.add(ref); this.flags.crossWait = null; });
    }
    via(list) {
      if (!list || !list.length) return null;
      return { text: list.join(', '), speech: list.map((n) => digits(n, this.lang)).join(', ') };
    }
    curAlt() { const t = this.tel; return t && t.alt != null ? t.alt : null; }

    // Compose {text, speech} à partir de morceaux
    M(...parts) {
      const t = [], s = [];
      for (const p of parts.flat()) {
        if (p == null || p === '') continue;
        if (typeof p === 'string') { t.push(p); s.push(p); } else { t.push(p.text); s.push(p.speech); }
      }
      return { text: t.join(' ').replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim(), speech: s.join(' ').replace(/\s+([,.])/g, '$1').replace(/\s+/g, ' ').trim() };
    }

    // ----- émission -----
    _sys(text) { this.onMessage({ from: 'system', text, speech: text, at: this.now }); }
    // « bonjour » au premier échange avec chaque poste (comme à la radio en France)
    _greet(msg, who) {
      if (this.lang !== 'fr' || !this.station || /bonjour|arrêtez immédiatement|remettez les gaz|sans autorisation/i.test(msg.text)) return msg;
      this.greeted = this.greeted || {};
      const key = who + ':' + this.station.name;
      if (this.greeted[key]) return msg;
      this.greeted[key] = true;
      const cs = this.cs(), st = this.station.name;
      const ins = (m, after) => {
        const i = m.indexOf(after); if (i < 0) return null;
        const j = i + after.length;
        return m.slice(0, j) + ', bonjour' + m.slice(j);
      };
      // contrôleur : « AFR1511, bonjour, … » ; pilote : « Orly Sol, AFR1511, bonjour, … »
      const anchorT = who === 'atc' ? cs.text : (msg.text.startsWith(st) ? st + ', ' + cs.text : null);
      const anchorS = who === 'atc' ? cs.speech : (msg.speech.startsWith(st) ? st + ', ' + cs.speech : null);
      if (!anchorT || !msg.text.startsWith(anchorT)) return msg;
      const t = ins(msg.text, anchorT), s = ins(msg.speech, anchorS);
      return t && s ? { ...msg, text: t, speech: s } : msg;
    }
    _pilot(msg) { msg = this._greet(msg, 'pilot'); this.onMessage({ from: 'pilot', station: this.station && this.station.name, ...msg, at: this.now }); }
    _atc(msg, after, delay) {
      this.busy = true;
      const st = this.station;
      const d = delay != null ? delay : this.delay[0] + this.rand() * (this.delay[1] - this.delay[0]);
      this._at(d, () => {
        this.busy = false;
        const cur = this.station; this.station = st; msg = this._greet(msg, 'atc'); this.station = cur;
        this.onMessage({ from: 'atc', station: st && st.name, freq: st && st.freq, role: st && st.role, ...msg, at: this.now });
        if (after) after();
        this.onChange();
      });
      this.onChange();
    }
    _at(delay, fn) { this.queue.push({ at: this.now + delay, fn }); }
    _expect(readback, after) { this.pending = { readback, after }; }
    _instruct(msg, readback, after, delay) { this._atc(msg, () => this._expect(readback, after), delay); }
    _handoff(role, side, extra, after) {
      const st = this._st(role, side);
      const msg = this.M(this.cs(), ',', extra ? [extra, ','] : null, this.T('contactez', 'contact'), { text: st.name, speech: st.name }, this.fq(st.freq), ',', this.T('au revoir', 'good day'));
      const rb = this.M(this.fq(st.freq), ',', this.T('au revoir', 'good day'), ',', this.cs());
      this._instruct(msg, rb, () => { this.station = st; if (after) after(); this.onChange(); });
    }
    _setCleared(ft) {
      const cur = this.curAlt();
      this.clearDir = cur == null ? (ft >= (this.cleared || 0) ? 'up' : 'down') : (ft > cur + 200 ? 'up' : ft < cur - 200 ? 'down' : 'level');
      this.cleared = ft;
    }

    // ----- boucle -----
    tick(now, tel) {
      this.now = now;
      if (tel) this.tel = tel;
      const due = this.queue.filter((q) => q.at <= now);
      this.queue = this.queue.filter((q) => q.at > now);
      due.sort((a, b) => a.at - b.at).forEach((q) => q.fn());
      if (this.flight && this.tel && this.tel.connected && this.tel.inFlight !== false && !this.busy) this._auto(this.tel);
    }

    dist() {
      const t = this.tel; if (!this.flight || !t || t.lat == null) return { arr: null, dep: null };
      return { arr: distNm(t, this.flight.arr), dep: distNm(t, this.flight.dep) };
    }

    _auto(t) {
      const f = this.flight, ph = this.phase, cs = this.cs();
      const { arr: dArr, dep: dDep } = this.dist();
      const airborne = t.onGround === false && (t.agl == null || t.agl > 50);
      // On ne juge un décollage « sans autorisation » que si l'avion a d'abord été vu au sol près de l'aéroport de départ
      const nearDep = dDep != null && dDep < 15;
      if (t.onGround && nearDep) this.flags.seenGround = true;
      const illegalCheck = this.flags.seenGround && nearDep;

      // --- Infractions au sol ---
      if (['PRE', 'CLEARED', 'STARTUP'].includes(ph) && !this.pending) {
        if (airborne && illegalCheck) {
          this.flags.illegalTo = true;
          this.station = this._st('TWR', 'dep');
          this.phase = 'TAKEOFF';
          return this._atc(this.M(cs, ',', this.T('vous avez décollé sans autorisation, poursuivez et contactez le Départ.', 'you took off without a clearance, continue and contact Departure.')));
        }
        if (t.onGround && nearDep && t.gs > 12 && !this.flags.taxiWarn) {
          this.flags.taxiWarn = true;
          return this._atc(this.M(cs, ',', this.T("vous n'êtes pas autorisé à rouler, maintenez position.", 'you are not cleared to taxi, hold position.')));
        }
      }
      if (['TAXI_OUT', 'HOLDING', 'LINEUP'].includes(ph) && airborne && illegalCheck && !this.flags.illegalTo) {
        this.flags.illegalTo = true; this.pending = null;
        this.station = this._st('TWR', 'dep'); this.phase = 'TAKEOFF';
        return this._atc(this.M(cs, ',', this.T("décollage sans autorisation noté, poursuivez.", 'take-off without clearance noted, continue.')));
      }
      if (this.pending) return;

      // --- Surveillance en vol ---
      if (AIRBORNE.includes(ph) && airborne && this.now - this.lastWarn > 90000) {
        const a = this.curAlt();
        if (this.cleared != null && a != null && ['CLIMB', 'CRUISE', 'DESCENT', 'APPROACH', 'CTR_CHECKIN', 'APP_CHECKIN'].includes(ph)) {
          const bust = (this.clearDir !== 'down' && a > this.cleared + 500) || (this.clearDir === 'down' && a < this.cleared - 500) || (this.clearDir === 'level' && Math.abs(a - this.cleared) > 500);
          if (bust) {
            this.lastWarn = this.now;
            const ref = ['DESCENT', 'APPROACH', 'APP_CHECKIN'].includes(ph) ? f.arr.tl : f.dep.ta;
            return this._atc(this.M(cs, ',', this.T('vérifiez altitude, vous êtes autorisé', 'check altitude, you are cleared'), this.alt(this.cleared, ref)));
          }
        }
        if (a != null && a < 10000 && t.ias > 262 && !['TAKEOFF'].includes(ph)) {
          const key = ['DESCENT', 'APP_CHECKIN', 'APPROACH', 'FINAL', 'TWR_CHECKIN', 'LANDING'].includes(ph) ? 'spdArr' : 'spdDep';
          if (!this.flags[key]) {
            this.flags[key] = true; this.lastWarn = this.now;
            return this._atc(this.M(cs, ',', this.T('réduisez vitesse 250 nœuds ou moins en dessous du niveau 100.', 'reduce speed 250 knots or less below flight level 100.')));
          }
        }
      }

      // --- Pistes au sol : traversée en attente, incursion ---
      const g = this.ground;
      if (g && this.flags.crossWait && !(this.traffic && this.traffic.stripBusy && this.traffic.stripBusy(this.flags.crossWait))) {
        const ref = this.flags.crossWait; this.flags.crossWait = null; return this._crossClear(ref);
      }
      if (g && g.onRunway && ['CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'TAXI_IN'].includes(ph) && t.onGround) {
        const ref = g.onRunway;
        this.crossOK = this.crossOK || new Set(); this.incursion = this.incursion || new Set();
        const landedStrip = ph === 'TAXI_IN' && this.flight.arr.rwyStrip === ref;
        if (!landedStrip && !this.crossOK.has(ref) && !this.incursion.has(ref)) {
          this.incursion.add(ref);
          return this._atc(this.M(cs, ',', this.T('arrêtez immédiatement, vous êtes sur la piste', 'stop immediately, you are on runway'), this.rwyPair(ref), this.T('sans autorisation', 'without clearance')));
        }
      }

      // --- Infos trafic en route (Départ, Contrôle, Approche) ---
      if (airborne && this.traffic && this.traffic.trafficInfo && ['CLIMB', 'CRUISE', 'DESCENT', 'APPROACH'].includes(ph) && this.now - (this.lastTfc || 0) > 45000) {
        const ti = this.traffic.trafficInfo(t);
        if (ti) {
          this.lastTfc = this.now;
          const lvl = ti.dz === 0 ? this.T('même niveau', 'same level') : this.T(`${Math.abs(ti.dz)} pieds ${ti.dz > 0 ? 'au-dessus' : 'au-dessous'}`, `${Math.abs(ti.dz)} feet ${ti.dz > 0 ? 'above' : 'below'}`);
          const clk = { text: this.T(`${ti.clock} heures`, `${ti.clock} o'clock`), speech: this.T(`${ti.clock === 1 ? 'une heure' : ti.clock + ' heures'}`, `${ti.clock} o'clock`) };
          const nm = this.T(`${ti.nm} nautique${ti.nm > 1 ? 's' : ''}`, `${ti.nm} mile${ti.nm > 1 ? 's' : ''}`);
          const type = ti.type ? { text: ti.type, speech: ti.type.replace(/^A(\d)/, 'A $1') } : null;
          const m = this.M(cs, ',', this.T('trafic à', 'traffic'), clk, ',', nm, ',', lvl, type ? [',', this.T('un', 'a'), type] : null);
          const rb = this.M(this.T('Recherchons le trafic', 'Looking out'), ',', cs);
          return this._instruct(m, rb, null);
        }
      }

      // --- Déclencheurs automatiques ---
      switch (ph) {
        case 'TAKEOFF':
          if (airborne && (t.agl == null ? this.curAlt() - (f.dep.elev || 0) > 800 : t.agl > 800)) {
            return this._handoff('DEP', 'dep', null, () => { this.phase = 'DEP_CHECKIN'; });
          }
          break;
        case 'CLIMB': {
          const a = this.curAlt();
          if (this.station.role === 'DEP' && a != null && a >= this.cleared - 1500) {
            this.flags.ctrIdx = 1;
            return this._handoff('CTR', 'ctr1', null, () => { this.phase = 'CTR_CHECKIN'; });
          }
          if (this.station.role === 'CTR' && a != null && this.cleared >= this.target && a >= this.target - 300) { this.phase = 'CRUISE'; this.clearDir = 'level'; this.onChange(); }
          break;
        }
        case 'CRUISE': {
          if (dArr == null) break;
          const tod = this.tod();
          const a = this.curAlt();
          if (this.clearDir !== 'level' && a != null && Math.abs(a - this.cleared) < 200) { this.clearDir = 'level'; this.onChange(); }
          if (f.cruise > 12000 && dArr <= tod && !this.flags.descent) return this._giveDescent(true);
          if (f.cruise <= 12000 && dArr < 45) return this._handoff('APP', 'arr', null, () => { this.phase = 'APP_CHECKIN'; });
          if (!this.flags.midHandoff && f.total > 120 && dDep > f.total / 2 && dArr > tod + 30 && this.station.side === 'ctr1') {
            this.flags.midHandoff = true; this.flags.ctrIdx = 2;
            return this._handoff('CTR', 'ctr2', null, () => { this.phase = 'CTR_CHECKIN'; });
          }
          // Offre différée après un refus (trafic)
          if (this.offer && this.now >= this.offer.at && dArr > tod + 20) {
            const lvl = this.offer.alt; this.offer = null;
            if (lvl !== this.target) return this._levelClearance(lvl, 'offer');
          } else if (this.offer && dArr <= tod + 20) this.offer = null;
          // Paliers prévus dans le plan SimBrief
          const step = this.nextStep();
          if (step && !this.offer && this.clearDir === 'level') {
            const dDepFix = distNm(f.dep, step), dFix = distNm(t, step);
            if (dArr <= tod + 20) { step.done = true; }
            else if (dFix < 6 || dDep >= dDepFix - 2) {
              step.done = true;
              if (step.alt !== this.target) return this._levelClearance(step.alt, 'step', step);
            }
          }
          break;
        }
        case 'DESCENT':
          if (dArr != null && (dArr < 45 || (this.curAlt() < 12000 && dArr < 70))) {
            return this._handoff('APP', 'arr', null, () => { this.phase = 'APP_CHECKIN'; });
          }
          break;
        case 'APPROACH':
          if (dArr != null && dArr < 18) return this._approachClearance();
          break;
        case 'FINAL':
          if (dArr != null && dArr < 8) return this._handoff('TWR', 'arr', null, () => { this.phase = 'TWR_CHECKIN'; });
          break;
        case 'TWR_CHECKIN':
          if (this.station.role === 'TWR' && this.flags.contApp && !t.onGround) {
            if (!(this.traffic && this.traffic.landingBlock())) return this._landingClearance(true);
            if (dArr != null && dArr < 0.8) return this._atcGoAround();
            break;
          }
          if (this.station.role === 'TWR' && dArr != null && dArr < 3.5 && !t.onGround && !this.flags.twrClr) { this.flags.twrClr = true; return this._landingClearance(true); }
          break;
        case 'HOLDING':
          if (this.flags.waitDep && !(this.traffic && this.traffic.departureBlock())) {
            this.flags.waitDep = false;
            const m = this.M(cs, ',', this.wind('dep'), ',', this.T('piste', 'runway'), this.rwy('dep'), ',', this.T('autorisé décollage', 'cleared for take-off'));
            const rb = this.M(this.T('Autorisé décollage piste', 'Cleared for take-off runway'), this.rwy('dep'), ',', cs);
            return this._instruct(m, rb, () => { this.phase = 'TAKEOFF'; });
          }
          break;
        case 'LANDING':
          if (t.onGround && t.gs < 60) return this._vacate();
          break;
        case 'TAXI_IN':
          if (t.gs < 1 && t.parkingBrake && t.engineOn === false && !this.flags.autoEnd) { this.flags.autoEnd = true; return this.pilotAction('on_stand'); }
          break;
      }
      if (['APPROACH', 'FINAL', 'TWR_CHECKIN', 'APP_CHECKIN'].includes(ph) && t.onGround && this.flags.wasAirborne && dArr != null && dArr < 3) {
        this.phase = 'LANDING';
        this.station = this._st('TWR', 'arr');
        return this._atc(this.M(cs, ',', this.T("atterrissage sans autorisation noté.", 'landing without clearance noted.')));
      }
      if (airborne) this.flags.wasAirborne = true;
    }

    tod() {
      const f = this.flight; const a = this.curAlt();
      return ((Math.max(this.target || f.cruise, a || 0) - (f.arr.elev || 0)) / 1000) * 3 + 10;
    }
    nextStep() { return this.flight ? this.flight.steps.find((x) => !x.done) : null; }
    _levelClearance(lvl, reason, step) {
      const f = this.flight, up = lvl > (this.curAlt() || this.target);
      const alt = this.alt(lvl, f.dep.ta);
      const pre = reason === 'step' ? this.T(`pour votre palier${step && step.fix ? ' à ' + step.fix : ''},`, `for your step climb${step && step.fix ? ' at ' + step.fix : ''},`)
        : reason === 'offer' ? this.T('niveau demandé maintenant disponible,', 'requested level now available,') : null;
      const msg = this.M(this.cs(), ',', pre, up ? this.T('montez', 'climb') : this.T('descendez', 'descend'), alt);
      const rb = this.M(up ? this.T('Montons', 'Climb') : this.T('Descendons', 'Descend'), alt, ',', this.cs());
      this._instruct(msg, rb, () => { this.target = lvl; this._setCleared(lvl); this.clearDir = up ? 'up' : 'down'; this.phase = 'CRUISE'; });
    }
    levelOptions() {
      if (!this.flight) return [];
      const cur = Math.round((this.target || this.flight.cruise) / 1000) * 10, out = [];
      for (let fl = Math.max(100, cur - 60); fl <= Math.min(450, cur + 60); fl += 10) if (fl * 100 !== this.target) out.push(fl * 100);
      return out;
    }

    _giveDescent(atcInitiated) {
      const f = this.flight;
      this.flags.descent = true;
      const target = f.descAlt;
      const alt = this.alt(target, f.arr.tl);
      const q = target < f.arr.tl ? [',', this.qnh('arr')] : null;
      const msg = this.M(this.cs(), ',', this.T('descendez', 'descend'), alt, q, atcInitiated ? this.T(', à votre convenance', ', when ready') : null);
      const rb = this.M(this.T('Descendons', 'Descend'), alt, q, ',', this.cs());
      this._instruct(msg, rb, () => { this._setCleared(target); this.clearDir = 'down'; this.phase = 'DESCENT'; });
    }
    _approachClearance(afterGoAround) {
      const ils = this.T('approche ILS piste', 'ILS approach runway');
      const msg = this.M(this.cs(), ',', afterGoAround ? this.T('identifié radar,', 'radar contact,') : null, this.T('autorisé', 'cleared'), ils, this.rwy('arr'), ',', this.T('rappelez établi', 'report established'));
      const rb = this.M(this.T('Autorisé ILS piste', 'Cleared ILS runway'), this.rwy('arr'), ',', this.T('rappellerons établi', 'wilco'), ',', this.cs());
      this._instruct(msg, rb, () => { this.phase = 'FINAL'; this.flags.appClr = true; this.clearDir = 'down'; this.cleared = this.flight.appAlt; });
    }
    _landingClearance(unprompted) {
      const blk = this.traffic && this.traffic.landingBlock();
      if (blk) {
        this.flags.contApp = true;
        const m = this.M(this.cs(), ',', unprompted ? [this.station.name, ','] : null, this.T('continuez l\'approche,', 'continue approach,'), blk.reason === 'departure' ? this.T('trafic au départ,', 'departing traffic,') : this.T('trafic sur la piste,', 'traffic on the runway,'), this.traffic.typeSay(blk.who));
        const rb = this.M(this.T('Continuons', 'Continuing'), ',', this.cs());
        this._instruct(m, rb, () => { this.phase = 'TWR_CHECKIN'; this.station = this._st('TWR', 'arr'); });
        return;
      }
      this.flags.contApp = false;
      const msg = this.M(this.cs(), ',', unprompted ? [this.station.name, ','] : null, this.wind('arr'), ',', this.T('piste', 'runway'), this.rwy('arr'), ',', this.T('autorisé atterrissage', 'cleared to land'));
      const rb = this.M(this.T('Autorisé atterrissage piste', 'Cleared to land runway'), this.rwy('arr'), ',', this.cs());
      this._instruct(msg, rb, () => { this.phase = 'LANDING'; });
    }
    _atcGoAround() {
      const f = this.flight, cs = this.cs(), ap = this._st('APP', 'arr');
      this.flags.contApp = false;
      const m = this.M(cs, ',', this.T('remettez les gaz, je répète, remettez les gaz, montez', 'go around, I say again, go around, climb'), this.alt(f.appAlt, f.arr.tl), ',', this.T('contactez', 'contact'), ap.name, this.fq(ap.freq));
      const rb = this.M(this.T('Remettons les gaz, montons', 'Going around, climb'), this.alt(f.appAlt, f.arr.tl), ',', ap.name, this.fq(ap.freq), ',', cs);
      this._instruct(m, rb, () => { this.station = ap; this.flags.goAround = true; this.flags.twrClr = false; this._setCleared(f.appAlt); this.clearDir = 'up'; this.phase = 'APP_CHECKIN'; });
    }
    _vacate() {
      const g = this._st('GND', 'arr');
      const msg = this.M(this.cs(), ',', this.T('dégagez dès que possible, contactez', 'vacate when able, contact'), g.name, this.fq(g.freq), this.T('une fois dégagé', 'when vacated'));
      const rb = this.M(this.T('Dégageons,', 'Wilco,'), g.name, this.fq(g.freq), ',', this.cs());
      this.phase = 'VACATING';
      this._instruct(msg, rb, () => { this.station = g; });
    }

    // ----- actions du pilote -----
    actions() {
      if (!this.flight || this.phase === 'IDLE') return [];
      if (this.busy) return [];
      if (this.pending) return [{ id: 'readback', label: this.T('Collationner', 'Read back'), preview: this.pending.readback.text, primary: true }];
      const L = (fr, en) => this.T(fr, en);
      const list = [];
      const add = (id, label, primary) => { const m = this._pilotMsg(id); if (m) list.push({ id, label, preview: m.text, primary: !!primary }); };
      switch (this.phase) {
        case 'PRE': add('req_clearance', L('Demander la clairance', 'Request clearance'), true); break;
        case 'CLEARED': add('req_push', L('Repoussage + mise en route', 'Push-back + start-up'), true); add('req_start', L('Mise en route seule', 'Start-up only')); break;
        case 'STARTUP': add('req_taxi', L('Prêt à rouler', 'Ready to taxi'), true); break;
        case 'TAXI_OUT': if (this.crossAhead()) add('cross_req', this.crossLabel(), true); add('at_holding', L("Au point d'arrêt", 'At holding point'), !this.crossAhead()); break;
        case 'HOLDING': if (!this.flags.waitDep) add('ready_dep', L('Prêt au départ', 'Ready for departure'), true); break;
        case 'DEP_CHECKIN': case 'CTR_CHECKIN': case 'APP_CHECKIN': add('checkin', L('Premier contact', 'Check in'), true); break;
        case 'CRUISE': {
          const d = this.dist().arr, tod = this.tod();
          if (this.flight.cruise > 12000 && !this.flags.descent && (d == null || d < tod + 60)) add('req_descent', L('Demander la descente', 'Request descent'));
          if (d == null || d > tod + 20) list.push({ id: 'req_level', label: L('Demander un niveau', 'Request level'), preview: L('Choisissez un niveau de vol', 'Choose a flight level'), needsLevel: true, options: this.levelOptions() });
          break;
        }
        case 'CLIMB':
          if (this.station && this.station.role === 'CTR') list.push({ id: 'req_level', label: L('Demander un niveau', 'Request level'), preview: L('Choisissez un niveau de vol', 'Choose a flight level'), needsLevel: true, options: this.levelOptions() });
          break;
        case 'FINAL': add('established', L('Établi ILS', 'Established'), true); break;
        case 'TWR_CHECKIN': add('checkin_twr', L('Premier contact Tour', 'Check in with Tower'), true); break;
        case 'LANDING': add('go_around', L('Remise de gaz', 'Going around')); break;
        case 'VACATING': add('vacated', L('Piste dégagée', 'Runway vacated'), true); break;
        case 'TAXI_IN': if (this.crossAhead()) add('cross_req', this.crossLabel(), true); add('on_stand', L('Au parking', 'On stand'), !this.crossAhead()); break;
        case 'DONE': break;
      }
      if (['PRE', 'CLEARED', 'STARTUP', 'TAXI_OUT', 'HOLDING', 'CLIMB', 'CRUISE', 'DESCENT', 'APPROACH'].includes(this.phase)) add('req_notam', L('Infos piste (NOTAM)', 'Runway info (NOTAM)'));
      return list;
    }

    _pilotMsg(id, arg) {
      const f = this.flight, cs = this.cs(), st = this.station ? { text: this.station.name, speech: this.station.name } : '';
      const a = this.curAlt();
      switch (id) {
        case 'readback': return this.pending && this.pending.readback;
        case 'req_clearance': return this.M(st, ',', cs, ',', this.T('bonjour, demande clairance IFR pour', 'request IFR clearance to'), { text: f.arr.city, speech: f.arr.city }, ',', this.T('information', 'information'), this.atisLetter('dep'));
        case 'req_push': return this.M(st, ',', cs, ',', this.T('demande repoussage et mise en route', 'request push-back and start-up'));
        case 'req_start': return this.M(st, ',', cs, ',', this.T('demande mise en route', 'request start-up'));
        case 'req_taxi': return this.M(st, ',', cs, ',', this.T('prêt à rouler', 'ready to taxi'));
        case 'at_holding': return this.M(cs, ',', this.T("au point d'arrêt piste", 'holding point runway'), this.rwy('dep'));
        case 'ready_dep': return this.M(st, ',', cs, ',', this.T("point d'arrêt piste", 'holding point runway'), this.rwy('dep'), ',', this.T('prêt au départ', 'ready for departure'));
        case 'checkin': {
          const ref = this.phase === 'APP_CHECKIN' ? f.arr.tl : f.dep.ta;
          const cur = a != null ? this.alt(Math.round(a / 100) * 100, ref) : null;
          if (this.phase === 'APP_CHECKIN') {
            if (this.flags.goAround) return this.M(st, ',', cs, ',', this.T('remise de gaz, montée', 'missed approach, climbing'), this.alt(f.appAlt, f.arr.tl));
            const lvl = this.cleared != null && a != null && Math.abs(a - this.cleared) < 300;
            return this.M(st, ',', cs, ',', cur && !lvl ? [this.T('passant', 'passing'), cur, ','] : null, this.cleared ? [this.T('descente', 'descending'), this.alt(this.cleared, f.arr.tl), ','] : null, this.T('information', 'information'), this.atisLetter('arr'));
          }
          const level = this.cleared != null && a != null && Math.abs(a - this.cleared) < 300;
          if (level) return this.M(st, ',', cs, ',', this.alt(this.cleared, f.dep.ta));
          const climbTo = this.phase === 'DEP_CHECKIN' ? f.initAlt : this.cleared;
          return this.M(st, ',', cs, ',', cur ? [this.T('passant', 'passing'), cur, ','] : null, this.T('montée', 'climbing'), this.alt(climbTo || f.initAlt, f.dep.ta));
        }
        case 'req_descent': return this.M(st, ',', cs, ',', this.T('prêt pour la descente', 'ready for descent'));
        case 'cross_req': { const c = this.crossAhead(); return c ? this.M(st, ',', cs, ',', this.T('avant la piste', 'holding short runway'), this.rwyPair(c)) : null; }
        case 'req_notam': { const a = this.flight[this.notamSide()]; return this.M(st, ',', cs, ',', this.T('demande état des pistes à', 'request runway status at'), { text: a.city, speech: a.city }); }
        case 'req_level': return arg ? this.M(st, ',', cs, ',', this.T('demande', 'request'), this.alt(arg, 0)) : null;
        case 'established': return this.M(cs, ',', this.T('établi ILS piste', 'established ILS runway'), this.rwy('arr'));
        case 'checkin_twr': return this.M(st, ',', cs, ',', this.T('établi ILS piste', 'established ILS runway'), this.rwy('arr'));
        case 'go_around': return this.M(cs, ',', this.T('remise de gaz', 'going around'));
        case 'vacated': return this.M(st, ',', cs, ',', this.T('piste', 'runway'), this.rwy('arr'), this.T('dégagée', 'vacated'));
        case 'on_stand': return this.M(cs, ',', this.T('au parking, merci et au revoir', 'on stand, thanks, good day'));
      }
      return null;
    }

    pilotAction(id, arg) {
      if (!this.flight || this.busy) return;
      const msg = this._pilotMsg(id, arg);
      if (!msg) return;
      this._pilot(msg);
      const f = this.flight, cs = this.cs();
      switch (id) {
        case 'readback': { const after = this.pending.after; this.pending = null; if (after) after(); break; }
        case 'req_clearance': {
          const sid = this.sid();
          const dest = { text: f.arr.city, speech: f.arr.city };
          const chg = f.dep.rwyChange && f.dep.rwyChange.to ? [this.closureMsg({ rwys: [f.dep.rwyChange.from], until: f.dep.rwyChange.until, works: f.dep.rwyChange.works }), ','] : null;
          const msg2 = this.M(cs, ',', chg, this.T('autorisé', 'cleared to'), dest,
            sid ? [this.T(', départ', 'via'), sid, this.T('', 'departure')] : this.T(', comme déposé', 'as filed'), ',',
            this.T('piste', 'runway'), this.rwy('dep'), ',', this.T('montée initiale', 'climb initially'), this.alt(f.initAlt, f.dep.ta), ',',
            this.T('transpondeur', 'squawk'), { text: f.squawk, speech: digits(f.squawk, this.lang) });
          const rb = this.M(this.T('Autorisé', 'Cleared to'), dest, sid ? [this.T(', départ', 'via'), sid, this.T('', 'departure')] : this.T(', comme déposé', 'as filed'), ',', this.T('piste', 'runway'), this.rwy('dep'), ',',
            this.T('montée initiale', 'climb initially'), this.alt(f.initAlt, f.dep.ta), ',', this.T('transpondeur', 'squawk'), { text: f.squawk, speech: digits(f.squawk, this.lang) }, ',', cs);
          this._instruct(msg2, rb, () => {
            this._setCleared(f.initAlt);
            if (this.station.role === 'DEL') {
              const g = this._st('GND', 'dep');
              const m3 = this.M(cs, ',', this.T('collationnement correct, contactez', 'readback correct, contact'), g.name, this.fq(g.freq), this.T('pour la mise en route, au revoir', 'for start-up, good day'));
              this._instruct(m3, this.M(this.fq(g.freq), ',', this.T('au revoir', 'good day'), ',', cs), () => { this.station = g; this.phase = 'CLEARED'; });
            } else {
              this._atc(this.M(cs, ',', this.T('collationnement correct, rappelez prêt pour la mise en route', 'readback correct, report ready for start-up')), () => { this.phase = 'CLEARED'; });
            }
          });
          break;
        }
        case 'req_push': case 'req_start': {
          const what = id === 'req_push' ? this.T('repoussage et mise en route approuvés', 'push-back and start-up approved') : this.T('mise en route approuvée', 'start-up approved');
          // orientation après repoussage (d'après l'itinéraire de roulage) : « face à l'est »
          const face = id === 'req_push' && f.dep.pushFace != null ? this.faceSay(f.dep.pushFace) : null;
          const m = this.M(cs, ',', what, face ? [',', face] : null, ',', this.qnh('dep'));
          const rb = this.M(what.charAt(0).toUpperCase() + what.slice(1), face ? [',', face] : null, ',', this.qnh('dep'), ',', cs);
          this._instruct(m, rb, () => { this.phase = 'STARTUP'; if (id === 'req_push') { this.flags.pushApproved = true; if (this.onPush) this.onPush(f.dep.pushFace); } });
          break;
        }
        case 'req_taxi': {
          const via = this.via(f.dep.taxiVia);
          const hs = f.dep.crossings && f.dep.crossings.length ? this.holdShort(f.dep.crossings[0]) : null;
          const m = this.M(cs, ',', this.T("roulez point d'arrêt piste", 'taxi to holding point runway'), this.rwy('dep'), via ? [',', this.T('via', 'via'), via] : null, hs ? [',', hs.atc] : null);
          const rb = this.M(this.T("Roulons point d'arrêt piste", 'Taxi to holding point runway'), this.rwy('dep'), via ? [',', this.T('via', 'via'), via] : null, hs ? [',', hs.pilot] : null, ',', cs);
          this._instruct(m, rb, () => { this.phase = 'TAXI_OUT'; this.crossOK = new Set(); this.incursion = new Set(); });
          break;
        }
        case 'at_holding': this._handoff('TWR', 'dep', null, () => { this.phase = 'HOLDING'; }); break;
        case 'ready_dep': {
          const blk = this.traffic && this.traffic.departureBlock();
          if (blk) {
            const why = blk.reason === 'final' ? this.T('trafic en courte finale,', 'traffic on short final,') : blk.reason === 'landing' ? this.T('trafic à l\'atterrissage,', 'landing traffic,') : this.T('trafic au départ,', 'departing traffic,');
            const m = this.M(cs, ',', this.T('maintenez position,', 'hold position,'), why, this.traffic.typeSay(blk.who));
            const rb = this.M(this.T('Maintenons position', 'Holding position'), ',', cs);
            this.flags.waitDep = true;
            this._instruct(m, rb, null);
            break;
          }
          const takeoff = () => {
            const m = this.M(cs, ',', this.wind('dep'), ',', this.T('piste', 'runway'), this.rwy('dep'), ',', this.T('autorisé décollage', 'cleared for take-off'));
            const rb = this.M(this.T('Autorisé décollage piste', 'Cleared for take-off runway'), this.rwy('dep'), ',', cs);
            return [m, rb];
          };
          if (this.rand() < 0.4) {
            const m = this.M(cs, ',', this.T('alignez-vous piste', 'line up and wait runway'), this.rwy('dep'), this.T('et maintenez', ''));
            const rb = this.M(this.T('Alignons et maintenons piste', 'Line up and wait runway'), this.rwy('dep'), ',', cs);
            this._instruct(m, rb, () => {
              this.phase = 'LINEUP';
              const [m2, rb2] = takeoff();
              this._instruct(m2, rb2, () => { this.phase = 'TAKEOFF'; }, 15000 + this.rand() * 25000);
            });
          } else {
            const [m, rb] = takeoff();
            this._instruct(m, rb, () => { this.phase = 'TAKEOFF'; });
          }
          break;
        }
        case 'checkin': {
          if (this.phase === 'DEP_CHECKIN') {
            const lvl = f.depLevel;
            const m = this.M(cs, ',', this.T('identifié radar, montez', 'radar contact, climb'), this.alt(lvl, f.dep.ta));
            const rb = this.M(this.T('Montons', 'Climb'), this.alt(lvl, f.dep.ta), ',', cs);
            this._instruct(m, rb, () => { this._setCleared(lvl); this.clearDir = 'up'; this.phase = 'CLIMB'; });
          } else if (this.phase === 'CTR_CHECKIN') {
            if ((this.cleared || 0) < this.target) {
              const m = this.M(cs, ',', this.T('identifié radar, montez', 'radar contact, climb'), this.alt(this.target, f.dep.ta));
              const rb = this.M(this.T('Montons', 'Climb'), this.alt(this.target, f.dep.ta), ',', cs);
              this._instruct(m, rb, () => { this._setCleared(this.target); this.clearDir = 'up'; this.phase = 'CLIMB'; });
            } else {
              this._atc(this.M(cs, ',', this.T('identifié radar', 'radar contact')), () => { this.phase = (this.curAlt() != null && this.curAlt() < this.target - 300) ? 'CLIMB' : 'CRUISE'; });
            }
          } else if (this.phase === 'APP_CHECKIN') {
            if (this.flags.goAround) { this.flags.goAround = false; this._approachClearance(true); break; }
            const alt = this.alt(f.appAlt, f.arr.tl);
            const chgA = f.arr.rwyChange && f.arr.rwyChange.to ? [this.closureMsg({ rwys: [f.arr.rwyChange.from], until: f.arr.rwyChange.until, works: f.arr.rwyChange.works }), ','] : null;
            const m = this.M(cs, ',', this.T('identifié radar, descendez', 'radar contact, descend'), alt, ',', this.qnh('arr'), ',', chgA, this.T('prévoyez approche ILS piste', 'expect ILS approach runway'), this.rwy('arr'));
            const rb = this.M(this.T('Descendons', 'Descend'), alt, ',', this.qnh('arr'), ',', this.T('ILS piste', 'ILS runway'), this.rwy('arr'), ',', cs);
            this._instruct(m, rb, () => { this._setCleared(f.appAlt); this.clearDir = 'down'; this.phase = 'APPROACH'; });
          }
          break;
        }
        case 'req_descent': this._giveDescent(false); break;
        case 'cross_req': {
          const ref = this.crossAhead(); if (!ref) break;
          const busy = this.traffic && this.traffic.stripBusy && this.traffic.stripBusy(ref);
          if (busy) {
            const m = this.M(cs, ',', this.T('maintenez avant la piste', 'hold short runway'), this.rwyPair(ref), ',', busy.reason === 'landing' ? this.T('trafic à l\'atterrissage', 'landing traffic') : this.T('trafic au départ', 'departing traffic'));
            const rb = this.M(this.T('Maintenons avant la piste', 'Holding short runway'), this.rwyPair(ref), ',', cs);
            this._instruct(m, rb, () => { this.flags.crossWait = ref; });
          } else this._crossClear(ref);
          break;
        }
        case 'req_notam': {
          const side = this.notamSide(), a = f[side];
          const cl = (a.closures || []).filter((c) => !c.partial);
          const parts = [cs, ','];
          if (!a.notamOk) parts.push(this.T(`pas d'information NOTAM disponible pour ${a.city}`, `no NOTAM information available for ${a.city}`));
          else if (!cl.length) parts.push(this.T(`aucune fermeture de piste signalée à ${a.city}`, `no runway closures reported at ${a.city}`));
          else {
            parts.push(this.T(`à ${a.city},`, `at ${a.city},`));
            cl.forEach((c, i) => { parts.push(this.closureMsg(c)); parts.push(i < cl.length - 1 ? ',' : ''); });
          }
          parts.push(',', this.T('piste en service', 'runway in use'), this.rwy(side));
          this._atc(this.M(...parts));
          break;
        }
        case 'req_level': {
          const lvl = +arg;
          const near = (this.dist().arr || 9999) <= this.tod() + 20;
          if (near || this.rand() < 0.2) {
            const keep = this.alt(this.target, f.dep.ta);
            if (near) {
              this._atc(this.M(cs, ',', this.T('impossible, maintenez', 'unable, maintain'), keep, ',', this.T('prévoyez la descente sous peu', 'expect descent shortly')));
            } else {
              const m = this.M(cs, ',', this.T('impossible pour le moment en raison du trafic, maintenez', 'unable at this time due to traffic, maintain'), keep, ',', this.T('je vous rappelle', 'expect higher in a few minutes').replace('higher', lvl > this.target ? 'higher' : 'lower'));
              const rb = this.M(this.T('Maintenons', 'Maintain'), keep, ',', cs);
              this._instruct(m, rb, () => { this.offer = { alt: lvl, at: this.now + 120000 + this.rand() * 120000 }; });
            }
          } else this._levelClearance(lvl, 'request');
          break;
        }
        case 'established': this._handoff('TWR', 'arr', null, () => { this.phase = 'TWR_CHECKIN'; }); break;
        case 'checkin_twr': this._landingClearance(false); break;
        case 'go_around': {
          const ap = this._st('APP', 'arr');
          const m = this.M(cs, ',', this.T('bien reçu, montez', 'roger, climb'), this.alt(f.appAlt, f.arr.tl), ',', this.T('contactez', 'contact'), ap.name, this.fq(ap.freq));
          const rb = this.M(this.T('Montons', 'Climb'), this.alt(f.appAlt, f.arr.tl), ',', ap.name, this.fq(ap.freq), ',', cs);
          this._instruct(m, rb, () => { this.station = ap; this.flags.goAround = true; this.flags.twrClr = false; this._setCleared(f.appAlt); this.clearDir = 'up'; this.phase = 'APP_CHECKIN'; });
          break;
        }
        case 'vacated': {
          const m = this.M(cs, ',', this.T('roulez vers votre poste de stationnement', 'taxi to your stand'));
          const rb = this.M(this.T('Roulons vers le poste', 'Taxi to stand'), ',', cs);
          this._instruct(m, rb, () => { this.phase = 'TAXI_IN'; });
          break;
        }
        case 'on_stand':
          this._atc(this.M(cs, ',', this.T('bonne journée, au revoir', 'good day')), () => {
            this.phase = 'DONE';
            this._sys(this.T('Vol terminé. Bon retour au parking !', 'Flight complete. Welcome to the stand!'));
          });
          break;
      }
      this.onChange();
    }

    // ----- reprendre à une étape -----
    jumpTo(phase) {
      const f = this.flight; if (!f) return;
      this.queue = []; this.busy = false; this.pending = null;
      const set = (role, side) => { this.station = this._st(role, side); };
      switch (phase) {
        case 'PRE': set(f.dep.freqs.DEL ? 'DEL' : 'GND', 'dep'); this.cleared = null; break;
        case 'HOLDING': set('TWR', 'dep'); this.cleared = f.initAlt; break;
        case 'DEP_CHECKIN': set('DEP', 'dep'); this.cleared = f.initAlt; break;
        case 'CRUISE': set('CTR', 'ctr1'); this.cleared = this.target; this.clearDir = 'level'; break;
        case 'DESCENT': set('CTR', 'ctr2'); this.flags.descent = true; this.cleared = f.descAlt; this.clearDir = 'down'; break;
        case 'APP_CHECKIN': set('APP', 'arr'); this.flags.descent = true; this.cleared = f.descAlt; this.clearDir = 'down'; break;
        case 'TWR_CHECKIN': set('TWR', 'arr'); this.flags.appClr = true; this.cleared = f.appAlt; break;
        case 'VACATING': set('GND', 'arr'); break;
      }
      this.phase = phase;
      this._sys(this.T(`Reprise : ${PHASE_LABEL.fr[phase]}. Contactez ${this.station.name} sur ${freqTxt(this.station.freq)}.`, `Resuming: ${PHASE_LABEL.en[phase]}. Contact ${this.station.name} on ${freqTxt(this.station.freq)}.`));
      this.onChange();
    }

    // ----- ATIS -----
    atis(side) {
      const f = this.flight; if (!f) return null;
      const a = f[side], w = a.wx || {}, fr = this.lang === 'fr', L = this.atisLetter(side);
      const parts = [];
      parts.push(this.T(`Ici ${a.city}, information ${L}.`, `This is ${a.city} information ${L}.`));
      parts.push(this.M(this.T('Piste en service', 'Runway in use'), this.rwy(side), '.'));
      (a.closures || []).filter((c) => !c.partial).forEach((c) => parts.push(this.M(this.closureMsg(c), '.')));
      parts.push(this.M(this.wind(side), '.'));
      let vis;
      if (w.cavok) vis = 'CAVOK';
      else if (w.vis && w.vis.m != null) vis = w.vis.m >= 9999 ? this.T('visibilité 10 kilomètres ou plus', 'visibility 10 kilometres or more') : this.T(`visibilité ${w.vis.m} mètres`, `visibility ${w.vis.m} metres`);
      else if (w.vis && w.vis.sm != null) vis = this.T(`visibilité ${w.vis.sm} miles`, `visibility ${w.vis.sm} miles`);
      if (vis) parts.push(vis + '.');
      if (!w.cavok) {
        if (w.clouds && w.clouds.length) {
          const C = { FEW: this.T('quelques nuages', 'few'), SCT: this.T('nuages épars', 'scattered'), BKN: this.T('nuages fragmentés', 'broken'), OVC: this.T('couvert', 'overcast') };
          parts.push(w.clouds.map((c) => `${C[c.cover]} ${this.T('à', 'at')} ${c.base} ${this.T('pieds', 'feet')}`).join(', ') + '.');
        } else if (w.nsc) parts.push(this.T('Pas de nuages significatifs.', 'No significant cloud.'));
      }
      if (w.temp != null) parts.push(this.T(`Température ${Math.round(w.temp)}, point de rosée ${Math.round(w.dew)}.`, `Temperature ${Math.round(w.temp)}, dew point ${Math.round(w.dew)}.`));
      parts.push(this.M(this.qnh(side), '.'));
      const tl = String(Math.round(a.tl / 100)).padStart(2, '0');
      parts.push(this.M(this.T('Niveau de transition', 'Transition level'), { text: tl, speech: digits(tl, this.lang) }, '.'));
      parts.push(this.T(`Accusez réception de l'information ${L} au premier contact.`, `Advise on initial contact you have information ${L}.`));
      const cap = (p) => (typeof p === 'string' ? p.charAt(0).toUpperCase() + p.slice(1) : { text: cap(p.text), speech: cap(p.speech) });
      const msg = this.M(...parts.map(cap));
      msg.letter = L;
      return msg;
    }

    phaseLabel() { return PHASE_LABEL[this.lang][this.phase] || this.phase; }
  }

  return { AtcEngine, utils: { distNm, bearing, digits, freqTxt, freqSay, callsignSay, fakeFreq, parseMetar, titleCase, hash, usesInHg }, PHASE_LABEL, RESUME_POINTS, AIRBORNE };
});
