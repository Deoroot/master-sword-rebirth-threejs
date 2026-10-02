// LOS BRUSHES QUE NO SE VEN: `func_monsterclip` y los demás cascos de colisión.
//
// Gate City tiene **101 `func_monsterclip`** y hasta el 39 no teníamos ni uno.
// El motivo es una cadena de tres pasos que cada uno por separado está bien:
//
//   1. el compilador les quita las caras (traen `numfaces` 0 — está comprobado
//      en test/bsp.test.mjs desde el 12: «las entidades invisibles no traen ni
//      una cara»);
//   2. nuestra malla de colisión se construye **de caras** (`SOLIDAS` en
//      tools/gatecity.mjs);
//   3. luego no hay monsterclip en el mundo, y nada da error: el mapa se ve
//      idéntico porque estos brushes no se dibujan ni en el juego.
//
// Y son la guía de los monstruos de Gate City. No hay grafo de nodos que portar
// —`gatecity.bsp` no tiene ni un `info_node`, y `msmonsterserver.cpp` no
// referencia `nodes.cpp`, medido en el 07— así que **esto es todo lo que el
// mapeador puso para decirles por dónde no pasar**: la muralla del pueblo (un
// solo brush de 31 058 m³) y cien bloques con mediana de 3,7 m³ en puertas,
// escaleras, cornisas y puestos del mercado.
//
// ── Para quién es sólido, y para quién no ─────────────────────────────────
//
//   `pev->flags |= FL_MONSTER | FL_MONSTERCLIP`        msmonsterserver.cpp:169
//   if ((touch->v.flags & FL_MONSTERCLIP) && !clip->monsterClipBrush) continue;
//                                                      world.cpp:1196
//
// O sea: lo lleva todo monstruo de MSR, el motor se lo salta a quien no lleve la
// bandera, y por eso el jugador lo atraviesa. `bmodels.cpp:270` dice para qué es:
// «This can be used to keep specific monsters out of certain areas».
//
// ── La trampa, y es la mitad de este archivo ──────────────────────────────
//
// **No todas las trazas del motor lo ven, y la diferencia no se adivina:**
//
//   | quién | de dónde sale el `monsterClip` | ve el clip |
//   | `UTIL_TraceLine` | **`FALSE` a fuego**, pr_cmds.cpp:335 | NO |
//   | `SV_movestep` (andar) | `ent->v.flags`, sv_move.cpp:44 | sí |
//   | `TraceMonsterHull` | `pEdict->v.flags`, pr_cmds.cpp:604 | sí |
//   | `DROP_TO_FLOOR` | `ent->v.flags`, pr_cmds.cpp:1696 | sí |
//
// Y las dos cosas que usan `UTIL_TraceLine` son precisamente las dos que uno
// esperaría que lo vieran: **elegir el rumbo del paseo**
// (`UTIL_TraceLine(EyePosition(), VecDest, ...)`, msmonsterserver.cpp:1084) y
// **la vista** (`FVisible`, combat.cpp:1294).
//
// Así que un monstruo apunta su paseo a través de un monsterclip que no puede
// percibir, anda hacia allá, y se queda empujando contra una pared invisible
// hasta que vence el plazo de 7 s. Es feo y es el suyo: se porta con el fallo.
// Meterlo también en el rumbo lo haría «mejor» y ya no sería Master Sword.
//
// ── Por qué medios espacios y no vértices ─────────────────────────────────
//
// Un brush de un `.bsp` no está guardado como un poliedro: está guardado como un
// **árbol de planos**, y cada hoja sólida es la intersección de los medios
// espacios que se han cruzado para llegar hasta ella. O sea que la lista de
// planos **ya es** la forma, exacta, sin reconstruir nada — y con ella un
// segmento se prueba recortando su intervalo `t`, que son veinte líneas y no
// tiene casos especiales. Reconstruir los vértices para luego volver a sacar los
// planos sería dar una vuelta y perder precisión en el camino.

import { UNIDADES_POR_METRO, vectorAEscena } from "./lector.js";

/** `CONTENTS_SOLID`. Lo demás (vacío, agua, cielo) no para a nadie. */
export const SOLIDO = -2;

/** `CONTENTS_EMPTY`: la nada. Es el único contenido que no es «hay algo aquí». */
export const VACIO = -1;

/**
 * «Esta hoja es parte del volumen», para las entidades que NO son paredes.
 *
 * Un `func_water` puede venir del compilador con sus hojas marcadas `-2`
 * (sólido) o `-3` (agua) según cómo se compilara, y en Edana **aparecen las
 * dos en el mismo mapa**. Un `trigger_hurt` o un `msarea_music` las trae
 * sólidas aunque no paren a nadie: en el árbol de un modelo de entidad,
 * «sólido» quiere decir «aquí está el brush», y quién lo atraviesa lo decide
 * el `solid` de la entidad, no el `.bsp`. Ver el 48.
 */
