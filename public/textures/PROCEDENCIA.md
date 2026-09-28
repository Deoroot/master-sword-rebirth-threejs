# Procedencia de las texturas

Generado por [tools/fetch_textures.py](../../tools/fetch_textures.py). No se
edita a mano: si se cambia la lista de texturas, se vuelve a ejecutar.

Todas de Poly Haven, **CC0**. Su pagina de licencia dice textualmente:
«All assets (HDRIs, textures and 3D models) on this site are licensed as
CC0, which is effectively Public Domain», con uso comercial y redistribucion
permitidos y sin atribucion obligatoria.
Fuente: <https://polyhaven.com/license>

El campo `license` de su API llega vacio; la licencia viene de esa pagina, no
del API. Se anota por la regla del proyecto: ningun asset sin licencia.

Reducidas de 1k a 128x128 px con LANCZOS. La columna «costura»
mide cuanto se nota el corte al repetir la tesela, de 0 a 1: las de Poly Haven
son seamless por diseno, asi que una cifra alta significaria que el reescalado
la ha roto, no que la textura sea mala.

| Archivo | Asset de Poly Haven | Titulo | Autoria | Costura |
| --- | --- | --- | --- | --- |
| `wall01.png` | [castle_brick_07](https://polyhaven.com/a/castle_brick_07) | Castle Brick 07 | Rob Tuytel | 0.089 |
| `floor01.png` | [cobblestone_floor_04](https://polyhaven.com/a/cobblestone_floor_04) | Cobblestone Floor 04 | Rob Tuytel | 0.062 |
| `ceil01.png` | [castle_wall_slates](https://polyhaven.com/a/castle_wall_slates) | Castle Wall Slates | Rob Tuytel | 0.094 |
| `grass01.png` | [grass_ground](https://polyhaven.com/a/grass_ground) | Grass Ground | Charlotte Baglioni | 0.016 |
| `road01.png` | [grass_path_2](https://polyhaven.com/a/grass_path_2) | Grass Path 2 | Rob Tuytel | 0.045 |
| `roof01.png` | [clay_roof_tiles_02](https://polyhaven.com/a/clay_roof_tiles_02) | Clay Roof Tiles 02 | Amal Kumar | 0.042 |
| `plaster01.png` | [rough_plaster_brick](https://polyhaven.com/a/rough_plaster_brick) | Rough Plaster Brick | Rob Tuytel | 0.049 |
| `wood01.png` | [brown_planks_05](https://polyhaven.com/a/brown_planks_05) | Brown Planks 05 | Rob Tuytel | 0.009 |
| `bark01.png` | [bark_brown_01](https://polyhaven.com/a/bark_brown_01) | Bark Brown 01 | Rob Tuytel | 0.038 |

La atribucion no es obligatoria en CC0. Se incluye porque cuesta nada y porque
asi el origen queda comprobable.

## Lo que no viene de aqui

`sky01.png` y `door01.png` los calcula
[tools/make_textures.py](../../tools/make_textures.py) a partir de senos de
frecuencia entera, que es la unica forma de que la tesela no tenga costura.
Al ser obra nuestra no hay licencia de terceros que anotar, y es a proposito:
un cielo es de lo mas facil de generar y de lo mas molesto de encontrar con
licencia limpia.

`tree01.png` y `bush01.png` son siluetas con canal alfa, tambien nuestras,
calculadas por el mismo script.
