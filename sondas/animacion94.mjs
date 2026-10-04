// LAS ANIMACIONES DE UNA VEZ Y EL RITMO, JUGANDO — experimento 94.
//
//   node sondas/animacion94.mjs
//
// 1. EDANA: el jabalí come hierba con `playanim once ANIM_IDLE_EATGRASS`
//    (boar_base.script:79-86) y desde el 93 lo hacía ANDANDO: la animación se
//    ponía y el cuerpo seguía a la velocidad de `walk`. En el motor el paso es
//    `m_flGroundSpeed * pev->framerate * …` (msmonsterserver.cpp:1201), con el
//    `linearmovement` de la secuencia PUESTA (animation.cpp:266-267): comiendo
//    no avanza. Se lee del juego de un jugador —`src/main.js` enchufa
//    `bichos.playanim`—, que es el camino que la prueba de Node no ve.
//
// 2. GATE CITY: la araña del salto se queda a ritmo 0,5 (`setanim.framerate
//    .5`, spider.script:121) agarrada y al caer. El DIBUJO tiene que ir a ese
//    ritmo (`dfdt = … * framerate * fps`, studiomodelrenderer.cpp:897). Se mide
//    el reloj de la acción del mezclador de Three fotograma a fotograma, contra
//    un bicho de referencia a ritmo 1 en la misma ventana.
//
// Se entra POR EL MENÚ (CLAUDE.md §3) en los dos mapas.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5494;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };
// Los que se declaran: si la sonda se cae a medias, los que no corrieron
// cuentan como rojos (el 65: «un X de Y donde Y se calcula al final no puede
// bajar nunca»).
const DECLARADOS = 10;

