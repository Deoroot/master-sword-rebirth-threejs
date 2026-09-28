# La estructura de carpetas, y por qué es ésta

Esto empezó como el experimento 03 de un laboratorio web —«cargar `plaza.map` en
Three.js y caminarlo»— y a los veintiocho experimentos ya no lo es: es un port de
Gate City de *Master Sword: Rebirth*. Este documento es lo que faltaba al mudarlo
a su propia carpeta: **qué es cada sitio, y a qué carpeta del juego original
corresponde.**

La estructura no se ha inventado para la ocasión ni se ha copiado la de MSR al pie
de la letra. Lo que hay es lo que ya había, porque `src/` llevaba veinte
experimentos partiéndose por el mismo sitio por el que se parte un mod de
Half-Life, y porque los treinta documentos de `doc/` citan estas rutas por su
nombre. Mover carpetas habría invalidado esas citas sin arreglar nada.

---

## El mapa

| aquí | en MSR / Xash3D | qué es |
| --- | --- | --- |
| `src/bsp/` | `engine/`, `common/` | **leer los formatos de Half-Life.** BSP, MDL con sus animaciones, WAD, SPR, TGA, el mapa de luz, los estilos de parpadeo, el árbol de nodos y los scripts de MSR. 14 archivos, 4 727 líneas. Nada de esto dibuja: devuelve datos. |
| `src/play/` | `game/shared/` | **la regla.** Sin DOM y sin Three: el mismo archivo corre en el navegador y en el servidor de Node. Es la carpeta que hizo posible el experimento 28. 19 archivos, 6 641 líneas. |
| `src/render/` | `game/client/` | **lo que dibuja.** La escena, el cuerpo, el arma, el muñeco, los bichos, las flechas, el atlas de texturas. 10 archivos, 3 532 líneas. |
| `src/juego/` | `game/client/ui/` | **la interfaz, las teclas, el guardado y la sesión.** 11 archivos, 3 654 líneas. |
| `src/vgui/` | `game/client/ui/ms/` | **los paneles del juego.** Aún no existe: es lo que viene ahora (ver abajo). |
| `src/red/` | `game/server/` + `common/` | **la partida, la fauna, el protocolo y el socket.** El servidor de verdad y el cliente que habla con él. 11 archivos, 3 253 líneas. |
| `src/dev/` | — | **la sonda.** `window.probe`, por la que las sondas de navegador miden el juego. 2 094 líneas, y es nuestra: MSR no tiene nada parecido. |
| `sondas/` | — | los 44 guiones que arrancan un Chromium de verdad y miden. |
| `test/` | — | las comprobaciones de Node, que no necesitan navegador. |
| `tools/` | — | los extractores: del `.bsp`, de los `.mdl`, de los sonidos, del HUD, del menú, del catálogo de objetos. Escriben en `build/`. |
| `doc/` | — | los treinta informes de los experimentos, en orden. |
| `build/` | `msr/` | **lo extraído del juego. No se versiona** (`.gitignore`), y lleva su `build/gatecity/PROCEDENCIA.md` diciendo de qué archivo salió cada cosa. |

La correspondencia más importante de la tabla es la segunda fila, y no es
decorativa: **que `src/play/` no importe Three.js ni toque el DOM es una regla que
se comprueba**, y es lo que permitió mover los 69 bichos de Gate City al servidor
sin reescribir su inteligencia (ver `doc/IA_28.md`).

---

## Lo que es nuestro y no tiene equivalente

Se dice aquí para que nadie lo busque en el original:

- **el guardado.** MSR guarda los personajes en el servidor; aquí viven en el
  `localStorage` del navegador (`src/juego/almacen.js`), con exportar e importar a
  un archivo. Una demo web no tiene cuentas.
- **la lista de servidores** (`src/juego/servidor.js`), que en MSR es el
  navegador de servidores de Steam.
- **la sonda** (`src/dev/sonda.js`) y las 44 de `sondas/`.
- **el HUD de la F3**, que es el de la sonda del experimento 03 y sigue ahí
  debajo del HUD del juego.

---

## Lo que se quedó en el laboratorio

En la mudanza se quedaron en `../Mydra Web Lab` los experimentos 01 a 09 que no son
Gate City: el lector de `.map` (`src/map/`), el kit CC0 y sus constructores
(`src/kit/`), el mirador de `?map=pueblo|corinth|colina|jharro`
(`src/mirador.js`), sus 21 pruebas, sus 22 herramientas y los 4,4 MB de `public/`.
Allí siguen funcionando.

Dos consecuencias que se notan leyendo:

1. **`src/render/scene.js` tiene su propia copia de `meshBounds()`**, doce líneas,
   porque era lo único que le pedía al lector de `.map`. La gemela sigue en el
   laboratorio, donde la usan el emisor y sus pruebas.
2. **Algunos comentarios citan herramientas que ya no están aquí** —
   `tools/kit.mjs`, `tools/shot.mjs`, `tools/bake.mjs`, `tools/jharro_shot.mjs`—
   porque cuentan de dónde salió una cifra. Están en el laboratorio, con su
   nombre. No se han reescrito: la cita es verdad, sólo que el archivo vive en la
   carpeta de al lado.

---

## `src/vgui/`, y por qué se hizo

Los paneles del personaje —crear, la hoja, el inventario, hablar con un NPC— se
hicieron desde cero, con `div`s y CSS propios, en vez de portar los paneles VGUI
que el juego ya tiene. Fue una mala decisión y se está deshaciendo. Tres cosas
que se pueden comprobar, y la segunda es la que más pesa:

1. **no combinan** con lo que sí es un porte fiel —el HUD (`src/juego/hudms.js`) y
   el menú principal (`src/juego/menums.js`), que leen `640_textscheme.txt` y usan
   `XRES`/`YRES`;
2. **no tienen teclas nativas**: `src/juego/interfaz.js:874` escucha `keydown` en
   la ventana, por fuera de la tabla de teclas del juego. En MSR son `CMenuPanel`
   con sus banderas y el reparto está en un sitio;
3. **uno estaba inventado entero**: `src/juego/inventario.js` era una rejilla
   estilo Diablo. MSR no tiene rejilla — se retiró en el 31.

**Hecho:**

- **29** ([doc/VGUI_29.md](doc/VGUI_29.md)) el kit —`esquema.js`, `widgets.js`,
  `registro.js`, `menubase.js`— y sobre él el menú de interacción con la **F**
  (`interactuar.js`).
- **30** ([doc/PERSONAJE_30.md](doc/PERSONAJE_30.md)) crear personaje
  (`personaje.js`), con sus tres etapas y sus modelos.

- **31** ([doc/INVENTARIO_31.md](doc/INVENTARIO_31.md)) el inventario
  (`contenedor.js`), y la rejilla inventada retirada.

**Pendiente:** 32 Character Info.
