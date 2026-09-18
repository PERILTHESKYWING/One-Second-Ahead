/* Core engine: math/DOM helpers, the save system, theme + color palettes, the audio engine, and the base (Chamber 09) level and enemy stat tables. */
"use strict";
/* ===================================================================
   ONE SECOND AHEAD
   Single file. Procedural art, procedural music, no assets.
   =================================================================== */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
const rint = (a, b) => Math.floor(rnd(b + 1, a));
const pick = (a) => a[(Math.random() * a.length) | 0];
const chance = (p) => Math.random() < p;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const approach = (v, t, k, dt) => lerp(v, t, 1 - Math.exp(-k * dt));
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));
const angDiff = (a, b) => ((a - b + Math.PI * 3) % TAU) - Math.PI;
/* distance from point p to segment a->b, so fast projectiles can't tunnel */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

/* ---------------- save ---------------------------------------------- */
const DEFAULT_SAVE = {
  shards: 0, bestScore: 0, bestLevel: 0, bestWave: 0, bestTime: 0, runs: 0, seen: {}, booted: 0,
  upgrades: {},
  cosmetics: {
    owned: { trail_std: 1, skin_std: 1, pal_dark: 1, pal_light: 1, boom_std: 1 },
    trail: "trail_std", skin: "skin_std", palette: "pal_dark", boom: "boom_std",
  },
  settings: { master: .8, music: .55, sfx: .9, shake: 1, grain: 1, bloom: 1, boot: 1, theme: "dark",
    autofire: 0, aimassist: 0, brightness: .5, reduced: 0 },
};
let SAVE = JSON.parse(JSON.stringify(DEFAULT_SAVE));
let storageOK = true;
try {
  const raw = localStorage.getItem("osa.save.v3") || localStorage.getItem("osa.save.v2");
  if (raw) SAVE = Object.assign({}, DEFAULT_SAVE, JSON.parse(raw));
  SAVE.settings = Object.assign({}, DEFAULT_SAVE.settings, SAVE.settings || {});
  SAVE.upgrades = SAVE.upgrades || {}; SAVE.seen = SAVE.seen || {};
  SAVE.cosmetics = Object.assign({}, DEFAULT_SAVE.cosmetics, SAVE.cosmetics || {});
  SAVE.cosmetics.owned = Object.assign({}, DEFAULT_SAVE.cosmetics.owned, SAVE.cosmetics.owned || {});
} catch (e) { storageOK = false; }
function persist() { if (!storageOK) return; try { localStorage.setItem("osa.save.v3", JSON.stringify(SAVE)); } catch (e) { storageOK = false; } }
/* ---- the pilot arrives finished ---------------------------------------
   The shop used to sell permanent stat levels, so every run began with a
   half-built hull and the first hour of the game was spent buying back the
   numbers. It doesn't any more: every one of those upgrades is granted at
   maximum from the first run, and the shop sells ABILITIES instead — a
   loadout choice rather than a power ladder (see 16-abilities.js).

   This is the single source of truth for what "maxed" means. It is keyed
   the same way the old shop entries were, so every `lvlOf(...)` call site
   downstream — baseMods(), makePlayer(), the dash and echo maths — keeps
   working untouched and simply reads a full tank.

   Everything on the other side of the fight was raised to meet it: see
   ENEMY_HP_BUFF and the wave budget in 08-run-and-player.js. */
const BASELINE = {
  /* chassis */ hp: 5, regen: 4, shield: 2, dashCd: 3,
  /* weapon  */ pulse: 5, rate: 5, dashDmg: 3, crit: 3,
  /* echo    */ echoCharge: 2, echoLife: 3, echoDmg: 3, collect: 4,
  /* modules */ swapWave: 2, swapFree: 1, decoyGuard: 2, traceRead: 1, brake: 1, salvage: 2,
};
const lvlOf = (id) => (BASELINE[id] != null ? BASELINE[id] : (SAVE.upgrades[id] || 0));
/* equipped cosmetic ids, read every frame by the renderers */
const COS = { trail: "trail_std", skin: "skin_std", boom: "boom_std" };
function syncCosmetics() {
  const c = SAVE.cosmetics;
  COS.trail = c.owned[c.trail] ? c.trail : "trail_std";
  COS.skin = c.owned[c.skin] ? c.skin : "skin_std";
  COS.boom = c.owned[c.boom] ? c.boom : "boom_std";
}
const owns = (id) => !!SAVE.cosmetics.owned[id];

/* ---------------- colour + theme ------------------------------------ */
/* ---- colour helpers, memoised ----------------------------------------
   These are called several times per enemy per frame (every ART function
   shades its own body, rim and highlight out of the base colour, and ecol()
   re-derives the themed colour for each one). Unmemoised, each call split a
   string into a fresh array, mapped it to a second array, and concatenated a
   new string — hundreds of throwaway allocations a frame, which showed up as
   steady GC pressure under load.

   The inputs are drawn from a fixed vocabulary — 36 enemy colours, a handful
   of multipliers, five themes — so the cache is small and saturates within a
   second of play. It is cleared on a theme change, since the theme is baked
   into ecol()'s results. */
