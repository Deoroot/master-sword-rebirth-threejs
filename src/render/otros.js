// LOS OTROS JUGADORES, en el mundo.
//
// El modelo es el mismo que el juego usa para un personaje —
// `models/human/reference.mdl`, lo que `CRenderChar::Init` carga— y el mismo que
// ya está horneado en `build/msr/cuerpos/` para la hoja de personaje del
// experimento 14. O sea que **esto no trae contenido nuevo**: trae al mismo
// modelo al mundo, a tamaño y con su animación.
//
// ── Por qué no lo monta `montarBichos` ────────────────────────────────────
//
// Porque los bichos salen de un manifiesto de colocaciones —69 entidades que el
// `.bsp` declara y no cambian— y estos salen de la red: aparecen, se van, y su
// sitio lo dice una foto veinte veces por segundo. Lo que sí se comparte es lo
// que de verdad es común: `cargarModelo()` de `src/render/bichos.js`, que lee un
// `.mdl` horneado con su malla, sus texturas y sus pistas. Duplicar eso sí
// habría sido un error.
//
// ── Las dos animaciones, y son las del mod ────────────────────────────────
//
// `build/msr/cuerpos.json` las nombra, y salen de `global.script`, o sea
// del mod y no de mirar capturas:
//
//     sinArma: "attention"      quieto
//     subiendo: "run"           andando
//
// Se elige por la RAPIDEZ que trae la foto, no por si la posición ha cambiado:
// a 20 fotos por segundo y con interpolación, comparar posiciones daría un
// jugador que se queda quieto cada vez que se pierde un paquete.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";

import { BASE_COMUN } from "../play/recursos.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/** El umbral de «se está moviendo», en unidades por segundo. */
export const ANDANDO = 10;

/**
 * Los cuerpos de los demás. Devuelve un grupo para colgar de la escena y cuatro
 * operaciones: `poner`, `quitar`, `paso` y `estado`.
 *
 * @param {{base?: string, U?: number, carpeta?: string}} opciones
 */
/**
 * UNA FIGURA DE JUGADOR: esqueleto propio, materiales propios, malla compartida.
 *
 * Sale de dentro de `cargarOtros` en el 41 y se exporta porque hace falta en dos
 * sitios: los demás jugadores y **tu propio cadáver**, que es la misma figura con
 * otra vida. Duplicar veinte líneas de atar un esqueleto es exactamente la clase
 * de copia que luego se arregla en un sitio y no en el otro.
 *
 * No la cuelga de ninguna parte por su cuenta: `padre` dice dónde va, y quien la
 * pide es quien la quita.
 */
