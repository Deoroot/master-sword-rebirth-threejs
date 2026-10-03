# Las fichas que leían un evento que no corre — experimento 92, pieza D

`sondas/mundo.mjs` daba **41 de 44**. Tres rojas:

1. «en Gate City nadie pide `set_self_adj`: los tramos de vida no se disparan» — 13 lo pedían;
2. «ni hay jefes que cobren el ×4»;
3. «el que anda y declara animación de andar, la tiene puesta» — 41 bien, 3 mal.

Las dos primeras eran una sola causa, en el lector de guiones. La tercera no
tenía nada que ver con las fichas: era el candado del 80 echado por una pose de
reposo. Ahora la sonda da **44 de 44** dos pasadas seguidas.

## 1. Las dos primeras: `vars` trae lo que pone cualquier bloque

`iaDe` (src/bsp/script.js) leía `NPC_SELF_ADJUST` y `NPC_IS_BOSS` con `v`, y
`v` lee `vars`, que `recoger` cosecha de los `setvar`/`setvard`/`const` de
**todos los bloques de todo lo incluido, corran o no**. Los únicos que ponen
esos dos valores en los bichos de Gate City son dos eventos de
`monsters/externals.script`:

    { make_boss            setvard NPC_IS_BOSS 1          :791-793
    { set_self_adj         setvard NPC_SELF_ADJUST 1      :1319-1322

Ningún guion del pueblo los llama: los pide el mapa por `params`, u otro guion
con `callexternal` (`dq/quests/dq_kill_target.script:72` hace `make_boss`). Es
la trampa de `NPC_NO_DROPS` del 82 (el comentario del botín en `iaDe`), que el
82 vio en una variable y arregló en esa.

### Desde cuándo

Desde el 82, cuando `includeDe` empezó a entender `#include [server] ...`
(`NPCs/base_npc.script:7-8`). Antes `monsters/externals` no se cargaba nunca y
los dos campos salían `false`. Medido con el lector de cada commit:

| commit | lector | rata: jefe / ajuste / ve | zombi de ballesta: `andando` |
| --- | --- | --- | --- |
| `dd4bd1d` (33-37) | sin `[server]` | false / false / **true** | null |
| `a0049b3` (39-85) | con `[server]` (el 82) | **true / true / false** | null |
| `06d29fd` (88-91) | más el `callevent` con retraso (el 89) | true / true / false | **walk** |

O sea que la sonda estaba verde hasta que alguien rehorneó Gate City después
del 82. El 81 ya dejó escrito que `mundo` daba «41, 43, 43 de 44» con las rojas
cambiando (doc/MOVEDEST_81.md): aquellas 43 eran sólo la tercera roja, la del
candado, así que el `bichos.json` todavía no tenía el `externals` dentro. Que
la sonda leyera el horneado y no el lector es lo que retrasó la roja.

### La regla del motor, que no es «primero gana» ni «último gana»

`ParseScriptFile` trata distinto los tres comandos **al cargar** el guion, línea
a línea de cada bloque (script.cpp:5384-5458):

| comando | al cargar | cuándo vale |
| --- | --- | --- |
| `const` | se registra si no está (`AddConst = false`, :5418-5430) | siempre; gana el **primero** |
| `setvar` | se **ejecuta**: `SetVar(...)` y `KeepCmd = true` (:5386-5416), en cualquier bloque que no sea `[client]` | aunque su evento no corra nunca; `SetVar` pisa, así que gana el **último** en orden de lectura. Y se vuelve a ejecutar si el evento corre («Exectuted at loadtime and runtime», scriptcmds.cpp:120) |
| `setvard` | **no** se ejecuta: se reescribe a `setvar` y se guarda (:5448-5458) | sólo si su bloque corre |

Y lo que corre al nacer: `spawn` y `game_spawn` (global.cpp:436-437) —que en
`base_npc` llama a `npc_spawn` (:24)—, los bloques sin nombre, que el motor
arma con `fNextExecutionTime = 0` (script.cpp:5198-5202), y lo pedido con
retraso (`callevent 1.0 npc_post_spawn`, base_npc.script:25). Dentro de eso,
una variable puesta dos veces vale lo de la **última ejecución**.

`make_boss` y `set_self_adj` usan `setvard`: no cuentan.

### Lo que se cambió

- `variablesAlNacer` (src/bsp/script.js): lee el guion **en el orden del
  motor** (cada `#include` en su sitio, el 66), ejecuta los `setvar` al cargar,
  y luego recorre lo que corre al nacer aplicando `setvar` y `setvard` en orden
  de ejecución. Devuelve `{ variables, constantes }`; `leerFichaNpc` lo expone
  como `alNacer`.
- `iaDe` tiene `va(n)` —la variable al nacer, o la constante si no la hay— y lo
  usan **cinco** campos. `v` y `vars` no se tocan: el resto de la ficha sigue
  como estaba.

Lo que NO hace, igual que `visita`: no evalúa condiciones. Un `setvard` dentro
de un `if ( ... ) { }` de varias líneas cuenta como ejecutado; uno en una sola
línea, `if ( ... ) setvard X 1`, **no** cuenta (la línea empieza por `if`). Eso
deja fuera, por ejemplo, a los jefes que lo son según el mapa
(`calruin/cavetroll.script:8-10`, `if ( $lcase(game.map.name) equals calruin2 )
setvard NPC_IS_BOSS 1`, y nueve más): ninguno está en los cinco mapas
horneados. Tampoco aplica `[override]` ni pasa parámetros: `skeleton_mage`
llega a `ext_reduct_xp` desde un evento con retraso y sale con `PARAM1`.

### Cuántos campos de `iaDe` tenían la misma trampa

Medido sobre los **1 593 guiones con modelo** de los 2 884, comparando para
cada una de las 72 variables que lee `iaDe` (más las diez del botín) el valor
de `vars` con el valor al nacer. **34 difieren en alguna ficha.** Se separan en
dos clases, y sólo la primera es esta trampa pura:

**Sólo «un evento muerto ponía un valor → al nacer no hay nada»**, ni un caso
de otra clase:

| variable | fichas | de dónde salía | ¿se cambia? |
| --- | ---: | --- | --- |
| `NPC_EXP_REDUCT` | 968 | `ext_reduct_xp`, externals:860-869 (`PARAM1`) | **sí** |
| `NPC_SELF_ADJUST` | 955 | `set_self_adj`, :1319-1322 | **sí** |
| `FLEE_DISTANCE` | 955 | `turn_undead`, :461 (la línea :519, 2 048) | **sí** |
| `NPC_MUST_SEE_TARGET` | 915 | `set_blind_attack`, :1227-1229 (0) | **sí** |
| `NPC_IS_BOSS` | 911 | `make_boss`, :791-793 | **sí** |
| `DROP_ITEM2/3/4_CHANCE` | 962 / 973 / 973 | `ext_no_drops2`, :886-894 (`0%`) | no: `botinDe` da 0 en los dos casos. Pendiente |
| `RETALIATE_CHANCE` | 319 | líneas `if (...) setvard` del `base_npc_attack` viejo | no: es la limitación de las condiciones, no la trampa |
| `ANIM_FLINCH` | 9 | — | no: no se ha mirado |
| `HUNT_AGRO` | 4 | `base_npc_attack.script:808` (un `if`) | no: no decide nada (`huntAgroViejo`) |

**Mezcladas** —el evento muerto y un `setvard` de después con algo que este
lector no puede evaluar: `MY_WIDTH`, `$get(ent_me,xp)`, `PARAM1`,
`game.monster.height`—: `NPC_GIVE_EXP` (754), `ATTACK_RANGE` (670),
`ATTACK_HITRANGE` (628), `MOVE_RANGE` (379), `ANIM_ATTACK` (275), `ANIM_WALK`
(255), `ANIM_RUN` (250), `FLINCH_CHANCE` (63), `DROP_ITEM1_CHANCE` (817),
`CAN_FLEE` (750, sin efecto: `!== 0` da lo mismo), y trece más de menos de 30
(`ATTACK_HITCHANCE`, `ATTACK_DAMAGE`, `ANIM_DEATH`, los `SOUND_STRUCK*`…).
Pasarlas a `va` sin más cambiaría un valor malo por otro (`ATTACK_RANGE` →
`MY_WIDTH`). **Pendiente**, y con el número delante.

### Antes y después, sobre los 2 884 guiones

**974 fichas cambian**, todas en `ia` y sólo en los cinco campos:

| campo | fichas | cambio |
| --- | ---: | --- |
| `reduccionDeExp` | 968 | `"PARAM1"` → `null` |
| `huir.distancia` | 955 | 2 048 → 1 000 |
| `seAjusta` | 955 | true → false |
| `tieneQueVerte` | 915 | false → true |
| `esJefe` | 911 | true → false |

Jefes: de 974 a **63** (los de verdad: `goblinchief`, `orc_chief`, los cuatro
`bear_god_*`…). Autoajustables: de 972 a **17**, todos `orc_for/*_sa`, que lo
piden con `setvar`. Ciegos: de 964 a **49** (el goblin y el guardia goblin, que
lo ponen en su bloque sin nombre, los limos, los trolls…). Rebaja de
experiencia: de 968 a **5**.

En los mapas horneados (`build/<mapa>/bichos.json`, comparado colocado a
colocado; los `modelos` no cambian en ninguno):

| mapa | colocados que cambian | jefes después | ciegos después |
| --- | --- | --- | --- |
| gatecity | 61 de 69 | 0 | `monsters/goblin` |
| edana | 35 de 48 | 0 | ninguno |
| edanasewers | 52 de 55 | 0 | dos limos |
| gertenheld_forest2 | 84 de 95 | `monsters/goblinchief` | goblin, goblin_guard |
| sala88 | 1 de 1 | 0 | ninguno |

El jefe goblin de `gertenheld_forest2` es el segundo caso que el control de
Gate City no tiene (el 50): `setvard NPC_IS_BOSS 1` en su bloque sin nombre
(`monsters/goblinchief.script:3-7`).

### Lo que cambia en el juego, y no se ve en la sonda de este experimento

`tieneQueVerte` es el que tiene efecto de verdad (`src/play/ia.js:303`):
**desde el 82 casi todos los bichos pegaban sin línea de visión**, porque
`set_blind_attack` es lo que el mapa le pide a una torreta. Ahora sólo el goblin
y los que lo declaran. Y salió en una prueba de otra pieza:
`test/costurared92b.test.mjs` montaba la rata en x = 1,2 m y el segundo jugador
aparece en x = 1,28, **dentro de la rata**; su `$cansee` sale del ojo de la
rata y topa con el cuerpo de Beto. `FMVisible` traza con `dont_ignore_monsters`
(combat.cpp:1216-1246), así que «no te veo» es lo que hace el motor: la prueba
mordía porque la rata salía ciega. Se ha movido la rata a −1,2 m con el porqué
al lado; no se ha cambiado nada de lo que mide.

## 2. La tercera: el aldeano que echa a andar asintiendo

### La pista, que era falsa

La pista era que los tres `dwarf_zombie_hbow` de Gate City pasaron hoy de
`andando: null` a `"walk"` al rehornear. Es verdad, y viene del 89 (la tabla de
arriba): con el `callevent` con retraso arreglado, `visita` llega a
`npc_spawn > (NPC_SPAWN_PRED2) npcatk_hunt > npcatk_settarget > npcatk_run`, y
ése hace `setmoveanim ANIM_RUN`, que en el zombi es `walk`
(base_monster_shared.script:705-708). Es un camino **condicional** —`settarget`
sólo corre si hay a quién cazar— y este lector no evalúa condiciones; se apunta
como pendiente. **Pero no era la roja**: no se distingue en `andando` porque el
modelo tiene `walk`, y la sonda nunca los contó.

### Lo medido

`probe.vivo.pasear` ahora devuelve, por bicho, con qué estado y qué secuencia
se movió en cada fotograma (`comoSeMovio`) y si le quedaba el candado puesto;
la sonda imprime a los «mal». Tres pasadas, antes del arreglo:

    MAL Commoner  NPCs/default_dwarf  declara 'walk'  se movió como {"pasea:nod":421}   (×5)
    MAL Commoner  NPCs/default_dwarf  … {"pasea:nod":194} … NPCs/default_human … {"pasea:idle7":262}
    3 mal, los tres default_dwarf, candado: true, deBucle: false

O sea: **aldeanos**, en estado de pasear, moviéndose con `nod` (o `idle7`)
puesto durante todo el paseo, y con el candado de `CAnimOnce` echado.

### La causa

`Manada.pon` arma el candado del 80 con **cualquier** secuencia que no sea de
bucle. `dwarf/male1.mdl` sortea su reposo entre `idle` 10, `nod` 10 y
`anim_xbow_aim_idle` 3, y `nod` no es de bucle: así que 10 de cada 23 veces el
aldeano se quedaba con el candado puesto, el paseo le daba destino, la de andar
se **rechazaba** y él se deslizaba asintiendo hasta que el asentimiento
acabara. En el motor eso no pasa:

    if (HasConditions(MONSTER_HASMOVEDEST)) SetAnimation(MONSTER_ANIM_WALK, m_MoveAnim);
    else if (m_IdleAnim.len())               SetAnimation(MONSTER_ANIM_WALK, m_IdleAnim);
    else if (m_OldActivity != m_Activity || m_fSequenceFinished)
      { m_pAnimHandler = NULL; SetActivity(ACT_IDLE); }
                                             msmonsterserver.cpp:589-600

La pose sorteada se pone con el manejador a `NULL`; `SetAnimation` lo cambia a
`gAnimWalk` (:2011-2012), cuyo `CanChangeTo` devuelve `true` siempre
(monsteranimation.cpp:144-147). El candado sólo lo arma `CAnimOnce`, o sea
`playanim once` y el ataque.

En la sonda era peor que en el juego: `pasear` no corre los relojes de la
manada, así que nadie vencía el candado y el aldeano se deslizaba los diez
segundos enteros. En el juego se desliza lo que dura `nod`. **Arreglar sólo la
sonda —meterle los relojes a `pasear`— habría puesto el control en verde con el
juego mal**, porque basta con verle la de andar UN fotograma; por eso se arregla
el juego y `pasear` se queda como está.

### Lo que se cambió

`Manada.ponDeAndarOParar` (src/play/manada.js): `pon` y, si lo puesto no es de
bucle, suelta el candado. La usan los once sitios que piden la de andar, la de
correr o la de reposo (`MONSTER_ANIM_WALK`); el ataque y las escenas siguen con
`pon`. Si hay un candado DE VERDAD puesto, `pon` rechaza igual que antes: la
prueba de control lo mide.

### Desde cuándo

Desde el 80, que trajo el candado. El 71 daba 44 de 44 y el 81 ya veía esta
roja «la que más repite» (doc/MOVEDEST_81.md), achacada primero al `#include` y
luego al HMR de vite. Era aleatoria —0, 2, 3, 4 o 5 según la pasada— porque
depende de cuántos aldeanos estén asintiendo justo cuando les toca destino.

## 3. Lo que se entendió mal

- **La corrección del 81 midió `andando`, `parado`, `modelo` y `hp`, y no
  `ia`.** Dijo, con razón, que el `#include [server]` no cambiaba esos cuatro
  campos en 72 guiones, porque `vars` es «primero gana» y lo de `externals`
  llega tarde. Para una variable que **nadie más** declara —`NPC_IS_BOSS`—
  llegar tarde es llegar el único, y entraba. *Medir que un cambio no mueve
  cuatro campos no dice nada de los otros cuarenta.*
- **El comentario de `seAjusta` decía «los 25 scripts del pueblo dan 0»**, y era
  verdad del lector que había al escribirlo. Desde el 82 daban 1. Se añade la
  corrección al lado, sin reescribirlo.
- **«No leerlo» fue la salida del 82 para `NPC_NO_DROPS`**, y vale para una
  variable que nadie pone al nacer. Para `NPC_IS_BOSS` no: 7 ficheros la ponen
  con `setvar` y 43 con `setvard`, y 63 fichas son jefes de verdad. Hacía falta
  la regla del motor, no una lista de variables que no leer.
- **La pista de los zombis** era un hecho cierto y una causa falsa. Lo que lo
  separó fue preguntar QUIÉNES, que la sonda no decía.
- **La primera rotura del control positivo de la pose salió roja por otro
  motivo**: con la rotura puesta, el `nod` del nacimiento echa el candado y el
  ataque de la prueba no llega a entrar. Se añadió el control «el ataque entra»
  para que el rojo diga por qué.

## 4. Roturas deliberadas

Con `grep` comprobando cada parte:

| rotura | Node | sonda `mundo` (rehorneado Gate City con la rotura) |
| --- | --- | --- |
| `esJefe` y `seAjusta` vuelven a `v` | 2 rojas en `fichas92d` (Gate City sin jefes, `orc_for` se ajusta) | **MAL** «nadie pide `set_self_adj`» (13) y **MAL** «ni hay jefes» |
| `ponDeAndarOParar` no suelta el candado | 2 rojas en `fichas92d` | **MAL** «el que anda…», 2 mal, los dos `default_dwarf` en `pasea:nod` |

Con las dos puestas a la vez la sonda dio 41 de 44: las tres rojas de
partida. Restaurado (comprobado con `grep`) y rehorneado.

## 5. Resultados

- `npm test`: **2 454 verdes, 0 rojas, 1 todo** (antes 2 441; +13 de
  `test/fichas92d.test.mjs`).
- Sondas: `mundo` **44/44** (dos pasadas), `mordisco92` 25/25, `consecuencias`
  48/48, `costura91` 19/19, `sala88` 10/10, `arranque36` 30/30.
- Rehorneados los cinco mapas (`npm run mapa:bichos` y `-- --mapa edana`,
  `edanasewers`, `gertenheld_forest2`, `sala88`), comprobado por fecha y por el
  campo `mapa` de cada `bichos.json`.

Y una de propina: `test/costura91.test.mjs`, «CONTROL DEL ABSORBER», salía roja
una pasada de cada seis con el código bien: el bloque sin nombre de la rata
hace `playanim once ANIM_IDLE2` con `$rand(0,5)` (giantrat.script:7, :81-82).
Se vacía la lista después de nacer, como ya hacía la prueba de al lado.

## 6. Pendiente

1. Las **23 variables mezcladas** de §1: pasarlas a `va` pide antes saber qué
   hacer con un `setvard` cuyo valor no se puede evaluar aquí.
2. Las probabilidades del botín (`DROP_ITEMn_CHANCE`) siguen en `v`; hoy no
   deciden nada.
3. Los `if (...) setvard` de una línea no cuentan: los jefes que lo son según
   el mapa salen `false` (ninguno en los cinco mapas).
4. `andando: "walk"` del zombi de ballesta sale de un camino condicional
   (`npcatk_settarget`). En el motor, al nacer, `m_MoveAnim` está vacío.
5. `probe.vivo.pasear` no corre los relojes de la manada, a diferencia del
   bucle del juego. No se ha tocado: con el arreglo, el control mide lo que
   tiene que medir, y metérselos lo habría puesto verde con el juego mal.

## Archivos

- `src/bsp/script.js` — `variablesAlNacer`, `alNacer` en la ficha, `va` en
  `iaDe` para cinco campos, y dos correcciones añadidas al lado de comentarios.
- `src/play/manada.js` — `ponDeAndarOParar` y sus once llamadas.
- `src/dev/sonda.js` — `pasear` dice cómo se movió cada uno y si le quedaba el
  candado.
- `sondas/mundo.mjs` — imprime quiénes son los «mal».
- `test/fichas92d.test.mjs` — nueva, 13 pruebas.
- `test/costurared92b.test.mjs` — la rata a −1,2 m.
- `test/costura91.test.mjs` — el sorteo del nacimiento fuera del control.
