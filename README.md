# One Second Ahead

A single-player top-down arena shooter. You are CHRONO-01, sealed in Chamber 09
while the Concordance runs its entropy purge. Dash through trouble, drop a decoy
to take the hit meant for you, and swap places with it when the room closes in.

No build step, no dependencies, no external assets — every sprite, background and
sound effect is drawn or synthesized at runtime by plain HTML/CSS/JS.

## Running it

Any static file server works, since the game is loaded via `<script src>` tags
(not JS modules) and browsers block `file://` fetches for those:

```bash
python3 -m http.server 8080
# then open http://localhost:8080/index.html
```

Or use the VS Code "Live Server" extension, `npx serve`, etc. Progress, settings
and cosmetics are saved to the browser's `localStorage`.

## Controls

`WASD` move · aim/fire are automatic · `Space` dash (or swap places with your
decoy) · `E` summon an echo/decoy · `T` toggle day/night theme · `Esc` pause.

`1` `2` `3` fire the three abilities in your loadout, in slot order.

The dash goes where you are **steering**, not where you are pointing — the gun
keeps facing whatever it was shooting, so you can dash out of a squeeze while
still firing into it. It carries invulnerability past the end of the launch and
a short speed burst after it, which is what makes it an escape rather than a
fast walk.

The hull starts fully upgraded. The Echo Lab doesn't sell stats — it sells
twelve abilities, and you carry three of them, so the question is which three
work together rather than which one is strongest.

## The Trophy Road

Five arenas of fifteen levels each, and unlock is strictly sequential: beat
level N to open N+1, beat level 15 to bring the next arena online. Levels are
**discrete attempts**, not a forced march — you pick one off the space-time
map, you play it, and you come back to the map.

Each arena's fifteen split into four tiers with four different jobs. **Learn**
(1–4) teaches one trick per level and turns that arena's signature hazard on
one piece at a time instead of all at once. **Build** (5–9) introduces the rest
of the roster a body at a time with the hazard fully on. **Master** (10–14) is
five hand-designed puzzles built out of that arena's own mechanics, each meant
to beat you once. **Reckoning** (15) is the boss, and it is the hardest fight
in the arena by a clear margin.

**Your mods reset every single level attempt.** Every attempt starts from the
baseline plus your three-ability loadout, and the draft happens *between the
waves of a level* rather than between levels — your build is for this fight,
not for the whole branch. That is what makes trophies comparable between
attempts: you cannot out-score your own record by having stacked more mods on
the way in.

**Trophies** are a per-attempt score kept as a best-ever value per level. A
level's base value is ten times its position in the 75-level sequence; you
bank that times how much of the level you finished, times bonuses for clearing
it untouched (+15%), under par (+10%), or with a mutation switched on (+25%).
A failed attempt still banks something. You can never lose trophies.

Two reward tracks hang off that. A **first-clear reward** pays out once per
level — shards always, plus an ability, a cosmetic or an archive entry at five
levels per arena. An **arena ladder** pays out again every time your banked
trophies in that arena cross a threshold, which is what makes replaying a
level you have already beaten worth doing. Any level you have cleared can be
replayed with a **mutation** switched on: the special grades survival rolls,
in a level you have outgrown, for a quarter more trophies.

Progress from before this existed migrates in place — a cleared arena arrives
with all fifteen levels cleared at baseline trophies.

## Getting in

`PLAY` does one thing and always the right one: the tutorial if you have
never played, otherwise the level the Trophy Road is pointing at. There is no
mode to choose first.

The **tutorial** is six playable steps — move, fire, dash, read the floor,
drop an echo, clear the room — in the real game with the wave director
suspended. It cannot kill you, it is skippable, and it is remembered.

The **Trophy Road** is the progression screen: one vertical path, all
seventy-five levels on it, with each level's first-clear reward shown in
place. It opens scrolled to wherever you are. Levels unlock strictly in
order, and a locked one tells you exactly what to finish first.

## Project layout

This game started as one ~9,800-line HTML file and has been split into sections
purely for editability — there's no bundler, so **load order in `index.html`
still matters**: every file shares one global scope, and later files reference
functions/constants defined by earlier ones.

