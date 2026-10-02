// EL ARMA EN LA MANO: el modelo de primera persona.
//
// Es el mismo formato que un bicho —un `.mdl` con esqueleto y secuencias— y se
// carga con el mismo lector (`cargarModelo`). Lo único distinto es dónde se
// pone: no en el mundo, sino **colgado de la cámara**.
//
// ── Por qué cuelga de la cámara y no se coloca a mano ─────────────────────
//
// Porque es lo que hace el motor. El modelo de vista es una entidad cuyo origen
// ES el ojo del jugador y cuyos ángulos SON los de la vista:
//
//     cl_view.c   view.origin = pparams->simorg + pparams->viewheight;
//                 view.angles = v_angle;   (+ el balanceo del paso)
//
// O sea que el archivo ya está dibujado para verse bien desde ahí, y cualquier
// desplazamiento que uno le ponga «para que se vea centrado» es una corrección
// de algo que no estaba mal. Si sale torcido, lo que está mal es el cambio de
// ejes.
//
// ── Lo que este archivo NO hace, y se nota ────────────────────────────────
//
//   - **No tiene su propio campo de visión.** GoldSrc dibuja el modelo de vista
//     en una pasada aparte con su propio FOV (`cl_viewmodelfov`), y por eso en
//     el juego la espada no se estira al cambiar el FOV. Aquí va en la escena,
//     con el FOV de la cámara.
//   - **No se recorta contra las paredes.** El motor tampoco: el modelo de
//     vista atraviesa la pared igual.
//   - No hay balanceo al andar (`V_CalcBob`) ni retroceso.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { ESPACIO } from "./bsp_escena.js";

import { BASE_COMUN } from "../play/recursos.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/**
 * Monta el arma de la mano y la cuelga de la cámara.
 *
 * `carpeta` es la que escribió `tools/armas.mjs` —`viewmodels_v_1hswords_b1`— y
 * `U` las unidades por metro del mapa, que es la escala del modelo.
 */
