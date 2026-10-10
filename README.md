# GUTTERLIGHT

*Every light gutters. That is how it is passed on.*

Gutterlight is a 2D action-exploration game (a "metroidvania") in the spirit of Hollow Knight. You are
the Wickling, a small candle-creature with a strange blue flame, waking on the ash above **Tallowdeep**, a buried
kingdom of living wax. Below lies one large, connected world: ten regions, eight boss fights, hidden
rooms, people to meet and a story you piece together yourself from what they say and what is carved in
the walls.

Everything in the game (art, animation, music, sound effects, story and world) was written as code
and is generated while you play. There are no image, audio or font files.

---

## How to play

No installation and no internet connection needed.

1. Open **`dist/Gutterlight.html`** (the whole game in one file) in a modern desktop browser. Double-clicking
   the file is enough. The game was developed and tested in Chromium (the engine behind Chrome and Edge). Other
   current browsers that support Canvas and Web Audio, such as Firefox, should also work. You can copy this single file anywhere,
   for example onto a USB stick.
2. Or open **`index.html`** at the project root. It is the same game, loaded from the `src/` folder.
3. Press any key on the title screen. (Browsers only allow sound after a key press or click, which is why
   the title asks for one.)

The game draws at 1280×720 and scales to fit the window. Use your browser's fullscreen mode (usually
**F11**) for the best view. A keyboard or a gamepad is required; the mouse is not used and there are no
touch controls.

---

## Controls

Both keyboard layouts below work at the same time, so you can use either one without changing a setting.
The keys are read by their **position** on the keyboard. On AZERTY, QWERTZ and other layouts the
game shows the key that is printed in that position. In Firefox and Safari it can only do this after
you have pressed a key. The **Controls** screen (title menu or pause menu) always shows the current
bindings.

| Action | Keyboard: arrows layout | Keyboard: WASD layout | Gamepad (Xbox / PlayStation) |
|---|---|---|---|
| Move | ← → | A D | D-pad or left stick |
| Look/aim up · **Interact** (rest, read, talk, travel, shop) | ↑ | W | D-pad ↑ / stick up |
| Aim down | ↓ | S | D-pad ↓ / stick down |
| Jump (hold for a higher jump) | Z | Space | A / Cross |
| Attack | X | J | X / Square |
| Dash | C or Shift | K or Shift | RB or RT / R1 or R2 |
| Spell (tap) · Kindle, which heals (hold) | V | L | B / Circle |
| Map | Tab | M | View (Back) / Share |
| Inventory | I | I | LB / L1 |
| Pause | Esc | P | Start / Options |
| Menu confirm | Enter or Z | Space or J | A / Cross |
| Menu back | Esc, X or Backspace | Esc or Backspace | B / Circle |

- **Directional attacks:** hold Up while attacking to strike upward. In the air, hold Down while attacking
  to strike downward. A downward strike that hits an enemy or thorns bounces you back up.
- **Drop through thin ledges:** hold Down and press Jump.
- **Kindle (heal):** stand still on the ground and hold Spell. Each heal uses some of the Ember you build up
  by hitting enemies.
- You learn new movements as you play. When you get one, a card explains its controls.
- The game pauses on its own if the window loses focus or the gamepad you are using is disconnected.
- Gamepads need to use the browser's "standard" button mapping. Most Xbox and PlayStation controllers do.

---

## Tips (no spoilers)

- **Sconces are your save points.** Press Up at a Sconce to light it and rest. Resting restores your
  health, saves the game and sets where you come back after dying. You can only change your **Sigils**
  (equippable charms) while resting.
- **Dying is not the end.** Your Cinders (money) stay behind in a **Gutterwisp**, a smoky echo of you,
  where you fell. While it is out there you can hold less Ember. Go back and strike it to get everything
  back. If you die again first, those Cinders are lost.
- **Read the walls.** Carvings and the people you meet tell the story, and their words change as you
  make progress. Talk to everyone more than once.
- **The map** (Tab / M / Back) shows the rooms you have visited. Someone in the first town sells charts
  that show the rest of a region. The map marks you, Sconces, merchants, fast-travel posts and your Gutterwisp.
- **The inventory** (I / LB) shows your abilities, collectibles, completion and Sigils.
- **Remember the places you cannot reach yet.** A ledge that is too high, a gap that is too wide or a
  cracked wall usually means you should come back later. Cracked walls often hide something; try hitting
  them.
