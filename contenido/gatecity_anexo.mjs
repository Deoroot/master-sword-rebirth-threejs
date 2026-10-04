// EL ANEXO DE GATE CITY: el experimento de geometría.
//
// La sala del 88 probó el tubo con cajas. Esto prueba lo otro que preguntó el
// usuario entonces —«no conviene tirarnos a expandir Gate City si no podemos
// replicar su arquitectura de buena forma»—: un trozo NUEVO hecho con las piezas
// de Gate City, para ponerlo al lado del de verdad y ver si se distingue.
//
// No hay nada copiado de `gatecity.bsp`: no existe su `.map`, y descompilarlo
// daría la geometría de DrKill y no una nuestra. Lo que se ha traído son
// MEDIDAS, sacadas del `.bsp` con `build/lab/geometria/medir.mjs` y `medir2.mjs`:
//
//   - el túnel típico (sección en y = −3160): 96 de ancho por 112 de alto, con
//     las cuatro esquinas achaflanadas —16 x 24 abajo, 40 x 24 arriba—, o sea un
//     octógono con 64 de suelo y 16 de techo llano. Todo `rock_07`;
//   - la calle del este (x = 1778): suelo de `ground03`, paredes de 160 de
//     piedra (`K_cobble12`, `stone127`) con vigas de `wood_047` de 8 de grueso
//     puestas a escala 0,5, ventanas `window27` de 96 x 96 a 32 del suelo,
//     puertas de 64 x 112, y un techo de `ms_dirt01` tallado a mano, triángulo
//     a triángulo, entre 150 y 200 por encima del suelo;
//   - los faroles: un `func_illusionary` de 16 x 16 x 26 con `pi_lantern` a
//     escala 0,5, colgado a 108 del suelo de un pescante de `metal_10`, y un
//     `info_texlights` que hace que esa textura alumbre (`255 255 128 100`);
//   - las antorchas: `sprites/Fire1.spr` a escala .45 con una `light` naranja
//     (`255 128 64 100`) al lado.
//
// Las texturas son de `gatecity.wad` y `ms_generic.wad`, de MSR: aquí sólo se
// NOMBRAN, y el `.bsp` compilado, que las lleva dentro, vive en `build/`.
//
// La planta, con el norte arriba (unidades del motor; 39,37 por metro):
//
//                         ┌──────────────┐  y = 400
//                         │   la calle   │
//      ┌──── túnel B ─────┤  dos casas   │
//      │  (octógono)      │  al este     │
//      │ túnel A          └──────────────┘  y = −400
//    ┌─┴──┐
//    │ se │  la cámara donde se nace
//    └────┘

import { interior, caja, prisma, relieve } from "../tools/mapagen.mjs";

export const nombre = "gatecity_anexo";
export const wads = ["gatecity", "ms_generic"];

const ROCA = "rock_07", TIERRA = "ms_dirt01";
const VIGA = { nombre: "wood_047", escala: 0.5 };
const HIERRO = { nombre: "metal_10", escala: 0.5 };

// ── los huecos ──────────────────────────────────────────────────────────────
const CAMARA = { min: [-784, -816, 0], max: [-528, -560, 128] };
const TUNEL_A = { min: [-704, -560, 0], max: [-608, 48, 112] };   // corre a lo largo de y
const TUNEL_B = { min: [-704, -48, 0], max: [-16, 48, 112] };     // y éste a lo largo de x
// La calle se excava 16 de más por cada lado: ese margen lo rellenan el suelo de
// tierra batida y el forro de las paredes, que son de otra textura que el túnel.
const CALLE = { min: [-16, -400, -16], max: [432, 400, 272] };

const roca = interior([CAMARA, TUNEL_A, TUNEL_B, CALLE], 16, { suelo: ROCA, techo: ROCA, pared: ROCA });

// ── el octógono: cuatro chaflanes a lo largo de cada túnel ──────────────────
// `lado` es la pared (su coordenada) y `hacia` +1 o −1: hacia dónde queda el hueco.
const chaflanes = (eje, lado, hacia, a0, a1, alto) => [
  prisma(eje, [[lado, 0], [lado + 16 * hacia, 0], [lado, 24]], a0, a1, ROCA),
  prisma(eje, [[lado, alto], [lado, alto - 24], [lado + 40 * hacia, alto]], a0, a1, ROCA),
];
const octogono = [
  // El túnel A: su pared oeste llega hasta la esquina; la este se para donde se abre el B.
  ...chaflanes(1, -704, +1, -560, 48, 112),
  ...chaflanes(1, -608, -1, -560, -48, 112),
  // El túnel B, hasta la boca misma de la calle (x = 0).
  ...chaflanes(0, 48, -1, -704, 0, 112),
  ...chaflanes(0, -48, +1, -608, 0, 112),
  // La esquina de fuera del codo, a 45° como las de Gate City.
  prisma(2, [[-704, 48], [-648, 48], [-704, -8]], 0, 112, ROCA),
  // Y las cuatro de la cámara.
  ...[[-784, -816, 1, 1], [-528, -816, -1, 1], [-784, -560, 1, -1], [-528, -560, -1, -1]].map(([x, y, sx, sy]) =>
    prisma(2, [[x, y], [x + 64 * sx, y], [x, y + 64 * sy]], 0, 128, ROCA)),
];

