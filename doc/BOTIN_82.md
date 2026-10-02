# Experimento 82 — el pellejo del jabalí

El usuario, jugando en Edana: «no sé si tengo mala suerte pero veo que los boars
no sueltan boar pelts al morir, tal vez no está implementado». No estaba. Pero
lo interesante no es que faltara: es **dónde había que buscarlo** y las tres
costuras que hubo que cruzar para que un pellejo llegara al suelo.

---

## 1. El botín NO se decide al morir

Ésta es la frase que explica por qué nadie lo había echado de menos.

`base_monster_shared.script:228-250`, dentro de **`npc_post_spawn`** —que corre
un segundo después de que el bicho aparezca—:

```
if !NPC_NO_DROPS
if( $rand(1,100) <= DROP_ITEM1_CHANCE ) { giveitem DROP_ITEM1 }
... y lo mismo del 2 al 5
```

`giveitem`: **se lo da al bicho**. Y al morir, `DropAllItems()` tira su
inventario, en las tres salidas de la muerte de un monstruo
(msmonsterserver.cpp:2614, :2628, :2638).

O sea que el pellejo del jabalí **se sortea cuando el jabalí nace**. Quien mira
el camino de la muerte no encuentra nada que portar, porque en el camino de la
muerte no hay ninguna decisión: sólo hay un `DropAllItems`.

Y eso cambia una cosa de verdad, no sólo de sitio: **un bicho que nació sin
pellejo no lo gana al morir, por mucho que lo mates**. Si el sorteo se hubiera
puesto en la muerte, cada muerte sería una tirada nueva. Hay una prueba que lo
fija (`CONTROL DEL 50: el sorteo NO se repite al morir`).

### El farmeo existe en el original, y el mod lo sabía

Se preguntó en voz alta si volver a sortear al revivir convertía un área que
repone en una fábrica de pellejos. La respuesta es que sí, y se puede citar:

```
{ game_spawn
    callevent npc_spawn
    callevent 1.0 npc_post_spawn        base_npc.script:20-25
```

`npc_post_spawn` cuelga de `game_spawn`, que corre cuando una entidad
**aparece**; un `msarea_monsterspawn` no resucita al mismo bicho, crea otro. Así
que vuelve a tirar el dado.

La confirmación de que los autores lo sabían está en el único sitio del mod que
apaga el botín: el evento `ext_no_drops`, cuyo comentario dice «*add param to
remove drops for **exploitable** monsters*». Un interruptor manual para este
problema exacto — y, como se ve abajo, no lo llama nadie.

---

## 2. Lo que se lee, y los números

| guion | objeto | probabilidad |
| --- | --- | --- |
| `monsters/boar` | `skin_boar` | 20 % |
| `edana/boarboss` | `skin_boar_heavy` | **100 %** |
| `monsters/giantrat` | `skin_ratpelt` | 50 % |
| el goblin de Gate City | `axes_smallaxe` | 10 % |

Son cinco huecos en el mod y **sólo dos los usa alguien**: `DROP_ITEM1` en 61
ficheros y `DROP_ITEM2` en 7; del 3 al 5, cero. Se leen los cinco porque el
bucle es el mismo, y los tres vacíos se declaran sin caso en vez de contarse
entre lo portado — la regla del 50.

Y son cinco tiradas **independientes**, no una elección entre cinco: un bicho
con dos objetos puede soltar los dos, uno o ninguno.

El 20 % importa para leer el reporte: con cinco jabalíes en Edana, la
probabilidad de que ninguno suelte es 0,8⁵ = **33 %**. O sea que «no sueltan
nada» era compatible con la mala suerte — y por eso el control de la sonda que
decide es el **jefe jabalí, que es 100 %**.

---

## 3. `NPC_NO_DROPS`: un valor de un bloque que no se ejecuta

Lo leí, y salía `true` para los cuatro jabalíes y la rata. O sea que la guarda
habría anulado exactamente lo que venía a leer, en silencio.

La causa es de este lector: **`recoger` cosecha los `setvar`/`setvard`/`const`
de todos los bloques de todo lo que se incluye, corran o no**
(`src/bsp/script.js:307-314`). Y `NPC_NO_DROPS 1` sólo existe dentro del evento
`ext_no_drops` de `monsters/externals.script:881-884`, **al que no llama nadie
en los 2 884 guiones**.

Así que al nacer vale siempre lo que no está puesto, y portarlo desde `vars`
habría sido portar el valor de un bloque muerto. No se lee, y se dice por qué.

*El horneado trae el valor de un bloque muerto con la misma cara que uno vivo.*

---

## 4. Tres costuras entre piezas verdes

El fallo del 63 —«cuando algo no funciona y las dos mitades están verdes, el
fallo está en el viaje»— aparece aquí **tres veces seguidas**, y las tres sólo
las podía ver una sonda.

### 4.1 El manifiesto del suelo tenía dos fuentes y hacían falta tres

`build/msr/suelo.json` traía **13 objetos**. `tools/suelo.mjs` los junta de dos
sitios: lo que el mapa planta (`msitem_spawn`) y lo que el jugador lleva encima.
**Lo que suelta un bicho no era una fuente.**

Y `Suelo.soltar` devuelve `null` cuando el catálogo no conoce el guion, **sin
decir nada al jugador**: así que «el jabalí no suelta nada» y «el jabalí suelta
algo que no sabemos dibujar» se veían exactamente igual. Con la tercera fuente
son 17.

### 4.2 La sonda daba rojo con el trabajo bien hecho, y la culpa era del instrumento

`probe.reaccion.pegarA` llama a `bichos.herir` y **rehace a mano** lo que la
muerte hace en `main.js`: quitar el cilindro y repartir experiencia. Es una
copia del camino de la muerte dentro del propio instrumento — el 65 literal,
*«cuando una sonda RECALCULA algo en vez de leerlo, deja de ser un testigo»*— y
esa copia no sabía del botín.

