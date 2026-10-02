# Experimento 66 — Lo que le afecta al jugador se lo hace un objeto

> «ya tenemos claro mas o menos como funciona el jugador y a partir de eso
> tambien podremos saber que lo afecta»

El 64 descubrió que el jugador es una entidad con guion; el 65, que lo que
faltaba no era portar comandos sino **llamar**. Éste contesta la pregunta del
usuario, y la respuesta es corta: **casi todo lo que le pasa al jugador se lo
hace un objeto que lleva encima**, y la interfaz es una línea.

```
{ game_deploy   callexternal ent_owner bloodstone_toggle 1 }
                               items/item_ring_percept.script:33-36
```

```
npm test                       1 610  (eran 1 571)
npm run sonda:objetos66        11 de 11   (nueva)
npm run sonda:jugador64        16 de 16
npm run sonda:tienda60         20 de 20   (era 19 de 20, y la roja era MÍA)
```

---

## 1. El censo, primero. Y el primer hallazgo es contra mí

Antes de tocar nada se contó quién le habla al jugador desde fuera:

| | |
| --- | --- |
| eventos del jugador que un objeto llama (`callexternal ent_owner`) | **79** |
| de ésos, los que su guion tiene | **63** |
| y los que **corren enteros** hoy | **23** |
| los que este puerto llamaba | **0** |

Cero. Porque `llamarExterno` —el gancho de `callexternal`— era un **no-op en los
dos entornos**: el de los NPC (`npcguion.js:222`) y el del jugador. Ningún objeto
de Master Sword había encendido nunca nada.

Y en `NEXT_SESSION.md` estaba escrito lo contrario, por mí, un experimento antes:

> «los anillos sí llaman al guion del jugador —`bloodstone_toggle`, que ya corre
> y está probado—, así que la mitad del camino está hecha»

El único sitio del proyecto que llamaba a `bloodstone_toggle` era
`test/juego_jugador64.test.mjs:228`, **a mano**. Es la variante del 59 —la prueba
construye la llamada que el llamador no hace— con el agravante de que **me la
creí leyendo mi propia prueba en verde**. Corregido al lado en
[doc/JUGADOR_64.md](JUGADOR_64.md).

De los 16 que el jugador **no** tiene, algunos no son un hueco nuestro: están
comentados en el propio mod (`//{ ext_nopush_on`, `player/externals.script:917`)
y un objeto los sigue llamando. Eso es fiel, no roto.

---

## 2. Y antes de eso, un fallo del cargador que llevaba escondido desde siempre

Al mirar cómo se cargan los guiones de objeto salió esto, que es lo más gordo
del experimento y no tiene nada que ver con los objetos en sí.

`cargarGuion` subía **todos los `#include` al principio**, con un comentario
encima que decía «en el sitio en que aparece» y hacía lo contrario. El motor los
resuelve dentro del analizador de líneas, en su línea:

```cpp
else if (!_stricmp(TestCommand, "#include")) {
  ...
  bool fSucces = Spawn(FileName, m.pScriptedEnt, ...);
                                     script.cpp:5229, 5255
```

Y eso decide números, porque **`const` gana el primero**:

```cpp
for (int i = 0; i < m_Constants.size(); i++)
  if (m_Constants[i].Name == VarName) { AddConst = false; break; }
                                     script.cpp:5419-5433
```

Un guion de Master Sword está escrito justo para aprovecharlo: **sus números
arriba, el `#include` que dice qué es debajo.** Con los `#include` subidos, cada
entidad se quedaba con los valores de su plantilla.

### Lo que costaba, medido

**593 de los 760 objetos** tenían algún `const` con el valor de su plantilla,
**2 623 en total**. Y en lo que se juega hoy:

| | antes | ahora |
| --- | --- | --- |
| `monsters/goblin` `SOUND_DEATH` | `none` | `monsters/goblin/c_goblin_dead.wav` |
| `monsters/spider` `PARRY_TYPE` | `parried!` | `dodged!` |
| `edana/urdauf` `CHAT_AUTO_HAIL` | `0` | `1` |

El goblin de Gate City **moría en silencio** —`playsound 0 5 SOUND_DEATH`,
`monsters/base_npc.script:178`, y `playsound` está portado—, la araña decía
«parried!» cuando lo que hace es esquivar, y dos vecinos de Edana no te saludaban
al acercarte.

### Y el que se lleva el premio: los pergaminos

```
const BASE_SPELL_SCRIPT "magic_hand_div_rejuvenate"
                               items/scroll_rejuvenate.script:2
```

Ese `const` decide **qué hechizo te enseña un pergamino**. La plantilla
`items/base_tome` trae `magic_hand_fire_dart`, y ganaba ella:

> **61 de los 63 pergaminos del juego enseñaban Fire Dart.**

Las tiendas de los dos mapas portados venden más de treinta. Todos eran el mismo
hechizo.

