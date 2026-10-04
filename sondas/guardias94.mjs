// EL 94: PEGAR A UN ALDEANO DE GATE CITY Y QUE EL GUARDIA VENGA.
//
// La cadena del mod, que es lo que se mide de punta a punta en el navegador:
//
//   monsters/base_civilian.script:3-16    `game_struck` -> grita y `callexternal all
//                                         civilian_attacked <atacante> <esjugador>`
//   gatecity/guard.script:105-124         no es `hguard`, `range <= BG_MAX_HEAR_CIV` (1024),
//                                         sin objetivo -> `npcatk_settarget`, y si te ve, la frase
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. el aldeano grita y nadie más se entera  -> el `callexternal` no llega
//   2. el guardia dice la frase y no viene     -> el guion corre, la IA no (el cierre del 91)
//   3. el guardia viene desde la otra punta    -> la distancia mide al propio guardia (0)
//   4. «Leave him alone!» sin ningún grito     -> el control mide otra cosa
//
// LO QUE EL MAPA NO TRAE: en Gate City el aldeano humano más cercano al guardia
// está a 1 179 unidades, y el guardia mide la distancia AL QUE PEGA, no al
// aldeano (`$get(OFFENDER,range)`, :110). Con la espada a 60 u, quien pega al
// más cercano está a más de 1 100 del guardia: fuera. Así que el caso negativo
// sale del mapa tal cual, y para el positivo se LLEVA a un aldeano junto al
// guardia (`probe.ia.llevar`, que sólo cambia el sitio). El golpe, el grito,
// la llamada, la distancia y la frase corren por el juego: `golpe.atacar`
// corre el mismo `tic` que el botón del jugador (el 82, y no `pegarA`).

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { liberarPuerto, esperarApariciones, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5295;
const liberados = liberarPuerto(PORT);
if (liberados?.length) console.log(`  (puerto ${PORT} liberado: ${liberados.length})`);
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

// Las cuatro de cada lado, copiadas de los guiones del mod.
const GRITOS = ["Help! Help!", "Guards! Call the guards!", "Save me!", "Help! Help! I'm being repressed!"];
const ALTO = ["Hey you! Leave him alone!", "You there, leave him be I said!", "Stop that!",
  "Halt! We'll have no trouble making around here!"];

/**
 * CUÁNTAS VECES SE HA DICHO cada frase, firmada por quien la dice.
 *
 * La consola PARTE las líneas largas y sólo la primera lleva el nombre (el 81),
 * así que se lee el anillo entero (`misiones.dicho`, que no se desvanece) como
 * un solo bloque y SIN ESPACIOS, y se busca la firma pegada a la frase. «Halt!
 * We'll have no trouble making around here!» no cabe en una línea.
 */
const contar = (lineas, quien, frases) => {
  const bloque = lineas.map((l) => l.replace(/^[^:]*: /, "")).join("").replace(/\s+/g, "");
  const n = {};
  for (const f of frases) {
    const aguja = `${quien}says,"${f}"`.replace(/\s+/g, "");
    n[f] = bloque.split(aguja).length - 1;
  }
  return n;
};
const suma = (n) => Object.values(n).reduce((a, b) => a + b, 0);
const resta = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] - (b[k] ?? 0)]));

