# Experimento 38 · La pantalla completa, los retratos y tres controles que mentían

Este experimento no traía nada nuevo del juego. Venía a medir lo que el 35 dejó
declarado —«falta la sonda. Queda dicho aquí en vez de dado por bueno»— y a
arreglar cuatro cosas que el jugador vio jugando. Al medirlas salieron **tres
controles en verde que no medían nada**, y uno de los tres llevaba escondido un
fallo de verdad: los tres modelos animados de la pantalla de personajes no se
montaban desde hacía tiempo, y la sonda que los vigilaba decía que sí.

---

## 1. Aguantar la Escape spameaba el menú

`src/main.js`, el reparto de `keydown`: la Escape alternaba el menú **sin mirar
`e.repeat`**.

Esto sólo se nota en pantalla completa, y por una razón que conviene escribir:
**Chromium exige la Escape AGUANTADA para salir de pantalla completa cuando el
teclado está atrapado.** Un toque no basta, y es deliberado — es la única salida
que le queda a quien está dentro. Así que en pantalla completa el jugador *tiene*
que aguantarla, y cada repetición del `keydown` alternaba el menú: abre, cierra,
abre, cierra, con su sonido cada vez.

El propio archivo ya sabía esto catorce años antes, para las ranuras:

```js
// `e.repeat` es la clave: aguantar una tecla en un navegador dispara
// `keydown` en bucle
if (!e.repeat) ranuras.pulsar(cual + 1);            // src/main.js:1599
```

Y a la tecla que sirve para *salir* no se le había aplicado. No es una concesión
al navegador: en el motor el menú también se alterna al pulsar, porque
`IN_KeyEvent` reparte cambios de estado y un `keydown` repetido no es un cambio
de estado.

## 2. El ratón no funcionaba en el menú en pantalla completa

Y es el mismo fallo de fondo que el anterior, lo que lo hace la parte
interesante del experimento.

`montarMenu()` **nunca soltó el puntero**. No se notaba porque al menú se llega
con la Escape, y la Escape suelta el puntero ella sola: eso estaba escrito desde
el 35, en la tabla de teclas que el navegador se reserva —

```js
{ codigo: "Escape", modificador: null, que: "releases the mouse" }
//                                        src/juego/navegador.js:76
```

— o sea que durante seis experimentos el ratón del menú principal lo soltó el
navegador por nosotros, gratis y sin que nadie lo supiera.

En pantalla completa con Keyboard Lock **la Escape ya no es del navegador**: la
pedimos nosotros, que es justo el punto del experimento 35. El favor
desaparece, el puntero se queda en el `canvas`, y el menú principal se abre
entero, bonito y sin poder pulsar nada.

> **El arreglo del 35 se llevó por delante lo que le tapaba el fallo al de al
> lado.** Pedir la Escape es pedir también lo que la Escape hacía gratis.

El arreglo: `cursorDelRaton` sale a una función con nombre y la usan **las dos**
capas de interfaz —el registro de VGUI1, que ya la tenía desde el 35, y el menú
principal, que no—. Es `UpdateCursorState`
(`vgui_teamfortressviewport.cpp:1741-1750`).

## 3. «Disconnect» no devolvía al menú principal

Lo que había:

```js
menuMs.cerrar();
sesion?.guardar({ forzar: true });
interfaz?.elegir?.();
```

Dos cosas mal a la vez: se veía la pantalla de personajes en vez del menú, y **el
mapa se quedaba detrás**, porque el personaje seguía vivo en la sesión. En
GoldSrc `disconnect` tira la partida y lo que queda delante es el menú con su
fondo; quien elige personaje es quien está entrando, no quien acaba de salir.

`sesion.salir()` existe desde siempre y hace exactamente lo que toca —guarda a la
fuerza, suelta el personaje, pasa a ELIGIENDO (`src/juego/sesion.js:450`)—. No se
estaba llamando. Y hay que esperarla y cerrar el panel de VGUI después, porque
pasar a ELIGIENDO hace que la interfaz levante la pantalla de personajes: sin
cerrarla queda detrás del menú y la Escape siguiente la descubre.

El menú se reabre con `hayPartida = false`, que es lo que quita «Resume game» y
«Disconnect» de la lista: ya no hay partida a la que volver.

**Lo que esto no hace, y va dicho:** no descarga el mapa. El motor sí lo hace;
aquí costaría los segundos de releer el `.bsp` con sus 25 atlas de luz. El fondo
del menú es opaco así que no se ve, pero los 69 bichos siguen en memoria. Es una
diferencia nuestra, no una fidelidad.

## 4. Los tres modelos de la pantalla de personajes, que llevaban sin montarse

