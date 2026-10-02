// EDANA, HABLADA — experimento 60.
//
//   npm run sonda:edana60
//
// El 50 dejó escrito lo que faltaba, con estas palabras: *«No se ha jugado
// Edana. Se entra, se anda, están todos los del censo. Que sus guiones hagan lo que dicen,
// que sus menús se puedan pulsar y que sus misiones avancen no lo mide nadie
// todavía.»* Esto es eso.
//
// Y al ir a medirlo salió el fallo: **el extractor de guiones sólo veía a los
// NPC que declaran el menú en su propio archivo.** `game_menu_getoptions` casi
// nunca está ahí — el sanador de Edana son doce líneas de `setvar` y cuatro
// `#include`, y su «Buy / Sell» sale entero de `monsters/base_npc_vendor`. El
// censo se hacía sobre el texto crudo y la carga sobre el texto con los
// `#include` resueltos.
//
//     139 scripts con `game_menu_getoptions` en su propio texto
//     262 con él una vez resueltos los `#include`
//
// Gate City no pierde **ninguno**: sus 25 colocados lo declaran en su archivo,
// los 25. Edana pierde 7 de 13 —el sanador, el herrero, el alcalde, el
// tendero, la tabernera, el arquero y el mercader—, o sea casi todas sus
// tiendas. Con un mapa el fallo no existía; con dos, sí. Apartado 4 de
// CLAUDE.md en la forma que enseñó el 50.
//
// ── Y HAY DOS FALLOS AQUÍ, NO UNO. Se separaron rompiéndolos por turnos ───
//
// El primero es el censo de arriba. El segundo es que **`build/edana/
// guiones.json` estaba rancio**: lo horneó el 50 cuando todavía no había
// `bichos.json` de Edana, así que el extractor cayó en su rama de respaldo
// —`delMapa = conMenu`— y guardó los 139 de todo MSR, de los cuales sólo 9
// son de Edana. Los otros 13 NPC del pueblo no tenían guion y la F no les
// abría nada.
//
// Lo que arregla que los siete hablen es **volver a hornear**, no el censo:
// con el censo roto a propósito y el horneado nuevo, estos controles siguen
// los trece en verde y el único que cae es el del censo. Se comprobó así, y
// se dice así, porque atribuirle a un arreglo un efecto que no es suyo es la
// forma barata de que el siguiente que mire no entienda nada.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. «Edana tiene 22 guiones» leyendo el JSON   -> se cuenta lo que el juego
//                                                    MONTÓ y lo que la F abre
//   2. la F abre un panel vacío                   -> se miran los botones
//   3. los botones son los de la plantilla y      -> se pide una opción que
//      ninguno del NPC                              sólo puede venir del NPC
//   4. sale el menú de Gate City                  -> el negativo: los nombres
//                                                    de Edana no son los suyos
//   5. y la de siempre: se mide el extractor y no la pantalla.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { readFileSync, mkdirSync } from "node:fs";

const PORT = 5260;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

// LOS SIETE QUE SE PERDÍAN, con el nombre de su script. La lista sale de
// comparar `bichos.json` con `guiones.json` y quedarse con los que SÍ tienen
// menú tras resolver los `#include`; se deja escrita para que el control diga
// QUIÉN falla. Los otros seis del hueco no tienen menú y es correcto que no
// lo tengan: los once aldeanos sentados, los jabalíes, las ratas, el cofre —y
// `edana/priest`, que son doce eventos y ni uno es `game_menu_getoptions`. El
// primer pase lo metió aquí por error y dio un rojo que no era del juego: la
// F le abría al JUGADOR su propio menú de gestos, con panel y con botones.
const LOS_SIETE = [
  "edana/healer", "edana/weaponsmith", "edana/mayor", "edana/bryan",
  "edana/barwench", "edana/fletcher", "edana/packmerc",
];

// ── 0. LO HORNEADO, antes de abrir nada ────────────────────────────────────
const guiones = JSON.parse(readFileSync("build/edana/guiones.json", "utf8"));
const bichos = JSON.parse(readFileSync("build/edana/bichos.json", "utf8"));
const delMapa = [...new Set(bichos.colocados.map((c) => c.script).filter(Boolean))];
const sinGuion = delMapa.filter((s) => !(s in guiones.guiones));
console.log(`
  HORNEADO
    censo           ${guiones.censo.conMenu} scripts con menú en los 2 884`);
console.log(`    del mapa        ${delMapa.length} scripts distintos, ${delMapa.length - sinGuion.length} con guion`);
control("el censo ve los scripts que heredan el menú: 262, no 139",
  guiones.censo.conMenu >= 262, `${guiones.censo.conMenu}`);