const rgbCache = new Map();
function rgbOf(s) {
  let v = rgbCache.get(s);
  if (!v) { v = s.split(",").map(Number); rgbCache.set(s, v); }
  return v;
}
let shadeCache = new Map();
function shade(s, mul, mix, mixCol) {
  const key = mix ? s + "|" + mul + "|" + mix + "|" + mixCol : s + "|" + mul;
  let out = shadeCache.get(key);
  if (out !== undefined) return out;
  const v = rgbOf(s);
  let r = v[0] * mul, g = v[1] * mul, b = v[2] * mul;
  if (mix) { r = lerp(r, mixCol[0], mix); g = lerp(g, mixCol[1], mix); b = lerp(b, mixCol[2], mix); }
  out = Math.round(clamp(r, 0, 255)) + "," + Math.round(clamp(g, 0, 255)) + "," + Math.round(clamp(b, 0, 255));
  if (shadeCache.size > 4000) shadeCache.clear();
  shadeCache.set(key, out);
  return out;
}
const THEMES = {
  dark: {
    id: "dark", dim: 1, label: "Chamber standard", ink: "233,238,252", deep: "4,5,12",
    grid: "120,170,255", gridA: .07, gridA2: .15,
    hull: "234,254,255", hullDark: "120,150,190", core: "111,242,255",
    echo: "176,125,255", shard: "255,214,138", shadow: "0,0,0", shadowA: .45,
    bloom: .52, rim: "255,255,255", rimA: .5, enemyMul: 1, enemyMix: 0, mixCol: [255, 255, 255],
    dust: "180,215,255", dustA: .5, outline: 0, hazard: "255,90,124",
  },
  light: {
    id: "light", dim: 0, label: "Daylight", ink: "22,29,47", deep: "236,238,244",
    grid: "70,105,170", gridA: .085, gridA2: .17,
    hull: "26,42,66", hullDark: "12,22,40", core: "13,139,166",
    echo: "111,69,207", shard: "168,106,18", shadow: "40,60,110", shadowA: .17,
    bloom: .17, rim: "255,255,255", rimA: .75, enemyMul: .78, enemyMix: .12, mixCol: [20, 30, 60],
    dust: "90,120,180", dustA: .35, outline: .5, hazard: "207,51,87",
  },
  synthwave: {
    id: "synthwave", dim: 1, label: "Synthwave '84", ink: "255,233,251", deep: "12,4,26",
    grid: "255,78,205", gridA: .12, gridA2: .3,
    hull: "255,240,252", hullDark: "126,52,150", core: "54,249,246",
    echo: "255,78,205", shard: "255,204,77", shadow: "40,0,50", shadowA: .5,
    bloom: .34, rim: "255,255,255", rimA: .55, enemyMul: .88, enemyMix: .26, mixCol: [255, 78, 205],
    dust: "255,140,230", dustA: .6, outline: 0, hazard: "255,46,99",
    bg: ["#170727", "#05010f"], tint: "255,78,205", cloudA: .035,
  },
  gameboy: {
    id: "gameboy", dim: 1, label: "GameBoy green", ink: "200,222,106", deep: "11,27,6",
    grid: "155,188,15", gridA: .1, gridA2: .2,
    hull: "204,226,110", hullDark: "48,98,48", core: "155,188,15",
    echo: "139,172,15", shard: "215,232,148", shadow: "5,14,3", shadowA: .55,
    bloom: .2, rim: "215,232,148", rimA: .5, enemyMul: .8, enemyMix: .82, mixCol: [110, 150, 20],
    dust: "155,188,15", dustA: .5, outline: .45, hazard: "215,232,148",
    bg: ["#13240b", "#050a03"], tint: "155,188,15", cloudA: .03,
  },
  solar: {
    id: "solar", dim: 1, label: "Solar flare", ink: "255,232,207", deep: "16,6,4",
    grid: "255,157,61", gridA: .09, gridA2: .2,
    hull: "255,244,226", hullDark: "150,64,20", core: "255,157,61",
    echo: "255,209,102", shard: "255,241,201", shadow: "30,6,0", shadowA: .5,
    bloom: .3, rim: "255,255,240", rimA: .6, enemyMul: .84, enemyMix: .38, mixCol: [255, 120, 40],
    dust: "255,180,110", dustA: .55, outline: 0, hazard: "255,59,48",
    bg: ["#250a03", "#0a0301"], tint: "255,157,61", cloudA: .03,
  },
};
let TH = THEMES.dark;
/* ecol() is the hottest of the lot — once per enemy per frame at minimum,
   and several times inside most ART functions. Its result depends only on
   the base colour and the theme, so it gets its own direct map. */
