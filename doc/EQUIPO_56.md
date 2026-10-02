# Experimento 56 — el equipo en las manos, y tres catálogos que no eran del golpe

Continúa el 55. El objetivo era el anunciado: agrupar lo que el jugador lleva
puesto para que el bloque del golpe cuerpo a cuerpo tenga por dónde cortarse.
Lo que salió por el camino es que **una parte de ese bloque no era del golpe**.

## 1. La medida, otra vez y bien

El 55 dejó escrito «19 declarados, 13 saliendo». Esa cuenta miraba un tramo
más corto y no distinguía quién lee qué. Contado con las fronteras explícitas
—el golpe de la 2394 a la 2970, el objeto de la sonda desde la 3898— y
separando los usos en tres cubos:

| | |
| --- | --- |
| declarados dentro del golpe | **32** |
| nombres que salen | **28** |
| de ésos, usados **ANTES** de la 2394 | 14 |
| usados en el juego **DESPUÉS** de la 2970 | 19 |
| usados **sólo** por la sonda | 27 |

El tercer cubo importa tanto como los otros dos: veintisiete nombres salen
únicamente para que `window.probe` los enseñe. Eso no es acoplamiento del
juego, es superficie de medida, y se le pasa al módulo en un paquete de
captadores sin que cueste nada. Meterlos en el mismo saco que `brazo` hacía
parecer imposible un corte que no lo es.

El primer cubo es el que cambió la tarea. Estos son los nombres declarados
dentro del golpe que se usan **por encima** de donde se declaran:

| nombre | `let` en | usos antes |
| --- | --- | --- |
| `partida` | 2911 | **19**, desde la 378 |
| `catalogoDeArmas` | 2400 | 6, desde la 1842 |
| `catalogoDeFlechas` | 2403 | 3, desde la 1843 |
| `empunar` | 2493 | 3, desde la 1282 |
| `brazal` | 2426 | 3, desde la 2197 |
| `pegar` | 2717 | 3, desde la 142 |

Un nombre que se usa quinientas líneas antes de declararse **no vive donde
parece que vive**. Funciona porque los usos están dentro de funciones que no
corren hasta después, no porque ése sea su sitio. Y mientras esté ahí, sacar el
golpe a su módulo se lleva puestas las tablas de objetos.

## 2. Lo que se hizo

**Los tres catálogos salen del golpe.** `catalogoDeArmas`, `catalogoDeFlechas`
y `catalogoDeEscudos` pasan a `const catalogos = { armas, flechas, escudos }`,
declarado y **cargado** antes del bloque. No son del golpe: son las tablas de
objetos, las lee el inventario, las lee el escudo y las lee el tiro. Se
rellenan de dos ficheros y no se vuelven a escribir nunca — son datos leídos
una vez, no estado.

Mover los dos `await` hacia arriba es seguro porque entre la 2360 y la 2394
—las cuentas del 55— no hay ninguno: el orden relativo de las esperas no
cambia.

**Los cuatro de las manos se agrupan.** `brazo`, `armaEnMano`, `brazal` y
`escudoEnMano` pasan a `const equipo`. Son una sola cosa —la máquina de estados
y el modelo del arma, y los dos mismos del escudo—, se escriben desde exactamente
dos sitios (`empunar` y `embrazar`) y se leen desde cuarenta y tres.

**Los dos cachés NO entran.** `modelosDeArma` y `modelosDeEscudo` se quedan
sueltos a propósito: son almacenes de mallas por carpeta, no algo que el
jugador lleve encima. Que estén al lado no los hace lo mismo.

### El efecto

| | declarados | salen al código de verdad |
| --- | --- | --- |
| antes | 32 | 25 |
| **después** | **26** | **19** |

Y los cuatro nombres de las manos son ahora **uno**.

## 3. La trampa de esta vuelta: los getters

El renombrado se hizo con una expresión regular que respetaba las claves de
objeto —`armaEnMano: brazo?.arma` en la 1885, y los tres captadores que el 55
le pasa a `montarArco`— con un `(?!\s*:)` detrás.

No bastó. Un **getter** no lleva dos puntos:

```js
get brazo() { return brazo; },        // antes
get equipo.brazo() { ... }            // lo que produjo el reemplazo
```

Siete getters del objeto de la sonda quedaron con un punto en el nombre. Lo
cazó `esbuild` en la primera comprobación de sintaxis, no una prueba: es un
error de gramática, y para ésos el compilador es más rápido que cualquier
sonda. Lo que **sí** había que decidir a mano es que esos getters recuperaran su
nombre original —`get catalogoDeArmas()`, no `get armas()`—, porque son la
superficie pública que las sondas llaman por su nombre. Renombrarlos habría
sido cambiar la API de medida en medio de un refactor.