export function figuraDeJugador(M, { id = 0, nombre = null, U = 39.37, padre = null } = {}) {
    // Un esqueleto por figura. Dos jugadores en fotogramas distintos no pueden
    // compartirlo, igual que dos zombis.
    const huesos = M.ficha.huesos.map((h, i) => {
      const b = new THREE.Bone();
      b.name = `h${i}`;
      b.position.set(h.pos[0], h.pos[1], h.pos[2]);
      b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
      return b;
    });
    const raices = [];
    M.ficha.huesos.forEach((h, i) => {
      if (h.padre < 0) raices.push(huesos[i]);
      else huesos[h.padre].add(huesos[i]);
    });

    // El cambio de ejes y la escala: el `.mdl` está en unidades del motor y con
    // la Z hacia arriba.
    const ejes = new THREE.Group();
    ejes.rotation.x = -Math.PI / 2;
    ejes.scale.setScalar(1 / U);
    for (const r of raices) ejes.add(r);

    const materiales = M.ficha.grupos.map((g) => {
      const iTex = M.ficha.pieles?.[0]?.[g.skinref];
      const info = (iTex !== undefined && M.ficha.texturasPorIndice?.[iTex]) || g;
      const map = M.texturas.get(info.archivo) ?? M.texturas.get(g.archivo) ?? null;
      // A PLENA LUZ, y es una deuda declarada: un modelo de GoldSrc se ilumina
      // con `R_LightPoint`, un luxel leído del suelo que tiene debajo. Los
      // adornos lo hacen (su luxel viene horneado) y los bichos también, pero
      // un jugador se mueve: haría falta preguntarle al mapa de luz en cada
      // foto. Hasta entonces, blanco — que es más claro de lo que debería y se
      // ve como que el otro jugador brilla un poco en las cuevas.
      return new THREE.MeshBasicMaterial({ map, color: 0xffffff });
    });

    const malla = new THREE.SkinnedMesh(M.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);

    const nodo = new THREE.Group();
    nodo.name = `jugador ${id}${nombre ? ` (${nombre})` : ""}`;
    nodo.add(ejes);
    if (padre) padre.add(nodo);
    // El esqueleto se ata DESPUÉS de colgarlo y de actualizar las matrices, por
    // lo mismo que en `bichos.js`: `new Skeleton()` saca las inversas de enlace
    // de `bone.matrixWorld`, y sin actualizar las saca de la identidad — que no
    // da error, da una figura aplastada en el origen.
    nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    const mezclador = new THREE.AnimationMixer(nodo);
    let puesta = null;
    const pon = (nombreSec) => {
      const e = M.clips.get(String(nombreSec).toLowerCase()) ?? [...M.clips.values()][0];
      if (!e || e === puesta) return puesta;
      puesta = e;
      mezclador.stopAllAction();
      mezclador.clipAction(e.clip).reset().play();
      return e;
    };
    return {
      id, nodo, mezclador, pon, materiales,
      get secuencia() { return puesta?.seq?.nombre ?? null; },
      nombre,
    };
}

export async function cargarOtros({
  base = BASE_POR_DEFECTO, U = 39.37, carpeta = "cuerpos/human_reference_b40",
} = {}) {
  const modelo = await cargarModelo(carpeta, { base });
  if (!modelo) return null;

  const grupo = new THREE.Group();
  grupo.name = "otros jugadores";
  /** @type {Map<number, object>} */
  const figuras = new Map();

  /** Una figura nueva, colgada ya del grupo de los otros. */
  function crear(id, nombre) {
    const f = figuraDeJugador(modelo, { id, nombre, U, padre: grupo });
    f.pon("attention");
    return f;
  }

  return {
    grupo,
    figuras,
    modelo,

    /** Pone o mueve a un jugador. `estado` es lo que trae la foto, interpolado. */
    poner(id, estado) {
      let f = figuras.get(id);
      if (!f) { f = crear(id, estado.nombre); figuras.set(id, f); }
      const [x, y, z] = estado.pies;
      f.nodo.position.set(x, y, z);
      // El `yaw` del jugador mira a −Z con cero, y el modelo mira a +X con cero
      // —es la convención de GoldSrc—, así que hay un cuarto de vuelta entre los
      // dos. Sin él los demás andan de lado, que es de esas cosas que se ven en
      // el acto y no se deducen de ningún número.
      f.nodo.rotation.y = estado.yaw - Math.PI / 2;
      f.pon((estado.rapidez ?? 0) > ANDANDO ? "run" : "attention");
      f.visto = estado;
      return f;
    },

    quitar(id) {
      const f = figuras.get(id);
      if (!f) return false;
      grupo.remove(f.nodo);
      f.mezclador.stopAllAction();
      figuras.delete(id);
      return true;
    },

    /** Deja sólo a los que vengan en el mapa, y coloca a todos. */
    refrescar(interpolados) {
      for (const [id, estado] of interpolados) this.poner(id, estado);
      for (const id of [...figuras.keys()]) if (!interpolados.has(id)) this.quitar(id);
      return figuras.size;
    },

    paso(dt) { for (const f of figuras.values()) f.mezclador.update(dt); },

    estado() {
      return [...figuras.values()].map((f) => ({
        id: f.id,
        nombre: f.nombre ?? null,
        pies: [f.nodo.position.x, f.nodo.position.y, f.nodo.position.z],
        yaw: f.nodo.rotation.y,
        secuencia: f.secuencia,
        interpolado: Boolean(f.visto?.interpolado),
      }));
    },
  };
}
