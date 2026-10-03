# El mordisco sale del evento de animación — experimento 92, pieza A

Hasta el 91 el golpe de un bicho lo ponía la IA portada: en `Manada.cazar`,
al decidir `GOLPEAR`, tiraba `acierta`/`danoDe` con los números horneados y
llamaba a `golpear`; el guion se enteraba después (la costura del 91). En
Master Sword es al revés: la IA sólo pone la animación de atacar, y es el
**modelo** el que, en el fotograma del mordisco, llama al guion por su nombre:

    case 500: //Animation Event 500 - Call any script event
      if (pEvent->options) CallScriptEvent(pEvent->options);
    case 600: //Animation Event 600 - Call Attack() on my held weapon
      //... or do damage if its an anim type attack
      if (pEvent->options) CallScriptEvent(pEvent->options);
                                     msmonsterserver.cpp:1484-1493

Ese evento (`bite1` en giantrat.script:63-67) hace `dodamage`, `DoDamage`
decide si entra (giattack.cpp:1532-1730) y al final el motor le contesta al
guion con `game_dodamage` y, si el ataque traía `dmgevent:<x>`, con
`<x>_dodamage` (giattack.cpp:2030-2058). Este experimento porta ese camino.

## 1. Lo medido ANTES de escribir

**Los eventos de los modelos de los bichos de combate**, leyendo el `.mdl` de
cada uno (`eventosDeModelo`, el lector del censo del 91) y buscando en el
guion del mapa el bloque que lo maneja (script de medida en el scratchpad, no
en el repo):

| mapa | bicho ×n | secuencia de ataque → evento | lo que hace el guion |
| --- | --- | --- | --- |
| gatecity | goblin ×8 | `battleaxe_swing1_L` f22 600 `swing_axe` | `if $get(NPCATK_TARGET,range) < ATTACK_HITRANGE` → `npcatk_dodamage NPCATK_TARGET direct …` |
| gatecity | spider ×2 | `attack` f12 600 `frame_bite1` | `xdodamage ent_lastseen ATTACK_HITRANGE … pierce dmgevent:bite` |
| gatecity | spider_spitting | `attack` f12 600 `bite1` | `xdodamage HUNT_LASTTARGET …` + `tossprojectile` |
| gatecity | dwarf_zombie_random ×16, _sword, _bigaxe ×2 | `attack` f6 600 `attack_1` | `npcatk_dodamage ENTITY_ENEMY …` |
| gatecity | gatecity/guard | `attack` f6 600 `attack_1` | `dodamage ent_lastseen … slash` |
| gatecity | spider_mini ×4 | `attack` f12 600 `bite1` | `callevent frame_bite1` |
| edana / sala88 | giantrat | `attack` f14 600 `bite1` | `dodamage ent_lastseen ATTACK_RANGE …` |
| edana | boar ×4, boarhard, boarboss | `gore_forward` f17/f8 600 `gore_forward` | empujón + `dodamage ENTITY_ENEMY …` |
| edanasewers | spider_mini_poison | `attack` f12 600 `bite1` | `frame_bite1` → `xdodamage … dmgevent:bite` → **`bite_dodamage`: `applyeffect ent_laststruckbyme effects/dot_poison`** |
| edanasewers | zombie_decayed_nr, slimes, bat, tutorial/rat | `bite1` / `attack_1` | `dodamage`/`npcatk_dodamage` |
| gertenheld_forest2 | giantrat ×4, goblin ×8 | `bite1` / `swing_axe` | **0 manejadores**: el `guiones.json` de ese mapa no trae esos dos guiones |

Todos los bichos de combate de los cinco mapas tienen su golpe en un evento
600 del modelo. Los 500/600 que no son de ataque (`walk_step*`, `warcry_done`,
`frame_jump`…) también se despachan.

**En el bestiario entero** (los 675 guiones de `monsters/` con modelo,
`build/msr/bichosguion.json`, siguiendo la cadena de `callevent` desde cada
evento de animación que el guion maneja):

| | guiones |
| --- | ---: |
| su modelo llama a un evento que el guion maneja | **559** (el número del censo del 91) |
| … y desde ahí llega a un `dodamage`/`xdodamage` | **539** |
| … sólo a un `tossprojectile` | 18 |
| … a ninguno de los dos | 2 |
| con un `dmgevent:` en ese daño | 206 |
| … cuyo `<dmgevent>_dodamage` el guion maneja | 100 |
| … y ahí hace `applyeffect` | **89** |

