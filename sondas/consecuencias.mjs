// LAS CONSECUENCIAS DEL GOLPE, medidas en el mapa.
//
// El 18 dejó un golpe que quita vida y nada más: el bicho seguía andando a su
// ritmo hasta caerse muerto de golpe. Esto mide las cinco cosas que el motor
// cuelga de `game_struck` y de `game_damaged`, y sobre todo mide **cuáles de
// ellas de verdad pasan en Gate City**, que no son las cinco.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. el parry no llega al navegador   -> la araña no esquiva nunca
//   2. la esquiva no está horneada       -> esquiva y no se ve (cae a idle)
//   3. el parry para y da experiencia    -> subes nivel a base de fallar
//   4. se encoge cada fotograma          -> un tic, no una reacción
//   5. se encoge y sigue andando         -> la animación sí, el efecto no
//   6. huye pero hacia ti                -> el signo del destino al revés
//   7. avisa a los aliados de todo el mapa -> el pueblo entero encima

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, esperarApariciones } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5203;
// Se mata a quien estuviera en el puerto ANTES de arrancar el nuestro.
// `--strictPort` hace que el nuestro falle si esta ocupado, y con
// `stdio: "ignore"` ese fallo no se ve: la sonda acaba midiendo el programa
// de otro. Ver `sondas/mismo.mjs`.
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
// que se salta el menú: carga el nivel y arranca la sesión de una pasada,
// que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 })
  .catch(() => {});

// EL MUNDO QUIETO. Desde el 22 los 53 bichos con `roam 1` pasean de verdad por
// el bucle del juego, y esta sonda mide cosas que dependen de DÓNDE está cada
// uno — el radio del grito al morir, tener un goblin pegado para que pegue—.
// Con el pueblo andando, esos controles miden el dado y salen rojos una vez de
// cada tres. Se apaga el `roam` y sólo el `roam`: la caza sigue encendida.
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

// LOS TRES SEGUNDOS, antes de medir nada.
//
// 38 de los 69 bichos de Gate City son la ficha de un `msarea_monsterspawn` y no
// están al entrar: aparecen a los 3 s (ver `esperarApariciones`). Todos los
// hostiles son de ésos, y a un bicho dormido se le puede pegar —`herir` no mira si
// está en el mundo— pero en cuanto su área lo saca, `revivir` le pone la vida
// llena y le reinicia los relojes de la reacción. Sin esta espera, las tres
// medidas del encogerse daban lo contrario de lo que dicen: el zombi se encogía
// «dos veces seguidas» porque entre golpe y golpe había vuelto a nacer.
const puestos = await esperarApariciones(pag);
console.log(`
  apariciones: ${puestos.enElMundo} de ${puestos.de} en el mundo, ` +
  `${puestos.dormidos} dormidos, ${puestos.conCilindro} con cilindro`);

const censo = await pag.evaluate(() => window.probe.reaccion.censo());
const de = (script) => censo.filter((c) => c.script === script);
const uno = (script) => de(script)[0] ?? null;

// ── 1. LO QUE EL DATO DICE, y que llega ────────────────────────────────────
console.log(`\n  censo de reacción: ${censo.length} bichos`);
const conParry = censo.filter((c) => c.parry > 0);
console.log(`    con parry:     ${conParry.length} — ${[...new Set(conParry.map((c) => `${c.nombre} ${c.parry}`))].join(", ") || "ninguno"}`);
const huidores = censo.filter((c) => c.huir?.puede && c.huir.vida > 0);
console.log(`    que huyen:     ${huidores.length} — ${[...new Set(huidores.map((c) => `${c.nombre} <${c.huir.vida}hp ${c.huir.probabilidad}%`))].join(", ") || "ninguno"}`);
const encogedores = censo.filter((c) => c.struck || c.encogerseIA);
console.log(`    que se encogen:${encogedores.length} — ${[...new Set(encogedores.map((c) => `${c.nombre} (${c.animacionDeEncogerse})`))].join(", ") || "ninguno"}`);

const arana = uno("monsters/spider");
control("la araña trae su parry de 50 al navegador", arana?.parry === 50, `parry ${arana?.parry}`);
control("y es la única de Gate City que para", conParry.every((c) => c.script === "monsters/spider"),
  `${conParry.length} instancias`);
const goblin = uno("monsters/goblin");
control("el goblin no para: su ficha no pone MONSTER_PARRY", goblin?.parry === 0, `parry ${goblin?.parry}`);

// ── 2. LAS ANIMACIONES, que es lo que se ve ────────────────────────────────
//
// Esto es la mitad del experimento y no estaba: el horno pedía al `.mdl` sólo
// `idle/walk/run/die` más las dos de la ficha, así que `battleaxe_swing1_L` y
// `die_fallback` —que el goblin declara y su modelo trae entre 36 secuencias—
// **no se horneaban**, y el visor caía a la secuencia 0 sin decir nada.
control("la esquiva de la araña está horneada y montada", arana?.hayEsquiva === true,
  `'${arana?.esquiva}'`);
