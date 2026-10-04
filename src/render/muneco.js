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
//
// CORRECCIÓN DEL 101: lo de arriba ya no es verdad, y la razón que daba era
// falsa. No hacen falta puntos de anclaje: `RenderGearItem` ata cada objeto con
// `AttachTo` (clrenderent.cpp:329), que casa HUESOS POR NOMBRE. Desde el 101 el
// muñeco lleva lo que llevas: `vestir()` aquí abajo, la regla en
// `src/play/equipovisto.js` y el cuelgue en `src/render/equipo3d.js`. Y NO
// esconde el cuerpo debajo de la coraza, como tampoco el del motor
// (clrenderent.cpp:397-412 le pisa el `body` con el género cada fotograma).

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { enEscenaDe } from "./equipo3d.js";
import { ESPACIO } from "./bsp_escena.js";

import { BASE_COMUN } from "../play/recursos.js";
const BASE_POR_DEFECTO = BASE_COMUN;
/** `INSET_SCALE` (clrender.h:34). El 0,02 de antes está comentado al lado. */
export const ESCALA = 0.026;

/** Lo que se aparta del ojo, en unidades: `forward * 4.7 + up * -3.1`. */
export const DESPLAZAMIENTO = { adelante: 4.7, arriba: -3.1 };

/**
 * Monta el muñeco con el modelo del género que se le pida.
 *
 * `manifiesto` es `build/msr/cuerpos.json`, el mismo que usa la hoja de
 * personaje: el modelo es `human/reference.mdl` con el submodelo del género, y
 * las animaciones las nombra `global.script`.
 */
export async function cargarMuneco(manifiesto, {
  base = BASE_POR_DEFECTO, genero = "male", U = 39.37,
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
  /**
   * `playanim <modo> <nombre>`, y **el modo importa** desde el 85.
   *
   * Hasta entonces esto ponía siempre `LoopRepeat`, que es lo correcto para las
   * tres posturas que le pedía el bucle —`run`, `idle`, `attention`— y no para
   * las del menú del jugador:
   *
   *   `once`  MONSTER_ANIM_ONCE: se reproduce y vuelve al reposo. Un
   *           asentimiento en bucle es un personaje diciendo «sí» para siempre.
   *   `hold`  MONSTER_ANIM_HOLD: se queda en la última postura. Sentarse en
   *           bucle es levantarse y volver a sentarse cada dos segundos — que es
   *           exactamente lo que le pasó a la hoja de personaje en el 48, con su
   *           comentario en `src/render/cuerpo.js:388-398`.
   *                                            npcscript.cpp:1512-1519
   *
   * `clampWhenFinished` es lo que sostiene el último fotograma, y hace falta con
   * los dos: sin él, una animación de un solo pase deja el esqueleto donde el
   * mezclador quiera.
   */
  let accion = null;
  let modoActual = "move";
  function pon(nombre, modo = "move") {
    const e = clips.get(String(nombre ?? "").toLowerCase());
    if (!e || actual === e) return actual;
    mezclador.stopAllAction();
    const a = mezclador.clipAction(e.clip);
    const unaVez = modo === "once" || modo === "hold";
    a.setLoop(unaVez ? THREE.LoopOnce : THREE.LoopRepeat, unaVez ? 1 : Infinity);
    a.clampWhenFinished = unaVez;
    a.reset().play();
    accion = a;
    modoActual = modo;
    // EL 82, EN LA OTRA PIEZA. Un mezclador al que se le paran todas las
    // acciones devuelve el esqueleto a su POSE DE ENLACE, y aquí no se notaba
    // porque el bucle llama a `animar(dt)` justo después de `pon`. Pero eso es
    // una propiedad de quien llama, no de esta función: en cuanto alguien la use
    // sin animar después, el muñeco sale un fotograma sin animar. Ver
    // `doc/PARPADEO_82.md` y `aplicarAnimacion` en `src/render/bichos.js`.
    mezclador.update(0);
    actual = e;
    return e;
  }
  pon(manifiesto.animaciones?.conArma ?? "idle");

  const adelante = new THREE.Vector3();
  const arriba = new THREE.Vector3();

  /** Lo que `Equipo3D.vestir` necesita de un cuerpo. */
  const destino = { ejes, huesos, ficha, malla };

  return {
    nodo, malla, ficha, clips, pon,
    /**
     * EL 101: le cuelga el equipo. `piezas` sale de `piezasConCuerpo`.
     * Devuelve lo colgado y lo que falta, con su porqué.
     */
    vestir(equipo3d, piezas = []) { return equipo3d.vestir(destino, piezas); },
    /** Lo que lleva colgado AHORA, para la sonda: se lee de la escena, no de la regla. */
    get equipo() {
      return (destino._equipo ?? []).map((c) => ({
        id: c.id, clave: c.clave, cuerpo: c.cuerpo, donde: c.donde, triangulos: c.triangulos,
        enEscena: Boolean(c.malla && c.malla.parent === ejes),
        huesosCasados: c.malla?.userData.casados ?? 0,
      }));
    },
    get faltaDeEquipo() { return destino._faltaDeEquipo ?? []; },
    /** Las mallas de equipo que cuelgan de sus ejes AHORA, leídas del grafo. */
    get equipoEnEscena() { return enEscenaDe(destino); },
    /** Las mallas colgadas, para que la sonda las esconda y cuente píxeles. */
    get mallasDeEquipo() { return (destino._equipo ?? []).filter((c) => !c.esCuerpo).map((c) => c.malla).filter(Boolean); },
    get animacion() { return actual?.seq?.nombre ?? null; },
    /**
     * ¿ESTÁ SONANDO TODAVÍA UNA ANIMACIÓN DE UN SOLO PASE? — el 85.
     *
     * Hace falta porque el bucle de dibujo le pide una postura **cada
     * fotograma**, y un `playanim once` tiene que poder acabar. Sin esto el
     * asentimiento duraba un fotograma y el muñeco se quedaba en `idle`: medido
     * en la primera pasada de `sonda:menujugador85`, que leyó «el muñeco tiene
     * idle» con el estado diciendo `player_nodno`. Es el fallo que el 80 encontró
     * en el ataque de los bichos, en otra pieza y con la misma forma.
     *
     * `hold` NO entra: ésa se sostiene para siempre y quien la suelta es
     * `Emociones.postura()`. Aquí sólo se pregunta por `once`, que es la que
     * vuelve sola al reposo cuando termina (MONSTER_ANIM_ONCE,
     * npcscript.cpp:1515-1517).
     */
    get deUnPase() {
      if (modoActual !== "once" || !accion) return false;
      return accion.time < accion.getClip().duration - 1e-3;
    },
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
