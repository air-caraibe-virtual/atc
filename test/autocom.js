const { app, BrowserWindow } = require('electron');
require('../main.js');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => { w.webContents.on('console-message', (ev, l, m, line, src) => console.log('console:', m, src, line)); });
app.whenReady().then(async () => {
  await wait(1500); const w = BrowserWindow.getAllWindows()[0]; const js = (c) => w.webContents.executeJavaScript(c);
  await js(`localStorage.setItem('atcsolo', JSON.stringify({autoCom:false, mute:true})); location.reload();`); await wait(1500);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(3500);
  const snap = async (l) => console.log(l, await js(`document.getElementById('stName').textContent + ' ' + document.getElementById('stFreq').textContent + ' | COM1 ' + document.getElementById('comFreq').textContent + ' | XPDR ' + document.getElementById('stSquawk').textContent`));
  await snap('start:'); console.log('S', await js(`localStorage.getItem('atcsolo')`));
  for (let i = 0; i < 6; i++) { await js(`(document.querySelector('.act.primary')||{click(){}}).click()`); await wait(4500); await snap('step' + i + ':'); }
  app.exit(0);
});
