// Emisor de .map: de un plano en texto a brushes calculados.
//
// La regla del experimento 02 que manda aqui: **no pedir al modelo que invente
// geometria, calcularla**. El autor escribe un plano de planta legible y una
// tabla de casas; este archivo produce los brushes. Nadie escribe coordenadas
// a mano, asi que no hay coordenadas a mano que puedan estar mal.
//
// Todo en unidades de Quake, con Z arriba, que es el sistema del .map.

// --- primitivas ------------------------------------------------------------

/**
 * Un brush a partir de sus caras.
 *
 * Cada cara son al menos tres vertices coplanarios, **en cualquier orden**. La
 * orientacion la arregla esta funcion: calcula el centro del brush y le da la
 * vuelta a la cara que mire hacia dentro.
 *
 * Que lo haga la maquina y no el autor no es comodidad. Un brush con una cara
 * invertida no da error: qbsp lo descarta con 'no visible sides' y esa pared
 * sencillamente no esta. Escribir a mano el orden correcto de los vertices de
 * los dos faldones de un tejado, que miran a lados contrarios, es justo el
 * tipo de cosa que sale mal una vez de cada tres y no avisa.
 */
export function brushFromFaces(faces, texture, align = "0 0 0 1 1") {
  const all = faces.flatMap((f) => f.verts ?? f);
  const centre = [0, 1, 2].map((i) => all.reduce((s, v) => s + v[i], 0) / all.length);

  const lines = ["{"];
  for (const face of faces) {
    const verts = face.verts ?? face;
    if (verts.length < 3) throw new Error("cara con menos de tres vertices");
    const tri = pickTriangle(verts);
    if (!tri) throw new Error("cara con todos los vertices alineados");
    const [v0, v1, v2] = tri;
    // La convencion de plane_of() es normal = cross(p0 - p1, p2 - p1) sobre los
    // tres puntos tal y como se escriben. Emitiendo v0 v1 v2 sale esa normal;
    // emitiendo v2 v1 v0 sale la contraria. Se queda la que se aleja del
    // centro del brush, que es la que mira hacia fuera.
    const n = cross(sub(v0, v1), sub(v2, v1));
    const outward = dot(n, sub(v1, centre)) > 0;
    const pts = (outward ? [v0, v1, v2] : [v2, v1, v0])
      .map((p) => `( ${p.map(fmt).join(" ")} )`)
      .join(" ");
    lines.push(`${pts} ${face.texture ?? texture} ${face.align ?? align}`);
  }
  lines.push("}");
  return lines.join("\n");
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

/** Tres vertices de la cara que no esten alineados, o null si no los hay. */
function pickTriangle(verts) {
  for (let i = 0; i < verts.length; i++) {
    for (let j = i + 1; j < verts.length; j++) {
      for (let k = j + 1; k < verts.length; k++) {
        const n = cross(sub(verts[i], verts[j]), sub(verts[k], verts[j]));
        if (dot(n, n) > 1e-9) return [verts[i], verts[j], verts[k]];
      }
    }
  }
  return null;
}

/** Los numeros del .map: enteros cuando se puede, y sin notacion cientifica. */
function fmt(n) {
  const r = Math.round(n);
  return Math.abs(n - r) < 1e-9 ? String(r) : n.toFixed(4);
}

/**
 * Caja alineada a los ejes.
 *
 * `textures` puede ser un nombre para todas las caras o
 * { top, bottom, side } para darle a cada una la suya, que es lo que permite
 * que una calle tenga adoquin arriba y tierra en el canto.
 */
export function box([x0, y0, z0], [x1, y1, z1], textures, align) {
  const t = typeof textures === "string" ? { side: textures } : textures;
  const pick = (k) => t[k] ?? t.side ?? "wall01";
  // Cada cara con sus cuatro esquinas en antihorario visto desde fuera.
  const faces = [
    { verts: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], texture: pick("top") },
    { verts: [[x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]], texture: pick("bottom") },
    { verts: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], texture: pick("side") },
    { verts: [[x1, y1, z0], [x0, y1, z0], [x0, y1, z1], [x1, y1, z1]], texture: pick("side") },
    { verts: [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], texture: pick("side") },
    { verts: [[x0, y1, z0], [x0, y0, z0], [x0, y0, z1], [x0, y1, z1]], texture: pick("side") },
  ];
  return brushFromFaces(faces, pick("side"), align);
}

