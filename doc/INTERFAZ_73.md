# Experimento 73 — el rediseño de la interfaz: primero el inventario, y un sonido que no sonaba

El encargo, textualmente: *«necesitamos un mockup de todos los paneles y
funciones de cada una […] ahora veo que no todas sus opciones sirven, por ejemplo
las de sonido no afectan el volumen que pasa cuando pasas el mouse por una de las
opciones del menú principal, de hecho parece que no funciona para nada»*, y
además *«se tendría que habilitar la función de quit»*.

Así que esto son tres cosas, y el orden no es casual: **el mockup va después del
inventario**, porque dibujar paneles sin saber cuáles de sus controles están
vivos es dibujar un decorado. Y el inventario trajo un fallo medido.

---

## 1. El sonido: medido, y es peor que «no afecta»

La sospecha era que el deslizador de Audio no llegaba al sonido del menú. Se
midió espiando `HTMLMediaElement.play` en un Chromium de verdad, pasando el ratón
por tres opciones del menú principal:

```
TRAS PASAR EL RATÓN:  [{"src":"ui/buttonrollover.wav","volumen":1},
                       {"src":"ui/buttonrollover.wav","volumen":1}]
ajustes aplicados:     null
¿hay AudioContext del juego?  false
```

Tres hechos, y ninguno es el que se esperaba:

1. **El sonido suena a `volume: 1`, siempre.** No es que el deslizador no lo
   mueva: es que nunca lo ha tocado nadie. `menums.js` construye sus propios
   `new Audio()` y los reproduce tal cual, y `sonarInterfaz` en `main.js` hace lo
   mismo. Ninguno de los dos pasa por `src/play/audio.js`, que es donde vive
   `volumenes()` y donde el canal de efectos existe.

2. **El valor por defecto del juego es `volume "0.120000"`** (`config.cfg`), o
   sea que la interfaz de este port suena a **ocho veces** lo que el juego trae
   puesto. El número que la ventana enseña es correcto; lo que no existe es el
   camino entre el número y el altavoz.

3. **En el menú no hay nadie que aplique nada.** `aplicarAjustes` nace a `null`
   y sólo se rellena dentro de la carga de un mapa, donde existen el atlas de luz
   y el audio. Desde la primera pantalla —que desde el 36 es el menú— «Apply»
   guarda en `ajustesDelJugador` y no reparte. Por eso la impresión del jugador
   es la correcta: *parece que no funciona para nada*, y es que **en el menú no
   funciona nada de esa pestaña**.

### Y un tercer camino muerto, que apareció leyendo

`src/main.js:737` le pasa al registro de VGUI1 este gancho:

```js
sonar: (cual) => menuMs?.sonar?.(cual),
```

Y `montarMenu` **no devuelve ningún `sonar`**: el objeto que devuelve tiene
`abrir`, `cerrar`, `mover`, `elegir`, `estado`… y no eso. Así que el gancho es un
`undefined?.()`, que no da error. Y da igual, porque **`Registro` guarda
`this.sonar` y no lo llama desde ningún sitio**: `grep` sobre `src/vgui/` y
`src/vgui2/` no encuentra una sola invocación.

Es la familia del 64 —`helptip` y su ventana, cada uno esperando al otro durante
cuatro experimentos— y la del 66: un gancho de relleno es un sitio donde una
regla puede vivir sin correr. Aquí hay **dos mitades muertas, cada una
suficiente por sí sola** para que el inventario y los menús de NPC sean mudos.

### Qué significa para la tabla de ajustes

`cuenta()` dice que Audio tiene **2 vivos de 3**, y eso es lo que `porQueNo`
vacío significa por contrato. Pero `porQueNo` vacío quiere decir «esto puede
hacer algo», no «esto llega». Es exactamente el agujero que el experimento de
«Create Server» ya tapó en su tabla hermana, con `aplica`:

> `porQueNo` vacío significaba «esto hace algo», y no lo comprobaba nadie […]
> un ajuste encendido tiene que decir DÓNDE se aplica, en `aplica`.
> — `src/play/crearpartida.js:64-73`