let ecolCache = new Map();
function ecol(base) {
  let v = ecolCache.get(base);
  if (v === undefined) { v = shade(base, TH.enemyMul, TH.enemyMix, TH.mixCol); ecolCache.set(base, v); }
  return v;
}
const PAL_ORDER = ["dark", "light", "synthwave", "gameboy", "solar"];
function ownedPalettes() { return PAL_ORDER.filter((id) => owns("pal_" + id)); }
function nextPalette() {
  const own = ownedPalettes();
  const i = own.indexOf(TH.id);
  return own[(i + 1) % own.length] || "dark";
}
function setTheme(id, quiet) {
  TH = THEMES[id] || THEMES.dark;
  SAVE.settings.theme = TH.id;
  SAVE.cosmetics.palette = "pal_" + TH.id;
  document.body.dataset.theme = TH.id;
  const sw = $("#themeSwap");
  if (sw) sw.querySelector("span").textContent = THEMES[nextPalette()].label;
  gradCache = {};
  ecolCache = new Map();   /* the theme is baked into every cached colour */
  shadeCache = new Map();
  if (typeof glowCache !== "undefined") glowCache.clear();
  backdropDirty = true;
  persist();
  if (!quiet) { drawBestiary(); Audio_.ui(); }
}

/* ---------------- audio --------------------------------------------- */
const SCALES = {
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pent: [0, 3, 5, 7, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
};
const Audio_ = {
  ctx: null, master: null, musicBus: null, sfxBus: null, noise: null, verbGain: null,
  started: false, nextT: 0, step: 0, intensity: 0, target: 0,
  key: 0, scale: SCALES.aeolian, prog: [0, -3, -5, -7], voice: 0,
  motif: [], section: 0, lastBar: -1, phrase: 0, fillBar: false,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -15; comp.ratio.value = 8; comp.attack.value = .003; comp.release.value = .25;
    this.master.connect(comp).connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain();
    this.sfxBus = this.ctx.createGain();
    const verb = this.ctx.createConvolver();
    verb.buffer = this.makeIR(2.4, 2.4);
    this.verbGain = this.ctx.createGain(); this.verbGain.gain.value = .3;
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    this.musicBus.connect(this.verbGain); this.sfxBus.connect(this.verbGain);
    this.verbGain.connect(verb).connect(this.master);
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = b;
    this.applyVolumes();
    this.started = true;
    this.nextT = this.ctx.currentTime + .1;
    this.newMotif();
  },
  makeIR(dur, decay) {
    const rate = this.ctx.sampleRate, len = (rate * dur) | 0;
    const b = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return b;
  },
  applyVolumes() {
    if (!this.ctx) return;
    const s = SAVE.settings;
    this.master.gain.value = s.master;
    this.musicBus.gain.value = s.music * .62;
    this.sfxBus.gain.value = s.sfx * .9;
  },
  resume() { if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
  tone(o) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (o.delay || 0);
    const osc = this.ctx.createOscillator(), g = this.ctx.createGain();
    osc.type = o.type || "sine";
    const f0 = o.freq || 440, f1 = o.to || f0, dur = o.dur || .2;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    if (o.detune) osc.detune.value = o.detune;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.gain == null ? .3 : o.gain), t + (o.attack || .006));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    let node = osc;
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = o.filter; f.frequency.value = o.cutoff || 1200; f.Q.value = o.q || 1;
      if (o.cutoffTo) f.frequency.exponentialRampToValueAtTime(o.cutoffTo, t + dur);
      node.connect(f); node = f;
    }
    node.connect(g).connect(o.bus || this.sfxBus);
    osc.start(t); osc.stop(t + dur + .05);
  },
  noiseHit(o) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (o.delay || 0), dur = o.dur || .2;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true; src.playbackRate.value = o.rate || 1;
    const f = this.ctx.createBiquadFilter();
    f.type = o.filter || "bandpass"; f.frequency.setValueAtTime(o.freq || 900, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t + dur);
    f.Q.value = o.q || 1.1;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(.0002, o.gain == null ? .3 : o.gain), t + (o.attack || .004));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f).connect(g).connect(o.bus || this.sfxBus);
    src.start(t); src.stop(t + dur + .05);
  },
  /* cues */
  shoot(p) { this.tone({ type: "square", freq: 640 * p, to: 250 * p, dur: .06, gain: .055, filter: "lowpass", cutoff: 2400 }); this.noiseHit({ freq: 2400, to: 800, dur: .045, gain: .035 }); },
  /* A rate gate on the hot effects. Every call builds Web Audio nodes, and
     a compound damage build (explosive rounds through a pack, a chain arc,
     a burning trail) can ask for dozens of identical booms in one frame —
     which sounds like one boom anyway and costs like dozens. Returns false
     if this effect fired too recently to bother firing again. */
  _gate: {},
  rateOk(name, gap) {
    const t = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    if (this._gate[name] != null && t - this._gate[name] < gap) return false;
    this._gate[name] = t;
    return true;
  },
  hit() { if (!this.rateOk("hit", .035)) return; this.noiseHit({ freq: 1600, to: 520, dur: .055, gain: .06, q: 1.5 }); },
  deflect() { this.tone({ type: "triangle", freq: 1500, to: 2500, dur: .09, gain: .08 }); },
  swap() {
    this.tone({ type: "triangle", freq: 880, to: 1720, dur: .11, gain: .085 });
    this.tone({ type: "sine", freq: 460, to: 150, dur: .26, gain: .075 });
    this.noiseHit({ freq: 2800, to: 520, dur: .2, gain: .06, q: 2.2 });
  },
  lock(p) { this.tone({ type: "square", freq: 220 * (p || 1), to: 340 * (p || 1), dur: .09, gain: .035, filter: "lowpass", cutoff: 1800 }); },
  keyTick() { this.tone({ type: "square", freq: 1500 + Math.random() * 500, to: 900, dur: .022, gain: .022, filter: "lowpass", cutoff: 2600 }); },
  kill(n) { const p = Math.pow(1.0595, Math.min(n, 12) * 2); this.tone({ type: "triangle", freq: 320 * p, to: 760 * p, dur: .13, gain: .11 }); this.noiseHit({ freq: 900, to: 180, dur: .15, gain: .1, q: .7 }); },
  boom() { if (!this.rateOk("boom", .07)) return; this.noiseHit({ freq: 420, to: 60, dur: .5, gain: .26, q: .5, filter: "lowpass" }); this.tone({ type: "sine", freq: 120, to: 34, dur: .45, gain: .24 }); },
  dash() { this.noiseHit({ freq: 380, to: 3200, dur: .19, gain: .1, q: 2.2 }); this.tone({ type: "sawtooth", freq: 190, to: 620, dur: .15, gain: .05, filter: "lowpass", cutoff: 1500 }); },
  echo() { [0, .05, .1].forEach((d, i) => this.tone({ type: "sine", freq: 440 + i * 220, to: 900 + i * 260, dur: .5, gain: .075, delay: d })); },
  surge() { this.tone({ type: "sawtooth", freq: 90, to: 280, dur: .9, gain: .14, filter: "lowpass", cutoff: 900 }); [0, .1, .2].forEach((d, i) => this.tone({ type: "triangle", freq: 392 * (i + 1), dur: .5, gain: .045, delay: d })); },
  hurt() { this.tone({ type: "sawtooth", freq: 230, to: 70, dur: .22, gain: .12, filter: "lowpass", cutoff: 700 }); },
  pickup() { this.tone({ type: "sine", freq: 1200, to: 1800, dur: .08, gain: .05 }); },
  ui(up) { this.tone({ type: "sine", freq: up === false ? 520 : 760, to: up === false ? 420 : 880, dur: .05, gain: .04 }); },
  confirm() { this.tone({ type: "triangle", freq: 540, to: 1080, dur: .16, gain: .09 }); },
  buy() { [0, .06, .12].forEach((d, i) => this.tone({ type: "triangle", freq: 660 * Math.pow(1.26, i), dur: .16, gain: .07, delay: d })); },
  deny() { this.tone({ type: "square", freq: 190, to: 120, dur: .13, gain: .06 }); },
  levelIn(i) { [0, .12, .24, .42].forEach((d, k) => this.tone({ type: "triangle", freq: 262 * Math.pow(2, [0, 4, 7, 12][k] / 12), dur: .9, gain: .07, delay: d, filter: "lowpass", cutoff: 2200 })); },
  waveIn() { this.tone({ type: "sine", freq: 150, to: 300, dur: .6, gain: .1 }); },
  death() { this.tone({ type: "sawtooth", freq: 440, to: 40, dur: 1.6, gain: .2, filter: "lowpass", cutoff: 1400 }); this.noiseHit({ freq: 1800, to: 80, dur: 1.5, gain: .14, q: .6 }); },

  /* --- generative score ------------------------------------------- */
  setPalette(level) {
    this.key = level.key || 0;
    this.scale = SCALES[level.mode || "aeolian"];
    this.prog = level.prog || [0, -3, -5, -7];
    this.voice = level.voice || 0;
    this.newMotif();
  },
  newMotif() {
    const len = pick([3, 4, 4, 5, 6]);
    const m = [];
    let deg = rint(0, 3);
    for (let i = 0; i < len; i++) {
      deg = clamp(deg + pick([-2, -1, -1, 1, 1, 2, 3]), -3, 8);
      m.push({ d: deg, hold: pick([2, 2, 3, 4, 4, 6]), rest: chance(.16) });
    }
    this.motif = m;
    this.phrase = 0;
  },
  transformMotif() {
    const m = this.motif;
    const kind = rint(0, 3);
    if (kind === 0) this.motif = m.map((n) => ({ d: n.d + pick([-3, 2, 3, 4]), hold: n.hold, rest: n.rest }));
    else if (kind === 1) this.motif = m.slice().reverse();
    else if (kind === 2) this.motif = m.map((n) => ({ d: -n.d + 4, hold: n.hold, rest: n.rest }));
    else this.motif = m.map((n) => ({ d: n.d, hold: pick([2, 3, 4, 6]), rest: chance(.2) }));
  },
  note(deg, oct) {
    const s = this.scale, n = s.length;
    let i = deg % n; if (i < 0) i += n;
    const o = Math.floor(deg / n) + (oct || 0);
    return 55 * Math.pow(2, (this.key + s[i]) / 12 + o);
  },
  tick(dt) {
    if (!this.ctx || SAVE.settings.music <= 0) return;
    this.intensity = approach(this.intensity, this.target, 1.1, dt);
    const now = this.ctx.currentTime;
    if (this.nextT < now - .6) this.nextT = now + .05;
    const bpm = 76 + this.intensity * 30;
    const sp = 60 / bpm / 4;
    while (this.nextT < now + .25) { this.playStep(this.nextT, this.step++); this.nextT += sp; }
  },
  playStep(t, s) {
    const d = Math.max(0, t - this.ctx.currentTime);
    const bus = this.musicBus;
    const b16 = s % 16, bar = (s / 16) | 0, inten = this.intensity;
    if (bar !== this.lastBar) {
      this.lastBar = bar;
      if (bar % 8 === 0) { this.section = rint(0, 3); if (chance(.5)) this.newMotif(); }
      else if (bar % 4 === 0) { this.transformMotif(); this.phrase++; }
      this.fillBar = bar % 8 === 7;
    }
    const chordRoot = this.prog[((bar / 2) | 0) % this.prog.length];
    const sec = this.section;
    const soft = inten < .3;

    /* pad: swells at bar start, chord tones */
    if (b16 === 0 && (sec !== 3 || soft)) {
      const dur = 3.4;
      [0, 2, 4].forEach((iv, k) => {
        this.tone({
          type: this.voice === 1 ? "triangle" : "sawtooth",
          freq: this.note(chordRoot + iv, k === 0 ? 1 : 2),
          dur, gain: .022 + inten * .012, attack: .9, delay: d,
          filter: "lowpass", cutoff: 300 + inten * 700, detune: k * 4 - 4, bus,
        });
      });
    }
    /* bass */
    if (inten > .08) {
      const pat = [0, 6, 10, 14];
      const on = sec === 1 ? (b16 % 4 === 0) : pat.indexOf(b16) >= 0;
      if (on && (b16 !== 10 || chance(.7))) {
        this.tone({ type: "square", freq: this.note(chordRoot + (b16 === 14 && chance(.4) ? 2 : 0), 0), dur: .26,
          gain: .05 + inten * .02, delay: d, filter: "lowpass", cutoff: 240 + inten * 260, bus });
      }
    }
    /* motif line */
    if (inten > .22 && sec !== 3) {
      let acc = 0, idx = 0, hit = -1;
      for (let i = 0; i < this.motif.length; i++) { if (acc === b16) { hit = i; break; } acc += this.motif[i].hold; if (acc > 15) break; idx++; }
      if (hit >= 0) {
        const n = this.motif[hit];
        if (!n.rest && chance(.86)) {
          const oct = sec === 2 ? 2 : 1;
          this.tone({ type: this.voice === 2 ? "square" : "triangle", freq: this.note(chordRoot + n.d, oct),
            dur: .12 + n.hold * .05, gain: .035 + inten * .022, delay: d,
            filter: "lowpass", cutoff: 1400 + inten * 2600, bus });
          if (sec === 2 && chance(.3)) this.tone({ type: "sine", freq: this.note(chordRoot + n.d + 2, 3), dur: .5, gain: .014, delay: d + .06, bus });
        }
      }
    }
    /* counter arp when things are hot */
    if (inten > .62 && sec === 0 && b16 % 2 === 1 && chance(.55)) {
      this.tone({ type: "triangle", freq: this.note(chordRoot + pick([0, 2, 4, 6]), 2), dur: .1, gain: .018, delay: d, bus });
    }
    /* percussion */
    if (inten > .3) {
      const kick = sec === 3 ? [0, 4, 8, 12] : sec === 1 ? [0, 6, 10] : [0, 10];
      if (kick.indexOf(b16) >= 0) this.tone({ type: "sine", freq: 130, to: 42, dur: .17, gain: .12, delay: d, bus });
      if (b16 === 8 || (this.fillBar && b16 > 11 && chance(.5)))
        this.noiseHit({ freq: 1900, to: 700, dur: .11, gain: .045 + inten * .02, q: .9, delay: d, bus });
      if (inten > .5 && b16 % 2 === 0 && chance(.55))
        this.noiseHit({ freq: 7000, to: 5200, dur: .035, gain: .014 + inten * .012, q: 2, delay: d, bus });
    }
  },
};

