# El salto de la araña — experimento 93, pieza A

El 92 midió que la «Leaping Cave Spider» de Gate City (`monsters/spider`) **no
envenena al morder**: su veneno es el SALTO, y el salto no existía en este
puerto. Este experimento lo porta. Resultado jugable, medido en Chromium por el
menú: **en Gate City la araña te salta encima, se te pega, te envenena y la
consola lo dice con el texto del mod** («You have been poisoned!», cuatro
«Leaping Cave Spider hits you: 5.0 poison damage.», «The poison subsides.»).

## 1. El camino, leído en el guion antes de escribir nada

    { repeatdelay 4                                     spider.script:93-117
      if SPIDER_LATCHATTACK / if IS_HUNTING / if !IS_ATTACKING
      if $get(ent_me,alive) / if $rand(0,99) < 20 / if !SPIDER_LATCHING
      if $get(HUNT_LASTTARGET,dist) < 200
      if $get(ent_me,onground) / if $get(HUNT_LASTTARGET,onground)
      playanim critical jumpmiss · setmovedest none · setanim.framerate .8
      setvard SPIDER_LATCHING 1 · SPIDER_LATCH_TARGET HUNT_LASTTARGET
      setvard CAN_ATTACK 0 · CAN_HUNT 0 · CAN_HEAR 0 · CAN_RETALIATE 0 · roam 0 }
    { frame_jump        (evento 600, fotograma 22 de `jumpmiss`)       :118-125
      setvelocity ent_me $relvel(0,320,120) · gravity .9 · setanim.framerate .5
      movespeed 0 · callevent 0.001 spider_latch_checkhitground }
    { spider_latch_checkhitground                                      :126-142
      if( $get(SPIDER_LATCH_TARGET,dist) < 70 ) callevent spider_latch_hit
      else { if( game.monster.onground ) { setvelocity ent_me (0,0,0) …
             callevent 0.2 spider_latch_resetmovement } else callevent 0.001 … } }
    { spider_latch_hit  playanim break · setidleanim hitbite              :143-157
      setorigin ent_me $get(…,origin) · setfollow … align_bottom
      applyeffect … effects/effect_spiderlatch 4 $get(ent_me,id) 5
      callevent spider_latch_think · callevent 4 spider_latch_drop }
    { spider_latch_drop  setfollow none · gravity 1 · movespeed -1 · playanim critical falloff } :164-174
    { frame_falloffend (fotograma 53 de 55 de `falloff`) → callevent 0.2 spider_latch_resetmovement } :187-192
    { npc_struck → spider_latch_drop }   { npc_death → setfollow none … }  :194-205

y `effect_spiderlatch` pone `dot_poison` con la araña de atacante y 5 por
segundo (effects/effect_spiderlatch.script:16-24).

**Lo que faltaba**, mirado contra el intérprete del 92: armar `repeatdelay` en
un NPC; `$relvel`; `game.monster.onground`; `$get(…,onground)`;
`$get(ent_me,alive)` de un NPC (daba «0», el 91 §5.7); `setfollow`, `gravity`,
`movespeed`, `setanim.framerate`, `setidleanim`; `setvelocity`/`setorigin`
sobre un NPC; que alguien escribiera `IS_HUNTING` (lo escribe
`npcatk_targetvalidate`, cerrado por el 91); y que la IA respetara
`CAN_HUNT`/`CAN_ATTACK`.

**El censo** (`build/msr/bichosguion.json`, 724 guiones con modelo; y `grep`
sobre `monsters/`): `repeatdelay` en el guion propio de 112 (125 archivos de
`monsters/`), `setvelocity` 69 (77 archivos), `addvelocity` 163, `setorigin`
45, `setfollow` 2 propios y 4 contando `#include` (en todo el mod lo usan
`monsters/spider` y `spider_fire_mini`); `$relvel` le falta a 610; la
propiedad `onground`, a 41. `IS_ATTACKING` no lo escribe NINGÚN guion del mod
(7 lo leen): `if !IS_ATTACKING` es siempre cierto, la araña puede saltar a mitad
de un mordisco, y eso se porta.

**Y el modelo**, leído del `.mdl` (`monsters/spider.mdl`): `jumpmiss` 32
fotogramas a 30 con `frame_jump` en el 22 y `frame_jumpcheckhit` en el 26 (que
ningún guion maneja), `hitbite` de bucle, `falloff` 55 a 30 con
`frame_falloffstart` en el 0 y `frame_falloffend` en el 53. **Ninguna de las
cuatro estaba horneada** (§5.1).

