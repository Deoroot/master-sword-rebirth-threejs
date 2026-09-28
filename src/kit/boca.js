// La boca de la mazmorra de Corinth: el socavon, su trinchera y su reja.
//
// Es la unica parte del pueblo que NO sale de un catalogo, y por una razon de
// lore: el agujero no lo hicieron humanos. Es un remanente de los invasores, y
// lo que se ve desde la calle es lo que la guarnicion construyo ENCIMA para
// sellarlo. Por eso todo lo fabricado es piedra del pack -combina con la
// muralla por construccion, no por parecido- y lo unico generado es la roca,
// que no tiene por que parecerse a nada del pueblo.
//
// ── La medida que decidio la forma ───────────────────────────────────────────
//
// `strairs_stone` del pack sube 1,015 m por cada 2,183 m de tramo. Bajar 4 m
// pide 8,73 m de carrera, y eso NO cabe pegado a la pared de un socavon de 12 m
// de ancho: la pared solo tiene 4,5 m de horizontal. Tres salidas habia -curvar
// la escalera, empinarla, o sacarla del socavon- y se toma la tercera: la
// guarnicion abrio una TRINCHERA que empieza fuera, en la calle, y corta el
// labio del crater hasta el fondo. Es lo que se hace de verdad en una cantera,
// y ademas deja la escalera recta, que es la unica que el pack sabe hacer.
//
// Sin esa medida, el dibujo obvio -escalera bajando por dentro del socavon- da
// escalones flotando sobre la roca, y eso no lo avisa nada: se ve, y tarde.
//
// Ejes: como en house.js, la parcela crece hacia +X y hacia -Z. Aqui se trabaja
// en coordenadas de parcela (x hacia el este, w hacia el sur) y se convierte a
// mundo al final, porque una `w` que crece hacia el sur se lee y una `z` que
// decrece, no.

import { CELDA } from "./house.js";
import { nuevaMalla, quad, unir, mover, uvEn } from "./malla.js";

/** Lo que sube cada tramo de `strairs_stone`, medido del .glb. */
export const TRAMO = { alto: 1.015, carrera: 2.183, ancho: 2.023 };
/** Cuantos tramos, y por tanto cuanto hondo es el agujero. */
export const TRAMOS = 4;
export const HONDO = TRAMO.alto * TRAMOS; // 4.06 m

export const PARCELA = { ancho: 3, fondo: 3 }; // celdas
const LADO = PARCELA.ancho * CELDA; // 12 m

/** El socavon. Centro y radios en metros de parcela. */
export const CRATER = { cx: 6, cw: 5.0, rx: 5.1, rw: 4.3, suelo: 2.0 };

/**
 * El paso de la malla de roca, en metros.
 *
 * No es un ajuste de calidad: es la rejilla en la que la roca y el suelo del
 * pueblo tienen que casar. El `.map` del pueblo emite losa donde esta malla NO
 * emite roca, y las dos usan este numero y el mismo criterio. Cambiarlo aqui lo
 * cambia en los dos sitios a la vez, que es justo lo que impide que se separen.
 *
 * 0,4 m son 12,8 unidades de Quake: exacto en los cuatro decimales con que
 * emit.js escribe los planos, y compartido por las dos celdas de cada junta.
 */
export const PASO = 0.4;

/** La trinchera: un pasillo recto que entra por el sur y baja hasta el fondo. */
export const TRINCHERA = {
  // 2,4 y no 2,35, y el numero bonito es el que se fue. 2,4 son SEIS pasos de
  // malla justos, asi que los bordes del pasillo caen en linea de rejilla: la
  // celda de roca que la trinchera se come es exactamente la que el suelo del
  // pueblo no emite. Con 2,35 los bordes caian a 4,825 y 7,175 -entre dos lineas
  // de rejilla- y la junta entre el suelo y la trinchera quedaba con un sobrante
  // de 2,5 cm: una rendija de las que no se ven de dia.
  //
  // El tramo de escalera mide 2,023 m de ancho, asi que sigue cabiendo de sobra.
  ancho: PASO * 6,
  // Empieza pegada al borde sur de la parcela y avanza hacia el norte.
  desde: LADO - 0.4,
  get hasta() {
    return this.desde - TRAMO.carrera * TRAMOS;
  },
};

