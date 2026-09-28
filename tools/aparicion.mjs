// ¿DÓNDE APARECE UN PERSONAJE NUEVO?  →  build/gatecity/aparicion.json
//
// ── Por qué esto es una herramienta y no una constante ─────────────────────
//
// El informe [PROYECTO_10.md](../PROYECTO_10.md) dice «el templo está en
// (0,6, −10,6, −62,8)». Copiar eso al código sería exactamente lo que este
// proyecto lleva seis experimentos evitando: **un número plausible sin nadie
// que lo compruebe**. Si mañana se recoloca un sacerdote, la constante sigue
// ahí, sigue siendo plausible, y deja al jugador dentro de una pared.
//
// Así que el sitio se DERIVA del mapa, con el mismo criterio de tres columnas
// que ya midió `build/sondas/inicio.mjs`, y el criterio se escribe al lado del
// resultado.
//
// ── Lo que hace Master Sword, que es lo que hay que entender antes ──────────
//
// El motor tiene dos clases de sitio y NO son intercambiables
// (`server/svglobals.h:29`, `server/player/player.cpp:2455`):
//
//     ms_player_begin    donde NACE un personaje nuevo. Hay uno.
//                        «Map must have a ms_player_begin in order for people
//                         to create characters there!»  (player.cpp:2558)
//     ms_player_spawn    donde REAPARECE alguien que ya existía. Hay once.
//
// Y la elección depende de cómo entras, `m_JoinType`:
//
//     JN_STARTMAP   personaje nuevo            → SPAWN_BEGIN
//     JN_TRAVEL     «transitioned to new map OR DIED»  → tu última transición
//     JN_VISITED    la transición de otro jugador
//
// O sea que en MSR **al morir NO vuelves a un punto de reaparición del mapa:
// vuelves a tu última transición**, y `ms_player_spawn` es el respaldo. Eso es
// diseño y lo copiamos; lo que cambia es cuál es ese punto, porque nuestra
// demo es un solo mapa y no hay transición a la que volver.
//
// ── Y por qué no vale el sitio que trae el mapa ────────────────────────────
//
// Gate City deja al jugador en una cueva a oscuras con goblins entre él y el
// pueblo. En el juego original eso tenía sentido: LLEGABAS de otro mapa con un
// personaje hecho. Para alguien que acaba de crear uno es otra cosa.
//
// ── Y EL TEMPLO NO LO ELEGIMOS NOSOTROS: lo dice el mod ────────────────────
//
// Esto empezó siendo una preferencia —«que empiecen en el templo, que es
// seguro»— y resultó estar escrita en los scripts del juego. Hay una carpeta
// `scripts/help/` con nueve guiones de PRIMERA VEZ (`first_npc`,
// `first_death`, `first_vendor`, `first_transition`…) y uno de ellos es el que
// enseña a hablar con un NPC:
//
//     { game_targeted_by_player
//        "You are looking at <nombre>.|To speak to him, change your text
//         speech mode to local [U] and say 'hello' or 'hail'" }
//
// **De los 2 884 scripts del mod, exactamente CUATRO lo incluyen**:
//
//     scripts/gatecity/priest.script     scripts/edana/priest.script
//     scripts/gatecity/masterp.script    scripts/edana/masterp.script
//
// Los sacerdotes de los dos templos, y nadie más. O sea que el equipo de
// Master Sword designó al sacerdote del templo como el primer NPC que ve un
// personaje recién creado, y los dos mapas que lo llevan son los dos mapas con
// `ms_player_begin`. La preferencia y el diseño del mod coinciden, y eso se
// puede comprobar con un `grep` en vez de discutirlo.
//
// Por eso el ANCLA es el templo y sólo se decide DÓNDE dentro de él. Al revés
// —«el sitio más claro del mapa»— sale la herrería, que tiene una lámpara
// encima: optimizar el brillo elige una bombilla, no un lugar. La tabla de
// abajo lo imprime para que se vea.
//
// ── Y DENTRO DEL TEMPLO, EL RAYO DE LUZ ────────────────────────────────────
//
// Esa segunda mitad la decidía la luz, y estaba mal por el mismo motivo que la
// primera: premiaba un número. El luxel más alto de los dieciséis que mira
// `apartar()` dejaba al jugador **a 1,6 m del sacerdote, de cara a un rincón**.
// Nadie eligió ese sitio; era el residuo de una ordenación.
//
// Ahora se prefiere un rayo de luz —`func_illusionary` con `rendermode 5`, los
// 31 que el experimento 05 encontró dibujados opacos—, porque un tragaluz sí
// está puesto a mano por el autor del mapa. Es el mismo movimiento que el
// ancla: leer una intención en vez de optimizar una métrica.
//
// Y el detalle que lo hace algo más que un gusto: **el mapa de luz no sabe que
// un rayo existe**. Un brush aditivo no aporta un solo luxel, así que «el sitio
// más claro» no podía encontrarlos ni por casualidad. Son dos preguntas
// distintas, y la que se parece a la que se quería hacer es la segunda.

