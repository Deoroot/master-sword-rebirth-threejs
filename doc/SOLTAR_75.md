# Soltar del inventario — experimento 75

> La otra mitad de los objetos en el suelo. El 71 los puso por la vía del mapa
> —la manzana del manzano de Edana—; ésta es la del jugador, la tecla `c`, que
> estaba en la tabla de teclas **desde el experimento 24** sin que nada la
> leyera.
>
> `npm test` **1791 de 1791** · `npm run sonda:edana75` **30 de 30** ·
> `npm run suelo` 6 controles verdes.

## 1. La cadena

```
tecla c  ->  "drop"                             config.cfg:16
     │
     ▼
ClientCommand2, rama "drop"                     client.cpp:931-957
     │  UTIL_MakeVectors(pev->angles)   <- el TERCIO empieza aquí
     ▼
CBasePlayer::DropItem                           playershared.cpp:943-990
     │  CanDrop();  "You drop X";  v_forward*175 + (0,0,60)
     ▼
CGenericItem::Drop                              genericitem.cpp:1319-1383
     │  game_drop;  origin = ojo + v_forward*10;  RemoveItem
     ▼
FallInit                                        el mismo del 71
     │  MOVETYPE_TOSS, tamaño punto, game_fall, reloj de 120 s
     ▼
FallThink   **sólo si FL_ONGROUND**             genericitem.cpp:1397
```

Sin argumento, `drop` suelta `ActiveItem()`; aquí eso es lo que lleva la mano
derecha (`personaje.manos.derecha`).

## 2. No se deja caer: se TIRA

```cpp
pev->origin   = m_pOwner->EyePosition() + gpGlobals->v_forward * 10;   // :1336
pev->velocity = pev->velocity + gpGlobals->v_forward * 175 + Vector(0,0,60);
                                                      // playershared.cpp:977
```

Sale del **ojo**, diez unidades adelante; se lleva **la velocidad del jugador**
—soltar corriendo lo manda más lejos— y le suman 175 de empuje y 60 hacia
arriba. En la sonda eso son **2,14 m de vuelo** antes de tocar el suelo.

## 3. EL TERCIO: soltar mirando al suelo lo tira hacia ARRIBA

El `v_forward` con el que se calculan las dos líneas de arriba sale de
`pev->angles`, y el `pev->angles` de un cliente **no es por donde mira**: lo
escribe el motor.

```cpp
sv_player->v.angles[0] = float(-pmove->angles[0] / 3.0);   // sv_user.cpp:993
```

Un tercio del cabeceo de la vista **y con el signo dado la vuelta**. Medido en
la sonda, con la vista 60° hacia abajo:

```
la vista mira   60.0° hacia ABAJO
pev->angles[0]  -20.00   (la vista daría 60.00)
el empuje sale  20.0° hacia ARRIBA
```

Y el límite: con la vista a plomo el objeto sale a **30° por encima de la
horizontal**, así que **no hay manera de dejar algo a los pies**. Es un cálculo
del motor para que el modelo del jugador no se doble, heredado por una línea del
mod que pide una dirección y coge la que hay. Por eso soltar en Master Sword
parece lanzar.

## 4. Un suelo que no es suelo

`FallThink` se tumba, suena y vuelve a poner el reloj **sólo con `FL_ONGROUND`**
(genericitem.cpp:1397); si no, `flNextThink = time + 0.1` y lo reintenta para
siempre (:1413-1414). Y a un objeto de tamaño punto le da `FL_ONGROUND` esto:

```c
point[2] = mins[2] - 1.0f;                       // las cuatro esquinas de la caja
if (SV_PointContents(point) == CONTENTS_SOLID)
    ent->v.flags |= FL_ONGROUND;                 // sv_phys.cpp:1081-1109
```

Con la caja a cero —`FallInit` lo hace «pointsize until it lands on the ground»—
las cuatro esquinas son **el mismo punto**: una unidad debajo del origen. Y
`SV_PointContents` mira el **hull 0 del modelo del mundo** (world.cpp:695-709) y
de las entidades sólo las `SOLID_NOT`:

```c
if (touch->v.solid != SOLID_NOT) continue;       // world.cpp:625-626
```

Una `func_door`, un `func_breakable` y un `func_wall` son `SOLID_BSP`. **Lo que
se queda encima de uno no toca suelo nunca.** Medido:

| | sobre el mundo | sobre una entidad de brush |
| --- | --- | --- |
| estado | `suelo` | `posado` |
| se tumba | sí, cabeceo 0 | **no**, se queda a −25,13° |
| suena | sí, tono 121 | **no** |
| `SOLID_TRIGGER` | sí | **no** |
| el reloj | se reinicia (`leQueda + vida` = 120,48) | **el de `FallInit`** (= 120,02) |
| se puede coger | sí | **sí** — `FindEntityInSphere` no mira el `solid` |

Es el segundo caso que le faltaba a la pieza del 71, donde todo caía contra el
modelo 0 y esa rama no se ejecutaba.

**Y un hueco que se dice:** `func_wall` tampoco es suelo en el motor, y en este
puerto está horneada **dentro del trimesh del mundo** desde el 48, así que no se
puede distinguir sin rehacer el horneado. Son 18 en Edana y 57 en Gate City, y
ninguna de las 75 es una superficie sobre la que se pueda dejar algo.

## 5. `CanDrop` tiene tres candados y dos no cierran nada

`genericitem.cpp:1291-1308`:

1. `if (CurrentAttack) return false;` — **ésta sí**. No se suelta a media
   estocada. Portada y medida con el brazo atacando de verdad.
2. `if (gpGlobals->time < fNextActionTime) return false;` — `fNextActionTime` se
   **declara** (weapons.h:202), se **lee** dos veces (:877 y :1297) y **no se
   asigna en ningún sitio del mod**. La memoria de una entidad de GoldSrc viene
   a cero, así que la pregunta es `time < 0`. Un candado sin llave y sin
   cerradura.
3. `if (m_PrefHand == HAND_PLAYERHANDS) return false;` — a eso se llega con
   `sethand undroppable` (genericitem.cpp:2128-2129), y **`sethand undroppable`
   no sale en ninguno de los 2 884 guiones**: 43 `both`, 41 `any`, dos `right`,
   dos `left` y dieciséis sin parámetro, ninguno lo activa.

O sea que **en Master Sword todo lo que llevas encima se puede soltar**, y lo
único que lo impide es estar a media estocada. Las dos muertas se portan igual,
apagadas y nombradas, porque el día que un guion escriba `sethand undroppable`
el sitio donde va la regla es ése.

## 6. El segundo fallo que se porta, hermano del `ItemCount = 1`

`Drop` quiso tener un «pulsa otra vez para soltar» —hay un `bDropAttempted` y un
`iDropTickCounter` en genericitem.h:431-432— y quedó así:

```cpp
bDropAttempted = true;
if ((bDropAttempted && m_pOwner->IsPlayer()) || !m_pOwner->IsPlayer()) {
                                                  // genericitem.cpp:1323-1324
```

La bandera se pone a `true` en la línea de antes, así que la condición es
`(true && X) || !X`: **cierta siempre**. Las dos ramas del `else if` no se
ejecutan jamás — incluida la que haría que **soltar un hechizo lo DESHICIERA**
en vez de tirarlo al suelo (:1370-1376). Y el contador de los 100 tics que las
remataba, con su mensaje «Dropping timed out.», está **comentado**
(:1512-1524), igual que el «Press again to drop» del jugador
(playershared.cpp:964).

Un mecanismo entero —dos variables, un temporizador y dos mensajes— al que una
tautología deja sin entrada. Es el `ItemCount = 1` del 71 en el mismo archivo.

## 7. El segundo caso del lector de `game_fall`

Es lo que el 71 no pudo tener. Con un solo objeto en el suelo —la manzana— «he
leído el guion» y «he acertado el número» eran el mismo verde. Lo que el jugador
puede soltar son once guiones más, y **cinco de los trece no cumplen el `+2`**
que `tools/armas.mjs` lleva escrito desde el 23:

| guion | el suyo | con `mano+2` saldría |
| --- | --- | --- |
| `health_apple` | 2 → `apple_floor` | 3 → `oldbook_rhand` |
| `pack_sack` | 5 → `sack_floor` | 6 → `bigsack_wear` |
| `polearms_qs` | 61 → `pole_floor` | 64 → `evilfshard_rhand` |
| `sheath_belt_holster` | 17 → `package_floor` | 3 → `oldbook_rhand` |
| `sheath_dagger` | 17 → `package_floor` | 6 → `evilbook_rhand` |

