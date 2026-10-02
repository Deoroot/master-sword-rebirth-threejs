# Experimento 64 — El jugador también es una entidad con guion

> «parece que faltaban portar algunas cosas genericas de msr»

Sí, y la que faltaba explica a las demás. Este puerto corría los guiones de los
NPC desde el 33 y **ninguno del jugador**. En Master Sword el jugador no es un
caso especial del motor: es una entidad con su `.script` pegado, como un
goblin. De ahí salen la regeneración, los avisos de la primera vez, las
emociones, los efectos de clima y el «Your Parry value is now 2» que el usuario
echó de menos en su captura.

```
npm run jugador                27 archivos, 541 eventos, 7 de 25 caben enteros
npm test                       1 558  (eran 1 538)
npm run sonda:jugador64        12 de 12
```

---

## 1. El hueco que no tenía nombre

```
#include [server] player/player_main
#include [server] player/player_sv_regen
#include [server] help/first_transition
#include [server] help/first_death
#include [client] player/player_cl_main
#include        player/externals
                                            player/player.script:4-22
```

Son **27 archivos y 9 566 líneas**. Y el mensaje que lo enseñó no es del motor:

```
if ( OLD_PARRY != PL_PARRY ) yplayermessage ent_me Your Parry value is now TOTAL_PARRY
                                    MSCScripts/scripts/player/externals.script:696
```

Buscar «Your Parry value is now» en el código del mod no da nada, y eso era la
pista: **está en un `.script`**, como lo que dice un vendedor.

Lo primero que había que saber es cuánto de eso cabe con el intérprete que ya
teníamos. `npm run jugador` lo cuenta, archivo a archivo, como `npm run
guiones` hace con los NPC:

| cabe entero | eventos | qué es |
| --- | --- | --- |
| `help/first_death` | 1 | el consejo de la primera muerte |
| `help/first_skillgain` | 1 | el de la primera competencia |
| `help/first_party` | 1 | el del primer grupo |
| `help/first_transition` | 4 | el de la primera transición |
| `player/player_cl_main` | 7 | |
| `player/player_cl_effects` | 6 | |
| `player/player_sound` | 1 | |

Esa tabla es el censo **antes** de portar nada: 7 de 25. Con los tres comandos
que este experimento añadió —`repeatdelay`, `givehp`, `givemp`— son **9 de 25**,
porque entran `player/player_sv_regen` y `items/base_vampire`. Y la cuenta por
archivo es pesimista: por EVENTO corren enteros **253 de 541, el 47 %**, que es
el número que contesta «cuánto del jugador funciona». Los dos los imprime `npm
run jugador`, calculados.

`player/externals` pide 49 comandos que no están y `player_main` 26. Lo que más falta, con diferencia, es `cleffect` —353
usos—, que son los efectos de partículas del cliente.

---

## 2. El comando portado que no llegaba, y la ventana que nadie abría

`helptip` estaba en la lista de comandos desde el 33. Lo que hacía era esto:

```js
consejo(_aQuien, clave) { apuntar?.("consejo", clave || "(sin clave)"); },
```

Se quedaba con **los dos primeros parámetros y tiraba el título y el texto**,
con este comentario al lado: «NO llega — la ventana de consejos no está
portada». Y la ventana **sí** estaba portada, desde el 60: es la pila de ayuda
de `src/juego/mensajes.js`, arriba a la derecha y con el título verde. Su único
usuario en todo el proyecto era `window.probe`.

O sea: **un comando que no llegaba a ningún sitio y una ventana que nadie
abría, cada uno esperando al otro durante cuatro experimentos.** No daba
ningún error. Es la forma del apartado 4 con dos piezas en vez de una.

### Las dos rarezas de `helptip` que se portan

```cpp
for(int i = 0; i < Params.size() - 3; i++)
    buffer += static_cast<const char*>(Params[i+3]);
                                            scriptcmds.cpp:3608-3610
```

**El texto se pega sin separador.** `playermessage` junta sus palabras con un
espacio (scriptcmds.cpp:4243-4290) y éste no, así que `helptip ent_me x Título
hola mundo` sale «holamundo». En los scripts del juego el texto viene siempre
en una variable y no se nota; se porta porque quien escriba un `helptip` nuevo
se lo encuentra.

```cpp
if (mstipname.contains("generic")) generic_tip = true;
                                            playershared.cpp:1136-1137
```

**`generic` se comprueba con LLEVA, no con ES.** `mi_generic_2` también es
repetible. Es lo que usa Thothie para las ventanas de varias líneas.

Y una tercera que es contrato y no rareza: una clave ya vista **corta antes**
de llamar a `game_helptip`, así que el gancho del guion tampoco se dispara la
segunda vez.

