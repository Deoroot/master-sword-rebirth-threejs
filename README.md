# Master Sword: Rebirth — Gate City in Three.js

<https://github.com/Deoroot/master-sword-rebirth-threejs> · `v0.1.0-alpha`

An **unofficial fan port** of Gate City from *Master Sword: Rebirth* to the browser.
Three.js and Rapier, no engine in between. You walk the real `gatecity.bsp`, with its
baked lightmap, its 69 NPCs, its combat, its inventory and a multiplayer server.

> **This repository ships no game content.** Not one texture, not one model, not one
> sound — there is not a single binary file in it, and [a test enforces
> that](test/procedencia.test.mjs). What is here is a *reader* and a *game*. The map,
> the models, the sounds and the scripts are read from a Master Sword installation
> that sits next to it.

Not affiliated with, endorsed by, or supported by the Master Sword: Rebirth team.
All game content is theirs; see [CREDITOS.md](CREDITOS.md).

---

## What actually works

| | |
| --- | --- |
| **The map** | `gatecity.bsp` read directly: BSP30 tree, WAD textures, the baked lightmap with its gamma ramp, animated light styles, detail textures, the sky |
| **Movement** | Master Sword's own numbers — its acceleration, its friction, its `m_StepSize`, its dodge, its fall damage |
| **Combat** | swing arc and charge, parry, shields with their cone, bows and arrow ballistics, criticals, the damage-and-resistance tables |
| **The NPCs** | model, skin and animation from the `.mdl`; `npcatk_hunt`, wandering, hit reaction, monster parry, corpses that fade over 3.64 s — all simulated **on the server**. The map holds 69 monster entities but only **31 are NPCs standing there**: the other 38 are spawn templates, which the engine deletes on load and whose `msarea_monsterspawn` puts a monster in the world 3 seconds in, then puts it back when you kill it — 16 of them forever |
| **The character** | attributes, the six skill schools, experience, levels, inventory, weight, gold, quickslots, saving |
| **Dying and levelling** | both as the engine stages them. Death: the centre print all players see (`<name> has fallen!` — there is no «You died» in this game), the half-red screen fade, the gendered scream the *script* plays (`DeathSound()` itself is empty), the third-person camera 70 units to your right looking back, and your corpse — which stands up, because `CreateCorpse` copies your last sequence and the death animation is commented out. Levelling: the write-out caption sent twice, as the engine sends it, the two console messages, the sound, and 160 additive flares rising out of the ground around you for four seconds |
| **Multiplayer** | a Node WebSocket server, 100 Hz ticks, delta snapshots, `ex_interp` interpolation, lag compensation with rewind — and **on either map**: two browsers walk Edana together, 21 of 21 controls, which took finding that the network had only ever been measured on the default map. Picking any other one dropped you out of the game in silence, because the reload that changes map replaced the whole query string and took `red=` with it; and the server has sent its own map name since experiment 47 while the client only logged it, so a mismatch left you walking a different world with everyone else's figures placed in it. The client now does what the engine does — disconnect, reload on the server's map, reconnect. See [doc/CHAT_61.md](doc/CHAT_61.md) |
| **Talking to each other** | the chat, and it is **three channels and not three colours**: `y` shouts (`[global] Ana: hi`), `u` speaks (`Ana says,  "hi"` — with the mod's own two spaces), `j` addresses your party, exactly as `config.cfg` binds them. The server builds the sentence and decides who hears it, so nobody can speak under another name; local carries 300 units measured **in 2D**, so someone three floors straight up hears you whisper. It lands in the game's own chat console — same class as the event console, other cvars, left of screen, shrinking to the widest line it shows |
| **Shopping together** | the NPC scripts run **on the server**, as they do in the mod: the F menu, the shelf and the consequences are built there and the browser only draws them, so two people share one vendor instead of each getting a private copy. The original's answer to two customers is not a shared counter, it is **a queue of one** — `MONSTER_TRADING`, with the second getting `_busy` — and the deal does not end when you close the panel, it ends when you **walk 128 units away**, in 3D this time. Measured with two browsers against a real server, 14 of 14: Ana buys, her gold drops by the price the server set, the knife lands in her pack, Beto is locked out while she trades, gets in the moment she leaves, and sees the stock she lowered. Getting there found three faults in a row, all of them *between* tested parts — see [doc/TIENDA_62.md](doc/TIENDA_62.md) and [doc/TIENDA_63.md](doc/TIENDA_63.md) |
| **The player has a script too** | in Master Sword the player is a scripted entity like any goblin — 27 files and 9,566 lines hanging off `player/player.script` — and this port ran the NPCs' scripts and none of the player's. Now it runs the ones that fit — **9 of 25 files, and 253 of its 541 events, 47%**, both counted by `npm run jugador`: the game's own first-time tips, so dying once shows Thothie's «You have DIED! When you die you lose 5% of your gold!» in the help window **and never again for that character**, and regeneration, which ticks 1 hp every 12 seconds with nobody calling it — because `repeatdelay` is resolved by the script *loader*, not the interpreter, so an event with one starts itself the moment the file is read. That also means the first tick lands immediately, since the delay names a variable that does not exist yet at load time. See [doc/JUGADOR_64.md](doc/JUGADOR_64.md) | Since experiment 65 the script also **answers what you do**: parrying prints the game's own «You parry the attack! ( 31 vs. 12 )» with the real rolls — the string this port used to show was written here, not by Master Sword — experience prints «* 25 XP Awarded», and landing hard **dips the camera**, because the script has no «move the camera» command: it writes `game.cleffect.view_ofs.z` and the client adds it to the view every frame (hudscript.cpp:208-221). The dip fades by itself, since nothing has to cancel a variable. See [doc/JUGADOR_65.md](doc/JUGADOR_65.md) |
| **Items run their scripts, and that is what affects you** | almost everything that happens to the player is done by an item they carry, through one line: `callexternal ent_owner <event>` (`items/item_ring_percept.script:33-36`). The player's script has **63 events only an item can call** and 23 of them run whole — and this port called **none** of them, because the `callexternal` hook was a no-op in both environments. Now items are scripted entities with the engine's own lifecycle (`game_spawn`, `game_deploy`, `game_wear` — which carries *who called it*, `playershared.cpp:1524-1544`), and the Rejuvenation spell heals you just by being in your pack: two `repeatdelay` loops nobody calls, `divination × 0.1 + 4` hp every half second. Measured in a real browser: **1 → 15 hp in six seconds** with the spell, 1 → 1 without. Along the way the script **loader** turned out to hoist every `#include` to the top while its own comment said otherwise; since `const` keeps the *first* value it sees, every entity was taking its template's numbers — **2,623 of them across 593 of the 760 items**, which is why the goblin died silently and **61 of the 63 scrolls in the game taught Fire Dart**. Nothing was red. See [doc/OBJETOS_66.md](doc/OBJETOS_66.md) |
| **The interface** | the HUD, the event console, the main menu, and all four character panels — create a character, inventory, Character Info and the NPC interaction menu — ported from the game's own VGUI widgets and text schemes. The inventory has the real gear column (your hands and the four containers a new character is given) and the game's Tiled / Small / Descriptions views; the F menu on yourself offers the six options the player script registers, and drops to three while you are sitting |
| **Starting a game** | the game opens where the game opens: at the main menu. «Establish a Kingdom» brings up Valve's own Create Server window with its two tabs and its cvars — two of its thirteen rows reach the game, the map you pick and fullscreen, and the other eleven are off for one shared reason rather than eleven: here «Start» opens a game inside the tab, it does not launch a server, and every one of those rows is a server cvar; «Visit a Kingdom» opens Valve's server browser, which here finds the local `npm run servidor` in its **Lan** tab — there is no Steam master server behind the other five. `?map=<map>` skips straight in, which is what `hl.exe +map` does — the name is validated against GoldSrc's own `[a-z0-9_]`, because it becomes a path |
| **Settings** | Valve's own Options dialog, and nine of its thirty controls reach the game: mouse sensitivity, filtering and inversion use the mod's own formula (`sensitivity × m_yaw`, not a constant), sound and music are two separate gains as in the engine, the player name is what the character screen proposes, and brightness and gamma rebuild the 25 lightmap atlases — which is the one thing `R_GammaChanged` does. The other twenty-one are shown disabled and each says why |
| **Where you have landed** | the map introduces itself the way the game does it — its name and description ten seconds after you spawn, and three seconds later the level band it was built for. Gate City declares itself `Levels 10-25 / 100-400hp`, and below 100 max HP it also tells you the place is above your level. Both strings come from the map's own `map_startup.script`, which overrides what the `.bsp` says — see [doc/INTRO_42.md](doc/INTRO_42.md) |
| **More than one map** | nothing in the game points at Gate City by name any more: one module names the map, validates it and builds every path from it, and the extractor takes `--mapa`. **Edana bakes end to end and you can walk it** — 12 808 faces, 262 textures, 33 087 triangles, its sky and its brushes — which took correcting four extractor guards that were right to stop and wrong to be universal: lightmap blocks may leave a run of zero padding the engine never reads, a brush entity may hold ten brushes and not one, a tree-walk control cannot be tuned to one map's floor count, and a triangle facing away from its normal may be a twinned double-sided sheet. **Edana is in the map list and you reach it through the menu**: 48 NPCs mounted of 48 baked (it was 42 until experiment 63 found the census filter dropping the whole `msnpc_` family — six of Edana's villagers, and none of Gate City's, which is why nobody saw it), all 22 of its scripts, its menus, and you spawn where the extractor decided. Getting there found the row that was recorded and never applied — the window said `edana` and the world loaded Gate City's 69 monsters — because with one ported map the right value and the resting value were the same string. See [doc/MAPA_47.md](doc/MAPA_47.md), [doc/EDANA_48.md](doc/EDANA_48.md) and [doc/EDANA_50.md](doc/EDANA_50.md) |
| **The map's wiring** | `target` and `targetname`: an entity naming another and using it, which is half of how a GoldSrc map is programmed. 39 wired entities in Gate City, 66 in Edana — triggers, relays, multi_managers, a multisource, changetargets, teleports, a push field. Walking into a trigger volume fires its chain on the engine's own rules: the hull the engine picks for your size, the `delay`, the `killtarget`, the master gate. **And in Gate City the whole chain lands on nothing**, which is the point: eleven firings reach nine monster-spawn areas and every one is discarded, because `ResetUse` returns early for an area that is already active and has no `resetwhen` — and none of Gate City's sixteen has one. Two of the mod's own bugs are ported with it, including a `SUB_UseTargets` whose condition is inverted so a `multisource` can never fire its target. See [doc/DISPARADORES_49.md](doc/DISPARADORES_49.md) |
| **Edana comes alive, and its wildlife bites** | the village had five gaps and four of them sat green on their resting value. **An entity's `scriptfile` beats its `defscriptfile`** (`msmonsterserver.cpp:415-416`) — the first branch is unconditional, so key order is irrelevant — and the extractor had it backwards: **3,373 creatures across 81 of the game's maps** were running their class's script instead of their own. In Edana that is five priests and the old man in the orchard showing up as «Commoner», the mayor's chest as any chest, and the boar boss as a 20-hp boar instead of the 60-hp «Huge Aggressive Wild Boar». In Gate City it is four rats that are **Cave Spiderlings**, and with four extra rats nobody looks: fifth time running that the second map is what shows the bug. **Then the boars turned out not to hurt you, and neither did Gate City's spiders**: an attack's damage is declared three different ways in Master Sword — `ATTACK_DAMAGE`, a `dodamage` whose damage is a constant named after the animation, and an `ATTACK_DAMAGE_LOW`/`_HIGH` pair — and the reader knew one. All three combat probes were green because they all measure against goblins and zombies. Four boars now take a fresh character from 15 hp to 0 in ten seconds. **And the map itself now switches on**: `game.serverside` went unresolved, which is *correct* for a variable that does not exist — except it usually sits behind the **old `if`**, the one without parentheses, which does not skip a line but **abandons the whole block**. In `game_player_putinworld` it is command 3 of 20 and the `callevent 1.0 activate_stuff` is command 17, so the event a Master Sword map is lit by died on its third line, in every game this port ever played; there are **280 of them** in the 2,884 scripts. With that, `usetrigger` (the one command that crosses from scripts into the `.bsp`) and the clone a `multi_manager` makes when it carries `SF_MULTIMAN_THREAD`, **Edana's tavern fills up**: eight cycles of its chain and its `ms_counter` down to zero, measured in a browser. Plus the village's **18 `ms_npcscript`**, which are its quests — the book, the cider, the mayor's evidence, and the old man who answers `trig_boarsdead` when you kill the boar boss. See [doc/EDANA_67.md](doc/EDANA_67.md) |
| **Edana's boar pen, in three waves** | a player remembered that Edana's boar boss showed up *after you killed a number of ordinary boars*, and the map agrees with more precision than the memory: **fifteen boars in three waves of five**, with `spawnchance 100` on all four cards, so there is no randomness in the boss at all. Two keys govern it and **both are named backwards**. `spawnstart 1` is `m_fSpawnOnTrigger = true` (`msmapents.cpp:827-844`) — it means «do *not* come out until somebody calls you», and directly above that line sit **four of Thothie's attempts to rename it, commented out one under the other, each labelled «fail»**; it also only holds back the *first* spawn, because the third clause is `lives == livesleft`. And `killtarget` on an `msmonster_*` **does not kill: it fires** (`msmonsterserver.cpp:2568-2569`), which is not the `killtarget` of `CBaseDelay` that removes entities — same key, opposite effect depending on which entity carries it. That one is how the boss tells the old man in the orchard the job is done. Three gaps had been sitting green: `perishtarget` was written down in `src/play/aparecer.js` as deliberately *not* ported because «none of Gate City's 38 spawn cards use it» — true, measured, still true, and the wrong conclusion the day a second map arrived; `fireallperish` only ever fed back into the spawner and never reached the map, which happened to be enough in Gate City because its one use points at another spawn area; and **`CMultiSource::Register` was missing entirely**, so a multisource's input list was `undefined` in every game ever played — which left its gate permanently *open* (an empty list means open) while its `Use` rejected every caller as a non-member, two holes covering for each other, with seven green tests from experiment 49 that wrote the input list by hand. **The boss still does not spawn, and now we know exactly why**, one step earlier than the previous experiment guessed: `wave3_1` and `wave3_2` both carry `delay 4`, and a delay is not served by whoever asked for it — `CBaseDelay::SUB_UseTargets` spawns a fresh entity called `"DelayedUse"` (`subs.cpp:252-269`) and *that* is what calls, so the multisource refuses it as unregistered. The mod warns about this by name in the first line of `CMultiSource::Use`: *«can't used multi_source with triggers that have a delay»*. The bug is ported, with its positive control beside it: called by hand the boss comes out with its 60 hp, and killing it reaches the old man. See [doc/OLEADAS_68.md](doc/OLEADAS_68.md) |
| **Haystacks that break, a button that is hit, and an apple that drops** | twenty `func_breakable` across the two maps — four haystacks in Edana, sixteen crates and rocks in Gate City — and **not one of them could be broken**: they were baked inside the world's collision trimesh, so they existed as a drawing and as an obstacle and not as something that breaks. Edana's four are a loop. All four are named `hay`; the one with 8 hp targets `sewer_door`, which is **two entities** (a `func_door` and a `trigger_relay`), and the door targets `hay` back — so you break one, the sewer opens, and the door smashes the other three. Not the one that opened it, because `CBreakable::Die` **clears its own targetname before firing** (`func_break.cpp:821-825`) with the mod's own comment beside it: *«Don't fire something that could fire myself»*. In Edana that is not a theoretical precaution: it is what makes the trick work, because all four share a name. And there is no floor under them — a ray five metres down finds nothing once they are gone: **the haystacks cover the mouth of the sewer shaft**. Three keys are misleading. **`health` on a `func_button` is not hit points**: `CBaseButton::TakeDamage` never touches `pev->health` in any of its 28 lines (`buttons.cpp:439-466`) — it is a flag meaning «this can be struck», so the apple button opens on one hit of any size while its `health 2` stays at 2. **`spawnstart` on an `msitem_spawn` means the opposite of what it sounds like** (`gispawn.cpp:94-98`), the same inverted name as the boar pen. And **`duration` is read by nobody**: `KeyValue` knows three keys and `duration` is not an `entvars_t` field, so the 90 000 and the 60 that two of Edana's four carry did nothing in the original game either. The material comment in the mod lies, too: it says «0:glass, 1:metal, 2:flesh, 3:wood» and the enum says otherwise (`func_break.h:24-35`), so `material 1` is **wood** — right for a haystack — and Gate City's rat-baby bags are **flesh**. Two gaps turned up that were not on the list: `env_render`, ported back in experiment 49, **had never reached anything**, because six of Edana's seven point at an `env_model` (the tavern's four soup bowls and the orchard's apple) and ornaments were baked without a name, 0 of 46 — Gate City has zero `env_render`, which is why nobody saw it. And four kinds of bus output were **falling through** an empty `case` label into the NPC-scene handler, and being counted under its name. See [doc/ROMPIBLES_69.md](doc/ROMPIBLES_69.md) |
| **Sliding doors, and the loop closing** | `func_door`: three in Edana, zero in Gate City. Experiment 69 left the haystack loop one piece short, and this is the piece — break the 8 hp haystack and the sewer hatch slides 126 units open, and **on arriving** (`DoorHitTop`, `doors.cpp:673`, not on starting) it smashes the other three. The travel is not a key on the entity: a linear door moves into itself, `size − 2 − lip` (`doors.cpp:300`), and the −2 is Valve's own, because the engine expands bounding boxes by one unit per side. The three were **not baked into the world's collision mesh** the way the rotating doors and the breakables were: that mesh is model 0 plus `func_wall`, and a `func_door` was never in it, so the sewer hatch was a 4-unit sheet that was **only drawn** — you walked through it. What they gain here is the collider they never had. And porting the new class showed the old one was wrong: **a `targetname` already stops a door opening on touch**, not just `SF_DOOR_USE_ONLY` (`doors.cpp:531-538`), so Edana's two `door2` leaves — the mayor's house — had been swinging open on approach since experiment 48, which left the two `trigger_changetarget` that govern them as decoration. Five of seven in Edana and nine of nine in Gate City gave the right answer with the rule wrong. See [doc/PUERTAS_70.md](doc/PUERTAS_70.md) |
| **Things on the ground, and picking them up** | until now this port had **not one item lying on the ground**, in either map: experiment 69 ported the spawner and 70 closed the chain that fires it, and both ended at the same line — a counter saying «an apple would appear here». Now you hit the apple on Edana's apple tree, it falls three and a half metres, **lies flat** (`FallThink` zeroes pitch and roll and keeps the yaw), makes a noise, stays for 120 seconds and goes into your pack with the `x` key. Nobody tells it to fall: `CGenericItem::Spawn` sets `GI_JUSTSPAWNED` and asks to think in 0.1 s, and that think calls `Fall()`, which calls `FallInit()` **if the item has no owner** (`genericitem.cpp:1616-1628`) — so the spawner path and the dropped path are the same path. `FallInit` makes it **point-sized** on purpose, with Valve's comment beside it: *«pointsize until it lands on the ground»*. The submodel for lying on the ground **is not a formula**: an object `.mdl` carries three submodels per thing — right hand, left hand, floor — and the number is computed by each script's own `game_fall`, with a different sum per family. `health_apple` **overrides** its base's `+2` with `+1`, so the `+2` that `tools/armas.mjs` has had written since experiment 23 turns the apple into submodel 3 of `p_misc.mdl`, which is called `oldbook_rhand`: an apple that becomes an old book on the way down, with no error anywhere. 38 of the catalogue's 174 weapons do not match the `+2` either. Picking up is `GetAnyItems` (`player.cpp:5080`), and its reach is not the 64 units it looks like: `FindEntityInSphere` measures against the item's **box**, not its origin (`pr_cmds.cpp:871-882`), and that box is `origin ± 24` (`weapons.cpp:345-349`) — so 88 units horizontally. The cone is **2D**, «making the view cone infinitely tall», which is what lets you look down at what you are picking up, and the player's `m_flFieldOfView` is **0.5, not 0.1**: both are assigned inside `CBasePlayer::Spawn` and the later one wins. One bug is ported with the port: `ItemCount = 1;` sits bare at `player.cpp:5199`, right before `if (ItemCount == 1)`, so the engine's «Gather items» menu is unreachable and two things at your feet get you one. See [doc/SUELO_71.md](doc/SUELO_71.md) |
| **One quest** | the Gate City mayor's. His menu options come from *running* his `.script`, and handing him the goblin chief's head really does take it out of your pack and pay you. Quest state saves with the character |
| **The villagers hear you** | Edana's quests are not answered by pressing a button: they are answered by **saying a word**. `catchspeech` has been read off the scripts since experiment 43, stored, and tested — and **nothing ever fired it**, because the comment beside it said «this port has no text chat», which stopped being true in experiment 61 and nobody re-read the line. That is 208 phrase groups and 572 words across 21 of Edana's 27 scripts, silent. Now the F menu's **say** options make *the player* speak (`MOT_SAY` was printing your words under the NPC's name, msmonsterserver.cpp:2935-2937), the chat's local channel reaches them too, and everyone within 300 units — measured in 2D, the engine's own `Length2D` — gets `game_heardtext`, while whoever has a matching phrase runs it. The matcher is ported with its quirks: it compares by **substring**, so «apple» fires inside «apples»; its `Matched` loop compares a string with itself and so the real score is *word length / sentence length*; and the `break` keeps the **first** matching word of a group, so the order the designer typed them in decides who wins. Getting there found that **`atof` is not `Number`**: twenty-one scripts write `hp 700/700`, which C parses as 700 and JavaScript as `NaN`, and an NPC baked with no health is not in `Manada.vivos()` — the list `candidatosDeGolpe()` is built from — so **ten NPCs across the two towns could not be hit *or* talked to**, with no error anywhere. One of them was Edrin, the captain of the guard. See [doc/OIR_79.md](doc/OIR_79.md) |
| **A villager turns to face you** | `setmovedest` is how a Master Sword script moves an NPC, and its hook had been an empty function **since experiment 43** — four green tests that *built the hook by hand*, so no NPC in this port had ever moved because its own script said so. Counting the bake changed the job before a line was written: of Edana's **130 `setmovedest` calls, across 25 of its 27 scripts, 65 pass a proximity of 9999**. That is more than any distance in the map, so `SetMoveDest` takes its «am I close enough?» branch on the **first** think, sets the exact bearing to the target, calls `StopWalking()` and fires `game_reached_dest` (`msmonsterserver.cpp:1018-1029`). So `setmovedest <who> 9999` does not mean «walk to him»: it means **«turn to look at him and stop»**, and it is how a villager faces you when you speak. Half of the commonest use of the command is a turn, not a walk. The rest is ported with the parts that cannot be guessed: a destination is a point on the target's **skin**, not its centre (`EyePosition() + (myEye − hisEye).Normalize() * width/2`, `npcscript.cpp:1650-1662`); fleeing is **two** searches, twenty random bearings ±90° traced 200 units and then 359 degrees brute-forced at 128, with `dont_ignore_monsters` so another creature blocks the way, and if nothing is clear the creature **does not move at all**; and a literal `(x y z)` arrives in the `.bsp`'s axes, where height is Z, while this port's are Three's, where it is Y. Getting there found that **a creature's eye was 10 % too low in all four places that computed it**: `pev->view_ofs = Vector(0, 0, m_Height)` (`msmonsterserver.cpp:250`, three lines below the hull that experiment 80 fixed — the same function writes both with the same number), while the port used `height * 0.9`, which is **the player's** ratio (a 72-unit box with the eye at 64). It raised no error because `Length2D` discards height for anything that walks, but it moves the wander ray, both copies of `$cansee`, and the arrival distance for anything that flies. And one more, latent since experiment 77: because this port clamps the last step to the edge of the proximity circle, an NPC lands **exactly** on it, and the engine's `<=` between two floats is then a coin toss — measured across 1 900 distance/proximity pairs, **21.3 % fell on the «not yet» side**, leaving the NPC frozen with its walk animation on and `game_reached_dest` never fired, so a map scene waiting on it never ends. See [doc/MOVEDEST_81.md](doc/MOVEDEST_81.md) |
| **A quest three villagers pass between them** | ask Sylphiel the waitress for work and she sends you to Bryan the grocer; tell Bryan «cider» and **he tells her himself**, without you carrying anything. The whole chain is `callexternal` between NPCs, and none of it reached anyone: `llamarExterno` was the empty function experiment 66 found and fixed **in two of the three environments**, leaving the NPC one — 63 targeted calls across 27 scripts, plus 111 `all` and 82 `players`. Below it, **no NPC was in the name registry at all**, because `name_unique` is not a command in this port and `npc_spawn` never ran, so `$get_by_name(wench)` returned «0» in every game ever played. Below *that*, the long form of naming a block — `eventname` indented inside the braces — **was not implemented**: 570 declarations in 202 scripts, all indented, none working, and a nameless block is not inert but **runs in full when the NPC spawns** (`script.cpp:5198-5202`), so Sylphiel paid out the cider reward before you walked into the tavern. And the quest still could not start, because `$cansee(<target>,<range>)` was missing from the getters, and with the engine's **old-style `if`** a missing getter does not skip a line, it **abandons the block** — her `say_job` died on its first one. `$cansee` is ported with the four things that cannot be guessed: the range goes through `atof` and **absent means −1, no limit**; the distance is 3D and centre-to-centre, with the mod's own comment saying so (*«This is always going to use Length(), not Length2D()»*, `npcscript.cpp:1829`); the target's half-width is subtracted; and it **writes** — `StoreEntity(pSighted, ENT_LASTSEEN)` is what the next line's `setmovedest ent_lastseen 9999` then turns the villager toward. Its `ClosestTarget` also tightens inside the loop, so `ent_lastseen` ends up being the **nearest** thing seen rather than the last. See [doc/GUIONES_82.md](doc/GUIONES_82.md) |
| **A rat bites back** | reported from a real game: «the rats don't seem to be hitting back». They were not, and it was **two faults chained**, neither of them the damage — `const ATTACK_DAMAGE 0.4` is what the mod says, and a rat has 4 health. First, a rat **recoils rather than hates**: `vermin` declares `recelo human` in `races.script`, and wary is not «enemy» for the hunt loop (the engine limits that to four cases and wary is not one, `npcscript.cpp:1806`). The only way one ever attacks you is the struck branch, `if $get(ent_laststruck,relationship,ent_me) equals wary` → `npcatk_settarget … "struck_by_enemy"` (`base_npc_attack_new.script:1078-1083`), and that branch **was not ported** — so hitting a rat had no consequence at all. What hid it is that **the other branch of the same `if` was ported, studied and tested**: `npcatk_retaliate` has its delay written backwards in the mod, so `RETALIATE_CHANCE 75%` is dead data, and the note beside that correct analysis concluded «no monster changes target from being struck» — true of that branch, false of the `if` containing it. Second, and this is the one that was hard to see: `npcatk_hunt` compares `NPC_RANGE_TYPE`, which is `range`, and **`range` is not the distance between two points**. The engine subtracts half of both widths — `Length() - ((pMonster->m_Width + pMonsterMe->m_Width) / 2)`, `scriptcmds.cpp:1154`, with its own comment *«MIB JAN2010_20 - range check take model widths into account»* — because it measures between centres and the bodies get in each other's way. A player is measured at their **centre**, 36 units above their feet; a monster at its **feet**, because `UTIL_SetSize` puts its origin there (`msmonsterserver.cpp:244`); and two 32-unit boxes never bring their centres closer than 32. So `hypot(32, 36)` = **48.2** against a rat's `ATTACK_RANGE` of **48**: four tenths of a unit, forever, and not for want of reach but because of its own body. The engine makes the same addition again when it actually hurts you (`npcscript.cpp:1150-1154`). The player's own width is **0** — `m_Width` is only assigned by an NPC script's `width` (`npcscript.cpp:201`) — so only the creature's half counts. Experiment 80 put a control in front of this very rat and found three other faults; it missed this one because its harness stood the player at `[aU, 0, 0]`, **level with the rat's feet**, where the vertical term is zero and 32 < 48. See [doc/MORDISCO_82.md](doc/MORDISCO_82.md) |
| **NPCs stop flickering between animations** | reported by the user, who added «it doesn't happen in the original and I don't think it can be fixed here». It could, and the description was literal: **one frame was drawn with the model in its bind pose.** `aplicarAnimacion` switches clips with `stopAllAction()` followed by `reset().play()`, and a Three.js `AnimationMixer` left with no actions **restores the skeleton to its bind pose** — measured on Edana's weaponsmith, the signature of his first twelve bones jumps 0.469 when the actions stop, against 0.021 of normal motion between two frames. What puts it on screen is the loop order: `animar(dt)` runs `mixer.update(dt)` — which evaluates the *old* clip — and only then `refrescar()`, which is where the clip is swapped, so nothing re-evaluates the mixer before the frame is drawn. The fix is one line, `mixer.update(0)` after starting the new action, and it is what the engine does: `SetAnimation` sets `pev->frame = 0`, so what you see is frame 0 of the new sequence, not the unanimated model. GoldSrc does not blend between sequences either — the hard cut is faithful; the jump to the bind pose was not. Catching a one-frame artefact needed its own method: sampling the pose every `requestAnimationFrame` gave **99 samples in 14 seconds**, seven per second, far too coarse for a 16 ms glitch, so the probe instead asks for the change through the same call a script uses and reads the pose synchronously, right where the renderer would draw it. And the control has a trap that is measured and declared: with `idle1` it **cannot fail**, because that clip's frame 0 *is* the bind pose, distance 0.000000000 — so it is measured with `idle7`, 0.413 away. See [doc/PARPADEO_82.md](doc/PARPADEO_82.md) |
| **A boar drops its hide** | reported from a real game: «the boars don't drop boar pelts when they die». They did not, and the reason nobody had missed it is **where the rule lives**: the mod rolls the loot in `npc_post_spawn` — one second after the creature is **born** — and hands it over with `giveitem` (`base_monster_shared.script:228-250`); death only tips the inventory out, with `DropAllItems()` (`msmonsterserver.cpp:2614`). So there is no decision at all on the death path, which is where anyone would look. It also means a boar born without a hide never gains one, however many times you kill it. 46 scripts use `DROP_ITEM`, and nothing was baked in any of the three maps. Edana's five boars carry `skin_boar` at **20 %** and its boss carries `skin_boar_heavy` at **100 %**; Gate City's goblins carry a small axe at 10 %. Getting one onto the floor crossed three seams between green halves, the experiment-63 pattern three times over. `build/msr/suelo.json` held **13 objects** and no hides: the ground manifest is assembled from what the map plants and what the player starts with, and *what a creature drops* was not a source — while `Suelo.soltar` returns `null` in silence when it does not know a script, so «dropped nothing» and «dropped something we cannot draw» looked identical. The probe then went red with the work done right, because `probe.reaccion.pegarA` **re-implements the death path by hand** instead of walking it; killing the boss with 51 real sword blows fixed that. And the experiment-71 control «a dropped object lands on a `_floor` submodel» went red on the three hides, correctly: their template only computes the submodel inside `if ( MODEL_WORLD equals 'misc/p_misc.mdl' )` with **single quotes**, and a single quote does not group in this engine — `GetConst` returns the text quotes and all (`script.cpp:350-354`), `FStrEq` compares that, so the branch is false always and `setmodelbody 0 0` is the only one that runs, in the real game too. A dropped hide wears the apple's submodel in Master Sword. See [doc/BOTIN_82.md](doc/BOTIN_82.md) |
| **Your own interaction menu works** | reported from a real game: «I press F, click *Sit down (Rest)* and it says **That is not implemented yet** — and so does every other option in that menu. In the original you sat down and slowly recovered health, mana and energy». The menu that was dead is not any neighbour's: it is **yours**, the one the F key opens when the 72-unit cone in front of you is empty (`else pMonster = pPlayer`, `client.cpp:679-682`). And the fault was a seam: `pedir` had answered that case since experiment 60, returning the six options of `player/player_sv_menu.script:17-64`, while `elegido` twelve lines below **had no branch for it** — so with no NPC there was no script, and all six fell through to «this NPC has no ported script», a correct message for a case that was not this one. Both halves green, nothing looking at the join. Underneath were three more holes, each one from this project's own catalogue. `opcionesDelJugador(personaje, estado)` had carried `estado` in its signature since experiment 60 and **nobody ever passed it**, so the menu's only condition — `if ( !$get(ent_me,sitting) )`, which shrinks it from six options to three and renames the first to «Stand Up» — was ported, cited and never once satisfied. The player's script environment still has `anadirOpcion: () => {}` beside a comment claiming «the player has no interaction menu», which is false: `player_sv_menu` is one of the 27 loaded files and registers its six options into the void. And the four `callback` options are **effects** — separate scripted entities reached by `clientcmd ent_me "action <EFFECT_ID>"` — whose four files are not loaded at all, because they hang off `#include effects/base_effect` and the effect system is not ported; so they are hand-ported, with a citation per rule. What sitting actually does: the view drops **28 units over one second** and comes back up the same ramp, five locks close (`canmove`, `canattack`, `canrun`, `canjump`, `canduck`), and every five seconds a cycle gives health, mana and a full refill of stamina. The health is **an accumulator, not a step** — `add regen.hp.amt REGEN_INT` then `givehp ent_me regen.hp.amt`, and nothing resets it while you stay seated — so resting accelerates: 6, 11, 16, 21 for a character with 100 maximum health. That is the «slowly» in the report. Two readings of the engine decided the behaviour. The `if SHOWIT_ON` guards are **old-style ifs**, and experiment 67 recorded that one of those «abandons the whole block» without being able to say *which* block, because its case sat at the top level of an event; these sit inside `if ( AM_SITTING ) { }`, and `Script_ExecuteCmds` breaks out of that one `Cmdlist` while entering child blocks by recursion (`script.cpp:5748-5757`) — so sitting **does** give mana, and what a disabled `SHOW_HEALTH` costs you is only the two «Resting… HP: …» messages. The mod's own header confirms it, raising sit mana regen «to 5» and health «to 3 (total)» after complaints, and the ported arithmetic yields exactly 3 and 5 on the first cycle, measured in the browser. And `if ( STRUCK_TIME equals 'STRUCK_TIME' )` never runs, for the single-quote reason experiment 82 found. Measuring any of this needed one more missing rule: stamina regenerates only when you are neither running **nor acting** (`fatigue.cpp:77-79`) — three conditions, of which this port had two, with the third written in the comment of its own function and applied by nobody. Without it the stamina refills in five seconds whether or not the `drainstamina ent_me -1000` runs, and the control cannot tell the two mechanisms apart. See [doc/MENU_85.md](doc/MENU_85.md) |
| **Hitting something small** | the three combat probes in this project all measure against goblins and zombies, and **a control had never been put in front of a rat**. Doing it found three things at once. A hostile's attack is `playanim once ANIM_ATTACK`, and `once` does not mean «one time»: `CAnimOnce::CanChangeTo` returns `m_fSequenceFinished` (`monsteranimation.cpp:217-220`), so **nothing can overwrite it until it ends** — Thothie wrote the symptom above that guard in 2007, *«if you 'dance' around an affected monster, he can never attack, as his swing anims break»*. The other half is that whoever puts the idle animation back is the monster's own `Think`, **every 0.1 s** (`msmonsterserver.cpp:511` and `:586-600`). The port had neither, so a boar's attack animation lasted **120 ms of the 1000 in the file** from the second swing on, and the first one stayed frozen on its last frame for **2017 ms**. Then the weapon: `DoDamage` gives **two attempts**, and the port gave one. When the sphere finds nobody, the engine traces the real line with **`dont_ignore_monsters`** and deals full damage to whatever it hits (`giattack.cpp:1636-1646`); the port played the hit-stone sound instead — and its ray **did not filter monsters out**, while the other ray in the same function did, so it struck the rat's own cylinder and counted as «I hit a wall». A monster cannot sound like stone: it sends `CE_HITMONSTER` (`msmonsterserver.cpp:2438-2445`) and `hitwall` only comes from `CE_HITWORLD`. That second attempt is nearly the whole reach of the weapon, because the sphere measures to a creature's **centre** and the line to its body: with the rusty sword, an eye 64 units up and a rat's centre at 16, the sphere's horizontal radius is √(60²−48²) = 36 units and the two bodies already keep 32 apart, so **the band where a rat can be hit by the sphere is four units wide — ten centimetres**. Third: the collider came from the measured mesh box while the hit target came from the script's `setsize`, so **the same creature had two sizes in the same frame**; the engine's hull is the script's (`UTIL_SetSize`, `msmonsterserver.cpp:244`), which changes 61 of Gate City's 69, 44 of Edana's 48 and 57 of the third map's 74 — and makes Edana's eleven seated commoners walk-through, `width 5`, exactly as in the original. «You can walk through rats» turned out **not** to be the collider: measured in game, a rat stops the player at 32.8 units with the bodies keeping 32.0. What is left open is that with a server the client never gives a cylinder to a creature that spawns. See [doc/COMBATE_80.md](doc/COMBATE_80.md) |

