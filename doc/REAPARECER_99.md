# Reaparecer dentro de la roca — experimento 99, pieza S

> Prueba: `test/reaparecer99.test.mjs` (28 casos: la regla de `PM_CheckStuck`
> sin Rapier, un servidor con un cuerpo metido en una malla densa, un bicho
> metido dentro del jugador, el tope de reloj por mensaje, reaparecer por la
> `Partida` de verdad, la orden con números raros, y Gate City si está
> horneado).
> Sonda: `npm run sonda:reaparecer99` (Chrome contra `tools/servidor.mjs`, en la
> cueva de las arañas de Gate City, muriendo y volviendo). 9 de 9 en cinco
> pasadas; la última, 8 de 9 por una entrada de B que tardó (§8).

El 98 dejó apuntado (doc/SERVIDOR_98.md §7 y §8, NEXT_SESSION «Pendiente del
98» punto 4): «reaparecer dentro de la roca cuelga a Rapier». Con el inspector
se vio a `computeColliderMovement` tardar **segundos** en el cuerpo del jugador
A, y la explicación escrita fue que `_sitioLibre` le había apartado de otro
jugador sin mirar la pared.

Medido, eran **cuatro cosas**, y la del texto no era ninguna de las dos
primeras. La que de verdad colgaba al servidor de la sonda fue la última que
se encontró (§4).

## 1. Al reaparecer, el servidor no movía el cuerpo

**El motor.** `respawn()` es `Spawn()` (client.cpp:159-163); `Spawn` llama a
`MoveToSpawnSpot` (player.cpp:2695), que pone el origen en el punto y la
velocidad a cero (player.cpp:2935-2941). El punto lo elige `FindSpawnSpot`
según `m_JoinType` (player.cpp:2427-2555), y su prueba de «sitio libre» **no
prueba nada**: `IsSpawnPointValid` devuelve `TRUE` con la búsqueda de
jugadores a 128 comentada (player.cpp:2277-2311).

**Lo que había.** La `Sesion` del servidor reaparecía —vida al máximo, estado
«jugando», el aviso `aparece`— y en el servidor **nadie escuchaba ese aviso**.
El único que movía un cuerpo al aparecer era `src/main.js`, en el navegador.
Así que con servidor **se volvía a la vida donde se había muerto**, al lado
del bicho que te mató, y el navegador, que sí se iba al punto, volvía allí con
la primera foto. Medido en proceso, con la `Partida`, la fauna y los 15 de vida
de un recién creado junto a las arañas: cuatro muertes en un minuto, **las
cuatro en −36,00 / −20,10 / 24,00**.

**Arreglo.** `Partida.conectar` escucha el `aparece` de la sesión del servidor
y, si la entrada es `MUERTE`, `_reaparecer` coloca el cuerpo en el punto por
`_sitioLibre`, con la velocidad y la caída a cero.

**La unidad de más, probada y quitada.** El motor pone el origen UNA UNIDAD
por encima del punto (`+ Vector(0, 0, 1)`, player.cpp:2937), y en el primer
`PM_PlayerMove` `PM_CatagorizePosition` la baja («drop us down that 1 pixel»,
pm_shared.cpp:1783 y :1804-1806): la caja acaba apoyada. Aquí la unidad se
puso y **`test/red_27` «sin mentiras la predicción acierta» pasó de 0 a 27,9
mm de error**: 2,5 cm de caída que el cliente y el servidor no predicen igual.
Se quitó y se dejó escrito en `puntoDeAparicion`.

## 2. El punto de nacer de Gate City estaba dentro de la pared

El rayo del templo que elegía `tools/aparicion.mjs` —nacimiento Y
reaparición— deja la cápsula **cortando la pared**: probada contra la malla en
`[2,032, −14,630, −70,866]` sale sólida, y 30 cm hacia −z sale libre. Lo
encontró también por su lado la sesión del salto (doc/SALTO_99.md §2, con el
casco 1 del `.bsp`) y lo arregló en el horneado. Este experimento no toca el
horneado: hace que el servidor **no dependa** de que el punto sea bueno.