import { readFileSync, writeFileSync } from "node:fs";
import {
  leerBsp, leerModelos, leerTexinfo, leerCaras, leerEntidades, origen,
  aEscena, UNIDADES_POR_METRO as U,
} from "../src/bsp/lector.js";
import { luzEnSuelo } from "../src/bsp/luz.js";
import { sePuedeEstar, sueloBajo } from "../src/bsp/arbol.js";

const BSP = process.argv[2] ?? "../MSC/assets/msr/maps/gatecity.bsp";
const SALIDA = "build/gatecity/aparicion.json";

// Un hostil es lo que declara un script de `monsters/`. No es una lista
// nuestra: es la carpeta en la que el mod guarda a los que atacan, y separa
// limpio los 30 `ms_npc` del pueblo de los 27 bichos de las cuevas.
const esHostil = (b) => String(b.script ?? "").startsWith("monsters/");

/** A cuántos metros está otro sitio. */
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / U;

const bsp = leerBsp(BSP);
const modelos = leerModelos(bsp);
const texinfos = leerTexinfo(bsp);
const caras = leerCaras(bsp, modelos[0], texinfos);
const entidades = leerEntidades(bsp);
const man = JSON.parse(readFileSync("build/gatecity/malla.json", "utf8"));
const censo = JSON.parse(readFileSync("build/gatecity/bichos.json", "utf8"));

const hostiles = censo.colocados.filter(esHostil);
const amigos = censo.colocados.filter((b) => !esHostil(b) && b.clase === "ms_npc");
const pueblos = man.pueblos.map((p) => p.pies);

// Las CAJAS de los ocho `msarea_town`. La distancia a un centro engaña —el
// «centro» es la cara de suelo mayor, no el medio— y el mod tiene su propia
// definición de estar en un pueblo: `CBasePlayer::m_fInTownArea`, que es
// justamente caer dentro de uno de estos volúmenes. Se usa ésa.
const cajasPueblo = entidades
  .filter((e) => e.classname === "msarea_town" && /^\*\d+$/.test(e.model ?? ""))
  .map((e) => modelos[Number(e.model.slice(1))])
  .filter(Boolean);
const enPueblo = (u) => cajasPueblo.some((m) =>
  u[0] >= m.mins[0] && u[0] <= m.maxs[0] &&
  u[1] >= m.mins[1] && u[1] <= m.maxs[1] &&
  u[2] >= m.mins[2] - 64 && u[2] <= m.maxs[2]);

const luzDe = (u) => {
  // Dos unidades por encima del suelo: pedir el luxel EN el suelo cae justo en
  // el plano de la cara y `caraBajo` la descarta por el margen.
  const l = luzEnSuelo(caras, bsp.lumps.luz.datos, [u[0], u[1], u[2] + 2]);
  return l ? Math.max(l[0], l[1], l[2]) : 0;
};

/**
 * Hacia dónde mira quien aparece aquí: la dirección más despejada.
 *
 * Se calcula CON EL ÁRBOL BSP y no con física, y eso no es una preferencia de
 * estilo — es esquivar un fallo que este proyecto ya tiene documentado y en el
 * que volví a caer. `rumboDeLlegada()` de `src/main.js` hace lo mismo con
 * rayos de Rapier, y lleva escrito encima:
 *
 *     ANTES del jugador  esto tiene que llamarse antes de crear la capsula. Si
 *                        el jugador ya existe, el rayo sale de DENTRO de su
 *                        propio colisionador y con `solid=true` devuelve
 *                        impacto a distancia CERO en las veinticuatro
 *                        direcciones, asi que se queda con la primera y
 *                        devuelve yaw 0 — que es exactamente el valor que esto
 *                        venia a no usar.
 *
 * Al reaparecer la cápsula SIEMPRE existe, así que por ahí no hay forma de
 * hacerlo bien. Midiéndolo aquí, al extraer, no hay cápsula que estorbe y el
 * navegador recibe el número ya hecho — el mismo trato que la cota del suelo.
 *
 * El convenio de ángulo es el de `player.js`: con yaw 0 se mira hacia −Z de
 * escena, que en unidades del `.bsp` es +Y. O sea (−sen θ, cos θ).
 */
