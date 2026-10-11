# Text & Items — `G.Text`, `G.Items` (module: text)

Files: `src/data/text.js` (all player-facing words), `src/data/items.js` (sigil costs, shop stock,
Brand damage, totals). Both are pure data, Node-loadable (no DOM), loaded after the entity files in
`index.html`. Schema = TECH_SPEC §15 plus the documented, backward-compatible extensions below.
Verification: `node tools/text_check.js` (add `--transcript` to print simulated NPC
conversations over a playthrough; part of `node tools/test_all.js`). The original copy and its
mutation test remain in `test-output/text/` (`node test-output/text/mutate.js` proves the checker
catches injected defects).

Always read text at runtime (`G.Text.lore[id]`, …), never copy strings into code. Fallbacks such
as `(G.Text && G.Text.ui && G.Text.ui.resume) || 'Resume'` are fine for robustness.

---

## 1. Conventions

**Input tokens** (TECH_SPEC §15): `{jump} {attack} {dash} {spell} {up} {down} {interact} {map} {inventory}`
(`{left} {right} {pause}` are also accepted). They appear in `lore_sh_1..3`, `abilities.*.how`, one Quill
line, and `ui.controlTips`. The UI replaces them with `G.input.label(action)`, which follows the player's
current bindings (controls are rebindable) and last-used device. Use `{interact}` (not `{up}`) for
rest/read/talk/travel: Up and Interact are separate, separately rebindable actions.

**Format placeholders** (only in `ui.*`): `{n} {used} {total} {price} {glass} {region}`, and `{action} {input} {other}` in the rebinding notes. Fill them
with the helper, which leaves anything it has no value for (e.g. input tokens) untouched:

```js
G.Text.fmt(G.Text.ui.slot, { n: 2 });                       // 'Slot 2'
G.Text.fmt(G.Text.ui.notchesUsed, { used: 3, total: 5 });   // 'Notches: 3 / 5'
G.Text.fmt(G.Text.ui.chartOf, { region: G.Text.areas.nave.name }); // 'Chart: The Drowned Nave'
```
`G.Text.fmt` is non-enumerable, so iterating `G.Text` only yields data.

**Pages**: every string in a `lines`/`pages` array is one page (one dialogue box). Pages are at most
134 characters before token expansion. Measured in Chromium at 26px Georgia in an 860px-wide text
area, every prose page wraps to 1-2 lines; only the verse pages (intro) reach 3. Size dialogue boxes
for 3 lines and you are safe. `'\n'` appears only in verse (intro, two songs) where the line break
matters; honor it.
Pages starting with `(` are stage directions or descriptions of the object (e.g. `"(Scratched beneath,
smaller:) ..."`). Showing them in a dimmer or italic style looks good but is optional.

