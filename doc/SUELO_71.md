# 71 — La manzana cae, y el submodelo de estar tirado no es una fórmula

Hasta hoy este puerto no tenía **ni un objeto en el suelo**, en ninguno de los
dos mapas. No faltaba un caso: faltaba la pieza entera. El 69 portó el
aparecedor (`msitem_spawn`), el 70 cerró la cadena que lo dispara, y los dos
acabaron en la misma línea de `src/main.js`:

```js
case "objeto_aparece":
  objetosSueltos.push(...);
  sinPortar.set("objeto_aparece: no hay objetos en el suelo", ...);
```

Un contador. Esto es lo que había detrás.

Ahora golpeas la manzana del manzano de Edana, cae tres metros y medio, se
tumba, hace ruido, se queda dos minutos y te la puedes meter en la mochila.

---

## 1. Lo que un objeto hace al nacer, y nadie se lo manda

Lo primero que hay que entender es que **un `msitem_spawn` no tira nada**. Su
`SpawnItem` crea el objeto, le copia el `targetname` y el `origin`, y se va
(gispawn.cpp:36-58). Quien lo hace caer es el objeto mismo, un décimo de
segundo después:

```cpp
void CGenericItem::Spawn() {
  ...
  SetBits(lProperties, GI_JUSTSPAWNED);
  pev->nextthink = gpGlobals->time + 0.1;          // genericitem.cpp:605-611
}

void CGenericItem::Fall() {
  if (!FBitSet(lProperties, GI_JUSTSPAWNED)) return;
  ClearBits(lProperties, GI_JUSTSPAWNED);
  if (!Owner()) FallInit();                        // genericitem.cpp:1616-1628
}
```

O sea: **cae el que no tiene dueño en el primer décimo de segundo.** No hay una
rama «el aparecedor lo deja en el suelo» y otra «el jugador lo suelta»: las dos
acaban en `FallInit`, y la diferencia es sólo de quién venía.

`FallInit` (weapons.cpp:354-373 y genericitem.cpp:1385-1392) hace cuatro cosas,
y la tercera es la que decide cómo se mide todo lo demás:

| | |
| --- | --- |
| `MOVETYPE_TOSS` | cae con la gravedad del mundo |
| **tamaño CERO** | `UTIL_SetSize(pev, Vector(0,0,0), Vector(0,0,0))`, con el comentario de Valve al lado: *«pointsize until it lands on the ground»* |
| `CallScriptEvent("game_fall")` | el guion elige su submodelo de estar tirado — el apartado 2 |
| `m_TimeExpire` | arranca el reloj de los 120 s |

Que sea un **punto** es lo que permite que la caída se mida con un rayo y no
con un barrido de caja. No es una simplificación: es la regla, y está escrita
para que un objeto pueda caer por cualquier rendija.

Al tocar el suelo, `CGenericItem::FallThink` (genericitem.cpp:1395-1416):

```cpp
float pitch = 95 + RANDOM_LONG(0, 29);
EMIT_SOUND_DYN(ENT(pev), CHAN_VOICE, "items/weapondrop1.wav", 1, ATTN_NORM, 0, pitch);
pev->angles.x = 0;                 // «lie flat»
pev->angles.z = 0;
pev->owner = NULL;
pev->solid = SOLID_TRIGGER;
UTIL_SetOrigin(pev, pev->origin);
m_TimeExpire = gpGlobals->time + ExpireTime;
```

Tres detalles que no se adivinan:

- **se tumba, pero no gira**: pierde el cabeceo y el alabeo, conserva el rumbo;
- **pasa a `SOLID_TRIGGER`**, o sea que una cosa tirada **no para a nadie**: se
  le pasa por encima. Por eso `src/render/suelo.js` no monta colisionador, y
  eso no es un hueco, es lo que hace el motor;
