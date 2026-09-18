/* Branch shell: timeline select screen, the Archive, the operator console, input handling, run flow, menu routing and the main loop. */
/* =====================================================================
   BRANCH SHELL — timeline select, the archive, the operator console,
   and the wiring that lets the rest of the game not care which branch
   it is standing in.
   ===================================================================== */

/* ---------------- audio additions -------------------------------------- */
Object.assign(Audio_, {
  glassLock() { this.tone({ type: "triangle", freq: 1400, to: 2100, dur: .12, gain: .05 }); },
  glassRay() { this.tone({ type: "sine", freq: 2400, to: 900, dur: .16, gain: .045 }); this.noiseHit({ freq: 5200, to: 2000, dur: .1, gain: .03, q: 3 }); },
  coldRing() { this.tone({ type: "sine", freq: 320, to: 140, dur: .7, gain: .07, filter: "lowpass", cutoff: 1400 }); this.tone({ type: "triangle", freq: 1900, to: 2600, dur: .35, gain: .028 }); },
  shatter() { this.noiseHit({ freq: 6000, to: 1200, dur: .34, gain: .12, q: 2.4 }); [0, .04, .09].forEach((d, i) => this.tone({ type: "triangle", freq: 2200 + i * 700, to: 1200, dur: .2, gain: .035, delay: d })); },
  emberPulse() { this.tone({ type: "sawtooth", freq: 180, to: 90, dur: .3, gain: .06, filter: "lowpass", cutoff: 900 }); },
  emberVent() { this.noiseHit({ freq: 900, to: 180, dur: .55, gain: .16, q: .7, filter: "lowpass" }); this.tone({ type: "sawtooth", freq: 220, to: 60, dur: .5, gain: .09, filter: "lowpass", cutoff: 700 }); },
  vent() { this.noiseHit({ freq: 2600, to: 400, dur: .3, gain: .09, q: 1.6 }); },
  sonar() { this.tone({ type: "sine", freq: 900, to: 1500, dur: .4, gain: .07 }); this.tone({ type: "sine", freq: 450, dur: .5, gain: .035, delay: .06 }); },
  tideWarn() { this.tone({ type: "sine", freq: 70, to: 130, dur: 1.2, gain: .12, filter: "lowpass", cutoff: 500 }); },
  tideRewind() { [0, .05, .1, .15].forEach((d, i) => this.tone({ type: "triangle", freq: 1400 - i * 260, to: 600 - i * 100, dur: .3, gain: .05, delay: d })); this.noiseHit({ freq: 600, to: 3000, dur: .4, gain: .07, q: 1.2 }); },
  codaTick(b) { this.tone({ type: "sine", freq: [523, 587, 659, 784][b] || 523, dur: .1, gain: b === 0 ? .06 : .03 }); },
  codaHit() { this.tone({ type: "triangle", freq: 784, to: 392, dur: .26, gain: .08 }); },
  nullReturn() { this.tone({ type: "square", freq: 120, to: 700, dur: .28, gain: .06, filter: "lowpass", cutoff: 2000 }); },
  penScratch() { this.noiseHit({ freq: 3400, to: 1600, dur: .5, gain: .05, q: 4 }); },
  entropyTick() { this.tone({ type: "square", freq: 220, to: 180, dur: .09, gain: .05 }); },
  omegaShift() { [0, .12, .24].forEach((d, i) => this.tone({ type: "sawtooth", freq: 110 * (i + 1), to: 60 * (i + 1), dur: 1.1, gain: .07, delay: d, filter: "lowpass", cutoff: 900 })); this.noiseHit({ freq: 200, to: 40, dur: 1.4, gain: .2, q: .6, filter: "lowpass" }); },
  secretFx() { [0, .07, .14, .21].forEach((d, i) => this.tone({ type: "sine", freq: 660 * Math.pow(1.335, i), dur: .5, gain: .055, delay: d })); },
  unlockFx() { [0, .1, .2, .32].forEach((d, i) => this.tone({ type: "triangle", freq: 330 * Math.pow(2, [0, 5, 7, 12][i] / 12), dur: 1.1, gain: .08, delay: d, filter: "lowpass", cutoff: 2400 })); },
  /* --- cinematic bed --- */
  droneNodes: null,
  cineDrone(on) {
    if (!this.ctx) return;
    if (on) {
      if (this.droneNodes) return;
      const g = this.ctx.createGain();
      g.gain.value = 0;
      g.gain.linearRampToValueAtTime(.09, this.ctx.currentTime + 2);
      g.connect(this.musicBus);
      const oscs = [];
      [55, 82.5, 110, 164.8].forEach((fq, i) => {
        const o = this.ctx.createOscillator();
        o.type = i > 1 ? "sine" : "sawtooth";
        o.frequency.value = fq;
        const og = this.ctx.createGain();
        og.gain.value = [.5, .22, .3, .12][i];
        const lf = this.ctx.createBiquadFilter();
        lf.type = "lowpass"; lf.frequency.value = 420;
        o.connect(og).connect(lf).connect(g);
        o.start();
        oscs.push(o);
      });
      this.droneNodes = { g, oscs };
    } else if (this.droneNodes) {
      const { g, oscs } = this.droneNodes;
      this.droneNodes = null;
      try {
        g.gain.cancelScheduledValues(this.ctx.currentTime);
        g.gain.setValueAtTime(g.gain.value, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + .5);
        oscs.forEach((o) => o.stop(this.ctx.currentTime + .6));
      } catch (e) {}
    }
  },
  cineHit(v) { this.noiseHit({ freq: 240, to: 40, dur: .9, gain: .3 * (v || 1), q: .5, filter: "lowpass" }); this.tone({ type: "sine", freq: 90, to: 28, dur: .8, gain: .28 * (v || 1) }); },
  cineCut() { this.noiseHit({ freq: 5000, to: 900, dur: .09, gain: .1, q: 2 }); },
  cineRiser(d) { this.tone({ type: "sawtooth", freq: 90, to: 1200, dur: d || 1.4, gain: .06, filter: "lowpass", cutoff: 2200 }); },
  cineSnap() { this.noiseHit({ freq: 3800, to: 500, dur: .16, gain: .14, q: 2.6 }); this.tone({ type: "square", freq: 700, to: 140, dur: .12, gain: .05 }); },
  cineServo() { this.tone({ type: "sawtooth", freq: 320, to: 120, dur: .5, gain: .05, filter: "lowpass", cutoff: 800 }); this.noiseHit({ freq: 1200, to: 300, dur: .45, gain: .05, q: 1.4 }); },
  cineLock() { this.tone({ type: "triangle", freq: 880, to: 1320, dur: .4, gain: .09 }); this.tone({ type: "sine", freq: 220, dur: .7, gain: .07, delay: .05 }); },
  cineWake() { [0, .09, .18].forEach((d, i) => this.tone({ type: "triangle", freq: 262 * Math.pow(2, [0, 7, 12][i] / 12), dur: 1.4, gain: .08, delay: d, filter: "lowpass", cutoff: 2600 })); },
  cineTitle() { this.cineHit(1); [0, .04].forEach((d) => this.tone({ type: "sawtooth", freq: 55, to: 44, dur: 2.2, gain: .16, delay: d, filter: "lowpass", cutoff: 600 })); this.tone({ type: "triangle", freq: 523, to: 784, dur: 1.6, gain: .07, delay: .1 }); },
});

