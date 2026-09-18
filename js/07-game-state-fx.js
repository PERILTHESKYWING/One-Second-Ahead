/* The live run state object (G), the particle/ring/shake FX system, afterimages/debris/corpses, and the telegraph (hazard warning) system. */
/* ---------------- state ----------------------------------------------- */
const G = {
  mode: "home", paused: false, drafting: false, carding: false, attract: true,
  time: 0, freeze: 0, trauma: 0, flash: 0, flashCol: "180,240,255",
  levelIdx: 0, loop: 0, wave: 0, breather: 0, waveClearing: false, draftIn: 0, cardIn: 0,
  score: 0, kills: 0, shards: 0, combo: 0, comboTimer: 0, runTime: 0,
  quality: 1, fps: 60,
  enemies: [], bullets: [], hostiles: [], pickups: [], echoes: [], lasers: [], traces: [],
  parts: [], rings: [], texts: [], zones: [], beams: [], portals: [], queue: [], dust: [],
  ghosts: [], shocks: [], debris: [], corpses: [],
  survival: false, chroma: 0, slowmo: 0, deathT: 0, elites: 0,
  player: null, mods: null, cores: {}, boss: null, shakeDir: { x: 0, y: 0 },
  stasis: [], chill: [], pillars: [], charges: [], omegaEchoes: [], wake: [], snap: [],
  barriers: [], barrierVer: 0,
  killed: {}, heat: 0, jam: 0, entropy: 60, entropyMax: 60, tideT: 15, tideWarn: 0,
  /* ---- the level attempt, for the Trophy Road ------------------------
     Reset by startLevel(), read by finishLevel(). `levelHits` is what the
     untouched bonus is judged on and `levelT` is what the par-time bonus is
     judged on, both scoped to THIS level attempt rather than to the run —
     which is the whole point of levels being discrete now. `mutation` is
     the replay toggle from the map screen. */
  levelHits: 0, levelT: 0, mutation: 0, levelDone: 0, levelResolved: 0, attemptTrophy: null,
  tutorial: 0,
  coronaAng: 0, current: 0, drain: 0, sealT: 0, shotsThisWave: 0, codaKills: [], safeWedge: null,
};
function curLevel() { return LEVELS[clamp(G.levelIdx, 0, LEVELS.length - 1)]; }
function levelLabel() {
  if (G.survival) return "Wave " + G.wave;
  return G.loop > 0 ? "Level " + (G.levelIdx + 1) + " · loop " + (G.loop + 1) : "Level " + (G.levelIdx + 1);
}
/* one number for "how bad is it right now" — feeds hp, speed and elite odds.
   A level's difficulty used to be implied by its index, which meant the
   curve could only ever be a straight line. Every level now carries an
   explicit `dt` instead (see the CALIBRATION block in 02b-arena-curve.js),
   so the four tiers can each sit where they were aimed rather than wherever
   the slope happened to put them. The index is still the fallback, which is
   what keeps any level authored without a `dt` behaving as it always did. */
function tierNow() {
  if (G.survival) return (G.wave - 1) * .8;
  const L = curLevel();
  const base = L && L.dt != null ? L.dt : G.levelIdx;
  return G.loop * LEVELS_PER_ARENA + base + (G.wave - 1) * .3;
}

/* ---------------- feel: trauma, hit-stop, hit-flash --------------------
   Every knob the impact feedback runs on, in one place. Trauma is a 0..1
   pool that every hit adds to and that bleeds off on its own; the render
   pass raises it to a power so small trauma stays subtle and only a real
   beating throws the camera around. The *_SPIKE values below are what each
   event puts in — raise them for more violence, lower them for calm. */
