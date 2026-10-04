# El servidor que se colgaba, y el nacimiento bajo el rayo — experimento 100

Dos pendientes del 99 (NEXT_SESSION.md, «Pendiente del 99», (1) y (7)):

1. **El servidor se seguía colgando** en `sonda:reaparecer99`, una de cada
   doce pasadas, sin atribuir.
2. **El nacimiento de Gate City ya no caía bajo un rayo de luz** desde que el
   99 descartó los rayos cuya caja no cabe.

```bash
node --test test/servidor100.test.mjs   # el tope por segundo y los guardados en fila
node --test test/nacer100.test.mjs      # el nacimiento horneado, contra el .bsp
npm run sonda:nacer100                  # Gate City por el menú, solo y con servidor: 8 de 8
npm run sonda:reaparecer99
```

## 1. Cómo se cazó: perfilar EN el cuelgue, y luego medir cada llamada

Con la máquina al 100 % (cuatro sesiones, quince `node` y doce Chrome a la
vez) el cuelgue dejó de ser uno de cada doce: **cinco de seis pasadas** de la
sonda sin arreglos se colgaron (`antes_1`, `antes_3`, `antes_4`, `ins_1`,
`ins_2`; `antes_2` salió 9 de 9). La carga no lo causa; lo destapa.

Dos instrumentos, los dos en el scratchpad de la sesión y no en el árbol:

- **Un vigía con el inspector** (`--inspect` por `SONDA_NODE_ARGS`, que la
  sonda ya admitía): pregunta `/partidas` cada 400 ms y, a los 4 s sin
  respuesta, pausa el hilo principal seis veces por el protocolo y apunta la
  pila. Seis de seis dentro de `_correrOrdenes → _simular → Player.step →
  computeColliderMovement` (y alguna en `world.step` y en `_atascado`),
  llamado desde `recibir`, o sea desde un mensaje del socket.
- **Un gancho de carga** (`module.register`, como las roturas del 99) que
  cronometra en el proceso del servidor cada `_simular` y, dentro, el
  `computeColliderMovement`, el `world.step` y `_atascado`/`_bichosDentro`, y
  apunta las llamadas de más de 25 ms con el estado del jugador.

Lo que dijo el gancho en las pasadas colgadas:

| | `ins_1` | `ins_2` |
| --- | --- | --- |
| llamadas a `_simular` de más de 25 ms | 601 (tope del registro) | 601 |
| reloj de la partida | **parado en `t = 36,54` más de un minuto** | parado en `t = 60,56` |
| coste de UNA orden quieta (`adelante 0`) | 150-250 ms, hasta 2 104 | 100-145 ms |
| dónde | `cuerpo.step` | `computeColliderMovement`: **74 369 de 77 377 ms (96 %)** |
| cilindros apartados en ese paso (`nAp`) | 2 | 2 |

El jugador estaba quieto, de pie, con dos arañas «apartadas» (`setEnabled(false)`)
porque estaban dentro de su cápsula — y el controlador tardaba lo mismo que
el 99 midió con una araña dentro **sin** apartar (125 ms).

## 2. La causa: apagar un colisionador no llega a las consultas

**Lo encontró a la vez, por otro camino, la sesión del atasco del navegador**
(doc/ATASCO_100.md; `encender` en src/play/atasco.js): en Rapier 0.14
`setEnabled(false)` no llega al árbol de consultas —ni a
`intersectionsWithShape` ni al controlador de personaje— hasta el siguiente
`world.step()` o `updateSceneQueries()`. `_bichosDentro` apagaba la araña y el
controlador **seguía chocando con ella**, dentro de la cápsula: el caso caro
del 99 (§4 de doc/REAPARECER_99.md), en cada orden, con el «arreglo» puesto.
`encender` pone el árbol al día al apagar y al encender.

Y por qué eso era un **cuelgue** y no un servidor lento: el tope del 99 es
POR MENSAJE y deja correr siempre la primera orden (`corridas > 0`). Con cada
orden a 150-250 ms y el cliente mandando decenas de mensajes por segundo, cada
mensaje pagaba una orden entera: llegaban más deprisa de lo que se despachaban,
la cola del socket crecía sin fondo y ni el paso fijo ni `/partidas` volvían a
tener turno. De ahí «minutos», y de ahí que el informe de cada diez segundos
dejara de salir.

**Las roturas en el proceso del servidor** (gancho de carga, sin tocar el
árbol; cada una dice «ROTURA100 puesta» o el servidor no arranca):

