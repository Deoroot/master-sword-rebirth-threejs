# El censo de los guiones de monstruo — experimento 91

El usuario quiere mazmorras para jugadores de hasta 500 de vida. Hoy la IA de
los monstruos está portada a mano en JS y su guion **no corre en combate**; dos
agentes empiezan a la vez a cablear los eventos de combate y los venenos sobre
el jugador. Faltaba el mapa del terreno: de los 2 884 guiones, ¿qué piden los
de monstruo al motor?

```bash
npm run bichos:guion          # tools/bichosguion.mjs -> build/msr/bichosguion.json
node --test test/bichosguion91.test.mjs
```

Todas las cifras de abajo salen de esa herramienta, medidas con **106
comandos y 27 getters portados** (`COMANDOS`/`GETTERS` de `src/play/guion.js`
en el momento de medir; otro agente los estaba ampliando, y la herramienta los
lee al ejecutarse, así que el número de mañana será otro). Los guiones se
cargan con `resolverGuion`, el `#include` en su sitio y `const` ganando el
primero (el 66).

## 0. El universo

| | |
| --- | --- |
| guiones bajo `monsters/` | **846** |
| con `setmodel` en la ficha (bichos de verdad) | **675** |
| plantillas o sin `setmodel` legible | 171 |
| guiones distintos colocados en los mapas horneados | 79 (sólo 35 de `monsters/`) |

Casi todos tiran de la misma pila de plantillas: `monsters/externals` y
`monsters/debug` están en **604 de 675**; `base_monster_shared` y
`base_anti_stuck` en 578; la familia «new» (`base_monster_new` +
`base_npc_attack_new`) en 368 y la vieja (`base_npc_attack`) en 211. Sólo 97
no incluyen ninguna `base_monster*`. **Eso decide cómo hay que leer cualquier
número «resuelto»**: lo que trae `base_monster_shared` sale «en 578 guiones»
aunque sea un solo bloque de texto. Por eso la herramienta da dos cuentas:
la resuelta (lo que el bicho necesita) y la de su **archivo propio** (lo que
distingue a un bicho de otro).

## 1. Los eventos que el motor dispara a un monstruo

Se leen del C++ sin comentarios, buscando `CallScriptEvent("…")`,
`CallScriptEventTimed` y `RunScriptEventByName` con nombre literal; la lista
de cuáles llegan a un `CMSMonster` es a mano (hay que leer a quién se le
llama), pero **cada cita se comprueba contra el C++ al ejecutarse** y en la
prueba. Columna: guiones con modelo (de 675) que lo manejan, resuelto.

| evento | cita | params | guiones |
| --- | --- | --- | ---: |
| `spawn` (el viejo) | global.cpp:436 | — | 1 |
| `game_spawn` | global.cpp:437 (vía msmonsterserver.cpp:238) | — | 673 |
| `game_postspawn` | msmonsterserver.cpp:291 | título, dmgmulti, hpmulti, addparams | 603 |
| `game_touch` | msmonsterserver.cpp:888 | otro (sólo con `m_HandleTouch`) | 9 |
| `game_heardsound` | msmonsterserver.cpp:936 | tipo, origen, radio | 585 |
| `game_heardtext` | msmonsterserver.cpp:1739 | texto, hablante | 0 |
| `game_reached_dest` | msmonsterserver.cpp:1027 | — | 581 |
| `game_movingto_dest` | msmonsterserver.cpp:1051 | ángulos | 68 |
| `game_wander` | msmonsterserver.cpp:1153 | — | 211 |
| `game_stopmoving` | msmonsterserver.cpp:1413 | — | 69 |
| `game_playerused` / `game_used` | msmonsterserver.cpp:1828 / global.cpp:503 | jugador / activador, llamador, tipo, valor | 0 / 0 |
| `game_menu_getoptions` / `_cancel` | msmonsterserver.cpp:2890 / :2925 | jugador | 13 / 5 |
| `game_parry` | msmonsterserver.cpp:2245 | atacante, daño, tipo, tirada parada, tirada acierto, valor parada | 578 |
| `game_damaged` | msmonsterserver.cpp:2311 | atacante, daño, tipo, tirada, infligidor, habilidad (el `returndata` multiplica el daño, :2313-2320) | 596 |
| `game_damaged_end` | msmonsterserver.cpp:2325 | atacante, daño final | 0 |
| `game_struck` | msmonsterserver.cpp:2385 | daño | 604 |
| `game_set_takedmg` | npcscript.cpp:1101 | tipo, modificador, (adjust) | 0 |
| `game_applyeffect` | scriptcmds.cpp:1898 | comando, quién, … | 2 |
| `game_drain_death` | scriptcmds.cpp:2976 | quien drena | 604 |
| `game_damaged_other` | giattack.cpp:1762 | objetivo, daño, tipo, dodamage_event | 605 |
| `game_dodamage` | giattack.cpp:2045 | acertó, objetivo, origen, fin, tipo, « N damage.» | 594 |
| `game_predeath` | msmonsterserver.cpp:2580 | — | 1 |
| `game_death` | msmonsterserver.cpp:2605 | — | 612 |
| `game_fake_death` | scriptcmds.cpp:5675 (`setalive 1`) | — | 598 |
| `game_deleted` | scriptcmds.cpp:2882 | — | 0 |
| `game_dynamically_created` | scriptcmds.cpp:2808 | params 3.. de `createnpc` | 659 |
| `game_scriptflag_update` / `_expired` | scriptcmds.cpp:5444 / :5395 | … | 604 / 0 |
| `game_companion_added` / `_removed` | scriptcmds.cpp:2661 / :2676 | — | 0 / 0 |

