const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/rwyui.log'; const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => log('console: ' + m + ' ' + src + ':' + line)));
app.whenReady().then(async () => {
  await wait(1200);
  ipcMain.removeHandler('airport-layout'); ipcMain.handle('airport-layout', (_e, icao) => icao === 'TFFR' ? require('./fixture-tffr.js') : null);
  ipcMain.removeHandler('notams'); ipcMain.handle('notams', () => []);
  ipcMain.removeHandler('datis'); ipcMain.handle('datis', () => null);
  // vols réels : deux arrivées alignées en finale piste 30 (venant du sud-est)
  const base = { lat: 16.2653, lon: -61.5318 };
  const off = (dx, dy) => ({ lat: base.lat + dy / 111120, lon: base.lon + dx / (111120 * Math.cos(base.lat * Math.PI / 180)) });
  const se = off(1299 + 0.866 * 11000, -450 - 0.5 * 11000), se2 = off(1299 + 0.866 * 20000, -450 - 0.5 * 20000);
  ipcMain.removeHandler('live-flights'); ipcMain.handle('live-flights', () => [
    { cs: 'AFR792', icao24: 'a', ...se, alt: 2000, onGround: false, kts: 150, track: 300, vs: -700 },
    { cs: 'AAL12', icao24: 'b', ...se2, alt: 3500, onGround: false, kts: 170, track: 300, vs: -600 },
  ]);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  await js(`localStorage.setItem('atcsolo', JSON.stringify({mute:true, v:3})); location.reload();`); await wait(1500);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(4000);
  log('SYS: ' + await js(`[...document.querySelectorAll('.msg.system')].map(e=>e.textContent).join(' | ')`));
  log('rwy: ' + await js(`document.getElementById('stRwyDep').textContent + ' / takeoff=' + __atc.engine.flight.dep.rwyTakeoff + ' land=' + __atc.engine.flight.dep.rwyLand`));
  await js(`document.querySelector('.act.primary').click()`); await wait(5000);
  log('ATC: ' + await js(`[...document.querySelectorAll('.msg.atc .txt')].map(e=>e.textContent).join(' | ')`));
  app.exit(0);
});