**`src/play/ajustes.js` no tiene esa columna.** La tiene su gemela desde hace
veintiséis experimentos y aquí nadie la añadió, y el agujero ha producido
exactamente el mismo resultado: dos filas contadas entre las vivas que no llegan
al juego. Pendiente: llevar `aplica` a `ajustes.js` y su prueba, que es lo que
convierte esto en algo que no puede repetirse.

---

## 2. Lo que la cáscara de escritorio desbloquea

Al pasar a Electron, varios `porQueNo` dejaron de ser verdad. No es una opinión:
todos ellos nombran al navegador como causa.

| ajuste | lo que dice hoy | en escritorio |
| --- | --- | --- |
| `Quit` (menú) | *a browser cannot close its own tab* | `app.quit()` |
| `Video · ventana` | *a browser tab is already a window* | `setFullScreen()` |
| `Video · resolucion` | *la resolución es el tamaño de la ventana* | `setSize()`, y la ventana es nuestra |
| `Video · modo` | *la proporción sigue a la ventana* | lo mismo |
| `Create Server · salirAlReiniciar` | *a browser tab cannot close itself* | igual que «Quit» |
| `Create Server · pantallaCompleta` | — (está viva) | **deja de hacer falta aquí**: era un apaño para no perder Ctrl+W, y `Menu.setApplicationMenu(null)` ya lo resolvió en el 72 |

La última es la interesante y por eso no está entre las de arriba: es una fila
**nuestra**, declarada como nuestra en el 36, que existía por un límite del
navegador —pedir el teclado sólo funciona dentro de un gesto y en pantalla
completa— y que el 72 dejó sin motivo. No se borra: se mueve a la pestaña Video
de «Options», que es donde vive una preferencia normal, y deja de ser lo último
que uno marca antes de jugar.

Los demás apagados **no** se desbloquean, y conviene decirlo para que el verde no
se confunda: la voz, el spray, el candado parental, el joystick y los nueve de
«Create Server» que esperan un servidor de verdad siguen exactamente igual.

---

## 3. El mockup

`doc/mockups/interfaz-73-mockup.html`. Cinco paneles —menú, el diálogo de
salida nuevo, Options, Servers y Create Server—, **cinco estilos conmutables en
vivo** y cuatro anchos.

### Los tres primeros son el mismo esqueleto

Y esto lo preguntó el jugador al verlos: *«esos son basados en el de half-life
no?»*. Sí, y es la observación correcta. Lo que hace que una ventana se lea como
Half-Life no es el gris: son **tres cosas estructurales**, y las tres las
conservaban los tres estilos.

1. una caja rectangular flotante con barra de título,
2. una tira de pestañas horizontal debajo,
3. el pie OK / Cancel / Apply.

Mientras eso esté puesto, da igual el color: es un diálogo de Windows 98
repintado. Los tres primeros son, entonces, **una sola propuesta con tres
pieles**, y el tercero es el que hay hoy — está ahí a propósito, es el control
positivo del asunto: un estilo no se juzga sin lo que sustituye al lado.

- **Hoja** — pizarra translúcida con una línea de oro, versalitas en el título.
- **Pergamino** — vitela cálida, tinta marrón, sin bisel.
- **Bisel** — Verdana, gris 4c4a43 y los dos bordes de VGUI. El de hoy.

### Y dos que rompen las tres a la vez

Por eso estos dos **cambian el HTML y no sólo el CSS**: no hay selector que
quite una barra de título.

- **Códice** — el panel no es una ventana: es un objeto del mundo, un libro
  abierto. La página izquierda es el índice, con cintas de tela en vez de
  pestañas; la derecha, lo que se ajusta. No hay OK/Cancel/Apply porque un libro
  no se acepta: se cierra, y lo escrito ya está escrito. Es el idioma de un juego
  de espada y brujería, y Half-Life no tiene nada equivalente.
- **Columna** — no hay ventana en absoluto. La lista del menú no desaparece:
  **se convierte en la navegación del panel**. Las siete pestañas de «Options»
  ocupan el sitio exacto que ocupaban las diez entradas, con la misma letra y el
  mismo marcador ▸, y lo que se ajusta aparece a la derecha sobre la pintura, sin
  caja ni borde. La navegación nunca cambia de sitio, que es justo lo contrario
  de lo que hace un diálogo con pestañas propias.

