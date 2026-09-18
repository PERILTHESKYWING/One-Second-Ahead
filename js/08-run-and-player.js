/* Run setup, level/wave progression, survival mode, damage resolution, and player controls (fire, dash, time-swap, echo summon, movement). */
/* ---------------- movement + impact tuning ------------------------------
   The frame stops and starts harder than it drifts: it gets up to speed on
   PLAYER_ACCEL and comes off it on the faster PLAYER_DECEL, which is what
   keeps a released key from sliding. Dash and fire are buffered, so a press
   landing just before the cooldown clears still goes off the moment it does
   rather than being eaten. */
const PLAYER_SPEED = 340;          /* base move speed, px/s */
const PLAYER_ACCEL = 20;           /* approach() rate toward the stick/keys */
const PLAYER_DECEL = 30;           /* approach() rate back to a stop — higher than accel on purpose */
const SURGE_SPEED_MUL = 1.22;      /* move speed multiplier while surge is up */
const CHILL_SPEED = .55;           /* move speed while a Special Grade has you chilled */
const DASH_INPUT_BUFFER = .12;     /* 120ms of grace on a dash/swap press */
const FIRE_INPUT_BUFFER = .12;     /* 120ms of grace on the trigger */
const MOVE_SUBSTEP = 9;            /* px per collision substep (see stepPlayer) */
/* Every enemy projectile in the game is scaled by this. Base move speed is
   340px/s and the dash burst is 510: with shots this much quicker you cannot
   simply walk out of a volley any more, which is what makes the dash's
   i-frame window the answer instead of a convenience. */
const HOSTILE_SPEED_MUL = 1.3;

/* ---------------- the dash ----------------------------------------------
   The dash used to fire along the aim, which made it an approach tool: aim
   and fire are automatic, so the aim points at whatever is nearest, which
   is exactly the thing you are usually dashing away from. It now fires
   along the MOVEMENT INPUT instead — the stick/keys decide where you go,
   the gun keeps pointing wherever it was pointing — so you can dash out of
   a squeeze while still shooting into it.

   The aim never gets a say, not even standing still. A dash you did not
   steer goes along the last heading you DID steer (the hull starts facing
   up), because the alternative — falling back to the aim when you happen
   to be between key presses — is the exact behaviour this replaced, and it
   showed up as the dash "still going where the mouse points".

   What makes it an escape rather than a fast walk is the window on the far
   side of it: the i-frames outlast the dash itself, and a speed burst
   carries you clear afterwards. At base speed you cannot outrun a 340px/s
   projectile; inside this window you can. */
const DASH_SPEED = 1180;           /* px/s during the launch */
const DASH_TIME = .17;             /* how long the launch lasts */
const DASH_EXIT_IFRAME = .16;      /* extra invulnerable grace after it ends */
const DASH_SURGE_TIME = .42;       /* speed-burst window opened by a dash */
const DASH_SURGE_MUL = 1.5;        /* move-speed multiplier inside that window */
const DASH_EXIT_SPEED = 1.18;      /* speed the dash hands off at, as a multiple of the burst speed */

/* ---------------- knockback ---------------------------------------------
   Player knockback is a second velocity that decays on its own and is
   integrated inside the substepped move below, so the room's walls get
   their say after every substep and nothing can be shoved through one.
   Decay is a per-second factor, read as Math.pow(x, dt).

   Two rules govern when you get shoved at all:

   1. ONLY PROJECTILES SHOVE YOU. A shot, a shell, a thrown orb, a
      deflected pulse — those carry momentum, so they move you. Walking
      into a body, standing in fire, a Warden's leash tearing at you, a
      hazard line, the room's own heat: all of those hurt and none of them
      move you. Before this, a crowd could pinball you around the room
      with contact damage alone, which is unreadable and unfair; now the
      only thing that relocates you is something you could have dodged.
   2. IT SCALES WITH THE HIT. The multiplier is a power curve on damage,
      so a 6-damage graze barely registers and a 42-damage shell throws
      you most of a body length. */
const PLAYER_KB_DECAY = .03;       /* how fast the player shrugs off a shove */
const KB_PLAYER_REF = 26;          /* damage that maps to the reference shove */
const KB_PLAYER_BASE = 260;        /* px/s of shove at the reference hit */
const KB_PLAYER_EXP = 1.35;        /* how sharply the shove grows with damage */
const KB_PLAYER_MIN = .16;         /* floor on the multiplier — a graze still ticks you */
const KB_PLAYER_MAX = 2.1;         /* ceiling, so nothing one-shots you across the floor */
const KNOCKBACK_PLAYER_BLOCK = 90; /* shove from a hit the shield eats */
const KB_DASH_KEEP = .12;          /* how much of a live shove survives a dash or swap */
const HITSTOP_HURT_MIN_DMG = 12;   /* damage a hit needs before it stops the frame */
/* px of shove handed to an enemy, before its weight divides it. These are
   distances now, not velocities (see shoveEnemy) — what a weight-1.0 body
   actually travels. */
const SHOVE_PULSE = 15;            /* one connecting pulse */
const SHOVE_PULSE_DMG_REF = 11;    /* pulse damage the figure above is quoted at */
const SHOVE_DASH_THROUGH = 74;     /* dashing through a body */
const SHOVE_DASH_SHOCK = 96;       /* the Shockdash core's ring */
const SHOVE_SWAP_WAVE = 88;        /* the Displacement wave module, both ends */
const SHOVE_SPORE_SCATTER = 58;    /* motes thrown clear of the spore that made them */
/* how hard a projectile shove is, as a multiple of the player figure: the
   same curve drives both, so a Revenant's cleave reads heavy on either
   side of the fight */
function playerKbMag(n) {
  return KB_PLAYER_BASE * clamp(Math.pow(n / KB_PLAYER_REF, KB_PLAYER_EXP), KB_PLAYER_MIN, KB_PLAYER_MAX);
}

/* Squash and stretch, driven by how hard the velocity changed this frame.
   Measured against the real manoeuvres, the normaliser below lands roughly:
   walking off the line ~.05, releasing the keys ~.07, slamming the opposite
   direction ~.10. The dash sets its own value at the moment it fires, since
   its velocity jump happens after this is sampled. */
const SQUASH_ACCEL_NORM = 120000;  /* acceleration (px/s²) mapping to a full-scale stretch */
const SQUASH_MAX_STRETCH = .2;     /* stretch ceiling, as a fraction of scale */
const SQUASH_DASH_STRETCH = .2;    /* what a dash stamps on directly */
const SQUASH_DECAY = 10;           /* approach() rate the stretch relaxes at */

/* ---------------- ammo --------------------------------------------------
   The base weapon carries a short magazine instead of firing forever. Every
   shot — one trigger pull, however many pellets multishot turns it into —
   spends one charge. The instant the magazine isn't full, a delay starts
   counting down; firing again resets it. Stop shooting for that long and
   the whole magazine snaps back at once rather than trickling in a charge
   at a time, so a brief pause is enough to be back at full strength. */
const AMMO_MAX = 6;              /* charges in a full magazine */
const AMMO_REFILL_DELAY = .55;   /* seconds of not firing before a full refill */
const AMMO_RING_RADIUS = 30;     /* px out from the hull the ring sits at */
const AMMO_RING_WIDTH = 3;       /* stroke width of one charge segment */
const AMMO_RING_GAP = .09;       /* radians of gap between segments */

