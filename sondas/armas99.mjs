// EL 99: ¿TIRAN JUGANDO LA UNHOLY BLADE, LA SHADOW LANCE Y EL ARCO DE TORKALATH?
//
//   npm run sonda:armas99
//
// El 98 portó los guiones de los tres proyectiles (`proj_ub`, `proj_pole_sl`,
// `proj_arrow_spiral`) y sólo salían por la costura de la prueba, que llamaba a
// `tirar` con el ataque escrito a mano. Jugando:
//
//   - la Unholy Blade y la Shadow Lance son cuerpo a cuerpo, y su ataque
//     `charge-throw-projectile` caía en el camino del mandoble de `Brazo.tic`:
//     un golpe de 100 u y ningún tiro;
//   - el arco elegía siempre su ataque 0, y en el de Torkalath el 0 es la flecha
//     de `base_ranged`.
//
// Aquí se aprieta el botón por `pasoDelBrazo` —lo que llama el bucle— como lo
// hace un jugador: clic, segundo clic durante el mandoble aguantando dos
// niveles, soltar (`probe.arco.soltarYDetener(…, { cargado: true })`). Y para
// cada proyectil se mide que EXISTE (el de su ficha), que VUELA (120 u, y se le
// detiene en el aire) y que SE DIBUJA, con los dos instrumentos de
// sondas/armas98.mjs: el contador de `onBeforeRender` con su cero escondido, y
// los píxeles que se apagan y vuelven en su ventana y no en el marco.
//
// Los controles negativos: cargar UN nivel con la espada no tira nada (el
// mandoble cargado), y en el arco también salen flechas normales — la moneda de
// `StartAttack` existe; si el arco tirara SIEMPRE la esfera sería otro fallo.
//
// Se entra por el menú (§3), con un personaje nuevo al que se le suben las
// habilidades (la sombra pide espadas 34, la lanza astas 35, el arco fuego 15).

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5992;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT, { tope: 180_000 });
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("build/gatecity/vistas", { recursive: true });

