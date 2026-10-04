// EL PELLEJO DEL JABALÍ — experimento 82.
//
//   npm run sonda:botin82
//
// Lo reportó el usuario: «los boars no sueltan boar pelts al morir». No lo
// hacían, y lo que hace que nadie lo echara de menos es dónde vive la regla:
// el botín se sortea **al nacer** (`npc_post_spawn`, un segundo después de
// aparecer, con `giveitem`) y la muerte sólo lo deja caer (`DropAllItems()`,
// msmonsterserver.cpp:2614). Quien busca en el camino de la muerte no encuentra
// nada que portar.
//
// ── POR QUÉ UNA SONDA Y NO SÓLO `test/botin82.test.mjs` ────────────────────
//
// Porque las 18 pruebas de Node llegan hasta `manada.sucesos`: demuestran que
// el bicho nace con el pellejo y que al morir lo anuncia. **Lo que no pueden
// ver es que ese anuncio se convierta en un objeto del mundo.** Entre el
// suceso y el objeto hay un catálogo que puede no tener el guion, un `Suelo`
// que lo rechaza en silencio, y un modelo que puede no existir. Es la costura
// del 63, y la costura la mide una sonda.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   - **«soltó algo» contando objetos del suelo.** Edana ya tiene objetos en el
//     suelo antes de que yo mate nada. Se cuenta la DIFERENCIA y se comprueba
//     que el que apareció es del guion que el jabalí declara.
//   - **«el jabalí no soltó nada» con un 20 %.** Siete de cada diez jabalíes no
//     sueltan, y eso es del mod: medir «no apareció» sin control positivo es
//     medir el dado. Por eso se mata también al **jefe jabalí, que es 100 %**.
//   - **el guion que el catálogo no tiene.** `Suelo.soltar` devuelve `null` y
//     apunta `objeto_sin_guion` en sus salidas; si no se lee eso, «no soltó
//     nada» y «soltó algo que no existe» se ven igual.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5283;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

// vite-hmr fuera: otra sesión guardando un archivo recarga la página y se lleva
// `window.probe` a mitad de pasada.
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
const pendiente = (que, porQue) => controles.push({ que, bien: null, detalle: porQue });

mkdirSync("build/edana/vistas", { recursive: true });

/** Lo que cada uno declara, escrito a mano porque ES la regla (el 75). */
const JABALI = { guion: "monsters/boar", objeto: "skin_boar", probabilidad: 20 };
const JEFE = { guion: "edana/boarboss", objeto: "skin_boar_heavy", probabilidad: 100 };

