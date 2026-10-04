# Experimento 99, parte R — el `if` viejo y `local` por evento, aplicados

> `node --test test/guion99.test.mjs` · `npm run armas` · `npm run objetos` ·
> `npm run escudos` · `npm run suelo` · `npm run sondas -- -j 1 armas99 arco`

El 98 (parte K, [ARMAS_98.md](ARMAS_98.md)) midió dos reglas del intérprete de
guiones que el lector de objetos del horneado no cumplía, y las dejó sin
aplicar porque cambiaban armas que medían otras sondas. **El usuario decidió en
el 99 imitar a MSR aunque las armas pierdan ataques.** Esto es eso.

## 1. Las dos reglas, en el motor

**El `if` viejo.** Un `if` sin paréntesis que falla abandona el resto de la
lista de órdenes en que está:

    else if (Cmd.m_Conditional) {
        if (!Cmd.m_NewConditional)
            break; //Old if command.  Breaks event execution on failure      script.cpp:5754-5757

Dentro de un `{ }` abandona ESE `{ }` (el `break` sale del bucle de la
recursión, :5752, y quien llamó sigue). Un nombre que nadie declara vale su
propio nombre (script.cpp:4741-4747) y `atoi` de un nombre es 0, así que `if
!CUSTOM_ATTACK` es cierto si el arma no declara la constante
(`ScriptCmd_If`, scriptcmds.cpp:3963-3978).

**`local` es del evento.** `local` escribe en el evento (`Event.SetLocal`,
scriptcmds.cpp:6577-6578) y al acabar el evento se borra todo
(`Event.m_Variables.clearitems()`, script.cpp:5696). `RegisterAttack` lee los
`reg.attack.*` con `GetFirstScriptVar` → `GetVar` → `m.CurrentEvent->GetLocal`
(script.cpp:5949-5955, :4404; giattack.cpp:480-614), o sea los del evento EN
CURSO. Un `callevent` sin retraso no los pierde al volver:
`RunScriptEventByName` guarda y repone `m.CurrentEvent` (script.cpp:5013,
:5025) — lo miré porque `Script_ExecuteEvent` pone `m.CurrentEvent = NULL` al
acabar (:5699), y si nadie lo repusiera un `registerattack` después de un
`callevent` no vería nada. Lo repone. Un atributo sin poner vale su nombre:
`atof` da 0, `reg.attack.type` cae en strike-land (giattack.cpp:605-607) y
`reg.attack.keys` es la cadena «reg.attack.keys», que no casa con ninguna tecla.

## 2. Dónde corre el intérprete, y cuál cumplía qué

| capa | `if` viejo | `local` por evento |
| --- | --- | --- |
| `Guion` (src/play/guion.js): NPC, objetos, jugador, efectos | sí, desde el 67 (`ejecutarLista`) | sí (`ejecutarEvento`, un `ev.locales` por evento) |
| `variablesAlNacer` (src/bsp/script.js): fichas de bicho al hornear | sí, desde el 93 (`siViejo`) | sí (un `Map` por evento) |
| `caidaDe` (src/bsp/script.js): submodelo del suelo | sí, desde el 71 | sí (sus `vars` son de una llamada = un evento) |
| `leerRazas`, `tools/cuerpo.mjs` | — (un solo evento, sin `if`) | — (un solo evento) |
| **`recogerObjeto` / `leerFichaObjeto`** (armas, objetos, escudos, suelo) | **apuntado, no aplicado** | **no** |

O sea que sólo faltaba la última fila, y es la que se ha cambiado:

- `acc.ataque` (y `reg.proj.*`, que ahora se fotografía al hacer
  `registerprojectile`) se vacía al empezar cada bloque-evento.
- `leerFichaObjeto` tira el ataque si una de sus condiciones viejas sale
  FALSA (`ataquesTrasIfViejo` sigue diciendo cuáles). Las que no sabe evaluar
  no tiran nada y van a `ataquesTrasIfDudoso`.
- `condicionDeAtaque` aprende la regla del nombre sin declarar, pero sólo si le
  pasan la lista de nombres que algún `local`/`setvar`/`setvard`/cuenta pone en
  el objeto (`acc.nombresVariables`): sin esa lista sigue contestando `null`,
  como en el 98. Con ella, las 404 condiciones viejas que antes quedaban sin
  decidir (`!CUSTOM_REGISTER_NORMAL` en 136 armas, `!CUSTOM_REGISTER_CHARGE1`
  en 103...) salen todas ciertas: **ningún ataque cambia por esto**, y
  `ataquesTrasIfDudoso` queda vacío en los 833 objetos.
- `ficha.arma` (el «ataque principal», un resumen nuestro) se salta el ataque
  vacío: es el primero con tipo declarado. Si no, la habilidad y el daño de
  los arcos de Torkalath salían `null` en la interfaz y en el parry.

Los bichos no cambian: su lector ya cumplía las dos. Rehorneados los cinco
mapas (`gatecity`, `edana`, `edanasewers`, `gertenheld_forest2`, `sala88`):
**0 diferencias** en `bichos.json`. `gatecity_anexo` no se ha rehorneado: es
de otra sesión y estaba a medias.

## 3. Antes y después (los 833 guiones de `items/`, calculado)

Antes 541 ataques; después **485**. Cambian **82 objetos** (78 con nombre y 4
plantillas):

- **el `if` viejo quita 56 ataques de 41 armas y 2 plantillas** (lo mismo que
  midió K);
- **`local` por evento cambia 55** (52 armas y 3 plantillas) — K contó 53; la
  diferencia no se ha atribuido. Se calculó horneando con sólo esta regla
  (copia de `src/bsp/` en el scratchpad con el `if` viejo apagado).

### 3.1 Lo que el `if` viejo quita

| arma | ataques | qué se va |
| --- | --- | --- |
| 14 hachas a dos manos (`axes_2haxe`, `_b`, `_battleaxe`, `_c`, `_df`, `_dragon`, `_greataxe`, `_gthunder11`, `_poison1`, `_scythe`, `_ss`, `_vaxe`; `_sp` y `_thunder11` van 5→4) | 4→3 | el cargado de serie de `base_melee` (`if !CUSTOM_REGISTER_CHARGE1`, base_melee.script:87): queda el de la base a dos manos |
| Golden Axe y Unbreakable Golden Axe | 5→3 | ese y el segundo cargado de `axes_base_twohanded` (`!CUSTOM_AXE_SECONDARY`) |
| North Maul | 7→6 | el de `blunt_base_onehanded` (`if !CUSTOM_REGISTER_BLUNT`, :45) |
| Ice Staff | 4→3 | el cargado de serie |
| **Blood Drinker** | **5→3** | **los DOS cargados de serie** (base_melee y la base a dos manos, que pedían 2 de destreza). **Se queda el suyo** (`register_charge1` propio, carga 1, pide 32) y el especial de 2,5 (pide 34) |
| Felewyn Shard I–V | 5→3 | igual que la Blood Drinker |
| Hoarfrost Shard (`swords_frostblade55`) | 4→2 | los dos cargados de serie: queda el mandoble y el tiro `proj_icelance` |
| Great Sword, Longsword, Spiderblade | 3→2 | el cargado de `base_melee` (`!IS_TWO_HANDED_SWORD`): queda el de la base a dos manos |
| Shadowfire Blade, Unholy Blade | 4→3 | ídem |
| Litch Tongue | 4→2 | cargado de serie y segundo (`!CUSTOM_REGISTER_SECONDARY`) |
| Kharaztorant Fire Blade (`smallarms_k_fire`) | 4→2 | los dos cargados: quedan el mandoble y el tiro `proj_k_knife` |
| **Neck Hunter** | **5→2** | los TRES de `smallarms_base` (normal, cargado, segundo): quedan los dos suyos |
| Vorpal Tongue | 4→3 | el segundo de serie |
| **Phoenix Bow, Frost Bow, los cuatro de Torkalath** | **3→2** | la flecha de `base_ranged` (`if !CUSTOM_ATTACK`, base_ranged.script:23): queda el vacío de `bows_base` y su tiro propio |
| **Orion Bow** | **2→1** | la flecha de `base_ranged`: queda SÓLO el vacío (ver §4) |

### 3.2 Lo que `local` por evento cambia

| armas | qué cambia |
| --- | --- |
| 7 arcos sin `CUSTOM_ATTACK` (Tree, Short, Long, Orcish, Elven Long, Thorn y `bows_base`) | el segundo ataque, que era una copia de la flecha, es el VACÍO (`tipo: null`, sin teclas) |
| Phoenix, Frost, Torkalath ×4, Orion | su ataque 0 es el vacío |
| North Maul | su `register_charge2` hace `registerattack` en la PRIMERA línea, antes de poner nada (blunt_northmaul972.script:107-109): un vacío en el índice 2. Antes era una copia del cargado de 2,5 |
| 17 cuchillos y dagas y `smallarms_base` | el cargado de nivel 2 pierde `aguante` (0,1–1,0 → sin poner, o sea 0): ya no cuesta aguante |
| 7 escudos y `shields_base` | el ataque del escudo pierde `carga 1` y `pideHabilidad 2`, heredados del cargado de otro evento. `escudo.js` no lee ninguno de los dos |
| Lance of Affliction, Dragon Lance, Holy Lance, Shadow Lance, Ice Typhoon | el cuarto ataque (strike-land de carga 4) pierde un `proyectil`, un `sostener` y un `ammodrain 0` heredados |
| Unholy Blade, Hoarfrost Shard, Fire Blade, Rune Blade of Affliction | el tiro cargado pierde `dano`, `danoRango` y `precision` heredados del mandoble. El daño del tiro sale del proyectil y `precision` no la lee nadie: sin efecto en el juego |
| Spider Axe, Thunderaxe | el especial pierde un `aoe.range 100`/`aoe.falloff 1.5` heredados |
| Neck Hunter | sus dos ataques propios son los de su evento: `noautoaim` y el cargado `magic` (antes llevaban los de `smallarms_base`) |

Las flechas (`reg.proj.*`) no cambian: las seis que hacen `registerprojectile`
ponen sus `local` en el mismo evento.

### 3.3 Los tres casos que el encargo pedía confirmar

- **La Blood Drinker**: pierde los dos cargados de SERIE y **conserva su golpe
  cargado propio** (carga 1, prioridad 1, pide 32) y el especial. Lo que K
  llamó «el golpe cargado de la Blood Drinker» era el de serie, duplicado.
- **El arco de Torkalath**: la esfera pasa de la mitad de las veces a
  **siempre** —200 de 200 en Node con la moneda de verdad, 40 de 40 en la
  sonda—, sin tocar `Brazo`, como dejó escrito la parte P
  ([ARMAS_99.md](ARMAS_99.md) §2). `test/armas99.test.mjs` cambia su
  expectativa con nota fechada.
- **El cuchillo de fuego y la Hoarfrost Shard** dejan de empatar su tiro con
  un mandoble cargado (el pendiente de ARMAS_99 §1): el motor no registra el
  mandoble. El tiro sale con cualquier moneda.

## 4. Lo fiel que parece roto, y conviene saber

- **El Orion Bow no tira nada.** Su `custom_register` pone los `local` y
  **no llama a `registerattack`** (bows_orion1.script:53-74), y la flecha de
  `base_ranged` está detrás de `if !CUSTOM_ATTACK`. En el motor su único
  ataque es el vacío: el arco funciona POR GUION (`game_attack1_down`, la bola
  de maná que se carga, :81-178), que este puerto no tiene. Antes tiraba
  flechas normales, que en MSR no tira nunca. Y su `habilidad` en
  `armas.json` es `null` (el parry de MSR usa `WEAPON_PRIMARY_SKILL`, que aquí
  no se lee).
- **El Phoenix Bow y el Frost Bow ya no tiran flechas normales**: sólo su
  `proj_arrow_phx` / `proj_arrow_fbow`. Están los dos en el catálogo de flechas.
- **El índice 0.** Para el motor el vacío ES `m_Attacks[0]` en los arcos con
  `CUSTOM_ATTACK`. `Brazo` filtra por tipo y se queda sin él, así que su
  `ataques[0]` es el siguiente. Los dos sitios que usan el índice 0 (el indulto
  de destreza y la salida de emergencia de la carga) no se disparan en un arco
  sin ataques cargados; queda dicho en el comentario de `Brazo`.
- Los cuchillos sin coste de aguante en el cargado de nivel 2 y el North Maul
  con un ataque muerto en medio son del original, no del puerto.

## 5. Pruebas y sondas

`test/guion99.test.mjs`, 21 pruebas. Los guiones se escriben como TEXTO en una
carpeta temporal y pasan por `leerFichaObjeto` (el analizador de verdad); los
mismos textos con `saytext` pasan por `partirGuion` + `Guion`, para que las dos
capas digan lo mismo. Y los guiones del juego: Blood Drinker, Torkalath ×4,
Orion, cuchillo de fuego y Hoarfrost, y un `Brazo` sobre el horneado.

Pruebas que codificaban la lectura vieja, corregidas con nota fechada al lado:
`test/armas98.test.mjs` («el `if` VIEJO se apunta y NO se aplica»),
`test/armas99.test.mjs` (la esfera la mitad de las veces; el filtro de las
once que miraba `ataques[0]`), `test/proyectiles97.test.mjs` («el primero es
la flecha normal» del Fénix). Y dos sondas: `sondas/armas99.mjs` («también
salen flechas gratis» → «siempre la esfera», más un control positivo con el
arco de partida; 18 declarados) y `sondas/arco.mjs` («dos ataques clonados» →
«la flecha y el vacío»; `probe.arco.empunar` devuelve ahora `registrados` y
`vacios`).

`npm test`: **3 013, 3 011 verdes**, 0 rojas, 1 omitida, 1 todo.

Sondas con `-j 1`: armas97 22/22, armas98 9/9, **armas99 18/18**, **arco
40/40**, golpe 26/26, consecuencias 55/55, mundo 44/44, edana81 13/13, sidra81
25/25, objetos66 11/11. **armas96 31/33**: los dos «lo que cambia es ella:
fuera de su ventana < 1 %» (5,7–6,7 % fuera) salen rojos **también con el
horneado de antes puesto** —se probó copiando el `armas.json` viejo—, o sea que
no vienen de esto. Sin atribuir.

## 6. Roturas deliberadas

Cada una con `ROTURA99R` y un reemplazo en Python que falla si no casa
exactamente una vez; `grep -c ROTURA99R` = 1 antes de medir y 0 después.

| rotura | qué se puso rojo (Node: guion99, armas98, armas99, proyectiles97) |
| --- | --- |
| el `if` viejo falso vuelve a «apuntar y seguir» | 7: los tres del horneado de texto (falso, el resto de la lista, el `{ }`), Blood Drinker, Torkalath/Orion, cuchillo/Hoarfrost, y la de armas98 |
| `acc.ataque` no se vacía por evento | 4: el vacío en otro evento, el `callevent` que no mete lo del llamado, Torkalath/Orion, armas98 |
| `reg.proj.*` no se vacía por evento | 1: `reg.proj` por evento |
| `condicionDeAtaque` sin la regla del nombre | 2: el CONTROL «sin la constante SÍ existe» (por el dudoso) y la de la función |
| `ficha.arma` vuelve a ser `ataques[0]` | 1: «`ficha.arma` se salta el vacío» |
| **en las sondas**: el `armas.json`, `objetos.json` y `escudos.json` de ANTES | armas99 «siempre la esfera» (sale 1 flecha y 1 esfera); arco «la flecha y el vacío» (2 registrados, 0 vacíos, 2 en el brazo). Sus controles positivos siguen verdes |

Las pruebas de Node que leen `build/msr/armas.json` no se ponen rojas con una
rotura del lector: el horneado ya hecho no cambia. Por eso la rotura de las
sondas se hizo con el horneado viejo y no horneando roto (que reescribiría el
archivo que leen las sondas de las otras sesiones).

## 7. Otros

- `npm run bichos:guion` rehorneado de paso: sus diferencias son
  `registercontainer` en la lista de comandos portados (del 98) y el mapa
  `gatecity_anexo` (de otra sesión). Nada de esto.
- Queda sin tocar: el `if ( … )` NUEVO que va delante de un `local` dentro de
  un `{ }` falso sigue sin quitar ese `local` del ataque de después (el lector
  no ejecuta; sólo decide sobre `registerattack`). No se ha encontrado ningún
  arma donde importe; no se ha contado.
