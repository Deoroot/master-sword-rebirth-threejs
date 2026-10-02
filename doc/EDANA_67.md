# Edana viva — experimento 67

> *«dejemos edana al 100%, las transiciones quedan pendientes para otro
> experimento. por ahora solo centremosnos en edana.»*

Las transiciones fuera, entonces. Lo que sigue es lo que le faltaba a Edana
**dentro de sus lindes**, y lo que se encontró al ir a buscarlo, que fue más de
lo esperado: cinco huecos, cuatro de ellos con el valor de reposo en verde.

---

## 1. El censo de lo que Edana tiene y nadie atendía

Antes de tocar nada, el grafo entero de `edana.bsp`: 509 entidades, y de ellas
las que programan el mapa. El puerto atendía 66 y el mapa tiene 84 cableadas.

Las que no llegaban a ningún sitio, con su nombre, que es lo que las delata:

| clase | cuántas | qué es en Edana |
| --- | --- | --- |
| `ms_npcscript` | **18** | las misiones: el libro, la sidra, las pruebas, el jabalí, Edrin |
| `func_breakable` | 4 | los almiares (`hay`), y uno abre la puerta de la alcantarilla |
| `msitem_spawn` | 4 | troncos y una manzana que reaparecen |
| `ms_counter` | 1 | `patroncounter`, `count 8`: el contador de la taberna |
| `func_button` | 1 | `appledrop`: se pulsa y cae una manzana |
| `msarea_transition` | 2 | las dos salidas — **fuera del experimento por decisión del usuario** |

Y tres nombres que no llevan a nada **en el mapa original**: `lol`,
`sewerlight` y `patron*soup` de dos de los cuatro `env_render`. No son un hueco
nuestro; son referencias muertas del mapeador, y se dejan dichas para que la
próxima sesión no las persiga.

---

## 2. `scriptfile` gana a `defscriptfile`, y estaba al revés

El primero, el más barato y el que más cambia.

```cpp
else if (FStrEq(pkvd->szKeyName, "scriptfile") ||
    (FStrEq(pkvd->szKeyName, "defscriptfile") && !m_ScriptName))
{
    m_ScriptName = pkvd->szValue;
                                       msmonsterserver.cpp:415-419
```

`scriptfile` escribe **siempre**; `defscriptfile` sólo si el sitio está vacío.
O sea que el orden de las claves dentro de la entidad da igual, y
`defscriptfile` es literalmente lo que su nombre dice: el valor por omisión que
el editor deja puesto. El extractor hacía `defscriptfile ?? scriptfile`.

**No daba ningún error, porque el valor de reposo es un bicho válido.** Medido
sobre los 93 mapas del juego:

```
entidades con guion        6976
  con las DOS claves       3448
  y distintas (afectadas)  3373   en 81 mapas
```

En Edana son 10, y seis son vecinos con nombre:

| salía como | es en realidad |
| --- | --- |
| `NPCs/default_human` (Commoner) | `edana/highpriest` — **High Priest**, ×2 |
| `NPCs/default_human` (Commoner) | `edana/priest` — **Priest of Urdual**, ×3 |
| `NPCs/default_human` (Commoner) | `edana/masterp` — **Sembelbin** |
| `NPCs/default_human` (Commoner) | `edana/oldman` — **Old man**, el del huerto |
| `worlditems/treasurechest` | `edana/eTC1` — el cofre del alcalde |
| `monsters/boar` (20 de vida) | `edana/boarhard` — **Ferocious Wild Boar**, 25 |
| `monsters/boar` (20 de vida) | `edana/boarboss` — **Huge Aggressive Wild Boar**, 60 |

Y en Gate City son 4: cuatro `msmonster_giantrat` que son **Cave Spiderling** de
15 de vida y salían como ratas de 4.

**Ahí está la razón de que nadie lo viera en veinte experimentos.** Con cuatro
ratas de más nadie mira; el mapa que sí lo gritaba —seis vecinos sin nombre—
llegó en el 48 y nadie volvió a contar. **Quinta vez seguida que el fallo lo
enseña el segundo mapa** (50, 60, 61, 63, 67).

Y un tropiezo propio, que se deja escrito: el primer control comparó el
horneado nuevo contra `build/edana/bichos.json`, y ese archivo **estaba rancio**.
Dio 7 cambios en Gate City en vez de 4, y tres de ellos eran un artefacto: Gate
City tiene **dos entidades de bicho en el mismo `origin`** —dos oleadas
distintas— y el diff casaba por posición. El control bueno es hornear con la
precedencia vieja a propósito y comparar contra el nuevo; eso da 10 y 4, que es
lo que dice el `.bsp`.

