// `createnpc`, EN EL JUEGO: el lanzamiento de la Blood Drinker y un segundo caso.
//
//   npm run sonda:createnpc
//
// Se entra por el menú (§3), con un personaje nuevo, en Gate City y SIN servidor.
//
//   A. EL SEGUNDO CASO primero, porque el primero lo necesita: un guion NUESTRO
//      (`contenido/scripts/pruebas/oleada.script`, leído aquí del disco y
//      partido por el analizador del juego) crea con `createnpc` a un vecino
//      —el herrero de Gate City— delante del jugador. Se mide que es una
//      instancia más de la manada, en el punto pedido, con cilindro, nodo, guion
//      y sus parámetros. Y los dos negativos: un guion sin hornear y un
//      `createnpc` sin origen no crean nada.
//   B. LA BLOOD DRINKER (items/swords_blood_drinker.script), apuntando a ese
//      vecino. Se pone en la mano por donde la pone el juego (`cumplir`), se
//      carga la segunda barra y se suelta por `pasoDelBrazo`. Se mide:
//        - que su invocación está horneada A PETICIÓN y llega al empuñarla;
//        - que al soltar hay UNA instancia nueva, con su guion y su nodo, en el
//          centro del jugador, y que recibió de objetivo al vecino;
//        - que la mano se queda VACÍA mientras la invocación existe —también
//          pasados los 0,2 s del ataque, que era cuando volvía el andamio—;
//        - que la espada vuelve cuando lo dice el guion: a los `spellcasting/2`
//          segundos (`callevent BLADE_DURATION return_to_owner`), y entonces la
//          invocación se borra;
//        - que cobra el maná de su ficha, y que sin maná no sale.
//   C. SIN APUNTAR A NADIE la invocación sí se mueve (`setvelocity`, 100 u/s),
//      y la espada vuelve cuando el dueño la tiene a menos de 72 unidades.
//   D. CON UN ENEMIGO DENTRO DE SU CAJA —un goblin creado por el mismo guion
//      nuestro— le pega (`game_touch` -> `xdodamage`), a nombre del jugador.
//
// POR QUÉ SE APUNTA A UN VECINO EN B. La primera versión lanzaba sin mirar a
// nadie y el control de «vuelve a los 4 s» salió verde una pasada y rojo la
// siguiente CON EL TRABAJO IGUAL: sin objetivo vivo la invocación va por
// `setvelocity`, y al volver nadie le quita esa velocidad, así que vuelve o no
// según hacia dónde iba en la última décima. Es el fallo del mod (ver
// `src/play/creados.js`), no ruido de la sonda; con un objetivo vivo no hay
// velocidad que valga y la medida es la misma en cada pasada.
//
// Lo que NO mide: con servidor (no corre, a propósito) y que el modelo se VEA
// en píxeles (se mide que su nodo existe y es visible).

import { spawnSync } from "node:child_process";
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";

