# Las 23 variables mezcladas de `iaDe` — experimento 93, pieza C

El 92 dejó escrito (doc/FICHAS_92.md §1): 23 variables de `iaDe` difieren
entre `vars` y lo de al nacer «porque se mezclan con un `setvard` posterior
que este lector no evalúa», y pasarlas a `va` «cambiaría un valor malo por
otro (`ATTACK_RANGE` → `MY_WIDTH`)». Pendiente, con el número delante.

Mirado una por una, **casi ninguna era un `setvard` imposible de evaluar: era
el relleno por omisión de la IA aplicado sin mirar su `if`**:

    if ( ATTACK_RANGE equals 'ATTACK_RANGE' )        base_npc_attack_new.script:204-208
    {
        setvard ATTACK_RANGE MONSTER_WIDTH
        multiply ATTACK_RANGE 2.5
    }

Una variable que no existe vale su propio nombre (script.cpp:4747; el propio
motor lo enseña así, scriptcmds.cpp:3950), así que ese `if` sólo es cierto si
el bicho no declara su alcance. El 92 lo daba por cierto siempre, y como
`MONSTER_WIDTH` lo resolvía `vars` —primero gana, cualquier bloque—, salía el
`MY_WIDTH` de un `ext_scale` que no corre (externals.script:963). Dos valores
de reposo seguidos.

## 1. Lo que se cambió: `variablesAlNacer` es ahora un intérprete pequeño

En `src/bsp/script.js`, con su comentario largo al lado. Lo que hace, cada cosa
con su cita en el código:

- **Condiciones** (`ScriptCmd_If`, scriptcmds.cpp:3956-4038): un parámetro →
  `atoi`, con `!` al revés; tres → `equals`/`isnot` con `FStrEq` y los
  numéricos con `atof`. `if ( … )` gobierna lo de detrás en la línea o la
  siguiente orden o `{ }` (script.cpp:5310-5345), `else` igual (:5349-5366), y
  el `if` viejo sin paréntesis, si sale falso, abandona su lista (:5754-5758).
  Para eso `partirScript` guarda ahora, además de las líneas aplanadas, las
  mismas con las llaves (`crudo`).
- **Valores resueltos al ejecutar**, como el motor (`GetConst` al cargar,
  `GetLocal`+`GetVar` al correr, script.cpp:5745; `FindVar` mira variables y
  luego constantes, :419-436). Las comillas dobles agrupan; un `setvar` con
  varios valores los junta sin espacio (scriptcmds.cpp:6569-6575).
- **Cuentas**: `add`/`subtract`/`multiply`/`divide`, `atof` y `%.2f`.
- **Lo que el bicho sabe de sí**: `width`, `height`, `hp`, `skilllevel` y
  `expadj` (npcscript.cpp:185-213, :393-470), que leen `game.monster.*` y
  `$get(ent_me,…)`; `moveprox` = `m_Width × 1,1` (msmonster.h:355,
  scriptcmds.cpp:1470).
- **`callevent`** con parámetros (`PARAM1…`, script.cpp:5709); con retraso,
  sin ellos (scriptcmds.cpp:2276-2282), y lo diferido corre por su HORA.
- **`[override]`** borra los eventos de ese nombre leídos antes
  (script.cpp:5205-5210).
- **El mapa**, si quien lee se lo da: `leerFichaNpc(raiz, guion, { mapa })`.
  `tools/bichos.mjs` se lo da.

**Lo que no sabe no lo inventa.** Una condición sobre el mundo (el mapa sin
`mapa`, `$cansee`, la hora, el objetivo) es DUDOSA: lo de dentro no se aplica
—se sigue el camino de no entrar, que al nacer suele ser el bueno: nadie tiene
objetivo todavía— y la variable se apunta en `alNacer.dudosas` con la
condición. Un SORTEO (`$rand(a,b)` con límites conocidos) vale su mínimo para
decidir, que es la regla que `leerFichaNpc` ya tenía («de una rama `if` se
toma lo primero que aparezca»), y también se declara. `iaDe` lo saca en el
campo nuevo **`ia.dudosas`** (variable → razones), y deja fuera las de
`$anim_exists`, que son la cadena de repuesto de la muerte y ya la aplica el
horneado con el modelo delante (`muerteQueExiste`).

