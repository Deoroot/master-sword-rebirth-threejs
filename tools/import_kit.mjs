// Importa las piezas AUTORIZADAS del kit CC0 "PSX style going medieval" de
// valsekamerplant a public/kit/, y genera su archivo de licencia.
//
//   node tools/import_kit.mjs            importa y da el veredicto
//   node tools/import_kit.mjs --dry      dice que haria, sin escribir nada
//
// Tres cosas que hace, y ninguna es "copiar archivos":
//
// 1. DESINCRUSTA LA TEXTURA. Medido: `plaster_wall.glb` ocupa 440 KB de los que
//    436 son el atlas `bauerhaus.png`, o sea el 99 %. El pack incrusta una copia
//    del mismo PNG en cada una de las 204 piezas que lo usan. Copiarlas tal cual
//    serian megabytes de lo mismo y, peor, una textura distinta en la GPU por
//    pieza: adios a fusionar el pueblo en una malla. Aqui el atlas se escribe
//    UNA vez en public/kit/textures/ y cada .glb se reescribe para apuntar a el.
//
// 2. ARREGLA EL MATERIAL. Todas las piezas vienen con alphaMode BLEND. Un muro
//    translucido no se nota en una pieza suelta y se nota mucho en un pueblo:
//    las caras se ordenan por distancia y se ven unas a traves de otras. El
//    atlas SI tiene zonas con alfa (las hojas, la balaustrada), asi que no vale
//    ponerlo opaco a secas: se pasa a MASK, que recorta por umbral y escribe
//    profundidad. `doubleSided` se respeta, porque las piezas son cascaras sin
//    grosor y sin el se ven huecas desde fuera.
//
// 3. SE VUELVE A LEER LO ESCRITO. Cada .glb reescrito se relee con el mismo
//    medidor de kit.mjs y se compara su caja con la del original. Si un
//    desplazamiento de bufferView quedo mal, la pieza sale con otra medida o no
//    se lee, y eso lo dice esta comprobacion y no un renderizado tres pasos
//    despues.
//
// La lista de abajo es corta a proposito. La regla de esta sesion es ir celda a
// celda; una pieza entra cuando hace falta para una celda, no "por si acaso".

import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readGlb, measure } from "./kit.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PACK = "C:/Users/User/Documents/Visual Studio Projects/Mydra Ages/assets/bought_assets/PSX style going medieval by valsekamerplant";
const OUT = join(ROOT, "public", "kit");
const DRY = process.argv.includes("--dry");

