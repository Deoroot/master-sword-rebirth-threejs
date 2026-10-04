// LOS PENDIENTES DE ARMAS DEL 96 — experimento 97, parte H.
//
//   npm run sonda:armas97
//
// Dos partes, y las dos entran POR EL MENÚ (CLAUDE.md §3):
//
// A. UN JUGADOR (Gate City):
//    1. la BALLESTA dispara una saeta instantánea (`hitscan_bolt`,
//       proj_base.script:180-249): el daño entra EN la misma llamada que suelta
//       el gatillo, sin un solo paso de vuelo. Control positivo: la flecha del
//       arco de árbol, en el mismo sitio, necesita volar.
//    2. la FLECHA DE ESCARCHA sale con su dado de 60-100 (la comilla simple de
//       `const PROJ_DAMAGE '$rand(60,100)'`). Control positivo: sin escarcha, la
//       gratis tira 30-60.
//    3. los GUANTELETES de hierro (Venom Claws) se borran al soltarlos. Control
//       positivo: la Novablade, soltada igual, se queda en el suelo.
//    4. LA NOVABLADE Y EL CAMPO DE VISIÓN: se mide en ángulo (tangentes desde
//       el ojo) y se dice qué fracción de la pantalla ocuparía con el FOV del
//       motor y con el de aquí, y la de la espada larga, que es el MISMO archivo.
//
// B. CON SERVIDOR (dos Chrome contra `tools/servidor.mjs`, en Edana):
//    5. el arma de Ana SE VE en la pantalla de Beto (píxeles con/sin/con en una
//       ventana alrededor de SU malla, como el 96 hizo con la de la mano).
//    6. Ana la suelta con la `c` y Beto deja de verla: eso sólo pasa si la `c`
//       llega al servidor (`MENSAJE.SOLTAR`).
//
// EL ATAJO, DICHO: las armas y las flechas entran en la mochila con
// `probe.misiones.dar` (como en el 96: en Gate City nadie las vende). Empuñar es
// por el ciclador (tecla 1 + clic), tirar por `probe.arco.tirar` (el
// `pasoDelBrazo` del bucle) y soltar por `probe.mundo.soltar` (la `c`).

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, rmSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PUERTO_WEB = 5975;
const PUERTO_PARTIDA = 5976;
const MAPA_RED = "edana";
/** Al lado de Sylphiel, como la sonda del 95 (doc/RED_95.md §4). */
const NACER = "7.98,-4.4,2.37";
const PASO = [8.98, -0.43];
const PERSONAJES = "build/partidas/sonda97h/personajes";
try { rmSync("build/partidas/sonda97h", { recursive: true, force: true }); } catch {}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("build/gatecity/vistas", { recursive: true });

// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 22;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const medidas = [];
const errores = [];
let partida = null;
const salida = [];

// Vite tarda lo que tarde (con la máquina ocupada, más de 7 s: la primera
// pasada llamó a la puerta antes de que abriera). Se le pregunta.
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: `vite en el ${PUERTO_WEB}` });
const nav = await chromium.launch();

/** Cicla con la tecla 1 hasta que se ofrezca `id` y acepta (copiado del 96). */
async function empunarPorElCiclador(pag, id) {
  if (!(await pag.evaluate(() => Boolean(document.pointerLockElement)))) {
    await pag.mouse.click(600, 400);
    await pag.waitForTimeout(200);
  }
  const conPuntero = await pag.evaluate(() => Boolean(document.pointerLockElement));
  let ofrecida = null;
  for (let k = 0; k < 10 && ofrecida !== id; k++) {
    if (conPuntero) { await pag.keyboard.press("Digit1"); await pag.waitForTimeout(60); }
    else await pag.evaluate(() => window.probe.ranuras.ciclar("weapon"));
    ofrecida = await pag.evaluate(() => window.probe.ranuras.estado().etiqueta?.id ?? null);
  }
  if (ofrecida !== id) return false;
  if (conPuntero) { await pag.mouse.down(); await pag.waitForTimeout(50); await pag.mouse.up(); }
  else await pag.evaluate(() => window.probe.ranuras.confirmar());
  await pag.waitForFunction((i) => window.probe.golpe.estado.arma === i, id, { timeout: 60000 }).catch(() => {});
  await pag.waitForTimeout(1500);
  return (await pag.evaluate(() => window.probe.golpe.estado.arma)) === id;
}

