// ATC — processus principal : fenêtre, liaison SimConnect (MSFS 2024), accès réseau.
const { app, BrowserWindow, ipcMain, net, shell, Notification, globalShortcut, session, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');
const {
  open, Protocol, SimConnectDataType, SimConnectPeriod, SimConnectConstants,
  NotificationPriority, EventFlag, FacilityDataType, RawBuffer, InitPosition, SimObjectType,
} = require('node-simconnect');

let win = null;
let handle = null;
let connected = false;
let retryTimer = null;

const DEF_TEL = 0, REQ_TEL = 0, DEF_FAC = 1, DEF_FENIX = 2, REQ_FENIX = 2, DEF_FENIX_XFER = 3, DEF_PARK = 4;
// ---- Trafic IA créé et piloté par ATC ----
const DEF_AIPOS = 10, DEF_AIGND = 11, DEF_AIGEAR = 12, DEF_AIGEARPOS = 13, DEF_AILIGHT = 14, EV_LSET_BASE = 70, EV_GEAR_SET = 61, REQ_MODELS = 40, REQ_AI_BASE = 1000, REQ_AIGND_BASE = 5000;
const EV_FRZ_LL = 50, EV_FRZ_ALT = 51, EV_FRZ_ATT = 52, EV_GEAR_UP = 53, EV_GEAR_DN = 54, EV_LAND_ON = 55, EV_LAND_OFF = 56, EV_BCN_ON = 57, EV_STROBE_ON = 58, EV_STROBE_OFF = 59, EV_ENG_AUTO = 60;
const ai = { byReq: new Map(), byLocal: new Map(), byObj: new Map(), models: null, modelsWait: [] };
// Fenix A320/A319/A321 : la radio passe par le RMP de l'avion (variables internes en kHz)
const fenix = { active: 0, stdby: 0, xfer: 0, seen: false };
let lastTitle = '';
const isFenix = () => /fenix/i.test(lastTitle);
const EV_PUSH = 14, EV_TUG_HDG = 15;
const EV_COM = 10, EV_XPDR = 11, EV_COM_STBY = 12, EV_COM_SWAP = 13, EV_SIMSTART = 20, EV_SIMSTOP = 21, EV_FRAME = 22, REQ_SIMSTATE = 30;
let simRunning = false, goodSamples = 0;
let facReq = 100;
const facPending = new Map();

// Variables lues dans le simulateur (l'ordre compte : il doit correspondre à la lecture)
const VARS = [
  ['PLANE LATITUDE', 'degrees'], ['PLANE LONGITUDE', 'degrees'], ['INDICATED ALTITUDE', 'feet'],
  ['PLANE ALT ABOVE GROUND', 'feet'], ['AIRSPEED INDICATED', 'knots'], ['GROUND VELOCITY', 'knots'],
  ['VERTICAL SPEED', 'feet per minute'], ['PLANE HEADING DEGREES MAGNETIC', 'degrees'], ['SIM ON GROUND', 'bool'],
  ['COM ACTIVE FREQUENCY:1', 'MHz'], ['TRANSPONDER CODE:1', 'number'], ['BRAKE PARKING POSITION', 'bool'],
  ['GENERAL ENG COMBUSTION:1', 'bool'], ['PUSHBACK STATE', 'enum'], ['PLANE HEADING DEGREES TRUE', 'degrees'],
];

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }
function status(s, detail) { connected = s === 'connected'; send('sim-status', { status: s, detail }); }

function decodeSquawk(v) {
  const n = Math.round(v);
  const hex = n.toString(16);
  if (/^[0-7]{1,4}$/.test(hex)) return hex.padStart(4, '0');
  return String(n).padStart(4, '0');
}

