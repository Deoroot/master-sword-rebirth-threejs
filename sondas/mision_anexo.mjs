// LA MISIÓN DEL ANEXO, de punta a punta: el tubo de las misiones NUESTRAS.
//
//   npm run sonda:mision_anexo
//
// Antes hay que compilar y hornear el mapa (contenido/LEEME.md):
//   npm run contenido -- gatecity_anexo
//   y los siete pasos de horneado con `--mapa gatecity_anexo`.
//
// Lo que se mide es si un guion escrito por nosotros hace una misión entera
// como la haría un jugador: entra por el menú, habla con el guarda con la F,
// acepta con el dígito, mata a la rata a espadazos, vuelve y cobra.
//
// Las dos piezas son `contenido/scripts/gatecity_anexo/warden.script` (el NPC)
// y `rat.script` (la rata, que le avisa al morir con `callexternal`, como los
// zombis del alcalde de Gate City). El estado va en el personaje (`quest set`).
//
// ── Lo que NO mide, dicho ───────────────────────────────────────────────────
//
//   - que matar a la rata SIN la misión aceptada no la adelante: sólo hay una
//     rata por partida y aquí se gasta en el camino bueno. La guarda del guion
//     (`if $get_quest_data(PARAM1,anexo_rat) == 1`) queda sin su control;
//   - Xash: estos guiones no se han cargado en el juego original.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5694;
const MAPA = "gatecity_anexo";
const MISION = "anexo_rat";
const PREMIO = "armor_plate";
/** Un botón que el panel trae SIEMPRE (de `monsters/base_chat`): si está, el panel se abrió. */
const ABIERTO = "Hail";

const liberados = liberarPuerto(PORT);
if (liberados) console.log(`  (puerto ${PORT} liberado: ${liberados})`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien, detalle }); return bien; };
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** El valor de la misión en el personaje, o `null` si no está puesta. */
const etapa = () => pag.evaluate((m) => {
  const q = window.probe.misiones.puestas().find((x) => x.startsWith(`${m}=`));
  return q ? q.slice(m.length + 1) : null;
}, MISION);
const bolsa = () => pag.evaluate(() => window.probe.misiones.bolsa());
const dicho = async () => (await pag.evaluate(() => window.probe.misiones.dicho()))
  .map((l) => String(l).replace(/^[a-z]+: /, "")).join(" ");

/** Se planta delante del guarda, a un metro, mirándole. */
const anteElGuarda = () => pag.evaluate(() => {
  const q = window.probe.vgui.npcs().find((i) => /gatecity_anexo\/warden/.test(i.script ?? ""));
  if (!q) return null;
  window.probe.mundo.poner(q.donde[0] - 1.0, q.donde[1], q.donde[2]);
  window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.9, q.donde[2]);
  return { id: q.id, nombre: q.nombre, script: q.script };
});

/** La F, y lo que sale: los botones del panel. */
async function hablar() {
  await pag.waitForFunction(() => window.probe.vgui.delante() !== null, null, { timeout: 15000 }).catch(() => {});
  await pag.keyboard.press("KeyF");
  await dormir(900);
  return pag.evaluate(() => window.probe.vgui.botones().map((b) => b.texto));
}
/** Elige un botón por su texto, con el dígito, que es como lo elige una persona. */
async function elegir(botones, texto) {
  const i = botones.findIndex((t) => String(t).includes(texto));
  if (i < 0) return false;
  await pag.keyboard.press(`Digit${i + 1}`);
  await dormir(600);
  return true;
}