function rumboDespejado(unidades, { ojo = 54, alcance = 1600, paso = 8 } = {}) {
  const o = [unidades[0], unidades[1], unidades[2] + ojo];
  let mejor = { yaw: 0, libre: -1 };
  const N = 24;
  for (let i = 0; i < N; i++) {
    const yaw = (i / N) * Math.PI * 2;
    const dx = -Math.sin(yaw), dy = Math.cos(yaw);
    let libre = alcance;
    for (let d = paso; d <= alcance; d += paso) {
      if (!sePuedeEstar(bsp, [o[0] + dx * d, o[1] + dy * d, o[2]])) { libre = d - paso; break; }
    }
    if (libre > mejor.libre) mejor = { yaw, libre };
  }
  return { yaw: mejor.yaw, libre: Number((mejor.libre / U).toFixed(1)) };
}

/**
 * Las tres columnas con las que se juzga un sitio. Ninguna es una opinión:
 * sale del mapa de luz, del censo de bichos y de las zonas `msarea_town`.
 */
function medir(unidades, nombre, familia) {
  const alPueblo = Math.min(...pueblos.map((p) => dist(unidades, p)));
  const cerca = hostiles
    .map((b) => ({ nombre: b.nombre, d: dist(unidades, b.pies) }))
    .sort((a, b) => a.d - b.d);
  const alAmigo = amigos.length
    ? Math.min(...amigos.map((a) => dist(unidades, a.pies)))
    : Infinity;
  return {
    nombre, familia, unidades,
    escena: aEscena(unidades),
    luz: Math.round(luzDe(unidades)),
    alPueblo: Number(alPueblo.toFixed(1)),
    enPueblo: enPueblo(unidades),
    hostiles15: cerca.filter((b) => b.d <= 15).length,
    hostilMasCerca: cerca[0] ? { nombre: cerca[0].nombre, m: Number(cerca[0].d.toFixed(1)) } : null,
    alAmigo: Number(alAmigo.toFixed(1)),
    ...rumboDespejado(unidades),
  };
}

// ── Los candidatos ─────────────────────────────────────────────────────────
//
// Los del mapa, los ocho pueblos, y **el sitio de cada NPC amistoso**. Este
// último es el que encuentra el templo sin que nadie le diga dónde está: un
// sacerdote está de pie sobre suelo bueno, iluminado y sin bichos, porque para
// eso lo puso el autor del mapa ahí.
const candidatos = [];
{
  const begin = entidades.find((e) => e.classname === "ms_player_begin" && origen(e));
  if (begin) candidatos.push(medir(sueloDe(origen(begin)), "ms_player_begin", "mapa"));
  let i = 0;
  for (const e of entidades) {
    if (e.classname !== "ms_player_spawn" || !origen(e)) continue;
    candidatos.push(medir(sueloDe(origen(e)), `ms_player_spawn #${++i}`, "reaparicion"));
  }
  man.pueblos.forEach((p, k) => candidatos.push(medir(p.pies, `pueblo ${k + 1}`, "pueblo")));
  for (const a of amigos) candidatos.push(medir(a.pies, a.nombre.replace(/^\|/, ""), "npc"));
}

/** Los pies, preguntándole al árbol BSP y no restando una constante. */
function sueloDe(o) {
  const z = sueloBajo(bsp, o);
  return z === null ? o : [o[0], o[1], z];
}

// ── La elección ────────────────────────────────────────────────────────────
//
// El ancla sale del mod (ver la cabecera); la luz sólo elige el rincón. Dos
// reglas duras y luego una ordenación: un sitio muy iluminado con un goblin al
// lado no es «casi bueno», es malo.
const SEGURO = 15;      // metros sin un solo hostil
const HUECO = 1.2;      // metros de separación del NPC más cercano, para no
                        // aparecer dentro de nadie

