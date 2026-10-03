# Dónde se quedó esto

> **EL 92: EL MORDISCO SALE DE LA ANIMACIÓN, LA COSTURA CORRE CON SERVIDOR, Y
> UN GOBLIN QUE NO AVISABA A NADIE DESDE EL 53**, por cuatro agentes.
> (A) el daño de un bicho sale del evento 500/600 de su modelo → evento del
> guion → `dodamage`, sin daño doble con la IA ([doc/MORDISCO_92.md](doc/MORDISCO_92.md),
> `sondas/mordisco92.mjs`). **La araña de Gate City NO envenena al morder**: su
> veneno es el salto, que no está portado; la que envenena es la de
> `edanasewers`. Y `$get(<jugador>,maxhp)` daba «0» desde el 46: el veneno hacía
> 0 de daño. (B) con servidor los bichos corren guion y los efectos van al
> jugador correcto; de paso, en el servidor ningún bicho podía apuntar a un
> jugador («1» contra «j1») ([doc/COSTURA_RED_92.md](doc/COSTURA_RED_92.md),
> `sondas/costurared92.mjs`). (C) los 4 rojos de `consecuencias`: tres eran de
> la sonda (buscaba ratas que desde el 67 son crías de araña) y uno del juego —
> la tabla de razas nacía vacía entrando por el menú, así que **ningún goblin
> avisaba a sus aliados al morir desde el 53** ([doc/CONSECUENCIAS_92.md](doc/CONSECUENCIAS_92.md)).
> (D) `sondas/mundo.mjs` 41/44: **los 13 tipos de bicho de Gate City salen
> horneados como jefes que se autoajustan**, porque `recoger` cosecha los
> `setvard` de `make_boss`/`set_self_adj`, eventos que sólo pide el mapa — la
> trampa del `NPC_NO_DROPS` del 82, y nacida en el 82 (al cargar los
> `#include [server]`). Arreglado con `variablesAlNacer` (la regla de
> `setvar`/`setvard`/`const` del motor): 974 fichas cambian en cinco campos,
> los jefes del juego bajan de 974 a 63, y **desde el 82 casi todos los bichos
> atacaban sin verte** (`tieneQueVerte`). La tercera roja era un aldeano que se
> deslizaba asintiendo: el bloqueo de animación del 80 se ponía también con la
> pose de reposo. `mundo` 44/44 ([doc/FICHAS_92.md](doc/FICHAS_92.md)).
> **Pendiente:** 23 variables de `iaDe` mezcladas con un `setvard` que este
> lector no evalúa; los jefes que dependen de un `if` de una línea.

> **EL 91: LOS BICHOS CORREN GUION (HÍBRIDO), Y EL VENENO LE QUITA VIDA AL
> JUGADOR**, por tres agentes a la vez. La IA portada sigue mandando; el guion
> del bicho nace con él y recibe `game_dodamage`, `game_damaged`/`game_struck`,
> `game_parry` y `game_death` desde los puntos donde la IA decide, con los
> bucles que la duplicarían (`npcatk_hunt`…) cerrados en una lista citada y
> contada ([doc/BICHOS_GUION_91.md](doc/BICHOS_GUION_91.md), `sondas/costura91.mjs`).
> `effects/dot_poison` funciona sobre el jugador con `xdodamage`, `$math`,
> `$get_takedmg`, `scriptflags` ([doc/VENENO_91.md](doc/VENENO_91.md),
> `sondas/veneno91.mjs`). Y el censo de los 846 guiones de monstruo, con la
> propuesta de qué portar para la primera mazmorra
> ([doc/CENSO_BICHOS_91.md](doc/CENSO_BICHOS_91.md), `npm run bichos:guion`).
> **Lo siguiente:** que el DAÑO salga del evento de animación (500/600 del
> `.mdl` → `bite1` → `dodamage`), que es lo que hace venenosa a la araña
> jugando; `enchufarA` en `src/red/partida.js` (con servidor la costura no
> corre); `game.monster.name.full`. Y `sondas/consecuencias.mjs` da 42/46 con
> cuatro rojas que, según el agente, salen igual con la costura desenchufada:
> sin diagnosticar.

> **EL 90: EL GUION DEL JUGADOR, DE 259 A 314 DE 541 EVENTOS ENTEROS**, por
> tres agentes a la vez. `applyeffect` funciona (el sumo sacerdote de Edana
> cura: `sondas/efectos90.mjs`), `drainstamina` llena el aguante al entrar
> (`sondas/aguante89c.mjs`), y doce comandos pequeños del intérprete. Lo que
> NO: los venenos, porque **los bichos no corren guion** — es lo siguiente.
> Hallazgos sin arreglar (`game_equipped` no lo llama nadie, el `const` de
> cabecera, `trigger_push` ×39) en [doc/GUION_JUGADOR_90.md](doc/GUION_JUGADOR_90.md).

> **EL 88 HIZO EL PRIMER MAPA NUESTRO, Y SE JUEGA EN LOS DOS MOTORES.** El
> usuario quiere ampliar Gate City con misiones y mazmorras para jugadores de
> hasta 500 de vida, y pidió probar ANTES que se puede. Lo nunca probado era
> hacer contenido: todo lo que este port leía eran mapas oficiales.
>
> `contenido/sala88.mjs` (dos salas, un pasillo y una rata) → `tools/mapagen.mjs`
> escribe el `.map` → `npm run contenido -- sala88` lo compila con VHLT
> (`C:/Herramientas/vhlt`) → **Xash3D lo carga** (`map sala88`, servidor
> dedicado: la rata se reconoce) y **aquí `sonda:sala88` da 10 de 10** entrando
> por el menú, con dos roturas deliberadas que se ponen rojas. Tres controles del
> horneado no sabían qué hacer con un mapa pequeño y se corrigieron con su nota.
> Todo en [doc/CONTENIDO_88.md](doc/CONTENIDO_88.md).
>
> **Lo siguiente, en orden:** (1) ~~que el usuario mire la sala con el cliente
> de Xash~~ — hecho: la jugó en los dos y se ven igual; (2) la `msarea_transition` entre la sala y Gate City; (3) el primer
> guion propio, que pide abrir `test/procedencia.test.mjs` a un `.script`
> NUESTRO; (4) la licencia de `contenido/`. Los puntos 3 y 4 los decide el
> usuario.

> **EL HISTORIAL SE REESCRIBIÓ ANTES DE PUBLICARLO (87), Y LOS HASHES DE ANTES
> YA NO EXISTEN.** Lo eligió el usuario: 18 commits llevaban su correo de
> trabajo y 4 otro personal, y un repositorio público los enseña. Ahora los 22
> van con `87036389+Deoroot@users.noreply.github.com`, nombres y fechas
> intactos, y el tag `v0.1.0-alpha` rehecho con su mismo mensaje y su misma
> fecha. **El contenido no cambió ni un byte**: el árbol del último commit es
> idéntico antes y después (`aa1263b`). Las seis citas de hashes viejos que
> había en los documentos se cambiaron por las nuevas.
>
> **Y no bastó con reescribir**, y eso se midió: tras el push forzado, GitHub
> **seguía sirviendo los commits huérfanos** con el correo dentro (probado con
> tres por la API). Así que el repositorio viejo se renombró a
> `master-sword-rebirth-threejs-privado` y se quedó privado, y el público es
> uno nuevo con el nombre de siempre, que nunca tuvo esos objetos. *Reescribir
> el historial no borra lo que el servidor ya tenía*: hay que comprobarlo en el
> servidor, no en la copia local.
>
> **Este repositorio commitea ya con la dirección noreply** (`git config
> user.email`, local al repo). La global sigue siendo la de trabajo: si se clona
> en otro sitio, hay que volver a ponerla.


> **EL 87 CIERRA LA TANDA DE EXPERIMENTOS, Y EL REPOSITORIO SE HACE PÚBLICO.**
> Lo pidió el usuario: README sencillo, capturas de Edana y barras de progreso.
>
> **Las barras se calculan** (`npm run insignias`, `tools/insignias.mjs`) y
> `test/insignias.test.mjs` se pone roja si el README dice otra cosa. Al
> calcularlas salieron dos números falsos que llevaban tiempo circulando: el
> «78 de 223 comandos» (35 %) contaba **dos comandos comentados** y comparaba
> con la tabla equivocada — son **73 de 325, un 22 %**, contando las tres
> tablas del mod—; y el horneado de guiones de Edana era **de otra lista de
> comandos**, así que su «18 de 27» estaba viejo (hoy, 19). La herramienta se
> niega a escribir si un horneado está desfasado, y eso lo sabe EXACTO porque
> el horneado guarda la lista con la que se hizo.
>
> **`npm run hornear`** lo hornea todo en orden (18 pasos, 1,2 min). Hacían falta
> veinte herramientas sin un orden escrito, y la guía se dejaba **tres que el
> juego lee** (`jugador`, `objetos:guion`, `suelo`): nadie lo vio porque cada
> sesión tenía su `build/` hecho a trozos. Comprobado como un desconocido: copia
> limpia sin `build/`, hornear, `npm test` en verde y `sonda:red:edana` 21/21.
>
> **Las capturas** son la única excepción binaria (`doc/capturas/`, JPEG, con
> tope de tamaño), y `test/procedencia.test.mjs` sigue cazando un `.jpg` fuera
> de ahí o un `.png` dentro. Corregido «ni un binario» en `CLAUDE.md` y en
> `CREDITOS.md`, ahí con la corrección al lado.
>
> **LO QUE QUEDA, por orden de lo que más pesa para un desconocido:**
>
> 1. **Sin el contenido del juego, `npm test` da unos 50 rojos.** Pruebas que
>    leen un bicho del horneado, reciben `null` y revientan en vez de saltarse,
>    como sí hacen otras 191. Por eso **no hay insignia de «Build»**: hoy sería
>    roja, y escrita a mano sería mentira. Arreglarlo es poner la guarda
>    `{ skip: !hay }` que ya usa el resto, y después un flujo de GitHub Actions.
> 2. **No hay `LICENSE`.** Sin licencia, un repositorio público es «todos los
>    derechos reservados». Es decisión del usuario.
> 3. El HUD que se va 3,3 s en multijugador (abajo, sin diagnosticar), y
>    `sonda:consecuencias` en 42 de 46 (el censo de criaturas).
> 4. Las dos `msarea_transition` de Edana, que es lo único de juego que le falta.


> **EL HUD SE VA 3,3 SEGUNDOS EN MULTIJUGADOR, Y NO ESTÁ DIAGNOSTICADO.**
> Salió midiendo si la red aguanta Edana, porque el usuario quiere un servidor
> público pequeño para un playtest. En **una pasada de cada tres**,
> `sonda:red:edana` encuentra el HUD escondido y tarda **3 287 ms** en volver,
> con el jugador **VIVO** (`vida 10/15`). Las otras dos pasadas tardan 81 y
> 85 ms. `vivo` sale de `sesion.estado === ESTADO.JUGANDO`
> (`src/main.js:6029`), así que **algo saca la sesión de «jugando» con red
> puesta** — y las otras tres razones de `seVeElHud` (`src/play/hud.js:367`)
> son panel abierto, escondido y sin cargar. No se adivina cuál: el control ya
> imprime la cifra de vida y la espera para que la próxima pasada lo diga.
>
> Esto importa más de lo que parece: es lo primero que reportaría un
> playtester, y en una partida de un solo jugador no se ve.
>
> **Y un 18 de 21 en Gate City que no se ha vuelto a reproducir** en cuatro
> pasadas posteriores. No sé qué tres controles cayeron porque el `grep` de esa
> pasada no pedía las líneas rojas — error mío de instrumento, no del juego.
> Queda dicho porque **la fiabilidad de la sonda de red no está caracterizada**
> y eso es justo lo que hace falta antes de abrir un servidor a gente.
>
> Lo que sí quedó arreglado en esa sonda (`e8d951f`): el control del HUD era
> ruido con forma de rojo —leía una vez y medía su propia latencia, el 76— y el
> marcador no podía bajar —«X de `controles.length`», el 65—. Seis pasadas
> seguidas en verde tras el arreglo, 3 de Gate City y 3 de Edana.


> **EL HUD DE EVENTOS DECÍA OCHO FRASES QUE EL JUEGO NO DICE (86).**
> Reportado por el usuario: «el event hud me parece todavia tiene texto
> inventado». Y las tenía. Medido buscando cada cadena en `../MSC/` y no
> encontrándola: «3.4 damage to X — 17 of 20 left» es
> `Hit X: 3.4 slash damage.  ` con sus dos espacios (giattack.cpp:1954),
> «CRITICAL! » va DETRÁS y es `CRIT! (97/95)`, «You missed: too far» es
> `Missed X.`, y **«You killed X — N experience» no existe**: su línea está
> comentada por su autor («no workie», playerstats.cpp:208) y quien anuncia la
> experiencia es el guion del jugador, en verde. «X flees», «it flinches» y la
> vida que le queda al bicho tampoco existen. **Tercera vez en esta misma
> esquina**: el 65 y el 83 fueron las otras dos, y las seis de hoy convivían
> con las dos correcciones, al lado, sin que nada se pusiera rojo.
>
> **Y EL ARREGLO DESTAPÓ DOS HUECOS.** Con servidor la experiencia **no se
> anunciaba en absoluto** —la rama de red nunca llamaba a `game_xpgain`, así
> que el único aviso era el inventado, y quitarlo sin más dejaba el
> multijugador mudo— y el informe del golpe **no salía en el espadazo que
> mata**, porque estaba dentro del `else` de la muerte para dejarle sitio. El
> 81: *un arreglo puede dejar al descubierto lo que tapaba*.
>
> **LA TRAMPA DEL DÍA, y es nueva: casi cito una línea que está dentro de un
> comentario.** `giattack.cpp:1433` tiene otro formato, es código de verdad
> —ni `#if 0` ni `//` delante, con su sangrado y sus llaves— y el comentario de
> bloque que lo envuelve cierra **96 líneas más abajo**, con un `}*/` pegado al
> margen. El vivo es el de `:1657`. Es el `NPC_NO_DROPS` del 82 en C++ y sin
> horneado de por medio. Todo en [doc/EVENTOS_86.md](doc/EVENTOS_86.md).
>
> `npm test` **2 199 de 2 199**, `npx vite build` limpio, `sonda:aviso60`
> 22/22, `sonda:golpe` 26/26, `sonda:arco` 40/40, `sonda:mordisco82` 14/14.
>
> **PENDIENTE QUE NO ES DE ESTE EXPERIMENTO Y HAY QUE DIAGNOSTICAR:**
> `sonda:consecuencias` está en **42 de 46**. Los cuatro rojos son bolsas de
> huevos (`msarea_monsterspawn`) y el aviso a los aliados al morir, y **nadie
> ha tocado `src/play/manada.js` ni el horneado** desde el commit `a0049b3`:
> comprobado con `git status`, no supuesto. Lo que sí pasó es que
> `build/*/bichos.json` de los dos mapas se rehorneó a las 08:25, DESPUÉS de
> `guiones.json` y de `malla.json` — el horneado parcial del 81, *una medida
> vieja con cara de nueva*. Pasado a la sesión que lleva el censo.


