// LA TIENDA, comprada de verdad — experimento 60.
//
//   npm run sonda:tienda60
//
// El 44 portó el modelo de las tiendas —qué hay, a cuánto, el ratio de
// recompra topado a 0,9— y dejó escrito en su propio archivo que «no dibuja la
// tienda». El README lo decía más claro: «you cannot buy yet». El 60 (segunda
// parte) hizo hablar a los vendedores de Edana; lo que sale al pulsar «Shop»
// es esto.
//
// SE COMPRA EN EDANA y no en Gate City a propósito: es el mapa donde los
// vendedores acaban de aparecer, y comprarle al herrero de Edana prueba de
// una vez el `#include` del censo, el guion, el panel y el comercio.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. «se abre la tienda» y es el inventario   -> se mira el TÍTULO, que en la
//                                                  tienda lleva el genitivo
//   2. la lista enseña lo del jugador           -> se compara con las
//                                                  existencias del vendedor
//   3. se compra y el oro no baja               -> se mide el oro antes y después
//   4. el oro baja y no llega el objeto         -> se cuentan los objetos
//   5. baja el oro, llega el objeto y el        -> se mira la existencia, que es
//      estante no se mueve                         lo que hace que la tienda
//                                                  se acabe
//   6. se compra sin dinero                     -> el control negativo, con la
//                                                  bolsa a cero
//   7. y la de siempre: se mide el modelo y no la pantalla.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5261;
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

/** El vendedor con el que se comercia. Tiene «Shop» y sólo «Shop». */
const VENDEDOR = "edana/weaponsmith";

await entrarPorElMenu(pag, PORT, { mapa: "edana" });
mkdirSync("build/edana/vistas", { recursive: true });
await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
await pag.waitForTimeout(1200);

// ── 1. DELANTE DEL HERRERO, Y LA F ─────────────────────────────────────────
const quien = await pag.evaluate((s) => {
  const q = window.probe.vgui.npcs().find((i) => i.script === s);
  if (!q) return null;
  window.probe.mundo.poner(q.donde[0], q.donde[1], q.donde[2] - 1.0);
  window.probe.mundo.mirar(q.donde[0], q.donde[1] + 0.9, q.donde[2]);
  return q;
}, VENDEDOR);
console.log(`
  el vendedor     ${quien ? `${quien.nombre} (${quien.script})` : "NO ESTÁ"}`);
control("el herrero de Edana está en el mapa", quien !== null, VENDEDOR);
await pag.waitForFunction(() => window.probe.vgui.delante() !== null, null, { timeout: 8000 }).catch(() => {});
await pag.keyboard.press("KeyF");
await pag.waitForTimeout(700);
const menu = await pag.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  botones: window.probe.vgui.botones().map((b) => b.texto),
}));
console.log(`  la F            ${menu.cual} [${menu.botones.join(" | ")}]`);
const iShop = menu.botones.findIndex((t) => /^Shop$/.test(t));
control("la F abre su menú y hay un «Shop»", iShop >= 0, menu.botones.join(", "));

// ── 2. «SHOP» ABRE EL SELECTOR, Y NO EL INVENTARIO ─────────────────────────
//
// El selector es `CStoreMenuPanel`: «1. Buy / 2. Sell / 3. Cancel», con los
// dos primeros según los flags del guion. Es el panel que el original mete
// entre el menú del NPC y la lista, y el que había que descubrir leyendo:
// `npcstore.offer` no abre la lista.
// Se pulsa con el ratón, en el botón que pone «Shop».
await pag.evaluate(() => {
  const b = [...document.querySelectorAll(".vg-boton")].find((x) => x.textContent.trim() === "Shop");
  if (b) b.click();
});
await pag.waitForTimeout(600);
const selector = await pag.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  titulo: window.probe.vgui.panel()?.titulo ?? null,
  botones: window.probe.vgui.botones().map((b) => b.texto),
}));
console.log(`  «Shop»          ${selector.cual} · ${JSON.stringify(selector.titulo)}` +
  ` [${selector.botones.join(" | ")}]`);
control("«Shop» abre el SELECTOR de la tienda, no la lista",
  selector.cual === "store", `${selector.cual}`);
