# La costura, con servidor — experimento 92, pieza B

El 91 hizo que el guion de un bicho naciera con él y recibiera los eventos de
combate del motor (doc/BICHOS_GUION_91.md), y lo enchufó en `src/main.js`. Con
red la manada vive en `src/red/partida.js` (doc/IA_28.md), que monta su propio
`InteraccionesNpc` y **no enchufaba nada**: con servidor ningún bicho corría
guion, y la manada lo contaba en `costuraSinOyente`. El 91 lo dejó escrito como
su pendiente §5.1, con la línea que faltaba.

Este experimento comparte número con otras dos piezas del 92 (el mordisco por
evento de animación, doc/MORDISCO_92.md, y doc/CONSECUENCIAS_92.md), cada una
en sus archivos.

```bash
node --test test/costurared92b.test.mjs   # 14 verdes y 1 pendiente
node sondas/costurared92.mjs              # dos Chrome contra un servidor: 16 de 16
```

## 1. Lo medido ANTES de escribir

Un script en el scratchpad (no en el repo): una `Partida` de verdad con una
`Fauna` sobre el suelo liso, la rata del mod, un cliente que entra con
`MENSAJE.ELEGIR` y le pega con `MENSAJE.PEGAR`.

- **Sin la costura**: el guion de la rata no existe; `costuraSinOyente` sube.
  Lo esperado.
- **Y algo que no se esperaba: la rata no mordía nunca en el servidor.** Tras
  el golpe, `cazador.objetivo` valía **`1`** —el hueco del cliente, un
  número— y a los diez segundos `null`, con el jugador intacto. La manada
  conoce a los jugadores como «j1» (`Fauna.nombreDeJugador`): es el id de
  `objetivos()` y de `golpear`. `Partida._pegar` le pasaba a `Fauna.pegar` el
  hueco tal cual, y `Manada.herir` hacía `apuntarA(1)` —el «devolver el golpe»
  del 82— contra un objetivo que no estaba en la lista. Lo mismo los aliados
  avisados al morir (`Manada.avisar`). O sea que **el arreglo del 82 («las
  ratas no me devuelven el golpe») nunca llegó al servidor**, y nadie lo vio
  porque las sondas de combate miden un navegador.
- **Con la costura enchufada a mano** el guion recibía los eventos con
  **«none»** como atacante: `contextoDelJugador()` del servidor tiene la
  sesión `null` del constructor.

## 2. Lo que se hizo

**Enchufar.** `Partida` llama a `interacciones.enchufarA(this.fauna.manada)`
al montar sus interacciones. Desde ahí los bichos de combate nacen con guion
en `interacciones.paso` (que ya corría en `_paso`) y los golpes llegan por
`alCombate`.

**Quién es «j3».** `InteraccionesNpc` acepta un gancho nuevo, `jugadorDe(id)`,
que sólo pasa el servidor: «j3» es la sesión del cliente del hueco 3. Con él,
`alCombate` resuelve la sesión del jugador DE ESE EVENTO (`objetivo` en los del
atacante, `quien` en los del que recibe) y, mientras corre el evento, pone
`hablandoCon` a esa sesión y la devuelve al acabar. Así el asa que ve el guion
es la del personaje de ese jugador, y lo que el guion produce —un
`playermessage`, un `applyeffect`, la posición del centro del jugador en
`game_dodamage`— va a él y no al último que abrió un menú. Es el `MSG_ONE` del
motor, que no necesita preguntarlo porque el jugador viaja dentro del evento
(`Params.add(EntToString(pTarget))`, giattack.cpp:1758;
`EntToString(pAttacker)`, msmonsterserver.cpp:2285). **Sin `jugadorDe` —en un
navegador— `alCombate` hace exactamente lo de antes** y no toca `hablandoCon`
(hay prueba).

**«j3», no 3.** `Fauna.pegar` convierte el hueco numérico en
`nombreDeJugador` antes de llamar a `herir`. Arregla las tres cosas del §1 de
una vez: la rata devuelve el golpe en el servidor, los aliados avisados
apuntan a alguien que existe, y el guion recibe el asa del atacante.

**Los efectos caen en el jugador del servidor.** Un efecto es un guion que se
añade a la entidad (`Script_Add`, scriptedeffects.cpp:27) y corre en el
servidor (`#scope server`). Con red el personaje vive allí, así que el veneno
también: mandado al navegador, su daño restaría de la COPIA de la vida, que la
foto siguiente pisa (`vitales` en `src/main.js`). `Partida._efectosDe(c)` le
da a cada cliente, la primera vez que hace falta, un **`GuionDelJugador` de
verdad** con la ficha horneada del jugador (`build/msr/jugador.json`) como
anfitrión de sus efectos (`build/msr/efectosguion.json`). De verdad y no uno
de mentira por una razón medida: el veneno le pregunta a su guion
(`$get(ent_me,scriptvar,'PLAYING_DEAD')`, effects/base_dot.script,
`dot_resist_check`; `GetFirstScriptVar`, script.cpp:5949-5955), y un anfitrión
de mentira contestaría el valor de reposo de una variable que el guion sí
pone. Sus ganchos:

- `suceso`/`aviso` → `MENSAJE.TEXTO` a ESE cliente (canal -1 y -2, los que ya
  usa el guion de un NPC);
- `dar` (`givehp`) → la vida del personaje del servidor, con el mismo tope que
  el navegador (`V_min(Max - Current, Amt)`, msmonsterserver.cpp:1971-1999);
- `maximos` → derivados, no guardados (el 66);
- `herir` → `_efectoPega`: lo cobra `sesion.danar` —la misma puerta que el
  mordisco de un bicho en el servidor— y le manda «X hits you: …»
  (`golpeRecibido`, la misma función que usa el navegador).

El gancho `aplicarEfecto` de las interacciones del servidor lo pone en el
cliente con el que habla el guion AHORA (`_aQuienHabla()`): el que abrió el
menú, o el del golpe mientras corre la costura. Sin las dos tablas el gancho no
se pasa, y el guion lo apunta como antes del 92 («sin anfitrión de efectos»).
En `_paso` se mueven los relojes de los efectos de cada cliente.

Y con eso, **el segundo caso, que no era de esta pieza y sale gratis**: con
servidor el sumo sacerdote de Edana decía «let me help you with that...» y no
curaba. Ahora cura: `PEDIRMENU` → «Ask to be Healed» → `ELIGEMENU` →
`say_heal` → (1 s) `attack_1` → `applyeffect ent_lastspoke
effects/effect_rejuv2 …` (edana/highpriest.script:77-95) → `givehp` en el
servidor → «High Priest heals you for 1000 hp» en su pantalla.

**`--params`, una perilla del operador.** `npm run servidor -- --params
monsters/giantrat=add_dot_poison` le llama esos eventos al guion de cada bicho
de ese tipo al nacer (`Partida._ponerParams`). Es lo que un mapa pide con los
`params` de la entidad (`npcatk_do_events`,
monsters/base_self_adjust.script:74-103), que hoy no llega por su camino (el
91, §2: `G_MAP_ADDPARAMS` es del GAME_MASTER). Hermana de `--nacer` y `--oro`;
lo que llama son eventos DEL MOD (`add_dot_poison`,
monsters/externals.script:1342-1346).

**`/costura`.** `tools/servidor.mjs` sirve `partida.costura()`, de sólo
lectura: lo que el GUION de cada bicho ha recibido en el servidor (eventos,
cerrados, absorbidos, el último `game_damaged` y `game_dodamage` con sus
parámetros, su `NPC_DOT_POISON`) y los efectos de cada cliente. Un navegador
no puede verlo —los guiones no viajan— y una sonda que lo midiera en su propia
copia mediría otro juego.

## 3. Lo que se entendió mal por el camino

- **Una rotura deliberada que no rompía.** Para comprobar que la prueba de la
  puerta del daño mira el mensaje, rompí el envío añadiendo `texto: ""`
  DELANTE del `texto:` de verdad en el mismo objeto literal. En JavaScript gana
  la última clave: el mensaje seguía saliendo y la prueba seguía verde con
  «la rotura puesta». Comprobé con búsqueda que el marcador estaba, y estaba;
  lo que no estaba era el fallo. Es el 80 y el 81 con otra ropa: *comprobar
  que la rotura está puesta no es comprobar que rompe*. Se rehízo cambiando el
  nombre de la clave, y salió roja.
- **El control negativo de la sonda salió rojo con el trabajo bien hecho**: la
  rata estaba a 3,24 m y el control pedía < 3. `--nacer` pone a los dos a un
  metro, pero la rata pasea. Teletransportarse sería la mentira que la
  reconciliación deshace (lo mide `sonda:red`), así que se anda hasta ella con
  la W, como el jugador.
- **«16 de 15 controles».** Conté a mano los declarados y me equivoqué en uno.
  El marcador lo dijo («corrieron 16 de 15») y la salida era roja: es el
  marcador del 86 haciendo su trabajo.
- **El veneno de la rata hace CERO de daño a un jugador, en el navegador y
  aquí, y no es de esta pieza.** `game_dodamage` lo calcula con
  `$get(PARAM2,maxhp)` (base_monster_shared.script:1334) y `GuionDeNpc`
  contesta «0» para un jugador, con un comentario del 46 que dice que en el
  motor la rama de `maxhp` no casa con un jugador. **Medido aquí: sí casa.**
  `pMonster = pTarget->IsMSMonster() ? … : NULL` (scriptcmds.cpp:926), el
  jugador ES un `CMSMonster` (`class CBasePlayer : public CMSMonster`,
  player.h:396, sin redefinir `IsMSMonster`, msmonster.h:352), así que la rama
  `else if (pMonster)` (:1388-1391) le contesta `MaxHP()` (player.h:660). Con
  eso, el comentario de al lado —«la tarifa del guardarropa de Gate City es
  cero en el juego de verdad»— probablemente también es falso. `npcguion.js`
  es de otro agente: se describe aquí y no se toca, y la prueba de «la vida
  baja por el veneno» está como **pendiente** (`test.todo`), no como verde.

