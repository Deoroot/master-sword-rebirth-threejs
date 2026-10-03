# Experimento 94 — pegar a un aldeano, y que venga el guardia

**El encargo:** en Master Sword pegar a un aldeano tiene consecuencias —grita,
y el guardia que lo oye viene a por ti— y en el port no pasaba nada. Ver qué
pieza no conecta y portarla, en un jugador y con servidor.

**Lo que se encontró:** que no faltaba UNA pieza sino CUATRO, y las cuatro
estaban entre piezas que ya funcionaban (el 63). El `callexternal all` del 81,
la costura de combate del 91-92, el `$cansee` del 81 y el `Cazador.apuntarA`
del 28 estaban todos en verde; lo que no había era el viaje entre ellos. Y al
abrir la primera salió una quinta, que el 91 había dejado escrita como aviso:
«You've slain game.monster.name.full».

## 1. La cadena del mod, leída en los guiones (no en el resumen del encargo)

`NPCs/default_human.script:29` y `NPCs/default_dwarf.script:33` incluyen
`monsters/base_civilian`. En Gate City son **4 humanos y 12 enanos**
(`build/gatecity/bichos.json`); en Edana, los 3 `NPCs/default_human`.

```
monsters/base_civilian.script
  :3-6    { game_struck      callevent call_for_help $get(ent_laststruck,id) }
  :8-16   { call_for_help    saytextrange 1024
                             saytext <uno de cuatro, $rand(1,4)>
                             callexternal all civilian_attacked PARAM1 $get(PARAM1,isplayer) }
  :18-21  { game_death       callexternal all civilian_attacked $get(ent_laststruck,id) $get(ent_laststruck,isplayer) }
```

Los cuatro gritos (:11-14): «Help! Help!», «Guards! Call the guards!», «Save
me!», «Help! Help! I'm being repressed!».

Quién oye `civilian_attacked`: en los 2 884 guiones, **tres**
(`gatecity/guard`, `monsters/base_guard_friendly_new`, `helena/helena_npc`).
El de Gate City **no** usa la plantilla —`//include
monsters/base_guard_friendly_new - not working for some damned reason`
(gatecity/guard.script:22)— sino su propia copia:

```
gatecity/guard.script
  :15      const BG_MAX_HEAR_CIV 1024
  :105-124 { [server] civilian_attacked
             local OFFENDER PARAM1
             if $get(OFFENDER,race) isnot hguard          // :109
             if $get(OFFENDER,range) <= BG_MAX_HEAR_CIV   // :110
             if NPCATK_TARGET equals unset                // :112
             setvard NO_STUCK_CHECKS 0
             callevent npcatk_settarget PARAM1            // :114
             if $cansee(NPCATK_TARGET)                    // :116
             saytextrange 1024
             saytext <una de cuatro>                      // :120-123 }
```

La copia de Gate City **no** tiene el `if !NPC_MOVING_LAST_KNOWN` de la
plantilla (base_guard_friendly_new.script:153). Y las cuatro guardas son `if`
VIEJOS (el 67): la que falla abandona el bloque entero. Dos detalles que el
resumen del encargo no decía:

- **La distancia es al QUE PEGA, no al aldeano**: `$get(OFFENDER,range)` desde
  el guardia, y `OFFENDER` es `PARAM1`, el atacante. Es `range`, o sea con la
  resta de anchuras de scriptcmds.cpp:1151-1152: el guardia mide 32, el
  jugador 0 (el 93), así que oye hasta 1 040 unidades de centro a centro.
- **En el Gate City horneado el guardia no oye a nadie de salida.** El aldeano
  humano más cercano está a **1 185 unidades** (medido en la sonda; 1 179 en el
  horneado), y con la espada a 60 quien le pega queda a más de 1 100 del
  guardia. Los aldeanos pasean (`roam`), así que en una partida el caso existe
  cuando uno se acerca; de salida, no.

## 2. Por qué no pasaba: las cuatro piezas

Medido antes de tocar, con una `Partida` + `Fauna` y los guiones horneados de
Gate City (el mismo montaje que `test/guardias94.test.mjs`): un `PEGAR` al
aldeano daba `costura.noDeCombate: 1`, el guion del aldeano ni existía, y el
guardia seguía con `NPCATK_TARGET unset` y `objetivo null`. Ningún texto.

