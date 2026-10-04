# El 98 (agente N): que las sondas tarden menos, sin dejar de medir

El 98 encontró por qué las sondas iban cada vez más lentas (54 `vite`
huérfanos; ver el bloque «EL 98» de `NEXT_SESSION.md`) y arregló dos cosas:
`liberarPuerto` mata su puerto también al salir, y `entrarPorElMenu` ya no se
come 8 s de `waitForURL`. Este documento es lo que quedaba: el sueño fijo tras
arrancar `vite`, los puertos repetidos y un lanzador en paralelo.

## 1. Lo que se hizo

**`arrancarVite(puerto)`** en `sondas/mismo.mjs`: libera el puerto, lanza
`npx vite --port P --strictPort` y **pregunta por HTTP cada 100 ms** hasta que
contesta. Si el proceso muere antes, o pasa el tope (60 s), revienta con el
motivo. Devuelve el proceso, así que los `matar(dev)` de las sondas siguen igual.
Partido en dos para las sondas con servidor de partida, que no quieren esperar
a `vite` antes de lanzar el servidor: **`lanzarVite`** (sin esperar) y
**`esperarHttp(url, { proceso })`**, que sirve también para
`tools/servidor.mjs` porque no abre el puerto hasta haber cargado el mapa
(servidor.mjs:241).

**Las sondas, pasadas**: 68 de forma mecánica (el `spawn` + `setTimeout(r, 6000
o 7000)` justo detrás, sin nada en medio salvo `matar`), y 21 a mano: estado
y paseo (§3), las que
tenían su propio bucle de espera a 1 s (aturdir97, override97, armas97,
inventario97), las de servidor con 8-10 s de sueño y otros 5-6 s tras lanzar el
servidor (chat61, ia28, red, tienda62, red95, costurared92, defensared97,
brillo95, efectosred93, pantalla95, personaje96), las que reintentaban el
`goto` (edana82, reverberacion82, transicion89) y armas96 (su `matarDev` no
casaba con el patrón). Cada reemplazo se hizo con un guion que exige que el
texto viejo case **exactamente una vez** y no escribe el archivo si no; y
después, por archivo: una sola llamada a `arrancarVite`/`lanzarVite`, ningún
`["vite"` y ningún sueño de 6-7 s, y `node --check`. Al final no queda ninguna
sonda con el patrón viejo salvo dos `_tmp_*` de otras sesiones.

**`test/puertos98.test.mjs`**: lee todas las sondas y falla si dos declaran el
mismo puerto (web o de partida), o la misma carpeta `build/partidas/<x>`. Con
sus dos controles positivos (lee una sonda conocida, `golpe` → 5201; ve un
repetido puesto a mano), y roto a propósito con una sonda de mentira en el 5201
y `build/partidas/sonda96`: los dos rojos, con los nombres.

**Puertos movidos**: había **14 puertos repetidos** — el 5219 en cuatro sondas
(aviso60, inventario31, miradores52, vgui2_34), el 5201 en tres (golpe,
pantalla38, estado), el 5216 en tres… Se movieron 19 sondas al 56xx, cada una
con un comentario de dónde venía.

**`npm run sondas -- [-j N] [--tope S] <sondas…>`** (`tools/sondas.mjs`):
concurrencia 3 por omisión, la salida de cada una en `build/sondas/<nombre>.log`
y al final una tabla nombre / tiempo / «X de Y» / veredicto, con **las líneas
de los controles rojos** debajo (`MAL `, `NO  `, `FALLA`, `[ROJA]`, y
«errores de página» cuando no es «ninguno»), y la cola del log si la sonda se
cayó sin resumen. Verde es: código 0, **y** un resumen «X de Y», **y** X = Y.
Sale con 1 si alguna no lo es (el 65: una sonda caída no es una nota).

**`sondas/vite.sondas.mjs`**: el `vite` de las sondas arranca **sin recarga en
caliente ni vigilancia de archivos**, y con su propia caché de dependencias
(`node_modules/.vite-sondas`). Ver §3.

## 2. Lo que se midió

**Lo que tarda `vite` en contestar**, en frío y con la máquina tranquila:
**2,4 s**. Lo que dormían las sondas: 6 o 7 s, 8 las de servidor (más 5-6 tras
lanzar el servidor), 9-10 las que lo esperaban todo de una vez. Medido con
`build/sondas/primercarga.mjs` (arrancar, cargar la página, esperar a
`window.probe`):

