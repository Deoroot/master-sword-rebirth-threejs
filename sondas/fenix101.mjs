// EL 101: EL GRITO DEL PHOENIX BOW Y LO QUE SE VE CUANDO SU FLECHA REVIENTA.
//
//   npm run sonda:fenix101
//
// Lo que se mide, en Chromium, entrando por el menú (§3) y tirando por
// `pasoDelBrazo` y `pasoDeFlechas`, que es lo que llama el bucle:
//
//   1. EL SONIDO. Que al soltar el Phoenix Bow SUENAN la cuerda y el grito del
//      halcón (`svplaysound 0 5 SOUND_PHOENIX`, proj_arrow_phx.script:54-57), y
//      al reventar el vapor (`sound.play3d SOUND_BURST`, proj_arrow_phx_cl.script:49).
//      «Suenan» son TRES testigos distintos, porque cada uno falla por su lado:
//        - la RED: el navegador pidió el `.wav` y el servidor contestó 200 con
//          audio (un 200 con `text/html` es el `index.html` de vite, o sea que
//          el archivo no está horneado — así estaba `weapons/bow/` entera);
//        - `Audio.ultimas`: la fuente llegó a `start()` con ese archivo;
//        - `Audio.fallos`: no se apuntó como «no está».
//   2. EL SEGUNDO CASO, y va PRIMERO: el arco de árbol suena a cuerda, no grita
//      y no revienta. Sin él, «hay un hawkcaw en la lista» no diría quién lo puso.
//   3. EL ESTALLIDO. Que hay una llamarada EN LA ESCENA, en el sitio de la
//      explosión, a la escala que le toca por el radio del daño, aditiva, con su
//      luz naranja; que Three la DIBUJA y que SE VE (los dos instrumentos de
//      armas98/100: `onBeforeRender` y los píxeles que se van y vuelven al
//      esconder su nodo); y que se apaga sola en sus dos segundos.

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5740;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT, { tope: 180_000 });
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync("build/gatecity/vistas", { recursive: true });

// Lo que dice el HORNEADO, leído fuera de la página: el testigo independiente.
const CAT = JSON.parse(readFileSync("build/msr/armas.json", "utf8"));
const FENIX = "proj_arrow_phx";
const CLAVE = CAT.estallidos?.find((e) => e.id === FENIX)?.clave ?? null;
const GRITO = "monsters/birds/hawkcaw.wav";      // proj_arrow_phx.script:33
const VAPOR = "ambience/steamburst1.wav";        // proj_arrow_phx_cl.script:6
const CUERDA = "weapons/bow/bow.wav";            // bows_firebird.script:12

// El marcador NO puede bajar (el 65): se declara cuántos hay.
const DECLARADOS = 30;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];
const pct = (x) => `${(x * 100).toFixed(1)} %`;

