# Procedencia del kit de edificios

Generado por [tools/import_kit.mjs](../../tools/import_kit.mjs). **No se edita a
mano**: si cambia la lista de piezas autorizadas, se vuelve a ejecutar.

## PSX style going medieval, de valsekamerplant

**CC0 (dominio publico).** La pagina del pack lo declara CC0, con uso comercial
y redistribucion permitidos y sin atribucion obligatoria.
Fuente: <https://valsekamerplant.itch.io/psx-style-going-medieval>

El credito no es obligatorio en CC0. Se anota porque cuesta nada y porque asi el
origen queda comprobable.

**El pack en disco no trae archivo de licencia.** La licencia viene de la pagina
del autor, no del ZIP. Se deja escrito aqui precisamente por eso: la regla del
proyecto es que ningun asset entra sin licencia al lado, y en este caso el
archivo hay que generarlo porque el pack no lo da.

## Que se le hizo a las piezas al importarlas

1. **Se desincrusto la textura.** El pack mete una copia del PNG dentro de cada
   `.glb`: medido, el atlas `bauerhaus` son 436 KB y 33 de las
   36 piezas importadas lo llevaban repetido. Ahora esta una sola vez
   en `textures/` y cada pieza lo referencia.
2. **`alphaMode` de BLEND a MASK**, con umbral 0.5. El atlas tiene zonas
   caladas de verdad, asi que no vale ponerlo opaco; pero con BLEND las caras se
   ordenan por distancia y un muro deja ver el de detras.
3. Nada mas. La geometria no se toca, y se comprueba: cada pieza reescrita se
   vuelve a leer y se compara su caja y su cuenta de triangulos con el original.

## Las texturas

| Archivo | Tamano | Piezas que la usan |
| --- | --- | --- |
| `bauerhaus.png` | 436 KB | 33 |
| `wood_planks.png` | 16 KB | 1 |
| `market.png` | 65 KB | 1 |
| `hay.png` | 24 KB | 1 |
| `jute.png` | 3 KB | 1 |

## Las piezas, y por que cada una

Las medidas estan en metros y salen de leer el `.glb`, no de la documentacion
del pack. La celda del kit es de **4 m** y el muro mide **3 m** de alto.

El **tipo** decide que se le exige a la pieza: `modulo` se coloca en la rejilla
y apoya en y = 0; `techo` vuela sobre un modulo a proposito; `encaje` se
encastra y baja por debajo de y = 0 para no dejar junta; `adorno` solo se posa.

