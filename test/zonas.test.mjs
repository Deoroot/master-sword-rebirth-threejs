// El plano de juego del jharro: las zonas y la luz.
//
// Aquí se juzga lo que no es geometría: dónde se está a salvo, dónde reaparecen
// los bichos, por dónde se entra y por dónde se sigue. Es lógica pura sobre el
// grafo que ya existe, así que se comprueba en Node igual que `alcanzables()`, y
// todo sale de proporciones medidas de Gate City con `npm run bsp -- --zonas`.
//
// Las dos comprobaciones que de verdad mandan llevan control, porque una sonda
// sin control es una sonda que dice que sí:
//
//   las zonas   un reparto puede dar el 43 % medido y ser confeti. Se mide el
//               tamaño del barrio mayor, no solo el total.
//   la luz      una densidad media puede estar clavada y haber un rincón a
//               veinte metros de la vela más cercana. Se mide el alcance, y con
//               la mitad de los faroles tiene que empeorar.

import { test } from "node:test";
import assert from "node:assert/strict";
import { CELDA } from "../src/kit/house.js";
import {
  planJharro, PLANTAS, ENTRADA, ENTRADA_PLANTA, distancias, transitable, alcanzables,
  cotaMundo,
} from "../src/kit/jharro.js";
import { repartirAlturas, libreEn, celdasTunel } from "../src/kit/roca.js";
import { montarCiudad, LEJOS_DE_LA_ENTRADA } from "../src/kit/ciudad.js";
import {
  planDeJuego, repartirZonas, trozosDe, todasLasCeldas, vecinas,
  FRACCION_SEGURA, SUELO_POR_CRIADERO, CELDAS_PRINCIPIANTE,
} from "../src/kit/zonas.js";
import {
  montarLuz, alcanceDeLaLuz, cuantasLuces, repartir, sitioEnCelda,
  SUELO_POR_LUZ_PUEBLO, SUELO_POR_LUZ_CUEVA, COLOR, ALCANCE, ALTURA,
} from "../src/kit/luz.js";

const plan = planJharro();
const { alturas } = repartirAlturas(plan);
const ciudad = montarCiudad(plan, { alturas });
const juego = planDeJuego(plan, ciudad);
const luz = montarLuz(plan, juego.zonas, alturas);
const k3 = (p, x, z) => `${p},${x},${z}`;

// --- las zonas ----------------------------------------------------------------

test("la zona segura es la fracción de suelo que midió Gate City", () => {
  // 3 613 m² de 8 377 = el 43 %. Y se reparte sobre el SUELO pisable, no sobre
  // la huella: la huella incluye toda la roca maciza, y eso da el 21 %, que es
  // otra cifra y de otra cosa.
  assert.ok(
    Math.abs(juego.medidas.fraccion - FRACCION_SEGURA) < 0.02,
    `zona segura al ${(juego.medidas.fraccion * 100).toFixed(1)} %`
  );
  assert.equal(juego.medidas.pueblo + juego.medidas.cueva, juego.medidas.celdas);
});

test("EL CONTROL DE LAS ZONAS: el pueblo es un pueblo y no confeti", () => {
  // El 43 % sale igual de clavado repartido en doce trozos sueltos por seis
  // plantas que concentrado en un barrio. Gate City tiene ocho áreas y la mayor
  // se lleva el 53 % del total, o sea un pueblo grande y unos cuantos rincones.
  // Sin esta comprobación, la de arriba da por bueno el confeti.
  assert.ok(juego.medidas.trozos <= 10, `${juego.medidas.trozos} trozos de pueblo`);
  const mayor = juego.medidas.mayor / juego.medidas.pueblo;
  assert.ok(mayor > 0.3, `el barrio mayor es el ${(mayor * 100).toFixed(0)} % del pueblo`);
});

test("todo el pueblo se alcanza, y el pueblo es pisable", () => {
  const vistas = alcanzables(plan);
  for (const k of juego.zonas.pueblo) {
    const [p, x, z] = k.split(",").map(Number);
    assert.ok(transitable(plan, p, x, z), `(${k}) es pueblo y no se pisa`);
    assert.ok(vistas.has(k), `(${k}) es pueblo y no se llega`);
  }
});

test("el pueblo está donde están las casas, que es de donde crece", () => {
  // La cadena entera: la altura libre medida decide dónde cabe una fachada de
  // 3 m, donde hay fachadas hay pueblo, y el pueblo crece hasta el 43 % medido.
  // Cada eslabón es una medida.
  let fuera = 0;
  for (const f of ciudad.fachadas) {
    if (!juego.zonas.pueblo.has(k3(f.planta, f.x, f.z))) fuera++;
  }
  assert.ok(
    fuera < ciudad.fachadas.length * 0.25,
    `${fuera} de ${ciudad.fachadas.length} fachadas caen fuera de la zona segura`
  );
});

