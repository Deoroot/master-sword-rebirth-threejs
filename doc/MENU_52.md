# 52 · El menú principal deja de ser una pintura

> `src/play/miradores.js` · `src/juego/menums.js` · `src/main.js` ·
> `test/juego_miradores.test.mjs` · `sondas/menu52.mjs` · `sondas/miradores52.mjs`

**Qué se pidió:** *«quisiera ver si se puede rehacer el menú principal que
hicimos imitando al de valve, no está malo pero veo que imitarlo resultó en una
imitación de no muy buena calidad y quisiera crear un nuevo menú principal que
esté dentro del juego como el actual pero que aproveche las características de
three.js para ser un menú de alta calidad, tal vez crear un render 3d incluso de
un mapa basado en la imagen del menú principal actual sería increíble.»*

**Estado:** el menú principal tiene detrás Gate City de verdad, con la cámara
dando una vuelta lenta y el paralaje siguiendo al ratón. **1 378 pruebas de
Node**, `sonda:menu52` **16 de 16**, `sonda:arranque36` 23/23 con el menú
reescrito, `vite build` limpio.

**Lo que NO está hecho, y no se cuenta como hecho:** separar la escena de la
sesión. Ver el apartado 6.

---

## 1. El hallazgo: ya estábamos pagando el 3D, y lo tapábamos

El menú era una capa opaca con el mosaico de la torre. Y el mapa **ya estaba
cargado y dibujándose detrás de ella**: `cargarNivel()` corre en
`src/main.js:803`, el menú se monta en `:1423` —después de la física, las
texturas y el cadáver— y el bucle de fotograma hace `renderer.render(escena,
camera)` sin condición desde antes.

O sea que hasta el 51 Gate City se dibujaba entera, a coste completo, detrás de
una pintura que la tapaba. **Este experimento no añade una carga: quita una
tapa.** Conviene decirlo así en vez de presumir de lo barato que salió: no se
planeó, estaba ahí.

## 2. La especificación ya estaba escrita, del experimento 13

`doc/mockups/menu-principal-mockup.html` no era un boceto: era esto, con los
números puestos, y llevaba treinta y nueve experimentos sin construirse.

> *Conservar la sobriedad del original (texto abajo a la izquierda, sin cajas,
> la imagen manda) pero sustituir la pintura estática por EL MUNDO EN VIVO […]
> Cámara en una ruta fija: CatmullRomCurve3 con 4–6 puntos definidos a mano por
> mapa, velocidad ~1 vuelta cada 90 s, ida y vuelta (ping-pong) […] Paralaje:
> desplazar la cámara ±0.3 u y rotarla ±1.5° según la posición del ratón.*

Y ya había decidido lo de la pintura: *«La pintura de MS:R es de Anders Finér.
No se usa aquí.»* O sea que la idea del encargo —«un render 3D de un mapa basado
en la imagen del menú actual»— se contestó sola: **no se reconstruye el cuadro,
se usa el mapa**. Modelar la torre a mano habría sido obra derivada de la
pintura de Finér, habría metido el primer binario en un repositorio que no tiene
ninguno, y habría competido contra un cuadro profesional.

**Lo que del mockup NO vale:** su lista de opciones borraba «Visit a Kingdom» y
«Establish a Kingdom» con el argumento *«no hay multijugador»*. Eso caducó dos
veces —el multijugador existe desde el 27, y el 36 restauró esos dos caminos
porque los pidió el jugador—. Así que se conservó `gamemenu.res` entero y sólo
cambió la presentación: `src/play/menu.js` no se tocó y sus pruebas siguen
valiendo.

## 3. Los DOS controles falsos que cazó la rotura obligatoria

Ésta es la parte que no se puede volver a deducir del código, así que va entera.
Se escribieron 20 pruebas, salieron las 20 verdes, y entonces se hizo lo que
manda el apartado 4 de [CLAUDE.md](../CLAUDE.md): **romper el arreglo a
propósito**. Dos de los tres controles no se inmutaron.

### 3.1 El coseno: una resta que se anulaba sola

El recorrido va y vuelve con un coseno en vez de rebotar linealmente, para que la
cámara frene en los extremos y el cambio de sentido no se vea como un tirón. El
control medía la velocidad en el extremo con una **diferencia centrada**:

```js
const vel = (t) => Math.abs(fase(t + dt) - fase(t - dt)) / (2 * dt);
```

Con un rebote lineal puesto a propósito, **siguió verde**. En un vértice
simétrico `f(t+dt)` y `f(t−dt)` valen lo mismo, así que la resta da cero con
coseno y con rebote: el cero que leía era la resta anulándose, no la cámara
frenando. Una diferencia **de un solo lado** sí los distingue, porque el coseno
sale de segundo orden (`≈ 2π²dt²/T²`) y el rebote de primero (`2dt/T`).

### 3.2 El paralaje: el valor correcto era el valor de reposo

El paralaje desplaza la cámara a **sus** lados, no en los ejes del mundo. El
control ponía la cámara mirando al norte y comprobaba que el ratón a la derecha
movía la X. Cambiando el código a `[1, 0, 0]` —los ejes del mundo—, **siguió
verde**: mirando al norte la derecha de la cámara *es* +X, así que los dos daban
lo mismo.

