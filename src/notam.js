/* ATC — NOTAM réels : repère les pistes fermées (travaux…) en vigueur maintenant. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Notam = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // « 2611150600 » (AAMMJJhhmm, UTC) → Date
  function parseStamp(s) {
    const m = String(s || '').match(/^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (!m) return null;
    return new Date(Date.UTC(2000 + +m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  }
  const field = (txt, f) => {
    const m = txt.match(new RegExp('(?:^|\\s)' + f + '\\)\\s*([\\s\\S]*?)(?=\\s[A-G]\\)\\s|$)'));
    return m ? m[1].trim() : '';
  };

  // Plages horaires du champ D) (ex. « DLY 2200-0430 », « 0600-1800 », « MON-FRI 0700-1600 ») : actif maintenant ?
  const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  function scheduleActive(d, now) {
    if (!d) return true;
    const ranges = [...d.matchAll(/(\d{4})\s*-\s*(\d{4})/g)];
    if (!ranges.length) return true; // horaire non compris : on considère actif
    const dayTok = d.match(/\b(MON|TUE|WED|THU|FRI|SAT|SUN)(?:\s*-\s*(MON|TUE|WED|THU|FRI|SAT|SUN))?\b/);
    if (dayTok) {
      const a = DAYS.indexOf(dayTok[1]), b = dayTok[2] ? DAYS.indexOf(dayTok[2]) : a, cur = now.getUTCDay();
      const inDays = a <= b ? cur >= a && cur <= b : cur >= a || cur <= b;
      if (!inDays) return false;
    }
    const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
    return ranges.some(([, s, e]) => {
      const st = +s.slice(0, 2) * 60 + +s.slice(2), en = +e.slice(0, 2) * 60 + +e.slice(2);
      return st <= en ? mins >= st && mins < en : mins >= st || mins < en;
    });
  }

  const RWY = '(\\d{2}[LRC]?(?:\\s*\\/\\s*\\d{2}[LRC]?)?)';
  // Fermetures de piste dans une liste de NOTAM (format FAA notamSearch : icaoMessage, startDate, endDate)
  function closures(list, now) {
    now = now || new Date();
    const out = [];
    for (const n of list || []) {
      const txt = String(n.icaoMessage || n.traditionalMessage || '').replace(/\s+/g, ' ').toUpperCase();
      if (!txt) continue;
      const e = field(txt, 'E') || txt;
      const q = /\/QMR(LC|LT|XX)\//.test(txt);
      const re = new RegExp('\\bRWY\\s*' + RWY + '\\s+(?:IS\\s+|WILL BE\\s+)?(?:CLSD|CLOSED)\\b(?!\\s+TO\\s+(?:ACFT\\s+)?(?:WINGSPAN|ACFT\\s+WITH|HEL))', 'g');
      const hits = [...e.matchAll(re)];
      if (!hits.length && !(q && /\bCLSD\b/.test(e))) continue;
      // fermeture partielle (une portion, un seul sens, des intersections) : on la signale sans fermer la piste
      const partial = /\bBTN\b|\bBETWEEN\b|\bPORTION\b|\bFM TWY\b|\bFOR (?:TKOF|LDG) FM\b|\bTORA\b|\bDISPLACED\b/.test(e);
      const b = parseStamp(field(txt, 'B')) || (n.startDate ? new Date(n.startDate) : null);
      const cRaw = field(txt, 'C');
      const c = /PERM/.test(cRaw) ? null : parseStamp(cRaw) || (n.endDate && !/PERM/i.test(n.endDate) ? new Date(n.endDate) : null);
      if (b && !isNaN(b) && b > now) continue;
      if (c && !isNaN(c) && c < now) continue;
      if (!scheduleActive(field(txt, 'D'), now)) continue;
      const rwys = new Set();
      for (const h of hits) h[1].replace(/\s/g, '').split('/').forEach((r) => rwys.add(r));
      if (!rwys.size) continue;
      out.push({ rwys: [...rwys], partial, until: c, text: e.slice(0, 160), works: /\bWIP\b|WORK|TRAVAUX|MAINT/.test(e) });
    }
    return out;
  }

  // Ensemble des numéros de piste fermés (avec la piste opposée : « 06/24 » ferme 06 et 24)
  function closedSet(cls) {
    const s = new Set();
    for (const c of cls || []) if (!c.partial) c.rwys.forEach((r) => s.add(r.replace(/^0?(\d)([LRC]?)$/, '0$1$2')));
    return s;
  }
  const opposite = (r) => {
    const m = String(r).match(/^(\d{2})([LRC]?)$/); if (!m) return null;
    const n = ((+m[1] + 18 - 1) % 36) + 1, side = { L: 'R', R: 'L', C: 'C' }[m[2]] || '';
    return String(n).padStart(2, '0') + side;
  };
  function isClosed(cls, rwy) {
    const s = closedSet(cls), r = String(rwy || '').toUpperCase().replace(/^(\d)([LRC]?)$/, '0$1$2');
    return s.has(r) || s.has(opposite(r));
  }

  return { closures, isClosed, closedSet, opposite, parseStamp, scheduleActive };
});
