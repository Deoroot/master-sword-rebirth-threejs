# Los bichos aturden solos — experimento 98 (agente I)

El 97 portó lo que le pasa al jugador aturdido (`src/play/trabas.js`) y dejó
dicho lo que faltaba (doc/ATURDIR_97.md §6): **en estos mapas nada aturde
jugando**. La regla estaba y el camino del guion del jabalí al jugador estaba
probado, pero llamándole el evento a mano; la sonda del 97 aplicaba el efecto
por la puerta de `applyeffect` y lo decía. Era el 62 —una regla escrita,
citada y en verde que no corre— con su diagnóstico al lado.

```bash
node --test test/aturdir98.test.mjs   # 11 verdes
npm run sonda:aturdir98               # Gate City por el menú: 18 de 18
```

## 1. Quién puede aturdir, contado antes de escribir

Los guiones de `build/<mapa>/bichos.json` con su cadena de `#include` entera,
buscando `debuff_stun`/`effect_stun`/`effect_slow`/`webbed`:

| mapa | bicho | cuántos | camino |
| --- | --- | ---: | --- |
| Gate City | `monsters/dwarf_zombie_random` | 16 | `attack_2`, el evento del salto (dwarf_zombie_random.script:306-316): `applyeffect … debuff_stun $rand(2,8)` |
| Gate City | `monsters/dwarf_zombie_bigaxe` | 2 | el mismo (fuerza `WEAPON_TYPE 2`, `ATTACK2_CHANCE 25`) |
| Gate City | `monsters/dwarf_zombie_sword` | 1 | el mismo (`WEAPON_TYPE 3`, `ATTACK2_CHANCE 15`) |
| Edana | `monsters/boar` | 4 | `boar_charge_hit` (boar_base.script:178-184) — **pero `BOAR_CAN_CHARGE 0`** (boar.script:11): no embiste nunca |
| Edana | `edana/boarhard` | 1 | la embestida (`BOAR_CAN_CHARGE 1`, boar_hard.script:6) |
| Edana | `edana/boarboss` | 1 | la embestida (boarboss.script:7) |
| sala88 | — | 0 | sólo una rata |
| gertenheld_forest2 | `monsters/boar` ×11, `monsters/skeleton_mage` ×1 | | el jabalí común no embiste; el mago por `slam_dodamage`/`kick_dodamage` (skeleton_mage.script:205-245) |

Del zombi aturdido por Gate City, los que pueden saltar son los tipos 2, 3 y 4
(`ATTACK2_CHANCE` 25, 15, 30, :220-268); el 0 y el 1 tienen 0. El tipo se
sortea al nacer (`pick_weapon_type`, :384-413).

**Dos mecanismos, y los dos los comparten más bichos de los que aturden:**

- **El zombi salta porque su guion cambia `ANIM_ATTACK`.** `attack_1` —el
  evento del fotograma 6 de `attack`— hace `if ( $rand(1,100) < ATTACK2_CHANCE
  ) setvard ANIM_ATTACK ANIM_LEAP` (:303), y el siguiente ataque de la base es
  `playanim once ANIM_ATTACK` (`npcatk_attack`, base_npc_attack_new.script:
  614-621). La IA del puerto ponía siempre `ficha.ia.golpe`, que es el valor
  AL NACER: `attack`. El jabalí hace lo mismo con sus tres cornadas en
  `npc_attack` (boar_base.script:103-109), el zombi podrido con su ataque de
  enfermedad en `npc_selectattack` (zombie_decayed.script:107-114), el
  esqueleto venenoso en `attack_1` (skeleton_poison_random.script:327) y el
  mago esqueleto en `npc_selectattack` (skeleton_mage.script:148-170).
- **El jabalí embiste desde `npc_targetsighted`** (boar_base.script:114-124),
  que las dos bases llaman en cada ciclo de caza con el objetivo a la vista
  (base_npc_attack.script:118-120 y :154-155; base_npc_attack_new.script:
  303-307). El puerto no lo llamaba nunca. Y su golpe sale de un bloque de
  `repeatdelay 0.1` (boar_base.script:164-176), con un `dodamage` que, fuera de
  un evento de animación, este puerto apuntaba y no hacía (el 92).

## 2. Lo portado

- **`src/play/ia.js`** — `Cazador.tic` devuelve `ve`: el `NPC_CANSEE_TARGET`
  del ciclo.