test("SE ENTRA POR LA CUEVA, no por el pueblo", () => {
  // Es la cifra que más contradice lo que se haría por defecto. En Gate City del
  // punto de llegada al pueblo más cercano hay 46 m, y al primer monstruo, 13.
  // Sin la regla de `LEJOS_DE_LA_ENTRADA`, el jharro ponía ocho fachadas en la
  // planta de la entrada y el pueblo empezaba a CUATRO metros de la reja de
  // Corinth: se bajaba el socavón y ya estabas en la plaza. El 43 % salía igual.
  assert.ok(
    juego.medidas.alPueblo >= LEJOS_DE_LA_ENTRADA * 0.7,
    `del socavón al pueblo hay ${juego.medidas.alPueblo} m, y Gate City mide 46`
  );
  assert.ok(
    !juego.zonas.pueblo.has(k3(ENTRADA_PLANTA, ENTRADA[0], ENTRADA[1])),
    "se llega directamente a la zona segura"
  );
});

test("la cueva se queda las plantas hondas, y el pueblo las de en medio", () => {
  // No se decide: sale. Las plantas hondas no tienen altura para una fachada de
  // 3 m y están lejos de la entrada, así que no hay casas y por tanto no hay
  // pueblo. En Gate City los monstruos están a −17..−19 y el pueblo a −12..−7.
  const honda = juego.medidas.porPlanta[PLANTAS[0].cota];
  assert.equal(honda.pueblo, 0, "hay zona segura en la planta del fondo");
  const conPueblo = Object.entries(juego.medidas.porPlanta).filter(([, v]) => v.pueblo > 0);
  assert.ok(conPueblo.length >= 2, "el pueblo está en una sola planta");
  assert.ok(conPueblo.length <= 5, "el pueblo está repartido por todas las plantas");
});

// --- criaderos, principiantes y transiciones ---------------------------------

test("los criaderos salen de la densidad medida y ninguno está en el pueblo", () => {
  // 16 criaderos en 8 377 m² = uno cada 524 m². Y un criadero dentro de la zona
  // segura no es un criadero, es una trampa: la zona segura deja de serlo sin
  // que cambie una sola cifra de superficie.
  const esperados = Math.round((juego.medidas.celdas * CELDA * CELDA) / SUELO_POR_CRIADERO);
  assert.equal(juego.medidas.criaderosObjetivo, esperados);
  assert.equal(juego.criaderos.length, esperados);
  for (const c of juego.criaderos) {
    assert.ok(!juego.zonas.pueblo.has(k3(c.planta, c.x, c.z)), `criadero en el pueblo: ${c.x},${c.z}`);
    assert.ok(transitable(plan, c.planta, c.x, c.z), "criadero en la roca");
    assert.ok(c.deLaFrontera >= 1, "criadero pegado a la frontera del pueblo");
  }
});

test("los criaderos están separados entre sí", () => {
  // Dos criaderos en celdas vecinas son un criadero doble, y la densidad medida
  // sigue saliendo bien.
  for (let i = 0; i < juego.criaderos.length; i++) {
    for (let j = i + 1; j < juego.criaderos.length; j++) {
      const a = juego.criaderos[i], b = juego.criaderos[j];
      if (a.planta !== b.planta) continue;
      const d = Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
      assert.ok(d >= 4, `dos criaderos a ${d} celdas en la planta ${a.planta}`);
    }
  }
});

test("la zona de principiantes es el sótano del pueblo, no el confín", () => {
  // En Gate City la rata y el esqueleto están a unos 15 m de la frontera del
  // pueblo y el tesoro a unos 30, mientras que lo duro está en la puerta del
  // mapa. Lo de empezar tiene que estar donde un jugador nuevo pueda volver
  // andando.
  assert.ok(juego.principiantes.length > 20, `solo ${juego.principiantes.length} celdas`);
  for (const c of juego.principiantes) {
    assert.ok(!juego.zonas.pueblo.has(k3(c.planta, c.x, c.z)), "una celda de pueblo en la zona de principiantes");
    assert.ok(c.deLaFrontera <= CELDAS_PRINCIPIANTE, `a ${c.deLaFrontera} celdas de la frontera`);
  }
});

