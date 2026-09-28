// El CATÁLOGO DE OBJETOS de Master Sword, leído de sus `.script`.
//
// ── Qué es esto y qué NO es ────────────────────────────────────────────────
//
// No es un intérprete y no lo va a ser. Es un LECTOR de fichas, como
// `leerFichaNpc`: saca de cada objeto su nombre, su peso, su valor, qué es y
// —si es un arma— sus números. El comportamiento no se porta; los datos sí se
// leen, porque están escritos.
//
// La regla del 02 vale igual que con el `.bsp`: **el lector es nuestro, el
// contenido no se copia.** Los `.script` se quedan en `../MSC/`, lo extraído
// vive en `build/msr/` —que está en `.gitignore`— y no se mueve un byte a
// `public/`.
//
// ── Las dos reglas de precedencia, que son opuestas ────────────────────────
//
// Un objeto se escribe así:
//
//     { const MELEE_DMG 90  const MELEE_STAT swordsmanship }   sus números
//     #include items/swords_base_onehanded                      qué ES
//     { eventname weapon_spawn   name Rusty Short Sword }       su ficha
//
//   `const`   gana el PRIMERO (`script.cpp`: si el nombre ya está, no lo
//             añade). Por eso el objeto declara ANTES del `#include`.
//   la ficha  gana el ÚLTIMO, porque son órdenes en orden de ejecución, y el
//             bloque del objeto va DESPUÉS del `#include`.
//
// Leerlas al revés no da error: da 191 armas con el daño de su plantilla.
//
//     npm run objetos

import { writeFileSync, mkdirSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

import { leerFichaObjeto, partirScript } from "../src/bsp/script.js";

const RAIZ = process.argv[2] ?? "../MSC/MSCScripts/scripts";
const SALIDA = resolve("build/msr");

if (!existsSync(`${RAIZ}/items`)) {
  console.error(`No encuentro ${RAIZ}/items. Pásame la carpeta scripts/ de MSR como argumento.`);
  process.exit(1);
}

/** Todos los `.script` de una carpeta, recursivo, como rutas sin extensión. */
function todos(dir, prefijo) {
  const out = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    if (e.isDirectory()) out.push(...todos(`${dir}/${e.name}`, `${prefijo}/${e.name}`));
    else if (e.name.endsWith(".script")) out.push(`${prefijo}/${e.name.replace(/\.script$/i, "")}`);
  }
  return out;
}

const rutas = todos("items", "items").sort();
console.log(`\nel catálogo de objetos de Master Sword — ${rutas.length} ficheros en items/\n`);

const fichas = [];
const plantillas = [];
const rotos = [];
for (const r of rutas) {
  const f = leerFichaObjeto(RAIZ, r);
  if (!f) { rotos.push(r); continue; }
  // Sin nombre no es un objeto: es una PLANTILLA de la que heredan otros, o una
  // mitad de cliente (`*_cl`). Se cuentan y se dejan fuera, en vez de meterlas
  // en el catálogo con el nombre en blanco.
  if (!f.nombre) { plantillas.push(f); continue; }
  fichas.push(f);
}