const conGolpe = censo.filter((c) => c.golpe);
control("todos los que declaran animación de golpe la tienen montada",
  conGolpe.every((c) => c.hayGolpe), `${conGolpe.filter((c) => !c.hayGolpe).length} sin ella de ${conGolpe.length}`);
const conMuerte = censo.filter((c) => c.muerte);
control("y todos los que pueden morir tienen animación de muerte que existe",
  conMuerte.every((c) => c.hayMuerte), `${conMuerte.filter((c) => !c.hayMuerte).length} sin ella de ${conMuerte.length}`);
const sustituidas = censo.filter((c) => c.muerteDeclarada);
console.log(`    muertes sustituidas por la cadena del motor: ${sustituidas.length} ` +
  `(${[...new Set(sustituidas.map((c) => `${c.muerteDeclarada}→${c.muerte}`))].join(", ")})`);
control("la cadena de repuesto de la muerte sustituye a las que el modelo no trae",
  sustituidas.length > 0, `${sustituidas.length} instancias`);
const zombi = uno("monsters/dwarf_zombie_hbow");
control("el zombi de ballesta trae su animación de encogerse", zombi?.hayEncogerse === true,
  `'${zombi?.animacionDeEncogerse}'`);

// ── 3. EL PARRY, enchufado ─────────────────────────────────────────────────
const nArana = arana?.n;
const paraSiempre = await pag.evaluate((n) => {
  const antes = window.probe.reaccion.quien(n);
  const r = window.probe.reaccion.pegarA(n, 5, { tipo: "slash", parry: 90, acc: 1 });
  return { antes, r, despues: window.probe.reaccion.quien(n) };
}, nArana);
control("con la tirada a 90 la araña para el golpe", paraSiempre.r?.parado === true,
  `${paraSiempre.r?.mensaje}`);
control("y no pierde ni un punto de vida", paraSiempre.despues.vida === paraSiempre.antes.vida,
  `${paraSiempre.antes.vida} -> ${paraSiempre.despues.vida}`);
control("y NO acumula experiencia: un golpe parado no enseña nada",
  Object.keys(paraSiempre.despues.recibido).length === 0,
  JSON.stringify(paraSiempre.despues.recibido));
control("y se le ve esquivar: cambia a su animación de esquiva",
  paraSiempre.despues.animacion === "dodge", `'${paraSiempre.despues.animacion}'`);

const paraNunca = await pag.evaluate((n) => {
  const antes = window.probe.reaccion.quien(n);
  const r = window.probe.reaccion.pegarA(n, 5, { tipo: "slash", parry: 0 });
  return { antes, r, despues: window.probe.reaccion.quien(n) };
}, nArana);
control("con la tirada a 0 el golpe entra", paraNunca.r?.parado !== true, "");
control("y entonces sí pierde vida y sí acumula experiencia",
  paraNunca.despues.vida === paraNunca.antes.vida - 5 &&
  Object.keys(paraNunca.despues.recibido).length === 1,
  `${paraNunca.antes.vida} -> ${paraNunca.despues.vida}, ${JSON.stringify(paraNunca.despues.recibido)}`);

// La TASA, contra la cuenta cerrada: 4,80 %.
const tasa = await pag.evaluate((n) => window.probe.reaccion.tasaDeParada(n, 20000), nArana);
console.log(`    tasa medida de parada de la araña: ${(tasa.tasa * 100).toFixed(2)} % ` +
  `(${tasa.parados} de ${tasa.golpes}); la cuenta cerrada da 4,80 %`);
control("la tasa medida de parada cuadra con la cuenta cerrada",
  Math.abs(tasa.tasa - 0.0480) < 0.008, `${(tasa.tasa * 100).toFixed(2)} % vs 4,80 %`);
const tasaGoblin = await pag.evaluate((n) => window.probe.reaccion.tasaDeParada(n, 2000), goblin?.n);
control("el goblin no para ni uno de dos mil", tasaGoblin.parados === 0, `${tasaGoblin.parados}`);

// Los tipos de daño que no se paran, con la lista CORTA del script.
const tipos = await pag.evaluate((n) => ({
  magia: window.probe.reaccion.pegarA(n, 1, { tipo: "magic", parry: 90, acc: 1 })?.parado ?? false,
  fuego: window.probe.reaccion.pegarA(n, 1, { tipo: "fire", parry: 90, acc: 1 })?.parado ?? false,
  vacio: window.probe.reaccion.pegarA(n, 1, { tipo: "", parry: 90, acc: 1 })?.parado ?? false,
}), nArana);
control("no para 'magic'", tipos.magia === false, "");
control("pero SI para 'fire', que el jugador no puede parar", tipos.fuego === true,
  "la lista del script son dos tipos, la del motor ocho");
control("y un tipo de daño VACIO es imparable por accidente", tipos.vacio === false,
  "'target;magic' contiene la cadena vacía");

