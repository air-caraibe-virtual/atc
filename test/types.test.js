// Type d'avion plausible selon la compagnie et le numéro de vol
const Traffic = require('../src/traffic.js');
const models = ['FSLTL A320neo KLM', 'FSLTL B737-800 KLM', 'FSLTL B77W KLM', 'FSLTL E190 KLM Cityhopper', 'FSLTL A320neo Air France', 'FSLTL A359 Air France', 'FSLTL B77W Emirates', 'FSLTL A320 easyJet', 'FSLTL A333 Delta', 'FSLTL CRJ900 Lufthansa CityLine']
  .map((t) => ({ title: t, livery: '' }));
const tr = new Traffic({ io: {} }); tr.models = models; let s = 1; tr.rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const cases = [['KLM1263', 'LFMN', /737|A320/], ['KLM605', 'EHAM', /77W/], ['AFR7710', 'LFMN', /A320/], ['AFR22', 'LFPG', /A359/], ['UAE77', 'LFMN', /77W/], ['EZY4321', 'LFMN', /A320/], ['DAL82', 'LFMN', /A333/], ['CLH123', 'EDDM', /CRJ/]];
let fail = 0;
for (const [cs, ap, re] of cases) {
  const seen = new Set(); for (let i = 0; i < 20; i++) seen.add(tr.modelFor(cs, undefined).title);
  const m = tr.newAircraft('arr', { a: { icao: ap } }, { cs: cs + '' }).model.title; tr.used.clear();
  const ok = re.test(m); if (!ok) fail++;
  console.log(ok ? 'OK ' : 'KO ', cs, ap, '→', m);
}
process.exitCode = fail ? 1 : 0;
