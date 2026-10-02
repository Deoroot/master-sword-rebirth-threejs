# Los guiones llegaban a medias — experimentos 81 y 82

Este documento lo escriben **dos sesiones a la vez**, y va junto a propósito.
El mismo día, cada una encontró por su lado una razón distinta por la que el
repertorio de eventos de un NPC de Master Sword estaba corto en este puerto:

- a una se le **caían ficheros enteros** del `#include`, porque el ámbito entre
  corchetes se comía el nombre del fichero;
- a la otra se le **quedaban sin nombre los bloques** que sí entraban, porque
  la forma larga de nombrarlos no estaba portada.

Los dos efectos **se multiplican y no se suman**: un guion podía perder diez
ficheros y, de lo que le quedaba, no poder llamar por su nombre a la mitad.
Partirlo en dos documentos que se citen el uno al otro es exactamente cómo se
consigue que la sesión siguiente lea sólo una mitad, así que va en uno.

Lo que tienen en común es la forma del fallo, y conviene decirla antes que los
detalles: **un evento que no se carga no se distingue de un evento que no
existe**. No hay error, no hay hueco en ningún contador, y el NPC se queda
quieto haciendo algo razonable.

---

## PRIMERA PARTE — el `#include` con ámbito (experimento 82)

> Esta sección la escribe la sesión del 82. Reservada: el reparto, la cita de
> `script.cpp:5229-5246`, las cifras de los 1 074 guiones y los 6 308 bichos,
> y lo de `monsters/externals` y `base_self_adjust`.

---

## SEGUNDA PARTE — `eventname` no nombraba nada (experimento 81)

### 1. Lo que se veía

Edana no tiene un botón que empiece una misión. Tiene `catchspeech`: **se
empiezan diciendo una palabra**. Desde el 79 los vecinos oyen, así que la
primera misión de punta a punta tenía que ser una de ésas, y la más corta es la
sidra — tres NPC que se pasan el estado entre ellos mientras el jugador no
lleva nada encima:

```
«job»   a Sylphiel  →  te manda a Bryan
«cider» a Bryan     →  Bryan se lo cuenta a Sylphiel por su cuenta
«cider» a Sylphiel  →  la recompensa
```

Lo que pasaba antes de este experimento es que **Sylphiel pagaba la recompensa
en el primer fotograma de la partida**, antes de que entraras en la taberna, y
su contador de la misión valía 99 de salida.

### 2. `eventname`, y por qué fallaba al cien por cien

Hay dos maneras de nombrar un bloque en un guion de Master Sword:

```
{ say_hi                    ← la corta: el nombre pegado a la llave
   saytext Hello
}
{
   eventname say_hi         ← la larga: dentro, y casi siempre sangrada
   saytext Hello
}
```

`partirGuion` —el analizador que hornea los guiones de los NPC— **sólo conocía
la corta**. El motor hace esto con la otra:

```c
else if (!_stricmp(TestCommand, "eventname"))
{
    sscanf(CmdLineTmp, "%s", cBuffer);
    CurrentEvent->Name = cBuffer;
    CurrentEvent->fNextExecutionTime = -1;
    CurrentEvent->fRepeatDelay = -1;
}
                                            script.cpp:5370-5376
```

Tres detalles que se portan y que no se adivinan: se queda con **la primera
palabra** (`sscanf("%s")`), **anula el `repeatdelay`** del bloque, y **el
comando no se guarda** — a diferencia del `repeatdelay` de tres líneas más
abajo, éste no pone `KeepCmd`, y por eso `eventname` aparecía 570 veces en la
lista de «no soportados» de los guiones.

**El censo, que es lo que convierte esto en un fallo total y no en uno
parcial:** en los 2 884 guiones hay **570 declaraciones `eventname` en 202
ficheros**, y **las 570 están sangradas**. Ninguna al margen. O sea que la
forma larga no nombró un solo bloque en 81 experimentos.

### 3. Por qué no era un hueco callado

Aquí está lo que hace que esto no sea «faltaban unos eventos». Un bloque sin
nombre **no es un bloque inerte**:

```c
if (Name.len()) Event.Name = Name;
else            Event.fNextExecutionTime = 0;
                                            script.cpp:5198-5202
```

