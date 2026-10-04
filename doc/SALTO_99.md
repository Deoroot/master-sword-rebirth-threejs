# El salto cortado tras un teletransporte — experimento 99 (agente O)

El 98 dejó esto pendiente (doc/ATURDIR_98.md §7): en el sitio de aparecer de
Gate City, justo después de `probe.mundo.poner`, el salto se quedaba en
0,03-0,16 m dos de cada seis veces; tras andar 0,3 s, seis de seis enteros. Lo
achacó a la regla del «techo» de `Player.step` —que es nuestra, no del motor—
y dijo que lo fiel era `PM_FlyMove`/`PM_ClipVelocity`.

**La regla era nuestra, sí, y se ha cambiado. Pero no era la causa.** La causa
era el sitio: el nacimiento que elige `tools/aparicion.mjs` dejaba al jugador
**dentro de una pared**, con la cabeza bajo el alféizar de una ventana. El
«techo» que veía la regla existía.

```bash
node --test test/salto99.test.mjs   # 15 verdes
npm run sonda:salto99               # Gate City por el menú: 11 de 11
```

## 1. Lo que se midió, en orden

**En el navegador**, con un gancho sobre `Player.step` que apunta cada paso y
cada choque que devuelve el controlador de Rapier (`computedCollision`):
teletransporte al sitio de aparecer (+5 cm, como la 98), 300 ms quieto y la
barra. **Ocho de ocho cortados** a 0,06 m —no dos de seis: depende de a qué
altura deje `poner` la cápsula, ver abajo—. Paso a paso:

| paso | pedido (m) | aplicado (m) | vertical | choques |
| --- | ---: | ---: | --- | --- |
| reposo | −0,0271 | 0 | 0 | suelo (−0,13, 0,83, −0,54) y **(0, −0,99, −0,14)** a `toi` 0 |
| salto | 0 | 0 | 0 → 268,3 | — |
| siguiente | 0,1108 | **0,0018** | 268,3 → **0** | (0, −0,99, −0,14) y (0,22, −0,97, −0,12) a `toi` 0 |

Una normal (0, −0,99, −0,14) **mira hacia abajo**: es un techo, y está tocado
ya en reposo. La regla vieja (`applied.y < mover[1] / U × 0,5`) veía 0,0018 de
0,1108 y ponía la vertical a cero. Pero con `PM_ClipVelocity` contra esa
normal la subida también se va: 268 → (0, 5, −37). **Cambiar la regla no
arreglaba esto.**

**En Node**, con la malla de colisión de `build/gatecity` y el mismo `poner`,
se reproduce sin navegador. Los triángulos alrededor del punto, leídos de la
malla:

- una pared en z = −70,71 de escena, mirando a −z, desde el suelo (−14,63)
  hasta −11,68;
- un marco octogonal de ventana que **sobresale 0,11 m** de esa pared, con
  la cara de abajo en y = −12,70: **1,93 m sobre el suelo**;
- el jugador, en z = −70,866: **a 0,155 m de la pared con 0,406 de radio**.
  La cápsula está 0,25 m dentro de la pared, y su cabeza (−14,53 + 1,83 =
  −12,70) en la cara de abajo del alféizar.

Rapier no saca de la pared a quien empieza dentro (el controlador de
personaje no despenetra), y desde ahí devuelve choques a `toi` 0 con normales
de lo que tiene pegado: el alféizar. Barrido de la separación a la pared y de
la altura del teletransporte, con la regla vieja:

| separación | +0 cm | +5 cm | +10 cm | +15 cm | +20 cm | +30 cm |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0,155 m | 0,28 | 0,20 | 0,02 | 0,03 | 0,11 | 1,17 |
| 0,30 m | 1,31 | 1,32 | 1,30 | 1,22 | 1,25 | 1,20 |
| 1,0 m | 1,14 | 1,14 | 1,14 | 1,14 | 1,14 | 1,14 |

(saltos en metros, sin esperar). En la pared el resultado depende del
centímetro en que se suelte la cápsula —por eso «dos de seis» en la 98 y
«ocho de ocho» aquí—, y a 0,30 m, también dentro, el salto sale **un 15 % más
alto**: la cápsula salta despedida. A un metro, 1,143 m siempre, que es
`ALTURA_DE_SALTO` (45 u).

**Y andar lo arreglaba porque te sacaba de la pared.** Ni la regla ni el
teletransporte: el sitio.

## 2. Por qué el sitio estaba mal