// Las piezas autorizadas, con su tipo y su motivo.
//
// El TIPO no es una etiqueta: decide que reglas se le exigen a la pieza.
//
//   modulo  se coloca en la rejilla de 4 m. Tiene que apoyar en y = 0 y medir
//           un multiplo de la celda, porque la posicion de la celda ES su
//           posicion y no hay correccion que valga.
//   techo   se coloca sobre un modulo y vuela por encima de el a proposito;
//           su caja se sale de la celda, y eso esta bien.
//   encaje  se encastra en otra pieza -vigas, voladizos, escaleras-: parte de
//           su geometria va POR DEBAJO de y = 0 a proposito, para que no quede
//           junta visible. Medido: la viga baja 12,5 cm.
//   adorno  se posa suelto en el suelo o se pega a una pared. Ni rejilla ni
//           celda; solo tiene que verse.
//
// El motivo tampoco es documentacion: es lo que permite quitar una pieza mas
// adelante sabiendo exactamente que se pierde.
const AUTORIZADAS = [
  // --- la casa: cascaras de cuarto de 4x4x3 -------------------------------
  ["Building blocks/plaster_wall.glb", "modulo", "cuerpo de casa, entramado de madera"],
  ["Building blocks/plaster_wall_alt.glb", "modulo", "la misma con otro entramado: diferencia casas sin modelar nada"],
  ["Building blocks/plaster_wall_stone_base.glb", "modulo", "casa con zocalo de piedra, para las de la calle mojada"],
  ["Building blocks/plaster_wall_stone_base_alt.glb", "modulo", "variante del zocalo"],
  ["Building blocks/plaster_wall_half.glb", "modulo", "modulo de 2 m, para casas que no son multiplo de 4"],
  ["Building blocks/stone_square.glb", "modulo", "cuerpo todo de piedra: la guarnicion y la herreria"],
  ["Building blocks/stone_archway.glb", "modulo", "el UNICO modulo con vano; portones y pasos cubiertos"],
  ["Building blocks/stone_archway_top.glb", "techo", "el remate del vano cuando lleva piso encima"],
  ["Building blocks/stone_floor_4x4.glb", "modulo", "suelo de calle y de interior de piedra"],
  ["Building blocks/wooden_floor_4x4.glb", "modulo", "suelo de madera, interiores"],
  ["Building blocks/wood_support_square.glb", "encaje", "voladizo: el piso de arriba sobresale, que es la silueta medieval"],
  ["Building blocks/wood_support_beam.glb", "encaje", "viga suelta, para romper fachadas iguales"],

  // --- tejados -------------------------------------------------------------
  ["Roofs/roof_straw.glb", "techo", "paja: las casas pobres, que en Corinth son casi todas"],
  ["Roofs/roof_straw_end.glb", "techo", "remate del faldon de paja"],
  ["Roofs/roof_straw_corner.glb", "techo", "esquina, para plantas en L"],
  ["Roofs/roof_straw_square.glb", "techo", "tejado a cuatro aguas sobre un solo modulo"],
  ["Roofs/roof_red.glb", "techo", "teja roja: las pocas casas con dinero"],
  ["Roofs/roof_red_end.glb", "techo", "remate del faldon de teja"],
  ["Roofs/roof_red_square.glb", "techo", "cuatro aguas de teja"],

  // --- lo que hace que una pared sea una casa -------------------------------
  ["Decorations/door_wood.glb", "adorno", "puerta; es una losa que se pega, NO abre vano"],
  ["Decorations/door_wood_rounded.glb", "adorno", "puerta de arco, para diferenciar"],
  ["Decorations/door_wood_metal_grate.glb", "adorno", "puerta reforzada: la de la guarnicion"],
  ["Decorations/window_square.glb", "adorno", "ventana"],
  ["Decorations/window_rounded.glb", "adorno", "ventana de arco"],
  ["Decorations/chimney.glb", "adorno", "chimenea; en la herreria es la que cuenta la historia"],
  ["Decorations/chimney_large.glb", "adorno", "chimenea gorda, para la fragua"],
  ["Decorations/stairs_wood.glb", "encaje", "escalera exterior"],

  // --- la boca de la mazmorra ----------------------------------------------
  //
  // Todo lo fabricado de la boca es piedra, y a proposito: lo construyo la
  // guarnicion con lo mismo que la muralla, asi que combina con el pueblo por
  // construccion y no por parecido. Lo raro esta debajo.
  ["Decorations/strairs_stone.glb", "encaje", "el tramo de escalera de piedra: sube 1,015 m por cada 2,183 m"],
  ["Decorations/door_stone_metal_grate.glb", "adorno", "LA reja: lo unico que hay que ver para entender que no se pasa"],
  ["Building blocks/stone_square_half_1m.glb", "encaje", "pieza de brocal de 2x1x2. Baja 19 mm bajo cero: el pack la hizo para encastrarse, no para apoyar"],
  ["Building blocks/stone_square_1m.glb", "encaje", "brocal de celda entera y parapeto del patio; baja los mismos 19 mm"],
  ["Building blocks/wood_support_beam_metal.glb", "encaje", "poste con herraje: la horca del torno"],

  // --- el mercado de saqueo ------------------------------------------------
  ["Market/barrel.glb", "adorno", "barril cerrado"],
  ["Market/crate.glb", "adorno", "cajon"],
  ["Market/haybale.glb", "adorno", "paja"],
  ["Market/jutesack_closed.glb", "adorno", "saco"],
];

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

