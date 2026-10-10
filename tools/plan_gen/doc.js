// Writes design/world_plan.md from design/world_plan.json + the hand-written region overviews below
// + the critical-path / metrics sections printed by tools/plan_check.js (so the doc never drifts from the plan).
//   node tools/plan_gen/doc.js
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const plan = JSON.parse(fs.readFileSync(path.join(ROOT, 'design', 'world_plan.json'), 'utf8'));
const check = spawnSync('node', [path.join(ROOT, 'tools', 'plan_check.js'), '--verbose'], { encoding: 'utf8' }).stdout;

const REGIONS = [
  ['shore', 'Ashen Shore', `The tutorial strip on the grey surface. The Wickling wakes on an ash mound (sh_01) and walks east past three control carvings toward the warm windows of Lastlight. Everything here is safe and readable; the region exists to teach walking, jumping, attacking and pogo, and to plant three promises (a grip pillar, a dash ledge, a wings crown) that pay off much later.`,
    `**The Fallen Wick** (sh_03): a colossal toppled candle lying across the dunes - the first unforgettable silhouette.`,
    `Grip (sh_hw1 on the ash pillar in sh_02), dash or wings (sh_geo2 on the detached ledge in sh_04), wings (Stubborn Heartwax sigil on the candle's crown in sh_03).`,
    `sh_01: breakable cliff face hiding sh_geo1 (teaches that walls can break).`],
  ['lastlight', 'Lastlight', `The last lit village of Tallowdeep and the emotional hub: no enemies, warm windows, the Last Brazier. Quill (charts), Old Thrum and Pell (shop) and Bramm (smith) live here; ll_02 holds the home sconce and the Lanternway post. The Well in the village square drops straight into the Guttered Ways, and its return climb needs no abilities. The east road ends at the Flue shortcut gate, whose lever is on the far side.`,
    `**The Last Brazier** square with **the Well** (ll_02).`,
    `Grip (ll_geo2 on the forge chimney in ll_03). The Flue gate sf_gate1 (lever on the Flue side) is visible from ll_03 from the first visit.`,
    `ll_01: a breakable wall under the gatehouse stair hides ll_geo1.`],
  ['guttered', 'The Guttered Ways', `The crossroads beneath Lastlight: brick halls lined with dead sconces. From the Well the player finds the Ember Bolt shrine (gw_04) right before the Effigy's hall (gw_05), whose west gate opens to Meltbloom only after the Effigy falls. East, the Broken Bridge (gw_06, dash) leads to the Sootflue; down, the Descent Lip (gw_10, grip) leads to the Drowned Nave. Wren's camp (gw_09) and the Lantern Crossroads (gw_03, Lanternway) are the natural rest points. Loops: Well - Hall - Crossroads - Drip Galleries; Bolt shrine - Wickworm Tunnels - Drip Galleries - Hall - Well; Crossroads - Drip Galleries - Wren's Hollow.`,
    `**Hall of Dead Sconces** (gw_02), **Lantern Crossroads** (gw_03), **The Broken Bridge** (gw_06), **Sable's Perch** (gw_07, first glimpse of Sable).`,
    `Effigy (boss gate west), dash or wings (Broken Bridge, gw_hw1, gw_geo4), grip (Descent Lip), oilcloak (gw_geo2 cistern), plunge (spark_gw vault), wings (gw_geo3 on the Perch).`,
    `The Chandler's Alcove (gw_12) is a whole secret room behind breakable walls in the Well and in Sable's Perch, with the hidden Wax Notch and a one-way drop back into the Hall; Wren's tent hides the Ember Thirst niche (gw_09).`],
  ['meltbloom', 'Meltbloom Gardens', `Wax-flower gardens west of the Effigy. The Bloom Atrium (mb_02), a glass hall around a cathedral-tall wax flower, is the hub (Lanternway, sconce). The Thornwalk (mb_08) leads to Sable's moonlit lawn (mb_07); beyond it the Flare Dash shrine (mb_06). The Petal Bridge (mb_05) immediately puts the dash to use as the shortcut back to the Atrium, and the Root Hollows (mb_09) look down through a barred shaft at the Mothwood far below (opened later from the Mothwood side). Loops: Gate - Terraces - Atrium; Gate - Arbor - Thornwalk - (drop from Atrium); Atrium - Thornwalk - Lawn - Shrine - Petal Bridge (after the duel).`,
    `**The Bloom Atrium** (mb_02) with the giant Meltbloom; **The Moonlit Lawn** (mb_07).`,
    `Sable (arena), dash or wings (Petal Bridge), grip (mb_hw1 on the Arbor trunk), wings (mb_geo1 seed pod), oilcloak (mb_geo2 grotto), plunge (spark_mb crypt), lever mw_lv1 (shaft down to the Mothwood).`,
    `Thornwalk hedge niche (Thorned Wax sigil), Cloister pocket (mb_geo3).`],
  ['flue', 'The Sootflue', `A vertical region of chimneys east of the Broken Bridge. The Great Flue (sf_02), an 80-tile chimney crossed by one iron gantry, is the spine: down its rungs to the Soot Matron's den (sf_05), after which the Grip shrine (sf_06) opens the way down to the Ashpit and the Chandlery and, above all, up: wall-climb the Great Flue to the Chimney Tops (sf_01) and strike the lever that opens the shortcut to Lastlight. Loops: gantry - Bellows Hall - Ember Shaft - Pipeworks - shaft bottom; with grip: gantry - Soot Lofts - Ember Shaft top - Bellows Hall.`,
    `**The Great Flue** (sf_02), **The Chimney Tops** (sf_01).`,
    `Matron (arena), grip (upper Great Flue, Ember Shaft top, Ashpit chute), lever sf_lv1 (Lastlight shortcut), wings (sf_geo1 chimney stack), oilcloak (sf_geo2 cistern), plunge (sf_hw1 vault).`,
    `Bellows Hall smithy (Quickwick sigil), Ember Shaft cubby (spark_sf), Ashpit niche (sf_geo3).`],
  ['nave', 'The Drowned Nave', `The rain-soaked cathedral-city, entered by the Long Descent (grip). The Drowned Nave hall (dn_03) is the hub with the rose window, sconce and Lanternway. The Bell Tower climb (dn_04, grip challenge) leads to the Oilcloak; the Choir Loft (dn_06) to Abbot Tallowmere's belfry (dn_07). Exits fan out: the Flooded Tunnel west to the Mothwood (oilcloak), the Gallery of Saints east to the Chandlery (grip + dash), the Sunken Crypt's cracked floor down into the Rime (plunge), and the Reliquary (dn_12), where the up-only Ice Stair brings Rime travellers home. Loops: Aisle - Bell Tower - Flooded Tunnel - Nave hall; Nave hall - Choir Loft - Baptistery - Crypt.`,
    `**The Drowned Nave** (dn_03), **The Bell Tower** (dn_04), **The Great Belfry** (dn_07).`,
    `Grip (entry, Bell Tower), oilcloak (Flooded Tunnel), grip + dash (Gallery of Saints), plunge (Crypt floor, spark_dn), wings (dn_hw1 on the saint statue), Tallowmere (arena).`,
    `Crypt burial niche (White-hot Core sigil), Bell Tower niche (dn_geo3).`],
  ['chandlery', 'The Chandlery', `The pouring-forges, reachable from the Ashpit (grip) or the Gallery of Saints (grip + dash). The Great Foundry (ch_02) is the hub under a hanging knight-mold. The Crucible Climb (ch_04) demands grip and dash for the Molten Plunge, which is used at once (its brim has a cracked patch). The Kiln Mother waits in the Kiln Heart (ch_09) past the antechamber sconce. The Quench Gate's cracked floor (ch_06) is the second way into the Rime. Loops: Gallery Gate - Foundry - Mold Racks; Foundry - Quench Gate - Kiln Antechamber; Mold Racks - Cooling Cellar - Quench Gate - Foundry.`,
    `**The Great Foundry** (ch_02), **The Crucible Climb** (ch_04), **The Kiln Heart** (ch_09).`,
    `Grip + dash (Crucible Climb), plunge (Quench Gate floor, spark_ch), dash or wings (Ember Urn trough, Flare Trail ledge), wings (ch_geo3 cage perch), Kiln Mother (arena).`,
    `Slag Gate store (ch_kg), Cooling Cellar wall + dash trough (Ember Urn).`],
  ['mothwood', 'The Mothwood', `A near-black forest of wick-reeds, reached by swimming the Flooded Tunnel (oilcloak). The Wickreed Grove (mw_02) is the hub; the Smokewing shrine sits in the Chrysalis Chapel (mw_10) below it, and Smokewing alone climbs the Grove's reed-caps to the Silk Galleries and Duchess Vespertine's bower (mw_04). In the Mothward Gate (mw_03) a lever opens the grate up into Meltbloom's Root Hollows, a shortcut home through the gardens. The Silt Roots' frozen floor (mw_09) is the third plunge entry into the Rime. Loops: Grove - Cocoon Hollow - Cocoon Deep - Dustfall; Grove - Dustfall - Silt Roots - Reed Shallows; Dustfall - Chapel - Silt Roots.`,
    `**The Wickreed Grove** (mw_02), **The Duchess's Bower** (mw_04), **The Chrysalis Chapel** (mw_10).`,
    `Oilcloak (entry), wings (canopy, mw_geo2 perch), lever mw_lv1 (Meltbloom shortcut), plunge (spark_mw, Rime drop), Vespertine (arena).`,
    `Dustfall alcove (Last Light sigil), Wren's camp den (mw_kg).`],
  ['rime', 'The Rime', `The frozen depths, entered only by Molten Plunge through one of three cracked floors (Sunken Crypt, Quench Gate, Silt Roots) - all of them one-way. Every entry flows freely to the Icebound Stair (ri_05), whose up-only Ice Stair (grip) always leads home into the Nave's Reliquary. Wren's last meeting is at the Frozen Lake (ri_04); its sheer ice wall needs Smokewing. Beyond it Sable's second duel (ri_07) and the Seal Door (ri_08), where a lever opens a chute back up to the Frozen Stair. Loops: Frozen Stair - Causeway - Icebound Stair - Frozen Lake - Last Guard - Sanctum Gate - (lever chute) - Frozen Stair; Causeway - Frozen Fall - Frozen Lake - Icebound Stair.`,
    `**The Frozen Lake** (ri_04), **The Rime Causeway** (ri_02), **The Seal Door** (ri_08).`,
    `Plunge (entry), wings (ice wall to the Sanctum gate, ri_hw1 shelf), Sable 2 (arena), seals>=3 (Seal Door), lever ri_lv1 (chute shortcut).`,
    `Glacier Gallery ice cave (Deep Kindle sigil).`],
  ['sanctum', 'The Heartwick Sanctum', `Three rooms below the Seal Door: a falling shaft of light, the glass vestibule with the last sconce, and the Heartwick where Queen Lucerne guards the Everlantern. No enemies.`,
    `**The Heartwick** (hs_03) and the Everlantern.`,
    `Seals (entry through the Seal Door), grip (climb back up), Lucerne (arena).`,
    `Vestibule crystal alcove (hs_geo2).`],
];