/** Los sacerdotes del templo: los cuatro scripts que incluyen `help/first_npc`. */
const DEL_TEMPLO = new Set(["gatecity/priest", "gatecity/masterp", "edana/priest", "edana/masterp"]);
const sacerdotes = amigos.filter((a) => DEL_TEMPLO.has(a.script));
if (!sacerdotes.length) {
  throw new Error(
    "este mapa no tiene sacerdotes de templo, así que no hay ancla que medir. " +
    "Un mapa sin ellos necesita otra regla, y elegirla a ojo es justo lo que esto evita."
  );
}

const seguros = (lista) => lista
  .map((c) => (c.alAmigo >= HUECO ? c : apartar(c)))
  .filter((c) => c && c.hostiles15 === 0);

// Los del templo, que son los que se eligen.
const sitios = seguros(sacerdotes.map((a) => medir(a.pies, a.nombre.replace(/^\|/, ""), "templo")));
// Y todos los demás sitios seguros, que NO se eligen y se imprimen igual: son
// el control de que el ancla cambia la respuesta. Sin esta lista, «el templo
// sale elegido» no dice nada, porque es el único que se miraba.
const resto = seguros(candidatos.filter((c) => c.familia !== "mapa" && !sacerdotes.some((s) => s.nombre === c.nombre)));
resto.sort((a, b) => b.luz - a.luz);

/**
 * Busca hueco alrededor de un sitio ocupado.
 *
 * Ocho rumbos a 64 unidades (1,6 m) y dos anillos. Se exige que se pueda estar
 * a la altura de la cabeza —no sólo a la de los pies, que es lo que deja a
 * alguien de pie debajo de una mesa— y se conserva la luz medida ahí, no la
 * del centro.
 */
function apartar(c) {
  let mejor = null;
  for (const r of [64, 112]) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = c.unidades[0] + Math.cos(a) * r;
      const y = c.unidades[1] + Math.sin(a) * r;
      const z = sueloBajo(bsp, [x, y, c.unidades[2] + 64]);
      if (z === null) continue;
      // A 72 unidades está la cabeza de un jugador de pie (`VEC_HULL_MAX.z`).
      if (!sePuedeEstar(bsp, [x, y, z + 8])) continue;
      if (!sePuedeEstar(bsp, [x, y, z + 68])) continue;
      const m = medir([x, y, z], `${c.nombre} (apartado)`, c.familia);
      if (m.hostiles15 > 0 || m.alAmigo < HUECO) continue;
      if (!mejor || m.luz > mejor.luz) mejor = m;
    }
  }
  return mejor;
}

// Dentro del templo, el rincón más claro. El 63 % de la superficie iluminada de
// este mapa está por debajo de 32 sobre 255, así que «claro» aquí quiere decir
// «se ve algo» y no «es bonito».
sitios.sort((a, b) => b.luz - a.luz || a.alPueblo - b.alPueblo);
if (!sitios.length) throw new Error("ningún sacerdote tiene hueco seguro alrededor");
const delTemplo = sitios[0];
const delMapa = candidatos.find((c) => c.nombre === "ms_player_begin");

