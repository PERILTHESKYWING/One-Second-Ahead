/* Secret detection, the hidden seal, and branch-completion wiring. */
/* =====================================================================
   BRANCH WIRING — secrets detection, the seal, branch completion,
   and the last few DOM hooks.
   ===================================================================== */
const BOSS_EPITAPH = {
  paradox: "paradox resolved",
  stillhour: "the minute moved",
  perihelion: "debt cleared",
  drownedindex: "index closed",
  omega: "report filed",
};
let codeBuffer = "";

/* --- the seal: one tile per level that was cut, not cast --- */
function sealPos() {
  const li = G.levelIdx, ti = TIMELINES.indexOf(TL);
  const gx = [.22, .78, .5, .34, .66][(li + ti) % 5];
  const gy = [.7, .3, .22, .78, .5][(li + ti * 2) % 5];
  return { x: W * gx, y: H * gy };
}
function drawSeal() {
  if (!G.player || G.mode !== "play") return;
  const s = sealPos();
  const near = Math.hypot(G.player.x - s.x, G.player.y - s.y) < 90;
  const a = SAVE.secrets.seal ? .3 : near ? .16 + Math.sin(G.time * 3) * .05 : .055;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.globalAlpha = a;
  ctx.strokeStyle = "rgb(" + TH.ink + ")";
  ctx.lineWidth = 1.2;
  /* a weld bead, drawn the wrong way round */
  ctx.beginPath();
  for (let i = 0; i <= 22; i++) {
    const f = i / 22, x = -26 + f * 52;
    const y = Math.sin(f * 16) * 3.4;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.stroke();
  ctx.strokeRect(-27, -13, 54, 26);
  if (G.sealT > 0) {
    ctx.globalAlpha = .5;
    ctx.strokeStyle = "rgb(" + TH.shard + ")";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 30, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(G.sealT / 3, 0, 1));
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function checkSecrets(dt) {
  const p = G.player;
  if (!p || p.hp <= 0) return;
  /* the weld — stand on the seam, stop shooting, look at it */
  if (!SAVE.secrets.seal) {
    const s = sealPos();
    const still = Math.hypot(p.vx, p.vy) < 60 && !mouse.down;
    if (Math.hypot(p.x - s.x, p.y - s.y) < 30 && still) {
      G.sealT = (G.sealT || 0) + dt;
      if (G.sealT >= 3) { unlockSecret("seal"); G.sealT = 0; }
    } else G.sealT = Math.max(0, (G.sealT || 0) - dt * 2);
  }
  /* eleven fifty-nine — dash through the orrery's hand at twelve */
  if (!SAVE.secrets.orrery && G.boss && G.boss.type === "stillhour" && p.dashing > 0) {
    const b = G.boss;
    if (dist(p, b) < b.r * 1.1 && Math.abs(angDiff(b.handAng, -Math.PI / 2)) < .3) unlockSecret("orrery");
  }
}

function markBranchCleared() {
  const st = SAVE.tl[TL.id];
  if (!st || st.cleared) return;
  st.cleared = 1;
  persist();
  const nxt = TIMELINES.find((t) => t.unlockedBy === TL.id);
  if (nxt) {
    Audio_.unlockFx();
    toast("Branch online · " + nxt.name + " (" + nxt.code + ")", "var(--shard)");
    banner(nxt.name, "branch unsealed");
  }
  refreshBranchHome();
}
/* Called by finishLevel() when level 15 falls, rather than by nextLevel()
   walking off the end of the branch — there is no walking off the end any
   more, a boss clear returns to the map like every other level. */
function branchVictory() {
  G.score += 2000;
  text(W / 2, H * .4, "branch resolved", TH.shard, 26);
  flash(.3, TH.shard);
}

/* --- the boss bar: phase pips, a chasing ghost, and a name --- */
let bossGhost = 1;
function drawBossBar() {
  const b = G.boss;
  if (!b || b.dead) { bossGhost = 1; return; }
  const d = EN[b.type], col = ecol(d.col);
  const f = clamp(b.hp / b.maxHp, 0, 1);
  bossGhost = bossGhost < f ? f : lerp(bossGhost, f, 1 - Math.exp(-3 * .016));
  const w = Math.min(560, W * .62), x = (W - w) / 2, y = 34;
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "800 12px " + MONO;
  ctx.fillStyle = "rgba(" + TH.ink + ",.9)";
  ctx.fillText(d.label.toUpperCase(), W / 2, y - 10);
  ctx.font = "600 8.5px " + MONO;
  ctx.fillStyle = "rgba(" + TH.ink + ",.45)";
  ctx.fillText(TL.code, W / 2, y + 22);
  ctx.textAlign = "left";
  ctx.fillStyle = "rgba(0,0,0,.4)";
  rrect(x - 2, y - 3, w + 4, 12, 6); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.16)";
  rrect(x, y, w * bossGhost, 6, 3); ctx.fill();
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "rgb(" + shade(d.col, .8) + ")");
  g.addColorStop(1, "rgb(" + shade(d.col, 1.35, .3, [255, 255, 255]) + ")");
  ctx.fillStyle = g;
  rrect(x, y, Math.max(2, w * f), 6, 3); ctx.fill();
  /* phase thresholds, so the fight reads as three acts */
  const marks = b.type === "paradox" ? [.35, .7] : b.type === "omega" ? [.3, .65] : [.3, .55, .8];
  ctx.fillStyle = "rgba(0,0,0,.55)";
  marks.forEach((mk) => ctx.fillRect(x + w * mk - 1, y - 1, 2, 8));
  ctx.restore();
}

/* --- DOM hooks for the new screens --- */
/* Every one of these runs at load, so every one of them survives its element
   not being on the page — see the note on hook() in 14-branch-shell.js. */
hook("#cineSkip", (el) => el.addEventListener("pointerdown", skipCine));
hook("#cine", (el) => el.addEventListener("pointerdown", skipCine));
hook("#admGo", (el) => { el.onclick = tryAdmin; });
hook("#admCode", (el) => el.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); tryAdmin(); } }));
hook("#opsLink", (el) => { el.onclick = () => { openAdmin(); uiSfx("open"); }; });
if (SAVE.admin || SAVE.secrets.constant) document.body.classList.add("showops");
setTimeline("ch09");
refreshBranchHome();

raf = requestAnimationFrame(frame);
