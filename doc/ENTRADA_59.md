# Experimento 59 — que todas las sondas entren por donde entra el jugador

> **Sobre el número:** esto empezó llamándose 57. Otra sesión, trabajando en el
> mismo árbol a la vez, ya había usado el 57 y el 58 para la torre y el valle
> del menú (`doc/TORRE_57.md`, `doc/TORRE_58.md`). Se renumeró a 59 al
> descubrirlo, en vez de pisarle el número. El árbol compartido también
> comparte la numeración.

> `sondas/entrar.mjs` · `test/sondas_entrada.test.mjs` · `src/play/actividad.js`
> · `src/play/manada.js` · `src/dev/sonda.js` · `src/render/bsp_escena.js`

El encargo era terminar de estandarizar antes de ir a por un tercer mapa. Lo
que quedaba resultaron ser dos cosas de tamaño muy distinto: cerrar `src/`
—media hora— y cumplir de una vez la regla de la puerta, que llevaba desde el
36 escrita y sin cumplirse. Por el camino salió **un fallo del juego que
llevaba abierto desde el 21**.

## 1. Lo pequeño primero: `src/` deja de nombrar a Gate City

| carpeta | menciones fuera de comentario, antes | después |
| --- | --- | --- |
| `src/` | 7 en 3 archivos | **3, todas en `src/play/mapa.js`** |

Las cuatro que se fueron:

- **`src/render/bsp_escena.js` bautizaba las tres mallas de la escena**
  `"gatecity"`, `"gatecity-translucido"` y `"gatecity-detalle"`. Con Edana
  cargado, la malla de Edana se llamaba «gatecity». El nombre pasa a ser el
  PAPEL —`mundo`, `mundo-translucido`, `mundo-detalle`—, porque quien la busca
  quiere la malla del mundo y no la de un mapa. Y `escenaGateCity` pasa a
  `escenaDelMapa`, como el `gatecityLevel` que renombró el 47.
- **El nombre bonito**, `MAPA === "gatecity" ? "Gate City" : MAPA`, duplicado
  en `src/main.js:417` y `tools/servidor.mjs:47`. Se cayó entero: Master Sword
  trae **93 mapas** en `assets/msr/maps/` y **ninguna tabla de títulos** —los
  únicos `.txt` al lado de los `.bsp` son los `*_detail.txt` de las texturas de
  detalle—, así que el nombre bonito era nuestro y sólo para uno. Los otros 92
  ya enseñaban el del archivo, que es lo que enseña la consola del juego y lo
  que el comentario de esa misma línea ya decía.

**Y el guardia se extiende a todo `src/`.** Hasta hoy `test/juego_mapa47.test.mjs`
sólo miraba `src/play/` y `src/bsp/`, y por eso `src/render/` pudo esconder
tres nombres durante diez experimentos. Ahora mira los 40 y pico archivos con
una sola excepción, `mapa.js`, y lleva **dos** controles nuevos: uno que exige
que haya archivos bajo el guardia y que la excepción sea exactamente una, y
otro que prohíbe nombrar **el otro** mapa portado. Roto a propósito:

| se pone en `src/render/` | qué se pone rojo |
| --- | --- |
| `mundo.name = "gatecity"` | «el nombre del mapa tampoco, en NINGÚN archivo de `src/`» |
| `mundo.name = "edana"` | «y ninguno nombra a OTRO mapa portado tampoco» |

Dos roturas, dos pruebas distintas. Ése es el «segundo caso» que enseñó el 50,
puesto a trabajar.

## 2. Lo grande: 27 de 33 sondas se saltaban el menú

CLAUDE.md lo dice desde el 36: «si su camino no pasa por `menuselect`, no
cuenta». Medido:

| | |
| --- | --- |
| sondas registradas en `package.json` | 33 |
| que entraban con `?map=gatecity` | **27** |
| que escribían por qué | **2** |

