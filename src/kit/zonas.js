// Las zonas del jharro: dónde se está a salvo y dónde no.
//
// Es la parte que no se puede adivinar mirando capturas, y Gate City la lleva
// escrita EN SUS ENTIDADES: `msarea_town` marca lo seguro, `msarea_monsterspawn`
// dónde reaparecen los bichos, `ms_player_spawn` por dónde se entra y
// `msarea_transition` por dónde se va a otro mapa. Se mide con
// `npm run bsp -- <ruta> --zonas`.
//
// ── Lo que la medida dijo, y contradice lo que haríamos por defecto ─────────
//
// Lo obvio sería «un pueblo con una puerta a las cavernas detrás». Gate City es
// justo lo contrario:
//
//   el 43 % del suelo pisable es zona segura — el pueblo NO es el mapa;
//   se ENTRA por la cueva: las dos salidas están a 3 y 84 m del punto de llegada,
//   y al pueblo más cercano hay 46 m, mientras que al primer monstruo hay 13;
//   los bichos flojos y el tesoro están PEGADOS al pueblo (a 61-64 y 75 m), no en
//   el confín; lo duro —el orco— está a 33 m, en la puerta.
//
// O sea que el fondo del mapa no es lo difícil: es lo lejos. Y la zona de
// misiones de principiante no está en el confín, está en el sótano del pueblo.
//
// ── De dónde sale la frontera ───────────────────────────────────────────────
//
// No de dibujarla. La cadena es: la altura libre medida decide dónde cabe una
// fachada de 3 m; donde hay fachadas hay pueblo; el pueblo crece desde lo
// construido hasta ocupar el 43 % del suelo que midió Gate City. Cada eslabón es
// una medida, así que mover la medida mueve la frontera.

import { CELDA } from "./house.js";
import {
  PLANTAS, ENTRADA, ENTRADA_PLANTA, transitable, alcanzables, distancias,
  cotaMundo, tramoDe,
} from "./jharro.js";
import { hash2 } from "../util/noise.js";

// --- lo medido de Gate City ---------------------------------------------------

/** Qué parte del suelo pisable es zona segura. Medido: 3 613 m² de 8 377. */
export const FRACCION_SEGURA = 0.43;

/** Cuántos m² de suelo por criadero. Medido: 16 criaderos en 8 377 m². */
export const SUELO_POR_CRIADERO = 524;

/** Lo que mide un criadero. Medido: 22 m² de media, o sea celda y media. */
export const AREA_CRIADERO = 22;

/**
 * A qué distancia de la frontera del pueblo están los bichos flojos.
 *
 * En Gate City la rata y el esqueleto están a 61 y 64 m de la entrada y el
 * pueblo más cercano a 46: o sea unos 15 m de la frontera, y el tesoro a 75,
 * unos 30. En celdas de 4 m son 4 y 7. Se toma el radio corto, que es el que
 * define «el sótano del pueblo».
 */
export const CELDAS_PRINCIPIANTE = 4;

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const k3 = (p, x, z) => `${p},${x},${z}`;

/** Las celdas vecinas de una, dentro de su planta y por las conexiones. */
export function vecinas(plan, p, x, z) {
  const out = [];
  for (const [dx, dz] of DIRS) {
    if (transitable(plan, p, x + dx, z + dz)) out.push([p, x + dx, z + dz]);
  }
  for (const e of plan.enlaces) {
    const a = [e.arriba.planta, ...e.arriba.celda];
    const b = [e.abajo.planta, ...e.abajo.celda];
    if (a[0] === p && a[1] === x && a[2] === z) out.push(b);
    if (b[0] === p && b[1] === x && b[2] === z) out.push(a);
  }
  return out;
}

/** Todas las celdas pisables, en orden fijo. */
export function todasLasCeldas(plan) {
  const out = [];
  for (const pl of plan.plantas) {
    for (const k of [...pl.suelo.keys()].sort()) {
      const [x, z] = k.split(",").map(Number);
      out.push([pl.indice, x, z]);
    }
  }
  return out;
}

/**
 * Reparte el jharro en zona segura y cueva.
 *
 * El pueblo crece DESDE lo construido, por el grafo de lo pisable, hasta llegar
 * a la fracción medida. Crece por cercanía a una fachada y no por cercanía a la
 * entrada: lo que hace pueblo a un sitio es que haya casas, no que esté cerca de
 * la puerta — y de hecho en Gate City la puerta está fuera del pueblo.
 */