Es el mismo animal que la taquigrafía de objeto del 55: **un reemplazo de
texto sobre JavaScript no sabe distinguir un nombre de una clave.** Hay tres
formas de escribir una clave y sólo dos tenían defensa.

## 4. La rotura a propósito (§4)

Un renombrado que compila es difícil de romper: si un sitio se quedara con el
nombre viejo, sería un `ReferenceError` y lo caza `esbuild`. Así que la rotura
apunta a lo que el compilador **no** ve: que el dato llegue.

**Rotura A — el catálogo de escudos se queda vacío** (`if (false && m)`):

```
TypeError: Cannot read properties of null (reading 'bloqueoArriba')
    at sondas/escudo.mjs:68
```

Discrimina, pero **revienta en vez de ponerse roja**, y eso es peor señal de lo
que parece: una sonda que se cae no dice cuántos controles habrían fallado, y
la próxima vez que se caiga por otro motivo nadie sabrá si es el mismo. Queda
anotado como pendiente, no arreglado aquí.

**Rotura B — el arma nunca llega a la mano** (`equipo.armaEnMano = null`):

| sonda | con el fallo puesto |
| --- | --- |
| `sonda:golpe` | 23 / 26 — **tres rojos** |
| `sonda:arco` | 36 / 40 — **cuatro rojos** |
| `sonda:escudo` | 33 / 35 — **dos rojos** |

Nueve rojos en tres sondas. El equipo en las manos **sí** está medido, y a
diferencia de la fatiga del 55 no hizo falta escribir ni un control nuevo. No
todo lo que no tiene dueño está sin medir; conviene comprobarlo en vez de
suponerlo en ninguna de las dos direcciones.

## 5. Lo que queda, con nombre

`partida` es ahora la peor: declarada en la 2929, dentro del golpe, y usada
diecinueve veces desde la 378. No es del golpe ni de lejos — es la partida. Y
`muneco`, `ponerMuneco` y `laVista` son la pasada de la vista, que tampoco lo
es. Las dos son mudanzas, no refactores: el bloque del golpe adelgaza sin que
se toque una línea de su lógica.

Sólo cuando esos dos salgan tiene sentido intentar el golpe en sí.

## Estado

| | |
| --- | --- |
| `npm test` | **1401 / 1401** |
| `vite build` | limpio |
| `sonda:golpe` | 26 / 26 |
| `sonda:escudo` | 35 / 35 |
| `sonda:arco` | 40 / 40 |
| `sonda:hud` | 38 / 38 |
| `sonda:mundo` | 40 / 40 |
| `sonda:consecuencias` | 46 / 46 |
| `sonda:arranque36` | 30 / 30 |
| `sonda:ranuras` | 40 / 40 |

`src/main.js`: 4 177 → 4 196 líneas. **Sube**, y es correcto: el cambio no saca
código a un módulo, mueve declaraciones y escribe por qué. Contar líneas de
`main.js` como si fuera la métrica de este trabajo sería otro verde que no mide
nada — lo que bajó son los nombres que cruzan la frontera, de 25 a 19.

Ningún control nuevo. **El analizador de acoplamiento sigue con el fallo del
cero falso del 55 y no se ha usado**: todos los números de este documento están
contados con un recuento de líneas explícito sobre el fichero, con las
fronteras escritas arriba.

---

# Segunda parte del 56 — la vista sale, y `partida` no existía

## 6. CORRECCIÓN, en el mismo día: el contador medía texto

Este documento decía arriba que `partida` era la peor de las que quedaban:
declarada en la 2929, dentro del golpe, y usada **diecinueve veces desde la
378**. Es falso, y el error es mío y de la misma familia que todo el apartado 4
de CLAUDE.md.

`partida` se usa **tres** veces: dos dentro del bloque (2918 y 2923, once
líneas por encima de su declaración, que es una función flecha y por eso
funciona) y una en el objeto de la sonda. **No sale del golpe.**

Las diecinueve eran la palabra «partida» en los **comentarios en español** de
este repositorio —«en una partida con servidor», «un helecho no es una
partida», «el mapa de esta partida»— y `red.partida`, que es una propiedad de
otro objeto. El contador era un `grep -n '\bpartida\b'`, y `grep` no sabe
JavaScript: no distingue un identificador de una palabra, ni una referencia de
una clave, ni código de comentario.

Y el fallo no era inocente en este repositorio en concreto: **la regla de la
casa es que los comentarios van en español**, así que los nombres en español
—`partida`, `muneco`, `equipo`— son exactamente los que más aparecen en prosa.
Un contador de texto sobre este código está sesgado justo contra los nombres
que más falta hace medir.