El motor lo registra como **un evento programado para ya**, y corre entero en
el primer `Think`. Así que los 570 bloques del juego hacían dos cosas mal a la
vez: **se ejecutaban al nacer el NPC**, en orden de archivo, y además **no
existían con su nombre** cuando alguien los llamaba.

De ahí la recompensa regalada. El `say_reward3` de Sylphiel corría al nacer,
ponía su `cider_1` a 99 y soltaba cinco monedas de oro a quien pasara.

Medido sólo en Edana, al arreglarlo:

| | antes | después |
| --- | --- | --- |
| bloques sin nombre (se ejecutan al nacer) | 269 | 198 |
| nombres de evento que no existían | — | **33** |

Entre esos 33 están `npc_spawn`, `spawn`, `vendor_addstoreitems`, `trade_done`,
`cider2`, `cider3`, `ciderreward` — y también **`attack_1`, `bite1`,
`npcatk_checkflinch` y `npcatk_resetflinch`**, o sea que el repertorio de
combate de un bicho también estaba incompleto.

### 4. Por qué sobrevivió 81 experimentos

**Los 25 guiones de Gate City usan la forma corta, los 25.** Es el caso único
del experimento 50 por duodécima vez en este proyecto: con un solo mapa, el
valor correcto y el valor de reposo son el mismo, y el control no puede fallar
por construcción.

### 5. El arreglo destapó lo que tapaba

`npc_spawn` **corría por accidente**, por no tener nombre. En cuanto lo tuvo,
dos guiones de Edana se quedaron sin nacer: el motor llama a **dos** eventos al
aparecer una entidad con guion y este puerto llamaba a uno.

```c
CallScriptEvent("spawn");      //old
CallScriptEvent("game_spawn"); //not called by players
                                            global.cpp:435-437
```

`npc_spawn` sigue sin llamarse desde el motor, y es correcto: lo llama el
propio guion, con `callevent npc_spawn` dentro del `game_spawn` de `base_npc`
(`monsters/base_npc.script:24`).

*Un arreglo puede dejar al descubierto lo que tapaba. Al arreglar algo viejo
hay que volver a mirar lo que se apoyaba en ello.*

### 6. Los otros tres huecos de la misma cadena

**`llamarExterno` seguía siendo un `=> {}`.** El experimento 66 encontró ese
mismo hueco y lo arregló **en dos de los tres entornos** —el del jugador y el
de los objetos—, dejando el de los NPC. Con él se caía **todo `callexternal`
entre dos NPC**: 63 llamadas con destino en 27 ficheros, más 111 `all` y 82
`players`. El comentario que lo justificaba decía «aquí no hay más guiones
corriendo que el del NPC de delante», y **era verdad cuando se escribió y dejó
de serlo en el 79**, cuando el reparto de la voz empezó a tener los 48 guiones
de Edana. Es el `catchspeech` del 79 calcado: un diagnóstico correcto con fecha
de caducidad y sin fecha.

**Ningún NPC estaba en el registro de nombres.** `$get_by_name` mira el
`netname` antes que el `targetname`, y el `netname` de un NPC lo pone
`name_unique`. En este puerto `name_unique` no es un comando y `npc_spawn` no
se ejecutaba, así que el registro —que sabe distinguir únicos desde el 45— no
tenía dentro ni un NPC: `$get_by_name(wench)` devolvía «0» en todas las
partidas jugadas. Se lee de la ficha, sin hornear nada aparte, y el primer
intento **filtró por `npc_spawn` y encontró 2 de los 48 de Edana**: en los
2 884 guiones ese comando vive en **trece bloques distintos** (`game_spawn` 43,
`[shared]` 20, el bloque sin nombre 18, `npc_spawn` 18, `orc_spawn`, `spawn`,
`[server]`, `skel_setup_body`, `elf_spawn`…). La lista blanca del 78 otra vez:
sólo mira donde sabe mirar.

**`$cansee` no estaba en `GETTERS`.** Y con el `if` VIEJO —el del 67— un getter
sin soporte no se salta una línea: **abandona el bloque entero**. El `say_job`
de Sylphiel empieza con `if $cansee(player,128)`, así que moría en su primera
línea aunque todo lo demás estuviera bien.