export function repartirZonas(plan, ciudad) {
  const celdas = todasLasCeldas(plan);
  const objetivo = Math.round(celdas.length * FRACCION_SEGURA);

  // Las semillas: las celdas de galería que tienen una fachada delante.
  const semillas = [];
  const vistas = new Map(); // clave -> distancia a la fachada más cercana
  for (const f of ciudad.fachadas) {
    const k = k3(f.planta, f.x, f.z);
    if (vistas.has(k)) continue;
    vistas.set(k, 0);
    semillas.push([f.planta, f.x, f.z]);
  }

  // Se crece generosamente desde TODAS las fachadas, anillo a anillo, y luego se
  // eligen BARRIOS ENTEROS, los más grandes primero, hasta llegar a la fracción
  // medida.
  //
  // El primer intento crecía hasta el 43 % y paraba. Salía clavado —43 %— y el
  // pueblo eran DOCE trozos sueltos con el mayor al 20 %: confeti repartido por
  // seis plantas, incluidas dos celdas a 236 m de profundidad en el fondo del
  // mundo. Gate City tiene ocho áreas y la mayor se lleva el 53 %: un pueblo
  // grande y unos cuantos rincones. Los dos repartos miden el mismo 43 % de
  // suelo seguro, y solo uno de los dos es un pueblo.
  const RADIO_MAX = 6;
  let frente = semillas;
  for (let radio = 1; radio <= RADIO_MAX; radio++) {
    const siguiente = [];
    for (const [p, x, z] of frente) {
      for (const v of vecinas(plan, p, x, z)) {
        const k = k3(...v);
        if (vistas.has(k)) continue;
        vistas.set(k, radio);
        siguiente.push(v);
      }
    }
    frente = siguiente;
  }

  const barrios = trozosDe(plan, new Set(vistas.keys()));
  const pueblo = new Set();
  for (const barrio of barrios) {
    if (pueblo.size >= objetivo) break;
    // Un barrio que se pasa del objetivo entra recortado por su parte más lejana
    // a una fachada: lo que sobra de un barrio es su extrarradio, no su centro.
    const orden = [...barrio].sort(
      (a, b) => (vistas.get(a) ?? 0) - (vistas.get(b) ?? 0) || (a < b ? -1 : 1)
    );
    for (const k of orden) {
      if (pueblo.size >= objetivo) break;
      pueblo.add(k);
    }
  }

  const cueva = celdas.filter((c) => !pueblo.has(k3(...c)));
  return { pueblo, cueva, objetivo, barrios, distanciaAFachada: vistas };
}

/**
 * Cuántos trozos sueltos tiene la zona segura.
 *
 * Gate City tiene 8 áreas y una se lleva el 53 % del total: un pueblo grande y
 * unos cuantos rincones. Un reparto que diera cuarenta trozos de dos celdas no
 * sería un pueblo, sería confeti — y mediría exactamente el mismo 43 %.
 */
export function trozosDe(plan, conjunto) {
  const pendientes = new Set(conjunto);
  const trozos = [];
  while (pendientes.size) {
    const primera = pendientes.values().next().value;
    pendientes.delete(primera);
    const cola = [primera.split(",").map(Number)];
    const trozo = [primera];
    while (cola.length) {
      const [p, x, z] = cola.pop();
      for (const v of vecinas(plan, p, x, z)) {
        const k = k3(...v);
        if (!pendientes.has(k)) continue;
        pendientes.delete(k);
        trozo.push(k);
        cola.push(v);
      }
    }
    trozos.push(trozo);
  }
  return trozos.sort((a, b) => b.length - a.length);
}

/**
 * Los criaderos: dónde reaparecen los bichos.
 *
 * En cueva, nunca en el pueblo, repartidos y con separación. El número sale de
 * la densidad medida —un criadero por cada 524 m² de suelo— y no de elegirlo.
 *
 * Se eligen los más lejos del pueblo primero: un criadero pegado a la frontera
 * escupe monstruos dentro de la zona segura en cuanto uno camine dos celdas, y
 * eso no lo dice ninguna cifra de densidad.
 */
export function elegirCriaderos(plan, zonas, { separacion = 4 } = {}) {
  const celdas = todasLasCeldas(plan);
  const cuantos = Math.round((celdas.length * CELDA * CELDA) / SUELO_POR_CRIADERO);
  // Distancia de cada celda de cueva a la frontera del pueblo.
  const d = new Map();
  const cola = [];
  for (const k of zonas.pueblo) {
    d.set(k, 0);
    cola.push(k.split(",").map(Number));
  }
  for (let i = 0; i < cola.length; i++) {
    const [p, x, z] = cola[i];
    const paso = d.get(k3(p, x, z)) + 1;
    for (const v of vecinas(plan, p, x, z)) {
      const k = k3(...v);
      if (d.has(k)) continue;
      d.set(k, paso);
      cola.push(v);
    }
  }
  const candidatas = zonas.cueva
    .map((c) => ({ c, lejos: d.get(k3(...c)) ?? 0, r: hash2(c[1] * 7919 + c[0], c[2] * 131) }))
    .sort((a, b) => b.lejos - a.lejos || a.r - b.r);

  const puestos = [];
  for (const { c, lejos } of candidatas) {
    if (puestos.length >= cuantos) break;
    // Separados entre sí: dos criaderos en celdas vecinas son un criadero doble.
    if (puestos.some((q) => q.planta === c[0] && Math.abs(q.x - c[1]) + Math.abs(q.z - c[2]) < separacion)) continue;
    puestos.push({ planta: c[0], x: c[1], z: c[2], deLaFrontera: lejos });
  }
  return { criaderos: puestos, cuantos };
}

