# 69 — Lo que se rompe, lo que se pulsa y lo que se suelta

`func_breakable`, `func_button` y `msitem_spawn`. **Veinte rompibles entre los dos
mapas y ni uno se rompía**: estaban horneados dentro del trimesh del mundo, o sea
que existían como dibujo y como obstáculo y no como algo que se rompe — que es la
mitad de para qué están puestos.

El experimento salió de la lista de lo que le quedaba a Edana después del 68: los
cuatro almiares, los cuatro `msitem_spawn` y el botón de la manzana. Resultaron
ser una sola cadena, y de paso destapó dos huecos que no estaban en la lista.

---

## 1. El corral de la cloaca, que es un bucle

Los cuatro almiares, del `.bsp` crudo:

| modelo | nombre | material | vida | target |
| --- | --- | --- | --- | --- |
| `*98` | `hay` | 1 (madera) | 5 | — |
| `*99` | `hay` | 1 | 10 | — |
| `*100` | `hay` | 1 | **8** | `sewer_door` |
| `*101` | `hay` | 1 | 11 | — |

Y `sewer_door` son **dos entidades**, que `FireTargets` llama a las dos: un
`func_door` con `wait -1` y un `trigger_relay` con `killtarget sewer_open`. La
puerta, a su vez, tiene **`target hay`**.

O sea: rompes el almiar de 8, se abre la cloaca, y la puerta revienta los otros
tres. Al que la abrió no — y ahí está la línea que lo explica:

```cpp
// Don't fire something that could fire myself
pev->targetname = 0;
pev->solid = SOLID_NOT;
SUB_UseTargets(NULL, USE_TOGGLE, 0);
//                            func_break.cpp:821-825
```

Ese comentario parece una precaución teórica y en Edana es la que hace que el
truco funcione: **los cuatro se llaman igual**, así que sin borrar el nombre la
puerta rompería también al que la abrió. Y no es cosmético: `porNombre` tiene que
dejar de encontrarlo, caché incluida.

Y debajo de los almiares no hay suelo. Lo midió la sonda sin buscarlo: con el
montón entero roto, un rayo de cinco metros hacia abajo no encuentra nada. **Los
almiares tapan la boca del pozo de la cloaca.**

## 2. La manzana

```
func_button appledrop  ->  multi_manager appledropMM  ->  apple5spawn
                                                           ├ msitem_spawn health_apple
                                                           └ env_render  (apaga el adorno del árbol)
```

## 3. Tres claves que se llaman al revés o no se leen

**`health` en un `func_button` NO ES VIDA.** `CBaseButton::TakeDamage`
(buttons.cpp:439-466) no toca `pev->health` en ninguna de sus 28 líneas: mira si
puede responder y activa. Lo único que hace `health` es
`pev->takedamage = DAMAGE_YES` (buttons.cpp:531-534), o sea que es una **bandera
de «se puede golpear»**. El botón de la manzana tiene `health 2` y se abre con un
golpe de cualquier tamaño. Medido: un golpe de 1 lo abre y la vida sigue en 2.

**`spawnstart` en un `msitem_spawn` significa lo contrario de lo que suena**, con
la misma línea que el 68:

```cpp
m_fSpawnOnTrigger = (atoi(pkvd->szValue)) ? true : false;   // gispawn.cpp:94-98
```

y `Spawn` sólo pone el `Think` que coloca el objeto **si NO está puesta**
(gispawn.cpp:26-33). Los cuatro de Edana traen 1: ninguno sale solo.

**`duration` no la lee nadie.** `CBaseGISpawn::KeyValue` conoce tres claves
—`scriptfile`, `container` y `spawnstart`— y lo demás va a
`CBaseEntity::KeyValue`, que sólo asigna campos de `entvars_t`, y `duration` no es
uno (gispawn.cpp:84-104). Dos de los cuatro de Edana la traen, con **90 000 y
60**, y en el juego original tampoco hacían nada. Se hornea como
`duracionIgnorada` para poder decirlo en vez de suponerlo.

