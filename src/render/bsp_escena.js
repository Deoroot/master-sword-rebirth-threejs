// La escena de Gate City. Es la parte que contesta la pregunta de la sesión.
//
// ── Por qué no reutiliza `buildScene()` ─────────────────────────────────────
//
// Porque el modelo de iluminación es OTRO, y no por gusto. `buildScene()` monta
// `MeshLambertMaterial` con sol, hemisférico, ambiente y una luz puntual por
// farol, que es lo que necesita un mundo sin luz horneada. Gate City tiene la luz
// entera dentro del archivo: 2,03 MB de mapa de luz calculado con oclusión real.
//
// Encender además las 118 luces puntuales sería sumar dos veces la misma luz y
// lavar exactamente el contraste que se ha venido a buscar — el mismo error que
// «arreglar la oscuridad de golpe» del jharro, con la comprobación en verde.
//
// Así que aquí: **`MeshBasicMaterial`, sin una sola luz en la escena.** Es lo que
// hace GoldSrc con las superficies del mundo, y por eso es también la respuesta
// honesta a «¿puede esta pila?»: si hace falta un shader propio, la respuesta es
// otra.
//
// ── El factor del mapa de luz, que NO es uno ────────────────────────────────
//
// Three.js aplica el `lightMap` así (`meshbasic.glsl.js`, r170):
//
//     indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI
//     outgoingLight    = indirectDiffuse * diffuseColor
//
// O sea que con `lightMapIntensity` a 1 —el valor por defecto— el mapa entero sale
// dividido por π, un 68 % más oscuro. Eso no da error: da un mapa plausible y
// oscuro, y uno se pone a subir el brillo de las texturas. Para que sea una
// multiplicación limpia hace falta **π**, y encima de eso GoldSrc dibuja con
// «overbright» ×2 (`gl_overbright`), que es lo que sube un mapa de luz de media
// 25/255 a algo que se puede mirar.
//
// ── Y por qué el espacio de color sale gratis ───────────────────────────────
//
// GoldSrc multiplica textura por mapa de luz en espacio gamma; Three.js lo hace en
// lineal. Da lo mismo, y se puede demostrar: si las dos texturas se declaran sRGB,
// el resultado es `codificar(lineal(t)·lineal(l))` = `(t^2,2 · l^2,2)^(1/2,2)` =
// `t·l`, que es exactamente lo que hace GoldSrc. La multiplicación conmuta con la
// gamma. Lo que NO da lo mismo es declarar una de las dos lineal, y entonces el
// mapa sale con los medios tonos apagados.

import * as THREE from "three";

import { varianteEnT } from "../bsp/gamma.js";

import { MAPA_POR_DEFECTO, baseDe } from "../play/mapa.js";
// EL 76: la regla de «¿se dibuja?» y el alfa, del mismo módulo que usa el
// extractor. Si el visor se la escribiera aparte, habría dos respuestas.
import { seDibuja, alfa, aplicar as aplicarAspecto } from "../play/aspecto.js";
const BASE_POR_DEFECTO = baseDe(MAPA_POR_DEFECTO);
/** El factor que convierte el `lightMap` de Three.js en una multiplicación. */
export const RECIPROCO_PI = Math.PI;

/**
 * El extra de brillo que se le da al mapa de luz DESDE EL MATERIAL. Vale uno, y
 * que valga uno es el resultado que se buscaba.
 *
 * El «overbright» ×2 de GoldSrc y su rampa de gamma se aplican al hornear el
 * atlas —ver `src/bsp/gamma.js`, que es `BuildGammaTable()` del motor— porque el
 * motor los hace
 * en ese orden y porque así **el material del navegador no lleva ni un número
 * magico**: es un `MeshBasicMaterial` de fábrica con `map`, `lightMap` y el factor
 * π que Three.js necesita para que multiplicar sea multiplicar. Eso es lo que la
 * pregunta de la sesión quería poder contestar.
 *
 * Se deja como perilla para poder barrerlo desde `probe.setOverbright()` y
 * MIRARLO, no para calibrar nada a ojo.
 */
// El factor del material se queda en UNO: el overbright, la escala de estilo y
// las dos tablas de gamma ya están horneados en el atlas por `pintarAtlas()`,
// que es `R_BuildLightMap()` del motor. Multiplicar aquí otra vez sería
// aplicarlos dos veces.
export const OVERBRIGHT = 1;

export const NIEBLA = 0x0a0a0c;

/**
 * El cielo de Gate City, que existe y no se puede dibujar entero.
 *
 * `worldspawn` declara `skyname "nature1"`: seis `.tga` que GoldSrc carga de
 * `gfx/env/` y que **no están dentro del `.bsp`**. Es el mismo hueco que los
 * `.mdl` y los `.spr`, y va al informe medido, no disimulado.
 *
 * Lo que SÍ está en el archivo es el color: `light_environment` lo declara en su
 * `_light`, y es el color con el que el compilador iluminó las caras que ven el
 * cielo. Así que esas 3 822 caras —el 11,6 % de la superficie— se pintan de ese
 * color plano, sin mapa de luz y sin niebla.
 *
 * Descartarlas, que era lo primero que hice, deja agujeros negros del tamaño de
 * media pantalla en cualquier vista al aire libre, y **un agujero negro se parece
 * mucho a una sombra**: la toma de la llegada marcaba el 0,0 % de pantalla visible
 * y parecía un problema de brillo.
 */
export function colorDeCielo(manifiesto) {
  const c = manifiesto.cielo?.color ?? [160, 170, 200];
  return (c[0] << 16) | (c[1] << 8) | c[2];
}

/** Cuánto lejos se ve. Ver `fogDensityFor` en `scene.js`: 1,2/d tapa el 76 % a d. */
export const ALCANCE_NIEBLA = 1.2;

/**
 * Carga las texturas del manifiesto.
 *
 * Nada de `RepeatWrapping` a ciegas: una textura CALADA —`{grate1b`, la reja— pide
 * `alphaTest`, y una de AGUA pide que su `offset` se pueda mover sin arrastrar a
 * las demás, así que se clona. Las dos cosas se deciden por la CLASE que anotó el
 * lector, no por el nombre escrito otra vez aquí.
 */
/**
 * El espacio de color en el que se MULTIPLICA, que resultó ser la causa de los
 * negros aplastados.
 *
 * ── El síntoma ──────────────────────────────────────────────────────────────
 *
 * Reproducidas ya las tablas del motor, seguía habiendo cuñas de negro PURO donde
 * el juego tiene penumbra legible. Medido contra su captura:
 *
 *     percentil     0,1 %   1 %   5 %
 *     el juego          6    10    16
 *     lo nuestro        0     0     0
 *
 * No era brillo —la mediana ya cuadraba— ni geometría: con `r_fullbright` el
 * negro se iba entero, así que había superficie y estaba oscura de verdad.
 *
 * ── La causa ────────────────────────────────────────────────────────────────
 *
 * El motor multiplica textura por mapa de luz **en 8 bits y en espacio de
 * pantalla**: `glBlendFunc(GL_ZERO, GL_SRC_COLOR)` sobre el framebuffer.
 *
 * Nosotros declarábamos las dos texturas `SRGBColorSpace`, así que Three.js las
 * pasaba a lineal, multiplicaba y volvía a codificar. Y eso NO es lo mismo. La
 * identidad `encode(lin(a)·lin(b)) = a·b` sólo vale si la curva es una potencia
 * pura; **sRGB tiene un tramo RECTO por debajo de 0,04045**, y ese tramo aplasta
 * justo el extremo oscuro:
 *
 *     mapa de luz × textura    el motor    por sRGB    con potencia 2,2 pura
 *            16 × 75                  5           1                        5
 *            31 × 75                  9           3                        9
 *            64 × 75                 19          12                       19
 *           128 × 75                 38          33                       38
 *           200 × 150               118         116                      118
 *
 * Un factor de TRES en las sombras y nada arriba. Exactamente la forma del fallo.
 *
 * Y la lección: el comentario que justificaba el `SRGBColorSpace` decía
 * «`encode(lin(t)·lin(l)) = t·l`, así que declarando las dos sRGB se reproduce la
 * multiplicación en espacio de gamma de GoldSrc». El razonamiento era casi
 * correcto y por eso duró: falla sólo en el tramo recto, o sea sólo donde a nadie
 * se le ocurre mirar.
 *
 * ── Lo que se hace ahora ────────────────────────────────────────────────────
 *
 * Nada de espacios: las texturas entran tal cual, se multiplican tal cual y salen
 * tal cual. `renderer.outputColorSpace` va a lineal para que el render no vuelva a
 * codificar. Es el pipeline del motor, byte a byte, y las tablas de gamma que ya
 * trae `src/bsp/gamma.js` son las que hacen el trabajo que el espacio de color
 * estaba haciendo mal.
 */
