# 86 · El HUD de eventos decía seis frases que el juego no dice

> *«el event hud me parece todavia tiene texto inventado, eso faltaria
> corregir.»*

Y las tenía. Seis, en la esquina de abajo a la derecha, la que el jugador mira
cada vez que pega. Este documento es qué decíamos, qué dice el mod, y las tres
veces que casi me equivoco al arreglarlo.

Es la **tercera** vez que esta misma esquina sale en el cuaderno. El 65 encontró
que «You parried the blow!» era nuestra; el 83 quitó el aviso de «alertas a los
enemigos» porque el usuario lo comparó con el original y allí no existe. Las seis
de hoy convivían con las dos correcciones anteriores, al lado, sin que nada se
pusiera rojo.

---

## 1. La tabla

Medido buscando cada cadena en `../MSC/` —los 2 884 guiones y el código del mod—
y no encontrándola.

| lo que decíamos | lo que dice el juego | dónde |
| --- | --- | --- |
| `3.4 damage to Giant Rat — 17 of 20 left` | `Hit Giant Rat: 3.4 slash damage.  ` | giattack.cpp:1954 |
| `CRITICAL! ` **delante** | `CRIT! (97/95)` **detrás** | giattack.cpp:1952 |
| `You missed: too far` | `Missed Giant Rat.` | giattack.cpp:1965 |
| `Giant Rat hits you: 3.4 damage` | `Giant Rat hits you: 3.4 pierce damage.  ` | giattack.cpp:1994 |
| `You killed Giant Rat — 25 experience (12 recorded: the rest is lost)` | **nada** | playerstats.cpp:208 |
| `The monster flees` | **nada** | — |
| `You are out of Arrows` | `This is your last Arrows` | giattack.cpp:961 |
| `Your arrow was parried!` | `Your attack was parried!` | base_monster_shared.script:474 |

Ocho filas y no seis, porque al tirar del hilo salieron las dos del arco.

### 1.1 Lo que el mod NO dice, y es la mitad del arreglo

**La experiencia no se anuncia en esta esquina.** La línea existe y su propio
autor la dejó comentada:

```c
//SendInfoMsg( "You gain %d XP", EnemySkillLevel ); //thothie - XP report - no workie
//                                                        playerstats.cpp:208
```

Quien lo dice es el guion del jugador, en verde y por otra puerta: `game_xpgain`
→ «\* 25 XP Awarded» (`gplayermessage`), portado en el 65. O sea que nuestra
línea era **un tercer mensaje que contradecía al bueno con otro número al
lado**.

**Que un bicho huya tampoco.** La cadena del mod —`npcatk_run "flee"` y lo que
la rodea, `base_npc_attack_new.script:787-869`— no tiene un solo
`playermessage`: lo ves irse, no te lo leen. Igual que el aviso a los aliados
del 83: el mecanismo está bien portado y lo inventado era contarlo.

**Ni la vida que le queda a nada.** El `— 17 of 20 left` y el `· it flinches` no
tienen nada detrás.

### 1.2 Y lo que SÍ era del juego, y por poco no lo borro

`Your attack was parried!` **es literal del mod**, y no del motor sino del guion
del bicho:

```
playermessage $get(PARAM1,id) Your attack was PARRY_TYPE
                        monsters/base_monster_shared.script:474
```

Iba a «corregirlo» al formato del motor (`%s parries the attack!`,
giattack.cpp:1970) porque ésa era la cadena que había encontrado primero.
**Los dos salen en el juego**: el motor dice una y el guion del bicho dice la
otra, y el `PARRY_TYPE` del guion es el que pone «dodged!» en las arañas
(`spider_base.script:4`) — el detalle que el 66 arregló. Un «arreglo» ahí habría
desportado dos cosas de una vez.

*Antes de cambiar una cadena por no encontrarla donde buscas, búscala en el otro
sitio: en este mod, el motor y los guiones hablan los dos.*

---

## 2. LA TRAMPA DEL DÍA: cité una línea que está dentro de un comentario

Para el informe del golpe encontré esto, y es código de verdad —ni `#if 0`, ni
`//` delante, con su sangrado y sus llaves:

```c
_snprintf(sz, sizeof(sz),  "You attack %s. %s %s%s", pEntity->DisplayName(),
    szStats, szHitMiss, szDamage );
pPlayerAttacker->SendEventMsg( HUDEVENT_ATTACK, sz );
//                                                   giattack.cpp:1433-1435
```

