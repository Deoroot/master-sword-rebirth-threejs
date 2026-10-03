# Experimento 88 — el tubo: un mapa nuestro, de punta a punta

El usuario quiere ampliar Gate City con misiones y mazmorras para jugadores de
hasta 500 de vida máxima, y preguntó lo de verdad: *«no conviene tirarnos a
expandir Gate City si no podemos replicar su arquitectura de buena forma. ¿Cómo
podemos probar que podemos expandirla?»*.

Hasta hoy, todo lo que leía este port eran **mapas oficiales**. Nunca se había
hecho contenido nuevo, y ese era el riesgo más grande: un mapa compilado por
nosotros es un **segundo caso** para el lector de `.bsp`, el mapa de luz, la
colisión y las entidades. El apartado 4 de CLAUDE.md lo dice más de diez
veces: el fallo lo enseña el segundo caso.

Así que antes de la mazmorra, **el tubo**: lo más pequeño que recorre el camino
entero.

```
contenido/sala88.mjs  ──tools/mapagen.mjs──▶  build/contenido/maps/sala88.map
                      ──VHLT (csg, bsp, vis, rad)──▶  sala88.bsp
                                                          │
                       ┌──────────────────────────────────┴──────────────┐
                       ▼                                                 ▼
          Xash3D: `map sala88`                       aquí: hornear + `?map` por el menú
          (C:\Juegos\MSR, el oráculo)                (sondas/sala88.mjs)
```

---

## 1. Por qué un `.map` escrito desde código

El usuario tiene J.A.C.K. instalado y no lo ha usado nunca. Un `.map` es
**texto**: entidades con claves y brushes de seis planos. Es justo lo que la IA
escribe bien, y es la inversión que el usuario señaló —antes faltaban
programadores y sobraban artistas; ahora es al revés— aplicada a los mapas.

No sustituye a un mapeador para hacer algo bonito. Lo que hace es probar el
camino sin depender de uno. El `.map` generado se puede abrir en J.A.C.K., que es
la manera más rápida de aprenderlo: partir de un mapa que ya compila.

**La única cosa que se puede hacer mal** es el orden de los tres puntos de cada
plano. El compilador saca la normal como `cross(p0 - p1, p2 - p1)` —la cuenta
del `qbsp` de Quake— y el brush es lo que queda detrás. Con los puntos al revés
el brush no tiene volumen. `test/mapagen88.test.mjs` rehace esa cuenta con lo
que sale del generador. **Roto a propósito** (una cara con los ejes cambiados):
la prueba se pone roja.

## 2. La compilación

VHLT v34, en `C:/Herramientas/vhlt` (o `VHLT_DIR`). Es la misma familia que
compiló Edana: su `worldspawn` dice `"compiler" "ZHLT v3.4 VL34 (Aug 17 2015)"`.

- `-wadinclude ms_generic` mete las texturas DENTRO del `.bsp`: el registro dice
  «Wad files required to run the map: (None)». Por eso el `.bsp` es tan del
  juego como `gatecity.bsp`, y vive en `build/` aunque la geometría sea nuestra.
- **Las cuatro herramientas devuelven 0 en casos que no son un éxito**: una
  fuga deja a hlvis sin hacer nada. `tools/contenido.mjs` lee lo que escriben y
  para con cualquier línea de error o de fuga.

## 3. Lo que se entendió mal, y lo que el horneado enseñó

**La primera sala no se podía hornear, y tenía razón quien se negó.** Era una
sala de 512 unidades con la rata en la esquina opuesta. `mapa:aparicion` paró:
*«el ms_player_begin de sala88 falla (1 hostil(es) a menos de 15 m) y el mapa
no tiene sacerdotes de templo»*. En 512 unidades —13 m— no caben 15 m. Lo malo
era el mapa y no el control, así que el mapa pasó a ser **dos salas y un
pasillo**, con la rata a 29 m. Para eso el generador aprendió a **vaciar huecos
de un bloque macizo** (`interior`, `restar`), que es como se piensa un mapa de
interiores y no deja rendijas.

**Tres controles del horneado no sabían qué hacer con un mapa pequeño.** Los
tres eran correctos en los mapas para los que se escribieron:

| control | qué hacía con la sala | arreglo |
| --- | --- | --- |
| «los planos hacen falta» (`tools/gatecity.mjs`) | **FALLO** con «el peor, el Infinity %»: `Math.min()` de una lista vacía. La sala no tiene agua | sin volúmenes, **PENDIENTE**: ni verde ni rojo |
| «las reglas duras RECHAZAN sitios» (`tools/aparicion.mjs`) | **rojo**: pide un candidato malo y la sala no tiene ninguno | un **testigo** encima del primer hostil, que tiene que salir rechazado. Sólo entra si no hay ningún candidato malo de verdad, y Gate City y Edana miden lo mismo que antes (44 de 51 y 40 de 47) |
| «la regla de los hostiles descarta algo» | **rojo**, por lo mismo | el mismo testigo |

El segundo podía haberse resuelto marcándolo «no aplica», y habría sido peor:
habría dejado sin comprobar que la regla sabe decir que no. **Roto a
propósito** (la regla de los hostiles relajada a `> 999`, comprobado con
`grep`): «RECHAZAN» se pone rojo con el testigo.

Y una cosa que **ya era así antes del 88** y queda apuntada sin arreglar:
«la regla de los hostiles descarta algo» sigue verde con la regla rota, porque
lee la MEDIDA (`hostiles15`) y no la regla (`reglasDuras`). El que caza la
rotura es su vecino.

