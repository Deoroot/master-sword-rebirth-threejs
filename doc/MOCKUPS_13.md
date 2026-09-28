# Los mockups, evaluados — y la primera tanda, hecha

> **HECHO ya** (570 comprobaciones y 31 controles en pantalla, todos en verde):
>
> | | |
> | --- | --- |
> | **El HUD del experimento 03 fuera** | escondido, **F3** lo enseña. No borrado: las sondas lo leen |
> | **El volcado técnico fuera** | los 41 650 triángulos y los 25 atlas se van a `console.info` |
> | **La paleta de Master Sword** | leída de `vgui_container.cpp`, `vgui_stats.cpp` y `vgui_choosecharacter.cpp` |
> | **El mapa se carga DESPUÉS de elegir** | y en paralelo: la pantalla sale a los **231 ms**, el mapa a los 1 733 |
> | **El texto de desarrollador fuera** | las fórmulas al `title`, el «% de la rejilla» y las notas de método, quitados |
> | **El aviso de guardado en una línea** | con botón **proteger**, que llama a `navigator.storage.persist()` |
>
> **La paleta y la mejora, medidas.** MSR pinta sus paneles sin fondo
> (`setBgColor(0,0,0,255)`, y en VGUI el alfa está al revés: 255 es
> invisible). Por eso en su propia captura «Heavy Weapon Holster» compite con
> la piedra. Nosotros ponemos el mismo negro **al 88 %**, y el contraste del
> texto pasa de esto:
>
> | | peor caso | oscila |
> | --- | --- | --- |
> | Master Sword, sin fondo | **1,19** — invisible bajo un farol | de 10,16 a 1,19 |
> | el nuestro | **3,09** | 9,83 – 11,16 |
>
> Lo que más importa es la segunda columna: **deja de depender de hacia dónde
> mires.** Está fijado en `test/juego_paleta.test.mjs`, con su control — si
> alguien lee el alfa de VGUI como CSS, los paneles salen negros macizos donde
> el juego los tiene invisibles, y eso no da error.
>
> Y se dice lo que no llega: `Color_TextNormal = (100,100,100)` da **3,1** aun
> con fondo, y WCAG pide 4,5. **No se cambia** —es el color del juego— pero
> queda escrito y sólo se usa para notas y detalles.
>
> Lo que sigue: el modelo del personaje en pantalla, y la hoja con el patrón
> maestro-detalle. Los pasos 1 y 2 de §6.

---

# La evaluación

> Qué tomaría, qué cambiaría y qué no. Con lo que he podido comprobar contra
> el motor marcado como tal, y lo inventado marcado como inventado — que es
> justo la distinción que este proyecto lleva doce experimentos cuidando.

**Resumen: tomaría casi todo.** Son mejores que lo que tengo puesto, y en tres
sitios son mejores que MSR. Hay **cuatro cosas** que corregiría porque afirman
del motor algo que el motor no hace, y **una** que hay que rehacer entera
porque el mockup y yo estábamos equivocados de formas distintas.

---

## 0. El fallo que reportaste: arreglado, y era peor de lo que parecía

No es que «no dejara usar WASD». Es que **cada letra del nombre llegaba
también a las perillas del visor**:

| tecleas | pasaba |
| --- | --- |
| **K**endra | te MATABA |
| **T**heobold | te teletransportaba a otro pueblo |
| **R**oland | te devolvía a la cueva del principio |
| **O** / **L** | cambiaba el paseo de los bichos y el glow |

`main.js` hacía `keys.add(e.code)` sin preguntar dónde estabas escribiendo.
La guarda que sí existía cubría las acciones de juego y no las perillas.

Arreglado, y con dos reglas en vez de una: **escribiendo no pasa nada al
juego**, y **con un panel delante tampoco corren las perillas** (con el
inventario abierto, la I no debería teletransportar a nadie). La guarda cubre
`input`, `textarea` y `contenteditable` — con sólo `HTMLInputElement`, que era
lo que había, un área de texto se cuela.

Está fijado en la sonda con un nombre escrito a mala idea: se teclea
**«KendraTheobold ORL»** y se exige que llegue entero y que el jugador no se
mueva ni un centímetro ni cambie de estado. **26 de 26 controles en verde.**

---

## 1. Tu observación de fondo, y es la mejor de las tres