| rotura | resultado |
| --- | --- |
| sin `updateSceneQueries` en `encender` **y** sin el tope por segundo (§3) | colgado: el reloj parado en `t = 70,65`, órdenes de 45-52 ms con `nAp 2` sin parar (`rotAB0_1`); otra pasada 9 de 9 — sólo cuelga si una araña acaba dentro |
| sin `updateSceneQueries`, con el tope por segundo | **tres de tres con el servidor vivo**. En una (`rotA_2`) A se queda congelado entre arañas (la sonda no ve vueltas y se cae a los 216 s), y el servidor sigue a 100 pasos/s, vuelta de ~1 ms: el fallo vuelve a ser de un jugador y no de la partida |
| los dos arreglos (`conA`, `despues`) | ningún cuelgue de minutos en catorce pasadas (abajo) |

## 3. El tope POR SEGUNDO: que un Rapier caro no vuelva a colgar a nadie

`encender` quita ESTA causa. Pero la forma —una orden que cuesta más que lo
que dura, sin techo— la puede volver a traer cualquier otra cosa cara de
Rapier. `TOPE_MS_POR_SEGUNDO` (250, src/red/partida.js) cuenta, por cliente y
por segundo de reloj de pared, lo que cuesta simular sus órdenes, y deja de
simular (el tiempo se cuenta, el acuse sale: el trato de `SV_CheckCmdTimes`,
como el tope por mensaje) cuando:

1. el segundo ANTERIOR costó más de 250 ms,
2. y costó más reloj del que simulaba (la suma de sus `msec`): **no alcanza al
   reloj**, que es la forma exacta del cuelgue (150 ms de reloj por orden de 16),
3. y el segundo de ahora ya lleva más de 250.

Es nuestro: el motor no lo necesita porque `PM_PlayerMove` cuesta lo mismo
siempre. **Las dos condiciones de en medio salieron de dos rojos, y son la
parte que se entendió mal:**

- **La primera versión mordía en el primer segundo**, y `npm test` en
  paralelo la puso roja en cinco archivos de red (`red_27`, `red99`,
  `reaparecer99`, `servidor98`, `atasco100`): un primer paso de **738 ms** con la
  máquina cargada se llevaba el presupuesto y las veintinueve órdenes buenas
  de detrás no corrían. Es el miedo que el 99 dejó escrito sobre su tope de 50.
- **La segunda dejaba «clavado» al de `test/atasco100`**, que manda 3 600
  órdenes baratas seguidas, más deprisa que el tiempo real: con la máquina
  cargada eso pasa de 250 ms por segundo sin estar roto. De ahí la condición 2.

`test/servidor100.test.mjs` entra por `partida.recibir`, que es por donde
entran los del socket:

| prueba | sin el arreglo |
| --- | --- |
| control: treinta mensajes normales corren los treinta | — |
| con pasos de 80 ms, **sesenta mensajes de UNA orden** (el cuelgue): entre 6 y 24 pasos, el resto sin correr y el acuse hasta la última | **rojo**: «60 pasos de 60 en 4 879 ms» (sin el tope) |
| un solo paso de 700 ms no tira las órdenes buenas de detrás | **rojo** con el tope mordiendo en el primer segundo |
| 300 órdenes que van por delante del reloj (5 ms de coste, 16 pedidos) no pierden ninguna | **rojo** sin la condición 2 |
| el segundo siguiente vuelve a correr | — |

Cada rotura se puso con un gancho de carga en el proceso de la prueba (el
reemplazo casa una vez o revienta) y se comprobó puesta en su diario.

## 4. Lo que salió al medir: dos guardados a la vez, y un `EPERM` con carga

Dos rojos de «sin errores» en las pasadas de la sonda, los dos del guardado
del personaje (src/red/archivos.js), y los dos de antes del 100:

- **`ENOENT, rename …reaparecer99a.json.tmp`**: dos `escribir` del mismo
  personaje a la vez comparten el temporal; el primero lo renombra y el
  segundo lo busca ya movido. Medido aparte: **12 fallos de 40** guardados
  lanzados de dos en dos. Ahora los guardados del mismo id van en fila y queda
  el último que se pidió. Prueba en `servidor100` (20 parejas, 0 fallos, queda
  `Dos19`, ningún `.tmp`); con la fila rota, roja.