Y una cuarta, que es del `func_button` y el mod se equivoca dos veces seguidas:
`SF_BUTTON_TOUCH_ONLY` (256) se llama «touch», su comentario dice *«button only
fires as a result of USE key»*, y lo que hace el código es **poner el toque** y
quitar el uso (buttons.cpp:539-547). El nombre, el comentario y el efecto, los
tres distintos.

## 4. El comentario del material, que miente

`CBreakable::KeyValue` lleva esto encima de la conversión:

```cpp
// 0:glass, 1:metal, 2:flesh, 3:wood      func_break.cpp:92
```

y el `enum` de verdad es otro (func_break.h:24-35):

```
matGlass = 0, matWood, matMetal, matFlesh, matCinderBlock,
matCeilingTile, matComputer, matUnbreakableGlass, matRocks, matNone
```

Así que **`material 1` es MADERA**, que es lo correcto para un almiar, y el
comentario habría hecho sonar los almiares de Edana a metal. Con el enum bueno:
los 4 de Edana son madera, 12 de Gate City son **roca** (`material 8`) y **4 son
carne** (`material 3`) — las bolsas de las crías de rata.

El horneado escribe además `materialNombre`, para que esto no haya que volver a
deducirlo de un número.

## 5. El reparto son tres listas y no dos

Sacar veinte brushes de la colisión sin darles la suya deja veinte agujeros por
los que se pasa andando, y eso no da error: da un pueblo con boquetes. Es
exactamente lo que ya avisaba el comentario de las puertas del 48, y ahora son
tres listas:

| lista | quién | qué le pasa |
| --- | --- | --- |
| `SOLIDAS` | `func_wall` | va dentro del trimesh del mundo |
| `MOVIBLES` | `func_door_rotating` | malla y colisionador propios, porque gira |
| `ROMPIBLES` | `func_breakable` | malla y colisionador propios, porque desaparece |

**El control de las puertas no se pudo copiar.** El de las puertas dice «si la
mayoría de sus vértices están además en la malla quieta, está emitida dos veces»,
y se sostiene en que una hoja cuelga en el vano sin compartir esquinas con el
marco. Un rompible es lo contrario: es un TAPÓN metido en un hueco. Medido en el
`.bsp` crudo, antes de pasar por nada nuestro: **12 de los 18 vértices del `*61`
de Gate City ya están en el modelo 0**. Se puso rojo en la primera pasada con la
emisión bien.

Así que aquí el control hace la pregunta exacta en vez de la parecida —¿han
quedado caras de rompible en alguna de las otras dos listas?— y no necesita
umbral. Roto a propósito de las dos maneras, da los dos rojos por separado:
`149 caras siguen en la malla quieta` y `149 en la de colisión`.

Y una compatibilidad que hay que decir en voz alta: `tools/bichos.mjs` tiene su
propia lista con un comentario que decía «tiene que ser la misma que `SOLIDAS` de
gatecity.mjs». Ya no lo es, **y debe seguir incluyendo los rompibles**: lo que esa
lista necesita es «lo que choca AL NACER», que es el mundo en el que se colocan
las criaturas. Un almiar entero es sólido; el que se rompe, se rompe después.

## 6. El fallo entre dos piezas que funcionaban: el almiar se tapaba a sí mismo

Éste es el bueno del experimento, y es de la familia del 63.

`elegirObjetivo` pide una traza libre hasta el centro del objetivo, igual que el
motor:

```cpp
UTIL_TraceLine( vecSrc, pTarget->Center(), ignore_monsters, ... );
if( tr.flFraction < 1.0f ) continue;              // pared en medio
//                                   giattack.cpp:1547-1580
```