Es exactamente la forma del experimento 50: con un solo caso, el valor correcto y
el valor de reposo coinciden y el control no puede fallar por construcción. La
defensa no es mirar mejor, es **un segundo caso** — una cámara mirando al este,
donde su derecha es +Z y la X tiene que quedarse quieta.

### 3.3 Y el tercero medía, pero no lo que decía

El Catmull-Rom es centrípeto (α = ½) y no uniforme, para que unos puntos mal
repartidos no hagan un rizo. El control comprobaba que la curva no se saliera de
la caja de sus puntos… con unos puntos con los que **las dos variantes dan
exactamente lo mismo**. Medido, con la desviación máxima respecto de la
polilínea:

| puntos | uniforme | centrípeto | |
| --- | --- | --- | --- |
| los que usaba la prueba | 13,9 | 13,9 | ×1,00 — no distingue nada |
| horquilla | 11,2 | 3,1 | ×3,7 |
| tramo corto entre dos largos | 4,4 | 1,0 | ×4,3 |
| subida brusca | 4,8 | **6,1** | el centrípeto es PEOR |

La última fila está para no contar de más: **el centrípeto no se desvía menos
siempre**. Lo que evita es el rizo donde un tramo corto va entre dos largos, y de
eso se protege el menú porque los puntos de un mirador se eligen por el encuadre
y quedan mal repartidos por definición.

Con los tres controles arreglados, cada rotura pone roja **exactamente la suya**,
y al restaurar vuelven las 21.

## 4. Gate City no tiene el encuadre que el mockup pedía

El mockup buscaba *«UNA silueta fuerte a contraluz contra el cielo»*. Se fue a
buscarla y **no existe en este mapa**, y eso se midió en vez de suponerse:

- `sondas/dondecielo.mjs` cuenta **137 caras de cielo, la mayor de 427 m²**, y
  todas son **techo**: el cielo de Gate City es una tapa agujereada, no un
  horizonte;
- el barrido 2 de `sondas/miradores52.mjs` fue derecho a debajo de esa cara de
  427 m², a dos radios y dos alturas, y **las dieciséis capturas salieron sin un
  píxel de cielo**: lo que hay ahí son barrancos de roca y helechos;
- antes, el barrido 1 había puesto un anillo de 38 m alrededor de la plaza: las
  dieciséis, sin cielo, y la mitad dentro de una pared.

Gate City es un pueblo de noche alumbrado por faroles. Y **lo oscuro es el
juego**, no un fallo del port: `brightness "2"` y `gamma "3"` son los valores del
propio mod y el jugador puede moverlos en «Options» (`src/play/ajustes.js:193`).
Preguntado, el jugador eligió dejarlo así.

Así que el encuadre buscado cambió, y se dice en vez de disimularlo: **una calle
en profundidad, con faroles cálidos sobre fondo oscuro**, y el texto del menú
cayendo sobre la parte oscura. Es lo que encontró el barrido 3, y de ahí salieron
los dos miradores.

> Si algún día se quiere la silueta a contraluz, el mapa es **Edana**: su
> `ms_player_begin` da luz 193/255 —el valor de estar a cielo abierto— y 13 de
> sus 42 posiciones de NPC dan lo mismo. Lo midió la sesión del 50; ver
> [EDANA_50.md](EDANA_50.md).

## 5. La procedencia, y la frase falsa que estuvo escrita

`src/play/miradores.js` decía, al escribirse, que un mapa de fondo vivo «es cosa
de Source» y que por tanto **esto era nuestro y no se citaba nada**. Era falso, y
la corrección está al lado en el propio archivo en vez de reescrita, como manda
el apartado 7 de CLAUDE.md.

Los mapas de fondo son de Source **y de Xash3D**, o sea del motor sobre el que
corre la build standalone de Master Sword, con nombre propio y con su modo:

```
UI_StartBackGroundMap()            mainui/BaseMenu.cpp:547-581
SV_SpawnServer(..., background)    sv_init.c:1011, :1060
sv_client.c:1422-1423   al jugador: FL_GODMODE|FL_NOTARGET
                        «don't attack player in background mode»
sv_main.c:111           sv_background_freeze, por omisión 1
sv_client.c:3290        -> en un mapa de fondo el jugador no se mueve
```

O sea que **«escena sí, partida no» es lo que hace el motor**, no un invento
nuestro. Lo encontró la sesión del 50 mientras esto se construía.

Lo que sí es nuestro, declarado:

1. **MSR no usa mapas de fondo.** No trae la lista que busca
   `UI_LoadBackgroundMapList` (BaseMenu.cpp:980), así que `IsEmpty()` corta en la
   línea 551 y su menú cae al mosaico de TGA. Que aquí sí haya fondo vivo lo
   pidió el jugador.
2. **El recorrido.** El motor deja el mapa quieto con el jugador congelado; el
   paseo lento, la ida y vuelta y el paralaje salen del mockup del 13.
