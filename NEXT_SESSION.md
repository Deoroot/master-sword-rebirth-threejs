# Dónde se quedó esto

> **EL 35 ESTÁ HECHO: [doc/NAVEGADOR_35.md](doc/NAVEGADOR_35.md).** El navegador
> no es un escritorio, y ahí se cobra lo suyo.
>
> **DOS PANELES SE VEÍAN PERFECTOS Y NO SE PODÍAN PULSAR.** El inventario y el
> menú de la F abrían enteros —columna, botones ámbar, borde verde, desvanecido de
> medio segundo— y no recibían un solo clic: el puntero seguía atrapado en el
> `canvas`. `atrapaElRaton` estaba escrito desde el 29 y **nadie lo conectaba**;
> faltaba `UpdateCursorState`, que en el motor no es del panel sino del viewport
> (vgui_teamfortressviewport.cpp:1489-1493, vgui_global.cpp:67-72).
>
> Y el hallazgo que hace la traducción exacta: **`g_iVisibleMouse` es el puntero
> atrapado, al revés.** Apaga las tres cosas que apaga `exitPointerLock` —los
> botones (inputw32.cpp:387), el giro (:477) y su acumulación (:600)—, así que una
> sola llamada compra las tres.
>
> **`sonda:vgui29` tenía 31 controles en verde contra un panel inservible.** Todos
> preguntaban por lo que el panel DIBUJA y ninguno intentaba **tocarlo**; y el
> teclado sí funcionaba, que es lo que lo hacía difícil de creer. Ahora hay clics
> de ratón de verdad (`pag.mouse.click`) y el positivo delante: que jugando el clic
> en el mapa SÍ atrapa el puntero. **Patrón obligatorio para cualquier panel
> nuevo.**
>
> **Y CTRL+W CIERRA LA PESTAÑA AL AGACHARSE Y AVANZAR.** `preventDefault()` **no
> sirve** —los atajos de la ventana no son cancelables— y está escrito en
> `src/juego/navegador.js` para que nadie lo intente. La única salida es pantalla
> completa con Keyboard Lock, que es de Chromium: dentro se arregla, fuera se
> avisa. Acción nueva `pantallaCompleta` en la `b`, **declarada como nuestra**.
>
> **Y UN CONTROL LLEVABA EN ROJO DESDE EL 31 SIN QUE NADIE LO SUPIERA**, porque
> `sonda:hoja32` no se volvió a pasar al tocar el inventario: el botón «Tiled»
> armado es rojo y el control contaba etiquetas rojas en todo el documento.
> Tocar un panel obliga a pasar las sondas de los vecinos.
>
> **969 pruebas, vgui29 36/36, inventario31 20/20, hoja32 15/15, mundo 40/40.**
>
> Pendiente y dicho: falta la sonda de Keyboard Lock (necesita Chromium en
> pantalla completa), y **el arranque sigue entrando por elegir personaje y no por
> un menú principal** — eso es del 34 y de la otra sesión, que tiene el GameUI.

> **LOS CUATRO PANELES ESTÁN: [doc/HOJA_32.md](doc/HOJA_32.md) cierra la serie.**
> El menú de interacción (F), crear personaje, el inventario (I) y Character
> Info (P), los cuatro portados de VGUI sobre el kit del 29 y manejados por la
> tabla de teclas del juego. **819 pruebas y las 18 sondas en verde, 487
> controles.**
>
> De este último, lo que había que copiar bien: **`m_NoMouse = true`**. Es el
> único de los cuatro que **no te quita el control del personaje** — la hoja se
> lee andando. Y el control que lo mide lleva su contrario al lado: con la hoja
> delante se andan 4,95 m, con el inventario 0,0 cm.
>
> Y dos fallos: RePág y AvPág iban a la consola de sucesos antes que al panel
> (el motor la pone **la última** de tres), y la hoja decía «Health: 0» porque
> las claves son `vidaMax`/`manaMax`/`aguanteMax`. Lo segundo no lo cazó ningún
> control: se vio **mirando la captura**.
>
> **Y EL REPOSITORIO ESTÁ**: <https://github.com/Deoroot/master-sword-rebirth-threejs>,
> privado, con los treinta y dos experimentos de historial y el tag
> `v0.1.0-alpha`. 226 archivos y **ni un binario**, comprobado contra la API de
> GitHub y no de memoria.
>
> **Lo siguiente, cuando lo decidas**: enseñárselo al equipo de MSR y pasarlo a
> público —que es lo que pidieron: crédito y repositorio público—, y de lo que
> falta, lo que más se nota jugando son las **misiones**: el menú de la F ya lee
> las opciones de los scripts, pero elegir una no hace nada.

