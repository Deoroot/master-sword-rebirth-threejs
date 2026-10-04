# `[override]` rehorneado — experimento 97, parte D

El 96 arregló `[override]` en el analizador y el cargador (doc/ARMADURA_96.md
§3) y lo dejó **sin rehornear** a propósito, porque cambiaba el combate de
arañas y zombis. Este experimento rehornea, cuenta qué cambia, lo mide con
bichos de verdad y arregla dos cosas que salieron por el camino: el `//`
pegado a una palabra, y una frase de parry que salía dos veces desde el 91.

```bash
node --test test/override97.test.mjs   # 32 verdes
npm run sonda:override97                # Gate City + gertenheld_forest2: 13 de 13
npm run sonda:override97 -- --antes <guiones.json de antes>   # el control: 14 de 14
```

## 1. La regla, otra vez, y qué horneados dependen de ella

```
if (Name.len() && Override)
  for (int i = 0; i < m.Events.size(); i++)
    if (Name == m.Events[i].Name) { m.Events.erase(i); i--; }
                                              script.cpp:5206-5211
```

Y `#include` llama a `Spawn` sobre **el mismo** `CScript` (script.cpp:5255),
así que un `[override]` borra también lo que trajo un `#include` anterior. Lo
que va detrás con el mismo nombre se queda: sólo mira hacia atrás.

Qué horneados pasan por `partirGuion` + `resolverGuion` (medido con `grep` de
los `import`, no supuesto):

| orden | qué escribe | ¿depende? |
| --- | --- | --- |
| `npm run guiones` (+ `-- --mapa edana`, `edanasewers`, `gertenheld_forest2`, `sala88`) | `build/<mapa>/guiones.json`, eventos YA resueltos | **sí**: rehorneados los cinco |
| `npm run jugador` | `build/msr/jugador.json`, resuelto | **sí**: rehorneado |
| `npm run efectos:guion` | `build/msr/efectosguion.json`, piezas sin resolver | **sí** (la marca `anula` va en las piezas): rehorneado |
| `npm run objetos:guion` | `build/msr/objetosguion.json`, piezas | **sí**: rehorneado (el 96 ya lo había hecho para el `anula`) |
| `npm run bichos:guion` | `build/msr/bichosguion.json` | es un censo, no lo lee el juego; rehorneado |
| `npm run mapa:bichos` | `build/<mapa>/bichos.json` | **no**: lo lee `src/bsp/script.js`, que tiene su propio `[override]` desde antes (`cabeceraDe`, :249-286) y no importa `guion.js` ni el cargador. No se rehorneó |
| `npm run armas`, `npm run suelo` | | **no**: `leerFichaObjeto` de `src/bsp/script.js` |

`guiones` sólo hornea Gate City sin `--mapa` (el 82 ya lo dijo). Los cinco
mapas llevan ahora la marca: Gate City 28 eventos con `anula`, Edana 23, las
cloacas 10, gertenheld_forest2 23, sala88 1.

## 2. El censo

Copias de cada evento con el cargador sin anular (el comportamiento de antes,
reproducido quitando la marca DESPUÉS de analizar) contra el de ahora. Sólo
salen las parejas en que el número cambia: un `[override]` sin nadie delante
con su nombre no cambia nada, y por eso de los 28 de Gate City cambian 10.