- **`src/play/manada.js`, `cazar`** —
  - con `ve`, `_costura("visto")` → `npc_targetsighted <objetivo>`, ANTES de
    decidir el ataque (el orden de la vieja, :118-123), y lo que deja hacer el
    guion (`CAN_ATTACK`) se vuelve a preguntar después: `boar_charge` lo pone a
    0 en esa misma llamada;
  - al atacar, `_animDeAtaque`: `npc_selectattack` y el `ANIM_ATTACK` de ahora
    (`_costura("eligeAtaque")`); con ésa se pregunta `_atacaPorGuion` y se
    hace `pon`. Si el nombre no está en las secuencias horneadas se cuenta en
    `golpesDelGuion.animSinHornear` (y `cualesSinHornear`), porque casi
    siempre será un hueco del horneado y no del modelo;
  - después del `pon`, `npc_attack` (sólo la vieja, base_npc_attack.script:217);
  - al perseguir, la de correr es el `ANIM_RUN` de ahora (`_animDelGuion`): el
    jabalí embiste con `charge` (`setvar ANIM_RUN ANIM_CHARGE`, :132);
  - `_golpeDelGuion` apunta a `objetivoDelGuion ?? objetivoCazado`: la
    embestida pega sin que la IA haya atacado.
- **`src/play/npcguion.js`** — `familiaDeCaza`, `visto`, `eligeAtaque`,
  `atacado`, `animDe`. Todo pasa por `costura`: lo que pidan al cuerpo
  (`playanim`, `setmovedest`) se lo queda la IA (`absorbe`); las variables,
  `movespeed` y los efectos corren.
- **`src/juego/interacciones.js`** — los cuatro casos nuevos de `_alCombate`
  (y fuera para los aldeanos), y **un gancho de daño fijo** para cada bicho de
  combate (`g.alHacerDano` → `Manada._golpeDelGuion`). El caso `animacion`
  sigue poniendo el suyo y devolviendo éste al acabar.
- **`tools/bicho.mjs`, `sinCondicion`** — el horneado no veía una asignación
  detrás de un `if ( … )` ni de un `else`: ni `attack2` del zombi ni
  `gore_left`/`gore_right` del jabalí estaban en `build/`. Rehorneados los
  cinco mapas (`node tools/bichos.mjs --mapa <m>`).
- **`src/dev/sonda.js`** — `probe.costura.de` lee también `ANIM_ATTACK`,
  `ATTACK2_CHANCE`, `BOAR_IS_CHARGING`, `PUSH_VEL` (una línea).

`src/red/fauna.js` y `src/red/partida.js` **no se han tocado**: el servidor
usa la misma `Manada.cazar` y la misma costura (`Partida` llama a
`enchufarA`), así que todo esto le llega igual. Que el jugador del servidor
quede trabado es de `_simular` (agente J).

## 3. Lo que se entendió mal por el camino

**El arnés que persigue al jugador.** Copié el de test/mordisco92a, donde el
jugador está siempre a `aU` unidades DEL BICHO. Para un mordisco da igual;
para una embestida, no: la primera pasada fue un jabalí corriendo 16 000
unidades a ritmo 3 detrás de un jugador que se movía con él. Ahora el jugador
se queda donde se le pone (`colocar`).

**«Sin haber corneado no aturde» se leía al final.** Pasados 20 s el jabalí ya
había llegado, corneado y dejado `PUSH_VEL` puesto. Se para en el instante en
que la embestida pega.

**Los arneses de otras pruebas reescribían el nombre del ataque.**
`test/mordisco92a` y `test/override97` ponían `golpe: "attack"` en la ficha y
llamaban `attack` a la secuencia de prueba. Con la IA preguntando al guion, el
goblin pedía `battleaxe_swing1_L` y el esqueleto `attack1`, no estaban, caían
en la 0 y no llegaba ningún evento: cinco rojos con el juego bien. Es el 59 al
revés —el arnés decidía algo que en el juego decide el guion—. Ahora la
secuencia de prueba se llama como el `ANIM_ATTACK` del guion. Y dos más que
salieron de lo mismo:
- el zombi de mordisco92a sorteaba el salto, `attack2` no estaba, y pegaba la
  IA con el 20 horneado («55 y [55,…,20,20]»). Ahora con el modelo de verdad,
  y cada golpe es el de `attack` o el del salto, los dos del guion;
- el esqueleto de override97 sorteaba `attack2` en uno de cada tres
  `attack_1`, y sin `attack2` en el modelo no llegaba nunca su `attack_2`, que
  es quien lo devuelve a `attack1`: **se quedaba en `attack2` para siempre**.
  Rojo una pasada de cada pocas, porque el sorteo es del guion (`$rand`) y no
  del dado del arnés. El modelo de prueba lleva ahora su `attack2`.

**Corrección a test/mordisco92a**, escrita en la propia prueba: «un `dodamage`
fuera de un evento de animación no pega y se apunta» medía el hueco declarado
del 92, no una regla del motor. Ahora pega, y la de antes queda escrita.

**La rotura que no estaba puesta.** El ayudante de roturas que escribí en el
directorio de trabajo lo pisó otra sesión con uno suyo del mismo nombre: la
primera pasada de la sonda «rota» corrió sin rotura, y lo cantó el `grep -c
ROTURA98` a cero (el 80, otra vez). Ahora se llama `romper98_agenteI.py`.

