# 37 · Que los ajustes hagan algo

**Qué se pidió:** *«listo, continuemos con lo que falta»* — y lo primero de la
lista de `doc/ARRANQUE_36.md` §6 era esto: *«Los ocho ajustes vivos de
"Options", aplicados de verdad»*.

**Estado:** los nueve —eran ocho— llegan hasta el juego. **1 000 pruebas de
Node**, `sonda:ajustes37` 14/14, y las siete sondas vecinas sin tocar.

---

## 1. Lo que había: una ventana que recogía y no entregaba

El 34 dibujó «Options» con la letra y los colores del juego, el 36 le puso la
puerta, y los dos dejaron el mismo hueco: pulsabas «Apply», `alAplicar` guardaba
un objeto en `ajustesDelJugador`, y **no lo leía nadie**. La sensibilidad decía
10 porque lo dice el `config.cfg`, no porque el ratón girara a 10.

Lo que hacía falta no era enganchar un `if` por ajuste, sino que existiera el
sitio donde enchufarlos. Para el ratón, ese sitio no existía.

---

## 2. El ratón: había una constante donde va una fórmula

```js
const MOUSE = 0.0022;          // radianes por cuenta
player.yaw -= e.movementX * MOUSE;
```

Eso venía del experimento 02 y es un número elegido a ojo. La fórmula del mod
son tres pasos y tres cvars (`inputw32.cpp:414-452, 527-552`):

```cpp
mouse_x = (mx + old_mouse_x) * 0.5;     // m_filter
*x *= mouse_senstivity;                  // sensitivity
viewangles[YAW] -= m_yaw->value * mouse_x;
```

Con `sensitivity "10"` y `m_yaw "0.022"` del archivo, eso es **0,22 grados por
cuenta**. La constante daba **0,126**: el port giraba a poco más de la mitad de
lo que gira el juego, y era imposible notarlo porque no había con qué comparar.

**Esto cambia cómo se siente el juego**, y conviene decirlo en voz alta: el
ratón ahora va casi al doble. No es una mejora de tacto, es el número del
archivo; si a alguien le va rápido, el deslizador está para eso — que es
exactamente lo que este experimento venía a construir.

De paso caen dos cosas más:

- **el filtro** (`m_filter "1"`) es la media de DOS muestras, y lo que se guarda
  para la siguiente es la cuenta **cruda**. Guardar la filtrada daría un ratón
  con cola de medio segundo: se nota jugando y no se ve leyendo.
- **el tope de la vista** era ±(90° − 0,57°), otro número inventado. Son 89°,
  que es `cl_pitchup`/`cl_pitchdown` (`input.cpp:1122-1123`).

Y el ratón invertido no es una casilla en el motor: es el **signo** de
`m_pitch`. Aquí también.

---

## 3. Dos ajustes estaban apagados por una frase que ya no era verdad

`src/play/ajustes.js` apaga lo que no se puede cumplir y escribe por qué. Dos de
esos «por qué» habían caducado:

| ajuste | decía | y resulta que |
| --- | --- | --- |
| **MP3Volume** | «no hay pista de música en este port» | hay **cuatro**, y `audio.musica(zona.musica)` las cambia por zona |
| **Player name** | «`config.cfg` no trae `name`» | lo trae: `name "Adventurer"`, línea 160 |

El segundo además no era decorativo. En el mod, la pantalla de crear personaje
**arranca con ese nombre puesto**:

```cpp
Gender_Name = gEngfuncs.pfnGetCvarString("name");   // vgui_choosecharacter.cpp:411
Gender_NameTextPanel->SetText( Gender_Name );       //                        :545
m_NewChar.Name = m_pPanel->Gender_Name;             //                        :164
```

Aquí el cuadro arrancaba vacío. Ahora propone «Adventurer», y lo que escribas en
«Options» es lo que sale propuesto allí.

La lección es la de siempre y no la de «se nos olvidó»: **un `porQueNo` es una
afirmación con fecha**, y nadie la vuelve a leer. Los dos se cazaron al ir a
enchufar el de al lado.

---

## 4. El volumen: el port sonaba ocho veces más alto que el juego

`volume "0.120000"` (`config.cfg:184`). Hasta ahora el maestro estaba en 1, o
sea que este port sonaba **ocho veces más alto** que la instalación de al lado.
Poner el del archivo es lo mismo que se hizo con `gl_overbright "0"`: manda el
juego aunque a uno le parezca poco.

