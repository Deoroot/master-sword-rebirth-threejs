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
import { liberarPuerto } from "./mismo.mjs";
import { entrarPorElMenu } from "./entrar.mjs";
import { mkdirSync } from "node:fs";

const PORT = 5221;
const liberados = liberarPuerto(PORT);
if (liberados.length) console.log(`  (habia ${liberados.length} proceso(s) en el puerto: matados)`);
const dev = spawn("npx", ["vite", "--port", String(PORT), "--strictPort"], { shell: true, stdio: "ignore" });
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch {} };
await new Promise((r) => setTimeout(r, 6000));

// Cuantos controles TIENE que haber. La sonda puede irse por el `catch` de
// abajo, y entonces un «X de Y» calculado sobre los que llegaron a correr no
// puede bajar nunca: es el experimento 65, que remató con «22 de 22 en verde»
// habiéndose caído en el 22 de 30.
const DECLARADOS = 16;

const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });
const errores = [];
let nav = null;

try {
  nav = await chromium.launch();
  const pag = await nav.newPage({ viewport: { width: 1200, height: 800 } });
  pag.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  // SE ENTRA POR EL MENÚ, como el jugador (57). Antes era `?map=gatecity`,
  // que se salta el menú: carga el nivel y arranca la sesión de una pasada,
  // que es un montaje que el jugador no ve nunca. Ver `sondas/entrar.mjs`.
  await entrarPorElMenu(pag, PORT);
  mkdirSync("build/gatecity/vistas", { recursive: true });

  // LA LÍNEA BASE DEL SONIDO DEL MENÚ — el 84, y está aquí por un motivo.
  //
  // El control del tramo 5 compara el volumen del menú con lo que pide la
  // ventana. Sin esta línea base, ese control **no distingue «el deslizador
  // llegó» de «ya valía eso»**: se descubrió rompiéndolo por supresión y viéndolo
  // seguir verde. Leído antes de tocar nada, el número de partida es el del
  // `config.cfg`, y así la comparación de después mide un CAMBIO y no una
  // coincidencia.
  const menuVol0 = await pag.evaluate(() => window.probe.menu.volumen());
  console.log(`    menú (partida)  ${menuVol0}`);
  control("el menú arranca con el volumen del `config.cfg`, no con el 1 de un `Audio`",
    menuVol0 !== null && Math.abs(menuVol0 - 0.12) < 1e-6,
    menuVol0 === null ? "sin sonidos horneados" : `${menuVol0}`);

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
  // EL ASPECTO DE LAS VENTANAS CAMBIA EL CONTRATO, no sólo el color. Con el
  // códice (`src/vgui2/codice.js`) no hay OK/Cancel/Apply: lo que se toca entra
  // al tocarlo. O sea que estos dos controles miden cosas distintas según el
  // aspecto, y los dos tienen que estar escritos — medir el contrato de la caja
  // con el códice puesto es medir un juego que no existe.
  const aspecto = await pag.evaluate(() => window.probe.vgui2.estado().aspecto);
  const conCaja = aspecto !== "codice";
  const hayApply = conCaja ? await aplicar() : false;
  await pag.waitForTimeout(400);
  const igual = await pag.evaluate(() => ({
    luz: window.probe.ajustes.luz(),
    brillo: window.probe.ajustes.brilloDelAtlas(),
  }));
  control(conCaja
      ? "CONTROL POSITIVO: «Apply» sin tocar nada deja el atlas INTACTO"
      : "CONTROL POSITIVO: sin tocar nada el atlas queda INTACTO (códice: no hay «Apply»)",
    (conCaja ? hayApply : true)
      && igual.luz?.identidad === true && Math.abs(igual.brillo - brilloAntes) < 1e-9,
    `aspecto ${aspecto}, identidad ${igual.luz?.identidad}, ` +
    `${brilloAntes?.toFixed(3)} -> ${igual.brillo?.toFixed(3)}`);

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
  // Y aquí el contrato se INVIERTE con el aspecto, que es lo que hace que esto
  // no sea un cambio de piel. Con caja, mover el deslizador no mueve el ratón
  // hasta «Apply» —se puede probar y cancelar—. Con el códice, mover el
  // deslizador mueve el ratón YA, y se pierde el poder arrepentirse.
  control(conCaja
      ? "arrastrado el deslizador y SIN aplicar, el ratón sigue como estaba"
      : "arrastrado el deslizador, el ratón cambia YA (códice: no hay «Apply»)",
    sinAplicar.ventana > 11 && (conCaja
      ? Math.abs(Math.abs(sinAplicar.grados.yaw) - 0.22) < 1e-6
      // Que se movió, y que se movió a DONDE DICE LA VENTANA: «ya no vale 0,22»
      // se cumpliría también con un número cualquiera.
      : Math.abs(Math.abs(sinAplicar.grados.yaw) - sinAplicar.ventana * 0.022) < 1e-6
        && Math.abs(Math.abs(sinAplicar.grados.yaw) - 0.22) > 1e-6),
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
    // EL 84: Y EL MENÚ, que es el otro sitio donde suena algo.
    menu: window.probe.menu.volumen(),
  }));
  control("subir el volumen lo sube en el nodo de Web Audio, no en un campo",
    Math.abs(sonido.real.efectos - sonido.ventana) < 1e-6 && sonido.ventana > 0.12,
    `la ventana dice ${sonido.ventana.toFixed(2)}, la ganancia es ${sonido.real.efectos.toFixed(2)}`);
  control("y la música NO se mueve con ella: son dos canales, como en el motor",
    Math.abs(sonido.real.musica - 0.2) < 1e-6, `música ${sonido.real.musica}`);
  // ── Y LLEGA TAMBIÉN A LOS SONIDOS DEL MENÚ — el 84 ──────────────────────
  //
  // Los tres sonidos del menú principal son elementos `Audio` del DOM y NO pasan
  // por el nodo de Web Audio que mide el control de arriba, así que ése podía
  // estar —y estaba— en verde con el menú sonando a 1. Son dos caminos para el
  // mismo deslizador y hacen falta los dos controles.
  //
  // Esto mide que el deslizador LLEGA; que el volumen de partida sea el del
  // `config.cfg` y no el 1 de reposo se mide en `sondas/menu52.mjs`, que es la
  // que está en el menú SIN mapa cargado — la otra mitad del fallo, porque quien
  // reparte los ajustes no existe hasta que hay mapa.
  console.log(`    menú            ${sonido.menu} (la ventana pide ${sonido.ventana.toFixed(2)})`);
  control("y LLEGA A LOS SONIDOS DEL MENÚ, que no pasan por Web Audio",
    sonido.menu !== null && Math.abs(sonido.menu - sonido.ventana) < 1e-6
      && Math.abs(sonido.menu - menuVol0) > 1e-6,
    sonido.menu === null ? "sin sonidos horneados" : `menú ${sonido.menu}, ventana ${sonido.ventana.toFixed(2)}`);

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
console.log(`\n  ${controles.length - mal.length} de ${DECLARADOS} en verde`);
console.log(`  errores de página: ${errores.length ? errores.join(" | ") : "ninguno"}\n`);

await nav?.close();
matar(dev);
if (controles.length !== DECLARADOS) {
  console.log(`  !! FALTAN ${DECLARADOS - controles.length}: la sonda no llegó al final`);
}
process.exit(mal.length || errores.length || controles.length !== DECLARADOS ? 1 : 0);
