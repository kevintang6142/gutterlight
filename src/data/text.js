// src/data/text.js — G.Text: every player-facing string in GUTTERLIGHT (story, lore, NPCs, UI).
// Pure data (Node-loadable, no DOM). Schema: docs/TECH_SPEC.md §15; notes: docs/api/text.md.
// Lines may contain input tokens {jump} {attack} {dash} {spell} {up} {down} {map} {inventory};
// a few ui/shop strings use {placeholders} filled by G.Text.fmt().
(function () {
  'use strict';
  const G = globalThis.G;

  // ---------------------------------------------------------------------------------------------
  // Opening verse (shown before the Wickling wakes on the Ashen Shore).
  const intro = [
    "Below the grey ash of the world\nlies Tallowdeep,\na kingdom made of wax.",
    "Its people burned, and guttered,\nand went down into the warm,\nand were poured anew.",
    "So it was, for longer than any wax remembers.\nUntil the lights went out.\nAnd no one went down.",
    "Now the deep is cold,\nand the cold is climbing.",
    "But on the ash at the top of the world,\nwhere something small was laid with care,\na blue flame catches.",
  ];

  // ---------------------------------------------------------------------------------------------
  const areas = {
    shore:     { name: 'Ashen Shore', sub: 'Where the Grey Settles' },
    lastlight: { name: 'Lastlight', sub: 'The Last Hearth Burning' },
    guttered:  { name: 'The Guttered Ways', sub: 'Roads of the Unreturned' },
    meltbloom: { name: 'Meltbloom Gardens', sub: 'Where Wax Once Flowered' },
    flue:      { name: 'The Sootflue', sub: 'Throat of the Kingdom' },
    nave:      { name: 'The Drowned Nave', sub: 'Where the Bell Still Tolls' },
    chandlery: { name: 'The Chandlery', sub: 'Where the Pouring Never Stops' },
    mothwood:  { name: 'The Mothwood', sub: 'Wings Among the Wick-Reeds' },
    rime:      { name: 'The Rime', sub: 'Where the Warm Once Was' },
    sanctum:   { name: 'The Heartwick Sanctum', sub: 'The Light That Would Not End' },
    // Dev-only region for src/data/test_rooms.js (never seen in a normal game).
    test:      { name: 'Test Chambers', sub: 'Development Rooms' },
  };

  // ---------------------------------------------------------------------------------------------
  // NPC conversations. Each talk: { id, when?, once?, lines, give?, setFlag? }.
  // Entries are checked in order; the first whose `when` holds (and, if `once`, has not been
  // shown yet) is spoken. The last entry of every NPC is an unconditional fallback.
  // Talk ids are unique across an NPC's stages (wren_1..4, sable_1..2).
  const npcs = {
    thrum: {
      name: 'Old Thrum',
      prompt: 'Listen',
      talks: [
        { id: 'meet', when: '!talked:thrum:meet', once: true, lines: [
          "Hm? Footsteps, at this hour... Come closer, little wick. My eyes are dim. My wax is dimmer.",
          "...Oh. Oh, look at you. A blue flame. I have kept this sconce since before the dark, and never once seen its like.",
          "This is Lastlight. The last of the lit live here, close around the Brazier. It is not much. But it is warm.",
          "You will not stay, I think. Your kind of light wants to go places. The Well in the square goes down to the old roads.",
          "Go gently, little wick. And come back to the fire when you can.",
        ] },
        { id: 'notch', when: 'seals>=3 & !flag:thrum_notch', once: true, give: 'notch', setFlag: 'thrum_notch', lines: [
          "Come here. Let an old candle look at you... Bell, and Forge, and Wing. All three Wardens' flames, burning in you.",
          "You carry their flames now. Carry this too.",
          "A Wax Notch. I wore it when I was young and carried more than I do now. My old wick has no use for it.",
        ] },
        { id: 'sparks_all', when: 'sparks>=6', once: true, lines: [
          "Stand still a moment, little wick. ...Your flame is whole. I can feel it from here.",
          "It is the Maker's own warmth. I would know it anywhere. It held me once, when I was no bigger than a thimble.",
          "I had forgotten it. I had forgotten that I'd forgotten. Thank you for letting an old stub feel it again.",
        ] },
        { id: 'sparks', when: 'sparks>=2 & !sparks>=6', once: true, lines: [
          "Your flame has changed. There is something older in it now. Deeper.",
          "It reminds me of the warmth that rose through the floors when I was a wickling, before the dark came.",
          "If there are more such embers out there, find them. A fire that old should not be left in pieces.",
        ] },
        { id: 'gate', when: 'boss:sable2', once: true, lines: [
          "You went all the way down, and came back up. And the black-wax girl let you pass? They say she lets no one pass.",
          "Then she has decided something. Good. Deciding is the hard part. Harder than any fight.",
        ] },
        { id: 'bell', when: 'boss:tallowmere', once: true, lines: [
          "Listen. ...No, you would not hear it. It is what is missing. The bell has stopped.",
          "I have heard that bell every night since the dark came, faint, beneath everything. The Abbot's bell. It kept the Snuffed gentle.",
          "He was kind, once. He thought sleep was a kindness. Perhaps, for him, it was.",
        ] },
        { id: 'kiln', when: 'boss:kilnmother', once: true, lines: [
          "The Kiln Mother. I saw her once, when I was young. She learned the pouring at the Maker's own side.",
          "She could pour anything. Bells, bars, bodies. But she never learned to light them, and she never learned to stop.",
          "Let her forge go cold now. She has earned that much rest.",
        ] },
        { id: 'wing', when: 'boss:vespertine', once: true, lines: [
          "Moths came to the Brazier last night. Dozens of them. They circled, and circled, and then they all flew down.",
          "The Duchess loved the Queen's light more than anything in the deep. More than her own wings, they said.",
          "I hope she has found somewhere warm to rest them.",
        ] },
        { id: 'wings', when: 'ability:wings & !talked:thrum:farewell', once: true, lines: [
          "Smoke rising from your shoulders, like wings. When I was young, the moths would have followed you anywhere.",
          "Now there is nothing high enough to keep you out. Mind you come back down.",
        ] },
        { id: 'plunge', when: 'ability:plunge & !talked:thrum:farewell', once: true, lines: [
          "I felt the floor shake a while ago, and here you are. You land like a dropped anvil, little wick.",
          "Old floors crack. Some of them were meant to. There is more below the Nave than water.",
        ] },
        { id: 'oilcloak', when: 'ability:oilcloak & !ability:wings & !talked:thrum:farewell', once: true, lines: [
          "Your cloak is slick with oil. Through the Nave's deep water and out again, dry? Not even the rain can put you out.",
          "West of the Nave, a drowned road runs to the Mothwood. The moths never minded the dark. I always did.",
        ] },
        { id: 'farewell', when: 'seals>=3 & flag:thrum_notch', once: true, lines: [
          "So. You will go down to the heart of it all. Below the Rime. Below everything.",
          "When I was poured, the old ones sang us a rhyme. 'Burn and gutter, gutter and go, down to the Mother, warm and slow...'",
          "I forget the rest. I forget a great deal, lately.",
          "Whatever you find down there, little wick... I am glad I saw one new light before my last.",
          "Go on, now. The fire will keep.",
        ] },
        { id: 'effigy', when: 'boss:effigy & !ability:dash', once: true, lines: [
          "They say the Old Guard's statue has fallen, down in the Ways. It stood there since before my mother was poured.",
          "The Guard were too proud to lie down, even at the end. Something kept that statue standing. Something grey.",
          "Well. Whatever held it up, the west road is open now.",
        ] },
        { id: 'sable', when: 'boss:sable1 & !ability:grip', once: true, lines: [
          "You met someone in the Gardens. I can see it on you: a scorch on your cloak, still warm.",
          "Black wax, and a red scarf? ...There is an old story. The Queen had a daughter, poured the night the dark came, and never lit.",
          "I always thought it only a story. Most sad things are, until you meet them.",
        ] },
        { id: 'grip', when: 'ability:grip & !seals>=1', once: true, lines: [
          "Soot to the elbows. You have been up the Sootflue. ...And the old Matron? Gone quiet, I think. Poor, hungry thing.",
          "And your hands... the wax clings to stone now, does it? Good. Most of the deep is walls.",
        ] },
        { id: 'bolt', when: 'ability:bolt & !boss:effigy', once: true, lines: [
          "You found one of the old shrines, and it answered you? They have not answered anyone in an age.",
          "The shrines were the Maker's gifts, the old ones said. Left to be found by those who needed them. Perhaps they waited for you.",
        ] },
        { id: 'lanternway', when: 'ability:bolt & !seals>=1', once: true, lines: [
          "See that tall post with the cold lamp? A Lanternway post. There are more of them below, in the dark.",
          "Light one, and it will know you. Lanterns that know you will carry you between them. That was the way, once.",
        ] },
        { id: 'hint_well', when: '!ability:bolt & !boss:effigy', lines: [
          "Down the Well lie the Guttered Ways. If you find an old sconce down there, rest by it. A lit sconce is a kind of home.",
        ] },
        { id: 'hint_effigy', when: 'ability:bolt & !boss:effigy', lines: [
          "West in the Ways stood the Old Guard, who let no one into the Gardens. Something still stands there, they say.",
        ] },
        { id: 'hint_gardens', when: 'boss:effigy & !ability:dash', lines: [
          "The Meltbloom Gardens lie west, past where the statue stood. Lovely, once. Mind the thorns.",
        ] },
        { id: 'hint_flue', when: 'ability:dash & !ability:grip', lines: [
          "East in the Ways, the old bridge to the Sootflue broke long ago. A quick flame might leap the gap. You are quick.",
        ] },
        { id: 'hint_nave', when: 'ability:grip & !ability:oilcloak & !seals>=1', lines: [
          "The way down to the Drowned Nave lies past a sheer climb in the Ways. A wick that clings could manage it. Mind the rain.",
        ] },
        { id: 'hint_seals', when: 'ability:grip & !seals>=3', lines: [
          "Three Wardens sealed the way to the heart with their own flames: the Abbot, the Kiln Mother, and the Duchess.",
          "The Abbot keeps the Nave. The Kiln Mother keeps her forges. The Duchess keeps the dark wood west of the rain.",
        ] },
        { id: 'hint_rime', when: 'seals>=3 & !boss:sable2', lines: [
          "The cracked floors of the Nave go down to the Rime. The heart of Tallowdeep lies past it. It was once the warmest place in the world.",
        ] },
        { id: 'idle', lines: [
          "Rest a while, little wick. The Brazier is warm, and the dark is patient.",
        ] },
      ],
    },

    pell: {
      name: 'Pell',
      prompt: 'Talk',
      shop: 'pell',
      talks: [
        { id: 'meet', when: '!talked:pell:meet', once: true, lines: [
          "Well, well! A customer! And a bright one — blue, no less! Business is looking brighter already.",
          "Pell's the name. Trinkets, trifles and treasures, hauled on my own back from every corner of the deep.",
          "Back when the deep was fit for hauling, that is. Now I sit by the fire and let the treasures come to me. Have a look!",
        ] },
        { id: 'seals_all', when: 'seals>=3', once: true, lines: [
          "All three Warden seals? I won't ask what you mean to do with them. I'm a merchant. I only ask what you mean to buy.",
        ] },
        { id: 'wings', when: 'ability:wings', once: true, lines: [
          "Wings of smoke! Do try not to flutter off with my stock. I've seen moths try it.",
        ] },
        { id: 'seal', when: 'seals>=1 & !seals>=3', once: true, lines: [
          "Is that a Warden's seal on you? My, you are going up in the world. Down in it. Whichever.",
        ] },
        { id: 'grip', when: 'ability:grip & !seals>=1', once: true, lines: [
          "Sticky fingers, I see! In my line of work we keep an eye on those. Joking, joking. Mostly.",
        ] },
        { id: 'dash', when: 'ability:dash & !ability:grip', once: true, lines: [
          "Quick as a draft through a keyhole! Careful you don't blow yourself out.",
        ] },
        { id: 'waymoth', when: '!ability:dash & !sigil:waymoth', once: true, lines: [
          "See the little moth on the shelf there? A Waymoth sigil. It flutters toward things you've missed.",
          "Much as I flutter toward a sale. Ha!",
        ] },
        { id: 'idle_early', when: '!ability:grip', lines: [
          "Back again! Browse, browse. My wares won't buy themselves. I've asked.",
        ] },
        { id: 'idle', lines: [
          "There's my best customer! Possibly my only customer. Have a look, have a look.",
        ] },
      ],
    },

    quill: {
      name: 'Quill',
      prompt: 'Talk',
      shop: 'quill',
      talks: [
        { id: 'meet', when: '!talked:quill:meet', once: true, lines: [
          "Hm-hm, hmm-hmm... Oh! Hello. Mind your feet. No, there. You're standing on the Guttered Ways.",
          "Quill. I draw charts: every hall and shaft and crack of the deep. I do love an edge. It's where one thing turns into another.",
          "My charts are old, mind. Some of the lines have wandered off since. Lines do that, when no one is watching them.",
          "Buy what I've walked, then walk what I haven't. Read them with {map}. And come back and tell me where the lines went.",
        ] },
        { id: 'bottom', when: 'boss:sable2', once: true, lines: [
          "You've been to the very bottom. Is there a line there, where it all ends? ...No. Don't tell me. I'd like one edge left undrawn.",
        ] },
        { id: 'wings', when: 'ability:wings', once: true, lines: [
          "You've been up where the ceilings are! The tops of things are the loveliest edges, and nobody ever draws them. Hm-hm.",
        ] },
        { id: 'oilcloak', when: 'ability:oilcloak & !ability:wings', once: true, lines: [
          "An oiled cloak? Then the flooded tunnel west of the Nave is yours. I swam it once, ink held over my head. Water eats ink. And chartmakers.",
        ] },
        { id: 'grip', when: 'ability:grip & !ability:oilcloak', once: true, lines: [
          "Wax Grip! Oh, that changes everything. Walls aren't edges to you anymore. They're roads. I'll need to redraw... all of it.",
        ] },
        { id: 'gardens', when: 'ability:dash & !ability:grip', once: true, lines: [
          "You've been to the Gardens. Tell me, do the vines still curl to the left? I always drew them curling left. Hm-hm-hmm.",
        ] },
        { id: 'idle', lines: [
          "Hm-hmm, hm... Oh, you're still here. Good. Everything is nicer with someone standing at the edge of it.",
        ] },
      ],
    },

    bramm: {
      name: 'Bramm',
      prompt: 'Talk',
      shop: 'bramm',
      talks: [
        { id: 'meet', when: '!talked:bramm:meet', once: true, lines: [
          "Blue flame. Never seen one. Doesn't matter. What matters is that rod in your hand.",
          "That's a Brand? Barely. Iron with a warm tip. I've made better pokers for my own hearth.",
          "Bramm. Wickwright. Bring me cinders and I'll make it a Brand. Bring me Kiln Glass from the deep forges and I'll make it sing.",
        ] },
        { id: 'kiln', when: 'boss:kilnmother', once: true, lines: [
          "Heard the Chandlery's gone quiet. I learned my trade from one of the Kiln Mother's smiths. Fine work, hers. Foul purpose.",
          "A forge should make things that end. Pokers wear out. Bells crack. That's how you know they were used.",
        ] },
        { id: 'plunge', when: 'ability:plunge & !boss:kilnmother', once: true, lines: [
          "You've been in the Chandlery. I can smell the iron on you. Those great vats... I'd give my last inch of wick to work them once.",
        ] },
        { id: 'hint', when: '!ability:grip', lines: [
          "Kiln Glass. Fired in the old forges, scattered all over the deep since. Rings like a bell when you tap it. Find it. Bring it.",
        ] },
        { id: 'idle', lines: [
          "A Brand's only as good as the hand that holds it. Mine are good. Yours are learning.",
        ] },
      ],
    },

    // Wren: met four times, each time colder (guttered, nave, mothwood, rime).
    wren_1: {
      name: 'Wren',
      prompt: 'Talk',
      talks: [
        { id: 'w1_meet', once: true, setFlag: 'wren_met_1', lines: [
          "Oh! You startled me. I took you for one of the Snuffed. But you're lit. You're lit blue!",
          "I'm Wren. I'm going down. All the way down, to the very bottom of the world.",
          "The old songs say that's where every flame goes when its wax is spent. Home, to the warm.",
          "I'd like to see where home is, before I have to go there. Silly, isn't it?",
        ] },
        { id: 'w1_road', once: true, lines: [
          "If you find a good way down, scratch a mark by it for me. I'll do the same for you. We'll make a road of it, the two of us.",
        ] },
        { id: 'w1_idle', lines: [
          "Down and down, that's the way. Hm. Which way is down from here?",
        ] },
      ],
    },
    wren_2: {
      name: 'Wren',
      prompt: 'Talk',
      talks: [
        // First words ever, if the player never spoke to her in the Ways (gw_09 is off the critical
        // path, and stage 1 is gone for good once stage 2 is seen): she introduces herself instead.
        { id: 'w2_first', when: '!boss:tallowmere & !flag:wren_met_1', once: true, setFlag: 'wren_met_2', lines: [
          "Oh! You startled me. I took you for one of the Snuffed, coming out of the rain like that. But you're lit. You're lit blue!",
          "I'm Wren. I'm going down. All the way down, to the very bottom of the world. Where every flame goes when its wax is spent.",
          "This rain never stops. It gets into your wick. My flame hasn't liked me since I came down here.",
          "And that bell. Do you hear it? Every time it tolls, I want to lie down and never get up.",
          "I won't, though. Down is still that way. I'm still going. Mind the rain, Blue-flame.",
        ] },
        // Same, after the Abbot has fallen (see w2_meet_quiet).
        { id: 'w2_first_quiet', when: 'boss:tallowmere & !flag:wren_met_1 & !flag:wren_met_2', setFlag: 'wren_met_2', lines: [
          "Oh! You startled me. I took you for one of the Snuffed, coming out of the rain like that. But you're lit. You're lit blue!",
          "I'm Wren. I'm going down. All the way down, to the very bottom of the world. Where every flame goes when its wax is spent.",
          "There was a bell, when I came in. Every time it tolled, I wanted to lie down and never get up. Then it stopped. Was that you?",
          "...Thank you, Blue-flame. I didn't know how heavy it was until it was gone. Down is still that way. I'm still going.",
        ] },
        { id: 'w2_meet', when: '!boss:tallowmere & flag:wren_met_1', once: true, setFlag: 'wren_met_2', lines: [
          "Blue-flame. It's me. Wren. ...You remember me? I forget things, lately. Little things.",
          "This rain never stops. It gets into your wick. My flame hasn't liked me since I came down here.",
          "And that bell. Do you hear it? Every time it tolls, I want to lie down and never get up.",
          "I won't, though. Down is still that way. I'm still going.",
        ] },
        // First meeting after the Abbot has fallen: the bell is already silent (w2_bell would repeat it).
        // Not `once`: its own setFlag closes the window (it is the alternative to w2_meet, not a step after it).
        { id: 'w2_meet_quiet', when: 'boss:tallowmere & flag:wren_met_1 & !flag:wren_met_2', setFlag: 'wren_met_2', lines: [
          "Blue-flame. It's me. Wren. ...You remember me? I forget things, lately. Little things.",
          "This rain never stops. It gets into your wick. My flame hasn't liked me since I came down here.",
          "There was a bell, when I came in. Every time it tolled, I wanted to lie down and never get up. Then it stopped. Was that you?",
          "...Thank you. I didn't know how heavy it was until it was gone. Down is still that way. I'm still going.",
        ] },
        { id: 'w2_bell', when: 'boss:tallowmere & !talked:wren_2:w2_meet_quiet & !talked:wren_2:w2_first_quiet', once: true, lines: [
          "The bell's stopped. I didn't know how heavy it was until it was gone. Was that you? ...Thank you.",
        ] },
        { id: 'w2_idle', lines: [
          "I'll rest a little. Only a little. Go on ahead. I'll catch up.",
        ] },
      ],
    },
    wren_3: {
      name: 'Wren',
      prompt: 'Talk',
      talks: [
        // First words ever, if the player spoke to her neither in the Ways nor in the Nave.
        { id: 'w3_first', when: '!boss:vespertine & !flag:wren_met_1 & !flag:wren_met_2', once: true, setFlag: 'wren_met_3', lines: [
          "Oh... a light. A blue one. It's so dark in this wood. The moths keep landing on my hat.",
          "They think I'm a light. I tell them I'm not much of one anymore. They stay anyway. Kind things.",
          "I'm Wren. I'm going down, to the very bottom of the world. The songs say we go home there, when our wax is spent.",
          "But no one has gone home in such a long time. What if there's no home at the bottom? What if it's just... more down?",
        ] },
        // Same, after the Duchess has fallen (see w3_meet_quiet).
        { id: 'w3_first_quiet', when: 'boss:vespertine & !flag:wren_met_1 & !flag:wren_met_2 & !flag:wren_met_3', setFlag: 'wren_met_3', lines: [
          "Oh... a light. A blue one. It's so dark in this wood. There were moths here, before. They kept landing on my hat.",
          "They thought I was a light. I told them I'm not much of one anymore. They stayed anyway. Then they were all gone. Somewhere warm, I hope.",
          "I'm Wren. I'm going down, to the very bottom of the world. The songs say we go home there, when our wax is spent.",
          "But no one has gone home in such a long time. What if there's no home at the bottom? What if it's just... more down?",
        ] },
        { id: 'w3_meet', when: '!boss:vespertine & !flag:wren_met_3', once: true, setFlag: 'wren_met_3', lines: [
          "...Blue-flame? It's so dark in this wood. The moths keep landing on my hat.",
          "They think I'm a light. I tell them I'm not much of one anymore. They stay anyway. Kind things.",
          "I've been thinking. The songs say we go home when our wax is spent. But no one has gone home in such a long time.",
          "What if there's no home at the bottom? What if it's just... more down?",
        ] },
        // First meeting after the Duchess has fallen: the moths have already left (w3_wing would repeat it).
        // Not `once`: its own setFlag closes the window (it is the alternative to w3_meet, not a step after it).
        { id: 'w3_meet_quiet', when: 'boss:vespertine & !flag:wren_met_3', setFlag: 'wren_met_3', lines: [
          "...Blue-flame? It's so dark in this wood. There were moths here, before. They kept landing on my hat.",
          "They thought I was a light. I told them I'm not much of one anymore. They stayed anyway. Then they were all gone. Somewhere warm, I hope.",
          "I've been thinking. The songs say we go home when our wax is spent. But no one has gone home in such a long time.",
          "What if there's no home at the bottom? What if it's just... more down?",
        ] },
        { id: 'w3_wing', when: 'boss:vespertine & !talked:wren_3:w3_meet_quiet & !talked:wren_3:w3_first_quiet', once: true, lines: [
          "The moths have all gone. Somewhere warm, I hope. I'm glad for them. I was getting fond of them.",
        ] },
        { id: 'w3_idle', lines: [
          "I'm fine. My flame is only resting. It does that now.",
        ] },
      ],
    },
    wren_4: {
      name: 'Wren',
      prompt: 'Listen',
      talks: [
        { id: 'w4_gift', when: '!flag:wren_gift', once: true, give: 'sigil:long_brand', setFlag: 'wren_gift', lines: [
          "...Blue... flame. You came all this way. So did I.",
          "This is as far as I go. I tried to cross the ice. The cold is in my wick now. I can't feel it anymore.",
          "Here. Take this. My Longbrand. It always reached a little further than I did.",
          "Go the rest of the way, for me. If there's a home down there... tell me. I'll be listening.",
        ] },
        { id: 'w4_idle', lines: [
          "...",
          "...still here... go on...",
        ] },
      ],
    },

    // Sable outside her duels: a glimpse in the Guttered Ways, then aside at the Sanctum gate.
    sable_1: {
      name: 'Sable',
      prompt: 'Listen',
      talks: [
        { id: 's1_glimpse', when: '!boss:sable1', once: true, lines: [
          "So. The Maker's last spill can walk.",
          "Go back up to your ash, blue-flame. Below here everything is cold, and all of it is mine to guard.",
        ] },
        { id: 's1_after', when: 'boss:sable1', once: true, lines: [
          "Do not mistake my leaving for losing. I wanted to see what you were. Now I have.",
        ] },
        { id: 's1_watch', when: 'boss:sable1', lines: [
          "...",
        ] },
        { id: 's1_idle', lines: [
          "Go back.",
        ] },
      ],
    },
    sable_2: {
      name: 'Sable',
      prompt: 'Listen',
      talks: [
        { id: 's2_yield', once: true, lines: [
          "Enough. ...Enough.",
          "You do not stop. Whatever I put in your way, you go through it, or over it, or under it.",
          "I was poured to guard a light I was never given. I have stood at this door so long I forgot what waits behind it.",
          "My mother waits behind it. She will not understand. She never could bear an ending.",
          "Then burn, little wick. Burn for all of us.",
        ] },
        { id: 's2_seals', when: '!seals>=3', lines: [
          "The door will not open for you yet. Three Wardens hold it shut with their flames: the Bell, the Forge, the Wing. Take them.",
        ] },
        { id: 's2_whole', when: 'sparks>=6', once: true, lines: [
          "The Maker's whole fire is in you. I can feel it through the cold, like a hearth through a wall. Go.",
        ] },
        { id: 's2_broken', when: '!sparks>=6', lines: [
          "Your flame is not whole, blue-flame. I can see the gaps in it, like drafts in a hall. Pieces of the Maker still lie scattered above.",
          "Go in like that, and her lantern will keep you. It keeps everything.",
        ] },
        { id: 's2_idle', lines: [
          "I will keep the gate. I always have.",
        ] },
      ],
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Lore tablets (TECH_SPEC §19 ids). The truth surfaces slowly: hints and contradictions early,
  // the mechanism of the cage in the Nave and Chandlery, the full picture in the Rime and Sanctum.
  const lore = {
    // Ashen Shore — carvings in a vast, careful hand (the Chandler's, though it never says so).
    lore_sh_1: { title: 'A Carving, Deep and Careful', lines: [
      "If you can read this, you have woken. Good. I feared you would not.",
      "The world beneath the ash is high and hard. Press {jump} to leap. Hold it longer to rise higher.",
      "Where a ledge is thin, hold {down} and press {jump} to drop through it.",
      "Do not fear the dark ahead. You carry your own light.",
    ] },
    lore_sh_2: { title: 'A Second Carving', lines: [
      "I have left you a Brand. A small thing, but its tip stays hot. Press {attack} to strike.",
      "Hold {up} as you strike to aim above you. In the air, hold {down} as you strike to aim below, and spring off foes and thorns.",
      "What waits below was not always cruel. Strike anyway. It cannot feel it now.",
    ] },
    lore_sh_3: { title: 'A Third Carving, Half Buried', lines: [
      "Each strike that lands draws Ember. Stand still and hold {spell} to Kindle, and your Ember will mend your wax.",
      "Where an old sconce stands, press {up} to rest beside it. Resting is not ending. Remember that.",
      "Press {map} to see the roads you have walked, and {inventory} to see what you carry.",
      "Go down gently, little one. I am sorry I cannot go with you.",
    ] },

    // Lastlight
    lore_ll_1: { title: 'The Founding Stone of Lastlight', lines: [
      "LASTLIGHT. Its Brazier kindled on the night the deep went dark, by the last of the Lamplighters.",
      "Feed the fire. Keep close to it. While one fire burns here, we are not lost.",
      "(Scratched beneath, smaller:) Some of us have fed it our own wax. It is all we have left to give.",
    ] },
    lore_ll_2: { title: 'Plaque of the Wickwrights\' Guild', lines: [
      "TO ALL WHO GO DOWN THE WELL: below lie THE GUTTERED WAYS, the old roads of the kingdom.",
      "Go lit. Go in pairs. Come back before your wax runs short.",
      "If you meet someone you knew down there, do not answer when they call your name.",
    ] },

    // The Guttered Ways
    lore_gw_1: { title: 'Royal Decree, Gilded', lines: [
      "BY THE WILL OF HER MAJESTY LUCERNE, THE LAMPLIGHT QUEEN, LET IT BE KNOWN IN EVERY HALL AND HEARTH:",
      "NO FLAME SHALL GUTTER. NO LIGHT SHALL END.",
      "Rejoice, for the Everlantern is lit, and the dark is undone forever.",
      "(Beneath, scratched deep with something sharp:) THEN WHY IS IT SO DARK",
    ] },
    lore_gw_2: { title: 'A Prayer, Partly Chiseled Away', lines: [
      "Go down, little light. Your wax is spent. Your work is done.",
      "Go down to the warm, to the First Flame, to the Mother of all wax.",
      "Be poured again. Be lit again. Come home to us—",
      "(The rest has been chiseled away, slowly and with great care, by someone with a great deal of time.)",
    ] },
    lore_gw_3: { title: 'Scratched Low on a Wall, in a Small Hand', lines: [
      "my grandda is still walking",
      "mama says dont go near him. he dont know my name now. he just walks and walks",
      "his flame went out but he didnt go down. why didnt he go down",
    ] },
    lore_gw_4: { title: 'Oath of the Old Guard', lines: [
      "We are the Old Guard. We keep the Ways, and the Ways keep the kingdom.",
      "Our wax for the Queen. Our flames for the Queen. Our rest, when it comes, for the Queen.",
      "(Newer, rougher letters:) Rest has not come. We are still standing. We are still standing.",
    ] },
    lore_gw_5: { title: 'Warning, Daubed in Soot', lines: [
      "DO NOT BREATHE THE PALL.",
      "The grey smoke that clings to the Snuffed is not smoke. It moves when they move. It moves when they don't.",
      "Sit near it long enough and you can hear it. It sounds like something trying to go home.",
    ] },

    // Meltbloom Gardens
    lore_mb_1: { title: "Gardener's Rule, Carved on a Trellis", lines: [
      "Tend the blooms gently. Every flower here is warmed from below.",
      "When a flame goes down, the gardens open. When the gardens open, we know someone has made it home.",
      "(A later hand:) They have not opened in a long time.",
    ] },
    lore_mb_2: { title: 'Words Pressed into a Wax Petal', lines: [
      "Meet me where the meltblooms open, the night my wax runs out.",
      "I want the last thing I see to be gold. And the first thing, when I am poured again, to be you.",
      "(The petal has closed tight around the words, as if to keep them.)",
    ] },
    lore_mb_3: { title: "Herald's Notice", lines: [
      "BY ORDER OF THE CROWN, THE MELTBLOOM GARDENS ARE CLOSED UNTIL FURTHER NOTICE.",
      "The blooms are not dying. The blooms are resting. Gardeners are not to be troubled with questions.",
      "Thorns are a natural part of any garden.",
    ] },
    lore_mb_4: { title: 'Scratched in Black Wax', lines: [
      "They tell me I was poured the night the Everlantern was lit. They tell me there was no spark left to spare for me.",
      "I do not know what it is to burn. I know how to stand in a doorway. I have become very good at it.",
      "Whoever you are, turn back. Not for your sake. For mine.",
    ] },

    // The Sootflue
    lore_sf_1: { title: "Stokers' Work-Song, Painted on a Pipe", lines: [
      "Up goes the smoke and up goes the heat,\nup from the Heart where the old flames meet;",
      "sweep out the flue and mind the draw,\nand the deep breathes out as it did before.",
      "(Painted over, in grey:) THE SMOKE COMES DOWN NOW",
    ] },
    lore_sf_2: { title: "Flue-Master's Log", lines: [
      "Day 112 since the Lantern was lit. The draw is failing. Smoke hangs in the shafts and will not rise.",
      "Day 200. The smoke sinks now. It pours down the flues like water, back toward the deep, and pools at the bottom.",
      "Day 300 and some. I have lost count. There are faces in the smoke. I know some of them.",
    ] },
    lore_sf_3: { title: 'Notice to All Stokers', lines: [
      "The Matron's brood is NOT to be harmed. They keep the flues clean.",
      "Feed her when she is hungry. Do not be in the flue when she is very hungry.",
      "(Chalked beneath:) Nobody has fed her in a long while.",
    ] },
    lore_sf_4: { title: 'Dedication Stone, Soot-Black', lines: [
      "THIS FLUE WAS CUT BY THE MANY HANDS, THAT THE BREATH OF THE FIRST FLAME MIGHT REACH THE SKY.",
      "Breathe out, Tallowdeep. Breathe in. All that rises returns.",
      "(Someone has scratched out 'returns' and carved 'remains'.)",
    ] },

    // The Drowned Nave
    lore_dn_1: { title: 'Hymn of the Nave, Worn by Rain', lines: [
      "Burn and gutter, gutter and go,\ndown to the Mother, warm and slow;",
      "pour me again when the wax is new,\nlight me again, and I'll come home to you.",
      "(Sung at every guttering, in the days when there were gutterings.)",
    ] },
    lore_dn_2: { title: "The Abbot's Sermon, Carved on a Pulpit", lines: [
      "Children, do not fear the cold. Do not fear the grey. The bell will hold you.",
      "You are not lost. You are only sleeping. And sleep is a kind of keeping.",
      "When the Queen wills it, you shall wake to a morning without end. Until then, hush. Hush.",
    ] },
    lore_dn_3: { title: 'Scratched Beneath a Pew', lines: [
      "The Abbot says we are asleep. I am not asleep.",
      "I hear the bell each time it tolls. I feel my feet walking. I cannot make them stop.",
      "If anyone reads this, please. Please stop the bell.",
    ] },
    lore_dn_4: { title: 'Oath of the Three Wardens', lines: [
      "We three, of Bell and Forge and Wing, seal the way to the Heart with our own flames.",
      "Let none pass to trouble the Queen's Lantern. Let none unmake what is made forever.",
      "Tallowmere, Abbot. The Kiln Mother, Smith. Vespertine, Duchess. Sworn in the last warm hour.",
    ] },
    lore_dn_5: { title: 'Chronicle of the Lighting', lines: [
      "In the hundredth year of her reign, a candle of the Queen's crown burned low, and she was afraid.",
      "She went to the Chandler, the Maker of Many Hands, and begged that no light should ever go down again. The Maker would not.",
      "So the Queen and her Wardens built the Everlantern: a lantern of glass and gold around the First Flame, to hold it still forever.",
      "And the lights of Tallowdeep, which had always gone down to the warm, could go down no longer.",
    ] },
    lore_dn_6: { title: 'Cracked Stone in the Floor', lines: [
      "The stone below the Nave is cold. It was never cold. The deep was always the warmest place in the world.",
      "Something is rising from below. Not smoke. Frost.",
      "(Scratched in haste:) The Rime is on the stairs.",
    ] },

    // The Chandlery
    lore_ch_1: { title: 'Pouring Ledger', lines: [
      "Pouring for the Heart's guard. Wax: warm. Wicks: set. Sparks: none to give. They stood regardless.",
      "Four-hundredth pouring. Wax: cooling. Wicks: set. Sparks: none.",
      "Nine-thousandth pouring. Wax: cold. Wicks: none. Sparks: none. She will not stop.",
    ] },
    lore_ch_2: { title: 'Royal Work Order', lines: [
      "TO THE KILN MOTHER, WARDEN OF THE FORGE: cast the bars of the Everlantern in gold, and its panes in kiln-glass.",
      "The Chandler has refused this work. You will not.",
      "(Pressed into the wax below the order: a thumbprint the size of a shield.)",
    ] },
    lore_ch_3: { title: 'Entry in a Smaller Ledger', lines: [
      "Poured this night, at Her Majesty's command: one daughter, of the black dregs.",
      "No spark could be found to light her. Her Majesty wept, and said the Lantern would keep her safe all the same.",
      "The child stood up unlit, and looked at us, and did not cry.",
    ] },
    lore_ch_4: { title: 'Words Scored into a Cold Vat', lines: [
      "Master, you taught me to pour. You never taught me how to stop.",
      "Every mold I fill is empty when I break it open. Still I fill them. If I stop, I will have to look at what I made.",
      "Forgive me the cage. Forgive me the gold.",
    ] },

    // The Mothwood
    lore_mw_1: { title: 'Moth-Script, Woven in Silk', lines: [
      "Light is not warmth. Light is only light.",
      "We moths never knew the difference, until the warm was gone and the light remained.",
      "Now we circle, and circle, and are cold.",
    ] },
    lore_mw_2: { title: "The Duchess's Vow, Embroidered", lines: [
      "I have loved her light since I was a small thing crawling in the reeds.",
      "I will be the last to see it. I will keep it from every wind and every hand. I swear it on my wings.",
      "— Vespertine, Duchess of the Mothwood, Warden of the Wing",
    ] },
    lore_mw_3: { title: "A Courtier's Letter, Never Sent", lines: [
      "Your Grace, the Queen will see no one. She sits beside the Lantern and counts the candles of her crown.",
      "They burn and burn, and never shorten. Some days she laughs at this. Some days she weeps.",
      "She asked me if I was warm. I lied. Please do not come.",
    ] },
    lore_mw_4: { title: 'Carved on a Cocoon-Stone', lines: [
      "Here the old moths wrap themselves to wait for their changing.",
      "Some have waited a very long time. Changing needs warmth. There is none.",
      "Do not open them. They are not ready. They never will be.",
    ] },

    // The Rime
    lore_ri_1: { title: 'Inscription Beneath the Frost', lines: [
      "HERE RAN THE RETURNING, a river of little lights, down to the First Flame.",
      "Stand here when someone you love goes down. You will feel them pass you, warm, on their way home.",
      "(The river is ice now. Far beneath the surface, something glimmers, and does not move.)",
    ] },
    lore_ri_2: { title: "Pilgrims' Marker, Frozen Fast", lines: [
      "We came down to open the Lantern. We were lit, and many. We thought it would be enough.",
      "The Wardens' door does not open for the willing. Only for their three flames.",
      "We are cold now. If you are warmer than we were, go on. Tell the Queen we forgive her.",
    ] },
    lore_ri_3: { title: 'Carved Above the Seal Door', lines: [
      "BELL. FORGE. WING.",
      "Three flames hold this door. Bring all three, or go back to whatever light you came from.",
    ] },
    lore_ri_4: { title: 'Scratched in Black Wax, on the Ice', lines: [
      "Mother. I have kept your door longer than you reigned before you closed it.",
      "Some nights I hear you through it, counting your candles.",
      "If someone comes who can end this, I will test them. I will not stop them twice.",
    ] },

    // The Heartwick Sanctum
    lore_hs_1: { title: "In the Queen's Own Hand", lines: [
      "I felt it first in my crown: one candle, burning low. All my light, and still I would go down into the dark like anyone.",
      "I told the Maker to stop it. It said every light gutters, and that this is how light is passed on. I called it cruel.",
      "Now nothing gutters, and nothing is passed on, and I am so cold. But I am still here. I am still here.",
    ] },
    lore_hs_2: { title: 'Dedication of the Everlantern', lines: [
      "HERE THE FIRST FLAME IS KEPT, STILL AND SAFE, FOREVER.",
      "(Beneath, in a vast and trembling hand, like the carvings on the Ashen Shore:)",
      "Forgive her. Forgive all of them. And when you are ready, little one, let it go.",
    ] },
  };

  // ---------------------------------------------------------------------------------------------
  // Chandler's Sparks: six memories in the Chandler's own voice. Each stands alone; in region
  // order (gw, mb, sf, dn, ch, mw) they tell its whole story.
  const sparks = {
    spark_gw: { title: 'The Finding', lines: [
      "Before the waxen, before the halls, there was only the dark, and me in it. Many hands, and nothing to hold.",
      "Then, at the bottom of everything, a light. Small. Alive. It did not burn me. It warmed the stone around it soft.",
      "I cupped every hand I had around it. I have never held anything so gently since.",
    ] },
    spark_mb: { title: 'The First Pouring', lines: [
      "The warmth pooled around the Flame and became wax. Mother Wax, I named it, for what it would become.",
      "I poured a small shape. I gave it a wick. I touched it to the Flame. It opened its eyes, and looked at me, and laughed.",
      "I poured a thousand more. They made flowers out of wax, to show me that they could make things too.",
    ] },
    spark_sf: { title: 'The First Guttering', lines: [
      "The first to gutter was a sweep from the chimneys. Her wax ran out on a quiet evening. Her flame lifted, and went down.",
      "I wept, the way wax weeps. I thought I had made something that could be lost.",
      "Then the Flame stirred. New wax pooled warm. I poured a new small shape, and it had something of her in its laugh.",
      "Burn, gutter, return, pour. Not a loss. A breath. Out, and in.",
    ] },
    spark_dn: { title: 'The Brightest', lines: [
      "Lucerne I poured from the finest wax, and lit at the very heart of the Flame. She shone so. They made her their Queen.",
      "When the first candle of her crown burned low, she came to me shaking. Stop it, she said. Let no one ever go down.",
      "I told her the truth. Every light gutters; that is how it is passed on. She looked at me as though I had struck her.",
      "She did not come to me again. She went to my apprentice instead.",
    ] },
    spark_ch: { title: 'The Caging', lines: [
      "They built it with hands I had taught. Glass and gold, around the Flame. I felt it close like a fist around my heart.",
      "Before the last bar was set, I hid my own flame deep inside me, where no cage could reach.",
      "Then the Returning stopped, and the warmth stopped, and my hands began to fall away, one by one.",
      "Wherever one fell, a little of my fire stayed with it, waiting in the dark to be found.",
    ] },
    spark_mw: { title: 'The Last Pouring', lines: [
      "I had one hand left. One drop of Mother Wax. One spark: my own.",
      "I poured you small, so you could slip through places I could not. I lit you blue, so your wax would never burn away.",
      "I carried you up through the dark to the ash, where the sky is. I laid you down, and carved the way for you in the stone.",
      "You will not gutter, little one. Not unless you choose to. I am sorry to give you that choice. It was the only gift I had left.",
    ] },
  };

  // ---------------------------------------------------------------------------------------------
  const abilities = {
    bolt: {
      name: 'Ember Bolt',
      desc: 'Hurl a bolt of blue fire that passes through every foe in its path.',
      how: 'Tap {spell} to cast. Costs 33 Ember. Strike foes with the Brand to gather Ember.',
    },
    dash: {
      name: 'Flare Dash',
      desc: 'A sudden burst of blue flame carries you swiftly forward.',
      how: 'Press {dash} to dash, on the ground or once in the air.',
    },
    grip: {
      name: 'Wax Grip',
      desc: 'Soft wax clings to rough stone. Walls become roads.',
      how: 'Leap against a wall to cling and slide. Press {jump} to kick off. Smooth, glazed walls cannot be gripped.',
    },
    oilcloak: {
      name: 'Oilcloak',
      desc: 'An oiled cloak that sheds meltwater. Float where others would sink.',
      how: 'Enter meltwater to swim upon its surface. Press {jump} to leap out.',
    },
    plunge: {
      name: 'Molten Plunge',
      desc: 'Fall like a molten drop, shattering cracked floors and the foes beneath.',
      how: 'In the air, hold {down} and press {spell}. Costs 33 Ember.',
    },
    wings: {
      name: 'Smokewing',
      desc: 'Wings of smoke unfurl for a single beat.',
      how: 'Press {jump} again while in the air to leap once more.',
    },
  };

  // ---------------------------------------------------------------------------------------------
  const items = {
    heartwax: {
      name: 'Heartwax Shard',
      desc: 'A sliver of wax that remembers a heartbeat. Two shards fuse into a new candle of health.',
      whole: 'The shards fuse into a new candle. Your health grows by one.',
    },
    urn: {
      name: 'Ember Urn',
      desc: 'A small clay urn, warm to the touch. Your Ember Well holds 33 more Ember.',
    },
    kiln_glass: {
      name: 'Kiln Glass',
      desc: 'Glass fired in the old forges. It rings when struck. Bramm the Wickwright can temper your Brand with it.',
    },
    notch: {
      name: 'Wax Notch',
      desc: 'A soft groove worn into the wick, where one more Sigil may rest. You gain one notch.',
    },
    spark: {
      name: "Chandler's Spark",
      desc: 'A mote of old blue fire, heavy with memory. Your flame leans toward it, as toward home.',
    },
    seal_bell: {
      name: 'Seal of the Bell',
      desc: "Abbot Tallowmere's flame, pressed into silver. One of three that hold shut the way to the Heart.",
    },
    seal_kiln: {
      name: 'Seal of the Forge',
      desc: "The Kiln Mother's flame, pressed into iron. One of three that hold shut the way to the Heart.",
    },
    seal_wing: {
      name: 'Seal of the Wing',
      desc: "Duchess Vespertine's flame, pressed into pale silk-wax. One of three that hold shut the way to the Heart.",
    },
    chart: {
      name: 'Chart',
      desc: "One of Quill's charts. Reveals the shape of a region on your map, even where you have not walked.",
    },
    // Extensions (not in TECH_SPEC §15): currency and the Brand's names by upgrade level.
    cinders: {
      name: 'Cinders',
      desc: 'Ash with a little warmth left in it. The waxen trade them still.',
    },
    brand: {
      name: 'The Brand',
      desc: 'A slim rod of dark iron, its tip forever hot.',
      levels: [
        { name: 'Plain Brand', desc: 'Dark iron with a hot tip. It will do, for now.' },
        { name: 'Tempered Brand', desc: 'Reforged by Bramm the Wickwright. It strikes harder.' },
        { name: 'Glass-Edged Brand', desc: 'Its tip is sheathed in Kiln Glass, and rings with every strike.' },
        { name: 'Heartforged Brand', desc: "Bramm's finest work. It hums with heat, eager to strike." },
      ],
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Sigils (DESIGN §3.5): flavor, then the exact effect. Costs live in G.Items.sigils.
  const sigils = {
    swift_brand: {
      name: 'Quickwick',
      desc: 'A wick trimmed short, eager to burn. Your Brand recovers 30% faster between strikes.',
    },
    long_brand: {
      name: 'Longbrand',
      desc: "Wren's old companion. It always reached a little further than she did. Your Brand reaches 35% further.",
    },
    heartwax: {
      name: 'Stubborn Heartwax',
      desc: 'A knot of wax that will not melt. While worn, you have one more candle of health.',
    },
    kindle_haste: {
      name: 'Hastened Kindling',
      desc: 'Dry tinder, quick to catch. Kindling takes 40% less time.',
    },
    ember_thirst: {
      name: 'Ember Thirst',
      desc: 'A hungry little flame. Each Brand strike that lands draws 6 more Ember.',
    },
    cinder_lure: {
      name: 'Cinder Lure',
      desc: 'A warm stone that calls to ash. Loose Cinders drift to you from afar.',
    },
    smolder_shell: {
      name: 'Smoldering Shell',
      desc: 'A crust of hardened wax. After you are hurt, you stay protected 60% longer.',
    },
    flare_trail: {
      name: 'Flare Trail',
      desc: 'Your Flare Dash leaves blue fire in its wake, burning foes for 8 damage every quarter second.',
    },
    bright_bolt: {
      name: 'White-hot Core',
      desc: 'A flame burned past blue into white. Your spells deal 50% more damage.',
    },
    thorned_wax: {
      name: 'Thorned Wax',
      desc: 'Wax that bristles when pressed. When you are hurt, it bursts outward, dealing 12 damage to foes nearby.',
    },
    steadfast: {
      name: 'Steadfast Wick',
      desc: 'A wick that will not bend. Your strikes no longer push you back, and blows no longer knock you away.',
    },
    waymoth: {
      name: 'Waymoth',
      desc: 'A tiny moth that flutters toward forgotten things. Marks unclaimed relics on your map, wherever you have walked or charted.',
    },
    last_light: {
      name: 'Last Light',
      desc: 'The fiercest flame is the one nearly out. With a single candle of health left, your Brand deals 75% more damage.',
    },
    deep_kindle: {
      name: 'Deep Kindle',
      desc: 'Slow, patient warmth. Kindling restores 2 health instead of 1, but takes 65% longer.',
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Bosses (DESIGN §5.3). `intro`: spoken as the fight begins. Extensions: `phase2` (Lucerne),
  // `defeat`: last words on defeat. Sable's yield after duel 2 is npcs.sable_2.
  const bosses = {
    effigy: { name: 'The Effigy', sub: 'Husk of the Old Guard' },
    sable1: {
      name: 'Sable',
      sub: 'the Unlit',
      intro: [
        "Turn back, blue-flame. Below here is only cold.",
        "No? Then show me you can stand.",
      ],
      defeat: [
        "...Enough. You can stand.",
        "We will meet again, further down. Be stronger then.",
      ],
    },
    matron: { name: 'The Soot Matron', sub: 'Brood-Mother of the Flue' },
    tallowmere: {
      name: 'Abbot Tallowmere',
      sub: 'Warden of the Bell',
      intro: [
        "Hush, child. Hush. Why are you awake?",
        "Let the bell hold you. Sleep is kinder than waking.",
      ],
      defeat: [
        "The bell... is quiet. Oh. Oh, they will wake now.",
        "They will remember what they are. Forgive me. I only wanted them to rest.",
      ],
    },
    kilnmother: {
      name: 'The Kiln Mother',
      sub: 'Warden of the Forge',
      intro: [
        "Another shape for the mold? No... You have a wick. You have a flame.",
        "Who poured you? WHO POURED YOU?",
      ],
      defeat: [
        "Master... it was you. Only you ever could.",
        "Let the kiln go cold. I am so tired of pouring.",
      ],
    },
    vespertine: {
      name: 'Duchess Vespertine',
      sub: 'Warden of the Wing',
      intro: [
        "You have come to put out her light.",
        "I have guarded it since before your wax was warm. I will not let it fade.",
      ],
      defeat: [
        "Her light... it was warm, once. So warm.",
        "I remember now. It was the warmth I loved.",
      ],
    },
    sable2: {
      name: 'Sable',
      sub: 'Last Guard of the Heart',
      intro: [
        "So. You came all the way down. You truly mean to open it.",
        "Then prove it. Once more, and hold nothing back. I will not.",
      ],
    },
    lucerne: {
      name: 'Lucerne',
      sub: 'the Everlantern',
      intro: [
        "Kneel, little ember. You stand in the light of the Lamplight Queen.",
        "...Blue. I know that color. The Maker's own.",
        "Have you come to take my light? Everything I did, I did so that no one would ever go dark again.",
      ],
      phase2: [
        "No. No! I will not go out. Not like them. Not into the cold!",
        "Then I will keep you too. I will keep all of you, forever!",
      ],
      defeat: [
        "It is so bright... and I am so cold.",
        "Maker... I was only afraid.",
      ],
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Endings (DESIGN §2.3). `scenes` (extension): one illustration hint per page, from the
  // vocabulary documented in docs/api/text.md.
  const endings = {
    undying: {
      title: 'The Undying Light',
      pages: [
        "Lucerne falls. Her crown of candles burns on, unwavering, as though nothing has changed.",
        "Within the Everlantern, the First Flame hangs perfectly still. It does not flicker. It cannot.",
        "You reach for the cage. Your blue flame strains against the gold... but it is not whole. Too much of it lies scattered far above.",
        "The glass is warm where you touch it, and nowhere else. The bars draw you in, gently, the way light draws a moth.",
        "Your flame passes into the lantern. It does not hurt. It does not end. It will never end.",
        "Above, the Snuffed walk on in the dark. By a frozen lake, a small pale flame goes out, and does not go home.",
        "At the gate, Sable keeps her watch, a new blue glow upon her face.",
        "And the light did not end. Nor did it shine.",
      ],
      scenes: ['crown', 'cage', 'reach', 'cage', 'flame', 'lake', 'gate', 'dark'],
    },
    gutterlight: {
      title: 'Gutterlight',
      pages: [
        "Lucerne falls. In the hush, the six sparks you carried find one another, and become one fire.",
        'And the voice you heard in every spark speaks one last time: "Little one. You found me. All of me."',
        '"I gave you a flame that would not gutter, so that you could reach this place. Now it is yours to give. Let it go home."',
        "You let go. Your flame flares white, and the Everlantern shatters like frost on a window.",
        "The First Flame roars free. Across Tallowdeep the Snuffed fall still at last; their Pall rises as sparks, and the sparks flow home.",
        "By a frozen lake, a small pale flame lifts and follows them. At the gate, one spark finds a black wick, and Sable burns.",
        "The kingdom burns down to its wicks. In the warm ash, many hands pour new wax. A small new light flickers.",
        "Every light gutters. That is how it is passed on.",
      ],
      scenes: ['sparks', 'hands', 'hands', 'shatter', 'sparks', 'gate', 'ash', 'flame'],
    },
  };

  // Credits roll: one entry per line; '' is a blank spacer line.
  const credits = [
    'GUTTERLIGHT',
    '',
    'A tale of Tallowdeep, the kingdom of living wax',
    '',
    'Made entirely in code — every image, note and sound generated at runtime',
    'No image files, no recordings, no font files: only code, and a little light.',
    '',
    'Characters',
    'The Wickling, a small blue flame',
    'Old Thrum, keeper of the Last Brazier',
    'Pell, who carried everything',
    'Quill, who drew the edges',
    'Bramm the Wickwright',
    'Wren, who went further than anyone',
    'Sable, the Unlit',
    'Abbot Tallowmere, Warden of the Bell',
    'The Kiln Mother, Warden of the Forge',
    'Duchess Vespertine, Warden of the Wing',
    'Lucerne, the Lamplight Queen',
    'and the Chandler, whose many hands made everything',
    '',
    'Thank you for playing.',
    '',
    'Every light gutters. That is how it is passed on.',
  ];

  // ---------------------------------------------------------------------------------------------
  // Shop dialogue. Bramm extras: `noGlass`, `maxed`, `offer[i]` (pitch for upgrade to level i+1),
  // `upgrade[i]` (said after upgrading to level i+1). All shops: optional `farewell`.
  const shops = {
    pell: {
      greet: "Wares for the wandering! Light prices, heavy goods.",
      bought: "Sold! May it serve you brighter than it served my pack.",
      poor: "Ah, a few cinders short. A dim prospect, that.",
      empty: "Picked clean! You've bought me down to the wick.",
      farewell: "Mind the dark, now. And come back heavier in the purse!",
    },
    quill: {
      greet: "Hm-hm... Charts, charts. Which edge of the world will you have?",
      bought: "There. Mind the ink, it's still wet.",
      poor: "Ink isn't free, I'm afraid. Not even mine.",
      empty: "That's all of them. Every line I ever walked, and now they're yours.",
      farewell: "Hm-hmm... Come back and tell me where the lines go.",
    },
    bramm: {
      greet: "Brand on the anvil. Let's see what can be done.",
      bought: "Done. Feel the weight of it.",
      poor: "Not enough cinders. Good work isn't cheap.",
      noGlass: "Need Kiln Glass for this. The old forges had plenty. Bring me some.",
      empty: "Nothing left to do to it. That Brand's the best thing I've made.",
      maxed: "That Brand is finished. There's nothing more these hands can teach it.",
      farewell: "Go on. Use it well.",
      offer: [
        "Temper the Brand. It will strike harder.",
        "Edge the Brand in Kiln Glass. It will strike harder still.",
        "Forge the Brand in the heart of my fire. The finest I can make.",
      ],
      upgrade: [
        "There. Tempered, and true. It'll bite deeper now.",
        "Kiln Glass in the edge. Hear it ring? That's what a Brand should sound like.",
        "...There. Best thing these hands ever made. Go and make it count.",
      ],
    },
  };

  // ---------------------------------------------------------------------------------------------
  // Menus, prompts and system strings. {n} {used} {total} {price} {glass} {region} are
  // placeholders for G.Text.fmt(); input tokens ({jump} etc.) appear only in controlTips.
  const ui = {
    // Title & common
    gameTitle: 'GUTTERLIGHT',
    tagline: 'Every light gutters.',
    pressAny: 'Press any key',
    loading: 'Kindling...',
    start: 'Start',
    newGame: 'New Game',
    continue: 'Continue',
    options: 'Options',
    controls: 'Controls',
    credits: 'Credits',
    back: 'Back',
    confirm: 'Confirm',
    cancel: 'Cancel',
    close: 'Close',
    next: 'Next',
    yes: 'Yes',
    no: 'No',

    // Save slots
    chooseSlot: 'Choose a Flame',
    slot: 'Slot {n}',
    slotEmpty: 'Empty',
    slotNew: 'New Journey',
    slotComplete: 'Journey Complete',
    slotUnreadable: 'This save could not be read.',
    erase: 'Erase',
    eraseConfirm: 'Erase this journey forever? It cannot be rekindled.',
    playTime: 'Play Time',
    completion: 'Completion',

    // Pause & options
    paused: 'Paused',
    resume: 'Resume',
    quitToTitle: 'Quit to Title',
    quitConfirm: 'Return to the title? Your progress is kept. You will wake at the last Sconce you rested at.',
    masterVolume: 'Master Volume',
    musicVolume: 'Music Volume',
    sfxVolume: 'Sound Volume',
    ambienceVolume: 'Ambience Volume',
    screenShake: 'Screen Shake',
    controlHints: 'Show Control Hints',
    fullscreen: 'Fullscreen',
    on: 'On',
    off: 'Off',
    // Labels keyed exactly like G.settings (src/core/save.js), for generic options screens.
    settings: {
      masterVolume: 'Master Volume',
      musicVolume: 'Music Volume',
      sfxVolume: 'Sound Volume',
      ambienceVolume: 'Ambience Volume',
      shake: 'Screen Shake',
      hints: 'Show Control Hints',
    },

    // Controls screen
    keyboard: 'Keyboard',
    gamepad: 'Gamepad',
    adjust: 'Adjust',     // options screen hint (left/right)
    zoom: 'Zoom',         // map screen hint
    zoomOut: 'Zoom Out',  // map screen hint
    recenter: 'Recenter', // map screen hint (back to your position)
    damage: 'damage',     // Brand damage suffix (inventory, Bramm's shop, item card): '9 damage'
    actions: {
      move: 'Move',
      left: 'Move Left',
      right: 'Move Right',
      up: 'Aim Up / Interact',
      down: 'Aim Down',
      jump: 'Jump',
      attack: 'Attack',
      dash: 'Flare Dash',
      spell: 'Spell / Kindle',
      interact: 'Interact',
      map: 'Map',
      inventory: 'Inventory',
      pause: 'Pause',
      confirm: 'Confirm',
      cancel: 'Back',
    },
    controlTips: [
      'Hold {up} as you attack to strike upward.',
      'In the air, hold {down} as you attack to strike below you and spring off foes and thorns.',
      'Stand still and hold {spell} to Kindle: spend Ember to mend your wax.',
      'Hold {down} and press {jump} to drop through thin ledges.',
      'Press {up} to rest, read, talk or travel when a prompt appears.',
    ],

    // World prompts (interactable promptText)
    prompts: {
      rest: 'Rest',
      read: 'Read',
      talk: 'Talk',
      listen: 'Listen',
      travel: 'Travel',
      take: 'Take',
      examine: 'Examine',
      light: 'Light',
      open: 'Open',
      shop: 'Shop',
    },

    // Toasts & world messages
    saved: 'Progress saved',
    saveFailed: 'Saving failed. Recent progress may be lost.',
    saveUnavailable: 'Saving is unavailable. Progress will not be kept.',
    saveConflict: 'This save was changed in another window. Return to the title.', // game.saveNow: another tab wrote this slot
    sconceLit: 'Sconce lit',
    rested: 'Rested. Your flames burn whole again.',
    lanternwayLit: 'Lanternway post lit',
    gateOpened: 'Somewhere, a gate grinds open.',
    gateLocked: 'Barred fast. It will not open from this side.',
    sealDoorLocked: 'Three empty sockets wait in the door: Bell, Forge and Wing. It will not open for fewer.',
    sealDoorOpen: 'The three Warden flames kindle in their sockets. The door yields.',
    sealDoorCount: 'Warden Seals: {n} / 3',
    wispReclaimed: 'Cinders reclaimed',
    wispHint: 'Where you fell, your Gutterwisp lingers with your Cinders. Strike it to take them back.',
    noEmber: 'Not enough Ember',

    // Lanternway menu
    lanternway: 'Lanternway',
    lanternwayChoose: 'Where shall the light carry you?',
    lanternwayHere: 'You are here',
    lanternwayUnlit: 'Unlit',
    lanternwayDanger: 'The lantern will not open while danger is near.',

    // Map
    map: 'Map',
    mapUncharted: 'Uncharted',
    mapEmpty: 'You have not yet walked or charted this place.',
    mapPan: 'Pan',
    mapLegend: {
      you: 'You',
      sconce: 'Sconce',
      lanternway: 'Lanternway',
      shop: 'Merchant',
      npc: 'Traveler',
      relic: 'Unclaimed Relic',
      wisp: 'Gutterwisp',
      door: 'Seal Door',
    },

    // Inventory
    inventory: 'Inventory',
    abilities: 'Abilities',
    relics: 'Relics',
    sigils: 'Sigils',
    notches: 'Notches',
    notchesUsed: 'Notches: {used} / {total}',
    restToEquip: 'Rest at a Sconce to change Sigils',
    equip: 'Equip',
    unequip: 'Remove',
    equipped: 'Equipped',
    notEnoughNotches: 'Not enough Notches',
    health: 'Health',
    ember: 'Ember',
    cinders: 'Cinders',
    brand: 'Brand',
    heartShards: 'Heartwax Shards',
    urns: 'Ember Urns',
    kilnGlass: 'Kiln Glass',
    sparks: "Chandler's Sparks",
    seals: 'Warden Seals',
    unknown: '???',
    notFound: 'Not yet found',

    // Shops
    buy: 'Buy',
    sold: 'Sold',
    owned: 'Owned',
    price: 'Price',
    leave: 'Leave',
    priceCinders: '{price} Cinders',
    priceGlass: '{glass} Kiln Glass',
    chartOf: 'Chart: {region}',
    temper: 'Temper the Brand',

    // Cards & ending
    acquired: 'Acquired',
    theEnd: 'The End',
    skip: 'Skip',
  };

  G.Text = { intro, areas, npcs, lore, sparks, abilities, items, sigils, bosses, endings, credits, shops, ui };

  // fmt('Slot {n}', { n: 2 }) -> 'Slot 2'. Placeholders without a value (e.g. input tokens such
  // as {jump}) are left intact for the UI's token replacement. Non-enumerable: G.Text stays data.
  Object.defineProperty(G.Text, 'fmt', {
    enumerable: false,
    writable: true,       // others may safely reassign or wrap it (strict mode would throw otherwise)
    configurable: true,
    value: function fmt(str, vars) {
      if (typeof str !== 'string' || !vars) return str;
      return str.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m));
    },
  });
})();