> **EL 31 ESTÁ HECHO: [doc/INVENTARIO_31.md](doc/INVENTARIO_31.md).** El
> inventario portado —columna de equipo, contenedor con barra, panel de
> información— y **la rejilla inventada retirada**: `src/juego/inventario.js`
> pasa de 96 líneas a 19 y se queda sólo con la regla del peso, que ésa sí es
> del juego. **819 pruebas y 13 de 13 en la sonda.**
>
> **Y UNA SONDA ESTABA MIDIENDO OTRO PROYECTO.** Un `vite` de «Mydra Web Lab» se
> quedó escuchando en el 5196; `--strictPort` hizo que el nuestro no arrancara y
> `stdio: "ignore"` se tragó el aviso, así que `sonda:cuerpo` estuvo **29
> controles en verde midiendo la carpeta vieja**. Ahora las veintiséis sondas
> liberan su puerto y comprueban el `<title>` de la página antes de medir nada
> (`sondas/mismo.mjs`), y `sonda:cuerpo` se rehízo para el panel nuevo.
>
> **Lo siguiente es el último panel**: 32 Character Info (`vgui_stats.cpp`), que
> además es el que se va a encontrar de frente con el fallo del esquema «ID
> Text» que el 29 dejó portado. Después, el repositorio con el tag del alfa.

> **EL 30 ESTÁ HECHO: [doc/PERSONAJE_30.md](doc/PERSONAJE_30.md).** Crear
> personaje, que es la primera pantalla del juego: **tres etapas** —elegir, quién
> eres, con qué arma— y los personajes son **modelos**, no dibujos.
> **819 pruebas y 17 de 17 en la sonda.** `npm run sonda:personaje30`.
>
> Dos fallos de medida del original, portados con el fallo y **multiplicándose
> entre sí**: `XRES(16) * XRES(1)` convierte dos veces, y la función de centrar
> tiene el `−1` fuera del paréntesis. A 640 son siete píxeles; a 1920 la rejilla
> de armas se va **167** a la izquierda. Y una corrección: lo de que **cinco de las siete
> armas no tenían icono** era un fallo de nuestro extractor, no de los datos —
> leía la primera línea `sethudsprite` y los scripts declaran las dos. Son
> **seis de siete**; la séptima, la mano del rayo, no declara ninguno.
>
> **Lo siguiente son los dos paneles que quedan**: 31 el inventario de verdad —se
> retira la rejilla inventada de `src/juego/inventario.js`— y 32 Character Info.
> Después, el repositorio con el tag del alfa.

