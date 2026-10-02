# 39 · Por dónde no pasan, y los 38 que no estaban

El encargo era «el pathfinding de los NPC humanos y enanos, ¿está todo bien?». La
respuesta corta es que **no hay pathfinding y no hay ninguno que portar**, y que
por el camino salieron dos cosas más grandes que la pregunta.

Cuatro medidas, en orden de lo que costó cada una.

---

## 1. El grafo de nodos no existe, y ya lo sabíamos

Dije en la conversación que lo que faltaba era el grafo de nodos de Half-Life. Era
falso, y el proyecto ya lo tenía escrito desde el experimento 07
([BICHOS_07.md](BICHOS_07.md), sección «Y no hay pathfinding»): *«`msmonsterserver.cpp`
**no toca el grafo de nodos de Half-Life** — `nodes.cpp`, 3 628 líneas, no se
referencia desde ahí»*. Lo medí hace treinta experimentos y no lo releí.

Y el `.bsp` lo confirma por su lado:

```
gatecity.bsp: entidades  715 en 33 clases
info_node                0
info_node_air            0
```

El grafo de Half-Life **se genera de esas entidades**, que coloca el mapeador a
mano; sin ellas no hay grafo. De ahí que `msr/maps/graphs/` no exista en la
instalación mientras `valve/maps/graphs/` tiene cuarenta `.nod`.

## 2. Lo que sí hay son 101 vallas invisibles, y no teníamos ninguna

```
func_monsterclip   101 entidades | numfaces 0 | los 4 headnodes de clip: los 101
volumen SOLIDO     872 m³ (mediana por entidad 1,78 m³)
```

Tres pasos que por separado están bien y juntos hacían desaparecer 101 paredes:

1. el compilador les quita las caras — **está comprobado desde el 12** en
   `test/bsp.test.mjs` («las entidades invisibles no traen ni una cara»);
2. nuestra malla de colisión se construye **de caras** (`SOLIDAS` en
   `tools/gatecity.mjs`);
3. luego no había monsterclip en el mundo, y nada daba error: **estos brushes no se
   dibujan ni en el juego**, así que no había nada que ver en ninguna captura.

Para quién es sólido, con cita:

```cpp
pev->flags |= FL_MONSTER | FL_MONSTERCLIP;              // msmonsterserver.cpp:169
if ((touch->v.flags & FL_MONSTERCLIP) && !clip->monsterClipBrush) continue;
                                                        // world.cpp:1196
// "This can be used to keep specific monsters out of certain areas"
                                                        // bmodels.cpp:270
```

### Un número mío que estaba mal por un factor de 37

Dije «32 428 m³, de los que 31 058 son un solo brush: la muralla del pueblo». Es
falso. **32 428 es la suma de las cajas envolventes**; el volumen sólido son
**872 m³**. Y esa entidad de caja enorme son **cuatro losas de 425 m³ repartidas
por sitios distintos del mapa** — una entidad puede agrupar brushes disjuntos, así
que su caja envolvente no es su forma ni de lejos. No hay muralla: hay **cien
bloques de metro y pico** puestos en puertas, escaleras, cornisas y puestos del
mercado. Con cien bloques bien puestos basta, y eso es más interesante que una
muralla.

La prueba que lo defiende compara las dos cuentas a propósito
(`test/monsterclip.test.mjs`, «no hay muralla: son cien bloques pequeños, y la caja
NO es la forma»), porque la caja sólo vale para filtrar barato y nunca para decidir.

### La trampa: el que anda la ve y el que mira no

Esto es lo que no se adivina, y es la mitad del trabajo:

| quién | de dónde saca su `monsterClip` | ve el clip |
| --- | --- | --- |
| `UTIL_TraceLine` | **`FALSE` a fuego**, `pr_cmds.cpp:335` | **no** |
| `SV_movestep` (andar) | `ent->v.flags`, `sv_move.cpp:44` | sí |
| `TraceMonsterHull` | `pEdict->v.flags`, `pr_cmds.cpp:604` | sí |
| `DROP_TO_FLOOR` | `ent->v.flags`, `pr_cmds.cpp:1696` | sí |

Y las dos cosas que usan `UTIL_TraceLine` son justo las dos que uno metería
primero: **elegir el rumbo del paseo** (`UTIL_TraceLine(EyePosition(), VecDest,
...)`, `msmonsterserver.cpp:1084`) y **la vista** (`FVisible`, `combat.cpp:1294`).