- **`EPERM` que sobrevivió a los tres reintentos** (0, 30 y 120 ms) con la
  máquina al 100 %, a la vez que B pedía «lista» —`listar` abre todos los
  personajes y Windows no deja renombrar sobre un archivo abierto—. Dos
  reintentos más, a 500 y 1 500 ms. Esto **no tiene prueba que lo ponga rojo**:
  no se ha conseguido provocar el `EPERM` a voluntad.

## 5. El nacimiento de Gate City, otra vez bajo el rayo

**Qué hace el motor con un punto de aparición: nada.** `IsSpawnPointValid`
devuelve `TRUE` siempre, con la comprobación de la caja comentada
(player.cpp:2277-2311); `MoveToSpawnSpot` copia el origen más una unidad
(:2928-2945). El único que aparta es `PM_CheckStuck` (pm_shared.cpp:3183-3189),
con los empujones de `PM_CreateStuckTable` (:3406-3510): 0,125, 1, 2 y 6
unidades, que no sacan a nadie metido 9 o 20 en una pared. O sea que **el motor
da por hecho que el mapeador puso el punto donde cabe**. Aquí el punto no lo
puso el mapeador —en Gate City el suyo, `ms_player_begin`, está en una cueva
con tres goblins, y lo cambia `tools/aparicion.mjs` desde el 50—, así que esa
parte es nuestra.

`bajoElRayo` (tools/aparicion.mjs) busca, desde el centro del rayo y en
anillos de una unidad, el sitio más cercano donde la CAJA cabe (`cabeDePie`,
`PM_TestPlayerPosition` con el casco 1), el suelo está a menos de un escalón
(`sv_stepsize` 18) y **la huella del haz se mete en la planta de la caja**:
menos de media caja (16, `VEC_HULL_MIN/MAX`, util.h:464-465) en cada eje. No se
aparta más de 64 unidades, el primer anillo de `apartar`.

| | el 99 | el 100 |
| --- | --- | --- |
| rayos de Gate City utilizables | 3 de 31 caben en su centro; ninguno en el templo | **17 de 29** que no caben en su centro, apartados de 3 a 9 u |
| nacimiento | «Priest of Urdual (apartado)», `[88, 2472, −416]`, luz 66 | **rayo `*37`**, a 2,9 m del sacerdote, `[128, 2511, −416]`, apartado **9 u** de su centro, luz 71; en escena (3,25, −10,57, −63,78) |
| la caja y el haz | — | el haz (y 2512-2528) cubre 15 de las 16 u de la mitad de la caja que da a él |

Los otros cuatro mapas no cambian: los cuatro respetan su `ms_player_begin`
(comparado contra el horneado de antes: Edana, cloacas, bosque y sala88,
nacimiento y reaparición iguales). **Esto cambia dónde aparece un personaje
nuevo en Gate City**, a ~0,9 m del sitio del 99 y debajo del tragaluz.

**Lo que se entendió mal por el camino:** la primera versión pedía que la
huella «tocara» la caja (`<=` 16) y eligió el `*48` —el rayo del 98—
apartado 20 u: la caja pegada al haz por el canto y **cero unidades de haz
dentro**. El haz caía al lado del jugador. Con `<` 16 el `*48` ya no vale (a 19
la caja todavía no cabe) y ganan los dos del altar, que están a 8-9 u.

**Medido** (`sonda:nacer100`, por el menú, 8 de 8):

| # | control | medida |
| --- | --- | --- |
| 1 | aparece donde dice el horneado (solo) | desvío 0,00 m |
| 2 | la huella del brush, leída del `.bsp` en la sonda, se mete en la caja | `*37`: a 0,0 y 1,0 u (menos de 16) |
| 3a | salta ENTERO donde nace, sin andar | 1,12 m |
| 3b | anda en los cuatro sentidos | 2,55 · 1,13 · 1,59 · 2,14 m |
| 4a | con servidor, `_sitioLibre` no le aparta (anillo 0) y cabe | al punto 0,00 m |
| 4b | el servidor dice que en el nacimiento cabe | `cabe: true` |
| 5 | CONTROL: en el centro del rayo la caja NO cabe | centro `[128, 2520, −416]` no; nacimiento sí |

| rotura (sin tocar `build/`) | rojos |
| --- | --- |
| `ROTURA100=centro`: el navegador recibe el nacimiento en el centro del rayo (Playwright `route`) | 3a (salto 0,00 m) y 3b (0,00 en los cuatro): `PM_CheckStuck` del navegador le congela |
| `ROTURA100=lejos`: 40 u más allá, cabe y no está debajo | 1 y **2** (a 41 u de la huella), y 3a |
| `bajoElRayo` sin apartar (gancho en `tools/aparicion.mjs`, sin escribir) | la herramienta vuelve al sacerdote y su control «apartar salva rayos» sale rojo |
| huella con `<=` en vez de `<` (ídem) | elige el `*48` y su control «el rayo cae sobre la caja» sale rojo |
| `test/nacer100` contra tres horneados rotos (`APARICION100`) | centro: 1 rojo (cabe); lejos: 1 (huella); el del 99: 4 |

