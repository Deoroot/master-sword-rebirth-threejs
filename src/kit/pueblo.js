// Corinth montado: de las PARCELAS del plano a la lista de piezas colocadas.
//
// Es el programa que faltaba. El plano existía y estaba comprobado, las casas
// existían y tenían ficha, y entre las dos cosas no había nada: nadie recorría
// `PARCELAS` poniendo casas. Esto lo hace, y no escribe ni una coordenada: cada
// casa sale de `planHouse`, cada posición sale del rectángulo de su parcela y
// cada giro sale de mirar qué hay al otro lado de sus cuatro lados.
//
// ── Por qué las casas no miran todas al sur ──────────────────────────────────
//
// Porque una casa con la puerta a la pared de la de al lado no es una casa, es
// un decorado visto desde el lado bueno. Y porque el fallo no lo caza ninguna
// cifra: el pueblo mide lo mismo, sella lo mismo y tiene las mismas piezas con
// las doce puertas dando al río que con las doce dando a la calle.
//
// El rumbo de cada casa se CALCULA: para cada uno de los cuatro lados de la
// parcela se cuenta cuántas celdas de calle hay pegadas a él y cuántas en la
// fila siguiente, contando solo las que se alcanzan desde el portón. Gana el
// lado con más calle. Una calle de verdad vence a un callejón porque tiene
// segunda fila; una pared medianera puntúa cero porque su vecina es una casa.
//
// ── El eje que está del revés, y hay que saberlo ─────────────────────────────
//
// `house.js` tiene sus propios nombres de cara y son internamente coherentes:
// la casa crece hacia +X y hacia −Z, y su cara «sur» es la de z=0. Pero el mapa
// de celdas de `corinth.js` cuenta las filas de NORTE a SUR, o sea que la fila
// z=0 es la del norte y el mundo va hacia −Z según se baja.
//
// Resultado: la cara que `house.js` llama «sur» mira al NORTE del pueblo. No es
// un error de nadie -los dos archivos son coherentes consigo mismos- pero si se
// arrastra sin darse cuenta, las doce casas salen giradas media vuelta, la
// captura sigue siendo bonita y ninguna cifra cambia. Por eso la traducción
// está escrita una sola vez, aquí abajo, y hay una prueba que la clava.

import { CELDA, CARAS, planHouse } from "./house.js";
import { CASAS } from "./casas.js";
import { planBoca, PARCELA as PARCELA_BOCA } from "./boca.js";
import {
  ANCHO, FONDO, PARCELAS, LLEGADA, PUENTE, rect, transitable, alcanzables,
} from "./corinth.js";
import { nuevaMalla, unir } from "./malla.js";
import { generarValla, vallaRect } from "./cerco.js";
import { recorridoValla, bordesEn, cauceEn, semiEn } from "./rio.js";

/**
 * Los cuatro rumbos del pueblo: hacia dónde va cada uno en celdas y qué giro de
 * Three.js hace que una pieza mire hacia allí.
 *
 * `yaw` es el giro que lleva el eje +Z local de una pieza hasta ese rumbo, que
 * es la convención que ya usan las puertas y ventanas del kit: una puerta en la
 * cara z=0 va con giro 0 y mira hacia +Z.
 */
export const RUMBOS = {
  // El norte del pueblo es la fila z=0, y el mundo va hacia −Z al bajar de fila:
  // por tanto mirar al norte es mirar hacia +Z, que es giro cero.
  norte: { dx: 0, dz: -1, yaw: 0 },
  sur: { dx: 0, dz: 1, yaw: Math.PI },
  este: { dx: 1, dz: 0, yaw: Math.PI / 2 },
  oeste: { dx: -1, dz: 0, yaw: -Math.PI / 2 },
};

/** El orden en que se deshacen los empates a todo. Arbitrario, pero fijo. */
const ORDEN = ["sur", "norte", "este", "oeste"];

/**
 * A cuántos pasos de la llegada queda cada celda, por la calle.
 *
 * Es `alcanzables()` con la cuenta puesta: la misma inundación en cruz, pero
 * guardando la distancia en vez de solo el hecho de haber llegado. Hace falta
 * porque la fachada de la casa la decide, en la mayoría de las parcelas de
 * Corinth, no cuánta calle hay -hay por los cuatro lados- sino cuál de las
 * cuatro calles es la que usa la gente.
 */
