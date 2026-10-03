# La costura — experimento 91: el guion de un bicho recibe sus golpes

Hasta el 90 la IA de los bichos estaba portada a mano en JS (`ia.js`,
`manada.js`, `reaccion.js`) y el guion de un goblin **no existía**:
`GuionDeNpc` se creaba la primera vez que alguien hablaba con el NPC
(`InteraccionesNpc.guionDe`), y a un goblin no le habla nadie. Así que ningún
evento de combate llegaba nunca al guion de un monstruo, y con él ningún
efecto que cuelgue de esos eventos (venenos, aturdimientos, el «You've slain»).

El diseño decidido es **híbrido**: la IA portada SIGUE mandando (a quién se
persigue, cuándo se ataca, cuánto daño, quién huye, quién se encoge) y el guion
corre a su lado y **recibe los eventos que el motor le dispararía**, en su orden
y con sus parámetros. Lo que el guion haría por su cuenta y la IA ya hace se
cierra con una lista explícita, `CIERRE_DE_BICHO` (`src/play/npcguion.js`), y
cada llamada cerrada se cuenta.

Este experimento comparte número con el censo de otro agente
(`doc/CENSO_BICHOS_91.md`, `tools/bichosguion.mjs`): son dos piezas del mismo
91, cada una en sus archivos.

## 1. Lo medido ANTES de escribir

Script de medida (en el scratchpad de la sesión, no en el repo): crear el
`GuionDeNpc` de cada bicho de `build/{gatecity,edana,sala88}/bichos.json` como
si naciera, correr su reloj 20 s, y después dispararle a mano los eventos de
combate del motor, apuntando qué eventos corrían, qué ganchos tocaban y qué se
quedaba sin soportar.

**Quién tiene ficha de combate.** Los 118 bichos horneados llevan `ia` —hasta el
alcalde: es lo que les da un `Cazador`—, así que «tener IA» no distingue nada.
Lo que distingue es el DAÑO (`ia.dano`, de `ATTACK_DAMAGE` y sus primos):

| mapa | con daño / total | guiones |
| --- | --- | --- |
| gatecity | **35 / 69** | goblin ×8, spider ×2, spider_spitting, dwarf_zombie_random ×16, _sword, _bigaxe ×2, spider_mini ×4, gatecity/guard |
| edana | **9 / 48** | giantrat ×3, boar ×4, edana/boarhard, edana/boarboss |
| sala88 | **1 / 1** | giantrat |

Fuera quedan los **tres ballesteros** `dwarf_zombie_hbow` de Gate City: su daño
va en el proyectil (`ia.dano` es `null`) y no nacen con guion. Queda abierto.

**Al nacer, sin cierre** (20 s de reloj): el goblin, los zombis y el guardia
(familia nueva, `base_npc_attack_new`) arrancan `npcatk_hunt` a los 0,75 s
(`callevent NPC_SPAWN_PRED2 npcatk_hunt`, :148, con `NPC_SPAWN_PRED2 0.75`, :92)
y lo **reprograman solo** cada `CYCLE_TIME`: 20, 30 y 40 vueltas en 20 s. Con el
jugador lejos no mueven nada (`$cansee(enemy)` se apunta y da «0»), pero es el
bucle de caza del guion corriendo al lado del de la IA. La familia vieja
(rata, jabalí, arañas: `base_npc_attack`) usa `hunting_mode_go` con
`repeatdelay`, que **en este puerto no se arma para ningún NPC** (sólo jugador,
efectos y objetos llaman a `armarRepeticiones`): ni corre ni hace falta cerrarlo,
pero se cierra igual y se marca `medido: false`. Ningún bicho pidió
`setmovedest` al nacer.

**Disparándoles los eventos de combate, sin cierre:**

- `game_struck` → la familia vieja corre `npcatk_go_agro`, `npcatk_target`,
  `npcatk_retaliate`, `npcatk_checkflee`, `npcatk_flee`, `npcatk_checkflinch`;
  la nueva `npcatk_retaliate` (y el zombi, por ahí, `npcatk_settarget` y
  `npcatk_flee`, que **pidió `setmovedest` y `playanim break`**). Todo eso es
  `reaccionAlGolpe` y `Cazador.huyeDe`/`apuntarA`, con su propio dado.
- `game_death` → `npcatk_alert_all_allies` (= `Manada.avisar`) y
  `playanim critical ANIM_DEATH` (= el `deUnaVez` de `Manada.matar`).
- `game_damaged` → el parry DEL GUION (`base_monster_shared.script:843-857`),
  que es exactamente lo que porta `parryDelBicho` (parry.js:101) — otro dado.

De ahí sale el cierre: diez eventos medidos y tres por lectura (marcados).

## 2. Lo que se hizo

**Nacer** — `InteraccionesNpc.nacerBichos` (`src/juego/interacciones.js`), en
cada `paso`: los bichos con daño que están en el mundo y no tienen guion de
esta vida nacen con él (`spawn`, `game_spawn`, `game_postspawn`, como en
global.cpp:435-437). `Manada.revivir` sube `i.nacimientos`; un guion de otra
vida se **retira** (sus relojes pendientes dejan de correr) y se hace otro,
porque en el motor el área crea una entidad nueva (msmapents.cpp:1206-1230).
Sólo corre con la costura enchufada (`enchufarA`), que hoy enchufa `main.js`
antes de `bichos.cazar`.

**El cierre** — `CIERRE_DE_BICHO`, 13 entradas con cita y porqué. Se tapa
`guion.llamar` en la instancia: por ahí pasan el `callevent` sin retardo, el
programado y el `calleventloop`. Un evento cerrado devuelve si existe y se
cuenta en `costuraCuenta.cerrados`. `game_parry` está cerrado SÓLO para la
llamada interna; la costura lo dispara por encima cuando el dado de la IA dice
que para.

**El cuerpo es de la IA** — mientras corre un evento de combate disparado por
la costura, lo que el guion pida AL CUERPO (`animar`, `setmovedest`) se cuenta
en `costuraCuenta.absorbidos` y no se hace. Fuera de la costura pasa igual que
antes (un `playanim once nod` de menú sigue funcionando; hay control).

**Los eventos** — `Manada._costura` → `manada.oyente` → `InteraccionesNpc.alCombate`:

| dónde decide la IA | evento(s) del motor | cita |
| --- | --- | --- |
| `cazar`, el dado de acierto entra | `game_damaged_other` (objetivo, daño `%f`, tipo, `(none)`) | giattack.cpp:1755-1762 |
| `cazar`, tras la defensa del jugador | `game_dodamage` (acierto, objetivo, ojo, centro, tipo, ` N.N damage.`/`0`) | giattack.cpp:2036-2045 |
| `cazar`, el dado de acierto falla | `game_dodamage` con «0» | giattack.cpp:1686-1691 |
| `herir`, antes de restar | `game_damaged` (atacante, `%f`, tipo, `AccuracyRoll`, inflictor, habilidad) | msmonsterserver.cpp:2275-2311 |
| `herir`, parry de la IA | `game_parry` (atacante), `game_damaged_end` a 0 | base_monster_shared.script:854-856 |
| `herir`, sin parry | `game_damaged_end`, `game_struck` (`%f`) con la vida de ANTES | msmonsterserver.cpp:2321-2323, :2380-2388 |
| `matar` | `game_predeath`, `game_death` | msmonsterserver.cpp:2580, :2605 |

`golpear` (`main.js`) devuelve ahora `{parado, dano}`: un parry del jugador
deja `flDamage == -1` y eso es `AttackHit = false` (giattack.cpp:1832-1838),
así que el «1»/«0» del PARAM1 lo decide la defensa y no el dado de la rata.

**El daño NO cambia de manos.** Lo sigue poniendo la IA. Los eventos de
animación que en el motor lo ponen (`bite1`, `attack_1`, `gore_forward`,
`frame_bite1` — el 500/600 del `.mdl`, msmonsterserver.cpp:1485-1493) **no se
disparan**. Ver §5.

**Cuatro piezas que destapó la costura**, en `npcguion.js`/`interacciones.js`:

1. **`$get(ent_me,hp)` y `maxhp` valían «0» para TODOS los NPC** desde el 46:
   `entornoDe` los leía de `npc.vida`/`npc.vidaMax` y `guionDe` no los pasaba.
   El 62 otra vez (un parámetro con valor por omisión). Ahora son getters.
2. **`setstat parry` en un NPC no hacía nada.** En el motor pone
   `MONSTER_PARRY` (npcscript.cpp:1305-1318), y sin él la araña de Gate City
   (`setstat parry 50 0 0`) no tiraba nunca el dado de parry de su guion — o
   sea que **el cierre de `game_parry` no tenía nada que cerrar y su control
   salió verde vacío**. Lo cazó el control positivo de la prueba («y el guion
   SÍ lo ha pedido alguna vez»), que salió rojo con el cierre bien.
3. **`ent_laststruckbyme`** resuelve al jugador desde que el bicho le pega:
   `StoreEntity(pTarget, ENT_LASTSTRUCKBYME)` justo antes de
   `game_damaged_other` (giattack.cpp:1754-1756). Es lo que leen el empujón y
   el aturdimiento del jabalí (boar_base.script:93, :178-183). `ent_laststruck`
   NO: ver §5.3.
4. **`$get(ent_me,dmgmulti)`** contesta `m_DMGMulti` con el `"%.2f"` de
   `RETURN_FLOAT` (scriptcmds.cpp:1478, iscript.h:224), sacado del `dmgmulti`
   horneado de `game_postspawn`. Lo pedía el `game_dodamage` de
   base_monster_shared en sus ramas de veneno (dato del censo del 91).

Y `applyeffect` desde el guion de un bicho **llega** al gancho
`aplicarEfecto` (el mismo que usa el sumo sacerdote): la prueba hace morder a
una rata con `NPC_DOT_POISON` y cuenta un `effects/dot_poison` por mordisco que
entra y ninguno por los que fallan, con su control negativo (la misma rata sin
veneno). Para ponerle el veneno se llama a mano su evento del mod
`add_dot_poison` (externals.script:1342-1345): el camino de verdad —los
`params` de `game_postspawn` → `npcatk_do_events`— lo cortan hoy
`G_MAP_ADDPARAMS` (una global que pone el GAME_MASTER, que no corre: resuelve a
su propio nombre y se pega delante del evento) y `$func`. Medido.

## 3. Lo que se entendió mal por el camino

- **El control positivo del parry propio nació rojo con el código bien**: no
  era el cierre, era que `MONSTER_PARRY` no existía (arriba). Es la variante
  del apartado 4 al revés: el instrumento no podía ver la presencia.
- **El testigo negativo de los goblins era vacío.** La sonda cogió el segundo
  goblin despierto como «el que no pelea», estaba a 3,4 m y entró en la pelea;
  y yo había escrito una excepción (`|| dLejos < 15`) que lo daba por bueno.
  Verde sin medir nada. Ahora se elige el MÁS LEJANO antes de pelear (44-47 m
  medidos) y si no hay ninguno lejos el control es ROJO.
- **«El bucle de caza está cerrado» salió rojo una pasada**: se leía el goblin
  en cuanto el área lo sacaba, y el guion pide `npcatk_hunt` a los 0,75 s. La
  hora se le pregunta al guion (se espera a que lo pida), no a mi espera — el 77.
- **Los finales de línea.** Los parches con Python en modo texto escribieron
  CRLF en tres archivos LF; se detectó comparando con `HEAD` y se devolvieron
  a LF antes de seguir.

## 4. Cómo se comprueba

- `test/costura91.test.mjs` — 28 pruebas, entrando por una `Manada` de verdad,
  `InteraccionesNpc` enchufado y `manada.cazar`/`manada.herir`. Ninguna llama
  a `costura()` ni construye los parámetros a mano. Incluye el EFECTO en el
  guion del mod: `AS_MISS_COUNT` de base_anti_stuck.script:386-400 sube al
  fallar y vuelve a 0 al acertar.
- `sondas/costura91.mjs` — entra por el menú en sala88 (la rata) y en
  gatecity (los goblins): **19 de 19**, con dos controles negativos (la rata
  sin provocar no muerde y su guion no recibe nada; el goblin más lejano tiene
  guion y no recibe ninguno).
- **Roturas deliberadas**, cada una puesta con un reemplazo que falla fuerte
  si no casa, comprobada con búsqueda, y quitada y comprobada igual: sin
  `game_dodamage` en `cazar` (5 rojas en Node; en la sonda 4 rojas, con los
  dos controles negativos en verde, que es lo que tienen que hacer), sin
  `recibe` en `herir` (4), el cierre abierto (4), `absorbe` que nunca absorbe
  (1), sin nacer (8), sin `muere` (2), `setstat parry` sin efecto (1), sin
  `ent_laststruckbyme` (1), sin el `game_parry` de la costura (1), sin el
  espacio de « N.N damage.» (2), renacer sin retirar el guion viejo (1), y
  la costura desenchufada en `main.js` (sonda: 13 de 19 rojas).
- Las sondas vecinas: `sala88` 10/10, `edana80` 21/21, `mordisco82`,
  `botin82` y `efectos90` salen con código 0. `consecuencias` da 42/46 con
  cuatro rojas (las bolsas de huevos de las arañas pequeñas y el aviso del
  goblin al morir) — **las mismas cuatro con la costura desenchufada**, así
  que no son de esta pieza; no se han diagnosticado.

## 5. Lo que queda abierto

1. **El servidor (`src/red/`).** `partida.js` monta su propio
   `InteraccionesNpc` y **no llama a `enchufarA`**: con servidor la costura no
   corre, y lo cuenta `manada.costuraSinOyente`. `partida.js` no es de este
   experimento; hace falta una línea allí (`this.interacciones.enchufarA(
   this.fauna.manada)`) y el `ref` del jugador por cliente en `alCombate`.
2. **El daño desde el evento de animación.** Hoy el golpe del bicho lo decide
   la IA (`acierta`/`danoDe`) cada `ESPERA_ENTRE_GOLPES` y el guion se entera
   después. En el motor es al revés: el `.mdl` dispara `bite1`/`attack_1`/
   `gore_forward` y ESE evento hace `dodamage`. Pasar el daño al guion pide:
   leer los eventos 500/600 del modelo (el censo del 91 ya los lee), un
   comando `dodamage` en el intérprete para NPC (hoy no existe), y quitar
   `acierta`/`danoDe` de `cazar`. No se ha cambiado.
3. **«You've slain Giant Rat»** (base_npc.script:192-199, la frase de la
   captura del 83) está a dos piezas: `$get(ent_laststruck,id)` no resuelve al
   jugador y `game.monster.name.full` no lo resuelve el intérprete (guion.js,
   no es de este experimento: **hace falta un `game.monster.*` en `resolver`**).
   Con una sola de las dos saldría «You've slain game.monster.name.full», una
   frase falsa (el 65): por eso `ent_laststruck` NO se ha cableado, y queda
   escrito en `esElJugador` (npcguion.js).
