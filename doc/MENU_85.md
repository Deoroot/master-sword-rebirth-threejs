# Experimento 85 — tu propio menú

El usuario: «con la F abro el menú de interacción, hago clic en *Sit Down (Rest)*
y sale **That is not implemented yet**; y lo mismo todas las demás opciones de
ese menú. En el original salía una animación de sentarse y el jugador recuperaba
vida, maná y energía poco a poco».

Lo primero que hubo que corregir fue mi propio diagnóstico de la sesión
anterior. Yo buscaba un fallo en el menú **de los NPC**, y un compañero midió
que los cuatro vendedores de Edana abren su panel y contestan. Tenía razón: el
menú que estaba muerto no es el de ningún vecino. Es **el tuyo**.

---

## 1. El fallo: `pedir` tenía su rama y `elegido` no

```js
// src/juego/interacciones.js
async pedir(id, sesion) {
  const quien = id === null ? null : this.npcPorId?.(id);
  if (!quien) return { nombre: "You", opciones: opcionesDelJugador(...) };   // ← desde el 60
  ...
}

elegido(id, indice, sesion) {
  const quien = id === null ? null : this.npcPorId?.(id);
  const guion = this.guionDe(quien);
  ...
  if (!guion) {
    this.suceso?.("nopuedes", "That is not implemented yet: this NPC has no ported script.");
```

Con la F sin nadie delante, `id` es `null` —`else pMonster = pPlayer`,
client.cpp:679-682—, así que no hay NPC, así que no hay guion, así que **las seis
opciones salían por el cajón de «este NPC no tiene guion portado»**. Un mensaje
correcto para un caso que no era ése.

Las dos mitades estaban verdes. Una sabía qué ofrecer y la otra no sabía qué
hacer con lo ofrecido, y entre las dos no había nada que mirara. Es el 63 otra
vez: *cuando algo no funciona y las dos mitades están verdes, el fallo está en el
viaje.*

## 2. Y debajo había tres huecos más, los tres del catálogo

Cerrar la costura no bastaba, porque **lo que hacen las opciones no estaba
escrito en ningún sitio**.

### 2.1 Un parámetro con valor por omisión que nadie pasaba

`opcionesDelJugador(personaje, estado)` tenía el `estado` en la firma **desde el
60**, con su cita y su comentario explicando que sentado el menú encoge:

```
if ( !$get(ent_me,sitting) )            player_sv_menu.script:19 y :32
```

Nadie se lo pasaba. O sea que `sentado` valía `false` en todas las partidas: la
primera opción decía siempre «Sit Down (Rest)», nunca «Stand Up», y las tres
emociones salían también estando sentado. **La única condición que tiene este
menú estaba portada, citada y no se cumplía jamás** — el 62 literal, con el
agravante de que no había forma de sentarse para notarlo.

### 2.2 `anadirOpcion: () => {}`, con un comentario que lo justificaba

```js
// src/play/guionjugador.js:256
// El entorno del jugador. Es el hermano de `entornoDe` de `npcguion.js`, y es
// más corto a propósito: el jugador no tiene menú de interacción, ...
anadirOpcion: () => {}, quitarOpcion: () => {}, abrirMenu: () => {},
```

Sí lo tiene, y es un guion: `player/player_sv_menu` **está entre los 27 archivos
cargados** y registra las seis con `menuitem.register` contra el vacío.
`opcionesDelJugador` es una copia a mano de lo que el guion ya sabe hacer.

No se ha arreglado en este experimento y se dice por qué: para que el guion las
registre de verdad hace falta el reparto del menú del jugador entero, y eso toca
el panel. Queda apuntado en §7.

### 2.3 Los cuatro guiones de las emociones no se cargan

Los `callback` del menú mandan `action <EFFECT_ID>`:

```
{ plr_menu_emote
    local CMD_STRING "action "
    stradd CMD_STRING PARAM2
    clientcmd ent_me CMD_STRING }       player_sv_menu.script:182-187
```

y el que contesta es un **efecto**, que es otra entidad con guion propio:

| archivo | `EFFECT_ID` | qué hace |
| --- | --- | --- |
| `player/emote_sit&stand.script` | `player_sitstand` | sentarse y levantarse |
| `player/emote_yes.script` | `player_nodyes` | asentir |
| `player/emote_no.script` | `player_nodno` | negar |
| `player/emote_idle.script` | `player_standidle` | firmes |

