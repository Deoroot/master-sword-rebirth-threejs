# Avisos que cuestan una sesión si se olvidan

Esto es lo que ha mordido de verdad, con el caso que lo enseñó. Estaba enterrado
en las últimas doscientas líneas de `NEXT_SESSION.md`, que nadie leía porque el
documento decía «dónde se quedó esto» y llevaba veinte «dónde se quedó» apilados.

Se han dejado fuera los avisos del laboratorio anterior que sólo valían para
generar niveles por procedimiento —el jharro, Corinth—, porque aquí no se genera
nada: se lee un `.bsp` que ya existe. Están en el historial de git si hicieran
falta.

---

## Medir

- **Un cociente con el denominador equivocado no da error.** Contando luces por
  metro de *huella*, Gate City parecía tener siete veces más luz en el pueblo que
  fuera; por metro de *suelo* —que es lo que se ilumina— son 2,4 veces. Se
  escribió, se dio por bueno y estuvo a punto de ser un objetivo: habría
  triplicado los faroles del pueblo y dejado la cueva a oscuras, **con la
  comprobación en verde**.

- **Una cifra global no ve un problema de reparto.** Tres veces ya. 256 celdas
  apiñadas en una esquina y 256 repartidas dan el mismo relleno del 31 %. Contra
  esto hace falta una segunda cifra que mida la **forma**, o el dibujo.

- **Un sesgo del medidor no se corrige mintiendo, se corrige midiendo.** Si el
  método reparte cada cara por su caja, ese sesgo está también en la medida de
  Gate City: lo que hay que igualar es la curva **medida**, no la teórica. `GAMMA`
  es ese número y hay una prueba que falla si alguien lo quita.

- **Copiar un número medido sin preguntarse qué es puede hacer el mundo
  intransitable.** El p10 de altura libre de Gate City son 0,8 m. Eso no son
  pasillos de ochenta centímetros: son salientes sobre un suelo que sí se pisa.

- **Un valor por defecto plausible es un fallo silencioso.** Si no está el dato,
  que se note; inventarse algo razonable es lo que hace que nadie lo busque.

## Sondas

- **Una sonda sin control es una sonda que dice que sí.** Y una sonda con control
  pero mal escrita es peor: acusa a quien no es y se pierde la sesión arreglando
  lo que estaba bien.

- **La cobertura no vale como sonda a oscuras.** Mide píxeles que no son del color
  de la niebla, y con la niebla casi negra la roca sin farol tampoco lo es: un
  pasillo a oscuras marcó **95,7 % de cobertura siendo una pantalla negra**. Lo
  que vale es la luminancia —qué fracción pasa de 32 sobre 255—, y esa misma toma
  daba 0,0 %. *Es el mismo animal que el apartado 4 de [CLAUDE.md](../CLAUDE.md),
  y es el caso más viejo de los cinco.*

- **Playwright no repite teclas.** `keyboard.down("Escape")` + esperar manda **un
  solo** `keyDown`: la repetición automática la hace el sistema operativo. Un
  control de «aguantar una tecla» escrito así mide el transporte de la sonda, no
  el juego. Lo que sí funciona es llamar `down()` varias veces sin `up()` en
  medio, que lleva `repeat: true`.

- **Las sondas entran por donde entra el jugador, y eso se rompe en silencio.**
  Las 22 sondas cargaban `?map=gatecity`, que desde el experimento 36 ya no es
  por donde se entra. Se rompió la regla en las 22 a la vez y **ninguna se puso
  roja**.

## Navegador y motores

- **`castRay` no toca nada hasta el primer `world.step()`.** El mundo de Rapier no
  existe para los rayos hasta que ha dado un paso.

- **`readPixels` después del intercambio de buffer devuelve NEGRO.** Hay que
  leerlo antes, o pedir `preserveDrawingBuffer`.

- **Un `<canvas>` recién creado mide 300x150.** Es la definición del elemento, no
  un tamaño real. Medir `width`/`height` para saber si algo se montó da verde con
  todo sin montar. Lo mismo con `offsetWidth` de algo que se monta escondido.

- **`-0` no es `0` para `Object.is`.** En un assert de igualdad estricta eso es un
  rojo que no significa nada; `Math.abs` lo resuelve.

- **glTF pone el origen de la UV arriba**, y una UV fuera de su recuadro del atlas
  pinta otro material sin dar ningún error.

- **Los atajos de ventana del navegador no son cancelables.** `preventDefault()`
  no salva Ctrl+W. Sólo la Keyboard Lock API, y sólo a pantalla completa.

## GoldSrc y Half-Life

- **La escala de GoldSrc es 39,37 u/m, no 32.** Es la de Quake y no es la de
  aquí.

- **Hay dos builds de Master Sword.** La de Xash3D es standalone; la de GoldSrc es
  un mod y el motor **monta `valve/` detrás siempre**. No encontrar un archivo en
  `assets/msr` es correcto; concluir que el juego no lo tiene, no.

- **Un farol no alcanza su alcance.** Three.js multiplica la luz de un punto por
  una ventana que a nueve décimos del radio ya ha recortado el 96 %. GoldSrc
  hornea con caída **lineal** hasta el radio. Copiar la proporción sin copiar el
  modelo es medir con otra vara.

- **Los `*_english.txt` de Valve son UTF-16 con BOM.** Leerlos como UTF-8 da una
  cadena con un cero entre cada letra: parece que funciona y no encuentra nada.

- **`r.ok` no basta con el servidor de desarrollo.** Vite contesta el
  `index.html` a lo que no encuentra: un 200 con `<!doctype` dentro, y el
  `r.json()` revienta con «Unexpected token '<'» sin decir qué archivo falta.
  Hay que mirar el `content-type`. Está en `src/play/json.js`, en un solo sitio,
  porque cuando se arregló a mano se quedó a medias en cinco (47, 48).

- **Una entidad de brushes NO es un brush.** Es un modelo, y puede tener diez.
  Meter los planos de todas sus caras en una lista da la intersección, no la
  unión: un volumen vacío. La forma está en su árbol BSP, una pieza convexa por
  hoja ocupada (48).

- **El agua y los disparadores no se prueban con el mismo casco.** El agua es
  `PM_HullPointContents(hulls[0], ...) != -1` y el contenido lo pone el `skin`
  de la entidad (`pmovetst.cpp:134-156`); un disparador es la caja PRIMERO y
  luego el casco del tamaño del que toca —1 de pie, 3 agachado— exigiendo
  `CONTENTS_SOLID` (`world.cpp:362-377`). Los cascos 1 a 3 son el brush
  engordado media caja de jugador, así que sus piezas **se salen de `mins`/
  `maxs` del modelo**: recortarlas con esa caja los devuelve idénticos al casco
  0 sin dar error (48).

- **El orden de los cascos no es el de `player_mins[]`.** En el modelo
  (`model.cpp:1107-1136`) el 1 es de pie, el **2 es el grande** y el 3 el
  agachado; `player_mins[]` (`pmove.cpp:36`) va por `usehull` y es otro orden.

- **En el lump de luz pueden sobrar bytes al final.** 36 de los 92 mapas del
  juego traen de 363 a 2 928 ceros que ninguna cara reclama. El motor no los
  ve: copia el lump entero y luego indexa por `lightofs` (`model.cpp:651`).
  Exigir que los bloques SUMEN el lump es más estricto que el motor (48).

- **Un modelo con la mitad de los triángulos en contra de su normal puede estar
  bien.** Si cada uno tiene un gemelo en las mismas tres posiciones, es una
  pieza de DOBLE CARA: en GoldSrc no hay `doubleSided` y se modela dos veces.
  Un bobinado de verdad invertido da el 100 % y ni un gemelo (48).

- **`FireTargets` usa a TODAS las entidades con ese `targetname`**, no a la
  primera — y `Q_strcmp` (`pr_cmds.cpp:942`) distingue mayúsculas, así que un
  `target` con una letra cambiada no encuentra a nadie y no da error (49).

- **Un `multi_manager` convierte en objetivo toda clave que no reconozca.**
  Quién la reconoce antes es la tabla de 77 campos de `entvars_t`
  (`util.cpp:209`), y `style`, `delay` y `killtarget` NO están en ella (49).

