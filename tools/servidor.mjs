// UN PROCESO DE NODE POR PARTIDA. El paso 4 de PROYECTO_10.md, en marcha.
//
//   npm run servidor                      una partida en el 5210, mapa gatecity
//   npm run servidor -- --mapa edana      otro mapa, con sus propios personajes
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
import { cargarNivel } from "../src/bsp/nivel.js";
import { MAPA_POR_DEFECTO, baseDe, esNombreDeMapa } from "../src/play/mapa.js";
import { RED } from "../src/red/protocolo.js";
import { readFile } from "node:fs/promises";
import { rutaComun } from "../src/play/recursos.js";

const args = process.argv.slice(2);
const valor = (nombre, porDefecto) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : porDefecto;
};
const bandera = (nombre) => args.includes(`--${nombre}`);

const PUERTO = Number(valor("puerto", 5210));
// El 47: `--mapa` en vez de Gate City escrito a mano. La carpeta de personajes
// cuelga del mapa, que es lo que hace el juego: un personaje de Edana no está
// en la partida de Gate City.
const MAPA = valor("mapa", MAPA_POR_DEFECTO);
if (!esNombreDeMapa(MAPA)) {
  console.error(`«${MAPA}» no es un nombre de mapa: sólo minúsculas, dígitos y guion bajo.`);
  process.exit(1);
}
// El nombre del servidor por omisión es el del mapa, sin más: MSR no trae
// tabla de títulos y el operador lo cambia con `--nombre` (59).
const NOMBRE = valor("nombre", MAPA);
const CARPETA = valor("personajes", `build/partidas/${MAPA}/personajes`);

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
  const level = await nivelDeDisco((o) => cargarNivel({ ...o, mapa: MAPA }), { base: baseDe(MAPA) });
  mundo = mundoDeNivel(level);
  aparicion = JSON.parse(await readFile(`${baseDe(MAPA)}/aparicion.json`, "utf8"));
  deQue = `${MAPA}: ${mundo.triangulos} triángulos de colisión`;
}

// ── la partida ──────────────────────────────────────────────────────────────

const almacen = new AlmacenArchivos({ carpeta: CARPETA });

// EL CATÁLOGO DE OBJETOS, y no es un adorno: **el peso que cargas cambia lo que
// andas** (`velocidadAndando` lo mira). Sin él, el servidor cree que todo el
// mundo va ligero, calcula una velocidad un poco más alta que la del navegador y
// la reconciliación corrige un poco en cada foto para siempre. La sonda lo
// midió: 144 mm de error andando en línea recta, con la física correcta en los
// dos lados.
const catalogo = await readFile(rutaComun("objetos.json"), "utf8")
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
  const censo = await censoDeDisco({ base: baseDe(MAPA) });
  if (!censo) {
    console.log(`  (sin ${baseDe(MAPA)}/bichos.json: la partida va sin monstruos)`);
  } else {
    fauna = new Fauna({ ...censo, mundo });
    console.log(`  bichos         ${fauna.n} del censo, ${fauna.solidos?.n ?? 0} con cilindro`);
  }
}

// ── LOS GUIONES DE LOS NPC, que desde el 62 son del servidor ────────────────
//
// Mismo motivo que los bichos y un experimento más tarde: hasta el 61 cada
// navegador corría su copia del guion de cada NPC, así que dos jugadores tenían
// **dos vendedores distintos con el mismo nombre**, cada uno con su estante, y
// los dos podían comprar la última daga. En el mod esto siempre fue del
// servidor: `game_menu_getoptions` corre allí y el cliente sólo dibuja
// (menu.cpp:143, multiplay_gamerules.cpp:1576).
//
// Sin `guiones.json` la partida va sin conversaciones y se dice: es lo mismo
// que hace con `bichos.json`, y callarse cuesta media hora de «por qué no me
// habla nadie».
const guiones = await readFile(`${baseDe(MAPA)}/guiones.json`, "utf8")
  .then((t) => JSON.parse(t)).catch(() => null);
const menus = await readFile(`${baseDe(MAPA)}/menus.json`, "utf8")
  .then((t) => JSON.parse(t)).catch(() => null);
if (!guiones) console.log(`  (sin ${baseDe(MAPA)}/guiones.json: los NPC del servidor no hablan. Corre \`npm run guiones -- --mapa ${MAPA}\`)`);
else console.log(`  guiones        ${Object.keys(guiones.guiones ?? {}).length} del mapa, corriendo aquí`);

// ── DÓNDE NACEN, si el operador lo dice ─────────────────────────────────────
//
//     npm run servidor -- --mapa edana --nacer 53.4,-7.7,42.5
//
// Es una perilla del que levanta el servidor, no del jugador, y existe por una
// razón concreta: con red **el cuerpo lo mueve el servidor**, así que un
// `probe.mundo.poner()` en el navegador es una mentira que la reconciliación
// deshace (lo mide el control «el servidor corrige la mentira» de `sonda:red`).
// Para medir una tienda hay que estar delante del vendedor de verdad, y el
// herrero de Edana está a **107 metros** del `ms_player_begin`. Andarlos mediría
// el camino —que no está portado— en vez de la tienda.
//
// No se salta nada del juego: se elige otro punto de aparición, que es lo que
// hace el mapa cuando tiene varios `ms_player_spawn`.
const nacer = valor("nacer", null);
if (nacer && aparicion) {
  const xyz = String(nacer).split(",").map(Number);
  if (xyz.length === 3 && xyz.every(Number.isFinite)) {
    aparicion = { ...aparicion, nacimiento: { nombre: `--nacer ${nacer}`, escena: xyz }, alternativas: [] };
    console.log(`  nacimiento     ${xyz.join(", ")}  (--nacer)`);
  } else {
    console.error(`  «--nacer ${nacer}» no son tres números separados por comas: se ignora.`);
  }
}