Roughly 31 000 lines of JavaScript, **2 176 Node checks** and 65 browser probes that
drive a real Chromium and measure what is on screen. Every ported rule cites the
engine or mod source it came from, file and line.

## What does not work yet

**Most quests.** Master Sword has no quest system: it has two script commands and a
dictionary saved with the character, and the rest is the script interpreter — 14 000
lines and 223 commands. 73 of those commands are ported. Measured over the **262**
scripts with an interaction menu: **233** build their whole menu correctly, **148**
have at least one option you can see through to the end, and **95** work in full.
(It used to say 139 scripts, 118, 88 and 46. The count was wrong, not the port: an
NPC almost never declares `game_menu_getoptions` itself, it inherits it from an
`#include`, and the census read the raw file — experiment 60.)
**All five of Gate City's own NPCs with a menu now fit end to end.** Fitting is
not the same as being reachable, and the two are worth keeping apart: the mayor's
second quest counts zombie kills reported by the zombie's own script, and that
path is not ported, so it can be run but not arrived at. **Shops work**: the
three-panel flow the original uses — a «1. Buy / 2. Sell / 3. Cancel» chooser,
then the inventory panel with the vendor's wares — with stock, the percentage
pricing and the capped resell ratio behind it. Buying takes the gold, hands you
the item and empties the shelf — **over the network too, from experiment 63**;
selling is written and not yet measured, so it is declared pending rather than
counted. Getting there found three things that
were broken between working parts, the worst of them that **no shop in the game
had ever had a single item in it** — experiment 60.
`npm run guiones` prints the count and what is missing most — see
[doc/MENUS_46.md](doc/MENUS_46.md), which also explains why "fits" is a weaker
claim than it sounds.

