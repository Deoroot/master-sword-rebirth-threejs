// El estudio: la escena neutra donde se retrata una pieza o una casa.
//
// Es comun a las dos fichas a proposito. Si la pieza suelta y la casa se
// retrataran con camaras o luces distintas, comparar sus capturas no diria nada
// sobre las piezas, diria que se han elegido encuadres distintos -que es el
// mismo error que ya esta anotado en tools/shot.mjs sobre el pueblo.
//
// Tres cosas que no son decorado:
//
//   la rejilla   es de 1 m, la subdivision del propio kit, con las lineas de
//                4 m mas claras. Una pieza de una celda tiene que tapar un
//                cuadro grande. Eso lo comprueba un ojo de un vistazo.
//   la vara      1,75 m, un hombre. La escala es el error mas facil de cometer
//                con glTF y el mas dificil de ver sin referencia: una puerta de
//                tres metros parece normal en una foto vacia.
//   el buffer    preserveDrawingBuffer, porque a esta escena se le leen los
//                pixeles. Sin el, un readPixels que llegue despues del
//                intercambio de buffer lee negro y la medida sale disparatada.

import * as THREE from "three";

export const FONDO = 0x2a2a33;

export function createStudio(canvas, { metros = 24 } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(FONDO);

  // Luz plana a proposito: con hemisferica mas una direccional suave se lee la
  // forma sin que las sombras inventen detalle que el modelo no tiene.
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3b3b46, 2.0));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
  sun.position.set(4, 8, 6);
  scene.add(sun);

  const helpers = new THREE.Group();
  const fina = new THREE.GridHelper(metros, metros, 0x8a8ab0, 0x4a4a58);
  helpers.add(fina);
  const celdas = new THREE.GridHelper(metros, metros / 4, 0xc9c9e8, 0xc9c9e8);
  celdas.position.y = 0.002; // por encima de la fina, para que no parpadeen
  helpers.add(celdas);
  const humano = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 1.75, 0.25),
    new THREE.MeshBasicMaterial({ color: 0xc8443a })
  );
  humano.position.set(-1.2, 1.75 / 2, 1.2);
  helpers.add(humano);
  scene.add(helpers);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);

  /**
   * Encuadra una caja desde un angulo. La distancia sale del radio de la caja y
   * del campo de vision, no de tantear: asi una pieza de medio metro y una casa
   * de diez salen igual de encuadradas y sus fichas se pueden comparar.
   */
  function look(box, yawDeg, pitchDeg) {
    const centre = box.getCenter(new THREE.Vector3());
    const radius = box.getSize(new THREE.Vector3()).length() / 2;
    const dist = Math.max(2.5, (radius * 1.9) / Math.tan((camera.fov * Math.PI) / 360));
    const yaw = (yawDeg * Math.PI) / 180;
    const pitch = (pitchDeg * Math.PI) / 180;
    camera.position.set(
      centre.x + dist * Math.cos(pitch) * Math.sin(yaw),
      centre.y + dist * Math.sin(pitch),
      centre.z + dist * Math.cos(pitch) * Math.cos(yaw)
    );
    camera.lookAt(centre);
    camera.aspect = canvas.width / canvas.height;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  return {
    renderer,
    scene,
    camera,
    look,
    setHelpers(on) {
      helpers.visible = on;
      renderer.render(scene, camera);
    },
    resize(w, h) {
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    },
    render() {
      renderer.render(scene, camera);
    },
  };
}

/**
 * Mide una malla cargada: caja, triangulos y estado de sus materiales.
 *
 * Que el material tenga mapa es la comprobacion que separa "cargo el modelo" de
 * "cargo el modelo Y su textura": sin ella, una pieza gris pasa por buena y el
 * fallo aparece en el pueblo entero.
 */
export function inspectObject(root) {
  const box = new THREE.Box3().setFromObject(root);
  const mats = new Map();
  let triangles = 0;
  let meshes = 0;
  let texturedMeshes = 0;
  root.traverse((o) => {
    if (!o.isMesh) return;
    meshes++;
    const g = o.geometry;
    triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (m.map) texturedMeshes++;
      mats.set(m.uuid, {
        alphaMode: m.transparent ? "BLEND" : m.alphaTest > 0 ? "MASK" : "OPAQUE",
        alphaTest: m.alphaTest,
        doubleSided: m.side === THREE.DoubleSide,
        hasMap: !!m.map,
        magFilter: m.map ? (m.map.magFilter === THREE.NearestFilter ? "NEAREST" : "LINEAR") : null,
        image: m.map?.image ? [m.map.image.width, m.map.image.height] : null,
      });
    }
  });
  return {
    box,
    boxArray: { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() },
    triangles,
    meshes,
    texturedMeshes,
    materials: [...mats.values()],
  };
}

