# Experimento 95, pieza B — lo que dice un NPC con servidor: a quién le llega

```bash
node --test test/voz95.test.mjs   # 12 de 12: dos jugadores contra una Partida de verdad
npm run sonda:red95               # 12 de 12 y un PENDIENTE: dos Chrome contra tools/servidor.mjs, en Edana
```

## 1. Lo que quedaba del 94

El 94 ([RED_94.md](RED_94.md) §7) quitó `_aQuienHabla()` de `setmovedest` y
`$cansee` y dejó escrito que **`suceso` y `ventanaDeAviso`** del
`InteraccionesNpc` del servidor seguían yendo ahí: al último jugador de TODA la
partida que abrió un menú. Por esos dos ganchos sale todo lo que un guion de
NPC le dice a alguien: el `saytext`, los seis `playermessage`, el «You receive»
de `offer`, el `infomsg`. Y [GUARDIAS_94.md](GUARDIAS_94.md) §7 lo había visto
desde el otro lado: el grito del aldeano y la frase del guardia, con servidor,
le llegaban a UNO, y `saytextrange` no estaba portado.

Y dejó otro pendiente: **ninguna sonda de navegador medía** el `setmovedest` y
el `$cansee` del servidor.

## 2. Lo que hace el motor

Tres reglas, y ninguna es «el último que abrió un menú»:

| comando | a quién | cita |
| --- | --- | --- |
| `saytext` | `Speak(…, SPEECH_LOCAL)`: recorre a TODOS los jugadores de la caja de ±6000 y se lo manda a los que estén a `Length2D() <= m_SayTextRange` (con `>` para descartar: el del borde oye), hayan hablado con él o no | npcscript.cpp:708-719; msmonsterserver.cpp:1652-1730, :1712-1716 |
| `saytextrange <n\|default>` | cambia `m_SayTextRange` de ESTA entidad, que nace en `SPEECH_LOCAL_RANGE` = 300 unidades; `default` lo devuelve a 300 y lo demás es `atof` | npcscript.cpp:724-737; msmonster.h:79; msmonstershared.cpp:458 |
| `playermessage` y sus cinco colores | `RetrieveEntity(Params[0])` y, si es un jugador, a ése | scriptcmds.cpp:4244-4250 |
| `infomsg <player\|all> <título> <texto…>` | `all` es `SendHUDMsgAll`, todos los clientes; lo demás `RetrieveEntity` y, si no es un jugador, nada. El texto es TODO lo que va detrás del título, con espacios | scriptcmds.cpp:4058-4100; svglobals.cpp:346-351 |

Dos detalles que no se adivinan: el `==` de `msstring` es `strcmp`
(stackstring.cpp:54), así que `saytextrange Default` no es `default` sino
`atof("Default")` = 0, un NPC que no oye nadie; y el alcance está en
**unidades** (la trampa del 81 y del 61: las posiciones del servidor son metros).

`saytextrange` sale **207 veces en 141 guiones** del mod (`1024` en 93 líneas,
`2048` en 75; contado con `grep` fuera de comentarios). En los mapas portados:
el grito del aldeano (monsters/base_civilian.script:8-16) y la frase del
guardia (gatecity/guard.script:118), el banquero de Gate City
(gatecity/storage.script:44) y tres de Edana (el pregonero, el banquero y el
maestro).

## 3. El arreglo

- **`src/red/partida.js`**: `suceso` y `ventanaDeAviso` ya no preguntan a
  `_aQuienHabla()`. `_sucesoDeGuion` reparte por la regla que toque:
  - un `saytext` (`o.habla`) va a `_quienOyeA(instancia, rango)`: `Length2D`
    de centro a centro **pasada a unidades** contra el alcance, con el corral
    de ±6000 también en unidades, `loOye(HABLA.NPC, …)` de `chat.js` (la misma
    regla del chat del 61) y un `Number.isFinite` delante (el 79);
  - lo demás que trae instancia va al cliente del jugador de ESE guion
    (`_clienteDelGuion`, el del 93/94): el guion ya filtra que el nombre sea
    su jugador (`mensajeAlJugador`, `darOro`…);
  - lo que trae la sesión de quien habla (el eco de `hablaElJugador`) va a ésa;
  - lo que no trae nada es lo que `InteraccionesNpc` dice mientras contesta un
    menú, y ahí `hablandoCon` sí es el que pregunta.
  Sin jugador no se adivina: se cuenta en `partida.voz.sinJugador`.
  `_avisoDeGuion` hace lo mismo para `infomsg`, con `all` a todos los que están
  dentro.