4. **El veneno y el aturdimiento.** `game_dodamage` de base_monster_shared
   hace `applyeffect PARAM2 effects/dot_*` si `NPC_DOT_*`; ninguno de los 12
   guiones de combate de estos mapas lo pone. El zombi aturde desde `attack_2`
   y el jabalí empuja desde `game_damaged_other` (`addvelocity
   ent_laststruckbyme`, que hoy se apunta) y aturde desde `boar_charge_hit`, al
   que se llega por `npc_targetsighted`, un evento de la caza que la IA no
   dispara. El `applyeffect` de un bicho llega al gancho `aplicarEfecto` (es
   el mismo `GuionDeNpc`), pero hoy ningún camino de estos mapas lo pide.
5. **Getters que faltan** para que los eventos corran enteros (dato del censo
   del 91, comprobado aquí en las listas de no soportados): `$get(,dmgmulti)`
   en `game_dodamage`, `$can_damage` en `game_struck`, `$get(,relationship)`,
   `setdmg`/`return` con `m_ReturnData`. Son de `guion.js`; no se han tocado.
6. **`game.time` vale 0 en los guiones de NPC** (`GuionDeNpc` no le pasa
   `ahora` al `Guion`). Por eso el bloque de «daño prematuro» de
   base_monster_shared cree siempre que el bicho acaba de nacer, y el
   anti-atasco nunca acumula frustración. Sin efecto hoy (`setdmg` no está);
   lo tendrá cuando esté.