Y `iaDe` lee **todo** con el valor al nacer: `v` es `va`.

## 2. Las 23, una por una

«fichas» = de los 1 593 guiones con modelo, en cuántos el valor de `vars`
(el viejo) y el de al nacer (el nuevo, sin mapa) son distintos. Ninguna queda
leyendo `vars`; lo que no se sabe va declarado.

| variable | fichas | campo de `iaDe` (quién lo usa) | valor de verdad al nacer, y cita | decisión |
| --- | ---: | --- | --- | --- |
| `NPC_GIVE_EXP` | 927 | `experiencia` (`experienciaDelBicho`) | la que `skilllevel` recibe en `npcatk_set_skill` y guarda en `NPC_ORIG_EXP` (base_self_adjust:264-282, npcscript.cpp:400-405). La final (:488) ya lleva el «+1» de `expadj 1` | leer `NPC_ORIG_EXP`; si no la hay, `NPC_GIVE_EXP` al nacer. La final no: el juego ya suma el +1 y saldría doble |
| `ATTACK_RANGE` | 261 | `alcanceDeGolpe` (ia.js) | lo declarado; si no, `MONSTER_WIDTH × 2,5` (base_npc_attack_new:204-208) o `moveprox × 2,5` en la IA vieja (base_npc_attack:885-890) | al nacer, evaluado |
| `ATTACK_HITRANGE` | 453 | `alcanceDeImpacto` (ia.js) | declarado o `MONSTER_WIDTH × 4` (:209-213); la IA vieja lo sube a `altura + 48` (base_npc_attack:893-909) | al nacer |
| `MOVE_RANGE` | 352 | `alcanceParaPararse` (ia.js) | `ATTACK_MOVERANGE` si existe, si no `MONSTER_WIDTH` (base_npc_attack_new:172-196) | al nacer |
| `ANIM_ATTACK` | 114 | `golpe` (manada, golpe) | lo del bicho tras sus ramas: `const` gana el primero (el zombi de ballesta pesada usa la rama `else`, dwarf_zombie_sbow:15-28) | al nacer; 180 dudosas (casi todas de combate: `if game.time > NEXT_KICK`…) |
| `ANIM_WALK` | 208 | `andando` | el literal `ANIM_IDLE` de un evento muerto deja de salir; la de la plantilla (`skeleton_base:53`) entra | al nacer; 72 dudosas |
| `ANIM_RUN` | 196 | `corriendo` | ídem (`skeleton_base:54`) | al nacer; 81 dudosas |
| `FLINCH_CHANCE` | 63 | `encogerse.probabilidad` | dos bloques sin nombre: gana el que se LEE después (orc_flayer 45 % → orc_base:25, 30 %) | al nacer |
| `DROP_ITEM1_CHANCE` | 875 | `botin` | el `0%` de `ext_no_drops2` era de un evento muerto; los osos 50 % y no 75 % | al nacer |
| `CAN_FLEE` | 128 | `huir.puede` | el bloque sin nombre corre DESPUÉS de `npc_spawn` (ver §3) | al nacer |
| `ATTACK_HITCHANCE` | 9 | `aciertos` | la rama del tipo de goblin que toque; sorteo → primera | al nacer; 17 dudosas |
| `ATTACK_DAMAGE` | 53 | `dano` | `'$randf(5.0,8.0)'` con comillas simples ya se lee (script.cpp:4405-4409); el zombi espadón 55 | al nacer; un `$rand` guardado tal cual no es dudoso: `rango()` lo lee |
| `ANIM_DEATH` | 19 | `muerte` | la del bicho; la cadena de repuesto (base_npc:283-296) la aplica el horneado | al nacer; `$anim_exists` no se declara |
| `FLINCH_DAMAGE_THRESHOLD` | 468 | `encogerse.umbralDeDano` | `game.monster.maxhp × 0,1` (base_npc_attack_new:164-168) con la `hp` del bicho | al nacer; 27 dudosas (vida sorteada) |
| `CAN_HUNT` | 198 | `canHuntViejo` | no decide nada (comentario de `iaDe`) | al nacer |
| `CAN_RETALIATE` | 647 | `puedeCambiarDeObjetivo` (ia.js, reaccion.js) | 1 por omisión (base_npc_attack_new:120, base_npc_attack:823); el 0 de la araña es del enganche | al nacer |
| `DROP_ITEM1` | 66 | `botin` | la rama de arma que corre (bigaxe: hacha doble; espadón: espada bastarda) | al nacer |
| `SOUND_STRUCK1` | 27 | `struck.sonidosDeGolpe` | sin las comillas | al nacer |
| `SOUND_STRUCK2` | 27 | ídem | ídem | al nacer |
| `SOUND_STRUCK3` | 7 | ídem | ídem | al nacer |
| `FLINCH_HEALTH` | 451 | `encogerse.vidaParaEmpezar` | `game.monster.maxhp` (:169) | al nacer |
| `CAN_FLINCH` | 539 | `encogerse.puede` | 0 por omisión (:123) | al nacer |
| `SOUND_DEATH` | 23 | `sonidos.muerte` | sin comillas; `none` donde el bicho lo pone | al nacer |

