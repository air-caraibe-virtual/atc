const { app, BrowserWindow } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m) => console.log('console:', m)));
app.whenReady().then(async () => {
  await wait(1500); const w = BrowserWindow.getAllWindows()[0]; const js = (c) => w.webContents.executeJavaScript(c);
  await js(`document.getElementById('chkMute').click(); document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  await js(`document.getElementById('selResume').value='CRUISE'; document.getElementById('btnResume').click();`); await wait(1200);
  await js(`[...document.querySelectorAll('.act')].find(b=>b.textContent.includes('niveau')).click()`); await wait(400);
  fs.writeFileSync('/tmp/claude-0/shots/level.png', (await w.webContents.capturePage()).toPNG());
  await js(`document.querySelector('#levelGrid button.up').click()`); await wait(4000);
  console.log('last:', await js(`[...document.querySelectorAll('.msg .txt')].slice(-2).map(e=>e.textContent).join(' || ')`));
  app.exit(0);
});
