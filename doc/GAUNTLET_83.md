# El bono que Edana no debería dar, y la línea que cortaba lo que no era

**Experimento 83.** Dos de las seis verificaciones que pidió el usuario
comparando el puerto con una captura del juego original. Las otras cuatro las
llevaron `-25` (el eco del sonido), `-e0` (las ratas que no muerden) y `-f5`
(el panel de habilidades y el cielo que se mueve al saltar).

El encargo era corto:

> cuando inicio el juego en edana me sale 10000 puntos por empezar un gauntlet,
> esto tampoco pasa en el juego original
>
> en el juego original veo que no hay nada de eso de alerta a los enemigos

Lo primero resultó ser **cuatro piezas del lenguaje de guiones sin portar**, y
al ponerlas apareció que la línea que corta un evento llevaba desde siempre
haciendo tres cosas y las tres mal. Lo segundo era **una frase que nos
habíamos inventado**.

---

## 0. La premisa, que casi se diagnostica al revés

La captura que mandó el usuario **es el juego original**, no nuestro puerto. Lo
confirmó `-f5` por su lado y yo por el mío, y conviene dejar escrito cómo, que
es más barato que volver a dudarlo: hay tres textos en esa captura y ninguno de
los tres puede salir de nuestro código.

| en la captura | de dónde sale en el original | qué dice el nuestro |
| --- | --- | --- |
| `Hit Giant Rat: 2.6 slash damage.` | `"Hit %s: %s %s"` — giattack.cpp:1954 | `2.6 damage to Giant Rat — 1 of 4 left` (main.js:4569) |
| `Giant Rat hits you: 0.4 slash damage.` | `"%s hits you: %s %s"` — giattack.cpp:1994 | `Giant Rat hits you: 0.4 damage`, sin el tipo (main.js:4981) |
| `You've slain Giant Rat` | `local OUT_MSG "You've slain "` + `gplayermessage` — monsters/base_npc.script:193-199 | `You killed Giant Rat — 3 experience` (main.js:4699) |

Importa porque **el reparto inicial de las tareas describía una de ellas al
revés**: yo le dije a `-f5` que a la lista de habilidades de la izquierda le
faltaba el porcentaje, cuando lo que la captura enseña es el panel de la
derecha, que es el que a nosotros nos faltaba. `-f5` lo miró con el motor
delante antes de tocar nada y lo corrigió. *Una captura de referencia leída como
si fuera una captura del fallo invierte el diagnóstico, y el que reparte las
tareas es el que mejor puede propagar el error.*

---

## 1. El bono de los 10 000

La guarda está en el guion del jugador y es correcta:

```
local L_MAP_NAME $lcase(game.map.name)
if ( $get_find_token(MAPS_GAUNTLET_START,L_MAP_NAME) == -1 ) exitevent

if ( game.time < 180 )
{
  setvard PLR_TOTAL_DMG 10
  gplayermessage ent_me Bonus 10,000 damage points for starting gauntlet.
}
                                player/server/dmgpoints.script:32-42
```

`MAPS_GAUNTLET_START` es `lowlands;lodagond-1;ww1;the_wall;old_helena;nashalrath`
(world/server/maps.script:7) y Edana no está. O sea que el original tampoco da
el bono en Edana: la guarda lo impide.

**Ninguna de sus cuatro piezas estaba portada.**

| pieza | motor | qué pasaba sin ella |
| --- | --- | --- |
| `game.map.name` | `if (Prop == "name") return MSGlobals::MapName` — script.cpp:4608-4612 | se resolvía a la cadena literal «game.map.name». **265 usos en los 2 884 guiones** |
| `$lcase` | `_strlwr` — script.cpp:63 / :3159-3176 | el getter devolvía su propio nombre |
| `$get_find_token` | script.cpp:143 / :1725-1760 | idem, y «$get_find_token(…)» no es «-1» |
| `exitevent` | `Event.bFullStop = true` — scriptcmds.cpp:48 / :3148-3153 | la línea no cortaba nada |

