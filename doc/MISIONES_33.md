# 33 · Las misiones

**La misión del alcalde de Gate City se puede hacer y terminar.** La sonda se
planta delante de él, pulsa la **F**, teclea el **4**, y la cabeza del jefe
goblin sale del inventario y entran cincuenta y tantas monedas de oro. Después
la opción desaparece. **23 controles de navegador y 88 pruebas de Node, todo en
verde**, con el juego en 911 pruebas y el resto de sondas sin tocar.

Y una cifra, que es el resultado de verdad del experimento:

| de los **139** scripts con `game_menu_getoptions` | |
| --- | --- |
| el **menú** se construye entero con lo portado | **65** (46,8 %) |
| **al menos una opción** se puede elegir de principio a fin | **73** (52,5 %) |
| el **NPC entero**: el menú y **todas** sus opciones | **7** (5,0 %) |

O sea: **la puerta que se abre es de una misión y pico, no de ciento cuarenta**,
y §6 dice exactamente qué haría falta para ensancharla.

---

## 1. Qué se ha portado

Lo que faltaba era `CMSMonster::UseMenuOption` (`msmonsterserver.cpp:2914-3037`),
pero portarla sola no habría servido de nada: recibe un índice sobre una lista
de opciones que en el 29 salía de leer los scripts con expresiones regulares, y
al final llama a una **retrollamada**, que es un evento de script. Sin ejecutar
scripts, `UseMenuOption` cobra y no pasa nada más.

Así que hay cuatro piezas:

| | |
| --- | --- |
| `src/play/guion.js` | el intérprete: análisis, variables, eventos, condicionales, `$getters`. **22 comandos de los 223** del motor y **7 getters** |
| `src/play/misiones.js` | `quest set/unset/dump/clear` y `$get_quest_data`: la lista que se guarda con el personaje |
| `src/play/usaropcion.js` | `UseMenuOption` entera, con sus rarezas |
| `src/play/npcguion.js` | el pegamento: el guion de un NPC conectado al juego, y el reloj de los `calleventtimed` |
| `tools/guiones.mjs` | hornea `build/gatecity/guiones.json` **y hace el censo** |

Lo que **no** se ha portado es el intérprete: 14 000 líneas entre `script.cpp`
(6 242) y `scriptcmds.cpp` (7 705). Lo que hay es el subconjunto que las
retrollamadas del alcalde necesitan, listado a mano en `COMANDOS` y `GETTERS`
de `guion.js`, con una prueba que se cae si alguien lo agranda sin volver a
medir la cobertura.

---

## 2. Las tres cosas del encargo, comprobadas

### El orden raro del pago: el objeto corta, el oro no

```cpp
if ((signed)FoundItems.size() < Amount) {
    if (!MenuOption.SilentPayment)
        pPlayer->SendEventMsg(HUDEVENT_UNABLE, msstring("You can't afford the payment of ") + ItemDispName);
    PlayerCanPay = false;
    break;                                    // <- CORTA
}
...                                           // fuera del bucle
int PlayerGold = pPlayer->m_Gold;
if (PlayerGold < TotalGold) {
    ... + TotalGold + " Gold");
    PlayerCanPay = false;                     // <- y NO corta
}
                                              msmonsterserver.cpp:2986-3007
```

Portado tal cual. **Si te faltan las dos cosas, el mensaje que ves es el del
objeto y del oro no te enteras**, y hay una prueba que lo dice con ese nombre.
También está portado el `break` en su segundo efecto, menos obvio: el trozo de
pago que va **detrás** del que falló ni se mira.

### `SUB_Remove()` y no `RemoveItem()`

La pregunta del encargo era si eso deja el objeto en la lista del inventario un
instante. **No es eso: lo que deja a medias es la mano.**

```cpp
TotalFoundItems[i]->SUB_Remove(); //MIB JUN2010_14 (original line commented below)
//pPlayer->RemoveItem( TotalFoundItems[i] );          msmonsterserver.cpp:3013-3014
```

Las dos quitan el objeto del dueño —`RemoveFromOwner()` hace
`Gear.RemoveItem(this)`, `genericitem.cpp:1573`—, así que de la mochila sale en
las dos igual y no hay ningún instante intermedio. La diferencia está arriba:

