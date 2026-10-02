# La manzana del árbol se apaga, y la sopa aparece — experimento 76

`npm run sonda:edana76` · **34 de 34** · `npm test` **1816 de 1816**

El 71 hizo caer la manzana del manzano de Edana y el 75 la hizo tirar. Las dos
veces quedó pendiente lo mismo, y se veía: **la manzana del árbol seguía
colgando**. El mapa sí manda apagarla, por un camino que llevaba cuatro
experimentos escrito y sin alcanzar a nada.

---

## 1. La cadena

```
algo dispara "apple5spawn"
     │
     ├──► msitem_spawn  apple5spawn ──► la manzana CAE al suelo      (el 71)
     │
     └──► env_render    apple5spawn ──► rendermode 4, renderamt 0
                             │            sobre "apple5"
                             ▼
                   CRenderFxManager::Use              triggers.cpp:535-557
                             │
                             ▼
                   R_AddEntity: !R_ModelOpaque && CL_FxBlend <= 0
                                                     ref/gl/gl_rmain.c:252
```

**Dos entidades con el mismo `targetname`.** Un solo disparo hace las dos cosas:
el objeto nace en el suelo y el adorno del árbol se apaga. En el manifiesto de
Edana son, literalmente, `["env_render", "msitem_spawn"]` con el mismo nombre.

---

## 2. La regla, y la mitad que se olvida

```c
qboolean R_AddEntity( struct cl_entity_s *clent, int type )
{
  ...
  if( FBitSet( clent->curstate.effects, EF_NODRAW ))
          return false;
  if( !R_ModelOpaque( clent->curstate.rendermode ) && CL_FxBlend( clent ) <= 0 )
          return true;   // invisible
```
`ref/gl/gl_rmain.c:242-253`

Dos cosas que hay que leer de ahí:

1. **No es «se dibuja transparente»: no se añade a la lista.** Un adorno
   invisible no cuesta un triángulo.
2. **`R_ModelOpaque(rm)` es `rm == kRenderNormal`** (`ref/gl/gl_local.h:87`). O
   sea que `renderamt 0` esconde **sólo si el modo no es el 0**. Con
   `rendermode 0` el `renderamt` no se mira. Es la mitad que invita al error
   contrario, y tiene su propia prueba.

`CL_FxBlend` (`ref/gl/gl_rmain.c:1218-1333`) es un `switch` de dieciséis ramas
sobre `renderfx`. **De las 229 colocaciones y entidades con aspecto de los dos
mapas portados, `renderfx` vale 0 en las 229**, así que la única rama que se
ejecuta en este juego es el `default`: `blend = renderamt`, recortado a 0..255.
Está portada ésa y nada más, con la tabla de lo que pediría cada una de las
otras quince escrita en `src/play/aspecto.js` — un `switch` de quince ramas que
no corren nunca es el sitio exacto donde este proyecto ha metido seis reglas
muertas. Lo que sí se hace es no tragárselo: `mezcla` devuelve `fxSinPortar`
cuando le llega un `renderfx` que no es 0.

---

## 3. Lo que no era como parecía

### a. El 69 escribió aquí que no se podía, y la razón caducó

En `src/main.js` estaba escrito que los 46 adornos van **fundidos en una sola
malla**, así que esconder uno no es apagar un nodo. Era cierto. Y el arreglo no
era buscar el trozo de geometría: **un adorno con nombre ya no se funde.**

En GoldSrc cada `env_model` es su propia entidad con su propio estado de dibujo;
fundirlos era una optimización NUESTRA, y el que puede cambiar de estado es justo
el que no puede ir fundido. Son **9 de 46** en Edana y **0 de 101** en Gate City,
o sea nueve `drawcalls` más en un mapa y ninguno en el otro.

### b. Cuatro adornos NACEN invisibles, y este puerto los dibujaba

Los cuatro platos de sopa de la taberna traen `rendermode 4` y `renderamt 0` en
el `.bsp`. El motor no los dibuja. Aquí estaban **en la mesa desde el primer
fotograma, con las mesas vacías**. No faltaba el `env_render`: faltaba el estado
de nacimiento, que es lo que convierte al `env_render` en algo que se note.

| adorno | modo | amt | se dibuja |
| --- | --- | --- | --- |
| `patron1soup` `patron5soup` `patron6soup` `patron9soup` | 4 | 0 | **no** |
| `apple1` ×4, `apple5` | 4 | 255 | sí |

### c. El `env_render` del plato se llama IGUAL que el aparecedor del parroquiano

```
player_joined ──► patronmm1 ──► patronspawn (random 1)
                                     │
                                     ├─ patron1 ──► ms_monsterspawn  +  env_render ──► patron1soup
                                     ├─ patron5 ──► ms_monsterspawn  +  env_render ──► patron5soup
                                     ├─ patron6 ──► ms_monsterspawn  +  env_render ──► patron6soup
                                     ├─ patron9 ──►                     env_render ──► patron9soup
                                     └─ los otros ocho, sólo parroquiano
```

**El plato de sopa aparece cuando se sienta el cliente.** `patronspawn` sortea
uno de doce por ciclo y sólo cuatro de los doce nombres llevan plato. Nadie había
portado la mitad del plato, y en pantalla eso se veía como cuatro platos que
están desde siempre.

### d. `patron9` tiene plato y no tiene parroquiano

El mapeador se dejó el `ms_monsterspawn`. Es un descuido suyo y aquí es **el
instrumento**: es el único de los cuatro nombres que mueve una sola cosa, así que
es el que permite contar píxeles sin que un monstruo que aparece a la vez ensucie
la cuenta.

