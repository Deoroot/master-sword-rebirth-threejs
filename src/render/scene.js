// La escena de Three.js. Es la unica parte que necesita un navegador.
//
// De la referencia visual se llevan dos cosas, que son las que el usuario
// eligio: el render a baja resolucion escalado a lo bruto, y la niebla con su
// paleta. La iluminacion por shader propio de la referencia se deja fuera a
// proposito: la sonda minima no la necesita y cada capa de por medio hace mas
// dificil el arnes de verificacion, que es el activo caro.

import * as THREE from "three";

import { meshBounds } from "../map/geometry.js";

// Paleta. La niebla es el color de la referencia; el resto son colores planos
// por textura, a la espera de las texturas de verdad del experimento 02.
export const PALETTE = {
  fog: 0x8d8db6,
  ambient: 0x5a5a7a,
  sky: 0xb9c2e8,
  ground: 0x53523f,
  textures: {
    floor01: 0x8c8375,
    wall01: 0x6f6a63,
    ceil01: 0x4e4a52,
    door01: 0xb07840,
    default: 0x7a7a7a,
  },
};

// La niebla de Three.js (FogExp2) usa 1 - exp(-(densidad*d)^2), que es la
// misma formula de la referencia.
//
// La densidad NO es una constante. Alli era 0,00085 para un valle de dos
// kilometros; una sala de veinte metros pide cuarenta veces mas. Con una cifra
// fija, el mapa para el que se calibro se ve bien y todos los demas se ven mal
// -y «mal» aqui es que un pueblo entero sale lavado de lila-, asi que se
// calcula a partir del tamano del mapa.
//
// El 1,2 sale de la formula: a distancia d con densidad 1,2/d la niebla tapa
// el 76 %. O sea, el fondo del mapa se ve, pero lejos.
export const FOG_REACH = 1.2;

export function fogDensityFor(mesh) {
  const { min, max } = meshBounds(mesh);
  const far = Math.hypot(max[0] - min[0], max[2] - min[2]);
  return far > 0 ? FOG_REACH / far : 0.035;
}

// Iluminacion. Las cifras estan puestas mirando las capturas de tools/shot.mjs,
// no adivinando: con la intensidad por defecto de Three.js el mapa sale negro.
export const LIGHT = {
  // El sol es lo que hace que esto se lea como un dia y no como un sotano.
  // Sin el, con solo ambiente y farolas, todas las caras de una casa reciben
  // lo mismo y la casa se ve como una silueta plana: no hay nada que diga
  // cual es la fachada y cual el costado.
  sun: 2.9,
  sunColour: 0xfff0d0,
  sunDirection: [0.45, 0.78, 0.44], // de donde viene, normalizado al usarlo

  // El hemisferico es el cielo: es lo que ilumina las fachadas que no ven el
  // sol. Con el bajo, medio pueblo queda en negro a mediodia, que es lo que
  // pasaba. El ambiente puro sigue bajo, porque ese si lava las texturas: no
  // tiene direccion y le da lo mismo a todas las caras.
  hemisphere: 1.0,
  ambient: 0.16,
  colour: 0xffd9a8,
  candela: 30, // para una luz de 'light 300'
  decay: 1.4,
};

// Resolucion interna, en pixeles de ancho. El canvas se estira por CSS con
// image-rendering: pixelated, que es de donde sale el aspecto de la captura.
export const INTERNAL_WIDTH = 320;

/** BufferGeometry a partir de la malla del cargador, con un grupo por textura. */
export function meshGeometry(mesh) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(mesh.normals, 3));
  if (mesh.uvs?.length) {
    geometry.setAttribute("uv", new THREE.BufferAttribute(mesh.uvs, 2));
  }

  // Los indices se reordenan por grupo para que cada material dibuje un tramo
  // contiguo. El orden de los grupos ya viene estable del cargador.
  const indices = [];
  const groups = [];
  for (const g of mesh.groups) {
    groups.push({ start: indices.length, count: g.indices.length, texture: g.texture });
    indices.push(...g.indices);
  }
  geometry.setIndex(indices);
  groups.forEach((g, i) => geometry.addGroup(g.start, g.count, i));
  geometry.computeBoundingSphere();
  return { geometry, order: groups.map((g) => g.texture) };
}