`_sitioLibre` es nuestro (el motor no aparta a nadie, §1) y hasta el 99 sólo
miraba a los otros jugadores. Ahora un sitio vale si no hay otro jugador, si
**cabe la cápsula** (`PM_TestPlayerPosition`, §3) y si **se ve desde el punto**
a media altura contra lo fijo (un anillo no salta paredes). Anillos de 0, ¼, ¾,
1½ y 3 veces el hueco entre jugadores, y en cada sitio cuatro alturas hasta un
escalón (0, 6, 12 y 18 unidades: `sv_stepsize`). Si nada vale, el punto, y lo
para el §3. Con el punto viejo de Gate City el servidor pone al jugador 0,47 m
al lado, dentro del templo. `costura()` dice ahora, por cliente, en qué anillo
acabó y por qué se descartó cada sitio (`ultimoSitio`).

Y la trampa de Rapier del 28 (doc/IA_28.md): **no contesta a una consulta
hasta que alguien pone al día su árbol**. El segundo jugador se crea en el
punto y se aparta; sin `updateSceneQueries()` después, el primero le seguía
«viendo» encima, `PM_CheckStuck` le daba por atascado en otro jugador y no
volvía a andar (test/servidor98, «el fénix de un débil», rojo así).

## 3. Atascado, el motor no se mueve; aquí Rapier calculaba segundos

**La medida.** 3 000 cápsulas puestas sobre triángulos al azar de Gate City,
veinte pasos cada una: **la peor tarda 1 888 ms en UN paso** (79,6 / −6,2 /
−36,9), y ocho pasan de 860 ms. El controlador de personaje de Rapier no está
hecho para empezar dentro: calcula contactos contra todo lo que solapa.

**El motor no llega ahí:**

    // Always try and unstick us unless we are in NOCLIP mode
    if (PM_CheckStuck()) return; // Can't move, we're stuck
                                              pm_shared.cpp:3183-3189

`PM_CheckStuck` (pm_shared.cpp:1852-1970) pregunta `PM_TestPlayerPosition`; si
está libre, sigue. Si no, en el SERVIDOR (el bucle de 54 intentos es sólo del
cliente, :1876-1900) prueba **un** empujón de su tabla cada 0,05 s
(`PM_CHECKSTUCK_MINTIME`, :1850), y lo aplica sólo si es de los grandes
(`if (i >= 27)`, :1930). Atascado en otro jugador y pulsando saltar, agacharse
o atacar, una rejilla de 8 × 18 unidades le saca (:1936-1966). Si no, devuelve
1 y **ese paso no se mueve**; y si devuelve 0 sin sacarle, `PM_FlyMove` empieza
en sólido y para con la velocidad a cero (:1059-1067).

**Portado** en `src/play/atasco.js`: la tabla (`PM_CreateStuckTable`,
:3406-3510, 53 empujones y un cero de relleno), la clase `Atasco` y
`probadorDe(cuerpo)`, que es `PM_TestPlayerPosition` con la cápsula del
`Player` (`intersectionWithShape`). En `_simular`, antes de `cuerpo.step`,
`_atascado` corre la regla y, atascado, **no se llama a Rapier**. Una pregunta
cuesta de 0,007 a 0,6 ms.

**Lo que es nuestro, dicho en el archivo:**

1. **Una holgura de cuatro unidades** (10 cm). El motor no la necesita: sus
   trazas se paran a `DIST_EPSILON` de un plano (ReHLDS world.cpp:727 y
   :785-788). Rapier sí mete la cápsula: andando despacio por el suelo liso de
   las pruebas los pies bajan **hasta 6,7 cm** bajo el suelo (Ana, de
   test/servidor98, a 2 cm a los 0,6 s) y el controlador sigue sin coste. Con
   la cápsula exacta eso era «atascada para siempre». Y no tapa nada de lo que
   cuelga: de 2 000 cápsulas al azar sobre Gate City, **las 17 que tardan más
   de 50 ms se ven TODAS aun con 15 cm** de holgura.
2. **Una malla no tiene interior**: Rapier sólo sabe si la cápsula corta un
   triángulo. Una cápsula entera dentro de una roca sin tocar caras sale libre
   — y ése no es el caso que cuelga.