| # | pieza | dónde | qué pasaba | ahora |
| --- | --- | --- | --- | --- |
| 1 | el golpe no llegaba al guion del aldeano | `InteraccionesNpc._alCombate` | `if (!esDeCombate(i)) { noDeCombate++; return; }`: un NPC sin daño en la ficha no recibía nada, y el 91 lo dejó dicho («en el motor también reciben `game_struck` y aquí todavía no») | `recibe` y `muere` le llegan (`TraceAttack`/`TakeDamage`/`Killed` son de `CMSMonster`, msmonsterserver.cpp:2311, :2385, :2605); se cuentan en `costura.aldeanos`. Su guion corre sin cierre: no tiene IA de caza que duplicar |
| 2 | `ent_laststruck` no se resolvía | `entornoDe`, `esElJugador` | a propósito desde el 91, por el «You've slain» (ver §3); `$get(ent_laststruck,id)` daba «0» | `StoreEntity(pAttacker, ENT_LASTSTRUCK)` antes de `game_struck` (msmonsterserver.cpp:2380-2385): la costura lo apunta en `entorno.golpeadoPor`, sólo si el golpe no se para |
| 3 | el guardia no sabía de quién le hablaban | `todosLosGuiones`/`guionDeOtro` | cada `GuionDeNpc` sólo reconoce al jugador que tiene atado (`jugador`), y el guardia no tenía ninguno: `$get(OFFENDER,range)` medía **al propio guardia** (0 − 16, siempre dentro) y `$cansee` no tenía a quién mirar | `atarAlJugadorDe`: quien recibe una llamada de otro guion queda atado al jugador del que llama, sin el `origen` de un menú viejo (se lee vivo) |
| 4 | `npcatk_settarget` estaba cerrado | `CIERRE_DE_BICHO` (el 91) | el guion lo pedía, se contaba en `cerrados` y la IA no se enteraba; además `NPCATK_TARGET` seguía «unset» y `$cansee(unset)` abandonaba el bloque | `_objetivoPedidoDeFuera`: **cerrado dentro de la costura, abierto cuando viene de fuera** (ver abajo) |

Y una quinta, pequeña: `$get(<jugador>,race)` daba «0». Ahora «human»
(`race human`, player/player_main.script:102; `_strlwr(pMonster->m_Race)`,
scriptcmds.cpp:1390). No cambiaba el resultado —«0» tampoco es `hguard`— pero
era un verde por casualidad. **Sólo el jugador**: la raza del propio NPC
(`$get(ent_me,race)`, `game.monster.race`) abre ramas de `game_spawn`
(base_npc.script:34-40: `NPC_FRIENDLY`, `NPC_FIGHTS_NPCS`) que nadie ha medido,
y sigue en «0».

### La regla del cierre, partida en dos

El 91 cerró `npcatk_settarget` porque «elegir objetivo lo hace la IA», y para
las llamadas que el bicho se hace A SÍ MISMO es verdad: su caza, su
`game_struck`, su `npc_targetsighted` tienen copia portada. Lo que la IA no
puede saber es lo que le cuenta OTRO guion. Así que:

- **dentro de la costura** (`enCostura > 0`, un evento de combate del propio
  bicho): sigue cerrado, como en el 91;
- **viniendo de fuera** (`desdeFuera > 0`: la llamada entró por
  `GuionDeNpc.llamar`, que es por donde llegan `callexternal` y el
  `ms_npcscript`): se pasa a la IA con las dos guardas de
  base_npc_attack_new.script que se pueden decidir aquí —`if !IS_FLEEING`
  (:403) e «ignore allies» (:420)— y se escribe `NPCATK_TARGET` con
  `apuntarObjetivo` (:445, :508-509), la misma de la costura al atacar.

No porta `npcatk_targetvalidate` (:447; el guardia no tiene
`npc_targetvalidate`) ni el `cycle_up` (:470; el reloj de la IA, que
`Cazador.apuntarA` ya pone a cero). Se cuenta en `costuraCuenta.deFuera`.

La traducción de asa a id de la manada («jugador» en un navegador, «j3» con
servidor) la apunta la costura cada vez que pasa un golpe de un jugador
(`_idPorAsa`); `Manada.fijarObjetivoPorGuion` es quien llama a `apuntarA`.