async function pagina() {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // Sin recargado en caliente: el árbol es compartido con otras sesiones.
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

async function entrar(pag, mapa) {
  await entrarPorElMenu(pag, PORT, { mapa });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  return pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
}

try {
  // ── 1. EDANA: EL JABALÍ SE PARA A COMER ──────────────────────────────────
  {
    const pag = await pagina();
    const mapa = await entrar(pag, "edana");
    control("se entra por el menú en edana", mapa === "edana", `mapa ${mapa}`);
    // Todos los jabalíes `monsters/boar` del mapa, muestreados en la página
    // cada 100 ms durante 90 s (un `evaluate` por muestra mediría su propia
    // latencia, el 75). La vida del jugador a tope: si un jabalí lo ve, lo
    // caza, y cazando no come (`if !IS_HUNTING`), pero no debe morir.
    const muestras = await pag.evaluate(async () => {
      const fuera = [];
      for (let k = 0; k < 900; k++) {
        window.probe.costura.curar();
        const fila = [];
        for (let n = 0; n < 12; n++) {
          const c = window.probe.costura.de("monsters/boar", n);
          if (!c) break;
          fila.push({ n, vivo: c.vivo, dormido: c.dormido, anim: c.anim, gen: c.gen, candado: c.candado, conDestino: c.conDestino, donde: c.donde });
        }
        fuera.push(fila);
        await new Promise((r) => setTimeout(r, 100));
      }
      return fuera;
    });
    let comiendo = 0, avanceComiendo = 0, andando = 0, avanceAndando = 0, hierbas = 0;
    for (let k = 1; k < muestras.length; k++) {
      for (const b of muestras[k]) {
        const a = muestras[k - 1].find((x) => x.n === b.n);
        if (!a || !b.vivo || b.dormido || !a.donde || !b.donde) continue;
        const d = Math.hypot(b.donde[0] - a.donde[0], b.donde[2] - a.donde[2]) * 39.37;
        if (b.anim === "idle2" && b.gen !== a.gen) hierbas++;
        // La MISMA puesta de `idle2` (misma generación) en las dos muestras,
        // con el candado echado y el destino puesto en las dos: 100 ms enteros
        // comiendo con algo a donde ir.
        if (a.anim === "idle2" && b.anim === "idle2" && a.gen === b.gen && a.candado && b.candado && a.conDestino && b.conDestino) {
          comiendo++; avanceComiendo += d;
        }
        if (a.anim === "walk" && b.anim === "walk" && a.gen === b.gen && a.conDestino && b.conDestino && !b.candado) { andando++; avanceAndando += d; }
      }
    }
    const det = JSON.stringify({ jabalies: muestras.at(-1)?.length, hierbas, comiendo, avanceComiendo: +avanceComiendo.toFixed(2), andando, avanceAndando: +avanceAndando.toFixed(1) });
    console.log(`  edana: ${det}`);
    control("CONTROL: algún jabalí come hierba (`idle2` de una vez) en 90 s", hierbas >= 1, det);
    control("CONTROL: y alguna vez con un destino puesto (si no, el cero de abajo es el reposo)", comiendo >= 3, det);
    control("CONTROL POSITIVO: el mismo instrumento ve andar a un jabalí (`walk` con destino avanza)",
      andando >= 10 && avanceAndando / andando > 1, det);
    control("COMIENDO NO AVANZA: `idle2` con destino puesto, 0 unidades entre muestras", avanceComiendo === 0, det);
    await pag.close();
  }

  // ── 2. GATE CITY: LA ARAÑA A RITMO 0,5 SE DIBUJA A RITMO 0,5 ─────────────
  {
    const pag = await pagina();
    const mapa = await entrar(pag, "gatecity");
    control("se entra por el menú en gatecity", mapa === "gatecity", `mapa ${mapa}`);
    const ARANA = "monsters/spider";
    const de = (n) => pag.evaluate(({ g, n }) => window.probe.costura.de(g, n), { g: ARANA, n });
    let n = -1;
    for (let t = 0; t < 80 && n < 0; t++) {
      for (let k = 0; k < 8; k++) { const c = await de(k); if (!c) break; if (!c.dormido && c.vivo && c.conGuion) { n = k; break; } }
      if (n < 0) await pag.waitForTimeout(500);
    }
    if (n < 0) throw new Error("sin araña de Gate City no hay medida");
    // Pegado a ella hasta que una se quede a ritmo 0,5 (salta y se agarra,
    // como en sondas/salto93.mjs). Vale CUALQUIERA de las grandes: pegado a
    // una, a veces es otra la que salta (medido: una pasada de 150 s en que la
    // de al lado no saltó nunca y otra sí). Se recoloca mientras no la lleva
    // el guion.
    let c = null, medida = null;
    for (let t = 0; t < 150000 && !medida; t += 250) {
      await pag.evaluate(() => window.probe.costura.curar());
      c = await de(n);
      if (!c?.vivo) break;
      const agarrada = await pag.evaluate((g) => {
        for (let k = 0; k < 8; k++) { const x = window.probe.costura.de(g, k); if (!x) break; if (x.fisica?.ritmoAnim === 0.5 && x.fisica?.sigue) return x; }
        return null;
      }, ARANA);
      if (agarrada) {
        c = agarrada;
        medida = await pag.evaluate((id) => window.probe.costura.relojDeDibujo(id, 1500), c.id);
        break;
      }
      // Sólo si se ha ido a más de 1,5 m. Recolocar cada 250 ms a 10 cm del
      // suelo deja al jugador EN EL AIRE media vuelta de cada dos, y el salto
      // pide `$get(HUNT_LASTTARGET,onground)` (spider.script:104): medido, una
      // araña cazando y mordiendo tardó 18 intentos del 20 % en saltar.
      if (!c.fisica?.manda) {
        await pag.evaluate(({ p }) => {
          const j = window.probe.mundo.donde()?.pies;
          if (j && Math.hypot(j[0] - p[0], j[2] - p[2]) < 1.5) return;
          window.probe.mundo.poner(p[0] - 0.9, p[1] + 0.1, p[2]); window.probe.mundo.mirar(p[0], p[1] + 0.2, p[2]);
        }, { p: c.donde });
      }
      await pag.waitForTimeout(250);
    }
    console.log(`  gatecity: ${JSON.stringify(medida)}`);
    control("la araña se agarra a ritmo 0,5 (spider.script:121)", Boolean(medida), JSON.stringify(c?.fisica));
    const ritmoVisto = medida && medida.contado > 0.5 ? medida.avance / medida.contado : null;
    const ritmoRef = medida && medida.ref.contado > 0.5 ? medida.ref.avance / medida.ref.contado : null;
    // Se compara con la REFERENCIA de la misma ventana y no con el reloj de
    // pared: con la máquina cargada el bucle del juego recorta el `dt` y los
    // dos relojes de dibujo van por detrás del de pared por igual (medido:
    // 0,868 s por segundo el goblin y 0,434 la araña). El cociente no se mueve.
    const cociente = ritmoVisto !== null && ritmoRef ? ritmoVisto / ritmoRef : null;
    control("CONTROL POSITIVO: el reloj del dibujo de un bicho a ritmo 1 avanza (más de 0,5 s por segundo)",
      ritmoRef !== null && ritmoRef > 0.5, `ref ${ritmoRef?.toFixed(3)} (${medida?.ref?.guion} ${medida?.ref?.anim})`);
    control("EL DIBUJO DE LA ARAÑA VA A 0,5: su clip avanza la mitad que el de la referencia",
      cociente !== null && Math.abs(cociente - 0.5) < 0.08,
      `cociente ${cociente?.toFixed(3)}: araña ${ritmoVisto?.toFixed(3)} (${medida?.anim}, ${medida?.contado?.toFixed(2)} s contados), ref ${ritmoRef?.toFixed(3)}`);
    await pag.close();
  }
} catch (e) {
  control("la sonda corre entera", false, String(e).slice(0, 300));
} finally {
  await nav.close();
  matar(dev);
}

control("sin errores en la página", errores.length === 0, errores.slice(0, 3).join(" | "));
const bien = controles.filter((x) => x.bien).length;
for (const x of controles) console.log(`  ${x.bien ? "OK " : "MAL"} ${x.que}${x.detalle ? `  — ${x.detalle}` : ""}`);
const total = Math.max(DECLARADOS, controles.length);
console.log(`\n${bien} de ${total} en verde${controles.length < DECLARADOS ? ` (${DECLARADOS - controles.length} no llegaron a correr)` : ""}`);
process.exit(bien === total ? 0 : 1);