- **Lanternway posts** let you travel quickly between the posts you have already lit. A post will not
  take you away while an enemy is close or right after you have been hurt.
- Options (pause menu): master, music, sound and ambience volume, screen shake and on-screen control hints.

---

## Saves

- The game saves automatically when you rest at a Sconce, move between rooms, pick up items, beat bosses
  and quit to the title. **Quit to Title** keeps your progress; you start again at the last Sconce you
  rested at.
- There are **3 save slots**, shown on the title screen with the region, play time and completion. You can
  erase a slot from there.
- Saves are kept in your **browser's local storage** (keys starting with `gutterlight.v1.`). They stay on
  this computer, in this browser:
  - Clearing your browser's site data, or using a private/incognito window, removes them.
  - Another browser, or in some browsers another copy of the file in a different folder, starts with
    empty slots.
  - If the browser does not allow storage, the game still runs. Once you are playing, a short notice says that
    progress will not be kept.
- Do not play the same save in two tabs at once. The game will notice, refuse to save in the older tab
  and ask you to go back to the title.

---

## Credits

**GUTTERLIGHT** was made entirely in code. Every image, note and sound is generated at runtime from
JavaScript (Canvas 2D for the graphics, Web Audio for the music and sound). There are no image files, no
recordings and no font files. The story, characters and world are original.

---

## For developers

The game is vanilla JavaScript with **zero runtime dependencies**. `index.html` loads about 100 scripts from
`src/` in order and works from `file://`. The dev tools in `tools/` need Node.js (tested with 24) and use
Playwright with headless Chromium (`cd tools && npm install`, then `npx playwright install chromium`).

```sh
node tools/test_all.js           # full regression run (23 steps, ~20-35 min); must print ALL PASS
node tools/test_all.js --quick   # ~3 min, skips the slow steps (audio renders, the full bot playthrough)
node tools/build.js              # builds dist/Gutterlight.html (all scripts inlined, checks that it boots)
node tools/e2e.js --file dist/Gutterlight.html        # real boot-to-save flow on the build
node tools/playthrough.js --file dist/Gutterlight.html  # a bot plays the whole game to both endings (~7 min)
```

Structure:

| Path | Contents |
|---|---|
| `index.html`, `src/main.js` | page and boot; the script list between `SCRIPTS:BEGIN/END` is the load order |
| `src/core/` | namespace and URL params, input (keyboard + gamepad), save slots and settings, utilities |
| `src/engine/` | fixed-step game loop and modes, world and rooms, physics, combat, camera, lighting, particles, rendering, debug API |
| `src/player/` | the Wickling: movement, abilities, combat, animation |
| `src/entities/` | enemies (per region), bosses, the boss/enemy framework, interactables, NPCs, the Gutterwisp |
| `src/art/` | procedural art: terrain, backgrounds, props, characters, region themes |
| `src/audio/` | Web Audio synth, mixer and sequencer, sound effects, ambience, `tracks/` (16 music tracks) |
| `src/ui/` | HUD, menus, title, map, inventory, shops, dialogue, cards, endings |
| `src/data/` | text, items, rooms (`regions/`, `arenas/`; generated by `tools/gen/*.js`, never edit by hand) |
| `design/` | world plan (`world_plan.json` / `.md`, `world_map.png`) |
| `docs/` | `DESIGN.md` (creative contract), `TECH_SPEC.md` (technical contract), `STATUS.md` (release state), `api/` (per-module APIs), `INTEGRATION_LOG.md` |
| `tools/` | validators, reachability checker, headless tests, playthrough bot, build; see `tools/README.md` |

Developer URL parameters, e.g. `index.html?test=1&room=<id>&abilities=all&god=1&mute=1&debug=1`.
`test=1` skips the title and starts a temporary game that is never saved. `room`, `tx`/`ty`, `abilities`, `god`
and `wake` only work together with `test=1`. `debug=1` turns on the debug overlay, and only with `debug=1` or
`test=1` can F3 or the backquote key toggle it. `mute=1`, `seed=<n>` (fixed cosmetic randomness) and
`paused=1` (no game loop; tools step frames themselves) are conveniences for the test tools. Without parameters
the game runs as released. Full list: `docs/api/engine.md` §16.