/**
 * Busca un hostil a la vista a `d` metros y le tira: todo en UNA llamada (el
 * goblin se mueve entre dos `evaluate`). Devuelve lo que dice `probe.arco.tirar`,
 * la vida de la víctima antes y después, y lo que apuntó el guion de la saeta.
 */
async function tiroA(pag, d, { segundos = 0.3, espera = 3, exigeAcierto = false } = {}) {
  return pag.evaluate(({ d, segundos, espera, exigeAcierto }) => {
    let ultimo = null;
    // EL 98: los tiros que dieron en carne AJENA, para poder decir en quién.
    const enOtro = [];
    const h = window.probe.ia.censo().lista.filter((b) => b.hostil);
    for (let n = 0; n < h.length; n++) {
      const v0 = window.probe.golpe.victima(n);
      if (!v0 || v0.muerto) continue;
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4;
        const p = window.probe.ia.irA(n, d, a);
        if (!p) continue;
        window.probe.mundo.mirar(p[0], p[1] + 0.8, p[2]);
        const ojo = window.probe.player.eye;
        const centro = [p[0], p[1] + 0.8, p[2]];
        // Sólo si el mundo no tapa: si no, se mide la pared (el 80).
        if (window.probe.arco.libre(ojo, centro) === false) continue;
        const antes = window.probe.golpe.victima(n).vida;
        const saetas = window.probe.arco.deGuion().saetas.length;
        const r = window.probe.arco.tirar(segundos, { espera });
        const despues = window.probe.golpe.victima(n);
        const s = window.probe.arco.deGuion().saetas.slice(saetas);
        ultimo = { n, a, nombre: v0.nombre, antes, despues: despues.vida, muerto: despues.muerto, r, saeta: s[0] ?? null };
        // Una flecha de arco sale 9° a la izquierda (`aimang`, el 23) y puede
        // dar en la pared de al lado: si se pide acierto, se prueba otro rumbo.
        //
        // EL 98: Y EL ACIERTO TIENE QUE SER **A LA DISTANCIA QUE SE DICE**.
        // `r.acerto` dice que la flecha dio en carne, no en cuál ni dónde: el 98
        // leyó «acertó true» con 75 u de recorrido y 0,083 s de vuelo tirando a
        // 8 m (315 u), o sea que dio en otro bicho a dos metros del jugador, y
        // el control «a 8 m acierta VOLANDO» salió rojo midiendo un tiro de
        // dos metros. Entre dos `evaluate` el mundo corre en tiempo real, y lo
        // que se cruza depende de lo que tarde la sonda entre llamadas: 21/22
        // en tanda y 22/22 suelta. Ahora el acierto cuenta si la flecha voló
        // al menos la mitad de `d`; lo que se descarta se apunta en `enOtro`.
        //
        // (Se probó antes a pedir que bajara la vida de la víctima `n` y
        // descartó 12 de 12 aciertos en una pasada, varios contra el nombre de
        // la víctima: la vida no es la marca de «le dio a éste». No se sabe si
        // por esquivas o por otra cosa; no se ha medido y no se usa.)
        const lejosDeVerdad = (r.recorrido ?? 0) >= 0.5 * d * window.probe.level.unitsPerMetre;
        if (exigeAcierto && r.acerto && !lejosDeVerdad) enOtro.push({ recorrido: Math.round(r.recorrido ?? -1), vuelo: +r.vuelo.toFixed(3), contra: r.contra });
        if (exigeAcierto && !(r.acerto && lejosDeVerdad)) continue;
        return { ...ultimo, enOtro };
      }
    }
    return ultimo && { ...ultimo, enOtro };
  }, { d, segundos, espera, exigeAcierto });
}

// `SOLO=B npm run sonda:armas97` corre sólo la parte con servidor, para las
// roturas deliberadas de la red (el marcador sale corto y la sonda en rojo: es a
// propósito, lo que se mira es el control roto).
const SOLO = process.env.SOLO ?? null;

