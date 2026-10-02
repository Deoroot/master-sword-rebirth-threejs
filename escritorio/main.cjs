// LA CÁSCARA DE ESCRITORIO. El proceso principal de Electron.
//
//   npm run escritorio                     en desarrollo, con Vite detrás
//   npm run escritorio -- --inspeccionar    y con las herramientas abiertas
//
// ── `ELECTRON_RUN_AS_NODE`, que cuesta una tarde si no se sabe ─────────────
//
// **Si esa variable de entorno vale `1`, el binario de Electron arranca como un
// Node pelado**: sin ventana, sin GPU y, sobre todo, sin su módulo interno. Ahí
// `require("electron")` resuelve `node_modules/electron/index.js`, que es el
// envoltorio de npm —el que exporta la RUTA del binario para que un script lo
// lance— y entonces `app` es `undefined` y el arranque muere en la primera
// línea que lo toque.
//
// Importa porque **la ponen otros programas**: los terminales integrados de
// VS Code y de otras aplicaciones hechas con Electron la heredan a los procesos
// que lanzan. O sea que `npm run escritorio` puede funcionar en una consola y
// fallar en otra de la misma máquina, con un error que no menciona la variable.
//
// Se diagnostica así, y tarda un segundo:
//
//   node -e "console.log(process.env.ELECTRON_RUN_AS_NODE)"
//
// Esto NO es una razón para que el archivo sea `.cjs`. Lo es por lo de abajo.
//
// ── Por qué este archivo es `.cjs` y no `.js` ──────────────────────────────
//
// Porque `package.json` dice `"type": "module"`, así que un `.js` aquí sería
// ESM. Electron admite ESM en el proceso principal desde la versión 28, pero
// trae condiciones propias —la precarga sigue teniendo que ser CommonJS en
// caja de arena, y el momento en que se resuelven los `import()` cambia—, y
// nada de eso compra nada aquí. CommonJS es el camino más andado y este
// archivo es corto.
//
// `escritorio/servidor.js` sí es ESM, porque de él tira también la prueba de
// Node; aquí se trae con un `import()` dinámico, que desde CommonJS funciona.
//
// ── Qué es esto y qué NO es ────────────────────────────────────────────────
//
// **No es un port.** El juego no cambia: el mismo Three.js, las mismas rutas
// relativas y el mismo `fetch`. Electron ES Chromium, así que no hay nada que
// portar; lo que se gana no es rendimiento, es **el teclado**.
//
// Y tampoco es una mudanza: **el camino del navegador sigue vivo**. Tiene que
// seguirlo, porque las 57 sondas de `sondas/` arrancan Vite y lanzan un
// Chromium contra `http://localhost:PUERTO/`. Una cáscara que matara ese camino
// dejaría al proyecto sin su único instrumento para medir lo que se ve.
//
// ── El teclado, que es el motivo ───────────────────────────────────────────
//
// `src/juego/navegador.js` son 197 líneas que no portan nada, y su cabecera lo
// dice: *«Este archivo es NUESTRO entero. Master Sword es un juego de
// escritorio y no tiene este problema»*. Lo que describe es el precio de
// publicar en el navegador:
//
//   - **F1..F12 son las doce ranuras rápidas** (`gfx/shell/kb_def.lst`, y el
//     control de `tools/menu.mjs` lo comprueba). El navegador se queda F11,
//     F12, F5, F3 y F1 — por eso `teclas.js` lleva un segundo `bind` en 6..0
//     como red de seguridad para las cinco primeras.
//   - **Ctrl+W es agacharse y avanzar** (`config.cfg:15`, `bind "CTRL" "+duck"`),
//     que es cómo se sube a los sitios estrechos en Half-Life desde 1998. En un
//     navegador cierra la pestaña, y `preventDefault()` no lo evita: el atajo
//     se atiende antes de que el evento sea cancelable.
//   - Y los otros diez `Ctrl+algo` de la lista `RESERVADAS`.
//
// En el navegador la única salida es `navigator.keyboard.lock()`, que exige
// pantalla completa y sólo existe en Chromium. Aquí no hace falta ninguna de
// las dos: **con el menú de aplicación quitado, Electron no se reserva ninguna
// tecla**. Eso es `Menu.setApplicationMenu(null)`, y es toda la solución.

const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const { join, resolve, dirname } = require("node:path");
const { existsSync } = require("node:fs");
const { spawn } = require("node:child_process");

const PROYECTO = resolve(__dirname, "..");