Y los de nombre calculado, que no tienen literal: el **evento de animación**
(msmonsterserver.cpp:1485-1493, §2), `<dodamage_event>_dodamage`
(giattack.cpp:2058), la frase de `catchspeech` (:1799) y la retrollamada de
menú (:3034).

**Los que parecen llegar y no llegan** — el valor de reposo de esta lista:

| evento | por qué | guiones que lo manejan para nada |
| --- | --- | ---: |
| `game_think` | `CMSMonster::Think` (msmonsterserver.cpp:503-545) no llama a `CScriptedEnt::Think` (global.cpp:458): corre `RunScriptEvents` y sigue con su IA | 0 |
| `game_attacked` | comentado, «not used by any script, save the call» (:2145-2153) | 0 |
| `game_stuck` | comentado (:1219-1227) | **578** |
| `game_anim_new` | comentado dos veces (:2025-2042, npcscript.cpp:1510) | 0 |

Los 578 de `game_stuck` son el `{ game_stuck` de `base_anti_stuck.script:427`:
un manejador que el motor no llama desde que se comentó la línea. Si el port
lo dispara, estará añadiendo un comportamiento que Master Sword no tiene.

El orden de recibir un golpe, para quien cablee el combate: `game_parry`
(:2245, y si para el daño pasa a −1) → modificadores `takedmg` → `game_damaged`
(:2311, el `returndata` multiplica) → `game_damaged_end` (:2325) → …
→ `game_struck` (:2385, sólo si sigue vivo) → y al morir `game_predeath`
(:2580) y `game_death` (:2605). Al dar: `game_damaged_other` (giattack.cpp:1762)
cuando acierta y `game_dodamage` (:2045) siempre, acierte o no (`PARAM1`).

## 2. Los eventos de animación

`CMSMonster::HandleAnimEvent` (msmonsterserver.cpp:1463-1497) atiende cinco
códigos: 400/401 (salto), 450 (frenar), y **500 y 600, que llaman al evento
del guion cuyo nombre trae el modelo** en `options` (`CallScriptEvent(pEvent->options)`,
:1487 y :1492). Lo demás cae en `CBaseAnimating::HandleAnimEvent`, que no hace
nada (cbase.h:753). Los eventos salen del `.mdl`: `numevents`/`eventindex` de
cada secuencia (studio.h:172-173), 76 bytes por evento (studio_event.h:23-26),
y el servidor salta los ≥ 5000, que son del cliente (monsterevent.h:27,
animation.cpp:322). Los despacha `DispatchAnimEvents` desde el `Think` del
monstruo (msmonsterserver.cpp:583) y también muerto (:2626).

