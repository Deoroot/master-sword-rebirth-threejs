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

## LO QUE ENCONTRÓ EL 06, y es el fallo más caro de los seis experimentos

**Gate City llevaba dos sesiones dibujándose SIN SU MAPA DE LUZ**, con las 397
comprobaciones en verde.

Desde Three.js r152 no hay un juego de UV reservado para el `lightMap`: cada
textura dice cuál usa en `texture.channel`, y **`channel` vale cero de fábrica**,
o sea `uv`. La geometría traía su `uv1` bien calculada al píxel y nadie la leía;
el atlas se muestreaba con las UV de la TEXTURA y `ClampToEdge` las pegaba al
borde. La corrección es `tex.channel = 1` en `cargarMapaDeLuz`.

**Un mapa de luz plano se parece muchísimo a un mapa de luz que funciona**, y por
eso aguantó: el mundo salía iluminado, de plano, sin charcos. Lo que estaba roto
era todo lo que se dedujo de ahí — las tres cifras que el 05 dejó «sin explicar»
eran esto, y quedan cerradas.

Contra la captura del juego, misma cámara y sin `glow` en ninguno:

| | juego | antes | **después** |
| --- | --- | --- | --- |
| luz p10 | 17,5 | 23,8 | **17,8** |
| luz mediana | 36,5 | 42,6 | **34,1** |
| saturación mediana | 0,506 | 0,423 | **0,542** |
| % oscuro (<32) | 43,3 % | 20,1 % | **45,5 %** |
| negro puro | — | 4,6 % | **0,0 %** |

### Y tres perillas del visor MENTÍAN, las tres arregladas

- `setLuz(false)` no dejaba el mundo a plena luz: lo dejaba **negro** al 97,7 %,
  porque `MeshLambertMaterial` sin lightMap y sin luces no emite nada. De ahí
  salía el «el mapa de luz aporta el 78,7 %». Ahora apagarlo es cambiar el atlas
  por uno **blanco de un píxel**, que sí es `r_fullbright`.
- `setTexturas(false)` devolvía un campo **plano de 136**. Hoy enseña los charcos
  de las lámparas, y es la confirmación más directa de que el arreglo es real.
- La sonda de teñir de rosa oscurecía la pantalla entera y no teñía nada: su
  lienzo iba en `SRGBColorSpace` y **le faltaba el `channel`**, o sea que la
  sonda escrita para cazar este fallo lo cometía por dentro. Tercera vez.

### EL JUEZ que impide que vuelva a pasar

```
npm run gatecity:juez        predice cada pixel DESDE EL ARCHIVO y lo compara
                             con el framebuffer, con su control:
                                 con uv1  ->  razon 1,002, el 91,1 % dentro de ±20 %
                                 con uv   ->  razon 0,806, el 46,6 %
                             y con el fallo puesto a mano los dos se cambian de sitio
npm run gatecity:quecara     que hay en ese pixel: grupo, distancia, uv1, texel
npm run gatecity:mirar       una captura desde donde diga el HUD, con perillas
```

**La regla nueva: un dato bien calculado que nadie lee no da error.** Las 397
comprobaciones medían que los datos estuvieran bien; ninguna medía que llegaran a
la pantalla.

## LO DEMÁS QUE CIERRA EL 06

- **`r_lighting_modulate` NO HACE NADA.** Estaba puesta como factor 0,6 sobre los
  101 adornos «porque lo dice el `config.cfg`», y en este motor está registrada
  como *«compatibility cvar, does nothing»* (`engine/client/ref_common.c:745`).
  El camino real de `R_StudioSetupLighting` es **una intensidad escalar por un
  color normalizado**, no una cuenta canal a canal — y la cuenta por canal
  desatura todos los muebles del mapa un 37 %.
- **Texturas de DETALLE puestas.** Lector de `.tga` nuevo
  ([src/bsp/tga.js](src/bsp/tga.js)) con oráculo de bytes: los 126 `.tga` de
  `gfx/detail/` se leen hasta el último. 58 de 80 texturas emparejadas, 14 `.tga`.
  Segunda pasada con `CustomBlending(DstColorFactor, SrcColorFactor)` —el
  `2·src·dst` del motor— **sin shader**. Conservan la mediana y suben el
  contraste local de 6,3 a 6,9 (el juego, 8,9).
- **Cielo `nature1` leído**, con la orientación sacada de las tres tablas del
  motor y no adivinada. `boveda` pasa del 52,9 % de negro al 5,3 %.
- **Parpadeo MEDIDO**, que era lo que el encargo pedía antes de decidir: el
  estilo 1 toca el **48,1 %** de la superficie con luz y el 6 el **15,1 %**;
  **2 779 caras (18,2 %) tienen como único estilo uno que parpadea**; y el
  recorrido en pantalla es de **28 bytes sobre 255, un 27 % del valor medio**,
  diez veces por segundo y sin interpolar. **Vale la pena.**
- **409 comprobaciones, las 409 en verde** (397 y 12 nuevas de `.tga` y de la luz
  de los adornos, con sus controles).

## LO QUE QUEDA ABIERTO, por orden

1. ~~**EL PARPADEO**~~ — **HECHO**, ver [PARPADEO_08.md](doc/PARPADEO_08.md). Y su
   control salió como se pidió: con los tres atlas al valor medio la pantalla
   sale IDÉNTICA, luxel a luxel, 0 de 462 915.
2. **Una captura del juego con el `glow` APAGADO, del mismo sitio y la misma
   dirección.** Cinco minutos de quien lo juega y vale más que las cuatro
   hipótesis que quedan sobre el contraste local. La de hoy
   (`build/referencia/juego-calle2.png`) lleva el hechizo puesto — lo dice su
   propio registro, «Glow: Maximum charge reached».
3. **Las `dlight` de las antorchas** (`R_AddDynamicLights`). Con el parpadeo
   hecho, el mecanismo es el mismo.
4. **La propuesta de [PROPUESTA_06.md](doc/PROPUESTA_06.md), que hay que DECIDIR**:
   si esto se separa de `Mydra Web Lab`, si va antes la fidelidad o la
   jugabilidad, y si lo siguiente grande es la animación de `.mdl` o un segundo
   mapa con su transición.
5. **Lo que el 06 no tocó y sigue igual**: los adornos sin colisión, los `.mdl`
   sin animación, sin PVS (que no hace falta: 0,94 ms por fotograma sin GPU), y
   los 2 051 m² de caras sin mapa de luz que van negras **como el motor**
   (`R_BuildLightMap` deja el bloque a cero cuando `styles[0] >= 255`, y 996 de
   las 1 133 son de ese caso). Rehecho el A/B con el `channel` ya arreglado:
   mandarlas al luxel blanco cambia **6 píxeles de 614 400** en la vista de la
   calle, o sea que ahí no son lo que se ve negro. Falta medirlo en las cuevas,
   que es donde están los 1 998 m² de `rock_07`.

---

> El encargo del 06 —[PROMPT_06.md](doc/PROMPT_06.md)— está hecho: partes 1, 2, 3 y
> la medida de la 4, más la propuesta. Lo que sigue debajo es el estado del 05,
> que queda como referencia; **sus cifras de iluminación están corregidas
> arriba**.

Estado al cerrar: **397 comprobaciones, las 397 en verde** (330 de antes y 67 de
los lectores de `.bsp`, `.spr` y `.mdl` y de la gamma del motor). Corinth y el jharro siguen en pie y se andan en
`?map=corinth` y `?map=jharro`. Y lo nuevo es que **`?map=gatecity` también se
abre, se ve y se anda**: el experimento 05 reprodujo `gatecity.bsp` con Three.js.

## LA PREGUNTA DEL 05 ESTÁ CONTESTADA: [CAPACIDAD_05.md](doc/CAPACIDAD_05.md)

> ¿Es capaz nuestra pila —Three.js, Rapier, Node— de poner en pantalla lo que ese
> `.bsp` pone en pantalla?

**Sí, y sobra margen.** Con `MeshBasicMaterial` de fábrica, `map`, `lightMap` y
`uv1`. **No hizo falta escribir un shader, ni un material propio, ni un paso de
render.** 41 650 triángulos y 92 llamadas de dibujo en **0,94 ms por fotograma con
renderizado por software, sin GPU** — y dibujando el mapa entero, sin usar los
114 184 bytes de PVS que GoldSrc sí usa.

**O sea que al jharro le falta trabajo, no herramientas.** Eso manda la siguiente
sesión, y es la parte 7 del prompt 05.

