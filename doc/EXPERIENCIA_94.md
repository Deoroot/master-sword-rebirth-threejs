# Experimento 94 — matar a un aldeano: lo que dice el motor

**El encargo:** «en el motor, matar a un aldeano (NPC no hostil) RESTA
experiencia; en el port da 0. Pórtalo». Salía de una línea de
[FICHAS_93.md](FICHAS_93.md) y de la lista de pendientes del 93.

**Lo que se encontró:** que el motor **no resta**. Da cero, sin mensaje, y por
el mismo camino que el port. Lo que había que portar no era una resta sino el
sitio donde el motor la para; y lo que había que escribir era la corrección.

## 1. El dato

`NPCs/default_human.script:50` hace `skilllevel -10`. Es el «Commoner» humano:
**4 en Gate City y 3 en Edana**, contados en `build/*/bichos.json` (los 12
enanos de `NPCs/default_dwarf` y los 11 de `deralia/commoner_sitting` no ponen
`skilllevel`, o sea 0). Ninguno de los 18 + 15 modelos de bicho de esos mapas
tiene experiencia negativa: el negativo es sólo de esa ficha, y en todo
`MSCScripts` lo escriben tres guiones (`NPCs/default_human` −10,
`helena/default_human` −10, `NPCs/stalker` −5).

## 2. El camino del motor, línea a línea

1. **`skilllevel -10`** guarda `m_SkillLevel = atoi(...)` = −10 y lo copia en
   `NPC_ORIG_EXP` (npcscript.cpp:393-419).
2. **`npcatk_set_skill`** (base_self_adjust.script:264), si llega a correr,
   sale en `if NPC_GIVE_EXP > 0` (:284) **sin tocar `m_SkillLevel`**. Y
   `expadj`, el único que lo recorta a cero (`if (m_SkillLevel < 0)
   m_SkillLevel = 0`, npcscript.cpp:466-467), ni siquiera actúa: exige
   `NPC_ORIG_EXP > 0` (:437). Así que el aldeano muere valiendo **−10**.
3. **`CMSMonster::Killed`** reparte sin mirar el signo:
   `if (dmg > 0)` (msmonsterserver.cpp:2506) →
   `xp = m_SkillLevel * ((dmg * mult) / MaxHP())` (:2508) → redondeo (:2509) →
   `pPlayer->LearnSkill(n, r, xp)` (:2518). Sale −10 y **se llama**.
4. **`CBasePlayer::LearnSkill`** (playerstats.cpp:75):
   `int iRemainingExp = EnemySkillLevel;` (:81) y
   `while (iRemainingExp > 0) {` (:83). Con −10 **el bucle no entra**: no se
   llama a `CMSMonster::LearnSkill`, no se toca la hoja, no hay cartel.
5. Y aunque entrara, `CMSMonster::LearnSkill` recorta:
   `int iExpHandout = V_max(int(V_max(EnemySkillLevel, 0) * LearnMultiplier), 0);`
   (msmonsterserver.cpp:2750). No hay forma de que la experiencia baje.
6. **El aviso:** `if (xpsend > 0 && !xp_custom)` (:2540) es la única puerta a
   `game_xpgain` (:2545), que es la única que imprime
   `* N XP Awarded` (`gplayermessage`, player/player_main.script:518-521).
   Con −10 no se abre. **No hay mensaje** — ni en inglés ni en ningún otro
   idioma; el comentado de playerstats.cpp:208 tampoco lo sería.

El parry de un golpe de monstruo también recorta: `max(0, pMonster->m_SkillLevel * 2)`
(msmonsterserver.cpp:2255).

## 3. Lo que hacía el port, y lo que se ha cambiado

El resultado ya era el del motor —cero—, pero **por tres guardas en otro sitio**:

| pieza | antes | motor | ahora |
| --- | --- | --- | --- |
| `experienciaDelBicho` (src/juego/servidor.js) | `if (!(exp > 0)) return { exp: 0 }` — el −10 se volvía 0 | `if NPC_GIVE_EXP > 0` sale sin tocar el valor | devuelve **−10** |
| `expDeLaMuerte` (src/play/golpe.js) | `if (!(nivel > 0)) return {}` | `if (dmg > 0)` y nada más | un negativo sale como **−10 en su cubo** |
| `repartirExperiencia` (main.js) y `_experiencia` (src/red/partida.js) | `if (!(cantidad > 0)) continue;` y `if (total > 0)` | `while (iRemainingExp > 0)` y `if (xpsend > 0)` | igual, ahora con su cita |

Con tres guardas en fila, romper una cualquiera dejaba todo verde: las otras
dos tapaban. Ahora el número que cruza es el del motor y **la guarda que
manda es la misma que manda en el motor**, una, y se puede romper en rojo.