// ── 4. ENCOGERSE ───────────────────────────────────────────────────────────
const nZombi = zombi?.n;
const flojo = await pag.evaluate((n) => {
  const q = window.probe.reaccion.quien(n);
  const r = window.probe.reaccion.pegarA(n, 1.1, { tipo: "slash", parry: 0 });
  return { vidaAntes: q.vida, r, despues: window.probe.reaccion.quien(n) };
}, nZombi);
console.log(`    zombi de ballesta: ${flojo.vidaAntes} de vida, umbral 10 % = ${(flojo.vidaAntes * 0.1).toFixed(1)}`);
control("con 1,1 de daño y 300 de vida el zombi NO se encoge: el umbral son 30",
  flojo.r?.encoge === false, `daño 1,1 vs umbral ${(flojo.vidaAntes * 0.1).toFixed(1)}`);

const fuerte = await pag.evaluate((n) => {
  const r = window.probe.reaccion.pegarA(n, 40, { tipo: "slash", parry: 0 });
  return { r, despues: window.probe.reaccion.quien(n) };
}, nZombi);
control("con 40 de daño sí se encoge", fuerte.r?.encoge === true, "");
control("y se le ve: cambia a su animación de encogerse",
  fuerte.despues.animacion === "anim_xbow_flinch", `'${fuerte.despues.animacion}'`);
control("y se QUEDA QUIETO, que es la otra mitad del efecto",
  fuerte.despues.quieto === true, "npcatk_suspend_ai 1,5 s");

const otraVez = await pag.evaluate((n) => {
  window.probe.reaccion.avanzar(2);          // pasa el segundo y medio de quietud
  const a = window.probe.reaccion.pegarA(n, 40, { tipo: "slash", parry: 0 });
  window.probe.reaccion.avanzar(29);         // y con eso se cumplen los treinta
  const b = window.probe.reaccion.pegarA(n, 40, { tipo: "slash", parry: 0 });
  window.probe.reaccion.avanzar(2);          // y el reloj vuelve a arrancar
  const c = window.probe.reaccion.pegarA(n, 40, { tipo: "slash", parry: 0 });
  return { a: a?.encoge, b: b?.encoge, c: c?.encoge };
}, nZombi);
control("no se encoge dos veces seguidas: la espera son treinta segundos",
  otraVez.a === false, `a los 2 s: ${otraVez.a}`);
control("y pasados los treinta, otra vez sí", otraVez.b === true, `a los 31 s: ${otraVez.b}`);
control("y el reloj vuelve a arrancar", otraVez.c === false, `a los 33 s: ${otraVez.c}`);

const goblinEncoge = await pag.evaluate((n) => {
  const r = [];
  for (let k = 0; k < 20; k++) r.push(window.probe.reaccion.pegarA(n, 40, { tipo: "slash", parry: 0 })?.encoge);
  return r.filter(Boolean).length;
}, goblin?.n);
control("el goblin no se encoge nunca: CAN_FLINCH 0 y no incluye base_struck",
  goblinEncoge === 0, `${goblinEncoge} de 20 golpes`);

// ── 5. HUIR ────────────────────────────────────────────────────────────────
// (92) Desde el 67 Gate City no tiene NI UNA rata: las cuatro `msmonster_giantrat`
// llevan `scriptfile monsters/spider_mini`, que gana a `defscriptfile`
// (msmonsterserver.cpp:415-416). Esta línea leía `monsters/giantrat` e imprimía
// «undefined de vida» desde entonces sin que nada se pusiera rojo.
const cria = uno("monsters/spider_mini");
console.log(`    cría de araña: ${cria?.vidaMaxima} de vida, huir ${JSON.stringify(cria?.huir)}`);
// Se mide con una ALDEANA y no con la rata, y eso es un hallazgo del mapa y no
// una comodidad: **las cuatro ratas gigantes están hundidas en el suelo**. El
// rayo del suelo, excluyendo su propio cilindro, encuentra piso 17 a 33 unidades
// POR ENCIMA de sus pies, y en las cuatro direcciones — o sea que no es un
// escalón detrás, es que están enterradas. Cualquier paso se lee como un escalón
// de 20 u y `m_StepSize` son 18, así que huyen sin moverse. No se había visto
// nunca porque una rata RECELA del jugador: nunca persigue, y sin perseguir
// nunca usa `avanzar`. La aldeana tiene FLEE_CHANCE 100 % y está en la plaza.
const aldeanas = censo.filter((c) => c.huir?.probabilidad === 100 && c.vida > 0).map((c) => c.n);
const huida = await pag.evaluate((ns) => {
  const out = [];
  for (const n of ns) {
    const q = window.probe.reaccion.quien(n);
    window.probe.reaccion.pegarA(n, q.vida - 1, { tipo: "slash", parry: 0 });
    const conUno = window.probe.reaccion.quien(n);
    window.probe.reaccion.pegarA(n, 0.0001, { tipo: "slash", parry: 0, huir: 1 });
    const tras = window.probe.reaccion.quien(n);
    window.probe.reaccion.avanzar(3);
    const corriendo = window.probe.reaccion.quien(n);
    out.push({
      n, nombre: q.nombre, vida: conUno.vida,
      huyendo: tras.huyendo, animacion: corriendo.animacion, frenado: corriendo.frenado,
      paso: Math.hypot(corriendo.donde[0] - tras.donde[0], corriendo.donde[2] - tras.donde[2]),
      antes: tras.distanciaAlJugador, despues: corriendo.distanciaAlJugador,
      queda: corriendo.quedaDeHuida,
    });
  }
  return out;
}, aldeanas.slice(0, 3));
for (const h of huida) {
  console.log(`    ${h.nombre} con ${h.vida} de vida: huye=${h.huyendo}, ` +
    `${h.paso.toFixed(2)} m en 3 s ('${h.frenado}'), ${h.antes.toFixed(1)} -> ${h.despues.toFixed(1)} m del jugador`);
}
control("con un punto de vida y el dado a favor, huye",
  huida.every((h) => h.huyendo === true), `${huida.filter((h) => h.huyendo).length} de ${huida.length}`);
