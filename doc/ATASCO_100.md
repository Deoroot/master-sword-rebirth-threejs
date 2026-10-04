# Experimento 100 — `PM_CheckStuck` y los bichos de dentro, también en el navegador

El 99 portó `PM_CheckStuck` (pm_shared.cpp:1852-1970, con su tabla de
:3406-3510) y el apartado de los bichos que se han metido dentro del jugador
(doc/REAPARECER_99.md §3-§4), pero **sólo al servidor**: `Partida._atascado` y
`Partida._bichosDentro`. El navegador seguía llamando a `player.step` a pelo, y
en solitario —donde no hay servidor que corrija— un bicho metido en el jugador
le dejaba clavado y una roca le hacía calcular a Rapier lo que el 99 midió en
segundos. Era el punto 1 del «Pendiente del 99».

## 1. Lo que se ha hecho

**Una sola regla para los dos lados**, en `src/play/atasco.js`:

| pieza | qué es | quién la llama |
| --- | --- | --- |
| `atascarse(cuerpo, atasco, {t, botones, probar})` | `if (PM_CheckStuck()) return;` (pm_shared.cpp:3183-3189) sobre un `Player`: coloca si el motor mueve el origen, y velocidad a cero si `PM_FlyMove` empezaría en sólido (:1059-1067) | `Partida._atascado` y `pasoSinAtasco` |
| `bichosDentro(cuerpo, {esJugador})` | los cinemáticos que no son jugadores y cortan la cápsula entera | `Partida._bichosDentro` y `pasoSinAtasco` |
| `encender(cuerpo, cols, si)` | apaga/enciende y **pone al día el árbol de consultas** (§3) | `Partida` y `pasoSinAtasco` |
| `pasoSinAtasco(cuerpo, ctx, paso)` | lo anterior en orden alrededor de `cuerpo.step` | `PasoLocal` |
| `PasoLocal` | el paso del jugador del navegador: `pmove->server = 0`, o sea el `Atasco` con los 54 intentos del cliente (:1876-1900) | `src/main.js` |

En `src/main.js` los dos sitios que movían al jugador —el bucle de paso fijo y
`red.simular`, que rehace órdenes tras una corrección del servidor— pasan por
`pasoLocal.step`. Las dos, porque en el motor el cliente corre `PM_Move` entero
en cada orden que predice, `PM_CheckStuck` incluido. `Partida._atascado` y
`_bichosDentro` se quedan como envoltorios (con sus contadores) de las mismas
piezas.

**Lo que es nuestro en `PasoLocal`**, dicho en el archivo:

1. El reloj de `rgStuckCheckTime` es la suma de los `dt` que pasan por él, no
   `Sys_FloatTime`; al rehacer órdenes avanza también.
2. **Con el jugador parado, el mundo sigue**: se llama a `world.world.step()`
   aunque el jugador no se mueva. En el navegador ése es el único `step` del
   mundo (lo daba `Player.step`), y sin él los cilindros y las puertas se
   quedarían quietos mientras dure el atasco. Tiene prueba y rotura propia.
3. El forcejeo contra otro jugador (:1936-1966) no se puede disparar: en el
   navegador los demás no tienen colisionador.

## 2. La sonda: verde la primera vez que importaba, y luego no

`sondas/atasco100.mjs` (puerto 5985) entra por el menú en Gate City, crea
personaje y clava **el cilindro de un bicho de verdad** (el más alto, 96 × 28
unidades; `probe.mundo.clavarCilindro`, que lo vuelve a poner tras cada
`seguir()` del bucle) en los pies del jugador. Con la W pulsada un segundo,
mide lo andado contra lo que se anda sin nada desde el mismo sitio.

Las dos primeras pasadas dieron **0,77 m de 5,29** y **0,77 de 4,73**, y la
tercera 4,66 de 5,83. 0,77 m es exactamente radio de la cápsula + radio del
cilindro (0,406 + 0,356): el jugador salía del bicho **y se quedaba en el
borde**, con la rapidez entera (161 u/s) y sin moverse, y `dentro` a 0. La
traza por fotograma que lleva ahora la sonda es la que lo enseñó.

## 3. Lo que de verdad pasaba: dos cosas de Rapier, y estaban también en el servidor

Reproducido en Node con el mismo cilindro y luego al azar (400 salidas desde
dentro, rumbo y tamaño al azar, 60 pasos):