- **Un `multisource` sin entradas está abierto, no cerrado**, y
  `UTIL_IsMasterTriggered` sólo mira a la primera entidad con ese nombre: si no
  es un maestro, devuelve 1 y deja pasar (49).

- **Un fallo portado tiene que distinguirse del bueno por UN SOLO OPERADOR.**
  Si se escribe dos veces —la condición invertida y además el efecto anulado a
  mano— romperlo a propósito da cero rojos y el port no se puede comprobar.
  Pasó con el `SUB_UseTargets` de `CBaseEntity` (49).

- **`grep` no sabe contar nombres en este repositorio**, y no por casualidad:
  como los comentarios van en español por regla de la casa, los identificadores
  en español —`partida`, `muneco`, `equipo`— son los que más aparecen en prosa.
  Un `grep -n '\bpartida\b'` sobre `src/main.js` dio 19 usos; referencias de
  verdad hay 3. Para contar acoplamiento se usa `tools/nombres.mjs`, que parsea
  (56).

- **Un instrumento de medida escrito en la línea de órdenes no se puede
  revisar**, porque al día siguiente no existe. Los dos contadores que dieron
  números falsos —el «salen al juego: 0» del 55 y los «19 usos» del 56— eran
  los dos `node -e` de usar y tirar. Un instrumento se guarda en `tools/` y
  lleva su propio control (56).

- **Un reemplazo de texto sobre JavaScript no distingue un nombre de una
  clave**, y hay tres formas de escribir una clave: `nombre:`, la taquigrafía
  `{ nombre }` y el getter `get nombre()`. El último no lleva dos puntos, así
  que un lookahead `(?!\s*:)` lo deja pasar y produce `get equipo.brazo()`.
  Lo caza el compilador, no una prueba (55, 56).

- **Dos funciones con un parámetro que se llama igual pueden querer cosas
  distintas.** `buscarActividad` esperaba `azar = (n) => entero en [0,n)` y era
  la única del proyecto; todas las demás usan `azar = Math.random`, que ignora
  el argumento. `Manada` le pasaba el de la casa, así que `azar(total) < peso`
  era `Math.random() < peso` —siempre cierto— y ganaba siempre la última
  candidata. El sorteo de la pose de reposo **no existió nunca**, sin un solo
  error, y con la prueba de reparto en verde porque se pasaba su propio dado
  del tipo correcto (59).

- **Una prueba que le pasa a la función el argumento bien formado no comprueba
  que el llamador lo haga.** Es el apartado 4 en la frontera entre dos
  funciones: el mecanismo funciona, la prueba lo demuestra, y en el juego no se
  dispara. Si la función tiene un valor por omisión, la prueba lo usa (59).

- **Un ayudante de sonda puede fabricar un estado que el juego no tiene.**
  `probe.vivo.congelarPaseo(true)` deja a 46 de los 69 bichos clavados con la
  animación de andar puesta, porque el reinicio va en el paso del vagabundo y
  congelarlo lo apaga. Medir «bichos parados» con él mide otro juego (59).

- **Las pulsaciones del menú son un gesto del usuario.** Cualquier control que
  afirme algo sobre el estado «al cargar» —el `AudioContext` suspendido, el
  teclado sin atrapar, el puntero suelto— tiene que medirse ANTES del primer
  clic, no después de recorrer el menú (59).

- **Agrupar por especie y agrupar por individuo no es lo mismo, y con 69
  bichos parece que sí.** `poses()` agrupaba por `ficha.nombre`, así que «dos
  enanos, cada uno en su pose» y «un enano que cambió de pose» daban la misma
  lista. La clave de un `Map` puede ser un verde vacío (59).

- **Un mensaje en la esquina equivocada no da ningún error.** El mod escribe en
  tres sitios —`SendInfoMsg` abajo a la derecha, `SendHUDMsg` arriba a la
  izquierda (`player.h:554` lo lleva en el comentario), `SendHelpMsg` arriba a
  la derecha— y este puerto mandaba los tres al primero. La presentación del
  mapa y el anuncio de subir de nivel salían entre los golpes. Las reglas
  estaban bien y probadas; lo que nadie miraba era **el enrutado**, la línea
  que decide a qué caja va. No es un verde que no mide nada: es un verde que
  mide otra cosa (60).

- **Un control negativo sobre una lista que se vacía sola puede pasar por estar
  vacía.** «Ninguno de estos mensajes está en la consola» pasaba porque catorce
  segundos después la consola se había vaciado (`ms_evthud_decaytime` son
  nueve). Lo cazó el positivo de al lado, que estaba puesto justo para eso (60).

- **Un reloj que avanza por dos sitios no se puede usar para contar.** La capa
  de mensajes recibe su `dt` del bucle del juego Y de `probe.aviso.paso()`, así
  que «cuántas ventanas quedan a los siete segundos» dependía de lo que
  hubieran tardado las medidas anteriores de la sonda. Se mide una recién
  puesta y por su propio reloj (60).

- **Un NPC de Master Sword casi nunca trae su menú: lo hereda.**
  `game_menu_getoptions` vive en `monsters/base_npc_vendor` y compañía, no en
  el archivo del NPC. Buscarlo en el texto crudo encuentra 139 de los 2 884
  scripts; buscarlo tras resolver los `#include`, 262. Y no se notaba porque
  los 25 de Gate City lo declaran ellos mismos, los 25 (60).

- **Un `build/` rancio se ve exactamente igual que un extractor roto.**
  `build/edana/guiones.json` lo horneó el 50 antes de que hubiera `bichos.json`
  de Edana, así que el extractor cayó en su rama de respaldo y guardó los 139
  de todo MSR: de los 22 NPC del pueblo, 9. Los otros 13 estaban mudos. Lo que
  los arregla es volver a hornear, no el arreglo del extractor — se separó
  rompiendo uno con el otro puesto, porque decirlo junto habría sido atribuir
  un efecto a quien no es (60).

- **La F sin nadie delante abre el menú del PROPIO jugador**, con su título y
  sus botones. Una sonda que se planta mal y pulsa la F mide un panel
  `interact` lleno de opciones y da todos los controles en verde. Hay que
  comprobar `probe.vgui.delante()` ANTES de pulsar (60).

- **La Escape abre el menú principal cuando no hay nada abierto.** Un bucle de
  sonda que empieza cada vuelta cerrando «lo del anterior» deja al primero de
  la lista sin medir: la Escape abre el menú y el menú se come la tecla (60).

- **Un bloque `{ … }` sin nombre de evento se EJECUTA entero, no es una lista
  de constantes.** El motor le pone `fNextExecutionTime = 0` y corre en el
  primer `Think` (script.cpp:5198-5202). Leer sólo sus `const` y `setvar` deja
  fuera el modismo con el que las plantillas ponen sus valores por omisión
  —`if( X equals 'X' ) setvard X 1`—, y por eso todos los vendedores salían sin
  «1. Buy» (60).

- **Dos paneles en la misma pila: el que se abre y el que se cierra.** El menú
  del original manda la orden y LUEGO se esconde, y se libra porque la
  respuesta viene del servidor varios fotogramas después. Aquí el guion corre
  en la misma pila, así que el `HideMenu` cierra el panel que la orden acaba de
  abrir. Pasó dos veces el mismo día. La ida y vuelta al servidor se traduce
  con un `setTimeout(0)`, o cerrando antes de abrir (60).

- **Un fallo entre dos piezas que funcionan no lo ve ninguna prueba de las
  dos.** El modelo de tiendas estaba probado desde el 44 y el catálogo también;
  lo que nadie probaba es la línea que los junta, y esa línea pedía
  `catalogo.porId` cuando le pasaban el `Map`. Ninguna tienda del juego tenía
  un solo objeto, en los dos mapas, sin un error — porque el fallo caía en el
  cajón de «el guion pide algo que no tenemos» (60).

- **`location.search = "?a=1"` REEMPLAZA la cadena entera.** Parece que añade y
  no: se lleva por delante todos los demás parámetros. El único otro que hay
  aquí es `red=ws://…`, así que cambiar de mapa desde «Create Server» te sacaba
  de la partida en silencio. Se construye con `URLSearchParams` a partir de la
  que hay, y se hace `set` de lo que cambia (61).