`tools/aparicion.mjs` comprobaba que «se puede estar de pie» con dos PUNTOS:
`sePuedeEstar` (casco 0) a +8 y a +68 sobre el suelo. Un punto cabe a 6
unidades de una pared; un jugador no, es una caja de 32×32×72
(`VEC_HULL_MIN/MAX`, util.h:464-465). El motor pregunta con la caja:
`PM_TestPlayerPosition` con el casco 1 (ReHLDS pmovetst.cpp:346), y si sale
sólido, **`PM_CheckStuck` no te deja moverte en todo el paso**
(pm_shared.cpp:3183-3189), con una tabla de empujones de como mucho 6
unidades (`PM_CreateStuckTable`, :3406) que no saca a nadie de 18.

Con el casco 1 del `.bsp` en `[80, 2790, −576]` (el rayo elegido), la caja
es sólida de +37 a +60 y deja de serlo a 20 unidades de la pared. O sea que en
Master Sword ese sitio **no es de pie**: te quedarías congelado. En este
puerto se podía andar (Rapier no tiene `PM_CheckStuck`) y no saltar.

### Lo que cambia

- `src/bsp/arbol.js`: `contenidoEnCasco` (`PM_HullPointContents`, ReHLDS
  pmovetst.cpp:104-133, con los clipnodos) y `cabeDePie`.
- `tools/aparicion.mjs`: `cabeDePie` en las reglas duras, en el filtro de los
  rayos, en `apartar` y un control nuevo —«cabe la CAJA del jugador donde
  aparece»—, porque el control de puntos de al lado **estuvo verde con el
  jugador 10 unidades dentro de una pared**.

**Y de los 31 rayos de luz de Gate City, 28 no caben.** Son haces de ventana
de 8 a 32 unidades de ancho que caen pegados a la pared de debajo de su
ventana: el sitio debajo de un rayo es, casi por definición, contra una
pared. El nacimiento de Gate City pasa a ser **«Priest of Urdual
(apartado)»**, `[88, 2472, −416]`, a 1,6 m del sacerdote, luz 66 (el rayo
tenía 81). Es la elección del 50 por el ancla del templo y no por la luz; la
regla del rayo sigue, y en Gate City ningún rayo la cumple. **Esto cambia
dónde aparece un personaje nuevo en Gate City**, y es una decisión visible:
si se prefiere seguir bajo un rayo, habría que apartar el punto del rayo
hasta que quepa, como `apartar` hace con los NPC, en vez de descartarlo.

### Lo que se entendió mal por el camino, en el control

La primera versión de `cabeDePie` miraba la caja a +37 exactos y **tiró el
`ms_player_begin` de Edana**, que es del mapa y está bien puesto. El suelo bajo
la planta de la caja es desigual: a +36-38 sólido, a +40 libre. La caja se
apoya en lo más alto que tenga debajo, no donde el punto. Ahora sube de unidad
en unidad hasta un escalón (18, `sv_stepsize`); una pared no se acaba en 18
unidades (la de Gate City sigue sólida a +60). Los otros cuatro mapas
(Edana, las cloacas, el bosque, sala88) **no cambian de nacimiento**; sólo
Gate City.

## 3. La regla del techo, cambiada igualmente

Aunque no fuera la causa, la regla era nuestra y se equivocaba por dos lados
que se pueden medir:

| caso | regla vieja | motor (`PM_ClipVelocity`) |
| --- | --- | --- |
| techo plano tocado al 40 % del paso | vertical 0 | −6,79 (−0,125 de MSR y media gravedad) |
| techo plano tocado al **64 %** del paso | **255 u/s: sigue subiendo contra el techo** | −6,79 |
| techo a 45° | vertical intacta, **0 de lado** | (124,3, 117,4): **desliza** |

`velocidadContraPlanos` (src/play/movimiento.js) porta los planos de
`PM_FlyMove` (pm_shared.cpp:1046-1203) sobre la lista de choques del
controlador de Rapier: `toi > 0` es `trace.fraction > 0`, la rama que refleja
es la de `onground == -1` (:1128-1144), la de la arista es la de la escalera,
y «don't stick» (:1199-1203) es chocar sin avanzar nada. El recorte va entre
las dos medias gravedades, como en `PM_PlayerMove` (:3282, :3364, :3381), y
antes de apuntar la caída, porque `flFallVelocity` se toma al EMPEZAR el paso
(:3201).

Dos cosas del motor que salen al portarlo:

- **Las líneas 961-969 de `PM_ClipVelocity` son de MSR**, no de Valve: si
  tras recortar la velocidad no sale del plano, se empuja hasta
  `DIST_EPSILON` (0,125). Contra un techo plano la vertical no queda en 0 sino
  en −0,125.
