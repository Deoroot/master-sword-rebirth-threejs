# El mapa de luz no llegaba a la pantalla

Informe del experimento 06. Cierra las partes 1 a 4 de su encargo y encuentra,
por el camino, el fallo más caro de los seis experimentos.

## La respuesta corta

**Gate City llevaba dos sesiones dibujándose sin su mapa de luz**, y las 397
comprobaciones estaban en verde.

Desde Three.js r152 **no hay un juego de UV reservado para el `lightMap`**: cada
textura declara cuál usa en `texture.channel`, y `channel` vale **cero** de
fábrica, o sea `uv`. `WebGLPrograms.js`:

```js
lightMapUv: HAS_LIGHTMAP && getChannel( material.lightMap.channel ),
function getChannel( value ) { if ( value === 0 ) return 'uv'; return `uv${value}`; }
```

La geometría traía su `uv1` bien calculada —el parche, el «+1», el medio luxel, el
`Math.fround` del compilador, todo correcto al píxel— y **nadie la leía**. El
atlas se muestreaba con las UV de la TEXTURA, que en este mapa van de −30 a 30, y
`ClampToEdgeWrapping` las pegaba al borde del atlas.

La corrección es una línea, en `cargarMapaDeLuz`:

```js
tex.channel = 1;
```

## Por qué aguantó dos sesiones, que es lo que hay que no repetir

**Porque un mapa de luz plano se parece muchísimo a un mapa de luz que
funciona.** Casi toda cara recibía un valor casi constante, así que el mundo
salía iluminado —de plano, sin charcos— y nada se veía roto. Lo que sí estaba
roto era todo lo que se dedujo de ahí:

| lo que se midió y se escribió | lo que pasaba de verdad |
| --- | --- |
| «somos un 25 % más claros que el juego: mediana 42,6 contra 32,3» | el atlas plano era más claro que el atlas de verdad |
| «y bastante menos saturados: 0,42 contra 0,59» | la textura sin modular por la luz de su sitio |
| «la causa candidata son las 61 texturas de detalle» | no lo era, y las de detalle mueven 1 punto de mediana |
| «apagar el mapa de luz cambia el 78,7 % de la pantalla» | medía cuánta pantalla ES geometría, no cuánta luz aporta |
| «las vigas de madera de la calle están negras» | su UV de textura caía en un rincón negro del atlas |

Y tres perillas del visor **mentían**, las tres del mismo modo que ya había
costado seis sondas en el 05: bien puestas, midiendo la cosa equivocada, y
devolviendo un número redondo.

- **`setLuz(false)` no dejaba el mundo a plena luz: lo dejaba NEGRO.**
  `MeshLambertMaterial` sin `lightMap` y sin una sola luz de escena no emite
  nada. Con el glow apagado, que es como se mide, la pantalla salía al 97,7 % de
  negro puro. De ahí salía el 78,7 % de la tabla. Ahora apagar el mapa de luz es
  cambiarlo por un atlas BLANCO de un píxel, que sí es `r_fullbright`.
- **`setTexturas(false)` devolvía un campo plano de 136.** Con el atlas
  muestreado por `uv`, quitar la textura deja ver exactamente lo que el atlas
  aportaba: nada. Hoy esa misma perilla enseña los charcos de las lámparas, las
  sombras de contacto y el degradado de la bóveda, y es la confirmación más
  directa de que el arreglo es real.
- **La sonda de teñir de rosa oscurecía la pantalla entera y no teñía nada.** Su
  lienzo se declaraba `SRGBColorSpace` mientras el atlas va sin espacio de color,
  así que Three.js convertía el atlas a lineal: la mediana caía de 42 a 20. Y
  además le faltaba el `channel`, o sea que **la sonda escrita para delatar este
  fallo lo cometía por dentro**. Es la tercera vez que pasa en este experimento.

**La regla que se lleva de aquí, y es nueva:** un dato bien calculado que nadie
lee no da error. Las 397 comprobaciones medían que los datos estuvieran bien y
ninguna medía que llegaran a la pantalla.

## EL JUEZ, que es lo que impide que vuelva a pasar

`npm run gatecity:juez` predice cada píxel **desde los archivos** —rayo por CPU
contra `malla.bin`, UV interpoladas, textura y atlas muestreados en Node— y lo
compara con el framebuffer. No pasa por el visor.

Y lleva su control dentro, que es lo que lo convierte en un juez: predice **dos
veces**, una muestreando el atlas con `uv1` y otra con `uv`, y dice **cuál de las
dos cuadra**.

