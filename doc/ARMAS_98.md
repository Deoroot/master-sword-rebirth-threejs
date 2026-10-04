# Experimento 98, parte K — los tres proyectiles, las seis astas y la flecha que se ve

> `npm run armas` · `node --test test/armas98.test.mjs` · `npm run sonda:armas98`

Los tres pendientes de armas que dejó [ARMAS_97.md](ARMAS_97.md): los tres
proyectiles con daño de guion sin portar, las seis astas con un lanzamiento que
no tienen y la sonda que mire si una flecha SE VE volando. Y lo que salió al
contar, que fue más que las seis astas.

## 1. Las seis astas: un `if ( CONST )` que el lector no miraba

`polearms_base` registra el lanzamiento fuerte dentro de un `if` nuevo:

    if ( POLE_CAN_POWER_THROW ) { ... local reg.attack.type charge-throw-projectile ... registerattack }
                                                          polearms_base.script:298-322

con `const POLE_CAN_POWER_THROW 0` en la base (:117). Como `const` gana el
PRIMERO (script.cpp:5419-5433), un asta lo tiene si lo declara a 1 antes de su
`#include`. El `if` de un solo parámetro es `atoi(Value) != 0`, con el `!` dándole
la vuelta (`ScriptCmd_If`, scriptcmds.cpp:3963-3978).

El lector (`recogerObjeto`, src/bsp/script.js) no evaluaba condiciones —«no es
un intérprete»— y registraba el ataque igual. Ahora recorre el `crudo` del
bloque (con sus llaves, el del 93) y apunta bajo qué `if` se registra cada
ataque; `condicionDeAtaque` sólo decide el caso de UNA constante del objeto (o
su `!`). Lo demás —variables, `$get`, comparaciones— devuelve `null` y el ataque
se queda como estaba.

**Contado en los 833 objetos de `items/`, no supuesto:** las que pierden el tiro
son exactamente seis, `polearms_qs`, `_ba`, `_hal`, `_nag`, `_sp` y `_har` (más
la propia `polearms_base`). Las siete que lo declaran —`_tri`, `_a`, `_dra`,
`_h`, `_ph`, `_sl`, `_ti`— lo conservan. `_sp` y `_har` lanzan en el juego, pero
POR GUION (`POLE_CAN_THROW`, `ext_toss_spear`), que sigue sin portar. Con eso
`proj_pole_spear` y `proj_pole_harpoon` salen del catálogo de flechas (39 → 37):
nadie las tira por el motor.

El control nuevo de `tools/armas.mjs` lee el guion CRUDO de cada asta y exige
«lanza ⇔ declara `POLE_CAN_POWER_THROW 1`» en los dos sentidos: 13 de 13.

### Y el segundo caso, que es mucho más grande: el `if` VIEJO

Al buscar en todas las armas qué otros `registerattack` van detrás de una
condición, salió el `if` VIEJO —sin paréntesis—, que si falla hace `break` y
abandona el RESTO de su lista de órdenes (script.cpp:5754-5757). Por ejemplo
`if !CUSTOM_ATTACK` delante del `registerattack` de `base_ranged`
(base_ranged.script:23, :46), o `if !CUSTOM_REGISTER_CHARGE1` delante del
golpe cargado de serie de `base_melee` (:87). **56 ataques en 41 armas** (y 2
bases) que el motor no registra y este puerto sí: los cargados de serie en las
35 que registran el suyo, el tiro de `base_ranged` en los siete arcos con
`CUSTOM_ATTACK` (Fénix, escarcha, Orión, los cuatro de Torkalath), seis
`!IS_TWO_HANDED_SWORD`...

**Se apuntan y NO se quitan** (`ataquesTrasIfViejo` en la ficha). Cambian el
combate de armas que miden otras sondas —la Blood Drinker del Veteran del 96 es
una de las 35— y con cinco agentes en el árbol no es una decisión para tomar de
lado. Pendiente del integrador.

### Y el tercero, debajo: `local` es del EVENTO

Mirando por qué un arco de Torkalath tiene TRES ataques salió otro: `local
reg.attack.*` es una variable local del evento (`Event.SetLocal`,
scriptcmds.cpp:6577-6578), se borra al acabarlo (`Event.m_Variables.clearitems()`,
script.cpp:5696) y `RegisterAttack` la lee del evento en curso (`GetVar`,
script.cpp:4404). El lector NO vacía `acc.ataque` entre bloques, así que el
`registerattack` a pelo de `bows_base` (bows_base.script:34) sale como copia del
anterior en vez del ataque vacío que es en el motor (tipo por omisión
`strike-land`, giattack.cpp:605-607, y teclas sin poner: no se dispara nunca).
El comentario de `Brazo` («un arco registra dos ataques idénticos y el motor
tira una moneda», src/play/golpe.js) está construido sobre esa lectura.