/**
 * La region del atlas `bauerhaus` de donde sale la textura de la roca.
 *
 * El atlas es una hoja con muchos materiales, asi que una UV que se salga de su
 * recuadro no da error: da un trozo de tejado en mitad de una pared. Por eso la
 * roca se mapea SIEMPRE dentro de este rectangulo, con el resto envuelto a
 * mano. Es la zona de silleria de piedra, la misma que usa la muralla.
 */
export const PIEDRA = { u0: 0.47, v0: 0.11, u1: 0.95, v1: 0.32 };
/** La franja de madera oscura del mismo atlas: el tambor y la cuerda del torno. */
export const MADERA = { u0: 0.42, v0: 0.12, u1: 0.445, v1: 0.33 };
const ESCALA_UV = 3.0; // metros por repeticion de la tesela

// --- el atlas -----------------------------------------------------------------
//
// Las primitivas de malla -nuevaMalla, quad, unir, mover- viven ahora en
// src/kit/malla.js, porque las vallas generan geometria igual que esto y dos
// copias de `quad()` acaban separandose sin que nadie se entere.

const uvPiedra = (s, t) => uvEn(PIEDRA, s, t, ESCALA_UV);

// --- el socavon --------------------------------------------------------------

/** Cuanto se sale el labio de la elipse perfecta, en la direccion `ang`. */
export function labio(ang) {
  // Tres armonicos, deterministas. Un borde de elipse perfecta se lee como algo
  // fabricado, y este agujero no lo fabrico nadie. Sin numeros al azar: el mismo
  // plano tiene que dar la misma roca en Node y en el navegador.
  return (
    1 +
    0.085 * Math.sin(ang * 3 + 0.7) +
    0.055 * Math.sin(ang * 5 - 1.3) +
    0.035 * Math.sin(ang * 8 + 2.1)
  );
}

/**
 * La altura del terreno en un punto de la parcela.
 *
 * 0 a ras de calle, negativa dentro del agujero. Fuera del labio devuelve 0
 * exacto, que es lo que permite coser esto al suelo del pueblo sin rendija.
 */
export function alturaRoca(x, w) {
  const dx = (x - CRATER.cx) / CRATER.rx;
  const dw = (w - CRATER.cw) / CRATER.rw;
  const ang = Math.atan2(dw, dx);
  const r = Math.hypot(dx, dw) / labio(ang);
  if (r >= 1) return 0;
  const fondo = CRATER.suelo / Math.min(CRATER.rx, CRATER.rw);
  if (r <= fondo) return -HONDO;
  // De la base al labio con una curva suave: recta daria un cono de arena y
  // esto es roca rota.
  const t = (r - fondo) / (1 - fondo);
  const s = t * t * (3 - 2 * t); // smoothstep
  return -HONDO * (1 - s);
}

/** True si el punto cae dentro del pasillo de la trinchera. */
export function enTrinchera(x, w) {
  const medio = TRINCHERA.ancho / 2;
  return (
    Math.abs(x - CRATER.cx) <= medio &&
    w <= TRINCHERA.desde &&
    w >= TRINCHERA.hasta
  );
}

/** La altura del suelo de la trinchera: una rampa recta bajo los escalones. */
export function alturaTrinchera(w) {
  const t = (TRINCHERA.desde - w) / (TRINCHERA.desde - TRINCHERA.hasta);
  const f = Math.max(0, Math.min(1, t));
  // El `f === 0 ? 0` no es manía: sin él sale -0, que es cero para todo menos
  // para Object.is, y por tanto para las pruebas. Vale mas quitarlo en el
  // origen que enseñar a la prueba a tragarse un cero raro.
  return f === 0 ? 0 : -HONDO * f;
}

/**
 * Que hay en la celda (i, j) de la rejilla de la parcela: roca, trinchera o nada.
 *
 * Existe para que la roca y el suelo del pueblo NO PUEDAN discrepar. La malla
 * emite donde esto dice que hay algo; el `.map` emite losa donde dice que no hay
 * nada. Con dos copias del criterio -una aqui y otra en el emisor- bastaria con
 * que alguien tocara un radio del crater para abrir una rendija entre el suelo y
 * la roca, y una rendija de dos centimetros no la mide nadie: se ve, de noche, y
 * tarde.
 *
 * Devuelve "socavon", "trinchera" o false. Un string y no true porque quien cose
 * necesita saber CUAL de las dos mallas tapa la celda.
 */