```
index.html              Page shell: markup for every screen (home, HUD, shop,
                         archive, settings, results, etc.) and the <script> tags
                         that load the JS below, in order.
css/
  style.css             All visual styling — themes, HUD, panels, screens.
js/
  01-engine-core.js      Math/DOM helpers, the save system, theme + color
                          palettes, the audio engine, base level & enemy tables.
  02-content-branches.js Content tables: the five branch/timeline definitions,
                          archive lore, secrets, bosses, the shop, cosmetics
                          and run-core (draft) definitions.
  02b-arena-curve.js     The 15-level curve every arena runs on (the four
                          tiers, the hazard staging, the hand-authored
                          Master levels), the barrier-drone roster addition,
                          and the first-clear reward table.
  02c-trophy-road.js     Per-level save state, the trophy formula, the two
                          reward tracks, the mutation replay, and the unlock
                          queries the road and the run loop ask.
  03-render-toolkit.js   Canvas setup and the shared low-level drawing toolkit
                          (gradients, shadows, limbs, eyes, plates, chains...).
  04-enemy-art.js        Procedural art for every base-game (Chamber 09) enemy.
  05-branch-art.js       Procedural art for enemies/hero unique to the four
                          filed timelines, plus the drawEnemy dispatcher.
  06-player-render.js    Player and echo (decoy) rendering: hero body, motion
                          trails, decoy visuals.
  07-game-state-fx.js    The live run-state object (G), the particle/ring/
                          shake FX system, afterimages/debris, telegraphs.
  08-run-and-player.js   Run setup, level/wave progression, survival mode,
                          damage resolution, player controls (fire, dash,
                          time-swap, echo summon, movement).
  09-enemies-and-render.js Enemy AI update loop, boss behaviour, projectile/
                          pickup updates, the main world/HUD render pass.
  10-branch-ai.js         Branch-specific enemy AI (the TLAI table).
  11-branch-physics.js    The arena geometry engine (solid boxes, collision,
                          line-of-sight), Terminus's three room layouts, the
                          barrier drone's projected walls, and the branch room
                          physics: Glassfall's shattering floor, Emberwake's
                          heatwaves and flame spurts, Nulltide's undertow, the
                          Terminus clock and the second behind.
  12-hud-and-screens.js   HUD widgets, screen routing, the Echo Lab shop UI,
                          settings panel, the boot terminal sequence.
  13-cinematic.js         The "Cold Open" intro cinematic.
  14-branch-shell.js      Input handling, run flow, menu routing, the
                          operator console and the main loop.
  15-branch-wiring.js     Secret detection, the hidden seal, branch completion.
  16-abilities.js         The twelve pilot abilities and the three-slot
                          loadout, plus the special-grade mutations survival
                          rolls onto its enemies (one for every enemy type).
  17-road.js              The Trophy Road screen: one vertical progression
                          path, 75 level nodes and their reward cards.
  18-shell.js             The shell: UI sound, screen transitions, the
                          first-time tutorial, and what PLAY resolves to.
css/
  ui.css                  The redesigned screens (home, road, loadout,
                          collection, settings, help, pause, results) and
                          the icon set, as inline SVG masks.
```

### Editing tips

- Gameplay tuning (enemy stats, level pacing, shop prices) lives in
  `js/01-engine-core.js` and `js/02-content-branches.js` — no rendering code
  to wade through. The per-level difficulty curve, the hazard staging and the
  reward tables live in `js/02b-arena-curve.js`; the trophy formula and the
  ladder in `js/02c-trophy-road.js`. `docs/TUNING.md` §16–19 is the reference
  for all of it.
- Visual changes to an enemy or the player go in `js/04-enemy-art.js`,
  `js/05-branch-art.js` or `js/06-player-render.js` depending on which
  character you're touching.
- New branch/timeline mechanics touch three places: content in
  `js/02-content-branches.js`, its AI in `js/10-branch-ai.js`, and its room
  physics in `js/11-branch-physics.js`.
- Room shapes are authored in the `LAYOUTS` table in `js/11-branch-physics.js`
  as rounded (optionally rotated) solid boxes cut out of the branch's floor.
  Only **Terminus** has them now — its geometry is the clock. The four main
  arenas are open floor, and their cover walks in with the wave instead: the
  **barrier drone** (`pylon`/`pane`/`shimmer`/`bulkhead`, one behaviour and
  four skins) projects a standing wall that other enemies and your shots have
  to go around, and that wall stands until you kill the drone holding it up.
  Two rules in `LAYOUTS` are load-bearing rather than stylistic: openings are
  sized in pixels so a chokepoint stays one at any window size, and in a branch
  whose floor shrinks no wall may reach past `WALL_MAX_R` — if a closing rim
  can shut inside a wall, you end up stuck between the two.
- Level hazards damage the **player only**. Nothing the room does hurts an
  enemy; a room that fights on your behalf turns every hazard into a free
  weapon.
- `docs/TUNING.md` is the reference for every knockback, dash, arena and
  branch-mechanic constant: what it does, what moving it changes, and the
  measured numbers each curve actually produces.
- Everything is global (no imports/exports), so a function or constant is
  visible to every file loaded after it in `index.html`. If you add a new
  file, add its `<script>` tag in the right position.
