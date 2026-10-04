# La armadura puesta — experimento 96

Hasta aquí nada en `src/` leía `BARMOR_PROTECTION`: lo único que tocaba el daño
al recibirlo era el escudo (`src/play/escudo.js`). Este experimento porta la
protección de la armadura vestida, la resistencia al fuego del fénix, el
aturdimiento del yelmo y el requisito de fuerza, con los fallos del original.

```bash
node --test test/armadura96.test.mjs   # 20 verdes
npm run sonda:armadura96               # sala88 por el menú, la rata: 16 de 16
npm run objetos:guion                  # hornea ya las 65 armaduras y yelmos
```

## 1. Lo que se leyó antes de escribir

**La protección no la calcula el motor: la calcula el guion de la pieza.**
`CBasePlayer::TraceAttack` sortea una zona, recorre todo lo que llevas y luego
pasa al parry:

```
Damage.iHitGroup = m_LastHitGroup = RANDOM_LONG(0, HUMAN_BODYPARTS - 1);  player.cpp:398
for (int i = 0; i < Gear.size(); i++) Gear[i]->OwnerTakeDamage(Damage);   player.cpp:403-404
Damage.flDamage = CMSMonster::TraceAttack(Damage);                       player.cpp:410
```

`OwnerTakeDamage` (giattack.cpp:1161-1176) hace dos cosas: si es armadura y está
puesta, `Armor_Protect`; y a toda pieza, `game_takedamage` con el golpe en
`m_CurrentDamage` para que el guion lo cambie con `setdmg` (genericitem.cpp:
2174-2191).

`Armor_Protect` resta `flDamage * ((100 - Protection) * 0.01)` (giarmor.cpp:112)
con `Protection = atof(ARMOR_PROTECTION)` leído en `registerarmor`
(giarmor.cpp:31). Y la plantilla de todas las armaduras escribe, justo antes:

```
setvard ARMOR_PROTECTION 0        items/armor_base.script:37
registerarmor                                               :41
```

O sea que el C++ multiplica por 1 siempre. Lo que protege es el
`game_takedamage` de la plantilla (armor_base.script:191-238):

- `DMG_REDUCT = 1 - BARMOR_PROTECTION * 0.01`, calculado en `game_spawn`
  (`:47-51`). `BARMOR_PROTECTION 55%` pasa por `multiply`, que es `atof` y se
  come el `%`: el fénix deja **0,45**.
- tipo que **contiene** `poison` → **× 0,5** («armor no longer protects against
  poison but we are reducing all poison damage 50% to compensate», `:219-228`).
- si no, y el atacante no tiene `NPC_IGNORES_ARMOR`, × `DMG_REDUCT` (`:232-236`).
  Esa variable **no la declara ningún NPC** en los 2 884 guiones: sólo aparece
  en `armor_base` y `armor_base_new`.

**La zona no cuenta (fallo del original, portado).** La comprobación que miraba
`iHitGroup` está comentada en `Armor_Protect` (giarmor.cpp:85-101, «no go
BodyPartIdx udeclared identifier»). `BARMOR_PROTECTION_AREA "chest;arms;legs"`
sólo decide qué se dibuja (`m_WearModelPositions`). Una coraza protege la
cabeza. Por eso el puerto no sortea zona: sería un dado sin efecto.

**El yelmo no protege del daño (fallo del original, portado).**
`armor_helm_gray` declara `BARMOR_PROTECTION 60%`, pero incluye
`armor_base_helmet`, que no incluye `armor_base`: ni `registerarmor` ni
`game_takedamage`. Su 60 % no lo lee nadie. Lo que sí hace es
`callexternal ent_owner set_stun_prot 0.3` (armor_base_helmet.script:85-104),
que en el guion del jugador es `takedmg stun 0.3` (player/externals.script:
250-252), y avisa «Your stun resistance is now 70%» (`:76-83`).

**Varias piezas se multiplican**: cada `game_takedamage` lee el daño que dejó
la anterior (`PARAM3`) y lo reescribe. En la práctica no hay dos: todas las
armaduras de cuerpo piden `chest`, que tiene una plaza
(player/player_sh_stats.script:11), y el yelmo no suma nada.

**Dónde cabe** — `CGenericItem::CanWearItem`, genericitem.cpp:1035-1120, con
las plazas de `game_reset_wear_positions` (player_sh_stats.script:6-30). Lleva
un fallo: suma `pItemWorn->m_WearPositions[iloc].Slots` (`:1088`) con el índice
de la pieza NUEVA. Como todas las plazas valen 1 (64 `wearable 1` y 2
`wearable 0` en todo el juego) y todas las armaduras empiezan por `chest;arms`,
en los datos del juego no se da nunca; se nota sólo leyendo fuera de la lista,
y ahí el motor lee memoria cualquiera (`mslist` no comprueba,
stackstring.h:86-89). El puerto pone 0 y lo dice.

**El orden de ponérsela** (`WearItem`, genericitem.cpp:1123-1145): primero
`game_wear` (`:1135`) y después `m_Location = ITEMPOS_BODY` (`:1139`). Mientras
corre `game_wear` la pieza no está puesta; lo que quiere hacer «puesta» lo
aplaza con `callevent 0.1`.

