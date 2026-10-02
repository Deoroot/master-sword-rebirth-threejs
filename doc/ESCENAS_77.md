# Edrin anda — experimento 77

`npm run sonda:edana77` · **43 de 43** · `npm test` **1842 de 1842**

Pisas el arriate de flores de Edana y el capitán de la guardia **cruza la plaza
corriendo**, se planta delante, te suelta «Hey! Stay out of there!» y cuatro
segundos después **se vuelve andando a su sitio** y se queda mirando al 270 que
dice el mapa.

Eso es `ms_npcscript`, el `scripted_sequence` de Master Sword. Tiene cinco tipos
y el 67 portó uno; los otros cuatro salían contados como «usar» con la razón
escrita al lado —mover a un NPC pide hablarle al rebaño y a la física, que no
viven en el bus—. La razón seguía siendo buena. Lo que faltaba era a quién
pasarle el recado.

---

## 1. La cuenta, que es lo que decidió qué portar

Contado leyendo los 81 `.bsp` del juego, no copiado de ningún sitio
(`test/escena77.test.mjs`, «el censo de los cinco tipos»):

| tipo | qué hace | cuántos |
| --- | --- | --- |
| **0** `SCRIPT_MOVE` | anda hasta aquí | **98** |
| 1 `SCRIPT_PLAYANIM` | pone una animación | 15 |
| 2 `SCRIPT_RUNEVENT` | lanza un evento de su guion | 47 |
| 3 `MOVE_PLAYANIM` | las dos | 10 |
| 4 `MOVE_RUNEVENT` | las dos | 2 |

**172 en 30 mapas**, y el que no estaba portado es el que más hay de todos: el
tipo 0, 98 de los 172. **110 de los 172 mueven** al NPC.

Edana trae `{0: 2, 2: 15, 4: 1}`. **Gate City no trae ninguno** — octava vez
seguida que el hueco lo enseña el segundo mapa.

## 2. La cadena de Edrin

```
el jugador pisa un trigger_multiple (*109, wait 15)
     │
     ▼
ms_npcscript  edrinstrict1   type 4   moveanim run   angles 0 260 0
     │        target edrin   eventname trig_flowercompliant
     │        firewhendone edrinspot   firedelay 4
     │
     ├──► Edrin CORRE hasta el punto de la entidad
     ├──► al llegar: game_stopmoving y LUEGO game_reached_dest
     ├──► gira a 260°
     ├──► trig_flowercompliant ──► «Hey! Stay out of there!»
     │
     └──► 4 s después dispara  edrinspot
               │
               ▼
          ms_npcscript  edrinspot  type 0  moveanim walk  angles 0 270 0
               └──► vuelve ANDANDO y se queda mirando a 270°
```

Dos escenas encadenadas por el `firewhendone` de la primera, con dos
animaciones distintas —`run` a la ida y `walk` a la vuelta— porque son dos
entidades distintas y cada una trae la suya.

## 3. Lo que no era como parecía

### «Edrin ha llegado a `edrinspot`» es cierto ANTES de empezar

Su sitio de nacer y el punto del `ms_npcscript` están a **32 unidades**, y su
proximidad es `m_Width * 1.1` = **35,2** (`msmonster.h:355`). O sea que
`edrinspot` disparado con Edrin en casa **no le hace andar un solo paso**: se da
por llegado en el acto, le gira la cara y acaba.

Un control que midiera «ha llegado a `edrinspot`» habría estado leyendo el valor
de reposo. Por eso lo que se mide en la sonda es **el viaje a las flores** —125
unidades— y la vuelta, con la posición de antes guardada. Y hay un control que
afirma el valor de reposo en voz alta, para que no se le pueda olvidar a nadie.

### Hay DOS mecanismos que mandan a Edrin a casa, y el mod lo dice

```
//As of JUN2007b, Edrin picked up a bug where he refuses to walk home
//after his flowers are trampled. This forces him to do so, but it worries
//me that this has happened                       edana/edrin.script:163-165
```

El mapa lo manda con `edrinspot`, y el guion de Edrin lo manda otra vez por su
cuenta: `trig_flowercompliant` → `flowers_2` → `go_home` → `setmovedest HOME_LOC
5`. **A sitios distintos**: `HOME_LOC` es donde nació y `edrinspot` está 32
unidades más allá, y las proximidades son 5 y 35,2.

«Edrin ha vuelto a casa» no dice cuál de los dos lo mandó — el caso de
CLAUDE.md §4 «cuando dos cosas mueven el mismo número, *se movió* no dice cuál».
Aquí se resuelve sin trampa porque **el segundo está muerto** (apartado 5), así
que el único que puede mover a Edrin es el mapa. **El día que `setmovedest`
llegue a algo, este control deja de distinguir** y habrá que separarlos por el
destino. Queda escrito para entonces.

### El tipo 2 se despacha dos veces y la segunda no se alcanza

