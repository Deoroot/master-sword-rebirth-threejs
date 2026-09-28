# 30 · Crear personaje

El segundo de los cuatro paneles. El más grande: `vgui_choosecharacter.cpp` son
1 457 líneas, y es la **primera pantalla que ve quien abre el juego**.

---

## 1. Son tres etapas, no una pantalla

Eso es lo primero que se pierde al hacerlo a ojo, y lo que teníamos hecho era una
sola pantalla con todo junto.

```cpp
enum stage_e { STG_CHOOSECHAR, STG_CHOOSEGENDER, STG_CHOOSEWEAPON };
                                     vgui_choosecharacter.h:15-21
```

| etapa | qué hay |
| --- | --- |
| **elegir** | tres ranuras de 110×130, cada una con su personaje, su nombre, dónde está y un botón de borrar. Una ranura vacía dice «Create». |
| **quién** | el nombre escrito, con hasta 32 letras, y hombre o mujer con sus dos modelos. |
| **con qué** | hasta nueve armas en una rejilla de tres, con su icono de 128×128. |

Y lo que hace que sea la pantalla de Master Sword y no una lista: **los personajes
son modelos**, no retratos dibujados (`CRenderChar : CRenderPlayer`,
`vgui_choosecharacter.h:29`). Eso ya estaba hecho desde el experimento 14, pero
vivía dentro del cierre de `src/juego/interfaz.js`: ahora es
`src/render/retratos.js`, que es donde le tocaba.

---

## 2. Dos fallos de medida, y se multiplican entre sí

### El espaciador convierte dos veces

```cpp
#define CHOOSE_BTNSPACERX  XRES(16) * XRES(1)
                                     vgui_choosecharacter.cpp:370
```

`XRES` ya convierte de la pantalla de referencia de 640 a la de verdad.
Multiplicar dos `XRES` convierte **dos veces**. A 640 da `16 × 1 = 16` y no se
nota — que es por lo que sigue ahí veinte años después. A 1920 da `48 × 3 = 144`
donde tocaban 48: **el hueco entre personajes es el triple**.

Medido en la sonda, a 1200 px de ancho: **60 píxeles de hueco donde tocaban 30**.

### Y la función de centrar tiene el `−1` fuera del paréntesis

Ya se portó en el 29 (`GetCenteredItemX`, `vgui_choosecharacter.cpp:396`). La
rejilla de armas la usa **con el espaciador roto**:

```cpp
StartX = GetCenteredItemX(m_ChoosePanel->getWide(), WEAPON_BTN_SIZEX, 3,
                          CHOOSE_BTNSPACERX);
                                     vgui_choosecharacter.cpp:594
```

Los dos errores caen en la misma resta y la cuenta sale exacta:
`1,5 × espaciadorRoto − espaciadorBueno − 1`.

| ancho | espaciador bueno | roto | la rejilla se va a la izquierda |
| --- | --- | --- | --- |
| 640 | 16 | 16 | **7 px** |
| 960 | 24 | 48 | 48 px |
| 1920 | 48 | 144 | **167 px** |

A 640 son siete píxeles y no lo ha visto nadie. A 1920 la rejilla de armas se va
casi media columna. Los dos se portan **con el fallo**, y hay una prueba que
recorre las cuatro resoluciones y comprueba la fórmula.

### Y el botón de arma no escala, a propósito

```cpp
#define WEAPON_BTN_SIZEX  128        // sin XRES
```

128 píxeles de verdad a cualquier resolución, porque son imágenes de 128×128 y
estirarlas las emborrona. Igual que el campo del nombre, que es `20` de alto sin
`YRES`. Son de las pocas medidas del panel que no pasan por ahí, y son una
decisión y no un olvido: las que sí escalan están todas envueltas.

---

## 3. Los iconos, y una corrección

El icono sale de `sprites/items/640_allitems.spr`, 244 cuadros de 128×128, y el
cuadro lo dice el script del objeto:

```cpp
if (Params[0] == "hand")       HandSpriteName  = INV_SPRITE;
else if (Params[0] == "trade") TradeSpriteName = INV_SPRITE;
int SpriteIndex = SpriteIsInArray(Params[1].c_str());
if (SpriteIndex != -1) SpriteFrame = SpriteIndex; else SpriteFrame = atoi(Params[1]);
                                     genericitem.cpp:1765-1782
```

**Aquí hubo un hallazgo que resultó ser mío y no del juego, y queda escrito
porque es la clase de error que más cuesta ver: un dato falso, bien citado.**

La primera versión de `tools/iconos.mjs` leía **la primera** línea
`sethudsprite` de cada archivo. Con eso salía que cinco de las siete armas de
partida no tenían icono, y así se escribió. Pero los scripts declaran **las
dos**, en líneas seguidas:

```
sethudsprite hand  sword          items/swords_rsword.script:52
sethudsprite trade 168                                      :53
```