export function hayRoca(i, j, paso = PASO) {
  const x0 = i * paso, x1 = x0 + paso;
  const w0 = j * paso, w1 = w0 + paso;
  if (enTrinchera((x0 + x1) / 2, (w0 + w1) / 2)) return "trinchera";
  const h = [
    alturaRoca(x0, w0), alturaRoca(x1, w0),
    alturaRoca(x1, w1), alturaRoca(x0, w1),
  ];
  // Una celda entera a ras de calle no es roca, es calle.
  return h.every((v) => v === 0) ? false : "socavon";
}

/**
 * Genera la roca: el socavon y las paredes de la trinchera.
 *
 * El socavon es una malla de altura sobre la parcela, saltandose las celdas que
 * caen en la trinchera; el hueco que deja lo rellena la trinchera con sus
 * paredes verticales. Hacerlo de dos piezas y no de una es lo que da un corte
 * limpio: una malla de altura no sabe hacer una pared vertical, solo una cuesta
 * muy empinada, y el labio de una trinchera cortada a pico no es una cuesta.
 */
export function generarRoca({ paso = PASO } = {}) {
  const m = nuevaMalla();
  const n = Math.round(LADO / paso);

  // --- el socavon ------------------------------------------------------------
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      // El criterio no se repite aqui: se pregunta. Es la misma llamada que hace
      // el emisor del suelo para decidir donde NO poner losa.
      if (hayRoca(i, j, paso) !== "socavon") continue;
      const x0 = i * paso, x1 = x0 + paso;
      const w0 = j * paso, w1 = w0 + paso;
      const h = [
        alturaRoca(x0, w0), alturaRoca(x1, w0),
        alturaRoca(x1, w1), alturaRoca(x0, w1),
      ];
      quad(
        m,
        [x0, h[0], -w0], [x1, h[1], -w0], [x1, h[2], -w1], [x0, h[3], -w1],
        [uvPiedra(x0, w0), uvPiedra(x1, w0), uvPiedra(x1, w1), uvPiedra(x0, w1)]
      );
    }
  }

  // --- la trinchera ----------------------------------------------------------
  const medio = TRINCHERA.ancho / 2;
  const xa = CRATER.cx - medio, xb = CRATER.cx + medio;
  const pasos = Math.round((TRINCHERA.desde - TRINCHERA.hasta) / paso);
  for (let k = 0; k < pasos; k++) {
    const w0 = TRINCHERA.desde - k * paso;
    const w1 = w0 - paso;
    const y0 = alturaTrinchera(w0), y1 = alturaTrinchera(w1);
    // suelo
    quad(
      m,
      [xa, y0, -w0], [xb, y0, -w0], [xb, y1, -w1], [xa, y1, -w1],
      [uvPiedra(xa, w0), uvPiedra(xb, w0), uvPiedra(xb, w1), uvPiedra(xa, w1)]
    );
    // Paredes: cierran el desnivel entre el suelo de la trinchera y la roca que
    // tiene al lado, EN LOS DOS SENTIDOS.
    //
    // Estaban emitidas solo hacia arriba -`Math.max(roca, suelo)`- y eso da por
    // supuesto que la roca de al lado siempre está más alta que el pasillo. Es
    // verdad arriba, mientras la trinchera baja por el labio; deja de serlo
    // abajo, donde el fondo del socavón ya está a −4,06 m y el pasillo todavía
    // va por −2,9. Ahí hace falta una pared que baje, y no se emitía ninguna:
    // quedaba un escalón de metro y pico SIN CARA, o sea un agujero por el que se
    // ve el color del cielo desde dentro del agujero.
    //
    // No lo vio nada. El `.map` sella —esto es malla, `qbsp` no la juzga—, el
    // barrido de rayos hacia abajo encuentra suelo en los dos lados del escalón
    // —arriba el pasillo, abajo el cráter— y la ruta del portón a la reja pasa
    // por el centro del pasillo y no se asoma. Lo vio alguien mirando al suelo.
    for (const [x, signo] of [[xa, -1], [xb, 1]]) {
      const roca0 = alturaRoca(x + signo * 0.05, w0);
      const roca1 = alturaRoca(x + signo * 0.05, w1);
      const lo0 = Math.min(roca0, y0), hi0 = Math.max(roca0, y0);
      const lo1 = Math.min(roca1, y1), hi1 = Math.max(roca1, y1);
      if (hi0 - lo0 < 0.01 && hi1 - lo1 < 0.01) continue;
      // Un palmo de solape por abajo, y no es manía.
      //
      // La pared va de `w0` a `w1` en RECTO, y la roca que tiene que cerrar es
      // curva: entre paso y paso la roca se hunde por debajo de la cuerda y deja
      // una rendija de milímetros. Se ven dos en trescientos sesenta y seis
      // rayos, y una rendija de milímetros por la que entra el color del cielo
      // se ve igual de bien que una de un metro.
      //
      // Se estira hacia abajo, que es donde sobra sitio: ahí ya hay roca y lo
      // que se mete dentro no se ve. Hacia arriba no, que asomaría por la calle.
      const SOLAPE = 0.3;
      const a = [x, lo0 - SOLAPE, -w0], b = [x, hi0, -w0];
      const c = [x, hi1, -w1], d = [x, lo1 - SOLAPE, -w1];
      const uvs = [uvPiedra(w0, lo0), uvPiedra(w0, hi0), uvPiedra(w1, hi1), uvPiedra(w1, lo1)];
      // El orden cambia con el lado para que las dos paredes miren al pasillo.
      if (signo < 0) quad(m, a, b, c, d, uvs);
      else quad(m, d, c, b, a, [uvs[3], uvs[2], uvs[1], uvs[0]]);
    }
  }

  // --- el frente del fondo: donde va la reja ---------------------------------
  // Una pared vertical al final de la trinchera, en la que encaja la reja. Sin
  // ella la escalera acaba en la cuesta del socavon y la reja queda tumbada.
  const wf = TRINCHERA.hasta;
  quad(
    m,
    [xa, -HONDO, -wf], [xb, -HONDO, -wf], [xb, -HONDO + 2.6, -wf], [xa, -HONDO + 2.6, -wf],
    [uvPiedra(xa, 0), uvPiedra(xb, 0), uvPiedra(xb, 2.6), uvPiedra(xa, 2.6)]
  );

  return m;
}