> **LA COLUMNA `aplica`: YA ESTÁ PUESTA.** Las nueve filas vivas de
> `src/play/ajustes.js` la llevan, con la línea citada y el control que mide que
> el valor LLEGA; `crearpartida.js` pasa a la misma forma. Y al rellenarla salió
> lo que no se sabía: **de los 9 vivos sólo 5 los mide alguien** — `m_filter`,
> `MP3Volume`, `gamma` y las teclas quedan declarados pendientes en vez de
> contarse entre los verdes, cada uno con lo que falta por medir. Los dos
> controles de la música son el caso que más engaña: comprueban que sigue en su
> 0,2 —el valor de reposo— mientras se mueve el OTRO deslizador, así que siguen
> verdes con el de la música desconectado. Hay un control nuevo en
> `sonda:menu52` (**23 de 23**) que mueve el volumen **en el menú y sin mapa**,
> que es el estado del fallo del 84, y con el fallo puesto a propósito es el
> único de los tres que se pone rojo. Todo en
> [doc/AJUSTES_37.md](doc/AJUSTES_37.md) §10, con su fila de §4 redactada en
> [doc/GAUNTLET_83.md](doc/GAUNTLET_83.md) §6 **y sin escribir en `CLAUDE.md`**.
> Lo que sigue abierto es medir los cuatro pendientes. El diagnóstico que lo
> motivó, que es lo que no se puede volver a deducir del código:
>
> `CLAUDE.md` pone esa columna
> como «la vacuna contra el apartado 4», y `src/play/ajustes.js` llegó al 85 con
> **21 filas con `porQueNo` y 0 con `aplica`**. O sea que **un ajuste que se
> guarda y no se reparte no lo ve ninguna prueba** — y eso no es hipotético: es
> exactamente el fallo que el usuario reportó en el 73 y que se arregló en el 85.
> Mover el volumen en el menú principal no hacía nada porque quien reparte
> (`aplicarAjustes`, src/main.js) **nace `null` y lo escribe el armado del
> mundo**, así que antes de cargar un mapa el `?.` se lo tragaba en silencio.
>
> **EL SONIDO DEL MENÚ (85).** Dos fallos a la vez, los dos del reporte del
> usuario («de hecho parece que no funciona para nada»): un `new Audio()` nace
> con `volume = 1` y el `config.cfg` trae `volume "0.120000"`, o sea **8,3 veces**
> de más; y el deslizador no llegaba, por lo de arriba. El control que existía
> desde el 37 —«el volumen sube en el nodo de Web Audio»— **estaba verde con el
> menú sonando a 1**, porque esos `Audio` del DOM no pasan por Web Audio: dos
> caminos para un deslizador, la costura del 63 en el audio. `sonda:menu52`
> **22 de 22** (el volumen de partida, sin mapa cargado) y `sonda:ajustes37`
> **16 de 16** (que el deslizador llega, por el camino del jugador). *Son 23 en
> `menu52` desde el control de arriba: el 85 medía el volumen con el que NACE el
> menú, que pasa igual con el deslizador desconectado.*
>
> **EL CIELO SE MOVÍA AL SALTAR (84).** `RI.cullorigin = RI.vieworg`
> (gl_rmain.c:359) y `v[j] += RI.cullorigin[j]` (gl_warp.c:243): el cielo se
> centra en el **origen de vista**, y el puerto lo anclaba al ojo. Andar no mueve
> la vista respecto al ojo y **el aterrizaje sí**, así que medido en Edana daba
> 0,000 andando 251 unidades y **11,790** saltando. `sonda:cielo84` **6 de 6**.
>
> **CHARACTER INFO (84).** Al panel DERECHO le faltaban `(%.2f%%)` y `[%i left]`
> y pintaba la clave interna en minúscula (`proficiency: 0`); Parry ahora esconde
> el panel (vgui_stats.cpp:295-299). **La lista de la IZQUIERDA no se toca**: el
> motor la escribe «nombre: número» y nada más (`:277`), y hay un control que se
> pone rojo si alguien la «arregla» al ver la captura del original.
> `sonda:hoja32` **21 de 21**.
>
> **EL HERRERO DE EDANA: NO SE REPRODUCE (84).** Los dos herreros están
> horneados exactos (`origin` y `angles` idénticos al `.bsp`) y el nodo de Three
> tampoco se desvía. Lo que el horneado no copia es la altura —los baja al
> suelo—, y eso es correcto: no hay nada sólido donde el mapa los pone y
> `MOVETYPE_STEP` (msmonsterserver.cpp:170) tiene gravedad. Corregido el
> comentario de `tools/bichos.mjs`, que lo justificaba con un `DROP_TO_FLOOR` al
> nacer **que no existe** para `ms_npc`.
>
> Todo en [doc/CIELO_84.md](doc/CIELO_84.md), con **cuatro filas candidatas para
> el apartado 4 de `CLAUDE.md` al final, sin escribir ahí: lo decide el usuario.**
> La más reutilizable: en C una cadena de topes recoge el `inf` de un `0/0` y en
> JavaScript el mismo `0/0` da `NaN`, que **no cumple ninguna desigualdad**, así
> que los atraviesa todos.
>
> `npm test` **2 122 de 2 122**, `npx vite build` limpio. **Nada de esta tanda
> está commiteado**, `src/main.js` incluido.


> **TU PROPIO MENÚ FUNCIONA (85).** Reportado desde una partida de verdad: «pulso
> F, hago clic en *Sit down (Rest)* y sale **That is not implemented yet**, y lo
> mismo todas las demás opciones de ese menú». El menú que estaba muerto **no es
> el de ningún vecino** —eso lo midió otra sesión: los cuatro vendedores de Edana
> abren y contestan— sino el tuyo, el que abre la F con el cono de 72 unidades
> vacío (`else pMonster = pPlayer`, client.cpp:679-682).
>
> **El fallo era una costura de §4:** `pedir` contestaba ese caso desde el 60 y
> `elegido`, doce líneas más abajo, **no tenía su rama**, así que sin NPC no hay
> guion y las seis opciones salían por el cajón de «este NPC no tiene guion
> portado». Un mensaje correcto apuntando al caso equivocado.
>
> Debajo había tres huecos más: el `estado` de `opcionesDelJugador` estaba en la
> firma desde el 60 **y nadie lo pasaba** (así que la única condición del menú no
> se cumplía nunca), `anadirOpcion` sigue siendo un `=> {}` con un comentario que
> dice que el jugador no tiene menú —y sí lo tiene, es un guion—, y los cuatro
> guiones de emoción **no se cargan** porque cuelgan del sistema de efectos, que
> no está portado.
>
> Sentarse: la vista baja **28 unidades en un segundo** y vuelve por la misma
> rampa, cierran los cinco candados, y cada cinco segundos una vuelta da vida,
> maná y el aguante entero. La vida es un **acumulador y no un paso**, así que
> descansar acelera: 6, 11, 16, 21 con 100 de vida máxima. Eso es el «poco a
> poco» del reporte.
>
> **Dos lecturas del motor decidieron el comportamiento.** Un `if` viejo abandona
> **su `Cmdlist`** y no el evento (script.cpp:5748-5757), así que sentarse SÍ da
> maná y lo que `SHOW_HEALTH` apagado se lleva son sólo los dos mensajes
> «Resting…». Lo confirma que la aritmética portada dé exactamente **3 de vida y
> 5 de maná** en la primera vuelta, que son los dos números de la cabecera del
> mod. Y el hallazgo lateral: **`regeneracionDeAguante` tenía su tercera
> condición escrita en su propio comentario** —«sólo si no corres ni *actúas*»—
> sin que nadie la aplicara; sin ella el `drainstamina -1000` del guion no se
> puede ni medir.
>
> `npm run sonda:menujugador85` **21 de 21** (tres pasadas seguidas), `npm test`
> **2 176 de 2 176**, build limpio. Seis roturas deliberadas con su `grep`: la de
> la costura baja la sonda a 7/20 y pone 6 pruebas rojas. También hubo que tocar
> `sondas/vgui29.mjs`, que se puso roja **con el juego bien**: lleva cinco
> experimentos pulsando el 1 para probar la tecla, y el 1 es «Sit Down (Rest)».
> Queda en 36 de 36. Y se rehorneó `npm run cuerpo` para añadir `nod_no` a la
> lista blanca: faltaba, y sin ella «Emote: Nod No» habría hecho que el muñeco
> dijera **sí**.
>
> Todo en [doc/MENU_85.md](doc/MENU_85.md), con **ocho filas candidatas para §4
> de `CLAUDE.md` en su §10, sin escribir ahí: lo decide el usuario.**
>
> **Lo que queda**, en §9: el **sistema de efectos** no está portado y es el hueco
> grande que esto deja a la vista; `anadirOpcion` sigue siendo un `=> {}` y
> `opcionesDelJugador` repite a mano lo que el guion sabe registrar; la rama de
> verdad de «Forgive Last PK» necesita saber quién te mató y no hay combate entre
> jugadores; y **la descripción del objeto va a la consola y en el original es un
> tercer destino** —`gHUD.m_Message` con fundido, en `reg.hud.desctext` =
> (0,012 · 0,72) de la pantalla— así que el enrutado no es fiel y queda dicho, que
> es el 60.


> **UN JABALÍ SUELTA SU PELLEJO (82).** Reportado desde una partida de verdad.
> No estaba portado —46 guiones lo usan y el horneado traía cero en los tres
> mapas—, y lo que hacía que nadie lo echara de menos es **dónde vive la
> regla**: el mod sortea el botín en `npc_post_spawn`, un segundo después de
> NACER, y lo entrega con `giveitem` (base_monster_shared.script:228-250); al
> morir, `DropAllItems()` sólo tira el inventario (msmonsterserver.cpp:2614).
> En el camino de la muerte no hay ninguna decisión que portar, y ahí es donde
> mira todo el mundo. `npm run sonda:botin82` **7 de 7** y `npm test`
> **2 122 de 2 122**. Escrito en [doc/BOTIN_82.md](doc/BOTIN_82.md).
>
> Edana: cinco jabalíes con `skin_boar` al **20 %** y el jefe con
> `skin_boar_heavy` al **100 %**; Gate City, 19 goblins con su hacha al 10 %.
> El 20 % importa para leer el reporte: con cinco jabalíes, la probabilidad de
> que ninguno suelte es **33 %**, así que «no sueltan nada» era compatible con
> la mala suerte — y por eso el control que decide es el jefe.
>
> **TRES COSTURAS ENTRE PIEZAS VERDES, que es el 63 tres veces seguidas:**
> 1. `build/msr/suelo.json` tenía **13 objetos** y los pellejos no estaban: el
>    manifiesto se junta de dos fuentes —lo que el mapa planta y lo que el
>    jugador lleva— y «lo que suelta un bicho» no era una. Y `Suelo.soltar`
>    devuelve `null` **en silencio**.
> 2. La sonda daba rojo con el trabajo bien hecho: `probe.reaccion.pegarA`
>    **rehace a mano** el camino de la muerte en vez de recorrerlo (el 65). Se
>    mata a espadazos con `golpe.atacar`; el jefe cae en 51 golpes.
> 3. El control del 71 «cae en un submodelo `_floor`» se puso rojo con los tres
>    pellejos, **y tenía razón el puerto**: su plantilla compara contra
>    `'misc/p_misc.mdl'` con comillas simples, que aquí no agrupan, así que esa
>    rama es falsa siempre y un pellejo tirado lleva el submodelo de la manzana
>    **en el juego también**.
>
> **Y la rotura que más enseñó:** quitando la llamada de `src/main.js`, las
> **2 122 pruebas de Node se quedaron verdes y la sonda se puso roja**.
>
> **Lo que queda**, en §7 de `doc/BOTIN_82.md`: `DROP_GOLD` no está portado (va
> en el mismo bloque y lo declara mucha más gente); el manifiesto del suelo sólo
> mira `edana` y `gatecity`, así que el botín del tercer mapa no entra todavía;
> y `DROP_ITEM3/4/5` no tienen ni un caso en los 2 884 guiones.

> **DOS COSAS MEDIDAS Y NO ARREGLADAS, de la misma captura del usuario:**
>
> - **El parpadeo entre animaciones de NPC: ARREGLADO.** El usuario creía que no
>   se podía tocar aquí y era literal lo que describía — se dibujaba un
>   fotograma con el muñeco en su **pose de enlace**. `stopAllAction()` deja el
>   mezclador sin acciones y Three devuelve el esqueleto al reposo (medido:
>   0,469 de salto contra 0,021 de movimiento normal), y el orden del bucle lo
>   pone en pantalla: `animar` hace `mezclador.update(dt)` ANTES de `refrescar()`,
>   que es quien cambia de animación, así que nadie vuelve a evaluar nada antes
>   de dibujar. Arreglo de una línea —`update(0)` tras arrancar la acción nueva—
>   y es lo que hace el motor (`pev->frame = 0`). `npm run sonda:parpadeo82`
>   **6 de 6**, y con el arreglo quitado da exactamente 0,0000 de distancia a la
>   pose de enlace. En [doc/PARPADEO_82.md](doc/PARPADEO_82.md).
> - **44 nombres de animación son la cadena literal `ANIM_IDLE` sin resolver**,
>   en 12 de los 48 NPC de Edana (los doce vendedores). El patrón «una variable
>   cuyo valor es el nombre de otra» aparece **238 veces** en los 2 884 guiones.
>   No afecta al reposo —ése se resuelve por actividad— pero sí sería su
>   animación de andar. El propio horneado ya lo avisa («OJO … no tiene
>   'ANIM_IDLE'»), así que no es un hueco callado.
>
> Y una teoría **retirada**: que el herrero de la captura estuviera en pose de
> andar por caer a la secuencia 0. Medido en el navegador, toca `idle7` bien.

> **EDANA DEJA DE REGALAR 10 000 PUNTOS, Y `return` DEJA DE CORTAR (83).** Dos
> de las seis verificaciones que pidió el usuario comparando con una captura
> del original. `npm test` **2 094 de 2 094**, `sonda:sidra81` 15/15,
> `sonda:jugador64` 16/16 ×3, 7 roturas deliberadas y 7 rojos. Escrito en
> [doc/GAUNTLET_83.md](doc/GAUNTLET_83.md).
>
> 1. **El bono del gauntlet tenía su guarda y le faltaban las CUATRO piezas.**
>    `if ( $get_find_token(MAPS_GAUNTLET_START,$lcase(game.map.name)) == -1 )
>    exitevent` (player/server/dmgpoints.script:32-42). No estaba portado
>    ninguno de los cuatro: `game.map.name` —**265 usos en los 2 884 guiones**,
>    resolviéndose a la cadena literal—, `$lcase`, `$get_find_token` y
>    `exitevent`. Y se tapaban unos a otros: un bloque con cuatro piezas sin
>    portar no da cuatro avisos, da un mensaje en pantalla y ninguno.
> 2. **`return` NO corta un evento, y llevaba cortándolo siempre.** Es
>    `returndata`; el motor lo dice encima de la función («*Does not stop code
>    execution*») y los guiones lo demuestran en dos líneas seguidas
>    (`chests/bank1/filter.script:25-26`). Eran **148 líneas en 81 ficheros**
>    abandonando el evento donde el juego sigue. En la misma línea había otras
>    dos: **`exit` no existe en el motor** (cero usos) y **`exitevent`, el que
>    sí corta, no estaba** (108 líneas en 53 ficheros). La bandera `ev.parar`
>    estaba escrita y comprobada desde el 67 **sin que nadie la encendiera**.
> 3. **El «alerted N allies as it died» era nuestro.** La cadena del mod no
>    imprime nada al jugador (monsters/base_monster_shared.script:1071-1095,
>    sólo un `dbg`). Quitado el texto, conservados el mecanismo y
>    `cuentas.avisos`. El 65 otra vez.
> 4. **Añadido al día siguiente (83 bis): el `if` VIEJO abandona su `Cmdlist`,
>    no el evento.** Lo destapó `-e0` midiendo el menú del jugador. `break`
>    sale del bucle y cae en el `return true` de :5771, y a los hijos se entra
>    por una recursión que tira el valor (script.cpp:5748-5765) — el comentario
>    del propio motor, «*breaks event execution*», engaña. Nuestro puerto ponía
>    `return false`, y el único sitio que lee ese valor es la cadena de `else`.
>    **Fidelidad sin efecto medible hoy y DECLARADA como tal:** de las 1 908
>    ramas `else` de los 2 884 guiones, 135 llevan un `if` viejo en su primer
>    nivel y **0** de ellas es algo distinto de la última rama de su cadena. El
>    control construye el caso a propósito, desde texto; roto a propósito, rojo.
>    Y **la fila del 67 no está mal**: decía «el bloque» por dónde estaba su
>    caso y no por la regla.
>
> **Estado al cerrar el 83 bis:** `npm test` **2 174 de 2 174**,
> `sonda:jugador64` **16/16**, `sonda:misiones33` **22/23** ×3 (el rojo de «51
> frases pendientes» sigue siendo de antes, medido por aislamiento). A
> `sondas/misiones33.mjs` le faltaba el corte del `vite-hmr` y se cayó dos veces
> con dos síntomas; una de ellas remató con **«0 de 0 en verde»**, la forma del
> 65. Puesto el corte, los 23 controles corren.
>
> **Queda abierto:** `world.script` no se ejecuta, así que `MAPS_GAUNTLET_START`
> no está puesta nunca y hoy el bono no sale en NINGÚN mapa — bien para Edana,
> hueco para los seis del original, declarado y con su control ya escrito.
> Y quedan dos frases de combate inventadas más (main.js:4569 y :4699); la
> segunda suplanta a un `gplayermessage` que el guion ya emite, así que **hay
> que medir antes de escribir texto**.