> «en el juego real no hay gráficos autogenerados. todo se hace con texto o
> con el modelo del personaje actual. eso faltaría implementar no?»

> **CORRECCIÓN (hecho en [CUERPO_14.md](CUERPO_14.md)): los dos modelos que digo
> aquí son los equivocados.** El que carga la pantalla es
> `models/human/reference.mdl` (`MODEL_HUMAN_REF`), y no es intercambiable:
> **`male1.mdl` no trae `attention` ni `stretch`**, dos de las seis animaciones
> que la pantalla pide por nombre. Y `female1.mdl` **el juego no lo abre nunca** —
> `MODEL_HUMAN_FEMALE1` apunta a `male1.mdl`—, porque el género no es un archivo:
> es un submodelo, `SetBody(0..3, 1)` o `2`. Lo de abajo se deja tal cual se
> escribió; el detalle está en el documento 14.

**Sí, y ya tenemos todas las piezas.** Esto lo he comprobado ahora mismo:

```
models/human/male1/male1.mdl      29 huesos · 58 secuencias · 4 texturas · 1 bodypart
models/human/female1/female1.mdl  51 huesos · 45 secuencias · 7 texturas · 4 bodyparts
```

Los dos los lee nuestro `src/bsp/mdl.js` sin tocar una línea, y su control
—`length` de la cabecera contra el tamaño del fichero— pasa en los dos. Y ya
dibujamos 69 modelos animados en pantalla con `SkinnedMesh`.

O sea que **el retrato de la tarjeta, la vista previa de la creación y el
muñeco del inventario pueden ser el modelo de verdad**, no una silueta SVG.
Es una escena de Three.js de 200×300 con una cámara y una luz. Y la elección
Male/Female del original deja de ser un texto: **cambia el modelo**, que es
exactamente lo que hace MSR en tu segunda captura.

Los iconos de objeto son otra historia y conviene separarla. **MSR no tiene
iconos 2D de objetos**: tiene modelos `.mdl` (`w_` de mundo, `p_` de mano).
Así que un «icono» aquí sería una miniatura renderizada de su `.mdl`. Se
puede, con lo que ya hay, pero son 178 armas y 760 objetos: es un paso
aparte, y hasta que esté, **texto**, que es lo que hace el original.

**Los emoji de los mockups: fuera.** Lo dicen los propios mockups
(«marcadores, sustituir por sprites del juego») y además se ven distintos en
cada sistema operativo.

---

## 2. Hoja de personaje — tomo casi todo

### Tomo

| | por qué |
| --- | --- |
| **Overlay compacto en vez de pantalla completa** | se ve el mundo detrás; mejor que lo mío y que MSR |
| **Maestro-detalle**: sólo se expande la habilidad elegida | hoy pinto 9 habilidades × sus propiedades = **27 barras a la vez**. Es un muro |
| **`faltan N`** además del porcentaje | MSR no te dice nada. Esto es mejor que el original |
| **Fórmulas al tooltip** | ver abajo |
| **Atributos en rejilla 3×2 con abreviaturas** | ocupa un tercio y se lee igual |

### El texto de desarrollador: tienes toda la razón

Mis paneles están llenos de cosas como *«Las fórmulas son del motor:
MaxHP = 5 + (STR−1)·7…»* y *«Parry tiene una sola propiedad y Spell Casting
tiene cinco»*. **Eso son notas mías, no interfaz de juego.** Las escribí para
dejar constancia de lo que se había averiguado y se quedaron donde no tocaba.
Al tooltip, y el panel se queda limpio.

### Cambio

- **«Humano aventurero» → fuera la clase.** En Master Sword **no hay clases**:
  el motor escribe «Human» a fuego y lo marca `LEGACY`. Poner «aventurero»
  inventa un sistema que no existe, y en un proyecto que se ha pasado doce
  experimentos distinguiendo lo leído de lo supuesto, eso no puede entrar.
  Se queda el nombre y el género.
- **Los grupos (CUERPO A CUERPO / A DISTANCIA / MAGIA / DEFENSA) son
  NUESTROS.** `SkillStatList[9]` es una lista plana. Me parece una mejora
  clara —nueve habilidades sueltas no tienen forma— pero va marcada como
  nuestra, igual que la rejilla lo estaba.

