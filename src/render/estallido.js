// LOS ESTALLIDOS: lo que se ve cuando un proyectil revienta, y nada más.
//
// La regla —a qué escala, cuánto dura, cómo se apaga, de qué color es la luz—
// está en `src/play/fenix.js` y se prueba sin navegador. Esto es lo que se ve:
// la llamarada de la flecha del Fénix, que es un `.mdl` puesto como entidad
// temporal (proj_arrow_phx_cl.script:36, :68-83), y su luz (:46).
//
// Es un CONJUNTO, como las flechas (`src/render/flechas.js`) y por lo mismo:
// montar un `SkinnedMesh` en el fotograma del impacto es un tirón justo cuando
// el jugador está mirando. Cada pieza lleva SUS materiales —la opacidad es de
// cada llamarada, y con uno compartido dos explosiones seguidas se apagarían a
// la vez— y su mezclador, porque ésta sí anima: gira (`sequence 8`,
// `spin_horizontal_fast`).

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { ESPACIO } from "./bsp_escena.js";
import { BASE_COMUN } from "../play/recursos.js";
import { opacidadDelEstallido } from "../play/fenix.js";

/**
 * Monta el conjunto de UN estallido.
 *
 * `ficha` es la fila de `armas.json` (`estallidos`): la `clave` de la carpeta
 * horneada y el nombre de la secuencia. `regla` es la suya de `ESTALLIDOS`.
 */
