# 14 · El modelo del personaje en pantalla

> «en el juego real no hay graficos autogenerados. todo se hace con texto o con
> el modelo del personaje actual. eso faltaria implementar no?»

Ya está. El personaje sale en los tres sitios: la tarjeta de la lista, la vista
previa al crearlo y el inventario, con el centro arriba y la rejilla debajo.

Y con ellos la **hoja de personaje reescrita con maestro-detalle** (§6).

**592 comprobaciones en verde**, **29 de 29 controles de pantalla** y los 31 del
ciclo intactos.

```
npm run cuerpo          extrae el modelo a build/gatecity/cuerpos/
npm run sonda:cuerpo    lo mira con píxeles, no con fe
```

---

## 1. Lo primero que encontró fue un error mío

En `MOCKUPS_13.md` §6 dejé escrito el plan:

> «Una vista de Three.js reutilizable con `male1.mdl` / `female1.mdl`»

**Las dos mitades de esa frase son falsas**, y el código del mod lo dice sin
ambigüedad. Lo dejo escrito porque el plan lo escribí yo y con confianza.

### El modelo es `reference.mdl`

```cpp
vgui_choosecharacter.cpp:1190   Init( Idx, MODEL_HUMAN_REF );
player/modeldefs.h:3            // YOU NEED THIS (MODEL_HUMAN_REF) for animations
                                // even though it's the exact same as male1....
                                // queer the way the engine works
```

Y no son intercambiables. La pantalla pide **seis animaciones por nombre**, y
`male1.mdl` no tiene dos de ellas — medido con nuestro propio lector:

| | secuencias | `idle` | `attention` | `stretch` | `jump` | `run` | `sitdown` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `reference.mdl` | 65 | sí | **sí** | **sí** | sí | sí | sí |
| `male1.mdl` | 58 | sí | **no** | **no** | sí | sí | sí |
| `female1.mdl` | 45 | sí | sí | sí | sí | sí | sí |

`attention` es la postura de quien no lleva nada en la mano, o sea **la que se ve
al abrir la pantalla**. Con `male1.mdl` no habría salido un error: habría salido
todo el mundo en `nod_yes`, que es la secuencia 0 y la que el motor pone cuando
le piden una que no hay. Un personaje asintiendo en bucle pasa perfectamente por
«la animación de reposo es rara».

### Y las animaciones son DATOS, no código

No están dentro del cliente. Salen del registro de scripts:

```cpp
scriptcmds.cpp:4922   DefaultHUDCharAnims.Fidget = SCRIPTVAR("reg.hud.char.figet")
```
```
global.script:43-48   local reg.hud.char.active_weapon 'idle'
                      local reg.hud.char.active_noweap 'attention'
                      local reg.hud.char.figet         'stretch'   ← la errata es suya
                      local reg.hud.char.highlight     'jump'
                      local reg.hud.char.upload        'run'
                      local reg.hud.char.inactive      'sitdown'
```

O sea que «la figura salta al pasarle el ratón» y «la ranura vacía está sentada»
no son decisiones nuestras: son dos líneas de un fichero de datos del mod.

### El género es un SUBMODELO, y `female1.mdl` no lo abre nadie

```cpp
modeldefs.h:13   #define MODEL_HUMAN_FEMALE1 "models/human/male1/male1.mdl"
modeldefs.h:18   //#define MODEL_HUMAN_FEM_HEAD "models/human/female1/head.mdl"
```

El define femenino **apunta al modelo masculino** y las rutas de `female1/`
están comentadas. Lo que de verdad cambia el género es el `body`:

```cpp
vgui_choosecharacter.cpp:1329   int gv = (gender == GENDER_MALE) ? 1 : 2;
                                m_Ent.SetBody(0, gv); ... SetBody(3, gv);
```

y las cuatro partes de `reference.mdl` traen justo tres submodelos cada una:

```
bp0 "legs"  base= 1   [blank, legs_visible,  legs_visible_female ]
bp1 "head"  base= 3   [blank, head_visible,  head_visible_female ]
bp2 "torso" base= 9   [blank, torso_visible, torso_visible_female]
bp3 "arms"  base=27   [blank, arms_visible,  arms_visible_female ]
```

1, 3, 9, 27 son potencias de tres: **`body` es un número en base 3 con un dígito
por parte**. Así que los dos cuerpos no se eligen, se calculan — 1+3+9+27 = **40**
y 2+6+18+54 = **80**. En `tools/cuerpo.mjs` no hay ni una constante a mano.

