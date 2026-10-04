# El servidor hace lo que ya hace el juego en solitario — experimento 98, pieza J

> Prueba: `test/servidor98.test.mjs` (17 casos, por la `Partida` de verdad).
> Sonda: `npm run sonda:servidor98` (Chrome contra `tools/servidor.mjs`, en dos
> fases: Gate City y los esqueletos de gertenheld_forest2). 18 de 18.

El 97 cerró la defensa con servidor y dejó cuatro huecos apuntados en tres
documentos (doc/DEFENSARED_97.md §5, doc/ATURDIR_97.md §6,
doc/OVERRIDE_97.md §8). Los cuatro son la misma forma: **una regla que en
solitario corre y con servidor no la llamaba nadie**. Ninguno se arregla
copiando la regla; los cuatro hacen que el servidor (o el navegador con
servidor) pase por la función de `src/play/` que ya usa el camino local.

## 1. Las trabas en `_simular`

**El motor.** Las trabas las calcula el SERVIDOR: `CBasePlayer::PreThink`
recorre los guiones del jugador y pone las banderas `PLAYER_MOVE_NO*`
(player.cpp:4033-4054), y `CMSMonster::SetSpeed` multiplica los
`game.effect.movespeed` de sus efectos (msmonsterserver.cpp:2819-2857). Viajan
al cliente en su `clientdata`: las banderas como `iuser3` (client.cpp:2800,
clplayer.cpp:598) y la velocidad como `maxspeed` (`clientmaxspeed`,
sv_pmove.c:561), y el cliente las obedece al construir la orden (input.cpp:821,
:911-919) y al predecir (`PM_CheckParamters`, pm_shared.cpp:3050-3053). El
ataque lo corta `CGenericItem::Attack` en su primera guarda
(giattack.cpp:252-254), código compartido.

**El camino local** (el 97): `trabasDelJugador(guionJugador)` en el bucle de
src/main.js, cinco `if` sobre la intención y `velocidadConTrabas` para la
velocidad.

**Lo que había con servidor**: nada. `Partida._simular` movía el cuerpo con la
orden tal cual. Un aturdido andaba, saltaba y pegaba; el fénix de un débil no
le frenaba (y además su bucle no corría: §3).

**Lo hecho**:

- `src/play/trabas.js` gana `trabarIntencion(q, t)` —los cinco `if` que
  estaban en main.js, ahora en un sitio para los dos lados—, `juntarTrabas`
  (dos juegos de la MISMA entidad: banderas sumadas como `SetBits`, porcentajes
  multiplicados como en :2833-2834) y `trabasParaElCable`/`trabasDelCable`.
- `Partida._simular` lee `trabasDelJugador` del anfitrión de efectos del
  cliente (`_trabasDe`), traba la orden con `trabarIntencion` y pasa la
  velocidad por `velocidadConTrabas` con su `tope` —el fallo del 97, `min(fSpeed
  × p/100, p)`, también con servidor—. El escudo no se levanta con NOATTACK.
- `Partida._pegar` rechaza un `PEGAR` con NOATTACK (`tupegas` con
  `trabado: true`).
- La foto de cada cliente lleva `trabas` (SÓLO la suya: es su `clientdata`, no
  la entidad que ven los demás) cuando hay alguna.
- El navegador (`src/main.js`) junta las del cable con las de su guion —el
  puerto tiene efectos en los dos lados— y las aplica con la misma
  `trabarIntencion`. La predicción rehecha (`red.simular`) usa el último tope.

**No crear el anfitrión al leer.** La primera versión leía las trabas con
`_efectosDe(c)`, que CREA el anfitrión, en cada orden: todo cliente acababa
con uno, y `test/costurared92b` («Beto ni tiene anfitrión», «sin el
`add_dot_poison` … `efectos.length === 0`») se puso rojo. `costura().efectos`
es «a quién le ha caído un efecto», y crear anfitriones al leer lo convertía
en «quién está conectado». Ahora `_anfitrionSiHay`. El mismo tropiezo,
segundo sitio: el `game_damaged` de §4 lo creaba en cada golpe. **Y tercero,
que no vi yo**: `_equipoDe` pedía el anfitrión en su primera línea, y desde
que `_paso` lo llama en cada paso (§3) todo cliente de un servidor con
`objetosguion.json` tenía uno. Las pruebas de Node no lo veían —sin
`objetosGuion` `_paso` no lo llama—; lo vio el integrador con
`sondas/costurared92` en 15 de 16 («`/costura` lista a Beto con `aplicados:
0`»). Ahora `_equipoDe` lo pide sólo si hay una pieza que montar, y hay un
caso de Node con el control de Beto. *Tres sitios para el mismo fallo: una
función que crea al leer no se puede llamar «sólo para mirar».*

