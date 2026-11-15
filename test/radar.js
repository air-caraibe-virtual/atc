const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/radar.log'; const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => log('console: ' + m + ' ' + src + ':' + line)));
app.whenReady().then(async () => {
  await wait(1200);
  ipcMain.removeHandler('radar-frames'); ipcMain.handle('radar-frames', () => ({ host: 'https://tilecache.rainviewer.com', path: '/v2/radar/1763200000', time: 1763200000 }));
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  await js(`document.querySelector('[data-view=map]').click()`); await wait(400);
  await js(`document.getElementById('chkRadar').click()`); await wait(1500);
  log('radar layer: ' + await js(`!!MapView.radarLayer + ' ' + (MapView.radarLayer && MapView.radarLayer._url)`));
  log('info: ' + await js(`document.getElementById('mRadar').textContent`));
  await js(`document.getElementById('chkRadar').click()`); await wait(300);
  log('off: ' + await js(`!!MapView.radarLayer`));
  app.exit(0);
});
