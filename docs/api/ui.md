# G.UI — screens, HUD, cards and the presentation kit (`src/ui/*.js`)

Owner: UI module. Implements TECH_SPEC §13 exactly, plus a small shared drawing kit that any module may use
for on-screen text (fonts, wrapping, key caps, ornaments). Everything is drawn at 1280×720 in screen space by
`G.UI.draw(ctx)` (pipeline step 16). No DOM access at load time; all text comes from `G.Text` with English
fallbacks, so a missing key never shows `undefined`.

Self-test: `node tools/ui_selftest.js [filter…]` — opens every screen with empty / mid-game / complete fixtures,
drives it with virtual input, asserts behaviour (73 checks) and writes screenshots to `test-output/ui/*.png`.

## 1. Engine-facing API (TECH_SPEC §13)

```js
G.UI.update(dt)            // every fixed step, also while paused/blocked (engine calls it after G.input.update)
G.UI.draw(ctx)             // every frame, last pipeline step (HUD + overlays + screen stack)
G.UI.isBlocking()          // true while any blocking screen is on the stack (gameplay frozen)
G.UI.init(canvas)          // once at boot (pointer tap = "any key" on the title)

G.UI.openTitle()                         // title: "Press any key" gate → menu → 3 save slots
G.UI.playIntro(onDone)                   // opening verse (G.Text.intro); confirm/attack/jump advance; Esc/Backspace/pad B skips (keyboard X only advances); onDone once
G.UI.dialogue({ name, lines, onDone, voice: { pitch } })   // lines = pages (string | string[]); '\n' ok
G.UI.lore(loreId, onDone)                // carved-stone tablet: G.Text.lore[id] = { title, lines[] }
G.UI.sparkMemory(sparkId, onDone)        // dreamy full-screen memory: G.Text.sparks[id] = { title?, lines[] }
G.UI.openShop(shopId, onDone)            // 'pell' | 'quill' | 'bramm'
G.UI.openLanternway(currentId, onDone)   // onDone(travelId | null); confirm calls G.game.travel(id); refuses (dialogue ui.lanternwayDanger) unless G.game.isSafeRoom()
G.UI.openMap()
G.UI.openInventory({ atSconce, onClose })
G.UI.openPause()
G.UI.abilityGet(abilityId, onDone)       // big card; input ignored for 1.3 s, then confirm closes
G.UI.itemGet(itemSpec, onDone)           // medium card; specs as G.game.giveItem (+ 'brand', 'chart:<region>')
G.UI.toast(text)                         // small, bottom-right, non-blocking (max 4, de-duplicated); {action} tokens → key labels
G.UI.areaCard(regionId, big)             // big = first visit (centered, ~4 s) else small top-left (~2.6 s); area/boss cards are hidden and wait while a hideHud screen is open
G.UI.bossCard(bossId)                    // lower third; G.Text.bosses[id] = { name, sub }
G.UI.prompt(x, y, text)                  // world-space (room px: x = center, y = bottom of label); call every step
G.UI.playGameOver(info, onDone)          // hardcore death: a candle gutters out on black, "Your flame is spent." / "The light does not return.", region · time · completion; ~11.5 s or confirm/back/pause after 4.4 s → onDone (engine: back to the title). info = {slot, room, regionId, playTime, completion}
G.UI.modeLabel(mode)                     // 'easy'|'standard'|'hardcore' → "Easy"/"Standard"/"Hardcore" (ui.modeEasy/...)
G.UI.playEnding(endingId, onDone)        // 'undying' | 'gutterlight' → title → illustrated pages → credits → The End (stops ambience; skip = Back/Pause pressed twice; "The End" waits for the ending track to resolve when audible, confirm moves on)
```

Notes for callers
- Every `onDone` / `onDone`-like callback runs exactly once, after the screen's fade-out, and errors inside it
  are caught and reported (`G.reportError`), never thrown into the caller.
