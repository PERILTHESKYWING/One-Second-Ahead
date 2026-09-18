/* HUD widgets, screen routing helpers, the Echo Lab shop UI, settings panel, and the boot terminal sequence. */
/* ---------------- HUD ------------------------------------------------------ */
const ABILITIES = [
  { id: "dash", key: "SPC", name: "dash", color: "var(--signal)" },
  { id: "echo", key: "E", name: "echo", color: "var(--echo)" },
];
const FAM_COLOR = { Impact: "var(--shard)", Brand: "var(--echo)", Tempo: "var(--signal)" };
/* The two fixed controls, then whatever the loadout is carrying. Rebuilt
   whenever the loadout changes, so the row is always exactly the keys that
   do something — an equipped passive still gets a tile, because knowing it
   is running is the point of having chosen it. */
function buildAbilities() {
  const wrap = $("#abilities");
  wrap.innerHTML = "";
  const add = (id, key, name, color, passive) => {
    const el = document.createElement("div");
    el.className = "ability" + (passive ? " passive" : "");
    el.style.setProperty("--ac", color);
    el.innerHTML = '<i class="cd"></i><span class="key">' + key + '</span><span class="nm">' + name + '</span><span class="charges"></span>';
    el.dataset.id = id;
    wrap.appendChild(el);
  };
  for (const a of ABILITIES) add(a.id, a.key, a.name, a.color, false);
  if (typeof equippedAbilities === "function") {
    equippedAbilities().forEach((a, i) => {
      if (!a) return;
      add("ab" + i, a.kind === "active" ? String(i + 1) : "·", a.name.toLowerCase(),
        FAM_COLOR[a.fam] || "var(--chrono)", a.kind !== "active");
    });
  }
}
function chargePips(el, n, max) {
  const c = el.querySelector(".charges");
  if (c.children.length !== max) { c.innerHTML = ""; for (let i = 0; i < max; i++) c.appendChild(document.createElement("i")); }
  for (let i = 0; i < max; i++) c.children[i].className = i < n ? "on" : "";
}
function fmtClock(t) {
  const m = Math.floor(t / 60), sec = Math.floor(t % 60);
  return m + ":" + String(sec).padStart(2, "0");
}
function updateWaveDots() {
  const L = curLevel();
  const box = $("#waveDots");
  if (G.survival) {
    let html = "";
    const upto = Math.min(G.wave, 10);
    for (let i = 1; i <= upto; i++) html += '<i class="' + (i < upto ? "done" : "now") + '"></i>';
    box.innerHTML = html;
    $("#lvlNum").textContent = "Survival · wave " + G.wave;
    $("#lvlName").textContent = L.name.toLowerCase();
    return;
  }
  let html = "";
  for (let i = 1; i <= L.waves; i++) html += '<i class="' + (i < G.wave ? "done" : i === G.wave ? "now" : "") + '"></i>';
  box.innerHTML = html;
  $("#lvlNum").textContent = levelLabel();
  $("#lvlName").textContent = L.name.toLowerCase();
}
let ghostHp = 1, hudHp = 1;
function updateHUD() {
  const p = G.player;
  if (!p) return;
  $("#scoreVal").textContent = fmt(G.score);
  if (G.survival) $("#lvlName").textContent = fmtClock(G.runTime) + " survived";
  const frac = clamp(p.hp / p.maxHp, 0, 1);
  $("#hpFill").style.transform = "scaleX(" + frac + ")";
  $("#hpGhost").style.transform = "scaleX(" + clamp(ghostHp, frac, 1) + ")";
  ghostHp = ghostHp > frac ? ghostHp - .004 : frac;
  $("#hpNum").textContent = Math.ceil(p.hp);
  /* The HUD reacts to the two things that actually matter in the moment:
     taking a hit, and being nearly dead. Everything else on it is static
     information and should stay still — a HUD where five things animate at
     once is a HUD you stop reading. */
  const bar = $("#intBar");
  bar.classList.toggle("low", frac < .32);
  if (hudHp > frac + .001) { bar.classList.remove("hit"); void bar.offsetWidth; bar.classList.add("hit"); }
  hudHp = frac;
  $("#surgeFill").style.transform = "scaleX(" + (p.surgeActive > 0 ? p.surgeActive / 5 : p.surge / 100) + ")";
  const sp = $("#shieldPips");
  if (sp.dataset.n !== String(p.shield)) {
    let h = ""; for (let i = 0; i < p.shield; i++) h += '<i class="shield-pip"></i>';
    sp.innerHTML = h; sp.dataset.n = String(p.shield);
  }
  for (const el of $("#abilities").children) {
    if (el.dataset.id.startsWith("ab")) {
      const slot = +el.dataset.id.slice(2);
      const a = G.abil ? abilOf(G.abil.slots[slot]) : null;
      if (!a) continue;
      if (a.kind === "active") {
        const cd = G.abil.cd[slot];
        chargePips(el, cd > 0 ? 0 : 1, 1);
        el.classList.toggle("ready", cd <= 0);
        el.querySelector(".cd").style.transform = "scaleY(" + clamp(cd / a.cd, 0, 1) + ")";
      } else {
        /* a passive has no cooldown to show, so the tile shows whatever the
           ability is actually accumulating instead */
        let n = 1, max = 1;
        if (a.id === "overclock") { n = G.abil.oc; max = 10; }
        else if (a.id === "counterweight") { n = G.abil.bank > 60 ? 1 : 0; }
        chargePips(el, n, max);
        el.classList.add("ready");
        el.querySelector(".cd").style.transform = "scaleY(0)";
      }
      continue;
    }
    if (el.dataset.id === "dash") {
      const swap = !!recallTarget();
      const free = swap && G.mods.swapFree;
      if (el.dataset.swap !== String(swap)) {
        el.dataset.swap = String(swap);
        el.classList.toggle("swap", swap);
        el.querySelector(".nm").textContent = swap ? "swap" : "dash";
        const tb = $("#touch .tbtn.dash");
        if (tb) tb.textContent = swap ? "SWAP" : "DASH";
      }
      chargePips(el, free ? (p.recallCd <= 0 ? 1 : 0) : p.dash, free ? 1 : p.dashMax);
      el.classList.toggle("ready", swap ? recallReady() : p.dash > 0);
      el.querySelector(".cd").style.transform = "scaleY(" +
        (free ? clamp(p.recallCd / 2.2, 0, 1) : p.dash >= p.dashMax ? 0 : clamp(p.dashCd / (.85 * G.mods.dashCdMul), 0, 1)) + ")";
    } else {
      chargePips(el, p.echo, p.echoMax);
      el.classList.toggle("ready", p.echo > 0);
      el.querySelector(".cd").style.transform = "scaleY(" + (p.echo >= p.echoMax ? 0 : clamp(p.echoCd / 8.5, 0, 1)) + ")";
    }
  }
}
function banner(title, sub) {
  const el = $("#waveBanner");
  el.innerHTML = title + (sub ? "<small>" + sub + "</small>" : "");
  el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
}
function toast(msg, color) {
  const t = document.createElement("div");
  t.className = "toast";
  t.innerHTML = '<i style="width:6px;height:6px;border-radius:50%;background:' + (color || "var(--signal)") + '"></i>' + msg;
  $("#toast").appendChild(t);
  setTimeout(() => t.remove(), 2400);
}

