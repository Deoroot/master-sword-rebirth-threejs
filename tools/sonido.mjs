// EL SONIDO: qué pide Gate City, qué hay al lado, y qué falta.
//
//   node tools/sonido.mjs        lee, copia a build/ y escribe el catálogo
//
// Igual que las texturas y los modelos: se lee de la instalación de al lado y
// **todo sale a `build/`, que está en `.gitignore`. Ni un byte a `public/`.**
// Esto sirve para que el demo suene en esta máquina, no para repartirlo.
//
// ── Lo que se aprende leyendo, y no se adivina ─────────────────────────────
//
// 1. LAS LETRAS DE `materials.txt` NO SIGNIFICAN LO QUE DICEN. Su cabecera
//    dice «T = Wood, V = Grass», pero `pm_materials.h` mantiene las de
//    Half-Life: 'T' es CHAR_TEX_TILE y 'V' es CHAR_TEX_VENT, que suenan a
//    `pl_tile*.wav` y `pl_duct*.wav`. MSR no cambió el código: **reemplazó los
//    archivos**. Y por eso `pl_duct*` y `pl_tile*` son justo los que trae —
//    son los dos que reutilizó. Quien lea sólo la cabecera busca un
//    `pl_grass*.wav` que no existe y concluye que falta.
//
// 2. `basedir "msr"` en `gameinfo.txt`: Rebirth es STANDALONE, no hay `valve/`
//    detrás. Y entre sus 1 570 wavs no hay ni `pl_step*` (piedra), ni
//    `pl_dirt*`, ni `pl_slosh*`/`pl_wade*` (agua), ni `pl_metal*`, ni
//    `pl_grate*`, ni `doors/doormove*`. No es que no los tengamos nosotros:
//    **no están en el juego**. Lo que el motor pide y el juego no trae, no
//    suena — y eso es lo que hay que reproducir, no rellenar.
//
// 3. `pl_ladder1..4.wav` SÍ están y son 110 bytes de datos a 11 025 Hz 8 bits:
//    **10 milisegundos**. Son silencio con forma de archivo. MSR calló la
//    escalera a propósito, y un extractor que sólo mire «¿existe?» diría que
//    la escalera suena.

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, statSync } from "node:fs";
import { dirname } from "node:path";

const MSR = "../MSC/assets/msr";
const SALIDA = "build/gatecity";
const DESTINO = `${SALIDA}/snd`;

console.log("SONIDO de Gate City\n");

// --- 1. la tabla de pasos, de `pm_shared.cpp` --------------------------------
//
// Los cuatro nombres por material y el orden de los pies. `irand` es
// `rnd(0,1) + 2*iStepLeft`, o sea 0 y 1 para el pie derecho y 2 y 3 para el
// izquierdo, y el orden en que el motor los escribe es 1, 3, 2, 4 — no 1, 2,
// 3, 4. Copiarlos ordenados haría que los dos pies sonaran cruzados.
const PASOS = {
  piedra:   ["pl_step1", "pl_step3", "pl_step2", "pl_step4"],
  metal:    ["pl_metal1", "pl_metal3", "pl_metal2", "pl_metal4"],
  tierra:   ["pl_dirt1", "pl_dirt3", "pl_dirt2", "pl_dirt4"],
  hierba:   ["pl_duct1", "pl_duct3", "pl_duct2", "pl_duct4"],   // 'V', reusado
  rejilla:  ["pl_grate1", "pl_grate3", "pl_grate2", "pl_grate4"],
  madera:   ["pl_tile1", "pl_tile3", "pl_tile2", "pl_tile4"],   // 'T', reusado
  chapoteo: ["pl_slosh1", "pl_slosh3", "pl_slosh2", "pl_slosh4"],
  vadeo:    ["pl_wade1", "pl_wade2", "pl_wade3", "pl_wade4"],
  nieve:    ["pl_snow1", "pl_snow3", "pl_snow2", "pl_snow4"],
  escalera: ["pl_ladder1", "pl_ladder3", "pl_ladder2", "pl_ladder4"],
};

/** Letra de `materials.txt` -> material nuestro, vía `PM_MapTextureTypeStepType`. */
const LETRA = {
  C: "piedra", M: "metal", D: "tierra", V: "hierba", G: "rejilla",
  T: "madera", S: "chapoteo", A: "nieve", N: "nieve",
};