Probado vaciándolo: **cambian 53 armas** (todos los arcos, escudos, dagas...).
**No aplicado**, por lo mismo que el anterior; el comentario está en el sitio
(`recogerObjeto`). La consecuencia que importa aquí: **un arco de Torkalath, en
este puerto, tira flechas normales** —`Brazo` usa el ataque 0, y el 0 es el
`arrow` de `base_ranged` que el motor no registra—. La esfera sólo sale por la
costura de la prueba. Lo mismo el Unholy Blade y la Shadow Lance, pero por otra
razón: el tiro cargado de un arma CUERPO A CUERPO no está cableado en `Brazo`
(`esDeTiro` lo decide el primer ataque, src/play/golpe.js:505).

## 2. Los tres proyectiles

`src/play/proyectilguion.js`, los doce portados (`cuentaDeProyectilesDeGuion`
calculado: 0 sin portar). Las áreas pasan por un solo `repartirArea`
(src/juego/arco.js), el mismo que el Fénix: el `DoDamage` de área del motor
(giattack.cpp:1546-1592), al centro de cada vivo, con la línea libre de mundo y
`daño · (1 − d/R)^caída`.

| proyectil | cuándo | daño | radio, caída | cita |
| --- | --- | --- | --- | --- |
| `proj_pole_sl` | al aterrizar (`landed`, bicho o pared) | aflicción × 3 | 96 u, 0,1 | proj_pole_sl.script:48-61 → player/externals.script:3413-3434 |
| `proj_arrow_spiral` | a los 0,01 s y cada 0,1 s mientras vuela | `SPIRAL_DMG` del arco | 128 u, 0 | proj_arrow_spiral.script:65-101 |
| `proj_ub` | a los 0,01 s y cada 0,2 s mientras vuela | aflicción × 8 | 32 u, 0,1 | proj_ub.script:63-92 |

- **La Shadow Lance**: `game_projectile_landed` lo llama `ProjectileTouch`
  siempre, antes de `hitnpc`/`hitwall` (giprojectile.cpp:189). El centro baja al
  suelo si está a menos de 128 u (`$get_ground_height`, :50-58). Su daño de motor
  es 0 y ya no se apunta un «Hit Goblin: 0».
- **La esfera y la sombra** atraviesan NPC (`PROJ_IGNORENPC 1`): al tocar un
  bicho no hay `DoDamage` (no es un flechazo) y, toque lo que toque, `remove_me`
  la borra en el acto (`deleteent`). Mientras vuela, su área. A los 10 s se va
  (`callevent 10.0 remove_me`).
- **Los arcos de Torkalath** (`espiralDelArco`): escuela × `DMG_ADJ` (0,65 fuego,
  0,55 hielo, 0,65 rayo, 0,75 caos), × 0,1 con arquería < 30 (`UNDER_SKILLED`,
  base_ranged.script:67); tipo `fire_effect`/`cold_effect`/`lightning_effect`
  (`ext_set_spiral`, player/externals.script:1517-1550). El de caos sortea la
  escuela y su `ranged_start` llama DOS veces a `set_bow_type`: vale el segundo
  sorteo y cualquiera de los dos cancela (bows_telf4.script:40-83).

**Un fallo del original, portado:** los tres de después INCLUYEN el primero
(`#include items/bows_telf1`) y sus `ranged_start` no llevan `[override]`, así
que corren los dos y **el arco de escarcha pide fuego 15 además de hielo 15**
(«You lack the fire affinity to activate this bow's magic.»,
bows_telf1.script:79-85). Igual el de rayo y el de caos.

**Una corrección al 97**, sin borrar lo que decía (está al lado, en la tabla):
el 97 apuntaba en el Fénix «herir al propio tirador» porque el área es
`DMG_REFLECTIVE` y no se salta al dueño (giattack.cpp:1558-1559). Tres líneas
antes, `pTarget == Damage.pInflictor` se salta al INFLICTOR (:1553), y la flecha
pasa `ent_expowner ent_expowner` (proj_arrow_phx.script:104): el jugador es
inflictor, no se quema. Lo mismo la ráfaga de la lanza (`ent_me ent_me`) y la
esfera. **La sombra del Unholy Blade sí puede**: pone el ARMA de inflictor
(`WEAPON_ID`, proj_ub.script:78), y eso queda en su `sinPortar`.

Lo que no se porta, en `sinPortar` de cada fila: el `dot_dark` de la ráfaga, que
el arco élfico fija el daño al empuñar (aquí al soltar), que el `cancelattack` es
al empezar a tensar (aquí al soltar), la espada del Unholy Blade que se vuelve
invisible mientras vuela.

## 3. La flecha que se ve

