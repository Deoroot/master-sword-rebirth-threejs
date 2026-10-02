// RESOLVER LOS `#include` DE UN GUION — uno solo, con el lector inyectado.
//
// Esto estaba en `tools/scriptsmsr.mjs`, que lee del disco, y el navegador no
// puede leer del disco: lee una tabla horneada. Tener dos copias del mismo
// recorrido es exactamente lo que el 65 aprendió con la colocación de la cámara
// —la sonda tenía su propia copia y acabó borrando lo que iba a medir—, así que
// el recorrido vive aquí una vez y lo que cambia es **de dónde sale el texto**.
//
// ── EL ORDEN, QUE ES POSICIONAL ─────────────────────────────────────────────
//
// El motor resuelve el `#include` dentro del analizador de líneas, en la línea
// en que aparece:
//
//     else if (!_stricmp(TestCommand, "#include")) {
//       ...
//       bool fSucces = Spawn(FileName, m.pScriptedEnt, ...);
//                                            script.cpp:5229, 5255
//
// Y eso decide números, porque `const` gana el PRIMERO:
//
//     for (int i = 0; i < m_Constants.size(); i++)
//       if (m_Constants[i].Name == VarName) { AddConst = false; break; }
//                                            script.cpp:5419-5433
//
// Un guion de Master Sword está escrito para aprovecharlo: sus números arriba,
// el `#include` que dice qué es debajo. Ver `test/guiones_orden66.test.mjs`,
// que lleva lo que costaba tenerlo al revés.

/**
 * Carga un guion con sus `#include` resueltos en su sitio.
 *
 * @param {string} ruta      la ruta del script, sin extensión
 * @param {(ruta:string)=>({piezas:Array}|null)} leer  de dónde sale el archivo
 *        ya analizado. `null` es «no está», que el motor avisa y sigue
 *        (script.cpp:5261) — así que aquí se apunta en `faltan` y se sigue.
 * @param {Set<string>} vistos  corta los ciclos, y es la lista de lo que entró
 * @returns {{eventos:Array, preload:Array, faltan:string[], archivos:string[]}}
 */
export function resolverGuion(ruta, leer, vistos = new Set()) {
  if (vistos.has(ruta)) return { eventos: [], preload: [], faltan: [], archivos: [...vistos] };
  vistos.add(ruta);
  const propio = leer(ruta);
  if (!propio) return { eventos: [], preload: [], faltan: [ruta], archivos: [...vistos] };

  const eventos = [];
  const preload = [];
  const faltan = [];
  // EN ORDEN DE ARCHIVO: `piezas` lleva los eventos, los `const` de cabecera y
  // los `#include` intercalados donde estaban. Recorrerla es `ParseLine`.
  for (const pieza of propio.piezas ?? []) {
    if (pieza.evento) { eventos.push(pieza.evento); continue; }
    if (pieza.preload) { preload.push(pieza.preload); continue; }
    if (!pieza.include) continue;
    const sub = resolverGuion(pieza.include, leer, vistos);
    eventos.push(...sub.eventos);
    preload.push(...sub.preload);
    faltan.push(...sub.faltan);
  }
  return { eventos, preload, faltan, archivos: [...vistos] };
}
