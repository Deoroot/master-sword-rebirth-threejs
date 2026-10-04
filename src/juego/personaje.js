// El PERSONAJE: su registro, cómo se crea y cómo se guarda.
//
// ── Lo que se copia de MSR, y no es el código ──────────────────────────────
//
// El formato de guardado de Master Sword está bien pensado y hay dos
// decisiones suyas que valen aquí tal cual (`sv_character.cpp`,
// `mscharacter.h`):
//
//   VERSIÓN EN LA CABECERA, y usada de verdad. `SAVECHAR_VERSION_MSC 11` para
//   los personajes de Master Sword Classic y `12` para Rebirth, con un camino
//   de compatibilidad para leer los viejos. Un personaje de hace quince años
//   todavía carga.
//
//   TROZOS QUE SE PUEDEN SALTAR. El fichero son bloques con etiqueta, y la
//   última del enum es `CHARDATA_UNKNOWN` con el comentario «If >=
//   CHARDATA_UNKNOWN, then skip it?». Añadir algo nuevo no rompe lo guardado.
//
// Aquí eso se traduce a: un documento JSON con `version`, y **lo que no se
// entienda al leer se conserva y se vuelve a escribir**. Sin esa regla, abrir
// un personaje con una versión vieja del juego le borra lo que le añadió una
// nueva — y eso no da error, da un personaje mutilado.

import {
  ATRIBUTOS, HABILIDADES, habilidadesDePartida, propiedadesDe,
  aprender, TOPE_APRENDIZAJE, habilidadDeArma, atributosDe, derivadas, valorDeHabilidad,
} from "./stats.js";

/**
 * La versión del registro. Se sube cuando cambia la forma, no el contenido.
 *
 * LA 2 (el 97): **lo que va en la mano ya NO está también en `objetos`.** En el
 * motor un objeto es una entidad con UN sitio —`m_Location`, la mano o el
 * cuerpo o un contenedor (genericitem.h:24-28)— y el fichero lo escribe una
 * vez con ese sitio y su mano (sv_character.cpp:615-623; `Location` y `Hand`
 * en `ReadItem`, :413-419). `CreateChar` da el arma elegida A LA MANO y a
 * ningún otro sitio (`AddItem(pStartingItem, true, true)`, :94-96).
 *
 * La versión 1 la escribía en los dos: `objetos` Y `manos.derecha`. Casi todo
 * el código la leía ya como dos sitios distintos —`cumplir` saca de la mochila
 * lo que empuña, `Partida._empunar` igual, `soltarDelInventario` sólo vacía la
 * mano—, así que el duplicado se quedaba para siempre: al cambiar de arma la
 * vieja volvía a la mochila y había DOS espadas oxidadas, y el ciclador (que
 * busca por id) no pasaba de la segunda (doc/ARMAS_96.md). Ver `abrirPersonaje`
 * para cómo se abre un personaje de la 1.
 */
export const VERSION = 2;

/** Los campos que este código conoce. Lo que no esté aquí se conserva intacto. */
//
// `atributos` NO está en la lista, y no es un olvido: **no se guardan**. Se
// derivan de las habilidades cada vez (`atributosDe`). Un documento antiguo
// que los traiga se conserva como cualquier campo desconocido, pero no manda.
const CONOCIDOS = new Set([
  "version", "id", "creado", "actualizado", "nombre", "genero", "oro",
  "habilidades", "objetos", "manos", "hechizos", "mapasVisitados",
  "mapa", "vida", "mana", "ranuras",
  // Desde el 33. Ver `src/play/misiones.js`: es `m_Quests`, una lista de pares
  // `{n, d}`, y en el fichero del motor es su propio trozo con etiqueta
  // (`CHARDATA_QUESTS1`, sv_character.cpp:687). Un personaje de antes no lo
  // trae y se abre con la lista vacía; lo comprueba `juego_misiones.test.mjs`.
  "misiones",
]);

/**
 * Cuántas ranuras rápidas lleva el documento. Son las 36 de `MAX_QUICKSLOTS`, y
 * se escriben **siempre las 36**, vacías incluidas, que es lo que hace
 * `sv_character.cpp:698`. La regla está en `src/play/ranuras.js`; aquí sólo se
 * guardan, porque el fichero de personaje es quien las lleva.
 */
export const RANURAS_DEL_PERSONAJE = 36;