// ── Y DENTRO DEL TEMPLO, DEBAJO DE UN RAYO DE LUZ ──────────────────────────
//
// El ancla no cambia —sigue siendo el templo, sacado de los cuatro scripts que
// incluyen `help/first_npc`—; lo que cambia es qué decide el rincón.
//
// Hasta aquí lo decidía `apartar()`: ocho rumbos alrededor del sacerdote, el
// más claro. Y eso dejaba al jugador **a 1,6 m del sacerdote, mirando a la
// pared de un rincón**, porque el luxel más alto de los dieciséis que mira cae
// donde cae. Nadie eligió ese rincón: es el residuo de una ordenación.
//
// Un rayo de luz sí está elegido. Son `func_illusionary` con `rendermode 5`
// —aditivo—, los mismos 31 que el experimento 05 encontró dibujados opacos y
// que el 06 dejó bien, y los puso a mano el autor del mapa: un tragaluz, y
// debajo un charco de luz. Preferirlos es leer la intención del mapa, que es
// exactamente lo que ya se hizo con el templo, en vez de premiar un número.
//
// Y esto es lo que el criterio viejo no podía ver: **el mapa de luz no sabe
// que un rayo existe.** Un brush aditivo no aporta un solo luxel. O sea que
// «el sitio más claro» y «debajo del rayo» son dos preguntas distintas, y la
// cabecera de este archivo ya avisaba de adónde lleva la primera — al revés,
// sin ancla, sale la herrería, que tiene una lámpara encima.
//
// Las dos reglas duras de antes siguen (0 hostiles a SEGURO, HUECO del NPC más
// cercano) y se añaden dos propias del rayo.
const RAYO_TEMPLO = 12;    // metros del sacerdote: que el rayo sea el DEL TEMPLO
// ── Y este número lo puso el autor del mapa, no yo ─────────────────────────
//
// La primera versión de esto pedía que el rayo LLEGARA al suelo (64 unidades)
// y se quedó sin candidatos: los 31. Medidos, **ninguno toca el suelo**, y no
// por poco — se paran todos a la misma altura:
//
//     unidades por encima del suelo   72  76  80  82  83  84  100  232  404
//     cuántos rayos                    1   2   2   6   3   4    8    1    3
//
// Veintiséis de los treinta y uno entre 72 y 100, que es el estilo del autor:
// el haz baja del tragaluz y se corta a la altura de una cabeza. Un jugador de
// pie mide 72 (`VEC_HULL_MAX.z`), así que «debajo del rayo» aquí es literal —
// el haz termina justo encima de ti. El umbral es 100 porque es donde está el
// escalón de la tabla, no porque sea redondo: deja fuera los cuatro altos
// (232 y los tres de 404), que son haces de nave y no charcos.
const RAYO_AL_SUELO = 100;

/**
 * ¿Se ve `b` desde `a`? Marcha por el segmento a la altura de los ojos.
 *
 * Hace falta porque «a 7,9 m del sacerdote» no quiere decir en su sala: la
 * primera versión de esto eligió un rayo que está a 7,9 m **y en otro piso del
 * templo**, con un forjado en medio. Y eso vacía el ancla, que es lo único que
 * la sostiene: el sacerdote es el punto de partida porque el mod lo designa
 * como el primer NPC que ve un personaje nuevo (los 4 scripts con
 * `help/first_npc`), así que aparecer donde no se le ve deja el ancla de
 * adorno. La distancia era un sustituto de «en su sala»; esto lo mide.
 */
function seVeDesde(a, b, ojo = 54, paso = 8) {
  const A = [a[0], a[1], a[2] + ojo];
  const B = [b[0], b[1], b[2] + ojo];
  const d = Math.hypot(B[0] - A[0], B[1] - A[1], B[2] - A[2]);
  if (d === 0) return true;
  for (let t = paso; t < d; t += paso) {
    const k = t / d;
    if (!sePuedeEstar(bsp, [A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k])) {
      return false;
    }
  }
  return true;
}

/** Los 31 rayos del mapa, con el suelo que tienen debajo. */
function rayosDeLuz() {
  const salida = [];
  for (const e of entidades) {
    if (String(e.rendermode) !== "5" || !/^\*\d+$/.test(e.model ?? "")) continue;
    const m = modelos[Number(e.model.slice(1))];
    if (!m) continue;
    const x = (m.mins[0] + m.maxs[0]) / 2;
    const y = (m.mins[1] + m.maxs[1]) / 2;
    const z = sueloBajo(bsp, [x, y, m.mins[2] + 8]);
    if (z === null) continue;
    const vistos = sacerdotes.filter((s) => seVeDesde([x, y, z], s.pies));
    salida.push({
      unidades: [x, y, z],
      alSuelo: m.mins[2] - z,
      alSacerdote: Math.min(...sacerdotes.map((s) => dist([x, y, z], s.pies))),
      // La sala del sacerdote: el más cercano DE LOS QUE SE VEN desde aquí.
      alSacerdoteVisible: vistos.length
        ? Math.min(...vistos.map((s) => dist([x, y, z], s.pies)))
        : Infinity,
      ancho: Math.max(m.maxs[0] - m.mins[0], m.maxs[1] - m.mins[1]) / U,
    });
  }
  return salida;
}

