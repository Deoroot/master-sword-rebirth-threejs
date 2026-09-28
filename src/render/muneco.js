// EL MUÑECO: tu propio personaje, pequeño, en la parte de abajo de la pantalla.
//
// En Master Sword se llama `ms_lildude` —por el cvar que lo apaga— y el código
// lo llama por lo que es:
//
//     // Render player model on HUD
//     // It's a permanent 3D inset
//     void CRenderPlayerInset::Render()          clrenderent.cpp:368-370
//
// O sea que **no es tu cuerpo visto desde arriba**: es una copia en miniatura
// de tu modelo, puesta delante de la cámara. Y eso cambia todo lo que hay que
// escribir, porque un cuerpo de verdad habría que agacharlo, pisarle el suelo y
// que no se metiera en las paredes. Esto sólo se pone donde toca.
//
// ── Los cuatro números, y salen los cuatro de `V_CalcRefdef` ──────────────
//
//     Ent.origin  = pparams->vieworg;
//     Ent.origin += pparams->forward * 4.7 + pparams->up * -3.1;
//     Ent.angles  = Vector( -vAng[0], vAng[1], 0 );      view.cpp:1757-1763
//     m_Ent.curstate.scale = INSET_SCALE;   // 0.026    clrender.h:34
//
//   4,7 unidades delante y 3,1 por debajo del ojo, escala **0,026** y el mismo
//   rumbo que la vista — o sea que lo ves de espaldas, mirando a donde miras.
//
// El pitch va negado y **eso no es un giro**: es la convención de los modelos
// de estudio, que `R_StudioSetUpTransform` vuelve a negar al montar la matriz.
// Las dos negaciones se cancelan, así que aquí el muñeco se inclina con la
// vista igual que el arma. Copiarlo literalmente lo dejaría cabeza abajo cada
// vez que miras al suelo.
//
// ── Lo que NO lleva, y se ve ──────────────────────────────────────────────
//
// El motor le dibuja **el equipo encima** con la misma escala
// (`RenderGearItem`), así que en el juego el muñeco lleva tu espada en la mano
// y tu armadura puesta. Eso pide los puntos de anclaje del `.mdl`, que todavía
// no se leen: aquí sale con las manos vacías.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { ESPACIO } from "./bsp_escena.js";

/** `INSET_SCALE` (clrender.h:34). El 0,02 de antes está comentado al lado. */
export const ESCALA = 0.026;

/** Lo que se aparta del ojo, en unidades: `forward * 4.7 + up * -3.1`. */
export const DESPLAZAMIENTO = { adelante: 4.7, arriba: -3.1 };

/**
 * Monta el muñeco con el modelo del género que se le pida.
 *
 * `manifiesto` es `build/gatecity/cuerpos.json`, el mismo que usa la hoja de
 * personaje: el modelo es `human/reference.mdl` con el submodelo del género, y
 * las animaciones las nombra `global.script`.
 */
export async function cargarMuneco(manifiesto, {
  base = "build/gatecity", genero = "male", U = 39.37,
} = {}) {
  const g = manifiesto?.generos?.[genero] ?? manifiesto?.generos?.male;
  if (!g) return null;
  const M = await cargarModelo(g.carpeta, { base });
  if (!M) return null;
  const { ficha, geo, texturas, clips } = M;

  const huesos = ficha.huesos.map((h, i) => {
    const b = new THREE.Bone();
    b.name = `h${i}`;
    b.position.set(h.pos[0], h.pos[1], h.pos[2]);
    b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
    return b;
  });
  const raices = [];
  ficha.huesos.forEach((h, i) => {
    if (h.padre < 0) raices.push(huesos[i]);
    else huesos[h.padre].add(huesos[i]);
  });

  // El cambio de ejes y la escala del inset en el mismo sitio que en el arma:
  // `1/U` lleva las unidades a metros y `0,026` es la miniatura.
  const ejes = new THREE.Group();
  ejes.rotation.x = -Math.PI / 2;
  ejes.scale.setScalar(ESCALA / U);
  for (const r of raices) ejes.add(r);

  const materiales = ficha.grupos.map((gr) => {
    const t = texturas.get(gr.archivo) ?? null;
    if (t) t.colorSpace = ESPACIO;
    const m = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff });
    if (gr.aditivo) { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; }
    if (gr.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
    return m;
  });
  const malla = new THREE.SkinnedMesh(geo, materiales);
  malla.frustumCulled = false;
  ejes.add(malla);

  // Los mismos 90° que el arma: el modelo mira a la +x de GoldSrc y la cámara
  // a la −z de Three. Sin esto el muñeco sale de perfil.
  const giro = new THREE.Group();
  giro.rotation.y = Math.PI / 2;
  giro.add(ejes);

  const nodo = new THREE.Group();
  nodo.name = "muneco";
  nodo.add(giro);
  nodo.updateMatrixWorld(true);
  malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

  const mezclador = new THREE.AnimationMixer(nodo);
  let actual = null;
  function pon(nombre) {
    const e = clips.get(String(nombre ?? "").toLowerCase());
    if (!e || actual === e) return actual;
    mezclador.stopAllAction();
    const a = mezclador.clipAction(e.clip);
    a.setLoop(THREE.LoopRepeat, Infinity);
    a.reset().play();
    actual = e;
    return e;
  }
  pon(manifiesto.animaciones?.conArma ?? "idle");

  const adelante = new THREE.Vector3();
  const arriba = new THREE.Vector3();

  return {
    nodo, malla, ficha, clips, pon,
    get animacion() { return actual?.seq?.nombre ?? null; },
    get visible() { return nodo.visible; },
    set visible(v) { nodo.visible = v; },
    animar(dt) { mezclador.update(dt); },
    /**
     * Lo coloca delante del ojo. Se llama antes de dibujar, con la cámara ya
     * movida: el desplazamiento es en los ejes de la VISTA, no del mundo, así
     * que mirando hacia arriba el muñeco sube con ella.
     */
    seguir(camara) {
      adelante.set(0, 0, -1).applyQuaternion(camara.quaternion);
      arriba.set(0, 1, 0).applyQuaternion(camara.quaternion);
      nodo.position.copy(camara.position)
        .addScaledVector(adelante, DESPLAZAMIENTO.adelante / U)
        .addScaledVector(arriba, DESPLAZAMIENTO.arriba / U);
      nodo.quaternion.copy(camara.quaternion);
    },
    quitar() { nodo.parent?.remove(nodo); },
  };
}