## 2. La frase del parry del bicho, con servidor

**El motor.** `game_parry` del bicho: `playermessage $get(PARAM1,id) Your
attack was PARRY_TYPE` (monsters/base_monster_shared.script:472-475) — al que
pegó, y a nadie más. Con `[override]` la araña no dice nada (el 97).

**El camino local** (el 97, doc/OVERRIDE_97.md): el relevo de `golpearA` sólo
escribe si `!golpe.hablaElGuion`.

**Lo que había con servidor**: el relevo estaba en `case "para"` de
src/main.js, y el suceso `para` lo reparte la manada **a todos los clientes**.
O sea que eran DOS fallos: el que pegó leía la frase dos veces (el relevo y el
`playermessage` del guion, que corre en el servidor), y **cada uno de los
demás jugadores conectados la leía una vez** por un golpe que no había dado.

**Lo hecho**: el relevo se mueve a `case "tupegas"`, que es `MSG_ONE` (el
servidor lo mete en `c.sucesosPendientes` del que pegó) y ya traía
`parado`, `mensaje` y `hablaElGuion` (`Fauna.pegar` devuelve `...r` de
`Manada.herir`). `case "para"` sólo cuenta. El servidor no cambia.

## 3. Los relojes de las piezas en el servidor

**El motor.** El guion de una armadura es `//#scope server`
(armor_base.script:2): `game_wear` hace `callevent 0.1 failed_str_req_loop`
si la fuerza no llega (:100), y el bucle se rearma cada diez segundos con un
`infomsg` y `applyeffect ent_owner effects/effect_slow 10.0 50%` (:173-181).
Cada objeto es su propio `CScript` con sus relojes (script.cpp:5906-5922).

**El camino local**: `for (const ent of objetosVivos.values()) ent.paso(dtB)`
en src/main.js.

**Lo que había con servidor**: `_equipoDe` montaba las piezas al PRIMER
golpe y nunca les daba `paso`, así que el bucle no corría allí. Lo corría el
navegador, sobre su guion del jugador: la lentitud frenaba la predicción y el
servidor, sin saberlo, corregía hacia delante.

**Lo hecho**:

- `correEnElServidor(ficha, puesto)` en src/play/armadura.js: lo puesto y las
  armaduras, el mismo criterio que ya usaba `_equipoDe` (ahora lo usa por esa
  función).
- `Partida._paso` monta el equipo de cada cliente dentro y le da `paso` en el
  mismo paso fijo que los efectos. Montarlo al entrar y no al primer golpe es
  además lo del motor: `QUIEN_VISTE.CARGA`.
- El navegador, con servidor, **no mueve el reloj** de esas piezas: dos copias
  serían dos lentitudes y dos avisos por vuelta.

## 4. `game_damaged` del jugador con servidor

**El motor.** `CallScriptEvent("game_damaged", …)` en `CMSMonster::TraceAttack`
(msmonsterserver.cpp:2311), con atacante, daño y tipo (:2284-2287), sobre
TODOS los guiones del jugador (el suyo y sus efectos). `player_main` apunta
`PL_BEEN_ATTACKED` y `LAST_STRUCK_FOR` (que leen el Bone Blade y tres armas
más) y enseña su barra (player/player_main.script:328-358).

**El camino local**: `golpear` lo llama tras el aviso y antes de restar, y
llama `emociones.golpeado()` (el `game_struck` del descanso, el 85).

**Lo que había con servidor**: nadie. Ni allí ni aquí.

**Lo hecho**: `GuionDelJugador.danado({atacante, dano, tipo}, {soloEfectos})`
—una función y no la línea copiada—, y el guion partido en dos como ya lo
estaba:

- en el servidor, `_defender` la llama con `soloEfectos` sobre el anfitrión
  (si lo hay): los efectos de allí —la protección, el escudo de hielo— lo
  reciben donde viven;
- y manda al que recibe un suceso `golpeado` (MSG_ONE) con atacante, daño y
  tipo, con el que el navegador llama la misma `danado` sobre su guion del
  jugador —regeneración, `PL_BEEN_ATTACKED`— y `emociones.golpeado()`.