/* ---------------- content: levels ------------------------------------ */
const CH09_LEVELS = [
  { name: "The Shallows", hook: "Shallow water. Two kinds of trouble, and both of them come straight at you.",
    waves: 4, types: ["husk", "dart"], intro: ["husk", "dart"], env: "motes", waveTemplates: ["pincer", "swarmElite"],
    key: 0, mode: "aeolian", prog: [0, -3, -5, -3], voice: 0,
    dark: ["#101a36", "#050914"], light: ["#f6f9ff", "#dde6f6"], accent: "111,242,255" },
  { name: "Iron Garden", hook: "Heavier things grow here. The plated ones are only armoured at the front.",
    waves: 4, types: ["husk", "colossus", "bulwark", "howitzer"], intro: ["colossus", "bulwark", "howitzer"], env: "pillars", waveTemplates: ["swarmElite", "surround"],
    key: 3, mode: "dorian", prog: [0, 2, -3, -5], voice: 1,
    dark: ["#2a1c12", "#0d0806"], light: ["#fdf6ec", "#eadfcd"], accent: "255,168,92" },
  { name: "Spore Field", hook: "Everything in this room divides when it dies. Give it room, or don't kill it yet.",
    waves: 4, types: ["husk", "bloom", "spore", "broodmother"], intro: ["bloom", "spore", "broodmother"], env: "spores", waveTemplates: ["surround", "pincer"],
    key: -2, mode: "pent", prog: [0, -5, 2, -3], voice: 2,
    dark: ["#0c2a1e", "#04120c"], light: ["#eefaf1", "#d3e9d9"], accent: "126,240,168" },
  { name: "The Long Range", hook: "They stopped walking to you. Now they reach, and standing still is the mistake.",
    waves: 4, types: ["dart", "weaver", "needle", "hexer"], intro: ["weaver", "needle", "hexer"], env: "rain", waveTemplates: ["pincer", "swarmElite"],
    key: 5, mode: "phrygian", prog: [0, 1, -4, -5], voice: 0,
    dark: ["#2b0f2a", "#100510"], light: ["#fdf0fb", "#e8d6ea"], accent: "255,122,217" },
  { name: "Mirror Line", hook: "Something here has been watching how you move. It has been taking notes.",
    waves: 4, types: ["husk", "bulwark", "mimic", "mirror", "revenant"], intro: ["mimic", "mirror", "revenant"], env: "mirror", waveTemplates: ["surround", "swarmElite", "pincer"],
    key: 7, mode: "lydian", prog: [0, 4, 2, -3], voice: 1,
    dark: ["#161436", "#070613"], light: ["#f4f2ff", "#dedbf3"], accent: "176,125,255" },
  { name: "The Fold", hook: "All of it at once, and then the thing that has been folding the room around you.",
    waves: 3, boss: true, types: ["husk", "dart", "bloom", "weaver", "mimic", "warden", "revenant"], intro: ["warden", "paradox"], env: "fold", waveTemplates: ["pincer", "surround"],
    key: 0, mode: "aeolian", prog: [0, -1, -5, -7], voice: 2,
    dark: ["#1d1030", "#08040f"], light: ["#f7f2fb", "#e2d9ec"], accent: "216,150,255" },
];
let LEVELS = CH09_LEVELS;

