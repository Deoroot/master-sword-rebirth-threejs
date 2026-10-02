# Las tres oleadas de Edana — experimento 68

> *«recuerdo que el jefe jabali aparecia despues de matar x cantidad de jabalies
> normales. no estoy seguro si era asi o random pero si aparecia.»*

El 67 dejó escrito, con todas las cautelas, que *«es posible que el jefe jabalí
de Edana no aparezca tampoco en el juego original»*, y que **eso había que
medirlo antes de escribirlo como un hecho**. Esto es esa medida, y salió mejor de
lo que se podía esperar: el recuerdo del usuario es **el diseño del mapa**, con
más detalle del que se puede deducir jugando, y la sospecha del 67 era **correcta
pero por el motivo equivocado**.

---

## 1. El corral, entero

```
msarea_monsterspawn boars1        ← nace activa, lleva el reloj, sin spawntrigger
  msmonster_boar (sin targetname) lives 5               perishtarget wave2
  msmonster_boar boar2            lives 5 spawnstart 1  perishtarget wave3_1
  msmonster_boar boar3            lives 5 spawnstart 1  perishtarget wave3_2
      └─ scriptfile edana/boarhard   ← «Ferocious Wild Boar», 25 de vida
  msmonster_boar boarboss         lives 1 spawnstart 1  killtarget   boarsdead
      └─ scriptfile edana/boarboss   ← «Huge Aggressive Wild Boar», 60 de vida

mstrig_multi  wave2     → boar2 (+5 s), boar3 (+5 s)
trigger_relay wave3_1   → wave3    delay 4   triggerstate 2   random 100
trigger_relay wave3_2   → wave3    delay 4   triggerstate 2   random 100
multisource   wave3     → boarboss           ← dos entradas: los dos relés
ms_npcscript  boarsdead → oldman, eventname trig_boarsdead, type 2
```

Quince jabalíes normales en tres oleadas de cinco, y luego el grande. **Con
`spawnchance 100` en los cuatro: no hay azar en el jefe.** El usuario dudaba de
si era una cuenta o un sorteo; es una cuenta.

Las cuatro fichas son del **mismo área**. Eso importa: `boars1` no es «el sitio
donde salen los jabalíes», es un reloj con cuatro entradas independientes, cada
una con su contador de vidas y su reaparición.

---

## 2. Las dos claves que gobiernan esto tienen el nombre al revés

### `spawnstart 1` significa «NO salgas hasta que te llamen»

```cpp
else if (FStrEq(pkvd->szKeyName, "spawnstart"))
{
  //Thothie - JUN2007a
  //various atttempts to force monster spawn to spawnstart 1 -  fail
  //bool thoth_in_value = atoi(pkvd->szValue) ? true : false;
  //m_fSpawnOnTrigger = true;
  //msstring thoth_new_targetname = "game_playerspawned";
  //if ( !thoth_in_value ) pev->targetname = ALLOC_STRING(thoth_new_targetname);
  //
  //Thothie JUN2007 FAIL - see m_fSpawnOnTrigger above
  /*if ( !m_fSpawnOnTrigger ) { ... } */
  //original:
  m_fSpawnOnTrigger = (atoi(pkvd->szValue)) ? true : false;
```
— `msmapents.cpp:827-844`

**Cuatro intentos de Thothie de arreglar ese nombre, comentados uno debajo de
otro, y todos con la palabra «fail» al lado.** El nombre al revés es deliberado a
estas alturas del mod, así que se porta lo que el código hace y no lo que la
clave dice.

Se consume así, y la tercera mitad de la condición es la que se porta mal con
facilidad:

```cpp
if (mdSpawnMonster[i].spawnontrigger &&
    !mdSpawnMonster[i].triggered &&
    mdSpawnMonster[i].lives == mdSpawnMonster[i].livesleft)
  continue;
```
— `msmapents.cpp:1210-1213`

`lives == livesleft` quiere decir que **esto sólo frena la PRIMERA aparición**.
Una vez ha salido y ha muerto, la ficha vuelve por su cuenta sin que nadie la
llame. «Por disparo» suena a «siempre», y no lo es.

