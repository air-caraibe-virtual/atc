const { AtcEngine } = require('../src/engine.js');
const fl = () => ({callsign:'AFR1511',cruise:35000,sid:'LATR2A',dep:{icao:'LFPO',city:'Paris',rwy:'24',elev:291,lat:48.7233,lon:2.3794},arr:{icao:'LFMN',city:'Nice',rwy:'04L',elev:12,lat:43.6584,lon:7.2159}});
const run = (label, tels) => { const log=[]; const e=new AtcEngine({lang:'fr',onMessage:m=>log.push(m)}); e.load(fl()); let t=0; for (const tel of tels) for(let i=0;i<10;i++){t+=1000; e.tick(t,tel);} t+=5000; e.tick(t,null); console.log(label, '->', e.phase, log.filter(m=>m.from==='atc').map(m=>m.text).join(' | ') || '(silence)'); };
// 1. menu MSFS : valeurs aberrantes, marquées hors vol par main.js
run('menu (inFlight:false)', [{connected:true,inFlight:false}]);
// 2. menu même si les valeurs passaient le filtre : avion "en l air" loin du départ
run('garbage airborne far', [{connected:true,inFlight:true,lat:0.5,lon:0.5,alt:30000,agl:30000,onGround:false,gs:0,ias:0}]);
// 3. vrai décollage sans clairance : vu au sol à LFPO puis en l air
run('real illegal takeoff', [{connected:true,inFlight:true,lat:48.7233,lon:2.3794,alt:291,agl:0,onGround:true,gs:0,ias:0},{connected:true,inFlight:true,lat:48.73,lon:2.37,alt:1500,agl:1200,onGround:false,gs:160,ias:160}]);
// 4. apparition directement en vol près de LFPO (vol démarré en l air)
run('spawn airborne near', [{connected:true,inFlight:true,lat:48.73,lon:2.37,alt:5000,agl:4700,onGround:false,gs:250,ias:250}]);
