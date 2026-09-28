# Experimento 22 — El mundo vivo, esta vez de verdad

> «los npc del templo son estáticos como debe ser pero los enanos y los humanos
> fuera que a excepción de algunos que se mueven, la mayoría se deberían estar
> moviendo pero estan en una animación idle y parece que parpadean entre
> animaciones, no se porque»
>
> «quisiera evaluar el sistema de exp correctamente para prevenir problemas,
> como no estamos usando un servidor central seria lo conveniente dejar
> ms_central habilitado por defecto o algo asi»

Dos cosas, y la primera es la misma que el 21 pero peor, porque el 21 ya iba
sobre eso.

**819 pruebas y 40 de 40 controles** (`npm run sonda:mundo`), el resto de la
batería en verde y `public/` sin tocar.

---

## 1. El paseo del 21 era código muerto en la partida

El 21 arregló el paseo, lo probó con 28 controles en verde, escribió que 43 de
los 53 con `roam 1` se mueven… y el juego no lo llamaba.

```js
// src/render/bichos.js, cazar(), antes del 22
} else {
  i.destino = null;
  if (i.andando !== null) { i.pon(i.quieto()); i.andando = null; }
}
...
this.pasear(dt, arnes, (i) => !i.cazador && !i.muerto);
```

El bucle de fotogramas llama a `bichos.cazar`, y `cazar` paseaba a los bichos
**sin ficha de combate**. En Gate City eso son **cero de 69**: los 69 tienen
`ia`, así que los 69 tienen cazador. El filtro no cogía a nadie, y el `else`
plantaba a todo el que no estuviera persiguiendo a alguien.

Y la sonda del 21 no lo vio **por lo mismo que las dos de IA no vieron el
interruptor apagado durante cuatro experimentos**: llama a `probe.vivo.pasear`,
que llama a `bichos.pasear` a mano. Medía el paseo sin medir si el juego lo
llama. Segunda vez, con la lección escrita en el documento anterior.

### Lo que hace el motor, que no tiene ese `else`

```cpp
dbg("SetMoveDest");   SetMoveDest();
dbg("SetWanderDest"); SetWanderDest();
                                  msmonsterserver.cpp:569-574
```

Las dos, en ese orden, siempre, para todos. No hay «o cazas o paseas». Quien
decide cuál manda no es un `if`, es **una sola casilla de destino compartida**:

```cpp
void CMSMonster::SetMoveDest() {
  if (!HasConditions(MONSTER_HASMOVEDEST)) return;        // :995
  ...
}
void CMSMonster::SetWanderDest() {
  if (!HasConditions(MONSTER_ROAM)) return;               // :1057
  if (!m_NextNodeTime && time >= m_NodeCancelTime) m_NextNodeTime = time + m_RoamDelay;
  if (m_NextNodeTime && time >= m_NextNodeTime) { ...elegir sitio... }
}
```

y el reloj que arma el paseo lo arma `StopWalking` al soltar el destino:

```cpp
ClearConditions(MONSTER_HASMOVEDEST);
m_NextNodeTime = gpGlobals->time + m_RoamDelay;           // :1407-1408
```

Por eso un goblin que te pierde de vista **se pone a pasear él solo**, sin que
nadie se lo diga y dos segundos después. El paso de paseo se ha sacado a
`pasoDePaseo()` y `cazar` cae en él cuando no hay a quién perseguir; cuando sí
lo hay, el vagabundo se retira (`llegado()`, que es el `StopWalking` de arriba)
y la caza se queda la casilla.

Medido por el camino que corre el juego, sin llamar a `pasear`:

```
10 s del BUCLE DEL JUEGO: 40 se movieron, el que más 6.89 m
clavados que se movieron: 0
```

---

## 2. El parpadeo: pedir la animación que ya está puesta

El motor lo dice dos veces y las dos con el mismo cuidado:

```cpp
int animDesired = LookupSequence(TorsoAnimName);
if (animDesired != m_pOwner->pev->sequence)   //Continue playing the same
  SetAnim(TorsoAnimName);                     //uninterrupted animation
                          monsteranimation.cpp:160-162  //until told otherwise

if (pev->sequence != iSequence || !m_fSequenceLoops) pev->frame = 0;
                                                     monsters.cpp:1238
```

Rebobinar **sólo si la secuencia cambia, o si no es de bucle**. Nuestro `pon`
hacía `stopAllAction()` y `reset().play()` siempre.

Y eso no es una optimización, es lo que se ve: el 21 metió el re-sorteo de la
pose al acabar cada ciclo, y `npc/human1.mdl` saca `idle1` en **50 de 65**
sorteos. Tres de cada cuatro re-sorteos piden la que ya está puesta y la
rebobinaban a mano. Medido en diez segundos de pueblo: **38 rebobinados
ahorrados** por la guarda.

