// src/data/regions/_regions.js — the 10 regions of Tallowdeep (+ the dev 'test' region).
// Values per TECH_SPEC §7.1 / DESIGN §4. mapColor = the region's tone on the map (matches its art palette).
// Node-loadable (pure data).
(function () {
  'use strict';
  const G = globalThis.G;
  const W = G.World;

  const REGIONS = [
    { id: 'shore', name: 'Ashen Shore', prefix: 'sh', music: 'shore', ambience: 'wind', dark: 0.2, mapColor: '#8a94a6' },
    { id: 'lastlight', name: 'Lastlight', prefix: 'll', music: 'lastlight', ambience: 'village', dark: 0.3, mapColor: '#a8806e' },
    { id: 'guttered', name: 'The Guttered Ways', prefix: 'gw', music: 'guttered', ambience: 'cave', dark: 0.55, mapColor: '#b08850' },
    { id: 'meltbloom', name: 'Meltbloom Gardens', prefix: 'mb', music: 'meltbloom', ambience: 'garden', dark: 0.35, mapColor: '#94ad7e' },
    { id: 'flue', name: 'The Sootflue', prefix: 'sf', music: 'flue', ambience: 'fire', dark: 0.6, mapColor: '#b8513c' },
    { id: 'nave', name: 'The Drowned Nave', prefix: 'dn', music: 'nave', ambience: 'rain', dark: 0.45, mapColor: '#4f8fa3' },
    { id: 'chandlery', name: 'The Chandlery', prefix: 'ch', music: 'chandlery', ambience: 'forge', dark: 0.4, mapColor: '#d0863a' },
    { id: 'mothwood', name: 'The Mothwood', prefix: 'mw', music: 'mothwood', ambience: 'forest', dark: 0.7, mapColor: '#7b6ab4' },
    { id: 'rime', name: 'The Rime', prefix: 'ri', music: 'rime', ambience: 'ice', dark: 0.45, mapColor: '#9fd2e4' },
    { id: 'sanctum', name: 'The Heartwick Sanctum', prefix: 'hs', music: 'sanctum', ambience: 'sanctum', dark: 0.3, mapColor: '#e2c46c' },
    // Dev-only rooms (src/data/test_rooms.js). Silent by default; ?region=<id> previews a real region.
    { id: 'test', name: 'Test Chambers', prefix: 'dev', music: null, ambience: null, dark: 0.3, mapColor: '#8a8f9c', dev: true },
  ];

  for (const r of REGIONS) W.defineRegion(r);
  W.REGION_IDS = REGIONS.filter((r) => !r.dev).map((r) => r.id);
})();