/**
 * Carga las texturas que pide un nivel, de /textures/<nombre>.png.
 *
 * El filtro es lo que da el aspecto retro, y no es una decision estetica
 * suelta: con 128 px y filtro nearest al ampliar, el pixel se ve gordo, que es
 * lo que hacia una PS1. Al reducir si se usan mipmaps, porque sin ellos una
 * pared lejana en un fotograma de 320 px hierve, y eso no es retro, es ruido.
 *
 * Una textura que no se puede cargar no se ignora: se queda anotada en
 * `missing`, porque una cara con textura perdida sale gris y parece geometria
 * mal hecha en vez de un archivo que falta.
 */
export async function loadTextures(names) {
  const THREE_ = THREE;
  const loader = new THREE_.TextureLoader();
  const textures = new Map();
  const missing = [];
  await Promise.all(
    names.map(
      (name) =>
        new Promise((resolve) => {
          loader.load(
            `textures/${name}.png`,
            (tex) => {
              tex.wrapS = tex.wrapT = THREE_.RepeatWrapping;
              tex.magFilter = THREE_.NearestFilter;
              tex.minFilter = THREE_.NearestMipmapLinearFilter;
              tex.generateMipmaps = true;
              tex.colorSpace = THREE_.SRGBColorSpace;
              tex.anisotropy = 1;
              textures.set(name, tex);
              resolve();
            },
            undefined,
            () => {
              missing.push(name);
              resolve();
            }
          );
        })
    )
  );
  return { textures, missing };
}

/** Construye la escena completa de un nivel ya cargado. */
/**
 * Lo que cambia cuando el mundo está bajo tierra.
 *
 * No es un ajuste de gusto: es la consecuencia de la medida. Arriba, el sol lo
 * enseña todo y la luz solo dice la hora; en una cueva **lo que está iluminado
 * es lo que existe**, y el reparto de faroles ES el plano. Dejar el sol y el
 * hemisférico puestos bajo tierra enseña el jharro entero desde cualquier punto,
 * y entonces los cincuenta y ocho faroles que se repartieron con dos densidades
 * medidas no deciden nada: son adorno.
 *
 * Así que aquí el sol se apaga, el hemisférico baja a un rescoldo —para que una
 * pared en sombra no sea un agujero negro— y la niebla se calibra al alcance del
 * farol, no al tamaño del mapa: en un sitio de noventa metros de largo con luces
 * de diez, ver el fondo es ver lo que no se puede ver.
 */
