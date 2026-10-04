# El aturdimiento y la lentitud del jugador — experimento 97 (parte G)

El 96 dejó dos efectos a medias: el Helmet of Stability registraba su
resistencia («Your stun resistance is now 70%») y nadie la leía, y la armadura
del fénix con fuerza < 40 aplicaba `effect_slow` sin que nadie hubiera medido
que frenara. Los dos guiones **ya corrían enteros**: `debuff_stun` tiraba su
dado y decía «You have been stunned!» desde el 91 (doc/VENENO_91.md §6). Lo
que faltaba era quien leyera lo que dejaban escrito.

```bash
node --test test/aturdir97.test.mjs   # 18 verdes
npm run sonda:aturdir97               # sala88 por el menú, andando: 24 de 24
```

## 1. Lo que se leyó antes de escribir

**Un efecto no traba nada: escribe variables.** `debuff_stun` pone
`game.effect.movespeed 45`, `anim.framerate 0.4`, `canjump 0` y `canattack 0`
(effects/debuff_stun.script:37-42); `effect_slow` pone `movespeed PARAM2` —que
la armadura pasa como «50%»—, `canjump 0` y `anim.framerate PARAM2/100`
(effects/effect_slow.script:14-21). Las lee el motor, en dos bucles distintos:

- **Las banderas**, en `CBasePlayer::PreThink` (player.cpp:4033-4054): todos
  los guiones del jugador, el suyo incluido, y cada `game.effect.can*` que valga
  **exactamente «0»** (`!strcmp`) pone su `PLAYER_MOVE_NO*`. Viajan al cliente
  como `iuser3` (client.cpp:2800, clplayer.cpp:598), y allí NOMOVE pone los
  ejes a cero (input.cpp:821), NOJUMP y NODUCK no dejan pasar el botón
  (input.cpp:911-919) y NOATTACK no deja **empezar** un ataque
  (giattack.cpp:253) — levantar el escudo es un ataque `hold-strike`, así que
  tampoco.
- **La velocidad**, en `CMSMonster::SetSpeed` (msmonsterserver.cpp:2819-2857),
  llamada en cada `PostThink` (player.cpp:2187): sólo los guiones que son
  efectos (`VarExists("game.effect.id")`), multiplicando sus `movespeed` con
  `atof` («50%» es 50). Si no da 100, `pev->maxspeed = SpeedPercent`.

**Y aquí está el fallo del original, que se porta: `pev->maxspeed` es dos
cosas.** El cliente de Master Sword lo lee como porcentaje
(`fSpeed *= maxspeed / 100`, clplayer.cpp:306-307) y con eso escala los tres
ejes. Pero el motor lo lee como lo que es en Half-Life, una velocidad en
unidades: viaja como `clientmaxspeed` (sv_pmove.c:561, cl_pmove.c:843) y
`PM_CheckParamters` topa con él (pm_shared.cpp:3050-3053). Así que lo que anda
un jugador frenado es

    min(fSpeed × porcentaje / 100, porcentaje)   u/s

Con lo que anda un personaje sin carga (160 o más), **manda siempre el tope**:
aturdido a 45 u/s y lento a 50 u/s, el 28 % y el 31 %, no el 45 % y el 50 %.
Correr no ayuda (dobla `fSpeed`; el tope no se mueve). A un monstruo no le
pasa: para él el mismo número sí es un porcentaje (`ScriptMultiplier`,
msmonsterserver.cpp:1197-1199), porque no pasa por `pmove`.

**El dado** (debuff_stun.script:109-132): `STUN_RESISTANCE = $get_takedmg(
ent_me,stun)` —1,0 si nada lo cambia, 0,3 con el yelmo—, y resiste si
`$rand(1,100) <= int(100 - 100 × resistencia)`. Sin yelmo eso es «≤ 0», que no
sale nunca: **sin yelmo no se resiste jamás**. Con él, «≤ 70».

**La inmunidad** (:54-75): resistencia ≤ 0, o `$get(ent_me,nopush)`. Y el
jugador es `nopush` con el escudo LEVANTADO: `melee_start` del escudo →
`ext_shield_up 1` (items/shields_base.script:107-111) → bandera `shieldnp
nopush` (player/externals.script:3400-3411) → su `game_scriptflag_update` →
comando `nopush 1` (:164-173, npcscript.cpp:318-330).