## 4. Cómo se comprueba

- `test/costurared92b.test.mjs` — **14 verdes y 1 pendiente**, todas por el
  camino del servidor: `new Partida({...})` con `Fauna`, clientes con buzón,
  `MENSAJE.ELEGIR`, `MENSAJE.PEGAR`, `PEDIRMENU`/`ELIGEMENU` y `_paso()`.
  Ninguna llama a `alCombate`, `costura` ni `enchufarA` a mano. **Con DOS
  jugadores**, que es el segundo caso del §4 de CLAUDE.md: con uno, «el asa
  del jugador» y «el asa del que pegó» son la misma cadena. La excepción
  declarada es la prueba de la puerta del daño, que aplica el veneno con los
  parámetros que le pasaría una rata con el `maxhp` bien leído, porque hoy
  ningún camino llega ahí con daño (§3); va aparte y lo dice.
- `sondas/costurared92.mjs` — dos Chrome por el menú contra `tools/servidor.mjs`
  en sala88 con `--nacer` y `--params`: **16 de 16**. Con tres controles
  negativos: quietos a su lado sin pegarle la rata no muerde; a Beto, al lado,
  no le llega el veneno de Ana y su asa no aparece en el guion; y el navegador
  NO corre una segunda copia del guion de la rata.
- **Roturas deliberadas**, cada una con un reemplazo que falla si el patrón no
  casa una sola vez, comprobada con búsqueda, y deshecha sobre el archivo tal
  como estuviera (el árbol es compartido):

  | rotura | Node (rojas) | sonda (rojas) |
  | --- | --- | --- |
  | sin `enchufarA` en `Partida` | 7 | 9 de 16 |
  | `Fauna.pegar` con el hueco numérico | 5 | — |
  | sin `jugadorDe` | 3 | — |
  | `hablandoCon` sin devolver | 1 | — |
  | sin `_ponerParams` | 2 | — |
  | sin el texto de `_efectoPega` (la segunda vez, ver §3) | 1 | — |
  | los efectos sin `paso` | 2 | — |
  | `aplicarEfecto` al último cliente en vez de al que habla | 1 | 3 de 16 |

- Sondas vecinas: `sondas/red.mjs` 21/21 en Gate City y 21/21 en Edana;
  `sondas/costura91.mjs` 19/19. `sondas/red.mjs` se cayó dos veces antes en
  la ENTRADA (`waitForFunction` agotado a los 120 s), con la máquina cargada
  por otras sondas en paralelo; la tercera salió entera. Se dice porque una
  caída que no se explica no es un verde.
- `npm test`: 2 419 verdes, 0 rojas, 2 pendientes (una es la de §3).

## 5. Lo que queda abierto

1. **`$get(<jugador>,maxhp)` en `src/play/npcguion.js`** (§3): con él, el
   veneno de la rata a un jugador haría el 5 % de su vida máxima por segundo
   (base_monster_shared.script:1334-1336) en vez de cero, en los dos mundos.
2. **Los eventos con retardo del guion de un bicho** (`callevent 0.5 …`) corren
   después, desde el reloj, y su `playermessage`/`applyeffect` va a quien sea
   `hablandoCon` EN ESE MOMENTO, no al jugador del golpe que los programó. El
   motor guarda la entidad (`ent_laststruck`, `PARAM1`); aquí la casilla es
   una. Lo mismo la cura del sacerdote, que llega 1 s después del menú: con
   dos jugadores hablándole en el mismo segundo, puede curar al otro.
3. **El guion del jugador en el servidor es SÓLO anfitrión de efectos.** Sus
   relojes propios (la regeneración del 64, `repeatdelay`) no se mueven allí;
   siguen en el navegador, donde con red la foto pisa la vida. No medido si la
   regeneración funciona hoy con servidor; mudar el guion del jugador entero
   al servidor es otro experimento.
4. **Lo que un efecto hace en la PANTALLA no viaja**: `effect glow`,
   `effect screenfade`, `hud.addstatusicon` del veneno
   (effects/dot_poison.script) corren en el servidor sobre su copia del guion
   del jugador, y el navegador no se entera. Hace falta un mensaje de red para
   cada uno.
5. **El jugador del servidor no tiene defensa**: `_bichoPega` resta con
   `sesion.danar` sin escudo ni parry (anterior a esta pieza), así que el
   «0 por parry» del PARAM1 de `game_dodamage` (el 91, §5.10) nunca sale con
   servidor.
6. **El corchete de resistencia** de «hits you» (`golpeRecibido` con
   `modificador`) no se pasa desde `_efectoPega`: sale vacío, como en la rama
   `pega` del navegador.
7. **`--params` es una perilla**, no el camino del mapa: el de verdad sigue
   cortado por `G_MAP_ADDPARAMS` (el 91, §2).
8. Al cerrar, un `vite` huérfano en el puerto 5491 (el de `costura91.mjs`),
   nacido a las 23:27, después de la última pasada de esa sonda en esta
   sesión: no es de esta pieza y no se ha matado.