/* ---------------- save schema ------------------------------------------
   SAVE.tl and the per-level Trophy Road records are built and repaired in
   02c-trophy-road.js, which is the single owner of that schema. This file
   only reads them. */
function tlUnlocked(t) { return arenaUnlocked(typeof t === "string" ? t : t.id); }
function setTimeline(id) {
  TL = tlOf(id);
  LEVELS = TL.levels;
  BRANCHFN.field = BRANCHFN.paint = BRANCHFN.over = null;
  BRANCHFN.slowAt = BRANCHFN.dmgAt = BRANCHFN.onKill = null;
  BRANCHFN.bounds = BRANCHFN.spawnEdge = BRANCHFN.walls = null;
  Object.assign(BRANCHFN, BRANCH[id] || {});
  BRANCHFN.id = id;
  if (!SAVE.tl[id].entered) { SAVE.tl[id].entered = 1; persist(); }
}
/* the live field hooks, swapped per branch. Anything not defined by the
   current branch falls back to a no-op so the core loop stays simple.
   `bounds` and `spawnEdge` let a branch own its own room geometry — where
   the player is allowed to stand, and where enemies step in from — instead
   of every branch reusing Chamber 09's flat rectangle. */
const BRANCHFN = { id: "ch09", field: null, paint: null, over: null, slowAt: null, dmgAt: null, onKill: null, bounds: null, spawnEdge: null, walls: null };

/* ---------------- the progression screen ---------------------------------
   The arena-strip map that used to live here — five regions, each with its
   fifteen levels as a horizontally scrolling row of cards — has been replaced
   by the vertical Trophy Road in js/17-road.js. It read as a spreadsheet
   rather than a journey, and on a phone it was a sideways scroll inside a
   downward scroll showing two and a half levels out of seventy-five.

   renderRoad() is the only progression renderer now; route("road") is the
   only way in. */

/* ---------------- the archive (lore + secrets + bestiary) ---------------- */
/* The Archive's own screen is gone; its entries are cards in the
   Collection screen now (renderArchiveCards in 12-hud-and-screens.js),
   because lore is granted as a Trophy Road reward and a reward needs
   somewhere to be collected. These two helpers are what that renderer
   reads. */
function loreUnlocked(l) { return SAVE.admin || SAVE.lore[l.id] || (() => { try { return !!l.need(); } catch (e) { return false; } })(); }
function redact(s) { return s.replace(/[A-Za-z0-9]/g, "█"); }