**Quién lo provoca en estos mapas**, contado sobre `build/*/bichos.json`:

| mapa | bicho | dónde | cuánto |
| --- | --- | --- | --- |
| Gate City | `dwarf_zombie_random` ×16 | `attack_2`, el salto (dwarf_zombie_random.script:306-316) | `$rand(2,8)` s, con `ATTACK2_CHANCE` 0-30 % según la variante |
| Edana | `monsters/boar` ×4, `boarhard`, `boarboss` | `boar_charge_hit`, la embestida (boar_base.script:178-184) | 3 s |

## 2. Lo portado, y dónde

- **`src/play/trabas.js`** (nuevo) — `trabasDe`/`trabasDelJugador`: los dos
  bucles del motor, cada uno con su criterio; `velocidadConTrabas`: el fallo
  del doble uso, `{ maxima: fSpeed × p/100, tope: min(p, 600) }`.
- **`src/play/movimiento.js`**, **`src/play/player.js`** — `deseo`,
  `pasoDeVelocidad` y `nadar` aceptan `tope` (el `pmove->maxspeed`). Sin él,
  `Infinity`: nada cambia.
- **`src/main.js`** — el bucle lee las trabas cada fotograma y las aplica
  sobre la intención, junto a las de sentarse; la velocidad pasa por
  `velocidadConTrabas`; `puedeAtacar` (la guarda `$get(ent_me,canattack)` del
  menú de emociones) mira `noAtacar`. Y `pasoDelEscudo` llama a
  `ext_shield_up` del guion del jugador al subir y bajar el escudo, con la
  guarda `PLR_IN_WORLD` — «ya no te empujan» estaba escrito en
  src/play/escudo.js desde hace tiempo y no lo ejecutaba nadie.
- **`src/play/guion.js`** — el comando `nopush` (con gancho) y la propiedad
  `nopush` en la lista blanca. **`src/play/guionjugador.js`** — `m_nopush`.
- **`src/dev/sonda.js`** — `probe.trabas`: lo que leyó el bucle (no
  recalculado), la puerta de `applyeffect`, `quitar` (un `removeeffect`) y
  `nopush`.

## 3. Lo que salió por el camino

**Los efectos no se acababan.** Midiendo la lentitud del fénix en Node durante
45 s: 50 % → 25 % a los 40 s → 12,5 % a los 50 s. Tres `effect_slow` vivos.
`base_effect` comprueba el final con `game.time >= $math(add,EFFECT_STARTED,
EFFECT_DURATION)` (effects/base_effect.script:67-77), o sea **contra un número
con dos decimales**, y este puerto devolvía `game.time` sin redondear: con el
reloj en 20,0999999 y el fin en «20.10», lo que queda sale «0.00», y
`callevent 0.00 effect_duration_ended` desde ese mismo evento es «Can't call
myself recursively» (scriptcmds.cpp:2297). **El efecto no se quitaba nunca.**
En el motor `game.time` es `RETURN_FLOAT(gpGlobals->time)`, «%.2f»
(script.cpp:4500-4503), y el reloj redondeado y el fin redondeado no se
cruzan. Arreglado en `resolver` (src/play/guion.js). Esto no es de la
armadura: es de **todo** efecto con duración —los venenos del 91 incluidos—
y depende del ruido del reloj, así que unas partidas sí y otras no.

Primera versión del arreglo, con `Math.fround` como `flotanteDelMotor`: hay
relojes de este puerto que son `Date.now() / 1000` (src/red/partida.js:161),
donde un `float` sólo distingue saltos de 128 s. Se quitó el `fround`; el
«%.2f» es lo que cuenta. (Al probarlo, `test/red_27` «una partida entera por
un socket de verdad» salió rojo tres veces seguidas y se lo achaqué; luego
salió verde tres veces con el mismo código y rojo una de tres con el código
viejo: es sensible a la carga de la máquina, con cinco sesiones a la vez. El
fallo no es mío, y tampoco lo es el verde.)