export function distancias(desde = LLEGADA) {
  const d = new Map();
  if (!transitable(desde[0], desde[1])) return d;
  d.set(desde.join(","), 0);
  const cola = [desde];
  for (let i = 0; i < cola.length; i++) {
    const [x, z] = cola[i];
    const paso = d.get(`${x},${z}`) + 1;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      const clave = `${nx},${nz}`;
      if (d.has(clave) || !transitable(nx, nz)) continue;
      d.set(clave, paso);
      cola.push([nx, nz]);
    }
  }
  return d;
}

/** La esquina noroeste de una celda, en metros de mundo. */
export function celdaAMundo(x, z) {
  return [x * CELDA, 0, -z * CELDA];
}

/** El rectángulo de una parcela en metros de mundo: [x0,x1] × [z0,z1]. */
export function rectMundo(p) {
  const r = rect(p);
  return {
    x0: r.x * CELDA,
    x1: (r.x + r.ancho) * CELDA,
    // z crece hacia el norte, así que el mínimo es el borde SUR.
    z0: -(r.z + r.fondo) * CELDA,
    z1: -r.z * CELDA,
  };
}

/**
 * Hacia dónde mira una parcela, y con qué cuentas se decidió.
 *
 * Dos criterios, en este orden:
 *
 *   fachada    cuántas celdas de calle ALCANZABLE hay pegadas a ese lado. Una
 *              medianera puntúa cero, porque lo que tiene al otro lado es una
 *              casa; el río también, porque no se pisa.
 *   la calle   a cuántos pasos de la llegada queda la más cercana de esas
 *              celdas. Entre dos calles, la casa da a la que usa la gente.
 *
 * El segundo criterio no es un adorno: en Corinth **todas las parcelas menos
 * tres empatan a fachada**, porque el plano las dejó exentas, con calle por los
 * cuatro lados. O sea que en quince de dieciocho lo que decide de verdad es la
 * distancia, y conviene que eso esté escrito y no escondido en un desempate.
 *
 * Un primer intento puntuaba además la SEGUNDA fila de calle, para distinguir
 * una calle de un hueco entre dos casas. Salía al revés: premiaba el callejón
 * de dos celdas contra la muralla -que tiene segunda fila- y castigaba la calle
 * pasante -cuya segunda fila es la espalda de la casa de enfrente-. Las doce
 * casas miraban a la muralla y ni una cifra bajaba.
 */
export function rumboDeCalle(p, alcanzadas = alcanzables(), dist = distancias()) {
  const r = rect(p);
  const puntuaciones = {};
  for (const [nombre, v] of Object.entries(RUMBOS)) {
    const largo = v.dx !== 0 ? r.fondo : r.ancho;
    let fachada = 0;
    let cerca = Infinity;
    for (let k = 0; k < largo; k++) {
      // La celda de fuera de la parcela en el paso k de ese lado.
      const [x, z] = v.dx !== 0
        ? [v.dx > 0 ? r.x + r.ancho : r.x - 1, r.z + k]
        : [r.x + k, v.dz > 0 ? r.z + r.fondo : r.z - 1];
      if (!transitable(x, z) || !alcanzadas.has(`${x},${z}`)) continue;
      fachada++;
      cerca = Math.min(cerca, dist.get(`${x},${z}`) ?? Infinity);
    }
    puntuaciones[nombre] = { fachada, cerca };
  }
  let rumbo = ORDEN[0];
  for (const nombre of ORDEN) {
    const a = puntuaciones[nombre];
    const b = puntuaciones[rumbo];
    if (a.fachada > b.fachada || (a.fachada === b.fachada && a.cerca < b.cerca)) rumbo = nombre;
  }
  const mejor = puntuaciones[rumbo];
  // Cuántos lados empataban a fachada con el ganador: es la medida de cuánto
  // decidió la distancia y cuánto la fachada, y se devuelve para poder mirarla.
  const empates = ORDEN.filter((n) => puntuaciones[n].fachada === mejor.fachada).length;
  return { rumbo, puntuaciones, empates, tapiada: mejor.fachada === 0 };
}

