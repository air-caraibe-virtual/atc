const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/langui.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => { if (l >= 2) log('console: ' + m + ' ' + src + ':' + line); }));
app.whenReady().then(async () => {
  ipcMain.removeHandler('stt-prepare'); ipcMain.handle('stt-prepare', () => ({ ok: true }));
  ipcMain.removeHandler('stt-transcribe'); ipcMain.handle('stt-transcribe', () => ({ ok: true, detected: 'fr', results: [{ lang: 'fr', text: 'Délivrance, Air France 512, bonjour, demande clairance IFR pour Fort-de-France, information Bravo' }] }));
  await wait(5000);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(8000).then(() => 'TIMEOUT')]);
  await js(`document.getElementById('btnLoadDemo') && document.getElementById('btnLoadDemo').click(); 1`);
  await wait(4000);
  log('speakBar: ' + await js(`(() => { const b = document.getElementById('speakBar'); return (b.classList.contains('hidden') ? 'caché' : 'visible') + ' | ' + b.textContent; })()`));
  log('actions: ' + await js(`[...document.querySelectorAll('#actions .act')].map(b => b.textContent).join(' || ')`));
  // langue : FR à TFFR (Guadeloupe -> français compris)
  await js(`[...document.querySelectorAll('#speakBar .chip')].find(b => b.textContent === 'FR').click(); 1`);
  await wait(300);
  log('actions FR: ' + await js(`[...document.querySelectorAll('#actions .act')].map(b => b.textContent).join(' || ')`));
  // micro (transcription simulée)
  await js(`(() => { const S = JSON.parse(localStorage.getItem('atcsolo')); S.mic = true; localStorage.setItem('atcsolo', JSON.stringify(S)); document.getElementById('setMic').checked = true; document.getElementById('setMic').dispatchEvent(new Event('change')); return 1; })()`);
  await wait(1500);
  log('mic btn: ' + await js(`(document.querySelector('#actions .act.mic') || {}).textContent`));
  await js(`window.__atcSpeech({ ok: true, detected: 'fr', results: [{ lang: 'fr', text: 'Pointe-à-Pitre Délivrance, Air France 512, bonjour, demande la clairance IFR pour Fort-de-France, information Delta' }] }); 1`);
  await wait(4000);
  await js(`window.__atcSpeech({ ok: true, detected: 'en', results: [{ lang: 'en', text: 'hello can you hear me' }] }); 1`);
  await wait(4000);
  const img = await Promise.race([w.webContents.capturePage(), wait(8000).then(() => null)]);
  if (img) { fs.mkdirSync('/tmp/claude-0/shots', { recursive: true }); fs.writeFileSync('/tmp/claude-0/shots/lang.png', img.toPNG()); }
  log('log: ' + await js(`[...document.querySelectorAll('#log .msg')].slice(-8).map(m => m.textContent).join('\\n')`));
  app.exit(0);
});