// El marcador NO puede bajar (el 65): se declara cuántos hay.
// El 99, parte R: 18 — el control positivo del arco de partida.
const DECLARADOS = 18;
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
  // Las habilidades que piden los tres ataques, en el personaje de verdad.
  await pag.evaluate(() => {
    const h = window.probe.sesion.personaje.habilidades;
    for (const n of ["swordsmanship", "polearms", "archery"]) {
      h[n] ??= {};
      for (const k of ["proficiency", "balance", "power"]) { h[n][k] ??= {}; h[n][k].valor = 60; }
    }
    h.spellcasting ??= {};
    for (const k of ["fire", "ice", "lightning", "affliction"]) { h.spellcasting[k] ??= {}; h.spellcasting[k].valor = 60; }
  });

  /** Tira en dieciséis rumbos hasta que uno vuela 120 u sin chocar, y lo detiene ahí. */
  const tirarYDetener = (segundos, opciones) => pag.evaluate(async ({ segundos, opciones }) => {
    let alto = null;
    for (let k = 0; k < 16 && !alto?.volando; k++) {
      const d = window.probe.mundo.donde();
      const a = (k * Math.PI) / 8;
      window.probe.mundo.mirar(d.ojo[0] + 40 * Math.cos(a), d.ojo[1], d.ojo[2] + 40 * Math.sin(a));
      alto = window.probe.arco.soltarYDetener(segundos, 120, opciones);
      if (!alto) return null;   // no salió nada: no hay rumbo que lo arregle
    }
    return alto;
  }, { segundos, opciones });

  const foto = async (nombre) => {
    await esperar(150);
    const ruta = `build/gatecity/vistas/armas99-${nombre}.png`;
    await pag.screenshot({ path: ruta });
    return leerPng(ruta);
  };

  /** Los dos instrumentos de armas98: el grafo que se pinta y los píxeles. */
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
    control(`${etiqueta}: su nodo cuelga de la escena que pinta el bucle`, rect?.enLaEscena === true, `${rect?.enLaEscena}`);
    control(`${etiqueta}: Three la DIBUJA (\`onBeforeRender\` en cada cuadro)`, dibujos >= 3, `${dibujos} en 3 cuadros`);
    control(`${etiqueta}: control — escondido su nodo, el contador lee 0`, dibujosEscondida === 0, `${dibujosEscondida}`);
    control(`${etiqueta}: SE VE — al esconder su nodo se apaga y vuelve > 5 % de su ventana, y en el marco < 0,5 %`,
      Boolean(m) && m.dentro > 0.05 && Number.isFinite(m.fuera) && m.fuera < 0.005 && m.fuera < m.dentro / 10,
      m ? `${pct(m.dentro)} dentro, ${pct(m.fuera)} fuera, ventana ${pct(m.area)}` : "sin vértices en pantalla");
  }

  // ── LAS DOS ARMAS CUERPO A CUERPO ──────────────────────────────────────
  for (const [id, proyectil] of [["swords_ub", "proj_ub"], ["polearms_sl", "proj_pole_sl"]]) {
    const e = await pag.evaluate((id) => window.probe.arco.empunar(id), id);
    control(`${id}: en la mano, cuerpo a cuerpo, y con el conjunto que dibuja lo que vuela montado`,
      e.id === id && e.esDeTiro === false && e.conjunto > 0, `${e.id}, esDeTiro ${e.esDeTiro}, ${e.conjunto} nodos`);
    // Negativo: UN nivel de carga da el mandoble cargado, no el tiro.
    const uno = await pag.evaluate(() => window.probe.arco.soltarYDetener(1.2, 120, { cargado: true }));
    control(`${id}: control — cargar UN nivel y soltar NO tira nada (es el mandoble cargado)`, uno === null, JSON.stringify(uno));
    const alto = await tirarYDetener(2.6, { cargado: true });
    console.log(`\n  ${id}: ${JSON.stringify(alto)}`);
    control(`${id}: cargar DOS niveles y soltar tira ${proyectil}, y VUELA (detenido a 120 u, no clavado)`,
      alto?.id === proyectil && alto.volando === true && alto.recorrido >= 120 && alto.conPieza,
      alto ? `${alto.id}, ${alto.recorrido?.toFixed(0)} u, pieza ${alto.conPieza}` : "no salió nada");
    await seDibuja(id);
  }

  // ── EL ARCO DE TORKALATH: LA MONEDA ────────────────────────────────────
  await pag.evaluate(() => window.probe.arco.empunar("bows_telf1"));
  const vistos = await pag.evaluate(() => {
    const n = {};
    for (let k = 0; k < 40 && !(n.proj_arrow_spiral && n.proj_arrow_generic); k++) {
      const r = window.probe.arco.soltarYDetener(1.3, 1e9);
      const id = r?.id ?? "nada";
      n[id] = (n[id] ?? 0) + 1;
    }
    return n;
  });
  console.log(`\n  bows_telf1, tiro a tiro: ${JSON.stringify(vistos)}`);
  control("bows_telf1: la esfera (`proj_arrow_spiral`) sale JUGANDO", (vistos.proj_arrow_spiral ?? 0) > 0, JSON.stringify(vistos));
  // CORRECCIÓN DEL 99, parte R (doc/GUION_99.md). Este control nació como
  // «también salen flechas gratis: es la moneda de `StartAttack`, no "siempre
  // la esfera"», con la lectura de antes: tres ataques empatados. Con el `if`
  // viejo (`if !CUSTOM_ATTACK`, base_ranged.script:23; script.cpp:5754-5757) y
  // `local` por evento (script.cpp:5696) al arco le queda UN ataque que tira, y
  // la esfera sale siempre: 40 de 40. El control positivo de que este
  // instrumento VE una flecha gratis va justo debajo, con el arco de partida.
  control("bows_telf1: SIEMPRE la esfera — ni una flecha gratis en 40 tiros (el `if` viejo y `local` por evento)",
    vistos.proj_arrow_spiral === 40 && !vistos.proj_arrow_generic && !vistos.nada, JSON.stringify(vistos));
  await pag.evaluate(() => window.probe.arco.empunar("bows_treebow"));
  const dePartida = await pag.evaluate(() => window.probe.arco.soltarYDetener(1.3, 1e9)?.id ?? "nada");
  control("control — el mismo instrumento con el arco de partida lee una flecha gratis", dePartida === "proj_arrow_generic", dePartida);

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