3. **La tipografía.** Cinzel e IM Fell English, por enlace a Google Fonts —
   decisión del jugador, sabiendo que la alternativa era meter los primeros
   binarios del repositorio y tocar `test/procedencia.test.mjs` y `CREDITOS.md`.
   Sin red, el menú cae a Georgia y se lee igual.

## 6. Lo que falta, y por qué no se cuenta como hecho

Mientras esto se construía, la sesión del 50 midió qué hay detrás del menú
principal. No es un fondo:

```
mapa       gatecity, 41 494 triángulos, 299 texturas
dibujado   145 070 triángulos por fotograma en 636 llamadas
NPC        69 montados, 33 hostiles; 45 se movieron en 4 s
jugador    existe, con posición
```

**Arrancar el juego es entrar a Gate City con su simulación en marcha**, con 33
monstruos cazando detrás de la pantalla del menú, antes de que nadie pulse nada.
El fondo vivo no causa eso —ya pasaba, tapado por la pintura— pero ahora se ve.

El jugador eligió la síntesis: **un fondo de menú es una escena, no una sesión**.
Geometría, luz y esta cámara sí; los 69 NPC, la física del jugador y la sesión
no, que empiezan con «Start». Eso **no está hecho**, y hay cuatro controles rojos
en `sondas/arranque36.mjs` esperándolo, escritos para que pasen a verde solos
cuando entre. Lo que queda:

- que `arrancarJuego` cargue la escena sin arrancar la simulación;
- que el mapa del fondo salga de `src/play/fondomenu.js` y no de
  `MAPA_POR_DEFECTO`;
- que «Start» monte bichos, jugador y sesión — **incluido el caso que hoy se
  resuelve solo** porque ya está todo montado: elegir el mismo mapa que el del
  fondo.

## 7. Cómo se comprueba

```bash
npm test                      # 1 378, de las que 21 son del recorrido
npm run sonda:menu52          # 16 de 16: que se vea y que se mueva
npm run sonda:miradores52 -- 3  # la herramienta con la que se eligen miradores
```

Los números que dan los controles que más costaron:

| control | mide | dio |
| --- | --- | --- |
| la cámara se mueve | píxeles que cambian en 1,5 s | **30,36 %** |
| **el negativo que lo hace valer** | lo mismo con la pintura puesta | **0,00 %** |
| los dos miradores son distintos | píxeles distintos entre ellos | **78,75 %** |
| el ratón mueve la cámara | giro con el ratón | **1,49°** |
| **su negativo** | giro del paseo solo, en el mismo rato | **0,28°** |

El par de la segunda fila es el que importa: «cambian píxeles» no vale solo,
porque cualquier cosa que parpadee lo cumpliría. Con la pintura puesta la misma
medida da cero, así que lo de arriba midió la cámara y no otra cosa. Y el 1,49°
contra 0,28° es el mismo argumento para el paralaje, que si no se confundiría con
el giro que el recorrido hace por su cuenta.

Los miradores no se escribieron leyendo coordenadas: se eligieron **mirando**,
con tres barridos y una hoja de contactos, en `build/gatecity/vistas/miradores52.png`.

---

## CORRECCIÓN DEL 55: al 52 se le cayó una negación, y paró la IA del juego

Este experimento metió en `src/main.js` la guarda que para el mundo mientras el
menú está delante, y la metió **sin el `!`**:

```js
if (paseando) {          // <- debía ser !paseando
  ...
  bichos.cazar(dtB, { ...arnesDePaseo, ahora: reloj });
```

Con eso la IA pensaba **sólo mientras el menú principal estaba abierto** y se
paraba en cuanto empezabas a jugar. La intención era la buena —con el menú
delante el mundo se para— y lo único que faltaba era el signo.

El síntoma, medido por `sonda:mundo`, que es la vecina que este experimento no
llegó a pasar:

```
  6 s parado al lado de un Goblin, sin llamar a la IA:
    atacantes 0 -> 0, golpes 0 -> 0
    el goblin: pasear, animación 'walk'
```

Y el control de al lado —«hay un hostil con línea de visión al jugador»— estaba
**en verde**. O sea que el goblin te veía y no hacía nada, que es exactamente el
guion que la sonda escribió para que ese cero no pasara en vacío. Después del
arreglo: `atacantes 0 -> 3, golpes 0 -> 9`, el goblin `perseguir` corriendo, y
la sonda **40 de 40**.

### Por qué no lo cazó el 53, que iba justo de esto

Porque los dos cambios son correctos por separado y el agujero está entre ellos.
Desde el 53 **detrás del menú no hay un solo bicho montado**, así que el lado
equivocado de ese `if` no tenía a quién hacer pensar y no se notaba nada raro en
el menú; y los controles del 53 miran que detrás del menú haya cero, que seguía
siendo cierto. Un bug que sólo existe en la intersección de dos cambios buenos
no lo ve ninguno de los dos.

Lo que sí lo vio fue la regla de la casa que no se siguió: **al tocar algo,
vuelve a pasar las sondas vecinas.** `sonda:mundo` lo cazó en la primera pasada.
No hubo que escribir ningún control nuevo — sólo pasar el que ya existía.
