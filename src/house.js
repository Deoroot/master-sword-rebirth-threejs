// La ficha de una casa entera, en el estudio.
//
// Misma escena, misma luz y misma camara que la ficha de pieza suelta, para que
// las capturas de las dos se puedan poner una al lado de otra y digan algo.
//
// La pagina no decide nada: expone window.casa y espera. Quien falla con exit 1
// es tools/house.mjs.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createStudio, buildFromPlan, inspectObject, mallaGenerada, atlasDe } from "./kit/studio.js";
import { casa } from "./kit/casas.js";
import { planBoca } from "./kit/boca.js";

const canvas = document.getElementById("view");
const studio = createStudio(canvas, { metros: 32 });
studio.resize(canvas.clientWidth || 640, canvas.clientHeight || 640);

const nombre = new URLSearchParams(location.search).get("casa") ?? "casa-simple";

const state = { ready: false, error: null, nombre, plan: null, medido: null };

try {
  // La boca no es una casa: lleva roca generada ademas de piezas del kit, asi
  // que se monta aparte y se retrata con la misma camara.
  const plan = nombre === "boca"
    ? { ...planBoca(), titulo: "Boca de la mazmorra", ancho: 3, fondo: 3, plantas: 0,
        caja: { min: [0, -5, -12], max: [12, 1, 0] } }
    : casa(nombre);
  state.plan = {
    titulo: plan.titulo,
    avisos: plan.avisos,
    caja: plan.caja,
    ancho: plan.ancho,
    fondo: plan.fondo,
    plantas: plan.plantas,
    piezas: plan.piezas,
  };

  const group = await buildFromPlan(new GLTFLoader(), plan.piezas);
  // La roca va DESPUES de las piezas, para poder pedirle prestado el atlas a
  // una de ellas en vez de volver a cargar el mismo PNG.
  if (plan.roca) {
    const roca = mallaGenerada(plan.roca, atlasDe(group));
    roca.userData.papel = "roca";
    roca.userData.pieza = "generada";
    group.add(roca);
  }
  studio.scene.add(group);
  state.grupo = group;

  const m = inspectObject(group);
  state.medido = {
    box: m.boxArray,
    triangles: m.triangles,
    meshes: m.meshes,
    texturedMeshes: m.texturedMeshes,
    materials: m.materials,
  };
  state.box = m.box;
  state.ready = true;
} catch (e) {
  state.error = String(e?.message ?? e);
  state.ready = true; // listo para ser juzgado, aunque lo que diga sea "fallo"
}

window.casa = {
  get ready() {
    return state.ready;
  },
  get stats() {
    return {
      nombre: state.nombre,
      error: state.error,
      plan: state.plan,
      medido: state.medido,
    };
  },
  look(yaw, pitch) {
    studio.look(state.box, yaw, pitch);
  },
  setHelpers(on) {
    studio.setHelpers(on);
  },
  /** La sonda de control: sin la casa, el estudio tiene que medir cero. */
  setCasa(on) {
    if (state.grupo) state.grupo.visible = on;
    studio.render();
  },
  /** Enciende solo un papel -tejado, muro, puerta- para ver quien tapa a quien. */
  soloPapel(prefijo) {
    if (!state.grupo) return;
    for (const hijo of state.grupo.children) {
      hijo.visible = prefijo === null || (hijo.userData.papel ?? "").startsWith(prefijo);
    }
    studio.render();
  },
};