Es el mismo animal que el «0» del analizador viejo del 55, y por el mismo
motivo de fondo: **los dos eran instrumentos de usar y tirar, escritos en la
línea de órdenes y borrados al acabar.** Nadie podía revisarlos porque no
existían al día siguiente.

### El instrumento, ahora escrito

`tools/nombres.mjs`. Parsea `src/main.js` con `rollup/parseAst` y cuenta
**referencias a identificadores**, no apariciones del texto: descarta los
comentarios por construcción, descarta `objeto.prop` cuando `prop` no es
computada, y descarta las claves de objeto salvo la taquigrafía `{ a }`, que sí
es una referencia. Deriva las fronteras del propio fichero buscando las
cabeceras de sección, para que no envejezcan.

**Su control**, porque un instrumento sin control tampoco es un resultado:

| se inserta antes del bloque | lo que dice el contador |
| --- | --- |
| `// aterrizajes aterrizajes aterrizajes` (comentario) | `antes 0` |
| `console.log(aterrizajes);` (referencia) | `antes 1` |

Discrimina en las dos direcciones. El `grep` viejo habría dicho 3 en el primer
caso.

## 7. Lo que sí había que mover: la pasada de la vista

`laVista`, `muneco`, `manifiestoDeCuerpos`, `munecos` y `ponerMuneco` estaban
dentro del bloque del golpe. `laVista` es la escena de primera persona: la usan
`empunar` y `embrazar` para colgar sus modelos —de ahí que acabara ahí—, pero
también la dibuja el bucle de fotogramas en la 3753, y el muñeco de
`ms_lildude` que vive en ella no tiene nada que ver con pegar.

Se movió **entero y sin tocar una línea de su lógica**: 38 líneas, de dentro
del golpe a justo antes. Es una mudanza, no un refactor.

**Rotura a propósito:** que `ponerMuneco` devuelva `null` siempre.

| sonda | con el fallo puesto |
| --- | --- |
| `sonda:golpe` | 21 / 26 — **cinco rojos** |
| `sonda:hud` | 38 / 38 |
| `sonda:mundo` | 40 / 40 |

El muñeco está medido, y lo mide una sola sonda: `sondas/golpe.mjs` es la única
de las diez que lo nombra. Que esté cubierto desde el sitio equivocado no es un
problema hoy, pero se anota: el día que el golpe salga a su módulo, esos cinco
controles se quedan midiendo algo que ya no vive ahí.

## 8. El efecto de las dos partes juntas

| | declarados dentro del golpe | salen al código | salen sólo a la sonda |
| --- | --- | --- | --- |
| antes del 56 | 32 | 25 | — |
| tras la primera parte | 26 | 18 | 4 |
| **tras la segunda** | **21** | **15** | **4** |

Y de los quince que quedan, **uno es `equipo`** —que es el estado del módulo y
se va con él— y los otros catorce son funciones que *son* la interfaz del
golpe: `empunar`, `embrazar`, `pegar`, `potenciaDe`, `destrezaDe`,
`candidatosDeGolpe`, `trazaLibre`, `pasoDelEscudo`, `cubriendose`,
`parryDelPersonaje`, `repartirExperiencia`, `celebrarSubida`, `aterrizajes` y
`JUGADOR`.

Eso ya no es acoplamiento: **es una costura.** Catorce nombres que salen
porque tienen que salir son la firma de un módulo, no una fuga. El golpe se
puede extraer.

## Estado

| | |
| --- | --- |
| `npm test` | **1401 / 1401** |
| `vite build` | limpio |
| `sonda:golpe` | 26 / 26 |
| `sonda:escudo` | 35 / 35 |
| `sonda:arco` | 40 / 40 |
| `sonda:hud` | 38 / 38 |
| `sonda:mundo` | 40 / 40 |
| `sonda:consecuencias` | 46 / 46 |
| `sonda:arranque36` | 30 / 30 |
| `sonda:ranuras` | 40 / 40 |

`src/main.js`: 4 195 → 4 206 líneas, que siguen subiendo por los comentarios y
siguen sin ser la métrica.

**Lo que este documento NO afirma:** que las quince que quedan sean las quince
correctas para siempre. El contador nuevo es escéptico de identificadores, pero
**no conoce los ámbitos**: si un nombre se volviera a declarar dentro de una
función, contaría las dos cosas como una. Hoy no pasa en este fichero —se
comprobó a mano para `equipo` y `muneco`—, y el día que pase habrá que
enseñárselo.