O sea: el daño de 539 de los 675 bichos, y el efecto al golpear de 89, viven
en este camino.

**Lo que el encargo daba por hecho y el mod no dice.** «La araña de Gate City
te envenena al morder»: **no**. `monsters/spider` muerde con `frame_bite1`
(spider_base.script:31-35), `xdodamage … dmgevent:bite`, y **no maneja
`bite_dodamage`** — ni ella ni `spider_base`. Su veneno es el SALTO: un
`repeatdelay 4` con un 20 % (`SPIDER_LATCH_ATKCHANCE`) pone `jumpmiss`, cuyo
evento `frame_jump` la lanza, y al caer encima `spider_latch_hit` aplica
`effects/effect_spiderlatch`, que pone `dot_poison` (spider.script). Este
puerto no arma `repeatdelay` para un NPC (el 91, §5.8) ni tiene
`setvelocity`/`setfollow`, así que el salto no existe. La que SÍ envenena al
morder es la **Poisonous Spider** de las cloacas de Edana
(spider_mini_poison.script:51-54), y es la que se ha medido.

## 2. Lo portado

**El horneado** (`tools/bicho.mjs`, `eventosDeSecuencia`): cada secuencia del
`bicho.json` lleva `eventos: [{frame, evento, opciones}]`, los del servidor
(< 5000, `EVENT_CLIENT`, monsterevent.h:27; animation.cpp:322). Rehorneados
los cinco mapas (`npm run mapa:bichos -- --mapa <m>`). La prueba comprueba que
coincide con `eventosDeModelo` del censo en cinco modelos.

**El reloj de los eventos** (`Manada.eventosDeAnimacion`, al principio de
`cazar`): es `DispatchAnimEvents` + `GetAnimationEvent` (animating.cpp:125-167,
animation.cpp:290-330). `pon`/`deUnaVez` apuntan cuándo se rebobinó la
secuencia (`anim.desde`), y en cada vuelta se disparan los eventos 500/600
cuyo fotograma cae en `[visto, ahora)`; los de bucle, una vez por vuelta.
También para un cadáver (msmonsterserver.cpp:2626), no para uno dormido. Sólo
con oyente, y sólo a los bichos de combate (los pasos de un aldeano no se le
cuentan a nadie: `InteraccionesNpc`, caso `animacion`).

**Quién pone el daño — la regla de convivencia, sin dos daños por golpe**
(`Manada.cazar`, rama `GOLPEAR`, y `_atacaPorGuion`): antes de poner la
animación de ataque se pregunta al oyente si el guion maneja alguno de los
eventos 500/600 de esa secuencia.

- **Sí** → la IA NO tira `acierta`/`danoDe` ni llama a `golpear`; sólo pone
  la animación y arranca su espera. El daño lo pondrá el `dodamage` del guion
  cuando la animación pase por su fotograma. Se cuenta en
  `golpesDelGuion.atacaPorGuion`.
- **No** (sin costura enchufada, sin eventos horneados en el modelo, o con el
  evento sin manejar) → la IA pega como desde el 17. En el motor ese caso
  sería un monstruo que no hace daño; aquí se deja la IA porque es como pega
  hoy todo lo que no tiene costura (los dos de gertenheld sin guion horneado,
  un servidor sin oyente), y queda dicho.

**El objetivo, escrito donde lo lee el guion** (`GuionDeNpc.apuntarObjetivo`):
los eventos de caza que lo escribirían están cerrados (el 91), así que al
decidir el ataque la costura escribe lo mismo que ellos: `NPCATK_TARGET`,
`HUNT_LASTTARGET` y `ENTITY_ENEMY` (las dos familias escriben las tres:
base_npc_attack_new.script:445 y :508-509; base_npc_attack.script:525-526,
:594-595) y `ent_lastseen`, que en el motor sólo escribe `$cansee`
(npcscript.cpp:1844). `esElJugador` resuelve ahora `ent_lastseen` con lo que
`ve` ya guardaba en `ultimoVisto` y nadie leía.

**El `dodamage` del guion** (`GuionDeNpc` → `entorno.hacerDano` →
`Manada._golpeDelGuion`), sólo dentro de un evento de animación:

- **Traza** (`dodamage <obj> <alcance> …`): esfera desde el OJO
  (npcscript.cpp:1121) de radio alcance + media anchura del bicho + media del
  objetivo, que para el jugador es 0 (npcscript.cpp:1146-1157; el 82);
  `xdodamage` sólo suma la del atacante (scriptcmds.cpp:7425-7427). Sin pared
  (`veA`, giattack.cpp:1563-1566) y en el cono estrecho de ±45° en el plano
  (`FInViewCone(…, VIEW_FIELD_NARROW)`, giattack.cpp:1572; combat.cpp:1186-1205).
  **Apartarse durante el amago esquiva el mordisco**, que con el daño de la
  IA no podía pasar.
- **Directa** (`dodamage <obj> direct …`): sin alcance ni cono.
- Las dos: `CanDamage` (relación ≤ neutral, msmonsterserver.cpp:83-87), el
  daño por el `dmgmulti` del mapa si es > 0 (npcscript.cpp:1160-1162), la
  tirada `RANDOM_LONG(0,99) < 100 − acierto` falla (giattack.cpp:1709-1713).
  Si entra: `game_damaged_other` con el `dmgevent`, la defensa del jugador
  (`golpear`, ahora con el TIPO del `dodamage`) y `game_dodamage`; si no, sólo
  `game_dodamage` con «0». Y después de `game_dodamage`, `<dmgevent>_dodamage`
  con los mismos parámetros, acierte o no (giattack.cpp:2046-2059). Un
  `dmgevent` con `*` va al objeto que inflige y no se porta.

**El veneno firmado.** `applyeffect` de un guion de NPC pasa al efecto un
aplicador con `nombre` e `instancia` (antes sólo `id` y `propiedad`): el
`main.js` arma con eso el «X hits you» y el cono del escudo. Sin esto la línea
decía «none hits you: 2.0 poison damage.».

**`$get(<jugador>,maxhp)` ya no es «0»** (lo midió la pieza B del 92 y lo
pidió el coordinador; las citas se comprobaron aquí). El 46 leyó que la rama
de `maxhp` (scriptcmds.cpp:1388-1391) está dentro de `else if (pMonster)` y
que un jugador no casa. Falso: `GetProp` rellena `pMonster` con
`IsMSMonster()` (scriptcmds.cpp:926), `CBasePlayer` hereda de `CMSMonster`
(player.h:396) y éste devuelve `true` (msmonster.h:352). La rama devuelve
`RETURN_FLOAT(MaxHP())` —«%.2f», iscript.h:224— y `CBasePlayer::MaxHP` es la
fórmula de `derivadas().vidaMax` (playershared.cpp:1067-1076). Con «0», el
veneno que reparte `game_dodamage` de base_monster_shared —el 5 % del `maxhp`
del objetivo, :1334— le hacía cero al jugador. Y la conclusión del 46, «la
tarifa del guardarropa es cero», era falsa dos veces: el guion la sube a 25
en la línea siguiente (`if ( USE_FEE < 25 ) setvard USE_FEE 25`,
NPCs/base_storage.script:153). El comentario del 46 se deja con la
corrección al lado; la prueba del 46 (`test/juego_menus46.test.mjs`) se ha
cambiado a la lectura buena con la vieja citada, y el `test.todo` de
`test/costurared92b.test.mjs` es ahora una prueba. Rotura R7 (devolver «0»):
2 rojas. El `maxhp` de un MONSTRUO sigue sin los dos decimales del motor; no
se ha tocado.

**Lo que cambia para el jugador, medido:**

- La rata y la araña muerden en el fotograma 14 y 12 de su ataque, no en el
  instante en que la IA decide.
- El mensaje lleva el tipo del guion: «Leaping Cave Spider hits you: 3.0
  pierce damage.»; el guardia, `slash`; el goblin, **«PARAM6»** (ver §3).
- El zombi de Gate City pega con el daño del ARMA que su guion sorteó al nacer
  (20/30/40/55/50, dwarf_zombie_random.script:165-252), no con el 20 que lee el
  horneado. La prueba lo mide con seis semillas.
