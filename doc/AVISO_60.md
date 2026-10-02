# 60 — Los mensajes estaban todos en la misma esquina

Lo trajo el usuario jugando, y con el diagnóstico hecho: *«veo que varios
mensajes que aparecían como pop up en la esquina superior izquierda o derecha
están saliendo todos en el event hud de la esquinera inferior derecha»*.

Tenía razón, y de las dos esquinas.

## Lo que el mod tiene, y este puerto había juntado

Master Sword escribe en **tres** sitios, y están separados a propósito. Lo
mejor de todo es que el propio mod lo dice, en un comentario de 2008, al mover
la ventana de consejos: *«MAR2008a - moving helptip window not to overlap
eventhud»* (`vgui_hud.cpp:291`).

| lo manda | acaba en | dónde sale | cita |
| --- | --- | --- | --- |
| `SendInfoMsg` | `PrintEvent` → consola de sucesos | abajo a la derecha | `vgui_hud.cpp:144-146` |
| `SendHUDMsg` | `HUD_ShowInfoWin` → `AddInfoWin` | **arriba a la izquierda** | `player.h:554`, `vgui_infowin.h:25-26` |
| `SendHelpMsg` | `HUD_ShowHelpWin` → `AddHelpWin` | **arriba a la derecha** | `vgui_hud.cpp:277-300` |

La cita que cierra la discusión es la cabecera del jugador, que lo lleva escrito
al lado de la declaración:

```cpp
void SendHUDMsg(const char* Title, const char* Text);   //HUD message - top left
                                                        player.h:554
```

Y este puerto mandaba los tres al primero.

## Qué se veía mal

Tres cosas, y las tres llevaban ahí desde que se portaron:

1. **La presentación del mapa.** `infomsg ent_me G_MAP_NAME G_MAP_DESC` y sus
   dos hermanos, los del 47. `infomsg` es `ScriptCmd_InfoMessage`, y su propio
   comentario lo dice: *«Creates a pop-up with red title text on the player's
   HUD»* (`scriptcmds.cpp:4055-4057`). Acaba en `SendHUDMsg`. Salían abajo a la
   derecha, entre los golpes, con el título y el texto pegados con un guion.
2. **El anuncio de subir de nivel**, del 41. `infomsg all` es
   `SendHUDMsgAll`, que recorre los jugadores y le llama a `SendHUDMsg` a cada
   uno (`svglobals.cpp:346-351`): el `all` cambia a cuántos se lo mandas, **no
   dónde sale**.
3. **El `infomsg` de los guiones de los NPC**, del 33. Éste sí estaba
   declarado: `src/play/npcguion.js` decía *«es una ventana emergente con el
   título en rojo; aquí es una línea de la consola de sucesos, porque este
   puerto no tiene esa ventana»*. Era verdad. Ya no.

## Por qué aguantó veinte experimentos

Porque **un mensaje en la esquina que no es no da ningún error**. Los dos
primeros llegan como título y texto, la consola acepta cualquier cadena, se
juntaban con un guion y se leían igual de bien:

```
WARNING — This area maybe too difficult at your level!
```

Ninguna prueba de Node podía verlo: las reglas —`src/play/intro.js`,
`src/play/nivel.js`— estaban bien y siguen estando bien, porque lo que
devuelven es *qué* se dice y *cuándo*, no dónde. Y ninguna sonda podía verlo
porque ninguna sabía que hubiera otro sitio donde mirar.

Es el apartado 4 de CLAUDE.md con otra cara: no un verde que no mide nada, sino
**un verde que mide otra cosa**. La regla estaba probada de punta a punta y el
enrutado —la línea que decide a qué caja va— no lo miraba nadie.

## Lo que se ha hecho

**`src/play/aviso.js`**, nuevo: la regla de las dos ventanas. Los siete números
de `vgui_infowin.h:13-27`, la mezcla de entrada y salida, el apilado y las dos
esquinas. Sin DOM, así que se prueba en Node.

**`src/juego/mensajes.js`**: de tres capas a cinco. El velo, el centrado, el
cartel y ahora las dos ventanas.

**El enrutado**, que era el fallo: `src/main.js` (presentación del mapa y
anuncio de subida) y `src/play/npcguion.js` (el `infomsg` de los guiones)
llaman a `mensajes.aviso(titulo, texto)` en vez de a `suceso(tipo, texto)`.