/* ---------------- screens --------------------------------------------------- */
let currentScreen = "home", returnTo = "home";
function show(name) {
  $$(".screen").forEach((s) => s.classList.toggle("on", s.id === name));
  if (name !== "shop" && typeof stopPreviews === "function") stopPreviews();
  currentScreen = name;
  $("#app").classList.toggle("playing", name === "none" && !G.attract);
}
/* The home screen's four-record row is gone — for a new player it was four
   em-dashes, which reads as broken rather than as empty. What replaced it is
   one progress bar and the trophy count, filled in by refreshShell() in
   18-shell.js. Everything here is optional-by-id so neither screen can break
   the other. */
function refreshHome() {
  const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
  set("#recTrophies", SAVE.trophiesTotal ? fmt(SAVE.trophiesTotal) : "—");
  set("#recLevel", SAVE.bestLevel || "—");
  set("#recWave", SAVE.bestWave || "—");
  set("#recScore", SAVE.bestScore ? fmt(SAVE.bestScore) : "—");
  if (typeof refreshBranchHome === "function") refreshBranchHome();
}
function goHome() {
  startAttract();
  refreshHome();
  show("home");
}
let lastMode = "play";
function startPlay(mode, startAt) {
  lastMode = mode === "survival" ? "survival" : "play";
  Audio_.init(); Audio_.resume();
  $("#draft").classList.remove("on");
  newRun(lastMode === "survival", startAt);
  ghostHp = 1;
  show("none");
  Audio_.confirm();
}
let hookTimer = 0;
function typeHook(txt) {
  clearTimeout(hookTimer);
  const el = $("#lcHook");
  el.textContent = "";
  let i = 0;
  const step = () => {
    i++;
    el.textContent = txt.slice(0, i);
    if (i < txt.length) hookTimer = setTimeout(step, 15);
  };
  hookTimer = setTimeout(step, 220);
}
function showLevelCard(L) {
  G.carding = true; G.cardIn = 6.5;
  const surv = G.survival;
  $("#lcEyebrow").textContent = surv ? "Chamber 09 · endless"
    : TL.name + " · " + levelLabel() + " · " + TIER_NAME[L.tier || TIER_OF(G.levelIdx)].toLowerCase() +
      (G.mutation ? " · mutation" : "");
  $("#lcName").textContent = surv ? "Survival" : L.name;
  typeHook(surv
    ? "The purge stopped counting. Waves come until you stop holding them, they get worse every time, and every third one hands you a core."
    : L.hook);
  const box = $("#lcNew");
  box.innerHTML = "";
  const intro = surv ? ["husk", "dart", "bloom"] : L.intro;
  intro.forEach((ty) => {
    const d = document.createElement("div");
    d.className = "newcomer";
    const cvs = document.createElement("canvas");
    d.appendChild(cvs);
    const span = document.createElement("span");
    span.textContent = EN[ty].label;
    d.appendChild(span);
    box.appendChild(d);
    drawIcon(cvs, ty, 34);
  });
  /* the Learn tier's teaching line: which piece of the arena's hazard this
     level has just switched on, and what to do about it. This is the whole
     mechanism by which levels 1-4 teach rather than merely being easier, so
     it goes where the player is already reading. */
  const tip = $("#lcTip");
  if (tip) {
    tip.textContent = surv ? "" : (L.envIntro || "");
    tip.classList.toggle("on", !surv && !!L.envIntro);
  }
  $("#lcGo").textContent = "press any key to begin";
  $("#levelCard").classList.add("on");
  Audio_.levelIn();
}
function showResults(banked, best) {
  $("#resultScore").textContent = fmt(G.score);
  $("#resLevel").textContent = G.survival ? G.wave : G.loop * LEVELS.length + G.levelIdx + 1;
  $("#resLevelLabel").textContent = G.survival ? "wave reached" : "level reached";
  $("#resKills").textContent = G.kills;
  const m = Math.floor(G.runTime / 60), s = Math.floor(G.runTime % 60);
  $("#resTime").textContent = m + ":" + String(s).padStart(2, "0");
  $("#resShards").textContent = fmt(banked);
  $("#newBestWrap").innerHTML = best ? '<div class="newbest"><i class="shard"></i>New personal best</div>' : "";
  $("#resultTitle").textContent = G.survival
    ? "Timeline broken on wave " + G.wave
    : "Timeline broken in " + curLevel().name;
  show("results");
}
/* ---------------- LEVEL COMPLETE ----------------------------------------
   The payoff screen, and the second half of the run-loop change: a level
   ends here and hands you back to the road.

   It is staged rather than dumped. Everything lands in sequence — title,
   trophies counting up, stats, each reward in turn, then the unlock — over
   about a second and a half, because a result that appears all at once reads
   as a form and a result that arrives in beats reads as a reward. Each beat
   has its own sound. */