`Act` tiene `if (m_iType == SCRIPT_RUNEVENT) { RunScriptEvent(); return; }`
(`npcact.cpp:138-144`) y, veinticinco líneas más abajo, un `else if` con lo
mismo (`:174-177`) al que no llega nadie. No es cosmético: el `return` de la
primera **se salta el `m_MonsterState = MONSTERSTATE_SCRIPT`** del final
(`:181`). Lanzar un evento no congela al NPC y poner una animación sí. El
comentario de Thothie está al lado: «attempting to fix buggy ms_npcscript
behavior».

### Con `firedelay`, el NPC sigue congelado mientras se espera

Esto salió de un control mío que se puso rojo con el trabajo bien hecho. Quien
suelta al NPC es `FireTarget` (`m_MonsterState = MONSTERSTATE_NONE`, `:309`), y
con un `firedelay` **`FireTarget` no corre hasta que el retraso vence**
(`:295-299`). Durante esos cuatro segundos Edrin sigue en `MONSTERSTATE_SCRIPT`,
y eso tiene consecuencia: en esa ventana la guarda de `Act` (`:128`) rechaza
cualquier otra escena sobre él. El control estaba mal; el código, bien.

## 4. Tres fallos del mod, portados con el fallo puesto

1. **`Finish(bool)` se come su argumento.**
   `void Finish(bool fEarlyBreak) { m_EarlyBreak = true; Finish(); }`
   (`npcact.cpp:32-36`). El parámetro no se lee. Da igual porque los dos sitios
   que lo llaman pasan `true`, y así se porta.

2. **`m_EarlyBreak` no se vuelve a poner a `false` en ningún sitio.** Ni en
   `Spawn`, ni en `Act`, ni en `FireTarget`. Una escena que se corta UNA vez
   queda marcada para el resto de la partida: a partir de ahí dispara su
   `fireonbreak` aunque acabe bien, **y pierde su `firedelay`**, porque el `if`
   que lo respeta es `if (m_flFireDelay && !m_EarlyBreak)` (`:295`).

3. **`setmovedest none` hace que una escena del mapa se crea que el NPC ha
   llegado.** `if (Params[0] == "none") { StopWalking(); ClearConditions(
   MONSTER_HASMOVEDEST); }` (`npcscript.cpp:1608-1612`) **no toca
   `m_MoveDest`**: apaga la condición y deja el valor escrito. Así que la
   comparación de `MoveThink` (`:229`) sigue dando iguales y el `if` de `:238`
   se cumple: el `ms_npcscript` pone la animación de reposo, gira la cara y
   **sigue a su rama de acabar**, con el NPC donde estuviera.

   De este tercero depende que el `dest_t` guardado y la condición sean dos
   cosas separadas en el puerto (`ultimoDestino` y `mandado` en
   `src/play/manada.js`). Confundirlas es la rotura 9 de abajo, y es la que más
   daño hace.

## 5. Lo que NO se porta, con la cuenta

| qué | cuánto | por qué |
| --- | --- | --- |
| `setmovedest` / `setmoveanim` de los guiones | el gancho `irA` es un `=> {}` **desde el 43** | es el `=> {}` de relleno del apartado 4 de CLAUDE.md: el comando está analizado, citado y con cuatro pruebas verdes que **le construyen el gancho a mano**. Ningún NPC de este puerto se ha movido nunca por su guion |
| `$dist`, `game.monster.origin`, `setangle face` | `distancia: () => 0` en los dos entornos | sin ellos `check_home_loop` cree que ya está en casa en la primera vuelta |
| tipos 1 y 3 (animación) | 15 y 10 en el juego, **0 en los dos mapas portados** | la rama está escrita y las pruebas de Node la recorren; **ninguna sonda la ve**, así que su control se declara pendiente en vez de contarse (la variante del 50) |

── CORRECCIÓN DEL 78 ──

Ya no está pendiente: el 78 añadió **`gertenheld_forest2`** como tercer mapa
portado —el único del juego donde los dos tipos cuelgan de un `trigger_once`
sin nombre, o sea del pie del jugador— y los mide en `sondas/gertenheld78.mjs`,
49 de 49. Ver [ESCENAS_78.md](ESCENAS_78.md).

Y el 78 encontró que **ninguna animación de escena del juego se había horneado
nunca**: la lista blanca de `tools/bichos.mjs` sale de la ficha del NPC y el
`actionanim` de un `ms_npcscript` está en el `.bsp`. Esto no se vio aquí por
casualidad: las dos escenas de Edrin piden `walk` y `run`, que su ficha ya
nombraba.

Lo que sí sigue pendiente es **un tipo 3 que ande de verdad**: el de
`gertenheld_forest2` nace a 2 unidades de su punto.
| `m_fSequenceFinished` | — | el mezclador es de quien dibuja. La manada usa la duración de la secuencia (`fotogramas/fps`) como sustituto, y coincide mientras se reproduzca a 1× |
| el reajuste al hueso 0 de `AnimateThink` | `npcact.cpp:277-287` | las posiciones de hueso no se leen. Se cuenta en `escena: sin recolocar al hueso` |
| el grafo de nodos | `msmonsterserver.cpp:1081` | aquí se anda recto y, si se choca, se para |
| la rama de `IsFlying()` en «¿ya llegó?» | — | escrita y probada en Node; **ningún NPC de Edana vuela**, así que en el juego no la recorre nadie |

