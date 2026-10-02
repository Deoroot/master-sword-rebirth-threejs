# 78 · Los tipos 1 y 3 de `ms_npcscript`, y el tercer mapa que hizo falta para verlos

El 77 portó los cinco tipos de `ms_npcscript` y midió tres. Los otros dos —el 1
(`SCRIPT_PLAYANIM`) y el 3 (`MOVE_PLAYANIM`)— quedaron **declarados pendientes
en vez de contados verdes**, porque ni Gate City ni Edana tienen uno solo. Son
25 en el juego, en diez mapas que este puerto no tenía.

Este experimento los mide. Para eso hizo falta un tercer mapa, y por el camino
el tercer mapa enseñó cuatro huecos que llevaban abiertos entre uno y veintinueve
experimentos sin que nada se pusiera rojo.

**Resultado: `npm test` 1859/1859 (+17) · `sonda:gertenheld78` 49/49 · nueve
roturas deliberadas, nueve rojas · nada commiteado.**

---

## 1. Por qué `gertenheld_forest2` y no otro de los diez

Los 25 están en `calruin2`, `calruin2_old`, `cleicert`, `deralia`,
`gertenheld_forest2`, `helena`, `hemlock`, `old_helena`, `phobia` y
`thornlands_north`. Lo que decide no es que haya uno: es que se pueda **andar**
hasta él. La regla del apartado 3 de CLAUDE.md —«si su camino no pasa por
`menuselect`, no cuenta»— no se cumple a medias: una sonda que llega al control
disparando a mano la entidad mide otro juego.

`gertenheld_forest2` es el único donde los dos tipos cuelgan de un
`trigger_once` **sin `targetname`**, o sea del pie del jugador:

```
trigger_once *120 (sin nombre)  ──► ms_npcscript JerdidIntroduction  tipo 1
trigger_once *152 (sin nombre)  ──► trigger_relay HearPlayers
                                        └──► ms_npcscript Ghostturn  tipo 3
```

En los demás hay un `multi_manager` esperando a un diálogo o a una muerte.

El mapa entra en `MAPAS_PORTADOS`, que es lo que su propio archivo pedía desde
el 47: «*quien añada el tercero hornea primero y lo mide por el menú después*».

---

## 2. Lo que el tercer mapa destapó

Cuatro huecos, los cuatro con la misma forma: una pieza correcta cuyo caso de
prueba no existía en los dos mapas que había.

### 2.1 El control del árbol BSP tomaba el cielo por suelo

`tools/gatecity.mjs` comprueba que el recorrido del árbol discrimina: encima de
una cara de suelo tiene que salir hueco y debajo sólido. La muestra eran **las
200 caras de suelo más grandes**, y la cara más grande que mira hacia arriba de
un mapa al aire libre **es el cielo** — en `gertenheld_forest2`, 158 de las 200
primeras. Encima de la cara de abajo de la caja de cielo está el propio brush
(sólido) y debajo está el mundo (hueco): contesta justo al revés que un suelo.

El horneado del tercer mapa murió en ese control con **−19 puntos** de
separación y el árbol leyendo perfectamente.

Medido sobre once mapas, con la muestra de ayer **fallaban seis**:

| mapa | 200 mayores (ayer) | todas, sin cielo (hoy) |
| --- | ---: | ---: |
| gatecity | 81 | 61 |
| edana | **51** | 84 |
| gertenheld_forest2 | **−19** | 94 |
| cleicert | 99 | 87 |
| hemlock | **−2** | 86 |
| old_helena | **28** | 82 |
| helena | **14** | 70 |
| phobia | 75 | 66 |
| calruin2 | 92 | 61 |
| deralia | **7** | 67 |
| thornlands_north | **22** | 84 |

El umbral era correcto —lo arregló el 48— y **la muestra se quedó sin tocar**.
Y Edana pasaba **por un punto**: 51 contra un mínimo de 50. Dos arreglos, y
hacen falta los dos: el cielo sale de la lista de suelos, y **no se muestrea**,
porque elegir las mayores era elegir las caras menos representativas que hay.
La misma herramienta ya filtraba el cielo por nombre de textura para otra cosa
(`tools/gatecity_shot.mjs:145`): la convención existía y este control no la
usaba.

