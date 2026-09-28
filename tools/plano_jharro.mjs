// Dibuja el plano del jharro: un SVG por planta, más una hoja con las ocho.
//
//   node tools/plano_jharro.mjs      -> build/jharro/planta-*.svg y planta.svg
//
// No es una ilustración. Es el mismo dato que juzgan las pruebas, dibujado, y
// está aquí por una razón concreta: en el experimento 03 el pueblo medía bien,
// sellaba bien y era un descampado con cajas, y lo que lo dijo fue el dibujo. Con
// ocho plantas el riesgo es peor: una planta puede ser una serpiente de una celda
// de ancho, o quedarse apiñada en una esquina, y eso no lo dice el recuento de
// celdas ni la comprobación de que se llega a todo.
//
// Se pinta lo que se ALCANZA desde la entrada, planta por planta, y en rojo lo
// que no. Y se pinta en gris lo que hay en la planta de arriba, porque en un
// jharro lo que tienes encima es la mitad del diseño: es lo que decide si un
// sitio tiene dos metros de techo o nueve.

import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CELDA } from "../src/kit/house.js";
import {
  ANCHO, FONDO, MARGEN, PLANTAS, NOMBRE, ENTRADA, ENTRADA_PLANTA, SEMILLA,
  planJharro, alcanzables, aisladas, cotaMundo, dentro,
} from "../src/kit/jharro.js";
import { repartirAlturas } from "../src/kit/roca.js";
import { montarCiudad } from "../src/kit/ciudad.js";
import { planDeJuego } from "../src/kit/zonas.js";
import { montarLuz, alcanceDeLaLuz } from "../src/kit/luz.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "jharro");
const C = 13; // píxeles por celda
const MARGEN_PX = 26;

// Los colores son los del atlas del kit —piedra, ocre, madera— y el rojo está
// reservado: en este plano, rojo significa siempre «mira aquí».
const COLOR = {
  roca: "#17120e",
  margen: "#0b0806",
  pasillo: "#4a4036",
  cuarto: "#6b5b48",
  boveda: "#8e7856",
  arriba: "#2a2a33",
  casa: "#b9a184",
  casaBorde: "#7d6a52",
  puerta: "#8a2b22",
  seguro: "#6d5f3f",
  farol: "#ffe9a0",
  criadero: "#7d2f2a",
  portal: "#9a6fd0",
  fallo: "#8a2b22",
  entrada: "#e8c268",
  escalera: "#c9a25d",
  pozo: "#7aa7c9",
  texto: "#a89478",
  titulo: "#e6dac4",
};

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const mono = 'font-family="ui-monospace,Consolas,monospace"';