- La Poisonous Spider envenena: «You have been poisoned!», «Poisonous Spider
  hits you: 2.0 poison damage.». Su `$rand(1,5)` de daño por segundo es del mod.

## 3. Rarezas del mod que se portan porque deciden ramas

- **El goblin pega con tipo «PARAM6».** `npcatk_dodamage` reenvía PARAM5-7 al
  `dodamage` (base_monster_shared.script:1163-1171) y el goblin le da cuatro;
  el motor sólo crea `PARAM1..n` con los que llegan (script.cpp:5709), y una
  variable que no existe vale su nombre. El zombi, igual, con «PARAM5».
  `elementoDe` no la reconoce, así que el mensaje sale sin elemento.
- **`bite_dodamage` no mira si acertó** y apunta a `ent_laststruckbyme`, que
  sólo se escribe al acertar (giattack.cpp:1754-1756). Antes del primer
  mordisco que entra no envenena a nadie; desde ese momento envenena con cada
  mordisco, también los fallados. Prueba: «LA RAREZA DEL MOD».
- **Un golpe al aire no le llega al guion.** Sin nadie en la esfera el motor
  traza recto contra el mundo y, si toca pared, `game_dodamage` corre con el
  mundo de objetivo (giattack.cpp:1615-1630). Eso no está portado: aquí no hay
  `game_dodamage` y se cuenta en `alAire`.

## 4. Lo que se entendió mal por el camino

- **El encargo: «la araña de Gate City te envenena al morder».** Ver §1. Se
  midió el guion antes de escribir nada y no lo hace. Queda como control
  negativo en la prueba y en la sonda: muerde por su guion, con `pierce`, y no
  envenena.
- **Reconocer la familia por `npcatk_settarget`.** Lo escribí así para elegir
  qué variable escribir, y la prueba de la rata lo desmintió: la familia vieja
  también tiene un `npcatk_settarget` («forward compatibility»,
  base_npc_attack.script:737) y `base_monster_shared` otro (:1058). Leyendo
  más: las dos familias escriben las tres variables. Ahora se reconoce por el
  bucle que DEFINE (`npcatk_hunt` / `hunting_mode_go`) y se escriben las tres.
- **`probe.ia.correr` no movía el reloj de la manada.** `sondas/mordisco82.mjs`
  se puso roja —«0 golpes en 12 s» con la rata pegada— con el trabajo bien
  hecho: `correr` llamaba a `cazar` y no a `bichos.animar`, así que dentro de
  la sonda la animación de atacar no pasaba nunca del fotograma 0. Mientras el
  daño lo ponía la IA al decidir, no importaba. `correr` ahora hace lo que el
  bucle de `main.js` y lo que ya hacía `avanzar`: los dos pasos. El 59 otra
  vez — *el paso de la sonda tiene que ser el paso del jugador*.
- **Un carácter NUL en `tools/bicho.mjs`.** El parche lo escribí con Python
  desde un *heredoc* y el `\0` de la expresión regular llegó al archivo como
  un byte 0 (`grep` lo llamó «binario»). Se arregló byte a byte y se comprobó
  que el `git diff` es sólo lo añadido y que los finales de línea siguen CRLF.
- **Una prueba vieja que falla una de cada seis.** `test/costura91.test.mjs`,
  «CONTROL DEL ABSORBER», recibe a veces un `idle1` de más: es el bloque sin
  nombre de giantrat.script:76-83 (`$rand(0,5)` y `playanim once ANIM_IDLE2`)
  corriendo al nacer. Se vio al hacer las roturas de este experimento; no es
  de esta pieza ni se ha tocado.
- **El rehorneado cambió algo que no era mío**: en Gate City los tres
  `dwarf_zombie_hbow` pasan de `andando: null` a `"walk"`. Es el código de
  `HEAD` horneando sobre un `bichos.json` más viejo; se dice y no se toca.

## 5. Cómo se comprueba

- `test/mordisco92a.test.mjs` — 21 pruebas, entrando por una `Manada` de
  verdad con `InteraccionesNpc` enchufado y los guiones del MOD; el tiempo
  con `relojes` + `cazar`, como el juego. Ninguna llama a `eventosDeAnimacion`
  ni construye el `dodamage`.