const TRAUMA_DECAY = 6;           /* exponential bleed-off rate (approach() k, per second) */
const TRAUMA_POW_POS = 2;         /* screen offset uses trauma^2 */
const TRAUMA_POW_ROT = 3;         /* screen tilt uses trauma^3, so it only shows up near max */
const TRAUMA_HIT = .035;          /* a pulse connecting — tiny alone, builds under sustained fire */
const TRAUMA_HIT_CRIT = .16;      /* a crit landing */
const TRAUMA_DASH_LAUNCH = .2;    /* pushing off into a dash */
const TRAUMA_DASH_IMPACT = .15;   /* a dash going through something */
const TRAUMA_DEATH_LIGHT = .1;    /* a small enemy coming apart */
const TRAUMA_DEATH_HEAVY = .22;   /* a big one coming apart */
const TRAUMA_DEATH_BOSS = .9;     /* the Paradox coming apart */
const TRAUMA_DEATH_BOSS_BONUS = .8; /* stacked on top for any branch boss */
const TRAUMA_HURT_MIN = .08;      /* floor for a hit the player actually feels */
const TRAUMA_HURT_MAX = .5;       /* ceiling for one enormous hit */
const TRAUMA_BLOCK = .2;          /* the shield eating a hit */

/* Hit-stop is quoted in frames at 60fps, because that is how it reads on
   screen: two frames is a tap, six is a stop. While it runs the sim is
   paused outright and only the particle/ambient pass keeps moving. */
const HITSTOP_FRAME = 1 / 60;
const HITSTOP_LIGHT = 2 * HITSTOP_FRAME;   /* light kills, the player taking a hit */
const HITSTOP_MEDIUM = 4 * HITSTOP_FRAME;  /* crits, dash impacts, the swap */
const HITSTOP_HEAVY = 6 * HITSTOP_FRAME;   /* something large dying */
/* Deliberately longer pauses for one-off beats. These are not combat juice,
   they are punctuation, so they sit outside the 2-6 frame band on purpose.
   Both land on moments where nothing is being asked of the player. */
const HITSTOP_BOSS_KILL = .32;
const HITSTOP_DEATH = .22;
/* the chrono brake is a reaction window, not a pause — it slows the room
   instead of stopping it, so the player can still act inside it */
const BRAKE_SLOWMO = .32;

/* A white frame over a sprite the instant it is hit. Short enough to read as
   a flash rather than a glow. */
const HIT_FLASH_ENEMY = 2 / 60;
const HIT_FLASH_PLAYER = 2 / 60;
/* how wide a directional spark spray opens around the angle of the hit */
const BURST_CONE_SPREAD = Math.PI * .55;

/* ---------------- fx --------------------------------------------------- */
const PART_CAP = 1000;
function part(x, y, o) {
  o = o || {};
  if (G.parts.length > PART_CAP) return;
  const a = o.a == null ? rnd(TAU) : o.a;
  const s = o.s == null ? rnd(60, 260) : o.s;
  G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
    life: o.life || rnd(.3, .85), max: o.life || .85, size: o.size || rnd(1, 3.4),
    col: o.col || TH.ink, drag: o.drag == null ? .94 : o.drag, grav: o.grav || 0,
    sq: o.sq || 0, ch: o.ch || "", spin: o.spin || 0, rot: o.rot || 0 });
}
function burst(x, y, n, col, force, opt) {
  n = Math.round(n * G.quality);
  for (let i = 0; i < n; i++) part(x, y, Object.assign({ col, s: rnd(70, 340) * (force || 1), size: rnd(1, 3.6) }, opt || {}));
}
/* the same spray, thrown as a cone along the angle the hit came in on, so
   sparks come off the side that was struck instead of ringing the target */