> **UNA RATA TE DEVUELVE EL GOLPE (82).** Lo reportó el usuario jugando en
> Edana: «parece que las ratas no están golpeando de vuelta al jugador». No lo
> hacían, y eran **dos fallos encadenados**, ninguno de los dos el daño — los
> 0,4 son del mod (`const ATTACK_DAMAGE 0.4`, y una rata tiene 4 de vida).
> `npm run sonda:mordisco82` **14 de 14** (+1 pendiente declarada) y `npm test`
> **2 104 de 2 104**. Escrito en [doc/MORDISCO_82.md](doc/MORDISCO_82.md).
>
> 1. **Una rata RECELA, y la rama que la provoca no estaba portada.** `vermin`
>    declara `recelo human`, y RECELO no cuenta como enemigo para la caza
>    (npcscript.cpp:1806), así que no te ficha por verte. El único camino es
>    `if $get(ent_laststruck,relationship,ent_me) equals wary` →
>    `npcatk_settarget … "struck_by_enemy"` (base_npc_attack_new.script:1078-1083).
>    O sea que **pegarle a una rata no tenía ninguna consecuencia**. Lo escondió
>    que **la otra rama del mismo `if` sí estaba portada y estudiada**:
>    `npcatk_retaliate` tiene el plazo del revés en el mod y `cambiaDeObjetivo`
>    lo documenta bien — pero su conclusión, «ningún monstruo cambia de objetivo
>    por recibir un golpe», valía para su rama y no para el `if`.
> 2. **`ATTACK_RANGE` no se compara con la distancia, se compara con `range`**, y
>    `range` lleva restada la mitad de las dos anchuras (scriptcmds.cpp:1154,
>    «MIB JAN2010_20 - range check take model widths into account»), porque mide
>    entre centros y **los cuerpos se estorban**. El jugador se mide por su
>    centro (36 sobre sus pies), un monstruo por sus pies
>    (msmonsterserver.cpp:244), y dos cajas de 32 no juntan los centros a menos
>    de 32: `hypot(32, 36)` = **48,2** contra un `ATTACK_RANGE` de **48**.
>    Cuatro décimas de unidad, para siempre. La anchura del jugador es **0**
>    (`m_Width` sólo lo pone el `width` de un guion de NPC, npcscript.cpp:201).
>
> **Y por qué el 80 no lo vio, que es la parte que no se puede volver a
> deducir:** su arnés pone al jugador en `[aU, 0, 0]`, o sea **a la altura de
> los pies de la rata**, y ahí el término vertical es cero y 32 < 48. Un
> experimento entero mirando a este mismo bicho. El 71 con otra ropa.
>
> Siete roturas deliberadas, siete rojas — una de ellas **se quedó verde en las
> 2 091** y por eso hay un control nuevo: la frontera entre `range` (con
> anchuras) y `$dist` (sin ellas, el alcance de persecución) no la defendía
> nada.
>
> **Lo que queda de esto**, en `doc/MORDISCO_82.md` §7: el mensaje de recibir un
> golpe se come el tipo de daño y el corchete de resistencia
> (giattack.cpp:1994); la rama vertical `vadj` del mod no está portada y para la
> rata no hace falta, pero tiene una ambigüedad de `NPC_HALF_HEIGHT` que hay que
> resolver antes; y la tasa de acierto del 30 % no se puede medir en la sonda.

> **TRES VECINOS SE PASAN UNA MISIÓN (81).** La sidra de Edana corre de punta
> a punta: le pides trabajo a Sylphiel, te manda a Bryan, le dices «cider» a
> Bryan y **él se lo cuenta a ella**, sin que tú lleves nada encima. Todo
> tecleando en el chat, porque una misión de Edana no empieza con un botón sino
> con una palabra. `npm run sonda:sidra81` **15 de 15** y `npm test`
> **2033 de 2033**. Escrito con la mitad de la sesión 82 en
> [doc/GUIONES_82.md](doc/GUIONES_82.md).
>
> Para llegar había **cuatro huecos apilados**, y cada uno tapaba al siguiente:
>
> 1. **`llamarExterno` seguía siendo un `=> {}`.** El 66 lo arregló en dos de
>    los tres entornos y dejó el de los NPC: **63 `callexternal` con destino en
>    27 ficheros**, más 111 `all` y 82 `players`, sin llegar a nadie. Su
>    comentario lo justificaba —«aquí no hay más guiones corriendo que el del
>    NPC de delante»— y **era verdad hasta el 79**. El `catchspeech` calcado:
>    un diagnóstico correcto con fecha de caducidad y sin fecha.
> 2. **Ningún NPC estaba en el registro de nombres**, así que `$get_by_name`
>    devolvía «0» en todas las partidas. Y al leer `name_unique` de la ficha,
>    el primer intento filtró por `npc_spawn` y encontró **2 de 48**: en los
>    2 884 guiones ese comando vive en **trece bloques distintos**.
> 3. **`eventname` no nombraba nada: 570 en 202 ficheros, 0 funcionando.** El
>    analizador sólo conocía la forma corta. Y un bloque sin nombre **no es
>    inerte: se ejecuta entero al nacer** (el 60), así que Sylphiel pagaba la
>    recompensa de la sidra antes de que entraras en la taberna. Sobrevivió 81
>    experimentos porque **los 25 guiones de Gate City usan la forma corta, los
>    25**: el caso único del 50, duodécima vez. Sólo en Edana, al arreglarlo,
>    **71 bloques dejan de correr al nacer y aparecen 33 nombres de evento que
>    no existían** (`npc_spawn`, `spawn`, `attack_1`, `bite1`…). Y destapó lo
>    que tapaba: `CallScriptEvent("spawn")` —el viejo, global.cpp:436— no lo
>    llamaba nadie.
> 4. **`$cansee` no estaba en `GETTERS`**, y con el `if` VIEJO un getter sin
>    soporte no se salta una línea: **abandona el bloque**. El `say_job` de
>    Sylphiel moría en su primera línea. Portado con sus cuatro rarezas, y una
>    que nadie espera: **`$cansee` ESCRIBE** (`StoreEntity(ENT_LASTSEEN)`,
>    npcscript.cpp:1843), que es lo que el `setmovedest ent_lastseen 9999` de
>    la línea siguiente convierte en el giro del vecino. Ahí se tocan este
>    experimento y el de `setmovedest`.
>
> **Seis roturas deliberadas en las pruebas y tres contra la sonda viva, las
> nueve rojas** — y la comprobación de que la rotura estaba puesta cazó dos que
> no casaban, que es el 80 funcionando.
>
> **Lo que más caro salió no fue el código, fue el instrumento**, tres veces:
> la sonda no creaba personaje (`entrarPorElMenu` no crea ninguno a propósito),
> y eso se descartó con `probe.misiones.bolsa()`, que devuelve un objeto
> siempre; vite recargaba la página a mitad de pasada porque hay cuatro
> sesiones guardando; y la consola parte las líneas largas, de modo que la
> frase buscada no estaba nunca en la línea firmada. Los tres daban rojos con
> el juego bien, y el primero costó que dos sesiones diagnosticaran cada una el
> archivo de la otra.
>
> **Lo siguiente de esta misión**, que no se ha tocado: Krythos tiene su
> `cider4` y la vuelta con `ciderreward`, o sea que la cadena **tiene un
> cuarto tramo** y la sonda sólo mide hasta el tercero.
>
> > **Medido en el 83 (la corrección va al lado, §7): el cuarto tramo
> > FUNCIONA.** Nueve pasos tecleando en el chat, de `job` a `cider_1 4`,
> > con el oro llegando a los 5 s (10 → 15) y el `CIDER` de Krythos a 99.
> > ~~**Sigue sin ser un control**: `sondas/sidra81.mjs` mide tres tramos y
> > queda declarado pendiente.~~ **CERRADO EN EL 86**: los nueve pasos tienen
> > control, `sonda:sidra81` **25 de 25** (eran 15), con `DECLARADOS = 25` para
> > que el marcador pueda bajar. La rotura que lo valida: anulando sólo el
> > `callexternal ciderreward` se pone rojo **el paso 7 y sólo el 7**. Y dos
> > plazos que la tabla no decía — el 3b son DOS relojes encadenados (~7 s, no
> > 5) y el `CIDER` de Bryan pasa a 3 un segundo después de mandarte a Krythos.
> > La tabla entera, en [doc/GUIONES_82.md](doc/GUIONES_82.md) §11.

> **QUE UN VECINO SE GIRE AL HABLARLE (81).** El gancho `irA` de `entornoDe` era
> un `=> {}` **desde el experimento 43**, con cuatro pruebas verdes que le
> construían el gancho a mano: el `=> {}` de relleno del apartado 4, treinta y
> ocho experimentos. **Ningún NPC de este puerto se había movido nunca por su
> guion.** `npm run sonda:edana81` va **13 de 13** y `npm test` **1953 de 1953**.
> Todo en [doc/MOVEDEST_81.md](doc/MOVEDEST_81.md).
>
> 1. **Contar el horneado cambió el experimento antes de escribir código.** De
>    los **130 `setmovedest` de Edana, en 25 de sus 27 guiones, 65 llevan
>    proximidad 9999** — la mitad justa—. Y 9999 es más que cualquier distancia
>    del mapa, así que `SetMoveDest` entra en su rama de «¿ya está cerca?» en el
>    primer `Think`, pone el rumbo EXACTO al destino, llama a `StopWalking` y
>    avisa (msmonsterserver.cpp:1018-1029). O sea que **`setmovedest <quien> 9999`
>    no es «anda hasta él»: es «gírate a mirarlo y párate»**, y es con lo que un
>    vecino se vuelve hacia ti cuando le hablas. *Portar un comando no es portar
>    sus ramas en abstracto: es portar las que los guiones usan, y eso se cuenta.*
> 2. **EL OJO DE UN BICHO ESTABA UN 10 % BAJO, en los cuatro sitios.**
>    `pev->view_ofs = Vector(0, 0, m_Height)` (msmonsterserver.cpp:250), tres
>    líneas bajo el `UTIL_SetSize` del 80: **el ojo y el casco los escribe la
>    misma función con el mismo número.** El proyecto hacía `alto * 0.9`, y el 0,9
>    **es la proporción del JUGADOR** (caja 72, ojo 64). No daba error porque a
>    quien anda le da igual —`Length2D` tira la altura—, pero sí mueve el rayo del
>    paseo, los dos `veA` o sea `$cansee`, y la proximidad de quien vuela. Ahora
>    hay **una sola definición**, `ojoDe(i)`.
> 3. **UN VIAJE DE CADA CINCO NO LLEGABA NUNCA, y es del 77.** `avanzar` topa el
>    paso a `falta - cerca`, así que el NPC aterriza **exactamente en el borde del
>    círculo, siempre**, y ahí el `<=` del motor entre flotantes es una moneda:
>    medido sobre 1 900 pares, **el 21,3 % cae del lado de «todavía no»**. Ese NPC
>    se queda clavado y **la escena que lo espera no acaba jamás**. El motor no lo
>    sufre porque `UTIL_MoveToOrigin` se mete DENTRO del círculo. Arreglado con
>    25 nanómetros de holgura.
>
> Y lo que se ve en pantalla: **Sembelbin miraba a 90° —180° del jugador— y tras
> hablarle mira a 270°, exactamente al jugador**, con `llegadas 1` y sin andar un
> metro. Con `irA` devuelto al `=> {}`, tres controles de la sonda se ponen rojos.
>
> **Nueve roturas deliberadas, nueve rojas** — y una décima que se quedó verde
> acusando a la pieza y no al control: la rama del vector nulo de `VecToAngles`
> **no tiene efecto** (`atan2(-0, 0)` es `-0`, que es `=== 0`) y además está en el
> motor **para el pitch, no para el yaw**. Se quitó, regla del 78.
>
> **Lo que queda, con su número, en [doc/MOVEDEST_81.md](doc/MOVEDEST_81.md) §7:**
> `fauna.js` no tiene `lineaDeVision` (en red el guion no tiene el rayo de
> `$cansee`); la rama `(x y z)` de `setmovedest` tiene **cero casos en los tres
> mapas** y su control va declarado pendiente; `RetrieveEntity` no resuelve un
> `info_target`; y **`ent_lastseen` se llama al revés de lo que hace** —
> `ClosestTarget` se sobreescribe en el bucle (npcscript.cpp:1838-1846), así que
> es el visible MÁS CERCANO y no el último visto.

> **PEGARLE A UNA RATA (80).** Tres cosas que el jugador veía y ninguna sonda
> podía ver, **y todas por la misma razón: las tres sondas de combate del
> proyecto miden contra goblins y zombis.** Nunca se había puesto un control
> delante de una rata. `npm run sonda:edana80` va **21 de 21** y `npm test`
> **1908 de 1908**. Todo en [doc/COMBATE_80.md](doc/COMBATE_80.md).
>
> 1. **Faltaba `CAnimOnce`, y son DOS mitades.** Un ataque es `playanim once`, y
>    `CanChangeTo` devuelve `m_fSequenceFinished` (monsteranimation.cpp:217-220):
>    nadie puede pisarlo hasta que acabe. Y quien lo devuelve al reposo es el
>    `Think` del monstruo, **cada 0,1 s** (msmonsterserver.cpp:511 y 586-600).
>    Sin lo primero el ataque duraba **120 ms de 1000**; sin lo segundo el primero
>    se quedaba congelado **2017 ms**. Ahora el jabalí de Edana hace sus 1 620 ms
>    medidos en pantalla.
> 2. **El arma daba UN intento y el motor da dos.** Cuando la esfera no encuentra
>    a nadie, `DoDamage` traza la línea con **`dont_ignore_monsters`** y le hace
>    daño completo a lo que toque (giattack.cpp:1636-1646). El puerto, en vez de
>    eso, tocaba el sonido de dar en piedra — y encima **el rayo no filtraba a los
>    bichos**, así que chocaba contra el cilindro de la rata. Dos rayos en la misma
>    función y sólo uno filtraba. Un monstruo no puede sonar a piedra:
>    `CE_HITMONSTER` contra `CE_HITWORLD` (msmonsterserver.cpp:2438-2445).
>    Con la espada oxidada, la franja en la que la esfera alcanza a una rata mide
>    **cuatro unidades, diez centímetros**: eso era «tienes que pegar más cerca».
> 3. **El mismo bicho tenía DOS tamaños en el mismo fotograma.** El colisionador
>    salía de la caja medida de la malla y el objetivo del golpe del `setsize` del
>    guion, que es el que usa `UTIL_SetSize` (msmonsterserver.cpp:244). Cambian
>    61 de 69 en Gate City, 44 de 48 en Edana y 57 de 74 en el tercer mapa.
>
> **Y «puedo atravesar las ratas» NO era el colisionador: medido, para al jugador
> a 32,8 u con los cuerpos separando 32,0.** Lo que queda son dos explicaciones y
> las dos están abiertas: con servidor el cliente **nunca le pone cilindro a un
> bicho que aparece** (contado y sin arreglar, es lo siguiente), y un cadáver se
> ve 23,6 s sin colisión, que es fiel. Los once sentados de la taberna de Edana sí
> se atraviesan: declaran `ancho 5` y en el original también.
>
> **Seis roturas deliberadas, seis rojas** — y la quinta dejó todo verde la
> primera vez porque **el `perl` de la rotura no había sustituido nada**. El
> apartado 4 aplicado al método de comprobar el apartado 4.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. **Los cilindros en multijugador**: la rama de red del bucle sólo llama a
>    `seguir()`, nunca a `poner`. Se mide con dos Chrome, como el 27 y el 61.
> 2. **La caja en vez del cilindro**, para cerrar la fidelidad del casco.
> 3. **`MSTRACE_LARGEHITBOXES`** en la traza del segundo intento, sin medir.