export const ESPACIO = THREE.NoColorSpace;

/**
 * Las 92 texturas del `.bsp`, ya decodificadas a PNG por el extractor.
 *
 * `anisotropia` es el máximo que dé la tarjeta, y lo pidió quien lo jugó sin
 * saber el nombre: «tal vez sea la resolución». No lo es —las texturas son las
 * del mapa, al píxel— pero el efecto que veía sí es de filtrado: un suelo o una
 * pared en ángulo RASANTE, con mipmaps isótropos, elige un nivel demasiado
 * borroso a lo largo y demasiado fino a lo ancho, y el resultado hierve al andar.
 * En una cueva de roca, donde casi todo se mira de refilón, eso es la mitad de la
 * pantalla.
 *
 * No cuesta un shader ni un material: es una propiedad de la textura.
 */
export async function cargarTexturas(manifiesto, { base = BASE_POR_DEFECTO, anisotropia = 1 } = {}) {
  const cargador = new THREE.TextureLoader();
  const mapa = new Map();
  const faltan = [];
  await Promise.all(
    manifiesto.texturas.map(
      (t) =>
        new Promise((listo) => {
          cargador.load(
            `${base}/${t.archivo}`,
            (tex) => {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              // LINEAL al ampliar, y no de punto, porque lo dice el juego:
              //
              //     C:\Juegos\MSR\msr\opengl.cfg   gl_texture_nearest "0"
              //                                      gl_lightmap_nearest "0"
              //                                      gl_anisotropy "8"
              //
              // Aquí había «el filtro de GoldSrc: píxel gordo al ampliar», que es
              // una creencia sobre cómo se ve Half-Life y no un ajuste del motor.
              // Lo que da el aspecto de píxel gordo no es el filtro: son texturas
              // de 64 y 128 píxeles. Con el filtro de punto encima, lo nuestro
              // salía más duro que el original.
              tex.magFilter = THREE.LinearFilter;
              tex.minFilter = THREE.LinearMipmapLinearFilter;
              tex.generateMipmaps = true;
              tex.anisotropy = anisotropia;
              tex.colorSpace = ESPACIO;
              mapa.set(t.nombre, tex);
              listo();
            },
            undefined,
            () => { faltan.push(t.nombre); listo(); }
          );
        })
    )
  );
  return { texturas: mapa, faltan };
}

/**
 * Carga las texturas de DETALLE, una por grupo que la declare.
 *
 * Cada grupo trae su `.tga` ya extraído a PNG y sus dos escalas, y las escalas
 * viajan en el `repeat` de la textura porque es lo que hace el motor: no hay un
 * tercer juego de UV, se multiplican las de la textura
 * (`DrawGLPoly(fa->polys, glt->xscale, glt->yscale)`).
 *
 * Se devuelve **una textura por par (archivo, escala)** y no una por archivo:
 * `tl_wood100d` sale con escala 2 en las puertas y con otra en la madera del
 * andamio, y `repeat` vive en la textura, no en el material. Compartirla pondría
 * la última escala leída en todas.
 */
export async function cargarDetalle(manifiesto, { base = BASE_POR_DEFECTO, anisotropia = 1 } = {}) {
  const cargador = new THREE.TextureLoader();
  const mapa = new Map();
  const claves = new Map();
  for (const g of manifiesto.grupos) {
    if (!g.detalle) continue;
    const clave = `${g.detalle.archivo}@${g.detalle.escala.join(",")}`;
    if (!claves.has(clave)) claves.set(clave, g.detalle);
  }
  await Promise.all(
    [...claves].map(([clave, d]) =>
      new Promise((listo) => {
        cargador.load(
          `${base}/${d.archivo}`,
          (tex) => {
            tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(d.escala[0], d.escala[1]);
            tex.magFilter = THREE.LinearFilter;
            tex.minFilter = THREE.LinearMipmapLinearFilter;
            tex.generateMipmaps = true;
            tex.anisotropy = anisotropia;
            tex.colorSpace = ESPACIO;
            mapa.set(clave, tex);
            listo();
          },
          undefined,
          () => listo()
        );
      })
    )
  );
  return mapa;
}

/**
 * EL CIELO `nature1`: la caja de seis `.tga` que GoldSrc dibuja detrás de todo.
 *
 * ── La orientación NO se adivina, se saca de las tablas del motor ───────────
 *
 * `ref/gl/gl_warp.c` trae dos tablas y `engine/client/ref_common.c` una tercera,
 * y entre las tres dicen exactamente qué imagen va en qué cara y cómo girada:
 *
 *     r_skyBoxSuffix[6] = { "rt", "bk", "lf", "ft", "up", "dn" }
 *     r_skyTexOrder[6]  = { 0, 2, 1, 3, 4, 5 }
 *     st_to_vec[6][3]   = { {3,-1,2}, {-3,1,2}, {1,3,2}, {-1,-3,2},
 *                           {-2,-1,3}, {2,-1,-3} }
 *
 * `MakeSkyVec(s, t, eje)` monta `b = (s·R, t·R, R)` y permuta con `st_to_vec`.
 * Resolviendo los seis ejes sale, en coordenadas de GoldSrc:
 *
 *     eje 0  →  +X, textura `rt`      eje 3  →  −Y, textura `ft`
 *     eje 1  →  −X, textura `lf`      eje 4  →  +Z, textura `up`
 *     eje 2  →  +Y, textura `bk`      eje 5  →  −Z, textura `dn`
 *
 * y con el cambio de ejes de este proyecto —(x, y, z) de Three es (gx, gz, −gy)—
 * `bk` acaba en −Z y `ft` en +Z, que es lo contrario de lo que sugiere el nombre.
 * **Adivinarlo no da un error: da costuras**, y una costura en un cielo de cueva
 * pasa por geometría.
 *
 * La UV también sale de ahí: `s' = (s+1)/2` y `t' = 1 − (t+1)/2`, con `flipY` a
 * falso porque el PNG se escribió con la fila 0 arriba.
 */
