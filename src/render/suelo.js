// LO QUE SE VE DE UN OBJETO TIRADO — el 71.
//
// La regla —cuándo nace, cómo cae, cuándo se tumba, cuánto dura y quién puede
// cogerlo— está en `src/play/suelo.js` y se prueba sin navegador. Esto es lo
// que se ve: un nodo de Three por cosa, con el submodelo que su `game_fall`
// eligió y la postura de estar tirado.
//
// ── Por qué un conjunto por guion y no uno por objeto ─────────────────────
//
// Por lo mismo que las flechas del 55: montar un `SkinnedMesh` cuesta un
// esqueleto nuevo y un `bind`, y hacerlo en el fotograma en que la manzana cae
// del árbol es un tirón justo cuando el jugador está mirando. Así que los
// modelos se cargan al entrar al mapa y los nodos se reparten.
//
// **Eran dos y 114 KB cuando esto se escribió (el 71).** Desde el 75, con lo que
// el jugador puede soltar con la `c`, son **13 y 1,1 MB**: once guiones más, que
// comparten cuatro `.mdl` grandes (`p_weapons1`, `p_weapons2`, `p_misc`...).
// Sigue cargándose todo al entrar y no la primera vez que se suelta algo, por la
// razón de arriba; si un día la lista crece con el botín de los cadáveres habrá
// que mirar esta cuenta otra vez.
//
// ── Lo que NO hace, con la cuenta ─────────────────────────────────────────
//
// No da sombra ni se ilumina con el luxel donde cae: material plano, como las
// flechas y como los bichos. Afecta a los **13**.
//
// No pone colisionador. Un objeto tirado es `SOLID_TRIGGER` en el motor
// (genericitem.cpp:1408), o sea que **no para a nadie**: se le pasa por encima.
// Esto no es un hueco, es la regla.

import * as THREE from "three";
import { cargarModelo } from "./bichos.js";
import { ESPACIO } from "./bsp_escena.js";
import { BASE_COMUN } from "../play/recursos.js";

/**
 * Carga los modelos del suelo de un mapa y devuelve el repartidor.
 *
 * `manifiesto` es `build/msr/suelo.json`. Devuelve `null` si no hay ninguno,
 * que es el caso de Gate City.
 */
