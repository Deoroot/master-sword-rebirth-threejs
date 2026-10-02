// El refactor de conversaciones, recorrido por el menú y un clic real en Edana.
// Sólo se acorta el viaje hasta el NPC con la sonda de posición. No se llama
// directamente al intérprete ni se inyecta su respuesta.
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { esNuestro } from "./mismo.mjs";

const server = await createServer({ server: { host: "127.0.0.1", port: 0 }, logLevel: "error" });
let nav;
try {
  await server.listen();
  const puerto = server.httpServer.address().port;
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  const errores = [];
  pag.on("pageerror", e => errores.push(e.message));
  await pag.goto(`http://127.0.0.1:${puerto}/`);
  await esNuestro(pag, puerto);
  await pag.waitForFunction(() => window.probe?.ready, null, { timeout: 120000 });
  await pag.locator(".ms-menu-op").filter({ hasText: /^Establish a Kingdom$/ }).click();
  await pag.locator(".v2-desplegable").click();
  await pag.locator(".v2-lista-abierta > button").filter({ hasText: /^edana$/ }).click();
  await pag.locator(".v2-boton").filter({ hasText: /^Start$/ }).click();
  await pag.waitForURL(/map=edana/);
  await pag.waitForFunction(() => window.probe?.ready, null, { timeout: 120000 });
  assert.equal(await pag.evaluate(() => window.probe.level.name), "edana");
  await pag.evaluate(() => window.probe.sesion.nuevo("Conversacion", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null);
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));
  const npc = await pag.evaluate(() => {
    const n = window.probe.vgui.npcs().find(n => n.script === "edana/mergur");
    if (!n) return null;
    window.probe.mundo.poner(n.donde[0], n.donde[1], n.donde[2] - 1);
    window.probe.mundo.mirar(n.donde[0], n.donde[1] + 0.9, n.donde[2]);
    return { id: n.id, nombre: n.nombre };
  });
  assert.ok(npc, "debe existir el encargado del mercado");
  await pag.waitForFunction(id => window.probe.vgui.delante()?.id === id, npc.id);
  const antes = await pag.evaluate(() => window.probe.misiones.dicho().join(" "));
  assert.ok(!antes.includes("Greetings and welcome"), "la respuesta no puede estar antes del clic");
  await pag.keyboard.press("KeyF");
  await pag.waitForFunction(() => window.probe.vgui.abierto() === "interact");
  assert.equal(await pag.evaluate(() => window.probe.vgui.panel().titulo), npc.nombre);
  const opciones = await pag.evaluate(id => window.probe.misiones.opcionesDe(id), npc.id);
  assert.ok(opciones?.some(o => o.titulo === "Hail"), "el menú viene del guion vivo");
  const boton = await pag.evaluate(() => window.probe.vgui.botones().find(b => b.texto === "Hail"));
  assert.ok(boton?.sirve);
  await pag.mouse.click(boton.centro, boton.arriba + 5);
  await pag.waitForFunction(() => window.probe.misiones.dicho().join(" ").includes("Greetings and welcome"));
  assert.equal(await pag.evaluate(() => window.probe.vgui.abierto()), null);
  // Abrir de nuevo confirma que la primera elección no desconectó el panel.
  await pag.keyboard.press("KeyF");
  await pag.waitForFunction(() => window.probe.vgui.abierto() === "interact");
  assert.ok((await pag.evaluate(() => window.probe.vgui.botones())).some(b => b.texto === "Hail"));
  mkdirSync("build/edana/vistas", { recursive: true });
  await pag.screenshot({ path: "build/edana/vistas/interacciones51.png" });
  await pag.keyboard.press("Escape");
  assert.deepEqual(errores, []);
  console.log("Edana: entrada por menú, NPC correcto, Hail por clic, respuesta del guion y reapertura comprobados.");
} finally {
  await nav?.close();
  await server.close();
}
