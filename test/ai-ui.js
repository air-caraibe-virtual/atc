// IA : réglages, aide pour la clé, message libre, urgence, copilote (réponses de l'IA simulées)
const { app, BrowserWindow, ipcMain } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/ai.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('browser-window-created', (e, w) => w.webContents.on('console-message', (ev, l, m, line, src) => { if (l >= 2) log('console: ' + m + ' ' + src + ':' + line); }));
const answers = [];
app.whenReady().then(async () => {
  ipcMain.removeHandler('ai-chat'); ipcMain.handle('ai-chat', (_e, o) => { log('→ IA (' + o.provider + ', ' + o.model + ') : ' + o.messages[0].content.split('\n').pop()); return { ok: true, text: answers.shift() || '{"type":"say_again","lang":"en"}' }; });
  await wait(4000);
  const w = BrowserWindow.getAllWindows()[0];
  const js = (c) => Promise.race([w.webContents.executeJavaScript(c), wait(6000).then(() => 'TIMEOUT')]);
  const lastMsgs = async (n) => js(`[...document.querySelectorAll('#log .msg')].slice(-${n}).map(m => m.textContent.replace(/\\s+/g,' ')).join('\\n')`);
  await js(`document.getElementById('btnLoadDemo').click(); 1`); await wait(3500);
  // clé collée -> fournisseur détecté
  await js(`document.getElementById('btnSettings').click(); const k = document.getElementById('setAiKey'); k.value = 'gsk_test123'; k.dispatchEvent(new Event('input')); k.dispatchEvent(new Event('change')); 1`);
  log('fournisseur : ' + await js(`document.getElementById('setAiProvider').value`));
  await js(`document.getElementById('btnAiHelp').click(); 1`); await wait(300);
  fs.mkdirSync('/tmp/claude-0/shots', { recursive: true });
  fs.writeFileSync('/tmp/claude-0/shots/aihelp.png', (await w.webContents.capturePage()).toPNG());
  await js(`document.querySelectorAll('[data-close]').forEach(b => { if (!b.closest('.hidden')) b.click(); }); document.querySelectorAll('.overlay').forEach(o => o.classList.add('hidden')); 1`);
  const send = async (t, to) => { await js(`document.getElementById('freeTo').value = '${to || 'atc'}'; document.getElementById('freeText').value = ${JSON.stringify(t)}; document.getElementById('freeSend').click(); 1`); await wait(4500); };
  answers.push('{"type":"action","action":"req_clearance","lang":"fr","level":null}');
  await send("on voudrait notre clearance pour Fort-de-France s'il vous plaît");
  log('--- action :\n' + await lastMsgs(3));
  await js(`window.__atc && window.__atc.engine && (window.__atc.engine.pending = null); 1`);
  answers.push('{"type":"reply","lang":"fr","pilot":"Délivrance, FWI512, quel est le retard prévu ?","atc":"FWI512, pas de retard prévu, rappelez prêt pour la mise en route"}');
  await send("on a du retard prévu ?");
  log('--- réponse libre :\n' + await lastMsgs(2));
  answers.push('{"type":"emergency","kind":"mayday","lang":"en","pilot":"Mayday mayday mayday, FWI512, engine fire, request immediate return","atc":"FWI512, roger mayday, you have priority, say souls on board and fuel remaining"}');
  await send("mayday mayday engine fire");
  log('--- urgence :\n' + await lastMsgs(3) + '\nflag=' + await js(`window.__atc.engine.flags.emergency`));
  answers.push('{"type":"copilot","answer":"La fréquence de Fort-de-France Tour est 118.65."}');
  await send("quelle fréquence pour la tour à l'arrivée ?", 'copilot');
  log('--- copilote :\n' + await lastMsgs(1));
  fs.writeFileSync('/tmp/claude-0/shots/ai.png', (await w.webContents.capturePage()).toPNG());
  app.exit(0);
});
