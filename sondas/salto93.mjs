// EL SALTO DE LA ARAÑA DEL 93, JUGANDO: la de Gate City te salta encima y te envenena.
//
//   node sondas/salto93.mjs
//
// En Master Sword la «Leaping Cave Spider» (`monsters/spider`) NO envenena al
// morder (eso lo midió el 92): su veneno es el SALTO. Un `repeatdelay 4` con
// un 20 % (spider.script:93-117) pone `jumpmiss`; el fotograma 22 de ese
// `jumpmiss` llama a `frame_jump` (evento 600 del modelo), que la lanza con
// `setvelocity ent_me $relvel(0,320,120)` (:118-125); al llegar a menos de
// 70 de ti `spider_latch_hit` se te pega (`setfollow … align_bottom`) y te pone
// `effects/effect_spiderlatch`, que pone `dot_poison` (:143-157); a los 4 s se
// suelta (`falloff`) y al acabar esa animación vuelve a cazar (:164-192).
//
// Se entra POR EL MENÚ (CLAUDE.md §3) en Gate City. Lo que se lee es lo que
// ha corrido en el GUION de la araña (su rastro, sus variables) y lo que el
// jugador ve en la consola, no lo que la manada cree haber mandado.
//
// Control negativo: una cría (`monsters/spider_mini`) no salta, con el mismo
// instrumento que sí ve saltar a la grande.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5493;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const errores = [];
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };

try {
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
  await entrarPorElMenu(pag, PORT, { mapa: "gatecity" });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 });
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú en gatecity", mapa === "gatecity", `mapa ${mapa}`);

  const de = (guion, n) => pag.evaluate(({ guion, n }) => window.probe.costura.de(guion, n), { guion, n });
  const dicho = () => pag.evaluate(() => (window.probe.misiones.dicho?.() ?? []).map((l) => (typeof l === "string" ? l : l.texto ?? JSON.stringify(l))));
  /** Al lado del bicho, mirándolo. `poner` no resuelve colisiones (el 69); TRES números a `mirar` (el 78). */
  // EL 94: en un sitio desde el que el bicho te VE (`sitioALaVista`); antes
  // era siempre `d` metros hacia −X, que en la cueva es a menudo pared adentro.
  // Si no hay ninguno, el sitio de antes.
  const plantarse = (c, d) => pag.evaluate(({ p, d, id }) => {
    const s = window.probe.costura.sitioALaVista(id, d);
    if (s) window.probe.mundo.poner(s[0], s[1] + 0.05, s[2]);
    else window.probe.mundo.poner(p[0] - d, p[1] + 0.1, p[2]);
    window.probe.mundo.mirar(p[0], p[1] + 0.2, p[2]);
    return Boolean(s);
  }, { p: c.donde, d, id: c.id });

  /** El primero de ese guion (por nombre EXACTO) fuera y vivo. */
  async function despierto(guion, segundos) {
    for (let t = 0; t < segundos * 2; t++) {
      for (let n = 0; n < 8; n++) {
        const c = await de(guion, n);
        if (!c) break;
        if (!c.dormido && c.vivo && c.conGuion) return n;
      }
      await pag.waitForTimeout(500);
    }
    return -1;
  }

  // ── 1. LA ARAÑA GRANDE ────────────────────────────────────────────────────
  const ARANA = "monsters/spider";
  const n = await despierto(ARANA, 40);
  control("hay una «Leaping Cave Spider» fuera, con guion", n >= 0, `índice ${n}`);
  if (n < 0) throw new Error("sin araña de Gate City no hay medida");
  const c0 = await de(ARANA, n);
  control("sus `repeatdelay` están ARMADOS y el bucle de caza viejo, CERRADO (`hunting_mode_go`)",
    (c0.repeticiones?.armadas ?? 0) >= 2 && (c0.cerrados?.hunting_mode_go ?? 0) >= 1,
    JSON.stringify({ rep: c0.repeticiones, cerrados: c0.cerrados?.hunting_mode_go }));

  // Pegada a ella hasta que se suelte y vuelva a cazar. Se recoloca MIENTRAS
  // NO está agarrada (un bicho que corre se va, el 82); agarrada, la que se
  // mueve es ella. Y la vida a tope en cada vuelta: ver `probe.costura.curar`.
  let c = c0, t = 0;
  let vioEnvenenado = false, vioFirma = false, baseDrop = 0, baseReset = 0;
  // En qué estado la encontró cada vuelta: si no salta, dice qué condición de
  // spider.script:96-103 no se cumplía.
  const estados = {};
  let sinCazaDesde = null, sinSitio = 0;
  let vioAmago = false, vioPegada = false, distPegada = null, mordiscosAlPegarse = null, mordiscosAlSoltarse = null;
  const heridasAntes = await pag.evaluate(() => window.probe.veneno.heridas().length);
  while (t < 150000) {
    await pag.evaluate(() => window.probe.costura.curar());
    c = await de(ARANA, n);
    if (!c?.vivo) break;
    if (c.anim === "jumpmiss") vioAmago = true;
    {
      const v = c.vars ?? {};
      const k = `caza=${v.IS_HUNTING ?? "-"} ataca=${v.IS_ATTACKING ?? "-"} blanco=${v.HUNT_LASTTARGET ?? "-"} anim=${c.anim}`;
      estados[k] = (estados[k] ?? 0) + 1;
    }
    if (c.fisica?.sigue && !vioPegada) {
      vioPegada = true;
      // EL 94: lo que ya había AL PEGARSE. Un salto fallido también corre
      // `spider_latch_drop` y `spider_latch_resetmovement`, así que con dos
      // saltos —el primero fallido— el contador ya estaba a 1 y el bucle
      // cortaba en el instante de pegarse (el 67: un contador acumulado no
      // dice «ha pasado DESPUÉS»).
      baseDrop = c.rastro?.spider_latch_drop ?? 0;
      baseReset = c.rastro?.spider_latch_resetmovement ?? 0;
      mordiscosAlPegarse = c.recibidos?.frame_bite1 ?? 0;
    }
    // EL 94: la distancia se lee MIENTRAS va pegada, y la de los dos en el
    // MISMO `evaluate` (la araña de un `evaluate` y tus pies de otro son dos
    // instantes); se queda la menor. Leída una sola vez, en la primera vuelta
    // con `sigue`, salió 1,87 m en una pasada de seis: el instante del agarre.
    if (c.fisica?.sigue) {
      const par = await pag.evaluate(({ guion, n }) => {
        const a = window.probe.costura.de(guion, n);
        return { pies: window.probe.mundo.donde()?.pies ?? null, donde: a?.donde ?? null, sigue: Boolean(a?.fisica?.sigue) };
      }, { guion: ARANA, n });
      if (par.pies && par.donde && par.sigue) {
        const dd = Math.hypot(par.pies[0] - par.donde[0], par.pies[2] - par.donde[2]);
        distPegada = distPegada === null ? dd : Math.min(distPegada, dd);
      }
    }
    // EL 94: el aviso se lee MIENTRAS, no al final. La consola es un anillo de
    // tamaño fijo y una araña que te muerde muchas veces empuja fuera la
    // primera línea: una pasada de cuatro decía «no te envenena» con ocho
    // heridas de veneno en la lista (el 81: la unidad de lectura equivocada).
    if (vioPegada && (!vioEnvenenado || !vioFirma)) {
      const ls = await dicho();
      vioEnvenenado ||= ls.some((l) => /You have been poisoned!/.test(l));
      vioFirma ||= ls.some((l) => /Leaping Cave Spider hits you: \d+\.\d poison damage\./.test(l));
    }
    if (vioPegada && mordiscosAlSoltarse === null && (c.rastro?.spider_latch_drop ?? 0) > baseDrop) mordiscosAlSoltarse = c.recibidos?.frame_bite1 ?? 0;
    if (vioPegada && (c.rastro?.spider_latch_resetmovement ?? 0) > baseReset) break;
    // EL 94: SÓLO si se ha alejado. Recolocar en cada vuelta te dejaba en el
    // aire —`poner` te suelta 10 cm por encima— casi siempre, y el salto pide
    // `$get(HUNT_LASTTARGET,onground)` (spider.script:103): media de las pasadas
    // eran «la araña no salta en 150 s» con el juego bien. El instrumento le
    // quitaba al bicho la condición que venía a medir (el 69).
    //
    //
    // Y a TRES METROS, no a 0,9, y otra vez en cuanto llega a morder: saltar
    // es lo que hace al ACERCARSE, y tres metros son 118 u, dentro de
    // `SPIDER_LATCH_MAXRANGE 200` (:78). La razón que se escribió primero
    // —que mordiendo `!IS_ATTACKING` (:98) la bloqueaba— ERA FALSA: ningún
    // guion del mod escribe `IS_ATTACKING`, sólo lo leen siete, así que en
    // Master Sword la condición se cumple siempre. Lo enseñó el contador de
    // `estados` de abajo, no pensar mejor. Y con esto la pasada sin salto
    // siguió saliendo: ver doc/VELO_94.md, «salto93».
    if (!c.fisica?.manda) {
      const p = (await pag.evaluate(() => window.probe.mundo.donde()))?.pies ?? null;
      const d = p && c.donde ? Math.hypot(p[0] - c.donde[0], p[2] - c.donde[2]) : Infinity;
      // Y si ha dejado de cazar —te ha perdido de vista—, cada dos segundos,
      // aunque estés cerca: sin verte la IA no te vuelve a fijar.
      const sinCaza = c.vars?.IS_HUNTING !== "1";
      if (sinCaza) sinCazaDesde ??= t; else sinCazaDesde = null;
      const perdida = sinCaza && t - sinCazaDesde >= 2000;
      if (d > 4.5 || d < 1.0 || perdida) {
        if (!(await plantarse(c, 2.0))) sinSitio++;
        if (perdida) sinCazaDesde = t;
      }
    }
    await pag.waitForTimeout(250); t += 250;
  }
  const lineas = await dicho();
  const heridas = (await pag.evaluate(() => window.probe.veneno.heridas())).slice(heridasAntes);
  console.log(`  araña: ${(t / 1000).toFixed(1)} s, rastro ${JSON.stringify(c?.rastro)}, vars ${JSON.stringify(c?.vars)}, fisica ${JSON.stringify(c?.fisica)}`);
  console.log(`  recolocaciones sin sitio a la vista: ${sinSitio}`);
  console.log(`  estados: ${Object.entries(estados).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${n}× ${k}`).join(" | ")}`);
  console.log(`  heridas: ${JSON.stringify(heridas.map((h) => [Number(h.t).toFixed(2), h.dano, h.tipo, h.de]))}`);
  control("SALTA: el modelo dispara `frame_jump` (evento 600 del fotograma 22 de `jumpmiss`)",
    (c?.rastro?.frame_jump ?? 0) >= 1 && vioAmago, `frame_jump ${c?.rastro?.frame_jump ?? 0}, amago visto ${vioAmago}`);
  control("el guion la lanza (`setvelocity ent_me $relvel(0,320,120)`): la manada cuenta un salto",
    (c?.fisica?.saltos ?? 0) >= 1, `saltos ${c?.fisica?.saltos}`);
  control("SE TE PEGA: `spider_latch_hit` corre y el cuerpo va con `setfollow` a tus pies",
    (c?.rastro?.spider_latch_hit ?? 0) >= 1 && vioPegada && distPegada !== null && distPegada < 0.3,
    `latch_hit ${c?.rastro?.spider_latch_hit ?? 0}, a ${distPegada?.toFixed(2)} m de tus pies`);
  control("TE ENVENENA: «You have been poisoned!» en la consola",
    vioEnvenenado || lineas.some((l) => /You have been poisoned!/.test(l)), lineas.slice(-6).join(" / "));
  control("el veneno lo firma ella: «Leaping Cave Spider hits you: … poison damage.»",
    vioFirma || lineas.some((l) => /Leaping Cave Spider hits you: \d+\.\d poison damage\./.test(l)),
    lineas.filter((l) => /hits you/.test(l)).slice(-3).join(" / "));
  control("y hace daño de verdad: heridas de `poison_effect` con la araña de atacante (`SPIDER_LATCH_ATKDMG 5`)",
    heridas.some((h) => h.tipo === "poison_effect" && h.de === "Leaping Cave Spider" && h.dano === 5),
    `${heridas.length} heridas`);
  control("AGARRADA NO MUERDE: `CAN_ATTACK 0` (spider.script:112) y la IA lo respeta",
    mordiscosAlPegarse !== null && mordiscosAlSoltarse !== null && mordiscosAlSoltarse === mordiscosAlPegarse,
    `frame_bite1 al pegarse ${mordiscosAlPegarse}, al soltarse ${mordiscosAlSoltarse}`);
  control("SE SUELTA a los 4 s y vuelve a cazar: `frame_falloffend` -> `spider_latch_resetmovement`, `CAN_HUNT 1`",
    (c?.rastro?.frame_falloffend ?? 0) >= 1 && (c?.rastro?.spider_latch_resetmovement ?? 0) >= 1 && c?.vars?.CAN_HUNT === "1" && c?.fisica?.manda === false,
    JSON.stringify({ rastro: c?.rastro, CAN_HUNT: c?.vars?.CAN_HUNT, manda: c?.fisica?.manda }));

  // ── 2. CONTROL NEGATIVO: LA CRÍA NO SALTA ────────────────────────────────
  // El mismo instrumento —`fisica.saltos` y el rastro— que acaba de ver saltar
  // a la grande. `spider_mini.script` no tiene el bloque del salto.
  const CRIA = "monsters/spider_mini";
  const m = await despierto(CRIA, 30);
  control("hay una cría fuera, con guion", m >= 0, `índice ${m}`);
  if (m >= 0) {
    let k = await de(CRIA, m), tt = 0, sinCazaK = null;
    const estadosK = {};
    while (tt < 25000) {
      await pag.evaluate(() => window.probe.costura.curar());
      k = await de(CRIA, m);
      if (!k?.vivo) break;
      // Lo mismo que con la grande: sólo si se ha alejado, en un sitio desde
      // el que te ve, y otra vez si lleva dos segundos sin cazar (sin verte
      // la IA no te vuelve a fijar, ia.js:259-263). 0,8 m: su `ATTACK_RANGE`
      // es 50 u (spider_mini.script:21), 1,27 m.
      const p = (await pag.evaluate(() => window.probe.mundo.donde()))?.pies ?? null;
      const d = p && k.donde ? Math.hypot(p[0] - k.donde[0], p[2] - k.donde[2]) : Infinity;
      const dy = p && k.donde ? p[1] - k.donde[1] : NaN;
      const ek = `caza=${k.vars?.IS_HUNTING ?? "-"} anim=${k.anim} d=${d.toFixed(1)} dy=${dy.toFixed(1)}`;
      estadosK[ek] = (estadosK[ek] ?? 0) + 1;
      const sinCaza = k.vars?.IS_HUNTING !== "1";
      if (sinCaza) sinCazaK ??= tt; else sinCazaK = null;
      const perdida = sinCaza && tt - sinCazaK >= 2000;
      if (d > 1.2 || perdida) { await plantarse(k, 0.8); if (perdida) sinCazaK = tt; }
      await pag.waitForTimeout(250); tt += 250;
    }
    console.log(`  cría: ${(tt / 1000).toFixed(1)} s, recibidos ${JSON.stringify(k?.recibidos)}, fisica ${JSON.stringify(k?.fisica)}`);
    console.log(`  cría, estados: ${Object.entries(estadosK).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, v]) => `${v}× ${s}`).join(" | ")}`);
    control("la cría pelea (control: estaba cazando y mordiendo, no dormida)",
      (k?.recibidos?.bite1 ?? 0) + (k?.recibidos?.frame_bite1 ?? 0) >= 1, JSON.stringify(k?.recibidos));
    control("CONTROL NEGATIVO: la cría NO salta ni se pega",
      (k?.fisica?.saltos ?? 0) === 0 && !k?.fisica?.sigue && Object.keys(k?.rastro ?? {}).length === 0,
      JSON.stringify({ saltos: k?.fisica?.saltos, rastro: k?.rastro }));
  }

  control("ni un error de página en toda la pasada", errores.length === 0, errores.slice(0, 2).join(" | ") || "ninguno");
} catch (e) {
  // LA CAÍDA ES UNA ROJA, no una nota al pie (el 65).
  control("LA SONDA HA LLEGADO AL FINAL", false, String(e).slice(0, 300));
} finally {
  const verdes = controles.filter((x) => x.bien === true).length;
  const rojas = controles.filter((x) => x.bien === false);
  console.log("\n  ──────────────────────────────────────────────");
  for (const x of controles) console.log(`  [${x.bien ? " ok " : "ROJA"}] ${x.que}${x.detalle ? `  — ${x.detalle}` : ""}`);
  console.log(`\n  ${verdes} de ${verdes + rojas.length} controles en verde`);
  await nav.close();
  matar(dev);
  process.exit(rojas.length ? 1 : 0);
}
