# Los bichos de Gate City: 69 NPC con su modelo, su piel y su animación

Informe del experimento 07. Contesta a «¿qué seguiría, reproducir los modelos de
NPC y su IA?» — y por el camino cambia el plan que decía
[PROPUESTA_06.md](PROPUESTA_06.md), porque dos suposiciones de esa propuesta
eran falsas.

## Lo que hay hoy en pantalla

**Los 69 NPC y monstruos que Gate City coloca, cada uno con el modelo que dice
su script, su familia de piel, sus grupos de cuerpo y su animación.**
`SkinnedMesh` de fábrica, sin un solo shader.

| | |
| --- | --- |
| Entidades colocadas | **69 de 69** |
| Scripts resueltos | **25 de 25** |
| Modelos distintos | 18 (modelo + grupo de cuerpo), 4,0 MB extraídos |
| Secuencias comprobadas | **338, las 338 caben en la caja del compilador** |
| Con ciclo de andar | 51; **los 51 andan** a la velocidad de su propio `.mdl` |
| Sobre el suelo | **69 de 69** (antes: 32) |
| Comprobaciones | **428, las 428 en verde** |

```
npm run gatecity:bichos      el censo: quien hay, donde, con que modelo
npm run gatecity:bicho -- monsters/goblin_new     un modelo suelto, con su oraculo
npm run dev                  ?map=gatecity   ·   P = que paseen
```

## 1. La IA de Master Sword NO es C++: son DATOS

Las entidades del mapa no dicen qué bicho son. Dicen qué **script** los define:

```
msmonster_orcwarrior   defscriptfile "monsters/goblin"     spawnarea "spawners1"
msmonster_skeleton     defscriptfile "monsters/spider"
msmonster_dwarf        defscriptfile "monsters/dwarf_zombie_random"
ms_npc                 scriptfile    "gatecity/armorer"
```

Y esos scripts están en `MSC/MSCScripts/scripts/`: **723 en `monsters/`**, en un
lenguaje legible con eventos, variables, `$rand()`, `#include` y condiciones. El
goblin entero son 113 líneas; la rata, 82. La base común
(`base_npc_attack.script`) son **909 líneas de script, no de C++**.

**No hay una IA que portar: hay un intérprete que escribir.** Y el intérprete es
nuestro, como el lector.

### Y no hay pathfinding

`msmonsterserver.cpp` **no toca el grafo de nodos de Half-Life** — `nodes.cpp`,
3 628 líneas, no se referencia desde ahí. Los monstruos de MSR se mueven con
`UTIL_MoveToOrigin`: dirección directa al objetivo, paso a paso, con
`m_StepSize = 18` y una traza para subir escalones. Eso son cien líneas contra
Rapier, no una navmesh.

**Lo que la propuesta del 06 estimaba en «bloque C, sin estimar» resulta ser
mucho más barato de lo que parecía.** Lo caro era lo otro.

## 2. El `classname` de la entidad es DECORATIVO

`msmonster_skeleton` con `defscriptfile monsters/spider` saca **una araña**.
`msmonster_orcwarrior` con `monsters/goblin`, un goblin. Deducir el bicho del
nombre de la clase da tres de cada cuatro equivocados — y no da error: da un
mapa poblado de criaturas plausibles que no son las del juego. Es
`gl_overbright` con otra ropa.

Por eso hay un lector de fichas, [src/bsp/script.js](../src/bsp/script.js), y por
eso **no es un intérprete y se dice**: lee qué modelo pone el NPC, qué animación
usa parado, cuál andando, su nombre, su vida y su tamaño. No ejecuta eventos ni
evalúa condiciones.

Tres cosas que costaron una vuelta cada una, y las tres con su número:

- **Hay TRES nombres de evento de nacimiento**, no uno: `npc_spawn` (213 veces),
  `game_spawn` (64) y `spawn` a secas. Con sólo el primero, **4 de los 25
  scripts de Gate City salen sin modelo**.
- **Hay que seguir los `callevent`.** `dwarf_zombie_sbow` hace
  `{ npc_spawn → callevent darcher_spawn }` y pone el modelo en el otro bloque.
  Sin seguirlo, tres zombis más se quedan sin modelo.