- **Recorrer manejadores de Playwright mientras la página navega revienta.**
  «Execution context was destroyed» o «Element is not attached to the DOM»,
  según el instante. `await pag.$$(sel)` congela una lista y luego se le pide
  `textContent` a cada uno; si entre medias hay una recarga —y «Start» recarga
  cuando cambias de mapa— la lista vale para nada. Un `locator().filter()` se
  resuelve de una vez dentro de la página y reintenta solo (61).

- **Las constantes del motor están en unidades de GoldSrc y los cuerpos en
  metros.** `SPEECH_LOCAL_RANGE 300` comparado sin convertir contra una
  distancia en metros da un rango de 11 811 unidades: el «local» se oía desde
  el otro extremo del mapa y los tres canales de chat pasaban a ser el mismo
  con distinto color. La constante se queda en unidades, que es donde se puede
  citar; la conversión va donde está la escala del mundo (61).

- **Un umbral copiado de un mapa mide ese mapa.** `triangulos > 40000` son los
  41 494 de Gate City escritos a mano, y en Edana —33 087— el control se ponía
  rojo con el mapa perfectamente dibujado. Si lo que se quiere saber es que
  algo SIGUE en pie, se compara contra lo que había al entrar (61).

- **Un reloj de decaimiento ya armado no se entera del cvar nuevo.**
  `m_ShrinkTime` se fija una vez con el `m_DecayTime->value` que hubiera
  entonces (vgui_eventconsole.h:296-300), así que bajar el cvar con la cuenta
  en marcha no la acorta, y una sonda que lo baje y adelante el reloj mide un
  cero que no significa nada. Se rearma por donde lo rearma el juego:
  `StepInput`, o sea RePág (61).

- **Andar «un rato fijo» mide el terreno tanto como la distancia.** El mismo
  `esperar(11000)` dio 925 unidades una vuelta y 271 la siguiente, porque
  Edana tiene una cuesta y un muro donde Gate City no los tiene. Se anda hasta
  llegar, girando si se atasca, y el control deja de depender de dónde caiga
  el punto de aparición (61).

- **`renderer.info.render` se pone a cero en CADA `render()`, así que mide la
  última pasada y no el fotograma.** Durante el paseo del menú se dibuja dos
  veces —la escena a un destino intermedio y el destino a la pantalla— y la
  segunda es el triángulo grande de pantalla completa de
  `src/render/pasadamenu.js`. El control de `arranque36` que dice «hay una
  escena dibujándose» leía **1 triángulo** con el pueblo entero delante. Con
  `info.autoReset = false` e `info.reset()` acumula las dos y sale 368 212 (61).

- **Un identificador que cruza una frontera puede cambiar de tipo sin avisar.**
  `Comercio` guarda sus claves como `String(vendedor)` —para que el `24` y el
  `"24"` sean el mismo— y devolvía **la clave** en vez del vendedor. Quien
  recibía `"24"` y lo pasaba a un `manada.de(id)` que indexa un array recibía
  `null`, concluía que el cliente no estaba y cerraba el trato en el fotograma
  siguiente. Se veía como «The vendor is busy» al comprar, con el comprador
  pegado al vendedor: un fallo en la costura, no en la regla (62).

- **Cada vuelta de sonda deja un `vite` huérfano, y se acumulan.** El
  `taskkill` mata el `cmd.exe` y el nieto sobrevive (ya está dicho en
  `sondas/red.mjs` desde el 27). Lo que no estaba dicho es el efecto: **al cabo
  de una docena de vueltas el servidor deja de llegar a sus plazos** —picos de
  1 657 ms donde había 0,36— y la sonda falla con «el servidor no contestó»,
  que parece de la red y es de la máquina. Se limpian con
  `Get-CimInstance Win32_Process` filtrando por la carpeta del proyecto (62).

- **Un clic de Playwright que provoca su propia navegación necesita
  `noWaitAfter: true`.** Si no, espera a que la navegación se asiente con el
  manejador ya desprendido: «element was detached from the DOM, retrying». Le
  pasa al «Start» del menú, que recarga cuando el mapa elegido no es el del
  fondo (62).

- **El estante de un vendedor no se llena de golpe.** El guion suelta
  `addstoreitem` a lo largo de varios pasos, así que contar las filas «un rato
  después» da 18 una vuelta, 16 la siguiente y 1 la de más allá — y entonces el
  control mide cuándo miraste. Se espera a que dos lecturas seguidas den lo
  mismo (62).

- **«Dos lecturas iguales» no basta si la primera puede ser una.** La espera
  del estante de arriba se conformaba con `n > 0`, y una vuelta dio **1 fila**:
  el guion había soltado el primer `addstoreitem` y aún no el segundo, así que
  dos lecturas seguidas daban 1 y la sonda se lo creyó. Un estante de una fila
  no está quieto: está a medio llenar. Una espera por efecto también necesita
  saber cuál es el valor de reposo (63).

- **Con un panel del juego delante, la Escape abre el MENÚ.** Y el menú se come
  las teclas: el jugador de la sonda se quedaba clavado en el sitio y el
  control de al lado leía un cero que no medía nada. El propio HUD lo dice
  —«Esc menu»—. Se cierra el panel por su nombre, no con la Escape (63).

- **Un `?.()` sobre una función que no existe es un no-op silencioso.** Dos
  sondas llamaban a `probe.vgui.cerrar?.()`, que **no estaba en el `probe`**:
  el `?.` se lo tragaba, el panel seguía delante y todo lo de después medía
  otra cosa. El encadenamiento opcional protege de `undefined` y también
  esconde las erratas de nombre (63).

- **Nacer pegado a un NPC encaja al jugador.** A 40 cm de Krythos —dentro de su
  cilindro— el cuerpo se movía **0,00 m** en diez direcciones seguidas, con la
  tecla llegando (`pulsada("adelante")` → `true`), el puntero capturado y nada
  atrapando el ratón. No era Playwright ni la red. Y a dos metros anda pero la
  F le apunta a sí mismo: el sitio bueno **no se puede elegir de antemano**, se
  anda hasta él esperando a que `delante()` sea el vendedor (63).

- **`?? 1` no protege de un 0.** `iBundleAmt` vale **cero** por omisión
  (npcscript.cpp:772-774), así que `for (k < r.entregadas ?? 1)` no daba ni una
  vuelta: el servidor restaba el oro, decía «You receive Sharp Knife.» y la
  mochila se quedaba igual. El motor usa `V_max(..., 1)`, que es otra cosa. Un
  valor por omisión de cero convierte cualquier `??` en decoración (63).

- **Dar algo «al jugador» desde el navegador, con red, es dárselo a nadie.**
  `probe.misiones.oro(5000)` pintaba un 5000 en la pantalla y el servidor
  —que es quien resta— seguía sin un duro: contestaba «You can't afford …»,
  que era verdad, y el control leía el 5000 de la ventana. La misma frontera
  que mover el cuerpo: lo que es del servidor se pide al servidor, y para eso
  están `--nacer` y `--oro` (63).

- **Un comando portado que no llega y una ventana portada que nadie abre son
  la misma línea que falta.** `helptip` estaba en la lista de comandos desde el
  33, se quedaba con dos de sus cuatro parámetros y tiraba el resto, con un
  comentario que decía «la ventana de consejos no está portada». La ventana
  estaba portada desde el 60 y su único usuario en todo el proyecto era
  `window.probe`. Cuatro experimentos esperándose el uno al otro, sin un solo
  error. Cuando un comentario diga «X no está portado», compruébalo: puede que
  lo escribiera alguien que miró antes de que lo estuviera (64).

- **Una directiva del CARGADOR no es un comando.** `repeatdelay` se resuelve
  mientras se lee el archivo (script.cpp:5377-5382), no cuando alguien lo
  ejecuta, así que un evento con `repeatdelay` **arranca solo al cargar el
  guion** — eso contesta quién llama a `player_regen_hp`: nadie. Y como
  `SCRIPTCONST` es «loadtime only» y `atof` de un nombre da 0, si el retardo es
  una variable que aún no existe, **la primera vuelta sale en el acto**. Leer
  sólo la mitad del intérprete da una regla que parece igual y no lo es (64).

- **Una variable local a la función de arranque no la ve la que monta el
  mundo.** `src/main.js` tiene funciones grandes que parecen el mismo ámbito y
  no lo son: `arrancarJuego` cargaba la ficha del guion del jugador y
  `montarLosBichos` la usaba. No dio ni un error de página — la sonda dijo
  «cargado false» y ya. Lo que se usa desde dos funciones va al módulo (64).