/**
 * La zona de principiantes: la cueva pegada al pueblo.
 *
 * En Gate City la rata gigante y el esqueleto están a unos 15 m de la frontera
 * del pueblo y el tesoro a unos 30, mientras que lo duro está a 33 m de la
 * ENTRADA, en la otra punta. O sea que lo de empezar no está en el confín: está
 * en el sótano de casa, que es donde tiene que estar para que un jugador nuevo
 * pueda volver andando.
 */
export function zonaPrincipiantes(plan, zonas, { radio = CELDAS_PRINCIPIANTE } = {}) {
  const d = new Map();
  const cola = [];
  for (const k of zonas.pueblo) {
    d.set(k, 0);
    cola.push(k.split(",").map(Number));
  }
  const dentro = [];
  for (let i = 0; i < cola.length; i++) {
    const [p, x, z] = cola[i];
    const paso = d.get(k3(p, x, z)) + 1;
    if (paso > radio) continue;
    for (const v of vecinas(plan, p, x, z)) {
      const k = k3(...v);
      if (d.has(k)) continue;
      d.set(k, paso);
      if (!zonas.pueblo.has(k)) dentro.push({ planta: v[0], x: v[1], z: v[2], deLaFrontera: paso });
      cola.push(v);
    }
  }
  return dentro;
}

/**
 * Las transiciones: por dónde se entra y por dónde se sigue.
 *
 * Gate City tiene dos, a 3 y 84 m de la llegada. Aquí la de llegada es la reja
 * del socavón de Corinth —no se inventa, ya existe— y la otra es lo que el lore
 * de Corinth lleva escrito desde el principio: «portales en lo más hondo,
 * remanente de los invasores». Va en la planta del fondo, en la celda más lejos
 * de la entrada, que es donde se acaba el camino.
 */
export function transiciones(plan) {
  const d = distancias(plan);
  const fondo = plan.plantas[0];
  let mejor = null;
  for (const k of fondo.suelo.keys()) {
    const [x, z] = k.split(",").map(Number);
    const paso = d.get(k3(fondo.indice, x, z));
    if (paso === undefined) continue;
    if (!mejor || paso > mejor.pasos) mejor = { planta: fondo.indice, x, z, pasos: paso };
  }
  return [
    { nombre: "socavón de Corinth", planta: ENTRADA_PLANTA, x: ENTRADA[0], z: ENTRADA[1], pasos: 0, destino: "corinth" },
    mejor && { nombre: "los portales del fondo", ...mejor, destino: null },
  ].filter(Boolean);
}

/**
 * El plano de juego entero.
 *
 * Declara los SITIOS —zona segura, cueva, criaderos, zona de principiantes,
 * transiciones— y no pone ni un monstruo. Poner contenido encima de un mundo que
 * todavía no ha andado nadie es apilar trabajo sobre algo que puede estar
 * torcido, y de los cinco fallos gordos de Corinth, cuatro los encontró un
 * cuerpo y ninguno una cifra.
 */
export function planDeJuego(plan, ciudad) {
  const zonas = repartirZonas(plan, ciudad);
  const { criaderos, cuantos } = elegirCriaderos(plan, zonas);
  const principiantes = zonaPrincipiantes(plan, zonas);
  const puertas = transiciones(plan);
  const trozos = trozosDe(plan, zonas.pueblo);
  const d = distancias(plan);

  const celdas = todasLasCeldas(plan);
  const m2 = (n) => n * CELDA * CELDA;
  // A qué distancia de la entrada empieza el pueblo. En Gate City son 46 m, y
  // esta cifra es la que dice si se entra por el pueblo o por la cueva.
  let alPueblo = Infinity;
  for (const k of zonas.pueblo) {
    const v = d.get(k);
    if (v !== undefined) alPueblo = Math.min(alPueblo, v);
  }

  const porPlanta = {};
  for (const c of celdas) {
    const cota = PLANTAS[c[0]].cota;
    porPlanta[cota] = porPlanta[cota] ?? { pueblo: 0, cueva: 0 };
    porPlanta[cota][zonas.pueblo.has(k3(...c)) ? "pueblo" : "cueva"]++;
  }

  return {
    zonas,
    criaderos,
    principiantes,
    transiciones: puertas,
    trozos,
    medidas: {
      celdas: celdas.length,
      pueblo: zonas.pueblo.size,
      cueva: zonas.cueva.length,
      fraccion: zonas.pueblo.size / celdas.length,
      m2Pueblo: m2(zonas.pueblo.size),
      m2Cueva: m2(zonas.cueva.length),
      trozos: trozos.length,
      mayor: trozos[0]?.length ?? 0,
      criaderos: criaderos.length,
      criaderosObjetivo: cuantos,
      principiantes: principiantes.length,
      alPueblo: alPueblo * CELDA,
      porPlanta,
    },
  };
}