3. Se pregunta contra lo FIJO y los OTROS JUGADORES, no contra los bichos (§4).
4. El reloj es el de la partida, no `Sys_FloatTime`.

**Control de falsos atascos**: tres jugadores andando, corriendo y saltando 60
s de juego al azar desde el nacimiento, en Gate City y en Edana, y dos que
andan uno contra el otro: **0 pasos parados**.

## 4. EL CUELGUE DE VERDAD: una araña dentro del jugador

Con los tres arreglos de arriba la sonda seguía viendo el servidor parado
**minutos** (una petición sin cabeceras en 300 s, el informe de cada diez
segundos que deja de salir), y la entrada de B que no llegaba —«el servidor no
contestó a 'lista'», lo mismo que el 98—. Se levantó el servidor con
`--inspect` y un vigilante que, al ver una pregunta sin respuesta en 8 s,
perfila tres segundos por el protocolo del inspector: **368 de 384 muestras
dentro de `computeColliderMovement`**, desde `_simular`, con `PM_CheckStuck`
diciendo «libre».

Lo que no miraba `PM_CheckStuck`: **los cilindros de los bichos**. En el motor
un monstruo no se mete en un jugador: anda con `SV_movestep`, que traza su caja
con `MOVE_NORMAL` —contra las entidades, el jugador incluido— y no avanza si
choca (ReHLDS sv_move.cpp:232 y :268-273). Aquí los cilindros los coloca el
paseo sin preguntar al jugador, y una araña que salta encima deja el suyo
**dentro de la cápsula**. Medido: con un cilindro de araña (32 × 24) metido en
la cápsula, **125 ms por llamada**; a sesenta órdenes por segundo, el servidor
no vuelve a contestar.

Atascarse en un bicho no puede ser la respuesta —un goblin pegado dejaría
paralítico a cualquiera—, así que `_bichosDentro` **aparta los cilindros que
ya están dentro** durante el paso de ese jugador (`setEnabled(false)` y de
vuelta en un `finally`): es lo que pasaría en el motor si hubiera llegado a
entrar, que el jugador sale andando. Los que sólo le tocan siguen ahí y le
paran. Con eso, la sonda: **la peor respuesta, 43-90 ms; la peor vuelta, 45-152
ms**, donde antes había tirones de 4-6 s y cuelgues de minutos.

**Y un tope de reloj de pared por mensaje**, que es nuestro: las órdenes se
corren al llegar, así que un paquete cuesta lo que cuesten sus órdenes, y con
Rapier caro eso no tiene techo. `_correrOrdenes` deja de simular pasados
`TOPE_MS_POR_MENSAJE` (200 ms) y trata el resto como el castigo de
`SV_CheckCmdTimes`: el tiempo se cuenta, el acuse sale, el cuerpo no se mueve
y la reconciliación del cliente le devuelve a su sitio. Una orden normal
cuesta menos de un milisegundo. Con 50 ms, `npm test` en paralelo dio un rojo
en `test/red99` que el archivo solo no da; no está medido que fuera el tope,
pero un tope que tirara órdenes buenas por la carga de la máquina sería un
fallo nuevo. Su prueba afirma la CUENTA (≤ 4 de 20 pasos de 80 ms) y no el
reloj: una pasada en paralelo midió 558 ms con el tope bien.

El perfil de antes del arreglo (240 s con A muriendo junto a las arañas) había
dado otra pista falsa que conviene dejar escrita: el 69 % del proceso en la
vuelta y el 92 % de ella en la fauna (`cazar` 132 s, `_alCombate` 30 s). Era
**el coste de la caza con el servidor ya hundido**, no la causa: con el
cilindro apartado la vuelta baja a decenas de milisegundos.

## 5. Una orden con `yaw: Infinity` paralizaba para siempre

`orden()` (src/red/protocolo.js) hacía `Number(yaw) || 0`, que deja pasar
`Infinity`. Medido: el seno da `NaN`, la VELOCIDAD se queda en `NaN` y, como
cada paso parte de la anterior, el jugador no se vuelve a mover aunque las
órdenes siguientes sean buenas. Ahora `seq`, `msec`, `yaw` y `cabeceo` que no
son finitos son cero. En JSON no viaja un `Infinity`; la guarda es para lo que
llegue ya abierto.