const cuenta = (lista, clave) => {
  const m = new Map();
  for (const f of lista) { const k = clave(f); m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
};

console.log(`  objetos         ${fichas.length} con nombre`);
console.log(`  plantillas      ${plantillas.length} sin nombre (bases y mitades de cliente), fuera del catálogo`);
if (rotos.length) console.log(`  NO SE PUDIERON LEER  ${rotos.length}: ${rotos.slice(0, 5).join(", ")}`);
console.log(`\n  por tipo        ${cuenta(fichas, (f) => f.tipo).map(([k, n]) => `${n} ${k}`).join(", ")}`);

const armas = fichas.filter((f) => f.arma);
console.log(`\n  armas           ${armas.length}, por habilidad:`);
for (const [h, n] of cuenta(armas, (f) => f.arma.habilidad ?? "(sin habilidad)"))
  console.log(`      ${String(n).padStart(4)}  ${h}`);
console.log(`\n  tipos de daño   ${cuenta(armas, (f) => f.arma.tipoDano ?? "(ninguno)").map(([k, n]) => `${n} ${k}`).join(", ")}`);

// Los CONTROLES de lectura. Cada uno responde a una forma concreta de leer mal.
{
  const conDano = armas.filter((f) => f.arma.dano !== null);
  const danos = conDano.map((f) => f.arma.dano).sort((a, b) => a - b);
  const mediana = danos[Math.floor(danos.length / 2)];
  const distintos = new Set(danos).size;
  console.log(`\n  control 1       ${conDano.length} de ${armas.length} armas traen daño; ` +
    `mediana ${mediana}, ${distintos} valores distintos, de ${danos[0]} a ${danos[danos.length - 1]}`);
  // Si se leyeran las constantes al revés —gana la última— todas las armas de
  // una misma base saldrían con el MISMO daño. Un puñado de valores distintos
  // sobre 191 armas es lo que dice que cada una trae el suyo.
  if (distintos < 20) {
    console.error(`    FALLO: sólo ${distintos} daños distintos en ${conDano.length} armas. ` +
      `Eso es lo que pasa si gana la constante de la base en vez de la del objeto.`);
    process.exit(1);
  }
  const conNombre = fichas.filter((f) => f.nombre && f.nombre.length > 1).length;
  const conValor = fichas.filter((f) => f.valor !== null).length;
  const conModelo = fichas.filter((f) => f.modelo && !/^[A-Z][A-Z0-9_]*$/.test(f.modelo)).length;
  console.log(`  control 2       nombre ${conNombre}/${fichas.length}, valor ${conValor}, ` +
    `modelo resuelto ${conModelo} (una constante sin resolver se ve como MAYÚSCULAS)`);
  const sinResolver = fichas.filter((f) => f.modelo && /^[A-Z][A-Z0-9_]*$/.test(f.modelo));
  if (sinResolver.length > fichas.length * 0.1) {
    console.error(`    FALLO: ${sinResolver.length} modelos se han quedado en el nombre de su constante.`);
    process.exit(1);
  }
  if (sinResolver.length) console.log(`                  ${sinResolver.length} sin resolver: ${sinResolver.slice(0, 4).map((f) => `${f.id}→${f.modelo}`).join(", ")}`);
}

// --- la configuración de personaje nuevo, que también es un dato -----------
//
// `global.script` la declara en cuatro líneas, así que cambiar el oro de
// partida o la lista de armas no es tocar código. Se lee en vez de copiarse.
const nuevo = { armas: [], gratis: [], oro: null, maxObjetos: null };
{
  const ruta = `${RAIZ}/global.script`;
  if (existsSync(ruta)) {
    const { bloques } = partirScript(readFileSync(ruta, "latin1"));
    for (const b of bloques) {
      for (const l of b) {
        const m = l.match(/^(?:local|setvarg)\s+(\S+)\s+(.*)$/i);
        if (!m) continue;
        const [, k, v] = m;
        if (/^reg\.newchar\.weaponlist$/i.test(k)) nuevo.armas = v.trim().split(";").filter(Boolean);
        if (/^reg\.newchar\.freeitems$/i.test(k)) nuevo.gratis = v.trim().split(";").filter(Boolean);
        if (/^reg\.newchar\.gold$/i.test(k)) nuevo.oro = Number(v.trim());
        if (/^G_MAX_ITEMS$/i.test(k)) nuevo.maxObjetos = Number(v.trim());
      }
    }
  }
}
console.log(`\n  personaje nuevo ${nuevo.oro} de oro, ${nuevo.gratis.length} objetos gratis, ` +
  `${nuevo.armas.length} armas a elegir, hasta ${nuevo.maxObjetos} objetos encima`);
for (const a of nuevo.armas) {
  const f = fichas.find((x) => x.id === a);
  console.log(`      ${a.padEnd(28)} ${f ? `${f.nombre} — ${f.arma?.habilidad ?? f.tipo}` : "NO ESTÁ EN EL CATÁLOGO"}`);
}
if (nuevo.armas.some((a) => !fichas.find((x) => x.id === a))) {
  console.error(`    FALLO: alguna de las armas de partida no está en el catálogo.`);
  process.exit(1);
}

mkdirSync(SALIDA, { recursive: true });
writeFileSync(`${SALIDA}/objetos.json`, JSON.stringify({
  procedencia: "derivado local de los .script de Master Sword Rebirth, leídos no copiados. No redistribuible.",
  raiz: RAIZ,
  objetos: fichas,
  plantillas: plantillas.map((f) => f.ruta),
  nuevoPersonaje: nuevo,
}, null, 1));
console.log(`\n  escrito en      build/msr/objetos.json (${fichas.length} objetos)\n`);
