/* ATC — simulateur de démonstration : fait voler un avion fictif
   qui suit les clairances, pour essayer le logiciel sans MSFS. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.DemoSim = factory(root.ATC);
})(typeof self !== 'undefined' ? self : this, function (ATC) {
  'use strict';
  const { distNm, bearing } = ATC.utils;

  function move(p, brg, nm) {
    const R = 3440.065, d = nm / R, b = (brg * Math.PI) / 180;
    const la1 = (p.lat * Math.PI) / 180, lo1 = (p.lon * Math.PI) / 180;
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(b));
    const lo2 = lo1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
  }
  const approach = (v, target, rate) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));

  class DemoSim {
    constructor(flight) {
      this.f = flight;
      this.pos = { lat: flight.dep.lat, lon: flight.dep.lon };
      this.alt = flight.dep.elev || 0;
      this.gs = 0; this.vs = 0; this.onGround = true; this.parkingBrake = true; this.engineOn = false;
      this.com1 = 122.8; this.squawk = '2000'; this.timer = 0; this.landedAt = null;
    }

    step(dt, eng) {
      const f = this.f, ph = eng.phase;
      const dArr = distNm(this.pos, f.arr);
      const hdg = bearing(this.pos, f.arr);
      this.timer += dt;

      if (['PRE', 'CLEARED'].includes(ph)) { this.gs = 0; }
      else if (ph === 'STARTUP') { this.engineOn = true; this.parkingBrake = false; this.gs = 0; }
      else if (ph === 'TAXI_OUT') { this.engineOn = true; this.gs = 14; }
      else if (['HOLDING', 'LINEUP'].includes(ph)) { this.gs = 0; }
      else if (ph === 'VACATING') { this.gs = approach(this.gs, 15, 8 * dt); }
      else if (ph === 'TAXI_IN') {
        this.gs = approach(this.gs, 0, 2 * dt);
        if (this.gs === 0) { this.parkingBrake = true; this.engineOn = false; }
      } else if (ph === 'DONE') { this.gs = 0; }
      else {
        // en vol (ou course au décollage / atterrissage)
        if (this.onGround && ph === 'TAKEOFF') {
          this.gs = approach(this.gs, 160, 6 * dt);
          if (this.gs > 145) this.onGround = false;
        } else if (!this.onGround) {
          let target = eng.cleared != null ? eng.cleared : this.alt;
          const elev = f.arr.elev || 0;
          if (['FINAL', 'TWR_CHECKIN', 'LANDING'].includes(ph) && dArr < 12) {
            const gp = elev + dArr * 318;
            target = ph === 'LANDING' ? gp : Math.max(gp, elev + 900);
          }
          const climbRate = 2500 / 60, descRate = (['FINAL', 'TWR_CHECKIN', 'LANDING'].includes(ph) ? 1200 : 2200) / 60;
          const prev = this.alt;
          this.alt = this.alt < target ? Math.min(target, this.alt + climbRate * dt) : Math.max(target, this.alt - descRate * dt);
          this.vs = ((this.alt - prev) / dt) * 60;
          const cruiseGs = (this.alt < 10500 || (target < 10500 && this.alt < 13000)) ? 245 : 430;
          const finalGs = ['FINAL', 'TWR_CHECKIN', 'LANDING'].includes(ph) ? 150 : cruiseGs;
          this.gs = approach(this.gs, finalGs, 8 * dt);
          if (ph === 'LANDING' && (dArr < 0.3 || this.alt <= elev + 5)) { this.onGround = true; this.alt = elev; this.vs = 0; }
        } else {
          // posé : décélération
          this.gs = approach(this.gs, 10, 5 * dt);
        }
        if (dArr > 0.2 || this.onGround) this.pos = move(this.pos, hdg, (this.gs * dt) / 3600);
      }
      if (ph === 'TAXI_OUT' || ph === 'VACATING' || ph === 'TAXI_IN') this.pos = this.pos; // roulage : position figée
      return this.telemetry();
    }

    telemetry() {
      const groundElev = this.onGround ? this.alt : (this.alt > (this.f.arr.elev || 0) ? Math.min(this.alt, Math.max(this.f.dep.elev || 0, this.f.arr.elev || 0)) : this.alt);
      return {
        connected: true, demo: true,
        lat: this.pos.lat, lon: this.pos.lon,
        alt: this.alt, agl: this.onGround ? 0 : Math.max(0, this.alt - groundElev),
        ias: this.alt > 10000 ? this.gs * 0.7 : this.gs, gs: this.gs, vs: this.vs || 0,
        hdg: bearing(this.pos, this.f.arr), onGround: this.onGround,
        com1: this.com1, squawk: this.squawk, parkingBrake: this.parkingBrake, engineOn: this.engineOn,
        title: 'Avion de démonstration',
      };
    }
  }
  return DemoSim;
});