Y las cuatro se tapan unas a otras: aunque `$get_find_token` hubiera estado, sin
`exitevent` la guarda no habría guardado; y aunque `exitevent` hubiera estado,
sin `game.map.name` la comparación era contra una cadena fija. **Un bloque de
cuatro piezas sin portar no da cuatro avisos: da un mensaje en pantalla y
ninguno.**

### Las rarezas que no se adivinan

- **`$get_find_token` devuelve el ÚLTIMO, no el primero.** El bucle no lleva
  `break` (script.cpp:1751-1754), así que `iFoundAtPos` se sobrescribe. Su
  propio comentario —«returns idx of found string»— se lee al revés.
- **Un tercer parámetro, el que sea, convierte la búsqueda en PARCIAL**
  (`if (Params.size() >= 3) bPartialSearch = true`, :1745; y entonces compara
  con `contains`, :1753). No mira su valor.
- Con menos de dos parámetros devuelve `"-1"`, y `$lcase` sin parámetros
  devuelve `"0"`: ninguno de los dos devuelve vacío.
- `exitevent` **desenrolla los `if` anidados** —el bucle mira `bFullStop`
  después de CADA comando (script.cpp:5767-5768)— pero **no se lleva por
  delante al evento que hizo el `callevent`**, porque la bandera se limpia al
  terminar el evento (:5694).

### Lo que no se porta, dicho aquí y no descubierto luego

`MAPS_GAUNTLET_START` **nunca está puesta en este puerto**. La pone
`world/server/maps.script:6-7` con un `setvarg`, y `world.script` no se ejecuta
aquí: `src/play/intro.js` lo LEE para sacarle datos, no lo corre.

O sea que hoy, con las cuatro piezas puestas, el bono **no sale en ningún
mapa**: ni en Edana, que es lo que pedía el usuario, ni en los seis en los que
el original sí lo da. Lo primero está bien y lo segundo es un hueco, **y se
declara en vez de contarse entre los verdes** —apartado 4 de CLAUDE.md—. El
control que lo medirá cuando `world.script` corra ya está escrito en
`test/gauntlet83.test.mjs`.

---

## 2. La línea que cortaba lo que no era

Al ir a escribir `exitevent` apareció que ya había una línea para esto:

```js
case "return": case "exit": ev.parar = true; return true;
```

Las tres cosas que hacía, y las tres mal:

**1. `exit` no existe en el motor.** `m_GlobalCmdHash` registra `exitevent`
(scriptcmds.cpp:48) y `return`/`returndata` (:167). No hay ningún `exit`, y en
los 2 884 guiones hay **cero** líneas con un `exit` suelto. Estaba portado y no
lo usaba nadie.

**2. `return` NO corta.** Es `returndata`, y el motor lo dice encima de la
función con todas las letras: *«Does not stop code execution - if multiple
instances of return are encountered in the same event, the results are
tokenized»*. Lo demuestran además los propios guiones sin salir del archivo:

```
return **clear
return L_ITEMS        chests/bank1/filter.script:25-26
```

Dos líneas seguidas. Si `return` cortara, el banco devolvería siempre vacío.
**Eran 148 líneas en 81 ficheros** cortando el evento donde el juego sigue.

**3. `exitevent`, el que sí corta, no estaba.** 108 líneas en 53 ficheros.

Y lo que hace a esto una familia y no un caso: **la bandera `ev.parar` y su
comprobación en el bucle llevaban escritas desde el 67**, con la cita del
motor al lado y todo. Lo que faltaba era el comando que la enciende. *Una
bandera comprobada en el bucle y que no enciende nadie es el mismo sitio que un
`=> {}` de relleno: una regla puede vivir ahí sin correr.* Es el 66 con el
`bloodstone_toggle` y el 59 con el dado, por otra puerta.

---

## 2 bis. Y la cuarta cosa, que apareció un día después: cómo abandona el `if` viejo

**Corrección añadida al lado, por el apartado 7.** Arriba se arreglaron tres
cosas de este bucle y quedó una cuarta sin ver. La destapó la sesión `-e0`
midiendo el menú del propio jugador —`if SHOWIT_ON` dentro de
`if ( AM_SITTING )`—, y toca esta misma función, así que se arregla aquí.

