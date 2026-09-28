// Arboles y paisaje de fondo. Solo render: nada de esto colisiona ni entra en
// el .map.
//
// Es la mitad decorativa del planteamiento hibrido. El pueblo caminable son
// brushes y lo juzga qbsp; lo que hay detras de la muralla son colinas y
// bosque calculados aqui, que nadie puede pisar. Asi el paisaje no le quita a
// qbsp nada que juzgar, que es lo unico que este experimento no puede perder.

import * as THREE from "three";

// --- ruido determinista ----------------------------------------------------
//
// Con semilla fija, no Math.random(): el fondo tiene que salir igual en cada
// carga o las capturas dejan de poder compararse entre si.

function hash2(x, y) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

/** Ruido en varias octavas, de -1 a 1. */
export function fbm(x, y, octaves = 4) {
  let sum = 0, amp = 1, freq = 1, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise(x * freq + i * 17.3, y * freq - i * 9.1);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

/**
 * Altura del terreno de fondo, en metros.
 *
 * Es cero dentro del pueblo y sube segun se aleja: asi el terreno no asoma por
 * encima del suelo de brushes ni deja un escalon visible en la muralla. La
 * transicion se hace con una curva suave, no con un salto, porque un salto se
 * ve como una grieta alrededor del pueblo.
 */
export function backdropHeight(x, z, inner, outer) {
  // `inner` es medio ancho y medio fondo, no un radio. Con un solo numero el
  // agujero sale cuadrado, y un pueblo rectangular deja dos franjas de vacio
  // por los lados cortos: desde dentro se ve un hueco detras de la muralla,
  // y desde arriba dos barras palidas. Lo destapo una captura aerea.
  const [ix, iz] = Array.isArray(inner) ? inner : [inner, inner];
  const d = Math.max(Math.abs(x) - ix, Math.abs(z) - iz);
  if (d <= 0) return 0;
  const t = Math.min(d / (outer - Math.max(ix, iz)), 1);
  const ease = t * t * (3 - 2 * t);
  const hills = fbm(x / 60, z / 60, 4) * 0.5 + 0.5;
  const ridge = Math.pow(fbm(x / 140 + 5, z / 140 - 3, 3) * 0.5 + 0.5, 1.6);
  // Las cifras son altas a proposito. La muralla del pueblo mide ocho metros:
  // unas colinas de veinte quedan escondidas detras y el paisaje no existe
  // desde dentro, que es el unico sitio desde el que se mira.
  return ease * (10 + hills * 26 + ridge * 120);
}

/** El terreno de fondo: un anillo de malla alrededor del pueblo. */
export function buildTerrain({ inner, outer, step = 8, colour = 0x86a352 }) {
  const side = Math.ceil((outer * 2) / step) + 1;
  const positions = [];
  const indices = [];
  const index = new Map();

  for (let j = 0; j < side; j++) {
    for (let i = 0; i < side; i++) {
      const x = -outer + i * step;
      const z = -outer + j * step;
      index.set(j * side + i, positions.length / 3);
      positions.push(x, backdropHeight(x, z, inner, outer), z);
    }
  }
  for (let j = 0; j < side - 1; j++) {
    for (let i = 0; i < side - 1; i++) {
      // El agujero del centro: donde esta el pueblo no se dibuja terreno, o
      // se veria atravesando el suelo de brushes.
      const cx = -outer + (i + 0.5) * step;
      const cz = -outer + (j + 0.5) * step;
      const [ix, iz] = Array.isArray(inner) ? inner : [inner, inner];
      if (Math.abs(cx) < ix && Math.abs(cz) < iz) continue;
      const a = index.get(j * side + i);
      const b = index.get(j * side + i + 1);
      const c = index.get((j + 1) * side + i);
      const d = index.get((j + 1) * side + i + 1);
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    // flatShading: las caras planas son parte del aspecto, y ademas hacen que
    // las colinas se lean sin necesidad de textura.
    new THREE.MeshLambertMaterial({ color: colour, flatShading: true })
  );
  mesh.name = "terreno";
  mesh.frustumCulled = false;
  return { mesh, triangles: indices.length / 3 };
}

/**
 * Base horizontal de un cartel: hacia donde se abre para mirar a la camara.
 *
 * Es la misma cuenta que hace el shader, aqui aparte para poder comprobarla
 * sin WebGL. Las dos posiciones van en **coordenadas de mundo**, y eso no es
 * un detalle: colgar los carteles de un grupo desplazado hace que el pie este
 * en coordenadas locales mientras cameraPosition sigue siendo de mundo. El
 * cartel se coloca bien -de eso se encarga la matriz- pero se orienta con un
 * vector equivocado, y si sale casi paralelo a la vista el arbol se ve de
 * canto y desaparece. Paso: los arboles del pueblo eran troncos pelados.
 */
export function billboardRight(foot, camera) {
  const dx = camera[0] - foot[0];
  const dz = camera[2] - foot[2];
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return [1, 0, 0];
  return [dz / len, 0, -dx / len];
}

/**
 * Carteles de arbol, en una sola malla instanciada.
 *
 * Las posiciones van en coordenadas de mundo y la malla se cuelga de la escena
 * sin transformar. Ver billboardRight() para por que.
 *
 * Un cartel es un cuadrado que gira para mirar siempre a la camara. Es lo que
 * hacia la referencia y lo que hacia Quake con los objetos: por dos triangulos
 * se ve un arbol entero, y con quince mil arboles eso importa.
 *
 * El giro se hace en el shader de vertices, no en JavaScript: con miles de
 * carteles, girarlos uno a uno en el bucle cuesta mas que dibujarlos.
 */
export function buildBillboards(items, texture, { tint = 0xffffff, sway = 0.012, shade = 0.55, light = 0xffffff, fog } = {}) {
  if (!items.length) return null;
  if (!fog) {
    // La niebla del cartel tiene que ser la MISMA que la de la escena. Tenerla
    // escrita a mano aqui fue un fallo real: la escena calcula su densidad por
    // el tamano del mapa y el cartel se quedo con la de una sala pequena, o
    // sea cuatro veces mas. El bosque salia como un muro morado y parecia una
    // decision de estilo, no un numero pegado.
    throw new Error("los carteles necesitan la niebla de la escena");
  }

  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3)
  );
  geometry.setIndex([0, 1, 2, 0, 2, 3]);

  const base = new Float32Array(items.length * 4); // xyz del pie, w la altura
  const aux = new Float32Array(items.length * 2);  // ancho relativo y semilla
  items.forEach((t, i) => {
    base.set([t.position[0], t.position[1], t.position[2], t.height], i * 4);
    aux.set([t.width ?? 0.8, t.seed ?? hash2(i * 31, i * 17)], i * 2);
  });
  geometry.setAttribute("iBase", new THREE.InstancedBufferAttribute(base, 4));
  geometry.setAttribute("iAux", new THREE.InstancedBufferAttribute(aux, 2));
  geometry.instanceCount = items.length;

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: texture },
      uTime: { value: 0 },
      uSway: { value: sway },
      uTint: { value: new THREE.Color(tint) },
      uShade: { value: shade },
      uLight: { value: new THREE.Color(light) },
      uFogColour: { value: new THREE.Color(fog.color) },
      uFogDensity: { value: fog.density },
    },
    vertexShader: `
      attribute vec4 iBase;
      attribute vec2 iAux;
      uniform float uTime;
      uniform float uSway;
      varying vec2 vUv;
      varying float vDepth;
      varying float vSeed;
      void main() {
        float h = iBase.w;
        float w = h * iAux.x;
        vec3 foot = iBase.xyz;
        // El cartel gira solo alrededor del eje vertical. Si girara tambien
        // hacia arriba, al mirar el arbol desde abajo se le veria tumbarse.
        vec3 toCam = cameraPosition - foot;
        toCam.y = 0.0;
        float len = max(length(toCam), 1e-4);
        vec3 right = vec3(toCam.z, 0.0, -toCam.x) / len;
        float sway = sin(uTime * 1.3 + iAux.y * 40.0) * uSway * h * position.y * position.y;
        vec3 p = foot + right * (position.x * w + sway) + vec3(0.0, position.y * h, 0.0);
        vUv = vec2(position.x + 0.5, position.y);
        vSeed = iAux.y;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vDepth = length(mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uTex;
      uniform vec3 uTint;
      uniform float uShade;
      uniform vec3 uLight;
      uniform vec3 uFogColour;
      uniform float uFogDensity;
      varying vec2 vUv;
      varying float vDepth;
      varying float vSeed;
      void main() {
        vec4 t = texture2D(uTex, vUv);
        // Recorte duro, no mezcla: con transparencia habria que ordenar los
        // miles de carteles cada fotograma, y el recorte ademas es lo que se
        // veia en la epoca.
        if (t.a < 0.5) discard;
        vec3 c = t.rgb * uTint * uLight * (0.8 + 0.4 * vSeed);
        // Un poco mas oscuro por abajo: sin esto el cartel flota, porque no
        // tiene sombra que lo pose en el suelo. Cuanto, depende de lo que sea:
        // un pino alto admite el pie muy oscuro y una mata baja no, porque en
        // una mata el pie es casi toda la mata y sale una bola negra.
        c *= mix(uShade, 1.05, smoothstep(0.0, 0.7, vUv.y));
        float f = 1.0 - exp(-pow(uFogDensity * vDepth, 2.0));
        gl_FragColor = vec4(mix(c, uFogColour, f), 1.0);
        // Sin esto el cartel sale mucho mas oscuro que todo lo demas.
        //
        // Three.js convierte de lineal a sRGB al escribir, pero solo en los
        // shaders que monta el: un ShaderMaterial propio escribe lo que le
        // pongas. Como las texturas SI se decodifican de sRGB al cargarlas,
        // sin esta linea se escriben valores lineales en un framebuffer sRGB
        // y todo el follaje sale como a la mitad de luz. No falla nada: solo
        // parece que los arbustos estan en sombra.
        #include <colorspace_fragment>
      }
    `,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false; // el giro lo hace el shader; Three.js no lo sabe
  // Sin transformar, y que no se pueda cambiar: el shader mezcla el pie del
  // arbol con cameraPosition, que es de mundo, asi que la malla tiene que
  // estar en mundo. Con matrixAutoUpdate a false, moverla no hace nada en vez
  // de torcer las orientaciones en silencio.
  mesh.matrixAutoUpdate = false;
  mesh.name = "carteles";
  return { mesh, material, count: items.length };
}

