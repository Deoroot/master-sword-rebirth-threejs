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

// ── CORRECCIÓN DEL 50: el punto del mapa gana si no hay motivo para cambiarlo
//
// Todo lo de arriba se midió sobre Gate City, y sobre Gate City es cierto: su
// `ms_player_begin` deja al jugador en una cueva con TRES goblins a menos de
// 15 m y fuera de toda zona de pueblo. De ahí salió «el templo gana al punto
// del mapa», y de ahí salieron tres controles que exigen ganarle.
//
// Edana lo enseñó: **su `ms_player_begin` está bien.** Cero hostiles —el jabalí
// más cercano a 127,9 m— y luz 193 sobre 255, que además está comprobada: de
// las 42 posiciones de NPC del mapa hay 23 valores de luz distintos y trece dan
// exactamente 193, o sea que es el valor de estar a cielo abierto y no una
// lectura atascada. El templo de Edana da 172. Exigirle al elegido que GANE en
// luz es pedirle a un templo que sea más claro que el mediodía.
//
// Es la forma del experimento 48: una regla correcta medida sobre un solo mapa.
// Lo que dice el mod es `SPAWN_BEGIN` (`player/player.cpp:2455` y `:2558`), o
// sea el punto del mapa; apartarse de él necesita un motivo, y el motivo de
// Gate City son sus goblins. Así que ahora **se mide el punto del mapa contra
// las reglas duras y sólo si falla alguna se busca otro sitio**.
//
// Las reglas duras no traen ni un número nuevo: son las tres que ya estaban
// —hostiles, poder estar de pie, no aparecer dentro de nadie— más la zona de
// pueblo, que **sólo se aplica si el mapa tiene alguna**. Y NO hay umbral de
// luz a propósito: Gate City ya falla por los goblins y por la zona, así que un
// mínimo de luz sería un número que hoy no decide nada y que el día que
// decidiera, decidiría a ojo.
//
// Lo que esto destapó de paso: el filtro de rayos pedía `enPueblo`, así que en
// un mapa sin un solo `msarea_town` descartaba **los quince** antes de que el
// ancla llegara a mirarlos. No era una decisión, era el mismo bug.
//
// Y los controles que sólo valen en una de las dos ramas ya no salen verdes por
// no aplicar: dicen `n/a` con el motivo, como las tablas de ajustes. Un control
// que no puede fallar es el apartado 4 de CLAUDE.md con otra ropa.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  leerBsp, leerModelos, leerTexinfo, leerCaras, leerEntidades, origen,
  aEscena, UNIDADES_POR_METRO as U,
} from "../src/bsp/lector.js";
import { luzEnSuelo } from "../src/bsp/luz.js";
import { sePuedeEstar, sueloBajo, cabeDePie } from "../src/bsp/arbol.js";

import { mapaDeArgv, bspDe, enSalida } from "./mapa.mjs";
const MAPA = mapaDeArgv();
const BSP = bspDe(MAPA);
const SALIDA = enSalida(MAPA, "aparicion.json");

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
const man = JSON.parse(readFileSync(enSalida(MAPA, "malla.json"), "utf8"));
const censo = JSON.parse(readFileSync(enSalida(MAPA, "bichos.json"), "utf8"));

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
// Si el mapa no tiene ninguna, la regla de la zona de pueblo no se aplica en
// vez de fallar siempre. Edana no tiene ni una (medido en el experimento 48).
const HAY_PUEBLOS = cajasPueblo.length > 0;
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

/**
 * LOS ANCLAS DEL MOD, derivados y no escritos.
 *
 * Esto era una lista de cuatro nombres a mano. La lista era correcta —salió de
 * un `grep` sobre los 2 884 scripts— pero **una lista escrita no se entera de
 * un mapa nuevo**, que es exactamente contra lo que argumenta la primera línea
 * de este archivo sobre las coordenadas del templo. Se vuelve a hacer el
 * `grep` aquí, cada vez, y cuesta menos de un segundo.
 */