El jugador dijo que el personaje animado había desaparecido de la pantalla de
elegir, y tenía razón. Los tres lienzos estaban ahí. Vacíos.

`Retratos.montar()` se rinde en silencio si la caja mide 0x0
(`src/render/retratos.js:78`), y eso es correcto: no se puede dar resolución a un
lienzo sin saber de qué tamaño va a ser. Lo que estaba mal era **darse por
montado de todas formas**.

El registro monta los paneles **escondidos**:

```js
if (panel.raiz && this.raiz) this.raiz.appendChild(panel.raiz.nodo);
panel.raiz?.ver(false);            // ← escondido
panel.colocar(this.ancho, this.alto, this.esquema);   // ← y aquí se montan
//                                        src/vgui/registro.js:148-150
```

O sea que **el primer intento ocurre siempre con las tres cajas a 0x0 y siempre
falla**. Y el segundo no llegaba, porque `_montarRetratos` daba el sitio por
hecho en cuanto el `<canvas>` existía:

```js
if (destino.lienzo) return;        // ← el lienzo existe, el retrato no
```

Así que las tres ranuras se quedaban con un lienzo vacío para siempre. El
arreglo: la marca de «hecho» es el **retrato**, no el lienzo, y el intento se
repite en cada `colocar()` hasta que sale — el registro llama a `colocar()` dentro
de `abrir()`, o sea con el panel ya visible, y ahí la caja mide. Y al cerrar se
olvidan, porque `soltar()` los ha quitado: sin eso, volver a esta pantalla
encontraba los lienzos puestos y enseñaba tres cajas vacías otra vez.

Medido, entrando por los dos caminos:

| | lienzos | retratos vivos |
| --- | --- | --- |
| antes | `300x150` en cajas de `206x217` | **0** |
| después | `206x217` en cajas de `206x217` | **3** |

---

## Los tres controles que mentían

Esto es lo que este experimento deja de verdad.

### 1. «hay un lienzo por ranura» — y un `<canvas>` mide 300x150 solo

`sondas/personaje30.mjs:98` contaba

```js
[...document.querySelectorAll(".vg-char-retrato")].filter((c) => c.width > 0 && c.height > 0)
```

**Un `<canvas>` recién creado mide 300x150 por definición del elemento.** El
control estaba en verde con los tres retratos sin montar, y era el único que los
vigilaba. Ahora mira lo que no se puede fingir: cuántos retratos están
*animándose*, y que el lienzo tenga la resolución de su caja y no la de fábrica.

### 2. «aguantar la Escape no alterna el menú» — dos veces

Este control nació malo dos veces seguidas, y las dos se pillaron rompiendo el
arreglo a propósito y volviendo a pasar la sonda. Vale la pena el detalle:

- **Primera versión:** muestreaba «¿está abierto?» veinte veces mientras la tecla
  estaba abajo. **Verde con el arreglo quitado:** veinte de veinte muestras con el
  menú abierto y el menú alternando debajo, porque entre dos miradas cabe un
  número par de vueltas y cada mirada cuesta 30 ms de ida y vuelta.
- **Segunda versión:** contaba las aperturas —`menums.js` lleva un contador que
  sólo sube— pero aguantaba la tecla con `keyboard.down` + `waitForTimeout`.
  **Verde otra vez:** Playwright manda **un solo** `keyDown` por CDP y la
  repetición automática la hace el sistema operativo, que en una sonda no está.
  Medía el transporte de la sonda, no el juego.
- **La que sirve:** un segundo `down()` de la misma tecla sin `up()` en medio sí
  lleva `repeat: true`, que es exactamente lo que llega cuando alguien la
  aguanta. Con el arreglo: **1 apertura**. Sin él: **11**.

### 3. «una caída mortal dentro del agua no hace daño» — sigue en rojo, a propósito

Ya estaba diagnosticado y **no se ha tocado**, porque arreglarlo no estaba
pedido: `sondas/mapa.mjs` da 15 → 15 en el agua y también en seco, o sea que su
positivo mide cero. Queda como el único rojo del árbol y se ve.

---

## Y el rojo de la escalera, que sí se ha arreglado

«Y se sube por ella» llevaba en rojo desde el experimento 21 y era de la sonda.
Ponía al jugador en **el centro de la caja de la escalera**, y una escalera de
GoldSrc es un brush fino pegado a la pared —ésta mide 1,02 x 10,54 x 0,13 m— así
que su centro está a 6 cm de la pared y el casco del jugador mide medio metro. El
jugador quedaba empotrado.

El número que lo demuestra es **el horizontal**:

| dónde se le pone | sube | horizontal |
| --- | --- | --- |
| centro de la caja | 0,00 m | **0,00 m** |
| el mismo sitio, mirada invertida | 0,00 m | **0,00 m** |
| separado 0,3 m, lado abierto | **6,29 m** | 0,14 m |
| separado 0,3 m, lado de la pared | −2,58 m | 0,25 m |

Cero en las dos direcciones no es una escalera que no sube: es un jugador que no
se mueve. Y el sospechoso que llevábamos apuntado —el `atan2(-(-x), -(-z))` de
cuatro signos de `mapa.mjs:162`, que parece un error de copiar— **es correcto**:
los cuatro signos son «mira CONTRA la normal», y con el jugador bien colocado
trepa seis metros en 1,2 s.

A cambio la sonda ya no puede elegir el lado a dedo, porque `normalDeEscalera`
apunta siempre hacia el jugador (`movimiento.js:568`) y desde dentro de la pared
también contesta. Se prueban los dos lados, y eso deja la pareja que faltaba: por
el lado abierto se sube y **por el de la pared no**.

---

## Lo que sigue sin poderse medir, y por qué

Que la pestaña **no se cierre** con Ctrl+W no se puede comprobar desde una sonda.
Playwright manda las teclas por CDP (`Input.dispatchKeyEvent`), que las inyecta en
el renderizador **por debajo de la capa de atajos del navegador**: un Ctrl+W de
sonda no cierra la pestaña ni con el teclado atrapado ni sin él. Un control que
dijera «no se cerró» estaría en verde con Keyboard Lock desconectado — el mismo
error que el positivo del agua.

Así que el control está, y dice lo que es: *«un Ctrl+W de sonda no cierra la
pestaña CON el teclado atrapado»*, que es la medida de que el camino inyectado no
distingue. Lo demás del 35 sí se mide ahora: que la `b` consigue la pantalla
completa **y** el teclado, que el navegador lo confirma, y que soltarlo se entera.

## Y una regla del proyecto que se rompió sin que nada se pusiera rojo

Las 22 sondas abren `?map=gatecity`, que es `hl.exe +map` y entra **sin pasar por
el menú**. Desde el experimento 36 el jugador no entra por ahí: entra por el
menú. O sea que «la sonda recorre el mismo camino que recorre el jugador» se
rompió el día que se cambió por dónde se entra, y no se rompió en una sonda: se
rompió en **todas a la vez**, sin que ninguna se pusiera roja.

`sondas/pantalla38.mjs` abre una segunda página sin `?map=` y va andando: menú →
«Establish a Kingdom» → «Start» → la pantalla de personajes. Es por ahí por donde
se vio lo de los retratos. Las otras 22 siguen entrando por `?map=`, que sigue
siendo legítimo —es una de las dos puertas del juego— pero ya no es la del
jugador, y eso conviene que esté escrito en algún sitio. Éste.

---

---

## Y el sonido de correr: había dos juegos y estábamos midiendo el otro

El jugador dijo que el sonido de correr era el nuestro y debería ser el de MSR.
La primera respuesta fue que no existe, y tenía una cita:

```
basedir "msr"          ← ../MSC/assets/msr/gameinfo.txt
```

De ahí `tools/sonido.mjs` concluía «Rebirth es standalone, no hay `valve/`
detrás», y por tanto que `pl_step*` **no está en el juego** — sobre el 99,5 % del
suelo de Gate City. Y de ahí salieron los cuatro pasos generados del experimento
26, para tapar un hueco.

El jugador insistió: «me parece raro que no exista, está usando uno». Y dio la
ruta. Encima del `basedir` hay un comentario que nadie había leído:

```
// Master Sword Rebirth - Xash3D FWGS Game Configuration
// This file makes MSR a fully standalone game (no valve/ dependency)
```

**Ese `gameinfo.txt` es de una de las dos builds.** La otra —la que se juega— es
un mod de GoldSrc: `hl.exe -game msr`, y su `liblist.gam` no declara ni `basedir`
ni `fallback_dir`, porque no le hace falta: **el sistema de archivos de GoldSrc
monta `valve/` detrás del mod siempre.**

O sea que las dos frases eran verdad a la vez y el error era pensar que se
contradecían:

| | `valve/` detrás | correr por piedra |
| --- | --- | --- |
| Xash3D standalone | no | mudo |
| mod de GoldSrc | **sí** | los `pl_step*` de Half-Life |

Buscar en `../MSC/assets/msr` y no encontrar los pasos era correcto; concluir que
el juego no los tiene, no. **El hueco estaba en el sitio donde buscábamos.**

Con `valve/` detrás aparecen los 36, y no era sólo el paso:

| | antes | ahora |
| --- | --- | --- |
| pasos | 16 | **24** |
| sonidos del jugador | 4 de 7 | **7 de 7** |
| combate | 24 de 39 | **39 de 39** |
| puertas | 0 | **1** |
| generado por nosotros | 99,5 % del suelo | **0 %** |
| piedra / tierra / hierba | los tres iguales | `pl_step` / `pl_dirt` / `pl_duct` |

Y con ellos suenan cosas que estaban mudas y nadie había echado en falta: el
chapoteo y el vadeo del agua, el `doormove9` de las puertas, los tres
`common/bodydrop*` de las caídas que duelen, y la mitad del set de combate de los
69 bichos.

### El aviso que acertó dos años antes

Este archivo tenía un control de control que decía, literalmente:

> si un día no faltara ninguno, significaría que alguien ha puesto un Half-Life
> al lado — y entonces este informe estaría mintiendo sobre lo que suena en el
> juego original.

Acertó el hecho y falló la conclusión: **un Half-Life al lado no contamina el
informe, lo completa.** Pero la mitad buena se conserva, con la condición que le
faltaba: si no falta ninguno **y ninguno viene declarado de `valve/`**, entonces
sí hay archivos de Valve mezclados dentro de `assets/msr` sin declarar, y eso
sigue siendo un fallo que para el horneado.

### Los controles que había que invertir, no aflojar

Cambiar de hornada dejó cinco controles afirmando el mundo viejo. La tentación
era quitarlos; lo que se hizo fue **darles la vuelta**, porque un `if` que los
salta deja la hornada nueva sin ningún control sobre los pasos — la cuarta
repetición de la misma forma de fallo.

- `tools/sonido.mjs` comprobaba que piedra y tierra **comparten** muestras (es
  cierto cuando las dos están generadas). Con `valve/` detrás comprueba lo
  contrario: que suenan **distinto**, porque `pl_step*` y `pl_dirt*` son archivos
  distintos. Y que ninguno se ha quedado mudo por el camino, que los dos
  anteriores no verían.
- `sondas/sonido.mjs` lee del catálogo **de qué hornada habla** y comprueba lo que
  a esa hornada le toca. Las dos ramas se han pasado: GoldSrc 25/25, Xash3D
  23/23. Una rama sin pasar es una rama que se podre.
- Y `HALFLIFE=none` existe justo para eso: sin él, en una máquina con Half-Life
  el camino de los pasos generados no se podría volver a probar nunca.

### Lo que esto no cambia

Los 36 son **de Valve**. Van a `build/`, que está en `.gitignore`, quedan
declarados aparte en `PROCEDENCIA.md` y marcados `de: "valve"` en el catálogo para
poder contarlos y quitarlos de golpe. El `README` ya decía que el permiso de Valve
no lo puede dar el equipo de MSR; ahora hay una razón más concreta para que lo
diga.

---

## Las cuentas

| | |
| --- | --- |
| `npm test` | 1 000, sin tocar |
| `npx vite build` | limpio |
| `sonda:pantalla38` | **35/35**, nueva |
| `sonda:mapa` | 32/33 — eran 28/30, y el rojo que queda es el del agua |
| `sonda:personaje30` | 18/18 — eran 17, y uno de los 17 no medía nada |
| `sonda:vgui29` · `inventario31` · `hoja32` | 36/36 · 20/20 · 15/15 |
| `sonda:vgui2_34` · `misiones33` · `arranque36` · `ajustes37` | 26/26 · 23/23 · 12/12 · 14/14 |
| `sonda:sonido` | **25/25** horneando GoldSrc y **23/23** horneando Xash3D — eran 22 con cuatro afirmando el mundo viejo |
| `sonda:mundo` · `golpe` · `consecuencias` · `arco` · `escudo` | 40/40 · 25/25 · 44/44 · 35/35 · 34/34 |

## Los archivos

| | |
| --- | --- |
| `src/main.js` | `!e.repeat` en la Escape, `cursorDelRaton` con nombre y para los dos, «Disconnect» por `sesion.salir()` |
| `src/juego/menums.js` | `cursor` y el contador de aperturas |
| `src/vgui/personaje.js` | los retratos se reintentan, y se olvidan al cerrar |
| `src/dev/sonda.js` | `probe.navegador`, que sólo lee |
| `sondas/pantalla38.mjs` | nueva |
| `sondas/mapa.mjs` | la escalera, por sus dos lados |
| `sondas/personaje30.mjs` | el control de los retratos, que ahora mide |
| `tools/sonido.mjs` | `valve/` detrás del mod, en el orden de GoldSrc; `HALFLIFE`; el control invertido |
| `sondas/sonido.mjs` | lee de qué hornada habla |
| `README.md` | «Two builds, two soundtracks» |