let lrTimers = [];
function lrClearTimers() { lrTimers.forEach(clearTimeout); lrTimers = []; }
function lrAt(ms, fn) { lrTimers.push(setTimeout(fn, ms)); }

function showLevelResults(cleared, banked, res) {
  lrClearTimers();
  const L = curLevel(), idx = G.levelIdx, arena = TL.id;
  const rec = levelRec(arena, idx);
  const root = $("#levelResult");
  root.classList.toggle("failed", !cleared);

  $("#lrEyebrow").textContent = TL.name + " · Level " + (idx + 1) + " · " + L.name;
  $("#lrTitle").textContent = cleared
    ? (res && res.firstClear ? "LEVEL COMPLETE" : "CLEARED AGAIN")
    : "TIMELINE BROKEN";

  /* trophies count up rather than appear — the number is the score, and a
     number that moves is a number people watch */
  const got = res ? res.gained : 0;
  const troEl = $("#lrTrophies");
  troEl.textContent = "0";
  $("#lrBest").textContent = cleared
    ? "best " + fmt(rec.trophies) + " of " + fmt(levelMaxTrophies(arena, idx))
    : "reached wave " + G.wave + " of " + L.waves;

  const bb = $("#lrBonus");
  bb.innerHTML = "";
  $("#lrScore").textContent = fmt(G.score);
  $("#lrTime").textContent = fmtClock(G.levelT);
  $("#lrKills").textContent = G.kills;
  $("#lrHits").textContent = G.levelHits;

  const rw = $("#lrRewards"); rw.innerHTML = "";
  const un = $("#lrUnlock"); un.innerHTML = ""; un.className = "lr-unlock";

  /* Next only exists when there is a next and it is open. A dead primary
     button is worse than no primary button. */
  const hasNext = idx + 1 < LEVELS_PER_ARENA && levelUnlocked(arena, idx + 1);
  const nextArena = idx + 1 >= LEVELS_PER_ARENA
    ? TIMELINES.find((t) => t.unlockedBy === arena) : null;
  const nb = $("#lrNext");
  if (hasNext) {
    nb.style.display = "";
    nb.querySelector("span").textContent = "NEXT LEVEL";
    nb.onclick = () => { uiSfx("press"); lrClearTimers(); transitionTo(() => enterLevel(arena, idx + 1, 0)); };
  } else if (nextArena && arenaUnlocked(nextArena.id)) {
    nb.style.display = "";
    nb.querySelector("span").textContent = "ENTER " + nextArena.name.toUpperCase();
    nb.onclick = () => { uiSfx("press"); lrClearTimers(); transitionTo(() => enterLevel(nextArena.id, 0, 0)); };
  } else {
    nb.style.display = "none";
  }
  $("#lrRetry").textContent = G.mutation ? "Replay · mutation" : "Replay";
  $("#lrRetry").onclick = () => { uiSfx("press"); lrClearTimers(); transitionTo(() => enterLevel(arena, idx, G.mutation)); };

  show("levelResult");
  root.classList.remove("run"); void root.offsetWidth; root.classList.add("run");
  if (cleared) Audio_.levelDone(); else Audio_.death();

  /* ---- the beats ---- */
  lrAt(260, () => countUp(troEl, got, 620));
  if (res && res.bonuses.length) {
    res.bonuses.forEach((b, i) => lrAt(700 + i * 160, () => {
      const el = document.createElement("span");
      el.className = "bonus";
      el.textContent = "+" + Math.round(b.pct * 100) + "% " + b.label;
      bb.appendChild(el);
      Audio_.rewardPop(i);
    }));
  }
  const rewardAt = 700 + (res && res.bonuses.length ? res.bonuses.length * 160 : 0) + 180;
  const blocks = [];
  if (res && res.paid) blocks.push({ why: "First clear", items: res.paid.items });
  if (res && res.rungs) res.rungs.forEach((r) => {
    const items = [];
    if (r.shards) items.push({ label: fmt(r.shards) + " shards" });
    if (r.cosmetic) items.push({ label: (cosmOf(r.cosmetic) || {}).name || r.cosmetic });
    if (r.ability) items.push({ label: (abilOf(r.ability) || {}).name || r.ability });
    if (items.length) blocks.push({ why: "Trophy ladder", items });
  });
  if (banked > 0) blocks.push({ why: "Banked", items: [{ label: fmt(banked) + " shards" }] });
  blocks.forEach((g, i) => lrAt(rewardAt + i * 220, () => {
    const el = document.createElement("div");
    el.className = "lr-reward";
    el.innerHTML = "<i>" + g.why + "</i>" +
      g.items.map((x) => "<b>" + x.label + "</b>").join("");
    rw.appendChild(el);
    Audio_.rewardPop(2 + i);
  }));

  /* the unlock, last and loudest, because it is the reason to press NEXT */
  if (res && res.unlockedNext && hasNext) {
    const nxt = tlOf(arena).levels[idx + 1];
    lrAt(rewardAt + blocks.length * 220 + 260, () => {
      un.className = "lr-unlock on";
      un.innerHTML = '<i class="ic-lock open"></i><span><b>Level ' + (idx + 2) +
        " unlocked</b>" + nxt.name + "</span>";
      Audio_.unlockFx();
      flagRoadUnlock(arena, idx + 1);
    });
  } else if (nextArena && arenaUnlocked(nextArena.id) && res && res.firstClear) {
    lrAt(rewardAt + blocks.length * 220 + 260, () => {
      un.className = "lr-unlock on big";
      un.innerHTML = '<i class="ic-lock open"></i><span><b>' + nextArena.name +
        " unlocked</b>a new sector is online</span>";
      Audio_.unlockFx();
      flagRoadUnlock(nextArena.id, 0);
    });
  }
}
/* a number that animates to its value, eased, and always lands exactly */
function countUp(el, to, ms) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(Math.round(to * e));
    if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(to);
  };
  requestAnimationFrame(step);
}