**No soul/damage numbers** (user request; Hollow Knight never shows nail damage or soul amounts): no
string may state an Ember amount, a damage figure, a health number, a percentage, a `+N`/`-N` modifier, a
multiplier or a `5 -> 9` comparison. Abilities, sigils and upgrades say what they do in words ("Your spells
burn far hotter.", "Your Ember Well holds more.", "spending some of your Ember"); in `abilities`, `items`,
`sigils` and `shops` no digit appears at all. The exact values live in `G.Items` / DESIGN §3.5 only. The UI
follows suit: health is drawn as candles, the Ember Well as a vessel, sigil notch costs as diamond pips, the
Brand by name only. Cinders (currency), prices, item counts and lore dates are not stat numbers and stay.
`tools/text_check.js` enforces this permanently (`numericStat()`; its `NUMERIC_ALLOW` map is the documented
allowlist for a legitimate non-stat number a pattern would catch, currently empty) and also scans `src/ui/*.js`
for code that would draw Brand damage or numeric Ember/health.

**Characters**: ASCII plus the em dash `—` (U+2014) only; files are UTF-8 (index.html declares
`<meta charset="utf-8">`).

---

## 2. `G.Text` reference

| Key | Shape | Notes |
|---|---|---|
| `intro` | `string[5]` | Opening verse for `G.UI.playIntro` |
| `areas[regionId]` | `{name, sub}` | All 10 regions (+ `test` for the dev test rooms). Area cards, map header, save slots, Lanternway menu |
| `npcs[key]` | `{name, prompt, shop?, talks[]}` | See §3 |
| `lore[id]` | `{title, lines[]}` | 38 tablets, see §4 |
| `sparks[id]` | `{title, lines[]}` | 6 Chandler memories. `title` is an extension (e.g. `'The Finding'`) |
| `abilities[id]` | `{name, desc, how}` | `bolt dash grip oilcloak plunge wings`; `how` contains input tokens |
| `items[id]` | `{name, desc}` | `heartwax urn kiln_glass notch spark seal_bell seal_kiln seal_wing chart` |
| `sigils[id]` | `{name, desc}` | All 14. `desc` = flavor + the effect in plain words (no numbers, see below). Same key order as `G.Items.sigils` |
| `bosses[id]` | `{name, sub, intro?, phase2?, defeat?}` | See §5 |
| `endings[id]` | `{title, pages[8], scenes[8]}` | `undying`, `gutterlight`, see §6 |
| `credits` | `string[]` | One line per entry; `''` = blank spacer line; first entry is the title |
| `shops[shopId]` | `{greet, bought, poor, empty, farewell, …}` | See §7 |
| `ui` | object | Menu and system strings, see §8 |

### Item extensions
- `items.heartwax.whole`: shown when a second shard completes a new health candle:
  `'The shards fuse into a new candle. Your health grows by one.'`
- `items.cinders {name, desc}`: the currency, if a card or tooltip needs it.
- `items.brand {name, desc, levels[4]}`: `levels[progress.brandLevel]` = `{name, desc}` of the
  current Brand (`Plain Brand`, `Tempered Brand`, `Glass-Edged Brand`, `Heartforged Brand`). Use it in
  the inventory and in Bramm's shop.

Item-get cards: `'heartwax'` → `items.heartwax`, `'seal:bell'` → `items.seal_bell`,
`'spark:<id>'` → `items.spark` (then `G.UI.sparkMemory(id)` shows `sparks[id]`),
`'sigil:<id>'` → `sigils[id]`, charts → `items.chart` + `areas[region].name`.

---

## 3. NPCs: `G.Text.npcs`

Keys: `thrum pell quill bramm` (Lastlight), `wren_1 wren_2 wren_3 wren_4`, `sable_1 sable_2`.
The npc entity `{type:'npc', npc:'wren', stage:2}` maps to the key `wren_2`.

```js
npcs.thrum = { name: 'Old Thrum', prompt: 'Listen', talks: [
  { id: 'meet',  when: '!talked:thrum:meet', once: true, lines: [...] },
  { id: 'notch', when: 'seals>=3 & !flag:thrum_notch', once: true, give: 'notch', setFlag: 'thrum_notch', lines: [...] },
  ...
  { id: 'idle', lines: [...] }            // last entry: unconditional, repeatable fallback
] };
```

### Intended selection semantics (please implement exactly this)
```js
function pickTalk(key) {                      // key = 'thrum' | 'wren_2' | ...
  for (const t of G.Text.npcs[key].talks) {
    if (t.when && !G.game.evalCondition(t.when)) continue;
    if (t.once && G.game.getFlag('talked:' + key + ':' + t.id)) continue;
    return t;                                 // FIRST match wins: the array order is the priority
  }
}
// When that conversation closes (G.UI.dialogue onDone):
//   G.game.setFlag('talked:' + key + ':' + t.id);
//   if (t.setFlag) G.game.setFlag(t.setFlag);
//   if (t.give) G.game.giveItem(t.give);     // shows the item card
//   if (npc.shop) G.UI.openShop(npc.shop);   // pell / quill / bramm: the shop opens after every talk
```
- **One talk entry per interaction.** Entries are ordered so that the most important pending
  one-shot entry is said first. Most reactions are bounded to a window of progress
  (e.g. `ability:dash & !ability:grip`) so they never come up after they've gone stale.
- **Talk ids are unique across all stages of an NPC** (`w1_meet`, `w2_meet`, …; `s1_*`, `s2_*`),
  so the flag works whether you key it as `talked:wren_2:<id>` or `talked:wren:<id>`. The text itself
  only uses `talked:` for `thrum`, `pell`, `quill` and `bramm`, plus Wren's own stage keys
  (`talked:wren_2:…` / `talked:wren_3:…`, to tell her first-meeting variants apart).
- `prompt` (extension): suggested `promptText` for the NPC (`'Listen'` or `'Talk'`).
- Every NPC's last entry has no `when`/`once`/`give`, so there is always something to say.

### Flags set by the text (usable by anyone in conditions)
| Flag | Set when |
|---|---|
| `thrum_notch` | Thrum hands over the Wax Notch (holding all 3 seals) |
| `wren_met_1` / `wren_met_2` / `wren_met_3` | You first speak with Wren in the Ways / Nave / Mothwood |
| `wren_gift` | Wren (stage 4, Rime) gives you `sigil:long_brand` |
| `talked:<key>:<id>` | Any talk entry is shown (set by the NPC module) |

The text uses only the condition terms `ability: boss: flag: seals>= sparks>= talked:` and
`sigil:<id>` (owned sigil; Pell's `waymoth` pitch stops once it is bought). It never
uses `region:`, `visited:` or `item:`, so their exact meaning cannot affect dialogue.

### Placement & visibility suggestions (for world / interact builders)
| Key | Where | Suggested visibility (if npc entities support a `requires` condition) |
|---|---|---|
| `thrum` | Lastlight, by the Last Brazier / sconce | always |
| `pell`, `quill`, `bramm` | Lastlight | always |
| `wren_1` | Guttered Ways, a quiet side room | `!flag:wren_met_2` (she moves on once met in the Nave) |
| `wren_2` | Drowned Nave, sheltered from the rain | `!flag:wren_met_3` |
| `wren_3` | Mothwood | `!flag:wren_gift` |
| `wren_4` | Rime, beside the frozen lake, sitting | always (her fallback is near-silence) |
| `sable_1` | High ledge in the Guttered Ways (glimpse) | `!boss:sable1` (her lines also handle after) |
| `sable_2` | Sanctum gate, standing aside | `boss:sable2` |

---

## 4. Lore tablets: `G.Text.lore`

`{ title, lines[] }`. The truth surfaces gradually: hints and contradictions in the upper regions,
how the cage works in the Nave and Chandlery, and the full picture in the Rime and the Sanctum.
Some tablets name their spot ("Carved Above the Seal Door"), so please place them as suggested:

| Id | Title | Suggested spot |
|---|---|---|
| `lore_sh_1` | A Carving, Deep and Careful | First screen of `sh_01`, before the first ledge and thin platform (teaches jump and drop-through) |
| `lore_sh_2` | A Second Carving | Before the first enemy and thorns/spikes (teaches strike, up/down strikes, pogo) |
| `lore_sh_3` | A Third Carving, Half Buried | Beside the first sconce (teaches Kindle, rest, map, inventory) |
| `lore_ll_1` | The Founding Stone of Lastlight | The founding stone at the village gate (`ll_01`, col 34) |
| `lore_ll_2` | Plaque of the Wickwrights' Guild | The smith-guild plaque in Wickwright's Row (`ll_03`, col 30); warns those going down the Well |
| `lore_gw_1` | Royal Decree, Gilded | A main hall early in the Ways |
| `lore_gw_2` | A Prayer, Partly Chiseled Away | A shrine niche or dead-sconce row |
| `lore_gw_3` | Scratched Low on a Wall, in a Small Hand | Side passage / small nook |
| `lore_gw_4` | Oath of the Old Guard | Just before the Effigy's arena |
| `lore_gw_5` | Warning, Daubed in Soot | Near a group of Snuffed |
| `lore_mb_1` | Gardener's Rule, Carved on a Trellis | Near the garden entrance |
| `lore_mb_2` | Words Pressed into a Wax Petal | A secluded flower bed |
| `lore_mb_3` | Herald's Notice | A gate or entrance arch |
| `lore_mb_4` | Scratched in Black Wax | Near Sable's first arena or the dash shrine |
| `lore_sf_1` | Stokers' Work-Song, Painted on a Pipe | A vertical shaft |
| `lore_sf_2` | Flue-Master's Log | A stokers' room |
| `lore_sf_3` | Notice to All Stokers | Before the Soot Matron's arena |
| `lore_sf_4` | Dedication Stone, Soot-Black | Upper Flue, near the lever to Lastlight |
| `lore_dn_1` | Hymn of the Nave, Worn by Rain | A chapel |
| `lore_dn_2` | The Abbot's Sermon, Carved on a Pulpit | The great hall |
| `lore_dn_3` | Scratched Beneath a Pew | A side room |
| `lore_dn_4` | Oath of the Three Wardens | Before the Abbot's arena |
| `lore_dn_5` | Chronicle of the Lighting | Deep in the Nave (archive) |
| `lore_dn_6` | Cracked Stone in the Floor | Beside the cracked floor (`D`) down to the Rime |
| `lore_ch_1` | Pouring Ledger | Along a pouring line |
| `lore_ch_2` | Royal Work Order | A foreman's office |
| `lore_ch_3` | Entry in a Smaller Ledger | A side room |
| `lore_ch_4` | Words Scored into a Cold Vat | Near the Kiln Mother's arena |
| `lore_mw_1` | Moth-Script, Woven in Silk | Silk curtains / reeds |
| `lore_mw_2` | The Duchess's Vow, Embroidered | Before Vespertine's arena |
| `lore_mw_3` | A Courtier's Letter, Never Sent | Anywhere quiet |
| `lore_mw_4` | Carved on a Cocoon-Stone | Among cocoons |
| `lore_ri_1` | Inscription Beneath the Frost | On a frozen river or the frozen lake |
| `lore_ri_2` | Pilgrims' Marker, Frozen Fast | Among frozen waxen statues |
| `lore_ri_3` | Carved Above the Seal Door | At the Seal Door |
| `lore_ri_4` | Scratched in Black Wax, on the Ice | Near Sable's second arena (ri_04, the Frozen Lake; `lore_ri_3` is at the Seal Door in ri_08) |
| `lore_hs_1` | In the Queen's Own Hand | Sanctum antechamber |
| `lore_hs_2` | Dedication of the Everlantern | Before the final arena |

`lore_sh_1..3` are written in the same "vast, careful hand" as part of `lore_hs_2`. The
carvings are the Chandler's, which the player only realizes at the end.

---

## 5. Bosses: `G.Text.bosses`

| Id | name | sub | intro | phase2 | defeat |
|---|---|---|---|---|---|
| `effigy` | The Effigy | Husk of the Old Guard | – | – | – |
| `sable1` | Sable | the Unlit | 2 | – | 2 |
| `matron` | The Soot Matron | Brood-Mother of the Flue | – | – | – |
| `tallowmere` | Abbot Tallowmere | Warden of the Bell | 2 | – | 2 |
| `kilnmother` | The Kiln Mother | Warden of the Forge | 2 | – | 2 |
| `vespertine` | Duchess Vespertine | Warden of the Wing | 2 | – | 2 |
| `sable2` | Sable | Last Guard of the Heart | 2 | – | – (her yield is `npcs.sable_2`) |
| `lucerne` | Lucerne | the Everlantern | 3 | 2 | 2 |

- `intro`: short pages spoken as the fight begins (e.g. `G.UI.dialogue({name, lines: intro})`
  before the title card, or as non-blocking toasts). Effigy and Matron do not speak.
- `phase2` (Lucerne): when she fuses with the cage.
- `defeat` (extension): last words when beaten, before the reward or ending.
- DESIGN gives Matron no subtitle, so she has `'Brood-Mother of the Flue'`.

---

## 6. Endings: `G.Text.endings`

`undying` ("The Undying Light", fewer than 6 sparks) and `gutterlight` ("Gutterlight", all 6).
Each has 8 `pages`. The last pages are the DESIGN lines. `scenes` (extension) has one illustration hint
per page, from this vocabulary:
`crown` (Lucerne's candle crown), `cage` (the Everlantern), `reach` (the Wickling reaching up),
`flame` (a single flame), `lake` (frozen lake, small pale flame), `gate` (the Sanctum gate, Sable),
`dark` (near-black page), `sparks` (rising sparks), `hands` (many vast hands), `shatter` (breaking
glass and gold), `ash` (warm ash, new wax). The credits roll afterwards; it includes the line
`'Made entirely in code — every image, note and sound generated at runtime'`.

---

## 7. Shops: `G.Text.shops` (+ `G.Items.shops`)

```js
shops.pell  = { greet, bought, poor, empty, farewell }
shops.quill = { greet, bought, poor, empty, unwalked, farewell }   // unwalked: has charts, but none of a region the player has entered
shops.bramm = { greet, bought, poor, empty, farewell,
                noGlass,              // can afford the cinders but lacks Kiln Glass
                maxed,                // Brand already at level 3 (same moment as `empty`)
                offer:   [l1, l2, l3],   // pitch for the next upgrade: offer[brandLevel]
                upgrade: [l1, l2, l3] }  // said after upgrading: upgrade[newLevel - 1]
```
Stock and prices come from `G.Items.shops` (see below). Names: `items[...]`, `sigils[...]`,
`items.chart.name` + `areas[region].name` (or `G.Text.fmt(ui.chartOf, {region})`),
`items.brand.levels[level].name` for Bramm.

---

## 8. UI strings: `G.Text.ui`

| Group | Keys |
|---|---|
| Title & common | `gameTitle tagline pressAny loading start newGame continue options controls credits back confirm cancel close next yes no` |
| Save slots | `chooseSlot slot`(`{n}`) `slotEmpty slotNew slotComplete slotUnreadable erase eraseConfirm playTime completion slotSnuffed`(a broken Hardcore run) |
| Trials (modes) | `chooseMode modeEasy modeStandard modeHardcore modeEasyDesc modeStandardDesc modeHardcoreDesc`(title chooser; looked up through a table in title.js) `hardcoreConfirm hardcoreBegin`(Hardcore confirmation) `gameOver gameOverSub`(Hardcore game-over screen, ending.js) |
| Pause & options | `paused resume quitToTitle quitConfirm masterVolume musicVolume sfxVolume ambienceVolume screenShake controlHints fullscreen on off adjust`; `settings.{masterVolume musicVolume sfxVolume ambienceVolume shake hints}` = labels keyed exactly like `G.settings` (so `G.Text.ui.settings[key]` labels any setting) |
| Controls screen | `keyboard gamepad`, `actions.{move left right up aimUp down jump attack dash spell interact map inventory pause confirm cancel}` (`aimUp` = the Up row of the rebinding table, Interact has its own row), `controlTips[]` (input tokens) |
| Rebinding | `bindPrimary bindSecondary bindPress rebind clear resetControls resetControlsConfirm controlsReset controlsFallbackKey controlsFallbackPad bindCtrlWarn`; `capturePromptKey capturePromptKeyPad capturePromptPad capturePromptPadKey`(`{action}`) `bindLastPad`(`{action}`) `bindOsKey`(`{input}`) `bindMoved`(`{input} {action}`) `bindSwapped`(`{input} {action} {other}`) `bindLast`(`{action}`) `bindReserved`(`{input}`) `bindRefused bindNeedPad bindNeedKey` |
| Prompts | `prompts.{rest read talk listen travel take examine light open shop}` |
| Toasts & world | `saved saveFailed saveUnavailable saveConflict`(game.saveNow notices; saveConflict: another window wrote the slot) `sconceLit rested lanternwayLit gateOpened gateLocked sealDoorLocked sealDoorOpen sealDoorCount`(`{n}`) `wispReclaimed wispHint`(first death) `noEmber` |
| Lanternway | `lanternway lanternwayChoose lanternwayHere lanternwayUnlit lanternwayDanger` (post names: `areas[id].name`) |
| Map | `map mapUncharted mapEmpty mapPan zoom zoomOut recenter mapLegend.{you sconce lanternway shop npc relic wisp door}` |
| Inventory | `inventory abilities relics sigils notches notchesUsed`(`{used} {total}`) `restToEquip equip unequip equipped notEnoughNotches health ember cinders brand heartShards urns kilnGlass sparks seals sealsHeld`(`{n}`, item card) `heartwaxHalf heartwaxNone`(Heartwax relic line; no totals shown) `unknown notFound` (`damage` was removed: no Brand damage numbers are shown) |
| Shops | `buy sold noChartsYet`(Quill's empty list while uncharted regions are still unknown) `owned price leave priceCinders`(`{price}`) `priceGlass`(`{glass}`) `chartOf`(`{region}`) `temper` |
| Cards & ending | `acquired theEnd skip` |

Notable exact strings: `ui.restToEquip` = `'Rest at a Sconce to change Sigils'`;
`ui.sealDoorLocked` (try to open the Seal Door with < 3 seals);
`ui.gateLocked` (one-way shortcut gate seen from the wrong side).

---

## 9. `G.Items`

```js
G.Items.sigils[id]  = { cost, ...effect }    // 14, DESIGN §3.5 order and costs
//   effect fields (optional to use; mirror DESIGN §3.5 exactly):
//   swift_brand {cooldownMult:0.7}  long_brand {reachMult:1.35}  heartwax {maxHealth:1}
//   kindle_haste {kindleTimeMult:0.6}  ember_thirst {emberPerHit:6}  cinder_lure {radiusTiles:6}
//   smolder_shell {invulnMult:1.6}  flare_trail {damage:8, interval:0.25}  bright_bolt {spellMult:1.5}
//   thorned_wax {damage:12}  steadfast {}  waymoth {}  last_light {damageMult:1.75}
//   deep_kindle {heal:2, kindleTimeMult:1.65}
G.Items.shops.pell  = [ { item:'heartwax', id:'shop_pell_hw1', price:150, give:'heartwax' },
                        { item:'heartwax', id:'shop_pell_hw2', price:450, give:'heartwax' },
                        { item:'urn', id:'shop_pell_urn', price:350, give:'urn' },
                        { item:'notch', id:'shop_pell_notch', price:400, give:'notch' },
                        { item:'sigil', sigil:'cinder_lure', id:'shop_pell_cinder_lure', price:100, give:'sigil:cinder_lure' },
                        // waymoth 120, steadfast 220, smolder_shell 280, kindle_haste 480 (same shape)
                      ]
G.Items.shops.quill = [ { item:'chart', region:'guttered', id:'shop_quill_guttered', price:40 }, ... ]
                      // meltbloom 80, flue 80, nave 120, chandlery 120, mothwood 120, rime 150
G.Items.shops.bramm = [ { level:1, price:250, glass:0 }, { level:2, price:700, glass:1 }, { level:3, price:1500, glass:2 } ]
G.Items.brandDamage = [5, 9, 13, 17]          // index = progress.brandLevel
G.Items.totals = { heartwax:8, urns:2, kilnGlass:3, sparks:6, seals:3, sigils:14, notches:6, bosses:8 }
// Extensions:
G.Items.notchesStart = 3
G.Items.order = { abilities:[...6], sparks:[...6], seals:['bell','kiln','wing'], bosses:[...8] }
G.Items.sealBoss = { bell:'tallowmere', kiln:'kilnmother', wing:'vespertine' }
```
- Pell: buy → `G.game.giveItem(entry.give)`, then mark it sold with flag `item:<id>`, the same
  convention as world pickups, so `item:shop_pell_hw1` works in conditions. Show it as
  `ui.sold` afterwards. Stock is never gated.
- Quill: buy → `progress.charts[region] = true`. `id` is provided for symmetry.
- Bramm: the next upgrade is `bramm[progress.brandLevel]` (none when level is 3, so use `shops.bramm.maxed`).
  Upgrading needs `price` cinders and uses up `glass` Kiln Glass (3 in total, as in `totals.kilnGlass`).

---

## 10. Example usage

```js
// Area card
const a = G.Text.areas[regionId];            // { name: 'The Drowned Nave', sub: 'Where the Bell Still Tolls' }
// Lore tablet
G.UI.lore('lore_gw_1');                       // UI reads G.Text.lore.lore_gw_1.{title, lines}
// Boss intro, then the title card
const b = G.Text.bosses.tallowmere;
G.UI.dialogue({ name: b.name, lines: b.intro, onDone: () => G.UI.bossCard('tallowmere') });
// Ability card text
const ab = G.Text.abilities.dash;            // how: 'Press {dash} to dash, on the ground or once in the air.'
// Sigil grid
for (const id of Object.keys(G.Items.sigils)) draw(G.Text.sigils[id].name, G.Items.sigils[id].cost);
```
