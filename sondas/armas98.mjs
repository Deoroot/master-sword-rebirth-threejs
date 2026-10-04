// EL 98: ¿SE VE UNA FLECHA EN VUELO?
//
//   npm run sonda:armas98
//
// El 97 encontró que NINGUNA flecha se dibujaba volando desde antes del 39:
// `empunar` (src/main.js) montaba el conjunto con `scene.add(...)` y en ese
// archivo la escena se llama `escena`; el `ReferenceError` lo tragaba un
// `catch`, y el conjunto quedaba asignado y FUERA de la escena. `sonda:arco`
// tenía un control para esto —«hay una flecha dibujada en el mundo»— y leía
// `puestas`, los nodos OCUPADOS del conjunto: un nodo ocupado fuera de la escena
// cuenta igual. Es el 38 de CLAUDE.md (un `<canvas>` recién creado mide 300x150)
// con otra ropa: un objeto que existe no es un objeto dibujado.
//
// Así que aquí se mide lo dibujado, de dos maneras que no comparten instrumento:
//
//   1. EL GRAFO QUE SE PINTA: cuántas veces llama Three a `onBeforeRender` de la
//      malla de la flecha. Three sólo lo hace con lo que mete en su lista de
//      dibujo —colgado de la escena del `renderer.render` y visible—. Control:
//      con el nodo escondido, 0 (o sea que el contador puede leer un cero).
//   2. LOS PÍXELES: la flecha se DETIENE en el aire (`probe.arco.soltarYDetener`:
//      sigue volando, la mueve el bucle, a una milésima de unidad por segundo) y
//      se hacen tres fotos —con, sin (sólo su `visible`), con— de la ventana de
//      sus vértices. Lo que se apaga y se vuelve a encender tiene que estar
//      DENTRO de la ventana y no en el marco de alrededor (el ruido, el 76 y el
//      97: llamas, figuras que respiran).
//
// Ojo con el 76: `renderer.info` se reinicia en cada `render()` y el bucle hace
// dos; por eso el contador va pegado a la malla y no a `renderer.info`.
//
// Se entra por el menú (§3), con un personaje nuevo que elige el arco de partida.

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5987;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT, { tope: 180_000 });
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("build/gatecity/vistas", { recursive: true });

// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 9;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];
const pct = (x) => `${(x * 100).toFixed(1)} %`;