**Y nada de esto ponía nada rojo**: 1 571 pruebas y las sondas seguían verdes con
los 2 623 valores mal. Fila nueva en el apartado 4 de CLAUDE.md, y prueba con el
caso mínimo en `test/guiones_orden66.test.mjs` — que lleva **el cargador viejo al
lado**, porque si los dos dieran lo mismo el control no mediría nada (la lección
del 50).

De paso el recorrido pasa a estar **en un sitio**: `src/play/cargador.js`, con el
lector inyectado. El disco para el extractor y la tabla horneada para el
navegador, misma función — que es lo que el 65 aprendió con la cámara duplicada.

---

## 3. El objeto, como entidad

`tools/objetosguion.mjs` hornea **los objetos alcanzables en los dos mapas
portados**: lo que venden sus tiendas, lo que trae un personaje nuevo y **los
hechizos que enseñan esos pergaminos** —esa cadena hay que seguirla, o el caso
del usuario no entra—. Son **172**.

No se hornean los 760 por tamaño, y la forma de guardarlo es la del motor:

| | eventos | JSON |
| --- | --- | --- |
| un guion resuelto por objeto | 9 447 | **7,5 MB** |
| los archivos una vez + la lista de `#include` | 791 | **0,7 MB** |

Diez veces menos, y es lo que hace el motor: cachea los scripts y los recorre por
entidad.

### El ciclo de vida, con los parámetros del motor

```cpp
pItem->CallScriptEvent("game_spawn");
pItem->CallScriptEvent("game_deploy");
Params.add((CharData.Gender == GENDER_MALE) ? "male" : "female");
Params.add("char_menu");
pItem->CallScriptEvent("game_wear", &Params);
                                     playershared.cpp:1524-1544
```

Dos detalles que se copian porque el guion los mira:

- **`game_wear` lleva quién lo llamó.** `"char_menu"` al cargar el personaje y
  `"CGenericItem::WearItem"` al ponértelo jugando (`genericitem.cpp:1134`). Y son
  **tres** parámetros al vestir y **dos** al cargar, porque por la ruta de carga
  no hay dueño todavía — el propio mod lo dice al lado: «Can't do this way,
  don't have data for m_pOwner».
- **Al empuñar, el motor avisa al JUGADOR antes que al objeto**:
  `m_pOwner->CallScriptEvent("game_equipped", …)` y **luego** el `game_deploy`
  del objeto (`genericitem.cpp:679-683`). `game_equipped` corre entero.

---

## 4. El caso del usuario, y su memoria era exacta

> «es posible que el guion de regeneracion sea llamado por el hechizo de
> regeneracion, recuerdo que cuando lo equipabas tu vida regeneraba rapidamente»

Está escrito, y **nadie lo llama**: son dos bucles que arrancan por existir,
porque `repeatdelay` lo resuelve el cargador (`script.cpp:5377-5382`).

```
{ enable_passive_regen_check
	repeatdelay 1.0
	if FAN_LOOP == 0
	if ( REGEN_DELAY <= game.time ) { setvard FAN_LOOP 1 }
}
{ passive_regen
	repeatdelay 0.5
	if FAN_LOOP >= 1
	...
	local MY_SKILL $get(ent_owner,skill.spellcasting.divination)
	multiply MY_PASSIVE_RATE 0.1
	add MY_PASSIVE_RATE 4
	if ( MY_CUR_HEALTH < MY_MAX_HEALTH ) givehp MY_PASSIVE_RATE
}                      items/magic_hand_div_rejuvenate.script:155-179
```

Uno abre la puerta cuando pasa el tiempo de preparación y el otro cura
`divinación × 0,1 + 4` **cada medio segundo**. Contra el `player_regen_hp` del
jugador —1 de vida cada doce segundos— es otro orden de magnitud, y se cura
**por llevarlo encima, sin lanzarlo**.

Y el reenvío también es del motor, que es lo que hace que te cure a **ti** y no
al hechizo:

```cpp
float CGenericItem::Give(enum givetype_e Type, float Amt) {
  if (m_pOwner) return m_pOwner->Give(Type, Amt);   //Pass it to my owner
                                     genericitem.cpp:2298-2302
```

### Tres cosas que hubo que arreglar para que eso corriera

1. **`givehp` con UN parámetro se descartaba en silencio.** La firma es
   `givehp [target] <amt>` (`scriptcmds.cpp:3434, 3443-3449`) y el puerto pedía
   dos. El guion del jugador siempre escribe `givehp ent_me …`, así que su
   regeneración funcionaba y el hueco no se veía; **los objetos lo escriben con
   uno**, y ésos no curaban nada.
2. **`$get(…, skill.…)` no estaba portado**, y es lo que gradúa casi todo efecto
   de objeto. Nuevo `src/play/habilidad.js` con las reglas del motor, que son
   más de las que parecen — ver el apartado siguiente.