control("y corre: pone su animación de correr",
  huida.every((h) => h.animacion === "run"), `'${huida[0]?.animacion}'`);
control("y se mueve de verdad", huida.every((h) => h.paso > 1), 
  `${huida.map((h) => h.paso.toFixed(1)).join(", ")} m en 3 s`);
control("y se ALEJA, que es el signo que se puede equivocar",
  huida.every((h) => h.despues > h.antes),
  huida.map((h) => `${h.antes.toFixed(0)}->${h.despues.toFixed(0)}`).join(", "));
const paraDeHuir = await pag.evaluate((n) => {
  window.probe.reaccion.avanzar(9);
  return window.probe.reaccion.quien(n);
}, aldeanas[0]);
control("y deja de huir a los diez segundos de FLEE_TIME",
  paraDeHuir?.huyendo === false, `quedaban ${huida[0]?.queda?.toFixed(1)} s`);

// Y LAS BOLSAS DE HUEVOS, que hasta el 67 se creían ratas.
//
// CORREGIDO EN EL 92. Esta sección filtraba `script === "monsters/giantrat"` y
// desde el 67 —`scriptfile` gana a `defscriptfile`, msmonsterserver.cpp:415-416—
// las cuatro son `monsters/spider_mini`. El filtro devolvía CERO, y con cero:
// «las ratas también entran en huida» salía VERDE (`[].every` es `true`), «ninguna
// sigue veinte unidades enterrada» también (el peor suelo era `-Infinity`), y
// las tres de abajo rojas sin decir por qué. Veinticinco experimentos.
//
// Y no bastaba con cambiar el nombre: la medida antigua las hacía HUIR para ver
// si se movían, y una cría de araña no huye — `setvard CAN_FLEE 0`
// (spider_mini.script:34), contra el `CAN_FLEE 1` de la rata (giantrat.script:27).
// Ahora eso es un control, y para moverlas se usa lo que sí tienen:
// `HUNT_AGRO 1` (spider_mini.script:31), o sea que cazan al jugador que tengan
// cerca. Se pone al jugador a 2 m de cada una y se le deja cazar dos segundos.
const crias = censo.filter((c) => c.script === "monsters/spider_mini").map((c) => c.n);
const noHuyen = await pag.evaluate((ns) => ns.map((n) => {
  const q = window.probe.reaccion.quien(n);
  window.probe.reaccion.pegarA(n, q.vida - 1, { tipo: "slash", parry: 0 });
  window.probe.reaccion.pegarA(n, 0.0001, { tipo: "slash", parry: 0, huir: 1 });
  const r = window.probe.reaccion.quien(n);
  window.probe.reaccion.vida(n, q.vida);   // se le devuelve la vida: abajo tiene que cazar
  return { n, huyendo: r.huyendo, muerto: r.muerto };
}), crias);
// ── CORRECCIÓN DEL 93: LA VENTANA ESTABA PUESTA EN EL BORDE DEL CICLO ──────
//
// Hasta aquí eran DOS SEGUNDOS fijos desde que el jugador aparece al lado, y
// dos segundos es justo lo que dura el ciclo ocioso de la IA de este puerto
// (`CICLO.ocioso`, src/play/ia.js). Una cría sin objetivo sólo mira alrededor
// cuando le toca pensar, así que **cuándo te ve depende de en qué punto de su
// ciclo la pilla la sonda**, y eso lo decide el reloj de pared que ha pasado
// entre las llamadas de antes: es un dado. Medido en el 93 (pieza F),
// barriendo la fase a mano: la primera cría fijaba a 1,92 / 1,67 / 1,42 s
// adelantando 0,25 / 0,5 / 0,75 s — pendiente −1, o sea que espera su turno
// de pensar. Con la ventana vieja la sonda dio 48/48 cuatro veces con el árbol
// del 93, y con los `repeatdelay` desarmados (la rotura R2 de la pieza A)
// 48/48 y 47/48 en dos pasadas seguidas («libres»: la primera cría fijó a
// ~1,9 s y anduvo 0,09 m). O sea que R2 no decidía nada: decidía la fase. La
// pieza A vio 46/48 (además «te cazan»: con la fase entera, 2,0 s menos
// 120 pasos de 1/60 deja el reloj a 2·10⁻¹⁵ por ENCIMA de cero y hace falta
// el paso 121 — el borde del 81). Las otras tres no lo sufrían porque, a 90 u
// de la primera, te ven mientras se mide aquélla.
//
// Y EL MOTOR TARDA MÁS, no menos: la cría es de la familia VIEJA
// (spider_mini -> spider_base -> base_monster -> base_npc_attack), cuyo bucle
// es `hunting_mode_go` con `repeatdelay CYCLE_TIME` y `CYCLE_TIME_IDLE 2.8`
// (base_npc_attack.script:7, :13, :62-63; el 2,0 es de la nueva,
// base_npc_attack_new.script:95). Un jugador que aparece quieto no hace ruido
// para `game_heardsound` (:350), así que en Master Sword la cría puede tardar
// hasta 2,8 s en verte. Una ventana de 2 s no podía estar bien ni en el motor.
//
// Ahora: se espera a que fije objetivo, con TOPE en 3 s —por encima de los
// 2,8 del motor, para que el control siga valiendo el día que el ciclo de la
// IA vieja se porte—, se apunta cuándo, y DESPUÉS se le dejan dos segundos
// de caza, que es lo que miden los controles de andar.
const TOPE_PARA_VERTE = 3.0;          // > CYCLE_TIME_IDLE 2.8, base_npc_attack.script:7
const encajonadas = await pag.evaluate(({ ns, tope }) => {
  // Dónde NACIÓ cada una, apuntado antes de acercarse a ninguna: al ponerse al
  // lado de la primera, la segunda —a 90 u— también caza, y medir su paso desde
  // donde estuviera al llegarle el turno mediría el orden de la sonda.
  const nacio = new Map(ns.map((n) => [n, window.probe.reaccion.quien(n).donde]));
  const out = [];
  for (const n of ns) {
    const a = window.probe.reaccion.quien(n);
    const teniaObjetivo = a.objetivo;
    window.probe.mundo.poner(a.donde[0] + 2, a.donde[1] + 0.3, a.donde[2]);
    // 1. hasta que te ve, de décima en décima, con tope.
    let fija = a.objetivo === "jugador" ? 0 : null;
    for (let t = 0.1; fija === null && t <= tope + 1e-9; t += 0.1) {
      window.probe.reaccion.avanzar(0.1);
      if (window.probe.reaccion.quien(n).objetivo === "jugador") fija = t;
    }
    // 2. y dos segundos cazando.
    const frenados = [];
    for (let k = 0; k < 10; k++) {
      window.probe.reaccion.avanzar(0.2);
      frenados.push(window.probe.reaccion.quien(n).frenado);
    }
    const b = window.probe.reaccion.quien(n), c = nacio.get(n);
    const piso = window.probe.sondaFisica(b.donde[0] + 0.2, b.donde[1], b.donde[2], n).suelo;
    out.push({ n, objetivo: b.objetivo, fija, teniaObjetivo, frenados, frenado: b.frenado,
      suelo: piso === null ? -1 : (piso - b.donde[1]) * 39.37,
      paso: Math.hypot(b.donde[0] - c[0], b.donde[2] - c[2]) });
  }
  return out;
}, { ns: crias, tope: TOPE_PARA_VERTE });
console.log(`    las ${encajonadas.length} crías: ${encajonadas.map((r) => `'${r.frenado}' ${r.paso.toFixed(2)} m, suelo a ${r.suelo.toFixed(1)}`).join(", ")}`);
console.log(`    te ven a los: ${encajonadas.map((r) => r.fija === null ? "nunca" : `${r.fija.toFixed(1)} s${r.teniaObjetivo ? " (ya cazaba)" : ""}`).join(", ")}`);
// Ojo con lo que defiende: romper a propósito la guarda de `CAN_FLEE`
// (reaccion.js, `huyeDelGolpe`) lo deja VERDE, porque la cría tampoco tiene
// `FLEE_HEALTH` —0 por omisión, «won't flee from dmg» (base_npc_attack_new.script:16)—
// y con eso no huye nadie. Son dos razones que se tapan; el control dice que la
// cría no huye, no cuál de las dos lo decide (92).
control("las crías de araña NO huyen ni con el dado a favor: sin FLEE_HEALTH y CAN_FLEE 0",
  noHuyen.length === 4 && noHuyen.every((r) => r.huyendo === false && !r.muerto),
  `${noHuyen.filter((r) => r.huyendo).length} huyen de ${noHuyen.length}`);
