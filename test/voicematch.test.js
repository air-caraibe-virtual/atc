const VM = require('../src/voicematch.js');
const { AtcEngine } = require('../src/engine.js');
const W = {rawOb:'X 9999', temp:18,dewp:10,wdir:250,wspd:8,altim:1018};
const e = new AtcEngine({ radioMode:'auto' });
e.load({ callsign:'AFR1048', cruise:35000, sid:'OKASI5H', dep:{icao:'LFPO', city:'Orly', rwy:'24', elev:291, lat:48.72, lon:2.37, metar:W}, arr:{icao:'LEMD', city:'Madrid', rwy:'32L', elev:2001, lat:40.47, lon:-3.56, metar:W} });
function cands(){ const out=[]; for (const a of e.actions()) for (const l of ['en','fr','es','de','it','pt']) {
  const m = e.withLang(l, ()=> a.id==='readback' ? e.pending.readback : e._pilotMsg(a.id, a.needsLevel ? 37000 : undefined));
  if (m) out.push({ id:a.id, lang:l, text:m.text, speech:m.speech }); } return out; }
const ign = ['Air France', 'AFR1048', '1048', 'Orly', 'Délivrance', 'Delivery'];
const cases = [
  ['PRE', 'fr', "Orly Délivrance, Air France 1048, bonjour, demande la clairance IFR pour Madrid, information Charlie", 'req_clearance','fr'],
  ['PRE', 'en', "Orly delivery, Air France one zero four eight, request IFR clearance to Madrid with information Charlie", 'req_clearance','en'],
  ['PRE', 'es', "Orly, Air France 1048, solicitamos autorización IFR a Madrid, información Charlie", 'req_clearance','es'],
  ['CLEARED', 'fr', "Orly sol Air France 1048 demande mise en route", 'req_start','fr'],
  ['CLEARED', 'en', "Air France 1048 request pushback and startup", 'req_push','en'],
  ['STARTUP', 'de', "Orly Rollkontrolle, Air France 1048, rollbereit", 'req_taxi','de'],
  ['CRUISE', 'en', "Air France 1048 request flight level 370", 'req_level','en'],
];
let fail=0;
for (const [ph, lang, said, want, wantLang] of cases) {
  e.phase = ph; e.pending=null; e.busy=false; if (ph==='CRUISE') { e.station=e._st('CTR','ctr1'); e.target=35000; }
  const r = VM.best([{lang, text:said}], cands(), ign);
  const ok = r && r.id===want && r.lang===wantLang;
  if (!ok) fail++;
  console.log(ok?'OK ':'KO ', ph, lang, '→', r && r.id, r && r.lang, r && r.score.toFixed(2), '| niveau:', VM.parseLevel(said, e.levelOptions()));
}
// garbage
const g = VM.best([{lang:'en', text:'hello how are you today'}], (e.phase='STARTUP', cands()), ign);
console.log('charabia score', g.score.toFixed(2));
process.exitCode = fail || g.score > 0.35 ? 1 : 0;
