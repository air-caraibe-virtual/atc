const { app, BrowserWindow } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/stress.log'; const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.whenReady().then(async () => {
  await wait(1500);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(10000).then(() => 'TIMEOUT')]);
  await js(`document.querySelector('[data-view=map]').click()`); await wait(500);
  const r1 = await js(`(()=>{
    const t0=performance.now(); const els=[]; let id=1; const B={lat:48.72,lon:2.37};
    for(let i=0;i<600;i++){ const a={lat:B.lat+Math.random()*0.03,lon:B.lon+Math.random()*0.05}; const b={lat:a.lat+0.001,lon:a.lon+0.001};
      els.push({type:'way',tags:{aeroway:'taxiway',ref:'W'+(i%90)},nodes:[id++,id++],geometry:[a,b]}); }
    for(let i=0;i<150;i++) els.push({type:'node',id:id++,tags:{aeroway:i%2?'holding_position':'parking_position',ref:'H'+i},lat:B.lat+Math.random()*0.03,lon:B.lon+Math.random()*0.05});
    els.push({type:'way',tags:{aeroway:'runway',ref:'06/24'},geometry:[{lat:48.72,lon:2.36},{lat:48.73,lon:2.40}]});
    const L=Airport.parse({elements:els}); MapView.setAirport('LFPO',L,new Set());
    for(let k=0;k<60;k++){ const pts=[{lat:48.72+k*1e-5,lon:2.37},{lat:48.725,lon:2.38}]; MapView.setTaxiRoute(pts,'W1',['W'+(k%5),'W'+(k%7)]); }
    return 'setup '+Math.round(performance.now()-t0)+'ms';})()`);
  log(r1);
  for (const z of [12, 13, 14, 15, 16, 17, 15, 13, 16]) {
    const r = await js(`(()=>{const t=performance.now(); MapView.map.setView([48.725,2.38], ${z}, {animate:false}); return 'zoom ${z}: '+Math.round(performance.now()-t)+'ms';})()`);
    log(r); await wait(300);
  }
  log('alive: ' + await js('1+1'));
  app.exit(0);
});