control("y los 22 scripts de Edana tienen todos su guion horneado",
  sinGuion.length === 0, sinGuion.join(", "));
for (const s of LOS_SIETE) {
  if (!(s in guiones.guiones)) control(`«${s}» sigue sin guion`, false, "");
}

// ── 1. SE ENTRA A EDANA POR EL MENÚ ────────────────────────────────────────
await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.waitForTimeout(1500);

const censo = await pag.evaluate(() => ({
  mapa: window.probe.vgui2.mapaDeLaPartida(),
  npcs: window.probe.vgui.npcs().map((i) => ({ id: i.id, nombre: i.nombre, script: i.script, donde: i.donde })),
}));
console.log(`\n  EN EL MAPA
    mapa            ${censo.mapa}`);
console.log(`    NPC montados    ${censo.npcs.length}`);
control("se ha entrado a Edana y no a Gate City", censo.mapa === "edana", `${censo.mapa}`);
// LA CUENTA SALE DEL CENSO, NO DE AQUÍ. Estaba clavado el 42, y el 63 arregló
// el filtro del extractor —dejaba fuera la familia `msnpc_`, seis vecinos de
// Edana— así que el número correcto pasó a ser 48 y este control se puso rojo
// por tener razón. «Las cuentas se calculan, no se escriben».
control(`y los ${bichos.colocados.length} NPC del censo están montados`,
  censo.npcs.length === bichos.colocados.length,
  `${censo.npcs.length} de ${bichos.colocados.length}`);
// El negativo: si esto fuera Gate City, sus nombres estarían aquí.
const deGateCity = censo.npcs.filter((i) => /^gatecity\//.test(i.script ?? ""));
control("y ninguno es de Gate City, que es el mapa que siempre sale por defecto",
  deGateCity.length === 0, `${deGateCity.length}`);

// ── 2. LA PRESENTACIÓN DE EDANA, en la ventana del 60 ──────────────────────
//
// VA ANTES DE HABLAR CON NADIE, y el primer pase enseñó por qué: llega a los
// diez y a los trece segundos de aparecer y dura ocho. El bucle de los siete
// NPC tardaba más que eso, así que cuando la sonda miraba ya se había ido y
// el control decía «Edana no se presenta». Decía la verdad sobre la pantalla
// y mentía sobre el juego: es el reloj de la sonda, no el del mapa.
//
// Edana declara «(Beginner/Safe Area)» y `hpwarn` 0, así que le tocan DOS
// avisos y no tres: el nombre y la dificultad, sin «WARNING». Es el segundo
// caso que le faltaba a la presentación del mapa, que hasta ahora sólo se
// había visto con los tres de Gate City.
console.log(`\n  LA PRESENTACIÓN DE EDANA (13 s)`);
await pag.waitForTimeout(13500);
await pag.evaluate(() => window.probe.aviso.paso(0.2));
const intro = await pag.evaluate(() => window.probe.aviso.ventanas());
console.log(`    ventanas        ${intro.map((v) => `«${v.titulo}»`).join(", ") || "ninguna"}`);
const titulos = intro.map((v) => v.titulo);
control("Edana se presenta, y en la ventana de arriba a la izquierda",
  titulos.length >= 1 && intro.every((v) => v.clase === "aviso" && v.x < 600 && v.y < 400),
  titulos.join(", "));
control("con el nombre que dice su `map_startup.script`, no el del `.bsp`",
  titulos.some((t) => /Edana/i.test(t)), titulos.join(", "));
control("y SIN «WARNING»: Edana declara `hpwarn` 0 y es zona segura",
  !titulos.includes("WARNING"), titulos.join(", "));

await pag.screenshot({ path: "build/edana/vistas/edana60_intro.png" });

// ── 3. HABLAR CON LOS SIETE ────────────────────────────────────────────────
//
// Uno por uno: se planta al jugador delante, se le mira, se pulsa la F y se
// leen los botones. Es el camino del jugador entero — la F es la tecla de
// interactuar de la tabla, no una puerta de la sonda.
console.log(`\n  HABLANDO CON LOS SIETE QUE SE PERDÍAN`);
const hablados = [];
for (const script of LOS_SIETE) {
  const quien = censo.npcs.find((i) => i.script === script);
  if (!quien) { hablados.push({ script, falta: true }); continue; }
  // Cerrar lo que hubiera abierto el anterior, Y SÓLO SI HAY ALGO ABIERTO.
  //
  // La Escape a ciegas se llevó por delante al sanador durante dos pases: es
  // el primero de la lista, no había nada abierto, y en el juego **la Escape
  // abre el menú principal**. El menú se comía la F y el control decía «el
  // sanador no tiene menú». Lo tiene: Hail, Ask about Rumors y Shop. Era la
  // sonda pulsando una tecla de más.
  if (await pag.evaluate(() => window.probe.vgui.abierto() !== null)) {
    await pag.keyboard.press("Escape");
    await pag.waitForTimeout(250);
  }
  await pag.evaluate((q) => {
    window.probe.mundo.poner(q.donde[0], q.donde[1], q.donde[2] - 1.0);
    window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.9, q.donde[2]);
  }, quien);
  await pag.waitForFunction(() => window.probe.vgui.delante() !== null, null, { timeout: 8000 }).catch(() => {});
  // A QUIÉN se está mirando, antes de pulsar. Sin esto la F abre el menú del
  // JUGADOR —«Sit Down (Rest)», «Emote: Nod Yes»— y el panel sale con sus
  // opciones y su título: `interact` con botones, o sea todos los controles
  // en verde midiendo al jugador. Pasó con el sacerdote en el primer pase.
  const delante = await pag.evaluate(() => {
    const d = window.probe.vgui.delante();
    return d ? { id: d.id ?? null, nombre: d.nombre ?? d.ficha?.nombre ?? null } : null;
  });
  await pag.keyboard.press("KeyF");
  await pag.waitForTimeout(700);
  const r = await pag.evaluate((id) => ({
    cual: window.probe.vgui.abierto(),
    titulo: window.probe.vgui.panel()?.titulo ?? null,
    botones: window.probe.vgui.botones().map((b) => b.texto),
    opciones: window.probe.misiones.opcionesDe(id),
    noSoportados: window.probe.misiones.noSoportados(id),
  }), quien.id);
  hablados.push({ script, nombre: quien.nombre, delante, ...r });
  console.log(`    ${script.padEnd(20)} ${String(r.cual).padEnd(10)} ${JSON.stringify(r.titulo ?? "")}` +
    `  [${r.botones.join(" | ")}]`);
  if (r.noSoportados?.length) console.log(`      no soporta: ${r.noSoportados.join(", ")}`);
  if (!delante) console.log(`      (no se está mirando a nadie: la F abre el menú del jugador)`);
  else if (delante.id !== quien.id) console.log(`      (se está mirando a OTRO: ${delante.nombre})`);
}

