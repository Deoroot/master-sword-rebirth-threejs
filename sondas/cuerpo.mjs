// EL MODELO DEL PERSONAJE EN PANTALLA, mirado con píxeles y no con fe.
//
// Las 12 comprobaciones de `test/juego_cuerpo.test.mjs` dicen que el `.mdl`
// correcto se lee bien y que el `body` de cada género sale calculado. No dicen
// que se VEA, que es otra cosa — y es justo la clase de fallo que este
// experimento ya ha pagado dos veces: un dato bien calculado que nadie dibuja no
// da error.
//
// Lo que se mide aquí sólo se puede medir aquí:
//
//   1. que el retrato no sea un `canvas` VACÍO. Un esqueleto mal atado, una
//      textura que no carga o una cámara mirando al otro lado dan exactamente
//      cero excepciones y un rectángulo transparente.
//   2. que se MUEVA. Una figura congelada es lo que sale si las pistas no
//      encuentran sus huesos, y es indistinguible de una postura de reposo.
//   3. que hombre y mujer se vean DISTINTOS en la pantalla, no sólo en el
//      recuento de triángulos.
//   4. que el retrato no retrase la pantalla de personajes, que es lo que
//      costó la reestructuración anterior.
//   5. que al cambiar de pantalla no se queden ranuras animándose de balde.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5196;
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
const pag = await nav.newPage({ viewport: { width: 1200, height: 900 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
pag.on("console", (m) => { if (m.type() === "error") errores.push(`consola: ${m.text().slice(0, 160)}`); });
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
await esNuestro(pag, PORT);
mkdirSync("build/gatecity/vistas", { recursive: true });
const foto = async (n) => { await pag.waitForTimeout(400); await pag.screenshot({ path: `build/gatecity/vistas/cuerpo-${n}.png` }); };

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

/**
 * Cuenta los píxeles con algo dentro de un `canvas` y devuelve su huella.
 *
 * Se hace con `getImageData` sobre el `canvas` 2D de la página, que es
 * exactamente lo que el jugador tiene delante: si el `drawImage` desde el
 * renderizador compartido copiara el trozo equivocado, aquí saldría cero.
 */
const medirLienzo = (indice) => pag.evaluate((i) => {
  const c = document.querySelectorAll("canvas.vg-char-retrato, canvas.mx-retrato")[i];
  if (!c) return null;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let pintados = 0, suma = 0, sumaY = 0, minY = 1e9, maxY = -1e9;
  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] < 8) continue;
    pintados++;
    suma += d[p] + d[p + 1] + d[p + 2];
    const y = Math.floor((p / 4) / c.width);
    sumaY += y;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    ancho: c.width, alto: c.height, pintados,
    fraccion: pintados / (c.width * c.height),
    brillo: pintados ? suma / pintados / 3 : 0,
    centroY: pintados ? sumaY / pintados / c.height : 0,
    // De qué fila a qué fila hay figura: es lo que dice si el encuadre la deja
    // dentro o la corta.
    arriba: pintados ? minY / c.height : 0,
    abajo: pintados ? maxY / c.height : 0,
  };
}, indice);

// LA PANTALLA DE PERSONAJES ES OTRA DESDE EL EXPERIMENTO 30.
//
// Esta sonda conducía las pantallas de `src/juego/interfaz.js` —`.mx-velo`,
// `.mx-crear`, `.mx-tarjeta`— y ésas eran las inventadas. Ahora la entrada es un
// panel de VGUI portado y el camino es otro, pero **las preguntas son las
// mismas**: ¿sale antes que el modelo?, ¿se pinta de verdad?, ¿se mueve cuando
// toca?, ¿se ve distinta una mujer de un hombre?
//
// Y una nota de la mudanza que vale más que los controles: durante un rato esta
// sonda estuvo midiendo **el proyecto de al lado**. Un `vite` de «Mydra Web Lab»
// se quedó escuchando en el 5196, `--strictPort` hizo que el nuestro no
// arrancara sin decir nada, y los veintinueve controles salían en verde sobre
// las pantallas viejas de otra carpeta. Ver `sondas/mismo.mjs`.

