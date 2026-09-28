# 29 · El kit de VGUI, y el menú de la F

> «después cambiar los paneles que hicimos que no son vgui del juego (creación de
> personaje, inventario, panel de skills/stats, interacción con npcs con la tecla
> f, etc), eso fue una mala decisión, debimos haber portado los de vgui y luego
> expandir sobre eso si es necesario, los reemplazamos directamente y ahora no
> combinan con el juego y como son externos no hay teclas para manejarlos
> nativamente»

Tenías razón en las dos mitades, y la segunda es la que más costaba ver.

---

## 1. Qué estaba mal, medido

`src/juego/interfaz.js` son 899 líneas de clases `mx-*` que se inventaron desde
cero. El HUD (`src/juego/hudms.js`) y el menú principal (`src/juego/menums.js`)
**no**: ésos leen `640_textscheme.txt`, usan `XRES`/`YRES` y la fuente Sitka del
esquema. Media pantalla era un porte y la otra media era una página web encima.

Y lo de las teclas era literal:

```js
addEventListener("keydown", (e) => {
  if (e.code === "Escape" && velo) { cerrar(); return; }
                                       src/juego/interfaz.js:874
```

Un escuchador propio en la ventana, por fuera de `src/juego/teclas.js`. Así que
esas pantallas no tenían tecla que se pudiera reasignar, no respetaban el
`config.cfg` del juego y no había forma de que el `1` eligiera una opción.

En Master Sword eso no lo decide el panel. Lo decide el viewport, en un sitio:

```cpp
if (!down) return 1;
if (m_pCurrentMenu && m_pCurrentMenu->m_Flags & MENUFLAG_TRAPNUMINPUT) { ... }
if (m_pCurrentMenu && m_pCurrentMenu->m_Flags & MENUFLAG_CLOSEONESC) { ... }
                              vgui_teamfortressviewport.cpp:1875-1911
```

---

## 2. El kit: `src/vgui/`

| archivo | qué es | de dónde |
| --- | --- | --- |
| `esquema.js` | la fuente y los colores por nombre de esquema | `vgui_schememanager.cpp` |
| `widgets.js` | `Panel`, `CTransparentPanel`, `LineBorder`, `MSLabel`, `MSButton` | `vgui_mscontrols.h` |
| `registro.js` | el registro de paneles y el reparto de teclas | `vgui_teamfortressviewport.cpp` |
| `menubase.js` | la ventanita con título, separador y botones | `vgui_menubase.cpp` |
| `interactuar.js` | el menú de la F | `vgui_menu_interact.h` |

Y dos extractores nuevos: `npm run vgui` (los cuatro `*_textscheme.txt` a
`build/gatecity/vgui.json`) y `npm run menus` (los bloques
`game_menu_getoptions` de los 25 scripts de Gate City a `menus.json`).

### El alfa al revés, y la prueba de que es al revés

`COLOR(r,g,b,a)` de VGUI usa el cuarto número como **transparencia**: 255 es
invisible y 0 es opaco. Eso ya estaba escrito en `paleta.js` desde el 13. Lo que
no estaba es que **`m_iTransparency` va igual**, y con una vuelta más:

- con `0` no se dibuja nada (`if (m_iTransparency)`), o sea invisible;
- con `255` sí se dibuja, pero negro con alfa 255 es transparente: invisible
  también, por otro camino;
- `128` es el medio negro de la ventana.

Y no hace falta abrir el juego para saberlo. Lo dice el desvanecido:

```cpp
m_pMainPanel->m_iTransparency = (InveserdFade / 2 + 128);   // 255 -> 128
                                       vgui_menubase.cpp:207
```

Leído al derecho, eso es un panel que empieza **negro macizo** y se aclara: un
fogonazo negro cada vez que abres un menú. Leído al revés es lo que tiene que
ser, **que el menú entra desde la nada**. La sonda lo mide con dos medidas y no
con una: recién abierto `0.063`, medio segundo después `0.498`, que es
exactamente `(255 − 128) / 255`.

### Tres fallos del motor, portados con el fallo

**1. El último esquema del archivo se queda sin sus valores por defecto.** La
cascada de colores se aplica al leer el `SchemeName` *siguiente*
(`vgui_schememanager.cpp:239-282`) y después del bucle no hay un último volcado
(`:357`). En los cuatro archivos del juego el último esquema es «ID Text», que no
declara `FgColor`: se queda con negro transparente en vez del blanco que le
tocaba. Es el esquema del panel de identificación del objetivo, que está en el
pendiente — o sea que hoy no se ve, y cuando se haga ese panel su letra saldrá
así **en el original también**. La prueba lo enseña comparando el lector con el
fallo y sin él.