**Y la sonda rota se quedó esperando.** Con R1 puesta la sonda aguardaba el
primer aturdimiento 180 s y luego seis veces 120 s por medida: más de veinte
minutos con `manada.js` roto en un árbol compartido. Se cortó a mano, se quitó
la rotura (grep a 0) y la sonda ahora se cae —roja— si no hay primer
aturdimiento.

## 4. Lo medido

**Node** (`test/aturdir98.test.mjs`, 11 verdes). `Manada` + `InteraccionesNpc`
enchufada + `GuionDelJugador` con sus efectos horneados; la ficha de
`leerFichaNpc` sin tocar y las secuencias del `.mdl` de verdad.

| caso | resultado |
| --- | --- |
| horneado: `attack2`, `gore_left/right`, `charge` en la lista y en `build/` | sí |
| hacha grande: ataca con `attack`, salta solo, «You have been stunned!», 45 %/sin saltar/sin atacar | sí, el salto antes del aturdimiento |
| tras el salto vuelve a `attack` (:311) | sí |
| desarmado (`ATTACK2_CHANCE 0`): 60 s atacando, ni un salto | sí (control) |
| «Ferocious Wild Boar»: cornea, de lejos embiste con `charge` a ritmo 3, pega 4, aturde 3 s, para | sí; 2,8-3,4 s |
| mientras embiste: `movespeed 3`, `CAN_ATTACK 0` | sí |
| de cerca (< 256) no embiste, y cornea | sí |
| las tres cornadas, del sorteo de `npc_attack` | ≥ 2 distintas en 40 s |
| el jabalí común (`BOAR_CAN_CHARGE 0`) de lejos: lo ve y no embiste | sí |
| EL FALLO DEL MOD: embestida sin haber corneado llega y no aturde (`if` viejo, :90) | sí |

**Sonda** (`sondas/aturdir98.mjs`, **18 de 18**), Gate City por el menú, sin
aplicar nada: libre 157-163 u/s, salta 1,14-1,26 m, el botón ataca; un zombi
con `ATTACK2_CHANCE 30` ataca (`attack_1` ×4), salta (`attack_2` ×1) y el
jugador queda con `movespeed 45`/`canattack 0`/`canjump 0` («You have been
stunned! ( 91 / 0 )»); aturdido anda **45,2-45,5 u/s**, no salta (0,000 m),
el botón no ataca; `animSinHornear` 0; se le pasa y anda 150-175.

`node --test` de todo `test/` menos `red_27`: **2 855 verdes, 0 rojas** (1
saltada, 1 todo). `red_27` sola: 49/49. En la tanda entera, con otras cinco
sesiones en la máquina, `red_27` «una partida entera por un socket de verdad»
cae en «y el servidor le ha movido de verdad» y **deja el proceso colgado**: la
prueba no cierra el servidor si una aserción falla. Ese test no usa bichos
(`mundoLiso`) y este trabajo no toca `src/red/`; el 97 ya lo había visto
sensible a la carga (doc/ATURDIR_97.md §3).

Vecinas, cada una sola: aturdir97 24/24 (la primera pasada, con 31 procesos de
Chrome y Node de otras sesiones, dio 20/24 con «libre 197 u/s»: la siguiente,
24/24), golpe 26/26, consecuencias 55/55, mordisco92 25/25, salto93 15/15.

## 5. La rotura deliberada

Cada una con un reemplazo que falla si no casa una vez exacta y `grep -c
ROTURA98` a 1 puesta y a 0 quitada.

| rotura | qué se puso rojo |
| --- | --- |
| R1 `_animDeAtaque` devuelve la horneada | Node: las dos del salto y la de las cornadas. **Sonda**: 180 s, 92 ataques, 48 `attack_1`, ni un `attack_2`, sin aturdimiento |
| R2 sin `visto` (`npc_targetsighted`) | Node: 5 del jabalí (las de control, que piden que lo vea, también) |
| R3 sin el gancho de daño fijo | Node: la embestida no pega (2) |
| R4 `sinCondicion` sin quitar el `if` | Node: la del horneado |
| R5 la de correr, la horneada | Node: «corre con `charge`» |
| R6 `_golpeDelGuion` sin `objetivoCazado` | Node: la del fallo del mod (su control, «la embestida llegó»); **con una cornada antes, verde**: `objetivoDelGuion` ya estaba puesto |
| R7 sin `npc_attack` | Node: la de las tres cornadas; ninguna del aturdimiento (el zombi no lo usa y el jabalí embiste igual) |

## 6. Pendiente

- **El jabalí que aturde no se ve jugando en Edana**: el `boarhard` y el jefe
  son la segunda y tercera oleada del corral (`porDisparo`, alPerecer
  `wave3_2`), y los cuatro de la primera son el común, que no embiste. No hay
  sonda de navegador del jabalí; lo mide Node con su guion y su modelo.