const byRegion = {};
for (const r of plan.rooms) (byRegion[r.region] = byRegion[r.region] || []).push(r);
const fmtReq = (q) => (q.length ? q.join(' + ') : 'free');
function pathSummary(r) {
  const m = new Map();
  for (const p of r.paths) { const k = `${p.from}->${p.to}`; (m.get(k) || m.set(k, []).get(k)).push(fmtReq(p.requires)); }
  return [...m.entries()].map(([k, v]) => `${k}: ${v.join(' or ')}`).join('; ');
}
function spotSummary(r) {
  const m = new Map();
  for (const s of r.spots) {
    if (!s.requires.length) continue;
    const k = s.id; const v = `${fmtReq(s.requires)} from ${s.from}`;
    (m.get(k) || m.set(k, new Set()).get(k)).add(v);
  }
  return [...m.entries()].map(([k, v]) => `${k} (${[...v].slice(0, 3).join(' | ')})`).join('; ');
}
function section(title) {
  const lines = check.split('\n');
  const i = lines.findIndex((l) => l.startsWith(title));
  if (i < 0) return '';
  const outL = [];
  for (let k = i; k < lines.length; k++) { if (k > i && lines[k] === '') break; outL.push(lines[k]); }
  return '```\n' + outL.join('\n') + '\n```\n';
}
function sectionRange(from, to) {
  const lines = check.split('\n');
  const i = lines.findIndex((l) => l.startsWith(from)); const j = lines.findIndex((l, k) => k > i && l.startsWith(to));
  if (i < 0) return '';
  return '```\n' + lines.slice(i, j < 0 ? undefined : j).join('\n').trim() + '\n```\n';
}