## 3. Lo que salió al abrir `ent_laststruck`

El 91 lo dejó escrito en `esElJugador`: resolver `ent_laststruck` haría correr
el «You've slain» de `game_death` (base_npc.script:192-197) con
`game.monster.name.full` sin portar. **Se midió y era verdad**: al matar al
aldeano salía, en verde, «You've slain game.monster.name.full».

Lo que se hizo no fue volver a cerrarlo, sino portar `name.full`:
`SPEECH::NPCName` (scriptcmds.cpp:1475; syntax.cpp:32-49) es el prefijo, un
espacio y el nombre, y el prefijo es lo que va antes de la barra en
`name a|Goblin` (scriptcmds.cpp:4384-4388). La ficha horneada guarda el `name`
crudo, con la barra. Va para TODOS los NPC y no sólo los que tienen cuerpo,
porque el aldeano no tiene y es el primero que muere con su `game_death` entero.

Ahora al matar a un aldeano sale **«You've slain Commoner»**, y al matar a un
goblin, «You've slain Goblin». **Es una línea nueva en pantalla**, y es del mod:
`NPC_AUTO_DEATH` es `const 1` en base_npc.script:12, y la línea no estaba en el
port en ninguna forma (`mensajesdecombate.js` quitó en su día un «You killed X»
que era nuestro; éste no lo es).

## 4. Cómo se mide

**`test/guardias94.test.mjs`**, con servidor: `Partida` + `Fauna` + los
guiones y fichas horneados de Gate City, y un mensaje `PEGAR`. Nada se
construye a mano: ni el asa, ni la llamada, ni la distancia (el 59).

- guardia a 3 m: te apunta (`objetivo === "j1"`), `NPCATK_TARGET` es tu asa,
  `deFuera.npcatk_settarget === 1`, un grito de los cuatro y una frase de las
  cuatro, firmadas;
- al matarlo: el guardia también viene (el golpe que mata pasa por
  `game_struck`, msmonsterserver.cpp:2376-2406) y sale «You've slain
  Commoner», sin ningún `game.monster` en pantalla;
- **control negativo, distancia**: guardia a 40 m (≈1 575 u): el aldeano grita
  —control positivo de que la cadena llegó al `callexternal`— y el guardia ni
  apunta ni habla;
- **control negativo, víctima**: pegar a un goblin junto al guardia no lo
  alerta, con el `game_struck` del goblin recibido como control positivo;
- la guarda de :112: con objetivo puesto, el segundo grito no le hace hablar.

**`sondas/guardias94.mjs`** (`npm run sonda:guardias94`), un jugador, por el
menú, a espadazos (`golpe.atacar`, no `pegarA`): **14 de 14**.

```
aldeanos humanos y su distancia al guardia: 1185, 2120, 2410, 2907 u
1) aldeano a 1185 u del guardia: vida 25 -> 23.6, jugador a ~1180 u del guardia
   -> grita 1, guardia objetivo null, 0 frases
2) aldeano llevado a 3 m: vida 25 -> 24.04, jugador a ~133 u del guardia
   -> «Guards! Call the guards!», guardia objetivo jugador, «Hey you! Leave him alone!»
3) el guardia anda 3.64 m en 3 s ('run'), objetivo jugador
```

El caso positivo necesita **llevar** a un aldeano junto al guardia
(`probe.ia.llevar`, nuevo, que sólo cambia el sitio): el mapa no lo trae (§1).
El negativo sale del mapa tal cual. La frase se busca en el anillo entero de la
consola, sin espacios y con la firma pegada, porque la consola parte las líneas
largas (el 81) y «Halt! We'll have no trouble making around here!» no cabe.

## 5. Las roturas deliberadas, verificadas con `grep`

| rotura | Node (`guardias94.test`) | sonda |
| --- | --- | --- |
| `_objetivoPedidoDeFuera` devuelve siempre `false` | **4 rojas de 6** (te apunta, al matarlo, la guarda de :112, el padre) | **11 de 14**: objetivo, frase y «se mueve» en rojo |
| `g.entorno.golpeadoPor = quien` comentada | **4 rojas de 6** | — |
| `atarAlJugadorDe` sin efecto | **4 rojas de 6**, y entre ellas **el control negativo de los 40 m** | **14 de 14: VERDE** |

