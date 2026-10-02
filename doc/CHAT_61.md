# Experimento 61 — El chat, y la red descubre que hay un segundo mapa

> «listo, continuemos. cuanto falta para tener edana y el componente
> multijugador que permita a dos personas estar en el mismo mapa al 100%?»
> · «tratemos de verificar que la ventana de chat funcione tambien»

Las dos preguntas tenían la misma respuesta desagradable: **no se podía
contestar porque nadie lo había medido**. La ventana de chat no existía —
`src/juego/hudms.js:27` la declaraba «leída y no hecha» desde el 24— y el
multijugador se había medido **sólo en Gate City** desde el 27.

Este documento es lo que salió de medirlo.

```
npm test                              1 499  (eran 1 460)
npm run sonda:red                     21 de 21   Gate City
npm run sonda:red -- --mapa edana     21 de 21   el segundo mapa, por primera vez
npm run sonda:chat61                  24 de 24   dos navegadores, una frase
```

---

## 1. Lo primero que se midió fue un rojo

`sonda:red` levanta un servidor de verdad y dos Chrome de verdad, y desde el
experimento 27 daba 21 de 21. Lo que no hacía era elegir mapa: se quedaba con
el de por omisión, que es Gate City. El servidor acepta `--mapa` desde el 47 y
**nadie lo había ejecutado nunca**.

Se le añadió la bandera y salió esto:

```
  EL MAPA: edana
    huecos          ana null · beto null
  LA SONDA SE HA CAÍDO: Cannot read properties of null (reading 'dentro')
```

Ninguno de los dos navegadores estaba conectado. Y el motivo son tres fallos
distintos, encadenados, **que sólo existen cuando el mapa elegido no es el de
por omisión** — o sea, que llevaban ahí desde que hubo un segundo mapa y no
podían salir antes.

### a) La recarga tiraba la partida

```js
location.search = `?map=${encodeURIComponent(mapa)}&menu=1`;   // src/main.js
```

Asignar a `location.search` **reemplaza la cadena entera**. El único otro
parámetro que hay hoy es el que importa: `red=ws://…`, o sea a qué servidor
estás unido. Así que **elegir un mapa que no fuera el de por omisión te sacaba
de la partida**, en silencio y sin un error: te quedabas jugando solo,
convencido de estar dentro.

Con el mapa de por omisión esa rama ni se ejecuta — `if (mapa !== MAPA)` —, así
que las veintitantas sondas que entran por el menú no podían verlo. **Es el
caso único del 50 otra vez**: con un solo valor posible, el correcto y el de
reposo son el mismo.

Ahora se conservan los demás parámetros:

```js
const q = new URLSearchParams(location.search);
q.set("map", mapa);
q.set("menu", "1");
location.search = `?${q}`;
```

### b) El servidor decía su mapa y el cliente no le hacía caso

Arreglado (a), los dos conectaban. Y aquí entró el usuario con un dato que no
estaba en ningún sitio del repositorio:

> «en msr original cambiar de mapa temporalmente te desconecta del servidor y
> luego de 5 segundos si recuerdo te reconecta al servidor que ya cambio de
> mapa, creo que era asi»

Que es exactamente lo que hace el motor —`CL_Disconnect()` y reconexión,
`host_cmd.cpp:970`— y que destapó el segundo fallo: **el servidor manda su mapa
en la bienvenida desde el 47 y el cliente sólo lo escribía en la consola**.

```js
console.log(`red: partida «${red.partida}», eres el jugador ${red.yo} de ${red.mapa}`);
```

Si no coincidía con el tuyo, andabas **otro mundo**: tu Edana contra su Gate
City, con las figuras de los demás puestas en coordenadas de un mapa que no es
el tuyo. Sin un error, porque cada mitad estaba bien por separado — otra vez un
fallo *entre* dos piezas que funcionan.

En el navegador, una recarga **es** ese desconectar y volver a conectar. Así
que ahora, cuando los mapas no coinciden, se cierra el enlace y se recarga con
el mapa del servidor y el mismo `red=`. No puede dar vueltas: después de
recargar los dos nombres coinciden.

