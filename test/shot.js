const { app, BrowserWindow } = require('electron');
require('../main.js');
const fs = require('fs');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => console.log('console:', m, src, line)));
app.whenReady().then(async () => {
  await wait(2500);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => w.webContents.executeJavaScript(c);
  const shot = async (n) => { const img = await w.webContents.capturePage(); fs.writeFileSync(`/tmp/claude-0/shots/${n}.png`, img.toPNG()); };
  await shot('0-accueil');
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click();`);
  await wait(400); await shot('1-dialog');
  await js(`document.getElementById('btnLoadDemo').click();`);
  await wait(3000);
  for (let i = 0; i < 9; i++) { await js(`(document.querySelector('.act.primary')||{click(){}}).click()`); await wait(4500); }
  await js(`document.getElementById('btnAtisDep').click()`); await wait(500);
  await shot('2-vol');
  await js(`document.getElementById('btnSettings').click()`); await wait(300); await shot('3-params');
  const errs = await js(`document.querySelectorAll('.msg').length`); console.log('messages:', errs);
  app.exit(0);
});
