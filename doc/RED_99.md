# La predicción anda lo que anda el servidor — experimento 99, pieza Q

`npm run sonda:red99` · `node --test test/red99.test.mjs` (17 pruebas)

Dos pendientes del 98 (NEXT_SESSION.md, «Pendiente del 98» punto 4):

1. Con servidor, el navegador **predecía a 160 u/s a todo el mundo**, y el
   servidor simulaba la velocidad de verdad de cada personaje (184 y 91,3
   medidos en el 98).
2. El `givehp` del guion de un NPC reventaba con **«e.dar is not a function»**.

## 1. Lo que se midió antes de tocar nada

La sonda nueva (sondas/red99.mjs) entra por el menú con dos personajes
fabricados con `tools/personaje.mjs` que andan distinto según el servidor:
«Red99a» con las habilidades de un recién creado y la mochila del Veteran, sin
nada puesto (sin el `failed_str_req_loop` del fénix: aquí se mide el PESO, no
las trabas), y «Red99b», el Veteran tal cual. Andando tres segundos con la W:

| | servidor | predicción | error de posición | correcciones | `probe.fisica.vitales()` |
| --- | ---: | ---: | --- | ---: | --- |
| A (débil, cargado) | 91,3 | **91,3** | mediana 0,1 cm | 3 | andando 91,3 |
| B (Veteran) | 184,0 | **160,0** | mediana **8,6 cm**, máx 25,4 | **73** | andando **184** |

Dos cosas que la sospecha del 98 no decía:

- **El bucle del navegador sí usaba la velocidad del personaje**: sus vitales
  daban 184 para B. La sospecha («la rama `manda && sesion?.personaje` o la
  copia del personaje del navegador») era falsa en las dos mitades.
- **A acertaba y B no**, y la diferencia es que B anda a MÁS de 160. Eso
  apuntaba a algo que pone 160 y que a A no le hace daño… mientras no corrija.

## 2. La causa: rehacer las órdenes con el 160 del perfil

`ClienteDeRed._reconciliar` (src/red/cliente.js), cuando la foto no casa con lo
predicho, coloca el cuerpo donde dice el servidor y **vuelve a correr las
órdenes que el servidor aún no ha visto**. En el navegador las corre el gancho
`red.simular` de src/main.js, y ese gancho hacía:

```js
maxima: o.maxima ?? undefined,
```

Una orden (`orden()`, src/red/protocolo.js) **no tiene `maxima`**: lleva la
intención en [-1, 1] y el servidor recalcula la velocidad, que es la
autoridad. Así que caía siempre en `undefined` y `Player.pasoMsr` usaba
`this.maxima`, que es `perfil.walkSpeed` = **160**.

Y es un bucle que se alimenta solo: la primera foto corrige siempre (no hay
nada predicho para su `ack`); esa corrección rehace las pendientes a 160; lo
rehecho ya no casa con el servidor (184), y la foto siguiente vuelve a
corregir. Cada 50 ms el cuerpo volvía a 160 y la sonda, que lee la rapidez
entre dos fotogramas, la leía casi siempre recién rehecha. A no lo sufría
porque a A el bucle no le arrancaba (sus errores no pasaban el umbral) — y
cuando arranca le pasa lo mismo: en Node, con el gancho viejo, A corrige en
cada foto y su predicción sube a 149 (test/red99, control positivo).

### Lo que dice el motor

En GoldSrc la velocidad **viaja dentro de la orden**. El cliente de Master
Sword calcula `fSpeed` (`CheckSpeed`, clplayer.cpp:306-316, con el
`pev->maxspeed` de los efectos como porcentaje en :306-307) y lo escribe en
`cl_forwardspeed` (:311); `CL_CreateMove` lo mete en `cmd->forwardmove`
(input.cpp:795-796). La predicción rehace los `usercmd` tal cual, así que
rehace con la velocidad con que se crearon. Y el tope de las trabas,
`pmove->maxspeed`, sale del `clientmaxspeed` del servidor
(pm_shared.cpp:3050-3053; src/play/trabas.js).

## 3. El arreglo

- **src/red/cliente.js**: `apuntar(entrada, { velocidad })` guarda
  `{maxima, tope}` por `seq` (`this.velocidades`, que se suelta con el `ack`
  como `predicho`), y `_correr(o, { rehacer })` se la da al gancho:
  `simular(cuerpo, o, v)`. Es el `forwardmove` del `usercmd`, guardado en el
  cliente en vez de mandado: el servidor sigue calculando la suya.
- **src/main.js** (dos sitios, localizados): `red.simular` usa `v.maxima` y
  `v.tope`; y el bucle, al `apuntar`, pasa la `maxima` y el `tope` con que
  acaba de correr la orden.