**You can drop what you are holding, and it does not drop: it is thrown.** `c`
(`bind "c" "drop"`) sends the item out of your eye at 175 units per second plus
60 upward, carrying your own velocity, and it flies before it falls. The
direction is not where you are looking: the engine writes a player's
`pev->angles` pitch as **minus a third** of the view (`sv_user.cpp:993`), and the
mod asks that for a heading — so looking 60° down throws the thing 20° **up**,
and the lowest you can drop anything is 30° above the horizontal. Landing on a
brush entity — a door, a breakable — is not landing at all: the engine never
sets `FL_ONGROUND` there, so the item stays tilted, silent, and expires from when
you dropped it. See [doc/SOLTAR_75.md](doc/SOLTAR_75.md).

**Knock the apple down and the one in the tree goes out.** A map can change how
an entity is drawn — `env_render` — and in Edana five of its seven do that to an
ornament rather than to a wired entity. One trigger does two things, because two
entities share the name `apple5spawn`: the item spawns on the ground and the
ornament on the branch stops being drawn. The same mechanism fills the tavern:
four soup bowls are born **invisible** in the `.bsp` and each shares its name
with the spawner of the patron who sits at that table, so **the soup appears when
the customer does**. An entity with `rendermode 4` and `renderamt 0` is not drawn
transparent — the engine never adds it to the draw list (`gl_rmain.c:252`) — and
with `rendermode 0` the amount is not read at all. See
[doc/ADORNOS_76.md](doc/ADORNOS_76.md).