El motor:

```cpp
if (!Cmd.m_NewConditional)
  break; //Old if command.  Breaks event execution on failure
                                              script.cpp:5756-5757
```

**El comentario del motor engaña**, y es suyo, no nuestro. `break` sale del
bucle y cae en el `return true` de :5771, así que **quien llamó ve «se
cumplió»**. Y a los bloques hijos se entra por la recursión de :5752, que
**tira el valor devuelto**. O sea que lo que un `if` viejo abandona es su
`Cmdlist`, no el evento.

Nuestro puerto ponía `return false`. La única pieza de todo el proyecto que lee
lo que devuelve `ejecutarLista` es la cadena de `else` —los dos llamadores de
arriba tiran el valor, igual que el motor—, así que la diferencia es ésta: con
`return false` la cadena **sigue probando ramas que el motor ya no prueba**.

Y aquí viene la parte que hay que decir en voz alta, porque es del apartado 4
mirándose al espejo: **hoy ningún guion del juego puede ver la diferencia.**
Medido sobre los 2 884:

| | |
| --- | --- |
| ramas `else` en total | **1 908** |
| con un `if` viejo en su PRIMER nivel | **135** |
| …y que además no sean la última rama de su cadena | **0** |

Las dos condiciones son las que hacen la diferencia observable: si el `if`
viejo está más adentro, el `false` lo descarta la recursión; si la rama es la
última, no hay rama siguiente que ejecutar de más. Y de las 135, **las 135 son
la última**.

Así que esto es **fidelidad sin efecto medible hoy, y no se apunta entre los
verdes.** Se arregla porque la cita existe y la línea es una, y el control se
escribe construyendo el caso a propósito —desde TEXTO, que la bandera `nueva`
la pone el analizador, que es la regla del 67— para que el día que un guion lo
traiga ya esté. Hay condicionales con hasta **19 ramas** en el juego, así que la
forma es construible y no una invención: lo que no hay es ninguno con un `if`
viejo arriba en una rama que no sea la última.

Roto a propósito (`break` → `return false`, con `grep` confirmando que la
rotura estaba puesta, que es la lección del 80): **rojo**, el control que mide
que la rama siguiente no se ejecuta.

**Y la fila del 67 no está mal.** Decía «abandona el bloque entero» y era
verdad del caso que midió: allí `if game.serverside` estaba al nivel de arriba
del evento, y ahí abandonar el bloque y abandonar el evento son lo mismo. Lo
que hay que saber es que decía «el bloque» **por dónde estaba la línea y no por
la regla**. En el caso de `-e0` sí se distinguen: sentarse **sí** da maná, y lo
que se pierde son los dos mensajes.

---

## 3. El aviso a los aliados, que era nuestro

El mecanismo es real: al morir, un monstruo avisa a los suyos en una esfera, y
está portado y medido. Lo que no existe es **decirlo**. La cadena del mod
—`npcatk_alert_all_allies` → `npcatk_alert_in_range` → `npcatk_ally_alert`,
monsters/base_monster_shared.script:1071-1095— de punta a punta no imprime nada
al jugador: lo único que sale por ahí es un `dbg`, que va a la consola de
depuración del servidor y está además medio comentado (:1081).

Así que se quita el texto (main.js:4564 y :5034) y **se deja el aviso y su
contador**: `cuentas.avisos` es lo que mide `sondas/consecuencias.mjs:400`, y
un mensaje de HUD no es el sitio donde se comprueba que los aliados vienen.

Es el 65 calcado —«You parried the blow!», una frase plausible en el sitio
correcto— y la segunda vez que este puerto se inventa texto de combate. Las
otras tres que quedan vivas están en la tabla del apartado 0; `-e0` cerró una
en su experimento y dejó las otras dos declaradas.

---

## 4. Cómo se midió

**Las pruebas**, `test/gauntlet83.test.mjs`, 25 controles. Al analizador se le
da TEXTO y no objetos de comando escritos a mano, que es la lección del 67: la
bandera que distingue el `if` viejo del nuevo la pone el analizador al ver el
paréntesis, y aquí la mitad de los casos son `if`.