**2. `BorderColor` marca la variable de otro color.** `hasMouseDownBgColor = true`
donde tocaba `hasBorderColor` (`:342-346`). Ninguno de los cuatro archivos
declara `BorderColor`, así que hoy no hace nada. Se porta igual y se comprueba.

**3. El botón décimo no se puede elegir con el teclado.** El reparto de los
números es `SlotInput(dígito − 1)` (`:1892-1901`): el `1` da la ranura 0 y el `9`
la 8. El `0` da **−1**, que `SlotInput` rechaza. Y el menú de interacción crea
**diez** botones. Doce líneas más arriba, en el camino del menú del HUD, el mismo
motor sí hace `if (!Num) Num = 10;` — la corrección existe y no se aplicó aquí.
La sonda pulsa el `0` y comprueba que no pasa nada, y que el juego tampoco lo ve.

**Y uno más, de precedencia.** `GetCenteredItemX` dice
`Espacio/2 * Items − 1` donde quería decir `Espacio/2 * (Items − 1)`
(`vgui_choosecharacter.cpp:396`). Con una cosa y sin espacio sale un píxel a la
derecha y no lo ha visto nadie; con varias el error es de medio hueco por cosa, y
sí se vio: MiB escribió en 2014 un `GetCenteredX` correcto para el título del
menú de interacción en vez de arreglar éste. Las dos funciones existen en el
original y cada panel usa la que usa, así que aquí están las dos.

### Un hallazgo de los datos del juego

`Briefing Text` mide **14, 14, 21 y 16** en los archivos de 640, 960, 1440 y
1920. No va en orden: a 1440 px de ancho el texto del cuerpo se ve **más grande**
que a 1920. Están así en los cuatro archivos, no es un error de lectura, y no se
arregla — se lee lo que dice el juego. Queda medido para que el día que una
pantalla se vea con la letra desproporcionada la razón esté escrita.

---

## 3. El menú de la F

La tecla no es una elección: `bind "f" "menu interact"` (`config.cfg:19`,
`kb_def.lst:61`) y su nombre, «Interact with NPC», sale de `kb_act.lst:41`. Ahora
es una acción de `src/juego/teclas.js` como cualquier otra y se reasigna en las
opciones.

Lo que se porta, con lo que tiene de raro:

- **la ventana no está centrada**: va pegada a la derecha, en
  `ScreenWidth − w − XRES(80)`. Medido en pantalla: `x=675` a 1200 px de ancho.
- **y se ensancha al llegar la primera opción**, de 120 a 200
  (`vgui_menu_interact.h:139`). O sea que un NPC sin nada que decir tiene el menú
  estrecho y uno con una sola opción lo tiene ancho.
- **«Cancel» es el último botón y se va moviendo**: cada opción que llega
  reescribe dos botones, así que el número que cancela cambia según el NPC.
- **el nombre del NPC va en la letra pequeña**, y el comentario de Thothie dice
  por qué: «can't figure how title text centers self - so always using small text
  as it looks less odd uncentered». El problema de centrado lo arregló MiB seis
  años después y la línea que pone la letra pequeña se quedó.
- **el armado es rojo y el normal ámbar**, `COLOR(255,0,0,0)` y
  `COLOR(255,178,0,0)`. Lo natural habría sido lo contrario.

### De dónde salen las opciones

Del script del NPC, que es donde están. En Gate City hay **nueve opciones en
cuatro NPC** —el armero, Kendra, el alcalde y el almacenista— y se extraen con
`npm run menus`. No hay intérprete de scripts y no lo pretende: se leen los
bloques `game_menu_getoptions` y se juzgan las cuatro formas de condición que
aparecen de verdad en los 25 archivos.

De las 18 condiciones, `$item_exists(PARAM1, item_x)` **se puede decidir** —hay
inventario— y las variables de misión también, con una salvedad que es honesta:
**aquí no hay misiones**, así que están todas sin poner, que es lo que valen en
una partida recién empezada. Lo que no se sabe decidir viaja con `disabled`, que
es un tipo del propio motor, y el motivo al lado.

Eso último **es una diferencia con el original** y se dice: allí una condición que
no se cumple hace que la opción no se registre, o sea que no existe. Aquí se ve
gris y dice por qué. Es la misma decisión que ya se tomó en el menú principal con
«Visit a Kingdom», y por el mismo motivo: un menú vacío no enseña nada.

