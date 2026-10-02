import { spawnSync } from "node:child_process";

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