/**
 * Losa de suelo con la cara de arriba inclinada.
 *
 * `z` son las alturas de las cuatro esquinas, en el orden
 * (x0,y0), (x1,y0), (x1,y1), (x0,y1). Se emite como DOS prismas triangulares
 * partidos por la diagonal, y no como una sola pieza, por una razon que no es
 * opinable: cuatro puntos con cuatro alturas distintas no son coplanarios, asi
 * que "la cara de arriba" de esa pieza no existe como plano. Tres puntos
 * siempre lo son.
 *
 * Las esquinas se comparten con las celdas vecinas, asi que las caras
 * verticales de dos losas contiguas son exactamente el mismo rectangulo y no
 * queda rendija. Es lo que permite que un suelo inclinado siga sellando.
 */
export function slab([x0, y0], [x1, y1], bottom, z, textures, align) {
  const t = typeof textures === "string" ? { side: textures } : textures;
  const pick = (k) => t[k] ?? t.side ?? "wall01";
  const [z00, z10, z11, z01] = z;
  for (const v of z) {
    if (!(v > bottom)) throw new Error("una esquina de la losa no llega al fondo");
  }
  const a = [x0, y0, z00];
  const b = [x1, y0, z10];
  const c = [x1, y1, z11];
  const d = [x0, y1, z01];
  return [prism(a, b, c, bottom, pick, align), prism(a, c, d, bottom, pick, align)];
}

/** Prisma triangular de lados verticales: tres esquinas con altura y un fondo plano. */
function prism(p, q, r, bottom, pick, align) {
  const foot = (v) => [v[0], v[1], bottom];
  const wall = (u, v) => ({
    verts: [foot(u), foot(v), v, u],
    texture: pick("side"),
  });
  return brushFromFaces([
    { verts: [p, q, r], texture: pick("top") },
    { verts: [foot(p), foot(q), foot(r)], texture: pick("bottom") },
    wall(p, q),
    wall(q, r),
    wall(r, p),
  ], pick("side"), align);
}

/**
 * Tejado a dos aguas sobre una planta rectangular.
 *
 * Se emite como dos cunas, una por faldon. Una cuna es un brush convexo
 * perfectamente legal; un tejado entero de una pieza no lo seria, porque el
 * caballete lo hace concavo visto desde abajo.
 *
 * `axis` dice hacia donde corre el caballete: "x" o "y". Sale alero fuera de
 * la planta por `eaves` unidades, que es lo que hace que una casa parezca una
 * casa y no una caja con sombrero.
 */
export function gable([x0, y0], [x1, y1], base, rise, axis = "x", eaves = 8, textures = {}) {
  const tex = { top: textures.roof ?? "roof01", side: textures.roof ?? "roof01", ...textures };
  const a0 = x0 - eaves, a1 = x1 + eaves;
  const b0 = y0 - eaves, b1 = y1 + eaves;
  const out = [];

  // Los dos faldones. Con brushFromFaces orientando sola cada cara, un faldon
  // es solo su lista de vertices: no hay que acertar el sentido de giro, que
  // es lo que hacia que el de barlovento saliera bien y el de sotavento no.
  if (axis === "x") {
    const mid = (b0 + b1) / 2;
    for (const near of [b0, b1]) {
      out.push(
        wedge(
          [a0, near, base], [a1, near, base],      // alero
          [a0, mid, base + rise], [a1, mid, base + rise], // caballete
          [a0, mid, base], [a1, mid, base],        // canto interior
          tex
        )
      );
    }
  } else {
    const mid = (a0 + a1) / 2;
    for (const near of [a0, a1]) {
      out.push(
        wedge(
          [near, b0, base], [near, b1, base],
          [mid, b0, base + rise], [mid, b1, base + rise],
          [mid, b0, base], [mid, b1, base],
          tex
        )
      );
    }
  }
  return out;
}

