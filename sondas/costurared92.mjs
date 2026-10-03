// LA COSTURA DEL 91, CON SERVIDOR — experimento 92, pieza B.
//
//   node sondas/costurared92.mjs
//
// Dos Chrome de verdad contra un servidor de verdad (`tools/servidor.mjs`),
// en sala88, la sala con UNA rata del 88. El servidor se levanta con dos
// perillas de operador:
//
//   --nacer 17.3,0.1,0   los dos nacen a un metro de la rata; con red el
//                        cuerpo lo mueve el servidor y `probe.mundo.poner`
//                        sería una mentira que la reconciliación deshace
//   --params monsters/giantrat=add_dot_poison
//                        el veneno de la rata, el evento del mod que un mapa
//                        pide con `params` (monsters/externals.script:1342)
//
// Lo que se mide es lo que el guion de la rata ha recibido EN EL SERVIDOR
// (`/costura`, de sólo lectura) y lo que le LLEGA a cada navegador por su
// consola de sucesos. No se lee la copia del navegador: los guiones no viajan,
// y medir la copia sería medir otro juego.
//
// Se entra POR EL MENÚ (CLAUDE.md §3), como `sondas/red.mjs`.
//
//   1. la costura está enchufada en el servidor, y la rata tiene guion y veneno
//   2. CONTROL NEGATIVO: los dos quietos a su lado, sin pegarle, la rata no
//      muerde y a nadie le llega nada
//   3. Ana le pega: el guion recibe `game_damaged` con el asa de ANA
//   4. la rata muerde a Ana: `game_dodamage` con el asa de Ana, el veneno se
//      pone en el anfitrión de Ana, y a Ana le llega «You have been poisoned!»
//   5. CONTROL NEGATIVO del reparto: a Beto, al lado, no le llega nada, y su
//      asa no aparece en el guion de la rata
//   6. el navegador NO corre una segunda copia del guion de la rata

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync } from "node:fs";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PUERTO_WEB = 5293;
const PUERTO_PARTIDA = 5294;
const MAPA = "sala88";
const RATA = "monsters/giantrat";
const PERSONAJES = "build/partidas/sonda92/personajes";
try { rmSync("build/partidas/sonda92", { recursive: true, force: true }); } catch {}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PUERTO_WEB), "--strictPort"], { shell: true, stdio: "ignore" });
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 92",
  "--personajes", PERSONAJES, "--mapa", MAPA,
  "--nacer", "17.3,0.1,0",
  "--params", `${RATA}=add_dot_poison`,
], { stdio: ["ignore", "pipe", "pipe"] });
const salida = [];
partida.stdout.on("data", (b) => salida.push(String(b)));
partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const costura = async () => {
  const r = await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`);
  return r.json();
};
const laRata = (c) => c?.bichos?.find((b) => b.script === RATA) ?? null;

// El marcador NO puede bajar (el 65 y el 86): se declara cuántos hay, y una
// caída a mitad es roja aunque los que corrieron estén verdes.
const DECLARADOS = 16;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];
const navegaciones = [];

await esperar(9000);   // vite y el mapa del servidor
const nav = await chromium.launch();
try {
  const abrir = async (quien) => {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
    // Una recarga a media sonda se lee como «probe no existe»: se apunta.
    pag.on("framenavigated", (f) => { if (f === pag.mainFrame()) navegaciones.push(`${quien}: ${f.url().slice(0, 120)}`); });
    await entrarPorElMenu(pag, PUERTO_WEB, { mapa: MAPA, extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
    await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    return pag;
  };
  const ana = await abrir("ana");
  const beto = await abrir("beto");
  await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
  await esperar(800);
  await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
  await esperar(2000);
  const dicho = (pag) => pag.evaluate(() => window.probe.misiones.dicho());
  const yo = (pag) => pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
  const [yoAna, yoBeto] = [await yo(ana), await yo(beto)];

  // ── 1. ENCHUFADA ────────────────────────────────────────────────────────
  let c0 = await costura();
  const pj = (id) => c0.clientes.find((x) => x.id === id)?.personaje ?? null;
  const asaAna = pj(yoAna), asaBeto = pj(yoBeto);
  console.log(`\n  ana hueco ${yoAna} asa ${asaAna} · beto hueco ${yoBeto} asa ${asaBeto}`);
  control("los dos han entrado por el menú y el servidor los tiene con personaje",
    Boolean(asaAna && asaBeto && asaAna !== asaBeto), `${asaAna} · ${asaBeto}`);
  control("la costura está enchufada a la manada DEL SERVIDOR", c0.enchufada === true && c0.sinOyente === 0,
    `enchufada ${c0.enchufada}, sinOyente ${c0.sinOyente}`);
  const r0 = laRata(c0);
  control("la rata tiene guion EN EL SERVIDOR, con el cierre del 91", Boolean(r0?.conCierre), JSON.stringify(r0?.recibidos ?? null));
  control("y el veneno del operador ha corrido en su guion (`NPC_DOT_POISON` 1)", r0?.veneno === "1", `veneno ${r0?.veneno}`);

  // ── 2. CONTROL NEGATIVO: quietos y sin pegarle ──────────────────────────
  const mirarLaRata = (pag) => pag.evaluate((g) => {
    const r = window.probe.ia.bicho(g);
    if (!r) return null;
    window.probe.mundo.mirar(r.donde[0], r.donde[1] + 0.2, r.donde[2]);   // TRES números (el 78)
    const p = window.probe.player.feet;
    return { donde: r.donde, vida: r.vida, a: Math.hypot(r.donde[0] - p[0], r.donde[2] - p[2]) };
  }, RATA);
  // ANDANDO hasta ella, con el teclado: con red el cuerpo lo mueve el
  // servidor y teletransportarse sería una mentira que la foto deshace.
  const acercarse = async (pag, cerca = 1.3) => {
    let r = await mirarLaRata(pag);
    for (let k = 0; k < 40 && r && r.a > cerca; k++) {
      await pag.keyboard.down("KeyW");
      await esperar(Math.min(400, 150 + (r.a - cerca) * 200));
      await pag.keyboard.up("KeyW");
      await esperar(150);
      r = await mirarLaRata(pag);
    }
    return r;
  };
  const rAna = await acercarse(ana);
  console.log(`  la rata está a ${rAna?.a?.toFixed?.(2)} m de Ana`);
  await esperar(3000);
  const c1 = await costura();
  const dAna1 = await dicho(ana);
  control("CONTROL NEGATIVO: 3 s a su lado sin pegarle, la rata no muerde (su guion no recibe `game_dodamage`)",
    (laRata(c1)?.recibidos?.game_dodamage ?? 0) === 0 && rAna?.a < 3,
    `dodamage ${laRata(c1)?.recibidos?.game_dodamage ?? 0}, a ${rAna?.a?.toFixed?.(2)} m`);
  control("y a Ana no le ha llegado ningún veneno", !dAna1.some((l) => /poison/i.test(l)), dAna1.slice(-3).join(" | "));

  // ── 3. ANA LE PEGA ───────────────────────────────────────────────────────
  let c2 = c1;
  for (let k = 0; k < 6 && !(laRata(c2)?.recibidos?.game_damaged > 0); k++) {
    await acercarse(ana, 1.0);
    await ana.evaluate(() => window.probe.golpe.atacar(1.2));
    await esperar(700);
    c2 = await costura();
  }
  const r2 = laRata(c2);
  control("Ana le pega y el guion de la rata EN EL SERVIDOR recibe `game_damaged`",
    (r2?.recibidos?.game_damaged ?? 0) >= 1, JSON.stringify(r2?.recibidos ?? null));
  control("con el asa de ANA como atacante (msmonsterserver.cpp:2285), no la de Beto ni «none»",
    r2?.damaged?.[0] === asaAna, `PARAM1 ${r2?.damaged?.[0]}`);

  // ── 4. LA RATA MUERDE, Y EL VENENO VIAJA ─────────────────────────────────
  let c3 = c2, t = 0, dAna = [];
  while (t < 30000) {
    await mirarLaRata(ana);
    await esperar(500); t += 500;
    c3 = await costura();
    dAna = await dicho(ana);
    if (dAna.some((l) => l.includes("You have been poisoned!"))) break;
    if (!laRata(c3)?.vivo) break;
  }
  const r3 = laRata(c3);
  control("la rata devuelve el golpe: su guion recibe `game_dodamage`",
    (r3?.recibidos?.game_dodamage ?? 0) >= 1, `${r3?.recibidos?.game_dodamage ?? 0} en ${(t / 1000).toFixed(1)} s; viva ${r3?.vivo}`);
  control("y su `game_dodamage` lleva el asa de Ana como objetivo (PARAM2)",
    r3?.dodamage?.[1] === asaAna, JSON.stringify(r3?.dodamage ?? null));
  const efAna = c3.efectos.find((e) => e.cliente === yoAna);
  control("el veneno se ha puesto en el anfitrión de efectos de Ana, en el servidor",
    (efAna?.aplicados ?? 0) >= 1, JSON.stringify(c3.efectos));
  control("y a la pantalla de Ana le llega «You have been poisoned!»",
    dAna.some((l) => l.includes("You have been poisoned!")), dAna.slice(-4).join(" | "));

  // ── 5. EL REPARTO: a Beto no ─────────────────────────────────────────────
  const dBeto = await dicho(beto);
  control("CONTROL NEGATIVO: a Beto, al lado, no le llega ningún veneno (`MSG_ONE`, no `MSG_ALL`)",
    !dBeto.some((l) => /poison/i.test(l)) && !c3.efectos.some((e) => e.cliente === yoBeto),
    dBeto.slice(-3).join(" | ") || "(nada)");
  control("y su asa no aparece en el guion de la rata",
    r3?.damaged?.[0] !== asaBeto && r3?.dodamage?.[1] !== asaBeto, `${r3?.damaged?.[0]} · ${r3?.dodamage?.[1]}`);

  // ── 6. UNA SOLA COPIA ────────────────────────────────────────────────────
  const local = await ana.evaluate((g) => window.probe.costura.de(g), RATA);
  control("el navegador NO corre una segunda copia del guion de la rata (dos copias serían dos ratas, el 63)",
    local && local.conGuion === false, JSON.stringify(local ? { conGuion: local.conGuion } : null));
  control("y el servidor no ha escupido ningún error",
    !salida.some((l) => l.startsWith("ERR")) && (c3.fallos ?? 0) === 0,
    salida.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 200) || `fallos ${c3.fallos}`);
} catch (e) {
  console.log(`\n  LA SONDA SE HA CAÍDO: ${String(e?.message ?? e).split("\n")[0]}`);
  controles.push({ que: `la sonda termina sin caerse (${String(e?.message ?? e).split("\n")[0]})`, bien: false, detalle: "" });
} finally {
  await nav.close().catch(() => {});
  matar(partida);
  matar(dev);
}

const bien = controles.filter((c) => c.bien).length;
console.log(`\n  ── ${bien} de ${DECLARADOS} controles ──`);
if (controles.length !== DECLARADOS) console.log(`  corrieron ${controles.length} de ${DECLARADOS} declarados`);
for (const c of controles) console.log(`  ${c.bien ? "sí" : "NO"}  ${c.que}${c.detalle ? `  [${c.detalle}]` : ""}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);
console.log(`  el servidor dijo:\n${salida.join("").split("\n").map((l) => `    ${l}`).join("\n")}`);
process.exit(controles.length === DECLARADOS && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
