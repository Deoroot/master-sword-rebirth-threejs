// QUE LA RATA TE MUERDA — experimento 82.
//
//   npm run sonda:mordisco82
//
// El 80 midió el golpe DEL JUGADOR contra una rata y encontró tres fallos.
// Éste es el camino de vuelta, el que va del bicho a ti, y tenía uno propio: el
// motor no compara la distancia con `ATTACK_RANGE`, compara `range`, que lleva
// restada la mitad de las dos anchuras (scriptcmds.cpp:1154). Sin esa resta una
// rata no muerde NUNCA, y no por su alcance sino por su cuerpo:
//
//   hypot(32, 36) = 48,2   contra un `ATTACK_RANGE` de 48
//          │   └── el jugador se mide por su CENTRO, 36 sobre sus pies
//          └────── y los dos cuerpos de 32 no juntan los centros a menos de 32
//
// ── POR QUÉ UNA SONDA Y NO SÓLO `test/mordisco82.test.mjs` ─────────────────
//
// Porque las 18 pruebas de Node miden la regla y el reparto con un `Manada` de
// verdad, pero **el que de verdad pone los números es el mundo**: la posición
// del jugador la da Rapier, la separación la deciden dos colisionadores, y los
// 36 del centro salen del perfil de la cápsula y no de una constante mía. Si la
// cápsula midiera otra cosa, mis pruebas seguirían verdes y la rata seguiría sin
// morder. Esa costura sólo la ve un navegador.
//
// ── LAS FORMAS DE QUE ESTO PAREZCA FUNCIONAR Y ESTÉ MAL ───────────────────
//
//   - **«me ha pegado» leído de la vida.** El jugador REGENERA (+1, del 64), así
//     que dos mecanismos mueven el mismo número y «bajó» no dice cuál — el 66
//     exacto. Aquí la vida se mide DOS VECES, cerca y lejos, con la misma
//     duración: la regeneración es la misma en las dos y la diferencia es el
//     mordisco.
//   - **«me ha pegado N veces» contando intentos.** `golpesRecibidos` sube una
//     vez por golpe que entra, no por fotograma con la intención puesta. Esa
//     confusión me costó una vuelta en las pruebas de Node: `i.intencion`
//     sobrevive entre ciclos de pensar y daba 177 intentos en 10 s.
//   - **«de lejos no me pega» con la rata ya encima.** Corre a 76 u/s: en diez
//     segundos llega a cualquier sitio. El control de lejos la deja CIEGA, que
//     es lo que fija la distancia de verdad.
//   - **la rata equivocada.** Son varias y salen de un `msarea_monsterspawn`:
//     se elige por `script` y se dice cuál, como en el 80.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5282;
const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

// VITE-HMR FUERA. Otra sesión guardando un archivo recarga la página y se lleva
// `window.probe` a mitad de pasada; se corta por subprotocolo para no tocar el
// resto de los WebSocket.
await pag.addInitScript(() => {
  const Real = window.WebSocket;
  window.WebSocket = function (url, protos) {
    const esHmr = protos === "vite-hmr"
      || (Array.isArray(protos) && protos.includes("vite-hmr"));
    if (!esHmr) return new Real(url, protos);
    return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
  };
});

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const pendiente = (que, porQue) => controles.push({ que, bien: null, detalle: porQue });

const VISTAS = "build/edana/vistas";
mkdirSync(VISTAS, { recursive: true });

const U = 39.37;
const GUION_RATA = "giantrat";
/** Los dos números del motor, escritos aquí porque SON la regla. */
const ATTACK_RANGE_RATA = 48;
const CENTRO_DEL_JUGADOR = 36;

