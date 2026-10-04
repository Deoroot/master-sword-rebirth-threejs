// LO QUE UN NPC DICE Y A QUIÉN MIRA FUERA DEL MENÚ, CON SERVIDOR — experimento 95, pieza B.
//
//   npm run sonda:red95
//
// Dos Chrome de verdad contra un servidor de verdad (`tools/servidor.mjs`), en
// Edana, delante de Sylphiel, la camarera. El 94 dejó sin sonda de navegador
// el `setmovedest`/`$cansee` del servidor, y el 95 los ganchos de lo que dice
// un guion (`saytext`). Sylphiel tiene los tres en UN evento:
//
//     { say_job                                  (catchspeech say_job job work…, :47)
//       if cider_1 equals 0
//       if $cansee(player,128)                   ← el `$cansee` del 94
//       setmovedest ent_lastseen 9999            ← el `setmovedest` del 94
//       saytext I have a task for you, …         ← el `saytext` del 95
//       … calleventtimed 4 reset }               edana/barwench.script:126-137
//
// Y corre FUERA de cualquier menú: lo dispara el chat local (`oir`), y quien
// escribe en el chat no pulsa la F. Ahí es donde `_aQuienHabla()` (el último
// que abrió un menú en TODA la partida) y el jugador del guion dejan de ser el
// mismo. (Se buscó primero un RELOJ —su saludo de `repeatdelay $randf(30,45)`,
// :54-64— y no corre: los `repeatdelay` de un NPC que no es de combate no se
// arman en este puerto, el 93. Ver doc/RED_95.md §5.)
//
// EL SEGUNDO CASO (el 50), construido a propósito y comprobado en `/costura`:
//
//   - Ana se queda junto a Sylphiel (≈87 u, dentro de 128 y a la vista) y le
//     pide trabajo por el chat LOCAL, con el teclado: eso la ata al guion.
//   - Beto se va ANDANDO a un rincón que Sylphiel no ve y a más de 300 u, y
//     abre allí su propio menú con la F: «con quién habla» pasa a ser Beto.
//
// Las respuestas posibles son distintas: con el arreglo, ella ve a Ana, Ana la
// oye y Beto no, y su destino es Ana. Con `$cansee` mirando al que habla
// (Beto, oculto) no contesta; con `setmovedest` hacia él, el destino es Beto;
// con `saytext` al que habla, lo oye Beto y Ana no.
//
// Y la fase 2 es el CONTROL POSITIVO de la consola de Beto: vuelve andando a
// menos de 300 u, Ana vuelve a decir «job» y la segunda respuesta la oyen LOS
// DOS (el reparto por distancia de `Speak`, msmonsterserver.cpp:1712-1716),
// que con el código de antes del 95 tampoco pasaba: sólo la oía uno.
//
// Se entra POR EL MENÚ (CLAUDE.md §3). Con red el cuerpo lo mueve el servidor,
// así que nadie se teletransporta: `--nacer` pone a los dos al lado de ella y
// Beto se va andando. El rincón y el camino salieron de tirar rayos con la
// física del servidor (doc/RED_95.md §4).