**`esquinaDeLaConsola`** sale de `src/juego/hudms.js` a `src/play/hud.js`.
Estaba calculada a mano dentro del DOM y no se podía mirar sin un navegador;
hacía falta poder compararla con la de la ventana.

## Cinco cosas del mod que no se adivinan, portadas

1. **El rojo del título es 225, no 255** (`vgui_infowin.h:43`). Hay una prueba
   sólo para eso: es la clase de número que alguien «arregla» al pasar.
2. **El fondo nunca llega a opaco.** `m_iTransparency = 255 - ((255 -
   INFOWIN_BKTRANS) * fadeamt)` con `INFOWIN_BKTRANS = 128`: el recuadro se lee
   sobre el mundo, no lo tapa.
3. **El título va en Courier y el cuerpo no.** `new Font("Courier",
   pFont->getTall() + 2, …)` es la única fuente que el mod nombra a mano en
   todo el HUD.
4. **El cuerpo se parte a 114 píxeles y el título no**, y ese 114 **no pasa por
   `XRES`**: las posiciones escalan con la resolución y el tamaño no. De ahí
   salen los recuadros estrechos y altos de la captura, que es lo que hay en la
   pantalla del jugador.
5. **`INFOWIN_HELP_DISPLAY_X` está muerta.** El constructor la usa y dos líneas
   después `setPos` la pisa con `XRES(640) - ancho - XRES(60)`. Igual que
   `INFOWIN_HELP_DISPLAY_Y`, que vale 300 y nunca se aplica: las dos veces es
   `YRES(10)`.

Y **dos erratas portadas** en el deslizamiento de la pila
(`vgui_infowin.h:111-126`), cada una con una prueba que se pondría roja si
alguien las «arregla»:

- el `m_Duration` con el que se decide si la de arriba se está yendo es **el
  mío, no el de la primera**. Con avisos da igual, con ayudas no: duran lo que
  mide su texto;
- **sólo se mira la primera**. Si la que se va es la segunda de tres, la tercera
  no se entera.

## Lo medido

`npm run sonda:aviso60` — nueva, entra por el menú —, **22 de 22**:

| | |
| --- | --- |
| pantalla | 1200×800 |
| aviso | (38, 83), 134×91 |
| consola | (731, 693), 431×90 |
| ayuda | (963, 17), 124×169 |
| títulos | `rgb(225, 0, 0)` y `rgb(0, 200, 20)`, distintos |
| apilado | «Gate City» en y=83, «Intended Difficulty» en y=181 |
| presentación | **«Gatecity», «Intended Difficulty» y «WARNING» en la ventana**, y ninguna en la consola |

El control que importa no es que la ventana sepa dibujarse: es que lo que el
juego manda por `infomsg` salga en ella, medido esperando los trece segundos
de verdad. Arreglar el dibujo y dejar el enrutado habría dado todos los demás
en verde con el fallo puesto.

`npm test` **1421 de 1421** (1399 + 22 nuevas).

## Las roturas

| lo que rompí | rojas | dónde |
| --- | --- | --- |
| el fondo se vuelve opaco | 1 | `npm test` |
| el aviso cae en la esquina de la consola | 3 | `npm test` |
| se «arregla» la errata del `m_Duration` | 1 | `npm test` |
| **la presentación vuelve a la consola** | 3 | `sonda:aviso60` |

La última es la que vale: son las tres que miden el enrutado, y las otras
diecinueve siguieron verdes con el fallo puesto — que es exactamente lo que
tenía que pasar, porque el dibujo seguía bien.

## Un control que se puso rojo por la razón equivocada

El primer pase dio 21 de 22, y el rojo fue *mío*: «la consola sigue llevando lo
que sí es suyo» decía **0 líneas**. Y tenía razón. Entre poner el suceso y
mirar habían pasado catorce segundos, `ms_evthud_decaytime` son nueve, y la
consola se había vaciado sola. Con la consola vacía, el control negativo de al
lado —«ninguna de ellas se ha ido también a la consola»— pasaba **porque no
había nada que mirar**.

Es el apartado 4 otra vez, y lo cazó el positivo que estaba puesto justo para
eso. Ahora se imprime una línea nueva antes de mirar.