`golpear` pasa ahora también el tipo (PARAM3). Los parámetros 4-6 del motor no
se pasan; de los guiones del jugador y sus efectos sólo los lee
`effects/goblin_latch.script:29`, y sólo si el atacante es un jugador.

## 5. Las medidas

**Node** (`test/servidor98.test.mjs`, 17 verdes):

| caso | resultado |
| --- | --- |
| CONTROL: Veteran (fuerza ≥ 40) con el fénix | > 100 u/s, ninguna foto con trabas |
| débil con el fénix PUESTO | la pieza en `costura().efectos[].piezas`; trabas 50 % y sin salto; 44-47 u/s (cargada fSpeed 91,3: manda el 50 %); un `infomsg` y un «slowed»; a Beto nada; la foto de Ana lleva `{porcentaje: 50, noSaltar, ritmoAnim: 0.5}`, la de Beto nada; Beto > 100 u/s |
| débil no salta / CONTROL Veteran sí | < 0,05 m / > 0,5 m |
| 21 s de bucle | 3 avisos (0,1 + 10 + 20 s) |
| el control de Beto | con `objetosGuion`, tras 1 s: Ana (fénix) tiene fila en `costura().efectos`, Beto (nada puesto) no |
| fénix en la mochila | > 80 u/s, ninguna lentitud |
| aturdido (`debuff_stun 3`) | 40-45,5 u/s, `PEGAR` rechazado y el goblin intacto, `tupegas` `trabado`; a los 3 s libre y el mismo `PEGAR` entra (control positivo del cero) |
| `game_damaged` | `golpeado` a Ana con atacante, 12 y `blunt`; a Beto nada; un golpe parado no lo manda |
| efectos del anfitrión | con `effects/protection` puesto, un golpe da un `MENSAJE.PANTALLA` de fundido (protection.script:26-31) |
| parry de la rata, con guion | `tupegas` con `hablaElGuion` en todas; una «Your attack was» por parada al que pegó; al otro ninguna |
| CONTROL sin guiones | `hablaElGuion` falso; nadie lo dice en el servidor |
| juntar | 50 % × 90 % por el cable = 45 %, lo mismo que una lista |

**Seis roturas deliberadas**, cada una sobre una COPIA de partida.js
(`src/red/_rota98.js`, borrada al acabar) y no sobre el archivo, porque el
árbol lo comparten cinco sesiones y una sonda ajena que arrancase un servidor
en ese momento habría cargado la rotura. El reemplazo afirma que el patrón casa
una vez y que la copia ha cambiado (el 80):

| rotura | rojas |
| --- | --- |
| R1 `_simular` sin trabas | 3 (lento, no salta, aturdido) |
| R2 `_paso` sin relojes de piezas | 3 (lento, no salta, 21 s) |
| R3 sin suceso `golpeado` | 1 |
| R4 sin `game_damaged` a los efectos | 1 (el fundido) |
| R5 `_pegar` sin NOATTACK | 1 (aturdido) |
| R6 la foto sin trabas | 1 (lento) |

Lo del navegador (§1 juntar, §2, §3 el reloj que no corre aquí, §4 la rama
`golpeado`) no lo ve Node: lo ve la sonda.

**La sonda**: ver §6.

## 6. Resultado de la sonda

`npm run sonda:servidor98`: **18 de 18**.

```
fase 1, Gate City (sitio de nacer del mapa)
  A trabas {"porcentaje":50,"noSaltar":true,"ritmoAnim":0.5} en 1038/1042 fotos (servidor igual) · B 0
  main.js de A {"porcentaje":50,"noSaltar":true,"quien":["servidor"]} · B nada
  reloj: cable 1, consola 1 en 9 s; avisos de fuerza 1
  A: servidor 45,7 u/s (máx 45,7), predicción 50,0 · B: servidor 184,0, predicción 160,0
  salto: A 0,000 m, B 1,133 m
fase 2, gertenheld_forest2 (esqueletos)
  game_damaged: a B le entran 6,98 de «Envenomed Bones» → PL_BEEN_ATTACKED 1, LAST_STRUCK_FOR 6,98;
                C 0 golpeados, PL_BEEN_ATTACKED null
  parry: 2 paradas en 76 golpes, hablaElGuion [true,true]; frases B 2, C 0
  (pendiente, sin contar: 21 «e.dar is not a function» del `givehp` del esqueleto, §8)
```