- **`setmodelbody` gana el ÚLTIMO, no el primero.** `gatecity/miner` pone el
  grupo 1 a 1 y luego a 8; el motor los ejecuta en orden. Con el primero, el
  enano sale desarmado.

## 3. Las siete familias de piel, y por qué el pueblo salía en blanco y negro

`NPCs/default_dwarf.script`, línea 49:

```
setprop ent_me skin $rand(1,6)
```

`dwarf/male1.mdl` tiene **siete familias de piel** —`dwarf`, `dwarf2`,
`undeaddwarf`, `blackbeardwhite`, `whitebeardblue`, `whitebeardred`,
`redbeardblue`, `redbeardwhite`, `redbeardred`— y el script elige una al azar
entre la 1 y la 6. Nosotros usábamos siempre la **0**, que es la base sin teñir:
un pueblo de enanos grises donde el juego tiene barbas rojas y negras.

Dos consecuencias en el código, y la segunda es la que importa:

- La malla se agrupa ahora por **`skinref`** y no por nombre de textura. Dos
  mallas con `skinref` distinto pueden compartir textura en la familia 0 y no
  compartirla en la 3, así que agrupar por nombre hace que cambiar de familia
  sea imposible sin volver a emitir la geometría.
- El dado **no se tira en el lector**: la ficha devuelve el rango y quien coloca
  elige con el propio `origin` del bicho. Dos ejecuciones dan el mismo pueblo, o
  una captura no se puede volver a sacar.

## 4. La animación de `.mdl`, con el oráculo dentro del archivo

[src/bsp/mdlanim.js](../src/bsp/mdlanim.js) es `R_StudioCalcBones()` de
`public/xash3d_mathlib.c`, línea a línea. Los seis canales por hueso —tres de
posición y tres de rotación— van comprimidos en un RLE de pares
`(valid, total)`, y **el caso que no es obvio es el del final del bloque**: el
motor se sale del rango `valid` a propósito para leer el primer valor del bloque
siguiente. Quien lo escriba «bien» por su cuenta obtiene una animación que salta
un fotograma de cada ocho, y eso se echa a la tasa de refresco.

### El oráculo

Cada `mstudioseqdesc_t` guarda **la caja envolvente de su secuencia**, escrita
por el compilador con los vértices ya animados. Así que el juez está dentro del
archivo: se animan los vértices fotograma a fotograma y se comprueba que caben.

**338 de 338 secuencias caben**, con el peor vértice a 0,0 unidades en casi
todos los modelos y a 3,8 en el peor.

### Y su control, con tres decodificadores rotos a propósito

Un juez que sólo sabe decir que sí no es un juez. Medido sobre el goblin:

| decodificador | secuencias que caben | el peor se sale |
| --- | --- | --- |
| **el bueno** | **36 / 36** | **0 u** |
| sin la escala de compresión | 0 / 36 | 6 511 u |
| offsets de canal como absolutos | 2 / 36 | 354 u |
| sin animar (postura de reposo) | 28 / 36 | 21 u |

El tercero es el control más flojo y por eso se dice: una postura de reposo cabe
en la caja de muchas secuencias, así que lo que separa no es «caben todas» sino
**cuánto se sale el peor**. Entre 0 y 21 no hay nada. Los tres están fijados en
[test/bsp_bichos.test.mjs](../test/bsp_bichos.test.mjs).

### En el navegador: `SkinnedMesh` de fábrica

GoldSrc asigna **un hueso por vértice y ningún peso**. Eso es exactamente lo que
un `SkinnedMesh` sabe hacer con `skinIndex` y `skinWeight` a (1, 0, 0, 0). Y las
claves son las del propio archivo, no un remuestreo: el motor guarda un valor
por fotograma e interpola lineal en posición y `slerp` en rotación entre dos
consecutivos, que es palabra por palabra lo que hace un `AnimationClip` con
`VectorKeyframeTrack` y `QuaternionKeyframeTrack`.

