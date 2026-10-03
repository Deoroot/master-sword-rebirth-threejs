# Experimento 94: las animaciones de una vez y el ritmo de los bichos

Dos huecos que dejó el 93 (doc/SALTO_93.md §5.3 y §5.5):

1. Con los `repeatdelay` de los bichos armados, **el jabalí de Edana comía
   hierba andando y la rata se estiraba andando**: `playanim once` ponía la
   animación y el cuerpo seguía a la velocidad de `walk`. Patinaban.
2. `setanim.framerate` corría en la regla (eventos, candado) y **no llegaba al
   dibujo**: la araña agarrada a ritmo 0,5 mordía a cámara normal.

## 1. Qué hace el motor, leído antes de escribir

El encargo planteaba dos hipótesis: que el motor interrumpa la animación al
moverse, o que el guion sólo la pida en reposo. **No es ninguna de las dos.**

- El guion la pide andando o parado: los dos bloques sólo miran la caza y la
  huida (`if !IS_HUNTING` / `if !IS_FLEEING`, boar_base.script:79-86;
  `if !IS_HUNTING`, giantrat.script:76-83).
- Nada la interrumpe: `playanim once` es `SetAnimation(MONSTER_ANIM_ONCE, …)`
  (npcscript.cpp:1517-1518, :1550), el manejador pasa a `CAnimOnce`, y el
  `SetAnimation(MONSTER_ANIM_WALK, m_MoveAnim)` que el `Think` pide cada 0,1 s
  con destino (msmonsterserver.cpp:589-591) lo **rechaza** su `CanChangeTo`
  hasta `m_fSequenceFinished` (monsteranimation.cpp:219-221).
- **Lo que pasa es que el bicho se para**, porque el paso no sale de una
  velocidad del bicho sino de la secuencia puesta:

      float flTotal = m_flGroundSpeed * pev->framerate * flInterval
                      * m_SpeedMultiplier * ScriptMultiplier;
                                              msmonsterserver.cpp:1201

  y `m_flGroundSpeed` lo rehace `ResetSequenceInfo` cada vez que se pone una
  secuencia (animating.cpp:112), con el `linearmovement` de ESA secuencia
  (animation.cpp:266-267). `idle2` del jabalí y `idle1` de la rata tienen
  `linearmovement` (0,0,0) (leído del `.mdl`). El destino sigue puesto: al
  acabar la hierba vuelve `walk` y sigue andando hacia el mismo sitio.

Dos cosas más, del mismo comando:

- **`once` no es `critical`.** Sólo `critical` hace `BreakAnimation` antes de
  poner (npcscript.cpp:1521-1525, :1544-1547). Aquí `InteraccionesNpc` tiraba
  el modo y `main.js`/`Partida` lo mandaban todo a `deUnaVez`, o sea que un
  `playanim once` **rompía** un mordisco a medias. Con `once`, si hay otra de
  una vez sin acabar, se rechaza.
- **Una de bucle pedida `once` dura una vuelta**: `CAnimOnce` la pone desde el
  fotograma 0 (`IsNewAnim`, monsteranimation.h:29, monsteranimation.cpp:235-236)
  y `StudioFrameAdvance` da `m_fSequenceFinished` al dar la vuelta aunque sea de
  bucle (animating.cpp:61-68). `idle2` del jabalí ES de bucle (22 fotogramas a
  15 fps): come 1,47 s y suelta.

Y el ritmo: `pev->framerate` es `m_Framerate` (× el modificador de efectos) al
final de cada `SetAnimation` (msmonsterserver.cpp:2079-2081); entra en el paso
(:1201, arriba), viaja al cliente con la entidad (`DEFINE_DELTA( framerate,
DT_SIGNED | DT_FLOAT, 8, 16.0 )`, assets/msr/delta.lst:107) y el cliente lo usa
para avanzar el fotograma (`dfdt = (m_clTime - animtime) * framerate * fps`,
studiomodelrenderer.cpp:897).

## 2. Lo portado

