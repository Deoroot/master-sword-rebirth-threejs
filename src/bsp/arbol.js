// El árbol BSP: preguntarle al archivo qué hay en un punto.
//
// ── Por qué hizo falta ──────────────────────────────────────────────────────
//
// Porque alguien anduvo el mapa un minuto y dijo «el lugar de inicio del jugador
// está fuera de los interiores». Es la ronda que más encuentra, otra vez, y para
// contestarla hacía falta poder preguntar una cosa que ninguna parte del lector
// sabía: **¿este punto está dentro del mundo sellado, o en la roca?**
//
// Un `.bsp` lo sabe. Los 9 922 nodos son un árbol de planos, y cada hoja declara
// su contenido: vacío, sólido, agua, cielo. Recorrerlo es de quince líneas y sale
// una capacidad que vale para todo lo demás: colocar cámaras, validar puntos de
// aparición, encontrar el suelo bajo un sitio sin lanzar un rayo de física.
//
// ── Lo que contestó de primeras ─────────────────────────────────────────────
//
// Que el punto de llegada SÍ está en el mundo —los doce lo están— y que el
// problema era otro: yo estaba usando el punto equivocado. Ver `leerLlegada()`.

/** Los contenidos de una hoja, en el orden negativo de GoldSrc. */
export const CONTENIDO = {
  "-1": "vacio", "-2": "solido", "-3": "agua", "-4": "lodo", "-5": "lava",
  "-6": "cielo", "-7": "origin", "-8": "clip", "-9": "corriente_0",
  "-15": "translucido",
};

export const TAM_NODO = 24;
export const TAM_HOJA = 28;

/**
 * El nodo raíz de un modelo.
 *
 * Un `dmodel_t` lleva `headnode[4]` en el byte 36, después de `mins`, `maxs` y
 * `origin`. El 0 es el árbol de dibujo, que es el que tiene los contenidos; los
 * otros tres son los `clipnodes` de las tres cajas de colisión.
 */
export function raizDe(bsp, modelo = 0) {
  return bsp.lumps.modelos.datos.readInt32LE(modelo * 64 + 36);
}

/**
 * Qué hay en un punto: el contenido de la hoja en la que cae.
 *
 * El descenso es el de siempre: en cada nodo se mira de qué lado del plano cae el
 * punto y se baja por ese hijo. Un hijo NEGATIVO es una hoja, codificada como
 * `−(índice + 1)` — o sea que el −1 es la hoja 0, que en GoldSrc es siempre la
 * hoja de fuera del mundo y siempre es sólida.
 *
 * Devuelve el número crudo además del nombre, porque los contenidos raros
 * —corrientes de agua, translúcido— no tienen nombre en la tabla y callárselos
 * sería inventarse un `vacio`.
 */
export function contenidoEn(bsp, punto, modelo = 0) {
  const N = bsp.lumps.nodos.datos;
  const H = bsp.lumps.hojas.datos;
  const P = bsp.lumps.planos.datos;
  let n = raizDe(bsp, modelo);
  // Un tope de vueltas: un árbol corrupto con un ciclo colgaría el proceso, y
  // «se ha quedado colgado» es un síntoma malísimo de un archivo mal leído.
  for (let vuelta = 0; n >= 0; vuelta++) {
    if (vuelta > 1e5) throw new Error("el árbol BSP no acaba: ¿ciclo en los nodos?");
    const o = n * TAM_NODO;
    if (o + TAM_NODO > N.length) throw new Error(`nodo ${n} fuera del lump`);
    const ip = N.readInt32LE(o);
    const d =
      punto[0] * P.readFloatLE(ip * 20) +
      punto[1] * P.readFloatLE(ip * 20 + 4) +
      punto[2] * P.readFloatLE(ip * 20 + 8) -
      P.readFloatLE(ip * 20 + 12);
    n = N.readInt16LE(o + 4 + (d >= 0 ? 0 : 2));
  }
  const hoja = -(n + 1);
  const c = H.readInt32LE(hoja * TAM_HOJA);
  return { hoja, contenido: c, nombre: CONTENIDO[String(c)] ?? `desconocido(${c})`, vacio: c === -1 };
}

/** Si en un punto se puede estar: vacío o agua, pero no roca. */
export function sePuedeEstar(bsp, punto, modelo = 0) {
  const c = contenidoEn(bsp, punto, modelo).contenido;
  return c === -1 || c === -3 || c === -4;
}

/**
 * EL CONTENIDO DE UN PUNTO EN UN CASCO DE CLIPNODOS (1..3), que es como el
 * motor pregunta por una CAJA y no por un punto: `PM_HullPointContents`
 * (ReHLDS pmovetst.cpp:104-133). En los clipnodos el hijo negativo ES el
 * contenido, sin hojas en medio. Clipnodo de 8 bytes: plano y dos hijos.
 */