/** Empaqueta un JSON y un binario en un .glb valido, con los rellenos que pide la spec. */
function packGlb(json, bin) {
  // El trozo JSON se rellena con ESPACIOS y el binario con CEROS. No es un
  // detalle de estilo: un lector estricto que reciba un \0 dentro del JSON
  // falla al analizarlo, y este proyecto ya tiene un lector estricto.
  let jsonBuf = Buffer.from(JSON.stringify(json), "utf8");
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  let binBuf = bin ?? Buffer.alloc(0);
  const binPad = (4 - (binBuf.length % 4)) % 4;
  if (binPad) binBuf = Buffer.concat([binBuf, Buffer.alloc(binPad, 0)]);

  const total = 12 + 8 + jsonBuf.length + (binBuf.length ? 8 + binBuf.length : 0);
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonBuf.length, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonBuf.copy(out, 20);
  if (binBuf.length) {
    const at = 20 + jsonBuf.length;
    out.writeUInt32LE(binBuf.length, at);
    out.writeUInt32LE(BIN_CHUNK, at + 4);
    binBuf.copy(out, at + 8);
  }
  return out;
}

/**
 * Saca las imagenes del binario y deja el .glb apuntando a un archivo externo.
 *
 * Lo delicado es que quitar un bufferView corre a todos los de detras. Asi que
 * no se "quita": se reconstruye el binario entero con los bufferViews que se
 * quedan, en orden, y se reescribe el byteOffset de cada uno. Cualquier indice
 * que apunte a un bufferView -accesores e imagenes- se remapea con la tabla.
 */
function detachImages(json, bin, uriFor) {
  const dropped = new Set();
  const images = (json.images ?? []).map((im) => {
    if (im.bufferView === undefined) return im;
    dropped.add(im.bufferView);
    return { name: im.name, uri: uriFor(im) };
  });

  const keep = [];
  const remap = new Map();
  const chunks = [];
  let offset = 0;
  (json.bufferViews ?? []).forEach((bv, i) => {
    if (dropped.has(i)) return;
    const data = bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
    // Los accesores exigen que el desplazamiento sea multiplo del tamano de su
    // componente; alinear a 4 cubre todos los que usa este pack (float y uint32)
    // y no estorba a los mas pequenos.
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(Buffer.alloc(pad, 0));
      offset += pad;
    }
    remap.set(i, keep.length);
    keep.push({ ...bv, byteOffset: offset });
    chunks.push(data);
    offset += bv.byteLength;
  });

  const newBin = Buffer.concat(chunks);
  const out = {
    ...json,
    images,
    bufferViews: keep,
    accessors: (json.accessors ?? []).map((a) =>
      a.bufferView === undefined ? a : { ...a, bufferView: remap.get(a.bufferView) }
    ),
    buffers: [{ byteLength: newBin.length }],
    materials: (json.materials ?? []).map((m) =>
      // BLEND en un muro ordena caras por distancia y deja ver unas a traves de
      // otras. MASK recorta por umbral y escribe profundidad, que es lo que un
      // muro con zonas caladas necesita.
      m.alphaMode === "BLEND" ? { ...m, alphaMode: "MASK", alphaCutoff: 0.5 } : m
    ),
  };
  if (!images.length) delete out.images;
  return { json: out, bin: newBin, dropped: dropped.size };
}

// --- importacion -------------------------------------------------------------

if (!DRY) {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "textures"), { recursive: true });
}

const textures = new Map(); // nombre -> {bytes, piezas}
const rows = [];
const problems = [];
let bytesBefore = 0;
let bytesAfter = 0;

