# Experimento 95 (pieza D) — el aldeano huye una vez, y al morir no avisa

**El encargo:** los dos pendientes del 94 que son del aldeano
([GUARDIAS_94.md](GUARDIAS_94.md) §7): «dos huidas en el aldeano» y «matar a
un aldeano no avisa a sus aliados en el motor y aquí sí».

**Lo que se encontró:** que las dos tienen la misma raíz —el aldeano de Master
Sword **no tiene IA de ataque**, y el port le aplicaba la de los monstruos—, y
que al quitar la huida que sobraba se vio que **la que debía quedar no existía
en un jugador**: el `setmovedest ent_laststruck … flee` de su guion no
encontraba a nadie en el navegador desde el 94. La única huida que se veía era
justo la que el mod no tiene.

## 1. Quién decide la huida de un aldeano, en el mod

```
NPCs/default_human.script
  :14-16   setvar CAN_FLEE 1 / const FLEE_HEALTH 25 / const FLEE_CHANCE 100%
  :20-22   const CAN_FLINCH 1 / FLINCH_ANIM flinch1 / FLINCH_CHANCE 50%
  :28-30   #include monsters/base_npc, monsters/base_civilian, monsters/base_xmass
  :66-72   { game_struck  setmovedest ent_laststruck 1024 flee
                          setmoveanim ANIM_RUN / setvard AM_SCARED 1 / callevent 20.0 calm_down1 }

NPCs/default_dwarf.script
  :16-25   los mismos CAN_FLEE / FLEE_HEALTH 25 / FLEE_CHANCE 100% / CAN_FLINCH 1
  :32-34   #include monsters/base_npc, monsters/base_civilian, NPCs/dwarf_lantern_base
  :79-82   { game_struck  setmovedest ent_laststruck 9999 / playanim critical ANIM_ATTACK }
```

Las constantes de huir y encogerse **las lee `npcatk_checkflee` y
`npcatk_checkflinch`**, que cuelgan del `game_struck` de las dos IA de ataque
(base_npc_attack_new.script:1065-1093, :1142, :1156; la vieja,
base_npc_attack.script:228-246, :303, :416). **Ninguno de los dos aldeanos
incluye ninguna de las dos**: `base_npc` incluye `externals` y
`base_self_adjust` (base_npc.script:7-8), y nada más. O sea que en el mod esas
constantes no las lee nadie; quien decide es su propio `game_struck`.

En C++ no hay huida automática: `grep -ri flee` en el código del mod sólo da
la rama `flee` de `setmovedest` (npcscript.cpp:1639-1703), que es la que pide
el guion.

Y el **enano** es el segundo caso, y más claro que el humano: **en el mod no
huye nunca**. Su `game_struck` le gira hacia ti (`setmovedest … 9999`, que es
mirar y no andar — el 81) y le hace dar el golpe de su animación. En el port
huía igual que el humano.

### La marca: `HAS_AI`

`setvar HAS_AI 1` lo escriben **dos líneas en los 2 884 guiones**:
base_npc_attack.script:5 y base_npc_attack_new.script:81, en el bloque sin
nombre (al nacer). Es exactamente «tiene la IA de ataque», y es lo que lee el
propio mod para el aviso (§2). La ficha lo hornea ahora como `ia.tieneIA`
(`iaDe`, src/bsp/script.js:1706), leído con `va` (el valor al nacer).

Censo del horneado (`npm run mapa:bichos -- --mapa <m>`, los cinco mapas):

| mapa | bichos | con IA | sin IA | sin IA que huían por la IA | y se encogían |
| --- | --- | --- | --- | --- | --- |
| gatecity | 69 | 38 | 31 | **16** (4 humanos + 12 enanos) | 16 |
| edana | 48 | 9 | 39 | 3 (los `default_human`) | 3 |
| edanasewers | 55 | 49 | 6 | 1 | 1 |
| gertenheld_forest2 | 95 | 84 | 11 | 0 | 0 |
| sala88 | 1 | 1 | 0 | 0 | 0 |

(Los otros «sin IA» son tenderos, cofres, sacerdotes…: sin `FLEE_HEALTH`, la
regla no les cambiaba nada.)

## 2. El aviso: `if HAS_AI`

```
monsters/base_npc.script:163-172
  if ( NPC_AUTO_DEATH )
    ...
    if ( !NPC_ALERTED_ALL )
    {
      if HAS_AI
      callevent npcatk_alert_all_allies $get(ent_laststruck,id)
    }
```

Y `npcatk_alert_all_allies` además vive en `base_monster_shared`
(:1071-1085), que el aldeano tampoco incluye. En el port `Manada.avisar`
avisaba a todo el que tuviera cazador, y **el aldeano tiene cazador**. Medido
antes de tocar, con `Partida` + `Fauna` y las fichas horneadas: un humano y un
enano a un metro (los dos `race human`, aliados para la tabla), matar al
humano → **el enano te tomaba de objetivo** (`objetivo: "j1"`). En la sonda,
con la rotura puesta, el aldeano muerto avisa a **3**.

