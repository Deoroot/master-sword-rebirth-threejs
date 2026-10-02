# 70 — La tapa de la cloaca, y una puerta que llevaba veintidós experimentos abriéndose mal

`func_door`. Tres en Edana, cero en Gate City. Es la pieza que el 69 dejó
explícitamente pendiente: rompías el almiar de 8 de vida, el disparo salía, la
puerta de la cloaca lo recibía y **ahí se paraba**, porque las deslizantes no
estaban portadas. Ahora el bucle se cierra.

De paso apareció lo de siempre: al portar la clase nueva, la vieja estaba mal.
Las dos hojas de la casa del alcalde se abrían al acercarse y **en el motor no
lo hacen**.

---

## 1. Lo que no era pared, que es lo contrario de lo que esperaba

Las dos clases que salieron del mundo antes que ésta —las puertas rotatorias del
48 y los rompibles del 69— estaban **horneadas dentro del trimesh de colisión**:
eran pared con forma de puerta y pared con forma de almiar. El trabajo consistía
en sacarlas de ahí y devolverles su propia malla.

Con `func_door` la cuenta salió al revés. La malla de colisión es

```js
const solidas = caras.filter((c) => c.modelo === 0 || SOLIDAS.has(c.clase));
```

y `SOLIDAS` es `func_wall` y nada más. Una `func_door` nunca estuvo ahí. Estaban
**sólo dibujadas**: la tapa de la cloaca de Edana es una lámina de 4 unidades de
grosor, y se pasaba andando. El sótano estaba abierto desde el primer día y no
se veía, porque encima de la tapa hay un suelo dibujado que parece suelo.

Así que esto no las saca del trimesh —nunca estuvieron— sino que hace dos cosas
que se cuentan por separado: **les da el colisionador que les faltaba** y **las
mueve**.

La sonda lo mide con un rayo vertical en el centro de la tapa:

```
  LA TAPA, CERRADA
    lo sólido bajo  -8.230 m       <- antes de este experimento: nada
  ABIERTA
    lo sólido bajo  NADA
```

## 2. El recorrido no es un número de la entidad

```cpp
m_vecPosition2 = m_vecPosition1 + (pev->movedir *
  (fabs(movedir.x * (size.x - 2)) + fabs(movedir.y * (size.y - 2))
   + fabs(movedir.z * (size.z - 2)) - m_flLip));      doors.cpp:300
```

**Una puerta lineal se mete dentro de sí misma.** Recorre su propio tamaño en la
dirección en que abre, menos el `lip` que deja asomando, menos 2 unidades — y el
−2 lo explica el comentario de Valve en esa misma línea: *«the engine expands
bboxes by 1 in all directions making the size too big»*.

| entidad | modelo | tamaño | `angles` | `lip` | recorrido |
| --- | --- | --- | --- | --- | --- |
| `door1` | `*11` | 80 × 12 × 128 | `0 0 0` → +x | 8 | 80 − 2 − 8 = **70 u** |
| `sewer_door` | `*150` | 128 × 144 × 4 | `0 180 0` → −x | — | 128 − 2 − 0 = **126 u** |
| `sewerbeam` | `*154` | 128 × 144 × 276 | `0 180 0` → −x | — | **126 u** |

Y `lip` **no tiene valor por omisión en el código**, aunque el comentario QUAKED
de la cabecera del archivo diga «lip 8 default» (doors.cpp:261). `m_flLip` sale
de `CBaseToggle::KeyValue` (subs.cpp:392) y si la clave no está se queda en cero.
Es el caso del 64 otra vez: el comentario y el código no dicen lo mismo, y manda
el código.

## 3. La corrección del 48: `targetname` cierra la puerta al tacto

`CBaseDoor::DoorTouch` tiene una salida temprana que no estaba portada, con su
comentario delante:

```cpp
// If door is somebody's target, then touching does nothing.
// You have to activate the owner (e.g. button).
if (!FStringNull(pev->targetname))
{
    PlayLockSounds(pev, &m_ls, TRUE, FALSE);
    return;
}                                             doors.cpp:531-538
```

O sea: **tener nombre ya la cierra al tacto**, traiga o no traiga
`SF_DOOR_USE_ONLY`. El puerto del 48 sólo miraba la bandera.

A quién le toca, medido:

| mapa | rotatorias | con `targetname` | con la bandera |
| --- | --- | --- | --- |
| Edana | 7 | **2** (`door2`, las dos hojas de la casa del alcalde) | 0 |
| Gate City | 9 | 0 | 0 |

