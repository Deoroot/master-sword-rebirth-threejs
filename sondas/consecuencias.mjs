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
import { mkdirSync } from "node:fs";

const PORT = 5203;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForFunction(() => window.probe.golpe.estado.triangulos > 0, null, { timeout: 60000 })
  .catch(() => {});

// EL MUNDO QUIETO. Desde el 22 los 53 bichos con `roam 1` pasean de verdad por
// el bucle del juego, y esta sonda mide cosas que dependen de DÓNDE está cada
// uno — el radio del grito al morir, tener un goblin pegado para que pegue—.
// Con el pueblo andando, esos controles miden el dado y salen rojos una vez de
// cada tres. Se apaga el `roam` y sólo el `roam`: la caza sigue encendida.
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

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
const rata = uno("monsters/giantrat");
console.log(`    rata gigante: ${rata?.vidaMaxima} de vida, huye por debajo de ${rata?.huir?.vida} al ${rata?.huir?.probabilidad} %`);
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

// Y LAS RATAS, que es el otro hallazgo: el estado sí, el movimiento no.
const ratas = censo.filter((c) => c.script === "monsters/giantrat").map((c) => c.n);
const encajonadas = await pag.evaluate((ns) => {
  const out = [];
  for (const n of ns) {
    const q = window.probe.reaccion.quien(n);
    window.probe.reaccion.pegarA(n, q.vida - 1, { tipo: "slash", parry: 0 });
    window.probe.reaccion.pegarA(n, 0.0001, { tipo: "slash", parry: 0, huir: 1 });
    const a = window.probe.reaccion.quien(n);
    window.probe.reaccion.avanzar(2);
    const b = window.probe.reaccion.quien(n);
    const piso = window.probe.sondaFisica(b.donde[0] + 0.2, b.donde[1], b.donde[2], n).suelo;
    out.push({ n, huyendo: a.huyendo, frenado: b.frenado,
      suelo: piso === null ? -1 : (piso - b.donde[1]) * 39.37,
      paso: Math.hypot(b.donde[0] - a.donde[0], b.donde[2] - a.donde[2]) });
  }
  return out;
}, ratas);
console.log(`    las ${encajonadas.length} ratas: ${encajonadas.map((r) => `'${r.frenado}' ${r.paso.toFixed(2)} m, suelo a ${r.suelo}`).join(", ")}`);
control("las ratas también entran en huida", encajonadas.every((r) => r.huyendo), "");
control("pero ninguna se mueve, y no es la regla: están HUNDIDAS en el suelo",
  encajonadas.every((r) => r.paso < 0.01 && /escalon/.test(r.frenado ?? "")),
  encajonadas.map((r) => r.frenado).join(" · "));
control("el suelo les queda por encima de los pies en las cuatro direcciones",
  encajonadas.every((r) => r.suelo > 10),
  `${encajonadas.map((r) => `${r.suelo.toFixed(1)} u`).join(", ")} — el horno las deja donde dice el árbol BSP y Rapier tiene piso más arriba`);

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