/** El dibujo de una planta. Devuelve el SVG y las cifras con que se juzga. */
export function dibujarPlanta(plan, p, vistas, ciudad = null, juego = null, luz = null) {
  const pl = plan.plantas[p];
  const arriba = plan.plantas[p + 1] ?? null; // la de encima, si hay
  const W = ANCHO * C + MARGEN_PX * 2;
  const H = FONDO * C + MARGEN_PX * 2 + 58;
  const px = (x) => MARGEN_PX + x * C;
  const pz = (z) => MARGEN_PX + z * C;
  const piezas = [`<rect width="${W}" height="${H}" fill="${COLOR.margen}"/>`];

  // La roca: todo lo excavable, para que se vea cuánto NO se excavó.
  piezas.push(
    `<rect x="${px(MARGEN)}" y="${pz(MARGEN)}" width="${(ANCHO - 2 * MARGEN) * C}" ` +
      `height="${(FONDO - 2 * MARGEN) * C}" fill="${COLOR.roca}"/>`
  );

  // Lo de la planta de encima, en gris: la sombra de lo que hay sobre la cabeza.
  if (arriba) {
    for (const k of arriba.suelo.keys()) {
      const [x, z] = k.split(",").map(Number);
      piezas.push(
        `<rect x="${px(x)}" y="${pz(z)}" width="${C}" height="${C}" fill="${COLOR.arriba}"/>`
      );
    }
  }

  // La zona segura, por debajo de todo: es el fondo sobre el que se lee el resto.
  for (const k of juego?.zonas.pueblo ?? []) {
    const [pp, x, z] = k.split(",").map(Number);
    if (pp !== p) continue;
    piezas.push(
      `<rect x="${px(x) - 1}" y="${pz(z) - 1}" width="${C + 2}" height="${C + 2}" fill="${COLOR.seguro}"/>`
    );
  }

  // El suelo de esta planta, con el color de su tramo.
  let sinAlcanzar = 0;
  for (const t of pl.tramos) {
    for (const [x, z] of t.celdas) {
      const ok = vistas.has(`${p},${x},${z}`);
      if (!ok) sinAlcanzar++;
      piezas.push(
        `<rect x="${px(x)}" y="${pz(z)}" width="${C}" height="${C}" ` +
          `fill="${ok ? COLOR[t.tipo] : COLOR.fallo}" stroke="#00000044" stroke-width="0.4"/>`
      );
    }
  }

  // Lo construido: la fachada se pinta en el hueco de roca donde está metida la
  // casa, con una marca hacia la galería a la que da. Va en el plano porque es la
  // única vista donde se ve que las casas están PEGADAS a la cueva y no sueltas
  // en mitad de ella, que es la diferencia entre este pueblo y Corinth.
  for (const f of ciudad?.fachadas ?? []) {
    if (f.planta !== p) continue;
    const [hx, hz] = f.hueco;
    piezas.push(
      `<rect x="${px(hx) + 1}" y="${pz(hz) + 1}" width="${C - 2}" height="${C - 2}" ` +
        `fill="${COLOR.casa}" stroke="${COLOR.casaBorde}" stroke-width="0.8"/>`
    );
    // La puerta: una marca en la junta, del lado de la galería.
    const mx = px(hx) + C / 2 - (f.dx * C) / 2;
    const mz = pz(hz) + C / 2 - (f.dz * C) / 2;
    piezas.push(
      `<circle cx="${mx}" cy="${mz}" r="1.8" fill="${COLOR.puerta}"/>`
    );
  }

  // Las conexiones que llegan o salen de esta planta.
  for (const e of plan.enlaces) {
    for (const lado of ["arriba", "abajo"]) {
      if (e[lado].planta !== p) continue;
      const [x, z] = e[lado].celda;
      const c = e.tipo === "pozo" ? COLOR.pozo : COLOR.escalera;
      // Un triángulo: hacia abajo si de aquí se baja, hacia arriba si se sube.
      const baja = lado === "arriba";
      const cx = px(x) + C / 2, cy = pz(z) + C / 2;
      const s = C * 0.42;
      piezas.push(
        baja
          ? `<polygon points="${cx - s},${cy - s} ${cx + s},${cy - s} ${cx},${cy + s}" fill="${c}"/>`
          : `<polygon points="${cx - s},${cy + s} ${cx + s},${cy + s} ${cx},${cy - s}" fill="none" stroke="${c}" stroke-width="1.4"/>`
      );
    }
  }

  // Los criaderos, los portales y los faroles.
  for (const c of juego?.criaderos ?? []) {
    if (c.planta !== p) continue;
    const cx = px(c.x) + C / 2, cy = pz(c.z) + C / 2;
    piezas.push(
      `<path d="M${cx - 4},${cy - 4} L${cx + 4},${cy + 4} M${cx + 4},${cy - 4} L${cx - 4},${cy + 4}" ` +
        `stroke="${COLOR.criadero}" stroke-width="2"/>`
    );
  }
  for (const t of juego?.transiciones ?? []) {
    if (t.planta !== p || t.destino === "corinth") continue;
    piezas.push(
      `<circle cx="${px(t.x) + C / 2}" cy="${pz(t.z) + C / 2}" r="${C * 0.42}" fill="none" ` +
        `stroke="${COLOR.portal}" stroke-width="2"/>`
    );
  }
  for (const l of luz?.luces ?? []) {
    if (l.planta !== p) continue;
    // En la posición real del farol dentro de su celda, no en el centro: así se
    // ve que están pegados a la pared.
    piezas.push(
      `<circle cx="${MARGEN_PX + (l.pos[0] / CELDA) * C}" cy="${MARGEN_PX + (-l.pos[2] / CELDA) * C}" ` +
        `r="2.1" fill="${COLOR.farol}"/>`
    );
  }

  // La entrada.
  if (p === ENTRADA_PLANTA) {
    const cx = px(ENTRADA[0]) + C / 2, cy = pz(ENTRADA[1]) + C / 2;
    piezas.push(`<circle cx="${cx}" cy="${cy}" r="${C * 0.5}" fill="none" stroke="${COLOR.entrada}" stroke-width="2"/>`);
    piezas.push(`<circle cx="${cx}" cy="${cy}" r="2" fill="${COLOR.entrada}"/>`);
  }

  const cuenta = pl.tramos.reduce((a, t) => {
    a[t.tipo] = (a[t.tipo] ?? 0) + t.celdas.length;
    return a;
  }, {});
  const base = MARGEN_PX + FONDO * C + 20;
  piezas.push(
    `<text x="${MARGEN_PX}" y="${base}" ${mono} font-size="12" fill="${COLOR.titulo}">` +
      `planta ${p} — cota ${pl.cota} m (mundo ${cotaMundo(p).toFixed(2)} m) — ` +
      `${pl.suelo.size} celdas, ${pl.suelo.size * CELDA * CELDA} m²</text>`
  );
  piezas.push(
    `<text x="${MARGEN_PX}" y="${base + 16}" ${mono} font-size="10" fill="${COLOR.texto}">` +
      `pasillo ${cuenta.pasillo ?? 0} · cuarto ${cuenta.cuarto ?? 0} · bóveda ${cuenta.boveda ?? 0}` +
      ` · seguro ${juego ? [...juego.zonas.pueblo].filter((k) => +k.split(",")[0] === p).length : 0}` +
      ` · faroles ${luz ? luz.luces.filter((l) => l.planta === p).length : 0}` +
      ` · Gate City medía ${pl.areaMedida} m²</text>`
  );
  if (sinAlcanzar) {
    piezas.push(
      `<text x="${MARGEN_PX}" y="${base + 32}" ${mono} font-size="10" fill="#e06a5c">` +
        `FALLO: ${sinAlcanzar} celdas no se alcanzan desde la entrada</text>`
    );
  }

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    piezas.join("") +
    `</svg>`;
  return { svg, W, H, sinAlcanzar, cuenta };
}