Y no es purismo, porque los dos caminos **no montan lo mismo**: por `?map=` se
carga el nivel y se arranca la sesión de una pasada; por el menú se carga como
fondo —escena sí, partida no, lo que decidió el 53— y «Start» monta los 69 NPC
y arranca la sesión después, en ese orden. Una sonda que sólo conoce el primero
no puede notar cuando el segundo se rompe. Ya escondió un fallo entero: la fila
«Map» se apuntaba y no se aplicaba (el 50), y ninguna de las 27 podía verlo
porque ninguna pasaba por la fila.

### El camino, en un sitio

`sondas/entrar.mjs`, con `entrarPorElMenu(pag, PORT, {...})`: menú principal →
«Establish a Kingdom» → la fila «Map» **elegida con el ratón** → «Start» →
esperar a que el menú se cierre y salga `newchar`. Se espera al efecto y nunca
a un reloj.

Que esté en UN sitio es la mitad del arreglo: el camino del jugador cambió en
el 36, en el 50 y en el 53, y cada vez veintitantas sondas se quedaron midiendo
un juego que ya no existía sin que ninguna se pusiera roja.

Lleva dos cosas que hicieron falta al convertir:

- **`antesDeTocarNada`**, un gancho que corre con la página cargada y antes del
  primer clic. Lo pidió `sonda:sonido` (apartado 4).
- **`extra`**, para los parámetros que el menú todavía no sabe poner —el
  `red=ws://…` de las dos sondas de multijugador, que es a lo que «Visit a
  Kingdom» llegará algún día—.

### El resultado

| | antes | después |
| --- | --- | --- |
| entran con `?map=` | 27 | **7** |
| de ésas, con el motivo escrito | 2 | **7** |

Y las siete tienen motivo porque **convertirlas les quitaría la pregunta**:

| sonda | por qué se queda |
| --- | --- |
| `arranque36` | mide la entrada; su `?map=` es el control positivo que demuestra que sin él hay menú |
| `pantalla38` | sus apartados 1–3 miden el estado ANTES de entrar, y el 9 **compara los dos caminos** a propósito |
| `edana48` | prueba que `?map=nohay` y `?map=../../etc` se rechazan |
| `recursos` | no mide el juego: mide el servidor, y no hay jugador |
| `red`, `ia28` | entran por el menú, pero con `red=` en la URL |
| `disparadores49` | convertida (su motivo viejo se corrigió al lado) |

`pantalla38` se llegó a convertir y dio **33 de 35, con siete controles
midiendo otra cosa**. Se revirtió. Un camino uniforme no vale nada si borra la
pregunta.

**Y la regla ahora es una prueba**, `test/sondas_entrada.test.mjs`: cada sonda
registrada o usa `entrarPorElMenu`, o lleva escrito «NO ENTRA POR EL MENÚ» y el
motivo. Con su positivo (que haya sondas que mirar) y con una exigencia de
mayoría, para que no se pueda volver al punto de partida dejando una sola.

## 3. EL FALLO: el sorteo de la pose de reposo no existía

Convertir `sonda:mundo` puso rojos dos controles **con el juego correcto**:
«el aldeano no está en 'walk'» y «la pose de reposo se vuelve a sortear». Los
dos estaban verdes porque con `?map=` el mundo que medían **acababa de nacer**:
los 69 quietos y en su pose inicial. Tirando de ese hilo salieron cuatro cosas,
y la tercera es un fallo del juego.

**(a) `probe.vivo.poses()` agrupaba por ESPECIE.** Así que «dos enanos, cada
uno en su pose» y «un enano que cambió de pose» daban exactamente la misma
lista de dos. Con 69 bichos y tres poses posibles, verde asegurado aunque nadie
cambiara nunca. Ahora la clave es la instancia.

**(b) Y `poses()` no llamaba a `relojes()`.** El bucle sólo avanzaba
`animar(DT)`, que mueve los mezcladores; el dado se echa en `manada.relojes()`.
**El mecanismo bajo prueba no llegaba a dispararse.** El apartado 4 de
CLAUDE.md entero en una función de quince líneas.

