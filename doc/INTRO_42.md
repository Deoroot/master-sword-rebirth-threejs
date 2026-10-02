# 42 — Cómo te recibe el mapa

> `npm run mapainfo` · `npm run sonda:intro42` · `src/play/intro.js`

Gate City **se declara a sí mismo un mapa de nivel 10-25**, el juego lo dice en
la cara al entrar, y en este puerto no lo decía nadie. Un personaje recién hecho
—12 puntos de vida— entraba a un pueblo con 8 goblins, 22 enanos zombi y 3
arañas sin un solo aviso, y la primera pista era morirse.

Esto porta esos avisos. Es el paso 1 de los cuatro que se acordaron para poder
hacer pruebas serias del mapa; los otros tres son los triggers de GoldSrc, más
comandos del intérprete y parametrizar el port para que deje de apuntar sólo a
Gate City.

## Lo que decía el usuario, y en qué se corrigió

La queja era «gatecity es un mapa nivel 10-15 y eso parece que falta». Lo del
aviso que falta era exacto. La banda no: el guion dice **10-25**.

```
setvarg G_MAP_DIFF "Levels 10-25 / 100-400hp"
setvarg G_WARN_HP  100
                              MSCScripts/scripts/gatecity/map_startup.script
```

Y Edana, para comparar, dice `"(Beginner/Safe Area)"` con `G_WARN_HP 0`.

## La cadena: tres eventos y dos retardos

Todo está en `player/player_main.script`, y **no es un cartel de carga**:

| dónde | cuándo | qué |
| --- | --- | --- |
| `:1025-1030` `game_player_putinworld` | al aparecer | si no se ha presentado ya y el mapa tiene nombre → `callevent 10.0 give_map_intro` |
| `:525-533` `give_map_intro` | +10 s | `infomsg` con el nombre y la descripción → `callevent 3.0 give_map_diff` |
| `:552-557` `give_map_diff` | +3 s (13 en total) | `infomsg "Intended Difficulty"`, y si te viene grande `infomsg "WARNING"` |

Diez segundos. Llega cuando ya estás andando, no en la carga. Portarlo al
instante habría sido otro juego, y es de las cosas que sólo se saben leyendo el
guion.

### Tres cosas que no se adivinan

1. **Sin nombre no hay nada.** El guardia de `:1027` es sobre `G_MAP_NAME`, así
   que un mapa que no se presenta **tampoco avisa de su dificultad aunque la
   declare**. Va portado con el fallo.
2. **`GAVE_MAP_INTRO` es una vez por mapa, no por vida.** `game_respawn` no lo
   borra: mueres, reapareces y no se repite.
3. **El umbral se mide en vida máxima, no en nivel.** Porque en Master Sword no
   hay nivel — ver `src/play/nivel.js`. `game.monster.maxhp` sale de
   `pMonster->MaxHP()` (`scriptcmds.cpp:1391`) y en el guion del jugador el ente
   del script eres tú.

El `if game.monster.maxhp >= 5` de en medio es un guardia suelto, del estilo de
`if !EXIT_SUB`: corta el evento. Cinco es la vida de un personaje con los tres
atributos a 1 (`5 + 0 + 0 + 0`, `playershared.cpp:1057`), o sea que sólo excluye
a quien todavía no tiene ficha.

## Los cuatro valores tienen DOS fuentes, y se contradicen

El `worldspawn` de `gatecity.bsp` dice `maptitle "Gatecity by DrKill"`; su
`map_startup.script` dice `"Gatecity"`. **Gana el guion**, y no por gusto:
`world.script` resuelve sus `#include` en orden y `#include` llama a `Spawn()`
donde aparece (`script.cpp:5255`).

```
:19   #include [server] world/sv_world        ← carga lo del .bsp
:27   #include [casual] $currentmapscript     ← carga el map_startup, y pisa
```

Y se puede comprobar sin discutirlo: el `worldspawn` de Edana trae los
marcadores del editor sin tocar —`maptitle "My Map Name"`, `mapdesc "A brief
description of my map"`— y en el juego Edana se llama «The Village of Edana».
Si ganara el `.bsp`, se llamaría «My Map Name». `npm run mapainfo -- edana` lo
enseña.

`G_MAP_DIFF` **sólo existe en el guion**: no hay clave de `worldspawn` que lo
ponga. `world.cpp:693-709` sólo conoce `hpwarn`, `mapdesc` y `maptitle`.

### Una trampa del motor

Los tres que sí vienen del `.bsp` se leen con `msstring::len() > 1 ? valor :
"0"` (`script.cpp:4616-4644`). Una descripción de un solo carácter **no se
convierte en vacío: se convierte en la cadena `"0"`**, y ese cero es lo que se
guarda y lo que se vería. Va portado tal cual.

## Lo que se ve ahora

```
a los 10 s   Gatecity — This Dwarven capital is carved deep inside the mountains.
a los 13 s   Intended Difficulty — Levels 10-25 / 100-400hp
a los 13 s   WARNING — This area maybe too difficult at your level!
```

El tercero sólo si tu vida máxima está entre 5 y 100. Con 150 no sale.

«WARNING» va en rojo, y **eso es lo único que decide este puerto**: el motor
manda los tres por el mismo `infomsg` y es su ventana la que los distingue. Aquí
no hay esa ventana —`src/play/npcguion.js:143` ya lo decía— y la consola de
sucesos sí tiene tipos, así que se usa el que hay. Queda apuntado como deuda: la
ventana de `infomsg` no está portada.

El texto del aviso va literal, con su falta de ortografía incluida — dice
«maybe» donde querría decir «may be». Una cita reescrita ya no es una cita.

## Cómo se comprobó

**17 comprobaciones de Node** (`test/juego_intro.test.mjs`) sobre la regla, y
**14 controles en un Chromium** (`sondas/intro42.mjs`) sobre lo que llega a la
pantalla. La sonda entra **por el menú, sin `?map=`**, porque la presentación la
dispara aparecer en el mundo.

Y las dos capas se rompieron a propósito, que es la defensa que este proyecto
aprendió a la mala:

| rotura | qué se puso rojo |
| --- | --- |
| que gane el `.bsp` en vez del guion | 1 de Node |
| `<=` en vez de `<` en el umbral | 1 de Node |
| quitar el guardia del nombre | 1 de Node |
| los 10 s a cero | 2 de Node |
| quitar el cableado de `main.js` | **3 de la sonda** |
| que salgan los tres de golpe, sin retardo | **2 de la sonda** |

### El control que había que poner antes de mirar nada

Al aparecer, la consola **ya tiene texto**: «Sonda arrives at…» y la línea de
teclas. O sea que «la consola dice algo» habría estado verde sin que este
experimento existiera — el fallo de siempre, el control que lee el valor de
reposo. Por eso la sonda mide primero que a 1 s los tres avisos **no** están, y
sólo después que a los 11 y a los 14 sí.

Y una que mordió al escribirla: la consola **parte las líneas largas** para que
quepan, así que «carved deep inside the mountains» llegaba cortada en dos y un
`includes` sobre el texto unido con saltos de línea daba rojo con todo bien.
Se buscan sobre el texto pegado.

## Lo que esto NO arregla

Sigue sin poderse jugar Gate City desde cero: ahora el juego **avisa** de que te
viene grande, que era lo que faltaba, pero la banda 10-25 sigue ahí y los
goblins siguen pegando igual. Eso es lo que atacan los pasos 2 a 4.
