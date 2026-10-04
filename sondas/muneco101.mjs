// EL 101: EL MUÑECO Y LA PANTALLA DE ELECCIÓN LLEVAN EL EQUIPO.
//
//   npm run sonda:muneco101
//
// El jugador comparó con el juego y vio dos cosas: el muñeco del HUD
// (`ms_lildude`) sale sin armadura, y los personajes de «Choose your
// character» salen como el humano por defecto. Aquí se mide el EFECTO de las
// dos, entrando POR EL MENÚ (CLAUDE.md §3).
//
// ── Cómo se miden los píxeles, y por qué así ──────────────────────────────
//
// No se compara «antes de ponérsela» con «después»: entre las dos fotos el
// muñeco respira y el mundo de detrás se mueve, y eso es ruido con forma de
// señal (el 78). Se compara EL MISMO INSTANTE con el equipo a la vista y
// escondido (`probe.vista.esconderEquipo`, que sólo toca `visible`). Lo que
// cambia son los píxeles que pone la armadura, y nada más.
//
// Y cada medida lleva su segundo caso al lado (el 50): sin armadura, la misma
// operación tiene que dar CERO mallas y CERO píxeles. Si esconder «nada»
// cambiara la pantalla, el instrumento estaría midiendo otra cosa.
//
// ── Las partes ─────────────────────────────────────────────────────────────
//
//   A. La pantalla de elección con un personaje fabricado
//      (`tools/personaje.mjs`: fénix y yelmo PUESTOS, espada en la mano) y dos
//      ranuras vacías.
//   B. Jugando con un personaje NUEVO, sin armadura: el muñeco pelado; la
//      coraza en la mochila (no se ve); puesta (se ve, submodelo 1); quitada
//      con el botón «Remove» del inventario (deja de verse y pasa a la mano);
//      y OTRA armadura, la de cuero (submodelo 6).
//   C. Otra vez la pantalla de elección: ahora hay dos personajes con dos
//      armaduras distintas, y cada ranura enseña la suya.

import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { leerPng } from "../tools/png.mjs";

const PORT = 5720;
const NOMBRE = "Sonda101";
const VESTE = "armor/p_armorvest_new";
const YELMOS = "armor/p_helmets";
const VISTAS = "build/gatecity/vistas";

// El marcador NO puede bajar (el 65): los declarados se cuentan aquí arriba.
const DECLARADOS = 30;
const controles = [];
const control = (que, bien, detalle = "") => {
  controles.push({ que, bien: Boolean(bien), detalle });
  console.log(`  ${bien ? "ok  " : "MAL "} ${que}${detalle ? `\n         ${detalle}` : ""}`);
  return bien;
};
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

// ── la fabricación, con la herramienta de verdad (como sondas/personaje96) ──
const hecho = spawnSync(process.execPath, ["tools/personaje.mjs", "--nombre", NOMBRE, "--mapa", "sonda101"], { encoding: "utf8" });
if (hecho.status !== 0 || !existsSync(`build/personajes/${NOMBRE.toLowerCase()}.json`)) {
  console.error("tools/personaje.mjs no dejó el personaje de pruebas:", hecho.stdout, hecho.stderr);
  process.exit(1);
}
mkdirSync(VISTAS, { recursive: true });

const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT);
const nav = await chromium.launch();
const errores = [];

// ── lo que se lee ──────────────────────────────────────────────────────────
const retratos = (pag) => pag.evaluate(() => window.probe.vgui.retratos());
const muneco = (pag) => pag.evaluate(() => window.probe.vista.muneco);
const de = (equipo, clave) => (equipo ?? []).filter((x) => x.clave === clave);
const cuerpos = (equipo, clave) => de(equipo, clave).map((x) => x.cuerpo).join(",") || "ninguno";
const colgada = (x) => Boolean(x) && x.enEscena === true && x.triangulos > 0;