export const BAJO_TIERRA = {
  niebla: 0x0f0c0a,
  ambiente: 0x2a2018,
  sol: 0,
  hemisferio: 0.08,
  ambienteIntensidad: 0.10,

  /**
   * La caída de la luz, que es lo que decidió si el jharro se puede jugar.
   *
   * Con los valores de Corinth —decaimiento 1,4 y el radio medido como
   * `distance`— el pasillo salía NEGRO a diez metros del farol, y la sonda de
   * cobertura decía que se veía el 96 % de la pantalla, porque bajo tierra la
   * niebla es casi negra y la roca sin luz también. Lo vio el ojo.
   *
   * Son dos cosas a la vez:
   *
   *   la ventana  Three.js multiplica por (1 − (d/D)⁴)², que a nueve de cada
   *               diez metros del radio ya ha recortado el 96 % de la luz. O sea
   *               que un farol con `distance` igual a su alcance medido NO
   *               alcanza su alcance medido, ni de lejos. Se le da el doble de
   *               radio para que la ventana no muerda donde el diseño dice que
   *               todavía hay que ver.
   *   la caída    GoldSrc hornea sus mapas de luz con caída LINEAL hasta el
   *               radio, no con la cuadrática de la luz física. Gate City está
   *               iluminado así, y sus 10,6 m de p90 son de ese modelo: copiar
   *               la proporción y no el modelo es medir con otra vara.
   */
  decaimiento: 1.0,
  /**
   * Cuánto se le ensancha el radio a un farol respecto de su alcance declarado,
   * y cuánta luz se le quita a cambio.
   *
   * Con 2,0 y la candela de Corinth el pasillo dejaba de estar negro —bien— y la
   * caverna salía LAVADA: brillo mediano 185 de 255, todo iluminado por igual y
   * ni una sombra. O sea que se perdía justo lo que hace legible una cueva, que
   * es el contraste, y se perdía por arreglar lo contrario. En el pueblo hay un
   * farol cada 48 m², así que al doblarles el radio a los cincuenta y ocho se
   * solapan todos con todos.
   *
   * Los dos números salen de un criterio escrito y comprobado en
   * `tools/jharro_shot.mjs`: ninguna vista por debajo del 25 % de pantalla
   * visible, ninguna con el brillo mediano por encima de 200 —eso es quemado— y
   * el pueblo más claro que la cueva.
   */
  radio: 1.5,
  candela: 18,
};

export function buildScene(level, textures = new Map(), { bajoTierra = false, alcance = 0 } = {}) {
  const scene = new THREE.Scene();
  const nieblaColor = bajoTierra ? BAJO_TIERRA.niebla : PALETTE.fog;
  // Bajo tierra la niebla se calibra al alcance de un farol y no al tamaño del
  // mapa: es lo que hace que la oscuridad sea una distancia y no un color.
  const densidad = bajoTierra && alcance > 0
    ? FOG_REACH / (alcance * 2.2)
    : fogDensityFor(level.mesh);
  scene.background = new THREE.Color(nieblaColor);
  scene.fog = new THREE.FogExp2(nieblaColor, densidad);

  const { geometry, order } = meshGeometry(level.mesh);
  const materials = order.map((name) => {
    const map = textures.get(name) ?? null;
    return new THREE.MeshLambertMaterial({
      map,
      // Con textura el color va en blanco: si no, multiplica y la tine. Sin
      // textura se cae al color plano, que es peor pero se ve.
      color: map ? 0xffffff : PALETTE.textures[name] ?? PALETTE.textures.default,
    });
  });
  // Un nivel sin brushes no tiene worldspawn, y eso no es un caso raro: el
  // jharro es malla entera, igual que el valle de `hill.mjs`. Montar la malla
  // igualmente dejaba una geometría sin grupos dibujándose con `materials[0]`,
  // que no existe.
  let world = null;
  if (order.length) {
    world = new THREE.Mesh(geometry, materials);
    world.name = "worldspawn";
    scene.add(world);
  }

  const sun = new THREE.DirectionalLight(
    LIGHT.sunColour,
    bajoTierra ? BAJO_TIERRA.sol : LIGHT.sun
  );
  sun.position.set(...LIGHT.sunDirection);
  sun.name = "sol";
  if (!bajoTierra) scene.add(sun);
  scene.add(new THREE.HemisphereLight(
    bajoTierra ? BAJO_TIERRA.ambiente : PALETTE.sky,
    PALETTE.ground,
    bajoTierra ? BAJO_TIERRA.hemisferio : LIGHT.hemisphere
  ));
  scene.add(new THREE.AmbientLight(
    bajoTierra ? BAJO_TIERRA.ambiente : PALETTE.ambient,
    bajoTierra ? BAJO_TIERRA.ambienteIntensidad : LIGHT.ambient
  ));

  // Las luces del .map, tal cual las anoto el emisor del experimento 02.
  //
  // El valor de 'light' en Quake es un radio en unidades, no una intensidad.
  // Y desde r155 Three.js mide las luces puntuales en candelas con caida
  // cuadratica, asi que una intensidad de 1 deja el mapa practicamente negro:
  // se ve la geometria, se ve la niebla, y parece que el nivel esta mal hecho.
  for (const l of level.lights) {
    // El color puede venir en la propia luz, y en el jharro viene: sale de
    // `info_texlights` de Gate City, que declara UNA textura emisiva a
    // "255 255 128". Sin esto todas las luces del proyecto compartirían el tono
    // de las farolas de Corinth, que no es el de una vela bajo tierra.
    const color = l.color
      ? new THREE.Color(l.color[0], l.color[1], l.color[2])
      : new THREE.Color(LIGHT.colour);
    const light = new THREE.PointLight(
      color,
      (l.light / 300) * (bajoTierra ? BAJO_TIERRA.candela : LIGHT.candela),
      (l.light / 32) * (bajoTierra ? BAJO_TIERRA.radio : 1),
      bajoTierra ? BAJO_TIERRA.decaimiento : LIGHT.decay
    );
    light.position.set(...l.position);
    scene.add(light);
  }

  return { scene, world, materials, textures: order };
}