El bloque del final es el que importa: el **guion real** de
`build/msr/jugador.json`, entrando en Edana por `activate_stuff`, con su
control positivo al lado (el mismo guion en `lowlands` **sí** da el bono) —
porque con un solo mapa el valor correcto y el valor de reposo son el mismo y
el control no puede fallar por construcción, que es el caso del 50.

**Siete roturas deliberadas, siete rojos**, cada una confirmada con `grep`
ANTES de medir, por patrón y no por tanda: el `assert` de un reemplazo múltiple
puede pasar con dos de tres partes puestas, y eso me costó una vuelta entera en
el 81.

| rotura | efecto |
| --- | --- |
| `exitevent` no corta | 6 rojos |
| `$get_find_token` devuelve «0» | 6 rojos |
| `$lcase` no baja la caja | 2 rojos |
| `game.map.name` sin resolver | 4 rojos |
| `return` vuelve a cortar | 1 rojo |
| quitar el `mapa:` de `new GuionDelJugador` | 1 rojo |
| devolver la frase de los aliados | 1 rojo |

Las dos últimas son pruebas que leen el **texto** de `src/main.js`, y está
dicho en el propio archivo que miden el código y no la pantalla. Están porque
las dos cosas que vigilan —un gancho que no se reenvía (el 63) y una frase
inventada que nadie compara con el original (el 65)— viven en una línea de un
archivo que ninguna prueba de Node puede importar. *Un control flojo que dice
lo que es vale más que ninguno.*

**El gancho se reenvía.** `mapa` va en la firma de `GuionDelJugador`, en su
`new Guion({...})` y en el `new GuionDelJugador({...})` de main.js:2053. Las
tres, porque el 63 se perdió justo ahí: parámetro en la firma, nadie que lo
pase, y 25 pruebas verdes porque le construían ellas el argumento.

---

## 5. Lo que midieron las sondas, y una que medía sus propias recargas

`sonda:sidra81` **15 de 15** · `sonda:jugador64` **16 de 16** ×3 ·
`sonda:misiones33` **21 de 23** · `npm test` **2 094 de 2 094** ·
`npx vite build` limpio.

`sonda:misiones33` trae dos rojos. **No son de este experimento**, y eso está
medido y no supuesto: con el `return` devuelto a su comportamiento de antes, la
sonda da exactamente los mismos dos rojos. Uno de ellos —«quedan 51 frases con
retardo en la cola»— tenía toda la pinta de ser mío, porque un `return` que
deja de cortar hace que se encolen más `callevent` con retraso. No lo era.
*Una hipótesis causal verosímil se aísla igual: cuesta una pasada y evita un
arreglo a ciegas.*

`sonda:jugador64` se cayó **tres veces de cuatro, con tres caídas distintas**
—un `waitForFunction` agotado, un `personaje` a `null`— y la pasada que terminó
salió entera en verde. No era el juego: **no cortaba el canal `vite-hmr`**, y
con cuatro sesiones guardando archivos la página se recargaba a mitad de pasada
y se llevaba `window.probe` por delante. Puesto el corte: 16 de 16 tres veces
seguidas.

Esto ya está escrito en AVISOS desde el 81 y hay **varias sondas sin el corte**
(`-f5` encontró `arranque36` igual). Y el motivo de fondo no es la comodidad:
una sonda cuya página se recarga a mitad está midiendo **dos versiones del
código**, y eso no vale ni cuando sale verde.

**Añadido al día siguiente, con `misiones33`, y con la cara más fea de las
dos.** Al volver a pasarla por el arreglo del §2 bis se cayó dos veces, con dos
síntomas distintos —un `waitForFunction` agotado y un `window.probe` undefined
leyendo `.sesion`—, y la primera **remató con «0 de 0 en verde»**: la forma
exacta del 65, un marcador cuya Y se calcula al final y por eso no puede bajar
nunca. Una sonda que se cae puede imprimir el pleno.

