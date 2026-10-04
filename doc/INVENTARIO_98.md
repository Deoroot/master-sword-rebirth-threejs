# Qué contenedor, cuánto cabe y «Drop Selected» — experimento 98 (parte L)

El 97 dejó tres cosas del inventario dichas y sin hacer (doc/INVENTARIO_97.md §6):

1. **Qué contenedor.** Todo lo suelto se veía en el primero, y
   `FindPackForItem` se portaba sólo para el TEXTO del mensaje.
2. **La capacidad.** `Container_CanAcceptItem` no estaba: todo cabía.
3. **«Drop Selected»** decía que no estaba.

```bash
node --test test/inventario98.test.mjs   # 21 verdes
npm run sonda:inventario98                # 19 de 19, por el menú y con el ratón
```

Y la primera cosa que salió, antes de escribir una línea: **el mensaje que el
97 ponía en pantalla era falso**. «You put Blood Drinker in Heavy Weapon
Holster» lo midieron una prueba y una sonda, y en el juego no pasa: el Heavy
Weapon Holster sólo admite `axes;blunt` (sheath_belt_holster.script:10). El 97
eligió el contenedor por el nombre —la primera mitad de `FindPackForItem`— y
no miró si cabía, que es la segunda mitad. La espada va a la **Back Sword
Sheath**.

## 1. Lo que se leyó antes de escribir

### Lo que declara un contenedor, y lo que no cuenta

`registercontainer` → `CGenericItem::RegisterContainer` (genericitem.cpp:
1699-1700, gipack.cpp:50-77) lee del guion **tres** cosas:

```c
PackData->MaxItems = atof(GetFirstScriptVar("reg.container.maxitem"));        // :63
TokenizeString(GetFirstScriptVar("reg.container.accept_mask"), AcceptItemsTypes); // :69-70
TokenizeString(GetFirstScriptVar("reg.container.reject_mask"), RejectItemsTypes); // :71-72
```

Lo que NO cuenta, y engaña porque está escrito en los 22 guiones:

- **`CONTAINER_SPACE`.** `PackData->Volume = atof(...reg.container.space)` está
  COMENTADO (:57-60). El Small Sack declara `CONTAINER_SPACE 10` y caben **8
  objetos**, que es su `CONTAINER_MAXITEMS`.
- **El peso.** No hay peso por contenedor: `CItemList::CanAddItem` sólo mira si
  el objeto ya está dentro (genitemlist.cpp:4-14). El peso es del jugador
  (`Gear.FilledVolume()`, msmonstershared.cpp:430-433). El `CONTAINER_BOH` de
  la Bag of Holding menor sólo hace que su contenido no pese
  (`Container_Weight`, gipack.cpp:116-118).

`pack_base` (pack_base.script:27-42) pone las tres con `local` dentro de
`game_spawn`, y copia `CONTAINER_ITEM_ACCEPT` a `TRUE_ACCEPT` **sólo si
existe** (`if ( CONTAINER_ITEM_ACCEPT isnot 'CONTAINER_ITEM_ACCEPT' )`, que se
apoya en que una variable sin poner vale su propio nombre, script.cpp:4741);
si no, `''`, que `GetVar` lee como cadena vacía (:4406-4410) y
`TokenizeString` convierte en una lista vacía —«acepta todo», gipack.cpp:289—.
Los trozos van por `;` (stackstring.h:218) con `sscanf("%[^;]")`, que para en
el primer trozo vacío (stackstring.cpp:143-159).

### Si cabe: `Container_CanAcceptItem` (gipack.cpp:247-331), en su orden

1. **El tope** (`MaxItems`, :254; 0 es «sin tope»). Lleno, sólo entra un objeto
   AGRUPABLE que tenga ya un montón del mismo guion dentro —y entonces
   `return true` **sin mirar las máscaras** (:256-285)—.
2. **Las máscaras**, por SUBCADENA del nombre del guion (`strstr`, :299 y
   :315). `reject` que empieza por `all` lo rechaza todo; y si hay `accept`,
   **manda ella**: «This accept overrules a reject» (:308-310).
3. `ItemExists` (genitemlist.cpp:9-11): lo que ya está dentro no cabe. Por eso
   llevar algo al contenedor en el que ya está dice «can't fit».