/** Las ocho plantas en una sola hoja, de la de arriba a la más honda. */
export function dibujarTodo(plan, vistas, ciudad = null, juego = null, luz = null) {
  const hojas = PLANTAS.map((_, p) => dibujarPlanta(plan, p, vistas, ciudad, juego, luz)).reverse();
  const COLS = 4;
  const w = hojas[0].W, h = hojas[0].H;
  const filas = Math.ceil(hojas.length / COLS);
  const W = w * COLS, H = h * filas + 34;
  const piezas = [`<rect width="${W}" height="${H}" fill="${COLOR.margen}"/>`];
  piezas.push(
    `<text x="14" y="22" ${mono} font-size="15" fill="${COLOR.titulo}">` +
      `${esc(NOMBRE.toUpperCase())} — ${ANCHO}×${FONDO} celdas de ${CELDA} m = ` +
      `${ANCHO * CELDA}×${FONDO * CELDA} m, ${PLANTAS.length} plantas, ` +
      `${plan.medidas.celdas} celdas pisables</text>`
  );
  hojas.forEach((hoja, i) => {
    const x = (i % COLS) * w;
    const y = 34 + Math.floor(i / COLS) * h;
    // El SVG de cada planta se mete tal cual: es el MISMO dibujo que se escribe
    // suelto, no una segunda versión. Dos versiones del mismo plano se separan.
    piezas.push(`<g transform="translate(${x},${y})">${hoja.svg}</g>`);
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${piezas.join("")}</svg>`, W, H };
}

// --- informe, solo cuando se ejecuta este archivo ----------------------------

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const plan = planJharro();
  const vistas = alcanzables(plan);
  const fuera = aisladas(plan, vistas);
  const alturas = repartirAlturas(plan).alturas;
  const ciudad = montarCiudad(plan, { alturas });
  const juego = planDeJuego(plan, ciudad);
  const luz = montarLuz(plan, juego.zonas, alturas);

  mkdirSync(OUT, { recursive: true });
  for (let p = 0; p < PLANTAS.length; p++) {
    const { svg } = dibujarPlanta(plan, p, vistas, ciudad, juego, luz);
    writeFileSync(join(OUT, `planta-${String(p)}-${PLANTAS[p].cota}m.svg`), svg);
  }
  const todo = dibujarTodo(plan, vistas, ciudad, juego, luz);
  writeFileSync(join(OUT, "plantas.svg"), todo.svg);

  const m = plan.medidas;
  console.log(`\n${NOMBRE} — build/jharro/plantas.svg  (${todo.W}×${todo.H} px)`);
  console.log(`  huella        ${ANCHO}×${FONDO} celdas = ${ANCHO * CELDA}×${FONDO * CELDA} m`);
  console.log(`  suelo         ${m.celdas} celdas = ${m.m2} m² en ${PLANTAS.length} plantas`);
  console.log(
    `  relleno       ${(m.relleno * 100).toFixed(1)} % de la huella ` +
      `(Gate City: ${(0.3045 * 100).toFixed(1)} %)`
  );
  console.log(
    `  cobertura     ${(m.cobertura.x * 100).toFixed(0)} % del ancho excavable, ` +
      `${(m.cobertura.z * 100).toFixed(0)} % del fondo`
  );
  console.log(`  bóveda        ${m.bovedaPuesta} celdas de ${m.bovedaObjetivo} que pedía el 16 % medido`);
  console.log(`  conexiones    ${m.enlaces}: ` +
    plan.enlaces.map((e) => `${e.tipo}(${e.salto} m)`).join(" "));
  console.log(`  tramos        ${m.tramos}`);
  for (const p of plan.plantas) {
    const t = p.tramos.reduce((a, q) => { a[q.tipo] = (a[q.tipo] ?? 0) + q.celdas.length; return a; }, {});
    console.log(
      `    ${String(p.cota).padStart(4)} m  ${String(p.suelo.size).padStart(4)} celdas  ` +
        `pasillo ${String(t.pasillo ?? 0).padStart(3)}  cuarto ${String(t.cuarto ?? 0).padStart(3)}  ` +
        `bóveda ${String(t.boveda ?? 0).padStart(3)}`
    );
  }
  console.log(
    `  construido   ${ciudad.fachadas.length} fachadas de ${ciudad.medidas.sitios} sitios, ` +
      `${ciudad.medidas.piezas} piezas de solo ${ciudad.medidas.distintas} distintas`
  );
  console.log(
    `               ` +
      Object.entries(ciudad.medidas.porTipo).map(([k, v]) => `${v} ${k}`).join(", ")
  );
  const jm = juego.medidas;
  console.log(
    `  zona segura  ${jm.pueblo} celdas = ${(jm.fraccion * 100).toFixed(0)} % del suelo ` +
      `(Gate City 43 %), en ${jm.trozos} barrios y el mayor con ${jm.mayor}`
  );
  console.log(
    `               del socavón al pueblo hay ${jm.alPueblo} m — en Gate City, 46: se entra por la cueva`
  );
  console.log(
    `  criaderos    ${jm.criaderos}, y ${jm.principiantes} celdas de cueva pegadas al pueblo ` +
      `(la zona de principiantes)`
  );
  console.log(
    `  transiciones ` + juego.transiciones.map((t) => `${t.nombre} a ${t.pasos * CELDA} m`).join(" · ")
  );
  const alc = alcanceDeLaLuz(plan, luz.luces);
  console.log(
    `  luz          ${luz.medidas.total} faroles: una cada ${luz.medidas.suelosPorLuzPueblo.toFixed(0)} m² ` +
      `en el pueblo y ${luz.medidas.suelosPorLuzCueva.toFixed(0)} en la cueva (Gate City 48 y 113)`
  );
  console.log(
    `               del suelo a su farol: mediana ${alc.mediana.toFixed(1)} m · p90 ${alc.p90.toFixed(1)} · ` +
      `el peor ${alc.peor.toFixed(1)} (Gate City 3,8 · 10,6 · 43,7)`
  );
  for (const a of plan.avisos) console.log(`  AVISO: ${a}`);

  console.log();
  if (fuera.length) {
    console.log(
      `FALLO: ${fuera.length} celdas pisables no se alcanzan desde la entrada: ` +
        fuera.slice(0, 8).map((c) => `p${c.planta}(${c.x},${c.z})`).join(" ")
    );
    process.exit(1);
  }
  // Y el control, que es lo que separa un juez de una sonda que dice que sí: si
  // quitar una conexión NO deja nada aislado, la inundación no está usando las
  // aristas verticales y diría que sí con el jharro partido en ocho trozos.
  const sinControl = plan.enlaces.map((_, i) => alcanzables(plan, undefined, [i]).size);
  const flojas = sinControl.filter((n) => n >= plan.medidas.celdas).length;
  if (flojas) {
    console.log(`FALLO DE LA SONDA: ${flojas} conexiones se pueden quitar sin aislar nada`);
    process.exit(1);
  }
  console.log(
    `Se alcanzan las ${vistas.size} celdas desde la entrada, y quitar cualquiera de ` +
      `las ${plan.enlaces.length} conexiones deja ${Math.min(...sinControl)}–` +
      `${Math.max(...sinControl)}.\n`
  );
}