const rayos = rayosDeLuz();
const bajoRayo = [];
const rayosFuera = [];   // los descartados por no ser del templo: el control de
                         // que el ancla sigue decidiendo algo
for (const r of rayos) {
  const [x, y, z] = r.unidades;
  if (!sePuedeEstar(bsp, [x, y, z + 8]) || !sePuedeEstar(bsp, [x, y, z + 68])) continue;
  if (r.alSuelo > RAYO_AL_SUELO) continue;
  const visible = Number.isFinite(r.alSacerdoteVisible);
  const m = medir(
    r.unidades,
    `rayo a ${r.alSacerdote.toFixed(1)} m del sacerdote${visible ? "" : " (no se le ve)"}`,
    "rayo",
  );
  if (m.hostiles15 > 0 || m.alAmigo < HUECO || !m.enPueblo) continue;
  const fila = {
    ...m,
    alSacerdote: Number(r.alSacerdote.toFixed(1)),
    alSacerdoteVisible: visible ? Number(r.alSacerdoteVisible.toFixed(1)) : null,
  };
  // «En el templo» es ver al sacerdote y estar cerca, no sólo estar cerca.
  (visible && r.alSacerdoteVisible <= RAYO_TEMPLO ? bajoRayo : rayosFuera).push(fila);
}
bajoRayo.sort((a, b) => b.luz - a.luz || a.alSacerdoteVisible - b.alSacerdoteVisible);
rayosFuera.sort((a, b) => b.luz - a.luz);

// Si el mapa no tiene rayos utilizables, se cae al rincón del sacerdote. Un
// mapa sin tragaluces no es un error: es un mapa sin tragaluces.
const elegido = bajoRayo[0] ?? delTemplo;

// ── La tabla, que es la prueba ─────────────────────────────────────────────
const fila = (c, marca = " ") => console.log(
  ` ${marca}${c.nombre.padEnd(32)}${String(c.luz).padStart(5)}  ${c.enPueblo ? "dentro" : " fuera"}` +
  `${String(c.hostiles15).padStart(10)}  ${c.hostilMasCerca ? `${c.hostilMasCerca.nombre} a ${c.hostilMasCerca.m} m` : "—"}`
);
console.log("\n  DÓNDE APARECE UN PERSONAJE NUEVO EN GATE CITY");
console.log("  ─────────────────────────────────────────────────────────────────────────");
console.log("  sitio                              luz   msarea_town  hostiles  el más cerca");
console.log("\n  lo que trae el mapa");
for (const c of candidatos.filter((c) => c.familia === "mapa" || c.familia === "reaparicion").slice(0, 4)) fila(c);
console.log("\n  los pueblos");
for (const c of candidatos.filter((c) => c.familia === "pueblo").slice(0, 3)) fila(c);
console.log("\n  EL TEMPLO — el ancla, sacada de los 4 scripts que incluyen help/first_npc");
for (const c of sitios) fila(c, c === elegido ? "→" : " ");
console.log(`\n  LOS RAYOS DEL TEMPLO — ${rayos.length} func_illusionary rendermode 5 en el mapa`);
for (const c of bajoRayo.slice(0, 4)) fila(c, c === elegido ? "→" : " ");
if (!bajoRayo.length) console.log("  (ninguno utilizable: se cae al rincón del sacerdote)");
console.log("\n  los rayos de FUERA del templo, que el ancla descarta");
for (const c of rayosFuera.slice(0, 3)) fila(c);
console.log("\n  los demás sitios seguros, que NO se eligen aunque tengan más luz");
for (const c of resto.slice(0, 4)) fila(c);

console.log(`\n  ELEGIDO: ${elegido.nombre}`);
console.log(`     luz ${elegido.luz}/255 · ${elegido.enPueblo ? "DENTRO" : "fuera"} de un msarea_town · ` +
  `${elegido.hostiles15} hostiles a ${SEGURO} m (el primero a ${elegido.hostilMasCerca?.m ?? "—"} m) · ` +
  `vecino más cerca a ${elegido.alAmigo} m`);
console.log(`     en ejes de escena: (${elegido.escena.map((v) => v.toFixed(1)).join(", ")})`);