El «una sola vez» es `m_ViewedHelpTips`, y **se guarda con el personaje**: su
propio bloque en el archivo (`CHARDATA_HELPTIPS1`, sv_character.cpp:322-336 y
:682-684). La primera vez que mueres es la primera vez de ESE personaje, para
siempre — no la primera de esta partida.

---

## 3. `repeatdelay`: lo que no se adivina

El guion de la regeneración es corto y tiene una pregunta sin respuesta
aparente:

```
{ player_regen_hp
	repeatdelay FINAL_REGEN_RATE_HP
	givehp ent_me FINAL_REGEN_HP
}                                           player/player_sv_regen.script:54-59
```

**¿Quién llama a `player_regen_hp`?** Nadie. No lo llama ningún script de los
2 884 ni el motor. La respuesta está en el lector de scripts, no en el
intérprete:

```cpp
else if (!_stricmp(TestCommand, "repeatdelay")) {
    CurrentEvent->fRepeatDelay = atof(SCRIPTCONST(cBuffer));
    CurrentEvent->fNextExecutionTime = gpGlobals->time + CurrentEvent->fRepeatDelay;
    KeepCmd = true;
}                                           script.cpp:5377-5382
```

**`repeatdelay` se resuelve al CARGAR el script, no al ejecutarlo.** Un evento
con `repeatdelay` **empieza a correr solo en cuanto se carga el guion**, y el
`KeepCmd = true` lo deja además en la lista de comandos para que al ejecutarse
se vuelva a armar. El propio mod lo avisa: «whether the event is called or not,
or the NPC is alive or not, has no baring on whether it'll repeat».

### Y la consecuencia que sale de leer las dos mitades

`SCRIPTCONST` es «a const, script-wide, or global variable — **loadtime only**»
(script.cpp:40), y `atof` de algo que no es un número da **0**. La
regeneración dice `repeatdelay FINAL_REGEN_RATE_HP`, que es un `setvard` puesto
por el bloque de cabecera — que corre **después**, en el primer `Think`. Así
que al armar el reloj `atof` recibe el nombre de la variable y devuelve cero:

> **La primera regeneración llega en el acto, no a los doce segundos.** A
> partir de ahí, cada doce.

Eso obliga a un orden que uno no escribiría: **primero se arman los relojes y
después corre el bloque sin nombre.** Al revés, `FINAL_REGEN_RATE_HP` ya
existiría y la primera vuelta tardaría doce segundos. Hay una prueba sólo para
eso, y otra para que el ritmo se relea cada vuelta —el anillo de sangre le
resta seis segundos— con su control sin anillo al lado.

### Corrección, el mismo día: de dónde viene la regeneración que se nota

> «es posible que el guion de regeneracion sea llamado por el hechizo de
> regeneracion, recuerdo que cuando lo equipabas tu vida regeneraba
> rapidamente»

El recuerdo es bueno y corrige lo de arriba a medias. `player_regen_hp` sigue
sin que nadie lo llame — eso está comprobado sobre los 2 884 scripts— pero **la
regeneración rápida que se recuerda no es ésa**: es un bucle **propio del
objeto**, en el script del hechizo.

```
{ passive_regen
	repeatdelay 0.5
	...
	local MY_SKILL $get(ent_owner,skill.spellcasting.divination)
	local MY_PASSIVE_RATE MY_SKILL
	multiply MY_PASSIVE_RATE 0.1
	add MY_PASSIVE_RATE 4
	if ( MY_CUR_HEALTH < MY_MAX_HEALTH ) givehp MY_PASSIVE_RATE
}                          items/magic_hand_div_rejuvenate.script:155-179
```

Medio segundo, y `divination × 0,1 + 4` de vida por vuelta. Con Divination a
40 eso son 8 puntos cada medio segundo — **16 por segundo**, contra el 1 cada
12 segundos del jugador. Son casi doscientas veces más rápido: por eso se nota
al equiparlo.

Y hay una tercera vía, que sí toca el guion del jugador: **los anillos**.

```
{ barmor_effect_activate
	callexternal ent_owner bloodstone_toggle 1
}                                 items/item_ring_percept.script:33-36
{ barmor_effect_remove
	callexternal ent_owner bloodstone_toggle 0
}
```

`bloodstone_toggle` y `manaring_toggle` son eventos de `player_sv_regen` —los
que este puerto ya corre, y que una prueba mide con su control— y el anillo los
llama al ponértelo y al quitártelo. O sea que el reparto del original es:

| | quién regenera | cada cuánto |
| --- | --- | --- |
| de base | el guion del jugador | 12 s |
| con el anillo | el guion del jugador, con el ritmo cambiado | 6 s |
| con el hechizo | **el guion del objeto**, aparte | 0,5 s |

