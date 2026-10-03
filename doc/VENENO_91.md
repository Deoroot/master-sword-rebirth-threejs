# El veneno sobre el jugador — experimento 91

En el 90 se portó `applyeffect` y la cura del sumo sacerdote funcionaba. Los
efectos de daño (`effects/dot_*`) también corrían, pero se quitaban al momento
diciendo **«You resist the poison.»**. Esa frase el juego no la diría, y un
mensaje plausible que nos inventamos es peor que no decir nada (el 65). En el
90 quedó apuntado como prueba PENDIENTE. Este experimento la cierra **para el
jugador**: que un bicho le ponga el veneno sigue pendiente, porque los bichos
no corren guion y de eso se encarga otra sesión.

## 1. Lo que se midió ANTES de tocar nada

**Qué aplican los bichos de nuestros mapas.** Se resolvió el guion de cada
bicho colocado, con sus `#include`, y se buscaron las líneas `applyeffect`
(quitando `add_dynamic_spawn` y el `game_dodamage` común):

| mapa | bicho | efecto |
| --- | --- | --- |
| Gate City | `monsters/spider` ×2 | `effect_spiderlatch` (que pone `dot_poison`) |
| Gate City | `dwarf_zombie_random` ×16, `_sword` ×1, `_bigaxe` ×2 | `debuff_stun`, `effect_push` |
| Gate City | `dwarf_zombie_hbow` ×3 | `dot_poison` (`bolt_dodamage`, `pbolt_cloud_dodamage`) |
| Edana | `monsters/boar` ×4, `boarhard`, `boarboss` | `debuff_stun` |
| Edana | `highpriest` ×2 | `effect_rejuv2` (la cura del 90) |
| edanasewers | `spider_mini_poison`, `slime_green` | `dot_poison` |
| gertenheld_forest2 | `boar` ×11, `skeleton_poison_random` ×5, `slime_green` ×3, `skeleton_mage` | `debuff_stun`, `dot_poison`, `dot_cold`… |

**Cuántas veces sale cada uno en los 2 884 guiones** (líneas `applyeffect` con
la ruta escrita): `dot_fire` 168, `debuff_stun` 136, `dot_poison` 99,
`dot_lightning` 85, `dot_cold` 81, `dot_cold_freeze` 47, `effect_push` 29,
`dot_poison_blind` 21. Hay 309 archivos que aplican algún `dot_*`. Los cuatro
`dot_*` principales comparten `effects/base_dot`. Por eso se eligió el veneno:
lo que lo arregla a él arregla también a los otros tres.

**Dónde se paraba `dot_poison` sobre el jugador.** Se corrió el efecto con un
entorno que apuntaba lo que no sabía hacer:

    propiedad:$get(,index)  propiedad:$get(,relationship)  propiedad:$get(,scriptvar)
    getter:$string_upto     getter:$get_takedmg

`debuff_stun` pedía además `scriptflags` y `$get_scriptflag`, y
`effect_spiderlatch` pedía `$pass` y `$math`. El horneado de efectos (que sólo
cuenta comandos, no getters) ya avisaba de `scriptflags` ×113 y de
`xdodamage` ×24.

**Por qué decía «You resist the poison.».** Un getter sin soporte devuelve su
propio texto (script.cpp:4741), y `if ( IMMUNE_RATIO == 0 )`
(effects/base_dot.script:131) lee «$get_takedmg(…)» como 0. Al jugador le
salía inmune a todo.

## 2. Lo portado

En el intérprete (`src/play/guion.js`):

- **`xdodamage`** (scriptcmds.cpp:7336-7466) y **`dodamage`**
  (npcscript.cpp:1107-1238) se parten **enteros** en `leerDano`, con todas sus
  formas: en radio, de vector a vector, directa y traza. Qué hacer con el
  golpe lo decide el gancho `hacerDano` del entorno. Si el entorno no lo
  tiene, se apunta. Hoy sólo lo tiene el entorno de un efecto, y sólo para la
  forma directa contra su anfitrión. El otro agente podrá usar el mismo
  parseo cuando los bichos corran guion.
- **`scriptflags`** (scriptcmds.cpp:5265-5451) y **`$get_scriptflag`**
  (script.cpp:2322-2510). Las banderas son de la ENTIDAD:
  `BanderasDeEntidad`, en `src/play/efectos.js`.
- **`takedmg`** (npcscript.cpp:1057-1104) y **`$get_takedmg`**
  (script.cpp:2569-2592): `ResistenciasDeEntidad`.
- **`$math`** (script.cpp:3271-3401), **`$string_upto`/`$string_from`**
  (:4116-4152) y **`$pass`** (:990-994).
