/* ATC — interface : chargement du vol, radio, voix, liaison avec le moteur ATC. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const { AtcEngine, utils, RESUME_POINTS, PHASE_LABEL } = window.ATC;
  const api = window.sim || null; // absent si la page est ouverte hors de l'appli

  // ---------- Paramètres ----------
  const DEFAULTS = { lang: 'fr', ttsEngine: 'neural', neuralVoice: 'auto', voice: '', rate: 1.05, volume: 1, radioFx: 'medium', squelch: true, pilotVoice: false, requireCom: false, autoCom: true, autoXpdr: true, autoReadback: true, autoPush: true, traffic: false, sbUser: '', mute: false, v: 3 };
  let S = { ...DEFAULTS };
  let stored = {};
  try { stored = JSON.parse(localStorage.getItem('atcsolo') || '{}') || {}; S = { ...DEFAULTS, ...stored }; } catch (_) {}
  if ((stored.v || 1) < 3) { if ((stored.v || 1) < 2) { S.autoCom = true; S.autoXpdr = true; } S.autoReadback = true; S.v = 3; try { localStorage.setItem('atcsolo', JSON.stringify(S)); } catch (_) {} }
  const save = () => { try { localStorage.setItem('atcsolo', JSON.stringify(S)); } catch (_) {} };

  // ---------- État ----------
  let simTel = null, simStatus = 'disconnected';
  let demo = null, demoSpeed = 10;
  let lastStationKey = null;
  let ready = false;
  const engine = new AtcEngine({ lang: S.lang, onMessage: (m) => addMessage(m), onChange: () => { if (ready) render(); } });

  // ---------- Voix ----------
  // Voix neuronales (naturelles) : une voix différente par contrôleur, toujours la même pour un même poste.
  const NEURAL = {
    fr: ['fr-FR-HenriNeural', 'fr-FR-DeniseNeural', 'fr-FR-RemyMultilingualNeural', 'fr-FR-VivienneMultilingualNeural', 'fr-CA-AntoineNeural', 'fr-CA-SylvieNeural', 'fr-CH-FabriceNeural', 'fr-BE-GerardNeural', 'fr-CA-JeanNeural', 'fr-CH-ArianeNeural'],
    en: ['en-US-GuyNeural', 'en-US-JennyNeural', 'en-GB-RyanNeural', 'en-US-AriaNeural', 'en-US-ChristopherNeural', 'en-GB-SoniaNeural', 'en-US-EricNeural', 'en-GB-ThomasNeural', 'en-US-MichelleNeural', 'en-US-SteffanNeural'],
  };
  const PILOT_NEURAL = { fr: 'fr-CA-ThierryNeural', en: 'en-AU-WilliamNeural' };
  const voiceLabel = (n) => n.replace(/Neural$/, '').replace(/^(\w\w-\w\w)-/, '$1 · ').replace('Multilingual', ' (multilingue)');
  let voices = [];
  const speakQueue = [];
  let speaking = false;
  let audioCtx = null;
  let neuralDown = 0; // horodatage du dernier échec réseau
  let neuralWarned = false;

  function loadVoices() {
    voices = 'speechSynthesis' in window ? speechSynthesis.getVoices() : [];
    fillVoiceSelect();
  }
  function fillVoiceSelect() {
    const sel = $('setVoice'); if (!sel) return;
    sel.innerHTML = '';
    const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
    if (S.ttsEngine === 'neural') {
      add('auto', 'Une voix différente par contrôleur');
      NEURAL[S.lang].forEach((n) => add(n, voiceLabel(n)));
      sel.value = NEURAL[S.lang].includes(S.neuralVoice) ? S.neuralVoice : 'auto';
    } else {
      add('', 'Automatique');
      voices.filter((v) => /^(fr|en)/i.test(v.lang)).forEach((v) => add(v.name, `${v.name} (${v.lang})`));
      sel.value = S.voice;
    }
  }
  function neuralVoiceFor(station, pilot) {
    if (pilot && station && station !== '__me') { const l = NEURAL[S.lang]; return l[(utils.hash(station) + 3) % l.length]; }
    if (pilot) return PILOT_NEURAL[S.lang];
    if (S.neuralVoice !== 'auto' && NEURAL[S.lang].includes(S.neuralVoice)) return S.neuralVoice;
    const list = NEURAL[S.lang];
    return list[utils.hash(String(station || 'ATC')) % list.length];
  }
  function pickSystemVoice(lang, pilot) {
    const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
    if (!pilot && S.voice) { const v = voices.find((x) => x.name === S.voice); if (v && v.lang.toLowerCase().startsWith(lang)) return v; }
    if (pilot) return pool.find((v) => v.name !== (S.voice || (pool[0] && pool[0].name))) || pool[0];
    return pool[0] || null;
  }

  function ctx() { audioCtx = audioCtx || new AudioContext(); if (audioCtx.state === 'suspended') audioCtx.resume(); return audioCtx; }
  function noiseBuffer(sec) {
    const ac = ctx(), b = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * sec)), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  // Clic d'alternat (pression / relâchement du bouton radio)
  function pttClick(ac, when, strong) {
    const len = 0.012, b = ac.createBuffer(1, Math.floor(ac.sampleRate * len), ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length / 4));
    const s = ac.createBufferSource(); s.buffer = b;
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2500; f.Q.value = 1.2;
    const g = ac.createGain(); g.gain.value = (strong ? 0.5 : 0.35) * S.volume;
    s.connect(f).connect(g).connect(ac.destination); s.start(when);
  }
  function squelch(tail) {
    if (!S.squelch) return Promise.resolve();
    try { const ac = ctx(); pttClick(ac, ac.currentTime, tail); } catch (_) {}
    try {
      const ac = ctx(), len = tail ? 0.16 : 0.09;
      const src = ac.createBufferSource(); src.buffer = noiseBuffer(len);
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
      const g = ac.createGain(); const t0 = ac.currentTime;
      g.gain.setValueAtTime(0.22 * S.volume, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + len);
      src.connect(bp).connect(g).connect(ac.destination); src.start();
      return new Promise((r) => setTimeout(r, len * 1000));
    } catch (_) { return Promise.resolve(); }
  }
  // Chaîne « radio VHF » : bande passante étroite, légère saturation, compression et souffle de fond
  function radioChain(ac, dest, opt = {}) {
    const fx = S.radioFx;
    if (fx === 'off') return { input: dest, stop() {} };
    const strong = fx === 'strong' || opt.pilot;
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = strong ? 450 : 300;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = strong ? 2600 : 3400;
    const peak = ac.createBiquadFilter(); peak.type = 'peaking'; peak.frequency.value = 1800; peak.gain.value = strong ? 6 : 3; peak.Q.value = 1;
    const shaper = ac.createWaveShaper();
    const k = strong ? 18 : 6, curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    shaper.curve = curve;
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 6;
    const out = ac.createGain(); out.gain.value = strong ? 0.75 : 0.9;
    hp.connect(lp).connect(peak).connect(shaper).connect(comp).connect(out).connect(dest);
    const hiss = ac.createBufferSource(); hiss.buffer = noiseBuffer(2); hiss.loop = true;
    const hissBp = ac.createBiquadFilter(); hissBp.type = 'bandpass'; hissBp.frequency.value = 2200; hissBp.Q.value = 0.5;
    const hissG = ac.createGain(); hissG.gain.value = (strong ? 0.035 : 0.015) * S.volume;
    hiss.connect(hissBp).connect(hissG).connect(dest); hiss.start();
    const extra = [hiss];
    // poste lointain (Approche, Contrôle) : léger évanouissement du signal
    if (opt.distant) {
      const lfo = ac.createOscillator(); lfo.frequency.value = 0.35 + Math.random() * 0.4;
      const depth = ac.createGain(); depth.gain.value = 0.12;
      lfo.connect(depth).connect(out.gain); lfo.start(); extra.push(lfo);
    }
    // pilote : bruit de cockpit (moteurs, ventilation) sous la voix
    if (opt.pilot) {
      const eng = ac.createBufferSource(); eng.buffer = noiseBuffer(2); eng.loop = true;
      const lpE = ac.createBiquadFilter(); lpE.type = 'lowpass'; lpE.frequency.value = 450;
      const gE = ac.createGain(); gE.gain.value = 0.06 * S.volume;
      eng.connect(lpE).connect(gE).connect(dest); eng.start(); extra.push(eng);
    }
    return { input: hp, stop() { extra.forEach((n) => { try { n.stop(); } catch (_) {} }); } };
  }

  // Débit et timbre propres à chaque poste : la Tour et le Sol parlent vite, chaque contrôleur a sa hauteur de voix
  const ROLE_RATE = { DEL: 1.04, GND: 1.1, TWR: 1.12, DEP: 1.08, APP: 1.08, CTR: 1.04, ATIS: 0.98 };
  function prosody(item) {
    const k = item.pilot ? 1.1 : (ROLE_RATE[item.role] || 1.06);
    const pct = Math.round((S.rate * k - 1) * 100);
    const h = utils.hash(String(item.station || 'x'));
    const pitch = (h % 9) - 4; // de -4 % à +4 %
    return { rate: (pct >= 0 ? '+' : '') + pct + '%', pitch: (pitch >= 0 ? '+' : '') + pitch + '%' };
  }
  function fetchTts(item) {
    const p = prosody(item);
    return api.tts(item.text, neuralVoiceFor(item.station, item.pilot), p.rate, p.pitch);
  }
  async function playNeural(item) {
    if (!api || !api.tts) throw new Error('indisponible');
    if (Date.now() - neuralDown < 60000) throw new Error('réseau');
    let bytes;
    try { bytes = await (item.audio || fetchTts(item)); }
    catch (e) { neuralDown = Date.now(); throw e; }
    const ac = ctx();
    const buf = await ac.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const master = ac.createGain(); master.gain.value = S.volume * (item.pilot ? 0.85 : 1); master.connect(ac.destination);
    const chain = radioChain(ac, master, { pilot: item.pilot && item.station !== '__me', distant: ['APP', 'CTR', 'DEP'].includes(item.role) });
    const src = ac.createBufferSource(); src.buffer = buf; src.connect(chain.input);
    await squelch(false);
    await new Promise((r) => { src.onended = r; src.start(); });
    chain.stop();
    await squelch(true);
  }
  function playSystem(item) {
    return new Promise(async (resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      await squelch(false);
      const u = new SpeechSynthesisUtterance(item.text);
      const v = pickSystemVoice(S.lang, item.pilot);
      if (v) u.voice = v;
      u.lang = S.lang === 'fr' ? 'fr-FR' : 'en-US';
      u.rate = S.rate; u.volume = S.volume; u.pitch = item.pilot ? 0.9 : 1;
      const done = async () => { await squelch(true); resolve(); };
      u.onend = done; u.onerror = done;
      speechSynthesis.speak(u);
    });
  }
  function say(text, opts = {}) {
    if (S.mute) return;
    const item = { text, ...opts };
    // synthèse lancée tout de suite : moins d'attente entre deux messages
    if (S.ttsEngine === 'neural' && api && api.tts && Date.now() - neuralDown > 60000) { item.audio = fetchTts(item); item.audio.catch(() => {}); }
    speakQueue.push(item);
    pump();
  }
  async function pump() {
    if (speaking || !speakQueue.length) return;
    speaking = true;
    const item = speakQueue.shift();
    if (item.el) item.el.classList.add('speaking');
    try {
      if (S.ttsEngine === 'neural') {
        try { await playNeural(item); }
        catch (e) {
          if (!neuralWarned) {
            neuralWarned = true;
            addMessage({ from: 'system', text: 'Voix naturelles indisponibles (connexion Internet ?) : voix Windows utilisée en attendant. Nouvel essai automatique dans une minute.' });
          }
          await playSystem(item);
        }
      } else await playSystem(item);
    } catch (_) {}
    if (item.el) item.el.classList.remove('speaking');
    speaking = false;
    pump();
  }
  if ('speechSynthesis' in window) { loadVoices(); speechSynthesis.onvoiceschanged = loadVoices; } else fillVoiceSelect();

  // ---------- Radio (journal) ----------
  function addMessage(m) {
    if (m.from === 'atc' && !m.atis) {
      const box = $('mapLastAtc');
      if (box) { box.innerHTML = '<small></small><span></span>'; box.children[0].textContent = (m.station || 'ATC') + (m.freq ? ' · ' + utils.freqTxt(m.freq) : ''); box.children[1].textContent = m.text; box.classList.remove('hidden'); }
    }
    const log = $('log');
    const empty = log.querySelector('.empty'); if (empty) empty.remove();
    const el = document.createElement('div');
    el.className = `msg ${m.from === 'aipilot' ? 'aipilot' : m.from}${m.atis ? ' atis' : ''}`;
    const time = new Date().toISOString().substr(11, 5) + 'Z';
    if (m.from !== 'system') {
      const who = document.createElement('div'); who.className = 'who';
      const name = m.from === 'pilot' ? (engine.flight ? engine.flight.callsign : 'Pilote') : m.from === 'aipilot' ? m.cs : (m.atis ? 'ATIS' : m.station || 'ATC');
      who.innerHTML = `<span></span><span class="f"></span><span>${time}</span>`;
      who.children[0].textContent = name;
      who.children[1].textContent = m.from === 'atc' && m.freq ? utils.freqTxt(m.freq) : '';
      if (m.from === 'atc' || m.atis) {
        const b = document.createElement('button'); b.className = 'replay'; b.title = 'Réécouter'; b.textContent = '🔊';
        b.onclick = () => say(m.speech, { el, station: m.atis ? 'ATIS' : m.station, role: m.atis ? 'ATIS' : m.role });
        who.appendChild(b);
      }
      el.appendChild(who);
    }
    const txt = document.createElement('div'); txt.className = 'txt'; txt.textContent = m.text;
    el.appendChild(txt);
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    if (m.from === 'atc' || m.atis) say(m.speech, { el, station: m.atis ? 'ATIS' : m.station, role: m.atis ? 'ATIS' : m.role });
    else if (m.from === 'pilot' && S.pilotVoice) say(m.speech, { el, pilot: true, station: '__me' });
    else if (m.from === 'aipilot') say(m.speech, { el, pilot: true, station: m.cs });
  }

  // ---------- Télémétrie ----------
  function currentTel() { return demo ? demo.telemetry() : simTel; }
  function telConnected() { const t = currentTel(); return !!(t && t.connected && t.inFlight !== false); }
  function waitingForFlight() { return !demo && simTel && simTel.connected && simTel.inFlight === false; }

  // ---------- Rendu ----------
  function fmtAlt(a) { return a == null ? '—' : Math.round(a).toLocaleString('fr-FR') + ' ft'; }
  function render() {
    const f = engine.flight, t0 = currentTel(), t = t0 && t0.inFlight === false ? null : t0;
    $('stCallsign').textContent = f ? f.callsign : '—';
    $('stPhase').textContent = engine.phaseLabel();
    $('stRoute').textContent = f ? `${f.dep.icao} (${f.dep.city}) → ${f.arr.icao} (${f.arr.city})` : 'Chargez un plan de vol pour commencer';
    $('stCruise').textContent = f ? 'FL' + Math.round((engine.target || f.cruise) / 100) : '—';
    const ns = engine.nextStep ? engine.nextStep() : null;
    $('stStep').textContent = ns ? `FL${Math.round(ns.alt / 100)}${ns.fix ? ' · ' + ns.fix : ''}` : '—';
    $('stSid').textContent = f && f.sid ? f.sid : '—';
    $('stRwyDep').textContent = f ? f.dep.rwy || '—' : '—';
    $('stRwyArr').textContent = f ? f.arr.rwy || '—' : '—';
    $('stCleared').textContent = engine.cleared != null ? (engine.cleared >= (f ? f.dep.ta : 18000) && engine.cleared >= 6000 ? 'FL' + Math.round(engine.cleared / 100) : fmtAlt(engine.cleared)) : '—';
    $('stSquawk').textContent = f ? f.squawk : '—';
    $('btnSquawk').disabled = !f || !telConnected();
    $('btnAtisDep').disabled = $('btnAtisArr').disabled = !f;

    const st = engine.station;
    $('stName').textContent = st ? st.name : '—';
    $('stFreq').textContent = st ? utils.freqTxt(st.freq) : '———.———';
    const com = t && t.com1 != null ? t.com1 : null;
    const comOk = st && com != null && Math.abs(com - st.freq) < 0.006;
    $('comFreq').textContent = com != null ? utils.freqTxt(com) : '—';
    $('comState').className = 'com' + (com == null ? '' : comOk ? ' ok' : ' bad');
    $('btnCom').disabled = !st || !telConnected() || comOk;

    // télémétrie
    $('tAlt').textContent = t && t.alt != null ? Math.round(t.alt).toLocaleString('fr-FR') : '—';
    $('tIas').textContent = t && t.ias != null ? Math.round(t.ias) : '—';
    $('tGs').textContent = t && t.gs != null ? Math.round(t.gs) : '—';
    $('tVs').textContent = t && t.vs != null ? (t.vs > 0 ? '+' : '') + Math.round(t.vs / 10) * 10 : '—';
    $('tHdg').textContent = t && t.hdg != null ? String(Math.round(t.hdg) % 360 || 360).padStart(3, '0') : '—';
    const d = engine.dist().arr;
    $('tDist').textContent = d != null ? Math.round(d) + ' NM' : '—';

    // reprise
    const sel = $('selResume');
    if (!sel.options.length || sel.dataset.lang !== S.lang) {
      sel.innerHTML = ''; sel.dataset.lang = S.lang;
      RESUME_POINTS.forEach((p) => { const o = document.createElement('option'); o.value = p; o.textContent = PHASE_LABEL.fr[p] + (p === 'TWR_CHECKIN' ? ' (Tour)' : p === 'DEP_CHECKIN' ? ' (après décollage)' : ''); sel.appendChild(o); });
    }
    $('btnResume').disabled = !f;
    $('demoBox').classList.toggle('hidden', !demo);

    // auto-réglage COM1 au changement de contrôleur
    const key = st ? st.name + st.freq : null;
    if (key !== lastStationKey) { lastStationKey = key; autoTune.tries = 0; autoTune.warned = false; }
    autoRadio(st, comOk, t);

    renderActions(comOk, com);
  }

  function renderActions(comOk, com) {
    const box = $('actions'); box.innerHTML = '';
    const notice = $('notice');
    const acts = engine.actions();
    // avec le réglage automatique, on ne bloque jamais : ATC règle la fréquence lui-même
    const block = S.requireCom && !S.autoCom && telConnected() && engine.station && !comOk && engine.phase !== 'DONE';
    if (block && acts.length) {
      notice.classList.remove('hidden');
      notice.innerHTML = '';
      const s = document.createElement('span');
      s.textContent = `Réglez COM1 sur ${utils.freqTxt(engine.station.freq)} (${engine.station.name}) pour parler.`;
      const b = document.createElement('button'); b.className = 'mini'; b.textContent = 'Régler COM1'; b.onclick = tuneCom;
      notice.append(s, b);
    } else notice.classList.add('hidden');

    if (engine.busy) { const w = document.createElement('span'); w.className = 'waiting'; w.textContent = 'Le contrôleur répond'; box.appendChild(w); return; }
    if (!engine.flight) { const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Charger un vol'; b.onclick = openFlight; box.appendChild(b); return; }
    if (engine.phase === 'DONE') { const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Nouveau vol'; b.onclick = openFlight; box.appendChild(b); return; }
    if (!acts.length) {
      const w = document.createElement('span'); w.className = 'waiting';
      w.textContent = telConnected() ? 'Écoute de la fréquence' : waitingForFlight() ? 'MSFS est dans le menu : lancez votre vol, l\'ATC prendra le relais' : 'En attente du simulateur (ou utilisez « Reprendre à une étape »)';
      box.appendChild(w); return;
    }
    acts.forEach((a, i) => {
      const b = document.createElement('button');
      b.className = 'act' + (a.primary ? ' primary' : '');
      b.disabled = block;
      b.innerHTML = '<b></b><small></small>';
      b.children[0].textContent = a.label;
      b.children[1].textContent = '« ' + a.preview + ' »';
      b.title = a.preview + (i < 9 ? `  (touche ${i + 1})` : '');
      b.onclick = a.needsLevel ? () => openLevel(a.options) : () => engine.pilotAction(a.id);
      box.appendChild(b);
    });
  }

  // ---------- Commandes vers le simulateur ----------
  // Réglage automatique de la radio et du transpondeur (avec nouvel essai et méthode de secours)
  const autoTune = { tries: 0, last: 0, warned: false, xTries: 0, xLast: 0, xCode: null };
  function autoRadio(st, comOk, t) {
    if (!telConnected() || !engine.flight) return;
    const now = Date.now();
    if (S.autoCom && st && !comOk && autoTune.tries < (t && t.fenix ? 6 : 4) && now - autoTune.last > 3000) {
      autoTune.last = now;
      tuneCom(t && t.fenix ? autoTune.tries : (autoTune.tries >= 2 ? 1 : 0));
      autoTune.tries++;
    } else if (S.autoCom && st && !comOk && autoTune.tries >= (t && t.fenix ? 6 : 4) && !autoTune.warned && now - autoTune.last > 3000) {
      autoTune.warned = true;
      addMessage({ from: 'system', text: t && t.fenix
        ? `Le RMP du Fenix n'a pas pris la fréquence (RMP 1 allumé et sur VHF1 ?). Réglez ${utils.freqTxt(st.freq)} à la main. Diagnostic RMP 1 : actif ${t.fenixRmp && t.fenixRmp.active ? utils.freqTxt(t.fenixRmp.active) : '—'}, attente ${t.fenixRmp && t.fenixRmp.stdby ? utils.freqTxt(t.fenixRmp.stdby) : '—'}, transfert ${t.fenixRmp ? t.fenixRmp.xfer : '—'}.`
        : `Votre avion n'accepte pas le réglage automatique du COM1 (certains avions très détaillés l'ignorent). Réglez ${utils.freqTxt(st.freq)} à la main.` });
    }
    const f = engine.flight;
    const cleared = !['IDLE', 'PRE'].includes(engine.phase);
    if (S.autoXpdr && cleared && t && t.squawk && t.squawk !== f.squawk) {
      if (autoTune.xCode !== f.squawk) { autoTune.xCode = f.squawk; autoTune.xTries = 0; }
      if (autoTune.xTries < 3 && now - autoTune.xLast > 3000) { autoTune.xLast = now; autoTune.xTries++; setSquawk(); }
    }
  }
  // Collationnement automatique : une fois que le contrôleur a fini de parler
  let rbSince = 0;
  function autoReadback() {
    if (!S.autoReadback || !engine.pending || engine.busy) { rbSince = 0; return; }
    if (speaking || speakQueue.length) { rbSince = 0; return; }
    const st = engine.station, t = currentTel();
    const comOk = st && t && t.com1 != null && Math.abs(t.com1 - st.freq) < 0.006;
    if (S.requireCom && !S.autoCom && telConnected() && st && !comOk) return;
    if (!rbSince) { rbSince = Date.now(); return; }
    if (Date.now() - rbSince > 900) { rbSince = 0; engine.pilotAction('readback'); render(); }
  }
  async function tuneCom(method) {
    const st = engine.station; if (!st) return;
    if (demo) demo.com1 = st.freq;
    else if (api) await api.setCom1(st.freq, typeof method === 'number' ? method : 0);
    setTimeout(render, 300);
  }
  async function setSquawk() {
    const f = engine.flight; if (!f) return;
    if (demo) demo.squawk = f.squawk;
    else if (api) await api.setSquawk(f.squawk);
  }

  // ---------- Construction du vol ----------
  const cityFrom = (metarName, fallback) => {
    if (metarName) { const c = metarName.split(/[/,]/)[0].trim(); if (c) return utils.titleCase(c); }
    return utils.titleCase(String(fallback || '').split(/\s+/)[0]);
  };
  function pickRunway(runways, wx) {
    if (!runways || !runways.length) return null;
    const longest = [...runways].sort((a, b) => b.length - a.length);
    if (!wx || wx.wdir == null || wx.wdir === 'VRB' || wx.wspd < 4) return longest[0].name;
    const score = (r) => Math.cos(((wx.wdir - r.heading) * Math.PI) / 180) * 100 + r.length / 1000;
    return [...runways].sort((a, b) => score(b) - score(a))[0].name;
  }
  async function enrich(flight) {
    const icaos = [flight.dep.icao, flight.arr.icao];
    let metars = [];
    try { metars = api ? await api.metar(icaos) : []; } catch (_) {}
    for (const side of ['dep', 'arr']) {
      const a = flight[side];
      const m = (metars || []).find((x) => x.icaoId === a.icao);
      if (m) {
        a.metar = m;
        if (a.lat == null) { a.lat = m.lat; a.lon = m.lon; }
        if (a.elev == null && m.elev != null) a.elev = Math.round(m.elev * 3.281);
      }
      a.city = cityFrom(m && m.name, a.name || a.icao);
      let fac = null;
      if (api && simStatus === 'connected') { try { fac = await api.airport(a.icao); } catch (_) {} }
      if (fac) {
        a.freqs = { ...fac.freqs };
        if (a.lat == null && fac.airport) { a.lat = fac.airport.lat; a.lon = fac.airport.lon; a.elev = Math.round(fac.airport.elevM * 3.281); }
        a.runwayList = fac.runways;
        if (!a.rwy) a.rwy = pickRunway(fac.runways, m ? { wdir: m.wdir, wspd: m.wspd } : null);
      }
      if (!a.rwy && m && typeof m.wdir === 'number') a.rwy = String(Math.round(m.wdir / 10) % 36 || 36).padStart(2, '0');
      if (a.lat == null) throw new Error(`Coordonnées introuvables pour ${a.icao} (vérifiez le code OACI, ou lancez MSFS).`);
    }
    return flight;
  }
  function fromSimbrief(d) {
    if (!d || !d.fetch || !/success/i.test(d.fetch.status)) throw new Error('SimBrief : ' + ((d && d.fetch && d.fetch.status) || 'réponse vide'));
    const o = d.origin, a = d.destination, g = d.general || {};
    const fixes = [].concat((d.navlog && d.navlog.fix) || []);
    const sidFix = fixes.find((x) => x.is_sid_star === '1' || x.is_sid_star === 1);
    const sid = sidFix && sidFix.via_airway && !/^DCT$/.test(sidFix.via_airway) ? sidFix.via_airway : null;
    // Paliers : « LFPG/0350 RESMI/0370 … » (stepclimb_string), sinon changements d'altitude en croisière dans le navlog
    const fixPos = (id) => { const x = fixes.find((q) => q.ident === id); return x ? { lat: +x.pos_lat, lon: +x.pos_long } : null; };
    const steps = [];
    const ssr = String(g.stepclimb_string || '').trim();
    if (ssr) {
      ssr.split(/\s+/).slice(1).forEach((tok) => {
        const m = tok.match(/^([A-Z0-9]+)\/(\d{3,4})$/); if (!m) return;
        const pos = fixPos(m[1]); if (pos) steps.push({ fix: m[1], alt: +m[2] * 100, ...pos });
      });
    } else {
      let prev = null;
      fixes.forEach((x) => {
        if (x.stage !== 'CRZ') return;
        const alt = +x.altitude_feet;
        if (prev != null && alt && Math.abs(alt - prev) >= 1000) steps.push({ fix: x.ident, alt, lat: +x.pos_lat, lon: +x.pos_long });
        if (alt) prev = alt;
      });
    }
    const num = (v) => (v === undefined || v === '' || isNaN(+v) ? null : +v);
    const side = (x) => ({ icao: x.icao_code, name: x.name, rwy: x.plan_rwy || null, elev: num(x.elevation), lat: num(x.pos_lat), lon: num(x.pos_long), ta: num(x.trans_alt), tl: num(x.trans_level) });
    return {
      callsign: ((d.atc && d.atc.callsign) || `${g.icao_airline || ''}${g.flight_number || ''}`).toUpperCase(),
      cruise: num(g.initial_altitude) || 30000,
      sid, steps, dep: side(o), arr: side(a),
      route: fixes
        .map((x) => ({ ident: x.ident, lat: +x.pos_lat, lon: +x.pos_long, sidstar: x.is_sid_star === '1' || x.is_sid_star === 1 }))
        .filter((x) => Number.isFinite(x.lat) && Number.isFinite(x.lon) && !/^(TOC|TOD)$/.test(x.ident)),
    };
  }
  function demoFlight() {
    return {
      callsign: 'FWI512', cruise: 15000, sid: null,
      dep: { icao: 'TFFR', name: 'Pointe-à-Pitre', rwy: '12', elev: 36, lat: 16.2653, lon: -61.5318, ta: 5000, tl: 6000 },
      arr: { icao: 'TFFF', name: 'Fort-de-France', rwy: '10', elev: 16, lat: 14.591, lon: -61.0032, ta: 5000, tl: 6000 },
    };
  }

  async function startFlight(build, isDemo) {
    const err = $('flightErr'); err.classList.add('hidden');
    const btns = document.querySelectorAll('#dlgFlight .primary'); btns.forEach((b) => (b.disabled = true));
    try {
      const flight = await build();
      if (isDemo) {
        let metars = [];
        try { metars = api ? await api.metar(['TFFR', 'TFFF']) : []; } catch (_) {}
        for (const s of ['dep', 'arr']) {
          const m = (metars || []).find((x) => x.icaoId === flight[s].icao);
          flight[s].metar = m || { rawOb: `${flight[s].icao} 000000Z 09012KT 9999 FEW020 28/22 Q1015`, temp: 28, dewp: 22, wdir: 90, wspd: 12, altim: 1015 };
          flight[s].city = flight[s].name;
        }
      } else await enrich(flight);
      await applyNotams(flight);
      $('log').innerHTML = '';
      engine.lang = S.lang;
      demo = isDemo ? new DemoSim(flight) : null;
      engine.load(flight);
      pendingNotes.forEach((t) => addMessage({ from: 'system', text: 'NOTAM — ' + t })); pendingNotes = [];
      loadLayouts(flight);
      close($('dlgFlight'));
      updatePill();
    } catch (e) {
      err.textContent = e.message || String(e); err.classList.remove('hidden');
    } finally { btns.forEach((b) => (b.disabled = false)); }
  }

  // ---------- Boîtes de dialogue ----------
  function openFlight() { $('inSbUser').value = S.sbUser || ''; $('dlgFlight').classList.remove('hidden'); }
  function close(el) { el.classList.add('hidden'); }
  document.querySelectorAll('[data-close]').forEach((b) => (b.onclick = () => close(b.closest('.overlay'))));
  document.querySelectorAll('.tab').forEach((t) => (t.onclick = () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.toggle('hidden', b.dataset.body !== t.dataset.tab));
  }));
  $('btnNew').onclick = openFlight;
  $('btnStart').onclick = openFlight;
  $('btnLoadSb').onclick = () => {
    const u = $('inSbUser').value.trim(); if (!u) return;
    S.sbUser = u; save();
    startFlight(async () => { if (!api) throw new Error("Ouvrez ATC depuis l'application installée."); return fromSimbrief(await api.simbrief(u)); });
  };
  $('btnLoadMan').onclick = () => startFlight(async () => {
    const cs = $('inCs').value.trim().toUpperCase(), dep = $('inDep').value.trim().toUpperCase(), arr = $('inArr').value.trim().toUpperCase();
    const fl = parseInt($('inFl').value, 10);
    if (!cs || !/^[A-Z0-9]{4}$/.test(dep) || !/^[A-Z0-9]{4}$/.test(arr) || !fl) throw new Error('Remplissez indicatif, départ, arrivée (codes OACI à 4 lettres) et niveau.');
    return {
      callsign: cs, cruise: fl * 100, sid: $('inSid').value.trim().toUpperCase() || null,
      dep: { icao: dep, rwy: $('inRwyDep').value.trim().toUpperCase() || null },
      arr: { icao: arr, rwy: $('inRwyArr').value.trim().toUpperCase() || null },
    };
  });
  $('btnLoadDemo').onclick = () => startFlight(async () => demoFlight(), true);

  $('btnSettings').onclick = () => {
    $('setLang').value = S.lang; $('setTts').value = S.ttsEngine; $('setFx').value = S.radioFx; fillVoiceSelect(); $('setRate').value = S.rate; $('setVol').value = S.volume;
    $('setSquelch').checked = S.squelch; $('setPilotVoice').checked = S.pilotVoice; $('setCom').checked = S.requireCom; $('setAutoCom').checked = S.autoCom; $('setAutoXpdr').checked = S.autoXpdr; $('setAutoPush').checked = S.autoPush !== false; $('setTrafficMax').value = String(S.trafficMax || 8); $('setFsltl').checked = S.preferFsltl !== false; $('setAutoRb').checked = S.autoReadback;
    $('dlgSettings').classList.remove('hidden');
  };
  const bindSetting = (id, key, conv) => { $(id).onchange = (e) => { S[key] = conv(e.target); save(); if (key === 'lang') { setTimeout(fillVoiceSelect); engine.lang = S.lang; if (engine.flight) engine.station = engine._st(engine.station.role, engine.station.side); } render(); }; };
  bindSetting('setLang', 'lang', (e) => e.value);
  $('setVoice').onchange = (e) => { if (S.ttsEngine === 'neural') S.neuralVoice = e.target.value; else S.voice = e.target.value; save(); };
  bindSetting('setTts', 'ttsEngine', (e) => { neuralDown = 0; neuralWarned = false; setTimeout(fillVoiceSelect); return e.value; });
  bindSetting('setFx', 'radioFx', (e) => e.value);
  bindSetting('setRate', 'rate', (e) => +e.value);
  bindSetting('setVol', 'volume', (e) => +e.value);
  bindSetting('setSquelch', 'squelch', (e) => e.checked);
  bindSetting('setPilotVoice', 'pilotVoice', (e) => e.checked);
  bindSetting('setCom', 'requireCom', (e) => e.checked);
  bindSetting('setAutoCom', 'autoCom', (e) => { autoTune.tries = 0; autoTune.warned = false; return e.checked; });
  bindSetting('setAutoRb', 'autoReadback', (e) => { $('chkAutoRb').checked = e.checked; return e.checked; });
  $('setTrafficMax').onchange = (e) => { S.trafficMax = +e.target.value; save(); traffic.max = S.trafficMax; };
  $('setFsltl').onchange = (e) => { S.preferFsltl = e.target.checked; save(); traffic.preferFsltl = S.preferFsltl; traffic.models = null; traffic.modelsAt = 0; };
  $('chkAutoRb').checked = S.autoReadback;
  $('chkAutoRb').onchange = (e) => { S.autoReadback = e.target.checked; save(); render(); };
  bindSetting('setAutoPush', 'autoPush', (e) => e.checked);
  bindSetting('setAutoXpdr', 'autoXpdr', (e) => { autoTune.xTries = 0; return e.checked; });
  $('btnTestVoice').onclick = () => { neuralDown = 0; neuralWarned = false; say(S.lang === 'fr' ? 'French West cinq un deux, autorisé décollage piste un deux.' : 'French West five one two, cleared for take-off runway one two.', { station: engine.station ? engine.station.name : 'Tour' }); };
  $('chkMute').checked = S.mute;
  $('chkMute').onchange = (e) => { S.mute = e.target.checked; save(); if (S.mute) { speakQueue.length = 0; speechSynthesis.cancel(); } };

  // Choix d'un niveau de vol
  function openLevel(options) {
    const grid = $('levelGrid'); grid.innerHTML = '';
    const cur = engine.target;
    (options || []).forEach((alt) => {
      const b = document.createElement('button');
      b.textContent = 'FL' + Math.round(alt / 100);
      b.className = alt > cur ? 'up' : 'down';
      b.onclick = () => { close($('dlgLevel')); engine.pilotAction('req_level', alt); };
      grid.appendChild(b);
    });
    $('levelCur').textContent = cur ? 'FL' + Math.round(cur / 100) : '—';
    $('dlgLevel').classList.remove('hidden');
  }
  // ---- Pistes autour de l'avion au sol : sur une piste ? piste juste devant ? ----
  function updateGround() {
    const f = engine.flight, t = currentTel();
    if (!f || !t || t.lat == null || !t.onGround) { engine.ground = null; return; }
    const side = utils.distNm(t, f.dep) < utils.distNm(t, f.arr) ? 'dep' : 'arr';
    const L = layouts[f[side].icao]; if (!L) { engine.ground = null; return; }
    for (const s of ['dep', 'arr']) { const LL = layouts[f[s].icao]; if (LL && f[s].rwy) { const th = Airport.threshold(LL, f[s].rwy); f[s].rwyStrip = th ? th.ref : null; } }
    const onRunway = Airport.runwayAt(L, t);
    let ahead = null;
    const hdg = t.hdgTrue != null ? t.hdgTrue : t.hdg;
    if (hdg != null) {
      const R = 6371000, la = t.lat * Math.PI / 180, lo = t.lon * Math.PI / 180, b = hdg * Math.PI / 180;
      for (let d = 20; d <= 260; d += 20) {
        const dd = d / R, la2 = Math.asin(Math.sin(la) * Math.cos(dd) + Math.cos(la) * Math.sin(dd) * Math.cos(b));
        const lo2 = lo + Math.atan2(Math.sin(b) * Math.sin(dd) * Math.cos(la), Math.cos(dd) - Math.sin(la) * Math.sin(la2));
        const ref = Airport.runwayAt(L, { lat: la2 * 180 / Math.PI, lon: lo2 * 180 / Math.PI });
        if (ref && ref !== onRunway) { ahead = { ref, dist: d }; break; }
      }
    }
    engine.ground = { onRunway, ahead };
  }

  // ---- Plan au sol et itinéraire de roulage ----
  const layouts = {};
  let taxiCalc = { at: 0, pos: null };
  async function loadLayouts(flight) {
    taxiCalc = { at: 0, pos: null };
    if (window.MapView) MapView.setTaxiRoute(null);
    for (const side of ['dep', 'arr']) {
      const a = flight[side];
      if (layouts[a.icao]) { pushLayout(a.icao); detectRunways(flight, side); continue; }
      if (!api || !api.airportLayout) continue;
      try {
        const json = await api.airportLayout(a.icao, a.lat, a.lon);
        if (json) { layouts[a.icao] = Airport.parse(json); reassignFromLayout(flight, side); pushLayout(a.icao); detectRunways(flight, side); }
      } catch (_) {}
    }
  }
  function pushLayout(icao) {
    if (!(window.MapView && MapView.map && layouts[icao])) return;
    const f = engine.flight, side = f && (f.dep.icao === icao ? f.dep : f.arr.icao === icao ? f.arr : null);
    MapView.setAirport(icao, layouts[icao], side ? Notam.closedSet(side.closures) : null);
  }
  // NOTAM : pistes fermées en ce moment ; si la piste prévue est fermée, l'ATC en donne une autre
  async function applyNotams(flight) {
    if (!api || !api.notams) return;
    for (const side of ['dep', 'arr']) {
      const a = flight[side];
      let list = null;
      try { list = await Promise.race([api.notams(a.icao), new Promise((r) => setTimeout(() => r(null), 12000))]); } catch (_) {}
      if (!list) { a.notamOk = false; continue; }
      a.notamOk = true;
      a.closures = Notam.closures(list);
      if (a.rwy && Notam.isClosed(a.closures, a.rwy)) {
        const from = a.rwy, c = a.closures.find((x) => !x.partial && x.rwys.some((r) => Notam.isClosed([x], from)));
        const open = (a.runwayList || []).filter((r) => !Notam.isClosed(a.closures, r.name));
        const wx = a.metar ? { wdir: a.metar.wdir, wspd: a.metar.wspd } : null;
        const to = open.length ? pickRunway(open, wx) : null;
        a.rwyChange = { from, to, until: c && c.until, works: c && c.works };
        if (to) a.rwy = to;
      }
    }
    const msgs = [];
    for (const side of ['dep', 'arr']) {
      const a = flight[side], cl = (a.closures || []).filter((c) => !c.partial);
      if (cl.length) msgs.push(`${a.icao} : piste${cl.length > 1 ? 's' : ''} ${cl.map((c) => c.rwys.join('/')).join(', ')} fermée${cl.length > 1 ? 's' : ''}`);
      if (a.rwyChange) msgs.push(a.rwyChange.to ? `${a.icao} : piste ${a.rwyChange.from} fermée, l'ATC vous donnera la ${a.rwyChange.to}` : `${a.icao} : piste ${a.rwyChange.from} fermée selon les NOTAM, aucune autre piste connue (lancez MSFS avant de charger le vol)`);
    }
    pendingNotes = msgs;
  }
  let pendingNotes = [];
  // ---- Pistes réellement en service : D-ATIS (US) ou déduites des vrais vols du moment ----
  async function detectRunways(flight, side) {
    const a = flight[side], L = layouts[a.icao];
    if (!L || !api || engine.flight !== flight) return;
    let res = null, src = '';
    try {
      const at = api.datis ? await api.datis(a.icao) : null;
      if (at && at.length) {
        const pick = (type) => (at.find((x) => x.type === type) || at.find((x) => x.type === 'combined') || at[0]).text;
        const ra = RwyUse.parseAtis(pick('arr')), rd = RwyUse.parseAtis(pick('dep'));
        res = RwyUse.complete({ arr: ra.arr, dep: rd.dep.length ? rd.dep : ra.dep }, L, MapView._rwyEnds); src = 'ATIS réel';
      }
    } catch (_) {}
    if (!res && api.liveFlights) {
      try {
        const live = await api.liveFlights(a.lat, a.lon);
        res = RwyUse.complete(RwyUse.fromLive(L, live, a.elev || 0, MapView._rwyEnds), L, MapView._rwyEnds); src = 'trafic réel';
      } catch (_) {}
    }
    if (!res || engine.flight !== flight) return;
    const open = (list) => list.filter((r) => !Notam.isClosed(a.closures, r));
    const dep = open(res.dep), arr = open(res.arr);
    if (dep.length) a.rwyTakeoff = dep[0];
    if (arr.length) a.rwyLand = arr[0];
    // la piste du joueur : départ au départ (avant la clairance), atterrissage à l'arrivée (avant l'approche)
    const before = a.rwy;
    if (side === 'dep' && dep.length && engine.phase === 'PRE') {
      // plusieurs pistes de départ : la plus proche de l'avion
      const t = currentTel();
      if (dep.length > 1 && t && t.lat != null) {
        const E = RwyUse.ends(L, MapView._rwyEnds);
        dep.sort((x, y) => { const ex = E.find((e) => e.name === x), ey = E.find((e) => e.name === y); return (ex ? utils.distNm(t, ex.th) : 99) - (ey ? utils.distNm(t, ey.th) : 99); });
      }
      a.rwy = dep[0];
    }
    if (side === 'arr' && arr.length && !['APP_CHECKIN', 'APPROACH', 'FINAL', 'TWR_CHECKIN', 'LANDING', 'VACATING', 'TAXI_IN', 'DONE'].includes(engine.phase)) a.rwy = arr[0];
    a.rwyReal = { src, at: Date.now() };
    if (a.rwy !== before) { a.taxiVia = null; a.taxiPts = null; taxiCalc = { at: 0, pos: null }; }
    const same = dep.join() === arr.join();
    addMessage({ from: 'system', text: `Pistes en service à ${a.city} en ce moment (${src}) : ${same ? (dep.join(', ') || arr.join(', ')) : `départs ${dep.join(', ') || '—'}, arrivées ${arr.join(', ') || '—'}`}${a.rwy !== before ? ` — votre piste : ${a.rwy}` : ''}.` });
    render();
  }
  // à l'approche de la destination, on revérifie la configuration réelle
  setInterval(() => {
    const f = engine.flight, t = currentTel();
    if (!f || !t || t.lat == null) return;
    const d = utils.distNm(t, f.arr);
    if (d < 150 && !['APP_CHECKIN', 'APPROACH', 'FINAL', 'TWR_CHECKIN', 'LANDING', 'VACATING', 'TAXI_IN', 'DONE'].includes(engine.phase)
      && (!f.arr.rwyReal || Date.now() - f.arr.rwyReal.at > 20 * 60000)) { f.arr.rwyReal = { at: Date.now() }; detectRunways(f, 'arr'); }
  }, 30000);
  // Piste fermée sans autre piste connue : on cherche dans le plan OSM de l'aéroport
  function reassignFromLayout(flight, side) {
    const a = flight[side], L = layouts[a.icao];
    if (!a.rwyChange || a.rwyChange.to || !L || !window.MapView) return;
    if (side === 'dep' && engine.phase !== 'PRE') return;
    const cands = [];
    L.runways.forEach((r) => {
      const p = r.pts[0], q = r.pts[r.pts.length - 1], len = utils.distNm(p, q) * 1852;
      MapView._rwyEnds(r.ref, p, q).forEach((e, i) => cands.push({ name: e.name, heading: i === 0 ? utils.bearing(p, q) : utils.bearing(q, p), length: len }));
    });
    const open = cands.filter((c) => c.length > 800 && !Notam.isClosed(a.closures, c.name));
    if (!open.length) return;
    const to = pickRunway(open, a.metar ? { wdir: a.metar.wdir, wspd: a.metar.wspd } : null);
    a.rwyChange.to = to; a.rwy = to;
    addMessage({ from: 'system', text: `NOTAM — ${a.icao} : piste ${a.rwyChange.from} fermée, l'ATC vous donnera la ${to}.` });
    render();
  }
  function updateTaxiRoute() {
    const f = engine.flight, t = currentTel();
    if (!f || !t || t.lat == null || !t.onGround || !['PRE', 'CLEARED', 'STARTUP'].includes(engine.phase)) return;
    const L = layouts[f.dep.icao]; if (!L) return;
    const now = Date.now();
    if (now - taxiCalc.at < 5000 && taxiCalc.pos && utils.distNm(taxiCalc.pos, t) * 1852 < 25) return;
    taxiCalc = { at: now, pos: { lat: t.lat, lon: t.lon } };
    const r = Airport.taxiToRunway(L, t, f.dep.rwy);
    f.dep.taxiVia = r ? r.via : null;
    f.dep.crossings = r ? r.crossings : null;
    // orientation du nez après repoussage : direction du premier tronçon de roulage
    f.dep.pushFace = r && r.pts.length > 1 ? utils.bearing(r.pts[0], r.pts[1]) : null;
    f.dep.taxiPts = r ? r.pts : null;
    if (window.MapView) MapView.setTaxiRoute(r && r.pts, r && r.hold, r && r.via);
  }

  // ---- Trafic IA (vrais vols du moment) ----
  const traffic = new Traffic({ max: S.trafficMax || 8, io: {
    models: () => (api && api.aiModels && simStatus === 'connected' && !demo ? api.aiModels() : []),
    live: (lat, lon) => (api && api.liveFlights ? api.liveFlights(lat, lon) : null),
    spawn: (id, title, livery, tail, p) => (api && !demo && simStatus === 'connected' ? api.aiSpawn(id, title, livery, tail, p) : true),
    move: (list) => { if (api && !demo && list.length) api.aiMove(list); },
    remove: (id) => { if (api && !demo) api.aiRemove(id); },
    radio: (m) => { addMessage(m); },
    radioBusy: () => speaking || speakQueue.length > 0,
    connected: () => !demo && simStatus === 'connected',
  } });
  let liveWarned = false;
  traffic.onLive = (ok, list) => {
    if (!ok && !liveWarned) { liveWarned = true; addMessage({ from: 'system', text: 'Trafic réel : impossible de récupérer les vrais vols du moment (OpenSky). Nouvel essai automatique.' }); }
    if (ok) liveWarned = false;
  };
  let aiFails = 0;
  if (api && api.onAiStatus) api.onAiStatus((s) => {
    if (s.ok) return;
    traffic.failed(s.id);
    if (++aiFails <= 2) addMessage({ from: 'system', text: `Trafic réel : MSFS a refusé de créer un avion${s.title ? ' (« ' + s.title + ' »)' : ''}${s.error ? ' — ' + s.error : ''}.` });
  });
  traffic.preferFsltl = S.preferFsltl !== false;
  traffic.onModels = (n, total, fallback) => {
    if (n > 0) addMessage({ from: 'system', text: traffic.fsltlCount && S.preferFsltl !== false ? `Trafic réel : ${n} avions FSLTL trouvés, ils seront utilisés en priorité.` : `Trafic réel : ${n} livrées d'avions de ligne trouvées dans MSFS${traffic.fsltlCount === 0 ? ' (FSLTL non détecté)' : ''}.` });
    else if (n === -1) addMessage({ from: 'system', text: `Trafic réel : aucun avion de ligne trouvé dans la liste de MSFS, le trafic utilisera votre avion (« ${fallback} »).` });
    else if (!demo && simStatus === 'connected') addMessage({ from: 'system', text: `Trafic réel : MSFS n'a renvoyé aucun avion (${total} au total). Nouvel essai dans 30 s.` });
  };
  engine.traffic = traffic;
  // repoussage automatique avec le tracteur de MSFS, une fois la clairance collationnée
  engine.onPush = (face) => {
    if (!S.autoPush || demo || !api || !api.pushback || simStatus !== 'connected') return;
    const t = currentTel();
    if (!t || !t.onGround) return;
    api.pushback(face);
    addMessage({ from: 'system', text: 'Repoussage en cours avec le tracteur de MSFS (relâchez le frein de parc).' });
  };
  if (api && api.onPushStatus) api.onPushStatus((s) => { if (s.done) addMessage({ from: 'system', text: `Repoussage terminé (${s.moved} m). Serrez le frein de parc, démarrez, puis annoncez « prêt à rouler ».` }); });
  window.__atc = { engine, traffic };
  function setTraffic(on) {
    S.traffic = on; save();
    $('chkTraffic').checked = on;
    traffic.setEnabled(on);
    if (on) addMessage({ from: 'system', text: demo || simStatus !== 'connected'
      ? 'Trafic réel activé : sans MSFS, les avions apparaissent seulement sur la carte.'
      : 'Trafic réel activé : coupez le trafic live de MSFS (Options → Trafic) pour éviter les doublons.' });
    if (!on && api && api.aiClear) api.aiClear();
  }
  $('chkTraffic').checked = S.traffic;
  traffic.setEnabled(S.traffic);
  $('chkTraffic').onchange = (e) => setTraffic(e.target.checked);
  // le joueur entend les échanges IA s'il est sur la même fréquence (Sol ou Tour du même aéroport)
  const audible = (role, side) => { const st = engine.station; return !!st && st.side === side && (st.role === role || (role === 'GND' && st.role === 'DEL' && false)); };
  let tLast = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = Math.min(0.5, (now - tLast) / 1000); tLast = now;
    if (!engine.flight) return;
    traffic.tick(Date.now(), dt, engine, layouts, currentTel(), audible);
    if (window.MapView && MapView.map) MapView.setTraffic(traffic.list());
  }, 100);

  // ---- Mises à jour automatiques ----
  // Notes de version (texte de la publication GitHub) → liste lisible : ajouts, corrections, retraits
  function renderNotes(md) {
    const box = $('updNotes'); box.innerHTML = '';
    let ul = null, kind = 'add';
    for (const raw of String(md || '').split(/\r?\n/)) {
      const line = raw.trim(); if (!line) continue;
      const h = line.match(/^#+\s*(.*)$/);
      if (h) {
        const t = h[1]; const el = document.createElement('h4'); el.textContent = t; box.appendChild(el); ul = null;
        kind = /retrait|retir|supprim|enlev/i.test(t) ? 'del' : /corrig|correct|répar/i.test(t) ? 'fix' : 'add';
        continue;
      }
      const li = document.createElement('li');
      const m = line.match(/^([-*+])\s*(.*)$/);
      let k = kind, text = m ? m[2] : line;
      if (/^\[?(retiré|supprimé)\]?/i.test(text)) k = 'del';
      li.className = k; li.textContent = text.replace(/\*\*/g, '');
      if (!ul) { ul = document.createElement('ul'); box.appendChild(ul); }
      ul.appendChild(li);
    }
    if (!box.children.length) box.textContent = 'Améliorations et corrections.';
  }
  let pendingUpdate = null;
  function showUpdate(u) {
    pendingUpdate = u;
    $('updTitle').textContent = `Mise à jour disponible : ATC ${u.version}${u.beta ? ' (bêta)' : ''}`;
    $('updSub').textContent = `Vous avez la version ${u.current}. Voici ce qui change :`;
    renderNotes(u.notes);
    $('updProgress').classList.add('hidden'); $('updErr').classList.add('hidden');
    $('btnUpdNow').classList.remove('hidden'); $('btnUpdNow').disabled = false; $('btnUpdLater').textContent = 'Plus tard';
    $('dlgUpdate').classList.remove('hidden');
  }
  async function checkUpdate(manual) {
    if (!api || !api.updateCheck) return;
    const u = await api.updateCheck(!!S.beta);
    if (u && u.ok && u.available) {
      try { if (!manual && localStorage.getItem('atcsolo-skip') === u.version) return; } catch (_) {}
      showUpdate(u);
    } else if (manual) {
      $('updTitle').textContent = 'Mises à jour';
      $('updSub').textContent = u && u.ok ? `ATC est à jour (version ${u.current}).` : 'Impossible de vérifier les mises à jour pour le moment (connexion Internet ?).';
      $('updNotes').innerHTML = ''; $('updProgress').classList.add('hidden'); $('updErr').classList.add('hidden');
      $('btnUpdNow').classList.add('hidden'); $('btnUpdLater').textContent = 'Fermer';
      $('dlgUpdate').classList.remove('hidden');
    }
  }
  $('btnUpdLater').onclick = () => {
    if (pendingUpdate) { try { localStorage.setItem('atcsolo-skip', pendingUpdate.version); } catch (_) {} }
    close($('dlgUpdate'));
  };
  $('btnUpdNow').onclick = async () => {
    const u = pendingUpdate; if (!u) return;
    // on garde les notes pour les réafficher après la mise à jour
    try { localStorage.setItem('atcsolo-news', JSON.stringify({ version: u.version, notes: u.notes })); } catch (_) {}
    $('btnUpdNow').disabled = true; $('updProgress').classList.remove('hidden');
    $('updSub').textContent = 'Téléchargement de la mise à jour… ATC va redémarrer tout seul.';
    const r = await api.updateInstall(u.url, u.version);
    if (!r || !r.ok) { $('updErr').textContent = 'Échec de la mise à jour : ' + ((r && r.error) || 'erreur inconnue'); $('updErr').classList.remove('hidden'); $('btnUpdNow').disabled = false; }
  };
  if (api && api.onUpdateProgress) api.onUpdateProgress((p) => { $('updBar').style.width = (p.total ? Math.round((p.got / p.total) * 100) : 50) + '%'; });
  $('btnCheckUpd').onclick = () => { close($('dlgSettings')); checkUpdate(true); };
  $('setBeta').checked = !!S.beta;
  $('setBeta').onchange = (e) => { S.beta = e.target.checked; save(); try { localStorage.removeItem('atcsolo-skip'); } catch (_) {} };
  // après une mise à jour : on montre aux pilotes ce qui a été ajouté ou retiré
  (async () => {
    if (!api || !api.appVersion) return;
    const v = await api.appVersion();
    $('appVer').textContent = 'Version ' + v + (/-/.test(v) ? ' (bêta)' : '');
    try {
      const news = JSON.parse(localStorage.getItem('atcsolo-news') || 'null');
      if (news && news.version === v) {
        localStorage.removeItem('atcsolo-news');
        pendingUpdate = null;
        $('updTitle').textContent = `Nouveautés d'ATC ${v}`;
        $('updSub').textContent = 'La mise à jour est installée. Voici ce qui a changé :';
        renderNotes(news.notes);
        $('updProgress').classList.add('hidden'); $('updErr').classList.add('hidden');
        $('btnUpdNow').classList.add('hidden'); $('btnUpdLater').textContent = 'Super !';
        $('dlgUpdate').classList.remove('hidden');
        return;
      }
    } catch (_) {}
    setTimeout(() => checkUpdate(false), 4000);
    setInterval(() => checkUpdate(false), 6 * 3600000);
  })();

  // Onglets Radio / Carte
  document.querySelectorAll('.vtab').forEach((b) => (b.onclick = () => {
    const v = b.dataset.view;
    document.querySelectorAll('.vtab').forEach((x) => x.classList.toggle('active', x === b));
    $('log').classList.toggle('hidden', v !== 'radio');
    $('mapView').classList.toggle('hidden', v !== 'map');
    if (v === 'map' && window.MapView) { const first = !MapView.map; MapView.init($('map')); if (first && S.radar) setRadar(true); if (first) { Object.keys(layouts).forEach(pushLayout); if (engine.flight && engine.flight.dep.taxiPts) MapView.setTaxiRoute(engine.flight.dep.taxiPts, null, engine.flight.dep.taxiVia); } if (engine.flight) MapView.update(engine.flight, currentTel()); MapView.show(true); }
    else if (window.MapView) MapView.show(false);
  }));
  if (window.MapView) { MapView.style = S.mapStyle || 'dark'; MapView.onStyle = (k) => { S.mapStyle = k; save(); }; }
  $('selMapStyle').onchange = (e) => window.MapView && MapView.map && MapView.setStyle(e.target.value);
  // Radar météo
  let radarTimer = null;
  async function refreshRadar() {
    if (!S.radar || !window.MapView || !MapView.map || !api || !api.radarFrames) return;
    const f = await api.radarFrames();
    MapView.setRadar(f);
    $('radarInfo').classList.remove('hidden');
    $('mRadar').textContent = f ? new Date(f.time * 1000).toISOString().substr(11, 5) + 'Z' : 'indisponible';
  }
  function setRadar(on) {
    S.radar = on; save(); $('chkRadar').checked = on;
    clearInterval(radarTimer);
    if (on) { refreshRadar(); radarTimer = setInterval(refreshRadar, 5 * 60000); }
    else { if (window.MapView) MapView.setRadar(null); $('radarInfo').classList.add('hidden'); }
  }
  $('chkRadar').checked = !!S.radar;
  $('chkRadar').onchange = (e) => setRadar(e.target.checked);
  $('chkFollow').onchange = (e) => window.MapView && MapView.setFollow(e.target.checked);
  $('btnFitRoute').onclick = () => { if (window.MapView) { MapView.setFollow(false); MapView.fitRoute(); } };
  $('btnCom').onclick = tuneCom;
  $('btnSquawk').onclick = setSquawk;
  $('btnResume').onclick = () => engine.jumpTo($('selResume').value);
  $('selDemoSpeed').onchange = (e) => { demoSpeed = +e.target.value; };
  const showAtis = (side) => { const a = engine.atis(side); if (a) addMessage({ from: 'atc', atis: true, station: 'ATIS', freq: engine.flight[side].freqs.ATIS, text: a.text, speech: a.speech }); };
  $('btnAtisDep').onclick = () => showAtis('dep');
  $('btnAtisArr').onclick = () => showAtis('arr');

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    if (/^[1-9]$/.test(e.key)) { const b = $('actions').querySelectorAll('.act')[+e.key - 1]; if (b && !b.disabled) b.click(); }
    if (e.key === 'r' || e.key === 'R') { const last = [...document.querySelectorAll('.msg.atc .replay')].pop(); if (last) last.click(); }
  });

  // ---------- Simulateur ----------
  function updatePill() {
    const p = $('simPill'), t = $('simText');
    p.className = 'pill ' + (demo ? 'demo' : simStatus === 'connected' ? 'on' : simStatus === 'connecting' ? 'wait' : 'off');
    t.textContent = demo ? 'Mode démo' : simStatus === 'connected' ? (waitingForFlight() ? 'MSFS connecté · en attente du vol' : 'MSFS connecté') : simStatus === 'connecting' ? 'Connexion à MSFS…' : 'MSFS non détecté';
  }
  if (api) {
    api.onStatus((s) => { simStatus = s.status; if (s.status !== 'connected') simTel = null; updatePill(); render(); });
    api.onTelemetry((t) => { const was = waitingForFlight(); simTel = t; if (was !== waitingForFlight()) updatePill(); });
    api.state().then((s) => { simStatus = s.status; updatePill(); });
  }

  // Boucle principale (2 fois par seconde)
  let last = performance.now();
  setInterval(() => {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    if (demo) {
      const fast = ['CLIMB', 'CTR_CHECKIN', 'CRUISE', 'DESCENT'].includes(engine.phase) ? demoSpeed : 1;
      demo.step(Math.min(dt, 1) * fast, engine);
    }
    engine.tick(Date.now(), currentTel());
    autoReadback();
    updateGround();
    if (window.MapView && engine.flight) MapView.update(engine.flight, currentTel());
    updateTaxiRoute();
    render();
  }, 500);

  ready = true;
  updatePill();
  render();
})();