Con una condición que costó una vuelta entender: **sólo si el jugador ya ha
elegido mapa** (`mapaPedido`). Sentado en el menú principal el mapa cargado es
el *fondo* —el paseo de la cámara, que el 53 dejó de ser una partida—, y
arrastrarlo al mapa del servidor ahí es sacarle del menú sin que haya pulsado
nada. La primera versión hacía eso y la sonda lo dijo con toda claridad: «no
hay menú principal: la entrada por el menú no existe».

### c) La entrada por el menú se caía al navegar

```
LA SONDA SE HA CAÍDO: elementHandle.click: Element is not attached to the DOM
```

`sondas/entrar.mjs` buscaba los botones recorriendo manejadores y preguntando
`textContent` de uno en uno. Eso revienta **mientras la página navega**, y aquí
«Start» navega siempre que el mapa elegido no sea el del fondo. Con Gate City no
recarga y el bucle sobrevivía. Los tres bucles pasan a localizadores, que se
resuelven de una vez dentro de la página y reintentan solos.

### d) Y un control que medía Gate City

Con todo lo anterior arreglado, 20 de 21. El rojo era el propio control:

```js
control("el mapa sigue dibujado y el HUD en pie con la red puesta",
  mundo.triangulos > 40000 && mundo.hud !== false, ...);
```

**41 494 son los triángulos de Gate City escritos a mano.** Edana tiene 33 087,
así que el control se ponía rojo con el mapa perfectamente dibujado. Un umbral
copiado de un mapa mide ese mapa; lo que se quiere saber es que *sigue* en pie,
así que ahora se compara contra lo que había al entrar.

**21 de 21 en los dos mapas.**

---

## 2. El chat: tres canales, no tres colores

Esto es lo que un port se salta sin darse cuenta. Master Sword no tiene «chat» y
«chat de equipo»: tiene **tres maneras de hablar**, con tres teclas y **tres
frases distintas**.

```
bind "y" "say_text 0"      global   ->  [global] Ana: hola
bind "u" "say_text 1"      local    ->  Ana says,  "hola"
bind "j" "say_text 2"      party    ->  [party] Ana: hola
                               ../MSC/assets/msr/config.cfg:23, 28, 32
```

El local no lleva prefijo ni dos puntos: lleva el verbo. Y lleva **dos espacios**
detrás de la coma, porque en el motor está escrito así:

```cpp
_snprintf(cTemp, sizeof(cTemp), "%s says,  \"%s\"\n", DisplayName(), pszSentence);
                                              msmonsterserver.cpp:1632
```

Una errata de 2007 que lleva dieciocho años en pantalla. Se porta con el fallo, y
tiene una prueba que sólo mira eso, porque quien escriba esa línea de memoria
pondrá un espacio y el juego seguirá funcionando.

El cuarto tipo, `SAYTEXT_NPC`, **no lo puede mandar un cliente**
(`Type >= 0 && Type <= 2`, `vgui_hud.cpp:492-497`) y sale de que hable un NPC en
local: el tipo se decide con `IsPlayer()`, no con la tecla.

### Quién lo oye, y en qué orden

```cpp
if (pEnt->edict() == edict()) { ...enviar...; continue; }          // 1
if (SpeechType == SPEECH_LOCAL)
    if ((pEnt->Center() - Center()).Length2D() > m_SayTextRange) continue;
if ((SpeechType == SPEECH_PARTY && IsPlayer()) && !SameTeam(pEnt, this)) continue;
                                              msmonsterserver.cpp:1699-1718
```

1. **El que habla se oye siempre**, antes de mirar distancia ni equipo. Tu
   propia frase local te sale en pantalla aunque estés solo.
2. `Length2D()`: **la altura no cuenta**. Alguien tres pisos por encima de ti,
   en la misma vertical, te oye hablar bajito.
3. El «party» llega hoy sólo al que habla, y es correcto: `SameTeam` empieza con
   `if (!pObject1->TeamID()[0] || ...) return FALSE;` (`team.cpp:167`), y sin
   grupos montados el `TeamID` de todos está vacío. Es lo que hace el juego en
   un servidor donde nadie ha hecho grupo.

