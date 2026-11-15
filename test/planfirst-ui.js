// Trafic réel sans plan de vol, dans l'appli complète (MSFS simulé)
const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/plan-first.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => { if (l >= 2) log('console: ' + m + ' ' + src + ':' + line); }));
const fx = require('./fixture-tffr.js');
const base = { lat: 16.2653, lon: -61.5318 };
const off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
const H = (n, h) => { ipcMain.removeHandler(n); ipcMain.handle(n, h); };
app.whenReady().then(async () => {
  H('nearest-airport', () => [{ icao: 'TFFR', name: 'Pointe-à-Pitre', lat: base.lat, lon: base.lon }]);
  H('airport-layout', () => fx);
  H('metar', () => [{ icaoId: 'TFFR', wdir: 120, wspd: 10 }]);
  H('live-flights', () => [
    { cs: 'AFR792', icao24: '3965a1', ...off(-8000, -3000), alt: 3000, onGround: false, kts: 180, track: 120, vs: -700 },
    { cs: 'TVF3451', icao24: '39e4b2', ...off(-390, 40), alt: 30, onGround: true, kts: 0, track: 0, vs: 0 },
    { cs: 'AAL1442', icao24: 'a1b2c3', ...off(190, 10), alt: 30, onGround: true, kts: 0, track: 0, vs: 0 },
  ]);
  H('ai-models', () => [{ title: 'Airbus A320neo', livery: 'Air France' }]);
  H('ai-spawn', () => true);
  await wait(4000);
  const w = BrowserWindow.getAllWindows()[0];
  const orig = w.webContents.send.bind(w.webContents);
  w.webContents.send = (ch, d) => { if ((ch === 'sim-status' && d && d.status !== 'connected') || (ch === 'telemetry' && d && !d.title)) return; orig(ch, d); };
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(8000).then(() => 'TIMEOUT')]);
  w.webContents.send('sim-status', { status: 'connected' });
  await wait(500);
  await js(`document.getElementById('chkTraffic').checked || document.getElementById('chkTraffic').click(); 1`);
  const tel = { connected: true, inFlight: true, lat: base.lat + 0.001, lon: base.lon + 0.001, alt: 36, agl: 0, onGround: true, gs: 0, ias: 0, hdg: 120, vs: 0, parkingBrake: true, engineOn: false, title: 'Airbus A320neo Air France' };
  const iv = setInterval(() => { w.webContents.send('sim-status', { status: 'connected' }); w.webContents.send('telemetry', tel); }, 200);
  await js(`(() => { const t = window.__atc.traffic; window.__clr = []; const c = t.clear.bind(t); t.clear = () => { window.__clr.push(new Error().stack.split('\\n').slice(2,4).join(' | ')); c(); }; const ct = t.context.bind(t); window.__nulls = 0; t.context = (...a) => { const r = ct(...a); if (!r) window.__nulls++; return r; }; return 1; })()`);
  // on charge un plan de vol au départ du même aéroport
  await js(`(() => { const f = { callsign: 'AFR512', cruise: 15000, dep: { icao: 'TFFF', city: 'Fort-de-France', rwy: '10', elev: 16, lat: 14.591, lon: -61.0032, metar: { rawOb: 'X', wdir: 100, wspd: 8, altim: 1014 } }, arr: { icao: 'TFFR', city: 'Pointe-à-Pitre', rwy: '12', elev: 36, lat: 16.2653, lon: -61.5318, metar: { rawOb: 'X', wdir: 120, wspd: 10, altim: 1015 } } }; window.__atc.engine.load(f); return 1; })()`);
  for (let i = 0; i < 6; i++) { await wait(5000); log(`plan chargé t+${(i + 1) * 5}s avions: ` + await js(`window.__atc.traffic.list().length + ' ' + JSON.stringify((() => { const t = window.__atc.traffic; return { side: t.side, ctx: !!t.ctx, live: t.live && t.live.length, ai: t.ai.map(a => a.cs + ':' + a.state) }; })())`)); }
  log('clears: ' + await js(`window.__clr.length + ' nulls=' + window.__nulls + ' ' + window.__clr.slice(0,3).join(' ## ')`));
  log('log: ' + await js(`[...document.querySelectorAll('#log .msg')].map(m => m.textContent).join('\\n')`));
  clearInterval(iv); app.exit(0);
});