La última pasada, con la versión final de la sonda (tandas contadas tras su
marca): **18 de 18**, el parry con **4 paradas en 110 golpes, frases B 4, C 0**.
Las vecinas en la misma tanda, una a la vez (`npm run sondas -- -j 1 …`):
defensared97 13/13, red 21/21, red95 12/12, costurared92 16/16 (la que el
integrador vio en 15, §1), efectosred93 24/24. `npm test`: 2 905 verdes, 0
rojas, 1 `todo`.

**Roturas deliberadas del NAVEGADOR**, puestas sólo en las páginas de la sonda
(`ROTURA98=…`: Playwright intercepta el `src/main.js` que sirve Vite y lo
devuelve cambiado; romper el archivo del árbol habría roto a la vez las
sondas de las otras sesiones). Cada reemplazo tiene que casar una vez y la
sonda dice cuáles casaron («roturas puestas: C1, C2, C3, C4»):

| rotura | resultado |
| --- | --- |
| C1 el navegador no junta las trabas del cable | rojo «el bucle de main.js de A las LEE»: `quien` sin «servidor» |
| C2 el navegador mueve también el reloj de las piezas | rojo «el reloj UNA vez»: **cable 1, consola 2** — la lentitud del servidor y la de la copia del navegador |
| C4 nadie llama `game_damaged` con servidor | rojo: `PL_BEEN_ATTACKED null` con un golpe de 1,88 entrando |
| C1 sola (con C3) | rojos «LEE» (`quien: []`, porcentaje 0) y «PREDICE»: **160 u/s** predichos contra 45,7 del servidor |
| C3 el relevo vuelve a `case "para"` (lo de antes del 98) | rojos los dos del parry: **B 6 frases en 3 paradas, C 3** — el doble al que pega y una a cada uno de los demás, el fallo entero |

Con C1 y C2 a la vez, «el navegador de A PREDICE» siguió verde: la copia del
navegador (C2) ponía su propio `effect_slow` y la predicción frenaba igual.
Las roturas juntas se tapan; por eso C1 se repitió sin C2. La primera pasada
con C3 se cayó antes de medirlo («la marca no está en la consola de B»: §7).

## 7. Lo que costó medirlo

- **La araña también frena.** La primera pasada esperaba `porcentaje: 50` en
  la foto de A y llegó **45**, con `noAgachar` y `ritmoAnim 0,45`: el veneno
  de la araña (nacen a su lado) trae su propio `movespeed 90`. No era un
  fallo: es justo lo que `juntarTrabas` dice, el producto de todo lo que lleva
  la entidad. El control se cambió a «≤ 50 % y lo mismo que el servidor dice
  que leyó».
- **Una pestaña de fondo no juega.** La primera pasada midió 5 fotos en 1,5 s
  andando, un salto sin pies y 42 correcciones en B, que no tiene trabas: con
  dos páginas en el mismo Chromium sólo la del frente tiene
  `requestAnimationFrame`, así que el bucle de la otra no corre ni manda
  órdenes. Cada fase pone su página al frente (`bringToFront`).
- **La araña muere antes de parar.** Con la Blood Drinker, 30 de vida son tres
  golpes, y con los puños de A (débil) 14 golpes mataron a las dos sin una
  parada: el parry 50 contra una tirada de acierto uniforme para un ~5 %.
  «0 frases en 0 paradas» es un cero sin control. Se cambió a los esqueletos
  de gertenheld_forest2 (350 de vida, parry 40, y su guion SÍ dice la frase,
  así que mide «una y no dos»), pegando con los puños
  (`probe.golpe.empunar("fist_bare")`, sólo en el navegador: el daño lo
  calcula él y el servidor sólo lo topa). 2 paradas en 76 golpes.
- **`test/red_27` «y el servidor le ha movido de verdad»** (aviso del
  integrador: rojo en `npm test` y luego COLGADO). Dos cosas, ninguna del
  servidor: (1) la prueba andaba «lo que quepa en 900 ms de reloj de pared»
  con `setTimeout(16)`, y con `npm test` corriendo los archivos en paralelo y
  cinco sesiones en la máquina cabían pocos pasos: no llegaba a 1 m con el
  juego bien. En solitario pasó 49 de 49 tres veces con este cambio; el 97 ya
  lo había visto rojo con el código viejo (doc/ATURDIR_97.md §3). Ahora son 54
  pasos CONTADOS (0,9 s de juego). (2) Al fallar no cerraba su HTTP ni el
  reloj del anfitrión, y `npm test` no terminaba: ahora en un `finally`,
  comprobado rompiendo el umbral en una copia (termina en 2 s, 48 de 49).
  Es arreglo del CONTROL, no del código.