- y **el reloj de caducar se vuelve a poner**. `MSITEM_TIME_EXPIRE` son 120 s
  (msitemdefs.h:10) y se cuentan **desde que toca el suelo**, no desde que
  nació. Una manzana que cae de un árbol alto vive un poco más.

Y de propina, una cuenta que el 69 dejó a medias: el `apple5spawn` de Edana
trae `duration 60`, y el 69 midió que **esa clave no la lee nadie**
(`CBaseGISpawn::KeyValue` conoce tres y `duration` no es una). Ahora se puede
decir qué pasa de verdad: la manzana dura **120 s**, no 60.

---

## 2. El submodelo de estar tirado lo calcula el guion, y no una fórmula

Un `.mdl` de objetos de Master Sword trae **tres submodelos por cosa**:

```
misc/p_misc.mdl, bodypart 'misc', 72 submodelos
   0: apple_rhand     1: apple_lhand     2: apple_floor
   3: oldbook_rhand   4: oldbook_lhand   5: oldbook_floor
   ...
```

Para dibujar una manzana tirada hace falta el número 2, y **ese número no está
escrito en ninguna clave**: lo calcula el evento `game_fall` del guion. Y cada
familia lo calcula distinto:

| base | lo que hace | cita |
| --- | --- | --- |
| `base_weapon` | `inc L_SUBMODEL 2`, y `−1` si `NO_WORLD_MODEL` | :61-70 |
| `base_drink` | `add L_SUBMODEL 2` | :79-90 |
| `base_miscitem` | `add L_SUBMODEL 1` **sólo si el modelo es `p_misc`**; si no, `setmodelbody 0 0` | :39-57 |
| **`health_apple`** | **`[override] game_fall` con `add L_SUBMODEL 1`** | :47-57 |

La manzana hereda de `base_drink`, que dice `+2`, y **lo anula** para decir
`+1`. Con el `+2`, `MODEL_BODY_OFS 1` más dos da el submodelo **3**, que se
llama `oldbook_rhand`: una manzana que al caer del árbol se convierte en un
libro viejo, sin un solo error en ninguna consola.

`tools/armas.mjs` lleva desde el 23 con esa fórmula del `+2` escrita, y tenía
un control que la comprobaba —el nombre del submodelo tiene que acabar en
`_floor`— y que sólo se usaba para *avisar*. Medido ahora sobre las 174 armas
del catálogo: **38 no cumplen el `+2`**, y el `game_fall` de cada una dice otra
cosa.

Así que el 71 trae un lector de `game_fall`: `caidaDe()`, en
`src/bsp/script.js`. No es un intérprete —son cinco órdenes, `local`,
`add`/`inc`, `subtract`/`dec`, `stradd` y `setmodelbody`, más el `if`— y lo
que no sabe leer **lo dice** en vez de adivinarlo. De los 760 objetos del
catálogo resuelve **593**.

### Lo que hubo que aprender del intérprete para leer tres líneas

Tres reglas del motor que parecen detalles y deciden el resultado:

1. **El `if` VIEJO con la condición falsa abandona el evento entero**
   (script.cpp:5754-5758). Es el hallazgo del 67, y aquí decide modelos: los
   `game_fall` de `base_item_extras` empiezan por `if ITEM_RESERVE_FOR_STRONGEST`,
   una constante que nadie declara, o sea `atoi(nombre) == 0`, o sea falso. Ese
   evento no llega nunca a su segunda línea. No es un hueco del lector: es la
   respuesta.

2. **Las cuentas usan `atof`** (scriptcmds.cpp:4210-4213), así que lo que no es
   un número vale cero y la cuenta sigue. `add L_SUBMODEL 1` con la constante
   sin declarar da 1 **en el juego**. Hacer que el lector se rindiera ahí era
   más estricto que el motor, que es otra manera de equivocarse.