// ── Los controles ──────────────────────────────────────────────────────────
//
// Sin esto lo de arriba es una tabla bonita. Un control que no puede fallar no
// es un control, así que los tres comparan contra lo que trae el mapa.
const controles = [];
const control = (que, bien, detalle) => { controles.push({ que, bien, detalle }); return bien; };

control("gana al punto del mapa en LUZ", elegido.luz > delMapa.luz,
  `${elegido.luz} contra ${delMapa.luz}`);
control("gana al punto del mapa en HOSTILES", elegido.hostiles15 < delMapa.hostiles15,
  `${elegido.hostiles15} contra ${delMapa.hostiles15} a ${SEGURO} m`);
// La zona de pueblo y no la distancia: el «centro» de un pueblo es su cara de
// suelo mayor, así que a 43 m de él se puede estar perfectamente dentro. Lo que
// decide es el volumen `msarea_town`, que es lo que mira el propio mod.
control("aparece DENTRO de una zona de pueblo", elegido.enPueblo && !delMapa.enPueblo,
  `el templo dentro; ms_player_begin ${delMapa.enPueblo ? "también" : "fuera"}`);
control("se puede estar de pie donde aparece",
  sePuedeEstar(bsp, [elegido.unidades[0], elegido.unidades[1], elegido.unidades[2] + 8]) &&
  sePuedeEstar(bsp, [elegido.unidades[0], elegido.unidades[1], elegido.unidades[2] + 68]),
  "vacío a la altura de los pies Y a la de la cabeza");
control("no aparece dentro de nadie", elegido.alAmigo >= HUECO,
  `${elegido.alAmigo} m al NPC más cercano, mínimo ${HUECO}`);
// El rumbo tiene que llevar a alguna parte. Un yaw hacia una pared a medio
// metro deja al jugador empujándola, que es exactamente lo que parecía un
// mundo roto en el experimento 04.
control("mira a algo despejado", elegido.libre >= 3,
  `${elegido.libre} m libres en yaw ${(elegido.yaw * 180 / Math.PI).toFixed(0)}°`);
// El control negativo, que es el que impide que esto sea un sello de goma: si
// se relaja la regla de los hostiles, el punto del mapa TIENE que colarse.
control("la regla de los hostiles descarta algo", candidatos.some((c) => c.hostiles15 > 0),
  `${candidatos.filter((c) => c.hostiles15 > 0).length} de ${candidatos.length} candidatos descartados por hostiles`);
// Y el que impide que el ANCLA sea decorativa: tiene que haber al menos un
// sitio seguro MÁS CLARO que el elegido y aun así descartado. Si no lo hay,
// «el templo» y «el sitio más claro» son lo mismo y anclar no ha hecho nada.
// ── Y los tres del rayo ────────────────────────────────────────────────────
//
// El primero es el que dice que esto se ha hecho; los otros dos son los que
// impiden que sea un sello de goma.
control("aparece DEBAJO de un rayo de luz", elegido.familia === "rayo",
  bajoRayo.length
    ? `${bajoRayo.length} rayos utilizables en el templo, elegido el de luz ${elegido.luz}`
    : "ninguno utilizable: se ha caído al rincón del sacerdote");
// El ancla es el sacerdote porque el mod lo designa primer NPC. Si desde donde
// aparece el jugador no se le ve, el ancla no ha servido para nada.
control("desde donde aparece SE VE al sacerdote",
  sacerdotes.some((s) => seVeDesde(elegido.unidades, s.pies)),
  elegido.alSacerdoteVisible != null
    ? `el más cercano a la vista, a ${elegido.alSacerdoteVisible} m`
    : "ninguno a la vista");