export async function cargarCielo(manifiesto, { base = BASE_POR_DEFECTO } = {}) {
  const caras = manifiesto.cielo?.caras;
  if (!caras) return null;
  const cargador = new THREE.TextureLoader();
  const tex = {};
  await Promise.all(Object.entries(caras).map(([c, d]) =>
    new Promise((listo) => {
      cargador.load(`${base}/${d.archivo}`, (t) => {
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.colorSpace = ESPACIO;
        t.flipY = false;
        tex[c] = t;
        listo();
      }, undefined, () => listo());
    })
  ));
  if (Object.keys(tex).length !== 6) return null;

  // Los seis ejes de `MakeSkyVec`, ya resueltos y ya en ejes de Three.js.
  // `eje(s, t)` devuelve el punto de la esquina (s, t) de esa cara, con el radio
  // ya multiplicado.
  const R = 1;
  const EJES = [
    { cara: "rt", p: (s, t) => [R, t * R, s * R] },      // GoldSrc (R, −sR, tR)
    { cara: "lf", p: (s, t) => [-R, t * R, -s * R] },     // GoldSrc (−R, sR, tR)
    { cara: "bk", p: (s, t) => [s * R, t * R, -R] },      // GoldSrc (sR, R, tR)
    { cara: "ft", p: (s, t) => [-s * R, t * R, R] },      // GoldSrc (−sR, −R, tR)
    { cara: "up", p: (s, t) => [-t * R, R, s * R] },      // GoldSrc (−tR, −sR, R)
    { cara: "dn", p: (s, t) => [t * R, -R, s * R] },      // GoldSrc (tR, −sR, −R)
  ];
  const pos = [], uv = [], idx = [];
  const grupos = [];
  EJES.forEach((e, i) => {
    const base4 = pos.length / 3;
    // El mismo recorrido de esquinas que `R_DrawSkyBox`: (−,−) (−,+) (+,+) (+,−).
    for (const [s, t] of [[-1, -1], [-1, 1], [1, 1], [1, -1]]) {
      const v = e.p(s, t);
      pos.push(v[0], v[1], v[2]);
      uv.push((s + 1) / 2, 1 - (t + 1) / 2);
    }
    grupos.push({ start: idx.length, count: 6, cara: e.cara });
    idx.push(base4, base4 + 1, base4 + 2, base4, base4 + 2, base4 + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx);
  grupos.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
  // DOS CARAS a propósito: el bobinado de esta caja no es una afirmación que
  // este código pueda comprobar con un oráculo del archivo, y una caja de cielo
  // invertida no se ve como geometría al revés — se ve como un cielo que falta.
  // Seis cuadrados no cuestan nada dibujados por los dos lados.
  const materiales = grupos.map((gr) => new THREE.MeshBasicMaterial({
    map: tex[gr.cara], side: THREE.DoubleSide, fog: false,
    depthTest: false, depthWrite: false,
  }));
  const malla = new THREE.Mesh(g, materiales);
  malla.name = "cielo";
  malla.frustumCulled = false;
  // Detrás de absolutamente todo, y sin profundidad: es el fondo.
  malla.renderOrder = -1000;
  return { malla, materiales, texturas: tex };
}

/** Los ajustes de una textura de atlas, que son los mismos para las 25. */
function ajustarAtlas(tex) {
  // Lineal y sin mipmaps, y las dos cosas a propósito:
  //
  //   lineal        un luxel es una muestra cada 16 unidades, o sea cada 40 cm. Con
  //                 filtro `Nearest` el mapa de luz se ve a cuadros de cuarenta
  //                 centímetros, que es exactamente lo que NO hace GoldSrc y lo
  //                 que delata el truco. El margen de un luxel que pone
  //                 `empaquetar()` existe para que este filtro no mezcle vecinos.
  //   sin mipmaps   un mipmap de un ATLAS mezcla parches que no tienen nada que ver,
  //                 y a distancia el suelo de una sala se pinta con la luz del
  //                 pasillo de al lado.
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = ESPACIO;
  tex.flipY = false; // el atlas se escribió con la fila 0 arriba, como se lee
  // EL SEGUNDO JUEGO DE UV SE PIDE CON `channel`, Y NO SE HEREDA DE NADA.
  //
  // Éste es el fallo que se comió el mapa de luz entero durante dos sesiones, y
  // no daba error ni se veía como un error.
  //
  // Desde r152 Three.js **no** tiene un juego de UV reservado para el `lightMap`:
  // cada textura dice cuál usa en `texture.channel`, y `channel` vale CERO de
  // fábrica. `getChannel(0)` devuelve `'uv'` (`WebGLPrograms.js`), así que el
  // atlas se estaba muestreando con las UV de la TEXTURA. Poner `uv1` en la
  // geometría no basta: nadie lo lee.
  //
  // Lo que se veía no era una pantalla rota. Las UV de textura van de −30 a 30 y
  // `ClampToEdgeWrapping` las pega al borde del atlas, así que casi toda cara
  // recibía un valor CASI CONSTANTE — un mapa de luz plano, que es exactamente el
  // aspecto de «iluminado de plano, sin charcos» que se midió contra la captura
  // del juego (saturación 0,40 contra 0,59) y se atribuyó a las texturas de
  // detalle. Y las caras cuya UV de textura caía en un rincón negro del atlas
  // salían a CERO EXACTO: las vigas de madera de la calle, negras en un sitio
  // iluminado.
  //
  // El aviso que se lleva de aquí: **un segundo juego de UV que nadie lee no da
  // error, da un mapa de luz plano** — y un mapa de luz plano se parece
  // muchísimo a un mapa de luz que funciona.
  tex.channel = 1;
  return tex;
}

/**
 * Carga los atlas de mapa de luz: uno por CUBO de estilos, y una textura por
 * variante del ciclo de parpadeo.
 *
 * Devuelve `{ cubos, quieta, animar }`. `animar(t)` pone en cada material la
 * variante que le toca en el segundo `t`, y es todo lo que hace falta para que
 * las antorchas de Gate City titilen: no hay shader, no hay mezcla y no se
 * recalcula ni un téxel. Se cambia la textura de sitio.
 *
 * Un `.bsp` sin `cubos` en el manifiesto —o cualquier otro mapa— sigue cargando
 * un atlas y ya está.
 */
export async function cargarMapaDeLuz(manifiesto, { base = BASE_POR_DEFECTO } = {}) {
  const cargador = new THREE.TextureLoader();
  const lista = manifiesto.luz.cubos ?? [
    { clave: "quieta", estilos: [], variantes: [manifiesto.luz.archivo] },
  ];
  const cubos = new Map();
  await Promise.all(lista.map(async (c) => {
    const texturas = await Promise.all(
      c.variantes.map((a) => cargador.loadAsync(`${base}/${a}`).then(ajustarAtlas))
    );
    cubos.set(c.clave, { ...c, texturas });
  }));
  const quieta = cubos.get("quieta") ?? [...cubos.values()][0];
  return {
    cubos,
    // El atlas de las caras sin mapa de luz y de los adornos.
    quieta: quieta.texturas[0],
    /** Qué variante toca en el segundo `t`. Ver `varianteEnT()`. */
    indiceEnT(clave, t) {
      const c = cubos.get(clave);
      if (!c || c.texturas.length < 2) return 0;
      return varianteEnT(c.estilos, t) % c.texturas.length;
    },
    texturaEnT(clave, t) {
      const c = cubos.get(clave) ?? quieta;
      return c.texturas[this.indiceEnT(clave, t)] ?? c.texturas[0];
    },
  };
}

/**
 * El GLOW: la luz que lleva el jugador encima.
 *
 * No está en el `.bsp` y no es una capacidad que falte: es **mecánica de juego**.
 * Quien jugó Gate City lo dijo exacto — «este mapa originalmente era muy oscuro,
 * especialmente en las cavernas, y los jugadores sólo podían guiarse con un
 * hechizo llamado glow». Y la medida le da la razón: **el 62,7 % de la superficie
 * iluminada del mapa tiene el mapa de luz por debajo de 32 sobre 255**.
 *
 * O sea que la oscuridad SÍ está reproducida, y lo que falta es el jugador con su
 * farol. Por eso el visor lo lleva, se apaga con la L, y el sacador de capturas
 * mide las dos cosas: el mapa como está y el mapa con el glow.
 *
 * Los números no se eligen a ojo, salen del propio archivo:
 *
 *   color     `info_texlights` declara la única textura emisiva del mapa como
 *             `"pi_lantern" "255 255 128 100"`, y `light_environment` usa el
 *             mismo blanco de vela. El mapa entero está a esa temperatura.
 *   alcance   la mediana medida del suelo a su farol más cercano es 3,8 m y el p90
 *             es 10,6. Se le dan 6 m, que es entre las dos: un farol de mano no
 *             alcanza lo que uno de pared.
 *   el radio  al DOBLE del alcance, y la caída LINEAL. Es la lección del jharro y
 *             es la misma aquí: Three.js multiplica la luz de un punto por una
 *             ventana que a nueve de cada diez metros del radio ya ha recortado el
 *             96 %, así que un farol con `distance` igual a su alcance no alcanza
 *             su alcance. Y GoldSrc hornea con caída lineal hasta el radio.
 */
export const GLOW = {
  color: 0xffff80,
  alcance: 6,
  radio: 2,
  // Bajada de 12 a 6, y la bajada es una CONSECUENCIA de subir las texturas.
  //
  // El glow se calibró contra unas texturas que llegaban al material sin rampa de
  // gamma. Al hornear `RAMPA_TEXTURA` en ellas, todo lo que las multiplica sube con
  // ellas — y una luz puntual a dos metros quema la roca de cerca. Lo enseñó una
  // captura de quien lo juega: pared amarilla plana, sin una sola sombra, y el
  // fondo del pasillo negro. Las dos cosas a la vez.
  //
  // El número sale del barrido, con tres varas y en cuatro sitios del mapa:
  //
  //   candela   quemado>235   la luz horneada se lee   se ve
  //     12         6,7 %  (22 % en la roca)   57,6 %   86,1 %
  //      9         2,0 %                      58,6 %   84,9 %
  //      6         0,0 %  en los cuatro       60,1 %   83,1 %
  //
  // O sea que quemarse no compraba nada: bajarlo a la mitad quita el quemado
  // entero, cuesta tres puntos de pantalla visible y **deja leer MEJOR el mapa de
  // luz**, que es lo que se vino a reproducir.
  candela: 6,
  decaimiento: 1,
};


/**
 * Cuántos desfases de animación se reparten entre los carteles del mismo fichero.
 *
 * Las 55 antorchas comparten `Fire1.spr`, y con una sola textura arden las 55 al
 * mismo compás: un pueblo entero de fuegos sincronizados se lee como un efecto, no
 * como fuego. Con cuatro clones desfasados ya no hay dos vecinas iguales, y son
 * cuatro texturas en vez de cincuenta y cinco.
 */
export const FASES = 4;

/**
 * Los carteles: las antorchas del mapa.
 *
 * `THREE.Sprite` de fábrica, que mira siempre a la cámara — que es exactamente el
 * `paralelo` que declara el propio `.spr`. Y en mezcla ADITIVA, que es lo que dice
 * su cabecera: en aditivo el negro no aporta nada, así que la llama no necesita
 * canal alfa y tampoco hay que ordenar por profundidad. Dibujada opaca, un cartel
 * de fuego es un rectángulo negro con una llama dentro.
 *
 * `depthWrite` a falso por lo mismo: un cartel aditivo que escribe profundidad
 * recorta lo que tiene detrás y deja un rectángulo de vacío alrededor del fuego.
 */
export async function cargarCarteles(manifiesto, { base = BASE_POR_DEFECTO } = {}) {
  const lista = manifiesto.carteles ?? [];
  if (!lista.length) return { grupo: new THREE.Group(), animar: () => {}, n: 0 };

  const cargador = new THREE.TextureLoader();
  const porModelo = new Map();
  for (const c of lista) {
    if (porModelo.has(c.modelo)) continue;
    const nombre = c.modelo.replace(/^.*[\\/]/, "").replace(/\.spr$/i, "");
    const tex = await cargador.loadAsync(`${base}/spr/${nombre}.png`);
    tex.colorSpace = ESPACIO;
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    // La tira es horizontal: un cuadro es 1/n del ancho.
    const fases = [];
    for (let f = 0; f < FASES; f++) {
      const t = f === 0 ? tex : tex.clone();
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.repeat.set(1 / c.cuadros, 1);
      t.needsUpdate = true;
      fases.push(t);
    }
    porModelo.set(c.modelo, fases);
  }

  const grupo = new THREE.Group();
  grupo.name = "carteles";
  const animados = [];
  lista.forEach((c, i) => {
    const fase = i % FASES;
    const tex = porModelo.get(c.modelo)[fase];
    const material = new THREE.SpriteMaterial({
      map: tex,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
      opacity: c.opacidad,
      // El tinte lo decide el extractor, que sabe distinguir «sin tinte» de
      // negro: `rendercolor "0 0 0"` es lo primero, y las 57 antorchas vienen
      // así. Las 23 `env_glow` traen "255 255 128" y ése sí se aplica — un halo
      // sin su tinte sale blanco de quirófano en un mapa que no tiene un solo
      // blanco frío.
      color: c.tinte ? new THREE.Color(c.tinte[0], c.tinte[1], c.tinte[2]) : 0xffffff,
      fog: true,
    });
    const s = new THREE.Sprite(material);
    s.position.set(...c.escena);
    s.scale.set(c.ancho, c.alto, 1);
    grupo.add(s);
    animados.push({ tex, cuadros: c.cuadros, porSegundo: c.porSegundo, fase: fase / FASES });
  });

  // Un solo recorrido por fotograma, y se mueve el `offset` de cuatro texturas, no
  // de cincuenta y siete: los carteles de la misma fase comparten la suya.
  const vistas = new Map();
  for (const a of animados) vistas.set(a.tex, a);
  const unicos = [...vistas.values()];
  function animar(t) {
    for (const a of unicos) {
      const f = Math.floor((t * a.porSegundo + a.fase * a.cuadros) % a.cuadros);
      a.tex.offset.x = f / a.cuadros;
    }
  }

  return { grupo, animar, n: lista.length, texturas: porModelo.size * FASES };
}

/**
 * La geometría, con el segundo juego de UV que pide el `lightMap`.
 *
 * `grupos` selecciona qué tramos del índice entran. Se llama DOS veces sobre los
 * mismos atributos —una para lo opaco y otra para lo transparente— y eso no
 * duplica nada: las `BufferAttribute` se pasan por referencia y la tarjeta las
 * sube una sola vez.
 */
export function geometriaBsp(mesh, grupos = mesh.groups, compartidos = null) {
  const g = new THREE.BufferGeometry();
  const a = compartidos ?? {
    position: new THREE.BufferAttribute(mesh.positions, 3),
    normal: new THREE.BufferAttribute(mesh.normals, 3),
    uv: new THREE.BufferAttribute(mesh.uvs, 2),
    uv1: mesh.uvs1 ? new THREE.BufferAttribute(mesh.uvs1, 2) : null,
    index: new THREE.BufferAttribute(mesh.indices, 1),
  };
  g.setAttribute("position", a.position);
  g.setAttribute("normal", a.normal);
  g.setAttribute("uv", a.uv);
  // `uv1` y no `uv2`: desde r152 el `lightMap` de Three.js lee `uv1`. Con el
  // nombre viejo no da error — simplemente cae en `uv` y el mapa de luz se
  // dibuja como si fuera una textura más, en mosaico, que es un aspecto muy
  // llamativo y muy fácil de confundir con «el atlas está mal empaquetado».
  if (a.uv1) g.setAttribute("uv1", a.uv1);
  g.setIndex(a.index);
  grupos.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));
  g.computeBoundingSphere();
  g.userData.compartidos = a;
  return g;
}