Y antes, `CanPutInPack`: un hechizo no entra en ninguno (genericitem.cpp:
1231-1240).

### Cuál: `FindPackForItem` (genericitem.cpp:1154-1197)

Primero el que pide el NOMBRE del objeto —`arrow` → un contenedor con «quiver»,
`swords` → «sheath», `blunt`/`axes` → «holster»—, con `GetContainer(subcadena)`
(msmonstershared.cpp:90-96), que devuelve **el primero aunque no quepa**. Si
ése no lo admite, la vuelta: el primero de `Gear` que lo admita.

La trampa, que es la del 97: `sheath_belt_holster` lleva «sheath» en el nombre.
Para una espada, el «primer contenedor con sheath» de un personaje nuevo es el
Heavy Weapon Holster, que no la admite; la espada sale en la vuelta, en la
Back Sword Sheath.

`PutInAnyPack` (playershared.cpp:706-733) añade una cosa: con **un solo**
contenedor no busca, va a él (y `PutInPack` dirá si no cabe).

### Los mensajes

- `PutInPack` que no cabe (playershared.cpp:676-688): **una de dos frases, a
  cara o cruz** (`RANDOM_LONG(0, 1)`), con `SendInfoMsg`:
  «Your Heavy Weapon Holster can't fit that!» o «You try to stuff Training
  Hammer into your Heavy Weapon Holster, but to no avail.». Los hechizos se
  callan. Y falla **antes** de `game_putinpack` (genericitem.cpp:1243-1250).
- «X won't fit into any of your packs» es de `PutInAnyPack` cuando no hay
  ninguno (:726-731). **Por la `q` no se llega a él**: `UseItem` empieza por
  `if (Verbose && !CanPutinInventory()) return false;` (genericitem.cpp:
  991-992), y `CanPutinInventory = CanWearItem() || FindPackForItem()`
  (:1032). Un Tree Bow en la mano de un personaje nuevo —ninguno de sus cuatro
  contenedores lo admite— **no dice nada** al pulsar la `q`.

### Corrección al «doble aviso» del 97

El 97 portó que un chaleco que no se puede vestir dice «You have no more chest
slots» **dos veces** (`CanWearItem` en `CanPutinInventory` y otra en
`WearItem`). Es verdad sólo si **algún contenedor lo admite**: si no,
`CanPutinInventory` es falso y `UseItem` sale entre los dos. Ninguno de los
cuatro contenedores de Veteran admite una armadura (el saco rechaza `armor`,
pack_sack.script:18), así que con Veteran sale **una** vez y el chaleco se
queda en la mano. Con una Heavy Backpack encima, las dos. La prueba del 97 se
ajustó con nota fechada y ahora mide los dos casos.

### «Drop Selected»

`DropAllSelected` (vgui_containerlist.cpp:177-186): un `drop <id>` por cada
objeto elegido y `HideTopMenu`. En el servidor, `drop <id>` → `DropItem(pItem,
false, true)` (client.cpp:932-947), que suelta **de donde esté** —«Items
could be anywhere on the player», playershared.cpp:942— con el mismo tiro que
la `c` (`Drop`, genericitem.cpp:1319-1383). El botón se ve con un objeto
elegido en un contenedor, y no con las manos (vgui_containerlist.cpp:140-150).

## 2. Lo portado, y dónde

- **`src/play/contenedores.js`** (nuevo): `reglaDe`, `cabe`
  (`Container_CanAcceptItem`), `puedeGuardarseEn` (`CanPutInPack`),
  `buscarContenedor` (`FindPackForItem`), `contenedorParaGuardar`
  (`PutInAnyPack`), `noCabeTexto` (las dos frases) y `colocar`.
- **La forma del documento: el campo `en`.** Una entrada de
  `personaje.objetos` que está en un contenedor lleva `en: <clave del
  contenedor>` (su `uid ?? id`), que es el `m_pParentContainer` del motor
  (gipack.cpp:372). Lo puesto y los contenedores no lo llevan. Lo que llega sin
  `en` —un documento de antes del 98, el suelo, la tienda, un `offer`— lo
  coloca `colocar` con la regla de `PutInAnyPack`, en el orden de la lista,
  antes de enseñar el panel y antes de cada orden. Es idempotente.