| Pieza | Tipo | Medida (m) | Tri | Para que |
| --- | --- | --- | --- | --- |
| `plaster_wall.glb` | modulo | 4.000 x 3.000 x 4.000 | 96 | cuerpo de casa, entramado de madera |
| `plaster_wall_alt.glb` | modulo | 4.000 x 3.000 x 4.000 | 96 | la misma con otro entramado: diferencia casas sin modelar nada |
| `plaster_wall_stone_base.glb` | modulo | 4.000 x 3.000 x 4.000 | 96 | casa con zocalo de piedra, para las de la calle mojada |
| `plaster_wall_stone_base_alt.glb` | modulo | 4.000 x 3.000 x 4.000 | 96 | variante del zocalo |
| `plaster_wall_half.glb` | modulo | 2.000 x 3.000 x 2.000 | 48 | modulo de 2 m, para casas que no son multiplo de 4 |
| `stone_square.glb` | modulo | 4.000 x 3.000 x 4.000 | 96 | cuerpo todo de piedra: la guarnicion y la herreria |
| `stone_archway.glb` | modulo | 4.000 x 3.000 x 4.000 | 208 | el UNICO modulo con vano; portones y pasos cubiertos |
| `stone_archway_top.glb` | techo | 4.000 x 1.000 x 4.000 | 96 | el remate del vano cuando lleva piso encima |
| `stone_floor_4x4.glb` | modulo | 4.000 x 0.000 x 4.000 | 32 | suelo de calle y de interior de piedra |
| `wooden_floor_4x4.glb` | modulo | 4.000 x 0.000 x 4.000 | 32 | suelo de madera, interiores |
| `wood_support_square.glb` | encaje | 4.225 x 3.111 x 4.225 | 580 | voladizo: el piso de arriba sobresale, que es la silueta medieval |
| `wood_support_beam.glb` | encaje | 2.000 x 0.225 x 0.200 | 20 | viga suelta, para romper fachadas iguales |
| `roof_straw.glb` | techo | 4.000 x 2.559 x 4.765 | 184 | paja: las casas pobres, que en Corinth son casi todas |
| `roof_straw_end.glb` | techo | 4.765 x 2.559 x 0.500 | 44 | remate del faldon de paja |
| `roof_straw_corner.glb` | techo | 4.396 x 2.559 x 4.389 | 189 | esquina, para plantas en L |
| `roof_straw_square.glb` | techo | 4.765 x 2.537 x 4.765 | 215 | tejado a cuatro aguas sobre un solo modulo |
| `roof_red.glb` | techo | 4.000 x 2.559 x 4.765 | 184 | teja roja: las pocas casas con dinero |
| `roof_red_end.glb` | techo | 4.765 x 2.559 x 0.500 | 44 | remate del faldon de teja |
| `roof_red_square.glb` | techo | 4.765 x 2.537 x 4.765 | 215 | cuatro aguas de teja |
| `door_wood.glb` | adorno | 1.228 x 2.174 x 0.288 | 28 | puerta; es una losa que se pega, NO abre vano |
| `door_wood_rounded.glb` | adorno | 1.228 x 2.174 x 0.288 | 76 | puerta de arco, para diferenciar |
| `door_wood_metal_grate.glb` | adorno | 1.228 x 2.174 x 0.288 | 30 | puerta reforzada: la de la guarnicion |
| `window_square.glb` | adorno | 0.950 x 0.908 x 0.249 | 28 | ventana |
| `window_rounded.glb` | adorno | 0.953 x 1.687 x 0.224 | 76 | ventana de arco |
| `chimney.glb` | adorno | 1.149 x 5.000 x 1.736 | 92 | chimenea; en la herreria es la que cuenta la historia |
| `chimney_large.glb` | adorno | 1.168 x 8.000 x 1.741 | 116 | chimenea gorda, para la fragua |
| `stairs_wood.glb` | encaje | 2.023 x 1.015 x 2.183 | 128 | escalera exterior |
| `strairs_stone.glb` | encaje | 2.023 x 1.015 x 2.183 | 128 | el tramo de escalera de piedra: sube 1,015 m por cada 2,183 m |
| `door_stone_metal_grate.glb` | adorno | 1.228 x 2.174 x 0.288 | 30 | LA reja: lo unico que hay que ver para entender que no se pasa |
| `stone_square_half_1m.glb` | encaje | 2.000 x 1.000 x 2.000 | 16 | pieza de brocal de 2x1x2. Baja 19 mm bajo cero: el pack la hizo para encastrarse, no para apoyar |
| `stone_square_1m.glb` | encaje | 4.000 x 1.000 x 4.000 | 32 | brocal de celda entera y parapeto del patio; baja los mismos 19 mm |
| `wood_support_beam_metal.glb` | encaje | 0.233 x 3.098 x 0.223 | 100 | poste con herraje: la horca del torno |
| `barrel.glb` | adorno | 0.980 x 1.145 x 0.980 | 252 | barril cerrado |
| `crate.glb` | adorno | 0.468 x 0.244 x 0.735 | 28 | cajon |
| `haybale.glb` | adorno | 1.800 x 0.794 x 1.353 | 44 | paja |
| `jutesack_closed.glb` | adorno | 0.756 x 0.828 x 0.458 | 120 | saco |

## Lo que el pack NO trae, y hay que resolver aparte

- **Ningun muro con vano de puerta.** `door_wood` y `window_square` son losas
  planas que se pegan encima; no abren nada. El unico modulo con hueco es
  `stone_archway`. Un muro con vano hay que generarlo, y se puede: los muros
  estan subdivididos en multiplos de 1 m exactos.
- **Nada de guarnicion.** Ni yunque, ni fragua, ni empalizada, ni torre, ni
  puerta de muralla.
- **Ni pozo, ni valla, ni cartel, ni carro.**