- **`HUNT_AGRO 0` del jabalí no se respeta**: boar_hard.script:8 pone 1 y
  boar_base.script:13 lo vuelve a 0 después (la base va incluida debajo), así
  que en el mod el «Ferocious Wild Boar» no te caza hasta que le pegas. El
  puerto no lee `huntAgroViejo` (horneado, sin lector) y lo caza todo `hostil`.
  No es de este experimento; anotado.
- **`npc_targetsighted` corre ahora para todos los de caza**, y con él cosas
  que nadie ha medido: el grito del goblin, el escupitajo de lejos de la
  araña escupidora (su `playanim` lo absorbe la costura: no escupe), el
  murciélago que se descuelga, el zombi de ballesta que rueda hacia atrás con
  `addvelocity ent_me` si estás a < 64 (dwarf_zombie_sbow.script:142-175; el
  `playanim critical` se absorbe, el empujón no) y la llamada
  `ext_targeted_by_mob` al jugador (base_monster_shared.script:1483-1517).
- **El mago esqueleto** (gertenheld_forest2) aturde desde `slam_dodamage` y
  `kick_dodamage`; comparte el mecanismo de `npc_selectattack`, pero pide
  `$get(PARAM2,relationship,ent_me)` y `dmgevent:`. Sin medir.
- `addvelocity ent_laststruckbyme` de la embestida y el `effect_push` del
  salto del zombi siguen apuntándose (el 97).
- La de huir sigue siendo la horneada (`ANIM_RUN` sólo al perseguir).

## 7. Corrección de la integración: el control positivo del salto

Con todo junto la sonda dio 17/18 tres veces seguidas: «libre salta» medía
0,04-0,10 m (y una de mis pasadas ya lo había dado, −0,13 m, y lo «arreglé»
esperando más: no era eso). La sospecha era el cambio de J (los cinco `if` de
trabas a `trabarIntencion`, `juntarTrabas`). **No lo es**: en el fotograma del
salto el bucle no lee ninguna traba (`noSaltar` falso), y aturdir97 salta 1,14 m
en sala88.

Medido fotograma a fotograma en Gate City: tras `probe.mundo.poner` en el
sitio de aparecer, el jugador se queda FLOTANDO a −14,48 (el suelo, donde
aterriza después, es −14,61) con `grounded` a uno. Al saltar, 268 u/s hacia
arriba, y en el fotograma siguiente −67: la regla «techo» de `Player.step`
(src/play/player.js, `if (mover[1] > 0 && applied.y < mover[1] / U * 0.5)
this.vel[1] = 0`) cree que ha chocado, porque el controlador de Rapier no
aplica entera la primera subida desde esa posición. De seis saltos así,
fallan dos; quietos y sin teletransporte, fallan casi ninguno. Tras andar 0,3 s,
seis de seis.

Dos cosas que probé y no eran:

- **El toque de barra entre dos fotogramas.** Con la página a ~7 fotogramas
  por segundo, una barra de 150 ms puede caer entera entre dos, y este puerto
  la perdía: `pulsadas` sólo decía lo que estaba abajo al mirar. GoldSrc no la
  pierde: `KeyDown` pone «impulse down» (`b->state |= 1 + 2`, input.cpp:344),
  `CL_ButtonBits` cuenta `state & 3` (:915) y lo borra después (:1001). Eso SÍ
  era un hueco y queda portado (`Teclas.impulsos`, src/juego/teclas.js, con
  tres pruebas en test/aturdir98) — pero la sonda siguió roja: no era la causa.
- **`if (velocity[2] > 180) onground = -1`** (pm_shared.cpp:1785-1788) en
  `Player.step`. Lo puse y fue PEOR (cero de seis): sin `grounded`, el primer
  paso sube y la regla del techo lo mata antes. Se quitó: es del motor, pero
  aquí choca con un apaño nuestro, y portarlo bien pide portar
  `PM_FlyMove`/`ClipVelocity` en vez de la regla del techo.

La sonda ahora se asienta ANDANDO 0,3 s antes de cada salto, en el positivo y
en el negativo por igual: 18/18 tres veces seguidas (1,13-1,14 m libre, 0 m
aturdido), y R1 sigue roja (180 s, 135 ataques, 71 `attack_1`, ningún
`attack_2`: 6 de 18). Vecinas: aturdir97 24/24, salto93 13/15 y luego 15/15
(«se te pega … a undefined m», la lectura del agarre de su propia sonda).
`node --test test/` entero: 2 908 de 2 910, 0 rojas.

**Pendiente**: el salto que se queda en 0,1 m tras un teletransporte (aparecer
incluido) es un fallo del juego, de la regla del techo de `Player.step`.
