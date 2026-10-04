// EL EQUIPO, COLGADO DEL CUERPO: la mitad que dibuja de `RenderGearItem`.
//
// La regla —qué modelo y qué `body` le toca a cada objeto— está en
// `src/play/equipovisto.js` y sale del guion. Aquí sólo se cuelga.
//
// ── Cómo ata el motor un objeto al cuerpo ─────────────────────────────────
//
//     ItemEnt.AttachTo(Ent);             clrenderent.cpp:329
//     ItemEnt.curstate.framerate = 0;
//     ItemEnt.curstate.frame = 0;        :330-331
//
// `AttachTo` es `MOVETYPE_FOLLOW` con `aiment`, y para un modelo de estudio eso
// es `StudioMergeBones`: **cada hueso del objeto que se llame igual que uno del
// cuerpo toma la matriz del cuerpo**, y los que no, se calculan con su propia
// secuencia (aquí parada en el fotograma 0) colgando de su padre.
//
// En Three eso es un `SkinnedMesh` cuyo esqueleto está hecho de los huesos DEL
// CUERPO, buscados por nombre. Los que el objeto trae de más se crean y se
// cuelgan del hueso del cuerpo que haga de padre, en su postura de reposo.
//
// Las inversas de enlace son las del OBJETO, no las del cuerpo: sus vértices
// están en su propia postura de reposo, que no tiene por qué ser la del
// `reference.mdl`.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { ESPACIO } from "./bsp_escena.js";
import { BASE_COMUN } from "../play/recursos.js";

/** Los modelos de equipo ya traídos. Uno por página: los comparten todos los cuerpos. */
export class Equipo3D {
  constructor({ base = BASE_COMUN } = {}) {
    this.base = base;
    this._modelos = new Map();
  }

  /** La malla de una carpeta de `build/msr/equipo/`, una vez. */
  traer(carpeta) {
    if (!this._modelos.has(carpeta)) {
      this._modelos.set(carpeta, cargarModelo(carpeta, { base: this.base }).catch((e) => {
        console.warn(`equipo: no se pudo cargar ${carpeta}:`, e);
        return null;
      }));
    }
    return this._modelos.get(carpeta);
  }

  /**
   * VISTE UN CUERPO. Quita lo que tuviera colgado y cuelga `piezas`.
   *
   * @param destino  `{ ejes, huesos, ficha }` de un cuerpo ya montado: el grupo
   *                 donde vive su malla, sus `THREE.Bone` y su `bicho.json`.
   * @param piezas   lo que devuelve `piezasConCuerpo` (src/play/equipovisto.js)
   * @returns lo que quedó colgado y lo que no, CON SU PORQUÉ — una pieza que no
   *          se puede dibujar no se calla.
   */
  async vestir(destino, piezas = []) {
    const turno = (destino._turnoDeEquipo = (destino._turnoDeEquipo ?? 0) + 1);
    const traidas = await Promise.all(piezas.map(async (p) => ({
      p, M: p.carpeta ? await this.traer(p.carpeta) : null,
    })));
    // Dos cambios seguidos: manda el último, y el primero no cuelga nada.
    if (destino._turnoDeEquipo !== turno) return null;
    desvestir(destino);
    const colgadas = [], faltan = [];
    for (const { p, M } of traidas) {
      if (!M) { faltan.push({ id: p.id, porque: p.porque ?? `no se pudo cargar ${p.carpeta}` }); continue; }
      if (!M.ficha.triangulos) { colgadas.push({ ...resumen(p), triangulos: 0, malla: null }); continue; }
      const malla = colgar(destino, M);
      // El nombre dice de quién es y qué submodelo: es lo que lee la sonda DE
      // LA ESCENA para saber qué hay colgado de verdad (ver `enEscenaDe`).
      malla.name = `equipo:${p.id}:${p.clave}#${p.cuerpo}`;
      colgadas.push({ ...resumen(p), triangulos: M.ficha.triangulos, malla });
    }
    destino._equipo = colgadas;
    destino._faltaDeEquipo = faltan;
    // EL 101b: EL CUERPO CON PARTES ESCONDIDAS es el mismo `.mdl` con otro
    // `body` (ver `cuerpoGuardado`, src/play/equipovisto.js). Si ha llegado
    // —colgado o vacío, que es «todo en `blank`»—, la malla entera del cuerpo
    // se esconde; si no ha llegado o no se pudo cargar, se queda a la vista:
    // un personaje con el pantalón asomando es mejor que uno sin cuerpo.
    if (destino.malla) destino.malla.visible = !colgadas.some((c) => c.esCuerpo);
    return { colgadas, faltan };
  }
}