/**
 * Convierte los arrays de una malla generada en geometria de Three.js.
 *
 * La textura se pide prestada al propio kit en vez de cargarla aparte: la roca
 * usa un recuadro del atlas `bauerhaus`, el mismo archivo que ya han cargado las
 * piezas. Cargarlo otra vez seria una segunda copia en la GPU de lo unico que el
 * importador se molesto en dejar en una sola.
 */
export function mallaGenerada(arrays, mapa) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(arrays.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(arrays.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(arrays.uv, 2));
  g.setIndex(arrays.idx);
  const material = new THREE.MeshStandardMaterial({
    map: mapa ?? null,
    color: mapa ? 0xffffff : 0x8a8279,
    metalness: 0,
    roughness: 1,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, material);
}

/** Saca el mapa del atlas de una pieza ya cargada, sin volver a bajarlo. */
export function atlasDe(grupo) {
  let mapa = null;
  grupo.traverse((o) => {
    if (!mapa && o.isMesh && o.material?.map) mapa = o.material.map;
  });
  return mapa;
}

/**
 * Saca los triangulos de un grupo ya colocado, en coordenadas de mundo.
 *
 * Es lo que le falta al navegador para que Rapier pueda chocar con el kit. En
 * Node esto no hace falta -`tools/bake.mjs` lee los `.glb` binarios y devuelve
 * los vertices ya transformados-, pero aqui las piezas llegan como objetos de
 * Three.js con su matriz, asi que hay que aplicarla.
 *
 * `updateWorldMatrix` antes de leer no es opcional: un grupo recien construido
 * tiene las matrices sin actualizar hasta el primer render, y sin esto salen
 * TODAS las piezas apiladas en el origen. No da error: da un pueblo entero
 * amontonado en la esquina noroeste y un jugador que choca con el aire.
 */
export function mallaDeGrupo(root) {
  root.updateWorldMatrix(true, true);
  const pos = [];
  const idx = [];
  const v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const g = o.geometry;
    const base = pos.length / 3;
    const a = g.attributes.position;
    for (let i = 0; i < a.count; i++) {
      v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld);
      pos.push(v.x, v.y, v.z);
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
    } else {
      for (let i = 0; i < a.count; i++) idx.push(base + i);
    }
  });
  return { pos, idx };
}

/**
 * Junta varias mallas sueltas en el unico trimesh que Rapier acepta.
 *
 * Cada parte trae sus indices contados desde su propio cero, asi que hay que
 * correrlos por el numero de vertices que ya habia. Olvidarlo no da error: da
 * una malla de colision con triangulos que unen vertices de piezas distintas,
 * o sea un mundo de telaranas invisibles.
 */
export function fundirMallas(partes) {
  let nv = 0;
  let ni = 0;
  for (const p of partes) { nv += p.pos.length; ni += p.idx.length; }
  const positions = new Float32Array(nv);
  const indices = new Uint32Array(ni);
  let ov = 0;
  let oi = 0;
  for (const p of partes) {
    positions.set(p.pos, ov);
    for (let k = 0; k < p.idx.length; k++) indices[oi + k] = p.idx[k] + ov / 3;
    ov += p.pos.length;
    oi += p.idx.length;
  }
  return { positions, indices, triangleCount: ni / 3, vertexCount: nv / 3 };
}

/**
 * Carga las piezas de un plano y las coloca.
 *
 * Cada .glb se carga UNA vez y se clona: el kit entero comparte un punado de
 * texturas, y volver a cargarlas por cada casa seria pagar en memoria de GPU lo
 * mismo que el importador acaba de ahorrar en disco.
 */
export async function buildFromPlan(loader, piezas) {
  const cache = new Map();
  const group = new THREE.Group();
  for (const p of piezas) {
    if (!cache.has(p.pieza)) {
      cache.set(
        p.pieza,
        new Promise((resolve, reject) =>
          loader.load(`/kit/${p.pieza}.glb`, (g) => resolve(g.scene), undefined, reject)
        )
      );
    }
    const original = await cache.get(p.pieza);
    const copia = original.clone(true);
    copia.position.set(p.pos[0], p.pos[1], p.pos[2]);
    copia.rotation.y = p.giro ?? 0;
    copia.userData.papel = p.papel;
    copia.userData.pieza = p.pieza;
    group.add(copia);
  }
  return group;
}