/* ---------------- run setup -------------------------------------------- */
function baseMods() {
  return {
    dmgMul: 1 + lvlOf("pulse") * .10, rateMul: 1 + lvlOf("rate") * .07,
    multishot: 0, pierce: 0, homing: 0, explosive: 0,
    crit: lvlOf("crit") * .06, critMul: 3,
    dashCdMul: Math.pow(.87, lvlOf("dashCd")), dashDmgMul: 1 + lvlOf("dashDmg") * .35,
    dashShock: 0, dashBurn: 0,
    echoLifeMul: 1 + lvlOf("echoLife") * .25, echoDmgMul: 1 + lvlOf("echoDmg") * .30,
    echoTwin: 0, echoBoom: 0, echoRate: 1,
    lifesteal: 0, thorns: 0, chain: 0, execute: 0, secondWind: 0,
    magnetMul: 1 + lvlOf("collect") * .3, shardMul: 1 + lvlOf("collect") * .15,
    hpMul: 1, speedMul: 1,
    swapWave: lvlOf("swapWave"), swapFree: lvlOf("swapFree"), decoyGuard: lvlOf("decoyGuard"),
    traceRead: lvlOf("traceRead"), brake: lvlOf("brake"), salvage: lvlOf("salvage"),
  };
}
function makePlayer() {
  const maxHp = Math.round((100 + lvlOf("hp") * 15) * G.mods.hpMul);
  /* never put the hull down inside the room's geometry: some layouts have a
     wall where the old fixed spawn point was (see playerSpawnPoint in
     11-branch-physics.js) */
  const at = typeof playerSpawnPoint === "function" && !G.attract
    ? playerSpawnPoint(13) : { x: W / 2, y: H * .6 };
  return {
    x: at.x, y: at.y, vx: 0, vy: 0, r: 13, aim: -Math.PI / 2,
    kb: { x: 0, y: 0 }, env: { x: 0, y: 0 },
    dashBuffer: 0, fireBuffer: 0, stretch: 0, stretchAng: -Math.PI / 2,
    hp: maxHp, maxHp, fireCd: 0, ammo: AMMO_MAX, ammoMax: AMMO_MAX, ammoRefillT: 0,
    hurtFlash: 0, hitFlash: 0, iframe: 0,
    dashMax: 1, dash: 1, dashCd: 0, dashing: 0, dashHits: null,
    dashAng: null, dashSurge: 0, moveAng: -Math.PI / 2, moveT: 99,
    echoMax: 1 + lvlOf("echoCharge"), echo: 1 + lvlOf("echoCharge"), echoCd: 0,
    surge: 0, surgeActive: 0,
    shieldMax: lvlOf("shield"), shield: lvlOf("shield"), shieldCd: 0,
    hist: [], regen: lvlOf("regen") * .5, windUsed: false,
    burn: [], burnAt: null, chill: 0,
    recallCd: 0, swapFlash: 0,
  };
}
function clearWorld() {
  G.enemies = []; G.bullets = []; G.hostiles = []; G.pickups = []; G.echoes = []; G.lasers = []; G.traces = [];
  G.parts = []; G.rings = []; G.texts = []; G.zones = []; G.beams = []; G.portals = []; G.queue = [];
  G.ghosts = []; G.shocks = []; G.debris = []; G.corpses = [];
  G.boss = null; G.trauma = 0; G.freeze = 0;
  G.stasis = []; G.chill = []; G.pillars = []; G.charges = []; G.omegaEchoes = [];
  /* the barrier drones' projected walls, which live in the same solids list
     as the authored geometry (see 11-branch-physics.js) */
  G.barriers = []; G.barrierVer = (G.barrierVer || 0) + 1;
  G.wake = []; G.snap = []; G.safeWedge = null;
  /* the room's own accumulated state — a shattered Glassfall floor, a
     Terminus clock mid-escalation (see resetBranchLevel in
     11-branch-physics.js) */
  if (typeof resetBranchLevel === "function") resetBranchLevel();
}
function newRun(survival, startAt) {
  G.mode = "play"; G.attract = false; G.paused = false; G.drafting = false; G.carding = false;
  G.survival = !!survival; G.elites = 0;
  G.chroma = 0; G.slowmo = 0; G.deathT = 0;
  G.mods = baseMods(); G.cores = {};
  abilReset();
  /* the HUD row is the loadout, so it is rebuilt with the loadout rather
     than once at boot */
  buildAbilities();
  G.score = 0; G.kills = 0; G.shards = 0; G.combo = 0; G.comboTimer = 0; G.runTime = 0;
  G.levelIdx = startAt || 0; G.loop = 0; G.wave = 0; G.breather = 0; G.draftIn = 0;
  G.tutorial = 0;
  G.mutation = survival ? 0 : G.mutation;
  clearWorld();
  resetBranchState();
  G.player = makePlayer();
  makeDust();
  /* startAt is which level of the arena to open on — the map hands it
     straight here rather than starting at level 1 and then jumping, which
     used to build the room and the hull twice per entry */
  startLevel(G.levelIdx);
}
function installCore(core, silent) {
  const have = G.cores[core.id] || 0;
  if (have >= core.max) return false;
  G.cores[core.id] = have + 1;
  core.apply(G.mods);
  if (G.player) {
    const nm = Math.round((100 + lvlOf("hp") * 15) * G.mods.hpMul);
    const ratio = G.player.hp / G.player.maxHp;
    G.player.maxHp = nm; G.player.hp = Math.min(nm, Math.round(nm * ratio));
  }
  if (!silent) { toast(core.name + " installed", "var(--echo)"); Audio_.confirm(); }
  return true;
}
function makeDust() {
  G.dust = [];
  for (let i = 0; i < 46; i++) G.dust.push({ x: rnd(W), y: rnd(H), z: rnd(1, .3), s: rnd(2.2, .6), a: rnd(TAU) });
}

/* ---------------- levels + waves ---------------------------------------
   A "run" used to be a continuous trip through every level in a branch:
   clearWorld() reset your mods ONCE, at the start of the branch, and a
   level clear fed straight into startLevel(idx + 1) with your drafted build
   carried forward. Levels are discrete attempts now — you enter one from
   the map, you finish it, and you go back to the map — so the reset moved
   with them.

   MODS RESET EVERY LEVEL ATTEMPT. Every attempt starts from baseMods() plus
   your persistent three-ability loadout, full stop. Two reasons, one of
   which is the whole reason the Trophy Road works at all:

     · trophies are directly comparable between attempts. You cannot
       out-trophy your own record purely by having stacked more mods on the
       way in, so the number measures how you played rather than how long
       you had been playing.
     · it reframes the draft as "your build for this fight" instead of "your
       build for this whole branch", which is why the draft moved from level
       clear to WAVE clear (see tickWaves) — a core handed out as the level
       ends would be a core you never get to use.

   The cost, worth naming once rather than discovering later: the "build
   snowballs the deeper you go in one sitting" arc is gone. That is a
   deliberate trade for the level structure, not an oversight. */
function startLevel(idx) {
  G.levelIdx = idx;
  G.wave = 0; G.breather = 0; G.waveClearing = false;
  G.draftIn = 0; G.drafting = false;
  backdropDirty = true;
  const L = curLevel();
  Audio_.setPalette(L);
  Audio_.target = .3;
  clearWorld();
  if (!G.survival && !G.attract) {
    G.mods = baseMods();
    G.cores = {};
    abilReset();
    buildAbilities();
    /* this attempt's own record, for the trophy formula */
    G.levelHits = 0; G.levelT = 0; G.levelDone = 0; G.levelResolved = 0;
    G.attemptTrophy = null;
    /* a fresh hull: an attempt is not scored against how much integrity the
       last one happened to leave you with. clearWorld() first, so the spawn
       point is picked against the room this level actually has. */
    G.player = makePlayer();
    makeDust();
  }
  showLevelCard(L);
}
function beginLevelWaves() { clearTimeout(hookTimer); G.cardIn = 0; G.carding = false; $("#levelCard").classList.remove("on"); startWave(1); }
/* Fills a spawn budget the same way every wave always has: pick a type from
   the pool, spend its cost, maybe roll it elite, stagger the next one in.
   Takes an optional starting point (t/spent) so a template can run this
   more than once — a swarm, then a pause, then a finisher — while the
   total still lands in the same budget envelope it always did. */
function fillBudget(types, budget, eliteOdds, tStart, spentStart) {
  const queue = [];
  let spent = spentStart || 0, t = tStart || 0;
  while (spent < budget) {
    const type = pick(types);
    const c = EN[type].cost;
    if (spent + c > budget + 2) break;
    const el = c >= 2 && chance(eliteOdds);
    spent += c * (el ? 2 : 1);
    queue.push({ type, t, elite: el });
    t += rnd(.14, .55);
    if (chance(.2)) t += rnd(.4, 1.1);
  }
  return queue;
}
/* Authored wave shapes. Each one still spends the exact same budget the
   plain fill would (same cost table, same elite odds) — they only decide
   which flank things come from and how they're paced against each other,
   not how strong the wave is. A level opts in with `waveTemplates: [...]`
   and the level cycles through its list wave by wave. */
