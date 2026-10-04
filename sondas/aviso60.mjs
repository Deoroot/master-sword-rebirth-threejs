// LAS DOS VENTANAS DE ARRIBA, medidas en la pantalla de verdad.
//
//   npm run sonda:aviso60
//
// LO QUE ESTO EXISTE PARA MEDIR es **en qué esquina sale cada mensaje**, que
// es lo que estaba mal y no lo vio nadie en veinte experimentos.
//
// Master Sword tiene tres sitios donde te escribe, y están separados a
// propósito desde 2008 —el comentario del mod en `AddHelpWin` dice literalmente
// «moving helptip window not to overlap eventhud»—:
//
//   `SendInfoMsg`  la consola de sucesos, ABAJO A LA DERECHA.
//   `SendHUDMsg`   un recuadro con título rojo, ARRIBA A LA IZQUIERDA.
//                  player.h:554 lo remata: «HUD message - top left».
//   `SendHelpMsg`  lo mismo con título verde, ARRIBA A LA DERECHA.
//
// Y este puerto mandaba los tres al primero. La presentación del mapa —«Gate
// City», «Intended Difficulty», «WARNING»— y el anuncio de subir de nivel
// salían entre los «Hit Goblin: 3.4 slash damage.» (el 86: entonces ese texto era «3.4 damage to Goblin», que resultó ser nuestro), juntando título y texto con un
// guion. Se leía igual de bien, que es exactamente por qué aguantó: **un
// mensaje en la esquina que no es no da ningún error**. Sólo se ve jugando.
//
// Las formas de que esto parezca funcionar y esté mal:
//
//   1. la ventana se monta y nadie la coloca    -> sale en (0,0), sobre el arma
//   2. sale donde la consola                    -> el fallo del 60, otra vez
//   3. sale y no se va nunca                    -> falta `paso` en el bucle
//   4. se va y deja el `div`                    -> invisible y tapando clics
//   5. dos avisos se pintan encima              -> la pila no apila
//   6. la ayuda sale a la izquierda             -> se usó `INFOWIN_HELP_DISPLAY_X`,
//                                                  que el mod declara y pisa
//   7. el fondo es opaco                        -> se perdió `INFOWIN_BKTRANS`
//   8. la presentación del mapa sigue en la consola -> se arregló el dibujo y
//                                                  no el enrutado, que era el fallo
//   9. y la de siempre: se mide la regla y no la pantalla.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5219;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = await arrancarVite(PORT);
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
const nav = await chromium.launch();
const ANCHO = 1200, ALTO = 800;
const pag = await nav.newPage({ viewport: { width: ANCHO, height: ALTO } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
// Se entra por el menú, como el jugador (59). Y aquí no es opcional: la
// presentación del mapa cuelga de `game_player_putinworld`, que es lo que
// dispara «Start» — por `?map=` el camino es otro.
await entrarPorElMenu(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

// ── 1. LA VENTANA SALE, Y SALE ARRIBA A LA IZQUIERDA ───────────────────────
await pag.evaluate(() => window.probe.aviso.poner("Gate City", "A city of dwarves."));
await pag.evaluate(() => window.probe.aviso.paso(1.0));   // que acabe de entrar
const una = await pag.evaluate(() => window.probe.aviso.esquinas());
console.log(`
  pantalla ${una.pantalla[0]}x${una.pantalla[1]}`);
console.log(`  aviso   en (${una.aviso?.x}, ${una.aviso?.y}) de ${una.aviso?.ancho}x${una.aviso?.alto}`);

control("la ventana de aviso existe en el DOM", una.aviso != null, "");
control("y está en la MITAD DE ARRIBA de la pantalla",
  una.aviso != null && una.aviso.y < ALTO / 2, `y = ${una.aviso?.y} de ${ALTO}`);
control("y en la MITAD IZQUIERDA",
  una.aviso != null && una.aviso.x < ANCHO / 2, `x = ${una.aviso?.x} de ${ANCHO}`);
// Que no esté en (0,0) es un control aparte y hace falta: una ventana sin
// colocar cumple las dos de arriba por accidente.
control("y no está pegada al origen, que es donde cae lo que nadie coloca",
  una.aviso != null && una.aviso.x > 0 && una.aviso.y > 0, `(${una.aviso?.x}, ${una.aviso?.y})`);
control("tiene tamaño: no es un div vacío",
  (una.aviso?.ancho ?? 0) > 0 && (una.aviso?.alto ?? 0) > 0,
  `${una.aviso?.ancho}x${una.aviso?.alto}`);

// ── 2. Y NO CAE DONDE LA CONSOLA DE SUCESOS ────────────────────────────────
//
// El control que da sentido a los de arriba. Se imprime un suceso para que la
// consola exista y se miden las dos cajas de verdad, no las dos cuentas.
await pag.evaluate(() => window.probe.hud.suceso("normal", "Hit Goblin: 3.4 slash damage.  "));
const dos = await pag.evaluate(() => window.probe.aviso.esquinas());
console.log(`  consola en (${dos.consola?.x}, ${dos.consola?.y}) de ${dos.consola?.ancho}x${dos.consola?.alto}`);
control("la consola de sucesos también está en pantalla: si no, no hay con qué comparar",
  dos.consola != null && dos.consola.ancho > 0,
  `${dos.consola?.ancho}x${dos.consola?.alto}`);
control("la consola está ABAJO y a la DERECHA, que es su sitio",
  dos.consola != null && dos.consola.y > ALTO / 2 && dos.consola.x > ANCHO / 2,
  `(${dos.consola?.x}, ${dos.consola?.y})`);
const solapan = (a, b) => a && b &&
  a.x < b.x + b.ancho && b.x < a.x + a.ancho &&
  a.y < b.y + b.alto && b.y < a.y + a.alto;
control("Y NO SE PISAN. Es el fallo del 60, y es lo único que mide esta sonda",
  !solapan(dos.aviso, dos.consola),
  `aviso (${dos.aviso?.x},${dos.aviso?.y}) vs consola (${dos.consola?.x},${dos.consola?.y})`);

// ── 3. LA DE AYUDA VA A LA OTRA ESQUINA DE ARRIBA ──────────────────────────
await pag.evaluate(() => window.probe.aviso.ayuda("Combat", "Hold the attack button to charge a blow."));
await pag.evaluate(() => window.probe.aviso.paso(1.0));
const tres = await pag.evaluate(() => window.probe.aviso.esquinas());
console.log(`  ayuda   en (${tres.ayuda?.x}, ${tres.ayuda?.y}) de ${tres.ayuda?.ancho}x${tres.ayuda?.alto}`);
control("la ventana de ayuda existe", tres.ayuda != null, "");
control("y está arriba a la DERECHA, no donde el aviso",
  tres.ayuda != null && tres.ayuda.y < ALTO / 2 && tres.ayuda.x > ANCHO / 2,
  `(${tres.ayuda?.x}, ${tres.ayuda?.y})`);
control("y tampoco se pisa con el aviso",
  !solapan(tres.ayuda, tres.aviso), "");
control("y tampoco con la consola",
  !solapan(tres.ayuda, tres.consola), "");
// Los colores, leídos del DOM: el aviso rojo (225,0,0) y la ayuda verde
// (0,200,20). Es lo que distingue «te avisan» de «te enseñan».
const colores = await pag.evaluate(() => [...document.querySelectorAll(".ms-aviso")]
  .map((n) => getComputedStyle(n.firstChild).color));
console.log(`  títulos: ${colores.join(" | ")}`);
control("el título del aviso es rojo y el de la ayuda verde, y no el mismo",
  colores.length === 2 && colores[0] !== colores[1], colores.join(" / "));

// ── 4. DOS AVISOS SE APILAN, NO SE PISAN ───────────────────────────────────
await pag.evaluate(() => window.probe.aviso.poner("Intended Difficulty", "Level 10-25"));
await pag.evaluate(() => window.probe.aviso.paso(0.5));
const pila = await pag.evaluate(() => window.probe.aviso.ventanas().filter((v) => v.clase === "aviso"));
console.log(`  pila:    ${pila.map((v) => `«${v.titulo}» y=${v.y}`).join(", ")}`);
control("las dos ventanas de aviso están vivas a la vez", pila.length === 2, `${pila.length}`);
control("y la segunda está DEBAJO de la primera, separadas",
  pila.length === 2 && pila[1].y >= pila[0].y + pila[0].alto,
  pila.length === 2 ? `${pila[0].y}+${pila[0].alto} vs ${pila[1].y}` : "");

await pag.screenshot({ path: "build/gatecity/vistas/aviso60.png" });

// ── 5. SE VAN SOLAS A LOS OCHO SEGUNDOS, Y SE LLEVAN SU `div` ──────────────
//
// El positivo va primero: a los 7 s sigue. Sin él, una implementación que las
// borrara al momento pasaría la comprobación de abajo.
//
// Se mide UNA ventana recién puesta y por su `t`, no contando cuántas quedan:
// el bucle del juego también le pasa su `dt` a la capa de mensajes, así que
// las que llevan un rato han envejecido más que los `paso()` que se les han
// dado a mano. Contar cuántas quedan hacía que este control dependiera de lo
// que hubieran tardado las medidas de arriba, y con eso se ponía rojo o verde
// según el día — que es un control que no mide, sólo que con otro disfraz.
const ciclo = await pag.evaluate(async () => {
  window.probe.aviso.poner("Reloj", "x");
  const antes = window.probe.aviso.paso(6.0).find((v) => v.titulo === "Reloj") ?? null;
  const despues = window.probe.aviso.paso(4.0).find((v) => v.titulo === "Reloj") ?? null;
  return { antes, despues, divs: document.querySelectorAll(".ms-aviso").length };
});
const despues = { vivas: ciclo.despues ? 1 : 0, divs: ciclo.divs };
console.log(`  a los ~6 s: ${ciclo.antes ? `viva, t=${ciclo.antes.t}` : "ya no está"};` +
  ` a los ~10 s: ${ciclo.despues ? "sigue" : "fuera"} (y ${ciclo.divs} div)`);
control("a los seis segundos todavía está: no se va antes de tiempo",
  ciclo.antes != null, ciclo.antes ? `t = ${ciclo.antes.t}` : "");
control("y pasados los ocho se ha ido", ciclo.despues == null, "");
control("y el `div` se ha ido con ellas, no se ha quedado invisible",
  despues.divs === 0, `${despues.divs} nodos`);

// ── 6. Y LO QUE DE VERDAD IMPORTA: LA PRESENTACIÓN DEL MAPA ────────────────
//
// Esto es el fallo entero, de punta a punta y por el camino del jugador: no
// «la ventana sabe dibujarse» sino «lo que el juego manda por `infomsg` sale
// en la ventana». Arreglar el dibujo y dejar el enrutado habría dado todos los
// controles de arriba en verde con el fallo puesto.
//
// `give_map_intro` llega a los 10 s de aparecer y `give_map_diff` a los 13
// (player_main.script:1029 y :533). Se avanza el reloj de los avisos a mano —
// los `setTimeout` son de verdad y hay que esperarlos— y se mira dónde han
// caído.
console.log("\n  esperando la presentación del mapa (13 s de reloj del juego)...");
await pag.waitForTimeout(14000);
await pag.evaluate(() => window.probe.aviso.paso(0.5));
// Y una línea nueva a la consola, que NO es un adorno: la del principio ya se
// ha ido sola —`ms_evthud_decaytime` son nueve segundos y han pasado catorce—
// y sin ella el control de abajo («no están en la consola») pasaría porque la
// consola está vacía, que es el apartado 4 de CLAUDE.md al pie de la letra.
// Se supo porque el positivo de al lado se puso rojo.
await pag.evaluate(() => window.probe.hud.suceso("normal", "Hit Goblin: 3.4 slash damage.  "));
const intro = await pag.evaluate(() => ({
  ventanas: window.probe.aviso.ventanas(),
  consola: window.probe.hud.estado().consola.lineas.map((l) => l.texto),
}));
console.log(`  ventanas: ${intro.ventanas.map((v) => `«${v.titulo}»`).join(", ") || "ninguna"}`);
console.log(`  consola:  ${intro.consola.map((t) => `«${t}»`).join(", ") || "vacía"}`);
const titulos = intro.ventanas.map((v) => v.titulo);
control("la presentación del mapa ha salido, y ha salido EN LA VENTANA",
  titulos.length > 0, titulos.join(", "));
control("el nombre del mapa es el título de una ventana, no una línea de consola",
  titulos.some((t) => t && t !== "WARNING" && t !== "Intended Difficulty"),
  titulos.join(", "));
// Y el contrario, que es la mitad que faltaba: que NO esté en la consola.
const enLaConsola = intro.consola.filter((t) =>
  titulos.some((x) => x && t.includes(x)) || /Intended Difficulty|WARNING/.test(t));
control("y NINGUNA de ellas se ha ido también a la consola de sucesos",
  enLaConsola.length === 0, enLaConsola.join(" | "));
// La consola tiene que seguir teniendo lo suyo: si estuviera vacía, la
// comprobación de arriba pasaría porque no hay nada que mirar.
control("mientras la consola sigue llevando lo que SÍ es suyo (`SendInfoMsg`)",
  intro.consola.length > 0, `${intro.consola.length} líneas`);

await pag.screenshot({ path: "build/gatecity/vistas/aviso60_intro.png" });

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(72)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);
console.log(`  capturas:       build/gatecity/vistas/aviso60.png y aviso60_intro.png\n`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