- `src/play/manada.js`
  - `avanzar`: con una de una vez echando el candado, la velocidad es la de
    ESA secuencia (`velocidadDe`, nueva, la de `velocidadDeSecuencia` con la
    secuencia en la mano); y todo paso va × `fisica.ritmoAnim`. Si no avanza,
    `frenado` dice `la animacion <x> no avanza`. Ritmo negativo: no anda (el
    motor andaría hacia atrás; ningún guion de los cinco mapas lo pide).
  - `unaVez(i, nombre)`: `deUnaVez` detrás de la guarda del candado, con su
    rechazo contado en `sigue.rechazos`.
  - `playanim(i, nombre, modo)`: `once` → `unaVez`; lo demás → `deUnaVez`.
  - `pasoDePaseo`: ver §3, el segundo fallo.
  - `estadoDe` manda `r` (el ritmo) cuando no es 1; `aplicar` lo escribe en
    `fisica.ritmoAnim`, y sin `r` vuelve a 1.
- `src/juego/interacciones.js`: `animar` pasa el modo (una línea).
- `src/main.js` (una línea) y `src/red/partida.js` (una línea): enchufan
  `bichos.playanim` / `manada.playanim` con el modo, en vez de `deUnaVez`.
  `igualBicho` compara también `r` (si no, un cambio de ritmo solo no viajaría
  en una foto parcial).
- `src/render/bichos.js`: `refrescar` pone `mezclador.timeScale` al ritmo;
  `playanim` nuevo, como `deUnaVez`.
- `src/dev/sonda.js`: `probe.costura.de` da `gen`, `candado` y `conDestino`;
  `probe.costura.relojDeDibujo(id, ms)` mide cuánto avanza el reloj de la
  acción del mezclador, fotograma a fotograma, del bicho y de uno de referencia
  a ritmo 1.
- `test/salto93a` y `test/mordisco92a`: sus arneses copian el `animar` de
  `main.js`; ahora copian `playanim` con el modo (la lectura vieja, citada al
  lado).

No cambia el horneado: no hay que rehornear nada.

## 3. Lo que se entendió mal por el camino

- **El segundo fallo estaba debajo del primero.** Midiendo al jabalí con una
  `Partida` (script de exploración en el scratchpad) salió, además de la
  hierba andando, **`walk` puesta y cero de avance durante 2 s** tras soltar el
  destino: el jabalí andaba en el sitio. Al vencer una de una vez con destino,
  `relojes` pone la de andar y deja `andando = null` para que la caza vuelva a
  elegir ritmo; `pasoDePaseo`, al soltar el destino, sólo pedía la de reposo
  si `andando !== null`. Ahora mira también si la puesta es la de andar. Es el
  `Think` del motor, que sin destino pide la de reposo en cada vuelta
  (msmonsterserver.cpp:589-594). Nació con el candado del 80 y lo destapó la
  hierba del 93.
- **El primer control de «comiendo no avanza» dio 1,97 u en 10 hierbas**, con
  la regla bien: contaba el paso en que se pone la hierba, que en este puerto
  lo da todavía la de andar (la manada mueve antes de que el reloj de guiones
  la pida). Ahora sólo cuenta los pasos que empiezan Y acaban comiendo, y pide
  cero exacto.
- **La rotura R7 la puse mal la primera vez**: un `// ROTURA94` en mitad de la
  línea se comió el resto (`ponDeAndarOParar…`) y el archivo no se cargaba. La
  prueba salió «0 pass, 1 fail» —un rojo de archivo, no del control—. Se
  repitió con `/* */` y salió rojo el control que tocaba. El 80 otra vez: *si
  rompes a propósito, comprueba que la rotura es la que crees*.
- **La primera pasada entera de `npm test` la leí truncada** (`| tail -40`
  cortó el resumen). La segunda, a archivo: 2 580 de 2 582 con una roja en
  `test/salto93g` («mordiscos del veneno en Ana: 3») — ese archivo lo estaba
  editando otra sesión en ese momento (modificado a las 10:10, con una
  corrección del 94 dentro); aislado, 3/3 tres veces.
- **La sonda nueva dio 7 de 10 dos pasadas seguidas** con el trabajo bien
  hecho: la araña medida no saltaba en 150 s. Instrumentado (sonda temporal,
  borrada): cazaba, mordía y su bloque del salto daba vueltas —18 sin
  saltar—. Lo que fallaba era la sonda: recolocaba al jugador cada 250 ms a
  10 cm del suelo, o sea EN EL AIRE media vuelta de cada dos, y el salto pide
  `$get(HUNT_LASTTARGET,onground)` (spider.script:104). Ahora sólo recoloca si
  se ha ido a más de 1,5 m, y vale cualquiera de las grandes que se agarre.
  `sondas/salto93.mjs` tiene el mismo patrón (ver §6).