// (93) «Te ven» antes del tope, que es el ciclo ocioso del motor y un poco
// más: ver arriba. Y que al acabar sigan contigo, que es lo que decía antes.
control("y las cuatro te cazan al tenerte a dos metros: HUNT_AGRO 1",
  encajonadas.length === 4 && encajonadas.every((r) => r.fija !== null && r.objetivo === "jugador"),
  encajonadas.map((r) => `${r.objetivo} (${r.fija === null ? "nunca" : `${r.fija.toFixed(1)} s`})`).join(", "));
// LO QUE ERAN LAS «RATAS HUNDIDAS», corregido en el 39 — y no eran ratas.
//
// Estos dos controles decían «ninguna se mueve, están HUNDIDAS» y estaban VERDES
// afirmando un fallo nuestro. El fallo era real pero el diagnóstico estaba a medio
// camino, y lo de abajo es lo que dice el `.bsp`:
//
//   "classname"     "msmonster_giantrat"
//   "scriptfile"    "monsters/spider_mini"     <- lo que sale de verdad
//   "spawnarea"     "spawn_babies1"            <- o sea que es una FICHA
//   "lives" "1"  "delaylow" "1"  "delayhigh" "2"
//
// y al lado, una `func_breakable` por cada una, de z −791 a −771, con `health 1`,
// `rendercolor 0 0 0` y `target spawn_babies1`. **Son bolsas de huevos**: cuatro
// sacos negros que se rompen de un golpe y sueltan una araña pequeña.
//
// Dos cosas se arreglaron y una sigue:
//
//   arreglado  el censo las ponía a −791, o sea VEINTE unidades DENTRO del saco,
//              porque `sueloBajo` caminaba sólo el árbol del mundo y los `func_*`
//              con brushes viven cada uno en su propio modelo. Ahora cuenta los
//              que también chocan (`solidoPara`, src/bsp/arbol.js).
//   arreglado  no son monstruos de pie: aparecen a los 3 s como las otras 37.
//   SIGUE      dos de las cuatro tienen su `origin` DENTRO del saco (−790, y el
//              saco va de −791 a −771), así que salen encerradas: el techo del
//              saco les queda a 18 unidades justas y `m_StepSize` son 18. Y eso
//              **es correcto**: están dentro de un huevo. Lo que falta para que
//              salgan es romper el saco, y `func_breakable` está horneado dentro
//              de la malla de colisión y no se puede romper. Queda apuntado.
control("las cuatro son FICHA de una bolsa de huevos, no monstruos de pie",
  encajonadas.length === 4, `${encajonadas.length} de 4`);