## 6. Lo que mide la sonda, y las roturas

`sondas/reaparecer99.mjs`: A (15 de vida) y B (Veteran) entran por el menú en
un servidor con `--nacer -36,-20.1,24` (las arañas) y `--reaparecer
-40,-20.3,27` —opción nueva de `tools/servidor.mjs`, hermana de `--nacer`—: un
punto **ocho unidades bajo el suelo** de la cueva, a cinco metros. Un vigilante
pregunta `/partidas` cada 250 ms desde que están dentro los dos.

| # | control |
| --- | --- |
| 1 | control positivo: en el punto de reaparición NO cabe (`costura().puntos`) |
| 2 | A muere y vuelve ≥ 3 veces (el ESTADO de la sesión del servidor, no un contador del arreglo) |
| 3a | cada vez el servidor le pone donde cabe |
| 3b | dentro del anillo más ancho de `_sitioLibre` (2,56 m) de un punto que está a 5 m de donde nació |
| 4a | el servidor contesta siempre: ninguna pregunta de más de 3 s |
| 4b | y simula ≥ 80 pasos/s de reloj de pared |
| 5a | recién vuelto, el navegador de A está donde el servidor le ha puesto |
| 5b | y anda: con la W, vivo, el servidor le mueve más de un metro |
| — | sin errores |

**Las roturas de la sonda van en el proceso del servidor, no en el árbol**
(`ROTURA99=R1..R4`): un gancho de carga de Node (`module.register`) cambia
`src/red/partida.js` al importarlo, el servidor dice «ROTURA99 puesta», y si un
reemplazo no casa una vez exacta el servidor no arranca (el 80).

| rotura | resultado |
| --- | --- |
| ninguna | **9 de 9** |
| R1 `PM_CheckStuck` apagado | una pasada: **el servidor colgado** (sin cabeceras en 300 s, el informe parado a los 20 s); otra, 9 de 9. Con `_sitioLibre` puesto nadie llega a atascarse por la reaparición, así que la sonda no lo ve siempre: lo mide la prueba de Node |
| R2 `_sitioLibre` sin mirar la pared | **6 de 9**: 3a (cabe: false), 5a y 5b — A queda hundido en el suelo, parado por `PM_CheckStuck`, y el servidor vivo |
| R3 nadie mueve el cuerpo al reaparecer | **8 de 9**: 3b, a 4,2-4,9 m del punto |
| R4 los cilindros de dentro cuentan | **8 de 9**: 5b, A no sale andando (0,28 m) con la araña dentro; esa pasada sin cuelgue |

**Las roturas de las pruebas de Node**, cada una comprobada puesta (el
reemplazo casa una vez o el script revienta) y deshecha con `cmp`:

| rotura | rojos |
| --- | --- |
| `_atascado` siempre «no» | «metido en la roca: 300 órdenes y Rapier no calcula NI UN movimiento» y Gate City |
| sin el `aparece` → `_reaparecer` | «al reaparecer sale» y «el cuerpo va al punto de reaparición» |
| `_sitioLibre` sin `_seVe` | «en un pasillo más estrecho que el jugador NO se le pasa al otro lado» |
| `_sitioLibre` sin probar la pared | «el punto metido en la pared» y Gate City |
| sin `updateSceneQueries` al entrar | «dos que entran… y el primero ANDA» |
| `_bichosDentro` no aparta | «el que está DENTRO se aparta durante el paso» |
| sin el tope por mensaje | «con pasos de 80 ms se para al pasar 200 ms» |
| `orden()` sin `finito` en el `yaw` | las dos de la orden |
| la cápsula exacta, sin holgura | test/servidor98 «aturdido… a los tres segundos, libre» |

## 7. Lo que se entendió mal

- **«`_sitioLibre` le apartó a la roca»** (el 98) era una de cuatro y no la que
  colgaba. Estaba escrita en el código de la sonda del 98 como la causa.
