// IA : réglages, aide pour la clé, message libre, urgence, copilote (réponses de l'IA simulées)
const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/ai-local.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => { if (l >= 2) log('console: ' + m + ' ' + src + ':' + line); }));
const answers = [];
app.whenReady().then(async () => {
  ipcMain.removeHandler('ai-chat'); ipcMain.handle('ai-chat', (_e, o) => { log('→ IA (' + o.provider + ', ' + o.model + ') : ' + o.messages[0].content.split('\n').pop()); return { ok: true, text: answers.shift() || '{"type":"say_again","lang":"en"}' }; });
  await wait(4000);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  const lastMsgs = async (n) => js(`[...document.querySelectorAll('#log .msg')].slice(-${n}).map(m => m.textContent.replace(/\\s+/g,' ')).join('\\n')`);
  await js(`document.getElementById('btnLoadDemo').click(); 1`); await wait(3500);
  ipcMain.removeHandler('ai-prepare-local'); ipcMain.handle('ai-prepare-local', () => ({ ok: true, model: 'onnx-community/Qwen2.5-1.5B-Instruct' }));
  ipcMain.removeHandler('ollama-tags'); ipcMain.handle('ollama-tags', () => ({ ok: true, models: ['llama3.1:8b', 'qwen2.5:7b'] }));
  await js(`document.getElementById('btnSettings').click(); const p = document.getElementById('setAiProvider'); p.value = 'local'; p.dispatchEvent(new Event('change')); 1`);
  await wait(800);
  log('local : ' + await js(`document.getElementById('aiLocalState').textContent + ' | clé visible=' + !document.querySelector('.ai-key-only').classList.contains('hidden')`));
  fs.mkdirSync('/tmp/claude-0/shots', { recursive: true });
  fs.writeFileSync('/tmp/claude-0/shots/ailocal.png', (await w.webContents.capturePage()).toPNG());
  answers.push('{"type":"action","action":"req_clearance","lang":"fr","level":null}');
  await js(`document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden')); document.getElementById('freeText').value = "on voudrait la clearance"; document.getElementById('freeSend').click(); 1`); await wait(4000);
  log('clearance via IA intégrée :\n' + await lastMsgs(2));
  await js(`(() => { document.getElementById('btnSettings').click(); const q = document.getElementById('setAiProvider'); q.value = 'ollama'; q.dispatchEvent(new Event('change')); return 1; })()`);
  await wait(800);
  log('ollama : ' + await js(`document.getElementById('aiOllamaState').textContent`));
  app.exit(0);
});