function togglePause(force) {
  if (G.mode !== "play" || G.attract || G.drafting) return;
  const want = force == null ? !G.paused : force;
  G.paused = want;
  if (want) {
    $("#pauseLine").textContent = G.survival
      ? "Survival · wave " + G.wave + " · " + fmtClock(G.runTime)
      : levelLabel() + " · " + curLevel().name;
    show("pause"); selectMenu($("#pauseMenu"), 0);
  }
  else show("none");
}
/* shop */
/* initialised on the first render rather than at load, because the ability
   catalogue lives in a file that loads after this one */
let shopCat = null, shopMode = "abil";
/* the ability waiting for a slot, when all three are full */
let loadoutPick = null;

/* ---------------- Loadout / Collection ----------------------------------
   One screen, two modes. It used to be a single "Echo Lab" that listed every
   ability as a full-width row with two paragraphs of prose on it — accurate,
   well written, and completely unreadable as a shop. Nobody reads twelve
   paragraphs to pick three abilities; they look at a grid, read four words
   per card, and click.

   The prose did not get deleted, it got demoted: the card carries the name,
   what kind of thing it is, and its one-line mechanic. The full description
   and the synergy note appear on the card you have selected, which is the
   only one you are actually reading. */

/* The first sentence of a description is always the mechanic — the rest is
   colour, and colour belongs on the expanded card. Split on a full stop that
   actually ends a sentence (followed by a space and a capital, or the end of
   the string) rather than on the first period: half these descriptions quote
   a number like "1.8 seconds" and a naive split cuts them mid-figure. */