### 2.2 Ninguna animación de escena del juego se había horneado jamás

`tools/bichos.mjs` hornea las secuencias que pide una lista blanca, y la lista
sale de la **ficha del NPC**. Pero un `ms_npcscript` nombra sus animaciones en
el `.bsp` —`actionanim` y `moveanim`— y ésas no están en ninguna ficha: son del
MAPA. Así que no se pedían nunca.

El modelo de Jerdid llegaba con **11 de sus 129 secuencias**, sin `wave` ni
`fear2`; el del fantasma con 5 de 25, sin `anim_seal`. No daba error porque el
visor cae a la secuencia 0: el NPC «hace» la escena quieto en su pose de
reposo.

Es el mismo caso que el goblin que atacaba sin animación, comentado en ese
mismo archivo quince líneas más abajo — con la diferencia de que allí el nombre
estaba en el guion y aquí está en el mapa, un sitio que esa herramienta no
miraba para esto.

**Y el 77 no lo vio por casualidad.** Las dos escenas que mueven a Edrin piden
`walk` y `run`, y su ficha ya nombraba las dos (`andando` y `ia.corriendo`). El
valor de reposo del apartado 4, en un sitio nuevo: *la animación que pide el
mapa coincidía con una que ya estaba*.

Arreglado, Edana pide 2 animaciones (las dos que ya tenía, cero cambios) y Gate
City **ninguna**. Por eso sólo se ve en el tercero.

### 2.3 Un `killtarget` que nombra a un bicho no mataba a nadie

`UTIL_Remove` borra **todo lo que se llame así** (`subs.cpp:220-233`). El puerto
sólo miraba el cableado del mapa, y un NPC no está ahí: está en la manada, que
el bus no conoce. `_matar` no encontraba nada y **no emitía nada**.

| mapa | `killtarget` | a un NPC |
| --- | ---: | ---: |
| gatecity | 0 | 0 |
| edana | 2 | 0 |
| gertenheld_forest2 | 13 | **4** |

Uno de esos cuatro es el `SkeletonVanish` con el que se desvanece el fantasma al
acabar su escena del tipo 3. Portado: el bus emite siempre una `borrar` con el
nombre y el mundo la resuelve contra la manada
(`Manada.sacarDelMundo`). **No es morir**: sin golpe, sin animación de muerte,
sin cadáver, sin botín y sin descontarle una vida a su área.

### 2.4 Los `params` de un `ms_npc` no los lee nadie

El fantasma trae `params "set_no_roam;set_race;beloved"` y **pasea igual**: ni
una línea de `src/` mira ese campo. En el mod son eventos de guion
(`monsters/externals.script:1284`, que hace `roam 0`). **No se porta aquí** —es
otro canal entero— y queda contado en la sonda. Tiene consecuencia medible: el
fantasma deambula, así que cuánto anda su escena depende de dónde lo pille.

---

## 3. Lo que hacen los dos tipos, medido

### Tipo 1 — `SCRIPT_PLAYANIM`

`Act` NO entra en la rama de mover, llama a `PlayAnim` y **sí** cae al
`m_MonsterState = MONSTERSTATE_SCRIPT` del final (`npcact.cpp:181`), al revés
que el tipo 2. O sea: pone una animación, gira al NPC al `angles` de la entidad
y lo congela hasta que la secuencia acaba.

Medido con Jerdid: `Scareboi` lo gira **151 grados** (de 325 a 174), le pone
`fear2`, no le pone destino —aunque el mapa traiga `moveanim idle1`, que el
motor sólo lee dentro de la rama de mover— y el nodo de Three **no se mueve
0,00 unidades** mientras la pantalla sí cambia.

### Tipo 3 — `SCRIPT_MOVE_PLAYANIM`

Anda hasta el punto y, al llegar, `MoveThink` entra en
`case SCRIPT_MOVE_PLAYANIM: PlayAnim()` (`npcact.cpp:255`). Medido con el
fantasma: diario `anda -> anima -> espera -> acaba`, `anim_seal` puesta de
verdad, rumbo final 259° (el del mapa), los 0,2 s de `firedelay` y después
`SkeletonVanish`, que se lo lleva del mundo.