```cpp
bool CMSMonster::RemoveItem(CGenericItem *pItem) {
    bool IsActiveItem = (pItem->m_Location == ITEMPOS_HANDS) && (ActiveItem() == pItem);
    if (IsActiveItem && pItem->CanHolster()) { pItem->m_Location = ITEMPOS_NONE; pItem->Holster(); }
    pItem->RemoveFromOwner();
    if (IsActiveItem) SwitchToBestHand();     //Must be called after the item is removed
}                                             msmonstershared.cpp:364-384
```

`SUB_Remove` (`genericitem.cpp:532-554`) llama a `RemoveFromOwner()` y borra la
entidad, y **se salta el `Holster()` y el `SwitchToBestHand()`**. O sea que
pagar con algo que llevabas en la mano te deja la mano vacía **sin cambiar al
arma de la otra**. Está portado con el fallo: `cobrar()` pone la mano a `null`
y no busca la siguiente. Prueba: «pagar con lo que llevas EN LA MANO deja la
mano vacía».

### `Data` como PARAM2 — y aquí el encargo se equivocaba de poco

El arreglo de Thothie es real y está portado:

```cpp
Params.add(MenuOption.Data); //Thothie - reg.mitem.data function wasn't returning
//as PARAM2 in type callback as described by docs, so I tried this, seems to work
                                              msmonsterserver.cpp:3022
```

Lo que el encargo daba por hecho —«portándolo según los docs, las cuatro
retrollamadas del alcalde reciben vacío»— **no es así, y conviene dejarlo
escrito**: las cuatro del alcalde (`zombie_countup`, `say_axe`, `say_ending`,
`axe_em`) **no leen PARAM2**. Leen PARAM1, que es el jugador y va en la línea
de antes (`:3021`). Quitando la línea de Thothie, esas cuatro seguirían
funcionando.

Donde sí se nota es en las opciones que el alcalde hereda de
`monsters/base_chat`, que **son suyas también** (§3): `give_runaround` abre con
`local RQUEST_STEP PARAM2` (`base_chat.script:399`) y sin el arreglo se queda
sin saber en qué paso va la misión del anillo. O sea que el arreglo hace falta,
pero no por lo que parecía.

---

## 3. Dos cosas que el 29 tenía mal, y que ejecutar el script ha destapado

El experimento 29 leía las opciones con `tools/menus.mjs`, un lector de bloques
con expresiones regulares. Ejecutar el script de verdad no adivina nada, y al
hacerlo salieron dos errores que cambian lo que el jugador ve.

### 3.1. Hay DOS `if` en el lenguaje, y hacen cosas distintas

```cpp
m_GlobalCmdHash["if"]   = ...ScriptCmd_If, true);  //The old if
m_GlobalCmdHash["if()"] = ...ScriptCmd_If, true);  //The new if
                                              scriptcmds.cpp:45-46
```

Se distinguen **por el paréntesis**, en el análisis:

```cpp
if (!strstr(TestCommand, "(") && *CmdLineTmp != '(')
    KeepCmd = true;                           // -> el VIEJO: un comando normal
else { ...m_NewConditional = true;            // -> el NUEVO: con hijos
       (*pCurrentCmds)->m_SingleCmd = true; }
                                              script.cpp:5310-5322
```

Y al ejecutar:

```cpp
else if (Cmd.m_Conditional) {
    if (!Cmd.m_NewConditional)
        break;  //Old if command.  Breaks event execution on failure
    ...else...
}                                             script.cpp:5754-5758
```

- **`if ( A == B )`** es el NUEVO. Al fallar salta sus hijos y **el evento
  sigue**. Sus hijos son el `{ … }` de la línea siguiente, y si no hay llaves,
  **una sola línea** (`m_SingleCmd`).
- **`if A`** es el VIEJO. Al fallar hace `break`: **abandona el resto del
  bloque que lo contiene**. No tiene hijos. Es el `return` de este lenguaje, y
  por eso los scripts están llenos de `if !EXIT_SUB`.

El 29 aplicó la regla del nuevo al viejo («el `if` sin llaves guarda sólo la
línea siguiente»). Dos consecuencias:

1. **«Give Goblin's Head» sí depende de llevar la cabeza.** En
   `mayor.script:128-137`, el `if $item_exists(PARAM1,item_goblinhead)` es el
   viejo: sin la cabeza abandona el bloque y con él se van el
   `setvar QUESTER_HEAD` **y las cuatro líneas que registran la opción**. El 29
   la enseñaba siempre. Ahora no aparece, y hay una prueba y un control de la
   sonda que lo dicen.
2. **El caso del armero no duplica ningún título.** La cabecera de
   `tools/menus.mjs` cuenta que `gatecity/armorer.script:236-241` haría salir
   «Ask about broken axe» dos veces. Con la regla buena no: corta el bloque, y
   las opciones de detrás tampoco se registran.

**Corregido después de escribir esto:** `tools/menus.mjs` ya distingue los dos
`if`. Un `if` viejo entra en una lista de «cortes» que se arrastra a todas las
opciones registradas detrás, el campo `guardaSoloElTitulo` desaparece y en su
sitio va `cortes`; el armero da 3 opciones limpias y en Gate City 7 de las 9 van
detrás de al menos un corte. El control que estaba en verde sobre el hallazgo
falso se ha sustituido por dos, y `doc/VGUI_29.md` §3 deja el error a la vista.

### 3.2. El alcalde no ofrece cuatro opciones: ofrece **siete**

`RunScriptEventByName` dice lo que hace en su propio comentario:

```cpp
//Run every event with this name
for (int i = 0; i < m.Events.size(); i++) { ... Script_ExecuteEvent(seEvent, Parameters); }
                                              script.cpp:5836-5844
```

`mayor.script:2` hace `#include monsters/base_chat`, y `base_chat` tiene **su
propio `game_menu_getoptions`** (`base_chat.script:49-118`) que registra
«Hail», «Ask about Jobs» y «Ask about Rumors». El lector del 29 no seguía los
`#include`, así que leía cuatro. Son siete —cuatro de ellas condicionadas—, y
en la captura de la sonda se ven.

Esto **sigue sin corregir en `menus.mjs`**, a propósito: `guiones.json` es ya el
camino bueno y `menus.json` sólo el respaldo, así que su lista sigue siendo
corta. Lo que se ha quitado es que la cabecera afirmara algo falso.

---

## 4. Lo que se ha portado con su fallo

Además de los tres de §2, todo esto va con el fallo y con una prueba que lo
nombra:

| fallo | dónde | qué se ve |
| --- | --- | --- |
| **el `!` hay que resolverlo dos veces** | `scriptcmds.cpp:3968-3972` | sin esto, `!QUEST_GOBLINCHIEF` no se encuentra, `atoi` de su nombre es cero y **la condición da cierto siempre**: la misión se podía volver a entregar. Lo cazaron dos pruebas de verdad, no plantadas |
| `add X 1` escribe **«1.00»** | `scriptcmds.cpp:4221` | por eso los scripts hacen `$int(...)` antes de enseñar un número; y `equals` es de cadena, así que `if ( X equals 1 )` con «1.00» es **falso** |
| `menuitem.register` **no limpia** `reg.mitem.*` | `npcscript.cpp:940-1000` | la segunda opción hereda el título de la primera si no lo vuelve a poner |
| la búsqueda circular **cuenta dos veces el mismo objeto** | `msmonsterserver.cpp:2968-2984` | el corte es `LastItem == FirstItem` pero el objeto ya se añadió: con uno en la mochila, un pago de dos cuela. Ninguna opción de Gate City pide dos de nada |
| `gold` se mira con **`starts_with`** | `:2953` | un objeto llamado `goldring` se leería como oro, y `substr(5)` de «goldring» es «ing»: un pago gratis |
| `quest set` **sin valor** no pone nada | `scriptcmds.cpp:4874` | la guarda `if(!SetData \|\| Params.size() >= 4)` |
| `offer X gold` **sin cantidad** lee fuera de la lista | `npcscript.cpp:653-655` | comprueba `size() >= 2` y lee `Params[2]` |
| el plural del nombre es una **«s» a pelo** | `syntax.cpp:10` | «3 Goblin Chief's Heads» |
| `Speak` escribe **dos espacios** tras la coma | `msmonsterserver.cpp:1633` | `%s says,  "%s"` |
| un índice fuera de la lista **no la borra** | `:2928` contra `:3036` | el `return` está antes del `clearitems()` |