> **EL CAPITÁN DE LA GUARDIA TE CONTESTA (79).** Pulsas la F delante de Edrin
> en Edana, eliges «Say Hello» y **te contesta**: «Hail, traveller.» Hasta hoy
> esa opción imprimía `Edrin, Captain of the Guard says, "Hello"` —tus palabras
> firmadas por él— y no la oía nadie. `npm run sonda:edana79` va **24 de 24** y
> `npm test` **1892 de 1892** (+33). Todo en [doc/OIR_79.md](doc/OIR_79.md).
>
> **Empezó siendo la sonda de una misión de Edana y no se podía escribir.** De
> sus 18 `ms_npcscript`, 16 lanzan un evento a un NPC y son el libro, la sidra
> y las pruebas del alcalde — pero **esas misiones no se contestan pulsando un
> botón: se contestan diciendo una palabra**, y `catchspeech` llevaba desde el
> 43 registrado y mudo.
>
> **Dos fallos, y el primero no dejaba ni llegar al menú.**
> 1. **`atof` de C no es `Number`.** Veintiún guiones escriben `hp 700/700`,
>    que en el mod vale 700 por accidente y aquí daba `NaN` → `hp: null`. Un
>    NPC sin vida no está en `Manada.vivos()`, que es de donde sale
>    `candidatosDeGolpe()`: **no se le podía golpear NI hablar**, sin un solo
>    error. Eran **8 de los 48 de Edana** —Edrin y los seis sacerdotes— y 2 de
>    los 69 de Gate City; 30 criaturas en 13 mapas. Y `atof` **ya estaba
>    escrito en ese mismo archivo**, con «No es `Number()`» encima.
> 2. **`MOT_SAY` hablaba por el NPC.** Una opción `say` sin retrollamada —que
>    es lo que son casi todas— no hacía nada. Ahora habla el jugador y le oyen
>    los de alrededor: `game_heardtext` a todos y `HearPhrase` al que encaje,
>    en ese orden, con el alcance del 61 y no uno nuevo.
>
> **Y un fallo que metí yo, que destapó otro del juego.** Leí
> `probe.mundo.unidadesPorMetro` sin llamarla, el jugador acabó en `NaN` y
> **dieciocho NPC le saludaron desde el otro extremo del mapa**: `NaN > rango`
> es `false`, así que un umbral con `>` no filtra lo que no es un número. La
> guarda nueva no se podía romper en rojo, así que **la sonda produce el `NaN`
> a propósito** y exige que no le oiga nadie.
>
> **Seis roturas deliberadas, seis rojas** — y una de ellas cazó que un control
> mío **sobrevivía a su propia rotura la mitad de las veces**, porque «Say
> Hello» sortea su texto y a veces el NPC repetía justo lo que la expresión
> buscaba.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. **La misión de la sidra de punta a punta**, que ya se puede medir: `cider`
>    → Bryan → Sylphiel → Krythos, tres NPC.
> 2. **`setmovedest` de verdad**, el pendiente número uno desde el 77 (`irA` es
>    un `=> {}` desde el 43).
> 3. **El cofre del alcalde y el botín**, con `ITEM_NOPICKUP` y el oro.
> 4. Lo contado y no portado de Edana: `env_sound` (11, la reverberación), los
>    dos `env_beam` de las columnas de humo y el `speaker` del pregonero.

> **EL AVENTURERO SALUDA Y EL FANTASMA SE DESVANECE (78).** El 77 dejó los
> tipos 1 y 3 de `ms_npcscript` escritos y **declarados pendientes**, porque no
> hay ni uno en Gate City ni en Edana. Ya se miden: entra
> **`gertenheld_forest2`** como tercer mapa portado, que es el único del juego
> donde los dos cuelgan de un `trigger_once` sin nombre, o sea del pie del
> jugador. `npm run sonda:gertenheld78` va **49 de 49** y `npm test` **1859 de
> 1859**. Todo en [doc/ESCENAS_78.md](doc/ESCENAS_78.md).
>
> **El tercer mapa destapó cuatro huecos, los cuatro sin un solo rojo antes.**
> 1. **El control del árbol BSP muestreaba el cielo.** Tomaba «las 200 caras de
>    suelo más grandes» y al aire libre las mayores son la caja de cielo, que
>    contesta al revés. De once mapas medidos **fallaban seis**, y Edana pasaba
>    **por un punto**. El umbral lo arregló el 48; la muestra se quedó sin
>    mirar.
> 2. **Ninguna animación de escena del juego se había horneado nunca.** La lista
>    blanca sale de la ficha del NPC y el `actionanim` está en el `.bsp`. El 77
>    lo tapó por casualidad: sus dos escenas piden `walk` y `run`, que la ficha
>    de Edrin ya nombraba.
> 3. **Un `killtarget` que nombra a un bicho no mataba a nadie**: el bus sólo
>    miraba el cableado del mapa. Gate City tiene 0 y Edana 2 que no apuntan a
>    un bicho; éste tiene 13 y cuatro sí. **Décima vez que el hueco lo enseña un
>    mapa que no es el primero.**
> 4. **Los `params` de un `ms_npc` no los lee nadie** (`set_no_roam`): contado,
>    no portado.
>
> **Y la sonda del 77 nunca apuntó la cámara.** `probe.mundo.mirar` toma tres
> números y recibía un array: `NaN` en el `yaw` y **el cuerpo del jugador sin
> simular**. Sus controles de píxeles salieron verdes midiendo lo que hubiera
> delante. Corregido en las dos sondas; el 77 sigue en 43 de 43.
>
> **Nueve roturas deliberadas, nueve rojas** — y una décima pieza que escribí,
> la normalización de brillo del contador de píxeles, que **se quitó** porque
> romperla dejaba la sonda verde tres pasadas seguidas. Lo que hace el trabajo
> es contar en una ventana alrededor del NPC y no en la pantalla entera.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. **Los `params` de un `ms_npc`**: son eventos de guion
>    (`monsters/externals.script`), y levantarlos quita la única fuente de ruido
>    que le queda a la sonda del 78.
> 2. **`setmovedest` de verdad**, que es el pendiente número uno del 77 y sigue
>    siéndolo (el punto 1 de abajo).
> 3. **Un tipo 3 que ANDE**: el de este mapa nace a 2 unidades de su punto. Los
>    largos están medidos y escritos: deralia 1 818, cleicert 949, phobia 263.

> **EDRIN ANDA (77).** `ms_npcscript` tiene cinco tipos y el 67 portó uno; los
> otros cuatro salían contados como «usar». Pisas el arriate de flores de Edana
> y **el capitán de la guardia cruza la plaza corriendo**, te suelta «Hey! Stay
> out of there!» y cuatro segundos después vuelve andando a su sitio.
> `npm run sonda:edana77` va **43 de 43** y `npm test` **1842 de 1842**. Todo en
> [doc/ESCENAS_77.md](doc/ESCENAS_77.md).
>
> **El tipo que faltaba es el más común del juego.** `SCRIPT_MOVE` son **98 de
> los 172** `ms_npcscript` de los 81 mapas, y 110 de los 172 mueven al NPC.
> Edana tiene tres y **Gate City cero**: octava vez seguida que el hueco lo
> enseña el segundo mapa.
>
> **Tres fallos del mod, portados con el fallo puesto.** `Finish(bool)` se come
> su argumento; `m_EarlyBreak` **no se limpia nunca**, así que una escena que se
> corta una vez dispara su `fireonbreak` para siempre y pierde su `firedelay`; y
> **`setmovedest none` hace que una escena se crea que el NPC ha llegado**,
> porque apaga la condición y deja el destino escrito.
>
> **Y dos valores de reposo que habrían dado verdes vacíos.** «Edrin ha llegado
> a `edrinspot`» es cierto antes de empezar —32 unidades contra 35,2 de
> proximidad—, así que lo que se mide es el viaje a las flores. Y «al llegar ya
> no está en escena» salió rojo **con el código bien**: con `firedelay`,
> `FireTarget` no corre hasta cuatro segundos después y el NPC sigue congelado.
>
> **Nueve roturas deliberadas: ocho rojas y una que no.** `Vagabundo.aplazar`
> roto a propósito dejó las 26 pruebas verdes, y no por un control flojo: en
> esta arquitectura esa línea **no tiene efecto**, porque el reparto de
> `Manada.pasear` ya aparta al paseo antes de llegar a ella. Está dicho donde
> vive y no se cuenta un verde por ella.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. **`setmovedest` de verdad**: el gancho `irA` es un `=> {}` **desde el 43**,
>    así que ningún NPC se ha movido nunca por su guion. Arrastra `$dist`,
>    `game.monster.origin`, `$vec.yaw` y `setangle face`. Y al revivirlo hay que
>    **volver a mirar el control de la vuelta de Edrin**: habrá dos mecanismos
>    que lo manden a casa y dejará de distinguir cuál fue.
> 2. **Una misión de Edana de punta a punta con sonda.**
> 3. **El botín de un cadáver**, con `ITEM_NOPICKUP` y el oro.
> 4. El **modo aditivo** del haz de luz de la cloaca, que dejó el 70.
> 5. Lo contado del 75: **resbalar** (`SV_FlyMove`), el `game_drop` de los otros
>    quince guiones y soltar de dentro del zurrón.

> **LA MANZANA DEL ÁRBOL SE APAGA, Y LA SOPA APARECE (76).** `env_render` sobre
> un adorno, que el 69 dejó escrito como imposible y el 70 y el 71 arrastraron.
> Golpeas la manzana, cae — y **la del árbol ya no sigue colgando**.
> `npm run sonda:edana76` va **34 de 34** y `npm test` **1816 de 1816**. Todo en
> [doc/ADORNOS_76.md](doc/ADORNOS_76.md).
>
> **Un adorno con nombre no se funde.** La razón que el 69 escribió —los 46
> adornos van en una sola malla, así que esconder uno no es apagar un nodo— era
> correcta y la conclusión no: no hay que buscar el trozo, hay que no fundirlo.
> En GoldSrc cada `env_model` es su propia entidad con su propio estado de
> dibujo. Son **9 de 46** en Edana y **0 de 101** en Gate City, que es por donde
> esto llevaba cuatro experimentos sin verse.
>
> **Cuatro adornos NACEN invisibles y este puerto los dibujaba.** Los platos de
> sopa de la taberna traen `rendermode 4` y `renderamt 0` en el `.bsp`: estaban
> en la mesa desde el primer fotograma con las mesas vacías. No faltaba el
> `env_render`: faltaba el estado de nacimiento.
>
> **Y el `env_render` del plato se llama IGUAL que el aparecedor del
> parroquiano.** `patronspawn` sortea uno de doce y cuatro de esos nombres llevan
> plato: **la sopa aparece cuando se sienta el cliente**. `patron9` tiene plato y
> no tiene parroquiano — un descuido del mapeador que aquí es el instrumento,
> porque es el único que mueve una sola cosa.
>
> **`renderfx` vale 0 en las 229** cosas con aspecto de los dos mapas, así que de
> `CL_FxBlend` se porta una rama y las otras quince se dejan escritas en una
> tabla en `src/play/aspecto.js` en vez de en un `switch` que no corre.
>
> **Cinco fallos de instrumento**, todos de la sonda y ninguno de las pruebas: la
> cámara dentro de una mesa, el `origin` de un `.mdl` que está 0,8 m por debajo
> de su modelo, el `renderer.info` que es el del arma y no el del mundo, un
> control que era una carrera y otro que fallaba el 13 % de las veces por el
> sorteo. Están en CLAUDE.md §4 y en [doc/AVISOS.md](doc/AVISOS.md).
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. ~~**`ms_npcscript` tipos 0 y 4** ×3: Edrin andando a `edrinspot`.~~ **Hecho
>    en el 77**, y el tipo 0 resultó ser 98 de los 172 del juego.
> 2. **Una misión de Edana de punta a punta con sonda.**
> 3. **El botín de un cadáver**, la tercera vía al suelo, con `ITEM_NOPICKUP` y
>    el oro.
> 4. El **modo aditivo** del haz de luz de la cloaca, que dejó el 70 — y ahora
>    hay con qué: `src/play/aspecto.js` tiene los seis modos.
> 5. Lo contado del 75: **resbalar** (`SV_FlyMove`), el `game_drop` de los otros
>    quince guiones y soltar de dentro del zurrón.

> **NO SE SUELTA: SE TIRA (75).** La otra mitad de los objetos en el suelo. La
> tecla `c` —`bind "c" "drop"`, en la tabla desde el **24**— ya hace algo:
> saca lo que lleva la mano por el ojo a 175 u/s más 60 hacia arriba, con la
> velocidad del jugador encima, y vuela 2,14 m antes de caer.
> `npm run sonda:edana75` va **30 de 30** y `npm test` **1791 de 1791**. Todo en
> [doc/SOLTAR_75.md](doc/SOLTAR_75.md).
>
> **La dirección no es por donde miras.** El motor escribe el cabeceo del
> `pev->angles` de un cliente como **menos un tercio** de la vista
> (sv_user.cpp:993) y el mod pide ahí su `v_forward`: mirando 60° al suelo el
> objeto sale **20° hacia arriba**, y lo más abajo que se puede soltar algo son
> 30° por encima de la horizontal. No hay manera de dejar nada a los pies.
>
> **Un suelo que no es suelo.** `FL_ONGROUND` lo da un `SV_PointContents` que
> mira el hull del MUNDO y de las entidades sólo las `SOLID_NOT`
> (world.cpp:625-626). Encima de una `func_door` o un `func_breakable` lo
> soltado **no se tumba, no suena, no pasa a `SOLID_TRIGGER` y caduca desde que
> lo soltaste**. Es el segundo caso que el 71 no pudo tener.
>
> **Dos candados que no cierran y un mecanismo muerto.** `fNextActionTime` no se
> asigna en ningún sitio del mod y `sethand undroppable` no sale en ninguno de
> los 2 884 guiones, así que todo lo que llevas encima se puede soltar. Y el
> «pulsa otra vez para soltar» está muerto por una tautología
> (genericitem.cpp:1323-1324) — el hermano del `ItemCount = 1` del 71.
>
> **Y un fallo del puerto que encontró la sonda:** el objeto quedaba **a ras** de
> la cara en la que se paraba, y entonces el rayo de recogida chocaba contra esa
> misma cara: la espada caída no se podía coger. El motor lo deja a
> `DIST_EPSILON` (world.cpp:727).
>
> **El segundo caso del lector de `game_fall`:** **5 de los 13** guiones del
> suelo no cumplen el `+2`. Un cuarto de bastón tirado saldría dibujado como un
> `evilfshard_rhand`.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. ~~**`env_render` sobre un adorno**: la manzana cae y la del árbol sigue
>    ahí.~~ **Hecho en el 76**, y no por donde se creía: un adorno con nombre no
>    se funde. Trajo además cuatro platos de sopa que nacían invisibles.
> 2. ~~**`ms_npcscript` tipos 0 y 4** ×3: Edrin andando a `edrinspot`.~~ **Hecho en el 77**, ver
>    [doc/ESCENAS_77.md](doc/ESCENAS_77.md).
> 3. **Una misión de Edana de punta a punta con sonda.**
> 4. **El botín de un cadáver**, la tercera vía al suelo, con `ITEM_NOPICKUP` y
>    el oro.
> 5. El **modo aditivo** del haz de luz de la cloaca, que dejó el 70.
> 6. Y lo contado del 75: **resbalar** (`SV_FlyMove`), el `game_drop` de los
>    otros quince guiones y soltar de dentro del zurrón.

