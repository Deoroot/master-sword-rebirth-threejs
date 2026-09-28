// QUE LOS AJUSTES HAGAN ALGO, en un Chrome de verdad.
//
//   npm run sonda:ajustes37
//
// El 34 dibujó la ventana de «Options» y el 36 la puerta para llegar a ella.
// Los dos dejaron lo mismo pendiente: la ventana reunía los valores, pulsabas
// «Apply» y **no pasaba nada**. Ésta es la sonda de que ahora pasa.
//
// ── Por qué esto no lo puede probar `npm test` ────────────────────────────
//
// Las 22 pruebas de `test/juego_ajustes.test.mjs` comprueban las REGLAS: que
// 0,22 grados por cuenta es la fórmula del mod, que la tabla de gamma es la
// identidad cuando tiene que serlo. Ninguna de las 22 dice que mover el
// deslizador llegue hasta el ratón, hasta Web Audio o hasta la textura que
// tiene puesta la tarjeta. Eso es lo de aquí.
//
// Las formas de que esto esté verde midiendo nada:
//
//   1. leer el valor de la ventana                 -> se lee el EFECTO: grados,
//                                                     ganancia, píxel del atlas
//   2. aplicar sin cambiar nada y ver que «cambia» -> control positivo: aplicar
//                                                     lo mismo NO puede mover nada
//   3. el deslizador se escribe a mano             -> se arrastra con el ratón
//   4. el atlas «cambia» porque se recarga         -> se mide el píxel medio, y
//                                                     tiene que ir en la
//                                                     dirección del deslizador
//   5. el sonido «baja» y el contexto está dormido -> se comprueba `despierto`

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { esNuestro, liberarPuerto } from "./mismo.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5221;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

