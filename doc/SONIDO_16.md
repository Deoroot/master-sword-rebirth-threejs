# 16 · El fantasma de la puerta, y qué hacer con el sonido

> «el abrir puertas funciona pero deja un fantasma de la puerta en su lugar, se
> puede atravesar que es lo interesante. tambien faltan los sonidos del
> personaje, la musica del mapa, etc habria que evaluar como se implementaria»

Lo primero está arreglado. Lo segundo es una evaluación, y la conclusión corta
es: **el mecanismo entero se puede portar, los archivos no pueden viajar, y no
por nuestra regla sino porque la colección del mod tampoco es suya.**

---

## 1. El fantasma, que era mío y no de la física

«Se puede atravesar» era la pista, y apuntaba al sitio equivocado a propósito:
parecía un colisionador que faltaba y era una malla que sobraba.

En el 15 saqué las puertas de la colisión estática y les di malla y cuerpo
propios. Pero la malla de DIBUJO del mundo la seguí emitiendo con **todas** las
caras:

```js
const solidas    = caras.filter((c) => c.modelo === 0 || SOLIDAS.has(c.clase));
const malla      = emitirMalla(caras, ...);   // ← todas, puertas incluidas
```

Así que cada puerta se dibujaba **dos veces**: la hoja que gira, y una copia
clavada en el marco. Al abrirla, la copia se quedaba — y se atravesaba, porque
la copia sí había salido de la colisión. Lo que se veía como medio fallo era un
fallo y medio, los dos de la misma línea.

El reparto correcto son **tres listas y no dos**: lo que choca, lo que se dibuja
quieto, y lo que se lleva las dos cosas aparte porque se mueve.

### El control, que primero no comprobaba nada

Escribí como juez «que no quede malla quieta dentro del hueco de la puerta»,
encogiendo su caja al 60 %. **Pasaba con el fallo puesto a propósito.** Y es
obvio en cuanto se mira: una puerta es una TABLA, así que sus vértices están EN
las caras de su propia caja y nunca dentro de ella encogida.

El que sí distingue aprovecha que la hoja se emite en coordenadas de su bisagra:
sus vértices llevados al mundo son *exactamente* los que tendría la copia
quieta, así que se buscan uno a uno. Medido: **100 % con el fallo, 0 sin él.**

De paso, la clave de la música salía `null` en las once zonas porque buscaba un
valor y el dato está en el **nombre de la clave** — abajo.

---

## 1b. Y tres cosas más de las puertas, que el fantasma estaba tapando

Quitada la copia quieta se vio lo que había detrás, y una de las tres **era el
mismo arreglo del fantasma enseñando su otra mitad**.

### Se abrían negras

`emitirMalla` busca el sitio de cada cara en el atlas de luz **por identidad de
objeto**:

```js
new Map(lista.flatMap((a) => a.items.map((i) => [i.cara, { item: i, atlas: a }])))
```

Y yo releía las caras de la puerta del `.bsp` para emitirlas locales. Objetos
nuevos, que no están en ese mapa: las nueve se iban al **luxel negro**. No daba
error, daba puertas negras — y no se notaba porque la copia horneada en el
mundo, la del fantasma, sí estaba iluminada y era la que se veía.

Ahora se usan **las mismas caras** que ya pasaron por el empaquetado y se les
resta la bisagra después, que por linealidad de `aEscena` es idéntico a no
sumarla antes.

El umbral del control no se inventa: **38 de las 66 caras de puerta no tienen
mapa de luz en el `.bsp`** —cantos y traseras que el compilador nunca iluminó—
así que parte de ese negro es correcta y copiarla es lo que toca. Se compara
con el dato de origen: **46 % de vértices iluminados contra el 42 % de caras
que el `.bsp` ilumina**, y **0 % con el fallo puesto a propósito**.

### Se abrían hacia el jugador y lo empujaban

`CBaseDoor::DoorGoUp` (doors.cpp:609) no usa un lado fijo: lo calcula.

```cpp
Vector vec   = activador.origin - puerta.origin;
Vector vnext = (activador.origin + v_forward * 10) - puerta.origin;
if ((vec.x * vnext.y - vec.y * vnext.x) < 0) sign = -1;
```

Desarrollado, como `vnext = vec + f·10`, el término `vec × vec` se va y queda
`10 · (vec × f)`: **lo único que decide es de qué lado de tu mirada cae la
bisagra.** Por eso empujar la puerta la abre hacia donde empujas. Dos cosas que
hay que traducir y no copiar: en ejes de Three el cruce pasa a ser `dz·fx −
dx·fz` (copiarlo literal las abre todas al revés), y el motor lo condiciona a
`pev->movedir.y`, o sea sólo bisagra vertical — una trampilla no tiene «tu
lado».