```
npm run gatecity                 # extrae el .bsp a build/gatecity/ y mide
npm run gatecity -- --gamma 2.8  # con otra rampa de gamma
npm run gatecity:shot            # 8 fotogramas medidos + la prueba de marcha
npm run dev                      # y a andarlo:  ?map=gatecity
                                 #   T = ir a uno de los 8 pueblos
                                 #   R = volver a la llegada
```

**Y ojo con la llegada: está a 47 m del pueblo más cercano, y eso es diseño del
mapa.** Gate City pone al jugador en una cueva a oscuras y el pueblo no empieza
hasta los 47 m — es la misma cifra que el jharro copió («de la entrada al pueblo,
46 m»). Quien lo anduvo dijo «el lugar de inicio está fuera de los interiores» y
tenía razón; lo que faltaba era poder IR a mirarlos, y para eso está la tecla T.

### Lo reproducido, con oráculo

Es la primera vez en este experimento que las sondas tienen un juez que no
escribimos nosotros: números escritos DENTRO del archivo.

| | |
| --- | --- |
| Geometría | **41 650 triángulos** de 15 660 caras, **92 grupos por textura** |
| Superficie del mundo | **32 887 m²**, la misma cifra que `bsp.mjs` ya medía |
| Texturas | **92 de 92** decodificadas, 8 bits con paleta al final |
| Variedad | **80 en superficie, 10 cubren el 80 %**, la mayor el 30 % |
| Área de cara | mediana **0,47 m²**, la mayor **427 m²** |
| Mapa de luz | **2 126 793 bytes, al byte exacto**; 462 915 luxels |
| Atlas | 1 024 × 1 024, 54 % ocupado; histograma con 7 cubetas vivas |
| Casos especiales | reja calada, dos aguas que corren, cielo plano |
| Colisión | 39 247 triángulos; se anda, 12,7 m en 12 s desde la llegada |
| Antorchas | **57 carteles** de `Fire1/Fire2.spr`, 23 cuadros, mezcla aditiva |
| Modos de dibujo | los 5 del formato, en 100 grupos: los rayos se atraviesan |
| Farol contra roca | `pi_lantern` a **181/255** de mapa de luz, `rock_07` a **17** |
| Bobinado | los 41 650 triángulos miran hacia su normal, con control en pantalla |
| Llegada | `ms_player_begin`, con los pies en el suelo que midió el árbol BSP |
| Interiores | los 8 `msarea_town`, con un sitio donde estar: **tecla T en el visor** |

### Los huecos, y CUATRO de los cinco son contenido que no está en el archivo

- **101 `env_model` → 17 `.mdl`** y **58 `env_sprite` → 3 `.spr`**, ninguno dentro
  del `.bsp`. Es el hueco grande y es la mitad de lo que se ve a la altura de los
  ojos. El `.spr` es barato —el mismo trabajo que `miptex.js` ya hace, y 55 de 58
  son el mismo fuego—; el `.mdl` es el trabajo de verdad y es acotado: para un
  adorno no hace falta animación.
- **El cielo: `skyname nature1`**, seis `.tga` de `gfx/env/` que tampoco están. Se
  pinta del color que declara `light_environment`, que sí está. Descartarlo deja
  agujeros negros de media pantalla, **y un agujero negro se parece a una sombra**.
- **Los estilos de luz no parpadean.** Se suman y se hornean. Es el único hueco que
  sí pediría material propio: un atlas por estilo.
- **343 m² con modos de render aditivo y alfa** dibujados opacos: los resplandores
  de los faroles y los cristales. Poco código y ningún concepto nuevo.
- **Sin PVS.** No es calidad, es margen sin coger.

### Y el brillo NO es un hueco de capacidad

Reproducido al byte, Gate City sale muy oscuro: la media del atlas es 30/255. Está
bien leído. La diferencia es que **GoldSrc sube una rampa de gamma por hardware**
(`cvar gamma`, 2,5 por defecto), que es un ajuste de pantalla fuera del render. Se
aplica al hornear, en el orden del motor —overbright ×2 y DESPUÉS la rampa— y el
valor sale de un barrido impreso, no de la vista: **2,2**, que es donde el
contraste sigue en su máximo con la mediana más alta. A 3,4 se lee mejor la
sillería y se pierde el degradado de luz sobre la roca, que es el aviso del jharro
—*arreglar la oscuridad de golpe la lava*— con otra ropa.

## LA COMPARACIÓN AL LADO, que es la que manda la siguiente sesión

| | el jharro | Gate City |
| --- | --- | --- |
| Vistas por encima del 85 % de pantalla visible | **6 de 9** | **0 de 8** |
| Brillo mediano, recorrido | 2 – 135 | 10 – 33 |
| Materiales en el mundo | **1** | **92** |
| Mapa de luz | 0 | 2,03 MB |
| Qué cambia al apagar la luz horneada | — no hay | **el 12 – 86 % de la pantalla** |

El jharro es más claro y más parejo. Gate City tiene **contraste**: sitios claros y
sitios negros, y saber en cuál estás es la mitad de lo que hace legible una cueva.
«Todo se ve casi 100 % igual» no era una queja de resolución: era la descripción
exacta de un mundo con un material y 58 luces sin sombra.

## LA ILUMINACIÓN YA NO SE CALIBRA A OJO: sale del motor

Lo más importante que ha pasado, y lo que hay que no volver a perder.

La iluminación de Gate City se ajustó **tres veces contra mi propio criterio** y
las tres estaba mal. Luego aparecieron tres cosas, y cada una vale más que la
anterior:

1. **Una captura del juego original del mismo sitio.** Convierte «se ve distinto»
   en un histograma contra otro — `tools/comparar.mjs`.
2. **La instalación del juego con su `config.cfg`.** `gl_overbright "0"`,
   `gamma "3"`, `brightness "2"`, `r_lighting_modulate "0.6"`,
   `gl_texturemode "GL_LINEAR_MIPMAP_LINEAR"`, `gl_anisotropy "8"`, y
   `video.cfg` con **1920×1080**. Las dos instalaciones —GoldSrc y el port a
   Xash3D— dicen lo mismo.
3. **El código fuente del motor**, en `MSC/xash3d-fwgs-sdk/`.

`src/bsp/gamma.js` es ahora `BuildGammaTable()` traducido línea a línea, y
`pintarAtlas()` es `R_BuildLightMap()`. **No queda ninguna constante de
iluminación elegida por nosotros.**

Lo que eso tiró:

- **`OVERBRIGHT = 2`.** El juego lo lleva apagado: un factor de dos sobre el mapa
  entero. Y esto es lo que hay que recordar: **no hay forma de deducir
  `gl_overbright 0` leyendo un `.bsp`.**
- **Las rampas de exponente único.** El motor usa una curva con un codo, que es
  lo que levanta la sombra sin lavar el resto.
- **Los 320 px de resolución interna.** Es estilo de Corinth y del jharro; aquí
  era reproducir el mapa a un sexto. Ahora Gate City dibuja nativo y los demás
  siguen a 320.

Veredicto contra la captura, sin el hechizo `glow` (su captura tampoco lo lleva):

| | juego | antes | ahora |
| --- | --- | --- | --- |
| luz p10 | 19,6 | 15,7 | **19,6** |
| luz mediana | 32,3 | 80,5 | **38,7** |
| saturación mediana | 0,590 | 0,352 | **0,510** |

**La regla que se lleva de aquí:** cuando exista el original, leerlo. Un
razonamiento sobre el formato es una hipótesis; un `config.cfg` es un hecho.

## LO QUE FALTA PARA CERRAR LA ILUMINACIÓN, con sus números

Tres cosas, y las tres medidas:

1. **Somos un 25 % más claros y bastante menos saturados.** Mediana 40–43 contra
   32,3; saturación 0,38–0,42 contra 0,590. **No es el encuadre**: girando desde
   el mismo punto la mediana sólo va de 38 a 43. Es real y no tengo la causa.
2. **La causa candidata: 61 texturas de DETALLE sin dibujar.**
   `maps/gatecity_detail.txt` tiene 61 líneas —61 de las 80 texturas del mundo— y
   `r_detailtextures "1"`. Se mezclan con `RGB_SCALE 2`, o sea que conservan la
   media y añaden contraste. Se puede hacer con `CustomBlending(DstColorFactor,
   SrcColorFactor)`, que da exactamente `2·src·dst`, sin shader.
3. **El 2,4 % del mapa tiene el mapa de luz a cero exacto**, y el motor también lo
   pinta negro. Eso no es un fallo nuestro, pero conviene tenerlo escrito.