export function contenidoEnCasco(bsp, punto, casco = 1, modelo = 0) {
  const C = bsp.lumps.clipnodes.datos;
  const P = bsp.lumps.planos.datos;
  let n = bsp.lumps.modelos.datos.readInt32LE(modelo * 64 + 36 + casco * 4);
  for (let vuelta = 0; n >= 0; vuelta++) {
    if (vuelta > 1e5) throw new Error("el árbol de clipnodos no acaba: ¿ciclo?");
    const o = n * 8;
    if (o + 8 > C.length) throw new Error(`clipnodo ${n} fuera del lump`);
    const ip = C.readInt32LE(o);
    const d =
      punto[0] * P.readFloatLE(ip * 20) +
      punto[1] * P.readFloatLE(ip * 20 + 4) +
      punto[2] * P.readFloatLE(ip * 20 + 8) -
      P.readFloatLE(ip * 20 + 12);
    n = C.readInt16LE(o + 4 + (d >= 0 ? 0 : 2));
  }
  return n;
}

/**
 * EL 99: ¿CABE UN JUGADOR DE PIE con los pies aquí?
 *
 * `sePuedeEstar` pregunta por un PUNTO (el casco 0), y un punto cabe a seis
 * unidades de una pared. Un jugador no: es una caja de 32×32×72
 * (`VEC_HULL_MIN`/`VEC_HULL_MAX`, util.h:464-465) con el origen en el centro,
 * 36 por encima de los pies. El motor lo pregunta así —`PM_TestPlayerPosition`
 * con el casco 1, pmovetst.cpp:346— y si sale sólido `PM_CheckStuck` no le
 * deja moverse en todo el paso (pm_shared.cpp:3183-3189).
 *
 * Y LA CAJA NO SE APOYA DONDE EL PUNTO. `pies` sale de `sueloBajo`, que baja
 * un PUNTO; la caja tiene 32 unidades de planta y se apoya en lo más alto que
 * haya debajo de ella. El `ms_player_begin` de Edana está sobre un suelo
 * desigual: a 36-38 sobre el punto la caja es sólida, a 40 ya cabe. Por eso
 * se sube de unidad en unidad hasta un escalón (`sv_stepsize` 18,
 * `MOVEVARS.escalon`), que es lo que el jugador sube sin saltar. Una pared no
 * se acaba en 18 unidades: el rayo de Gate City sale sólido hasta +60.
 */
export function cabeDePie(bsp, pies, modelo = 0) {
  for (let dz = 1; dz <= 18 + 1; dz++) {
    if (contenidoEnCasco(bsp, [pies[0], pies[1], pies[2] + 36 + dz], 1, modelo) !== -2) return true;
  }
  return false;
}

/**
 * SÓLIDO PARA QUIEN CHOCA, que no es lo mismo que sólido para el árbol del mundo.
 *
 * Y ésta es la corrección que costó cuatro ratas. `sePuedeEstar` camina el árbol
 * del **modelo 0**, o sea el mundo; los `func_*` con brushes viven cada uno en su
 * propio modelo (`"model" "*242"`) y **no están en ese árbol**. Así que un punto
 * encima de una caja rompible sale «vacío», y `sueloBajo` sigue bajando hasta el
 * suelo de verdad — dejando lo que se coloque ahí DENTRO de la caja.
 *
 * Las cuatro `msmonster_giantrat` de Gate City tienen una `func_breakable` cada
 * una, de z −791 a −771, y el censo las puso a −791: veinte unidades enterradas,
 * y `m_StepSize` son 18, así que no podían salir ni andando ni hacia arriba. Con
 * `roam 1` puesto, 0,00 m en cinco minutos y ni un error.
 *
 * `extras` son las entidades con brushes que SÍ cuentan, y quién cuenta lo decide
 * quien llama: tiene que ser la misma lista que se mete en la malla de colisión
 * (`SOLIDAS` en tools/gatecity.mjs — `func_wall` y `func_breakable`), porque si
 * las dos listas no coinciden el mundo del extractor y el mundo del jugador son
 * dos mundos, que es este fallo otra vez con otra ropa.
 *
 * Cada extra es `{ modelo, origin }`: el índice del `*N` y su `origin`, que hay
 * que restar porque el árbol del modelo está en coordenadas locales.
 */
export function solidoPara(bsp, punto, extras = []) {
  if (!sePuedeEstar(bsp, punto)) return true;
  for (const e of extras) {
    const o = e.origin ?? [0, 0, 0];
    const p = [punto[0] - (o[0] ?? 0), punto[1] - (o[1] ?? 0), punto[2] - (o[2] ?? 0)];
    if (!sePuedeEstar(bsp, p, e.modelo)) return true;
  }
  return false;
}