export const OCUPADO = (c) => c !== VACIO;

/**
 * El tamaño de cada casco, `model.cpp:1107-1136`. Ojo al ORDEN: el 0 es el
 * punto, el 1 es el jugador de pie, el **2 es el grande** y el 3 el agachado.
 * No es el mismo orden que `player_mins[]` de `pmove.cpp:36`, que va por
 * `usehull` — confundirlos da un casco de 32 donde va uno de 18.
 */
export const CLIP_MINS = [[0, 0, 0], [-16, -16, -36], [-32, -32, -32], [-16, -16, -18]];
export const CLIP_MAXS = [[0, 0, 0], [16, 16, 36], [32, 32, 32], [16, 16, 18]];

const TAM_CLIPNODO = 8;      // { int planenum; short children[2] }
const TAM_NODO = 24;         // { int planenum; short children[2]; short mins[3], maxs[3]; }
const TAM_PLANO = 20;        // { float normal[3]; float dist; int type }
const TAM_HOJA = 28;
const TAM_MODELO = 64;

/** Los cuatro `headnode` y la caja de un modelo del `.bsp`. */
export function modeloDeBsp(bsp, indice) {
  const M = bsp.lumps.modelos.datos;
  const o = indice * TAM_MODELO;
  if (o + TAM_MODELO > M.length) throw new Error(`modelo ${indice} fuera del lump`);
  return {
    mins: [0, 1, 2].map((k) => M.readFloatLE(o + k * 4)),
    maxs: [0, 1, 2].map((k) => M.readFloatLE(o + 12 + k * 4)),
    origin: [0, 1, 2].map((k) => M.readFloatLE(o + 24 + k * 4)),
    headnodes: [0, 1, 2, 3].map((k) => M.readInt32LE(o + 36 + k * 4)),
    numfaces: M.readInt32LE(o + 60),
  };
}

const plano = (P, i) => ({
  n: [P.readFloatLE(i * TAM_PLANO), P.readFloatLE(i * TAM_PLANO + 4), P.readFloatLE(i * TAM_PLANO + 8)],
  dist: P.readFloatLE(i * TAM_PLANO + 12),
});

/**
 * LAS PIEZAS CONVEXAS DE UN MODELO, en unidades del `.bsp`.
 *
 * Recorre el árbol y por cada hoja sólida devuelve la lista de medios espacios
 * que hay que cruzar para llegar a ella. «Dentro» es `dot(n, p) >= dist` en
 * todos a la vez.
 *
 * `hull` elige el árbol: 0 es el de nodos (el del punto, el mismo que camina
 * `contenidoEn`) y 1..3 son los de clipnodos, los cascos con los que el motor
 * mueve cajas. Para un rayo el que corresponde es el **0**, que es lo que traza
 * `SV_Move` con `mins == maxs == 0`.
 *
 * El tope de profundidad no es paranoia: un árbol con un ciclo cuelga el
 * proceso, y «se ha quedado colgado» es el peor síntoma posible de un archivo
 * mal leído.
 */