> **LA MANZANA CAE (71).** Los objetos en el suelo, que no existían: ni uno en
> ninguno de los dos mapas. Golpeas la manzana del manzano de Edana, cae 3,5 m,
> se tumba, suena, dura 120 s y se coge con la `x`.
> `npm run sonda:edana71` va **26 de 26** y `npm test` **1752 de 1752**. Todo en
> [doc/SUELO_71.md](doc/SUELO_71.md).
>
> **El submodelo de estar tirado no es una fórmula.** Lo calcula el `game_fall`
> de cada guion y cada familia con una cuenta distinta; `health_apple` **anula**
> el `+2` de `base_drink` para poner `+1`. Con la fórmula del `+2` —la que
> `tools/armas.mjs` lleva escrita desde el 23— la manzana cae del árbol
> convertida en `oldbook_rhand`, un libro viejo. **38 de las 174 armas** tampoco
> cumplen el `+2`. El lector nuevo es `caidaDe` en `src/bsp/script.js`, y
> resuelve 593 de los 760 objetos del catálogo.
>
> **Y el alcance de recoger no son 64 unidades**: la esfera se mide contra la
> CAJA del objeto (±24), o sea **88 en horizontal**. El cono es 2D —no tiene
> techo, que es lo que permite agacharse— y vale 0,5 y no 0,1.
>
> **Un fallo portado:** el `ItemCount = 1;` a pelo de player.cpp:5199 deja el
> menú de «Gather items» inalcanzable. Con dos cosas a los pies te llevas una.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. ~~**Soltar del inventario** (`CGenericItem::Drop`). Es la otra mitad de los
>    objetos en el suelo; la tecla `c` está en la tabla desde el 24 y no hace
>    nada. Y trae un segundo caso de verdad para el lector de `game_fall`: un
>    arma, que va por `base_weapon`.~~ **Hecho en el 75**, y el segundo caso
>    salió: 5 de los 13 guiones del suelo no cumplen el `+2`.
> 2. **`env_render` sobre un adorno**: la manzana cae y la del árbol sigue ahí.
> 3. ~~**`ms_npcscript` tipos 0 y 4** ×3: Edrin andando a `edrinspot`.~~ **Hecho en el 77**, ver
>    [doc/ESCENAS_77.md](doc/ESCENAS_77.md).
> 4. **Una misión de Edana de punta a punta con sonda.**
> 5. El **modo aditivo** del haz de luz de la cloaca, que dejó el 70.

> **FISURA, RÍO Y ARQUITECTURA DEL MENÚ.** Entrantes más profundos, derrubios
> apoyados en el labio, bruma cerca del salto, río de ancho variable y desgaste
> escaso en almenas y fábrica. Corregida la costura entre río y cascada con
> prueba sobre geometría real. Ver [doc/DETALLES_MENU.md](doc/DETALLES_MENU.md)
> y comparación local `build/menu/detalles/comparar.html`.

> **CIELO Y PAISAJE DEL MENÚ.** Bancos de nubes más amplios, abertura detrás
> de la torre y mesetas erosionadas alrededor de una vega más tranquila.
> Las sombras locales se desvanecen en su límite para evitar cortes sobre
> las laderas. Ver [doc/PAISAJE_MENU.md](doc/PAISAJE_MENU.md) y comparación
> local `build/menu/paisaje/comparar.html`.

> **ESCALA MONUMENTAL DEL MENÚ.** La torre mide ahora 260×110 m, con puerta
> y detalles pequeños sin agrandar, fábrica más fina, cimentación integrada
> y valle de mayor profundidad. Cámara, nubes y sombras acompañan la escala.
> Ver [doc/ESCALA_MENU.md](doc/ESCALA_MENU.md); comparación visual local en
> `build/menu/escala/comparar.html`. La exploración retro queda pendiente.
> Esta pasada es independiente del trabajo de guiones y objetos de abajo.


> **LA TAPA DE LA CLOACA (70).** `func_door`: tres en Edana, cero en Gate City.
> Es la pieza que el 69 dejó pendiente, y **el bucle del corral se cierra**:
> rompes el almiar de 8, la tapa se corre 126 unidades, y al LLEGAR arriba
> (doors.cpp:673, no al arrancar) revienta los otros tres almiares.
> `npm run sonda:edana70` va **20 de 20** y `npm test` **1723 de 1723**. Todo en
> [doc/PUERTAS_70.md](doc/PUERTAS_70.md).
>
> **Las tres no estaban en la colisión de nadie**, al revés de lo que el 69 dio
> por hecho: la malla de choque es el modelo 0 más `func_wall`, así que la tapa
> era una lámina de 4 unidades **sólo dibujada** y se pasaba andando. Lo que se
> les da no es moverse: es el colisionador que nunca tuvieron.
>
> **Y el 48 estaba mal.** Un `targetname` ya cierra una puerta al tacto, no sólo
> `SF_DOOR_USE_ONLY` (doors.cpp:531-538): **las dos hojas de `door2`**, la casa
> del alcalde, se abrían solas al acercarse desde hace veintidós experimentos, y
> con eso los dos `trigger_changetarget` que las gobiernan eran adorno. Cinco de
> siete en Edana y nueve de nueve en Gate City daban el mismo resultado con la
> regla mal.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. **Objetos en el suelo.** No hay ninguno en todo el port, y es lo que le
>    falta a `msitem_spawn` para que la manzana caiga de verdad.
> 2. **`env_render` sobre un adorno.** Los nombres ya se hornean (9 de 46);
>    falta saber qué trozo de la malla fundida es de cada colocación.
> 3. ~~**`ms_npcscript` tipos 0 y 4** ×3: Edrin andando a `edrinspot`.~~ **Hecho en el 77**, ver
>    [doc/ESCENAS_77.md](doc/ESCENAS_77.md).
> 4. **Una misión de Edana de punta a punta con sonda.** `quest` sale 118 veces
>    en sus guiones y no se ha seguido ninguna.
> 5. Y lo único del 70 que se ve a simple vista y no está: el **modo aditivo**
>    del haz de luz de la cloaca (`sewerbeam`, `rendermode 5`), que sale de la
>    malla del mundo —donde sí era transparente— y se monta opaco.


> **LO QUE SE ROMPE, SE PULSA Y SE SUELTA (69).** `func_breakable`, `func_button`
> y `msitem_spawn`: **veinte rompibles entre los dos mapas y ni uno se rompía**,
> porque estaban horneados dentro del trimesh del mundo. `npm run sonda:edana69`
> va **26 de 26** con Chromium de verdad y `npm test` **1699 de 1699**. Todo en
> [doc/ROMPIBLES_69.md](doc/ROMPIBLES_69.md).
>
> Los cuatro almiares de Edana se llaman los cuatro `hay`, el de 8 de vida abre la
> cloaca, y **`CBreakable::Die` le borra el nombre antes de disparar** para que la
> puerta no le reviente a él (func_break.cpp:821-825). Debajo de los almiares no
> hay suelo: tapan la boca del pozo.
>
> Tres claves engañan: **`health` de un `func_button` no es vida** —es la bandera
> de «se puede golpear», buttons.cpp:439-466—, **`spawnstart` de un `msitem_spawn`
> significa lo contrario** (gispawn.cpp:94-98, como el 68) y **`duration` no la lee
> nadie**. Y el comentario del material del mod miente: `material 1` es madera, no
> metal.
>
> **Dos huecos que no estaban en la lista.** `env_render`, portado en el 49, no
> alcanzaba a nada: seis de los siete de Edana apuntan a un `env_model` y los
> adornos se horneaban sin nombre. Y cuatro tipos de salida del bus caían por
> `fall-through` en `aplicarDisparos` y se contaban como `eventoDeNpc: sin NPC`
> —el contador que el 67 leyó para hablar de `merc3`.
>
> **Lo siguiente, por orden de lo que cierra:**
> 1. **Las tres `func_door` deslizantes de Edana.** Es lo único que separa
>    «rompo un almiar» de «se abre la cloaca y cae el resto del montón». Gate City
>    tiene cero, así que nadie lo había echado en falta. El molde es
>    `montarPuertas` y la prueba ya dice que hoy da 1 y tiene que dar 4.
> 2. **Objetos en el suelo.** No hay ninguno en todo el port, y es lo que le falta
>    a `msitem_spawn` para que la manzana caiga de verdad.
> 3. **`env_render` sobre un adorno**: hay que saber qué trozo de la malla fundida
>    es de cada colocación. Los nombres ya se hornean (9 de 46 en Edana).
> 4. Una misión de Edana de punta a punta con una sonda: `quest` sale 118 veces.


> **LAS TRES OLEADAS DE EDANA (68).** El usuario se acordaba de que *«el jefe
> jabali aparecia despues de matar x cantidad de jabalies normales»*. **Tenía
> razón, y el mapa es más preciso que el recuerdo: quince jabalíes en tres
> oleadas de cinco, sin azar** (`spawnchance 100` en las cuatro fichas).
> `npm run sonda:edana68` va **13 de 13** con Chromium de verdad y `npm test`
> **1654 de 1654**. Todo en [doc/OLEADAS_68.md](doc/OLEADAS_68.md).
>
> Lo portado: `spawnstart` → `porDisparo`, `MSQuery` → despertar una ficha por su
> nombre, `perishtarget` → `alPerecer`, `killtarget` del monstruo → `alMorir`, el
> cable de `FireTargets` al mapa en los dos caminos, y **`CMultiSource::Register`**,
> que no estaba.
>
> Las dos claves tienen **el nombre al revés** y hay que portar lo que hacen:
> `spawnstart 1` es «no salgas hasta que te llamen» (msmapents.cpp:827-844, con
> cuatro intentos de Thothie de arreglar el nombre comentados al lado), y
> `killtarget` en un `msmonster_*` **no mata: dispara** (msmonsterserver.cpp:2568).
>
> **El jefe sigue sin salir, y ahora se sabe por qué.** No es la `SUB_UseTargets`
> invertida que el 67 sospechaba: se para un paso antes. `wave3_1` y `wave3_2`
> tienen `delay 4`, y un retraso crea una entidad nueva (`"DelayedUse"`,
> subs.cpp:252-269) que el `multisource` rechaza por no estar registrada — **lo
> avisa el propio mod en la primera línea de `CMultiSource::Use`**
> (buttons.cpp:173-176). Se porta el fallo, con su control positivo al lado:
> llamado a mano el jefe sale, con sus 60 de vida, y su `killtarget` llega al viejo
> del huerto (`oldman.trig_boarsdead`, medido).
>
> **Lo que le queda a Edana:** 4 `func_breakable` (los almiares, uno abre la
> alcantarilla), 4 `msitem_spawn`, el `func_button` de la manzana, los
> `ms_npcscript` tipos 0 y 4 que mueven a Edrin, **una misión de punta a punta**
> (`quest` sale 118 veces y nadie la ha seguido) y las dos `msarea_transition`,
> diferidas por el usuario desde el 67.
>
> Y dos avisos nuevos que cuestan una sesión: **`censo().lista` de la sonda no trae
> `muerto`**, sólo `dormido` —una sonda se pasó 720 llamadas rematando cadáveres y
> lo contó como progreso—, y **hay dos `SUB_UseTargets` y no son virtuales**, así
> que de qué hereda una entidad decide si dispara. En [doc/AVISOS.md](doc/AVISOS.md).

> **EDANA SE ENCIENDE (67).** Se pidió dejar Edana al 100 % con las transiciones
> fuera, y salieron **cinco huecos, cuatro con el valor de reposo en verde**.
> `npm run sonda:edana67` va **18 de 18** y `npm test` **1635 de 1635**.
> Todo en [doc/EDANA_67.md](doc/EDANA_67.md).
>
> Lo que más cambia, por si sólo se lee esto:
>
> 1. **`scriptfile` gana a `defscriptfile`** (msmonsterserver.cpp:415-416) y el
>    extractor lo hacía al revés: **3 373 criaturas en 81 mapas** con el guion de
>    su clase. En Edana, cinco sacerdotes y el viejo del huerto eran «Commoner»,
>    y el jefe de los jabalíes un jabalí de 20 en vez del de 60. **Quinta vez
>    seguida que lo enseña el segundo mapa.**
> 2. **Los jabalíes no hacían daño. Ni las arañas de Gate City.** Hay TRES formas
>    de declarar el daño de un ataque y el lector conocía una. Las tres sondas de
>    combate del proyecto estaban verdes porque miden todas contra goblins.
> 3. **`game.serverside` no se resolvía**, y casi siempre está detrás de un `if`
>    VIEJO que **abandona el bloque entero**. En `game_player_putinworld` está en
>    el comando 3 de 20, así que el evento con el que un mapa de Master Sword se
>    enciende moría en la tercera línea. **280 casos** en los 2 884 scripts.
> 4. **`usetrigger`** no existía: es el único comando que cruza del guion al
>    `.bsp`. Con él y con el clon de `SF_MULTIMAN_THREAD`, la taberna de Edana se
>    llena — **8 ciclos y el `ms_counter` a cero**, medido en el navegador.
> 5. **`ms_npcscript` ×18**, que son las misiones del pueblo. Portado el tipo 2
>    (15 de los 18); el viejo del huerto ya contesta a `trig_boarsdead`.
>
> **Lo que le queda a Edana**, medido y en orden: los 4 `func_breakable` (los
> almiares), los 4 `msitem_spawn`, el `func_button` de la manzana, los 3
> `ms_npcscript` que mueven a Edrin, `perishtarget` y **una misión de punta a
> punta** (`quest` sale 118 veces y nadie la ha seguido).
>
> **Y UNA SOSPECHA QUE HAY QUE MEDIR ANTES DE ESCRIBIRLA COMO UN HECHO:** la
> cadena del jefe jabalí pasa por un **`multisource`**, y ésa baja por la
> `SUB_UseTargets` rota del motor. O sea que **puede que el jefe no aparezca
> tampoco en el juego original**. Ver §7 de [doc/EDANA_67.md](doc/EDANA_67.md).


> **LO QUE LE AFECTA AL JUGADOR SE LO HACE UN OBJETO (66).** El 64 vio que el
> jugador es una entidad con guion, el 65 que faltaba llamar, y éste contesta la
> pregunta: **los objetos también corren su guion, y es por ahí por donde le
> llega casi todo**. `npm run sonda:objetos66` va **11 de 11** y reproduce lo que
> el usuario recordaba: con el hechizo de rejuvenecer en la mochila la vida va de
> **1 a 15 en seis segundos**, y sin él de 1 a 1.
>
> **Y UN FALLO DEL CARGADOR QUE ERA LO MÁS GORDO.** `cargarGuion` subía todos los
> `#include` al principio, con un comentario encima que decía lo contrario. Como
> `const` gana el PRIMERO y un guion de MSR está escrito para eso, cada entidad
> cogía los valores de su plantilla: **593 de 760 objetos, 2 623 `const`**. El
> goblin **moría en silencio**, la araña decía «parried!» en vez de «dodged!»,
> dos vecinos de Edana no te saludaban y **61 de los 63 pergaminos enseñaban Fire
> Dart**. Nada de eso ponía nada rojo. Ahora el recorrido está en un sitio,
> `src/play/cargador.js`, con el lector inyectado.
>
> **Y una corrección contra mí:** aquí estaba escrito que «los anillos ya llaman
> al guion del jugador, que ya corre y está probado». Falso: el único que llamaba
> a `bloodstone_toggle` era una prueba, **a mano**. `llamarExterno` era un no-op
> en los dos entornos. Corregido al lado en `doc/JUGADOR_64.md`.
>
> **LO PRIMERO QUE HAY QUE HACER sigue siendo lo del 65: `sonda:arranque36` se
> cae en el control 22 de 30**, y entre los ocho que no corren está el control
> del experimento 50. No es del 64 ni del 65 ni del 66 —comprobado— y se planta
> en el `waitForFunction` de «el menú se cierra» tras pulsar «Start».
>
> Después, de los objetos: lo barato y con más efecto son `cancelattack`
> (**2 195** eventos a los que sólo les falta él) y `setviewmodelprop` (2 095).
> Y ampliar la horneada más allá de los 172 alcanzables es cambiar una lista.
> Todo en [doc/OBJETOS_66.md](doc/OBJETOS_66.md).