Estuve a punto de portar ese formato. Está **dentro de un comentario de bloque
que cierra 96 líneas más abajo**, en `:1529`, con un `}*/` pegado al margen
izquierdo. El vivo es el de `CBaseEntity *DoDamage(damage_t &, CBaseEntity *)`
(`:1657`), con el comentario de Thothie «SEP2019_22 - changing report syntax to
be shorter» encima.

Es el `NPC_NO_DROPS` del 82 —un valor de un bloque muerto con la misma cara que
uno vivo— pero en C++ y sin horneado de por medio. Lo que lo destapó: buscar
dónde empezaba la función y encontrar `1529: }*/` antes que ninguna firma.

> *Antes de citar una línea del motor, comprueba que no está dentro de un
> comentario que empezó cien líneas antes. Una cadena que no se usa se lee igual
> de bien que una que sí.*

Y la segunda mitad de la trampa: la medida que me corrigió vino de otra sesión
(`-e0`), que midió `szDamage` en `:1898` y no en `:1427`. **La repetí antes de
usarla**, que es lo que el 81 pide hacer con lo que llega de fuera, y resultó
correcta. El 81 costó una sesión por fiarse de una comprobación ajena; esta vez
la comprobación ajena era buena y la verificación costó un comando.

---

## 3. El formato, con sus rarezas, que se portan

```c
strncpy(szDamage, Damage.AttackHit ? UTIL_VarArgs("%.1f%s damage.", Damage.flDamage, element_code) : "", …);
//                                                           giattack.cpp:1898
msstring tdm_engrish = " ";                                 // giattack.cpp:1922
```

Cuatro cosas que parecen descuidos y son del mod:

1. **El punto final** va dentro de `szDamage`.
2. **El espacio del elemento va dentro del elemento** (`" fire"`, `" slash"`…,
   `:1871-1896`), no en el formato. Por eso un tipo que no casa da
   `3.0 damage.` sin hueco de más.
3. **`tdm_engrish` es un espacio y no la cadena vacía**, así que el mensaje
   normal acaba en **dos** espacios: `Hit Giant Rat: 3.4 slash damage.  `.
4. **En un fallo `szDamage` es la cadena vacía**, no «0 damage».

Y el corchete de resistencia **trunca hacia cero** porque es un `int()` de C: un
modificador de 0,81 da `[18% resistant]` y no 19, porque (1 − 0,81) · 100 =
18,999… Redondear es lo que escribe un puerto sin mirar.

### 3.1 Tres cosas del mod que no podemos ejercitar, dichas aquí

Medidas por `-e0`. Ninguna es nuestra y las tres van escritas donde viven
(`src/play/mensajesdecombate.js`) para que nadie las porte como si lo fueran:

- **`takedmg all` no sale NUNCA en el mensaje.** Se aplica
  (msmonsterserver.cpp:2269) pero el informe sólo recorre
  `TakeDamageModifiers` (giattack.cpp:1909), donde `all` no entra. Y es el tipo
  más declarado: **275 de 1 655** llamadas. El jefe jabalí de Edana hace
  `takedmg all .81` (`edana/boarboss.script:18`), o sea que recibe un 19 % menos
  y el HUD no dice una palabra. **La ausencia es fiel.**
- **El informe empareja con `contains` y la aplicación con `starts_with`**
  (giattack.cpp:1913 contra msmonsterserver.cpp:2276). Un daño `holy_fire`
  contra un `takedmg fire 0.5` **se anuncia resistente y no se aplica**: en el
  mod, el mensaje puede mentir.
- **El informe para en la primera coincidencia** (`break`, `:1917`) y la
  aplicación recorre la lista entera.

Hoy este puerto no lee `takedmg`, así que el modificador entra siempre a `1` y
sale el espacio — que es **lo que el mod manda cuando no hay resistencia**, o
sea el caso correcto y completo, no un valor de reposo. Cuando se lea, el sitio
por donde sale ya está escrito y probado.

---

## 4. Dos huecos que el arreglo dejó al descubierto

**El informe del golpe no salía en el espadazo que mata.** Estaba dentro del
`else` de la muerte, a propósito, para dejar sitio a la línea de «You killed».
El `DoDamage` del mod informa **antes** de que se muera nadie, así que el último
golpe se anuncia igual que los otros. Ahora va antes de la rama.

**Con servidor, la experiencia NO SE ANUNCIABA.** La rama de red nunca llamaba a
`game_xpgain`: el único aviso era la línea nuestra. Quitarla sin más dejaba el
multijugador **mudo**, y el hueco lo enseñó el arreglo. El 81 otra vez: *un
arreglo puede dejar al descubierto lo que tapaba, así que al arreglar algo viejo
hay que volver a mirar lo que se apoyaba en ello.*