const WAVE_TEMPLATES = {
  /* both flanks open up at once and squeeze toward the middle */
  pincer(types, budget, tier, eliteOdds) {
    const half = budget / 2;
    const left = fillBudget(types, half, eliteOdds, 0);
    const right = fillBudget(types, half, eliteOdds, rnd(.3, 0));
    left.forEach((q) => q.side = "left");
    right.forEach((q) => q.side = "right");
    return left.concat(right);
  },
  /* a fast rush of chaff, a beat of quiet, then the heaviest thing the
     level has finishes out the budget */
  swarmElite(types, budget, tier, eliteOdds) {
    const cheap = types.filter((t) => EN[t].cost <= 1);
    const pool = cheap.length ? cheap : types;
    const heavy = types.slice().sort((a, b) => EN[b].cost - EN[a].cost)[0];
    const swarm = fillBudget(pool, Math.round(budget * .62), eliteOdds);
    const spent = swarm.reduce((s, q) => s + EN[q.type].cost * (q.elite ? 2 : 1), 0);
    const t = (swarm.length ? swarm[swarm.length - 1].t : 0) + rnd(1, 1.5);
    return swarm.concat(fillBudget([heavy], budget, eliteOdds, t, spent));
  },
  /* the budget fills in a slow rotation through all four walls at once,
     so it reads as being surrounded rather than rushed from one side */
  surround(types, budget, tier, eliteOdds) {
    const queue = [], sides = ["top", "right", "bottom", "left"];
    let spent = 0, t = 0, i = 0;
    while (spent < budget) {
      const type = pick(types);
      const c = EN[type].cost;
      if (spent + c > budget + 2) break;
      const el = c >= 2 && chance(eliteOdds);
      spent += c * (el ? 2 : 1);
      queue.push({ type, t, elite: el, side: sides[i % 4] });
      i++;
      t += (i % 4 === 0) ? rnd(.5, 1.1) : rnd(.02, .08);
    }
    return queue;
  },
};
function startWave(n) {
  const L = curLevel();
  G.wave = n; G.waveClearing = false;
  if (G.survival) { startSurvivalWave(n); return; }
  const tier = L.dt != null ? L.dt : G.loop * LEVELS_PER_ARENA + G.levelIdx;
  const isBoss = L.boss && n === L.waves;
  /* The opening waves used to be a warm-up for a pilot who had not bought
     anything yet. That pilot no longer exists, so wave 1 lands with roughly
     double the bodies it used to and the per-wave ramp is steeper.

     The base is the LEVEL's now (`bud`), not a constant — which is what
     lets the four tiers each sit at their own calibrated weight instead of
     all riding one slope. See 02b-arena-curve.js. */
  const budget = Math.round((L.bud != null ? L.bud : 12) + tier * 2.2 + n * 3.4 + G.loop * 8);
  G.queue = [];
  if (isBoss) {
    G.queue.push({ type: TL.boss, t: 1 });
    /* The finale used to be the boss plus five of the arena's cheapest
       body, at whatever difficulty level 3 or 6 happened to be. Bosses read
       as too easy for what they are, so the Reckoning tier gets the escort
       scaled with the level's own budget as well as the boss multiplier
       spawnEnemy applies — a finale should be the hardest fight in its
       arena by a clear margin, not a victory lap. */
    const add = TL.roster[0], heavy = TL.roster[Math.min(3, TL.roster.length - 1)];
    const n7 = 5 + Math.round(budget / 14);
    for (let i = 0; i < n7; i++) G.queue.push({ type: i % 3 === 2 ? heavy : add, t: 2.4 + i * .5 });
  } else {
    const eliteOdds = clamp((tier - 1) * .04 + .03, 0, .34);
    const tmplId = L.waveTemplates && L.waveTemplates.length ? L.waveTemplates[(n - 1) % L.waveTemplates.length] : null;
    const tmpl = tmplId && WAVE_TEMPLATES[tmplId];
    G.queue = tmpl ? tmpl(L.types, budget, tier, eliteOdds) : fillBudget(L.types, budget, eliteOdds);
  }
  Audio_.waveIn();
  updateWaveDots();
  if (isBoss) {
    /* the boss wave announces itself: its own sound, and the HUD flashing
       once so the change of gear is felt and not just read */
    if (typeof Audio_.bossWarn === "function") Audio_.bossWarn();
    const h = $("#hud"); if (h) { h.classList.remove("boss"); void h.offsetWidth; h.classList.add("boss"); }
    banner(EN[TL.boss].label, TL.code.toLowerCase());
  }
  else if (n === 1) banner(L.name, L.hook.split(".")[0].toLowerCase());
  else banner("Wave " + n, "of " + L.waves);
}
/* ---- survival: one chamber, no end, everything gets worse -------------
   Two rules changed here.

   NO BOSS. Survival used to drop a Paradox every tenth wave, which turned a
   pure endurance mode into a boss-rush with waiting in between. What replaces
   it is the SPECIAL GRADE (see 16-abilities.js): any body that walks in can
   roll a gold-coronaed mutation with raised stats and an ability its ordinary
   version does not have, and the odds climb with the wave. The spike comes
   from the room getting stranger rather than from one scheduled monster.

   EVERY ENEMY, FROM WAVE ONE. The old staged unlock meant the first ten
   waves could only ever produce four kinds of trouble, and anything drafted
   from the later chambers never showed up at all. The whole Chamber 09
   roster is in the pool immediately; the wave budget is what stops wave 1
   from being three Broodmothers, not a list of what you are allowed to meet
   yet. */
function survivalTypes() {
  const out = [];
  for (const L of CH09_LEVELS) for (const t of L.types) if (out.indexOf(t) < 0) out.push(t);
  return out;
}
function startSurvivalWave(n) {
  const idx = ((n - 1) / 4 | 0) % LEVELS.length;
  if (idx !== G.levelIdx) { G.levelIdx = idx; backdropDirty = true; Audio_.setPalette(curLevel()); }
  const types = survivalTypes();
  const budget = Math.round(12 + n * 3.8);
  const eliteOdds = clamp((n - 3) * .04, 0, .42);
  /* Everything is in the pool from wave one, but the early waves are drawn
     with a bias toward the cheap end, easing off as the waves climb. Without
     it the whole roster being available means wave 1 is a coin flip between
     five Husks and two Broodmothers, and neither of those is a first wave.
     By about wave 20 the bias is gone and the draw is flat. */
  const bias = clamp(1 - (n - 1) / 20, 0, 1);
  const drawType = () => {
    if (bias <= 0) return pick(types);
    let best = pick(types);
    /* take the cheaper of two draws, `bias` of the time */
    if (chance(bias)) { const alt = pick(types); if (EN[alt].cost < EN[best].cost) best = alt; }
    return best;
  };
  G.queue = [];
  let spent = 0, t = 0;
  while (spent < budget) {
    const type = drawType();
    const c = EN[type].cost;
    if (spent + c > budget + 2) break;
    const el = c >= 2 && chance(eliteOdds);
    spent += c * (el ? 2 : 1);
    G.queue.push({ type, t, elite: el });
    t += rnd(.1, .46);
    if (chance(.18)) t += rnd(.3, .9);
  }
  Audio_.waveIn();
  updateWaveDots();
  const odds = Math.round(mutChance() * 100);
  banner("Wave " + n, n < 6 ? "hold the chamber"
    : n < 14 ? "special grade · " + odds + "%"
    : "no more excuses · special grade " + odds + "%");
}
/* `side` ("top"/"right"/"bottom"/"left") lets a wave template choose which
   flank an enemy steps in from instead of a fully random edge — a branch
   with its own room shape (see BRANCHFN.spawnEdge) can also redirect this
   to a point that actually belongs to its floor. */
function edgePoint(side) {
  if (BRANCHFN.spawnEdge) return BRANCHFN.spawnEdge(side);
  const pad = 52;
  const e = side === "top" ? 0 : side === "right" ? 1 : side === "bottom" ? 2 : side === "left" ? 3 : rint(0, 3);
  if (e === 0) return { x: rnd(W - pad, pad), y: pad };
  if (e === 1) return { x: W - pad, y: rnd(H - pad, pad) };
  if (e === 2) return { x: rnd(W - pad, pad), y: H - pad };
  return { x: pad, y: rnd(H - pad, pad) };
}
/* The pilot no longer buys stats — every permanent upgrade starts maxed (see
   BASELINE in 01-engine-core.js), so the fight has to come up to meet it.
   These are flat multipliers on every body in the game, on top of the
   existing per-level tier scaling. Health carries most of it; speed carries
   least, because speed is what makes a room unreadable rather than hard. */
const ENEMY_HP_BUFF = 1.4;
const ENEMY_DMG_BUFF = 1.18;
const ENEMY_SPEED_BUFF = 1.08;
/* ---- how fast the room attacks ---------------------------------------
   Every enemy in the game runs its wind-ups, volleys, sweeps and lunges off
   ONE clock: `dtr` in updateEnemies (09-enemies-and-render.js), which is
   the frame delta scaled by whatever rate multipliers the body is carrying.
   Every AI counts its own `e.timer` down on that clock, so this is the one
   number that changes how fast the whole roster attacks — not a pass over
   thirty-odd per-enemy tables that would drift apart the first time one of
   them was edited.

   Combat read as too slow at every difficulty: the bodies arrived, and then
   there was a beat of nothing while they all wound up. This closes the gaps
   between attacks without touching how much each one hurts, how much health
   anything has, or how fast anything moves — the room gets busier, not
   spikier, which is the difference between "faster" and "cheaper". */