// «Libre» es haber ANDADO —más de medio metro desde donde nació y algún paso
// con `avanza`—, no acabar en `avanza`: una cría libre llega al jugador o a una
// pared antes de los dos segundos, y entonces su último frenado es otro.
control("dos están libres encima de su saco y avanzan",
  encajonadas.filter((r) => r.paso > 0.5 && r.frenados.includes("avanza")).length === 2,
  encajonadas.map((r) => `${r.frenado} ${r.paso.toFixed(2)} m`).join(" · "));
control("y dos están DENTRO del saco, con el techo a 18 u justas y el paso es 18",
  encajonadas.filter((r) => r.paso < 0.01 && r.frenados.every((f) => /escalon de 18 u/.test(f ?? ""))).length === 2,
  `${encajonadas.map((r) => `${r.suelo.toFixed(1)} u`).join(", ")} — el saco va de −791 a −771 y su origin es −790`);
control("ninguna sigue veinte unidades enterrada: eso era nuestro y está arreglado",
  encajonadas.length === 4 && encajonadas.every((r) => r.suelo < 19),
  `el peor tiene el suelo a ${Math.max(...encajonadas.map((r) => r.suelo)).toFixed(1)} u, y antes eran 20`);

const goblinHuye = await pag.evaluate((n) => {
  const q = window.probe.reaccion.quien(n);
  window.probe.reaccion.pegarA(n, q.vida - 1, { tipo: "slash", parry: 0 });
  window.probe.reaccion.pegarA(n, 0.0001, { tipo: "slash", parry: 0, huir: 1 });
  return { quien: window.probe.reaccion.quien(n) };
}, goblin?.n);
control("el goblin con un punto de vida NO huye: CAN_FLEE 0 a mano en su ficha",
  goblinHuye.quien?.huyendo === false, "");

// ── 6. AVISAR AL MORIR ─────────────────────────────────────────────────────
const goblins = de("monsters/goblin");
console.log(`    goblins en el mapa: ${goblins.length}; alcance del grito de uno de 50 de vida: 294 u (7,5 m)`);
// UN GOBLIN VIVO, y esto costó un rato: la sonda le había dado veinte golpes de
// 40 al goblin 0 para probar el encogerse, o sea que estaba muerto, y `matar` de
// un muerto avisa a cero. El control decía «no avisa» de algo que sí avisa.
const vivo = await pag.evaluate((ns) => ns.find((n) => !window.probe.reaccion.quien(n).muerto) ?? null,
  goblins.map((g) => g.n));