> **LO QUE FALTABA NO ERA PORTAR: ERA LLAMAR (65).** Antes de portar más
> comandos se contó, y el censo dijo lo incómodo: **21 de los 40 eventos del
> motor que trae el guion del jugador ya corrían enteros** y este puerto
> llamaba a dos. Enganchados cuatro: `game_parry` —que sustituye
> «You parried the blow!», una frase **nuestra**, por la del juego con las dos
> tiradas dentro—, `game_xpgain`, `game_damaged` y `game_hitground`.
>
> El hallazgo: **el guion mueve la cámara sin ningún comando para eso**.
> Escribe `game.cleffect.view_ofs.z` y el cliente lo suma a la vista cada
> fotograma (hudscript.cpp:208-221). Es una interfaz por variable, así que el
> efecto se apaga solo. Hizo falta resolver `game.time` —sin él el hundimiento
> del aterrizaje estaba escrito y no arrancaba— y darle reloj de verdad al
> guion. `sonda:jugador64` va **16 de 16**, y romper el enrutado la deja en 15.
>
> **LO PRIMERO QUE HAY QUE HACER: `sonda:arranque36` se cae en el control 22 de
> 30.** No es del 64 ni del 65 —comprobado desactivando el guion— y llevaba
> tiempo escondido porque el resumen decía «22 de 22 en verde» con la caída en
> una nota al pie. Ya cuenta como roja (**22 de 23**). Se planta en el
> `waitForFunction` de «el menú se cierra» tras pulsar «Start», 60 s. Los ocho
> que no corren incluyen **el control del experimento 50**, o sea que ese
> control lleva sin ejecutarse quién sabe cuánto.
>
> Después, del jugador: lo barato es `setstat` (4 eventos) y `setwearpos` (un
> archivo entero); lo caro y visible es `cleffect` —353 usos, del 47 % al 56 %
> de un golpe—, que son partículas.

> **EL JUGADOR TAMBIÉN ES UNA ENTIDAD CON GUION (64).** Era el hueco que no
> tenía nombre: este puerto corría los guiones de los NPC desde el 33 y
> **ninguno del jugador**. Son 27 archivos y 9 566 líneas colgando de
> `player/player.script`, y de ahí salen la regeneración, los avisos de la
> primera vez y el «Your Parry value is now 2» de la captura del usuario, que
> no está en el código del mod sino en `player/externals.script:696`.
>
> `npm run jugador` hornea y cuenta: **9 archivos de 25 caben enteros**, y por
> evento **253 de 541, el 47 %**. Se
> corren, y `npm run sonda:jugador64` va **12 de 12**: al morir sale el consejo
> de `help/first_death` en la ventana de ayuda —la que llevaba desde el 60 sin
> que nadie la abriera—, con su texto, una sola vez por personaje; y la vida
> sube sola, 5 → 6 en catorce segundos.
>
> Dos hallazgos que no se adivinan y están en `doc/JUGADOR_64.md`:
> **`repeatdelay` lo resuelve el CARGADOR**, así que un evento con retardo
> arranca solo —eso contesta quién llama a `player_regen_hp`: nadie—; y como
> el retardo nombra una variable que al cargar no existe, `atof` da 0 y **la
> primera regeneración llega en el acto**.
>
> **LO PRIMERO QUE HAY QUE HACER:** seguir con el jugador, y el orden lo da
> `npm run jugador` ordenado por uso. Lo más barato con más efecto es
> `player/player_sh_stats` (le falta **un** comando, `setwearpos`) y
> `developer/player/externals` (le falta `setstat`, que es lo que alimenta la
> hoja y el parry). Lo más caro es `cleffect` —353 usos—, que son los efectos
> de partículas del cliente.
>
> Y lo que está cargado y **no dispara nadie**, declarado pendiente y no
> contado: `game_party_join` (no hay grupos) y `game_transition_entered` (no
> hay transiciones entre mapas). El día que los haya funcionan sin tocar nada.
>
> **Y UN HUECO NUEVO CON NOMBRE, que salió de una corrección del usuario: los
> OBJETOS tampoco corren su guion.** `npm run objetos` lee sus `.script` para
> sacar una tabla —peso, ataques, modelo— y ahí se acaba; sus eventos no los
> ejecuta nadie. Por eso el hechizo Rejuvenate no regenera: su bucle
> `passive_regen` (`repeatdelay 0.5`, `divination × 0,1 + 4` de vida por vuelta,
> `items/magic_hand_div_rejuvenate.script:155-179`) vive en el objeto, no en el
> jugador. Y los anillos sí llaman al guion del jugador —`bloodstone_toggle`,
> que ya corre y está probado—, así que la mitad del camino está hecha: falta
> la entidad «objeto con guion», que es la misma maquinaria del 64 aplicada a
> otra cosa.
>
> **CORRECCIÓN DEL 66: la frase de los anillos era falsa.** `bloodstone_toggle`
> corría, pero el único que lo llamaba era `test/juego_jugador64.test.mjs:228`,
> **a mano**; en el juego `llamarExterno` era un no-op. No había media camino
> hecho: había cero. Hecho en el 66. **362 bucles de `repeatdelay` arrancan solos en 271 de los 2 884
> scripts**, así que esto no es un caso raro.

> **SE COMPRA POR EL CABLE (63), Y EDANA RECUPERA SEIS VECINOS.** Las tres
> rojas que dejó el 62 están cerradas: `npm run sonda:tienda62` va **14 de 14**
> con dos navegadores contra un servidor de verdad. Ana compra, su oro baja
> 5000 → 4985 con el precio que puso el servidor, el cuchillo aparece en su
> mochila, Beto no puede abrir la tienda mientras ella comercia, entra en
> cuanto ella se aleja 354 unidades, y **ve la existencia que Ana bajó**: 3 → 2.
> Un estante, no dos.
>
> El registro en `_trade` que pedía el usuario dijo `claves= []`: `abrir` no se
> había llamado **nunca**, porque `GuionDeNpc` no reenviaba `trato` a
> `entornoDe`. Debajo había otros dos, los tres en costuras: el objeto se metía
> con un bucle sobre un lote que **vale cero** por omisión, y el cambio **no se
> le contaba al navegador** (nuevo `MENSAJE.FICHA`, el `NETMSG_SETSTAT` del oro
> y el `NETMSG_ITEM` de la mochila). Control nuevo que recorre la costura
> entera: `test/red_tienda63.test.mjs`.
>
> Además, de lo que el usuario vio en sus capturas: **el censo dejaba fuera la
> familia `msnpc_`** —Edana pasa de 42 a **48** NPC, Gate City no tiene
> ninguno—; las ventanas de arriba ya no parten el texto a 114 px (faltaba el
> `setSize` de `vgui_infowin.h:68-71`); y están los **cinco avisos de correr**
> de `DoSprint` (`avisoDeCarrera`, `src/play/movimiento.js`).
>
> **LO PRIMERO QUE HAY QUE HACER:** el **guion del jugador**. El «Your Parry
> value is now 2» de la captura no sale del motor ni del mod: sale de
> `MSCScripts/scripts/player/externals.script:696`. En Master Sword el jugador
> también es una entidad con guion, y son **26 archivos** en `scripts/player/`
> —`player_main`, `player_sh_stats`, `player_sv_regen`, `player_statusflags`…—
> que este puerto no corre. No es un mensaje que falte: es un sistema.
>
> Después: vender (escrito y no medido desde el 60), los grupos —que el canal
> «party» del chat está esperando—, `game_confirm_buy`, y el censo de guiones
> **por mapa**, que es el número que hace falta para decir cuánto le falta a
> Edana. El PvP va al final: viene apagado de fábrica (`ms_pklevel "0"`).
> Y sigue pendiente lo del 56: extraer el golpe.

> **UN ROJO QUE YA ESTABA: `sonda:intro42`, 11 de 14.** Las tres son la
> presentación del mapa a los ~11 s y ~14 s, y **no son del 63**: se
> revirtieron a mano los dos cambios que podían tocarlas y la sonda dio 10 de
> 14, una peor. Es una sonda que espera segundos donde debería esperar el
> efecto — los mismos controles ven las tres ventanas más tarde en el mismo
> recorrido. Arreglarla es cambiar los relojes por `waitForFunction`.

> **UNA COSA DEL ENTORNO, que cuesta media hora cada vez.** Cada vuelta de
> sonda deja un `vite` huérfano y a la docena el servidor deja de llegar a sus
> plazos: la sonda falla con «el servidor no contestó a 'lista'», que parece de
> la red y es de la máquina. Se limpian con `Get-CimInstance Win32_Process`
> filtrando por la carpeta del proyecto. Está en `doc/AVISOS.md`.

> **MENÚ: MATERIALES DE TORRE Y CRÁTER.** El usuario veía superficies planas y
> de un solo color. Nueva respuesta de relieve y rugosidad en
> `src/render/superficiesmenu.js`, compartida por piedra de la torre y valle.
> Hiladas, mortero, desgaste, depósitos, fracturas y escorrentías; relleno frío
> del cielo para leer las caras en sombra. Cámara, cielo y geometría conservados.
> Es bump de sombreado, no desplazamiento de la silueta ni iluminación global.
>
> `sonda:materialesmenu` mide sólo píxeles visibles de torre y paredes; el
> relieve debe funcionar con albedo uniforme. Pasa; al romper el relieve por
> omisión falla en el control específico. Node: **1521/1521**; build correcto.
> Sondas vecinas 57, 58 y menú 52 (**19/19**) pasan sobre la versión final.
> Captura: `build/menu/materiales/final-validado/menu.png`. Comparador local:
> `build/menu/materiales/comparar.html`. Detalles en
> [doc/MATERIALES_MENU.md](doc/MATERIALES_MENU.md).
> El usuario propuso explorar un estilo retro **más adelante**; no se aplicó
> reducción de resolución, paleta o geometría en esta pasada.

> **EL CHAT, Y LA RED DESCUBRE QUE HAY UN SEGUNDO MAPA (61).** El usuario
> preguntó cuánto falta para Edana y para que dos personas estén en el mismo
> mapa, y pidió verificar la ventana de chat. **La ventana de chat no
> existía** —`hudms.js:27` la declaraba «leída y no hecha»— y el multijugador
> **sólo se había medido en Gate City** desde el 27.
>
> Medirlo en Edana dio una caída y tres fallos encadenados, los tres invisibles
> con el mapa de por omisión:
>
> 1. `location.search = "?map=X&menu=1"` **reemplaza la cadena entera** y se
>    llevaba el `red=ws://…`: elegir cualquier mapa que no fuera el de por
>    omisión te sacaba de la partida en silencio.
> 2. El servidor manda su mapa desde el 47 y **el cliente sólo lo escribía en
>    la consola**: si no coincidía, andabas otro mundo con las figuras de los
>    demás puestas en él. Lo señaló el usuario de memoria —«en msr original
>    cambiar de mapa te desconecta y te reconecta al servidor que ya cambió»—
>    y es lo que hace el motor. Ahora se recarga con el mapa del servidor, y
>    sólo si el jugador ya eligió mapa: con el menú delante manda el menú.
> 3. `sondas/entrar.mjs` recorría botones con manejadores mientras «Start»
>    navegaba. Los tres bucles pasan a localizadores.
>
> Y un control que medía Gate City: `triangulos > 40000`. **21 de 21 en los dos
> mapas.**
>
> **El chat, portado entero.** Tres canales y no tres colores: `y` global, `u`
> local, `j` party, tal cual los ata `config.cfg`. La frase la arma el
> servidor —nadie puede hablar con el nombre de otro— y el local llega a 300
> unidades medidas **en 2D**. Nuevo `src/play/chat.js` (39 pruebas), dos
> mensajes en el protocolo, `_decir` en `partida.js`, `src/juego/chat.js` con
> la consola —que es la MISMA clase que la de sucesos, otros cvars— y el
> cajetín. `npm run sonda:chat61` **24 de 24**, con dos navegadores y la Y
> pulsada de verdad.
>
> Dos fallos propios que cazó la sonda: el rango comparaba **300 unidades de
> GoldSrc contra metros de Rapier** —el local se oía desde el otro extremo del
> mapa— y un control que andaba «un rato fijo» medía la cuesta de Edana.
>
> **Lo siguiente, para el objetivo del usuario (Edana jugable entre dos), y en
> ESTE orden, que lo corrigió él:**
>
> 1. **La autoridad de las tiendas al servidor.** El usuario recordó que las
>    ventanas de compra y los guiones son ventanas VGUI del juego, y tiene
>    razón con una precisión que cambia el trabajo: la ventana es del cliente
>    y **todos sus números llegan del servidor** —`iStoreBuyFlags`,
>    `Quantity`, `iCost`, `flSellRatio`, `iBundleAmt`, `StoreGold`, todos por
>    `READ_*` en vgui_storemainwin.cpp:88-135—, comprar es
>    `ServerCmd("trade …")` (client.cpp:739). Aquí el estante se calcula en el
>    navegador: dos jugadores ven dos estantes distintos. No es portar la
>    tienda, es mudar la autoridad.
> 2. **Los guiones al servidor.** `menuselect` ya viaja con ese nombre en el
>    original —`ClientCmd` en menu.cpp:143, atendido en
>    multiplay_gamerules.cpp:1576—; aquí el guion corre en cada navegador.
> 3. **Los grupos**, que el canal «party» del chat está esperando.
> 4. **El PvP, al final.** El usuario recordó un voto de PvP; no existe — los
>    votos son sólo `kick` y `time` (multiplay_gamerules.cpp:1701-1713) y el
>    PvP es `ms_pklevel`, que **viene a "0"** (svglobals.cpp:47). Su conclusión
>    —que el juego es cooperativo y el PvP apenas se usaba— la respalda el
>    valor de fábrica, así que baja del camino crítico. Ojo al portarlo: el
>    comentario «1 == in town only» está AL REVÉS, `PKAllowedinTown` pide
>    `> 1` (svglobals.cpp:144, 148).
>
> Y aparte: `game_playerspeak` y `game_heardtext` —hablarle a un NPC por voz—,
> el censo de guiones **por mapa**, que es el número que falta para poder decir
> cuánto le queda a Edana, y lo del 56: extraer el golpe.