export async function cargarArma(carpeta, {
  base = `${BASE_POR_DEFECTO}/armas`, U = 39.37,
} = {}) {
  const M = await cargarModelo(carpeta, { base });
  if (!M) return null;
  const { ficha, geo, texturas, clips } = M;

  const huesos = ficha.huesos.map((h, i) => {
    const b = new THREE.Bone();
    b.name = `h${i}`;
    b.userData.nombre = h.nombre;
    b.position.set(h.pos[0], h.pos[1], h.pos[2]);
    b.quaternion.set(h.quat[0], h.quat[1], h.quat[2], h.quat[3]);
    return b;
  });
  const raices = [];
  ficha.huesos.forEach((h, i) => {
    if (h.padre < 0) raices.push(huesos[i]);
    else huesos[h.padre].add(huesos[i]);
  });

  // El mismo cambio de ejes que los bichos, y por el mismo motivo: el `.mdl`
  // viene en ejes de GoldSrc y en unidades, y el giro tiene que sufrirlo la
  // malla Y el esqueleto, así que va en un nodo por encima de los dos.
  const ejes = new THREE.Group();
  ejes.rotation.x = -Math.PI / 2;
  ejes.scale.setScalar(1 / U);
  for (const r of raices) ejes.add(r);

  const materiales = ficha.grupos.map((g) => {
    const t = texturas.get(g.archivo) ?? null;
    if (t) t.colorSpace = ESPACIO;
    // Igual que los bichos: `MeshBasicMaterial` con un color, que es lo que
    // hace `R_StudioSetupLighting`. Pero el modelo de vista va SIEMPRE a plena
    // luz: el motor lo ilumina con `r_viewmodel` aparte y en la práctica no se
    // ve nunca negro, ni en un sótano. Pintarlo con el luxel del suelo dejaría
    // las manos invisibles justo donde hace falta verlas.
    const m = new THREE.MeshBasicMaterial({ map: t, color: 0xffffff });
    if (g.aditivo) { m.blending = THREE.AdditiveBlending; m.depthWrite = false; m.transparent = true; }
    if (g.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
    return m;
  });

  const malla = new THREE.SkinnedMesh(geo, materiales);
  malla.frustumCulled = false;
  // Se dibuja DESPUÉS del mundo y sin escribir en el buffer de profundidad no:
  // con `renderOrder` alto basta para que gane a la niebla del cielo, y el
  // sombreado de profundidad se deja como está para que la espada no se dibuje
  // encima de un bicho que la tape.
  malla.renderOrder = 10;
  ejes.add(malla);

  const nodo = new THREE.Group();
  nodo.name = "arma";
  // ── LOS NOVENTA GRADOS QUE FALTABAN ──────────────────────────────────────
  //
  // El cambio de ejes de este proyecto deja el «adelante» del `.mdl` —la +x de
  // GoldSrc— apuntando a la +x de Three. Y la CÁMARA mira a la −z. O sea que
  // el modelo de vista, colgado de la cámara sin más, sale mirando **a la
  // derecha de la pantalla**: la espada se va al borde derecho y medio brazo
  // se sale del cuadro.
  //
  // No se ve como «está girado»: se ve como «está mal colocado», que es lo que
  // me pareció al mirarlo, y lo que mandó a mirar la posición en vez del giro.
  // Las dos convenciones estaban a la vista desde el 15, una en cada archivo:
  //
  //     bichos.js   i.nodo.rotation.y = Math.atan2(-dz,  dx)   mira a +x
  //     main.js     player.yaw        = Math.atan2(-dx, -dz)   mira a −z
  //
  // Noventa grados exactos. En el mundo no se nota porque los bichos y el mapa
  // comparten convención; en la mano, la cámara trae la otra.
  // Va en un nodo intermedio y no en `nodo`, porque a ése se le copia el giro
  // de la cámara entero en cada fotograma y se lo comería.
  const giro = new THREE.Group();
  giro.rotation.y = Math.PI / 2;
  giro.add(ejes);
  nodo.add(giro);
  nodo.updateMatrixWorld(true);
  malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);
  // NO cuelga de la cámara: el nodo lo coloca `seguir()` y lo dibuja quien
  // tenga el renderizador, en una **segunda pasada con la profundidad
  // limpia**. Eso es lo que hace que el arma no se recorte contra la pared —en
  // GoldSrc el modelo de vista nunca se corta, aunque metas la espada en un
  // muro— y además permite que el arma y el muñeco compartan pasada y se
  // tapen bien entre ellos.

  const mezclador = new THREE.AnimationMixer(nodo);
  let actual = null;

  /**
   * Pone una secuencia. Acepta el NÚMERO, que es como la nombra el script del
   * arma (`const ANIM_ATTACK1 2`), o el nombre.
   *
   * `unaVez` para los ataques: se quedan en el último fotograma en vez de
   * repetirse, que es lo que hace `playviewanim`.
   */
  function pon(cual, { unaVez = false, velocidad = 1 } = {}) {
    const e = clips.get(String(cual ?? "").toLowerCase()) ?? clips.get(String(cual));
    if (!e) return null;
    mezclador.stopAllAction();
    const a = mezclador.clipAction(e.clip);
    a.setLoop(unaVez ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = unaVez;
    a.timeScale = velocidad;
    a.reset().play();
    actual = { nombre: e.seq.nombre, indice: e.seq.indice, unaVez };
    return actual;
  }

  // ── LA MANO IZQUIERDA ES LA DERECHA ESPEJADA ─────────────────────────────
  //
  // No hay un `v_` para cada mano: **el motor espeja el modelo**, y lo hace en
  // el espacio de la VISTA, no del modelo (`StudioSetupRender`,
  // studiomodelrenderer.cpp:2526-2540):
  //
  //     if( FBitSet(curstate.oldbuttons, MSRDR_FLIPPED) ) {
  //       glLoadIdentity();  glScalef(-1,1,1);  glMultMatrixf(mm);
  //       m_DrawStyle = DRAW_BACKFACES;
  //     }
  //
  // y la marca la pone quien dibuja, según la mano:
  //
  //     if( hand == LEFT_HAND ) SetBits(..., MSRDR_FLIPPED);
  //                                            studiomodelrenderer.cpp:1442
  //
  // O sea que un escudo —que va siempre en la izquierda— sale al otro lado del
  // cuadro si no se espeja: se ve como «está en la mano que no es», que es
  // exactamente lo que se veía. Y el espejo invierte el sentido de giro de los
  // triángulos, por eso el motor pasa a dibujar las caras de atrás: sin eso la
  // malla se queda hueca por fuera.
  let espejado = false;
  const espejar = (v) => {
    espejado = Boolean(v);
    nodo.scale.x = espejado ? -1 : 1;
    for (const m of materiales) {
      // `DRAW_BACKFACES`. Los grupos recortados ya van a dos caras y no cambian.
      if (m.side !== THREE.DoubleSide) m.side = espejado ? THREE.BackSide : THREE.FrontSide;
    }
  };

  return {
    nodo, malla, ficha, clips, pon,
    /** Espeja el modelo, que es lo que el motor hace con la mano izquierda. */
    espejar,
    get espejado() { return espejado; },
    /**
     * Lo pone donde el motor pone el modelo de vista: el ojo del jugador como
     * origen y los ángulos de la vista como rotación (`V_CalcRefdef`).
     */
    seguir(camara) {
      nodo.position.copy(camara.position);
      nodo.quaternion.copy(camara.quaternion);
      // El espejo va DESPUÉS de copiar el giro, y en los ejes del nodo, que son
      // los de la cámara: es el `glScalef(-1,1,1)` sobre la matriz de la vista.
      nodo.scale.x = espejado ? -1 : 1;
    },
    get actual() { return actual; },
    get visible() { return nodo.visible; },
    set visible(v) { nodo.visible = v; },
    animar(dt) { mezclador.update(dt); },
    /** La duración de una secuencia en segundos, que hace falta para ajustarla. */
    duracionDe(cual) {
      const e = clips.get(String(cual ?? "").toLowerCase()) ?? clips.get(String(cual));
      return e ? e.clip.duration : 0;
    },
    quitar() { nodo.parent?.remove(nodo); },
  };
}