- **Una sonda que RECALCULA en vez de leer deja de ser un testigo.**
  `src/dev/sonda.js` tenía su copia de las tres líneas que colocan la cámara,
  con un comentario encima avisando de que repetirlas acabaría midiendo «una
  cámara que el jugador no ve». Cuando el guion del jugador empezó a hundir la
  vista al aterrizar, el juego se la sumaba y **la copia la borraba al
  medirla**. El aviso estaba escrito sobre la propia línea que falló (65).

- **Una interfaz por VARIABLE no avisa a nadie.** El guion de Master Sword
  mueve la cámara escribiendo `game.cleffect.view_ofs.z`, y el cliente la lee
  cada fotograma (hudscript.cpp:208-221). No hay comando, no hay evento y no
  hay quien se entere: si el que dibuja no pregunta, el efecto no existe y
  nada da error. Al portar, esto se busca al revés — desde las variables que
  el guion escribe y nadie lee (65).

- **`game.time` no estaba, y una variable que no existe vale 0.** El
  hundimiento de la vista se guarda como `setvard GROUNDBOB_STARTTIME
  game.time` y el evento siguiente arranca con `if GROUNDBOB_STARTTIME`: sin
  resolver `game.time`, la variable guardaba la cadena, valía 0 y la condición
  era falsa **siempre**. El mecanismo entero escrito y sin arrancar. Y el
  corolario para las pruebas: con el reloj en 0 tampoco arranca —eso es fiel—,
  así que una prueba de esto empieza su reloj más tarde (65).

- **Un «X de Y» donde `Y` se calcula al final no puede bajar nunca.**
  `sonda:arranque36` declara 30 controles, se caía en el 22 por un
  `waitForFunction` agotado y remataba con «22 de 22 en verde», con el fallo en
  una nota al pie. Los ocho que no corrían incluían el control del experimento
  50. Si una sonda puede salir por un `catch`, esa salida tiene que empujar una
  ROJA a la lista; si no, el marcador cuenta lo que sobrevivió (65).

- **El `#include` se resuelve EN SU LÍNEA, y `const` gana el primero.** Las dos
  cosas juntas son lo que hace que un guion de Master Sword funcione: el objeto
  declara sus números arriba y el `#include` que dice qué es va debajo
  (script.cpp:5229, 5255 y 5419-5433). Un cargador que suba los `#include` al
  principio le da a cada entidad los valores de su plantilla, **sin un solo
  error**: 2 623 `const` en 593 de los 760 objetos, el goblin muriendo en
  silencio y 61 de los 63 pergaminos enseñando el mismo hechizo. Y el comentario
  del cargador decía la regla correcta mientras el código hacía lo contrario, así
  que leerlo no salvaba (66).

- **Un gancho vacío es un sitio donde una regla puede vivir sin correr.**
  `llamarExterno: () => {}` era el no-op de `callexternal` en los dos entornos,
  así que ningún objeto de Master Sword había encendido nunca nada en el jugador
  —63 eventos suyos que sólo un objeto puede llamar, 23 corriendo enteros, cero
  llamados—. Es la misma forma que el parámetro con valor por omisión del 62 y la
  prueba que construye su argumento del 59: el mecanismo está, se prueba, y el
  camino hasta él no existe. Al rellenar `entornoVacio()` con un `=> {}`, hay que
  apuntar quién debería llamarlo (66).

- **Curar a alguien pasado de vida se la BAJA.** `V_min(Max - Current, Amt)` sale
  negativo si `Current > Max` (msmonsterserver.cpp:1971-1999), así que `givehp`
  recorta al tope en vez de no hacer nada. Y un personaje nuevo tiene **15** de
  vida máxima. Una sonda que hiera poniendo la vida a 20 está midiendo un estado
  que el juego no produce, y verá bajar la vida con el juego correcto (66).

- **En Master Sword el máximo de vida NO se guarda.** Se deriva de las nueve
  habilidades cada vez (`GetStat`, msmonstershared.cpp:514). Un entorno de guion
  que conteste `$get(ent,maxhp)` leyendo un `personaje.vidaMax` que nadie escribe
  devuelve **la vida actual**, y entonces toda guarda «estoy herido»
  —`if ( MY_CUR_HEALTH < MY_MAX_HEALTH )`— es falsa siempre. El objeto corre,
  pide cosas y no hace nada (66).

- **`givehp [target] <amt>`: el objetivo es OPCIONAL.** Con un solo parámetro es
  la entidad del guion (scriptcmds.cpp:3434, 3443-3449), y un objeto se lo pasa
  a su dueño (`CGenericItem::Give`, genericitem.cpp:2298-2302). El puerto pedía
  dos y con uno se iba en silencio: el guion del jugador siempre escribe
  `givehp ent_me …` y funcionaba, pero los objetos lo escriben con uno y ninguno
  curaba. Que un comando funcione para un tipo de entidad no dice nada del
  otro (66).

- **Cuidado con los dos `GetSkillStat`.** `GetSkillStat(idx, prop)` devuelve esa
  propiedad; `GetSkillStat(idx)` —un argumento— es `GetStat(idx, 1)`
  (msmonster.h:416) y acaba en `CStat::Value()`, la media redondeada con suelo de
  uno. Con (10, 20, 30) la propiedad 0 da 10, la suma 60 y la media **20**:
  confundirlas da un número plausible y falso. Y `skill.…` se parsea con
  `contains`, no con igualdad, y `.max` se comprueba antes de mirar si la
  habilidad existe (66).

## `scriptfile` gana a `defscriptfile`, y no depende del orden (67)

```cpp
else if (FStrEq(pkvd->szKeyName, "scriptfile") ||
    (FStrEq(pkvd->szKeyName, "defscriptfile") && !m_ScriptName))
                                       msmonsterserver.cpp:415-416
```

La primera rama es **incondicional**, así que da igual cuál venga antes en la
entidad. `defscriptfile` es el valor por omisión que el editor deja puesto.
Leerlo al revés afecta a **3 373 criaturas en 81 mapas** y no da un error: da
bichos plausibles que no son los del juego. Ver `guionDeEntidad` en
`src/bsp/script.js`.

## El daño de un ataque se declara de TRES maneras (67)

`ATTACK_DAMAGE` (115 ficheros), un `dodamage` cuyo daño es una constante que se
llama como la animación (280) y el par `ATTACK_DAMAGE_LOW`/`_HIGH` (49). Un
bicho al que le falte el suyo **te persigue, te embiste y no te quita vida**, sin
un error. Ver `danoDeEvento` y `parDeRango` en `src/bsp/script.js`.

## `game.serverside` detrás de un `if` sin paréntesis abandona el evento (67)

El `if` VIEJO no se salta una línea: hace `break` del bloque
(`script.cpp:5754-5758`). Hay **280 `if game.serverside`** y 16
`if game.clientside` sin paréntesis en los 2 884 scripts, y uno de ellos está en
el comando 3 de 20 de `game_player_putinworld`, que es el evento con el que un
mapa de Master Sword se enciende. Este puerto es el lado servidor: `serverside`
vale 1 y `clientside` 0.

## Un `multi_manager` con `spawnflags 1` se CLONA y corre la copia (67)

`SF_MULTIMAN_THREAD` (`triggers.cpp:469-474`). El original nunca se ejecuta él,
así que su `Use` no se desactiva y siempre se le puede volver a disparar. Sin
clonar, cualquier cadena que se realimente **se rechaza a sí misma en el segundo
ciclo**: la taberna de Edana recibía un parroquiano de once. Y los clones hay que
reutilizarlos, porque aquí la lista de entidades es fija y el motor los borra.

## `probe.mundo.disparar()` no aplica los efectos: los deja en la bandeja (67)

Quien los aplica es el bucle del juego. Una sonda que dispare y lea en la misma
vuelta lee cero con todo bien. Hay que esperar un fotograma.

## Al morir, `sesion.vitales()` se queda sin personaje (67)

O sea que una sonda de combate que lea la vida **una sola vez al final** se cae
con un `null` justo cuando el resultado es el más contundente: te han matado. Se
muestrea y se guarda el mínimo. Lo mismo con `ia.atacantes()`, que se vacía al
morir el objetivo.