export async function cargarEstallido(ficha, regla, {
  base = `${BASE_COMUN}/armas`, U = 39.37, cuantas = 4,
} = {}) {
  if (!ficha?.clave || !regla) return null;
  const M = await cargarModelo(ficha.clave, { base });
  if (!M) return null;

  const grupo = new THREE.Group();
  grupo.name = `estallidos:${ficha.id}`;
  const piezas = [];
  const pista = M.clips.get(String(ficha.nombreDeSecuencia ?? "").toLowerCase()) ?? null;

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
      // `rendermode add` y `renderamt 255` (proj_arrow_phx_cl.script:73-74):
      // se SUMA a lo que hay detrás, no escribe profundidad y se ve por las
      // dos caras — una llama no tiene revés.
      return new THREE.MeshBasicMaterial({
        map: t, color: 0xffffff, transparent: true, opacity: 1,
        blending: regla.aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
        depthWrite: false, side: THREE.DoubleSide, fog: false,
      });
    });
    const malla = new THREE.SkinnedMesh(M.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);

    const nodo = new THREE.Group();
    nodo.name = `estallido${n}`;
    nodo.visible = false;
    // `set_current_prop angles $vec(0,90,0)` (:81): el guiño, sobre el eje de
    // arriba, que aquí es el segundo.
    const giro = new THREE.Group();
    giro.rotation.y = (regla.guino ?? 0) * Math.PI / 180;
    giro.add(ejes);
    nodo.add(giro);
    grupo.add(nodo);
    nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    const mezclador = new THREE.AnimationMixer(nodo);
    const accion = pista ? mezclador.clipAction(pista.clip) : null;
    if (accion) { accion.timeScale = regla.ritmo ?? 1; accion.play(); }
    mezclador.update(0);

    // LA LUZ. El radio y el color son del guion; la intensidad y la caída son
    // NUESTRAS, las mismas dos que eligió `src/render/chispas.js` para la otra
    // `cleffect light` del proyecto y por lo mismo: una `dlight` de GoldSrc no
    // tiene candela, tiene radio y caída lineal.
    const luz = new THREE.PointLight(0xffffff, 3, 1, 1);
    luz.visible = false;
    grupo.add(luz);

    piezas.push({ nodo, materiales, mezclador, luz, viva: false, t: 0, vidaDeLuz: 0, escala: 1 });
  }

  let siguiente = 0;
  let lanzados = 0;
  // LA COSTURA PARA MEDIR: una llamarada dura dos segundos y se va apagando, y
  // una foto «con» y otra «sin» no se pueden comparar si entre las dos ha
  // cambiado sola. Congelada no avanza; el juego no la congela nunca.
  let congelado = false;

  /**
   * Enciende uno. `e` es lo que devuelve `estallidoDelFenix`: todo en UNIDADES
   * y con el eje de arriba en el segundo sitio.
   */
  function lanzar(e) {
    let p = piezas.find((x) => !x.viva);
    if (!p) { p = piezas[siguiente % piezas.length]; siguiente++; }
    p.viva = true; p.t = 0; p.escala = e.escala;
    p.nodo.position.set(e.llamarada[0] / U, e.llamarada[1] / U, e.llamarada[2] / U);
    p.nodo.scale.setScalar(e.escala);
    p.nodo.visible = true;
    for (const m of p.materiales) m.opacity = opacidadDelEstallido(0);
    p.mezclador.setTime(0);
    if (e.luz && e.luz.radio > 0) {
      p.luz.color.setRGB(e.luz.color[0] / 255, e.luz.color[1] / 255, e.luz.color[2] / 255);
      p.luz.distance = e.luz.radio / U;
      // DÓNDE, y aquí hay una decisión NUESTRA. El guion la pone en `FX_CENTER`,
      // o sea EN el suelo (:46), y en GoldSrc eso alumbra el suelo de lleno: una
      // `dlight` suma por distancia al plano, sin coseno. La luz de Three es de
      // Lambert, y una luz metida en el plano que alumbra le llega con coseno
      // cero: el suelo de debajo se quedaría a oscuras, justo al revés que en el
      // juego (medido en la sonda: con la luz a ras, ni un píxel del suelo
      // cambia). Se sube lo mismo que la llamarada (`Z_ADJ`, :31-32), que es el
      // único alto que el guion da.
      p.luz.position.set(e.luz.donde[0] / U, (e.luz.donde[1] + (e.alza ?? 0)) / U, e.luz.donde[2] / U);
      p.luz.visible = true;
      p.vidaDeLuz = e.luz.vida;
    } else { p.luz.visible = false; p.vidaDeLuz = 0; }
    lanzados++;
    return p;
  }

  function paso(dt) {
    if (!(dt > 0) || congelado) return;
    for (const p of piezas) {
      if (!p.viva) continue;
      p.t += dt;
      p.mezclador.update(dt);
      // `renderamt = 255 · (1 − transcurrido/duración)` (client/entity.cpp:2084-2088).
      const a = opacidadDelEstallido(p.t);
      for (const m of p.materiales) m.opacity = a;
      // La `dlight` no se desvanece: dura lo que dice y se apaga (`NewLight.die`,
      // client/entity.cpp:1268, con `decay` a cero por el `clrmem`).
      if (p.luz.visible && p.t >= p.vidaDeLuz) p.luz.visible = false;
      if (p.t >= regla.vida) { p.nodo.visible = false; if (!p.luz.visible) p.viva = false; }
    }
  }

  return {
    grupo, lanzar, paso,
    cuantas: piezas.length,
    get hayVivos() { return piezas.some((p) => p.viva); },
    /** Lo que hay ahora mismo, leído de los NODOS y no de la cuenta. Para la sonda. */
    estado() {
      return {
        lanzados,
        conSecuencia: Boolean(pista),
        enLaEscena: Boolean(grupo.parent),
        vivos: piezas.filter((p) => p.viva).map((p) => {
          const w = new THREE.Vector3();
          p.nodo.getWorldPosition(w);
          const caja = new THREE.Box3().setFromObject(p.nodo);
          return {
            t: p.t, visible: p.nodo.visible, posicion: [w.x, w.y, w.z],
            escala: p.nodo.scale.x, opacidad: p.materiales[0]?.opacity ?? null,
            aditivo: p.materiales[0]?.blending === THREE.AdditiveBlending,
            // El tamaño de lo dibujado, en metros: lo que dice si la escala se nota.
            ancho: caja.isEmpty() ? 0 : Math.max(caja.max.x - caja.min.x, caja.max.z - caja.min.z),
            luz: p.luz.visible ? {
              color: [p.luz.color.r, p.luz.color.g, p.luz.color.b].map((v) => Math.round(v * 255)),
              radio: p.luz.distance, posicion: [p.luz.position.x, p.luz.position.y, p.luz.position.z],
            } : null,
          };
        }),
      };
    },
    /** Para la sonda: parar el reloj, y la malla de la primera que esté viva. */
    congelar(si = true) { congelado = Boolean(si); return congelado; },
    get mallaViva() {
      // Viva, se vea o no: la sonda la esconde para la foto y la vuelve a pedir.
      const p = piezas.find((x) => x.viva);
      let m = null;
      p?.nodo.traverse((o) => { if (!m && o.isSkinnedMesh) m = o; });
      return m ? { malla: m, nodo: p.nodo, luz: p.luz } : null;
    },
    quitar() { grupo.parent?.remove(grupo); },
  };
}
