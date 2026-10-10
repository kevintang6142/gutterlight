// tools/fixtures/margin_rooms.js — FIXTURE (not game data): gw_10 as built before the baseline QA (landing ledges beside S1 at
// top row 15): a player rising in from the Nave cleared the lip by 3.3 px. The normal reach run passes it; reach --margin
// must flag S1→N1 (tools/fixtures/selftest.js).
(function () {
  'use strict';
  const G = globalThis.G;
  G.World.defineRoom(Object.assign({"id":"gw_10","region":"guttered","name":"The Descent Lip","gx":416,"gy":90,"legend":{"a":{"type":"lore","id":"lore_gw_5"},"b":{"type":"enemy","kind":"snuffed_walker","facing":"right"}},"entities":[{"type":"event","script":"gw_waxwall","x":30,"y":14,"z":-5,"faceW":10,"faceH":10},{"type":"decor","kind":"drip","x":32,"y":1,"fall":150,"color":"#d8c4a0"},{"type":"decor","kind":"drip","x":35,"y":1,"fall":150,"color":"#d8c4a0"},{"type":"decor","kind":"drip","x":38,"y":1,"fall":150,"color":"#d8c4a0"},{"type":"decor","kind":"wick_grave","x":24,"y":14},{"type":"decor","kind":"bones","x":7,"y":14},{"type":"decor","kind":"rubble","x":29,"y":14},{"type":"decor","kind":"chain","x":44,"y":1,"len":120,"hook":true,"layer":"back"},{"type":"light","x":45,"y":14,"r":5,"color":"#7fb8c8","intensity":0.3,"flicker":false},{"type":"light","x":36,"y":3,"r":3,"color":"#7fb8c8","intensity":0.15,"flicker":false},{"type":"light","x":30,"y":9,"r":4,"color":"#f0c890","intensity":0.22,"flicker":true}],"theme":{"bg":"open","weather":[{"kind":"motes","count":50,"color":"#f0d098"}]},"bgSeed":10,"ambience":"rain"}, { tiles: [
    "##########....##################################################",
    "####...............####............................#############",
    "###................####............................#############",
    "##.................####............................#############",
    "#........======....####............................#############",
    "#..................####........##########..........#############",
    "#..................####........##########..........#############",
    "#..................####........##########..........#############",
    "#....======........####........##########..........#############",
    "#...................##.........##########====......#############",
    "#..............................##########..........#############",
    "#..............................##########..........#############",
    "#............=====.............##########......====#############",
    "#..............................##########..........#############",
    "#...............b..........a...##########..........#############",
    "############################################....################",
    "############################################....################",
    "############################################....################",
  ] }));
})();