**Qué arma cada bicho de combate de los cinco mapas** al encender los
`repeatdelay` (medido creando su `GuionDeNpc` con el cierre y 30 s de reloj;
script de medida en el scratchpad): en Gate City sólo las tres arañas grandes
y las crías (el gruñido, spider_base.script:21-28) y la del salto; los goblins,
zombis y el guardia, nada. Edana: la rata (estirarse, giantrat.script:76-83) y
los jabalíes (gruñido, comer hierba, y el bucle de la embestida cada 0,1 s,
inerte porque `BOAR_IS_CHARGING` no lo pone nadie). Las cloacas: limos,
murciélagos, ratas. `hunting_mode_go` —el bucle de caza viejo— está en el
cierre y se cuenta como cerrado en todos los de la familia vieja.

## 2. Lo portado

**El intérprete** (`src/play/guion.js`):

- `$relvel` (script.cpp:3597-3628) con `velocidadRelativa`, el `AngleVectors`
  de ReHLDS (mathlib.cpp:208). La forma de un parámetro lee el texto CRUDO
  (`&FullName.c_str()[7]`), como el motor.
- `game.monster.<prop>` es `$get(ent_me,<prop>)` (script.cpp:4692-4700), sólo
  si el entorno trae `propiedadDeMi` (hoy el de un bicho con cuerpo) y sólo
  para lo que sabe contestar; `game.monster.name.full` y compañía siguen
  valiendo su nombre.
- Cinco comandos con su gancho: `gravity` (`V_max(atof, 0.001)`,
  scriptcmds.cpp:3461-3467), `movespeed` (npcscript.cpp:514-521),
  `setanim.framerate` (:1585-1591), `setidleanim` (`none` es vacío,
  :1458-1469), `setfollow` (`none`, un solo parámetro no hace nada,
  `align_bottom` por subcadena; scriptcmds.cpp:5970-6000). Sin gancho se
  apuntan.
- `Guion.correrRepeticion`: la vuelta de un `repeatdelay`, sacada de
  `pasoDeRepeticiones` para que la use también el bicho.

**El guion del bicho** (`src/play/npcguion.js`):

- `armarRepeticionesDeBicho`: los `repeatdelay` de un bicho de combate corren
  desde que nace, por el `RelojDeGuiones` de la partida. **El cierre manda**:
  un evento con nombre de `CIERRE_DE_BICHO` (`hunting_mode_go`) no se arma y se
  cuenta como cerrado.
- `cazando(ref)`: lo que escribirían `npcatk_targetvalidate` y
  `npcatk_clear_targets` (base_npc_attack.script:546, :567-570) cuando la IA
  fija o suelta objetivo — `IS_HUNTING`, `HUNT_LASTTARGET`, `NPCATK_TARGET`.
  Sólo la familia vieja.
- `puede()`: `CAN_HUNT` (base_npc_attack.script:73) y `CAN_ATTACK` (:175), que
  la IA ahora lee. Ver §4 sobre el cero de nacimiento.
- Con `cuerpo` (`Manada.cuerpoDe`): `setvelocity`/`addvelocity`/`setorigin`
  sobre `ent_me` (no si está muerto, scriptcmds.cpp:7203), `setfollow` al
  jugador, `playanim break` como `BreakAnimation` y nada más
  (npcscript.cpp:1527), `$get(ent_me,alive)` (scriptcmds.cpp:959,
  msmonster.h:357), `onground` de los dos.
- `absorbe` no absorbe mientras el cuerpo lo lleva el guion: `npc_struck` →
  `spider_latch_drop` → `playanim critical falloff` llega desde `game_struck`,
  que es costura.
- **Corrección de `origin` y `dist`**: devolvían los `origen` crudos del
  juego, que son METROS de la escena con la Y arriba. Ahora `origin` es el
  `pev->origin` del motor —unidades, Z arriba, el del jugador en su centro, 36
  sobre los pies (msitemdefs.h:55)— con «%.2f», y `dist`/`range` le restan la
  mitad de la anchura del NPC, porque el jugador SÍ es `pMonster` (la
  corrección del 92) con `m_Width` 0 (el 82) (scriptcmds.cpp:1151-1152). El
  `<= 90` del armero se cumplía a 90 METROS.

**La manada** (`src/play/manada.js`):