/**
 * Los píxeles que pone el equipo de UNA ranura: el lienzo con él y sin él, en
 * la misma llamada (sin fotograma en medio). Devuelve además cuántos de los que
 * cambian caen dentro de la caja de la figura: una malla mal atada a los huesos
 * no sale encima del cuerpo, sale por toda la caja o fuera de ella.
 */
const pixelesDelRetrato = (pag, i, cajaDeFuera = null) => pag.evaluate(({ i, cajaDeFuera }) => {
  const lienzo = document.querySelectorAll(".vg-char-retrato")[i];
  if (!lienzo || !lienzo.width) return null;
  const leer = () => lienzo.getContext("2d").getImageData(0, 0, lienzo.width, lienzo.height).data;
  const mallas = window.probe.vgui.esconderEquipoDeRetrato(i, true);
  const sin = leer();
  window.probe.vgui.esconderEquipoDeRetrato(i, false);
  const con = leer();
  // La caja de la figura SIN equipo: lo opaco.
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1, figura = 0;
  const W = lienzo.width;
  for (let k = 0; k < sin.length; k += 4) {
    if (sin[k + 3] < 8) continue;
    figura++;
    const x = (k / 4) % W, y = Math.floor(k / 4 / W);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  // LA CAJA ES LA DE UN CUERPO ENTERO, y por eso puede venir de fuera: desde el
  // 101b el cuerpo de quien lleva placas es sólo la cabeza, y su caja ya no
  // dice dónde está la figura. La da la ranura vacía, que tiene el mismo encuadre.
  if (cajaDeFuera) [x0, y0, x1, y1] = cajaDeFuera;
  // Con un margen de un décimo: un yelmo o una hombrera sobresalen del cuerpo.
  const mx = (x1 - x0) * 0.1, my = (y1 - y0) * 0.1;
  let cambian = 0, dentro = 0;
  for (let k = 0; k < sin.length; k += 4) {
    const d = Math.abs(sin[k] - con[k]) + Math.abs(sin[k + 1] - con[k + 1]) + Math.abs(sin[k + 2] - con[k + 2]) + Math.abs(sin[k + 3] - con[k + 3]);
    if (d < 24) continue;
    cambian++;
    const x = (k / 4) % W, y = Math.floor(k / 4 / W);
    if (x >= x0 - mx && x <= x1 + mx && y >= y0 - my && y <= y1 + my) dentro++;
  }
  return { mallas, figura, cambian, dentro };
}, { i, cajaDeFuera });

/**
 * EL PANTALÓN — el 101b, el control que habría cazado lo que vio el jugador.
 *
 * Con una coraza de placas las piernas son las de la ARMADURA: el pantalón del
 * cuerpo no puede asomar. Se mide por COLOR, en la ventana de las piernas:
 *
 *   `figuraDe`     la caja de la figura (lo opaco) y, en su 45 % de abajo, el
 *                  color medio — en una ranura VACÍA eso es el pantalón.
 *   `comoPantalon` cuántos píxeles de esa ventana tienen ese color.
 *
 * El color no se escribe aquí: se lee de la ranura vacía en la misma pasada. Y
 * la ranura vacía es además el control positivo — si en ella no hay cientos de
 * píxeles de pantalón, la ventana o el color están mal y el cero de al lado no
 * dice nada.
 */
const figuraDe = (pag, i) => pag.evaluate((i) => {
  const lienzo = document.querySelectorAll(".vg-char-retrato")[i];
  if (!lienzo || !lienzo.width) return null;
  const d = lienzo.getContext("2d").getImageData(0, 0, lienzo.width, lienzo.height).data;
  const W = lienzo.width;
  let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] < 200) continue;
    const x = (k / 4) % W, y = Math.floor(k / 4 / W);
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  // Las piernas: del 55 % al 90 % del alto (más abajo son las botas).
  const piernas = [x0, Math.round(y0 + (y1 - y0) * 0.55), x1, Math.round(y0 + (y1 - y0) * 0.9)];
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = piernas[1]; y <= piernas[3]; y++) for (let x = piernas[0]; x <= piernas[2]; x++) {
    const k = (y * W + x) * 4;
    if (d[k + 3] < 200) continue;
    r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
  }
  return { caja: [x0, y0, x1, y1], piernas, color: n ? [Math.round(r / n), Math.round(g / n), Math.round(b / n)] : null, opacos: n };
}, i);
const comoPantalon = (pag, i, piernas, color) => pag.evaluate(({ i, piernas, color }) => {
  const lienzo = document.querySelectorAll(".vg-char-retrato")[i];
  if (!lienzo || !lienzo.width || !color) return null;
  const d = lienzo.getContext("2d").getImageData(0, 0, lienzo.width, lienzo.height).data;
  const W = lienzo.width;
  let n = 0, opacos = 0;
  for (let y = piernas[1]; y <= piernas[3]; y++) for (let x = piernas[0]; x <= piernas[2]; x++) {
    const k = (y * W + x) * 4;
    if (d[k + 3] < 200) continue;
    opacos++;
    if (Math.abs(d[k] - color[0]) + Math.abs(d[k + 1] - color[1]) + Math.abs(d[k + 2] - color[2]) < 60) n++;
  }
  return { pantalon: n, opacos };
}, { i, piernas, color });