**El jabalí sólo aturde después de haber corneado.** Su `game_damaged_other`
empieza con `if PUSH_VEL isnot 'PUSH_VEL'` (boar_base.script:90), un `if`
VIEJO que abandona el bloque entero (el 67), y `PUSH_VEL` sólo lo ponen las
tres cornadas (boar.script:27, :34, :39). Un jabalí que embiste antes de haber
corneado nunca no aturde. Fallo del original, con prueba.

**La reserva miente.** `base_debuff_diminishing` da diez segundos de
aturdimiento por tipo y devuelve uno cada cuatro (:17-18). Pero la tirada y su
mensaje van ANTES de mirar la reserva («above the include on purpose»,
debuff_stun.script:22): con la reserva vacía el juego dice «You have been
stunned! ( n / 0 )» y no aturde. Medido: 3,1 / 3,1 / 3,1 / 1,0 / 0 s.

**Hacia atrás no se anda.** Con la lentitud, atrás son 0,5 × 80 = 40 u/s, por
debajo del tope. Pero con `sv_stopspeed 100` y `sv_friction 4`, por debajo de
100 u/s el rozamiento quita 400 × dt por paso y la aceleración da 10 × deseada
× dt: con una deseada de 40 o menos **no se avanza** —se repta un paso de
aceleración, 4 u/s a cien pasos por segundo—. Aturdido es 36 u/s: tampoco. No
es nuestro: es `PM_Friction` contra `PM_Accelerate` con los números del motor.

**La carga cambia cuál manda.** En la sonda, el fénix y el yelmo en la mochila
de un personaje de fuerza 2 le ponen el castigo entero de peso (−70,
playershared.cpp:1017-1026): anda a 90,9 u/s, y la mitad, 45,4, queda POR
DEBAJO del tope de 50. Ahí sí manda el porcentaje. La sonda mide lo que anda
cargado antes de ponérselo y la regla es el mínimo; así salen medidas las dos
ramas: el aturdido sin carga (manda el tope) y el lento con carga (manda el
50 %).

## 4. Lo medido

**Node** (`test/aturdir97.test.mjs`, 18 verdes). El aturdimiento lo pone el
guion de `monsters/boar` en un `new GuionDeNpc`, por la costura
`game_damaged_other`; el jugador es `GuionDelJugador` con `build/msr/jugador.json`;
el yelmo y el fénix entran como en el 96. Lo que anda se mide con la cadena de
`main.js` y `pasoDeVelocidad` dando pasos.

| caso | resultado |
| --- | --- |
| embestida de un jabalí que ha corneado | «You have been stunned! ( n / 0 )», 3 s |
| la misma sin haber corneado | nada (el `if` viejo) |
| aturdido | `noAtacar`, `noSaltar`, 45 u/s (libre 161,3) |
| cinco seguidas | 3,1 / 3,1 / 3,1 / <3 / 0 s, cinco anuncios |
| sin yelmo, 60 tiradas | 0 resiste |
| con yelmo, 200 tiradas | ~70 % (entre 57 y 83 %), «( n / 70 )» |
| yelmo en la mochila, 30 | 0 resiste |
| `ext_shield_up 1` | «You are immune to stun effects.»; con `0`, aturde |
| fénix, fuerza 2 | «You are being slowed.», 50 u/s, sin saltar, ataca |
| fénix, fuerza 40 | lo suyo |
| fénix 45 s | nunca por debajo del 50 %; dos `effect_slow` a la vez ≤ 4 pasos |

**Sonda** (`sondas/aturdir97.mjs`, **24 de 24**), sala88 por el menú, con la W,
la barra y los botones del ratón de verdad:

- libre: **159,8-163,3 u/s**, salta 1,14 m, el botón izquierdo empieza un ataque;
- aturdido: **44,6-45,1 u/s** (el 45 % serían 72-73), no salta (0,000 m), el
  botón no ataca; a los tres segundos se pasa y vuelve a 162-164 u/s;
- sin yelmo **0 de 60** resiste; con él **39-46 de 60** («( 25 / 70 )»…);
- con el botón derecho aguantando el escudo, **5 de 5** «immune»; al soltarlo,
  0 de 5;
- cargado sin ponérselo **90,9 u/s**; con el fénix puesto, **45,3-45,4 u/s**
  (esperado 45,4: manda el 50 %), no salta, no pierde el ataque.

