// Étapes de reprise verrouillées au sol avant départ
const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/resume.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
const H = (n, h) => { ipcMain.removeHandler(n); ipcMain.handle(n, h); };
app.whenReady().then(async () => {
  H('nearest-airport', () => []); H('live-flights', () => []); H('metar', () => []);
  await wait(4000);
  const w = BrowserWindow.getAllWindows()[0];
  const orig = w.webContents.send.bind(w.webContents);
  w.webContents.send = (ch, d) => { if ((ch === 'sim-status' && d && d.status !== 'connected') || (ch === 'telemetry' && d && !d.title)) return; orig(ch, d); };
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(8000).then(() => 'TIMEOUT')]);
  let tel = { connected: true, inFlight: true, lat: 16.2653, lon: -61.5318, alt: 36, agl: 0, onGround: true, gs: 0, ias: 0, hdg: 120, vs: 0, parkingBrake: true, engineOn: false, title: 'A320' };
  const iv = setInterval(() => { w.webContents.send('sim-status', { status: 'connected' }); w.webContents.send('telemetry', tel); }, 200);
  await js(`(() => { const f = { callsign: 'AFR512', cruise: 15000, dep: { icao: 'TFFR', city: 'Pointe-à-Pitre', rwy: '04R', elev: 36, lat: 16.2653, lon: -61.5318, metar: { rawOb: 'X', wdir: 120, wspd: 10, altim: 1015 } }, arr: { icao: 'TFFF', city: 'Fort-de-France', rwy: '10', elev: 16, lat: 14.591, lon: -61.0032, metar: { rawOb: 'X', wdir: 100, wspd: 8, altim: 1014 } } }; window.__atc.engine.load(f); return 1; })()`);
  await wait(1500);
  const st = () => js(`[...document.getElementById('selResume').options].map(o => o.value + (o.disabled ? ':off' : ':ok')).join(' ')`);
  log('sol: ' + await st());
  tel = { ...tel, alt: 5000, agl: 4900, onGround: false, gs: 250, ias: 250, vs: 0 };
  await wait(2500);
  log('vol: ' + await st());
  tel = { ...tel, lat: 15.5, lon: -61.3, alt: 35000, agl: 34900, gs: 450 }; await wait(2500); log('croisière: ' + await st());
  tel = { ...tel, lat: 14.7, lon: -61.05, alt: 3000, agl: 2900, gs: 200 }; await wait(2500); log('approche: ' + await st());
  tel = { ...tel, lat: 14.591, lon: -61.0032, alt: 16, agl: 0, onGround: true, gs: 10 }; await wait(2500); log('arrivé: ' + await st());
  clearInterval(iv); app.exit(0);
});
