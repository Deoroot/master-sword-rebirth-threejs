# Experimento 94: cada bicho piensa con el reloj de su base

> Pendiente que dejó el 93 (doc/CONSECUENCIAS_92.md §93, test/crias93f): «la IA
> vieja piensa cada 2,8 s sin objetivo y aquí 2,0».

## 1. Lo que dice el mod

Master Sword tiene **dos IA de monstruo** y cada una escribe sus relojes:

| base | ocioso | combate | contra un NPC | bucle |
| --- | --- | --- | --- | --- |
| vieja, `monsters/base_npc_attack.script` | `setvard CYCLE_TIME_IDLE 2.8` (:7) | `setvard CYCLE_TIME_BATTLE 0.1` (:10) | se queda en el ocioso; `hguard` pasa a 0,1 (:543) | `{ hunting_mode_go  repeatdelay CYCLE_TIME` (:62-63) |
| nueva, `monsters/base_npc_attack_new.script` | `const CYCLE_TIME_IDLE 2.0` (:95) | `const CYCLE_TIME_BATTLE 0.1` (:94) | `cycle_npc` → `CYCLE_TIME_NPC 0.8` (:96, :1373-1377) | `callevent CYCLE_TIME npcatk_hunt` (:232) |

Quién hereda cuál: `monsters/base_monster.script:8` incluye la vieja y
`monsters/base_monster_new.script:1` la nueva. Ocho guiones más incluyen la vieja a
mano (`NPCs/guard`, `deralia/thief`…) y nadie salvo `base_monster_new` incluye
la nueva.

**Los dos bucles se reprograman igual.** El de la nueva es un `callevent` con
retraso en su primera línea. El de la vieja es un `repeatdelay`, y ahí había
que leer el motor: al cargar, `repeatdelay CYCLE_TIME` se resuelve con
`SCRIPTCONST` (script.cpp:5377-5383), que en tiempo de carga no conoce un
`setvard` y da 0, así que el evento corre en el primer fotograma; pero lleva
`KeepCmd = true`, o sea que **se vuelve a ejecutar como comando** cada vez
que corre el evento (`ScriptCmd_RepeatDelay`, scriptcmds.cpp:5125-5131), con
el valor que `CYCLE_TIME` tenga entonces. Es la misma regla que
`Cazador.tic` (`reloj = ciclo` antes de decidir): el ciclo en el que el bicho
te encuentra todavía se programa con el ocioso, y el `cycle_up` vale para el
siguiente (base_npc_attack.script:478-482, :745-757).

**No es siempre «el de su base».** Los invocados ponen `const
CYCLE_TIME_IDLE 0.1` antes de incluir (`monsters/summon/base_summon.script:49-51`,
`snake_cursed.script:29-31`) y, como `const` gana el primero (el 66), piensan
a 0,1 siempre. Por eso el número no se elige por la base: se lee de la ficha.

## 2. Lo que se cambió

- `src/bsp/script.js`, `iaDe`: tres campos nuevos, `cicloOcioso`,
  `cicloCombate` y `cicloNpc`, leídos con `va` (el valor al nacer del 93: en
  la vieja es un `setvard` del bloque sin nombre y en la nueva un `const`).
  `null` si el guion no hereda ninguna base, que en el mod quiere decir que
  no hay `npcatk_hunt`.
- `src/play/ia.js`, `Cazador.ciclo`: lee `this.f.cicloOcioso` /
  `this.f.cicloCombate` y sólo si faltan cae en `CICLO` (los de la nueva).
  Con servidor es la misma clase (`Fauna` → `Manada` → `Cazador`): no hubo que
  tocar `src/red/`.
- Rehorneado: `node tools/bichos.mjs --mapa <m>` para `gatecity`, `edana`,
  `edanasewers`, `gertenheld_forest2` y `sala88` (`npm run mapa:bichos` sólo
  hace Gate City).

Lo que sale, contado en el horneado:

| mapa | 2,8 (vieja) | 2,0 (nueva) | sin base (`null`) |
| --- | --- | --- | --- |
| gatecity | 7 (2 arañas, la escupidora, 4 crías) | 31 (goblins, zombis enanos, el guardia) | 31 aldeanos |
| edana | 9 (3 ratas, 6 jabalíes) | 0 | 39 |
| edanasewers | 34 (16 ratas, 16 murciélagos, slime, cría venenosa) | 15 | 6 |
| gertenheld_forest2 | 34 (jabalíes, osos, esqueletos, sanguijuelas, ratas) | 50 (lobos, goblins, plantas…) | 11 |
| sala88 | 1 (la rata) | 0 | 0 |

En Edana **todos** los bichos que cazan son de la vieja: hasta hoy no había
un solo bicho de Edana con su reloj.

## 3. Cómo se comprueba (`test/ciclo94.test.mjs`, 13 pruebas)

1. `iaDe` de los guiones del mod: rata/araña/cría/jabalí 2,8, goblin/zombi
   2,0, `base_summon`/`snake_cursed` 0,1, `NPCs/default_dwarf` `null`.
2. **Un oráculo independiente**: seguir los `#include` del texto hasta una de
   las dos bases, y comparar con el `bichos.json` horneado de los cinco mapas,
   bicho por bicho. No depende de que el intérprete de `variablesAlNacer`
   acierte. Con un control de que hay bichos de las dos bases.
3. **Por `Manada.cazar`**, con el colocado del `bichos.json` de Gate City tal
   cual (sin aparecedor): la cría de araña tarda 2,8 s en fijarte desde un
   ciclo recién empezado, el goblin 2,0. Dos casos lado a lado (el 50).