try {
  await entrarPorElMenu(pag, PORT);
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  // El pueblo quieto: lo que se mide depende de DÓNDE está cada uno.
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await esperarApariciones(pag);

  const mapa = await pag.evaluate(() => window.probe.vgui2.mapaDeLaPartida());
  control("se entra por el menú y el mapa es Gate City", mapa === "gatecity", `mapa ${mapa}`);

  // ── LO QUE HAY ───────────────────────────────────────────────────────────
  const reparto = await pag.evaluate(() => {
    const S = window.probe;
    const guardia = S.ia.bicho("gatecity/guard");
    const humanos = [];
    for (let n = 0; n < 10; n++) { const b = S.ia.bicho("NPCs/default_human", n); if (!b) break; humanos.push({ n, ...b }); }
    return { guardia, humanos };
  });
  const G = reparto.guardia;
  control("hay un guardia de gatecity/guard, vivo y en el mundo", G && !G.muerto && !G.dormido,
    G ? `${G.nombre} en (${G.unidades.map((v) => Math.round(v)).join(", ")}) u` : "ninguno");
  const dU = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const humanos = reparto.humanos.filter((h) => !h.muerto)
    .map((h) => ({ ...h, alGuardia: dU(h.unidades, G.unidades) }))
    .sort((a, b) => a.alGuardia - b.alGuardia);
  console.log(`\n  aldeanos humanos y su distancia al guardia: ${humanos.map((h) => Math.round(h.alGuardia)).join(", ")} u`);
  control("hay al menos dos aldeanos de NPCs/default_human (uno lejos, uno que se lleva)", humanos.length >= 2,
    `${humanos.length}`);

  /**
   * PEGAR AL ALDEANO `n` DESDE AL LADO, a espadazos, hasta que un golpe entre.
   * Devuelve lo dicho antes y después, lo que hace el guardia y a qué distancia
   * del guardia estaba el jugador al pegar.
   */
  const pegarle = async (n) => await pag.evaluate(({ n }) => {
    const S = window.probe;
    const c = S.ia.bicho("NPCs/default_human", n);
    const d = c.donde;
    // A un metro y mirándole a la cintura. Al lado y no encima: `poner` no
    // resuelve colisiones (el 69). Tres números en `mirar` (el 78).
    S.mundo.poner(d[0] + 1.0, d[1] + 0.1, d[2]);
    S.mundo.mirar(d[0], d[1] + 0.9, d[2]);
    const antes = S.misiones.dicho();
    const vidaAntes = c.vida;
    let tandas = 0, impactos = 0;
    while (tandas < 8) {
      const r = S.golpe.atacar(1.2);
      tandas++;
      impactos += r?.impactos ?? 0;
      const v = S.ia.bicho("NPCs/default_human", n);
      if (v.vida < vidaAntes) break;
    }
    const tras = S.ia.bicho("NPCs/default_human", n);
    const g = S.ia.bicho("gatecity/guard");
    const gi = S.reaccion.censo().find((x) => x.script === "gatecity/guard");
    const q = gi ? S.reaccion.quien(gi.n) : null;
    return {
      antes, despues: S.misiones.dicho(), tandas, impactos,
      vida: [vidaAntes, tras.vida],
      objetivo: q?.objetivo ?? null,
      guardiaDonde: g.donde, alGuardia: q?.distanciaAlJugador ?? null,
    };
  }, { n });

  // ── 1. EL CASO NEGATIVO, DEL MAPA TAL CUAL ──────────────────────────────
  // El aldeano MÁS CERCANO al guardia, en su sitio: quien le pega queda fuera
  // de los 1 024 del guardia. El grito es el control positivo del instrumento:
  // la cadena llegó hasta el `callexternal`, y lo que la corta es la distancia.
  const lejos = humanos[0];
  const r1 = await pegarle(lejos.n);
  const U = 39.37;
  const alGuardia1 = r1.alGuardia === null ? null : r1.alGuardia * U;
  const gritos1 = suma(resta(contar(r1.despues, "Commoner", GRITOS), contar(r1.antes, "Commoner", GRITOS)));
  const alto1 = suma(resta(contar(r1.despues, "Gate City Guard", ALTO), contar(r1.antes, "Gate City Guard", ALTO)));
  console.log(`\n  1) aldeano a ${Math.round(lejos.alGuardia)} u del guardia: ${r1.tandas} tanda(s), ` +
    `vida ${r1.vida.join(" -> ")}, jugador a ~${alGuardia1 ? Math.round(alGuardia1) : "?"} u del guardia`);
  control("el golpe entra (vida del aldeano baja)", r1.vida[1] < r1.vida[0], `vida ${r1.vida.join(" -> ")}`);
  control("CONTROL POSITIVO: el aldeano grita una de las cuatro (base_civilian.script:11-14)", gritos1 === 1,
    `${gritos1} gritos nuevos`);
  control("CONTROL NEGATIVO: el guardia, a más de 1 024 del que pega, NO te toma de objetivo",
    r1.objetivo === null, `objetivo ${r1.objetivo}`);
  control("y no dice su frase", alto1 === 0, `${alto1} frases nuevas`);

  // ── 2. EL CASO POSITIVO: UN ALDEANO JUNTO AL GUARDIA ─────────────────────
  // Se lleva al segundo aldeano a 3 m del guardia, en la dirección del pueblo
  // (hacia donde está el más cercano, que es calle).
  const cerca = humanos[1];
  const llevado = await pag.evaluate(({ n, g, hacia }) => {
    const dx = hacia[0] - g[0], dz = hacia[2] - g[2];
    const l = Math.hypot(dx, dz) || 1;
    const p = [g[0] + (dx / l) * 3, g[1], g[2] + (dz / l) * 3];
    return window.probe.ia.llevar("NPCs/default_human", p, n);
  }, { n: cerca.n, g: G.donde, hacia: lejos.donde });
  control("el segundo aldeano se lleva a 3 m del guardia", Array.isArray(llevado),
    llevado ? `(${llevado.map((v) => v.toFixed(1)).join(", ")}) m` : "no");
  const r2 = await pegarle(cerca.n);
  const alGuardia2 = r2.alGuardia === null ? null : r2.alGuardia * U;
  const gritos2 = resta(contar(r2.despues, "Commoner", GRITOS), contar(r2.antes, "Commoner", GRITOS));
  const alto2 = resta(contar(r2.despues, "Gate City Guard", ALTO), contar(r2.antes, "Gate City Guard", ALTO));
  console.log(`  2) aldeano llevado: ${r2.tandas} tanda(s), vida ${r2.vida.join(" -> ")}, ` +
    `jugador a ~${alGuardia2 ? Math.round(alGuardia2) : "?"} u del guardia`);
  console.log(`     gritos ${JSON.stringify(gritos2)}\n     guardia ${JSON.stringify(alto2)}`);
  control("el golpe entra", r2.vida[1] < r2.vida[0], `vida ${r2.vida.join(" -> ")}`);
  control("el aldeano grita una de las cuatro", suma(gritos2) === 1, `${suma(gritos2)}`);
  control("EL GUARDIA TE TOMA DE OBJETIVO (npcatk_settarget, guard.script:114)",
    r2.objetivo === "jugador", `objetivo ${r2.objetivo}`);
  control("Y DICE UNA DE SUS CUATRO FRASES, firmada por él (guard.script:120-123)",
    suma(alto2) === 1, `${suma(alto2)} frases nuevas`);

  // ── 3. Y VIENE: el efecto en el mundo, no sólo en la cuenta ──────────────
  // Se aleja al jugador 6 m del guardia y se deja correr el mundo: con objetivo,
  // el cazador lo persigue. Se mide que el guardia se ha MOVIDO hacia el jugador.
  const viene = await pag.evaluate(({ g }) => {
    const S = window.probe;
    const gi = S.reaccion.censo().find((x) => x.script === "gatecity/guard");
    const a = S.reaccion.quien(gi.n);
    S.mundo.poner(g[0] + 6, g[1] + 0.1, g[2]);
    S.reaccion.avanzar(3);
    const b = S.reaccion.quien(gi.n);
    return { antes: a.distanciaAlJugador, despues: b.distanciaAlJugador, objetivo: b.objetivo, anim: b.animacion,
      paso: Math.hypot(b.donde[0] - a.donde[0], b.donde[2] - a.donde[2]) };
  }, { g: G.donde });
  console.log(`  3) el guardia anda ${viene.paso.toFixed(2)} m en 3 s ('${viene.anim}'), objetivo ${viene.objetivo}`);
  control("y el guardia se mueve: el objetivo lo lleva la IA, no sólo la variable", viene.paso > 0.5,
    `${viene.paso.toFixed(2)} m`);

  // ── 4. EL 95: UNA SOLA HUIDA, LA DE SU GUION ────────────────────────────
  // El aldeano no tiene IA de ataque (`HAS_AI`, base_npc_attack_new.script:81,
  // y default_human no la incluye): huye por `setmovedest ent_laststruck 1024
  // flee` (NPCs/default_human.script:66-72) y por nada más. Hasta el 94 la IA
  // le hacía huir OTRA VEZ desde el segundo golpe (`FLEE_HEALTH 25` estricto
  // contra la vida de antes del golpe). Se le pega al aldeano llevado, que ya
  // recibió uno en el apartado 2: éste es el segundo.
  const r4 = await pegarle(cerca.n);
  const a4 = await pag.evaluate(({ n }) => {
    const b = window.probe.ia.bicho("NPCs/default_human", n);
    // Lo que su guion pidió y no se pudo hacer: un `setmovedest` sin destino
    // dice aquí por qué (los cuatro ceros de `destinoDeSetmovedest`).
    return { ...b, faltas: (window.probe.misiones.noSoportados(b.id) ?? []).filter((x) => x.startsWith("setmovedest")) };
  }, { n: cerca.n });
  console.log(`  4) segundo golpe al llevado: vida ${r4.vida.join(" -> ")}, tieneIA ${a4.tieneIA}, ` +
    `huye por IA ${a4.huyendoPorIA}, mandado ${JSON.stringify(a4.mandado)}, faltas ${JSON.stringify(a4.faltas)}`);
  control("el segundo golpe entra, con la vida ya por debajo de 25", r4.vida[1] < r4.vida[0] && r4.vida[0] < 25,
    `vida ${r4.vida.join(" -> ")}`);
  control("CONTROL POSITIVO: su guion le manda huir (`setmovedest … flee`, dueño «guion»)",
    a4.mandado?.dueño === "guion", JSON.stringify(a4.mandado));
  control("EL 95: Y LA IA NO LE HACE HUIR OTRA VEZ (sin `HAS_AI` no hay `npcatk_checkflee`)",
    a4.tieneIA === false && a4.huyendoPorIA === false, `tieneIA ${a4.tieneIA}, huye por IA ${a4.huyendoPorIA}`);
  // El efecto, no la variable: dos segundos de mundo y el aldeano se ha
  // alejado del jugador. Hasta el 95, en un jugador, esto lo hacía SÓLO la IA:
  // el `setmovedest ent_laststruck` de su guion no encontraba a nadie.
  const huida4 = await pag.evaluate(({ n }) => {
    const S = window.probe;
    const yo = () => { const b = S.ia.bicho("NPCs/default_human", n); return b.donde; };
    const a = yo();
    S.reaccion.avanzar(2);
    const b = yo();
    return { paso: Math.hypot(b[0] - a[0], b[2] - a[2]) };
  }, { n: cerca.n });
  console.log(`     en 2 s el aldeano anda ${huida4.paso.toFixed(2)} m`);
  control("Y HUYE DE VERDAD: en 2 s se ha movido más de un metro", huida4.paso > 1, `${huida4.paso.toFixed(2)} m`);

  // ── 5. EL 95: AL MORIR, EL ALDEANO NO AVISA A SUS ALIADOS ────────────────
  // `if HAS_AI` delante de `npcatk_alert_all_allies` (base_npc.script:168-172).
  // Se lleva a un tercer aldeano a un metro del primero (los dos `race human`,
  // aliados), se le baja la vida a 1 al primero y se le mata a espadazos: el
  // camino de la muerte de main.js, que es el que suma `estado.avisos`. El
  // control positivo es un goblin con su pareja de Gate City (a 101-191 u, el
  // 92), muerto por el mismo camino: ése sí avisa.
  const matarA = async (guion, n) => await pag.evaluate(({ guion, n }) => {
    const S = window.probe;
    const k = S.reaccion.censo().filter((x) => x.script === guion)[n]?.n;
    if (k === undefined) return null;
    const avisosAntes = S.reaccion.estado.avisos;
    S.reaccion.vida(k, 1);
    let tandas = 0;
    while (tandas < 30 && !S.ia.bicho(guion, n).muerto) {
      const d = S.ia.bicho(guion, n).donde;
      S.mundo.poner(d[0] + 1.0, d[1] + 0.1, d[2]);
      S.mundo.mirar(d[0], d[1] + 0.9, d[2]);
      S.golpe.atacar(1.2);
      tandas++;
    }
    return { muerto: S.ia.bicho(guion, n).muerto, tandas, avisos: S.reaccion.estado.avisos - avisosAntes };
  }, { guion, n });
  const tercero = humanos[2] ?? null;
  if (!tercero) {
    control("hay un tercer aldeano humano para el aviso", false, `${humanos.length}`);
  } else {
    // Donde esté AHORA el primero: ha huido por su guion desde el apartado 1.
    const junto = await pag.evaluate(({ n, m }) => {
      const a = window.probe.ia.bicho("NPCs/default_human", m).donde;
      return window.probe.ia.llevar("NPCs/default_human", [a[0] + 1, a[1], a[2]], n);
    }, { n: tercero.n, m: lejos.n });
    const m5 = await matarA("NPCs/default_human", lejos.n);
    const t5 = await pag.evaluate(({ n }) => window.probe.ia.bicho("NPCs/default_human", n), { n: tercero.n });
    console.log(`  5) aldeano muerto en ${m5?.tandas} tanda(s), avisos +${m5?.avisos}; el de al lado: objetivo ${t5.objetivo}`);
    control("el tercer aldeano se lleva a un metro del primero", Array.isArray(junto), String(junto));
    control("el aldeano muere a espadazos", m5?.muerto === true, JSON.stringify(m5));
    control("EL 95: AL MORIR NO AVISA A NADIE (`if HAS_AI`, base_npc.script:170)", m5?.avisos === 0,
      `avisos +${m5?.avisos}`);
    control("y el aldeano de al lado no te toma de objetivo", t5.objetivo === null, `objetivo ${t5.objetivo}`);
    // El control positivo: el primer goblin que tenga otro a menos de 290 u.
    const par = await pag.evaluate(() => {
      const S = window.probe;
      const g = [];
      for (let n = 0; n < 20; n++) { const b = S.ia.bicho("monsters/goblin", n); if (!b) break; g.push({ n, ...b }); }
      const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      for (const a of g) {
        if (a.muerto || a.dormido) continue;
        if (g.some((b) => b.n !== a.n && !b.muerto && !b.dormido && d(a.unidades, b.unidades) < 290)) return a.n;
      }
      return null;
    });
    const g5 = par === null ? null : await matarA("monsters/goblin", par);
    console.log(`     control: goblin ${par} muerto en ${g5?.tandas} tanda(s), avisos +${g5?.avisos}`);
    control("CONTROL POSITIVO: un goblin con pareja, muerto igual, SÍ avisa", g5?.muerto === true && g5.avisos > 0,
      JSON.stringify(g5));
  }

  control("la página no ha dado ni un error", errores.length === 0, errores.slice(0, 3).join(" · "));
  mkdirSync("build/gatecity/vistas", { recursive: true });
  await pag.screenshot({ path: "build/gatecity/vistas/guardias94.png" });
} catch (e) {
  // El 65: la caída es una roja, no una nota al pie.
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