// --- 2. `materials.txt`, que es una tabla y por eso se puede leer -------------
const tablaMateriales = [];
for (const linea of readFileSync(`${MSR}/sound/materials.txt`, "latin1").split(/\r?\n/)) {
  const s = linea.trim();
  // El motor salta lo que no empieza por letra, y eso incluye sus comentarios.
  if (!/^[A-Za-z]\s/.test(s)) continue;
  const m = s.match(/^(\S)\s+(\S+)/);
  // Sólo los 12 primeros caracteres, que es lo que compara `PM_FindTextureType`.
  if (m) tablaMateriales.push({ letra: m[1].toUpperCase(), textura: m[2].slice(0, 12).toUpperCase() });
}
const material = (t) => LETRA[tablaMateriales.find((e) => e.textura === t.slice(0, 12).toUpperCase())?.letra] ?? "piedra";
console.log(`  materials.txt   ${tablaMateriales.length} texturas declaradas, ${new Set(tablaMateriales.map((e) => e.letra)).size} letras`);

// --- 3. qué pide ESTE mapa ---------------------------------------------------
const manifiesto = JSON.parse(readFileSync(`${SALIDA}/malla.json`, "utf8"));

// Los suelos, por triángulos: no vale contar texturas, porque una textura de
// una pared no se pisa nunca y una del suelo de la plaza se pisa siempre.
const porMaterial = new Map();
for (const g of manifiesto.grupos) {
  const k = material(g.texture ?? "");
  porMaterial.set(k, (porMaterial.get(k) ?? 0) + g.count / 3);
}
console.log(`  suelos          ${[...porMaterial].sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `${k} ${n}`).join(", ")} triángulos`);

const musica = [...new Set((manifiesto.interactivas?.zonas ?? [])
  .filter((z) => z.clase === "msarea_music" && z.musica).map((z) => z.musica))];
console.log(`  música          ${musica.length}: ${musica.join(", ")}`);

// Los `ambient_generic` no están en el manifiesto todavía; los trae el horneado
// del mapa en la sección de zonas sólo si los emitimos. Aquí se leen del propio
// manifiesto si están, y si no, del listado fijo que ya medimos.
const ambiente = manifiesto.interactivas?.ambiente ?? [];

// --- 4. el catálogo, y el control que separa «está» de «suena» ---------------
//
// Un archivo puede existir y no sonar. `pl_ladder*.wav` son 110 bytes de datos
// a 11 025 Hz: diez milisegundos. Así que se mide la DURACIÓN, no la presencia.
/** Duración en segundos de un RIFF WAV, o `null` si no se puede leer. */
function duracionWav(ruta) {
  const b = readFileSync(ruta);
  if (b.length < 44 || b.toString("ascii", 0, 4) !== "RIFF") return null;
  let o = 12, fmt = null, datos = null;
  while (o + 8 <= b.length) {
    const id = b.toString("ascii", o, o + 4), n = b.readUInt32LE(o + 4);
    if (id === "fmt ") fmt = { canales: b.readUInt16LE(o + 10), hz: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) };
    if (id === "data") datos = n;
    o += 8 + n + (n & 1);
  }
  if (!fmt || datos == null || !fmt.hz || !fmt.bits) return null;
  return datos / (fmt.hz * fmt.canales * (fmt.bits / 8));
}

/** Menos que esto es un archivo con forma de sonido y sin sonido dentro. */
const MUDO = 0.05;

mkdirSync(DESTINO, { recursive: true });
const catalogo = {}; const faltan = []; const mudos = [];
let bytes = 0;

function traer(relativo) {
  const origen = `${MSR}/${relativo}`;
  if (!existsSync(origen)) { faltan.push(relativo); return null; }
  const destino = `${DESTINO}/${relativo.replace(/^(sound|music)\//, "")}`;
  mkdirSync(dirname(destino), { recursive: true });
  copyFileSync(origen, destino);
  const tam = statSync(origen).size;
  bytes += tam;
  const dur = relativo.endsWith(".wav") ? duracionWav(origen) : null;
  if (dur != null && dur < MUDO) mudos.push(`${relativo} (${(dur * 1000).toFixed(0)} ms)`);
  return { archivo: `snd/${relativo.replace(/^(sound|music)\//, "")}`, bytes: tam, segundos: dur };
}

// Los pasos: sólo los materiales que este mapa pisa, más los del agua y la
// escalera, que no dependen de la textura sino de dónde estés.
const pisados = new Set([...porMaterial.keys(), "chapoteo", "vadeo", "escalera"]);
catalogo.pasos = {};
for (const [mat, nombres] of Object.entries(PASOS)) {
  if (!pisados.has(mat)) continue;
  catalogo.pasos[mat] = nombres.map((n) => traer(`sound/player/${n}.wav`)).filter(Boolean);
}