Y una que sí se arregló y merece recordarse: **el sRGB aplastaba las sombras por
un factor de tres.** El motor multiplica textura por mapa de luz en 8 bits y en
espacio de pantalla; declarando las dos texturas sRGB, Three.js pasaba a lineal,
multiplicaba y recodificaba — y la identidad que lo justificaba **sólo vale para
una potencia pura**, no para sRGB, que tiene un tramo recto cerca del cero.

## LOS ADORNOS ESTÁN: 101 `env_model` de 17 `.mdl`


El último hueco grande del experimento, y ya no lo es. `src/bsp/mdl.js` lee los 17
ficheros que Gate City coloca, **20 417 triángulos en 37 grupos**, con dos
oráculos dentro del archivo: `length` de la cabecera contra el tamaño del fichero,
y los comandos de triángulo contra el `numtris` de cada malla.

Tres cosas que no son obvias y que el informe explica:

1. **Un `.mdl` no lleva mapa de luz.** El motor lo ilumina con `R_LightPoint`: un
   solo luxel leído del suelo que tiene debajo. Se reproduce reservando un luxel
   por adorno en el atlas — el material sigue siendo el mismo de fábrica. La luz
   de los 101 va de **12 a 196 sobre 255**, que es lo que impide que los muebles
   parezcan pegatinas.
2. **GoldSrc dibuja los modelos con `glCullFace(GL_FRONT)`,** al revés que el
   mundo. Sin invertir, los diecisiete daban el **100 %** de sus triángulos en
   contra de su normal, y en pantalla eso no es un modelo invisible: es un modelo
   **apolillado**, la silueta entera llena de agujeros.
3. **El bobinado se comprueba sin dibujar nada.** El archivo trae una normal por
   vértice, así que el giro correcto es el que concuerda con ella. Eso es un
   oráculo, y por eso este fallo costó media hora en vez de la ronda entera que
   costó el mismo fallo en el `.bsp`.

## LO SIGUIENTE, y ya no es una pregunta abierta

Los tres primeros son la parte 7 del prompt 05 y están **demostrados funcionando**
en `src/bsp/`: lo que falta es aplicarlos a nuestra geometría.

1. **De 1 textura a 10, con grupos por textura.** Objetivo medido y ahora fijado en
   una prueba: diez texturas para el 80 % de la superficie y la mayor por debajo
   del 30 %. Hoy el jharro tiene una al 100 %, y encima es SILLERÍA donde la medida
   pide roca cruda y tierra. **Se reparten por REGLA**, no al azar: la roca según la
   planta y según si la cara es suelo, bóveda o pared; tierra en los pasillos;
   adoquín en los suelos del pueblo.
2. **Hornear la luz.** Reutilizable tal cual de `src/bsp/luz.js`: el empaquetado
   del atlas, el segundo juego de UV, el «+1» del parche, el medio luxel y el
   material. Lo único que cambia es de dónde salen los luxels — oclusión por rayos
   contra nuestra malla, y Rapier ya lanza rayos.
3. **Subdividir las caras** para bajar la mediana de 1,10 m² hacia los 0,47
   medidos, con el `fbm` de `src/util/noise.js` y **compartiendo los valores de
   esquina**. Hacer esto ANTES del juez de marcha es un error: el desplazamiento
   mueve toda la geometría.
4. **Y una que no estaba en la lista, y sale de MIRAR los fotogramas: dejar sitios
   negros a propósito.** Gate City tiene su peor rincón a **43,7 m** de su farol y
   su punto de llegada es una cueva a oscuras. El jharro puso el suyo a 18,7 m
   «para ser más regular que la referencia», y visto al lado eso es parte de por
   qué se ve todo igual. **La irregularidad de la referencia era el diseño.**

Después, y sin cambios respecto de antes: los adornos, el juez de marcha del
jharro, el pozo negro, los bichos. La lista entera sigue más abajo.

## EL FALLO QUE ENCONTRÓ QUIEN LO ANDUVO, y es el aviso más caro de todos

**GoldSrc guarda la vuelta de una cara en sentido HORARIO visto desde delante;
Three.js llama frontal al antihorario.** Emitidas tal cual, las **12 680 caras del
mundo salen al revés**: cada pared se ve sólo desde detrás, así que se atraviesan
las cercanas y se ven los reversos de las lejanas.

**Y eso no se ve como geometría al revés: se ve como OSCURIDAD.** La vista de la
llegada daba el 0,3 % de pantalla visible y cuatro manchas flotando en negro, y lo
di por bueno con un argumento correcto —Gate City es una cueva, su rincón más
oscuro está a 43,7 m de su farol, se entra por la cueva a 47 m del pueblo— y lo
escribí en el informe. **Una explicación buena para el síntoma equivocado es más
peligrosa que no tener ninguna.**

Lo encontró quien lo anduvo: «el lugar de inicio está fuera de los interiores» y
luego **«muchas cosas parecen ser invisibles»**. En su captura el suelo no estaba y
las casas flotaban.

Y había una cifra mía que lo gritaba, impresa ocho veces en la consola: **apagar el
mapa de luz cambiaba el 3,1 % de la pantalla.** Sin mapa de luz todo se dibuja a
plena luz, así que una vista llena tiene que cambiar entera. Ahora es el 78,7 % en
la llegada y el 99 % en las salas cerradas.

Tiene dos jueces, los dos con oráculo:

- **analítico** — los 41 650 triángulos emitidos tienen que mirar hacia donde dice
  su normal, y el control es que leídas tal cual del archivo las 12 680 van al
  revés. Las dos cosas están fijadas en pruebas.
- **en pantalla** — desde dentro de una sala, la cara frontal tapa el **99,4 %** y
  la trasera el **31,8 %**. Con el bobinado invertido a mano los dos números se
  cambian de sitio exactos.

Quedan 147 triángulos al revés de 41 650 y los 147 son astillas: el mayor mide
0,135 cm² y entre todos suman 0,0002 m². Salen de vértices casi alineados —un
`.bsp` parte las caras— y no dibujan ni un píxel.

## LO OSCURO ES EL MAPA, y lo blanco era mío

Quien lo anduvo 850 m dijo dos cosas más, y son distintas:

> «veo que varias texturas o cosas son completamente negras o pitch black»
>
> «este mapa originalmente era muy oscuro, sobre todo en las cavernas, y los
> jugadores sólo podían guiarse con un hechizo llamado glow»

**Lo mío: las caras sin mapa de luz las pintaba BLANCAS.** Son 1 133 caras y
6 249 m², el **17,9 % de la superficie**: 3 822 m² de cielo (que van con su material
plano), 280 de agua (que GoldSrc dibuja a plena luz, sin mapa de luz) y **2 147 de
lo demás, de los que 2 051 están A LA VISTA** — comprobado cara por cara con el
árbol BSP. El motor las pinta NEGRAS: en `R_BuildLightMap`, sin muestras el bloque
de luz se queda a cero. Yo elegí blanco razonando que negro «las haría
desaparecer», que suena sensato y es lo contrario de lo que hace el motor. Eran las
escaleras blancas de su captura.

**Y lo del mapa: tiene razón, y está medido.** El 63 % de la superficie iluminada
está por debajo de **32 sobre 255**, y ni un metro cuadrado pasa de 224:

```
   0-32   17 969 m2   62,7 %  #########################
  32-64    9 399 m2   32,8 %  #############
  64-96      957 m2    3,3 %  #
   > 96      316 m2    1,1 %
```

## LOS RAYOS DE LUZ ERAN UN BLOQUE MACIZO

Lo encontró comparando capturas del juego con las nuestras: «los rayos de luz en el
templo del juego son transparentes pero veo que en el demo es sólido».

Un rayo de luz en GoldSrc es un **`func_illusionary` con `rendermode 5`**, o sea
ADITIVO. Y el dato estaba medido e impreso desde la primera pasada sin que yo lo
usara: **31 entidades y 208 m²** dibujadas opacas. Lo peor es por qué aguantó tantas
rondas: **un bloque amarillo macizo debajo de un tragaluz parece deliberado.**

Los cinco modos del formato, ahora todos puestos:

| modo | qué es | entidades | superficie | cómo se dibuja |
| --- | --- | --- | --- | --- |
| 0 | normal | 227 | 1 661 m² | opaco, con mapa de luz |
| **5** | **aditivo** | **31** | **208 m²** | `AdditiveBlending`, sin escribir profundidad |
| 2 | textura con alfa | 50 | 120 m² | `renderamt/255`. **Son los faroles de pared** |
| 1 | color plano | 6 | 10 m² | el `rendercolor`, que aquí SÍ se usa |
| 4 | recortado | 2 | 5 m² | `alphaTest` |

La clave de grupo de la malla pasa a ser **textura + modo + `renderamt`**: sin eso un
rayo aditivo y una pared opaca con la misma textura comparten material.

