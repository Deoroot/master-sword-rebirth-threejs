# Las transiciones entre mapas, y las cloacas de Edana — experimento 89

El encargo era cerrar el último hueco de JUEGO de Edana: sus dos
`msarea_transition`. Medido, ninguna de las ocho transiciones de los tres mapas
horneados llevaba a un mapa horneado, así que se preguntó al usuario hasta dónde
llegar, y eligió **portar la regla y hornear además `edanasewers`**, para que el
viaje llegue a algún sitio.

Queda así, medido por el menú (`npm run sonda:transicion89`, 20 de 20):

- en la puerta de la cloaca de Edana sale, arriba a la izquierda,
  **«Travel to next area (edanasewers)» / «This leads to The Edana Sewers. Press
  (enter) to continue.»** — el texto de la captura del juego original que mandó
  el usuario;
- Enter → «TRAVELING TO edanasewers» / «You will be reconnected shortly.», el
  «Traveling to The Edana Sewers» en el centro, y **a los cinco segundos** se
  carga el otro mapa **con el mismo personaje y sin pasar por la lista**;
- se llega al inicio de las cloacas (0,02 m del `ms_player_begin`), a 2,6 m de
  la escalera de vuelta, donde sale «Travel to next area (edana)» — la segunda
  captura;
- la vuelta llega a una de las **cinco** llegadas `sewer_entrance` de Edana, a
  63 m del templo: por nombre, no por respaldo;
- Thornlands, que no está portado, dice en verde «thornlands does not exist on
  this server. Perhaps this is a future transition point?» y no se va.

---

## LO QUE ENTENDÍ MAL, que es la parte que no se deduce del código

### 1. Dije que el viaje de Edana a las cloacas estaba ROTO en el original. No lo está.

Edana manda a las cloacas con `desttrans sewer_start`, y las cloacas no tienen
ninguna `ms_player_spawn` que se llame así — sólo `fromchapel`. Leí la rama de
`JN_TRAVEL` (player.cpp:2483-2495), que **no tiene respaldo** y acaba expulsando
con «Mapper did not include transition link», y concluí que el original echaba
al jugador. Se lo dije al usuario y le pregunté qué hacer con «el enlace roto».

**Me contestó con dos capturas del juego llegando a las cloacas.** La rama la
decide otro archivo, y su PRIMERA comprobación manda sobre todo lo demás:

```c
if (MSGlobals::CanCreateCharOnMap)
    JoinType = JN_STARTMAP;                          // mscharacter.cpp:216-217
```

`CanCreateCharOnMap` lo pone cualquier `ms_player_begin` del mapa
(player.cpp:2563). Las cloacas tienen uno, así que quien llega es `JN_STARTMAP`,
y ésa sí cae en el inicio cuando no encuentra la llegada (player.cpp:2491-2492).

Y no es un caso raro. Medido en los 92 mapas que se leen: de **193**
transiciones, **111** llegan por nombre, **29** caen en el inicio como ésta, y
**ninguna** se queda sin respaldo. La rama de expulsar existe en el motor y no
la ejerce ningún mapa del juego.

*Antes de seguir una rama, lee quién decide la rama.* La condición estaba en otro
archivo, y el verde que tenía —una prueba que afirmaba «no se llega»— sólo decía
que el código hacía lo que yo creía. Esa prueba se volvió del revés y lleva la
corrección escrita al lado (test/transicion89.test.mjs).

### 2. «El punto de llegada es la transición del destino que se llama como `desttrans`»

También lo dije, «verificado en 4 de 4». Las cuatro transiciones existían, pero
**no es ahí donde se aparece**: se aparece en una `ms_player_spawn` cuyo
`message` es el `desttrans` (`GetRandomSpawnSpot`, player.cpp:2363-2367,
coincidencia exacta, sorteo entre las que valen). El volumen con ese nombre es la
salida de vuelta, no la llegada. Las llegadas con nombre no se horneaban; ahora sí
(`llegadas` en `malla.json`, `leerLlegadasConNombre` en src/bsp/arbol.js).

### 3. Mi primer arreglo del lector de guiones decía ser «aditivo por construcción». Era falso.

Ver abajo, en el horneado. Lo cazó comparar el lector viejo con el nuevo sobre
los 2 884 guiones, no mirarlo.

### 4. Escribí `sesion?.jugando`, copiado de una línea vecina

`Sesion` no tiene ese campo: es `sesion.estado === ESTADO.JUGANDO`. Lo vi antes
de medir porque la condición era nueva y la revisé, y **la línea de la que lo
copié sigue usándolo** (`main.js`, el `QUIEN_VISTE` de los guiones de objeto, que
por eso siempre ve `!undefined`). No es de este experimento y no se ha tocado;
queda dicho para quien lleve los objetos.