control("con el título en genitivo, que es lo que lo distingue del inventario",
  /'s Shop$/.test(selector.titulo ?? ""), `${selector.titulo}`);
control("y con «1. Buy» y «3. Cancel», que traen el número en el texto",
  selector.botones.some((t) => /1\. Buy/.test(t)) && selector.botones.some((t) => /3\. Cancel/.test(t)),
  selector.botones.join(", "));
// EL HERRERO TIENE LOS TRES, y saberlo costó un rojo: su guion pone
// `STORE_SELLMENU 1` y NO pone `STORE_BUYMENU`, que se queda con el valor por
// omisión de la plantilla —`if( STORE_BUYMENU equals 'STORE_BUYMENU' ) setvard
// STORE_BUYMENU 1`, base_npc_vendor.script:27—. El primer pase enseñaba «2.
// Sell» y «3. Cancel» y ningún «1. Buy», porque ese bloque no se ejecutaba.
control("y con «2. Sell»: este vendedor compra, por `STORE_SELLMENU 1`",
  selector.botones.some((t) => /2\. Sell/.test(t)), selector.botones.join(", "));

// ── 3. LA LISTA ES LA DEL VENDEDOR ─────────────────────────────────────────
await pag.evaluate(() => {
  const b = [...document.querySelectorAll(".vg-boton")].find((x) => /1\. Buy/.test(x.textContent));
  if (b) b.click();
});
await pag.waitForTimeout(600);
const lista = await pag.evaluate(() => ({
  cual: window.probe.vgui.abierto(),
  titulo: window.probe.vgui.panel()?.titulo ?? null,
  filas: window.probe.vgui.tienda.filas(),
  existencias: window.probe.vgui.tienda.existencias(),
  botones: window.probe.vgui.botones().map((b) => b.texto),
}));
console.log(`  «1. Buy»        ${lista.cual} · ${JSON.stringify(lista.titulo)}`);
console.log(`  a la venta      ${lista.filas.length} filas: ${lista.filas.slice(0, 4).map((f) => f.texto).join(" · ")}` +
  (lista.filas.length > 4 ? ` …` : ""));
control("se abre la lista de compra", lista.cual === "storebuy", `${lista.cual}`);
control("y trae filas: un vendedor sin nada a la venta no mediría nada",
  lista.filas.length > 0, `${lista.filas.length}`);
// El negativo: lo que se enseña es lo del VENDEDOR. Los objetos del jugador
// —la espada oxidada con la que entra— no pueden estar aquí.
control("lo que se enseña es lo del vendedor, no lo del jugador",
  lista.filas.every((f) => lista.existencias.some((e) => e.id === f.id)),
  lista.filas.map((f) => f.id).join(", "));
control("y el botón de cerrar dice «Close», que es `trade stop` y no «Cancel»",
  lista.botones.includes("Close"), lista.botones.join(", "));

// ── 4. EL PRECIO SALE AL SEÑALAR ───────────────────────────────────────────
//
// Se señala eligiendo por teclado, que es lo que hace `SlotInput` y no mueve
// nada más. Un clic aquí compraría.
await pag.evaluate(() => window.probe.vgui.tienda.senalar(0));
await pag.waitForTimeout(250);
const senalado = await pag.evaluate(() => ({
  precio: window.probe.vgui.tienda.precio(),
  filas: window.probe.vgui.tienda.filas(),
}));
console.log(`  señalado        ${JSON.stringify(senalado.precio)}`);
control("al señalar una fila sale su precio, con el formato de `titles.txt`",
  /^Cost: \d+ gold$/.test(senalado.precio ?? ""), `${senalado.precio}`);

await pag.screenshot({ path: "build/edana/vistas/tienda60.png" });

// ── 5. SE COMPRA, Y LAS TRES COSAS SE MUEVEN ───────────────────────────────
//
// Es el control del experimento. No «se abre la tienda»: que al pulsar baje el
// oro, llegue el objeto y **baje la existencia**. Las tres, porque cada una
// puede fallar sola y las tres juntas son la compra.
const objetivo = lista.filas[0] ?? null;
if (!objetivo) {
  // Sin nada a la venta no hay nada que comprar, y seguir midiendo seria
  // inventarse resultados. Se dice, se imprimen los controles que hay y se
  // sale en rojo.
  console.log("\n  NO HAY NADA A LA VENTA: el resto de la sonda no se puede medir.\n");
  for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(70)} ${c.detalle}`);
  console.log(`\n  ${controles.filter((c) => c.bien).length} de ${controles.length} en verde\n`);
  await nav.close(); matar(dev);
  process.exit(1);
}
const antes = await pag.evaluate(() => ({
  oro: window.probe.misiones.bolsa().oro,
  objetos: window.probe.misiones.bolsa().objetos.length,
  existencias: window.probe.vgui.tienda.existencias(),
}));
// Se le da oro de sobra: el jugador entra con muy poco y sin esto la compra
// se quedaría en el rechazo, que es otra medida y ya tiene la suya abajo.
await pag.evaluate(() => window.probe.misiones.oro(5000));
const oroDado = await pag.evaluate(() => window.probe.misiones.bolsa().oro);
console.log(`  antes           oro ${antes.oro} -> ${oroDado}, ${antes.objetos} objetos`);
await pag.evaluate(() => window.probe.vgui.tienda.pulsar(0));
await pag.waitForTimeout(600);
const despues = await pag.evaluate(() => ({
  oro: window.probe.misiones.bolsa().oro,
  objetos: window.probe.misiones.bolsa().objetos.length,
  existencias: window.probe.vgui.tienda.existencias(),
  abierto: window.probe.vgui.abierto(),
  consola: window.probe.hud.estado().consola.lineas.map((l) => l.texto),
}));
const eAntes = antes.existencias.find((e) => e.id === objetivo.id)?.cantidad ?? null;
const eDespues = despues.existencias.find((e) => e.id === objetivo.id)?.cantidad ?? null;
console.log(`  después         oro ${despues.oro}, ${despues.objetos} objetos,` +
  ` existencia ${eAntes} -> ${eDespues}`);
console.log(`  consola         ${despues.consola.map((t) => JSON.stringify(t)).join(", ")}`);
control("COMPRAR BAJA EL ORO", despues.oro < oroDado, `${oroDado} -> ${despues.oro}`);
control("y el objeto llega a la mochila", despues.objetos === antes.objetos + 1,
  `${antes.objetos} -> ${despues.objetos}`);
control("y la existencia del vendedor baja: la tienda se acaba",
  eDespues !== null && eAntes !== null && eDespues === eAntes - 1, `${eAntes} -> ${eDespues}`);
control("lo cobrado es lo que decía el precio",
  oroDado - despues.oro === (lista.existencias.find((e) => e.id === objetivo.id)?.precio ?? -1),
  `cobró ${oroDado - despues.oro}`);
control("se dice «You receive …» por la consola de sucesos",
  despues.consola.some((t) => /^You receive /.test(t)), despues.consola.join(" | "));
// Y la ventana se cierra: una compra por visita. `Close()`, vgui_storebuy.cpp:74.
control("y la tienda se CIERRA al comprar, que es lo que hace el original",
  despues.abierto === null, `${despues.abierto}`);

// ── 6. EL CONTROL NEGATIVO: sin dinero no se compra ────────────────────────
//
// Sin esto, todo lo de arriba lo cumpliría también una tienda que regala.
await pag.evaluate(() => window.probe.misiones.oro(0));
const sinOro = await pag.evaluate(() => window.probe.misiones.bolsa().oro);
await pag.keyboard.press("KeyF");
await pag.waitForTimeout(500);
await pag.evaluate(() => {
  const b = [...document.querySelectorAll(".vg-boton")].find((x) => x.textContent.trim() === "Shop");
  if (b) b.click();
});
await pag.waitForTimeout(400);
await pag.evaluate(() => {
  const b = [...document.querySelectorAll(".vg-boton")].find((x) => /1\. Buy/.test(x.textContent));
  if (b) b.click();
});
await pag.waitForTimeout(400);
const pobre = await pag.evaluate(() => ({
  objetos: window.probe.misiones.bolsa().objetos.length,
  existencias: window.probe.vgui.tienda.existencias(),
}));
await pag.evaluate(() => window.probe.vgui.tienda.pulsar(0));
await pag.waitForTimeout(500);
const tras = await pag.evaluate(() => ({
  oro: window.probe.misiones.bolsa().oro,
  objetos: window.probe.misiones.bolsa().objetos.length,
  existencias: window.probe.vgui.tienda.existencias(),
  consola: window.probe.hud.estado().consola.lineas.map((l) => l.texto),
}));
console.log(`\n  SIN DINERO      oro ${sinOro} · ${pobre.objetos} objetos -> ${tras.objetos}`);
console.log(`  consola         ${tras.consola.map((t) => JSON.stringify(t)).join(", ")}`);
control("sin oro NO llega el objeto", tras.objetos === pobre.objetos,
  `${pobre.objetos} -> ${tras.objetos}`);
control("ni baja la existencia del vendedor",
  JSON.stringify(tras.existencias) === JSON.stringify(pobre.existencias), "");
control("y se dice «You can't afford …», que es el aviso del motor",
  tras.consola.some((t) => /^You can't afford /.test(t)), tras.consola.join(" | "));

await pag.screenshot({ path: "build/edana/vistas/tienda60_pobre.png" });

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(70)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       build/edana/vistas/tienda60.png y tienda60_pobre.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