Y las «puras» del 92: `DROP_ITEM2/3/4_CHANCE`, `RETALIATE_CHANCE`, `ANIM_FLINCH`
y `HUNT_AGRO` también leen ya lo de al nacer (`RETALIATE_CHANCE` sale 75 donde
no hay `RETALIATE_CHANGETARGET_CHANCE`, y la de éste donde lo hay,
base_npc_attack:827-836).

## 3. Lo que se notará en el juego

Antes y después, sobre los 1 593 guiones (sin mapa): **934 fichas cambian, y
sólo en `ia`** (los modelos, la vida, el ancho, nada más). Por campo:
`experiencia` 371, `alcanceParaPararse` 346, `huir.distancia` 343,
`alcanceDeImpacto` 331, `andando` 203, `corriendo` 196, `alcanceDeGolpe` 147,
`golpe` 114, `botin` 83, `encogerse.*` 50-69, `dano` 53, `esJefe` 43,
`puedeCambiarDeObjetivo` 13, `huir.puede` 9. Jefes seguros: de 63 a **20**,
y 67 más que lo son según el mapa, declarados. 307 fichas traen `ia.dudosas`
(61 por un sorteo, 89 por el mapa, el resto por el mundo).

En los cinco mapas, rehorneados (fecha y campo `mapa` comprobados en cada
`bichos.json`):

| mapa | colocados que cambian | jefes | lo que se nota |
| --- | --- | --- | --- |
| gatecity | 53 de 69 | 0 | los **zombis enanos** blanden a 62,5 y tocan a 100, no 125/200: su `npcatk_get_postspawn_properties` los multiplica por 0,5 (dwarf_zombie_random:291-294). El de espadón pega 55 y da 200 de experiencia; el de hacha doble, 40 y 100 (antes los tres 20 y 40). El **de ballesta pesada** se para a 768 —es un tirador, dwarf_zombie_sbow:43— con `anim_hxbow_shoot_reload` y 150 de experiencia. Las **arañas**: ver abajo. Los tenderos pierden el `ANIM_IDLE` literal de andar y correr |
| edana | 35 de 48 | 0 | el **jabalí jefe del huerto huye**: su `npc_spawn` pone `CAN_FLEE 0` «to override base scripts», pero el bloque sin nombre de `monsters/boar.script:4` pone 1 y corre después. Experiencia 15 y 9 de los dos jabalíes especiales (`NPC_BASE_EXP`, base_self_adjust:268), no 6 |
| edanasewers | 48 de 55 | 0 | la araña venenosa toca a 128; el murciélago muere con `die` |
| gertenheld_forest2 | 73 de 95 | **0** (antes el jefe goblin) | el **jefe goblin no es jefe** aquí y da 150 (sólo en `goblintown`). El esqueleto mago se queda a 600; los lobos se paran a 72; los osos tienen daño y experiencia |
| sala88 | 1 de 1 | 0 | la rata: `huir.distancia` 1024 de la IA vieja |