function anclasDelMod(raiz = RAIZ_SCRIPTS, incluye = "help/first_npc") {
  const marca = new RegExp(`#include\\s+${incluye}\\b`);
  const salida = new Set();
  const andar = (dir, pre) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) andar(`${dir}/${e.name}`, `${pre}${e.name}/`);
      else if (e.name.endsWith(".script") && marca.test(readFileSync(`${dir}/${e.name}`, "utf8"))) {
        salida.add(`${pre}${e.name.replace(/\.script$/, "")}`);
      }
    }
  };
  andar(raiz, "");
  return salida;
}
const RAIZ_SCRIPTS = "../MSC/MSCScripts/scripts";
const DEL_TEMPLO = anclasDelMod();
const sacerdotes = amigos.filter((a) => DEL_TEMPLO.has(a.script));

/**
 * Las reglas que un sitio tiene que cumplir para valer, con el nombre de la
 * que falla — y el motivo por el que puede haber que cambiar el punto del mapa.
 *
 * Ninguna trae un número nuevo: son las que ya decidían antes. La de la zona de
 * pueblo sólo se aplica donde hay zonas. Ver la corrección del 50 arriba.
 */
function reglasDuras(c) {
  const mal = [];
  const [x, y, z] = c.unidades;
  if (c.hostiles15 > 0) mal.push(`${c.hostiles15} hostil(es) a menos de ${SEGURO} m`);
  if (!sePuedeEstar(bsp, [x, y, z + 8]) || !sePuedeEstar(bsp, [x, y, z + 68])) {
    mal.push("no se puede estar de pie");
  }
  // EL 99. Los dos `sePuedeEstar` de arriba miran PUNTOS, y el rayo que se
  // eligió en Gate City cae a 6 unidades de una pared y con la cabeza bajo el
  // alféizar de una ventana: los dos puntos vacíos y la caja del jugador,
  // dentro (src/bsp/arbol.js `cabeDePie`). En el motor eso es
  // `PM_CheckStuck` y no te mueves; aquí Rapier no saca la cápsula de la
  // pared y el primer salto se quedaba en 0,1 m. Ver doc/SALTO_99.md.
  if (!cabeDePie(bsp, c.unidades)) mal.push("no cabe la caja del jugador (casco 1)");
  if (c.alAmigo < HUECO) mal.push(`a ${c.alAmigo} m del NPC más cercano, mínimo ${HUECO}`);
  if (HAY_PUEBLOS && !c.enPueblo) mal.push("fuera de toda zona msarea_town");
  return mal;
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
      if (!cabeDePie(bsp, [x, y, z])) continue;   // el 99: la CAJA, no el punto
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
const delTemplo = sitios[0] ?? null;
const delMapa = candidatos.find((c) => c.nombre === "ms_player_begin") ?? null;

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
/**
 * POR QUÉ SE CAE CADA RAYO, contado.
 *
 * Esto no es estadística: es lo que habría enseñado el bug. El filtro pedía
 * `enPueblo`, así que en un mapa sin un solo `msarea_town` los quince rayos de
 * Edana se caían aquí **sin dejar rastro** — la tabla imprimía «ninguno
 * utilizable» y parecía un mapa sin tragaluces. Un `continue` mudo no se puede
 * distinguir de una decisión.
 *
 * Con el motivo apuntado, la suma tiene que cuadrar con los rayos del mapa, y
 * ningún rayo puede caerse por una regla que este mapa no puede cumplir.
 */
const descartes = new Map();
const descartar = (motivo) => descartes.set(motivo, (descartes.get(motivo) ?? 0) + 1);

for (const r of rayos) {
  const [x, y, z] = r.unidades;
  if (!sePuedeEstar(bsp, [x, y, z + 8]) || !sePuedeEstar(bsp, [x, y, z + 68])) {
    descartar("no se puede estar de pie debajo"); continue;
  }
  if (!cabeDePie(bsp, r.unidades)) { descartar("no cabe la caja del jugador debajo (casco 1)"); continue; }
  if (r.alSuelo > RAYO_AL_SUELO) { descartar(`se corta a más de ${RAYO_AL_SUELO} unidades del suelo`); continue; }
  const visible = Number.isFinite(r.alSacerdoteVisible);
  const m = medir(
    r.unidades,
    `rayo a ${r.alSacerdote.toFixed(1)} m del sacerdote${visible ? "" : " (no se le ve)"}`,
    "rayo",
  );
  // Las mismas reglas duras que se le piden al punto del mapa, y por el mismo
  // motivo: aquí estaba escrito `!m.enPueblo` a secas, que en un mapa sin
  // `msarea_town` descarta TODOS los rayos sin haber mirado ninguno.
  const mal = reglasDuras(m);
  // Sólo el primer motivo, para que la suma siga cuadrando con un rayo por fila.
  if (mal.length) { descartar(mal[0].replace(/^\d+ /, "").replace(/a [\d.]+ m del/, "demasiado cerca del")); continue; }
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

// ── LA ELECCIÓN, en el orden que dice el mod ───────────────────────────────
//
// Primero el punto del mapa, que es lo que hace el motor (`SPAWN_BEGIN`). Sólo
// si falla una regla dura se busca otro sitio, y entonces sí: el rayo del
// templo, y si el mapa no tiene rayos utilizables el rincón del sacerdote —
// un mapa sin tragaluces no es un error, es un mapa sin tragaluces.
const falloDelMapa = delMapa
  ? reglasDuras(delMapa)
  : ["el mapa no trae ms_player_begin"];

let elegido, porQue;
if (delMapa && !falloDelMapa.length) {
  elegido = delMapa;
  porQue = "el ms_player_begin del mapa cumple las reglas duras, así que se respeta";
} else {
  if (!sacerdotes.length) {
    throw new Error(
      `el ms_player_begin de ${MAPA} falla (${falloDelMapa.join("; ")}) y el mapa no tiene ` +
      "sacerdotes de templo, así que no hay ancla que medir. Un mapa así necesita otra " +
      "regla, y elegirla a ojo es justo lo que esto evita."
    );
  }
  if (!sitios.length) throw new Error("ningún sacerdote tiene hueco seguro alrededor");
  elegido = bajoRayo[0] ?? delTemplo;
  porQue = `el ms_player_begin del mapa falla: ${falloDelMapa.join("; ")}`;
}

// ── La tabla, que es la prueba ─────────────────────────────────────────────
const fila = (c, marca = " ") => console.log(
  ` ${marca}${c.nombre.padEnd(32)}${String(c.luz).padStart(5)}  ${c.enPueblo ? "dentro" : " fuera"}` +
  `${String(c.hostiles15).padStart(10)}  ${c.hostilMasCerca ? `${c.hostilMasCerca.nombre} a ${c.hostilMasCerca.m} m` : "—"}`
);
console.log(`\n  DÓNDE APARECE UN PERSONAJE NUEVO EN ${MAPA}`);
console.log("  ─────────────────────────────────────────────────────────────────────────");
console.log("  sitio                              luz   msarea_town  hostiles  el más cerca");
console.log("\n  lo que trae el mapa");
for (const c of candidatos.filter((c) => c.familia === "mapa" || c.familia === "reaparicion").slice(0, 4)) {
  fila(c, c === elegido ? "→" : " ");
}
console.log(`    ms_player_begin: ${falloDelMapa.length ? `falla — ${falloDelMapa.join("; ")}` : "cumple las reglas duras"}`);
console.log("\n  los pueblos");
for (const c of candidatos.filter((c) => c.familia === "pueblo").slice(0, 3)) fila(c);
console.log(`\n  EL TEMPLO — el ancla, sacada de los ${DEL_TEMPLO.size} scripts que incluyen help/first_npc`);
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
const control = (que, bien, detalle) => { controles.push({ que, aplica: true, bien, detalle }); return bien; };
/** Un control que en ESTE mapa no puede decidir nada, y dice por qué. */
const noAplica = (que, porQueNo) => { controles.push({ que, aplica: false, bien: null, porQueNo }); };

const seCambio = elegido !== delMapa;

// ── Lo primero: que las reglas duras discriminen ───────────────────────────
//
// Son las que deciden si el punto del mapa se respeta, así que si aceptaran
// todo o rechazaran todo, la elección entera sería un sello de goma. Este par
// es la versión de dos lados del control del 48: tienen que rechazar algo Y
// aceptar algo, en el mapa que se está horneando.
//
// CORRECCIÓN DEL 88: en un mapa pequeño puede no haber NINGÚN candidato malo.
// La sala del 88 tiene dos sitios para nacer, los dos a 29 m de su única rata,
// y estos dos controles salían rojos con las reglas funcionando: pedían un caso
// que el mapa no tiene. Marcarlos «no aplica» habría dejado sin comprobar que
// la regla de los hostiles sabe decir que no, así que se le da un caso que sí
// existe: un TESTIGO encima del primer hostil del mapa, que tiene que salir
// rechazado. Sólo entra cuando los candidatos de verdad no traen ninguno malo,
// para que en Gate City y Edana el control siga midiendo lo mismo que antes; y
// si el mapa no tiene ni un hostil, entonces sí: no aplica.
const testigos = hostiles.slice(0, 1).map((b) =>
  medir([b.pies[0], b.pies[1], b.pies[2] + 36], `testigo encima de ${b.nombre}`, "testigo"));
const conCasoMalo = candidatos.some((c) => reglasDuras(c).length > 0) ? candidatos : [...candidatos, ...testigos];
const conTestigo = conCasoMalo !== candidatos ? ` (con ${testigos.length} testigo)` : "";
{
  const juzgados = conCasoMalo.map((c) => reglasDuras(c).length);
  if (!hostiles.length && !juzgados.some((n) => n > 0)) {
    noAplica("las reglas duras RECHAZAN sitios de este mapa", "ningún candidato es malo y el mapa no tiene hostiles con los que poner un testigo");
  } else {
    control("las reglas duras RECHAZAN sitios de este mapa", juzgados.some((n) => n > 0),
      `${juzgados.filter((n) => n > 0).length} de ${juzgados.length} candidatos incumplen alguna${conTestigo}`);
  }
  control("y ACEPTAN otros", juzgados.some((n) => n === 0),
    `${juzgados.filter((n) => n === 0).length} de ${juzgados.length} las cumplen todas`);
}
control("el sitio elegido cumple TODAS las reglas duras", reglasDuras(elegido).length === 0, porQue);

// La luz NO es una regla dura, y por eso ya no es un control: ver la corrección
// del 50. Se mide y se imprime, que es lo que se puede defender.
noAplica("gana al punto del mapa en LUZ",
  `la luz no decide: ${elegido.luz} contra ${delMapa?.luz ?? "—"} del mapa, y en Edana el templo` +
  " pierde contra el mediodía");

// Cada regla dura sólo se juzga cuando es ELLA la que obligó a cambiar de
// sitio. Así el control no puede salir verde por casualidad ni rojo por no
// venir a cuento.
if (!seCambio) {
  noAplica("gana al punto del mapa en HOSTILES", "no se ha cambiado el punto del mapa");
} else if (falloDelMapa.some((f) => f.includes("hostil"))) {
  control("gana al punto del mapa en HOSTILES", elegido.hostiles15 < delMapa.hostiles15,
    `${elegido.hostiles15} contra ${delMapa.hostiles15} a ${SEGURO} m`);
} else {
  noAplica("gana al punto del mapa en HOSTILES", "el punto del mapa no falla por hostiles");
}

// La zona de pueblo y no la distancia: el «centro» de un pueblo es su cara de
// suelo mayor, así que a 43 m de él se puede estar perfectamente dentro. Lo que
// decide es el volumen `msarea_town`, que es lo que mira el propio mod.
if (!HAY_PUEBLOS) {
  noAplica("aparece DENTRO de una zona de pueblo", "el mapa no tiene ni un msarea_town");
} else {
  control("aparece DENTRO de una zona de pueblo", elegido.enPueblo,
    `elegido dentro; ms_player_begin ${delMapa?.enPueblo ? "también" : "fuera"}`);
}
control("se puede estar de pie donde aparece",
  sePuedeEstar(bsp, [elegido.unidades[0], elegido.unidades[1], elegido.unidades[2] + 8]) &&
  sePuedeEstar(bsp, [elegido.unidades[0], elegido.unidades[1], elegido.unidades[2] + 68]),
  "vacío a la altura de los pies Y a la de la cabeza");
// EL 99: el control de arriba es de PUNTOS y estuvo verde con el jugador
// metido 10 unidades en una pared. Éste pregunta por la caja.
control("cabe la CAJA del jugador donde aparece (casco 1)", cabeDePie(bsp, elegido.unidades),
  `casco 1 en [${elegido.unidades.join(", ")}], de +37 a +55 (un escalón)`);
control("no aparece dentro de nadie", elegido.alAmigo >= HUECO,
  `${elegido.alAmigo} m al NPC más cercano, mínimo ${HUECO}`);
// El rumbo tiene que llevar a alguna parte. Un yaw hacia una pared a medio
// metro deja al jugador empujándola, que es exactamente lo que parecía un
// mundo roto en el experimento 04.
control("mira a algo despejado", elegido.libre >= 3,
  `${elegido.libre} m libres en yaw ${(elegido.yaw * 180 / Math.PI).toFixed(0)}°`);
// El control negativo, que es el que impide que esto sea un sello de goma: si
// se relaja la regla de los hostiles, el punto del mapa TIENE que colarse.
if (!hostiles.length) {
  noAplica("la regla de los hostiles descarta algo", "el mapa no tiene ni un hostil");
} else {
  control("la regla de los hostiles descarta algo", conCasoMalo.some((c) => c.hostiles15 > 0),
    `${conCasoMalo.filter((c) => c.hostiles15 > 0).length} de ${conCasoMalo.length} candidatos descartados por hostiles${conTestigo}`);
}
// ── El ancla derivada, y que el `grep` distinga ────────────────────────────
//
// La lista de anclas ya no está escrita, así que hay que comprobar que el
// `grep` que la saca no devuelve ni todo ni nada. El control positivo es otro
// `#include` del mismo `help/`: `first_vendor` tiene que dar un conjunto
// DISTINTO. Si los dos dieran lo mismo, el filtro no estaría filtrando.
{
  const otros = anclasDelMod(RAIZ_SCRIPTS, "help/first_vendor");
  const mismos = [...DEL_TEMPLO].filter((s) => otros.has(s)).length;
  control("el grep de las anclas distingue", DEL_TEMPLO.size > 0 && mismos === 0,
    `${DEL_TEMPLO.size} scripts con help/first_npc, ${otros.size} con help/first_vendor,` +
    ` ${mismos} en común · en este mapa hay ${sacerdotes.length} de ellos`);
}

// ── Y los del rayo, que sólo valen si se ha tenido que buscar otro sitio ───
if (!seCambio) {
  noAplica("aparece DEBAJO de un rayo de luz", "se ha respetado el punto del mapa");
  noAplica("desde donde aparece SE VE al sacerdote", "se ha respetado el punto del mapa");
} else {
  // Caerse al rincón del sacerdote en un mapa sin tragaluces es lo previsto, no
  // un fallo; lo que no puede pasar es haberlos y no usarlos.
  control("si hay rayos utilizables, se elige uno",
    bajoRayo.length === 0 || elegido.familia === "rayo",
    bajoRayo.length
      ? `${bajoRayo.length} rayos utilizables en el templo, elegido el de luz ${elegido.luz}`
      : "ninguno utilizable: se ha caído al rincón del sacerdote, que es lo previsto");
  // El ancla es el sacerdote porque el mod lo designa primer NPC. Si desde donde
  // aparece el jugador no se le ve, el ancla no ha servido para nada. El detalle
  // se calcula AQUÍ y no se lee de `elegido`: ese campo sólo lo llevan las filas
  // de rayo, así que al caerse al rincón decía «ninguno a la vista» al lado de
  // un verde. Un control y su texto no pueden decir cosas distintas.
  const aLaVista = sacerdotes
    .filter((s) => seVeDesde(elegido.unidades, s.pies))
    .map((s) => dist(elegido.unidades, s.pies))
    .sort((a, b) => a - b);
  control("desde donde aparece SE VE al sacerdote", aLaVista.length > 0,
    aLaVista.length
      ? `${aLaVista.length} a la vista, el más cercano a ${aLaVista[0].toFixed(1)} m`
      : "ninguno a la vista");
}
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
// ── Que ningún rayo se caiga sin dejar rastro ──────────────────────────────
//
// Los dos controles que habrían cazado el bug de `enPueblo`. El primero es de
// conservación: cada uno de los rayos del mapa acaba elegible, descartado por
// el ancla, o descartado con un motivo escrito. El segundo es el que dice que
// el motivo tiene sentido en ESTE mapa: descartar por «fuera de toda zona
// msarea_town» donde no hay ninguna zona no es filtrar, es tirarlos todos.
{
  const contados = [...descartes.values()].reduce((a, b) => a + b, 0);
  const suma = bajoRayo.length + rayosFuera.length + contados;
  control("ningún rayo se cae sin motivo apuntado", suma === rayos.length,
    `${bajoRayo.length} en el templo + ${rayosFuera.length} fuera + ${contados} descartados` +
    ` = ${suma} de ${rayos.length}` +
    (descartes.size ? ` · ${[...descartes].map(([m, n]) => `${n} ${m}`).join(", ")}` : ""));

  const imposibles = HAY_PUEBLOS ? [] : [...descartes.keys()].filter((m) => m.includes("msarea_town"));
  control("y ninguno por una regla que este mapa no puede cumplir", imposibles.length === 0,
    HAY_PUEBLOS
      ? `${cajasPueblo.length} zonas msarea_town, así que la regla se puede cumplir`
      : "el mapa no tiene zonas, así que no se descarta por zona: " +
        (imposibles.length ? `PERO ${imposibles.join("; ")}` : "ninguno"));
}

if (!sacerdotes.length) {
  noAplica("la línea de visión sabe decir que no", "el mapa no tiene anclas que mirar");
} else {
  const ciegos = rayos.filter((r) => !Number.isFinite(r.alSacerdoteVisible)).length;
  control("la línea de visión sabe decir que no", ciegos > 0,
    `${ciegos} de ${rayos.length} rayos del mapa no ven a ningún sacerdote` +
    ` · dentro del templo descarta 0, o sea que aquí la distancia bastaba`);
}
// Si todos los rayos del mapa estuvieran en el templo, «del templo» no filtra
// nada y el ancla sería decorativa aquí igual que lo sería arriba. Pero pedirle
// esto a un mapa que no tiene rayos dentro del templo es pedirle un reparto que
// no existe: se juzga sólo cuando el ancla ha tenido rayos que repartir.
if (!bajoRayo.length) {
  noAplica("el ancla descarta rayos",
    `ninguno de los ${rayos.length} rayos del mapa cae en el templo, así que no hay reparto`);
} else {
  control("el ancla descarta rayos", rayosFuera.length > 0,
    `${bajoRayo.length} rayos dentro del templo, ${rayosFuera.length} descartados por estar fuera` +
    (rayosFuera[0] ? ` (el más claro, luz ${rayosFuera[0].luz})` : ""));
}
// Y el que compara con lo que había: el rayo tiene que ser mejor que el rincón
// en algo medible, o el cambio es sólo un gusto. Se pide que no empeore la luz
// Y que separe más del NPC, que es lo que se notaba jugando.
if (elegido.familia !== "rayo") {
  noAplica("el rayo mejora el rincón del sacerdote", "no se ha elegido un rayo");
} else {
  control("el rayo mejora el rincón del sacerdote",
    elegido.luz >= delTemplo.luz && elegido.alAmigo > delTemplo.alAmigo,
    `luz ${elegido.luz} contra ${delTemplo.luz} · ${elegido.alAmigo} m al NPC contra ${delTemplo.alAmigo} m`);
}
// Y el que impide que el ANCLA sea decorativa: tiene que haber al menos un
// sitio seguro MÁS CLARO que el elegido y aun así descartado. Si no lo hay,
// «el templo» y «el sitio más claro» son lo mismo y anclar no ha hecho nada.
if (!seCambio) {
  noAplica("el ancla cambia la respuesta", "no se ha usado el ancla: vale el punto del mapa");
} else {
  control("el ancla cambia la respuesta", resto.some((c) => c.luz > elegido.luz),
    resto.length
      ? `el más claro descartado es ${resto[0].nombre} con ${resto[0].luz}, contra ${elegido.luz} del templo`
      : "no hay otros sitios seguros, así que el ancla no se puede juzgar");
}

console.log("\n  CONTROLES");
for (const c of controles) {
  const marca = !c.aplica ? "n/a " : c.bien ? "ok  " : "MAL ";
  console.log(`  ${marca} ${c.que.padEnd(48)} ${c.aplica ? c.detalle : `no aplica: ${c.porQueNo}`}`);
}
// Sólo cuentan los que podían fallar. Un `n/a` que se sumara a los verdes sería
// el apartado 4 de CLAUDE.md otra vez.
const aplican = controles.filter((c) => c.aplica);
const fallan = aplican.filter((c) => !c.bien);
console.log(`  ${aplican.length - fallan.length}/${aplican.length} controles aplicables en verde,` +
  ` ${controles.length - aplican.length} que no aplican a ${MAPA}`);

// ── Lo que se escribe ──────────────────────────────────────────────────────
const salida = {
  mapa: man.mapa,
  procedencia: `derivado de ${MAPA}.bsp por tools/aparicion.mjs. Ver PROCEDENCIA.md`,
  criterio: {
    ancla: `los sacerdotes del templo: los ${DEL_TEMPLO.size} scripts de 2884 que incluyen ` +
           "help/first_npc, buscados al hornear y no escritos a mano",
    regla: "primero el ms_player_begin del mapa, que es lo que dice el mod (SPAWN_BEGIN, " +
           "player/player.cpp:2455); sólo si incumple una regla dura se busca otro sitio, y " +
           "entonces es el rayo de luz (func_illusionary rendermode 5) del templo, o el " +
           "rincón del sacerdote si el mapa no tiene rayos utilizables",
    reglasDuras: "0 hostiles a 15 m · se puede estar de pie · no dentro de otro NPC · " +
                 "dentro de un msarea_town SI el mapa tiene alguno",
    // Qué se decidió y por qué, que es lo que no se puede volver a deducir del
    // resultado: `nacimiento` a secas no dice si el mapa ya lo hacía bien.
    decision: porQue,
    seCambioElPuntoDelMapa: seCambio,
    loQueFallaElPuntoDelMapa: falloDelMapa,
    hayPueblos: HAY_PUEBLOS,
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