**(c) Arreglados los dos, el control siguió rojo: 0 de 69 cambiaban.** Y ahí
estaba el fallo de verdad. Los cuatro aldeanos, mirados a mano cada segundo y
medio:

```
t3: 32:anim_xbow_aim_idle  33:anim_xbow_aim_idle  34:anim_xbow_aim_idle  36:anim_xbow_aim_idle
```

Los cuatro en la misma pose, siempre, y siempre la última que declara
`dwarf/male1.mdl` — y la menos pesada de las tres, 3 de 23.

La causa: **`buscarActividad` era la única función del proyecto cuyo `azar` no
era el de la casa.** Declaraba `azar = (n) => Math.floor(Math.random() * n)`;
todas las demás —`acierta`, `danoDe`, `danoDelGolpe`, la propia `Manada`— usan
`azar = Math.random`. Y `Manada` le pasaba el suyo, así que `azar(total) < peso`
era `Math.random() < peso`, y como cualquier peso declarado vale 1 o más, eso
**es siempre cierto**: ganaba siempre la última candidata.

Sin dar ningún error. Y con la prueba de reparto de `test/juego_mundo.test.mjs`
en verde, porque **se pasaba su propio dado del tipo correcto**: medía que la
función sabe sortear, no que alguien la llame como es debido.

Arreglado —el decimal se convierte a entero dentro, que es lo que hace
`RANDOM_LONG(0, weighttotal-1)`—, los aldeanos salen en `anim_xbow_aim_idle`,
`nod` e `idle`, y **31 de los 69 cambian de pose en 25 segundos**. El pueblo
asiente con la cabeza por primera vez desde el 21.

La prueba nueva usa el dado por omisión y pone **la pesada delante**: si el
sorteo no existe, la ligera de detrás gana el 100 % de las veces. Con la pesada
detrás, «gana siempre la última» y «sortea bien» dan las dos mucha pesada, y el
control no distingue.

**(d) Y una consecuencia:** la cuenta del temblor
(`pasea && movido < 0.05 && reinicios > 4`) empezó a marcar uno. No era un
temblón: con el sorteo funcionando, un bicho quieto acumula rebobinados
legítimos. El temblor es cambiar de **actividad** sin moverse, así que ahora se
cuenta eso (`cambiosDeActividad`), con su positivo al lado —47 bichos cambian
de actividad—, porque un contador nuevo que no se incrementara nunca daría «0
temblando» igual de verde.

## 4. Las otras cuatro cosas que salieron al convertir

**`congelarPaseo` fabrica un estado que el juego no tiene.** Fue lo primero
que probé para medir bichos parados: deja a **46 de los 69 clavados con la
animación de andar puesta**, porque el reinicio de la animación va en el paso
del vagabundo y congelarlo lo apaga. Un ayudante de sonda que fabrica un estado
imposible mide otro juego. No se usa para eso.

**`sonda:sonido` afirmaba que el `AudioContext` no está despierto al cargar**,
y entrando por el menú se puso rojo: **las pulsaciones del menú son un gesto
del usuario** y despiertan el contexto, que es exactamente lo que le pasa al
jugador. La afirmación es correcta, el sitio no. Se mide en el gancho
`antesDeTocarNada`, y se le añade el positivo que faltaba: que el menú **sí** lo
despierta. Sin él, «no estaba despierto» sería verde también con un contexto
que no despierta nunca.

**`personaje30` recargaba con `pag.reload()`** después de borrar personajes. La
URL era `?map=gatecity`, así que recargar volvía al juego; con la URL en `/`
recargar deja la sonda en el menú, y sus ocho controles medían otra pantalla
(1 de 8). Ahora vuelve a entrar por el menú.

