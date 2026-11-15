const { app, BrowserWindow } = require('electron');
require('../main.js');
const fs = require('fs'); const wait = (ms) => new Promise(r => setTimeout(r, ms));
const LOG = '/tmp/claude-0/tray.log'; fs.writeFileSync(LOG, ''); const log = (s) => fs.appendFileSync(LOG, s + '\n');
app.on('quit', () => log('quit OK'));
app.whenReady().then(async () => {
  await wait(4000);
  const w = BrowserWindow.getAllWindows()[0];
  w.close(); await wait(800);
  log('après la croix : fenêtre ' + (w.isDestroyed() ? 'détruite' : w.isVisible() ? 'visible' : 'cachée'));
  w.show(); await wait(500);
  log('bouton : ' + await w.webContents.executeJavaScript(`document.getElementById('btnQuit').textContent`));
  const img = await w.webContents.capturePage(); fs.writeFileSync('/tmp/claude-0/shots/tray.png', img.toPNG());
  await w.webContents.executeJavaScript(`document.getElementById('btnQuit').click(); 1`);
  await wait(3000); log('toujours ouvert ?'); app.exit(0);
});