## 6. Las cuentas de la sonda, antes y después

`sonda:reaparecer99`, siempre con el gancho de medida puesto:

| tanda | pasadas | colgadas (reloj de la partida parado minutos) |
| --- | --- | --- |
| sin arreglos (`antes`, `ins`) | 6 | **5** |
| con `encender` (`conA`) | 8 | 0 — 6 de 9-de-9; los rojos: A muere una sola vez en 240 s (las arañas), y el `ENOENT` del §4 |
| con los dos y la fila de guardados (`despues`) | 6 | 0 — 2 de 9-de-9; los rojos: una respuesta de 5 s (`despues_1`), 60-78 pasos/s y 2 vueltas de A (`_3`, `_4`), el `EPERM` del §4 (`_4`) y un Chrome que revienta («Target crashed», `_5`) |

**Y lo que queda, que no es un cuelgue**: con la máquina al 100 % hay paradas
de 1 a 14 s. El gancho las reparte así: **la fauna** —`fauna.paso` se lleva
190 de los 202 s de vueltas lentas en `despues_4`, de 4 a 7 ms por paso y
picos de 150— y órdenes que tardan hasta 1,2 s **con cada pieza de Rapier por
debajo de 1 ms**: el proceso esperando CPU, no trabajando. `avanzar` corre
hasta cien pasos por vuelta para alcanzar al reloj, así que con la fauna cara
una vuelta dura segundos. Ver §8.

**Las vecinas, al final y una detrás de otra** (`npm run sondas -- -j 1`):
`reaparecer99` 9/9, `red99` 9/9, `red` 21/21, `servidor98` 18/18, `nacer100`
8/8; `salto99` 10/11 —un salto «en el acto» de 0,87 m— y pasada otras dos
veces: 10/11 (el control del techo bajo a 0,00 m) y 11/11. De los dieciocho
saltos en el nacimiento nuevo, diecisiete enteros (1,09-1,14 m). `npm test`:
3 071 en verde, 0 rojos.

## 7. Lo que se entendió mal (las herramientas)

- **Pausar dentro de Rapier y llamar a Rapier** desde el inspector da
  «recursive use of an object detected which would lead to unsafe aliasing in
  rust»: el `evaluateOnCallFrame` sólo puede leer JavaScript. Por eso el
  segundo instrumento fue un gancho que mide en marcha, no en pausa.
- **El gancho de medida tuvo dos fallos propios** que contaminaron cuatro
  pasadas: una ruta de Git Bash (`/c/Users/…`) que Node lee como `C:\c\Users`
  —y el `appendFileSync` lanzaba DENTRO de `_correrOrdenes`—, y un `const`
  declarado en el `try` y usado en el `finally`. Se tiraron esas pasadas.
- **Git Bash reescribe las variables de entorno que parecen rutas**:
  `ARCHIVO100=/src/red/partida.js` llegó como `C:/Program Files/Git/src/…`, el
  gancho de rotura no casaba con nada y la prueba salió verde «con la rotura
  puesta». Lo delató el diario del gancho, no la prueba. El 80 otra vez.
- **Dos bucles de la sonda a la vez** (uno que no se paró al pararlo) se
  quitaban los puertos 5997/5998 el uno al otro; esas dos pasadas se tiraron.

## 8. Pendiente

- **La fauna con la máquina cargada.** `fauna.paso` a 4-7 ms por paso no es
  un cuelgue, pero con `avanzar` recuperando cien pasos por vuelta y la CPU
  repartida entre cuatro sesiones da paradas de varios segundos (`4a` y `4b`
  rojos sueltos en `reaparecer99`). El perfil de la 99 ya apuntaba a `cazar`.
- **El tope por segundo es por cliente**: con N jugadores rotos a la vez el
  servidor gasta N × 250 ms por segundo. Con dos no se ha visto.
- **El `EPERM` del guardado** no tiene prueba roja (§4).
- `rotA_2`: con `encender` roto y el tope puesto, la sonda se cae con «fetch
  failed» a los 216 s con el servidor vivo; no se miró por qué.