// ═══ A. UN JUGADOR ═══════════════════════════════════════════════════════
if (SOLO !== "B") try {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(`solo: ${String(e.stack ?? e).slice(0, 600)}`));
  await entrarPorElMenu(pag, PUERTO_WEB);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  // Sin arma de partida en la mano (el doble del 96): el hechizo de la lista.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "magic_hand_lightning_weak"));
  await pag.waitForTimeout(1500);

  // ── 1. LA BALLESTA ─────────────────────────────────────────────────────
  await pag.evaluate(() => { window.probe.misiones.dar("bows_crossbow_light"); window.probe.misiones.dar("bows_treebow"); });
  const xbow = await empunarPorElCiclador(pag, "bows_crossbow_light");
  control("la ballesta ligera se empuña por el ciclador", xbow, "");
  const tirosX = [];
  for (let k = 0; k < 3; k++) {
    const t = await tiroA(pag, 8, { segundos: 0.3, espera: 3 });
    if (t) tirosX.push(t);
  }
  for (const t of tirosX) console.log(`  saeta a ${t.nombre}: vuelo ${t.r.vuelo.toFixed(3)} s, acertó ${t.r.acerto}, ` +
    `vida ${t.antes?.toFixed(2)} -> ${t.despues?.toFixed(2)}; guion ${JSON.stringify(t.saeta)}`);
  const conSaeta = tirosX.filter((t) => t.saeta);
  control("cada disparo de la ballesta corre `hitscan_bolt` (el rayo de la saeta)",
    tirosX.length === 3 && conSaeta.length === 3, `${conSaeta.length} de ${tirosX.length}`);
  const aciertos = conSaeta.filter((t) => t.saeta.contra && t.saeta.contra !== "mundo");
  control("y alguna saeta da en el bicho a 8 m", aciertos.length >= 1, `${aciertos.length} de ${conSaeta.length}`);
  control("sin VOLAR: el daño entra en la misma llamada que suelta el gatillo (vuelo 0 s)",
    aciertos.length >= 1 && aciertos.every((t) => t.r.vuelo === 0 && t.r.acerto), aciertos.map((t) => t.r.vuelo).join(", "));
  control("y lo que pierde la víctima es lo que dice la regla (arquería/100 × 100), o 0 si lo esquiva",
    aciertos.length >= 1 && aciertos.every((t) => Math.abs((t.antes - t.despues) - t.saeta.dano) < 1e-6 || t.antes === t.despues),
    aciertos.map((t) => `${(t.antes - t.despues).toFixed(2)} vs ${t.saeta.dano.toFixed(2)}`).join("; "));
  control("y la munición, sin saetas en la mochila, es la SAETA gratis (no la flecha de arco)",
    conSaeta.length >= 1 && conSaeta.every((t) => t.saeta.saeta === "proj_bolt_generic"), conSaeta.map((t) => t.saeta.saeta).join(", "));

  // Control positivo: el arco de árbol, a la misma distancia, VUELA.
  const arco = await empunarPorElCiclador(pag, "bows_treebow");
  const tiroArco = arco ? await tiroA(pag, 8, { segundos: 1.3, espera: 3, exigeAcierto: true }) : null;
  console.log(`  flecha de arco a ${tiroArco?.nombre}: vuelo ${tiroArco?.r?.vuelo?.toFixed(3)} s, acertó ${tiroArco?.r?.acerto}, ` +
    `contra ${tiroArco?.r?.contra}, recorrido ${tiroArco?.r?.recorrido?.toFixed(0)} u, dado ${tiroArco?.r?.dano?.toFixed(1)}, ` +
    `vida de la víctima ${tiroArco?.antes?.toFixed(2)} -> ${tiroArco?.despues?.toFixed(2)}; ` +
    `descartados por cortos ${JSON.stringify(tiroArco?.enOtro ?? [])}`);
  control("CONTROL POSITIVO: la flecha de arco a 8 m acierta VOLANDO (vuelo > 0,1 s)",
    Boolean(tiroArco) && tiroArco.r.acerto && tiroArco.r.vuelo > 0.1 && !tiroArco.saeta,
    `${tiroArco?.r?.vuelo?.toFixed(3)} s, acertó ${tiroArco?.r?.acerto}, ${tiroArco?.r?.recorrido?.toFixed(0)} u de vuelo`);

  // ── 2. LA FLECHA DE ESCARCHA ───────────────────────────────────────────
  control("y la gratis tira su dado de 30-60", tiroArco && tiroArco.r.dano >= 30 && tiroArco.r.dano <= 60,
    `${tiroArco?.r?.dano?.toFixed(1)}`);
  await pag.evaluate(() => window.probe.misiones.dar("proj_arrow_frost", 5));
  const escarcha = [];
  for (let k = 0; k < 3; k++) {
    const t = await tiroA(pag, 6, { segundos: 1.3, espera: 3 });
    if (t) escarcha.push(t.r.dano);
  }
  console.log(`  escarcha: ${escarcha.map((v) => v.toFixed(1)).join(" ")}`);
  control("la flecha de escarcha sale con 60-100 (`'$rand(60,100)'`, sin las comillas)",
    escarcha.length === 3 && escarcha.every((v) => v >= 60 && v <= 100) && escarcha.some((v) => v > 60),
    escarcha.map((v) => v.toFixed(1)).join(" "));

  // ── 3. LOS GUANTELETES QUE SE BORRAN ───────────────────────────────────
  await pag.evaluate(() => { window.probe.misiones.dar("blunt_gauntlets_fe1"); window.probe.misiones.dar("swords_novablade12"); });
  const fe1 = await empunarPorElCiclador(pag, "blunt_gauntlets_fe1");
  const plantar = () => pag.evaluate(() => {
    const s = window.probe.sesion.aparicion().nacimiento.escena;
    window.probe.mundo.poner(s[0], s[1], s[2]);
    window.probe.mundo.mirar(s[0], s[1] - 1.5, s[2] - 2);
  });
  await plantar();
  await pag.waitForTimeout(400);
  const suelo0 = await pag.evaluate(() => window.probe.mundo.suelo().length);
  const solt = await pag.evaluate(() => {
    const o = window.probe.mundo.soltar();
    return { o: o ? { borrado: Boolean(o.borrado), i: o.i ?? null } : null, mano: window.probe.mundo.loQueLlevaLaMano(),
      suelo: window.probe.mundo.suelo().map((x) => x.guion), mochila: window.probe.misiones.bolsa().objetos };
  });
  console.log(`  Venom Claws: empuñados ${fe1}; soltar ${JSON.stringify(solt.o)}, mano ${solt.mano}, suelo ${solt.suelo.length} (antes ${suelo0})`);
  control("los Venom Claws se empuñan y la c los quita de la mano", fe1 && solt.mano === null, `${solt.mano}`);
  control("y NO caen: se borran (`deleteme` en su `game_fall`), ni en el suelo ni en la mochila",
    solt.o?.borrado === true && !solt.suelo.includes("blunt_gauntlets_fe1") && !solt.mochila.some((x) => x.startsWith("blunt_gauntlets_fe1")),
    `suelo ${solt.suelo.join(", ") || "vacío"}`);
  const nova = await empunarPorElCiclador(pag, "swords_novablade12");
  await plantar();
  const soltN = await pag.evaluate(() => {
    const o = window.probe.mundo.soltar();
    return { i: o?.i ?? null, suelo: window.probe.mundo.suelo().map((x) => x.guion) };
  });
  control("CONTROL POSITIVO: la Novablade, soltada igual, SÍ se queda en el suelo",
    nova && soltN.i > 0 && soltN.suelo.includes("swords_novablade12"), `i=${soltN.i}`);

  // ── 4. LA NOVABLADE Y EL CAMPO DE VISIÓN ───────────────────────────────
  //
  // El motor no tiene FOV propio para el modelo de vista (gl_studio.c:3675-3715:
  // misma proyección, sólo `pglDepthRange`). El del mundo es 90° horizontal
  // sobre 640x480 → 73,74° vertical, y se conserva en pantalla ancha
  // (`V_AdjustFov`, cl_view.c:257-279). Aquí, 75° vertical.
  //
  // La medida es en PÍXELES: con el arma CONGELADA (no respira entre fotos),
  // con/sin a 75° y con/sin a 73,74°, en la pantalla entera: la fracción de la
  // pantalla que ocupa el arma con cada FOV. Y la espada larga, que es el MISMO
  // archivo (`v_2hswords`, body 0), con el FOV del motor. (Primero se midió en
  // ángulo y no sirve: ver `probe.vista.congelar`.)
  await pag.evaluate(() => window.probe.mundo.coger());
  const vMotor = (2 * Math.atan(Math.tan((90 * Math.PI) / 360) * 480 / 640) * 180) / Math.PI;
  const fotoA = async (nombre) => { await pag.waitForTimeout(150); const r = `build/gatecity/vistas/armas97-${nombre}.png`; await pag.screenshot({ path: r }); return leerPng(r); };
  const fraccionQueCambia = (a, b) => {
    let c = 0;
    for (let i = 0; i < a.rgba.length; i += 4) {
      const d = Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
      if (d > 24) c++;
    }
    return c / (a.ancho * a.alto);
  };
  const cobertura = async (nombre, fov) => {
    await pag.evaluate((f) => window.probe.vista.campoDeVision(f), fov);
    await pag.waitForTimeout(250);
    const con = await fotoA(`${nombre}-${fov.toFixed(0)}-con`);
    await pag.evaluate(() => window.probe.vista.esconder("arma", true));
    const sin = await fotoA(`${nombre}-${fov.toFixed(0)}-sin`);
    await pag.evaluate(() => window.probe.vista.esconder("arma", false));
    const con2 = await fotoA(`${nombre}-${fov.toFixed(0)}-con2`);
    return { cubre: fraccionQueCambia(con, sin), ruido: fraccionQueCambia(con, con2) };
  };
  const fovAqui = await pag.evaluate(() => window.probe.vista.campoDeVision());
  const medirArma = async (id, nombre) => {
    const ok = await empunarPorElCiclador(pag, id);
    await plantar();
    // «You wield …» sale en la consola de sucesos y se desvanece: la primera
    // pasada leyó 5,2 % de «ruido» en la Novablade y era ese texto.
    await pag.waitForTimeout(6000);
    await pag.evaluate(() => window.probe.vista.congelar("arma", true));
    const aqui = await cobertura(nombre, fovAqui);
    const motor = await cobertura(nombre, vMotor);
    await pag.evaluate((f) => { window.probe.vista.campoDeVision(f); window.probe.vista.congelar("arma", false); }, fovAqui);
    return { ok, aqui, motor };
  };
  await pag.evaluate(() => window.probe.misiones.dar("swords_longsword"));
  const mNova = await medirArma("swords_novablade12", "nova");
  const mLarga = await medirArma("swords_longsword", "larga");
  const pc = (x) => `${(x * 100).toFixed(1)} %`;
  for (const [nombre, m] of [["Novablade", mNova], ["espada larga", mLarga]]) {
    const txt = `${nombre}: ${pc(m.aqui.cubre)} de la pantalla a ${fovAqui}° (aquí), ${pc(m.motor.cubre)} a ${vMotor.toFixed(2)}° (motor); ruido con/con ${pc(m.aqui.ruido)} / ${pc(m.motor.ruido)}`;
    console.log(`  ${txt}`);
    medidas.push(txt);
  }
  // El listón NO es «con/con ≈ 0»: la espada larga, que apenas respira, da el
  // mismo 0,8 % —son las llamas de la antorcha y los NPC—. Es que el arma no
  // se mueva en una escala que se coma la medida: menos de un décimo de lo que
  // cubre. Sin congelar, la Novablade mueve un tercio de su ventana en 0,2 s.
  control("congelada, la Novablade no se mueve entre dos fotos (con/con < 1/10 de lo que cubre)",
    mNova.aqui.ruido < mNova.aqui.cubre / 10 && mNova.motor.ruido < mNova.motor.cubre / 10,
    `${pc(mNova.aqui.ruido)} / ${pc(mNova.motor.ruido)} contra ${pc(mNova.aqui.cubre)}`);
  const porFov = mNova.motor.cubre / mNova.aqui.cubre;
  medidas.push(`el FOV del motor cambia lo que ocupa la Novablade ×${porFov.toFixed(3)}; con el del motor ocupa ×${(mNova.motor.cubre / mLarga.motor.cubre).toFixed(2)} lo de la espada larga`);
  console.log(`  ${medidas[medidas.length - 1]}`);
  // La primera versión de este control pedía «MAYOR» (el FOV del motor es más
  // estrecho, 73,74° contra 75°) y salió ×0,995: un arma que se sale de la
  // pantalla no crece al estrechar el campo, se le va más trozo por el borde.
  // Lo que se puede afirmar es lo que importa: el FOV la cambia MENOS de un 5 %,
  // y la del MISMO archivo con otro cuerpo ocupa mucho menos.
  const porModelo = mNova.motor.cubre / mLarga.motor.cubre;
  control("es el MODELO: el FOV del motor la cambia < 5 % y ocupa > 1,5 veces lo de la espada larga (mismo archivo)",
    Math.abs(porFov - 1) < 0.05 && porModelo > 1.5, `FOV ×${porFov.toFixed(3)}, modelo ×${porModelo.toFixed(2)}`);
  await pag.close();
} catch (e) {
  control(`la parte A llega al final sin caerse`, false, String(e?.message ?? e).split("\n")[0].slice(0, 200));
}