> **EL 29 ESTÁ HECHO: [doc/VGUI_29.md](doc/VGUI_29.md).** El kit de VGUI portado
> —esquema de fuentes, `Panel`, `MSLabel`, `MSButton`, `LineBorder`, el registro
> de paneles— y encima el menú de interacción con la **F**, que es el primero de
> los cuatro paneles que había que rehacer. **813 pruebas y 30 de 30 en la sonda.**
> `npm run sonda:vgui29`.
>
> **LO QUE ESTABA MAL ERAN LAS TECLAS, no sólo el aspecto.** `interfaz.js:874`
> escuchaba `keydown` en la ventana por su cuenta, así que sus pantallas no eran
> del juego: no había tecla reasignable, no respetaban el `config.cfg` y el `1` no
> elegía nada. En Master Sword el reparto está en UN sitio
> (`vgui_teamfortressviewport.cpp:1875-1911`) y eso es lo que se ha portado.
>
> Cuatro fallos del motor van **con el fallo**: el último esquema del archivo no
> recibe sus valores por defecto, `BorderColor` marca la variable de otro color,
> el botón décimo no se puede elegir con el teclado (el `0` da la ranura −1), y
> `GetCenteredItemX` tiene el `−1` fuera del paréntesis.
>
> **Y un quinto que resultó ser NUESTRO y está corregido:** decía que el `if` del
> armero hacía salir «Ask about broken axe» dos veces. Falso, y con sus dos
> citas. Faltaba saber que el motor tiene **dos** `if`: con paréntesis se salta
> sus hijos y sigue; sin ellos **abandona el evento** (`break; //Old if command`,
> `script.cpp:5754-5758`). O sea que no hay duplicado: hay opciones que
> desaparecen, 7 de las 9 de Gate City. Ver [doc/VGUI_29.md](doc/VGUI_29.md) §3.
>
> **Antes de esto, la mudanza.** El port salió de «Mydra Web Lab» a su propia
> carpeta; los experimentos 01-09 se quedaron allí. Ver [ESTRUCTURA.md](ESTRUCTURA.md).
>
> **Lo siguiente son los otros tres paneles**: 30 crear personaje (tres etapas,
> con los personajes en 3D), 31 el inventario de verdad (se retira la rejilla
> inventada), 32 Character Info.

> **El 28 está hecho: [IA_28.md](doc/IA_28.md).** El paso 5 de PROYECTO_10.md
> empezado por donde tocaba: **los 69 bichos de Gate City los decide el
> servidor**. **1 059 pruebas y 15 de 15 controles con dos navegadores.**
> `npm run sonda:ia28`.
>
> **LA DECISIÓN YA ESTABA FUERA DEL VISOR; EL ESTADO NO.** Desde el 17
> `src/play/ia.js` es `npcatk_hunt` y no importa Three — pero *dónde* está un
> goblin vivía en `i.nodo.position` y *qué hace* dentro de un `AnimationMixer`.
> Con la posición dentro de un objeto de dibujo, la única máquina capaz de
> simular un monstruo era un navegador con pantalla: cada pestaña simulaba sus
> propios 69 con su propio `Math.random`, o sea **dos jugadores veían dos
> pueblos**, y nada lo decía porque cada uno veía uno coherente.
>
> Ahora el estado vive en `src/play/manada.js` (sin DOM), el arnés de física del
> servidor en `src/red/fauna.js`, y `src/render/bichos.js` pasa de 953 a 441
> líneas **y es una vista**. Medido: **mediana 0 mm de diferencia entre lo que ve
> un navegador y lo que ve el otro**, con los dos moviéndose.
>
> **EL GOLPE SE PIDE, NO SE HACE.** El cliente manda «he blandido hacia el 17
> con esto»; el servidor recorta el daño al techo del arma que ÉL ve en esas
> manos (la sonda manda 9 999 y apunta **345**), **rebobina** hasta el instante
> que ese jugador estaba viendo —el `objetivoDe` que el 27 dejó medido y sin
> usar— y resuelve. La vida, el parry, la muerte, el grito a los aliados y **la
> experiencia** son del servidor; la experiencia, además, por primera vez se
> reparte entre los jugadores de verdad (`UTIL_TotalHP` sobre la partida entera).
>
> **EL FALLO DE LA TARDE FUE UN CERO SIN ERROR.** Los 69 quietos, 0,00 m en diez
> segundos, 53 con `roam 1`: **Rapier no contesta a un rayo hasta que alguien
> actualiza su árbol de consultas**, y quien lo hacía en el navegador era el paso
> de física de cada fotograma. En el servidor, con la partida vacía, nadie lo
> llamaba — y en cuanto entraba un jugador se arreglaba solo, que habría sido
> peor. Hay control positivo escrito.
>
> Y en la sonda, **tres controles en verde que no medían nada**: el del alcance
> se ejecutaba sobre un cadáver («0 → 0»), el del techo se escondía detrás de la
> vida del bicho, y el de «los dos ven lo mismo» habría salido perfecto con las
> dos pestañas congeladas. Los tres arreglados, con su número.
>
> **Lo que NO está** (IA_28.md §8): con servidor, **el escudo y el parry del
> jugador no se aplican** al daño de un bicho —el servidor no sabe si lo tienes
> desplegado—, las flechas no pasan por la comprobación de distancia, los bichos
> no se pelean entre ellos y no hay reaparición de monstruos.

