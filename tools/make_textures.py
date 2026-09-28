"""Genera las texturas que son nuestras. Procedurales y reproducibles.

Las demas se bajan de Poly Haven y llevan su ficha de procedencia. Estas no se
bajan de ningun sitio: se calculan aqui, asi que no hay licencia de terceros
que anotar. Es a proposito -- un cielo y la silueta de un arbol son de lo mas
facil de generar y de lo mas molesto de encontrar con licencia limpia.

El cielo tiene que ser una tesela sin costura, y la unica forma de que un
patron sea periodico exactamente es estar hecho de senos de frecuencia entera,
asi que de eso esta hecho. Un ruido cualquiera dejaria una rejilla visible.

Las siluetas de arbol y arbusto no se repiten -- son carteles --, asi que ahi
la costura no importa y lo que importa es el canal alfa: el recorte se hace
con alfa mayor que 0,5, de modo que un borde medio transparente desaparece.

Uso: python tools/make_textures.py
"""
from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image

SIZE = 128
OUT = Path(__file__).resolve().parent.parent / "public" / "textures"


def seam(image: Image.Image) -> float:
    """Cuanto se nota la costura al repetir, de 0 a 1. Ver fetch_textures.py."""
    px = image.convert("RGB")
    w, h = px.size
    total = 0.0
    for y in range(h):
        a, b = px.getpixel((0, y)), px.getpixel((w - 1, y))
        total += sum(abs(p - q) for p, q in zip(a, b)) / (3 * 255)
    for x in range(w):
        a, b = px.getpixel((x, 0)), px.getpixel((x, h - 1))
        total += sum(abs(p - q) for p, q in zip(a, b)) / (3 * 255)
    return total / (w + h)


# --- cielo ------------------------------------------------------------------


def sky() -> Image.Image:
    """Gris azulado de dia encapotado, del color de la niebla de la escena.

    Ni azul de verano ni negro de noche: el cielo tiene que casar con la niebla
    o el horizonte se ve como un borde duro. El color base es el #8D8DB6 que
    usa la escena.
    """
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    tau = 2 * math.pi / SIZE
    for y in range(SIZE):
        for x in range(SIZE):
            # Cuatro senos de frecuencia entera: periodicos exactamente.
            v = (
                0.50 * math.sin(tau * 1 * x + 0.7) * math.sin(tau * 1 * y)
                + 0.28 * math.sin(tau * 2 * x - 1.1) * math.sin(tau * 3 * y + 0.4)
                + 0.14 * math.sin(tau * 5 * x + 2.2) * math.sin(tau * 2 * y - 0.9)
                + 0.08 * math.sin(tau * 7 * x) * math.sin(tau * 7 * y + 1.6)
            )
            k = 1.0 + 0.16 * v
            px[x, y] = (
                min(255, int(0x8D * k)),
                min(255, int(0x8D * k)),
                min(255, int(0xB6 * k)),
            )
    return img


# --- puerta -----------------------------------------------------------------