import { spawn, spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { rmSync } from "node:fs";
import { liberarPuerto, lanzarVite, esperarHttp } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PUERTO_WEB = 5397;
const PUERTO_PARTIDA = 5398;
const MAPA = "edana";
const SYLPHIEL = "edana/barwench";
/** 2,2 m de ella, a rumbo 90° (escena): a la vista y a 87 u. */
const NACER = "7.98,-4.4,2.37";
/** El camino de Beto: un punto de paso y el rincón oculto (metros de escena, x y z). */
const PASO = [8.98, -0.43];
const RINCON = [19.0, -3.4];
const PERSONAJES = "build/partidas/sonda95/personajes";
try { rmSync("build/partidas/sonda95", { recursive: true, force: true }); } catch {}

const liberados = [...liberarPuerto(PUERTO_WEB), ...liberarPuerto(PUERTO_PARTIDA)];
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en los puertos: matados)`);
const dev = lanzarVite(PUERTO_WEB);
const partida = spawn(process.execPath, [
  "tools/servidor.mjs", "--puerto", String(PUERTO_PARTIDA), "--nombre", "La sonda 95",
  "--personajes", PERSONAJES, "--mapa", MAPA, "--nacer", NACER,
], { stdio: ["ignore", "pipe", "pipe"] });
const salida = [];
partida.stdout.on("data", (b) => salida.push(String(b)));
partida.stderr.on("data", (b) => salida.push(`ERR ${b}`));
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const costura = async () => (await fetch(`http://localhost:${PUERTO_PARTIDA}/costura`)).json();
const ella = (c) => c?.bichos?.find((b) => b.script === SYLPHIEL) ?? null;
const U = 39.37;
/** El rumbo de escena (`yaw = atan2(-dz, dx)`, manada.js:387) de `a` a `b`, en grados. */
const rumbo = (a, b) => ((Math.atan2(-(b[2] - a[2]), b[0] - a[0]) * 180) / Math.PI + 360) % 360;
const separa = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
/**
 * Las veces que aparece una frase de Sylphiel, firmada, en lo que se ha dicho.
 * La consola PARTE las líneas largas y sólo la primera lleva la firma (el 81),
 * y `dicho()` antepone el tipo a cada trozo: se quita el tipo, se junta todo y
 * se compara sin espacios.
 */
const veces = (lineas, frase) => {
  const todo = lineas.map((l) => l.replace(/^\w+: /, "")).join("").replace(/\s+/g, "");
  const buscada = `Sylphiel,thewaitresssays,"${frase.replace(/\s+/g, "")}`;
  return todo.split(buscada).length - 1;
};
/** El primer `say_job` (edana/barwench.script:131) y el segundo (:145). */
const TAREA = "I have a task for you, now that you ask.";
const OTRA_VEZ = "Didn't I ask you to check with Bryan on that cider shipment?";

// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 12;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];
/** Lo que se mide y se imprime pero NO se cuenta: no puede salir verde hoy. */
const pendientes = [];