/**
 * Un faldon: prisma triangular de seis vertices.
 *
 * lowA-lowB es el alero, highA-highB el caballete, y innerA-innerB el canto
 * vertical que queda contra el otro faldon.
 */
function wedge(lowA, lowB, highA, highB, innerA, innerB, tex) {
  const roof = tex.roof ?? "roof01";
  return brushFromFaces(
    [
      { verts: [lowA, lowB, highB, highA], texture: roof },            // el faldon
      { verts: [lowA, lowB, innerB, innerA], texture: tex.under ?? roof }, // el suelo
      { verts: [highA, highB, innerB, innerA], texture: roof },        // el caballete
      { verts: [lowA, highA, innerA], texture: tex.gable ?? roof },    // hastiales
      { verts: [lowB, highB, innerB], texture: tex.gable ?? roof },
    ],
    roof
  );
}

/**
 * Anillo de piedra: un brocal, una torre hueca, un pretil redondo.
 *
 * Se emite como `segments` prismas, cada uno con sus seis caras. No se puede
 * hacer de una pieza: un anillo es concavo por dentro y un brush tiene que ser
 * convexo. Y cada segmento tampoco es un arco sino una cuerda, asi que un
 * circulo de ocho lados se ve ochavado -que a esta resolucion no desentona-
 * y de dieciseis ya se lee como redondo.
 *
 * @param {[number, number]} centre
 * @param {number} rIn  radio interior
 * @param {number} rOut radio exterior
 */
export function ring([cx, cy], rIn, rOut, z0, z1, texture, segments = 16, align) {
  if (rIn >= rOut) throw new Error("el radio interior no puede llegar al exterior");
  if (segments < 3) throw new Error("un anillo necesita al menos tres segmentos");
  const out = [];
  for (let k = 0; k < segments; k++) {
    const a0 = (k / segments) * Math.PI * 2;
    const a1 = ((k + 1) / segments) * Math.PI * 2;
    const at = (r, a, z) => [cx + r * Math.cos(a), cy + r * Math.sin(a), z];
    const i0 = at(rIn, a0, z0), i1 = at(rIn, a1, z0);
    const o0 = at(rOut, a0, z0), o1 = at(rOut, a1, z0);
    const I0 = at(rIn, a0, z1), I1 = at(rIn, a1, z1);
    const O0 = at(rOut, a0, z1), O1 = at(rOut, a1, z1);
    out.push(
      brushFromFaces(
        [
          { verts: [I0, I1, O1, O0] }, // arriba
          { verts: [i0, i1, o1, o0] }, // abajo
          { verts: [i0, i1, I1, I0] }, // cara interior
          { verts: [o0, o1, O1, O0] }, // cara exterior
          { verts: [i0, o0, O0, I0] }, // junta con el segmento anterior
          { verts: [i1, o1, O1, I1] }, // junta con el siguiente
        ],
        texture,
        align
      )
    );
  }
  return out;
}

/**
 * Un panel de pared con huecos: la fachada de una casa.
 *
 * No se puede "restar" un hueco a un brush. Un brush es un solido convexo y
 * quitarle un trozo lo deja concavo, asi que el panel se parte en piezas que
 * rodean los huecos. Aqui se hace por bandas verticales: tramos llenos entre
 * hueco y hueco, y encima y debajo de cada hueco el dintel y el antepecho.
 *
 * Exige que los huecos no se solapen en horizontal, y lo comprueba: dos huecos
 * que se pisan producirian piezas superpuestas, y dos brushes superpuestos no
 * dan error, solo caras que parpadean.
 *
 * @param {{u0:number,u1:number,v0:number,v1:number}} panel  en coordenadas del
 *   panel: u a lo ancho, v a lo alto.
 * @param {Array<{u0:number,u1:number,v0:number,v1:number}>} holes
 * @param {(u0:number,v0:number,u1:number,v1:number)=>void} emit  recibe cada pieza
 */