**Cinco de siete y nueve de nueve daban el mismo resultado con la regla mal**, y
ésa es la razón de que durara veintidós experimentos. Es la trampa del 50 —un
solo caso posible, el valor correcto y el de reposo son el mismo— con la
variante de que aquí había dos casos y los dos eran del mapa que nadie miraba de
cerca.

Y no es un detalle de acabado. `door2` lo abre un `trigger_once` desde dentro de
la casa, y hay **dos `trigger_changetarget`** —`mayorsdoor` y `mayorsdoor2`—
cuyo único trabajo es enchufar y desenchufar ese disparador. Una puerta que se
abre al empujarla convierte esa pareja entera en adorno.

## 4. La cadena, entera y por primera vez hasta el final

```
func_breakable *100 «hay», 8 de vida
     │ target
     ▼
sewer_door, que son DOS entidades con el mismo nombre
     ├─ func_door *150 (la tapa, wait −1, target «hay»)
     │       └─ al LLEGAR arriba dispara «hay» → mueren los otros TRES
     └─ trigger_relay
            ├─ killtarget sewer_open
            └─ target lightbeammm (multi_manager)
                     ├─ t = 0,0  sewerbeam   (func_door *154, el haz de luz)
                     └─ t = 0,5  sewerlight  (no existe en el mapa)
```

Dos cosas del motor que sostienen esto y no se adivinan:

- **`DoorHitTop` dispara AL LLEGAR, no al arrancar** (doors.cpp:673). La tapa
  tarda 126 u ÷ 100 u/s = **1,26 s**, así que hay un segundo y cuarto entre el
  almiar que se rompe y los otros tres que caen. Si disparara al arrancar la
  escena parecería igual de correcta.
- **`CBreakable::Use` mata sin mirar banderas**: `if (IsBreakable()) { ...
  Die(); }` y ya (func_break.cpp:486-496). Por eso la tapa los revienta.

Y `sewerlight` no existe en Edana: el `multi_manager` dispara un nombre que no
está en el mapa. No es un hueco del port, es el mapa.

## 5. Por qué el reloj de las deslizantes vive en el bus y el de las rotatorias no

Las dos son **la misma clase de C++**: `CRotDoor` declara dos métodos, `Spawn` y
`SetToggleState` (doors.cpp:845-850), y hereda el ciclo entero. `DoorGoUp`
pregunta `FClassnameIs(pev, "func_door_rotating")` en mitad del método para
decidir si gira o si desliza (doors.cpp:608).

Aun así, aquí el reparto es asimétrico y conviene decir por qué. El ciclo de las
rotatorias vive en `src/play/puertas.js` desde el 48, **con su `Blocked`
portado** —una hoja que gira te barre encima y sin eso te empotra en la pared— y
con su lado de apertura. Traérselo al bus sería tener **dos máquinas de estados
para la misma puerta**, que es literalmente la costura donde este proyecto se
equivoca (el 63, tres veces seguidas).

Así que: un disparo a una rotatoria sale por `salidas` como `puerta_gira` y lo
sirve quien ya la mueve. Lo que se pierde con ese reparto, medido: **`DoorHitTop`
no dispara el `target` de una rotatoria**, y le toca a **0 de las 16** de los dos
mapas, porque ninguna trae `target`.

## 6. `LinearMove` no mueve nada, y por eso aquí no hay interpolación

```cpp
// set nextthink to trigger a call to LinearMoveDone when dest is reached
SetThink(&CBaseToggle::LinearMoveDone);        subs.cpp:426-453
```

El motor pone una velocidad y un `nextthink` a `distancia / velocidad`. Así que
el bus no guarda una posición: guarda **cuándo empieza y cuándo acaba**, y quien
dibuja pregunta `fraccionDePuerta(e, t)`. Es la frontera de siempre en su sitio
—el movimiento es del motor, el choque es de Rapier— y hace que la posición a
mitad de camino sea una cuenta con el reloj y no un estado más que mantener.

Con una consecuencia que sí hubo que escribir: **invertir una puerta a mitad de
camino tarda lo que le falta, no el tramo entero.** Hoy no se invierte ninguna
(ver §8), y escribirlo con la duración completa habría sido una regla que sólo
vale mientras nadie la use.

## 7. El control del horneado que estaba mal escrito, cazado al romperlo

