# Encargo del 33 · Las misiones

## Dónde está esto

`MasterSwordThreeJS`, repositorio <https://github.com/Deoroot/master-sword-rebirth-threejs>,
privado, `main`, tag `v0.1.0-alpha`. **819 pruebas de Node y 18 sondas de navegador
con 487 controles, todo en verde.** Los treinta y dos experimentos están en `doc/`,
uno por informe, y [ESTRUCTURA.md](../ESTRUCTURA.md) dice qué carpeta nuestra
corresponde a qué carpeta del mod.

Los cuatro paneles del personaje están portados de VGUI (29-32) y los maneja la
tabla de teclas del juego. El menú de la **F** lee las opciones de verdad de los
scripts — el alcalde de Gate City ofrece «Give Goblin's Head» porque lo dice su
`.script`, no porque lo hayamos escrito— **y elegir una no hace nada**. Ahí se
quedó.

---

## Lo que hay que hacer

**Que la misión del alcalde de Gate City se pueda hacer y terminar.** No «un
sistema de misiones»: ésa concreta, entera, de principio a fin, y con la sonda
haciéndola como la hace un jugador.

`scripts/gatecity/mayor.script` es el objetivo y está en el mapa que ya tenemos:

```
:103  { game_menu_getoptions
:112    "How many more Zombies!?"   type callback  callback zombie_countup
:121    "Ask about broken axe"      type callback  callback say_axe
:132    "Give Goblin's Head"        type payment   data item_goblinhead
                                                   callback say_ending
:162    "Collect Zombie Reward"     type callback  callback axe_em
```

O sea: una opción de pago que te quita un objeto del inventario, cuatro
retrollamadas que hacen cosas, y una condición que decide qué opciones se ven.

---

## Lo que ya está averiguado, para no volver a buscarlo

### 1. Las misiones NO están en el código del mod

`grep -i quest` sobre los 4 973 archivos de `src/game/server` casa sobre todo con
«request». El motor no tiene misiones: tiene **dos comandos de script y un
diccionario que se guarda con el personaje**.

```cpp
// quest <set|unset|dump> <player> <quest_name> <value>
// - Sets or removes quest data on a player
// - Quest data saves with characters, and can be retrieved via
//   $get_questdata(<player>,<quest_name>)
                                     scriptcmds.cpp:4844-4850
m_GlobalCmdHash["quest"] = ...ScriptCmd_Quest;                scriptcmds.cpp:171
m_GlobalGetterHash["$get_quest_data"] = ...;                     script.cpp:112
```

Y el estado de una misión es **una clave de una o dos letras**. La lista está
escrita en la cabecera de `scripts/player/player_main.script:4-22`:

```
//r  = ring quest stage (integer)
//l  = lighthouse keeper (spider,grave,crystal,food)
//f  = Felwyn Symbol/Shard quest
//b1-b9 = galat chest bank
//dl = darkness contamination level
```

**Eso es todo el modelo de persistencia.** Un `Map` de cadena a cadena colgado del
personaje y guardado con él. No hay que diseñar nada: hay que copiar eso.

### 2. Elegir una opción es una función de 120 líneas, y está localizada

```cpp
void CMSMonster::UseMenuOption(CBasePlayer* pPlayer, int Option)
                                     msmonsterserver.cpp:2914-3037
```

El camino entero, con sus cifras:

| paso | dónde |
| --- | --- |
| el cliente manda `menuselect` | `multiplay_gamerules.cpp:1576` |
| el servidor lo despacha | `client.cpp:702` |
| `Option < 0` dispara `game_menu_cancel` | `msmonsterserver.cpp:2925` |
| `MOT_SAY` habla por el jugador, `SPEECH_LOCAL` | `:2935-2937` |
| `MOT_PAYMENT` parte `Data` por espacios | `:2944` |
| `gold:N` suma al total; lo demás es `nombre:cantidad` | `:2953-2971` |
| busca el objeto recorriendo el inventario **en círculo** | `:2973-2984` |
| si falta algo: «You can't afford the payment of …» y **corta** | `:2986-2994` |
| el oro se comprueba **después** de los objetos, y no corta | `:3001-3007` |
| sólo si puede pagar, cobra: resta oro y `SUB_Remove()` cada objeto | `:3009-3015` |
| y al final, la retrollamada, con `Data` como PARAM2 | `:3018-3034` |
| `MOT_PAYMENT` que no pudo pagar llama a `CB_Failed_Name` | `:3026-3030` |
| **y la lista de opciones se borra** | `:3036` |

Los ocho tipos son `monsters/msmonster.h:143-150` y ya están portados en
`src/play/opciones.js` del 29. **Lo que falta es esta función.**

Tres cosas de aquí que hay que copiar con cuidado porque no son obvias:

- **el orden importa y es raro**: los objetos se comprueban con `break`, el oro
  sin él. Si te faltan las dos cosas, el mensaje que ves es el del objeto.