- **Y ese empujón es una moneda.** Con rebote 1, `DotProduct(out, normal)`
  después de recortar es cero por construcción, y que el flotante salga
  −1e−14 o +1e−14 decide si se empuja o no. En el motor igual (son `float`).
  La prueba del techo a 45° lo tenía exacto y salió roja: ahora el margen es
  el del empujón entero. Es el 81 —un `<=` en el borde que decide el último
  bit—, pero esta vez es del motor y se porta tal cual.

**Lo que NO está portado**: el recorte en el suelo. `PM_WalkMove` también
llama a `PM_FlyMove` (:1355, :1380), y eso le quitaría a la velocidad
horizontal la parte que entra en cada pared y cada rampa. Aquí la velocidad
sigue sin enterarse de las paredes cuando andas (Rapier desliza el
desplazamiento, la velocidad no). Es otro experimento, y tocaría todas las
sondas de andar.

Y lo que el recorte no puede arreglar: Rapier da normales de ARISTA donde
el motor da caras. Saltando pegado a la pared de Gate City (a 0,43 m), la
cabeza redonda de la cápsula toca el canto del alféizar con normal
(0, −0,65, −0,76): el motor, con una caja de techo plano, pararía en seco (el
hueco son 8 cm); la regla vieja dejaba saltar 1,08 m; la nueva desliza y
sube 0,5 m apartándose de la pared. Ninguna es la del motor: es la forma de la
cápsula.

## 4. La rotura deliberada

Cada rotura, comprobada con `grep` antes de pasar nada (el 80):

| rotura | Node | sonda |
| --- | --- | --- |
| R1: la regla vieja en vez del recorte | rojas las dos que separan (techo al 64 %, techo a 45°); verdes el control del 40 % y el del aire libre | **11/11 verde**: con el nacimiento nuevo no hay techo que tocar. La sonda defiende el sitio; la regla la defienden las pruebas |
| R2: `cabeDePie` siempre cierto, y rehornear | rojas «el rayo de antes no cabe» y «salta entero en el primer paso, seis de seis» | **5/11**: los seis saltos rojos, a **1,37-1,38 m** |
| R1 + R2: el estado del 98 | | 5/11: los seis a **0,17 m** |

**El verde que no medía nada, otra vez.** La primera versión de la sonda
pedía «entero» como 0,9-1,4 m. Con R2 puesta salió **11 de 11 verde**: con el
recorte nuevo, desde dentro de la pared la cápsula salta despedida a 1,38 m,
y 1,38 cabía en el margen. Un salto un 21 % más alto está tan mal como uno
cortado; ahora el margen es 1,05-1,20 m (45 u = 1,143 m, medido 1,12-1,14 al
aire libre) y R2 es roja. Lo cazó la rotura, no mirar mejor.

**El control del instrumento**: un sitio de Gate City con techo plano a 0,5 m
sobre la cabeza (buscado con rayos de Rapier sobre la malla), donde el salto
sale cortado a 0,32-0,44 m. Sin él, «salta entero» podría ser un instrumento
que lee siempre lo mismo. La búsqueda con el casco 1 del `.bsp` encontró
primero un sitio que la malla de colisión no tiene (se caía al vacío): el
`.bsp` y la malla son dos mundos, y el control va en el del jugador.

## 5. Resultados

- `node --test test/salto99.test.mjs`: 15 de 15.
- `npm run sonda:salto99`: 11 de 11 (saltos sin andar 1,12-1,14 m, seis de
  seis, tres a los 300 ms y tres en el acto; bajo el techo bajo, 0,40 m).
- Vecinas, de una en una: salto93 y aturdir98 en verde. **fisica 18/19**: la
  roja es «la pantalla de opciones lista las acciones: 0», de la interfaz.
  **cuerpo** se cae en un clic de la hoja de habilidades (`.mx-detalle`
  tapa la fila «Spell Casting»). Las dos salen igual de rojas con el
  nacimiento viejo rehorneado (R2), así que no son de esto. Y con el
  nacimiento viejo fisica da **15/19**: andar hacia atrás «0,601», de lado
  «0,401», correr «163 contra 154 u/s» — las razones de andar medidas desde
  dentro de la pared. El sitio nuevo también arregla eso.
- `npm test`: las rojas que hay son de `test/reaparecer99.test.mjs` y
  `test/red_27.test.mjs`, de trabajo a medias de otra sesión en `src/red/` y
  `src/play/atasco.js`; `red_27` sale igual de roja con el recorte apagado.

## 6. Pendiente