- `cuerpoDe(i)`: la puerta del guion al cuerpo, con el cambio de ejes una vez.
- `_fisica`: `SV_Physics_Step` (sv_phys.cpp:1363-1430) para el bicho lanzado
  —gravedad `pev->gravity × 800` (:395-405, y Master Sword la fija en 800,
  multiplay_gamerules.cpp:168), fricción del primer fotograma en el suelo
  (`sv_friction` 4, `sv_stopspeed` 100, :52-53), posarse con el `suelo` del
  arnés— y `setfollow … align_bottom` (cbase.cpp:305-310): los pies del jugador.
- `ritmo` y `_duraAlRitmo`: `m_Framerate` mueve los fotogramas de
  `eventosDeAnimacion` y la duración del candado de `CAnimOnce`.
- `quieto` usa el `setidleanim` del guion; `relojes` pide la de reposo y no la
  de andar mientras el cuerpo es del guion (el salto empieza con
  `setmovedest none`; msmonsterserver.cpp:589-592).
- `cazar`: lee `CAN_HUNT`/`CAN_ATTACK` del guion y le avisa al fijar o soltar
  objetivo (sucesos `puede` y `caza` de la costura, en `InteraccionesNpc`).

**El juego**: `src/main.js` da `enSuelo: player.grounded` en el objetivo de la
caza (una línea); `src/juego/interacciones.js` le pasa el cuerpo al guion del
bicho, su anchura, y despacha `caza` y `puede`.

## 3. Rarezas del mod que se portan porque deciden ramas

- **Un mordisco antes de su primer segundo la congela.** `frame_bite1` hace
  `setanim.framerate BASE_FRAMERATE` (spider.script:207-209) y
  `BASE_FRAMERATE` no existe hasta `npc_post_spawn`
  (base_self_adjust.script:141, `callevent 1.0`): `atof` del nombre es 0 y
  `pev->framerate` queda en 0 (msmonsterserver.cpp:2079). La araña se queda en
  el fotograma 12 de su ataque para siempre. Lo destapó la prueba del 92, que
  ponía al jugador a 30 unidades desde el primer instante.

  > **Corrección del 95.** El mecanismo es del mod; el mordisco antes del
  > primer segundo, no. Era de este puerto, cuyo cazador pensaba en el primer
  > paso. La araña es de la IA vieja: su primer `hunting_mode_go` corre en el
  > primer fotograma pero aborta en `if NPC_INITIALIZED`
  > (base_npc_attack.script:71), y no vuelve a correr hasta los 2,8 s
  > (`repeatdelay CYCLE_TIME`, :62-63), cuando `BASE_FRAMERATE` ya existe. Por
  > la caza no puede pasar. `test/salto93a` mide ahora eso; ver doc/IA_95.md.
- **El golpe que la suelta no cancela el `callevent 4`**: a los 4 s de pegarse
  `spider_latch_drop` vuelve a correr (`SPIDER_LATCHING` sigue a 1 hasta el
  reset) y rebobina la caída.
- **Agarrada a ritmo 0,5**: la rama que se pega no devuelve el ritmo a 1, así
  que `falloff` dura el doble y los mordiscos siguientes van a medio ritmo hasta
  el siguiente `frame_bite1`.
- `IS_ATTACKING` no existe: salta también a mitad de un mordisco.

## 4. Lo que se entendió mal por el camino

- **El arnés de la prueba del 92 no tenía `animar`.** `InteraccionesNpc` sin
  `animar` tira el `playanim` del guion, así que en esa prueba el amago no se
  ponía nunca y el `frame_jump` no salía: medía otro juego (el 59). Ahora el
  arnés lo enchufa como `src/main.js`, y la araña lleva su modelo de verdad.
- **El candado no sabía del ritmo.** La primera pasada del sondeo vio la araña
  quedarse con `CAN_HUNT 0` para siempre: `falloff` a ritmo 0,5 tarda 3,67 s y
  el candado se soltaba a los 1,83, antes del fotograma 53. Lo cazó leer el
  rastro, no una prueba.
- **Agarrada se ponía a «andar»**: `relojes` miraba el destino que la IA había
  dejado escrito. En el motor `setmovedest none` lo borra.
- **Respetar `CAN_HUNT 0` congelaba a los murciélagos.** Medido ANTES de dar
  nada por hecho: `bat_base.script:28` los cuelga del techo al nacer con
  `CAN_HUNT 0` y sólo bajan con `npc_targetsighted`/`npc_heardenemy`, que la IA
  no dispara. Así que el cero sólo cuenta si llega DESPUÉS de un 1 en esa
  vida. **Esto no es del motor y va dicho en `puede()`**: es mejor que hoy
  (cazan sin bajar) y peor que el mod (no se cuelgan).