O sea que un monstruo apunta su paseo **a través** de un monsterclip que no puede
percibir, anda hacia allá, y se queda empujando contra una pared invisible hasta
que vence el plazo de siete segundos. Es feo y es el suyo. Meterlo también en el
rumbo lo haría mejor y ya no sería Master Sword.

### Lo que mide, con los 16 aldeanos de Gate City, 300 s

| | sin valla | con valla |
| --- | --- | --- |
| avanza | 71,1 % | 53,7 % |
| «pared delante» | 27,3 % | 16,2 % |
| **«monsterclip»** | 0 % | **26,1 %** |
| alejamiento medio de su puesto | 32,1 m | **15,5 m** |
| bichos a más de 30 m de su puesto | 26 | **12** |
| coste de simular 300 s | 1 167 ms | 1 211 ms |

**La valla no les hace andar mejor: les impide irse.** El tiempo bloqueado SUBE —de
27 % a 42 %— porque ahora hay más cosas contra las que chocar, y eso era la
predicción antes de medirlo. Lo que baja a la mitad es cuánto se alejan de donde el
mapeador los puso.

### Medios espacios y no vértices

Un brush del `.bsp` no está guardado como poliedro: está guardado como **árbol de
planos**, y cada hoja sólida es la intersección de los medios espacios que se
cruzan para llegar a ella. La lista de planos **ya es** la forma, exacta. Con ella
un segmento se prueba recortando su intervalo `t`: veinte líneas y ningún caso
especial. Reconstruir los vértices para volver a sacar los planos sería dar una
vuelta perdiendo precisión.

El oráculo es el propio archivo, que es el único juez que hay aquí: **40 400 puntos
muestreados, acuerdo total, y 9 188 de ellos sólidos** — el segundo número importa
tanto como el primero, porque un `dentro()` que dijera siempre «no» también daría
acuerdo perfecto si no cayera nada dentro.

Y va **fuera de Rapier** a propósito: un colisionador de más en el mundo lo tocaría
también el jugador, y el monsterclip es exactamente lo que el jugador no debe tocar.
Manteniéndolo aparte eso no es una bandera que se pueda olvidar: es imposible por
construcción.

## 3. Treinta y ocho de los sesenta y nueve bichos no eran bichos

Esto empezó mirando «las cuatro ratas gigantes que no se mueven» y acabó en otro
sitio.

```
"classname"     "msmonster_giantrat"
"defscriptfile" "monsters/giantrat"
"scriptfile"    "monsters/spider_mini"     <- lo que sale de verdad
"spawnarea"     "spawn_babies1"
"spawnchance" "100"  "lives" "1"  "delaylow" "1"  "delayhigh" "2"
```

Y al lado, una `func_breakable` por cada una, de z −791 a −771, con `health 1`,
`rendercolor 0 0 0` y `target spawn_babies1`. **Son bolsas de huevos**: cuatro
sacos negros que se rompen de un golpe y sueltan una araña pequeña. Nunca fueron
ratas y nunca estuvieron atascadas.

Y el `spawnarea` no es un adorno, son dos líneas del motor:

```cpp
// CMSMonster::Spawn — msmonsterserver.cpp:228
if (m_iszMonsterSpawnArea.len()) { SetBits(pev->effects, EF_NODRAW); return; }
// CMSMonster::Activate — msmonsterserver.cpp:129
if (!m_fSpawnOnTrigger) SUB_Remove();
```

**Un bicho con `spawnarea` no nace: se registra en su área y se borra.** En Gate
City son **38 de 69**, y son todos los hostiles — los 8 goblins, los 22 enanos
zombi, las 3 arañas, el cofre del tesoro y las 4 crías. Los 31 que quedan son los
12 enanos, los 4 humanos y los 15 tenderos y curas.

Lo que esconde colocarlos a los 69 de pie es que **la posición estaba bien**:
ninguna de las 16 áreas de Gate City pone `spawnloc 1`, y el cero por omisión es
fijo, así que el bicho sale en el origen de su propia plantilla. Lo que faltaba era
el *cuándo* y el *volver*:

```
t=0.0   en el mundo 31/69   cilindros 31
t=2.9   en el mundo 31/69   cilindros 31    <- pev->nextthink = ltime + 3.0
t=3.1   en el mundo 47/69   cilindros 47    <- uno por área, 16 áreas
t=4.0   en el mundo 69/69   cilindros 69    <- flNextSpawnTime += 0.2
```

