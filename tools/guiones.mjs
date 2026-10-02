// LOS GUIONES DE LOS NPC, analizados, Y EL CENSO QUE MIDE EL EXPERIMENTO 33.
//
//   npm run guiones
//
// Hace dos cosas, y la segunda es el resultado del experimento:
//
//   1. Deja en `build/gatecity/guiones.json` el ÁRBOL DE COMANDOS de los
//      scripts de los NPC que hay en el mapa, con sus `#include` resueltos y
//      puestos delante. El navegador no puede leer `../MSC/`, así que esto es
//      lo que le llega a `src/play/guion.js` en tiempo de juego.
//
//   2. **CUENTA CUÁNTOS DE LOS NPCs CON MENÚ CABEN EN EL SUBCONJUNTO PORTADO.**
//      Esa cuenta dice si lo que se abrió con el 33 es una misión o son ciento
//      cuarenta, y por eso se imprime aunque nadie la mire.
//
// ── Cómo se cuenta, para que la cifra signifique algo ─────────────────────
//
// Un NPC «cabe» si, partiendo de su `game_menu_getoptions`, **todos** los
// comandos y `$getters` que se alcanzan —el evento y, en cadena, cada
// `callevent`/retrollamada que registre— están en `COMANDOS` y `GETTERS` de
// `src/play/guion.js`. No vale con que el menú se dibuje: si al elegir una
// opción hace falta un comando que no está, el NPC no cabe, porque elegir es
// justo lo que el 33 vino a arreglar.
//
// Lo que NO se sigue son los eventos que el motor lanza por su cuenta
// (`game_spawn`, `game_idle`, los `catchspeech`): ésos son la IA del NPC y no
// el menú. Se dice aquí para que la cifra no parezca mayor de lo que mide.
//
// ── La regla del 02, que aquí manda igual ─────────────────────────────────
//
// El lector es nuestro, el contenido no se copia. Los `.script` se quedan en
// `../MSC/`, lo extraído vive en `build/`, que está en `.gitignore`, y no se
// mueve un byte a `public/`. Lo defiende `test/procedencia.test.mjs`.

import { writeFileSync, mkdirSync, existsSync, readFileSync, readdirSync, appendFileSync } from "node:fs";
import { join } from "node:path";

import { partirGuion, COMANDOS, GETTERS, PROPIEDADES, PROPIEDADES_VACIAS } from "../src/play/guion.js";
// El 64: cargar un script con sus `#include` es de `tools/scriptsmsr.mjs`,
// para que un segundo extractor pueda usarlo sin ejecutar este censo entero.
import { leerScript, cargarGuion } from "./scriptsmsr.mjs";

import { mapaDeArgv, posicionalesDe, salidaDe, enSalida } from "./mapa.mjs";
const MAPA = mapaDeArgv();
const RAIZ = posicionalesDe()[0] ?? "../MSC/MSCScripts/scripts";
const SALIDA = enSalida(MAPA, "guiones.json");

if (!existsSync(join(RAIZ, "monsters"))) {
  console.error(`No encuentro ${RAIZ}/monsters. Pásame la carpeta scripts/ de MSR como argumento.`);
  process.exit(1);
}

const leer = (ruta) => leerScript(ruta, RAIZ);

/**
 * Carga un script con sus `#include` **delante**, que es el orden del motor:
 * `#include` llama a `Spawn()` en el sitio en que aparece (script.cpp:5255), y
 * los eventos se van añadiendo a `m.Events` según se leen. Como el `#include`
 * de un NPC va en la línea 2, los eventos de la plantilla quedan primero — y
 * `RunScriptEventByName` los ejecuta **todos**, así que el «Hail / Ask about
 * Jobs / Ask about Rumors» de `base_chat` sale ANTES de lo del propio NPC.
 */
export { cargarGuion };

/**
 * ¿Este script tiene `game_menu_getoptions`, suyo o heredado?
 *
 * Se pregunta sobre los eventos YA cargados y no sobre el texto, que es la
 * diferencia entera: `cargarGuion` mete delante los de cada `#include`, en el
 * orden del motor, y el menú de casi todos los NPC viene de ahí.
 *
 * El `ambito` no se mira: un `[override] game_menu_getoptions` sigue siendo un
 * `game_menu_getoptions` —de hecho es la forma de un NPC que cambia el menú de
 * su plantilla— y el motor los ejecuta los dos (`RunScriptEventByName`).
 */