Medido en el mapa: la misma puerta, el mismo empujón, **signo 1 desde un lado y
−1 desde el otro**, y el jugador se mueve **0,0 cm** al abrirse.

> Y de paso, mis banderas estaban mal: escribí que el bit 1 era
> `ROTATE_BACKWARDS` y es `START_OPEN`; el de girar al revés es el 2
> (`doors.h:19`). Ninguna de las nueve trae ninguna, así que no cambiaba nada
> hoy — y por eso habría llegado intacto al primer mapa que sí las use.

### Y te atrapaban

`CBaseDoor::Blocked` (doors.cpp:725): si algo la traba, **se invierte**.
Abriendo se cierra, cerrando se abre. Nunca aplasta.

Se pregunta girando el PUNTO al marco de la puerta y comparando con la caja
cerrada, no girando la caja: la envolvente de una hoja a 45° cubre el vano y el
costado a la vez, y con ella una puerta abierta del todo seguiría «tocando» a
quien pasa por debajo.

Dos cosas salieron de medirlo, y las dos dejaban la puerta **clavada a 10°**:

1. Preguntaba por el ángulo **actual** en vez de por el siguiente. Una vez que
   la hoja tocaba al jugador, cada fotograma cambiaba de estado y ninguno la
   movía.
2. Y la cercanía la volvía a abrir en el mismo sitio. Pasa aquí y no en el
   motor porque **el motor apaga el `Touch` mientras la hoja se mueve**
   (`SetTouch(NULL)`, doors.cpp:543): lo suyo se dispara por contacto y lo
   nuestro es un radio que se cumple siempre. Un paso de margen para el
   retroceso es lo que hace que el rebote avance, y sale el rebote de puerta de
   Half-Life de toda la vida.

---

## 2. Qué pide el mapa, exactamente

Leer esto es del mapa, y ya está horneado.

### La música: 11 zonas, 7 canciones, 4 que no hacen nada

`CAreaMusic::KeyValue` (`msmapents.cpp:611`) acepta dos formas, y Gate City usa
la vieja en las once:

```cpp
if (keyName == "song")                 m_sSong = pkvd->szValue;
else if (keyName.find(".mp3") != npos) m_sSong = pkvd->szKeyName;  // legacy
```

O sea que **la clave es el nombre del archivo** y el valor es la duración:
`"mscave.mp3": "3:17"`. Por eso buscar un valor daba `null`.

Y con la clave bien leída sale el dato que no se esperaba: **4 de las 11 no
traen canción**, y con `m_sSong` vacío `MusicTouch` se va en su primera línea.
No son zonas rotas que haya que arreglar: son zonas que no hacen nada, y el mapa
se jugaba así.

Las 7 que sí piden algo piden cuatro canciones: `msgatecity.mp3`, `mscave.mp3`,
`Stamp_Your_Feet.mp3` y `MSEndlessRiver.mp3` — **11,4 MB** entre las cuatro.

Y el comportamiento tampoco es «entrar y sonar»: al tocar la zona se **para todo
lo demás** (`AllMusic.clear()`), y una canción cuyo nombre no acaba en `.mp3` ni
`.ogg` significa *silencio*, no *canción que falta*.

### Los sonidos de ambiente: 5

`ambient_generic`, con el `.wav` en `message`: `ambience/drips.wav`,
`amb/amb_torch_old.wav` (×2), `amb/quest1.wav`, `monsters/scream/battlecry.wav`.

### Las puertas: una sola

Las nueve traen `movesnd 9`, que en `doors.cpp:340+` es una tabla de índice a
nombre: **`doors/doormove9.wav`**. Un solo sonido para las nueve.

### Los pasos, y la sorpresa

`PM_UpdateStepSound` (`pm_shared.cpp:711`) es una regla completa y portable, y
sus números no se adivinan:

| | andando | corriendo |
| --- | --- | --- |
| umbral de velocidad | 120 u/s | 210 u/s |
| entre paso y paso | 400 ms | 300 ms |
| volumen (piedra) | 0,20 | 0,50 |
| volumen (tierra) | 0,25 | 0,55 |

Agachado o en escalera los umbrales bajan a 60 y 80. La escalera suena cada
350 ms a 0,35. El agua tiene **dos** sonidos según por dónde llegue: con la
RODILLA dentro es `WADE` (600 ms, 0,65) y sólo con los pies es `SLOSH`. Los pies
alternan de verdad: `irand = rnd(0,1) + 2·iStepLeft`, cuatro muestras.