for (const [rel, tipo, motivo] of AUTORIZADAS) {
  const src = join(PACK, rel);
  let original;
  try {
    original = readGlb(src);
  } catch (e) {
    problems.push(`${rel}: no se pudo leer — ${e.message}`);
    continue;
  }
  bytesBefore += original.bytes;
  const antes = measure(original.json);

  // Las imagenes, una sola vez cada una, con su nombre como archivo.
  const names = [];
  for (const im of original.json.images ?? []) {
    const name = `${im.name ?? "sin_nombre"}.png`;
    names.push(name);
    if (!textures.has(name)) {
      const bv = original.json.bufferViews[im.bufferView];
      const data = original.bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
      if (!DRY) writeFileSync(join(OUT, "textures", name), data);
      textures.set(name, { bytes: data.length, piezas: 0 });
    }
    textures.get(name).piezas++;
  }

  const { json, bin, dropped } = detachImages(original.json, original.bin, (im) =>
    `textures/${im.name ?? "sin_nombre"}.png`
  );
  const glb = packGlb(json, bin);
  const dest = join(OUT, basename(rel));
  if (!DRY) writeFileSync(dest, glb);
  bytesAfter += glb.length;

  // Releer lo escrito. Es la comprobacion que separa "el programa no dio error"
  // de "la pieza sigue siendo la pieza".
  let despues;
  if (!DRY) {
    try {
      despues = measure(readGlb(dest).json);
    } catch (e) {
      problems.push(`${basename(rel)}: se escribio pero no se vuelve a leer — ${e.message}`);
      continue;
    }
    for (let i = 0; i < 3; i++) {
      if (Math.abs(despues.size[i] - antes.size[i]) > 1e-6) {
        problems.push(
          `${basename(rel)}: la caja cambio al reescribir, eje ${"XYZ"[i]}: ` +
            `${antes.size[i].toFixed(4)} -> ${despues.size[i].toFixed(4)}`
        );
      }
    }
    if (despues.triangles !== antes.triangles) {
      problems.push(
        `${basename(rel)}: ${antes.triangles} triangulos antes, ${despues.triangles} despues`
      );
    }
  }

  // Un modulo que no mide un multiplo de la celda no es un modulo. Se comprueba
  // aqui y no al colocarlo: alli el sintoma seria una rendija de 3 cm entre dos
  // casas, que nadie relaciona con la pieza que la causa.
  if (tipo === "modulo") {
    for (const eje of [0, 2]) {
      const celdas = antes.size[eje] / 2;
      if (Math.abs(celdas - Math.round(celdas)) > 0.001) {
        problems.push(
          `${basename(rel)}: declarado modulo pero mide ${antes.size[eje].toFixed(3)} m en ` +
            `${"XYZ"[eje]}, que no es multiplo de media celda`
        );
      }
    }
    if (Math.abs(antes.min[1]) > 0.001) {
      problems.push(
        `${basename(rel)}: declarado modulo pero su suelo esta en y = ${antes.min[1].toFixed(3)}`
      );
    }
  }

  rows.push({
    archivo: basename(rel),
    origen: rel,
    tipo,
    motivo,
    size: antes.size,
    triangles: antes.triangles,
    textures: names,
    antesBytes: original.bytes,
    despuesBytes: glb.length,
    dropped,
  });
}

// --- el manifiesto -----------------------------------------------------------
//
// Es la lista de piezas con su tipo y su medida MEDIDA, no declarada. Lo leen
// tools/piece.mjs -para saber que regla exigirle a cada pieza- y, mas adelante,
// el constructor del pueblo. Que lo genere el importador y no se escriba a mano
// es lo que evita que la lista y los archivos se separen sin que nadie lo note.
const manifest = {
  generado: "tools/import_kit.mjs",
  celda: 4,
  alturaMuro: 3,
  piezas: rows.map((r) => ({
    nombre: basename(r.archivo, ".glb"),
    tipo: r.tipo,
    motivo: r.motivo,
    size: r.size.map((v) => Number(v.toFixed(4))),
    triangulos: r.triangles,
    texturas: r.textures,
  })),
};
if (!DRY) writeFileSync(join(OUT, "kit.json"), JSON.stringify(manifest, null, 2));

// --- el archivo de licencia, generado ---------------------------------------