const ADMIN_CODES = ["chrono-1041", "1041", "chrono1041"];
function openAdmin() {
  show("admin");
  $("#admGate").classList.toggle("hide", !!SAVE.admin);
  $("#admPanel").classList.toggle("hide", !SAVE.admin);
  if (SAVE.admin) renderAdmin();
  else setTimeout(() => { const i = $("#admCode"); if (i) { i.value = ""; i.focus(); } }, 60);
}
function tryAdmin() {
  const v = ($("#admCode").value || "").trim().toLowerCase();
  if (ADMIN_CODES.indexOf(v) < 0) {
    $("#admGate").classList.add("shake");
    setTimeout(() => $("#admGate").classList.remove("shake"), 400);
    $("#admErr").textContent = "rejected · the code is printed on the hull";
    Audio_.deny();
    return;
  }
  SAVE.admin = 1; persist();
  Audio_.unlockFx();
  toast("Operator access granted", "var(--shard)");
  $("#admGate").classList.add("hide");
  $("#admPanel").classList.remove("hide");
  renderAdmin();
  refreshHome();
}
let admGod = 0, admOneShot = 0;
function renderAdmin() {
  const p = $("#admPanel");
  p.innerHTML = "";
  const mk = (title, note) => {
    const s = document.createElement("div");
    s.className = "adm-sec";
    s.innerHTML = "<h3>" + title + "</h3>" + (note ? "<p>" + note + "</p>" : "");
    const r = document.createElement("div");
    r.className = "adm-row";
    s.appendChild(r);
    p.appendChild(s);
    return r;
  };
  const btn = (label, fn, cls) => {
    const b = document.createElement("button");
    b.className = "adm-btn " + (cls || "");
    b.textContent = label;
    b.onclick = () => { Audio_.ui(); fn(b); };
    return b;
  };

  /* --- progression --- */
  const r1 = mk("Progression", "Everything the player would otherwise have to earn.");
  r1.appendChild(btn("Unlock all branches", () => {
    TIMELINES.forEach((t) => { SAVE.tl[t.id].entered = 1; SAVE.tl[t.id].cleared = 1; });
    persist(); toast("All branches online", "var(--chrono)"); renderAdmin();
  }, "primary"));
  r1.appendChild(btn("Reveal all lore", () => { LORE.forEach((l) => SAVE.lore[l.id] = 1); persist(); toast("Archive opened"); }));
  r1.appendChild(btn("Reveal all secrets", () => { SECRETS.forEach((s) => SAVE.secrets[s.id] = 1); persist(); toast("Secrets revealed", "var(--shard)"); }));
  r1.appendChild(btn("Log every enemy", () => { Object.keys(EN).forEach((k) => SAVE.seen[k] = 1); persist(); drawBestiary(); toast("Bestiary complete"); }));
  r1.appendChild(btn("+100,000 shards", () => { SAVE.shards += 100000; persist(); refreshHome(); toast("Shards granted", "var(--shard)"); }));
  r1.appendChild(btn("Own every ability", () => {
    ABIL.forEach((a) => abilSave().owned[a.id] = 1);
    COSM.forEach((c) => SAVE.cosmetics.owned[c.id] = 1);
    syncCosmetics(); persist(); toast("Lab fully installed", "var(--chrono)");
  }));
  r1.appendChild(btn("Clear every level", () => {
    /* fills the whole Trophy Road at baseline trophies, which is what the
       save migration does for a player arriving from the old structure */
    TIMELINES.forEach((t) => {
      const st = SAVE.tl[t.id];
      st.entered = 1; st.cleared = 1;
      for (let i = 0; i < LEVELS_PER_ARENA; i++) {
        st.levels[i].cleared = 1; st.levels[i].bestPct = 1;
        st.levels[i].trophies = Math.max(st.levels[i].trophies, levelBaseTrophies(t.id, i));
      }
      claimLadder(t.id);
    });
    recomputeTrophies(); persist();
    toast("Trophy Road filled · " + fmt(SAVE.trophiesTotal) + " trophies", "var(--chrono)");
    renderAdmin();
  }));
  r1.appendChild(btn("Lock everything back", () => {
    TIMELINES.forEach((t, i) => {
      if (i) { SAVE.tl[t.id].entered = 0; SAVE.tl[t.id].cleared = 0; }
      SAVE.tl[t.id].ladder = 0;
      SAVE.tl[t.id].levels = SAVE.tl[t.id].levels.map(() => blankLevelRec());
    });
    SAVE.secrets = {}; SAVE.lore = {};
    recomputeTrophies();
    persist(); toast("Progress reset to first run", "var(--threat)"); renderAdmin();
  }, "danger"));

  /* --- jump --- */
  const r2 = mk("Jump into a branch", "Drops you straight into a level with the branch physics live.");
  TIMELINES.forEach((t) => {
    const wrap = document.createElement("div");
    wrap.className = "adm-jump";
    wrap.style.setProperty("--tc", "rgb(" + t.accent + ")");
    wrap.innerHTML = "<b>" + t.name + "</b>";
    const row = document.createElement("div");
    (t.levels || CH09_LEVELS).forEach((L, i) => {
      row.appendChild(btn((L.boss ? "★ " : "") + (i + 1) + " · " + L.name, () => {
        /* the same entry point the map uses, so the operator console cannot
           drift out of sync with how a level actually starts */
        enterLevel(t.id, i, 0);
      }));
    });
    wrap.appendChild(row);
    r2.appendChild(wrap);
  });

  /* --- boss rush --- */
  const r3 = mk("Straight to the boss", "Skips the waves. Full kit, full health, boss on the floor.");
  TIMELINES.forEach((t) => {
    r3.appendChild(btn(EN[t.boss].label, () => {
      setTimeline(t.id);
      startPlay("play");
      const li = (t.levels || CH09_LEVELS).length - 1;
      G.levelIdx = Math.max(0, li);
      backdropDirty = true;
      Audio_.setPalette(curLevel());
      G.carding = false; G.cardIn = 0;
      $("#levelCard").classList.remove("on");
      clearWorld();
      G.player = makePlayer(); makeDust();
      G.wave = curLevel().waves;
      G.queue = [{ type: t.boss, t: .4 }];
      banner(EN[t.boss].label, t.code);
    }, "primary"));
  });

  /* --- spawn --- */
  const r4 = mk("Spawn into the live room", "Only works while a run is going. Click an icon to drop one in.");
  const grid = document.createElement("div");
  grid.className = "adm-grid";
  Object.keys(EN).forEach((ty) => {
    const b = document.createElement("button");
    b.className = "adm-mob";
    b.title = EN[ty].label;
    const cvs = document.createElement("canvas");
    b.appendChild(cvs);
    const s = document.createElement("span");
    s.textContent = EN[ty].label;
    b.appendChild(s);
    b.onclick = () => {
      if (G.mode !== "play" || G.attract) { Audio_.deny(); toast("Start a run first", "var(--threat)"); return; }
      const pt = edgePoint();
      G.portals.push({ x: pt.x, y: pt.y, t: 0, type: ty });
      Audio_.ui();
      toast(EN[ty].label + " spawned");
    };
    grid.appendChild(b);
    drawIcon(cvs, ty, 34);
  });
  r4.appendChild(grid);

  /* --- toggles --- */
  const r5 = mk("Debug", "Live switches. They persist for the session only.");
  r5.appendChild(btn(admGod ? "Invulnerable: ON" : "Invulnerable: off", (b) => {
    admGod = !admGod; b.textContent = admGod ? "Invulnerable: ON" : "Invulnerable: off";
    b.classList.toggle("primary", !!admGod);
  }, admGod ? "primary" : ""));
  r5.appendChild(btn(admOneShot ? "One-shot kills: ON" : "One-shot kills: off", (b) => {
    admOneShot = !admOneShot; b.textContent = admOneShot ? "One-shot kills: ON" : "One-shot kills: off";
    b.classList.toggle("primary", !!admOneShot);
  }, admOneShot ? "primary" : ""));
  r5.appendChild(btn("Replay the cinematic", () => { runCine(() => { show("admin"); }); }));
  r5.appendChild(btn("Fill entropy clock", () => { G.entropy = G.entropyMax; toast("Clock topped up"); }));
  r5.appendChild(btn("Force a tide rewind", () => { if (G.mode === "play") tideRewind(true); }));
  r5.appendChild(btn("Drop a stasis bloom", () => { if (G.player) addStasis(G.player.x, G.player.y, 170, 12); }));
  r5.appendChild(btn("Kill everything on screen", () => { G.enemies.slice().forEach((e) => killEnemy(e)); }));
  r5.appendChild(btn("Sign out of operator", () => { SAVE.admin = 0; persist(); toast("Operator access revoked"); openAdmin(); refreshHome(); }, "danger"));
}

