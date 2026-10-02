# 43 — Siete comandos más, elegidos midiendo

> `npm run guiones` · `src/play/guion.js` · `test/juego_guiones43.test.mjs`

El intérprete de Master Sword son 14 000 líneas y 223 comandos. El 33 portó 22 y
con ellos **7 de los 139 NPC con menú funcionaban enteros**. Éste añade siete
comandos y un getter, y son **19**.

En Gate City, que es lo que importaba: Kendra pasa a funcionar entera —la
primera del pueblo— y el alcalde se queda a tres.

## Por qué éstos siete y no otros

No se eligieron a ojo. El censo guarda, por script, **qué le falta exactamente**,
así que se puede preguntar al revés: de los 6 NPC de Gate City que tienen menú,
¿cuántos piden cada cosa?

```
 5  playsound      4  setprop        3  menu.open
 5  stradd         4  setmoveanim    2  gplayermessage · npcstore.offer · helptip …
 5  say            4  roam
 5  $randf         4  setmovedest
```

Los ocho de la izquierda son los que piden casi todos. Los de la derecha ya son
la cola, y el bloque de `npcstore.*` es otra cosa —las tiendas— que merece su
propio experimento.

Un intento de greedy «qué comando suelto completa más NPCs» **no sirve aquí**, y
conviene decirlo: con 0 añadidos hay 0 NPCs enteros en Gate City y ninguno se
completa añadiendo uno solo, porque el que menos necesitaba eran ocho. El
algoritmo se queda clavado en cero. Lo que funciona es mirar la frecuencia y
atacar el NPC más barato, que era Kendra.

> **Corrección del 46.** `playsound` se portó aquí **con la firma mal**: como
> `playsound <ent> <canal> <archivo>`, con una entidad delante. **No hay
> entidad.** Es `playsound <canal> [volumen] <sonido> [atenuación] [tono]`
> (scriptcmds.cpp:4675-4795), el volumen es opcional y se reconoce por ser un
> dígito, **va de 0 a 10 y se divide entre 10**, el 0 no es silencio sino
> «corta ese canal», y un sonido llamado `none` se salta. Se leyó de la tabla
> de comandos sin abrir la función, que es el error que este proyecto ya había
> cometido con `$get_token`. Corregido, con siete pruebas, en
> [MENUS_46.md](MENUS_46.md).

## Lo que realmente cambia, y no es lo que parece

Cuatro de los siete **no llegan todavía a ninguna parte**: `playsound`,
`setprop`, `roam`, `setmovedest` y `setmoveanim` están en el intérprete y sus
ganchos del entorno están vacíos, cada uno diciendo dónde acaba hoy
(`src/play/npcguion.js`).

Eso suena a trampa y no lo es, porque lo que estaba roto era otra cosa:

> Antes, encontrarse un comando no portado **abortaba la opción entera**. Un
> `roam 1` en mitad de una retrollamada dejaba al NPC mudo a partir de ahí.

Ahora el evento llega al final y lo que falta es el efecto, no la conversación.
Ésa es la diferencia entre 7 y 19. Hay una prueba que lo dice con esas palabras
(«un `roam` en mitad de un evento ya no se lleva por delante lo que sigue»), y
es la que se pondría roja si alguien volviera al comportamiento viejo.

## Los detalles que no se adivinan

**`stradd` con tres parámetros NO añade: reemplaza.** `stradd V a b` deja «ab»,
se llamara antes como se llamara. Sólo la forma de dos concatena. Es de la
reescritura de MiB de 2019 (`scriptcmds.cpp:6802`) y es lo que hacen los
guiones. Y una variable sin poner **devuelve su propio nombre**, cosa que el
motor comprueba justo para tratarla como vacía (`:6798`): sin eso, el primer
`stradd` sobre una variable nueva daría «L_TEXTOhola».

**`say` son sonidos, no palabras.** Es `saytext` el que escribe. Cada parámetro
es un `.wav` y puede llevar entre corchetes cuánto se abre la boca:
`say hail[0.8]`. Y `*` y cualquier cosa que empiece por `RND` **no son
sonidos**: sólo mueven la boca. El motor lo comenta como lo que es —«Thothie's
totally frustrated and just hacking now», `npcscript.cpp:127`— y está para que
el parloteo aleatorio de `base_chat` no acabe cargando un `RND1.wav`.

**`$randf` es el MISMO getter que `$rand`.** Lo único que los separa es una
letra en la posición 5 del nombre: `if (ParserName.c_str()[5] == 'f')`
(`script.cpp:3551`). Con la efe, `RANDOM_FLOAT`; sin ella, `RANDOM_LONG`.

**`setmovedest` distingue un punto de una entidad por el paréntesis**, y por
nada más: `Params[0].c_str()[0] == '('` (`npcscript.cpp:1621`). En la práctica
el vector llega siempre por una variable —`setmovedest WAIT_POINT 32`— porque el
troceador parte por espacios.

**Tres se tragan los parámetros en silencio si les faltan.** `setprop` necesita
los tres (`:6182`), `setmovedest` necesita dos para la rama del destino
(`:1613`), `roam` necesita uno. Con menos, el motor no entra en el `if` y no
pasa nada, sin un solo aviso. Hay una prueba por cada uno, porque un comando que
calla es indistinguible de uno que funciona si nadie lo mira.

## Cómo se comprobó

22 comprobaciones nuevas de Node, y las cuatro roturas de rigor:

| rotura | rojas |
| --- | --- |
| `stradd` de tres concatenando en vez de reemplazar | 1 |
| `say` tratando `RND1` como un archivo | 1 |
| `setprop` aceptando dos parámetros | 1 |
| `$randf` devolviendo un entero | 2 |

El guardia del subconjunto (`test/juego_misiones.test.mjs`, «para que no crezca
a escondidas») hizo su trabajo: se puso rojo solo al pasar de 22 a 29 comandos.
Se actualizó a mano, que es lo que pide.

## El censo, antes y después

| | 33 | 43 |
| --- | --- | --- |
| comandos portados de 223 | 22 | **29** |
| getters | 7 | **8** |
| A. el menú se construye entero | 65 | **88** |
| B. alguna opción de principio a fin | 73 | **78** |
| C. el NPC entero | 7 | **19** |

Y Gate City, NPC a NPC:

| | falta |
| --- | --- |
| `kendra` | **nada: entera** |
| `mayor` | 3 — `deleteent`, `$get_by_name`, `$get_token_amt` |
| `storage` | 5 — `menuitem.remove`, `calleventloop`, `multiply`, `menu.open`, `$get_token_amt` |
| `armorer` | 10 — casi todo el bloque `npcstore.*` |
| `vendor` | 11 — íd. |

## Lo siguiente, y por qué

Dos de los cinco son **tiendas**, y las tiendas son la respuesta más directa a
«los goblins son demasiado fuertes para nivel 1»: comprar armadura y un arma
mejor es como sobrevive un jugador de verdad. `npcstore.create`,
`npcstore.offer` y `addstoreitem` son el siguiente bloque, y arrastran
inventario, oro e interfaz — su propio experimento.

El alcalde a tres comandos es el otro candidato barato.
