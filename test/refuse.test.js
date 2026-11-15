const { AtcEngine } = require('../src/engine.js');
const log=[]; const e=new AtcEngine({lang:'fr', onMessage:m=>log.push(m)});
e.load({callsign:'FWI512',cruise:35000,dep:{icao:'TFFR',city:'Pointe-à-Pitre',rwy:'12',elev:36,lat:16.26,lon:-61.53},arr:{icao:'LFPG',city:'Paris',rwy:'27L',elev:392,lat:49.0,lon:2.55}});
e.jumpTo('CRUISE'); let t=0; const tel={connected:true,lat:30,lon:-40,alt:35000,agl:35000,ias:280,gs:480,onGround:false};
e.tick(t,tel); e.rand=()=>0.1; e.pilotAction('req_level',37000); e.rand=Math.random;
for(;t<400000;t+=1000){ e.tick(t,tel); if(e.pending) e.pilotAction('readback'); }
log.slice(-6).forEach(m=>console.log(`[${m.from}] ${m.text}`)); console.log('target', e.target, 'cleared', e.cleared);
