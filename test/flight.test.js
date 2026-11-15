const { AtcEngine } = require('../src/engine.js');
const DemoSim = require('../src/demo.js');
function demoFlight(){ return {
  callsign:'FWI512', cruise:15000, sid:'ROBOT1A',
  dep:{icao:'TFFR', city:'Pointe-à-Pitre', rwy:'12', elev:36, lat:16.2653, lon:-61.5318, ta:5000, tl:6000, metar:{rawOb:'TFFR 150000Z 09012KT 9999 FEW020 28/22 Q1015', temp:28, dewp:22, wdir:90, wspd:12, altim:1015, reportTime:'2026-11-15 00:00:00'}},
  arr:{icao:'TFFF', city:'Fort-de-France', rwy:'10', elev:16, lat:14.5910, lon:-61.0032, ta:5000, tl:6000, metar:{rawOb:'TFFF 150000Z 10010KT CAVOK 27/21 Q1014', temp:27, dewp:21, wdir:100, wspd:10, altim:1014}},
};}
for (const lang of ['fr','en']) for (const cruise of [15000, 35000]) {
  const log=[]; let seed=7; const rand=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
  const e = new AtcEngine({lang, rand, onMessage:m=>log.push(m)});
  const fl = demoFlight(); fl.cruise=cruise; if(cruise>20000){ fl.arr={...fl.arr, icao:'LFPG', city:'Paris', rwy:'27L', elev:392, lat:49.0097, lon:2.5479, ta:4000, tl:5000, metar:{rawOb:'LFPG 150000Z 25008KT 9999 BKN012 08/06 Q1021', temp:8,dewp:6,wdir:250,wspd:8,altim:1021}}; }
  e.load(fl); const sim = new DemoSim(fl);
  let t=0, lastAct=0, maxAlt=0;
  for (let i=0;i<200000 && e.phase!=='DONE';i++){
    t+=1000; const tel = sim.step(1*(e.phase==='CRUISE'?8:1), e); maxAlt=Math.max(maxAlt,tel.alt);
    e.tick(t, tel);
    const acts=e.actions();
    if (acts.length && t-lastAct>4000){ const a=acts.find(x=>x.primary)||acts[0]; if(a.id!=='go_around'){ e.pilotAction(a.id); lastAct=t; } }
  }
  console.log(`\n=== ${lang} FL${cruise/100} -> ${e.phase} in ${(t/60000).toFixed(0)} min sim, maxAlt ${maxAlt.toFixed(0)}, msgs ${log.length}`);
  if (lang==='fr' && cruise===35000 || lang==='en' && cruise===15000) for (const m of log) console.log(`[${m.from}${m.station?' '+m.station:''}] ${m.text}`);
  if (e.phase!=='DONE') { console.log('STUCK phase', e.phase, e.station, e.pending, e.cleared, sim.telemetry()); process.exitCode=1; }
}
const e=new AtcEngine({lang:'fr'}); e.load(demoFlight()); const a=e.atis('dep'); console.log('\nATIS:',a.text,'\nSPEECH:',a.speech);
const e2=new AtcEngine({lang:'en'}); e2.load(demoFlight()); e2.pilotAction('req_clearance'); e2.tick(5000,null); console.log('\nSPEECH EN:', e2.pending.readback.speech);