El segundo pase dio 22 de 22 pero con un control frágil: contaba cuántas
ventanas quedaban a los siete segundos, y el bucle del juego **también** le
pasa su `dt` a la capa de mensajes, así que la cuenta dependía de lo que
hubieran tardado las medidas de arriba. Se vio al romper el enrutado: dio un
cuarto rojo que no era del fallo. Ahora mide una ventana recién puesta y por su
propio reloj.

## Lo que este experimento NO hace

- **Nadie manda una `SendHelpMsg` todavía.** La ventana de ayuda está portada y
  medida, pero el juego no la usa: `game_helptip` y los `m_ViewedHelpTips` —que
  hacen que un consejo se enseñe **una sola vez por personaje**
  (`playershared.cpp:1128-1140`)— no están. Hasta que lo estén, la esquina de
  arriba a la derecha sólo la usa la sonda.
- **`SendHUDMsg("Welcome to Master Sword", …)`** al conectar (`player.cpp:2850`)
  tampoco está.
- **Los mensajes de partida** (`"Party"`, `"Player Kill"`, `"Travel"`,
  `"Receive Gold"`) son de multijugador y no tienen a quién avisar todavía.
- **El `\n` del mod no se toca.** Muchos `SendHUDMsg` traen saltos de línea
  dentro del texto; el recuadro los respeta porque el cuerpo va con
  `white-space: pre-wrap`, pero no se ha medido ninguno con dos líneas.

---

# 60 (segunda parte) — Edana, hablada

El 50 dejó escrito lo que faltaba, con estas palabras: *«No se ha jugado Edana.
Se entra, se anda, están los 42. Que sus guiones hagan lo que dicen, que sus
menús se puedan pulsar y que sus misiones avancen no lo mide nadie todavía.»*

Al ir a medirlo salieron **dos** fallos, y separarlos costó una rotura.

## Fallo A: el extractor sólo veía a los NPC que declaran su propio menú

`tools/guiones.mjs` decidía qué scripts tienen menú leyendo el **texto crudo** y
buscando en él el bloque `{ game_menu_getoptions`. Y `cargarGuion`, que es lo
que luego hornea, **sí** resuelve los `#include` y lleva haciéndolo desde el 33:
el censo se hacía sobre una cosa y la carga sobre otra.

Un NPC de Master Sword casi nunca trae su menú: lo hereda. El sanador de Edana
son doce líneas de `setvar` y cuatro `#include`, y su «Shop» sale entero de
`monsters/base_npc_vendor`:

```
{ game_menu_getoptions
	callevent vendor_addstoremenu PARAM1
}
                                        monsters/base_npc_vendor.script:53-56
```

| | |
| --- | --- |
| con `game_menu_getoptions` en su propio texto | **139** |
| con él tras resolver los `#include` | **262** |

**Por qué aguantó veintisiete experimentos:** Gate City no pierde ninguno. Sus
25 scripts colocados lo declaran en su archivo, los 25. Edana pierde 7 de 13.
Es el apartado 4 en la forma que enseñó el 50 —con un solo caso, el valor
correcto y el de reposo coinciden— y la defensa es **el segundo mapa**.

## Fallo B: `build/edana/guiones.json` estaba rancio, y era éste el que se veía

El 50 horneó los guiones de Edana **antes de que existiera su `bichos.json`**,
así que el extractor cayó en su rama de respaldo —`delMapa = conMenu`— y guardó
los 139 de todo MSR. De los 22 scripts que Edana tiene puestos, sólo 9 estaban
ahí. Los otros 13 no tenían guion, y la F no les abría nada.

## Y eran dos, no uno: se separó rompiéndolos por turnos

Con el censo roto a propósito **y el horneado nuevo**, la sonda da 12 de 13: cae
el control del censo y **los siete siguen hablando**. O sea que lo que devuelve
la voz al pueblo es volver a hornear, no el arreglo del censo.

Los dos hacen falta. El censo roto dejaba a esos siete con `cabe: null` y
`faltan: []` en el JSON —el juego no podía avisar al jugador de que a ese NPC
le falta algo— y habría vuelto a morderlo el día que un mapa se hornee sin
`bichos.json`, que es exactamente lo que pasó en el 50.

Pero decirlo junto habría sido atribuirle a un arreglo un efecto que no es
suyo, y eso es la forma barata de que el siguiente que mire no entienda nada.

## Lo medido