**Step on the flowers and the captain of the guard comes running.** `ms_npcscript`
is Master Sword's `scripted_sequence` and it has five types; the port had one of
them. The one it was missing turns out to be **the most common in the whole
game** — `SCRIPT_MOVE`, 98 of the 172 across the 81 maps, and 110 of those 172
move the NPC somewhere. Edana has three of them and **Gate City has none**, which
is the eighth time running that the hole is the second map's to show. Now a
`trigger_multiple` in Edrin's flower bed makes him run 125 units across the
square with his `moveanim run`, turn to the exact angle the entity asks for
(`npcact.cpp:249` overwrites the heading he travelled with), say «Hey! Stay out
of there!» through his own script, and **four seconds later walk back** — a
second scene the first one chains with `firewhendone`. Three of the mod's own
bugs are ported with the bug in place, including the one where `setmovedest none`
makes a running scene believe the NPC arrived: it clears the condition and leaves
the destination written. What is *not* ported is counted, starting with the
script-side `setmovedest`, whose hook has been an empty function since
experiment 43. See [doc/ESCENAS_77.md](doc/ESCENAS_77.md).

**A third map, because the last two scene types had nowhere to happen.** Of
`ms_npcscript`'s five types the port could only *measure* three: there is not a
single type 1 (`SCRIPT_PLAYANIM`) or type 3 (`MOVE_PLAYANIM`) in either Gate
City or Edana. There are 25 in the game, across ten maps, and
**`gertenheld_forest2` is the only one where both hang off an unnamed
`trigger_once`** — off the player's foot, with no quest in the way. So it is
baked and it is in the map list, and walking into the forest now makes Jerdid
the Adventurer wave at you, and a skeletal mage seal something and vanish.