const nav = await chromium.launch();
try {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e.stack ?? e).slice(0, 400)));
  pag.on("console", (m) => { if (/el arma no se ha podido montar/.test(m.text())) errores.push(m.text().slice(0, 400)); });
  // LA RED, que no sale de la página: qué `.wav` se han pedido y qué contestó el servidor.
  const pedidos = [];
  pag.on("response", (r) => {
    const m = r.url().match(/\/snd\/(.+\.wav)(\?.*)?$/);
    if (m) pedidos.push({ archivo: decodeURIComponent(m[1]), estado: r.status(), tipo: r.headers()["content-type"] ?? "" });
  });
  const pedido = (archivo) => pedidos.filter((p) => p.archivo === archivo);
  const audioBueno = (p) => p.estado === 200 && /audio|octet-stream/i.test(p.tipo) && !/html/i.test(p.tipo);

  await entrarPorElMenu(pag, PORT);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  await pag.evaluate(() => {
    const h = window.probe.sesion.personaje.habilidades;
    h.archery ??= {};
    for (const k of ["proficiency", "balance", "power"]) { h.archery[k] ??= {}; h.archery[k].valor = 60; }
  });

  const sonido = () => pag.evaluate(() => {
    const e = window.probe.sonido.estado;
    return { despierto: e.despierto, contexto: e.contexto, fallos: e.fallos, ultimas: e.ultimas };
  });
  const sonadas = (s, archivo) => s.ultimas.filter((u) => u.archivo === `snd/${archivo}`);

  /**
   * Tira hacia el SUELO, a seis metros, en dieciséis rumbos hasta que la flecha
   * acabe contra el mundo a una distancia razonable. Todo dentro de UNA llamada
   * (el bucle suelta el botón entre dos), y si revienta se CONGELA la llamarada
   * en el acto, antes de que el bucle le dé un paso.
   */
  const tirarAlSuelo = (congelar) => pag.evaluate(({ congelar, FENIX }) => {
    let r = null, k = 0;
    for (; k < 16; k++) {
      const d = window.probe.mundo.donde();
      const a = (k * Math.PI) / 8;
      window.probe.mundo.mirar(d.ojo[0] + 6 * Math.cos(a), d.pies[1], d.ojo[2] + 6 * Math.sin(a));
      const antes = window.probe.arco.deGuion()?.explosiones?.length ?? 0;
      r = window.probe.arco.tirar(1.3, { espera: 4 });
      r.exploto = (window.probe.arco.deGuion()?.explosiones?.length ?? 0) > antes;
      if (r.choco && r.contra === "mundo" && r.recorrido > 120 && r.recorrido < 900) break;
    }
    if (congelar) window.probe.arco.congelarEstallido(FENIX, true);
    return { ...r, rumbo: k };
  }, { congelar, FENIX });

  const foto = async (nombre) => {
    await esperar(150);
    const ruta = `build/gatecity/vistas/fenix101-${nombre}.png`;
    await pag.screenshot({ path: ruta });
    return leerPng(ruta);
  };

  const s0 = await sonido();
  control("control positivo — el audio está DESPIERTO tras entrar por el menú (sin eso nada puede sonar)",
    s0.despierto === true && s0.contexto === "running", `${s0.contexto}, despierto ${s0.despierto}`);

  // ── 1. EL SEGUNDO CASO, PRIMERO: el arco de árbol ──────────────────────
  const arbol = await pag.evaluate(() => window.probe.arco.empunar("bows_treebow"));
  control("bows_treebow en la mano", arbol.id === "bows_treebow" && arbol.conjunto > 0, `${arbol.id}`);
  const t1 = await tirarAlSuelo(false);
  await esperar(1200);
  const s1 = await sonido();
  const g1 = await pag.evaluate(() => window.probe.arco.deGuion());
  const e1 = await pag.evaluate(() => window.probe.arco.estallidos());
  console.log(`\n  arco de árbol: ${JSON.stringify({ contra: t1.contra, recorrido: t1.recorrido?.toFixed(0), rumbo: t1.rumbo })}`);
  console.log(`  sonaron: ${s1.ultimas.slice(s0.ultimas.length).map((u) => u.archivo.replace("snd/", "")).join(", ") || "nada"}`);
  control("el arco de árbol tira su flecha gratis y da contra el mundo", t1.choco && t1.contra === "mundo" && t1.exploto === false,
    `${t1.contra}, explotó ${t1.exploto}`);
  control(`SUENA LA CUERDA (\`${CUERDA}\`): pedida a la red con 200 y audio, y arrancada`,
    pedido(CUERDA).some(audioBueno) && sonadas(s1, CUERDA).length >= 1,
    `red ${JSON.stringify(pedido(CUERDA)[0] ?? null)}, arrancadas ${sonadas(s1, CUERDA).length}`);
  control("y el flechazo contra la pared (`weapons/bow/arrowhit*.wav`, proj_arrow_base.script:15-16, :87-90)",
    s1.ultimas.some((u) => /snd\/weapons\/bow\/arrowhit[12]\.wav/.test(u.archivo)),
    s1.ultimas.map((u) => u.archivo).filter((a) => /arrowhit/.test(a)).join(", ") || "ninguno");
  control("el arco de árbol NO grita y NO hay vapor: ni pedidos a la red ni arrancados",
    pedido(GRITO).length === 0 && pedido(VAPOR).length === 0 && sonadas(s1, GRITO).length === 0 && sonadas(s1, VAPOR).length === 0,
    `red ${pedido(GRITO).length}+${pedido(VAPOR).length}, arrancadas ${sonadas(s1, GRITO).length}+${sonadas(s1, VAPOR).length}`);
  control("y no revienta nada: cero explosiones y ninguna llamarada lanzada",
    (g1?.explosiones?.length ?? 0) === 0 && (e1[FENIX]?.lanzados ?? 0) === 0 && (e1[FENIX]?.vivos?.length ?? 0) === 0,
    `${g1?.explosiones?.length} explosiones, ${e1[FENIX]?.lanzados ?? "sin montar"} lanzadas`);

  // ── 2. EL PHOENIX BOW ──────────────────────────────────────────────────
  const fb = await pag.evaluate(() => window.probe.arco.empunar("bows_firebird"));
  control("bows_firebird en la mano y tira `proj_arrow_phx`", fb.id === "bows_firebird" && fb.proyectil === FENIX, `${fb.id}, ${fb.proyectil}`);
  const montado = (await pag.evaluate(() => window.probe.arco.estallidos()))[FENIX] ?? null;
  control(`el estallido está MONTADO y colgado de la escena, con su secuencia (carpeta \`${CLAVE}\`, del horneado)`,
    Boolean(CLAVE) && montado?.enLaEscena === true && montado?.conSecuencia === true, JSON.stringify(montado && { enLaEscena: montado.enLaEscena, conSecuencia: montado.conSecuencia }));

  const antes = { grito: sonadas(s1, GRITO).length, vapor: sonadas(s1, VAPOR).length, cuerda: sonadas(s1, CUERDA).length, total: s1.ultimas.length };
  const t2 = await tirarAlSuelo(true);
  const g2 = await pag.evaluate(() => window.probe.arco.deGuion());
  const ex = g2?.explosiones?.at(-1) ?? null;
  const U = await pag.evaluate(() => window.probe.mundo.unidadesPorMetro());
  console.log(`\n  Fénix: ${JSON.stringify({ contra: t2.contra, recorrido: t2.recorrido?.toFixed(0), rumbo: t2.rumbo, exploto: t2.exploto })}`);
  console.log(`  explosión: radio ${ex?.radio?.toFixed(1)} u, daño ${ex?.dano?.toFixed(1)}, distancia ${ex?.distancia?.toFixed(0)} u, U ${U}`);
  control("la flecha del Fénix sale, da contra el mundo y EXPLOTA", t2.choco && t2.contra === "mundo" && t2.exploto === true && Boolean(ex),
    `${t2.contra}, explotó ${t2.exploto}`);
  control("control — `unidadesPorMetro` es un número (el 79: se llama, no se lee)", Number.isFinite(U) && U > 1, `${U}`);

  // 2a. EL ESTALLIDO, congelado en t = 0.
  const vivo = ((await pag.evaluate(() => window.probe.arco.estallidos()))[FENIX]?.vivos ?? [])[0] ?? null;
  console.log(`  llamarada: ${JSON.stringify(vivo)}`);
  control("HAY UNA LLAMARADA VIVA en la escena y ninguna explosión se quedó sin dibujo",
    Boolean(vivo) && vivo.visible === true && g2.sinEstallido === 0 && ex?.efecto?.dibujado === true,
    `${vivo ? "viva" : "ninguna"}, sin dibujo ${g2?.sinEstallido}`);
  // La escala, calculada AQUÍ con la cuenta del guion y el radio de la explosión:
  // 1 + 9·radio/256 (proj_arrow_phx_cl.script:24-26). Y que no es la de reposo (1).
  const escalaEsperada = ex ? 1 + 9 * ex.radio / 256 : NaN;
  control("la llamarada tiene la ESCALA de su radio (1 + 9·radio/256) y no la de reposo",
    Boolean(vivo) && Math.abs(vivo.escala - escalaEsperada) < 1e-6 && vivo.escala > 1.5,
    `${vivo?.escala?.toFixed(3)} contra ${escalaEsperada.toFixed(3)}`);
  // Dónde: el centro de la explosión (en el SUELO) subido 8 + 22·radio/256 unidades (:31-32), en metros.
  const sitio = ex ? [ex.centro[0] / U, (ex.centro[1] + 8 + 22 * ex.radio / 256) / U, ex.centro[2] / U] : null;
  const lejos = vivo && sitio ? Math.hypot(...[0, 1, 2].map((k) => vivo.posicion[k] - sitio[k])) : NaN;
  const delOrigen = vivo ? Math.hypot(...vivo.posicion) : 0;
  control("el NODO está donde reventó (a menos de 1 cm), y no en el origen del mapa (el 71)",
    lejos < 0.01 && delOrigen > 1, `a ${lejos.toFixed(4)} m del sitio, a ${delOrigen.toFixed(1)} m del cero`);
  control("es ADITIVA y nace entera (`rendermode add`, `renderamt 255`)", vivo?.aditivo === true && vivo?.opacidad === 1,
    `aditivo ${vivo?.aditivo}, opacidad ${vivo?.opacidad}`);
  control("y lleva su LUZ naranja (255,128,64) con el radio × 1,5 (:44-46)",
    Boolean(vivo?.luz) && vivo.luz.color.join(",") === "255,128,64" && Math.abs(vivo.luz.radio - (ex.radio * 1.5) / U) < 1e-6,
    JSON.stringify(vivo?.luz));
  // El alto de la luz es NUESTRO (ver `src/render/estallido.js`): subida como la
  // llamarada, porque a ras de suelo una luz de Lambert no alumbra el suelo.
  control("la luz está sobre el centro de la explosión, subida lo que la llamarada",
    Boolean(vivo?.luz) && sitio && Math.hypot(...[0, 1, 2].map((k) => vivo.luz.posicion[k] - sitio[k])) < 0.01,
    vivo?.luz ? `a ${Math.hypot(...[0, 1, 2].map((k) => vivo.luz.posicion[k] - sitio[k])).toFixed(4)} m` : "sin luz");

  // 2b. SE DIBUJA Y SE VE: los dos instrumentos de armas98/100.
  await pag.evaluate(() => window.probe.vista.esconder("arma", true));
  await esperar(300);
  const rect = await pag.evaluate((FENIX) => window.probe.arco.rectanguloEstallido(FENIX), FENIX);
  const dibujos = await pag.evaluate((FENIX) => window.probe.arco.dibujosDeEstallido(FENIX, 3), FENIX);
  let m = null;
  if (rect && rect.vertices > 0) {
    const v = {
      x0: Math.max(0, Math.floor(rect.x0)), y0: Math.max(0, Math.floor(rect.y0)),
      x1: Math.min(rect.ancho, Math.ceil(rect.x1)), y1: Math.min(rect.alto, Math.ceil(rect.y1)),
    };
    const con1 = await foto("con");
    await pag.evaluate((FENIX) => window.probe.arco.esconderEstallido(FENIX, true), FENIX);
    const sin = await foto("sin");
    await pag.evaluate((FENIX) => window.probe.arco.esconderEstallido(FENIX, false), FENIX);
    const con2 = await foto("con2");
    const d = (a, b, i) => Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
    let dentro = 0, nd = 0, masClaro = 0;
    for (let y = v.y0; y < v.y1; y++) for (let x = v.x0; x < v.x1; x++) {
      const i = (y * con1.ancho + x) * 4;
      nd++;
      if (d(con1, sin, i) > 24 && d(sin, con2, i) > 24 && d(con1, con2, i) <= 24) {
        dentro++;
        // Aditiva: lo que cambia tiene que ser MÁS CLARO con ella que sin ella.
        if (con1.rgba[i] + con1.rgba[i + 1] + con1.rgba[i + 2] > sin.rgba[i] + sin.rgba[i + 1] + sin.rgba[i + 2]) masClaro++;
      }
    }
    m = { v, dentro: nd ? dentro / nd : NaN, cambian: dentro, masClaro: dentro ? masClaro / dentro : NaN, area: nd / (con1.ancho * con1.alto) };
  }
  // LA LUZ, medida en lo que ALUMBRA y no en el nodo: con la llamarada escondida
  // (para que no cuente ella), se apaga la luz, se fotografía y se vuelve a
  // encender. Lo que se va y vuelve, y es más claro con ella, es lo que alumbra.
  let luz = null;
  {
    await pag.evaluate((FENIX) => window.probe.arco.esconderEstallido(FENIX, true), FENIX);
    await esperar(200);
    const a = await foto("luz-con");
    await pag.evaluate((FENIX) => window.probe.arco.luzDeEstallido(FENIX, false), FENIX);
    await esperar(200);
    const b = await foto("luz-sin");
    await pag.evaluate((FENIX) => window.probe.arco.luzDeEstallido(FENIX, true), FENIX);
    await esperar(200);
    const c = await foto("luz-con2");
    await pag.evaluate((FENIX) => window.probe.arco.esconderEstallido(FENIX, false), FENIX);
    const suma = (p, i) => p.rgba[i] + p.rgba[i + 1] + p.rgba[i + 2];
    let n = 0, claros = 0, rojos = 0;
    for (let i = 0; i < a.rgba.length; i += 4) {
      const ab = Math.abs(suma(a, i) - suma(b, i)), bc = Math.abs(suma(b, i) - suma(c, i)), ac = Math.abs(suma(a, i) - suma(c, i));
      if (ab > 18 && bc > 18 && ac <= 9) {
        n++;
        if (suma(a, i) > suma(b, i)) claros++;
        // Naranja: lo que añade tiene más rojo que azul.
        if (a.rgba[i] - b.rgba[i] > a.rgba[i + 2] - b.rgba[i + 2]) rojos++;
      }
    }
    luz = { n, claros: n ? claros / n : NaN, rojos: n ? rojos / n : NaN };
  }
  await pag.evaluate(() => window.probe.vista.esconder("arma", false));
  console.log(`  la luz: ${luz.n} píxeles se van y vuelven al apagarla, ${pct(luz.claros)} más claros con ella, ${pct(luz.rojos)} tirando a rojo`);
  control("LA LUZ ALUMBRA: al apagarla se oscurecen y vuelven más de 2 000 píxeles, más claros y más rojos que azules",
    luz.n > 2000 && luz.claros > 0.95 && luz.rojos > 0.9, `${luz.n} píxeles, ${pct(luz.claros)} más claros, ${pct(luz.rojos)} tirando a rojo`);
  console.log(`  ventana ${rect ? `${(rect.x1 - rect.x0).toFixed(0)}×${(rect.y1 - rect.y0).toFixed(0)} px, ${rect.vertices} de ${rect.total} vértices en pantalla` : "—"}; ` +
    `onBeforeRender ${dibujos}; píxeles ${m ? `${pct(m.dentro)} de su ventana (${m.cambian}), ${pct(m.masClaro)} más claros` : "—"}`);
  control("Three la DIBUJA: `onBeforeRender` en cada cuadro, colgada de la escena que pinta el bucle",
    dibujos >= 3 && rect?.enLaEscena === true, `${dibujos} en 3 cuadros, en la escena ${rect?.enLaEscena}`);
  control("SE VE: al esconder su nodo se apagan y vuelven más de 500 píxeles de su ventana",
    Boolean(m) && m.cambian > 500, m ? `${m.cambian} píxeles, ${pct(m.dentro)} de una ventana del ${pct(m.area)}` : "sin vértices en pantalla");
  control("y lo que cambia es MÁS CLARO con ella (se suma, no tapa): más del 90 %",
    Boolean(m) && m.masClaro > 0.9, m ? pct(m.masClaro) : "—");

  // 2c. SE APAGA SOLA. La opacidad se lee del material; el reloj es el del bucle.
  await pag.evaluate((FENIX) => window.probe.arco.congelarEstallido(FENIX, false), FENIX);
  await esperar(900);
  const medio = ((await pag.evaluate(() => window.probe.arco.estallidos()))[FENIX]?.vivos ?? [])[0] ?? null;
  control("suelta el reloj, a media vida se ha DESVANECIDO a medias: opacidad = 1 − t/2 con su propio t",
    Boolean(medio) && medio.t > 0.3 && medio.t < 1.9 && Math.abs(medio.opacidad - (1 - medio.t / 2)) < 1e-6 && medio.opacidad < 0.9,
    medio ? `t ${medio.t.toFixed(2)} s, opacidad ${medio.opacidad.toFixed(3)}` : "ya no hay");
  await esperar(2200);
  const fin = (await pag.evaluate(() => window.probe.arco.estallidos()))[FENIX];
  control("y a los dos segundos NO QUEDA ninguna viva (ni su luz)", (fin?.vivos?.length ?? -1) === 0, `${fin?.vivos?.length} vivas`);

  // 2d. EL SONIDO DEL FÉNIX.
  const s2 = await sonido();
  const nuevas = s2.ultimas.slice(antes.total);
  console.log(`  sonaron: ${nuevas.map((u) => `${u.archivo.replace("snd/", "")}@${u.volumen}`).join(", ") || "nada"}`);
  console.log(`  la red: ${JSON.stringify([GRITO, VAPOR].map((a) => pedido(a)[0] ?? `${a}: no pedido`))}`);
  const grito = sonadas(s2, GRITO), vapor = sonadas(s2, VAPOR);
  control(`EL GRITO (\`${GRITO}\`) se pidió a la red y contestó 200 con audio`, pedido(GRITO).some(audioBueno), JSON.stringify(pedido(GRITO)[0] ?? "no pedido"));
  control("EL GRITO SONÓ: una fuente arrancada por tiro del Fénix, a volumen 0,5 y con sitio",
    grito.length - antes.grito >= 1 && grito.at(-1)?.volumen === 0.5 && Array.isArray(grito.at(-1)?.donde),
    `${grito.length - antes.grito} nuevas en ${t2.rumbo + 1} tiros, volumen ${grito.at(-1)?.volumen}`);
  control("la cuerda también, una por tiro (`SOUND_SHOOT`, bows_firebird.script:12)",
    sonadas(s2, CUERDA).length - antes.cuerda === t2.rumbo + 1, `${sonadas(s2, CUERDA).length - antes.cuerda} en ${t2.rumbo + 1} tiros`);
  control(`EL VAPOR (\`${VAPOR}\`) se pidió a la red y contestó 200 con audio`, pedido(VAPOR).some(audioBueno), JSON.stringify(pedido(VAPOR)[0] ?? "no pedido"));
  // Dónde: el `FX_CENTER`, sin subir, en METROS.
  const dv = vapor.at(-1)?.donde && ex ? Math.hypot(...[0, 1, 2].map((k) => vapor.at(-1).donde[k] - ex.centro[k] / U)) : NaN;
  control("EL VAPOR SONÓ en el centro de la explosión (a menos de 1 cm, en metros) y a volumen 0,5",
    vapor.length - antes.vapor >= 1 && vapor.at(-1)?.volumen === 0.5 && dv < 0.01, `${vapor.length - antes.vapor} nuevas, a ${dv.toFixed(4)} m`);
  const malos = s2.fallos.filter((f) => /weapons\/bow|hawkcaw|steamburst/.test(f));
  control("`Audio.fallos` no apunta ninguno de los del arco como «no está»", malos.length === 0, malos.join(" | ").slice(0, 200) || `${s2.fallos.length} fallos, ninguno del arco`);

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