Y son **dos canales, no uno**: `volume` es el de los efectos y `MP3Volume` el de
la música, y en el motor son cvars independientes. La música colgaba del nodo
maestro, así que bajar los efectos habría bajado también la canción y los dos
deslizadores se habrían multiplicado. Ahora la música va directa a la salida.

---

## 5. El brillo y la gamma: lo que el motor rehace, y lo que no

Éste parecía el caro, y el motor lo abarató. Mover la gamma **no** es un filtro
encima de la pantalla: `V_CheckGamma()` reconstruye las tablas y llama a
`R_GammaChanged(false)`, que hace exactamente una cosa —

```c
glConfig.softwareGammaUpdate = true;
GL_RebuildLightmaps();
                              ref/gl/gl_rmain.c:1017-1021
```

— **rehacer los mapas de luz**. Las texturas del mundo NO se vuelven a subir: se
quedan con la `texgamma` que tenían al cargarse. Por eso la pestaña Video lleva
su nota de «hay que reiniciar», que ya estaba portada sin saber que era ésta.

O sea que aquí basta con rehacer el atlas. Que las texturas no cambien no es un
recorte nuestro: es lo que hace el juego.

### La diferencia que sí es nuestra, y está medida

El motor rehornea desde el lump de luz crudo. En el navegador no lo tenemos:
tenemos el atlas ya horneado, que guarda `luz[i] >> 2`. Así que se deshace y se
vuelve a hacer con una tabla de 256 entradas:

```
byte del atlas ──(inversa de la tabla vieja)──► i ──(tabla nueva)──► byte
```

La inversa no puede ser exacta —1 024 índices caben en 256 bytes—, así que se
**mide** contra hornear de verdad, sobre los luxels que tiene Gate City:

| de `brightness 2` a | error medio | peor | el atlas pasa de |
| --- | --- | --- | --- |
| `brightness 1` | **0,258** / 255 | 24 | 47,4 → 39,0 |
| `brightness 0` | **0,250** / 255 | 27 | 47,4 → 29,7 |
| `brightness 3` | **0,103** / 255 | 1 | 47,4 → 52,7 |
| `gamma 1,8` | **0,093** / 255 | 1 | 47,4 → 26,7 |

Un cuarto de byte sobre 255 de media. El peor caso —27— existe y está en unos
pocos valores que el mapa casi no usa; por eso el medio y el peor van los dos en
la tabla y no sólo el que queda bien.

Y se remapea **siempre desde el horneado**, nunca desde lo ya remapeado:
encadenar de 2 a 0 y de 0 a 2 perdería un poco en cada salto y el mapa se iría
oscureciendo cada vez que alguien roza el deslizador. La sonda lo comprueba:
volver al valor del archivo devuelve el atlas byte a byte.

---

## 6. Los nueve, y lo que mide cada uno

| ajuste | dónde acaba |
| --- | --- |
| `sensitivity`, `m_pitch` (invertido), `m_filter` | `Raton` en `src/play/aplicar.js` |
| `volume` | el nodo maestro de Web Audio |
| `MP3Volume` | el canal de música, aparte |
| `name` | el nombre que propone crear personaje |
| `brightness`, `gamma` | los 25 atlas del mapa de luz |
| las teclas | `src/juego/teclas.js`, desde el 24 |

De los 30 controles de la ventana, **9 vivos y 21 apagados**, cada uno con su
razón escrita. La cuenta la calcula `cuenta()`, así que no se puede quedar
vieja.

---

## 7. Lo que separa esta sonda de las pruebas

`npm test` comprueba las **reglas**: que 0,22 es la fórmula, que la tabla es la
identidad cuando tiene que serlo. Ninguna de esas 22 pruebas dice que mover el
deslizador llegue a ningún sitio.

Por eso la sonda no lee ni un valor de la ventana: lee el **efecto**. Los grados
con los que gira el ratón, la ganancia del nodo de Web Audio y el píxel medio
del atlas que tiene puesto la tarjeta. Y sus dos controles positivos son:

1. **«Apply» sin tocar nada no puede mover el atlas.** Sin esto, «bajar el
   brillo lo cambia» saldría verde con un código que rehiciera el atlas siempre
   y lo estropeara un poco cada vez.