> **Y detrás, el orden y el idioma: [ORDEN_28.md](doc/ORDEN_28.md).**
>
> **Este proyecto YA TIENE `git`**, que llevaba veintiocho experimentos sin él y
> era lo primero: sin control de versiones, un refactor mecánico de dos mil
> líneas no se puede deshacer.
>
> **`src/main.js` baja de 5 253 a 2 878 líneas** sacando dos cosas que no son el
> juego: la sonda (`src/dev/sonda.js`, 2 045 líneas, el 45 % de `mainGateCity`)
> y el banco de pruebas de los experimentos 01-09 (`src/mirador.js`, que ahora
> se carga bajo demanda y con `?map=gatecity` ni se descarga). Hecho con
> `rollup/parseAst` resolviendo ámbitos, no con expresiones regulares. La sonda
> baja por un **saco de captadores** y no por copias: con copias, las cuentas de
> golpes y muertes se habrían quedado en 0 para siempre y ningún control lo
> habría dicho.
>
> Lo que NO se ha hecho y es la deuda que queda: `mainGateCity` sigue siendo una
> función de 2 600 líneas. Partirla de verdad pide sacar el estado compartido a
> un objeto explícito, y eso es un experimento propio.
>
> **LA INTERFAZ HABLA INGLÉS** y los comentarios y la documentación siguen en
> español. No es sólo un encargo: es lo fiel — Master Sword está en inglés y sus
> propias cadenas ya estaban aquí sin traducir (`parried!`, `has fallen!`). Los
> nombres de las acciones salen de su `gfx/shell/kb_act.lst`.
>
> Y lo mantiene `test/idioma.test.mjs`, que busca las cadenas **por dónde se
> usan y no por su texto**: `"inventario"` es a la vez una etiqueta y el nombre
> de una acción del teclado, y sólo el sitio las distingue. Con su control
> positivo, que es lo que impide que la prueba pase por estar rota.
>
> Dos fallos de sonda salieron por el camino: `text=create` de Playwright casa
> por subcadena y se iba al `<code>CreateChar()</code>` del párrafo, y
> **`sonda:red` llevaba desde el 27 terminando con un `ReferenceError`** — su
> `const errores` estaba dentro del `try` y la línea que decide el código de
> salida, fuera. Imprimía «21 de 21» y luego se caía: el código de salida no
> significaba nada.

## Lo de antes

Aquí abajo había **1 076 líneas más**: los experimentos 04 a 09, el jharro y
Corinth, apiladas por sedimento. Un documento que dice «dónde se quedó esto» no
puede llevar veinte «dónde se quedó» pegados uno detrás de otro, porque entonces
no se lee ninguno — y lo que había al final, que eran los avisos caros, no lo
leía nadie.

Está repartido donde se puede encontrar:

| lo que había | dónde está ahora |
| --- | --- |
| los avisos que cuestan una sesión | [doc/AVISOS.md](doc/AVISOS.md), sin los del laboratorio que aquí no aplican |
| los informes de los experimentos 05 a 09 | [doc/HISTORIA_05_09.md](doc/HISTORIA_05_09.md), enteros y con sus avisos |
| el 06 y el mapa de luz | [doc/FIDELIDAD_06.md](doc/FIDELIDAD_06.md), que es el informe de verdad |
| la iluminación, los `env_glow`, el sRGB | [doc/HISTORIA_05_09.md](doc/HISTORIA_05_09.md), parte 1: son las medidas originales |
| el jharro, Corinth y el laboratorio | sólo en el historial de git. No son este proyecto. |

Y cómo se trabaja aquí —las reglas, y el fallo que ha aparecido cinco veces—
está en [CLAUDE.md](CLAUDE.md), que es lo que conviene leer antes de tocar nada.