`npm run sonda:edana60` — nueva, entra por el menú a Edana —, **13 de 13**:

| | |
| --- | --- |
| censo | 262 scripts con menú de los 2 884 |
| Edana | 22 scripts distintos, **22 con guion** |
| NPC montados | 42, ninguno de Gate City |
| los siete | los 7 abren `interact` con el jugador mirándolos |
| tiendas | 6 de los 7 ofrecen «Shop» |
| presentación | «The Village of Edana» y «Intended Difficulty», **sin «WARNING»** |

Los siete, con lo que enseña cada uno:

```
edana/healer       "Hartold the Mage"        [Hail | Ask about Rumors | Shop | Cancel]
edana/weaponsmith  "Krythos the Weaponsmith" [Shop | Cancel]
edana/mayor        "Zerkold, the Mayor"      [Hail | Ask about Jobs | Cancel]
edana/bryan        "Bryan the grocer"        [Hail | Ask about Rumors | Shop | Cancel]
edana/barwench     "Sylphiel, the waitress"  [Ask about Jobs | Ask about Rumors | Shop | Cancel]
edana/fletcher     "Bertold the Fletcher"    [Shop | Cancel]
edana/packmerc     "Foglund the Merchant"    [Shop | Cancel]
```

Y **la presentación de Edana es el segundo caso que a la regla del 47 le
faltaba**: hasta hoy sólo se había visto con los tres avisos de Gate City.
Edana declara `hpwarn` 0, así que le tocan dos y no tres, y el «WARNING» no
sale. Un `if` con un solo caso no está probado.

## Tres rojos que no eran del juego

El primer pase dio 7 de 12, y tres de los cinco rojos eran de la sonda:

1. **«ninguno ofrece comprar o vender»**, con cinco vendedores delante: el
   control buscaba `buy|sell|trade` y la opción se llama **«Shop»**. Un control
   que no sabe cómo se llama lo que busca mide su propia expresión regular.
2. **«Edana no se presenta»**: llega a los diez y a los trece segundos de
   aparecer y dura ocho, y el bucle de los siete NPC tardaba más que eso. La
   sonda miraba cuando ya se había ido. Decía la verdad sobre la pantalla y
   mentía sobre el juego. Ahora la presentación se mide **antes** de hablar.
3. **`edana/priest` no abría su menú**: no lo tiene. Son doce eventos y ni uno
   es `game_menu_getoptions`. Estaba en mi lista por error — el séptimo es
   `edana/bryan`. Y lo que enseñaba era peor que un rojo: la F, sin nadie
   delante, abre **el menú del propio jugador** («Sit Down (Rest)», «Emote: Nod
   Yes»), o sea un panel `interact` con título y con botones. Todos los
   controles en verde midiendo al jugador. Ahora se comprueba a quién se está
   mirando antes de pulsar.

Y un cuarto que costó dos pases: **el sanador salía mudo y no lo estaba**. El
bucle empieza cada vuelta con una Escape para cerrar lo del anterior, y en la
primera no había nada abierto — así que la Escape **abría el menú principal**,
que se comía la F. La sonda pulsando una tecla de más.

## Lo que Edana todavía NO tiene

- **«Shop» no se ha pulsado.** Que el botón salga no es que la tienda abra.
- **`menu.autoopen` le falta a casi todos** (9 scripts sólo en los siete), y es
  lo que hace que algunos NPC te abran el menú sin pulsar nada.
- **`bchat_before_menus` y `bchat_after_menus`** faltan en cinco de los siete:
  son los ganchos con los que un NPC mete o quita opciones alrededor de las de
  la plantilla.
- **Los `setvar` de la cabecera no se ejecutan**: `hp`, `gold`, `name`, `race`,
  `setmodel`, `invincible` salen como no soportados en seis de los siete. El
  nombre que se ve viene del manifiesto, no del guion.
- **Ninguna misión de Edana se ha hecho.** El 33 hizo la del alcalde de Gate
  City; aquí no se ha tocado ninguna.

---

# 60 (tercera parte) — La tienda, y tres fallos que sólo se ven comprando

El 44 portó el modelo de las tiendas y dejó escrito en su propio archivo, en la
cabecera, que «**no dibuja la tienda**: `Offer` abre un panel de VGUI que aquí
no existe todavía». El README lo decía más corto: *«you cannot buy yet»*.

