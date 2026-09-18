/* The shell: UI sound, screen transitions, the first-time tutorial, and the
   main-menu wiring that decides where PLAY actually goes.

   Everything in here is presentation and flow. No game system lives here —
   the run loop, the enemies, the branch physics and the Trophy Road data all
   stay where they were. What this file changes is what a person who has
   never heard of this game sees in their first ninety seconds. */

/* ---------------- UI sound ----------------------------------------------
   The interface had three sounds (ui / confirm / deny) and used the same
   blip for hovering a menu item and for opening a screen, which is why the
   menus read as silent-ish and flat. These are all built out of the same
   synth the game already uses — no assets — and they are deliberately quiet
   and short: interface sound is felt, not listened to. */
Object.assign(Audio_, {
  uiHover() { if (!this.rateOk("uihov", .04)) return; this.tone({ type: "sine", freq: 1180, to: 1320, dur: .035, gain: .018 }); },
  uiMove() { this.tone({ type: "sine", freq: 820, to: 960, dur: .045, gain: .03 }); },
  uiPress() { this.tone({ type: "triangle", freq: 620, to: 940, dur: .07, gain: .05 }); this.noiseHit({ freq: 3200, to: 1600, dur: .04, gain: .02, q: 2 }); },
  uiBack() { this.tone({ type: "sine", freq: 620, to: 400, dur: .09, gain: .04 }); },
  uiOpen() { this.tone({ type: "triangle", freq: 340, to: 620, dur: .17, gain: .05, filter: "lowpass", cutoff: 2400 }); this.noiseHit({ freq: 900, to: 2600, dur: .16, gain: .025, q: 1.4 }); },
  uiToggle(on) { this.tone({ type: "square", freq: on ? 700 : 480, to: on ? 1000 : 360, dur: .06, gain: .035, filter: "lowpass", cutoff: 2600 }); },
  /* the three that carry real weight */
  levelDone() {
    [0, .1, .2, .34].forEach((d, i) => this.tone({ type: "triangle",
      freq: 392 * Math.pow(2, [0, 4, 7, 11][i] / 12), dur: 1.1, gain: .08, delay: d, filter: "lowpass", cutoff: 3000 }));
    this.tone({ type: "sine", freq: 98, to: 74, dur: 1.4, gain: .1 });
  },
  rewardPop(i) { this.tone({ type: "triangle", freq: 780 * Math.pow(1.19, i || 0), to: 1180 * Math.pow(1.19, i || 0), dur: .18, gain: .06 }); },
  bossWarn() {
    this.tone({ type: "sawtooth", freq: 60, to: 96, dur: 1.5, gain: .14, filter: "lowpass", cutoff: 420 });
    [0, .34, .68].forEach((d) => this.noiseHit({ freq: 260, to: 90, dur: .3, gain: .07, q: .8, filter: "lowpass", delay: d }));
  },
  tutorStep() { this.tone({ type: "sine", freq: 880, to: 1180, dur: .12, gain: .045 }); },
});
/* one call site for interface sound, so a new screen cannot invent its own
   vocabulary by accident */
function uiSfx(kind) {
  if (!Audio_.ctx) return;
  switch (kind) {
    case "hover": return Audio_.uiHover();
    case "move": return Audio_.uiMove();
    case "press": return Audio_.uiPress();
    case "confirm": return Audio_.uiPress();
    case "back": return Audio_.uiBack();
    case "open": return Audio_.uiOpen();
    case "on": return Audio_.uiToggle(1);
    case "off": return Audio_.uiToggle(0);
    case "deny": return Audio_.deny();
    default: return Audio_.uiHover();
  }
}

/* ---------------- screen transitions ------------------------------------
   Screens used to swap by toggling a class, which cross-faded two
   full-viewport blurred layers and read as a jump cut. This wipes instead:
   a short shutter over the whole app, the swap happening behind it, then
   the shutter opening. It is 320ms total, which is long enough to register
   as one application and short enough that nobody waits for it. */
let wiping = false;
function transitionTo(fn, opts) {
  opts = opts || {};
  if (wiping) { fn(); return; }
  const w = $("#wipe");
  if (!w || (SAVE.settings && SAVE.settings.reduced)) { fn(); return; }
  wiping = true;
  w.className = "on close";
  setTimeout(() => {
    /* Rethrown on a later tick rather than swallowed: a screen that fails to
       render used to leave the player looking at whatever was behind the
       wipe with nothing in the console, which is the worst possible
       combination of broken and silent. The wipe still opens either way. */
    try { fn(); } catch (e) { setTimeout(() => { throw e; }, 0); }
    w.className = "on open";
    setTimeout(() => { w.className = ""; wiping = false; }, 260);
  }, opts.hold || 190);
}

