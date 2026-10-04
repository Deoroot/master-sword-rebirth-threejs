# El inventario mueve cosas — experimento 97 (parte F)

Dos fallos del inventario que el 96 dejó escritos:

1. **El panel no ponía ni quitaba ropa.** La armadura del fénix sólo se la ponía
   `probe.armadura.vestir`, o venía puesta de fábrica (`tools/personaje.mjs`).
2. **El arma de partida estaba duplicada.** `crearPersonaje` la metía en
   `objetos` Y en `manos.derecha`; al cambiar de arma `cumplir` devolvía la vieja
   a la mochila y quedaban dos `swords_rsword`, y el ciclador (que busca por id)
   no llegaba a la tercera arma.

```bash
node --test test/inventario97.test.mjs   # 19 verdes
npm run sonda:inventario97                # Veteran en sala88, por el menú
```

## 1. Lo que se leyó antes de escribir

### No hay un botón de «ponerse»

Es lo primero que no se adivina. El panel del inventario de Master Sword manda
**tres** comandos al servidor y ninguno es «ponte esto»:

| gesto en el panel | comando | dónde |
| --- | --- | --- |
| «Remove» sin objeto elegido, o doble clic en una pieza de la columna | `remove <id>` | vgui_containerlist.cpp:110-121, :170-175, :329-341 |
| doble clic en un objeto de un contenedor | `inv transfer <id> 0` | :199-221 |
| elegir un objeto y pulsar una entrada de la columna | `inv transfer <id> <contenedor>` (0 = las manos) | :288-327 |
| «Drop Selected» con objetos elegidos | `drop <id>` | :177-186 |

Y en el servidor (client.cpp):

- `remove <id>` → `GiveTo(pPlayer, true, false)` y `game_removepack` (:999-1007).
- `inv transfer <id> 0` → `GiveTo(pPlayer, true, false, true)` —el último
  `true` es `fPutItemsAway`, «libera las manos»— y `removefrompack` («old») y
  `game_removefrompack` (:1303-1324).
- `inv transfer <id> <c>` → `PutInPack` (:1309-1316).