```
                          razón pantalla/predicción   dentro de ±20 %
  atlas muestreado con uv1         1,002                  91,1 %
  atlas muestreado con uv          0,806                  46,6 %
```

Con el fallo puesto a mano los dos números se cambian de sitio —46,1 % contra
91,7 %— y el juez sale con código 1 nombrando la causa. Está comprobado en las
dos direcciones, que es lo que la sesión pasada le faltó a media docena de sondas.

Se apoya en `npm run gatecity:quecara`, que dice qué hay en un píxel concreto:
qué grupo, a qué distancia, con qué `uv1` y qué téxel del atlas muestrea. Fue lo
que localizó el fallo: la pantalla daba `(0, 0, 0)` donde el archivo decía
`textura (76, 49, 26) × luz (112, 110, 78) / 255 = (33, 21, 8)`. Con el arreglo
puesto, ese píxel vale exactamente `(33, 21, 8)`.

## Medido contra el juego, antes y después

Misma cámara, mismo encuadre, sin el hechizo `glow` en ninguno de los dos.
Referencia: captura del juego en la misma calle, traída por quien lo juega.

| | **juego** | antes | **después** |
| --- | --- | --- | --- |
| luz p10 | 17,5 | 23,8 | **17,8** |
| luz MEDIANA | 36,5 | 42,6 | **34,1** |
| % oscuro (<32) | 43,3 % | 20,1 % | **45,5 %** |
| saturación mediana | 0,506 | 0,423 | **0,542** |
| contraste local | 8,9 | 10,0* | **6,3** |
| negro puro en pantalla | — | 4,6 % | **0,0 %** |

\* el contraste local «de antes» estaba inflado por las vigas a cero absoluto
junto a paredes iluminadas: no era detalle, era un escalón.

Las tres cifras que llevaban dos sesiones sin explicación —más claros, menos
saturados, y no es el encuadre— **quedan explicadas y cerradas por el mismo
fallo**. La que queda abierta es el contraste local, y ahora se sabe por qué:
abajo.

## Y el otro fallo del motor mal leído: `r_lighting_modulate`

Los 101 adornos se iluminaban con un factor 0,6 puesto así:

> «Es `r_lighting_modulate`, y vale 0,6 en la configuración del juego.»

**Esa cvar no hace nada.** En este motor está registrada exactamente así:

```c
// engine/client/ref_common.c:745
Cvar_Get( "r_lighting_modulate", "0.6", FCVAR_ARCHIVE, "compatibility cvar, does nothing" );
```

Es el error de `gl_overbright` del revés: allí la referencia corrigió al
razonamiento; aquí la referencia se leyó a medias —el nombre en el `config.cfg`
sin buscar qué hace el motor con él—.

Lo curioso es por qué no cantó: el factor medio REAL del camino del motor es
**0,6636**, y un 0,6 se le parece. Lo que sí se veía era el otro error, el que
importaba: **la cuenta se hacía canal a canal en vez de con un escalar y un color
normalizado**, y eso desatura todos los muebles del mapa.

`R_StudioSetupLighting` (`ref/gl/gl_studio.c`) hace esto y ahora
`colorDeAdorno()` lo hace igual:

```
total      = max(r, g, b)  del luxel del suelo, con los estilos sumados y >> 8
shadelight = total × direct        direct = 0,9  (engine/client/gamma.c)
ambient    = total − shadelight,   recortado a 128  (línea 1489)
color      = luz / max(luz)        NORMALIZADO: su mayor componente vale uno
illum      = ambient + shadelight × (1 − cos medio)
lv         = LightToTexGamma(illum × 4) / 1023
resultado  = color × lv            (línea 2328)
```

La tabla de gamma es cóncava, así que pasar los tres canales por ella comprime
más el canal pequeño que el grande. Para un luxel de vela `(80, 40, 10)`: el
motor da `b/r = 0,128` —la razón del luxel, conservada— y la cuenta por canal da
`0,176`, un 37 % de más. Está fijado en `test/bsp_detalle.test.mjs` con su
control.

**La única aproximación que queda** en todo ese camino, y se dice: el `cos` por
vértice. Un atlas horneado tiene un luxel por adorno, no una normal por vértice,
así que se usa el valor medio sobre la esfera, que sale exacto:
`E[max(0, (c + r − 1)/r)] = r/4 = 0,373831` con `SHADE_LAMBERT = 1,4953241`.

## Parte 1 — las texturas de DETALLE, puestas y medidas