Y despertar una ficha es `MSQuery`, que hace **dos** cosas:

```cpp
mdSpawnMonster[i].triggered = true;
mdSpawnMonster[i].deathtime = mdSpawnMonster[i].delayvalue = 0;
```
— `msmapents.cpp:1310-1312`

La segunda importa tanto como la primera: poner la espera a cero es lo que hace
que el jefe entre de golpe en vez de dentro de los 5 a 25 segundos que dice su
`delaylow`/`delayhigh`.

### `killtarget` en un monstruo **no mata: dispara**

```cpp
//MAR2008b fire targets here instead of in death fade, in case gibs
if (m_iszKillTarget.len() > 0)
  FireTargets(m_iszKillTarget, this, this, USE_TOGGLE, 0);
```
— `msmonsterserver.cpp:2568-2569`

Es una clave de `CMSMonster` y **no** la `killtarget` de `CBaseDelay`, que sí
borra entidades (`subs.cpp:289-302`). Dos claves con el mismo nombre y efectos
opuestos según en qué entidad estén. En el port se llama `alMorir` para que no
pueda confundirse con `matar`, que es la otra.

Y va en el camino de la muerte, no en el del aparecedor: se dispara en **cada**
muerte del bicho, no sólo al agotar las vidas. Con `lives 1` da igual; con vidas
de sobra, no.

---

## 3. Cuatro huecos, y los cuatro con el valor de reposo en verde

### 3.1. `perishtarget` estaba declarado NO PORTADO, por escrito

La cabecera de `src/play/aparecer.js` llevaba desde el 39 un apartado titulado
«Lo que NO se porta, dicho aquí y no descubierto luego», y dentro:

> `killtarget`/`perishtarget` y el limitador `SpawnLimitReached`. **Ninguna de las
> 38 plantillas de Gate City usa ninguno**, así que portarlos sería escribir sin
> nada con que comprobarlo.

La razón era **exactamente correcta** y sigue siéndolo: se midió, y Gate City
tiene **0 de las tres claves** en sus 38 fichas. La conclusión era la que
envejeció. Es la **sexta vez seguida** —50, 60, 61, 63, 67, 68— que el hueco lo
enseña el segundo mapa, y la primera en que estaba **escrito en el archivo** que
el hueco existía.

*Una lista de «esto no se porta» envejece con el primer mapa nuevo, y nadie la
vuelve a leer.* La corrección se añade al lado, no se reescribe (§7 de CLAUDE.md).

### 3.2. `fireallperish` sólo llegaba al aparecedor, nunca al mapa

`perishtarget` y `fireallperish` son `FireTargets` a secas (`msmapents.cpp:990` y
`:1296`), o sea que pueden nombrar **cualquier** entidad del `.bsp`. Los dos
caminos del port —`src/red/fauna.js` y `src/render/bichos.js`— hacían sólo
`aparecedor.disparar(nombre)`.

Y en Gate City eso bastaba **por casualidad**: su único `fireallperish` es
`spawn_bowguys` apuntando a `skele_treasure`, que **es otra área**. El corral de
Edana apunta a un `mstrig_multi` y a dos `trigger_relay`, que son del mapa, así
que la cadena moría en la primera oleada sin un solo error.

### 3.3. `CMultiSource::Register` no estaba portado — y era el hueco más raro

```cpp
pentTarget = FIND_ENTITY_BY_STRING(NULL, "target", STRING(pev->targetname));
```
— `buttons.cpp:241-270`

**Las entradas de un multisource son quien le APUNTA**, al revés de todo lo demás
en ese módulo: no se declaran, se descubren. Eso no estaba, así que `e.entradas`
era `undefined` en todas las partidas del juego, y con ello **dos cosas a la vez**:

- `IsTriggered` leía `entradas ?? []`, y una lista vacía significa **ABIERTO** en
  el motor (`i == m_iTotal` con los dos a cero, `buttons.cpp:233-238`). La reja
  estaba permanentemente franca.
- `_multisource` leía `!(e.entradas ?? []).includes(i)` y por tanto **rechazaba a
  todo el mundo** por no ser miembro.