---

## 3. La cadena que enciende un mapa de Master Sword

Cuatro piezas separadas, ninguna unida, y el síntoma de las cuatro era el
mismo: **la taberna de Edana vacía**, sin un error.

```
game_player_putinworld        el motor te pone en el mapa   (player.cpp:2771)
  └─ callevent 1.0 activate_stuff                     (player_main.script:1043)
       └─ usetrigger player_joined                     (player_main.script:139)
            └─ trigger_relay player_joined
                 └─ multi_manager patronmm1     (SF_MULTIMAN_THREAD)
                      ├─ ms_counter patroncounter  (count 8)
                      ├─ multi_manager patronspawn (random: uno de 12)
                      │    └─ ms_monsterspawn patron1..patron12
                      └─ trigger_relay patronspawnreset  (+1 s) → patronmm1
```

Once parroquianos sentados —`deralia/commoner_sitting`— esperan detrás de esos
doce aparecedores.

### 3.1 `usetrigger` no existía

Es **el único comando del lenguaje que cruza del lado de los guiones al de las
entidades del `.bsp`** (`scriptcmds.cpp:7054`). Cuatro cosas que se leen ahí y
hay que copiar: acepta varios nombres; el activador y el llamador son la entidad
del guion; el `USE_TYPE` es `USE_TOGGLE` y no `USE_ON`; y es `#ifdef VALVE_DLL`.

### 3.2 `game.serverside` no se resolvía — y ÉSTE es el gordo

```cpp
else if (Name == "clientside")  fSuccess = !IsServer;
else if (Name == "serverside")  fSuccess = IsServer;
                                       script.cpp:4660-4661
```

Sin portar, `game.serverside` devolvía **su propio nombre** —que es lo correcto
para una variable que no existe (`script.cpp:4741`)— y
`atoi("game.serverside")` es 0.

**Y casi siempre es un `if` VIEJO**, sin paréntesis, que no se salta una línea:
**abandona el bloque entero** (`script.cpp:5754-5758`). Medido sobre los 2 884
scripts:

```
280   `if game.serverside`     sin paréntesis  -> abandonaban su evento
 16   `if game.clientside`     idem
 68   con paréntesis           ésos sólo se saltaban su hijo
```

En `game_player_putinworld` el `if game.serverside` está en el **comando 3 de
20** y el `callevent 1.0 activate_stuff` en el **17**. O sea que el evento con
el que un mapa de Master Sword se enciende moría en la tercera línea, en todas
las partidas de este puerto, sin un error.

**Este puerto es el lado servidor**, y por eso `serverside` vale 1 y
`clientside` 0: lo que está portado del lenguaje es la mitad `#ifdef VALVE_DLL`
—`usetrigger` es literalmente eso—, los NPC piensan aquí y el anfitrión de Node
es la autoridad desde el 27. Que el navegador también dibuje no lo convierte en
el cliente del mod: el cliente de MSR corre su propia copia del intérprete, y
esa no está.

### 3.3 `SF_MULTIMAN_THREAD` se extraía y no se usaba

```cpp
if (ShouldClone())
{
    CMultiManager *pClone = Clone();
    pClone->ManagerUse(pActivator, pCaller, useType, value);
    return;
}
                                       triggers.cpp:469-474
```

Un `multi_manager` con `spawnflags 1` **no se ejecuta él**: se copia y corre la
copia, y el original se queda con su `Use` intacto. El comentario del motor usa
esa palabra: «execute in the clone (like a thread)».

Sin clonar, la cadena **se rechaza a sí misma en el segundo ciclo**: el original
tiene el `Use` desactivado hasta que acaba, y acaba justo después de disparar el
relé de la vuelta. Un parroquiano de once y para.

El clon se reutiliza en vez de acumularse. El motor hace `UTIL_Remove` y se
olvida; aquí la lista de entidades es fija y un manager disparado cada segundo
la haría crecer sin tope. Un clon muerto del mismo origen es indistinguible de
uno nuevo, porque `Clone` copia el `pev` entero.

### 3.4 `ms_counter` no tenía clase en el bus

`CounterUse` cuenta hacia atrás y al llegar a cero dispara su `target` con
`USE_TOGGLE` y **se borra**, porque su `Spawn` pone `m_flWait = -1` a mano
(`triggers.cpp:1601-1635` y `:1655`). El `count 8` del mapa es el número de
parroquianos que hay que servir.

---

## 4. Los jabalíes te perseguían y no te tocaban

Nadie había medido combate en Edana: `sonda:edana60` mide que los vecinos
hablen, y `mundo`, `ia` y `golpe` corren **todas en Gate City**.