/** Gira un punto alrededor del eje Y, como hace `rotation.y` de Three.js. */
export function giraXZ([x, y, z], yaw) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  // El cero exacto importa: sin él un giro de media vuelta deja −0 en las
  // coordenadas, y −0 no es 0 para Object.is ni, por tanto, para node --test.
  const rx = x * c + z * s;
  const rz = -x * s + z * c;
  return [rx === 0 ? 0 : rx, y, rz === 0 ? 0 : rz];
}

/** Normaliza un ángulo a (−π, π], para que dos giros iguales se lean iguales. */
export function normaliza(a) {
  const dosPi = Math.PI * 2;
  let v = a % dosPi;
  if (v > Math.PI) v -= dosPi;
  if (v <= -Math.PI) v += dosPi;
  return v === 0 ? 0 : v;
}

/**
 * Coloca un plano de casa dentro de una parcela, mirando a un rumbo.
 *
 * Dos operaciones, y las dos calculadas:
 *
 *   girar    el plano entero alrededor de su origen, sumando el mismo ángulo al
 *            giro de cada pieza. La huella gira con él, así que una casa de 2×1
 *            celdas pasa a ocupar 1×2 y hay que volver a medirla, no suponerla.
 *   arrimar  la fachada contra el borde de la parcela que da a la calle, y
 *            centrarla en el otro eje. Dejarla en el centro de la parcela deja
 *            un metro de nada entre la puerta y la calle en cada casa, y eso
 *            sumado por doce es otra vez el descampado.
 */
export function colocaPlan(plan, p, rumbo) {
  const cara = plan.puertaCara ?? "sur";
  // El giro es el que lleva la cara de la puerta hasta el rumbo pedido. La cara
  // ya sabe hacia dónde mira sin girar -es su `giro` en house.js-, así que esto
  // es una resta y no una tabla de casos.
  const yaw = normaliza(RUMBOS[rumbo].yaw - CARAS[cara].giro);

  const piezas = plan.piezas.map((q) => ({
    ...q,
    pos: giraXZ(q.pos, yaw),
    giro: normaliza((q.giro ?? 0) + yaw),
  }));

  // La huella girada, midiendo las cuatro esquinas. Rotar solo min y max daría
  // una caja que no contiene la casa en cuanto el giro no sea múltiplo de π.
  const A = plan.ancho * CELDA;
  const F = plan.fondo * CELDA;
  const esquinas = [[0, 0, 0], [A, 0, 0], [A, 0, -F], [0, 0, -F]].map((v) => giraXZ(v, yaw));
  const bx0 = Math.min(...esquinas.map((v) => v[0]));
  const bx1 = Math.max(...esquinas.map((v) => v[0]));
  const bz0 = Math.min(...esquinas.map((v) => v[2]));
  const bz1 = Math.max(...esquinas.map((v) => v[2]));

  const m = rectMundo(p);
  const avisos = [];
  if (bx1 - bx0 > m.x1 - m.x0 + 1e-9 || bz1 - bz0 > m.z1 - m.z0 + 1e-9) {
    avisos.push(
      `girada al ${rumbo}, la casa mide ${(bx1 - bx0).toFixed(1)}×${(bz1 - bz0).toFixed(1)} m ` +
        `y la parcela ${(m.x1 - m.x0).toFixed(1)}×${(m.z1 - m.z0).toFixed(1)}: se sale`
    );
  }

  // Arrimar: pegado al borde por el eje del rumbo, centrado en el otro.
  const centraX = (m.x0 + m.x1) / 2 - (bx0 + bx1) / 2;
  const centraZ = (m.z0 + m.z1) / 2 - (bz0 + bz1) / 2;
  let dx = centraX;
  let dz = centraZ;
  if (rumbo === "norte") dz = m.z1 - bz1;
  else if (rumbo === "sur") dz = m.z0 - bz0;
  else if (rumbo === "este") dx = m.x1 - bx1;
  else dx = m.x0 - bx0;

  for (const q of piezas) q.pos = [q.pos[0] + dx, q.pos[1], q.pos[2] + dz];

  return {
    piezas,
    yaw,
    rumbo,
    avisos,
    huella: { x0: bx0 + dx, x1: bx1 + dx, z0: bz0 + dz, z1: bz1 + dz },
  };
}

