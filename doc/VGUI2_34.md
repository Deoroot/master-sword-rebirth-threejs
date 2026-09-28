# 34 · Las ventanas de Valve

**Qué se pidió:** que el menú principal —escoger servidores y las opciones—
dejara de ser un panel web y tuviera el aspecto del juego. Textualmente:
*«entiendo que hicimos nuestro propio panel externo de opciones pero no combina
con el juego, quisiera saber si podríamos replicar el vgui por defecto de valve
para esas opciones»*, y después: *«seria mas caro pero es mejor que todo este
dentro del juego»*.

**Estado:** las dos ventanas existen, se manejan con el ratón y el teclado, y
salen con la letra, los colores y el bisel que el mod trae en sus archivos.
**971 pruebas de Node y 26 de 26 en la sonda**, `vite build` limpio, el resto de
sondas sin tocar.

---

## 1. El hallazgo que cambió el encargo

**Esas ventanas no son el VGUI del mod.** En la pantalla del juego conviven dos
sistemas de interfaz, y la captura del menú principal los enseña a la vez:

| | VGUI1 | VGUI2 |
| --- | --- | --- |
| qué dibuja | los paneles del mod: hoja de personaje, inventario, menú de la F | las ventanas de Valve: «Options», «Servers», «Create Server» |
| letra | Sitka | Verdana / Tahoma |
| esquema | `*_textscheme.txt` | `resource/TrackerScheme.res` |
| el alfa | **invertido**: 255 es invisible | **normal**: 255 es opaco |
| aquí | `src/vgui/`, experimento 29 | `src/vgui2/`, esto |

Así que no era «replicar el VGUI»: era portar un **segundo** sistema, al lado
del que ya había. Van en carpetas distintas y con fichas distintas a propósito,
porque si heredaran colores el uno del otro se repetiría el defecto que el 29
arregló en su terreno.

### Xash3D no tiene reimplementación de VGUI2

Se comprobó antes de escribir nada. `../MSC/vgui-dev-*/include/` es
`VGUI_Frame.h`, `VGUI_Button.h`, `VGUI_Border.h`: **VGUI1**, el que ya usaba el
29. Y `xash3d-fwgs-sdk/3rdparty/mainui/` es el menú propio de Xash —otro aspecto
y GPL-2—, que sirve para saber qué cvar hay detrás de cada control y nada más.

El parecido de familia está en `vgui2/vgui_controls/` del **Source SDK 2013**,
que es el descendiente directo de este VGUI2 y lee el mismo formato de esquema.
Se usa como referencia de comportamiento; no se copia código.

---

## 2. Lo que sí había, y no me lo esperaba

El mod trae su propio esquema y sus propias cadenas:

| archivo | qué sale | cuánto |
| --- | --- | --- |
| `resource/TrackerScheme.res` | colores, ajustes base, fuentes y bordes | 30 colores, 43 ajustes, 9 fuentes (18 variantes), 11 bordes y 7 alias |
| `resource/gameui_english.txt` | las cadenas de la interfaz, en UTF-16 | 241 |

Lo hornea `npm run vgui2` a `build/gatecity/vgui2.json`. **No se versiona** y su
procedencia queda escrita en `build/gatecity/PROCEDENCIA.md`, como el resto.

Tres cosas del esquema que hacen el aspecto y no se habrían adivinado:

- **`"TitleBG" "206 206 206 0"`** — la barra de título es transparente. Poner una
  banda gris es lo que delata una imitación, y el alfa de VGUI2 va al derecho:
  en la captura no hay banda y el texto de las listas se lee.
- **El número de la línea de un borde es su GROSOR, no su orden.**
  `TitleButtonBorder` tiene su lado de arriba en la clave `"4"`: cuatro píxeles.
  Leerlo como un orden deja el marco en uno y la ventana pierde la cara.
- **`InGameDesktop`** trae `MenuItemHeight 28`, `GameMenuInset 32` y
  `MenuItemVisibilityRate 0.03`: son las medidas del **menú principal**, que
  `src/juego/menums.js` puede tener a ojo. Queda apuntado para el 29.

### El esquema pasó por Natural Selection

Lo dicen sus propios comentarios (`//swapping 0 170 255 for 196 220 255`) y un
resto que se quedó dentro: `// from kTeamColors in AvHSharedUtil.cpp`, que es de
Natural Selection. No cambia lo que hay que portar, pero explica por qué el
esquema trae `BuddyButton` y `Chat`, que son de la lista de amigos de Steam.

---

