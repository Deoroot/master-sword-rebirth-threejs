# 35 · El navegador no es un escritorio

Master Sword es un juego de escritorio. Este port se publica en la web. Casi
todo el proyecto ha podido ignorar la diferencia —el `.bsp` se lee igual, la
física sale igual, el servidor de Node hace lo que hacía el de GoldSrc— y este
experimento es donde la diferencia se cobra lo suyo.

Tres cosas, y son de tres clases distintas:

1. **Un fallo nuestro** que hacía inservibles dos paneles y que ningún control
   veía.
2. **Un límite del sitio donde se juega** que no se puede arreglar del todo, sólo
   rodear — y hay que decir cuál es el rodeo.
3. **Una decisión de arranque** que todavía está pendiente, y que no es de este
   experimento.

---

## 1. El puntero: dos paneles que se veían perfectos y no se podían pulsar

El síntoma, tal como llegó: «entiendo que el mouse se libera cuando los abres
para hacer clic en las opciones pero ahora eso no pasa y no puedes seleccionar
las cosas».

Era exactamente eso. El inventario y el menú de la F abrían **enteros y bien**
—su columna, su contenedor, su información, sus botones ámbar, su borde verde,
su medio negro, su desvanecido de medio segundo— y no recibían un solo clic,
porque el puntero seguía atrapado en el `canvas` con `requestPointerLock` y los
clics no llegaban al DOM.

### Lo que faltaba estaba escrito desde el 29 y nadie lo conectaba

`Registro.atrapaElRaton` existía, era correcto, y lo usaban dos sitios: el
`click` del `canvas` (para no capturar el puntero con un panel delante) y el
`manda` del bucle (para que el jugador no ande). Lo que no hacía nadie era
**soltarlo cuando el panel se abre**, que es la mitad que importa.

En el motor esa decisión no es del panel: es del viewport, y se toma en tres
sitios.

```
m_pCurrentMenu = pNewMenu; m_pCurrentMenu->Open();
UpdateCursorState();                  vgui_teamfortressviewport.cpp:1489-1493
VGUI::HideMenu(...) { pPanel->Close(); ... UpdateCursorState(); }
                                      vgui_global.cpp:67-72
HideTopMenu() { ... UpdateCursorState(); }
                                      vgui_teamfortressviewport.cpp:1523
```

Y lo que hace, delegado al panel para respetar su `m_NoMouse`:

```cpp
if (m_NoMouse) { g_iVisibleMouse = false; ...scu_none;  return false; }
g_iVisibleMouse = true;               ...scu_arrow;
                                      vgui_global.cpp:99-114
```

### `g_iVisibleMouse` es el puntero atrapado, al revés

Esto es el hallazgo que hace que la traducción sea exacta y no una aproximación.
Con `g_iVisibleMouse` en alto el motor apaga **tres** cosas:

| qué | dónde |
| --- | --- |
| los botones del ratón dejan de ser botones de juego | `if (iMouseInUse \|\| g_iVisibleMouse) return;` inputw32.cpp:387 |
| el movimiento deja de girar la vista | inputw32.cpp:477 |
| y deja de acumularse | inputw32.cpp:600 |

Las tres son, una por una, lo que hace `document.exitPointerLock()`. O sea que
**una sola llamada compra las tres**, y no hay que portar nada más.

El reparto quedó así: `src/vgui/registro.js` avisa (`cursorCambio()`, llamado en
`abrir` y en `cerrar`) y `src/main.js` es quien toca el DOM, porque el `canvas`
es suyo.

### Y al cerrar se vuelve a capturar — con una diferencia escrita

El motor devuelve el ratón al juego en el mismo fotograma en que el menú
desaparece (`IN_ResetMouse()`, vgui_teamfortressviewport.cpp:1741-1750). Aquí
también, pero el navegador pone una condición: `requestPointerLock` sólo se
concede dentro de un gesto del usuario. Los dos caminos que cierran un panel
—la Escape y el clic en «Cancel»— son gestos, así que se concede, y hay un
control de sonda en verde que lo dice. Si algún día un panel se cierra solo
—un temporizador, el servidor— no se concederá, y **no pasa nada**: la promesa se
traga sin ruido y el clic en el `canvas` lo recupera.

La otra sesión, trabajando en VGUI2, decidió lo contrario para su capa: no
re-capturar nunca. Es defendible por los caminos de cierre que tienen sus
ventanas, y son dos capas que no se llaman entre ellas. Queda escrito que
deciden distinto y por qué, que es lo que hay que hacer cuando dos partes del
mismo proyecto no coinciden.

### Por qué ninguna sonda lo vio

Ésta es la parte que merece quedar escrita más que el arreglo.

`sonda:vgui29` tenía **31 controles en verde** contra un panel que no se podía
pulsar. Los repaso: la tecla lo abre, el nodo está en pantalla, la ventana mide
`XRES(200)`, va pegada a la derecha, hay un «Cancel», el fondo es medio negro, el
borde es el verde del juego, el marco escala, los botones son ámbar, el
desvanecido dura medio segundo, la W no mueve al jugador, el 1 elige, el 0 no…

