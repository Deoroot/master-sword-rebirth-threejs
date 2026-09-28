// Mapas de verdad conocida, escritos a mano.
//
// La regla del experimento 02 que motiva este archivo: un medidor que se
// equivoca no falla, da una cifra plausible. Contra estos mapas se sabe de
// antemano cuantos vertices, cuantas caras y que volumen tiene que salir, asi
// que un cargador roto no puede pasar desapercibido.

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
export const MAP_LAB = join(here, "..", "..", "Mydra Map Lab");
export const PLAZA = join(MAP_LAB, "build", "plaza.map");
// El pueblo lo construye tools/village.mjs; vive en este proyecto, no en el 02.
export const PUEBLO = join(here, "..", "public", "maps", "pueblo.map");
// El mismo plano con el suelo emitido en rampas en vez de en escalones:
// node tools/village.mjs --relieve=rampas
export const PUEBLO_RAMPAS = join(here, "..", "public", "maps", "pueblo-rampas.map");

/**
 * Seis caras de un cuboide, con la normal hacia fuera.
 *
 * Copiado de probe_leaktest.py a proposito, sin reordenar los puntos: si se
 * invierten, qbsp descarta el brush con 'no visible sides' y el mundo compila
 * vacio. Es el falso positivo que el 02 ya pago una vez.
 */
export function brush([x0, y0, z0], [x1, y1, z1], texture = "testtex") {
  const faces = [
    [[x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], // +Z
    [[x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], // -Z
    [[x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], // +Y
    [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1]], // -Y
    [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1]], // +X
    [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1]], // -X
  ];
  const lines = ["{"];
  for (const pts of faces) {
    lines.push(
      pts.map((p) => `( ${p[0]} ${p[1]} ${p[2]} )`).join(" ") +
        ` ${texture} 0 0 0 1 1`
    );
  }
  lines.push("}");
  return lines.join("\n");
}

/** Un .map completo a partir de una lista de cajas y un punto de aparicion. */
export function mapText(boxes, { spawn = [0, 0, 24] } = {}) {
  return (
    '{\n"classname" "worldspawn"\n"wad" ""\n' +
    boxes.map(([a, b, t]) => brush(a, b, t)).join("\n") +
    "\n}\n" +
    `{\n"classname" "info_player_start"\n"origin" "${spawn.join(" ")}"\n}\n` +
    '{\n"classname" "light"\n"origin" "0 0 96"\n"light" "300"\n}\n'
  );
}

/**
 * Sala sellada con un escalon de `rise` unidades a mitad de camino.
 *
 * El jugador aparece en el extremo -Y y camina hacia +Y. Con rise=16 tiene que
 * subir; con rise=24 no, y que no suba es tan importante como que suba: un
 * autostep demasiado generoso trepa paredes.
 */
export function stepRoom(rise) {
  const t = 16, w = 256, h = 256;
  return mapText(
    [
      [[-w - t, -w - t, -t], [w + t, w + t, 0], "floor01"], // suelo
      [[-w - t, -w - t, h], [w + t, w + t, h + t], "sky01"], // techo
      [[-w - t, w, 0], [w + t, w + t, h], "wall01"],
      [[-w - t, -w - t, 0], [w + t, -w, h], "wall01"],
      [[w, -w, 0], [w + t, w, h], "wall01"],
      [[-w - t, -w, 0], [-w, w, h], "wall01"],
      [[-w, 0, 0], [w, w, rise], "floor01"], // el escalon, mitad +Y de la sala
    ],
    { spawn: [0, -160, 24] }
  );
}

/** La misma sala, pero con el techo corto: tiene fuga y qbsp debe decirlo. */
export function leakyRoom() {
  const t = 16, w = 256, h = 256;
  return mapText([
    [[-w - t, -w - t, -t], [w + t, w + t, 0], "floor01"],
    [[-w + 64, -w + 64, h], [w - 64, w - 64, h + t], "sky01"], // agujero
    [[-w - t, w, 0], [w + t, w + t, h], "wall01"],
    [[-w - t, -w - t, 0], [w + t, -w, h], "wall01"],
    [[w, -w, 0], [w + t, w, h], "wall01"],
    [[-w - t, -w, 0], [-w, w, h], "wall01"],
  ]);
}