Y la guarda del reparto **no es redundante con `aprender`**, que es lo que
parecía: `aprender` ya recorta el negativo a 0 (`V_max`), pero tiene el
**mínimo de uno** (`else if ((int)std::abs(ExpLeft) == 0) iExpHandout = 1;`,
msmonsterserver.cpp:2762-2763). Si a la propiedad le falta menos de un punto
para subir, llamar a `aprender` con −10 **da +1**. El motor no lo da porque el
`while` de :83 no llega a llamarlo. Con un personaje recién hecho la guarda no
cambia nada; a medio punto del umbral, sí.

## 4. Cómo se mide

- **`test/experiencia94.test.mjs`**, con servidor: `Partida` + `Fauna` y un
  mensaje `PEGAR`, con la ficha **horneada** del Commoner de Gate City (no un
  `experiencia: -10` escrito a mano, la trampa del 59) y la del goblin como
  segundo caso. La propiedad se pone a 0,5 del umbral antes de matar. Aldeano:
  `total 0`, `entregado 0`, hoja idéntica. Goblin: `total > 0` y la hoja se
  mueve.
- **`sondas/consecuencias.mjs` §7b**, un jugador, entrando por el menú: el
  mismo par sobre `repartirExperiencia` de `main.js`, leyendo la hoja y las
  líneas `XP Awarded` de la consola. Medido: Commoner `power 1/4.49 → 1/4.49`,
  0 → 0 líneas; Goblin `1/4.49 → 1/5.49`, 0 → 1 línea. El goblin es el control
  positivo de los dos instrumentos.

### La rotura deliberada

| rotura (comprobada con `grep -c` a 0 antes de medir) | qué se puso rojo |
| --- | --- |
| quitar `if (!(cantidad > 0)) continue;` en `src/red/partida.js` | la prueba con servidor: `{"total":-10,"entregado":1}` — el +1 del mínimo |
| quitarla en `src/main.js` | la sonda: «matarlo no resta… NI da el mínimo de 1», 4.49 → 5.49; 52 de 53 |
| quitarla y además `total > 0` → `total !== 0` en `main.js` | dos rojas: la hoja y «no sale '* N XP Awarded'» (0 → 1: salía `* -10 XP Awarded`); 51 de 53 |

Todas revertidas y comprobadas con `grep`.

## 5. Las otras consecuencias, que NO son de experiencia

`NPCs/default_human` incluye `monsters/base_civilian` (:29), y ahí sí hay
consecuencias: al recibir un golpe grita (`Help! Help!`, `Guards! Call the
guards!`, `Save me!`, `Help! Help! I'm being repressed!`,
base_civilian.script:8-15) y **al golpe y a la muerte** hace
`callexternal all civilian_attacked <atacante> <esjugador>` (:15 y :18-20). El
guardia de Gate City lo escucha (gatecity/guard.script:105-124, y su plantilla
monsters/base_guard_friendly_new.script:142-167): si el atacante no es
`hguard`, está a menos de `BG_MAX_HEAR_CIV` y el guardia no tiene ya objetivo,
**te pone de objetivo** (`npcatk_settarget`) y, si te ve, dice una de «Hey you!
Leave him alone!», «You there, leave him be I said!», «Stop that!», «Halt!
We'll have no trouble making around here!».

**No se ha portado ni medido en este experimento.** Ni `src/` ni `test/` ni
`sondas/` nombran `civilian_attacked`. Es lo que de verdad le cuesta al
jugador matar a un aldeano en Master Sword, y queda pendiente.

## 6. Lo que se entendió mal

- **El encargo partía de una frase sin cita.** FICHAS_93 decía «en el motor
  matar a un aldeano RESTA» señalando la línea del reparto (:2508), que es
  correcta —el reparto no mira el signo— pero es la mitad del camino: la otra
  mitad está en playerstats.cpp, en otro archivo. El 68 otra vez: *antes de
  escribir «está roto aquí», lee hasta donde llega el número*. Se ha añadido
  la corrección al lado del párrafo, sin reescribirlo.
- **Tres guardas que se tapaban.** Si hubiera portado la «resta» quitando la
  de `experienciaDelBicho`, todo habría seguido verde y en cero, y habría
  parecido que el negativo «no llegaba» por otra razón.
- **Primera pasada de la sonda: rota por otra sesión.** Vite recargó la página
  a mitad (`Execution context was destroyed`) porque otro agente estaba
  guardando archivos en el mismo árbol. La segunda pasada salió entera.

## 7. Números

- `npm test`: 2 562 pruebas, 2 554 en verde, 7 rojas, 1 pendiente. Las 7 son
  de otros trabajos en curso en el mismo árbol (`test/velo94a.test.mjs`,
  `test/juego_muerte.test.mjs` —el velo de la muerte— y
  `test/salto93g.test.mjs` —el salto con servidor—), no tocan la experiencia.
  Las 5 de `experiencia94` en verde.
- `sonda:consecuencias` 53 de 53 · `sonda:mundo` 44 de 44 · `sonda:golpe` 26
  de 26 · `sonda:red` 21 de 21.