Medido: los cuatro jabalíes te fichan, te persiguen, te embisten y **la vida no
baja**. Causa: `dano: null` en su ficha, porque hay **tres maneras de declarar
el daño de un ataque** en Master Sword y el lector conocía una.

| estilo | cómo | quién |
| --- | --- | --- |
| nuevo | `setvar ATTACK_DAMAGE $randf(6,9)` | goblin, zombis (115 ficheros) |
| viejo | `dodamage … GORE_FORWARD_DAMAGE …` | jabalíes (280 ficheros) |
| el par | `const ATTACK_DAMAGE_LOW/HIGH` | arañas, esqueletos (49 ficheros) |

En el estilo viejo **no existe `ATTACK_DAMAGE`**: el daño es una constante con
el nombre de la animación, y el evento que la usa se llama como la animación
también (`monsters/boar.script:25-29`, y `dodamage <objetivo> <alcance> <daño>
<acierto>` en `npcscript.cpp:1107-1113`).

El resultado de arreglarlo, medido en los dos mapas:

```
edana      de  3 a  9 bichos con daño   (los 6 jabalíes)
gatecity   de 28 a 35 bichos con daño   (2 arañas, la escupidora, 4 crías)
```

**Las arañas de Gate City tampoco muerden desde que existen**, y las tres sondas
de combate estaban verdes: miden contra goblins y zombis, que son del estilo
nuevo. Nunca se había puesto un control delante de una araña.

Los que siguen sin daño y **es correcto**: los paisanos, y el guardia del
alcalde, cuyo único `dodamage` es contra `ent_laststole` —el castigo por
robarle— y no su ataque. Ése es el control negativo de que la regla nueva no
reparte daño a todo el mundo.

En la sonda: **15 de vida a 0 en diez segundos**, con cuatro jabalíes encima de
un personaje nuevo. Y eso obligó a cambiar la medida, porque al morir la sesión
se queda sin personaje y la sonda leía un `null`: ahora se mira cada medio
segundo y se guarda el mínimo, así que morir cuenta como lo que es.

---

## 5. `ms_npcscript`: las misiones de Edana

El `scripted_sequence` de Master Sword. Coge al NPC que nombra su `target` —por
`targetname`, no por el nombre que se lee en pantalla— y le hace una de cinco
cosas (`npcact.cpp:17-23`).

Los 18 de Edana, por tipo: **15 del tipo 2** (`SCRIPT_RUNEVENT`), 2 del 0 y 1
del 4. Los del 2 son las misiones:

| escena | NPC | evento |
| --- | --- | --- |
| `askbook` ×2, `bookfound` ×2 | urdauf, sumdale | el libro |
| `cider`, `cider2`, `cider3`, `cider4`, `ciderreward` | bryan, barwench, krythos | la sidra |
| `evidence_found` ×2 | mayor, merc3 | las pruebas del alcalde |
| `boarsdead` | oldman | **el `killtarget` del jefe jabalí** |
| `oldmanname` | oldman | su nombre |
| `ask`, `msqguardtrig` | priest, msqguard | los saludos |

Se porta **el tipo 2 entero**. Los otros tres mueven al NPC a un punto, y eso
pide hablarle al rebaño y a la física, que no viven en el bus: el disparo sale
por `salidas` como «usar» para que **cuente en el censo de lo que falta** en vez
de tragarse. Y el de tipo 0 con `eventname player_spawned` **no tiene
`targetname`**, así que en el juego original tampoco lo dispara nadie.

> ### ── CORRECCIÓN DEL 77 ──
>
> **Hechos**, y la razón de aquí era correcta: mover a un NPC sigue sin poder
> hacerse en el bus. Lo que faltaba era a quién pasarle el recado. La máquina de
> estados está en `src/play/escena.js` y el movimiento en `Manada.mandarA` y
> `pasoMandado`; el bus sigue sin mover a nadie, ahora emite `escenaDeNpc` con
> el pedido entero. Pisas el arriate de Edana y **el capitán de la guardia cruza
> la plaza corriendo**. Ver [ESCENAS_77.md](ESCENAS_77.md).
>
> Y dos cosas que este documento no podía saber todavía:
>
> 1. **El tipo 0 es el más común de los cinco en todo el juego**: 98 de los 172
>    `ms_npcscript` de los 81 mapas. El que aquí quedó sin portar por ser «uno
>    de los tres raros de Edana» era el mayoritario.
> 2. **`edrinspot` no mueve a Edrin si está en su sitio.** Está a 32 unidades de
>    donde nace y su proximidad es 35,2, así que esa escena se da por llegada en
>    el acto. La que de verdad le hace andar es `edrinstrict1`, la del tipo 4, y
>    `edrinspot` sólo mueve algo cuando se dispara desde las flores — que es
>    para lo que el mapa lo encadena con `firewhendone`.