### Y eso destapó otro: los faroles salían NEGROS

Three.js ordena OBJETOS —opaco primero, transparente después— pero **dentro de un
mismo `Mesh` los grupos van en orden de índice**. Los faroles son modo 2 y no
escriben profundidad; su grupo caía antes que la pared opaca de detrás, **y la pared
los pintaba por encima**. Se arregla partiendo la malla en dos, opaca y translúcida,
compartiendo atributos por referencia — que es lo que hace el motor con su pasada.

## LA GAMMA: se tiró y volvió, y lo que la trajo fue medirla

Una ronda la puse, miré un fotograma, lo vi lavado y la tiré. El juicio fue **a ojo,
sobre una vista, y con el glow encendido** — que es una luz puntual a dos metros y
quema lo cercano mire donde mire.

Medida, dice otra cosa: con la rampa sólo en el mapa de luz, **el 79,7 % de la
superficie iluminada de Gate City está por debajo de 32 sobre 255 en pantalla y el
15,1 % por debajo de 8**. Cuatro quintos del mapa en negro.

Y una potencia con exponente menor que uno **comprime razones**, así que la rampa se
estaba comiendo el charco de las lámparas:

| | pared a 32–96 u de una lámpara | pared a más de 384 u | razón |
| --- | --- | --- | --- |
| en el lump | 33 | 14 | **2,40×** |
| en pantalla, rampa 2,8 sólo en la luz | | | **1,35×** |

Eso es lo que hay detrás de «las lámparas no están emitiendo luz». Emiten
—`info_texlights` declara `pi_lantern 255 255 128 100`—; lo que pasaba es que la
rampa aplastaba su charco. Las antorchas se salvaban porque su llama es un cartel
aditivo que no pasa por ninguna rampa.

El motor reparte el levantamiento entre los dos términos, `ramp(t·l) = ramp(t)·ramp(l)`.
Repartiéndolo se llega al mismo brillo con menos compresión:

| g_luz | g_tex | pantalla | charco | rincón <32 | negro <8 | |
| --- | --- | --- | --- | --- | --- | --- |
| 2,8 | 1,0 | 17 | 1,35× | 79,7 % | 15,1 % | antes |
| 2,8 | 2,8 | 67 | 1,35× | 9,6 % | 5,4 % | lavado |
| **1,8** | **2,8** | **48** | **1,60×** | **23,6 %** | **6,1 %** | **hoy** |

**La lección, que vale para cualquier ajuste y no sólo para éste: una sola vara
elige un extremo.** Medido sólo el charco, manda subir la rampa hasta el tope;
medido sólo el rincón oscuro, manda no tocar nada. El valor sale de pedirle las dos
cosas a la vez.

`npm run gatecity -- --texgamma 1` devuelve el fotograma de antes.

## LAS LÁMPARAS NO TENÍAN HALO: 23 `env_glow`, y el sprite es del juego base

El mapa pone 23 `env_glow` clavadas en las lámparas —`rendermode 5`, aditivo,
`rendercolor 255 255 128`— y no se dibujaban: apuntan a `sprites/glow01.spr`, que
**no está en `../MSC/`** porque es un fichero del Half-Life base que el mod hereda
de la instalación del juego. Las antorchas se salvaron por lo contrario: su
`Fire1.spr` sí está.

Como no hay nada que leer, el halo es **generado**: un degradado radial `(1−r)²` en
`src/bsp/halo.js`. No reproduce el dibujo de Valve, reproduce su papel — el mismo
trato que le toca al cielo `nature1`. Escrito en `build/gatecity/PROCEDENCIA.md`.

De paso, el tinte: `rendercolor` se ignoraba. En las antorchas viene a `"0 0 0"`,
que **no significa negro sino «sin tinte»**, pero en las `env_glow` viene a
`"255 255 128"` y ése sí va. Carteles: de 57 a **80**.

## TRES SONDAS ROTAS EN UNA RONDA, y el patrón se repite

Las tres del mismo tipo: **la sonda estaba bien puesta y medía la cosa
equivocada**, y las tres dieron un número redondo y convincente.

1. **`contenidoEn` devuelve un objeto, no un entero.** Comparado con
   `CONTENIDO.solido` nunca es igual, así que la sonda decía «728 caras negras dan
   a vacío, 0 dan a sólido». Un cien por cien perfecto.
2. **Una sonda que teñía de rosa el luxel negro** para delatar las caras sin mapa
   de luz: su control positivo salió 0,00 %. El rosa se multiplica por la textura,
   que tiene la mediana en 41 sobre 255, así que llegaba a la pantalla como
   (51, 0, 40) y no pasaba el umbral de «rosa brillante». **Sin el control
   positivo, sus dos ceros habrían pasado por respuesta.**
3. **El control por captura de `--sinluz`** daba el mismo número con la perilla y
   sin ella, hasta en el recuento de colores. Se quitó y el oráculo pasó a las
   pruebas: contar los vértices que apuntan a cada luxel reservado, en las dos
   direcciones.

Y el aviso que sacan las tres juntas: **un cero sin control positivo no es un
resultado.** Dos de las tres decían «aquí no hay nada» y lo que pasaba es que no
sabían mirar.

## ¿HACE FALTA UN SISTEMA DE LUZ NUESTRO? No

Lo preguntó quien lo jugó, y trajo **capturas del juego original** para verlo.

**El sistema de luz de GoldSrc ES el mapa de luz, y ya distingue el farol de la
piedra por un factor de diez:** `pi_lantern` —la única textura que
`info_texlights` declara emisiva— tiene el mapa de luz a **181 sobre 255** de
mediana, y `rock_07` a **17**. Está en el archivo, no hay que calcularlo. Y sus
capturas confirman lo otro: **en el juego el túnel de al lado también está pitch
black.** Que la luz no llegue es lo que el compilador horneó.

Lo que faltaba eran tres cosas, y ninguna es un sistema de iluminación:

1. **La llama.** `Fire1.spr` puesto **55 veces**, y no lo dibujábamos. El charco de
   luz en la roca ya estaba; la FUENTE era invisible. Lector nuevo en
   [src/bsp/sprite.js](src/bsp/sprite.js) —23 cuadros de 48×64, mezcla aditiva,
   orientación `paralelo`— y **57 antorchas** ardiendo, con cuatro desfases para que
   no arda el pueblo entero al mismo compás.
2. **La rampa de gamma, que estaba baja.** De 2,2 a **2,8**: un 5 % de contraste por
   una vista que pasa del **0,3 % al 41,3 %** de pantalla visible. El número salió
   de comparar con sus capturas, no de un umbral inventado — y no se subió a 3,4
   porque ahí el contraste cae a 103 y el degradado de luz sobre la roca se aplana,
   que es el aviso del jharro otra vez.
3. **El glow**, que es mecánica de juego. Abajo.

Y una cuarta que sí pediría salirse de los materiales de fábrica: **el parpadeo**.
Los estilos 1 y 6 son los 9 405 bloques que hoy se hornean a valor pleno; hacen
falta un atlas por estilo y mezclarlos por fotograma.

### Y 19 de los 21 ficheros de adornos SÍ están

No están dentro del `.bsp`, pero sí **al lado**, en `../MSC/assets/msr/`. O sea que
el hueco grande no es un muro: es un lector por escribir, con la misma regla que el
mapa —se escribe el lector, lo extraído va a `build/`, nada pasa a `public/`—.

| fichero | veces | estado |
| --- | --- | --- |
| `sprites/Fire1.spr` | **55** | **leído y dibujado** |
| `sprites/Fire2.spr` | 2 | **leído y dibujado** |
| `sprites/glow01.spr` | 23 | no está en `../MSC/` |
| `sprites/b-tele1.spr` | 1 | no está en `../MSC/` |
| `models/misc/chair.mdl` | 27 | está, sin lector |
| `models/weapons/swords/p_swords.mdl` | 24 | está, sin lector |
| `models/props/wood_barrel1.mdl` | 14 | está, sin lector |
| y 12 `.mdl` más | 36 | están, sin lector |

**El `.mdl` es lo único grande que queda, y es LO SIGUIENTE.** 17 ficheros, 101
colocaciones, y para un adorno no hace falta animación: la cabeza del formato, los
`bodyparts`, la malla con tiras y abanicos, y las texturas con su paleta — que es
otra vez el trabajo de `miptex.js`.

## EL GLOW, y por qué amplía la respuesta en vez de relajarla