def door() -> Image.Image:
    """Marca la celda de una puerta a otro nivel.

    Hace falta porque un trigger_level es una entidad de punto y no tiene
    geometria: sin ella el jugador pisa una baldosa igual a las demas y cambia
    de nivel sin haber visto nada. Es la puerta invisible del experimento 02.
    """
    img = Image.new("RGB", (SIZE, SIZE), (58, 40, 26))
    px = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            plank = (x // 16) % 2
            grain = int(12 * math.sin(y * 0.4 + x))
            edge = 1 if (4 < x < SIZE - 5 and 4 < y < SIZE - 5) else 0
            base = (96, 66, 38) if plank else (84, 57, 33)
            if not edge:
                base = (52, 36, 22)
            px[x, y] = tuple(max(0, min(255, c + grain)) for c in base)
    return img


# --- agua -------------------------------------------------------------------


def water() -> Image.Image:
    """Agua quieta y oscura del fondo de un pozo.

    Tesela sin costura por la misma razon que el cielo, y por el mismo metodo:
    senos de frecuencia entera. Oscura a proposito -- el agua de un pozo no
    refleja cielo, esta a tres metros bajo una boca estrecha, y un azul claro
    ahi se lee como una piscina.
    """
    img = Image.new("RGB", (SIZE, SIZE))
    px = img.load()
    tau = 2 * math.pi / SIZE
    for y in range(SIZE):
        for x in range(SIZE):
            v = (
                0.55 * math.sin(tau * 2 * x + 0.4) * math.sin(tau * 3 * y - 0.9)
                + 0.30 * math.sin(tau * 5 * x - 1.3) * math.sin(tau * 4 * y + 1.1)
                + 0.15 * math.sin(tau * 9 * x + 2.0) * math.sin(tau * 8 * y)
            )
            k = 1.0 + 0.30 * v
            px[x, y] = (
                max(0, min(255, int(0x1E * k))),
                max(0, min(255, int(0x3A * k))),
                max(0, min(255, int(0x42 * k))),
            )
    return img


# --- siluetas de vegetacion -------------------------------------------------


def tree(seed: int = 7) -> Image.Image:
    """Una conifera de perfil, con canal alfa.

    El pie del cartel es el borde de abajo de la imagen, no el centro: el
    shader planta el cartel por ahi. Si el arbol se dibujara centrado, saldria
    medio enterrado.
    """
    rng = random.Random(seed)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()

    # Tronco: un rectangulo estrecho en la mitad inferior.
    for y in range(SIZE - 1, int(SIZE * 0.72), -1):
        half = 3 + (SIZE - y) // 26
        for x in range(SIZE // 2 - half, SIZE // 2 + half + 1):
            shade = 1.0 - 0.35 * abs(x - SIZE / 2) / max(half, 1)
            px[x, y] = (int(74 * shade), int(52 * shade), int(34 * shade), 255)

    # Copa: faldones triangulares superpuestos, de arriba abajo.
    tiers = 5
    for t in range(tiers):
        top = SIZE * (0.05 + 0.15 * t)
        bottom = top + SIZE * 0.26
        width = SIZE * (0.10 + 0.085 * t)
        for y in range(int(top), min(SIZE, int(bottom))):
            k = (y - top) / max(bottom - top, 1)
            half = width * k
            # Borde dentado: una conifera con el borde liso parece un cono.
            jag = 1.0 + 0.16 * math.sin(y * 1.9 + t * 2.1) + 0.1 * rng.random()
            half *= jag
            for x in range(int(SIZE / 2 - half), int(SIZE / 2 + half) + 1):
                if not (0 <= x < SIZE):
                    continue
                d = abs(x - SIZE / 2) / max(half, 1)
                light = 1.15 - 0.5 * d + 0.12 * math.sin(x * 0.8 + y * 0.6)
                g = int(max(0, min(255, 96 * light)))
                px[x, y] = (int(g * 0.42), g, int(g * 0.38), 255)
    return img


def bush(seed: int = 11) -> Image.Image:
    """Una mata, para los bordes de los caminos y los pies de las fachadas.

    El borde va dentado y el interior moteado a proposito. Una mata hecha de
    circulos limpios se lee como una bola de plastico verde: a 128 px y con
    filtro nearest, lo unico que distingue una planta de una pelota es que el
    contorno no sea liso.
    """
    rng = random.Random(seed)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()
    cx, cy = SIZE / 2, SIZE * 0.72
    r = SIZE * 0.40
    lumps = [
        (cx + (rng.random() - 0.5) * r * 1.3,
         cy - rng.random() * r * 0.85,
         r * (0.40 + rng.random() * 0.34))
        for _ in range(9)
    ]
    for y in range(SIZE):
        for x in range(SIZE):
            if y > SIZE - 2:
                continue
            for lx, ly, lr in lumps:
                dx, dy = x - lx, y - ly
                d = math.hypot(dx, dy)
                # Borde dentado: el radio efectivo depende del angulo.
                ang = math.atan2(dy, dx)
                jag = 1.0 + 0.16 * math.sin(ang * 7 + lx) + 0.10 * math.sin(ang * 13 - ly)
                if d >= lr * jag:
                    continue
                # Hoja: motas claras y oscuras dentro de la mata.
                leaf = (
                    0.5 + 0.5 * math.sin(x * 1.7 + y * 0.9)
                ) * (0.5 + 0.5 * math.sin(x * 0.6 - y * 2.1))
                light = 1.05 - 0.38 * (d / lr) - 0.14 * (y / SIZE) + 0.22 * leaf
                g = int(max(0, min(255, 150 * light)))
                px[x, y] = (int(g * 0.56), g, int(g * 0.40), 255)
                break
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # Tres clases, y cada una se comprueba por lo que es:
    #   tile    se repite en una pared o un suelo: la costura tiene que ser cero
    #   marca   ocupa una celda entera y no se repite: la costura da igual, y
    #           exigirsela fue un error que este mismo comprobador destapo
    #   cartel  silueta con alfa: lo que importa es cuanto hay opaco
    hechas = []
    for name, image, kind in [
        ("sky01", sky(), "tile"),
        ("door01", door(), "marca"),
        ("water01", water(), "tile"),
        ("tree01", tree(), "cartel"),
        ("bush01", bush(), "cartel"),
    ]:
        image.save(OUT / f"{name}.png")
        hechas.append(name)
        if kind == "tile":
            s = seam(image)
            print(f"{name:8} {SIZE}px  costura {s:.2e}")
            if s > 0.02:
                raise SystemExit(f"{name}: la tesela tiene costura visible ({s:.3f})")
        elif kind == "marca":
            print(f"{name:8} {SIZE}px  marca de una celda, no se repite")
        else:
            alpha = image.getchannel("A")
            solid = sum(1 for v in alpha.tobytes() if v > 127) / (SIZE * SIZE)
            print(f"{name:8} {SIZE}px  silueta {solid * 100:.1f}% opaca")
            # Una silueta vacia no da error al cargarse: sale un cartel
            # invisible, y el bosque entero desaparece sin que nada lo diga.
            if not 0.05 < solid < 0.85:
                raise SystemExit(f"{name}: silueta del {solid * 100:.1f}%, algo va mal")
    # El numero se cuenta, no se escribe: una cifra a mano se queda vieja en
    # cuanto se anade una textura, y una cifra vieja es peor que ninguna.
    print(f"\n{len(hechas)} texturas propias en {OUT}")


if __name__ == "__main__":
    main()