/**
 * Monta la escena.
 *
 * `luz` es el atlas ya cargado, o `null` para verlo SIN mapa de luz — que es la
 * comparación que dice cuánto aporta, y la que convierte «se ve bien» en una
 * cifra. Es el mismo truco que `setKit()` en Corinth: lo que mide es cuántos
 * píxeles CAMBIAN al apagarlo.
 */
export function escenaDelMapa(level, texturas, luz, { overbright = OVERBRIGHT, detalle = null, cielo: cajaDeCielo = null } = {}) {
  const escena = new THREE.Scene();
  const caja = level.caja;
  const lejos = Math.hypot(caja.max[0] - caja.min[0], caja.max[2] - caja.min[2]);
  const cielo = colorDeCielo(level.manifiesto);
  escena.background = new THREE.Color(NIEBLA);
  escena.fog = new THREE.FogExp2(NIEBLA, ALCANCE_NIEBLA / Math.max(1, lejos));

  // EL ATLAS DE UN GRUPO depende de su CUBO de estilos de luz.
  //
  // `cargarMapaDeLuz` devuelve un juego de atlas —uno por cubo, y una textura
  // por estado del ciclo— o, para cualquier otro mapa, una textura sola. Las dos
  // formas pasan por aquí.
  //
  // Lo que se guarda en `userData.cubo` es lo que luego lee `animarLuz()` para
  // saber qué variante ponerle a cada material diez veces por segundo.
  const conCubos = Boolean(luz && luz.cubos);
  const deLosAtlas = new Set(
    conCubos ? [...luz.cubos.values()].flatMap((c) => c.texturas) : luz ? [luz] : []
  );
  //
  // El estado INICIAL es el del segundo cero, no la variante 0 del array. Son
  // cosas distintas: en `t = 0` el estilo 6 ya vale 'n', no 'm'. Arrancar en la
  // variante 0 daría un fotograma que el juego nunca enseña, y todas las
  // capturas —que se toman con el bucle pausado— medirían ese fotograma.
  const atlasDe = (g) => (conCubos ? luz.texturaEnT(g.cubo ?? "quieta", 0) : luz ?? null);

  const material = (g) => {
    const m = materialCrudo(g);
    if (m) m.userData.cubo = g.cubo ?? "quieta";
    return m;
  };

  const materialCrudo = (g) => {
    const luzDelGrupo = atlasDe(g);
    // El cielo no lleva ni textura ni mapa de luz ni niebla: es el fondo. Con
    // niebla se tiñe de negro a cincuenta metros y vuelve a ser un agujero.
    if (g.clase === "cielo") {
      return new THREE.MeshBasicMaterial({ color: cielo, fog: false });
    }
    const map = texturas.get(g.texture) ?? null;
    // El AGUA va sin mapa de luz, y no es una simplificación: GoldSrc dibuja las
    // superficies de agua en su propia pasada, a plena luz de su textura y sin
    // modular por la luz horneada. Con mapa de luz el agua de una cueva sale negra
    // y parece un agujero en el suelo.
    if (g.clase === "agua") {
      const m = new THREE.MeshBasicMaterial({
        map, color: map ? 0xffffff : 0x3050a0, transparent: true, opacity: 0.82,
        depthWrite: false,
      });
      // Se clona para poder correrle el `offset` sin mover lo que no es agua: la
      // misma textura la comparten varios materiales.
      if (m.map) { m.map = m.map.clone(); m.map.needsUpdate = true; }
      return m;
    }

    // --- los modos de dibujo de las entidades -------------------------------
    //
    // Lo que faltaba, y lo señaló quien comparó las capturas del juego: «los rayos
    // de luz en el templo del juego son transparentes pero en el demo es sólido».
    // Un rayo de luz es un `func_illusionary` con modo ADITIVO, y dibujado opaco es
    // un bloque amarillo macizo — que en un sitio con un tragaluz encima parece
    // deliberado, y por eso aguantó.
    //
    // Son 31 entidades aditivas y 208 m², más 50 con alfa y 120 m². No van con luz
    // horneada: en el motor los brushes transparentes se dibujan en su propia
    // pasada, sin modular por el mapa de luz.
    const r = g.render;
    if (r) {
      const alfa = Math.min(1, Math.max(0, r.amt / 255));
      if (r.modo === 5) {
        // ADITIVO. `depthWrite` a falso: un aditivo que escribe profundidad recorta
        // lo que tiene detrás y deja un rectángulo de vacío alrededor del haz.
        return new THREE.MeshBasicMaterial({
          map, color: 0xffffff, blending: THREE.AdditiveBlending,
          transparent: true, opacity: alfa, depthWrite: false, side: THREE.DoubleSide,
        });
      }
      if (r.modo === 2) {
        // TEXTURA con alfa: cristales y cortinas.
        return new THREE.MeshBasicMaterial({
          map, color: 0xffffff, transparent: true, opacity: alfa,
          depthWrite: false, side: THREE.DoubleSide,
          lightMap: luzDelGrupo, lightMapIntensity: RECIPROCO_PI * overbright,
        });
      }
      if (r.modo === 1) {
        // COLOR plano: el brush entero del `rendercolor`. Aquí el color SÍ se usa.
        return new THREE.MeshBasicMaterial({
          color: new THREE.Color(r.color[0] / 255, r.color[1] / 255, r.color[2] / 255),
          transparent: true, opacity: alfa, depthWrite: false,
        });
      }
      if (r.modo === 4) {
        // RECORTADO: alfa del índice 255 de la paleta, sin mezcla ni orden.
        return new THREE.MeshLambertMaterial({
          map, color: 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide,
          lightMap: luzDelGrupo, lightMapIntensity: RECIPROCO_PI * overbright,
        });
      }
    }

    // Y todo lo demás en LAMBERT, no en Basic.
    //
    // Con `MeshBasicMaterial` el mundo sale exactamente como GoldSrc lo hornea, y
    // eso era lo que había que demostrar. Pero no admite una sola luz, y este mapa
    // se jugaba con el hechizo `glow` encendido porque sin él no se ve. Lambert
    // multiplica el mapa de luz igual —el factor π vive en `BRDF_Lambert`, así que
    // la constante es la misma— y ADEMÁS suma las luces de la escena, que es
    // exactamente lo que hace el motor con sus luces dinámicas.
    //
    // O sea que esto no relaja la respuesta de capacidad, la amplía: sigue siendo
    // un material de fábrica, y ahora hace las dos cosas a la vez.
    const m = new THREE.MeshLambertMaterial({
      map,
      color: map ? 0xffffff : 0x808080,
      lightMap: luzDelGrupo,
      lightMapIntensity: RECIPROCO_PI * overbright,
    });
    // Una textura calada —el índice 255 de su paleta es transparente— pide
    // `alphaTest` y no `transparent`: con transparencia de verdad hay que ordenar
    // por profundidad y una reja se dibuja delante de la pared que tiene detrás.
    if (g.clase === "calada") {
      m.alphaTest = 0.5;
      m.side = THREE.DoubleSide; // una reja se ve por los dos lados
    }
    return m;
  };

  // --- DOS mallas: lo opaco y lo transparente -------------------------------
  //
  // Y no es un refinamiento, es un fallo que se vio: los faroles de pared salían
  // NEGROS.
  //
  // Three.js ordena OBJETOS —lo opaco primero, lo transparente después y de atrás
  // adelante— pero dentro de un mismo `Mesh` los grupos se dibujan en orden de
  // índice. Los faroles son `func_illusionary` de modo 2 con `renderamt 175`, o sea
  // transparentes y sin escribir profundidad; su grupo caía antes que el de la pared
  // opaca que tienen detrás, **y la pared los pintaba por encima**.
  //
  // Separados en dos mallas, lo transparente entra en la pasada de transparencia y
  // se dibuja al final, que es lo que hace el motor con sus brushes translúcidos.
  const esTransparente = (g) =>
    g.clase === "agua" || (g.render && g.render.modo !== 4);
  // CON CAJA DE CIELO, las caras de cielo del mapa NO se dibujan.
  //
  // Es lo que hace el motor y no una simplificación: en `R_RenderBrushPoly` la
  // primera línea es `if( fa->flags & SURF_DRAWSKY ) return;` — la cara de cielo
  // no se pinta nunca, sólo sirve para recortar por dónde se ve la caja. Aquí la
  // caja va detrás de todo sin profundidad, así que el recorte lo hace la propia
  // geometría del mapa: donde hay pared, la pared la tapa.
  //
  // Sin las seis caras leídas se sigue dibujando el color plano de
  // `light_environment`, que es lo que había — porque un agujero negro de media
  // pantalla se parece demasiado a una sombra.
  const esCielo = (g) => g.clase === "cielo";
  const opacos = level.mesh.groups.filter((g) => !esTransparente(g) && !(cajaDeCielo && esCielo(g)));
  const translucidos = level.mesh.groups.filter(esTransparente);

  const geometria = geometriaBsp(level.mesh, opacos);
  const matOpacos = opacos.map(material);
  const mundo = new THREE.Mesh(geometria, matOpacos);
  // El nombre es el PAPEL, no el mapa. Se llamaban «gatecity»,
  // «gatecity-translucido» y «gatecity-detalle», y con un segundo mapa
  // cargado la malla de Edana se llamaba «gatecity». Quien la busca quiere
  // la malla del mundo, no la de un mapa concreto (59).
  mundo.name = "mundo";
  escena.add(mundo);

  let velo = null;
  let matVelo = [];
  if (translucidos.length) {
    const geo = geometriaBsp(level.mesh, translucidos, geometria.userData.compartidos);
    matVelo = translucidos.map(material);
    velo = new THREE.Mesh(geo, matVelo);
    velo.name = "mundo-translucido";
    // Por si acaso, además del orden de pasada: un aditivo que se dibuja antes que
    // su pared no se ve, y eso no da error.
    velo.renderOrder = 2;
    escena.add(velo);
  }

  // --- LA SEGUNDA PASADA: las texturas de DETALLE --------------------------
  //
  // 58 de las 80 texturas del mundo llevan una en `gatecity_detail.txt`, y
  // `opengl.cfg` trae `r_detailtextures "1"`. El motor las dibuja en una segunda
  // pasada sobre la MISMA geometría (`R_RenderDetails`, `ref/gl/gl_rsurf.c`):
  //
  //     pglBlendFunc( GL_DST_COLOR, GL_SRC_COLOR );   // dst·src + src·dst
  //     pglDepthFunc( GL_EQUAL );
  //
  // que es `2 · base · detalle`. Con el detalle a un gris medio el píxel queda
  // como estaba: conserva la media y añade CONTRASTE LOCAL, que es lo único que
  // la comparación con la captura del juego seguía echando en falta.
  //
  // En Three.js eso es `CustomBlending` con `DstColorFactor` y `SrcColorFactor`,
  // y **no hace falta un shader**, que es lo que hay que poder seguir diciendo.
  //
  // Tres cosas que no son obvias:
  //
  //   `EqualDepth`  la segunda pasada tiene que caer exactamente encima de la
  //                 primera. Comparte vértices e índices, así que la profundidad
  //                 interpolada es bit a bit la misma. Con `LessEqualDepth` en su
  //                 lugar hay z-fighting en las caras lejanas.
  //   `fog: false`  la niebla ya la aplicó la pasada base. Aplicarla otra vez en
  //                 una pasada MULTIPLICATIVA la eleva al cuadrado y pinta de
  //                 negro el fondo de las galerías.
  //   el orden      va después de lo opaco y antes de lo translúcido. Un rayo de
  //                 luz aditivo dibujado antes de su propio detalle sale dos
  //                 veces mezclado.
  let detalleMalla = null;
  let matDetalle = [];
  const conDetalle = detalle
    ? opacos.filter((g) => g.detalle && g.clase !== "cielo" && g.clase !== "agua" &&
        detalle.has(`${g.detalle.archivo}@${g.detalle.escala.join(",")}`))
    : [];
  if (conDetalle.length) {
    const geo = geometriaBsp(level.mesh, conDetalle, geometria.userData.compartidos);
    matDetalle = conDetalle.map((g) => new THREE.MeshBasicMaterial({
      map: detalle.get(`${g.detalle.archivo}@${g.detalle.escala.join(",")}`),
      blending: THREE.CustomBlending,
      blendSrc: THREE.DstColorFactor,
      blendDst: THREE.SrcColorFactor,
      blendEquation: THREE.AddEquation,
      transparent: true,
      depthFunc: THREE.EqualDepth,
      depthWrite: false,
      fog: false,
      // Una reja calada recorta con `alphaTest` y su detalle tiene que recortar
      // igual, o la segunda pasada rellena los agujeros con un gris.
      ...(g.clase === "calada" ? { alphaTest: 0.5, side: THREE.DoubleSide } : {}),
    }));
    detalleMalla = new THREE.Mesh(geo, matDetalle);
    detalleMalla.name = "mundo-detalle";
    detalleMalla.renderOrder = 1;
    escena.add(detalleMalla);
  }
  if (cajaDeCielo) escena.add(cajaDeCielo.malla);

  const materiales = [...matOpacos, ...matVelo];
  const grupos = [...opacos, ...translucidos];

  // Ni una luz de ESCENA: toda la del mapa está en el atlas. La única que se
  // añade es el glow, y va colgada de la cámara — la pone `main.js`, porque es
  // quien tiene la cámara.
  return {
    escena,
    mundo,
    materiales,
    velo,
    // El orden en que van los materiales, que ya NO es el de `mesh.groups`:
    // primero los opacos y después los translúcidos. Quien apague texturas o luz
    // tiene que recorrer ESTA lista, no la del manifiesto.
    grupos,
    // La segunda pasada, para poder apagarla y MEDIR lo que aporta. Sin esa
    // perilla, «las texturas de detalle mejoran el contraste» es una opinión.
    detalle: detalleMalla,
    materialesDetalle: matDetalle,
    gruposDetalle: conDetalle,
    cielo: cajaDeCielo?.malla ?? null,
    /**
     * La fábrica de materiales, para quien tenga geometría del mapa FUERA de
     * esta malla: hoy las nueve puertas, que se mueven y por eso no pueden
     * estar fundidas con el mundo.
     *
     * Se devuelve en vez de reimplementarla ahí porque una puerta tiene que
     * verse exactamente igual que la pared de al lado: mismo atlas de luz,
     * mismo `overbright`, mismo modo de dibujo. Dos fábricas serían dos
     * respuestas a eso, y la segunda se quedaría atrás sin que se note más que
     * como «esa puerta está un poco más clara».
     */
    material,
    // Los materiales de agua, para moverlos en el bucle.
    aguas: grupos.map((g, i) => (g.clase === "agua" ? materiales[i] : null)).filter(Boolean),
    /**
     * EL PARPADEO. Pone en cada material la variante de atlas que le toca en el
     * segundo `t`, y devuelve cuántos han cambiado.
     *
     * Es una asignación de textura, nada más: los estados están todos horneados
     * (ver `luz.js`). Se llama por fotograma y la mayoría de las veces no hace
     * nada, porque el reloj del motor sólo avanza diez veces por segundo.
     */
    animarLuz(t) {
      if (!conCubos) return 0;
      let cambiados = 0;
      for (const m of materiales) {
        // Si el material lleva puesta una textura que NO es de los atlas, es que
        // alguien le ha metido la mano: el luxel blanco de `setLuz(false)` o el
        // lienzo rosa de la sonda. Se respeta y no se pisa — un parpadeo que le
        // devuelve el atlas a una perilla apagada es una perilla que MIENTE, y de
        // ésas ya ha habido tres en este proyecto.
        if (!m.lightMap || !deLosAtlas.has(m.lightMap)) continue;
        const tex = luz.texturaEnT(m.userData.cubo ?? "quieta", t);
        if (m.lightMap !== tex) { m.lightMap = tex; cambiados++; }
      }
      return cambiados;
    },
  };
}