const ENEMY_RATE_BUFF = 1.35;
function spawnEnemy(type, x, y, elite) {
  const d = EN[type];
  const tier = tierNow();
  /* a branch can be flatly harder than the baseline — see TIMELINES[].diff.
     Health takes the multiplier whole; speed takes a third of it. */
  const diff = TL && TL.diff ? TL.diff : 1;
  /* the Reckoning tier's own multiplier, applied to the BOSS only: the
     escort already rides the level's difficulty tier, but the boss's health
     and damage come off a flat table and would otherwise be exactly what
     they were when it sat at level 3 of 3. See bossMul in 02b-arena-curve.js. */
  const L = curLevel();
  const bm = (!G.survival && L && L.bossMul && BOSSES[type]) ? L.bossMul : 1;
  const hpMul = (1 + tier * .17 + G.loop * .5) * (elite ? 2.4 : 1) * diff * ENEMY_HP_BUFF * bm;
  const spMul = Math.min(1.65, 1 + tier * .024) * (elite ? 1.16 : 1) * (1 + (diff - 1) * .34) * ENEMY_SPEED_BUFF;
  const e = {
    type, x, y, vx: 0, vy: 0, r: d.r, hp: d.hp * hpMul, maxHp: d.hp * hpMul,
    sp: d.sp * spMul, dmg: d.dmg * ENEMY_DMG_BUFF * (bm > 1 ? 1 + (bm - 1) * .6 : 1),
    ang: rnd(TAU), wob: rnd(TAU), hit: 0, state: 0,
    timer: rnd(.4, 1.6), born: 0, sh: null, blink: 1, blinkT: rnd(3, 1),
    face: rnd(TAU), deflect: 0, fuse: 0, lockAng: 0, pop: 0, tether: 0, birth: 0, burst: 0,
    stun: 0, brand: 0, brandT: 0, mut: null, iframeT: 0,
    elite: !!elite, mod: "",
  };
  if (elite) {
    e.r = d.r * 1.16; e.dmg = d.dmg * 1.35 * ENEMY_DMG_BUFF;
    e.mod = pick(["armoured", "frenzied", "volatile"]);
    if (e.mod === "frenzied") { e.sp *= 1.45; e.rateMul = 1.6; }
    if (e.mod === "armoured") { e.sp *= .85; e.armour = .55; }
    G.elites++;
  }
  if (BOSSES[type]) { e.phase = 0; e.spin = 0; e.timer = 2.4; e.pending = null; G.boss = e; e.handAng = -Math.PI / 2; }
  if (type === "zenith") e.cores = null;
  if (type === "vestige") { e.peace = 0; e.calm = 0; }
  if (type === "sounding") e.load = 0;
  if (type === "trench") e.sub = 0;
  if (type === "mimic") e.delay = rint(70, 110);
  /* survival only: the roll that turns an ordinary body into a Special
     Grade. Done here rather than at the wave level so it applies to
     everything that ever enters the room — including the ones other enemies
     summon or split into. */
  if (G.survival && !BOSSES[type] && chance(mutChance())) makeSpecial(e);
  /* the same system, opted into deliberately on a level you have already
     cleared — see the mutation replay in 02c-trophy-road.js */
  else if (G.mutation && !G.survival && !BOSSES[type] && chance(mutReplayChance())) makeSpecial(e);
  G.enemies.push(e);
  if (!SAVE.seen[type]) { SAVE.seen[type] = 1; persist(); }
  return e;
}
/* The spawn pump: queued bodies become portals, portals become enemies.
   Shared by the wave director and the tutorial script, so a body arrives the
   same way and with the same telegraph in both. */
function tickSpawns(dt) {
  for (let i = G.queue.length - 1; i >= 0; i--) {
    G.queue[i].t -= dt;
    if (G.queue[i].t <= 0) {
      const p = edgePoint(G.queue[i].side);
      G.portals.push({ x: p.x, y: p.y, t: 0, type: G.queue[i].type, elite: G.queue[i].elite });
      G.queue.splice(i, 1);
    }
  }
  for (let i = G.portals.length - 1; i >= 0; i--) {
    const p = G.portals[i]; p.t += dt;
    if (p.t >= .55) {
      spawnEnemy(p.type, p.x, p.y, p.elite);
      ring(p.x, p.y, ecol(EN[p.type].col), 6, 52, .4, 2.2);
      burst(p.x, p.y, 8, ecol(EN[p.type].col), .8, { life: .35 });
      G.portals.splice(i, 1);
    }
  }
}
function tickWaves(dt) {
  if (G.carding) { G.cardIn -= dt; if (G.cardIn <= 0) beginLevelWaves(); return; }
  if (G.drafting) return;
  /* The tutorial is the ordinary run loop with the wave director switched
     off and a script driving what walks in instead (see tutTick in
     18-shell.js). Spawn portals still resolve — that is how bodies get into
     the room — but nothing counts waves, hands out cores or ends a level. */
  if (G.tutorial) { tickSpawns(dt); if (typeof tutTick === "function") tutTick(dt); return; }
  if (G.draftIn > 0) { G.draftIn -= dt; if (G.draftIn <= 0) { G.draftIn = 0; openDraft(); } return; }
  if (G.breather > 0) {
    G.breather -= dt;
    if (G.breather <= 0) startWave(G.wave + 1);
    return;
  }
  tickSpawns(dt);
  if (!G.waveClearing && !G.queue.length && !G.portals.length && !G.enemies.length) {
    G.waveClearing = true;
    const L = curLevel();
    healPlayer(G.player.maxHp * (G.survival ? .13 : .1));
    if (G.survival) {
      G.score += 140 * G.wave;
      text(W / 2, H * .42, "wave " + G.wave + " held", TH.core, 20);
      Audio_.confirm();
      SAVE.bestWave = Math.max(SAVE.bestWave, G.wave); persist();
      if (G.wave % 3 === 0) G.draftIn = 1.0; else G.breather = 2.3;
      updateWaveDots();
      return;
    }
    if (G.shotsThisWave === 0 && G.kills > 0) unlockSecret("observer");
    G.shotsThisWave = 0;
    if (G.wave >= L.waves) {
      G.score += 250 * (G.levelIdx + 1 + G.loop * LEVELS_PER_ARENA);
      text(W / 2, H * .42, "level cleared", TH.core, 22);
      Audio_.confirm();
      G.levelDone = 1;
      /* the attempt ends here rather than chaining into the next level —
         see finishLevel() */
      setTimeout(() => { if (G.mode === "play" && G.levelDone) finishLevel(true); }, 1200);
    } else {
      /* The draft moved here, from level clear to WAVE clear. Mods reset
         every level attempt now (see startLevel), so a core handed out as
         the level ENDS is a core that never gets fired — it would be
         installed into a build that is about to be thrown away. Drafting
         between the waves of a level is what makes "your build for this
         fight" a real sentence. */
      text(W / 2, H * .42, "wave cleared", TH.core, 18);
      Audio_.confirm();
      G.draftIn = 1.0;
    }
    updateWaveDots();
  }
}
/* Called when the draft closes. In survival it goes back to the waves; in a
   story arena it resumes the level the draft interrupted, because the draft
   now happens BETWEEN WAVES rather than between levels. Nothing auto-chains
   into the next level any more — see finishLevel(). */
function nextLevel() {
  if (G.survival) { G.breather = 1.5; return; }
  G.breather = 1.4;
}

/* ---------------- finishing a level attempt ----------------------------
   The end of every story-level attempt, cleared or died, and the only place
   an attempt is scored. It banks the trophies, pays the first-clear reward
   if this was one, and hands the player back to the map — which is the
   actual structural change this whole rework rests on. Before, a clear fed
   straight into the next level and a death threw you back to the branch's
   level 1; neither let you choose what to play next. */
function finishLevel(cleared) {
  if (G.survival || G.attract || G.tutorial || G.levelResolved) return;
  G.levelResolved = 1;
  G.levelDone = 0;
  const L = curLevel();
  const idx = G.levelIdx;
  const arena = TL.id;
  const waves = Math.max(1, L.waves || 1);
  const a = {
    cleared: !!cleared,
    /* Died partway: WHICH WAVE you were on, over the level's wave count.
       Dying on wave 2 of a four-wave level is 50%, not 37.5% — the wave you
       are standing in counts as reached, which is what makes a failed
       attempt bank something worth having rather than something rounded
       down to nearly nothing. */
    pct: cleared ? 1 : clamp(G.wave / waves, 0, 1),
    noHit: G.levelHits === 0,
    fast: G.levelT <= (L.par || 90),
    mutation: !!G.mutation,
  };
  const res = recordAttempt(arena, idx, a);
  G.attemptTrophy = res;
  /* Chamber 09 is the one arena with nothing waiting behind it, so it keeps
     its endless loop past level 15 as post-clear farming. Every other arena
     stops at its boss and hands you the next branch instead. */
  if (cleared && idx === LEVELS_PER_ARENA - 1) { markBranchCleared(); branchVictory(); }
  SAVE.bestLevel = Math.max(SAVE.bestLevel, G.loop * LEVELS_PER_ARENA + idx + 1);
  SAVE.bestScore = Math.max(SAVE.bestScore, G.score);
  const banked = Math.round(G.shards);
  SAVE.shards += banked;
  SAVE.runs++;
  persist();
  G.mode = "dead";
  Audio_.target = .05;
  showLevelResults(cleared, banked, res);
}