`hand` es el icono del HUD y `trade` el de la pantalla de comercio y el
inventario, y la de `hand` va antes en casi todos. Quedarse con la primera es
quedarse justo con la que no sirve. Corregido: **seis de las siete armas tienen
icono**, y el catálogo entero pasa de 222 objetos a **367**, que se reparten 212
cuadros distintos.

Lo que sí es del juego y se queda: `magic_hand_lightning_weak` —la mano que
lanza un rayo— no declara `sethudsprite` ninguno, así que su `TradeSpriteName`
es nulo. Y el panel de elegir personaje **no lo comprueba**, donde el del
inventario sí:

```cpp
msstring("items/640_") + ptmpItem->TradeSpriteName     choosecharacter.cpp:617
SpriteName = pItem->TradeSpriteName
             ? msstring("items/640_") + pItem->TradeSpriteName : "";
                                                       mscontrols.cpp:285
```

O sea que **una de las siete sale con el cuadro vacío en el juego de verdad**, y
es ésa.

El alfa de los iconos es **una decisión nuestra** y se dice: la hoja es
`SPR_ADDITIVE`, y copiarlo literalmente (`alfa = max(r,g,b)`) deja el arco de
Treebow al 17 % de opacidad porque está pintado en marrones de 44,12,4. En el
juego se ve porque VGUI lo suma sobre un panel oscuro; sobre una página no hay
nada que sumar. Así que el negro puro es transparente y lo demás opaco.

## 4. Lo que se rompió por el camino

Cuatro cosas, y las cuatro son de la misma familia: **mover el montaje del
registro de paneles al arranque temprano**, que hubo que hacer porque esta
pantalla sale a los 231 ms y el mapa tarda 1,7 s.

- **`Cannot access 'reloj' before initialization`.** El `let reloj` estaba a
  mitad de `mainGateCity` y el registro lo lee para el desvanecido. La página se
  quedaba en blanco. La zona muerta de un `let` no perdona.
- **`esquemaVgui is not defined`** y **`fichaDeMenus is not defined`**: dos
  `const` que se quedaron dentro del bloque movido y que el menú de la F, que se
  monta más abajo, seguía usando.
- **La pantalla obligatoria no salía ninguna.** `panelDePersonajes()` devuelve
  `false` cuando el registro todavía no está, y `pantallaElegir` cerraba y se iba
  igual: ni el panel nuevo ni la pantalla suplente. Ahora sólo se salta la
  suplente si el panel se ha abierto de verdad.
- **El panel se quedaba puesto encima del mapa** al entrar al juego por cualquier
  camino que no fuera pulsar en él. Ahora el panel **sigue al estado de la
  sesión**: se cierra cuando deja de decir ELIGIENDO. Lo cazó `sonda:vgui29`, que
  entra por `sesion.nuevo`.

Y uno que no es de la mudanza y es el más tonto: `this.botones = []` se coló
**también dentro de `abrir()`**, así que cada vez que se abría el panel se
borraba su propia lista de botones. `probe.vgui.botones()` devolvía una lista
vacía y tres controles salían en rojo sin que el panel tuviera nada.

---

## 5. Lo que se mide

```
npm test                    819 comprobaciones (eran 813 al empezar el 30)
npm run iconos              7 de 7    los dos cuadros, y el fallo de los cinco
npm run sonda:personaje30   17 de 17  la pantalla de entrada, en un Chrome
```

La sonda **no abre el panel**: abre la página. Ésta es la primera pantalla del
juego, así que si hay que llamar a algo para que aparezca es que no lo es. Y
recorre el camino entero con el teclado y el ratón de verdad: el `1` abre una
ranura, se escribe «Ana2» —con un número dentro, para comprobar que el campo se
come sus teclas y no dispara la ranura—, el «Back» vuelve, el Enter pasa a las
armas, y elegir una crea el personaje, entra al mapa y deja el HUD puesto.

Dos controles que miden lo que no se ve: que **los retratos se sueltan** al
entrar (si no, tres esqueletos siguen animándose para unos `canvas` que ya no
están y la pantalla va cada vez más despacio) y que **el hueco entre personajes
es el doble del que tocaba**, que es el fallo del espaciador medido en píxeles de
pantalla.

Las dieciséis sondas en verde, 470 controles.

---

## 6. Lo que NO está hecho

- **Las ranuras son tres y el modelo es uno.** El original enseña el personaje
  guardado con **su** género y **su** equipo puesto; aquí las tres ranuras
  enseñan el modelo masculino de base. Los datos están —cada personaje guarda su
  género— y el visor sabe cambiarlo; falta pasárselo por ranura.
- **`CRenderSpawnbox`**, la caja de aparición que el original pone debajo de los
  personajes (`reg.hud.spawnbox`, `models/hud/spawnbox.mdl`).
- **Los cuatro estados de animación** de `CRenderChar`: hay reposo y resaltado,
  faltan `RCS_FIDGET` —el gesto cada tantos segundos— y `RCS_INACTIVE`.
- **El servidor no valida el personaje nuevo.** Se crea en el cliente y se manda;
  con partida, `AlmacenRemoto` le pone el id y poco más.
- Y quedan **31 el inventario** y **32 Character Info**.