- **El servidor que deja de contestar.** Tres pasadas seguidas murieron en la
  entrada de B («el servidor no lista», «no contestó a 'lista'») y lo achaqué
  a la máquina cargada. No era: el servidor con un solo cliente de Node en el
  mismo sitio daba vueltas de 1 ms, y con la sonda se iba a 2 s y luego a
  nada. Se levantó con `--inspect` (`SONDA_NODE_ARGS`) y se pausó desde
  fuera: **cada `computeColliderMovement` de Rapier del jugador A tardaba
  segundos**, con la orden quieta (`move` sólo el empujón al suelo). A tenía
  15 de vida (las habilidades de recién creado) y nacía al lado de la araña;
  moría, reaparecía apartado por `_sitioLibre` —que mira a los otros
  jugadores y no la geometría— y su cápsula quedaba metida en la roca. No es
  del 98 (ni las trabas ni los relojes tocan la física), pero lo hizo visible
  la sonda: §8. La sonda se rehízo en dos fases para que A no muera.
- **La araña también frena.** Una pasada esperaba `porcentaje: 50` en la foto
  de A y llegó **45**, con `noAgachar` y `ritmoAnim 0,45`: el veneno de la
  araña trae su propio `movespeed 90`. No era un fallo: es el producto de todo
  lo que lleva la entidad, lo que dice `juntarTrabas`.
- **El anillo de la consola, otra vez** (el 97). «Consola 0» con el juego
  bien: el primer «slowed» llegó al entrar A y, mientras B entraba, los
  mordiscos llenaron el anillo. Ahora cada medida de consola cuenta tras una
  marca (`probe.hud.suceso`). Y con los esqueletos mordiendo, el anillo de B
  se llenó en 0,7 s y la marca de una tanda desapareció: esa tanda se tira
  entera (frases y paradas) y se dice cuántas.
- **La máquina.** Con cinco sesiones a la vez la entrada por el menú falla a
  veces al primer intento («Start no recargó», «el servidor no tiene a B en
  el hueco 2»); se reintenta con otra página y se dice.

## 8. Pendiente

- **Las trabas de los efectos del NAVEGADOR no las aplica el servidor.** El
  navegador junta las del cable con las suyas para la orden y la predicción,
  pero un efecto que vive sólo en su guion del jugador (los que ponen los
  objetos que siguen corriendo allí: pociones, hechizos) no frena al cuerpo del
  servidor. Hoy ninguno de esos frena; cuando alguno lo haga, corregirá.
- **Con servidor el navegador predice a 160 u/s, sea quien sea.** Con la
  rotura C1, A (débil y cargado: 91,3 en el servidor) predijo **160**, lo
  mismo que B (184 en el servidor): la predicción con red no anda lo que el
  personaje que tiene el servidor. Sospecha SIN MEDIR: 160 es la velocidad
  del perfil (`perfil.walkSpeed`), el valor de reposo de `maxima` en
  src/main.js antes de la rama `manda && sesion?.personaje`; puede ser esa
  rama o la copia del personaje del navegador. Con las trabas juntadas A predice 50 (el tope) contra 45,7. Las dos páginas
  corrigen ~78 veces en 2 s, con trabas o sin ellas. `vitalesDe`
  (src/red/andar.js) y `vitalesDelPersonaje` (src/main.js) son la misma
  cuenta; lo que difiere es si el bucle la usa. Sin medir más; no es de las
  trabas y no se cuenta como control.
  *Corrección del 99:* no era ninguna de las dos. El bucle sí usa la del
  personaje (`probe.fisica.vitales()` de B dio 184); lo que caía en el 160 era
  **rehacer** las órdenes tras una corrección: el gancho `red.simular` leía
  `o.maxima`, que ninguna orden trae. Ver [RED_99.md](RED_99.md).