La última fila es la que hay que leer. **En un navegador `atarAlJugadorDe` no
hace nada**, porque el guardia ya conoce al único jugador: la costura le ata el
jugador en CADA pregunta de la caza (`puede`, `caza`, el 93), que corren en
cada pensamiento. Con servidor eso no pasa —sin objetivo, esas preguntas no
traen jugador— y entonces el guardia medía la distancia contra sí mismo:
**con la rotura puesta, el guardia a 40 m venía igual**. Es el 50 otra vez: con
un solo jugador el valor correcto y el de reposo coinciden, y el control que la
caza es el de Node, con servidor. Un control que en la sonda no puede fallar
no se cuenta como suyo.

## 6. Las pruebas enteras y las sondas vecinas

- `npm test`: **2 586 de 2 588**, 1 roja y 1 `todo`. La roja es
  `test/red_27.test.mjs` («una partida entera por un socket de verdad»), que
  en la pasada completa **se cuelga** —hubo que matarla— y sola da **49 de 49
  en 1,8 s**. En la máquina había procesos `red_27` colgados desde las 09:53,
  de pasadas de otras sesiones; no se ha diagnosticado más.
- `sonda:mundo` **44 de 44**, `sonda:golpe` **26 de 26**.
- `sonda:consecuencias`: con el arreglo puesto, **52 de 53** la primera
  pasada y **53 de 53** las dos siguientes; con `ent_laststruck` desactivado a
  propósito, 53 de 53 en la única pasada. La roja era «y la esquiva se le queda puesta al pararlo»
  con `'attack'`: el control lee la animación de la araña en el instante en que
  acaban 240 s de mandobles, con la araña atacándote todo ese rato, y acepta
  `dodge/idle/walk/run` pero no `attack`. Es un dado de cuándo acaba la
  ventana; lo que `ent_laststruck` abre en la araña (`cycle_up`,
  base_npc_attack.script:237-241, que sólo pone `CYCLE_TIME`) no toca
  animaciones. Se deja dicho como sospechoso de ruido, no como verde.

## 7. Lo que queda

- **El grito y la frase con servidor van a UN cliente.** `saytext` de un NPC
  sale por `suceso` → `_aQuienHabla()` (src/red/partida.js), que durante la
  costura es el que pega. En el motor es a todos los que estén a
  `saytextrange` (1 024 aquí), y `saytextrange` no está portado (se apunta).
- **Dos huidas en el aldeano.** Con el golpe llegando a su guion, el aldeano
  corre `setmovedest ent_laststruck 1024 flee` (NPCs/default_human.script:66-71),
  que es la huida del mod. Pero la IA portada ya le hacía huir por
  `reaccionAlGolpe` (`huir.probabilidad 100`), y en el motor `default_human` NO
  incluye `base_npc_attack`, o sea que esa segunda huida no existe allí. La
  ficha del aldeano trae los valores por omisión de la plantilla de ataque; no
  se ha tocado.
- **Matar a un aldeano no avisa a sus aliados en el motor** (`if HAS_AI`,
  base_npc.script:170, y el aldeano no tiene IA de ataque) y aquí `Manada.avisar`
  avisa a todo el que tenga cazador. Para el guardia no cambia nada (`hguard`
  no es aliado de `human`), pero es otra divergencia de la misma familia.
- **Edana no tiene quien oiga.** `edana/mayorguard` y `edana/msqguard` no
  tienen `civilian_attacked`; los tres aldeanos gritan y nadie viene. Es lo
  que hace el mod.
- **`$get(ent_me,name)` devuelve el `name` crudo**, con la barra («|Kendra»).
  `DisplayName()` es sólo lo de después (scriptcmds.cpp:4384-4420). No se ha
  tocado: `name.full` ya lo parte bien.
- **`$get(<otro NPC>,race)`** sigue en «0»: un guardia que pega a un aldeano
  sería «no hguard» y sus compañeros irían a por él. En el mod, no
  («collateral damage», :109). Hoy ningún guardia de Gate City pega a nadie.
- **`npcatk_targetvalidate`** no se porta en el puente; el guardia de Gate City
  no lo usa, otros guiones que reciban `npcatk_settarget` de fuera sí podrían.