> **LOS MENSAJES ESTABAN TODOS EN LA MISMA ESQUINA (60).** Lo trajo el usuario
> jugando: «varios mensajes que aparecían como pop up en la esquina superior
> izquierda o derecha están saliendo todos en el event hud de la esquinera
> inferior derecha». Tenía razón, y de las dos esquinas.
>
> El mod escribe en TRES sitios y los separa a propósito desde 2008 —el
> comentario de `AddHelpWin` dice «not to overlap eventhud»—: `SendInfoMsg`
> abajo a la derecha, `SendHUDMsg` arriba a la izquierda (`player.h:554` lo
> lleva escrito al lado de la declaración) y `SendHelpMsg` arriba a la derecha.
> Este puerto mandaba los tres al primero: la presentación del mapa, el anuncio
> de subir de nivel y el `infomsg` de los guiones.
>
> **No es un verde que no mide nada: es un verde que mide otra cosa.** Las
> reglas —qué se dice y cuándo— estaban bien y probadas de punta a punta. Lo
> que no miraba nadie era el ENRUTADO. Fila nueva en el apartado 4.
>
> Nuevo `src/play/aviso.js` con los siete números de `vgui_infowin.h` y dos
> erratas del motor portadas; `src/juego/mensajes.js` pasa de tres capas a
> cinco. `npm run sonda:aviso60` **22/22**.
>
> **EDANA, HABLADA (60, segunda parte).** El 50 dejó dicho que Edana no se
> había jugado. Al medirlo salieron dos fallos:
>
> 1. `tools/guiones.mjs` buscaba `game_menu_getoptions` en el texto CRUDO, y un
>    NPC casi nunca trae su menú: lo hereda del `#include`. **139 → 262** de los
>    2 884. No se vio porque los 25 de Gate City lo declaran ellos mismos.
> 2. `build/edana/guiones.json` estaba **rancio**: lo horneó el 50 sin que
>    hubiera `bichos.json`, así que guardó los 139 de todo MSR y sólo 9 de los
>    22 de Edana. Trece NPC mudos.
>
> Se separaron rompiendo uno con el otro puesto: **lo que devuelve la voz al
> pueblo es volver a hornear**, no el arreglo del censo. `npm run sonda:edana60`
> **13/13** — los siete hablan, seis venden, y la presentación de Edana («The
> Village of Edana» + «Intended Difficulty», sin «WARNING») es el segundo caso
> que a la regla del 47 le faltaba.
>
> Node **1429/1429**, `vite build` limpio. Detalles, las cuatro roturas y los
> cuatro rojos que eran de la sonda: [doc/AVISO_60.md](doc/AVISO_60.md).
>
> **LA TIENDA (60, tercera parte): se compra.** El 44 dejó el modelo y escrito
> que «no dibuja la tienda»; el README decía «you cannot buy yet». Ya no.
>
> Son TRES paneles: `npcstore.offer` abre un selector —«1. Buy / 2. Sell / 3.
> Cancel», con el número dentro del texto— y de ahí a la lista, que es el panel
> del inventario (`CStorePanel : public VGUI_ContainerPanel`). Aquí se hereda
> igual. Nuevo `src/vgui/tienda.js`; `comprar()`/`vender()` en
> `src/play/tienda.js` con el orden de los cuatro noes del motor.
>
> **Tres fallos, los tres ENTRE piezas que funcionaban:**
>
> 1. `npcguion.js` pedía `catalogo.porId` y le pasaban el `Map`: **ninguna
>    tienda del juego tenía un solo objeto**, en los dos mapas, desde el 44 y
>    sin un error — caía en el cajón de «el guion pide algo que no tenemos».
> 2. Un bloque `{ … }` sin nombre **se ejecuta entero** (`fNextExecutionTime =
>    0`, script.cpp:5198), no es una lista de constantes. Sin eso, el
>    `if( STORE_BUYMENU equals 'STORE_BUYMENU' ) setvard STORE_BUYMENU 1` de las
>    plantillas no corría y **todos los vendedores salían sin «1. Buy»**.
> 3. El menú manda la opción y LUEGO se cierra; en el original la respuesta
>    viene del servidor y aquí de la misma pila, así que el cierre se llevaba la
>    tienda recién abierta. Dos veces el mismo día.
>
> `npm run sonda:tienda60` **20/20**: oro 5000 → 4985, objetos 5 → 6,
> existencia 3 → 2, «You receive Sharp Knife.», y sin dinero «You can't afford».
> Node **1460/1460**. [doc/AVISO_60.md](doc/AVISO_60.md), tercera parte.
>
> **Lo siguiente:** *vender* está portado y **no medido** —el panel marca, suma
> y dice «Selling N items for G gold», pero no hay sonda que lo recorra: está
> declarado pendiente, no verde—. Después, `game_confirm_buy` (el aviso de «no
> tienes nivel para esta arma»), `menu.autoopen`, los ganchos
> `bchat_before_menus`/`after_menus`, y los `setvar` de cabecera (`hp`, `gold`,
> `name`, `setmodel`) que salen sin soportar en seis de los siete NPC de Edana.
> Y sigue pendiente lo del 56: extraer el golpe.

> **MENÚ: FISURA Y ATMÓSFERA (58).** El usuario autorizó elevar la calidad
> del menú independientemente de Gate City. Fisura con paredes y fondo reales,
> cimentación bajo la torre, cascada reorientada y fachada en contraluz.
> Nubes volumétricas con Data3DTexture y 64 pasos, sombras de geometría a 2048,
> destino de color RGBA16F con alternativa RGBA8 y MSAA hasta 4 muestras.
> Luz compartida y presupuesto en `src/play/torre.js`; pasada propia restaura
> el renderer del juego incluso ante errores. No se añadieron assets.
>
> Node: **1399/1399**. Sonda 57 y menú 52 (**19/19**) pasan, incluida entrada
> a Edana por Create Server. Nueva `sonda:torre58` mide píxeles de fisura,
> volumen, sombras y MSAA: pasa; al desactivar las sombras a propósito falla
> en su control específico. Compilación correcta. Capturas y medidas finales:
> `build/menu/vistas/final58/`. Chromium usa SwiftShader: falta medir la GPU real.
> El siguiente trabajo visual sería enriquecer roca, vegetación y formas de
> nube; no hay un requisito de limitar el menú a la estética de Gate City.
> Detalles, decisiones y límites: [doc/TORRE_58.md](doc/TORRE_58.md).

> **LAS SONDAS ENTRAN POR LA PUERTA (59), y ahí había un fallo del juego.**
>
> La regla del 36 —«si su camino no pasa por `menuselect`, no cuenta»— llevaba
> desde entonces sin cumplirse: **27 de las 33 sondas registradas** abrían
> `?map=gatecity`, y sólo dos escribían por qué. Ahora el camino está en un
> sitio, `sondas/entrar.mjs`, y quedan 7 con `?map=` — las 7 con el motivo
> escrito, porque convertirlas les quitaría la pregunta. Lo exige
> `test/sondas_entrada.test.mjs`.
>
> **EL FALLO: el sorteo de la pose de reposo no existía.** Convertir
> `sonda:mundo` puso rojos dos controles **con el juego correcto**, y tirando
> del hilo: `buscarActividad` era la única función del proyecto cuyo dado era
> `(n) => entero`; todas las demás usan `Math.random`. `Manada` le pasaba el de
> la casa, así que `azar(total) < peso` era `Math.random() < peso` —siempre
> cierto— y ganaba **siempre la última** secuencia. Los doce aldeanos, los doce
> en `anim_xbow_aim_idle`, desde el 21. Arreglado: **31 de 69 cambian de pose
> en 25 s**. El pueblo asiente.
>
> Y la prueba de reparto estaba en verde porque **le pasaba su propio dado del
> tipo correcto**: medía que la función sabe sortear, no que la llamen bien.
> Fila nueva en el apartado 4 de CLAUDE.md.
>
> **`src/` ya no nombra a Gate City:** 7 menciones → 3, las tres en `mapa.js`.
> Se fueron los tres nombres de malla de `bsp_escena.js` («gatecity»,
> «gatecity-translucido», «gatecity-detalle» — con Edana cargado, la malla de
> Edana se llamaba gatecity) y el nombre bonito duplicado, que era nuestro y
> sólo para uno de los 93 mapas. **El guardia del 47 se extiende a todo `src/`**
> y prohíbe también nombrar al OTRO mapa portado.
>
> **Cuatro cosas más, todas medidas:** `congelarPaseo` fabrica un estado
> imposible (46 de 69 clavados con la animación de andar); las pulsaciones del
> menú despiertan el `AudioContext`, así que eso se mide antes del primer clic;
> `pantalla38` **no** se convierte porque compara los dos caminos a propósito
> (convertida daba 33/35); y el control inestable de `sonda:arco` del 55 se
> desmontó —era el desnivel de la mano más el cono— y queda **declarado
> pendiente** con 7 unidades constantes sin explicar.
>
> Todo en [doc/ENTRADA_59.md](doc/ENTRADA_59.md). **OJO al número**: esto
> empezó siendo el 57 y se renumeró al 59 porque la otra sesión ya había usado
> el 57 y el 58. El árbol compartido comparte también la numeración.
>
> **Lo siguiente sigue siendo lo del 56: extraer el golpe.**


> **MENÚ: TORRE Y VALLE (57).** Nueva tarea del usuario: acercar la escena 3D
> a la escala y atmósfera de la referencia de Anders Finér. Torre maciza con
> piedra visible, valle abierto, río y cascada, cielo nublado luminoso. Se
> corrigieron caras del fuste invertidas y salida lineal aplicada por error a
> una escena diseñada para sRGB. El juego conserva su salida anterior.
>
> `npm test`: **1391/1391**. Nueva `npm run sonda:torre57`: menú real en cuatro
> formatos, entrada a Edana y controles de píxeles al retirar elementos y
> avanzar el tiempo. Se arregló también el congelado de la vista previa.
> Detalles y límites: [doc/TORRE_57.md](doc/TORRE_57.md).
> El refactor del golpe del 56 queda donde estaba; no fue el objetivo de esta tarea.


> **SEGUNDA PARTE DEL 56: EL CONTADOR MEDÍA TEXTO, Y EL GOLPE YA TIENE
> COSTURA.**
>
> **Corrección a lo que escribí hace un rato, en la entrada de abajo:**
> `partida` **no sale del bloque del golpe**. Se usa tres veces, dos de ellas
> once líneas por encima de su declaración. Los «19 usos desde la 378» eran la
> palabra «partida» en **comentarios en español** y `red.partida`. El contador
> era un `grep`, y `grep` no sabe JavaScript.
>
> Y en este repositorio el sesgo es peor de lo normal: **la regla de la casa es
> que los comentarios van en español**, así que los nombres en español
> —`partida`, `muneco`, `equipo`— son justo los que más aparecen en prosa. Un
> contador de texto está sesgado contra los nombres que más falta hace medir.
>
> **El instrumento ahora está escrito: `tools/nombres.mjs`.** Parsea con
> `rollup/parseAst` y cuenta referencias a identificadores, no apariciones del
> texto. El del 55 y el del 56 eran los dos `node -e` de usar y tirar, y por
> eso nadie pudo ver sus fallos. Su control: tres veces la palabra en un
> comentario → `antes 0`; una referencia de verdad → `antes 1`.
>
> **Lo que sí había que mover: la pasada de la vista.** `laVista`, `muneco`,
> `manifiestoDeCuerpos`, `munecos` y `ponerMuneco` salen del bloque del golpe.
> 38 líneas, mudanza entera, sin tocar su lógica. Rotura a propósito
> (`ponerMuneco` devuelve `null` siempre): `sonda:golpe` **21/26**, cinco
> rojos. Está medido — y lo mide **una sola sonda**, `sondas/golpe.mjs`, que es
> el sitio equivocado: el día que el golpe salga, esos cinco controles se
> quedan midiendo algo que ya no vive ahí.
>
> **El efecto de las dos partes:** declarados dentro del golpe 32 → **21**;
> nombres que salen al código 25 → **15**. Y de esos quince, uno es `equipo`
> —el estado del módulo, se va con él— y **catorce son funciones que son la
> interfaz del golpe**. Eso ya no es acoplamiento, es una costura.
>
> **LO SIGUIENTE: extraer el golpe.** Ya se puede.
>
> Lo demás en [doc/EQUIPO_56.md](doc/EQUIPO_56.md).


> **EL EQUIPO EN LAS MANOS (56) — y tres catálogos que no eran del golpe.**
> `brazo`, `armaEnMano`, `brazal` y `escudoEnMano` pasan a un `const equipo`:
> se escriben desde dos sitios (`empunar`, `embrazar`) y se leen desde
> cuarenta y tres. Los dos cachés de mallas se quedan fuera a propósito.
>
> **Lo que salió por el camino, y es más importante:** parte del bloque del
> golpe no era del golpe. Los tres catálogos (`armas`, `flechas`, `escudos`)
> se declaraban dentro y se leen **diez veces por encima** de su `let` —el
> inventario en la 1842, el escudo en la 2195—. Pasan a `const catalogos`, y
> la carga entera se sube delante del bloque. Un nombre que se usa quinientas
> líneas antes de declararse no vive donde parece que vive.
>
> **CORRECCIÓN A MI PROPIA CIFRA DEL 55:** no eran «19 declarados, 13
> saliendo». Contado con las fronteras escritas y separando quién lee qué eran
> **32 y 28**. Y esa separación es lo que cambia la tarea: **27 de esos 28
> salen sólo para la sonda**, que se pasa en un paquete de captadores y no
> cuesta nada. Lo que de verdad acopla son 19. Está en
> [doc/EQUIPO_56.md](doc/EQUIPO_56.md).
>
> **La trampa de esta vuelta: los getters.** El reemplazo respetaba las claves
> de objeto (`armaEnMano:`) pero un getter no lleva dos puntos, y siete
> quedaron como `get equipo.brazo()`. Lo cazó `esbuild`, no una prueba. Y sus
> nombres se restauraron a los viejos a mano: son la superficie pública que las
> sondas llaman por su nombre.
>
> **Rotura a propósito, y esta vez con rojos:** con `equipo.armaEnMano = null`,
> `sonda:golpe` 23/26, `sonda:arco` 36/40, `sonda:escudo` 33/35 — **nueve
> rojos**. El equipo sí está medido, y no hizo falta escribir un control nuevo.
> No todo lo que no tiene dueño está sin medir.
>
> **Pendiente que salió de ahí:** con el catálogo de escudos vacío,
> `sonda:escudo` **revienta** (`TypeError` en su línea 68) en vez de ponerse
> roja. Una sonda que se cae no dice cuántos controles habrían fallado.
>
> **Lo siguiente, y son mudanzas, no refactores:** `partida` —declarada en la
> 2929, dentro del golpe, usada 19 veces desde la 378— y la pasada de la vista
> (`muneco`, `ponerMuneco`, `laVista`). Sólo cuando esos dos salgan tiene
> sentido intentar el golpe en sí.
>
> El analizador de acoplamiento **sigue roto** (el cero falso del 55) y no se
> ha usado: todo se contó a mano sobre el fichero.


> **TERCERA PARTE DEL REPARTO: `aguante`, y LA FATIGA NO LA MEDÍA NADIE.**
> `aguante`, `corriendo` y `rapidezAnterior` pasan a un `const fatiga` — son lo
> que el cliente del motor lleva fotograma a fotograma (`CHudFatigue::DoThink`,
> y el comentario de `main.js` ya lo decía sin sacar la conclusión).
>
> **Rotura a propósito: quitar el gasto de aguante al correr.** `sonda:hud`
> 36/36, `sonda:mundo` 40/40 y `sonda:golpe` 26/26, **las tres en verde** con
> la fatiga congelada. La barra se medía —dónde está, de qué color, que sean
> cuatro— pero que el número que pinta cambie no lo comprobaba nadie.
>
> **Y vivía de eso un verde vacío:** `sonda:escudo` afirma «levantar el escudo
> es gratis» comparando `a === b`. Con un aguante que no se mueve nunca, esa
> igualdad se cumple sola.
>
> Controles nuevos, en pareja: **correr gasta** (7,5 → 6,4) y **parado se
> recupera** (6,4 → 7,5). El segundo hace valer al primero — sin él, un aguante
> que se desangrara sin parar también cumpliría «baja al correr». Discriminan
> en las dos direcciones, con dos roturas distintas.
>
> **Y un tercer hallazgo, sin arreglar:** `probe.golpe.atacar()` llama a
> `brazo.tic()` directamente y **no pasa por `pasoDelBrazo`**, que es donde se
> cobra el aguante de blandir. Un mandoble de la sonda sale gratis aunque en el
> juego no lo sea. Es la lección del 21 y del 22 en un accesor que la tiene
> escrita al lado. Arreglarlo toca los 26 controles de `sonda:golpe`.
>
> **Y una medida que NO uso, y se dice:** el analizador de acoplamiento dio
> «salen al juego: 0» para el golpe, y es falso (`brazo` se usa en la 3022,
> fuera del bloque). Tiene un fallo que no encontré, así que sus números de esa
> pasada no valen. La última medida en la que confío es la anterior: 19
> declarados, 13 saliendo, 1 reasignado.
>
> **Lo siguiente:** el equipo en las manos —`brazo`, `armaEnMano`, `brazal`,
> `escudoEnMano`, `muneco` y los tres catálogos—, que son siete de los trece
> que quedan saliendo. Y sólo entonces el golpe.