El horneado tiene un control nuevo: que ninguna puerta tenga recorrido cero. El
motor lleva el mismo (`ASSERTSZ(m_vecPosition1 != m_vecPosition2, "door
start/end positions are equal")`, doors.cpp:301), y es el fallo que se puede
colar: un `lip` mayor que el tamaño, o un `angles` mal leído que deje la
componente grande a cero, da una puerta que «se abre» sin moverse.

Lo escribí así:

```js
const quietas = correderas.filter((p) => Math.abs(p.recorridoUnidades) < 1);
```

Y al romperlo a propósito —doscientas unidades de `lip` de más— salió
**−130 / −74 / −74** y **el control se quedó verde**. Con el valor absoluto, un
recorrido dado la vuelta es un recorrido grande.

Un recorrido negativo no es un caso raro que haya que respetar: es la puerta
metiéndose en la pared en vez de en su hueco, o sea la señal de que el `lip` o
el `angles` se han leído mal **aquí**. El control tenía la forma exacta del
apartado 4 de CLAUDE.md: medía que el número era grande, no que era el bueno.
Ahora pregunta por el signo, y con la rotura puesta da rojo.

## 8. Lo que no se porta, con la cuenta de a quién le toca hoy

| qué | a cuántas | por qué |
| --- | --- | --- |
| `CBaseDoor::Blocked` en deslizantes (doors.cpp:725-805) | **0 de 3** | las dos de la cloaca traen `wait -1`, y con espera negativa el motor **no invierte**: *«so let it just squash the object to death real fast»* (doors.cpp:740-741). Y las dos traen `dmg 0`. `door1`, que sí invertiría y aplasta con `dmg 50000`, **no la puede abrir nadie** |
| el modo ADITIVO de `sewerbeam` | **1 de 3** | `rendermode 5`, `renderamt 80`. Sale de la malla del mundo —donde sí era transparente, desde el censo de modos de dibujo— y montado aparte queda opaco: un pilar de luz de 128 × 144 × 276 dentro de la cloaca |
| `netname`, el disparo del extremo contrario (doors.cpp:671 y :722) | **0 de 3** | ninguna lo trae |
| puertas ENLAZADAS, las que se tocan y se mueven juntas (doors.cpp:762-804) | **0 pares** entre las deslizantes | las tres tienen nombres distintos. En las rotatorias sí hay un par —las dos hojas de `door2`— y ahí el enlace sale solo, porque el disparo va por nombre y las coge a las dos |
| `DoorHitTop` disparando en una rotatoria | **0 de 16** | ninguna de los dos mapas trae `target`. Ver §5 |

Y una que es del mapa y no nuestra: **`door1` no la puede abrir nadie.** Tiene
`targetname` (así que no se toca) y no hay una sola entidad de Edana que la
apunte. `dmg 50000` y `wait 3` son los números de una puerta que nunca se mueve.
Se comprueba en una prueba, con su control positivo al lado —a `sewer_door` sí la
apuntan— para que no parezca un hueco del port.

## 9. Las roturas a propósito

Diez, y todas dieron rojo. La quinta y la décima son las que enseñan algo.

| se rompió | lo que se puso rojo |
| --- | --- |
| `DoorHitTop` no dispara su `target` | 5 pruebas, incluida la cadena entera del 69 |
| «si no está arriba, ábrela» en `Use` | 1: el segundo disparo reinicia el tramo y la tapa no llega nunca |
| arriba acepta disparo sin `NO_AUTO_RETURN` | 1 |
| el nombre no cierra la puerta al tacto | 1 prueba **y el control de la sonda** |
| invertir tarda la duración entera | 1 |
| disparar al arrancar en vez de al llegar | 3 |
| quitar el −2 del tamaño de la caja | 1: los recorridos salen 72/128/128 |
| `lip` doscientas unidades de más | **NADA, y ése fue el hallazgo** — ver §7 |
| se mueve el dibujo y no el colisionador | el control del rayo de la sonda |
| ninguna deslizante lleva colisionador | el control del rayo, con la tapa cerrada |

Y una más que no es una rotura del código sino de la sonda, y que es la lección
que más cara ha salido de este experimento: **el jugador estaba de pie en el
vano.**

El control positivo —«una de las cinco rotatorias sin nombre sí se abre al
acercarse»— salió rojo: `estado abriendo, ángulo 0,0°` después de segundo y
medio. No era la regla, era el sitio: `CBaseDoor::Blocked` invierte la hoja
cuando barre a alguien, y de pie en el centro del vano la puerta rebota en el
mismo grado para siempre. Está documentado en `src/play/puertas.js` desde el 48
—«se paraba a 10° para siempre»— y lo volví a pisar.

