const N = require('../src/notam.js');
const now = new Date(Date.UTC(2026, 10, 15, 10, 0));
const mk = (body) => ({ icaoMessage: body });
const list = [
  mk('A1234/26 NOTAMN Q) LFFF/QMRLC/IV/NBO/A/000/999/4843N00222E005 A) LFPO B) 2611010000 C) 2612152359 E) RWY 02/20 CLSD DUE TO WIP'),
  mk('A2000/26 NOTAMN Q) LFFF/QMRLC/IV/NBO/A/000/999 A) LFPO B) 2611150600 C) 2611301800 D) DLY 0600-1800 E) RWY 06/24 CLSD'),
  mk('A2001/26 NOTAMN Q) LFFF/QMRLC/IV/NBO/A/000/999 A) LFPO B) 2611150000 C) 2611302359 D) DLY 2200-0430 E) RWY 07/25 CLSD'),
  mk('A2002/26 NOTAMN Q) LFFF/QMRLC/IV/NBO/A/000/999 A) LFPO B) 2610010000 C) 2610302359 E) RWY 08/26 CLSD'),
  mk('A2003/26 NOTAMN Q) LFFF/QMRTT/IV/NBO/A/000/999 A) LFPO B) 2611010000 C) PERM E) RWY 24 TORA REDUCED, PORTION CLSD BTN TWY W1 AND W2'),
  mk('A2004/26 NOTAMN Q) LFFF/QMXLC/IV/NBO/A/000/999 A) LFPO B) 2611010000 C) 2612010000 E) TWY W7 CLSD'),
];
const c = N.closures(list, now);
console.log(c.map((x) => `${x.rwys.join('/')}${x.partial ? ' (partielle)' : ''} jusqu'à ${x.until ? x.until.toISOString().slice(0, 16) : 'PERM'}`).join('\n'));
console.log('24 fermée ?', N.isClosed(c, '24'), '| 20 ?', N.isClosed(c, '20'), '| 25 ?', N.isClosed(c, '25'), '| 26 ?', N.isClosed(c, '26'), '| opposé 08L ->', N.opposite('08L'));