**Todos preguntan por lo que el panel dibuja. Ninguno intentaba tocarlo.** Y el
teclado sí funcionaba —el `1` elegía la primera opción— que es lo que hacía el
fallo difícil de creer: el panel respondía, sólo que no al ratón.

Lo que se añadió, y es el patrón que hay que repetir en cualquier panel nuevo:

- `probe.vgui.puntero()`, que lee `document.pointerLockElement` y no lo que el
  registro *cree*. Los dos datos por separado, porque el fallo era justo que uno
  decía «el ratón es del panel» y el otro seguía en el `canvas`.
- **un control positivo delante**: que jugando el clic en el mapa SÍ atrapa el
  puntero. Sin él, «se suelta al abrir» sale verde en un navegador que no lo
  hubiera atrapado nunca, que es un cero disfrazado de resultado.
- **y un clic de ratón de verdad**: `pag.mouse.click()` sobre «Cancel» en el menú
  de la F, sobre una fila de la columna en el inventario. La sonda **no** suelta
  el puntero por su cuenta en ningún momento; si lo hiciera, taparía el fallo.

### Un clic de guion no es un clic, y eso puede salvar a una sonda por suerte

Esto lo encontró la otra sesión aplicando el control positivo de arriba a su
capa, y vale para las dos: **un `.click()` llamado desde `evaluate` no lleva
activación transitoria**, así que el navegador no concede el puntero y la
re-captura del cierre se pierde en silencio. Un `pag.mouse.click` sí.

En este árbol hay dos sitios con clic de guion. `sondas/personaje30.mjs:143`
cierra la pantalla de personajes y **está en verde, 17/17 — pero se salva por
suerte y no por diseño**: ahí `interfaz.abierta` prohíbe capturar de todas
formas, así que el préstamo ni se pide y no se puede perder. El día que esa
guarda cambie, fallará de la forma más confusa que hay: verde o rojo según el
orden de los controles. El otro, `sondas/personaje.mjs`, pulsa las clases `mx-*`
de la interfaz que el 30 retiró y no está cableado como `sonda:*`; se deja como
está porque retirar una sonda no es decisión de este experimento.

### Un control vecino que llevaba tiempo en rojo

Buscando esto salió otra cosa: `sonda:hoja32` tenía un control en rojo desde el
experimento 31, y no se había visto porque **esa sonda no se volvió a pasar**
cuando se tocó el inventario.

El control era «la elegida se pinta en ROJO», y barría el documento entero
buscando etiquetas rojas esperando encontrar una. El 31 añadió los tres botones
de vista del inventario (Tiled / Small / Descriptions), el elegido va armado, y
un botón armado es rojo (`armado = [255, 0, 0, 0]`, widgets.js:289). Con el panel
escondido su nodo sigue en el DOM, así que había dos.

El fallo era del control, no del panel: ahora cuenta sólo lo que se ve
(`offsetParent !== null`). Y la lección es de proceso — **tocar un panel obliga a
volver a pasar las sondas de los vecinos**, porque comparten el DOM y los
colores.

---

## 2. Las teclas que no son nuestras

El otro síntoma: «si trato de hacer el jump agachado que en half life se usa para
subir a lugares pequeños a veces la pestaña se cierra/cambiar, al parecer por la
combinacion ctrl + w».

Es correcto y es peor de lo que parece. `config.cfg:15` dice
`bind "CTRL" "+duck"`, y eso es un hecho del juego que `src/juego/teclas.js`
respeta desde el principio. Pero **agacharse y avanzar a la vez es Ctrl+W**, y
agacharse-y-avanzar no es una rareza: es cómo se sube a los sitios estrechos en
Half-Life desde 1998. Así que la tecla del juego y el atajo del navegador chocan
en la maniobra más común del movimiento.

### `preventDefault()` no sirve, y hay que decirlo antes de que alguien lo intente

Los atajos de la **ventana** —cerrar pestaña, abrir pestaña, abrir ventana, la
barra de direcciones, F11, F12— los atiende el navegador antes de que el evento
sea cancelable. En una página normal no hay forma de quedárselos. Da lo mismo
cuántos `preventDefault` se pongan: con Ctrl+W la pestaña se cierra y el
`keydown` que llegó no sirve de nada porque ya no hay a quién avisar.

Esto está escrito en la cabecera de `src/juego/navegador.js` precisamente para
que nadie «arregle» el problema añadiendo la tecla a la lista de
`preventDefault` que ya hay en `main.js`.

### La única salida de verdad: pantalla completa + Keyboard Lock

Hay **una** manera de que el navegador ceda esas teclas, y es
`navigator.keyboard.lock()`, que existe para los juegos. Con dos condiciones que
no conviene esconder:

1. **Sólo funciona en pantalla completa.** Y es deliberado: ninguna página
   debería poder quitarle a nadie el «cerrar pestaña» sin que se note en qué
   estado está.