// --- 4b. LOS PASOS QUE NO EXISTEN, GENERADOS ---------------------------------
//
// El 92 % de lo que se pisa en Gate City es PIEDRA y el resto tierra, y ni
// `pl_step*` ni `pl_dirt*` están en el mod: son de Valve. Así que correr por
// este mapa es mudo, y lo es **también en el juego** — el motor pide un archivo
// que su propio juego no trae.
//
// Copiarlos de una instalación de Half-Life sería meter contenido de Valve, que
// es justo lo que la regla del 02 prohíbe. Se hace lo mismo que con
// `sprites/glow01.spr` y con el cielo `nature1`: **se generan**. No reproducen
// el sonido de Valve, reproducen su papel, y quedan declarados en
// `PROCEDENCIA.md` y marcados `generado: true` en el catálogo, para que ninguna
// sonda los confunda nunca con algo leído.
//
// El formato es el del juego y no uno cómodo: **11 025 Hz, 8 bits, mono**, que
// es lo que son los `pl_*` que sí están (`pl_ladder1.wav`: 110 bytes a 11 025).
const HZ = 11025;

/** Un azar con semilla, para que dos ejecuciones den el mismo byte. */
function azarConSemilla(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un RIFF WAV de 8 bits sin signo, que es como los guarda el juego. */
function wav8(muestras) {
  const n = muestras.length;
  const b = Buffer.alloc(44 + n);
  b.write("RIFF", 0, "ascii"); b.writeUInt32LE(36 + n, 4); b.write("WAVE", 8, "ascii");
  b.write("fmt ", 12, "ascii"); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);   // PCM, mono
  b.writeUInt32LE(HZ, 24); b.writeUInt32LE(HZ, 28);
  b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34);
  b.write("data", 36, "ascii"); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, muestras[i])) * 127) + 128;
    b.writeUInt8(v, 44 + i);
  }
  return b;
}

/**
 * Un paso. Un paso es un GOLPE, no un tono: ruido con una envolvente muy corta.
 * Lo que distingue la piedra de la tierra es el filtro y la cola —la piedra es
 * un chasquido con un poco de cuerpo y la tierra es sorda y más larga— y eso se
 * hace con un paso bajo de un polo y otro de paso alto, sin bibliotecas.
 *
 *   `caida`  segundos a los que la envolvente cae a 1/e
 *   `bajo`   0..1: cuánto paso bajo (grave, cuerpo)
 *   `alto`   0..1: cuánto del ruido crudo se deja (granos, arenilla)
 */
function paso({ semilla, dur, caida, bajo, alto, golpe = 0 }) {
  const azar = azarConSemilla(semilla);
  const n = Math.round(dur * HZ);
  const out = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / HZ;
    const ruido = azar() * 2 - 1;
    lp += (ruido - lp) * bajo;
    // El ataque no es instantáneo: dos milisegundos de subida quitan el «clic»
    // digital que delata una muestra sintética.
    const subida = Math.min(1, t / 0.002);
    const env = subida * Math.exp(-t / caida);
    let s = lp * 1.6 + ruido * alto;
    // Un segundo impacto, más flojo: el talón y la punta. Sin esto un paso
    // suena a disparo de aire y no a pie.
    if (golpe > 0 && t > golpe) s += Math.exp(-(t - golpe) / (caida * 0.6)) * (azar() * 2 - 1) * 0.5;
    out[i] = s * env;
  }
  // Normalizar al 85 %: el volumen lo pone el juego con el de `MATERIALES`, y
  // dejar margen evita que el recorte de 8 bits añada distorsión.
  let pico = 0;
  for (const v of out) pico = Math.max(pico, Math.abs(v));
  if (pico > 0) for (let i = 0; i < n; i++) out[i] = (out[i] / pico) * 0.85;
  return out;
}

