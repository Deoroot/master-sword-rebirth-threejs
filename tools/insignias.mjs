// LAS BARRAS DE PROGRESO DEL README, calculadas y no escritas.
//
//   npm run insignias            # reescribe el bloque del README
//   npm run insignias -- --ver   # sólo enseña lo que pondría
//
// La regla de la casa es que las cuentas se calculan (CLAUDE.md §5): un
// «100 %» escrito a mano en un README es el apartado 4 con chapa de colores —un
// valor de reposo que nadie vuelve a mirar y que envejece solo—. Así que cada
// barra sale de algo que se puede volver a medir, y `test/insignias.test.mjs`
// se pone roja si el README dice otra cosa que lo que se mide hoy.
//
// ── Las seis barras, y qué mide cada una ───────────────────────────────────
//
//   script commands   de los comandos que el MOD registra, cuántos porta el
//                     intérprete. El universo es la UNIÓN de sus tres tablas
//                     —`m_GlobalCmdHash` (scriptcmds.cpp), los de NPC
//                     (npcscript.cpp) y los de objeto (genericitem.cpp)—, sin
//                     contar los que están comentados.
//   Edana scripts     de los guiones de NPC de Edana, cuántos corren ENTEROS
//   Gate City scripts con lo portado: sin un solo comando ni getter que falte.
//   NPC menus         de los NPC de los 2 884 guiones que tienen menú, cuántos
//                     lo construyen entero.
//   options           de las filas de Options, cuántas hacen algo (`cuenta()`).
//   create server     lo mismo en Create Server.
//
// ── Lo que se entendió mal al escribir esto (el 87) ─────────────────────────
//
// `tools/guiones.mjs` decía «78 comandos portados de los 223 de
// `m_GlobalCmdHash`», o sea un 35 %. Las dos cifras estaban mal, y en el mismo
// sentido:
//
//   - **223 cuenta dos que están comentados** —`else` y `moditem`—. Vivos son
//     221. Es la tercera vez el mismo día que algo comentado se cuenta como vivo
//     (ver doc/EVENTOS_86.md §2).
//   - **Y 23 de los 78 no son de esa tabla**: `say`, `playanim`, `setmovedest`,
//     las tiendas, los menús… son comandos de NPC y viven en `npcscript.cpp`.
//     Se comparaban peras con manzanas.
//
// Con el universo entero son **73 de 325, un 22 %**. Más bajo, y verdad.
//
// La regla 2 de la procedencia manda aquí también: lo que se lee de `../MSC/` se
// queda allí, y lo que se lee de `build/` no se mueve. Esto sólo escribe el
// README, y sólo números.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const FUENTE_DEL_MOD = join(RAIZ, "..", "MSC", "MasterSwordRebirth-Xash3D", "src", "game");
const README = join(RAIZ, "README.md");

export const INICIO = "<!-- insignias:inicio -->";
export const FIN = "<!-- insignias:fin -->";

// ── el cálculo ──────────────────────────────────────────────────────────────

/**
 * Quita los comentarios de C++ antes de buscar nada.
 *
 * Sin esto se cuentan `//m_GlobalCmdHash["else"]` y el `moditem` de dentro de un
 * `/* … *\/`, que es justo como salió el 223. Basta, no un analizador: no
 * distingue un `//` dentro de una cadena, y en estas tres tablas no hay ninguno.
 */
export function sinComentarios(cpp) {
  return cpp.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.split("//")[0]).join("\n");
}

/** Los nombres de comando que registra un archivo de C++ del mod. */
export function comandosRegistrados(cpp) {
  const s = sinComentarios(cpp);
  return [
    ...[...s.matchAll(/m_GlobalCmdHash\["([^"]+)"\]\s*=/g)].map((m) => m[1]),
    ...[...s.matchAll(/scriptcmdname_t\(\s*"([^"]+)"/g)].map((m) => m[1]),
  ];
}

/** El universo: la unión de todas las tablas del mod. `null` si no está `../MSC/`. */
export function comandosDelMod(raiz = FUENTE_DEL_MOD) {
  if (!existsSync(raiz)) return null;
  const todos = new Set();
  (function andar(d) {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) andar(p);
      else if (n.endsWith(".cpp")) for (const c of comandosRegistrados(readFileSync(p, "latin1"))) todos.add(c);
    }
  })(raiz);
  return todos;
}

/**
 * Lo que dice un horneado de guiones, o `null` si no está o si está VIEJO.
 *
 * Viejo quiere decir hecho con otra lista de comandos que la de hoy: el
 * horneado guarda la suya en `subconjunto.comandos`, así que se sabe EXACTO y no
 * hace falta mirar fechas. Con un horneado viejo, «le faltan» es lo que le
 * faltaba entonces — el horneado parcial del 81, *una medida vieja con cara de
 * nueva* — y se prefiere no poner la barra a ponerla mal.
 */
export function leerHorneado(mapa, comandosDeHoy) {
  const ruta = join(RAIZ, "build", mapa, "guiones.json");
  if (!existsSync(ruta)) return { falta: `no hay build/${mapa}/guiones.json` };
  const g = JSON.parse(readFileSync(ruta, "utf8"));
  const conLos = new Set(g.subconjunto?.comandos ?? []);
  const iguales = conLos.size === comandosDeHoy.size && [...comandosDeHoy].every((c) => conLos.has(c));
  if (!iguales) return { falta: `build/${mapa}/guiones.json es de otra lista de comandos: vuelve a hornearlo` };
  const guiones = Object.values(g.guiones ?? {});
  return {
    guiones: guiones.length,
    enteros: guiones.filter((x) => (x.faltan ?? []).length === 0).length,
    censo: g.censo ?? null,
  };
}