> **CORRECCIÓN DEL 66 — la fila del anillo no era verdad, y la culpa es de una
> prueba.** Esta tabla se lee como si el anillo funcionara, y de aquí salió la
> frase que quedó escrita en `NEXT_SESSION.md`: «los anillos sí llaman al guion
> del jugador —`bloodstone_toggle`, que ya corre y está probado—, así que la
> mitad del camino está hecha».
>
> **Falso.** `bloodstone_toggle` corre, sí, pero el único sitio de todo el
> proyecto que lo llamaba era `test/juego_jugador64.test.mjs:228`, **a mano**. En
> el juego no lo llamaba nadie, porque `llamarExterno` —el gancho de
> `callexternal`— era un **no-op en los dos entornos**, el de los NPC
> (`npcguion.js:222`) y el del jugador. Ningún objeto de Master Sword había
> encendido nunca nada en el jugador de este puerto.
>
> Es la variante del 59 clavada: **la prueba construye la llamada que el
> llamador no hace**, el mecanismo funciona, la prueba lo demuestra y el juego no
> lo ejecuta. Y esta vez el que se lo creyó fui yo un experimento después,
> leyendo mi propia prueba en verde como si fuera el juego.
>
> Lo arregla el 66: [doc/OBJETOS_66.md](OBJETOS_66.md).

**Y eso deja un hueco nuevo con nombre: en este puerto los objetos NO corren su
guion.** `npm run objetos` lee sus `.script` para sacar una TABLA —peso,
tamaño, ataques, modelo, sonidos— y ahí se acaba. Los eventos del objeto
—`barmor_effect_activate`, `passive_regen`, `spell_casted`— no los ejecuta
nadie. Es la misma maquinaria que este experimento acaba de montar para el
jugador, aplicada a otra entidad.

Y no es un caso raro: **362 bucles de `repeatdelay` arrancan solos en 271 de los
2 884 scripts del juego**. Lo que este experimento descubrió del cargador vale
para todos ellos.

---

## 4. Lo medido

`npm run sonda:jugador64`, Chromium de verdad, entrando por el menú, **12 de
12**:

| | |
| --- | --- |
| el guion | montado al aparecer el personaje |
| los relojes | `player_regen_hp` y `player_regen_mp` armados **sin que nadie los llame** |
| la regeneración | vida **5 → 6** en catorce segundos, sola |
| morir (la K) | el guion enseña `help_death` |
| dónde sale | en la ventana de **ayuda**, en (686, 17) — arriba a la derecha |
| qué dice | «You have DIED!» y «you lose 5% of your gold», **que esta sonda no conoce**: sale del `.script` |
| dónde NO sale | no se ha ido también a la consola de sucesos |
| la segunda muerte | **no lo repite**, y queda apuntado en el personaje |

Lo del texto no es una floritura: **si el guion no se cargara, no habría de
dónde sacarlo.** Es lo que separa «la ventana funciona» de «el guion corre».

### Las dos roturas a propósito

| lo que se rompió | qué se puso rojo |
| --- | --- |
| el consejo se manda a la consola de sucesos en vez de a su ventana | **8 de 12**, y una de las rojas es literalmente «se ha ido también a la consola»: el fallo del 60, cazado |
| nadie llama a `game_death` | **6 de 12**: el guion cargado, los relojes armados y ni un consejo |

La segunda es el fallo del apartado 4 puesto a mano: el mecanismo entero
funciona y el juego no lo ejecuta. Se ve en seis controles a la vez.

---

## 5. Lo que NO se cuenta entre lo hecho

De los cuatro consejos que caben enteros, **sólo dos se pueden disparar**:

| consejo | por qué no |
| --- | --- |
| `game_party_join` | no hay grupos. El canal «party» del chat existe desde el 61 y no hay a qué unirse |
| `game_transition_entered` | no hay transiciones: aquí se cambia de mapa por el menú, no pisando un `ms_trigger` |

Están cargados y funcionarán solos el día que haya grupos o transiciones —hay
una prueba que comprueba que los eventos existen y que el motivo está
escrito—, pero **hoy no se cuentan**. Es lo que manda el apartado 4 cuando no
hay segundo caso: se declaran pendientes en vez de contarse entre los verdes.

Y sigue sin portar el resto del jugador, que es casi todo: `externals` (el
parry, las resistencias, las fichas), `player_main`, los efectos de clima. La
lista de la compra la imprime `npm run jugador`, ordenada por uso.

---

## 6. Un refactor que hacía falta

`tools/guiones.mjs` es un **extractor**: importarlo para usar dos funciones
ejecuta su censo entero de los 2 884 scripts. Se vio al escribir el segundo
extractor, que necesitaba `cargarGuion` y se encontró con el censo de los NPC
imprimiéndose por pantalla. La parte reutilizable —leer un `.script` con sus
`#include`— vive ahora en `tools/scriptsmsr.mjs` y los dos la importan.