const doc = `# Procedencia del kit de edificios

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
   \`.glb\`: medido, el atlas \`bauerhaus\` son 436 KB y ${
     rows.filter((r) => r.textures.includes("bauerhaus.png")).length
   } de las
   ${rows.length} piezas importadas lo llevaban repetido. Ahora esta una sola vez
   en \`textures/\` y cada pieza lo referencia.
2. **\`alphaMode\` de BLEND a MASK**, con umbral 0.5. El atlas tiene zonas
   caladas de verdad, asi que no vale ponerlo opaco; pero con BLEND las caras se
   ordenan por distancia y un muro deja ver el de detras.
3. Nada mas. La geometria no se toca, y se comprueba: cada pieza reescrita se
   vuelve a leer y se compara su caja y su cuenta de triangulos con el original.

## Las texturas

| Archivo | Tamano | Piezas que la usan |
| --- | --- | --- |
${[...textures]
  .sort((a, b) => b[1].piezas - a[1].piezas)
  .map(([n, t]) => `| \`${n}\` | ${(t.bytes / 1024).toFixed(0)} KB | ${t.piezas} |`)
  .join("\n")}

## Las piezas, y por que cada una

Las medidas estan en metros y salen de leer el \`.glb\`, no de la documentacion
del pack. La celda del kit es de **4 m** y el muro mide **3 m** de alto.

El **tipo** decide que se le exige a la pieza: \`modulo\` se coloca en la rejilla
y apoya en y = 0; \`techo\` vuela sobre un modulo a proposito; \`encaje\` se
encastra y baja por debajo de y = 0 para no dejar junta; \`adorno\` solo se posa.

| Pieza | Tipo | Medida (m) | Tri | Para que |
| --- | --- | --- | --- | --- |
${rows
  .map(
    (r) =>
      `| \`${r.archivo}\` | ${r.tipo} | ${r.size.map((v) => v.toFixed(3)).join(" x ")} | ${r.triangles} | ${r.motivo} |`
  )
  .join("\n")}

## Lo que el pack NO trae, y hay que resolver aparte

- **Ningun muro con vano de puerta.** \`door_wood\` y \`window_square\` son losas
  planas que se pegan encima; no abren nada. El unico modulo con hueco es
  \`stone_archway\`. Un muro con vano hay que generarlo, y se puede: los muros
  estan subdivididos en multiplos de 1 m exactos.
- **Nada de guarnicion.** Ni yunque, ni fragua, ni empalizada, ni torre, ni
  puerta de muralla.
- **Ni pozo, ni valla, ni cartel, ni carro.**
`;

if (!DRY) writeFileSync(join(OUT, "PROCEDENCIA.md"), doc);

// --- veredicto ---------------------------------------------------------------

console.log(`\n${rows.length} piezas de ${AUTORIZADAS.length} autorizadas${DRY ? " (simulacro)" : ""}\n`);
for (const r of rows) {
  console.log(
    `  ${r.archivo.padEnd(34)} ${r.size.map((v) => v.toFixed(2).padStart(6)).join(" x")}` +
      `  ${String(r.triangles).padStart(4)} tri` +
      `  ${(r.antesBytes / 1024).toFixed(0).padStart(4)} -> ${(r.despuesBytes / 1024).toFixed(1).padStart(6)} KB`
  );
}
console.log(
  `\nTexturas: ${textures.size} archivos, ${(
    [...textures.values()].reduce((s, t) => s + t.bytes, 0) / 1024
  ).toFixed(0)} KB en total`
);
console.log(
  `Peso: ${(bytesBefore / 1024 / 1024).toFixed(2)} MB en el pack -> ` +
    `${(bytesAfter / 1024).toFixed(0)} KB de geometria + ` +
    `${([...textures.values()].reduce((s, t) => s + t.bytes, 0) / 1024).toFixed(0)} KB de textura`
);

// Un importador que no importa nada tambien "termina bien". Aqui no.
if (!rows.length) problems.push("no se importo ni una pieza");
const tris = rows.reduce((s, r) => s + r.triangles, 0);
if (tris === 0) problems.push("las piezas importadas suman 0 triangulos");

console.log();
if (problems.length) {
  for (const p of problems) console.log("FALLO:", p);
  process.exit(1);
}
console.log(
  `Importadas ${rows.length} piezas, ${tris} triangulos, ${textures.size} texturas, ` +
    `con licencia generada en public/kit/PROCEDENCIA.md\n`
);
