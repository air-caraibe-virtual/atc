const { app, BrowserWindow } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => console.log('console:', m, src, line)));
app.whenReady().then(async () => {
  await wait(1500); const w = BrowserWindow.getAllWindows()[0]; const js = (c) => w.webContents.executeJavaScript(c);
  await js(`document.getElementById('chkMute').click(); document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2000);
  await js(`document.getElementById('chkAutoRb').click()`); // désactive
  await js(`document.querySelector('.act.primary').click()`); await wait(7000);
  const off = await js(`document.querySelector('.act.primary') ? document.querySelector('.act.primary').textContent : 'none'`);
  fs.writeFileSync('/tmp/claude-0/shots/rb.png', (await w.webContents.capturePage()).toPNG());
  await js(`document.getElementById('chkAutoRb').click()`); await wait(3000); // réactive
  console.log('OFF button:', off.slice(0,40), '| after ON, pilot msgs:', await js(`document.querySelectorAll('.msg.pilot').length`));
  app.exit(0);
});