function firstLine(txt) {
  const t = String(txt || "");
  const m = t.match(/^.*?[.!?](?=\s+[A-Z(]|$)/);
  return m ? m[0] : t;
}
let labOpen = null;

function renderShop(mode) {
  if (mode) shopMode = mode;
  const abil = shopMode !== "cos";
  $("#labTitle").textContent = abil ? "Loadout" : "Collection";
  $("#labSub").textContent = abil
    ? "Twelve abilities. You carry three."
    : "Trails, decoys, palettes and blasts.";
  $("#shopBalance").textContent = fmt(SAVE.shards);
  stopPreviews();

  const tabs = $("#shopRail");
  tabs.innerHTML = "";
  const groups = abil
    ? ABIL_FAMS.map((f) => ({ key: f, label: f,
        own: ABIL.filter((a) => a.fam === f && abilOwned(a.id)).length,
        all: ABIL.filter((a) => a.fam === f).length }))
    : COSM_GROUPS.map((g) => ({ key: g.label, label: g.label,
        own: COSM.filter((c) => c.g === g.key && owns(c.id)).length,
        all: COSM.filter((c) => c.g === g.key).length }));
  if (!groups.some((g) => g.key === shopCat)) shopCat = groups[0].key;
  groups.forEach((g) => {
    const b = document.createElement("button");
    b.className = "labtab" + (g.key === shopCat ? " on" : "");
    b.innerHTML = "<span>" + g.label + "</span><em>" + g.own + "/" + g.all + "</em>";
    b.onclick = () => { shopCat = g.key; labOpen = null; uiSfx("move"); renderShop(); };
    b.addEventListener("mouseenter", () => uiSfx("hover"));
    tabs.appendChild(b);
  });

  /* the three slots, always visible in ability mode — they are the whole
     point of the screen, so they are not a row you scroll past */
  const slots = $("#labSlots");
  slots.innerHTML = "";
  slots.style.display = abil ? "" : "none";
  if (abil) {
    equippedAbilities().forEach((a, i) => {
      const el = document.createElement("button");
      el.className = "slot" + (a ? " filled" : "") + (loadoutPick ? " picking" : "");
      el.innerHTML = '<span class="slot-n">' + (i + 1) + "</span>" +
        (a ? '<span class="slot-name">' + a.name + "</span><span class=\"slot-tag\">" + (a.tag || a.fam) + "</span>"
           : '<span class="slot-name empty">Empty</span><span class="slot-tag">tap an ability</span>');
      el.onclick = () => {
        if (loadoutPick) { abilEquip(loadoutPick, i); loadoutPick = null; uiSfx("confirm"); }
        else if (a) { abilUnequip(i); uiSfx("off"); }
        buildAbilities(); renderShop();
      };
      el.addEventListener("mouseenter", () => uiSfx("hover"));
      slots.appendChild(el);
    });
  }

  const stock = $("#shopStock");
  stock.innerHTML = "";
  stock.className = "lab-grid" + (abil ? "" : " cos");
  if (abil) renderAbilityCards(stock); else renderCosmeticCards(stock);
  refreshHome();
}

function renderAbilityCards(stock) {
  ABIL.filter((a) => a.fam === shopCat).forEach((a) => {
    const owned = abilOwned(a.id), slot = abilSlotOf(a.id);
    const afford = SAVE.shards >= a.cost;
    const open = labOpen === a.id;
    const card = document.createElement("div");
    card.className = "card" + (slot >= 0 ? " equipped" : "") + (owned ? " owned" : "") + (open ? " open" : "");
    card.innerHTML =
      '<span class="card-fam">' + a.fam + "</span>" +
      "<h4>" + a.name + "</h4>" +
      '<span class="card-tag">' + (a.kind === "active" ? "Active · " + a.cd + "s" : "Passive") +
        (a.tag ? " · " + a.tag : "") + "</span>" +
      '<p class="card-line">' + (open ? a.desc : firstLine(a.desc)) + "</p>" +
      (open ? '<p class="card-syn"><b>Pairs with</b> ' + a.synergy + "</p>" : "") +
      '<div class="card-foot"></div>';
    const foot = card.querySelector(".card-foot");
    const btn = document.createElement("button");
    btn.className = "card-btn" + (slot >= 0 ? " on" : owned ? " have" : afford ? "" : " poor");
    btn.textContent = slot >= 0 ? "Slot " + (slot + 1)
      : owned ? "Equip" : a.cost ? fmt(a.cost) : "Free";
    if (!owned && a.cost) btn.innerHTML = '<i class="ic-shard"></i>' + fmt(a.cost);
    btn.onclick = (e) => {
      e.stopPropagation();
      if (!owned) {
        if (SAVE.shards < a.cost) { uiSfx("deny"); toast("Not enough shards", "var(--threat)"); return; }
        SAVE.shards -= a.cost; abilSave().owned[a.id] = 1; persist();
        Audio_.buy(); toast(a.name + " unlocked", "var(--chrono)");
        renderShop(); return;
      }
      if (slot >= 0) { abilUnequip(slot); uiSfx("off"); }
      else {
        const free = abilSave().slots.findIndex((x) => !x);
        if (free >= 0) { abilEquip(a.id, free); uiSfx("confirm"); }
        else { loadoutPick = a.id; uiSfx("move"); toast("Pick a slot to replace"); }
      }
      buildAbilities(); renderShop();
    };
    foot.appendChild(btn);
    card.onclick = () => { labOpen = open ? null : a.id; uiSfx("hover"); renderShop(); };
    stock.appendChild(card);
  });
}

function renderCosmeticCards(stock) {
  const group = COSM_GROUPS.find((g) => g.label === shopCat) || COSM_GROUPS[0];
  COSM.filter((c) => c.g === group.key).forEach((item) => {
    const have = owns(item.id), on = SAVE.cosmetics[group.key] === item.id;
    const afford = SAVE.shards >= item.cost;
    const card = document.createElement("div");
    card.className = "card cos" + (on ? " equipped" : "") + (have ? " owned" : "");
    const cvs = document.createElement("canvas");
    cvs.className = "card-prev";
    card.appendChild(cvs);
    const body = document.createElement("div");
    body.className = "card-body";
    body.innerHTML = "<h4>" + item.name + "</h4>" +
      '<p class="card-line">' + item.desc + "</p>";
    card.appendChild(body);
    const btn = document.createElement("button");
    btn.className = "card-btn" + (on ? " on" : have ? " have" : afford ? "" : " poor");
    btn.textContent = on ? "Equipped" : have ? "Equip" : item.cost ? "" : "Free";
    if (!have && item.cost) btn.innerHTML = '<i class="ic-shard"></i>' + fmt(item.cost);
    btn.onclick = (e) => {
      e.stopPropagation();
      if (!have) {
        if (SAVE.shards < item.cost) { uiSfx("deny"); toast("Not enough shards", "var(--threat)"); return; }
        SAVE.shards -= item.cost; SAVE.cosmetics.owned[item.id] = 1; persist();
        Audio_.buy(); toast(item.name + " unlocked", "var(--chrono)");
      }
      equipCosmetic(item);
      renderShop();
    };
    card.appendChild(btn);
    stock.appendChild(card);
    /* makePreview BUILDS a preview; the animation loop only draws what is in
       `previews`, so the return value is the whole point of calling it */
    previews.push(makePreview(cvs, item));
  });
  startPreviews();
}

function equipCosmetic(item) {
  if (item.g === "palette") setTheme(item.id.slice(4));
  else { SAVE.cosmetics[item.g] = item.id; syncCosmetics(); persist(); }
  Audio_.confirm();
  renderShop();
  toast(item.name + " equipped", "var(--signal)");
}
let previews = [], previewRaf = 0, previewLast = 0;
function stopPreviews() { if (previewRaf) cancelAnimationFrame(previewRaf); previewRaf = 0; previews = []; }
function startPreviews() {
  if (previewRaf || !previews.length) return;
  previewLast = performance.now();
  previewRaf = requestAnimationFrame(previewFrame);
}
function previewFrame(now) {
  if (currentScreen !== "shop" || !previews.length) { stopPreviews(); return; }
  previewRaf = requestAnimationFrame(previewFrame);
  let dt = (now - previewLast) / 1000;
  previewLast = now;
  if (dt > .12 || dt < 0) dt = .05;
  for (const pv of previews) drawPreview(pv, dt);
}
function makePreview(cvs, item) {
  return { cvs, item, c2: cvs.getContext("2d"), t: rnd(3), fire: 0,
    p: { x: 0, y: 0, vx: 0, vy: 0, r: 11, aim: 0, hist: [], dashing: 0, hurtFlash: 0, iframe: 0, shield: 0 },
    parts: [], rings: [] };
}
function withCanvas(c2, theme, fn) {
  const oc = ctx, ot = TH, og = gradCache;
  ctx = c2; if (theme) TH = theme; gradCache = {};
  try { fn(); } finally { ctx = oc; TH = ot; gradCache = og; }
}
function drawPreview(pv, dt) {
  const cvs = pv.cvs, w = cvs.clientWidth, h = cvs.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio || 1, 1.75);
  if (cvs.width !== Math.round(w * dpr)) { cvs.width = Math.round(w * dpr); cvs.height = Math.round(h * dpr); }
  const c2 = pv.c2;
  pv.t += dt;
  c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  c2.clearRect(0, 0, w, h);
  const g = pv.item.g;
  if (g === "palette") return previewPalette(pv, w, h);
  if (g === "trail") return previewTrail(pv, w, h, dt);
  if (g === "skin") return previewSkin(pv, w, h, dt);
  return previewBoom(pv, w, h, dt);
}
function previewTrail(pv, w, h, dt) {
  const p = pv.p, t = pv.t;
  const nx = w / 2 + Math.cos(t * 1.5) * (w * .3), ny = h / 2 + Math.sin(t * 2.4) * (h * .27);
  p.vx = (nx - p.x) / Math.max(dt, .001); p.vy = (ny - p.y) / Math.max(dt, .001);
  p.aim = Math.atan2(ny - p.y, nx - p.x);
  p.x = nx; p.y = ny;
  p.hist.push({ x: p.x, y: p.y });
  if (p.hist.length > 64) p.hist.shift();
  const old = COS.trail;
  COS.trail = pv.item.id;
  withCanvas(pv.c2, null, () => {
    drawTrail(p);
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.aim);
    ctx.fillStyle = "rgb(" + TH.hull + ")";
    shipPath(p.r); ctx.fill();
    ctx.fillStyle = "rgb(" + TH.core + ")";
    ctx.beginPath(); ctx.arc(p.r * .05, 0, p.r * .38, 0, TAU); ctx.fill();
    ctx.restore();
  });
  COS.trail = old;
}
function previewSkin(pv, w, h, dt) {
  const t = pv.t;
  if (!pv.echo) {
    pv.echo = { x: w / 2, y: h / 2, r: 13, life: 5, max: 6.5, aim: 0, hit: 0, path: [] };
    for (let i = 0; i < 26; i++) pv.echo.path.push({ x: w / 2 + Math.cos(i / 26 * TAU) * w * .28, y: h / 2 + Math.sin(i / 26 * TAU) * h * .26 });
  }
  const c = pv.echo;
  c.x = w / 2 + Math.cos(t * 1.1) * w * .2;
  c.y = h / 2 + Math.sin(t * 1.7) * h * .17;
  c.aim = t * .9;
  c.life = 3 + Math.sin(t * .5) * 2.6;
  c.hit = Math.max(0, c.hit - dt);
  if (chance(dt * .7)) c.hit = .14;
  const old = COS.skin;
  COS.skin = pv.item.id;
  withCanvas(pv.c2, null, () => drawEcho(c));
  COS.skin = old;
}
function previewPalette(pv, w, h) {
  const th = THEMES[pv.item.id.slice(4)] || THEMES.dark;
  withCanvas(pv.c2, th, () => {
    const bg = ctx.createRadialGradient(w * .5, h * .4, 4, w * .5, h * .5, Math.max(w, h) * .8);
    const cols = th.bg || (th.dim ? ["#101a36", "#050914"] : ["#f6f9ff", "#dde6f6"]);
    bg.addColorStop(0, cols[0]); bg.addColorStop(1, cols[1]);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(" + th.grid + "," + (th.gridA * 2.2) + ")";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < w; x += 22) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let y = 0; y < h; y += 22) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    /* one of everything, so the remap is legible */
    ctx.save();
    ctx.translate(w * .34, h * .54); ctx.rotate(-.3);
    ctx.fillStyle = "rgb(" + th.hull + ")";
    shipPath(12); ctx.fill();
    ctx.fillStyle = "rgb(" + th.core + ")";
    ctx.beginPath(); ctx.arc(1, 0, 4.6, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(w * .64, h * .38);
    ctx.fillStyle = "rgb(" + shade("255,90,124", th.enemyMul, th.enemyMix, th.mixCol) + ")";
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(w * .8, h * .68);
    ctx.fillStyle = "rgb(" + th.shard + ")";
    polyPath(6, 4, 0); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(w * .5, h * .78);
    ctx.strokeStyle = "rgb(" + th.echo + ")"; ctx.lineWidth = 1.6;
    shipPath(9); ctx.stroke();
    ctx.restore();
  });
}
function previewBoom(pv, w, h, dt) {
  pv.fire -= dt;
  const savedP = G.parts, savedR = G.rings, oldB = COS.boom, oldQ = G.quality;
  G.parts = pv.parts; G.rings = pv.rings; COS.boom = pv.item.id; G.quality = 1;
  if (pv.fire <= 0) {
    pv.fire = .78;
    pv.bx = w / 2 + rnd(-16, 16); pv.by = h / 2 + rnd(-12, 12);
    boomFx(pv.bx, pv.by, TH.hazard, 1.5, { n: 36, force: 1.3, r: 19 });
  }
  /* a charge pip between blasts so the tile is never a dead rectangle */
  if (pv.fire < .3) {
    const k = 1 - pv.fire / .3;
    pv.rings.push({ x: w / 2, y: h / 2, r: 34 * (1 - k), to: 2, life: .05, max: .14, col: TH.hazard, w: 1.6, wait: 0, sides: 0, rot: 0 });
  }
  stepParts(pv.parts, dt);
  stepRings(pv.rings, dt);
  G.parts = savedP; G.rings = savedR; COS.boom = oldB; G.quality = oldQ;
  withCanvas(pv.c2, null, () => { drawParts(pv.parts); drawRings(pv.rings); });
}
/* draft */
let draftOptions = [];
function openDraft() {
  if (G.mode !== "play" || G.attract) { nextLevel(); return; }
  const pool = CORES.filter((c) => (G.cores[c.id] || 0) < c.max);
  if (!pool.length) { nextLevel(); return; }
  const weighted = [];
  for (const c of pool) { const n = Math.round(TIERS[c.tier].w * 20); for (let i = 0; i < n; i++) weighted.push(c); }
  const picks = [];
  let guard = 0;
  while (picks.length < Math.min(3, pool.length) && guard++ < 400) {
    const c = pick(weighted);
    if (c && picks.indexOf(c) < 0) picks.push(c);
  }
  draftOptions = picks;
  G.drafting = true;
  /* the draft moved from level clear to wave clear, and the copy did not
     follow it — it was telling the player the level was over halfway
     through the level */
  $("#draftEyebrow").textContent = "Wave " + G.wave + " cleared";
  const list = $("#coreList");
  list.innerHTML = "";
  picks.forEach((c, i) => {
    const have = G.cores[c.id] || 0;
    const el = document.createElement("button");
    el.className = "core";
    el.style.setProperty("--c", c.tier === "prime" ? "var(--chrono)" : c.tier === "rare" ? "var(--echo)" : "var(--signal)");
    el.innerHTML = (have ? '<span class="have">' + have + " installed</span>" : "") +
      '<span class="tier">' + TIERS[c.tier].name + "</span><b>" + c.name + "</b><p>" + c.desc + "</p>" +
      '<span class="take"><i class="k">' + (i + 1) + "</i> install</span>";
    el.onmouseenter = () => Audio_.ui();
    el.onclick = () => chooseCore(i);
    list.appendChild(el);
  });
  $("#draft").classList.add("on");
  Audio_.tone({ type: "sine", freq: 520, to: 780, dur: .4, gain: .07 });
}
function chooseCore(i) {
  const c = draftOptions[i];
  if (!c || !G.drafting) return;
  installCore(c);
  $("#draft").classList.remove("on");
  G.drafting = false;
  flash(.1, TH.echo);
  nextLevel();
}
/* settings */
/* ---------------- Settings ----------------------------------------------
   Eleven settings became eight, grouped, with the hint text cut to a few
   words each. What went: "Grain and scanlines" and "Glow" folded into one
   Reduced effects switch (they are the same request — make it calmer — and
   nobody toggles film grain independently), and every hint that explained
   the game rather than the setting.

   What arrived: fullscreen, which a browser game needs and did not have. */
const SETTINGS_DEF = [
  { group: "Audio" },
  { id: "master", label: "Master", type: "range" },
  { id: "music", label: "Music", type: "range" },
  { id: "sfx", label: "Effects", type: "range" },
  { group: "Display" },
  { id: "fullscreen", label: "Fullscreen", type: "fullscreen" },
  { id: "brightness", label: "Brightness", type: "range" },
  { id: "shake", label: "Screen shake", type: "range" },
  { id: "reduced", label: "Reduced effects", hint: "Less glow, grain and motion", type: "toggle" },
  { id: "theme", label: "Palette", type: "theme" },
  { group: "Assists" },
  { id: "autofire", label: "Auto-fire", hint: "The gun runs itself", type: "toggle" },
  { id: "aimassist", label: "Aim assist", hint: "Snaps to nearby targets", type: "toggle" },
];
function isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
function toggleFullscreen() {
  const el = document.documentElement;
  try {
    if (isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  } catch (e) { /* some embeds disallow it; the button simply does nothing */ }
}
function renderSettings() {
  const body = $("#settingsBody");
  body.innerHTML = "";
  for (const s of SETTINGS_DEF) {
    if (s.group) {
      const h = document.createElement("div");
      h.className = "set-group";
      h.textContent = s.group;
      body.appendChild(h);
      continue;
    }
    const row = document.createElement("div");
    row.className = "setting";
    const label = "<div><b>" + s.label + "</b>" + (s.hint ? "<small>" + s.hint + "</small>" : "") + "</div>";
    if (s.type === "range") {
      row.innerHTML = label +
        '<input type="range" min="0" max="1" step="0.05" value="' + SAVE.settings[s.id] + '" aria-label="' + s.label + '">';
      const inp = row.querySelector("input");
      inp.oninput = () => { SAVE.settings[s.id] = parseFloat(inp.value); applySettings(); persist(); };
      inp.onchange = () => uiSfx("move");
    } else if (s.type === "theme") {
      row.innerHTML = label + '<button class="toggle on"><i></i>' + TH.label + "</button>";
      row.querySelector("button").onclick = () => { setTheme(nextPalette()); uiSfx("move"); renderSettings(); };
    } else if (s.type === "fullscreen") {
      const on = isFullscreen();
      row.innerHTML = label + '<button class="toggle' + (on ? " on" : "") + '"><i></i>' + (on ? "On" : "Off") + "</button>";
      row.querySelector("button").onclick = () => {
        toggleFullscreen(); uiSfx("on");
        setTimeout(renderSettings, 180);
      };
    } else {
      const on = !!SAVE.settings[s.id];
      row.innerHTML = label + '<button class="toggle' + (on ? " on" : "") + '"><i></i>' + (on ? "On" : "Off") + "</button>";
      row.querySelector("button").onclick = () => {
        SAVE.settings[s.id] = SAVE.settings[s.id] ? 0 : 1;
        persist(); uiSfx(SAVE.settings[s.id] ? "on" : "off"); applySettings(); renderSettings();
      };
    }
    body.appendChild(row);
  }
}
function applySettings() {
  /* One switch, three effects: the film grain and scanlines, the bloom, and
     every non-essential interface animation (see body.reduced in ui.css).
     They were three separate toggles that people either all wanted or all
     did not. */
  const red = !!SAVE.settings.reduced;
  SAVE.settings.grain = red ? 0 : 1;
  SAVE.settings.bloom = red ? 0 : 1;
  document.body.classList.toggle("reduced", red);
  document.body.classList.toggle("no-grain", red);
  const b = SAVE.settings.brightness == null ? .5 : SAVE.settings.brightness;
  $("#app").style.filter = "brightness(" + (0.6 + b * 0.8).toFixed(2) + ")";
  Audio_.applyVolumes();
}
function drawBestiary() {
  const box = $("#bestiary");
  if (!box) return;
  box.innerHTML = "";
  Object.keys(EN).forEach((ty) => {
    const d = EN[ty];
    const row = document.createElement("div");
    row.className = "beast";
    const c = document.createElement("canvas");
    row.appendChild(c);
    const div = document.createElement("div");
    div.innerHTML = "<b>" + d.label + "</b><span>" + d.note + "</span>";
    row.appendChild(div);
    box.appendChild(row);
    drawIcon(c, ty, 26);
  });
}

/* ---------------- chamber boot terminal ------------------------------------ */
const BOOT_LINES = [
  { c: "dim", d: 0, t: "quantum stress chamber 09 // cold start", dump: 1 },
  { c: "dim", d: .18, t: "substrate handshake ......................... ok", dump: 1 },
  { c: "ok", d: .12, t: "unit CHRONO-01 thawed at 4.2 K .............. ok", dump: 1 },
  { c: "ok", d: .3, t: "temporal buffer holding +1.041s ahead of local frame" },
  { c: "dim", d: .2, t: "chamber seal ..... welded. from the outside." },
  { c: "warn", d: .34, t: "entropy purge protocol is already running in here" },
  { c: "warn", d: .1, t: "purge authority: facility // appeal denied", dump: 1 },
  { c: "err", d: .26, t: "hostile subroutine count: rising", g: 1 },
  { c: "ok", d: .3, t: "echo lab handshake accepted // 1 decoy buffered" },
  { c: "ok", d: .12, t: "recall matrix armed // dash trades places with your decoy" },
  { c: "dim", d: .22, t: "rendering code: user supplied. facility takes no position." },
  { c: "err", d: .4, t: "you are one second ahead. stay there.", g: 1 },
  { c: "hi", d: .5, t: "CHRONO-01 standing by" },
];
const BOOT_LINKS = ["diagnostic bus · carrier unstable", "diagnostic bus · packet loss 12%",
  "diagnostic bus · resync", "diagnostic bus · carrier holding"];
const SCRAMBLE = "!<>-_?#%&$@01";
let bootTimers = [], bootRunning = false, bootClock = 0, bootAfterFn = null;
function bootSchedule(ms, fn) { bootTimers.push(setTimeout(fn, ms)); }
function bootStopTimers() { bootTimers.forEach(clearTimeout); bootTimers = []; }
function bootStamp(s) { return "t+" + s.toFixed(3); }
function bootRow(line) {
  const row = document.createElement("div");
  row.className = "tline " + (line.c || "dim") + (line.g ? " shk" : "");
  row.innerHTML = '<span class="ts"></span><span class="tx"></span>';
  row.querySelector(".ts").textContent = bootStamp(bootClock);
  $("#bootBody").appendChild(row);
  return row.querySelector(".tx");
}
function bootProgress(i) { $("#bootBar").style.width = Math.round((i / BOOT_LINES.length) * 100) + "%"; }
function runBoot(after) {
  bootStopTimers();
  bootRunning = true;
  bootAfterFn = after || goHome;
  bootClock = 0;
  $("#bootBody").innerHTML = "";
  $("#bootBar").style.width = "0%";
  $("#bootFoot").textContent = "CHRONO-01 · cold start";
  show("boot");
  bootLine(0);
}
function bootLine(i) {
  if (!bootRunning) return;
  if (i >= BOOT_LINES.length) { bootProgress(BOOT_LINES.length); bootEnd(); return; }
  const line = BOOT_LINES[i];
  bootClock += line.d + rnd(.09, .01);
  bootProgress(i);
  if (i % 4 === 3) $("#bootLink").textContent = pick(BOOT_LINKS);
  const el = bootRow(line);
  if (line.dump) {
    el.textContent = line.t;
    Audio_.keyTick();
    bootSchedule(90 + line.t.length * 2, () => bootLine(i + 1));
    return;
  }
  let k = 0;
  const step = () => {
    if (!bootRunning) return;
    k++;
    let s = line.t.slice(0, k);
    if (line.g && k < line.t.length) s += SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0];
    el.textContent = s;
    if (k % 3 === 0) Audio_.keyTick();
    if (k < line.t.length) bootSchedule(line.g ? 26 : 13, step);
    else bootSchedule(110, () => bootLine(i + 1));
  };
  bootSchedule(60, step);
}
function bootEnd() {
  const el = bootRow({ c: "hi" });
  el.innerHTML = '<span class="caret"></span>';
  $("#bootFoot").textContent = "chamber sealed · purge in progress";
  bootSchedule(620, () => { bootRunning = false; bootStopTimers(); const f = bootAfterFn; bootAfterFn = null; if (f) f(); });
}
function skipBoot() {
  if (!bootRunning) return;
  bootStopTimers();
  $("#bootBody").innerHTML = "";
  bootClock = 0;
  for (const line of BOOT_LINES) { bootClock += line.d; bootRow(line).textContent = line.t; }
  bootProgress(BOOT_LINES.length);
  const el = bootRow({ c: "hi" });
  el.innerHTML = '<span class="caret"></span>';
  $("#bootFoot").textContent = "chamber sealed · purge in progress";
  bootSchedule(340, () => { bootRunning = false; bootStopTimers(); const f = bootAfterFn; bootAfterFn = null; if (f) f(); });
}
$("#boot").addEventListener("pointerdown", () => { Audio_.init(); Audio_.resume(); skipBoot(); });