**LAS ARAÑAS**, que la pieza A está tocando en `src/play/manada.js`:

| guion | campo | antes | ahora | por qué |
| --- | --- | --- | --- | --- |
| `monsters/spider` | `alcanceDeImpacto` | 136 | **128** | spider_base.script:6 |
| | `puedeCambiarDeObjetivo` | false | **true** | el 0 es del enganche (spider.script:115); al nacer, el 1 de base_npc_attack:823 |
| | `huir.distancia` | 1000 | 1024 | base_npc_attack:831 (IA vieja) |
| | `canHuntViejo` | 0 | 1 | no decide nada |
| `monsters/spider_spitting` | `alcanceDeImpacto` | 69 | **112** | altura 64 + 48 (base_npc_attack:893-909) |
| `monsters/spider_mini`, `_mini_poison` | `alcanceDeImpacto` (la venenosa) | 64 | 128 | spider_base:6 |

Ninguna cambia de modelo, vida, ancho, `golpe` ni `dano`.

Una cosa que no es de esta pieza y conviene saber: `NPCs/default_human` hace
`skilllevel -10` (:50). La ficha lo dice ahora (`experiencia: -10`); en el
motor matar a un aldeano RESTA experiencia, y `experienciaDelBicho` lo corta
con su `if NPC_GIVE_EXP > 0`, que es del guion y es correcto para el ajuste,
pero no para el reparto por daño (msmonsterserver.cpp:2508). No se ha tocado.

> **Corrección del 94:** en el motor matar a un aldeano **no resta**: no da
> nada. El −10 sí llega al reparto (:2506-2518, sin mirar el signo), pero quien
> lo recibe es `while (iRemainingExp > 0)` (playerstats.cpp:83), que con un
> negativo no entra, y el aviso verde exige `xpsend > 0` (:2540). Ver
> [EXPERIENCIA_94.md](EXPERIENCIA_94.md).

## 4. Lo que se entendió mal por el camino

- **El orden era la mitad del trabajo.** `npc_spawn` lo llama `game_spawn`
  dentro de `CScriptedEnt::Spawn` (global.cpp:424-437, desde
  msmonsterserver.cpp:238) y los bloques sin nombre esperan al primer
  `Think` (:503-542; script.cpp:4987). Lo dejó dicho el 92 y lo confirmé
  leyendo el `Spawn` del monstruo, porque el comentario del jabalí jefe dice
  lo contrario. *Cuando un comentario del mod y el motor no coinciden, manda
  el motor, y el comentario es la pista de un fallo del mod.*
- **El `)` de cierre.** `if ( $lcase(game.map.name) equals goblintown )`
  tiene otro `)` dentro; con el primero, el cuerpo del `if` era la cadena
  «equals goblintown )» y el `{ }` de detrás corría siempre. Es lo que hacía
  jefe al goblin de `gertenheld_forest2` desde el 92.
- **`setvarg` no corre al cargar** y el 92 lo ejecutaba: el
  `ZOMBIE_QUEST_COMPLETE` del alcalde salía puesto al nacer en todos los
  zombis, y con él el `deleteent ent_me` de su línea 136.
- **Mi primera regla para lo dudoso dejaba al zombi aleatorio sin
  experiencia.** Con «el camino seguro» también para los sorteos, ninguna de
  las cinco ramas de arma corría y el zombi de Gate City salía con 0 de
  experiencia y sin daño. Un sorteo no es «no pasa»: pasa uno. Por eso el
  sorteo vale su mínimo (la primera rama) y el mundo, el camino de no entrar.
