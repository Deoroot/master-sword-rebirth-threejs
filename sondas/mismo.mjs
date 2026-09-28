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

/** Lo que dice `index.html`. Si cambia allí, cambia aquí. */
export const TITULO = "Master Sword: Rebirth — Gate City";

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