// ── 1. la pantalla sale antes que el retrato, y antes que el mapa ──────────
// Se espera el NODO y no `window.probe`, y eso importa: `probe` se cuelga al
// FINAL de `mainGateCity`, cuando el mapa ya está. Preguntando por él la
// respuesta a «¿sale antes que el mapa?» sería siempre «no», y el control
// estaría midiendo el orden de su propia espera. Fue así en el primer intento.
await pag.waitForSelector("canvas.vg-char-retrato", { timeout: 60000 });
const alSalir = await pag.evaluate(() => ({
  ms: Math.round(performance.now()),
  mapa: window.probe?.ready === true,
  retratos: document.querySelectorAll("canvas.vg-char-retrato").length,
}));
console.log(`  la pantalla sale a los ${alSalir.ms} ms · ${alSalir.retratos} huecos de retrato · mapa: ${alSalir.mapa ? "sí" : "todavía no"}`);
control("la pantalla de personajes sale antes que el mapa", alSalir.mapa === false,
  `${alSalir.ms} ms, mapa ${alSalir.mapa}`);
// Los huecos existen desde el primer instante aunque estén vacíos: es lo que
// impide que la pantalla se recoloque cuando llega la figura.
control("y sus tres huecos de retrato están ya en el árbol", alSalir.retratos >= 3, `${alSalir.retratos}`);
await foto("0-hueco-vacio");

// ── 2. y luego se llena ────────────────────────────────────────────────────
//
// La comprobación que más vale de toda la sonda: un `canvas` transparente es
// exactamente igual de «correcto» que uno con una persona dentro, y ninguna
// cifra de Node distingue los dos casos.
await pag.waitForFunction(() => {
  const c = document.querySelector("canvas.vg-char-retrato");
  if (!c || !c.width) return false;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  for (let p = 3; p < d.length; p += 4) if (d[p] > 8) return true;
  return false;
}, null, { timeout: 60000 }).catch(() => {});
await pag.waitForTimeout(1800);
const vacia = await medirLienzo(0);
console.log(`  el retrato: ${vacia?.pintados} px pintados, ${(vacia?.fraccion * 100).toFixed(1)} % del lienzo, ` +
  `de la fila ${(vacia?.arriba * 100).toFixed(0)} % a la ${(vacia?.abajo * 100).toFixed(0)} %`);
control("el retrato se dibuja de verdad", Boolean(vacia?.pintados), vacia ? `${vacia.pintados} píxeles` : "nada");
control("y ocupa lo que ocupa una persona, no un rectángulo",
  vacia && vacia.fraccion > 0.03 && vacia.fraccion < 0.6, `${(vacia?.fraccion * 100).toFixed(1)} %`);

// ── 3. se mueve ────────────────────────────────────────────────────────────
const huella = () => pag.evaluate(() => {
  const c = document.querySelector("canvas.vg-char-retrato");
  if (!c) return null;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let p = 0; p < d.length; p += 64) h = (h * 31 + d[p] + d[p + 3]) | 0;
  return h;
});
const m1 = await huella();
await pag.waitForTimeout(700);
const m2 = await huella();
control("la figura se anima, no es una foto", m1 !== m2, m1 === m2 ? "congelada" : "cambia");

// ── 4. crear personaje: el género se ve ────────────────────────────────────
//
// Con el `1`, que es la tecla de verdad: `SlotInput(dígito − 1)`.
await pag.keyboard.press("Digit1");
await pag.waitForTimeout(1500);
const hombre = await medirLienzo(0);
control("la etapa de «quién eres» trae los dos modelos", Boolean(hombre?.pintados),
  `${hombre?.pintados} píxeles`);
