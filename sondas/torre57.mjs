// Comprueba píxeles y controles reales; las capturas se revisan aparte como arte.
// El servidor usa un puerto libre y se cierra sin matar procesos ajenos.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { createServer } from "vite";
import { chromium } from "playwright";

const DIR = process.env.MENU_CAPTURAS || "build/menu/vistas";
// Una edición de otra sesión no debe recargar la página en mitad de un clic.
const servidor = await createServer({ server: { host: "127.0.0.1", port: 0,
  hmr: false, watch: { ignored: ["**/*"] } }, logLevel: "error" });
let navegador;
try {
  await servidor.listen();
  const base = `http://127.0.0.1:${servidor.httpServer.address().port}`;
  navegador = await chromium.launch();
  const pag = await navegador.newPage({ viewport: { width: 1600, height: 1000 } });
  const errores = [];
  pag.on("pageerror", e => errores.push(e.message));
  pag.on("console", m => {
    if (m.type() === "error" && /THREE|WebGL|shader/i.test(m.text())) errores.push(m.text());
  });
  mkdirSync(DIR, { recursive: true });

  // Entrada auténtica: no se carga un mapa para enseñar el menú.
  await pag.goto(base + "/");
  await pag.waitForFunction(() => window.probe?.ready, null, { timeout: 120000 });
  // EL 72: el juego arranca con la pintura de Finér y la escena de la torre se
  // monta a petición (`ESCENA_DEL_MENU` en `src/play/fondomenu.js`). Esta sonda
  // mide la torre, así que la pide. Lo que viene detrás no cambia.
  assert.equal(await pag.evaluate(() => window.probe.miradores.encender()), true,
    "la escena de la torre no se pudo montar");
  assert.equal(await pag.evaluate(() => window.probe.miradores.tabla().escena), "torre");
  assert.equal(await pag.evaluate(() => window.probe.menu.estado().pinturaPuesta), false);
  // Se captura la pasada real del menú y se repite con la conversión rota.
  // Si vuelve el fallo lineal del 54, ambas imágenes serán iguales y falla.
  await pag.evaluate(() => {
    const r=window.probe.renderer, original=r.render;
    r.render=function(escena,camara) {
      original.call(this,escena,camara);
      if(escena.name !== "menu-salida") return;
      this.render=original;
      const canvas=document.createElement("canvas");
      canvas.width=this.domElement.width; canvas.height=this.domElement.height;
      const g=canvas.getContext("2d");
      const foto=()=>{g.drawImage(this.domElement,0,0);return g.getImageData(0,0,canvas.width,canvas.height).data;};
      const a=foto(), espacio=this.outputColorSpace;
      try {
        this.outputColorSpace="srgb-linear";
        original.call(this,escena,camara);
        const b=foto(); let cambiados=0;
        for(let i=0;i<a.length;i+=4) {
          if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>12) cambiados++;
        }
        window.color57=cambiados/(a.length/4);
      } finally {
        this.outputColorSpace=espacio;
        original.call(this,escena,camara);
      }
    };
  });
  await pag.waitForFunction(() => window.color57 !== undefined);
  assert.ok(await pag.evaluate(() => window.color57 > .5),
    "la conversión sRGB de la escena real cambia la imagen frente a la salida lineal rota");
  for (const [width, height] of [[1600,1000], [1024,768], [720,900], [2560,1080]]) {
    await pag.setViewportSize({ width, height });
    for (const s of [0, .5, 1]) {
      await pag.evaluate(s => window.probe.miradores.en(s), s);
      await pag.waitForTimeout(180);
      await pag.screenshot({ path: `${DIR}/menu57-${width}-${s}.png`, timeout: 60000 });
    }
    const fuera = await pag.locator(".ms-menu-op").evaluateAll(botones => botones.some(b => {
      const r = b.getBoundingClientRect();
      return r.left < 0 || r.right > innerWidth || r.bottom > innerHeight;
    }));
    assert.equal(fuera, false, `las opciones caben a ${width}×${height}`);
  }
  // Se restaura la salida del motor después de cada dibujo de la escena propia.
  assert.equal(await pag.evaluate(() => window.probe.renderer.outputColorSpace), "srgb-linear");
  await pag.setViewportSize({ width: 1200, height: 800 });
  await pag.locator(".ms-menu-op").filter({ hasText: /^Options$/ }).click();
  await pag.waitForFunction(() => Boolean(document.querySelector(".v2-ventana")));
  await pag.keyboard.press("Escape");
  await pag.locator(".ms-menu-op").filter({ hasText: /^Establish a Kingdom$/ }).click();
  await pag.locator(".v2-desplegable").click();
  await pag.locator(".v2-lista-abierta > button").filter({ hasText: /^edana$/ }).click();
  await pag.locator(".v2-boton").filter({ hasText: /^Start$/ }).click();
  await pag.waitForURL(/map=edana/);
  await pag.waitForFunction(() => window.probe?.ready, null, { timeout: 120000 });
  assert.equal(await pag.evaluate(() => window.probe.level.name), "edana");
  assert.equal(await pag.evaluate(() => window.probe.miradores.donde().paseando), false);
  assert.equal(await pag.evaluate(() => window.probe.renderer.outputColorSpace), "srgb-linear");
  console.log("Menú real: cuatro formatos, tres puntos del recorrido, Options y entrada a Edana.");

  // Banco de pruebas: apagar una capa tiene que cambiar PÍXELES, no una bandera.
  await pag.setViewportSize({ width: 1200, height: 800 });
  await pag.goto(base + "/sondas/torre.html");
  await pag.waitForFunction(() => window.vista?.lista);
  await pag.evaluate(() => {
    window.vista.en(.5);
    document.querySelector("#falso").hidden = true;
    const v = window.vista;
    window.foto57 = () => {
      v.pasada.render(v.escena, v.camara);
      const canvas = document.createElement("canvas");
      canvas.width = v.renderer.domElement.width; canvas.height = v.renderer.domElement.height;
      const g = canvas.getContext("2d"); g.drawImage(v.renderer.domElement, 0, 0);
      return g.getImageData(0,0,canvas.width,canvas.height).data;
    };
    window.diferencia57 = (a,b) => {
      let cambiados=0;
      for(let i=0;i<a.length;i+=4) {
        if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>5) cambiados++;
      }
      return cambiados/(a.length/4);
    };
  });
  const antes = await pag.evaluate(() => window.vista.camara.position.toArray());
  await pag.waitForTimeout(220);
  assert.deepEqual(await pag.evaluate(() => window.vista.camara.position.toArray()), antes,
    "el fotograma siguiente no puede deshacer el punto de vista pedido");
  for (const [nombre, minimo] of [["torre", .09], ["valle", .15], ["cielo", .3], ["cascada", .00005]]) {
    const fraccion = await pag.evaluate(nombre => {
      const objeto = window.vista.escena.getObjectByName(nombre);
      const a = window.foto57(); objeto.visible=false;
      const b = window.foto57(); objeto.visible=true;
      return window.diferencia57(a,b);
    }, nombre);
    assert.ok(fraccion > minimo, `${nombre}: quitarla cambia ${(fraccion*100).toFixed(3)}%`);
    console.log(`${nombre}: ${(fraccion*100).toFixed(3)}% de píxeles visibles`);
  }
  const movimiento = await pag.evaluate(() => {
    const a = window.foto57();
    const quieto = window.diferencia57(a, window.foto57());
    window.vista.nubes(30);
    return { quieto, vivo: window.diferencia57(a, window.foto57()) };
  });
  assert.equal(movimiento.quieto, 0, "control quieto, mismo fotograma");
  assert.ok(movimiento.vivo > .015, "el cielo y el agua cambian realmente con el tiempo");
  await pag.screenshot({ path: `${DIR}/escena57.png` });
  assert.deepEqual(errores, []);
  console.log("Movimiento visible, control quieto y ausencia de errores WebGL comprobados.");
  console.log(`Capturas: ${DIR}/menu57-*.png y escena57.png`);
} finally {
  await navegador?.close();
  await servidor.close();
}