El visor lo lleva, se apaga con la **L**, y sus números salen del archivo: el color
de `pi_lantern` —`"255 255 128 100"` en `info_texlights`— y 6 m de alcance, entre la
mediana medida del suelo a su farol (3,8 m) y el p90 (10,6). Radio al doble y caída
lineal, que es la lección del jharro.

Costó pasar el mundo de `MeshBasicMaterial` a **`MeshLambertMaterial`**, y eso no
relaja nada: sigue siendo de fábrica, multiplica el mapa de luz igual —el factor π
vive en `BRDF_Lambert`— y ADEMÁS suma las luces de la escena, que es justo lo que
hace el motor con sus luces dinámicas. **La pila hace las dos cosas a la vez con lo
que trae puesto.**

| | de media, sobre las 8 vistas |
| --- | --- |
| Se ve, con el glow | **41,6 % de la pantalla** |
| Se ve, sin él — el mapa como lo horneó el compilador | **18,3 %** |

## Los avisos NUEVOS del `.bsp`, que son los caros

Los cuatro primeros dan resultados **casi correctos** y ninguno se ve en una
captura.

- **La proyección de textura se acumula en `float` de 32 bits, no en doble.** El
  compilador usa un `vec_t`, que en ZHLT es `float`. En doble, una coordenada que
  vale −3584 sale como −3583,999999999999 y `ceil(−223,99999…/16)` da **un luxel de
  más**: pasaba en **951 de 14 527 caras**. `Math.fround`, y la suma pasa de sobrar
  29 577 bytes a cuadrar exacta.
- **«Tiene mapa de luz» son DOS condiciones, no una.** Además de las 137 con
  `lightofs = −1` hay **996 caras con `lightofs` válido y los cuatro `styles` a
  255**. Leerlas pinta cada una con la luz de una vecina cualquiera.
- **Hay que SUMAR los estilos.** «El bloque 0 es el estilo 0» es falso: 2 795 caras
  tienen `styles[0] = 1` y hay 9 405 bloques más. Leyendo sólo el primero se tira
  la luz de todas las antorchas del mapa.
- **El punto de llegada de este mapa es `ms_player_begin`, y escribí que no
  existía.** Filtré `ms_player_begin|ms_player_spawn` juntos, imprimí los cuatro
  primeros, vi cuatro `ms_player_spawn` y lo di por ausente. Es la duodécima de
  doce, en (−18,1, −87,0, −8,4) m: **exactamente las coordenadas que el encargo
  daba por medidas**. Los once `ms_player_spawn` son REAPARICIONES, tres de ellas a
  65 m de las otras. Y su `origin` está **54 unidades sobre el suelo**, ni las 18 ni
  las 24 de las convenciones: se le pregunta al árbol BSP, que es lo que hace ahora
  `src/bsp/arbol.js`.
- **`castRay` desde dentro del propio jugador devuelve distancia CERO.** Con
  `solid=true` las 24 direcciones empataban a cero y se quedaba con la primera: yaw
  0. No dio error, **dio el valor por defecto con pinta de calculado**, y la prueba
  de marcha decía 1,6 m en 12 s con el mundo perfectamente andable. Se calcula
  antes de crear la cápsula.
- **Una cara sin mapa de luz se pinta NEGRA, no blanca.** `R_BuildLightMap` deja el
  bloque a cero cuando no hay muestras. Y el agua y el cielo no pasan por el mapa de
  luz en absoluto: se dibujan a plena luz de su textura, cada uno en su pasada.
- **La paleta de un `.spr` va DELANTE de los cuadros; la de un `miptex`, DETRÁS de
  los cuatro mips.** Son dos formatos parecidos con la paleta en sitios distintos, y
  mezclarlos da una imagen de un solo color. El control de las dos es el mismo:
  que el recorrido acabe en el último byte del archivo.
- **La paleta va DESPUÉS de los cuatro mips, con su contador de 2 bytes.** El
  control de que el desplazamiento está bien es que las 92 declaren 256 colores.
- **El espaciado de luxel es 16 y el parche lleva un «+1»**, porque los luxels son
  las LÍNEAS de la rejilla y no las casillas: una cara de ocho unidades pide DOS.
- **La escala de GoldSrc es 39,37 u/m, no 32.** Sigue valiendo y sigue volviendo.

Y CINCO de sonda, que es peor que la proporción de siempre:

- **La sonda de la paleta estaba bien escrita para el fallo equivocado.** Exigía que
  ninguna textura fuera de un solo color y acusó a `1white`, `black`, `yellow` y
  `sky`, que lo son a propósito. Una paleta mal leída no estropea cuatro de 92:
  estropea las 92. Lo que hay que exigir es la proporción.
- **El histograma medía mi propio empaquetado.** Sobre el atlas entero decía «la
  cubeta mayor se lleva el 59 %», y esa cubeta era el hueco negro que deja subir el
  alto a potencia de dos.
- **El primer control del bobinado acusó al código bueno.** «Un mapa sellado mira
  hacia dentro, así que desde fuera no se ve nada» es falso: desde 120 m de altura
  se ve el interior de los suelos del fondo, que sí miran a la cámara.
- **Y el segundo medía la cosa equivocada estando bien puesto.** Comparaba cara
  frontal contra trasera por LUMINANCIA: 9,8 % contra 7,3 %, o sea no discriminaba,
  porque la sala es oscura de por sí. Con la vara buena —cuánta pantalla ES
  geometría iluminada— da 99,4 % contra 31,8 %.
- **Y «lo que aporta el mapa de luz», medido con el glow encendido, acusó a lo que sí
  funciona:** el glow tapa el efecto de apagarlo, y la sonda dijo «casi no cambia
  nada en 5 de 9 vistas». Cada cosa se mide con la otra apagada.

## La regla del 02, resuelta y no relajada

**Se escribió el lector, no se copió el mapa.** El `.bsp` sigue en `../MSC/`. Lo
extraído vive entero en `build/gatecity/` con su `PROCEDENCIA.md`, `build/` está en
`.gitignore`, y **ni un byte pasa a `public/`**: el navegador lo sirve el servidor
de desarrollo desde `build/`.

Lo nuestro y reutilizable es el lector:
`src/bsp/{lector,miptex,luz,malla,nivel}.js`, `src/render/bsp_escena.js` y
`tools/{gatecity,gatecity_shot,png}.mjs`. Vale para cualquier `.bsp` de GoldSrc y
no contiene nada de este mapa.

---

# Lo del experimento 04, que sigue valiendo entero

Estado del jharro al cerrar el 04: **330 comprobaciones en verde**. Corinth sigue
en pie y se camina en `?map=corinth`. Lo nuevo entonces era **el jharro**, la
ciudad excavada del experimento 04: están hechas las partes **1, 2, 3, 4, 7 y
media 5** —el plano en tres dimensiones, la roca, lo construido, la luz, las zonas
de juego y el visor— y **?map=jharro se abre, se ve y se anda con el teclado**. Lo
que falta de la parte 5 es el JUEZ: el arnés de marcha y el barrido de rayos. Y lo
que no había pasado todavía es que alguien lo jugara un rato — **ya pasó**, y su
veredicto está más abajo.

```
npm test                                  # 311 comprobaciones en Node plano
npm run jharro                            # el plano del jharro: 8 SVG -> build/jharro/
npm run jharro:roca                       # la roca: el corte vertical y la altura libre
npm run jharro:semillas                   # el barrido con el que se eligió la semilla
npm run jharro:png                        # los SVG en PNG, para MIRARLOS
npm run jharro:shot                       # 9 fotogramas medidos desde el visor
npm run jharro:probar                     # la prueba de humo del visor
npm run dev                               # y a andarlo:  ?map=jharro
npm run bsp -- ../MSC/assets/msr/maps/gatecity.bsp --entidades --texturas --zonas

npm run corinth                           # y Corinth sigue donde estaba
npm run verdict public/maps/corinth.map
npm run corinth:andar
npm run dev                               # ?map=corinth
```

## El jharro, y las cifras

