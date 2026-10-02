// Cuenta REFERENCIAS a identificadores, no apariciones del texto.
// El contador anterior (grep) contaba la palabra «partida» dentro de los
// comentarios en español y `red.partida`, y dio 19 usos donde hay 3.
import { parseAst } from "rollup/parseAst";
import { readFileSync } from "node:fs";

const src = readFileSync("src/main.js", "utf8").replace(/\r\n/g, "\n");
const lineas = src.split("\n");
const inicioDeLinea = [0];
for (let i = 0; i < src.length; i++) if (src[i] === "\n") inicioDeLinea.push(i + 1);
const lineaDe = (pos) => {
  let lo = 0, hi = inicioDeLinea.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (inicioDeLinea[m] <= pos) lo = m; else hi = m - 1; }
  return lo + 1;
};

const ast = parseAst(src);

/** Las referencias: cada identificador que NO es una clave ni un `.prop`. */
const refs = new Map();       // nombre -> [linea]
const escrituras = new Map(); // nombre -> [linea]
const apunta = (m, n, l) => { if (!m.has(n)) m.set(n, []); m.get(n).push(l); };

function anda(nodo, padre, clave) {
  if (!nodo || typeof nodo !== "object") return;
  if (Array.isArray(nodo)) { for (const h of nodo) anda(h, padre, clave); return; }
  if (typeof nodo.type !== "string") return;

  if (nodo.type === "Identifier") {
    const esProp = padre?.type === "MemberExpression" && clave === "property" && !padre.computed;
    const esClave = (padre?.type === "Property" || padre?.type === "PropertyDefinition" || padre?.type === "MethodDefinition")
      && clave === "key" && !padre.computed && !(padre.type === "Property" && padre.shorthand);
    if (!esProp && !esClave) apunta(refs, nodo.name, lineaDe(nodo.start));
    return;
  }
  if (nodo.type === "AssignmentExpression" && nodo.left?.type === "Identifier") {
    apunta(escrituras, nodo.left.name, lineaDe(nodo.left.start));
  }
  for (const k of Object.keys(nodo)) {
    if (k === "start" || k === "end" || k === "type" || k === "loc") continue;
    anda(nodo[k], nodo, k);
  }
}
anda(ast, null, null);

// ── el bloque bajo examen ────────────────────────────────────────────────
const linea = (re) => lineas.findIndex((l) => re.test(l)) + 1;
const A = linea(/^  \/\/ ── EL GOLPE DEL JUGADOR/);
const B = linea(/^  \/\/ ── EL TIRO CON ARCO/) - 1;
const P = linea(/^  window\.probe = montarSonda\(/);
console.log(`el golpe: ${A}..${B}   la sonda empieza en ${P}\n`);

// declaraciones de primer nivel de la funcion, dentro del bloque
const decl = [];
for (let i = A; i <= B; i++) {
  const m = /^  (?:let|const|var|function|async function) ([A-Za-z_$][\w$]*)/.exec(lineas[i - 1]);
  if (m) decl.push([m[1], i]);
}

const filas = [];
for (const [n, ln] of decl) {
  const u = refs.get(n) ?? [];
  const antes = u.filter((l) => l < A).length;
  const juego = u.filter((l) => l > B && l < P).length;
  const sonda = u.filter((l) => l >= P).length;
  const w = (escrituras.get(n) ?? []).length;
  filas.push({ n, ln, antes, juego, sonda, w, primeros: u.filter((l) => l < A).slice(0, 4) });
}
const salen = filas.filter((f) => f.antes || f.juego);
console.log(`declarados dentro del golpe: ${decl.length}`);
console.log(`salen al codigo de verdad:   ${salen.length}`);
console.log(`salen solo a la sonda:       ${filas.filter((f) => !f.antes && !f.juego && f.sonda).length}\n`);
console.log("nombre                  decl  antes  juego  sonda  escrituras");
for (const f of salen.sort((a, b) => (b.antes + b.juego) - (a.antes + a.juego))) {
  console.log(
    `${f.n.padEnd(22)} ${String(f.ln).padStart(5)} ${String(f.antes).padStart(6)} ` +
    `${String(f.juego).padStart(6)} ${String(f.sonda).padStart(6)} ${String(f.w).padStart(11)}` +
    (f.primeros.length ? `   <- ${f.primeros.join(",")}` : ""),
  );
}