// --- los adornos de las parcelas que no se edifican ---------------------------

/**
 * Lo que se reparte por el mercado y el patio de control.
 *
 * Sin nada, las dos parcelas son un cuadrado de losas: se leen como el solar de
 * un edificio que falta, no como una plaza. Con esto se leen como un sitio donde
 * pasa algo. Las posiciones salen de una fórmula y no de una lista para que
 * sigan dentro cuando la parcela cambie de tamaño.
 */
export function adornosDe(p) {
  const m = rectMundo(p);
  const piezas = [];
  const poner = (pieza, x, z, giro, papel) =>
    piezas.push({ pieza, pos: [x, 0, z], giro, papel });

  if (p.papel === "mercado") {
    // Cuatro puestos, uno por cuadrante, y un pasillo en cruz entre ellos: es la
    // forma más barata de que se vea que hay calle dentro de la plaza.
    const tipos = ["barrel", "crate", "haybale", "jutesack_closed"];
    const anchoM = m.x1 - m.x0;
    const fondoM = m.z1 - m.z0;
    for (let c = 0; c < 4; c++) {
      const cx = m.x0 + anchoM * (c % 2 ? 0.75 : 0.25);
      const cz = m.z0 + fondoM * (c < 2 ? 0.75 : 0.25);
      for (let k = 0; k < 3; k++) {
        const ang = (k / 3) * Math.PI * 2 + c;
        poner(
          tipos[(c + k) % tipos.length],
          cx + Math.cos(ang) * 1.1,
          cz + Math.sin(ang) * 1.1,
          ang,
          "mercado"
        );
      }
    }
  }

  if (p.papel === "patio") {
    // El parapeto era una fila de `stone_square_1m`: bloques de sillería de
    // cuatro metros de lado puestos de canto. De lejos pasa por pretil; de cerca
    // es un muro de castillo tirado en mitad de un patio, y no se parece a nada
    // que construyera una guarnición para separar una cola de gente. Ahora es
    // una valla de madera, que es lo que sería.
    poner("barrel", m.x0 + 2.4, m.z1 - 1.4, 0.4, "patio");
    poner("crate", m.x0 + 3.4, m.z1 - 2.2, 1.1, "patio");
    poner("haybale", m.x1 - 2.2, m.z0 + 1.6, 2.4, "patio");
  }

  return piezas;
}

// --- las vallas ----------------------------------------------------------------

/**
 * Todas las vallas de Corinth, en una sola malla.
 *
 * Tres trabajos distintos, y solo uno es decorado:
 *
 *   el río     es la que sostiene el lore. Corinth controla quién baja al
 *              agujero, y eso solo funciona si el puente es el ÚNICO paso. La
 *              valla es lo que lo hace verdad, y se abre justo en el puente.
 *   el patio   separa la cola de la gente del borde del río. Antes eran bloques
 *              de sillería de cuatro metros puestos de canto.
 *   las casas  cercan el trozo de parcela que la casa no ocupa. Eso es lo que
 *              convierte el hueco entre dos casas en un corral y no en un
 *              descampado con una casa al fondo.
 */