export function panelWithHoles(panel, holes, emit) {
  const sorted = [...holes].sort((a, b) => a.u0 - b.u0);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].u0 < sorted[i - 1].u1) {
      throw new Error("dos huecos de la fachada se solapan en horizontal");
    }
  }
  for (const h of sorted) {
    if (h.u0 < panel.u0 || h.u1 > panel.u1 || h.v0 < panel.v0 || h.v1 > panel.v1) {
      throw new Error("un hueco se sale del panel");
    }
  }

  let u = panel.u0;
  for (const h of sorted) {
    if (h.u0 > u) emit(u, panel.v0, h.u0, panel.v1); // tramo lleno antes del hueco
    if (h.v0 > panel.v0) emit(h.u0, panel.v0, h.u1, h.v0); // antepecho
    if (h.v1 < panel.v1) emit(h.u0, h.v1, h.u1, panel.v1); // dintel
    u = h.u1;
  }
  if (u < panel.u1) emit(u, panel.v0, panel.u1, panel.v1);
}

// --- el mapa entero --------------------------------------------------------

export class MapBuilder {
  constructor() {
    this.brushes = [];
    this.entities = [];
  }

  add(...brushes) {
    for (const b of brushes.flat()) this.brushes.push(b);
    return this;
  }

  entity(classname, props = {}) {
    this.entities.push({ classname, ...props });
    return this;
  }

  point(classname, [x, y, z], props = {}) {
    return this.entity(classname, { origin: `${fmt(x)} ${fmt(y)} ${fmt(z)}`, ...props });
  }

  toText() {
    if (!this.brushes.length) {
      // Un mundo vacio sella perfecto. Negarse aqui es mas barato que
      // descubrirlo mirando una pantalla de niebla.
      throw new Error("el mapa no tiene ni un brush");
    }
    const out = ['{\n"classname" "worldspawn"\n"wad" ""'];
    out.push(this.brushes.join("\n"));
    out.push("}");
    for (const e of this.entities) {
      const { classname, ...props } = e;
      out.push("{");
      out.push(`"classname" "${classname}"`);
      for (const [k, v] of Object.entries(props)) out.push(`"${k}" "${v}"`);
      out.push("}");
    }
    return out.join("\n") + "\n";
  }
}

// --- plano de planta -------------------------------------------------------

/**
 * Lee un plano de planta en texto y devuelve la rejilla y sus dimensiones.
 *
 * Las filas se leen de arriba abajo en el texto y de +Y a -Y en el mapa, que
 * es lo que hace que el plano escrito se parezca al mapa visto desde arriba en
 * vez de salir del reves.
 */
export function readPlan(text) {
  const rows = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.length && !l.startsWith("//"));
  if (!rows.length) throw new Error("el plano esta vacio");
  const width = Math.max(...rows.map((r) => r.length));
  const grid = rows.map((r) => r.padEnd(width, " ").split(""));
  return { grid, width, height: grid.length };
}

/**
 * Agrupa cada fila en tramos seguidos del mismo caracter.
 *
 * Sin esto, un pueblo de veinte por veinte celdas serian cuatrocientos brushes
 * de suelo y qbsp tardaria lo suyo. Con esto son unas decenas, y ademas el
 * .map se puede leer.
 */
export function runs(grid) {
  const out = [];
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x;
      while (end + 1 < row.length && row[end + 1] === ch) end++;
      out.push({ ch, y, x0: x, x1: end });
      x = end + 1;
    }
  });
  return out;
}