Ninguno de los cuatro se carga: cuelgan de `#include effects/base_effect`, y el
sistema de efectos no está portado. Así que `src/play/menujugador.js` es un
puerto **a mano** de los cuatro, con la cita de cada regla al lado.

Y eso **no es la segunda fuente del 82**, porque no hay primera: aquí no había
nada. El día que haya efectos, ese archivo se borra y se carga el guion.

---

## 3. Los números de descansar, y el acumulador

```
repeatdelay 5                                   emote_sit&stand.script:81
setvard REGEN_RATE 0.05  · multiply por maxhp  · mínimo 2        :94-97
setvard MANA_RATE 0.20   · multiply por maxmp  · mínimo 4        :114-117
add regen.hp.amt REGEN_INT  ·  givehp ent_me regen.hp.amt        :98-99
drainstamina ent_me -1000                                        :100
```

**`add` suma, y lo que se regala es el acumulado, no el incremento.** Nadie lo
reinicia mientras sigas sentado —de pie sí, `:109` lo pone a 1 cada vuelta— así
que descansar **acelera**: con 100 de vida máxima las vueltas dan 6, 11, 16,
21… Eso es exactamente el «poco a poco» del reporte.

Y se comprobó que no es una variable del motor: la cadena `regen.hp.amt` sólo
aparece en ese archivo, en seis líneas, y en ninguna de las 2 884 restantes ni en
el C++. Si fuera del motor, el motor podría estar reiniciándola.

El `drainstamina` en NEGATIVO devuelve aguante (`Player_UseStamina(Amt)`,
scriptcmds.cpp:3005). Son mil sobre un máximo de siete y medio, o sea «lleno».

### Lo que confirmó la lectura: 3 y 5

La cabecera del archivo dice «*Thothie - Raising sit mana regen to 5, and sit
health regen to 3 (total) due to mass complaints*». Medido en el navegador, la
primera vuelta da **vida 3 y maná 5** — el 1 de base más el mínimo de cada uno.
Que los dos números del autor salgan de la aritmética portada es la mejor señal
de que la lectura es la buena, y en particular de lo de §4.

## 4. El `if` viejo abandona su bloque, no el evento

Esto decidía si sentarse da maná, así que hubo que leer el motor en vez de
suponerlo.

```
local SHOWIT_ON $get(ent_me,scriptvar,SHOW_HEALTH)
if SHOWIT_ON                                     emote_sit&stand.script:102-103
```

Un `if` sin paréntesis es el VIEJO, y el 67 dejó escrito que «abandona el bloque
entero». Lo que el 67 no podía distinguir es **qué bloque**, porque su caso
—`if game.serverside` en `game_player_putinworld`— estaba al nivel de arriba del
evento, y ahí abandonar el bloque y abandonar el evento son lo mismo.

Aquí no: este `if` está **dentro** de `if ( AM_SITTING ) { }`, y el bloque del
maná es su hermano, no su hijo.

```cpp
if (Script_ExecuteCmd(Event, Cmd, Params)) {
    if (Cmd.m_Conditional) Script_ExecuteCmds(Event, Cmd.m_IfCmds);   // recursión
} else if (Cmd.m_Conditional) {
    if (!Cmd.m_NewConditional) break;      // Old if command
```
`script.cpp:5748-5757`

El `break` sale del bucle de **esa** `Cmdlist`, y a los bloques hijos se entra
por recursión. O sea que abandona su bloque y el de al lado corre.

Consecuencia, que es lo que el usuario recordaba: **sentarse da vida, maná y
aguante.** Lo que `SHOW_HEALTH` apagado se lleva son sólo los dos
`gplayermessage` del final de cada bloque. Y `SHOW_HEALTH` no lo pone nadie al
arrancar —sólo lo mueve el comando `showhealth`, player_main.script:392-396—, así
que en una partida recién empezada **descansar cura en silencio**.

*Corrección al 67, al lado y sin reescribirlo: su fila no está mal. Decía «el
bloque» por dónde estaba su caso, no por la regla.*

### Y la línea muerta de las comillas simples