/**
 * DÓNDE ESTÁ EL MUÑECO EN PANTALLA. No se calcula: está clavado a la cámara
 * (4,7 unidades delante y 3,1 abajo, view.cpp:1757-1763), así que con esta
 * ventana de 1200x800 cae siempre en el mismo sitio. Medido en la captura:
 * de x=565 a 640 y de y=625 al borde. La ventana se le deja con holgura.
 *
 * Hace falta una ventana y no la pantalla entera: en la primera pasada el
 * «ruido» fueron 15 000 píxeles con el muñeco quieto, y era la espada de
 * primera persona meciéndose a la derecha y la llama del fondo del pasillo.
 * (Y `probe.vista.esconder("muneco")` no sirve para sacar su silueta: el bucle
 * le vuelve a poner `visible` cada fotograma, main.js. Leyó 37 píxeles.)
 */
const VENTANA = { x0: 500, x1: 700, y0: 560, y1: 799 };

/** Los píxeles que pone UNA pieza sobre el muñeco: con ella y sin ella. */
async function pixelesDelMuneco(pag, id) {
  let n = 0;
  const foto = async () => {
    const ruta = `${VISTAS}/muneco101-tmp${n++ % 4}.png`;
    await pag.screenshot({ path: ruta });
    const p = leerPng(ruta);
    return { width: p.ancho, height: p.alto, data: p.rgba };
  };
  // Congelado: entre dos capturas pasan fotogramas, y el muñeco respira.
  await pag.evaluate(() => window.probe.vista.congelar("muneco", true));
  await esperar(150);
  const con = await foto();
  const con2 = await foto();                       // EL RUIDO: dos fotos sin tocar nada
  const mallas = await pag.evaluate((id) => window.probe.vista.esconderEquipo(true, id), id);
  await esperar(150);
  const sin = await foto();
  await pag.evaluate(() => { window.probe.vista.esconderEquipo(false); window.probe.vista.congelar("muneco", false); });
  const dif = (a, b) => {
    let k0 = 0, x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = VENTANA.y0; y <= VENTANA.y1; y++) for (let x = VENTANA.x0; x <= VENTANA.x1; x++) {
      const k = (y * a.width + x) * 4;
      if (Math.abs(a.data[k] - b.data[k]) + Math.abs(a.data[k + 1] - b.data[k + 1]) + Math.abs(a.data[k + 2] - b.data[k + 2]) < 24) continue;
      k0++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    return { n: k0, x0, x1, y0, y1 };
  };
  const pieza = dif(con, sin);
  return {
    mallas, pieza: pieza.n, ruido: dif(con, con2).n,
    caja: pieza.n ? [pieza.x0, pieza.y0, pieza.x1, pieza.y1] : null,
    // ¿Cabe en la ventana sin tocar sus lados ni su techo? (Abajo el muñeco se
    // sale de la pantalla: las piernas llegan al borde.)
    recogida: pieza.n > 0 && pieza.x0 > VENTANA.x0 + 5 && pieza.x1 < VENTANA.x1 - 5 && pieza.y0 > VENTANA.y0 + 5,
  };
}