/* ---------------- first-time tutorial -----------------------------------
   The brief a new player actually needs is four things — move, shoot, dash,
   and that the floor warns you before it hits you — and they need them one
   at a time while playing, not as a wall of text on a help screen.

   So the tutorial is a real level: the ordinary run loop, in Chamber 09,
   with the wave system suspended and a script driving what walks in. Each
   step states one instruction, watches for the player to actually do it,
   and moves on. Nothing here is a special game mode — it is the real game
   with a director sitting on top, which is why finishing it hands straight
   over to Level 1 with no seam. */
const TUT_KEY = "tutorialDone";
function tutorialDone() { return !!SAVE.tutorial; }
function markTutorialDone() { SAVE.tutorial = 1; persist(); }

const TUT = {
  active: 0, step: 0, t: 0, stepT: 0, done: 0, held: 0, killed: 0, waitK: 0,
};
/* Each step: what it says, how it knows you did it, and anything it has to
   put in the room first. `hold` is a grace period so a prompt cannot be
   satisfied by an input that was already happening when it appeared. */
const TUT_STEPS = [
  {
    title: "MOVE", sub: "W A S D",
    hint: "touch: drag the left half",
    enter() { },
    /* moved a real distance, not a twitch */
    test(dt) {
      const p = G.player;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 120) TUT.held += dt;
      return TUT.held > 1.1;
    },
  },
  {
    title: "FIRE", sub: "hold the mouse button",
    hint: "the gun aims itself — you choose when",
    enter() { tutSpawn("husk", 2); },
    test() { return TUT.killed >= 2; },
  },
  {
    title: "DASH", sub: "SPACE",
    hint: "nothing can touch you mid-dash",
    enter() { tutSpawn("husk", 3); },
    test(dt) { return TUT.dashes >= 2; },
  },
  {
    title: "READ THE FLOOR", sub: "every heavy attack is drawn before it lands",
    hint: "step out of the line",
    enter() { tutSpawn("dart", 2); },
    test(dt) { TUT.stepT += dt; return TUT.stepT > 7 || TUT.killed >= 2; },
  },
  {
    title: "DROP AN ECHO", sub: "E",
    hint: "a copy of your last few seconds — it fights, and it takes hits meant for you",
    enter() { tutSpawn("husk", 3); },
    test() { return TUT.echoes >= 1; },
  },
  {
    title: "CLEAR THE ROOM", sub: "",
    hint: "",
    enter() { tutSpawn("husk", 3); tutSpawn("dart", 2); },
    test() { return G.enemies.length === 0 && G.portals.length === 0; },
  },
];

/* Staggered through G.queue rather than by back-dating portals: the queue is
   what the wave director uses, so a tutorial body arrives on the same timing
   curve and with the same telegraph as a real one. */