Y el submodelo 0 de cada parte es `blank`: **ése es el mecanismo de la
armadura**. Una pieza de equipo marca la parte que tapa, el motor esconde el
miembro propio y dibuja el suyo. No está portado —los objetos de cuerpo quedaron
para después— pero ya se sabe por dónde entra.

**Dos controles derivan de esto y los dos separan por mucho**: `body = 0` son los
cuatro `blank` y tiene que dar **cero triángulos** (con las bases leídas como
paso en vez de como potencia, el cero deja de caer en `blank`), y hombre y mujer
tienen que dar mallas **distintas** — 972 y 1216 triángulos. Si el `body` no se
decodificara, los dos saldrían iguales y no habría error: habría un juego donde
elegir mujer no hace nada.

---

## 2. Un archivo cuyas propias cajas mienten

El oráculo que lleva usándose desde los bichos —animar los vértices y comprobar
que caben en la caja que el compilador escribió para cada secuencia— **falla en
`reference.mdl`**:

| | caben | el peor se sale |
| --- | --- | --- |
| `male1.mdl` | 58 / 58 | **0,0 u** |
| `female1.mdl` | 45 / 45 | **0,0 u** |
| `reference.mdl` | 21 / 65 | **27,7 u** |

Tres hipótesis, comprobadas y muertas:

- **que las cajas estuvieran copiadas de `male1.mdl`** con las animaciones — 0 de
  las 22 secuencias comunes tiene la misma caja;
- **que describieran otro `body`** — ninguno de los diez probados da 65/65, el
  mejor da 63;
- **que la malla fuera otra** — en espacio de hueso las dos miden lo mismo ±2 u.

No es nuestra lectura: es el archivo. Así que hace falta **un juez que no lea sus
cajas**, y ése es `rigidezDeModelo`: en una animación de esqueleto el hueso gira
y no se estira, así que su distancia al padre es la misma en todos los
fotogramas.

| | como lo leemos | sin la escala de compresión |
| --- | --- | --- |
| `male1.mdl` | 6,410 u | 1641,0 u |
| `female1.mdl` | 0,902 u | 815,4 u |
| **`reference.mdl`** | **2,911 u** | 815,4 u |

`reference.mdl` sale **mejor que el modelo que sí pasa el oráculo de la caja**.
Entre lo bueno y lo roto hay tres órdenes de magnitud, así que el umbral —10 u—
no hay que afinarlo. (Los 6,4 de `male1` son la pelvis en `jump`: el salto, no un
fallo. La raíz se excluye porque ésa sí se mueve.)

Saltarse el oráculo de la caja **cuesta escribir la razón**: `extraerBicho` acepta
`sinOraculoDeCaja: "<por qué>"` y no un booleano, porque un `oraculo: false` suelto
por ahí es exactamente cómo se pierde un juez. Y tiene su propio control: si el
modelo por el que se pidió saltárselo lo pasa limpio, revienta y dice que quites
la excusa.

---

## 3. Lo que es nuestro, dicho aparte

**El encuadre.** En el original la figura ocupa el **24 % del alto** de la
pantalla: 72 unidades a escala `CHAR_SCALE 0.025` son 1,8 a 5 de distancia, y con
`default_fov 90` en 4:3 la vista mide 7,5 de alto. Eso está bien cuando tres
personajes comparten la pantalla entera; en una tarjeta de 132 px darían 43 px de
personaje. Así que **se conserva la lente y se cambia el recorte**: el ángulo que
la figura subtiende en el original —20,41°— es el campo vertical de nuestra
cámara, y la distancia se calcula para que el marco llene la caja. La perspectiva
es idéntica; lo que cambia es cuánto se ve alrededor.

Y el marco **no** es la caja del archivo, por lo de arriba: `cuerpos.json` trae
uno medido animando los vértices de las seis secuencias. Son **85,8 u de alto**,
no 72, porque `jump` levanta al personaje 14 unidades. Con el del archivo, señalar
una tarjeta sacaría la cabeza del cuadro sin dar ningún error.

**Un solo `WebGLRenderer` para todos los retratos.** Un navegador corta por unos
dieciséis contextos y ya hay uno gastado en el mapa; cinco retratos con el suyo es
quedarse sin ninguno. Se dibuja en uno y se copia a un `canvas` 2D por ranura.