**a) `setEnabled` no llega a las consultas hasta el siguiente `world.step()`.**
Paso a paso, con el cilindro dentro: un paso se le ve dentro, se apaga, y el
controlador **todavía choca con él** (avanza 0,06 cm); el `world.step` de ese
paso lo apaga en el árbol, después se enciende, y en el siguiente paso ni se
le ve dentro ni choca (avanza 8 cm). **Uno sí y uno no.** El 99 lo midió como
«sale andando» porque la mitad de los pasos bastan para salir. Arreglo:
`encender` llama a `updateSceneQueries()` tras cambiar, sólo si hay algo que
cambiar (casi nunca).

**b) El controlador no se despega de lo que tiene a menos de su piel.** El
`offset` del controlador es `perfil.skin`, 2 cm. Medido, con el cilindro a
0,2-1,9 cm por DETRÁS, andar hacia delante da **0,00 m**; a 2,1 cm da 0,88 y a
3 cm 2,41. Y salir de un bicho apartado deja al jugador, por construcción,
justo ahí: el último paso con el cilindro apagado acaba en cuanto la cápsula
deja de cortarlo. Arreglado (a), los pasos ya avanzan todos y por eso acaban
TODOS en el borde: **50 de 400** salidas clavadas, a 0,6-1,8 cm. Es el borde
del 81 y del 82 otra vez: cuando tu aritmética deja el cuerpo justo en el
umbral de otro, el caso del borde no es el raro, es el único.

Arreglo de (b), nuestro y dicho en `bichosDentro`: el que estaba apartado en el
paso anterior **sigue apartado mientras esté a menos de dos pieles** (cápsula
de radio + 2 × skin). Uno que no estaba dentro no entra por ahí, así que el que
sólo toca sigue parando: andando contra un cilindro el controlador te deja a
una piel (0,418 m de 0,438) y de ahí te despegas andando hacia atrás (1,89 m),
con y sin el arreglo.

Con los dos: **0 de 400** y **0 de 1 500** salidas clavadas.

Lo que esto quiere decir del 99: el servidor tenía las dos cosas, porque eran
las mismas piezas. La prueba nueva por órdenes de verdad contra una `Partida`
da **12 de 60** clavadas con los dos arreglos quitados (lo que había en el 99) y
**0 de 60** con ellos. La sonda `reaparecer99` cambia: su rotura R4 apuntaba a
la línea `setEnabled(false)` de `_bichosDentro`, que ahora es
`encender(c.cuerpo, fuera, false)`; el reemplazo se ha movido a esa línea y
sigue siendo la misma rotura.

## 4. Lo que mide cada cosa

**`test/atasco100.test.mjs`**, 16 pruebas, todas entrando por `PasoLocal.step`
o por `Partida.recibir` con un `Player` y un mundo de Rapier de verdad:

- main.js da todos los pasos por `PasoLocal` (leído del fuente: no queda un
  `player.step(` suelto);
- metido en la roca de capas del 99: 300 pasos, **0 llamadas** a
  `computeColliderMovement`, con el control positivo (en lo libre, 30 de 30) y
  el negativo (`player.step` a pelo, ahí, SÍ la llama);
- con el jugador parado el cilindro llega a donde se le manda;
- el cilindro de dentro se apaga mientras corre Rapier y vuelve; el de al lado
  no; sale andando **6,15 m** en 1,5 s contra **0,00 m** por el camino viejo; uno
  delante le para a **0,37 m**;
- ningún paso con el cilindro dentro se queda en nada; 400 salidas por
  `PasoLocal`, 0 clavadas; 60 por el servidor, 0 clavadas;
- `PasoLocal` es el cliente: hundido 13 cm en el suelo, la tabla le saca en el
  primer paso.

**Roturas de Node**, puestas con un gancho de carga (`module.register`) que
cambia el módulo al importarlo y revienta si el reemplazo no casa una vez —el
árbol es compartido y no se toca—:

| rotura | rojos |
| --- | --- |
| `PasoLocal.step` sin `pasoSinAtasco` | 7: la roca, el mundo parado, el bicho, la tabla |
| sin `world.step()` con el jugador parado | 1: «el mundo sigue» |
| `pasoSinAtasco` sin apagar | 3: el bicho de dentro |
| `servidor: true` por omisión en `PasoLocal` | 1: la tabla del cliente |
| `atascarse` nunca para | 2 aquí, y 4 de test/reaparecer99 (la roca y Gate City): el servidor usa la misma |
| `bichosDentro` siempre vacío | 2 de test/reaparecer99: ídem |
| `encender` sin `updateSceneQueries` | «ningún paso se queda en nada» (0,00 cm uno de cada dos) y **60 de 400** clavadas |
| sin el borde (las dos pieles) | **63 de 400** y **21 de 60** en el servidor |
| las dos últimas juntas (el 99) | 60 de 400 y 12 de 60 |

Ojo con una: la rotura de `encender` **deja verde** «sale andando más de un
metro» con el cilindro centrado, porque con el bicho justo en el centro la
mitad de los pasos bastan. Lo que la ve es el barrido al azar.

**La sonda**, 11 controles:

| # | control |
| --- | --- |
| 1 | se entra por el menú en Gate City |
| 2 | el bucle da los pasos por `PasoLocal` (su cuenta sube) |
| 3 | CONTROL POSITIVO DEL SITIO: sin nada se anda más de un metro |
| 4 | con el cilindro de un bicho en los pies, sale andando (> 70 % de lo libre) |
| 5 | la cuenta dice que lo apartó, y al final no tiene nada dentro |
| 6 | doce salidas más, con el cilindro alrededor del jugador a 0,15-0,59 m: todas > 1 m en 0,7 s |
| 7 | CONTROL DEL INSTRUMENTO: el mismo cilindro a 1,2 m por delante le para (< 0,6 m) |
| 8 | y ése no se aparta nunca |
| 9 | en la pared (el nacimiento del 98) `PM_CheckStuck` contesta |
| 10 | y el fotograma no se cuelga (< 500 ms) |
| 11 | ni un error de página |

El 6 se añadió al final, cuando R2 salió **verde** en su segunda pasada (10 de
10, con la rotura puesta y comprobada): con el cilindro centrado la mitad de los
pasos bastan para salir y el último no siempre cae en la banda de la piel, así
que R2 se veía una pasada sí y otra no, y R3 nunca. Es el 50 dentro de una
sonda: un solo caso donde la rotura y el arreglo dan lo mismo.

Las roturas de la sonda van en la página y no en el árbol: con `ROTURA100=R1`
`page.route` sirve un `src/main.js` con `player.step(dtCuerpo` en vez de
`pasoLocal.step(dtCuerpo`; R2 y R3 cambian igual `src/play/atasco.js` (sin
`updateSceneQueries` en `encender`, y sin el borde). Resultados en §6.

## 5. Lo que se entendió mal

- **«Sale andando», el verde del 99, medía la mitad de los pasos.** El
  apartado funcionaba uno sí y uno no (§3a), y el control de la sonda del 99
  y su prueba de Node no podían verlo: con el bicho centrado, la mitad basta.
  Lo enseñaron las salidas AL AZAR, no mirar mejor la centrada.
- **Diagnostiqué el borde antes que el desfase**, con su arreglo (las dos
  pieles) escrito y medido: **38 de 400 antes y 38 de 400 después**, las mismas
  cuatro muestras. Una rotura que no cambia nada (el 78): no era el borde lo que
  mandaba, era el desfase, y el borde sólo apareció **al arreglar el desfase**
  (50 de 400). El arreglo del borde se quitó, se arregló el desfase, y se
  volvió a poner porque entonces sí cambiaba algo (50 → 0).
- **Mi primera traza del navegador leía `window.probe.pasoLocal`**, que no
  existe: `probe` es lo que devuelve `montarSonda`, no el objeto de getters de
  main.js. La página murió con «Target crashed» y un `TypeError` dentro de un
  `requestAnimationFrame`. Ahora todo pasa por `probe.mundo.atasco()`.
- **La sonda contaba 10 controles y declaraba 9**: salió «10 de 9 en verde» y
  código 1. El marcador del 65 hizo su trabajo.
- Dos pasadas en paralelo de `reaparecer99` y `atasco100` dieron un rojo en
  «un paquete de órdenes no puede tener al servidor mucho más que su tope»,
  que el 99 ya avisa que es sensible a la carga; solo, 28 de 28.

## 6. Resultados