test("hay dos transiciones y la del fondo está en el fondo", () => {
  // Gate City tiene dos, a 3 y 84 m de la llegada. Aquí la de llegada es la reja
  // del socavón de Corinth —ya existe, no se inventa— y la otra es lo que el lore
  // de Corinth lleva escrito: portales en lo más hondo.
  assert.equal(juego.transiciones.length, 2);
  const [entrada, fondo] = juego.transiciones;
  assert.equal(entrada.pasos, 0);
  assert.equal(entrada.planta, ENTRADA_PLANTA);
  assert.equal(entrada.destino, "corinth");
  assert.equal(fondo.planta, 0, "la transición del fondo no está en la planta más honda");
  assert.ok(fondo.pasos > 40, `la del fondo está a ${fondo.pasos} pasos de la entrada`);
  // Y es la celda más lejana de esa planta, no una cualquiera.
  const d = distancias(plan);
  for (const k of plan.plantas[0].suelo.keys()) {
    const [x, z] = k.split(",").map(Number);
    assert.ok((d.get(k3(0, x, z)) ?? 0) <= fondo.pasos, "hay una celda del fondo más lejana");
  }
});

// --- la luz -------------------------------------------------------------------

test("hay DOS densidades de luz, y son las medidas", () => {
  // La cifra «una cada 71 m²» de la sesión anterior es correcta como media y no
  // sirve como reparto: repartir 71 por todo el jharro convierte las cavernas en
  // pueblo, y la comprobación sale en verde contra el objetivo.
  const m = luz.medidas;
  assert.ok(
    Math.abs(m.suelosPorLuzPueblo - SUELO_POR_LUZ_PUEBLO) < 6,
    `pueblo: una cada ${m.suelosPorLuzPueblo.toFixed(0)} m², y lo medido es ${SUELO_POR_LUZ_PUEBLO}`
  );
  assert.ok(
    Math.abs(m.suelosPorLuzCueva - SUELO_POR_LUZ_CUEVA) < 14,
    `cueva: una cada ${m.suelosPorLuzCueva.toFixed(0)} m², y lo medido es ${SUELO_POR_LUZ_CUEVA}`
  );
  // Y la media sale sola en los 71 m² medidos, que es la comprobación cruzada.
  assert.ok(Math.abs(m.suelosPorLuz - 71) < 6, `en conjunto una cada ${m.suelosPorLuz.toFixed(0)} m²`);
  // El contraste medido: 113/48 = 2,4 veces. NO siete, que es lo que sale si se
  // divide entre la huella en vez de entre el suelo.
  assert.ok(m.contraste > 1.8 && m.contraste < 3.0, `contraste ${m.contraste.toFixed(2)}×`);
});

test("EL CONTROL DE LA LUZ: con la mitad de faroles, la sonda lo dice", () => {
  // Una densidad media clavada no dice nada de si hay rincones negros, así que
  // la sonda de verdad es el alcance. Y si el alcance no empeorara al quitar la
  // mitad de las luces, la sonda no estaría midiendo nada.
  const entero = alcanceDeLaLuz(plan, luz.luces);
  const mitad = alcanceDeLaLuz(plan, luz.luces.filter((_, i) => i % 2 === 0));
  assert.ok(mitad.mediana > entero.mediana + 1, `mediana ${entero.mediana} → ${mitad.mediana}`);
  assert.ok(mitad.p90 > entero.p90 + 2, `p90 ${entero.p90} → ${mitad.p90}`);
  // Y sin ninguna luz, todo está infinitamente lejos.
  assert.equal(alcanceDeLaLuz(plan, []).mediana, Infinity);
});

test("ningún trozo de suelo se queda a oscuras del todo", () => {
  // Se mide sobre puntos de suelo cada 2 m —la misma rejilla con la que se midió
  // Gate City— y en tres dimensiones, porque un farol de la planta de arriba no
  // ilumina la de abajo. Gate City tiene un rincón a 43,7 m de su luz más
  // cercana; aquí el peor está a menos de la mitad, que es lo que se gana
  // repartiendo por el camino en vez de a ojo.
  const a = alcanceDeLaLuz(plan, luz.luces);
  assert.ok(a.p90 < 14, `p90 a ${a.p90.toFixed(1)} m, y Gate City mide 10,6`);
  assert.ok(a.peor < 25, `el peor rincón está a ${a.peor.toFixed(1)} m de su farol`);
});

test("el farol va pegado a la pared, entero en su celda y por debajo del techo", () => {
  // Un farol en mitad de una caverna de dieciséis metros es una bombilla
  // colgando del vacío; y uno a dos metros en una galería de 2,2 se mete en la
  // roca del techo, que es el mismo fallo que la fachada de 3 m en un pasillo —y
  // aquí sería peor, porque lo que lo tapa es el techo que tiene justo encima.
  for (const l of luz.luces) {
    // Los de las conexiones van en celdas de TÚNEL, que no son suelo de ninguna
    // planta: tienen su propia comprobación más abajo.
    if (l.conexion) continue;
    const suelo = cotaMundo(l.planta);
    const libre = libreEn(plan, alturas, l.planta, l.x, l.z);
    const alto = l.pos[1] - suelo;
    assert.ok(alto <= libre - 0.5 + 1e-9, `farol a ${alto.toFixed(2)} m con ${libre.toFixed(2)} de techo`);
    assert.ok(alto > 1.2, `farol a ${alto.toFixed(2)} m: a la altura de la rodilla`);
    assert.ok(alto <= ALTURA + 1e-9, "farol por encima de su altura declarada");
    // Entero dentro de su celda.
    assert.ok(Math.abs(l.pos[0] - (l.x * CELDA + CELDA / 2)) <= CELDA / 2 + 1e-9);
    assert.ok(Math.abs(l.pos[2] - (-l.z * CELDA - CELDA / 2)) <= CELDA / 2 + 1e-9);
    // Y el sitio es determinista: el mismo plano da el mismo farol.
    assert.deepEqual(sitioEnCelda(plan, alturas, l.planta, l.x, l.z).pos, l.pos);
  }
});

