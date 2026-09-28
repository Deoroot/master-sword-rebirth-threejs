// El banco de fotos de una pieza suelta del kit.
//
// Existe por la regla que costo mas cara del experimento 02: hay cosas que solo
// se ven mirando. Pero una captura suelta tampoco sirve de mucho -"se ve algo"
// no es un veredicto-, asi que esta escena esta montada para que la foto sea
// medible:
//
//   - El suelo es una rejilla de 1 m, que es la subdivision del propio kit. Una
//     pieza de 4 m tiene que tapar cuatro cuadros. Eso lo comprueba un ojo en un
//     segundo y lo comprueba tools/piece.mjs con numeros.
//   - Hay una vara roja de 1.75 m -un hombre- al lado. La escala es el error
//     mas facil de cometer con glTF y el mas dificil de ver sin referencia: una
//     puerta de tres metros parece perfectamente normal en una foto vacia.
//   - La camara no se coloca a ojo. Se encuadra desde la caja que devuelve el
//     propio cargador, asi que la pieza sale igual de grande en la foto sea cual
//     sea su tamano real, y dos fichas se pueden comparar.
//
// La pagina no decide nada: expone window.piece y espera. Quien decide es
// tools/piece.mjs, que es quien puede fallar con exit 1.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const canvas = document.getElementById("view");
// preserveDrawingBuffer porque esta pagina existe para que le lean los pixeles.
// Sin esto, un readPixels que llega despues de que el compositor haya
// intercambiado el buffer lee NEGRO, y negro no es el color del fondo, asi que
// cuenta como pieza en todos los pixeles: la medida sale 100 % de silueta para
// un barril de un metro. Paso de verdad, y la unica razon de que se viera es
// que 100 % es absurdo; con un 60 % nadie se habria enterado.
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
renderer.setPixelRatio(1);
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a2a33);

// Luz plana a proposito. Una pieza mal iluminada se lee mal y se culpa a la
// pieza; con hemisferica mas una direccional suave se ve la forma sin que las
// sombras inventen detalle que el modelo no tiene.
scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x3b3b46, 2.0));
const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
sun.position.set(4, 8, 6);
scene.add(sun);

// Rejilla de 1 m, 24x24 m. Las lineas cada 4 m son mas claras: son las celdas.
const grid = new THREE.GridHelper(24, 24, 0x8a8ab0, 0x4a4a58);
scene.add(grid);
const cells = new THREE.GridHelper(24, 6, 0xc9c9e8, 0xc9c9e8);
cells.position.y = 0.002; // por encima de la fina, para que no parpadeen
scene.add(cells);

// La vara humana: 1.75 m. No es decorado, es la unidad.
const human = new THREE.Mesh(
  new THREE.BoxGeometry(0.4, 1.75, 0.25),
  new THREE.MeshBasicMaterial({ color: 0xc8443a })
);
human.position.set(-1.2, 1.75 / 2, 1.2);
scene.add(human);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);

const params = new URLSearchParams(location.search);
const name = params.get("glb") ?? "plaster_wall";

const state = {
  ready: false,
  error: null,
  name,
  /** Medido del objeto cargado, no de la lista de piezas: si el cargador lo
   *  escala o lo mueve, se entera aqui y no tres pasos despues. */
  box: null,
  triangles: 0,
  meshes: 0,
  materials: [],
  texturedMeshes: 0,
};

let loaded = null;

const loader = new GLTFLoader();
loader.load(
  `/kit/${name}.glb`,
  (gltf) => {
    loaded = gltf.scene;
    scene.add(gltf.scene);

    const box = new THREE.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new THREE.Vector3());
    const mats = new Map();
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      state.meshes++;
      const g = o.geometry;
      state.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        // Que el material tenga mapa es la comprobacion que separa "cargo el
        // modelo" de "cargo el modelo Y su textura". Sin ella, una pieza gris
        // pasa por buena y el fallo aparece en el pueblo entero.
        if (m.map) state.texturedMeshes++;
        mats.set(m.uuid, {
          alphaMode: m.transparent ? "BLEND" : m.alphaTest > 0 ? "MASK" : "OPAQUE",
          alphaTest: m.alphaTest,
          doubleSided: m.side === THREE.DoubleSide,
          hasMap: !!m.map,
          // El filtro importa para el aspecto PS1: si sale lineal, el pixel se
          // desdibuja y el kit deja de parecerse a si mismo.
          magFilter: m.map ? (m.map.magFilter === THREE.NearestFilter ? "NEAREST" : "LINEAR") : null,
          image: m.map?.image ? [m.map.image.width, m.map.image.height] : null,
        });
      }
    });

    state.box = {
      min: box.min.toArray(),
      max: box.max.toArray(),
      size: size.toArray(),
    };
    state.materials = [...mats.values()];
    state.ready = true;
  },
  undefined,
  (err) => {
    state.error = String(err?.message ?? err);
    state.ready = true; // listo para ser juzgado, aunque lo que diga sea "fallo"
  }
);

/** Encuadra la pieza desde un angulo, sin numeros escritos a mano. */
function look(yawDeg, pitchDeg) {
  const box = new THREE.Box3(
    new THREE.Vector3(...state.box.min),
    new THREE.Vector3(...state.box.max)
  );
  const centre = box.getCenter(new THREE.Vector3());
  const radius = box.getSize(new THREE.Vector3()).length() / 2;
  // La distancia sale del radio y del campo de vision, no de tantear: asi una
  // pieza de 8 m y una de 0.5 m salen igual de encuadradas y sus fichas se
  // pueden poner una al lado de la otra.
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

function resize(w, h) {
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

window.piece = {
  get ready() {
    return state.ready;
  },
  get stats() {
    return {
      name: state.name,
      error: state.error,
      box: state.box,
      triangles: state.triangles,
      meshes: state.meshes,
      materials: state.materials,
      texturedMeshes: state.texturedMeshes,
    };
  },
  look,
  resize,
  /** Oculta la rejilla y la vara: para medir la silueta de la pieza sola. */
  setHelpers(on) {
    grid.visible = on;
    cells.visible = on;
    human.visible = on;
    renderer.render(scene, camera);
  },
  /** Oculta la pieza. Es la sonda de control: con el estudio vacio la silueta
   *  tiene que dar cero. Si da otra cosa, lo que se estaba midiendo no era la
   *  pieza, y ninguna cifra de esta ficha vale. */
  setPiece(on) {
    if (loaded) loaded.visible = on;
    renderer.render(scene, camera);
  },
};
