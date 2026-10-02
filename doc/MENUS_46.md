# 46 — El andamiaje de menú, y los cinco de Gate City

> `src/play/listas.js` · `src/play/guion.js` · `test/juego_menus46.test.mjs` · `npm run guiones`

Los cinco NPC con menú de Gate City caben enteros. Es el salto más grande que
ha dado el censo y también el que más fácil se lee mal, así que la segunda
sección de este documento es sobre eso.

## Lo que cambia

| | 45 | ahora |
| --- | --- | --- |
| comandos de 223 | 38 | **73** |
| getters | 10 | **18** |
| propiedades de `$get` | 6 | **15** |
| A. el menú se construye entero | 88 | **118** de 139 |
| B. alguna opción de principio a fin | 78 | **88** de 139 |
| C. **el NPC entero** | 20 | **46** de 139 |
| Gate City | 2 de 5 | **5 de 5** |

Y el porqué del salto: **este bloque se eligió junto a propósito**. El 44 metió
siete comandos buenos y movió el censo cero, porque lo que bloqueaba estaba en
otro sitio. `array.*` sin `menu.open` no sirve, `menu.open` sin `$get_arrayfind`
tampoco, y `calleventloop` —que era el comando más pedido de todo el corpus, 41
scripts— no sirve sin ninguno de los dos. O entraba el bloque o no entraba nada.

## «Cabe entero» NO es «funciona»

El censo mide **que el guion se ejecuta sin encontrar un comando desconocido**.
No mide que el menú salga bien. Son dos cosas y confundirlas es exactamente la
forma del fallo del apartado 4 de [CLAUDE.md](../CLAUDE.md): el mecanismo no se
dispara, el control lee el valor de reposo, el valor de reposo pasa.

Así que después de que el censo dijera «5 de 5» se miró **el contenido** de los
cinco menús, y el primero salió raro:

```
== gatecity/vendor  (4 opciones)
   [callback] "Shop"  -> vendor_offerstore
   [callback] "Shop"  -> vendor_offerstore
   [callback] "Shop"  -> vendor_offerstore
   [callback] "Shop"  -> vendor_offerstore
```

Cuatro veces «Shop» y ni rastro de «Hail». Las dos cosas resultaron ser el
juego:

- **Sin «Hail» está bien.** `gatecity/vendor.script:16` dice `const NO_CHAT 1`,
  y `base_chat` se guarda sus tres opciones detrás de `if !NO_CHAT`. El armero
  tiene `const NO_RUMOR 1` y por eso le faltan los rumores y no lo demás.
- **Las cuatro «Shop» también.** `gatecity/vendor.script` **copia tal cual** el
  `game_menu_getoptions` y el `vendor_addstoremenu` de
  `monsters/base_npc_vendor`, que ya le entra por el `#include` de su línea 22.
  Con dos eventos de cada nombre, `RunScriptEventByName` ejecutando **todos**
  los que se llamen igual (script.cpp:5836) y `menuitem.register` sin mirar el
  id (npcscript.cpp:940-999), salen 2 × 2 = **cuatro**. Es una duplicación del
  contenido, no del puerto, y se porta con el fallo: hay una prueba que exige
  que sean cuatro.

Las seis comprobaciones del final de `test/juego_menus46.test.mjs` miran títulos
y orden, y la que comprueba lo que mide el censo va **la última** a propósito,
porque es la condición débil.

## Los detalles que no se adivinan

**1. La vuelta de `calleventloop` empieza en CERO** y se lee
`game.script.iteration` (`m.m_Iteration = i`, scriptcmds.cpp:2301;
script.cpp:4673). Se restaura al salir (:2320), así que un bucle dentro de otro
no le pisa la cuenta al de fuera.

**2. Y reencauzarlo se salta una vuelta.** `MSC_RESET_LOOP` hace
`i = reset_to_iteration` **dentro del cuerpo del `for`**, así que el `i++` de la
cabecera corre detrás (:2316). Poner 0 no vuelve a la vuelta 0: vuelve a la
**1**. Escribí la prueba esperando `0120123` y salió `012123`; el motor tiene
razón y la prueba la tenía yo mal.