Los golpes y las muertes sí rebobinan, y también con la regla del motor: no son
de bucle (comprobado en las 131 secuencias horneadas: ninguna de las ocho
animaciones de acción lleva el flag), y además el motor las pasa por
`CAnimOnce`, que hace `SetAnim` incondicional.

### El otro temblor: chocar no suelta el destino

Con la guarda puesta quedaba un bicho cambiando de animación una vez por
segundo sin moverse del sitio. Eran las cuatro ratas hundidas:

> andar → chocar → soltar el destino → pose de quieto → esperar 2 s → andar → …

Ese ciclo era nuestro. El motor no lo tiene: el destino sólo se cae **al
llegar** (`StopWalking` desde `SetMoveDest`, línea 1026) o cuando vence el
`m_NodeCancelTime` de siete segundos. Chocar no suelta nada — el bicho sigue
empujando contra la piedra con la animación de andar puesta, que es exactamente
lo que se ve en MSR cuando a un monstruo le falla el grafo de nodos. Feo, pero
es el suyo, y no parpadea.

`avanzar` ya decía por qué se había parado, así que distinguir las dos cosas es
una línea:

```js
if (i.frenado === "ya esta cerca") { i.vagabundo.llegado(); i.destino = null; }
```

De 469 rebobinados en 20 s a 333, y el peor de 18 a 11 — que son los enanos
cambiando de `idle` a `nod` cada dos segundos, o sea el juego.

---

## 3. La experiencia: dos sistemas, y el que preguntabas

Tu descripción era correcta y son **dos** mecanismos distintos, los dos en
`monsters/base_self_adjust.script`:

| | qué hace | cuándo corre |
|---|---|---|
| `npcatk_self_adjust` | sube al MONSTRUO de nivel por tramos de vida total del grupo | sólo si su script pide `set_self_adj` |
| `npcatk_set_skill` | ajusta la EXPERIENCIA que reparte | **siempre**, en el `npc_post_spawn` de todos |

### El escalado por vida total

```
const NPC_ADJ_TIERS            "0;500;1000;2000;3000;5000"
const NPC_ADJ_HP_MUTLI_TOKENS  "1.0;2.0;3.0;3.5;4.0;5.0;"
```

Se compara desde el token **1** (el 0 nunca se usa) y con `>` estricto, así que
500 justos siguen siendo nivel 0. Y los multiplicadores no se multiplican:

```
local ADD_NPC_HP_MULTI $get_token(NPC_ADJ_HP_MUTLI_TOKENS,NPC_ADJ_LEVEL)
if ( NPC_HP_MULTI == 1 ) subtract ADD_NPC_HP_MULTI 1
add NPC_HP_MULTI ADD_NPC_HP_MULTI
```

Es una **suma** con un descuento de 1 que sólo cae si el bicho no traía
multiplicador propio. Con el caso normal sale el número del tramo; a un ×2 del
mapa, el tramo 2 le deja en **5** — ni 6 ni 3. Y el nivel se le pone en el
nombre: `Goblin II`, `III`, hasta `VI`.

La vida que mide es `pPlayer->MaxHP()` sumada, **máxima y no actual**: un
jugador a un punto de vida cuenta entero.

**En Gate City no lo pide nadie.** Ni los 25 scripts del pueblo ni las entidades
del `.bsp` nombran `set_self_adj`; ahora se lee del script (`ia.seAjusta`) y la
sonda lo dice: `0 lo piden`. El sistema está portado entero de todas formas,
porque lo que no se mide no se sabe que está apagado.

### El goblin no vale 25: vale 26

```
setvard NPC_ALL_XP_ADJ 1
...                                    (nada que sumar, si no hay multiplicadores)
if ( !NO_EXP_MULTI ) expadj NPC_ALL_XP_ADJ noscale "apply external adjustments"
```

y `expadj`:

```cpp
if (Params[0].contains(".")) { ... m_SkillLevel *= atof(Params[0]); }
else m_SkillLevel += atof(Params[0]);        npcscript.cpp:445-465
```

**Lo que decide entre multiplicar y sumar es el punto decimal del texto.** No el
valor: el texto. `NPC_ALL_XP_ADJ` vale la cadena «1», sin punto, así que la
línea que quería decir «multiplica por uno, o sea no toques nada» **suma uno**.

La otra mitad de la errata es que el motor escribe los números con `%.2f`
(`scriptcmds.cpp:4220`), así que en cuanto un `add` toca la variable pasa a ser
«2.50» y `expadj` cambia de sumar a multiplicar sin que nadie escriba el cambio
en ningún sitio.

Medido sobre el horneado de Gate City:

```
Goblin                   su script dice   25 -> vale 26
Leaping Cave Spider                       12 -> vale 13
Spitting Cave Spider                      70 -> vale 71
Dwarven Zombie                            40 -> vale 41
Dwarven Zombie Bowman                    200 -> vale 201
Giant Rat                                  3 -> vale 4
```