`maps/gatecity_detail.txt` tiene 62 líneas; **58 casan con una textura de este
mapa** y necesitan 14 `.tga` distintos. `opengl.cfg` trae `r_detailtextures "1"`.

Lector nuevo: [src/bsp/tga.js](../src/bsp/tga.js), con oráculo del propio archivo —
**los 126 `.tga` de `gfx/detail/` se leen hasta el último byte**, contando el pie
de TGA 2.0 cuando lo traen. Un RLE mal leído no da error: da una banda de basura
al final, y en una textura de detalle eso no se ve. Contar bytes sí lo ve.

Se dibujan como el motor: **segunda pasada sobre la misma geometría**, con
`CustomBlending(DstColorFactor, SrcColorFactor)` —que es `2·src·dst`, el
`GL_DST_COLOR/GL_SRC_COLOR` de `R_RenderDetails`—, `depthFunc: EqualDepth` y
`depthWrite: false`. **Sin shader**, que es lo que había que poder seguir
diciendo. Las dos escalas de cada línea viajan en el `repeat` de la textura,
porque es lo que hace el motor: no hay un tercer juego de UV, se multiplican las
que ya hay.

Y su control, que es lo que permite afirmar que están bien puestas: una mezcla
`2·src·dst` con un detalle de gris medio **conserva la media y sube el contraste
local**. Medido, con `probe.setDetalle()`:

| | sin detalle | **con detalle** | juego |
| --- | --- | --- | --- |
| luz mediana | 34,1 | **35,1** | 36,5 |
| % oscuro (<32) | 45,5 % | **43,8 %** | 43,3 % |
| contraste local | 6,3 | **6,9** | 8,9 |
| contraste local p90 | 13,8 | **14,9** | 21,8 |
| saturación mediana | 0,542 | 0,543 | 0,506 |

La firma es la correcta —la mediana se mueve un punto, el contraste sube— y la
dirección también. **Pero no cierra el hueco**: seguimos en 6,9 contra 8,9. La
hipótesis del 05 era razonable y resultó ser el segundo plato, no el principal.

## Parte 3 — el cielo `nature1`, leído

Los seis `.tga` **sí estaban**, en `gfx/env/`, y se leen. La orientación no se
adivina: sale de tres tablas del motor —`r_skyBoxSuffix`, `r_skyTexOrder` y
`st_to_vec`— resueltas cara por cara, y con el cambio de ejes de este proyecto
`bk` acaba en −Z y `ft` en +Z, que es lo contrario de lo que sugiere el nombre.
Adivinarlo no habría dado un error: habría dado costuras.

Las caras de cielo del mapa ya no se dibujan, que es lo que hace el motor —
`R_RenderBrushPoly` empieza con `if( fa->flags & SURF_DRAWSKY ) return;`—, y la
caja va detrás de todo, sin profundidad y centrada en el ojo.

| vista | antes (color plano) | después |
| --- | --- | --- |
| `boveda` | se ve 33,6 %, negro 52,9 % | **se ve 81,4 %, negro 5,3 %** |
| `desde-fuera` | se ve 3,2 %, negro 89,3 % | **se ve 88,4 %, negro 2,9 %** |
| control (mundo apagado) | 0,00 % | **0,00 %** |

El control sigue en cero porque `setMapa()` apaga también la caja de cielo: sin
eso, «con el mundo apagado la pantalla tiene que ser niebla» habría dejado dentro
una caja que ocupa la pantalla entera.

## Parte 4 — el parpadeo: MEDIDO, y sí vale la pena

El encargo pedía medirlo antes de decidir. Medido:

| estilo | bloques | m² | % de la superficie con luz | patrón |
| --- | --- | --- | --- | --- |
| 0 (fijo) | 11 722 | 23 414 | 81,7 % | `m` |
| **1** | **8 842** | **13 765** | **48,1 %** | `mmnmmommommnonmmonqnmmo` |
| **6** | **3 368** | **4 313** | **15,1 %** | `nmonqnmomnmomomno` |

Y **2 779 caras, 5 219 m², el 18,2 % de la superficie con luz, tienen como único
estilo uno que parpadea**: esas no titilan, se encienden y se apagan enteras.

Lo que se mueve en pantalla, para un luxel típico del mapa (32 sobre 255), ya
pasado por la rampa del motor:

| estilo | mínimo | medio (lo que hoy se hornea) | máximo | recorrido |
| --- | --- | --- | --- | --- |
| 1 | 99 | 105 | 127 | **28 de 255, un 27 % del valor medio** |
| 6 | 99 | 107 | 127 | **28 de 255, un 26 %** |

