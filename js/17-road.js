/* The Trophy Road screen: one continuous vertical progression path.

   This replaces the old arena-strip map, which laid each arena's fifteen
   levels out as a horizontally scrolling row of identical cards. That read
   as a spreadsheet rather than a journey, and on a phone it was a sideways
   scroll inside a downward scroll — you could see two and a half levels at
   a time out of seventy-five.

   The model here is one road, top to bottom, the whole game on it:

     chapter banner (arena)
       level node  ->  reward card
       level node  ->  reward card
       ...
     chapter banner (next arena)

   Three states, and they have to be readable at a glance from across the
   room: CLEARED (filled, accent, a tick), CURRENT (bright, ringed, pulsing,
   labelled with what to do), LOCKED (dimmed, hairline, a bar). Everything
   else — trophies banked, the ceiling you are chasing, the mutation replay
   toggle — is secondary and sits quieter.

   The road is built from the same data the run loop reads (levelUnlocked,
   levelRec, rewardFor), so it cannot drift out of sync with what actually
   unlocks. */

/* ---------------- the road model ---------------------------------------
   A flat list of rows, because a flat list is what scrolls. Rebuilt on every
   open — it is seventy-five levels, not seventy-five thousand, and building
   it fresh means the screen can never show stale unlock state. */
function buildRoad() {
  const rows = [];
  TIMELINES.forEach((t, ai) => {
    rows.push({ kind: "chapter", arena: t.id, ai });
    for (let i = 0; i < LEVELS_PER_ARENA; i++) {
      rows.push({ kind: "level", arena: t.id, idx: i, ai });
      const rw = t.levels[i] && t.levels[i].reward;
      if (rw) rows.push({ kind: "reward", arena: t.id, idx: i, ai, reward: rw });
    }
  });
  return rows;
}

/* What a reward actually hands you, as a short label and an icon glyph.
   Deliberately terse: a reward card is a thing you glance at, and a
   paragraph explaining a cosmetic is a paragraph nobody reads. */
function rewardParts(r) {
  const out = [];
  if (r.shards) out.push({ icon: "shard", label: fmt(r.shards), sub: "shards" });
  if (r.ability) {
    const a = abilOf(r.ability);
    out.push({ icon: "abil", label: a ? a.name : r.ability, sub: "ability" });
  }
  if (r.cosmetic) {
    const c = cosmOf(r.cosmetic);
    out.push({ icon: "cos", label: c ? c.name : r.cosmetic, sub: "cosmetic" });
  }
  if (r.lore) {
    const l = LORE.find((x) => x.id === r.lore);
    out.push({ icon: "lore", label: l ? l.title : r.lore, sub: "archive" });
  }
  return out;
}
/* a milestone is a reward that hands over something more than currency —
   those get the heavier visual treatment, and they are the reason to keep
   going rather than the drip that keeps you going */
function isMilestone(r) { return !!(r.ability || r.cosmetic || r.lore); }

/* ---------------- state per row ---------------------------------------- */
const ROAD_DONE = 2, ROAD_CURRENT = 1, ROAD_LOCKED = 0;
function levelState(arena, idx) {
  if (levelRec(arena, idx).cleared) return ROAD_DONE;
  if (levelUnlocked(arena, idx)) return ROAD_CURRENT;
  return ROAD_LOCKED;
}
/* The one level the road is pointing at: the first uncleared level that is
   actually open, searched across every arena in order. This is what PLAY on
   the main menu resolves to, so "the next thing to do" is one definition in
   one place rather than each screen guessing. */
function roadNextTarget() {
  for (const t of TIMELINES) {
    if (!arenaUnlocked(t.id)) continue;
    for (let i = 0; i < LEVELS_PER_ARENA; i++) {
      if (!levelUnlocked(t.id, i)) break;
      if (!levelRec(t.id, i).cleared) return { arena: t.id, idx: i };
    }
  }
  /* everything cleared — point at the last boss so PLAY still does something */
  return { arena: TIMELINES[TIMELINES.length - 1].id, idx: LEVELS_PER_ARENA - 1 };
}

/* ---------------- rendering -------------------------------------------- */
/* which levels have the mutation replay armed. Session state on purpose:
   it is a choice about the next attempt, not a saved preference. */
const roadMut = {};
let roadBuilt = false;