Un cuarto de bastón tirado en el suelo se dibujaría como un **fragmento de fuego
maligno en una mano**. Así que el contraste del horneado dejó de ser una línea
impresa y pasó a ser **un control**: afirma que la fórmula vieja FALLA en
alguno. Si se pusiera verde al revés, `caidaDe` sería adorno.

**Y el oráculo del `_floor` se puede engañar:** con el `+2`, `sheath_back` cae en
`oldbook_floor` — pasa el control del nombre y es el modelo de otra cosa. Por eso
hace falta el contraste además del oráculo.

La espada, que va por `base_weapon`, sí suma 2: `swords_rsword` → 26 →
`rustedswordshortsword_floor`, animación `shortsword_floor_idle`.

**Y uno que no tiene modelo del mundo, y es correcto.** `magic_hand_lightning_weak`
hereda `const MODEL_WORLD none` (magic_hand_base.script:24), que deja
`WorldModel` en cadena vacía (genericitem.cpp:1961-1962), y el modelo se pone
dentro de un `if (WorldModel.len())` que también contiene el
`ClearBits(pev->effects, EF_NODRAW)` (:1345-1352). O sea que **una mano de
relámpago soltada está en el suelo y no se ve**. No traer malla no es un hueco:
es la regla, y el control del horneado los separa en dos para que «no he podido
extraerlo» no se pueda disfrazar de «el motor tampoco lo dibuja».

## 8. Un fallo del puerto que encontró la sonda: el ras

La espada caída **no se podía coger**. `porQueNoSeCoge` decía `tapado`:
`FVisible` traza del ojo al origen del objeto, y nuestro objeto quedaba
**exactamente sobre la cara** en la que se paró, así que el rayo chocaba contra
esa misma cara y la recogida veía una pared en medio.

El motor no lo deja a ras. `SV_PushEntity` copia `trace.endpos` al origen
(sv_phys.cpp:453-457) y el trazador de BSP **pone el cruce al lado de acá a
propósito**: «*put the crosspoint DIST_EPSILON pixels on the near side*»,
world.cpp:785-792, con `DIST_EPSILON = 0.03125` en :727. Un objeto del motor
descansa a 1/32 de unidad de la cara.

Portado: `trazaDeCaida` pasó a `castRayAndGetNormal` y suma la normal por
`0.03125`. Es la familia del almiar del 69 —la geometría tapándose a sí misma— y
otra vez **en la costura**: las dos mitades, caer y recoger, estaban verdes.

## 9. Los verdes que no medían nada, cazados al romper

- **El sitio de salida, comparado contra su propia constante.** La prueba decía
  `o.pos[2] === -ADELANTE`, así que al romper `ADELANTE` se rompían los dos
  lados: **`ADELANTE = 0` se quedó verde**. Medía que la constante se usa, no que
  vale las diez unidades del motor. Ahora los tres números van escritos a mano.
- **Los 0,1 segundos medidos con un reloj de pared.** La sonda esperaba 50 ms y
  leía el estado de lo soltado y de lo nacido: salió verde **con los dos
  «cayendo»**, porque el bucle de paso fijo gasta de una vez el tiempo acumulado
  mientras la sonda estaba parada en el `evaluate` anterior y el objeto nuevo se
  come los 0,1 s en el primer fotograma. Un `evaluate` no mide décimas. Ahora la
  sonda mide lo que sí es instantáneo —nace con velocidad y marcado, el otro
  quieto— y los 0,1 s exactos los mide la prueba de Node, que avanza el paso
  ella.
- **El reloj medido por lo que queda.** «Le quedan 118,4 s» no distingue nada:
  lo que falta es la espera de la sonda, y el caso de la tapa daba 116,1 — más
  cerca que lejos. Lo que separa los dos mecanismos es la SUMA `leQueda + vida`:
  120,48 si se reinició al aterrizar, 120,02 si es el de `FallInit`.
- **«Sobre una `func_door`», y era un almiar.** El primer control decía la clase
  equivocada: la espada acaba encima de uno de los cuatro `func_breakable`, que
  están justo ahí y más altos (−6,91 m contra los −8,23 de la tapa). La regla es
  la misma —los dos son `SOLID_BSP`— pero la cita no era lo que se midió. Ahora
  la sonda lee las cajas del manifiesto, dice **cuál** y comprueba que el objeto
  está a 1 mm de su techo.