**Las pistas se emiten una vez.** Los dos géneros comparten esqueleto y animación
palabra por palabra —el `body` elige malla y no toca ni un hueso—, y eso son
**970 de los 1 020 KB** de cada uno. Compartirlas deja **1 045 + 121 KB en vez de
2 089**, en la pantalla que precisamente queremos que salga antes que el mapa. Con
su control: que los dos declaren el mismo esqueleto y las mismas secuencias, y que
la segunda ficha **de verdad no lleve ni un tramo de pista**.

**El reloj de los retratos es suyo.** La tentación era colgarlo del bucle del
mapa, que ya existe. No vale: ese bucle arranca a los 1 733 ms y la pantalla de
personajes sale a los **272**. Colgado de él, la figura se queda congelada justo
durante el rato en el que es lo único que hay.

---

## 4. Tres fallos, y los tres silenciosos

**El retrato no dibujaba nada y la página funcionaba.** Copié
`renderer.outputColorSpace = ESPACIO` de `bichos.js`, donde `ESPACIO` va a las
*texturas* y está bien. `ESPACIO` es `NoColorSpace`, válido para
`texture.colorSpace` y **no** para la salida: `ColorManagement` busca
`this.spaces[""]` y lanza «Cannot read properties of undefined (reading
`outputColorSpaceConfig`)» una vez por fotograma, a la consola, sin romper nada
más. El `canvas` salía transparente. Lo cazó la sonda con `getImageData`, que es
la única comprobación que mira píxeles.

**Un personaje sin arma no se estiraba nunca.** El tic estaba condicionado a
`if (enBucle)`. Medido sobre los vértices animados:

| | recorrido | bucle |
| --- | --- | --- |
| `idle` (con arma) | **0,00 u** — una pose fija de 156 fotogramas | sí |
| `attention` (sin arma) | **0,92 u** — respirar, 2 cm | **no** |
| `stretch` | 41,55 u | no |
| `jump` | 58,33 u | no |
| `run` | 47,26 u | sí |
| `sitdown` | 51,28 u | no |

Las dos posturas de reposo están **quietas a propósito** — por eso el mod le puso
un temporizador al `stretch`: es lo único que se mueve en una tarjeta en reposo.
Y como `attention` no hace bucle, con la condición vieja el caso por defecto de
la pantalla eran tres estatuas.

**La ranura libre se sentaba en bucle.** Al acabar una animación sin bucle yo
volvía al reposo — sin comprobar si el reposo *era ella misma*. Y `sitdown` no es
«estar sentado»: es **la acción de sentarse**, que empieza de pie. La ranura se
sentaba, se levantaba de golpe y se volvía a sentar cada 2,4 segundos. Tampoco da
error. De rebote, hacía que dos ejecuciones seguidas de la sonda midieran cosas
distintas sin que cambiara nada.

**Y uno que no era del modelo: el inventario no cabía en la pantalla.** La casilla
de la rejilla estaba a `minmax(52px, 1fr)` y crecía hasta llenar los 900 px del
panel; como es cuadrada, seis filas medían 516. Con el personaje encima, el panel
pasaba de la ventana y **el título se iba fuera por arriba**. Estaba así desde
antes; se vio al poner la figura. Ahora la casilla tiene tope y hay dos controles
que miden el panel contra la ventana.

**Y una ruta inventada en el sitio donde menos debe haberla.** El campo
`procedencia` de cada ficha extraída estaba escrito con `models/monsters/` a
fuego, y `nombre` ya trae la carpeta: para el goblin daba
`models/monsters/monsters/goblin_new.mdl` y para el cuerpo del jugador
`models/monsters/human/reference.mdl`, **que no existe**. En un campo que está
ahí precisamente para decir de dónde sale cada byte, eso es el peor sitio posible
para una mentira. Corregido y reextraído; cuatro adornos animados conservan la
línea vieja hasta el próximo `npm run gatecity`. De paso se borraron seis
carpetas huérfanas de ejecuciones sueltas de `tools/bicho.mjs` que ya no
referenciaba ningún manifiesto.

---

## 5. Lo que se ganó de paso

**El género se pregunta.** `crearPersonaje` tiene el campo desde el primer día con
`"male"` por defecto, así que **todos los personajes salían hombres sin que nadie
lo eligiera**. El original lo pregunta en su propia etapa (`STG_CHOOSEGENDER`), y
ahora nosotros también, con la figura cambiando al elegir.