export function generarVallas() {
  const m = nuevaMalla();
  const cuenta = { rio: 0, puente: 0, patio: 0, parcelas: 0 };

  // --- la del río, por las dos orillas ---------------------------------------
  for (const lado of [0, 1]) {
    for (const tramo of recorridoValla(lado)) {
      // La valla se apoya en el borde de arriba de la ribera, que está a cero:
      // `alturaRibera` devuelve cero exacto fuera del corte y el retranqueo la
      // mete tierra adentro, así que la cota del pie es la calle.
      unir(m, generarValla(tramo, { paso: 2.2 }));
      cuenta.rio++;
    }
  }

  // --- los pretiles del puente -----------------------------------------------
  const pz0 = -(PUENTE.z + 1) * CELDA;
  const pz1 = -PUENTE.z * CELDA;
  // Los pretiles cubren SOLO el agua, no el ancho entero de la orilla.
  //
  // Empezaron yendo de borde a borde más medio metro, que es lo que parece
  // razonable hasta que alguien intenta salir del puente hacia el norte: el
  // pretil seguía tres metros tierra adentro y cerraba el paso a la boca. La
  // sonda de la ruta se plantó en el metro 61,6 y no pasó de ahí. Un pretil es
  // para no caerse al agua, así que acaba donde acaba el agua.
  const c = cauceEn(PUENTE.z + 0.5);
  const s = semiEn(PUENTE.z + 0.5) + 0.5;
  for (const z of [pz0 + 0.3, pz1 - 0.3]) {
    unir(m, generarValla([[c - s, z], [c + s, z]], { paso: 1.6, alto: 1.05 }));
    cuenta.puente++;
  }

  // --- el patio de control ---------------------------------------------------
  const patio = PARCELAS.find((p) => p.papel === "patio");
  if (patio) {
    const r = rectMundo(patio);
    // Cercado SOLO por el sur, y con su paso.
    //
    // El primer intento lo cercó por el norte también, y sin hueco. El norte del
    // patio es la boca, o sea el único sitio al que hay que poder ir: la sonda
    // de marcha se quedó a 10,6 m de la reja y la ruta se cortó en la meta 15 de
    // 16. En el plano de celdas no aparece —una valla no es una celda, así que
    // `alcanzables()` seguía diciendo que se llega— y en una captura tampoco:
    // una valla bien puesta cerrando el paso se ve igual de bien que una valla
    // bien puesta sin cerrarlo.
    //
    // Lo que el patio separa es el control del resto de la orilla este, y eso
    // está al sur. Al norte ya hay una reja, que para eso se puso.
    unir(m, vallaRect(r, ["sur"], 1.8));
    cuenta.patio++;
  }

  // --- las parcelas de casa --------------------------------------------------
  //
  // Solo el lado que da a la calle a la que mira la casa, y con su hueco: es lo
  // que se lee como una entrada. Cercar los cuatro lados de doce parcelas sería
  // un laberinto, y además taparía las medianeras, que no las ve nadie.
  const dist = distancias();
  const alcanzadas = alcanzables();
  for (const p of PARCELAS) {
    if (!p.casa || p.papel === "boca") continue;
    const { rumbo } = rumboDeCalle(p, alcanzadas, dist);
    unir(m, vallaRect(rectMundo(p), [rumbo], 1.7, { paso: 2.0, alto: 1.05 }));
    cuenta.parcelas++;
  }

  return { malla: m, cuenta };
}

// --- el pueblo entero ---------------------------------------------------------

/**
 * Monta Corinth: recorre `PARCELAS` y devuelve todo lo que hay que dibujar.
 *
 * Devuelve `{ parcelas, piezas, roca, avisos, medidas }`.
 *
 *   piezas   la lista plana de piezas del kit, ya en metros de mundo y con su
 *            giro. Es lo que come `buildFromPlan`.
 *   roca     la malla generada de la boca, ya movida a su parcela.
 *   avisos   lo que el plano pide y el kit no da. Se devuelven en vez de
 *            lanzarse, para que el pueblo se pueda mirar con el fallo dentro:
 *            una captura explica más que el texto de un error.
 */
