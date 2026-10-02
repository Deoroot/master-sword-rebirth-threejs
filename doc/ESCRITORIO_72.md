# 72 — La cáscara de escritorio

El encargo fue sacar esto del navegador y hacerlo un juego de escritorio como
el Master Sword original, porque **publicar en el navegador estaba costando las
teclas**. Esto es lo que se construyó, lo que se midió y las tres cosas que se
entendieron mal por el camino.

El menú no se tocó: la pintura de Anders Finér se queda donde estaba. La
alternativa que se había propuesto —un cuadro de dominio público de Thomas
Moran— se descartó por falta de material, no por licencia. Ver el último
apartado.

## Qué se construyó

Tres archivos nuevos en `escritorio/`, y ninguna línea del juego cambiada.

| archivo | qué hace |
| --- | --- |
| `escritorio/main.cjs` | el proceso principal: ventana, Vite en desarrollo, servidor en producción |
| `escritorio/servidor.js` | el servidor estático que le da sus archivos al juego |
| `escritorio/precarga.cjs` | el puente, que expone **un dato** y ninguna capacidad |

Y dos instrumentos: `test/escritorio.test.mjs` (7 comprobaciones de Node) y
`sondas/escritorio.mjs` (9 controles sobre un Electron de verdad).

```bash
npm run escritorio      # el juego, en su ventana
npm run sonda:escritorio
```

### Por qué un servidor HTTP dentro y no `file://`

Porque **todas las rutas de recursos del juego son relativas**:
`src/play/recursos.js:2` dice `build/msr` y de ahí sale todo. Con `file://` eso
se rompe por dos sitios: una ruta relativa resolvería contra `dist/`, donde
`build/` no está ni puede estar, y `fetch()` no funciona sobre `file://` en
Chromium.

Pero la razón que de verdad decidió el diseño es otra: **las 57 sondas del
proyecto arrancan Vite y lanzan un Chromium contra `http://localhost:PUERTO/`**
(`sondas/arranque36.mjs:48-62`). Una cáscara que matara el camino
navegador+HTTP dejaría al proyecto sin su único instrumento para medir lo que se
ve, y justo antes de rediseñar la interfaz entera. Así que Electron es una
**cáscara encima**, no una mudanza: el navegador sigue siendo un destino válido.

El reparto de `servirArchivos` respeta la regla 3 de procedencia al pie de la
letra: `/build` sale de la carpeta del jugador y lo demás del paquete. **No se
copia un byte**, y `public/` sigue sin existir.

## Lo que se midió

`npm test` va **1 760 de 1 760** y `npm run sonda:escritorio`, **9 de 9**. El
control que sostiene el experimento es que **no hay menú de aplicación**:
preguntado con `app.evaluate()` en el proceso principal, se pone rojo en cuanto
alguien borra la línea, y dice «hay un menú con 4 entradas».

Lo que gana el jugador, que estaba inventariado desde antes en
`src/juego/navegador.js` —197 líneas cuya cabecera dice *«Este archivo es
NUESTRO entero. Master Sword es un juego de escritorio y no tiene este
problema»*—:

- **F1..F12 para las doce ranuras rápidas.** El navegador se queda F11, F12,
  F5, F3 y F1; por eso `teclas.js` lleva un segundo `bind` en 6..0 de red.
- **Ctrl+W**, que es agacharse y avanzar (`config.cfg:15`).
- Los otros diez `Ctrl+algo` de `RESERVADAS`, y la Escape sin perder el puntero.

## Lo que se entendió mal

### 1. `ELECTRON_RUN_AS_NODE`, y una tarde achacada al código

El arranque falló tres veces seguidas con `app` a `undefined`, y las tres se
diagnosticaron mal. Se culpó primero a las exportaciones con nombre de un módulo
CommonJS importado desde ESM, luego al `import` por omisión, luego a
`createRequire`. Se llegó a reescribir el proceso principal entero de ESM a
CommonJS por un motivo que resultó ser falso.

**La causa era una variable de entorno**: `ELECTRON_RUN_AS_NODE=1` estaba puesta
en la consola. Con ella, el binario de Electron arranca como un Node pelado —sin
ventana y sin su módulo interno—, así que `require("electron")` resuelve el
envoltorio de npm y `app` no existe. Importa porque **la ponen otros
programas**: los terminales integrados de VS Code y de otras aplicaciones hechas
con Electron la heredan. O sea que `npm run escritorio` puede funcionar en una
consola y fallar en la de al lado, con un error que no la menciona.

Se diagnostica en un segundo:

```bash
node -e "console.log(process.env.ELECTRON_RUN_AS_NODE)"
```