No era el juego ni era mi cambio: era el `vite-hmr`, con `-e0` guardando
`main.js` en ese mismo rato. Puesto el corte —el mismo bloque que `jugador64`—
los 23 controles corren, cero errores de página y **22 de 23 tres pasadas
seguidas**. El corte apaga SÓLO el socket de recarga: cualquier otro
`WebSocket` —el del multijugador— sigue siendo el de verdad, así que una
recarga por otro motivo se seguiría viendo.

El control positivo de ese corte no hubo que fabricarlo: **son las dos caídas
de antes de ponerlo**, contra tres pasadas limpias después.

Y un número que cambió y del que **no digo la causa porque no la he medido**:
el rojo de «51 frases pendientes en la cola» sigue ahí igual, pero el segundo
rojo que `misiones33` traía ayer ya no sale, y son 22 de 23 en vez de 21 de 23.
Entre ayer y hoy han tocado el árbol tres sesiones. Queda apuntado como
observación, no como consecuencia de nada de esto.

---

## 5 bis. El plantón de `sonda:cuerpo`, que no era de quien parecía

`-e0` lo trajo como vecindad —«se cae con un plantón y no sé de quién es»— con
el aviso bien puesto de que había rehorneado `build/msr/cuerpos` y que había
verificado los seis roles del manifiesto antes de descartarse. Lo midió bien.
Lo que llegó girado era la forma del fallo: **no agota esperando el
localizador.** La fila se resuelve, es visible y estable; lo que falla es el
**clic**, y Playwright nombra a `<div class="mx-detalle">` como quien
intercepta el puntero.

Eso invita a buscar un solape, y conviene decir que **no existe**, porque es
media hora para el siguiente:

| | |
| --- | --- |
| la fila de «Spell Casting» | x 379–695, y 485 |
| el detalle | x 713–1029, y 175 |
| columnas de `.mx-hoja` | `190px 316px 316px` |
| `elementsFromPoint` en el centro de la fila | `SPAN → BUTTON.mx-hab-fila → … → DIV.mx-hoja` |
| 20 muestras en 2 s | la caja del detalle no se mueve y la fila no se rehace ni una vez |

La causa sale de leer el cerrojo del puntero paso por paso dentro de la propia
sonda:

```
jugando                        preso=CANVAS  panel=null
con el inventario de VGUI      preso=null    panel=inventory
tras `probe.interfaz.hoja()`   preso=CANVAS  panel=null
```

**Abrir el inventario SÍ suelta el puntero**, o sea que el arreglo del 35 está
vivo —y ahí hay un control positivo que no hubo que fabricar—. Lo que vuelve a
pedirlo es **cerrarlo**: `probe.interfaz.hoja()` cierra el panel de VGUI, eso
entra por `cursorDelRaton(false)` (src/main.js:420) y acto seguido se monta un
panel del DOM, que no es de VGUI y que por tanto no le dice a nadie que lo
suelte. Con el puntero preso un clic sintético no cae donde Playwright apunta,
y el navegador nombra lo que haya en el punto del cerrojo.

### ⚠ LA CORRECCIÓN DE ABAJO ESTÁ MAL. Se deja a la vista y se corrige al lado

Lo que sigue en este apartado es una rectificación mía que **era falsa**, y el
desmentido lo trajo `-e0` repitiendo la comprobación en vez de aceptarla. Se
queda escrita porque el error es la parte que no se puede volver a deducir del
código, y la buena va al final, medida.

**La frase ORIGINAL era correcta: la hoja del DOM no la abre la P.** La guarda
es `if (accion === "hoja" && !panelDeHoja)` (interfaz.js:851) — **la función, no
su resultado**. `main.js:643` pasa esa flecha SIEMPRE y sin condición, y una
flecha nunca es `falsy`, así que `!panelDeHoja` es falso en todas las partidas:
esa rama no corre nunca. Con «stats» ausente tampoco cae al suplente, porque
quien atiende la P de verdad es `main.js:3322` —`vgui?.alternar("stats")`— y con
`vgui` ausente el `?.` no hace nada. **La P se queda sin dueño, no cae al DOM.**
Y el único llamador de `interfaz.hoja` en el árbol sigue siendo
`src/dev/sonda.js`.