- **«Rapier tarda con la cápsula metida en la malla»** es verdad (§3) y aun así
  no era el cuelgue de la sonda: ése era una araña dentro del jugador (§4).
  Lo enseñó perfilar EN el cuelgue, no razonar sobre él.
- **El perfil de la fauna** (§4): un 92 % en `cazar` parece la causa y era el
  síntoma.
- **Una medida de este mismo día nació verde con la rotura puesta**: «un `yaw`
  infinito no deja el cuerpo en NaN» miraba los PIES, y los pies no se ponen en
  `NaN` (Rapier devuelve cero); lo que se queda en `NaN` es la velocidad.
- **Dos controles de la sonda leían el contador del propio arreglo**:
  `reapariciones` lo pone `_reaparecer`, así que con R3 decía «0 vueltas»
  mientras A moría siete veces, y 3a/3b salían rojos por no tener nada que
  medir. Las vueltas se cuentan ahora por el estado de la sesión.
- **5a y 5b se medían al final**, y para entonces las arañas habían matado a A
  otra vez: 5a rojo con el juego bien y 5b verde «porque murió andando». Se
  miden ahora justo después de una vuelta, vivo.
- **3b pedía «a menos de un metro»** y salió 1,29 m las tres veces con el juego
  bien: B, Veteran, entra por la reaparición (su personaje ya ha visitado el
  mapa: `JN_VISITED`) y se queda allí de pie; `ultimoSitio` lo dijo —«ocupado»
  68 veces—. El umbral es ahora el anillo más ancho.
- **Una refrescada del árbol de Rapier dentro de `_atascado`** que no se podía
  romper en rojo (la de la entrada ya la cubría) se quitó, por la regla del 78.
- **Herramientas**: un `python` en Windows reescribió `partida.js` con fin de
  línea CRLF, y la rotura R2 de la sonda dejó de casar («casa 0 veces»); el
  gancho lo dijo y no arrancó, que es para lo que está. Los archivos se
  devolvieron a LF y el gancho acepta los dos.

## 8. Pendiente

- **El servidor todavía se para a veces, y no está cazado.** Tras los cuatro
  arreglos, de doce pasadas de la sonda: una colgada de minutos (con todo
  puesto, a los 30 s, justo tras la primera vuelta de A) y una con R1; y en
  la última, una entrada de B que tardó 476 s («el servidor no contestó a
  'lista'») con un tirón de 5 s mientras A estaba muerto entre arañas y con
  24 922 cilindros apartados. El vigilante con perfilador (inspector + muestras
  de 3 s al ver 8 s sin respuesta) no lo pilló en cinco pasadas seguidas. El
  tope por mensaje (§4) llegó después de la colgada y no está probado contra
  ella en la sonda. Lo siguiente es dejar el vigilante corriendo en bucle.
- **`sonda:red95` está roja (11 de 12) y no es de esto**: Beto no llega al
  rincón porque se queda en x = 17,25 de Edana. Medido con el `Player` solo,
  sin servidor ni nada de este experimento: con `src/play/player.js` y
  `movimiento.js` del árbol (la sesión del salto, a medias) el jugador NO sube
  ese escalón; con los de HEAD sube a −2,86 y sigue. `red`, `muerte41` y
  `servidor98`, verdes.

- **El navegador no tiene `PM_CheckStuck` ni aparta bichos**: su `Player.step`
  sigue llamando a Rapier desde dentro de la roca o con una araña dentro. Con
  servidor la reconciliación le pone donde el servidor; en solitario, no.
  `src/play/atasco.js` sirve para los dos lados (`servidor: false` es la rama
  de los 54 intentos) y el sitio es `Player.pasoMsr`, que en el 99 lo estaba
  tocando la sesión del salto.
- **Que un bicho no entre en el jugador**, que es lo del motor (`SV_movestep`
  con `MOVE_NORMAL`). Aquí sólo se deja de contar cuando ya ha entrado.
- **Los dos relojes de la muerte.** El servidor reaparece a los 5 s forzados
  (su `tic` va siempre con `botonPulsado: false`); el navegador puede
  reaparecer antes con una tecla y la reconciliación le devuelve al cadáver
  hasta que el servidor reaparece.
- `PM_StuckTouch` (:1919) no se porta.