### Y un fallo de los scripts del juego

`if` sin llaves guarda **sólo la línea siguiente** —lo confirma el `BUG_AUDIT.md`
del propio mod— y `menuitem.register` **no limpia** `reg.mitem.*`
(`npcscript.cpp:940-1000`). Júntalo con `gatecity/armorer.script:236-241`:

```
if $item_exists(PARAM1,item_ore_lorel)
local reg.mitem.title 	"Show Loreldian Ore"
local reg.mitem.type 	callback
menuitem.register
```

El `if` guarda el título y nada más. Sin el mineral encima, el registro se ejecuta
igual con el título que quedó de la opción anterior: sale **«Ask about broken
axe» dos veces**, y la segunda llama a `say_ore`. Pasa en tres de las nueve
opciones de Gate City. Se marca en el fichero y se porta tal cual.

---

## 4. Lo que se rompió por el camino

**El Escape abría el menú principal encima del panel.** La condición de
`src/main.js` era `if (e.code === "Escape" && !interfaz?.abierta)` y no conocía a
`vgui`. A partir de ahí el `if (menuMs?.abierto) return;` de dos líneas más abajo
se comía todas las teclas: la F no cerraba, el `1` no elegía, nada. **Cuatro
controles en rojo de una vez, todos por esto.** El propio comentario de esa línea
ya decía cuál era el orden correcto.

**Esconder el HUD detrás del panel**, que lo hice yo y estaba mal. `panelAbierto`
apaga el HUD entero, y eso vale para las pantallas de `interfaz` que ocupan toda
la pantalla. Un panel de VGUI no: es una ventanita en una esquina y el HUD sigue
debajo. En Master Sword los dos son paneles de VGUI hermanos y ninguno esconde al
otro.

**Y tres controles de la sonda que estaban en rojo sin que el panel tuviera nada.**
Medí el color a los 400 ms cuando el desvanecido dura 500, así que el ámbar salía
al 93 % de alfa; y esperé una ventana de `XRES(120)` cuando ya había crecido a
`XRES(200)` porque el menú del jugador trae una opción. El panel estaba bien y la
cuenta era mía — que es la mitad de las veces.

---

## 5. Lo que se mide

```
npm test              813 comprobaciones (eran 768 al empezar el 29)
npm run vgui          9 de 9    los cuatro esquemas, con los dos fallos del motor
npm run menus         6 de 6    9 opciones en 4 NPC, y el fallo del `if` sin llaves
npm run sonda:vgui29  30 de 30  la F en un Chrome de verdad
```

La sonda **no llama a `abrir()` en ningún control**, y eso es a propósito: una
puerta `probe.vgui.abrir("interact")` daría todos los controles en verde con la
tecla desconectada, que es exactamente el fallo que este experimento quita. Se
pulsa la F. Y lo mismo con el movimiento: no se mira una bandera, se pulsa la W
1,2 s y se mide cuánto se ha andado — **0,0 cm con el panel y 519,8 cm sin él**,
que es el control positivo sin el cual el primero no dice nada.

Las quince sondas en verde, 453 controles:

```
vgui29 30 · mundo 40 · consecuencias 44 · ranuras 39 · pulido 38 · hud 36
arco 35 · escudo 34 · mapa 30 · cuerpo 29 · golpe 25 · sonido 22 · red 21
ia28 15 · ia 15
```

---

## 6. Lo que NO está hecho

Los otros tres paneles, que son el resto del encargo:

- **30 · crear personaje** (`vgui_choosecharacter.cpp`, 1 457 líneas). Son tres
  etapas y no una pantalla, y los personajes son **modelos 3D en la escena** con
  sus estados de animación, no retratos.
- **31 · el inventario** (`vgui_container.h`). Retira la rejilla inventada de
  `src/juego/inventario.js`: MSR tiene lista de equipo, contenedor con barra de
  desplazamiento y panel de información.
- **32 · Character Info** (`vgui_stats.cpp`). Y es el que usa «ID Text», o sea el
  que se va a encontrar de frente con el fallo número 1 de arriba.

Y del menú de la F, lo que falta y no es poco: **las misiones**. Las opciones se
ven y se pueden pulsar, y lo que contestan es «that is not implemented yet». No
hay `MOT_PAYMENT` que cobre de verdad, ni `MOT_SAY`, ni callbacks de script, ni
tiendas —que son otro panel, `vgui_store.cpp`—. Lo que este experimento entrega
es **el panel y el contrato de entrada**, que es lo que estaba mal.
