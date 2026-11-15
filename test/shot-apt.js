const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => fs.appendFileSync('/tmp/claude-0/apt.log', 'console: ' + m + ' ' + src + ':' + line + '\n')));
app.whenReady().then(async () => {
  await wait(1200);
  ipcMain.removeHandler('airport-layout');
  ipcMain.handle('airport-layout', (_e, icao) => icao === 'TFFR' ? require('./fixture-tffr.js') : null);
  ipcMain.removeHandler('notams');
  ipcMain.handle('notams', (_e, icao) => icao === 'TFFR' ? [{ icaoMessage: 'A0001/26 NOTAMN Q) TTZP/QMRLC/IV/NBO/A/000/999 A) TFFR B) 2611010000 C) 2612312359 E) RWY 12/30 CLSD DUE TO WIP' }] : []);
  const w = BrowserWindow.getAllWindows()[0]; const js = (c) => { fs.appendFileSync('/tmp/claude-0/apt.log', 'STEP ' + c.slice(0,60) + '\n'); return Promise.race([w.webContents.executeJavaScript(c), wait(8000).then(()=>'TIMEOUT')]); };
  await js(`localStorage.setItem('atcsolo', JSON.stringify({mute:true, v:3, mapStyle:'dark'})); location.reload();`); await wait(1500);
  await js(`document.querySelector('[data-view=map]').click()`); await wait(300);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  for (let i = 0; i < 4; i++) { await js(`(()=>{const b=document.querySelector('.act.primary'); if(b && !b.textContent.startsWith('Collationner')) b.click();})()`); await wait(4500); }
  for (const z of [11,12,13,14,15,16]) { const r = await js(`(()=>{const t=performance.now(); MapView.setFollow(false); MapView.map.setView([16.2685,-61.5395], ${z === 16 ? 14 : z}); return 'z${z} ' + Math.round(performance.now()-t) + 'ms layers=' + Object.keys(MapView.airports).length; })()`); fs.appendFileSync('/tmp/claude-0/apt.log', r + '\n'); await wait(700); }
  fs.writeFileSync('/tmp/claude-0/shots/apt.png', (await w.webContents.capturePage()).toPNG());
  await js(`document.querySelector('[data-view=radio]').click()`); await wait(300);
  fs.appendFileSync('/tmp/claude-0/apt.log', 'SYS: ' + await js(`[...document.querySelectorAll('.msg.system')].map(e=>e.textContent).join(' | ')`) + '\n');
  fs.appendFileSync('/tmp/claude-0/apt.log', 'ATC: ' + await js(`[...document.querySelectorAll('.msg.atc .txt')].map(e=>e.textContent).filter(t=>/roulez|autorisé/.test(t)).join(' | ')`) + '\n');
  fs.appendFileSync('/tmp/claude-0/apt.log', 'PILOT: ' + await js(`[...document.querySelectorAll('.msg.pilot .txt')].map(e=>e.textContent).filter(t=>/Roulons/.test(t)).join(' | ')`) + '\n');
  app.exit(0);
});