### 7. `$cansee`, y las cinco cosas que no se adivinan

```
$cansee(<target/ally/enemy/player/(name)/(classname)>,<range>)
                                            npcscript.cpp:1754-1850
```

1. **El rango pasa por `atof`**, no por `Number` — la del 79 —, y **sin rango
   vale `-1`**, que su propia condición convierte en «sin límite» (`:1761`,
   `:1841`).
2. **La distancia es 3D y de centro a centro**, y el mod se molesta en
   escribirlo: *«This is always going to use Length(), not Length2D()»*
   (`:1829`).
3. **Se le resta el tamaño del objetivo** si es un monstruo: `m_Width/2`, o
   `sqrt((w/2)² + (h/2)²)` si vuela (`:1835-1837`).
4. **`$cansee` ESCRIBE.** `StoreEntity(pSighted, ENT_LASTSEEN)` (`:1843`). No
   es decorado: el `say_job` de Sylphiel sigue con
   `setmovedest ent_lastseen 9999`, o sea que **el vecino se gira hacia quien
   acaba de ver con este getter**. Ahí se tocan este experimento y el de
   `setmovedest`.
5. Y una que **el nombre de la variable dice al revés**: `ClosestTarget` **no
   es un umbral fijo, se aprieta en cada vuelta** del bucle (`:1838-1846`). O
   sea que `$cansee(player,128)` no es «¿hay alguien a menos de 128?» sino
   «recorre a los visibles y quédate con el más cercano». Por lo tanto
   **`ent_lastseen` acaba siendo el visible MÁS CERCANO y no el último visto**.
   Con un jugador da igual; con dos en la taberna, no. Aquí sólo hay un
   candidato posible, así que **el apriete está documentado y no portado**, y
   se dice en vez de fingirlo.

Lo que se inyecta desde fuera es **sólo el rayo** (el `FMVisible` de `:1824`),
porque el rayo vive en la física. La aritmética se queda en la capa del guion
con sus citas: llevarla al rayo habría dejado una segunda copia del `atof`, de
la resta y del `ENT_LASTSEEN`, y dos copias son dos mundos (el 63). El rayo lo
puso la sesión del `setmovedest`, y ahora tiene dos usuarios y una sola copia.

### 8. Lo que se entendió mal, que es la parte que no se deduce del código

**Las posiciones son metros y los rangos son unidades.** Casi meto un
`$cansee(player,128)` que decía «te veo» a **128 metros** — tres veces Edana
entera—, porque `RANGO_LOCAL = 300` está en unidades de GoldSrc y
`instancia.donde` está en metros. Un alcance infinito y callado, la forma del
79 por otra puerta. Y las pruebas estaban verdes porque **las escribí con los
dos lados en el mismo espacio**: una prueba así no puede ver la diferencia.
Ahora las de la regla van con la escala a 1 y hay una aparte, con dos escalas,
que mide la conversión.

**Una guarda que mezclaba dos cosas costó medio experimento.** El `ve` tenía
`if (!p || (p.vida ?? 0) <= 0) return "0"`, sin apuntar nada, y eso junta **«el
objetivo está muerto»** —que es la regla del motor (`:1792`) y no se apunta—
con **«no hay nadie atado a este guion»**, que es un hueco nuestro y sí. Al no
apuntar, el getter devolvía el valor de reposo en silencio, y para llegar a esa
línea hubo que instrumentar un rayo **de otra sesión** que estaba sano. *Una
guarda que devuelve lo mismo por una razón del motor y por un hueco propio hace
que el hueco no se pueda ver.*

**Una prueba mía nació roja y el equivocado era yo.** Escribí que `$cansee` sin
rango debía dar «no» con una posición ilegible, «por simetría». No lo es: con
`ClosestTarget = -1` el motor corta antes de comparar, así que **sin rango la
visibilidad la decide el rayo y nada más** y la distancia no se mira. Pedir
«no» habría sido portar una prudencia mía en vez de la regla.

### 9. Y tres veces lo que falló fue el instrumento