// El control positivo del anterior, y hay que leerlo con cuidado porque dice
// menos de lo que parece: **en Gate City la línea de visión no descarta ni un
// rayo.** Los seis que están a menos de RAYO_TEMPLO del sacerdote lo ven todos,
// así que aquí la distancia ya implicaba la sala y la comprobación sobra.
//
// Se queda igualmente, por dos razones: es lo que «estar en el templo»
// significa de verdad —la distancia sólo era un sustituto— y otro mapa con dos
// pisos sí la necesitará. Pero entonces el control no puede ser «descarta
// algo», porque sería un control que no puede fallar. Lo que se comprueba es
// que la FUNCIÓN sabe decir que no: en el mapa entero hay rayos desde los que
// no se ve ningún sacerdote. Sin esto, `seVeDesde` podría devolver `true`
// siempre y los dos controles de arriba saldrían verdes igual.
{
  const ciegos = rayos.filter((r) => !Number.isFinite(r.alSacerdoteVisible)).length;
  control("la línea de visión sabe decir que no", ciegos > 0,
    `${ciegos} de ${rayos.length} rayos del mapa no ven a ningún sacerdote` +
    ` · dentro del templo descarta 0, o sea que aquí la distancia bastaba`);
}
// Si todos los rayos del mapa estuvieran en el templo, «del templo» no filtra
// nada y el ancla sería decorativa aquí igual que lo sería arriba.
control("el ancla descarta rayos", rayosFuera.length > 0,
  `${bajoRayo.length} rayos dentro del templo, ${rayosFuera.length} descartados por estar fuera` +
  (rayosFuera[0] ? ` (el más claro, luz ${rayosFuera[0].luz})` : ""));
// Y el que compara con lo que había: el rayo tiene que ser mejor que el rincón
// en algo medible, o el cambio es sólo un gusto. Se pide que no empeore la luz
// Y que separe más del NPC, que es lo que se notaba jugando.
control("el rayo mejora el rincón del sacerdote",
  elegido.familia !== "rayo" || (elegido.luz >= delTemplo.luz && elegido.alAmigo > delTemplo.alAmigo),
  `luz ${elegido.luz} contra ${delTemplo.luz} · ${elegido.alAmigo} m al NPC contra ${delTemplo.alAmigo} m`);
control("el ancla cambia la respuesta", resto.some((c) => c.luz > elegido.luz),
  resto.length
    ? `el más claro descartado es ${resto[0].nombre} con ${resto[0].luz}, contra ${elegido.luz} del templo`
    : "no hay otros sitios seguros, así que el ancla no se puede juzgar");

console.log("\n  CONTROLES");
for (const c of controles) {
  console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(48)} ${c.detalle}`);
}
const fallan = controles.filter((c) => !c.bien);

// ── Lo que se escribe ──────────────────────────────────────────────────────
const salida = {
  mapa: man.mapa,
  procedencia: "derivado de gatecity.bsp por tools/aparicion.mjs. Ver PROCEDENCIA.md",
  criterio: {
    ancla: "los sacerdotes del templo: los 4 scripts de 2884 que incluyen help/first_npc",
    regla: "del templo, el rayo de luz (func_illusionary rendermode 5) con 0 hostiles " +
           "a 15 m y más luz; si el mapa no tiene rayos utilizables, el rincón del sacerdote",
    seguroMetros: SEGURO,
    huecoMetros: HUECO,
    rayoTemploMetros: RAYO_TEMPLO,
    rayoAlSueloUnidades: RAYO_AL_SUELO,
    hostil: "script en monsters/",
  },
  // Dónde NACE un personaje nuevo. `ms_player_begin` de MSR, movido a propósito.
  nacimiento: elegido,
  // Dónde REAPARECE alguien que ha muerto. En MSR es tu última transición
  // (`JN_TRAVEL`); en un solo mapa eso no existe, así que es el mismo sitio —
  // y se escribe aparte para que el día que haya transiciones cambie sólo esto.
  reaparicion: elegido,
  // Lo que trae el mapa, para poder volver a él y para que la comparación quede
  // guardada y no sólo impresa.
  delMapa,
  // Los otros rayos del templo y los rincones del sacerdote, por si el elegido
  // se queda corto. El rincón va el primero porque es lo que había antes.
  alternativas: [delTemplo, ...bajoRayo.slice(1, 4), ...sitios.slice(1, 3)].filter((c) => c !== elegido),
  // Los rayos que el ancla descartó por estar fuera del templo.
  rayosDescartados: rayosFuera.slice(0, 6),
  // Y los sitios seguros que se han descartado teniendo MÁS luz. Van al fichero
  // a propósito: son lo que demuestra que anclar en el templo decide algo.
  descartados: resto.slice(0, 6),
  controles,
};
writeFileSync(SALIDA, JSON.stringify(salida, null, 1));
console.log(`\n  escrito ${SALIDA}`);

if (fallan.length) {
  console.error(`\n  ${fallan.length} control(es) en rojo: ${fallan.map((c) => c.que).join("; ")}`);
  process.exit(1);
}