/**
 * Renderer y camara, con la resolucion interna fijada.
 *
 * `far` por defecto vale para un pueblo de cien metros. El valle de la sonda
 * de malla mide casi trescientos y con 400 se le corta el fondo justo donde
 * empieza lo interesante -y no se ve como un recorte, se ve como niebla-, asi
 * que quien sabe lo grande que es su mundo lo dice al construir la vista.
 */
/**
 * `anchoInterno` decide a cuántos píxeles se dibuja de verdad.
 *
 * Por defecto son los 320 de `INTERNAL_WIDTH`, que es una decisión de ESTILO de
 * los experimentos de Corinth y del jharro: el canvas se estira por CSS con
 * `image-rendering: pixelated` y de ahí sale su aspecto.
 *
 * Para Gate City eso es un error de fidelidad, no un estilo. Master Sword Rebirth
 * corre a **1920×1080** —`C:\Juegos\MSR\msrideo.cfg`— así que dibujar a 320
 * y estirar es reproducir el mapa a un sexto de su resolución. Se veía, y quien
 * lo juega lo dijo sin saber el nombre: «tal vez sea la resolución». Lo era.
 *
 * Pasando `anchoInterno: null` se dibuja al tamaño real del canvas.
 */
export function buildView(canvas, { far = 400, anchoInterno = INTERNAL_WIDTH, espacioDelMotor = false } = {}) {
  // preserveDrawingBuffer para que una captura tomada despues del render siga
  // viendo el fotograma: sin esto el buffer se limpia y el PNG sale en negro,
  // que es un fallo silencioso con muy buena pinta.
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1); // nada de devicePixelRatio: la gracia es el pixel gordo
  // `espacioDelMotor` apaga la codificacion sRGB de salida.
  //
  // GoldSrc multiplica textura por mapa de luz en 8 bits y en espacio de
  // PANTALLA. Con el flujo lineal de Three.js —texturas sRGB, multiplicacion en
  // lineal, codificacion al final— las sombras se aplastan, porque sRGB tiene un
  // tramo recto cerca del cero y la identidad deja de valer ahi. Ver `ESPACIO` en
  // `src/render/bsp_escena.js` para la tabla.
  //
  // Solo lo pide Gate City, que reproduce un motor concreto. Los demas mapas son
  // nuestros y se quedan en el flujo lineal, que es lo correcto para ellos.
  if (espacioDelMotor) renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  const camera = new THREE.PerspectiveCamera(75, 1, 0.05, far);
  camera.rotation.order = "YXZ";

  function resize() {
    const w = canvas.clientWidth || 640;
    const h = canvas.clientHeight || 480;
    const width = anchoInterno ?? w;
    const height = anchoInterno ? Math.max(1, Math.round((anchoInterno * h) / w)) : h;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    return [width, height];
  }

  resize();
  return { renderer, camera, resize };
}