- **`src/juego/interacciones.js`**: el `GuionDeNpc` recibe `suceso` y
  `ventanaDeAviso` envueltos con su `instancia` (un navegador ignora el tercer
  parámetro); `hablaElJugador` manda su eco con la `sesion` de quien habla.
- **`src/play/npcguion.js`**: `hablar` pasa `{ habla: { rango: alcanceDeVoz } }`;
  `alcanceDeVoz` (300) y `cambiarAlcanceDeVoz`, con el `strcmp` y el `atof`;
  `aviso` deja de tirar su primer parámetro: `all` → `{ todos }`, un nombre que
  no es su jugador → nada y se apunta.
- **`src/play/guion.js`**: `saytextrange` en `COMANDOS` y su `case`; `infomsg`
  junta el texto entero y no hace nada con menos de tres parámetros.
- **`/costura`** (`Partida.costura`) dice también `hablaCon` (a quién
  contestaría `_aQuienHabla()`), `voz`, y por NPC con guion su `jugador`, su
  `alcanceDeVoz`, `yaw`, `donde`, `mandado`, `frenado` y `velocidad`.

## 4. Cómo se mide

### `test/voz95.test.mjs` (Node, 12)

Una `Partida` con su `Fauna` en el suelo liso, dos clientes por
`MENSAJE.ELEGIR`/`PEDIRMENU`/`ORDENES`, el guion como TEXTO al analizador (el
67), y lo que se afirma es lo que LLEGA por el enlace de cada cliente. El
segundo caso (el 50): Ana abre el menú del pregonero y DESPUÉS Beto el de otro,
y medio segundo más tarde, desde un `callevent`, el pregonero habla. Beto se
coloca a 6 m (236 u), 15 m (591 u) o 28 m (1102 u): fuera y dentro de 300 y de
1024, y los 28 m son el control de la trampa del 81 (en metros, 28 < 1024).

Y dos con el guion horneado de Sylphiel (§5, el tercer hallazgo).

### `sondas/red95.mjs` (dos Chrome, 12 + 1 pendiente)

Sylphiel, la camarera de Edana, tiene los tres comandos en un evento que corre
**fuera de cualquier menú**: `say_job` (edana/barwench.script:126-137), que se
dispara por el chat local con `catchspeech say_job job …` (:47) y hace
`if $cansee(player,128)`, `setmovedest ent_lastseen 9999` y
`saytext I have a task for you…`.

- `--nacer 7.98,-4.4,2.37`: los dos nacen a 2,2 m de ella (87 u), a la vista.
- Beto se va **andando** por un punto de paso a un rincón que ella no ve y a
  ~535 u. El rincón salió de tirar rayos con la física del servidor
  (`trazarParaVer` de la `Fauna` de Edana) desde su ojo: de un anillo de 8 a
  22 m todos los sitios a los que se llegaba en línea recta eran visibles, y
  hubo que buscar con un punto de paso. Queda una zona oculta de ~1,5 × 2 m
  alrededor de (19.0, −3.4).
- Beto pulsa la F mirando a la nada: su propio menú. `/costura.hablaCon` = Beto.
- Ana escribe «job» por el chat local con el teclado. `/costura`: el jugador
  del guion de Sylphiel es Ana, y el servidor sigue «hablando con» Beto.