**Roturas deliberadas** (comprobadas con `grep -c` de la marca antes de
correr, y restauradas):

- `Cazador.ciclo` vuelto a `CICLO.ocioso` → **rojo**: «la cría de araña tarda
  2,8 s», `tardó 2.017 s`. Las demás 12 verdes, como deben.
- `iaDe` con `cicloOcioso: 2.0` fijo → **rojas tres**: la IA vieja, el
  invocado y el aldeano sin base.

## 4. Lo que rompió y no era del juego: `test/salto93g`

Con el reloj nuevo se puso rojo «con servidor, la araña salta sobre UN
jugador…». Con el cambio quitado, verde. Era una **semilla afinada**:

- El salto es un dado, `$rand(0,99) < 20` cada `repeatdelay 4`
  (spider.script:93-100), más `!IS_ATTACKING` y la distancia. Sobre las
  semillas 1-8 y 30 s, **fallan dos de ocho con los dos relojes** (2,0: la 6
  y la 7; 2,8: la 2 y la 3). La prueba usaba la 3.
- Y debajo había otro: el «≥ 4 mordiscos de veneno» no era un
  envenenamiento. Ana tiene **15 de vida** y cuatro mordiscos de 5 son 20; con
  los mordiscos normales de antes del salto muere en el segundo o el tercero
  (semilla 1: 7,8 → 2,8 → 0). Los ≥ 4 que salían eran **dos**
  envenenamientos, el segundo tras reaparecer, y el número iba de 1 a 6 según
  la hora del salto.

Arreglo (en la prueba, no en el juego): se le dan vueltas a las semillas hasta
que se pega y se dice en cuántas (el remedio del 76), y se pide ≥ 1 mordisco,
que es lo que la prueba mide: a QUIÉN llega el veneno.

Por qué un reloj OCIOSO movía una araña que te fija en el primer paso: porque
(a) el ciclo en el que te encuentra se programa con el ocioso (2,8 en vez de
2,0 hasta el segundo pensamiento, que es del mod: ver §1), y (b) con la
semilla 3 la araña **pierde el objetivo** a los 15,5 s y vuelve a fijar a los
18,4 s —a Beto, que está a 60 m y dentro de los 4 000 u de persecución— y
luego a Ana. Cada vuelta por el ocioso desplaza las tiradas del `$rand`.

## 4 bis. Las sondas

| sonda | con el arreglo | nota |
| --- | --- | --- |
| `sondas/mordisco92.mjs` | 25 de 25 | |
| `sondas/consecuencias.mjs` | 53 de 53 | su tope de 3 s ya cubría los 2,8 (el 93) |
| `sondas/ia.mjs` | 15 de 15 | |
| `sondas/salto93.mjs` | 14/15, 8/15, 14/15 en tres pasadas | **CON EL CAMBIO QUITADO: 8/15** |

`salto93` es un dado en el navegador, con y sin este cambio: en la pasada de
8/15 la araña no salta en 150 s (`rastro {}`), porque la sonda se planta a
0,9 m y el salto pide `!IS_ATTACKING` (spider.script:97) — lo mismo con el
reloj de 2,0. Y cuando sí salta queda una roja que no es de aquí: «SE TE PEGA…
a 1,21 / 1,34 m de tus pies» (pide < 0,3). La distancia se lee en el primer
muestreo con `fisica.sigue`, cada 250 ms. No se ha diagnosticado; no la toca
el reloj ocioso (agarrada, la caza no piensa), pero tampoco se ha corrido la
pasada de base que lo demuestre en el caso «salta».

## 5. Lo que queda, dicho

- **El primer pensamiento.** El cazador nace con el reloj a 0 y piensa en el
  primer paso. En el mod la nueva espera `NPC_SPAWN_PRED2 0.75` s
  (base_npc_attack_new.script:92, :148) y la vieja no caza hasta
  `NPC_INITIALIZED`, que pone `npcatk_get_postspawn_properties` a
  `$randf(0.5,1.0)` (base_npc_attack.script:40, :57, y la guarda `if NPC_INITIALIZED` en :71); su `hunting_mode_go`
  corre en el primer fotograma y se reprograma a 2,8 sin hacer nada, así que
  su primera caza de verdad es **a los 2,8 s**. No se ha portado: mueve la
  fase de todas las sondas que entran y miran.
- **`cicloNpc` horneado y sin caso.** `objetivos()` (main.js, red/fauna.js)
  sólo da jugadores, así que la rama «objetivo NPC» de las dos bases no corre.
- **Los aldeanos con `null`** tienen `Cazador` igual y caen en el 2,0 de la
  nueva. En el mod no tienen bucle de caza; aquí no fijan a nadie porque no
  son hostiles, pero un `apuntarA` (aviso de aliados) los pondría a cazar.
- `test/combate80` y `test/crias93f` construyen fichas a mano sin el campo y
  siguen midiendo 2,0; llevan su corrección al lado.

## 6. Lo que se entendió mal por el camino

- Creí que `repeatdelay CYCLE_TIME` se resolvía una vez al cargar, y entonces
  la vieja pensaría **cada fotograma** (la variable no existe en carga y
  `atof` da 0). Es `KeepCmd`: el comando se queda en el evento y se vuelve a
  correr.
- Mi primera prueba de diagnóstico dejó un `p94tmp.mjs` en la raíz del árbol
  compartido; borrado en el acto. Y un `sed` que reescribía `"../` cambió
  también `"../MSC/…"` y el lector devolvió `null`: el error salió en
  `ficha.nombre`, tres líneas más abajo.