- **El control del dibujo comparaba con el reloj de pared**, y con la máquina
  cargada los dos relojes de dibujo iban por detrás: 0,868 s por segundo el
  goblin y 0,434 la araña — verde por 0,066 de margen. Ahora se compara la
  araña con la referencia de la MISMA ventana (cociente 0,500), y R9 sigue
  roja (cociente 1,000).

## 4. Cómo se comprueba

`test/animacion94a.test.mjs` — 8 pruebas, entra por una `Partida` de verdad
(`Fauna` sobre el suelo liso, el bicho con las secuencias de su `.mdl`, un
cliente con `MENSAJE.ELEGIR` y órdenes): el `animar` que se prueba es el que
monta `Partida`.

- El jabalí (`monsters/boar`, guion del mod), 90 s: 10 hierbas, 1 000 y pico
  pasos comiendo con destino → **0 unidades**; andando, ~0,28 u por paso
  (control positivo). Y nunca `walk` sin destino más de 0,2 s.
- `once` contra `critical` con la rata y un guion escrito aquí y partido por el
  analizador: con `critical` la segunda se pone (control: el instrumento ve el
  cambio); con `once` sigue `attack` y se cuenta el rechazo; sin nada
  corriendo, `once` sí se pone.
- Ritmo: a 0,5 la rata anda 0,5 de lo que anda a 1 por paso; la foto lleva
  `r: 0.5` y otra `Manada` que sólo coloca lo aplica; sin `r`, 1; a ritmo 1 la
  foto no lo lleva.

`sondas/animacion94.mjs` — por el menú, **10 de 10** (cinco pasadas; dos de
7/10 antes del arreglo del instrumento de §3):

- Edana: 4 jabalíes, 90 s muestreados en la página: 60-65 hierbas, 245-263
  muestras comiendo con destino, **0 unidades**; ~1 650 andando, ~11 000 u.
- Gate City: la araña agarrada a ritmo 0,5 (`hitbite`): su clip avanza la
  mitad que el de un goblin andando en la misma ventana (**cociente 0,500**;
  0,523 contra 1,045 s por segundo).

**Roturas deliberadas** (reemplazo que falla si no casa exactamente una vez;
`grep -c ROTURA94` = 1 puesta y = 0 quitada en cada una):

| rotura | animacion94a | sonda |
| --- | --- | --- |
| R1 `avanzar` sin la velocidad de la secuencia puesta | roja «el jabalí… no avanza» | roja: 1 617 u comiendo |
| R2 `avanzar` sin el ritmo | roja «a ritmo 0,5… la MITAD» | — |
| R3 `interacciones.js` tira el modo | roja «con `once` se RECHAZA» | — |
| R4 `Partida` enchufa `deUnaVez` | roja «con `once` se RECHAZA» | — |
| R5 `estadoDe` sin `r` | roja «la foto lleva `r`» | — |
| R6 `aplicar` no escribe `r` | roja «la foto lleva `r`» | — |
| R7 `pasoDePaseo` sin mirar la puesta | roja: 8 veces, la peor 2,00 s | — |
| R8 `unaVez` sin la guarda | roja «con `once` se RECHAZA» | — |
| R9 `refrescar` sin `timeScale` | — | roja: araña 1,012 (y con el control nuevo, cociente 1,000) |

En R1 y R9 (a la vez, una por parte de la sonda) los controles positivos de
la sonda siguieron verdes: lo que muerde es el control de cada regla.

## 5. Lo que queda abierto

1. **La costura de `src/main.js` con el modo no la mide nada.** La de
   `Partida` sí (R4); en la sonda de un jugador, romper `bichos.playanim` →
   `deUnaVez` no cambia la hierba (la regla del paso vive en la manada). No se
   ha encontrado en los mapas un `playanim once` natural que caiga encima de
   otra de una vez y se pueda provocar desde la sonda. Pendiente, no verde.