**3. `MSC_BREAK_LOOP` es un `break` de una sola bala:** el motor lo vuelve a
poner a 0 al salir (:2306-2309). Sin rearmarlo, el siguiente bucle del mismo
guion saldría en la primera vuelta.

**4. Dividir entre cero no da cero ni infinito: deja el valor como estaba.** La
condición es `Operation == 3 && Amount` (:4217), así que sin divisor no entra en
ninguna rama y `flValue` sigue siendo `Params[0]`… que se escribe encima
igualmente. Lo mismo `mod`, que además corta a entero los dos lados.

**5. `capvar` no escribe cuando el valor ya está dentro.** Son dos `if` sueltos
(:2336-2338), no un `clamp`: una variable que no existe y cae dentro **se queda
sin existir**.

**6. `array.create` sobre una que ya existe no la vacía** —lo dice su cabecera
(:1953)—, y `clear` y `erase` no son lo mismo: después de `clear` un `add`
funciona, después de `erase` se queja. `copy` **añade** al destino en vez de
reemplazarlo (:2003), y el destino es siempre **la entidad que ejecuta**, aunque
el origen fuera de otra (el motor usa `m.pScriptedEnt` a pelo y no el `pEnt` que
acaba de resolver).

**7. Los cuatro getters de listas no contestan lo mismo cuando falta la lista:**

| pregunta | la lista no existe | no encuentra |
| --- | --- | --- |
| `$get_array_amt(L)` | **"-1"** | — |
| `$get_array_exists(L)` | "0" | — |
| `$get_arrayfind(L,x)` | **"[ERROR_NO_ARRAY]"** | "-1" |
| `$get_array(L,i)` | "[ERROR_NO_ARRAY]" | **su propio texto** |

El último es el que sorprende: `$get_array(L,9)` fuera de rango cae hasta
`return FullName` y devuelve la cadena «$get_array(L,9)». Thothie lo documentó
en vez de arreglarlo — «screwy, but servicable (just check that pull request
does not start with `$get_array`)», script.cpp:1276.

**8. El tercer parámetro de `$get_arrayfind` es el tipo de búsqueda o, si no lo
reconoce, el índice de partida:** el motor **retrocede el cursor** de parámetros
(`--vParam; // Reset to get start index`, :1303). O sea que
`$get_arrayfind(L,x,3)` no busca «de tipo 3»: busca por igualdad desde el 3.

**9. `menuitem.remove` quita por ID —no por título— y quita TODAS** las que
coincidan: `Menuoptions.erase(i--)`, con el motor comentando «Erase _all_ with
this name. Makes erasing big menus easy» (npcscript.cpp:1010). Quitar sólo la
primera dejaría medio menú puesto cada vez que `base_storage` cambia de
pantalla.

**10. `menu.open` con la mochila llena no abre Y NO DICE POR QUÉ.** El aviso que
lo explicaría **está comentado en el original**:

```c
if (pPlayer->NumItems() < NUM_MAX_ITEMS) OpenMenu(pPlayer);
// else
// {
//   pPlayer->SendEventMsg(HUDEVENT_UNABLE, "Cannot use menus while inventory full.");
// }
                                      npcscript.cpp:1026-1033
```

El silencio es del juego. Se porta.

## Dos fallos del original que salen a la luz

**La tarifa del guardarropa de Gate City es CERO, y siempre lo ha sido.**
`NPCs/base_storage.script:150-151` hace

```
setvard USE_FEE $get(PARAM1,maxhp)
multiply USE_FEE FEE_HP_RATIO
```

con `PARAM1` = el jugador. Pero la rama de `maxhp` **vive dentro de
`else if (pMonster)`** (scriptcmds.cpp:1388-1391): con un jugador delante no
casa con nada y sale «0» por el `return fSuccess ? "1" : "0"` de :1688.
Devolver aquí la vida máxima del personaje sería cobrar un dinero que el
original no cobra.

**Y el vendedor te trata de alfeñique valgas lo que valgas.**
`monsters/base_npc_vendor_confirm.script:87` hace
`if ( $get(PARAM1,strength) < 10 )`… y **`"strength"` no aparece ni una vez en
todo el código del mod**. No es una propiedad: es un nombre que no casa con
nada, así que vale «0» y la condición es **siempre cierta**.

