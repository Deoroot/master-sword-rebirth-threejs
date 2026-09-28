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
import { mkdirSync } from "node:fs";

const PORT = 5196;
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));
const nav = await chromium.launch();
const pag = await nav.newPage({ viewport: { width: 1200, height: 900 } });
const errores = [];
pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
pag.on("console", (m) => { if (m.type() === "error") errores.push(`consola: ${m.text().slice(0, 160)}`); });
await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
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
  const c = document.querySelectorAll("canvas.mx-retrato")[i];
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

// ── 1. la pantalla sale antes que el retrato, y antes que el mapa ──────────
await pag.waitForSelector(".mx-velo", { timeout: 60000 });
const alSalir = await pag.evaluate(() => ({
  ms: Math.round(performance.now()),
  mapa: window.probe?.ready === true,
  retratos: document.querySelectorAll("canvas.mx-retrato").length,
}));
console.log(`  la pantalla sale a los ${alSalir.ms} ms · ${alSalir.retratos} huecos de retrato · mapa: ${alSalir.mapa ? "sí" : "todavía no"}`);
control("la pantalla sale sin esperar al modelo", alSalir.ms < 1500, `${alSalir.ms} ms`);
control("y sin esperar al mapa", alSalir.mapa === false);
// Los huecos existen desde el primer instante aunque estén vacíos: es lo que
// impide que la lista se recoloque cuando llega la figura.
control("los huecos del retrato están ya en el árbol", alSalir.retratos >= 1, `${alSalir.retratos}`);
await foto("0-hueco-vacio");

// ── 2. y luego se llena ────────────────────────────────────────────────────
//
// Es la comprobación que más vale de toda la sonda: un `canvas` transparente es
// el resultado de media docena de fallos distintos y de ninguna excepción.
await pag.waitForFunction(() => {
  const c = document.querySelector("canvas.mx-retrato");
  if (!c || !c.width) return false;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  for (let p = 3; p < d.length; p += 4) if (d[p] > 8) return true;
  return false;
}, null, { timeout: 90000 }).catch(() => {});

// Se espera a que la ranura libre TERMINE de sentarse antes de medirla.
//
// `sitdown` dura 2,4 s y no es «estar sentado»: es la acción de sentarse, que
// empieza de pie. Midiendo antes de que acabe, la misma pantalla da unas veces
// una figura de pie y otras una sentada — y eso hizo que dos ejecuciones
// seguidas de esta sonda dieran números distintos sin que cambiara nada.
await pag.waitForTimeout(2600);
const vacia = await medirLienzo(0);
console.log(`  la ranura vacía: ${vacia ? `${(vacia.fraccion * 100).toFixed(1)} % pintado, brillo ${vacia.brillo.toFixed(0)}, filas ${(vacia.arriba * 100).toFixed(0)}–${(vacia.abajo * 100).toFixed(0)} %` : "SIN LIENZO"}`);
control("el retrato se dibuja de verdad", Boolean(vacia?.pintados), vacia ? `${vacia.pintados} píxeles` : "nada");
// Un cuerpo humano visto de frente en una caja ajustada ocupa entre un 10 y un
// 60 % de ella. Menos es un punto perdido; más es que se está pintando el fondo
// entero, que sería el síntoma de copiar el trozo equivocado del lienzo
// compartido.
control("y ocupa lo que ocupa una persona, no un rectángulo",
  vacia && vacia.fraccion > 0.06 && vacia.fraccion < 0.62,
  `${((vacia?.fraccion ?? 0) * 100).toFixed(1)} %`);
control("y no está cortado por arriba ni por abajo",
  vacia && vacia.arriba > 0.002 && vacia.abajo < 0.999,
  `de ${((vacia?.arriba ?? 0) * 100).toFixed(1)} % a ${((vacia?.abajo ?? 1) * 100).toFixed(1)} %`);
await foto("1-lista-con-retratos");