7. **`$get(ent_me,isalive)` da «0» para un NPC**, y por eso `game_damaged` de
   base_struck se abandona en su primera línea. Arreglarlo despierta el
   encogerse del guion, que la costura absorbería y `npcatk_suspend_ai`
   cerraría: está preparado, no hecho.
8. **Los `repeatdelay` de los NPC no se arman** (rata 2, jabalí 4, arañas 2-3
   por guion): los estiramientos y gruñidos de reposo del guion no corren. La
   IA tiene su propio sorteo de reposo (el 59).
9. **Aproximaciones declaradas** en los parámetros: PARAM5 de `game_damaged`
   (el arma) va con el asa del jugador, porque el arma no es una entidad; el
   centro del jugador es pies + 36 aunque esté agachado; PARAM5 de
   `game_dodamage` es `ia.tipoDano || "generic"`, y la araña de verdad pega
   `pierce` con `dmgevent:bite` (spider_base.script:34), que el horneado no
   lee — así que su `bite_dodamage` tampoco se dispara.
10. **El «0» por parry del jugador** se mide en Node con una defensa fijada;
    el `golpear` real de `main.js` sólo lo recorre la sonda cuando el
    personaje para, y la sonda no lo fuerza. Pendiente de control en partida.
11. Los golpes a un NPC **sin** ficha de combate (pegarle al alcalde) no llegan
    a su guion: en el motor sí. Se cuentan en `costura.noDeCombate`.
12. **`game_damaged` del JUGADOR** recibe 2 parámetros (`main.js`, en
    `golpear`) y el motor manda 6 (msmonsterserver.cpp:2275-2311: atacante,
    daño, tipo, `AccuracyRoll`, inflictor, habilidad). Lo apuntó el agente del
    veneno; no se ha tocado.
13. El asa del bicho: `$get(ent_me,id)` de un guion de NPC da «0», y el
    efecto que pone lo recibe como su atacante. `aplicadorDeBicho`
    (efectos.js:309) construye el asa de un bicho (`100 + índice`); juntar las
    dos —que el guion del bicho se dé a sí mismo la misma asa que ve el
    efecto— es el paso siguiente para que un veneno sepa quién lo puso.