Tres cosas que no se ven si se hacen mal:

- **Los nombres de hueso pasan a `h0`, `h1`…** Una pista de Three.js se parte por
  PUNTOS, así que un hueso llamado `Bip01.L` rompe el enlace **sin dar error**:
  la pista no encuentra a quién mover y el bicho se queda tieso.
- **El cambio de ejes va en un NODO**, no en los vértices. La malla y el
  esqueleto tienen que sufrir el mismo cambio o el desollado sale torcido. El
  cambio de este proyecto —(x, y, z) de Three es (gx, gz, −gy)— resulta ser
  exactamente un giro de −90° sobre X.
- **Los cuaterniones se alinean a lo largo de la pista.** Dos claves en
  hemisferios opuestos son la misma rotación, pero interpoladas dan **la vuelta
  larga**: un brazo que gira 350° en un fotograma. Hay una prueba que lo fija.

## 5. Y cuatro fallos que sólo aparecieron al poner los bichos

### Los 66 que flotaban

Medido con el arnés de física: **22 de 69 no tenían suelo debajo y 15 flotaban o
estaban medio hundidos**. El `origin` de una entidad de monstruo es donde lo
dejó el mapeador; el motor le hace un `DROP_TO_FLOOR` al nacer.

Preguntándoselo al árbol BSP —`sueloBajo()`, el mismo que arregló el punto de
llegada del jugador— **66 de los 69 caen más de una unidad**, con mediana 31 y
la mayor 116 (casi tres metros). Después: 69 de 69 sobre el suelo.

Es la tercera vez en este experimento que el mismo error cuesta una vuelta: **un
`origin` de GoldSrc no es donde la cosa acaba.**

### El `.bin` desalineado

El tramo de `skinIndex` es de 16 bits, así que con un número impar de vértices
dejaba el siguiente tramo en un desplazamiento impar — y
`new Float32Array(buffer, off, n)` con `off` no múltiplo de cuatro **lanza una
excepción**. Aquí la lanzó. En otro sitio habría dado una copia silenciosa.

### La postura de reposo NO es el fotograma 0

`env_model` declara `sequence`, y **no siempre es la 0**: las 24 `p_swords.mdl`
de Gate City piden la 1 (`dragonsword_floor_idle`) y los dos `p_shields.mdl` la
2 — son sus posturas de exposición, espadas en un perchero y escudos apoyados.

Y lo más fino: **la postura de reposo de un `.mdl` no es el fotograma 0 de su
secuencia 0.** En la mayoría se parecen, y por eso pasó — los 101 adornos se
veían bien menos unos pocos. `props/Lamp.mdl` era uno de los que no, y en
pantalla era un amasijo negro y amarillo encima de un poste que uno mira y no
sabe qué debería ser. Ahora los 17 modelos se posan en el fotograma 0 de la
secuencia que pide su entidad.

### Y la textura del revés, que se cazó jugando

Un `.mdl` no guarda la UV de 0 a 1: guarda **la columna y la fila del téxel**, y
el motor las parte al dibujar, sin voltear nada:

```c
// gl_studio.c   R_StudioDrawPoints()
s = 1.0f / ptexture->width;   t = 1.0f / ptexture->height;
...  pglTexCoord2f( ptricmds[2] * s, ptricmds[3] * t );
```

O sea que `t = 0` es la fila 0 del archivo, **la de arriba**. Three.js voltea
las imágenes al subirlas si no se le dice lo contrario, y con eso la fila 0 pasa
a ser `v = 1`: **los 69 bichos y los 101 adornos salían del revés en vertical.**

No dio excepción, y en un barril no se ve. Se vio en una cara, con la boca
arriba y los ojos abajo, jugando. El amasijo negro y amarillo de `props/Lamp.mdl`
era las dos cosas a la vez: la postura y el volteo.

El oráculo de la prueba es **geométrico y no mira ni un píxel**. En los vértices
de la cara que miran al frente, la altura y la `v` tienen que ir al revés la una
de la otra, porque la frente se pinta en la fila de arriba del dibujo:

| modelo | corr(altura, `uv.v`) | frente | mentón |
| --- | --- | --- | --- |
| `npc/human1` | **−1,000** | fila 15 de 92 | fila 84 de 92 |
| `npc/human2` | **−1,000** | fila 9 de 110 | fila 101 de 110 |

Y con control, que aquí es **la misma cuenta con el volteo puesto**: pone la
frente en la fila 77 y en la 101. Deshacer la corrección en el lector tumba las
dos pruebas con `corr = +1,000`, comprobado.

El mundo **no** lleva esto y no se tocó: `malla.js` emite `(s, −t)` y repite, así
que allí el volteo ya iba en el dato. Medido en la puerta de la fragua,
`corr(altura, uv.v) = +1,000`, y los barrotes salen arriba, que es donde están
en el dibujo.

## 6. El PASEO — y lo que NO es

**No es la IA de Master Sword.** Son treinta líneas que andan hacia delante y
giran al chocar, y existen para comprobar una cosa que no se puede comprobar de
otra manera: **que el ciclo de andar y el avance del cuerpo cuadran**, o sea que
los pies no patinan.

Y la velocidad no se elige: sale del `linearmovement` que el compilador escribió
en la secuencia, partido por su duración. Para el goblin son **72,2 unidades en
2 s = 0,92 m/s**. Si esa cifra estuviera mal se vería — un bicho que patina o
que va de puntillas es exactamente el síntoma.

Medido, 30 s de reloj (`build/sondas/paseo.mjs`):

| | |
| --- | --- |
| Con ciclo de andar | 51 de 69 |
| Se movieron más de 0,5 m | **51 de 51** |
| Distancia, mediana | 5,7 m (el paseo alterna andar y parar) |
| **CONTROL: los que no tienen ciclo** | **0 de 18 se movieron** |
| Sobre el suelo al acabar | **69 de 69** |
| Fuera de la roca | 68 de 69 |

## 7. La luz de los bichos, que es el camino del motor entero

Un `.mdl` no lleva mapa de luz. `R_StudioSetupLighting` calcula **una intensidad
escalar por un color normalizado** y multiplica el modelo entero
(`lightvalues[k] = lightcolor × lv`, `gl_studio.c` línea 2328). Un color de
material es exactamente eso, así que aquí es `MeshBasicMaterial` con `color`, y
no es un atajo: es la fórmula.

Y la parte que faltaba: **el motor suma las `dlight`** al color del modelo,
`dl->color × (radio − distancia) / 256` (líneas 1442-1468). Nuestro glow ES una
dlight, así que los bichos se iluminan al acercarse porque el motor hace eso, no
porque lo hayamos añadido.

Con un fallo de unidades por el camino que merece anotarse: la fórmula está
calibrada para radios de doscientas a seiscientas **unidades**. Hecha en metros,
un glow de 6 m a 2,5 m aporta 3,5/256 = 0,014 — el uno por ciento de lo que
debe. Se veía como «la luz dinámica no hace nada», que es un fallo silencioso
con pinta de ajuste flojo.

## Lo que queda, y en qué orden

1. **Animar los adornos.** Están posados en su fotograma 0 y sus secuencias
   tienen 51 y 101 fotogramas: la vela parpadea y el árbol se mueve en el juego.
   Con el lector ya escrito es pasarlos por el mismo camino que los bichos.
2. **El intérprete de scripts**, que es lo que convierte esto en comportamiento.
   El subconjunto que hace falta para que un goblin persiga y golpee está en
   `base_npc_attack.script` (909 líneas) y en `monsters/goblin.script` (113).
3. **El movimiento del motor**, `UTIL_MoveToOrigin` con su `m_StepSize = 18`, en
   lugar del paseo de treinta líneas.
4. **El parpadeo de los estilos 1 y 6**, que sigue medido y sigue pendiente
   (⅔ de sesión, ver [FIDELIDAD_06.md](FIDELIDAD_06.md)).
5. Y lo que este informe **no** ha tocado: colisión de los bichos, sonido,
   combate, y los 11 scripts de Gate City que además de un modelo declaran una
   tienda con su inventario.
