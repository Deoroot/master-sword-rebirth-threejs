// LAS ARMAS QUE NO SON DE PARTIDA — experimento 96.
//
//   npm run sonda:armas96
//
// Hasta el 96 se horneaban ocho armas, y `empunar` convertía cualquier otra en
// los PUÑOS sin decir nada: un personaje con una Novablade en la mano pegaba,
// se veía y sonaba como `fist_bare`. Medido antes de tocar nada (doc/ARMAS_96.md).
//
// Esto recorre lo que recorre un jugador con un arma nueva:
//
//   1. el catálogo la conoce                          (el horneado)
//   2. el ciclador la ofrece y aceptarla la empuña    (tecla 1 + clic, `cumplir`)
//   3. su modelo se VE en primera persona             (píxeles en una ventana)
//   4. un golpe a un bicho le quita el daño de ESA arma
//   5. soltarla la deja en el suelo, con su modelo, y se puede volver a coger
//
// con DOS armas que no son de partida, de dos archivos distintos: la Novablade
// (`v_2hswords`) y la Ice Blade (`v_1hswordssb`, uno de los dos archivos que se
// hornean sin el oráculo de la caja — así que esto es también el ojo que mira
// si esa exención dibuja un arma o un amasijo).
//
// EL ATAJO, DICHO: las dos armas se meten en la mochila con
// `probe.misiones.dar`, que es lo que hace el juego al matar a quien la lleva o
// al comprarla, y en Gate City no hay quien la venda ni quien la suelte. TODO lo
// de después —ofrecerla, empuñarla, pegar, soltarla, cogerla— va por las mismas
// funciones que las teclas.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { leerPng } from "../tools/png.mjs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5296;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matarDev = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
// EL 98: esta sonda NO cortaba el HMR, y en el 98 —seis sesiones guardando en
// el mismo árbol— dio 11 de 26 dos veces: ningún módulo del juego acepta HMR,
// así que un guardado en `src/` RECARGA la página y la sonda se queda en el
// menú a media pasada (`navegaciones` enseñaba dos y tres cargas). Lo corta ya
// para todas `sondas/vite.sondas.mjs` (`hmr: false`), que usa `arrancarVite`;
// abajo queda un control que lo dice con nombre si algo vuelve a recargar.
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
const avisos = [];
const navegaciones = [];
pag.on("framenavigated", (f) => { if (f === pag.mainFrame()) navegaciones.push(f.url()); });
pag.on("console", (m) => { if (m.type() === "warning" && /empuñar|suelo/.test(m.text())) avisos.push(m.text().slice(0, 200)); });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien: Boolean(bien), detalle });
mkdirSync("build/gatecity/vistas", { recursive: true });

const NOVA = "swords_novablade12";
const HIELO = "swords_iceblade";

