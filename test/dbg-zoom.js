const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/dbg.log'; const log = (s) => fs.appendFileSync(LOG, s + '\n');
const MODE = process.env.MODE;
app.whenReady().then(async () => {
  await wait(1200);
  ipcMain.removeHandler('airport-layout'); ipcMain.handle('airport-layout', (_e, icao) => icao === 'TFFR' ? require('./fixture-tffr.js') : null);
  ipcMain.removeHandler('notams'); ipcMain.handle('notams', () => []);
  ipcMain.removeHandler('live-flights'); ipcMain.handle('live-flights', () => [{ cs: 'AFR792', icao24: '3965a1', lat: 16.39, lon: -61.74, alt: 6000, onGround: false, kts: 240, track: 125, vs: -900 }]);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  await js(`localStorage.setItem('atcsolo', JSON.stringify({mute:true, v:3, mapStyle:'dark', traffic:false})); location.reload();`); await wait(1500);
  await js(`document.querySelector('[data-view=map]').click()`); await wait(300);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  if (MODE !== 'notraffic') await js(`document.getElementById('chkTraffic').click()`);
  await wait(15000);
  log(MODE + ' ai: ' + await js(`__atc.traffic.ai.length`));
  for (const z of [11, 12, 13, 14]) { await wait(1500); log(MODE + ' zoom ' + z + ': ' + await js(`(()=>{const t=performance.now(); MapView.setFollow(false); MapView.map.setView([16.27,-61.55], ${z}, {animate: ${process.env.ANIM ? 'true' : 'false'}}); return Math.round(performance.now()-t)+'ms';})()`)); }
  log(MODE + ' alive: ' + await js('1+1'));
  const img = await Promise.race([w.webContents.capturePage().then(() => 'capture ok'), wait(8000).then(() => 'capture TIMEOUT')]); log(MODE + ' ' + img);
  app.exit(0);
});
