// LOS GRUPOS DE FRASES de `sound/sentences.txt`, y el `speaker` que los usa.
//
// ── Para qué hace falta esto, que es una entidad sola en todo el juego ─────
//
// Hay **un** `speaker` en los 93 mapas y está en Edana, en la plaza. Su
// `message` no es un `.wav`: es el nombre de un GRUPO, y el motor saca una
// frase al azar del grupo cada minuto y pico. Es el ruido de campo del pueblo
// —codornices, abejas, un halcón, viento y un chochín—, y sin esto Edana suena
// a pueblo vacío.
//
// Se porta en su propio archivo y no en `audio.js` porque el formato es un
// lenguaje pequeño con sus reglas, y las reglas se prueban en Node.
//
// ── EL FORMATO, con el fichero del mod delante ────────────────────────────
//
//     WILD0 ambience/(v30) quail1(p103), quail1(t10), quail1(p101)
//     WILD1 ambience/bee1(v75)
//     WILD3 ambience/hawk1(p98 v30)
//                                      assets/msr/sound/sentences.txt:4-7
//
// Y lo que hay en cada línea:
//
//   `WILD0`          el nombre. El GRUPO es el nombre sin los dígitos finales
//                    («WILD») y el número es el índice dentro del grupo.
//   `ambience/`      la carpeta, que vale para toda la línea.
//   `(v30)`          suelto, antes de la primera palabra: los valores **por
//                    omisión de la línea**.
//   `quail1`         una palabra = un `.wav`. Varias, separadas por comas, se
//                    reproducen seguidas.
//   `(p103)`         pegado a una palabra: sólo para ella.
//
// Los tres modificadores que usa el fichero del mod:
//
//   `vNN`  volumen, 0..100 (porcentaje)
//   `pNN`  tono (pitch), 100 es normal
//   `tNN`  recorte de tiempo
//
// ── LO QUE NO SE PORTA, DICHO AQUÍ Y NO DESCUBIERTO LUEGO ─────────────────
//
// 1. **El resto del lenguaje de VOX.** El motor tiene más modificadores
//    (`sNN` de arranque, `eNN` de fin, `lNN`…) y el `!NOMBRE` de frase suelta.
//    En este fichero no aparece ninguno, y está medido: sobre las **29 frases**
//    de los dos grupos, `sinPortar` sale **0**. Se dice el número para que el
//    día que aparezca otro fichero se sepa que no estaba contado — un
//    modificador desconocido no se tira en silencio, se apunta ahí.
// 2. **El LRU del motor.** `SENTENCEG_PlayRndSz` no sortea plano: lleva un
//    `rgblru` por grupo (`CSENTENCE_LRU_MAX 32`, sound.cpp:1049) para no
//    repetir hasta agotar. Aquí se sortea plano y **se declara**: con las 22
//    frases de `WILD` la diferencia es que alguna se repetirá antes de lo que
//    el juego permite. No se finge que está portado.
// 3. **Los dos índices repetidos.** El grupo WILD declara `WILD9`, `WILD10` y
//    `WILD11` **dos veces cada uno** (líneas 12-14 y 15-17). El motor indexa
//    por orden de lectura y no por el número del nombre, así que las seis
//    cuentan y el grupo tiene **22** frases. Quedarse con una por número daría
//    19 y perdería tres vientos — `des_wind1`, `2` y `3` en su segunda versión,
//    que son las que suenan más bajas y con otro tono.

/**
 * Parte `sentences.txt` en grupos.
 *
 * Devuelve `Map<grupo, frases[]>`, cada frase
 * `{ nombre, carpeta, palabras: [{ archivo, volumen, tono, recorte }] }`.
 *
 * El nombre del grupo es el nombre de la frase **sin los dígitos del final**,
 * que es cómo el motor junta `WILD0`..`WILD18` en el grupo `WILD`.
 */
export function leerFrases(texto) {
  const grupos = new Map();
  for (const bruto of String(texto ?? "").split(/\r?\n/)) {
    // Los comentarios del fichero son `//` al principio de línea.
    const l = bruto.replace(/^\s+|\s+$/g, "");
    if (!l || l.startsWith("//")) continue;
    const m = l.match(/^(\S+)\s+(.*)$/);
    if (!m) continue;
    const nombre = m[1];
    const grupo = nombre.replace(/\d+$/, "");
    if (!grupo) continue;
    const frase = leerFrase(nombre, m[2]);
    if (!frase.palabras.length) continue;
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo).push(frase);
  }
  return grupos;
}

/** Los modificadores de un `(...)`: `v30`, `p103 v20`, `t10`. */
function modificadores(txt) {
  const out = {};
  for (const t of String(txt ?? "").trim().split(/\s+/).filter(Boolean)) {
    const m = t.match(/^([a-z])(-?\d+)$/i);
    if (!m) { (out.sinPortar ??= []).push(t); continue; }
    const v = Number(m[2]);
    if (m[1].toLowerCase() === "v") out.volumen = v;
    else if (m[1].toLowerCase() === "p") out.tono = v;
    else if (m[1].toLowerCase() === "t") out.recorte = v;
    else (out.sinPortar ??= []).push(t);
  }
  return out;
}