- El recorte en el suelo (`PM_WalkMove` → `PM_FlyMove`), §3.
- `PM_CheckStuck`: un jugador teletransportado dentro de una pared sigue
  pudiendo andar en este puerto. Otra sesión lo está portando
  (`src/play/atasco.js`, `test/reaparecer99.test.mjs`).
- **Decisión del usuario**: el nacimiento de Gate City ya no está bajo un
  rayo de luz (§2). Si se quiere el rayo, apartar el punto hasta que quepa.
- `sondas/aturdir98.mjs` sigue asentándose andando: ya no hace falta, y se ha
  dejado con una nota.

## 7. Corrección del mismo 99, tras la integración: el recorte se comía un escalón

La integración encontró `sonda:red95` en 11/12: Beto se quedaba en
x = 17,25 de Edana sin subir un escalón. **Era mío.** Reproducido en Node con
`Player` solo, por el camino de la sonda (NACER → PASO → RINCON):

| versión | cruza x = 17,6 | llega al rincón |
| --- | ---: | ---: |
| HEAD (regla vieja) | paso 190 | paso 227 |
| recorte del §3 | nunca | nunca: (17,24, −4,45) a los 1 200 pasos |
| guarda 1 («vertical 0 tras un paso en el suelo») | paso 220 | paso 259 |
| guarda 2 (la que se queda) | paso 190 | paso 227 |

Paso a paso: en el escalón el autostep de Rapier deja la cápsula uno o dos
pasos sobre el canto redondo (normales −0,88, 0,48) con `computedGrounded()`
falso. Para el §3 eso era «en el aire», y la contrahuella (−1, 0,04, 0)
recortaba la velocidad de 160 a 11. Volvía a acelerar, volvía a parpadear, y
así los veinte segundos. El motor no pasa nunca por ese estado: en el suelo es
`PM_WalkMove` quien prueba el paso subido 18 u y se queda con el que llega más
lejos (pm_shared.cpp:1351-1390), y subido ya no toca la contrahuella.

**La guarda es nuestra** y se lee de lo que devuelve Rapier: si el paso no
pedía subir (`mover[1] <= 0`) y la cápsula ha subido, es el autostep —el
escalón del suelo— y no se recorta. Un salto pide subir y una caída no sube.
La primera guarda («vertical exactamente 0 justo detrás de un paso que empezó
en el suelo») sólo cubría el primero de los dos pasos del parpadeo: el
segundo ya trae la media gravedad. Beto pasaba, medio segundo tarde; lo
enseñó comparar con HEAD paso a paso y no sólo «llega o no llega».

**Lo segundo que se me achacó, los cuerpos hundidos 6,7 cm en un suelo liso,
no es del recorte.** Medido en Node en mundos separados, andando 600 pasos
girando sobre el suelo de `src/red/liso.js`:

| a | HEAD, mínimo | 99, mínimo |
| ---: | ---: | ---: |
| 20 u/s | −0,28 cm | −0,28 cm |
| 45 u/s | **−5,30 cm** | −2,77 cm |
| 90 u/s | −0,71 cm | −1,58 cm |
| 160 u/s | −2,71 cm | −2,47 cm |

Se hunde igual o más con la regla vieja: es el controlador de Rapier con el
empujón contra el suelo (`stick`), y está desde antes. Lo que el recorte sí
toca es el paso de aterrizar, y ahí los pies quedan a la piel (0,020 m) tras
saltar y tras caer 2 y 6 m, con la regla vieja y con la nueva.

Pruebas nuevas en test/salto99.test.mjs: el camino de Beto en Edana (cruzar
x = 17,6 antes del paso 240 y llegar) y la altura de reposo al aterrizar
(tres casos). **Rotura R3**: la guarda a `false` → la de Beto roja («cruza en
el paso null»), el resto verde. R1 sigue roja en las dos de siempre. 19 de 19
con todo puesto. La del reposo **no** se pone roja con la regla vieja,
porque no había regresión que cazar: es un control, y se dice.

Sondas tras la corrección, de una en una: red95, salto99, salto93,
reaparecer99 y servidor98 en verde. fisica 18/19 con la misma roja de la
interfaz de opciones que antes. aturdir98 dio 16/18 una vez —el zombi atacó
tres veces y no sorteó el salto ninguna (`ATTACK2_CHANCE` 30: (0,7)³ = 34 %)—
y 18/18 las dos siguientes; sus controles de andar y saltar, verdes las tres.
`npm test`: 2 989 de 2 992, la única roja es de los guiones
(test/armas98, «el `if` VIEJO se apunta y NO se aplica»), que está tocando
otra sesión.
