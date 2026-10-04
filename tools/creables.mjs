// LO QUE UN GUION PUEDE CREAR CON `createnpc` — para saber qué hornear.
//
//     createnpc <script_name> <origin> [params...]        scriptcmds.cpp:2760-2816
//
// «Any media used by createnpc <script_name> must be precached beforehand»
// (scriptcmds.cpp:2765): el motor exige que el modelo de lo creado esté ya
// cargado, y aquí es lo mismo con otro nombre — el `.mdl` y el guion de la
// criatura tienen que estar HORNEADOS en `build/<mapa>/`, o `createnpc` no
// tiene con qué hacerla. Esto dice cuáles.
//
// De dónde se parte (las «raíces»):
//
//   - los guiones de las criaturas COLOCADAS en el mapa (`tools/bichos.mjs`);
//   - los guiones de las ARMAS del catálogo (`build/msr/armas.json`), que no
//     son de ningún mapa: la Blood Drinker lanza `monsters/summon/blood_drinker`
//     (items/swords_blood_drinker.script:171) se empuñe donde se empuñe.
//
// Y se sigue en cadena: lo creado puede crear (una invocación que deja una
// nube, un jefe que saca crías).
//
// CÓMO SE RESUELVE EL NOMBRE. El primer parámetro es casi siempre un literal
// (`monsters/summon/stun_burst`) o una constante (`SUMMON_SCRIPT`). La constante
// se busca en TODAS las asignaciones del guion resuelto —`const`, `setvar`,
// `setvard`, `setvarg`, `local`—, no sólo en la primera: la pregunta es «qué
// puede llegar a crear», no «qué crea al nacer» (lo mismo que hace
// `animacionesDelGuion` con `playanim`, el 93). Lo que no resuelve a una ruta
// —un `$get_token(...)`, un `PARAM1`— SE DICE: un filtro que descarta en
// silencio es donde cabe un pueblo (CLAUDE.md §4, el 63).
//
// La regla del 02: los `.script` se quedan en `../MSC/`; esto sólo los lee.

import { partirGuion } from "../src/play/guion.js";
import { resolverGuion } from "../src/play/cargador.js";
import { leerScript, RAIZ_POR_OMISION } from "./scriptsmsr.mjs";

const ASIGNAN = new Set(["const", "setvar", "setvard", "setvarg", "local"]);
const sinComillas = (s) => String(s ?? "").replace(/^["']|["']$/g, "");
/** Una ruta de guion: letras, con al menos una barra y sin `$` ni paréntesis. */
const esRuta = (s) => /^[A-Za-z0-9_][\w./-]*\/[\w./-]+$/.test(s);

function cadaComando(cmds, fn) {
  for (const c of cmds ?? []) {
    fn(c);
    cadaComando(c.hijos, fn);
    for (const r of c.sino ?? []) cadaComando(r, fn);
  }
}

/** Un lector con caché: `base_monster` no se analiza ochocientas veces. */
export function lectorDe(raiz = RAIZ_POR_OMISION) {
  const cache = new Map();
  return (ruta) => {
    if (!cache.has(ruta)) {
      const t = leerScript(ruta, raiz);
      cache.set(ruta, t === null ? null : partirGuion(t));
    }
    return cache.get(ruta);
  };
}

/**
 * Lo que UN guion (con sus `#include`) puede crear.
 * @returns {{ rutas: Set<string>, sinResolver: Set<string>, usos: number }}
 */
export function creadosPor(ruta, leer) {
  const g = resolverGuion(ruta, leer, new Set());
  const valores = new Map();
  const apunta = (k, v) => { if (!valores.has(k)) valores.set(k, new Set()); valores.get(k).add(sinComillas(v)); };
  for (const pre of g.preload ?? []) if (pre.nombre) apunta(pre.nombre, pre.valor);
  for (const e of g.eventos ?? []) cadaComando(e.cmds, (c) => {
    if (ASIGNAN.has(c.nombre) && c.params?.[0]) apunta(c.params[0], c.params.slice(1).join(" "));
  });
  const rutas = new Set(), sinResolver = new Set();
  let usos = 0;
  for (const e of g.eventos ?? []) cadaComando(e.cmds, (c) => {
    if (c.nombre !== "createnpc") return;
    usos++;
    const p = sinComillas(c.params?.[0]);
    if (!p) return;
    if (esRuta(p)) { rutas.add(p.replace(/\.script$/i, "")); return; }
    const vs = [...(valores.get(p) ?? [])].filter(esRuta);
    if (vs.length) for (const v of vs) rutas.add(v.replace(/\.script$/i, ""));
    else sinResolver.add(p);
  });
  return { rutas, sinResolver, usos };
}

/**
 * El cierre: todo lo que se puede llegar a crear partiendo de `raices`.
 *
 * @param raices  `[{ ruta, de }]`: el guion y de quién es («mapa», «arma»).
 * @returns `{ creables: Map<ruta, { por: string[] }>, sinResolver: Map<ruta, string[]>, sinFichero: string[] }`
 */
export function creablesDe(raices, raiz = RAIZ_POR_OMISION, leer = lectorDe(raiz)) {
  const creables = new Map();
  const sinResolver = new Map();
  const sinFichero = new Set();
  const vistos = new Set();
  const cola = raices.map((r) => r.ruta);
  while (cola.length) {
    const ruta = cola.shift();
    if (vistos.has(ruta)) continue;
    vistos.add(ruta);
    if (leer(ruta) === null) { if (creables.has(ruta)) sinFichero.add(ruta); continue; }
    const r = creadosPor(ruta, leer);
    if (r.sinResolver.size) sinResolver.set(ruta, [...r.sinResolver]);
    for (const c of r.rutas) {
      if (!creables.has(c)) creables.set(c, { por: [] });
      creables.get(c).por.push(ruta);
      cola.push(c);
    }
  }
  for (const s of sinFichero) creables.delete(s);
  return { creables, sinResolver, sinFichero: [...sinFichero] };
}