await pag.click('button.vg-boton:text-is("Female")');
await pag.waitForTimeout(900);
const mujer = await medirLienzo(1);
// Distintas de verdad, en la pantalla. En Node se comprobó que las mallas tienen
// 972 y 1216 triángulos; esto comprueba que esa diferencia LLEGA al píxel.
console.log(`  hombre ${(hombre?.fraccion * 100).toFixed(2)} % · mujer ${(mujer?.fraccion * 100).toFixed(2)} %`);
control("hombre y mujer se ven distintos",
  mujer && hombre && (Math.abs(hombre.fraccion - mujer.fraccion) > 0.004 || hombre.pintados !== mujer.pintados),
  `${(hombre?.fraccion * 100).toFixed(2)} % vs ${(mujer?.fraccion * 100).toFixed(2)} %`);
await foto("2-creacion-mujer");

// ── 5. el ciclo entero, hasta estar jugando ────────────────────────────────
await pag.fill(".vg-char-campo", "Retrato");
await pag.keyboard.press("Enter");
await pag.waitForTimeout(700);
await pag.keyboard.press("Digit1");
await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 });
await pag.waitForTimeout(2200);
// Jugando no debe quedar ningún retrato animándose: se sueltan al entrar.
const jugando = await pag.evaluate(() => window.probe.vgui.retratosVivos());
console.log(`  retratos vivos jugando: ${jugando}`);
control("jugando no queda ningún retrato animándose", jugando === 0, String(jugando));
await foto("3-jugando");

// La `i` abre el inventario portado, no la rejilla que se retiró en el 31.
await pag.keyboard.press("KeyI");
await pag.waitForTimeout(800);
const invNuevo = await pag.evaluate(() => ({
  panel: window.probe.vgui?.abierto?.() ?? null,
  rejilla: document.querySelectorAll(".mx-rejilla, .mx-casilla").length,
}));
console.log(`  la i abre: ${invNuevo.panel} · casillas de la rejilla vieja: ${invNuevo.rejilla}`);
control("la `i` abre el inventario portado, no la rejilla inventada",
  invNuevo.panel === "inventory" && invNuevo.rejilla === 0,
  `${invNuevo.panel}, ${invNuevo.rejilla} casillas`);
await pag.keyboard.press("Escape");
await pag.waitForTimeout(400);
await foto("4-inventario");

// ── 5b. la hoja SUPLENTE: maestro-detalle, y sólo una desplegada ──────────
//
// La `p` abre Character Info, el panel portado del experimento 32
// (`sondas/hoja32.mjs`). Lo que se mide aquí es la hoja **suplente** de
// `src/juego/interfaz.js`, que sigue existiendo por si el panel no está
// montado, y lo que de verdad comprueba es el MODELO DE DATOS: que las
// habilidades sean nueve, que la magia tenga cinco escuelas y no tres
// propiedades, que `parry` tenga una sola. Eso es `src/juego/stats.js` y no
// cambia con el panel.
//
// Se abre llamándola, y no con la tecla, porque la tecla ya no es suya.
await pag.evaluate(() => window.probe.interfaz.hoja());
await pag.waitForSelector(".mx-hoja", { timeout: 20000 });
await pag.waitForTimeout(900);
const hoja = await pag.evaluate(() => ({
  filas: document.querySelectorAll(".mx-hab-fila").length,
  elegidas: document.querySelectorAll(".mx-hab-fila.mx-elegida").length,
  // Las barras del detalle: si estuvieran las 27 a la vez, esto lo diría.
  barrasDetalle: document.querySelectorAll(".mx-detalle .mx-prop").length,
  grupos: [...document.querySelectorAll(".mx-hoja h3")].map((h) => h.textContent),
  cabecera: document.querySelector(".mx-detalle-cab span")?.textContent ?? null,
  retrato: document.querySelectorAll(".mx-hoja canvas.mx-retrato").length,
  alto: Math.round(document.querySelector(".mx-velo .mx-panel").getBoundingClientRect().height),
}));
console.log(`  la hoja: ${hoja.filas} habilidades, ${hoja.elegidas} abierta (${hoja.cabecera}), ` +
  `${hoja.barrasDetalle} barras de detalle · ${hoja.alto} px`);