function renderRoad(opts) {
  opts = opts || {};
  const box = $("#roadBody");
  const rows = buildRoad();
  const target = roadNextTarget();
  box.innerHTML = "";
  $("#roadTrophies").textContent = fmt(recomputeTrophies());

  let currentEl = null;
  rows.forEach((row) => {
    const t = tlOf(row.arena);
    if (row.kind === "chapter") {
      const open = arenaUnlocked(row.arena);
      const done = arenaClearedCount(row.arena);
      const el = document.createElement("div");
      el.className = "chapter" + (open ? "" : " sealed");
      el.style.setProperty("--tc", "rgb(" + t.accent + ")");
      el.innerHTML =
        '<div class="ch-line"></div>' +
        '<div class="ch-body">' +
          '<span class="ch-kicker">' + (open ? "Sector " + (row.ai + 1) : "Sealed sector") + "</span>" +
          "<h3>" + t.name + "</h3>" +
          '<span class="ch-prog">' + (open
            ? done + " of " + LEVELS_PER_ARENA + " cleared"
            : "Finish " + tlOf(t.unlockedBy).name + " to open") + "</span>" +
        "</div>";
      box.appendChild(el);
      return;
    }

    if (row.kind === "level") {
      const st = levelState(row.arena, row.idx);
      const L = t.levels[row.idx];
      const rec = levelRec(row.arena, row.idx);
      const isTarget = target.arena === row.arena && target.idx === row.idx;
      const el = document.createElement("button");
      el.className = "rnode " + (st === ROAD_DONE ? "done" : st === ROAD_CURRENT ? "open" : "locked") +
        (L.boss ? " boss" : "") + (isTarget ? " target" : "");
      el.style.setProperty("--tc", "rgb(" + t.accent + ")");
      el.dataset.arena = row.arena;
      el.dataset.idx = row.idx;

      const cap = levelMaxTrophies(row.arena, row.idx);
      let meta;
      if (st === ROAD_LOCKED) meta = '<span class="rmeta lock">Locked</span>';
      else if (st === ROAD_DONE) meta = '<span class="rmeta"><i class="ic-trophy"></i>' +
        fmt(rec.trophies) + " / " + fmt(cap) + "</span>";
      else meta = '<span class="rmeta go">' + (isTarget ? "Play now" : "Ready") + "</span>";

      el.innerHTML =
        '<span class="rpip">' + (L.boss ? '<i class="ic-boss"></i>'
          : st === ROAD_DONE ? '<i class="ic-tick"></i>'
          : st === ROAD_LOCKED ? '<i class="ic-lock"></i>'
          : (row.idx + 1)) + "</span>" +
        '<span class="rinfo">' +
          '<span class="rnum">Level ' + (row.idx + 1) + (L.boss ? " · Boss" : "") + "</span>" +
          '<span class="rname">' + L.name + "</span>" +
          meta +
        "</span>";

      /* the mutation replay, on a level already beaten once */
      if (st === ROAD_DONE) {
        const key = row.arena + ":" + row.idx;
        const mt = document.createElement("i");
        mt.className = "rmut" + (roadMut[key] ? " on" : "");
        mt.title = "Replay with a mutation — harder, worth 25% more";
        mt.innerHTML = "<b>+25%</b>";
        mt.onclick = (ev) => {
          ev.stopPropagation();
          roadMut[key] = !roadMut[key];
          mt.classList.toggle("on", !!roadMut[key]);
          uiSfx(roadMut[key] ? "on" : "off");
        };
        el.appendChild(mt);
      }

      el.onclick = () => {
        if (st === ROAD_LOCKED) { roadDenied(el, row); return; }
        uiSfx("confirm");
        transitionTo(() => enterLevel(row.arena, row.idx, roadMut[row.arena + ":" + row.idx] ? 1 : 0));
      };
      el.addEventListener("mouseenter", () => { if (st !== ROAD_LOCKED) uiSfx("hover"); });
      box.appendChild(el);
      if (isTarget) currentEl = el;
      return;
    }

    /* ---- a reward card, hanging off the spine ---- */
    const rec = levelRec(row.arena, row.idx);
    const claimed = !!rec.paid;
    const parts = rewardParts(row.reward);
    const mile = isMilestone(row.reward);
    const el = document.createElement("div");
    el.className = "rrew" + (claimed ? " claimed" : "") + (mile ? " milestone" : "");
    el.style.setProperty("--tc", "rgb(" + t.accent + ")");
    el.innerHTML =
      '<span class="rstub"></span>' +
      '<span class="rrew-in">' +
        parts.map((x) => '<span class="rpart"><i class="ic-' + x.icon + '"></i>' +
          "<b>" + x.label + "</b><em>" + x.sub + "</em></span>").join("") +
        (claimed ? '<span class="rclaim"><i class="ic-tick"></i></span>' : "") +
      "</span>";
    box.appendChild(el);
  });

  /* Put the player where they actually are. Without this the road opens at
     Chamber 09 level 1 forever, which is the wrong place for everyone who
     has played before. */
  roadBuilt = true;
  requestAnimationFrame(() => {
    if (!currentEl) return;
    const y = currentEl.offsetTop - box.clientHeight * (opts.centre ? .42 : .38);
    box.scrollTop = Math.max(0, y);
    if (opts.flash) {
      currentEl.classList.add("just");
      setTimeout(() => currentEl.classList.remove("just"), 1400);
    }
  });
  /* the stagger-in, once per open */
  box.classList.remove("enter");
  void box.offsetWidth;
  box.classList.add("enter");
}

/* A locked level says exactly what to do about it, once, where the player
   is already looking — rather than a generic buzz. */
function roadDenied(el, row) {
  uiSfx("deny");
  el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake");
  const t = tlOf(row.arena);
  const msg = row.idx === 0
    ? "Finish " + tlOf(t.unlockedBy).name + " to open " + t.name + "."
    : "Complete Level " + row.idx + " to unlock this level.";
  roadTip(el, msg);
}
let roadTipT = 0;
function roadTip(el, msg) {
  const tip = $("#roadTip");
  tip.textContent = msg;
  tip.classList.add("on");
  clearTimeout(roadTipT);
  roadTipT = setTimeout(() => tip.classList.remove("on"), 2600);
}

/* ---------------- the unlock beat --------------------------------------
   Called from the level-complete screen when a clear opened the next level.
   The road is already the place the player is about to look, so the unlock
   plays THERE rather than as a toast that disappears before they arrive. */
let roadPendingUnlock = null;
function flagRoadUnlock(arena, idx) { roadPendingUnlock = { arena, idx }; }
function playRoadUnlock() {
  if (!roadPendingUnlock) return;
  const { arena, idx } = roadPendingUnlock;
  roadPendingUnlock = null;
  const el = $('#roadBody .rnode[data-arena="' + arena + '"][data-idx="' + idx + '"]');
  if (!el) return;
  el.classList.add("unlocking");
  setTimeout(() => { Audio_.unlockFx(); }, 180);
  setTimeout(() => el.classList.remove("unlocking"), 1600);
}