try {
  await entrarPorElMenu(pag, PORT, { mapa: "edana" });
  // `entrarPorElMenu` no crea personaje a propósito, y sin personaje no hay
  // vida que medir ni nadie a quien morder. El 81 perdió una pasada por esto.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));

  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú y el mapa es Edana", mapa === "edana", `mapa ${mapa}`);

  await pag.waitForFunction(
    (g) => Boolean(window.probe.ia.bicho(g)) && !window.probe.ia.bicho(g).dormido,
    GUION_RATA, { timeout: 120000 });

  const rata = await pag.evaluate((g) => window.probe.ia.bicho(g), GUION_RATA);
  control("hay una rata viva y despierta, y es la del guion `giantrat`",
    Boolean(rata) && rata.guion.includes(GUION_RATA) && !rata.muerto && rata.vida > 0,
    `${rata?.nombre}, vida ${rata?.vida}/${rata?.vidaMaxima}, guion ${rata?.guion}`);

  control("y su `ATTACK_RANGE` es el de su archivo: 48 unidades",
    rata?.alcanceDeGolpe === ATTACK_RANGE_RATA, `alcance ${rata?.alcanceDeGolpe} u`);

  // ── LA GEOMETRÍA, MEDIDA EN EL MUNDO Y NO SUPUESTA ───────────────────────
  //
  // Esto es lo que una prueba de Node no puede dar: los 36 del centro del
  // jugador salen del perfil de su cápsula, y la separación mínima la deciden
  // dos colisionadores de Rapier. Si cualquiera de los dos midiera otra cosa,
  // la cuenta del fallo sería distinta.
  // El probe da el ojo y los pies, no el alto. El ojo de un jugador de GoldSrc
  // está a 64 de una caja de 72, así que un ojo medido a ~64 unidades dice que
  // la caja es la del motor y por tanto que su centro está a 36 — que es la
  // altura con la que `objetivos()` le pasa la posición a la IA. Se deriva de
  // algo medido en vez de escribir el 36 dos veces.
  const alturas = await pag.evaluate(() => {
    const d = window.probe.mundo.donde();
    return { ojoU: (d.ojo[1] - d.pies[1]) * 39.37 };
  });
  control("el ojo del jugador está a ~64 unidades: su caja es la de 72 del motor",
    Math.abs(alturas.ojoU - 64) < 6,
    `ojo a ${alturas.ojoU.toFixed(1)} u, o sea centro a ${(alturas.ojoU * 36 / 64).toFixed(1)} u`);

  /**
   * UNA TANDA: mantiene al jugador a `metros` de la rata y corre `segundos`.
   *
   * LO QUE SE FIJA ES LA SEPARACIÓN, NO EL PUNTO. Puesto el jugador en un sitio
   * y suelta la rata, la rata **llega**: corre a 76 u/s, o sea casi dos metros
   * por segundo, así que en doce segundos cubre veintitrés metros y el control
   * de «de lejos no pega» sale rojo con el trabajo bien hecho. Es el 69 — el que
   * mide tiene que estar a la distancia que cree—, y el mismo tropiezo que tuve
   * en las pruebas de Node con el objetivo clavado en un punto absoluto.
   *
   * Así que el jugador se recoloca cada décima, y entonces `metros` es lo único
   * que distingue una tanda de la otra.
   */
  const tanda = async (metros, segundos) => await pag.evaluate(
    ({ g, metros, segundos }) => {
      const colocar = () => {
        const r = window.probe.ia.bicho(g);
        // AL LADO Y NO ENCIMA: `poner` no resuelve colisiones (el 69).
        window.probe.mundo.poner(r.donde[0] + metros, r.donde[1] + 0.05, r.donde[2]);
        window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
      };
      colocar();
      // PROVOCARLA, que es lo que hace el jugador que reporta el fallo.
      //
      // `vermin` RECELA de `human`: una rata de Edana no te ataca por verte, y
      // eso es fiel al mod. El único camino por el que llega a atacarte es la
      // rama `struck_by_enemy` del golpe recibido, así que sin pegarle primero
      // esta sonda mediría un bicho pacífico y diría que el fallo sigue.
      //
      // 0,4 de daño: por encima de su `FLEE_HEALTH 2` con 4 de vida, así que no
      // se dispara la huida — una rata huyendo tampoco muerde, y sería otro
      // verde midiendo otra cosa.
      const n = window.probe.reaccion.censo().findIndex((c) => String(c.script).includes(g));
      const golpeDado = n >= 0 ? window.probe.reaccion.pegarA(n, 0.4) : null;
      const antes = {
        golpes: window.probe.ia.golpes,
        vida: window.probe.sesion.vitales()?.vida ?? null,
      };
      const separaciones = [];
      for (let t = 0; t < segundos; t += 0.1) {
        window.probe.ia.correr(0.1);
        const r = window.probe.ia.bicho(g);
        const p = window.probe.mundo.donde();
        separaciones.push(Math.hypot(r.donde[0] - p.pies[0], r.donde[2] - p.pies[2]) * 39.37);
        colocar();
      }
      return {
        provocada: Boolean(golpeDado) && !golpeDado.muerto && !golpeDado.huye,
        huyo: Boolean(golpeDado?.huye),
        golpes: window.probe.ia.golpes - antes.golpes,
        vida: (window.probe.sesion.vitales()?.vida ?? 0) - (antes.vida ?? 0),
        atacantes: window.probe.ia.atacantes().length,
        // La separación de verdad que ha habido, no la que pedí: la mayor de
        // las medidas, que es la que tiene que caber en el alcance.
        separacion: Math.max(...separaciones),
        minima: Math.min(...separaciones),
      };
    }, { g: GUION_RATA, metros, segundos });

  // ── EL RECELO, QUE ES FIEL Y NO UN FALLO ─────────────────────────────────
  //
  // Antes de medir el mordisco hay que medir esto, porque si no el control de
  // arriba no se puede interpretar: una rata que no te ataca puede ser el fallo
  // o puede ser el mod. `vermin` declara `recelo human` en `races.script`, así
  // que es el mod — y la consecuencia es que esta sonda tiene que provocarla.
  const sinTocar = await pag.evaluate(({ g }) => {
    const r = window.probe.ia.bicho(g);
    window.probe.mundo.poner(r.donde[0] + 0.9, r.donde[1] + 0.05, r.donde[2]);
    window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
    window.probe.ia.correr(4);
    const c = window.probe.reaccion.censo().find((x) => String(x.script).includes(g));
    return { atacantes: window.probe.ia.atacantes().length, hostil: c?.hostil ?? null, raza: c?.raza ?? null };
  }, { g: GUION_RATA });
  control("sin provocarla NO ataca, y eso es fiel: `vermin` recela de `human`",
    sinTocar.atacantes === 0 && sinTocar.hostil === false,
    `raza ${sinTocar.raza}, hostil ${sinTocar.hostil}, atacantes ${sinTocar.atacantes}`);

  // ── EL MORDISCO ──────────────────────────────────────────────────────────
  const cerca = await tanda(0.9, 12);
  control("y al pegarle, te ficha: `struck_by_enemy`",
    cerca.provocada && cerca.atacantes > 0,
    `provocada ${cerca.provocada}, huyó ${cerca.huyo}, atacantes ${cerca.atacantes}`);
  control("PEGADO A LA RATA, LA RATA MUERDE",
    cerca.golpes > 0,
    `${cerca.golpes} golpes en 12 s, a ${cerca.separacion.toFixed(1)} u de separación`);

  control("y se acerca de verdad: la separación final está dentro de su alcance",
    cerca.separacion < ATTACK_RANGE_RATA + CENTRO_DEL_JUGADOR,
    `${cerca.separacion.toFixed(1)} u`);

  control("y te tiene fichado, que es el paso de antes",
    cerca.atacantes > 0, `${cerca.atacantes} atacantes`);

  // ── EL CONTROL POSITIVO: LA MISMA RATA, LEJOS, NO PEGA ───────────────────
  const lejos = await tanda(9, 12, { ciega: true });
  control("CONTROL POSITIVO: la misma rata a nueve metros no pega",
    lejos.golpes === 0,
    `${lejos.golpes} golpes, separación final ${lejos.separacion.toFixed(1)} u`);

  control("y de lejos sigue lejos: no es que no le diera tiempo a pegar, es que no llegó",
    lejos.separacion > ATTACK_RANGE_RATA,
    `${lejos.separacion.toFixed(1)} u al acabar`);

  // ── LA VIDA, CON LA REGENERACIÓN DESCONTADA ──────────────────────────────
  //
  // El 66: dos mecanismos mueven el mismo número. La regeneración del jugador
  // corre igual en las dos tandas y duran lo mismo, así que lo que las separa
  // es el mordisco. Comparar la vida contra cero habría dado verde con el
  // objeto muerto, que es literalmente el caso del 66.
  control("Y LA VIDA BAJA: cerca se pierde vida que lejos no se pierde",
    cerca.vida < lejos.vida,
    `cerca ${cerca.vida.toFixed(2)} · lejos ${lejos.vida.toFixed(2)}` +
    ` (la diferencia, ${(lejos.vida - cerca.vida).toFixed(2)}, es el mordisco)`);

  control("y el daño por golpe se parece a los 0,4 de su archivo",
    cerca.golpes > 0 && Math.abs((lejos.vida - cerca.vida) / cerca.golpes - 0.4) < 0.45,
    cerca.golpes > 0
      ? `${((lejos.vida - cerca.vida) / cerca.golpes).toFixed(2)} por golpe en ${cerca.golpes} golpes`
      : "sin golpes no se puede dividir");

  // El 30 % de acierto del archivo no se puede medir aquí sin contar los
  // intentos, y el probe no los expone: `golpesRecibidos` son impactos. La
  // tasa la miden las pruebas de Node, que leen `manada.sucesos`.
  pendiente("la tasa de acierto del 30 % en el navegador",
    "`golpesRecibidos` cuenta impactos y el probe no expone los intentos; " +
    "la tasa se mide en test/mordisco82.test.mjs sobre `manada.sucesos`");

  control("y la página no ha dado ni un error", errores.length === 0,
    errores.slice(0, 3).join(" · "));

  await pag.screenshot({ path: `${VISTAS}/mordisco82.png` });
} catch (e) {
  // LA CAÍDA ES UNA ROJA Y NO UNA NOTA AL PIE. El 65: un «X de Y» donde Y se
  // calcula al final no puede bajar nunca.
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