Ya se puede comprar. Y por el camino salieron tres cosas rotas que ninguna
prueba podía ver, porque las tres están **entre** piezas que funcionan.

## Lo que había que portar: son TRES paneles, no uno

`npcstore.offer` no abre la lista de la tienda. Abre un **selector**:

```
g_StoreText[] = {
  "#STORE_BTN_BUY",    "#BUY",    "#STORE_DESC_BUY",
  "#STORE_BTN_SELL",   "#SELL",   "#STORE_DESC_SELL",
  "#STORE_BTN_CANCEL", "#CANCEL", "#STORE_DESC_CANCEL" };
                                              vgui_store.cpp:49-55
```

«    1. Buy», «    2. Sell», «    3. Cancel» —con los cuatro espacios y el
número **dentro del texto**, de `titles.txt:201-221`—, y los dos primeros sólo
si los flags los traen. De ahí se va a la lista, que es **el panel del
inventario**:

```cpp
class CStorePanel : public VGUI_ContainerPanel      vgui_storemainwin.h:14
```

Aquí se hereda igual, de `PanelDeInventario`. Copiarlo habría sido tener dos
paneles que se separan al primer arreglo.

Lo que la herencia cambia es poco y está todo citado: en comprar, una sola
bolsa llamada «Store», sin botón de acción, y **un clic compra y cierra la
ventana** (`ItemClicked` → `trade buy` → `Close()`, vgui_storebuy.cpp:68-76);
en vender, la bolsa es la tuya y lo que el vendedor no compra sale apagado
(«le interesa» es literalmente «lo tiene en su tienda», vgui_storesell.cpp:80).

## El comercio: el orden de los cuatro noes

`comprar()` y `vender()` en `src/play/tienda.js`, y lo que hay que saber no es
que se compre: es **en qué orden se rechaza**, porque es lo único que un
jugador nota.

| | | |
| --- | --- | --- |
| 1 | (vendedor) la línea existe y `Quantity >= iBundleAmt` | **silencio** |
| 2 | (cliente) ¿cabe en la mano o en la mochila? | sin aviso propio |
| 3 | (cliente) `m_Gold < iPrice` | «You can't afford X.» |
| 4 | (cliente) `Quantity <= 0` | «Vendor out of item: X.» |
| 5 | (cliente) se entrega | «You receive X.» |

El 4 parece repetir al 1 y no lo es: es un parche con fecha —*«Thothie
DEC2012_16 - fix exploit where player could get infinite items by repeating
console buy command»*— y va **detrás del dinero**. Así que un jugador sin oro
delante de una tienda agotada oye «no te lo puedes permitir» y no «no queda».

Y `iBundleAmt` vale **cero** por omisión (npcscript.cpp:772-774), lo que hace
que el guardia del paso 1 sea `Quantity >= 0` —cierto siempre—, que el objeto
entregado salga con `iQuantity` 0 y que lo descontado sea `V_max(0, 1)` = 1. Un
lote de cero no es «ninguno»: es «uno, y el contador lo arregla al final».

## FALLO A: ninguna tienda del juego tenía un solo objeto

```js
const ficha = catalogo?.porId?.get(objeto) ?? null;   // src/play/npcguion.js
```

Y quien la llama le pasa **el `Map`**: `catalogo: catalogoDeObjetos?.porId ??
null` (`src/main.js`). Así que `catalogo.porId` era `undefined`, la ficha salía
`null` **siempre**, y `addstoreitem` no añadía nada. En los dos mapas, desde el
44.

Sin un error: caía en `apuntar("objeto de tienda", …)`, que es el cajón de «el
guion pide algo que no tenemos», y ahí se confundía con los comandos que de
verdad faltan. El 44 midió que el modelo funciona, y funciona. Lo que nadie
midió es que alguien lo **llenara**.

Es la fila del 59 en el apartado 4 otra vez: la prueba construye el argumento
con la forma correcta y el llamador se equivoca. Por eso la de ahora pasa un
`Map` de verdad, y tiene al lado el control que pasa el envoltorio y exige que
NO se llene.

## FALLO B: el bloque sin nombre no se ejecutaba

Un `{ … }` sin nombre de evento no es una lista de constantes:

```cpp
if (Name.len()) Event.Name = Name;
else            Event.fNextExecutionTime = 0;      script.cpp:5198-5202
```