/** Un identificador que no depende de nada del entorno. */
function nuevoId() {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Sin `crypto` —un Node viejo, un contexto raro— vale una cadena aleatoria:
  // esto identifica un personaje en un disco, no una sesión contra nadie.
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Crea un personaje, con lo que MSR le da: `CBasePlayer::CreateChar()`.
 *
 * `nuevoPersonaje` es lo que `tools/objetos.mjs` saca de `global.script`: el
 * oro, los objetos gratis y la lista de armas entre las que se elige. Se pasa
 * en vez de fijarse aquí porque **es un dato del juego y no una decisión
 * nuestra**: cambiar el oro de partida en MSR es editar una línea de script.
 */
export function crearPersonaje({ nombre, genero = "male", arma, nuevoPersonaje = null, ahora = null }) {
  const cfg = nuevoPersonaje ?? { oro: 10, gratis: [], armas: [] };
  const t = ahora ?? new Date().toISOString();
  if (!nombre || !String(nombre).trim()) throw new Error("a character needs a name");
  if (cfg.armas.length && !cfg.armas.includes(arma)) {
    throw new Error(`'${arma}' is not one of the starting weapons: ${cfg.armas.join(", ")}`);
  }
  return {
    version: VERSION,
    id: nuevoId(),
    creado: t,
    actualizado: t,
    nombre: String(nombre).trim(),
    genero,
    oro: cfg.oro ?? 0,
    habilidades: habilidadesDePartida(),
    // Los objetos gratis a la lista y el arma elegida A LA MANO, y sólo a la
    // mano: `AddItem(pStartingItem, true, true)` (sv_character.cpp:94-96). Hasta
    // el 97 iba también a `objetos` y eso es lo que duplicaba la espada (ver
    // `VERSION`). Lo que NO se distingue todavía: si la elección es un hechizo
    // el motor lo aprende (`LearnSpell`, :87-91) en vez de dártelo.
    objetos: (cfg.gratis ?? []).map((id) => ({ id, n: 1 })),
    manos: { derecha: arma ?? null, izquierda: null },
    hechizos: [],
    // Las 36 ranuras, vacías. Un personaje nuevo no trae ninguna puesta: en MSR
    // se graban aguantando una tecla, y `CreateChar` no toca `m_QuickSlots`.
    ranuras: new Array(RANURAS_DEL_PERSONAJE).fill(null),
    // `m_Quests` de un personaje recién creado está vacío: `CreateChar` no lo
    // toca. Va explícito para que el documento tenga siempre la misma forma.
    misiones: [],
    mapasVisitados: [],
    mapa: null,
    // Empieza lleno. Los máximos no se guardan porque se derivan: guardarlos
    // sería tener dos verdades y que una envejezca.
    ...(() => {
      const d = derivadas(atributosDe(habilidadesDePartida()));
      return { vida: d.vidaMax, mana: d.manaMax };
    })(),
  };
}

/**
 * Normaliza un personaje leído del disco: rellena lo que falte, **conserva lo
 * que no conozca** y deja dicho qué ha tenido que tocar.
 *
 * Nunca lanza por un campo de más: un documento de una versión futura se abre
 * y se vuelve a guardar entero.
 */
export function abrirPersonaje(doc) {
  if (!doc || typeof doc !== "object") throw new Error("that is not a character");
  const avisos = [];
  const p = { ...doc };

  if (typeof p.version !== "number") { p.version = VERSION; avisos.push("sin versión, se asume la actual"); }
  if (p.version > VERSION) avisos.push(`versión ${p.version}, y este código entiende la ${VERSION}: se conserva lo que no entiende`);
  if (!p.id) { p.id = nuevoId(); avisos.push("sin id, se le pone uno"); }
  if (!p.nombre) throw new Error("a character with no name is not a character");

  const hab = p.habilidades ?? {};
  const completas = {};
  for (const h of HABILIDADES) {
    completas[h.clave] = {};
    for (const prop of propiedadesDe(h.clave)) {
      const v = hab[h.clave]?.[prop];
      completas[h.clave][prop] = {
        valor: Number.isFinite(v?.valor) ? v.valor : 0,
        exp: Number.isFinite(v?.exp) ? v.exp : 0,
      };
    }
    // Una habilidad o propiedad que el documento trae y nosotros no
    // conocemos NO se tira: se guarda aparte y vuelve al disco.
    for (const k of Object.keys(hab[h.clave] ?? {})) {
      if (!(k in completas[h.clave])) {
        completas[h.clave][k] = hab[h.clave][k];
        avisos.push(`propiedad desconocida '${h.clave}.${k}', se conserva`);
      }
    }
  }
  for (const k of Object.keys(hab)) {
    if (!(k in completas)) { completas[k] = hab[k]; avisos.push(`habilidad desconocida '${k}', se conserva`); }
  }
  p.habilidades = completas;

  p.objetos = Array.isArray(p.objetos) ? p.objetos : [];
  p.manos = { derecha: null, izquierda: null, ...(p.manos ?? {}) };
  // DE LA 1 A LA 2 (el 97): lo que hay en una mano sale UNA vez de `objetos`.
  //
  // Lo que no se puede saber es si esa copia era el duplicado de la creación
  // o una segunda espada de verdad comprada después: en la 1 las dos se
  // escriben igual. Se quita una y se dice. Los caminos que dejaba la 1 son
  // dos y los dos dan lo mismo: un personaje que nunca cambió de arma tiene el
  // duplicado; uno que sí, ya no (`cumplir` sacaba de la lista TODAS las
  // copias al empuñar), y entonces aquí no se toca nada.
  if (p.version < 2) {
    p.objetos = p.objetos.slice();
    for (const mano of ["derecha", "izquierda"]) {
      const id = p.manos[mano];
      if (!id) continue;
      const i = p.objetos.findIndex((o) => (o?.uid ?? o?.id) === id || o?.id === id);
      if (i < 0) continue;
      const o = p.objetos[i];
      if ((o.n ?? 1) > 1) p.objetos[i] = { ...o, n: o.n - 1 };
      else p.objetos.splice(i, 1);
      avisos.push(`versión ${p.version}: '${id}' estaba en la mano Y en los objetos; se deja sólo en la mano`);
    }
    p.version = VERSION;
  }
  p.hechizos = Array.isArray(p.hechizos) ? p.hechizos : [];
  // Un personaje de antes del 26 no trae ranuras, y uno de un juego con más
  // ranuras que éste traería más: se rellena hasta 36 y **no se recorta**, que
  // es lo que permitió a MSR subir de 12 a 36 sin mutilar a nadie.
  {
    const r = Array.isArray(p.ranuras) ? p.ranuras.slice() : [];
    while (r.length < RANURAS_DEL_PERSONAJE) r.push(null);
    if (r.length > RANURAS_DEL_PERSONAJE) avisos.push(`el documento trae ${r.length} ranuras y este código usa ${RANURAS_DEL_PERSONAJE}: se conservan`);
    p.ranuras = r;
  }
  p.mapasVisitados = Array.isArray(p.mapasVisitados) ? p.mapasVisitados : [];
  if (typeof p.oro !== "number") p.oro = 0;

  // LAS MISIONES, y el motivo por el que esto es TRES líneas y no una
  // migración: el fichero de Master Sword son trozos con etiqueta y el último
  // valor del enum es `CHARDATA_UNKNOWN` con el comentario «If >=
  // CHARDATA_UNKNOWN, then skip it?». Añadir un trozo no rompe lo guardado, y
  // no encontrarlo no es un error: es un personaje de antes.
  //
  // Se rellena con la lista vacía y **no se sube la versión**, porque la forma
  // no ha cambiado de manera incompatible: un personaje del 33 abierto por el
  // código del 32 pierde las misiones al releerlo… no, tampoco: el 32 lo
  // conserva como «campo que no conozco». Las dos direcciones funcionan, que
  // es lo que la regla de la cabecera promete y lo que una prueba comprueba.
  if (!Array.isArray(p.misiones)) {
    if (p.misiones !== undefined) avisos.push("las misiones venían con otra forma: se empieza de cero");
    p.misiones = [];
  }
  // Una entrada suelta rota no puede tirar el personaje entero: se tira ella.
  p.misiones = p.misiones.filter((q) => q && typeof q.n === "string").map((q) => ({ n: q.n, d: String(q.d ?? "") }));

  const extra = Object.keys(p).filter((k) => !CONOCIDOS.has(k));
  if (extra.length) avisos.push(`campos que este código no conoce y se conservan: ${extra.join(", ")}`);
  return { personaje: p, avisos };
}

/**
 * TODO lo que lleva encima: la lista y las dos manos, cada cosa una vez.
 *
 * Es el `Gear` del motor, que incluye lo de las manos: el peso es
 * `Gear.FilledVolume()` (msmonstershared.cpp:430-433) y los guiones de objeto
 * corren para todo el `Gear` (playershared.cpp:1524-1544). Desde la versión 2
 * del registro lo empuñado no está en `objetos`, así que quien quiera «todo»
 * tiene que pedirlo aquí y no leer `objetos` a pelo.
 */
export function loQueLleva(p) {
  const fuera = [...(p?.objetos ?? [])];
  for (const mano of ["izquierda", "derecha"]) {
    const m = p?.manos?.[mano];
    if (!m) continue;
    const id = typeof m === "string" ? m : (m.id ?? m.clave);
    if (id) fuera.push({ id, n: 1, mano });
  }
  return fuera;
}

/** Deja el documento listo para guardar: sella la fecha y nada más. */
export function sellar(p, ahora = null) {
  return { ...p, actualizado: ahora ?? new Date().toISOString() };
}

/**
 * Da experiencia por un golpe con un arma del catálogo.
 *
 * MSR reparte la experiencia entre las propiedades de la habilidad que usaste
 * (`playerstats.cpp`), y el arma dice cuál es: `swordsmanship` o
 * `spellcasting.affliction`. Si el arma nombra una propiedad concreta, va ahí;
 * si no, a POTENCIA, que es la que `CreateChar` arranca a 1.
 *
 * ── El salto de propiedad al llegar al tope ───────────────────────────────
 *
 * Con la propiedad en 45 el motor no se rinde: busca otra, y lo hace con un
 * bucle que llama la atención por lo corto que es.
 *
 *     if (pStat->m_SubStats.size() == 1 || pStat->m_SubStats.size() > 3)
 *       return std::make_tuple(false, 0);        // magia y parry, ni se intenta
 *     for (int i = 0; i < 1; i++) {              // <- UNA vuelta
 *       iStatType = (iStatType + 1) % 3;
 *       CSubStat & SubStat = pStat->m_SubStats[iStatType];
 *       if (SubStat.Value < CHAR_LEVEL_CAP) break;
 *     }
 *     if (SubStat.Value >= CHAR_LEVEL_CAP) return std::make_tuple(false, 0);
 *                                            msmonsterserver.cpp:2733-2755
 *
 * O sea que sólo mira **la siguiente**, no las otras dos. Con dos propiedades
 * seguidas al tope y la tercera libre, la tercera no se entera: se deja de
 * aprender con la habilidad a medias. Y el `break` de dentro sombrea el
 * `SubStat` de fuera, así que la comprobación de después vuelve a mirar la
 * propiedad de ENTRADA, no la elegida — en la práctica la rama sólo funciona
 * porque el `return` de dentro no existe. Va portado con el fallo.
 */
export function entrenar(p, textoHabilidad, nivelDelEnemigo) {
  const h = habilidadDeArma(textoHabilidad);
  if (!h) return { subidas: 0, donde: null };
  const props = propiedadesDe(h.habilidad);
  let clave = h.propiedad ?? (p.habilidades[h.habilidad]?.power ? "power" : props[0]);
  let destino = p.habilidades[h.habilidad]?.[clave];
  if (!destino) return { subidas: 0, donde: null };

  // El salto, sólo para las habilidades de tres propiedades: la magia tiene
  // cinco y el parry una, y el motor se retira en las dos.
  if (destino.valor >= TOPE_APRENDIZAJE && props.length === 3) {
    const siguiente = props[(props.indexOf(clave) + 1) % 3];
    const otro = p.habilidades[h.habilidad]?.[siguiente];
    if (otro && otro.valor < TOPE_APRENDIZAJE) { clave = siguiente; destino = otro; }
  }

  const r = aprender(destino, nivelDelEnemigo);
  return { subidas: r.subio ? 1 : 0, entregado: r.entregado, donde: `${h.habilidad}.${clave}` };
}

/** Un resumen legible, para la hoja de personaje y para las sondas. */
export function resumen(p) {
  const habs = [];
  for (const h of HABILIDADES) {
    const props = propiedadesDe(h.clave).map((k) => ({ clave: k, ...(p.habilidades[h.clave]?.[k] ?? { valor: 0, exp: 0 }) }));
    habs.push({
      clave: h.clave, nombre: h.nombre, propiedades: props,
      // El valor de la habilidad es la MEDIA de sus propiedades con suelo de
      // uno, no la suma. Es lo que alimenta los atributos.
      valor: valorDeHabilidad(p.habilidades[h.clave]),
      total: props.reduce((s, x) => s + x.valor, 0),
    });
  }
  const atr = atributosDe(p.habilidades);
  return {
    nombre: p.nombre, oro: p.oro,
    atributos: ATRIBUTOS.map((a) => ({ ...a, valor: atr[a.clave] ?? 0 })),
    derivadas: derivadas(atr),
    habilidades: habs,
    // La suma de todo, que es lo más parecido a un «nivel» que tiene MSR — y
    // no existe en el original: allí no hay nivel, hay habilidades. Es NUESTRO
    // y se marca como tal.
    sumaDeHabilidades: habs.reduce((s, h) => s + h.total, 0),
  };
}