- **Input routing.** Screens read input through `UI.pressed / pressedAny / nav`, which call
  `G.input.consume(action)`, so a press that closes a dialogue does not also make the Wickling jump. When the
  last blocking screen closes, `G.input.consumeAll()` is called for the same reason. A freshly opened screen
  is not "active" until the step after it opened (the press that opened it can't also act inside it).
  `UI.pressedBack(shared = ['attack'])` is a 'cancel' press that was not also one of `shared` (keyboard X is
  cancel + attack, pad B is cancel + spell); screens where attack/spell mean something use it instead of 'cancel'.
  `UI.hudCover()` = max alpha of open hideHud screens (0..1).
- `UI.dialogue` is used by NPC code (see docs/api/text.md §NPCs); the shop opens from the NPC's `onDone`.
- `G.UI.prompt` text is shown with an up-arrow glyph above the interactable; it fades in when first called and
  fades out ~0.15 s after you stop calling it. Hidden while a blocking screen is open.
- `G.UI.openTitle()` removes every other screen and overlay. If the engine starts play by itself while the
  title is open (e.g. `G.game.continueGame` from a test), the title dismisses itself.
- HUD: drawn automatically while `G.game.mode` is `play | transition | dead` and nothing hides it. Screens with
  `hideHud: true` (map, inventory, shops, dialogue, cards, intro, ending, spark memory) hide it.
  Cutscenes: `G.UI.hideHud('cutscene')` / `G.UI.showHud('cutscene')` (stackable by reason).

### Screens in detail
| Screen (name on the stack) | Controls | Behaviour |
|---|---|---|
| `title` | any key → menu; ↑↓ + confirm; → / ← in slots focuses Erase | gate calls `G.Audio.init()` + `G.Save.applySettings()`; music `title`; Continue (only if a save exists) / New Game / Options / Controls; slots show region (from the save's sconce/last room; falls back to the room-id prefix), play time, completion %, candles, cinders, "Journey Complete"; New Game on an occupied slot and Erase both ask to confirm. **Difficulty**: every save card shows its mode after the region name (Easy gold / Standard pale blue / Hardcore red; pre-mode saves read Easy). A **snuffed** (broken hardcore) run keeps region (where it died), time and completion, shows a cracked medallion and a snuffed candle with "Snuffed" in place of the health candles; Continue skips/denies it (it stays selectable so it can be erased). **New Game → slot → mode chooser** (view `modes`, `modeSel`, default Standard): Easy "Attacks are clearly marked - every strike shows where it will land." / Standard "The intended experience. Read your foes." / Hardcore "Standard, but death is final - the save is lost." (Hardcore asks `confirm_hardcore`); Back returns to the slots; an occupied slot is only erased when the new journey begins; → `G.game.newGame(slot, mode)` |
| `pause` | ↑↓ + confirm; pause/cancel = resume | Resume, Options, Controls, Quit to Title (confirm → `G.game.quitToTitle()`); under the title: region name and the run's difficulty (small caps, read-only — no mode switching mid-run; Hardcore in red) |
| `gameover` | confirm/attack/jump/back/pause after 4.4 s | hardcore only (`G.UI.playGameOver`); hides the HUD; see §1 |
| `options` | ↑↓, ←→ adjust | Master/Music/Sound/Ambience volume (10 steps), Screen Shake, Show Control Hints; written to `G.settings` and persisted immediately with `G.Save.saveSettings()` (which applies volumes to `G.Audio`) |
| `controls` | ↑↓ rows, ←→ columns, confirm = rebind the cell, Backspace/Delete (pad Y) = clear, cancel/pause = back | **Rebinding table** (pause > Controls and title > Controls): rows = the 12 gameplay actions (`G.input.GAME_ACTIONS`, names `UI.actionName(a)`), columns Primary / Secondary (keyboard or mouse) / Gamepad; Dash's extra defaults (K, RT) drawn small and dim after its cells. Confirm on a cell → capture (`G.input.beginCapture`): the cell pulses 'Press...' and the message line reads `ui.capturePromptKey`/`KeyPad`/`Pad`/`PadKey` (column x last device); the next key / mouse button / pad button or stick push binds it (`setBinding`); Esc cancels, Backspace/Delete clears, 10 s without input cancels; a pad input on a keyboard column (or the reverse) is refused with a note and the capture continues. Notes (3 s, gold; refusals red): moved from another action (`ui.bindMoved`), swapped (`ui.bindSwapped`), last binding refused (`ui.bindLast`), reserved (`ui.bindReserved`; Enter is reserved too), system key (`ui.bindOsKey`), Pause left without a pad button (`ui.bindLastPad`), Ctrl bound with W/T/N (`ui.bindCtrlWarn`). Below: Reset to Defaults (asks `confirm_reset_controls`, then `ui.controlsReset`) and Back. Otherwise the message line rotates `ui.controlTips` (key caps follow the bindings); a dim line states the fallbacks (`ui.controlsFallbackKey` or `ui.controlsFallbackPad` by last device). Hints: Rebind / Clear (Del or Y) / Back. Bindings persist at once (`G.settings.bindings`). |
| `map` | arrows/stick pan, jump/confirm zoom in (cycles), dash zoom out, attack/spell re-center (so keyboard X / pad B re-center, not close), map/pause/Backspace/Esc close (all through the current bindings; the arrows/D-pad always pan as a menu fallback) | rooms of `G.World` (dev rooms excluded): visited = terrain silhouette in region color; charted-but-unvisited = faint; current room framed; blue-flame player marker at the real position; sconce, Lanternway (lit/unlit), merchant (Pell/Quill/Bramm), traveler (other NPCs), seal door icons in visited rooms; Gutterwisp marker; with `waymoth` equipped, uncollected pickups/sparks in visited/charted rooms get a moth sigil; region names at each region's centroid; opens centered on the player; the legend lists only the icon kinds present on this map (`UI.mapLegendKinds(screen)`: e.g. no Seal Door entry before the door's room is visited, no Unclaimed Relic without `waymoth`) |
| `inventory` | arrows (spatial), confirm equip/unequip, inventory/cancel close | no spoilers (§1.1): owned abilities only (rows of 3, centered; no section while none), health as a row of small candles + cinders (no Ember or damage numbers), Brand current name only, held relic types only (Heartwax: half heart while a shard waits for its pair, empty outline otherwise, no count; Ember Urns / Kiln Glass held / Chandler's Sparks: plain counts; Warden Seals: only the obtained seals' icons), owned sigils in the order found (no empty cells; no Sigil pane at all — header, notch meter, Equipped row, Sconce hint — until the first Sigil), notch meter = pips only (filled = in use); no completion % (save-slot cards only); cells exist only for owned things, so every description is a real one; equipping only with `atSconce:true` (each change refills health to the new max and saves at once; else "Rest at a Sconce to change Sigils"; over-capacity → "Not enough Notches") via `G.game.equip/unequip` |
| `dialogue` | confirm/attack/jump: finish page, then next | speaker name, typewriter (50 cps, `dialogue_blip` every 3 chars), page dots, `{token}` key caps; stage directions (pages starting with `(`) in italics |
| `lore` | confirm/attack/jump next page | stone slab, engraved title, page dots |
| `sparkMemory` | confirm/attack/jump next | drifting embers, italic text, slow fades, "Chandler's Spark" header (no count) |
| `shop` | ↑↓, confirm buy (asks to confirm), cancel leave | Pell: `G.Items.shops.pell` minus sold (`flags['item:<id>']`), `G.game.giveItem` (shows the item card); Quill: charts for uncharted regions the player knows (entered — `flags['region:<id>']` — or any room visited; unknown regions are not listed or counted; with none to show but more to come Quill says `shops.quill.unwalked` and the list reads `ui.noChartsYet`) → `progress.charts[region] = true`; Bramm: next Brand level (current → next Brand name with a dim → bright Brand icon, no damage numbers; cinders + kiln glass); `deny` sfx + "poor" line when short |
| `lanternway` | ↑↓ (skips unlit), confirm travel, cancel | lit posts only, by region name (unlit posts are not listed at all); current marked; `sel` indexes the full post list (LANTERNS order) |
| `abilityGet` / `itemGet` | confirm (after a short guard) | full-screen dim + rays / medium card; stingers via `G.Audio.stinger` when available |
| `intro` / `ending` | confirm advances, cancel/pause skips | see §1; endings end with credits (G.Text.credits) and "The End"; both also run unattended |

### 1.1 No spoilers (inventory, map, cards, Lanternway)
Like Hollow Knight, menus reveal only what the player has found, in every mode:
- Inventory: no greyed placeholders, no `???`, no empty sockets/cells, no "x / total" anywhere (the notch meter is
  pips only); relic types appear once at least one is held (Kiln Glass disappears again when all of it is spent at
  Bramm); completion % lives only on the save-slot cards. `UI.inventoryOwned(progress)` →
  `{abilities, relics, sigils, seals}` is what the screen lays out.
- Item cards: counts without totals (`Ember Urns: 2`, `Notches: 4`, `Chandler's Sparks: 3`, `Warden Seals: 1`;
  an odd Heartwax shard says "Half of a new candle…", an even one "The shards fuse into a new candle.").
- Map: markers only in visited rooms (the Waymoth moths are the sigil's explicit effect and unchanged); legend
  only for kinds on the map.
- Shops: Quill offers a region's chart only once the region is known (entered, or a room of it visited), like
  Iselda; a partly explored region's chart is still worth buying ("Buy what I've walked, then walk what I haven't").
- Inventory: the whole Sigil pane (header, notch meter, Equipped row, "Rest at a Sconce" hint) appears only once
  the first Sigil is owned (`layout.hasSigils`), like Hollow Knight's Charms pane.
- Not changed on purpose: Pell and Bramm list their own stock, and the Seal Door's own
  "Warden Seals: n / 3" prompt (`src/entities/interactables.js`) counts the door's three visible sockets.
- `tools/ui_selftest.js` audits this: `T.capture()` records every string (fillText/strokeText/`UI.spacedText`) and
  icon drawn in one render; `T.invAudit()` renders the inventory with each cell selected.

## 2. Presentation kit (for any module drawing text on screen)

```js
const UI = G.UI, C = UI.C;          // palette: cream creamHi creamDim dim faint gold goldDim blue blueHi red …
UI.FONT_STACK                        // "'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif"
UI.font(size, style?)                // cached CSS font string; style '' | 'italic' | 'bold'
UI.text('ui.resume', 'Resume')       // G.Text lookup by dotted path with fallback
UI.textObj('credits')                // object/array lookup or null
UI.fmt('Chart: {region}', { region })
UI.tokens('Press {jump}')            // → 'Press Z' (G.input.label, follows the last used device)
UI.keyLabel('dash')
UI.regionName('guttered')            // G.Text.areas[id].name, else region.name
UI.regionOfRoom('gw_04')             // from G.World, else from the id prefix (TECH_SPEC §19)
UI.wrap(ctx, text, maxW)             // lines[], honors '\n', cached (font must be set)
UI.wrapBalanced(ctx, text, maxW)     // same line count, even lengths (centered prose)
UI.layoutRich(ctx, text, maxW, size) // {lines:[{w, parts}]}: {action} tokens become key caps
UI.drawRich(ctx, layout, x, y, lineH, align, color)
UI.paragraph(ctx, text, x, y, maxW, lineH, align)
UI.spacedText(ctx, str, x, y, spacing, align) / UI.spacedWidth(ctx, str, spacing)   // letter-spaced titles
UI.keycap(ctx, label, cx, cy, h, opts)          // restores font/align/baseline
UI.hints(ctx, [['confirm', 'Buy'], ['cancel', 'Leave']], x, y, 'right', { alpha, size, force })
                                     // footer "[Enter] Buy  [Esc] Leave"; hidden when G.settings.hints === false
UI.flourish(ctx, cx, y, halfWidth, { color, alpha, size })   // ornamental divider
UI.rule(ctx, cx, y, halfWidth, color, alpha)                  // thin tapered rule
UI.corner(ctx, x, y, size, sx, sy, color, alpha)              // filigree corner (sx/sy = ±1 arm directions)
UI.panel(ctx, x, y, w, h, { fill, border, radius, corners, cornerSize, cornerAlpha, alpha })
UI.veil(ctx, alpha, color?) / UI.vignette(ctx, alpha)
UI.drawMenu(ctx, [{ label, disabled }], sel, cx, y, { size, gap })   // centered menu with flame pips
UI.glow(ctx, x, y, r, color, alpha)  // G.Art.glow when present (cached sprite), else a radial gradient
UI.flame(ctx, x, y, size, kind, t, seed)   // G.Art.flame when present, else a built-in teardrop flame
UI.icons.ability(ctx, id, cx, cy, size, { dim, t }) / UI.icons.item(ctx, kind, cx, cy, size, opts)
UI.icons.sigil(ctx, id, cx, cy, size, opts)  // procedurally drawn sigil medallions
UI.drawCinderIcon(ctx, x, y, size)
UI.notchCost(ctx, x, y, n, align)    // a sigil's notch cost as "Notches" + diamond pips (no digit); inventory.js
UI.Particles                         // tiny pooled particle list: new UI.Particles(max); spawn({…}); update(dt); draw(ctx, a)
UI.ease.{inOutSine, outCubic, outBack}, UI.envelope(t, dur, fadeIn, fadeOut) → 0..1, UI.clamp01
UI.measureCtx()                      // offscreen ctx for measuring text outside draw()
UI.sfx(name, opts) / UI.stinger(name) / UI.music(id)   // guarded audio helpers
```

### Writing a new screen
```js
G.UI.push({
  name: 'myscreen', blocking: true, fadeIn: 0.22, fadeOut: 0.18, hideHud: true,
  onClose() { /* after fade-out, once */ },
  open() { /* right after push */ },
  update(dt, active) {
    if (!active) return;                               // only the top input screen gets input
    const dy = G.UI.navY();                            // ↑↓ with auto-repeat, consumed
    if (G.UI.pressedAny(G.UI.CONFIRM)) G.UI.sfx('menu_select');
    if (G.UI.pressedAny(G.UI.BACK)) { G.UI.sfx('menu_back'); G.UI.close(this); }
  },
  draw(ctx, alpha) { G.UI.veil(ctx, 0.7); /* globalAlpha is already set to alpha */ },
});
G.UI.confirm({ text: 'Really?', yes: 'Yes', no: 'No', onYes() {}, onNo() {} });   // modal Yes/No (No preselected)
```
Stack helpers: `UI.close(s, cb)`, `UI.dismiss(s)` (remove `s` and everything above it now, no callbacks),
`UI.closeAll(runCallbacks)`, `UI.top()`, `UI.find(name)`, `UI.isOpen(name)`, `UI.screenNames()`,
`UI.addLayer({name, z, update, draw})` (always-on overlays), `UI.clearOverlays()` (area/boss cards, toasts,
prompts). Test helpers: `UI.hudSnap()` (HUD jumps to current values), `UI.overlayState()`, `UI.shopRows(id)`,
`UI.clearMapCache()`.

## 3. Data the UI reads
- `G.Text`: `ui.*`, `areas`, `abilities`, `items`, `sigils`, `bosses`, `lore`, `sparks`, `intro`, `endings`
  (`{title, pages[], scenes[]}`; scene ids pick the procedural illustration: crown cage reach flame lake gate
  dark sparks hands shatter ash), `credits`, `shops.{pell,quill,bramm}.{greet, bought, poor, empty, maxed}`.
  Every literal `ui.*` key the UI uses exists in text.js (`ui.damage` was removed: no damage numbers; including `ui.zoom`, `ui.adjust`,
  `ui.actions.*`, `ui.mapLegend.*`); the built-in English fallbacks remain as a safety net.
- `G.Items`: `sigils[id].cost`, `shops.*`, `brandDamage`, `totals`, `order` (optional display order).
- `G.game.progress` (§11.1), `G.game.maxHealth/emberMax/completion/isEquipped/equip/unequip/notchesUsed`,
  `G.World.listRooms/getRoom/roomInfo/entitySpecsOf/findEntitySpecs`, `G.Save.summary/load/exists/remove`,
  `G.settings`, `G.input`, `G.Art.flame/glow/mapColor` (all feature-detected).