3. **`maxhp` no existe.** El máximo de vida en Master Sword **no se guarda**: se
   deriva de las nueve habilidades cada vez (`msmonstershared.cpp:514`). El
   entorno caía a `personaje.vidaMax`, que el juego no pone, así que valía lo
   mismo que la vida y la guarda `if ( MY_CUR_HEALTH < MY_MAX_HEALTH )` era
   **falsa siempre**. El objeto corría, pedía cosas y no curaba.

---

## 5. `skill.…`, que tiene más reglas de las que parece

Cuatro que no se adivinan (`scriptcmds.cpp:1651-1681`):

- **Las subhabilidades se buscan con `contains`, no con igualdad**, así que
  `.prof` vale para `proficiency` y `skill.x.divination.ratio` funciona.
- **Los índices de magia y de armas se solapan** —`.prof` y `.fire` son los dos
  el 0— y no es un fallo: el índice es la posición dentro de las propiedades de
  **esa** habilidad, y una de armas tiene tres mientras `spellcasting` tiene
  cinco.
- **`.max` se comprueba ANTES de mirar si la habilidad existe**, así que
  `skill.no_existe.max` contesta el tope igual. Portado así.
- **Y la trampa de los dos `GetSkillStat`.** Sin propiedad el motor llama al de
  un argumento, que **no es** el de dos: `GetSkillStat(int)` es
  `GetStat(idx, 1)` (`msmonster.h:416`) y acaba en `CStat::Value()`, la **media
  redondeada con suelo de uno**. Ni la suma ni la propiedad 0. Con (10, 20, 30)
  las tres cuentas dan 60, 10 y **20**, así que el control discrimina.

---

## 6. Un tope que no es un `max`, y una sonda que medía un estado imposible

La sonda hería al personaje a 20 de vida y leía **−5**: la vida bajaba al curar.
El juego estaba bien.

```cpp
float AddAmount = V_min(Max - *Current, Amt);   //Max amount that can be added
AddAmount = V_max(-*Current, AddAmount);        //Max health that can be taken
*Current += AddAmount;
                                     msmonsterserver.cpp:1971-1999
```

`V_min(Max - Current, Amt)` sale **negativo** cuando ya estás por encima del
máximo: en Master Sword curar a alguien pasado de vida **se la baja al tope**. Y
un personaje nuevo tiene **15** de vida máxima, así que herirlo a 20 era un
estado que el juego no produce.

---

## 7. Lo medido

`npm run sonda:objetos66`, Chromium de verdad, **11 de 11**:

| | |
| --- | --- |
| al nacer | **5 objetos** corriendo su guion: las tres fundas, el saco y la espada |
| al meterlo en la mochila | arranca su guion — es la costura de comprar |
| sus bucles | los dos armados **sin que nadie los llame** |
| la vida, en seis segundos | **1 → 15** con el hechizo · **1 → 1** sin él |
| lo que le pide al jugador | 8 peticiones, **8 contestadas** |
| al quitarlo | se apaga: no cura desde el limbo |

**Dos roturas a propósito, y las dos enseñaron algo:**

1. Desconectar el paso de los objetos en el bucle de fotogramas → **8 de 11**. Y
   el control «la vida sube sola» **se quedó verde con +1**, que es la
   regeneración del propio jugador: el apartado 4 en su forma más pura, el valor
   de reposo pasando la prueba. El umbral pasó de `> 0` a `> 3`, que es más de
   lo que el jugador puede dar solo en esa ventana.
2. Cortar sólo la respuesta del jugador → **10 de 11**, y la roja es exactamente
   «y el jugador CONTESTA». Las dos mitades del camino están separadas, que es la
   lección del 60.

**Y una roja que era mía, en la sonda de al lado.** `sonda:tienda60` bajó a 19 de
20 con un `ReferenceError` al comprar: llamé a la función de montaje **por su
nombre** desde otro ámbito, y `?.()` no salva de un `ReferenceError`. Ahora va
por un asa de módulo y vuelve a 20 de 20. No hizo falta escribir ningún control:
sólo pasar la sonda vecina.

---

## 8. Lo que sigue faltando

- **El 57 % de los eventos de objeto corre entero.** Lo que más desbloquearía
  son `cancelattack` (2 195 eventos con un solo comando que falta) y
  `setviewmodelprop` (2 095), y los dos son baratos.
- **Los 588 objetos que no se hornean.** Es cambiar una lista, no el formato.
- **Los 40 eventos del jugador que un objeto llama y no caben** —auras, escudos
  de repulsión, cambios de cuerpo—, casi todos por `clientevent` y `svplaysound`.
- Y sigue en pie lo de antes: `sonda:arranque36` se cae en el control 22 de 30,
  `sonda:intro42` va 11 de 14, y vender está escrito y sin medir desde el 60.
