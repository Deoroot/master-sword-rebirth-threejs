"""Trae las siluetas de vegetacion del pack CC0 de Elegant Crow.

Escribe ademas la ficha de licencia. La regla del proyecto es que ningun asset
entra sin archivo de licencia al lado, y esa regla no puede depender de que
alguien se acuerde de editar un .md: si la lista de lo que se copia cambia, la
ficha se regenera sola.

El pack trae dos cosas distintas y solo una sirve aqui:

- `bushNN.png` son siluetas completas de arbusto, con alfa. Valen tal cual como
  cartel, que es lo que usa este proyecto.
- `treeNN.png` son ATLAS para los modelos .fbx: llevan el tronco en una franja
  y la copa en otra, pensados para un arbol de planos cruzados. Como cartel no
  valen -saldria el tronco estirado al lado de la copa-, asi que no se copian.
  Componerlos en una silueta es posible y es otro trabajo.

Uso: python tools/import_vegetation.py
"""
from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(
    r"C:\Users\User\Documents\Visual Studio Projects\Mydra Ages\assets"
    r"\bought_assets\Retro PSX Style Tree Pack by Elegant Cow\textures"
)
DEST = ROOT / "public" / "textures" / "veg"

# nombre de destino -> archivo de origen
WANTED = {f"bush{i:02d}": f"bush{i:02d}.png" for i in range(1, 9)}

DOC = """# Procedencia de la vegetacion

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
"""


def seat(image):
    """Asienta la silueta: la baja hasta que toca el borde inferior.

    Las del pack estan centradas en su lienzo con aire por debajo, porque van
    mapeadas sobre un modelo .fbx y ahi el aire no importa. Como cartel si
    importa: el shader planta el cuadrado por el PIE de la imagen, asi que el
    aire de abajo se convierte en separacion entre la mata y el suelo y la mata
    se ve flotando. Es exactamente el sintoma que se vio mirando.

    Se recorta a la caja de lo opaco y se vuelve a pegar centrado en
    horizontal y pegado abajo, conservando el tamano del lienzo.
    """
    bbox = image.getchannel("A").point(lambda v: 255 if v > 127 else 0).getbbox()
    if bbox is None:
        raise SystemExit("silueta vacia")
    crop = image.crop(bbox)
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    x = (image.width - crop.width) // 2
    y = image.height - crop.height
    out.paste(crop, (x, y))
    return out


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"no se encuentra el pack en {SRC}")
    DEST.mkdir(parents=True, exist_ok=True)

    rows = []
    for name, src_name in WANTED.items():
        src = SRC / src_name
        if not src.exists():
            raise SystemExit(f"falta {src}")
        image = Image.open(src).convert("RGBA")
        image = seat(image)
        out = DEST / f"{name}.png"
        image.save(out)
        alpha = image.getchannel("A")
        solid = sum(1 for v in alpha.tobytes() if v > 127) / (image.width * image.height)
        # Una silueta vacia no da error al cargarse: sale un cartel invisible y
        # la vegetacion entera desaparece sin que nada lo diga.
        if not 0.05 < solid < 0.90:
            raise SystemExit(f"{name}: silueta del {solid * 100:.1f}%, algo va mal")
        base = alpha.crop((0, image.height - 2, image.width, image.height))
        touching = sum(1 for v in base.tobytes() if v > 127)
        if not touching:
            raise SystemExit(f"{name}: la silueta no llega al pie, el cartel flotaria")
        print(
            f"{name:8} {image.width}x{image.height}  "
            f"{solid * 100:5.1f}% opaca  pie si"
        )
        rows.append((name, src_name, f"{image.width}x{image.height}", f"{solid * 100:.1f}%"))

    doc = DOC + "\n".join(
        f"| `{n}.png` | `{s}` | {size} | {op} |" for n, s, size, op in rows
    ) + "\n\n## Lo que NO se copia\n\n" + (
        "Los `treeNN.png` del mismo pack son atlas para sus modelos .fbx: llevan\n"
        "el tronco en una franja y la copa en otra. Como cartel saldria el tronco\n"
        "estirado al lado de la copa, asi que los arboles siguen siendo los\n"
        "procedurales de `tools/make_textures.py`.\n"
    )
    (DEST / "PROCEDENCIA.md").write_text(doc, encoding="utf8")
    print(f"\n{len(rows)} siluetas en {DEST}, con PROCEDENCIA.md")


if __name__ == "__main__":
    main()
