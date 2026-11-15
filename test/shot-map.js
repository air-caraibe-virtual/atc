const { app, BrowserWindow } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => console.log('console:', m, src, line)));
app.whenReady().then(async () => {
  await wait(1500); const w = BrowserWindow.getAllWindows()[0]; const js = (c) => w.webContents.executeJavaScript(c);
  await js(`localStorage.setItem('atcsolo', JSON.stringify({mute:true, v:3})); location.reload();`); await wait(1500);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  for (let i = 0; i < 8; i++) { await js(`(()=>{const b=document.querySelector('.act.primary'); if(b && !b.textContent.startsWith('Collationner')) b.click();})()`); await wait(4000); }
  await js(`document.querySelector('[data-view=map]').click()`); await wait(8000);
  fs.writeFileSync('/tmp/claude-0/shots/map.png', (await w.webContents.capturePage()).toPNG());
  await js(`document.getElementById('btnFitRoute').click()`); await wait(800);
  fs.writeFileSync('/tmp/claude-0/shots/map-fit.png', (await w.webContents.capturePage()).toPNG());
  console.log('style:', await js(`document.getElementById('selMapStyle').value`));
  console.log('info:', await js(`['mNext','mNextDist','mRemain'].map(i=>document.getElementById(i).textContent).join(' | ')`));
  app.exit(0);
});