No son «208 m² en un rincón»: son casi dos tercios de la superficie iluminada,
con un 27 % de recorrido, diez veces por segundo y **sin interpolar**
(`cl_lightstyle_lerping "0"`). **Vale la pena, y es lo único de todo este mapa
que sí pide salirse de los materiales de fábrica.** Queda escrito con su plan en
[NEXT_SESSION.md](../NEXT_SESSION.md), no medio hecho.

## Lo que queda sin explicar, y es honesto decirlo

**El contraste local: 6,9 contra 8,9, y el p90 14,9 contra 21,8.** Nos falta
grano fino y nos faltan altas luces. Cuatro candidatos, en orden de lo que
prometen:

1. **El parpadeo.** La mitad del mapa está horneada al valor MEDIO de su
   patrón; el juego la enseña recorriendo 28 bytes de pantalla. Un fotograma del
   juego pilla cada cara en un punto distinto de su ciclo, y eso ES contraste
   local que nosotros no tenemos.
2. **Las luces dinámicas de las antorchas.** `R_AddDynamicLights` suma al mapa de
   luz, por cara y por fotograma, las `dlight` que el mod crea. No las tenemos.
3. **La captura de referencia lleva el `glow` puesto** —su propio registro dice
   «Glow: Maximum charge reached»— y el nuestro no. Con glow nos pasamos al otro
   lado: p90 95,7 contra 86,7.
4. **Los `.tga` de detalle se leen con mipmaps y anisotropía 8.** El motor los
   sube igual, pero el nivel de mip que elige cada uno no tiene por qué coincidir.

Las dos primeras son trabajo; las dos últimas son ruido de comparación. **La
medida que falta y vale más que las cuatro: una captura del juego del mismo sitio
y la misma dirección, con el glow apagado.** Eso lo puede dar quien lo juega en
cinco minutos y no lo puede dar ningún razonamiento.

## Lo que NO era el problema, rehecho con el arreglo puesto

Las **1 133 caras sin mapa de luz** —137 de cielo y 996 con `lightofs` válido y
los cuatro `styles` a 255— siguen pintándose negras, que es lo que hace el motor:
`R_BuildLightMap` deja el bloque a cero cuando `styles[0] >= 255`, y `samples` se
asigna igualmente porque `lightofs != −1` (`mod_bmodel.c`, línea 3700).

El A/B de mandarlas al luxel BLANCO —`npm run gatecity -- --sinluz`— se rehízo
con el `channel` ya arreglado, porque hecho antes no medía nada: **cambia 6
píxeles de 614 400** en la vista de la calle. O sea que las vigas negras de la
calle **no eran esto**, y por eso el A/B de antes daba un fotograma idéntico:
daba lo correcto por la razón equivocada.

Queda medirlo en las cuevas, que es donde están los 1 998 m² de `rock_07` sin
mapa de luz.

## Las cifras de la reproducción, actualizadas

| | |
| --- | --- |
| Geometría | 41 650 triángulos de 15 660 caras, **100 grupos** |
| Texturas del mundo | 92 decodificadas, 80 en superficie |
| **Texturas de detalle** | **58 de 80 emparejadas, 14 `.tga`** |
| **Cielo** | **6 caras de `nature1`, leídas** |
| Mapa de luz | 2 126 793 bytes, al byte, **y ahora en pantalla** |
| Adornos | 101 de 17 `.mdl`, con la luz del motor línea a línea |
| Carteles | 80: 57 antorchas y 23 halos |
| Comprobaciones | **409, las 409 en verde** |
| Juez de pantalla | `npm run gatecity:juez`, con su control |

## Herramientas nuevas

| | |
| --- | --- |
| `npm run gatecity:juez` | predice cada píxel desde el archivo y lo compara con la pantalla, con el control del fallo puesto |
| `npm run gatecity:quecara -- --pos "..." --px 155,300` | qué hay en ese píxel: grupo, distancia, `uv1` y téxel del atlas |
| `npm run gatecity:mirar -- --pos "..." --yaw barrer` | una captura desde donde diga el HUD, con perillas (`--singlow`, `--sindetalle`, `--plenaluz`, `--sinluz`, `--sintex`, `--overbright N`) |
| `src/bsp/tga.js` | lector de `.tga`, RLE incluido, con oráculo de bytes |

`--pos` son los tres números que el HUD del visor imprime, tal cual. Eso convierte
una captura de quien lo anda en un fotograma que se puede volver a sacar y medir.