- `sondas/mordisco92.mjs` — por el menú en sala88, edanasewers y gatecity:
  **25 de 25**. Controles negativos: la rata no envenena; la araña de Gate
  City muerde con `pierce` y no envenena. El control del doble daño: los
  `game_damaged_other` del guion son exactamente los `dodamage` que entraron.

**Roturas deliberadas**, cada una con un reemplazo que falla si no casa
exactamente una vez, comprobada con `grep ROTURA92A` = 1 y quitada con
`grep` = 0:

| rotura | Node (mordisco92a + costura91) | sonda |
| --- | --- | --- |
| R1: la IA pega aunque pegue el guion (sin el `continue`) | 7 rojas | 2 rojas: «NI UN GOLPE DE LA IA» (2 contra 1) y el tipo `pierce` |
| R2: `eventosDeAnimacion` no despacha | 8 rojas | — |
| R3: sin `<dmgevent>_dodamage` | 3 rojas | 5 rojas: todo el veneno y el `bite_dodamage` de las dos arañas |
| R4: `ent_lastseen` no resuelve | 8 rojas | — |
| R5: el aplicador del veneno sin nombre | 1 roja | — |
| R6: sin `dmgmulti` | 1 roja | — |
| R7: `$get(<jugador>,maxhp)` vuelve a «0» | 2 rojas (menus46 y costurared92b) | — |

**Las sondas vecinas**, después: `costura91` 19/19, `veneno91` 15/15,
`sala88` 10/10, `edana80` 21/21, `ia` 15/15, `mordisco82` 14/14 (tras
arreglar `probe.ia.correr`, ver §4; antes 11/14). `mundo` da 41/44 con tres
rojas —la animación de andar de tres que pasean, `set_self_adj` y los jefes
del ×4— **las mismas tres con el `bichos.json` de Gate City de antes del
rehorneado**, y ninguna pasa por la caza; no son de esta pieza y no se han
diagnosticado. Una pasada de `veneno91` salió roja («no hay araña viva»)
y la siguiente 15/15: la sonda mira a los 2,5 s y las arañas salen de su
área a los ~3 s; no se ha tocado.

## 6. Lo que queda abierto

1. **La espera entre golpes** sigue siendo `HACK_ATTACK_DELAY 1.0`. El
   evento ya se lee, pero de dónde saca el motor la espera no se ha leído.
2. **Los alcances del horneado y los del guion pueden no coincidir.** El
   zombi de Gate City sortea `ATTACK_RANGE` 50-125 al nacer y la IA decide
   con el del horneado; ahora el golpe usa el `ATTACK_HITRANGE` del guion.
   Quien decide CUÁNDO atacar sigue siendo la ficha horneada.
3. **El salto de la araña de Gate City** (su veneno de verdad): pide armar
   `repeatdelay` en un NPC, `setvelocity`, `setfollow`, `setorigin`, y que
   `frame_jump`/`frame_falloffend` lleguen con el cuerpo de la IA. No hecho.
4. **El golpe al aire contra el mundo** (`game_dodamage` con el mundo de
   objetivo, giattack.cpp:1615-1630) y las formas en radio y de vector a
   vector de `dodamage`: se cuentan (`formaSinPortar`) y no se hacen.
5. **Un `dodamage` fuera de un evento de animación** (desde un `callevent`
   con retraso o desde `npc_targetsighted`, como la embestida del jabalí) se
   apunta y no pega.
6. **`$get(ent_me,id)` de un bicho sigue dando «0»** (el 91, §5.13). El
   veneno funciona porque el aplicador lleva ese mismo «0», pero dos venenos
   de dos arañas tendrían la misma asa.
7. **gertenheld_forest2**: su `guiones.json` no trae `monsters/giantrat` ni
   `monsters/goblin`; ahí pegan por la IA. Hace falta rehornear los guiones de
   ese mapa (`npm run guiones`), que no es de esta pieza.
8. **El servidor** (`src/red/partida.js`, de la pieza B): los sucesos nuevos
   (`ataca`, `animacion`) llevan `quien` con el objetivo para que su
   `alCombate` resuelva el jugador; no se ha medido con dos jugadores.
9. `setanim.framerate` (lo piden las arañas en `frame_bite1`) no está: el
   reloj de los eventos va con el `framerate` a 1.
10. Los eventos de animación de un NPC SIN ficha de combate (el martillo del
    herrero, `frame_hammer`) no se le entregan a su guion.