// vite y el mapa del servidor: se les PREGUNTA en vez de dormir a ciegas (el 98;
// el servidor no abre el puerto hasta haber cargado el mapa, servidor.mjs:241).
await esperarHttp(`http://localhost:${PUERTO_WEB}/`, { tope: 90_000, proceso: dev, quien: "vite" });
await esperarHttp(`http://localhost:${PUERTO_PARTIDA}/partidas`, { tope: 90_000, proceso: partida, quien: "el servidor de partida" });
const nav = await chromium.launch();
try {
  const abrir = async (quien) => {
    const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
    pag.on("pageerror", (e) => errores.push(`${quien}: ${String(e).slice(0, 200)}`));
    for (let intento = 1; ; intento++) {
      try {
        await entrarPorElMenu(pag, PUERTO_WEB, { mapa: MAPA, extra: `red=ws://localhost:${PUERTO_PARTIDA}/juego` });
        break;
      } catch (e) {
        if (intento >= 3) throw e;
        console.log(`    (${quien}: la entrada falló «${String(e?.message ?? e).slice(0, 60)}», intento ${intento + 1})`);
        await esperar(1500);
      }
    }
    await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
    return pag;
  };
  const ana = await abrir("ana");
  const beto = await abrir("beto");
  await ana.evaluate(() => window.probe.sesion.nuevo("Ana", "swords_rsword"));
  await esperar(800);
  await beto.evaluate(() => window.probe.sesion.nuevo("Beto", "swords_rsword"));
  await esperar(2500);
  const yo = (pag) => pag.evaluate(() => window.probe.red.estado()?.yo ?? null);
  const [yoAna, yoBeto] = [await yo(ana), await yo(beto)];
  const c0 = await costura();
  const asaDe = (id) => c0.clientes.find((x) => x.id === id)?.personaje ?? null;
  const asaAna = asaDe(yoAna), asaBeto = asaDe(yoBeto);
  console.log(`\n  ana hueco ${yoAna} asa ${asaAna} · beto hueco ${yoBeto} asa ${asaBeto}`);

  const pies = (pag) => pag.evaluate(() => [...window.probe.player.feet]);
  const laVe = (pag) => pag.evaluate(() => {
    const b = window.probe.red.bichos().find((x) => /Sylphiel/.test(x.nombre ?? ""));
    return b ? { id: b.id, donde: b.donde, yaw: ((((b.yaw ?? 0) * 180) / Math.PI) % 360 + 360) % 360 } : null;
  });
  const dicho = (pag) => pag.evaluate(() => window.probe.misiones.dicho());
  /** Cuántas veces sale `frase` (firmada por Sylphiel) en TODO el anillo; o `re` sobre el texto sin espacios. */
  const cuenta = async (pag, frase, re = null) => {
    const l = await dicho(pag);
    if (!re) return veces(l, frase);
    return (l.map((x) => x.replace(/^w+: /, "")).join("").replace(/s+/g, "").match(re) ?? []).length;
  };

  // ── 0. DÓNDE ESTÁ CADA UNO ────────────────────────────────────────────────
  const s0 = await laVe(ana);
  const pa0 = await pies(ana);
  const dAna = s0 ? Math.hypot(pa0[0] - s0.donde[0], pa0[2] - s0.donde[2]) * U : null;
  control("los dos han entrado por el menú, y Ana está junto a Sylphiel (< 128 u, el rango de su `$cansee`)",
    Boolean(asaAna && asaBeto && asaAna !== asaBeto && s0 && dAna < 128),
    `${asaAna} · ${asaBeto}; Ana a ${dAna?.toFixed(0)} u`);

  // ── 1. BETO SE VA ANDANDO AL RINCÓN ──────────────────────────────────────
  const irA = async (pag, [x, z], cerca = 0.35) => {
    let p = await pies(pag);
    for (let k = 0; k < 80; k++) {
      const d = Math.hypot(x - p[0], z - p[2]);
      if (d < cerca) return { llegado: true, p, d };
      await pag.evaluate(([a, b, c]) => window.probe.mundo.mirar(a, b, c), [x, p[1] + 1.6, z]);   // TRES números (el 78)
      await pag.keyboard.down("KeyW");
      await esperar(Math.min(450, 90 + d * 160));
      await pag.keyboard.up("KeyW");
      await esperar(220);
      p = await pies(pag);
    }
    return { llegado: false, p, d: Math.hypot(x - p[0], z - p[2]) };
  };
  await irA(beto, PASO);
  const enRincon = await irA(beto, RINCON);
  const dBeto = Math.hypot(enRincon.p[0] - s0.donde[0], enRincon.p[2] - s0.donde[2]) * U;
  console.log(`  Beto en el rincón: ${enRincon.llegado ? "sí" : "NO"} (${enRincon.p.map((v) => v.toFixed(2)).join(", ")}), a ${dBeto.toFixed(0)} u de ella`);
  control("Beto ha llegado andando al rincón, a más de 300 u de ella (el alcance de su `saytext`)",
    enRincon.llegado && dBeto > 300, `${dBeto.toFixed(0)} u`);

  // ── 2. BETO ABRE SU PROPIO MENÚ: «con quién habla» pasa a ser él ─────────
  await beto.evaluate(([a, b, c]) => window.probe.mundo.mirar(a, b, c), [enRincon.p[0] + 5, enRincon.p[1] + 1.6, enRincon.p[2]]);
  await beto.keyboard.press("KeyF");
  await esperar(1500);
  const menuBeto = await beto.evaluate(() => ({ cual: window.probe.vgui.abierto(), botones: window.probe.vgui.botones().map((b) => b.texto) }));
  await beto.keyboard.press("Escape");
  await esperar(600);
  const c1 = await costura();
  control("la F de Beto, sin nadie delante, abre SU menú, y el servidor dice que ahora habla con Beto",
    c1.hablaCon === yoBeto && menuBeto.botones.some((t) => /Sit Down|Stand Up/.test(t)),
    `hablaCon ${c1.hablaCon}; menú ${menuBeto.cual} [${menuBeto.botones.slice(0, 3).join(" | ")}]`);

  // ── 3. ANA LE PIDE TRABAJO POR EL CHAT LOCAL, CON EL TECLADO ─────────────
  //
  // `catchspeech say_job job work money gold` (edana/barwench.script:47) y
  // el primer `say_job` (:126-137): `if $cansee(player,128)`, `setmovedest
  // ent_lastseen 9999` y `saytext I have a task for you…`. Corre dentro de
  // `oir`, o sea FUERA de cualquier menú: el que escribe en el chat no pulsa
  // la F, y «con quién habla» sigue siendo Beto.
  const yaw0 = (await laVe(ana))?.yaw ?? null;
  const hacia = { ana: rumbo(s0.donde, pa0), beto: rumbo(s0.donde, enRincon.p) };
  console.log(`  ella mira a ${yaw0?.toFixed(0)}°; Ana está a ${hacia.ana.toFixed(0)}°, Beto a ${hacia.beto.toFixed(0)}°`);
  control("ANTES de nada ella NO mira hacia Ana (si no, el giro de después no mediría nada)",
    yaw0 !== null && separa(yaw0, hacia.ana) > 30 && separa(hacia.ana, hacia.beto) > 30,
    `|${yaw0?.toFixed(0)} − ${hacia.ana.toFixed(0)}| y Ana/Beto separados ${separa(hacia.ana, hacia.beto).toFixed(0)}°`);
  const hablaAna = async (texto) => {
    await ana.keyboard.press("KeyU");        // `bind "u" "say_text 1"`: local
    await esperar(200);
    await ana.keyboard.type(texto, { delay: 40 });
    await ana.keyboard.press("Enter");
  };
  // POR CUENTAS Y NO POR ÍNDICE: `dicho()` es un ANILLO, y lleno no crece —
  // `slice(marca)` daba vacío en la consola de Ana, que habla más, y la
  // primera pasada leyó «Ana no lo oye» con la frase en su pantalla.
  const base = { ana: await cuenta(ana, TAREA), beto: await cuenta(beto, TAREA), eco: await cuenta(beto, "good", /Anasays,"job"/g) };
  await hablaAna("job");
  for (let t = 0; t < 8000 && (await cuenta(ana, TAREA)) <= base.ana; t += 500) await esperar(500);
  await esperar(1500);
  const lAna = await dicho(ana), lBeto = await dicho(beto);
  const nAna = (await cuenta(ana, TAREA)) - base.ana, nBeto = (await cuenta(beto, TAREA)) - base.beto;
  const ecoBeto = (await cuenta(beto, "good", /Anasays,"job"/g)) - base.eco;
  const s1 = await laVe(ana);
  const c2 = await costura();
  console.log(`  tras «job»: Ana ${nAna}, Beto ${nBeto}; ella mira a ${s1?.yaw?.toFixed(0)}° (servidor: ${JSON.stringify({ yaw: ella(c2)?.yaw, mandado: ella(c2)?.mandado, frenado: ella(c2)?.frenado, velocidad: ella(c2)?.velocidad })})`);
  control("el chat ata a Ana al guion de Sylphiel, y el servidor sigue hablando con Beto (el segundo caso existe)",
    ella(c2)?.jugador === String(asaAna) && c2.hablaCon === yoBeto,
    `jugador del guion ${ella(c2)?.jugador}; hablaCon ${c2.hablaCon}`);
  control("`$cansee(player,128)` fuera del menú mira a Ana, la de su guion (no a Beto, oculto): contesta y Ana lo oye",
    nAna >= 1, lAna.slice(-3).join(" | ") || "(nada)");
  control("CONTROL NEGATIVO: Beto, a más de 300 u, NO lo oye (antes del 95 era el único que lo oía)",
    nBeto === 0 && ecoBeto === 0, `${nBeto} frases, ${ecoBeto} ecos de Ana; ${lBeto.slice(-2).join(" | ") || "(nada)"}`);
  // EL DESTINO, leído en el servidor (`/costura`, de sólo lectura): es lo que
  // decide `RetrieveEntity` y lo que el 94 arregló. En unidades, x y z.
  const destino = ella(c2)?.mandado?.origen ?? null;
  const aU = (p) => [p[0] * U, p[2] * U];
  const lejosDe = (p) => (destino ? Math.hypot(destino[0] - aU(p)[0], destino[2] - aU(p)[1]) : Infinity);
  const paAhora = await pies(ana), pbAhora = await pies(beto);
  control("`setmovedest ent_lastseen 9999` le manda como destino el sitio de ANA (a < 16 u), no el de Beto",
    lejosDe(paAhora) < 16 && lejosDe(pbAhora) > 100,
    `destino ${destino?.map((v) => v.toFixed(0)).join(",") ?? "ninguno"}: a ${lejosDe(paAhora).toFixed(0)} u de Ana, ${lejosDe(pbAhora).toFixed(0)} u de Beto`);
  // Y EL GIRO, PENDIENTE (CLAUDE.md §4: no se cuenta un verde que no puede
  // salir). Con el destino bien puesto ella NO se gira: `pasoMandado`
  // (src/play/manada.js) sale por «sin velocidad» ANTES de mirar si ya ha
  // llegado, y Sylphiel no tiene animación de andar horneada (`andando: null`,
  // velocidad 0). En el motor el giro de la rama de llegada no necesita andar:
  // sólo `movetype` (msmonsterserver.cpp:1002-1003 y :1018-1029). Ver doc/RED_95.md §5.
  pendientes.push(`el giro: mira a ${s1?.yaw?.toFixed(0)}° (Ana a ${hacia.ana.toFixed(0)}°); servidor frenado «${ella(c2)?.frenado}», velocidad ${ella(c2)?.velocidad}`);

  // ── 4. CONTROL POSITIVO: Beto vuelve y la siguiente frase la oyen LOS DOS ─
  //
  // A los 4 s `calleventtimed 4 reset` pone `cider_1 1` (:135, :139-140), y el
  // segundo `say_job` (:143-150) contesta otra cosa: «Didn't I ask you…».
  const deVuelta = await irA(beto, PASO);
  const dBeto2 = Math.hypot(deVuelta.p[0] - s0.donde[0], deVuelta.p[2] - s0.donde[2]) * U;
  await esperar(4500);
  const base2 = { ana: await cuenta(ana, OTRA_VEZ), beto: await cuenta(beto, OTRA_VEZ) };
  await hablaAna("job");
  for (let t = 0; t < 8000 && (await cuenta(beto, OTRA_VEZ)) <= base2.beto; t += 500) await esperar(500);
  await esperar(1000);
  const lBeto2 = await dicho(beto), lAna2 = await dicho(ana);
  const nBeto2 = (await cuenta(beto, OTRA_VEZ)) - base2.beto, nAna2 = (await cuenta(ana, OTRA_VEZ)) - base2.ana;
  const c3 = await costura();
  console.log(`  fase 2: Beto a ${dBeto2.toFixed(0)} u; Ana ${nAna2}, Beto ${nBeto2}`);
  control("CONTROL POSITIVO: Beto, de vuelta a menos de 300 u, oye la frase siguiente (su consola SÍ lo habría visto)",
    dBeto2 < 300 && nBeto2 >= 1, `${dBeto2.toFixed(0)} u; ${lBeto2.slice(-2).join(" | ") || "(nada)"}`);
  control("y Ana también: un `saytext` le llega a TODOS los que están a su alcance, no a uno",
    nAna2 >= 1, lAna2.slice(-2).join(" | ") || "(nada)");
  control("y el servidor seguía hablando con Beto todo ese rato", c3.hablaCon === yoBeto, `hablaCon ${c3.hablaCon}`);

  control("el servidor no ha escupido ningún error",
    !salida.some((l) => l.startsWith("ERR")), salida.filter((l) => l.startsWith("ERR")).join(" ").slice(0, 200) || "ninguno");
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
for (const p of pendientes) console.log(`  PENDIENTE (no cuenta)  ${p}`);
console.log(`\n  errores de página: ${errores.length ? errores.join(" · ") : "ninguno"}`);
process.exit(controles.length === DECLARADOS && controles.every((c) => c.bien) && !errores.length ? 0 : 1);