3. **Las comillas simples no son comillas.** Sólo las dobles agrupan
   (`GetParams`, script.cpp:5049-5064; y el lector de parámetros de un comando,
   :5639-5650); la simple es un carácter más del nombre, y `GetConst` devuelve
   tal cual lo que no encuentra, comillas incluidas (script.cpp:349-354). O sea
   que

   ```
   if ( MODEL_WORLD equals 'misc/p_misc.mdl' )
   ```

   compara `misc/p_misc.mdl` con `'misc/p_misc.mdl'` —con las comillas dentro—
   y **nunca es cierto**. Todo lo que hereda de `base_miscitem` se va por el
   `else` y acaba en el submodelo 0. En `p_misc.mdl` el submodelo 0 es
   `apple_rhand`: **en Master Sword un yelmo tirado en el suelo se dibuja como
   una manzana en una mano**. Medido con el oráculo del nombre sobre los 364
   objetos cuyo modelo se puede leer: 264 caen en un `_floor` y **100 no**, y
   los `armor_*` son la mayor parte de esos 100.

   Esto se porta con el fallo, que es la regla de la casa. Y conviene decir que
   el resultado no depende de la lectura de las comillas: la base tampoco
   declara `MODEL_BODY_OFS`, así que por el otro camino el yelmo sería
   `apple_lhand`. Manzana igual.

El leño de Edana es el **segundo caso**, y hace falta: la manzana se va por su
`[override]` con `+1` y el leño por la rama del `else` con el submodelo 0. Con
un solo objeto, un lector que devolviera siempre `+1` estaría igual de verde —
la trampa del 50, que ya va por la octava vez.

---

## 3. El alcance de recoger no son 64 unidades

`CBasePlayer::GetAnyItems` (player.cpp:5080-5245) es lo que hace la tecla `x`
(`bind "x" "get"`, config.cfg:31 → client.cpp:661-662). Empieza así:

```cpp
#define SEARCH_DISTANCE 64.0
while (pObject = UTIL_FindEntityInSphere(pObject, EyePosition(), SEARCH_DISTANCE))
```

Sesenta y cuatro unidades desde el ojo, parece. Pero `FindEntityInSphere` **no
mide contra el origen de la entidad**: mide contra su caja, componente a
componente (pr_cmds.cpp:871-882):

```cpp
if (org[j] >= ent->v.absmin[j])
  eorg = (org[j] <= ent->v.absmax[j]) ? 0.0f : org[j] - ent->v.absmax[j];
else
  eorg = org[j] - ent->v.absmin[j];
```

y la caja de un objeto es grande a propósito
(`CBasePlayerItem::SetObjectCollisionBox`, weapons.cpp:345-349):

```cpp
pev->absmin = pev->origin + Vector(-24, -24,  0);
pev->absmax = pev->origin + Vector( 24,  24, 16);
```

O sea que el alcance de verdad llega a **88 unidades en horizontal**. Medido
contra el origen, el juego te obliga a pisar la manzana para cogerla.

Y dos filtros más:

- **`FVisible`** (combat.cpp:1277-1304): una traza del ojo al objeto que
  **ignora a los monstruos**. Un goblin delante no tapa una manzana.
- **`FInViewCone`** (combat.cpp:1148-1174): el producto escalar **en 2D**, con
  su comentario delante —*«The dot product is performed in 2d, making the view
  cone infinitely tall»*— entre el rumbo del jugador y la línea que va de su
  **origen** (no del ojo) al del objeto.

  El umbral es `m_flFieldOfView`, que para el jugador es **0,5 y no 0,1**: las
  dos asignaciones están dentro de `CBasePlayer::Spawn` (player.cpp:2627 y
  :2682) y gana la última. Son ±60°.

  Que el cono no tenga techo no es un detalle: agacharse a mirar lo que vas a
  coger es lo normal, y con el cono en 3D la tecla fallaría justo al apuntar.

---

## 4. El fallo que se porta: el menú que no sale nunca

El motor junta hasta nueve objetos y tiene un menú entero para elegir entre
ellos («Gather items:»). Y entre la lista y el menú hay esta línea:

```cpp
ItemCount = 1; //Thothie DEC2010_11 - trying to end item dup exploit
                                                       player.cpp:5199
```

a pelo, sin condición, justo antes del `if (ItemCount == 1)`. **El menú es
inalcanzable**, y con dos cosas a los pies te llevas sólo la primera que el
motor encuentra. Es un parche contra un exploit de duplicación de 2010 que se
quedó puesto.

Se porta con el fallo y con su prueba, que es la regla de la casa. Y se mide en
Edana sin mover nada a mano, porque el mapa regala el caso: **hay dos
`msitem_spawn` de leño en el MISMO punto**, (480, −200, −136). Se disparan los
dos, quedan dos leños uno encima del otro, se pulsa la tecla y queda uno.

---

## 5. Lo que no se porta, con la cuenta de a quién le toca hoy

| | a cuántos |
| --- | --- |
| **Soltar del inventario** (`CGenericItem::Drop`, genericitem.cpp:1319-1383), que es la OTRA manera de que algo acabe en el suelo. Por eso la tecla `c` —`bind "c" "drop"`, en la tabla desde el 24— no hace nada | a todo lo que el jugador lleva encima |

> **CORRECCIÓN DEL 75.** La última fila de esa tabla ya no es verdad: soltar
> está portado, la `c` tira lo que lleva la mano y la fila se queda escrita
> porque era verdad el día que se escribió. Y la medida trajo algo que esta
> página no podía ver con un solo objeto: **el submodelo del suelo falla en 5 de
> los 13** guiones con la fórmula vieja del `+2`, y el oráculo del `_floor` **se
> puede engañar** —con el `+2`, `sheath_back` cae en `oldbook_floor`, que pasa
> el control del nombre y es el modelo de otra cosa—. Ver
> [SOLTAR_75.md](SOLTAR_75.md).
>
> Y un fallo de esta misma pieza que el 75 encontró y arregló: el objeto quedaba
> **a ras** de la cara en la que se paraba, y entonces el rayo de `FVisible`
> chocaba contra esa cara y la recogida decía «tapado». El motor lo deja a
> `DIST_EPSILON = 0.03125` de la cara (world.cpp:727 y :785-792). La manzana no
> lo notaba porque cae en campo abierto; una espada tirada no se podía coger.
| `container` de un `msitem_spawn`: en vez de en el suelo, dentro de la mochila de otro objeto (gispawn.cpp:64-83) | 0 de los 4 aparecedores de Edana, 0 de 0 en Gate City |
| `ITEM_NOPICKUP`, `ITEM_PROJECTILE`, `PICKUP_ALLOW_LIST` — los tres filtros de la lista (player.cpp:5111, :5115-5137, :5140) | 0 de los 2 objetos que un mapa portado puede dejar en el suelo |
| `ITEM_GROUPABLE`: juntar varios iguales en uno (player.cpp:5158-5180) | 0 de 2 |
| El oro de un cadáver, que entra en la misma lista (player.cpp:5096-5109) | eso no es un objeto: es saquear |
| El **ruido** de caer: `items/weapondrop1.wav` **no está en `assets/msr`** | y eso es correcto: es un sonido de `valve/`, que el motor monta detrás siempre (el corolario del apartado 2 de CLAUDE.md). La salida `objeto_aterriza` lo pide igual, con su tono |

Y un resultado del mapa que no es un hueco nuestro: el tercer `msitem_spawn` de
Edana tiene `scriptfile log`, y `items/log.script` **no existe**.
`NewGenericItem` devuelve NULL y el aparecedor no pone nada (gispawn.cpp:38-39).
Tampoco importa: ése y los otros dos no tienen nombre y traen `spawnstart`, o
sea que **no los puede disparar nadie**.

---

## 6. Las roturas a propósito

Cinco, y todas en rojo. Dos de ellas destaparon un control que no medía nada.