Tres tropiezos de la sonda, para el cuaderno:

1. **`trabas.js` importaba `atof` de `src/bsp/script.js`**, que lee del disco
   con `node:fs`. En Node, verde; en el navegador el módulo no cargaba y la
   sonda se colgaba en el menú con un error que sólo salía en la consola. Ahora
   es `numDe` de `guion.js`.
2. **La consola tiene tope de líneas.** Contar «las líneas nuevas» por longitud
   daba cero en cuanto se llenaba: 58 de 60 tiradas salían «otras». Se lee la
   última línea con «stun».
3. **`probe.escudo.cubrir` no sirve para el escudo**: lo levanta fuera del
   bucle y el fotograma siguiente lo baja, porque el botón no está pulsado. La
   sonda leyó `nopush` en verde y cinco «resist» en rojo. Ahora aguanta el
   botón derecho del ratón. Y el puerto 5497 lo cogieron a la vez
   inventario97 y override97: cada `liberarPuerto` mataba el Vite de la otra.
   Éste usa el 5797.

## 5. La rotura deliberada

Cada una con `grep` de que estaba puesta, y quitada después (grep a cero).

| rotura | qué se puso rojo |
| --- | --- |
| R2: sin tope (`tope: Infinity` en `velocidadConTrabas`) | 3 de Node (el fallo, aturdido a 45, lento a 50) |
| R3: `game.time` sin «%.2f» | 1 de Node (el amontonamiento: «llegó a 12.5»). **En la sonda, nada**: el control «a los once segundos sigue al 50 % con un `effect_slow`» siguió verde —en once segundos el ruido del reloj no cayó del lado malo— y **se quitó** por no defender nada |
| R4: `nopush` siempre «0» | 1 de Node (el escudo) |
| R1: `main.js` sin `velocidadConTrabas` | sonda: aturdido 162 u/s y lento 90 u/s, 2 rojos. Node, verde: la costura sólo la ve la sonda |
| R5: `pasoDelEscudo` sin `ext_shield_up` | sonda: 2 rojos (`nopush`, inmune). Node, verde |
| R6: sin `noSaltar` en `main.js` | sonda: 2 rojos (aturdido y lento saltan 1,14 m) |
| R9: sin `noAtacar` en `main.js` | sonda: 1 rojo («el botón NO empieza un ataque» → true) |

## 6. Pendiente

- **En estos mapas nada aturde jugando.** La regla está y el camino del guion
  del jabalí al jugador está probado, pero **la IA no hace embestir al jabalí**
  (`boar_charge` cuelga de `npc_targetsighted` y de un `repeatdelay` que la
  caza portada no dispara, doc/IA_95.md) y **el zombi enano no salta**: su
  `ANIM_ATTACK` se alterna en el guion (`attack_1` lo cambia a `attack2`,
  :303) y la IA usa siempre el `golpe` horneado, `attack`. Es una regla sin
  quien la ejecute (el 62) hasta que la IA lea `ANIM_ATTACK`. La sonda aplica
  el efecto por la misma puerta que usaría el guion del bicho, y lo dice.
- **Con servidor no hay trabas.** `Partida._simular` (src/red/partida.js) no
  lee los efectos del jugador del servidor. No lo he tocado: es del agente de
  la defensa con servidor.
- **Bloquear el aturdimiento con el arma** (`check_block_stun`,
  debuff_stun.script:77-107: `POLE_IN_BLOCK` o `PARRY_ON` en la mano) pide
  `$get(<otra entidad>,scriptvar)`, que se apunta: hoy nunca bloquea.
- **`game.effect.anim.framerate`** (0,4 aturdido, 0,5 lento) se lee
  (`ritmoAnim`) pero no se aplica al modelo del jugador.
- **Un ataque ya empezado.** El motor sólo impide EMPEZAR (giattack.cpp:253);
  aquí `q.atacar = false` suelta también uno que se estuviera cargando, como ya
  hacía sentarse. Sin medir en el original.
- **`sfx_stunring`** (el anillo sobre la cabeza, `clientevent`) y el icono
  `alpha_stun` no se ven.
- `effect_push` del zombi (`applyeffect … effects/effect_push 2 …`) y el
  `addvelocity` del jabalí se apuntan; no se han mirado aquí.