/** Las dos recetas, una por material que el mapa pisa y el juego no trae. */
const RECETAS = {
  piedra: { dur: 0.16, caida: 0.030, bajo: 0.40, alto: 0.30, golpe: 0.018 },
  tierra: { dur: 0.20, caida: 0.055, bajo: 0.22, alto: 0.55, golpe: 0.022 },
};
const generados = [];
for (const [mat, receta] of Object.entries(RECETAS)) {
  if (!pisados.has(mat)) continue;
  if (catalogo.pasos[mat]?.length) continue;   // si algún día SÍ están, mandan ellos
  catalogo.pasos[mat] = [];
  for (let i = 0; i < 4; i++) {
    // Los cuatro no son el mismo archivo cuatro veces: cada pie lleva su
    // semilla y un 12 % de variación en la cola, que es lo que hace que correr
    // no suene a metrónomo.
    const datos = wav8(paso({
      ...receta,
      semilla: 1000 + i * 7 + mat.length * 131,
      caida: receta.caida * (1 + (i - 1.5) * 0.08),
    }));
    const rel = `gen/pl_${mat}${i + 1}.wav`;
    mkdirSync(dirname(`${DESTINO}/${rel}`), { recursive: true });
    writeFileSync(`${DESTINO}/${rel}`, datos);
    bytes += datos.length;
    catalogo.pasos[mat].push({
      archivo: `snd/${rel}`, bytes: datos.length,
      segundos: (datos.length - 44) / HZ, generado: true,
    });
    generados.push(rel);
  }
}
if (generados.length) {
  console.log(`  GENERADOS       ${generados.length} pasos nuestros para ` +
    `${Object.keys(RECETAS).filter((m) => catalogo.pasos[m]?.[0]?.generado).join(" y ")}: ` +
    `el mod no trae los de Valve y sin ellos correr es mudo`);
}

// --- 4c. los sonidos del jugador que SÍ están --------------------------------
//
// La caída y la barra de carga, con sus dos citas:
//
//   `PM_CheckFalling` da un paso a volumen 0,5 / 0,85 / 1,0 según la velocidad
//   de caída (pm_shared.cpp:2873-2925), y con DAÑO el servidor tira un dado de
//   cinco caras: dos `player/hitground*` y tres `common/bodydrop*`
//   (player.cpp:2127-2145). **Las tres de `common/` son de Valve y no están**,
//   así que tres de cada cinco caídas que duelen son mudas en el propio juego.
//
//   La barra de carga suena `ms_chargebar_sound` = `magic/chargebar_alt1.wav`
//   a `ms_chargebar_volume` = 15 (clientlibrary.cpp:149-151), quince sobre una
//   API que toma de 0 a 1.
catalogo.jugador = {};
for (const s of ["player/hitground1.wav", "player/hitground2.wav",
  "common/bodydrop1.wav", "common/bodydrop2.wav", "common/bodydrop3.wav",
  "player/fallpain3.wav", "magic/chargebar_alt1.wav"]) {
  const r = traer(`sound/${s}`); if (r) catalogo.jugador[s] = r;
}
console.log(`  jugador         ${Object.keys(catalogo.jugador).length} de 7: caída, dolor y la barra de carga`);

// La música.
catalogo.musica = {};
for (const m of musica) { const r = traer(`music/${m}`); if (r) catalogo.musica[m] = r; }

// El ambiente y la puerta. `movesnd 9` es `doors/doormove9.wav` en la tabla de
// `doors.cpp:340+`, y el valor es de la entidad, no una elección nuestra.
catalogo.ambiente = {};
for (const a of new Set(ambiente.map((x) => x.sonido).filter(Boolean))) {
  const r = traer(`sound/${a}`); if (r) catalogo.ambiente[a] = r;
}
const movesnd = manifiesto.interactivas?.puertas?.[0]?.sonido ?? "doors/doormove9.wav";
catalogo.puerta = traer(`sound/${movesnd}`);

