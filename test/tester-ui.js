const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/tester.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => { if (l >= 2) log('console: ' + m + ' ' + src + ':' + line); }));
app.whenReady().then(async () => {
  ipcMain.removeHandler('update-check'); ipcMain.handle('update-check', (_e, beta) => { log('recherche de mise à jour, versions de test = ' + beta); return { ok: true, update: null }; });
  await wait(4000);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  log('case bêta présente : ' + await js(`!!document.getElementById('setBeta')`));
  await js(`document.getElementById('btnSettings').click(); for (let i = 0; i < 7; i++) document.getElementById('appVer').click(); 1`);
  log('champ code visible : ' + await js(`!document.getElementById('testerAsk').classList.contains('hidden')`));
  await js(`document.getElementById('testerCode').value = 'FAUX-CODE'; document.getElementById('btnTesterOk').click(); 1`); await wait(300);
  log('mauvais code : ' + await js(`document.getElementById('testerRes').textContent`));
  await js(`document.getElementById('testerCode').value = 'atc-avau-wdcc'; document.getElementById('btnTesterOk').click(); 1`); await wait(1500);
  log('mode testeur : ' + await js(`!document.getElementById('testerOn').classList.contains('hidden') + ' ' + JSON.parse(localStorage.getItem('atcsolo')).tester`));
  app.exit(0);
});