| mapa | guion | evento | antes | ahora | qué hacía la copia de más |
| --- | --- | --- | --- | --- | --- |
| Gate City | monsters/spider | `game_parry` | 3 | 1 | la de la plantilla decía «Your attack was dodged!», y la de `spider_base` esquivaba también agarrada |
| | monsters/spider_spitting | `bite1` | 2 | 1 | **un segundo mordisco**: la de `spider_base` llama a `frame_bite1`, que hace otro `xdodamage` |
| | monsters/dwarf_zombie_random, _sword, _bigaxe | `npcatk_flee` | 2 | 1 | la huida entera de la IA; cerrado en `CIERRE_DE_BICHO`, así que **sin efecto** en el juego |
| | monsters/dwarf_zombie_sword, _bigaxe | `pick_weapon_type` | 2 | 1 | el sorteo de arma de la plantilla, que el suyo pisaba después: mismo arma, un `$rand` y un `$get_by_name` menos |
| | monsters/dwarf_zombie_hbow | `darcher_spawn`, `select_ammo` | 2 | 1 | el nacer y la munición de la ballesta ligera, pisados por los suyos |
| | gatecity/generalstore | `say_containers` | 2 | 1 | las tres frases de la plantilla encadenadas con `chat_loop`, detrás de las cuatro del tendero |
| Edana | edana/healer | `game_targeted_by_player` | 2 | 1 | el `helptip` de vendedor de la plantilla |
| | edana/armourer | `vendor_offerstore` | 3 | 1 | la tienda de la plantilla, que se abría sin mirar su `dist <= 90` ni `STORE_CLOSED` |
| cloacas | — | — | | | ninguno cambia |
| gertenheld_forest2 | monsters/skeleton_poison_random | `attack_1` | 2 | 1 | **un segundo espadazo**, como la escupidora |
| | | `check_attack` | 2 | 1 | |
| | monsters/wolf, wolf_alpha | `npcatk_checkflee` | 2 | 1 | cerrado en `CIERRE_DE_BICHO`: sin efecto |
| | NPCs/g_adventurer | `npc_suicide` | 2 | 1 | |
| sala88 | — | — | | | ninguno cambia |
| jugador | — | — | | | ninguno cambia por `[override]` (sus cinco no tienen a nadie delante) |

**Una corrección al 96**, que no es error suyo sino de medida: «28 eventos en 18
guiones» es cuántos `[override]` hay en Gate City; los que **cambian algo**
son 10 en 7.

## 3. Lo que cambió en el juego, medido

### 3.1 La araña gigante esquiva y no te lo dice

`spider.script:63-67` anula `game_parry` con uno que sólo esquiva
(`if !SPIDER_LATCHING` / `playanim critical ANIM_DODGE`). El mensaje «Your
attack was PARRY_TYPE» es del `game_parry` de la plantilla
(base_monster_shared.script:472-475), así que **en Master Sword la araña
gigante para sin decirlo**. La escupidora no lo anula y lo sigue diciendo.

Y aquí salió **un fallo del 91 que no era de `[override]`**. `golpearA`
(src/main.js) y el arco (src/juego/arco.js) escribían «Your attack was …» con
`ia.mensajeDeParry` desde el 86, cuando el bicho no tenía guion y alguien tenía
que decirlo. Desde el 91 el guion corre por la costura y lo dice él: **salían
dos líneas por parada**. Medido en el navegador antes de tocar nada:

| | líneas por parada |
| --- | --- |
| araña gigante, horneado de antes, `main.js` de antes | **2,00** (la plantilla + el relevo) |
| esqueleto de gertenheld_forest2, `main.js` de antes (rotura deliberada) | **2,00** |
| araña gigante, horneado nuevo, `main.js` de antes (rotura deliberada) | 1,00 (sólo el relevo, que el motor no dice) |
| araña gigante, horneado nuevo, ahora | **0,00** |
| araña gigante, horneado de antes, ahora | 1,00 (la de su plantilla) |
| esqueleto, ahora | **1,00** |

El arreglo: `Manada.herir` pasa un objeto por referencia en la costura
`recibe` —como ya hacían `puede` y `ataca`—, `InteraccionesNpc` le pone
`hablaElGuion = true` cuando entrega el `game_parry`, y el relevo sólo escribe
si nadie habló. Sin guion (sin horneado) sigue escribiendo, que es para lo que
nació.

### 3.2 La escupidora muerde una vez

`gspider.mdl` llama a `bite1` (`build/msr/bichosguion.json`, `anim.llaman`).
Antes corrían las dos: la de `spider_base` (:36-38, «backwards compatibility»)
que llama a `frame_bite1` y hace su `xdodamage` (:31-34), y la suya
(spider_spitting.script:87-100), que hace otro y escupe. Navegador: **6
`xdodamage` por 3 `bite1`** con el horneado de antes, **3 por 3** ahora. El
esqueleto venenoso de gertenheld_forest2 tenía lo mismo con `attack_1`
(prueba de Node, §4b).

### 3.3 El tendero

«container» al tendero de Gate City: **7 frases antes** (sus cuatro y, con
retardo, las tres de `base_npc_vendor_confirm.script:270-279`, con la primera
repetida), **4 ahora**. Prueba de Node §5, por `hablaElJugador`, que es por
donde entra el chat.

## 4. El `//` pegado, que el motor corta antes de analizar

Contando las diferencias del rehorneado salieron otras que no eran de
`[override]`. `ParseScriptFile` copia cada línea **hasta el primer `//`** y sólo
entonces llama a `ParseLine`:

```
if (ch == '/' && (p + 1) < pCur && *(p + 1) == '/')
  break;                                       script.cpp:5118-5121
```

El corte de `palabras` (`:5637`, al principio de una palabra) nunca ve un `//`
pegado: ya no está. Aquí sólo existía el segundo, y `test/juego_misiones.test.mjs`
lo daba por regla («`saytext a//b` no se corta»). Cierto de `palabras`, falso
del juego; corrección añadida al lado de esa prueba, sin borrarla.

`src/bsp/script.js` lo hacía bien desde siempre (`sinComentarios`). En el mod
hay 82 líneas así; ninguna con `//` dentro de comillas. Las que alcanzan los
mapas portados son cinco:

| línea | antes | ahora |
| --- | --- | --- |
| `{ [shared] wearing_armor//PARAM1=0\|1 … PARAM3=offset` (player/externals.script:304) | evento «wearing_armor//PARAM1=0\|1» —y con el 96, que se queda con la ÚLTIMA palabra como el motor, «PARAM3=offset»— | `wearing_armor`, el que llama `armor_base_hybrid.script:111` |
| `else//if( … )` (player/player_animation.script:95) | un comando «else//if(», el bloque se cerraba mal y **la cola de `walk_animate` caía en un bloque sin nombre, que corre al nacer** | `else`. `walk_animate` no lo dispara nadie todavía en este puerto |
| `addvelocity ent_laststruckbyme PUSH_VEL//Push…` (monsters/boar_base.script:93) | constante «PUSH_VEL//Push», que no existe | `PUSH_VEL`: el empujón de los tres jabalíes de Edana y del de gertenheld |
| `callexternal GAME_MASTER gm_top_players_reset 1//Redundant?` (chests/base_treasurechest:142) | parámetro «1//Redundant?» | «1» |
| `f//Random merchant` (helena/vendor:1) | comando «f//Random» | comando «f» (los dos desconocidos) |

Y en objetos y efectos, tres `const` cuyo valor llevaba la cola: `MELEE_DMG
220//…` (axes_battleaxe), `ARROW_EXPIRE_DELAY 5//300` (proj_arrow_holy) —los
dos leen igual con `atof`— y `LIGHT_COLOR (1,0.5,2)//(100,33,253)`
(effects/sfx_lightning), que como vector no se leía.

## 5. Las roturas deliberadas

Cada una con `grep` de que estaba puesta y de que se quitó (el 80):

| rotura | qué se puso rojo |
| --- | --- |
| `resolverGuion` sin borrar (`if (false && ev.anula …`) | 17 de Node (antes de existir las de `hablaElGuion` y §4b): las 12 del censo y las tres de comportamiento de override97, y 2 de armadura96. **Las 5 del horneado (§1b) siguieron verdes**, como debe ser: miden el horneado, no el cargador. Con el horneado viejo esas 5 dan rojo por la segunda aserción (ningún `anula` en el fichero); la primera sola no habría visto nada, porque sin la marca no hay pareja que detectar |
| `partirGuion` sin cortar el `//` | 4 de Node (§2) |
| el relevo de `main.js` siempre escribiendo | la sonda: 2 rojos (araña «0 en 9» → 9; esqueleto 16 en 8). Node no lo ve: `golpearA` no tiene prueba de Node |
| `InteraccionesNpc` sin avisar `hablaElGuion` | 1 de Node (§3, «`herir` dice que habló el guion») |

## 6. Tropiezos de la medida

- **El contador que satura.** La primera sonda contaba líneas «Your attack
  was» como «las de ahora menos las de antes» en `probe.misiones.dicho()`, que
  es un anillo de 128. 240 s de mandobles lo llenan muchas veces: dio **0,00
  por parada con el horneado de antes y con el nuevo**. Ahora cada tanda de
  3 s escribe una marca en la consola y se cuenta lo que viene detrás.
- **Dos arañas.** «9 de 11 paradas llegan a su guion»: `estado.parados` es de
  la partida, y la segunda araña de Gate City se acercaba cazando y se llevaba
  algún mandoble. Se mide el guion contra las paradas de SU bicho
  (`quien(n).parados`) y las líneas, que no dicen de quién son, contra las de
  la partida.