Y uno que está en el motor y aquí no se puede reproducir, dicho en
`misiones.js`: `ScriptCmd_Quest` lee `Params[3]` **antes** de comprobar
`Params.size() >= 4` (`scriptcmds.cpp:4864`). En C++ es memoria de nadie; en
JavaScript es `undefined`, y el efecto visible es el mismo porque al borrar no
se usa.

---

## 5. El guardado, que es lo que este proyecto ya pagó una vez

El personaje gana un campo. La regla que `src/juego/personaje.js` ya se había
copiado de MSR hace que eso no sea una migración:

```cpp
gFile.WriteByte(CHARDATA_QUESTS1);            //[BYTE - CHUNK - QUESTS]
gFile.WriteInt(pPlayer->m_Quests.size());     //[INT]
for (q...) { WriteString(Name); WriteString(Data); }
                                              sv_character.cpp:687-694
```

Es **un trozo con su etiqueta**, y el último valor del enum es
`CHARDATA_UNKNOWN` con el comentario «If >= CHARDATA_UNKNOWN, then skip it?».
Un personaje de antes no trae el trozo y se abre con la lista vacía. Aquí eso
es `misiones ?? []`, **sin subir la versión**, y lo defienden seis pruebas:

- un personaje del 32 **sin** el campo se abre, con su oro, sus 36 ranuras y
  sus objetos intactos, y **sin inventarse un aviso**: no traerlo es lo normal;
- uno **con** misiones las conserva;
- una entrada rota se tira **ella**, no el personaje;
- si vinieran con otra forma —un objeto en vez de una lista— se empieza de cero
  **y se dice** en `avisos`;
- un campo desconocido de hoy sobrevive a una vuelta completa, que es el camino
  de vuelta: un personaje del 33 abierto por el código del 32 conserva sus
  misiones porque el 32 conserva lo que no conoce;
- y la sonda lo comprueba **en el navegador**: guarda, sale, vuelve a entrar y
  el oro de la recompensa y la lista siguen ahí.

---

## 6. El censo, y qué significan sus tres cifras

`npm run guiones` mide, sobre los **139** scripts con `game_menu_getoptions`
—los «140 NPCs» del encargo—, tres cosas distintas y las define:

- **A. el menú se construye entero (65).** Se ejecuta su
  `game_menu_getoptions` y todo lo que encuentra —comandos, getters,
  propiedades de `$get`— está portado. O sea: la lista de opciones que ve el
  jugador es la correcta.
- **B. al menos una opción se puede elegir de principio a fin (73).** Alguna
  retrollamada registrada, y todo lo que encadena con `callevent`, cabe entero.
- **C. el NPC entero (7).** El menú **y todas** sus opciones.

Las tres se cuentan sin indulgencia: si al elegir una opción hace falta un
comando que no está, esa opción no cuenta, aunque lo que falte sea un sonido.
Lo que **no** se sigue son los eventos que el motor lanza por su cuenta
—`game_spawn`, `game_idle`, los `catchspeech`—: ésos son la IA del NPC y no el
menú, y contarlos haría la cifra más pequeña de lo que mide.

**El alcalde está en B y no en C**, y eso describe bien dónde estamos: la
misión de la cabeza del goblin (`say_ending`), la del hacha rota (`say_axe`) y
el premio de los zombis (`axe_em`) caben enteras; `zombie_countup` no, porque
encadena con `remove_spawns_loop`, que necesita `deleteent`, `$get_by_name` y
`$get_token_amt`.

Y la lista de la compra, que sale medida del mismo sitio — a cuántos de los 139
les hace falta cada cosa:

```
  95  cmd stradd          85  cmd playsound       81  cmd setmovedest
  81  get $randf          79  cmd say             78  cmd setprop
  63  cmd roam            62  cmd setmoveanim     56  get $get_token_amt
  41  cmd calleventloop   35  $get(,range)        33  cmd usetrigger
  31  cmd menu.open       29  cmd array.add       26  $get(,maxhp)
```