```
if ( STRUCK_TIME equals 'STRUCK_TIME' ) setvard STRUCK_TIME 1          :85
```

No corre nunca. Las comillas simples no agrupan: `GetConst` devuelve el texto CON
comillas (script.cpp:350-354) y una variable sin poner devuelve su nombre SIN
ellas (script.cpp:4741), así que nunca son iguales. No cambia nada —`atof` de un
nombre da 0, y 0 ya pasa el `<= 1` de la línea siguiente— pero es la tercera vez
que esas comillas deciden si una línea del mod corre.

### El castigo son tres vueltas y el mod dice cinco

```
if ( STRUCK_TIME > 0 ) subtract STRUCK_TIME 1
...
if ( STRUCK_TIME <= 1 ) { …                                           :83-87
setvard STRUCK_TIME 5   //Do not allow heal 5 cycles after being struck :141
```

El `subtract` va **antes** del `<= 1`, así que las vueltas son 5→4, 4→3, 3→2 sin
curar y 2→1 ya cura: **15 segundos de castigo y la cura vuelve a los 20**, no a
los 25. Se porta la aritmética, no el comentario.

Y es asimétrico: `game_struck` reinicia `regen.hp.amt` a 0 y **no toca
`regen.mp.amt`**, así que después de un golpe la vida vuelve a empezar su rampa y
el maná sigue donde iba.

---

## 5. El `IsActing()` que estaba escrito en un comentario

Esto salió de querer **medir** el `drainstamina`, y es el hallazgo lateral del
experimento.

```cpp
else if (player.Stamina < player.MaxStamina() &&
         !FBitSet(player.m_StatusFlags, PLAYER_MOVE_RUNNING) &&
         !(player.IsActing()))
```
`fatigue.cpp:77-79`

Tres condiciones. Este puerto tenía dos, y la tercera estaba escrita **en el
comentario de su propia función**:

```js
/**
 * Y se recupera a `0.6 + Fuerza/10` por segundo, **sólo si no corres ni
 * actúas**. `CHudFatigue::DoThink()`.
 */
export function regeneracionDeAguante(fuerza = 0) {
```

El comentario era correcto y no lo aplicaba nadie. Los cuatro efectos del menú
llevan `const EFFECT_FLAGS player_action`, que es lo que pone esa bandera, así
que sentado el aguante **no sube solo** — y ahí encajan las dos piezas: si subiera
solo, el `drainstamina ent_me -1000` del guion no haría falta.

**Y sin esto el experimento no se podía medir.** Con la regeneración normal
corriendo, el aguante se llena en los cinco segundos del ciclo igual con el
comando y sin él: el 66, *cuando dos cosas mueven el mismo número, «se movió» no
dice cuál*. Con el `IsActing()` puesto, sentado el aguante se queda clavado y la
vuelta lo llena de golpe — y entonces el control distingue.

## 6. La animación, y la lista blanca del 78 otra vez

El muñeco del HUD —`ms_lildude`, tu figura pequeña— usa el mismo horneado que la
hoja de personaje, y ése sale de una lista blanca de **seis nombres de
`global.script`**. Los nombres de las emociones están en otros cuatro archivos:

```
playanim hold sitdown      emote_sit&stand.script:54
playanim once nod_yes      emote_yes.script:25
playanim once nod_no       emote_no.script:25
playanim hold attention    emote_idle.script:25
```

Tres de las cuatro estaban por casualidad: `sitdown` y `attention` porque la
pantalla las pide también, y `nod_yes` porque **es la secuencia 0** y el extractor
emite siempre la primera. La que faltaba era `nod_no`, y no habría dado ningún
error: el visor cae a la primera secuencia que tenga, así que **«Emote: Nod No»
habría hecho que el muñeco dijera sí**.

*El 78 literal: una lista blanca sólo mira donde sabe mirar, y el nombre puede
venir de otro archivo.*

### Y los dos modos de `playanim`, que el muñeco no conocía

`muneco.pon` ponía siempre `LoopRepeat`, que es correcto para las tres posturas
que le pedía el bucle y no para éstas. `once` es MONSTER_ANIM_ONCE y vuelve al
reposo; `hold` es MONSTER_ANIM_HOLD y se queda (npcscript.cpp:1512-1519). Sin la
distinción, sentarse en bucle es levantarse y volver a sentarse cada dos
segundos — que es **exactamente** lo que le pasó a la hoja de personaje en el 48,
con su comentario todavía en `src/render/cuerpo.js`.