/** Una línea de `sentences.txt` sin su nombre. */
export function leerFrase(nombre, cuerpo) {
  let resto = String(cuerpo ?? "").trim();
  // La carpeta, que vale para toda la línea: `ambience/`.
  let carpeta = "";
  const c = resto.match(/^([A-Za-z0-9_\-/]+\/)/);
  if (c) { carpeta = c[1]; resto = resto.slice(c[1].length); }
  // Los valores por omisión de la línea: un `(...)` ANTES de la primera
  // palabra. `WILD0` y `WILD5` los usan, y sin ellos las tres codornices de
  // `WILD0` suenan a volumen entero en vez de al 30 %.
  let porOmision = {};
  const d = resto.match(/^\(([^)]*)\)\s*/);
  if (d) { porOmision = modificadores(d[1]); resto = resto.slice(d[0].length); }

  const palabras = [];
  for (const trozo of resto.split(",")) {
    const t = trozo.trim();
    if (!t) continue;
    // `quail1(p98 v20))` — sí, con dos paréntesis: `WILD8` y `WILD13` del mod
    // traen uno de más. El motor lee hasta el primer `)` y lo que sobra lo
    // ignora, así que esto se escribe tolerante a propósito y no se "arregla".
    const p = t.match(/^([^(\s]+)\s*(?:\(([^)]*)\))?/);
    if (!p || !p[1]) continue;
    const mod = { ...porOmision, ...modificadores(p[2] ?? "") };
    palabras.push({
      archivo: `${carpeta}${p[1]}.wav`,
      // Los valores de reposo del motor: volumen entero y tono normal.
      volumen: (mod.volumen ?? 100) / 100,
      tono: (mod.tono ?? 100) / 100,
      recorte: mod.recorte ?? null,
      ...(mod.sinPortar ? { sinPortar: mod.sinPortar } : {}),
    });
  }
  return { nombre, carpeta, palabras };
}

/** Todos los `.wav` que nombra un fichero de frases, sin repetir. */
export function archivosDe(grupos) {
  const out = new Set();
  for (const frases of grupos.values()) {
    for (const f of frases) for (const p of f.palabras) out.add(p.archivo);
  }
  return [...out];
}

// ── EL `speaker` Y SUS DOS RELOJES ─────────────────────────────────────────

/** `ANNOUNCE_MINUTES_MIN`/`MAX`, sound.cpp:1816-1817. */
export const ANUNCIO_MIN = 0.25 * 60;
export const ANUNCIO_MAX = 2.25 * 60;

/**
 * Cuándo habla por PRIMERA vez.
 *
 *     void CSpeaker::Precache(void) {
 *       if (!FBitSet(pev->spawnflags, SPEAKER_START_SILENT))
 *         // set first announcement time for random n second
 *         pev->nextthink = gpGlobals->time + RANDOM_FLOAT(5.0, 15.0);
 *     }                                        sound.cpp:1818-1823
 *
 * Y si trae `SPEAKER_START_SILENT` **no se programa nada**: se queda callado
 * hasta que alguien lo dispare. `azar` es un dado `() => 0..1`.
 */
export function primerAnuncio({ empiezaCallado = false, azar = Math.random } = {}) {
  if (empiezaCallado) return null;
  return 5 + azar() * (15 - 5);
}

/**
 * Cuándo vuelve a hablar, y por qué puede CALLARSE un rato.
 *
 *     if (gpGlobals->time <= g_talkWaitTime) {
 *       pev->nextthink = g_talkWaitTime + RANDOM_FLOAT(5, 10);
 *       return;
 *     }                                        sound.cpp:1832-1837
 *     ...
 *     pev->nextthink = gpGlobals->time +
 *       RANDOM_FLOAT(ANNOUNCE_MINUTES_MIN * 60.0, ANNOUNCE_MINUTES_MAX * 60.0);
 *     g_talkWaitTime = gpGlobals->time + 5;    sound.cpp:1899-1904
 *
 * `g_talkWaitTime` es **global y compartido con los NPC que hablan**, con su
 * motivo escrito al lado en el motor: «used so that two NPCs don't talk at
 * once». O sea que el pregonero de Edana **se calla cuando un vecino está
 * hablando**, y eso no es un adorno: es la razón de que el ruido de campo no
 * pise a la gente del pueblo.
 *
 * Devuelve `{ habla, cuando }`: si `habla` es `false`, se reprograma sin sonar.
 */
export function siguienteAnuncio({ ahora = 0, esperaDeCharla = 0, azar = Math.random } = {}) {
  if (ahora <= esperaDeCharla) {
    return { habla: false, cuando: esperaDeCharla + (5 + azar() * (10 - 5)), esperaDeCharla };
  }
  return {
    habla: true,
    cuando: ahora + (ANUNCIO_MIN + azar() * (ANUNCIO_MAX - ANUNCIO_MIN)),
    // «time delay until it's ok to speak», sound.cpp:1904.
    esperaDeCharla: ahora + 5,
  };
}

/**
 * Qué frase suena. `SENTENCEG_PlayRndSz` con el grupo, sound.cpp:1895.
 *
 * El sorteo es plano a propósito y está declarado arriba: el motor lleva un
 * LRU y esto no. Devuelve `null` si el grupo no existe, que es el caso del
 * aviso del motor —«Level Design Error! SPEAKER has bad sentence group
 * name»— y no un silencio nuestro.
 */
export function fraseDelGrupo(grupos, grupo, azar = Math.random) {
  const frases = grupos instanceof Map ? grupos.get(grupo) : grupos?.[grupo];
  if (!frases || !frases.length) return null;
  return frases[Math.min(Math.floor(azar() * frases.length), frases.length - 1)];
}