const nav = await chromium.launch();
try {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e.stack ?? e).slice(0, 400)));
  pag.on("console", (m) => { if (/el arma no se ha podido montar/.test(m.text())) errores.push(m.text().slice(0, 400)); });
  await entrarPorElMenu(pag, PORT);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "bows_treebow"));
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  const arco = await pag.evaluate(() => window.probe.arco.empunar("bows_treebow"));
  control("el arco de partida en la mano, con su conjunto de flechas montado",
    arco.esDeTiro && arco.conjunto > 0, `${arco.id}, ${arco.conjunto} nodos`);

  // ── UNA FLECHA DETENIDA EN EL AIRE ─────────────────────────────────────
  // Se prueba en dieciséis rumbos hasta que una vuela 120 u (3 m) sin chocar:
  // si choca, lo que se fotografía es una flecha clavada, que no es lo que se mide.
  let alto = null;
  for (let k = 0; k < 16 && !alto?.volando; k++) {
    alto = await pag.evaluate((k) => {
      const d = window.probe.mundo.donde();
      const a = (k * Math.PI) / 8;
      window.probe.mundo.mirar(d.ojo[0] + 40 * Math.cos(a), d.ojo[1], d.ojo[2] + 40 * Math.sin(a));
      return window.probe.arco.soltarYDetener(1.3, 120);
    }, k);
  }
  console.log(`\n  flecha detenida: ${JSON.stringify(alto)}`);
  control("una flecha sale y se queda VOLANDO a 3 m (detenida, no clavada)",
    alto?.volando === true && alto.recorrido >= 120 && alto.conPieza, alto ? `${alto.id}, ${alto.recorrido?.toFixed(0)} u` : "ninguna");

  // El arco de la mano tapa media pantalla: se esconde durante todo lo demás.
  await pag.evaluate(() => window.probe.vista.esconder("arma", true));
  await esperar(300);

  // ── 1. EL GRAFO QUE SE PINTA ───────────────────────────────────────────
  const rect = await pag.evaluate(() => window.probe.arco.rectanguloFlecha());
  const dibujos = await pag.evaluate(() => window.probe.arco.dibujosDeFlecha(3));
  await pag.evaluate(() => window.probe.arco.esconderFlecha(true));
  const dibujosEscondida = await pag.evaluate(() => window.probe.arco.dibujosDeFlecha(3));
  await pag.evaluate(() => window.probe.arco.esconderFlecha(false));
  console.log(`  ventana ${rect ? `${rect.x0.toFixed(0)},${rect.y0.toFixed(0)} — ${rect.x1.toFixed(0)},${rect.y1.toFixed(0)}, ${rect.vertices} vértices, en la escena ${rect.enLaEscena}` : "—"}; ` +
    `onBeforeRender en 3 cuadros: ${dibujos} a la vista, ${dibujosEscondida} escondida`);
  control("su nodo cuelga de la escena que pinta el bucle (`renderer.render(escena, camera)`)",
    rect?.enLaEscena === true, `${rect?.enLaEscena}`);
  control("y Three la DIBUJA: `onBeforeRender` de su malla en cada cuadro", dibujos >= 3, `${dibujos} en 3 cuadros`);
  control("control: escondido el nodo, el mismo contador lee 0", dibujosEscondida === 0, `${dibujosEscondida}`);

  // ── 2. LOS PÍXELES ─────────────────────────────────────────────────────
  const foto = async (nombre) => {
    await esperar(150);
    const ruta = `build/gatecity/vistas/armas98-${nombre}.png`;
    await pag.screenshot({ path: ruta });
    return leerPng(ruta);
  };
  let m = null;
  if (rect && rect.vertices > 0) {
    const v = {
      x0: Math.max(0, Math.floor(rect.x0) - 2), y0: Math.max(0, Math.floor(rect.y0) - 2),
      x1: Math.min(rect.ancho, Math.ceil(rect.x1) + 2), y1: Math.min(rect.alto, Math.ceil(rect.y1) + 2),
    };
    const w = v.x1 - v.x0, h = v.y1 - v.y0;
    const marco = { x0: v.x0 - w, y0: v.y0 - h, x1: v.x1 + w, y1: v.y1 + h };
    const con1 = await foto("con");
    await pag.evaluate(() => window.probe.arco.esconderFlecha(true));
    const sin = await foto("sin");
    await pag.evaluate(() => window.probe.arco.esconderFlecha(false));
    const con2 = await foto("con2");
    // Lo que se APAGA Y SE VUELVE A ENCENDER (con≠sin, sin≠con2, con≈con2),
    // dentro de la ventana o en el marco (copiado de sondas/armas97.mjs).
    const vanYVuelven = (dentroDe, { fuera = false, hasta = null } = {}) => {
      const d = (a, b, i) => Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
      let c = 0, n = 0;
      for (let y = 0; y < con1.alto; y++) for (let x = 0; x < con1.ancho; x++) {
        const dentro = x >= dentroDe.x0 && x < dentroDe.x1 && y >= dentroDe.y0 && y < dentroDe.y1;
        if (dentro === fuera) continue;
        if (hasta && !(x >= hasta.x0 && x < hasta.x1 && y >= hasta.y0 && y < hasta.y1)) continue;
        const i = (y * con1.ancho + x) * 4;
        if (d(con1, sin, i) > 24 && d(sin, con2, i) > 24 && d(con1, con2, i) <= 24) c++;
        n++;
      }
      return n ? c / n : NaN;
    };
    m = { v, area: (w * h) / (rect.ancho * rect.alto), dentro: vanYVuelven(v), fuera: vanYVuelven(v, { fuera: true, hasta: marco }) };
  }
  console.log(`  píxeles: ventana ${m ? `${m.v.x1 - m.v.x0}×${m.v.y1 - m.v.y0} (${pct(m.area)} de la pantalla); se apagan y vuelven ${pct(m.dentro)} dentro y ${pct(m.fuera)} en el marco` : "sin ventana"}`);
  control("la flecha cae en el cuadro (vértices delante de la cámara y dentro)",
    Boolean(m) && m.area > 0 && m.area < 0.2, m ? pct(m.area) : "sin vértices en pantalla");
  control("y SE VE: al esconder sólo su nodo se apaga y vuelve > 5 % de su ventana",
    Boolean(m) && m.dentro > 0.05, m ? pct(m.dentro) : "—");
  control("y lo que se apaga es ella: en el marco < 0,5 % y < 1/10 de dentro",
    Boolean(m) && Number.isFinite(m.fuera) && m.fuera < 0.005 && m.fuera < m.dentro / 10, m ? `${pct(m.fuera)} fuera` : "—");

  await pag.evaluate(() => window.probe.vista.esconder("arma", false));
  control("sin errores de página ni «el arma no se ha podido montar»", errores.length === 0, errores.join(" | ").slice(0, 300) || "ninguno");
} catch (e) {
  control("la sonda llega al final sin caerse", false, String(e?.message ?? e).split("\n")[0].slice(0, 200));
} finally {
  await nav.close().catch(() => {});
  matar(dev);
}

const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ── ${bien} de ${DECLARADOS} controles ──`);
if (controles.length !== DECLARADOS) console.log(`  corrieron ${controles.length} de ${DECLARADOS} declarados`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
process.exit(bien === DECLARADOS && controles.length === DECLARADOS ? 0 : 1);
