// UN MAPA DE MASTER SWORD como NIVEL: lo que el visor necesita para andarlo.
//
// Misma forma que devuelven `loadLevel()` para un `.map`, `terrainLevel()` para
// el valle y `jharroLevel()` para el jharro, así que el visor y el sacador de
// capturas no necesitan un tercer camino.
//
// ── De dónde sale ───────────────────────────────────────────────────────────
//
// De `build/<mapa>/`, que es lo que escribe `tools/gatecity.mjs`. **El navegador
// NO lee el `.bsp`**, y no es por rendimiento: es la regla del 02. El `.bsp` se
// queda en `../MSC/`, lo extraído vive en `build/` —que no se publica y está en
// `.gitignore`— y nada pasa a `public/`. El servidor de desarrollo sirve `build/`
// porque está dentro de la raíz del proyecto; una compilación de producción no lo
// incluiría, y está bien: esto es un laboratorio.
//
// ── Lo que este nivel NO tiene ──────────────────────────────────────────────
//
// (Lo que sigue se midió sobre Gate City, que es el único horneado hoy.)
//
//   brushes      ninguno. `qbsp` no juzga nada aquí; el juez es el `.bsp` mismo,
//                que está al lado y es la referencia perfecta de la sesión.
//   luces        118, y NO se encienden. Ver `src/render/bsp_escena.js`: la luz
//                de este mapa está horneada y encender además las puntuales sería
//                sumar dos veces la misma luz y lavar justo lo que se ha ido a
//                buscar. Se guardan para poder dibujarlas si hace falta.
//   adornos      101 `env_model` y 58 `env_sprite` que apuntan a ficheros `.mdl`
//                y `.spr` que **no están dentro del `.bsp`**. Es el hueco conocido
//                y es la mitad de lo que se ve a la altura de los ojos.

import { MAPA_POR_DEFECTO, baseDe } from "../play/mapa.js";

/**
 * Carga el manifiesto y el binario, y monta el nivel.
 *
 * El 47: se llamaba `gatecityLevel` y tenía `build/gatecity` dentro. Ahora el
 * mapa entra por `mapa` o, si alguien prefiere darle la carpeta hecha, por
 * `base`. El valor por omisión sigue siendo Gate City porque es el único
 * horneado; quién decide cuál es, es `src/play/mapa.js`.
 */