try {
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => (window.probe.reaccion.censo() ?? []).length > 0, { timeout: 120000 });

  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú y el mapa es Edana", mapa === "edana", `mapa ${mapa}`);

  // ── LO QUE EL HORNEADO DICE ──────────────────────────────────────────────
  const fichas = await pag.evaluate(() => window.probe.reaccion.censo()
    .filter((c) => /boar/.test(String(c.script)))
    .map((c) => ({ n: c.n, nombre: c.nombre, script: c.script, vida: c.vida })));
  control("hay jabalíes en Edana", fichas.length > 0, `${fichas.length} con «boar» en el guion`);

  /**
   * MATAR AL BICHO `n` Y MIRAR QUÉ APARECE EN EL SUELO.
   *
   * Se compara el suelo ANTES y DESPUÉS, porque Edana ya tiene objetos tirados
   * y un recuento absoluto no distingue lo mío de lo que ya estaba.
   */
  const matarYMirar = async (n) => await pag.evaluate(({ n }) => {
    const S = window.probe;
    const antes = (S.mundo.suelo() ?? []).map((o) => o.i);
    const b0 = S.reaccion.censo()[n];
    if (!b0 || !(b0.vida > 0)) return { muerto: false, nuevos: [], porQue: "ya estaba muerto" };
    // A ESPADAZOS Y NO CON `pegarA`.
    //
    // `probe.reaccion.pegarA` llama a `bichos.herir` y **rehace a mano** lo que
    // la muerte hace en `main.js`: quita el cilindro y reparte experiencia. Es
    // una copia del camino de la muerte dentro del instrumento, o sea el 65 —
    // «cuando una sonda RECALCULA algo en vez de leerlo, deja de ser un
    // testigo»— y con ella esta sonda daba rojo con el trabajo bien hecho,
    // porque esa copia no sabía del botín. `golpe.atacar` corre el mismo `tic`
    // que el jugador, así que pasa por donde el juego pasa.
    // La POSICIÓN no está en el censo de reacción: la da `probe.ia.bicho`, que
    // busca por guion. Se comprueba que el que encuentra es el mismo índice,
    // porque buscar por nombre ya resolvió a quien no era en el 79.
    const b1 = S.ia.bicho(String(b0.script));
    const d = b1?.donde ?? null;
    if (!d) return { muerto: false, nuevos: [], porQue: `sin posición para ${b0.script}` };
    // Plantarse al lado y mirarle. Al lado y no encima: `poner` no resuelve
    // colisiones (el 69).
    S.mundo.poner(d[0] + 0.8, d[1] + 0.1, d[2]);
    S.mundo.mirar(d[0], d[1] + 0.3, d[2]);
    let golpes = 0;
    while (golpes < 80) {
      const v = S.reaccion.censo()[n];
      if (!v || !(v.vida > 0)) break;
      S.golpe.atacar(1.2);
      golpes++;
    }
    const v = S.reaccion.censo()[n];
    const despues = S.mundo.suelo() ?? [];
    return {
      muerto: !v || !(v.vida > 0),
      golpes,
      vidaAntes: b0.vida, vidaDespues: v?.vida ?? null,
      cuentas: S.golpe?.cuentas?.() ?? null,
      nuevos: despues.filter((o) => !antes.includes(o.i)).map((o) => ({ guion: o.guion, donde: o.donde })),
    };
  }, { n });

  // ── EL JEFE, QUE ES EL 100 % ─────────────────────────────────────────────
  //
  // Se mata primero y es el control que NO depende del dado: si éste no suelta
  // nada, el fallo es del mecanismo y no de la suerte.
  const jefe = fichas.find((f) => f.script === JEFE.guion);
  if (!jefe) {
    pendiente("EL JEFE JABALÍ SUELTA SU PELLEJO SIEMPRE (100 %)",
      `no hay ninguna criatura con el guion ${JEFE.guion} en el censo: ` +
      "nace de un `msarea_monsterspawn` y puede no estar al entrar");
  } else {
    const r = await matarYMirar(jefe.n);
    control("EL JEFE JABALÍ SUELTA SU PELLEJO, y es el que no depende del dado",
      r.muerto && r.nuevos.some((o) => o.guion === JEFE.objeto),
      `muerto ${r.muerto}, ${r.golpes} golpes, vida ${r.vidaAntes}->${r.vidaDespues}, apareció ${JSON.stringify(r.nuevos.map((o) => o.guion))}`);

    // Y ESTE CONTROL ES EL QUE SEPARA LAS DOS CAUSAS. `Suelo.soltar` devuelve
    // `null` cuando el catálogo no conoce el guion, y entonces no nace nada —
    // que se ve igual que «no llevaba nada». Con el jefe, que es 100 %, las
    // pruebas de Node ya garantizan que lo lleva: si aquí no aparece, el que
    // falla es el catálogo y no el dado.
    control("y el catálogo conoce su guion: si lo llevaba, nació de verdad",
      r.nuevos.length > 0,
      r.nuevos.length ? `nació ${r.nuevos[0].guion}` :
        "no nació nada, y con 100 % eso señala al catálogo de objetos");
  }

  // ── LOS JABALÍES NORMALES, QUE SON EL 20 % ───────────────────────────────
  //
  // Con cinco en el mapa y un 20 %, la probabilidad de que NINGUNO suelte es
  // 0,8^5 = 33 %: demasiado para afirmar nada de una pasada. Así que esto no
  // afirma «sueltan», afirma lo que sí se puede afirmar — que de los que
  // sueltan, lo que sueltan es su pellejo y no otra cosa.
  const normales = fichas.filter((f) => f.script !== JEFE.guion);
  let soltaron = 0;
  const caidos = [];
  for (const f of normales) {
    const r = await matarYMirar(f.n);
    for (const o of r.nuevos) { soltaron++; caidos.push(o.guion); }
  }
  control("y de los jabalíes normales, lo que cae es SU pellejo y no otra cosa",
    caidos.every((g) => g === JABALI.objeto),
    `${soltaron} objetos de ${normales.length} jabalíes: ${JSON.stringify(caidos)}` +
    ` (con ${JABALI.probabilidad} % lo esperable es ~${(normales.length * JABALI.probabilidad / 100).toFixed(1)})`);

  pendiente(`la tasa del ${JABALI.probabilidad} % de los jabalíes normales`,
    `con ${normales.length} jabalíes la probabilidad de que no suelte ninguno es ` +
    `${Math.round(Math.pow(1 - JABALI.probabilidad / 100, normales.length) * 100)} %: ` +
    "una pasada no puede decidirlo, y el reparto se mide en test/botin82.test.mjs con 1 000 tiradas");

  // ── EL CONTROL NEGATIVO ──────────────────────────────────────────────────
  //
  // Un bicho SIN `DROP_ITEM` no puede soltar nada. Sin esto, «aparecieron
  // objetos» podría ser que todo lo que muere suelte algo.
  const sinBotin = await pag.evaluate(() => {
    const S = window.probe;
    const c = S.reaccion.censo().find((x) => /giantrat|commoner/.test(String(x.script)) === false
      && x.vida > 0 && !/boar/.test(String(x.script)));
    if (!c) return null;
    const antes = (S.mundo.suelo() ?? []).map((o) => o.i);
    S.reaccion.pegarA(c.n, (c.vida ?? 1) + 5);
    const nuevos = (S.mundo.suelo() ?? []).filter((o) => !antes.includes(o.i));
    return { script: c.script, nuevos: nuevos.map((o) => o.guion) };
  });
  if (!sinBotin) {
    pendiente("CONTROL NEGATIVO: un bicho sin `DROP_ITEM` no suelta nada",
      "no se encontró ninguna criatura viva sin botín que matar");
  } else {
    control("CONTROL NEGATIVO: un bicho sin `DROP_ITEM` no suelta nada",
      sinBotin.nuevos.length === 0,
      `${sinBotin.script} soltó ${JSON.stringify(sinBotin.nuevos)}`);
  }

  control("y la página no ha dado ni un error", errores.length === 0,
    errores.slice(0, 3).join(" · "));

  await pag.screenshot({ path: "build/edana/vistas/botin82.png" });
} catch (e) {
  // El 65: la caída es una roja, no una nota al pie.
  control("la sonda llega al final sin caerse", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((c) => c.bien === true).length;
  const rojos = controles.filter((c) => c.bien === false).length;
  const pend = controles.filter((c) => c.bien === null).length;
  console.log("");
  for (const c of controles) {
    const m = c.bien === null ? "  ··" : c.bien ? "  ok" : "FALLA";
    console.log(`${m}  ${c.que}${c.detalle ? `\n        ${c.detalle}` : ""}`);
  }
  console.log(`\n── ${verdes} de ${verdes + rojos} controles${pend ? ` · ${pend} pendiente${pend > 1 ? "s" : ""}` : ""} ──\n`);
  await nav.close();
  matar(dev);
  process.exit(rojos > 0 ? 1 : 0);
}