- **`SUB_Remove()` y no `RemoveItem()`**, cambiado por MiB en 2010 con la línea
  vieja comentada al lado (`:3013-3014`). Hay que mirar si eso deja el objeto en
  la lista del inventario un instante, porque nuestro inventario del 31 sí tiene
  lista.
- **`Data` viaja como segundo parámetro** por un arreglo de Thothie que él mismo
  documenta como «los docs dicen otra cosa, pero así funciona» (`:3022`). Si se
  porta según los docs, las cuatro retrollamadas del alcalde reciben vacío.

### 3. El intérprete de scripts son 14 000 líneas, y NO hay que portarlo

`script.cpp` (6 242) + `scriptcmds.cpp` (7 705), con **223 comandos** en
`m_GlobalCmdHash` (`Script_Setup`, `scriptcmds.cpp:41`). Portar eso no es un
experimento, son varios.

Y la medida dice que no hace falta para esto: de los **140 scripts con
`game_menu_getoptions`**, sólo **27 usan `quest set|unset`** y de ésos **uno solo
es un NPC** (`NPCs/lighthouse_keeper.script`). O sea que la inmensa mayoría de lo
que un NPC hace al elegir una opción es: decir algo, dar un objeto, cobrar, o
poner una variable local.

**Así que lo que se porta es el subconjunto que las cuatro retrollamadas del
alcalde necesitan, y se cuenta cuántos de los 140 NPCs quedan cubiertos con él.**
Esa cuenta es el resultado del experimento, no un adorno: dice si la puerta que
se abre es una misión o son ciento cuarenta.

---

## Cómo se mide

Las reglas de siempre, y la tercera es la que este experimento puede incumplir
más fácil:

1. **Cada regla portada con su cita `archivo:línea`.**
2. **Lo que está roto en el original se porta con el fallo**, y una prueba lo
   documenta.
3. **La sonda recorre el mismo camino que el jugador.** Un `Map` de misiones con
   pruebas de Node en verde no es una misión hecha: la sonda tiene que **pulsar la
   F delante del alcalde, elegir con el número, y comprobar que el objeto salió
   del inventario y la recompensa entró**. Si el camino de la sonda no pasa por
   `menuselect`, no cuenta.
4. **Un cero sin control positivo no es un resultado.** Aquí el control positivo
   evidente: intentar pagar **sin** la cabeza de goblin y comprobar que sale el
   mensaje y que **no** se cobró nada.
5. Documentación y comentarios en español, la interfaz en inglés.
6. **Ningún asset entra sin licencia al lado. No se mueve un byte a `public/`.**
   Lo defiende `test/procedencia.test.mjs` y ahora hay repositorio, así que va en
   serio.

Y una que este proyecto aprendió a base de perder tardes: **la partida guardada
cambia de forma.** Un personaje con diccionario de misiones tiene que poder leer
un guardado que no lo tenga, y `src/red/archivos.js` ya sabe reintentar el
`rename` de Windows tres veces. Prueba de personaje viejo, o el alfa se come los
guardados de quien lo probó.

---

## Lo que queda después, por orden de cuánto se nota jugando

1. **Las tiendas.** Son el mismo mecanismo que acabas de portar: menú de NPC más
   `MOT_PAYMENT`. Si el 33 sale bien, esto es barato.
2. **El escudo y el parry del jugador no se aplican al daño de un bicho** con
   servidor: el servidor no sabe si lo llevas desplegado (IA_28.md §8). Esto es un
   agujero de *juego*, no de contenido — te matan bichos de los que te estabas
   defendiendo.
3. **No hay reaparición de monstruos.** Matas los 69 de Gate City y el pueblo se
   queda vacío para siempre.
4. **Los contenedores del mundo** (cofres, barriles), que el 31 dejó fuera:
   `vgui_storage.cpp` está portado a medias, el panel sabe enseñar un contenedor
   pero no hay ninguno en el mapa.
5. **El grafo de navegación de los NPCs.** Hoy vagan; no van a ningún sitio.
6. **Las flechas no pasan por la comprobación de distancia** del servidor, y los
   bichos no se pelean entre ellos.
7. **La luz de los jugadores remotos**: se dibujan a luz plena.
8. **`wss://` y cuentas**, que es lo que hace falta para que esto se pueda servir
   a alguien que no seas tú.
9. **La deuda**: `mainGateCity` sigue siendo una función de 2 600 líneas. Partirla
   pide sacar el estado compartido a un objeto explícito, y eso es un experimento
   propio (ORDEN_28.md).
10. **De lo viejo y aún abierto**: las `dlight` de las antorchas
    (`R_AddDynamicLights`), una captura del juego con el `glow` apagado para cerrar
    el contraste local, y medir en las cuevas las caras sin mapa de luz.

Y una que no es código: **enseñárselo al equipo de MSR y pasar el repositorio a
público**, que es lo que pidieron —crédito y repositorio público— y está explicado
en [CREDITOS.md](../CREDITOS.md). Servir el mapa horneado es otra cosa y sigue
necesitando permiso aparte.