// EL COMBATE, y la lista no se escribe aquí: se lee de los dos manifiestos.
//
// Las armas dicen con qué suenan (`SOUND_SWIPE`, `SOUND_HITWALL1`) y cada bicho
// dice los suyos (`SOUND_DEATH`, `SOUND_PAIN`, `SOUND_ATTACK1`). O sea que la
// regla es «trae todo sonido que un manifiesto NOMBRE», y así una espada nueva
// o un monstruo nuevo traen los suyos sin tocar este archivo. Una lista escrita
// a mano aquí se queda desfasada en silencio, que es el peor modo de fallo de un
// extractor.
catalogo.combate = {};
const pedidosDeCombate = new Set();
const leerSiEsta = (ruta) => {
  try { return JSON.parse(readFileSync(ruta, "utf8")); } catch { return null; }
};
const armas = leerSiEsta(`${SALIDA}/armas.json`);
for (const a of armas?.armas ?? []) {
  for (const s of [a.sonidos?.blandir, ...(a.sonidos?.contraPared ?? []), a.sonidos?.contraCarne]) {
    // `none` es un valor, no una ruta: el script dice «este objeto no suena».
    // Sin esta línea aparece en la lista de los que faltan, y un archivo que
    // nadie pretende que exista ensucia justo la lista que hay que creerse.
    if (s && s !== "none") pedidosDeCombate.add(s);
  }
}
const censo = leerSiEsta(`${SALIDA}/bichos.json`);
for (const c of censo?.colocados ?? []) {
  for (const s of Object.values(c.ia?.sonidos ?? {}).flat()) if (s && s !== "none") pedidosDeCombate.add(s);
}
for (const s of [...pedidosDeCombate].sort()) {
  const r = traer(`sound/${s}`); if (r) catalogo.combate[s] = r;
}
console.log(`  combate         ${Object.keys(catalogo.combate).length} de ${pedidosDeCombate.size} que nombran ` +
  `${armas?.armas?.length ?? 0} armas y ${censo?.colocados?.length ?? 0} bichos`);

// --- 5. el informe -----------------------------------------------------------
console.log(`\n  traídos         ${Object.values(catalogo.pasos).flat().length} pasos, ` +
  `${Object.keys(catalogo.musica).length} canciones, ${Object.keys(catalogo.ambiente).length} de ambiente, ` +
  `${catalogo.puerta ? 1 : 0} de puerta — ${(bytes / 1048576).toFixed(1)} MB en ${DESTINO}/`);

if (mudos.length) {
  console.log(`  MUDOS           ${mudos.length}: ${mudos.slice(0, 4).join(", ")}${mudos.length > 4 ? "…" : ""}`);
  console.log(`                  existen y no suenan. No son un hueco: son una decisión del mod.`);
}
if (faltan.length) {
  console.log(`  NO ESTÁN        ${faltan.length}: ${[...new Set(faltan.map((f) => f.replace(/\d+\.wav$/, "*.wav")))].join(", ")}`);
  console.log(`                  son de la carpeta 'valve' de Half-Life, y Rebirth es standalone`);
  console.log(`                  (gameinfo.txt: basedir "msr"). No los tiene el juego tampoco.`);
}

// EL CONTROL, y es un control de control: si un día no faltara ninguno,
// significaría que alguien ha puesto un Half-Life al lado — y entonces este
// informe estaría mintiendo sobre lo que suena en el juego original.
if (!faltan.length) {
  console.log(`  AVISO: no falta ninguno. Eso NO es lo esperado con Rebirth solo:`);
  console.log(`         revisa si hay una instalación de Half-Life mezclada en ${MSR}.`);
}
// Y el que de verdad puede romperse solo: que la letra reusada siga reusada.
// Si alguien "arregla" la tabla creyendo la cabecera de materials.txt y pone
// pl_grass*.wav, la hierba se queda muda y nadie lo nota.
if (catalogo.pasos.hierba?.length && !catalogo.pasos.hierba[0].archivo.includes("pl_duct")) {
  console.error(`  FALLO: la hierba ('V') tiene que sonar a pl_duct*.wav. CHAR_TEX_VENT es 'V' en`);
  console.error(`         pm_materials.h; la cabecera de materials.txt dice "Grass" pero el código no.`);
  process.exit(1);
}

// La superficie que de verdad va a sonar, que es la pregunta que importa.
const suenan = new Set(Object.keys(catalogo.pasos).filter((m) => catalogo.pasos[m].some((s) => (s.segundos ?? 1) >= MUDO)));
const triSuenan = [...porMaterial].filter(([m]) => suenan.has(m)).reduce((a, [, n]) => a + n, 0);
const triTotal = [...porMaterial.values()].reduce((a, b) => a + b, 0);
// Y se separa lo LEÍDO de lo GENERADO, porque juntarlo es exactamente la forma
// de que un día nadie sepa ya qué parte del juego suena de verdad.
const delJuego = new Set([...suenan].filter((m) => !catalogo.pasos[m].some((s) => s.generado)));
const nuestros = new Set([...suenan].filter((m) => catalogo.pasos[m].some((s) => s.generado)));
const triDe = (ms) => [...porMaterial].filter(([m]) => ms.has(m)).reduce((a, [, n]) => a + n, 0);
console.log(`\n  van a sonar     ${(100 * triSuenan / triTotal).toFixed(1)} % de los triángulos pisables ` +
  `(${[...suenan].join(", ") || "ninguno"})`);