test("cada conexión vertical tiene su farol", () => {
  // El reparto por densidad recorre celdas de SUELO, y el túnel de una escalera
  // o el hueco de un pozo no son suelo de ninguna planta. Así que los siete
  // pasos entre plantas —lo único que une el jharro— se quedaron sin una sola
  // luz, con la densidad medida saliendo clavada. Se vio mirando un fotograma:
  // el pozo era un agujero negro con una mancha iluminada doce metros más abajo.
  const conexiones = luz.luces.filter((l) => l.conexion);
  assert.equal(conexiones.length, plan.enlaces.length, "faltan faroles de conexión");
  for (const e of plan.enlaces) {
    const celdas = celdasTunel(e);
    const suyo = conexiones.find((c) => c.x === celdas[0].x && c.z === celdas[0].z);
    assert.ok(suyo, `la ${e.tipo} de ${e.arriba.planta} a ${e.abajo.planta} no tiene farol`);
    assert.equal(suyo.conexion, e.tipo);
    // Y dentro de la celda del túnel, no en el eje de paso: en el eje de una
    // escalera un farol estorba, que es la lección de la cuerda del torno.
    assert.ok(Math.abs(suyo.pos[0] - (celdas[0].x * CELDA + CELDA / 2)) <= CELDA / 2 + 1e-9);
    assert.ok(Math.abs(suyo.pos[2] - (-celdas[0].z * CELDA - CELDA / 2)) <= CELDA / 2 + 1e-9);
  }
  // Y se descuentan del cupo de la cueva: la densidad medida no cambia por
  // añadirlos. Si se sumaran encima, el jharro tendría 65 faroles y una cada
  // 63 m², que ya no es lo que se midió.
  assert.ok(
    Math.abs(luz.medidas.suelosPorLuz - 71) < 6,
    `en conjunto una cada ${luz.medidas.suelosPorLuz.toFixed(0)} m²`
  );
});

test("el color y el alcance salen del mapa medido, no de un gusto", () => {
  // `info_texlights` de Gate City declara UNA textura emisiva:
  //     "pi_lantern" "255 255 128 100"
  // Y el alcance es su p90 medido: nueve de cada diez metros de suelo tienen su
  // luz a menos de 10,6 m.
  assert.deepEqual(COLOR, [1, 1, 128 / 255]);
  assert.equal(ALCANCE, 10.6);
  for (const l of luz.luces) assert.deepEqual(l.color, COLOR);
});

test("los faroles se generan, porque el kit CC0 no trae ninguno", () => {
  assert.ok(luz.medidas.triangulos > 0, "no hay malla de farol");
  // Uno por luz, y todos iguales: repetición, no variedad.
  assert.equal(luz.medidas.triangulos % luz.luces.length, 0);
});

test("el reparto de faroles es determinista y usa el camino, no la línea recta", () => {
  const otra = montarLuz(plan, juego.zonas, alturas);
  assert.equal(
    otra.luces.map((l) => `${l.planta},${l.x},${l.z}`).join("|"),
    luz.luces.map((l) => `${l.planta},${l.x},${l.z}`).join("|")
  );
  // Pedir más faroles de los que caben devuelve como mucho las celdas que hay.
  const celdas = todasLasCeldas(plan);
  assert.ok(repartir(plan, celdas, 10000).length <= celdas.length);
  assert.equal(repartir(plan, celdas, 0).length, 0);
  assert.equal(repartir(plan, [], 5).length, 0);
});

test("el plano de juego no coloca ni un monstruo", () => {
  // Declara los SITIOS y para. Poner contenido encima de un mundo que todavía no
  // ha andado nadie es apilar trabajo sobre algo que puede estar torcido, y de
  // los cinco fallos gordos de Corinth cuatro los encontró un cuerpo.
  assert.ok(!("monstruos" in juego), "el plano de juego está colocando bichos");
  assert.ok(juego.criaderos.every((c) => !("clase" in c)), "un criadero trae clase de monstruo");
});