Ninguna de las tres es del juego, y las tres dieron rojos con el juego bien.

1. **La sonda no creaba personaje.** `entrarPorElMenu` **no crea ninguno a
   propósito** y lo dice en su cabecera. Sin personaje, `$cansee` no puede
   contestar y devuelve «0», que desde fuera es idéntico a un fallo del rayo.
   Y se descartó mal: `probe.misiones.bolsa()` devuelve `{oro, objetos, manos}`
   **siempre**, así que `!!bolsa()` es `true` con el personaje a `null`. Esa
   comprobación **viajó de una sesión a otra como un dato fiable y la segunda
   la repitió en vez de comprobarla** — y así dos sesiones gastaron una pasada
   cada una diagnosticando el archivo de la otra.
2. **Vite recargaba la página a mitad de pasada**, porque hay cuatro sesiones
   guardando en el mismo árbol. Una recarga se lleva `window.probe` por
   delante. Y no es sólo una molestia: **una sonda cuya página se recarga a
   mitad está midiendo dos versiones del código**, así que lo que saliera no
   valdría ni verde ni rojo. Se corta el canal `vite-hmr` por su subprotocolo,
   dejando pasar el WebSocket del multijugador.
3. **La consola parte las líneas largas**, y sólo la primera entrada empieza
   por el nombre del NPC. Buscar la frase entre las líneas firmadas no la
   encuentra nunca. El instrumento leía bien y **la unidad de lectura era la
   equivocada**.

Y una cuarta, del método: hice un reemplazo múltiple con **un solo `assert`**,
dos partes casaron, una no, y estuve una vuelta midiendo un bloque de sonda que
no había cambiado. Es el aviso del experimento 80 —comprueba que la rotura está
puesta— incumplido por quien creía estar cumpliéndolo. *Vale para cada parte de
un reemplazo, no para el conjunto.*

### 10. Cómo se comprueba

```bash
npm test                      # 2 033, de las que 32 son de este experimento
npm run sonda:sidra81         # 15 de 15, por el chat y con el teclado
```

> El 15 es lo que se midió en el 82 y se deja escrito. **Desde el 85 son 25**,
> con los nueve pasos de la cadena; ver la corrección del §11.

**Seis roturas deliberadas contra las pruebas y tres contra la sonda viva, las
nueve rojas.** La comprobación de que la rotura estaba puesta cazó dos que no
casaban.

Los controles que importan, porque son los que distinguen «funciona» de
«parece que funciona»:

- **El negativo va PRIMERO, a propósito**: se le dice «cider» a Bryan *antes*
  de hablar con Sylphiel y no sabe nada de ninguna sidra. Medido al final no
  podría fallar, porque el estado ya estaría movido.
- **Se exige la frase de la PRIMERA vuelta**, no que Bryan hable de sidra. Sus
  dos líneas hablan de sidra, y con el contador adelantado desde el nacimiento
  contestaba la de la segunda: un control que sólo pidiera «cider» habría salido
  verde con el fallo puesto. Es el del 65.
- **El estado de Sylphiel se lee sin volver a hablar con ella**, que es lo que
  demuestra que el recado lo llevó Bryan y no el jugador.

### 11. Lo que queda abierto

