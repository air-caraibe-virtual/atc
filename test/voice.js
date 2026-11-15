const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs');
const wait = (ms) => new Promise(r => setTimeout(r, ms));
let calls = [];
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m) => console.log('console:', m)));
app.whenReady().then(async () => {
  await wait(1500);
  ipcMain.removeHandler('tts');
  const mode = process.env.MODE;
  ipcMain.handle('tts', async (_e, text, voice, rate, pitch) => { calls.push(voice + ' ' + rate + ' ' + pitch); if (mode === 'fail') throw new Error('offline'); return new Uint8Array(fs.readFileSync('/tmp/claude-0/test.mp3')); });
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => w.webContents.executeJavaScript(c);
  await js(`localStorage.setItem('atcsolo', JSON.stringify({v:3, mute:false, traffic:false})); location.reload();`); await wait(1500);
  await js(`document.getElementById('btnStart').click(); document.querySelector('[data-tab=demo]').click(); document.getElementById('btnLoadDemo').click();`);
  await wait(2500);
  for (let i = 0; i < 4; i++) { await js(`(document.querySelector('.act.primary')||{click(){}}).click()`); await wait(5000); }
  await js(`document.getElementById('btnSettings').click()`); await wait(300);
  fs.writeFileSync('/tmp/claude-0/shots/voice-' + (mode||'ok') + '.png', (await w.webContents.capturePage()).toPNG());
  console.log('tts calls:', calls.length, [...new Set(calls)].join(' | '));
  console.log('speaking now:', await js(`document.querySelectorAll('.msg.speaking').length`), 'system msgs:', await js(`[...document.querySelectorAll('.msg.system')].map(e=>e.textContent).join(' / ')`));
  app.exit(0);
});