**Los doce aldeanos de Gate City declaran los doce `roam 1`.** No hay ninguno
«parado» por configuración, así que el control del aldeano no podía filtrar por
eso: espera a pillar uno con ACT_IDLE puesta, que llega solo.

## 5. El control inestable de `sonda:arco`, que venía del 55

`caida < -15` fallaba tres de cada cinco veces (−3, −4, −12, −15). El motivo:
la caída se medía **desde el ojo**, y la flecha no sale del ojo — se lleva
puesto el desnivel de la mano. Y encima el cono del arco desvía hasta 10°, que
a 167 unidades de vuelo son 29 unidades, tres veces la caída entera.

Quitados los dos —`caidaDesdeLaMano` en la sonda, y el cono restado con el
ángulo que ella misma mide— **siguen faltando 7 unidades**. Y el dato bueno es
que es **constante**: −7,7, −6,6 y −7,3 en tres tiros con conos de 3,0°, 1,6° y
0,6° y vuelos distintos. Un desajuste que no se mueve ni con el ángulo ni con
el tiempo no es ruido ni es la gravedad.

Antes que ensanchar la holgura hasta que pase —que es volver a un número atado
a nada— **se declara pendiente**: el desglose va impreso en cada pasada y el
control afirma sólo lo comprobado, que la flecha cae. CLAUDE.md lo dice: si hoy
no se puede, se declara pendiente en vez de contarse entre los verdes.

## 6. Lo que estaba roto de antes, y no es de esto

Se midió con las dos entradas para poder atribuirlo:

| sonda | con `?map=` | por el menú | veredicto |
| --- | --- | --- | --- |
| `pulido` | 37/41 | 37/41 | **anterior**, cuatro rojos de sonidos de impacto |
| `cuerpo` | se cae | se cae | **anterior**, el rojo conocido |
| `mapa` | 33/34 | 33/34 | **anterior**, el rojo conocido del 37 |
| `sonido` | 25/25 | 24/25 | de la conversión — arreglado, ahora 26/26 |
| `personaje30` | 18/18 | 1/8 | de la conversión — arreglado, ahora 18/18 |

## Estado

| | |
| --- | --- |
| `npm test` | **1399 / 1399** |
| `vite build` | limpio |
| `sonda:mundo` | **44 / 44** (cuatro controles nuevos) |
| `sonda:sonido` | **26 / 26** (uno nuevo) |
| `sonda:arco` | 40 / 40 |
| `sonda:hud` · `golpe` · `escudo` | 38/38 · 26/26 · 35/35 |
| `sonda:consecuencias` · `ranuras` | 46/46 · 40/40 |
| `sonda:pantalla38` · `vgui29` · `vgui2_34` | 35/35 · 36/36 · 26/26 |
| `sonda:personaje30` · `inventario31` · `hoja32` | 18/18 · 20/20 · 15/15 |
| `sonda:misiones33` · `ajustes37` · `muerte41` | 23/23 · 14/14 · 34/34 |
| `sonda:ia` · `ia28` · `red` · `disparadores49` | 15/15 · 15 sí · todas sí · 13/13 |

La cuenta de `npm test` bailó durante la sesión (1404 → 1395 → 1399) **porque
el árbol está compartido**: otra sesión estaba tocando `test/juego_torre.test.mjs`,
`src/render/valle.js` y `src/render/torre.js` mientras esto corría. Se comprobó
que ninguno de sus archivos y ninguno de los míos se pisaron —`src/dev/sonda.js`
es el que las dos tocan— y que mis cinco añadidos siguen en su sitio. La cifra
que vale es la de fallos: **0**.

## Lo que queda

- Los cuatro rojos de `sonda:pulido` y el `sonda:cuerpo` caído, los dos de
  antes de esto.
- Las 7 unidades constantes que faltan en la caída de la flecha.
- `probe.golpe.atacar()` sigue sin pasar por `pasoDelBrazo` (del 55).
- Y lo que el 56 dejó anunciado: **extraer el golpe**, que ya tiene costura.