const argumentos = new Set(process.argv.slice(1));
const INSPECCIONAR = argumentos.has("--inspeccionar");
/**
 * Empaquetado = producción. El `--dev` es para probar la rama de desarrollo.
 *
 * Y `--produccion` es para lo CONTRARIO, que es lo que faltaba: sin él,
 * `!app.isPackaged` hacía que la rama de producción **sólo se pudiera ejecutar
 * empaquetando**, o sea que la única forma de estrenarla era el paso que viene
 * después. Una rama que no se puede correr hasta el final no se puede depurar:
 * cada arreglo costaba un empaquetado entero, y el error aparecía dentro de un
 * `.exe` sin consola.
 *
 * Con esto, `dist/` servido por `servidor.js` se prueba desde el proyecto, con
 * las sondas de siempre y con la consola delante.
 */
const DESARROLLO = argumentos.has("--produccion")
  ? false
  : !app.isPackaged || argumentos.has("--dev");

/**
 * Dónde está `build/`, o sea el contenido horneado del juego.
 *
 * **Esto no es un detalle de empaquetado: es la regla de procedencia.** Un
 * instalador que llevara `build/` dentro estaría redistribuyendo el contenido
 * de Master Sword, que es lo que `CREDITOS.md` dice que no se hace sin permiso.
 * Así que la carpeta se busca FUERA de la aplicación y nunca se copia: en
 * desarrollo es la del proyecto y, empaquetado, la de al lado del ejecutable.
 * `MSR_CONTENIDO` la mueve a mano.
 */
// Y se pregunta por `app.isPackaged`, NO por `DESARROLLO`: son dos preguntas
// distintas que hasta el 73 compartían respuesta por casualidad. «Qué sirve los
// archivos» (Vite o nuestro servidor) y «dónde vive el contenido del jugador»
// no tienen nada que ver, y en cuanto apareció `--produccion` —producción sin
// empaquetar— la respuesta dejó de coincidir: `app.getPath("exe")` sin empaquetar
// apunta a `node_modules/electron/dist/electron.exe`, y `build/` no está ahí.
const CONTENIDO = process.env.MSR_CONTENIDO
  ? resolve(process.env.MSR_CONTENIDO)
  : app.isPackaged ? dirname(app.getPath("exe")) : PROYECTO;

/** Lo que haya que parar al salir, en orden inverso. */
const alCerrar = [];

/**
 * Levanta Vite y espera a que conteste.
 *
 * Se lanza desde aquí, y no se le pide al jugador que abra otra consola,
 * porque `npm run escritorio` tiene que ser UN comando. Es lo mismo que hacen
 * las sondas (`sondas/arranque36.mjs:48`), incluido el `shell: true`, que en
 * Windows hace falta para que `npx` se resuelva.
 */
async function levantarVite() {
  // Puerto propio: el 5173 puede estar ocupado por un `npm run dev` abierto, y
  // robárselo sería peor que usar otro.
  const PUERTO = Number(process.env.MSR_PUERTO_VITE || 5174);

  // CÓMO SE LANZA VITE SIN `npx` Y SIN `shell: true`.
  //
  // Lo evidente sería `spawn("npx", ["vite", ...], { shell: true })`, que es lo
  // que hacen las sondas. Tiene dos pegas: Node avisa de que con `shell: true`
  // los argumentos se concatenan sin escapar, y depende de que `npx` esté en el
  // PATH del proceso, que no siempre.
  //
  // Aquí hay algo mejor a mano: **el binario de Electron ES un Node** si se le
  // pone `ELECTRON_RUN_AS_NODE`. O sea que la misma variable que rompe el
  // arranque —ver la cabecera— sirve para esto, puesta a propósito y sólo en el
  // hijo. Se le pasa la ruta del `vite` que ya está instalado, sin intermediarios.
  const hijo = spawn(process.execPath, [
    join(PROYECTO, "node_modules", "vite", "bin", "vite.js"),
    "--port", String(PUERTO), "--strictPort",
  ], {
    cwd: PROYECTO,
    stdio: "ignore",
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
  });
  alCerrar.push(() => {
    // `hijo.kill()` mata al `cmd` que envuelve a `npx` y deja vivo al `vite` de
    // dentro, que se queda con el puerto. Hay que matar el ÁRBOL, y eso en
    // Windows es `taskkill /T`. La sonda del 36 aprendió lo mismo.
    try {
      if (process.platform === "win32") {
        // `taskkill` es un `.exe` del sistema, así que no hace falta `shell`.
        spawn("taskkill", ["/F", "/T", "/PID", String(hijo.pid)], { stdio: "ignore" });
      } else hijo.kill("SIGTERM");
    } catch { /* si ya se murió, mejor */ }
  });

  const url = `http://localhost:${PUERTO}/`;
  // Esperar a que CONTESTE, no un tiempo fijo: un `setTimeout` generoso es
  // lento cuando arranca rápido y falso cuando arranca lento.
  for (let intento = 0; intento < 150; intento++) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return url;
    } catch { /* todavía no escucha */ }
    await new Promise((f) => setTimeout(f, 100));
  }
  throw new Error(`Vite no contestó en ${url} tras 15 s. ¿Está ocupado el puerto ${PUERTO}?`);
}