async function pagina(contexto) {
  const pag = await contexto.newPage();
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // Sin el recargado en caliente: el árbol es compartido con otras sesiones.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });
  return pag;
}

// ── el inventario, con el ratón (copiado de sondas/inventario97.mjs) ────────
const panel = (pag) => pag.evaluate(() => {
  const raiz = [...document.querySelectorAll(".vg-inv")].find((n) => !n.hidden && n.getClientRects().length) ?? null;
  const listas = raiz ? [...raiz.querySelectorAll(".vg-inv-lista")] : [];
  const fila = (n) => { const c = n.getBoundingClientRect(); return { id: n.dataset.id ?? null, x: c.x + c.width / 2, y: c.y + c.height / 2 }; };
  return { abierto: Boolean(raiz), columna: [...(listas[0]?.children ?? [])].map(fila) };
});
async function quitarseConElBoton(pag, id) {
  if (!(await panel(pag)).abierto) { await pag.keyboard.press("KeyI"); await esperar(700); }
  const f = (await panel(pag)).columna.find((x) => x.id === id);
  if (!f) return false;
  await pag.mouse.click(f.x, f.y);
  await esperar(300);
  const b = (await pag.evaluate(() => window.probe.vgui.botones())).find((x) => x.texto === "Remove");
  if (!b) return false;
  await pag.mouse.click(b.centro, b.arriba + 10);
  await esperar(500);
  if ((await panel(pag)).abierto) { await pag.keyboard.press("KeyI"); await esperar(400); }
  return true;
}