// UN «X DE Y» QUE NO PUEDE BAJAR NO SIRVE (el 65): si algo de aquí abajo lanza,
// la caída es un rojo con nombre, no una nota al pie.
try {
  await entrarPorElMenu(pag, PORT);
  // SIN ARMA DE PARTIDA, y no por gusto: la primera versión creaba el
  // personaje con la espada oxidada y destapó un fallo de OTRA pieza. El
  // personaje nuevo lleva el arma en la mano Y en `objetos`
  // (src/juego/personaje.js:91-92), y `cumplir` la vuelve a meter en la mochila
  // al cambiar de arma: dos `swords_rsword`. El ciclador recorre por id, así
  // que con dos iguales delante no pasa nunca de la segunda y la tercera arma
  // es inalcanzable. Está en doc/ARMAS_96.md como hallazgo; esta sonda mide las
  // armas, no eso, y por eso elige de partida el HECHIZO de la lista: también
  // se duplica, pero no tiene ataques y el ciclador de armas no lo ofrece
  // (`soloArmas`), así que no tapa a nadie.
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "magic_hand_lightning_weak"));
  const t0 = Date.now();
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});

  // ── 1. EL CATÁLOGO ───────────────────────────────────────────────────────
  const cat = await pag.evaluate(() => window.probe.golpe.catalogo());
  console.log(`  catálogo de armas: ${cat.length}`);
  control("el catálogo trae más que las ocho de partida", cat.length > 8, `${cat.length}`);
  control("y trae las dos que se van a empuñar", cat.includes("swords_novablade12") && cat.includes("swords_iceblade"),
    `${cat.includes("swords_novablade12")} / ${cat.includes("swords_iceblade")}`);

  // ── 2. A LA MOCHILA (el atajo declarado) Y DEL CICLADOR A LA MANO ────────
  await pag.evaluate(([a, b]) => { window.probe.misiones.dar(a); window.probe.misiones.dar(b); }, [NOVA, HIELO]);

  /**
   * Cicla con la tecla 1 hasta que la etiqueta ofrezca `id` y acepta con el
   * botón de atacar. Si el navegador no da el puntero (el clic de aceptar exige
   * `pointerLockElement`), usa las MISMAS dos funciones que las teclas —`ciclar`
   * y `confirmarCiclador`— y lo dice.
   */
  async function empunarPorElCiclador(id) {
    // El clic sólo si no hay puntero ya: un clic de más cae donde caiga.
    if (!(await pag.evaluate(() => Boolean(document.pointerLockElement)))) {
      await pag.mouse.click(600, 400);
      await pag.waitForTimeout(200);
    }
    const conPuntero = await pag.evaluate(() => Boolean(document.pointerLockElement));
    let ofrecida = null;
    const vistas = [];
    for (let k = 0; k < 8 && ofrecida !== id; k++) {
      if (conPuntero) { await pag.keyboard.press("Digit1"); await pag.waitForTimeout(60); }
      else await pag.evaluate(() => window.probe.ranuras.ciclar("weapon"));
      ofrecida = await pag.evaluate(() => window.probe.ranuras.estado().etiqueta?.id ?? null);
      vistas.push(ofrecida);
    }
    if (ofrecida !== id) {
      const bolsa = await pag.evaluate(() => window.probe.misiones.bolsa());
      vistas.push(`(mochila: ${bolsa.objetos.join(", ")}; mano ${bolsa.manos.derecha})`);
      return { conPuntero, ofrecida, aceptada: false, vistas };
    }
    if (conPuntero) { await pag.mouse.down(); await pag.waitForTimeout(50); await pag.mouse.up(); }
    else await pag.evaluate(() => window.probe.ranuras.confirmar());
    await pag.waitForFunction((i) => window.probe.golpe.estado.arma === i && window.probe.golpe.estado.triangulos > 0,
      id, { timeout: 60000 }).catch(() => {});
    // Y a que acabe de sacarla: la secuencia de `sacar` mueve el filo, y la
    // ventana de píxeles se mide con el arma quieta.
    await pag.waitForTimeout(2500);
    return { conPuntero, ofrecida, aceptada: true, vistas };
  }

  const viaNova = await empunarPorElCiclador(NOVA);
  const eNova = await pag.evaluate(() => ({ ...window.probe.golpe.estado, mano: window.probe.ranuras.estado().enMano,
    sinFicha: window.probe.golpe.estado.armasSinFicha ?? null }));
  console.log(`  ciclador: ofrecida ${viaNova.ofrecida}, ${viaNova.conPuntero ? "tecla 1 + clic" : "ciclar/confirmar (sin puntero)"}`);
  console.log(`  en la mano: ${eNova.arma} (${eNova.nombre}), ${eNova.ataques} ataques, ${eNova.modelo}, ${eNova.triangulos} tri, '${eNova.animacion}'`);
  control("el ciclador ofrece la Novablade", viaNova.ofrecida === NOVA, `${viaNova.ofrecida}`);
  control("aceptarla la pone en la mano del personaje", eNova.mano === NOVA, `${eNova.mano}`);
  control("y el BRAZO es el de la Novablade, no los puños", eNova.arma === NOVA, `${eNova.arma}`);
  control("con sus cuatro ataques", eNova.ataques === 4, `${eNova.ataques}`);
  control("y su modelo de vista, el de las espadas a dos manos", eNova.modelo === "viewmodels/v_2hswords" && eNova.triangulos > 0,
    `${eNova.modelo}, ${eNova.triangulos} tri`);

  // ── 3. SE VE: PÍXELES EN UNA VENTANA ALREDEDOR DEL ARMA ──────────────────
  //
  // El 78: en pantalla entera el mundo se come la señal. Se mira al SUELO a
  // dos pasos —quieto, sin NPC cruzando— y la ventana es el rectángulo que
  // ocupan los vértices del modelo YA DEFORMADOS por el esqueleto
  // (`probe.vista.rectangulo`).
  //
  // La primera versión comparaba Novablade contra Ice Blade con tres segundos
  // de por medio, y el «fuera» (la esquina de arriba) salía MÁS alto que la
  // señal: en esos tres segundos el HUD había sacado el cartel del mapa
  // («Gatecity — This Dwarven capital...»). Medía el HUD. Así que ahora el
  // contraste es EN EL MISMO INSTANTE: con el arma, sin el arma (sólo
  // `visible` del nodo) y otra vez con ella. Señal = con/sin dentro de la
  // ventana; ruido = con/con dentro de la ventana; y fuera = con/sin fuera de
  // ella, que tiene que ser casi cero: lo único que se ha quitado es el arma.
  async function plantar() {
    await pag.evaluate(() => {
      const s = window.probe.sesion.aparicion().nacimiento.escena;
      window.probe.mundo.poner(s[0], s[1], s[2]);
      window.probe.mundo.mirar(s[0], s[1] - 1.5, s[2] - 2);
    });
    await pag.waitForTimeout(400);
    // EL 100: QUIETO DE VERDAD, no «400 ms después». Medido: tras `poner` el
    // jugador a veces seguía moviéndose 0,15 u durante las fotos, y en esta
    // sala (texturas de mucho grano) 0,3 u de cámara dan un 17 % «fuera» y
    // 1 u un 33 %. Se espera a que los pies no se muevan en cinco lecturas
    // seguidas; si no se paran en 5 s se sigue y lo dice el control de la
    // cámara de abajo, con su nombre.
    await pag.evaluate(async () => {
      let antes = null, quietas = 0;
      for (let k = 0; k < 50 && quietas < 5; k++) {
        await new Promise((res) => setTimeout(res, 100));
        const f = [...window.probe.player.feet];
        quietas = antes && Math.hypot(f[0] - antes[0], f[1] - antes[1], f[2] - antes[2]) < 1e-4 ? quietas + 1 : 0;
        antes = f;
      }
    });
  }
  async function foto(nombre) {
    await pag.waitForTimeout(120);
    const ruta = `build/gatecity/vistas/armas96-${nombre}.png`;
    await pag.screenshot({ path: ruta });
    return leerPng(ruta);
  }
  /**
   * Fracción de píxeles que se APAGAN Y SE VUELVEN A ENCENDER: cambian de
   * `con` a `sin` y de `sin` a `con2`, y `con2` vuelve a ser `con`. Es lo que
   * hace un arma que se esconde y se enseña, y NO lo que hace el cartel del
   * mapa al desvanecerse (la segunda pasada leyó un 4,7 % «fuera» que era el
   * «Gatecity — This Dwarven capital...» apareciendo, a los 10 s y 13 s de
   * entrar: player_main.script:525-557, ver src/play/intro.js).
   */
  function vanYVuelven(con, sin, con2, r, { fuera = false } = {}) {
    const d = (a, b, i) => Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
    let c = 0, n = 0;
    for (let y = 0; y < con.alto; y++) {
      for (let x = 0; x < con.ancho; x++) {
        const dentro = x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
        if (dentro === fuera) continue;
        const i = (y * con.ancho + x) * 4;
        if (d(con, sin, i) > 24 && d(sin, con2, i) > 24 && d(con, con2, i) <= 24) c++;
        n++;
      }
    }
    return n ? c / n : NaN;
  }
  /** Fracción de píxeles que cambian más de 24 (de 255) dentro o fuera de `r`. */
  function cambian(a, b, r, { fuera = false } = {}) {
    // Sin píxeles que contar NO es cero: es que no se ha medido (el 4 del
    // CLAUDE.md, que aquí mordió la primera pasada: con la ventana en la
    // pantalla entera, «fuera» daba 0,0 % porque no había fuera).
    let c = 0, n = 0;
    for (let y = 0; y < a.alto; y++) {
      for (let x = 0; x < a.ancho; x++) {
        const dentro = x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1;
        if (dentro === fuera) continue;
        const i = (y * a.ancho + x) * 4;
        const d = Math.max(Math.abs(a.rgba[i] - b.rgba[i]), Math.abs(a.rgba[i + 1] - b.rgba[i + 1]), Math.abs(a.rgba[i + 2] - b.rgba[i + 2]));
        if (d > 24) c++;
        n++;
      }
    }
    return n ? c / n : NaN;
  }
  async function seVe(nombre) {
    // EL CARTEL DEL MAPA sale a los 10 s y a los 13 s de entrar
    // (player_main.script:525-557) y se desvanece después: con él a medias, lo
    // de fuera de la ventana cambia solo. Se mide pasado.
    const falta = 40000 - (Date.now() - t0);
    if (falta > 0) await pag.waitForTimeout(falta);
    await plantar();
    // La ventana es la UNIÓN de ocho tomas en 1,2 s: el arma respira (la
    // Novablade mueve un 37 % de su ventana en 0,2 s) y una sola toma deja el
    // filo fuera en la foto de después — la tercera pasada leyó un 4 % «fuera».
    const r = await pag.evaluate(async () => {
      let u = null;
      for (let k = 0; k < 8; k++) {
        const q = window.probe.vista.rectangulo("arma");
        if (q) u = u ? { ...u, x0: Math.min(u.x0, q.x0), y0: Math.min(u.y0, q.y0), x1: Math.max(u.x1, q.x1), y1: Math.max(u.y1, q.y1) } : q;
        await new Promise((res) => setTimeout(res, 150));
      }
      return u;
    });
    if (!r) return { r: null };
    // EL 98: LA VENTANA SE TOMA TAMBIÉN EN EL INSTANTE DE CADA FOTO. Las ocho
    // tomas de arriba son ANTES de las fotos, y las fotos caen en tiempo real:
    // con la CPU compartida, cada `screenshot` tarda lo que tarde y el `idle`
    // de la Novablade sigue andando. Si en ese rato el filo pasa por una fase
    // que las ocho tomas no vieron, sale de la ventana ensanchada y se cuenta
    // «fuera» (el 32/33 del 97, «5 % fuera»). Se rodea cada foto con dos
    // lecturas del rectángulo y se une todo: la ventana es donde ESTUVO el arma
    // mientras se fotografiaba, no donde estuvo un segundo antes. `exceso` dice
    // cuántos píxeles añadieron esas lecturas, que es la medida de la hipótesis.
    const leer = () => pag.evaluate(() => window.probe.vista.rectangulo("arma"));
    // EL 100: la cámara, leída antes de la primera foto y después de la última.
    // «Fuera» supone que lo ÚNICO que cambia entre `con` y `sin` es el arma; si
    // la cámara se mueve una fracción de unidad, cambia la sala entera y el
    // rojo acusaría al arma. Ver doc/ROJOS_100.md.
    const pose = () => pag.evaluate(() => {
      const c = window.probe.camera;
      c.updateMatrixWorld();
      return { p: c.getWorldPosition(c.position.clone()).toArray(), q: c.getWorldQuaternion(c.quaternion.clone()).toArray() };
    });
    const U = await pag.evaluate(() => window.probe.level.unitsPerMetre);
    const pose0 = await pose();
    const unir = (a, b) => (b ? { ...a, x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : a);
    let u = r;
    u = unir(u, await leer());
    const con1 = await foto(`${nombre}-con`);
    u = unir(u, await leer());
    await pag.evaluate(() => window.probe.vista.esconder("arma", true));
    const sin = await foto(`${nombre}-sin`);
    await pag.evaluate(() => window.probe.vista.esconder("arma", false));
    u = unir(u, await leer());
    const con2 = await foto(`${nombre}-con2`);
    u = unir(u, await leer());
    const pose1 = await pose();
    const camMovida = Math.hypot(...pose1.p.map((x, i) => x - pose0.p[i])) * U;
    const camGirada = 2 * Math.acos(Math.min(1, Math.abs(pose1.q.reduce((a, x, i) => a + x * pose0.q[i], 0)))) * 180 / Math.PI;
    const exceso = Math.round(Math.max(0, r.x0 - u.x0) + Math.max(0, r.y0 - u.y0) + Math.max(0, u.x1 - r.x1) + Math.max(0, u.y1 - r.y1));
    const v = { x0: Math.max(0, Math.floor(u.x0)), y0: Math.max(0, Math.floor(u.y0)),
      x1: Math.min(u.ancho, Math.ceil(u.x1)), y1: Math.min(u.alto, Math.ceil(u.y1)) };
    const mx = 0.1 * (v.x1 - v.x0), my = 0.1 * (v.y1 - v.y0);
    const ancha = { x0: v.x0 - mx, y0: v.y0 - my, x1: v.x1 + mx, y1: v.y1 + my };
    // Y lo de antes, con la ventana de las ocho tomas sola, para poder comparar
    // en cada pasada qué habría dado el control viejo.
    const v8 = { x0: Math.max(0, Math.floor(r.x0)), y0: Math.max(0, Math.floor(r.y0)),
      x1: Math.min(r.ancho, Math.ceil(r.x1)), y1: Math.min(r.alto, Math.ceil(r.y1)) };
    const m8x = 0.1 * (v8.x1 - v8.x0), m8y = 0.1 * (v8.y1 - v8.y0);
    const ancha8 = { x0: v8.x0 - m8x, y0: v8.y0 - m8y, x1: v8.x1 + m8x, y1: v8.y1 + m8y };
    return {
      camMovida, camGirada,
      exceso, fuera8: cambian(con1, sin, ancha8, { fuera: true }),
      r: v, area: ((v.x1 - v.x0) * (v.y1 - v.y0)) / (r.ancho * r.alto),
      // `con/sin` dentro y fuera, y `sin/con2` dentro: que vuelva al enseñarla.
      // (Se probó «van y vuelven» exigiendo `con ≈ con2`, y con la Novablade
      // daba 4 %: su `idle` mueve el filo y en 0,2 s media ventana cambia sola.)
      senal: cambian(con1, sin, v), vuelve: cambian(sin, con2, v), ruido: cambian(con1, con2, v),
      fuera: cambian(con1, sin, ancha, { fuera: true }), vanYVuelven: vanYVuelven(con1, sin, con2, v),
    };
  }
  for (const [id, nombre, cuando] of [[NOVA, "Novablade", "nova"], [HIELO, "Ice Blade", "hielo"]]) {
    if (id === HIELO) {
      const via = await empunarPorElCiclador(HIELO);
      const e = await pag.evaluate(() => window.probe.golpe.estado);
      console.log(`  ciclador: ofrecida ${via.ofrecida}; en la mano ${e.arma}, ${e.modelo}, ${e.triangulos} tri`);
      control("la segunda, la Ice Blade, también se empuña", e.arma === HIELO && e.triangulos > 0, `${e.arma}, ${e.modelo}`);
      control("y con su modelo, que es OTRO archivo", e.modelo === "viewmodels/v_1hswordssb", `${e.modelo}`);
    }
    const m = await seVe(cuando);
    const pct = (x) => `${(x * 100).toFixed(1)} %`;
    console.log(`  ${nombre}: ventana ${m.r ? `${m.r.x0},${m.r.y0} — ${m.r.x1},${m.r.y1} (${pct(m.area)} de la pantalla)` : "ninguna"}; ` +
      `con/sin ${m.r ? pct(m.senal) : "—"}, sin/con ${m.r ? pct(m.vuelve) : "—"}, fuera ${m.r ? pct(m.fuera) : "—"}; ` +
      `con/con ${m.r ? pct(m.ruido) : "—"} (el arma respira), van y vuelven ${m.r ? pct(m.vanYVuelven) : "—"}` +
      (m.r ? `; las fotos ensancharon la ventana ${m.exceso} px (fuera con la ventana vieja: ${pct(m.fuera8)})` : ""));
    control(`la ${nombre} cae en pantalla y no la llena`, Boolean(m.r) && m.area > 0.005 && m.area < 0.9,
      m.r ? pct(m.area) : "sin rectángulo");
    if (m.r) {
      // El «con/con» NO es ruido del mundo: es el arma respirando (su `idle`
      // mueve el filo, y la Novablade ocupa media pantalla). Se enseña y no
      // se usa de listón. El listón es el contraste dentro/fuera EN EL MISMO
      // par de fotos: lo único quitado es el arma, así que fuera no puede
      // cambiar y dentro sí.
      control(`y SE VE: al esconderla cambia su ventana (> 10 %)`, m.senal > 0.10, pct(m.senal));
      control(`y al enseñarla vuelve a cambiar (> 10 %)`, m.vuelve > 0.10, pct(m.vuelve));
      // «Fuera» es fuera de la ventana ENSANCHADA un 10 % por lado: la ventana se
      // toma un instante antes de las fotos y la Novablade respira tanto
      // (con/con 64 %) que el filo se salía de ella y daba un 1,4 % «fuera».
      // EL 100: la condición de la de abajo, con su nombre. Con la cámara
      // movida 0,3 u la de abajo da un 17 % «fuera» y acusaría al arma; así el
      // rojo dice qué se movió. No es un listón más blando: las dos tienen que
      // estar en verde.
      control(`y la cámara no se mueve mientras se la fotografía (< 0,05 u, < 0,01°)`,
        m.camMovida < 0.05 && m.camGirada < 0.01, `${m.camMovida.toFixed(3)} u, ${m.camGirada.toFixed(4)}°`);
      control(`y lo que cambia es ella: fuera de su ventana < 1 % y < 1/10 de dentro`,
        Number.isFinite(m.fuera) && m.fuera < 0.01 && m.fuera < m.senal / 10, pct(m.fuera));
    }
  }

  // ── 4. UN GOLPE QUITA EL DAÑO DE ESA ARMA ───────────────────────────────
  //
  // `danoDelGolpe`: (dano + d(rango)) × potencia/100, × 1,5 si crítico. Con la
  // potencia de un personaje nuevo, cada arma tiene su horquilla, y las tres
  // horquillas se tocan poco:
  //
  //     espada oxidada   90 + d50    0,90 – 2,10
  //     Novablade       200 + d140   2,00 – 5,10
  //     Ice Blade       315 + d10    3,15 – 4,88
  //
  // Se dan varios mandobles de uno en uno y se mira CADA golpe que entra (un
  // bicho puede parar, y entonces son cero: no cuenta, pero se dice).
  async function golpes(id, veces = 8) {
    return pag.evaluate(({ id, veces }) => {
      const c = window.probe.ia.censo();
      const h = c.lista.filter((b) => b.hostil);
      let donde = null;
      for (let n = 0; n < h.length && !donde; n++) {
        if (window.probe.golpe.victima(n)?.muerto) continue;
        for (const d of [0.8, 1.0, 0.6]) {
          for (let k = 0; k < 8 && !donde; k++) {
            const a = (k * Math.PI) / 4;
            const p = window.probe.ia.irA(n, d, a);
            if (!p) continue;
            window.probe.mundo.mirar(p[0], p[1] + 0.8, p[2]);
            if (window.probe.golpe.objetivo()) donde = { n, d, a };
          }
          if (donde) break;
        }
      }
      if (!donde) return { donde: null };
      const out = [];
      for (let k = 0; k < veces; k++) {
        const p = window.probe.ia.irA(donde.n, donde.d, donde.a);
        if (p) window.probe.mundo.mirar(p[0], p[1] + 0.8, p[2]);
        const antes = window.probe.golpe.victima(donde.n);
        if (antes.muerto) break;
        const potencia = window.probe.golpe.estado.potencia;
        const r = window.probe.golpe.atacar(1.5);
        const despues = window.probe.golpe.victima(donde.n);
        // El golpe que MATA quita lo que le quedaba, no el daño del arma: se
        // apunta y se deja fuera de la horquilla (la primera pasada leyó un
        // «0,35» de la Novablade que era la vida que le quedaba al goblin).
        out.push({ quitado: antes.vida - despues.vida, potencia, golpes: r.golpes, impactos: r.impactos,
          arma: window.probe.golpe.estado.arma, remata: Boolean(despues.muerto) });
      }
      // Y el brazo, en reposo: con un mandoble a medias `CanDrop` niega la `c`
      // (`if (CurrentAttack) return false`) y el ciclador también espera.
      window.probe.golpe.soltar(1.5);
      return { donde, victima: window.probe.golpe.victima(donde.n)?.nombre, out };
    }, { id, veces });
  }
  const horquilla = (dano, rango, potencia) => [dano * potencia / 100, (dano + rango) * potencia / 100 * 1.5];
  for (const [id, dano, rango, nombre] of [[HIELO, 315, 10, "Ice Blade"]]) {
    // Primero la que está en la mano (la Ice Blade), luego la Novablade.
    const g = await golpes(id);
    const dentro = (g.out ?? []).filter((x) => x.quitado > 0 && !x.remata);
    console.log(`  ${nombre} contra ${g.victima ?? "nadie"}: ${(g.out ?? []).map((x) => x.quitado.toFixed(2)).join(" ")}`);
    control(`con la ${nombre} hay a quién pegar`, Boolean(g.donde), g.donde ? `${g.victima}` : "ningún hostil a tiro");
    control(`y la ${nombre} acierta al menos tres golpes`, dentro.length >= 3, `${dentro.length} de ${(g.out ?? []).length}`);
    const malos = dentro.filter((x) => { const [lo, hi] = horquilla(dano, rango, x.potencia); return x.quitado < lo - 1e-6 || x.quitado > hi + 1e-6; });
    control(`y CADA golpe que entra está en la horquilla de la ${nombre}`, dentro.length > 0 && malos.length === 0,
      `${malos.length} fuera de ${horquilla(dano, rango, dentro[0]?.potencia ?? 1).map((v) => v.toFixed(2)).join("–")}` +
      (malos.length ? `: ${malos.map((x) => x.quitado.toFixed(2)).join(", ")}` : ""));
    // El control que separa de la espada oxidada: su techo es 2,10.
    control(`y alguno pasa del techo de la espada oxidada (2,10)`, dentro.some((x) => x.quitado > 2.1 * x.potencia),
      `máximo ${Math.max(0, ...dentro.map((x) => x.quitado)).toFixed(2)}`);
    control(`y todos los golpes los dio la ${nombre}`, (g.out ?? []).every((x) => x.arma === id), "");
  }
  const otraVez = await empunarPorElCiclador(NOVA);
  control("y se vuelve a la Novablade por el ciclador", otraVez.aceptada && otraVez.ofrecida === NOVA,
    `ofrecida ${otraVez.ofrecida}; ${otraVez.conPuntero ? "tecla 1" : "ciclar"}: ${otraVez.vistas.join(" → ")}`);
  {
    const g = await golpes(NOVA);
    const dentro = (g.out ?? []).filter((x) => x.quitado > 0 && !x.remata);
    console.log(`  Novablade contra ${g.victima ?? "nadie"}: ${(g.out ?? []).map((x) => x.quitado.toFixed(2)).join(" ")}`);
    control("con la Novablade la víctima pierde vida", dentro.length >= 3, `${dentro.length} golpes con daño`);
    const malos = dentro.filter((x) => { const [lo, hi] = horquilla(200, 140, x.potencia); return x.quitado < lo - 1e-6 || x.quitado > hi + 1e-6; });
    control("y cada golpe está en la horquilla de la Novablade", dentro.length > 0 && malos.length === 0,
      `${malos.length} fuera${malos.length ? `: ${malos.map((x) => x.quitado.toFixed(2)).join(", ")}` : ""}`);
    control("y todos los golpes los dio la Novablade", (g.out ?? []).length > 0 && (g.out ?? []).every((x) => x.arma === NOVA),
      [...new Set((g.out ?? []).map((x) => x.arma))].join(", "));
    // El que separa de la Ice Blade: sus golpes van de 3,15 a 3,25 (o ×1,5).
    // Ocho golpes de la Novablade todos dentro de esas dos franjas son
    // (11/141)^8 de probabilidad: si pasa, es que pega otra arma.
    control("y su dado se nota: algún golpe fuera de las franjas de la Ice Blade",
      dentro.some((x) => { const q = x.quitado / x.potencia; return !((q >= 3.15 && q <= 3.25) || (q >= 4.72 && q <= 4.88)); }),
      dentro.map((x) => x.quitado.toFixed(2)).join(" "));
  }

  // ── 5. AL SUELO Y DE VUELTA ─────────────────────────────────────────────
  //
  // Antes del 96, `tools/suelo.mjs` no conocía la Novablade y `Suelo.tirar`
  // devolvía `null`: la `c` no hacía nada y el arma se quedaba en la mano.
  //
  // Y ANTES, VIVO: la primera pasada que llegó aquí soltó el arma y no encontró
  // ni el nodo ni el objeto al ir a cogerlo. Los goblins de la pelea de arriba
  // siguen pegando mientras la sonda da sus mandobles a paso fijo, y con 15 de
  // vida el personaje estaba MUERTO: el bucle no mueve lo que un muerto suelta.
  // Si lo está, reaparece por la misma puerta que el jugador, y se dice.
  const vivo = await pag.evaluate(async () => {
    const antes = window.probe.sesion.estado();
    if (antes === "muriendo" || antes === "muerto") await window.probe.sesion.reaparecer();
    return { antes, ahora: window.probe.sesion.estado() };
  });
  console.log(`  antes de soltar: ${vivo.antes}${vivo.antes !== vivo.ahora ? ` -> reaparece, ${vivo.ahora}` : ""}`);
  await plantar();
  const suelto = await pag.evaluate(() => window.probe.mundo.soltar());
  const tras = await pag.evaluate(() => ({ mano: window.probe.mundo.loQueLlevaLaMano(),
    suelo: window.probe.mundo.suelo().map((o) => ({ i: o.i, guion: o.guion })), perezosas: window.probe.mundo.perezosasDelSuelo() }));
  const enElSuelo = tras.suelo.find((o) => o.guion === NOVA);
  console.log(`  soltar: mano ${tras.mano}, en el suelo ${tras.suelo.map((o) => o.guion).join(", ")}; perezosas ${JSON.stringify(tras.perezosas)}`);
  control("la c suelta la Novablade: sale de la mano", tras.mano === null, `${tras.mano}`);
  control("y está en el suelo", Boolean(enElSuelo), enElSuelo ? `i=${enElSuelo.i}` : "no");
  control("y su modelo NO estaba cargado al entrar (es perezoso)", (tras.perezosas?.perezosas ?? 0) > 100,
    `${tras.perezosas?.perezosas} perezosas`);
  const llego = await pag.evaluate((g) => window.probe.mundo.esperarModeloDelSuelo(g), NOVA);
  await pag.waitForTimeout(1500);
  const nodos = await pag.evaluate(() => window.probe.mundo.nodosDelSuelo());
  const nodo = enElSuelo ? nodos.find((n) => n.i === enElSuelo.i) : null;
  control("y al caer se carga y se dibuja: hay NODO en la escena", Boolean(llego) && Boolean(nodo),
    nodo ? `${nodo.guion} en ${nodo.posicion.map((v) => v.toFixed(2)).join(", ")}` : `llegó ${llego}, sin nodo`);
  if (enElSuelo) {
    await pag.evaluate((i) => window.probe.mundo.irAlObjeto(i, 0.6), enElSuelo.i);
    await pag.waitForTimeout(300);
    const cogido = await pag.evaluate(() => window.probe.mundo.coger());
    const bolsa = await pag.evaluate(() => window.probe.misiones.bolsa());
    control("y con la x se vuelve a coger, a la mochila", bolsa.objetos.some((o) => o.startsWith(NOVA)),
      `${cogido?.objeto?.guion ?? "nada"}; mochila: ${bolsa.objetos.join(", ")}`);
  }

  const sinFicha = await pag.evaluate(() => window.probe.golpe.estado.armasSinFicha);
  control("ningún empuñar ha caído a los puños por no conocer el arma", sinFicha === 0, `${sinFicha}`);
} catch (e) {
  control("la sonda llega al final sin caerse", false, String(e?.message ?? e).slice(0, 200));
}
// EL 98: una recarga a media pasada no es un fallo del juego, y sin nombre se
// leía como once rojos de armas. Con el HMR cortado no debería pasar; si pasa
// (otra cosa recarga), que sea UN rojo que diga qué.
if (navegaciones.length > 1) control("la página no se recargó a media pasada", false, `${navegaciones.length} cargas`);

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(64)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
if (navegaciones.length > 1) console.log(`  navegaciones: ${navegaciones.join(" -> ")}`);
if (avisos.length) console.log(`  avisos: ${avisos.join(" | ")}`);
await nav.close(); matarDev(dev);
process.exit(mal.length || errores.length ? 1 : 0);