**La sonda, con todo puesto**: 10 de 10 en seis pasadas de siete. Lo andado
con el cilindro dentro contra lo andado sin nada: 4,68/4,56, 4,78/4,71,
4,68/4,66, 5,29/5,15, 4,84/5,11 m; contra el de delante, 0,42 m todas; en la
pared, 64-76 pasos parados por segundo y ningún sacado; el peor fotograma
76-283 ms (la máquina compartida con otras tres sesiones). La pasada roja
(9 de 10) era la sonda: «la cuenta dice que lo apartó» leía la cuenta desde la
primera muestra de la traza, y esa muestra puede llegar con la salida ya
hecha —son diez pasos, 0,17 s, y un fotograma de la sonda llegó a tardar
200 ms—. Ahora se lee antes de ponerle.

| rotura de la sonda | resultado |
| --- | --- |
| ninguna (con las doce salidas) | **11 de 11** dos pasadas; las doce salidas, 3,27-3,54 m |
| R1 el bucle vuelve a `player.step` (medido con 10 controles, antes de las doce) | **6 de 10**: la cuenta no sube (0 pasos), con el bicho dentro **0,01 m** de 4,41-5,15, nada apartado y 1 dentro al final, y en la pared 0 parados |
| R2 `encender` sin `updateSceneQueries`, SIN las doce salidas | una pasada **8 de 10** (sale **0,77 m** de 5,27, clavado en el borde, y el de delante «apartado» 4 veces) y otra **10 de 10**: verde con la rotura puesta |
| R2, con las doce salidas | **10 de 11**: tres de doce clavadas (0,92, 0,75 y 0,87 m) |
| R3 sin el borde de las dos pieles, SIN las doce salidas | **10 de 10**: no la veía |
| R3, con las doce salidas | **10 de 11**: dos de doce clavadas (0,83 y 0,45 m) |

**`npm test`**: 3 073 pruebas, 3 071 en verde, 0 rojas (1 saltada, 1 pendiente).

**Las vecinas**, una a la vez (`npm run sondas -- -j 1`), en una máquina con
otras tres sesiones trabajando:

| sonda | resultado |
| --- | --- |
| salto99 | verde |
| aturdir98 | 18 de 18 |
| red95 | 11 de 12: rojo «la F de Beto, sin nadie delante, abre SU menú» (`hablaCon 2; menú interact [Cancel]`). No toca nada de esto —es el menú del NPC— y el 99 ya la dejó en 11 de 12 con OTRO control. No se ha medido sin este experimento |
| reaparecer99 | una pasada AGOTADA a los 900 s con «el servidor no contestó a 'lista'» y «Start no recargó» al entrar (el cuelgue sin cazar del 99, §8); otra **7 de 9**: 5a —el navegador de A en el nacimiento y el servidor en la reaparición— con **un tirón del servidor de 2 628 ms** y B sin entrar («no contestó a 'lista'»); una copia con la página SIN `PasoLocal` (A/B por `page.route`, mismo servidor) **9 de 9**, con el peor tirón en 57 ms; y otra vez con todo puesto, **9 de 9**, peor tirón 26 ms y 5a con el navegador y el servidor en el mismo milímetro (−38,72, −20,14, 27,00). Ver abajo |

La roja de reaparecer99 es la pasada que tuvo el tirón de 2,6 s que el 99 dejó
sin cazar (su §8): con el servidor parado no llega la foto que corrige al
navegador en los 600 ms que espera 5a. Con todo puesto y sin tirón sale 9 de 9,
así que no se le achaca a `PasoLocal`; el tirón sigue sin cazar.

## 7. Pendiente

- **Que un bicho no entre en el jugador**, que es lo del motor (`SV_movestep`
  con `MOVE_NORMAL`, ReHLDS sv_move.cpp:232 y :268-273). Sigue sin portar:
  aquí sólo se deja de contar cuando ya ha entrado.
- **`src/red/cliente.js`** —el cliente sin navegador de las pruebas y los
  bots— sigue llamando a `this.cuerpo.step` a pelo. No es el del jugador, pero
  si se usara para medir la predicción daría otra cosa que el navegador.
- **«Cinemático» incluye puertas y correderas**: una puerta metida en el
  jugador tampoco le retiene en ese paso. En el motor la puerta le empujaría o
  se pararía (`Blocked`); no está medido que pase en algún mapa.
- El atasco contra la pared en el navegador (el nacimiento del 98) se queda
  parado para siempre, como en el motor. La tabla del cliente no le saca
  (0 sacados): la cápsula corta la pared más de lo que llega un empujón.
