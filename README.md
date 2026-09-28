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
| **The interface** | the HUD, the event console, the main menu, and all four character panels — create a character, inventory, Character Info and the NPC interaction menu — ported from the game's own VGUI widgets and text schemes |

Roughly 30 000 lines of JavaScript, **819 Node checks** and 18 browser probes that
drive a real Chromium and measure what is on screen. Every ported rule cites the
engine or mod source it came from, file and line.

## What does not work yet

Quests. The NPC interaction menu reads its options from the game's own scripts — the
mayor really does offer «Give Goblin's Head» — but choosing one does nothing yet:
there is no quest state, no payment, no script callbacks. Also missing: shops, item
containers, the NPC navigation graph, monster respawn, lighting on remote players,
`wss://` and accounts.

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
npm test                  # 819 checks, no browser needed

# 3. extract what the browser needs into build/ (never committed)
npm run gatecity          # the map, its textures and its lightmap
npm run gatecity:bichos   # the 69 NPCs' models
npm run cuerpo            # the player models
npm run sonido            # the sounds
npm run objetos           # the item catalogue from the scripts
npm run hud && npm run menu
npm run vgui && npm run menus   # the VGUI text schemes and the NPC menu options
npm run iconos                  # the item icons for the weapon choice screen

# 4. play
npm run dev               # http://localhost:5173/
npm run servidor          # and, for multiplayer, the server
```

The tools read from `../MSC/assets/msr/` and `../MSC/MSCScripts/scripts/`, which is
what the two clones above give you. Nothing is written back there; everything
extracted lands in `build/`, which is not committed and carries its own
`build/gatecity/PROCEDENCIA.md` saying which game file each piece came from.

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