/* ---------------- home screen wiring ------------------------------------ */
function refreshBranchHome() {
  const ops = $("#opsLink");
  if (ops) ops.classList.toggle("on", !!SAVE.admin);
}

/* ---------------- input ----------------------------------------------------- */
const keys = new Set();
const mouse = { x: innerWidth / 2, y: innerHeight / 2, down: false };
const touch = { active: false, moveId: null, aimId: null, mx: 0, my: 0, mdx: 0, mdy: 0 };
const edge = { dash: false, echo: false };
/* Move and one button. Firing happens on its own, and the aim snaps to
   whatever you are already pointing near. */
function nearestEnemy(x, y, maxD) {
  let best = null, bd = maxD || 1e9;
  for (const e of G.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - x, e.y - y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function humanInput() {
  let mx = 0, my = 0;
  if (keys.has("w") || keys.has("arrowup")) my -= 1;
  if (keys.has("s") || keys.has("arrowdown")) my += 1;
  if (keys.has("a") || keys.has("arrowleft")) mx -= 1;
  if (keys.has("d") || keys.has("arrowright")) mx += 1;
  if (touch.active) { mx = touch.mdx; my = touch.mdy; }
  const l = Math.hypot(mx, my);
  if (l > 1) { mx /= l; my /= l; }
  const p = G.player;
  let ax = mouse.x, ay = mouse.y;
  const usingTouch = touch.active && touch.aimId === null;
  if (p && SAVE.settings.aimassist) {
    if (usingTouch) {
      /* no aim finger down: lock on by itself */
      const near = nearestEnemy(p.x, p.y, 900);
      if (near) { ax = near.x; ay = near.y; }
      else if (l > .05) { ax = p.x + mx * 200; ay = p.y + my * 200; }
    } else {
      const cur = Math.atan2(ay - p.y, ax - p.x);
      let best = null, bs = .3;
      for (const e of G.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > 780) continue;
        const off = Math.abs(angDiff(Math.atan2(e.y - p.y, e.x - p.x), cur));
        if (off < bs) { bs = off; best = e; }
      }
      if (best) { ax = best.x; ay = best.y; }
    }
  }
  const auto = !!SAVE.settings.autofire;
  const inp = { mx, my, aimX: ax, aimY: ay,
    fire: (auto || mouse.down || (touch.active && touch.aimId !== null)) && currentScreen === "none",
    dash: edge.dash, echo: edge.echo };
  edge.dash = edge.echo = false;
  return inp;
}
function botInput() {
  const p = G.player;
  let ax = 0, ay = 0, target = null, td = 1e9;
  for (const e of G.enemies) {
    const d = dist(e, p);
    if (d < td) { td = d; target = e; }
    if (d < 250) { const f = (250 - d) / 250; ax -= ((e.x - p.x) / (d || 1)) * f; ay -= ((e.y - p.y) / (d || 1)) * f; }
  }
  for (const h of G.hostiles) {
    const d = dist(h, p);
    if (d < 160) { const f = (160 - d) / 160 * 1.6; ax -= ((h.x - p.x) / (d || 1)) * f; ay -= ((h.y - p.y) / (d || 1)) * f; }
  }
  for (const s of G.pickups) { const d = dist(s, p); if (d < 400) { ax += ((s.x - p.x) / (d || 1)) * .35; ay += ((s.y - p.y) / (d || 1)) * .35; } }
  ax += ((W / 2 - p.x) / W) * 1.2; ay += ((H / 2 - p.y) / H) * 1.2;
  const l = Math.hypot(ax, ay) || 1;
  const aim = target || { x: p.x + 1, y: p.y };
  return { mx: ax / l, my: ay / l, aimX: aim.x, aimY: aim.y,
    fire: !!target && td < 700, dash: td < 120 && chance(.12), echo: G.enemies.length > 4 && chance(.005) };
}

/* ---------------- run flow --------------------------------------------------- */
function endRun() {
  const p = G.player;
  /* the frame comes apart: armour first, then the core lets go */
  for (let i = 0; i < 5; i++) {
    const a = rnd(TAU);
    ghost(p.x, p.y, p.aim + rnd(-.6, .6), TH.core, { r: p.r, life: .5 + i * .12, a: .5, grow: 1.4 + i * .5 });
  }
  debris(p.x, p.y, 22, TH.hull, 1.5, { size: 1.2, life: 1.5 });
  debris(p.x, p.y, 10, TH.core, 1.1, { size: .8, life: 1.2 });
  burst(p.x, p.y, 130, TH.core, 2);
  ring(p.x, p.y, TH.core, 10, 330, .8, 4);
  ring(p.x, p.y, TH.echo, 10, 210, 1.1, 3);
  shock(p.x, p.y, { r0: 14, r1: Math.max(W, H) * .8, life: .8, col: TH.core, w: 7 });
  shock(p.x, p.y, { r0: 14, r1: 300, life: .5, col: TH.echo, w: 4 });
  text(p.x, p.y - 60, "timeline broken", TH.echo, 26);
  G.slowmo = 1.5; G.chroma = 1; G.deathT = 2.2;
  flash(.55); shake(1.2); hitStop(HITSTOP_DEATH); Audio_.death();
  G.mode = "dead";
  Audio_.target = .05;
  if (G.attract) { setTimeout(() => startAttract(), 900); return; }
  /* A story level is a discrete ATTEMPT now, so dying in one is the end of
     that attempt rather than the end of a run: it banks whatever fraction
     of the level you actually got through (see finishLevel) and hands you
     back to the map to try again, instead of throwing you to the branch's
     level 1 with a fresh build. Survival is unchanged — it has no levels to
     be partway through. */
  if (!G.survival) { setTimeout(() => finishLevel(false), 2100); return; }
  const banked = Math.round(G.shards + (G.survival ? G.wave * 26 : (G.loop * LEVELS.length + G.levelIdx) * 40 + G.wave * 8));
  SAVE.shards += banked; SAVE.runs++;
  const reached = G.loop * LEVELS.length + G.levelIdx + 1;
  const best = G.survival
    ? (G.wave > SAVE.bestWave || G.runTime > SAVE.bestTime || G.score > SAVE.bestScore)
    : (G.score > SAVE.bestScore || reached > SAVE.bestLevel);
  SAVE.bestScore = Math.max(SAVE.bestScore, G.score);
  if (G.survival) { SAVE.bestWave = Math.max(SAVE.bestWave, G.wave); SAVE.bestTime = Math.max(SAVE.bestTime, G.runTime); }
  else SAVE.bestLevel = Math.max(SAVE.bestLevel, reached);
  persist();
  setTimeout(() => showResults(banked, best), 2100);
}
function endRunSilently() {
  if (G.mode === "play" && !G.attract) {
    const banked = Math.round(G.shards + (G.survival ? G.wave * 26 : (G.loop * LEVELS.length + G.levelIdx) * 40 + G.wave * 8));
    SAVE.shards += banked; SAVE.runs++;
    SAVE.bestScore = Math.max(SAVE.bestScore, G.score);
    if (G.survival) { SAVE.bestWave = Math.max(SAVE.bestWave, G.wave); SAVE.bestTime = Math.max(SAVE.bestTime, G.runTime); }
    else SAVE.bestLevel = Math.max(SAVE.bestLevel, G.loop * LEVELS.length + G.levelIdx + 1);
    persist();
    if (banked > 0) toast(fmt(banked) + " shards banked", "var(--chrono)");
  }
  G.mode = "dead";
}
let attractT = 0;
function startAttract() {
  G.mode = "play"; G.attract = true; G.paused = false; G.drafting = false; G.carding = false;
  $("#draft").classList.remove("on"); $("#levelCard").classList.remove("on");
  G.mods = baseMods(); G.mods.dmgMul *= 1.7; G.mods.multishot = 1; G.cores = {};
  G.levelIdx = rint(0, LEVELS.length - 2); G.loop = 0; G.wave = 1;
  backdropDirty = true;
  Audio_.setPalette(curLevel());
  clearWorld();
  G.score = 0; G.kills = 0; G.shards = 0; G.combo = 0;
  G.player = makePlayer();
  G.player.maxHp = 500; G.player.hp = 500;
  makeDust();
  attractT = 0;
  Audio_.target = .2;
}
function attractSpawn(dt) {
  attractT -= dt;
  if (attractT <= 0 && G.enemies.length < 13) {
    attractT = rnd(1.6, .5);
    const p = edgePoint();
    spawnEnemy(pick(curLevel().types), p.x, p.y);
  }
}
function sim(dt) {
  G.time += dt;
  if (!G.attract) G.runTime += dt;
  /* the attempt clock, which is what the par-time trophy bonus is judged
     on. Scoped to this level rather than to the run, and it stops the
     moment the last wave falls so the results animation is not charged to
     the player's time. */
  if (!G.attract && !G.survival && !G.levelDone && !G.carding) G.levelT += dt;
  const input = G.attract ? botInput() : humanInput();
  updatePlayer(dt, input);
  updateEchoes(dt);
  updateEnemies(dt);
  updateBullets(dt);
  updateTraces(dt);
  updatePickups(dt);
  if (!G.attract) abilTick(dt);
  if (!G.attract && BRANCHFN.field) BRANCHFN.field(dt);
  /* the barrier drones' walls. Ticked here rather than inside a branch
     field hook because the drone is in four arenas' rosters and Chamber 09
     has no field hook at all. */
  if (!G.attract) barrierTick(dt);
  if (!G.attract) checkSecrets(dt);
  if (G.attract) attractSpawn(dt); else tickWaves(dt);
  if (G.comboTimer > 0) { G.comboTimer -= dt; if (G.comboTimer <= 0) G.combo = 0; }
  Audio_.target = G.attract ? .22 : clamp(.28 + G.enemies.length / 18 * .72 + (G.boss ? .3 : 0), 0, 1);
}

/* ---------------- menus + routing --------------------------------------------- */
function menuItems(menu) { return menu ? Array.from(menu.querySelectorAll(".menu-item")) : []; }
function selectMenu(menu, idx) {
  const items = menuItems(menu);
  if (!items.length) return;
  idx = (idx + items.length) % items.length;
  items.forEach((el, i) => el.classList.toggle("sel", i === idx));
  menu.dataset.idx = idx;
}
function moveMenu(menu, d) { selectMenu(menu, parseInt(menu.dataset.idx || "0", 10) + d); Audio_.ui(); }
/* The home screen stopped being a vertical list of menu items, so it has no
   keyboard menu to drive; PLAY is bound to Enter directly instead. */
function activeMenu() {
  if (currentScreen === "pause") return $("#pauseMenu");
  return null;
}
/* where returnTo points, for screens reachable from more than one place */
/* the level results screen belongs to the map, so Esc from it goes there */
function returnToFor() {
  if (currentScreen === "pause") return "pause";
  return "home";
}
function route(dest) {
  Audio_.init(); Audio_.resume();
  /* The Trophy Road is the progression screen, and it is reachable by three
     names because three different places used to point at three different
     screens. One destination now. */
  if (dest === "play" || dest === "road" || dest === "timelines") {
    const wasPlaying = G.mode === "play" && !G.attract;
    transitionTo(() => {
      if (wasPlaying) { G.paused = false; endRunSilently(); startAttract(); }
      renderRoad();
      show("timelines");
      playRoadUnlock();
    });
    uiSfx("open");
    return;
  }
  if (dest === "loadout") { returnTo = returnToFor(); transitionTo(() => { renderShop("abil"); show("shop"); }); uiSfx("open"); return; }
  if (dest === "collection") { returnTo = returnToFor(); transitionTo(() => { renderShop("cos"); show("shop"); }); uiSfx("open"); return; }
  if (dest === "survival") { setTimeline("ch09"); startPlay("survival"); return; }
  if (dest === "again") { startPlay(lastMode); return; }
  if (dest === "shop") { returnTo = currentScreen === "pause" ? "pause" : "home"; transitionTo(() => { renderShop(); show("shop"); }); uiSfx("open"); return; }
  if (dest === "guide") { returnTo = returnToFor(); transitionTo(() => { drawBestiary(); show("guide"); }); uiSfx("open"); return; }
  if (dest === "settings") { returnTo = returnToFor(); transitionTo(() => { renderSettings(); show("settings"); }); uiSfx("open"); return; }
  if (dest === "home") {
    const wasPlaying = G.mode === "play" && !G.attract;
    transitionTo(() => { if (wasPlaying) { G.paused = false; endRunSilently(); } goHome(); });
    uiSfx("back");
    return;
  }
  if (dest === "boot") { runCine(() => goHome()); return; }
  if (dest === "admin") { openAdmin(); Audio_.ui(); return; }
  if (dest === "resume") { togglePause(false); return; }
  if (dest === "abandon") { G.paused = false; endRunSilently(); goHome(); return; }
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-go]");
  if (el) route(el.dataset.go);
});
/* These DOM hooks run at load time, so every one of them has to survive the
   element not being on the page. The home screen's palette swap moved into
   Settings, and a missing #themeSwap used to throw here and abort the rest
   of this file — which left the main loop's `raf` in its temporal dead zone
   and broke the whole game with one null. */
