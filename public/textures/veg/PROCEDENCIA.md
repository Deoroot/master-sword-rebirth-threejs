# Procedencia de la vegetacion

Generado por [tools/import_vegetation.py](../../../tools/import_vegetation.py).
No se edita a mano: si se cambia la lista, se vuelve a ejecutar.

## Retro PSX Style Tree Pack, de Elegant Crow

**CC0 (dominio publico).** La pagina del pack dice textualmente:

> «The models on this pack are under the CC0 license»
> «Credit is not mandatory but greatly appreciated.»
> «Textures come from CC0Textures.com.»

Fuente: <https://elegantcrow.itch.io/psx-retro-style-tree-pack>

El credito no es obligatorio en CC0. Se incluye porque cuesta nada y porque asi
el origen queda comprobable.

Nota: la carpeta del pack en disco dice «Elegant Cow»; el autor se llama
**Elegant Crow**. Es una errata del nombre de la carpeta, no otro autor.

| Archivo | Origen | Tamano | Opacidad |
| --- | --- | --- | --- |
| `bush01.png` | `bush01.png` | 128x128 | 49.7% |
| `bush02.png` | `bush02.png` | 128x128 | 44.3% |
| `bush03.png` | `bush03.png` | 128x128 | 42.5% |
| `bush04.png` | `bush04.png` | 128x128 | 42.7% |
| `bush05.png` | `bush05.png` | 128x128 | 39.7% |
| `bush06.png` | `bush06.png` | 128x128 | 45.5% |
| `bush07.png` | `bush07.png` | 128x128 | 37.0% |
| `bush08.png` | `bush08.png` | 128x128 | 49.6% |

## Lo que NO se copia

Los `treeNN.png` del mismo pack son atlas para sus modelos .fbx: llevan
el tronco en una franja y la copa en otra. Como cartel saldria el tronco
estirado al lado de la copa, asi que los arboles siguen siendo los
procedurales de `tools/make_textures.py`.