2. `m_SpeedMultiplier` (`movespeed`, npcscript.cpp:514-521) y `pev->maxspeed`
   de los efectos (`game.effect.movespeed`, msmonsterserver.cpp:2819-2845) no
   entran en el paso. `fisica.ritmoAndar` se guarda y sólo sirve para devolver
   el cuerpo a la IA. La araña pone `movespeed -1` al caer
   (spider.script:170), que en el motor sería andar hacia atrás si tuviera
   destino; no se ha mirado.
3. `m_Framerate_Modifier` (`game.effect.anim.framerate`, msmonsterserver.cpp:
   2824-2841): los efectos que ralentizan la animación no están.
4. **La velocidad y la duración usan `fotogramas / fps`; el motor, `(numframes
   - 1) / fps`** (animation.cpp:265-267). Un 1,7 % en el `walk` de 60
   fotogramas del jabalí. No se ha tocado: cambia todos los bichos y todos los
   candados, y merece su propio experimento con su medida.
5. `playanim move` y `playanim hold` siguen yendo por `deUnaVez`. `move` dura
   en el motor hasta el siguiente `Think`; `hold` es `CAnimHold`, que no suelta
   a la de andar (monsteranimation.cpp:183-189).
6. El ritmo viaja con tres decimales; el motor lo manda en dieciseisavos
   (delta.lst:107): 0,8 llegaría al cliente como 0,75 o 0,8125.
7. Con ritmo 0 (el mordisco antes del primer segundo, doc/SALTO_93.md §3) la
   araña ya no anda tampoco: es lo que haría el motor, y ya se quedaba
   congelada en el fotograma 12.

## 6. Las sondas vecinas, y lo que no es de aquí

Con el árbol compartido por otras cuatro sesiones a la vez (ciclo de pensar,
red, experiencia, el velo de la muerte), varios rojos salieron y se fueron
solos. Para separar los míos se hizo una copia del árbol con las cinco piezas
del 94 desactivadas (marca `BASE94`, ya borrada) y se pasó `salto93` en las
dos:

| pasada | araña (s hasta agarrarse) | cría muerde | controles |
| --- | ---: | --- | --- |
| con el 94 (1) | 34,3 | **no** (`{}`) | 14/15 |
| con el 94 (2) | 39,5 | **no** (`{}`) | 13/15 |
| con el 94 (3) | 21,3 | sí (39) | 15/15 |
| con el 94 (4) | 150 sin saltar | sí (7) | 8/15 |
| sin el 94 (1) | 6,8 | sí (43) | 14/15 |
| sin el 94 (2) | 8,3 | sí (34) | 15/15 |
| sin el 94 (3) | 24,5 | sí (36) | 14/15 |

- El 8/15 es la araña medida sin saltar en 150 s: el instrumento de §3 (el
  jugador recolocado en el aire). **Otra** araña sí saltó y lo envenenó.
- Los 14/15 de «sin el 94» son «SE TE PEGA… a 1,34 m» y «TE ENVENENA» con el
  veneno en la consola pero sin la línea «You have been poisoned!» entre las
  que lee la sonda.
- **La cría que no muerde (`recibidos {}`) salió en las dos primeras pasadas
  con el 94 y en ninguna más.** Medida aparte tres veces con el 94 (recién
  entrado, la índice 3, la índice 0 y la 0 tras 40 s de espera) muerde las
  tres. No está diagnosticado. Las dos pasadas en que salió fueron con el árbol
  a medio editar por otras sesiones (10:30-10:50); queda como intermitente sin
  causa, no como verde.

`mordisco92`: 24/25 la primera vez — «su mordisco NO envenena» rojo con
«saltos que se pegaron 0» y veneno en la consola. El control contaba los saltos
de la araña medida y Gate City tiene tres: **se arregló el instrumento**
(`sondas/mordisco92.mjs` suma las de todas y dice cuál), y la pasada siguiente
dio 25/25 —con la medida agarrándose ella misma (`[1,0]`), así que esta pasada
no confirma la hipótesis de «fue otra»—.

`consecuencias` 53/53. `mundo`: la primera pasada se cayó en
`probe.golpe.hoja()` (sin personaje) y la segunda al entrar (otro proceso en su
puerto y `window.probe` sin montar); la tercera, **44/44**. Ninguna de las dos
caídas pasa por nada del 94.

`npm test` (última pasada entera): **2 588, 2 587 verdes, 0 rojas, 1 «todo»**.