// ── CON CUÁNTO ORO ENTRAN, si el operador lo dice ───────────────────────────
//
//     npm run servidor -- --mapa edana --oro 5000
//
// La hermana de `--nacer`, y por el mismo motivo: con red **el personaje vive
// aquí**, así que `probe.misiones.oro(5000)` en el navegador pinta un 5000 en
// una pantalla y el servidor sigue contestando «You can't afford …» — que es
// verdad, y la sonda medía su propia mentira. Para medir una compra hay que
// tener el oro DONDE SE RESTA.
const oroInicial = valor("oro", null);
if (oroInicial !== null) console.log(`  oro            ${oroInicial} al entrar  (--oro)`);

// ── LOS EFECTOS, que desde el 92 caen en el jugador AQUÍ ────────────────────
//
// El veneno de una rata o la cura del sumo sacerdote son guiones que se pegan
// al jugador (`applyeffect`), y con red el jugador vive en este proceso. Hacen
// falta dos horneados comunes: los guiones de efecto y el del jugador, que es
// su anfitrión (ver `_efectosDe` en `src/red/partida.js`). Sin ellos se dice,
// como con los demás.
const leerComun = (n) => readFile(rutaComun(n), "utf8").then((t) => JSON.parse(t)).catch(() => null);
const efectos = await leerComun("efectosguion.json");
const fichaDelJugador = await leerComun("jugador.json");
if (!efectos || !fichaDelJugador) {
  console.log("  (sin build/msr/efectosguion.json o jugador.json: un `applyeffect` sobre un jugador se apunta y no hace nada.\n" +
    "   Corre `npm run efectos:guion` y el horneado del jugador)");
} else {
  console.log(`  efectos        ${Object.keys(efectos.archivos ?? {}).length} guiones, el jugador es su anfitrión aquí`);
}

// ── LOS GUIONES DE LOS OBJETOS, que desde el 97 defienden AQUÍ ──────────────
//
// La armadura protege corriendo el `game_takedamage` de su guion (el 96,
// src/play/armadura.js), y con red quien recibe el golpe es el personaje de
// este proceso (`Partida._defender`). Sin el horneado se dice: la armadura
// puesta no protege y `/costura` lo cuenta en `defensa.sinGuiones`.
const objetosGuion = await leerComun("objetosguion.json");
if (!objetosGuion) console.log("  (sin build/msr/objetosguion.json: con servidor la armadura puesta NO protege. Corre `npm run objetos:guion`)");
else console.log(`  objetos        ${Object.keys(objetosGuion.objetos ?? {}).length} guiones, la armadura defiende aquí`);

// ── LOS `params` DE UN BICHO, si el operador los pide ───────────────────────
//
//     npm run servidor -- --mapa sala88 --params monsters/giantrat=add_dot_poison
//
// Un mapa le pone eventos a un monstruo con los `params` de su entidad, que el
// guion corre al nacer (`npcatk_do_events`, monsters/base_self_adjust.script:74-103). Ese camino hoy
// no llega (doc/BICHOS_GUION_91.md §2: `G_MAP_ADDPARAMS` es del GAME_MASTER,
// que no corre), así que el operador puede pedirlos a mano: es la hermana de
// `--nacer` y `--oro`, y lo que llama son eventos DEL MOD (el veneno de la
// rata es `add_dot_poison`, monsters/externals.script:1342-1345). Se puede
// repetir: `--params a=b --params c=d,e`.
const paramsDeBicho = {};
for (let k = 0; k < args.length; k++) {
  if (args[k] !== "--params" || !args[k + 1]) continue;
  const [script, eventos] = String(args[k + 1]).split("=");
  if (!script || !eventos) { console.error(`  «--params ${args[k + 1]}» no es guion=evento[,evento]: se ignora.`); continue; }
  (paramsDeBicho[script] ??= []).push(...eventos.split(",").filter(Boolean));
}
if (Object.keys(paramsDeBicho).length) {
  for (const [s, e] of Object.entries(paramsDeBicho)) console.log(`  params        ${s}: ${e.join(", ")}  (--params)`);
}

const partida = new Partida({
  mundo, almacen, aparicion, catalogo, fauna, guiones, menus, nombre: NOMBRE, oroInicial,
  efectos, fichaDelJugador, objetosGuion,
  paramsDeBicho: Object.keys(paramsDeBicho).length ? paramsDeBicho : null,
});

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
  // EL 92: lo que los guiones de los bichos han recibido AQUÍ. Un navegador no
  // puede verlo —los guiones no viajan—, y una sonda que lo midiera en su
  // propia copia mediría otro juego. Es de sólo lectura.
  if (pet.url?.startsWith("/costura")) {
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.end(JSON.stringify(partida.costura(), null, 1));
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