- **`if (i.fisica.manda) continue` en `cazar` no hacía nada.** Roto a
  propósito, todo verde: con `CAN_HUNT 0` ya no se llega. Se quitó (la regla
  del 78). Para los saltos de otros guiones que no bajan `CAN_HUNT`
  (`leap_scan` en 20, `orc_jump_check` en 40) no se ha medido qué hace el motor.
- **El umbral del vuelo era flojo**: con la gravedad del guion rota (×1 en vez
  de ×0,9) la prueba seguía verde. Se midieron los dos —109,5 u y 11 u de
  cumbre contra 99,6 u y 10 u— y el umbral está entre los dos.
- **`frame_bite1` cuenta doble en el rastro**: son dos bloques con ese nombre
  (spider_base.script:31 y spider.script:207). Se cuenta por lo que recibe la
  costura.
- **Las marcas por nombre no ven un rebobinado**: se cuentan por `anim.gen`.
- **`dist` en metros**, que la prueba del 46 no podía ver porque escribía los
  `origen` en unidades a mano. Corregida con la lectura vieja citada al lado.

## 5. Lo que queda abierto

1. **EL HORNEADO NO TRAE LAS SECUENCIAS DEL SALTO.** `tools/bichos.mjs` hornea
   las que nombra la FICHA (`parado`, `andando`, `ia.golpe`…) y las del salto
   las nombra el guion con `const ANIM_LATCH_*` (spider.script:80-83). Sin
   ellas `playanim critical jumpmiss` cae en la secuencia 0, `frame_jump` no
   sale y **la araña se queda a medio salto con `CAN_HUNT 0` para siempre**.
   Para medir se rehorneó SÓLO `build/gatecity/bichos/monsters_spider/` con
   `extraerBicho` y la lista ampliada (las seis de antes más `jumpmiss`,
   `jumphit`, `hitbite`, `falloff`; mismas opciones que tools/bichos.mjs:226-232;
   comprobado que lo demás del `bicho.json` sale idéntico). **El próximo `npm
   run mapa:bichos` lo deshace**, y entonces se pone roja «Gate City trae
   horneadas las secuencias del salto» en `test/salto93a.test.mjs`, a
   propósito. Hace falta que `tools/bichos.mjs` (de otra pieza) añada a
   `quiere` los nombres de los `playanim` del guion —como mínimo las `const
   ANIM_*` que resuelven a una secuencia del modelo—.
2. **El servidor** (`src/red/partida.js`) no da `enSuelo` en sus objetivos, así
   que allí `$get(<jugador>,onground)` se apunta y vale «0»: con servidor la
   araña no salta. Hace falta el mismo campo que en `main.js`.
3. `setanim.framerate` no llega al DIBUJO: el mezclador de
   `src/render/bichos.js` sigue a ritmo 1.
4. `setbbox` y `setangle face.pitch 0` se apuntan y no se hacen. Agarrada, el
   cilindro de la araña está en los pies del jugador; en la sonda no se vio
   que le empujara, pero no se ha medido.
5. `playanim once` del guion sigue llegando como `deUnaVez` (`InteraccionesNpc`
   tira el modo). Con los `repeatdelay` armados eso ya se ve: la rata se estira
   y el jabalí come hierba, también andando.
6. Otros saltos del mod (`leap_scan`, `orc_jump_check`, `gob_jump_check`…) no
   están en los cinco mapas y no se han mirado.
7. El `dist` en unidades cambia el saludo por el chat de los tenderos de Gate
   City (`$get(ent_lastspoke,dist) <= 90`): ahora es a 90 unidades, como en el
   mod. Por el menú, `pedirOpciones` sigue dejando el `origen` a «0» y la
   distancia también; no se ha tocado.

## 6. Cómo se comprueba

- `test/salto93a.test.mjs` — 24 pruebas. El salto entero entra por una `Manada`
  con las secuencias del `.mdl` de verdad, un `InteraccionesNpc` enchufado con
  su `animar` y un `GuionDelJugador` con la tabla de efectos del mod; el 20 %
  con `Math.random` sembrado. Controles negativos: la cría y el goblin, 60 s al
  lado, cero saltos; con el jugador en el aire, cero saltos (y el bloque ha
  dado vueltas).