/* ---------------- damage ----------------------------------------------- */
function damageEnemy(e, dmg, opt) {
  opt = opt || {};
  if (e.dead) return;
  const m = G.mods;
  let d = dmg, crit = false;
  if (typeof admOneShot !== "undefined" && admOneShot && !BOSSES[e.type]) d = e.hp + 1;
  if (BRANCHFN.dmgAt) d *= BRANCHFN.dmgAt(e.x, e.y);
  if (!opt.noCrit && m.crit > 0 && chance(m.crit)) { d *= m.critMul; crit = true; }
  if (G.player && G.player.surgeActive > 0) d *= 1.5;
  if (e.armour) d *= (1 - e.armour);
  /* a branded body takes more from every source, not only from the ability
     that branded it — that is what makes Phase Brand worth a slot on its own */
  if (e.brand > 0) d *= brandAmp(e);
  /* a Special Grade's own ward, and any ward being projected onto it by a
     Special Grade standing nearby */
  d = mutResist(e, d);
  if (G.survival) d *= mutAuraResist(e);
  if (e.iframeT > 0) return;
  e.hp -= d; e.hit = HIT_FLASH_ENEMY;
  /* which way the hit came in: given by the caller, or read off the impact
     point. Area damage has neither, and keeps its old radial spray. */
  let hitAng = opt.ang;
  if (hitAng == null && opt.x != null && opt.y != null && (opt.x !== e.x || opt.y !== e.y))
    hitAng = Math.atan2(e.y - opt.y, e.x - opt.x);
  if (m.execute && e.type !== "paradox" && e.hp > 0 && e.hp / e.maxHp < m.execute) e.hp = 0;
  if (m.lifesteal > 0) healPlayer(Math.min(d, 40) * m.lifesteal);
  if (crit) critFx(e, d, hitAng);
  if (opt.spark !== false) {
    const sx = opt.x == null ? e.x : opt.x, sy = opt.y == null ? e.y : opt.y;
    const n = crit ? 9 : 4, scol = crit ? TH.shard : ecol(EN[e.type].col), force = crit ? 1.3 : .7;
    if (hitAng == null) burst(sx, sy, n, scol, force, { life: .3, size: rnd(1, 2.4) });
    else directionalBurst(sx, sy, n, scol, force, hitAng, { life: .3, size: rnd(1, 2.4) });
  }
  if (e.hp <= 0) killEnemy(e);
}
function killEnemy(e) {
  if (e.dead) return;
  /* Flagged dead FIRST, before any on-death effect runs. A Special Grade
     whose mutation is an explosion damages everything nearby — including
     itself, since it is still in G.enemies — and without this flag that is
     an infinite recursion: explode, re-kill, explode. damageEnemy ignores
     anything already flagged, so the flag is the base case. */
  e.dead = true;
  /* a Special Grade with Second Wind gets back up once (and clears the flag
     again), and nothing else in the death pipeline runs — no shards, no
     score, no corpse. The ones that do not revive drop their burst / rot /
     split here instead and carry on dying normally. */
  if (e.mut && mutOnDeath(e)) return;
  const m = G.mods, d = EN[e.type], col = ecol(d.col);
  corpse(e, col);
  debris(e.x, e.y, clamp(Math.round(e.r * .55), 3, 14), col, e.r > 18 ? 1.3 : .85, { size: e.r / 14 });
  shock(e.x, e.y, { r0: e.r * .6, r1: e.r * (e.type === "paradox" ? 12 : 3.4), life: .3, col, w: e.r > 18 ? 5 : 2.6 });
  if (e.elite) {
    flash(.09, "255,214,138");
    ring(e.x, e.y, "255,214,138", 8, 190, .5, 4);
    if (e.mod === "volatile") explode(e.x, e.y, 168, 30, "255,196,120", 1);
  }
  G.combo++; G.comboTimer = 3.2;
  G.score += Math.round(d.score * (1 + Math.min(G.combo, 30) * .1) * (1 + (G.levelIdx + G.loop * LEVELS_PER_ARENA) * .12));
  G.kills++;
  const p = G.player;
  if (p && p.surgeActive <= 0) {
    p.surge = Math.min(100, p.surge + (e.type === "paradox" ? 100 : 5.5));
    if (p.surge >= 100) triggerSurge();
  }
  const n = Math.round(d.shards * m.shardMul * (chance(.18) ? 2 : 1));
  for (let i = 0; i < n; i++) G.pickups.push({ x: e.x + rnd(-8, 8), y: e.y + rnd(-8, 8), vx: rnd(-90, 90), vy: rnd(-90, 90), r: 6, spin: rnd(TAU), life: 16, kind: "shard" });
  if (chance(e.r > 16 ? .38 : .07)) G.pickups.push({ x: e.x, y: e.y, vx: rnd(-50, 50), vy: rnd(-50, 50), r: 8, spin: 0, life: 14, kind: "cell" });
  boomFx(e.x, e.y, col, e.r / 13, { n: e.type === "paradox" ? 170 : 15 + d.r, force: e.type === "paradox" ? 2.4 : 1.15, r: e.r });
  if (m.salvage > 0 && e.type !== "mote" && inLiveTrace(e.x, e.y, e.r)) {
    for (let i = 0; i < m.salvage; i++) G.pickups.push({ x: e.x + rnd(-10, 10), y: e.y + rnd(-10, 10), vx: rnd(-70, 70), vy: rnd(-70, 70), r: 6, spin: rnd(TAU), life: 16, kind: "shard" });
    text(e.x, e.y - e.r - 14, "salvage", TH.shard, 12);
  }
  Audio_.kill(G.combo);
  shake(e.type === "paradox" ? TRAUMA_DEATH_BOSS : e.r > 16 ? TRAUMA_DEATH_HEAVY : TRAUMA_DEATH_LIGHT);
  hitStop(e.type === "paradox" ? HITSTOP_BOSS_KILL : e.r > 16 ? HITSTOP_HEAVY : HITSTOP_LIGHT);
  if (e.type === "bloom") { explode(e.x, e.y, 158, 40, col); zone(e.x, e.y, 74, 3.2, 26, col); }
  if (e.type === "spore") {
    for (let i = 0; i < 3; i++) {
      const a = rnd(TAU);
      const s = spawnEnemy("mote", e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18);
      shoveEnemy(s, a, SHOVE_SPORE_SCATTER);
    }
  }
  G.killed[e.type] = (G.killed[e.type] || 0) + 1;
  abilOnKill(e);
  if (BRANCHFN.onKill) BRANCHFN.onKill(e);
  if (BOSSES[e.type]) {
    G.boss = null; flash(.5, col); shake(TRAUMA_DEATH_BOSS_BONUS);
    text(e.x, e.y - 46, BOSS_EPITAPH[e.type] || "resolved", col, 22);
    if (e.type === "omega" && e.flawless) unlockSecret("zero");
    markBranchCleared();
  }
  if (m.chain > 0 && e.type !== "mote") {
    const near = G.enemies.filter((o) => !o.dead && o !== e && dist(o, e) < 250).slice(0, m.chain * 2);
    near.forEach((o) => { beam(e.x, e.y, o.x, o.y, TH.core); damageEnemy(o, 22 * m.dmgMul, { noCrit: true }); });
  }
  const i = G.enemies.indexOf(e);
  if (i >= 0) G.enemies.splice(i, 1);
  if (typeof tutOnKill === "function") tutOnKill();
}
/* `quiet` strips an explosion back to its damage and a token ring: no
   screen flash, no camera shake, no audio, a fifth of the debris. Anything
   that can fire in BULK passes it — Volatile rounds detonating on every
   pellet of a multishot, a chain arc, a burning trail. One explosion is a
   moment; twenty in a frame is a slideshow that also sounds like mud, and
   they were the single worst offender for frame time.
   The set-piece explosions (a Bloom opening, a depth charge, a boss) still
   come through loud. */
function explode(x, y, r, dmgPlayer, col, quiet) {
  ring(x, y, col, 8, r, .34, quiet ? 2 : 4);
  boomFx(x, y, col, r / 60, { n: quiet ? 7 : 34, force: quiet ? 1 : 1.6, r: 16 });
  if (!quiet) { flash(.09, col); shake(.3); Audio_.boom(); }
  else if (Audio_.rateOk("bulkboom", .12)) { Audio_.boom(); shake(.08); }
  for (const e of G.enemies.slice()) {
    const d = dist(e, { x, y });
    if (d < r + e.r) damageEnemy(e, 46 * (1 - d / (r + e.r)) + 14, { noCrit: true });
  }
  const p = G.player;
  if (dmgPlayer > 0 && p) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < r + p.r) hurtPlayer(dmgPlayer * (1 - d / (r + p.r)));
  }
}
function healPlayer(n) {
  const p = G.player;
  if (!p || p.hp <= 0) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + n);
  if (p.hp - before > 3) text(p.x, p.y - 26, "+" + Math.round(p.hp - before), TH.core, 13);
}
/* `shot` marks the hit as carrying momentum — a projectile, and nothing
   else. It is the only thing that moves the player (see the knockback
   notes at the top of this file); contact, burn, tether and hazard lines
   pass it as falsy and do damage where you stand. */