### El corral de los 6 000, que no se ve nunca y existe

```cpp
UTIL_EntitiesInBox(pList, 255, Vector(-6000,-6000,-6000),
                   Vector(6000,6000,6000), FL_MONSTER|FL_CLIENT|FL_SPECTATOR);
                                              msmonsterserver.cpp:1652
```

El «global» no es global: es una caja de 12 000 unidades centrada en el origen
del mapa, y como mucho 255 entidades. Gate City y Edana caben, así que hoy no
cambia nada — se porta igual, porque el día que un mapa no quepa, el fallo va a
parecer de la red.

### La misma clase dibujada dos veces

```cpp
m_Consoles.push_back(new VGUI_EventConsole(this, EVENTCON_X, EVENTCON_Y, ..., Prefs));
m_Consoles.push_back(new VGUI_EventConsole(this, SAYTEXTCON_X, SAYTEXTCON_Y, ...,
                                           Prefs, true, g_FontID));
                                              vgui_hud.cpp:188-197
```

La consola del chat **es la misma clase** que la de sucesos. Cuatro diferencias
y están todas ahí: el sitio (`XRES(10), YRES(180)`, a la izquierda y a media
altura), los cvars (`ms_txthud_*`: 8 líneas, 50 de historia, 9 segundos en vez
de 5/10/5), `DynamicWidth = true` y otra letra. Así que aquí se reusa
`ConsolaDeSucesos`, que ya es esa clase portada desde el 24.

El ancho dinámico es lo que hace que una línea suelta no pinte un rectángulo
negro de media pantalla: la caja **se encoge al ancho de la frase más larga que
se está viendo**. Y el ancho al que se *parte* el texto es otro —
`ms_txthud_width`, 640, la pantalla entera—: se parte muy ancho y se dibuja muy
estrecho.

---

## 3. Lo que la sonda encontró

`sonda:chat61` abre dos Chrome contra un servidor de verdad, entra por el menú,
**pulsa la Y de verdad y escribe letra a letra**. No hay ninguna puerta
`probe.chat.abrir()`: una puerta así pondría todo en verde con las tres teclas
desconectadas, que es el fallo del 35 con otro nombre.

### El fallo de unidades

Primera vuelta, 22 de 24. Y uno de los rojos era esto:

```
  LAS 300 UNIDADES
    separados       21.48 m = 846 unidades (el rango son 300)
  NO  el LOCAL de Ana no llega a Beto, que está fuera de las 300
```

`SPEECH_LOCAL_RANGE` vale 300 y está escrito **en unidades de GoldSrc**
(`msmonster.h:79`); los cuerpos del servidor los mueve Rapier y están **en
metros**. Comparar los dos números sin convertir da un rango de 300 *metros*, o
sea 11 811 unidades: **el «local» se oía desde el otro extremo del mapa**, y los
tres canales pasaban a ser el mismo con distinto color.

La constante se queda en unidades, que es donde se puede citar, y la conversión
se hace en el servidor, que es donde está la escala del mundo.

### El otro rojo era de la sonda, y también es del motor

```
  SE VA SOLO
    visibles        3 -> 3
```

La sonda había puesto `decaimiento: 600` para que las frases aguantaran los
cuarenta segundos de medición, y luego lo bajaba a 1 y adelantaba el reloj
treinta segundos. No pasó nada, y tiene razón: **`m_ShrinkTime` se fija una vez
con el valor que hubiera entonces** (`vgui_eventconsole.h:296-300`), así que
bajar el cvar con la cuenta en marcha no la acorta. Se rearma por donde lo
rearma el juego — `StepInput`, que pone `m_ShrinkTime = 0`, o sea RePág.

### Y un control frágil que se coló

«Se han separado más de 300 unidades» se hacía andando once segundos, y dio 925
una vuelta y 271 la siguiente: el suelo de Edana tiene una cuesta y un muro, y
una espera fija mide el terreno tanto como la separación. Ahora se anda **hasta
llegar**, girando si se atasca. Un control que depende de dónde caiga el punto
de aparición no es un control.