- **La cadena tiene un cuarto tramo y la sonda mide tres.** Krythos tiene su
  `cider4` y la vuelta con `ciderreward` (`edana/weaponsmith.script:132`
  y `:147`).

  > **MEDIDO EN EL 83, y la corrección va al lado y no encima** (§7). El cuarto
  > tramo **funciona de punta a punta**, tecleando en el chat en una partida de
  > verdad. La cadena entera son **nueve pasos**, no cuatro:
  >
  > | | quién | qué queda |
  > | --- | --- | --- |
  > | 1 | `job` a Sylphiel | `cider_1 0 → 0`, llama a `cider` de Bryan |
  > | 2 | `cider` a Bryan | `cider_1 2`, `cider_2 1` |
  > | 3 | `cider` a Sylphiel | «Thanks for the help», y a los 5 s su `say_reward3` |
  > | 3b | (sola, 5 s) | `cider_1 3`, `cider_2 2`, **oro 10 → 15** |
  > | 4 | `cider` a Sylphiel | «I still haven't gotten that cider shipment» · `cider_1 1` |
  > | 5 | `cider` a Bryan | «head over to Krythos» · **`CIDER` de Krythos 0 → 1** |
  > | 6 | `cider` a Krythos | explica, y a los 3 s su `say_cider2` |
  > | 6b | (solo, 3 s) | `CIDER 99`, y su `callexternal wench ciderreward` |
  > | 7 | (Sylphiel) | **`cider_1 4`, `cider_2 3`** — la misión cerrada |
  >
  > **Esto es una medida, no un control**: `sondas/sidra81.mjs` sigue midiendo
  > hasta el tercero. Se declara pendiente en vez de contarse entre los verdes,
  > que es lo que pide el apartado 4.
  >
  > > **CERRADO EN EL 85, y la corrección va al lado y no encima** (§7). Los
  > > **nueve pasos tienen control**: `sondas/sidra81.mjs` pasa de 15 a **25 de
  > > 25**, con el oro y los contadores de los tres NPC leídos de la partida.
  > > Así que el párrafo de arriba ya no vale, y lo que lo mantenía vivo era que
  > > nadie volviera a leerlo — el `catchspeech` del 79 otra vez, dentro de este
  > > mismo documento.
  > >
  > > Y **la tabla tiene un plazo de menos**, que es lo único que no se deducía
  > > de ella: el paso 3b son **dos relojes encadenados y no uno**. A
  > > `say_reward3` —el del pago, a los 5 s— le sigue un `callevent 2 cider3`
  > > (barwench.script:228), y es ÉSE el que pone `cider_1 3`. O sea que el
  > > estado de la fila tarda unos **siete** segundos y no cinco. Medido: 3 935
  > > ms desde que la sonda deja de teclear, porque sus propias esperas ya se
  > > comen parte. Por eso el control no espera un tiempo sino **a que la
  > > lectura cumpla**, y de paso imprime cuánto ha tardado.
  > >
  > > Lo mismo con el `CIDER` de Bryan en el paso 5: su `callevent 1
  > > say_cider_2` (bryan.script:261) lo pasa a 3 un segundo después, así que su
  > > 2 **no se queda quieto** y se comprueba en el paso 4, no en el 5.
  > >
  > > Y la rotura que lo valida, que es la que pedía el apartado 4: anulando
  > > sólo el `callexternal ciderreward` en `npcguion.js`, **el paso 7 se pone
  > > rojo y los ocho anteriores siguen verdes** (`cider_1 1, cider_2 2` tras
  > > agotar los 20 s). Y rompiendo el marcador a propósito —una caída tras el
  > > primer control— sale **1 de 25** con «23 control(es) no llegaron a
  > > correr», donde antes habría salido «1 de 2»: el 65, que esta sonda no
  > > cumplía hasta hoy.
  >
  > Y dos trampas del instrumento, las dos mías y las dos de la casa:
  > **el oro se lee a los 3 s y `say_reward3` dispara a los 5**, así que la
  > primera lectura dio «oro 10» y estuve a punto de escribir que la misión no
  > paga — el 75, «cuando lo que mides tarda, el umbral mide tu espera». Y
  > Krythos abre su menú con **2 botones** y los otros tres con 4, que parecía
  > una anomalía y no lo es: **no declara `game_menu_getoptions` propio** y los
  > suyos son los de `base_chat`.
- **El apriete de `ClosestTarget`** no está portado, y con dos jugadores se
  nota: `ent_lastseen` debería ser el más cercano. Se mide con dos navegadores.
- **`$cansee(enemy,…)` y `$cansee(ally,…)`** no existen: necesitan la lista de
  enemigos del NPC (`m_hEnemyList`), que este puerto no tiene.
- **`callexternal players`** y el guion del jugador desde un NPC: se apuntan y
  no llegan.
- **La guarda de recursión de `callexternal` no es del motor.** El mod no lleva
  ninguna y dos NPC que se llamen cuelgan el servidor; aquí hay un tope de ocho
  saltos porque una recursión en JavaScript tira la pestaña. Va dicho donde
  vive.