try {
  // Un contexto NUEVO: el IndexedDB empieza vacío y sólo tiene lo que se importe.
  const contexto = await nav.newContext({ viewport: { width: 1200, height: 800 } });
  const pag = await pagina(contexto);
  await entrarPorElMenu(pag, PORT, { mapa: "sala88", extra: `personaje=${NOMBRE.toLowerCase()}` });

  // ════ A. LA PANTALLA DE ELECCIÓN ═════════════════════════════════════════
  await pag.waitForFunction(() => window.probe.vgui.retratos().filter((r) => r.montado).length >= 3, null, { timeout: 60000 });
  await pag.waitForFunction((n) => window.probe.vgui.retratos().some((r) => r.quien === n && r.equipo.length > 0), NOMBRE, { timeout: 30000 })
    .catch(() => {});
  let rs = await retratos(pag);
  console.log(`  A: ${rs.map((r) => `${r.quien ?? "(vacía)"} ${r.genero}/${r.postura} [${r.equipo.map((e) => `${e.clave}#${e.cuerpo}`).join(" ")}]`).join(" · ")}`);
  const iVet = rs.findIndex((r) => r.quien === NOMBRE);
  const vet = rs[iVet] ?? null;
  const iVacia = rs.findIndex((r) => r.quien === null);
  control("A1. la ranura del personaje fabricado está montada, y hay una vacía al lado", Boolean(vet?.montado) && iVacia >= 0,
    rs.map((r) => r.quien ?? "(vacía)").join(" · "));
  control("A2. lleva COLGADA la veste del fénix: `p_armorvest_new`, submodelo 11", colgada(de(vet?.equipo, VESTE)[0]) && cuerpos(vet?.equipo, VESTE) === "11",
    `veste: ${cuerpos(vet?.equipo, VESTE)}`);
  control("A3. y el yelmo: `p_helmets`, submodelo 5", colgada(de(vet?.equipo, YELMOS)[0]) && cuerpos(vet?.equipo, YELMOS) === "5",
    `yelmo: ${cuerpos(vet?.equipo, YELMOS)}`);
  control("A4. con la espada en la mano está en `idle` (`m_ItemInHand`); la vacía, en `attention`",
    vet?.reposo === "conArma" && rs[iVacia]?.reposo === "sinArma", `${vet?.reposo} / ${rs[iVacia]?.reposo}`);
  control("A5. EL SEGUNDO CASO: la ranura vacía no lleva NADA colgado", rs[iVacia]?.equipo.length === 0, JSON.stringify(rs[iVacia]?.equipo));
  const vacia = await figuraDe(pag, iVacia);
  const pxVet = await pixelesDelRetrato(pag, iVet, vacia?.caja ?? null);
  const pxVacia = await pixelesDelRetrato(pag, iVacia);
  console.log(`  A: píxeles — ${NOMBRE} ${JSON.stringify(pxVet)} · vacía ${JSON.stringify(pxVacia)}`);
  control("A6. EL EFECTO: su equipo pone píxeles en el retrato (más de un 5 % de la figura)",
    pxVet && pxVet.mallas >= 2 && pxVet.cambian > pxVet.figura * 0.05, `${pxVet?.cambian} de ${pxVet?.figura}, ${pxVet?.mallas} mallas`);
  control("A7. y los pone ENCIMA del cuerpo: nueve de cada diez dentro de la caja de la figura",
    pxVet && pxVet.cambian > 0 && pxVet.dentro >= pxVet.cambian * 0.9, `${pxVet?.dentro} de ${pxVet?.cambian}`);
  control("A8. CONTROL: en la ranura vacía esconder el equipo no toca ni una malla ni un píxel",
    pxVacia && pxVacia.mallas === 0 && pxVacia.cambian === 0 && pxVacia.figura > 0, JSON.stringify(pxVacia));
  // ── EL 101b: BAJO LA CORAZA NO ASOMA EL PANTALÓN ─────────────────────────
  const pantVacia = await comoPantalon(pag, iVacia, vacia?.piernas, vacia?.color);
  const pantVet = await comoPantalon(pag, iVet, vacia?.piernas, vacia?.color);
  console.log(`  A: pantalón — color ${JSON.stringify(vacia?.color)} en ${JSON.stringify(vacia?.piernas)} · vacía ${JSON.stringify(pantVacia)} · ${NOMBRE} ${JSON.stringify(pantVet)}`);
  control("A9. CONTROL POSITIVO: en la ranura vacía las piernas son pantalón (más de 300 píxeles de su color)",
    (pantVacia?.pantalon ?? 0) > 300, JSON.stringify(pantVacia));
  // El 15 % y no el 0: lo que queda de ese color con el cuerpo bien escondido
  // (178 de 2 334 medidos) es la vaina y las correas, que son de cuero marrón.
  control("A10. EL EFECTO: con la coraza de placas el pantalón NO asoma (menos de un 15 % de eso), y ahí hay piernas",
    pantVet && pantVacia && pantVet.pantalon < pantVacia.pantalon * 0.15 && pantVet.opacos > pantVacia.opacos * 0.5,
    `${pantVet?.pantalon} de ${pantVacia?.pantalon}; opacos ${pantVet?.opacos} de ${pantVacia?.opacos}`);
  const cuerpoVet = (vet?.equipo ?? []).find((e) => e.esCuerpo) ?? null;
  control("A11. porque su cuerpo es el `body` 3 de `human/reference` —sólo la cabeza— y no la malla entera; el de la vacía, entero",
    cuerpoVet?.clave === "human/reference" && cuerpoVet.cuerpo === 3 && vet?.cuerpoEntero === false && rs[iVacia]?.cuerpoEntero === true,
    `${JSON.stringify(cuerpoVet)} · entero ${vet?.cuerpoEntero} / ${rs[iVacia]?.cuerpoEntero}`);
  await pag.screenshot({ path: `${VISTAS}/muneco101-A-eleccion.png` });

  // ════ B. JUGANDO, CON UN PERSONAJE NUEVO ═════════════════════════════════
  await pag.evaluate(() => window.probe.sesion.nuevo("Liso", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  await pag.waitForFunction(() => (window.probe.vista.muneco?.equipo ?? []).some((e) => e.enEscena), null, { timeout: 30000 }).catch(() => {});
  await esperar(800);
  let m = await muneco(pag);
  console.log(`  B: muñeco nuevo [${(m?.equipo ?? []).map((e) => `${e.clave}#${e.cuerpo}`).join(" ")}]`);
  control("B1. el muñeco se ve y NO lleva veste: el valor de reposo", m?.visible === true && de(m?.equipo, VESTE).length === 0, cuerpos(m?.equipo, VESTE));
  const espada = de(m?.equipo, "weapons/p_weapons1")[0];
  control("B2. pero SÍ la espada oxidada en la mano derecha: `p_weapons1`, submodelo 24", colgada(espada) && espada.cuerpo === 24 && espada.donde === "mano",
    JSON.stringify(espada ?? null));

  await pag.evaluate(() => { window.probe.misiones.dar("armor_plate"); window.probe.misiones.dar("armor_leather"); });
  await esperar(500);
  m = await muneco(pag);
  control("B3. con la coraza EN LA MOCHILA sigue sin veste", de(m?.equipo, VESTE).length === 0, cuerpos(m?.equipo, VESTE));
  const pxSin = await pixelesDelMuneco(pag, "armor_plate");
  await pag.screenshot({ path: `${VISTAS}/muneco101-B-sin.png` });

  const r1 = await pag.evaluate(() => window.probe.armadura.vestir("armor_plate"));
  await pag.waitForFunction((v) => (window.probe.vista.muneco?.equipo ?? []).some((e) => e.clave === v && e.enEscena), VESTE, { timeout: 15000 }).catch(() => {});
  m = await muneco(pag);
  control("B4. PUESTA (`probe.armadura.vestir`, la función del juego): el muñeco lleva la veste, submodelo 1",
    r1?.puesto === true && colgada(de(m?.equipo, VESTE)[0]) && cuerpos(m?.equipo, VESTE) === "1", `${JSON.stringify(r1)} · veste ${cuerpos(m?.equipo, VESTE)}`);
  control("B5. atada a los huesos del cuerpo: más de 40 de los suyos casan por nombre", (de(m?.equipo, VESTE)[0]?.huesosCasados ?? 0) > 40,
    `${de(m?.equipo, VESTE)[0]?.huesosCasados}`);
  const pxCon = await pixelesDelMuneco(pag, "armor_plate");
  await pag.screenshot({ path: `${VISTAS}/muneco101-B-placas.png` });
  console.log(`  B: píxeles — sin ${JSON.stringify(pxSin)} · con ${JSON.stringify(pxCon)}`);
  control("B6. CONTROL POSITIVO: en la mochila la MISMA medida da cero mallas y nada por encima del ruido",
    pxSin && pxSin.mallas === 0 && pxSin.pieza <= pxSin.ruido + 5, `mallas ${pxSin?.mallas}, píxeles ${pxSin?.pieza}, ruido ${pxSin?.ruido}`);
  control("B7. EL EFECTO: puesta, la coraza pone más de 800 píxeles sobre el muñeco, y diez veces el ruido",
    pxCon && pxCon.mallas === 1 && pxCon.pieza > 800 && pxCon.pieza > pxCon.ruido * 10, `coraza ${pxCon?.pieza}, ruido ${pxCon?.ruido}`);
  control("B8. y los pone EN el muñeco: caben en su ventana sin tocar los lados", pxCon?.recogida === true, JSON.stringify(pxCon?.caja));

  // «Remove», con el ratón: a la mano izquierda, que está libre.
  await pag.click("#view", { position: { x: 600, y: 400 } }).catch(() => {});
  const quitada = await quitarseConElBoton(pag, "armor_plate");
  await esperar(600);
  m = await muneco(pag);
  const puestosTras = await pag.evaluate(() => window.probe.inventario97.puestos);
  // EN EL GRAFO, no en la lista de lo que se mandó colgar: con el `remove`
  // de `desvestir` roto la lista decía «sin veste» y la malla seguía ahí.
  const vestesEnEscena = (x) => (x?.equipoEnEscena ?? []).filter((n) => n.includes(VESTE));
  control("B9. QUITADA con «Remove» del inventario: en la escena del muñeco no queda ninguna veste",
    quitada && !puestosTras.includes("armor_plate") && de(m?.equipo, VESTE).length === 0 && vestesEnEscena(m).length === 0,
    `quitada ${quitada} · puestos ${puestosTras} · veste ${cuerpos(m?.equipo, VESTE)} · en escena ${vestesEnEscena(m).join(" ") || "ninguna"}`);
  const paquete = de(m?.equipo, "misc/p_misc")[0];
  control("B10. y pasa a la mano IZQUIERDA como paquete: `p_misc`, submodelo 16", colgada(paquete) && paquete.cuerpo === 16 && paquete.donde === "mano",
    JSON.stringify(paquete ?? null));

  const r2 = await pag.evaluate(() => window.probe.armadura.vestir("armor_leather"));
  await pag.waitForFunction((v) => (window.probe.vista.muneco?.equipo ?? []).some((e) => e.clave === v && e.enEscena), VESTE, { timeout: 15000 }).catch(() => {});
  m = await muneco(pag);
  control("B11. EL SEGUNDO CASO: la de cuero es OTRO submodelo, el 6", r2?.puesto === true && colgada(de(m?.equipo, VESTE)[0]) && cuerpos(m?.equipo, VESTE) === "6",
    `${JSON.stringify(r2)} · veste ${cuerpos(m?.equipo, VESTE)}`);
  const pxCuero = await pixelesDelMuneco(pag, "armor_leather");
  await pag.screenshot({ path: `${VISTAS}/muneco101-B-cuero.png` });
  control("B12. y también pone píxeles, pero MENOS que las placas: el cuero sólo cubre el pecho", pxCuero && pxCuero.mallas === 1 && pxCuero.pieza > 50 && pxCuero.pieza > pxCuero.ruido * 10 && pxCuero.pieza < pxCon?.pieza,
    `cuero ${pxCuero?.pieza}, placas ${pxCon?.pieza}, ruido ${pxCuero?.ruido}`);
  control("B13. nada se quedó sin dibujar, y en la escena hay UNA veste y no dos: la de placas se fue de verdad",
    (m?.faltaDeEquipo ?? []).length === 0 && (m?.sinGuion ?? ["?"]).length === 0 && vestesEnEscena(m).length === 1 && (m?.equipoEnEscena ?? []).length === (m?.equipo ?? []).filter((e) => e.triangulos > 0).length,
    `falta ${JSON.stringify(m?.faltaDeEquipo)} · en escena ${(m?.equipoEnEscena ?? []).length} mallas, ${vestesEnEscena(m).join(" ")}`);

  // ════ C. OTRA VEZ LA PANTALLA, CON DOS PERSONAJES ════════════════════════
  await pag.evaluate(() => window.probe.sesion.salir());
  await esperar(800);
  const guardado = (await pag.evaluate(() => window.probe.sesion.listar())).find((d) => d.nombre === "Liso");
  control("C1. el personaje se guardó con la de cuero puesta (lo dice la LISTA, que es lo que lee la pantalla)",
    guardado?.vista?.objetos?.some((o) => o.id === "armor_leather" && o.puesto), JSON.stringify(guardado?.vista ?? null).slice(0, 200));
  await entrarPorElMenu(pag, PORT, { mapa: "sala88", extra: `personaje=${NOMBRE.toLowerCase()}` });
  await pag.waitForFunction(() => window.probe.vgui.retratos().filter((r) => r.montado && r.quien && r.equipo.length).length >= 2, null, { timeout: 60000 })
    .catch(() => {});
  rs = await retratos(pag);
  console.log(`  C: ${rs.map((r) => `${r.quien ?? "(vacía)"} ${r.genero}/${r.postura} [${r.equipo.map((e) => `${e.clave}#${e.cuerpo}`).join(" ")}]`).join(" · ")}`);
  const liso = rs.find((r) => r.quien === "Liso");
  const vet2 = rs.find((r) => r.quien === NOMBRE);
  control("C2. «Liso» enseña la de cuero (6) y, colgada, la de placas que lleva en la mano (1): ahí a todo se le manda `game_wear`",
    cuerpos(liso?.equipo, VESTE) === "1,6" || cuerpos(liso?.equipo, VESTE) === "6,1", cuerpos(liso?.equipo, VESTE));
  control("C3. y el fabricado sigue con la SUYA (11), colgada en su escena: cada ranura la de su personaje",
    cuerpos(vet2?.equipo, VESTE) === "11" && (vet2?.equipoEnEscena ?? []).some((n) => n.endsWith(`${VESTE}#11`)) && (liso?.equipoEnEscena ?? []).some((n) => n.endsWith(`${VESTE}#6`)),
    `${cuerpos(vet2?.equipo, VESTE)} · ${(vet2?.equipoEnEscena ?? []).filter((n) => n.includes(VESTE)).join(" ")}`);
  control("C4. «Liso» no lleva yelmo; el fabricado sí", de(liso?.equipo, YELMOS).length === 0 && de(vet2?.equipo, YELMOS).length === 1,
    `${de(liso?.equipo, YELMOS).length} / ${de(vet2?.equipo, YELMOS).length}`);
  // EL SEGUNDO CASO DEL PANTALÓN: el cuero sólo esconde el TORSO
  // (player/externals.script:1304-1310), así que a «Liso» se le ven las piernas.
  const iLiso = rs.findIndex((r) => r.quien === "Liso");
  const iVacia2 = rs.findIndex((r) => r.quien === null);
  const vacia2 = await figuraDe(pag, iVacia2);
  const pantVacia2 = await comoPantalon(pag, iVacia2, vacia2?.piernas, vacia2?.color);
  const pantLiso = await comoPantalon(pag, iLiso, vacia2?.piernas, vacia2?.color);
  const cuerpoLiso = (liso?.equipo ?? []).find((e) => e.esCuerpo) ?? null;
  control("C5. con la de CUERO el cuerpo es el `body` 31 (sin torso) y el pantalón SIGUE: más de la mitad que en la vacía",
    cuerpoLiso?.cuerpo === 31 && pantLiso && pantVacia2 && pantLiso.pantalon > pantVacia2.pantalon * 0.5,
    `${JSON.stringify(cuerpoLiso)} · ${pantLiso?.pantalon} de ${pantVacia2?.pantalon}`);
  await pag.screenshot({ path: `${VISTAS}/muneco101-C-eleccion.png` });

  await pag.close();
  control("ni un error de página en toda la pasada", errores.length === 0, errores.slice(0, 2).join(" | ") || "ninguno");
} catch (e) {
  // LA CAÍDA ES UNA ROJA, no una nota al pie (el 65).
  control("LA SONDA HA LLEGADO AL FINAL", false, String(e).slice(0, 400));
} finally {
  const verdes = controles.filter((x) => x.bien).length;
  const corridos = controles.length;
  console.log("\n  ──────────────────────────────────────────────");
  if (corridos < DECLARADOS) console.log(`  ROJA: sólo corrieron ${corridos} de los ${DECLARADOS} controles declarados`);
  console.log(`  ${verdes} de ${DECLARADOS} controles en verde`);
  await nav.close();
  matar(dev);
  process.exit(verdes === DECLARADOS && corridos === DECLARADOS ? 0 : 1);
}