---

## 4. Romper el arreglo, dos veces

**Rota la conversión de unidades** (`rango: RANGO_LOCAL` sin dividir):

```
  ── 23 de 24 controles ──
  NO  el LOCAL de Ana no llega a Beto, que está fuera de las 300  [2 líneas]
```

Cae ése y sólo ése.

**Roto el enrutado** (las frases al `suceso()` de la consola de sucesos, que es
justo el fallo del 60):

```
  ── 13 de 24 controles ──
  NO  lo que Ana dice llega a la pantalla de Beto  [0 líneas]
  NO  la frase sale en la caja del chat, y está VISIBLE  [visible:false]
  NO  y NINGUNA frase de chat se ha colado en ella
      [... | [global] Ana: hello there | control: esto sí es un suceso]
```

Ese último es el que importa: **el control ve la frase de chat dentro de la
consola de sucesos**. El 60 documentó ese fallo después de que el usuario lo
viera jugando; ahora hay algo que lo ve antes.

---

## 5. Lo que sigue sin estar

Dicho en voz alta, porque contarlo entre lo hecho sería el apartado 4 por otra
puerta:

- **No hay grupos.** El canal «party» está portado entero y llega sólo al que
  habla, que es lo que hace el juego sin grupos — pero eso es una regla
  cumpliéndose en el vacío, no una función medida. Declarado pendiente.
- **Los iconos del cajetín no están.** `hud_shout`, `hud_talk` y `hud_party` son
  sprites de `assets/msr` y no se sirven (regla 3 del apartado 2 de CLAUDE.md).
  Va una letra en su sitio, del mismo tamaño y en el mismo hueco.
- **No hay `game_playerspeak` ni `game_heardtext`.** El mod le pasa cada frase
  al guion del `game_master` y a los NPC que la oigan (`client.cpp:483-490`,
  `msmonsterserver.cpp:1732-1744`): es como se le habla a un NPC por voz. No
  está portado.
- **No hay `admin_gag`.** Y al leerlo apareció un fallo del mod que conviene
  dejar anotado antes de portar nada: el texto amordazado se escribe **encima
  del buffer compartido** (`_snprintf(FinalSentence, ...)`, línea 1689) dentro
  del bucle de reparto, así que **quien vaya detrás del que habla en la lista de
  entidades oye la versión muda y quien vaya delante oye la de verdad**. No es
  reproducible hoy porque `say_text` está cerrado a los amordazados
  (`client.cpp:474`) y sólo se llega por `say`.
- **Las tiendas y los guiones siguen corriendo en el navegador**, y esto es lo
  primero que falta. Dos jugadores delante del mismo vendedor ven dos estantes
  distintos. El protocolo tiene un solo mensaje de acción del cliente además
  del chat: `PEGAR`.
- **El combate entre jugadores no existe**: `rebobinar()` es sólo la consulta y
  la otra mitad de `SV_SetupMove` no está escrita (`src/red/partida.js`, dicho
  desde el 27). Va al final de la lista, no al principio — ver el apartado 7.

---

## 7. Corrección del usuario, y el orden cambia (61)

Dos datos que trajo el usuario después de leer el informe, y los dos se
comprobaron en el código antes de aceptarlos.

### a) Las ventanas son del cliente y los números del servidor

> «recuerdo que las ventanas de compra y los guiones eran ventanas vgui dentro
> del juego»

Correcto, y el reparto exacto importa más que el hecho. La ventana de la tienda
es VGUI del cliente, y **cada número que enseña llega por el cable**:

```cpp
CStorePanel::iStoreBuyFlags = READ_BYTE();
CStorePanel::StoreVendorName = READ_STRING();
StoreItem.Quantity    = READ_SHORT();
StoreItem.iCost       = READ_LONG();
StoreItem.flSellRatio = READ_SHORT() * 0.01;
StoreItem.iBundleAmt  = READ_SHORT();
CStorePanel::StoreGold = READ_LONG();
                                              vgui_storemainwin.cpp:88-135
```

