// El plano de una casa, calculado.
//
// Aqui no hay ni una coordenada escrita a mano. Entra una descripcion -tantas
// celdas de ancho, tantas de fondo, este tejado, la puerta en esta cara- y sale
// la lista de piezas con su posicion. Es la misma regla que el resto del
// proyecto: al modelo no se le pide que invente geometria, se le pide el plano y
// la geometria la calcula un conversor determinista.
//
// Lo que hace falta saber del kit, MEDIDO de los .glb y no de su documentacion:
//
//   celda        4 m. Un modulo de muro ocupa X [0,4] y Z [-4,0], con el origen
//                en la esquina. Asi la celda (i,j) esta en (4i, 0, -4j) y no hay
//                ninguna correccion de media pieza.
//   muro         3 m de alto, y es una CASCARA de cuatro paredes sin techo ni
//                suelo: una pieza ya es un cuarto entero.
//   tejado       ocupa X [0,4] exacto y vuela 0,382 m por cada lado en Z; la
//                cumbrera va por tanto en X. Y su caja empieza en y = -0,366:
//                esta hecho para SOLAPAR sobre el muro, no para apoyarse encima.
//                Por eso se coloca a la altura del muro y no a la altura del
//                muro mas nada.
//   remate       vuela 0,382 en X y mide 0,5 en Z, o sea que su perfil esta en
//                el plano contrario al del faldon: se usa girado 90 grados.
//
// Ejes de Three.js: Y arriba, y la casa crece hacia +X y hacia -Z.

export const CELDA = 4;
export const ALTURA_MURO = 3;
/** Cuanto baja el tejado por debajo de su propio origen. Medido, no supuesto. */
export const SOLAPE_TEJADO = 0.366;

/** Las cuatro caras de una casa, y hacia donde mira cada una. */
export const CARAS = {
  sur: { eje: "z", signo: 1, giro: 0 },
  norte: { eje: "z", signo: -1, giro: Math.PI },
  este: { eje: "x", signo: 1, giro: Math.PI / 2 },
  oeste: { eje: "x", signo: -1, giro: -Math.PI / 2 },
};

/**
 * Un punto sobre una cara exterior de la casa, en metros.
 *
 * `u` va de 0 a 1 a lo largo de la cara. Se pide asi y no en metros para que
 * colocar una puerta en el centro sea `0.5` y siga siendo el centro cuando la
 * casa pase de una celda a tres.
 */
export function puntoEnCara(ancho, fondo, cara, u, altura) {
  const c = CARAS[cara];
  if (!c) throw new Error(`cara desconocida: ${cara}`);
  const anchoM = ancho * CELDA;
  const fondoM = fondo * CELDA;
  if (c.eje === "z") {
    // La cara sur esta en z = 0 y la norte en z = -fondo. Recorrer u de 0 a 1
    // en la cara norte va de +X a -X, para que "izquierda" signifique lo mismo
    // mirando la casa desde fuera en las dos.
    const x = c.signo > 0 ? u * anchoM : (1 - u) * anchoM;
    const z = c.signo > 0 ? 0 : -fondoM;
    return { x, y: altura, z, giro: c.giro };
  }
  const z = c.signo > 0 ? -u * fondoM : -(1 - u) * fondoM;
  const x = c.signo > 0 ? anchoM : 0;
  return { x, y: altura, z, giro: c.giro };
}

/**
 * Traduce una descripcion de casa a una lista de piezas colocadas.
 *
 * Devuelve `{ piezas, caja, avisos }`. Los avisos no son decorativos: son las
 * cosas que el plano pide y el kit no puede dar -una puerta mas ancha que la
 * cara, un tejado sobre una planta que no es rectangular-, y quien llama decide
 * si son fallo. Devolverlos en vez de lanzar deja construir la casa y ver el
 * problema en una captura, que suele explicar mas que el texto del error.
 */
