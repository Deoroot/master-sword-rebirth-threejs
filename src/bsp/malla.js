// Las caras de un `.bsp` a malla dibujable: posiciones, normales, UV de textura,
// UV de mapa de luz y un grupo de índices por textura.
//
// La forma de salida es la que ya construye `src/render/scene.js` para un `.map`
// —un grupo por textura y varios materiales— más un segundo juego de UV. Eso no
// es casualidad: es lo que pide un `.bsp` y es lo que al jharro le falta, que
// dibuja su mundo entero con un material.
//
// ── Lo que NO se dibuja, y por qué ──────────────────────────────────────────
//
//   cielo   3 822 m², el 11,6 % de la superficie. No es una pared con nubes: es
//           la caja que sella el mundo. Se cuenta y se manda al fondo.
//   nada más. Este `.bsp` no trae caras de `clip`, `aaatrigger` ni `null`: el
//           compilador se las comió. Se comprueba en vez de suponerlo, porque un
//           mapa que sí las trajera dibujaría cajas de aire en mitad del sitio.

import { aEscena, vectorAEscena, uvDe } from "./lector.js";
import { claseDeTextura, CLASES } from "./miptex.js";
import { uvDeLuz } from "./luz.js";


/**
 * Los modos de dibujo de una entidad con brushes, y **por qué hay que leerlos**.
 *
 * Lo señaló quien comparó las capturas del juego con las nuestras: «los rayos de
 * luz en el templo del juego son transparentes pero veo que en el demo es sólido».
 * Tenía razón, y el dato estaba medido desde el principio sin que yo lo usara:
 * **31 entidades con `rendermode 5` y 208 m²** que estaba dibujando opacas.
 *
 * Un rayo de luz en GoldSrc es un `func_illusionary` con una textura clara y modo
 * ADITIVO. Dibujado opaco es un bloque amarillo macizo en mitad del templo, que es
 * exactamente lo que se veía — y lo peor es que un bloque amarillo en un sitio con
 * un tragaluz encima **parece deliberado**.
 *
 *   0  normal      opaco
 *   1  color       el brush entero del color de `rendercolor`, con alfa `renderamt`
 *   2  textura     la textura con alfa `renderamt`: cristales
 *   3  resplandor  sólo para carteles: siempre de frente y sin profundidad
 *   4  recortado   alfa del índice 255 de la paleta, sin mezcla
 *   5  aditivo     se SUMA: rayos de luz, humo, resplandores
 */
export const MODOS_RENDER = ["normal", "color", "textura", "resplandor", "recortado", "aditivo"];

/**
 * Marca las caras de una entidad con su desplazamiento y su modo de dibujo.
 *
 * El desplazamiento **se anota y no se aplica a los puntos**: el motor mueve el
 * MODELO y calcula la textura con la geometría sin mover. Sumarlo a los vértices y
 * proyectar después desplaza la textura y el mapa de luz de esa pieza.
 *
 * Para casi todas vale cero. Las que NO son cero son las nueve
 * `func_door_rotating` de Gate City, a las que `qbsp` les resta el origen para
 * poder girarlas alrededor de él. Sin volver a sumarlo, esas nueve puertas
 * aparecen a diez metros de su marco — y como son nueve de 316, el mapa sigue
 * pareciendo correcto.
 */
export function conEntidad(caras, entidad, origen) {
  const o = entidad ? origen(entidad) : null;
  const modo = Number(entidad?.rendermode ?? 0) || 0;
  const desplazamiento = o && (o[0] || o[1] || o[2]) ? o : null;
  if (!desplazamiento && !modo) return caras;
  const render = modo
    ? {
        modo,
        nombre: MODOS_RENDER[modo] ?? `desconocido(${modo})`,
        // `renderamt` es 0..255. En el modo aditivo el cero NO es invisible en
        // GoldSrc: el motor lo trata como opaco. Se respeta eso, porque un rayo de
        // luz con `renderamt 0` existe en los mapas y tiene que verse.
        amt: Number(entidad.renderamt ?? 255) || 255,
        // `rendercolor` sólo tiñe en el modo 1. En los demás viene a "0 0 0", y eso
        // NO significa negro: significa «sin tinte». Multiplicar por él apaga la
        // pieza entera, que es un fallo que se ve como «esa cosa no está».
        color: (entidad.rendercolor ?? "255 255 255").trim().split(/\s+/).map(Number),
      }
    : null;
  return caras.map((c) => ({ ...c, desplazamiento, render }));
}


/**
 * Emite la malla.
 *
 * `caras` son las de `leerTodasLasCaras()`, ya marcadas con `conDesplazamiento()`.
 * `atlas` es el de `empaquetar()` con su `blanco` ya reservado, o `null` para no
 * emitir UV de luz.
 */