/**
 * Siembra arboles en el terreno de fondo, con semilla fija.
 *
 * No se siembra ninguno dentro del pueblo: los de dentro vienen del .map, que
 * es donde estan sus troncos macizos. Un arbol de fondo sin tronco dentro del
 * pueblo seria un arbol que se atraviesa.
 */
export function scatterTrees({ inner, outer, count = 1900, minHeight = 7, maxHeight = 15 }) {
  const out = [];
  for (let i = 0; i < count * 4 && out.length < count; i++) {
    const x = (hash2(i, 7) * 2 - 1) * outer;
    const z = (hash2(i, 13) * 2 - 1) * outer;
    const [ix, iz] = Array.isArray(inner) ? inner : [inner, inner];
    if (Math.abs(x) < ix + 6 && Math.abs(z) < iz + 6) continue;
    const y = backdropHeight(x, z, inner, outer);
    // Nada en las cumbres peladas ni en lo casi llano de al lado del pueblo:
    // un bosque uniforme se lee como una alfombra, no como un bosque.
    const density = 0.35 + 0.65 * (fbm(x / 45 + 11, z / 45 - 7, 3) * 0.5 + 0.5);
    if (hash2(i, 29) > density) continue;
    out.push({
      position: [x, y, z],
      height: minHeight + hash2(i, 41) * (maxHeight - minHeight),
      width: 0.7 + hash2(i, 53) * 0.35,
      seed: hash2(i, 61),
    });
  }
  return out;
}