Y al matar a uno con vidas infinitas: el cadáver se va a los 23,6 s (20 quieto más
3,64 de desvanecerse) y **el bicho vuelve a los 443 s**, con la vida llena y con su
cazador. Eso es el «monster respawn» que el README llevaba apuntado como pendiente
desde el 28.

### Los tres valores por omisión que se leen al revés

1. **Cero vidas es infinitas.** `if (!m_Lives) m_Lives = -1; //zero == infinite
   lives` (`msmonsterserver.cpp:202-203`). **16 de las 38 no dicen `lives`.** Leerlo
   como «cero vidas, no vuelve» vacía el pueblo y tarda veinte minutos en notarse.
2. **La primera aparición no espera.** `delayvalue = 0` al registrar, con el
   comentario del motor al lado: *«Monsters now spawn immediately the FIRST time.
   The respawn delay only affects respawns»* (`msmapents.cpp:1092-1094`). Los
   goblins esperan de 300 a 500 s entre vidas; si contara la primera, el pueblo
   estaría vacío los primeros cinco minutos.
3. **La probabilidad se compara contra `RANDOM_FLOAT(0, 99)`**, no contra 100
   (`msmapents.cpp:1214`). Con `spawnchance 100` —lo que dicen las 38— **nunca
   falla**, o sea que ese camino no se ejerce en este mapa. Se porta igual con una
   prueba que lo ejerce a mano, porque si no sería código muerto y sin comprobar.

### Lo que NO se porta, dicho aquí y no descubierto luego

`nplayers`, `hpreq_min`/`hpreq_max`, `m_nRndMobs` (la lista al azar), `dmgmulti` y
`hpmulti`, `resetwhen` 1 y 2, `killtarget`/`perishtarget` y el limitador
`SpawnLimitReached`. **Ninguna de las 38 plantillas de Gate City usa ninguno**, así
que portarlos sería escribir sin nada con que comprobarlo. `fireallperish` sí está,
porque `spawn_bowguys` lo usa para abrir `skele_treasure`: el cofre del tesoro sale
cuando mueren los tres ballesteros.

### Y lo que sigue roto, a propósito

Dos de las cuatro bolsas tienen su `origin` **dentro** del saco (−790, y el saco va
de −791 a −771), así que la araña sale encerrada: el techo le queda a 18 unidades
justas y `m_StepSize` son 18. **Y eso es correcto: está dentro de un huevo.** Lo que
falta para que salga es romper el saco, y `func_breakable` está horneado dentro de la
malla de colisión y no se puede romper. Queda apuntado en el README.

## 4. Dos fallos nuestros más pequeños, de paso

### La cintura, sumada dos veces

El arnés sumaba 0,9 m a la altura que le dieran, y el paseo le daba **el ojo**
(`EyePosition()`, `msmonsterserver.cpp:1084`). El rayo del paseo salía a **2,27 m
del suelo en un enano de 1,37**: elegía rumbos despejados a la altura de la cabeza y
se estrellaba contra los puestos del mercado a la altura de la cintura.

| 16 aldeanos, 300 s | antes | ahora |
| --- | --- | --- |
| p99 del atasco contra una pared | 75,1 s | **44,6 s** |
| el peor | 75,1 s | **45,4 s** |

El contrato quedó escrito: **`libre` traza desde la `y` que se le da**, y la cintura
la suma quien anda, porque es una decisión de `avanzar` y no del mundo.

### El suelo del árbol del mundo no es el suelo de quien choca

`sueloBajo` caminaba el árbol del **modelo 0**; los `func_*` con brushes viven cada
uno en su propio modelo y **no están en ese árbol**. Así que un punto encima de una
caja rompible salía «vacío» y el censo colocaba dentro de ella lo que hubiera
encima. Arreglado con `solidoPara` (`src/bsp/arbol.js`), que cuenta las mismas
entidades que entran en la malla de colisión — porque cuando las dos listas no
coinciden, el mundo donde se colocan los bichos y el mundo donde caminan son dos
mundos.

Alcance honesto: **cambia 4 de 69, y los cuatro son las bolsas de huevos.** El
contrato es correcto y defiende mapas futuros, pero hoy no cambia nada que el
jugador vea.

---

## Los fallos que cometí y cómo se cazaron