| | |
| --- | ---: |
| modelos leídos | 642 |
| `setmodel` cuyo `.mdl` no está en `assets/msr` | 33 (¿en `valve/`? el aviso de las dos builds: no se ha buscado) |
| guiones cuyo modelo llama al guion | **589** |
| que manejan al menos uno | **559** |
| a los que el modelo pide algún evento que el guion no tiene | 363 |
| diferencias sólo de mayúsculas | 0 (el motor compara con `strcmp`, stackstring.cpp:54) |

Los más llamados y manejados: `attack_1` ×120, `bite1` ×78, `swing_sword` ×77,
`swing_axe` ×68, `attack_2` ×57, `attack1` ×54. **En Master Sword el golpe de
un monstruo ES un evento de animación**: `giantrat.script:63-67` es
`eventname bite1` + `dodamage ent_lastseen ATTACK_RANGE ATTACK_DAMAGE
ATTACK_HITCHANCE`, y lo dispara el fotograma del mordisco. Los que el modelo
pide y nadie maneja (`warcry_done` ×72, `grab_arrow`/`shoot_arrow` ×62,
`kick_land` ×57…) son modelos compartidos entre varios bichos: el motor llama
y no pasa nada, que es lo correcto.

## 3. Lo que no está portado

Sobre los 675, resuelto. «(ficha)» quiere decir que el intérprete no lo corre
pero el horneado SÍ lo lee (`CAMPOS`, src/bsp/script.js:287): no es un hueco
de la IA. «?» es un nombre que el mod no registra.

- **Comandos (89 distintos):** `invincible` 667, `setsolid` 659, `clientevent`
  647, `gravity` 645, `fly` 640, `setmodelbody` 636, `effect` 633, `blood` 625,
  `nopush` 623, `setbbox` 619, `setalive` 618, `setmonsterclip` 618,
  `hearingsensitivity` 614, `setanim.movespeed` 613, `createnpc` 611,
  `skilllevel` 611, `setangle` 609, `setanim.framerate` 609, `blind` 606,
  `movespeed` 606, `bleed` 605, `clearfx` 604, `dmgmulti` 604, `hitmulti` 604,
  `setrender?` 604, `setdmg` 596…
- **Getters (44):** `$relpos` 648, `$vec` 643, `$get_ground_height` 632,
  `$get_tsphere` 625, `$func` 610, `$vec.yaw` 608, `$neg` 606, `$get_tbox` 605,
  `$ratio` 605, `$relvel` 605, `$sort_entlist` 604, `$anim_exists` 598,
  `$angles` 587, `$can_damage` 585, `$right` 578, `$within_cone2d` 578…
- **Propiedades de `$get` (50):** `race` 632, `index` 630, `height` 609,
  `invincible`, `nopush`, `roam`, `spawner`, `width` 604…

**Ningún guion de monstruo cabe entero** (0 de 675). Bloques de evento: 202 016
en los 675 (la pila de plantillas se repite en cada uno); corren enteros por
sí solos el 55,7 % y con todo lo que llaman el 42,2 %.

### Las palancas: lo que le falta al CUERPO de cada evento de combate

Esto es lo que más sirve para planear, porque dice cuántos manejadores pasan
a correr enteros con UNA pieza:

| evento | lo tienen | enteros hoy | lo que le falta al cuerpo, en la mayoría |
| --- | ---: | ---: | --- |
| `game_parry` | 578 | **578** | nada |
| `game_damaged_other` | 605 | 551 | (los 54 restantes: `effect`, `$relvel`) |
| `game_struck` | 604 | 26 | **544 sólo `$can_damage`** |
| `game_damaged` | 596 | 0 | **538 sólo `$right` + `setdmg`** |
| `game_dodamage` | 594 | 3 | **469 sólo `$get(,dmgmulti)`**; 75 más `$relvel` |
| `game_postspawn` | 603 | 0 | **597 sólo `dmgmulti` + `name`** |
| `game_spawn` | 673 | 2 | 548: `$get(,race)` + `$vec` + `blood` + `setmodelbody` |
| `game_death` | 612 | 1 | 489: nueve piezas (`clearfx`, `clientevent`, `createnpc`, `fly`, `menu.autoopen`, `setanim.framerate`, `setanim.movespeed`, `$relpos`, `$get(,scriptname)`) |