try {
  await entrarPorElMenu(pag, PORT, { mapa: MAPA });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.sesion.estado() === "jugando", null, { timeout: 60000 }).catch(() => {});
  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú y el mapa es el anexo", mapa === MAPA, `mapa ${mapa}`);
  await dormir(1500);

  // ── 1. EL GUARDA, y la misión sin empezar ────────────────────────────────
  const guarda = await anteElGuarda();
  control("el guarda está en el mapa, con SU guion", guarda !== null && /warden/.test(guarda?.script ?? ""), JSON.stringify(guarda));
  const e0 = await etapa(), b0 = await bolsa();
  control("un personaje nuevo no trae la misión", e0 === null, `${MISION} = ${e0}`);
  control("ni el premio", !b0.objetos.some((o) => o.startsWith(PREMIO)), b0.objetos.join(" ") || "(mochila vacía)");

  const m1 = await hablar();
  console.log(`    F -> ${m1.map((t) => JSON.stringify(t)).join(" ")}`);
  control("el menú ofrece el trabajo", m1.some((t) => t.includes("Ask for work")), m1.join(" | "));
  control("y todavía no deja cobrar", m1.some((t) => t.includes(ABIERTO)) && !m1.some((t) => t.includes("Collect")), m1.join(" | "));
  await elegir(m1, "Ask for work");
  const e1 = await etapa();
  control("aceptar apunta la misión EN EL PERSONAJE", e1 === "1", `${MISION} = ${e1}`);
  control("y el guarda dice de qué va", /giant rat/.test(await dicho()), (await dicho()).slice(-100));
  // Lo que confundió en la primera partida: la plantilla ponía «Ask about Jobs»
  // al lado de «Ask for work», con la misma respuesta y sin apuntar nada.
  control("el menú no trae un segundo botón de trabajo que no apunta la misión",
    !m1.some((t) => t.includes("Ask about Jobs")), m1.join(" | "));
  // SIN Escape: elegir ya cierra el panel, y un Escape de más abre el menú del
  // juego, con lo que la F siguiente no abre nada. La primera pasada lo hacía, y
  // el último control —«cobrada, ya no ofrece nada»— salía VERDE con el panel
  // sin abrir: una lista vacía tampoco contiene «Collect». Por eso los dos
  // controles de «no ofrece» piden además que el panel esté abierto (`ABIERTO`).

  // Con la misión aceptada y la rata viva: recuerda, no paga.
  const m2 = await hablar();
  control("con la rata viva el menú recuerda y NO deja cobrar",
    m2.some((t) => t.includes("About that rat")) && !m2.some((t) => t.includes("Collect")), m2.join(" | "));
  await pag.keyboard.press("Escape");
  await dormir(300);

  // ── 2. LA RATA, a espadazos ──────────────────────────────────────────────
  // Con `golpe.atacar`, que corre el mismo `tic` que el jugador, y no con un
  // atajo que rehaga la muerte a mano (el 82).
  const rata0 = await pag.evaluate(() => window.probe.ia.bicho("gatecity_anexo/rat"));
  control("la rata de la misión está, viva y con SU guion", Boolean(rata0) && rata0.vida > 0 && !rata0.muerto,
    rata0 ? `${rata0.nombre}, vida ${rata0.vida}/${rata0.vidaMaxima}` : "no está");
  let golpes = 0, rata = rata0;
  while (rata && !rata.muerto && rata.vida > 0 && golpes < 40) {
    rata = await pag.evaluate(() => {
      const S = window.probe, r = S.ia.bicho("gatecity_anexo/rat");
      if (!r || r.muerto) return r;
      S.mundo.poner(r.donde[0] - 1.0, r.donde[1] + 0.1, r.donde[2]);
      S.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);
      S.golpe.atacar(1.2);
      return S.ia.bicho("gatecity_anexo/rat");
    });
    golpes++;
    await dormir(150);
  }
  control("la rata muere a espadazos", !rata || rata.muerto || rata.vida <= 0, `${golpes} golpes, vida ${rata?.vida}`);
  await dormir(1500);
  const e2 = await etapa();
  control("AL MORIR, la rata avisa al guarda y la misión avanza", e2 === "2", `${MISION} = ${e2}`);
  const sinces = await pag.evaluate((id) => window.probe.misiones.noSoportados(id), guarda?.id);
  console.log(`    lo que el guion del guarda no ha sabido hacer: ${JSON.stringify(sinces)}`);

  // ── 3. COBRAR ────────────────────────────────────────────────────────────
  await anteElGuarda();
  const m3 = await hablar();
  console.log(`    F -> ${m3.map((t) => JSON.stringify(t)).join(" ")}`);
  control("con la rata muerta el menú deja cobrar", m3.some((t) => t.includes("Collect your reward")), m3.join(" | "));
  await elegir(m3, "Collect your reward");
  await dormir(800);
  const e3 = await etapa(), b3 = await bolsa();
  control("cobrar cierra la misión", e3 === "3", `${MISION} = ${e3}`);
  control("y el premio está en el personaje",
    b3.objetos.some((o) => o.startsWith(PREMIO)) || Object.values(b3.manos).some((v) => String(v?.id ?? v).startsWith(PREMIO)),
    `${b3.objetos.join(" ")} · manos ${JSON.stringify(b3.manos)}`);

  // Y no se cobra dos veces.
  await anteElGuarda();
  const m4 = await hablar();
  control("cobrada, el menú SE ABRE y ya no ofrece ni el trabajo ni el premio",
    m4.some((t) => t.includes(ABIERTO)) && !m4.some((t) => t.includes("Collect") || t.includes("Ask for work")), m4.join(" | ") || "(el panel no se abrió)");

  const bien = controles.filter((c) => c.bien).length;
  console.log(`\n  CONTROLES`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(58)} ${c.detalle}`);
  console.log(`\n  ${bien} de ${controles.length} en verde`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);
  await nav.close();
  matar(dev);
  process.exit(bien === controles.length && errores.length === 0 ? 0 : 1);
} catch (e) {
  // UNA CAÍDA ES UNA ROJA, NO UNA NOTA AL PIE — la lección del 65.
  console.log(`\n  LA SONDA SE HA CAÍDO: ${e.message}`);
  console.log(`  llevaba ${controles.filter((c) => c.bien).length} de ${controles.length} controles corridos`);
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(58)} ${c.detalle}`);
  console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
  try { await nav.close(); } catch {}
  matar(dev);
  process.exit(1);
}