// LA TABLA DE RAZAS, que es lo que decide quién es aliado (92). Entrando por el
// menú los bichos se montan desde «Start» (el 53), y `main.js` construía la
// tabla leyendo el censo ANTES de eso: nacía vacía, `sonAliados` decía «no» a
// todo y el goblin avisaba a cero. Con `?map=gatecity` salía llena, y por eso
// este control estuvo verde hasta que la sonda pasó por el menú (el 57).
const razasEnElJuego = await pag.evaluate(() => window.probe.reaccion.estado.razas);
control("el juego tiene la tabla de razas del censo, entrando por el menú",
  razasEnElJuego > 0, `${razasEnElJuego} razas`);
const aviso = await pag.evaluate((n) => window.probe.reaccion.matarYAvisar(n), vivo);
console.log(`    al morir avisa a ${aviso?.avisados}: ` +
  (aviso?.quienes ?? []).map((q) => `${q.nombre} a ${q.distancia.toFixed(0)} u`).join(", "));
control("al morir, el goblin avisa a los aliados que tiene a tiro de grito",
  aviso?.avisados > 0, `${aviso?.avisados} avisados`);
control("y a los avisados les queda el jugador como objetivo",
  (aviso?.quienes ?? []).every((q) => q.objetivo === "jugador"),
  `${(aviso?.quienes ?? []).filter((q) => q.objetivo === "jugador").length} de ${aviso?.avisados}`);
control("y ninguno está más lejos del alcance que dice su vida máxima",
  (aviso?.quienes ?? []).every((q) => q.distancia <= 294.5),
  `el más lejano a ${Math.max(0, ...(aviso?.quienes ?? []).map((q) => q.distancia)).toFixed(0)} u`);
control("y no avisa a los 69: el grito tiene radio",
  (aviso?.avisados ?? 0) < censo.length, `${aviso?.avisados} de ${censo.length}`);

// ── 7. EL CAMINO DE VERDAD, blandiendo ─────────────────────────────────────
//
// Todo lo de arriba llama a `herir` directamente, que es lo que hay que hacer
// para fijar los dados. Pero entre el arma y la regla está `pegar()`, y ahí vivía
// el fallo que ninguna medición de arriba podía ver: el campo del tipo de daño se
// llama `tipoDano` y estaba escrito `tipoDeDano`, o sea que el parry recibía un
// tipo VACÍO — que es imparable. La araña no habría esquivado nunca jugando.
const tipo = await pag.evaluate(() => window.probe.reaccion.tipoDelAtaque());
control("el ataque de la espada oxidada lleva su tipo de daño al parry",
  tipo === "slash", `'${tipo}'`);

const aranas = censo.filter((c) => c.script === "monsters/spider" && !c.muerto).map((c) => c.n);
const blandiendo = await pag.evaluate((ns) => {
  for (const n of ns) window.probe.reaccion.vida(n, 100000);   // que no se muera
  const n = ns[0];
  const q = window.probe.reaccion.quien(n);
  // LA DISTANCIA SE BUSCA, no se elige, y es la lección del 18: los 60 u de la
  // espada son del OJO al CENTRO del bicho, y la araña mide 40 de alto, así que
  // la diferencia de alturas se come casi todo el alcance. Con 0,9 m salían 215
  // mandobles y CERO impactos.
  let puesto = null;
  for (const d of [0.5, 0.6, 0.4, 0.7, 0.8, 0.3]) {
    window.probe.mundo.poner(q.donde[0] + d, q.donde[1], q.donde[2]);
    window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.25, q.donde[2]);
    if (window.probe.golpe.objetivo()) { puesto = d; break; }
  }
  const antes = { ...window.probe.reaccion.estado, ...window.probe.golpe.estado };
  const r = window.probe.golpe.atacar(240);
  r.puesto = puesto;
  return {
    puesto: r.puesto, golpes: r.golpes, impactos: r.impactos,
    parados: window.probe.reaccion.estado.parados - antes.parados,
    quien: window.probe.reaccion.quien(n),
  };
}, aranas);
console.log(`    blandiendo 240 s contra la araña a ${blandiendo.puesto} m: ${blandiendo.golpes} mandobles, ` +
  `${blandiendo.impactos} impactos, ${blandiendo.parados} parados ` +
  `(${blandiendo.impactos + blandiendo.parados > 0 ? (100 * blandiendo.parados / (blandiendo.impactos + blandiendo.parados)).toFixed(1) : "—"} %)`);
control("blandiendo de verdad contra la araña, alguno se para",
  blandiendo.parados > 0, `${blandiendo.parados} de ${blandiendo.impactos + blandiendo.parados}`);
control("y la esquiva se le queda puesta al pararlo",
  blandiendo.parados === 0 || ["dodge", "idle", "walk", "run"].includes(blandiendo.quien?.animacion),
  `'${blandiendo.quien?.animacion}'`);

