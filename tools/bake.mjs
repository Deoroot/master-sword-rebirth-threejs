// Hornea una casa -o varias- en una pagina HTML autonoma.
//
//   node tools/bake.mjs                    todas las casas del catalogo
//   node tools/bake.mjs casa-alta          una sola
//
// Por que existe: las fichas de build/casas/ son PNG, y un PNG no deja dar la
// vuelta a la casa. Para decidir estilo hace falta girarla. Esta pagina se
// publica y se mira.
//
// La pagina no trae ni una dependencia. Nada de cargador de glTF, nada de motor:
// aqui se decodifican los accesores del .glb, se aplican las transformaciones
// del arbol de nodos Y la colocacion del plano, y todo sale como UNA lista de
// vertices por textura. Lo que la pagina recibe ya es lo que la GPU quiere, asi
// que solo necesita WebGL a pelo.
//
// Eso no es minimalismo por deporte: fusionar por textura es exactamente lo que
// el pueblo entero va a necesitar despues, y este es el sitio barato de
// escribirlo y de comprobarlo -una casa cuya malla fusionada tenga los mismos
// triangulos que su plano es una malla fusionada que funciona.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readGlb, measure, multiply, trsToMatrix, IDENTITY } from "./kit.mjs";
import { CASAS, casa } from "../src/kit/casas.js";
import { planBoca } from "../src/kit/boca.js";
import { dibujarPlano } from "./plano.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KIT = join(ROOT, "public", "kit");
const OUT = join(ROOT, "build", "horno");

const TIPOS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};
const ANCHOS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Decodifica un accesor a un array plano, respetando byteStride. */
function leerAccesor(json, bin, index) {
  const a = json.accessors[index];
  const Tipo = TIPOS[a.componentType];
  const ancho = ANCHOS[a.type];
  if (!Tipo || !ancho) throw new Error(`accesor no soportado: ${a.componentType}/${a.type}`);
  const bv = json.bufferViews[a.bufferView];
  const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const bytesPorElemento = Tipo.BYTES_PER_ELEMENT;
  // byteStride es por VERTICE, no por componente. Cuando falta, los datos van
  // apretados y el paso es el tamano de un elemento completo.
  const stride = bv.byteStride ?? bytesPorElemento * ancho;
  const out = new Float32Array(a.count * ancho);
  for (let i = 0; i < a.count; i++) {
    const o = base + i * stride;
    for (let c = 0; c < ancho; c++) {
      const at = o + c * bytesPorElemento;
      out[i * ancho + c] =
        Tipo === Float32Array ? bin.readFloatLE(at)
        : Tipo === Uint16Array ? bin.readUInt16LE(at)
        : Tipo === Uint32Array ? bin.readUInt32LE(at)
        : Tipo === Int16Array ? bin.readInt16LE(at)
        : Tipo === Int8Array ? bin.readInt8(at)
        : bin.readUInt8(at);
    }
  }
  return out;
}

/** Matriz de colocacion: giro alrededor de Y y luego traslacion. */
function colocacion(pos, giro) {
  const c = Math.cos(giro), s = Math.sin(giro);
  return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, pos[0], pos[1], pos[2], 1];
}

function aplicar(m, x, y, z, w) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  ];
}