export function piezasDeModelo(bsp, indice, {
  hull = 0, profundidadMaxima = 128, contenidos = (c) => c === SOLIDO,
} = {}) {
  const m = modeloDeBsp(bsp, indice);
  const P = bsp.lumps.planos.datos;
  const usaClipnodos = hull > 0;
  const T = usaClipnodos ? bsp.lumps.clipnodes.datos : bsp.lumps.nodos.datos;
  const tam = usaClipnodos ? TAM_CLIPNODO : TAM_NODO;
  const H = bsp.lumps.hojas.datos;

  const piezas = [];
  // La caja del modelo entra como seis medios espacios más. Sin ella, una hoja
  // sólida en el borde del árbol sale ABIERTA —un medio espacio infinito— y el
  // resultado es una pared que llega hasta el fin del mundo. No da error: da un
  // pueblo en el que los bichos no pueden moverse.
  //
  // Y LA CAJA SE ENGORDA CON EL CASCO (el 48). `mins`/`maxs` del modelo son la
  // caja de sus caras, o sea la del casco 0. Los cascos 1 a 3 son el brush
  // dilatado media caja de jugador, así que **se salen de ella**, y recortar
  // con la caja sin engordar los devolvía idénticos al casco 0. No daba error:
  // daba zonas 16 unidades más pequeñas de lo que el motor usa, que es un
  // bordillo. Las medidas son las del motor, `model.cpp:1107-1136`.
  const caja = [];
  const cm = CLIP_MINS[hull], cM = CLIP_MAXS[hull];
  for (let k = 0; k < 3; k++) {
    const nMas = [0, 0, 0]; nMas[k] = 1;
    const nMenos = [0, 0, 0]; nMenos[k] = -1;
    caja.push({ n: nMas, dist: m.mins[k] - cM[k] });      // p[k] >= mins[k] - clip_maxs[k]
    caja.push({ n: nMenos, dist: -(m.maxs[k] - cm[k]) }); // -p[k] >= -(maxs[k] - clip_mins[k])
  }

  const bajar = (n, acumulado, hondo) => {
    if (hondo > profundidadMaxima) throw new Error("el árbol de colisión no acaba: ¿ciclo?");
    if (n < 0) {
      // En clipnodos el hijo negativo ES el contenido. En el árbol de nodos es
      // el índice de una hoja y el contenido está dentro de ella. Confundirlos
      // no da error: da un mapa entero sólido o entero vacío.
      const contenido = usaClipnodos ? n : H.readInt32LE(-(n + 1) * TAM_HOJA);
      if (contenidos(contenido)) piezas.push([...caja, ...acumulado]);
      return;
    }
    const o = n * tam;
    const ip = T.readInt32LE(o);
    const p = plano(P, ip);
    const delante = T.readInt16LE(o + 4);
    const detras = T.readInt16LE(o + 6);
    // Delante del plano: `dot(n, p) >= dist`. Detrás: el plano del revés.
    bajar(delante, [...acumulado, p], hondo + 1);
    bajar(detras, [...acumulado, { n: [-p.n[0], -p.n[1], -p.n[2]], dist: -p.dist }], hondo + 1);
  };
  bajar(m.headnodes[hull], [], 0);
  return { piezas, mins: m.mins, maxs: m.maxs, numfaces: m.numfaces };
}

/**
 * Lo mismo, pero en METROS y EJES DE LA ESCENA, que es lo que el juego consume.
 *
 * Un plano `dot(n, p) = dist` con `p' = R·p / U` se convierte en
 * `dot(R·n, p') = dist / U`: la normal sólo gira —`vectorAEscena` es esa
 * rotación, que conserva la mano derecha— y la distancia se divide por la
 * escala. Nada de esto es evidente y equivocarlo da planos volteados, que se ven
 * como un mundo sólido con agujeros con forma de brush.
 *
 * `origin` es el desplazamiento de la entidad, que hay que sumar ANTES de girar.
 */
export function piezasEnEscena(bsp, indice, {
  hull = 0, origin = [0, 0, 0], contenidos = undefined,
} = {}) {
  const { piezas, mins, maxs, numfaces } = piezasDeModelo(bsp, indice, { hull, contenidos });
  const U = UNIDADES_POR_METRO;
  const enEscena = piezas.map((ps) => ps.map((p) => {
    // Desplazar un plano por `o` mueve su distancia en `dot(n, o)`.
    const d = p.dist + (p.n[0] * origin[0] + p.n[1] * origin[1] + p.n[2] * origin[2]);
    return { n: vectorAEscena(p.n), dist: d / U };
  }));
  const a = mins.map((v, k) => v + origin[k]);
  const b = maxs.map((v, k) => v + origin[k]);
  // La caja también cambia de ejes, y al voltear la Z el mínimo y el máximo se
  // cruzan: hay que volver a ordenarlos o la caja queda vacía y no filtra nada.
  const ea = vectorAEscena(a).map((v) => v / U);
  const eb = vectorAEscena(b).map((v) => v / U);
  return {
    piezas: enEscena,
    mins: [0, 1, 2].map((k) => Math.min(ea[k], eb[k])),
    maxs: [0, 1, 2].map((k) => Math.max(ea[k], eb[k])),
    numfaces,
  };
}

/**
 * TODOS los `func_monsterclip` de un mapa, listos para el juego.
 *
 * Devuelve una lista de `{ piezas, mins, maxs }` en metros de escena, una por
 * entidad. Se queda con las que de verdad tienen algo: una entidad sin ninguna
 * hoja sólida no se descarta en silencio, se cuenta en `vacias`, porque «hay
 * cero monsterclip» y «los he leído todos y están vacíos» se ven igual en el
 * mundo y son dos fallos distintos.
 */
export function monsterclipDeMapa(bsp, entidades, { clase = "func_monsterclip", hull = 0 } = {}) {
  const brushes = [];
  let vacias = 0;
  for (const e of entidades) {
    if (e.classname !== clase || !/^\*\d+$/.test(e.model ?? "")) continue;
    const origin = String(e.origin ?? "0 0 0").trim().split(/\s+/).map(Number);
    const r = piezasEnEscena(bsp, Number(e.model.slice(1)), { hull, origin });
    if (!r.piezas.length) { vacias++; continue; }
    brushes.push({ piezas: r.piezas, mins: r.mins, maxs: r.maxs });
  }
  return { brushes, vacias };
}
