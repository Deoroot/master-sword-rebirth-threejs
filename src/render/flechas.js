// LAS FLECHAS EN EL AIRE: el modelo, y nada más que el modelo.
//
// La regla —cuánto tensa, por dónde sale, cómo cae y a quién le da— está en
// `src/play/proyectil.js` y se prueba sin navegador. Esto es lo que se ve: un
// puñado de nodos de Three que se reciclan.
//
// ── Por qué un CONJUNTO y no una flecha por disparo ───────────────────────
//
// Porque montar un `SkinnedMesh` cuesta: esqueleto nuevo, `new Skeleton()` con
// sus inversas y un `bind`. Hacerlo en el fotograma del disparo es un tirón justo
// cuando el jugador está mirando. Así que se montan todas al equipar el arco y
// se reparten.
//
// Y son pocas a propósito: el motor deja una flecha clavada cinco segundos —diez
// la de madera— y con una cadencia de un tiro por segundo y pico no hacen falta
// más de una docena. Cuando se acaban, se recicla la más vieja, que es lo que
// hace cualquier juego y nadie nota.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { ESPACIO } from "./bsp_escena.js";

import { BASE_COMUN } from "../play/recursos.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/** El «adelante» de un `.mdl` de GoldSrc tras el cambio de ejes de este proyecto. */
const ADELANTE = new THREE.Vector3(1, 0, 0);

/**
 * Monta el conjunto de flechas.
 *
 * `clave` es la carpeta que escribió `tools/armas.mjs` (`weapons_bows_arrows`).
 */
export async function cargarFlechas(clave, {
  base = `${BASE_POR_DEFECTO}/armas`, U = 39.37, cuantas = 12, secuencia = "idle1",
} = {}) {
  const M = await cargarModelo(clave, { base });
  if (!M) return null;

  const grupo = new THREE.Group();
  // EL 100: uno por modelo; el nombre lleva la clave para reconocerlo en la escena.
  grupo.name = `flechas:${clave}`;
  const piezas = [];

  for (let n = 0; n < cuantas; n++) {
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
    const ejes = new THREE.Group();
    ejes.rotation.x = -Math.PI / 2;
    ejes.scale.setScalar(1 / U);
    for (const r of raices) ejes.add(r);

    const materiales = M.ficha.grupos.map((g) => {
      const t = M.texturas.get(g.archivo) ?? null;
      if (t) t.colorSpace = ESPACIO;
      // Como los bichos: color plano. Una flecha en vuelo no se ilumina con el
      // luxel de donde está —el motor tampoco lo hace por fotograma— y en
      // movimiento nadie lo mira.
      const m = new THREE.MeshBasicMaterial({ map: t, color: 0xdddddd });
      if (g.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      return m;
    });
    const malla = new THREE.SkinnedMesh(M.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);

    const nodo = new THREE.Group();
    nodo.name = `flecha${n}`;
    nodo.visible = false;
    nodo.add(ejes);
    grupo.add(nodo);
    nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    // La secuencia se pone UNA VEZ y no se vuelve a tocar: una flecha no anima.
    // `game_tossprojectile` pone `ANIM_DROPPED`, que es `idle1`.
    const mezclador = new THREE.AnimationMixer(nodo);
    const e = M.clips.get(String(secuencia).toLowerCase()) ?? [...M.clips.values()][0];
    if (e) mezclador.clipAction(e.clip).play();
    mezclador.update(0);

    piezas.push({ nodo, libre: true });
  }

  let siguiente = 0;

  return {
    grupo,
    cuantas: piezas.length,
    /** Cuántas hay puestas ahora mismo. Para la sonda. */
    get puestas() { return piezas.filter((p) => !p.libre).length; },
    /**
     * Coge una. Si no quedan, recicla por orden, que es lo que hace un juego con
     * un conjunto fijo.
     */
    coger() {
      let p = piezas.find((x) => x.libre);
      if (!p) { p = piezas[siguiente % piezas.length]; siguiente++; }
      p.libre = false;
      p.nodo.visible = true;
      // EL 100: una pieza reciclada de una bola de maná llevaba su escala.
      p.nodo.scale.setScalar(1);
      return p;
    },
    /**
     * EL 100: la escala de una pieza. La bola de maná del Orion Bow se dibuja a
     * `BALL_SIZE × 0,75` (proj_mana2_cl.script:35, :52); las flechas no se tocan.
     */
    escalar(p, s) {
      if (!p || !Number.isFinite(s)) return;
      p.nodo.scale.setScalar(s);
    },
    soltar(p) {
      if (!p) return;
      p.libre = true;
      p.nodo.visible = false;
    },
    /**
     * Pone una flecha donde está y mirando a donde va.
     *
     * El motor hace `pev->angles = UTIL_VecToAngles(pev->velocity)` en cada
     * `think` (giprojectile.cpp:259), o sea que una flecha apunta siempre a su
     * velocidad y por eso se la ve bajar el morro al caer. Aquí se hace con un
     * cuaternión del eje «adelante» a la dirección: el alabeo que queda es
     * arbitrario, y en una flecha no se ve.
     */
    apuntar(p, posEnMetros, direccion) {
      if (!p) return;
      p.nodo.position.set(posEnMetros[0], posEnMetros[1], posEnMetros[2]);
      if (!direccion) return;
      const d = new THREE.Vector3(direccion[0], direccion[1], direccion[2]);
      if (d.lengthSq() > 0) {
        d.normalize();
        p.nodo.quaternion.setFromUnitVectors(ADELANTE, d);
      }
    },
    quitar() { grupo.parent?.remove(grupo); },
  };
}