/** Una casa entera fusionada, agrupada por textura. */
export function bakeCasa(plan) {
  const grupos = new Map(); // textura -> {pos, nor, uv, idx}
  const cacheGlb = new Map();
  let triangulos = 0;

  for (const pieza of plan.piezas) {
    if (!cacheGlb.has(pieza.pieza)) {
      cacheGlb.set(pieza.pieza, readGlb(join(KIT, `${pieza.pieza}.glb`)));
    }
    const { json, bin } = cacheGlb.get(pieza.pieza);
    const mundo = colocacion(pieza.pos, pieza.giro ?? 0);

    const walk = (index, padre) => {
      const node = json.nodes[index];
      const local = multiply(padre, trsToMatrix(node));
      if (node.mesh !== undefined) {
        for (const prim of json.meshes[node.mesh].primitives ?? []) {
          if ((prim.mode ?? 4) !== 4) continue;
          const tex =
            prim.material !== undefined
              ? json.images?.[
                  json.textures?.[
                    json.materials[prim.material].pbrMetallicRoughness?.baseColorTexture?.index ?? 0
                  ]?.source ?? 0
                ]?.name ?? "sin_textura"
              : "sin_textura";
          if (!grupos.has(tex)) grupos.set(tex, { pos: [], nor: [], uv: [], idx: [] });
          const g = grupos.get(tex);

          const pos = leerAccesor(json, bin, prim.attributes.POSITION);
          const uv = prim.attributes.TEXCOORD_0 !== undefined
            ? leerAccesor(json, bin, prim.attributes.TEXCOORD_0)
            : new Float32Array((pos.length / 3) * 2);
          const nor = prim.attributes.NORMAL !== undefined
            ? leerAccesor(json, bin, prim.attributes.NORMAL)
            : null;
          const idx = prim.indices !== undefined
            ? leerAccesor(json, bin, prim.indices)
            : Float32Array.from({ length: pos.length / 3 }, (_, i) => i);

          const M = multiply(mundo, local);
          const base = g.pos.length / 3;
          for (let i = 0; i < pos.length / 3; i++) {
            const p = aplicar(M, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], 1);
            g.pos.push(p[0], p[1], p[2]);
            g.uv.push(uv[i * 2], uv[i * 2 + 1]);
            if (nor) {
              // Para la normal se usa la parte lineal y se renormaliza. Vale
              // porque estas matrices solo llevan giro, escala uniforme y
              // traslacion; con escala no uniforme haria falta la inversa
              // traspuesta, y este kit no la tiene.
              const n = aplicar(M, nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], 0);
              const len = Math.hypot(n[0], n[1], n[2]) || 1;
              g.nor.push(n[0] / len, n[1] / len, n[2] / len);
            } else {
              g.nor.push(0, 1, 0);
            }
          }
          for (let i = 0; i < idx.length; i++) g.idx.push(base + idx[i]);
          triangulos += idx.length / 3;
        }
      }
      for (const hijo of node.children ?? []) walk(hijo, local);
    };
    for (const raiz of json.scenes[json.scene ?? 0].nodes) walk(raiz, IDENTITY);
  }

  // La roca generada entra en el mismo grupo que las piezas del kit: usa un
  // recuadro del atlas `bauerhaus`, asi que comparte material y la boca sigue
  // siendo UNA malla. Si fuera a un grupo aparte, seria una llamada de dibujo
  // mas por cada boca, y la gracia de fusionar era justo esa.
  if (plan.roca) {
    const tex = "bauerhaus";
    if (!grupos.has(tex)) grupos.set(tex, { pos: [], nor: [], uv: [], idx: [] });
    const g = grupos.get(tex);
    const base = g.pos.length / 3;
    g.pos.push(...plan.roca.pos);
    g.nor.push(...plan.roca.nor);
    g.uv.push(...plan.roca.uv);
    for (const i of plan.roca.idx) g.idx.push(base + i);
    triangulos += plan.roca.idx.length / 3;
  }

  return { grupos, triangulos };
}

// --- la pagina ----------------------------------------------------------------

const only = process.argv.slice(2).find((a) => !a.startsWith("--"));
const nombres = only ? [only] : [...Object.keys(CASAS), "boca"];

const horneadas = [];
const problems = [];

