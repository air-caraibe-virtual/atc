// Langue radio automatique : anglais + langue du pays, « say again in English » sinon
const { AtcEngine } = require('../src/engine.js');
const DemoSim = require('../src/demo.js');
const W = (i,r)=>({rawOb:`${i} 150000Z 25008KT 9999 SCT030 18/10 Q1018`, temp:18,dewp:10,wdir:250,wspd:8,altim:1018});
function fl(){ return { callsign:'AFR1048', cruise:35000, sid:'OKASI5H',
  dep:{icao:'LFPO', city:'Orly', rwy:'24', elev:291, lat:48.7233, lon:2.3794, metar:W('LFPO')},
  arr:{icao:'LEMD', city:'Madrid', rwy:'32L', elev:2001, lat:40.4719, lon:-3.5626, metar:W('LEMD')} }; }
const plan = { PRE:'fr', DEP_CHECKIN:'en', CTR_CHECKIN:'es', APP_CHECKIN:'es', TWR_CHECKIN:'de', VACATING:'es' };
const log=[]; let seed=3; const rand=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const e = new AtcEngine({ radioMode:'auto', uiLang:'fr', rand, onMessage:m=>log.push(m) });
const f = fl(); e.load(f); const sim = new DemoSim(f);
let t=0,lastAct=0, rejected=0;
for (let i=0;i<200000 && e.phase!=='DONE';i++){
  t+=1000; const tel=sim.step(e.phase==='CRUISE'?8:1, e); e.tick(t, tel);
  if (plan[e.phase] && !e.pending && e.station) {
    const want = plan[e.phase];
    // l'allemand n'est compris ni à Paris ni à Madrid : refus, puis on repasse en anglais
    e.setSpeak(want);
  }
  const acts=e.actions();
  if (acts.length && t-lastAct>4000){ const a=acts.find(x=>x.primary)||acts.find(x=>x.id!=='req_notam'); if(a && a.id!=='go_around'){ const n=log.length; e.pilotAction(a.id); lastAct=t;
    } }
  const last = log[log.length-1];
  if (last && /say again in English/.test(last.text) && !last.seen) { last.seen=true; rejected++; delete plan[e.phase]; e.setSpeak('en'); }
}
for (const m of log) console.log(`[${m.from}${m.lang?' '+m.lang:''}${m.station?' '+m.station:''}] ${m.text}`);
console.log('\nphase', e.phase, 'rejected', rejected);
if (e.phase!=='DONE') process.exitCode=1;
const sayAgain = log.filter(m=>/say again in English/.test(m.text)).length;
console.log('say again:', sayAgain);
if (!sayAgain) process.exitCode=1;
