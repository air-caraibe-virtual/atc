const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/upd.log'; const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => log('console: ' + m + ' ' + src + ':' + line)));
app.whenReady().then(async () => {
  ipcMain.removeHandler('update-check');
  ipcMain.handle('update-check', () => ({ ok: true, current: '2.1.0', version: '2.2.0', available: true, url: 'https://github.com/x/y.exe', size: 1,
    notes: '## Ajouts\n- Repoussage automatique avec le tracteur de MSFS\n- Avions FSLTL utilisés en priorité\n## Corrections\n- La carte ne se fige plus au zoom\n## Retraits\n- Ancien fond de carte CARTO' }));
  await wait(6500);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  log('visible: ' + await js(`!document.getElementById('dlgUpdate').classList.contains('hidden') + ' | ' + document.getElementById('updTitle').textContent + ' | ' + document.getElementById('appVer').textContent`));
  const img = await Promise.race([w.webContents.capturePage(), wait(8000).then(() => null)]);
  if (img) fs.writeFileSync('/tmp/claude-0/shots/update.png', img.toPNG());
  app.exit(0);
});