export async function cargarSuelo(manifiesto, { base = `${BASE_COMUN}/suelo`, U = 39.37 } = {}) {
  const fichas = (manifiesto?.objetos ?? []).filter((o) => o.clave);
  if (!fichas.length) return null;

  const grupo = new THREE.Group();
  grupo.name = "suelo";
  const modelos = new Map();
  for (const f of fichas) {
    const M = await cargarModelo(f.clave, { base });
    if (M) modelos.set(f.guion, { M, ficha: f });
  }
  if (!modelos.size) return null;

  const puestos = new Map();   // i del objeto -> { nodo, mezclador }

  /** Un nodo nuevo con su esqueleto, su material y su postura de tirado. */
  function montar(guion) {
    const entrada = modelos.get(guion);
    if (!entrada) return null;
    const { M, ficha } = entrada;
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
    // El cambio de ejes de siempre: el `.mdl` viene en ejes de GoldSrc y en
    // unidades, y eso es un giro de −90° sobre X más la escala. Va en un nodo
    // para que el esqueleto sufra el mismo cambio que la malla.
    const ejes = new THREE.Group();
    ejes.rotation.x = -Math.PI / 2;
    ejes.scale.setScalar(1 / U);
    for (const r of raices) ejes.add(r);

    const materiales = M.ficha.grupos.map((g) => {
      const t = M.texturas.get(g.archivo) ?? null;
      if (t) t.colorSpace = ESPACIO;
      const m = new THREE.MeshBasicMaterial({ map: t, color: 0xdddddd });
      if (g.recortado) { m.alphaTest = 0.5; m.side = THREE.DoubleSide; }
      return m;
    });
    const malla = new THREE.SkinnedMesh(M.geo, materiales);
    malla.frustumCulled = false;
    ejes.add(malla);

    const nodo = new THREE.Group();
    nodo.name = `suelo_${guion}`;
    nodo.add(ejes);
    grupo.add(nodo);
    nodo.updateMatrixWorld(true);
    malla.bind(new THREE.Skeleton(huesos), malla.matrixWorld);

    // LA POSTURA DE ESTAR TIRADO, que la nombra el `game_fall` del guion
    // (`playanim apple_floor_idle`). Se pone una vez y no se vuelve a tocar:
    // una manzana en el suelo no anima. Cuando el guion no nombra ninguna
    // —el leño— el motor se queda en la secuencia 0 y aquí también.
    const mezclador = new THREE.AnimationMixer(nodo);
    const e = M.clips.get(String(ficha.animacion ?? "").toLowerCase())
      ?? [...M.clips.values()][0];
    if (e) mezclador.clipAction(e.clip).play();
    mezclador.update(0);
    return { nodo, guion };
  }

  return {
    grupo,
    modelos,
    /** Cuántos modelos distintos se han podido cargar. */
    get n() { return modelos.size; },
    /** Cuántos nodos hay puestos ahora mismo. Se calcula. */
    get puestos() { return puestos.size; },

    /**
     * Coloca —y monta, la primera vez— el nodo de un objeto del mundo.
     *
     * `o` es un `ObjetoSuelto` de `src/play/suelo.js`: su `pos` viene en
     * UNIDADES y sus `angulos` son los del motor. El rumbo (`angles[1]`) gira
     * sobre +Y de la escena y con el mismo signo, igual que un bicho.
     *
     * EL CABECEO también, desde el 75, y **con el signo del revés**: el
     * dibujante de modelos del mod hace `angles[PITCH] = -angles[PITCH];` justo
     * antes de montar la matriz (studiomodelrenderer.cpp:664). Hasta el 71 daba
     * igual, porque todo lo que había en el suelo estaba tumbado y `FallThink`
     * pone el cabeceo a cero. Deja de dar igual con lo soltado: vuela inclinado
     * un tercio de donde mirabas, y si se queda encima de una entidad de brush
     * **no se tumba nunca** y ése es el cabeceo con el que se queda.
     *
     * Orden `YXZ`: primero el rumbo y luego el cabeceo sobre el eje ya girado,
     * que es lo que hace `AngleMatrix`.
     */
    colocar(o) {
      let p = puestos.get(o.i);
      if (!p) {
        p = montar(o.guion);
        if (!p) return null;
        puestos.set(o.i, p);
      }
      p.nodo.position.set(o.pos[0] / U, o.pos[1] / U, o.pos[2] / U);
      p.nodo.rotation.order = "YXZ";
      p.nodo.rotation.y = ((o.angulos[1] ?? 0) * Math.PI) / 180;
      p.nodo.rotation.x = ((-(o.angulos[0] ?? 0)) * Math.PI) / 180;
      return p;
    },

    /** Lo quita de la escena: lo han cogido, o ha caducado. */
    quitar(i) {
      const p = puestos.get(i);
      if (!p) return false;
      grupo.remove(p.nodo);
      puestos.delete(i);
      return true;
    },

    /** Un paso: coloca lo que sigue en el mundo y quita lo que ya no está. */
    tic(objetos) {
      const vivos = new Set();
      for (const o of objetos) { vivos.add(o.i); this.colocar(o); }
      for (const i of [...puestos.keys()]) if (!vivos.has(i)) this.quitar(i);
    },

    /** Dónde está cada nodo, leído del nodo y no de nuestra cuenta. */
    censo() {
      return [...puestos].map(([i, p]) => ({
        i, guion: p.guion,
        posicion: [p.nodo.position.x, p.nodo.position.y, p.nodo.position.z],
        rumbo: (p.nodo.rotation.y * 180) / Math.PI,
        cabeceo: (p.nodo.rotation.x * 180) / Math.PI,
      }));
    },
  };
}