Getting there needed four holes fixed that the two old maps could not show.
**The BSP tree's own sanity check was sampling the sky**: it asked «is it empty
above a floor face and solid below», over the 200 largest upward-facing faces —
and outdoors the largest faces that point up are the bottom of the skybox,
which answers exactly backwards. Six of eleven maps failed it with the tree
reading perfectly, and Edana was passing by one point. **No scene animation in
the game had ever been baked**: the whitelist in the NPC baker comes from the
creature's script, and a scene's `actionanim` is written in the `.bsp`, so
Jerdid's model arrived with 11 of its 129 sequences and no `wave` — and nothing
errored, because the viewer falls back to sequence 0 and the NPC performs the
scene standing still. **A `killtarget` naming a monster killed nobody**:
`UTIL_Remove` deletes everything with that name, and the port only looked at the
map's wiring table; Gate City has no `killtarget` at all and Edana's two name
entities, while this map has thirteen and four of them name an NPC. And the
probe that measured all this found that **experiment 77's probe had never
actually aimed its camera**: `mirar` takes three numbers and it was handed an
array, which leaves the player's yaw `NaN` and his body unsimulated. See
[doc/ESCENAS_78.md](doc/ESCENAS_78.md).

Also missing: sliding along a face when thrown (a ray stops it dead),
dropping something from **inside** a container,
selling (the panel is written and not yet measured), item
containers, breakable brushes (which matters in one
place: two of Gate City's four egg sacs enclose their spider, and the sac is baked
into the collision mesh, so those two never get out), lighting on remote players,
`wss://` and accounts.