// ═══ B. CON SERVIDOR ════════════════════════════════════════════════════
try {
  partida = spawn(process.execPath, [
    "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 97h",
    "--personajes", PERSONAJES, "--mapa", MAPA_RED, "--nacer", NACER,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  partida.stdout.on("data", (b) => salida.push(String(b)));
  partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
  // No abre el puerto hasta haber cargado el mapa (servidor.mjs:241): se le
  // pregunta en vez de dormir 6 s (el 98).
  await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { proceso: partida, quien: "el servidor de partida" });
  const abrir = async (quien) => {
    const p = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    p.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
    for (let intento = 1; ; intento++) {
      try {
        await entrarPorElMenu(p, PUERTO_WEB, { mapa: MAPA_RED, extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
        break;
      } catch (e) {
        if (intento >= 3) throw e;
        await esperar(1500);
      }
    }
    await p.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    return p;
  };
  const ana = await abrir("ana");
  const beto = await abrir("beto");
  const t0 = Date.now();
  await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "axes_rsmallaxe"));
  await esperar(800);
  await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
  await esperar(2500);
  const pies = (p) => p.evaluate(() => [...window.probe.player.feet]);
  // Beto se aparta ANDANDO (con red el cuerpo lo mueve el servidor).
  let pb = await pies(beto);
  for (let k = 0; k < 40 && Math.hypot(PASO[0] - pb[0], PASO[1] - pb[2]) > 0.4; k++) {
    await beto.evaluate(([a, b, c]) => window.probe.mundo.mirar(a, b, c), [PASO[0], pb[1] + 1.6, PASO[1]]);
    await beto.keyboard.down("KeyW"); await esperar(250); await beto.keyboard.up("KeyW"); await esperar(200);
    pb = await pies(beto);
  }
  // El único otro jugador de la partida es Ana (la foto no siempre trae nombre).
  const deAna = async () => (await beto.evaluate(() => window.probe.red.otros()))[0] ?? null;
  for (let t = 0; t < 30000; t += 500) { const o = await deAna(); if (o?.armaColgada) break; await esperar(500); }
  const o0 = await deAna();
  console.log(`\n  Beto ve a Ana: ${JSON.stringify({ arma: o0?.arma, colgada: o0?.armaColgada, pies: o0?.pies?.map((v) => v.toFixed(2)) })}`);
  control("Beto ve a Ana con su arma colgada de la figura (la foto la trae y la malla cuelga)",
    Boolean(o0?.arma && o0?.armaColgada?.enLaFigura), `${o0?.arma}, ${o0?.armaColgada?.fusionados} huesos fundidos`);

  // El cartel del mapa sale a los 10 y 13 s: se mide pasado (el 96).
  const falta = 40000 - (Date.now() - t0);
  if (falta > 0) await esperar(falta);
  const mirarAAna = async () => {
    const o = await deAna();
    if (!o) return null;
    await beto.evaluate(([a, b, c]) => window.probe.mundo.mirar(a, b, c), [o.pies[0], o.pies[1] + 0.9, o.pies[2]]);
    await esperar(400);
    return o;
  };
  await mirarAAna();
  const r = await beto.evaluate(async () => {
    let u = null;
    for (let k = 0; k < 8; k++) {
      const q = window.probe.red.rectanguloArmaAjena();
      if (q) u = u ? { ...u, x0: Math.min(u.x0, q.x0), y0: Math.min(u.y0, q.y0), x1: Math.max(u.x1, q.x1), y1: Math.max(u.y1, q.y1) } : q;
      await new Promise((res) => setTimeout(res, 150));
    }
    return u;
  });
  const foto = async (nombre) => {
    await esperar(120);
    const ruta = `build/gatecity/vistas/armas97-${nombre}.png`;
    await beto.screenshot({ path: ruta });
    return leerPng(ruta);
  };
  /**
   * Fuera de la ventana, lo que se APAGA Y SE VUELVE A ENCENDER (con≠sin,
   * sin≠con2, con≈con2): es lo que hace una malla escondida y enseñada, y NO lo
   * que hace la figura de Ana respirando (su `idle` mueve el cuerpo entre la
   * primera foto y la tercera). La primera pasada midió «fuera» con `cambian` a
   * secas y leyó 2,6 % —el cuerpo de Ana— con el arma bien.
   */
  //
  // Y «fuera» es un MARCO alrededor de la ventana (de la ventana ensanchada a
  // tres veces su tamaño), no la pantalla entera: la segunda pasada leyó 0,3 %
  // en la pantalla entera y eran las LLAMAS de la antorcha y la chimenea, que
  // parpadean y a veces vuelven a su color en la tercera foto. El marco es lo
  // que rodea al arma —el cuerpo de Ana— y es ahí donde un arma mal medida se
  // vería.
  const vanYVuelven = (con, sin, con2, v, { fuera = false, hasta = null } = {}) => {
    const d = (a, b, i) => Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
    let c = 0, n = 0;
    for (let y = 0; y < con.alto; y++) for (let x = 0; x < con.ancho; x++) {
      const dentro = x >= v.x0 && x < v.x1 && y >= v.y0 && y < v.y1;
      if (dentro === fuera) continue;
      if (hasta && !(x >= hasta.x0 && x < hasta.x1 && y >= hasta.y0 && y < hasta.y1)) continue;
      const i = (y * con.ancho + x) * 4;
      if (d(con, sin, i) > 24 && d(sin, con2, i) > 24 && d(con, con2, i) <= 24) c++;
      n++;
    }
    return n ? c / n : NaN;
  };
  const cambian = (a, b, v, { fuera = false } = {}) => {
    let c = 0, n = 0;
    for (let y = 0; y < a.alto; y++) for (let x = 0; x < a.ancho; x++) {
      const dentro = x >= v.x0 && x < v.x1 && y >= v.y0 && y < v.y1;
      if (dentro === fuera) continue;
      const i = (y * a.ancho + x) * 4;
      const d = Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
      if (d > 24) c++;
      n++;
    }
    return n ? c / n : NaN;
  };
  let m = null;
  if (r) {
    const v = { x0: Math.max(0, Math.floor(r.x0)), y0: Math.max(0, Math.floor(r.y0)), x1: Math.min(r.ancho, Math.ceil(r.x1)), y1: Math.min(r.alto, Math.ceil(r.y1)) };
    const mx = 0.25 * (v.x1 - v.x0) + 4, my = 0.25 * (v.y1 - v.y0) + 4;
    const ancha = { x0: v.x0 - mx, y0: v.y0 - my, x1: v.x1 + mx, y1: v.y1 + my };
    const w = v.x1 - v.x0, h = v.y1 - v.y0;
    const marco = { x0: v.x0 - w, y0: v.y0 - h, x1: v.x1 + w, y1: v.y1 + h };
    // El arma PROPIA de Beto respira en su esquina y salía en «fuera»: se
    // esconde durante las tres fotos (lo que se mide es la de Ana).
    // Y la figura de Ana se CONGELA: la tercera pasada leyó 1,0 % en el marco
    // y era su cabeza, que su `idle` mueve y a veces devuelve a su sitio justo
    // en la tercera foto.
    await beto.evaluate(() => { window.probe.vista.esconder("arma", true); window.probe.red.congelarOtros(true); });
    await esperar(200);
    const con1 = await foto("ajena-con");
    await beto.evaluate(() => window.probe.red.esconderArmaAjena(true));
    const sin = await foto("ajena-sin");
    await beto.evaluate(() => window.probe.red.esconderArmaAjena(false));
    const con2 = await foto("ajena-con2");
    await beto.evaluate(() => { window.probe.vista.esconder("arma", false); window.probe.red.congelarOtros(false); });
    m = { v, area: ((v.x1 - v.x0) * (v.y1 - v.y0)) / (r.ancho * r.alto),
      senal: cambian(con1, sin, v), vuelve: cambian(sin, con2, v),
      vyvDentro: vanYVuelven(con1, sin, con2, v), fuera: vanYVuelven(con1, sin, con2, ancha, { fuera: true, hasta: marco }),
      fueraCrudo: cambian(con1, sin, ancha, { fuera: true }) };
  }
  const pct = (x) => `${(x * 100).toFixed(1)} %`;
  console.log(`  el arma de Ana en la pantalla de Beto: ${m ? `ventana ${m.v.x0},${m.v.y0} — ${m.v.x1},${m.v.y1} (${pct(m.area)}); con/sin ${pct(m.senal)}, sin/con ${pct(m.vuelve)}, van y vuelven dentro ${pct(m.vyvDentro)} / fuera ${pct(m.fuera)} (fuera a secas ${pct(m.fueraCrudo)})` : "sin ventana"}`);
  control("el arma de Ana cae en la pantalla de Beto", Boolean(m) && m.area > 0.0002 && m.area < 0.5, m ? pct(m.area) : "sin rectángulo");
  control("y SE VE: al esconder SÓLO su malla cambia su ventana (> 10 %)", Boolean(m) && m.senal > 0.10, m ? pct(m.senal) : "—");
  control("y al enseñarla vuelve a cambiar (> 10 %)", Boolean(m) && m.vuelve > 0.10, m ? pct(m.vuelve) : "—");
  control("y lo que se apaga y se enciende es ella: en el marco de alrededor < 0,5 % y < 1/10 de dentro",
    Boolean(m) && Number.isFinite(m.fuera) && m.fuera < 0.005 && m.fuera < m.vyvDentro / 10, m ? `${pct(m.fuera)} fuera, ${pct(m.vyvDentro)} dentro` : "—");

  // ── 6. ANA SUELTA EL ARMA Y BETO DEJA DE VERLA ────────────────────────
  const manoAna = await ana.evaluate(() => window.probe.mundo.loQueLlevaLaMano());
  const sueltoAna = await ana.evaluate(() => { const o = window.probe.mundo.soltar(); return o ? { i: o.i ?? null } : null; });
  let o1 = null;
  for (let t = 0; t < 8000; t += 400) { o1 = await deAna(); if (o1 && !o1.arma && !o1.armaColgada) break; await esperar(400); }
  console.log(`  Ana soltó ${manoAna} (${JSON.stringify(sueltoAna)}); Beto la ve con ${JSON.stringify({ arma: o1?.arma, colgada: o1?.armaColgada })}`);
  control("Ana suelta su arma con la c (sale de su mano)", Boolean(sueltoAna) && Boolean(manoAna), `${manoAna}`);
  control("y Beto deja de verla: el servidor se ha enterado (`MENSAJE.SOLTAR`)",
    Boolean(o1) && !o1.arma && !o1.armaColgada, `arma ${o1?.arma}, colgada ${JSON.stringify(o1?.armaColgada)}`);
  control("el servidor no ha escupido ningún error",
    !salida.some((l) => l.startsWith("ERR")), salida.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 200) || "ninguno");
} catch (e) {
  control(`la parte B llega al final sin caerse`, false, String(e?.message ?? e).split("\n")[0].slice(0, 200));
} finally {
  await nav.close().catch(() => {});
  if (partida) matar(partida);
  matar(dev);
}

const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ── ${bien} de ${DECLARADOS} controles ──`);
if (controles.length !== DECLARADOS) console.log(`  corrieron ${controles.length} de ${DECLARADOS} declarados`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
for (const x of medidas) console.log(`  MEDIDA (no cuenta)  ${x}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);
process.exit(controles.length === DECLARADOS && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