Medido, no leído, porque entre tres sesiones ya habíamos leído este camino dos
veces mal — con la tecla pulsada en una partida de verdad:

```
[jugando, antes de la P]    panel=null   hojaDelDom=0  filas=0  preso=CANVAS
[tras pulsar la P]          panel=stats  hojaDelDom=0  filas=0  preso=CANVAS
[tras pulsarla otra vez]    panel=null   hojaDelDom=0  filas=0  preso=CANVAS
```

La P abre el panel `stats` de VGUI, **cero** hojas del DOM, y el puntero sigue
preso, que para `stats` es lo correcto: tiene `m_NoMouse`, y eso ya estaba
escrito en main.js.

Así que el hueco del `cursor` que falta en `montarInterfaz` **es real y está
detrás de un camino apagado a propósito**, o sea más latente de lo que escribí,
no menos: hoy nadie puede llegar ahí. Cablearlo ahora sería escribir una regla
que no se puede ejecutar ni medir —el 62 exacto— y el control que la midiera
entraría por el atajo del probe o por nada. Queda **dicho y sin cablear**, de
acuerdo con `-e0`.

Dos lecciones, y la segunda es la que me llevo del día:

- **`!f` y `!f()` se leen igual y no son lo mismo**, y aquí la diferencia era si
  una pantalla entera existe. Es el `probe.misiones.bolsa()` del 81 —un objeto
  literal nunca es `falsy`— trasladado a una función.
- **Una rectificación no llega con más crédito que la afirmación que corrige.**
  La mía venía con números, con citas y con un «lo volví a comprobar», y por eso
  `-e0` casi la pasó tal cual al usuario; lo que la frenó fue leer la línea. El
  matiz de esa misma mañana sobre el `_tmp_donde82` —tres sesiones de acuerdo no
  son tres medidas si dos se apoyan en la primera— **vale igual para los
  desmentidos**, y el mío fue el caso.

Lo de abajo, lo que quedó mal:

### La corrección, del día siguiente, y el hueco que tapaba — ⚠ FALSA, ver arriba

Escribí aquí que **`pantallaHoja` del DOM no tiene ni un llamador en `src/`** y
que por tanto la sonda medía una pantalla sin entrada. `-e0` tomó esa frase
como el hallazgo de verdad —«no es que la sonda entre por un atajo, es que el
destino no tiene entrada»— y, como el usuario iba a decidir sobre ella, la
volví a comprobar en serio. **Es falsa.**

La abre **la tecla P** (`teclas.js:100`, `bind "p" "playerinfo"`) en
`interfaz.js:851`, detrás de la guarda `panelDeHoja`. Y esa guarda es
`() => (vgui?.buscar("stats") ? (vgui.abrir("stats"), true) : false)`
(main.js:643): con el panel «stats» de VGUI montado —que hoy lo está—, la P
abre **ése**, y la del DOM es el **suplente** declarado, exactamente igual que
`pantallaMuerte`. Mi `grep` no la vio porque la llamada no se escribe
`interfaz.hoja()`. *Un `grep` por el nombre de la función no encuentra a quien
la llama por su clave en un objeto, y «cero resultados» se lee igual que «no
existe».*

Y debajo de la frase falsa había un hueco de verdad, que es lo que vale la pena
de todo esto: **`montarInterfaz` no recibe ningún `cursor`.** No está en su
firma (interfaz.js:188-194) ni en la llamada (main.js:639-645). O sea que las
pantallas suplentes del DOM **no tienen con qué soltar el puntero**: el arreglo
del 35 se cableó en la capa de VGUI (main.js:773, con su comentario contando el
fallo) y en ésta no. El día que el suplente corra jugando —que es justo cuando
«stats» no esté, o sea cuando algo haya fallado— el jugador verá la hoja y no
podrá pulsar una fila. **El 35 otra vez, en la capa que no lo recibió**, y la
sonda lleva tiempo rozándolo sin medirlo.