/** Todo lo que va en las barras. Lo que no se pueda medir hoy sale con `falta`. */
export async function medir() {
  const { COMANDOS } = await import("../src/play/guion.js");
  const ajustes = (await import("../src/play/ajustes.js")).cuenta();
  const servidor = (await import("../src/play/crearpartida.js")).cuenta();

  const universo = comandosDelMod();
  const edana = leerHorneado("edana", COMANDOS);
  const gate = leerHorneado("gatecity", COMANDOS);
  const censo = edana.censo ?? gate.censo;

  const barra = (etiqueta, hechos, total, falta = null) => ({ etiqueta, hechos, total, falta });
  return [
    universo
      ? barra("script commands", [...COMANDOS].filter((c) => universo.has(c)).length, universo.size)
      : barra("script commands", 0, 0, "falta ../MSC/MasterSwordRebirth-Xash3D"),
    edana.falta ? barra("Edana scripts", 0, 0, edana.falta) : barra("Edana scripts", edana.enteros, edana.guiones),
    gate.falta ? barra("Gate City scripts", 0, 0, gate.falta) : barra("Gate City scripts", gate.enteros, gate.guiones),
    censo ? barra("NPC menus", censo.menuCabe, censo.conMenu) : barra("NPC menus", 0, 0, "falta un horneado de guiones"),
    barra("options", ajustes.vivos, ajustes.total),
    barra("create server", servidor.vivos, servidor.total),
  ];
}

// ── el dibujo ───────────────────────────────────────────────────────────────

/**
 * El tanto por ciento, REDONDEADO HACIA ABAJO.
 *
 * A propósito: una barra de progreso que redondea hacia arriba enseña un 67 %
 * donde hay un 66,7, y la diferencia siempre cae del lado que favorece al que la
 * escribe. Hacia abajo nunca promete lo que no hay.
 */
export function porcentaje(hechos, total) {
  return total > 0 ? Math.floor((hechos / total) * 100) : 0;
}

/** El color, por tramos. Verde fuerte sólo de 95 para arriba. */
export function color(pct) {
  if (pct >= 95) return "brightgreen";
  if (pct >= 85) return "green";
  if (pct >= 70) return "yellowgreen";
  if (pct >= 50) return "yellow";
  if (pct >= 25) return "orange";
  return "red";
}

/**
 * Un texto escapado para una insignia estática de shields.io.
 *
 * En esa URL el guion separa campos, así que un guion de verdad va doble, y lo
 * mismo el guion bajo; lo demás, `encodeURIComponent`. El orden importa: si se
 * codifica primero, `%2D` ya no es un guion que doblar.
 */
export function escapar(texto) {
  return encodeURIComponent(String(texto).replace(/-/g, "--").replace(/_/g, "__"));
}

/** Una insignia en Markdown. */
export function insignia({ etiqueta, hechos, total }) {
  const pct = porcentaje(hechos, total);
  const mensaje = `${hechos}/${total} · ${pct}%`;
  const url = `https://img.shields.io/badge/${escapar(etiqueta)}-${escapar(mensaje)}-${color(pct)}`;
  return `![${etiqueta}: ${mensaje}](${url})`;
}

/** El bloque entero, con sus marcas, tal cual va en el README. */
export function bloque(barras) {
  return [
    INICIO,
    barras.map(insignia).join("\n"),
    FIN,
  ].join("\n");
}

/** Cambia el bloque del README por otro. Falla fuerte si las marcas no están. */
export function ponerBloque(readme, nuevo) {
  const a = readme.indexOf(INICIO);
  const b = readme.indexOf(FIN);
  if (a < 0 || b < a) throw new Error(`el README no tiene las marcas ${INICIO} … ${FIN}`);
  return readme.slice(0, a) + nuevo + readme.slice(b + FIN.length);
}

// ── la herramienta ──────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const barras = await medir();
  for (const b of barras) {
    const linea = b.falta ? `NO SE PUEDE MEDIR: ${b.falta}` : `${b.hechos}/${b.total} · ${porcentaje(b.hechos, b.total)}%`;
    console.log(`  ${b.etiqueta.padEnd(18)} ${linea}`);
  }
  const faltan = barras.filter((b) => b.falta);
  if (faltan.length) {
    // No se escribe un README a medias: una barra que no se ha podido medir
    // saldría con el número de la vez anterior, que es exactamente el valor de
    // reposo que esto viene a evitar.
    console.error(`\n  No toco el README: ${faltan.length} barra(s) sin medir.`);
    process.exit(1);
  }
  if (process.argv.includes("--ver")) {
    console.log(`\n${bloque(barras)}`);
  } else {
    const viejo = readFileSync(README, "utf8");
    const nuevo = ponerBloque(viejo, bloque(barras));
    if (nuevo === viejo) console.log("\n  README ya estaba al día.");
    else { writeFileSync(README, nuevo); console.log("\n  README actualizado."); }
  }
}