### e. `renderFountainNormal` son dos `func_water`

Un `env_render` sobre una entidad del cableado sigue sin portar, y sigue
contándose. Pero no una vez: **dos**, porque `CRenderFxManager::Use` usa a todas
las que se llamen así y hay dos `func_water` con ese nombre. El control pedía 1 y
salió rojo con el trabajo bien hecho.

---

## 4. Lo que la sonda enseñó, y las pruebas no podían

Cinco cosas, todas de la familia «el instrumento no veía lo que decía ver».

| lo que decía el control | lo que pasaba |
| --- | --- |
| «el plato está en el centro de la pantalla» y cero píxeles de cambio | **la cámara estaba dentro de una mesa.** El punto proyectado no dice si una cosa se ve; lo dice un rayo. Ahora `plantarseAnte` prueba sitios hasta que un rayo llega al adorno sin que se interponga nada, y si no hay ninguno lo dice |
| la ventana de píxeles apuntaba al adorno | apuntaba a `escena`, que es el **`origin` de la entidad**, y un `.mdl` no tiene por qué estar centrado en su origen: el plato de sopa está **0,8 m por encima** del suyo. Se fotografiaba la mesa de debajo |
| «la tarjeta no dibuja más triángulos» | `renderer.info.render` se reinicia en cada `render()` y el bucle hace **dos** (main.js:5092 y 5110), así que leerlo a secas devuelve el del **arma en primera persona**: 8 llamadas y 2 904 triángulos, iguales con el pueblo delante o detrás. Con `autoReset` en falso y una lectura entre dos fotogramas, la cuenta sale exacta: **+182, que son los 182 triángulos del plato** |
| «al entrar los cuatro platos están apagados» | una **carrera**: `player_joined` llena la taberna en el primer segundo y una pasada ya pilló uno encendido. Lo que no depende del instante es que ninguno esté encendido **sin que algo lo haya encendido**, y eso es lo que se afirma |
| «algún plato se ha puesto solo» | un control que falla **una vez de cada ocho** sin que nada esté roto: el sorteo elige uno de doce y sólo cuatro llevan plato, así que con cinco ciclos la probabilidad de que no salga ninguno es (8/12)⁵ = 13 %. Ruido con forma de rojo. Ahora se le dan vueltas al sorteo hasta que sale, y se dice en cuántas |

Y una sexta, de la familia del 69: `plantarseAnte` deja al jugador **en el aire**
cuando la cosa cuelga a tres metros, y se cae mientras la sonda espera. Hay que
dejarlo posarse y volver a apuntar.

---

## 5. Las ocho roturas deliberadas

| qué se rompió | qué se puso rojo |
| --- | --- |
| quitar el `esOpaco` de `seDibuja` | «modo 0 y cantidad 0 SE DIBUJA» |
| `seDibuja` devuelve siempre `true` | tres: el plato invisible, el `<= 0`, y el horneado |
| las máscaras de `env_render` no tapan | «un campo a `null` no se toca» |
| los nombrados vuelven al fundido | cuatro pruebas del horneado |
| no desplazar los tramos al buffer común | «los grupos caben y no se solapan» |
| no aplicar el estado de nacimiento | «ningún plato se dibuja sin que un `env_render` lo haya puesto» |
| `aplicarRender` sin el filtro por nombre | seis, incluida «las otras CUATRO manzanas siguen ahí» (0 de 4) y la cuenta de triángulos (+0 contra 182) |
| los materiales fuera de la lista de todos | «sus materiales están en la lista que recorren las perillas» (0 de 9) |

---

## 6. Lo que NO se porta, con la cuenta de hoy

- **Las quince ramas de `CL_FxBlend`.** `renderfx` vale 0 en **229 de 229**. La
  tabla de lo que pediría cada una está en `src/play/aspecto.js`; cuatro de ellas
  **escriben en `renderamt`** cada fotograma, o sea que tienen estado y no son
  una función. Hay una prueba que se pone roja el día que un mapa traiga un
  `renderfx` distinto de 0.
- **El alfa intermedio.** Está portado —`material.opacity` con `depthWrite` en
  `true`, que es lo que hace `GL_StudioSetRenderMode` en su `default`
  (`ref/gl/gl_studio.c:3011-3017`)— y **los dos mapas sólo usan 0 y 255**, así
  que no hay ni un caso que lo ejercite. Queda dicho en vez de contado entre lo
  medido.
- **`env_render` sobre una entidad del cableado.** Edana tiene uno, con dos
  víctimas (`renderFountainNormal`, dos `func_water`). Se cuenta, no se finge.
- **`rendercolor`.** Se transporta por el bus y se guarda en el estado; ningún
  adorno de los dos mapas lo usa con un modo que lo mire.
- **Los adornos que SE MUEVEN** (10 de 101 en Gate City) van por el camino de los
  bichos y no por éste: ninguno tiene `targetname`.

---

## 7. Lo que viene detrás

1. ~~**`ms_npcscript` tipos 0 y 4** ×3: Edrin andando a `edrinspot`.~~ **Hecho en
   el 77**, ver [ESCENAS_77.md](ESCENAS_77.md).
2. **Una misión de Edana de punta a punta con sonda.**
3. **El botín de un cadáver**, la tercera vía al suelo, con `ITEM_NOPICKUP` y el
   oro.
4. El **modo aditivo** del haz de luz de la cloaca, que dejó el 70 — y ahora hay
   con qué: `src/play/aspecto.js` tiene los seis modos y el 5 es ése.
5. Lo contado del 75: **resbalar** (`SV_FlyMove`), el `game_drop` de los otros
   quince guiones y soltar de dentro del zurrón.