console.log(`                  del juego el ${(100 * triDe(delJuego) / triTotal).toFixed(1)} % ` +
  `(${[...delJuego].join(", ") || "ninguno"}), generado por nosotros el ` +
  `${(100 * triDe(nuestros) / triTotal).toFixed(1)} % (${[...nuestros].join(", ") || "ninguno"})`);

// --- 6. la procedencia -------------------------------------------------------
//
// Se añade aquí y no a mano porque `PROCEDENCIA.md` lo REESCRIBE el horneado
// del mapa: una nota puesta a mano desaparece en el siguiente `npm run
// gatecity` y nadie se entera. Idempotente: si ya está, no se repite.
{
  const MARCA = "## El SONIDO, que es el caso más delicado de los que hay aquí";
  const nota = `
${MARCA}

\`snd/\` lo llena \`node tools/sonido.mjs\` copiando **tal cual** de
\`${MSR}/\`. No hay lector que escribir porque no hay formato que interpretar:
es copia, y conviene decirlo con esa palabra.

Vale lo de siempre y con más motivo: **está en \`build/\`, que está en
\`.gitignore\`, y no se mueve un byte a \`public/\`.** Sirve para que el demo
suene en esta máquina mientras se comprueba que el sistema funciona.

Y hay una razón concreta además de la regla: \`${MSR}/music/\` tiene 101 mp3,
y entre ellos \`d2-cav.mp3\`, \`d2-leoric.mp3\`, \`d2tombs.mp3\` (Diablo II) y
\`bms-06-end_credits.mp3\` (Black Mesa). **El mod no tiene los derechos de su
propia carpeta de música**, así que «es un mod gratuito» no cubre nada: lo que
se redistribuiría no es suyo.

Lo que **no** se copia porque no existe en el juego: \`pl_step*\`, \`pl_dirt*\`,
\`pl_slosh*\`, \`pl_wade*\`, \`pl_metal*\`, \`pl_grate*\`, \`common/bodydrop*\` y
\`doors/doormove*\`. Son de la carpeta \`valve\` de Half-Life, y Rebirth es
standalone (\`gameinfo.txt\`: \`basedir "msr"\`). El catálogo los sigue
declarando ausentes uno a uno, y \`faltan\` no se toca.

### Y de los que faltan, dos están GENERADOS

\`snd/gen/pl_piedra1-4.wav\` y \`snd/gen/pl_tierra1-4.wav\` **son nuestros**, no
del juego: ruido con envolvente, 11 025 Hz y 8 bits como los del mod, con
semilla fija para que dos ejecuciones den el mismo byte. Se hacen porque el
92 % de lo que se pisa en Gate City es piedra y correr sin ellos es mudo — el
mismo trato y la misma razón que \`sprites/glow01.spr\` y el cielo
\`nature1\`: **no reproducen el sonido de Valve, reproducen su papel.**

En el catálogo van marcados \`generado: true\`, y si algún día los de verdad
estuvieran, mandan ellos y éstos no se escriben.
`;
  const ruta = `${SALIDA}/PROCEDENCIA.md`;
  const antes = existsSync(ruta) ? readFileSync(ruta, "utf8") : "";
  // Idempotente, y además SE ACTUALIZA: la primera versión de esto sólo añadía
  // si no estaba la marca, y cuando el texto cambió —los pasos generados— el
  // archivo se quedó con la nota vieja diciendo que no sustituimos nada. Una
  // procedencia desfasada es peor que no tenerla, así que si la marca está, se
  // recorta desde ella hasta la siguiente sección y se vuelve a escribir.
  if (!antes.includes(MARCA)) {
    writeFileSync(ruta, antes + nota);
  } else {
    const i = antes.indexOf(MARCA);
    const resto = antes.slice(i + MARCA.length);
    const j = resto.search(/\n## /);
    const cola = j >= 0 ? resto.slice(j) : "";
    writeFileSync(ruta, antes.slice(0, i).replace(/\n+$/, "\n") + nota.replace(/^\n/, "") + cola);
  }
}

catalogo.materiales = Object.fromEntries(tablaMateriales.map((e) => [e.textura, LETRA[e.letra] ?? "piedra"]));
catalogo.porMaterial = Object.fromEntries(porMaterial);
catalogo.faltan = faltan;
catalogo.mudos = mudos;
writeFileSync(`${SALIDA}/sonido.json`, JSON.stringify(catalogo));
console.log(`  catálogo        ${SALIDA}/sonido.json`);