Y los que no dan ninguna siguen sin dar ninguna: el `if NPC_GIVE_EXP > 0` corta
antes, así que el cofre del tesoro y los doce tenderos no pasan a valer un punto.

Dos erratas más en el mismo archivo, portadas también: `add NPC_ALL_XP_ADJ
NPC_BONUS_XP_RATO` (le falta la I, así que el bonus por bicho no funciona) y el
`divide ADJ_RATIO NPC_HP_MULTI` de la línea 294, que escribe en una variable que
no es `L_ADJ_RATIO`.

### Y la respuesta a lo del central: **apagado**

Tres razones, y la primera la dice el propio motor:

```cpp
if (atoi(CVAR_GetString("ms_central_enabled")) == 0) {
  float fakehp = atof(CVAR_GetString("ms_fake_hp"));
  if (fakehp > 0) total_hp = fakehp;
}                                            util.cpp:935-940
```

`ms_fake_hp` y `ms_fake_players` **sólo se leen con el central apagado**. El
motor declara que «central apagado» es el modo de pruebas, el que te deja
fingir la partida. Encenderlo apaga la única forma de medir el escalado sin
diez jugadores delante.

La segunda: no hay servidor central al otro lado, así que encenderlo no conecta
con nada — sólo enciende los multiplicadores de su economía.

La tercera es el tamaño de esos multiplicadores:

```
expadj 2.0 noscale "FN"        //+200% XP on FN
expadj 4.0 noscale "FNBoss"    //+400% XP for bosses on FN
//+50% XP/player beyond the first
```

Con un solo jugador el goblin pasa de 26 a **78**. Es decir, encenderlo
**triplica la curva** sin que haya nadie más en el servidor — y daría unos
umbrales que no son los de nadie.

De paso, una errata más en ese bloque:

```
if ( L_N_PLAYER_ADJ > 1 )
subtract L_N_PLAYER_ADJ 1        <- sólo esta línea cae bajo el `if`
multiply L_N_PLAYER_ADJ 0.5
add L_N_PLAYER_ADJ 1
```

El `if` de una línea se come sólo la siguiente, así que con **un** jugador el
ajuste también sale 1,5. Uno y dos jugadores dan lo mismo. Portado con la
errata.

Todo esto vive en `src/juego/servidor.js` con los tres interruptores en un
sitio (`PARTIDA`), así que encenderlo para medir es cambiar un booleano.

---

## 4. Lo que las sondas ya no podían medir

Que el mundo se mueva le quita el suelo a cualquier control que dé por hecho
dónde está alguien. Dos se pusieron rojos una vez de cada tres:

- **el grito al morir** mide quién queda dentro de 294 unidades;
- **el escudo** necesita un goblin pegado que pegue.

Estaban midiendo el dado. Se les para el `roam` —y sólo el `roam`, que es la
condición que el motor consulta, así que no hay nada que inventar— con
`probe.vivo.congelarPaseo(true)`. La caza sigue encendida, que es lo que esas
dos sondas quieren.

Y el control del goblin que reacciona solo probaba únicamente el hostil 0;
ahora recorre los ocho hasta encontrar uno con línea de visión, con un control
nuevo al lado que salta si no lo encuentra — porque si ninguno ve al jugador,
los dos de después miden la geometría del mapa y no la IA.

---

## 5. Qué se toca

| archivo | qué |
|---|---|
| `src/juego/servidor.js` | **nuevo** — `PARTIDA`, `vidaTotal`, `jugadoresActivos`, los tramos, `expadj` y la cadena entera |
| `src/render/bichos.js` | la guarda del rebobinado, `pasoDePaseo` sacado del bucle, `cazar` cae en él, chocar ya no suelta el destino |
| `src/bsp/script.js` | `seAjusta`, `esJefe`, `reduccionDeExp` en la ficha de IA |
| `src/main.js` | `loQueVale`, `partida()`, `probe.vivo.vivir/experiencia/congelarPaseo` |
| `test/juego_servidor.test.mjs` | **nuevo**, 24 pruebas |
| `build/sondas/mundo.mjs` | de 28 a 40 controles |
| `build/sondas/{consecuencias,escudo}.mjs` | el mundo quieto para lo que mide sitios |

---

## 6. Lo siguiente

**Los proyectiles** (`charge-throw-projectile`), que es el 23 y lo que estaba
pedido desde el principio: el único tipo de ataque del motor que falta, y el
arco de partida lleva horneado desde el 18 sin disparar.

Y una anotada de hoy, que ya va por la segunda vez: **repasar la batería
buscando controles que pasarían con el juego apagado**. La regla es sencilla y
se acaba de saltar dos veces — si el control llama a la función que quiere
medir, no mide el juego.