- **`givehp` en el guion de un NPC lanza** «e.dar is not a function»: el
  entorno de `GuionDeNpc` no tiene el gancho `dar` (src/play/guion.js,
  `givehp`). El esqueleto venenoso lo hace al morder
  (skeleton_poison_random.script:304), y `base_monster_shared.script:921/984`
  y `base_patrol_radius.script:81` también. Pasa en solitario igual (es el
  mismo `GuionDeNpc`). La sonda lo imprime y no lo cuenta. Lo correcto es
  `CMSMonster::Give` sobre la vida del bicho con su tope
  (msmonsterserver.cpp:1971-1999), y eso es de la IA, no de esto.
  *Corrección del 99:* portado así, en el entorno de `GuionDeNpc` (`dar`); ver
  [RED_99.md](RED_99.md) §5.
- **Reaparecer dentro de la roca.** `_sitioLibre` (src/red/partida.js) aparta
  al que reaparece de los otros jugadores sin mirar la geometría; en Gate
  City, al lado de la araña, dejó a A con la cápsula metida y a Rapier
  tardando segundos por paso (§7). El servidor entero deja de contestar.
  *Corrección del 99:* `_sitioLibre` ni siquiera corría al reaparecer: el
  servidor no movía el cuerpo y se volvía a la vida donde se había muerto. El
  punto de Gate City ya estaba en la pared, y lo que paraba de verdad al
  servidor de la sonda era una araña con su cilindro DENTRO de la cápsula
  (125 ms por llamada al controlador). Ver [REAPARECER_99.md](REAPARECER_99.md).
- **`game_damaged` de un golpe PARADO.** El motor lo llama también entonces
  (el parry deja `flDamage = -1` y sigue, msmonsterserver.cpp:2246-2311; el
  guion corta con `if PARAM2 > 0`). Ni `golpear` ni el servidor lo hacen; es
  de los dos caminos y no se ha tocado.
- **`m_ReturnData` de `game_damaged`** (:2313-2320): los efectos que reducen
  el daño devolviéndolo (`protection`: `return local.effect.damage`) no lo
  reducen en ningún camino.
- **`ritmoAnim`** viaja en el cable y no se aplica al modelo (el 97 tampoco).
- **«%s parries the attack!»** (giattack.cpp:1970) sigue sin llamarlo nadie.

## 9. Corrección del integrador: 16, 18 y 17 de 18 en tres pasadas

Los dos rojos eran de la SONDA, no del juego. Se ve en el log del 17: 4
paradas, las 4 con `hablaElGuion`, y 4 frases en total. El juego dijo una
frase por parada.

- **«4 frases en 3 paradas contadas».** La ventana partía una parada en dos.
  Cada tanda medía 0,7 s fijos. Un `tupegas` que llegaba tarde caía en el
  hueco entre tandas y no se contaba; su frase viaja por otro mensaje
  (`MENSAJE.TEXTO`) y caía después de la marca siguiente, así que sí se
  contaba. Ahora cada tanda espera, antes de empezar y antes de leer, a 0,5 s
  sin ningún `tupegas` ni ninguna «Your attack was» nueva por el cable de B.
  Frases y paradas salen así de la MISMA ventana. El listón no baja: sigue
  siendo `frases.B === paradas contadas`.
- **El anillo, por tercera vez.** Con esas ventanas más largas y cinco
  esqueletos mordiendo, la marca se salía del anillo de `dicho()`: 23 de 32
  tandas tiradas en una pasada. Ahora un lector dentro de la página copia lo
  nuevo del anillo cada 50 ms a una lista que sólo crece, y cada tanda se
  cuenta por índices en esa lista.
- **Ninguna parada.** El parry 40 contra la tirada de acierto uniforme para
  un 2-5 % de los golpes. Dos pasadas acabaron con «no quedan esqueletos
  vivos» a los 40-170 golpes: un daño medio de 12,5, o sea que **los puños
  no estaban todavía en la mano**. `probe.golpe.empunar` carga el modelo en
  asíncrono, y se pegaba con la Blood Drinker. Ahora se espera a
  `golpe.estado.arma === "fist_bare"` antes de pegar: daño 0,6, los
  esqueletos no mueren y siempre hay más golpes que tirar. Hay además un
  tope de seis minutos (cabe en los 900 s del lanzador), tres golpes por
  tanda, y la sonda dice por qué acabó el bucle.

Tres pasadas tras el arreglo, las tres en **18 de 18**, con 4/42, 3/66 y 3/96
paradas por golpes, y frases B = paradas, C 0. En la misma tanda,
defensared97 13/13 y costurared92 16/16.