---

## 7. Lo que se midió

- **52 pruebas de Node** (`test/menujugador85.test.mjs`), con los números leídos
  a mano del `.script` y su línea al lado (el 75), y los seis últimos controles
  entrando por `InteraccionesNpc` —que es por donde entra el panel— y no
  construyendo la opción a mano, que es el 59.
- **20 controles de sonda** (`npm run sonda:menujugador85`), que pulsa la F de
  verdad y hace clic en el botón por su texto. **No hay
  `probe.emociones.sentar()`**, y es la regla del 29: el fallo medido es
  justamente que el estado se podía poner a mano y el juego seguía roto.

Lo que la sonda mide y las pruebas no pueden:

| control | por qué sólo lo ve una sonda |
| --- | --- |
| la cámara baja **28,00 u** | se lee de `camara().distancia`, que es `|ojo − cámara|` del juego. Ese número no lo escribe nadie nuestro |
| sentado no se anda | con su control positivo: la misma W, los mismos segundos, de pie — **240 u contra 0** |
| el muñeco se sienta | `playanim hold sitdown` llega al esqueleto |
| el aguante vuelve | y antes de la vuelta NO ha subido, que es lo que separa los dos mecanismos (§5) |
| la descripción | comparada con la del catálogo leído en Node, no con «algo salió» |

Seis roturas deliberadas, cada una con su `grep` confirmando que estaba puesta:

| rotura | qué salió |
| --- | --- |
| **la costura `id === null`** | sonda **7 de 20** y 6 pruebas rojas |
| no pasar `estado` a `opcionesDelJugador` | sonda 13 de 20 |
| el hundimiento de la vista | 18 de 20 |
| `drainstamina` | 19 de 20 |
| la guarda de la animación de un pase | 19 de 20 |
| `add` por un `set` en el acumulador | 5 pruebas rojas |

---

## 8. Lo que entendí mal por el camino

| creí | era |
| --- | --- |
| que el fallo era del menú **de los NPC**, porque el mensaje decía «this NPC has no ported script» | que el mensaje era correcto y el caso no era ése. Lo midió un compañero: los cuatro vendedores de Edana abren y contestan. *Un mensaje de error correcto apuntando al caso equivocado es más difícil de ver que uno ausente* |
| que un `if` viejo abandona el EVENTO, y que por tanto sentarse no da maná | que abandona **su `Cmdlist`**, y el bloque de al lado corre. Ver §4. La fila del 67 no está mal: su caso estaba al nivel de arriba y los dos eran indistinguibles |
| que el aguante máximo son 3, que es lo que dice el respaldo del perfil | que se deriva de las habilidades y este personaje tiene **7,50**. El primer control leyó «quedan 5,55 de 3» y salió rojo con el trabajo bien hecho: *el umbral medía mi supuesto*, el 75 dentro de una sonda |
| que bastaba pedirle la animación al muñeco | que el bucle le pide una postura **cada fotograma**, así que el asentimiento duró **un fotograma** y la sonda leyó «el muñeco tiene idle» con el estado diciendo `player_nodno`. Es el fallo que el 80 encontró en el ataque de los bichos — y yo lo escribí **después de avisarlo en mi propio comentario**, dos líneas arriba |
| que la descripción del objeto no salía: la consola decía `"impact"` | que la consola **parte las líneas largas** y yo leía la última entrada. El 81 calcado. La descripción entera estaba ahí; el instrumento leía bien y la unidad de lectura era la equivocada |
| que `0 * -28` es `0` | que es **`-0`**, y de ahí cuatro rojos en la primera pasada de las pruebas. El 81 ya perdió una rama entera por el `-0` de un `atan2` |

Y una del método, que no es un error mío sino una consecuencia que conviene
saber: **`sondas/vgui29.mjs` se puso rojo con el juego bien.** Esa sonda pulsa el
**1** para probar que la tecla elige el primer botón, y el primer botón del menú
del jugador es «Sit Down (Rest)». Llevaba cinco experimentos pulsando un botón
que no hacía nada; desde hoy te sienta, y sentado el menú encoge, así que su
control de «salen las SEIS» leía cuatro. *Una sonda que pulsa un botón hereda lo
que ese botón haga el día que alguien lo conecte.*