- **El catálogo** (`src/bsp/script.js`, `reglaDeContenedor`): `ficha.contenedor
  = { maximo, acepta, rechaza, sinPeso }` en los 22 contenedores.
- **El intérprete** (`src/play/guion.js`, `src/play/guionobjeto.js`):
  `registercontainer`, con `GetVar` mirando los `local` del evento. Una prueba
  corre el `game_spawn` de verdad de cada contenedor con guion horneado y
  compara con el catálogo: **16** comparados, iguales (los otros seis —los carcajes, el banco, las dos Bag of Holding y una funda de serpiente— no están en `objetosguion.json`, que hornea «lo que venden las tiendas de los mapas portados más lo que trae un personaje nuevo»).
- **`src/play/equipar.js`**: `guardarEn` mira si cabe y lo dice; `usar` (la
  `q`) pregunta `FindPackForItem` de verdad; `_guardarEnAlguno` con
  `contenedorParaGuardar`; `moverA` nuevo (de un contenedor a otro, `inv
  transfer <id> <c>` con el objeto dentro de uno). `contenedorPara` del 97 se
  queda para su prueba vieja, con nota.
- **`src/main.js`**: el panel enseña lo de cada contenedor por su `en`;
  «Drop Selected» (`soltarDeUnContenedor`, el mismo `Suelo.tirar` que la `c`);
  de un contenedor a otro por `moverA`. `src/vgui/contenedor.js`: tras «Drop
  Selected» el panel se cierra (sólo con las órdenes del 97 puestas: la tienda
  hereda el panel).
- **Red**: `MENSAJE.SOLTAR { id, desde: "mochila" }` (`cliente.soltarArma(id,
  "mochila")`, `Partida._soltar`): el servidor quita una unidad de una entrada
  de SU lista que no esté puesta ni sea un contenedor. Sin `desde`, lo de la
  mano, como en el 97.
- **`window.probe.inventario98`**, sólo lectura: `enCada`, `entradas`,
  `ultimoSoltado`.

### Un fallo del horneado que salió por el camino: `groupable <n>`

La excepción del tope es para los agrupables, y **el catálogo decía que no
había ninguno**: `apilable` salía `false` en los 760 objetos —lo apuntaba
src/play/tienda.js como un hecho («hoy da igual, porque `apilable` sale false
en los 760 objetos»)—. `groupable` pide un número (genericitem.cpp:1846-1863:
sin él es `ERROR_MISSING_PARMS`, con 0 borra la marca, con otro la pone y es
`m_MaxGroupable`), y los 64 guiones que lo escriben ponen `groupable 25` o
`groupable 100`. El lector sólo casaba la palabra SOLA. Ahora son **88**
agrupables (las flechas, los virotes, las ganzúas…) con `apilableHasta`. El
valor de reposo —«no se apila»— era plausible y por eso nadie lo miró.

**Y otra cosa del horneado, que no es mía pero se vio:** `build/msr/objetos.json`
estaba horneado con un lector anterior al arreglo de los `#include` del 82:
**25 fichas con `faltan: ["", ""]`** y sin herencia. Rehornear las arregla y
cambia cuatro de «trasto» a «armadura» (armor_belmont y otras) y una a
«proyectil». Las pruebas siguieron verdes; quien lea un `tipo` de esas cinco
lo encontrará cambiado.

## 3. Lo medido

### El censo: dónde cae cada objeto del catálogo

Con un personaje nuevo (los cuatro contenedores de `reg.newchar.freeitems`,
global.script:29, vacíos), cada uno de los 738 objetos que no son contenedor,
solo, por `FindPackForItem`:

| contenedor | objetos |
| --- | --- |
| Small Sack | 348 |
| Heavy Weapon Holster | 119 |
| Back Sword Sheath | 85 |
| Dagger Sheath | 48 |
| **ninguno** | **138** |

Los 138 son las 55 armaduras (el saco rechaza `armor`), los 31 hechizos
(`CanPutInPack`), las flechas (sin carcaj y el saco rechaza `arrow`), los
arcos y los escudos. Un detalle del saco: rechaza `bolts` y no `bolt`, así que
un virote (`proj_bolt_wooden`) **sí** entra; está en la prueba.