/**
 * Los ADORNOS: los 101 `env_model` de Gate City.
 *
 * ── Qué recibe y qué no ─────────────────────────────────────────────────────
 *
 * Recibe una malla YA puesta en el mundo. El extractor lleva cada vértice por su
 * hueso, por la rotación y la escala de la entidad y por su origen, todo en
 * espacio de GoldSrc, y cambia de ejes una sola vez. Aquí no se transforma nada:
 * hacerlo sería tener dos sitios donde el 39,37 puede volverse 32.
 *
 * ── Por qué llevan `lightMap` y no color de vértice ─────────────────────────
 *
 * Porque así son **el mismo material de fábrica que el mundo**, y ésa es la
 * respuesta que se vino a dar. En GoldSrc un modelo no tiene mapa de luz: se
 * ilumina con `R_LightPoint`, un solo luxel leído del suelo que tiene debajo. Eso
 * se reproduce reservando un luxel por adorno en el atlas y apuntando todos sus
 * vértices al mismo — el material sigue siendo `MeshLambertMaterial` con `map`,
 * `lightMap` y `uv1`, igual que la roca.
 *
 * Y el efecto se nota: la luz del suelo de los 101 va de **12 a 196 sobre 255**.
 * Un barril en la cueva sale oscuro y el mismo barril bajo una lámpara sale claro,
 * que es lo que impide que los muebles parezcan pegatinas puestas encima.
 *
 * ── Las texturas recortadas ─────────────────────────────────────────────────
 *
 * Un helecho o una rueda de carro usan el índice 255 de su paleta como
 * transparente. `alphaTest` y no `transparent`: con transparencia de verdad hay
 * que ordenar por profundidad y las hojas se dibujan delante del tronco.
 */