export function montarCorinth({ paso } = {}) {
  const alcanzadas = alcanzables();
  const dist = distancias();
  const parcelas = [];
  const piezas = [];
  const avisos = [];
  let roca = null;
  let rocaSolida = null;

  for (const p of PARCELAS) {
    const m = rectMundo(p);
    const { rumbo, puntuaciones, empates, tapiada } = rumboDeCalle(p, alcanzadas, dist);
    const entrada = {
      nombre: p.nombre, papel: p.papel, rumbo, puntuaciones, empates, rect: m, piezas: [],
    };

    if (tapiada) {
      // Una parcela sin una sola celda de calle alcanzable alrededor no es un
      // solar, es un error del plano: la casa que se ponga ahí no la va a ver
      // nadie porque no se puede llegar.
      avisos.push(`'${p.nombre}' no tiene ni una celda de calle alcanzable alrededor`);
    }

    if (p.papel === "boca") {
      // La boca no gira. Su trinchera entra por el sur de su parcela, y al sur
      // tiene el patio de control, que es justo por donde se llega: girarla
      // sería mandar la escalera contra la muralla. Que siga siendo verdad lo
      // comprueba una prueba, no este comentario.
      const boca = planBoca({ origen: [m.x0, 0, m.z1], paso });
      entrada.piezas = boca.piezas;
      entrada.yaw = 0;
      roca = boca.roca;
      rocaSolida = boca.rocaSolida;
      entrada.medidas = boca.medidas;
      for (const a of boca.avisos) avisos.push(`${p.nombre}: ${a}`);
    } else if (p.casa) {
      const spec = CASAS[p.casa]?.spec;
      if (!spec) {
        avisos.push(`'${p.nombre}' pide la casa '${p.casa}', que no está en el catálogo`);
      } else {
        const plan = planHouse(spec);
        plan.puertaCara = spec.puerta?.cara ?? "sur";
        const puesta = colocaPlan(plan, p, rumbo);
        entrada.piezas = puesta.piezas;
        entrada.yaw = puesta.yaw;
        entrada.casa = p.casa;
        entrada.huella = puesta.huella;
        for (const a of [...plan.avisos, ...puesta.avisos]) avisos.push(`${p.nombre}: ${a}`);
      }
    } else {
      entrada.piezas = adornosDe(p);
      entrada.yaw = 0;
    }

    if (p.falta) avisos.push(`${p.nombre}: falta ${p.falta}`);
    for (const q of entrada.piezas) piezas.push({ ...q, parcela: p.nombre });
    parcelas.push(entrada);
  }

  if (!roca) avisos.push("no se montó la boca: el pueblo no tiene mazmorra");

  // Las vallas son malla generada, no piezas del kit: el pack CC0 no trae
  // ninguna. Van en la misma malla que la roca para que sigan siendo una sola
  // llamada de dibujo, y SI colisionan -al revés que la cuerda del torno-,
  // porque una valla es precisamente un muro.
  const vallas = generarVallas();

  // Todo lo generado, en dos versiones, y la diferencia importa:
  //
  //   generada         lo que se DIBUJA: roca, torno y vallas.
  //   generadaSolida   lo que se CHOCA: lo mismo menos la cuerda del torno.
  //
  // Una cuerda de 20 cm metida en el trimesh es un muro de seis metros y medio
  // cruzado en el eje de la escalera; una valla, en cambio, SÍ tiene que chocar,
  // porque es lo único que hace que el puente sea el único paso del río.
  const generada = unir(unir(nuevaMalla(), roca ?? nuevaMalla()), vallas.malla);
  const generadaSolida = unir(
    unir(nuevaMalla(), rocaSolida ?? nuevaMalla()),
    vallas.malla
  );

  const usadas = new Map();
  for (const q of piezas) usadas.set(q.pieza, (usadas.get(q.pieza) ?? 0) + 1);

  return {
    parcelas,
    piezas,
    roca,
    // Lo mismo sin la cuerda del torno. Se dibuja la de arriba y se colisiona
    // esta: ver el porque en src/kit/boca.js.
    rocaSolida,
    vallas: vallas.malla,
    generada,
    generadaSolida,
    avisos,
    medidas: {
      parcelas: parcelas.length,
      piezas: piezas.length,
      distintas: usadas.size,
      triangulosRoca: roca ? roca.idx.length / 3 : 0,
      triangulosValla: vallas.malla.idx.length / 3,
      vallas: vallas.cuenta,
      rumbos: parcelas.reduce((acc, e) => {
        acc[e.rumbo] = (acc[e.rumbo] ?? 0) + 1;
        return acc;
      }, {}),
    },
    usadas: [...usadas.entries()].sort((a, b) => b[1] - a[1]),
  };
}

/** Dónde aparece el jugador, en metros: el centro de la celda de llegada. */
export function puntoDeLlegada() {
  const [x, z] = LLEGADA;
  return [x * CELDA + CELDA / 2, 0, -z * CELDA - CELDA / 2];
}

export { ANCHO, FONDO, PARCELA_BOCA };