`sondas/armas98.mjs` (por el menú, personaje nuevo con el arco de partida). Tres
probes nuevos en `probe.arco`: `soltarYDetener` (tensa y suelta por
`pasoDelBrazo`, la deja volar 120 u por `pasoDeFlechas` y la detiene en el aire
—gravedad 0 y una milésima de velocidad en su rumbo, de modo que el BUCLE la
sigue moviendo y orientando, y sigue `volando`—), `rectanguloFlecha` (vértice a
vértice, y si su raíz es `escena`) y `dibujosDeFlecha` (un contador pegado al
`onBeforeRender` de la malla durante tres cuadros: Three sólo lo llama con lo que
mete en su lista de dibujo; es el remedio del 76, que `renderer.info` se
reinicia por `render()`).

Dos instrumentos que no se comparten: el grafo que se pinta, con su control de
cero (escondido el nodo, 0), y los píxeles —con, sin (sólo `visible`), con— en
la ventana de los vértices contra un marco alrededor.

**Lo que mordió por el camino:** el arco de la mano tapa media pantalla; se
esconde durante las fotos. Y vista por detrás, a 3 m, la flecha son **16 × 18
píxeles**: la cola de plumas en cruz.

## Números (sonda)

- Flecha detenida a 126 u, `volando`; ventana de 16 × 18 px con 216 vértices;
  `onBeforeRender` 4 veces en 3 cuadros a la vista y 0 escondida; se apagan y
  vuelven el **16,0 %** de la ventana y el **0,0 %** del marco. 9 de 9.
- `sonda:arco` 40/40 y `sonda:armas96` 33/33 después de los cambios.

## Roturas deliberadas

Cada una con `ROTURA98` y un reemplazo que FALLA si no casa exactamente una vez
(el 80 y el 81: un `perl`/Python que no casa sale con código 0), comprobada con
`grep -c ROTURA98` = 1 antes y 0 después:

| rotura | qué se puso rojo |
| --- | --- |
| el lector no tira el ataque de un `if ( CONST )` falso | las seis astas y el censo de todas (2). El horneado ya hecho sigue verde, como debe |
| sin `areaEnVuelo` en `pasoDeFlechas` | la esfera y la sombra (2) |
| sin `rafagaDeLaLanza` | la Shadow Lance (1) |
| sin el `cancelattack` del arco élfico | el arco de escarcha sin fuego (1) |
| sin la guarda «daño de motor 0, no se apunta» | la Shadow Lance contra el bicho (1) |
| sin borrar la esfera al chocar | la esfera (1) |
| **la esfera choca como una flecha** (sin `enVuelo` en la rama de pared) | **NADA, la primera vez**: la guarda de arriba se comía el daño 0 y todo seguía verde. La diferencia que queda es que el motor no lo cuenta como acierto; prueba nueva, «no es un flechazo», y entonces sí (1) |
| **en la sonda**: sin `escena.add(arco.flechasPuestas.grupo)` en `empunar` (src/main.js) | 4 de 9: «cuelga de la escena» (false), «Three la dibuja» (0 en 3 cuadros), «se ve» (0,0 %), «lo que se apaga es ella» |

En la última, «sin errores de página» sigue verde a propósito: quitar la línea
no da error; el del 97 era un `ReferenceError` (`scene`), y lo cazaba la consola,
no un control. Y `sonda:arco` sigue verde con esta rotura: su «hay una flecha
dibujada» lee `puestas`, que cuenta nodos ocupados del conjunto. No se ha
tocado; queda dicho.

Dos pasadas de la rotura se cayeron antes de medir —«Start no recargó» y vite
sin contestar en 90 s— con la máquina cargada por los otros agentes; la tercera
midió. El tope de vite de esta sonda es ahora de 180 s.

## Pendientes

- **El `if` viejo** (56 ataques en 41 armas) y **`local` por evento** (53
  armas): medidos, no aplicados. Con los dos, un arco de Torkalath tiraría su
  esfera en el juego; sin ellos tira flechas.
  > **El 99 (parte R):** aplicados los dos por decisión del usuario —56
  > ataques fuera en 41 armas y 2 plantillas; `local` cambia 55 objetos—, y el
  > arco de Torkalath tira la esfera siempre. Ver [GUION_99.md](GUION_99.md).
- **El tiro cargado de un arma cuerpo a cuerpo** (Unholy Blade, Shadow Lance,
  tridente...) no está cableado en `Brazo`: sólo sale por la costura de la prueba.
- `sonda:arco` «hay una flecha dibujada» mide `puestas`; el control de verdad es
  `sonda:armas98`.
- La rotura del control de `tools/armas.mjs` (astas) no se ha pasado por el
  horneado: hornear roto reescribe `build/msr/armas.json`, que leen las sondas de
  los otros agentes. La regla la caza `test/armas98.test.mjs`.