| espera tras contestar | `vite` contesta | `goto` (load) | hasta `probe` | total |
| --- | --- | --- | --- | --- |
| 0 | 2 484 ms | 1 215 ms | 1 747 ms | **4 374 ms** |
| 6 000 ms | 2 473 ms | 489 ms | 998 ms | 9 581 ms |
| 0 | 2 420 ms | 1 246 ms | 1 811 ms | **4 365 ms** |
| 6 000 ms | 3 887 ms | 1 050 ms | 2 146 ms | 12 284 ms |

O sea **5 s por sonda**, y el sueño no era del todo inútil: `vite` aprovecha
esos segundos para calentar, y la primera carga tarda ~0,7 s más sin ellos.
Sumando los sueños de las diez sondas de la lista: 72 s de sueño, unos 45 s
ahorrados en serie.

**La lista de diez** (golpe, consecuencias, arranque36, muerte41, arco,
mordisco92, guardias94, veneno91, personaje96, armadura96):

| | reloj | sumando | verdes | carga de la máquina |
| --- | --- | --- | --- | --- |
| antes, en serie | **365,2 s** | 365,2 s | 9 de 10 (personaje96, §4) | baja |
| después, en serie | 544,4 s | 544,4 s | 8 de 10 | **88-96 % de CPU** |
| después, de 3 en 3 | **391,4 s** | 941,8 s | 8 de 10 | 77-100 % |

**La fila de «después, en serie» no se puede comparar con la de «antes»**: entre
las dos, otras cinco sesiones empezaron a correr sondas, `npm run armas` y
pruebas, y la máquina pasó de tranquila a saturada (golpe 22,7 → 63,5 s con el
sueño QUITADO). Lo que sí se puede comparar es lo que corrió con la misma carga:
en serie 544 s, de tres en tres **391 s (−28 %)**. Y el ahorro del sueño, que
no depende de la carga, se midió aparte (arriba). Sin una máquina para mí sola
no hay mejor número que éste, y no se escribe otro.

## 3. Lo que se entendió mal, y lo que apareció

- **«El paralelo hace flakear»**, y no del todo. Con la máquina saturada se
  cayeron sondas por cosas que no eran el paralelo:
  - **`muerte41`** dos veces: un clic en «Start» y un `goto` agotando los
    **30 s** de Playwright. Sola, verde (41 de 41, 49,9 s). La primera carga
    paga las transformaciones de `vite`, y antes la precedían 6-8 s de sueño;
    sin ellos y con la CPU al 90 %, 30 s no bastaban. Se le dio al `goto` de
    `entrarPorElMenu` el mismo `timeout` largo (240 s) que ya tenía la espera a
    `window.probe`: un `goto` lento no es un rojo del juego, uno colgado sigue
    cayéndose. Después, `pantalla95` (que se había caído igual) dio 14 de 14.
  - **`red95`** se cayó con «Execution context was destroyed» y
    **`costurared92`** perdió un control: **la recarga en caliente**. Otra
    sesión guardaba un archivo de `src/` y `vite` recargaba la página de la
    sonda a media medida. El 93 lo había cortado a mano en unas pocas sondas
    con un `WebSocket` falso; estas dos no lo tenían. De ahí
    `sondas/vite.sondas.mjs`. **Medido con un control positivo**: una página de
    prueba (`build/sondas/hmrprueba/`) y un módulo que se reescribe a los 1,5 s
    — con la configuración por omisión, **1 recarga**; con la de las sondas,
    **0**; y rota a propósito (`hmr: true`, `watch: {}`), **1** otra vez.
    `server.hmr: false` **no quita el websocket** (Vite 5 lo abre igual): lo
    primero que miré fue ése y salía en las dos, así que no servía de medida.
    Después, `red95` 12 de 12.
  - **`costurared92`** siguió con 15 de 16 —«a Beto no le llega ningún
    veneno»— y **no es esto**: el control pide que Beto no esté en
    `c3.efectos`, y la costura del servidor trae ahora a TODOS los clientes,
    Beto con `aplicados: 0` y `activos: []`. Cambió la forma de `/costura`
    (trabajo de otra sesión en `src/red/`); el control está por ajustar.
  - **`veneno91`**, de tres en tres: «no hay araña viva en la manada»; sola y
    al 100 % de CPU, otros rojos (el reloj del veneno 0,50/1,50/2,60/3,60 contra
    ±0,2 s, el negativo con un golpe de más). Mide en tiempo real con
    `waitForTimeout` fijos (2,5 s para que nazca la araña), y **es sensible a
    la carga, no al paralelo**: en serie con carga pasó. Vigilarla.
  - **`personaje96`**: 14 de 16 en serie y en paralelo, «faltan Kharaztorant
    Fire Blade» (A6 y B5). Otra sesión estaba rehorneando armas (`npm run
    armas` en marcha); no es del arranque.
  - **`golpe`** dio una vez «MAL y le quita el 1 % de su daño» con «errores de
    página: ninguno» **listado como roja**: eso último era mío (§4); lo primero
    desapareció en la pasada siguiente, con trabajo de otra sesión en marcha.