const resumen = (p) => ({ id: p.id, clave: p.clave, cuerpo: p.cuerpo, donde: p.donde, mano: p.mano, esCuerpo: Boolean(p.esCuerpo) });

/**
 * LO QUE HAY COLGADO DE VERDAD: las mallas de equipo que son hijas de los ejes
 * del cuerpo AHORA. No sale de la lista de `vestir` sino del grafo, y es a
 * propósito: con el `remove` de `desvestir` roto, la lista decía «ya no lleva
 * la coraza» y la coraza seguía dibujándose debajo de la de cuero (el 69:
 * «`choca === false` se quedó verde y la física seguía parando al jugador»).
 */
export function enEscenaDe(destino) {
  return destino.ejes.children.filter((h) => h.isSkinnedMesh && h.name.startsWith("equipo:")).map((h) => h.name);
}

/** Suelta lo colgado. Las geometrías y texturas son compartidas: no se liberan. */
export function desvestir(destino) {
  for (const c of destino._equipo ?? []) {
    if (!c.malla) continue;
    c.malla.parent?.remove(c.malla);
    for (const h of c.malla.userData.huesosPropios ?? []) h.parent?.remove(h);
    c.malla.skeleton?.dispose?.();
  }
  destino._equipo = [];
}

/** La matriz de reposo de cada hueso de una ficha, en el espacio del modelo. */
function reposoDe(huesos) {
  const out = [];
  const local = new THREE.Matrix4();
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), uno = new THREE.Vector3(1, 1, 1);
  huesos.forEach((h, i) => {
    local.compose(p.set(...h.pos), q.set(...h.quat), uno);
    out[i] = h.padre < 0 ? local.clone() : out[h.padre].clone().multiply(local);
  });
  return out;
}

/** `StudioMergeBones`, en Three. Devuelve la malla ya atada. */
function colgar(destino, M) {
  const porNombre = new Map();
  destino.ficha.huesos.forEach((h, i) => porNombre.set(h.nombre, destino.huesos[i]));

  const huesos = [];
  const propios = [];
  M.ficha.huesos.forEach((h, i) => {
    const suyo = porNombre.get(h.nombre);
    if (suyo) { huesos[i] = suyo; return; }
    // Un hueso que el cuerpo no tiene: se queda en su fotograma 0, colgando de
    // quien sea su padre — del cuerpo si el padre casó, o suelto en los ejes.
    const b = new THREE.Bone();
    b.name = `equipo_${h.nombre}`;
    b.position.set(...h.pos);
    b.quaternion.set(...h.quat);
    (h.padre < 0 ? destino.ejes : huesos[h.padre]).add(b);
    huesos[i] = b;
    propios.push(b);
  });

  const inversas = reposoDe(M.ficha.huesos).map((m) => m.invert());
  const materiales = M.ficha.grupos.map((g) => {
    const iTex = M.ficha.pieles?.[0]?.[g.skinref];
    const info = (iTex !== undefined && M.ficha.texturasPorIndice?.[iTex]) || g;
    const map = M.texturas.get(info.archivo) ?? M.texturas.get(g.archivo) ?? null;
    if (map) map.colorSpace = ESPACIO;
    const m = new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    if (info.aditivo) { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; }
    if (info.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
    return m;
  });
  const malla = new THREE.SkinnedMesh(M.geo, materiales);
  malla.frustumCulled = false;
  malla.userData.huesosPropios = propios;
  malla.userData.casados = huesos.length - propios.length;
  destino.ejes.add(malla);
  // Con la identidad de matriz de enlace y las inversas en el espacio del
  // modelo, la piel sale `hueso_ahora · reposo⁻¹ · v` en los ejes del cuerpo,
  // sea cual sea la escala y el giro que el cuerpo lleve encima.
  malla.bind(new THREE.Skeleton(huesos, inversas), new THREE.Matrix4());
  return malla;
}