## `spawnstart 1` significa «NO salgas hasta que te llamen» (68)

Es `m_fSpawnOnTrigger = true` (`msmapents.cpp:827-844`). El nombre dice lo
contrario de lo que hace, y encima de esa línea hay **cuatro intentos de Thothie
de arreglarlo, comentados uno debajo de otro y todos con «fail»**. Se porta lo que
el código hace.

Y sólo frena la PRIMERA aparición: `lives == livesleft` es la tercera mitad de la
condición (`:1212`), así que una ficha que ya salió y murió vuelve sola sin que
nadie la llame. «Por disparo» suena a «siempre», y no lo es.

## `killtarget` en un `msmonster_*` no mata: DISPARA (68)

`if (m_iszKillTarget.len() > 0) FireTargets(...)` (`msmonsterserver.cpp:2568-2569`).
No es la `killtarget` de `CBaseDelay`, que sí borra entidades (`subs.cpp:289-302`):
**misma clave, efecto opuesto según en qué entidad esté**. Y va en el camino de la
muerte, así que se dispara en CADA muerte del bicho y no al agotar sus vidas —
eso es `perishtarget`, que es otra cosa y está en `RespawnMonster`.

## Un relé con `delay` NUNCA puede abrir un `multisource` (68)

Lo avisa el mod en la primera línea de `CMultiSource::Use`
(`buttons.cpp:173-176`): *«can't used multi_source with triggers that have a
delay. If they have a delay, a copy is created and that copy's address doesn't
match up with the original»*.

La copia es real: `CBaseDelay::SUB_UseTargets` crea una entidad nueva llamada
`"DelayedUse"` cuando `m_flDelay != 0` (`subs.cpp:252-269`), le copia el `target`,
le pone `m_flDelay = 0` «to prevent recursion» y se va. Esa copia no existía
cuando `Register` corrió, así que el multisource la rechaza por no ser miembro.

Es lo que deja sin salir al jefe jabalí de Edana. **Antes de escribir «está roto
aquí», busca si el propio mod ya dice dónde.**

## Hay DOS `SUB_UseTargets` y no son virtuales (68, amplía el 67)

| clase | línea | condición | funciona |
| --- | --- | --- | --- |
| `CBaseDelay::SUB_UseTargets` | `subs.cpp:307` | `if (!FStringNull(pev->target))` | sí |
| `CBaseEntity::SUB_UseTargets` | `subs.cpp:197` | `if (!pev->target)` | **no: invertida** |

No son virtuales (`cbase.h:507` y `:732`), así que **la elige el compilador por el
tipo estático**. `CTriggerRelay : CBaseDelay` usa la buena; `CMultiSource :
CPointEntity : CBaseEntity` usa la rota. Saber de qué hereda una entidad decide si
dispara o no.

Y ojo con el falso tercer fallo: `CBaseDelay::SUB_UseTargets` empieza con
`if (!pev->target && !m_iszKillTarget) return;` (`subs.cpp:246`) y lleva el mismo
comentario de Thothie sobre `FStringNull`. **Ahí la condición es correcta**,
porque guarda un `return` y no un disparo. La misma mano cambió lo mismo en dos
sitios: en uno es inocuo y en el otro es fatal.

## Las entradas de un `multisource` son quien le APUNTA (68)

`FIND_ENTITY_BY_STRING(NULL, "target", STRING(pev->targetname))`
(`buttons.cpp:241-270`), al revés de todo lo demás: no se declaran, se descubren.
Y **una lista de entradas vacía significa ABIERTO**, no cerrado (`i == m_iTotal`
con los dos a cero, `:233-238`), que es lo contrario de lo que uno espera de una
reja.

## `censo().lista` de la sonda no trae `muerto`, sólo `dormido` (68)

Un cadáver de Master Sword tarda en desvanecerse y hasta entonces sigue en el
censo **despierto**. Filtrar por `!dormido` para «los que están vivos» hizo que una
sonda se pasara **720 llamadas rematando cadáveres** y contara eso como progreso.
El `muerto` está en `probe.golpe.victima(n)`.

Y `probe.golpe.matar(n)`/`victima(n)` indexan sobre **los hostiles**, no sobre
`censo().lista`; la lista se reordena en cuanto uno se duerme, así que hay que
rebuscar el índice en cada vuelta o se mata a otro vecino.

---

## Un rayo dentro de un trimesh no toca nada (el 69)

Los colisionadores de las puertas y de los rompibles son **trimesh**, y un
trimesh **no tiene interior**: un rayo que empieza y acaba dentro de la caja no
cruza ni un triángulo, así que `castRay` devuelve nada. Un «¿hay algo sólido
aquí?» centrado en la caja dice **no** con la caja puesta. El rayo tiene que
entrar desde fuera y cruzar una cara.

## El control en el aire de GoldSrc es casi cero (el 69)

Después de `probe.mundo.poner(...)` el jugador está en el aire, y andar en el aire
no avanza: **27 cm en dos segundos y medio**. Antes de medir cualquier cosa que
dependa de andar hay que dejarlo caer —`player.step(DT, {})` hasta que
`grounded`— o se mide el aire. Y lo peor es que se parece a «hay una pared
delante»: lo que lo distingue es andar hacia el lado libre y ver que avanza lo
mismo.

## El alcance de un arma se mide en tres dimensiones (el 69)

La espada oxidada alcanza **1,52 m**. Un almiar está en el suelo y el ojo a metro
y medio, así que a **un metro en horizontal** el centro del almiar está a **1,56 m
del ojo** y el mandoble no llega. Parece que el cono está mal y es Pitágoras. Para
ponerse a tiro hay que descontar la altura:
`horizontal = √(alcance² − Δy²)`, que es lo que hace `probe.mundo.irAlRompible`.

## `probe.mundo.disparosSinPortar()` no existe (el 69)

Está dentro de `probe.mundo.disparadores().sinPortar`, y es un objeto, no un
`Map`. Llamarlo como función devuelve `undefined`, `Object.fromEntries(undefined
?? [])` da `{}` sin error, y entonces todos los controles que leen ese contador
salen en cero — o sea, verdes si lo que esperas es cero.

## Un `multi_manager` no reparte en la misma llamada (el 69)

`#0` es «ya», pero lo resuelve su `Think`, no la llamada que lo disparó. Leer el
resultado de una cadena `botón -> multi_manager -> aparecedor` en el mismo
`page.evaluate()` da cero y parece que la cadena no llega. Hay que esperar de
verdad entre el disparo y la lectura.

## Una etiqueta de `case` sin cuerpo es una puerta al siguiente (el 69)

Obvio en frío y muy difícil de ver en un `switch` de treinta ramas con comentarios
de veinte líneas entre medias. En `aplicarDisparos` había cuatro etiquetas sin
cuerpo pegadas al `case` de las escenas de NPC, así que cuatro tipos de salida
corrían el lanzador de escenas y se contaban con el nombre de otro **sin un solo
error**. Si una rama es «esto se cuenta y nada más», el `break` se escribe.

## Medir una puerta desde el centro del vano no mide nada (el 70)

`CBaseDoor::Blocked` invierte la hoja cuando barre a alguien, y el rebote se
queda clavado en el mismo grado. Así que una sonda que teletransporta al jugador
al centro de la caja de la puerta lee **0°** pase lo que pase: igual si la puerta
no se abre porque la regla lo dice, igual si no se abre porque está rebotando
contra el que mide. Hay que salirse por el **eje fino** de la hoja —una puerta es
una tabla— medio metro, que sigue dentro del `ALCANCE` de 34 unidades y fuera de
por donde barre.

## `Math.abs` en un control lo deja ciego al signo (el 70)

El control del horneado decía «ninguna puerta con recorrido cero» y se escribió
`Math.abs(recorrido) < 1`. Con el `lip` roto a propósito los recorridos salieron
**−130 / −74 / −74** y el control siguió verde: un recorrido dado la vuelta es un
recorrido grande. Un valor absoluto en una comprobación convierte «es el bueno»
en «es grande», que casi nunca es la pregunta.

## `lip` de una puerta no vale 8 por omisión, vale 0 (el 70)