- **El punto 4 del encargo ya estaba hecho**: `armas97` usa
  `build/partidas/sonda97h` desde antes de este experimento, e `inventario97`
  `sonda97`. El aviso de `NEXT_SESSION.md` (pendiente 7 del 97) envejeció. La
  prueba de puertos vigila ahora también las carpetas, y hoy no hay ninguna
  repetida.
- **`estado.mjs` y `paseo.mjs` no podían arrancar**: su `ROOT` sube dos
  carpetas desde `sondas/` y buscaba `node_modules/vite/bin/vite.js` **fuera del
  repositorio**. El `node` moría, la promesa esperaba 30 s y reventaba con
  «vite». Pasadas a `arrancarVite`, ahora arrancan; lo que miden (entran por
  `?map=gatecity`, sin menú) no se ha revisado.
- **Las seis que usan `createServer` de vite dentro del proceso**
  (interacciones51, materialesmenu, menu52, recursos, torre57, torre58) **no
  fugaban**: el servidor muere con el proceso, y piden puerto 0, así que no
  chocan. Se dejaron como estaban. El encargo las contaba entre «las 8 sin
  `liberarPuerto`»; las que de verdad fugaban eran estado y paseo.

## 4. Lo que el lanzador encontró el primer día

**`personaje96` imprimía «16 de 16 en verde» y salía con 1, siempre.** Su
`DECLARADOS = 15` (A1-A8, B1-B6 y el de errores de página) no se subió cuando
el 97 añadió **A7b**, y la salida exige `verdes === DECLARADOS`. El
`NEXT_SESSION.md` del 97 la lista «en verde, 16»: quien la pasó leyó el
resumen, que es lo único que se veía. El lanzador mira además el código de
salida, y fue la única roja de la primera tanda. Arreglado: `DECLARADOS = 16`.
*Es la sexta forma del verde vacío: un marcador que sólo lee el resumen no ve
la otra mitad del veredicto.*

Y mi propio fallo del mismo día: el lanzador listaba **«errores de página:
ninguno»** como línea roja. La expresión era `:\s*(?!ninguno)`, y el motor deja
el `\s*` en cero espacios para que la mirada adelante vea « ninguno» —con su
espacio— y case. El `\s*` va dentro: `:(?!\s*ninguno)`. Lo vi porque `golpe`
tenía una roja de verdad al lado, y la segunda línea sobraba.

## 5. Lo que queda

- **Medir en serie antes y después con la máquina para uno solo.** La tabla de
  §2 mezcla cargas; el ahorro del sueño está medido aparte, pero el total no.
- **`costurared92`**: ajustar el control negativo a la forma nueva de
  `/costura` (Beto puede estar, con `aplicados: 0`).
- **`veneno91`** con carga: su `waitForTimeout(2500)` para que nazca la araña
  podría ser un `waitForFunction`.
- Las sondas que cortan la recarga en caliente con un `WebSocket` falso (el 93)
  ya no lo necesitan con `vite.sondas.mjs`; se dejaron, no estorban.
- Los formatos de resumen siguen siendo varios. El lanzador los entiende
  todos los de hoy («N de N en verde», «── N de N controles ──», «N de N
  controles en verde»); una sonda con un cuarto formato saldría «sin resumen»,
  o sea roja, que es el lado bueno del error.