*De la familia del «dato raro que no es la causa»: el síntoma apuntaba al
sistema de módulos, que era lo único que se había tocado.* El archivo se quedó
en `.cjs` igualmente, pero el comentario que decía por qué **era mentira y se
reescribió**: ahora dice que es por comodidad, no por imposibilidad.

### 2. Un verde vacío en la prueba del servidor — y la seguridad por accidente

La prueba del traspaso de rutas (`..` para salirse de la carpeta servida) estaba
verde. **Seguía verde con la comprobación de seguridad borrada entera.** Dos
motivos encadenados:

1. `fetch` **normaliza la URL antes de mandarla**, así que un `..` crudo nunca
   llega al servidor: se resuelve en el cliente;
2. y los codificados sí llegaban, pero el servidor normalizaba una ruta que
   todavía empezaba por `/` —o sea, **absoluta**—, y ahí Node descarta los `..`
   que suben por encima de la raíz:

```
normalize("/msr/../../../secreto.txt")  ->  "\secreto.txt"
normalize("msr/../../../secreto.txt")   ->  "..\..\secreto.txt"
```

O sea que ninguna ruta llegaba a escaparse **ni con el servidor abierto de par
en par**. El código era seguro por accidente y el control no se ejecutaba jamás.
Se arreglaron las dos cosas: quitar la barra ANTES de normalizar, para que el
control de verdad corra, y usar en la prueba rutas que sobrevivan al cliente.
De las cuatro variantes, la que muerde es `..%2f..%2f..%2f`, donde lo codificado
es **la barra**; las de `%2e%2e` tampoco llegan, porque el estándar de URL
también trata `%2e` como un punto al resolver segmentos.

*Un control que no puede ejecutarse nunca es indistinguible de uno que pasa.*

### 3. Un verde vacío en la sonda — el que más se parecía al bueno

La primera sonda mandaba F12 y Ctrl+W con `pag.keyboard.press()`, miraba que
llegaran a la página y daba **9 de 9**. También daba 9 de 9 con
`Menu.setApplicationMenu(null)` quitado, que es el arreglo que decía comprobar.

La prueba de que el mecanismo no se disparaba estaba en el propio resultado de
aquella pasada: **con el menú por omisión puesto, Ctrl+W no cerró la ventana.**
Las teclas de Playwright viajan por el protocolo de depuración y entran directas
en el renderizador; **no pasan por los aceleradores de la ventana**, que son
exactamente lo que el menú instala y lo que había que vencer. El control leía el
valor de reposo —«el renderizador recibe eventos sintéticos»— y el valor de
reposo pasa siempre.

La sonda ahora **mide la causa donde vive**, en el proceso principal, y declara
pendiente lo que no puede medir en vez de contarlo entre los verdes:

- que un acelerador de ventana se haya vencido de verdad (pide inyección a nivel
  del sistema operativo, que no hay);
- el contraste con un navegador (el Chromium de Playwright no tiene pestaña que
  cerrar);
- el camino de producción, que esta sonda no recorre.

*Cuando el instrumento entra por una puerta que el mecanismo no vigila, el verde
no dice nada.* Es la variante del 35 —el panel que no recibía un clic— con otra
ropa.

### Y dos hallazgos menores, los dos de la prueba

- **Una fuga de descriptores.** Un `.pipe(res)` pelado cierra el archivo cuando
  la respuesta termina bien, pero no cuando se corta antes — y una partida
  aborta peticiones a menudo (cambiar de mapa). Sale como un `ENOTEMPTY` al
  borrar un temporal, que parece ruido del andamio.
- **Cerrar el servidor tardaba tres segundos**, esperando a que caducaran las
  conexiones `keep-alive`. En una prueba es una molestia; en el juego es que al
  cerrar la ventana la aplicación tarda en irse, que es como se ve un programa
  colgado.

## Decisiones que quedan firmadas

- **`.cjs` entra en `test/procedencia.test.mjs`.** El archivo dice que añadir
  una extensión «es una decisión que alguien firma»: ésta es JavaScript nuestro,
  no contenido del juego, y son `.cjs` porque `package.json` dice
  `"type": "module"`.
- **Un instalador no puede llevar `build/` dentro.** Sería redistribuir el
  contenido de MSR, la versión de escritorio de «ni un byte a `public/`». Por
  eso `CONTENIDO` se busca al lado del ejecutable y nunca dentro. **El
  empaquetado está sin hacer**, y ésta es su restricción de partida.

## De vuelta a la pintura de Finér — y lo que estaba tapando la torre

