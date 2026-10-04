// EL PARPADEO ENTRE ANIMACIONES — experimento 82.
//
//   npm run sonda:parpadeo82
//
// Lo reportó el usuario comparando con el original: «un extraño parpadeo entre
// animaciones NPC, dura menos de 1 segundo pero parece que se resetean a su
// posición por defecto antes de seguir a la siguiente; no pasa en el original y
// me parece que no se puede arreglar aquí».
//
// Sí se podía, y era literal: **se dibujaba un fotograma con la pose de enlace
// del modelo.**
//
//     animar(dt) {
//       manada.relojes(dt);
//       mezclador.update(dt);   <- evalúa la animación VIEJA
//       refrescar();            <- y aquí dentro se cambia de animación
//     }
//
// `aplicarAnimacion` hace `stopAllAction()`, y un mezclador de Three sin
// ninguna acción **devuelve el esqueleto a su pose de enlace**. La acción nueva
// se arranca pero nadie la evalúa antes de dibujar, así que ese fotograma sale
// con el muñeco en reposo. El siguiente ya va bien, y por eso dura un parpadeo.
//
// ── POR QUÉ ESTO ES UNA SONDA Y NO UNA PRUEBA DE NODE ─────────────────────
//
// Porque lo que falla no es una regla: es **Three.js y el orden del bucle de
// dibujo**. No hay nada que pueda comprobar un `node --test` — ni mezclador, ni
// esqueleto, ni fotograma. Si esto se midiera en Node habría que escribir un
// mezclador de mentira, y entonces mediría mi mentira.
//
// ── CÓMO SE MIDE SIN DEPENDER DEL FOTOGRAMA ──────────────────────────────
//
// Un parpadeo de UN fotograma no se puede cazar muestreando: medido, un
// `requestAnimationFrame` dentro de un `evaluate` da **siete muestras por
// segundo**, y a 140 ms por muestra un artefacto de 16 ms es invisible. Así que
// no se muestrea: se pide el cambio de animación **por donde lo pide el juego**
// y se lee la pose justo después, que es exactamente lo que el renderizador va
// a dibujar ese fotograma. Eso es síncrono y no depende de la máquina.
//
// La «pose» es la suma de los cuaterniones de los doce primeros huesos. No es
// física: es un número que cambia cuando la pose cambia.
//
// ── LA TRAMPA QUE ESTO TUVO, Y ESTÁ MEDIDA ───────────────────────────────
//
// **Con `idle1` el control no puede fallar.** Su fotograma 0 ES la pose de
// enlace del modelo, así que «se ve el reposo» y «se ve idle1» dan el MISMO
// número y el control pasa con el fallo puesto. Es el 50 dentro de un
// fotograma. Por eso se mide con `idle7`, y el primer control de abajo existe
// para demostrar que el instrumento distingue las dos cosas.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5284;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

await pag.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protos) {
    const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
});

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

/** El NPC que se mide: quieto, con tres «idle» y uno que no es la pose de enlace. */
const QUIEN = "weaponsmith";

try {
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => (window.probe.reaccion.censo() ?? []).length > 0, { timeout: 120000 });
  await new Promise((r) => setTimeout(r, 2000));

  const m = await pag.evaluate(({ quien }) => {
    const S = window.probe;
    const i = S.ia._buscar(quien);
    if (!i) return { error: `no se encontró ${quien}` };
    let huesos = null;
    i.nodo.traverse((o) => { if (!huesos && o.isSkinnedMesh) huesos = o.skeleton.bones; });
    if (!huesos) return { error: "sin esqueleto" };
    const firma = () => {
      let s = 0;
      for (let k = 0; k < Math.min(12, huesos.length); k++) {
        const q = huesos[k].quaternion;
        s += Math.abs(q.x) + Math.abs(q.y) + Math.abs(q.z) + Math.abs(q.w);
      }
      return s;
    };
    // 1. LA POSE DE ENLACE, para tenerla como referencia. Se consigue haciendo
    //    lo que hacía el fallo: dejar el mezclador sin ninguna acción.
    const animada = firma();
    i.mezclador.stopAllAction();
    i.mezclador.update(0);
    const enlace = firma();
    // 2. Un cambio de animación POR DONDE LO PIDE EL JUEGO.
    const puso1 = Boolean(i.pon("idle1"));
    const trasIdle1 = firma();
    const puso7 = Boolean(i.pon("idle7"));
    const trasIdle7 = firma();
    return {
      animada, enlace, trasIdle1, trasIdle7, puso1, puso7,
      clips: [...i.clips.keys()].filter((k) => Number.isNaN(Number(k))),
    };
  }, { quien: QUIEN });

  if (m.error) {
    control("se encuentra el NPC y su esqueleto", false, m.error);
  } else {
    control("se encuentra el NPC y su esqueleto, con sus tres animaciones de reposo",
      m.clips.includes("idle1") && m.clips.includes("idle7"),
      `clips: ${m.clips.join(", ")}`);

    // CONTROL POSITIVO DEL INSTRUMENTO. Sin esto, «la pose no es la de enlace»
    // podría ser simplemente que mi firma no distingue ninguna pose de ninguna.
    const separacion = Math.abs(m.animada - m.enlace);
    control("EL INSTRUMENTO VE LA DIFERENCIA: la pose de enlace no es la animada",
      separacion > 0.05,
      `animada ${m.animada.toFixed(4)} · enlace ${m.enlace.toFixed(4)} · separación ${separacion.toFixed(4)}`);

    control("y el cambio de animación se pide por donde lo pide el juego",
      m.puso1 && m.puso7, `pon(idle1)=${m.puso1}, pon(idle7)=${m.puso7}`);

    // EL CONTROL. Con el arreglo quitado esto da exactamente 0.
    const dEnlace = Math.abs(m.trasIdle7 - m.enlace);
    control("TRAS CAMBIAR DE ANIMACIÓN, LA POSE NO ES LA DE ENLACE",
      dEnlace > 0.05,
      `distancia a la pose de enlace ${dEnlace.toFixed(4)}` +
      (dEnlace === 0 ? "  <- se está dibujando el muñeco sin animar" : ""));

    // Y EL CASO QUE NO PUEDE MEDIR ESTO, dicho en voz alta en vez de contado
    // como un verde: el fotograma 0 de `idle1` ES la pose de enlace.
    const dIdle1 = Math.abs(m.trasIdle1 - m.enlace);
    control("y queda dicho que con `idle1` este control NO podría fallar",
      dIdle1 < 1e-9,
      `su fotograma 0 coincide con la pose de enlace (distancia ${dIdle1.toFixed(9)}): ` +
      "por eso se mide con idle7 y no con la primera que haya");
  }

  control("y la página no ha dado ni un error", errores.length === 0,
    errores.slice(0, 3).join(" · "));
} catch (e) {
  control("la sonda llega al final sin caerse", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((c) => c.bien === true).length;
  const rojos = controles.filter((c) => c.bien === false).length;
  console.log("");
  for (const c of controles) {
    console.log(`${c.bien ? "  ok" : "FALLA"}  ${c.que}${c.detalle ? `\n        ${c.detalle}` : ""}`);
  }
  console.log(`\n── ${verdes} de ${verdes + rojos} controles ──\n`);
  await nav.close();
  matar(dev);
  process.exit(rojos > 0 ? 1 : 0);
}