const hook = (sel, fn) => { const el = $(sel); if (el) fn(el); return el; };
hook("#themeSwap", (el) => { el.onclick = () => setTheme(nextPalette()); });
hook("#wipeSave", (el) => { el.onclick = function () {
  if (this.dataset.armed) {
    const theme = SAVE.settings.theme;
    SAVE = JSON.parse(JSON.stringify(DEFAULT_SAVE));
    SAVE.settings.theme = THEMES[theme] && (theme === "dark" || theme === "light") ? theme : "dark";
    syncCosmetics(); persist(); applySettings(); setTheme(SAVE.settings.theme, true); renderSettings(); refreshHome();
    toast("Progress erased", "var(--threat)");
    this.textContent = "Erase all progress"; delete this.dataset.armed;
  } else {
    this.dataset.armed = "1"; this.textContent = "Click again to confirm";
    setTimeout(() => { if (this.dataset.armed) { this.textContent = "Erase all progress"; delete this.dataset.armed; } }, 4000);
  }
}; });
$$(".menu").forEach((menu) => menuItems(menu).forEach((el, i) => el.addEventListener("mouseenter", () => { selectMenu(menu, i); Audio_.ui(); })));
hook("#levelCard", (el) => el.addEventListener("click", () => { if (G.carding) beginLevelWaves(); }));

addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (e.code === "Space" || k === "arrowup" || k === "arrowdown") e.preventDefault();
  Audio_.init(); Audio_.resume();
  if (CINE.active) { if (k !== "escape") skipCine(); keys.add(k); return; }
  if (bootRunning) { skipBoot(); keys.add(k); return; }
  if (!keys.has(k)) {
    if (G.drafting) { if (k === "1" || k === "2" || k === "3") { chooseCore(parseInt(k, 10) - 1); return; } }
    if (G.carding && currentScreen === "none") { beginLevelWaves(); keys.add(k); return; }
    if (currentScreen === "none" && G.mode === "play") {
      if (e.code === "Space") edge.dash = true;
      /* the loadout is bound by SLOT, so the order you arrange it in the
         Echo Lab is the order it sits under your fingers */
      if (k === "1") abilUse(0);
      if (k === "2") abilUse(1);
      if (k === "3") abilUse(2);
      if (k === "e") edge.echo = true;
    }
  }
  keys.add(k);
  if (k === "t") { setTheme(nextPalette()); if (currentScreen === "settings") renderSettings(); if (currentScreen === "shop") renderShop(); return; }
  const menu = activeMenu();
  if (menu) {
    if (k === "arrowdown") { moveMenu(menu, 1); return; }
    if (k === "arrowup") { moveMenu(menu, -1); return; }
    if (k === "enter") { menuItems(menu)[parseInt(menu.dataset.idx || "0", 10)].click(); return; }
  }
  if (k === "escape") {
    if (currentScreen === "cine") { skipCine(); return; }
    if (currentScreen === "timelines" || currentScreen === "admin") { goHome(); return; }
    if (currentScreen === "shop" || currentScreen === "guide" || currentScreen === "settings") {
      if (returnTo === "pause") { show("pause"); selectMenu($("#pauseMenu"), 0); }
      else goHome();
    } else if (currentScreen === "pause") togglePause(false);
    /* the level results belong to the map, so Esc goes back to the road
       rather than all the way out to the main menu */
    else if (currentScreen === "levelResult") route("timelines");
    else if (currentScreen === "results") route("home");
    else if (currentScreen === "none") togglePause(true);
    return;
  }
  if (currentScreen === "home") {
    if (k === "enter" || k === " ") return playPressed();
    if (k === "r") return route("road");
    if (k === "v") return route("survival");
    if (k === "l") return route("loadout");
    if (k === "c") return route("collection");
    if (k === "`" || k === "~") return route("admin");
    codeBuffer = (codeBuffer + k).slice(-8);
    if (codeBuffer.indexOf("1041") >= 0) { codeBuffer = ""; unlockSecret("constant"); document.body.classList.add("showops"); refreshBranchHome(); }
  }
  if (currentScreen === "results" && (k === "r" || k === "enter")) route("again");
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
addEventListener("blur", () => { keys.clear(); mouse.down = false; if (G.mode === "play" && !G.attract && !G.paused) togglePause(true); });
document.addEventListener("visibilitychange", () => { if (document.hidden && G.mode === "play" && !G.attract && !G.paused) togglePause(true); });
addEventListener("mousemove", (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
cv.addEventListener("mousedown", (e) => {
  Audio_.init(); Audio_.resume();
  if (G.carding && currentScreen === "none") { beginLevelWaves(); return; }
  if (e.button === 0) mouse.down = true;
  if (e.button === 2) { edge.dash = true; e.preventDefault(); }
});
addEventListener("mouseup", (e) => { if (e.button === 0) mouse.down = false; });
cv.addEventListener("contextmenu", (e) => e.preventDefault());
if ("ontouchstart" in window) document.body.classList.add("touch");
cv.addEventListener("touchstart", (e) => {
  Audio_.init(); Audio_.resume();
  touch.active = true;
  if (G.carding) beginLevelWaves();
  for (const t of e.changedTouches) {
    if (t.clientX < innerWidth / 2 && touch.moveId === null) { touch.moveId = t.identifier; touch.mx = t.clientX; touch.my = t.clientY; }
    else if (touch.aimId === null) { touch.aimId = t.identifier; mouse.x = t.clientX; mouse.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
cv.addEventListener("touchmove", (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) {
      const dx = t.clientX - touch.mx, dy = t.clientY - touch.my, l = Math.hypot(dx, dy) || 1;
      const n = Math.min(l, 60) / 60;
      touch.mdx = (dx / l) * n; touch.mdy = (dy / l) * n;
    } else if (t.identifier === touch.aimId) { mouse.x = t.clientX; mouse.y = t.clientY; }
  }
  e.preventDefault();
}, { passive: false });
function endTouch(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.mdx = 0; touch.mdy = 0; }
    if (t.identifier === touch.aimId) touch.aimId = null;
  }
}
cv.addEventListener("touchend", endTouch);
cv.addEventListener("touchcancel", endTouch);
$$("#touch .tbtn").forEach((b) => b.addEventListener("touchstart", (e) => {
  e.stopPropagation(); e.preventDefault();
  if (b.dataset.act === "dash") edge.dash = true; else edge.echo = true;
}, { passive: false }));

/* ---------------- loop -------------------------------------------------------- */
let last = performance.now(), raf = 0, fpsAcc = 0, fpsN = 0, slowFor = 0;
/* ---- adaptive quality --------------------------------------------------
   This used to be a single one-way cliff: below 42fps for four samples it
   dropped straight to .5, which switches the bloom off outright, and it
   never came back for the rest of the session. So a machine that stuttered
   once during a boss spent the whole run looking flat, and one that only
   just could not afford the chromatic split lost the bloom as well.

   It is a ladder now. Each rung sheds the most expensive thing left before
   touching anything cheaper — the split first (measured at 6.5ms a frame on
   its own), then the bloom, then particle counts — and it climbs back up
   when the frames come back. The hysteresis gap between DROP and RECOVER is
   what stops it oscillating on a machine sitting right on the boundary. */
const QUALITY_RUNGS = [1, .82, .62, .4];
/* What each rung costs the picture, cheapest thing first:
     1     everything
     .82   no chromatic split           (measured 6.5ms a frame on its own)
     .62   no bloom, fewer particles
     .4    ...and the canvas drops to RENDER_SCALE of the device resolution,
           which is the single biggest lever there is on a 2x display —
           a quarter of the pixels to rasterise for a slightly softer image.
   The render scale is deliberately last: it is the only rung you can see in
   the sharpness of the picture rather than just in the effects. */
const RENDER_SCALE = [1, 1, 1, .68];
const QUALITY_DROP_FPS = 46;    /* below this, shed a rung */
const QUALITY_RECOVER_FPS = 58; /* above this, take one back */
let qSlow = 0, qFast = 0;
function applyQualityRung(rung) {
  G.quality = QUALITY_RUNGS[rung];
  if (typeof setRenderScale === "function") setRenderScale(RENDER_SCALE[rung]);
}
function adaptQuality() {
  const i = QUALITY_RUNGS.indexOf(G.quality);
  const rung = i < 0 ? 0 : i;
  if (G.fps < QUALITY_DROP_FPS) {
    qFast = 0;
    if (++qSlow >= 3 && rung < QUALITY_RUNGS.length - 1) { applyQualityRung(rung + 1); qSlow = 0; }
  } else if (G.fps > QUALITY_RECOVER_FPS) {
    qSlow = 0;
    if (++qFast >= 10 && rung > 0) { applyQualityRung(rung - 1); qFast = 0; }
  } else { qSlow = 0; qFast = 0; }
}
function frame(now) {
  raf = requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > .25 || dt < 0) dt = .016;
  dt = Math.min(dt, .05);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > .5) {
    G.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
    adaptQuality();
  }
  Audio_.tick(dt);
  if (CINE.active) { cineTick(dt); return; }
  let sdt = dt;
  if (G.slowmo > 0) { G.slowmo -= dt; sdt *= .34; }
  /* hit-stop: the fight holds still for a couple of frames while the sparks
     it just threw keep going, which is what sells the weight of the hit */
  const frozen = G.freeze > 0;
  if (frozen) G.freeze = Math.max(0, G.freeze - dt);
  const running = G.mode === "play" && !G.paused && !G.drafting;
  if (running) {
    if (!frozen) sim(sdt);
    updateFx(frozen ? dt : sdt);
  } else if (G.mode === "dead") {
    const ddt = frozen ? 0 : sdt;
    G.time += ddt * .4; updateEnemies(ddt * .3); updateBullets(ddt * .3); updateEchoes(ddt * .3); updateTraces(ddt * .3);
    updateFx(frozen ? dt : sdt * .7);
  }
  /* exponential bleed-off, snapped to zero so a settled camera is truly still */
  G.trauma = G.trauma > .002 ? approach(G.trauma, 0, TRAUMA_DECAY, dt) : 0;
  G.flash = Math.max(0, G.flash - dt * 3.4);
  G.chroma = Math.max(0, G.chroma - dt * 1.6);
  G.deathT = Math.max(0, G.deathT - dt);
  render();
  if (G.mode === "play" && !G.attract && !G.paused) updateHUD();
}

/* ---------------- boot --------------------------------------------------------- */
resize();
syncCosmetics();
if (!owns(SAVE.cosmetics.palette)) { SAVE.settings.theme = "dark"; SAVE.cosmetics.palette = "pal_dark"; }
setTheme(SAVE.settings.theme || "dark", true);
buildAbilities();
applySettings();
renderSettings();
drawBestiary();
refreshHome();
startAttract();
refreshBranchHome();
/* The cold open is the game's identity and it stays — but it plays for a
   FIRST-TIME visitor only. Someone arriving on a portal and pressing back in
   tomorrow should land on the title screen immediately; making them sit
   through (or skip past) a cinematic every single visit is exactly the kind
   of thing that loses a browser-game player before they have played. */
if (SAVE.settings.boot && !SAVE.booted) {
  runCine(() => { SAVE.booted = 1; persist(); goHome(); });
} else {
  show("home");
}