function directionalBurst(x, y, n, col, force, ang, opt) {
  n = Math.round(n * G.quality);
  const spread = opt && opt.spread != null ? opt.spread : BURST_CONE_SPREAD;
  for (let i = 0; i < n; i++) {
    part(x, y, Object.assign({ col, s: rnd(70, 340) * (force || 1), size: rnd(1, 3.6),
      a: ang + rnd(-spread / 2, spread / 2) }, opt || {}));
  }
}
function ring(x, y, col, r0, r1, life, w, o) {
  G.rings.push(Object.assign({ x, y, r: r0, to: r1, life: life || .4, max: life || .4, col, w: w || 2.4, wait: 0, sides: 0, rot: 0 }, o || {}));
}
/* shared steppers + painters so the shop can preview effects with the real code */
function stepParts(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.rot += p.spin * dt;
    const dr = Math.pow(p.drag, dt * 60); p.vx *= dr; p.vy *= dr;
  }
}
function stepRings(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i];
    if (r.wait > 0) { r.wait -= dt; continue; }
    r.life -= dt;
    if (r.life <= 0) { list.splice(i, 1); continue; }
    r.r = lerp(r.r, r.to, 1 - Math.exp(-9 * dt));
  }
}
/* ---- particles, batched ------------------------------------------------
   A particle used to be its own beginPath / arc / fill. A busy frame carries
   several hundred of them, and several hundred separate path rasterizations
   is one of the largest costs in the whole renderer — each one is a state
   setup, a path build and a fill, for something a few pixels across.

   They are batched instead. A fill is determined by exactly two things — the
   colour and the alpha — so particles are bucketed by (colour, alpha rounded
   to PART_ALPHA_STEPS levels) and each bucket is drawn as ONE path holding
   every circle in it. Round particles typically collapse from ~300 fills to
   under a dozen. The alpha quantisation is invisible: these are 1-3px dots
   fading out over a fraction of a second.

   Squares and glyphs are rarer (they only exist for two of the explosion
   cosmetics) and keep the straightforward path, though squares are batched
   by bucket too since fillRect needs no path of its own. */
const PART_ALPHA_STEPS = 6;
const partBuckets = new Map();
function drawParts(list) {
  if (!list.length) return;
  partBuckets.clear();
  let glyphs = null;
  for (const p of list) {
    const a = clamp(p.life / p.max, 0, 1);
    if (a <= .01) continue;
    if (p.ch) { (glyphs || (glyphs = [])).push(p); continue; }
    const step = Math.max(1, Math.round(a * PART_ALPHA_STEPS));
    const key = (p.sq ? "s" : "c") + step + "|" + p.col;
    let bucket = partBuckets.get(key);
    if (!bucket) { bucket = { col: p.col, a: step / PART_ALPHA_STEPS, sq: !!p.sq, items: [] }; partBuckets.set(key, bucket); }
    bucket.items.push(p);
  }
  for (const bucket of partBuckets.values()) {
    ctx.globalAlpha = bucket.a;
    ctx.fillStyle = "rgb(" + bucket.col + ")";
    if (bucket.sq) {
      for (const p of bucket.items) {
        const a = clamp(p.life / p.max, 0, 1), s = p.size * (.5 + a * .9);
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillRect(-s, -s, s * 2, s * 2);
        ctx.restore();
      }
      continue;
    }
    ctx.beginPath();
    for (const p of bucket.items) {
      const a = clamp(p.life / p.max, 0, 1);
      const r = p.size * (.4 + a * .6);
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, TAU);
    }
    ctx.fill();
  }
  if (glyphs) {
    ctx.textAlign = "center";
    for (const p of glyphs) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = "rgb(" + p.col + ")";
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.font = "700 " + (p.size * 4.4).toFixed(1) + "px " + MONO;
      ctx.fillText(p.ch, 0, 0);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1; ctx.textAlign = "left";
}
function drawRings(list) {
  for (const r of list) {
    if (r.wait > 0) continue;
    const a = clamp(r.life / r.max, 0, 1);
    ctx.globalAlpha = a * a;
    ctx.strokeStyle = "rgb(" + r.col + ")";
    ctx.lineWidth = r.w * a;
    if (r.sides) { ctx.save(); ctx.translate(r.x, r.y); polyPath(Math.max(1, r.r), r.sides, r.rot); ctx.stroke(); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r), 0, TAU); ctx.stroke(); }
  }
  ctx.globalAlpha = 1;
}
/* ---- explosion patterns (cosmetic, bought in the lab) ---- */
const GLYPHS = "01234789ABCDEFXY><=+*#%$@!?";
function boomFx(x, y, col, scale, o) {
  o = o || {};
  const s = clamp(scale || 1, .5, 3.6);
  const n = Math.round((o.n || 18) * (COS.boom === "boom_rings" ? .35 : 1));
  const force = o.force || 1.1;
  const r = o.r || 13;
  if (COS.boom === "boom_rings") {
    for (let i = 0; i < 3; i++) ring(x, y, col, r * .5, r * (2.6 + i * 2.4), .34 + i * .05, 3.2 - i * .7, { wait: i * .07 });
    burst(x, y, n, col, force * .7, { life: .3 });
  } else if (COS.boom === "boom_pixel") {
    const step = Math.round(4 + s * 3);
    for (let i = 0; i < n; i++) {
      const a = (Math.round(rnd(8)) / 8) * TAU;
      part(x + rnd(-r, r), y + rnd(-r, r), { col, a, s: rnd(60, 300) * force, size: rnd(1.6, 4.2), life: rnd(.3, .7), drag: .9, sq: 1, spin: 0 });
    }
    ring(x, y, col, r * .6, r * 3.4, .34, 2.6, { sides: 4, rot: Math.PI / 4 });
    ring(x, y, col, r * .4, r * 2.2, .28, 1.8, { sides: 4, wait: .05 });
  } else if (COS.boom === "boom_glyph") {
    for (let i = 0; i < Math.round(n * .7); i++) {
      part(x, y, { col, s: rnd(50, 240) * force, size: rnd(.9, 2.2), life: rnd(.4, .9), drag: .93,
        ch: GLYPHS[(Math.random() * GLYPHS.length) | 0], spin: rnd(-4, 4) });
    }
    ring(x, y, col, r * .6, r * 3.6, .38, 1.6);
  } else {
    burst(x, y, n, col, force);
    ring(x, y, col, r * .7, r * 4.4, .4, 2.6);
  }
}
function text(x, y, txt, col, size) {
  if (G.texts.length > 40) return null;
  const o = { x, y, vy: -46, life: .85, max: .85, txt, col, size: size || 14, pop: 0, crit: 0 };
  G.texts.push(o); return o;
}
/* Burning ground. Capped: every zone is tested against every enemy every
   frame AND drawn as its own filled path, so an uncapped list is a quadratic
   cost that the dash trail used to hit hard. Oldest goes first. */