- **El cliente de Node** (sin `simular`: las pruebas y `npm run cliente`)
  calcula con `correrOrden` (src/red/andar.js, nueva), que es el cuerpo de
  `Partida._simular` del 98 sacado a una función: la intención trabada
  (`trabarIntencion`), el aguante (`velocidadDelPaso`) y `velocidadConTrabas`
  con las trabas que trae la foto (`trabasDelCable`). Hasta aquí ese cliente
  no leía las trabas: aturdido, predecía 184 contra 45. Rehacer no vuelve a
  cobrar aguante: usa la velocidad guardada.

### Y una segunda causa, que sólo se vio con la primera arreglada

Con la velocidad buena, la sonda seguía contando correcciones (A 32 en 5 s,
error ~1 mm). El bucle de src/main.js corría el cuerpo con `DT` = 16,67 ms y
la orden decía `msec` 16 o 17 —es un byte de milisegundos enteros—, que es lo
que corre el servidor y lo que rehace `simular`. Cada orden iba hasta 0,67 ms
por delante o por detrás: 3 mm a 184 u/s, por encima del umbral de 1 mm
(`UMBRAL_DE_CORRECCION`). No se acumula —`msecDe` guarda el resto—, pero
basta para corregir sin que nada esté mal. En el motor cada orden se mueve con
su propio `msec`, en el servidor y en la predicción: `pmove->frametime =
pmove->cmd.msec * 0.001` (pm_shared.cpp:3166). Ahora, **con servidor**, el bucle pide los milisegundos de la
orden ANTES del paso y anda exactamente ésos (`msOrden`); en solitario no
cambia nada.

## 4. Lo que se midió después

La sonda, con los dos arreglos y **tres correcciones forzadas** por personaje
(cada segundo se aparta el cuerpo del navegador 3 cm; ver abajo por qué):
**9 de 9**.

| | servidor | predicción | error de posición (sin los 400 ms tras cada mentira) | correcciones |
| --- | ---: | ---: | --- | ---: |
| A | 91,3 | 91,3 | mediana 0,0 cm, p90 0,0 mm | 12 |
| B | 184,0 | 184,0 | mediana 0,1 cm, p90 1,2 mm | 24 |

Y antes de llegar ahí, dos pasadas que enseñan lo que mide y lo que no:

- Con sólo el primer arreglo (sin `msOrden`): A 32 correcciones en 5 s con
  error ~1 mm, B 6 (`red99_d`). Era el `DT` contra el `msec` de la orden.
- Con los dos, pero andando los dos en la dirección del sitio de nacer: B con
  picos de **17-25 cm** a los 2,6-3,9 s y p90 de 171 mm. No es velocidad: las
  cápsulas de los dos jugadores chocan en el servidor y el cuerpo que predice el
  navegador no tiene la del otro (en el motor la predicción sí mete a los demás
  jugadores, `CL_SetSolidPlayers`). Ahora cada uno anda DE ESPALDAS al otro
  (`probe.red.crudos()`); el pico de 8 cm que queda en B es de ese tipo o de
  una pared. Predecir contra los demás jugadores es un pendiente aparte.
- **La rotura deliberada salió 8 de 9 con el fallo puesto** en una pasada
  (`red99_rota2`): los dos predecían su velocidad buena. El fallo vive en
  REHACER tras una corrección, y con el `msOrden` puesto ya casi no hay
  correcciones: el bucle de los 160 no llegaba a arrancar. El §4 de CLAUDE.md
  tal cual — el mecanismo bajo prueba no se disparaba. Por eso la sonda ahora
  FUERZA una corrección cada segundo (una «mentira» de 3 cm hacia atrás, por
  donde ya ha pasado) y pide que haya al menos tantas correcciones como
  mentiras.
- Una pasada de la rotura se quedó **diez minutos parada** en un
  `page.evaluate` que no volvía, sin decir nada. No se sabe por qué (la máquina
  estaba al 100 % con otras sesiones). La sonda lleva ahora un plazo de 30 s
  por `evaluate` y un vigía de 15 minutos: colgarse es una roja.

**Lo que queda y NO es de esto**: la foto redondea la posición a milímetros
(`red`, src/red/partida.js) y el umbral de corrección es de 1 mm, así que con
la predicción bien el error ronda el umbral y se corrige de vez en cuando. En
Node, con el mismo cliente: andando desde la entrada, una corrección (la de
entrada) y errores de 0,4-0,6 mm; pero tras una corrección **en marcha** (una
mentira de medio metro, o la llegada de una traba) el cliente vuelve a
corregir a ratos con errores de 1 a 28 mm durante un segundo. Sospecha SIN
MEDIR: la altura redondeada al colocar el cuerpo cambia el apoyo de un paso
(en el aire el control es casi cero). Por eso la sonda y las pruebas miden el
error y la rapidez, y las correcciones se dicen sin contarse.