«Entero» es el cuerpo del evento; con su cadena de `callevent` dentro del
guion la cuenta baja (para `game_struck` 22 en vez de 26), porque cada evento
de la plantilla llama a la IA (`npcatk_*`), que pide de todo. **La IA portada
a mano tiene que seguir mandando mientras esa cadena no quepa**: lo del §5.

## 4. Los efectos

Por guiones con modelo, resuelto / en su archivo propio:

| efecto | resuelto | propio |
| --- | ---: | ---: |
| `effects/add_dynamic_spawn` | 604 | — |
| `effects/dot_poison` | 591 | 61 |
| `effects/dot_fire` | 588 | 63 |
| `effects/dot_cold` | 583 | 40 |
| `effects/dot_lightning` | 583 | 38 |
| `effects/debuff_stun` | 176 | **68** (el primero en propio) |
| `effects/dot_cold_freeze` | 66 | 22 |
| `effects/effect_push` | 40 | 13 |
| `effects/dot_poison_blind` | 34 | 16 |
| `effects/iceshield` | 10 | 2 |

Los 591 de veneno «resuelto» **no son 591 bichos venenosos**: son el
`game_dodamage` de `base_monster_shared.script:1327-1372`, que aplica
`dot_poison`/`dot_fire`/`dot_cold`/`dot_lightning` sólo si la variable
`NPC_DOT_POISON` (etc.) está puesta, con un daño del **5 % de la vida máxima
del objetivo** por el ratio. Y esa variable la pone `add_dot_poison`
(`externals.script:1342-1343`), que se llama desde el `addparams` del
`game_postspawn`, o sea **desde el MAPA**: el Jerdid de `gertenheld_forest2`
lleva `add_dot_poison;.05` en sus parámetros. Para una mazmorra esto es oro:
**cualquier bicho de la familia se vuelve venenoso desde la entidad del mapa**,
sin tocar su guion. Contra un jugador de 500 de vida, un 5 % son 25 por golpe
antes del ratio.

Sin resolver (la variable no tiene una ruta asignada en el guion):
`SKELE_ARROW_EFFECT` 6, `DOT_DURATION` 3, `DMG_CLAW_EFFECT` 1, y tres que
pasan `5.0` donde va el efecto.

## 5. Los bucles que se reprograman solos

662 de 675 tienen alguno. Resueltos, los de la plantilla salen en todos:
`npcatk_do_events` 602, `npc_react_loop` 598, `npcatk_attack_till_spotted`,
`npc_suicide`, `set_fade_in_loop`… 604 cada uno (casi todos inertes hasta que
alguien los arranca). Los **ciclos de varios eventos con un tramo diferido**
son el corazón de la IA vieja: `npcatk_targetvalidate` 396, `cycle_down`,
`npc_targetvalidate`, `npcatk_settarget`, `npcatk_suspend_ai`… 368 cada uno.
`repeatdelay`: el bloque sin nombre en 224 y `hunting_mode_go` en 211.

En el archivo propio: bloques sin nombre con `repeatdelay` 202,
**`npcatk_hunt` 90** (el bicho redefine la caza y se reprograma), `idle_sounds`
24, `cycle_down` 20, `slime_cycle` 15. **Éstos son los que el plan híbrido
tiene que cerrar** mientras la IA portada mande: si el guion corre y su
`npcatk_hunt` se reprograma, habrá dos IA moviendo el mismo bicho. La lista
por guion está en `bichosguion.json` (`guiones[*].bucles` y `.propio.bucles`).

`callevent` sin retraso a sí mismo no cuenta: el motor lo prohíbe («Can't call
myself recursively», scriptcmds.cpp:2297). El retraso se reconoce como el
motor —primer parámetro que empieza por dígito, :2262— y, si es una variable
(`callevent FREQ npcatk_hunt`), porque el segundo parámetro es un evento.

## 6. Por vida

Vida de la ficha, **sin los multiplicadores del mapa** (`hpmulti` del
`game_postspawn`); 112 sin vida legible o con `hp 0` (la ponen después).