function hurtPlayer(n, src, shot) {
  const p = G.player;
  if (!p || p.hp <= 0 || p.iframe > 0 || G.mode !== "play") return;
  if (typeof admGod !== "undefined" && admGod) return;
  if (G.boss && G.boss.type === "omega" && G.boss.phase >= 2) G.boss.flawless = 0;
  /* the line from whatever hit you to you — sparks ride it whatever the
     source was, the shove only when the source was a projectile */
  const hitAng = src && src.x != null ? Math.atan2(p.y - src.y, p.x - src.x) : null;
  const kbAng = shot ? hitAng : null;
  if (p.shield > 0 && n > 4) {
    p.shield--; p.shieldCd = 11; p.iframe = .5;
    ring(p.x, p.y, TH.core, 16, 92, .4, 3);
    burst(p.x, p.y, 22, TH.core, 1.2);
    if (kbAng != null) { p.kb.x += Math.cos(kbAng) * KNOCKBACK_PLAYER_BLOCK; p.kb.y += Math.sin(kbAng) * KNOCKBACK_PLAYER_BLOCK; }
    Audio_.deflect(); shake(TRAUMA_BLOCK); flash(.08);
    text(p.x, p.y - 30, "deflected", TH.core, 13);
    return;
  }
  p.hp -= n;
  /* the untouched bonus is judged on this: anything that actually takes
     integrity off counts, including the room's own hazards — "untouched"
     means untouched, not "nothing with a face hit me" */
  G.levelHits++;
  p.hurtFlash = Math.min(1, p.hurtFlash + n / 26);
  p.hitFlash = HIT_FLASH_PLAYER;
  if (n > 5) {
    Audio_.hurt(); shake(clamp(n / 40, TRAUMA_HURT_MIN, TRAUMA_HURT_MAX)); flash(clamp(n / 90, .04, .2), "255,90,124");
    if (hitAng == null) burst(p.x, p.y, 8, "255,90,124", 1);
    else directionalBurst(p.x, p.y, 8, "255,90,124", 1, hitAng);
    if (kbAng != null) {
      /* the power curve does the work: a Facet's thin ray nudges you, a
         Howitzer shell throws you most of a body length. Counterweight, if
         it is equipped, banks the shove instead of taking it. */
      const kbMag = playerKbMag(n);
      if (!abilEatKnockback(kbMag)) {
        p.kb.x += Math.cos(kbAng) * kbMag; p.kb.y += Math.sin(kbAng) * kbMag;
      }
    }
    /* only a real hit stops the frame — chip and tick damage never would,
       or being tethered would stutter the whole room */
    if (n >= HITSTOP_HURT_MIN_DMG) hitStop(HITSTOP_LIGHT);
    G.combo = 0;
  }
  if (src && G.mods.thorns > 0 && src.hp !== undefined) damageEnemy(src, G.mods.thorns, { noCrit: true });
  if (p.hp <= 0 && G.tutorial) {
    /* the tutorial cannot kill you: a new player dying to the lesson is the
       lesson failing, not them. It still hurts, so the feedback is real. */
    p.hp = Math.max(12, p.maxHp * .12);
    p.iframe = Math.max(p.iframe, 1.1);
    return;
  }
  if (p.hp <= 0) {
    if (G.mods.secondWind > 0 && !p.windUsed) {
      p.windUsed = true; p.hp = 35; p.iframe = 1.6;
      ring(p.x, p.y, TH.shard, 12, 270, .7, 4);
      flash(.36, TH.shard); Audio_.echo();
      text(p.x, p.y - 40, "second wind", TH.shard, 20);
      return;
    }
    p.hp = 0; endRun();
  }
}
function triggerSurge() {
  const p = G.player;
  p.surge = 0; p.surgeActive = 5;
  ring(p.x, p.y, TH.shard, 10, Math.max(W, H), .75, 5);
  flash(.24, TH.shard); Audio_.surge(); shake(.4);
  text(p.x, p.y - 40, "surge", TH.shard, 22);
}

/* ---------------- player ------------------------------------------------ */
function fire() {
  const p = G.player, m = G.mods;
  if (p.ammo <= 0) return;
  if (BRANCHFN.id === "emberwake") {
    if (G.jam > 0) { p.fireCd = .1; return; }
    G.heat += .052;
    if (G.heat >= 1) { G.jam = 1.25; G.heat = 1; Audio_.emberVent(); text(p.x, p.y - 34, "overheated", "255,120,80", 15); shake(.14); return; }
  }
  G.shotsThisWave = (G.shotsThisWave || 0) + 1;
  /* never reset: Terminus' second-behind samples this to know when you
     pulled the trigger without needing a hook of its own in here */
  G.shotN = (G.shotN || 0) + 1;
  p.ammo = Math.max(0, p.ammo - 1);
  p.ammoRefillT = AMMO_REFILL_DELAY;
  const dmg = 11 * m.dmgMul;
  const n = 1 + m.multishot;
  const spread = n > 1 ? .05 * (n - 1) : 0;
  for (let i = 0; i < n; i++) {
    const a = p.aim + (n > 1 ? -spread + (2 * spread * i) / (n - 1) : 0) + rnd(-.018, .018);
    G.bullets.push({ x: p.x, y: p.y,
      vx: Math.cos(a) * 980, vy: Math.sin(a) * 980, dmg, r: 3.4, life: 1.15, pierce: m.pierce, hits: [] });
  }
  abilOnFire(p.x, p.y, p.aim, dmg);
  p.fireCd = .152 / (m.rateMul * abilRateMul());
  p.vx -= Math.cos(p.aim) * 24; p.vy -= Math.sin(p.aim) * 24;
  p.fireKick = 1;
  Audio_.shoot(1 + rnd(-.06, .06));
  burst(p.x + Math.cos(p.aim) * 18, p.y + Math.sin(p.aim) * 18, 2, TH.core, .5, { life: .13, size: rnd(1, 2) });
}
/* ---- Time-Swap (recall) ---------------------------------------------------
   With a decoy alive, dash stops being a dash: you and the decoy trade places.  */
function recallTarget() {
  const p = G.player;
  if (!p || !G.echoes.length) return null;
  let best = null, bd = 1e9;
  for (const c of G.echoes) { const d = dist(c, p); if (d > 44 && d < bd) { bd = d; best = c; } }
  return best;
}
function recallReady() {
  const p = G.player;
  if (!p) return false;
  return G.mods.swapFree ? p.recallCd <= 0 : p.dash > 0;
}
function doRecall(c) {
  const p = G.player, m = G.mods;
  if (m.swapFree) p.recallCd = 2.2;
  else { p.dash--; p.dashCd = Math.max(p.dashCd, .85 * m.dashCdMul); }
  const px = p.x, py = p.y;
  p.x = c.x; p.y = c.y; c.x = px; c.y = py;
  c.idx = 0; c.hit = .1;
  p.vx *= .18; p.vy *= .18;
  p.kb.x *= KB_DASH_KEEP; p.kb.y *= KB_DASH_KEEP; /* you leave the shove behind with the position */
  p.iframe = Math.max(p.iframe, .34);
  p.swapFlash = .5;
  p.hist.push({ x: p.x, y: p.y });
  beam(px, py, p.x, p.y, TH.echo, .34);
  ring(p.x, p.y, TH.echo, 8, 104, .44, 3);
  ring(px, py, TH.echo, 8, 88, .44, 2.2);
  shock(p.x, p.y, { r0: 90, r1: 12, life: .3, col: TH.echo, w: 4 });
  shock(px, py, { r0: 10, r1: 120, life: .34, col: TH.echo, w: 3 });
  burst(p.x, p.y, 24, TH.echo, 1.1, { life: .42 });
  burst(px, py, 16, TH.echo, .9, { life: .36 });
  /* a line of afterimages tears open between the two ends of the trade */
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    ghost(lerp(px, p.x, f), lerp(py, p.y, f), p.aim, TH.echo,
      { r: p.r, life: .18 + f * .26, a: .45, grow: .3 });
  }
  p.pop = 1;
  /* a Time-Swap moves you without moving *through* anything, so the room
     has to be re-checked at the far end: the decoy has been standing there
     for seconds, and in Glassfall the pane under it may have dropped since.
     `ported` marks the frame so nothing downstream mistakes a teleport for
     a movement step. */
  p.ported = 1;
  playerBounds(p);
  G.chroma = Math.max(G.chroma, .8);
  text(p.x, p.y - 34, "swap", TH.echo, 15);
  Audio_.swap(); flash(.06, TH.echo); shake(TRAUMA_DASH_IMPACT); hitStop(HITSTOP_MEDIUM);
  if (m.swapWave > 0) {
    const R = 132 + m.swapWave * 36;
    for (const q of [{ x: p.x, y: p.y }, { x: px, y: py }]) {
      ring(q.x, q.y, TH.echo, 14, R, .38, 3);
      for (const e of G.enemies.slice()) {
        if (dist(e, q) < R) {
          const a = Math.atan2(e.y - q.y, e.x - q.x);
          shoveEnemy(e, a, SHOVE_SWAP_WAVE);
          damageEnemy(e, 24 * m.swapWave * m.dmgMul, { noCrit: true, ang: a });
        }
      }
    }
  }
}
/* Where a dash goes: the direction you are steering, full stop. If you are
   not steering right now, the last direction you steered — never the aim. */