Se arregla matando **a espadazos**, con `probe.golpe.atacar`, que corre el mismo
`tic` que corre el jugador. El jefe jabalí cae en 51 golpes de espada oxidada.

*Y el aviso que esto deja: `pegarA` no es el camino de la muerte, es una
imitación suya, y envejece cada vez que alguien toca ese camino.*

### 4.3 Un control del 71 que heredaba el supuesto de su clase

«Un objeto tirado cae en un submodelo que se llama `_floor`» se puso **rojo con
los tres pellejos**, que caen en el submodelo 0 — `apple_rhand`.

Y es FIEL. Su plantilla `items/base_miscitem` sólo calcula el submodelo dentro
de este `if`:

```
if ( MODEL_WORLD equals 'misc/p_misc.mdl' )      ← comillas SIMPLES
```

y una comilla simple no agrupa en este motor: `GetConst` no encuentra una
constante llamada `'misc/p_misc.mdl'` y **devuelve el texto tal cual, comillas
incluidas** (script.cpp:350-354), que es lo que compara `FStrEq`
(scriptcmds.cpp:3997). La condición es falsa **siempre** y el `else`
—`setmodelbody 0 0`— es la única rama que corre, en el juego también.

O sea que un pellejo tirado sale con el submodelo 0 en Master Sword. Pedirle un
`_floor` sería pedirle que se vea mejor que el original, así que los tres se
eximen **por nombre y con la cita** en vez de bajar el listón para todos: para
un arma el control sigue mordiendo igual. Es el 69 —*un control con umbral
hereda el supuesto de la clase para la que se escribió*— con otra ropa.

---

## 5. Lo que se midió

**18 pruebas de Node** (`test/botin82.test.mjs`), con los números leídos del
`.script` de verdad, y **7 controles de sonda** (`npm run sonda:botin82`) que
matan al jefe jabalí a espadazos y leen el pellejo en el suelo.

Cinco roturas deliberadas. Las que enseñaron algo:

| rotura | qué salió |
| --- | --- |
| quitar la llamada de `main.js` | **Node 2 122 en VERDE y la sonda en rojo.** La costura, enseñada en vivo |
| quitar la tercera fuente del manifiesto | sonda roja, y el control nuevo señalando al catálogo y no al dado |
| el extractor devuelve `null` | 7 pruebas rojas |
| nadie nace con botín | 3 pruebas rojas |
| **`<` por `<=` en el sorteo** | **verde** — ver abajo |

La última obligó a corregir un comentario mío: había escrito que la comparación
es `<` y no `<=` «porque con un dado que devolviera 1 fallaría». Con un dado
continuo en [0,1) las dos sólo se diferencian en un punto exacto y ningún dado
fijo cae en él. La afirmación era mía y no medida; el `<` se queda porque es el
que mapea [0,1) a «p de cada 100» sin contar el borde dos veces, y **no se
apunta un verde por ese caso** (la regla del 78).

---

## 6. Lo que entendí mal por el camino

| creí | era |
| --- | --- |
| que `npm run mapa:bichos` horneaba los tres mapas | que hornea **Gate City y nada más**: los otros dos piden `--mapa`. Es el 61 calcado, y lo supe porque el botín salió sólo en Gate City. *Un horneado que no dice qué mapa ha hecho se parece mucho a uno que los ha hecho todos* |
| que el jefe jabalí no soltaba porque el catálogo no tenía su guion | que el catálogo SÍ lo tenía (`skin_boar` está en los `.script` del mod y en `objetos.json`); lo que faltaba era el **manifiesto del suelo**, que es otro archivo y otra lista. Dos catálogos que se llaman parecido y no son el mismo |
| que `probe.reaccion.pegarA` mataba como mata el juego | que es una **copia a mano** del camino de la muerte dentro del probe. Ver 4.2 |
| que el herrero de la captura estaba en pose de andar | **falso, y lo retiré.** Mi teoría era que al no resolverse el nombre de su animación el visor caía a la secuencia 0, que en su modelo es `walk`. Lo medí en el navegador y toca `idle7` correctamente. *Una teoría bonita sobre el valor de reposo también hay que medirla* |
| que `git stash` me serviría para comparar dos horneados | que CLAUDE.md lo prohíbe en árbol compartido por una razón, y que lo hice igual. El stash **no llegó a crearse** y no me llevé trabajo de nadie, pero el error fue mío y está aquí escrito |

---

## 7. Lo que queda

- **Los pellejos se ven como una manzana**, y eso es fiel (ver 4.3). Si algún
  día se quiere arreglar, el arreglo no es nuestro: es que el `if` del mod
  compare sin las comillas simples, y eso sería apartarse del original.
- **`DROP_ITEM3`, `4` y `5` no tienen ni un caso** en los 2 884 guiones. El
  bucle los lee; no se cuentan entre lo portado.
- **`DROP_GOLD` no está portado.** Está en el mismo bloque (`:200-219`) y lo
  declara mucha más gente que `DROP_ITEM`; se deja fuera a propósito para no
  mezclar dos cosas en un experimento, y porque el oro del jugador tiene su
  propio camino.
- **El manifiesto del suelo sólo mira `edana` y `gatecity`** (`MAPAS` en
  `tools/suelo.mjs`), así que el botín del tercer mapa —11 jabalíes, 3 osos y
  4 ratas— no entra todavía. No es un hueco callado: el horneado lo dice.
- **La tasa del 20 % no se puede medir en la sonda**: con cinco jabalíes, una
  pasada no decide. Se mide en Node con mil tiradas, y en la sonda está
  declarada pendiente y no contada.