function tutSpawn(type, n, delay) {
  for (let i = 0; i < n; i++) G.queue.push({ type, t: (delay || 0) + i * .45 });
}
function startTutorial() {
  TUT.active = 1; TUT.step = -1; TUT.done = 0;
  TUT.held = 0; TUT.killed = 0; TUT.dashes = 0; TUT.echoes = 0;
  setTimeline("ch09");
  G.mutation = 0;
  startPlay("play", 0);
  /* the ordinary wave director stands down; the script below drives it */
  G.tutorial = 1;
  G.carding = false; G.cardIn = 0;
  $("#levelCard").classList.remove("on");
  G.queue = []; G.portals = [];
  /* The HUD's level line is only rewritten when a wave starts, and the
     tutorial never starts one — so it would sit on the markup's placeholder
     text. Set it here and blank the wave pips, which mean nothing in a
     level that has no waves. */
  $("#lvlNum").textContent = "Tutorial";
  $("#lvlName").textContent = "learning the room";
  $("#waveDots").innerHTML = "";
  $("#tutor").classList.add("on");
  tutNext();
}
function tutNext() {
  TUT.step++;
  TUT.held = 0; TUT.killed = 0; TUT.dashes = 0; TUT.echoes = 0; TUT.stepT = 0;
  if (TUT.step >= TUT_STEPS.length) { tutFinish(); return; }
  const s = TUT_STEPS[TUT.step];
  const el = $("#tutor");
  $("#tutTitle").textContent = s.title;
  $("#tutSub").textContent = s.sub || "";
  $("#tutHint").textContent = s.hint || "";
  $("#tutStep").textContent = (TUT.step + 1) + " / " + TUT_STEPS.length;
  el.classList.remove("beat"); void el.offsetWidth; el.classList.add("beat");
  Audio_.tutorStep();
  try { s.enter(); } catch (e) {}
}
function tutTick(dt) {
  if (!TUT.active || G.mode !== "play" || G.paused) return;
  const s = TUT_STEPS[TUT.step];
  if (!s) return;
  /* the room never empties out from under the player mid-step */
  if (TUT.step > 0 && TUT.step < TUT_STEPS.length - 1 &&
      !G.enemies.length && !G.portals.length) tutSpawn(TUT.step >= 3 ? "dart" : "husk", 2);
  let ok = false;
  try { ok = s.test(dt); } catch (e) { ok = false; }
  if (ok) {
    $("#tutor").classList.add("clear");
    setTimeout(() => $("#tutor").classList.remove("clear"), 420);
    tutNext();
  }
}
function tutFinish() {
  TUT.active = 0; G.tutorial = 0;
  markTutorialDone();
  $("#tutor").classList.remove("on");
  banner("Ready", "the chamber is live");
  Audio_.levelDone();
  /* hand straight over to the real Level 1 — no menu in between, because
     the momentum of "I just learned this, now use it" is the whole point */
  setTimeout(() => {
    if (G.mode !== "play") return;
    transitionTo(() => enterLevel("ch09", 0, 0));
  }, 1400);
}
function skipTutorial() {
  if (!TUT.active) return;
  TUT.active = 0; G.tutorial = 0;
  markTutorialDone();
  $("#tutor").classList.remove("on");
  transitionTo(() => enterLevel("ch09", 0, 0));
}
/* the hooks the run loop calls into — kept tiny and guarded so the tutorial
   can never break an ordinary run */
function tutOnKill() { if (TUT.active) TUT.killed++; }
function tutOnDash() { if (TUT.active) TUT.dashes++; }
function tutOnEcho() { if (TUT.active) TUT.echoes++; }

/* ---------------- what PLAY does ----------------------------------------
   One button, and it always does the obviously right thing:
     never played   -> the tutorial
     mid-progress   -> the level the road is pointing at
   No menu to cross, no mode to choose. */
function playPressed() {
  Audio_.init(); Audio_.resume();
  uiSfx("press");
  if (!tutorialDone()) { transitionTo(() => startTutorial()); return; }
  const t = roadNextTarget();
  transitionTo(() => enterLevel(t.arena, t.idx, 0));
}

/* ---------------- home screen ------------------------------------------ */
function refreshShell() {
  const done = TIMELINES.reduce((n, t) => n + arenaClearedCount(t.id), 0);
  const total = TIMELINES.length * LEVELS_PER_ARENA;
  const pb = $("#homeProg");
  if (pb) {
    const t = roadNextTarget();
    const L = tlOf(t.arena).levels[t.idx];
    $("#playSub").textContent = !tutorialDone()
      ? "Start here"
      : tlOf(t.arena).name + " · Level " + (t.idx + 1);
    $("#homeDone").textContent = done;
    $("#homeTotal").textContent = total;
    $("#homeBar").style.width = (done / total * 100).toFixed(1) + "%";
    $("#homeTro").textContent = fmt(SAVE.trophiesTotal || 0);
  }
}

/* ---------------- wiring ----------------------------------------------- */
$("#playBtn").onclick = playPressed;
$("#playBtn").addEventListener("mouseenter", () => uiSfx("hover"));
$$(".tile").forEach((b) => b.addEventListener("mouseenter", () => uiSfx("hover")));
$$(".ghostbtn, .backbtn").forEach((b) => b.addEventListener("mouseenter", () => uiSfx("hover")));
$("#tutSkip").onclick = () => { uiSfx("back"); skipTutorial(); };

/* refreshHome() is the existing hook every screen already calls after it
   changes progress, so the new footer rides on it rather than inventing a
   second refresh path that can fall out of step. */
const _refreshHome = refreshHome;
refreshHome = function () { _refreshHome(); refreshShell(); };
refreshShell();