El comentario QUAKED de la cabecera de `doors.cpp` dice «lip 8 default» y el
código no asigna nada: `m_flLip` sale de `CBaseToggle::KeyValue` (subs.cpp:392) y
sin la clave se queda en cero. La familia del 64 y del 66: cuando el comentario y
el código no dicen lo mismo, manda el código.

## Una `func_door` no está en la colisión del mapa (el 70)

La malla de choque que hornea `tools/gatecity.mjs` es el **modelo 0 más
`func_wall`**, y nada más. Las puertas rotatorias y los rompibles sí estuvieron
ahí y hubo que sacarlos; las `func_door` nunca. Estaban sólo dibujadas, así que
la tapa de la cloaca de Edana era una lámina de 4 unidades que se atravesaba
andando. Antes de dar por hecho que algo «estaba horneado como pared», mira la
lista.

## Una cuenta escrita en una sonda envejece sola (el 70)

`sonda:edana48` comparaba «los 33 087 triángulos que el extractor midió» con un
literal, y llevaba **roja desde el 69** sin que nadie la pasara: cada clase que
sale de la malla del mundo para tener la suya se lleva unos cuantos —48 los
rompibles, 56 las deslizantes—. Si una sonda compara contra lo que escribió el
horneado, que lo **lea del horneado**: sigue comparando dos cosas distintas (el
archivo contra lo que el navegador tiene montado) y deja de caducar.

## Las comillas SIMPLES no son comillas en un script de MSR (el 71)

Sólo las dobles agrupan y desaparecen (`GetParams`, script.cpp:5049-5064; y el
lector de parámetros de un comando, :5639-5650). La simple es un carácter más
del nombre, y `GetConst` devuelve tal cual lo que no encuentra, comillas
incluidas (script.cpp:349-354). Así que `if ( X equals 'X' )` **nunca es
cierto**: compara `valor-de-X` con `'X'`. Es un idioma que aparece por todo el
mod y hay que leerlo como lo lee el motor, no como se lee en cualquier otro
lenguaje.

## El submodelo de un objeto tirado no es una fórmula (el 71)

Un `.mdl` de objetos trae tres submodelos por cosa —mano derecha, izquierda y
suelo— y el número del suelo lo calcula el evento `game_fall` del guion, con
una cuenta distinta por familia. `base_weapon` dice `+2`, `base_drink` dice
`+2`, `base_miscitem` dice `+1`, y `health_apple` **anula** el de su base para
decir `+1`. Con la fórmula del `+2`, la manzana de Edana cae del árbol
convertida en `oldbook_rhand`. El oráculo es el nombre del submodelo: tiene que
acabar en `_floor`.

## El alcance de recoger algo del suelo no son 64 unidades (el 71)

`UTIL_FindEntityInSphere` mide contra la **caja** de la entidad y no contra su
origen (pr_cmds.cpp:871-882), y la caja de un objeto es `origin ± 24` en
horizontal (weapons.cpp:345-349). Con las 64 unidades de `SEARCH_DISTANCE` eso
da **88** en horizontal. Medido contra el origen, el juego te obliga a pisar la
manzana para cogerla.

## El cono de recoger es 2D y el del jugador vale 0,5 (el 71)

`FInViewCone` hace el producto escalar **en 2D** —«making the view cone
infinitely tall», combat.cpp:1150— y el umbral es `m_flFieldOfView`, que para
el jugador se asigna **dos veces dentro de `CBasePlayer::Spawn`**: 0,1 en
player.cpp:2627 y 0,5 en :2682. Gana la última: ±60°. Que el cono no tenga
techo no es un detalle, es lo que permite agacharse a mirar lo que se va a
coger.

## Un `.wav` que no está en `assets/msr` puede ser de `valve/` (el 71)

`items/weapondrop1.wav` —el golpe de un objeto contra el suelo— no está en los
assets del mod, y eso es **correcto**: es un sonido de Half-Life, y el motor
monta `valve/` detrás siempre (el corolario del apartado 2 de CLAUDE.md). Falta
en esta copia, no en el juego. Y de paso: una descarga que revienta en
`audio.pedir` salía por la ventana como una promesa sin recoger, o sea un
`pageerror` que ninguna sonda sabía de quién era.

## El `pev->angles` de un cliente no es por donde mira: es un tercio y del revés (el 75)

```c
sv_player->v.angles[0] = float(-pmove->angles[0] / 3.0);   // sv_user.cpp:993
```

El motor lo escribe así para que el modelo del jugador no se doble, y el mod lo
usa tal cual cuando pide una dirección: `UTIL_MakeVectors(pev->angles)` en la
rama `"drop"` (client.cpp:928) y `UTIL_MakeVectorsPrivate(pev->angles, ...)` en
`DropItem` (playershared.cpp:969). Así que **soltar algo mirando 60° al suelo lo
tira 20° hacia arriba**, y lo más abajo que se puede soltar algo son 30° por
encima de la horizontal. Antes de usar `pev->angles` de un jugador como
dirección de mirada, comprueba de dónde sale.

## Un objeto quieto encima de una entidad de brush NO está en el suelo (el 75)

`FL_ONGROUND` se lo da `SV_Physics_Toss` sondeando las cuatro esquinas una
unidad por debajo (sv_phys.cpp:1081-1109), y `SV_PointContents` mira el **hull 0
del modelo del mundo** (world.cpp:695-709) y de las entidades sólo las
`SOLID_NOT` (`if (touch->v.solid != SOLID_NOT) continue;`, :625-626). Una
`func_door`, un `func_breakable` y un `func_wall` son `SOLID_BSP`: lo que se
queda encima **no se tumba, no suena, no pasa a `SOLID_TRIGGER` y no reinicia su
reloj de caducar**, porque todo eso está dentro del `if (FL_ONGROUND)` de
`FallThink` (genericitem.cpp:1397) y el `else` sólo reintenta cada 0,1 s.

## Un objeto que descansa a ras de la cara no se puede ver, ni coger (el 75)

El motor no lo deja a ras: `SV_PushEntity` copia `trace.endpos` al origen
(sv_phys.cpp:453-457) y el trazador de BSP **pone el cruce al lado de acá a
propósito** —«*put the crosspoint DIST_EPSILON pixels on the near side*»,
world.cpp:785-792, con `DIST_EPSILON = 0.03125` en :727—. Dejándolo exactamente
sobre el plano, el rayo de `FVisible` choca contra la cara en la que el objeto
descansa y la recogida dice «pared en medio». Es la familia del almiar del 69:
la geometría tapándose a sí misma.

## `fNextActionTime` y `sethand undroppable` no existen de verdad (el 75)

Dos de las tres puertas de `CGenericItem::CanDrop` (genericitem.cpp:1291-1308)
no cierran nada. `fNextActionTime` se declara (weapons.h:202), se lee dos veces
y **no se asigna en ningún sitio del mod**: la memoria de una entidad de GoldSrc
viene a cero, así que la pregunta es `time < 0`. Y a `HAND_PLAYERHANDS` se llega
con `sethand undroppable` (:2128-2129), que **no sale en ninguno de los 2 884
guiones**. Antes de portar una condición, mira si algo la pone.

## `renderamt 0` no esconde nada si el `rendermode` es 0 (el 76)

```c
if( !R_ModelOpaque( clent->curstate.rendermode ) && CL_FxBlend( clent ) <= 0 )
        return true; // invisible          ref/gl/gl_rmain.c:252
```

y `R_ModelOpaque(rm)` es `rm == kRenderNormal`, o sea `rm == 0`
(ref/gl/gl_local.h:87). Las dos mitades hacen falta: con el modo 0 el
`renderamt` **no se mira**, y una entidad a 0/0 se dibuja entera. Y al revés, un
`renderamt` ausente es 255 y no 0 — el valor de fábrica de `entvars_t` es cero,
pero el mapeador escribe 255, y confundirlos esconde adornos que el motor pinta.
Lo otro que hay que leer ahí: no se dibuja transparente, **no se añade a la lista
de dibujo**.

## El `origin` de un `env_model` no está dentro de su modelo (el 76)

Un `.mdl` no tiene por qué estar centrado en su origen. El plato de sopa de la
taberna de Edana tiene sus vértices **0,8 m por encima** del `origin` de la
entidad. Así que apuntar a la posición del manifiesto —para una cámara, un rayo
o una ventana de píxeles— es apuntar a la mesa que tiene debajo. Para mirar una
cosa hay que calcular el centro de los vértices que dibuja.