## 3. Lo que NO se pudo leer, y se dice en vez de disimularlo

**La disposición.** El código de `GameUI.dll` no es público y en GoldSrc estas
ventanas no se colocan con un `.res`: se construyen en C++. Así que:

- los colores, la letra, los bordes y las cadenas **son hechos con su archivo**;
- **dónde va cada control está medido de las capturas** del 27 de septiembre.

Todo número de `src/vgui2/widgets.js` que no venga del esquema lleva `// medido`
al lado, y eso quiere decir «de una captura», no «de una línea de código». Es la
primera vez en este proyecto que una parte entera se mide en vez de leerse, y
por eso va dicho aquí arriba y no en una nota al pie.

---

## 4. Lo que funciona, contado

De los **treinta controles** de las capturas, **ocho hacen algo**. La cuenta la
calcula `cuenta()` en `src/play/ajustes.js` y no está escrita a mano en ningún
sitio, para que no se quede vieja cuando uno de los veintidós se encienda.

| pestaña | controles | vivos |
| --- | --- | --- |
| Multiplayer | 4 | 1 |
| **Keyboard** | 1 | **1** |
| Mouse | 8 | 3 |
| Audio | 3 | 1 |
| Video | 10 | 2 |
| Voice | 3 | 0 |
| Lock | 1 | 0 |
| | **30** | **8** |

Los veintidós apagados **se ven, se pueden señalar y dicen por qué**, que es lo
que ya hace el menú principal con «Visit a Kingdom». Esconderlos daría una
ventana más limpia, menos parecida, y escondería el trabajo que falta. Hay una
prueba que exige que ningún apagado se calle el motivo.

### Los valores por defecto salen del `config.cfg`

La misma regla que trajo las teclas y que salvó la iluminación. El que lo
demuestra es la sensibilidad: `sensitivity "10"` en el archivo y `10.0` escrito
en la cajita de la captura. Que coincidan es lo que prueba que la escala
0.20–20.00, **que sí está medida de la captura**, es la buena.

Hay una prueba que recorre todos los ajustes y exige que la línea que declaran
esté en el `config.cfg` de verdad.

---

## 5. El fallo que encontró la sonda, y que era de los buenos

**Con el puntero capturado, una ventana encima no recibe ni un clic.**

Mientras el juego tiene el ratón sobre el lienzo (`requestPointerLock`), el
navegador le manda todo el movimiento y todos los clics a ese lienzo, pase lo
que pase por encima. La ventana se ve, se dibuja perfecta y es de adorno.

Cómo salió: los nueve controles de aspecto estaban **en verde** —letra, colores,
bisel, medidas— y el primer clic en una pestaña se quedó colgado en «performing
click action» sin decir por qué. `document.pointerLockElement` era `CANVAS`.

Es el mismo fallo que la otra sesión está arreglando para los paneles de VGUI1,
encontrado por otro camino. Aquí lo suelta `Vgui2` al abrir, y **la sonda no lo
suelta ella**: si lo hiciera para poder pulsar, taparía el fallo y saldría verde.
El control mira `document.pointerLockElement`, no si el clic funciona.

**Y se devuelve al cerrar.** Aquí me equivoqué primero: decidí no devolverlo
porque el navegador sólo concede el puntero dentro de un gesto del usuario. La
otra sesión lo discutió con una cita y con una medida, y tenía razón —

```cpp
if (!m_pCurrentMenu) { IN_ResetMouse(); g_iVisibleMouse = false; }
                                     vgui_teamfortressviewport.cpp:1741-1750
```

— el motor lo devuelve en el mismo fotograma, y los tres caminos por los que se
cierra una ventana (la X, «Cancel»/«OK» y la Escape) **son** gestos del usuario.
No devolverlo deja al jugador sin poder girar hasta que pulse en el mundo.

Va con tres redes, porque esto falla en silencio por definición:

1. **Sólo se devuelve si lo habíamos quitado nosotros.** Si el jugador tenía el
   ratón suelto al abrir, cerrar no se lo puede quitar.
2. **Sólo al cerrar la última.** Con Options encima de Servers, la primera
   Escape no devuelve nada.
3. `puedeCapturar()` lo puede prohibir desde fuera, que es como convive con
   VGUI1: si un panel del mod sigue abierto, el puntero no es de nadie todavía.

Y lo enseñó la propia sonda: el control salió en rojo la primera vez porque una
de las ventanas se había cerrado con un `click()` de guion, que **no** es un
gesto del usuario. Ahora la sonda hace el camino entero de una persona —clic en
el mundo, abrir, Escape— y son tres controles, no uno.