- **Lo calculado con lo que no existe.** Una variable que sólo pone una rama
  dudosa valía su nombre, y `multiply ATTACK_HITRANGE 1.5` sobre ella daba
  `0.00`: los dragones de Furion salían tocando a 0. Ahora vale «no se sabe»
  y lo que se calcule con ella también, y `iaDe` cae a su omisión.
- **La experiencia final llevaba el «+1»** de `expadj 1` (el `NPC_ALL_XP_ADJ`
  sin tocar es «1», sin punto, y suma). Leerla habría sumado el uno dos veces,
  porque `experienciaDelBicho` lo suma en el juego. La sonda `mundo` lo
  comprueba: «dan UNO MÁS de lo que dice su script».
- **Una pieza que no se rompía.** Escribí una línea para tomar la hora del
  medio de un `callevent $randf(0.5,1.0)`; rota a propósito, nada cambió: la
  muestra del sorteo ya la hacía retraso. Se quitó (la regla del 78).

## 5. Roturas deliberadas

Comprobadas con `grep` puestas y quitadas, y el archivo restaurado byte a byte:

| rotura | Node (`fichas93c` + `fichas92d`) |
| --- | --- |
| el `)` de cierre vuelve a ser el primero | 3 rojas (goblinchief por mapa, el guardián de `tundra`) |
| toda condición sale cierta (el lector del 92) | 13 rojas |
| `setvarg` vuelve a correr al cargar | 1 roja |
| `experiencia` lee `NPC_GIVE_EXP` final | 4 rojas |
| `tools/bichos.mjs` sin `{ mapa }` (rehorneado `gertenheld_forest2`) | el jefe goblin sale con experiencia `null` y su duda declarada; restaurado, 150 |

## 6. Resultados

- `npm test`: **2 497 verdes, 0 rojas, 1 todo** (16 nuevas en
  `test/fichas93c.test.mjs`). Tres pruebas de `test/fichas92d.test.mjs`
  afirmaban lo que el 92 midió mal —el goblin jefe, la rebaja del guardián
  fuera de `tundra`, el `ANIM_RUN` del troll de las cuevas tras su `if
  AM_GERIC`— y llevan su corrección al lado.
- Sondas: `mundo` 44/44, `consecuencias` 48/48, `mordisco92` 25/25,
  `arranque36` 30/30, `sala88` 10/10. Los `vite` que abrieron, matados.

## 7. Pendiente

1. **`$anim_exists`** no se evalúa aquí (pide el modelo); lo resuelve el
   horneado para la muerte. Si otra variable dependiera de él, saldría dudosa.
2. **`game_postspawn`** —el evento al que el mapa pasa `dmgmulti`/`hpmulti`
   (base_self_adjust:12-50)— no se corre: los umbrales de encogerse salen de
   la vida base.
3. Los bloques con **`repeatdelay`** corren aquí una vez y no a su hora.
4. Un **local** cuyo valor es el nombre de otra variable no se vuelve a
   resolver (el motor sí, script.cpp:4404).
5. `andando: "walk"` del zombi de ballesta (el pendiente 4 del 92) sale de
   `visita`, no de este intérprete; sigue igual.
6. `callexternal` y `calleventloop` no se siguen.

## Archivos

- `src/bsp/script.js` — `partirScript` guarda `crudo`; `variablesAlNacer`
  evalúa (opción `mapa`); `leerFichaNpc(raiz, guion, opciones)`; `iaDe` lee
  todo al nacer, `experiencia` de `NPC_ORIG_EXP`, campo `dudosas`;
  correcciones al lado de dos comentarios.
- `tools/bichos.mjs` — pasa el mapa.
- `test/fichas93c.test.mjs` — nueva, 16 pruebas.
- `test/fichas92d.test.mjs` — tres correcciones al lado.
- `doc/FICHAS_92.md` — tres correcciones al lado.
- `build/*/bichos.json` — los cinco, rehorneados.