## 3. Lo que se cambió

| pieza | dónde | qué |
| --- | --- | --- |
| `tieneIA` | `iaDe`, src/bsp/script.js | `num(va("HAS_AI")) === 1`, con cita |
| reacción al golpe | `reaccionAlGolpe`, src/play/reaccion.js | sin IA, ni `cambiaDeObjetivo`, ni `huyeDelGolpe`, ni `seEncogeIA`. El encogerse de `base_struck` sigue: es otro `#include` y lo decide su propia ficha |
| devolver el golpe | `Manada.herir`, src/play/manada.js | `apuntaAlQueTePega` es otra rama del mismo `game_struck` (:1075): también con `tieneIA !== false` |
| el aviso | `Manada.avisar`, src/play/manada.js | `if (i.ficha.ia?.tieneIA === false) return [];`, con la cita de base_npc.script:170 |
| **la huida del guion, en un jugador** | `entidadParaDestino`, src/main.js | también es el jugador lo que el guion de ESE NPC sabe que es el jugador (`entorno.esElJugador`: `ent_laststruck`, `ent_laststruckbyme`, `ent_lastseen`) |
| la sonda | `probe.ia.bicho` y `probe.reaccion.censo`, src/dev/sonda.js | `id`, `tieneIA`, `huyendoPorIA`, `mandado`, `objetivo`, `encogidas`; `corriendo` |

`undefined` en `tieneIA` —una ficha escrita a mano o un horneado anterior al
95— se lee como «sí», que es lo que se hacía. Es un valor de reposo a
propósito, para no cambiar las ~90 pruebas que construyen fichas; por eso la
prueba nueva **comprueba el horneado** y pide que ningún bicho de Gate City
venga sin el campo (el 81: un horneado a medias es una medida vieja con cara
de nueva).

### La tercera pieza, que no estaba en el encargo

Con la huida de la IA quitada, el control positivo de la sonda —«su guion le
manda huir»— salió **rojo**, y `probe.misiones.noSoportados` lo dijo por su
nombre:

```
setmovedest no hay ninguna entidad que se llame ent_laststruck
```

El servidor resuelve `ent_laststruck` preguntándole al guion del NPC
(`Partida._cuerpoDeRef`, el paso 2 de `RetrieveEntity`, global.cpp:382-398),
y por eso la prueba de Node lo veía bien. El navegador tiene su propia
`entidadParaDestino` y sólo sabía de `player`, `ent_lastspoke` y el id del
personaje. El 94 abrió `ent_laststruck` en el guion pero **no en el destino
del navegador**, así que en una partida de un jugador el aldeano **no huía por
su guion ninguna vez**; huía, del segundo golpe en adelante, por la IA que el
mod no le da. Las dos mitades estaban verdes y el fallo estaba en la costura
(el 63), y lo destapó el control positivo de al lado (el 70).

## 4. Cómo se mide

**`test/aldeanos95.test.mjs`** (10 pruebas), con servidor: `Partida` + `Fauna`
+ un mensaje `PEGAR`, fichas y guiones horneados de Gate City. Los controles
positivos son la misma ficha con `tieneIA: true` —el valor de antes, escrito a
la vista—.

- el horneado: humano y enano `false`, goblin y guardia `true`, ningún bicho de
  Gate City sin el campo; Edana: el aldeano sentado `false`, el jabalí `true`;
- **humano, dos golpes**: sin `cazador.huyendo` y con `mandado.dueño ===
  "guion"`. Dos golpes porque `game_struck` corre con la vida de ANTES
  (TakeDamage, msmonsterserver.cpp:2385, antes de `GiveHP`) y `FLEE_HEALTH 25`
  es estricto: la huida de la IA salía del SEGUNDO. Control positivo: con
  `tieneIA: true`, el primero no y el segundo sí — **las dos huidas**;
- **enano**: no huye por la IA y su guion le manda girarse (proximidad 9999);
- **encogerse**, con `Math.random` a 0 durante el golpe: 0 encogidas; con
  `tieneIA: true`, 1. (El primer intento del positivo salió rojo con un solo
  golpe: `FLINCH_HEALTH` es la vida máxima y también se compara con la de
  antes. Era el control el que estaba mal.)
- **el aviso**: humano + enano a un metro, aliados; matar al humano no avisa a
  nadie (`avisar` espiado, sin cambiar lo que hace) y el enano sigue sin
  objetivo. Positivos: con `tieneIA: true` en el que muere avisaba y el enano
  te perseguía; dos goblins: el que muere avisa.

**`sondas/guardias94.mjs`**, un jugador, por el menú, a espadazos: **23 de 23**.

```
4) segundo golpe al llevado: vida 23.9 -> 22.57, tieneIA false, huye por IA false,
   mandado {"proximidad":35.2,"dueño":"guion"}, faltas []
   en 2 s el aldeano anda 1.73 m
5) aldeano muerto en 1 tanda(s), avisos +0; el de al lado: objetivo null
   control: goblin 0 muerto en 1 tanda(s), avisos +2
```