Y una línea que cambia el resultado entero:

```cpp
if (pmove->multiplayer && (!g_onladder && Length(hvel) <= 220)) return;
```

**En multijugador no hay pasos por debajo de 220 u/s.** Andar es mudo; sólo
suena correr. Como esto es multijugador, ésa es la regla que toca.

#### Y de qué suena cada suelo: casi todo suena a piedra

`sound/materials.txt` mapea nombre de textura (12 caracteres) a una letra:
`D` tierra, `T` madera, `V` hierba, `G` rejilla… Declara **46 texturas en
total**, y de las **90 de Gate City coinciden 2**.

| | triángulos |
| --- | --- |
| piedra (por defecto) | 37 913 |
| tierra | 3 389 |
| hierba | 192 |

O sea que **el 91 % del mapa suena a piedra**, y eso incluye los dieciséis
`wood_*` del suelo de la taberna: `materials.txt` declara `ms_wood01..04` y
`ms_plank01..02`, que no son las que usó este mapeador. **En el juego original,
el suelo de madera de la taberna suena a piedra.** Reproducirlo fielmente es
copiar eso, no «mejorarlo» — igual que los helechos que se atraviesan.

---

## 3. Los archivos: por qué no viajan

La regla de casa es «ningún asset entra sin licencia al lado». Aquí no hace
falta ni invocarla, porque hay algo más concreto.

`assets/msr/music/` tiene **101 mp3**, y entre ellos:

```
d2-cav.mp3   d2-leoric.mp3   d2tombs.mp3      ← Diablo II (Matt Uelmen, Blizzard)
bms-06-end_credits.mp3                        ← Black Mesa
```

El mod **no tiene los derechos de su propia carpeta de música**. Así que el
argumento cómodo —«es un mod gratuito, se puede redistribuir»— no se sostiene:
lo que redistribuiríamos no es del mod. Y de las cuatro que pide Gate City no
podemos verificar quién las escribió; el vecindario en el que están no invita a
suponerlo.

Lo mismo, más pequeño, con los pasos: `PM_PlayStepSound` no llama a sonidos del
mod, llama a `player/pl_step1.wav` — **de Valve**, del Half-Life base.

---

## 3b. Y entonces se hizo, y la evaluación se quedó corta en un punto

> «tomemoslos para almenos verificar si funcionan los sonidos, entonces luego
> evaluamos con que se reemplazan porque ahora no tenemos nada»

Hecho, con la misma postura que las texturas y los modelos: `npm run sonido`
copia de la instalación de al lado a **`build/`, que está en `.gitignore`**, y
no se mueve un byte a `public/`. Queda declarado en `PROCEDENCIA.md`, y lo
escribe el propio extractor porque el horneado del mapa **reescribe ese
archivo**: una nota puesta a mano desaparecía en el siguiente `npm run
gatecity` sin que nadie se enterara.

**620 comprobaciones en verde y 20 de 20 controles de sonido**, más los 25 del
mapa, 31 del ciclo, 19 de física y 29 del cuerpo intactos.

### El punto en el que la evaluación se quedó corta

Dije «los archivos están y no pueden viajar». La mitad es falsa: **la mitad que
más importa no está.** `gameinfo.txt` dice `basedir "msr"` —Rebirth es
standalone, no hay `valve/` detrás— y entre sus 1 570 wav **no están**
`pl_step*` (piedra), `pl_dirt*`, `pl_slosh*`/`pl_wade*` (agua), `pl_metal*`,
`pl_grate*` ni `doors/doormove*`. No es que no los tengamos: **no los tiene el
juego.**

Sí están, y son justo cuatro: `pl_duct*`, `pl_tile*`, `pl_ladder*` y
`pl_snow*`. Y eso tiene una explicación bonita: **las letras de `materials.txt`
no significan lo que dice su cabecera.** Dice «T = Wood, V = Grass», pero
`pm_materials.h` mantiene las de Half-Life, donde `'T'` es `CHAR_TEX_TILE` y
`'V'` es `CHAR_TEX_VENT`. MSR no cambió el código: **reemplazó los archivos.**
Por eso los dos que trae son los dos que reutilizó, y por eso quien lea sólo la
cabecera busca un `pl_grass*.wav` que no existe.

Y `pl_ladder1..4.wav` sí están, y son **110 bytes de datos a 11 025 Hz: diez
milisegundos.** Silencio con forma de archivo. Un extractor que pregunte
«¿existe?» diría que la escalera suena, así que se mide la duración.

