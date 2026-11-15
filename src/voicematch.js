/* ATC — rapprochement entre ce que le pilote a dit au micro et les messages possibles. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VoiceMatch = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // chiffres dits en toutes lettres -> chiffres (toutes les langues gérées)
  const NUM = {
    zero: 0, zéro: 0, zerro: 0, cero: 0, null: 0, nul: 0,
    one: 1, un: 1, une: 1, uno: 1, eins: 1, ein: 1, um: 1, wun: 1,
    two: 2, deux: 2, dos: 2, zwo: 2, zwei: 2, due: 2, dois: 2, too: 2,
    three: 3, tree: 3, trois: 3, tres: 3, drei: 3, tre: 3, tres_: 3,
    four: 4, fower: 4, quatre: 4, cuatro: 4, vier: 4, quattro: 4, quatro: 4,
    five: 5, fife: 5, cinq: 5, cinco: 5, funf: 5, fünf: 5, cinque: 5,
    six: 6, seis: 6, sechs: 6, sei: 6, meia: 6,
    seven: 7, sept: 7, siete: 7, sieben: 7, sette: 7, sete: 7,
    eight: 8, ait: 8, huit: 8, ocho: 8, acht: 8, otto: 8, oito: 8,
    nine: 9, niner: 9, neuf: 9, nueve: 9, neun: 9, nove: 9,
  };
  const STOP = new Set(['de', 'du', 'la', 'le', 'les', 'the', 'a', 'to', 'el', 'en', 'al', 'der', 'die', 'das', 'il', 'di', 'o', 'da', 'do', 'et', 'and', 'y', 'und', 'e']);

  function norm(s) {
    return String(s || '')
      .replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])(\d)/g, '$1 $2').replace(/(\d)([A-Za-z])/g, '$1 $2') // « Iberia60ZuluTango » -> mots séparés
      .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/(\d)\s*[.,]\s*(\d)/g, '$1$2') // 121.5 -> 1215
      .replace(/([a-z])-([a-z])/g, '$1$2') // push-back -> pushback
      .replace(/\b(push|start|take|read) (back|up|off)\b/g, '$1$2')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // mots -> jetons, chiffres regroupés (« un cinq zéro » et « 150 » donnent « 150 »)
  function tokens(s) {
    const out = [];
    let num = '';
    for (const w of norm(s).split(' ')) {
      if (!w) continue;
      const d = /^\d+$/.test(w) ? w : (NUM[w] != null ? String(NUM[w]) : null);
      if (d != null) { num += d; continue; }
      if (num) { out.push(num); num = ''; }
      if (w === 'fl' || w === 'flightlevel') continue;
      out.push(w);
    }
    if (num) out.push(num);
    return out;
  }
  // F1 pondéré entre deux suites de mots (mots-outils allégés, nombres renforcés)
  function similarity(said, phrase, ignore) {
    const ig = ignore || new Set();
    const w = (t) => (STOP.has(t) ? 0.3 : /^\d+$/.test(t) ? 1.5 : 1);
    const A = tokens(said).filter((t) => !ig.has(t)), B = tokens(phrase).filter((t) => !ig.has(t));
    if (!A.length || !B.length) return 0;
    const bag = new Map(); B.forEach((t) => bag.set(t, (bag.get(t) || 0) + 1));
    let hit = 0, wa = 0, wb = 0;
    A.forEach((t) => { wa += w(t); const n = bag.get(t) || 0; if (n) { hit += w(t); bag.set(t, n - 1); } else if (fuzzyIn(t, bag)) hit += w(t) * 0.6; });
    B.forEach((t) => { wb += w(t); });
    const p = hit / wa, r = hit / wb;
    return p + r ? (2 * p * r) / (p + r) : 0;
  }
  // mot presque identique (une faute de transcription)
  function fuzzyIn(t, bag) {
    if (t.length < 4) return false;
    for (const [u, n] of bag) {
      if (!n || Math.abs(u.length - t.length) > 2 || u.length < 4) continue;
      if (lev(t, u) <= (t.length > 7 ? 2 : 1)) { bag.set(u, n - 1); return true; }
    }
    return false;
  }
  function lev(a, b) {
    const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }
  // niveau ou altitude demandés : « niveau 370 », « flight level three seven zero », « FL 370 »
  function parseLevel(said, options) {
    const nums = tokens(said).filter((t) => /^\d+$/.test(t)).map(Number);
    for (const n of nums) {
      let ft = null;
      if (n >= 50 && n <= 490) ft = n * 100;
      else if (n >= 5000 && n <= 49000) ft = Math.round(n / 1000) * 1000;
      if (ft == null) continue;
      if (!options || !options.length) return ft;
      const best = options.reduce((a, b) => (Math.abs(b - ft) < Math.abs(a - ft) ? b : a));
      if (Math.abs(best - ft) <= 500) return best;
    }
    return null;
  }

  /* Choisit l'action la plus probable.
     results : [{ lang, text }] (transcriptions) ; cands : [{ id, lang, text, speech, arg }] ; ignore : mots à ignorer (indicatif, poste) */
  function best(results, cands, ignore) {
    const ig = new Set(); (ignore || []).forEach((s) => tokens(s).forEach((t) => ig.add(t)));
    let top = null;
    for (const r of results) {
      for (const c of cands) {
        if (c.lang && r.lang && c.lang !== r.lang) continue;
        const s = Math.max(similarity(r.text, c.text, ig), c.speech ? similarity(r.text, c.speech, ig) : 0);
        if (!top || s > top.score) top = { ...c, score: s, heard: r.text, heardLang: r.lang };
      }
    }
    return top;
  }

  // ---- Mots-clés par demande (toutes langues), pour comprendre même une phrase mal transcrite ----
  // poids : 3 = très sûr, 2 = probable, 1 = indice
  const INTENTS = {
    req_clearance: [[3, 'clearance', 'clairance', 'cliranse', 'clearence', 'clarence', 'autorisation ifr', 'autorizacion ifr', 'ifr freigabe', 'autorizzazione ifr', 'autorizacao ifr'], [2, 'ifr', 'autorisation', 'autorizacion', 'freigabe', 'autorizzazione', 'autorizacao'], [1, 'information', 'informacion', 'informazione', 'informacao']],
    req_push: [[3, 'pushback', 'push', 'repoussage', 'repousser', 'remolque', 'refoulement'], [1, 'startup', 'mise en route', 'puesta en marcha', 'anlassen', 'messa in moto', 'acionamento']],
    req_start: [[2, 'startup', 'start', 'mise en route', 'demarrage', 'puesta en marcha', 'anlassen', 'messa in moto', 'acionamento']],
    req_taxi: [[3, 'taxi', 'rouler', 'roulage', 'rodar', 'rodaje', 'rollen', 'rollbereit', 'rullaggio', 'rullare', 'taxiar']],
    at_holding: [[3, 'holding point', 'holding short', 'point d arret', 'point d attente', 'punto de espera', 'rollhalt', 'punto attesa', 'punto di attesa', 'ponto de espera'], [1, 'holding']],
    ready_dep: [[3, 'ready for departure', 'ready for take off', 'ready for takeoff', 'pret au depart', 'pret pour le depart', 'prets au depart', 'pret au decollage', 'listo para salir', 'listos para salir', 'listos para despegar', 'abflugbereit', 'startbereit', 'pronti per la partenza', 'pronti al decollo', 'prontos para decolagem', 'pronto para decolagem'], [1, 'ready', 'pret', 'listo', 'listos', 'pronti', 'prontos', 'departure', 'depart']],
    req_descent: [[3, 'ready for descent', 'request descent', 'pret pour la descente', 'pret a descendre', 'demande descente', 'listos para el descenso', 'listo para descenso', 'bereit zum sinkflug', 'pronti per la discesa', 'prontos para descida'], [2, 'descent', 'descente', 'descenso', 'sinkflug', 'discesa', 'descida']],
    req_level: [[3, 'flight level', 'request level', 'request climb', 'demande niveau', 'demande le niveau', 'solicitamos nivel', 'erbitten flugflache', 'richiediamo livello', 'solicitamos nivel'], [2, 'level', 'niveau', 'nivel', 'flugflache', 'livello', 'nivel']],
    established: [[3, 'established', 'etabli', 'etablis', 'etablie', 'establecidos', 'establecido', 'stabilizzati', 'estabilizados', 'auf dem ils'], [2, 'localizer', 'localiser', 'ils']],
    go_around: [[3, 'go around', 'going around', 'remise des gaz', 'remise de gaz', 'remettons les gaz', 'motor y al aire', 'durchstarten', 'starten durch', 'riattacchiamo', 'riattaccata', 'arremetendo', 'arremetida']],
    vacated: [[3, 'runway vacated', 'vacated', 'piste degagee', 'piste liberee', 'degage', 'pista libre', 'piste verlassen', 'pista liberata', 'pista livre'], [1, 'libre', 'livre']],
    on_stand: [[3, 'on stand', 'au parking', 'on blocks', 'al parcheggio', 'auf parkposition', 'en el puesto', 'na posicao'], [2, 'stand', 'parking', 'parcheggio', 'parkposition', 'estacionamiento', 'puesto']],
    cross_req: [[3, 'cross runway', 'request crossing', 'traverser', 'traversee', 'cruzar', 'cruce', 'kreuzen', 'attraversare', 'attraversamento', 'cruzar a pista']],
    req_notam: [[3, 'notam', 'runway status', 'etat des pistes', 'estado de pistas', 'estado de las pistas', 'pistenzustand', 'stato delle piste', 'condicao das pistas']],
    checkin: [[2, 'passing', 'climbing', 'descending', 'en montee', 'en descente', 'passant', 'subiendo', 'descendiendo', 'pasando', 'steigen', 'sinken', 'in salita', 'in discesa', 'subindo', 'descendo'], [1, 'with you', 'avec vous']],
    checkin_twr: [[2, 'established', 'etabli', 'final', 'finale', 'ils'], [1, 'with you', 'avec vous']],
  };
  const WORDS = {}; // mots-clés prénormalisés
  for (const [id, groups] of Object.entries(INTENTS)) WORDS[id] = groups.map(([w, ...ks]) => [w, ks.map((k) => tokens(k).join(' '))]);
  // score d'une demande dans une phrase : le mot-clé le plus fort trouvé (mot exact, ou à une lettre près pour les mots longs)
  function intentScore(said, id) {
    const toks = tokens(said), txt = ' ' + toks.join(' ') + ' ';
    let best = 0;
    for (const [w, ks] of WORDS[id] || []) {
      for (const k of ks) {
        if (w <= best) break;
        if (txt.includes(' ' + k + ' ')) { best = w; break; }
        if (!k.includes(' ') && k.length >= 6 && toks.some((t) => Math.abs(t.length - k.length) <= 1 && lev(t, k) <= 1)) { best = w; break; }
      }
    }
    return best;
  }
  /* Demande la plus probable parmi celles proposées en ce moment, d'après les mots-clés.
     Renvoie { id, score } seulement si elle se détache nettement des autres. */
  function bestIntent(said, ids) {
    const sc = ids.map((id) => ({ id, score: intentScore(said, id) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
    if (!sc.length) return null;
    if (sc.length > 1 && sc[1].score >= sc[0].score) return null; // ex aequo : on laisse la ressemblance trancher
    return sc[0];
  }

  // « radio check » dans toutes les langues (reconnu même si le reste de la phrase est mal transcrit)
  const RADIO_CHECK = /\b(radio ?check|radio ?chek|radiocheck|essai radio|test radio|prueba de radio|comprobacion de radio|funkprobe|funk ?check|prova radio|teste de radio)\b/;
  function isRadioCheck(said) { return RADIO_CHECK.test(norm(said)); }

  return { norm, tokens, similarity, parseLevel, best, isRadioCheck, intentScore, bestIntent };
});