const PORT = 5750;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (había ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT, { tope: 180_000 });
const matar = (p) => { try { spawnSync("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

// LOS TESTIGOS DE FUERA DE LA PÁGINA: el horneado y el guion nuestro.
const ARMA = "swords_blood_drinker";
const INVOCACION = "monsters/summon/blood_drinker";
const VECINO = "gatecity/armorer";          // no pasea y es aliado: ni se va ni recibe daño
const CAT = JSON.parse(readFileSync("build/msr/armas.json", "utf8"));
const LANZAR = CAT.armas.find((a) => a.id === ARMA).ataques.find((x) => x.retorno === "throwsword");
const CENSO = JSON.parse(readFileSync("build/gatecity/bichos.json", "utf8"));
const CLAVE = CENSO.creables?.[INVOCACION]?.clave ?? null;
const OLEADA = readFileSync("contenido/scripts/pruebas/oleada.script", "latin1");
/** `spellcasting` del personaje de la sonda: el baile dura la MITAD, en segundos, y pega la mitad. */
const SPELL = 8;
const DURA = SPELL / 2;

const DECLARADOS = 32;
const controles = [];
const control = (que, bien, detalle = "") => { controles.push({ que, bien: Boolean(bien), detalle }); return bien; };
const errores = [];

const nav = await chromium.launch();
try {
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e.stack ?? e).slice(0, 400)));
  pag.on("console", (m) => { if (/createnpc: el modelo|el arma no se ha podido montar/.test(m.text())) errores.push(m.text().slice(0, 300)); });
  await entrarPorElMenu(pag, PORT);
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda"));
  await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 }).catch(() => {});
  await pag.evaluate((SPELL) => {
    const p = window.probe.sesion.personaje;
    const h = p.habilidades;
    h.swordsmanship ??= {};
    for (const k of ["proficiency", "balance", "power"]) { h.swordsmanship[k] ??= {}; h.swordsmanship[k].valor = 60; }
    h.spellcasting ??= {};
    for (const k of ["fire", "ice", "lightning", "divination", "affliction"]) { h.spellcasting[k] ??= {}; h.spellcasting[k].valor = SPELL; }
    p.mana = 100;
    p.vida = 500;          // de sobra: al final hay un goblin pegando
  }, SPELL);

  const estado = () => pag.evaluate(() => window.probe.creados.estado());
  const arma = () => pag.evaluate(() => window.probe.creados.arma());
  const instancia = (id) => pag.evaluate((id) => window.probe.creados.instancia(id), id);
  const lineas = (texto) => pag.evaluate((texto) =>
    (window.probe.hud.estado()?.consola?.lineas ?? []).filter((l) => String(l.texto).includes(texto)).length, texto);
  const vec = (v) => `(${v.map((x) => x.toFixed(2)).join(",")})`;
  const oleada = (evento, params) => pag.evaluate(({ texto, evento, params }) => window.probe.creados.correrGuion(texto, evento, params), { texto: OLEADA, evento, params });
  /** Mira al pecho de una instancia y carga la segunda barra y suelta, por `pasoDelBrazo`, en un solo `evaluate`. */
  const lanzarA = (id) => pag.evaluate((id) => {
    const P = window.probe;
    const g = P.creados.instancia(id);
    P.mundo.mirar(g.donde[0], g.donde[1] + 0.9, g.donde[2]);
    return P.golpe.vistaDelAtaque({ cargar: 3.0, despues: 1.0 });
  }, id);
  /** Muestrea cada 200 ms hasta que la espada vuelve a verse. */
  async function hastaQueVuelva(t0, { vueltas = 60, cadaVuelta = null } = {}) {
    const muestras = [];
    for (let k = 0; k < vueltas; k++) {
      await esperar(200);
      if (cadaVuelta) await cadaVuelta();
      const [e, a] = [await estado(), await arma()];
      muestras.push({ t: (Date.now() - t0) / 1000, creados: e.lista.length, visible: a.visible, modo: a.modo, motor: e.lista[0]?.motor ?? null });
      if (a.visible === true) return { muestras, volvioEn: muestras.at(-1).t };
    }
    return { muestras, volvioEn: null };
  }

  // ── A. EL SEGUNDO CASO: un guion nuestro crea un vecino ────────────────
  const a0 = await estado();
  control("el horneado trae la invocación como creable, con su modelo A PETICIÓN (leído del disco)",
    Boolean(CLAVE) && CENSO.modelos.some((m) => m.clave === CLAVE && m.aPeticion === true), `clave ${CLAVE}`);
  control("al entrar la manada es la del censo, sin nada creado, y el modelo de la invocación NO está cargado",
    a0.instancias === a0.censo && a0.censo === CENSO.colocados.length && a0.lista.length === 0 && !a0.modelos.includes(CLAVE),
    `${a0.instancias} instancias de ${a0.censo}, ${a0.modelos.length} modelos`);
  const p = await pag.evaluate(() => window.probe.creados.puntos(120));
  const ola = await oleada("llamar_oleada", [VECINO, vec(p.delante), "alfa"]);
  const a1 = await estado();
  console.log(`\n  la oleada: ${JSON.stringify({ hubo: ola?.hubo, ultimo: ola?.ultimo, vars: ola?.vars })}`);
  control("el guion nuestro corre desde su TEXTO y su `createnpc` crea una instancia más",
    ola?.hubo === true && a1.instancias === a0.instancias + 1 && a1.cuenta.creados === 1, `${a0.instancias} → ${a1.instancias}`);
  const idVecino = a1.instancias - 1;
  const vecino = await instancia(idVecino);
  console.log(`  el vecino: ${JSON.stringify(vecino)}`);
  control("`ent_lastcreated` es un asa, y la guarda su variable", /^PentP\(\d+,\d+\)$/.test(ola?.ultimo ?? "") && ola.vars.ULTIMA_CRIA === ola.ultimo, `${ola?.ultimo}`);
  const lejos = vecino ? Math.hypot(vecino.donde[0] - p.delanteEscena[0], vecino.donde[1] - p.delanteEscena[1], vecino.donde[2] - p.delanteEscena[2]) : NaN;
  control("es el herrero, nace en el punto pedido (a menos de 2 cm) y está en el mundo",
    vecino?.script === VECINO && lejos < 0.02 && !vecino.muerto && !vecino.dormido, `${vecino?.nombre}, a ${(lejos * 100).toFixed(2)} cm`);
  control("como los del mapa: cilindro de colisión, nodo visible y guion vivo",
    vecino?.conCilindro === true && vecino.conNodo === true && vecino.visible === true && vecino.guion === true && vecino.sinModelo === false,
    JSON.stringify({ cilindro: vecino?.conCilindro, nodo: vecino?.conNodo, visible: vecino?.visible, guion: vecino?.guion }));
  control("y lo que iba detrás del origen le llegó como parámetros: «alfa», el número y «oleada»",
    JSON.stringify(vecino?.params) === JSON.stringify(["alfa", "0", "oleada"]), JSON.stringify(vecino?.params));
  // Los dos negativos, con el positivo de arriba al lado.
  const malo = await oleada("llamar_oleada", ["monsters/no_horneado_nunca", vec(p.delante), "x"]);
  const a2 = await estado();
  control("un guion SIN HORNEAR no crea nada y se dice cuál falta", a2.instancias === a1.instancias && a2.faltan.includes("monsters/no_horneado_nunca") && malo?.ultimo === null,
    `faltan: ${a2.faltan.join(",")}`);
  const corto = await oleada("llamar_mal", [VECINO]);
  const a3 = await estado();
  control("y sin origen (un solo parámetro) tampoco: `ERROR_MISSING_PARMS`", corto?.hubo === true && a3.instancias === a2.instancias, `${a2.instancias} → ${a3.instancias}`);

  // ── B. LA BLOOD DRINKER, apuntando al vecino ───────────────────────────
  const enMano = await pag.evaluate((id) => window.probe.creados.llevar(id), ARMA);
  const conArma = await estado();
  console.log(`\n  en la mano: ${JSON.stringify(enMano)}`);
  control("la Blood Drinker en la mano, por el personaje, y su ataque corre por su GUION",
    enMano?.id === ARMA && enMano.enLaMano === ARMA && enMano.porGuion === true && enMano.visible === true, JSON.stringify(enMano));
  control("al empuñarla llega el modelo de su invocación (el `precache`)", conArma.modelos.includes(CLAVE), `${conArma.modelos.length} modelos`);

  await pag.evaluate(() => { window.probe.sesion.personaje.mana = 100; });
  const t0 = Date.now();
  const tiro = await lanzarA(idVecino);
  const trasTirar = await estado();
  const manoTrasTirar = await arma();
  const manaDespues = await pag.evaluate(() => window.probe.sesion.personaje.mana);
  const pies = await pag.evaluate(() => window.probe.creados.puntos(0).pies);
  console.log(`  el tiro: ${JSON.stringify(tiro)}`);
  console.log(`  tras soltar: ${JSON.stringify(trasTirar.lista)} · cuenta ${JSON.stringify(trasTirar.cuenta)} · mano ${JSON.stringify(manoTrasTirar)}`);
  control("soltando la segunda barra sale el ataque `throwsword`", tiro?.empezo === true && tiro.ataque?.retorno === "throwsword", JSON.stringify(tiro?.ataque ?? tiro));
  control("HAY UNA ENTIDAD NUEVA: una instancia más en la manada, y es la invocación",
    trasTirar.instancias === a3.instancias + 1 && trasTirar.lista.filter((x) => x.script === INVOCACION).length === 1 && trasTirar.cuenta.creados === 2,
    `${a3.instancias} → ${trasTirar.instancias}; ${trasTirar.lista.map((x) => x.script).join(",")}`);
  const inv = trasTirar.lista.find((x) => x.script === INVOCACION) ?? null;
  const ficha = inv ? await instancia(inv.id) : null;
  console.log(`  la invocación: ${JSON.stringify(ficha)}`);
  // `$get(ent_owner,origin)`: el centro del jugador, 36 sobre sus pies (swords_blood_drinker.script:171).
  const delCentro = inv ? Math.hypot(inv.motor[0] - pies[0], inv.motor[1] - pies[1], inv.motor[2] - (pies[2] + 36)) : NaN;
  control("nace en el centro de su dueño (a menos de 12 unidades, lo que anda en la décima de la medida)", delCentro < 12, `a ${delCentro.toFixed(1)} u`);
  control("con su guion vivo, que recibió `game_dynamically_created` con cinco parámetros, y el segundo es EL ASA DEL VECINO al que se miraba",
    ficha?.guion === true && ficha.retirado === false && ficha.creadoPorEvento.length === 1 && ficha.creadoPorEvento[0].length === 5
      && ficha.creadoPorEvento[0][1] === ola.ultimo,
    JSON.stringify(ficha?.creadoPorEvento));
  control("vuela y toca (`fly 1`, `setcallback touch enable` de su `game_spawn`), sin cilindro (`setsolid trigger`)",
    inv?.vuela === true && inv.tocar === true && ficha?.conCilindro === false, JSON.stringify({ vuela: inv?.vuela, tocar: inv?.tocar, cilindro: ficha?.conCilindro }));
  control("y con su nodo en la escena, visible", ficha?.conNodo === true && ficha.visible === true && ficha.sinModelo === false, JSON.stringify({ nodo: ficha?.conNodo, visible: ficha?.visible, sinModelo: ficha?.sinModelo }));
  control("LA MANO SE QUEDA VACÍA: el modelo de vista no se ve y su guion dice `setviewmodel none`",
    manoTrasTirar.visible === false && manoTrasTirar.vista === null && tiro.alAcabar?.visible === false,
    `visible ${manoTrasTirar.visible}, vista ${JSON.stringify(manoTrasTirar.vista)}, al acabar el ataque ${tiro.alAcabar?.visible}`);
  control(`cobra el maná de su ficha: 100 − ${LANZAR.mana} (build/msr/armas.json)`, LANZAR.mana > 0 && manaDespues === 100 - LANZAR.mana, `quedan ${manaDespues}`);

  const { muestras, volvioEn } = await hastaQueVuelva(t0);
  const mientras = muestras.filter((m) => m.creados === 2 && Number(m.modo) === 1);
  console.log(`  muestras: ${muestras.length}; con la invocación viva ${mientras.length}; vuelve a los ${volvioEn?.toFixed(2)} s (dura ${DURA} s)`);
  control("mientras la invocación existe la mano sigue vacía, también después del segundo (el andamio volvía a los 0,2 s)",
    mientras.length >= 5 && mientras.every((m) => m.visible === false) && mientras.some((m) => m.t > 1.5),
    `${mientras.length} muestras, la última a los ${mientras.at(-1)?.t.toFixed(2)} s`);
  // El reloj del juego no corre más deprisa que el de pared: no puede volver antes de la duración.
  control(`LA ESPADA VUELVE CUANDO LO DICE EL GUION: pasados los ${DURA} s de \`BLADE_DURATION\` (spellcasting ${SPELL} / 2) y no mucho después`,
    volvioEn !== null && volvioEn >= DURA - 0.3 && volvioEn < DURA + 4, `a los ${volvioEn?.toFixed(2)} s`);
  await esperar(600);
  const alFinal = await estado();
  const manoAlFinal = await arma();
  const fichaFinal = inv ? await instancia(inv.id) : null;
  control("y al volver la invocación se borra: fuera del mundo, sin dibujo y con el guion retirado",
    alFinal.lista.every((x) => x.script !== INVOCACION) && alFinal.cuenta.borrados === 1 && fichaFinal?.dormido === true && fichaFinal.visible === false && fichaFinal.retirado === true,
    JSON.stringify({ lista: alFinal.lista.length, borrados: alFinal.cuenta.borrados, dormido: fichaFinal?.dormido, visible: fichaFinal?.visible, retirado: fichaFinal?.retirado }));
  control("la mano vuelve a tener la espada y la consola dice «Blood Drinker returns.»",
    manoAlFinal.visible === true && manoAlFinal.vista !== null && Number(manoAlFinal.modo) === 0 && (await lineas("Blood Drinker returns.")) === 1,
    JSON.stringify(manoAlFinal));
  const vecinoDespues = await instancia(idVecino);
  control("al vecino, que es aliado, no le ha hecho nada (`relationship equals enemy`)", vecinoDespues?.vida === vecino?.vida && !vecinoDespues.muerto, `vida ${vecino?.vida} → ${vecinoDespues?.vida}`);

  // Sin maná: no sale nada, y el guion lo dice.
  await pag.evaluate((n) => { window.probe.sesion.personaje.mana = n; }, LANZAR.mana - 1);
  await lanzarA(idVecino);
  await esperar(300);
  const trasPobre = await estado();
  control(`con ${LANZAR.mana - 1} de maná NO sale ninguna invocación, la espada sigue en la mano y su guion dice «Insufficient mana for Blood Dance»`,
    trasPobre.cuenta.creados === 2 && (await arma()).visible === true && (await lineas("Insufficient mana for Blood Dance")) >= 1, `creados ${trasPobre.cuenta.creados}`);

  // ── C. SIN APUNTAR A NADIE: se mueve, y vuelve cuando el dueño se acerca ──
  await pag.evaluate(() => {
    const P = window.probe;
    P.sesion.personaje.mana = 100;
    const o = P.mundo.donde().ojo;
    P.mundo.mirar(o[0], o[1] + 50, o[2] + 0.01);                       // al techo: no hay bicho ahí
  });
  const t1 = Date.now();
  const tiroAlAire = await pag.evaluate(() => window.probe.golpe.vistaDelAtaque({ cargar: 3.0, despues: 1.0 }));
  const c0 = (await estado()).lista.find((x) => x.script === INVOCACION) ?? null;
  const objetivoAlAire = c0 ? (await instancia(c0.id))?.params?.[1] : null;
  await esperar(1500);
  const c1 = (await estado()).lista.find((x) => x.script === INVOCACION) ?? null;
  const andado = c0 && c1 ? Math.hypot(c1.motor[0] - c0.motor[0], c1.motor[1] - c0.motor[1], c1.motor[2] - c0.motor[2]) : NaN;
  console.log(`\n  al aire: ${tiroAlAire?.ataque?.retorno}, objetivo «${objetivoAlAire}»; en 1,5 s la invocación anda ${andado.toFixed(0)} u`);
  control("sin nadie delante el objetivo es «0» y la invocación SÍ se mueve: más de 40 u en 1,5 s (apuntando eran menos de 3)",
    objetivoAlAire === "0" && andado > 40, `objetivo ${objetivoAlAire}, ${andado.toFixed(0)} u`);
  // Y se la va a buscar: el dueño se pone donde esté la invocación, en cada vuelta.
  const busca = await hastaQueVuelva(t1, {
    vueltas: 80,
    cadaVuelta: () => pag.evaluate(() => {
      const P = window.probe;
      const i = P.creados.estado().lista.find((x) => x.script === "monsters/summon/blood_drinker");
      if (i) P.mundo.poner(i.donde[0], i.donde[1] - 0.9, i.donde[2]);
    }),
  });
  console.log(`  yendo a por ella vuelve a los ${busca.volvioEn?.toFixed(2)} s`);
  control(`y con el dueño a su lado vuelve, no antes de los ${DURA} s`, busca.volvioEn !== null && busca.volvioEn >= DURA - 0.3, `a los ${busca.volvioEn?.toFixed(2)} s`);
  await esperar(600);

  // ── D. CON UN ENEMIGO EN SU CAJA ───────────────────────────────────────
  //
  // El primer intento cargaba MIRANDO al goblin: la carga de Master Sword
  // empieza con un mandoble, el de la Blood Drinker son 425 de daño y el goblin
  // tiene 50. Moría de un espadazo antes del lanzamiento y el control leía
  // «50 → 0» con cero toques. Así que se carga de ESPALDAS y se gira para
  // soltar: todo en un `evaluate`, para que el goblin no se mueva.
  const d0 = await estado();
  const q = await pag.evaluate(() => window.probe.creados.puntos(60));
  await oleada("llamar_oleada", ["monsters/goblin", vec(q.delante), "beta"]);
  const idGoblin = (await estado()).instancias - 1;
  const hitsAntes = await lineas("Hit Goblin");
  const plan = await pag.evaluate((id) => {
    const P = window.probe;
    const U = P.mundo.unidadesPorMetro();
    const g = P.creados.instancia(id);
    P.sesion.personaje.mana = 100;
    const d = P.mundo.donde();
    let vx = d.pies[0] - g.donde[0], vz = d.pies[2] - g.donde[2];
    const L = Math.hypot(vx, vz) || 1; vx /= L; vz /= L;
    // A 36 unidades del goblin: su caja (32) solapa con la de la espada (64).
    const pies = P.mundo.poner(g.donde[0] + vx * (36 / U), g.donde[1], g.donde[2] + vz * (36 / U));
    const ojo = P.mundo.donde().ojo;
    P.mundo.mirar(ojo[0] + vx * 5, ojo[1], ojo[2] + vz * 5);          // de espaldas
    P.golpe.cargar(3.0);
    const trasCargar = P.creados.instancia(id).vida;
    P.mundo.mirar(g.donde[0], g.donde[1] + 0.9, g.donde[2]);          // y ahora, a él
    P.golpe.soltar(1.0);
    const nueva = P.creados.estado().lista.find((x) => x.script === "monsters/summon/blood_drinker") ?? null;
    return {
      script: g.script, vidaAntes: g.vida, trasCargar,
      separacion: Math.hypot(pies[0] - g.donde[0], pies[2] - g.donde[2]) * U,
      objetivo: nueva ? P.creados.instancia(nueva.id).params[1] : null,
      asaDelGoblin: P.creados.estado().lista.find((x) => x.id === id)?.asa ?? null,
    };
  }, idGoblin);
  let herido = null;
  for (let k = 0; k < 25; k++) {
    await esperar(200);
    herido = await instancia(idGoblin);
    if (herido.muerto || herido.vida <= plan.vidaAntes - 3 * DURA) break;
  }
  const d1 = await estado();
  const hitsDespues = await lineas("Hit Goblin");
  const quitado = herido ? plan.vidaAntes - Math.max(herido.vida, 0) : 0;
  console.log(`\n  con el goblin: a ${plan.separacion.toFixed(0)} u; vida ${plan.vidaAntes}, tras el mandoble de espaldas ${plan.trasCargar}; ` +
    `luego ${herido?.vida}${herido?.muerto ? " (muerto)" : ""}; toques +${d1.cuenta.toques - d0.cuenta.toques}, daños +${d1.cuenta.danos - d0.cuenta.danos}; ` +
    `«Hit Goblin» ${hitsAntes} → ${hitsDespues}; objetivo ${plan.objetivo}`);
  control("el guion nuestro crea también un GOBLIN, y el mandoble de la carga, de espaldas, no le toca: llega entero al lanzamiento",
    plan.script === "monsters/goblin" && plan.trasCargar === plan.vidaAntes && plan.vidaAntes > 0, `${plan.script}, ${plan.vidaAntes} → ${plan.trasCargar}`);
  control("soltando mirándole, la invocación lo recibe de objetivo", Boolean(plan.objetivo) && plan.objetivo === plan.asaDelGoblin, `${plan.objetivo} / ${plan.asaDelGoblin}`);
  control(`la invocación TOCA al goblin y le quita vida de ${DURA} en ${DURA} (\`xdodamage … DMG_BASE\`, la mitad de spellcasting)`,
    d1.cuenta.danos - d0.cuenta.danos >= 2 && quitado >= 2 * DURA && (quitado % DURA === 0 || herido.muerto),
    `${plan.vidaAntes} → ${herido?.vida}; toques +${d1.cuenta.toques - d0.cuenta.toques}, daños +${d1.cuenta.danos - d0.cuenta.danos}`);
  control("a nombre del jugador: la consola dice «Hit Goblin» por cada golpe", hitsDespues - hitsAntes >= 2, `${hitsAntes} → ${hitsDespues}`);

  control("sin errores de página", errores.length === 0, errores.join(" | ").slice(0, 300) || "ninguno");
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