- **La tapa medida desde el centro.** Antes la sonda se plantaba en el centro de
  la tapa a un metro de alto; un objeto soltado vuela 2,8 m desde ahí y **se pasa
  la tapa de largo**, así que leía «suelo». Medía que mi tiro no llega, no que
  una entidad de brush no es suelo. Ahora se tira desde el borde de acá al de
  allá y pegado.
- **«A media estocada no se suelta», con el brazo quieto.** `soltarAtacando`
  comprueba primero que `brazo.atacando` es cierto; sin eso el control habría
  leído el reposo. Y su efecto secundario mordió a la sección siguiente: el
  brazo se quedaba a media estocada y la tapa se medía con la `c` bloqueada por
  el ataque de antes.

## 10. Las roturas a propósito

| rotura | resultado |
| --- | --- |
| `TERCIO = 1` | 4 pruebas rojas |
| el signo del cabeceo al revés | 3 rojas |
| sin la rama de `FL_ONGROUND` | 4 rojas |
| sin el candado de `CurrentAttack` | 2 rojas |
| `ALZADO = 0` | 1 roja |
| `ADELANTE = 0` | 1 roja *(tras arreglar el verde vacío)* |
| `EMPUJE = 100` | 2 rojas |
| lo soltado espera los 0,1 s | 2 rojas |
| `caidaDe` devuelve `mano+2` | 2 pruebas y 3 controles del horneado rojos |
| `esDeBrushEntity` siempre `false` | **5 controles de la sonda rojos** |
| sin el `DIST_EPSILON` | **7 controles de la sonda rojos** |

## 11. Lo que no se porta, con la cuenta de hoy

- **Resbalar.** El motor mueve el objeto con `SV_FlyMove(ent, dt, 1.1)`
  (sv_phys.cpp:1075), que recorta la velocidad contra la cara y lo deja
  deslizarse; aquí un rayo lo para en seco. Se nota al tirar algo contra una
  pendiente. Afecta a los **11** guiones que el jugador puede llevar.
- **`game_drop`**, el evento del guion, que `Drop` dispara antes de nada
  (:1325). Sale en **16 de los 2 884** guiones y de los 11 soltables lo tiene
  **1**: `base_weapon_new` hace `callexternal ent_owner ext_set_hand_id RL_HAND 0`
  —vaciar la mano—, y eso aquí lo hace quien llama. De los otros quince, el de
  `item_log` enciende la antorcha con un `clientevent` (item_log.script:21-26) y
  el de `base_miscitem` llama a `game_fall` (base_miscitem.script:59-61), o sea
  el submodelo dos veces, que da lo mismo.
- **Los hechizos** (`ITEM_SPELL`). Su rama está muerta por la tautología del
  apartado 6, así que en el motor un hechizo soltado también sale volando; este
  puerto no tiene hechizos, así que afecta a **0 de 11**.
- **Soltar algo de DENTRO de un contenedor.** `Drop` empieza con un
  `m_pOwner = Owner()` y un comentario que avisa de que los objetos de dentro de
  una mochila cogen el dueño del contenedor (:1321). Aquí sólo se suelta lo de
  la mano, que es lo que hace `drop` sin argumento. Afecta a lo que haya en
  `pack_sack`: **0** mientras nadie lo llene.
- **`func_wall` como no-suelo**, el hueco del apartado 4: 75 en los dos mapas, y
  ninguna es una superficie donde se pueda dejar algo.
- **El `.wav`.** `items/weapondrop1.wav` sigue sin estar en `assets/msr` porque
  es de `valve/`; la salida lo pide con su tono igual (el 71).

## 12. Lo siguiente

1. ~~**`env_render` sobre un adorno.** La manzana cae y la del árbol sigue
   ahí.~~ **Hecho en el 76**, ver [ADORNOS_76.md](ADORNOS_76.md): un adorno con
   `targetname` ya no se funde en la malla de los 46.
2. ~~**`ms_npcscript` tipos 0 y 4** ×3: Edrin andando a `edrinspot`.~~ **Hecho en
   el 77**, ver [ESCENAS_77.md](ESCENAS_77.md).
3. **Una misión de Edana de punta a punta con sonda.**
4. **El botín de un cadáver**, que es la tercera vía de que algo acabe en el
   suelo y la que trae `ITEM_NOPICKUP` y el oro.
5. **El modo aditivo** del haz de luz de la cloaca, que dejó el 70.
6. Y lo que este experimento deja contado: **resbalar**, el `game_drop` de los
   otros quince guiones, y soltar de dentro del zurrón.