- Fase 2, el control positivo: Beto vuelve a ~200 u, Ana dice «job» otra vez
  y el segundo `say_job` (:143-150, «Didn't I ask you…») lo oyen los dos.

```
Beto en el rincón: sí (18.94, -3.23, -3.49), a 536 u de ella
ella mira a 28°; Ana está a 90°, Beto a 36°
tras «job»: Ana 1, Beto 0; destino 314,-111,93: a 0 u de Ana, 493 u de Beto
fase 2: Beto a 204 u; Ana 1, Beto 1
── 12 de 12 controles ──
PENDIENTE (no cuenta)  el giro: mira a 28° (Ana a 90°); servidor frenado «sin velocidad», velocidad 0
```

El destino del `setmovedest` se lee en `/costura` (lo que decidió el servidor,
que es lo que el 94 arregló); el **giro** se declara pendiente: ver §5.

## 5. Lo que se entendió mal por el camino

1. **La sonda se diseñó sobre un reloj que no corre.** La idea era el saludo de
   Sylphiel, `repeatdelay $randf(30,45)` + `$cansee(player,128)` +
   `saytext Hello there.` + `setmovedest ent_lastseen 9999` (:54-64), que es
   exactamente «desde un reloj» como lo escribió el 94. 120 s de sonda y ni un
   saludo. Medido en Node: **los `repeatdelay` de un NPC que no es de combate
   no se arman** (`armarRepeticionesDeBicho` sólo corre con `this.cierre`, el
   93: «Sólo los bichos de combate y sólo con reloj»). O sea que el saludo de
   Sylphiel, el «WEAPONS FOR SALE» del herrero cada 15 s, el del curandero, el
   de Bryan… no existen en este puerto, ni con servidor ni sin él. No se ha
   tocado (es de todos los NPC de los dos mapas y de `npcguion.js`): queda en
   §8. Por eso la sonda va por el chat, que sí es un camino de jugador fuera
   del menú.
2. **«Ana no lo oye», con la frase en su pantalla.** `probe.misiones.dicho()`
   es un ANILLO: lleno, no crece, y `slice(marca)` daba vacío en la consola de
   Ana, que recibe más líneas que Beto. La fase 2 salió roja con el trabajo
   bien hecho. Ahora se cuenta la frase en el anillo entero antes y después.
3. **El menú que deja al jugador en «0».** `GuionDeNpc.pedirOpciones` tenía
   `origen = "0"` por omisión y **nadie se lo pasa** (`interacciones.pedir` da
   `{personaje, ref}`). El getter de `jugador.origen` prefiere ese «0» a la
   posición viva (`?? sitioDelJugador`: un «0» no es `null`), así que, en
   cuanto el jugador abría el menú de un NPC, todo lo que en ese guion mide
   distancias contra él salía «sin sitios»: `$cansee(player,128)`,
   `$get(ent_lastspoke,range)`. Medido con el guion de Sylphiel: F, cancelar y
   «job» por el chat → `say_job` abandonado en su `$cansee`, apuntado
   `$cansee sin sitios`. En el navegador también: **la misión de la sidra no
   arrancaba para quien le hablara antes por la F.** Es el 62 —un parámetro con
   valor por omisión—. Se quitó el «0»; lo vigilan las dos pruebas de
   Sylphiel de `voz95`.
4. **Beto leía el «Ana says» de Ana a 527 unidades.** El eco de lo que dice el
   jugador (`hablaElJugador`, el 79) salía por `suceso` sin decir de quién, y
   con servidor iba a `hablandoCon`: quien escribe en el chat no abre menú,
   así que le llegaba al último que pulsó la F. Ahora va con su `sesion`. Y
   debajo hay otro: `hablaElJugador` recibe `yaDicho: true` del chat del
   navegador y del servidor y **no lo lee nadie** (§8).
5. **El destino bien y el giro no.** Con el arreglo, el `setmovedest` del
   servidor pone de destino a Ana (a 0 u) y ella **no se gira**: `pasoMandado`
   (src/play/manada.js) sale por `«sin velocidad»` ANTES de mirar si ya ha
   llegado, y Sylphiel no tiene animación de andar horneada (`andando: null`,
   velocidad 0). En el motor la rama de llegada —la que gira— no mira la
   velocidad: sólo `movetype` (msmonsterserver.cpp:1002-1003 y :1018-1029).
   `manada.js` es de otra pieza del 95 y no se ha tocado: el control se
   declara PENDIENTE y se imprime, sin contarse.
6. **Dos pasadas caídas por una recarga de Vite.** «Execution context was
   destroyed»: otros agentes editaban `src/` en el mismo árbol y Vite recargaba
   la página a media sonda. La sonda se pasó desde una copia del árbol, que es
   donde hay que poner además las roturas para no romperle el juego a nadie.
7. `infomsg all Title some words` decía «some»: el `case` cogía sólo
   `params[2]`.

## 6. Roturas deliberadas

En una copia del árbol (`../MasterSwordThreeJS_rotura95`), con un script que
falla fuerte si el patrón no casa exactamente una vez (el 80), y `grep -c` de
la marca después.

| rotura | `grep -c` | `voz95` (Node) | `sonda:red95` |
| --- | --- | --- | --- |
| A: `suceso` vuelve a `_aQuienHabla()` | 1 | **5 rojas** (2, 5, 6, 7, 8) | **9 de 12**: Ana no oye, Beto sí, y en la fase 2 Ana tampoco |
| B: la distancia sin `* U` (metros contra unidades) | 1 | **2 rojas** (15 m y la trampa de los 28 m) | — |
| C: `cambiarAlcanceDeVoz` no hace nada | 1 | **2 rojas** (15 m y `Default`) | — |
| D: `ventanaDeAviso` vuelve a `_aQuienHabla()` | 1 | **1 roja** (`infomsg`) | — |
| E: `infomsg` con `params[2]` | 1 | **1 roja** | — |
| F: `aviso` sin la guarda de «no es un jugador» | 1 | **1 roja** (`infomsg ent_me`) | — |
| G: `$cansee` vuelve a `_aQuienHabla()` (la rotura A del 94) | 1 | (la cubre `vista94a`) | **8 de 12**: no contesta, sin destino, y la fase 2 no llega a la segunda frase |
| H: `setmovedest` vuelve a `_aQuienHabla()` (la del 94) | 1 | (la cubre `vista94a`) | **11 de 12**: el destino es Beto (a 0 u de él, 472 de Ana) |
| I: el eco sin su `sesion` | 1 | **1 roja** (el chat de Ana) | — |
| J: `pedirOpciones` con `origen = "0"` | 1 | **1 roja** (Sylphiel tras abrir su menú) | — |

Lo que hay que leer de la tabla: **las roturas G y H, que son las del 94, por
fin se ponen rojas en un navegador**. El 94 las tenía sólo en Node.

Y lo que la sonda NO puede ver: B, C, D, E y F (en su camino no hay un NPC
que cambie su alcance ni un `infomsg`) y J (Ana no abre el menú de Sylphiel
antes de hablarle). Para esas está `voz95`. La I la pide la sonda (el control
negativo exige «0 ecos de Ana» en la consola de Beto), pero sólo se ha roto en
Node.

## 7. Números

- `node --test` sobre todo `test/` menos `red_27`: **2 646 pruebas, 2 644
  verdes, 0 rojas, 1 saltada y 1 «todo»**. `red_27` aparte: **49 de 49** (dos
  veces). En la pasada de `npm test` entera **se cuelga** en `red_27`, como
  dejó dicho [GUARDIAS_94.md](GUARDIAS_94.md) §6 (en la máquina hay procesos
  `red_27` colgados desde la mañana); y una vez, con la máquina cargada de
  sondas, salió rojo «y el servidor le ha movido de verdad» y verde las
  cuatro siguientes, en el árbol compartido y en la copia, con y sin este
  cambio.
- `voz95`: **12 de 12**.
- `sonda:red95`: **12 de 12** y el giro pendiente, dos pasadas.
- Las vecinas, pasadas desde la copia del árbol (§5.6) con el arreglo puesto:
  `sondas/costurared92.mjs` **16 de 16**, `sondas/efectosred93.mjs` **24 de 24**,
  `sonda:guardias94` **23 de 23**, `sonda:red` **21 de 21**. Las dos últimas
  necesitaron segunda pasada: `guardias94` agotó los 240 s de esperar a
  `probe.ready` con la máquina cargada, y `red` se cayó una vez en «el servidor
  no contestó a 'lista'» y otra dio 20 de 21 con «se le dibuja POR DETRÁS de
  la última foto» a 4 cm contra un umbral de 5 (en la buena, 35 cm). Ninguno
  de los dos toca lo que dice un guion; se dice por si vuelven.

## 8. Pendiente

- **Los `repeatdelay` de los NPC que no son de combate no corren** (§5.1): el
  saludo de Sylphiel, los pregones del herrero, del curandero y de Bryan, el
  reabastecer de las tiendas. Es de `npcguion.js` y cambia a todos los NPC de
  los dos mapas, así que es su propio experimento.
- **El giro de `setmovedest … 9999` en un NPC sin animación de andar** (§5.5):
  `pasoMandado` mira la velocidad antes que la llegada. Es de `manada.js`.
- **`$cansee(player,…)` es «el visible MÁS CERCANO de todos»** en el motor
  (`m_hEnemyList`, npcscript.cpp:1765-1846) y aquí sólo mira al jugador atado
  al guion. Con dos jugadores, Sylphiel no le contesta a Beto si es Ana quien
  le habló antes; el comentario de `ve` ya lo dice («documentado y no
  portado»).
- **Un navegador con un jugador no mira el alcance del `saytext`**: el gancho
  de `src/main.js` ignora `o.habla`, así que en la partida de uno se oye a un
  NPC desde cualquier distancia, como antes del 95.
- **`yaDicho` no lo lee nadie** (§5.4): en el navegador, lo que el jugador dice
  por el chat local sale dos veces, en el chat y en la consola de sucesos.
- **El corral del chat de jugadores** (`_decir` → `hablar`) compara los pies en
  METROS con las 6000 unidades de `CORRAL`: es un corral de 6 km. El del
  `saytext` de un NPC ya va en unidades.
- `playermessage <asa de otro jugador>` desde el guion de un NPC: el guion
  sólo reconoce a SU jugador (`esElJugador`), así que no llega a nadie; en el
  motor `RetrieveEntity` resuelve cualquier asa.
- El tope de 120 caracteres de título y texto de `infomsg` (scriptcmds.cpp:4078-4092)
  y los 140 de `playermessage` (:4259-4264) no están portados.