let md = `# GUTTERLIGHT - World Plan

Source of truth: \`design/world_plan.json\` (TECH_SPEC section 18), generated from the region DSL in
\`tools/plan_gen/regions/*.js\` by \`node tools/plan_gen/build.js\`; validated by \`node tools/plan_check.js\`;
map: \`design/world_map.png\` (\`node tools/plan_render.js\`). This document is generated by
\`node tools/plan_gen/doc.js\` - edit the DSL / the overviews in doc.js, never this file by hand.
Builders: read \`docs/api/world_plan.md\` first.

${plan.rooms.length} rooms. Global layout (cells of 16x9 tiles; west to east, top to bottom): Ashen Shore and
Lastlight on the surface, the Sootflue's Chimney Tops east of the village; Meltbloom Gardens, the Guttered Ways and
the Sootflue in the upper band; the Mothwood, the Drowned Nave and the Chandlery in the middle band; the Rime
underneath all three; the Heartwick Sanctum at the bottom.

![world map](world_map.png)

## Macro connections

| Link | Rooms | Gate |
|---|---|---|
| Shore <-> Lastlight | sh_04 E1 / ll_01 W1 | open road |
| Lastlight -> Guttered | ll_02 S1 / gw_01 N1 (the Well) | none; the return climb uses one-way platforms (no abilities) |
| Lastlight <-> Flue | ll_03 E1 / sf_01 W1 | sf_gate1, opened by lever sf_lv1 on the Flue side (one-way shortcut) |
| Guttered <-> Meltbloom | gw_05 W1 / mb_01 E1 | the Effigy's west gate (boss:effigy) |
| Guttered <-> Flue | gw_06 E1 / sf_02 W1 | Broken Bridge: 10-tile gap (dash; wings also works) |
| Guttered <-> Nave | gw_10 S1 / dn_01 N1 | Descent Lip: 10-tile sheer wall before the pit; the Long Descent climb back needs grip |
| Flue <-> Chandlery | sf_06 (8-tile grip wall) / sf_08 E1 / ch_10 W1 | grip inside the Flue |
| Nave <-> Chandlery | dn_09 E1 / ch_01 W1 | Gallery of Saints: grip climb + 10-tile dash gap (back west is a free drop) |
| Nave <-> Mothwood | dn_10 W1 / mw_01 E1 | Flooded Tunnel: 51-wide meltwater under a 3-tile ceiling (oilcloak) |
| Meltbloom <-> Mothwood | mb_09 S1 / mw_03 N1 | mw_gate1, opened by lever mw_lv1 on the Mothwood side (one-way shortcut) |
| Nave -> Rime | dn_08 S1 / ri_01 N1 | cracked floor (plunge), one-way |
| Rime -> Nave | ri_05 N1 / dn_12 S1 | up-only Ice Stair (grip); its top ledge cannot be reached from the Nave |
| Chandlery -> Rime | ch_06 S1 / ri_06 N1 | cracked floor (plunge), one-way |
| Mothwood -> Rime | mw_09 S1 / ri_03 N1 | cracked floor (plunge), one-way |
| Rime <-> Sanctum | ri_08 S1 / hs_01 N1 | Seal Door (seals>=3), behind Sable's second duel (ri_07) |

## Critical path

DESIGN 4.2 order. Routes are the shortest exit-to-exit room sequences under the abilities held at that point (computed by plan_check).

${section('INTENDED CRITICAL PATH')}
${section('ALTERNATIVE ORDERS')}
${section('GATING TABLE')}

## Shortcuts, loops, secrets, no-trap

${sectionRange('NO-TRAP:', 'BACKTRACKING')}

## Backtracking rewards

Optional rewards in earlier regions that each later ability unlocks (every way to the reward needs an ability, one of them this one):

${section('BACKTRACKING REWARDS')}

## Collectibles (where everything is)

`;
const coll = [];
for (const r of plan.rooms) for (const c of r.contents) {
  if (/^(pickup|shrine|arena|lanternway|sconce|npc|lever|gate|sealdoor|start)/.test(c)) coll.push([c, r.id]);
}
const groups = [['Abilities', /^shrine:/], ['Bosses', /^arena:/], ["Chandler's Sparks", /#spark_/], ['Heartwax Shards', /^pickup:heartwax/], ['Ember Urn, Kiln Glass, Wax Notch', /^pickup:(urn|kiln_glass|notch)/],
  ['Sigils', /^pickup:sigil/], ['Sconces', /^sconce:/], ['Lanternway posts', /^lanternway:/], ['NPCs', /^npc:/], ['Levers, gates, Seal Door, start', /^(lever|gate|sealdoor|start)/]];
for (const [title, re] of groups) {
  md += `- **${title}:** ${coll.filter(([c]) => re.test(c)).map(([c, id]) => `\`${c}\` ${id}`).join(', ')}\n`;
}
md += '\n';

for (const [id, name, overview, landmarks, gating, secrets] of REGIONS) {
  const list = (byRegion[id] || []).slice().sort((a, b) => a.id.localeCompare(b.id));
  md += `## ${name} (${id}, ${list.length} rooms)\n\n${overview}\n\n- **Landmarks:** ${landmarks}\n- **Gating:** ${gating}\n- **Secrets:** ${secrets}\n\n`;
  for (const r of list) {
    md += `### ${r.id} - ${r.name} (${r.kind}, ${r.w}x${r.h} tiles at gx ${r.gx}, gy ${r.gy})\n\n`;
    md += `- Exits: ${r.exits.map((e) => `${e.id} ${e.side === 'W' || e.side === 'E' ? 'rows' : 'cols'} ${e.pos}-${e.pos + e.size - 1} -> ${e.to}.${e.toExit}`).join('; ')}\n`;
    if (r.paths.length) md += `- Traversals: ${pathSummary(r)}\n`;
    const ss = spotSummary(r);
    if (ss) md += `- Gated spots: ${ss}\n`;
    md += `- Contents: ${r.contents.map((c) => '`' + c + '`').join(', ')}\n`;
    if (r.secret) md += `- Secret room: ${r.secret}\n`;
    md += `\n${r.notes}\n\n`;
  }
}
const dest = path.join(ROOT, 'design', 'world_plan.md');
fs.writeFileSync(dest, md);
console.log(`wrote ${path.relative(ROOT, dest)} (${md.split('\n').length} lines)`);