### Y una cosa del mapa que no es del motor: las dos escenas se borran entre sí

```
el saludo ──► ... ──► multi_manager PigEncounter ──► relé killscare
                                                     killtarget ScareJerdid
el susto  ──► multi_manager ScareMM ──► relé killencounter ×2
                                         killtarget PigEncounter
                                         killtarget JerdidIntroduction
```

En una partida sólo puede pasar **una de las dos**: gana la que el jugador pise
primero y el mapa borra la otra. Por eso la sonda entra dos veces.

Esto costó cuatro rojos y tres diagnósticos equivocados —que si el volumen no se
tocaba, que si el plazo era corto— antes de mirar el mapa. Lo destapó contar:
`disparadores().cuenta` traía un `killscare: 1` que yo no había pedido, y los
disparadores tocables habían bajado de 15 a 12. *Antes de escribir «está roto
aquí», lee si el propio mapa ya dice dónde* (la lección del 68).

---

## 4. Los dos valores de reposo, vistos antes de medir

1. **`Ghostturn` está a 2 unidades de donde nace el fantasma**, y su proximidad
   es 35,2. Un control anclado en su punto de nacer sería verde antes de que
   pasara nada — el `edrinspot` del 77, otra vez. (Y luego resultó que el
   fantasma pasea, así que lo andado **se mide y se imprime**, no se afirma.)
2. **`JerdidIntroduction` giraría a Jerdid tres grados**: nace mirando a 325 y
   la escena pide 322. El giro se mide con `Scareboi`, que pide 174.

---

## 5. Los fallos del instrumento, que son la mitad del cuaderno

| lo que hacía | lo que medía de verdad |
| --- | --- |
| `probe.mundo.mirar(p)` con el punto en un ARRAY | **nada**. `mirar` toma tres números (`src/dev/sonda.js:1232`): con un array dentro, `x - p[0]` da `NaN`, el `yaw` del jugador se queda en `NaN` y **el cuerpo deja de simularse** — ni cae ni pisa un volumen. Lo heredé de `sondas/edana77.mjs`, que lleva así desde ayer: esa sonda **nunca apuntó la cámara a Edrin** y sus dos controles de píxeles midieron lo que hubiera delante. Las otras dieciocho llamadas del proyecto pasan tres números. Corregido en las dos |
| fotografiar **desde dentro** del `trigger_once` | el centro de un volumen puede caer dentro de un tronco: las tres capturas salieron idénticas byte a byte y los píxeles decían 0 con la animación corriendo. Ahora hay un mirador fijo al lado del NPC y se va a pisar el volumen y se vuelve |
| ponerse 1,6 m por encima de los pies del NPC | el jugador **caía entre las dos capturas**: el suelo de ruido salió 467 456 px de 960 000. Se espera a que los pies dejen de moverse, que es la pregunta de verdad, y no a que pasen N milisegundos |
| contar píxeles en **toda la pantalla** | 1,89 veces el ruido: no pasa, y con razón. En una ventana alrededor del NPC son 5,08. La lección del 76 tal cual |
| igualar el brillo antes de restar | **nada, y eso también se escribe.** Lo añadí razonando que el parpadeo escala el brillo y la animación cambia la forma. Suena bien: el ruido pasa de 1 946 a 1 998 y la señal de 9 889 a 10 962 —de 5,08 a 5,49 veces— y romperlo a propósito dejó la sonda en 49 de 49 **tres pasadas seguidas**. Quitado. La pasada ruidosa que me lo hizo escribir era algo cruzando el cuadro, no el parpadeo: *diagnostiqué el mecanismo por lo que parecía y no por lo que medí* |
| leer al fantasma **después** de acercarse a fotografiarlo | su ataque. Es un mago esqueleto con 1 024 unidades de alcance: al verme se giraba y ponía `anim_projectile`. La escena había hecho lo suyo —el diario entero— y yo leía lo de después. Ahora se lee en el instante en que entra en `animando` y al fantasma no se le acerca nadie |
| `d.paso()` sin mover el reloj, en una prueba de Node | **mi impaciencia**. Una escena no piensa hasta que vence su `nextthink`, 0,1 s después (`npcact.cpp:236`). Es la piedra del 77 —dos piezas con relojes distintos— y la pisé yo, dos pruebas |
| «la escena arrancó» como condición de reintento | una pasada pilló al fantasma a 41 u de su punto y **atascado andando contra algo** —este puerto anda recto y, si se choca, se para— con el diario en `anda` para siempre. La condición buena es «ha llegado a animar» |
| «ninguna escena corriendo» al final | falso, y el código estaba bien: este mapa tiene dieciocho `ms_npcscript` y los dos jabalíes andan todo el rato. Lo que hay que afirmar es que la MÍA ha terminado |
| «169 grados de giro» para el fantasma | un umbral mío: salía de restarle el `angles` de la escena al rumbo con que NACE, y pasea. Lo que distingue «ha girado» de «ya miraba ahí» no es un número fijo |
| «al entrar no hay nadie, hay que pisar las áreas» | las dos áreas tienen `porDisparo` falso, o sea activas de nacimiento (`aparecer.js:136`), y sueltan a los suyos en 1-2 s sin que nadie las toque |

