// Compréhension des phrases mal transcrites (mots-clés + ressemblance), comme dans l'appli
const VM = require('../src/voicematch.js');
const { AtcEngine } = require('../src/engine.js');
const W = { rawOb: 'X', wdir: 250, wspd: 8, altim: 1018 };
const e = new AtcEngine({ radioMode: 'auto' });
e.load({ callsign: 'IBE60ZT', cruise: 35000, sid: 'BARD2N', dep: { icao: 'LEMD', city: 'Madrid', rwy: '36L', elev: 2001, lat: 40.47, lon: -3.56, metar: W }, arr: { icao: 'LPPR', city: 'Porto', rwy: '17', elev: 228, lat: 41.24, lon: -8.68, metar: W } });
function decide(said, lang) {
  const acts = e.actions(), cands = [];
  for (const a of acts) for (const l of ['en', 'fr', 'es', 'de', 'it', 'pt']) { const m = e.withLang(l, () => e._pilotMsg(a.id, a.needsLevel ? 37000 : undefined)); if (m) cands.push({ id: a.id, lang: l, text: m.text, speech: m.speech }); }
  const res = [{ lang, text: said }], ids = [...new Set(cands.map((c) => c.id))];
  const it = VM.bestIntent(said, ids);
  if (it) { const own = cands.filter((c) => c.id === it.id); return { id: it.id, lang: (own.find((c) => c.lang === lang) || own[0]).lang, how: 'mot-clé' }; }
  const b = VM.best(res, cands, ['Iberia', 'IBE60ZT', 'Madrid']);
  return b && b.score >= 0.33 ? { id: b.id, lang: b.lang, how: 'ressemblance ' + b.score.toFixed(2) } : { id: 'say again' };
}
const cases = [
  ['PRE', 'en', 'Madrid delivery, I barrier 6-Z Zulu thing go, request IFR clearance to Porto information Alpha', 'req_clearance'],
  ['PRE', 'en', 'by beer 60 ZT request clearance', 'req_clearance'],
  ['PRE', 'fr', 'Madrid, Ibéria 60 ZT, bonjour, demande la clearance pour Porto', 'req_clearance'],
  ['PRE', 'es', 'Madrid autorizaciones, Iberia 60 zulu tango, solicitamos autorización IFR a Oporto', 'req_clearance'],
  ['CLEARED', 'en', 'Iberia 60 ZT request push back and start up', 'req_push'],
  ['CLEARED', 'en', 'request start up', 'req_start'],
  ['STARTUP', 'en', 'Iberia sixty zulu tango ready to taxi', 'req_taxi'],
  ['STARTUP', 'es', 'Iberia 60 ZT listos para rodar', 'req_taxi'],
  ['TAXI_OUT', 'en', 'holding point runway 36 left', 'at_holding'],
  ['HOLDING', 'en', 'Iberia 60 ZT ready for departure', 'ready_dep'],
  ['HOLDING', 'fr', 'prêt au départ', 'ready_dep'],
];
let fail = 0;
for (const [ph, lang, said, want] of cases) {
  e.phase = ph; e.pending = null; e.busy = false;
  const d = decide(said, lang); const ok = d.id === want; if (!ok) fail++;
  console.log(ok ? 'OK ' : 'KO ', ph.padEnd(9), lang, '«', said, '» →', d.id, d.lang || '', d.how || '');
}
e.phase = 'STARTUP'; console.log('charabia →', decide('hello how are you today', 'en').id);
process.exitCode = fail ? 1 : 0;