**There is no pathfinding, and there is none to port.** `gatecity.bsp` has no
`info_node` at all and `msmonsterserver.cpp` never touches `nodes.cpp`, so
Half-Life's node graph is not part of this game. What guides Gate City's monsters
is **101 `func_monsterclip` brushes** placed by hand — invisible, solid for
anything flagged `FL_MONSTERCLIP` and walked through by the player. They were
missing until experiment 39 (the compiler strips their faces and our collision
mesh is built from faces), and with them the townsfolk stray 15 m from their posts
instead of 32. A monster cannot perceive them: `UTIL_TraceLine` passes
`monsterClip = FALSE` hard-coded, so picking a heading and line of sight both
ignore them, and only walking is blocked. See [doc/BICHOS_39.md](doc/BICHOS_39.md).

**One thing the browser takes away.** Duck is Ctrl, because `config.cfg` says so —
but duck-and-forward is Ctrl+W, and in a browser tab that closes the tab. No amount of
`preventDefault()` fixes it: window shortcuts are not cancelable. Press **B** to go
fullscreen and the game gets every key, Ctrl+W included, through the Keyboard Lock API.
Outside fullscreen, or in a browser without that API, the game warns you once and you
can rebind Duck. See [doc/NAVEGADOR_35.md](doc/NAVEGADOR_35.md).