---

## 6. Las nueve roturas deliberadas

| qué se rompió | qué se puso rojo |
| --- | --- |
| 1. el filtro del cielo y el muestreo del árbol | **observado al revés y de verdad**: con el código de ayer, el horneado del tercer mapa murió con «FALLO: el recorrido del árbol no discrimina», −19 puntos. Con el arreglo, pasa con 94 |
| 2. el horneado deja de pedir las animaciones del mapa | 1 prueba de Node (y con ella las tres de la sonda que leen `animacion`) |
| 3. `animar` no apunta `animPedida` | 3 pruebas de Node |
| 4. el tipo 3 no pasa de andar a animar | 2 pruebas de Node |
| 5. `PlayAnim` no gira al NPC | 1 prueba de Node |
| 6. `Manada.sacarDelMundo` no saca a nadie | la sonda, 48/49 |
| 7. el bus no emite el `killtarget` de un bicho | la sonda, 48/49 |
| 8. la cámara se apunta con un array (el fallo del 77) | la sonda, 47/49 — y uno de los dos es el control nuevo «se ve a Jerdid de cuerpo entero», que es justo el que al 77 le faltaba |
| 9. se cuentan píxeles en toda la pantalla | la sonda, 48/49 |

Y una décima que **no cuenta como rotura porque la pieza se quitó**: la
normalización de brillo, verde tres pasadas seguidas. Ver el apartado 5.

---

## 7. Lo que no se porta, contado

- **Los `params` de un `ms_npc`** (`set_no_roam`, `set_race`): son eventos de
  guion y hace falta levantar ese canal.
- **El `reqhp 750`** del fantasma: el `.bsp` pide 750 de vida sumada entre los
  jugadores para sacarlo y el horneado no se lo lleva.
- **El reajuste al hueso 0** de `AnimateThink` (`npcact.cpp:277-287`), que ya
  contaba el 77 y sigue contado (`escena: sin recolocar al hueso`).
- **El grafo de nodos**: aquí se anda recto y, si se choca, se para. En este
  mapa tiene consecuencia visible —el fantasma se queda clavado si ha paseado a
  un rincón tapado— y por eso la sonda reintenta y dice en cuántas entradas.
- **Un tipo 3 que ande de verdad**: aquí son 2 unidades desde donde nace. Los
  hay: `runner1path5` de deralia son 1 818, `kellyrun` de cleicert 949 y los dos
  del jefe de phobia 263 y 272. Andar ya está medido en Edana con 125 (el 77);
  lo que este caso aporta es la transición.

---

## 8. Lo que viene después

1. **Los `params` de un `ms_npc`**, que es un canal entero y arregla de paso la
   única fuente de ruido que le queda a esta sonda.
2. **`setmovedest` de verdad** (el gancho `irA`, `=> {}` desde el 43), que es lo
   que el 77 dejó como primer pendiente y sigue siéndolo.
3. Los tipos 1 y 3 **con un NPC que ande**: el mapa está elegido y medido arriba.
4. Lo que el 77 dejó: una misión de Edana de punta a punta, el botín de los
   cadáveres, el haz de luz aditivo de la cloaca del 70.