## `renderer.info.render` es el de la ÚLTIMA pasada, no el del fotograma (el 76)

Se reinicia dentro de cada `renderer.render()`, y el bucle de este puerto hace
dos: el mundo y, con `autoClear` en falso, el arma en primera persona
(src/main.js:5092 y 5110). Leerlo a secas devuelve 8 llamadas y 2 904 triángulos
**siempre**, con el pueblo delante o detrás. Para medir un fotograma entero hay
que poner `info.autoReset = false`, reiniciar a mano y leer entre dos
`requestAnimationFrame`.

## Fundir geometría quita la posibilidad de cambiarla (el 76)

Los 46 adornos de Edana iban en una sola malla por `drawcalls`, y eso dejó
`env_render` sin poder alcanzar a ninguno durante cuatro experimentos. La
pregunta no era qué trozo de la malla es de cada uno: era **cuál no se puede
fundir**. En GoldSrc cada `env_model` es una entidad con su propio estado de
dibujo, así que el que lleva `targetname` es exactamente el que tiene que ir
suelto. Nueve de 46 en Edana, cero de 101 en Gate City.

## `setmovedest none` no borra el destino: apaga la condición (el 77)

`if (Params[0] == "none") { StopWalking(); ClearConditions(MONSTER_HASMOVEDEST); }`
(npcscript.cpp:1608-1612) deja `m_MoveDest` **escrito**, y `StopWalking` tampoco
lo toca (msmonsterserver.cpp:1407). Son dos cosas separadas: el valor y la
condición. La consecuencia la paga quien esté esperando: un `ms_npcscript` que
lleve a ese NPC compara el valor —sigue igual— y mira la condición —apagada—, o
sea que **se cree que ha llegado** y sigue a su rama de acabar con el NPC donde
estuviera. Confundir las dos en el puerto rompió quince controles de la sonda
del 77 sin dar un error.

## `m_EarlyBreak` de un `ms_npcscript` no se limpia nunca (el 77)

No está en `Spawn`, ni en `Act`, ni en `FireTarget`. Una escena que se corta una
vez queda marcada **para el resto de la partida**: a partir de ahí dispara su
`fireonbreak` aunque acabe bien, y pierde su `firedelay`, porque el `if` que lo
respeta es `if (m_flFireDelay && !m_EarlyBreak)` (npcact.cpp:295). Y se corta
con cualquiera: basta que otro le cambie el destino al NPC mientras anda
(`:229`), cosa que hacen tanto la caza como el `setmovedest` de su propio guion.

## Un `ms_npcscript` puede mandar a un NPC a donde ya está (el 77)

La distancia a la que se da por llegado es `m_Width * 1.1` (msmonster.h:355): 35,2
unidades para un humano de ancho 32. El `edrinspot` de Edana está a **32
unidades** de donde Edrin nace, así que esa escena con él en su sitio no le hace
andar un paso — se da por llegada en el acto, le gira la cara y acaba. Medir
«¿ha llegado?» sobre una escena así es leer el valor de reposo.

## Con `firedelay`, el NPC sigue congelado hasta que el retraso vence (el 77)

Quien lo suelta es `FireTarget` (`m_MonsterState = MONSTERSTATE_NONE`,
npcact.cpp:309), y con un `firedelay` `FireTarget` está programado para dentro
de N segundos (`:295-299`). Durante esos segundos el NPC sigue en
`MONSTERSTATE_SCRIPT`, o sea quieto y **rechazando cualquier otra escena** por
la guarda de `Act` (`:128`). El `edrinstrict1` de Edana tiene `firedelay 4`: son
cuatro segundos en los que al capitán de la guardia no se le puede mandar nada.

## `probe.mundo.mirar` toma tres números, no un punto (el 78)

`mirar(x, y, z)` (`src/dev/sonda.js:1232`). Pasarle un array —`mirar(p)`— no da
error: `x - p[0]` da `NaN`, el `yaw` del jugador se queda en `NaN` y **el cuerpo
deja de simularse**. Ni cae, ni pisa un `trigger`, ni la cámara apunta a nada; y
las capturas salen idénticas byte a byte, que es lo único que se nota. La sonda
del 77 lo hizo así desde el primer día y sus controles de píxeles salieron
verdes igual, midiendo lo que hubiera delante. Las otras dieciocho llamadas del
proyecto pasan tres números: si una sonda nueva copia de otra, que copie de
ésas.

## El cielo mira hacia arriba igual que un suelo (el 78)

La cara de abajo de la caja de cielo cumple `normal[2] > 0.7` y es de las más
grandes del mapa. Encima tiene el propio brush —sólido— y debajo tiene el mundo
—hueco—, o sea que contesta **al revés** que un suelo a las preguntas que se le
hacen a un árbol BSP. Al aire libre son mayoría entre las caras grandes: 158 de
las 200 primeras en `gertenheld_forest2`. Se filtra por nombre de textura
(`sky`), que es como lo hace ya `tools/gatecity_shot.mjs:145`.

## Un `killtarget` puede nombrar a un monstruo, no sólo al cableado (el 78)

`UTIL_Remove` borra **todo lo que se llame así** (subs.cpp:220-233), y en un
mapa de Master Sword eso incluye a los `ms_npc`. Gate City no tiene ninguno y
Edana tiene dos que no apuntan a un bicho, así que el puerto estuvo
veintinueve experimentos mirando sólo la tabla de entidades del mapa;
`gertenheld_forest2` tiene cuatro. Y borrar un monstruo **no es matarlo**: sin
golpe, sin animación de muerte, sin cadáver, sin botín y sin descontarle una
vida a su área.

## Los `params` de un `ms_npc` no son datos: son eventos de guion (el 78)

`params "set_no_roam;set_race;beloved"` no es una lista de propiedades. El mod
los guarda en `m_addparams` (msmonsterserver.cpp:389) y los lanza como eventos
contra el guion de la criatura, donde `monsters/externals.script:1284` define
`set_no_roam` como `roam 0`. Este puerto **no lee ese campo**, así que un NPC al
que el mapa le dice que no se mueva de su sitio pasea igual. Se nota midiendo
escenas: cuánto anda depende de dónde estuviera.

## Dos escenas del mismo mapa pueden borrarse la una a la otra (el 78)

En `gertenheld_forest2` las dos escenas del tipo 1 son excluyentes y lo hace el
propio mapa con `killtarget`: la del saludo acaba disparando `killscare`, que
borra el `trigger_once` de la del susto, y la del susto dispara `killencounter`,
que borra la del saludo. Gana la que el jugador pise primero. Si una sonda
quiere medir las dos, entra dos veces — y antes de culpar al puerto porque «el
volumen no se dispara», mira `disparadores().cuenta` a ver si hay un `kill...`
que tú no has pedido.

## `atof` de C no es `Number` de JavaScript, y la diferencia borra un NPC (el 79)

`atof("700/700")` es **700**: lee el prefijo numérico y abandona en el primer
carácter que no entiende. `Number("700/700")` es `NaN`. Veintiún guiones del
juego escriben la vida así —el comando `hp` espera dos parámetros separados por
un espacio (npcscript.cpp:185-196) y `700/700` es uno solo, así que en el mod
funciona por accidente— y el lector de fichas los convertía con `Number`.

Un `hp: null` no da un error: da un NPC que **no está en `Manada.vivos()`**,
que es la lista de la que sale `candidatosDeGolpe()`. Y como el menú de
interacción mira con el mismo cono que la espada, ese NPC no se puede golpear
**ni hablar**: es un vecino que no reacciona a nada. Eran diez en los tres
mapas portados, entre ellos el capitán de la guardia de Edana.

Donde el mod use `atof` o `atoi`, el puerto usa `atof`/`atoi` — están los dos
en `src/bsp/script.js`. `Number` sólo vale cuando el valor es nuestro.

## Un umbral escrito con `>` no filtra un `NaN` (el 79)

`NaN > 300` es **false**, así que una distancia que no se puede calcular pasa
el filtro de alcance y el NPC te oye. Con el jugador teletransportado a `NaN`
por un fallo de la sonda, **dieciocho NPC de Edana contestaron a la vez desde
el otro extremo del mapa**. El motor no puede llegar ahí porque sus vectores
salen de la física; este puerto sí, porque `probe.mundo.poner` acepta lo que le
des. Donde el valor pueda venir de fuera de la simulación, se pregunta con
`Number.isFinite` antes de compararlo.