- `sondas/salto93.mjs` — por el menú en Gate City: **15 de 15** (dos pasadas;
  en la segunda se pegaron las dos arañas grandes, 8 heridas de 5).
  Control negativo: la cría no salta, medida con el mismo instrumento que ve
  saltar a la grande, y con su control de que pelea.

**Roturas deliberadas** (reemplazo que falla si no casa exactamente una vez,
`grep ROTURA93A` = 1 puesta y = 0 quitada):

| rotura | Node (salto93a + mordisco92a) | sonda |
| --- | --- | --- |
| R1 `$relvel` devuelve su texto | 4 rojas | 1 roja (no se lanza; se pega igual porque estaba al lado) |
| R2 sin armar los `repeatdelay` | 6 rojas | 9 rojas |
| R3 la IA no lee `CAN_HUNT` | 1 roja (corre durante el amago) | — |
| R4 sin el `if (manda)` de `cazar` | **0: se quitó la línea** | — |
| R5 el candado sin el ritmo | 1 roja | — |
| R6 `origin` sin pasar a unidades | 1 roja (se pega aunque te apartes) | — |
| R7 `absorbe` absorbe con el cuerpo del guion | 1 roja | — |
| R8 `gravity` sin efecto | 1 roja (tras afinar el umbral) | — |
| R9 `main.js` sin `enSuelo` | — | 8 rojas |

**Las sondas vecinas**, después: `mordisco92` 25/25, `veneno91` 15/15,
`costura91` 19/19, `mundo` 44/44. **`consecuencias` da 46/48**, con dos rojas
en las crías de las bolsas de huevos: «dos están libres encima de su saco y
avanzan» y «las cuatro te cazan al tenerte a dos metros». La primera sale
TAMBIÉN con los `repeatdelay` desarmados (R2 puesta: 47/48), así que no es del
salto. La segunda sólo sale con ellos armados, y lo medido es esto: la primera
cría no tiene objetivo en la ventana de 2 s que mira la sonda, y al acabar la
sonda las cuatro cazan al jugador con `CAN_HUNT 1` e `IS_HUNTING 1` (no es la
compuerta de `puede()`), y ninguna araña grande había saltado (su rastro está
vacío). **No está diagnosticado** por qué armar los `repeatdelay` retrasa
cuándo la fija; queda abierto.

`npm test`: **2 519 verdes, 0 rojas, 1 saltada, 1 «todo»** (dos pasadas). Una
vez, en la primera pasada tras los cambios, salió roja «el zombi pega con el
daño del ARMA» de `test/mordisco92a` (`r.g()` nulo); no se ha vuelto a ver en
nueve pasadas.

Pruebas viejas cambiadas, con la lectura vieja citada al lado:
`test/juego_misiones.test.mjs` (cuenta de comandos y getters),
`test/juego_menus46.test.mjs` (`dist`), `test/mordisco92a.test.mjs` (el arnés
con `animar`, el modelo de verdad para la araña y el jugador que llega tras el
primer segundo) y `sondas/mordisco92.mjs` (todo veneno de la araña de Gate
City tiene que venir de un salto).

## 7. Pieza G (93): el salto con servidor

§5.2 decía que faltaba `enSuelo` en los objetivos del servidor. Faltaba, y no
era lo único: con la línea puesta la araña **seguía sin saltar**. Medido con una
`Partida` de dos jugadores (script de exploración en el scratchpad), en orden:

1. **`enSuelo`** — `src/red/fauna.js`, `objetivos`: `enSuelo:
   Boolean(j.cuerpo.grounded)`, la gemela de `src/main.js`. Sin ella el guion
   apuntaba `$get(<asa>,onground) sin física`.
2. **`animar`** — `Partida` montaba su `InteraccionesNpc` sin `animar`, así
   que `playanim critical jumpmiss` se tiraba y `frame_jump` (fotograma 22) no
   salía nunca. Es el mismo hueco que §4 encontró en el arnés del 92, en el
   segundo constructor de la clase (el 81: «dos constructores de la misma clase
   son dos juegos»). Ahora `animar: (i, n) => manada.deUnaVez(i, n)`, como
   `bichos.deUnaVez` en `main.js`. **Esto también enciende en el servidor los
   demás `playanim` de los guiones de bicho** (la rata que se estira, el jabalí
   que come hierba: §5.5).