---

## EL HORNEADO DE LAS CLOACAS, que destapó dos fallos que Gate City y Edana no podían

### `null.mdl` paraba el horneado: «ni una secuencia cabe en su caja»

`models/null.mdl` pesa 1 672 bytes y tiene **0 huesos, 0 secuencias y 0
bodyparts**: es vacío a propósito, lo usan 32 guiones para entidades con lógica y
sin cuerpo, y en las cloacas lo traen dos `other/lure`. El oráculo de
`tools/bicho.mjs` leía «0 de 0 caben» como un fallo de descompresión. Se cambió
por la condición exacta —con cero secuencias no hay nada que juzgar— y al
cambiarlo, el control de «te sobra la exención» se lo comió por la otra rama; esa
rama ahora sólo vale para quien pide la exención. *Un control hereda el supuesto
de la clase para la que se escribió* (el 69): aquí, «un bicho tiene al menos una
animación».

### Los 16 murciélagos no se colocaban: `callevent 0.1 bat_spawn`

El lector de fichas seguía los `callevent` con `/^callevent\s+(\S+)/`, que se
queda con el PRIMER token — y en `callevent 0.1 bat_spawn` el primero es el
RETRASO. Todo `callevent` con retraso se seguía hasta un evento llamado «0.1». La
regla del motor (`ScriptCmd_CallEvent`, scriptcmds.cpp:2257-2266): con más de un
parámetro, si el primer carácter del primero es un dígito, es el retraso.

Lo diferido corre DESPUÉS del bloque que lo llama, así que va a una cola. Lo
escribí diciendo que eso lo hacía «aditivo por construcción», y **la comparación
sobre los 2 884 guiones lo desmintió: 114 cambiaban un valor que ya tenían**, y
no era una mejora que se pudiera quedar. `NPCs/default_dwarf` —los vecinos de
Gate City— cambiaba la mano porque a `set_lantern` se llega por un
`callevent 1.0 do_lantern` **que sólo corre si `$rand(1,2) == 1`**: el lector no
evalúa condiciones y le aplicaba una moneda al aire a todos los enanos del
pueblo.

Así que lo diferido **sólo rellena**: ni pisa un campo, ni un `bodypart`, ni un
`setstat`, ni rellena con un `$función(...)` sin evaluar (`doom_plant_new` ganaba
`$stradd(LEVEL_PREFIX,idle1)` de animación — y sólo se veía mirando el valor
RESUELTO, porque la línea es `setidleanim ANIM_IDLE`). Medido al final:

| | guiones |
| --- | --- |
| iguales | 2 548 |
| sólo ganan un valor | 311 |
| rellenan un `setstat` ausente cuyo valor por omisión se lee como 0 | 25 |
| errores | 0 |

En los mapas que se juegan: Gate City 1 (el ballestero zombi gana `walk`), Edana
0, Gertenheld 3 (lobos y limo ganan animaciones). Ninguno se ha rehorneado: lo
harán la próxima vez que alguien hornee esos mapas.

**Lo que cuesta, y no se esconde:** un evento diferido incondicional que de
verdad cambia algo se pierde. Medido: `m2_quest/bgoblin_weak` sigue saliendo
desarmado aunque `npc_spawn` le llama a `goblin_set_weapon` sin condición.
Ninguno de los mapas horneados lo tiene.

### Lo que no trae, igual que Gertenheld

`menus.json`: el juego no tiene carpeta `scripts/edanasewers`. El precedente es
el del 78 y `src/play/json.js` ya da por bueno que falte.

---

## LA REGLA (src/play/transicion.js)

Son tres piezas del motor y una del guion, y van citadas en el archivo:

1. **pisar** (`CAreaTransition::OnControls`, msmapents.cpp:1650-1726): guarda de
   una vez, maestro, `GM_DISABLE_TRANSITIONS`, guardar el personaje y
   `game_transition_entered` con cuatro parámetros;
2. **salir** (`DeathNotice`, :1730-1767): `game_transition_exited` con tres;
3. **aceptar** (`MSQuery`, :1779-1872), que es `accept` — Enter,
   `bind "ENTER" "accept"`, config.cfg:6;
4. y el cambio de mapa, que **no lo hace el C++** —`CHANGE_LEVEL` está comentado,
   «letting game_master script handle changelevel functions»— sino
   `game_master/map_transitions.script`.

Una rareza del original que se porta tal cual: `MSQuery` sigue adelante diga lo
que diga el guion, así que **con un mapa que no existe salen las dos cosas** —el
«does not exist on this server» en verde y el «Traveling to The Thornlands» en el
centro—. Lo escribí primero callándolo, y releyendo el motor no era así.