---

## 3. Inventario — aquí el mockup acierta en lo grande y falla en lo concreto. Y yo fallaba más

### El mockup tiene razón contra mí

Escribí en `src/juego/inventario.js`:

> *La rejilla es **nuestra**, y es la primera decisión de este proyecto que se
> aparta del original a propósito.*

Y el mockup contesta: *«El motor no tiene casillas: tiene DOS MANOS y
CONTENEDORES.»* **Es cierto, y lo he comprobado:**

```
NUM_MAX_ITEMS 100          server/player/player.h:26
MAX_PLAYER_HANDS 2         server/player/player.h:128
packdata_t { MaxItems, AcceptItemsTypes, RejectItemsTypes, ItemList }
Container_CanAcceptItem()  shared/weapons/gipack.cpp:247
```

Así que la rejilla global de 10×6 se va. Y con ella se van mis **bandas de
huella** (1×1, 1×2, 2×2…), que ya había marcado como flojas — las vainas
salían de 3×3 y quedaba ridículo.

### Pero el mockup se equivoca en dos cosas, y las dos importan

**Primera: la capacidad de un contenedor NO se mide en `size`.** El mockup
dice *«rejilla con tantas celdas como su CAPACIDAD (campo size del motor);
cada objeto ocupa `size` celdas»*. El motor dice:

```cpp
PackData->MaxItems = atof(GetFirstScriptVar("reg.container.maxitem"));
```

Es un **número de objetos**, no una suma de tamaños. Y `size` **no se suma en
ningún sitio** de `gipack.cpp`. O sea que los dos estábamos usando `size`
para algo que no hace: yo para el tamaño de la huella, el mockup para las
celdas.

La regla buena es más simple y más fácil de dibujar: **tantas casillas como
`reg.container.maxitem`, un objeto por casilla.** Sigue siendo la cuadrícula
tipo Diablo que quieres, con la regla del original.

Y la aceptación tampoco es por tipo: es **coincidencia de subcadena en el
nombre del objeto** (`strstr(pItem->ItemName, AcceptItemsTypes[i])`), con
rechazos que un acepto puede anular. Eso explica por qué una vaina de daga
acepta «daga» y no «espada».

**Segunda: las ranuras anatómicas están INVENTADAS.** El mockup dibuja
espalda ×2, cinturón y cadera. En el motor:

```cpp
ITEMPOS_NONE, ITEMPOS_HANDS,
ITEMPOS_BODY,   //Somewhere on the body (head/back/arms/hands/legs/etc.)
/* ITEMPOS_BACK, SIDE, BELT, HEAD, CHEST, ARMS, LEGS, SHOULDER, HIP */  ← COMENTADO
```

Hay **dos manos y «el cuerpo», que es un solo sitio sin diferenciar**. Las
nueve posiciones están escritas y comentadas: alguien las quiso y no las hizo.

**No digo que no las hagamos.** Es una mejora buena y es justo lo que pediste
—mejorar sobre MSR— y encaja con el muñeco. Digo que **va marcada como
nuestra**, y que conviene saber que al ponerlas estamos terminando algo que el
mod dejó a medias, no copiándolo.

### Y tu indicación de colocación

> «en el inventario en el centro iría el personaje y abajo estaría la
> cuadrícula»

Eso es exactamente el mockup, y con el modelo real en vez de la silueta. De
acuerdo.

### Tomo

Muñeco con las dos manos, contenedores como ranuras, panel de detalle a la
derecha, cuadrícula del contenedor abajo, barra de carga que cambia de color,
doble clic para envainar/desenvainar, arrastrar y soltar con el motivo del
rechazo escrito («La vaina de daga solo acepta dagas»).

**Arrastrar y soltar es el trozo grande** y lo haría en su propio paso.

---

## 4. Selección y creación de personaje — lo que más cerca está de poder hacerse ya

### Tomo, y con respaldo del motor

- **Tres ranuras.** `#define MAX_CHARSLOTS 3` — *«Max number of characters one
  person can have»*. Tu captura lo enseña: un personaje y dos «Create New».
  Las tarjetas vacías del mockup son literalmente eso.
- **Ubicación en la tarjeta** («En Edana»). MSR pone «At Edana» debajo del
  nombre. Es del original y lo tenemos: el personaje ya guarda `mapa`.