export function tieneMenu(ruta) {
  return cargarGuion(ruta).eventos.some((e) => e?.nombre === "game_menu_getoptions");
}

// ── EL CENSO ────────────────────────────────────────────────────────────────

/** Los `$getter(...)` que aparecen en un texto, con el nombre a secas. */
function gettersDe(texto) {
  return [...String(texto ?? "").matchAll(/\$[A-Za-z_][\w.]*(?=\()/g)].map((m) => m[0]);
}

/** Las propiedades pedidas a `$get(ent,prop)`, para saber si sabemos contestarlas. */
function propiedadesDe(texto) {
  return [...String(texto ?? "").matchAll(/\$g?get\(\s*[^,()]*,\s*([A-Za-z_][\w.]*)\s*\)/g)].map((m) => m[1]);
}

/**
 * Recorre un evento y todo lo que llama, y devuelve qué hace falta.
 *
 * `seguirRetrollamadas` a `false` mira SÓLO el evento y sus `callevent`, sin
 * entrar en las opciones que registra: eso contesta «¿se dibuja bien el menú?»,
 * que es una pregunta distinta de «¿funciona el NPC entero?».
 *
 * `vistos` corta los ciclos: `remove_spawns_loop` del alcalde se llama a sí
 * mismo con retardo y sin esto no acabaría nunca.
 */
function necesidades(eventos, nombre, { seguirRetrollamadas = true, vistos = new Set(), fuera = null } = {}) {
  const r = fuera ?? { comandos: new Set(), getters: new Set(), props: new Set(), eventosQueFaltan: new Set(), retrollamadas: new Set() };
  if (vistos.has(nombre)) return r;
  vistos.add(nombre);
  const losDeEsteNombre = eventos.filter((e) => e.nombre === nombre);
  if (!losDeEsteNombre.length) { r.eventosQueFaltan.add(nombre); return r; }

  const andar = (lista) => {
    for (const c of lista) {
      r.comandos.add(c.nombre);
      for (const p of c.params) {
        for (const g of gettersDe(p)) r.getters.add(g);
        for (const pr of propiedadesDe(p)) r.props.add(pr);
      }
      // Las llamadas encadenadas. El nombre del evento puede ser el primero o
      // el segundo segun haya retardo, y con `callexternal` va detras del
      // destino. Se miran los candidatos que parezcan nombres de evento.
      if (c.nombre === "callevent" || c.nombre === "calleventtimed" || c.nombre === "callexternal") {
        for (const p of c.params) {
          if (/^[\d.]+$/.test(p) || p.startsWith("$")) continue;
          if (eventos.some((e) => e.nombre === p)) necesidades(eventos, p, { seguirRetrollamadas, vistos, fuera: r });
        }
      }
      // Y las retrollamadas que el menu registra: `local reg.mitem.callback X`.
      if ((c.nombre === "local" || c.nombre === "setvar" || c.nombre === "setvard")
        && /^reg\.mitem\.(callback|cb_failed)$/i.test(c.params[0] ?? "")) {
        const destino = c.params[1];
        if (destino && eventos.some((e) => e.nombre === destino)) {
          r.retrollamadas.add(destino);
          if (seguirRetrollamadas) necesidades(eventos, destino, { seguirRetrollamadas, vistos, fuera: r });
        }
      }
      andar(c.hijos);
      for (const rama of c.sino) andar(rama);
    }
  };
  for (const e of losDeEsteNombre) andar(e.cmds);
  return r;
}

/** Lo que de `n` se sale del subconjunto portado. */
function fuera(n) {
  return {
    faltaCmd: [...n.comandos].filter((c) => !COMANDOS.has(c)),
    faltaGet: [...n.getters].filter((c) => !GETTERS.has(c)),
    // `PROPIEDADES_VACIAS` NO cuenta como hueco: son las que el motor mismo
    // contesta con «0», así que contestarlo es portarlas. Ver la cabecera de
    // `src/play/guion.js` — sin esta resta, el censo llama hueco a algo que
    // está bien y el vendedor de Gate City nunca cerraría.
    faltaProp: [...n.props].filter((p) => !PROPIEDADES.has(p) && !PROPIEDADES_VACIAS.has(p)),
  };
}
const entero = (f) => !f.faltaCmd.length && !f.faltaGet.length && !f.faltaProp.length;

/** Todo lo que hay bajo `scripts/`, en rutas sin extensión. */
function todos(dir = ".") {
  const out = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const sub = dir === "." ? e.name : `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...todos(sub));
    else if (e.name.endsWith(".script")) out.push(sub.replace(/\.script$/i, ""));
  }
  return out;
}

console.log(`\nlos guiones de los NPC — subconjunto del intérprete de Master Sword\n`);
console.log(`  ${COMANDOS.size} comandos portados de los 223 de \`m_GlobalCmdHash\` (scriptcmds.cpp:41)`);
console.log(`  ${GETTERS.size} getters y ${PROPIEDADES.size} propiedades de \`$get\`\n`);

// ── 1. el censo sobre TODOS los scripts con menú ────────────────────────────

// EL MENÚ SE BUSCA DESPUÉS DE LOS `#include`, y hasta el 60 no (60).
//
// Esto leía el texto CRUDO del script y buscaba en él el bloque
// `{ game_menu_getoptions`. Y el menú de un NPC casi nunca está ahí: está en
// la plantilla que incluye. El sanador de Edana es doce líneas de `setvar` y
// cuatro `#include`; su «Buy / Sell» sale entero de `monsters/base_npc_vendor`.
//
// Así que el censo se hacía sobre una cosa y la carga sobre otra —`cargarGuion`
// **sí** resuelve los `#include` y lleva haciéndolo desde el 33—, y los NPC que
// heredan su menú no existían: ni en el censo ni en el `guiones.json`.
//
//     139 scripts con `game_menu_getoptions` en su propio texto
//     262 con él una vez resueltos los `#include`
//
// POR QUÉ NO SE VIO EN VEINTISIETE EXPERIMENTOS: porque Gate City no pierde
// ninguno. Sus 25 scripts colocados declaran el menú en su propio archivo, los
// 25. Edana pierde 7 de 13 —el sanador, el herrero, el alcalde, el sacerdote,
// la tabernera, el arquero y el mercader—, o sea casi todas sus tiendas.
//
// Es el apartado 4 de CLAUDE.md en la forma que enseñó el 50: con un solo caso
// el valor correcto y el valor de reposo son el mismo, y el control no puede
// fallar por construcción. La defensa es **un segundo mapa**, no mirar mejor.
const rutas = todos();
const conMenu = [];
for (const r of rutas) {
  if (tieneMenu(r)) conMenu.push(r);
}

const censo = [];
for (const r of conMenu) {
  const g = cargarGuion(r);
  // A. sólo el menú: ¿se dibuja bien la lista de opciones?
  const soloMenu = fuera(necesidades(g.eventos, "game_menu_getoptions", { seguirRetrollamadas: false }));
  // B. el NPC entero: el menú y TODAS sus retrollamadas.
  const n = necesidades(g.eventos, "game_menu_getoptions");
  const todo = fuera(n);
  // C. al menos una opción que se pueda elegir de principio a fin.
  const cuales = [...n.retrollamadas].filter((cb) => entero(fuera(necesidades(g.eventos, cb))));
  censo.push({
    script: r,
    menuCabe: entero(soloMenu),
    cabe: entero(todo),
    algunaOpcion: cuales.length > 0,
    opcionesQueCaben: cuales,
    ...todo,
    eventosQueFaltan: [...n.eventosQueFaltan],
  });
}

const menuOk = censo.filter((c) => c.menuCabe);
const caben = censo.filter((c) => c.cabe);
const alguna = censo.filter((c) => c.algunaOpcion);
const pct = (x) => `${(x / conMenu.length * 100).toFixed(1)} %`;
console.log(`  SCRIPTS CON \`game_menu_getoptions\`: ${conMenu.length}
`);
console.log(`  A. el MENÚ se construye entero con el subconjunto`);
console.log(`     (se ejecuta su \`game_menu_getoptions\` sin encontrar nada que no esté)`);
console.log(`       ${String(menuOk.length).padStart(4)} de ${conMenu.length}   ${pct(menuOk.length)}
`);
console.log(`  B. AL MENOS UNA OPCIÓN se puede elegir de principio a fin`);
console.log(`     (su retrollamada y todo lo que encadena están portados)`);
console.log(`       ${String(alguna.length).padStart(4)} de ${conMenu.length}   ${pct(alguna.length)}
`);
console.log(`  C. EL NPC ENTERO: el menú y TODAS sus opciones`);
console.log(`       ${String(caben.length).padStart(4)} de ${conMenu.length}   ${pct(caben.length)}
`);

/** Qué falta, y cuántas veces: la lista de la compra del experimento 34. */
const cuenta = new Map();
for (const c of censo) {
  for (const x of c.faltaCmd) cuenta.set(`cmd ${x}`, (cuenta.get(`cmd ${x}`) ?? 0) + 1);
  for (const x of c.faltaGet) cuenta.set(`get ${x}`, (cuenta.get(`get ${x}`) ?? 0) + 1);
  for (const x of c.faltaProp) cuenta.set(`$get(,${x})`, (cuenta.get(`$get(,${x})`) ?? 0) + 1);
}
const loQueFalta = [...cuenta.entries()].sort((a, b) => b[1] - a[1]);
console.log(`  LO QUE MÁS FALTA, y a cuántos scripts les hace falta:`);
for (const [q, n2] of loQueFalta.slice(0, 15)) console.log(`    ${String(n2).padStart(4)}  ${q}`);
if (loQueFalta.length > 15) console.log(`    ...y ${loQueFalta.length - 15} más`);
console.log(`
  LOS QUE CABEN ENTEROS:`);
for (const c of caben) console.log(`    ${c.script}`);

// ── 2. los guiones que el navegador necesita ────────────────────────────────

/** Los NPC que hay puestos en el mapa, si el mapa ya está horneado. */
let delMapa = [];
try {
  const b = JSON.parse(readFileSync(enSalida(MAPA, "bichos.json"), "utf8"));
  delMapa = [...new Set((b.colocados ?? []).map((c) => c.script).filter(Boolean))];
} catch {
  console.log(`\n  (no hay ${enSalida(MAPA, "bichos.json")}: se guardan los ${conMenu.length} con menú)`);
  delMapa = conMenu;
}

const guiones = {};
for (const r of delMapa) {
  const g = cargarGuion(r);
  if (!g.eventos.length) continue;
  const c = censo.find((x) => x.script === r) ?? null;
  guiones[r] = {
    eventos: g.eventos,
    preload: g.preload,
    // Se guarda si CABE, para que el juego pueda decidir sin volver a medir:
    // un guion que no cabe entero se puede ejecutar igual —lo que no entienda
    // se apunta— pero el jugador merece saber que puede faltar algo.
    cabe: c?.cabe ?? null,
    faltan: c ? [...c.faltaCmd, ...c.faltaGet] : [],
  };
}

mkdirSync(salidaDe(MAPA), { recursive: true });
writeFileSync(SALIDA, JSON.stringify({
  procedencia: "derivado local de los .script de Master Sword Rebirth, leídos no copiados. No redistribuible.",
  raiz: RAIZ,
  subconjunto: { comandos: [...COMANDOS], getters: [...GETTERS], propiedades: [...PROPIEDADES] },
  censo: {
    conMenu: conMenu.length,
    menuCabe: menuOk.length,
    algunaOpcion: alguna.length,
    caben: caben.length,
    loQueFalta,
    detalle: censo,
  },
  guiones,
}, null, 1), "utf8");

console.log(`\n  guardados ${Object.keys(guiones).length} guiones de los ${delMapa.length} del mapa`);
console.log(`  -> ${SALIDA}\n`);

// ── 3. la procedencia, que en este proyecto va con lo extraído ─────────────

const PROC = enSalida(MAPA, "PROCEDENCIA.md");
const MARCA = "## Los guiones de los NPC";
if (existsSync(PROC) && !readFileSync(PROC, "utf8").includes(MARCA)) {
  appendFileSync(PROC, `
${MARCA}

\`guiones.json\` lo escribe \`node tools/guiones.mjs\` analizando los \`.script\` de
los NPC que hay en el mapa, con sus \`#include\` resueltos. Es el ÁRBOL DE
COMANDOS de cada uno: nombres de evento, comandos y parámetros. Texto, nada de
imágenes.

Lleva también el CENSO: de los ${conMenu.length} scripts con \`game_menu_getoptions\`,
${menuOk.length} construyen su menú entero con el subconjunto portado, ${alguna.length} tienen al menos
una opción que se puede elegir de principio a fin y ${caben.length} caben enteros. Esa
cuenta es el resultado del experimento 33; el porqué está en
\`doc/MISIONES_33.md\`.

No es el intérprete de Master Sword: son ${COMANDOS.size} comandos de los 223 de
\`m_GlobalCmdHash\` (scriptcmds.cpp:41), listados en \`src/play/guion.js\`.

Vale lo de siempre: **está en \`build/\`, que está en \`.gitignore\`, y no se mueve
un byte a \`public/\`.**
`);
  console.log(`  procedencia apuntada en ${PROC}\n`);
}