export function planHouse(spec) {
  const {
    ancho = 1,
    fondo = 1,
    plantas = 1,
    muro = "plaster_wall",
    tejado = "roof_straw",
    remate = null,
    suelo = "stone_floor_4x4",
    puerta = { pieza: "door_wood", cara: "sur", u: 0.5 },
    ventanas = [],
    extras = [],
    origen = [0, 0, 0],
  } = spec;

  if (!Number.isInteger(ancho) || ancho < 1) throw new Error(`ancho invalido: ${ancho}`);
  if (!Number.isInteger(fondo) || fondo < 1) throw new Error(`fondo invalido: ${fondo}`);
  if (!Number.isInteger(plantas) || plantas < 1) throw new Error(`plantas invalidas: ${plantas}`);

  const [ox, oy, oz] = origen;
  const piezas = [];
  const avisos = [];
  const poner = (nombre, x, y, z, giro = 0, papel = "") =>
    piezas.push({ pieza: nombre, pos: [ox + x, oy + y, oz + z], giro, papel });

  // --- suelo y cuerpo --------------------------------------------------------
  for (let i = 0; i < ancho; i++) {
    for (let j = 0; j < fondo; j++) {
      const x = i * CELDA;
      const z = -j * CELDA;
      if (suelo) poner(suelo, x, 0, z, 0, "suelo");
      for (let p = 0; p < plantas; p++) {
        // Cada planta es otra cascara encima. El muro mide 3 m justos, asi que
        // la planta p empieza a 3p y no hay hueco ni solape que compensar.
        poner(muro, x, p * ALTURA_MURO, z, 0, `muro p${p}`);
      }
    }
  }

  const alturaTecho = plantas * ALTURA_MURO;

  // --- tejado ----------------------------------------------------------------
  //
  // La cumbrera va en X, asi que los faldones se repiten a lo largo de X y cada
  // uno cubre CELDA metros. En Z el tejado ya vuela por si solo, asi que una
  // casa de mas de una celda de fondo pide una cumbrera mas alta que este kit
  // no trae: se avisa en vez de sacar un tejado que no tapa.
  if (tejado) {
    if (fondo > 1) {
      avisos.push(
        `el faldon ${tejado} cubre ${CELDA} m de fondo y la casa tiene ${fondo * CELDA} m: ` +
          `con este kit un fondo mayor de una celda queda sin cubrir`
      );
    }
    for (let i = 0; i < ancho; i++) {
      poner(tejado, i * CELDA, alturaTecho, 0, 0, "tejado");
    }
    // Los remates cierran los dos extremos de la cumbrera, que estan en X = 0 y
    // X = ancho*CELDA. El remate trae su perfil en el plano contrario al del
    // faldon, asi que va girado un cuarto de vuelta.
    if (remate) {
      poner(remate, 0, alturaTecho, 0, Math.PI / 2, "remate oeste");
      poner(remate, ancho * CELDA, alturaTecho, -fondo * CELDA, -Math.PI / 2, "remate este");
    }
  }

  // --- puerta y ventanas -----------------------------------------------------
  if (puerta) {
    const p = puntoEnCara(ancho, fondo, puerta.cara, puerta.u ?? 0.5, 0);
    poner(puerta.pieza, p.x, p.y, p.z, p.giro, "puerta");
  }
  for (const v of ventanas) {
    const altura = v.altura ?? 1.35;
    if (altura + 0.95 > plantas * ALTURA_MURO) {
      avisos.push(`una ventana a ${altura} m se sale por encima del muro`);
    }
    const p = puntoEnCara(ancho, fondo, v.cara, v.u, altura);
    poner(v.pieza ?? "window_square", p.x, p.y, p.z, p.giro, "ventana");
  }

  // --- extras: chimenea, vigas, lo que sea -----------------------------------
  //
  // Van en coordenadas de cara igual que las ventanas, para que una chimenea
  // siga pegada a su pared cuando la casa cambie de tamano.
  for (const e of extras) {
    const p = puntoEnCara(ancho, fondo, e.cara, e.u, e.altura ?? 0);
    // El giro de la cara, salvo que el extra pida el suyo. Una chimenea quiere
    // el de su pared; un yunque suelto, no.
    poner(e.pieza, p.x, p.y, p.z, e.giro ?? p.giro, "extra");
  }

  // La caja del cuerpo, sin tejado ni voladizos: es la huella en el suelo, que
  // es lo que le importa a quien coloque la casa en el pueblo.
  const caja = {
    min: [ox, oy, oz - fondo * CELDA],
    max: [ox + ancho * CELDA, oy + plantas * ALTURA_MURO, oz],
  };

  return { piezas, caja, avisos, ancho, fondo, plantas };
}