// ── la calle: suelo, forro y techo tallado ──────────────────────────────────
const forro = [
  caja([-16, -400, -16], [432, 400, 0], "ground03"),
  caja([416, -400, 0], [432, 400, 272], TIERRA),
  caja([0, -400, 0], [416, -384, 272], TIERRA),
  caja([0, 384, 0], [416, 400, 272], TIERRA),
  // la pared del oeste, con la boca del túnel
  caja([-16, -400, 0], [0, -48, 272], TIERRA),
  caja([-16, 48, 0], [0, 400, 272], TIERRA),
  caja([-16, -48, 112], [0, 48, 272], TIERRA),
];

/** Un ruido que no cambia de una compilación a otra: el techo es siempre el mismo. */
const ruido = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
// Una bóveda rebajada: alta en el eje de la calle y más baja contra las casas,
// con cada vértice movido a mano alzada. Nunca baja de 168 sobre las casas, que miden 160.
const techo = relieve({
  min: [-16, -400], max: [432, 400], paso: [112, 100], tapa: 288, tex: TIERRA,
  cota: (x, y) => 262 - Math.round(70 * ((x - 208) / 224) ** 2) - Math.round(34 * ruido(x, y)),
});

// ── las casas ───────────────────────────────────────────────────────────────
// La fachada mira al oeste (−x) y sale 16 del forro; las vigas, 4 más.
const X = 400;
const poste = (y, z0 = 0, z1 = 160) => caja([X - 4, y, z0], [X, y + 8, z1], VIGA);
const viga = (y0, y1, z) => caja([X - 4, y0, z], [X, y1, z + 8], VIGA);
/** Un jabalcón: del poste (a `y`) sube a 45° hasta la viga de z = 112. `hacia` +1 o −1. */
const jabalcon = (y, hacia) => prisma(0, [[y, 72], [y, 84], [y + 28 * hacia, 112], [y + 40 * hacia, 112]], X - 4, X, VIGA);
/** Una hoja pegada a la fachada con su textura encajada: `ancho` y `alto` son los de la textura. */
const hoja = (y0, y1, z0, z1, tex, ancho, alto, sale = 2) => caja([X - sale, y0, z0], [X, y1, z1], {
  lados: VIGA, arriba: VIGA, abajo: VIGA,
  oeste: { nombre: tex, escala: [(y1 - y0) / ancho, (z1 - z0) / alto], desp: [(-y0 * ancho / (y1 - y0)) % ancho, (z1 * alto / (z1 - z0)) % alto] },
});

function casa(y0, y1, piedra, piezas) {
  return [
    caja([X, y0, 0], [X + 16, y1, 160], piedra),
    poste(y0), poste(y1 - 8),
    viga(y0, y1, 112), viga(y0, y1, 152),
    jabalcon(y0 + 8, +1), jabalcon(y1 - 8, -1),
    ...piezas,
  ];
}
const casas = [
  // la del sur: una puerta y una ventana, con un poste en medio
  ...casa(-352, -48, "K_cobble12", [
    hoja(-328, -264, 0, 112, "door_14i", 64, 128),
    poste(-204),
    hoja(-180, -84, 32, 128, "window27", 96, 96, 3),
  ]),
  // la del norte: puerta de dos hojas entre dos ventanas
  ...casa(48, 352, "stone127", [
    hoja(64, 160, 32, 128, "window27", 96, 96, 3),
    poste(160, 0, 112), poste(264, 0, 112),
    hoja(168, 264, 0, 112, "door_14h", 96, 128),
    hoja(272, 336, 40, 104, "window27", 96, 96, 3),
  ]),
  // el marco de la boca del túnel, como el del pasadizo de la calle de Gate City
  caja([0, -60, 0], [8, -48, 124], VIGA),
  caja([0, 48, 0], [8, 60, 124], VIGA),
  caja([0, -60, 112], [8, 60, 124], VIGA),
];

// ── la luz ──────────────────────────────────────────────────────────────────
const luz = (x, y, z, color) => ({ classname: "light", origin: `${x} ${y} ${z}`, _light: color, _fade: "1.0" });