| vida | guiones | eventos propios | comandos propios (sin portar) | efectos propios | bucles propios | anim→guion |
| --- | ---: | ---: | --- | ---: | ---: | ---: |
| < 50 | 69 | 5,2 | 16,4 (8,4) | 0,2 | 0,9 | 0,8 |
| 50-199 | 75 | 4,3 | 11,2 (5,2) | 0,2 | 0,4 | 1,4 |
| 200-499 | 86 | 6,8 | 14,5 (6,0) | 0,3 | 0,6 | 2,2 |
| 500-1999 | 159 | 8,6 | 19,4 (8,1) | 0,6 | 1,2 | 2,6 |
| ≥ 2000 | 174 | 13,3 | 21,4 (8,5) | 0,9 | 1,9 | **5,7** |

**La mitad del bestiario (333 de 675) pasa de 500 de vida.** Lo que tienen los
fuertes (≥ 500) que los débiles (< 200) no, en su archivo propio:

| rasgo | fuertes | débiles |
| --- | ---: | ---: |
| `takedmg` (resistencias por tipo) | 67 % | 22 % |
| plantillas «new» (`base_monster_new` + `base_npc_attack_new`) | 69 % | 36 % |
| `addvelocity` (empujones) | 35 % | 8 % |
| `applyeffect` | 44 % | 17 % |
| `effects/debuff_stun` | 17 % | 1 % |
| maneja `game_dodamage` él mismo | 26 % | 6 % |
| `clientevent` / `effect` (sin portar) | 28 % / 26 % | 8 % / 8 % |
| `tossprojectile` (sin portar) | 18 % | 4 % |
| `calleventloop` | 19 % | 6 % |

O sea: un enemigo digno de 500 de vida es un bicho de la familia «new», con
**resistencias**, que **aturde y empuja**, con **más ataques por animación**
(5,7 eventos de animación manejados contra ~1) y a menudo **a distancia**. No
pide un mecanismo nuevo del motor: pide los mismos eventos de combate, el
`stun` y los proyectiles.

## 7. Los de los mapas horneados

79 guiones colocados en `edana`, `edanasewers`, `gatecity`,
`gertenheld_forest2` y `sala88`; 35 de `monsters/`. Ninguno cabe entero. Los
35 son de 4 a 500 de vida salvo `skeleton_mage` (5 000, el fantasma de
gertenheld) y `skeleton_poison_random` (350). Venenosos en su archivo:
`slime_green` y `spider_mini_poison`; `spider` aplica `effect_spiderlatch`.

## 8. Lo que se entendió mal (y lo que se encontró de paso)

- **Mi primer quitacomentarios borraba media `npcscript.cpp`.** Quitaba antes
  los `/* … */` y luego los `//`, y el archivo tiene cabeceras como
  `//******** TAKEDMG ********`: el `/*` que hay dentro del `//` abría un bloque
  hasta el siguiente `*/`, y `game_set_takedmg` (npcscript.cpp:1101)
  desaparecía. Lo cazó `comprobarCitas` —la cita a mano contra el C++— en la
  primera pasada, no una prueba. Ahora es un recorrido carácter a carácter con
  su prueba. `tools/insignias.mjs` tiene el mismo patrón (`sinComentarios`),
  **pero medido no le cambia nada**: 325 comandos con las dos versiones. Se
  dice y no se toca, que no es de este encargo.
- **«591 guiones envenenan» era una plantilla.** El primer recuento por
  efectos daba veneno, fuego, frío y rayo en ~590 guiones cada uno y no
  distinguía a nadie: es un solo bloque, condicionado, en
  `base_monster_shared`. De ahí la segunda cuenta, la del archivo propio, y la
  comparación fuertes/débiles hecha sobre ella (la primera versión comparaba
  lo heredado y salía «getplayersnb 93 % contra 85 %», que sólo decía qué
  plantilla incluye cada uno).
- **`hp 0` no es un bicho débil.** 74 guiones (de 112 sin vida útil) declaran
  `hp 0` y la ponen en el `postspawn`; la primera tabla los metía en «< 50».
- **Un guion del juego usa un getter como comando**:
  `base_monster_shared.script:713` es `$get(NPCATK_TARGET,range) <
  ATTACK_MOVERANGE` sin `if`. El motor dice «Command NOT FOUND» (script.cpp:5628)
  y sigue; aquí sale como comando sin portar «?» en 30 colocados. No es un
  hueco del port: es el juego.