**`mapainfo` llevaba la ruta del juego escrita a mano** y era el único de los
siete pasos que no pasaba por `bspDe`. Ahora pasa. Y `bspDe` conoce los dos
sitios: si un nombre está en el juego y en `build/contenido/maps`, **es un
error**, no una preferencia. Si uno tapara al otro en silencio, se hornearía un
mapa distinto del que se cree.

`menus` sigue sin poder hornearse para la sala, y es correcto: no hay
`scripts/sala88` porque todavía no tenemos guiones propios.

## 4. Xash3D: el oráculo carga la sala

Copiada a `C:\Juegos\MSR\msr\maps\sala88.bsp`, servidor dedicado
(`msr.exe -dedicated -dev 2 -log +maxplayers 2 +map sala88`, 25 s):

- `engine.log`: «Spawn Server: sala88 / loading maps/sala88.bsp»;
- `msr/log_msdll.log`: `[NewMap]: sala88`, `World Spawn END`, `World Activate
  END`, y `models/monsters/giant_rat.mdl` precargado, o sea que el
  `msmonster_giantrat` se reconoció;
- el único aviso, «couldn't exec maps/sala88_load.cfg», un archivo opcional.

**Lo que esto NO dice**: cómo se ve, si la rata se mueve, si se nace donde se
debe. Eso lo tiene que mirar una persona con el cliente: `map sala88` en la
consola. Queda **pendiente del usuario**.

## 5. Aquí: `sondas/sala88.mjs`, 10 de 10

Entrando por el menú, con un personaje creado:

| control | medido |
| --- | --- |
| se entra por el menú y el mapa es la sala | `sala88` |
| se nace sobre el suelo | pies a 0,020 m |
| y no cae | 0,020 → 0,020 m en 1 s |
| CONTROL: andando al oeste se mueve | 2,01 m |
| y la pared lo para a un radio de su cara | x = −19,081 m, tope −19,101 |
| la pantalla no es negra | luminancia 63,4/255, 0,2 % en negro |
| y tiene textura | 494 colores a 4 bits |
| la rata está y viva | Giant Rat, 4/4 |
| el espadazo le quita vida | 4 → 2,88 |
| la rata muerde | 15 → 14,6 en 7 s |

**Roto a propósito**: la pared oeste movida 128 unidades en la descripción,
recompilada y rehorneada. «La pared lo para» se pone roja, y el jugador se para
en −22,33 m, que es exactamente un radio de la cara NUEVA (−22,35). La colisión
sigue a la geometría compilada y no a un número.

La sonda imprime aparte **lo que hay que comparar con Xash**: la rata no muerde
si no la tocas (es `vermin`, recela del humano: el 82), tras un espadazo muerde
a los 7 s, y el mordisco quita 0,4, que es lo que declara su guion.

## 6. Una falsa alarma mía, que va escrita

En la captura del pasillo había **una figura humana de pie**, abajo en el
centro, y en el mapa no hay ni un NPC. Por la posición deduje que estaba en el
`ms_player_begin` y sospeché que el cuerpo del jugador se quedaba donde nace.
Mandé buscarlo en el código, y la búsqueda descartó justo lo que era porque yo
le había dado la premisa: «está en el punto de aparición».

Era **`ms_lildude`**, el muñeco del HUD de MSR: tu propio personaje, pequeño, en
la parte de abajo de la pantalla. Sale igual en `doc/capturas/edana-mercado.jpg`.
*Deduje una posición en el MUNDO a partir de un sitio en la PANTALLA*, y
mandé la deducción como si fuera una medida. Es el 82 —«una teoría es tan
hipótesis como cualquier otra»— con el agravante de que se la pasé a otro.

## 7. El usuario la jugó en los dos motores

Con el cliente de Xash (`map sala88`) y con este port, tres capturas: *«sorpresivamente
bien desde Xash y Three.js, parece bien»*. Las dos salas, el pasillo, las tres
texturas y la luz se ven igual; en los dos la rata pasea sola hasta la sala del
oeste. El pendiente 1 de abajo queda hecho.

**Y lo que enseñó Xash al entrar: el título del mapa estaba en ESPAÑOL.**
`maptitle` y `mapdesc` del `worldspawn` salen en pantalla, y yo los había escrito
como si fueran un comentario. Es interfaz del juego, y la interfaz va en inglés
(lo primero de CLAUDE.md); `test/idioma.test.mjs` no lo vio porque no lee las
cadenas de `contenido/`. Ahora dicen «Test Hall 88 / Two rooms, a corridor and a
rat.». El horneado ya lo leía bien (`build/sala88/mapa.json`, `fuentes.bsp`).

De ahí sale algo útil para la expansión: en Edana el `.bsp` dice «My Map Name»
—la plantilla de J.A.C.K.— y el título de verdad lo pone su `map_startup.script`
con `G_MAP_NAME`, que gana. O sea que un mapa nuestro puede titularse desde el
guion del mapa, y este port ya lo resuelve igual (`src/play/intro.js`).

## 8. Lo que queda

1. ~~Mirar la sala en Xash con el cliente.~~ Hecho (§7).
2. **La transición**: la sala y Gate City unidas por `msarea_transition`, en los
   dos sentidos. Era el pendiente 4 del 87 y ahora es el siguiente paso de la
   expansión: así es como MSR conecta un pueblo con su mazmorra.
3. **El primer guion propio**: un NPC de misión en `scripts/<mapa>/`. Va a
   necesitar que `test/procedencia.test.mjs` distinga un `.script` NUESTRO de
   uno del juego, y esa excepción la firma el usuario.
4. **La licencia de `contenido/`**: está pendiente y es decisión del usuario
   (`contenido/LEEME.md`).