- **El cero sin control.** «La araña no dice nada» es un cero; el control
  positivo de la misma pasada es el esqueleto de gertenheld_forest2, que para
  con parry 40, no anula `game_parry` y tiene que leer exactamente una línea
  por parada. Es también el segundo mapa (el 50).
- **Mi propio instrumento rompió una sonda vecina.** Para contar copias amplié
  el filtro de `probe.costura.de(...).rastro` con `bite1` y `game_parry`, y
  `salto93` se puso roja (14 de 15): su control negativo «la cría NO salta ni
  se pega» pide ese `rastro` **vacío**, y la cría muerde. El juego estaba bien;
  el campo compartido había cambiado de significado. Ahora las copias van en un
  campo aparte, `corridos`. *Un campo de la sonda que lee otra sonda es una
  interfaz: ampliarlo es cambiarla* — y lo cazó pasar las vecinas (§3 de
  CLAUDE.md).
- **El árbol compartido.** A mitad de experimento la página no cargaba:
  `src/play/trabas.js`, nuevo de otra sesión, importaba `atof` de
  `src/bsp/script.js`, que lee del disco, y Vite externaliza `node:fs`. Lo
  arregló su sesión; aquí sólo se esperó. El aviso de `src/bsp/script.js:1245`
  ya lo decía.

## 7. La batería vecina, después del rehorneado

`npm test`: **2 835 de 2 836** (0 rojas; la otra es un `todo`). Sondas, con la
máquina compartida por otras cuatro sesiones:

| sonda | resultado |
| --- | --- |
| golpe | 26 de 26 |
| consecuencias | 55 de 55 |
| mordisco92 | 25 de 25 |
| salto93 | 15 de 15 (14 de 15 con mi campo `rastro` ampliado: §6) |
| veneno91 | 15 de 15 |
| guardias94 | 23 de 23 |
| animacion94 | 10 de 10 |
| mundo | 44 de 44 |
| arranque36 | 30 de 30 |
| muerte41 | 41 de 41 |
| edana80 | 21 de 21 |
| edana82 | **16 de 18**: los dos del `env_sound` («la REGLA dice 11» lee 13, dueño 2, en los dos sitios). Tres pasadas iguales. No es de esto: el reparto de sala sale de las entidades del `.bsp` y del ojo del jugador (`unTicDeSala`, src/main.js), y nada de lo tocado aquí pasa por ahí. Los mismos dos sitios dan la misma sala, que huele a que `poner` no ha movido el ojo antes del tic; `src/play/movimiento.js` y `player.js` los tiene a medias otra sesión |
| override97 | 13 de 13 |

Varias necesitaron una segunda o tercera pasada por arranques de Vite que no
llegaban a tiempo (`ERR_CONNECTION_REFUSED`, `page.goto` 30 s) o por un
`waitForTimeout(2500)` de `veneno91` que con la máquina cargada no alcanza a
los bichos de un `msarea_monsterspawn`. Ninguna cambió de número por el
rehorneado.

`npm run insignias`: sólo cambia «script commands», 112 → 115, por comandos
que han añadido otras sesiones; Edana 20/27, Gate City 23/25 y los menús
239/262 no se mueven con `[override]`.

## 8. Pendiente

- **Con servidor la frase sigue saliendo dos veces.** El cliente escribe el
  relevo en `case "para"` (src/main.js) y el guion del bicho corre en el
  servidor, cuyo `playermessage` también llega. El suceso `para` tendría que
  viajar con `hablaElGuion`. No se tocó: `src/red/partida.js` lo estaba
  editando otra sesión, y no está medido.
- **La esquiva de la IA no mira `SPIDER_LATCHING`.** `Manada.herir` pone
  `ia.esquiva` en toda parada (es el `game_parry` de `spider_base`), y la araña
  gigante, cuyo guion SÍ lo mira, también recibe su `playanim` por el guion: la
  esquiva va por dos caminos. Agarrada no debería esquivar. Sin medir.
- **«%s parries the attack!»** del motor (giattack.cpp:1970,
  `paradaDelObjetivo`) sigue sin llamarlo nadie.
- **La tienda del armero de Edana** abre ahora sólo a 90 unidades o menos y
  respeta `STORE_CLOSED`: no hay sonda que lo haya pisado (las de tienda son de
  Gate City).
- **El empujón del jabalí** ya tiene su constante; no se ha medido que empuje.
- **`walk_animate`/`game_animate`** del jugador se analizan bien ahora, pero
  este puerto no los dispara.