Se lee solo: lo que más falta es **`base_chat` entero**. Su `chat_loop` usa
`stradd`, `playsound`, `setmovedest`, `setmoveanim` y `$randf`, y como lo
incluye casi todo NPC hablante, esos cinco comandos son la diferencia entre 7 y
un número mucho mayor. **Portar `chat_loop` es el experimento barato que sigue
a éste**, y no hace falta más análisis: la cuenta ya está hecha.

Después vienen las **tiendas** (`npcstore.*`, `addstoreitem`, `recvoffer`: 17 y
16 scripts), que el encargo ya señalaba como lo siguiente, y los **arreglos**
(`array.*`, `$get_array*`: 19), que son estructura de datos y no contenido.

---

## 7. Dónde se puede haber medido mal

Dicho aquí porque una cifra sin sus límites no es una medida:

- **El censo mira los nombres de los comandos, no lo que hacen.** Un script que
  llame a `playsound` en una rama que nunca se ejecuta cuenta igual. La cifra
  es, por tanto, un **suelo**: el número de NPCs que funcionan de verdad es
  mayor que 7 y menor o igual que 73.
- **`callevent` con el nombre en una variable no se sigue.** El censo sólo
  encadena cuando el parámetro coincide con un evento que existe en el
  fichero; `callevent CHAT_EVENT_STEP1` no se resuelve. Eso hace la cifra
  **mayor** de lo que debería, y es el único sesgo que va en esa dirección.
- **La mochila de aquí son montones `{id, n}` y la del motor son entidades.**
  Un montón de tres se expande a tres entidades seguidas, que es lo que serían
  tres objetos no apilables. Para los que sí se apilan —`m_MaxGroupable > 1`,
  las flechas— el motor tendría una entidad con `iQuantity 3` y el conteo
  circular se comportaría distinto. Ninguna opción de menú de Gate City cobra
  en objetos apilables.
- **`callexternal all` no llega a nadie.** Aquí no hay más guiones corriendo
  que el del NPC de delante, así que `callexternal all goblin_remove`
  (`mayor.script:180`) se apunta y no hace nada: **los goblins del mapa no
  desaparecen al terminar la misión**, y en el juego sí.
- **`$dist` devuelve siempre cero** y `$get(,origin)` es aproximado, porque
  ninguna condición de la misión del alcalde los usa. La rama de
  `zombie_countup` que mira si el que empezó la misión está a más de 512
  unidades no está medida.
- **La sonda le pone la cabeza del goblin al jugador a mano**, y lo dice en su
  propio código: matar al jefe goblin está en las cuevas y no cabe en esta
  sonda. Lo que se mide es lo de después.

---

## 8. Lo que queda, por orden de cuánto se nota jugando

1. **`chat_loop` de `base_chat`** — cinco comandos, y el censo salta de 7 a
   bastantes decenas. Es el experimento más barato que hay ahora mismo.
2. **Las tiendas**, que son este mismo mecanismo más `npcstore.*`.
3. **El escudo y el parry del jugador no se aplican al daño de un bicho** con
   servidor (IA_28.md §8). Es un agujero de juego, no de contenido.
4. **No hay reaparición de monstruos**, ni desaparición: matas los 69 de Gate
   City y el pueblo se queda vacío, y ahora además `callexternal all` tampoco
   se los lleva al terminar una misión.
5. **Los contenedores del mundo** (cofres, barriles), que el 31 dejó fuera.
6. **El grafo de navegación de los NPCs.** Hoy vagan.
7. **Las flechas no pasan por la comprobación de distancia** del servidor.
8. **La luz de los jugadores remotos.**
9. **`wss://` y cuentas.**
10. **La deuda**: `mainGateCity` sigue siendo una función de 2 700 líneas
    (ORDEN_28.md).

Y una que no es código: **enseñárselo al equipo de MSR y pasar el repositorio a
público**, que es lo que pidieron. Ver [CREDITOS.md](../CREDITOS.md).

---

## Cómo se corre

```bash
npm run guiones            # hornea build/gatecity/guiones.json Y hace el censo
npm test                   # 911 pruebas, 88 de ellas del 33
npm run sonda:misiones33   # 23 controles en un Chrome de verdad
```

La sonda deja dos capturas en `build/gatecity/vistas/`:
`misiones33-menu.png` (el menú del alcalde con sus opciones de verdad) y
`misiones33-hecha.png` (la misión terminada).