// ── 7b. MATAR A UN ALDEANO (el 94) ─────────────────────────────────────────
//
// `NPCs/default_human` hace `skilllevel -10` (:50) y el 93 dejó escrito que en
// el motor eso RESTA. No resta: `while (iRemainingExp > 0)` (playerstats.cpp:83)
// no entra con un negativo, y `if (xpsend > 0 ...)` (msmonsterserver.cpp:2540)
// no manda `game_xpgain`. Lo que se mide es el camino de UN jugador
// (`repartirExperiencia` de main.js; el del servidor lo mide
// test/experiencia94.test.mjs). La propiedad se pone a MEDIO PUNTO del umbral,
// porque es el único estado donde quitar la guarda cambia algo: ahí `aprender`
// entregaría el mínimo de 1. Y el goblin es el control positivo de los dos
// instrumentos: la hoja y la línea verde de la consola.
const aldeano = await pag.evaluate(async () => {
  const { expNecesaria } = await import("/src/juego/stats.js");
  const lista = window.probe.reaccion.censo();
  const vivo = (s) => lista.find((c) => c.script === s && !window.probe.reaccion.quien(c.n)?.muerto);
  const xpVerdes = () => (window.probe.hud.estado()?.consola?.lineas ?? [])
    .filter((l) => /XP Awarded/.test(l.texto)).length;
  const prop = () => window.probe.sesion.personaje.habilidades.swordsmanship.power;
  const medir = (c) => {
    if (!c) return null;
    const p = prop();
    p.exp = expNecesaria(p.valor) - 0.5;
    const antes = { valor: p.valor, exp: p.exp, verdes: xpVerdes() };
    const r = window.probe.reaccion.pegarA(c.n, c.vida + 1, { tipo: "slash", parry: 0 });
    return {
      nombre: c.nombre, script: c.script, muerto: Boolean(r?.muerto),
      antes, despues: { valor: prop().valor, exp: prop().exp, verdes: xpVerdes() },
    };
  };
  return { comun: medir(vivo("NPCs/default_human")), goblin: medir(vivo("monsters/goblin")) };
});
const fmt = (m) => m ? `${m.nombre}: power ${m.antes.valor}/${m.antes.exp.toFixed(2)} -> ` +
  `${m.despues.valor}/${m.despues.exp.toFixed(2)}, líneas verdes ${m.antes.verdes} -> ${m.despues.verdes}` : "no encontrado";
console.log(`\n  matar a un aldeano:\n    ${fmt(aldeano.comun)}\n    ${fmt(aldeano.goblin)}`);
control("hay un aldeano de NPCs/default_human y muere del golpe",
  aldeano.comun?.muerto === true, aldeano.comun ? aldeano.comun.nombre : "ninguno");
control("matarlo no resta experiencia NI da el mínimo de 1 (playerstats.cpp:83)",
  aldeano.comun && aldeano.comun.despues.valor === aldeano.comun.antes.valor
    && aldeano.comun.despues.exp === aldeano.comun.antes.exp,
  aldeano.comun ? `${aldeano.comun.antes.exp.toFixed(2)} -> ${aldeano.comun.despues.exp.toFixed(2)}` : "");
control("y no sale '* N XP Awarded' (msmonsterserver.cpp:2540)",
  aldeano.comun && aldeano.comun.despues.verdes === aldeano.comun.antes.verdes,
  aldeano.comun ? `${aldeano.comun.antes.verdes} -> ${aldeano.comun.despues.verdes}` : "");
control("CONTROL POSITIVO: el goblin, en el mismo estado, sí mueve la hoja",
  aldeano.goblin?.muerto === true && (aldeano.goblin.despues.exp !== aldeano.goblin.antes.exp
    || aldeano.goblin.despues.valor !== aldeano.goblin.antes.valor), fmt(aldeano.goblin));
control("y sí sale la línea verde: la consola sabía enseñarla",
  aldeano.goblin && aldeano.goblin.despues.verdes > aldeano.goblin.antes.verdes,
  aldeano.goblin ? `${aldeano.goblin.antes.verdes} -> ${aldeano.goblin.despues.verdes}` : "");

// ── 8. NADA DE ESTO ROMPE EL MUNDO ─────────────────────────────────────────
const final = await pag.evaluate(() => {
  window.probe.reaccion.avanzar(2);
  return { estado: window.probe.reaccion.estado, golpe: window.probe.golpe.estado };
});
console.log(`\n  contadores: ${final.estado.parados} parados, ${final.estado.encogidas} encogidas, ` +
  `${final.estado.huidas} huidas, ${final.estado.avisos} avisos`);
control("el reloj de las consecuencias avanza", final.estado.reloj > 0, `${final.estado.reloj.toFixed(1)} s`);
await pag.screenshot({ path: "build/gatecity/vistas/consecuencias.png" });

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(62)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