Resultado medido: **de Gate City va a sonar el 0,5 % del suelo pisable** —los
192 triángulos de hierba— porque piedra (37 913) y tierra (3 389) piden
archivos que no están. Lo que sí suena entero es la música, las antorchas y la
localización.

### Un umbral del motor que no filtra nada

Escribí la regla con `velwalk` (120 u/s) como umbral y habría dejado mudo un
tramo que en el motor suena. La condición de `pm_shared.cpp:757` es

```cpp
(speed >= velwalk || pmove->flTimeStepSound == 0)
```

pero la función ha vuelto en su tercera línea si el reloj no estaba a cero, así
que ahí `flTimeStepSound` **vale cero siempre** y el segundo término es verdad
siempre. De los dos números, el único que decide es `velrun`: separa andar de
correr, o sea volumen e intervalo. Filtrar, filtra el corte de 220 de
multijugador. Hay una prueba para cada mitad.

### Dos controles que no comprobaban nada

Los dos los cazó la sonda y los dos tenían la forma de siempre:

1. **«el trazo al suelo devuelve materiales distintos»** daba `piedra` las
   cuarenta veces, y no porque el mapa sea de piedra: la sonda soltaba al
   jugador a la altura del **techo** y el trazo del motor son 64 unidades. Medía
   el `default:` del `switch`. Ahora se pregunta encima de una cara de la que se
   sabe la textura, y una **sin declarar** tiene que dar piedra —que es lo que
   pasa en el juego original con el suelo de la taberna.
2. **«ningún archivo da 404»** estaba verde con un archivo que no existía: el
   servidor de desarrollo devuelve `index.html` con **estado 200**, así que el
   que falta llega como una página web y el único que se entera es el
   decodificador. Ahora se mira el tipo de contenido y no se pide lo que el
   catálogo ya dice que no está.

### Lo que se puede tocar

```
npm run sonido        copia lo que hay y escribe el catálogo con lo que falta
npm run sonda:sonido  20 controles: el gesto, el material, la música, la puerta
```

---

## 4. La propuesta

Tres piezas, y la de en medio es la única con problema.

**a) La regla — nuestra, y es lo que tiene contenido técnico.** Un
`src/play/sonido.js` que porte `PM_UpdateStepSound` con sus números, la
alternancia de pies, el corte de 220 u/s, `WADE` contra `SLOSH` por la rodilla,
y la lectura de `materials.txt` como tabla (leer un mapeo es leer datos, igual
que `global.script`). Se prueba sin un solo byte de audio: *¿cuántos pasos en
diez segundos corriendo?*, *¿cambia a chapoteo al entrar en el estanque?* — con
un contador de disparos, no con un micrófono. Eso vale para `npm test`.

**b) El motor de reproducción — nuestro, y el navegador pone sus reglas.** Web
Audio: un `AudioContext`, que **hay que despertar con un gesto del usuario** —
ningún navegador deja sonar antes, así que el primer clic del menú es el sitio.
Un `PannerNode` por sonido de mundo con la atenuación de `ATTN_NORM`, y la
música en un `GainNode` aparte con su fundido, porque `AllMusic.clear()` es un
corte y un corte seco se oye como un fallo.

**c) Los archivos — hechos, en `build/` y ni uno en `public/`.** El catálogo es
un mapa de *nombres* a *archivos*, y quien no tiene archivo se declara. Para
publicar quedan tres caminos, y no hace falta elegir todavía:

1. **Silencio declarado.** El catálogo ya lo hace: la regla corre, el registro
   dice qué pidió, y no suena. Es cero trabajo de licencia.
2. **Sonido propio o de licencia libre.** Y aquí el trabajo es **más pequeño de
   lo que parecía**, porque los que faltan faltan también en el juego: ocho
   muestras de pasos (piedra y tierra), el chapoteo, el chirrido de la puerta y
   el goteo. Once sonidos cortos, no una banda sonora.
3. **La carpeta del jugador**, para quien tenga el mod: un selector de
   directorio local, los archivos nunca salen de su máquina.

La música original queda fuera de las tres, y conviene decirlo sin rodeos en
`CREDITOS.md`: **Gate City se publicará sin su música, a propósito.**

---

## 5. Orden que propongo

Lo siguiente sigue siendo **el comportamiento de los NPC**, que es lo que quedó
pedido y donde caen los 5 `trigger_once` con sus generadores.

Lo de reemplazar el sonido no corre prisa y ahora se sabe cuánto es: **once
muestras cortas**, no una biblioteca. Y hay una que es gratis — `pl_ladder*`
son diez milisegundos de silencio a propósito, así que la escalera ya está
«reemplazada» por el propio mod.
