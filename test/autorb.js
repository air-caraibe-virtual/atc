const { app, BrowserWindow } = require('electron');
require('../main.js');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => console.log('console:', m, src, line)));
app.whenReady().then(async () => {
  await wait(1500); const w = BrowserWindow.getAllWindows()[0]; const js = (c) => w.webContents.executeJavaScript(c);
  await js(`localStorage.setItem('atcsolo', JSON.stringify({autoCom:true, autoXpdr:true, mute:true, v:2})); location.reload();`); await wait(1500);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  // ne clique jamais « Collationner »
  for (let i = 0; i < 14; i++) { await js(`(()=>{const b=document.querySelector('.act.primary'); if(b && !b.textContent.startsWith('Collationner')) b.click();})()`); await wait(4000); }
  console.log((await js(`[...document.querySelectorAll('.msg')].map(e=>(e.classList.contains('pilot')?'  P: ':e.classList.contains('atc')?'ATC: ':'  -- ')+e.querySelector('.txt').textContent).join('\\n')`)));
  app.exit(0);
});