/**
 * El torno: tambor y cuerda, generados.
 *
 * Era lo unico de esta parcela que estaba anotado como «hay que modelarlo en
 * Blender», y no hace falta: un tambor es un cilindro y una cuerda es un prisma
 * fino. Se generan con la franja de madera del mismo atlas, asi que siguen
 * siendo una sola malla y un solo material con el resto de la boca.
 *
 * Lo que SI tendria sentido modelar aparte es la manivela y el herraje, y eso
 * queda anotado en vez de hecho a medias.
 */
export function generarTorno({ cx, w, altura, largo, radio = 0.28, caras = 10 }) {
  const m = nuevaMalla();
  const z = -w;

  // El tambor: un cilindro tumbado, con el eje en X.
  const x0 = cx - largo / 2, x1 = cx + largo / 2;
  for (let i = 0; i < caras; i++) {
    const a0 = (i / caras) * Math.PI * 2;
    const a1 = ((i + 1) / caras) * Math.PI * 2;
    const p = (a) => [Math.cos(a) * radio, Math.sin(a) * radio];
    const [y0, z0] = p(a0), [y1, z1] = p(a1);
    quad(
      m,
      [x0, altura + y0, z + z0], [x1, altura + y0, z + z0],
      [x1, altura + y1, z + z1], [x0, altura + y1, z + z1],
      [
        uvEn(MADERA, x0, a0 * radio), uvEn(MADERA, x1, a0 * radio, ESCALA_UV),
        uvEn(MADERA, x1, a1 * radio), uvEn(MADERA, x0, a1 * radio, ESCALA_UV),
      ]
    );
  }

  // La cuerda: colgando del tambor hacia el agujero. Se para donde para el
  // fondo, no a una longitud escrita a mano: si el socavon se hace mas hondo,
  // la cuerda baja con el.
  const r = 0.05;
  const cuelga = altura - radio;
  for (const [dx, dz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
    quad(
      m,
      [cx + dx - r, cuelga, z + dz - r], [cx + dx + r, cuelga, z + dz - r],
      [cx + dx + r, -HONDO, z + dz - r], [cx + dx - r, -HONDO, z + dz - r],
      [
        uvEn(MADERA, 0, 0), uvEn(MADERA, 2 * r, 0, ESCALA_UV),
        uvEn(MADERA, 2 * r, cuelga + HONDO), uvEn(MADERA, 0, cuelga + HONDO, ESCALA_UV),
      ]
    );
  }
  return m;
}

// --- el plano completo -------------------------------------------------------

/**
 * La boca entera: roca generada mas piezas del kit.
 *
 * `origen` es la esquina noroeste de la parcela, en metros de mundo.
 */
export function planBoca({ origen = [0, 0, 0], paso = PASO } = {}) {
  const [ox, oy, oz] = origen;
  const piezas = [];
  const avisos = [];
  const poner = (pieza, x, y, w, giro = 0, papel = "") =>
    piezas.push({ pieza, pos: [ox + x, oy + y, oz - w], giro, papel });

  // --- la escalera -----------------------------------------------------------
  // Un tramo por escalon de 1,015 m. La posicion sale de la medida de la pieza,
  // no de repartir a ojo: si el tramo midiera otra cosa, la escalera seguiria
  // llegando al fondo.
  //
  // Las dos correcciones que costaron una captura, y las dos salen de leer el
  // .glb en vez de suponer:
  //
  //   El tramo NO se apoya en su origen. Su punta alta esta 2,093 m al sur del
  //   origen y la baja 0,09 m al norte, asi que colocarlo en la cota de arriba
  //   del tramo lo saca 2,09 m fuera de la parcela por el sur. Se resta.
  //
  //   Y sube 1 m DESDE su origen, no hasta el. Colocar el tramo k a -k*alto
  //   deja el primero asomando un metro por encima de la calle. La cota que le
  //   toca es la de su punta BAJA, que es -(k+1)*alto.
  for (let k = 0; k < TRAMOS; k++) {
    const arriba = TRINCHERA.desde - k * TRAMO.carrera;
    poner(
      "strairs_stone",
      CRATER.cx - 1.0,
      -(k + 1) * TRAMO.alto,
      arriba - 2.093,
      0,
      `escalon ${k}`
    );
  }

  // --- las rejas, y por que son DOS hojas ------------------------------------
  //
  // `door_stone_metal_grate` mide 1,228 m de ancho y va centrada en su pivote.
  // El pasillo de la trinchera mide 2,4 m. Una sola hoja deja 0,59 m libres a
  // cada lado, y eso no se ve en una captura -de frente la reja tapa el fondo-
  // pero se nota en cuanto hay un cuerpo: el jugador la rodea.
  //
  // El pack no trae ninguna reja de 2,4 m, asi que se ponen DOS hojas solapadas
  // 1,4 cm en el centro, que es lo que hace un porton de verdad y ademas es el
  // mismo truco que ya usa el brocal. El desplazamiento sale de la medida de la
  // pieza y del ancho del pasillo, no de tantear hasta que deje de pasarse.
  const HOJA = 1.228;
  const hojas = [-1, 1].map((s) => CRATER.cx + (s * (TRINCHERA.ancho - HOJA)) / 2);
  if (HOJA * 2 < TRINCHERA.ancho) {
    avisos.push(`dos hojas de ${HOJA} m no cubren un pasillo de ${TRINCHERA.ancho} m`);
  }

  // Al fondo, contra el frente de roca, mirando a quien baja.
  for (const x of hojas) poner("door_stone_metal_grate", x, -HONDO, TRINCHERA.hasta + 0.02, 0, "reja");

  // --- el brocal: el sello visible desde la calle ----------------------------
  //
  // Un reborde de piedra alrededor del labio, cortado donde entra la trinchera.
  // Es lo que se ve desde lejos y lo que dice «esto lo cerraron».
  //
  // ── Por qué está GENERADO y no son piezas del pack ───────────────────────────
  //
  // Lo fueron: cuarenta y dos `stone_square_half_1m` repartidos por el labio. Dos
  // cosas lo tumbaron, y las dos costaron media sesión:
  //
  //   no sella   esa pieza son DIECISÉIS triángulos, TODOS verticales. Es una
  //              cáscara de cuatro paredes sin tapa ni fondo, no un bloque. Un
  //              cuerpo que la empuja no choca contra un macizo: se monta por su
  //              canto de arriba y desde ahí entra al socavón andando. No lo dice
  //              ninguna cifra —la pieza mide 2×1×2 y su caja está bien— y no lo
  //              dice ninguna captura, porque por fuera se ve maciza.
  //   no se lee  cuadrados de dos metros alineados a los ejes, muy solapados y
  //              siguiendo una elipse, se leen desde arriba como un anillo de
  //              costillas. Ni bordillo ni roca: costillas.
  //
  // Generado se arregla lo uno y lo otro. Es un anillo de prismas macizos que
  // siguen el labio, con la altura variando con el mismo `labio()` que le da al
  // agujero su forma: así el reborde sube y baja como la roca que remata, en vez
  // de ser una cenefa de altura constante.
  const medio = TRINCHERA.ancho / 2;
  const ANCHO_BROCAL = 0.85;
  const ALTO_BROCAL = 0.95;

  /** ¿Se corta el brocal en este ángulo? Sí donde entra la trinchera. */
  const cortado = (x, w) => Math.abs(x - CRATER.cx) < medio + 0.45 && w > CRATER.cw;

  // El punto del reborde en un ángulo, a un radio dado en fracción del labio.
  const enLabio = (ang, k) => [
    CRATER.cx + Math.cos(ang) * CRATER.rx * labio(ang) * k,
    CRATER.cw + Math.sin(ang) * CRATER.rw * labio(ang) * k,
  ];

  // Cuántos segmentos: del perímetro y de la flecha que se admite. Un anillo de
  // cuerdas se ve ochavado si los segmentos son largos; a 0,5 m de cuerda sobre
  // un radio de 5 m la flecha es de 6 mm y no se distingue de una curva.
  const ra = CRATER.rx * 1.06;
  const rb = CRATER.rw * 1.06;
  const perimetro =
    Math.PI * (3 * (ra + rb) - Math.sqrt((3 * ra + rb) * (ra + 3 * rb)));
  const segmentos = Math.ceil(perimetro / 0.5);
  const brocal = nuevaMalla();
  let trozos = 0;
  for (let i = 0; i < segmentos; i++) {
    const a0 = (i / segmentos) * Math.PI * 2;
    const a1 = ((i + 1) / segmentos) * Math.PI * 2;
    const dentro0 = enLabio(a0, 1.0);
    const dentro1 = enLabio(a1, 1.0);
    if (cortado(...dentro0) || cortado(...dentro1)) continue;
    const fuera0 = enLabio(a0, 1.0 + ANCHO_BROCAL / CRATER.rx);
    const fuera1 = enLabio(a1, 1.0 + ANCHO_BROCAL / CRATER.rx);
    // La altura acompaña al propio labio: donde la roca sobresale, el reborde
    // sube. Pero ACOTADA, y ese es el detalle que costó una sonda: el primer
    // intento multiplicaba la desviación del labio por ocho, así que donde el
    // labio se mete hacia dentro -labio 0,83- el brocal bajaba a cuatro
    // centímetros. Cuatro centímetros no son un reborde, son suelo: por los dos
    // puntos más hundidos del anillo se entraba andando.
    //
    // El mínimo no es estético, es la altura de paso del jugador: `stepHeight`
    // vale medio metro, así que un brocal por debajo de eso deja de sellar por
    // muy bien que se vea.
    const alturaDe = (a) => ALTO_BROCAL * (0.9 + 1.2 * (labio(a) - 1));
    const h0 = alturaDe(a0);
    const h1 = alturaDe(a1);
    const P = (p, y) => [p[0], y, -p[1]];
    // Los cuatro lados y la tapa. El fondo no se emite: va contra la roca.
    quad(brocal, P(dentro0, h0), P(dentro1, h1), P(fuera1, h1), P(fuera0, h0),
      [uvPiedra(dentro0[0], dentro0[1]), uvPiedra(dentro1[0], dentro1[1]),
       uvPiedra(fuera1[0], fuera1[1]), uvPiedra(fuera0[0], fuera0[1])]);
    quad(brocal, P(dentro0, 0), P(dentro1, 0), P(dentro1, h1), P(dentro0, h0),
      [uvPiedra(dentro0[0], 0), uvPiedra(dentro1[0], 0), uvPiedra(dentro1[0], h1), uvPiedra(dentro0[0], h0)]);
    quad(brocal, P(fuera1, 0), P(fuera0, 0), P(fuera0, h0), P(fuera1, h1),
      [uvPiedra(fuera1[0], 0), uvPiedra(fuera0[0], 0), uvPiedra(fuera0[0], h0), uvPiedra(fuera1[0], h1)]);
    quad(brocal, P(dentro0, 0), P(dentro0, h0), P(fuera0, h0), P(fuera0, 0),
      [uvPiedra(0, 0), uvPiedra(0, h0), uvPiedra(ANCHO_BROCAL, h0), uvPiedra(ANCHO_BROCAL, 0)]);
    quad(brocal, P(fuera1, 0), P(fuera1, h1), P(dentro1, h1), P(dentro1, 0),
      [uvPiedra(0, 0), uvPiedra(0, h1), uvPiedra(ANCHO_BROCAL, h1), uvPiedra(ANCHO_BROCAL, 0)]);
    trozos++;
  }
  const anillo = { length: trozos };

  // --- el sello, a la vista desde la calle -----------------------------------
  //
  // La reja del fondo dice que no se pasa a quien YA ha bajado. Desde la calle
  // no se ve nada de ella: solo un agujero con brocal, que es una invitacion.
  // Asi que la guarnicion cierra tambien arriba, en la boca de la trinchera, y
  // eso es lo que se lee desde lejos: la escalera empieza detras de una reja.
  const bocaTrinchera = TRINCHERA.desde - 0.3;
  for (const x of hojas) poner("door_stone_metal_grate", x, 0, bocaTrinchera, 0, "reja-calle");
  // Las jambas, una a cada lado del pasillo, y el travesano encima.
  //
  // El `- 1` estaba escrito `+ 1`, y no lo cazo nada. `poner` recibe la `w` del
  // borde NORTE de la pieza y la pieza crece dos metros hacia el SUR, asi que
  // sumar uno para centrarla en la reja la corria DOS metros al sur: las dos
  // jambas acababan fuera de la parcela, plantadas en el patio de control, y la
  // boca de la trinchera se quedaba abierta de par en par. En el plano dibujado
  // no sale -las jambas no son celdas-, en una captura de frente tampoco -se ven
  // dos bloques de piedra a los lados, que es lo que tiene que verse- y ninguna
  // cifra cambia. Se vio andando hacia ella.
  poner("stone_square_half_1m", CRATER.cx - medio - 2, 0, bocaTrinchera - 1, 0, "jamba");
  poner("stone_square_half_1m", CRATER.cx + medio, 0, bocaTrinchera - 1, 0, "jamba");

  // Aquí hubo un "revestimiento del corte": una fila de bloques a cada lado de
  // la trinchera, desde el labio hasta la reja. Se puso para tapar dos franjas
  // de 60 cm que el brocal dejaba abiertas a los lados del tajo, y **se quitó**
  // por dos razones que se descubrieron a la vez:
  //
  //   flotaban   la trinchera atraviesa el crater, así que de las seis piezas
  //              CUATRO caían sobre el agujero, con la roca a cuatro metros por
  //              debajo. Desde arriba se ven bloques de piedra suspendidos en
  //              mitad del socavón. La medida que lo dijo es de una línea:
  //              preguntarle a `alturaRoca()` qué hay bajo cada pieza.
  //   sobraban   el hueco del brocal se estrechó de `medio + 0,6` a
  //              `medio + 0,45`, así que las franjas miden ahora 45 cm. El
  //              jugador mide un metro de ancho: por 45 cm no pasa. El sello lo
  //              cierra la geometría del brocal y no hace falta nada encima.
  //
  // Lo comprueba la sonda de asaltos de tools/andar.mjs, que es quien manda.


  // --- el tejadillo de la boca ------------------------------------------------
  //
  // Sin él la boca es una reja entre dos cajas de piedra, abierta al cielo: se
  // ve que son módulos cuadrados del pack puestos de canto y no se lee como una
  // entrada, se lee como material de obra. Un puesto que se guarda de día y de
  // noche tiene su techo, y el pack trae uno hecho para tapar un módulo de
  // cuatro metros a cuatro aguas.
  //
  // Va sobre cuatro postes, dos por delante y dos por detrás. Con dos se
  // sostiene igual de bien en un render y se lee como un porche a medio montar.
  // Las cotas salen de las cajas medidas de las dos piezas, no de tantear:
  //
  //   el poste     mide 3,0975 m de alto y apoya en cero.
  //   el tejado    va de −0,37 a +2,17 respecto de donde se le ponga, porque
  //                está hecho para SOLAPAR un muro, no para apoyarse encima.
  //
  // Así que colocándolo a la altura del poste, el alero queda 0,37 m por debajo
  // de la punta y el poste entra dentro del tejado, que es para lo que el pack
  // lo hizo. Puesto a 2,6 -«a la altura del travesaño»- el alero caía a 2,23 y
  // los cuatro postes atravesaban el tejado de lado a lado.
  const POSTE_ALTO = 3.0975;
  const VUELO = 2.38;      // medio lado del tejado: sale de la caja del .glb
  for (const dx of [-medio - 0.55, medio + 0.55]) {
    for (const dw of [-1.2, 1.0]) {
      poner("wood_support_beam_metal", CRATER.cx + dx, 0, bocaTrinchera + dw, 0, "poste");
    }
  }
  // Y CENTRADO sobre el portón, que es la otra mitad del fallo.
  //
  // `poner` recibe la `w` del borde norte y la pieza crece hacia el SUR, así que
  // sumar el vuelo la corre un lado entero: el tejado acababa entre w=13,3 y
  // w=18,1 -fuera de la parcela, sobre el patio- mientras los postes se quedaban
  // en 10,3. Un tejado flotando a cinco metros de sus postes. Es el mismo error
  // de signo que ya corrió las jambas dos metros al sur, y cuesta reconocerlo
  // porque desde algunos ángulos el tejado tapa igual.
  poner("roof_red_square", CRATER.cx - VUELO, POSTE_ALTO, bocaTrinchera - VUELO, 0, "tejadillo");

  // --- el torno: lo que sube lo que pesa -------------------------------------
  // Dos postes con herraje, y entre ellos el tambor y la cuerda, generados. Era
  // lo unico de esta parcela anotado como «hay que modelarlo aparte», y no hacia
  // falta: un tambor es un cilindro.
  const wTorno = CRATER.cw + 5.6;
  poner("wood_support_beam_metal", CRATER.cx - 2.4, 0, wTorno, 0, "torno");
  poner("wood_support_beam_metal", CRATER.cx + 2.4, 0, wTorno, 0, "torno");
  avisos.push("la manivela y el herraje del torno siguen sin existir: candidatos a Blender");

  // La roca y el torno se devuelven juntos para DIBUJAR -comparten material, y
  // que la boca sea una sola malla era la gracia de fusionarlos- y separados
  // para COLISIONAR. No es una comodidad: una cuerda no es un muro.
  //
  // El torno es una horca sobre la boca de la trinchera, que es el unico sitio
  // con suelo firme donde plantar dos postes, y su cuerda cae por el hueco: o
  // sea, justo por el eje de la escalera, de 2,47 m hasta el fondo del socavon.
  // Metida en el trimesh, esos 20 cm de cuerda son una pared de 6,5 m de alta
  // cruzada en mitad del unico paso, y el jugador se queda clavado delante.
  //
  // No lo vio nadie: en el plano la cuerda no es una celda, en las fichas de la
  // boca se ve una cuerda colgando -que es lo que tiene que verse- y el recuento
  // de triangulos es el mismo. Se vio andando hacia la reja.
  const solida = generarRoca({ paso });
  // El brocal va con la ROCA y no con el torno: es macizo y tiene que chocar.
  // Es, de hecho, lo único que impide entrar al socavón por el borde.
  unir(solida, brocal);
  const torno = generarTorno({ cx: CRATER.cx, w: wTorno, altura: 2.75, largo: 4.6 });
  mover(solida, origen);
  mover(torno, origen);
  const roca = nuevaMalla();
  unir(roca, solida);
  unir(roca, torno);

  return {
    piezas,
    roca,
    /** La misma roca sin el torno: lo que se le da a Rapier. */
    rocaSolida: solida,
    avisos,
    medidas: {
      hondo: HONDO,
      tramos: TRAMOS,
      carrera: TRAMO.carrera * TRAMOS,
      lado: LADO,
      triangulos: roca.idx.length / 3,
      brocal: anillo.length,
      triangulosBrocal: brocal.idx.length / 3,
    },
  };
}