export function emitirMalla(caras, texturas, atlas = null, { conCielo = false, sinLuzAl = "negro" } = {}) {
  const pos = [], nor = [], uv = [], uv1 = [];
  const porTextura = new Map();
  // `atlas` puede ser UNO —como siempre— o una LISTA, uno por cubo de estilos de
  // luz (ver `luz.js`). Con una lista, cada cara mira a su propio atlas y el
  // cubo entra en la clave del grupo, que es lo que permite cambiar la textura
  // de mapa de luz de unas caras y no de otras diez veces por segundo.
  //
  // Un vértice es de una cara y una cara es de un cubo, así que la `uv1` sigue
  // siendo un solo atributo: no se duplica ni un vértice por esto.
  const lista = atlas ? (Array.isArray(atlas) ? atlas : [{ ...atlas, cubo: "quieta" }]) : null;
  const quieta = lista?.find((a) => a.cubo === "quieta") ?? lista?.[0] ?? null;
  const porItem = lista
    ? new Map(lista.flatMap((a) => a.items.map((i) => [i.cara, { item: i, atlas: a }])))
    : null;
  // A dónde van las caras SIN mapa de luz. Al luxel NEGRO, no al blanco.
  //
  // Esto lo elegí mal y lo vio quien lo anduvo: «varias texturas o cosas son
  // completamente negras o pitch black», y lo que veía eran las OTRAS —las que yo
  // había mandado al blanco— iluminadas a tope en mitad de una cueva.
  //
  // El motor no duda: en `R_BuildLightMap`, si una cara no tiene muestras, el
  // bloque de luz se queda a CERO. Negro. Yo razoné que negro «las haría
  // desaparecer, y no se ve se parece mucho a no está», que suena sensato y es
  // exactamente al revés de lo que hace GoldSrc. Son **751 caras visibles y
  // 2 051 m²**, el 5,9 % de la superficie del mapa.
  //
  // El cielo y el agua son otra cosa y no pasan por aquí: GoldSrc los dibuja sin
  // mapa de luz ninguno, a plena luz de su textura, y su material lo hace así.
  //
  // `sinLuzAl: "blanco"` las manda al luxel BLANCO en vez de al negro, y es la
  // perilla de MIRAR, no una opción de dibujo: sobre un mapa oscuro, una cara a
  // plena luz se ve de lejos y se ve entera. Existe porque «esto está negro» y
  // «esto no tiene mapa de luz» se ven igual en una captura, y hacen falta dos
  // fotogramas del mismo sitio para separarlos. `tools/gatecity.mjs --sinluz`.
  const negro = (sinLuzAl === "blanco" ? quieta?.blanco : quieta?.negro) ?? [1, 1];

  let cielo = 0, sinLuz = 0, descartadas = 0;

  for (const c of caras) {
    const t = texturas[c.miptex];
    if (!t || !c.texinfo) { descartadas++; continue; }
    const info = claseDeTextura(t.nombre);
    if (info.clase === CLASES.cielo) {
      cielo += c.area;
      if (!conCielo) continue;
    }

    const enAtlas = porItem?.get(c) ?? null;
    const item = enAtlas?.item ?? null;
    // Una cara sin mapa de luz no tiene cubo: va a la quieta, que es donde está
    // su luxel negro. Es lo mismo que hace el motor, que la deja a cero.
    const suAtlas = enAtlas?.atlas ?? quieta;
    if (!item) sinLuz++;

    const n = vectorAEscena(c.normal);
    const d = c.desplazamiento;
    const base = pos.length / 3;
    for (const p of c.puntos) {
      // La posición lleva el desplazamiento de la entidad; la textura y la luz se
      // calculan con el punto SIN desplazar, que es lo que hace el motor.
      const e = aEscena(d ? [p[0] + d[0], p[1] + d[1], p[2] + d[2]] : p);
      pos.push(e[0], e[1], e[2]);
      nor.push(n[0], n[1], n[2]);
      const q = uvDe(p, c.texinfo, t.ancho, t.alto);
      // GoldSrc pone el origen de la UV arriba, como glTF y al contrario que
      // Three.js. Se voltea la V aquí y en ningún otro sitio.
      uv.push(q[0], -q[1]);
      if (lista) {
        // Una cara sin mapa de luz se manda al luxel reservado, así el material es
        // el MISMO para todas y no hay que partir los grupos en dos.
        const l = item ? uvDeLuz(p, c, item, suAtlas) : negro;
        uv1.push(l[0], l[1]);
      }
    }

    // Abanico desde el primer vértice, **al revés**. Un polígono de `.bsp` es
    // plano y convexo, así que el abanico es correcto por construcción; lo que no
    // lo era es el orden.
    //
    // GoldSrc guarda la vuelta de una cara EN SENTIDO HORARIO vista desde delante,
    // que es lo contrario de lo que Three.js llama frontal. Emitida tal cual, las
    // 12 680 caras del mundo salen con el bobinado opuesto a su propia normal: **la
    // pared sólo se ve desde detrás**, así que se atraviesan las cercanas y se ven
    // los reversos de las lejanas.
    //
    // Y no se lee como «geometría al revés». Se lee como **«el mapa está muy
    // oscuro»**: la vista de la llegada salía con el 0,3 % de pantalla visible y
    // cuatro manchas de roca flotando en negro, y yo lo di por bueno porque Gate
    // City es una cueva y la medida dice que su rincón más oscuro está a 43,7 m de
    // su farol. Lo delató una cifra que no cuadraba: **apagar el mapa de luz sólo
    // cambiaba el 3 % de la pantalla**, y sin mapa de luz todo se dibuja a plena
    // luz, así que una vista llena tenía que cambiar entera.
    //
    // El aviso del proyecto era «`mallaGenerada` dibuja a DOS CARAS, así que una
    // cara al revés no se ve mal». Aquí se dibuja a UNA, y resulta que tampoco se
    // ve mal: se ve oscuro. Lo que lo caza es preguntarle al triángulo emitido
    // hacia dónde mira, y hay una prueba que lo hace con los 41 650.
    const tris = [];
    for (let i = 1; i + 1 < c.puntos.length; i++) tris.push(base, base + i + 1, base + i);

    // La clave del grupo lleva el modo de dibujo, no sólo la textura.
    //
    // Es lo que permite que un rayo de luz aditivo y una pared opaca con la MISMA
    // textura sean dos materiales distintos. Sin esto, agrupar por textura obliga a
    // elegir un modo para las dos, y lo que sale es un bloque macizo donde tenía
    // que haber un haz de luz.
    //
    // Y lleva el CUBO de estilos de luz por la misma razón: dos caras con la
    // misma textura pero una que parpadea y otra que no miran a atlas distintos,
    // así que no pueden compartir material. Sin esto, la mitad del mapa
    // muestrearía el atlas equivocado — y un atlas equivocado del mismo mapa no
    // se ve como un fallo: se ve como luz.
    const cubo = suAtlas?.cubo ?? "quieta";
    const porModo = c.render ? `${t.nombre}#${c.render.modo}/${c.render.amt}/${c.render.color.join(",")}` : t.nombre;
    const clave = lista && lista.length > 1 ? `${porModo}@${cubo}` : porModo;
    let g = porTextura.get(clave);
    if (!g) {
      porTextura.set(clave, (g = {
        clave, textura: t.nombre, clase: info.clase, render: c.render ?? null, cubo, indices: [],
      }));
    }
    g.indices.push(...tris);
  }

  // Los grupos se ordenan por nombre para que el orden de dibujo sea estable
  // entre ejecuciones: si no, dos capturas del mismo mapa pueden no coincidir.
  const grupos = [...porTextura.values()].sort((a, b) =>
    a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0
  );

  const indices = [];
  const groups = [];
  for (const g of grupos) {
    groups.push({
      texture: g.textura, clase: g.clase, render: g.render, cubo: g.cubo,
      start: indices.length, count: g.indices.length,
    });
    indices.push(...g.indices);
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uv),
    uvs1: lista ? new Float32Array(uv1) : null,
    indices: new Uint32Array(indices),
    groups,
    vertexCount: pos.length / 3,
    triangleCount: indices.length / 3,
    cielo,
    sinLuz,
    descartadas,
  };
}