- **`$can_damage`** (script.cpp:662-684) y **`$get(<bicho>,dmgmulti)`**
  (scriptcmds.cpp:1478). Los pidió el censo de bichos de la otra sesión
  (`game_struck` en 544 guiones, `game_dodamage` en 469).
- Un mecanismo nuevo y pequeño: **`propiedadesPropias`**. Un entorno puede
  declarar que sabe contestar una propiedad de `$get` que no está en
  `PROPIEDADES`. Así `scriptvar`, `relationship`, `index` y `dmgmulti` las
  contesta el entorno del efecto sin que el de un NPC empiece a devolver «0»
  callado.

En `src/play/efectos.js`: `golpeDirecto` (la parte de `DoDamage` que decide si
un golpe directo entra, giattack.cpp:1657-1720), `aplicadorDeBicho` (cómo se
ve un bicho de la manada desde el guion de un efecto) y, en el entorno del
efecto, `hacerDano`, `banderas`, `recibeDano`, `puedeHerir` y las entidades
**conocidas**. Lo último hace falta porque `effect_spiderlatch` pone
`dot_poison` pasándole la araña como atacante.

En `src/play/guionjugador.js`, el jugador tiene ahora sus banderas, sus
resistencias y una puerta de daño, `herir`. `recibirDano` le aplica las
resistencias de su propio guion y le pasa el golpe a esa puerta.

En `src/main.js`, dos sitios y nada más:
- la puerta `herir` en el `new GuionDelJugador`, que manda el golpe a
  `arnesDePaseo.golpear`, **el mismo camino que el mordisco de un bicho**
  (escudo, parry, «X hits you: …», `game_damaged`, restar la vida);
- `golpear` recibe ahora un cuarto parámetro opcional, `tipo`. Por omisión
  sigue siendo el del bicho. El tipo del veneno es «poison_effect» y no el del
  mordisco, y es justo lo que hace que ni el escudo ni el parry lo paren.

## 3. Rarezas del motor que se portan porque deciden ramas

- `$string_upto(abc,_)` vale **«0»**, no «abc». Si no encuentra lo que busca,
  no entra en ninguna de las dos ramas.
- `$math` devuelve siempre con «%.2f». El final de un efecto es
  `$math(add,EFFECT_STARTED,EFFECT_DURATION)` y se compara contra ese número
  ya redondeado.
- `$get_takedmg` sin ningún modificador devuelve **«1.0»**, literal y con un
  solo decimal. Con «all» devuelve «%.2f». Además busca con **contiene**,
  mientras que el daño de verdad multiplica con **empieza por**.
- `xdodamage` con ocho parámetros (el caso de `base_dot`) **lee las banderas
  de `Params[8]`**, una casilla más allá del final de la lista. Aquí, sin un
  noveno parámetro no hay banderas. El multiplicador de acierto se pierde: se
  aplica antes de que cada forma pise el acierto con `atof(Params[3])`.
- `dodamage ... direct` con cinco parámetros toma **el asa del atacante como
  tipo de daño**.
- `scriptflags clearall` borra **la mitad**, porque el bucle sube `i`
  mientras borra la casilla 0.
- `$can_damage`: el comentario del motor dice lo contrario de lo que hace el
  código. Manda el código.
- Un efecto que ejecutara `dodamage` lo haría **como el jugador**:
  `dodamage` es de `CMSMonster`, y el jugador también lo es. Se apunta.

## 4. Lo medido después

| | antes | después |
| --- | --- | --- |
| `npm test` | 2 330 verdes, 1 roja (la PENDIENTE del 90, que ahora sí podía fallar) | **2 399 verdes, 0 rojas, 1 saltada, 1 «todo»** |
| `npm run jugador`: eventos que corren enteros | 314 / 541 | **334 / 541 (62 %)** |
| archivos del jugador que caben enteros | 10 / 25 | 11 / 25 (`element_resist`) |
| comandos distintos que le faltan al jugador | 60 | 56 |
| comandos distintos que les faltan a los efectos | 34 | 32 |
| `sondas/veneno91.mjs` | — | **15 / 15** |
| `sondas/efectos90.mjs` | 11 / 11 | 11 / 11 |
| `sondas/aguante89c.mjs` | 7 / 7 | 7 / 7 |

Con una araña de verdad de Gate City de atacante, la sonda midió que la vida
pasa de 15 a 5 en cinco golpes de 2 a los 0,52 / 1,55 / 2,63 / 3,67 / 4,72 s.
El efecto deja de estar entre los activos, y la consola dice «You have been
poisoned!», cinco veces «Leaping Cave Spider hits you: 2.0 poison damage.» y
«The poison subsides.». El control negativo es igual de largo y se hace con el
personaje ya herido, cuando la regeneración sí actúa (el 66): la vida va de 5
a 6 y no llega ningún golpe.