/* ---------------- content: enemies -----------------------------------
   `wt` is mass, and it only does one thing: divide the distance a shove
   moves the body (see shoveEnemy in 09-enemies-and-render.js). 1.0 is the
   reference — a Weaver takes a hit at face value. A Mote at .35 is thrown
   nearly three times as far by the same pulse; a Trench at 3.6 barely
   rocks. Bosses sit at 9-12, which is "immovable" without being a special
   case in the code. Weight is deliberately not tied to hp or radius: a
   Mirror is as tough as a Warden and gets kicked around like chaff. */
const EN = {
  husk: { hp: 34, sp: 96, r: 12, dmg: 15, cost: 1, wt: 0.8, score: 10, shards: 1, col: "255,90,124",
    label: "Husk", note: "Walks straight at whatever is nearest, then coils and leaps the last stretch. Sidestep the leap." },
  dart: { hp: 52, sp: 66, r: 13, dmg: 24, cost: 2, wt: 0.9, score: 18, shards: 1, col: "255,146,72",
    label: "Dart", note: "Winds up and lunges twice in a row. Step sideways, not backwards, and stay moving after the first." },
  bloom: { hp: 32, sp: 122, r: 13, dmg: 0, cost: 2, wt: 0.7, score: 16, shards: 1, col: "255,106,90",
    label: "Bloom", note: "Runs in grinning and opens. The blast hurts its neighbours, and the ground stays burning after." },
  colossus: { hp: 150, sp: 46, r: 23, dmg: 30, cost: 4, wt: 3.2, score: 48, shards: 3, col: "214,96,255",
    label: "Colossus", note: "Marks a wide lane, charges down it, and slams a shockwave out at the end of the run." },
  weaver: { hp: 52, sp: 68, r: 14, dmg: 14, cost: 3, wt: 1, score: 26, shards: 2, col: "255,122,217",
    label: "Weaver", note: "Keeps its distance and lobs slow orbs that split into four when they die out." },
  spore: { hp: 70, sp: 74, r: 16, dmg: 18, cost: 3, wt: 1.1, score: 24, shards: 2, col: "126,240,168",
    label: "Spore", note: "Splits into three smaller ones when it dies. Kill it where you have room." },
  mote: { hp: 17, sp: 142, r: 8, dmg: 10, cost: 0, wt: 0.35, score: 5, shards: 0, col: "168,246,196",
    label: "Mote", note: "What is left of a spore. Fast, fragile, and never alone." },
  bulwark: { hp: 124, sp: 58, r: 18, dmg: 26, cost: 4, wt: 2.6, score: 44, shards: 3, col: "143,166,255",
    label: "Bulwark", note: "Its shield doesn't just eat your pulses, it throws them back. Get behind it or dash through it." },
  needle: { hp: 40, sp: 48, r: 12, dmg: 30, cost: 3, wt: 0.95, score: 30, shards: 2, col: "255,72,96",
    label: "Needle", note: "Draws a line, fires along it, then fires a second time a beat later at a new angle." },
  mimic: { hp: 78, sp: 0, r: 13, dmg: 20, cost: 4, wt: 1, score: 55, shards: 3, col: "196,150,255",
    label: "Mimic", note: "Repeats the path you walked a second and a half ago, and fires in bursts of three while it does." },
  mirror: { hp: 88, sp: 210, r: 13, dmg: 22, cost: 4, wt: 0.75, score: 55, shards: 3, col: "225,235,255",
    label: "Mirror", note: "Holds the exact opposite of your position and fires a cross, not a shot. Crossing the middle meets it." },
  warden: { hp: 158, sp: 64, r: 19, dmg: 22, cost: 5, wt: 2.4, score: 68, shards: 4, col: "120,204,255",
    label: "Warden", note: "Hooks you on a chain. Stray outside the leash ring and it drags you back, tearing the whole way." },
  revenant: { hp: 104, sp: 70, r: 16, dmg: 38, cost: 5, wt: 1.4, score: 78, shards: 4, col: "186,124,255",
    label: "Revenant", note: "Blinks to where you are about to be and cleaves a wide arc. Standing still is what kills you." },
  howitzer: { hp: 128, sp: 42, r: 20, dmg: 32, cost: 4, wt: 2, score: 66, shards: 3, col: "255,186,88",
    label: "Howitzer", note: "Stands far off and drops three shells on ground you were heading for. They leave the floor on fire." },
  hexer: { hp: 112, sp: 36, r: 17, dmg: 0, cost: 4, wt: 1.6, score: 72, shards: 4, col: "255,96,206",
    label: "Hexer", note: "Opens three beams and rotates them through the whole room. There is always a gap — find it early." },
  broodmother: { hp: 210, sp: 40, r: 24, dmg: 26, cost: 6, wt: 3, score: 96, shards: 5, col: "150,255,160",
    label: "Broodmother", note: "Never stops laying. Ignore her and the room fills with motes until you cannot move." },
  paradox: { hp: 2100, sp: 52, r: 46, dmg: 38, cost: 0, wt: 12, score: 900, shards: 45, col: "204,132,255",
    label: "Paradox", note: "The thing underneath the level. Three tempers, rotating purge lines, and it calls the others in." },
};