O sea que el panel sólo sabe **traer a la mano** y **guardar**. Ponerse la
armadura es la tecla `q`: `bind "q" "use"` (config.cfg:25), descrita como
«Sheath/store/wear weapon/item» (kb_act.lst:40), que es `UseItem` de la mano
activa (client.cpp:979-997, playershared.cpp:735-806) → `CGenericItem::UseItem`
(genericitem.cpp:973-1003): **si se puede vestir, se viste; si no, se guarda**
(«MiB Jul2008a - If a wearable item can't be worn, try to put it in a pack»).
La `q` estaba en la tabla de teclas de este puerto desde el 24 y no la leía
nadie, como la `x` hasta el 71.

### `game_remove` no lo llama nadie

Las armaduras declaran `game_remove` (base_effect_armor.script:13,
base_elemental_resist.script:50) para quitarse el efecto. **El motor no lo
dispara en ningún sitio**: `grep` de `"game_remove` en el código del mod da
sólo `game_removepack`, `game_removefrompack` y `game_removefromowner`. Lo que
de verdad apaga una armadura al quitártela es su **`game_deploy`**: `remove`
la trae a la mano, `AddItem` hace `SwitchHands` a esa mano
(msmonstershared.cpp:357-360) y eso es `Deploy` → `game_deploy`
(playershared.cpp:1266-1272, genericitem.cpp:683), que en la plantilla es
`callevent 0.1 barmor_effect_remove` (base_effect_armor.script:22-24) y
`elm_remove_effect` (base_elemental_resist.script:59-62). Así se porta: no se
llama a `game_remove`.

### El orden de cada orden

`remove <id>` / `inv transfer <id> 0`:

1. `NewItemHand` decide la mano (playershared.cpp:371-500). Una armadura es
   `ANY_HAND` y **mira primero la izquierda** («Check left hand first»,
   :405-411). Con un arma a dos manos en la mano no cabe nada: sin
   `fPutItemsAway` (`remove`) sale «You can't get Armor of the Phoenix because
   your hands are full!»; con él (`inv transfer`) guarda lo que estorba con
   `PutAway` → `UseItem` y la pone en la mano **0, la izquierda**, sea cual
   sea la que se liberó (`iAddHand = 0`, :486-487).
2. `RemoveFromOwner`: `game_removefromowner` y `m_Location = ITEMPOS_HANDS`
   (genericitem.cpp:1548, :1556). Desde aquí **ya no está puesta**.
3. `AddItem`: `game_newowner`, `game_pickup` (msmonstershared.cpp:351-355),
   `SwitchHands` → `game_deploy`.
4. `game_removepack` (remove) o `removefrompack` + `game_removefrompack`.

`use` (la `q`):

- con la mano vacía no pasa nada (playershared.cpp:793-806);
- `if (Verbose && !CanPutinInventory()) return false;` con
  `CanPutinInventory = CanWearItem() || FindPackForItem()` (genericitem.cpp:
  991-992, :1026-1033);
- si es vestible, `WearItem`: `CanWearItem`, `game_wear` con «CGenericItem::
  WearItem», `ITEMPOS_BODY` y, si era lo activo, `SwitchToBestHand`
  (:1123-1145) — eso ya estaba en `vestir` de src/play/armadura.js (el 96);
- si no, `PutInAnyPack` (playershared.cpp:706-733) → `PutInPack`: primero
  `game_putinpack` («AUG2010_28 call BEFORE we actually remove the item»,
  genericitem.cpp:1249-1250), luego `RemoveItem` → `game_removefromowner`, y el
  mensaje «You put Blood Drinker in Heavy Weapon Holster» (`SendInfoMsg`,
  playershared.cpp:692-695). El contenedor lo elige `FindPackForItem` por el
  NOMBRE: `swords` busca una funda, `blunt`/`axes` una pistolera, `arrow` un
  carcaj (genericitem.cpp:1154-1201); el primer contenedor cuyo id contiene
  «sheath» es `sheath_belt_holster`, el Heavy Weapon Holster.

**Un fallo del original que se porta: el aviso sale DOS veces.** `CanWearItem`
es verboso en el servidor siempre (`#ifdef VALVE_DLL true`, genericitem.cpp:
1040-1045), y `UseItem` lo llama dos veces: en `CanPutinInventory` y otra vez
en `WearItem`. Con el fénix puesto, la `q` sobre un chaleco de cuero dice «You
have no more chest slots» dos veces y luego «You put Leather Vest in Heavy
Weapon Holster».

**Sonidos**: ninguno. Las tres órdenes llaman a `GiveTo(..., fSound = false)`
(client.cpp:1003, :1320) y el `EMIT_SOUND` de `gunpickup2.wav` está detrás de
ese `fSound` (genericitem.cpp:951-952).

### La columna del equipo

`AddInventoryItems` (vgui_container.cpp:413-470): «Player Hands» con lo de las
dos manos, luego los **contenedores** y luego **lo demás de `Gear` que no esté
en la mano** —o sea lo puesto: la armadura, el yelmo—, éstos en gris
(`Color_GearNonContainer`). Este puerto enseñaba lo puesto DENTRO del primer
contenedor; desde el 97 va en la columna, y al elegirlo el subtítulo dice
«Remove wearable item» (vgui_containerlist.cpp:160-161), que ya estaba portado.

El doble clic es el del motor: el mismo botón sobre lo mismo antes de
`ms_doubleclicktime` = 0,5 s (clientlibrary.cpp:174, vgui_mscontrols.h:
388-404), y en un objeto **sólo si ya estaba elegido** (vgui_mscontrols.cpp:
331): el primer clic lo elige y un clic lento sobre el elegido lo deselecciona
(`Select(!m_Selected)`, :519-523).

### El arma de partida

`CreateChar` (sv_character.cpp:84-97) da el arma con
`AddItem(pStartingItem, true, true)`: **a la mano, y a ningún otro sitio**. En
el motor cada objeto es una entidad con UN sitio (`m_Location`, genericitem.h:
24-28; `IsWorn()` = `m_Location > ITEMPOS_HANDS`, :261) y el fichero lo escribe
una vez con su `Location` y su `Hand` (sv_character.cpp:615-623, `ReadItem`
:413-419). El peso es el de todo el `Gear`, manos incluidas
(`Gear.FilledVolume()`, msmonstershared.cpp:430-433).

En este puerto casi todo el código ya lo leía así —`cumplir` saca de la mochila
lo que empuña, `Partida._empunar` igual, `soltarDelInventario` dice «lo
empuñado ya no está en `personaje.objetos`», `inventarioEnOrden` cuenta las
manos aparte—, y sólo `crearPersonaje`, `tools/personaje.mjs`, el panel (que
buscaba las manos DENTRO de `objetos`) y el peso lo leían como «en los dos
sitios». Se arregla lo que estaba fuera de la regla, no la regla.

## 2. Lo portado, y dónde

- **`src/play/equipar.js`** (nuevo) — la clase `Equipo`: `manoPara`
  (`NewItemHand`, con su «iAddHand = 0»), `aLaMano(id, "remove"|"transfer")`
  (`GiveTo` y lo que cada comando hace después), `usar(mano)` (`UseItem`, con
  el doble aviso), `guardarEn(mano, contenedor)` (`PutInPack`) y la mano
  activa (`m_CurrentHand`, que cambia con `SwitchHands` y `SwitchToBestHand`).
  Lleva un `diario` con los eventos en el orden en que corrieron.
- **`src/juego/personaje.js`** — `VERSION = 2`. `crearPersonaje` ya no mete el
  arma en `objetos`. `abrirPersonaje` abre un documento de la 1 quitando UNA
  copia de lo que haya en cada mano, y lo dice en los avisos. `loQueLleva(p)`:
  la lista y las manos, cada cosa una vez — es lo que hay que pedir para el
  peso y para los guiones de objeto.
- **`src/vgui/contenedor.js`** — doble clic, selección que se alterna, clic en
  la columna con un objeto elegido, y «Remove» sobre una pieza puesta. Todo
  opcional: sin las tres funciones nuevas el panel es el de antes, que es el
  que hereda la tienda.
- **`src/main.js`** — la columna enseña lo puesto; las manos salen de `manos`;
  el peso y `sincronizarObjetosVivos` usan `loQueLleva` (la mano también tiene
  guion, y la clave es la misma en la mano y en la mochila, así que moverlo no
  lo vuelve a nacer); la `q`; `moverEquipo` (empuña o embraza lo que haya
  cambiado de mano, avisa a la red); y `cumplir` saca UNA copia de la lista, no
  todas las que se llamen igual.
- **El peso, en los tres sitios que lo calculan** —`vitalesDelPersonaje` y el
  panel (main.js), la pantalla suplente (src/juego/interfaz.js) y **el
  servidor** (`src/red/andar.js`)— con `loQueLleva`. Si el navegador contara
  la mano y el servidor no, andarían a velocidades distintas.
- **`tools/personaje.mjs`** — la Blood Drinker sólo en la mano; el peso con
  `loQueLleva` (sigue saliendo 422 de 1 050).
- **Red (mensaje nuevo, mínimo): `MENSAJE.VESTIR { id, puesto }`**
  (src/red/protocolo.js, `cliente.vestir`, `Partida._vestir`). El servidor
  sólo cambia la marca `puesto` de una entrada que SU sesión tiene en
  `objetos` y que el catálogo dice que se viste. El paso por la mano no viaja:
  al servidor sólo se le manda `EMPUNAR` con un arma (o la mano vacía) y
  `embrazar` con un escudo, porque una armadura de paso por la mano la sacaría
  de la mochila del servidor y `VESTIR` ya no la encontraría. **Es lo que
  necesita quien porte la defensa con servidor** para saber qué está puesto.
- **`window.probe.inventario97`** — sólo lectura: la última orden con su
  diario, la mano activa, las manos, lo puesto.

## 3. Lo medido

**`test/inventario97.test.mjs`, 19 verdes.** El personaje sale de
`crearPersonaje` o de `fabricar()` de la herramienta de verdad; los objetos se
montan como `sincronizarObjetosVivos` (uno por cada cosa de `loQueLleva`, con
su guion horneado y el `GuionDelJugador` de dueño); el efecto se mide por
`defensaDelJugador`, que es lo que llama `golpear`, y por la resistencia al
fuego que escribe el guion del jugador.

| caso | resultado |
| --- | --- |
| Veteran tal cual llega | golpe de 10 → 4,5 (fénix puesto) |
| «Remove» con la Blood Drinker en la mano | «You can't get Armor of the Phoenix because your hands are full!», sigue 4,5 |
| `q` con la Blood Drinker | «You put Blood Drinker in Heavy Weapon Holster»; `game_putinpack` antes que `game_removefromowner` |
| «Remove» con la mano libre | a la IZQUIERDA, mano activa la izquierda, diario `removefromowner, newowner, pickup, deploy, removepack`; golpe 10 → 10 |
| fuego, puesta / quitada | 10 → 2,5 / 10 → 10 (su `game_deploy` borra el elemento) |
| `q` con el fénix en la mano | `game_wear`, a la lista con `puesto`, 10 → 4,5, «Your resistance to fire is now 75%» |
| doble clic desde la funda con la espada en la mano | guarda la espada, el fénix a la izquierda, termina en `removefrompack, game_removefrompack` |
| chaleco de cuero con el fénix puesto | «You have no more chest slots» ×2, a la funda, sigue 4,5 |
| documento de la versión 1 recién creado | sale con una sola espada, y un aviso |
| documento de la versión 1 que ya cambió de arma | no pierde nada |
| el ciclador con la lista de la versión 1 | `swords_rsword → swords_rsword → (nada)`: la tercera inalcanzable; con la de la 2, llega |

**`npm run sonda:inventario97`, 25 de 25.** Fabrica «Sonda97» con
`tools/personaje.mjs`, entra por el menú en sala88 con `?personaje=sonda97`,
elige la ranura con el ratón y juega con la `i`, clics y dobles clics en el
panel, la `q` y la tecla 1. El probe sólo LEE (`probe.inventario97`,
`probe.armadura.puestos`, la consola, la vida).

- la forma: la Blood Drinker en la mano y ninguna en la lista; el fénix y el
  yelmo puestos y vivos; en la columna «Player Hands · Heavy Weapon Holster ·
  Back Sword Sheath · Dagger Sheath · Small Sack · Armor of the Phoenix ·
  Helmet of Stability», los dos últimos en `rgb(160, 160, 160)`;
- «Remove» con la espada a dos manos: «You can't get Armor of the Phoenix
  because your hands are full!», sigue puesta, el panel se cierra; la `q`:
  «You put Blood Drinker in Heavy Weapon Holster»;
- **la rata**: con el fénix 0,2 en la consola y **0,18** de vida por mordisco
  (×3); «Remove» → a la izquierda, diario en el orden del motor; sin él **0,4**
  (×3); la `q` → `game_wear` → otra vez **0,18** (×3);
- elegirlo en las manos y pulsar la funda: «You put Armor of the Phoenix in
  Heavy Weapon Holster», el panel sigue abierto y la pieza no está registrada;
  doble clic en la funda: a la izquierda, `removefrompack, game_removefrompack`,
  el panel se cierra; la `q` lo pone; doble clic en el yelmo de la columna: a
  la mano; la `q` lo pone;
- la tecla 1 (con puntero, tecla y clic): ofrece `axes_dragon → bows_firebird →
  smallarms_k_fire → swords_blood_drinker` y empuña las cuatro; al final cada
  una está UNA vez, y la armadura y el yelmo siguen puestos.

**Roturas deliberadas de la sonda** (con un guion que comprueba que el texto
casa, lo pone, corre la sonda y lo deshace SOBRE el archivo de ese momento —
`src/main.js` lo editan otras sesiones a la vez y restaurar la copia de antes
les borraría el trabajo):

| rotura | resultado |
| --- | --- |
| el doble clic del contenedor no llama a `sacar` (main.js) | 22 de 25: 5d, 5e, 6c |
| la `q` desconectada (main.js) | **13 de 25 la primera vez, y tres verdes eran vacíos** (abajo); con el arreglo, 10 de 25 |
| la herramienta vuelve a meter la Blood Drinker en la lista | 23 de 25: 1b y 6b. **La 6 (la tecla 1 llega a las cuatro) siguió verde**, y es correcto: con el orden de la lista de Veteran el duplicado queda DETRÁS de las demás y no tapa ninguna. El caso que sí tapa —`rsword, rsword, …`— lo mide la prueba de Node |

**El verde vacío que salió por el camino**, el del §4 otra vez: con la `q`
desconectada, «4e. la `q` se lo PONE», «5e» y «5g» siguieron verdes. Pedían
«está puesta y la mano vacía», y con la `q` rota la armadura **no se había
quitado nunca** («Remove» fallaba por las manos llenas, porque la `q` no había
guardado la espada): el valor de reposo pasaba el control. Ahora piden que la
pieza estuviera antes en la mano y que la última orden sea SU `game_wear`.

**Tres tropiezos de la propia sonda**, para el cuaderno:

1. «sin el fénix» salió una vez con una pérdida de **−0,18**: la vida de
   Veteran se regenera (el 64) y un tic cayó en la misma lectura que un
   mordisco. Se compara la consola (`0.4 damage.`) y la MEDIANA de la vida.
2. El doble clic en la funda «no hacía nada»: la sonda volvía a pulsar la
   entrada de la funda **menos de 0,5 s** después del clic que había llevado
   la armadura a ella, y eso ES un doble clic en un contenedor puesto, o sea
   `remove` del contenedor (vgui_containerlist.cpp:329-341). El panel contestó
   lo que debía («Removing a container is not in this port yet.»). Se espera
   0,8 s.
3. Y después siguió sin hacer nada porque **el fénix estaba por debajo del
   panel**: la funda tiene cinco objetos con su icono de 128 y la sonda pulsaba
   fuera. Se baja la lista antes de leer la posición.

## 4. Roturas deliberadas

Cada una aplicada por un guion que comprueba que el texto casaba UNA vez y que
el reemplazo está puesto, y que lo deshace en un `finally`:

| rotura | qué se puso rojo (de las 17 de antes de las dos de servidor) |
| --- | --- |
| `crearPersonaje` vuelve a meter el arma en `objetos` | 4 |
| sin la migración de la versión 1 | 1 |
| `remove` libera las manos como `inv transfer` | 1 («hands are full») |
| `game_putinpack` DESPUÉS de soltarlo | 1 |
| sacar a la mano sin borrar `puesto` de la entidad | 2 (sigue protegiendo en la mano) |
| `CanWearItem` callado la primera vez | 1 (el doble aviso) |
| `ANY_HAND` mira primero la derecha | 2 |

**Un tropiezo con la propia herramienta de romper**, que es el 80 otra vez: la
primera versión del guion de roturas leía la salida de `node --test` con la
codificación de Windows, reventó al decodificar una «É» DESPUÉS de aplicar la
primera rotura y antes de deshacerla, y **dejó `crearPersonaje` roto en el
árbol** (`npm test` daba 4 rojos). Se vio porque el guion no llegó a imprimir
nada y se comprobó con `grep`. Ahora deshace en un `finally`.

## 5. Las pruebas de otras sesiones que dependían de la forma vieja

Ajustadas con nota fechada, porque el motor les quita la razón
(sv_character.cpp:94-96):

- `test/juego_personaje.test.mjs` — «se crea con lo que dice el archivo»
  pedía 3 objetos («dos gratis y el arma»): ahora 2.
- `test/juego_misiones.test.mjs` — el personaje «del 32» es de la versión 1 y
  trae la espada en los dos sitios: al abrirlo queda sólo en la mano.
- `test/personaje96.test.mjs` — las dos que comparaban `objetos` con los seis
  de `OBJETOS`: ahora sin la Blood Drinker, y la mano aparte.
- `sondas/personaje96.mjs` — A6/B5 buscaban la armadura y el casco DENTRO del
  contenedor (ahora están en la columna) y B3 contaba 10 objetos (ahora 9 y la
  espada en la mano).

### Las sondas vecinas, después

`personaje96` 16 de 16 (con A6/B3/B5 ajustados), `armadura96` 16 de 16,
`inventario31` 20 de 20, `personaje30` 18 de 18, `armas96` **33 de 33 en la
última pasada** — y dos pasadas antes con 32 de 33: «fuera de su ventana < 1 %»
de la Novablade leyó 5,4 % y 5,8 %. Con el peso de la mano quitado a propósito
salió 0,0 % una vez, y con el código del 97 tal cual, 0,0 % en la pasada
siguiente. No está atribuido: tres pasadas no separan «el peso de la mano
cuenta» (que en un personaje nuevo con la Novablade y la Ice Blade pasa de 84 a
159 sobre 75) del ruido de otras sesiones tocando la pantalla a la vez. Si
vuelve a salir, empezar por ahí.

## 6. Lo que NO está

- **Qué contenedor.** Este puerto no reparte objetos entre contenedores: lo
  suelto se ve en el primero. `FindPackForItem` se porta sólo para el texto del
  mensaje, y `Container_CanAcceptItem` (capacidad, tipos) no: todo cabe. Llevar
  algo de un contenedor a otro no hace nada; quitarse un contenedor dice que
  no está.
- **«Drop Selected»** sigue diciendo que no está; la `c` suelta lo de la mano
  derecha (el 71).
- **Partir un montón** (clic derecho, `inv split`).
- **La mano izquierda y el escudo.** Una armadura sacada a la mano va a la
  IZQUIERDA, como en el motor, que en este puerto es la del escudo
  (`embrazar`). Si llevabas escudo, el motor lo guardaría al sacar la armadura
  con `inv transfer` (o diría «hands are full» con `remove`); aquí la regla es
  la misma, pero el escudo de la tecla B es un andamio que no está en la lista.
- **Los contenedores no están `puesto`.** `CreateChar` los VISTE
  (sv_character.cpp:56-70) y aquí van en la lista sin la marca: no ocupan sus
  plazas (`belt`, `back`) en `CanWearItem`. Ninguna armadura del juego pide
  esas plazas.
- **Los hechizos** de la mano (`UseItem` los suelta) y `game_equipped` /
  `game_switchhands`, que son eventos del jugador y del arma de la otra mano.
- **`MENSAJE.VESTIR` sin sonda con servidor.** Dos pruebas de Node entran por
  `CREAR`/`ELEGIR` como el cliente (el arma de partida sólo en la mano; la marca
  se pone y se quita; lo que no lleva o no se viste da `FALLO`; rota la
  comprobación de `vestible`, 1 rojo). El servidor sólo cambia la marca: la
  defensa con servidor (otra sesión, el 97) es quien la tiene que leer.