## Un grito global y una frase local salen en CAJAS distintas (el 79)

Hay dos consolas: la de sucesos (abajo a la derecha, `probe.hud.estado()
.consola.lineas`) y la del chat (a la izquierda, `probe.chat.estado().lineas`
— **sin** `.consola` en medio). Un `[global] Ana: hola` va sólo a la del chat.
Buscar un grito en la consola de sucesos da un rojo con el juego bien, que es
el aviso del 60 —«una regla devuelve *qué* y otra decide *dónde*»— en forma de
sonda.

## «Lo nuevo de la consola» no es `ahora.slice(antes.length)` (el 79)

Las dos consolas son anillos: tienen un tope de líneas visibles y las viejas se
caen por arriba. Si ya estaba llena, decir tres frases la deja igual de larga y
la resta de longitudes da cero — «no ha pasado nada» con tres líneas nuevas
delante. Lo que vale es buscar el solape: el trozo del principio de la foto
nueva que es la cola de la vieja.

## El `name_unique` de un guion puede no ser el nombre que usa el mapa (el 79)

En Edana el `ms_npcscript` del libro apunta a `urdauf` y `edana/urdauf.script`
declara `name_unique urduaf`. Están sin medir las consecuencias; queda escrito
porque quien vaya a seguir una cadena de misión por nombre va a tropezar con
esto y va a creer que lo ha roto el puerto.

## Un bloque sin nombre se EJECUTA al nacer, así que no nombrarlo no es neutral (el 81)

Hay dos formas de nombrar un bloque en un guion de Master Sword: la corta,
`{ say_hi`, y la larga, `eventname say_hi` **dentro** de las llaves. Si tu
analizador sólo conoce una, lo que pasa **no** es que esos bloques se ignoren:
un bloque sin nombre lo registra el motor como un evento programado para ya
(`script.cpp:5198-5202`), así que **se ejecuta entero en el primer fotograma**.

En este puerto faltaba la forma larga: **570 declaraciones en 202 ficheros, las
570 sangradas y ninguna al margen**, o sea que no acertó ni una vez en 81
experimentos. El efecto visible era que Sylphiel pagaba la recompensa de la
sidra antes de que entraras en la taberna.

Y al arreglarlo apareció lo que tapaba: `npc_spawn` **corría por accidente** por
no tener nombre, y el `CallScriptEvent("spawn")` del motor —`global.cpp:436`,
una línea antes del `game_spawn` que sí llamábamos— no lo llamaba nadie.

## Las posiciones son METROS y los rangos de los guiones son UNIDADES (el 81)

`RANGO_LOCAL = 300` (`chat.js:131`) está en unidades de GoldSrc; `instancia.donde`
y `player.feet` están en metros, a 39,37 por metro. Cuando un número cruza de
una capa a la otra hay que convertirlo, y **si no se convierte no hay error**:
`$cansee(player,128)` comparando metros contra 128 dice «te veo» a 128 metros,
que es tres veces Edana. Un alcance infinito y callado.

Lo peor es que las pruebas pueden no verlo: si las escribes con los dos lados en
el mismo espacio, la conversión no cambia nada y salen verdes igual. La prueba
que sirve usa **dos escalas** y comprueba que el resultado cambia.

## La consola PARTE las líneas largas, y sólo la primera va firmada (el 81)

Una frase de NPC que no cabe se reparte en varias entradas de la consola, y
**sólo la primera empieza por el nombre del NPC**. Si filtras por el nombre y
buscas la frase dentro de esas líneas, no la encuentras nunca — por bien que
vaya el juego. Dos controles en rojo con la misión funcionando de punta a punta.

Lo que vale: buscar la frase en el bloque entero de líneas nuevas y comprobar la
firma **aparte**. Y entonces hay que cuidar que la sonda no teclee nunca la
frase que busca, porque el eco del jugador también está en ese bloque.

## `npm run guiones` no rehornea el censo de criaturas (el 81)

Son dos horneados distintos: `npm run guiones -- --mapa X` deja `guiones.json` y
`npm run mapa:bichos -- --mapa X` deja `bichos.json`. Hacer sólo el primero y
creer que has rehorneado te da **una medida vieja con cara de nueva** — y aquí
estuvo a punto de costar una acusación a otra sesión por un campo que sí había
horneado bien.


## `return` en un guion NO corta el evento; el que corta es `exitevent` (el 83)

Son dos comandos distintos y es fácil juntarlos:

- **`exitevent`** pone `Event.bFullStop` (scriptcmds.cpp:48 y :3148-3153) y el
  bucle lo mira después de CADA comando (script.cpp:5767-5768), así que
  desenrolla también los `if` anidados. Se limpia al terminar el evento
  (:5694), o sea que **no corta al que hizo el `callevent`**. 108 líneas en 53
  ficheros.
- **`return` / `returndata`** guarda `m_ReturnData` y **sigue**. El motor lo
  dice encima de la función: «*Does not stop code execution - if multiple
  instances of return are encountered in the same event, the results are
  tokenized*». 148 líneas en 81 ficheros.

Lo demuestran los propios guiones sin salir del archivo:
`chests/bank1/filter.script:25-26` es `return **clear` y, en la línea
siguiente, `return L_ITEMS`. Si `return` cortara, el banco devolvería siempre
vacío.

Y **`exit` a secas no existe**: no está en `m_GlobalCmdHash` y hay cero usos en
los 2 884 guiones. Si lees un `exit` en código de este puerto, es inventado.

Y hay una **tercera** forma de abandonar, que no es ninguna de las dos y se
confunde con las dos: **el `if` VIEJO, al fallar, abandona su `Cmdlist`.**

```cpp
if (!Cmd.m_NewConditional)
  break; //Old if command.  Breaks event execution on failure
                                              script.cpp:5756-5757
```

El comentario es del motor y engaña: `break` sale del bucle y cae en el
`return true` de :5771, así que **el llamador ve «se cumplió»**; y a los
bloques hijos se entra por la recursión de :5752, que **tira el valor**. O sea
que abandona su lista y nada más. Cuando esa lista ES el evento —la línea al
nivel de arriba, que es el caso del 67— las dos cosas coinciden; cuando está
dentro de un bloque, no. Lo distinguió `-e0` en el menú del jugador: `if
SHOWIT_ON` dentro de `if ( AM_SITTING )`, donde de eso dependía si sentarse da
maná. **Sí lo da**; lo que se pierde son los dos mensajes de detrás.

Y el detalle que importa al escribir el puerto: `break` y `return false` **no**
son lo mismo aquí, porque la cadena de `else` es la única que lee ese valor
(script.cpp:5759-5764) y con `false` seguiría probando ramas que el motor ya no
prueba. Hoy no lo nota ningún guion —0 de las 1 908 ramas `else` del juego
cumple las dos condiciones que hacen la diferencia visible—, y por eso el
arreglo está escrito y **no se cuenta entre los verdes**; ver `doc/GAUNTLET_83.md`
§2 bis.

## Un getter sin soporte devuelve su propio NOMBRE, y eso rompe las guardas (el 83)

Es el comportamiento correcto —script.cpp:4741— y por eso no da error ni
aviso. La consecuencia es que **toda guarda escrita contra un número deja de
cumplirse**: `if ( $get_find_token(LISTA,X) == -1 ) exitevent` compara la
cadena «$get_find_token(LISTA,X)» con «-1», que es falso, así que la guarda que
decía «si no está, sal» pasa a decir «sigue siempre».

El valor de reposo de un getter no es neutro. Cuando midas por qué un bloque
hace de más en vez de hacer de menos, mira si su condición de salida depende de
un getter que no esté en `GETTERS`.

## `game.map.name` no se resolvía, y son 265 usos (el 83)

`MSGlobals::MapName` (script.cpp:4608-4612). Hasta el 83 se resolvía a la
cadena literal «game.map.name», así que **cualquier bloque del juego que
compare el mapa contra algo estaba comparando contra eso**. Va inyectado:
`new Guion({ mapa })`, y desde main.js `mapa: () => MAPA`.

Si lees un guion que se comporta igual en todos los mapas y debería variar,
empieza por ahí.
