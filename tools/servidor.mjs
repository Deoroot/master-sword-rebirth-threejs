// UN PROCESO DE NODE POR PARTIDA. El paso 4 de PROYECTO_10.md, en marcha.
//
//   npm run servidor                      una partida en el 5210, mapa gatecity
//   npm run servidor -- --puerto 5300 --nombre "Sala de Thothie"
//   npm run servidor -- --vacio           sin mapa: el suelo liso de las pruebas
//
// Lo que este proceso ES, dicho con la tabla del §8 de PROYECTO_10.md:
//
//     Master Sword                          nosotros
//     el servidor de juego es la autoridad  un proceso de Node por partida
//     FN guarda los personajes              primero el servidor: build/partidas/
//     sin P2P                               igual
//
// Y lo que NO es: no es el servidor de la web. Vite sigue sirviendo la página y
// `build/`; esto sólo sirve la partida. Son dos puertos porque son dos cosas, y
// juntarlas obligaría a que el laboratorio y el juego se desplegaran juntos.

import { createServer } from "node:http";
import { ServidorWebSocket } from "../src/red/socket.js";
import { Partida } from "../src/red/partida.js";
import { Anfitrion, mundoDeNivel, nivelDeDisco } from "../src/red/anfitrion.js";
import { AlmacenArchivos } from "../src/red/archivos.js";
import { Fauna, censoDeDisco } from "../src/red/fauna.js";
import { gatecityLevel } from "../src/bsp/nivel.js";
import { RED } from "../src/red/protocolo.js";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const valor = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const bandera = (nombre) => args.includes(`--${nombre}`);

const PUERTO = Number(valor("puerto", 5210));
const NOMBRE = valor("nombre", "Gate City");
const CARPETA = valor("personajes", "build/partidas/gatecity/personajes");

// ── el mundo ────────────────────────────────────────────────────────────────

let mundo;
let aparicion = null;
let deQue = "";
if (bandera("vacio")) {
  // Un suelo liso de 200×200 m. Sirve para probar la red sin Gate City
  // delante, y es lo que usan las pruebas de Node.
  const { mundoLiso } = await import("../src/red/liso.js");
  mundo = await mundoLiso();
  aparicion = { mapa: "liso", nacimiento: { nombre: "el centro", escena: [0, 1, 0] } };
  deQue = "un suelo liso de 200 m";
} else {
  const level = await nivelDeDisco(gatecityLevel);
  mundo = mundoDeNivel(level);
  aparicion = JSON.parse(await readFile("build/gatecity/aparicion.json", "utf8"));
  deQue = `gatecity: ${mundo.triangulos} triángulos de colisión`;
}

// ── la partida ──────────────────────────────────────────────────────────────

const almacen = new AlmacenArchivos({ carpeta: CARPETA });

// EL CATÁLOGO DE OBJETOS, y no es un adorno: **el peso que cargas cambia lo que
// andas** (`velocidadAndando` lo mira). Sin él, el servidor cree que todo el
// mundo va ligero, calcula una velocidad un poco más alta que la del navegador y
// la reconciliación corrige un poco en cada foto para siempre. La sonda lo
// midió: 144 mm de error andando en línea recta, con la física correcta en los
// dos lados.
const catalogo = await readFile("build/msr/objetos.json", "utf8")
  .then((t) => JSON.parse(t))
  .catch(() => null);
if (!catalogo) console.log("  (sin build/msr/objetos.json: el servidor no sabrá lo que pesa lo que llevas)");

// ── LOS BICHOS, que desde el 28 son del servidor ────────────────────────────
//
// Hasta el 27 los 69 monstruos de Gate City se simulaban en cada navegador, con
// su propio `Math.random`: dos jugadores en la misma plaza veían dos pueblos
// distintos. Aquí hay una manada y es ésta.
//
// `--sinbichos` la apaga, y sirve para dos cosas: medir cuánto cuesta y jugar en
// un Gate City vacío.
let fauna = null;
if (!bandera("vacio") && !bandera("sinbichos")) {
  const censo = await censoDeDisco({ base: "build/gatecity" });
  if (!censo) {
    console.log("  (sin build/gatecity/bichos.json: la partida va sin monstruos)");
  } else {
    fauna = new Fauna({ ...censo, mundo });
    console.log(`  bichos         ${fauna.n} del censo, ${fauna.solidos?.n ?? 0} con cilindro`);
  }
}

const partida = new Partida({ mundo, almacen, aparicion, catalogo, fauna, nombre: NOMBRE });

const http = createServer((pet, res) => {
  // La lista de partidas: lo que en Master Sword es el navegador de servidores
  // por Steam. Con una sola partida por proceso es una lista de uno, y ése es
  // el punto — la lista de verdad la juntará quien tenga varios procesos.
  res.setHeader("access-control-allow-origin", "*");
  if (pet.url?.startsWith("/partidas")) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify([{ ...anfitrion.resumen, url: `ws://localhost:${PUERTO}/juego` }], null, 1));
    return;
  }
  res.statusCode = 404;
  res.end("aquí sólo hay una partida: /partidas, y /juego por WebSocket\n");
});

const ws = new ServidorWebSocket(http, { ruta: "/juego" });
const anfitrion = new Anfitrion({ partida, ws }).arrancar();

http.listen(PUERTO, () => {
  console.log(`\n  LA PARTIDA «${NOMBRE}»`);
  console.log(`    mundo          ${deQue}`);
  console.log(`    personajes     ${CARPETA}`);
  console.log(`    lista          http://localhost:${PUERTO}/partidas`);
  console.log(`    juego          ws://localhost:${PUERTO}/juego`);
  console.log(`    reloj          ${RED.ticrate} pasos/s · fotos a ${RED.maxUpdaterate}/s como mucho`);
  console.log(`    sitio          hasta ${RED.maxJugadores} jugadores`);
  console.log(`    fauna          ${fauna ? `${fauna.n} bichos, decididos aquí` : "apagada"}\n`);
});

// Un informe cada diez segundos, que es lo que deja ver si el servidor llega.
const informe = setInterval(() => {
  const r = anfitrion.resumen;
  if (!r.conectados && !bandera("siempre")) return;
  console.log(
    `  t=${r.tiempo}s · ${r.jugadores}/${r.max} jugando (${r.conectados} conectados) · ` +
    `${r.pasos} pasos · vuelta ${r.msPorVuelta} ms (pico ${r.msMaximo})`
  );
}, 10000);
informe.unref?.();

const adios = async () => {
  clearInterval(informe);
  anfitrion.parar();
  // Al cerrar el servidor se guardan TODOS, que es lo que hace
  // `svglobals.cpp:275` cuando el mapa cambia. Sin esto, reiniciar el proceso
  // cuesta lo que cada jugador haya hecho en los últimos tres segundos.
  const ids = [...partida.clientes.keys()];
  for (const id of ids) await partida.desconectar(id, { porque: "el servidor se cierra" }).catch(() => {});
  console.log(`\n  guardados ${ids.length} personajes. Hasta luego.`);
  process.exit(0);
};
process.on("SIGINT", adios);
process.on("SIGTERM", adios);