---

## Running it

You need Node 20+ and the game's content. The content is published by the MSR team:

```bash
# 1. the game's content, in a folder called MSC next to this one
mkdir ../MSC && cd ../MSC
git clone https://github.com/MSRevive/assets.git        # maps, models, sounds, textures
git clone https://github.com/MSRevive/MSCScripts.git    # the game scripts
cd -

# 2. this
npm install
npm test                  # Node checks, no browser needed

# 3. extract what the browser needs into build/ (never committed)
npm run gatecity          # the map, its textures and its lightmap
                          # (or: npm run mapa -- --mapa <name>, for another one)
npm run gatecity:bichos   # the 69 NPCs' models
npm run recursos          # shared UI, player models, weapons, icons and effects
npm run gatecity:aparicion # the map's character spawn data
npm run sonido            # the sounds — see "Two builds, two soundtracks" below
npm run menus                   # the NPC menu options for this map
npm run guiones                 # the NPC scripts, parsed — and the coverage census
npm run mapainfo                # how the map introduces itself, and its level band

# 4. play
npm run dev               # http://localhost:5173/
npm run servidor          # and, for multiplayer, the server
```

The tools read from `../MSC/assets/msr/` and `../MSC/MSCScripts/scripts/`, which is
what the two clones above give you. Nothing is written back there; everything
extracted lands in `build/`, which is not committed and carries its own
`build/<map>/PROCEDENCIA.md` and `build/msr/PROCEDENCIA.md` recording their sources.
Shared resources live in `build/msr/` and are extracted once with `npm run recursos`.
Sound catalogues remain in each map directory; their audio files are shared in
`build/msr/snd/`. Run `npm run sonido -- --mapa edana` for Edana, after extracting
its map and any available NPC data. Existing installations must run `npm run
recursos` and regenerate sound catalogues; old copies under Gate City are no
longer used. `npm run sonda:recursos` verifies both maps with the old routes blocked.