- **Borrar exige escribir el nombre.** En MSR «Delete» está a un clic al lado
  de «jugar». Esto es estrictamente mejor.
- **La línea de almacenamiento en UNA línea con botón [Proteger].** Hoy tengo
  un párrafo de cuatro líneas avisando de que el navegador puede borrarte el
  personaje. Un párrafo que nadie lee no avisa de nada, así que mi propio
  aviso se estaba saboteando. Una línea y un botón que llama a
  `navigator.storage.persist()` — que ya está implementado en
  `almacen.js:81` y hoy sólo se consulta, no se ofrece.
- **Creación en UNA pantalla** con validación en línea y Enter = crear.
- **El detalle del arma**: nombre, daño, tipo de daño y habilidad que entrena.
  **Esto es mejor que MSR, donde eliges a ciegas**, y los datos ya están en
  `build/msr/objetos.json` (178 armas con daño, tipo y habilidad).

### Cambio uno

**«ATRIBUTOS QUE HACE CRECER» no tiene que ser una tabla de ejemplo.** El
mockup lo marca honestamente como `SKILL_GROWS ← EJEMPLO, sustituir por la
tabla real`. No hace falta sustituir a mano: **se calcula exacto**. Los pesos
están en `CMSMonster::GetStat()` y ya los tenemos traducidos en
`src/juego/stats.js`:

```
strength = (sw·1,5 + ma + ax·2,0 + bl·1,9 + po·0,8 + sa·0,5 + ar·0,6) / 4
agility  = (sw·0,6 + ma + ax·0,6 + bl·0,6 + sa·0,6 + po·2,0 + ar·1,5) / 6
…
```

Así que «con qué crece Swordsmanship» es leer una columna: Fuerza 1,5/4,
Agilidad 0,6/6, Percepción 0,5/7, Forma 1/5. Ordenado por peso, sale la lista
de verdad y no una plausible.

### Y la pregunta que el mockup deja abierta y hay que decidir

El mockup pone estas pantallas **sobre el mapa renderizado**, que es lo que
hacemos hoy — y es de donde salió tu fallo. MSR no hace eso: tiene un menú
principal con su propio fondo, y el mapa se carga **después** de elegir.

Mi recomendación: **cargar el mapa después**. No por el fallo, que ya está
arreglado, sino porque el mapa tarda en cargar y hoy esperas a que termine
para poder elegir personaje. Elegir primero es también empezar antes.

---

## 5. Lo que NO tomaría

| | por qué |
| --- | --- |
| «Clase: Aventurero» | no existe en Master Sword |
| Emoji como arte final | lo dicen los propios mockups; y se ven distintos en cada sistema |
| `size` como celdas de contenedor | el motor limita por `reg.container.maxitem`, un recuento |
| Ranuras anatómicas **sin marcarlas como nuestras** | están comentadas en el motor: las hacemos nosotros |
| Los grupos de habilidades **sin marcarlos** | `SkillStatList[9]` es plano |
| Silueta SVG para el muñeco | teniendo `male1.mdl` y `female1.mdl` leídos, sería peor a propósito |

---

## 6. El orden que propongo

1. **El modelo del personaje en pantalla.** Una vista de Three.js reutilizable
   con `male1.mdl` / `female1.mdl`, que sirve para los tres sitios: tarjeta,
   creación e inventario. Es la pieza que desbloquea las otras dos y la que
   contesta tu observación.
2. **Rehacer la hoja** con el patrón maestro-detalle, sin texto de
   desarrollador, con los atributos que crece cada arma **calculados**.
3. **Menú principal de verdad**, con la selección de personaje antes de cargar
   el mapa, y las opciones de teclas que ya existen colgando de él.
4. **Inventario con contenedores**, primero sin arrastrar (clic y doble clic),
   y con `reg.container.maxitem` sacado de los scripts — que hoy
   `tools/objetos.mjs` **no extrae** y habrá que añadir.
5. **Arrastrar y soltar**, con el motivo del rechazo escrito.
6. Y en algún momento, **miniaturas de `.mdl` para los objetos**. Hasta
   entonces, texto, que es lo que hace el original.

Los pasos 1 y 2 caben en una sesión. El 4 depende de extender el extractor de
objetos, y eso se puede medir antes de empezar.