Los dos huecos se tapaban el uno al otro: quien mirara la reja la veía bien, y
quien disparara producía un aviso que nadie leía. Es la forma del 64 —dos piezas
esperándose— con el agravante de que **las dos estaban escritas y citadas**.

Y las siete pruebas del 49 estaban verdes porque **escribían `entradas: [2, 3]` a
mano**. Es la trampa del 59 por tercera vez, y la segunda que la escribí yo.
Corregidas, con el motivo dentro del archivo.

### 3.4. `spawnstart` no se leía, así que las cuatro oleadas salían a la vez

Sin él, el jefe de 60 de vida estaba en el corral desde el primer segundo de la
partida. Verde por todas partes: hay jabalíes en el corral, y son los que dice el
censo. Lo que no había era una pregunta que distinguiera **cuántos** de **cuáles
y cuándo**.

---

## 4. Y el final de la cadena está roto en el mod. Dos veces

Aquí es donde la sospecha del 67 acierta en el resultado y falla en el motivo.

### La primera rotura: el retraso fabrica una copia

```cpp
//Dogg: WARNING, can't used multi_source with triggers that have a delay.
//If they have a delay, a copy is created and that copy's address doesn't
//match up with the original
```
— `buttons.cpp:173-176`, **la primera línea de `CMultiSource::Use`**

El mod avisa de esto por su nombre, y `wave3_1` y `wave3_2` tienen los dos
`delay 4`. Lo que pasa está en la otra punta:

```cpp
if (m_flDelay != 0)
{
  CBaseDelay *pTemp = GetClassPtr((CBaseDelay *)NULL);
  pTemp->pev->classname = MAKE_STRING("DelayedUse");
  pTemp->pev->nextthink = gpGlobals->time + m_flDelay;
  pTemp->SetThink(&CBaseDelay::DelayThink);
  pTemp->pev->target = pev->target;
  pTemp->m_flDelay = 0;  // prevent "recursion"
  return;
}
```
— `subs.cpp:252-269`

Una **entidad nueva**, creada cuatro segundos antes de disparar, que no existía
cuando `Register` corrió. `CMultiSource::Use` compara por identidad
(`m_rgEntities[i] == pCaller->GetSelf()`), no la encuentra, imprime
«MultiSrc:Used by non member DelayedUse» y **se va**. La reja no llega ni a
entreabrirse.

### La segunda: la `SUB_UseTargets` de `CBaseEntity`

Y si colara, detrás está lo que el 67 ya había encontrado. Hay **dos**
`SUB_UseTargets` y no son virtuales (`cbase.h:507` y `:732`), así que la elige el
compilador por el tipo estático:

| clase | línea | condición | sale bien |
| --- | --- | --- | --- |
| `CBaseDelay::SUB_UseTargets` | `subs.cpp:307` | `if (!FStringNull(pev->target))` | **sí** |
| `CBaseEntity::SUB_UseTargets` | `subs.cpp:197` | `if (!pev->target)` | **no: invertida** |

`CTriggerRelay : CBaseDelay` usa la buena, así que los relés **sí** llegan a
`wave3`. `CMultiSource : CPointEntity : CBaseEntity` usa la rota, así que su
salida no dispara nunca.

Hay un detalle que conviene dejar dicho porque parece un tercer fallo y no lo es:
`CBaseDelay::SUB_UseTargets` empieza con `if (!pev->target && !m_iszKillTarget)
return;` (`subs.cpp:246`), que lleva el mismo comentario de Thothie sobre
`FStringNull`. Ahí la condición **es correcta**, porque guarda un `return` y no un
disparo. La misma mano cambió lo mismo en dos sitios: en uno es inocuo y en el
otro es fatal.

### Lo que esto significa para el recuerdo del usuario

El diseño del mapa dice lo que el usuario recuerda: quince jabalíes y luego el
jefe. El código de **este árbol** dice que el jefe no puede salir. Las dos cosas
son medidas y no se contradicen: la que falla es una edición del mod fechada
`OCT2007a` y un aviso fechado por Dogg, así que **el jefe pudo aparecer
perfectamente en la época que el usuario jugó**. El puerto reproduce el fallo,
porque «lo roto se porta con el fallo y una prueba», y lo deja detrás de un solo
operador y de una constante con nombre para que se pueda quitar el día que se
decida jugar la versión que funcionaba.