Y lo que admite cada uno de los 22, vacío y sin tope (de 707 que no son
hechizo): Heavy Backpack 661, Bag of Holding menor 639, Small Sack 396, Big
Sack 349, Weapons Strap 281, las tres fundas de hacha/maza 119, Back Sword
Sheath 85, Snakeskin Hammer 71, las de espada de una 70, Quiver of the Archer
64, las de daga 48, Spellbook 32, Quiver for Arrows 21, Quiver of Bolts 14,
**Bag of Holding 0** (`reject all`, «this item should be unobtainable»). El
`pack_bank` admite 666.

### Las armas de partida con la `q` (test/inventario98.test.mjs)

| arma | va a | por |
| --- | --- | --- |
| Rusty Short Sword | Back Sword Sheath | `swords` pide «sheath», el primero es el Holster y no la admite; vuelta |
| Rusted Axe, Training Hammer | Heavy Weapon Holster | `axes`/`blunt` piden «holster» |
| Dull Knife | Dagger Sheath | sin nombre; la vuelta |
| Quarterstaff | Back Sword Sheath | sin nombre; `swords;polearms` |
| Tree Bow | ninguno, y **se calla** | `CanPutinInventory` falso |

### Veteran

Colocado: el Dragon Axe en el Heavy Weapon Holster, la Fire Blade en la Dagger
Sheath, y **el Phoenix Bow sin sitio**: ningún contenedor de Veteran admite un
arco. En el juego Veteran no podría existir así —el arco estaría en una mano o
en el suelo—; es la herramienta del 96 la que lo pone en la lista. Se sigue
viendo en el primer contenedor (como hasta el 97) para que se pueda sacar.

### La sonda: `npm run sonda:inventario98`, 19 de 19

Fabrica «Inventario98» con `tools/personaje.mjs` (su carpeta,
`build/partidas/inventario98`, y su puerto, 5498) y le añade al documento
exportado la Rusted Axe y el Training Hammer, para poder LLENAR el Heavy Weapon
Holster. Entra por el menú en sala88 y juega con la `i`, el ratón, el botón y
la `q`:

- **cada contenedor con lo suyo**, leído del panel: las dos hachas en el
  Holster, la Fire Blade sola en la Dagger Sheath, la de espalda y el saco
  «No items»; en el documento, el Holster con DOS y el martillo sin sitio;
- la `q`: «You put Blood Drinker in Back Sword Sheath», y **no** «…in Heavy
  Weapon Holster» (el negativo);
- el martillo a la mano con doble clic; al Small Sack **no cabe por la
  máscara** (vacío, rechaza `blunt`); al Holster **no cabe por el tope** (lo
  admite y está lleno); sigue en la mano;
- «Drop Selected» con el Dragon Axe: el botón dice «Drop Selected» sólo con
  algo elegido («Remove» sin), el hacha sale de la lista (`de` el Holster), hay
  un `axes_dragon` nuevo en el suelo, tirado, y el panel se cierra;
- **el control positivo del tope**: con el hueco que dejó el hacha, el MISMO
  gesto mete el martillo: «You put Training Hammer in Heavy Weapon Holster».

Las dos frases del «no cabe» salieron las dos a lo largo de las pasadas, que es
el sorteo del motor; la sonda acepta cualquiera de las dos.

## 4. Roturas deliberadas

Con un guion que comprueba que el texto casa UNA vez, que la rotura está
puesta, corre, y la deshace sobre el archivo de ese momento:

| rotura | Node (inventario98 + inventario97) | sonda inventario98 |
| --- | --- | --- |
| sin tope (`if (false && r.maximo)`) | 3 rojas | **la primera versión: 18 de 18 VERDE**; la de ahora, 15 de 19 (2d, 4c, 4d, 6) |
| `FindPackForItem` sin mirar si cabe el pedido | 8 rojas | 11 de 19 |
| «Drop Selected» desconectado (main.js) | — | 16 de 19 (5b, 5c, 6) |
| el servidor ignora `desde: "mochila"` | 1 roja | — |
| `registercontainer` sin los `local` del evento | 1 roja (la comparación con el catálogo) | — |
| sin la excepción del agrupable | 1 roja | — |