| lo que se rompió | qué se puso en rojo |
| --- | --- |
| la esfera de recogida medida contra el **origen** en vez de contra la caja | 4 pruebas: «a 80 unidades todavía se coge» y «a 89 ya no» |
| el **reloj de caducar** sin reiniciarse al aterrizar | «el reloj se reinicia al aterrizar, no al nacer» |
| quitar el **`ItemCount = 1`** y coger todo lo que haya delante | «con dos cosas delante sólo se coge una» |
| el **nodo** de Three que no se mueve | la sonda: «el NODO está donde dice el bus en los TRES ejes» |
| el extractor con la fórmula **`mano+2`** | el oráculo: `body 3 de 72 -> oldbook_rhand` |

### El cono en 3D, que no puso nada en rojo

La prueba «mirando al suelo se coge igual: el cono es infinitamente alto» ponía
el objeto **a la misma altura que el jugador**. Ahí el término vertical vale
cero y 2D y 3D dan exactamente lo mismo, así que **con el cono roto a 3D la
prueba seguía verde**. Medía que la función sabe hacer un producto escalar, no
que lo hace en el plano.

Ahora la manzana está en el suelo y el origen del jugador a la cintura (36 u),
que es el caso de verdad: a 20 unidades, en 3D el producto sale 0,486 —por
debajo del 0,5— y en 2D sale 1. Con eso, la rotura es roja.

### El nodo comparado sólo en la altura

El control de la sonda decía «el NODO de Three está donde dice el bus» y
comparaba **sólo la `y`**. La manzana cae a 0,00 m y un nodo que no se ha
movido nunca está en (0, 0, 0): también tiene la `y` a cero. Verde con el
dibujo clavado en el origen del mapa. Ahora compara los tres ejes y además pide
que el nodo esté a más de un metro del origen.

Las dos son la misma familia del apartado 4 de CLAUDE.md, y las dos salieron de
romper el arreglo, no de mirar mejor.

---

## 7. La sonda vecina que había que tocar

`sonda:edana69` tenía este control:

> «y se dice en voz alta que la manzana no cae: no hay objetos en el suelo»

Era correcto y ha dejado de serlo. Se ha sustituido por la medida de lo que
pasa ahora —que la manzana está de verdad en el mundo, con su estado— más uno
que comprueba que aquel aviso ha desaparecido. Sólo el segundo no bastaría:
estaría verde también el día que el aparecedor dejara de dispararse.

---

## 8. Lo medido

```
npm test                 1752 de 1752   (+29)
npm run suelo            3 controles en verde
npm run sonda:edana71    26 de 26, sin errores de página
npm run sonda:edana69    27 de 27   (era 26; +1 al partir el control corregido)
npm run sonda:edana70    20 de 20
npm run sonda:edana68    13 de 13
npm run sonda:edana67    18 de 18
npm run sonda:edana60    13 de 13
npm run sonda:edana48    15 de 15
npm run sonda:mundo      44 de 44
npm run sonda:golpe      26 de 26
npm run sonda:sonido     26 de 26
npm run sonda:inventario31  20 de 20
vite build               limpio
idioma + procedencia     20 de 20
```

Del catálogo de 760 objetos, `caidaDe` resuelve el submodelo del suelo de
**593**. Se hornean los **2** que un mapa portado puede dejar en el suelo
—`health_apple` y `item_log`—, 114 KB de malla.

---

## 9. Lo que le queda a esto

1. ~~**Soltar del inventario.**~~ **Hecho en el 75**, y el segundo caso salió:
   la espada sí suma 2, pero **5 de los 13** guiones del suelo no cumplen el
   `+2`. Ver [SOLTAR_75.md](SOLTAR_75.md).
2. **`env_render` sobre un adorno**: la manzana cae del árbol y la del árbol
   sigue ahí. Es el otro medio hueco de esta misma cadena.
3. El botín de un cadáver, que entra por la misma lista de `GetAnyItems`.
4. Y lo que el 70 dejó: el modo aditivo del haz de luz de la cloaca.
