global.self = { ATC: require('../src/engine.js') };
require('../src/map.js'); const M = self.MapView;
M.route = [{ident:'LFPO',lat:48.72,lon:2.38},{ident:'A',lat:48.0,lon:3.0},{ident:'B',lat:47.0,lon:3.5},{ident:'C',lat:46.0,lon:4.5},{ident:'LFMN',lat:43.66,lon:7.22}];
M.nextIdx = 1; const out=[];
for (let i=0;i<=100;i++){ // vol le long de la route
  const f=i/100, segs=M.route.length-1, s=Math.min(segs-1, Math.floor(f*segs)), t=f*segs-s, a=M.route[s], b=M.route[s+1];
  M.updateNext({lat:a.lat+(b.lat-a.lat)*t, lon:a.lon+(b.lon-a.lon)*t}); out.push(M.route[M.nextIdx].ident); }
console.log([...new Set(out)].join(' → '));