## 9. Lo que queda

- **El sistema de efectos no está portado**, y es el hueco grande que esto deja a
  la vista. `#include effects/base_effect`, las variables `game.effect.*`, el
  `clientevent` y el reparto cliente/servidor. Mientras no esté, los cuatro
  emotes son un puerto a mano; con él, se cargan como cualquier guion. El resto
  de `player_action` del mod —que son muchos más que cuatro— entra por ahí.
- **`anadirOpcion` sigue siendo un `=> {}`** en el entorno del jugador, así que
  `player_sv_menu` registra sus seis opciones contra el vacío y
  `opcionesDelJugador` las repite a mano. Es una segunda fuente para la misma
  lista y hay que quitarla; no se ha hecho aquí porque el reparto del menú del
  jugador toca el panel y son dos cosas.
- **La rama de verdad de «Forgive Last PK»** necesita saber quién te mató
  (`m_LastPlayerToKillMe`), y eso no existe: no hay combate entre jugadores. Lo
  que se porta es la rama `else`, que es lo que contesta el original con un solo
  jugador, y no es un relleno: es su texto.
- **La descripción del objeto va a la consola de sucesos y en el original es
  otro sitio.** `ShowWeaponDesc` usa `gHUD.m_Message.MessageAdd`, con fundido de
  2 s, 5 de espera y 3 de salida, en `reg.hud.desctext` = **(0,012 · 0,72)** de la
  pantalla (global.script:51-52) y en gris 128. Este puerto no tiene ese tercer
  destino —tiene la consola y las dos ventanas de `src/play/aviso.js`— así que el
  enrutado **no es fiel y queda dicho**, que es el 60: cuando una regla devuelve
  *qué* y otra cosa decide *dónde*, hay que probar las dos.
- **`showhealth` no es un comando de este puerto**, así que hoy no hay forma de
  ver los dos mensajes de descansar desde dentro del juego. El gancho está leído
  del guion (`mostrarVida`) para que el día que el comando exista no haya que
  tocar nada; las pruebas lo miden con el gancho a mano y la sonda no lo cuenta.
- **Las mascotas del menú** (`list_summons`, `list_unsummons`,
  player_sv_menu.script:64-73) no se registran, y es correcto: van detrás de
  `$get_quest_data(ent_me,pets)` y un personaje nuevo no tiene ninguna. No se
  cuenta entre lo portado porque no hay segundo caso — la regla del 50.
- **El menú de OTRO jugador sigue vacío**, y eso ya estaba dicho desde el 60: sus
  cuatro opciones están comentadas en el propio archivo del mod.

---

## 10. Filas candidatas para el apartado 4 de `CLAUDE.md`

**Están aquí y no allí a propósito.** Hay cuatro sesiones trabajando y §4 crece a
la vez por varios lados; cómo se integra lo decide el usuario. Si dice que se
compriman en una pasada, salen de aquí sin volver a medir nada; si dice que se
deje, el conocimiento no se queda sólo en un informe que nadie relee.

