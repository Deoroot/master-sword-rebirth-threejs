// EL 100: EL MANÁ DE UN ATAQUE, EL MODELO DE LO QUE VUELA Y LA BOLA DEL ORION BOW.
//
//   npm run sonda:armas100
//
// Lo que se mide, en Chromium y por `pasoDelBrazo` (lo que llama el bucle):
//
//   1. EL MANÁ. La sombra del Unholy Blade cuesta lo que dice SU ficha
//      (`reg.attack.mpdrain`, leído aquí de build/msr/armas.json y no de la
//      página) y el maná del personaje baja exactamente eso. Sin bastante, no
//      sale, el maná no se toca y la consola dice «You don't have enough MP»
//      (giattack.cpp:897-908).
//   2. EL MODELO. La sombra vuela colgada del conjunto de SU modelo
//      (`flechas:<clave de proj_ub>`), con una malla de otro tamaño que la
//      flecha de madera, y SE VE (los dos instrumentos de armas98/99). El
//      control positivo: el arco de partida tira con `flechas:weapons_bows_arrows`.
//   3. EL ORION BOW. Aguantar y soltar saca `proj_mana2`, que vuela, con el
//      modelo `aura_01` (submodelo 13), a escala 0,75 × tamaño, y cobra 4 de
//      maná por tamaño (bows_orion1.script:159). Sin maná, no carga y lo dice.
//
// Se entra por el menú (§3) con un personaje nuevo, habilidades a 60.

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5974;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT, { tope: 180_000 });
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("build/gatecity/vistas", { recursive: true });

// Lo que dice el HORNEADO, leído fuera de la página: el testigo independiente.
const CAT = JSON.parse(readFileSync("build/msr/armas.json", "utf8"));
const MP_SOMBRA = CAT.armas.find((a) => a.id === "swords_ub").ataques.find((x) => x.tipo === "charge-throw-projectile").mana;
const CLAVE_SOMBRA = CAT.flechas.find((f) => f.id === "proj_ub").clave;
const CLAVE_BOLA = CAT.bolas?.find((b) => b.id === "proj_mana2")?.clave ?? null;

// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 20;
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
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await pag.evaluate(() => {
    const h = window.probe.sesion.personaje.habilidades;
    for (const n of ["swordsmanship", "polearms", "archery"]) {
      h[n] ??= {};
      for (const k of ["proficiency", "balance", "power"]) { h[n][k] ??= {}; h[n][k].valor = 60; }
    }
    h.spellcasting ??= {};
    for (const k of ["fire", "ice", "lightning", "affliction"]) { h.spellcasting[k] ??= {}; h.spellcasting[k].valor = 60; }
  });

  /** Las líneas de la consola de sucesos que contienen `texto`. */
  const lineas = (texto) => pag.evaluate((texto) =>
    (window.probe.hud.estado()?.consola?.lineas ?? []).filter((l) => String(l.texto).includes(texto)).length, texto);

  /**
   * Tira en dieciséis rumbos hasta que uno vuela 120 u sin chocar, y lo detiene
   * ahí. Antes de CADA intento el maná se pone en `mana`, y se devuelve el maná
   * de después del intento bueno: cada intento cuesta.
   */
  const tirarYDetener = (segundos, opciones, mana) => pag.evaluate(({ segundos, opciones, mana }) => {
    let alto = null, despues = null;
    for (let k = 0; k < 16 && !alto?.volando; k++) {
      const d = window.probe.mundo.donde();
      const a = (k * Math.PI) / 8;
      window.probe.mundo.mirar(d.ojo[0] + 40 * Math.cos(a), d.ojo[1], d.ojo[2] + 40 * Math.sin(a));
      window.probe.sesion.personaje.mana = mana;
      alto = window.probe.arco.soltarYDetener(segundos, 120, opciones);
      despues = window.probe.sesion.personaje.mana;
      if (!alto) break;
    }
    return alto ? { ...alto, manaDespues: despues } : { nada: true, manaDespues: despues };
  }, { segundos, opciones, mana });

  const foto = async (nombre) => {
    await esperar(150);
    const ruta = `build/gatecity/vistas/armas100-${nombre}.png`;
    await pag.screenshot({ path: ruta });
    return leerPng(ruta);
  };

  /** Los dos instrumentos de armas98/99: el grafo que se pinta y los píxeles. */
  async function seDibuja(etiqueta) {
    await pag.evaluate(() => window.probe.vista.esconder("arma", true));
    await esperar(300);
    const rect = await pag.evaluate(() => window.probe.arco.rectanguloFlecha());
    const dibujos = await pag.evaluate(() => window.probe.arco.dibujosDeFlecha(3));
    await pag.evaluate(() => window.probe.arco.esconderFlecha(true));
    const dibujosEscondida = await pag.evaluate(() => window.probe.arco.dibujosDeFlecha(3));
    await pag.evaluate(() => window.probe.arco.esconderFlecha(false));
    let m = null;
    if (rect && rect.vertices > 0) {
      const v = {
        x0: Math.max(0, Math.floor(rect.x0) - 2), y0: Math.max(0, Math.floor(rect.y0) - 2),
        x1: Math.min(rect.ancho, Math.ceil(rect.x1) + 2), y1: Math.min(rect.alto, Math.ceil(rect.y1) + 2),
      };
      const w = v.x1 - v.x0, h = v.y1 - v.y0;
      const marco = { x0: v.x0 - w, y0: v.y0 - h, x1: v.x1 + w, y1: v.y1 + h };
      const con1 = await foto(`${etiqueta}-con`);
      await pag.evaluate(() => window.probe.arco.esconderFlecha(true));
      const sin = await foto(`${etiqueta}-sin`);
      await pag.evaluate(() => window.probe.arco.esconderFlecha(false));
      const con2 = await foto(`${etiqueta}-con2`);
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
    await pag.evaluate(() => window.probe.vista.esconder("arma", false));
    console.log(`  ${etiqueta}: ventana ${rect ? `${(rect.x1 - rect.x0).toFixed(0)}×${(rect.y1 - rect.y0).toFixed(0)} px, ${rect.vertices} vértices` : "—"}; ` +
      `onBeforeRender ${dibujos} a la vista y ${dibujosEscondida} escondida; píxeles ${m ? `${pct(m.dentro)} dentro, ${pct(m.fuera)} en el marco` : "—"}`);
    control(`${etiqueta}: Three la DIBUJA (\`onBeforeRender\` en cada cuadro) y escondida lee 0`,
      dibujos >= 3 && dibujosEscondida === 0, `${dibujos} en 3 cuadros, ${dibujosEscondida} escondida`);
    control(`${etiqueta}: SE VE — al esconder su nodo se apaga y vuelve > 5 % de su ventana, y en el marco < 0,5 %`,
      Boolean(m) && m.dentro > 0.05 && Number.isFinite(m.fuera) && m.fuera < 0.005 && m.fuera < m.dentro / 10,
      m ? `${pct(m.dentro)} dentro, ${pct(m.fuera)} fuera, ventana ${pct(m.area)}` : "sin vértices en pantalla");
  }

  // ── 1. EL MANÁ, CON LA SOMBRA DEL UNHOLY BLADE ─────────────────────────
  const ub = await pag.evaluate(() => window.probe.arco.empunar("swords_ub"));
  control("swords_ub en la mano, con conjuntos montados", ub.id === "swords_ub" && ub.conjunto > 0, `${ub.id}, ${ub.conjunto} nodos`);
  const sombra = await tirarYDetener(2.6, { cargado: true }, 100);
  console.log(`\n  sombra: ${JSON.stringify(sombra)}`);
  control("la sombra SALE con 100 de maná y vuela 120 u", sombra.id === "proj_ub" && sombra.volando && sombra.recorrido >= 120,
    sombra.nada ? "no salió nada" : `${sombra.id}, ${sombra.recorrido?.toFixed(0)} u`);
  control(`EL MANÁ BAJA lo de su ficha: 100 − ${MP_SOMBRA} (build/msr/armas.json, leído fuera de la página)`,
    MP_SOMBRA > 0 && sombra.manaDespues === 100 - MP_SOMBRA, `quedan ${sombra.manaDespues}`);

  // ── 2. EL MODELO DE LA SOMBRA ──────────────────────────────────────────
  control(`la sombra cuelga del conjunto de SU modelo (\`flechas:${CLAVE_SOMBRA}\`)`,
    sombra.grupo === `flechas:${CLAVE_SOMBRA}`, `${sombra.grupo}`);
  const t0s = Date.now();
  await seDibuja("sombra");
  console.log(`  fotografiar la sombra llevó ${((Date.now() - t0s) / 1000).toFixed(1)} s de reloj`);

  // Sin bastante maná: no sale, no se cobra, y la consola lo dice.
  const avisosAntes = await lineas("You don't have enough MP");
  const pobre = await tirarYDetener(2.6, { cargado: true }, MP_SOMBRA - 1);
  const avisosDespues = await lineas("You don't have enough MP");
  control(`con ${MP_SOMBRA - 1} de maná la sombra NO sale y el maná se queda (giattack.cpp:897-908)`,
    pobre.nada === true && pobre.manaDespues === MP_SOMBRA - 1, JSON.stringify(pobre));
  control("y la consola dice «You don't have enough MP» (una línea más que antes)",
    avisosDespues > avisosAntes, `${avisosAntes} → ${avisosDespues}`);

  // ── CONTROL POSITIVO DEL MODELO: el arco de partida tira con la flecha ──
  await pag.evaluate(() => window.probe.arco.empunar("bows_treebow"));
  const flecha = await tirarYDetener(1.3, {}, 0);
  console.log(`\n  flecha de partida: ${JSON.stringify(flecha)}`);
  control("control — el arco de partida tira la flecha gratis con `flechas:weapons_bows_arrows`",
    flecha.id === "proj_arrow_generic" && flecha.grupo === "flechas:weapons_bows_arrows", `${flecha.id}, ${flecha.grupo}`);
  control("control — sin coste de maná, con 0 de maná el arco tira y el maná sigue en 0", flecha.manaDespues === 0, `${flecha.manaDespues}`);
  control("la malla de la sombra NO es la de la flecha (vértices distintos)",
    Number.isFinite(sombra.vertices) && Number.isFinite(flecha.vertices) && sombra.vertices !== flecha.vertices,
    `sombra ${sombra.vertices}, flecha ${flecha.vertices}`);

  // ── 3. EL ORION BOW ────────────────────────────────────────────────────
  const orion = await pag.evaluate(() => window.probe.arco.empunar("bows_orion1"));
  control("bows_orion1 en la mano: ningún ataque del motor y un conjunto montado", orion.ataques === 0 && orion.conjunto > 0,
    `${orion.ataques} ataques, ${orion.conjunto} nodos`);
  await esperar(1500);   // `game_deploy`: un segundo antes de poder cargar (bows_orion1.script:76-79)
  const bola = await tirarYDetener(1.0, {}, 100);
  console.log(`\n  bola: ${JSON.stringify(bola)}`);
  control("aguantar 1 s y soltar saca `proj_mana2`, que VUELA 120 u", bola.id === "proj_mana2" && bola.volando && bola.recorrido >= 120,
    bola.nada ? "no salió nada" : `${bola.id}, ${bola.recorrido?.toFixed(0)} u`);
  control("la bola tiene tamaño y 10 de daño por tamaño (DMG_MULTI, :27)",
    bola.bola?.tamano >= 1 && bola.bola.dano === bola.bola.tamano * 10, JSON.stringify(bola.bola));
  control("EL MANÁ BAJA 4 POR TAMAÑO (`givemp $neg(MP_DRAIN)`, :159)",
    bola.bola?.tamano >= 1 && bola.manaDespues === 100 - 4 * bola.bola.tamano, `tamaño ${bola.bola?.tamano}, quedan ${bola.manaDespues}`);
  control(`la bola cuelga del conjunto de SU modelo (\`flechas:${CLAVE_BOLA}\`, aura_01) a escala 0,75 × tamaño`,
    CLAVE_BOLA && bola.grupo === `flechas:${CLAVE_BOLA}` && Math.abs(bola.escala - 0.75 * (bola.bola?.tamano ?? 0)) < 1e-9,
    `${bola.grupo}, escala ${bola.escala}`);
  const t0 = Date.now();
  await seDibuja("bola");
  console.log(`  fotografiar la bola llevó ${((Date.now() - t0) / 1000).toFixed(1)} s de reloj (la bola vive 10)`);
  const rastro = await pag.evaluate(() => {
    const b = window.probe.arco.deGuion()?.bolas?.at(-1);
    return b ? { tamano: b.tamano, golpes: b.golpes.map((g) => ({ t: +g.t.toFixed(2), radio: g.radio, tocados: g.golpeados.map((x) => x.nombre) })) } : null;
  });
  console.log(`  la bola, después de fotografiarla: ${JSON.stringify(rastro)}`);

  // Sin maná: no empieza a cargar y lo dice (:88, :106).
  const sinAntes = await lineas("You lack the mana to start charging a mana ball.");
  const sinMana = await tirarYDetener(1.0, {}, 4);
  const sinDespues = await lineas("You lack the mana to start charging a mana ball.");
  control("con 4 de maná el Orion Bow no tira nada, no cobra y lo dice",
    sinMana.nada === true && sinMana.manaDespues === 4 && sinDespues > sinAntes,
    `${JSON.stringify(sinMana)}, avisos ${sinAntes} → ${sinDespues}`);

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