es un evento **programado para ya**, y corre con el intérprete entero detrás.
Nosotros sólo leíamos sus `const` y `setvar`. Eso deja fuera el modismo con el
que todas las plantillas ponen sus valores por omisión:

```
if( STORE_BUYMENU equals 'STORE_BUYMENU' ) setvard STORE_BUYMENU 1
                               monsters/base_npc_vendor.script:27
```

—«una variable que resuelve a su propio nombre no existe», el mismo `isnot 'X'`
que el 47 ya había portado—. Sin ejecutarlo, `STORE_BUYMENU` se quedaba vacío y
**todos los vendedores ofrecían «2. Sell» y ningún «1. Buy»**. Así salió la
primera captura del selector.

## FALLO C: el panel que se abre y el que se cierra, en la misma pila

Dos veces, y la segunda en código escrito hoy. El menú de interacción hace:

```cpp
if (SendCmd) ServerCmd("menuoption " + ent + " " + Data);
VGUI::HideMenu(this);                     vgui_menu_interact.h:195-205
```

primero manda la opción, luego se cierra. En el juego da igual: la opción va al
servidor y la tienda vuelve en otro mensaje, varios fotogramas después. Aquí el
guion corre en la misma pila, así que el `HideMenu` de la línea siguiente
cerraba **la tienda recién abierta**. Pulsabas «Shop» y no salía nada.

La tienda se abre ahora en el tic siguiente —`setTimeout(0)`, que es la ida y
vuelta al servidor— y el selector cierra antes de abrir. **Ninguna de las dos
es un apaño**: son la traducción del hecho de que en el original esas dos cosas
están separadas por la red.

## Lo medido

`npm run sonda:tienda60` — nueva, compra en Edana entrando por el menú —,
**20 de 20**:

| | |
| --- | --- |
| vendedor | Krythos the Weaponsmith (`edana/weaponsmith`) |
| «Shop» | abre `store`, título «Krythos the Weaponsmith's Shop» |
| botones | «1. Buy», «2. Sell», «3. Cancel» |
| lista | 16 filas, todas del vendedor |
| señalar | «Cost: 15 gold» |
| **comprar** | oro **5000 → 4985**, objetos **5 → 6**, existencia **3 → 2** |
| consola | «You receive Sharp Knife.» |
| y la ventana | se cierra: una compra por visita |
| sin dinero | no llega el objeto, no baja la existencia, «You can't afford Sharp Knife.» |

Las tres cosas de la compra se miden por separado a propósito: cada una puede
fallar sola, y las tres juntas son la compra. Rotas el oro y el estante, la
sonda da 17 de 20 y cae en esas tres.

`npm test` **1460 de 1460** (1429 + 31 nuevas).

## Las roturas

| lo que rompí | rojas | dónde |
| --- | --- | --- |
| el estante se mira antes que el dinero | 1 | `npm test` |
| vender usa el valor y no el precio del vendedor | 3 | `npm test` |
| el catálogo vuelve a esperar `{ porId }` | 1 | `npm test` |
| comprar no baja el oro ni el estante | 3 | `sonda:tienda60` |

## Lo que la tienda todavía NO hace

- **Vender está portado y no medido.** El panel existe, marca, suma y dice
  «Selling N items for G gold»; lo que no hay es una sonda que lo recorra. Se
  declara pendiente en vez de contarlo entre los verdes.
- **`game_confirm_buy`**, el aviso de «no tienes nivel para esta arma»
  (player.cpp:5816-5895, `base_npc_vendor_confirm`). El herrero de Edana ya
  imprime su «This vendor's weapons require proficiency level 3,6,9,12» porque
  eso es un `gplayermessage` del guion, pero la confirmación no está.
- **El sitio en la mochila** se comprueba sólo contra el tope de 50; el volumen
  no, y por eso `cabe` se pasa ya resuelto y se dice de dónde sale.
- **Los dos eventos del cierre** —`game_player_got_from_store` y
  `game_gave_player`— se devuelven en el resultado y no se llaman: un guion que
  los espera se queda a medias, y está dicho en el código.
- **`VEND_INDIVIDUAL`**, las tiendas por jugador con su `steamid`, no está.
- **El reabastecimiento** (`STORE_RESTOCK_TIME_*`) tampoco: una tienda que se
  agota se queda agotada hasta recargar la página.
