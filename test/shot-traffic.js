const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/tr.log'; const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => log('console: ' + m + ' ' + src + ':' + line)));
app.whenReady().then(async () => {
  await wait(1200);
  ipcMain.removeHandler('airport-layout'); ipcMain.handle('airport-layout', (_e, icao) => icao === 'TFFR' ? require('./fixture-tffr.js') : null);
  ipcMain.removeHandler('notams'); ipcMain.handle('notams', () => []);
  const base = { lat: 16.2653, lon: -61.5318 };
  ipcMain.removeHandler('live-flights'); ipcMain.handle('live-flights', () => [
    { cs: 'AFR792', icao24: '3965a1', lat: 16.39, lon: -61.74, alt: 6000, onGround: false, kts: 240, track: 125, vs: -900 },
    { cs: 'TVF3451', icao24: '39e4b2', lat: base.lat, lon: base.lon + 0.0005, alt: 30, onGround: true, kts: 0, track: 0, vs: 0 },
  ]);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => { log('STEP ' + c.slice(0, 50)); return Promise.race([w.webContents.executeJavaScript(c), wait(8000).then(() => 'TIMEOUT')]); };
  await js(`localStorage.setItem('atcsolo', JSON.stringify({mute:true, v:3, mapStyle:'dark', traffic:false})); location.reload();`); await wait(1500);
  await js(`document.querySelector('[data-view=map]').click()`); await wait(300);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  await js(`document.getElementById('chkTraffic').click()`);
  for (let i = 0; i < 7; i++) { await wait(10000); log('t+' + (i + 1) * 10 + 's ' + await js('__atc.traffic.ai.map(a=>a.cs+":"+a.state).join(",")')); }
  log('setView: ' + await js(`(()=>{const t=performance.now(); MapView.setFollow(false); MapView.map.setView([16.27,-61.55], 13); return Math.round(performance.now()-t)+'ms'})()`)); await wait(800);
  log('alive: ' + await js('1+1'));
  const img = await Promise.race([w.webContents.capturePage(), wait(8000).then(() => null)]);
  log('capture: ' + (img ? 'ok' : 'TIMEOUT'));
  if (img) fs.writeFileSync('/tmp/claude-0/shots/traffic.png', img.toPNG());
  log('MSGS: ' + await js(`[...document.querySelectorAll('.msg')].map(e=>e.className.replace('msg ','')+': '+e.querySelector('.txt').textContent).join('\\n')`));
  log('MARKERS: ' + await js(`MapView.trafficMarkers ? [...MapView.trafficMarkers.values()].map(m=>m._label).join(', ') : 'none'`));
  app.exit(0);
});