2. **Es de Chromium.** Firefox y Safari no la traen, y ahí no hay arreglo — sólo
   el aviso y la posibilidad de reasignar la tecla.

O sea que la respuesta honesta es: **en pantalla completa se arregla; fuera de
ella no se arregla, se avisa.**

### Lo que se hizo

- **`src/juego/navegador.js`**, nuestro entero y sin una sola cita del motor —a
  propósito: un juego de escritorio no tiene este problema y no hay nada que
  portar—. Trae la tabla de teclas reservadas, `choques()`, que cruza la tabla
  con el mapa de teclas del jugador, y `atraparTeclado()`, que pide pantalla
  completa y con ella el teclado.
- **Una acción nueva en `teclas.js`**: `pantallaCompleta`, «Fullscreen (web port
  only)», en la `b`. Declarada NUESTRA igual que ALT y ALT GR de los
  desplazamientos de ranuras: MSR no tiene ese comando y no podría tenerlo. La
  `b` no la usa ningún `bind` del `config.cfg` y no es atajo de ningún navegador.
  La F11, que sería la obvia, **no sirve**: se la queda el navegador y no llega
  nunca — y eso queda escrito para que nadie la ponga ahí.
- **Un aviso, una sola vez**, al pulsar el modificador y **no** al completar el
  atajo: con Ctrl+W no hay segunda oportunidad. Y nombra las **acciones**, no las
  teclas: «Ctrl + W» no le dice nada a nadie, «Duck + Move Forward closes the
  tab» sí.

`choques()` con los valores de fábrica del juego encuentra dos clases distintas,
y la prueba fija las dos: Ctrl+W (`Duck` + `Move Forward`) y las de función, que
chocan **solas** —F11 y F12 no necesitan compañía—. Eso último `teclas.js` ya lo
sabía: es la razón de que las cinco primeras ranuras tengan un segundo `bind` en
el 6, 7, 8, 9 y 0.

### Lo que no se puede comprobar en Node, y queda pendiente

Que Keyboard Lock ceda Ctrl+W **de verdad** necesita un Chromium en pantalla
completa. Las pruebas de `test/juego_navegador.test.mjs` fijan el diagnóstico
—que el choque se detecta con los `bind` del juego, y que desaparece si
agacharse deja de ser un modificador— y que `atraparTeclado()` contesta «no» con
un motivo en vez de lanzar, que importa porque se llama desde el manejador de una
tecla y una excepción ahí se llevaría por delante el resto del reparto.

Falta la sonda. Queda dicho aquí en vez de dado por bueno.

---

## 3. El arranque, que es del 34 y no de éste

El tercer punto que llegó: «el juego principal empieza en el menu principal pero
hasta ahora empezamos en gatecity».

Es verdad y no se ha tocado en este experimento, a propósito. Hoy el arranque va
directo a elegir personaje —desde el 30 esa pantalla es un panel de VGUI y está
abierta al cargar— y de ahí a Gate City. El menú principal existe
(`src/juego/menums.js`) pero se abre con la Escape una vez dentro; no es por
donde se entra.

Cambiarlo es del **experimento 34**, que es el menú principal de GameUI con el
navegador de servidores y las opciones, y que es de la otra sesión. El arranque
vive en `src/main.js`, así que el reparto quedó: este experimento no lo toca y
suelta el archivo cuando acaba. Enganchar la G, `montarVgui2` y el arranque en el
menú es una línea de ellos con el menú ya portado delante, y así no se pisa nada.

Una cosa que sí deja este experimento preparada para ese enganche: la acción
`pantallaCompleta` aparecerá en su panel de Options sola, porque ese panel lee
`ACCIONES`. Si la enseña, conviene que diga para qué es y no «fullscreen» a
secas.

---

## Lo que quedó medido

| | |
| --- | --- |
| pruebas de Node | 969, con `test/juego_navegador.test.mjs` nuevo |
| `sonda:vgui29` | 36/36 — eran 31, y cinco son del ratón |
| `sonda:inventario31` | 20/20 — eran 15 |
| `sonda:hoja32` | 15/15 — con un control que llevaba en rojo desde el 31 |
| `sonda:mundo` | 40/40, sin tocar |

## Los archivos

| archivo | qué |
| --- | --- |
| `src/juego/navegador.js` | **nuevo**, nuestro entero: las teclas del navegador |
| `src/vgui/registro.js` | `cursorCambio()`, con las tres citas de `UpdateCursorState` |
| `src/juego/teclas.js` | la acción `pantallaCompleta`, declarada como nuestra |
| `src/main.js` | quien suelta y recupera el puntero; el aviso; la tecla |
| `src/dev/sonda.js` | `probe.vgui.puntero()` |
| `test/juego_navegador.test.mjs` | **nuevo** |
| `test/vgui.test.mjs` | §3b, el aviso del puntero y la excepción de la hoja |
| `sondas/vgui29.mjs`, `sondas/inventario31.mjs`, `sondas/hoja32.mjs` | los clics de ratón de verdad |