> **Y SU SEGUNDA PARTE: las cuentas, en un sitio.** Doce `let` sueltos
> —`bloqueos`, `muertes`, `impactos`, `parados`…— pasan a un `const cuentas`.
> Con eso el golpe cuerpo a cuerpo baja de **43 declarados / ~25 saliendo** a
> **19 / 13**, y de varios nombres reasignados cruzando la frontera a **uno**.
>
> **La medida corrigió mi suposición:** el estado sin dueño más grave NO son
> las cuentas, es el estado físico del jugador. `aguante` se escribe desde 6
> sitios a **2 143 líneas** de distancia; `corriendo`, 2 062. Las cuentas se
> hicieron primero porque **sólo las lee la sonda**: nadie decide nada
> mirándolas.
>
> **Y otra rotura que no puso nada rojo**, que duele más porque el control
> existía: quitar el `cuentas.muertes++` del mandoble deja `sonda:golpe` en
> 25 de 25. «A base de mandobles, el bicho MUERE» mira el estado del BICHO, y
> la cuenta sólo salía en **el texto del mensaje**. Un número que vive en la
> frase no lo comprueba nadie — y el único control que la miraba era un TECHO
> (`<= 1`), que el cero también cumple.
>
> **Lo siguiente, en este orden:** `aguante` (el último que cruza la frontera
> del golpe), luego **el equipo en las manos** —`brazo`, `armaEnMano`,
> `brazal`, `escudoEnMano`, `muneco` y los tres catálogos, que son siete de
> los trece que quedan saliendo—, y sólo entonces el golpe.
>
> Sigue rojo y sin arreglar el control inestable de `sonda:arco`, «y baja
> mientras vuela» (`caida < -15`: −3, −4, −12, −15): mezcla la gravedad con el
> desvío vertical aleatorio y derivarlo pide el ángulo de salida.


> **EL 55 ESTÁ HECHO: [doc/ARCO_55.md](doc/ARCO_55.md). El primer corte de
> `src/main.js`, y se eligió midiendo.** 4 356 → 4 138 líneas; el arco vive en
> `src/juego/arco.js`. De cuatro tramos candidatos, el arco es el único con
> costura limpia: 320 líneas y **dos** nombres cruzando al juego, contra los
> ~25 del golpe cuerpo a cuerpo y los 32 del montaje del mundo.
>
> **LO QUE APRENDIÓ LA MEDIDA, que vale para el próximo que reparta:** el
> primer analizador sólo miraba las declaraciones ANTERIORES al tramo y dio una
> lista de dependencias **corta y falsa**. `U` se declara en la 3512 y el arco
> la usa en la 3007 —funciona porque las flechas vuelan más tarde—, y
> `municionElegida` se reasignaba **a los dos lados de la frontera**: moverla
> habría dejado dos variables con el mismo nombre y ningún error. Hay que
> mirar los ámbitos con `rollup/parseAst`, no las líneas.
>
> **Las dependencias van como CAPTADORES, no por valor** (`brazo: () => brazo`).
> Rotura a propósito: por valor, la sonda revienta con `Cannot read properties
> of null`.
>
> **Y una rotura no puso nada rojo:** quitar el `muertes++` del arco. Nadie
> medía que una flecha que mata sume en la cuenta compartida. El primer control
> que escribí tampoco valía —«si el goblin murió, que suba», y el goblin no
> muere nunca con la potencia de un novato—, así que hay que dejarlo a un punto
> de vida Y con el desvío arreglado, o se muere de puntería. Ahora: 3 flechas,
> `muertes 0 → 1`.
>
> **Dos controles INESTABLES destapados**, los dos por un umbral escrito contra
> un mapa concreto. «La flecha vuela: `recorrido > 150`» fallaba 3 de cada 5
> (137, 139, 150): medía dónde está la pared, no la flecha. Ahora es una
> relación —`recorrido ≈ velocidad × vuelo`— y vale en cualquier sitio. **El de
> al lado, «y baja mientras vuela» (`caida < -15`: −3, −12, −15), sigue
> inestable y NO se ha arreglado**: mezcla gravedad con el desvío vertical
> aleatorio y pide el ángulo de salida.
>
> **Lo que NO se puede medir todavía:** elegir munición con el ciclador
> (`selectarrow`). El personaje de la sonda no lleva flechas, así que esa rama
> no se ejecuta jamás — rotura puesta, ninguna sonda se enteró.
>
> **Lo siguiente, y en este orden:** el golpe cuerpo a cuerpo NO es una costura
> (586 líneas, ~25 nombres fuera) y lo que pide antes es **el objeto de estado
> explícito** que el 28 ya nombró — `aguante`, `muertes`, `golpesDados`,
> `impactos`, `golpesRecibidos`, `ultimoGolpe` son estado compartido sin dueño.
> El montaje del mundo es aún peor (32 nombres). Y que el menú no cargue el
> mapa es este mismo reparto por el otro extremo: mover `montarMenu` por
> delante de `cargarNivel`.

> **UN `!` QUE FALTABA PARABA LA IA DEL JUEGO ENTERO.** El 52 metió la guarda
> que congela el mundo con el menú delante y la escribió `if (paseando)` en vez
> de `if (!paseando)`: la IA pensaba **sólo mientras el menú estaba abierto** y
> se paraba al empezar a jugar. Seis segundos al lado de un goblin que te VE
> —su control de línea de visión en verde— con **0 atacantes**. Arreglado:
> `0 → 3 atacantes, 0 → 9 golpes`, el goblin persigue corriendo, `sonda:mundo`
> **40/40**.
>
> **Por qué no lo cazó el 53, que iba justo de esto:** desde el 53 detrás del
> menú no hay un solo bicho montado, así que el lado equivocado de ese `if` no
> tenía a quién hacer pensar; y los controles del 53 miran que detrás del menú
> haya cero, que seguía siendo cierto. **Un bug en la intersección de dos
> cambios correctos no lo ve ninguno de los dos.** Lo vio la regla que no se
> siguió: al tocar algo, pasa las sondas vecinas. No hizo falta escribir ningún
> control nuevo — sólo pasar `sonda:mundo`, que ya existía.
> Corrección al lado en [doc/MENU_52.md](doc/MENU_52.md).
>
> **Y un rojo de `sonda:mapa` que era un número escrito, no un fallo:**
> «los bichos también, 31 de 69» contra un `> 50`. `solidosDeBichos` se salta a
> los que nacen dormidos y Gate City empieza con 38 durmiendo: **31 = 69 − 38**
> y era correcto. Ahora es una igualdad calculada con `bichosDormidos`, que
> además es más fuerte que el umbral.

> **EL 53 ESTÁ HECHO: [doc/ARRANQUE_53.md](doc/ARRANQUE_53.md). Detrás del
> menú había una partida, y ya no.** 69 NPC y 33 hostiles simulándose para
> enseñar una pantalla de menú; ahora **0 detrás del menú y 69 al pulsar
> «Start»**, con la escena dibujándose igual. `sonda:arranque36` **30/30**.
>
> **LA ROTURA QUE NO PUSO NADA ROJO, que es lo que hay que leer.** Se probó el
> orden que parece natural —cerrar el menú y poblar después— y la sonda dio
> **29 de 29**: los bichos acababan llegando, así que todo lo que se medía al
> final los veía. Lo que no veía nadie es que entre medias hay **5 610 ms de
> Gate City vacía** con el jugador ya dentro. El apartado 4 en su forma más
> pura: el mecanismo **sí** se dispara, sólo que tarde, y ningún control
> miraba el momento. El control que faltaba mira el **borde** —al cerrarse el
> menú tiene que haber pueblo— y con la rotura da 0 en vez de 69.
>
> **Y dos de mis tres cargos estaban mal, medidos de cerca:** `sesion: true`
> era `Boolean(S.sesion)`, el objeto, no una partida (`estado "fuera"`,
> `personaje null`); y el cuerpo del jugador existe pero **no se mueve**
> —0,000 m con la W puesta— que es justo lo que hace el motor
> (`sv_background_freeze`). Quitarlo habría sido menos fiel, no más.
>
> **Xash3D tiene mapas de fondo de serie** (`mainui/BaseMenu.cpp:547-581`) con
> su propio modo, así que esto no era una desviación. Corregido al lado en el
> 52, que decía que era de Source.
>
> **Lo siguiente, y la premisa acaba de cambiar:** el usuario quiere que el
> menú tenga **escena propia** (la torre del 52). Con eso el mapa del juego no
> tiene que cargarse al arrancar **en absoluto** —ni escena ni partida, que es
> `Host_Init` haciendo sólo `exec valve.rc`—. No se hizo aquí a propósito:
> hasta que la torre exista, quitar la carga deja el menú sin nada detrás.
> Lo del 53 es compatible y no hay que deshacerlo.

> **LO DE ANTES DEL 53, que quedó a medias y ya no:** Detrás del menú principal
> corría **Gate City entera**: 69
> NPC montados, 33 hostiles, **45 de ellos moviéndose en 4 s**, un cuerpo de
> jugador y `sesion: true`, antes de pulsar nada. Arrancar el juego era entrar
> a Gate City y el menú una tapa encima.
>
> **Y el motor tenía esto resuelto.** Xash3D trae mapas de fondo de serie:
> `UI_StartBackGroundMap()` (`mainui/BaseMenu.cpp:547-581`) manda
> `map_background`, y en ese modo al jugador le ponen `FL_GODMODE|FL_NOTARGET`
> —«don't attack player in background mode», `sv_client.c:1422-1423`— y lo
> congelan (`sv_background_freeze`, `sv_main.c:111`). **No es una desviación
> nuestra.** Lo nuestro es sólo que MSR no usa esa lista —por eso su menú cae a
> las 12 losetas TGA de `BackgroundLayout.txt`— y que nosotros ni montamos las
> entidades, porque sin jugador no hay a quién no atacar.
>
> **Hecho:** `src/play/fondomenu.js` con la política y las citas, los nombres
> en `src/play/mapa.js` (la excepción de la regla del 47), 13 pruebas, y
> **cuatro controles en `sonda:arranque36` que están rojos y deben estarlo**.
> Los dos positivos exigen una **diferencia** —`69 detrás → 69 jugando` no
> vale—, así que se pondrán verdes solos cuando el cambio entre.
>
> **Falta, y es un experimento entero (el 53):** partir en `src/main.js`
> «cargar la escena» de «montar la partida». El caso que se va a olvidar **no**
> es cambiar de mapa —ése ya recarga desde el 50— sino **«Start» con el mismo
> mapa que el fondo**, que hoy se resuelve solo porque ya está todo montado.

> **EL 51: [las conversaciones salen de main.js](doc/INTERACCIONES_51.md).**
> `src/juego/interacciones.js` administra los guiones de NPC, sus temporizadores,
> las opciones y su ejecución. El panel y la selección del objetivo siguen en
> `main.js`. No cambia las reglas ni añade autoridad al servidor remoto.
>
> **1344/1344 pruebas**. `misiones33` 23/23, `vgui29` 36/36 y nueva
> `sonda:interacciones51`: Edana por el menú, Hail por clic y respuesta del
> encargado del mercado. Las pruebas también detectan perder el estado del NPC,
> desconectar el reloj e ignorar la cancelación.
>
> Sigue pendiente dividir los demás bloques de `main.js` y comprobar misiones
> completas de Edana. Los avances del 50 descritos abajo se conservan.

> **EL 50 ESTÁ HECHO: [doc/EDANA_50.md](doc/EDANA_50.md). Se juegan DOS mapas,
> y se entra a los dos por el menú.** Edana está en `MAPAS_PORTADOS`: 33 087
> triángulos, **42 NPC montados de 42**, y se aparece a 0,00 m del punto que
> eligió el extractor. `npm run sonda:edana50`, **21/21**, y `npm test`
> **1340/1340**.
>
> **LA FILA «MAP» SE APUNTABA Y NO SE APLICABA.** Es el apartado 4 de CLAUDE.md
> por sexta vez: la ventana decía «edana» y el mundo traía **los 69 monstruos
> de Gate City**. Con un solo mapa portado el valor correcto y el valor de
> reposo eran la misma cadena, así que el control del 36 llevaba desde
> entonces comparando `"gatecity"` consigo mismo. **A esto romper el arreglo no
> lo caza: hace falta un segundo caso.** Está anotado en CLAUDE.md §4.
>
> El arreglo es el del motor: `map <levelname>` hace `CL_Disconnect()` y carga
> el nivel entero (`rehlds/engine/host_cmd.cpp:970`), o sea que «Start» con
> otro mapa **recarga** a `?map=<mapa>&menu=1`. Se pierde la pantalla completa
> al cambiar de mapa —el navegador sólo la da dentro del clic— y eso está
> declarado en la fila y avisado por consola.
>
> **Y `< Random Map >` sortea de verdad desde hoy**, que tumbó dos pruebas
> escritas a mano: una cuenta (`length === 1`) y otra que **habría fallado la
> mitad de las veces** exigiéndole un nombre a un sorteo.
>
> **Un fallo de interfaz que llevaba desde el 36 sin verse:** la Escape cerraba
> el desplegable arrancando el `<div>` sin decírselo al widget, así que **el
> siguiente clic en la fila se perdía**. No se veía porque ninguna sonda volvía
> a abrir la lista después de cerrarla.
>
> **Lo siguiente, y es lo que más se nota:** Edana se entra y se anda, pero
> **no se ha jugado**. Que sus 139 guiones hagan lo que dicen y que sus menús
> se puedan pulsar no lo mide nadie. Y sigue pendiente **partir `src/main.js`**,
> que es deuda desde el 28.

> **Y entre el 35 y el 50 hay quince experimentos**, que estaban sin apuntar
> aquí. Un documento que dice «dónde se quedó esto» que se queda quince atrás
> es el mismo problema que su sección «Lo de antes» describe. La lista, para
> que se encuentren:
>
> | | |
> | --- | --- |
> | 36 | por dónde se entra: el menú principal — [doc/ARRANQUE_36.md](doc/ARRANQUE_36.md) |
> | 39 | los bichos — [doc/BICHOS_39.md](doc/BICHOS_39.md) |
> | 40 | la carga — [doc/CARGA_40.md](doc/CARGA_40.md) |
> | 41 | la muerte — [doc/MUERTE_41.md](doc/MUERTE_41.md) |
> | 42 | la intro — [doc/INTRO_42.md](doc/INTRO_42.md) |
> | 43 | los guiones — [doc/GUIONES_43.md](doc/GUIONES_43.md) |
> | 44 | las tiendas — [doc/TIENDAS_44.md](doc/TIENDAS_44.md) |
> | 45 | las entidades — [doc/ENTIDADES_45.md](doc/ENTIDADES_45.md) |
> | 46 | los menús — [doc/MENUS_46.md](doc/MENUS_46.md) |
> | 47 | «gatecity» sale de las costuras del código — [doc/MAPA_47.md](doc/MAPA_47.md) |
> | 48 | un segundo mapa: Edana se abre — [doc/EDANA_48.md](doc/EDANA_48.md) |
> | 49 | el cableado del mapa — [doc/DISPARADORES_49.md](doc/DISPARADORES_49.md) |
> | — | los extractores por mapa — [doc/EXTRACTORES_MAPA.md](doc/EXTRACTORES_MAPA.md) |
> | 50 | Edana por la puerta — [doc/EDANA_50.md](doc/EDANA_50.md) |

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