2. **Arrastrado el deslizador y sin aplicar, el ratón sigue como estaba.** Que
   la ventana diga 16 y el juego gire a 10 es lo correcto hasta que se pulsa.

---

## 8. Tres reds que no son de este experimento — y dos de ellos no son del juego

Al volver a correr las sondas vecinas —la costumbre que dejó el 31— salieron
tres controles en rojo:

- `sonda:pulido` — *«desde tres metros suena, al 0,85»*: la caída de 3 m mide
  40 u/s en vez de las 350 del umbral.
- `sonda:mapa` — *«y en seco SÍ mata»* (15 → 15) y *«y se sube por ella»*
  (0,00 m): el plano de la muerte y la escalera.

**Mi comprobación fue insuficiente y conviene dejarlo escrito.** Guardé el
experimento con `git stash` y salieron igual, y de ahí concluí «no son de
aquí». Pero un stash sólo descarta el 37: el árbol lleva treinta y siete
experimentos sin commitear, así que eso no distinguía entre «viene del 36» y
«viene de siempre». La otra sesión lo hizo bien —un `git worktree` aparte, con
junctions a `build/` y `node_modules/`, sin tocar el árbol compartido— y salen
idénticos en `HEAD` **y en `a2a430c`, la mudanza**. Vienen del laboratorio, de
antes de que este repositorio existiera.

Y el diagnóstico es peor que «hay tres reds», porque **dos de los tres son la
sonda midiendo mal, no el juego**:

- **«y en seco SÍ mata».** `mundo.caer()` escribe `vel[1]` y `caida`, pero
  `player.js:375` sólo cobra el golpe en la transición aire→suelo
  (`if (!antes && this.caida > 0)`). La sonda suelta al jugador a `+0,5 m` del
  nacimiento, y a medio metro ya está apoyado: `antes` es `true` y la
  transición no ocurre nunca. El juego está bien.
- **Y de ahí sale lo que de verdad importa: su positivo, *«una caída mortal
  dentro del agua no hace daño»*, está VERDE midiendo nada.** Da 15 → 15 porque
  *nada* hace daño por esa vía, no porque el agua proteja. Es el patrón del 35
  otra vez: controles verdes contra algo que no se podía tocar.
- **«desde tres metros».** Las tres alturas dan 1 m → 120 u/s, 3 m → **40**,
  14 m → 733. No es monótono, así que no es la regla: a `+3 m` el `poner()`
  deja al jugador dentro del techo del nacimiento y cae cuatro dedos sobre él.
  Las líneas 175-179 de `pulido.mjs` avisan de justo esta trampa para no usar
  `caer()`, y se cae en ella un piso más arriba al elegir una altura sin hueco.

La escalera **no está diagnosticada**; sólo hay un sospechoso:
`mapa.mjs:162` calcula el yaw como `Math.atan2(-(-nn[0]), -(-nn[2]))`, que es
`atan2(nn[0], nn[2])` con cuatro signos de más. Si el signo está al revés, el
jugador anda de espaldas y 0,00 m es la medida correcta.

Ninguna de las dos sondas se ha tocado: son reds viejos y arreglarlos es
decisión del usuario.

### Lo que sí toca este experimento, comprobado

El tope de la vista pasó a los 89° de `cl_pitchup`, y hay dos sondas que miran
el cabeceo. Corridas: `sonda:mundo` **40/40** y `sonda:golpe` **25/25**.

---

## 9. Dónde se puede haber medido mal

- **El error del remapeo está medido sobre 2 000 caras**, no sobre las 14 527.
  Se eligieron las primeras del `.bsp`, que no es una muestra al azar.
- **El píxel medio del atlas no es el brillo de la pantalla.** Es la medida
  honesta de que el atlas cambió; cómo se ve el mapa con ese atlas depende
  además de la textura, del glow y de dónde estés.
- **Nadie ha comparado la vista con el brillo movido contra una captura del
  juego con el brillo movido.** Las tablas dicen que la matemática es la del
  motor; la comparación visual sigue siendo la del brillo de fábrica.
- **La sensibilidad no se ha probado con una mano.** Que gire 0,22° por cuenta
  es comprobable; que eso se sienta como el juego, no.

---

## Cómo se corre

```bash
npm test                   # 1 000 pruebas
npm run sonda:ajustes37    # 14 controles, con un Chromium de verdad
```
