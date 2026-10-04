import { spawn, spawnSync } from "node:child_process";

// ¿ESTÁ LA SONDA MIRANDO NUESTRO JUEGO, O EL DE OTRO?
//
// Esta comprobación existe porque pasó, y costó una hora encontrarlo.
//
// Cada sonda arranca su propio `vite --port NNNN --strictPort`. Si ese puerto ya
// está cogido, `--strictPort` hace que el nuevo servidor **falle**; y como las
// sondas lo arrancan con `stdio: "ignore"`, el fallo no se ve. Entonces el
// Chromium abre `http://localhost:NNNN` y le contesta **el servidor que ya
// estaba**, que puede ser de otro proyecto entero.
//
// Eso es exactamente lo que pasó: un `vite` de «Mydra Web Lab» —la carpeta de la
// que salió este port— se quedó escuchando en el 5196 desde el principio de la
// sesión, y `sonda:cuerpo` estuvo **veintinueve controles en verde midiendo el
// proyecto viejo**. La rejilla del inventario que este experimento acababa de
// retirar seguía apareciendo, y con razón: era la del otro.
//
// Un cero sin control positivo no es un resultado, y un verde sobre el programa
// equivocado es peor: parece trabajo hecho.
//
// La comprobación es de una línea y no puede fallar en falso: el `<title>` de
// nuestro `index.html` es nuestro y no se parece al de nadie.

/**
 * Lo que dice `index.html`. Si cambia allí, cambia aquí.
 *
 * El 47 le quitó «Gate City»: el título no puede nombrar un mapa cuando el
 * mapa se elige con `?map=`. Sigue siendo bastante nuestro como para no poder
 * fallar en falso contra otro `vite` que ande suelto, que es para lo único
 * que se mira.
 */
export const TITULO = "Master Sword: Rebirth — Three.js port";

/**
 * Comprueba que quien contesta en ese puerto somos nosotros, y **aborta** si no.
 *
 * Abortar y no avisar: una sonda que sigue después de esto da números de otro
 * programa, y los números de otro programa con nuestras etiquetas encima son la
 * peor salida posible.
 */
export async function esNuestro(pag, puerto) {
  const titulo = await pag.title();
  if (titulo === TITULO) return true;
  throw new Error(
    `EL SERVIDOR DEL PUERTO ${puerto} NO ES ESTE PROYECTO.\n` +
    `  dice ser: ${JSON.stringify(titulo)}\n` +
    `  esperado: ${JSON.stringify(TITULO)}\n` +
    `  Lo más probable: otro 'vite' se quedó escuchando en ese puerto y\n` +
    `  '--strictPort' hizo que el nuestro no arrancara, en silencio.\n` +
    `  Mátalo y repite.`
  );
}

/**
 * Mata a quien esté escuchando en ese puerto, antes de arrancar el nuestro.
 *
 * Es el arreglo de verdad; `esNuestro()` es la red de seguridad. Lo escribieron
 * primero `red.mjs` y `ia28.mjs` —las dos sondas que levantan además un servidor
 * de partida, donde un puerto ocupado se nota en seguida— y de ahí sale. Las
 * otras veinticuatro no lo tenían, y por eso el problema tardó tanto en verse:
 * las únicas sondas inmunes eran las dos que ya lo habían resuelto.
 */
export function liberarPuerto(puerto) {
  const pids = matarEnPuerto(puerto);
  // ── Y AL SALIR, OTRA VEZ — el 98 ─────────────────────────────────────────
  //
  // Las sondas acaban con `spawn("taskkill", …)` y `process.exit()` justo
  // detrás, y en Windows eso **no mata nada**: libuv mete a cada hijo en un
  // job object que muere con el padre, así que el `taskkill` cae antes de
  // correr; y `cmd` → `npx` → `vite` se salen del job (BREAKAWAY silencioso)
  // y siguen vivos. Medido el 98: **54 `vite` huérfanos** de un día de
  // sondas, cada uno vigilando el árbol entero, y la entrada por el menú
  // pasaba de 5,6 s a 13,8 s con ellos encima. Un `spawnSync` en `exit` sí
  // corre antes de que el proceso muera, y lo cubre todo —el final normal,
  // `process.exit` y una excepción sin capturar— sin tocar las 89 sondas.
  process.once("exit", () => matarEnPuerto(puerto));
  return pids;
}