## 5. `givehp` en un NPC

`ScriptCmd_GiveHPMP` (scriptcmds.cpp:3434-3455): sin objetivo, o con `ent_me`,
es la entidad del guion, y en un monstruo eso es `CMSMonster::Give`
(msmonsterserver.cpp:1971-1998):

```c
float AddAmount = V_min(Max - *Current, Amt);
AddAmount = V_max(-*Current, AddAmount);
...
*Current += AddAmount;  pev->health = *Current;
```

No pasa del máximo, no baja de cero, y **no mata**: lo dice el propio comando
(«reducing HP below zero in this fashion may not trigger death events»,
scriptcmds.cpp:3437). Portado como `dar` en `entornoDe`
(src/play/npcguion.js): escribe `instancia.vida` con ese tope, sin pasar por
`herir`. `FL_GODMODE` (:1991-1992) no existe para un bicho en este puerto.

En los guiones de `monsters/` (contando las líneas que EMPIEZAN por el comando; un `givehp` detrás de un `if` en la misma línea no entra): **18 `givehp` a sí mismos** (con un parámetro o
con `ent_me`: el esqueleto vampiro, el bandido jefe, el murciélago vampiro, el
dragón guardián…), y 7 a OTRA entidad: `givehp MY_OWNER` de la invocación
Blood Drinker (summon/blood_drinker.script:123, :128) y cinco `givemp` al
objetivo o al dueño (eye_drainer.script:134, k_hollow_one.script:467,
summon/lesser_wraith.script:207, :228, wraith_summoned.script:212). Ésos, y el
maná de un bicho, **se apuntan** como no soportados — no se callan ni
revientan. Dar vida o maná al jugador desde un NPC necesita un gancho hasta su
sesión (navegador y servidor) y queda pendiente.

## 6. Resultados

### Node

`test/red99.test.mjs`, 17 pruebas, contra una `Partida` de verdad (cable en
memoria con 50 ms de retraso, y una por un socket de verdad que se cierra en
un `finally`):

| prueba | con el arreglo | con el gancho de antes |
| --- | --- | --- |
| rápido (184), 2 s andando | 1 corrección, error < 1 mm | ≥ 20 correcciones, 25 mm, predice 180 |
| lento (91,3), 2 s andando | 1 corrección, error < 1 mm | ≥ 20 correcciones, 50 mm, predice 149 |
| aturdido (45 en el servidor), cliente de Node | `maxima` igual a la del servidor, rapidez igual, error < 1 cm | sin leer las trabas: ≥ 10 correcciones y > 2 cm |
| vampiro muerde | gana lo que muerde, `costuraFallos` 0 | (sin `dar`: rojo) |

**Las roturas deliberadas** (aplicadas en una copia del árbol, comprobadas con
`grep -c` = 1 antes de correr):

1. `this.simular(this.cuerpo, o, guardada)` → `…, null)`: rojas las dos de
   «la corrección de entrada se rehace bien».
2. `const trabas = this.trabas ? trabasDelCable(…) : null` → `null`: roja
   «ATURDIDO».
3. `dar(` → `darRoto(` en `entornoDe`: rojas tres de las cuatro de `givehp`
   (el control «sin vampiro» sigue verde, como debe).

`npm test` en una copia limpia (HEAD + estos cambios): **2 926 de 2 928**
(0 rojas, 1 omitida, 1 todo).

### La sonda

Ver §4 para la pasada verde. **La rotura deliberada de la sonda**
(`ROTURA99=1`: Playwright cambia `maxima: v?.maxima ?? undefined` por
`maxima: undefined` en el src/main.js que sirve Vite a ESTAS páginas; la sonda
comprueba que el reemplazo casa una vez y lo dice):

- con la sonda final (mentiras): **7 de 9**. B predice **160 contra 184**, p90
  45,5 mm, 48 correcciones para 3 mentiras. **A sigue verde** (91,3 contra
  91,3, 17 correcciones): a quien anda MENOS de 160 rehacer a 160 le pasa
  poco en la rapidez que se lee, porque el bucle siguiente la vuelve a bajar.
  El control que muerde es el de B; el de A no defiende esto y se dice.