Comprar es `ServerCmd("trade …")` (`client.cpp:739`), y elegir una opción de un
menú de guion es `ClientCmd("menuselect %d")` (`menu.cpp:143`) que atiende
`multiplay_gamerules.cpp:1576`.

O sea: **la ventana es del cliente, el estante y las consecuencias son del
servidor**. Este port tiene las ventanas en su sitio desde el 60 y la autoridad
en el sitio equivocado. No es «portar la tienda en red»: es mudar la autoridad,
con el reparto ya escrito por el mod.

### b) El PvP baja del camino crítico

> «recuerdo hay un voto para pvp pero como el juego es prioritariamente
> cooperativo no se usaba mucho»

La conclusión es correcta y el mecanismo no es ése: **no hay voto de PvP**. El
sistema de votos tiene exactamente dos tipos, echar y cambiar la hora:

```cpp
else if (FStrEq(pcmd, "startvote") && CMD_ARGC() >= 3 ) {
    if( ... "kick" ) if( CVAR_GET_FLOAT("ms_allowkickvote") ) StartVote(...);
    else if( ... "time" ) if( CVAR_GET_FLOAT("ms_allowtimevote") ) StartVote(...);
                                              multiplay_gamerules.cpp:1701-1713
```

El PvP es un cvar de servidor, y **viene apagado de fábrica**:

```cpp
cvar_t ms_pklevel = {"ms_pklevel", "0", FCVAR_SERVER}; // 1 == in town only
                                              svglobals.cpp:47
```

Lo cual encaja con lo que nuestra ventana «Create Server» ya enseña y
`sonda:arranque36` ya mide: `{"votarHora":true,"pvp":false,"central":false}`.

**Y ese comentario está al revés**, que es el tipo de cosa que este cuaderno
guarda:

```cpp
MSGlobals::PKAllowed       = ms_pklevel.value > 0.0f ? true : false;   // :144
MSGlobals::PKAllowedinTown = ms_pklevel.value > 1.0f ? true : false;   // :148
```

Con `ms_pklevel 1` el PvP está permitido **en todas partes menos en el pueblo**,
lo contrario de lo que dice la línea de al lado; para el pueblo hacen falta `2`.
El día que se porte, se porta el código y no el comentario.

### El orden que queda para «Edana entre dos»

1. **La autoridad de las tiendas al servidor**: el estante por el cable y
   `trade` como orden. Es lo que hace que dos personas delante de Krythos vean
   lo mismo.
2. **Los guiones al servidor**: `menuselect` ya viaja con ese nombre en el
   original; aquí el guion corre en el navegador de cada uno.
3. **Los grupos**, que el canal «party» del chat está esperando.
4. **El PvP**, al final, y diciendo que viene apagado.

---

## 6. Apéndice: un rojo que medía otra cosa

Al volver a pasar las sondas vecinas, `arranque36` daba **21 de 22** con este
rojo:

```
  MAL  CONTROL: y sin embargo hay una escena cargada y dibujándose
       41494 tri en el nivel, 1 dibujados
```

Un triángulo. Y el dibujo estaba perfecto: durante el paseo del menú se dibuja
en **dos pasadas** —la escena a un destino intermedio y el destino a la
pantalla, `src/render/pasadamenu.js:95-97`— y la segunda es el triángulo grande
de pantalla completa que ese archivo declara a mano:

```js
geometria.setAttribute("position", new THREE.Float32BufferAttribute([
  -1, -1, 0, 3, -1, 0, -1, 3, 0,
], 3));
```

Three.js pone `info.render` a cero en cada `render()`, así que lo que el control
leía era el triángulo del compositor. Con `info.autoReset = false` y un
`info.reset()` antes del fotograma, el mismo control lee **368 212** y queda en
22 de 22.

Es el apartado 4 reflejado: no un verde que no mide nada, sino **un rojo que no
mide nada**. Y es igual de caro, porque invita a buscar el fallo donde no está —
es el primo del `atan2` de la escalera que ya está en la tabla. El control no
era de este experimento: el compositor del menú llegó con la torre, y el rojo
llevaba desde entonces esperando a que alguien volviera a pasar la sonda.