try {
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  await pag.goto(`http://localhost:${PORT}/?map=gatecity`, { waitUntil: "load" });
  await esNuestro(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });
  await pag.waitForFunction(() => window.probe?.ready === true, null, { timeout: 240000 });

  // ── 0. EL NOMBRE VIENE PUESTO, Y VIENE DEL CVAR ──────────────────────────
  //
  // Antes de crear nada: la pantalla de personajes propone un nombre porque el
  // mod lo saca del cvar `name` (`vgui_choosecharacter.cpp:411`). Aquí el
  // cuadro arrancaba VACÍO y el ajuste «Player name» no llegaba a ningún sitio.
  const propuesto = await pag.evaluate(() =>
    document.querySelector(".vg-char-campo")?.value ?? "no hay campo");
  control("la pantalla de personajes PROPONE el nombre del cvar `name`",
    propuesto === "Adventurer", `el cuadro dice "${propuesto}"`);

  await pag.evaluate(() => window.probe.sesion.nuevo("Sonda", "swords_rsword"));
  await pag.waitForFunction(() => window.probe.vgui.abierto() === null, null, { timeout: 60000 });
  await pag.evaluate(() => window.probe.vivo.congelarPaseo(true));

  // ── 1. LOS VALORES DEL config.cfg, YA PUESTOS SIN TOCAR NADA ─────────────
  //
  // No hace falta pulsar «Apply» para que el juego arranque con lo que dice el
  // archivo: eso es lo que tenía puesto quien jugaba.
  //
  // Antes, un clic de verdad en el mundo: **un `AudioContext` nace suspendido**
  // y ningún navegador lo deja sonar sin un gesto. Sin este clic la ganancia se
  // leería del campo guardado y no del nodo, que es justo lo que esta sonda no
  // quiere medir. Por eso el control mira también `despierto`.
  await pag.mouse.click(600, 400);
  await pag.waitForTimeout(500);
  const arranque = await pag.evaluate(() => ({
    raton: window.probe.ajustes.gradosPorCuenta(),
    volumen: window.probe.ajustes.volumen(),
    horneada: window.probe.ajustes.horneada(),
  }));
  control("el ratón gira 0,22 grados por cuenta, que es `sensitivity × m_yaw`",
    Math.abs(Math.abs(arranque.raton.yaw) - 0.22) < 1e-6,
    `${Math.abs(arranque.raton.yaw).toFixed(4)}°/cuenta con sensibilidad ${arranque.raton.sensibilidad}`);
  control("y el sonido arranca en el 0,12 del archivo, no en 1",
    Math.abs(arranque.volumen.efectos - 0.12) < 1e-6 && arranque.volumen.despierto === true,
    `efectos ${arranque.volumen.efectos}, música ${arranque.volumen.musica}, despierto ${arranque.volumen.despierto}`);
  control("la música va por su canal, con su propio 0,2",
    Math.abs(arranque.volumen.musica - 0.2) < 1e-6, `${arranque.volumen.musica}`);

  // ── 2. CONTROL POSITIVO: aplicar LO MISMO no puede cambiar nada ──────────
  //
  // Sin esto, «mover el brillo cambia el atlas» estaría verde con un código que
  // rehiciera el atlas siempre y lo dejara distinto por el camino.
  const brilloAntes = await pag.evaluate(() => window.probe.ajustes.brilloDelAtlas());
  await pag.keyboard.press("KeyG");
  await pag.waitForTimeout(300);
  const aplicar = async () => {
    for (const b of await pag.$$(".v2-boton")) {
      if ((await b.textContent()) === "Apply") { await b.click(); return true; }
    }
    return false;
  };
  const hayApply = await aplicar();
  await pag.waitForTimeout(400);
  const igual = await pag.evaluate(() => ({
    luz: window.probe.ajustes.luz(),
    brillo: window.probe.ajustes.brilloDelAtlas(),
  }));
  control("CONTROL POSITIVO: «Apply» sin tocar nada deja el atlas INTACTO",
    hayApply && igual.luz?.identidad === true && Math.abs(igual.brillo - brilloAntes) < 1e-9,
    `identidad ${igual.luz?.identidad}, ${brilloAntes?.toFixed(3)} -> ${igual.brillo?.toFixed(3)}`);

  // ── 3. LA SENSIBILIDAD LLEGA HASTA EL RATÓN ──────────────────────────────
  await pag.click(".v2-pestana:nth-child(3)");            // Mouse
  await pag.waitForTimeout(200);
  const desl = await pag.$(".v2-deslizador");
  const caja = await desl.boundingBox();
  await pag.mouse.click(caja.x + caja.width * 0.8, caja.y + caja.height / 2);
  await pag.waitForTimeout(200);
  const sinAplicar = await pag.evaluate(() => ({
    ventana: window.probe.vgui2.estado().opciones.valores.sensibilidad,
    grados: window.probe.ajustes.gradosPorCuenta(),
  }));
  control("arrastrado el deslizador y SIN aplicar, el ratón sigue como estaba",
    sinAplicar.ventana > 11 && Math.abs(Math.abs(sinAplicar.grados.yaw) - 0.22) < 1e-6,
    `la ventana dice ${sinAplicar.ventana.toFixed(2)}, el juego gira a ${Math.abs(sinAplicar.grados.yaw).toFixed(4)}°`);

  await aplicar();
  await pag.waitForTimeout(300);
  const aplicado = await pag.evaluate(() => ({
    ventana: window.probe.vgui2.estado().valores.sensibilidad,
    grados: window.probe.ajustes.gradosPorCuenta(),
  }));
  control("y al aplicar, gira lo que dice la ventana × `m_yaw`",
    Math.abs(Math.abs(aplicado.grados.yaw) - aplicado.ventana * 0.022) < 1e-6,
    `${aplicado.ventana.toFixed(2)} × 0,022 = ${(aplicado.ventana * 0.022).toFixed(4)}°/cuenta`);

  // ── 4. EL RATÓN INVERTIDO ES EL SIGNO DE m_pitch ─────────────────────────
  const invertido = await pag.evaluate(async () => {
    const antes = window.probe.ajustes.gradosPorCuenta();
    const c = [...document.querySelectorAll(".v2-casilla")]
      .find((n) => n.parentElement?.textContent?.includes("Reverse mouse"));
    if (!c || c.disabled) return { error: "la casilla no está o está apagada" };
    c.click();
    return { antes };
  });
  await aplicar();
  await pag.waitForTimeout(300);
  const trasInvertir = await pag.evaluate(() => window.probe.ajustes.gradosPorCuenta());
  control("«Reverse mouse» cambia el SIGNO del cabeceo y no toca el giro",
    !invertido.error && trasInvertir.invertido === true
      && Math.abs(trasInvertir.pitch + invertido.antes.pitch) < 1e-9
      && Math.abs(trasInvertir.yaw - invertido.antes.yaw) < 1e-9,
    invertido.error ?? `pitch ${invertido.antes.pitch.toFixed(4)} -> ${trasInvertir.pitch.toFixed(4)}, yaw igual`);

  // ── 5. EL VOLUMEN LLEGA HASTA WEB AUDIO ──────────────────────────────────
  await pag.click(".v2-pestana:nth-child(4)");            // Audio
  await pag.waitForTimeout(200);
  const dAudio = await pag.$(".v2-deslizador");
  const cAudio = await dAudio.boundingBox();
  await pag.mouse.click(cAudio.x + cAudio.width * 0.7, cAudio.y + cAudio.height / 2);
  await pag.waitForTimeout(150);
  await aplicar();
  await pag.waitForTimeout(300);
  const sonido = await pag.evaluate(() => ({
    ventana: window.probe.vgui2.estado().valores.volumen,
    real: window.probe.ajustes.volumen(),
  }));
  control("subir el volumen lo sube en el nodo de Web Audio, no en un campo",
    Math.abs(sonido.real.efectos - sonido.ventana) < 1e-6 && sonido.ventana > 0.12,
    `la ventana dice ${sonido.ventana.toFixed(2)}, la ganancia es ${sonido.real.efectos.toFixed(2)}`);
  control("y la música NO se mueve con ella: son dos canales, como en el motor",
    Math.abs(sonido.real.musica - 0.2) < 1e-6, `música ${sonido.real.musica}`);

  // ── 6. EL BRILLO REHACE EL MAPA DE LUZ ───────────────────────────────────
  //
  // Es lo único que hace el motor al mover la gamma: `R_GammaChanged(false)`
  // llama a `GL_RebuildLightmaps()` y a nada más. Las texturas se quedan con la
  // suya, y por eso la pestaña lleva su nota de «hay que reiniciar».
  await pag.click(".v2-pestana:nth-child(5)");            // Video
  await pag.waitForTimeout(250);
  const antesDelBrillo = await pag.evaluate(() => window.probe.ajustes.brilloDelAtlas());
  const dBrillo = await pag.$(".v2-deslizador");
  const cBrillo = await dBrillo.boundingBox();
  await pag.mouse.click(cBrillo.x + cBrillo.width * 0.02, cBrillo.y + cBrillo.height / 2);
  await pag.waitForTimeout(150);
  const pedido = await pag.evaluate(() => window.probe.vgui2.estado().opciones.valores.brillo);
  await aplicar();
  await pag.waitForTimeout(1200);
  const conBrillo = await pag.evaluate(() => ({
    luz: window.probe.ajustes.luz(),
    brillo: window.probe.ajustes.brilloDelAtlas(),
    horneada: window.probe.ajustes.horneada(),
  }));
  control("bajar el brillo rehace los 25 atlas del mapa de luz",
    conBrillo.luz?.identidad === false && conBrillo.luz?.texturas === 25,
    `${conBrillo.luz?.texturas} atlas, identidad ${conBrillo.luz?.identidad}`);
  control("y el mapa se OSCURECE de verdad: el píxel medio del atlas baja",
    conBrillo.brillo < antesDelBrillo - 1,
    `brillo ${conBrillo.horneada.brightness} -> ${pedido}: el atlas pasa de ` +
    `${antesDelBrillo.toFixed(1)} a ${conBrillo.brillo.toFixed(1)} sobre 255`);

  await pag.screenshot({ path: "build/gatecity/vistas/ajustes37.png" });
  console.log(`    captura         build/gatecity/vistas/ajustes37.png`);

  // ── 7. Y SE PUEDE VOLVER, SIN PERDER NADA POR EL CAMINO ──────────────────
  //
  // Encadenar remapeos —de 2 a 0 y de 0 a 2— perdería un poco en cada salto si
  // se remapeara lo ya remapeado. Se remapea siempre desde el horneado, así que
  // volver al valor del archivo tiene que devolver el atlas EXACTO del principio.
  const dVuelta = await pag.$(".v2-deslizador");
  const cVuelta = await dVuelta.boundingBox();
  // El deslizador de brillo va de 1 a 3 —lo que enseña la captura, aunque el
  // motor recorte a [0, 3]—, así que el 2 del `config.cfg` está justo en medio.
  await pag.mouse.click(cVuelta.x + cVuelta.width * 0.5, cVuelta.y + cVuelta.height / 2);
  await pag.waitForTimeout(150);
  await aplicar();
  await pag.waitForTimeout(1200);
  const vuelta = await pag.evaluate(() => ({
    valor: window.probe.vgui2.estado().valores.brillo,
    luz: window.probe.ajustes.luz(),
    brillo: window.probe.ajustes.brilloDelAtlas(),
  }));
  control("volver al brillo del archivo devuelve el atlas EXACTO, sin pérdida",
    Math.abs(vuelta.valor - 2) < 0.05 && vuelta.luz?.identidad === true
      && Math.abs(vuelta.brillo - antesDelBrillo) < 1e-9,
    `brillo ${vuelta.valor}, identidad ${vuelta.luz?.identidad}, atlas ${vuelta.brillo?.toFixed(3)}`);

  // ── 8. Y EL JUEGO SIGUE ENTERO ───────────────────────────────────────────
  await pag.keyboard.press("Escape");
  await pag.waitForTimeout(300);
  const final = await pag.evaluate(() => {
    window.probe.hud.avanzar(1);
    return { hud: window.probe.hud.estado().visible, abiertas: window.probe.vgui2.abiertas() };
  });
  control("el HUD sigue en pie y no queda ninguna ventana abierta",
    final.hud === true && final.abiertas === 0, JSON.stringify(final));
} catch (e) {
  errores.push(`la sonda se cayó: ${String(e).slice(0, 300)}`);
}

console.log("\n  CONTROLES");
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(66)} ${c.detalle}`);
const mal = controles.filter((c) => !c.bien);
console.log(`\n  ${controles.length - mal.length} de ${controles.length} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
process.exit(mal.length || errores.length || !controles.length ? 1 : 0);