// ── 3. se mueve — pero en el momento en el que le toca ─────────────────────
//
// La primera versión de esto tomaba dos huellas separadas 700 ms **en reposo** y
// exigía que cambiaran. Se puso roja, y tenía razón el juego: medido sobre los
// vértices animados, las dos posturas de reposo de `reference.mdl` están
// QUIETAS a propósito —`idle` recorre 0,00 unidades y `attention` 0,92— y la
// vida la pone el `stretch` que salta cada 6 a 60 segundos. O sea que la sonda
// estaba midiendo que un personaje en pose de firmes se moviera.
//
// Así que se mide donde sí tiene que haber movimiento: mientras corre una
// animación de las que recorren 40 unidades o más.
const huella = () => pag.evaluate(() => {
  const c = document.querySelector("canvas.mx-retrato");
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let h = 0;
  for (let p = 0; p < d.length; p += 4) h = (h * 31 + d[p + 3] + d[p]) | 0;
  return h;
});
// Estar quieto en reposo es lo CORRECTO, y se comprueba como tal.
const q1 = await huella();
await pag.waitForTimeout(500);
const q2 = await huella();
console.log(`  en reposo: ${q1 === q2 ? "quieta (como el juego)" : "se mueve"}`);

// Y ahora el movimiento, forzando el `stretch`: es la animación que el mod
// dispara con su temporizador, y aquí se pide a mano para no esperar un minuto.
await pag.evaluate(() => {
  const caja = document.querySelector(".mx-caja-retrato");
  caja?._ranura?.animar("tic");
});
await pag.waitForTimeout(120);
const m1 = await huella();
await pag.waitForTimeout(400);
const m2 = await huella();
console.log(`  durante el stretch: ${m1} → ${m2}`);
// Iguales al píxel quiere decir figura congelada, que es lo que sale si las
// pistas no encuentran a sus huesos — y los de este modelo se llaman
// `Bip01 L Arm2`, con espacios, que es el caso en el que Three.js no avisa.
control("la figura se mueve cuando toca", m1 !== m2, m1 === m2 ? "congelada" : "cambia");

// ── 4. crear personaje: la vista previa y el género ────────────────────────
await pag.click('button:text-is("new character")');
await pag.waitForSelector(".mx-crear", { timeout: 20000 });
await pag.waitForTimeout(1200);
const hombre = await medirLienzo(0);
console.log(`  vista previa, hombre: ${(hombre.fraccion * 100).toFixed(1)} % pintado`);
control("la creación trae vista previa", Boolean(hombre?.pintados), `${hombre?.pintados} píxeles`);

// El género, que hasta ahora se guardaba y nunca se preguntaba.
await pag.click('.mx-crear >> button:text-is("woman")');
await pag.waitForTimeout(900);
const mujer = await medirLienzo(0);
console.log(`  vista previa, mujer:  ${(mujer.fraccion * 100).toFixed(1)} % pintado`);
// Distintas de verdad, en la pantalla. En Node se comprobó que las mallas tienen
// 972 y 1216 triángulos; esto comprueba que esa diferencia LLEGA al píxel, que
// es lo que fallaría si `cambiarGenero` no volviera a atar el esqueleto.
const dif = Math.abs(hombre.fraccion - mujer.fraccion);
control("hombre y mujer se ven distintos", dif > 0.004 || hombre.pintados !== mujer.pintados,
  `${(hombre.fraccion * 100).toFixed(2)} % vs ${(mujer.fraccion * 100).toFixed(2)} %`);
control("y el retrato no se queda en blanco al cambiar", Boolean(mujer?.pintados));
await foto("2-creacion-mujer");

// ── 5. el ciclo entero con un personaje, hasta el inventario ───────────────
await pag.fill(".mx-crear input.mx-input", "Retrato");
await pag.click('button:text-is("create")');
await pag.waitForSelector(".mx-tarjeta .mx-nombre", { timeout: 20000 });
await pag.waitForTimeout(1200);
const tarjeta = await medirLienzo(0);
console.log(`  la tarjeta del personaje: ${(tarjeta.fraccion * 100).toFixed(1)} % pintado`);
control("el personaje creado sale con su retrato", Boolean(tarjeta?.pintados));
// La ranura vacía sigue ahí, con su figura sentada — que es `sitdown`, la
// animación que el mod eligió para una ranura sin nadie.
const cuantos = await pag.evaluate(() => document.querySelectorAll("canvas.mx-retrato").length);
control("y la ranura libre sigue con su figura", cuantos >= 2, `${cuantos} retratos`);
await foto("3-tarjeta-y-ranura-libre");