// Y el menú tiene que ser el SUYO: `interact` con el jugador delante de nadie
// enseña las opciones del propio jugador, que es un verde que mide otra cosa.
const mirados = hablados.filter((h) => h.delante);
control("se está mirando a los siete cuando se pulsa la F",
  mirados.length === LOS_SIETE.length,
  `${mirados.length} de ${LOS_SIETE.length}: ${hablados.filter((h) => !h.delante).map((h) => h.script).join(", ")}`);
const abiertos = hablados.filter((h) => h.cual === "interact" && h.delante);
control("LA F ABRE EL MENÚ DE LOS SIETE, que estaban mudos",
  abiertos.length === LOS_SIETE.length,
  `${abiertos.length} de ${LOS_SIETE.length}: ${hablados.filter((h) => h.cual !== "interact").map((h) => h.script).join(", ")}`);
const conBotones = hablados.filter((h) => (h.botones?.length ?? 0) > 0);
control("y el panel trae opciones, no está vacío",
  conBotones.length === LOS_SIETE.length,
  `${conBotones.length} de ${LOS_SIETE.length}`);
// La opción que SÓLO puede venir de la plantilla del vendedor: si sale, el
// `#include` se ha resuelto de verdad y no se ha leído el archivo del NPC.
// Se llama «Shop» y no «Buy»: el primer pase buscaba `buy|sell` y dio rojo
// con los cinco vendedores delante. Un control que no sabe cómo se llama lo
// que busca mide su propia expresión regular.
const vendedores = hablados.filter((h) => (h.botones ?? []).some((b) => /shop|buy|sell|trade|purchase/i.test(b)));
console.log(`\n    con opción de tienda: ${vendedores.map((h) => h.script).join(", ") || "ninguno"}`);
control("al menos uno ofrece comprar o vender, que es lo que hereda del `#include`",
  vendedores.length > 0, vendedores.map((h) => h.script).join(", "));
// Y el negativo del negativo: que los botones NO sean todos iguales. Si los
// siete enseñaran la misma lista, estaríamos viendo la plantilla y nada más.
const listas = new Set(hablados.map((h) => (h.botones ?? []).join("|")));
control("y los siete no enseñan todos la MISMA lista: cada uno trae lo suyo",
  listas.size > 1, `${listas.size} listas distintas de ${LOS_SIETE.length}`);

await pag.screenshot({ path: "build/edana/vistas/edana60.png" });

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(72)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       build/edana/vistas/edana60.png y edana60_intro.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