| | |
| --- | --- |
| Huella | **24 × 34 celdas = 96 × 136 m**, derivada del relleno medido de Gate City |
| Plantas | **8**, en las cotas que midió el `.bsp`: −22 a +8 |
| Suelo | **256 celdas = 4 096 m²**, repartidas en proporción al suelo de cada banda |
| Cobertura | **100 %** de la huella excavable, a lo ancho y a lo largo |
| Conexiones | **7**: seis escaleras y un pozo, y el tipo lo decide el salto |
| Se llega a todo | **256 de 256** celdas desde la entrada |
| El control | quitar cualquiera de las 7 deja entre **31 y 252** |
| Altura libre | mediana **2,86 m** (Gate City 2,8), p90 **9,30** (9,3), <3 m **51,8 %** (55) |
| Techo | **102,9 %** del suelo (Gate City 107 %) |
| Roca | 3 192 triángulos: 256 suelos, 256 bóvedas, 350 paredes, 72 cantos, 89 repisas |
| Construido | **68 fachadas**, 198 piezas de **solo 6 distintas**, el 4,8 % de la superficie |
| Juntas sin roca | **28**, medidas y fijadas en una prueba, no tapadas |
| Zona segura | **110 celdas = 43 % del suelo**, en 7 barrios y el mayor con 47 |
| Se entra por | la **cueva**: el pueblo no empieza hasta los 40 m (Gate City, 46) |
| Criaderos | **8**, uno por cada 524 m² de suelo, ninguno en el pueblo |
| Principiantes | **58 celdas** de cueva pegadas al pueblo |
| Transiciones | **2**: el socavón de Corinth a 0 m y los portales del fondo a 248 |
| Luz | **58 faroles**: uno cada 48 m² en el pueblo y 111 en la cueva |
| Rincón más oscuro | **18,0 m** de su farol (Gate City tiene uno a 43,7) |
| En el navegador | **?map=jharro** se abre, se ve y se anda: 45,5 m en la prueba de humo |
| Fotogramas | **9 medidos por luminancia**, 6 por encima del 85 % de pantalla visible |
| Control de las capturas | con todo apagado, **0,00 %** |

**Los archivos de este experimento se quedaron en el laboratorio web** al mudar
el port (ver [ESTRUCTURA.md](ESTRUCTURA.md)); los enlaces de aquí abajo no
resuelven en este repositorio. Los archivos nuevos: [src/kit/zonas.js](src/kit/zonas.js) (el plano de juego),
[src/kit/luz.js](src/kit/luz.js) (los faroles y su reparto),
[src/kit/jharro.js](src/kit/jharro.js) (el plano en 3D),
[src/kit/roca.js](src/kit/roca.js) (suelo, bóveda, paredes, túneles y repisas),
[src/kit/ciudad.js](src/kit/ciudad.js) (las fachadas contra la roca),
[src/kit/medir.js](src/kit/medir.js) (la altura libre, con el algoritmo de
`bsp.mjs`), [tools/plano_jharro.mjs](tools/plano_jharro.mjs),
[tools/roca.mjs](tools/roca.mjs) y [tools/svg2png.mjs](tools/svg2png.mjs), más
`test/jharro.test.mjs`, `test/roca.test.mjs`, `test/ciudad.test.mjs` y
`test/zonas.test.mjs`. Y `tools/bsp.mjs` aprendió `--zonas`, que es lo que mide
el plano de juego de un mapa ajeno.

## Lo que se decidió, y no hace falta volver a decidir

**Gate City se mide, no se porta.** Sigue en pie. El `.bsp` es de DrKill y la
regla del 02 manda. Todo lo del jharro sale de proporciones medidas: la huella,
las plantas, el reparto de celdas, la altura de cada sitio, la pendiente de las
escaleras y hasta cuánta caverna hay.

**Ocho bandas de cota no son ocho plantas.** Entre −22 y −20 hay dos metros, y
0,6 se los come la losa de roca: 1,4 m de aire no es un pasillo. Las bandas
juntas son TERRAZAS del mismo hueco; las plantas de verdad las separa un salto
grande. Esto lo decide `chocaConOtraPlanta()` y lo preguntan los dos lados.

**El jharro no tiene `.map` y no lo juzga `qbsp`.** Es malla entera, como el
valle de `hill.mjs`. El juez es el arnés que se escriba, y por eso cada sonda
lleva su control desde el primer día.

**Las casas están metidas en la roca y no se giran.** Una fachada es una cáscara
del kit dentro de una celda de roca, con tres paredes enterradas. El rumbo no se
elige: solo hay una cara libre. Y lo construido solo cabe donde la galería mide
más de 3,3 m, así que **la altura libre decide dónde está el pueblo**.

**La semilla se elige con un criterio escrito y repetible.**
`npm run jharro:semillas`. Cambiarla es legítimo; cambiarla sin mirar el barrido,
no.

## LA SESIÓN QUE CAMBIÓ DE PREGUNTA — [PROMPT_05.md](doc/PROMPT_05.md), YA HECHA

**Hecho, y contestado en [CAPACIDAD_05.md](doc/CAPACIDAD_05.md): la pila llega.** Lo
que sigue debajo es el planteamiento de entonces, que se cumplió en las partes 1 a
5; queda como referencia de por qué se hizo, no como trabajo pendiente.

Reproducir `gatecity.bsp` 1:1 con Three.js, por partes, para averiguar **de qué
es capaz de verdad esta pila**. De nada vale inspirarse en una referencia si no
se puede alcanzar su calidad, y con una referencia perfecta al lado cada fallo se
ve.

Lo de abajo —la piel del jharro: texturas, luz horneada, relieve, adornos— es el
punto 7 de ese prompt y se hace DESPUÉS, con lo que la reproducción enseñe.

La regla del 02 se resuelve así y no se relaja: **se escribe el lector, no se
copia el mapa.** Un visor de `.bsp` es una herramienta nuestra, como `kit.mjs` lo
es para los `.glb`; el archivo se queda en `../MSC/`, lo extraído va a `build/` y
nada pasa a `public/`.

## EL VEREDICTO DE QUIEN LO JUGÓ, y por qué hace falta ese rodeo

Alguien lo anduvo. Dijo: **«todo se ve casi 100 % igual, y bastante inferior al
`.bsp`»**. Es la ronda que más encuentra, otra vez, y esta vez encontró el hueco
del MÉTODO y no un fallo suelto.

Lo que se midió de Gate City fue el ESQUELETO —huella, plantas, altura libre,
densidad de luz, zonas— y está reproducido con fidelidad: siete de ocho
percentiles, las dos densidades, el 43 % de zona segura. Lo que no se midió nunca
fue la PIEL, y es lo que se mira:

| | Gate City | el jharro |
| --- | --- | --- |
| Texturas en superficie | **80** | **1** |
| Para cubrir el 50 % de la superficie | 3 texturas | 1 |
| Para el 80 % | **10** | 1 |
| Para el 95 % | 23 | 1 |
| Área de cara, mediana | **0,47 m²** | 1,10 m² |
| Área de cara, la mayor | 427 m² | 29 m² |
| Mapa de luz horneado | **2,03 MB** | 0 — 58 luces dinámicas sin sombras |
| Adornos | **101 modelos `.mdl`** | 0 |
| Carteles `.spr` | 81 colocados | 0 — hechos: 80 de 81 |

Y la lección, que es la más cara de todas las de este experimento: **las 330
comprobaciones pasan enteras sobre un mundo que parece una sola habitación
beige.** Ni una sola mide variedad. `tools/bsp.mjs` llevaba imprimiendo la tabla
de texturas desde el primer día —rock_07 el 30 %, ms_dirt01 el 17 %, ground03 el
7 %— y se leyó como una PROPORCIÓN («el 54 % es roca») cuando además era un
RECUENTO («y está repartido en ochenta texturas»). Se copió el ratio y se tiró el
número que importaba para mirar.

Tres cosas concretas que salen de ahí, y que explican el veredicto entero:

- **Una textura para todo el mundo.** Suelo, bóveda, paredes, túneles y repisas
  usan el mismo recuadro `PIEDRA` del atlas del kit. No hay nada que distinga una
  galería honda de una sala del pueblo salvo la luz.
- **Y encima es SILLERÍA, no roca.** El 54 % medido es `rock_07`, `ms_dirt01` y
  `ground03`: roca cruda y tierra. Nosotros usamos piedra labrada, así que el
  jharro entero se lee como un sótano CONSTRUIDO — que es justo lo contrario de
  lo que la medida mandaba, y con la cifra de superficie construida en un 4,8 %.
- **Todo mide 4 metros.** Las caras son cuadrados de celda: ni una pequeña, ni
  una grande. Gate City tiene la mediana en medio metro cuadrado y la mayor en
  427, o sea detalle fino Y superficies grandes. La rejilla se ve en cuanto se
  levanta la vista al techo.

## Lo que queda pendiente, por orden de valor

**Los cuatro primeros puntos son la piel, y son la siguiente sesión.** Están por
delante de los bichos, de los adornos que ya estaban escritos y de todo lo demás.