**La ranura libre es una tarjeta con una figura sentada**, y el botón «personaje
nuevo» está ahí en vez de en dos sitios.

---

## 6. La hoja, con maestro-detalle

Hecho también, en la misma sesión. Antes enseñaba **las 27 barras a la vez**, que
es una lista para mirar y no para leer. Ahora: los nueve valores de un vistazo, y
desplegada **una sola**.

**Lo que hace crecer cada habilidad se calcula, no se copia.** El mockup traía una
tabla de ejemplo marcada honestamente como «sustituir por la tabla real». No hizo
falta: los pesos de `CMSMonster::GetStat()` ya estaban en el código, sólo que
**dentro de la fórmula**. Se sacaron a `GETSTAT` para que los atributos y la hoja
lean lo mismo — escritos dos veces serían dos verdades, y la que envejece es
siempre la de la pantalla, porque una lista de atributos plausible no se distingue
de la correcta.

Y la diferencia se ve en arquería: **Percepción pesa 2,0 y Concentración 1,5, y
sin embargo lo que más sube es Concentración**, porque divide entre 2 y no entre
7. Ordenar por el peso daría la lista plausible; se ordena por `peso/divisor`.

Tres cosas más que salen de ahí y están en la pantalla:

- **`faltan N` además del porcentaje** — lo único de esta hoja mejor que el
  original, que no te dice nada. Y hace falta: la experiencia es
  `pow(1,248, v)·4v`, así que la misma barra al 50 % vale cada vez más.
- **`Parry` no aporta a ningún atributo**, y se dice. No es un hueco de nuestra
  tabla: no aparece en ninguna de las siete medias de `GetStat()`. Dejar el sitio
  en blanco se leería como un fallo.
- **Spell Casting tiene CINCO escuelas, no tres propiedades.** Es el detalle que
  se pierde si uno asume una rejilla, y tiene su control en la sonda.

**Los tres grupos son nuestros y lo dice la propia pantalla**: `SkillStatList[9]`
es plana. El criterio no es gratuito — sale de las propiedades que el motor sí les
da: las de arma tienen tres, la magia cinco y `parry` una. O sea que los tres
grupos son los tres tipos de propiedad que existen.

**Y un fallo mío de diez segundos**: escribí un comentario en la hoja de estilo con
comillas invertidas alrededor de `text-align`. La hoja vive dentro de una plantilla
de texto, así que **la cerró a media línea** y la interfaz dejó de cargar entera.
Lo cazó la sonda en la primera comprobación.

---

## 7. Lo que sigue

1. **El menú principal**, con la elección de personaje antes del mapa y las
   opciones de teclas colgando.
2. **El inventario con contenedores** (clic y doble clic, sin arrastrar), que
   necesita extender `tools/objetos.mjs` para sacar `reg.container.maxitem`.
3. **Los objetos de cuerpo** —cinturones, capas, anillos—, que quedaron
   aplazados. Ahora se sabe por dónde entran: el submodelo `blank`.

Y lo que hay pendiente fuera de la interfaz, que se revisó entero en esta sesión y
conviene tener escrito en un sitio:

| | qué falta |
| --- | --- |
| **el mapa** | la geometría está entera y las entidades con brushes bien repartidas (`func_wall`, `func_breakable` y `func_door_rotating` chocan; `func_illusionary` y `func_water` no). Lo que falta es que **se comporte**: las puertas no se abren, el agua se dibuja y no se nada (451 m²), los 2 `func_ladder` no se suben y los 6 `trigger_*` no disparan nada. Más el parpadeo de los estilos 1 y 6, medido desde el 06. |
| **colisiones** | sólo choca el `.bsp`: **los 69 bichos y los 101 adornos se atraviesan**. |
| **los NPC** | el paseo son treinta líneas que andan y giran al chocar, y su propio comentario dice que **no es la IA de MSR**. Falta el intérprete de scripts (`base_npc_attack.script`, 909 líneas, más 113 del goblin) y `UTIL_MoveToOrigin` con su `m_StepSize = 18`. |
| **el bucle** | nada te pega todavía (la **K** es andamio), no hay animación de muerte aunque los `.mdl` la traen, agacharse no encoge la cápsula, y el `edgefriction` está implementado y no se dispara nunca porque nadie mide si estás al borde. |
| **fuera del código** | falta `git init`, los enlaces reales en `CREDITOS.md`, y sigue abierto lo único que bloquea desplegar: **servir los assets es distribuir**, aunque el repositorio sea público. |