Con `ignore_monsters` un monstruo nunca se tapa a sí mismo. **Un
`func_breakable` sí**, porque es geometría de colisión de verdad: el rayo del ojo
a su centro choca contra su propia cara, `flFraction < 1`, y el almiar salía
descartado por «pared en medio». Estaba dentro del cono, estaba a tiro y **no se
podía golpear nunca**.

Las dos piezas eran correctas: el candidato estaba bien construido y la traza
hacía lo que el motor hace. El fallo estaba en la costura, y lo cazó la sonda
—`impactos 2` con la vida sin tocar— no una prueba.

El arreglo es un tercer argumento: `libre(desde, hasta, candidato)`, para que
quien traza pueda dejar fuera el colisionador del propio objetivo, que es lo que
`ignore_monsters` hace por los monstruos.

## 7. Y dos huecos que no estaban en la lista

**`env_render` no alcanzaba a nada.** Portado desde el 49, citado y en verde, y
**seis de los siete de Edana apuntan a un `env_model`**: los cuatro platos de
sopa de la taberna (`patronNsoup`) y la manzana del huerto (`apple5`). Los adornos
se horneaban **sin nombre, 0 de 46**, así que `_render` recorría cero entidades y
se callaba. Gate City tiene **cero** `env_render`, y por eso nadie lo vio: es la
trampa del 62 —una regla que no se ejecuta— y otra vez el segundo mapa.

Ahora los adornos llevan `nombre` y su modo de dibujo de nacimiento: **9 de 46 en
Edana** (4 sopas y 5 manzanas, de las que cuatro se llaman `apple1` y no las
nombra ningún `env_render`). Y `_render` emite `enElBus: false` cuando su objetivo
no está en el cableado, en vez de no emitir nada. **Aplicarlo sigue pendiente**, y
la razón es concreta: los 46 adornos van fundidos en **una sola malla**, así que
esconder uno no es apagar un nodo — hay que saber qué trozo de la geometría es
suyo. El hueco está contado con su nombre (`render: el objetivo es un adorno`).

> ### ── CORRECCIÓN DEL 76 ──
>
> **Hecho**, y el diagnóstico de arriba era correcto y la conclusión no. No hubo
> que saber qué trozo de la malla fundida es de cada colocación: **un adorno con
> nombre ya no se funde**. En GoldSrc cada `env_model` es su propia entidad con
> su propio estado de dibujo, así que fundirlos era una optimización nuestra y el
> que puede cambiar es justo el que no puede ir fundido. Nueve mallas más en
> Edana, ninguna en Gate City.
>
> Y el 69 contó aquí **seis de los siete**; son **cinco**. El séptimo
> (`renderFountainNormal`) sí es una entidad del cableado —dos `func_water`— y el
> sexto (`renderfountainBEANS`) no existe en ningún sitio: es una errata del
> mapa. Son tres cajones y no dos, y ahora se cuentan aparte.
>
> También faltaba la otra mitad, que el 69 no podía ver porque el aviso salía
> igual: los cuatro platos de sopa **nacen invisibles** en el `.bsp` y este
> puerto los dibujaba desde el primer fotograma. Ver
> [ADORNOS_76.md](ADORNOS_76.md).

**Cuatro tipos de salida caían por `fall-through` en `aplicarDisparos`.** Estaban
las etiquetas `case "borrar": case "usar": case "render": case "area_ignora":`
sin cuerpo, pegadas a `case "eventoDeNpc"`, y en JavaScript eso no es «no hagas
nada»: es entrar en el cuerpo del siguiente. Así que cada `borrar`, cada `usar`,
cada `render` y cada `area_ignora` corría el lanzador de escenas de NPC con
`s.npc` sin definir, no encontraba a nadie y se apuntaba como
**`eventoDeNpc: sin NPC`**. El 67 leyó ese contador y le achacó un `merc3` que no
existe; el `merc3` es real, pero no estaba solo ahí.

Lo encontró la sonda pidiendo `usar=1` y leyendo 0.