### Two builds, two soundtracks

Master Sword ships twice and the two do not sound the same, which took a while to
notice. The **Xash3D** build is standalone — its `gameinfo.txt` says
`basedir "msr"` and says why: *"makes MSR a fully standalone game (no valve/
dependency)"*. The **GoldSrc** build is an ordinary mod, `hl.exe -game msr`, and
GoldSrc always mounts `valve/` behind the mod. So a third of the sounds the game
asks for — `pl_step*` (stone, 92 % of Gate City's floor), `pl_dirt*`,
`pl_slosh*`/`pl_wade*`, `common/bodydrop*`, `doors/doormove*` and most of the
combat set — are Half-Life's, and the mod inherits them.

`npm run sonido` bakes whichever it finds. Point it at a Half-Life install to get
the GoldSrc set, which is what a player actually hears:

```bash
HALFLIFE="C:/path/to/Half-Life" npm run sonido   # the mod, valve/ behind it
HALFLIFE=none npm run sonido                     # Xash3D: stone runs silent
```

Without it, the 36 Half-Life files are missing and four footstep samples are
**generated** instead — ours, not the game's, marked `generado: true` in the
catalogue. That is the honest Xash3D sound. Anything read from `valve/` is
Valve's, is listed separately in `PROCEDENCIA.md`, and is another reason the
content cannot be redistributed: see the licence note at the end.

**It is not only sounds.** `npm run efectos` bakes `xflare1.spr`, the flare the
level-up effect throws 160 of, and that file is not in `../MSC/` either — it is
Half-Life's. Same three rules, same `HALFLIFE` variable: the mod first, then
`valve/`, and failing both a flare of our own with one frame instead of the
real twenty, marked `generado: true`.

## Layout

Map-specific extractors now share `--mapa <name>`: `mapa`, `mapa:bichos`,
`mapa:aparicion`, `menus`, `guiones`, `mapainfo` and `sonido`. For example,
`npm run menus -- --mapa edana`. Existing commands retain their defaults.
See [the extractor notes](doc/EXTRACTORES_MAPA.md) for dependencies, and for the
`patron9` blocker that used to stop Edana NPC extraction: a spawn template
pointing at an area the map does not have is what the mod itself tolerates, so
it is counted and reported rather than treated as fatal.

[ESTRUCTURA.md](ESTRUCTURA.md) maps every folder to its equivalent in the mod's own
source tree. The short version: `src/bsp/` reads Half-Life's formats, `src/play/` is
the rules with no DOM and no Three.js so the same file runs in the browser and on the
server, `src/render/` draws, `src/red/` is the network and the server, `src/juego/` is
the interface.

## The documents

**The documents are in Spanish** — they are the working notebook, and there are
forty-three of them in [doc/](doc/), most one per experiment, each with what was measured and
what was got wrong. If you only read one, read [doc/IA_28.md](doc/IA_28.md): moving
69 monsters to a server, and the reason two players were seeing two different towns.
[PROYECTO_10.md](PROYECTO_10.md) is the plan; [NEXT_SESSION.md](NEXT_SESSION.md) is
where the work is now.

**If you are about to change something here, read [CLAUDE.md](CLAUDE.md) first.**
It is the short version: where the game content lives and why none of it is in
this repository, how a change is proven — Node checks for the rules, a real
Chromium for anything you can see — and the one mistake this project has made
four times, a check that passes because the thing it was meant to test never ran
at all.

## Licence

The code in this repository is ours. The game content is not, and is not here.
Distributing the *content* — serving a baked map from a web server — needs permission
that has not been asked for yet, from the MSR team for their assets, from DrKill for
Gate City itself, and from Valve for what Half-Life's SDK covers, which the MSR team
cannot grant. Until then, what is published is the code.