async function connectSim() {
  clearTimeout(retryTimer);
  if (handle) return;
  status('connecting');
  try {
    // protocole MSFS 2024 (nécessaire pour lister les avions installés), sinon celui de MSFS 2020
    let res;
    try { res = await open('ATC', Protocol.SunRise); }
    catch (e) { res = await open('ATC', Protocol.KittyHawk); }
    handle = res.handle;
    status('connected', res.recvOpen.applicationName);

    VARS.forEach(([n, u]) => handle.addToDataDefinition(DEF_TEL, n, u, SimConnectDataType.FLOAT64));
    handle.addToDataDefinition(DEF_TEL, 'TITLE', null, SimConnectDataType.STRING256);
    handle.requestDataOnSimObject(REQ_TEL, DEF_TEL, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND);
    try {
      ['L:N_PED_RMP1_ACTIVE', 'L:N_PED_RMP1_STDBY', 'L:S_PED_RMP1_XFER'].forEach((n) => handle.addToDataDefinition(DEF_FENIX, n, 'number', SimConnectDataType.FLOAT64));
      handle.addToDataDefinition(DEF_FENIX_XFER, 'L:S_PED_RMP1_XFER', 'number', SimConnectDataType.FLOAT64);
      handle.requestDataOnSimObject(REQ_FENIX, DEF_FENIX, SimConnectConstants.OBJECT_ID_USER, SimConnectPeriod.SECOND);
    } catch (e) { console.warn('Variables Fenix indisponibles', e); }

    handle.mapClientEventToSimEvent(EV_COM, 'COM_RADIO_SET_HZ');
    handle.mapClientEventToSimEvent(EV_XPDR, 'XPNDR_SET');
    handle.mapClientEventToSimEvent(EV_PUSH, 'TOGGLE_PUSHBACK');
    handle.mapClientEventToSimEvent(EV_TUG_HDG, 'KEY_TUG_HEADING');
    handle.mapClientEventToSimEvent(EV_COM_STBY, 'COM_STBY_RADIO_SET_HZ');
    handle.mapClientEventToSimEvent(EV_COM_SWAP, 'COM_STBY_RADIO_SWAP');

    // Définition des données d'aéroport (fréquences + pistes)
    for (const f of ['OPEN AIRPORT', 'LATITUDE', 'LONGITUDE', 'ALTITUDE',
      'OPEN RUNWAY', 'HEADING', 'LENGTH', 'PRIMARY_NUMBER', 'PRIMARY_DESIGNATOR', 'SECONDARY_NUMBER', 'SECONDARY_DESIGNATOR', 'CLOSE RUNWAY',
      'OPEN FREQUENCY', 'TYPE', 'FREQUENCY', 'NAME', 'CLOSE FREQUENCY', 'CLOSE AIRPORT']) {
      handle.addToFacilityDefinition(DEF_FAC, f);
    }
    // Parkings de MSFS (position, cap et taille exacts, comme dans le décor)
    try {
      for (const f of ['OPEN AIRPORT', 'LATITUDE', 'LONGITUDE', 'ALTITUDE', 'OPEN TAXI_PARKING', 'TYPE', 'NAME', 'NUMBER', 'HEADING', 'RADIUS', 'BIAS_X', 'BIAS_Z', 'CLOSE TAXI_PARKING', 'CLOSE AIRPORT']) handle.addToFacilityDefinition(DEF_PARK, f);
    } catch (e) { console.warn('Parkings MSFS indisponibles', e); }

    // Savoir si l'on est vraiment en vol (et pas dans les menus de MSFS)
    handle.subscribeToSystemEvent(EV_SIMSTART, 'SimStart');
    handle.subscribeToSystemEvent(EV_SIMSTOP, 'SimStop');
    try { handle.subscribeToSystemEvent(EV_FRAME, 'Frame'); } catch (_) {}
    handle.on('eventFrame', () => { lastFrameEvt = Date.now(); aiFrame(); });
    handle.requestSystemState(REQ_SIMSTATE, 'Sim');
    handle.on('event', (e) => {
      if (e.clientEventId === EV_SIMSTART) { simRunning = true; goodSamples = 0; }
      if (e.clientEventId === EV_SIMSTOP) { simRunning = false; goodSamples = 0; }
    });
    handle.on('systemState', (s) => { if (s.requestID === REQ_SIMSTATE) simRunning = s.dataInteger === 1; });

    handle.on('simObjectData', (r) => {
      if (r.requestID >= REQ_AIGND_BASE && r.requestID < REQ_AIGND_BASE + 100000) {
        const o = ai.byLocal.get(r.requestID - REQ_AIGND_BASE); if (!o) return;
        o.ground = r.data.readFloat64(); o.cg = r.data.readFloat64();
        return;
      }
      if (r.requestID === REQ_FENIX) {
        const d = r.data;
        fenix.active = d.readFloat64(); fenix.stdby = d.readFloat64(); fenix.xfer = d.readFloat64();
        if (fenix.active > 100000) fenix.seen = true;
        return;
      }
      if (r.requestID !== REQ_TEL) return;
      const d = r.data;
      const v = VARS.map(() => d.readFloat64());
      const title = d.readString256();
      lastTitle = title || '';
      // Valeurs plausibles ? (dans les menus, MSFS envoie n'importe quoi : altitude -375 000 ft, position 0/0…)
      const sane = v.every((x) => Number.isFinite(x)) && v[2] > -1500 && v[2] < 65000 && Math.abs(v[0]) <= 90 && Math.abs(v[1]) <= 180
        && !(Math.abs(v[0]) < 0.02 && Math.abs(v[1]) < 0.02) && v[3] > -200 && v[4] >= 0 && v[4] < 700 && v[5] < 900;
      goodSamples = simRunning && sane ? goodSamples + 1 : 0;
      const inFlight = goodSamples >= 3;
      if (!inFlight) { send('telemetry', { connected: true, inFlight: false, title }); return; }
      pushTick({ lat: v[0], lon: v[1], hdgTrue: v[14], pushState: Math.round(v[13]) });
      send('telemetry', {
        connected: true, inFlight: true, lat: v[0], lon: v[1], alt: v[2], agl: v[3], ias: v[4], gs: v[5], vs: v[6], hdg: v[7],
        onGround: v[8] > 0.5, com1: Math.round(v[9] * 1000) / 1000, squawk: decodeSquawk(v[10]),
        parkingBrake: v[11] > 0.5, engineOn: v[12] > 0.5, pushState: Math.round(v[13]), hdgTrue: v[14], title, fenix: isFenix(),
        ...(isFenix() && fenix.active > 100000 && fenix.active < 140000 ? { com1: Math.round(fenix.active) / 1000 } : {}),
        ...(isFenix() ? { fenixRmp: { active: fenix.active > 0 ? fenix.active / 1000 : null, stdby: fenix.stdby > 0 ? fenix.stdby / 1000 : null, xfer: fenix.xfer } } : {}),
      });
    });

    handle.on('facilityData', (r) => {
      const p = facPending.get(r.userRequestId); if (!p) return;
      try {
        const d = r.data;
        if (r.type === FacilityDataType.AIRPORT) {
          p.airport = { lat: d.readFloat64(), lon: d.readFloat64(), elevM: d.readFloat64() };
        } else if (r.type === FacilityDataType.RUNWAY) {
          const heading = d.readFloat32(), length = d.readFloat32();
          const pn = d.readInt32(), pd = d.readInt32(), sn = d.readInt32(), sd = d.readInt32();
          p.runways.push({ heading, length, pn, pd, sn, sd });
        } else if (r.type === FacilityDataType.TAXI_PARKING) {
          const type = d.readInt32(), name = d.readInt32(), number = d.readUint32(), heading = d.readFloat32(), radius = d.readFloat32(), bx = d.readFloat32(), bz = d.readFloat32();
          (p.parking = p.parking || []).push({ type, name, number, heading, radius, bx, bz });
        } else if (r.type === FacilityDataType.FREQUENCY) {
          const type = d.readInt32(), freq = d.readInt32(), name = d.readString64();
          p.freqs.push({ type, freq, name });
        }
      } catch (e) { p.errors = (p.errors || 0) + 1; }
    });
    handle.on('facilityDataEnd', (r) => {
      const p = facPending.get(r.userRequestId); if (!p) return;
      facPending.delete(r.userRequestId); clearTimeout(p.timer); p.resolve(p);
    });

    // Trafic IA : définitions de position et d'altitude sol
    try {
      [['PLANE LATITUDE', 'degrees'], ['PLANE LONGITUDE', 'degrees'], ['PLANE ALTITUDE', 'feet'], ['PLANE PITCH DEGREES', 'degrees'], ['PLANE BANK DEGREES', 'degrees'], ['PLANE HEADING DEGREES TRUE', 'degrees']]
        .forEach(([n, u]) => handle.addToDataDefinition(DEF_AIPOS, n, u, SimConnectDataType.FLOAT64));
      [['GROUND ALTITUDE', 'feet'], ['STATIC CG TO GROUND', 'feet']].forEach(([n, u]) => handle.addToDataDefinition(DEF_AIGND, n, u, SimConnectDataType.FLOAT64));
      handle.addToDataDefinition(DEF_AIGEAR, 'GEAR HANDLE POSITION', 'bool', SimConnectDataType.FLOAT64);
      // position réelle des trains (0 = rentré, 1 = sorti) : réglée directement, car les avions figés n'animent pas toujours leur train
      ['GEAR CENTER POSITION', 'GEAR LEFT POSITION', 'GEAR RIGHT POSITION'].forEach((n) => handle.addToDataDefinition(DEF_AIGEARPOS, n, 'percent over 100', SimConnectDataType.FLOAT64));
      handle.mapClientEventToSimEvent(EV_GEAR_SET, 'GEAR_SET');
      // feux des avions IA : écrits directement (les avions figés ignorent souvent les commandes)
      AI_LIGHTS.forEach(([v]) => handle.addToDataDefinition(DEF_AILIGHT, v, 'bool', SimConnectDataType.FLOAT64));
      AI_LIGHTS.forEach(([, e], i) => handle.mapClientEventToSimEvent(EV_LSET_BASE + i, e));
      [[EV_FRZ_LL, 'FREEZE_LATITUDE_LONGITUDE_SET'], [EV_FRZ_ALT, 'FREEZE_ALTITUDE_SET'], [EV_FRZ_ATT, 'FREEZE_ATTITUDE_SET'], [EV_GEAR_UP, 'GEAR_UP'], [EV_GEAR_DN, 'GEAR_DOWN'],
        [EV_LAND_ON, 'LANDING_LIGHTS_ON'], [EV_LAND_OFF, 'LANDING_LIGHTS_OFF'], [EV_BCN_ON, 'BEACON_LIGHTS_ON'], [EV_STROBE_ON, 'STROBES_ON'], [EV_STROBE_OFF, 'STROBES_OFF'], [EV_ENG_AUTO, 'ENGINE_AUTO_START']]
        .forEach(([id, n]) => handle.mapClientEventToSimEvent(id, n));
    } catch (e) { console.warn('Trafic IA indisponible', e); }
    handle.on('enumerateSimobjectAndLiveryList', (r) => {
      ai.modelsAcc = (ai.modelsAcc || []).concat((r.simobjectLiveries || []).map((x) => ({ title: x.aircraftTitle, livery: x.liveryName })));
      if (r.entryNumber + 1 >= r.outOf) { ai.models = ai.modelsAcc; ai.modelsAcc = null; ai.modelsWait.splice(0).forEach((f) => f(ai.models)); }
    });
    handle.on('assignedObjectID', (r) => {
      const local = ai.byReq.get(r.requestID); if (local == null) return;
      ai.byReq.delete(r.requestID);
      const o = ai.byLocal.get(local); if (!o) { try { handle.aIRemoveObject(r.objectID, 0); } catch (_) {} return; }
      o.obj = r.objectID; ai.byObj.set(r.objectID, o);
      const ev = (id, v) => { try { handle.transmitClientEvent(r.objectID, id, v, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {} };
      // ATC prend entièrement la main : on retire le pilote IA de MSFS, puis on fige la physique
      try { handle.aIReleaseControl(r.objectID, REQ_AI_BASE + 50000 + local); } catch (_) {}
      ev(EV_FRZ_LL, 1); ev(EV_FRZ_ALT, 1); ev(EV_FRZ_ATT, 1); ev(EV_BCN_ON, 0); ev(EV_ENG_AUTO, 0);
      o.lastFreeze = Date.now();
      applyGear(o, o.wantGear);
      try { handle.requestDataOnSimObject(REQ_AIGND_BASE + local, DEF_AIGND, r.objectID, SimConnectPeriod.SECOND); } catch (_) {}
      send('ai-status', { id: local, ok: true });
    });
    handle.on('exception', (e) => {
      console.warn('SimConnect exception', e && e.exception);
      // échec de création d'un avion IA (modèle introuvable…)
      if (e && ai.byReq.size && e.sendId != null) {
        for (const [req, local] of ai.byReq) if (ai.byLocal.get(local) && ai.byLocal.get(local).sendId === e.sendId) { ai.byReq.delete(req); ai.byLocal.delete(local); send('ai-status', { id: local, ok: false, error: e.exceptionName || String(e.exception) }); }
      }
    });
    handle.on('quit', lost);
    handle.on('close', lost);
    handle.on('error', lost);
  } catch (e) {
    handle = null;
    status('disconnected', 'MSFS non détecté');
    retryTimer = setTimeout(connectSim, 5000);
  }
}

function lost() {
  if (!handle) return;
  try { handle.close(); } catch (_) {}
  handle = null; simRunning = false; goodSamples = 0;
  ai.byReq.clear(); ai.byLocal.clear(); ai.byObj.clear(); ai.models = null;
  for (const p of facPending.values()) { clearTimeout(p.timer); p.resolve(null); }
  facPending.clear();
  status('disconnected', 'Liaison perdue');
  retryTimer = setTimeout(connectSim, 5000);
}

// ---- Données d'aéroport depuis MSFS ----
const DESIG = ['', 'L', 'R', 'C', 'W', 'A', 'B'];
function rwyName(n, d) {
  if (!(n >= 1 && n <= 36)) return null;
  return String(n).padStart(2, '0') + (DESIG[d] || '');
}
function normFreq(v) {
  if (!v) return null;
  let mhz = v > 1e7 ? v / 1e6 : v > 1e4 ? v / 1e3 : v;
  return mhz > 100 && mhz < 140 ? Math.round(mhz * 1000) / 1000 : null;
}
function airportFromSim(icao) {
  return new Promise((resolve) => {
    if (!handle || !connected) return resolve(null);
    const id = facReq++;
    const p = { airport: null, runways: [], freqs: [], resolve: null, timer: null };
    p.resolve = (res) => {
      if (!res) return resolve(null);
      const freqs = {};
      const MAP = { 1: 'ATIS', 5: 'GND', 6: 'TWR', 7: 'DEL', 14: 'DEL', 8: 'APP', 9: 'DEP', 10: 'CTR' };
      for (const f of res.freqs) {
        const role = MAP[f.type], mhz = normFreq(f.freq);
        if (role && mhz && !freqs[role]) freqs[role] = mhz;
      }
      const runways = [];
      for (const r of res.runways) {
        const a = rwyName(r.pn, r.pd), b = rwyName(r.sn, r.sd);
        if (a) runways.push({ name: a, heading: r.heading, length: r.length });
        if (b) runways.push({ name: b, heading: (r.heading + 180) % 360, length: r.length });
      }
      resolve({ freqs, runways, airport: res.airport });
    };
    p.timer = setTimeout(() => { facPending.delete(id); resolve(null); }, 6000);
    facPending.set(id, p);
    try { handle.requestFacilityData(DEF_FAC, id, icao.toUpperCase()); }
    catch (e) { clearTimeout(p.timer); facPending.delete(id); resolve(null); }
  });
}

// ---- Réseau ----
async function getJson(url) {
  const r = await net.fetch(url, { headers: { 'User-Agent': 'ATC/1.0' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

ipcMain.handle('simbrief', async (_e, user) => {
  const key = /^\d+$/.test(user) ? 'userid' : 'username';
  return getJson(`https://www.simbrief.com/api/xml.fetcher.php?${key}=${encodeURIComponent(user)}&json=1`);
});
ipcMain.handle('metar', async (_e, icaos) => {
  try { return await getJson(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(icaos.join(','))}&format=json`); }
  catch (e) { return []; }
});
ipcMain.handle('airport', (_e, icao) => airportFromSim(icao));
// Parkings pour avions de ligne (portes et aires cargo) de l'aéroport dans MSFS
ipcMain.handle('airport-parking', (_e, icao) => new Promise((resolve) => {
  if (!handle || !connected || !/^[A-Z0-9]{3,4}$/i.test(icao || '')) return resolve(null);
  const id = facReq++;
  const p = { airport: null, runways: [], freqs: [], parking: [], resolve: null, timer: null };
  p.resolve = (res) => {
    if (!res || !res.airport) return resolve(null);
    const { lat, lon } = res.airport, k = 111120 * Math.cos(lat * Math.PI / 180);
    const LET = (n) => (n >= 12 && n <= 37 ? String.fromCharCode(53 + n) : n === 10 ? 'G' : '');
    const big = new Set([4, 5, 8, 9, 10, 15]); // grand parking GA, cargo, portes S/M/L, porte extra
    const list = res.parking.filter((x) => big.has(x.type) && x.radius >= 12).map((x) => ({
      ref: LET(x.name) + (x.number || ''), lat: lat + x.bz / 111120, lon: lon + x.bx / k, hdg: (((x.heading + 180) % 360) + 360) % 360, // le cap MSFS du parking pointe vers l'arrière de l'avion garé (constaté en jeu) radius: x.radius, msfs: true, gate: x.type >= 8,
    }));
    resolve(list);
  };
  p.timer = setTimeout(() => { facPending.delete(id); resolve(null); }, 8000);
  facPending.set(id, p);
  try { handle.requestFacilityData(DEF_PARK, id, icao.toUpperCase()); }
  catch (e) { clearTimeout(p.timer); facPending.delete(id); resolve(null); }
}));

// ---- Trafic IA : liste des modèles, création, déplacement, suppression ----
ipcMain.handle('ai-models', () => new Promise((resolve) => {
  if (!handle) return resolve([]);
  if (ai.models) return resolve(ai.models);
  ai.modelsWait.push(resolve);
  if (ai.modelsWait.length === 1) { try { handle.enumerateSimObjectsAndLiveries(REQ_MODELS, SimObjectType.AIRCRAFT); } catch (e) { ai.modelsWait.splice(0).forEach((f) => f([])); } }
  setTimeout(() => { if (ai.modelsWait.length) { ai.models = ai.modelsAcc || []; ai.modelsWait.splice(0).forEach((f) => f(ai.models)); } }, 8000);
}));
ipcMain.handle('ai-spawn', (_e, id, title, livery, tail, p) => {
  if (!handle) return false;
  const req = REQ_AI_BASE + id;
  const init = new InitPosition();
  Object.assign(init, { latitude: p.lat, longitude: p.lon, altitude: p.alt, pitch: p.pitch || 0, bank: 0, heading: p.hdg, onGround: !!p.onGround, airspeed: Math.round(p.kts || 0) });
  const o = { id, obj: null, ground: null, cg: null, gear: null, light: null, wantGear: p.onGround !== false };
  ai.byLocal.set(id, o); ai.byReq.set(req, id);
  try {
    try { o.sendId = livery ? handle.aICreateNonATCAircraftEx1(title, livery, tail, init, req) : handle.aICreateNonATCAircraft(title, tail, init, req); }
    catch (e) { o.sendId = handle.aICreateNonATCAircraft(title, tail, init, req); }
    // pas de réponse de MSFS au bout de 15 s : échec
    setTimeout(() => { if (ai.byLocal.get(id) === o && o.obj == null) { ai.byLocal.delete(id); ai.byReq.delete(req); send('ai-status', { id, ok: false, title }); } }, 15000);
    return true;
  } catch (e) { ai.byLocal.delete(id); ai.byReq.delete(req); return false; }
});
// Feux selon la phase : parking, roulage, piste (décollage / approche), croisière
const AI_LIGHTS = [['LIGHT NAV', 'NAV_LIGHTS_SET'], ['LIGHT BEACON', 'BEACON_LIGHTS_SET'], ['LIGHT STROBE', 'STROBES_SET'], ['LIGHT LANDING', 'LANDING_LIGHTS_SET'], ['LIGHT TAXI', 'TAXI_LIGHTS_SET'], ['LIGHT LOGO', 'LOGO_LIGHTS_SET'], ['LIGHT WING', 'WING_LIGHTS_SET']];
const LIGHT_MODES = {
  //       nav beacon strobe landing taxi logo wing
  park:   [1, 0, 0, 0, 0, 1, 0],
  taxi:   [1, 1, 0, 0, 1, 1, 0],
  rwy:    [1, 1, 1, 1, 1, 1, 1],
  cruise: [1, 1, 1, 0, 0, 1, 0],
};
function applyLights(o, mode) {
  const v = LIGHT_MODES[mode]; if (!handle || o.obj == null || !v) return;
  o.lights = mode; o.lightSent = Date.now();
  try { const b = new RawBuffer(8 * v.length); v.forEach((x) => b.writeFloat64(x)); handle.setDataOnSimObject(DEF_AILIGHT, o.obj, { buffer: b, arrayCount: 0, tagged: false }); } catch (_) {}
  v.forEach((x, i) => { try { handle.transmitClientEvent(o.obj, EV_LSET_BASE + i, x, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {} });
}
// L'interface envoie l'état voulu ~10 fois par seconde (position, cap, vitesse, vario) ;
// ici on l'extrapole et on le lisse à chaque image du simulateur pour un mouvement fluide de près.
ipcMain.on('ai-move', (_e, list) => {
  if (!handle) return;
  const now = Date.now();
  for (const m of list) {
    const o = ai.byLocal.get(m.id); if (!o || o.obj == null) continue;
    o.target = { ...m, t: now };
    if (!o.disp) o.disp = { lat: m.lat, lon: m.lon, alt: m.alt, hdg: m.hdg, pitch: m.pitch || 0, bank: m.bank || 0 };
    const ev = (id) => { try { handle.transmitClientEvent(o.obj, id, 0, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {} };
    if (m.gear != null && m.gear !== o.gear) applyGear(o, m.gear);
    if (m.light != null && m.light !== o.light) { o.light = m.light; ev(m.light ? EV_LAND_ON : EV_LAND_OFF); ev(m.light ? EV_STROBE_ON : EV_STROBE_OFF); }
    if (m.lights && m.lights !== o.lights) applyLights(o, m.lights);
  }
});
// Train d'atterrissage : commande, événement de position et manette (les avions figés ratent parfois l'un des trois)
function applyGear(o, down) {
  if (!handle || o.obj == null || down == null) return;
  o.gear = down; o.wantGear = down;
  const ev = (id, v) => { try { handle.transmitClientEvent(o.obj, id, v, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {} };
  ev(EV_GEAR_SET, down ? 1 : 0);
  ev(down ? EV_GEAR_DN : EV_GEAR_UP, 0);
  try { const buf = new RawBuffer(8); buf.writeFloat64(down ? 1 : 0); handle.setDataOnSimObject(DEF_AIGEAR, o.obj, { buffer: buf, arrayCount: 0, tagged: false }); } catch (_) {}
}
const angLerp = (a, b, k) => { const d = ((b - a + 540) % 360) - 180; return (a + d * k + 360) % 360; };
let lastAiFrame = 0;
function aiFrame() {
  if (!handle || !ai.byLocal.size) return;
  const now = Date.now(), dtF = Math.min(0.1, (now - (lastAiFrame || now)) / 1000); lastAiFrame = now;
  if (dtF <= 0) return;
  const k = Math.min(1, dtF * 6); // lissage (≈ 170 ms)
  for (const o of ai.byLocal.values()) {
    const m = o.target; if (!m || o.obj == null || !o.disp) continue;
    // position prévue maintenant : dernière consigne + vitesse × temps écoulé
    const dt = Math.min(1.5, (now - m.t) / 1000);
    const dist = (m.v || 0) * 0.514444 * dt, br = (m.hdg * Math.PI) / 180;
    const pLat = m.lat + (dist * Math.cos(br)) / 111120;
    const pLon = m.lon + (dist * Math.sin(br)) / (111120 * Math.cos((m.lat * Math.PI) / 180));
    const pAlt = m.alt + ((m.vs || 0) / 60) * dt;
    const d = o.disp;
    // si l'écart est grand (téléportation, création), on saute directement
    const far = Math.abs(pLat - d.lat) > 0.01 || Math.abs(pLon - d.lon) > 0.01;
    d.lat = far ? pLat : d.lat + (pLat - d.lat) * k;
    d.lon = far ? pLon : d.lon + (pLon - d.lon) * k;
    d.alt = far ? pAlt : d.alt + (pAlt - d.alt) * k;
    d.hdg = angLerp(d.hdg, m.hdg, k); d.pitch += ((m.pitch || 0) - d.pitch) * k; d.bank += ((m.bank || 0) - d.bank) * k;
    // au sol : on pose l'avion sur le terrain réel (altitude du sol + hauteur des trains)
    let alt = d.alt;
    if (m.onGround && o.ground != null) alt = o.ground + (o.cg || 0);
    try {
      const buf = new RawBuffer(48);
      [d.lat, d.lon, alt, d.pitch, d.bank, d.hdg].forEach((v) => buf.writeFloat64(v));
      handle.setDataOnSimObject(DEF_AIPOS, o.obj, { buffer: buf, arrayCount: 0, tagged: false });
    } catch (_) {}
    // train : rentrée / sortie progressive (≈ 8 s), écrite directement dans les positions de train
    if (o.wantGear != null) {
      const target = o.wantGear ? 1 : 0;
      if (o.gearPos == null) o.gearPos = target;
      if (o.gearPos !== target || now - (o.gearSent || 0) > 2000) {
        o.gearPos = o.gearPos < target ? Math.min(target, o.gearPos + dtF / 8) : Math.max(target, o.gearPos - dtF / 8);
        o.gearSent = now;
        try {
          const gb = new RawBuffer(24);
          [o.gearPos, o.gearPos, o.gearPos].forEach((v) => gb.writeFloat64(v));
          handle.setDataOnSimObject(DEF_AIGEARPOS, o.obj, { buffer: gb, arrayCount: 0, tagged: false });
        } catch (_) {}
      }
    }
    // on refige régulièrement (certains avions se « réveillent » quand on s'en approche)
    if (now - (o.lastFreeze || 0) > 4000) {
      o.lastFreeze = now;
      [EV_FRZ_LL, EV_FRZ_ALT, EV_FRZ_ATT].forEach((id) => { try { handle.transmitClientEvent(o.obj, id, 1, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {} });
      applyGear(o, o.wantGear); // on réaffirme aussi l'état du train
      if (o.lights) applyLights(o, o.lights); // et les feux
    }
  }
}
// cadence : à chaque image du simulateur (événement Frame), avec une horloge de secours à ~40 Hz
let lastFrameEvt = 0;
setInterval(() => { if (Date.now() - lastFrameEvt > 100) aiFrame(); }, 25);
ipcMain.handle('ai-remove', (_e, id) => {
  const o = ai.byLocal.get(id); ai.byLocal.delete(id);
  if (!o || !handle) return;
  if (o.obj != null) { ai.byObj.delete(o.obj); try { handle.aIRemoveObject(o.obj, REQ_AI_BASE + id); } catch (_) {} }
});
ipcMain.handle('ai-clear', () => {
  for (const id of [...ai.byLocal.keys()]) { const o = ai.byLocal.get(id); if (o.obj != null && handle) try { handle.aIRemoveObject(o.obj, 0); } catch (_) {} }
  ai.byLocal.clear(); ai.byObj.clear(); ai.byReq.clear();
});

// ---- Vrais vols du moment autour d'un aéroport (OpenSky Network, accès public) ----
let liveCache = { key: null, at: 0, list: null };
ipcMain.handle('live-flights', async (_e, lat, lon) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  if (liveCache.key === key && Date.now() - liveCache.at < 80000) return liveCache.list;
  const dLat = 2.0, dLon = Math.min(2.8, 2.0 / Math.max(0.3, Math.cos(lat * Math.PI / 180))); // ≈ 120 NM autour (moins de 25 degrés² : 1 seul crédit OpenSky)
  const url = `https://opensky-network.org/api/states/all?lamin=${(lat - dLat).toFixed(3)}&lomin=${(lon - dLon).toFixed(3)}&lamax=${(lat + dLat).toFixed(3)}&lomax=${(lon + dLon).toFixed(3)}`;
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': 'ATC-MSFS/1.7' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const list = (j.states || []).map((s) => ({
      icao24: s[0], cs: String(s[1] || '').trim().toUpperCase(), lon: s[5], lat: s[6], alt: s[7] != null ? s[7] * 3.281 : (s[13] != null ? s[13] * 3.281 : null),
      onGround: !!s[8], kts: s[9] != null ? s[9] * 1.944 : 0, track: s[10], vs: s[11] != null ? s[11] * 196.85 : 0,
    })).filter((x) => x.cs && x.lat != null && x.lon != null);
    liveCache = { key, at: Date.now(), list };
    return list;
  } catch (e) {
    return liveCache.key === key ? liveCache.list : null;
  }
});

// ---- Radar météo (RainViewer, accès public) : dernière image disponible ----
ipcMain.handle('radar-frames', async () => {
  try {
    const j = await getJson('https://api.rainviewer.com/public/weather-maps.json');
    const past = (j && j.radar && j.radar.past) || [];
    const last = past[past.length - 1];
    return last ? { host: j.host || 'https://tilecache.rainviewer.com', path: last.path, time: last.time } : null;
  } catch (e) { return null; }
});

// ---- ATIS numérique réel (D-ATIS, aéroports des États-Unis) ----
ipcMain.handle('datis', async (_e, icao) => {
  if (!/^[KP][A-Z0-9]{3}$/.test(icao)) return null;
  try {
    const j = await getJson('https://datis.clowd.io/api/' + icao);
    if (!Array.isArray(j)) return null;
    return j.map((x) => ({ type: x.type, text: x.datis }));
  } catch (e) { return null; }
});

// ---- NOTAM réels (service public de recherche de la FAA, couvre aussi l'international) ----
const notamCache = new Map();
ipcMain.handle('notams', async (_e, icao) => {
  if (!/^[A-Z0-9]{4}$/.test(icao)) return null;
  const c = notamCache.get(icao);
  if (c && Date.now() - c.at < 20 * 60000) return c.list;
  const all = [];
  try {
    for (let offset = 0, total = 1; offset < total && offset < 300; offset += 30) {
      const body = new URLSearchParams({ searchType: '0', designatorsForLocation: icao, offset: String(offset), notamsOnly: 'false', radius: '10', sortColumns: '5 false', sortDirection: 'true', latitudeDirection: 'N', longitudeDirection: 'W', flightPathBuffer: '4', flightPathResultsType: 'All NOTAMs' }).toString();
      const r = await net.fetch('https://notams.aim.faa.gov/notamSearch/search', { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ATC-MSFS/1.6' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      (j.notamList || []).forEach((n) => all.push({ icaoMessage: n.icaoMessage, traditionalMessage: n.traditionalMessage, startDate: n.startDate, endDate: n.endDate }));
      total = j.totalNotamCount || 0;
    }
    notamCache.set(icao, { at: Date.now(), list: all });
    return all;
  } catch (e) {
    return c ? c.list : null;
  }
});

// ---- Plan au sol des aéroports (OpenStreetMap / Overpass), mis en cache 30 jours ----
const fs = require('fs');
ipcMain.handle('airport-layout', async (_e, icao, lat, lon) => {
  if (!/^[A-Z0-9]{4}$/.test(icao) || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const dir = path.join(app.getPath('userData'), 'airports');
  const file = path.join(dir, icao + '.json');
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs < 30 * 86400000) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (_) {}
  const dLat = 0.05, dLon = 0.05 / Math.max(0.3, Math.cos(lat * Math.PI / 180));
  const bbox = [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map((x) => x.toFixed(5)).join(',');
  const q = `[out:json][timeout:40];(way["aeroway"~"^(runway|taxiway|taxilane|holding_position)$"](${bbox});node["aeroway"~"^(holding_position|parking_position|gate)$"](${bbox}););out geom;`;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await net.fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ATC-MSFS/1.4' } });
      if (!r.ok) continue;
      const json = await r.json();
      if (!json || !Array.isArray(json.elements)) continue;
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify(json)); } catch (_) {}
      return json;
    } catch (_) {}
  }
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
});
// Aéroport le plus proche (pour le trafic réel sans plan de vol)
const nearCache = new Map();
ipcMain.handle('nearest-airport', async (_e, lat, lon) => {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const key = lat.toFixed(2) + ',' + lon.toFixed(2);
  if (nearCache.has(key)) return nearCache.get(key);
  const q = `[out:json][timeout:25];nwr["aeroway"="aerodrome"]["icao"~"^[A-Z]{4}$"](around:9000,${lat.toFixed(5)},${lon.toFixed(5)});out center tags;`;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await net.fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'ATC-MSFS/1.4' } });
      if (!r.ok) continue;
      const json = await r.json();
      const rad = (d) => d * Math.PI / 180;
      const list = (json.elements || []).map((el) => {
        const la = el.lat != null ? el.lat : el.center && el.center.lat, lo = el.lon != null ? el.lon : el.center && el.center.lon;
        const t = el.tags || {};
        const d = Math.hypot(la - lat, (lo - lon) * Math.cos(rad(lat)));
        return { icao: t.icao, name: t['name:fr'] || t.name || t.icao, city: t['addr:city'] || null, lat: la, lon: lo, d };
      }).filter((x) => x.icao && Number.isFinite(x.lat)).sort((a, b) => a.d - b.d);
      nearCache.set(key, list);
      return list;
    } catch (_) {}
  }
  return null;
});
ipcMain.handle('set-com1', (_e, mhz, method) => {
  if (!handle) return false;
  const ev = (id, val) => handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, id, val, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY);
  const hz = Math.round(mhz * 1e6);
  if (isFenix()) {
    // Fenix : fréquence en attente sur le RMP 1, puis appui sur la touche de transfert (⇄)
    // plusieurs façons d'appuyer sur ⇄, essayées l'une après l'autre (méthode = numéro de l'essai)
    const setX = (v) => { try { const buf = new RawBuffer(8); buf.writeFloat64(v); handle.setDataOnSimObject(DEF_FENIX_XFER, SimConnectConstants.OBJECT_ID_USER, { buffer: buf, arrayCount: 0, tagged: false }); } catch (e) { console.warn('Transfert Fenix impossible', e); } };
    const m = (method || 0) % 3;
    ev(EV_COM_STBY, hz);
    setTimeout(() => {
      if (!handle) return;
      const x = fenix.xfer || 0;
      if (m === 0) setX(x + 2);                                   // compteur d'appuis (+2 = appui + relâchement)
      else if (m === 1) { setX(1); setTimeout(() => handle && setX(0), 250); } // bouton maintenu puis relâché
      else { ev(EV_COM_SWAP, 0); setX(x + 1); setTimeout(() => handle && setX(x + 2), 250); }
    }, 600);
    return true;
  }
  if (method === 1) {
    // Méthode de secours : fréquence en attente puis bascule (certains avions refusent le réglage direct)
    ev(EV_COM_STBY, hz);
    setTimeout(() => { if (handle) ev(EV_COM_SWAP, 0); }, 250);
  } else ev(EV_COM, hz);
  return true;
});
// ---- Repoussage automatique avec le tracteur de MSFS ----
const push = { active: false, start: null, face: null, turnSent: 0, t0: 0 };
function pushTick(t) {
  if (!push.active || !handle) return;
  const ev = (id, v) => { try { handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, id, v >>> 0, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {} };
  if (!push.start) push.start = { lat: t.lat, lon: t.lon };
  const moved = Math.hypot((t.lat - push.start.lat) * 111120, (t.lon - push.start.lon) * 111120 * Math.cos(t.lat * Math.PI / 180));
  const diff = push.face == null ? null : Math.abs(((t.hdgTrue - push.face + 540) % 360) - 180);
  // après une courte ligne droite, on oriente le tracteur pour finir nez dans la bonne direction
  if (push.face != null && moved > 15 && Date.now() - push.turnSent > 1000) {
    push.turnSent = Date.now();
    ev(EV_TUG_HDG, Math.round(((push.face + 180) % 360) / 360 * 4294967295));
  }
  const done = (push.face != null && moved > 25 && diff < 8) || moved > 70 || Date.now() - push.t0 > 120000;
  if (done) {
    push.active = false;
    if (t.pushState !== 3) ev(EV_PUSH, 0);
    send('push-status', { done: true, moved: Math.round(moved) });
  }
}
ipcMain.handle('pushback', (_e, faceTrue) => {
  if (!handle) return false;
  push.active = true; push.start = null; push.face = Number.isFinite(faceTrue) ? faceTrue : null; push.turnSent = 0; push.t0 = Date.now();
  try { handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, EV_PUSH, 0, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) { return false; }
  return true;
});
ipcMain.handle('pushback-stop', () => {
  if (!handle || !push.active) return;
  push.active = false;
  try { handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, EV_PUSH, 0, NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY); } catch (_) {}
});
ipcMain.handle('set-squawk', (_e, code) => {
  if (!handle || !/^[0-7]{4}$/.test(code)) return false;
  handle.transmitClientEvent(SimConnectConstants.OBJECT_ID_USER, EV_XPDR, parseInt(code, 16), NotificationPriority.HIGHEST, EventFlag.EVENT_FLAG_GROUPID_IS_PRIORITY);
  return true;
});
// ---- Voix neuronales (naturelles) ----
let tts = null, ttsVoice = null, ttsChain = Promise.resolve();
const xmlEsc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
async function synth(text, voice, rate, pitch) {
  if (!tts || ttsVoice !== voice) {
    try { if (tts) tts.close(); } catch (_) {}
    tts = new MsEdgeTTS();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
    ttsVoice = voice;
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    const timer = setTimeout(() => { reject(new Error('délai dépassé')); try { tts.close(); } catch (_) {} tts = null; }, 12000);
    let stream;
    try { stream = tts.toStream(xmlEsc(text), { rate, pitch: pitch || '+0%' }).audioStream; } catch (e) { clearTimeout(timer); tts = null; return reject(e); }
    stream.on('data', (c) => chunks.push(c));
    stream.on('close', () => { clearTimeout(timer); const b = Buffer.concat(chunks); b.length ? resolve(b) : reject(new Error('audio vide')); });
    stream.on('error', (e) => { clearTimeout(timer); tts = null; reject(e); });
  });
}
ipcMain.handle('tts', (_e, text, voice, rate, pitch) => {
  const job = ttsChain.then(() => synth(text, voice, rate, pitch)).catch(async (e) => {
    // une seconde tentative avec une connexion neuve
    tts = null;
    return synth(text, voice, rate, pitch);
  });
  ttsChain = job.catch(() => {});
  return job.then((b) => new Uint8Array(b));
});
ipcMain.handle('sim-state', () => ({ status: connected ? 'connected' : (handle ? 'connecting' : 'disconnected') }));
ipcMain.handle('open-url', (_e, url) => { if (/^https:\/\//.test(url)) shell.openExternal(url); });

function tileHeaders() {
  const { session } = require('electron');
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://tile.openstreetmap.org/*', 'https://server.arcgisonline.com/*'] }, (d, cb) => {
    d.requestHeaders['User-Agent'] = 'ATC-MSFS/1.4 (logiciel perso de controle aerien pour MSFS)';
    d.requestHeaders['Referer'] = 'https://atc-msfs.local/';
    cb({ requestHeaders: d.requestHeaders });
  });
}

// ---- Mises à jour automatiques (versions publiées sur GitHub) ----
const UPDATE_REPO = 'air-caraibe-virtual/atc';
// versions « 0.2.0 » ou bêta « 0.2.0-beta.1 » (une version finale passe devant ses bêtas)
const parseVer = (v) => { const [core, pre] = String(v || '').replace(/^v/i, '').split('-'); return { n: core.split('.').map((x) => parseInt(x, 10) || 0), pre: pre ? pre.split('.').map((x) => (/^\d+$/.test(x) ? +x : x)) : null }; };
const newer = (a, b) => {
  const x = parseVer(a), y = parseVer(b);
  for (let i = 0; i < 3; i++) if ((x.n[i] || 0) !== (y.n[i] || 0)) return (x.n[i] || 0) > (y.n[i] || 0);
  if (!x.pre && !y.pre) return false;
  if (!x.pre) return true; if (!y.pre) return false;
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i], q = y.pre[i];
    if (p === undefined) return false; if (q === undefined) return true;
    if (p !== q) return typeof p === typeof q ? p > q : typeof p === 'number' ? false : true;
  }
  return false;
};
ipcMain.handle('app-version', () => app.getVersion());
// Attirer l'attention sur une mise à jour : premier plan (hors vol) ou clignotement + notification Windows (en vol)
ipcMain.handle('update-attention', (_e, o) => {
  if (!win || win.isDestroyed()) return;
  const bringFront = () => {
    if (win.isMinimized()) win.restore();
    win.show();
    win.setAlwaysOnTop(true); win.focus(); win.moveTop();
    setTimeout(() => { if (win && !win.isDestroyed()) win.setAlwaysOnTop(false); }, 1500);
    send('update-show');
  };
  if (o && o.focus) bringFront();
  else if (!win.isFocused()) win.flashFrame(true);
  try {
    if (Notification.isSupported() && !(o && o.focus && win.isFocused())) {
      const n = new Notification({ title: o.title || 'Mise à jour d\'ATC disponible', body: o.body || 'Cliquez pour voir les nouveautés.', icon: path.join(__dirname, 'build', 'icon.png') });
      n.on('click', bringFront);
      n.show();
    }
  } catch (_) {}
});
ipcMain.handle('update-check', async (_e, beta) => {
  try {
    // versions finales seulement, ou aussi les bêtas si le pilote l'a choisi
    const r = await net.fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases?per_page=30`, { headers: { 'User-Agent': 'ATC-MSFS', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return { ok: false, status: r.status };
    const all = (await r.json()).filter((x) => !x.draft && (beta || !x.prerelease) && (x.assets || []).some((a) => /\.exe$/i.test(a.name)));
    if (!all.length) return { ok: true, current: app.getVersion(), available: false };
    const j = all.reduce((best, x) => (newer(x.tag_name, best.tag_name) ? x : best), all[0]);
    const asset = (j.assets || []).find((a) => /\.exe$/i.test(a.name));
    const version = String(j.tag_name || '').replace(/^v/i, '');
    return { ok: true, current: app.getVersion(), version, beta: !!j.prerelease, available: !!asset && newer(version, app.getVersion()), notes: j.body || '', name: j.name || version, url: asset && asset.browser_download_url, size: asset && asset.size };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('update-install', async (_e, url, version) => {
  if (!/^https:\/\/github\.com\/|^https:\/\/objects\.githubusercontent\.com\//.test(url)) return { ok: false, error: 'adresse refusée' };
  const os = require('os');
  // nom unique : un ancien installateur encore ouvert/verrouillé ne bloque pas le nouveau
  const file = path.join(os.tmpdir(), `ATC-Setup-${String(version).replace(/[^0-9a-z.\-]/gi, '')}-${Date.now()}.exe`);
  try {
    const r = await net.fetch(url, { headers: { 'User-Agent': 'ATC-MSFS' } });
    if (!r.ok || !r.body) throw new Error('HTTP ' + r.status);
    const total = +r.headers.get('content-length') || 0;
    const out = fs.createWriteStream(file);
    const closed = new Promise((res, rej) => { out.on('close', res); out.on('error', rej); });
    const reader = r.body.getReader();
    let got = 0, lastSent = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!out.write(Buffer.from(value))) await new Promise((res) => out.once('drain', res));
      got += value.length;
      if (Date.now() - lastSent > 200) { lastSent = Date.now(); send('update-progress', { got, total }); }
    }
    out.end();
    await closed; // fichier réellement fermé (pas seulement « fini d'écrire »)
    if (total && fs.statSync(file).size !== total) throw new Error('téléchargement incomplet, réessayez');
    send('update-progress', { got, total, done: true });
    // Installation silencieuse puis relance (option /UPDATE de l'installateur).
    // Windows (antivirus, indexation) peut verrouiller l'exe quelques secondes juste après le
    // téléchargement : on réessaie au lieu d'échouer sur « spawn EBUSY ».
    const { spawn } = require('child_process');
    const launch = () => new Promise((res, rej) => {
      let child;
      try { child = spawn(file, ['/S', '/UPDATE'], { detached: true, stdio: 'ignore' }); } catch (e) { return rej(e); }
      child.once('error', rej);
      child.once('spawn', () => { child.unref(); res(); });
    });
    let lastErr = null;
    for (let i = 0; i < 12; i++) {
      try { await launch(); lastErr = null; break; } catch (e) {
        lastErr = e;
        if (!/EBUSY|EPERM|EACCES|ETXTBSY/i.test(String(e.code || e.message))) break;
        await new Promise((res) => setTimeout(res, 1500));
      }
    }
    if (lastErr) {
      // dernier recours : ouvrir l'installateur normalement (avec ses pages)
      const err = await shell.openPath(file);
      if (err) throw lastErr;
    }
    setTimeout(() => app.quit(), 800);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});

// ---------- IA (clé API du pilote) : Claude, OpenAI ou Groq ----------
// IA intégrée (sur le PC) et Ollama (logiciel gratuit à installer, pour les gros PC)
const llmDir = () => path.join(app.getPath('userData'), 'models');
ipcMain.handle('ai-prepare-local', async () => {
  try { await require('./llm.js').load(llmDir(), (p) => send('ai-progress', p)); send('ai-progress', { done: true }); return { ok: true, model: require('./llm.js').model() }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('ollama-tags', async () => {
  try {
    const r = await net.fetch('http://127.0.0.1:11434/api/tags');
    if (!r.ok) return { ok: false };
    const j = await r.json();
    return { ok: true, models: (j.models || []).map((m) => m.name) };
  } catch (_) { return { ok: false }; }
});
ipcMain.handle('ai-chat', async (_e, o) => {
  const { provider, key, model, system, messages, maxTokens } = o || {};
  if (provider === 'local') {
    try { return { ok: true, text: await require('./llm.js').chat(llmDir(), system, messages, maxTokens, (p) => send('ai-progress', p)) }; }
    catch (e) { return { ok: false, error: 'IA intégrée : ' + String(e.message || e) }; }
  }
  if (provider === 'ollama') {
    try {
      const r = await net.fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, stream: false, format: 'json', options: { temperature: 0.2, num_predict: maxTokens || 400 }, messages: [{ role: 'system', content: system }, ...messages] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, error: 'Ollama : ' + (j.error || ('HTTP ' + r.status)) };
      return { ok: true, text: (j.message && j.message.content) || '' };
    } catch (e) { return { ok: false, error: 'Ollama ne répond pas (est-il lancé ?)' }; }
  }
  if (!key) return { ok: false, error: 'Aucune clé API dans les paramètres.' };
  const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 20000);
  try {
    let r, j;
    if (provider === 'anthropic') {
      r = await net.fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: model || 'claude-haiku-5-5', max_tokens: maxTokens || 400, system, messages }),
      });
      j = await r.json().catch(() => ({}));
      if (!r.ok) return { ok: false, status: r.status, error: (j.error && j.error.message) || ('HTTP ' + r.status) };
      return { ok: true, text: (j.content || []).map((c) => c.text || '').join('') };
    }
    const url = provider === 'groq' ? 'https://api.groq.com/openai/v1/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    r = await net.fetch(url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: model || (provider === 'groq' ? 'llama-3.3-70b-versatile' : 'gpt-4o-mini'), max_tokens: maxTokens || 400, temperature: 0.3, messages: [{ role: 'system', content: system }, ...messages] }),
    });
    j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: r.status, error: (j.error && j.error.message) || ('HTTP ' + r.status) };
    return { ok: true, text: (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '' };
  } catch (e) {
    return { ok: false, error: e.name === 'AbortError' ? 'pas de réponse (délai dépassé)' : String(e.message || e) };
  } finally { clearTimeout(to); }
});

// ---------- Micro : reconnaissance vocale (Whisper hors ligne) ----------
const sttDir = () => path.join(app.getPath('userData'), 'models');
const sttProgress = (p) => send('stt-progress', p);
ipcMain.handle('stt-prepare', async (_e, model) => {
  try { require('./stt.js').setModel(model); await require('./stt.js').load(sttDir(), sttProgress); send('stt-progress', { done: true }); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('stt-transcribe', async (_e, samples, langs) => {
  try {
    const arr = samples instanceof Float32Array ? samples : new Float32Array(samples && samples.buffer ? samples.buffer : samples);
    const r = await require('./stt.js').transcribe(sttDir(), arr, langs, sttProgress);
    return { ok: true, ...r };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
// raccourci global (fonctionne même quand MSFS a le focus).
// Windows répète la touche tant qu'on la maintient : on transforme ces répétitions en
// « appui » (début) puis « relâché » (fin) au lieu d'allumer / éteindre le micro en boucle.
//  - appui bref : on parle, ATC coupe tout seul après un silence (ou nouvel appui)
//  - touche maintenue : on parle tant qu'elle est enfoncée (alternat)
let micKey = null, micLast = 0, micHeld = false, micRelTimer = null;
function micKeyEvent() {
  const now = Date.now(), gap = now - micLast;
  micLast = now;
  if (gap > 700) { micHeld = false; send('mic-press'); }   // nouvel appui
  else if (!micHeld) { micHeld = true; send('mic-hold'); } // la touche est maintenue
  clearTimeout(micRelTimer);
  if (micHeld) micRelTimer = setTimeout(() => { micHeld = false; send('mic-release'); }, 250); // plus de répétition : relâchée
}
ipcMain.handle('mic-shortcut', (_e, accel) => {
  try { if (micKey) globalShortcut.unregister(micKey); } catch (_) {}
  micKey = null;
  if (!accel) return { ok: true };
  try {
    const ok = globalShortcut.register(accel, micKeyEvent);
    if (ok) micKey = accel;
    return { ok };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
app.on('will-quit', () => { try { globalShortcut.unregisterAll(); } catch (_) {} });

function createWindow() {
  tileHeaders();
  win = new BrowserWindow({
    width: 1180, height: 820, minWidth: 900, minHeight: 640,
    backgroundColor: '#0b1220', title: 'ATC', autoHideMenuBar: true,
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.webContents.once('did-finish-load', connectSim);
  // la croix réduit ATC dans la zone de notification (en bas à droite) ; « Quitter l'ATC » ferme vraiment
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!trayTipShown) {
      trayTipShown = true;
      try { if (tray && tray.displayBalloon) tray.displayBalloon({ title: 'ATC continue en arrière-plan', content: 'Cliquez sur l\'icône ATC en bas à droite pour le rouvrir. Clic droit → « Quitter l\'ATC » pour le fermer.', iconType: 'info' }); } catch (_) {}
    }
  });
  createTray();
}

// ---------- Zone de notification (icône en bas à droite) ----------
let tray = null, quitting = false, trayTipShown = false;
function showWin() {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show(); win.focus();
}
function quitApp() { quitting = true; app.quit(); }
function createTray() {
  if (tray) return;
  try {
    const img = nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 });
    tray = new Tray(img);
    tray.setToolTip('ATC');
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: 'Ouvrir ATC', click: showWin },
      { type: 'separator' },
      { label: 'Quitter l\'ATC', click: quitApp },
    ]));
    tray.on('click', showWin);
    tray.on('double-click', showWin);
  } catch (e) { console.warn('Icône de notification indisponible', e); }
}
ipcMain.handle('app-quit', () => { quitApp(); });
app.on('before-quit', () => { quitting = true; });

app.setAppUserModelId('fr.atcsolo.app');
app.setPath('userData', path.join(app.getPath('appData'), 'ATC Solo'));
// une seule ATC à la fois : relancer ATC rouvre la fenêtre déjà ouverte (même cachée en bas à droite)
if (!app.requestSingleInstanceLock()) app.exit(0);
app.on('second-instance', () => showWin());
app.whenReady().then(() => {
  // autorise le micro pour la fenêtre d'ATC
  try { session.defaultSession.setPermissionRequestHandler((_wc, perm, cb) => cb(true)); } catch (_) {}
  createWindow();
});
app.on('window-all-closed', () => { if (handle) try { handle.close(); } catch (_) {} app.quit(); });