const ZONE_CAP = 22;
function zone(x, y, r, life, dps, col) {
  if (G.zones.length >= ZONE_CAP) G.zones.shift();
  G.zones.push({ x, y, r, life, max: life, dps, col });
}
function beam(x1, y1, x2, y2, col, life) { G.beams.push({ x1, y1, x2, y2, life: life || .22, max: life || .22, col }); }
function shake(a, dx, dy) { G.trauma = Math.min(1, G.trauma + a * SAVE.settings.shake); G.shakeDir.x = dx || 0; G.shakeDir.y = dy || 0; }
function hitStop(t) { G.freeze = Math.max(G.freeze, t); }
function flash(a, col) { G.flash = Math.max(G.flash, a); G.flashCol = col || TH.core; }


/* ---- afterimages, debris, shockwaves, corpses ------------------------- */
function ghost(x, y, ang, col, o) {
  o = o || {};
  if (G.ghosts.length > 60) G.ghosts.shift();
  G.ghosts.push({ x, y, ang, col, r: o.r || 13, life: o.life || .34, max: o.life || .34,
    a: o.a == null ? .5 : o.a, grow: o.grow || 0, kind: o.kind || "hero" });
}
function shock(x, y, o) {
  o = o || {};
  G.shocks.push({ x, y, ang: o.ang || 0, arc: o.arc || TAU, r0: o.r0 || 10, r1: o.r1 || 120,
    life: o.life || .3, max: o.life || .3, col: o.col || TH.core, w: o.w || 4, spin: o.spin || 0 });
}
function debris(x, y, n, col, force, o) {
  o = o || {};
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU), sp = rnd(60, 420) * force;
    G.debris.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: rnd(TAU), vr: rnd(-9, 9),
      size: rnd(3, 11) * (o.size || 1), life: rnd(.5, 1.4) * (o.life || 1), max: 1.4, col,
      shape: (Math.random() * 3) | 0 });
  }
}
function corpse(e, col) {
  if (G.corpses.length > 24) G.corpses.shift();
  G.corpses.push({ type: e.type, x: e.x, y: e.y, r: e.r, ang: e.ang, wob: e.wob, elite: e.elite,
    vr: rnd(-3, 3), life: .34, max: .34, col, state: 0, blink: 1, hp: 1, maxHp: 1, hit: 0,
    fuse: 0, phase: e.phase || 0, spin: e.spin || 0, born: 1, timer: 1, face: e.face || 0,
    deflect: 0, lockAng: 0, birth: 0, tether: 0, pop: 0 });
}
/* the moment a pulse lands three times as hard */
function critFx(e, dmg, ang) {
  e.pop = 1;
  const col = TH.shard;
  hitStop(HITSTOP_MEDIUM); shake(TRAUMA_HIT_CRIT); flash(.06, col);
  ring(e.x, e.y, col, 4, e.r * 5.5, .3, 3);
  shock(e.x, e.y, { r0: e.r, r1: e.r * 4.6, life: .26, col, w: 3 });
  for (let i = 0; i < 2; i++) {
    const a = rnd(TAU);
    const L = e.r * 4.6;
    beam(e.x - Math.cos(a) * L, e.y - Math.sin(a) * L, e.x + Math.cos(a) * L, e.y + Math.sin(a) * L, col, .18);
  }
  directionalBurst(e.x, e.y, 14, col, 1.5, ang == null ? rnd(TAU) : ang, { life: .38, size: rnd(1.4, 3.4) });
  const t = text(e.x, e.y - e.r - 8, Math.round(dmg), col, 22);
  if (t) { t.pop = 1; t.crit = 1; }
}
function stepFxLists(dt) {
  for (let i = G.ghosts.length - 1; i >= 0; i--) { const g = G.ghosts[i]; g.life -= dt; if (g.life <= 0) G.ghosts.splice(i, 1); }
  for (let i = G.shocks.length - 1; i >= 0; i--) { const k = G.shocks[i]; k.life -= dt; k.ang += k.spin * dt; if (k.life <= 0) G.shocks.splice(i, 1); }
  for (let i = G.corpses.length - 1; i >= 0; i--) { const k = G.corpses[i]; k.life -= dt; k.ang += k.vr * dt; if (k.life <= 0) G.corpses.splice(i, 1); }
  for (let i = G.debris.length - 1; i >= 0; i--) {
    const d = G.debris[i];
    d.life -= dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt;
    d.vx *= Math.pow(.22, dt); d.vy *= Math.pow(.22, dt); d.vy += 40 * dt;
    if (d.life <= 0) G.debris.splice(i, 1);
  }
}
function drawGhosts() {
  for (const g of G.ghosts) {
    const f = clamp(g.life / g.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = f * g.a;
    ctx.translate(g.x, g.y);
    ctx.rotate(g.ang);
    const sc = 1 + (1 - f) * g.grow;
    ctx.scale(sc, sc);
    ctx.fillStyle = "rgba(" + g.col + ",.55)";
    heroPath(g.r); ctx.fill();
    ctx.strokeStyle = "rgba(" + g.col + ",.9)"; ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function drawShocks() {
  for (const k of G.shocks) {
    const f = 1 - clamp(k.life / k.max, 0, 1);
    const r = lerp(k.r0, k.r1, f * (2 - f));
    ctx.save();
    ctx.globalAlpha = (1 - f) * .85;
    ctx.strokeStyle = "rgb(" + k.col + ")";
    ctx.lineWidth = k.w * (1 - f) + .6;
    ctx.beginPath();
    ctx.arc(k.x, k.y, r, k.ang - k.arc / 2, k.ang + k.arc / 2);
    ctx.stroke();
    ctx.globalAlpha = (1 - f) * .3;
    ctx.lineWidth = (k.w * 2.4) * (1 - f) + .6;
    ctx.beginPath();
    ctx.arc(k.x, k.y, r * .93, k.ang - k.arc / 2, k.ang + k.arc / 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function drawDebris() {
  for (const d of G.debris) {
    const f = clamp(d.life / d.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(f * 1.4, 0, 1);
    ctx.translate(d.x, d.y); ctx.rotate(d.rot);
    ctx.fillStyle = "rgb(" + d.col + ")";
    if (d.shape === 0) { tri(-d.size, d.size * .6, d.size, d.size * .2, -d.size * .2, -d.size); ctx.fill(); }
    else if (d.shape === 1) { ctx.fillRect(-d.size * .6, -d.size * .4, d.size * 1.2, d.size * .8); }
    else { polyPath(d.size, 5, d.rot, .55); ctx.fill(); }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}
function drawCorpses() {
  for (const k of G.corpses) {
    const f = clamp(k.life / k.max, 0, 1);
    ctx.save();
    ctx.globalAlpha = f * .85;
    ctx.translate(k.x, k.y);
    const sc = .4 + f * .85;
    ctx.scale(sc, sc);
    try { (ART[k.type] || ART.husk)(k, k.col); } catch (err) {}
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/* ---------------- telegraphs + hazard traces ----------------------------- */
/* Entropy draws its intent on the floor before it commits: a warn phase you can
   read, a live strike, then a scorch line that stays hot for a moment. */
const TRACE_CAP = 64;
function trace(o) {
  if (G.traces.length > TRACE_CAP) G.traces.shift();
  const tr = Object.assign({
    kind: "line", x: 0, y: 0, ang: 0, len: 480, wide: 18, spin: 0, r: 200,
    t: 0, warn: .7, live: .16, fade: .8, dmg: 0, dot: 0,
    col: TH.hazard, follow: null, aim: 0, aim0: 0, owner: "", hits: [], braked: 0, read: 0,
    thru: 0, clipT: -1, clipLen: 0,
  }, o);
  /* a boss's sweeps cross the whole room by design; the boss arenas keep
     their middle clear so those lines still have somewhere to go */
  if (tr.owner && typeof BOSSES !== "undefined" && BOSSES[tr.owner]) tr.thru = 1;
  if (G.mods && G.mods.traceRead) { tr.warn *= 1.32; tr.read = 1; }
  G.traces.push(tr);
  return tr;
}
/* How long the line actually is right now. A hazard line is the main thing
   a ranged enemy reaches you with, so cover has to stop one or cover means
   nothing: the line is cut at the first wall it runs into, and the cut
   length is what both the damage test and the drawing use, so what you see
   is exactly what can hit you. Recomputed each frame because plenty of
   lines rotate (`spin`) or ride a moving body (`follow`).
   `thru` opts a line out — the bosses' room-wide sweeps use it, since their
   arenas deliberately keep the middle clear for them. */
function traceLen(tr) {
  if (tr.kind !== "line") return tr.len;
  if (tr.thru || typeof arenaRay !== "function") return tr.len;
  if (tr.clipT === G.time) return tr.clipLen;
  tr.clipT = G.time;
  tr.clipLen = arenaRay(tr.x, tr.y, tr.ang, tr.len);
  return tr.clipLen;
}
function traceHit(tr, x, y, pad) {
  if (tr.kind === "disc") return Math.hypot(x - tr.x, y - tr.y) < tr.r + pad;
  if (tr.kind === "ring") return Math.abs(Math.hypot(x - tr.x, y - tr.y) - tr.r) < tr.wide / 2 + pad;
  const L = traceLen(tr);
  return segDist(x, y, tr.x, tr.y, tr.x + Math.cos(tr.ang) * L, tr.y + Math.sin(tr.ang) * L) < tr.wide / 2 + pad;
}
function inLiveTrace(x, y, r) {
  for (const tr of G.traces) {
    if (!(tr.dmg || tr.dot)) continue;
    const end = tr.warn + tr.live + (tr.dot > 0 ? tr.fade : 0);
    if (tr.t >= tr.warn && tr.t < end && traceHit(tr, x, y, r || 0)) return true;
  }
  return false;
}
function updateTraces(dt) {
  const p = G.player, m = G.mods;
  for (let i = G.traces.length - 1; i >= 0; i--) {
    const tr = G.traces[i];
    const wasWarn = tr.t < tr.warn;
    tr.t += dt;
    if (tr.spin) tr.ang += tr.spin * dt;
    if (tr.follow) {
      if (tr.follow.dead) tr.follow = null;
      else if (tr.stick) { tr.x = tr.follow.x; tr.y = tr.follow.y; }
      else if (wasWarn) {
        tr.x = tr.follow.x; tr.y = tr.follow.y;
        if (tr.aim) tr.ang = tr.follow.lockAng + tr.aim0;
      }
    }
    const live = tr.t >= tr.warn && tr.t < tr.warn + tr.live;
    if (wasWarn && tr.t >= tr.warn && (tr.dmg > 0 || tr.dot > 0)) {
      /* the strike lands: scorch the line */
      if (tr.kind === "line") {
        const cl = traceLen(tr);
        const n = Math.round(clamp(cl / 60, 2, 9) * G.quality);
        for (let k = 0; k < n; k++) {
          const f = (k + rnd(1)) / n;
          part(tr.x + Math.cos(tr.ang) * cl * f, tr.y + Math.sin(tr.ang) * cl * f,
            { col: tr.col, s: rnd(20, 90), life: rnd(.3, .7), size: rnd(1, 2.6) });
        }
      }
    }
    if (live && tr.dmg > 0 && p && G.mode === "play") {
      if (tr.hits.indexOf("p") < 0 && traceHit(tr, p.x, p.y, p.r)) {
        tr.hits.push("p");
        hurtPlayer(tr.dmg * (m && m.traceRead ? .75 : 1));
      }
      for (const c of G.echoes) {
        if (tr.hits.indexOf(c) < 0 && traceHit(tr, c.x, c.y, c.r)) { tr.hits.push(c); c.hp -= tr.dmg * .8; c.hit = .12; }
      }
    }
    if (tr.dot > 0 && tr.t >= tr.warn && p && G.mode === "play") {
      if (traceHit(tr, p.x, p.y, p.r)) hurtPlayer(tr.dot * dt * (m && m.traceRead ? .75 : 1));
      for (const e of G.enemies) if (e.type !== tr.owner && traceHit(tr, e.x, e.y, e.r)) damageEnemy(e, tr.dot * .55 * dt, { spark: chance(.06), noCrit: true });
      if (chance(dt * 9 * G.quality) && tr.kind === "line") {
        const f = rnd(1), cl = traceLen(tr);
        part(tr.x + Math.cos(tr.ang) * cl * f, tr.y + Math.sin(tr.ang) * cl * f,
          { col: tr.col, s: rnd(10, 45), a: -Math.PI / 2 + rnd(-.6, .6), life: rnd(.3, .8), size: rnd(.8, 2.1), drag: .9 });
      }
    }
    /* chrono brake: the room crawls the moment a line finishes locking on you.
       This rides the slow-motion channel rather than hit-stop — the core is
       there to hand you a window to move in, and hit-stop would freeze you
       along with everything else. */
    if (m && m.brake && !tr.braked && (tr.dmg > 0 || tr.dot > 0) && tr.t < tr.warn && tr.warn - tr.t < .4 && p && traceHit(tr, p.x, p.y, p.r + 8)) {
      tr.braked = 1; G.slowmo = Math.max(G.slowmo, BRAKE_SLOWMO); flash(.045, TH.echo);
      Audio_.tone({ type: "sine", freq: 1200, to: 300, dur: .3, gain: .05 });
    }
    if (tr.t > tr.warn + tr.live + tr.fade) G.traces.splice(i, 1);
  }
}
function drawTraces() {
  ctx.save();
  for (const tr of G.traces) {
    const warnF = tr.warn > 0 ? clamp(tr.t / tr.warn, 0, 1) : 1;
    const live = tr.t >= tr.warn && tr.t < tr.warn + tr.live;
    const post = clamp(1 - (tr.t - tr.warn - tr.live) / tr.fade, 0, 1);
    const pulse = .5 + Math.sin(tr.t * 26) * .5;
    const hot = tr.dmg > 0 || tr.dot > 0;
    const base = tr.read ? .3 : .2;
    if (tr.kind === "disc") {
      /* an incoming shell: a shrinking bracket over the ground it will hit */
      const f = clamp(tr.t / tr.warn, 0, 1);
      if (tr.t < tr.warn) {
        ctx.save();
        ctx.globalAlpha = .35 + f * .45;
        ctx.strokeStyle = "rgb(" + tr.col + ")";
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(" + tr.col + "," + (.06 + f * .16) + ")";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.fill();
        ctx.lineWidth = 2.6;
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r * (1.9 - f * .9), 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(" + tr.col + "," + (.5 + f * .5) + ")";
        ctx.lineWidth = 2;
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + Math.PI / 4 + tr.t * 1.4;
          const rr = tr.r * (1.9 - f * .9);
          ctx.beginPath();
          ctx.moveTo(tr.x + Math.cos(a) * rr * .72, tr.y + Math.sin(a) * rr * .72);
          ctx.lineTo(tr.x + Math.cos(a) * rr, tr.y + Math.sin(a) * rr);
          ctx.stroke();
        }
        ctx.restore();
      } else if (live) {
        ctx.save();
        ctx.fillStyle = "rgba(" + tr.col + ",.75)";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.fill();
        ctx.fillStyle = "rgba(" + TH.rim + ",.7)";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r * .5, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (post > 0) {
        ctx.save();
        ctx.fillStyle = "rgba(" + tr.col + "," + (post * post * .3) + ")";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r * (.6 + post * .4), 0, TAU); ctx.fill();
        ctx.restore();
      }
      continue;
    }
    if (tr.kind === "ring") {
      ctx.lineWidth = tr.wide;
      if (tr.t < tr.warn) {
        ctx.setLineDash([10, 12]); ctx.lineDashOffset = -tr.t * 40;
        ctx.strokeStyle = "rgba(" + tr.col + "," + (base * (.5 + warnF * .8) + pulse * .1) + ")";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.6;
        ctx.strokeStyle = "rgba(" + tr.col + "," + (.25 + warnF * .55) + ")";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, -Math.PI / 2, -Math.PI / 2 + TAU * warnF); ctx.stroke();
      } else if (live) {
        ctx.lineWidth = tr.wide; ctx.strokeStyle = "rgba(" + tr.col + ",.8)";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.stroke();
        ctx.lineWidth = 2.4; ctx.strokeStyle = "rgba(" + TH.rim + ",.85)";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.stroke();
      } else if (post > 0) {
        ctx.lineWidth = tr.wide * post; ctx.strokeStyle = "rgba(" + tr.col + "," + (post * .3) + ")";
        ctx.beginPath(); ctx.arc(tr.x, tr.y, tr.r, 0, TAU); ctx.stroke();
      }
      continue;
    }
    ctx.save();
    ctx.translate(tr.x, tr.y); ctx.rotate(tr.ang);
    const w = tr.wide, L = traceLen(tr);
    /* wide lanes get thinner ink so they never paint over the fight */
    const wf = clamp(24 / w, .5, 1);
    if (tr.t < tr.warn) {
      /* the lock sweeping down the line */
      ctx.fillStyle = "rgba(" + tr.col + "," + ((base * .3 + pulse * .05) * wf) + ")";
      ctx.fillRect(0, -w / 2, L, w);
      ctx.fillStyle = "rgba(" + tr.col + "," + (base * (.4 + warnF * .8) * wf) + ")";
      ctx.fillRect(0, -w / 2, L * warnF, w);
      ctx.setLineDash([9, 8]); ctx.lineDashOffset = -tr.t * 70;
      ctx.strokeStyle = "rgba(" + tr.col + "," + (.28 + warnF * .5) + ")";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -w / 2); ctx.lineTo(L, -w / 2);
      ctx.moveTo(0, w / 2); ctx.lineTo(L, w / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (hot && warnF > .55) {
        ctx.fillStyle = "rgba(" + TH.rim + "," + ((warnF - .55) * .5 * pulse) + ")";
        ctx.fillRect(0, -1, L, 2);
      }
    } else if (live) {
      const g = ctx.createLinearGradient(0, 0, L, 0);
      g.addColorStop(0, "rgba(" + tr.col + ",.85)");
      g.addColorStop(1, "rgba(" + tr.col + ",.25)");
      ctx.fillStyle = g;
      ctx.fillRect(0, -w / 2, L, w);
      ctx.fillStyle = "rgba(" + TH.rim + ",.9)";
      ctx.fillRect(0, -w * .16, L, w * .32);
    } else if (post > 0) {
      ctx.fillStyle = "rgba(" + tr.col + "," + (post * post * (tr.dot > 0 ? .34 : .18)) + ")";
      ctx.fillRect(0, -w / 2 * post, L, w * post);
      ctx.setLineDash([5, 7]); ctx.lineDashOffset = tr.t * 24;
      ctx.strokeStyle = "rgba(" + tr.col + "," + (post * .4) + ")";
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
  ctx.restore();
}