/** Un farol colgado de la fachada, a la altura de `y`: pescante, cuerpo luminoso y su luz. */
function farol(y) {
  const cuerpo = (n) => {
    if (Math.abs(n[2]) > 0.5) return HIERRO;
    // la textura mide 32 x 64 y va a escala 0,5: una vuelta entera por cara, de arriba abajo
    const u0 = Math.abs(n[0]) > 0.5 ? y - 8 : X - 34;
    return { nombre: "pi_lantern", escala: 0.5, desp: [(-u0 * 2) % 32, (134 * 2) % 64] };
  };
  return {
    brushes: [caja([X - 34, y - 2, 140], [X - 4, y + 2, 144], HIERRO), caja([X - 27, y - 1, 134], [X - 25, y + 1, 140], HIERRO)],
    entidades: [
      { classname: "func_illusionary", brushes: [caja([X - 34, y - 8, 108], [X - 18, y + 8, 134], cuerpo)] },
      luz(X - 44, y, 104, "255 255 128 90"),
    ],
  };
}

/** Una antorcha en la pared `y` de un túnel: el palo, la llama y su luz. `hacia`: hacia dónde queda el hueco. */
function antorcha(x, y, hacia, eje = 1) {
  const en = (a, b, z) => (eje === 1 ? [a, b, z] : [b, a, z]);
  const p0 = en(x - 2, hacia > 0 ? y : y - 6, 50), p1 = en(x + 2, hacia > 0 ? y + 6 : y, 70);
  const [fx, fy] = en(x, y + 8 * hacia, 0);
  return {
    brushes: [caja(p0.map((c, i) => Math.min(c, p1[i])), p0.map((c, i) => Math.max(c, p1[i])), "wood_052")],
    entidades: [
      { classname: "env_sprite", origin: `${fx} ${fy} 82`, model: "sprites/Fire1.spr", scale: ".45", rendermode: "5", renderamt: "200", framerate: "10.0", spawnflags: "1" },
      luz(...en(x, y + 20 * hacia, 0).slice(0, 2), 84, "255 128 64 100"),
    ],
  };
}

const piezas = [
  farol(-200), farol(212),
  antorcha(-400, 48, -1), antorcha(-120, -48, +1),      // el túnel B
  antorcha(-300, -704, +1, 0),                           // el túnel A (su pared es un plano x)
  antorcha(-656, -816, +1),                              // la cámara
];

export const brushes = [...roca, ...octogono, ...forro, ...techo, ...casas, ...piezas.flatMap((p) => p.brushes)];

// Lo que el jugador LEE va en inglés (CLAUDE.md, arriba del todo; el 88, §7).
export const mundo = {
  maptitle: "Gate City Annex",
  mapdesc: "A side street carved off the jharro. Geometry test.",
  MaxRange: "2560",
};

const adorno = (model, x, y, yaw = 0) => ({
  classname: "env_model", origin: `${x} ${y} 0`, model, angles: `0 ${yaw} 0`,
  mins: "-16 -16 0", maxs: "16 16 36", scale: "1.0", framerate: "1.0", rendercolor: "0 0 0",
});

export const entidades = [
  ...piezas.flatMap((p) => p.entidades),
  { classname: "info_texlights", origin: "208 0 100", pi_lantern: "255 255 128 100" },
  // La farola de pie del centro de la calle, con su luz 88 por encima, como las dos de Gate City.
  adorno("models/props/Lamp.mdl", 150, 0, 180),
  { ...luz(150, -16, 88, "255 223 0 150"), _fade: "1.5" },
  adorno("models/props/wood_barrel1.mdl", 376, 368), adorno("models/props/wood_barrel1.mdl", 344, 364),
  adorno("models/props/wood_barrel1.mdl", 366, -24),
  // El origen de un jugador es el centro de su caja de 72 de alto: 36 sobre el suelo.
  { classname: "ms_player_begin", origin: "-656 -688 36", angles: "0 90 0" },
  { classname: "ms_player_spawn", origin: "-656 -640 36", angles: "0 90 0" },
  // Y una rata al fondo de la calle, a 33 m de donde se nace: el horneado de la
  // aparición se niega con un hostil a menos de 15 m (el 88).
  //
  // Es la rata de la MISIÓN: `scriptfile` gana a `defscriptfile`
  // (msmonsterserver.cpp:415-416), así que corre `contenido/scripts/gatecity_anexo/rat.script`,
  // que es la del juego más el aviso al guarda cuando muere.
  { classname: "msmonster_giantrat", origin: "100 340 8", angles: "0 270 0", defscriptfile: "monsters/giantrat",
    scriptfile: "gatecity_anexo/rat", spawnchance: "100" },
  // El guarda, delante de la casa del sur: el primer NPC de misión nuestro. Las
  // claves, las de los `ms_npc` de Gate City.
  { classname: "ms_npc", origin: "340 -130 8", angles: "0 180 0", scriptfile: "gatecity_anexo/warden",
    lives: "1", spawnchance: "100", delaylow: "30", delayhigh: "300" },
];
