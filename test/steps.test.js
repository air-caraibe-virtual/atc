const { AtcEngine, utils } = require('../src/engine.js');
const DemoSim = require('../src/demo.js');
for (const lang of ['fr','en']) {
const fl = { callsign:'FWI512', cruise:35000, sid:null,
  dep:{icao:'TFFR', city:'Pointe-à-Pitre', rwy:'12', elev:36, lat:16.2653, lon:-61.5318, ta:5000, tl:6000, metar:{rawOb:'X 9999', wdir:90,wspd:12,altim:1015,temp:28,dewp:22}},
  arr:{icao:'LFPG', city:'Paris', rwy:'27L', elev:392, lat:49.0097, lon:2.5479, ta:4000, tl:5000, metar:{rawOb:'X 9999', wdir:250,wspd:8,altim:1021,temp:8,dewp:6}},
  steps:[{fix:'ELSOX', alt:37000, lat:30, lon:-40}, {fix:'BUNAV', alt:39000, lat:42, lon:-20}] };
const log=[]; let seed=3; const rand=()=>{seed=(seed*16807)%2147483647; return seed/2147483647;};
const e=new AtcEngine({lang, rand, onMessage:m=>log.push(m)}); e.load(fl); const sim=new DemoSim(fl);
let t=0,last=0, requested=false, maxAlt=0;
for(let i=0;i<300000&&e.phase!=='DONE';i++){ t+=1000; const tel=sim.step(['CRUISE','CLIMB'].includes(e.phase)?20:1,e); maxAlt=Math.max(maxAlt,tel.alt); e.tick(t,tel);
  const acts=e.actions(); if(acts.length&&t-last>4000){
    const lv=acts.find(a=>a.id==='req_level');
    if(lv && !requested && e.phase==='CRUISE' && e.clearDir==='level' && e.target===35000){ requested=true; e.pilotAction('req_level', 36000); last=t; continue; }
    const a=acts.find(x=>x.primary)||acts.find(x=>x.id==='req_descent'); if(a){e.pilotAction(a.id); last=t;} } }
console.log(`=== ${lang} -> ${e.phase}, maxAlt ${Math.round(maxAlt)}`);
log.filter(m=>/niveau 3[6-9]|FL3[6-9]|palier|step|trafic|traffic|disponible|available|descendez niveau 110|descend FL110|demande niveau|request FL/.test(m.text)).forEach(m=>console.log(` [${m.from}] ${m.text}`));
}