/**
 * Reserva los dos luxeles de servicio del atlas y devuelve sus UV.
 *
 * Van en la última fila, que el empaquetado por bandas nunca alcanza porque el
 * alto se sube a potencia de dos. Cada uno es un cuadrado de 3×3 y no un píxel:
 * con filtro bilineal un píxel suelto se mezcla con sus vecinos y el valor que
 * llega a la cara no es el que se puso.
 *
 *   negro   a donde van las caras sin mapa de luz, que es lo que hace el motor.
 *   blanco  no lo usa nadie hoy, y se deja porque es la única forma de dibujar
 *           una cara a plena luz sin partir su grupo en dos — ver `--sinluz` en
 *           `tools/gatecity.mjs`, que lo enciende para MIRAR dónde están.
 */
export function reservarLuxeles(atlas, rgba) {
  const { ancho, alto } = atlas;
  const y = alto - 4;
  if (y <= atlas.altoUsado) {
    throw new Error(
      `no queda sitio para los luxeles de servicio: el atlas usa ${atlas.altoUsado} de ${alto} filas`
    );
  }
  const pinta = (x, v) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const i = ((y + dy) * ancho + (x + dx)) * 4;
        rgba[i] = rgba[i + 1] = rgba[i + 2] = v;
        rgba[i + 3] = 255;
      }
    }
    return [(x + 0.5) / ancho, (y + 0.5) / alto];
  };
  return { negro: pinta(ancho - 8, 0), blanco: pinta(ancho - 4, 255) };
}