3. **«Con quién habla»** — fuera de `alCombate`, `_aQuienHabla()` es el ÚLTIMO
   QUE ABRIÓ UN MENÚ (`pedir` y `elegido` dejan `hablandoCon` puesto). El
   `repeatdelay` del salto y su cadena de `callevent` corren fuera de
   `alCombate`, así que `$get(HUNT_LASTTARGET,dist)` se medía contra ese otro
   jugador, o contra nadie —y entonces `origin` falta y `dist` vale «0», que es
   `< 200` y `< 70`: se habría pegado sin llegar—, y el `applyeffect` del
   veneno iba a ese otro. Ahora:
   - `src/juego/interacciones.js` (una línea): `sitioDelJugador` le pasa a
     `dondeEstaElJugador` el asa del jugador del guion (`GuionDeNpc.jugador.ref`,
     que escriben la caza, los golpes y los menús). `main.js` no la mira.
   - `src/red/partida.js`: `dondeEstaElJugador(asa)` y `aplicarEfecto` buscan
     primero al cliente de esa asa (`_clienteDeAsa`, `_clienteDelGuion`) y sólo
     si no hay, a `_aQuienHabla()`. En el motor el objetivo viaja en el comando
     (`applyeffect SPIDER_LATCH_TARGET …`, spider.script:151); aquí
     `GuionDeNpc.aplicarEfecto` sólo deja pasar el asa de su jugador
     (npcguion.js, `esElJugador`), así que ese jugador ES el objetivo.

**`test/salto93g.test.mjs`** (3 pruebas): una `Partida` con la araña del mod y
las secuencias de su `.mdl`, Ana a 3 m y Beto a 60 m, los dos mandando
`MENSAJE.ORDENES` (sin órdenes un cuerpo no se simula y `grounded` se queda en
`false`, su valor de reposo: lo primero que vio la exploración). Beto abre su
menú antes: el segundo caso, con «con quién habla» = Beto. Resultado: la araña
salta (`frame_jump`), se pega a Ana, y a Ana le llegan «You have been
poisoned!», **cuatro** «Leaping Cave Spider hits you: 5.0 poison damage.» (los
mismos cuatro que la sonda de un jugador) y el icono `DOT_poison`; a Beto,
nada. Control negativo: con Ana saltando sin parar, la araña la caza, el bloque
del salto da sus vueltas y no salta.

**Roturas** (worktree aparte, `grep ROTURA93G` = 1 / = 0):

| rotura | salto93g |
| --- | --- |
| `fauna.js` sin `enSuelo` | roja: no se pega en 30 s, «`onground` sin física» |
| `Partida` sin `animar` | roja: no se pega, `frame_jump` 0 |
| `dondeEstaElJugador` sin el asa | roja: no se pega (mide contra Beto, a 2 335 u) |
| `interacciones.js` sin pasar el asa | roja: igual |
| `aplicarEfecto` sin el guion | roja: se pega a Ana y el veneno no le llega |

En las cinco, las otras seis suites (efectos93b, juego_misiones, salto93a,
costurared92b, veneno91, mordisco92a) siguen verdes: lo que muerde es la prueba
nueva y sólo ella.

**Sondas**: `salto93` 15/15, `costurared92` 16/16, `veneno91` 15/15,
`efectos90` 11/11, `efectosred93` 24/24. **`red` dio 21/21 en 4 de 6
pasadas**; las dos rojas fueron «se dibuja INTERPOLADO» (y una, además, «por
detrás de la última foto»: 0 cm, dos muestras), con la máquina cargada por
otras sesiones y tres `vite` míos sin matar. Sin los cambios del servidor
(las cinco roturas a la vez, en el worktree) dio 21/21 en 2 de 2. Las tres
últimas pasadas con los cambios, ya sin esos `vite`, 21/21. **No está
diagnosticado**: no se ha visto mecanismo que una el salto o `animar` con la
interpolación del jugador de al lado, y tampoco se ha descartado.

Lo que queda abierto de esta parte:

- `mandarADestino` y `lineaDeVision` del servidor siguen preguntando a
  `_aQuienHabla()`: un `$cansee`/`setmovedest` desde un `repeatdelay` mira al
  último que abrió un menú. No se ha medido qué guion de los cinco mapas lo pide.
- Agarrada en el servidor la araña se vio a 1,76 m de alto con Ana en el suelo
  (una sola lectura, en la exploración, ya cazando a Beto): no se ha mirado si
  es el `align_bottom` contra el `donde` del servidor (centro = pies + alto/2,
  fauna.js) o un momento del vuelo.