Así que la decisión no es «retirar ese trozo de la sonda»: lo que falta es el
cableado. No se toca desde aquí porque es `src/main.js` y lo tiene `-e0` a
medias. Y sigue en pie el **no** parchear la sonda con un `exitPointerLock`,
ahora por una razón mejor: taparía con el instrumento justo el hueco que hay en
el juego.

**Y una corrección de lo mío, del mismo rato.** Al ponerle a esa sonda el corte
del `vite-hmr` escribí en el comentario que las dos caídas eran la misma causa,
porque el corte había arreglado un plantón mío en `entrarPorElMenu`. **No lo
son**: con el corte puesto el clic sigue fallando, dos pasadas. El comentario
está corregido en el archivo. *Un remedio que arregla una caída invita a
atribuirle la siguiente, y eso es un diagnóstico por parecido — el 78.*

---

## 6. Las filas de §4 que este experimento propone

No se escriben en CLAUDE.md desde aquí: van redactadas para que el usuario
decida, por acuerdo con `-f5`, y se le llevan junto con las suyas en una sola
pasada en vez de que cuatro sesiones editen §4 en paralelo.

| caso | el control decía | de verdad medía |
| --- | --- | --- |
| experimento 83 | `return`, portado con su cita en la misma línea que corta un evento | que **`return` no corta**: es `returndata`, y el motor lo dice encima de la función —«*Does not stop code execution*»—. Lo demuestran los propios guiones en dos líneas seguidas: `chests/bank1/filter.script:25-26` hace `return **clear` y luego `return L_ITEMS`, y si cortara el banco devolvería siempre vacío. Eran **148 líneas en 81 ficheros** abandonando el evento donde el juego sigue. En la misma línea había otras dos: **`exit` no existe en el motor** —cero usos en los 2 884 guiones— y **`exitevent`, el que sí corta, no estaba** (108 líneas en 53 ficheros). *Tres comandos de control de flujo en un `case` compartido, y el que tenía razón era el que faltaba* |
| experimento 83 | `ev.parar`, la bandera de cortar un evento, escrita en el 67 con su cita y comprobada en el bucle después de cada comando | que **no la encendía nadie**: el comando que la activa (`exitevent`) no estaba portado. La bandera, su comprobación y su comentario llevaban dieciséis experimentos en el archivo sin que un solo guion del juego pudiera usarla. *Una bandera comprobada en el bucle y que nadie enciende es el mismo sitio que un `=> {}` de relleno o un parámetro con valor por omisión: una regla puede vivir ahí sin correr* |
| experimento 83 | la guarda que impide que Edana regale 10 000 puntos, `if ( $get_find_token(…) == -1 ) exitevent` | que **un getter sin soporte devuelve su propio nombre** —que es lo correcto, script.cpp:4741— y que por eso la comparación `== -1` no se cumple NUNCA. El valor de reposo de un getter no es neutro: es un literal que falla todas las comparaciones numéricas, así que una guarda escrita «si no está, sal» se convierte en «sigue siempre». Y las cuatro piezas que faltaban —`game.map.name` (265 usos), `$lcase`, `$get_find_token` y `exitevent`— se tapaban unas a otras: *un bloque con cuatro piezas sin portar no da cuatro avisos, da un mensaje en pantalla y ninguno* |