---

## LA COSTURA, y el `=> {}` de siempre

### El `infomsg` del jugador no salía nunca: catorce

El «Travel to next area (…)» no lo pinta el C++: lo pinta `help/first_transition`
con `infomsg ent_me`. Y en el entorno del guion del jugador `infomsg` caía en el
`aviso: () => {}` de `entornoVacio`, al lado de un `ventanaDeAviso: () => {}` bajo
el letrero de «lo que el jugador no tiene». **Catorce `infomsg` del guion del
jugador no habían salido nunca.** Es el 66 y el 81 otra vez.

Al conectarlo había un riesgo concreto: la presentación del mapa es uno de esos
catorce y la pinta además `src/play/intro.js`. La sonda espera a que salga y
comprueba que sale **una vez**.

### El consejo salía cortado: `game.players`

`help/first_transition` añade «.|Press enter to travel to this area» detrás de
`if ( game.players == 1 )`, y `game.players` no estaba portado. Ahora lo contesta
el intérprete (`UTIL_NumPlayers()`, script.cpp:4595-4605) **sólo para el guion
del jugador**, como el `game.map.name` del 83. Los NPC de los mapas que se juegan
lo usan mucho —19 veces en Gate City, 9 en Edana, más 36 `totalhp`/`avghp` en
cada uno, que es escalar la dificultad con la gente— y dárselo cambia cómo pelean
en todos los mapas: eso es otro experimento.

`game.cvar.*` (17 cvars en 9 guiones) **no se ha tocado**: la ventana sale bien
sin él, porque un cvar inexistente vale 0 en la comparación.

### Llegar tras recargar

Viajar es navegar, como «Start» con otro mapa, conservando el resto de la URL por
la razón del 61. La llegada va en la URL (`viaje` = el personaje, `llegada` = el
`m_SpawnTransition`) y se aplica poniendo `sesion.ultimaTransicion`, que es el
campo que la sesión dejó preparado «para que el día que haya un segundo mapa
cambie un sitio y no diez». Y es fiel por partida doble: en el motor morir
también te devuelve a tu última transición (`JN_TRAVEL`).

Una trampa que se vio antes de caer: en el arranque el mapa aún no está cargado y
`elMapa` se resuelve más abajo en la misma función. Un `await` ahí haría que
`arrancarJuego` se esperase a sí misma; va encadenado con `.then`.

---

## CÓMO QUEDA MEDIDO

- `npm test`: 2 230 de 2 230; las 14 de `test/transicion89.test.mjs` usan las
  zonas y llegadas horneadas de verdad.
- **Roturas deliberadas de la regla**, cada una con su `grep` delante: sin la
  guarda de una vez, rojo; el C++ callado con un mapa que no existe, rojo; la
  llegada sin coincidencia exacta, rojo; sin el respaldo al inicio, rojo.
- **Roturas de la costura**, en la sonda: el `infomsg` del jugador desconectado
  → 4 rojos; la llegada ignorada → 2 rojos. Y en esa segunda se ve por qué hacía
  falta el segundo caso del 50: la IDA seguía verde con la llegada rota, porque
  allí el respaldo es el inicio. Sólo la vuelta, que llega por nombre, la caza.
- Sondas vecinas: `arranque36` 30/30, `aviso60` 22/22.
- `intro42` da 11/14, y **no es de aquí**: contra `HEAD` en un `git worktree`
  aparte, sin ningún cambio de este experimento, da exactamente lo mismo —primero
  se cae con `window.probe` sin definir y luego 11/14 con los mismos tres rojos,
  que buscan la presentación en la consola cuando desde el 60 va a la ventana—.

---

## LO QUE QUEDA, dicho

1. **La votación de varios jugadores** (`gm_create_vote`) no está portada: con
   más de uno la regla devuelve `votacion` y la consola dice que no la hay. Para
   el playtest de cuatro, **una transición no lleva a ningún sitio con gente**.
2. **`game.players` para los NPC**, con los números de arriba.
3. **El sonido de entrar** (`TRANS_PLAYSOUND`) y si el motor bloquea también la
   VISTA durante el viaje: no medidos.
4. **El sorteo entre varios `ms_player_begin`**: Edana tiene cinco y el horneado
   guarda uno, el mismo que usan los personajes nuevos.
5. **Las otras seis transiciones** llevan a mapas sin hornear (Thornlands, la
   capilla, las cuevas…) y dicen «does not exist on this server».
6. Los dos señuelos de las cloacas se llaman `PARAM1` (un parámetro sin
   resolver); son invisibles y no se ha seguido.
7. No es de aquí y no se ha tocado: un `vite` en el puerto 5282 vivo desde las
   11:24, de una sesión de otro.