function dashDir(p) { return p.moveAng; }
/* One button. With a decoy on the field it is a swap and nothing else —
   there is no dash to fumble for, and no modifier key to remember. */
function doDash() {
  const p = G.player, m = G.mods;
  if (p.dashing > 0) return;
  if (typeof tutOnDash === "function") tutOnDash();
  const c = recallTarget();
  if (c) {
    if (recallReady()) doRecall(c);
    else { Audio_.ui(false); text(p.x, p.y - 30, "swap charging", TH.faint || TH.echo, 12); }
    return;
  }
  if (p.dash <= 0) return;
  p.dash--; p.dashCd = Math.max(p.dashCd, .85 * m.dashCdMul);
  p.dashing = DASH_TIME; p.dashHits = []; p.pop = .7;
  p.burnAt = null;   /* the trail is laid by distance, so each dash starts fresh */
  /* the i-frame covers the launch AND the landing, so the frames where you
     are slow again but still next to whatever you dashed past are not the
     frames that kill you */
  p.iframe = Math.max(p.iframe, DASH_TIME + DASH_EXIT_IFRAME);
  const a = dashDir(p);
  p.dashAng = a;
  /* a dash overrides whatever was shoving you: it is the escape, so it
     wins the argument with the shove instead of being bent by it. Without
     this a shove landing a frame before the press curves the dash into the
     hazard you were dashing out of. */
  p.kb.x *= KB_DASH_KEEP; p.kb.y *= KB_DASH_KEEP;
  p.vx = Math.cos(a) * DASH_SPEED; p.vy = Math.sin(a) * DASH_SPEED;
  /* stamped here rather than inferred: this launch lands after the frame's
     velocity delta has already been sampled, so it would otherwise be missed */
  p.stretch = SQUASH_DASH_STRETCH; p.stretchAng = a;
  ring(p.x, p.y, TH.core, 8, 76, .32, 2.4);
  shock(p.x, p.y, { r0: 12, r1: 150, life: .3, col: TH.core, w: 5, ang: a + Math.PI, arc: 2.2 });
  burst(p.x, p.y, 18, TH.core, 1.3, { life: .34 });
  for (let i = 0; i < 3; i++) ghost(p.x - Math.cos(a) * i * 9, p.y - Math.sin(a) * i * 9, a, TH.core, { r: p.r, life: .2 + i * .05, a: .4 });
  /* below SPLIT_MIN on purpose: a dash is frequent, and the frames right
     after one are the frames you most need to be responsive */
  G.chroma = Math.max(G.chroma, .34);
  if (BRANCHFN.id === "emberwake" && G.heat > .05) { G.heat = 0; Audio_.vent(); ring(p.x, p.y, "255,190,110", 10, 96, .35, 3); }
  shake(TRAUMA_DASH_LAUNCH, Math.cos(a), Math.sin(a)); flash(.05); Audio_.dash();
  abilOnDash(p);
  if (m.dashShock > 0) {
    const R = 150 + m.dashShock * 30;
    ring(p.x, p.y, TH.core, 12, R, .36, 3);
    for (const e of G.enemies.slice()) {
      if (dist(e, p) < R) {
        const ang = Math.atan2(e.y - p.y, e.x - p.x);
        shoveEnemy(e, ang, SHOVE_DASH_SHOCK);
        damageEnemy(e, 26 * m.dashShock * m.dmgMul, { noCrit: true, ang });
      }
    }
  }
}
/* ---- the dash's burning trail -----------------------------------------
   This was the worst performance bug in the game. It rolled a 60% chance
   EVERY FRAME of the dash and dropped a fresh 2.2-second zone each time, so
   one dash left about six overlapping zones and a dash-heavy build kept
   twenty-plus alive at once. Every zone is checked against every enemy every
   frame and drawn as its own filled path, and each overlapping zone re-ran
   damageEnemy on the same body — which then rolled its own sparks. The cost
   was quadratic in a build that dashes often, which is exactly the build
   that takes the trail.

   It is laid by DISTANCE now, not by frame: one patch per BURN_STEP pixels
   travelled, so the trail is identical at 30fps and 144fps and a dash lays a
   fixed, small number of them regardless. They are bigger and shorter-lived
   to cover the same ground with a quarter of the entities, and they are
   capped separately from everything else so a trail can never crowd out the
   room's own hazards. */
const BURN_STEP = 34;     /* px of travel between patches */
const BURN_R = 40;        /* patch radius — wider, so fewer of them cover the lane */
const BURN_LIFE = 1.5;    /* seconds a patch burns */
const BURN_DPS = 46;      /* damage per second, per stack of the core */
const BURN_MAX = 7;       /* patches one trail may have alive at once */
function burnTrail(p, m) {
  if (m.dashBurn <= 0) return;
  const last = p.burnAt;
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < BURN_STEP) return;
  p.burnAt = { x: p.x, y: p.y };
  p.burn = p.burn || [];
  const z = { x: p.x, y: p.y, r: BURN_R, life: BURN_LIFE, max: BURN_LIFE,
    dps: BURN_DPS * m.dashBurn, col: "255,146,72" };
  p.burn.push(z);
  G.zones.push(z);
  /* retire our own oldest rather than letting the shared cap decide, so a
     long dash chain never evicts a Bloom's fire or a Howitzer's shells */
  while (p.burn.length > BURN_MAX) {
    const old = p.burn.shift();
    const i = G.zones.indexOf(old);
    if (i >= 0) G.zones.splice(i, 1);
  }
}
function summonEcho() {
  const p = G.player, m = G.mods;
  if (p.echo <= 0 || p.hist.length < 20) return;
  if (typeof tutOnEcho === "function") tutOnEcho();
  p.echo--; p.echoCd = Math.max(p.echoCd, 8.5);
  const path = p.hist.slice(-Math.min(p.hist.length, 130)).map((h) => ({ x: h.x, y: h.y }));
  const life = 6.5 * m.echoLifeMul;
  for (let i = 0; i < 1 + m.echoTwin; i++) {
    G.echoes.push({ x: path[0].x, y: path[0].y, r: 13, idx: i ? (path.length / 2) | 0 : 0,
      path, life, max: life, hp: 65 * (1 + m.decoyGuard * .6), fireCd: rnd(.3), aim: 0, hit: 0 });
  }
  ring(p.x, p.y, TH.echo, 10, 132, .5, 3);
  burst(p.x, p.y, 34, TH.echo, 1.3);
  flash(.07, TH.echo); Audio_.echo();
}
/* ---- moving the player, in pieces small enough to collide -------------
   Movement and knockback are integrated together and SUBSTEPPED, and the
   room's walls are enforced after every substep. That matters for three
   things at once:

     · a dash covers up to 59px in one frame at the 20fps floor, and arena
       walls are thinner than that — one big step would post you straight
       through a wall or across a glass gap
     · a shove landing mid-dash adds to the same delta rather than being
       applied after it, so the two can't take turns pushing you through
       opposite faces of the same wall
     · a shove into a wall spends itself on the wall instead of
       accumulating behind it and firing you out the far side later

   Chamber 09 has no branch geometry, so it falls back to the plain
   rectangle; everything else goes through BRANCHFN.bounds (see
   11-branch-physics.js). */