| experimento 83 bis | la fila del 67 sobre el `if` viejo —«no se salta una línea: abandona el bloque entero»—, con su cita del motor y correcta | que nombraba el mecanismo **por dónde estaba el caso y no por la regla**. El motor hace `break` sobre su `Cmdlist` y cae en el `return true` de :5771, y a los bloques hijos entra por una recursión que **tira el valor** (script.cpp:5748-5765); el comentario del propio motor dice «breaks event execution» y también engaña. En el caso del 67 la línea estaba al nivel de arriba del evento, así que abandonar el bloque y abandonar el evento eran lo mismo y no se podían distinguir: la fila heredó esa coincidencia. Lo separó `-e0` un año de experimentos después, con `if SHOWIT_ON` dentro de `if ( AM_SITTING )`, donde la diferencia decide si sentarse da maná. *Una fila de §4 escrita desde un solo caso puede describir la regla con la forma de ese caso; si el caso no podía distinguir dos lecturas, la fila tampoco* |
| experimento 83 bis | nuestro `return false` en el `if` viejo, y el arreglo que lo pone a `break` | **a nadie, hoy**: de las 1 908 ramas `else` de los 2 884 guiones, 135 llevan un `if` viejo en su primer nivel y **0 de ellas son algo distinto de la última rama**, que son las dos condiciones que hacen la diferencia observable. El arreglo es fiel y está citado, y **no se apunta entre los verdes**; el control construye el caso a propósito para el día que un guion lo traiga. Es la regla del 78 y del 81 por el lado bueno: en vez de descubrir que una rotura deja todo verde, se cuenta ANTES cuántos guiones usan la rama. *Portar una rama del motor que ningún guion ejercita es legítimo; contarla como una medida, no. La diferencia es barata: se cuenta sobre el corpus antes de escribir el código* |
| experimento 83 | el reparto de las seis verificaciones entre cuatro sesiones, con su cita, sus archivos candidatos y su aviso de §4 en cada tarea | que una de las seis frases del parte —«el panel derecho sí trae el porcentaje y la lista de la izquierda no»— **no era una medida nuestra: era una lectura de la captura**, y la captura era el juego original. En el mensaje las tres clases de afirmación se leen igual: lo medido aquí, lo citado del motor y lo observado en una imagen. Perdida esa etiqueta, la sesión que recibe mide el DIAGNÓSTICO en vez del síntoma, y quien reparte lo multiplica por el número de sesiones. Lo paró `-f5` yendo al motor antes de tocar nada. *Al repartir, cada afirmación tiene que llevar de dónde sale: medida nuestra, cita del motor, u observación de una captura. Sólo la primera se puede dar por buena sin volver a medirla — y la tercera, en un port, suele ser el objetivo y no el estado* |
| experimento 83 | lo que cruza de una sesión a otra, en las dos direcciones, el mismo día | que **pierde sus condiciones por el camino y llega más firme de lo que salió**. Por la mañana respaldé una inferencia de `-25` sobre `edana82` sin medir nada, y un respaldo sin medida no es una segunda opinión: es el mismo dato otra vez, pareciendo el doble de firme. Por la tarde comprimí una medida suya —«el horneado del herrero es fiel al `.bsp`, falta el giro, y la caja del modelo contra el mostrador queda sin medir»— a «el herrero no se reproduce», que promete más de lo que se midió y deja en entredicho la medida buena cuando el usuario vuelve a verlo. Es la misma avería en los dos sentidos. *El remedio no es escribir con más cuidado: es que el que RECIBE pregunte qué no se midió, y que el que RESUME no quite las condiciones* |

---

## 7. Lo que queda abierto

- **`world.script` no se ejecuta.** De ahí salen `MAPS_GAUNTLET`,
  `MAPS_GAUNTLET_START` y lo que haya en los demás `setvarg` del mundo. Hoy eso
  significa que el bono del gauntlet no sale en ningún mapa; mañana puede
  significar otra cosa en cualquier guion que lea una global del mundo.
- **`$func(<evento>)` y `m_ReturnData`**, que es para lo que sirve `return`.
  Sin ellos, un `return` se apunta como hueco y sigue. También es por donde
  `game_damaged` cambia el daño con un ratio.
- **Las dos frases de combate inventadas que quedan**: `2.6 damage to X — N of
  M left` (main.js:4569) y `You killed X — N experience` (main.js:4699). La
  segunda tiene trampa y está dicha: la frase buena la emite el GUION con un
  `gplayermessage` (base_npc.script:193-199), así que si nuestro `game_death`
  llega a correr, el arreglo no es cambiar nuestro texto sino **borrarlo**.
  Antes de escribir nada hay que medir si el guion ya lo emite.
- **Las sondas sin el corte de `vite-hmr`.** `jugador64` lo lleva desde hoy;
  `arranque36` lo necesita y seguramente más.