- **`setrender` no existe en el mod** y `monsters/externals.script:914` lo usa
  (604 guiones lo arrastran).
- Una limitación que queda: `$get(x,NPC_RANGE_TYPE)` cuenta la propiedad por
  su nombre literal; en el motor es una variable que vale `range` o `range2D`.
  Sale como propiedad «sin portar» sin serlo del todo.

## 9. Propuesta para la primera mazmorra, en orden

Pensada para que cada paso **mueva un número de §3** y se pueda medir con
`npm run bichos:guion`:

1. **El golpe del monstruo por evento de animación.** Hornear los eventos
   500/600 de cada modelo (`eventosDeModelo` ya los lee) y, en el fotograma,
   llamar al evento del guion (`bite1`, `swing_axe`, `attack_1`…). Con eso el
   daño sale de `dodamage` del propio guion (559 guiones manejan al menos uno)
   y no de la tabla horneada a mano. Necesita `dodamage`/`xdodamage` —que el
   otro agente está portando— y nada más en la mayoría.
2. **`$can_damage`** → `game_struck` pasa de 26 a ~570 manejadores enteros.
3. **`$get(,dmgmulti)`** → `game_dodamage` de 3 a ~470, y con él el **DOT por
   `addparams` del mapa** (§4): la palanca más barata para hacer peligroso a
   cualquier bicho contra 500 de vida.
4. **`setdmg` + `$right`** → `game_damaged` de 0 a ~540; `setdmg` es como un
   guion cambia el daño que recibe.
5. **`dmgmulti` + `name`** (comandos) → `game_postspawn` de 0 a ~600: es por
   donde entran los multiplicadores de vida y daño del mapa, o sea **el ajuste
   de dificultad de la mazmorra**.
6. **`takedmg` + `effects/debuff_stun` + `effect_push`/`addvelocity`**: lo que
   separa a los fuertes (§6).
7. **Cerrar los bucles** del §5 que se reprogramen (`npcatk_hunt` propio, los
   ciclos `npcatk_*`) mientras la IA portada mande, y **no** disparar
   `game_stuck` (está comentado en el motor).
8. Después: `tossprojectile` para los de distancia, y `game_death` (nueve
   piezas) para cadáveres y botín del guion.

Para elegir los bichos de la primera mazmorra, la familia «new» de 150-500 de
vida (`dwarf_zombie_*`, `goblinchief`, `slime_green`) ya está colocada en los
mapas horneados y pide justo los pasos 1-5.

## 10. Comprobación

- `test/bichosguion91.test.mjs`, 12 pruebas: el quitacomentarios con el caso
  de la cabecera de asteriscos; todas las citas contra el C++, con
  `game_struck` en msmonsterserver.cpp:2385 como positivo y `game_attacked`
  —que el texto crudo SÍ nombra— como negativo, y una cita inventada que tiene
  que salir mal; `setvard` usado y no marcado, y marcado al quitarlo del
  conjunto; los bucles desde texto (con número, con variable, ciclo ida/vuelta
  y `repeatdelay`); `giantrat` con `bite1` por `eventname` (giantrat.script:65)
  y su modelo llamándolo; la cobra con `dot_poison` dentro de un `if()` de una
  línea (cobra.script:53) y la rata, sin efectos propios, como control.
- **Rotura deliberada 1**: el filtro de no portados cambiado por `true`
  (comprobado con `grep ROTURA91` = 1) → rojo «`setvard` se usa y NO sale como
  no portado»; quitada (`grep` = 0).
- **Rotura deliberada 2**: el quitacomentarios de dos expresiones regulares
  devuelto en la primera línea (`grep ROTURA91b` = 1) → rojos el caso de la
  cabecera y «todas las citas casan» contra el C++ de verdad; quitada.
- `npm test`: 2 332 pruebas, 2 322 verdes, 9 rojas, 1 saltada. **Las 9 rojas
  no son de este experimento**: `test/juego_misiones.test.mjs` («son 78
  comandos… y 21 getters», el sacerdote de Edana) y `test/efectos.test.mjs`
  («PENDIENTE: los venenos…»), que cuentan el subconjunto portado mientras los
  otros dos agentes lo amplían. No se han tocado.