**La fuerza no impide ponérsela.** `game_wear` mira
`$get(ent_owner,stat.strength) < ARMOR_STR_REQ` (armor_base.script:99-100) y a
la décima, si sigue puesta, saca la ventana «Insufficient Strength for Armor» /
«You are too weak to move freely in this armor. (Min Strength 40)» y aplica
`effects/effect_slow 10.0 50%`, cada diez segundos (`:173-182`).
`stat.strength` es `GetNatStat` = `GetStat(i, 0)` (msmonster.h:415,
scriptcmds.cpp:1606-1622), que es `atributosDe` de src/juego/stats.js.

**El fuego del fénix** (armor_pheonix55.script:90-103): su `[override]
elm_activate_effect` pide `skill.spellcasting.fire`. Con menos de 20 dice «You
lack the fire skill to activate this armor's magic.»; con más de 20 registra
`ext_register_element phonx fire 75`, que el guion del jugador convierte en
`takedmg fire 0.25` y «Your resistance to fire is now 75%»
(player/server/element_resist.script:26-122). **Con 20 justo no pasa nada**: ni
mensaje ni resistencia (`< 20` y `> 20`). Fallo del original, portado y con
prueba.

## 2. Lo portado, y dónde

- **`src/play/armadura.js`** — la regla: `puedeVestir` (con el fallo del
  índice), `vestir` (en el orden de `WearItem`), `golpeContraLaArmadura` (el
  bucle de `OwnerTakeDamage`) y `seVisteAlCargar`. No tiene tabla de
  porcentajes: corre el guion de cada pieza.
- **`src/play/escudo.js`** — `defensaDelJugador` recibe `equipo` y `atacante` y
  pasa la armadura antes del escudo. Las dos son multiplicaciones, así que el
  orden entre ellas no cambia el daño.
- **`src/play/guionobjeto.js`** — la entidad sabe si está puesta (`puesto`,
  `$get(ent_me,is_worn)`), registra armadura, cambia el golpe en curso
  (`setdmg`), contesta `stat.*`, `scriptvar` (el nombre si no existe, como
  `GetFirstScriptVar`), `$get_takedmg` y las banderas de su dueño, y le pasa
  `infomsg` y `applyeffect`.
- **`src/play/guion.js`** — dos comandos nuevos con gancho (`registerarmor`,
  `setdmg`) y un getter (`$neg`).
- **`src/main.js`** — `golpear` pasa lo que llevas (`objetosVivos`, en el orden
  en que lo cogiste) y quién pega; `vestirObjeto` es la puerta para ponérselo;
  `sincronizarObjetosVivos` no viste al cargar una armadura que está en la
  mochila.
- **`tools/objetosguion.mjs`** — hornea las 65 armaduras y yelmos, que no los
  vende ninguna tienda de los dos mapas.

**El documento de personaje gana un campo**: `puesto: true` en la entrada de
`personaje.objetos`. `abrirPersonaje` conserva lo que no conoce, así que no
hace falta versión nueva; `tools/personaje.mjs` lo puede escribir para dar un
personaje con la armadura ya puesta.

## 3. Dos huecos del intérprete que salieron por el camino

**`[override]` no anulaba nada.** El analizador leía la primera marca entre
corchetes como ámbito y la palabra de detrás como nombre: `{ [override]
elm_activate_effect` salía con ámbito «override», y el cargador metía los dos
eventos. El motor borra al analizar todos los eventos anteriores con ese nombre,
también los de un `#include` anterior (script.cpp:5180-5191 y 5208-5213). Con
el fallo, el fénix corría su evento —que pide fuego > 20— **y** el de
`base_elemental_resist`, que no pide nada: daba la resistencia a cualquiera.
Arreglado en `partirGuion` (src/play/guion.js) y `resolverGuion`
(src/play/cargador.js).

**Esto cambia más que la armadura, y NO está rehorneado.** Medido en
`build/gatecity/guiones.json`: **28 eventos `[override]` en 18 guiones** que
hoy corren junto al del padre. Entre ellos `game_parry` ×3 de la araña,
`bite1` ×2 de la araña escupidora, `npcatk_flee` y `pick_weapon_type` ×2 de los
zombis enanos y `say_containers` ×2 de la tienda. Edana tiene 23. El código ya
está arreglado; los horneados de NPC, jugador y bichos siguen con el defecto
hasta que alguien pase `npm run guiones` (y `jugador`, `bichos:guion`). No lo
hice aquí porque cambia el combate de las arañas y los zombis, que miden otras
sondas, y eso merece su propio experimento.

**`$neg` no existía.** `cat_resistances` del guion del jugador
(element_resist.script:87) hace `$neg(ITEM_RESIST_AMT)`; sin el getter la suma
salía sin restar y **ninguna resistencia elemental llegaba nunca a `takedmg`**:
el jugador leía «Your resistance to fire is now 0%» con la resistencia
registrada. `$neg` es `RETURN_FLOAT(-atof(Params[0]))` y «0» sin parámetro
(script.cpp:3461-3471).