El apartado 5 mata por el camino de la muerte de `main.js` (`golpe.atacar` con
la vida a 1), que es el que suma `estado.avisos`, y no por
`probe.reaccion.matarYAvisar`, que se lo salta (CONSECUENCIAS_92).

**`sondas/consecuencias.mjs`**: su sección 5 medía la huida de la IA **con
aldeanas**, porque tenían `FLEE_CHANCE 100%`. Medía una huida que el juego no
tiene, y con el arreglo se puso roja (4 rojas, 49 de 53). Se ha cambiado de
bicho, no de listón: ahora mide a los zombis enanos (`HAS_AI`, `FLEE_HEALTH
25`, el dado a favor con `huir: 1`), compara la animación con el `ANIM_RUN` de
su ficha en vez de con `"run"` escrito, pide que haya al menos uno (un
`[].every` vacío es verde, el 92), y la aldeana pasa a ser el control negativo
de al lado. El comentario viejo se queda, con la corrección debajo. **55 de 55**.

## 5. Las roturas deliberadas, verificadas con `grep`

| rotura (`grep -c "ROTURA 95D"` = 1 puesta, = 0 al quitar) | Node | sondas |
| --- | --- | --- |
| `const conIA = true` en `reaccionAlGolpe` | **3 rojas**: humano, enano, encogerse | guardias94 **20 de 23** (junto con la de abajo): «la IA no le hace huir otra vez» (`huye por IA true`); consecuencias **54 de 55**: «el aldeano no huye por la IA» |
| la línea `tieneIA === false` de `avisar` comentada | **1 roja**: «matar a uno no pone al otro a perseguirte» | guardias94: «no avisa a nadie» (`avisos +3`) y «el de al lado no te toma de objetivo» (`objetivo jugador`) |
| `aliasDeSuGuion` cambiado por `false` en `main.js` | — (el navegador no tiene prueba de Node) | guardias94 **21 de 23**: «su guion le manda huir» (`null`, y `faltas` dice `ent_laststruck`) y «huye de verdad» (**0,00 m** en 2 s) |

Las tres revertidas, `grep -c` a 0 y la línea buena a 1.

## 6. Las pruebas enteras y las sondas vecinas

- `npm test`: **2 693 pruebas, 2 691 en verde, 0 rojas**, 1 omitida y 1 `todo`
  (con el trabajo de las otras cuatro piezas del 95 a medias en el árbol).
- `sonda:guardias94` **23 de 23** · `sonda:consecuencias` **55 de 55** ·
  `sonda:mundo` **44 de 44**.
- Hubo que rehornear `bichos.json` de los cinco mapas
  (`node tools/bichos.mjs --mapa <m>`; `npm run mapa:bichos` a secas sólo hace
  Gate City, el 82).
- Dos pasadas de `guardias94` cayeron por la página que no cargaba (un
  `src/render/otros.js` de otra pieza a medio guardar, 500 de Vite) y otra por
  Vite tardando más de 7 s en un árbol con varias sondas corriendo a la vez. No
  eran del juego; se repitieron.

## 7. Lo que se entendió mal

- **«Dejar una sola, la del juego» parecía quitar una.** Era quitar una y
  ARREGLAR la otra: en un jugador la del guion no existía. Si sólo se hubiera
  mirado la prueba de Node —con servidor, donde sí existía—, el aldeano habría
  quedado sin huir en todas las partidas de un jugador, y en verde.
- **La sección de huida de `consecuencias` era un verde que medía otra cosa**
  desde que se escribió: probaba el mecanismo de `npcatk_flee` con el único
  bicho de Gate City que no lo tiene.

## 8. Lo que queda

- **Quien RECIBE el aviso.** `npcatk_ally_alert` vive en `base_monster_shared`
  (:1094); un aliado sin esa base no reacciona. `Manada.avisar` sigue avisando a
  cualquiera con cazador. En Gate City no hay caso medido (guardia `hguard` y
  goblin no son aliados de `human`); queda sin portar y sin control.
- **`$get(PARAM1,relationship,ent_me) equals enemy`** (base_monster_shared:1076):
  el motor sólo avisa si el que mató es ENEMIGO del muerto. `avisar` no lo mira.
- **El aldeano conserva un `Cazador`** (pasear, ver enemigos). Sin `HAS_AI` en
  el mod no hay `npcatk_hunt`; aquí piensa con el ciclo por omisión. Hoy no ve
  enemigos (el jugador no lo es), pero es la misma familia y no se ha tocado.
- **El comentario de `huyeDelGolpe`** (reaccion.js) dice «es la vida DESPUÉS
  del golpe» y `herir` le pasa la de antes, que es la del motor (`game_struck`
  antes de `GiveHP`). El código está bien; el comentario no. No se ha tocado.
- **La animación de la huida del guion**: `setmoveanim ANIM_RUN`
  (default_human.script:69). En la sonda el aldeano anda 1,73 m en 2 s, que
  parece paso y no carrera; no se ha medido qué animación lleva.