Y un tercero, menor: el tipo de daño **no volvía del servidor**. El informe
lleva el elemento dentro, y el cliente no puede ponerlo si no sabe con qué tipo
acabó pegando quien lleva la manada. Ahora vuelve en el suceso
(`src/red/partida.js`), igual que el daño.

Lo que sigue **sin viajar y va declarado y no inventado**: el crítico. El dado
lo tira el cliente y el servidor sólo devuelve el daño recortado, así que por la
rama de red no hay `iAccuracyRoll` ni umbral que enseñar y el `CRIT! (n/m)` no
sale. Mandarlo es trabajo de red, no de texto; con un número inventado el
mensaje mentiría exactamente como mentía antes.

---

## 5. Cómo se mide

`test/mensajesdecombate86.test.mjs`, **18 controles**, y los textos van
**escritos a mano con su cita al lado**. Eso es la regla del 75: allí la prueba
comparaba `o.pos[2]` contra `-ADELANTE` —la misma constante que medía— y seguía
verde con `ADELANTE = 0`. Una prueba que armara el esperado llamando a
`textoDeDano` pasaría con cualquier formato, que es justo el fallo que se viene
a cerrar.

**La rotura deliberada, con el grep delante** (el 80): quitando el punto de
`"%.1f%s damage."` —y comprobando que la rotura estaba puesta, que es donde el
80 se dejó media hora— salen **8 rojas de 18**. Restaurado, 18 de 18.

Y hay un control que mira al pasado: las diez cadenas inventadas —`damage to`,
`CRITICAL!`, `left`, `flees`, `You killed`, `experience`, `You missed`,
`parried the blow`, `You are out of`, `it flinches`— no pueden volver a
aparecer en ninguno de los siete mensajes. Si alguien las reintroduce viendo una
captura, se pone roja.

### Lo que no cubre una prueba de Node

Que el texto **llegue a la esquina**. Eso lo miden las sondas, y la de
`aviso60` lo hace de paso: su muestra era literalmente `"3.4 damage to Goblin"`,
porque el 60 usó el texto de entonces para comprobar que los avisos del mapa no
se colaban entre los golpes. Actualizada al texto de verdad.

**Pasadas:** `npm test` 2 199 de 2 199 · `npx vite build` limpio ·
`sonda:aviso60` 22/22 · `sonda:golpe` 26/26 · `sonda:arco` 40/40 ·
`sonda:mordisco82` 14/14 con su pendiente declarado.

---

## 6. Lo que queda

- **`sonda:consecuencias` está en 42 de 46**, y **no es de este experimento**:
  los cuatro rojos son tres bolsas de huevos (`msarea_monsterspawn`, que es
  horneado) y el aviso a los aliados al morir, y ni `manada.js` ni el horneado
  los ha tocado nadie desde el commit `6dae71d`. Lo que sí pasó: `bichos.json`
  de los dos mapas se rehorneó hoy a las **08:25**, después de `guiones.json` y
  de `malla.json`. El 81 ya avisó de esto —*un horneado parcial es una medida
  vieja con cara de nueva*— y el 82 de que `mapa:bichos` sin `--mapa` sólo hace
  Gate City. **Queda por diagnosticar**, y por quien lleve el censo.
- **El corchete de resistencia** no puede salir hasta que se lea el comando
  `takedmg` (npcscript.cpp:1057-1104). El sitio está escrito y probado; lo que
  falta es la lectura, y con ella las tres discrepancias del §3.1, que se portan
  como están.
- **El `CRIT!` por la rama de red**, por lo del §4.
- Los **cuatro mensajes del motor** que este puerto no tiene todavía y que
  salieron en el catálogo: `%s misses you.` (está escrito y nadie lo llama
  —falta el suceso de «un bicho me ha fallado» en el camino del jugador—),
  `You pick up %i gold coins from %s`, `Warning: you are carrying too many
  items! (%i/%i)` y los tres de agotarse al correr. Se apuntan, no se cuentan.

### Y una cosa que no es un hueco

El catálogo entero de lo que el mod escribe en esta esquina son **62
`SendEventMsg`**, y muchos siguen sin camino en este puerto porque el mecanismo
tampoco está (robar, despellejar, el almacén, las ofertas entre jugadores). No
se apunta como deuda de texto: el texto llega cuando llegue el mecanismo. Lo que
este experimento cierra es otra cosa — **que lo que YA sale por ahí sea lo que
el juego dice y no lo que nos pareció que diría.**