---

## 5. Lo que ahora corre

| pieza | cita | qué hace en Edana |
| --- | --- | --- |
| `spawnstart` → `porDisparo` | `msmapents.cpp:827-844`, `:1210-1213` | tres de las cuatro oleadas esperan |
| `MSQuery` → `_despertarFicha` | `msmapents.cpp:1301-1316` | `wave2` despierta a `boar2` y `boar3` |
| `perishtarget` → `alPerecer` | `msmapents.cpp:983-990` | encadena las tres oleadas |
| `killtarget` → `alMorir` | `msmonsterserver.cpp:2568-2569` | el jefe avisa al viejo del huerto |
| `FireTargets` al mapa | `msmapents.cpp:990`, `:1296` | el cable que faltaba, en los dos caminos |
| `CMultiSource::Register` | `buttons.cpp:241-270` | `wave3` sabe quiénes son sus dos entradas |

Y una rata gigante con **7 vidas** apuntando a `rats_respawn`, que nadie había
visto porque el extractor no leía la clave.

---

## 6. Lo que se rompió a propósito

Las cinco roturas, sobre 18 pruebas:

| rotura | rojos | qué habría pasado sin la prueba |
| --- | --- | --- |
| el freno de `spawnstart`, quitado | 5 | el jefe en el corral desde el segundo uno |
| `perishtarget`, que no dispara | 5 | las oleadas 2 y 3 dormidas para siempre |
| la cola del hueco entre tics | 5 | el `perece` perdido: la cadena no arranca |
| `Register`, sin registrar | 3 | la reja abierta y el `Use` rechazando a todos |
| la copia del retraso, «arreglada» | 2 | el jefe saldría, y sería un Master Sword nuestro |

Y las dos que las roturas NO habrían cazado, y que hicieron falta igual:

- **El control positivo del cero.** «El jefe no sale» también sería verde si el
  área no existiera. Al lado va «llamado a mano, el jefe sale, y con 60 de vida».
- **El segundo caso.** «Las fichas de Edana traen `porDisparo`» estaría verde con
  el extractor poniéndoselo a todo el mundo. Al lado van las 38 de Gate City con
  cero.

---

## 7. Dos tropiezos de la sonda, que son medida

**`censo().lista` no trae `muerto`, sólo `dormido`.** La primera versión filtraba
por `!dormido` y se pasó **720 llamadas rematando cadáveres**, con `wave2` sin
disparar y el informe diciendo «matados 720» como si hubiera hecho algo. Un
cadáver de Master Sword tarda en desvanecerse y hasta entonces sigue en el censo
despierto. El `muerto` está en `victima(n)`, así que hay que preguntar ahí.

*Un contador de «cuántas veces he pegado» no mide «a cuántos he matado»* — que es
la misma lección del 67 con los intentos y las ejecuciones, en otra pieza.

**`probe.golpe.matar(n)` indexa sobre los hostiles, no sobre `censo().lista`,** y
la lista se reordena en cuanto uno se duerme. Hay que rebuscar el índice en cada
vuelta; con uno guardado se mata a otro vecino del pueblo.

---

## 8. Lo que le sigue quedando a Edana

| qué | cuántos | qué se pierde |
| --- | --- | --- |
| `func_breakable` | 4 | los almiares no se rompen, y uno abre la alcantarilla |
| `msitem_spawn` | 4 | tres troncos y la manzana no aparecen |
| `func_button` | 1 | `appledrop` no suelta su manzana |
| ~~`ms_npcscript` tipos 0 y 4~~ | ~~3~~ | **hecho en el 77**: Edrin ya va, y el tipo 0 resultó ser 98 de los 172 del juego |
| una misión de punta a punta | — | `quest` sale 118 veces y nadie la ha seguido |
| `msarea_transition` | 2 | diferido por el usuario desde el 67 |

`perishtarget` sale de esta lista. El jefe jabalí no, y por primera vez se sabe
**por qué** y con qué línea se cambiaría.