for (const nombre of nombres) {
  const plan = nombre === "boca"
    ? {
        ...planBoca(),
        titulo: "Boca de la mazmorra",
        nota: "El agujero no lo hicieron humanos. Lo de piedra sí: es el sello.",
        ancho: 3, fondo: 3, plantas: 0,
      }
    : casa(nombre);
  const { grupos, triangulos } = bakeCasa(plan);

  // La comprobacion que hace creible el horno: los triangulos de la malla
  // fusionada tienen que ser los mismos que suman las piezas del plano leidas
  // una a una. Si el horno se come una primitiva, la casa sigue saliendo en la
  // foto y le falta una pared.
  const esperados =
    plan.piezas.reduce(
      (s, p) => s + measure(readGlb(join(KIT, `${p.pieza}.glb`)).json).triangles,
      0
    ) + (plan.roca ? plan.roca.idx.length / 3 : 0);
  if (triangulos !== esperados) {
    problems.push(
      `${nombre}: el plano suma ${esperados} triangulos y la malla fusionada tiene ${triangulos}`
    );
  }

  horneadas.push({
    nombre,
    titulo: plan.titulo,
    nota: plan.nota ?? "",
    // El despiece por papel: es lo que deja ver de un vistazo si a una casa le
    // falta una ventana o le sobra un remate, que en la malla fusionada ya no
    // se puede distinguir.
    despiece: plan.piezas.map((p) => ({ pieza: p.pieza, papel: p.papel })),
    triangulos,
    piezas: plan.piezas.length,
    ancho: plan.ancho,
    fondo: plan.fondo,
    plantas: plan.plantas,
    grupos: [...grupos].map(([textura, g]) => ({
      textura,
      pos: [...g.pos].map((v) => Math.round(v * 10000) / 10000),
      nor: [...g.nor].map((v) => Math.round(v * 1000) / 1000),
      uv: [...g.uv].map((v) => Math.round(v * 10000) / 10000),
      idx: g.idx,
    })),
  });
}

// Las texturas, una vez cada una, en base64.
const usadas = new Set(horneadas.flatMap((h) => h.grupos.map((g) => g.textura)));
const texturas = {};
for (const t of usadas) {
  texturas[t] = readFileSync(join(KIT, "textures", `${t}.png`)).toString("base64");
}

mkdirSync(OUT, { recursive: true });
const datos = { casas: horneadas, texturas };
writeFileSync(join(OUT, "casas.json"), JSON.stringify(datos));

// La pagina. La plantilla se escribe a mano UNA vez y los datos se inyectan:
// asi se puede volver a hornear con otras casas sin tocar ni una linea de HTML,
// y no hay una copia de los vertices pegada dentro de un archivo que alguien
// edite luego a mano.
const plantilla = readFileSync(join(ROOT, "tools", "plantilla_corinth.html"), "utf8");
for (const hueco of ["/*DATOS*/", "/*PLANO*/"]) {
  if (!plantilla.includes(hueco)) problems.push(`la plantilla no tiene el hueco ${hueco}`);
}
if (!problems.length) {
  // El plano que se publica es el que devuelve el mismo generador que juzga el
  // paso a la mazmorra. No una copia, ni una captura: si se mueve una parcela,
  // se mueve en los dos sitios a la vez o en ninguno.
  const { svg, aisladas } = dibujarPlano();
  if (aisladas.length) {
    problems.push(`${aisladas.length} celdas del plano no se alcanzan desde el porton`);
  }
  writeFileSync(
    join(OUT, "corinth.html"),
    plantilla.replace("/*DATOS*/", JSON.stringify(datos)).replace("/*PLANO*/", svg)
  );
}

console.log(`\n${horneadas.length} casas horneadas`);
for (const h of horneadas) {
  console.log(
    `  ${h.nombre.padEnd(16)} ${String(h.piezas).padStart(3)} piezas -> ` +
      `${h.grupos.length} malla(s), ${String(h.triangulos).padStart(5)} triangulos`
  );
}
const kb = Buffer.byteLength(JSON.stringify(datos)) / 1024;
console.log(`\nDatos: ${kb.toFixed(0)} KB (${Object.keys(texturas).length} texturas incluidas)`);

console.log();
if (problems.length) {
  for (const p of problems) console.log("FALLO:", p);
  process.exit(1);
}
console.log(`La malla fusionada tiene los mismos triangulos que el plano, casa por casa.\n`);