El menú vuelve a arrancar con la pintura de Anders Finér. La decisión vive en
`ESCENA_DEL_MENU`, en `src/play/fondomenu.js`, **con su razón escrita al lado**,
que es la regla de las tablas de ajustes: una cosa apagada tiene que decir por
qué, o dentro de un año nadie sabe si falta por decisión o por olvido.

**La torre no se borra.** `prepararFondoDelMenu` sigue entero y se monta bajo
demanda desde `window.probe.miradores`, así que las cinco sondas de la escena
—`menu52`, `miradores52`, `torre52`, `torre57`, `torre58`, `materialesmenu`—
siguen midiendo lo mismo. Volver a encenderla es cambiar una palabra.

### El hallazgo: la torre llevaba rompiendo `sonda:arranque36`

`npm run sonda:arranque36` iba **22 de 23**, cayéndose en un `waitForFunction`
agotado a los 60 s. Se dio por un rojo heredado del árbol compartido. **No lo
era.** Medido con el experimento que lo decide —apagar la torre, pasar la sonda,
encenderla, pasarla otra vez—:

| fondo del menú | `sonda:arranque36` |
| --- | --- |
| la torre | **22 de 23**, `Timeout 60000ms exceeded` |
| la pintura | **30 de 30**, sin errores de página |

La escena cuesta 336 716 triángulos en 54 llamadas, con nubes volumétricas a 64
muestras por rayo, mapa de sombras de 2048 y MSAA. Bajo el renderizado por
software con el que corren las sondas, eso dejaba sin aire al resto de la página
y el plazo de un minuto se agotaba. Los ocho controles que no llegaban a correr
incluían el del experimento 50 — el mismo que la tabla del apartado 4 de
CLAUDE.md pone como ejemplo.

*Un fondo de menú que se come el presupuesto de fotograma no da un error: da
plazos agotados en sitios que no tienen nada que ver con él.*

### Y el recorte de la pintura es del juego, no del port

La pintura es de **800×600, o sea 4:3**, y en una ventana 16:9 se pierde el
**25 % del alto** —12,5 % por arriba y 12,5 % por abajo—, que es justo donde
está la cima de la torre. Parece un fallo del port y no lo es:

| cita | qué dice |
| --- | --- |
| `mainui/BaseMenu.cpp:1149` | `ui_background_stretch`, por omisión `"0"` |
| `mainui/controls/BackgroundBitmap.cpp:186-195` | con el estirado apagado, **una sola escala** para los dos ejes: la del lado que desborda |
| `mainui/controls/BackgroundBitmap.cpp:199-207` | y lo que sobra **se centra** |

Con 800×600 en 1600×900 el motor saca escala 2 —una imagen de 1600×1200 sobre
900 de alto— y un desfase de −150. Eso es, exactamente, el `center/cover` del
CSS que el menú ya usaba. La equivalencia está portada en `encuadreDelFondo` y
comprobada, para que nadie lo «arregle» dentro de un año: el CSS no llevaba
ninguna cita y ahora la lleva.

## Lo del cuadro, para que no se vuelva a mirar desde cero

Se evaluó sustituir el fondo del menú por *Childe Roland to the Dark Tower Came*
de Thomas Moran (1859), de dominio público. **La licencia no era el problema; el
escaneo sí.** El archivo de Wikimedia Commons mide **576 × 377 píxeles y 33 KB**,
y su origen figura como *«Unknown source»*: falla por resolución —habría que
ampliarlo 3,3× para un fondo de 1920— y falla por procedencia, que es lo que
este proyecto no puede escribir inventado.

Además no hay «el cuadro de Moran»: hay uno de 1859 en colección privada, otro
de 1859 en el Madden Museum of Art y una versión de **1885 en el Birmingham
Museum of Art** (AFI.22.2005), y las webs de láminas llevan escaneos de baja
resolución y a menudo mal etiquetados. Si alguien lo retoma, los dos caminos
abiertos son escribir al departamento de derechos del museo de Birmingham, o
buscar otro cuadro de dominio público con escaneo en abierto de alta resolución
y ficha completa —el Met, el Rijksmuseum, la National Gallery of Art y el Art
Institute los publican.

Y una nota sobre la torre procedural, que es lo que el cuadro iba a sustituir:
**el problema no es Three.js.** La cara iluminada vive entre RGB 20 y 32, o sea
en el 12 % inferior del rango, y una silueta necesita fondo claro detrás; la
forma es un prisma recto sin talud, contrafuertes ni saeteras; y el encuadre
está invertido respecto a las dos pinturas de referencia, donde la torre es
pequeña y lejana. Eso es dirección artística, y **ninguna sonda puede emitir ese
juicio**: las pruebas del menú pueden decir que el encuadre es el pedido y que
la fisura tiene 39 metros, y seguir verdes sobre una imagen fea.