control("la hoja lista las nueve habilidades", hoja.filas === 9, `${hoja.filas}`);
// LO QUE ERA EL PROBLEMA: 27 barras a la vez. Ahora sólo las de una.
control("y sólo despliega UNA", hoja.elegidas === 1 && hoja.barrasDetalle <= 5,
  `${hoja.elegidas} elegida, ${hoja.barrasDetalle} barras`);
control("con el personaje en la hoja", hoja.retrato === 1);
control("y los grupos marcados", hoja.grupos.includes("Weapons") && hoja.grupos.includes("Magic"),
  hoja.grupos.join(", "));
control("la hoja cabe en la pantalla", hoja.alto <= 900, `${hoja.alto} px`);

// Elegir otra cambia el detalle, y Spell Casting tiene CINCO propiedades — no
// tres. Es el detalle que se pierde si uno asume una rejilla.
await pag.click(".mx-hab-fila:has-text('Spell Casting')");
await pag.waitForTimeout(300);
const magia = await pag.evaluate(() => ({
  cabecera: document.querySelector(".mx-detalle-cab span")?.textContent ?? null,
  props: [...document.querySelectorAll(".mx-detalle .mx-prop > span:first-child")].map((s) => s.textContent),
  aporta: [...document.querySelectorAll(".mx-aporta > span:nth-child(3n+1)")].map((s) => s.textContent),
}));
console.log(`  Spell Casting: ${magia.props.join(", ")} → sube ${magia.aporta.join(", ")}`);
control("cambiar de habilidad cambia el detalle", magia.cabecera === "Spell Casting", magia.cabecera);
control("y la magia tiene CINCO escuelas, no tres propiedades", magia.props.length === 5,
  magia.props.join(", "));
// Y «entrenarla sube» está CALCULADO de los pesos de GetStat(), no copiado.
control("con lo que hace crecer, en orden de lo que rinde",
  magia.aporta[0] === "Wisdom", magia.aporta.join(" > "));

// Parry no aporta a ningún atributo, y eso es un dato del motor.
await pag.click(".mx-hab-fila:has-text('Parry')");
await pag.waitForTimeout(300);
const parry = await pag.evaluate(() => ({
  props: document.querySelectorAll(".mx-detalle .mx-prop").length,
  aporta: document.querySelectorAll(".mx-aporta > span").length,
  nota: document.querySelector(".mx-detalle .mx-nota")?.textContent ?? "",
}));
console.log(`  Parry: ${parry.props} propiedad · aporta a ${parry.aporta ? "algo" : "nada"}`);
control("Parry tiene UNA sola propiedad", parry.props === 1, `${parry.props}`);
control("y se dice que no aporta a ningún atributo",
  parry.aporta === 0 && /no attribute/i.test(parry.nota), parry.nota.slice(0, 40));
await foto("5-hoja");

// ── 6. y no se acumulan ranuras ────────────────────────────────────────────
//
// Cada vuelta a una pantalla monta retratos nuevos. Si los viejos no se sueltan,
// se quedan un esqueleto y un mezclador por vuelta animándose para un `canvas`
// que ya no está en la página. No da error: da una pantalla que va cada vez más
// despacio, y eso no se nota hasta la décima vuelta.
const cuenta = [];
// Se abre y se cierra LA HOJA SUPLENTE, que es la que trae retrato: los paneles
// de VGUI no tienen ninguno fuera de la pantalla de personajes, así que con
// ellos el contador sería cero siempre y el control no mediría nada.
for (let i = 0; i < 4; i++) {
  await pag.evaluate(() => window.probe.interfaz.hoja());
  await pag.waitForTimeout(400);
  cuenta.push(await pag.evaluate(() => window.probe.vgui.retratosVivos()));
  await pag.evaluate(() => window.probe.interfaz.cerrar());
  await pag.waitForTimeout(200);
}
console.log(`  retratos vivos tras 4 vueltas: ${cuenta.join(" → ")}`);
control("las ranuras no se acumulan al cambiar de pantalla",
  cuenta.every((n) => n <= cuenta[0]) && cuenta[0] >= 1, cuenta.join(" → "));

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(52)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