/** En producción no hay Vite: los archivos los da nuestro servidor. */
async function levantarServidor() {
  const { servirArchivos } = await import("./servidor.js");
  const dist = join(PROYECTO, "dist");
  if (!existsSync(join(dist, "index.html"))) {
    throw new Error("No hay dist/index.html. Corre primero `npm run empaquetar`.");
  }
  // El ORDEN importa: `/build` primero, porque sale de la carpeta del jugador
  // y no del paquete. Lo demás, de `dist/`.
  const { url, cerrar } = await servirArchivos([
    ["/build", join(CONTENIDO, "build")],
    ["/", dist],
  ]);
  alCerrar.push(cerrar);
  return `${url}/`;
}

async function ventana() {
  const url = DESARROLLO ? await levantarVite() : await levantarServidor();

  const win = new BrowserWindow({
    width: 1600, height: 900,
    minWidth: 960, minHeight: 540,
    title: "Master Sword: Rebirth",
    // El mismo `--ground` que `index.html`. Sin esto la ventana nace blanca y
    // da un fogonazo antes del primer cuadro.
    backgroundColor: "#15101d",
    show: false,
    webPreferences: {
      preload: join(__dirname, "precarga.cjs"),
      // Lo de siempre y por omisión en Electron moderno, escrito aquí para que
      // se vea: el juego NO tiene Node dentro. Si algún día hiciera falta leer
      // un archivo, se pide por el puente de `precarga.cjs`, no abriendo esto.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());

  // AQUÍ ESTÁ EL ARREGLO DE LAS TECLAS, y es una línea.
  //
  // El menú de aplicación por omisión de Electron trae aceleradores para
  // Ctrl+W (cerrar), Ctrl+R (recargar), F12 y Ctrl+Shift+I (herramientas) y
  // Ctrl+Q (salir). Mientras exista, esos atajos se los queda el menú ANTES
  // que la página, igual que hacía el navegador. Quitándolo no queda ninguno
  // reservado y las doce ranuras de F1..F12 llegan enteras.
  Menu.setApplicationMenu(null);

  // Y como F12 ya no abre las herramientas —ahora es la ranura 12—, hace falta
  // otra puerta. Ctrl+Shift+F12 no es un `bind` de Master Sword ni un atajo de
  // nadie, que es justo lo que se le pide a un atajo de desarrollo.
  win.webContents.on("before-input-event", (_e, ent) => {
    if (ent.type === "keyDown" && ent.control && ent.shift && ent.key === "F12") {
      win.webContents.toggleDevTools();
    }
  });

  // Un enlace externo abre el navegador del sistema, y no una ventana de juego
  // sin barra de direcciones de la que no se puede salir.
  win.webContents.setWindowOpenHandler(({ url: destino }) => {
    try {
      if (/^https?:$/.test(new URL(destino).protocol)) shell.openExternal(destino);
    } catch { /* una URL que no se puede ni leer no se abre */ }
    return { action: "deny" };
  });

  await win.loadURL(url);
  if (INSPECCIONAR) win.webContents.openDevTools({ mode: "detach" });
  return win;
}

app.whenReady().then(async () => {
  try {
    await ventana();
  } catch (e) {
    console.error(`\n  No se pudo abrir el juego:\n  ${e.message}\n`);
    app.exit(1);
    return;
  }

  app.on("activate", () => {
    // En macOS, pulsar el icono con todo cerrado vuelve a abrir.
    if (BrowserWindow.getAllWindows().length === 0) ventana();
  });
});

/**
 * «QUIT» DEL MENÚ PRINCIPAL.
 *
 * La entrada existe en `gamemenu.res` desde siempre y llevaba apagada todo el
 * port con el motivo «a browser cannot close its own tab», que era verdad y dejó
 * de serlo con la cáscara. Aquí sí se puede, y es lo que pidió el jugador.
 *
 * Es `on` y no `handle` porque no devuelve nada: quien lo llama no se va a
 * enterar de la respuesta, el proceso se está cerrando.
 *
 * **La confirmación NO está aquí.** La pregunta la hace el juego, con su propia
 * ventana y en su propio idioma; el proceso principal sólo obedece. Poner un
 * `dialog.showMessageBox` nativo habría sido una línea y habría metido un cuadro
 * de Windows en mitad de un menú que acaba de dejar de parecerse a Windows.
 */
ipcMain.on("msr:salir", () => app.quit());

app.on("window-all-closed", () => {
  // En macOS lo normal es que la aplicación siga viva sin ventanas; en Windows
  // y Linux, no. Aquí es un juego: cuando cierras la ventana, has salido.
  app.quit();
});

app.on("will-quit", () => {
  for (const parar of alCerrar.reverse()) {
    try { parar(); } catch { /* al salir, nada vale la pena */ }
  }
});