export async function cargarNivel({ mapa = MAPA_POR_DEFECTO, base = null, fetch: f = fetch } = {}) {
  base = base ?? baseDe(mapa);
  const manifiesto = await pedirJson(`${base}/malla.json`, f);
  const bin = await (await ok(f(`${base}/malla.bin`), `${base}/malla.bin`)).arrayBuffer();

  const { tramos } = manifiesto.bin;
  const vista = (nombre, Tipo) => {
    const t = tramos[nombre];
    if (!t) throw new Error(`${base}/malla.json no declara el tramo '${nombre}'`);
    if (t.off + t.bytes > bin.byteLength) {
      throw new Error(`el tramo '${nombre}' se sale de malla.bin`);
    }
    return new Tipo(bin, t.off, t.n);
  };

  const positions = vista("positions", Float32Array);
  const indices = vista("indices", Uint32Array);
  const mesh = {
    positions,
    normals: vista("normals", Float32Array),
    uvs: vista("uvs", Float32Array),
    uvs1: vista("uvs1", Float32Array),
    indices,
    groups: manifiesto.grupos,
    vertexCount: positions.length / 3,
    triangleCount: indices.length / 3,
  };

  // Los adornos: los 101 `env_model`, ya fundidos y ya puestos en mundo por el
  // extractor. Vienen aparte del mundo y no mezclados con él porque no comparten
  // nada: no llevan mapa de luz por cara —llevan un luxel por adorno, el del
  // suelo que tienen debajo— y sus texturas salen de otros ficheros.
  const adornos = manifiesto.adornos
    ? {
        positions: vista("adornoPositions", Float32Array),
        normals: vista("adornoNormals", Float32Array),
        uvs: vista("adornoUvs", Float32Array),
        uvs1: vista("adornoUvs1", Float32Array),
        grupos: manifiesto.adornos.grupos,
        colocados: manifiesto.adornos.colocados,
        ficheros: manifiesto.adornos.ficheros,
        triangulos: manifiesto.adornos.triangulos,
        // EL 73: los que tienen `targetname` NO van fundidos, porque un
        // `env_render` puede cambiarles el aspecto y para esconder uno hay que
        // saber qué geometría es suya. Vienen en sus propios tramos del mismo
        // binario, con una malla por colocación.
        nombrados: manifiesto.adornos.nombrados ?? [],
        nomPositions: manifiesto.adornos.nombrados?.length ? vista("adornoNomPositions", Float32Array) : null,
        nomNormals: manifiesto.adornos.nombrados?.length ? vista("adornoNomNormals", Float32Array) : null,
        nomUvs: manifiesto.adornos.nombrados?.length ? vista("adornoNomUvs", Float32Array) : null,
        nomUvs1: manifiesto.adornos.nombrados?.length ? vista("adornoNomUvs1", Float32Array) : null,
      }
    : null;

  const choquePos = vista("choquePositions", Float32Array);
  const choqueIdx = vista("choqueIndices", Uint32Array);
  const colision = {
    positions: choquePos,
    indices: choqueIdx,
    triangleCount: choqueIdx.length / 3,
  };

  // Los pies del jugador vienen YA calculados, y no por comodidad.
  //
  // Aquí había una constante: «el origin de un punto de aparición está 18
  // unidades por encima de los pies», que es una convención de Half-Life y suena
  // bien. El archivo dice otra cosa: el `origin` de `ms_player_begin` en Gate City
  // está **54 unidades por encima del suelo**. Ni 18 ni las 24 de Quake.
  //
  // Así que no se resta nada: `tools/gatecity.mjs` le pregunta al árbol BSP dónde
  // está el suelo bajo ese punto y escribe el resultado. No inventes, calcula.
  const u = manifiesto.entrada.unidades;
  const U = manifiesto.unidadesPorMetro;
  const pies = manifiesto.entrada.pies;

  return {
    name: manifiesto.mapa,
    entities: [],
    brushes: [],
    mesh,
    adornos,
    colision,
    // LA VALLA DE LOS BICHOS, aparte de `colision` a propósito: el jugador la
    // atraviesa (`world.cpp:1196`). Ver src/bsp/clip.js y src/play/monsterclip.js.
    monsterclip: manifiesto.monsterclip ?? [],
    skyFaces: 0,
    // Se guardan, apagadas. Ver el comentario de arriba.
    lights: [],
    lucesHorneadas: manifiesto.luces,
    points: [],
    startUnits: [u[0], u[1], u[2]],
    start: pies,
    // Los ocho pueblos, con un sitio donde se puede estar en cada uno. El visor
    // los usa para poder IR a los interiores: la llegada está a 47 m del más
    // cercano, y eso es diseño del mapa, no un fallo — pero mirarlos hay que
    // poder.
    pueblos: manifiesto.pueblos ?? [],
    unitsPerMetre: U,
    manifiesto,
    // El binario entero, que hace falta para las mallas que NO están fundidas
    // con el mundo: las nueve puertas, cada una con la suya porque se mueven.
    bin,
    // La niebla se calibra a la caja del mapa, como en los demás.
    caja: manifiesto.caja,
    medidas: manifiesto.medidas,
  };
}

async function pedirJson(ruta, f) {
  const r = await ok(f(ruta), ruta);
  // **El servidor de desarrollo contesta el `index.html` a lo que no
  // encuentra**, así que un mapa sin hornear llega con un 200 y `<!doctype`
  // dentro. Lo destapó el 47 al dejar entrar `?map=<cualquier mapa>`: antes la
  // carpeta siempre estaba. Sin esto, el error es «Unexpected token '<'» y no
  // dice qué archivo falta.
  const tipo = r.headers?.get?.("content-type") ?? "";
  if (tipo && !tipo.includes("json")) {
    throw new Error(
      `${ruta} no es JSON: el servidor devolvió «${tipo}». Ese mapa no está extraído ` +
        `en build/ — ver el README.`
    );
  }
  return r.json();
}

async function ok(p, ruta) {
  const r = await p;
  if (!r.ok) {
    throw new Error(
      `no se pudo leer ${ruta} (${r.status}). ¿Has ejecutado la extracción de ese mapa? ` +
        `Lo extraído no está en el repositorio a propósito: ver el README.`
    );
  }
  return r;
}
