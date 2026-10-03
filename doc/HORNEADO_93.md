# Experimento 93, pieza E: las secuencias que pide el guion

## El hueco

`tools/bichos.mjs` hornea de cada modelo sólo las secuencias de una lista
blanca, y esa lista salía de la **ficha**: `setidleanim`/`setmoveanim` del
nacimiento, las `ANIM_*` que `iaDe` sabe leer, los cinco repuestos de la muerte
y, desde el 78, las `actionanim`/`moveanim` de las escenas del mapa.

Un guion pide muchas más con `playanim`. La araña de Gate City salta con
`playanim critical ANIM_LATCH_ATTACK` y `const ANIM_LATCH_ATTACK jumpmiss`
(spider.script:80-83, :106). `jumpmiss` no estaba en ninguna lista, el visor
caía a la secuencia 0, el evento 600 del fotograma 22 (`frame_jump`) no salía
nunca y la araña se quedaba a medio salto con `CAN_HUNT 0` (doc/SALTO_93.md).
La pieza A lo había apañado a mano rehorneando sólo
`build/gatecity/bichos/monsters_spider/` con un script del scratchpad.

Es el 78 otra vez (CLAUDE.md §4): *una lista blanca sólo mira donde sabe mirar*.
Allí el nombre venía del mapa; aquí, de un evento que no es el de nacer.

## La regla

Los comandos que ponen una secuencia por nombre en un monstruo
(npcscript.cpp:1458-1555):

- `setidleanim <anim>` (:1458-1469)
- `setmoveanim <anim>` (:1471-1478)
- `playanim <tipo> <anim>`: el nombre es el SEGUNDO parámetro; con uno solo
  (`playanim break`) no hay nombre (:1491-1498)

`setactionanim` está comentado en el motor (:58, :1480-1485) y no se mira.

## Lo que se hizo

`animacionesDelGuion(raiz, script)` en `tools/bicho.mjs` (exportada para poder
probarla sin hornear):

- recorre **todos** los bloques del guion y de sus `#include` con
  `partirScript` de `src/bsp/script.js` (que ya descarta los `[client]`), con el
  mismo tope de profundidad que `recoger`;
- recoge el parámetro de nombre de los tres comandos;
- lo resuelve contra **todas** las asignaciones de la variable (`const`,
  `setvar`, `setvard`, `setvarg`, `local`), no sólo la primera, porque la
  pregunta es «qué puede llegar a pedir» y no «qué tiene al nacer»;
- lo que no es un nombre (`$función(...)`, un número, `none`) se cuenta aparte
  y no se pide.

No se duplicó el lector: `leerFichaNpc` sólo devuelve los bloques con nombre de
evento y la primera asignación de cada variable, y aquí hacían falta los dos
que no da. Lo que sí se reutiliza es el partidor.

`tools/bichos.mjs` (apartado 2c) añade esos nombres a `quiere` al final, y
apunta aparte los que pone SÓLO el guion para poder medirlos. Pedir de más no
rompe nada: `extraerBicho` sólo emite lo que el modelo trae
(tools/bicho.mjs:259-274). El horneado imprime ahora, por modelo, `+ del guion`
con las secuencias nuevas, y una línea de resumen.

## Medido

Secuencias que entran sólo porque las pide el guion (sin contar la 0 ni las de
`ACT_IDLE`, que entraban igual), y tamaño de `build/<mapa>/bichos/` en disco:

| mapa | nombres del guion | secuencias nuevas | modelos que ganan | bichos/ antes | después |
| --- | ---: | ---: | ---: | ---: | ---: |
| gatecity | 141 en 25 guiones | 12 | 6 de 18 | 18,87 MB* | 19,03 MB |
| edana | 203 en 27 | 77 | 14 de 15 | 6,79 MB | 9,86 MB |
| edanasewers | 71 en 13 | 6 | 4 de 11 | 12,25 MB | 12,31 MB |
| gertenheld_forest2 | 144 en 20 | 18 | 7 de 18 | 17,16 MB | 17,64 MB |
| sala88 | 6 en 1 | 0 | 0 de 1 | 1,34 MB | 1,34 MB |

\* Gate City ya llevaba el apaño de la araña (4 secuencias). Ninguna
secuencia que estuviera horneada se ha perdido en ningún mapa salvo `jumphit`,
que sólo la ponía el apaño (ver abajo). Los `bichos.json` colocan los mismos:
69, 48, 55, 95 y 1.

Edana es la que más gana con diferencia: sus vecinos hablan con `playanim once`
de `pondering`, `yes`, `no`, `converse1`, `talkright`, `wave`... que ninguna
ficha nombraba. Es el mismo caso que la araña, sin un salto que lo delatara.

## Lo que se entendió mal

- **El encargo decía «las cuatro» de la araña, y son tres.**
  `const ANIM_LATCH_HIT jumphit` (spider.script:81) no lo usa ningún comando de
  animación: en los 2 884 guiones `ANIM_LATCH_HIT` sólo aparece en esa línea y
  en su gemela de `deralia/boss_spider.script:72`. El motor no la pide nunca,
  así que no se hornea. El apaño la metía porque leía los `const` y no los
  comandos; la prueba de salto93a no la pide.
- Un primer contador de «secuencias nuevas» daba 16 en Gate City y el disco
  decía 12: contaba también las que ya entraban por ser la 0 o por `ACT_IDLE`
  (`nod`, `idle2`, `idle7`...). Ahora las excluye.
- Una variable que nunca se asigna (`PARAM1`, o `ANIM_DODGE` leyendo la
  plantilla sola) se pide con su propio nombre, que es lo que el motor haría con
  una variable inexistente. No cuesta nada: ningún modelo tiene una secuencia
  que se llame así.

## Comprobado

- `test/horneado93e.test.mjs` (5): la cosecha de la araña trae `jumpmiss`,
  `hitbite`, `falloff` y `dodge`; NO `jumphit` (control: mira comandos, no
  `const`); un `#include` sintético con dos asignaciones y una expresión; y el
  horneado de Gate City.
- **Rotura deliberada**: el bucle del guion cambiado a `for (const a of [] ?? …)`
  con marca `ROTURA93E` (grep: 1), Gate City rehorneado → «sólo del guion 0» y
  rojas «Gate City trae horneadas las secuencias del salto» (salto93a) y la de
  93e. Quitada (grep: 0), rehorneado, verdes.
- `npm test`: 2 527, 2 525 verdes, 0 rojas.
- Sondas: `salto93` 15/15, `mundo` 44/44, `arranque36` 30/30, `mordisco92`
  25/25 tres pasadas y **24/25 una**, sin capturar qué control: queda como
  intermitente sin diagnosticar, no como verde.
