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
| **The 69 NPCs** | model, skin and animation from the `.mdl`; `npcatk_hunt`, wandering, hit reaction, monster parry, corpses that fade over 3.64 s — all simulated **on the server** |
| **The character** | attributes, the six skill schools, experience, levels, inventory, weight, gold, quickslots, saving |
| **Multiplayer** | a Node WebSocket server, 100 Hz ticks, delta snapshots, `ex_interp` interpolation, lag compensation with rewind |
| **The interface** | the HUD, the event console, the main menu, and all four character panels — create a character, inventory, Character Info and the NPC interaction menu — ported from the game's own VGUI widgets and text schemes. The inventory has the real gear column (your hands and the four containers a new character is given) and the game's Tiled / Small / Descriptions views; the F menu on yourself offers the six options the player script registers, and drops to three while you are sitting |
| **Starting a game** | the game opens where the game opens: at the main menu. «Establish a Kingdom» brings up Valve's own Create Server window with its two tabs and its cvars — two of its thirteen rows reach the game, the map you pick and fullscreen, and the other eleven are off for one shared reason rather than eleven: here «Start» opens a game inside the tab, it does not launch a server, and every one of those rows is a server cvar; «Visit a Kingdom» opens Valve's server browser, which here finds the local `npm run servidor` in its **Lan** tab — there is no Steam master server behind the other five. `?map=gatecity` skips straight in, which is what `hl.exe +map` does |
| **Settings** | Valve's own Options dialog, and nine of its thirty controls reach the game: mouse sensitivity, filtering and inversion use the mod's own formula (`sensitivity × m_yaw`, not a constant), sound and music are two separate gains as in the engine, the player name is what the character screen proposes, and brightness and gamma rebuild the 25 lightmap atlases — which is the one thing `R_GammaChanged` does. The other twenty-one are shown disabled and each says why |
| **One quest** | the Gate City mayor's. His menu options come from *running* his `.script`, and handing him the goblin chief's head really does take it out of your pack and pay you. Quest state saves with the character |

Roughly 31 000 lines of JavaScript, **1 003 Node checks** and 23 browser probes that
drive a real Chromium and measure what is on screen. Every ported rule cites the
engine or mod source it came from, file and line.

## What does not work yet

**Most quests.** Master Sword has no quest system: it has two script commands and a
dictionary saved with the character, and the rest is the script interpreter — 14 000
lines and 223 commands. 22 of those commands are ported, which is enough for the
mayor of Gate City and not much else. Measured over the 139 scripts with an
interaction menu: **65** build their whole menu correctly, **73** have at least one
option you can see through to the end, and **7** work in full. `npm run guiones`
prints the count and what is missing most — see [doc/MISIONES_33.md](doc/MISIONES_33.md).

Also missing: shops, item containers, the NPC navigation graph, monster respawn,
lighting on remote players, `wss://` and accounts.

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
npm test                  # 1 003 checks, no browser needed

# 3. extract what the browser needs into build/ (never committed)
npm run gatecity          # the map, its textures and its lightmap
npm run gatecity:bichos   # the 69 NPCs' models
npm run cuerpo            # the player models
npm run sonido            # the sounds — see "Two builds, two soundtracks" below
npm run objetos           # the item catalogue from the scripts
npm run hud && npm run menu
npm run vgui && npm run menus   # the VGUI text schemes and the NPC menu options
npm run guiones                 # the NPC scripts, parsed — and the coverage census
npm run iconos                  # the item icons for the weapon choice screen

# 4. play
npm run dev               # http://localhost:5173/
npm run servidor          # and, for multiplayer, the server
```

The tools read from `../MSC/assets/msr/` and `../MSC/MSCScripts/scripts/`, which is
what the two clones above give you. Nothing is written back there; everything
extracted lands in `build/`, which is not committed and carries its own
`build/gatecity/PROCEDENCIA.md` saying which game file each piece came from.

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

## Layout

[ESTRUCTURA.md](ESTRUCTURA.md) maps every folder to its equivalent in the mod's own
source tree. The short version: `src/bsp/` reads Half-Life's formats, `src/play/` is
the rules with no DOM and no Three.js so the same file runs in the browser and on the
server, `src/render/` draws, `src/red/` is the network and the server, `src/juego/` is
the interface.

## The documents

**The documents are in Spanish** — they are the working notebook, and there are
thirty of them in [doc/](doc/), one per experiment, each with what was measured and
what was got wrong. If you only read one, read [doc/IA_28.md](doc/IA_28.md): moving
69 monsters to a server, and the reason two players were seeing two different towns.
[PROYECTO_10.md](PROYECTO_10.md) is the plan; [NEXT_SESSION.md](NEXT_SESSION.md) is
where the work is now.

## Licence

The code in this repository is ours. The game content is not, and is not here.
Distributing the *content* — serving a baked map from a web server — needs permission
that has not been asked for yet, from the MSR team for their assets, from DrKill for
Gate City itself, and from Valve for what Half-Life's SDK covers, which the MSR team
cannot grant. Until then, what is published is the code.