// Al pasar el ratón por encima salta, que es `reg.hud.char.highlight`.
const antesDeSenalar = await huella();
await pag.hover(".mx-tarjeta .mx-nombre");
await pag.waitForTimeout(500);
const senalado = await huella();
control("al pasar el ratón cambia de animación", antesDeSenalar !== senalado);

// Entrar y abrir el inventario: el personaje al centro y la rejilla debajo.
await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });
await pag.click('.mx-tarjeta >> button:text-is("play")');
await pag.waitForTimeout(1200);
// Jugando no debe quedar ningún retrato animándose: se sueltan al cerrar.
const jugando = await pag.evaluate(() => window.probe?.interfaz?.retratos ?? null);
console.log(`  retratos vivos jugando: ${jugando}`);
control("jugando no queda ningún retrato animándose", jugando === 0, String(jugando));

await pag.keyboard.press("KeyI");
await pag.waitForSelector(".mx-inv-cuerpo", { timeout: 20000 });
await pag.waitForTimeout(1200);
const inv = await medirLienzo(0);
console.log(`  el inventario: ${(inv.fraccion * 100).toFixed(1)} % pintado, centro en ${(inv.centroY * 100).toFixed(0)} % del alto`);
control("el inventario trae el personaje", Boolean(inv?.pintados));
// Y encima de la rejilla, que es lo que se pidió.
const orden = await pag.evaluate(() => {
  const c = document.querySelector(".mx-inv-cuerpo");
  const r = document.querySelector(".mx-rejilla");
  if (!c || !r) return null;
  return c.getBoundingClientRect().top < r.getBoundingClientRect().top;
});
control("el personaje está ENCIMA de la rejilla", orden === true);

// Y CABE EN LA PANTALLA, que es el fallo que encontró esta sonda.
//
// La casilla de la rejilla estaba a `minmax(52px, 1fr)` y crecía hasta llenar
// el panel; como es cuadrada, seis filas medían 516 px. Con el personaje encima
// el panel pasaba de la ventana y el título se iba fuera por arriba. No es un
// error de JavaScript: es un panel cuyo primer renglón no se ve.
const cabe = await pag.evaluate(() => {
  const p = document.querySelector(".mx-velo .mx-panel");
  const v = document.querySelector(".mx-velo");
  if (!p || !v) return null;
  const r = p.getBoundingClientRect();
  return { alto: Math.round(r.height), ventana: window.innerHeight, arriba: Math.round(r.top),
    scroll: v.scrollTop };
});
console.log(`  el panel mide ${cabe.alto} px en una ventana de ${cabe.ventana}, empieza en ${cabe.arriba}`);
control("el inventario cabe en la pantalla", cabe && cabe.alto <= cabe.ventana,
  `${cabe?.alto} px de ${cabe?.ventana}`);
control("y el título no se va por arriba", cabe && cabe.arriba >= 0, `arriba en ${cabe?.arriba}`);
await foto("4-inventario");

// ── 5b. la hoja: maestro-detalle, y sólo una desplegada ───────────────────
await pag.keyboard.press("KeyP");
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
for (let i = 0; i < 4; i++) {
  await pag.keyboard.press("KeyP");
  await pag.waitForTimeout(250);
  await pag.keyboard.press("KeyI");
  await pag.waitForSelector(".mx-inv-cuerpo", { timeout: 20000 });
  await pag.waitForTimeout(350);
  cuenta.push(await pag.evaluate(() => window.probe?.interfaz?.retratos ?? -1));
}
console.log(`  retratos vivos tras 4 vueltas: ${cuenta.join(" → ")}`);
control("las ranuras no se acumulan al cambiar de pantalla",
  cuenta.every((n) => n === cuenta[0]), cuenta.join(" → "));

// ── el veredicto ───────────────────────────────────────────────────────────
console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(52)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}`);

await nav.close(); matar(dev);
process.exit(mal.length || errores.length ? 1 : 0);
