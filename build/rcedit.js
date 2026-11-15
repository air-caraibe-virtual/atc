// Icône et informations de version dans ATC.exe (utilisé par la publication automatique sur GitHub)
const rceditMod = require('rcedit');
const rcedit = rceditMod.rcedit || rceditMod.default || rceditMod;
const path = require('path');
const v = require('../package.json').version;
const num = v.split('-')[0];
rcedit(path.join(__dirname, '..', 'dist', 'win-unpacked', 'ATC.exe'), {
  icon: path.join(__dirname, 'icon.ico'),
  'file-version': num, 'product-version': v,
  'version-string': { FileDescription: 'ATC - controle aerien pour Microsoft Flight Simulator 2024', ProductName: 'ATC', CompanyName: 'ATC', LegalCopyright: '(c) 2026 ATC', InternalName: 'ATC', OriginalFilename: 'ATC.exe' },
}).then(() => console.log('ATC.exe : icône et version', v)).catch((e) => { console.error(e); process.exit(1); });
