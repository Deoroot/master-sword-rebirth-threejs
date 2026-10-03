# El guion del jugador, por tres agentes a la vez — experimento 90

El usuario notó que «faltan scripts del jugador» y preguntó qué tocar primero.
Medido con `npm run jugador`: los 27 archivos de `player/player.script` **sí**
corren, sobre el mismo intérprete que los NPC (el 64); lo que faltaba eran los
**comandos** que usan dentro. Corrían enteros **259 de 541 eventos** y faltaban
82 comandos distintos.

Se repartió en tres agentes, cada uno con sus archivos, sobre el árbol
compartido (no en worktrees: tenía sin commit el 88 y el 89 de otra sesión, y
un worktree desde HEAD los habría perdido). Nombres de las piezas: 89b, 89c y
efectos90 — los puso cada agente; el experimento es uno.

| | antes | después |
| --- | --- | --- |
| eventos del jugador que corren enteros | 259 / 541 | **314 / 541 (58 %)** |
| archivos que caben enteros | 9 / 25 | 10 / 25 |
| comandos distintos que faltan | 82 | 60 |
| insignia «script commands» | 73 / 325 | ver `npm run insignias` (rehornear antes) |
| `npm test` | 2 216 | **2 319 verdes, 0 rojos, 1 saltada** |

**«Corre entero» no es «hace algo».** Es la advertencia del 62 y la repitieron
los tres agentes: muchos de esos eventos no los dispara nada en este port.

## 1. Lo medido ANTES del reparto, que cambió el plan

- `setstat` salía como el cuarto comando más usado (×54) y **53 de esos usos
  son de `developer/player/externals`**, un guion de desarrollo. En el jugador
  de verdad hay uno: `setstat parry TOTAL_PARRY`. Se sacó de las prioridades.
- `svplaysound` es la MISMA función que `playsound` (scriptcmds.cpp:150).
- `applyeffect` se usa 725 veces en el juego: es como se aplican venenos,
  fuegos y curas, y cada efecto es un guion que corre sobre el objetivo.

## 2. Comandos pequeños (89b) — `test/comandos89b.test.mjs`, 41 pruebas

`svplaysound`, `svplayrandomsound`, `sound.play3d`/`svsound.play3d`,
`vectoradd`, `vectorset`, `vectormultiply`, `strconc`, `token.add`,
`token.del`, `token.set`, `token.scramble`. Cada uno con su cita y sus rarezas
del motor (un `vectormultiply` por «-2» lee un vector y da cero, porque decide
con `isdigit`). **23 roturas deliberadas sobre una copia, 23 rojas.**

Abierto:
- `sonarEn` (el gancho de `sound.play3d`) no está cableado: el comando corre y
  no suena.
- **El `playsound` sin volumen no suena en Xash3D**: las dos emisiones están
  dentro de `if (Volume > -1)` (scriptcmds.cpp:4754-4797). El comentario del
  `case` dice lo contrario y el port lo hace sonar. No se cambió: altera lo que
  se oye, hay que medirlo con variables resueltas y, mejor, oírlo en Xash.

## 3. `applyeffect`, `removeeffect`, `removescript` — `src/play/efectos.js`

Portados la creación sobre el anfitrión (scriptedeffects.cpp:25-58), la pila
con `nostack`, el borrado diferido (script.cpp:5906-5922) y que **el efecto oye
los eventos de su anfitrión** (script.cpp:5932-5937). Horneado nuevo:
`npm run efectos:guion` → `build/msr/efectosguion.json` (129 efectos).

**Se mide jugando**: el sumo sacerdote de Edana cura —«High Priest heals you
for 1000 hp»—, `sondas/efectos90.mjs`, 11 de 11 con control negativo.

Lo que se entendió mal: el plan era un veneno de punta a punta, y **ningún
veneno puede llegar al jugador en este port**, porque los bichos no corren
guion. Además los `effects/dot_*` piden `$get_takedmg`, `$math`,
`scriptflags`… y sin ellos dirían «You resist the poison.», una frase falsa.
Queda como prueba PENDIENTE, no verde.

Hallazgos fuera del encargo, sin arreglar:
- **el cargador guarda crudo el valor de un `const` de cabecera** y el motor lo
  resuelve al cargar (script.cpp:40-41, :5409). Se arregló sólo para efectos;
  quedan 1 caso en el jugador, 9 en Gate City y 1 en Edana;
- `npcguion.js` dice que `$get(<jugador>,maxhp)` da «0»; leyendo
  `CBasePlayer : CMSMonster` (player.h:396) no debería. Sin medir en partida.

## 4. Estado del jugador (89c) — `test/jugador89c.test.mjs`, 29 pruebas

`drainstamina`, `gold`, `addgold`, `removeitem`, `setvelocity`, `addvelocity`,
`setorigin`, `setstat`, `noxploss` (este último no existe en el motor: lo tira
el cargador).

**Sólo `drainstamina` tiene efecto jugando**: `activate_stuff`, un segundo
después de entrar, llena el aguante (player_main.script:1043, :147).
`sondas/aguante89c.mjs` 7 de 7, con control negativo contra la regeneración.
Los demás están portados y **sus eventos no se disparan**; se declaran en
`SIN_QUIEN_LOS_LLAME` (`guionjugador.js`) y hay una prueba que se pone roja si
alguien los conecta sin quitarlos de ahí.

Hallazgos, sin arreglar:
- **`game_equipped` no lo dispara nadie** y `EVENTOS_DEL_JUGADOR.EMPUNA` decía
  que sí: sólo lo llamaba una prueba a mano (el 59). Así que el «Your Parry
  value is now 2» con el que empieza el 64 **no sale nunca jugando**. Corregido
  el comentario al lado.
- `game_player_got_from_store`: la tienda lo devuelve y nadie lo manda (el 62).
- **`trigger_push` sería ~39 veces más flojo**: `aplicarDisparos`, caso
  `"empujar"` (main.js), divide por `unitsPerMetre` una velocidad que ya va en
  u/s. Sin medir.
- `offer <jugador> gold` imprime «You receive N gold» y el motor no imprime
  nada (`GiveGold` no es virtual, msmonster.h:423): posible frase inventada, el 65.

## 5. Lo que queda, en orden

1. **Que los bichos corran guion.** Es la pieza de fondo: sin ella no hay
   venenos, ni hechizos de monstruo, ni mazmorra de nivel alto.
2. `game_equipped` y `game_player_got_from_store`, que ya tienen el guion listo.
3. El `const` de cabecera en el cargador (su propio experimento).
4. Las piernas (`player_animation`), el equipo puesto, y `cleffect`.