/**
 * ARRANCA EL `vite` DE LA SONDA Y ESPERA A QUE CONTESTE — el 98.
 *
 * Antes cada sonda hacía `spawn("npx", ["vite", …])` y luego **dormía 6 o 7 s
 * fijos**, por si acaso. Medido el 98: `vite` contesta HTTP en **~2 s** en frío,
 * así que eran 4-5 s tirados por sonda, y en una máquina cargada (otra sesión
 * corriendo sondas) 6 s podían no bastar, y entonces el `goto` se comía un
 * «connection refused» que nadie atribuía al sueño.
 *
 * Ahora: libera el puerto (que además lo mata al salir, ver `liberarPuerto`),
 * arranca `vite` y **pregunta por HTTP cada 100 ms** hasta que conteste. Si el
 * proceso muere antes —un `--strictPort` que pierde la carrera, un error de
 * configuración— o pasa el tope, **revienta con el motivo**: una sonda que
 * sigue sin servidor mide un `ERR_CONNECTION_REFUSED`, y eso no es un rojo
 * del juego.
 *
 * Devuelve el proceso, como el `spawn` de antes, para que las sondas que lo
 * matan a mano con su `matar(dev)` sigan igual.
 *
 * Lo que NO hace: no espera al **primer** `transform` de `vite` (las
 * dependencias se preempaquetan al pedir la primera página). Eso lo espera el
 * `goto` de la sonda, que ya tenía su propio plazo.
 *
 * Las sondas que levantan ADEMÁS un servidor de partida no quieren esperar a
 * `vite` antes de lanzarlo (el servidor tarda en cargar el mapa, y en paralelo
 * se solapan): ésas usan las dos mitades, `lanzarVite` ahora y `esperarHttp`
 * después de lanzar el servidor.
 */
export async function arrancarVite(puerto, { tope = 60_000, stdio = "ignore", config } = {}) {
  const dev = lanzarVite(puerto, { stdio, ...(config !== undefined ? { config } : {}) });
  await esperarHttp(`http://localhost:${puerto}/`, { tope, proceso: dev, quien: `vite en el puerto ${puerto}` });
  return dev;
}

/**
 * La primera mitad de `arrancarVite`: libera el puerto y lanza, sin esperar.
 *
 * Con `sondas/vite.sondas.mjs`: sin recarga en caliente ni vigilancia de
 * archivos, y con su propia caché (ver allí por qué). `{ config: null }` lo
 * lanza con los valores por omisión, como `npm run dev`.
 */
export function lanzarVite(puerto, { stdio = "ignore", config = "sondas/vite.sondas.mjs" } = {}) {
  liberarPuerto(puerto);
  const args = ["vite", "--port", String(puerto), "--strictPort"];
  if (config) args.push("--config", config);
  return spawn("npx", args, { shell: true, stdio });
}

/**
 * Pregunta por HTTP cada 100 ms hasta que `url` conteste (cualquier código: un
 * 404 también dice que alguien escucha). Si se le da el `proceso` que tiene que
 * contestar y se muere antes, revienta en seguida con su código en vez de
 * agotar el tope. Sirve para `vite` y para `tools/servidor.mjs`, que no abre el
 * puerto hasta haber cargado el mapa (servidor.mjs:241).
 */
export async function esperarHttp(url, { tope = 60_000, proceso = null, quien = url } = {}) {
  let murio = null;
  proceso?.once("exit", (codigo) => { murio = codigo ?? "señal"; });
  const t0 = Date.now();
  for (;;) {
    if (murio === null && proceso?.exitCode != null) murio = proceso.exitCode; // ya muerto al llamar
    if (murio !== null) {
      throw new Error(`${quien} se murió antes de contestar (código ${murio}). ` +
        `¿Otro proceso con el puerto y '--strictPort'? Pruébalo a mano.`);
    }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await r.arrayBuffer().catch(() => {});
      if (r.status > 0) return Date.now() - t0;
    } catch { /* todavía no escucha */ }
    if (Date.now() - t0 > tope) throw new Error(`${quien} no contestó HTTP en ${tope / 1000} s.`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

function matarEnPuerto(puerto) {
  const r = spawnSync("cmd", ["/c", `netstat -ano | findstr LISTENING | findstr :${puerto}`], { encoding: "utf8" });
  const pids = new Set(String(r.stdout ?? "").split(/\r?\n/)
    .map((l) => l.trim().split(/\s+/).pop()).filter((x) => /^[0-9]+$/.test(x) && x !== "0"));
  for (const pid of pids) spawnSync("taskkill", ["/F", "/T", "/PID", pid], { stdio: "ignore", shell: true });
  return [...pids];
}

/**
 * ESPERAR A QUE APAREZCAN LOS MONSTRUOS, que es lo que hace un jugador al entrar.
 *
 * Desde el 39, **38 de los 69 bichos de Gate City no están al llegar**: son la
 * ficha de un `msarea_monsterspawn` y su área piensa por primera vez a los 3
 * segundos (`pev->nextthink = pev->ltime + 3.0`, msmapents.cpp:744). Cada área
 * suelta luego uno cada 0,2 s, y la más cargada lleva cinco.
 *
 * Sin esto, una sonda que teletransporta al jugador junto a un hostil lo pone al
 * lado de un bicho que todavía no existe: se le ve —la posición es la de su
 * ficha— y se le atraviesa, porque no tiene cilindro. `sonda:arco` cayó a 33 de
 * 35 con «0 aciertos de 12» y `sonda:consecuencias` a 39 de 44, las dos con el
 * mismo motivo y sin un solo error en consola.
 *
 * Se espera en tiempo REAL y no adelantando relojes a mano: el bucle del juego es
 * quien llama a `bichos.aparecer`, así que esperar de verdad es recorrer el camino
 * del jugador. Devuelve cuántos hay en el mundo, para poder comprobarlo.
 */
export async function esperarApariciones(pag, { segundos = 5 } = {}) {
  await pag.waitForTimeout(segundos * 1000);
  return pag.evaluate(() => window.probe?.ia?.apariciones?.() ?? null);
}