## 8. Lo que sigue roto y se mide como roto

**El bucle del corral no se cierra.** Rompes el almiar de 8, la cloaca recibe su
disparo —y se cuenta— pero los otros tres siguen en pie, porque **`func_door` no
está portado**: Edana tiene **3 puertas deslizantes** y `montarPuertas` sólo coge
las **7 giratorias**. La de la cloaca sigue horneada en el trimesh del mundo: ni
se abre ni devuelve el disparo. Gate City tiene **0** `func_door`, que es por lo
que esto no se había visto.

El número está escrito en la prueba a propósito: `romper` da **1** hoy y dará
**4** el día que se porten las deslizantes.

> ### CORRECCIÓN DEL 70
>
> Es ese día: **el bucle se cierra**. `func_door` está portado y la prueba pide
> **4**. Y al medirlo apareció que la frase de arriba era falsa por partida
> doble: la tapa de la cloaca **no estaba horneada en el trimesh del mundo**.
> `solidas` es el modelo 0 más `func_wall`, y una `func_door` nunca estuvo en esa
> lista, así que no era pared — estaba **sólo dibujada**, y era una lámina de 4
> unidades por la que se pasaba andando. Lo que el 70 le da no es la libertad de
> moverse: es el colisionador que nunca tuvo. Ver [PUERTAS_70.md](PUERTAS_70.md) §1.

**La manzana no cae.** Y no es que falte este caso: es que **este port no tiene
objetos en el suelo**, ni uno, en ninguno de los dos mapas. El aparecedor se
anota con su guion y su nombre —para poder medir que la cadena llega hasta él— y
se cuenta como `objeto_aparece: no hay objetos en el suelo`.

> ### CORRECCIÓN DEL 71
>
> Ya cae. El 71 portó los objetos en el suelo (`src/play/suelo.js`), así que el
> aviso de arriba ya no existe y el párrafo describe un hueco cerrado: golpeas
> la manzana del árbol, cae tres metros y medio, se tumba, se queda 120 s y se
> puede coger con la `x`.
>
> Y de paso resuelve una cuenta que este documento dejó a medias. Aquí se midió
> que `duration` —el `60` del `apple5spawn`— **no la lee nadie**, y era verdad;
> lo que no se podía decir entonces es cuánto dura de verdad una manzana en el
> suelo. Son **120 segundos** (`MSITEM_TIME_EXPIRE`, msitemdefs.h:10), contados
> **desde que toca el suelo** y no desde que nace. Ver
> [SUELO_71.md](SUELO_71.md) §1.

**Y lo que NO se porta, con la cuenta de a quién le toca hoy** (la lección del 68:
una lista de «esto no se porta» envejece con el primer mapa nuevo):

| qué | a cuántas entidades | por qué |
| --- | --- | --- |
| `SF_BREAK_TOUCH` (2) y `SF_BREAK_PRESSURE` (4) | **5**, todas de Gate City | hacen falta la velocidad del jugador y saber que está ENCIMA. Las cinco se rompen igual a golpes |
| `spawnobject` | **0** | está muerto en el mod: la asignación está comentada y la clave va a `CBaseDelay::KeyValue`, que no la conoce (func_break.cpp:115-121) |
| `container` de `msitem_spawn` | **0** | gispawn.cpp:64-83 |
| `explosion` / `explodemagnitude` | **5 con `explosion 1`, 0 con magnitud** | `explosion 1` no es «explota»: `KeyValue` compara con las cadenas `"directed"` y `"random"` y todo lo demás cae en `expRandom`, que es el valor por omisión (func_break.cpp:78-87). Y estallar depende de `Explodable()`, que es `pev->impulse > 0` (func_break.h:66-67). **No explota ninguno de los veinte** |

## 9. Las tres versiones del control del choque, y por qué las dos primeras eran falsas