«Columna» es el único de los cinco que no toma nada prestado de ningún otro
juego: es el idioma que el menú principal ya habla desde el 52, extendido a todo
lo demás. Y es el que menos código nuevo necesita, porque ese idioma ya está
escrito en `src/juego/menums.js`.

Cada panel lleva debajo **el inventario de sus funciones**, con cuatro estados:
funciona, apagado-y-dice-por-qué, **nuevo en escritorio** y **no llega** — este
último es el del sonido, y es el único que no estaba escrito en ninguna parte
antes de hoy.

### Dos cosas que el maquetado enseñó al mirarlo

0. **Sin caja, el texto se pierde sobre la parte clara de la pintura** — y la
   respuesta no puede ser ponerle un fondo al panel, porque eso devuelve la caja
   por la puerta de atrás. Es una viñeta difuminada, que es lo que el bloque del
   menú lleva haciendo desde el 52. Y al primer intento **dejó una arista
   recta**: una elipse descentrada no llega a cero en el borde de su caja, con lo
   que se veía el rectángulo. Va centrada y con los radios al 50 %, que es la
   única forma de que muera justo en sus bordes. Se vio en la captura, no
   leyendo.
1. **La ventana centrada parte «MASTER SWORD» por la mitad.** El bloque del menú
   vive en el 6 % izquierdo desde el 52 y las ventanas se abrían en `x: 40`;
   sobre una pintura con la luz a la derecha, lo que hay que hacer es lo
   contrario. En el maquetado la ventana va anclada a la derecha y sólo se centra
   cuando no cabe de otro modo.
2. **La pintura no está en el maquetado**, y no es un olvido: un `.html` de
   `doc/mockups/` vive en el repositorio, y el repositorio no lleva contenido del
   juego. Hay un degradado con los valores medidos del original en su sitio y un
   aviso encima diciendo qué es. Sirve para juzgar el texto sobre una imagen
   oscura, que es lo que se está eligiendo; no sirve para juzgar el color.

---

## 3 bis. El códice, construido — sólo VGUI2

Encargo: *«por ahora toquemos solo el menú, para ver cómo quedaría»*. Alcance:
el menú, «Options», «Servers» y «Create Server». Los paneles del mod —`src/vgui/`,
2 602 líneas: inventario, hoja de personaje, tiendas, menús de NPC— **no se
tocan**, y eso deja el juego con dos aspectos a propósito y por ahora.

`src/vgui2/codice.js`: la decisión declarada (`ASPECTO_DE_LAS_VENTANAS`), la
paleta de pergamino como un segundo `Tema`, y las dos cáscaras —`MarcoCodice` e
`IndiceCodice`— con **la misma interfaz** que `Frame` y `PropertySheet`. Las tres
ventanas cambian en dos líneas cada una.

Tres cosas hicieron que esto fuera barato, y conviene saber cuáles:

1. **El kit ya estaba indirecto por `tema`**, cuya interfaz entera son cinco
   métodos. Ningún widget escribe un color a mano, así que una paleta nueva los
   repinta los diez sin tocar ninguno.
2. **La regla no se enteró.** `ajustes.js` y `crearpartida.js` no tocan el DOM.
3. **Las cintas conservan la clase `.v2-pestana`.** Son pestañas: cambia su
   aspecto, no su papel. Ocho sondas las pulsan por esa clase.

### Lo que no era cosmética, y lo cazó una sonda

Quitar OK/Cancel/Apply **cambia el comportamiento**: sin «Apply» no hay «probar
y cancelar». `sonda:ajustes37` se puso roja en dos controles —el positivo de
«Apply sin tocar nada» y «arrastrado el deslizador y SIN aplicar, el ratón sigue
como estaba»— y tenía razón: el contrato se había invertido y nadie lo había
construido. Ahora `poner()` aplica al tocar cuando no hay caja, y los dos
controles están escritos **en sus dos ramas**, porque medir el contrato de la
caja con el códice puesto es medir un juego que no existe.

*Elegir un aspecto por su foto es elegir también un comportamiento, y el pie de
la ventana es donde vive.*

### Dos defectos que destapó el pergamino

