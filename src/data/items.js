// src/data/items.js — G.Items: sigil costs, shop stock & prices, Brand damage, collectible totals.
// Pure data (Node-loadable, no DOM). Player-facing names/descriptions live in G.Text (text.js).
// Numbers mirror docs/DESIGN.md §3.5 (sigils) and §5.1 (shops); ids follow TECH_SPEC §19.
(function () {
  'use strict';
  const G = globalThis.G;

  // Sigils, in inventory display order. `cost` = notches (DESIGN §3.5).
  // The extra fields are the effect parameters from the same table, so gameplay code can read
  // them from one place instead of hard-coding them (all optional for consumers).
  const sigils = {
    swift_brand:   { cost: 2, cooldownMult: 0.7 },             // Brand cooldown -30%
    long_brand:    { cost: 2, reachMult: 1.35 },               // Brand reach +35%
    heartwax:      { cost: 2, maxHealth: 1 },                  // +1 max health while equipped
    kindle_haste:  { cost: 2, kindleTimeMult: 0.6 },           // Kindle time -40%
    ember_thirst:  { cost: 1, emberPerHit: 6 },                // +6 Ember per Brand hit
    cinder_lure:   { cost: 1, radiusTiles: 6 },                // cinders fly to you from afar
    smolder_shell: { cost: 1, invulnMult: 1.6 },               // post-hit invulnerability +60%
    flare_trail:   { cost: 2, damage: 8, interval: 0.25 },     // dash leaves a burning trail
    bright_bolt:   { cost: 3, spellMult: 1.5 },                // spell damage +50%
    thorned_wax:   { cost: 1, damage: 12 },                    // burst when hurt
    steadfast:     { cost: 1 },                                // no recoil, no knockback
    waymoth:       { cost: 1 },                                // map marks uncollected relics
    last_light:    { cost: 2, damageMult: 1.75 },              // at 1 health, Brand damage +75%
    deep_kindle:   { cost: 3, heal: 2, kindleTimeMult: 1.65 }, // Kindle heals 2, takes 65% longer
  };

  // Shop stock (DESIGN §5.1). Pell entries carry `give`, the exact G.game.giveItem() spec.
  // Purchases are expected to be recorded like world pickups: flag `item:<id>`.
  const pell = [
    { item: 'heartwax', id: 'shop_pell_hw1', price: 150, give: 'heartwax' },
    { item: 'heartwax', id: 'shop_pell_hw2', price: 450, give: 'heartwax' },
    { item: 'urn', id: 'shop_pell_urn', price: 350, give: 'urn' },
    { item: 'notch', id: 'shop_pell_notch', price: 400, give: 'notch' },
  ];
  [['cinder_lure', 100], ['waymoth', 120], ['steadfast', 220], ['smolder_shell', 280], ['kindle_haste', 480]]
    .forEach(([sigil, price]) => {
      pell.push({ item: 'sigil', sigil, id: 'shop_pell_' + sigil, price, give: 'sigil:' + sigil });
    });

  // Quill's charts: buying one sets progress.charts[region] = true.
  const quill = [
    ['guttered', 40], ['meltbloom', 80], ['flue', 80], ['nave', 120],
    ['chandlery', 120], ['mothwood', 120], ['rime', 150],
  ].map(([region, price]) => ({ item: 'chart', region, id: 'shop_quill_' + region, price }));

  // Bramm's Brand upgrades: `level` is the Brand level reached; `glass` Kiln Glass is consumed.
  const bramm = [
    { level: 1, price: 250, glass: 0 },
    { level: 2, price: 700, glass: 1 },
    { level: 3, price: 1500, glass: 2 },
  ];

  G.Items = {
    sigils,
    shops: { pell, quill, bramm },
    brandDamage: [5, 9, 13, 17],   // by progress.brandLevel 0..3
    totals: { heartwax: 8, urns: 2, kilnGlass: 3, sparks: 6, seals: 3, sigils: 14, notches: 6, bosses: 8 },

    // Extensions (not in TECH_SPEC §15; optional helpers for UI/game code).
    notchesStart: 3,               // notches a new game begins with (max = totals.notches)
    order: {                       // canonical display orders
      abilities: ['bolt', 'dash', 'grip', 'oilcloak', 'plunge', 'wings'],
      sparks: ['spark_gw', 'spark_mb', 'spark_sf', 'spark_dn', 'spark_ch', 'spark_mw'],
      seals: ['bell', 'kiln', 'wing'],
      bosses: ['effigy', 'sable1', 'matron', 'tallowmere', 'kilnmother', 'vespertine', 'sable2', 'lucerne'],
    },
    sealBoss: { bell: 'tallowmere', kiln: 'kilnmother', wing: 'vespertine' },
  };
})();