- una pasada anterior, sin mentiras: 3 de 9 (A 160 contra 91,3 con 43,6 cm
  de mediana, B 160 contra 184). La otra, también sin mentiras: 8 de 9 — la
  del párrafo de arriba que obligó a forzar las correcciones.

Lo que NO defiende ningún control: el `msOrden` de src/main.js (andar los
milisegundos de la orden). El error que mete son ~1-3 mm por orden, por debajo
del p90 de 5 mm de la sonda, así que lo esperable es que quitarlo la deje
verde y sólo suba las correcciones, que se dicen y no se cuentan. **No se ha
roto a propósito**; lo que hay es la cuenta (0,67 ms × 184 u/s) y dos pasadas
que no son comparables del todo (A: 32 correcciones sin él, 2 con él, pero la
segunda ya andaba de espaldas al otro).

### Las vecinas, con `-j 1`

El árbol estaba compartido con otras sesiones del 99 que tenían a medias
src/red/partida.js (el atasco), src/play/player.js y src/play/movimiento.js, y
la máquina al 87-100 % de CPU. Por eso cada rojo se volvió a pasar en una copia
LIMPIA del árbol (`git worktree` en HEAD + sólo los cambios de esta pieza,
src/main.js incluido, hunk a hunk):

| sonda | árbol compartido | copia limpia |
| --- | --- | --- |
| red | 1.ª tanda: caída («el servidor no contestó a 'lista'», vueltas del servidor de 500 ms); 2.ª: **verde** | — |
| red95 | 11 de 12 dos veces: Beto se queda a 1,8 m del rincón (17,24 / 17,85 contra 19,0) | **12 de 12** (llega a 18,95) |
| efectosred93 | 1.ª: 23 de 24 (el icono del veneno); 2.ª: **24 de 24** | — |
| costurared92 | **16 de 16** | — |
| servidor98 | 16 y 15 de 18: los dos del parry de la fase 2 (0 paradas) y un `EPERM` de Windows al renombrar el guardado. Las de velocidad, verdes: **B predice 184,0 contra 184,0** (el 98 leía 160) y A 45,7 con el tope | **17 de 18**: «4 frases en 3 paradas» en el parry. La misma copia SIN esta pieza (HEAD puro): 18 de 18, 3 en 3, y predice **160 contra 184** y 50 contra 45,7. Una tercera pasada con la pieza se cayó en la entrada de la fase 2 (plazo de 90 s, máquina al 100 %). **Sin atribuir**: ver §7 |
| red99 | 9 de 9 (y la rotura, 7 de 9) | — |

`npm test` en el árbol compartido: 13 rojas, todas de la red (test/red99,
test/red_27 «sin mentiras la predicción acierta», test/servidor98 «aturdido…
libre otra vez»): en `mundoLiso` el cuerpo del servidor no anda o se queda
atrás (0 u/s, 233 mm). **test/red_27 y test/servidor98 no usan nada de esta
pieza** —servidor98.test no toca `ClienteDeRed`— y en la copia limpia
(HEAD + esta pieza) pasan las 2 926: es el trabajo a medias de la otra sesión,
no esto. Se le avisa en el informe. *Más tarde, el mismo día:* con el trabajo
de la otra sesión ya asentado, `npm test` en el árbol compartido da **2 983 de
2 985** (0 rojas, 1 omitida, 1 todo) y test/red99 sus 17 en verde.

## 7. Pendiente

- `Partida._simular` todavía lleva su copia en línea de `correrOrden`: en el 99
  otra sesión editaba ese método (el atasco) y no se tocó. Pasarlo a la
  función es mecánico; lo que obliga hoy a que den lo mismo es la prueba
  «`correrOrden` da lo mismo que `Partida._simular`».
- El redondeo a milímetros de la foto contra el umbral de 1 mm (§4).
- `givehp`/`givemp` de un NPC a otra entidad, y el maná de un bicho (§5).
- El copiado del gancho `simular` en la prueba de Node (no se puede importar de
  src/main.js): lo que mide el de verdad es la sonda.
- **servidor98, «EL PARRY CON SERVIDOR», 4 frases en 3 paradas** en una pasada
  limpia con esta pieza, contra 3 en 3 sin ella. Una pasada de cada no
  distingue una carrera del contador (las paradas se cuentan por las fotos y
  las frases por la consola, con el servidor a 900 ms por vuelta) de un efecto
  de verdad. Lo que esta pieza toca del camino del esqueleto es `givehp`: el
  vampiro ya no revienta en `game_damaged_other` y sigue con su `effect glow` y
  su `playsound` (skeleton_poison_random.script:304-306), que no escriben
  frases. Hay que repetirla con la máquina tranquila.
- Predecir contra las cápsulas de los demás jugadores (§4).