- **`PropertySheet.anadir` sólo pintaba la primera pestaña.** `elegir()` es el
  único sitio que les pone color y borde, y corría una sola vez: una pestaña que
  nadie hubiera pulsado nunca se quedaba sin estilo. Con el gris del esquema casi
  no se notaba; sobre vitela, «Game» salía en blanco. **Es un fallo del port, no
  del códice**, y llevaba ahí desde el 34. Arreglado en las dos cáscaras.
- **Mi paleta tenía huecos y el repuesto los tapaba.** `ComboBox` pide
  `WindowBG`, `MenuButtonArrow`, `MenuBorder` y `ComboBoxBorder`, y no estaban:
  salió un desplegable negro y una flecha azul de Valve dentro de un libro. La
  lista de nombres **no se adivina, se saca con un grep**, y ahora un nombre que
  falte avisa por consola en vez de resolverse a algo plausible. Y el agarre del
  deslizador era invisible por ser del mismo tono que la página: `ControlBG` lo
  usan el botón y el agarre, y tiene que separarse de la vitela a propósito.

### El aspecto se puede forzar, y hace falta

`?aspecto=vgui` vuelve a las ventanas de VGUI2. No es una puerta trasera: casi
todo lo que mide `sondas/vgui2_34.mjs` es **la fidelidad del port de
`TrackerScheme.res`** —Verdana, 13 px, `ControlBG` negro al 50 %, el alfa 0 de
`TitleBG`, los 535 px de la captura—, y eso son hechos citados que no dejan de
ser verdad porque hoy el menú se dibuje como un libro. Sin el interruptor, elegir
el códice habría **borrado esa medición para siempre**: la sonda se cae con
`getComputedStyle(null)` en cuanto no hay barra de título. Es lo mismo que hizo
el 72 con la torre: no se borra, se enciende a petición.

La sonda del 34 mide ahora las dos: fidelidad con `?aspecto=vgui`, y al final un
bloque nuevo con las **tres** diferencias del códice —ninguna barra de título,
siete cintas en columna, ningún OK/Cancel/Apply—. 30 de 30.

### Y el verde vacío que casi me como

Roto el códice a propósito (`cascara()` devolviendo siempre el par de VGUI), los
tres controles estructurales se pusieron rojos — pero **«el códice está puesto y
lo dice la capa» se quedó verde**, porque mide la DECLARACIÓN y no el dibujo. Si
me hubiera quedado en ese control, habría tenido una sonda que afirma que el
libro está puesto con el libro desactivado. Es el caso del apartado 4 de
`CLAUDE.md`, en su forma más tonta: *una bandera no es un píxel*.

## 3 ter. Cinco cosas al verlo corriendo

El jugador lo arrancó y volvió con cinco. Las cinco eran ciertas.

**1 · Faltaba el botón de cerrar.** El códice nació sin X —«un libro no tiene una
X»— y eso dejó **«Servers» sin ninguna salida visible**: es la única de las tres
sin pie, así que su única puerta era la Escape, que no se descubre mirando. La
idea original confundía dos cosas: que no se arrastre por la cabecera (correcto,
no hay barra) con que no se pueda cerrar (un fallo). Ahora la cabecera lleva una
salida discreta, con la clase `v2-cerrar` —la misma que la X de `Frame`— porque
hace lo mismo y porque quien la busque la buscará por ahí.

**2 · La casilla de pantalla completa sobra.** Lo decía su propia etiqueta desde
que se escribió: *«web port only»*. Nunca fue una preferencia, era un apaño
contra un límite del navegador, y el 72 quitó el límite. No se borra —el port
también corre en navegador, que es donde corren las sondas— sino que se marca
`soloEnNavegador` y no se dibuja en la cáscara. Y el valor deja de aplicarse
allí: tenerlo a `true` en la tabla y pedir pantalla completa sin haberla ofrecido
sería cumplir una orden que el jugador no dio.

Esconderla es lo contrario de lo que esta ventana hace con los apagados, y la
diferencia es real: **un apagado es trabajo que falta; esto es un apaño sin
problema que resolver.** Enseñarlo apagado le contaría al jugador de escritorio
una historia que no es la suya.