**El verde vacío de la primera sonda**, el §4 otra vez, y en su forma del 75 —
*un control puede acertar el mecanismo y mentir sobre el caso*—: medía el tope
llevando el Dragon Axe a la Back Sword Sheath llena. Con el tope roto **siguió
verde**, porque esa funda rechaza las hachas por su MÁSCARA (`swords;
polearms`): el «no cabe» salía, pero por la otra regla. Lo cazó la rotura. Para
medir el tope sin la máscara hace falta un contenedor que ADMITA el objeto y
esté lleno, y Veteran no tiene dos objetos de ninguna familia; por eso la
sonda le añade dos armas al documento.

**Tres tropiezos de la propia sonda**, para el cuaderno:

1. Leía «ninguna línea nueva» con la frase en pantalla: cortaba la consola por
   su longitud, y la consola guarda las últimas N (no crece). Ahora se cuentan
   las frases antes y después.
2. Y luego seguía sin verla: **la consola parte las líneas largas** («…but to»
   | «no avail.»). Es exactamente el 81. Se cuenta en el bloque unido.
3. El panel se vuelve a abrir con la última entrada elegida, no con las manos
   (el 97 lo daba por hecho en un comentario). La sonda buscó el objeto en la
   lista de la funda, no lo encontró, **no pulsó nada**, y el clic en la otra
   funda sólo la eligió. Ahora elige las manos con el ratón y exige haber
   pulsado.

## 5. Las pruebas y sondas de otras sesiones que dependían de la forma vieja

Ajustadas con nota fechada (CORRECCIÓN DEL 98), porque el motor les quita la
razón:

- `test/inventario97.test.mjs` — «…in Heavy Weapon Holster» → «…in Back Sword
  Sheath»; el doble clic desde un contenedor se mide con la Fire Blade (el
  fénix no cabe en ninguno: ahora se comprueba que lo dice); el chaleco, los
  dos casos del doble aviso.
- `test/juego_misiones.test.mjs` — la cuenta de comandos, +1
  (`registercontainer`).
- `sondas/inventario97.mjs` — 3c y la sección 5 (el fénix no cabe en la
  funda; el doble clic en el contenedor, con el Dragon Axe).
- `sondas/personaje96.mjs` — A6/B5 leían sólo el primer contenedor; ahora los
  cuatro.

Vecinas: `personaje96` 16 de 16, `armadura96` 16 de 16, `inventario97` (ver
el informe de integración).

## 6. Lo que NO está

- **Coger va primero a la MANO.** `GetAnyItems` → `GiveTo(this)` →
  `NewItemHand`, y sólo con las manos llenas `PutInAnyPack`
  (genericitem.cpp:908-923, player.cpp:5221). Este puerto sigue metiendo lo
  cogido en la lista (el 71); desde el 98, en el contenedor que el motor
  elegiría con las manos llenas. Y si no cabe en ninguno, el motor lo deja en
  el suelo con «won't fit»; aquí entra sin sitio.
- **Elegir VARIOS.** El panel elige de uno en uno (el 97); el original deja
  marcar varios y «Drop Selected» los suelta todos.
- **El «You drop …»**: lo pone `Suelo.tirar`, con la `c` y con «Drop
  Selected». En `DropItem` está detrás de `bDropAttempted`
  (playershared.cpp:960), que al llegar vale falso —lo baja `Drop` al acabar,
  genericitem.cpp:1369, y lo que lo subía entre dos pulsaciones está
  comentado, :1512-1525—. Si es así, en el juego soltar NO dice nada. Sin
  medir en el juego; es del 75 y de la `c`, no se ha tocado.
- **Quitarse un contenedor** («Removing a container is not in this port
  yet»), **partir un montón** (`inv split`) y **abrir/cerrar/candado**
  (`canclose`, `lock_str`: se leen en el motor y ningún contenedor del jugador
  los usa).
- **Los montones de lo que no es agrupable**: el suelo de este puerto apila
  todo (`cogerDelSuelo`); en un contenedor ocupan `n` plazas y entran enteros o
  no.
- **Con servidor, el `en` no viaja.** El servidor no reparte: sólo quita lo
  soltado de su lista. Sin sonda con dos navegadores para «Drop Selected» con
  red; lo cubren dos pruebas de Node que entran por `Partida.recibir` y por el
  `ClienteDeRed` de verdad.