Cinco, y tres los cazaron controles nuevos, que es de lo que va esto.

**El invariante del cilindro, escrito al revés.** Puse
`if (i.dormido === i.conCilindro) continue`, que salta exactamente los dos casos que
hay que arreglar. En el servidor no se notó porque al aparecer llamaba a `poner`
aparte, así que el bucle era código muerto; en el navegador no había esa segunda
llamada y quedaron **69 bichos en el mundo con 31 cilindros** — visibles,
atravesables, sin un error en consola. Lo cazó un control nuevo de `sonda:arco` que
compara las dos cuentas. Ahora está escrito como invariante: *tiene cilindro si y
sólo si está en el mundo*, y en un solo sitio.

**Leer `manada.sucesos` sin vaciarlo.** Los cilindros se quitaban con el suceso
«sale». De `manada.sucesos` tira el protocolo y se vacía cuando hay un cliente que
lo consuma; con la partida vacía **nadie lo vacía**, así que el mismo «sale» se
procesaba en cada paso y le quitaba el cilindro al bicho justo después de que su
área le devolviera el suyo. Un monstruo que vuelve y se atraviesa, sólo cuando no
mira nadie. Se cambió por cuadrar contra el estado, que no se puede desincronizar.

**Un control que se medía contra sí mismo.** La prueba de «no aparece nada antes de
los 3 segundos» usaba `PRIMER_PENSAMIENTO - 0.05` en su bucle. Poniendo la constante
a cero, **la prueba seguía verde** y el pueblo aparecía lleno al entrar. Los 2,95 van
ahora a mano. Es la cuarta vez que este laboratorio se encuentra la misma forma de
fallo y la primera en que la encuentro en mi propia prueba del mismo día.

**`revivir` dejaba el bicho sin cazador.** La muerte pone `i.cazador = null`; un
bicho que vuelve sin él está vivo, con la vida llena, y es pacífico para siempre. Lo
avisaba el comentario que yo mismo acababa de escribir dos líneas antes («lo que se
olvide aquí es un bicho que vuelve roto») y aun así lo olvidé.

**Las sondas dejaron de recorrer el camino del jugador.** `bichos.cazar` no saca a
los monstruos —lo hace `bichos.aparecer`, que llama el bucle de `main.js`— así que
las sondas que pisan la manada a mano medían un pueblo vacío: `sonda:ia` cayó a 11
de 15 con cuatro «null» seguidos. Se arregló con **una** función en `src/dev/sonda.js`
(`pasoDeBichos`) por la que pasan las siete llamadas, y con `esperarApariciones` en
`sondas/mismo.mjs` para las que sólo teletransportan y disparan. Es el mismo aviso
del 36 con otra ropa: cuando el juego gana un paso, las sondas lo pierden.

## Lo que queda rojo y por qué no lo he tocado

- **`sonda:arco`, «la flecha vuela de verdad: cientos de unidades»** — pared a 150 u
  justas contra un umbral de `> 150`, y la desviación del arco es aleatoria por tiro
  (medido: 10,5° y 12,7° en dos tiros seguidos, 139 u y 150 u). **Era una moneda al
  aire desde antes**: cuando se dispara, los bichos están dormidos, o sea con menos
  colisionadores que antes, y eso sólo puede alargar el vuelo. Diagnosticado, sin
  retocar.
- **`sonda:ranuras`, «una opción que no sirve DICE por qué»** — «Visit a Kingdom» ya
  sirve desde el 34, así que el control afirma un mundo anterior. Es del área del
  otro trabajo en este árbol y no lo toco.
- **`sonda:pulido`, cuatro rojos de sonido** — los cuatro afirman el horneado de
  Xash3D («declaradas GENERADAS», «los que faltan siguen faltando», «los
  `common/bodydrop*` NO están») y el árbol está horneado como mod de GoldSrc desde
  el 38. Consecuencia del 38, no del 39.
- **`sonda:mapa`, el positivo del agua** — rojo desde el 21 y sin aprobar.

## Cuentas

`npm test` **1 034** (eran 1 003) · `consecuencias` **46/46** (eran 44, con dos que
afirmaban un fallo nuestro) · `arco` 36/37 · `ia` 15/15 · `mundo` 40/40 ·
`golpe` 25/25 · `escudo` 34/34 · `hud` 36/36 · `mapa` 32/33 · `monsterclip`
10 pruebas nuevas · `aparecer` 16 nuevas.