**3 · «Quit» seguía apagado.** Ahora no. `ipcMain.on("msr:salir")` en el proceso
principal, `escritorio.salir()` en la precarga —un método con nombre propio, no
una puerta general, que es lo que ese archivo prometía— y una pregunta antes,
porque salir no se deshace. La pregunta es del juego: `dialog.showMessageBox` de
Electron habría sido **una línea** y habría metido un cuadro de Windows en mitad
de un menú que acaba de dejar de parecerse a Windows.

`sirve` de «Quit» es ahora lo único del menú que depende de DÓNDE corre el juego,
y por eso no se resuelve en la tabla de `COMANDOS` sino en `quehace()` con su
contexto: la tabla sigue diciendo la verdad del navegador, que es verdad.

Y el foco arranca en **«Cancel»**, no en «Quit». Lo que no se deshace no se pulsa
por inercia.

**4 · DrKill no es el autor del juego.** El crédito decía «Master Sword: Rebirth
by DrKill and the MSR team» y eso ascendía al autor de un mapa a autor del juego.
DrKill escribió `gatecity.bsp` —lo dice el propio mapa, `maptitle "Gatecity by
DrKill"`— y su sitio es `CREDITOS.md:26`, donde ya estaba bien, y el título del
mapa al entrar, donde el juego lo pone solo. Estaba mal desde el 52.

*Un crédito equivocado es de los errores que más duran: parece información, no
código, y nadie lo comprueba.* Ahora lo comprueba la sonda.

**5 · Los colores no mezclaban**, y tiene causa: la pintura de Finér es **fría**
—cielo gris azulado, valle verde, roca verdinegra— y el pergamino salió ámbar con
cintas naranjas. Dos familias que no se tocan en ningún punto: el libro no estaba
*en* la escena, estaba pegado encima. Se cambió la temperatura, no el tono: vitela
desaturada tirando a verde grisáceo, cintas de pardo apagado. Y **la página deja
pasar algo de luz** (alfa ~0,95), que es la misma idea del `ControlBG "0 0 0 128"`
de VGUI2 con mucho menos paso: un papel no es un cristal, pero el verde de debajo
tiene que teñirlo.

### Y de paso, dos errores míos

- **Una comilla invertida dentro de `CSS_CODICE`.** Escribí un comentario citando
  `ControlBG` con comillas invertidas dentro de una plantilla que las usa como
  delimitador: `SyntaxError` a cien líneas de distancia. `menums.js` ya llevaba
  escrito el aviso de esta trampa desde el 52. Lo pisé igual.
- **La sonda midió la ventana equivocada.** El bloque de «Quit» encontró
  `.v2-ventana` y afirmó sobre ella… y era **Options**, que un bloque anterior
  había dejado abierta: con algo encima el menú no atiende clics (`tapado`, del
  52), así que el clic en «Quit» nunca llegó. Se vio porque el detalle del
  control venía impreso —«botones Advanced… · Done»— y no por mirar mejor. Ahora
  la sonda cierra lo que haya y **lo comprueba** antes de empezar.

## 4. Lo que queda decidido y lo que queda por decidir

**Decidido aquí:** nada de estilo. El maquetado existe para que esa decisión la
tome quien juega, que es lo que se pidió.

**Medido aquí:** que el sonido de la interfaz no pasa por ningún volumen, que en
el menú no hay aplicador, y que el gancho `sonar` de VGUI1 está muerto por las
dos puntas.

**Pendiente, en orden de lo que cuesta:**

1. `Quit` de verdad, con su diálogo. Es lo que se pidió y es lo más barato.
2. La columna `aplica` en `src/play/ajustes.js`, con su prueba. Es la vacuna, y
   sin ella el fallo del sonido se puede repetir en cualquier otra fila.
3. El camino del sonido: un solo sitio por el que suene la interfaz, con el canal
   de efectos detrás, y un aplicador que exista también sin mapa cargado.
4. Los cinco `porQueNo` de la tabla del apartado 2, que ya no son verdad.
5. El estilo, cuando esté elegido.

Y un control que hoy no existe y que este experimento pide: **una sonda que
mueva el deslizador de Audio y escuche**. No «que el valor de la ventana cambie»
—eso es el error del deslizador de sensibilidad que la tabla del apartado 4 de
`CLAUDE.md` lleva años enseñando—, sino que el sonido que sale suene distinto.
Con su control positivo: a volumen 0 no se oye, y a volumen 1 sí.