Lo grave no es el rojo. Es que **el control de al lado, el titular del
experimento —«la puerta del alcalde NO se abre al acercarse»— salía verde por el
mismo motivo.** Con las dos puertas medidas desde el centro del vano, ese verde
no medía la corrección del `targetname`: medía que la hoja rebotaba contra el
jugador. Habría dado verde con la corrección quitada. El apartado 4 otra vez, y
esta vez en la prueba que daba nombre al experimento — y lo destapó el control
positivo que estaba al lado, no mirar mejor.

## 10. Dos sondas vecinas que había que tocar, y una llevaba un experimento roja

«Al tocar algo, vuelve a pasar las sondas vecinas» (CLAUDE.md §3). Salieron dos.

**`sonda:edana69`** tenía un control que decía «la puerta de la cloaca SÍ ha
recibido su disparo, contado y no tragado», y lo medía con
`sinPortar.usar > 0`. Al portar las deslizantes ese contador baja a **cero**,
porque ya no hay nada sin portar que contar: el control se puso rojo **por el
éxito**. Se cambia por el que mide lo mismo ahora —que la tapa ha arrancado— y
se deja escrito el motivo al lado. El control hermano, «los otros tres siguen en
pie», se queda verde pero con **otra razón**: ya no es que falte `func_door`, es
que la tapa tarda 1,26 s y esa lectura es inmediata. Un verde que sigue verde
por un motivo distinto es una cita rota.

**`sonda:edana48`** salió **13 de 15**, y no por este experimento: llevaba roja
**desde el 69**. Tenía dos cuentas escritas a mano —33 087 triángulos de malla y
28 511 de colisión— y cada clase que sale del mundo para tener malla propia se
las lleva: el 69 restó 48 de cada una con los rompibles, y el 70 otros 56 de la
quieta con las deslizantes. Nadie la había vuelto a pasar.

Es el apartado 5 de CLAUDE.md al pie de la letra —«las cuentas se calculan, no
se escriben»— y ahora se leen del horneado, que es de donde el propio control
decía que salían. Sigue comparando dos cosas distintas (el archivo contra lo que
el navegador tiene montado) y el control negativo contra las cifras de Gate City
no se toca.

## 11. Lo medido

| | |
| --- | --- |
| `npm test` | **1723 / 1723** (eran 1699: +24 nuevas, y una del 69 que sube de 1 a 4) |
| `npm run sonda:edana70` | **20 / 20** |
| `sonda:edana69` · `edana68` · `edana67` · `edana60` · `edana48` | 26/26 · 13/13 · 18/18 · 13/13 · **15/15** (venía 13/15 desde el 69) |
| `sonda:golpe` · `arco` · `muerte41` · `mundo` | 26/26 · 40/40 · 34/34 · 44/44 |
| horneado de Edana | 3 `func_door` (56 tri), 70/126/126 u a 100 u/s, 2 sin retorno, 1 atravesable |
| horneado de Gate City | 0 `func_door` |

## 12. Lo que le queda a Edana

Del 69 quedaban seis cosas y ésta era la primera. Quedan:

1. ~~**Objetos en el suelo.** No hay ni uno en todo el port. Es lo que le falta a
   `msitem_spawn` para que la manzana caiga de verdad.~~ **Hecho en el 71**, ver
   [SUELO_71.md](SUELO_71.md). Queda la otra mitad: soltar del inventario.
2. ~~**`env_render` sobre un adorno.** Los nombres ya se hornean (9 de 46); falta
   saber qué trozo de la malla fundida es de cada colocación.~~ **Hecho en el
   76**, ver [ADORNOS_76.md](ADORNOS_76.md), y no por ahí: un adorno con nombre
   ya no se funde.
3. ~~**`ms_npcscript` tipos 0 y 4**, ×3: Edrin andando a `edrinspot`.~~ **Hecho
   en el 77**, ver [ESCENAS_77.md](ESCENAS_77.md).
4. **Una misión de punta a punta con sonda.** `quest` sale 118 veces en los
   guiones de Edana y no se ha seguido ninguna.
5. `merc3`, que una escena `evidence_found` nombra y no existe en el mapa.
6. Las dos `msarea_transition`, aplazadas por el usuario desde el 67.

Y del propio 70, por si alguien quiere cerrarlo del todo: el modo aditivo del
haz de luz (§8) es lo único que se ve a simple vista.