**«Corre entero» no es «hace algo»**, otra vez: de los 20 eventos del jugador
que ahora corren enteros, casi todos son de `externals` y nadie los dispara.

## 5. Roturas deliberadas

Cada una se puso con un reemplazo que **comprueba que casa** (un `assert`
por rotura, el 80 y el 81), se verificó con `grep` que estaba puesta y se
quitó comprobando que no quedaba ninguna marca.

| rotura | qué se puso rojo |
| --- | --- |
| `$get_takedmg` devuelve su texto | 8 pruebas: vuelve «You resist the poison.» |
| `xdodamage` no llama a `hacerDano` | 7 pruebas |
| `$math` devuelve «0» | todo el veneno, porque la tirada de resistencia sale 0 |
| sólo `$math(add…)` roto | «%.2f», `starts_with` y **el alargar al apilar** |
| `scriptflags edit` no guarda el valor | **ninguna del veneno, la primera vez** (ver §6), más la de las banderas |
| `golpeDirecto` sin la guarda del atacante | 2 pruebas: la araña borrada sigue envenenando |
| `recibirDano` sin las resistencias | «`takedmg poison 2` -> 6 por golpe» |
| `main.js` sin la puerta `herir` | sonda 13/15: «la VIDA baja» (15 -> 15) y «lo firma la araña» |
| `main.js` sin pasar el `tipo` | sonda 14/15: el mensaje dice «2.0 damage.» en vez de «2.0 poison damage.» |

## 6. Lo que se entendió mal

- **El encargo decía «`dodamage` del efecto», y el efecto usa `xdodamage`.**
  Son dos comandos distintos: `dodamage` es de `CMSMonster`
  (npcscript.cpp:1107) y `xdodamage` es de cualquier guion
  (scriptcmds.cpp:7336). Se portó el parseo de los dos.
- **Romper el `edit` de `scriptflags` dejó verde la prueba de apilar.** El
  segundo veneno le pasa el daño nuevo al primero por los parámetros de
  `game_scriptflag_update` y no por lo guardado en la bandera. Lo guardado
  sólo cuenta a partir del TERCERO. Se escribió una prueba con tres venenos, y
  esa sí se pone roja.
- **Dos rojos de mi propia sonda con el trabajo bien hecho.** El primero:
  `probe.misiones.dicho()` es un anillo de tamaño fijo, así que cortar por la
  longitud de antes perdía líneas. El segundo: «no queda ningún efecto» era
  falso, porque `player/emote_sit&stand` es un efecto que el jugador lleva
  siempre (player_main.script:308). Ahora se pregunta por el veneno.
- **Una prueba que se ponía roja y no por el veneno.** La tabla de efectos de
  la prueba de `effect_spiderlatch` no traía `dot_poison`, que es el efecto
  que éste pone. El horneado sí lo trae: todo `effects/`.

## 7. Lo pendiente

1. **Que un bicho le ponga el veneno al jugador** (`bite_dodamage`,
   `pbolt_cloud_dodamage`, `game_dodamage` con `NPC_DOT_*`). Depende de que
   los bichos corran guion (otra sesión). Está declarado como `test.todo` en
   `test/efectos.test.mjs` y no cuenta entre los verdes.
   `aplicadorDeBicho` ya es la pieza que ese guion necesitará.
2. **Lo visual del veneno**: `effect glow`, `effect screenfade` y
   `hud.addstatusicon` se apuntan y no se hacen.
3. **El orden de las resistencias.** En el motor van después del escudo y el
   parry; aquí van antes. En un veneno da igual. El mordisco normal
   (`golpear`) **no aplica nunca** las resistencias del jugador, y tendría que
   pasar por `jugador.resistencias.multiplicar`. Está en la costura que toca
   el otro agente.
4. **`game_damaged` recibe 2 parámetros y el motor manda 6** (atacante, daño,
   tipo, tirada, infligidor, habilidad; msmonsterserver.cpp:2286-2313). Lo
   arrastra `golpear`, y no viene de este experimento.
5. **El ritmo se va retrasando un fotograma por golpe** (1,03 / 1,08 / 1,04 /
   1,05 s): `callevent 1.0` se vuelve a programar desde el fotograma en que
   salta. En el motor pasa lo mismo con la granularidad de su `Think`. No se
   ha medido en Xash.
6. **`debuff_stun` ya llega a aplicarse** («You have been stunned! ( 93 / 0
   )»). Pero sus efectos de verdad (`game.effect.canattack 0`, la velocidad)
   dependen de que el movimiento y el ataque lean `game.effect.*`, y eso **no
   se ha medido**. No se cuenta como hecho.
7. Que un golpe de efecto falle («%s misses you.») no puede pasar con el
   acierto 100 de los venenos, y no está cableado.
8. `MSC_ARMOR_ALL`: el formato exacto de `_gcvt` está SIN MEDIR.