### Y dos más, pequeños

- **La ventana de servidores no sabía cerrarse.** `VentanaServidores` no tenía
  `cerrar()`, así que la Escape se caía con «v.cerrar is not a function» y dejaba
  la ventana abierta. Lo vio el control de la Escape en rojo.
- **La letra de los diálogos no escala, y yo creía que sí.** La sonda pedía 14 px
  y salían 13. `Default` —la de «Options» y «Servers»— no tiene `yres`: mide 13 a
  cualquier resolución, y por eso la ventana ocupa lo mismo en la captura de 1440
  que en la de 800. La que escala por cinco rangos es `EngineFont`, que es la del
  motor. Son dos fuentes del mismo archivo y es fácil confundirlas; hay una
  prueba que las separa.

---

## 6. Enganchado al juego

`src/main.js` quedó libre al final del experimento y las ventanas están dentro:

- **La G abre «Options»** —la acción `opciones` del `config.cfg`— y la sonda la
  pulsa con el teclado del navegador. Ni un control llama a `abrirOpciones()`
  para abrir la primera vez: ésa era la forma de que los veintiséis controles
  salieran verdes sin haber probado que el jugador puede llegar.
- **«Visit a Kingdom» ya abre** la lista de servidores. Estaba apagada con
  «no servers yet»; ahora abre la ventana y es **ella** la que dice que no hay
  ninguno, que es donde el juego lo dice cuando el maestro no contesta. Apagar
  la entrada escondería una ventana que ya está hecha.
- **La pantalla vieja sigue de suplente.** `interfaz.js` se monta a los 231 ms y
  la ventana buena necesita su `.json`; si la ventana está, gana
  (`panelDeOpciones`), y si no, sale la pantalla de una pestaña de antes. Mismo
  trato que las otras tres de VGUI1.
- **El ratón se reparte entre las dos capas** con `puedeCapturar()`, y son dos
  condiciones: que no haya un panel de VGUI1 que se quede el ratón, y que
  `interfaz` no esté abierta —eligiendo personaje o muerto—. Sin la segunda,
  cerrar una ventana durante la pantalla de muerte le quita el ratón a quien
  necesita pulsar un botón.

Lo que queda, por orden:

1. **Arrancar en el menú principal y no en la pantalla de personajes**, que es
   lo que hace el juego. Es lo único de las tres cosas que se pidieron que sigue
   abierto, y vive en `src/main.js`.
2. **Que el servidor de partida del 27 llene la lista.** Hoy «Internet» devuelve
   cero y lo dice; la ventana ya recibe una función `buscar(pestaña)`.
3. **«Create Server»**, la tercera ventana de las capturas, que es el mismo kit.
4. **Los ocho vivos, aplicados de verdad.** La ventana ya los reúne y los
   entrega en `alAplicar`; falta que el brillo y la gamma entren en
   `src/bsp/gamma.js` y que el volumen llegue a `src/play/audio.js`.

---

## 7. Dónde se puede haber medido mal

- **La disposición entera**, que es el §3. Lo medido a ojo de una captura de
  1440×900 puede estar a un píxel de lo que hace el motor, y no hay forma de
  comprobarlo contra una fuente.
- **Las pestañas Voice y Lock no tienen captura.** Sus controles salen de las
  cadenas de `gameui_english.txt` y de lo que hace la misma ventana en otros
  mods de GoldSrc. Es lo más flojo del archivo de ajustes.
- **El icono de la barra de título** es de Steam (`resource/icon_steam`), no del
  mod: no se copia. Se dibuja una marca del mismo tamaño para que el título
  caiga donde cae en la captura.
- **Los símbolos son Marlett**, que es la fuente de símbolos de Windows, y qué
  letra es cada símbolo no está en ningún archivo del mod. Así que la X, la
  flecha, la marca de la casilla y el agarre **se dibujan con CSS** en vez de
  escribir una tabla adivinada como si estuviera leída.
- **La lista de servidores nunca se ha visto con filas**, porque no hay ninguna.
  El ancho de las columnas está medido de una captura con nueve.

---

## Cómo se corre

```bash
npm run vgui2              # hornea build/gatecity/vgui2.json desde TrackerScheme.res
npm test                   # 971 pruebas, 42 de ellas del 34
npm run sonda:vgui2_34     # 26 controles en un Chrome de verdad
```

La captura que deja la sonda es `build/gatecity/vistas/vgui2_34.png`.