/* =====================================================================
   BRANCH ARCHIVE — timelines, their inhabitants, their lore
   =====================================================================
   Chamber 09 was never a stress chamber. It is a splice head. Every
   "level" is a recording of a branch the Concordance already pruned,
   and CHRONO-01 is the blade they run down the middle of it.
   ===================================================================== */

Object.assign(EN, {
  /* ---- GLASSFALL · branch 02 delta — the instant that refused to end ---- */
  facet: { hp: 44, sp: 78, r: 13, dmg: 16, cost: 2, wt: 0.85, score: 22, shards: 1, col: "168,232,255",
    label: "Facet", note: "A cut-glass tetrahedron. It drifts, catches your light, and refracts it back as three thin rays." },
  prism: { hp: 118, sp: 52, r: 17, dmg: 22, cost: 4, wt: 1.9, score: 46, shards: 3, col: "214,246,255",
    label: "Prism", note: "A turning column of clear glass. Its lit face throws your pulses back. Shoot the dark side, or dash the column." },
  rime: { hp: 46, sp: 138, r: 12, dmg: 18, cost: 2, wt: 0.6, score: 24, shards: 1, col: "150,214,255",
    label: "Rime", note: "Fast, and it lays cold behind it. The trail doesn't hurt — it just makes you slow enough for everything else." },
  silica: { hp: 176, sp: 40, r: 21, dmg: 26, cost: 5, wt: 2.8, score: 64, shards: 4, col: "196,226,248",
    label: "Silica", note: "A carrier hull. It plants standing pillars that cross the room with slow beams. Break the pillars or break the carrier." },
  kelvin: { hp: 132, sp: 34, r: 17, dmg: 0, cost: 4, wt: 1.8, score: 70, shards: 4, col: "120,236,240",
    label: "Kelvin", note: "Drops a ring of absolute cold and closes it. The ring is the damage — the middle is safe until it isn't." },
  stillhour: { hp: 2600, sp: 44, r: 44, dmg: 36, cost: 0, wt: 12, score: 1200, shards: 60, col: "186,238,255",
    label: "The Still Hour", note: "A glass orrery the size of the room. It stopped this branch at 11:59 and has been holding it there ever since." },

  /* ---- EMBERWAKE · branch 05 rho — the timeline that spent its future --- */
  filament: { hp: 40, sp: 92, r: 12, dmg: 20, cost: 2, wt: 0.8, score: 24, shards: 1, col: "255,206,120",
    label: "Filament", note: "Arrives in pairs and strings a burning wire between the two. Kill either one and the wire goes out." },
  corona: { hp: 126, sp: 46, r: 18, dmg: 24, cost: 4, wt: 2, score: 52, shards: 3, col: "255,166,72",
    label: "Corona", note: "A ringed solar disc. It breathes heat rings outward at a steady count — walk in between them, not through them." },
  cinder: { hp: 38, sp: 152, r: 11, dmg: 16, cost: 2, wt: 0.55, score: 20, shards: 1, col: "255,132,72",
    label: "Cinder", note: "Orbits you, then drops in. Wherever it lands stays lit for a few seconds." },
  helion: { hp: 224, sp: 44, r: 22, dmg: 32, cost: 5, wt: 3.4, score: 78, shards: 4, col: "255,182,96",
    label: "Helion", note: "Plated on every face except the vent. It charges, then opens a cone of plasma from the front." },
  ignis: { hp: 104, sp: 62, r: 15, dmg: 22, cost: 4, wt: 1.1, score: 58, shards: 3, col: "255,110,64",
    label: "Ignis", note: "Reads your heat gauge. The hotter your gun runs, the faster it fires back. Cool down and it goes quiet." },
  perihelion: { hp: 2900, sp: 40, r: 46, dmg: 40, cost: 0, wt: 12, score: 1400, shards: 70, col: "255,176,84",
    label: "Perihelion", note: "A star engine mid-collapse. It pulls, it flares, and at the end it goes off in rings with gaps you have to already be standing in." },

  /* ---- NULLTIDE · branch 11 psi — everything that happened, kept wet ----- */
  fathom: { hp: 56, sp: 84, r: 14, dmg: 18, cost: 2, wt: 0.9, score: 26, shards: 2, col: "104,232,222",
    label: "Fathom", note: "A lantern drone. It pings first — the ping is your warning — then commits to the position it found." },
  undine: { hp: 50, sp: 118, r: 13, dmg: 16, cost: 3, wt: 0.7, score: 30, shards: 2, col: "128,200,255",
    label: "Undine", note: "A ribbon that swims. It never comes straight at you, so don't lead it the way you'd lead anything else." },
  caustic: { hp: 116, sp: 44, r: 17, dmg: 26, cost: 4, wt: 1.5, score: 56, shards: 3, col: "126,246,196",
    label: "Caustic", note: "Holds a lens and walks the focal point across the floor. The bright spot is the only part that burns." },
  trench: { hp: 268, sp: 50, r: 24, dmg: 34, cost: 5, wt: 3.6, score: 84, shards: 5, col: "72,150,206",
    label: "Trench", note: "Submerges, crosses the room underneath, and surfaces where you were standing. The wake shows the route." },
  sounding: { hp: 96, sp: 58, r: 16, dmg: 28, cost: 4, wt: 1.5, score: 62, shards: 3, col: "144,178,255",
    label: "Sounding", note: "Drops charges on a count and lets the tide arrange them. They detonate together, not in order." },
  drownedindex: { hp: 3100, sp: 46, r: 48, dmg: 40, cost: 0, wt: 12, score: 1600, shards: 80, col: "96,222,232",
    label: "The Drowned Index", note: "The archive column. It has a copy of everything you've killed in this run, and it will play them back at you." },

  /* ---- TERMINUS · branch infinity omega — the last second, on loop ------ */
  vestige: { hp: 60, sp: 88, r: 13, dmg: 18, cost: 2, wt: 0.85, score: 28, shards: 2, col: "196,196,204",
    label: "Vestige", note: "The wireframe of a Husk from a chamber that no longer exists. It walks the same walk. It has forgotten why." },
  coda: { hp: 78, sp: 60, r: 15, dmg: 24, cost: 3, wt: 1, score: 40, shards: 2, col: "232,206,150",
    label: "Coda", note: "Counts three, fires on four. It is always the same four beats — once you hear it you never get hit by it again." },
  nullc: { hp: 148, sp: 48, r: 18, dmg: 26, cost: 4, wt: 1.7, score: 66, shards: 4, col: "138,140,158",
    label: "Null", note: "A hole cut in the world. It swallows your pulses and gives them back with your name still on them." },
  epilogue: { hp: 190, sp: 36, r: 20, dmg: 30, cost: 5, wt: 2.2, score: 82, shards: 4, col: "222,196,120",
    label: "Epilogue", note: "Writes one line across the floor. When the line finishes, the line is what kills you. Read it early." },
  zenith: { hp: 172, sp: 72, r: 16, dmg: 28, cost: 5, wt: 1.25, score: 96, shards: 5, col: "255,226,164",
    label: "Zenith", note: "Wearing your build. Whatever cores you drafted this run, it drafted too, and it has been practising." },
  omega: { hp: 3600, sp: 210, r: 26, dmg: 42, cost: 0, wt: 9, score: 2200, shards: 120, col: "255,222,150",
    label: "OMEGA-00", note: "The first pilot. Same hull, same dash, same decoys — and in the last phase, one second further ahead than you are." },
});