/**
 * La cota del suelo bajo un punto, en unidades, o `null` si no hay.
 *
 * Baja de unidad en unidad hasta topar con sólido. Es tosco y es exacto a la
 * unidad, que es medio centímetro: para colocar una cámara o unos pies sobra, y
 * tiene la ventaja de no necesitar física — o sea que se puede hacer en Node, al
 * extraer, y el navegador recibe el número ya calculado.
 */
export function sueloBajo(bsp, punto, opciones = {}) {
  // Compatible con la firma vieja `sueloBajo(bsp, punto, 512)`.
  const { maximo = 1024, extras = [] } =
    typeof opciones === "number" ? { maximo: opciones } : opciones;
  for (let d = 0; d < maximo; d++) {
    const z = punto[2] - d;
    if (solidoPara(bsp, [punto[0], punto[1], z], extras)) return z + 1;
  }
  return null;
}

/**
 * Dónde llega el jugador, de verdad.
 *
 * **`ms_player_begin` SÍ existe en Gate City**, y me costó una ronda de alguien
 * jugándolo. En la primera pasada filtré `ms_player_begin|ms_player_spawn` juntos,
 * imprimí los cuatro primeros, vi cuatro `ms_player_spawn` y escribí en el código
 * que la otra clase no estaba en este mapa. Estaba: es la duodécima de doce, en
 * (−18,1, −87,0, −8,4) m, **exactamente las coordenadas que el encargo daba por
 * medidas**. O sea que tenía la respuesta escrita al lado y me fié de mi propia
 * sonda mal leída.
 *
 * La diferencia importa: los once `ms_player_spawn` son sitios de REAPARICIÓN,
 * repartidos por el mapa —tres de ellos a 65 m de los otros ocho— y coger el
 * primero deja al jugador donde le toque.
 *
 * Y la cota tampoco se adivina: el `origin` de este punto está **54 unidades por
 * encima del suelo**, no las 18 ni las 24 que dicen las convenciones de Quake y
 * Half-Life. Se le pregunta al árbol dónde está el suelo en vez de restar una
 * constante plausible, que es justo el tipo de valor por defecto que no da error.
 */
export function leerLlegada(bsp, entidades, origen) {
  const begin = entidades.find((e) => e.classname === "ms_player_begin" && origen(e));
  const spawns = entidades.filter((e) => e.classname === "ms_player_spawn" && origen(e));
  const e = begin ?? spawns[0];
  if (!e) throw new Error("el mapa no declara ni ms_player_begin ni ms_player_spawn");
  const o = origen(e);
  const suelo = sueloBajo(bsp, o);
  return {
    clase: e.classname,
    esLlegada: Boolean(begin),
    unidades: o,
    // Los pies van en el suelo medido; si no hay suelo debajo —que sería un punto
    // de aparición colgado sobre el vacío, y conviene que se note— se deja el
    // origin y el visor lo dejará caer.
    pies: [o[0], o[1], suelo ?? o[2]],
    alturaSobreElSuelo: suelo === null ? null : o[2] - suelo,
    reapariciones: spawns.length,
  };
}

/**
 * LAS LLEGADAS CON NOMBRE: dónde aparece quien viene por una transición. El 89.
 *
 * `leerLlegada` de arriba sólo se queda con UNA —la de empezar— y de las demás
 * guarda el número. Pero las `ms_player_spawn` que llevan `message` no son
 * reapariciones cualquiera: son **el otro extremo de una transición**. Quien
 * cruza una `msarea_transition` aparece en el mapa destino en una de las que se
 * llaman como su `desttrans`:
 *
 *     if (TransitionName && !FStrEq(STRING(pSpot->pev->message), TransitionName))
 *       { fValidSpot = false; continue; }            player.cpp:2363-2367
 *
 * Coincidencia EXACTA: una sin `message` no vale para ningún nombre. Y entre las
 * que valen se sortea (`RANDOM_LONG`, :2378), por eso se devuelven todas y no la
 * primera: Edana tiene cinco que se llaman `sewer_entrance`.
 *
 * El rumbo es el segundo de los tres `angles`, como en todas las entidades de
 * punto de GoldSrc.
 */
export function leerLlegadasConNombre(bsp, entidades, origen) {
  return entidades
    .filter((e) => e.classname === "ms_player_spawn" && e.message && origen(e))
    .map((e) => {
      const o = origen(e);
      const suelo = sueloBajo(bsp, o);
      const yaw = Number(String(e.angles ?? "0 0 0").trim().split(/\s+/)[1] ?? 0) || 0;
      return { nombre: e.message, unidades: o, pies: [o[0], o[1], suelo ?? o[2]], yaw };
    });
}