«El almiar desaparece» se vería igual apagando sólo el dibujo. La única pregunta
que distingue las dos cosas es si se puede pasar, y costó tres intentos:

1. **Teletransportar al jugador dentro de la caja.** `poner` no resuelve
   colisiones, así que entra igual con el almiar puesto. No medía nada.
2. **Andar contra el montón.** Los cuatro almiares caben en dos metros, así que
   romper uno lo tapa el de al lado; y rompiendo los cuatro queda **la pared de la
   casa** detrás. Daba **3,33 m antes y 3,33 m después**, con el trabajo bien
   hecho: un control incapaz de distinguir nada.
3. **Un rayo de arriba abajo.** Se para en la tapa del almiar cuando está entero y
   no encuentra nada cuando se ha roto. Antes: los cuatro sólidos, a −5,69 y
   −6,909 m, que son las alturas de sus tapas. Después: nada en cinco metros,
   porque debajo está el pozo.

Y hubo un cuarto intento fallido por el camino: un rayo horizontal **centrado** en
la caja, que daba `false` con el almiar puesto. Los colisionadores son **trimesh**,
y un trimesh no tiene interior: un rayo que empieza y acaba dentro no cruza ni un
triángulo. Tiene que entrar desde fuera.

Además, la primera medición de «andar» dio 0,27 m y lo achaqué al almiar. **Le
paraba estar cayéndose**: el control en el aire de GoldSrc es casi cero, así que
andar desde 20 cm por encima del suelo avanza 27 cm en dos segundos y medio. Lo
cazó andar hacia el lado LIBRE —que avanzaba lo mismo— y no mirar mejor.

Y una más, de la misma familia: la prueba del cono fallaba a un metro del almiar y
parecía que el cono estaba mal. **Era la altura**: un almiar está en el suelo y el
ojo a metro y medio, así que a un metro en horizontal el centro está a 1,56 m del
ojo, y el alcance de la espada oxidada es 1,52 m. Ahora la sonda calcula dónde
ponerse con el alcance leído del arma y descontando la diferencia de alturas.

## 10. Las roturas a propósito

| qué se rompió | rojos |
| --- | --- |
| el club deja de doblar el daño | 4 |
| `Die` no borra su propio nombre | 3 |
| el botón resta vida como si `health` lo fuera | 6 |
| `libre` pierde el tercer argumento | 1 |
| `romper` no quita el colisionador del mundo | 1 en la sonda |
| `func_breakable` vuelve a la malla de colisión | el horneado para |
| `func_breakable` se queda además en la malla quieta | el horneado para |

La quinta es la que importa más: con ella, **`choca === false` se quedó verde** —
nuestra contabilidad decía que no chocaba y la física seguía chocando. Es por eso
que el control le pregunta al rayo y no a la lista.

## 11. Lo medido

```
npm test                 1699 de 1699  (eran 1654; 45 nuevas)
sonda:edana69            26 de 26      Chromium de verdad
vite build               limpio
```

## 12. Lo que le queda a Edana

1. ~~**Las tres `func_door` deslizantes**, que es lo que cierra el bucle del
   corral.~~ Hecho en el 70, y el bucle se cierra.
2. **Los objetos en el suelo**, que es la pieza que le falta a `msitem_spawn` —y
   que no es de este mapa: no hay ninguno en todo el port.
3. **`env_render` sobre un adorno**, que necesita saber qué trozo de la malla
   fundida es de cada colocación.
4. ~~**`ms_npcscript` tipos 0 y 4** ×3 — Edrin andando a `edrinspot`.~~
   **Hecho en el 77**, ver [ESCENAS_77.md](ESCENAS_77.md), y resultó ser el tipo
   **más común del juego**: 98 de los 172.
5. **Una misión de Edana de punta a punta con una sonda.** `quest` sale 118 veces
   en sus guiones y no se ha seguido ninguna.
6. `merc3`, que una escena `evidence_found` nombra y no existe en Edana.
