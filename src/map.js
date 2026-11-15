/* ATC — carte : route du plan de vol, position de l'avion en direct, trace, prochain point. */
(function (root) {
  'use strict';
  const { distNm } = root.ATC.utils;

  // Distance (NM) d'un point P au segment A-B (approximation plane locale, suffisante ici)
  function segInfo(p, a, b) {
    const k = Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    const ax = a.lon * k, ay = a.lat, bx = b.lon * k, by = b.lat, px = p.lon * k, py = p.lat;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-12;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    const cx = ax + t * dx, cy = ay + t * dy;
    return { t, d: Math.hypot(px - cx, py - cy) * 60 };
  }

  // Point situé à d mètres de A en direction de B
  function inward(a, b, d) {
    const L = distNm(a, b) * 1852 || 1, t = Math.min(0.25, d / L);
    return { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
  }
  // Associe chaque extrémité à son numéro (on décolle depuis le seuil vers l'autre bout)
  function rwyEnds(ref, a, b) {
    const { bearing } = root.ATC.utils;
    const hAB = bearing(a, b), hBA = (hAB + 180) % 360;
    const fromHdg = (h) => String(Math.round(h / 10) % 36 || 36).padStart(2, '0');
    const parts = String(ref || '').toUpperCase().split(/[\/\-]/).map((x) => x.trim())
      .filter((x) => /^\d{1,2}[LRCG]?$/.test(x) && +x.match(/\d+/)[0] >= 1 && +x.match(/\d+/)[0] <= 36)
      .map((x) => x.replace(/^(\d)([LRCG]?)$/, '0$1$2'));
    const pick = (h) => {
      // partie dont le numéro correspond au cap (à 40° près), sinon numéro calculé
      const m = parts.find((x) => Math.abs(((+x.match(/\d+/)[0] * 10 - h + 540) % 360) - 180) <= 40);
      return m || fromHdg(h);
    };
    return [{ p: inward(a, b, 120), name: pick(hAB) }, { p: inward(b, a, 120), name: pick(hBA) }];
  }

  const MapView = {
    map: null, routeLine: null, flownLine: null, plane: null, wptLayer: null, trail: [],
    route: [], key: null, follow: true, nextIdx: 1, visible: false, lastFit: 0, lastTrail: null,

    init(el) {
      if (this.map || !root.L) return;
      const L = root.L;
      this.map = L.map(el, { zoomControl: true, attributionControl: true, worldCopyJump: true, maxZoom: 19 }).setView([46.5, 2.5], 5);
      this.map.createPane('airport'); this.map.getPane('airport').style.zIndex = 350;
      this.map.createPane('taxi'); this.map.getPane('taxi').style.zIndex = 380;
      this.map.createPane('aptPoints'); this.map.getPane('aptPoints').style.zIndex = 420;
      this.map.createPane('aptLabels'); this.map.getPane('aptLabels').style.zIndex = 460; this.map.getPane('aptLabels').style.pointerEvents = 'none';
      this.map.on('zoomend', () => this.zoomLabels());
      this.setStyle(this.style || 'dark');
      this.wptLayer = L.layerGroup().addTo(this.map);
      this.map.on('dragstart', () => { this.setFollow(false); });
    },

    // Fonds de carte gratuits, sans clé. En cas d'échec, on passe au suivant.
    STYLES: {
      dark: { name: 'Sombre', layers: [
        ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16 }],
        ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16 }],
      ], attribution: 'Fond © Esri, HERE, Garmin, © OpenStreetMap' },
      sat: { name: 'Satellite', layers: [
        ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 18 }],
        ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxNativeZoom: 16 }],
      ], attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics' },
      osm: { name: 'Plan', layers: [
        ['https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxNativeZoom: 19 }],
      ], attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' },
    },
    ORDER: ['dark', 'osm', 'sat'],

    setStyle(key, auto) {
      const L = root.L, st = this.STYLES[key] || this.STYLES.dark;
      (this.baseLayers || []).forEach((l) => this.map.removeLayer(l));
      this.style = key; this.tileOk = 0; this.tileErr = 0;
      this.baseLayers = st.layers.map(([url, o], i) => {
        const l = L.tileLayer(url, { maxZoom: 19, minZoom: 2, ...o, attribution: i === 0 ? st.attribution : '' });
        if (i === 0) {
          l.on('tileload', () => { this.tileOk++; });
          l.on('tileerror', () => { this.tileErr++; this.checkFallback(); });
        }
        return l.addTo(this.map);
      });
      this.baseLayers.forEach((l, i) => i === 0 ? l.bringToBack() : null);
      const sel = document.getElementById('selMapStyle'); if (sel) sel.value = key;
      if (!auto) this.tried = new Set([key]);
      if (this.onStyle) this.onStyle(key);
    },
    checkFallback() {
      if (this.tileOk > 0 || this.tileErr < 6) return;
      this.tried = this.tried || new Set();
      this.tried.add(this.style);
      const next = this.ORDER.find((k) => !this.tried.has(k));
      if (next) { this.tried.add(next); this.setStyle(next, true); }
    },

    // ---- Plan au sol ----
    airports: {},
    setAirport(icao, layout, closed) {
      if (!this.map || !layout) return;
      const L = root.L;
      if (this.airports[icao]) this.airports[icao].group.remove();
      const group = L.layerGroup(), labels = L.layerGroup(), fine = L.layerGroup(), rwyLabels = L.layerGroup();
      const opt = (o) => ({ pane: 'airport', interactive: false, ...o });
      const pt = (o) => ({ pane: 'aptPoints', interactive: false, ...o });
      const tip = (layer, txt, cls, dir) => { layer.bindTooltip(txt, { permanent: true, direction: dir || 'center', className: 'apt-label ' + cls, pane: 'aptLabels' }); if (cls === 'twy') { twyTips.push({ layer, ref: txt }); layer.on('tooltipopen', (ev) => { const el = ev.tooltip && ev.tooltip.getElement(); if (el) el.classList.toggle('onroute', (this.via || []).includes(txt)); }); } return layer; };
      const twyTips = [];
      layout.runways.forEach((r) => {
        L.polyline(r.pts.map((p) => [p.lat, p.lon]), opt({ color: '#4a5568', weight: 14, opacity: 0.95, lineCap: 'butt' })).addTo(group);
        L.polyline(r.pts.map((p) => [p.lat, p.lon]), opt({ color: '#e6edf7', weight: 1, opacity: 0.6, dashArray: '10 10' })).addTo(group);
        // Numéros de piste à chaque seuil : depuis la référence OSM si elle est correcte, sinon depuis l'orientation
        const a = r.pts[0], b = r.pts[r.pts.length - 1];
        const ends = rwyEnds(r.ref, a, b);
        if (closed && ends.some((x) => closed.has(x.name))) {
          L.polyline(r.pts.map((p) => [p.lat, p.lon]), opt({ color: '#f26d6d', weight: 14, opacity: 0.55, lineCap: 'butt' })).addTo(group);
          L.polyline(r.pts.map((p) => [p.lat, p.lon]), opt({ color: '#f26d6d', weight: 3, opacity: 1, dashArray: '2 14' })).addTo(group);
          const mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
          tip(L.circleMarker([mid.lat, mid.lon], opt({ radius: 0, opacity: 0 })).addTo(rwyLabels), 'FERMÉE', 'closed');
        }
        ends.forEach(({ p, name }) => {
          tip(L.circleMarker([p.lat, p.lon], opt({ radius: 0, opacity: 0 })).addTo(rwyLabels), name, 'rwy');
        });
      });
      const seen = [];
      layout.taxiways.forEach((t) => {
        L.polyline(t.pts.map((p) => [p.lat, p.lon]), opt({ color: t.lane ? '#7c6a2e' : '#d4a72c', weight: t.lane ? 1.5 : 2.5, opacity: 0.85 })).addTo(group);
        if (!t.ref || t.lane) return;
        const mid = t.pts[Math.floor(t.pts.length / 2)];
        if (seen.some((s) => s.ref === t.ref && Math.abs(s.lat - mid.lat) < 0.002 && Math.abs(s.lon - mid.lon) < 0.003)) return;
        seen.push({ ref: t.ref, ...mid });
        tip(L.circleMarker([mid.lat, mid.lon], opt({ radius: 0, opacity: 0 })).addTo(labels), t.ref, 'twy');
      });
      layout.holds.forEach((h) => {
        L.circleMarker([h.lat, h.lon], pt({ radius: 3.5, color: '#f26d6d', fillColor: '#f26d6d', fillOpacity: 1, weight: 1 })).addTo(group);
        if (h.ref) tip(L.circleMarker([h.lat, h.lon], opt({ radius: 0, opacity: 0 })).addTo(fine), h.ref, 'hold', 'top');
      });
      layout.gates.forEach((g) => {
        L.circleMarker([g.lat, g.lon], pt({ radius: 2.5, color: '#6cb2ff', fillColor: '#6cb2ff', fillOpacity: 0.9, weight: 1 })).addTo(fine);
        if (g.ref) tip(L.circleMarker([g.lat, g.lon], opt({ radius: 0, opacity: 0 })).addTo(fine), g.ref, 'gate', 'right');
      });
      this.airports[icao] = { group, labels, fine, twyTips, rwyLabels };
      this.markVia();
      this.zoomLabels();
    },
    zoomLabels() {
      if (!this.map) return;
      const z = this.map.getZoom();
      for (const a of Object.values(this.airports)) {
        const show = (l, minZ) => { if (z >= minZ) { if (!this.map.hasLayer(l)) l.addTo(this.map); } else if (this.map.hasLayer(l)) l.remove(); };
        show(a.group, 11); show(a.rwyLabels, 12); show(a.labels, 14); show(a.fine, 16);
      }
    },
    // Étiquettes des taxiways de l'itinéraire mises en évidence
    markVia() {
      const via = new Set(this.via || []);
      for (const a of Object.values(this.airports)) for (const t of a.twyTips || []) {
        // seulement les étiquettes déjà affichées ; les autres prennent la bonne couleur à leur ouverture
        const el = t.layer.getTooltip() && t.layer.getTooltip().getElement();
        if (el) el.classList.toggle('onroute', via.has(t.ref));
      }
    },
    setTaxiRoute(pts, hold, via) {
      // rien à redessiner si l'itinéraire n'a pas changé
      const key = pts && pts.length ? pts.length + ':' + pts[0].lat.toFixed(5) + ':' + pts[pts.length - 1].lat.toFixed(5) + (via || []).join() : '';
      if (key === this.taxiKey) return;
      this.taxiKey = key;
      this.via = via || [];
      this.markVia();
      if (!this.map) return;
      const L = root.L;
      if (this.taxiLayer) this.taxiLayer.remove();
      if (!pts || pts.length < 2) { this.taxiLayer = null; return; }
      this.taxiLayer = L.layerGroup([
        L.polyline(pts.map((p) => [p.lat, p.lon]), { pane: 'taxi', color: '#e879f9', weight: 5, opacity: 0.9, interactive: false }),
        L.circleMarker([pts[pts.length - 1].lat, pts[pts.length - 1].lon], { pane: 'taxi', radius: 6, color: '#e879f9', fillColor: '#0b1220', fillOpacity: 1, weight: 3 })
          .bindTooltip(hold ? "Point d'arrêt " + hold : "Point d'arrêt", { permanent: true, direction: 'left', offset: [-10, 0], className: 'apt-label hold', pane: 'aptLabels' }),
      ]).addTo(this.map);
    },

    // Trafic IA sur la carte
    setTraffic(list) {
      if (!this.map) return;
      const L = root.L;
      this.trafficMarkers = this.trafficMarkers || new Map();
      const seen = new Set();
      for (const a of list) {
        if (!a.pos) continue;
        seen.add(a.id);
        let m = this.trafficMarkers.get(a.id);
        const label = `${a.cs}${a.onGround ? '' : ' · ' + String(Math.round(a.alt / 100)).padStart(3, '0')}`;
        if (!m) {
          m = L.marker([a.pos.lat, a.pos.lon], { interactive: false, zIndexOffset: 900 }).addTo(this.map);
          m.bindTooltip(label, { permanent: true, direction: 'right', offset: [10, 0], className: 'traffic-label' });
          this.trafficMarkers.set(a.id, m); m._hdg = null;
        }
        m.setLatLng([a.pos.lat, a.pos.lon]);
        if (m._hdg == null || Math.abs(m._hdg - a.hdg) > 2) { m._hdg = a.hdg; m.setIcon(this.trafficIcon(a.hdg)); }
        if (m._label !== label) { m._label = label; m.setTooltipContent(label); }
      }
      for (const [id, m] of this.trafficMarkers) if (!seen.has(id)) { m.remove(); this.trafficMarkers.delete(id); }
    },
    trafficIcon(hdg) {
      return root.L.divIcon({ className: 'plane-icon', iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<svg viewBox="0 0 32 32" width="22" height="22" style="transform:rotate(${Math.round(hdg)}deg)"><path fill="#6cb2ff" stroke="#0b1220" stroke-width="1.4" d="M16 2c1.2 0 2 1.4 2 3v7.5l10 6v3l-10-3V25l3 2.2V30l-5-1.5-5 1.5v-2.8l3-2.2v-6.5l-10 3v-3l10-6V5c0-1.6.8-3 2-3z"/></svg>` });
    },

    // Radar météo (précipitations), image la plus récente, rafraîchie toutes les 5 minutes
    setRadar(frame) {
      if (!this.map) return;
      if (this.radarLayer) { this.radarLayer.remove(); this.radarLayer = null; }
      if (!frame) return;
      this.radarLayer = root.L.tileLayer(`${frame.host}${frame.path}/256/{z}/{x}/{y}/4/1_1.png`, {
        opacity: 0.65, maxNativeZoom: 7, maxZoom: 19, zIndex: 5, attribution: 'Radar © <a href="https://www.rainviewer.com">RainViewer</a>',
      }).addTo(this.map);
    },

    setFollow(on) {
      if (on && !this.follow) this.followZoom = true;
      this.follow = on;
      const c = document.getElementById('chkFollow'); if (c) c.checked = on;
    },

    show(on) {
      this.visible = on;
      if (on && this.map) setTimeout(() => { this.map.invalidateSize(); if (!this.lastFit) this.fitRoute(); }, 30);
    },

    // Route : points SimBrief si disponibles, sinon ligne directe départ → arrivée
    buildRoute(f) {
      const pts = [{ ident: f.dep.icao, lat: f.dep.lat, lon: f.dep.lon, kind: 'apt' }];
      (f.route || []).forEach((x) => {
        if (x.lat == null || x.lon == null) return;
        if (x.ident === f.dep.icao || x.ident === f.arr.icao) return;
        pts.push({ ident: x.ident, lat: x.lat, lon: x.lon, kind: x.sidstar ? 'proc' : 'wpt' });
      });
      pts.push({ ident: f.arr.icao, lat: f.arr.lat, lon: f.arr.lon, kind: 'apt' });
      return pts;
    },

    load(f) {
      if (!this.map) return;
      const L = root.L;
      this.route = this.buildRoute(f);
      this.key = f.callsign + f.dep.icao + f.arr.icao;
      this.trail = []; this.lastTrail = null; this.nextIdx = 1; this.lastFit = 0; this.followZoom = true;
      this.wptLayer.clearLayers();
      [this.routeLine, this.flownLine, this.plane].forEach((l) => l && this.map.removeLayer(l));
      const ll = this.route.map((p) => [p.lat, p.lon]);
      this.routeLine = L.polyline(ll, { color: '#36d399', weight: 3, opacity: 0.85 }).addTo(this.map);
      this.flownLine = L.polyline([], { color: '#6cb2ff', weight: 2, opacity: 0.9, dashArray: '4 4' }).addTo(this.map);
      const steps = new Set((f.steps || []).map((s) => s.fix));
      this.markers = this.route.map((p, i) => {
        const apt = p.kind === 'apt';
        const m = L.circleMarker([p.lat, p.lon], {
          radius: apt ? 6 : 3.5, color: apt ? '#e6edf7' : steps.has(p.ident) ? '#f5b83d' : '#36d399',
          fillColor: apt ? '#0b1220' : '#0b1220', fillOpacity: 1, weight: apt ? 2.5 : 2,
        }).addTo(this.wptLayer);
        m.bindTooltip(p.ident + (steps.has(p.ident) ? ' ▲' : ''), { permanent: true, direction: 'right', offset: [6, 0], className: 'wpt-label' });
        return m;
      });
      this.plane = L.marker([f.dep.lat, f.dep.lon], { icon: this.planeIcon(0), interactive: false, zIndexOffset: 1000 }).addTo(this.map);
      this.fitRoute();
    },

    planeIcon(hdg) {
      return root.L.divIcon({
        className: 'plane-icon', iconSize: [30, 30], iconAnchor: [15, 15],
        html: `<svg viewBox="0 0 32 32" width="30" height="30" style="transform:rotate(${Math.round(hdg)}deg)"><path fill="#f5b83d" stroke="#0b1220" stroke-width="1.2" d="M16 2c1.2 0 2 1.4 2 3v7.5l10 6v3l-10-3V25l3 2.2V30l-5-1.5-5 1.5v-2.8l3-2.2v-6.5l-10 3v-3l10-6V5c0-1.6.8-3 2-3z"/></svg>`,
      });
    },

    fitRoute() {
      if (!this.map || !this.routeLine) return;
      this.lastFit = Date.now();
      this.map.fitBounds(this.routeLine.getBounds(), { padding: [60, 60] });
    },

    // Prochain point : segment le plus proche, en avançant seulement (pas de retour en arrière)
    updateNext(p) {
      const r = this.route; if (r.length < 2) return;
      let best = this.nextIdx - 1, bestD = Infinity;
      for (let i = Math.max(0, this.nextIdx - 2); i < Math.min(r.length - 1, this.nextIdx + 6); i++) {
        const s = segInfo(p, r[i], r[i + 1]);
        if (s.d < bestD) { bestD = s.d; best = i; }
      }
      let next = best + 1;
      // point dépassé (à moins de 1,5 NM) : passer au suivant
      if (next < r.length - 1 && distNm(p, r[next]) < 1.5) next++;
      if (next > this.nextIdx || bestD < 30) this.nextIdx = Math.max(1, next);
    },

    update(f, tel) {
      if (!this.map || !f) return;
      const key = f.callsign + f.dep.icao + f.arr.icao;
      if (key !== this.key) this.load(f);
      const L = root.L, set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      if (!tel || tel.lat == null) { set('mNext', '—'); set('mNextDist', '—'); set('mRemain', '—'); return; }
      const p = { lat: tel.lat, lon: tel.lon };
      this.plane.setLatLng([p.lat, p.lon]);
      this.plane.setIcon(this.planeIcon(tel.hdg || 0));
      if (!this.lastTrail || distNm(this.lastTrail, p) > 0.3) {
        this.trail.push([p.lat, p.lon]); this.lastTrail = p;
        if (this.trail.length > 4000) this.trail.splice(0, 1000);
        this.flownLine.setLatLngs(this.trail);
      }
      this.updateNext(p);
      const r = this.route, nx = r[this.nextIdx];
      if (nx) {
        const d = distNm(p, nx);
        let remain = d;
        for (let i = this.nextIdx; i < r.length - 1; i++) remain += distNm(r[i], r[i + 1]);
        set('mNext', nx.ident); set('mNextDist', Math.round(d) + ' NM'); set('mRemain', Math.round(remain) + ' NM restants');
        this.markers.forEach((m, i) => {
          const el = m.getTooltip() && m.getTooltip().getElement();
          if (el) el.classList.toggle('next', i === this.nextIdx);
        });
      }
      if (this.follow && this.visible) {
        if (this.followZoom) { this.map.setView([p.lat, p.lon], tel.onGround ? 16 : 8, { animate: false }); this.followZoom = false; }
        else this.map.setView([p.lat, p.lon], this.map.getZoom(), { animate: false });
      }
    },
  };

  MapView._rwyEnds = rwyEnds;
  root.MapView = MapView;
})(typeof self !== 'undefined' ? self : this);