-1. **De 1 textura a 10. Es lo que más cambia por lo que cuesta.**
   El objetivo sale medido y es comprobable: **diez texturas para cubrir el 80 %
   de la superficie, y que la mayor no pase del 30 %**. Hoy es una al 100 %.

   El kit CC0 no las tiene —es un kit de casa de labranza: yeso, madera, teja,
   sillería— y de roca cruda y tierra no trae nada. Se generan, que ya hay
   precedente en `tools/make_textures.py` (cielo, puerta, agua y árbol son
   nuestras). Hacen falta del orden de cuatro de roca, dos de tierra y dos o tres
   de suelo construido.

   Y **se reparten por REGLA, no al azar**, que es lo que las convierte en
   información en vez de en ruido: la roca según la planta y según si la cara es
   suelo, bóveda o pared; tierra en los pasillos; adoquín en los suelos del
   pueblo —lo que de paso sube el 4,8 % de superficie construida hacia el tercio
   medido—. Así el jugador sabe dónde está por cómo es la piedra, que es la mitad
   de lo que hace legible una cueva.

   Coste técnico: la malla generada se dibuja hoy con UN material. Hay que
   emitirla con grupos por textura, que es exactamente lo que ya hace
   `buildMesh()` con el `.map`.

0. **La luz horneada.** Gate City lleva 2,03 MB de mapa de luz precalculado; el
   jharro lleva 58 luces dinámicas SIN SOMBRAS, así que cada superficie recibe luz
   suave y pareja y no hay una sola esquina oscura ni un solo contacto marcado.
   Es la segunda razón de que todo se vea igual.

   No hacen falta shadow maps —58 luces puntuales con sombra no las mueve nadie—:
   hace falta **hornearlo en Node**, que es donde está la geometría y las
   posiciones de los faroles. Oclusión por rayos contra nuestra propia malla más
   visibilidad por farol, guardado como color por vértice. Determinista,
   comprobable sin navegador, y a coste cero en tiempo de ejecución. Es lo que
   más acerca esto a un mapa de GoldSrc.

1. **Romper la rejilla de 4 m.** Ya estaba escrito —«la roca es plana y se va a
   notar»— y se nota. Subdividir y desplazar bóveda y paredes con el `fbm` que ya
   existe en `src/util/noise.js`, **compartiendo los valores de esquina** para que
   la costura siga siendo exacta: si dos celdas vecinas no leen el mismo valor en
   su esquina común, se abre una rendija y aquí una rendija enseña el fondo del
   mundo.

   Objetivo medido: bajar la mediana de área de cara de 1,10 m² hacia los 0,47 de
   Gate City. Y ojo: **esto devuelve la junta que la parte 3 tenía anotada** —una
   fachada recta contra una pared que ya no lo es—.

   Hacer esto ANTES que el juez de marcha es un error: el desplazamiento mueve
   toda la geometría y hay que tener con qué comprobar que no abrió agujeros.

2. **Los adornos, que ya estaban en la lista como parte 6.** Cero contra 159. Y
   aquí el número que manda no es cuántos modelos sino **cuántas cosas puestas**:
   101 adornos de solo 17 modelos, y 55 de los 58 sprites son el mismo fuego. El
   kit ya trae barril, cajón, paja y saco; el sistema de carteles de
   `src/render/backdrop.js` ya sabe dibujar un sprite. El fuego de los faroles es
   la pieza que más barata sale y más llena.


3. **Lo que falta de la parte 5: el JUEZ.** El visor y los fotogramas ya están;
   lo que no está es lo que dice si el mundo está entero:
   - el **arnés de marcha** de `tools/andar.mjs` sobre el jharro: la ruta de la
     entrada al portal del fondo —248 m y siete conexiones— recorrida con un
     cuerpo, que es lo que encontró cuatro de los cinco fallos gordos de Corinth;
   - el **barrido de rayos** buscando suelo y el de canto buscando caras que
     faltan. Aquí importa más que en ningún sitio anterior: **no hay cielo**, así
     que un rayo que se cuela por una cara olvidada no vuelve a chocar con nada
     nunca, y lo que se ve por el agujero es el color de la niebla — que bajo
     tierra es casi negro y se parece mucho a una sombra.

   Aviso caro para quien lo escriba: **la malla generada se dibuja a DOS CARAS**
   (`mallaGenerada` usa `THREE.DoubleSide`). O sea que una pared emitida al revés
   NO se ve mal en el visor, y las dos orientaciones invertidas de esta sesión las
   cazó una prueba de normales, no un fotograma. El renderer tapa exactamente el
   fallo que el barrido de rayos busca.

   Y lo que ninguna sonda hará: **jugarlo un rato**. En Corinth eso encontró
   cinco cosas, y tres no las decía ni una cifra ni una captura.

4. **El pozo es un agujero negro.** El fotograma del pozo se queda en el 1,7 % de
   pantalla visible con todo lo demás entre el 34 y el 100. Tiene su farol —ahora
   todas las conexiones lo tienen— pero es un hueco de doce metros en zona de
   cueva, a 111 m² por farol, y desde arriba no se lee como un paso: se lee como
   una sombra. Un jugador no puede ver el sitio por el que tiene que bajar. Es la
   primera cosa que hay que mirar andando.

5. **Los bichos, los NPC y las misiones — DESPUÉS de andarlo.** Los sitios ya
   están declarados y comprobados en `src/kit/zonas.js`: 8 criaderos, 58 celdas
   de zona de principiantes pegadas al pueblo, y las dos transiciones. Lo que
   falta es el contenido, y hay una prueba que falla si alguien empieza a
   colocarlo ahora. Poner monstruos encima de un mundo que nadie ha andado es
   apilar trabajo sobre algo que puede estar torcido.

   Cuando toque, la medida ya dice cómo: **los bichos flojos y el tesoro van
   pegados al pueblo** —en Gate City, a unos 15 y 30 m de la frontera— y lo duro
   va en la puerta del mapa, a 33 m de la entrada. El fondo no es lo difícil: es
   lo lejos.

6. **Las 28 juntas sin roca.** Dos galerías de plantas distintas pegadas por una
   hoja de papel. Está medido y fijado en una prueba. Taparlo recortando las
   bóvedas se come el contraste; la forma fina es no dejar que dos plantas sean
   vecinas en planta, y eso es tocar la excavación entera. **Decidirlo después de
   andarlo**, que es lo único que puede decir si se nota.

7. **Los adornos, en detalle (parte 6).** Sillas, mesas, helechos, velas y un carro,
   generados, porque el kit CC0 no los tiene y son 40 de los 101 adornos de Gate
   City. `src/kit/malla.js` tiene las primitivas y `src/kit/cerco.js` es el
   ejemplo. Y **repetición, no variedad**: 101 adornos de 17 modelos. Aquí entra
   también **pavimentar las salas**, que es la mitad de la diferencia entre
   nuestro 5,2 % de superficie construida y el tercio de Gate City: su 27 %
   incluye los suelos de adoquín y aquí todos los suelos son roca.
8. **La roca es plana, en detalle.** Suelos, bóvedas y paredes se emitieron
   planos a propósito —para que la costura entre plantas y entre tramos fuera
   exacta— y eso hace que el jharro sea, geométricamente, un mundo de cajas de
   4 m. Ponerle desplazamiento es trabajo de después de mirarlo, y **devuelve el
   problema que la parte 3 tenía anotado**: la junta entre una fachada recta y
   una pared que ya no lo es.
9. **Medir cuántas caras HORIZONTALES tiene cada pieza del kit.** Sigue
   pendiente de antes y ahora pesa más: `stone_square`, `plaster_wall` y
   `stone_square_1m` tienen cero, y bajo tierra —donde todo es interior— una
   cáscara hueca se nota mucho más que en Corinth. Las fachadas del jharro usan
   `stone_square` y `plaster_wall`.
10. **Comparar capturas contra PNG de referencia.** Pendiente desde el 02. Ahora
   hay además dos SVG que se convierten a PNG con `npm run jharro:png` y que
   serían el primer sitio fácil donde empezar: un plano es determinista y su
   diferencia con el de ayer es exacta.
11. Y de antes, sin tocar: el interior del socavón de Corinth más allá de la reja,
   el yunque y la manivela del torno, la calle mayor pelada, el enemigo de
   sprites a 8 direcciones y el viaje entre niveles.

## Avisos que cuestan una sesión si se olvidan

Los de antes siguen valiendo todos —`castRay` no toca nada hasta el primer
`world.step()`, `readPixels` después del intercambio de buffer devuelve NEGRO,
glTF pone el origen de la UV arriba, una UV fuera de su recuadro del atlas pinta
otro material, las piezas del pack no apoyan todas en cero, `-0` no es `0` para
`Object.is`, una pieza del pack puede ser una cáscara hueca, dos brushes en el
mismo volumen dan z-fighting, abrir un hueco en un muro deja el hueco sin suelo,
un valor por defecto plausible es un fallo silencioso, la escala de GoldSrc es
39,37 u/m y no 32, ningún asset entra sin licencia al lado, los experimentos 01 y
02 están congelados—. Y estos son del jharro:

- **El eje Z del revés ya ha costado tres veces.** `house.js` llama «sur» a su
  cara de z=0, que mira a +Z; el plano cuenta las filas de norte a sur, o sea
  hacia −Z. Giró las doce casas de Corinth, invirtió las 74 fachadas del jharro
  —con la puerta contra la roca— y **también se coló dentro de la sonda escrita
  para cazarlo**, que acusó a 217 paredes de 438 de estar al revés estando bien.
  La traducción vive en un solo sitio por archivo y tiene prueba.

- **Una casa metida en la roca esconde sus propios fallos.** En Corinth una casa
  girada media vuelta se ve desde fuera. Aquí lo que se ve desde la galería es
  una pared lisa de piedra, que en una cueva es exactamente lo que uno espera
  ver. Lo único que lo caza es preguntarle a la pieza YA COLOCADA hacia dónde
  mira.

- **Las cifras globales no ven los problemas de reparto.** 256 celdas apiñadas en
  una esquina y 256 repartidas por la huella dan el mismo relleno del 31 %. Lo
  mismo con la bóveda: el 16 % medido salía clavado con la planta principal del
  jharro entera de techo bajo. Lo dijo el dibujo, las dos veces.

- **El plano en planta no sirve para juzgar un sitio bajo tierra.** Se parece
  igual con dos metros de techo que con nueve, y la medida dice que esa
  diferencia es la mitad del diseño. Hace falta el CORTE.

- **Un adorno que no estorba puede decidir la escala del sitio.** La repisa de
  roca volaba un metro de los cuatro de la celda y hundía la mediana del jharro
  medio metro, porque el emparejamiento suelo-techo se queda con el techo más
  bajo de cada casilla de 2 m. Su tamaño está quantizado a esa casilla: entre
  0,7 y 1,2 m de vuelo no cambia absolutamente nada.

- **Un sesgo del medidor no se corrige mintiendo, se corrige midiendo.** El
  método reparte cada cara por su caja, así que el pasillo bajo le baja la cifra
  a la caverna de al lado. Ese sesgo está también en la medida de Gate City, así
  que lo que hay que igualar es la curva MEDIDA, no la que se reparte. `GAMMA` es
  ese número y hay una prueba que falla si alguien lo quita.

- **Copiar un número medido sin preguntarse qué es puede hacer el mundo
  intransitable.** El p10 de Gate City son 0,8 m de altura libre. Eso no son
  pasillos de ochenta centímetros: son salientes sobre un suelo que sí se pisa.

- **Lo que se reserva tarde ya está ocupado.** Un túnel se busca cuando la planta
  de la que sale ya está excavada y las de abajo no, así que sin apartarlo la
  planta siguiente excava por donde ya pasa una escalera — y la celda estaba
  libre cuando se miró.

- **Una escalera de 4,37 m no cabe en un túnel de 4.** La rampa llegaba al pie
  con 37 cm de desnivel: un escalón sin cara. El túnel lleva ahora una celda más
  de las que pide la carrera, y la carrera sale de la pieza del pack.

- **Filtrar una lista no reindexa lo que apunta a ella.** Tirar los tramos vacíos
  dejaba a cada celda apuntando al tramo del vecino: la altura libre y la luz
  saldrían de otro sitio y todas las cifras seguirían cuadrando.

- **Recortar por el final no es lo mismo que no pasarse.** Quitar celdas de un
  tramo ya abierto para cuadrar el presupuesto puede partir la galería en dos, y
  una planta partida mide lo mismo y se dibuja entera.

- **Un cociente con el denominador equivocado no da error.** Contando luces por
  metro de HUELLA, Gate City parece tener siete veces más luz en el pueblo que
  fuera; por metro de SUELO —que es lo que se ilumina— son 2,4 veces. Lo escribí,
  lo di por bueno, y estuvo a punto de ser el objetivo de la parte 4: habría
  triplicado los faroles del pueblo y dejado la cueva a oscuras, con la
  comprobación en verde.

- **Una cifra global no ve un problema de reparto. Tres veces ya.** El relleno
  del 31 % con la ciudad apiñada en una esquina; el 16 % de bóveda con la planta
  principal entera de techo bajo; y el 43 % de zona segura repartido en doce
  trozos de confeti por seis plantas. Las tres cifras salían clavadas. Contra
  esto hace falta **una segunda cifra que mida la FORMA** —la cobertura de la
  huella, la bóveda por planta, el tamaño del barrio mayor— o el dibujo.

- **Lo obvio y lo medido no coinciden en por dónde se entra.** Lo obvio es una
  ciudad subterránea con la puerta en la plaza. Gate City deja 46 m de cueva
  entre el punto de llegada y la primera casa, y pone el primer monstruo a 13.
  Sin esa regla el pueblo del jharro empezaba a cuatro metros de la reja de
  Corinth y no fallaba nada.

- **Un criadero pegado a la frontera convierte la zona segura en una trampa**, y
  la densidad medida sigue saliendo bien. Se eligen los más lejos del pueblo
  primero.

- **La cobertura no vale como sonda bajo tierra.** Mide píxeles que no son del
  color de la niebla, y aquí la niebla es casi negra y la roca sin farol también:
  un pasillo a oscuras marcó el **95,7 % de cobertura siendo una pantalla negra**.
  Lo que vale es la LUMINANCIA —qué fracción de pantalla pasa de 32 sobre 255— y
  esa misma toma daba el 0,0 %.

- **Un farol no alcanza su alcance.** Three.js multiplica la luz de un punto por
  una ventana que a nueve de cada diez metros del radio ya ha recortado el 96 %.
  Y GoldSrc hornea con caída LINEAL hasta el radio: los 10,6 m de p90 de Gate
  City son de ese modelo. Copiar la proporción sin copiar el modelo es medir con
  otra vara.

- **Arreglar la oscuridad de golpe la lava.** Con el radio al doble, la caverna
  salía a brillo mediano 185 de 255: todo iluminado por igual y ni una sombra, o
  sea sin el contraste que es la mitad del diseño. En el pueblo hay un farol cada
  48 m², así que al doblarles el radio se solapan todos con todos.

- **Un reparto por celdas de suelo se salta lo que no es suelo.** Las siete
  conexiones verticales —lo único que une las ocho plantas— se quedaron sin un
  solo farol, porque un túnel no es suelo de ninguna planta. Las dos densidades
  medidas salían clavadas.

- **Medir una proporción no es medir la variedad, y las 330 comprobaciones no
  saben la diferencia.** Todas pasan sobre un mundo de una sola textura. El
  objetivo de variedad existe y estaba impreso desde el primer día: hacen falta
  DIEZ texturas para cubrir el 80 % de la superficie de Gate City. Cualquier
  cifra que se saque de `bsp.mjs` hay que leerla dos veces: como proporción y
  como recuento.

- **Una entrada mira a donde le toque.** La prueba de humo del visor dijo «el
  jugador está atascado» y no lo estaba: estaba de cara a la pared correcta de un
  mundo correcto, porque la celda de entrada está pegada al margen de roca. El
  rumbo de llegada se calcula ahora de por dónde se puede ir.

## Lo que ninguna cifra vio, otra vez

Esta ronda no la juzgó nadie andando —el jharro todavía no se puede andar— así
que el reparto salió distinto y conviene anotarlo:

- **El dibujo encontró los dos fallos de diseño, y las pruebas los de geometría.**
  El descampado y la planta principal sin cavernas los dijo el SVG con todas las
  cifras en verde; las paredes invertidas, el suelo doble del túnel, las fachadas
  del revés y los túneles pisados los dijeron las pruebas y ninguna captura los
  habría enseñado.
- **Tres de los fallos que gritaron las sondas eran de las sondas**, y una de
  ellas cometía por dentro exactamente el error que estaba buscando. La
  proporción es la misma que la vez pasada y la lección también: **una sonda sin
  control es una sonda que dice que sí**, y una sonda con control pero mal
  escrita es peor, porque acusa a quien no es y se pierde la sesión arreglando lo
  que estaba bien.
- **Y falta el que más encontró la vez pasada: alguien jugando un minuto.** De
  las cinco cosas que se vieron jugando en Corinth, tres no las decía ni una
  cifra ni una captura: hacía falta MOVERSE. El jharro no ha tenido esa ronda
  todavía, y hasta que la tenga, lo que aquí se afirma es que **está calculado y
  medido**, no que esté bien.