Esa segunda obligó a partir en dos lo que el censo llamaba «hueco». Ahora hay
`PROPIEDADES`, las que sabemos contestar, y **`PROPIEDADES_VACIAS`, las que el
motor mismo contesta con «0»** — para las que devolver «0» *es* portarlas.
`tools/guiones.mjs` ya no las cuenta como falta, y por eso el censo pasa de
109 a 118 en la columna A sin tocar una línea de intérprete. La diferencia entre
«no lo sabemos hacer» y «el juego tampoco lo hace» tenía que estar en algún
sitio.

## Corrección del 43: `playsound` tenía la firma mal

El 43 lo portó como `playsound <ent> <canal> <archivo>`, **con una entidad
delante**, y no hay entidad: suena siempre el que ejecuta el guion. Se leyó de
la tabla de comandos sin abrir la función. Lo que hay (scriptcmds.cpp:4675-4795)
es `playsound <canal> [volumen] <sonido> [atenuación] [tono]`, con

- el volumen **opcional y reconocido por ser un dígito**
  (`isdigit(Params[1].c_str()[0])`, :4704), lo que deja convivir
  `playsound 0 SOUND_IDLE1` con `playsound 0 10 SOUND_IDLE1` — las dos están en
  los guiones de hoy;
- el volumen **de 0 a 10, no de 0 a 1**: `atof(Params[1]) / 10`, topado arriba
  y abajo por un fallo viejo de Thothie;
- **volumen 0 = «corta ese canal»**, no silencio (:4775), que es como se paran
  los sonidos en bucle;
- y un sonido llamado literalmente `none` **se salta** (:4751).

`playrandomsound` es la misma función y elige de la parte de la lista que son
archivos: `Params[NextParm + RANDOM_LONG(0, Params.size() - (Volume > -1 ? 3 : 2))]`.

## Cómo se comprobó

58 comprobaciones de Node, seis de ellas sobre el **contenido** de los cinco
menús de Gate City, y diez roturas a propósito:

| rotura | rojas |
| --- | --- |
| la vuelta del bucle empezando en 1 | 4 |
| `array.create` vaciando la que ya existe | 2 |
| `array.del` sin mirar el rango | 1 |
| `$get_array_amt` sin lista devolviendo la cadena de error | 3 |
| `$get_array` fuera de rango devolviendo «-1» | 1 |
| el volumen sin dividir entre 10 | 2 |
| `menuitem.remove` quitando sólo la primera | 1 |
| `maxhp` contestándole al jugador | 1 |
| `strength` contado como hueco | 1 |
| dividir entre cero de verdad | 1 |

`npm test` **1232/1232**. Y las tres sondas vecinas, en Chromium:
`sonda:misiones33` 23/23, `sonda:vgui2_34` 26/26, `sonda:intro42` 14/14.

## Lo que este experimento NO hace

- **`menu.open` no abre nada.** Se anota que el guion lo pidió; el panel lo abre
  la interfaz cuando pulsas, y no hay camino de vuelta desde el guion hasta
  ella. Mismo hueco que el panel de la tienda del 44.
- **`catchspeech` no dispara nada**, porque este puerto no tiene chat de texto.
  Las frases se registran de verdad —`entorno.frases`— y lo que cambia es que
  el `game_spawn` de estos NPC llega al final en vez de abortar.
- **`helptip` no llega**: la ventana de consejos no está portada.
- **`playsound` no suena.** El catálogo de estos `.wav` no está horneado —
  `npm run sonido` trae pasos y combate, no diálogo. Se apunta el archivo y el
  volumen, que es lo que este experimento permite medir.
- Y sigue sin haber **panel de tienda**, así que los cinco NPC de Gate City
  tienen su menú entero y del armero y el vendedor todavía no se puede comprar.

## Lo siguiente

Ya no es el menú. Lo que más se repite ahora en el censo es geometría y
disparadores: `usetrigger` (33 scripts), `$vec` (25), `$relpos` (24),
`getplayersnb` (23), `setangle` y `$get_insphere` (18). `usetrigger` es el bus
de disparadores de GoldSrc, que es el **paso 2 del plan** — el que se aparcó con
evidencia en el 43 porque en Gate City no dispara nada, y que vuelve a aparecer
por su propio pie ahora que el corpus entero está a la vista.