| experimento | el control decía | de verdad medía |
| --- | --- | --- |
| experimento 85 | las seis opciones de tu propio menú, portadas en el 60 con su cita de `player_sv_menu.script:17-64` y con una sonda contándolas desde entonces | que **nadie podía pulsarlas**. `pedir` tenía su rama para `id === null` y `elegido`, doce líneas más abajo, no la tenía: sin NPC no hay guion, así que las seis caían en el `if (!guion)` y contestaban «este NPC no tiene guion portado» — **un mensaje de error correcto apuntando al caso equivocado**, que es más difícil de ver que uno ausente. Y la sonda que las contaba medía `pedir`, o sea la mitad que funcionaba. *Cuando una clase contesta una pregunta en dos métodos, el segundo puede no tener la rama del primero, y ninguna prueba del primero lo ve* |
| experimento 85 | `opcionesDelJugador(personaje, estado)`, con su `estado` documentado y su condición citada desde el 60 | que **nadie le pasaba el `estado`**, así que `sentado` era `false` en todas las partidas y la ÚNICA condición del menú —`if ( !$get(ent_me,sitting) )`, que lo encoge de seis a tres y renombra la primera a «Stand Up»— no se cumplía jamás. El 62 otra vez, con el agravante de que **no había forma de sentarse para notarlo**: la regla que la habría disparado era la de la costura de arriba. *Dos huecos que se tapan el uno al otro: sin poder sentarse, el parámetro que mide si estás sentado no se puede echar de menos* |
| experimento 85 | `regeneracionDeAguante`, portada con su cita de `CHudFatigue::DoThink` y su número exacto | que el motor pide **tres** condiciones (`fatigue.cpp:77-79`) y el puerto cumplía dos — y la tercera, `!player.IsActing()`, **estaba escrita en el comentario de la propia función**: «sólo si no corres ni *actúas*». El comentario era correcto y no lo aplicaba nadie. Y no era cosmético: sin ella, el `drainstamina ent_me -1000` del guion de sentarse **no se puede medir**, porque el aguante se llena en los cinco segundos del ciclo con el comando y sin él. El 66, «cuando dos cosas mueven el mismo número, "se movió" no dice cuál», con la diferencia de que aquí el segundo mecanismo lo había escrito el propio comentario y nadie lo leyó |
| experimento 85 | que un `if` viejo «abandona el bloque entero», fila del 67 | que la fila es correcta y **no dice qué bloque**, porque su caso estaba al nivel de arriba de su evento y ahí abandonar el bloque y abandonar el evento son indistinguibles. `Script_ExecuteCmds` hace `break` sobre **su** `Cmdlist` y entra a los hijos por recursión (script.cpp:5748-5757), así que abandona su bloque y el hermano corre. Se vio porque de eso dependía si sentarse da maná: `if SHOWIT_ON` está dentro de `if ( AM_SITTING ) { }` y el bloque del maná es hermano. *Cuando una fila de esta tabla describe un mecanismo, comprueba si su caso podía distinguir las dos lecturas: la que no podía distinguir se escribe igual* |
| experimento 85 | el horneado del cuerpo, con su lista blanca de seis nombres sacados de `global.script` y su control que falla si falta alguna | que la lista sólo mira donde sabe mirar. **El muñeco del HUD pide otras cuatro**, y los nombres están en `player/emote_*.script`: tres coincidían por casualidad —dos porque la pantalla las pide también y `nod_yes` porque **es la secuencia 0** y el extractor emite siempre la primera— y `nod_no` faltaba. No habría dado error: el visor cae a la secuencia 0, así que **«Emote: Nod No» habría hecho que el muñeco dijera sí**. El 78 calcado, en otro horneado |
| experimento 85 | la animación del emote, pedida al visor y leída del estado | que el bucle de dibujo le pone una postura al muñeco **cada fotograma**, así que el asentimiento duró **un fotograma** y la sonda leyó «el muñeco tiene idle» con el estado diciendo `player_nodno`. Es el fallo que el 80 encontró en el ataque de los bichos, en otra pieza — y lo escribí **dos líneas debajo de mi propio comentario avisándolo**. *Avisar de un fallo en un comentario no vacuna contra cometerlo en la línea siguiente* |
| experimento 85 | `sondas/vgui29.mjs`, 36 controles en verde desde el 29, **que se puso roja con el juego bien** | que lleva cinco experimentos pulsando el **1** para probar que la tecla elige el primer botón, y el primer botón del menú del jugador es «Sit Down (Rest)». Hasta ahora eso no hacía nada; ahora te sienta, y sentado el menú encoge, así que su control de «salen las SEIS» leía cuatro. *Una sonda que pulsa un botón hereda lo que ese botón haga el día que alguien lo conecte — y un botón que no hace nada es un sitio cómodo donde apoyar un control* |
| experimento 85 | «una vuelta del ciclo devuelve el aguante», **rojo dos pasadas con el trabajo bien hecho** | mi espera. El ciclo corre con el **tiempo del juego** y yo esperaba cinco segundos y medio de reloj de pared; con un Chromium cargando Edana no son los mismos cinco. Se arregla esperando a que la vuelta OCURRA —`waitForFunction` sobre el contador de vueltas, con tope y con un control que dice si no llegó— en vez de a que pase mi plazo. El 75 por el otro lado: allí el umbral medía mi espera, aquí mi espera medía otro reloj |