Y el tipo 0 que apunta al sacerdote **no tiene `targetname`**, así que en el
juego tampoco lo dispara nadie — y además trae un `eventname` que su tipo ni
mira. Es del mapa, no nuestro, y la sonda comprueba que aquí tampoco lo dispara
nadie.

## 6. Los cinco fallos de instrumento

| lo que el control decía | lo que de verdad pasaba |
| --- | --- |
| tres controles rojos con el trabajo bien hecho | el bucle de la prueba paraba **en cuanto la manada llegaba**, y ése es el instante en que ha llegado el CUERPO: la escena no se entera hasta su siguiente `MoveThink`, 0,1 s después (`npcact.cpp:236`). O sea que el bucle terminaba justo antes de lo que venía a medir — ni el giro final ni el evento del tipo 4. Es el primo del 75 con las décimas |
| «a los 3,9 s todavía no ha disparado», rojo | contaba desde que **la prueba** dejó de andar, y la escena había acabado hasta 0,3 s antes. El umbral medía mi espera. Lo que no depende de ella son dos cosas: el retraso apuntado (4 s) y la hora exacta a la que la escena va a disparar, y ésas se le preguntan a la escena |
| «vuelve más de 100 unidades», rojo con 81 | el umbral salía de la distancia entre los dos puntos del mapa, y **los dos viajes paran en el BORDE de su círculo de proximidad**: lo andado es siempre menos que la distancia entre los puntos. Medía mi aritmética. Ahora el umbral es «más que una proximidad entera», que es lo que distingue andar de no andar |
| «ya no está en escena» al llegar, rojo | **el control estaba mal y el código bien**: con `firedelay`, `FireTarget` no corre hasta cuatro segundos después. Ver el apartado 3 |
| `Vagabundo.aplazar` roto a propósito y **las 26 pruebas siguieron verdes** | no es que el control fuera flojo: en este puerto **el efecto no existe**. El motor tiene una casilla de destino y aplaza los relojes del paseo para que no se la quite; aquí las casillas son dos y quien las ordena es el reparto de `Manada.pasear`, que con un destino mandado ni toca al vagabundo. La línea se conserva por fidelidad y **no se apunta un verde por ella**; lo que la prueba de al lado mide de verdad es el reparto, y eso sí se pone rojo al romperlo |

El último es el más útil de los cinco y es el que casi no se escribe: una rotura
que deja todo verde no siempre significa que el control sea malo. A veces
significa que **la línea no hace nada en esta arquitectura**, y entonces lo que
hay que arreglar no es el control: es dejarlo dicho.

## 7. Las nueve roturas deliberadas

| lo que se rompió | qué se puso rojo |
| --- | --- |
| `mueve()` se olvida del tipo 4 | 7 de las 26 pruebas |
| `mismoDestino` ignora la proximidad (`msmonster.h:21`) | 1 prueba |
| `m_EarlyBreak` se limpia (el fallo del mod, «arreglado») | 1 prueba |
| `haLlegado` tira la Z en vez de la altura (la trampa de ejes) | 6 pruebas |
| el paseo NO le cede la casilla a la escena | 5 pruebas |
| al llegar no se copia el `angles` de la entidad (`:249`) | 2 controles de la sonda: 230,2° y 60,4° en vez de 260 y 270 |
| `mandarA` ignora el `moveanim` del mapa (`:164-165`) | 1 control: `walk` en vez de `run` |
| `Finish` ignora el `firedelay` (`:295-299`) | 5 controles |
| `destinoActual` devuelve la condición en vez del `dest_t` guardado | **15 controles**: la escena se corta sola al llegar, no lanza el evento, no hay «Hey! Stay out of there!», no hay vuelta |
| *(y la décima, que no cuenta)* `Vagabundo.aplazar` sin hacer nada | **nada**, y está explicado arriba |

## 8. Qué viene después

1. **`setmovedest` de verdad**: levantar el gancho `irA`, que arrastra `$dist`,
   `game.monster.origin`, `$vec.yaw` y `setangle face`. Con eso el `go_home` de
   Edrin revive y **hay que volver a mirar el control de la vuelta**, porque
   dejará de distinguir quién lo mandó.
2. **Una misión de Edana de punta a punta con sonda.**
3. **El botín de un cadáver**, la tercera vía al suelo, con `ITEM_NOPICKUP`.
4. El **modo aditivo** del haz de luz de la cloaca, que dejó el 70 y el 76 dejó
   barato.
5. Lo contado del 75: resbalar (`SV_FlyMove`), el `game_drop` de los otros
   quince guiones y soltar de dentro del zurrón.
