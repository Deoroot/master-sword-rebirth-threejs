"""Trae texturas CC0 de Poly Haven y las reduce a tamano retro.

Mismo planteamiento que tools/fetch_textures.py del experimento 02, del que
sale este archivo, con dos cambios: la lista de texturas es la que pide un
pueblo medieval, y ademas de bajarlas escribe PROCEDENCIA.md, porque la regla
del proyecto es que ningun asset entra sin archivo de licencia al lado y esa
regla no puede depender de que alguien se acuerde de editar el .md.

Poly Haven publica todo como CC0: uso comercial, redistribucion y modificacion
sin atribucion obligatoria. Ver https://polyhaven.com/license

Uso: python tools/fetch_textures.py
"""
from __future__ import annotations

import io
import json
import urllib.request
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "public" / "textures"
SIZE = 128          # la baja resolucion no da el estilo, pero el estilo la pide
RESOLUTION = "1k"   # de donde se reduce

# nombre en el .map -> id de Poly Haven
WANTED = {
    "wall01": "castle_brick_07",
    "floor01": "cobblestone_floor_04",
    "ceil01": "castle_wall_slates",
    "grass01": "grass_ground",
    "road01": "grass_path_2",
    "roof01": "clay_roof_tiles_02",
    "plaster01": "rough_plaster_brick",
    "wood01": "brown_planks_05",
    "bark01": "bark_brown_01",
}

AGENT = {"User-Agent": "mydra-web-lab/1.0 (+asset fetch script)"}


def open_url(url: str, timeout: int = 60):
    return urllib.request.urlopen(
        urllib.request.Request(url, headers=AGENT), timeout=timeout
    )


def get_json(url: str):
    with open_url(url) as r:
        return json.load(r)


def diffuse_url(asset_id: str) -> str:
    files = get_json(f"https://api.polyhaven.com/files/{asset_id}")
    for key in ("Diffuse", "diffuse", "albedo", "col"):
        if key in files:
            variants = files[key]
            level = variants.get(RESOLUTION) or next(iter(variants.values()))
            for fmt in ("jpg", "png"):
                if fmt in level:
                    return level[fmt]["url"]
    raise SystemExit(f"{asset_id}: no encuentro mapa difuso")


def seam(image: Image.Image) -> float:
    """Cuanto se nota la costura al repetir la tesela, de 0 a 1.

    Se compara la columna de la izquierda con la de la derecha y la fila de
    arriba con la de abajo. Una textura de Poly Haven es seamless por diseno,
    asi que esto no es una comprobacion de calidad sino de que el reescalado no
    la ha roto: reducir con LANCZOS puede meter halo en los bordes.
    """
    px = image.convert("RGB")
    w, h = px.size
    total = 0.0
    for y in range(h):
        a = px.getpixel((0, y))
        b = px.getpixel((w - 1, y))
        total += sum(abs(x - y2) for x, y2 in zip(a, b)) / (3 * 255)
    for x in range(w):
        a = px.getpixel((x, 0))
        b = px.getpixel((x, h - 1))
        total += sum(abs(p - q) for p, q in zip(a, b)) / (3 * 255)
    return total / (w + h)


def main() -> None:
    DEST.mkdir(parents=True, exist_ok=True)
    rows = []
    for name, asset_id in WANTED.items():
        info = get_json(f"https://api.polyhaven.com/info/{asset_id}")
        url = diffuse_url(asset_id)
        with open_url(url) as r:
            raw = r.read()
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        small = image.resize((SIZE, SIZE), Image.LANCZOS)
        out = DEST / f"{name}.png"
        small.save(out)
        s = seam(small)
        print(f"{name:10} {asset_id:24} {len(raw) // 1024:5} KiB -> {SIZE}px  costura {s:.3f}")
        rows.append(
            (name, asset_id, info.get("name", asset_id),
             ", ".join(info.get("authors", {}).keys()) or "sin autoria declarada", s)
        )

    doc = [
        "# Procedencia de las texturas",
        "",
        "Generado por [tools/fetch_textures.py](../../tools/fetch_textures.py). No se",
        "edita a mano: si se cambia la lista de texturas, se vuelve a ejecutar.",
        "",
        "Todas de Poly Haven, **CC0**. Su pagina de licencia dice textualmente:",
        "«All assets (HDRIs, textures and 3D models) on this site are licensed as",
        "CC0, which is effectively Public Domain», con uso comercial y redistribucion",
        "permitidos y sin atribucion obligatoria.",
        "Fuente: <https://polyhaven.com/license>",
        "",
        "El campo `license` de su API llega vacio; la licencia viene de esa pagina, no",
        "del API. Se anota por la regla del proyecto: ningun asset sin licencia.",
        "",
        f"Reducidas de {RESOLUTION} a {SIZE}x{SIZE} px con LANCZOS. La columna «costura»",
        "mide cuanto se nota el corte al repetir la tesela, de 0 a 1: las de Poly Haven",
        "son seamless por diseno, asi que una cifra alta significaria que el reescalado",
        "la ha roto, no que la textura sea mala.",
        "",
        "| Archivo | Asset de Poly Haven | Titulo | Autoria | Costura |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, asset_id, title, authors, s in rows:
        doc.append(
            f"| `{name}.png` | [{asset_id}](https://polyhaven.com/a/{asset_id}) "
            f"| {title} | {authors} | {s:.3f} |"
        )
    doc += [
        "",
        "La atribucion no es obligatoria en CC0. Se incluye porque cuesta nada y porque",
        "asi el origen queda comprobable.",
        "",
        "## Lo que no viene de aqui",
        "",
        "`sky01.png` y `door01.png` los calcula",
        "[tools/make_textures.py](../../tools/make_textures.py) a partir de senos de",
        "frecuencia entera, que es la unica forma de que la tesela no tenga costura.",
        "Al ser obra nuestra no hay licencia de terceros que anotar, y es a proposito:",
        "un cielo es de lo mas facil de generar y de lo mas molesto de encontrar con",
        "licencia limpia.",
        "",
        "`tree01.png` y `bush01.png` son siluetas con canal alfa, tambien nuestras,",
        "calculadas por el mismo script.",
        "",
    ]
    (DEST / "PROCEDENCIA.md").write_text("\n".join(doc), encoding="utf8")
    print(f"\n{len(rows)} texturas en {DEST}, con PROCEDENCIA.md")


if __name__ == "__main__":
    main()