export async function cargarAdornos(nivel, luz, { base = BASE_POR_DEFECTO, anisotropia = 1 } = {}) {
  // Los adornos miran al atlas QUIETO: su luz es un solo luxel del suelo
  // (`R_LightPoint`) reservado ahí. En el motor ese luxel también parpadea; aquí
  // todavía no, y queda escrito en vez de disimulado.
  const atlas = luz?.cubos ? luz.quieta : luz;
  const ad = nivel.adornos;
  if (!ad || !ad.grupos?.length) return { grupo: new THREE.Group(), n: 0, materiales: [] };

  const cargador = new THREE.TextureLoader();
  const porArchivo = new Map();
  await Promise.all(
    [...new Set(ad.grupos.map((g) => g.archivo))].map(
      (archivo) =>
        new Promise((listo) => {
          cargador.load(
            `${base}/${archivo}`,
            (t) => {
              // CLAMP y no REPEAT: se midió que **todas** las UV de los 17
              // modelos caen en 0..1, así que repetir no aporta nada — y sus
              // texturas sí traen tamaños como 508×513, 80×179 o 4×1, que no son
              // potencias de dos. NPOT con repetición y mipmaps es el caso que
              // peor se porta entre implementaciones, y aquí no hace falta.
              t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
              // TRILINEAL y no filtro de punto, y aquí no es una elección de
              // estilo: las texturas de los `.mdl` son **seis veces más densas**
              // que las del mapa —33 téxeles por unidad² de mediana contra las
              // ~1 de una pared— porque un barril de 60 triángulos lleva una
              // imagen de 256 o 512 píxeles. Con filtro de punto, una rueda de
              // carro sale como estática de televisión.
              //
              // Y es además lo que hace el motor: el `gl_texturemode` de fábrica
              // de GoldSrc es `GL_LINEAR_MIPMAP_LINEAR`. Lo que da el aspecto de
              // píxel gordo de Half-Life no es el filtro, son las texturas.
              t.magFilter = THREE.LinearFilter;
              t.minFilter = THREE.LinearMipmapLinearFilter;
              t.generateMipmaps = true;
              t.anisotropy = anisotropia;
              t.colorSpace = ESPACIO;
              // `flipY` A FALSO: las UV de un `.mdl` son índices de píxel y el
              // motor las usa sin voltear nada (`R_StudioDrawPoints`), así que
              // `v = 0` tiene que ser la fila 0 del archivo. El valor de fábrica
              // de Three.js es lo contrario y ponía los 101 adornos del revés en
              // vertical. La explicación larga está en `render/bichos.js`, que
              // carga estas mismas texturas para los bichos.
              //
              // El mundo no lo necesita porque `malla.js` emite `(s, −t)`.
              t.flipY = false;
              porArchivo.set(archivo, t);
              listo();
            },
            undefined,
            () => listo()
          );
        })
    )
  );

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(ad.positions, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(ad.normals, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(ad.uvs, 2));
  g.setAttribute("uv1", new THREE.BufferAttribute(ad.uvs1, 2));
  ad.grupos.forEach((gr, i) => g.addGroup(gr.start, gr.count, i));

  // El material de un grupo de adorno. Se saca a una función porque desde el
  // **76** lo piden dos mallas distintas: la fundida y la de cada adorno con
  // nombre, que necesita material PROPIO para poder cambiarle el alfa sin
  // cambiárselo a los otros cuarenta y cinco.
  const materialDe = (gr) => {
    const map = porArchivo.get(gr.archivo) ?? null;
    if (gr.aditivo) {
      return new THREE.MeshBasicMaterial({
        map, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
      });
    }
    const m = new THREE.MeshLambertMaterial({
      map,
      color: map ? 0xffffff : 0x808080,
      // `plenaLuz` es la bandera `STUDIO_NF_FULLBRIGHT`: la llama de una vela no
      // se apaga porque el suelo esté oscuro.
      lightMap: gr.plenaLuz ? null : atlas,
      lightMapIntensity: RECIPROCO_PI,
      emissive: gr.plenaLuz ? 0xffffff : 0x000000,
      emissiveMap: gr.plenaLuz ? map : null,
    });
    if (gr.recortado) {
      m.alphaTest = 0.5;
      m.side = THREE.DoubleSide; // una hoja se ve por los dos lados
    }
    return m;
  };

  const materiales = ad.grupos.map(materialDe);

  const malla = new THREE.Mesh(g, materiales);
  malla.name = "adornos";
  malla.frustumCulled = false;
  const grupo = new THREE.Group();
  grupo.name = "adornos";
  grupo.add(malla);

  // ── LOS ADORNOS CON NOMBRE (el 76) ────────────────────────────────────────
  //
  // Una malla por colocación, con sus materiales propios, porque un
  // `env_render` le puede cambiar el aspecto a uno solo. Nueve en Edana, cero
  // en Gate City. Van en el mismo `Group`, así que quien ya lo añadía a la
  // escena no cambia.
  const nombrados = [];
  if (ad.nombrados?.length && ad.nomPositions) {
    // Los ATRIBUTOS se comparten entre las nueve geometrías —el mismo objeto,
    // o sea el mismo buffer en la tarjeta— y cada malla dibuja sólo sus grupos.
    // Y no vale `geometria.clone()`: `BufferAttribute.copy` hace
    // `new source.array.constructor(source.array)`, o sea que clonar nueve
    // veces serían nueve copias del buffer entero.
    const attr = {
      position: new THREE.BufferAttribute(ad.nomPositions, 3),
      normal: new THREE.BufferAttribute(ad.nomNormals, 3),
      uv: new THREE.BufferAttribute(ad.nomUvs, 2),
      uv1: new THREE.BufferAttribute(ad.nomUvs1, 2),
    };
    for (const s of ad.nombrados) {
      const geo = new THREE.BufferGeometry();
      for (const [n, a] of Object.entries(attr)) geo.setAttribute(n, a);
      s.grupos.forEach((gr, k) => geo.addGroup(gr.start, gr.count, k));
      const mats = s.grupos.map(materialDe);
      // Y VAN TAMBIÉN A `materiales`, la lista de todos.
      //
      // No es un apaño: es que esa lista la recorren cinco sitios de
      // `src/dev/sonda.js` —el mapa de luz, las texturas, la plena luz— y una
      // perilla que deja fuera nueve adornos sin decirlo es justo el fallo que
      // CLAUDE.md §5 prohíbe. La malla fundida indexa 0..n-1 por su
      // `materialIndex`, así que añadir al final no le cambia nada.
      materiales.push(...mats);
      const m = new THREE.Mesh(geo, mats);
      m.name = `adorno:${s.nombre}`;
      m.frustumCulled = false;
      // El estado DE NACIMIENTO, que es el que el mapeador escribió. Si esto no
      // se aplica, los cuatro platos de sopa de la taberna de Edana están en la
      // mesa desde el primer fotograma con las mesas vacías.
      const estado = { modo: s.render?.modo ?? 0, cantidad: s.render?.cantidad ?? 255, fx: s.render?.fx ?? 0 };
      const p = { nombre: s.nombre, modelo: s.modelo, escena: s.escena, malla: m, materiales: mats, estado, cambios: 0 };
      nombrados.push(p);
      grupo.add(m);
      pintar(p);
    }
  }

  /**
   * El estado de dibujo, puesto en la malla.
   *
   * `seDibuja` decide si entra en la lista (gl_rmain.c:252) y `alfa` con qué
   * mezcla. El `depthWrite` a `true` con transparencia NO es un descuido: es lo
   * que hace `GL_StudioSetRenderMode` en su `default` —el `case` por el que cae
   * el modo 4— con `pglDepthMask( GL_TRUE )` (ref/gl/gl_studio.c:3011-3017).
   */
  /** El centro de los vértices que una malla dibuja de verdad (sus grupos). */
  function centroDe(m) {
    const a = m.geometry?.attributes?.position;
    if (!a) return null;
    let x = 0, y = 0, z = 0, n = 0;
    for (const g of m.geometry.groups) {
      for (let i = g.start; i < g.start + g.count; i++) {
        x += a.getX(i); y += a.getY(i); z += a.getZ(i); n++;
      }
    }
    return n ? [x / n, y / n, z / n] : null;
  }

  function pintar(p) {
    const visible = seDibuja(p.estado);
    p.malla.visible = visible;
    if (!visible) return;
    const a = alfa(p.estado);
    for (const m of p.materiales) {
      if (m.blending === THREE.AdditiveBlending) continue;  // el aditivo ya es el suyo
      m.transparent = a < 1;
      m.opacity = a;
      m.depthWrite = true;
      m.needsUpdate = true;
    }
  }

  return {
    grupo, malla, materiales,
    n: ad.colocados,
    ficheros: ad.ficheros,
    triangulos: ad.triangulos,
    texturas: porArchivo.size,
    nombrados,

    /**
     * `CRenderFxManager::Use`, triggers.cpp:535-557: **a TODAS las que se
     * llamen así**, no a la primera. Edana tiene cuatro adornos llamados
     * `apple1` y ningún `env_render` que los busque, así que el día que algo
     * los busque tienen que apagarse los cuatro.
     *
     * Devuelve a cuántos ha llegado. Cero no es un error: es que este mapa no
     * tiene ningún adorno con ese nombre, y eso lo cuenta quien llama.
     */
    aplicarRender(nombre, como = {}) {
      if (!nombre) return 0;
      let n = 0;
      for (const p of nombrados) {
        if (p.nombre !== nombre) continue;
        p.estado = aplicarAspecto(p.estado, como);
        p.cambios++;
        pintar(p);
        n++;
      }
      return n;
    },

    /**
     * Lo que hay y cómo está, para una sonda.
     *
     * Trae `enEscena` y `primerVertice` además del `visible`, y no es relleno:
     * es la lección del 71 —«el NODO está donde dice el bus»— aplicada aquí.
     * `visible: false` es nuestra contabilidad y se puede poner a mano; que la
     * malla esté colgada de la escena y que sus vértices estén donde dice el
     * manifiesto es otra pregunta, y la primera medida de esta pieza salió cero
     * píxeles justamente por no haberla hecho.
     */
    censo() {
      return nombrados.map((p) => {
        const g = p.malla.geometry;
        const a = g.attributes.position;
        const g0 = g.groups[0];
        return {
          nombre: p.nombre, modelo: p.modelo, escena: p.escena,
          visible: p.malla.visible, estado: { ...p.estado },
          alfa: p.malla.visible ? alfa(p.estado) : 0,
          cambios: p.cambios,
          enEscena: Boolean(p.malla.parent),
          grupos: g.groups.length,
          vertices: g.groups.reduce((t, x) => t + x.count, 0),
          // El primer vértice de su primer grupo, en ejes de escena. Tiene que
          // caer cerca de `escena`: un `start` desplazado dibuja los triángulos
          // de otro adorno y eso no da error.
          primerVertice: a && g0 ? [a.getX(g0.start), a.getY(g0.start), a.getZ(g0.start)] : null,
          // EL CENTRO DE SUS VÉRTICES, que NO es `escena`.
          //
          // `escena` es el `origin` de la entidad del `.bsp`, y un `.mdl` no
          // tiene por qué estar centrado en su origen: el plato de sopa está
          // **0,8 m por encima** del suyo. Una sonda que apunte a `escena`
          // fotografía un palmo de mesa por debajo del plato y cuenta cero
          // píxeles de cambio — que es lo que midió esta pieza dos veces.
          centro: centroDe(p.malla),
          // Y SI SUS MATERIALES ESTÁN EN LA LISTA DE TODOS, que es la que
          // recorren las cinco perillas de `src/dev/sonda.js` (mapa de luz,
          // texturas, plena luz). Si no, esas perillas se dejan nueve adornos
          // fuera y no lo dice nadie — CLAUDE.md §5, el ajuste que se calla.
          enLaLista: p.materiales.every((m) => materiales.includes(m)),
        };
      });
    },
  };
}