Tres cosas que no se adivinan y sí se portan:

1. **El tipo 2 no deja al NPC «en escena».** `if (m_iType == SCRIPT_RUNEVENT) {
   RunScriptEvent(); return; }` vuelve ANTES del `m_MonsterState =
   MONSTERSTATE_SCRIPT` del final, con el comentario de Thothie al lado
   («attempting to fix buggy ms_npcscript behavior», `npcact.cpp:134-141`). Si
   lo congelara, el sacerdote se quedaría clavado después de saludarte.
2. **Un NPC peleando no atiende una escena** si el mapa no pone `stopai`:
   `if (!m_fStopAI && pMonster->m_hEnemy != NULL) return;` (`:131`).
3. **Se llama SIN parámetros**, ni el jugador que la disparó
   (`pMonster->CallScriptEvent(STRING(m_sEventName))`, `:203`). Los eventos de
   detrás están escritos para eso; pasarle el jugador «para que funcione» sería
   inventarse otro Master Sword.

Y hizo falta añadir el `targetname` del mapa al censo de bichos: `nombre` es lo
que dice su guion («Priest of Urdual») y `objetivo` es con lo que el mapa le
habla («priest»). 29 de los 48 vecinos de Edana lo tienen.

`merc3` **no existe en Edana**, así que una de las dos escenas de
`evidence_found` no tiene a quién dirigirse. Es del mapa, no nuestro, y sale
contado en `sinPortar` como «eventoDeNpc: sin NPC».

### CORRECCIÓN DEL 69

Lo de `merc3` es verdad, **pero ese contador no era sólo suyo**. En
`aplicarDisparos` estaban las etiquetas
`case "borrar": case "usar": case "render": case "area_ignora":` **sin cuerpo**,
pegadas a `case "eventoDeNpc"` — y en JavaScript eso no es «no hagas nada»: es
entrar en el cuerpo del siguiente. Así que cada `borrar`, cada `usar`, cada
`render` y cada `area_ignora` corría el lanzador de escenas de NPC con `s.npc`
sin definir, no encontraba a nadie y **se apuntaba también como
«eventoDeNpc: sin NPC»**.

O sea que el número que este documento leyó para hablar de `merc3` llevaba
dentro cuatro cosas más, y ninguna era una escena. `merc3` sigue sin existir; la
cuenta no era la de `merc3`.

Lo encontró la sonda del 69 pidiendo `usar=1` y leyendo 0. Ver
[ROMPIBLES_69.md](ROMPIBLES_69.md) §7.

---

## 6. Lo que se rompió a propósito, y qué cazó

| rotura | la sonda bajó a | qué demostró |
| --- | --- | --- |
| `game.serverside` sin resolver | **11 de 16** | los cinco de la cadena |
| el `multi_manager` no se clona | **15 de 16** | **sólo uno**, y ahí estaba el problema |
| el daño del `dodamage` no se lee | 14 de 16 | los dos del combate |

*(Las tres roturas se pasaron cuando la sonda tenía 16 controles; los dos de las
escenas de NPC llegaron después.)*
| la precedencia de `scriptfile` | 3 de 7 (prueba) | los del censo |

**La rotura del clon cazó un control mío que medía otra cosa.** El control decía
«la cadena da más de un ciclo» leyendo `disparadores().cuenta.patronmm1`, y
`cuenta` cuenta **intentos de disparo, no ejecuciones**: con el clon apagado, el
relé de la vuelta sigue intentándolo y el manager lo rechaza, así que el número
subía igual. Se cambió a `patroncounter`, que sólo se intenta si el manager
corrió de verdad. Apartado 4 de CLAUDE.md, la variante «un verde que mide otra
cosa», y esta vez la cazó la rotura y no una partida.

Y las pruebas de Node del `if` viejo **nacieron rojas con el código bien**,
porque construían el comando a mano —`{ nombre: "if", params: [...] }`— y lo que
distingue el `if` VIEJO del NUEVO no es el nombre sino una bandera que pone el
**analizador** al ver el paréntesis (`script.cpp:5310-5322`). Es la variante del
59: la prueba construye el argumento y deja sin comprobar justo el mecanismo que
tenía el fallo. Ahora parten texto de guion de verdad con `partirGuion`.

---

## 7. Lo que queda de Edana, medido

No está al 100 %. Lo que falta, en orden de lo que se nota:

| qué | cuántos | qué se pierde |
| --- | --- | --- |
| `func_breakable` | 4 | los almiares no se rompen, y uno abre la alcantarilla |
| `msitem_spawn` | 4 | tres troncos y la manzana no aparecen |
| `func_button` | 1 | `appledrop` no suelta su manzana |
| ~~`ms_npcscript` tipos 0 y 4~~ | ~~3~~ | **hecho en el 77**, ver [ESCENAS_77.md](ESCENAS_77.md) |
| `perishtarget` | 2 | **el jefe jabalí no aparece al matar a los diez** |
| una misión de punta a punta | — | `quest` sale 118 veces y nadie la ha seguido |

De `perishtarget` hay algo que merece comprobarse antes de portarlo: la cadena
es `boar2`/`boar3` (5 vidas cada uno) → `wave3_1`/`wave3_2` →
**`multisource wave3`** → `boarboss`. Y `CMultiSource::Use` baja por la
`SUB_UseTargets` **rota** del motor (ver `MULTISOURCE_ROTO` en
`src/play/disparadores.js`), que no dispara nunca. O sea que **es posible que el
jefe jabalí de Edana no aparezca tampoco en el juego original**, y que el
`killtarget boarsdead` que avisa al viejo del huerto no llegue nunca. Eso hay
que medirlo antes de escribirlo como un hecho, y es exactamente la clase de cosa
que este cuaderno existe para no perder.

### CORRECCIÓN DEL 68: medido, y el recuerdo del usuario gana

Se midió, y la sospecha acierta en el resultado y falla en el motivo. Ver
[OLEADAS_68.md](OLEADAS_68.md); en corto:

- **El diseño es el que el usuario recordaba**, y con más detalle: no son diez
  jabalíes sino **quince, en tres oleadas de cinco**, gobernadas por `spawnstart`
  y `perishtarget` — dos claves que este puerto no leía. Y con `spawnchance 100`
  en las cuatro fichas, o sea que **no hay azar en el jefe**: es una cuenta.
- **`perishtarget` ya está portado**, y sale de la lista de pendientes. Las tres
  oleadas se encadenan, medido con Chromium: `boar2` y `boar3` a 5 apariciones de
  5 cada uno, y el `killtarget` del jefe llegando al viejo del huerto.
- **La cadena no se rompe donde decía este documento.** No llega a la
  `SUB_UseTargets` invertida: se para un paso antes, porque `wave3_1` y `wave3_2`
  tienen `delay 4` y un retraso crea una entidad nueva (`"DelayedUse"`,
  subs.cpp:252-269) que el multisource rechaza por no estar registrada. **Lo avisa
  el propio mod en la primera línea de `CMultiSource::Use`** (buttons.cpp:173-176).
  La `SUB_UseTargets` rota está detrás y también dispararía a nada, pero es la
  segunda rotura y no la primera.
- Y faltaba una tercera pieza que este documento no menciona porque nadie la
  echaba de menos: **`CMultiSource::Register` no estaba portado**, así que la lista
  de entradas era `undefined` y la reja del 49 estaba permanentemente abierta.

Lo que sigue en pie: **el jefe no sale en este árbol del mod**. Lo que cae: que
fuera por la `SUB_UseTargets`, y que fuera al matar diez.

---

## 7 bis. Dos tropiezos de la sonda, que son medida y no anécdota

**Al morir, `sesion.vitales()` se queda sin personaje.** La sonda leía la vida
una sola vez a los diez segundos y se cayó con un `null`: cuatro jabalíes matan a
un personaje nuevo de 15 de vida, o sea que **la medida desaparecía justo cuando
el resultado era el más contundente posible**. Ahora se muestrea cada medio
segundo y se guarda el mínimo. Lo mismo con `ia.atacantes()`, que se vacía al
morir el objetivo y daba «no te ficha nadie» después de haberte matado.

**`probe.mundo.disparar()` no aplica los efectos**: los deja en la bandeja, y
quien los aplica es el bucle del juego. Leer `escenasDeNpc()` en la misma vuelta
daba cero con todo bien — medía la prisa de la sonda, no el cable.

---

## 8. Números

```
npm test                 1635 de 1635      (eran 1610)
npm run sonda:edana67      18 de 18        nueva
npm run sonda:edana60      13 de 13        (estaba en 12: el horneado rancio)
vite build               limpio

Edana:      84 entidades cableadas (eran 66)  ·  9 bichos con daño (eran 3)
Gate City:  35 bichos con daño (eran 28)      ·  4 ratas que son arañas
El juego:   3 373 criaturas en 81 mapas con el guion corregido
            296 `if game.serverside/clientside` que abandonaban su evento
```