## 4. Lo medido

Prueba de Node (`test/armadura96.test.mjs`, 20 verdes). Entra como el juego:
`crearPersonaje`, la pieza en `personaje.objetos`, `GuionDeObjeto` con su guion
horneado y `arrancar` como en `sincronizarObjetosVivos`, `vestir`, y el golpe
por `defensaDelJugador`. Con `build/msr/jugador.json` y los efectos horneados.

| caso | resultado |
| --- | --- |
| fénix puesto, golpe de 10 | 4,5 |
| fénix en la mochila (control positivo) | 10 |
| fénix puesto, `poison_effect` | 5 |
| fuego 0 | «You lack the fire skill…», fuego × 1 |
| fuego 25 | «Your resistance to fire is now 75%», fuego × 0,25 |
| fuego 20 | nada, fuego × 1 |
| fuerza 2 | a la décima la ventana y `effect_slow` |
| fuerza 40 justa | sin ventana |
| yelmo gris puesto | 10 (no protege), `stun` 0,30, «…now 70%» |
| fénix + cuero | «You have no more chest slots» |

Sonda (`sondas/armadura96.mjs`, **16 de 16**). sala88 por el menú, la rata que
muerde por su guion (`dodamage` fijo, sin dado):

- sin armadura: tres mordiscos, «0.4 damage.» y 0,4 de vida cada uno;
- con el fénix puesto: tres mordiscos, `golpear` deja 0,40 → **0,18**, la
  consola dice «0.2 damage.» y la vida baja 0,18 cada vez;
- el cuero encima: «You have no more chest slots» en la consola;
- la ventana «Insufficient Strength for Armor … (Min Strength 40)» y «You lack
  the fire skill…».

Un tropiezo de la sonda, para el cuaderno: el primer mordisco con armadura
leyó **0 de vida perdida**. La consola y la vida se leían en dos `evaluate`
seguidos y el mordisco cayó entre los dos, así que la vida perdida se apuntó al
anterior. Se leen en la misma llamada.

Y otro: el control «× 0,45» salió rojo con el trabajo bien hecho, porque la
rata pega 0,4000000059 (un `float`) y al guion le llega como texto con «%.2f»
(`FloatToString`, sharedutil.h:49): 0,40 × 0,45 = 0,18 justo. El control
compara contra eso.

## 5. La rotura deliberada

Cada una con `grep` de que estaba puesta:

| rotura | qué se puso rojo |
| --- | --- |
| no llamar a `game_takedamage` | 4 pruebas de Node |
| `[override]` sin borrar | 2 (fuego 0 y fuego 20) |
| `$neg` quitado | 2 (fuego 25 y su mensaje) |
| `is_worn` siempre «1» | 2 (mochila, y cuero encima). **Con la primera versión del bucle salía VERDE**: sólo llamaba a lo puesto, así que la guarda del guion no mandaba. Ahora se llama a toda pieza que registró armadura y corta su `if $get(ent_me,is_worn)`, como en el motor |
| `golpear` sin `equipo` (main.js) | la sonda, 4 rojos (12 de 16); las 20 de Node, verdes — la costura sólo la ve la sonda |
| `puesto = true` antes de `game_wear` | **nada**. En este puerto ningún `game_wear` de armadura mira `is_worn` en la misma llamada; se conserva por fidelidad y no se cuenta como verde |

## 6. Pendiente

- **Ponérsela jugando.** En Master Sword te la pones usándola desde la mano
  (`UseItem`, genericitem.cpp:972-994). El panel del inventario de este puerto
  todavía no mueve objetos, así que hoy sólo la pone `probe.armadura.vestir` o
  un personaje que la traiga puesta. Quitársela (`game_remove`,
  `barmor_effect_remove`) tampoco está.
- **Con servidor no hay defensa.** `Partida._bichoPega` (src/red/partida.js)
  resta el daño a pelo: ni armadura, ni escudo, ni parry.
- **La resistencia al fuego en un golpe de bicho.** Se registra en el guion del
  jugador y la aplica `recibirDano` (daño de efectos), pero `golpear` no pasa
  por las resistencias del jugador (`CMSMonster::TraceAttack`,
  msmonsterserver.cpp:2269-2281): un mordisco con tipo `fire` no se reduciría.
  En los dos mapas no hay ninguno.
- **El aturdimiento** se registra (`takedmg stun 0.3`) pero no lo lee nadie:
  el aturdimiento del jugador no está portado.
- **`effect_slow`** se aplica (está en la lista de efectos del jugador), pero
  no se ha medido que frene al jugador.
- **El fénix que resucita** (armor_pheonix55.script:36-84): con fuego ≥ 15, un
  golpe de fuego mortal te devuelve la vida y te da maná. Corre por su guion;
  no tiene prueba porque no hay daño de fuego que llegue por `golpear`.
- **El `game_takedamage` de las armas** (astas, mandobles, 15 guiones): el
  motor se lo manda a todo el `Gear` y aquí no.
- **Rehornear** NPC, jugador y bichos con el `[override]` arreglado (§3).