function playerBounds(p) {
  const pad = 20;
  if (BRANCHFN.bounds && !G.attract) { BRANCHFN.bounds(p, pad); return; }
  if (p.x < pad) { p.x = pad; p.vx = Math.abs(p.vx) * .3; p.kb.x = Math.abs(p.kb.x) * .3; }
  if (p.x > W - pad) { p.x = W - pad; p.vx = -Math.abs(p.vx) * .3; p.kb.x = -Math.abs(p.kb.x) * .3; }
  if (p.y < pad) { p.y = pad; p.vy = Math.abs(p.vy) * .3; p.kb.y = Math.abs(p.kb.y) * .3; }
  if (p.y > H - pad) { p.y = H - pad; p.vy = -Math.abs(p.vy) * .3; p.kb.y = -Math.abs(p.kb.y) * .3; }
}
function stepPlayer(p, dt) {
  /* three channels of motion, all integrated together so the walls arbitrate
     between them instead of each one getting its own unchecked turn:
       vx/vy  what you are steering, and the dash
       kb     a projectile's shove, which decays on its own
       env    the room pushing (an Emberwake heatwave, a current) — SET by
              the branch each frame rather than accumulated, so it stops the
              instant the room stops rather than coasting */
  const tx = p.vx + p.kb.x + p.env.x, ty = p.vy + p.kb.y + p.env.y;
  const len = Math.hypot(tx, ty) * dt;
  const n = Math.min(10, Math.max(1, Math.ceil(len / MOVE_SUBSTEP)));
  const sd = dt / n;
  const kd = Math.pow(PLAYER_KB_DECAY, sd);
  for (let i = 0; i < n; i++) {
    p.x += (p.vx + p.kb.x + p.env.x) * sd; p.y += (p.vy + p.kb.y + p.env.y) * sd;
    p.kb.x *= kd; p.kb.y *= kd;
    playerBounds(p);
  }
}
function updatePlayer(dt, input) {
  const p = G.player, m = G.mods;
  const prevVx = p.vx, prevVy = p.vy;
  p.ported = 0;
  p.iframe = Math.max(0, p.iframe - dt);
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 2.2);
  p.hitFlash = Math.max(0, (p.hitFlash || 0) - dt);
  const wasDashing = p.dashing > 0;
  p.dashing = Math.max(0, p.dashing - dt);
  /* the hand-off: the launch does not just stop, it drops you into the
     speed burst still moving the way you dashed, so the escape keeps
     carrying for DASH_SURGE_TIME instead of dumping you on the spot */
  if (wasDashing && p.dashing <= 0 && p.dashAng != null) {
    const exit = PLAYER_SPEED * m.speedMul * DASH_SURGE_MUL * DASH_EXIT_SPEED;
    p.vx = Math.cos(p.dashAng) * exit; p.vy = Math.sin(p.dashAng) * exit;
    p.dashSurge = DASH_SURGE_TIME;
    p.dashAng = null;
  }
  p.dashSurge = Math.max(0, p.dashSurge - dt);
  p.chill = Math.max(0, (p.chill || 0) - dt);
  p.surgeActive = Math.max(0, p.surgeActive - dt);
  p.recallCd = Math.max(0, p.recallCd - dt);
  p.swapFlash = Math.max(0, p.swapFlash - dt * 2.2);
  p.fireKick = Math.max(0, (p.fireKick || 0) - dt * 7);
  p.pop = Math.max(0, (p.pop || 0) - dt * 4);
  p.legPhase = (p.legPhase || 0) + dt * (4 + Math.hypot(p.vx, p.vy) * .04);
  if (p.regen > 0) healPlayer(p.regen * dt * .4);
  if (p.shield < p.shieldMax) {
    p.shieldCd -= dt;
    if (p.shieldCd <= 0) { p.shield++; p.shieldCd = 11; ring(p.x, p.y, TH.core, 20, 42, .4, 2); Audio_.pickup(); }
  }
  if (p.dash < p.dashMax) { p.dashCd -= dt; if (p.dashCd <= 0) { p.dash++; p.dashCd = .85 * m.dashCdMul; } }
  else p.dashCd = Math.max(0, p.dashCd - dt);
  if (p.echo < p.echoMax) { p.echoCd -= dt; if (p.echoCd <= 0) { p.echo++; p.echoCd = 8.5; } }
  if (p.ammo < p.ammoMax) {
    p.ammoRefillT -= dt;
    if (p.ammoRefillT <= 0) {
      p.ammo = p.ammoMax;
      ring(p.x, p.y, TH.core, 8, AMMO_RING_RADIUS + 8, .32, 2);
      Audio_.pickup();
    }
  }
  p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
  /* the steering heading, kept separate from the aim because the dash runs
     on it (see dashDir) */
  const mlen = Math.hypot(input.mx, input.my);
  if (mlen > .05) { p.moveAng = Math.atan2(input.my, input.mx); p.moveT = 0; }
  else p.moveT += dt;

  if (p.dashing > 0) {
    p.vx *= Math.pow(.12, dt); p.vy *= Math.pow(.12, dt);
    burnTrail(p, m);
    burst(p.x, p.y, 2, TH.core, .3, { life: .3, size: rnd(1.4, 3) });
    if (chance(dt * 70)) ghost(p.x, p.y, p.aim, TH.core, { r: p.r, life: .26, a: .38 });
    for (const e of G.enemies.slice()) {
      if (p.dashHits.indexOf(e) >= 0) continue;
      if (dist(e, p) < e.r + p.r + 6) {
        p.dashHits.push(e);
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        damageEnemy(e, 42 * m.dashDmgMul * m.dmgMul, { ang: a });
        shoveEnemy(e, a, SHOVE_DASH_THROUGH);
        e.pop = Math.max(e.pop || 0, .8);
        shock(e.x, e.y, { r0: e.r, r1: e.r * 3.2, life: .22, col: TH.core, w: 3 });
        hitStop(HITSTOP_MEDIUM); shake(TRAUMA_DASH_IMPACT);
      }
    }
  } else {
    const sp = PLAYER_SPEED * m.speedMul * (p.surgeActive > 0 ? SURGE_SPEED_MUL : 1)
      * (p.dashSurge > 0 ? DASH_SURGE_MUL : 1) * abilSpeedMul()
      * (p.chill > 0 ? CHILL_SPEED : 1);   /* a Special Grade Rime got you */
    /* coming off the keys pulls harder than getting on them, so letting go
       stops you instead of skating you across the floor */
    const rate = Math.hypot(input.mx, input.my) > .05 ? PLAYER_ACCEL : PLAYER_DECEL;
    p.vx = approach(p.vx, input.mx * sp, rate, dt);
    p.vy = approach(p.vy, input.my * sp, rate, dt);
  }
  /* how violently the velocity changed this frame drives the squash */
  const accel = Math.hypot(p.vx - prevVx, p.vy - prevVy) / Math.max(dt, 1 / 240);
  const stretchTo = clamp(accel / SQUASH_ACCEL_NORM, 0, SQUASH_MAX_STRETCH);
  const speedNow = Math.hypot(p.vx, p.vy);
  if (speedNow > 15) p.stretchAng = Math.atan2(p.vy, p.vx);
  else if (stretchTo > 0 && (p.vx !== prevVx || p.vy !== prevVy)) p.stretchAng = Math.atan2(p.vy - prevVy, p.vx - prevVx);
  p.stretch = Math.max(stretchTo, approach(p.stretch || 0, 0, SQUASH_DECAY, dt));
  stepPlayer(p, dt);
  /* `env` is a PER-FRAME accumulator, not a velocity: everything that pushes
     you adds to it during the rest of the frame (an Emberwake heatwave, a
     Special Grade Warden's drag) and stepPlayer spends it here. Clearing it
     immediately is what stops those contributions stacking — without this a
     constant pusher climbs without limit and eventually throws you across
     the room at a thousand px/s. */
  p.env.x = 0; p.env.y = 0;
  /* held or tapped, the press is remembered for a beat: if the cooldown
     clears inside the window the shot goes out on that frame instead of
     needing a second press */
  p.fireBuffer = input.fire ? FIRE_INPUT_BUFFER : Math.max(0, p.fireBuffer - dt);
  if (p.fireBuffer > 0 && p.fireCd <= 0 && p.dashing <= 0 && p.ammo > 0) { fire(); p.fireBuffer = 0; }
  p.fireCd -= dt;
  /* same for dash, which doubles as the swap when a decoy is out. Readiness
     is checked here rather than inside doDash() so a buffered press doesn't
     re-trigger its "charging" refusal every frame it waits. */
  p.dashBuffer = input.dash ? DASH_INPUT_BUFFER : Math.max(0, p.dashBuffer - dt);
  if (p.dashBuffer > 0 && p.dashing <= 0) {
    const swapTo = recallTarget();
    if (swapTo ? recallReady() : p.dash > 0) { doDash(); p.dashBuffer = 0; }
    else if (input.dash) doDash(); /* the press itself still gets told no; the wait after it is silent */
  }
  if (input.echo) summonEcho();
  p.hist.push({ x: p.x, y: p.y });
  if (p.hist.length > 150) p.hist.shift();
}
function updateEchoes(dt) {
  const m = G.mods;
  for (let i = G.echoes.length - 1; i >= 0; i--) {
    const c = G.echoes[i];
    c.life -= dt; c.hit = Math.max(0, c.hit - dt);
    c.idx += dt * 62;
    if (c.idx >= c.path.length) c.idx = 0;
    const node = c.path[Math.floor(c.idx)] || c.path[0];
    c.x = lerp(c.x, node.x, 1 - Math.exp(-16 * dt));
    c.y = lerp(c.y, node.y, 1 - Math.exp(-16 * dt));
    c.fireCd -= dt * m.echoRate;
    let near = null, nd = 1e9;
    for (const e of G.enemies) { if (e.dead) continue; const d = dist(e, c); if (d < nd) { nd = d; near = e; } }
    if (near) {
      c.aim = Math.atan2(near.y - c.y, near.x - c.x);
      if (c.fireCd <= 0 && nd < 620) {
        c.fireCd = .3;
        G.bullets.push({ x: c.x, y: c.y, vx: Math.cos(c.aim) * 820, vy: Math.sin(c.aim) * 820,
          dmg: 7 * m.dmgMul * m.echoDmgMul, r: 3, life: 1, pierce: m.pierce, hits: [], echo: true });
        Audio_.shoot(1.5);
      }
    }
    if (c.life <= 0 || c.hp <= 0) {
      burst(c.x, c.y, 28, TH.echo, 1.2);
      ring(c.x, c.y, TH.echo, 8, 72, .4, 2.4);
      if (m.echoBoom > 0) explode(c.x, c.y, 152, 0, TH.echo, 1);
      G.echoes.splice(i, 1);
    }
  }
}

