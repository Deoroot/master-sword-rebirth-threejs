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

/** La versión del registro. Se sube cuando cambia la forma, no el contenido. */
export const VERSION = 1;

/** Los campos que este código conoce. Lo que no esté aquí se conserva intacto. */
//
// `atributos` NO está en la lista, y no es un olvido: **no se guardan**. Se
// derivan de las habilidades cada vez (`atributosDe`). Un documento antiguo
// que los traiga se conserva como cualquier campo desconocido, pero no manda.
const CONOCIDOS = new Set([
  "version", "id", "creado", "actualizado", "nombre", "genero", "oro",
  "habilidades", "objetos", "manos", "hechizos", "mapasVisitados",
  "mapa", "vida", "mana", "ranuras",
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
  if (!nombre || !String(nombre).trim()) throw new Error("un personaje necesita nombre");
  if (cfg.armas.length && !cfg.armas.includes(arma)) {
    throw new Error(`'${arma}' no está entre las armas de partida: ${cfg.armas.join(", ")}`);
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
    // Los objetos gratis y el arma elegida. El arma va a la mano derecha, que
    // es lo que hace `CreateChar`; si la elección es un hechizo, el motor lo
    // aprende en vez de dártelo, y aquí se distingue igual.
    objetos: [...(cfg.gratis ?? []), ...(arma ? [arma] : [])].map((id) => ({ id, n: 1 })),
    manos: { derecha: arma ?? null, izquierda: null },
    hechizos: [],
    // Las 36 ranuras, vacías. Un personaje nuevo no trae ninguna puesta: en MSR
    // se graban aguantando una tecla, y `CreateChar` no toca `m_QuickSlots`.
    ranuras: new Array(RANURAS_DEL_PERSONAJE).fill(null),
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
  if (!doc || typeof doc !== "object") throw new Error("eso no es un personaje");
  const avisos = [];
  const p = { ...doc };

  if (typeof p.version !== "number") { p.version = VERSION; avisos.push("sin versión, se asume la actual"); }
  if (p.version > VERSION) avisos.push(`versión ${p.version}, y este código entiende la ${VERSION}: se conserva lo que no entiende`);
  if (!p.id) { p.id = nuevoId(); avisos.push("sin id, se le pone uno"); }
  if (!p.nombre) throw new Error("un personaje sin nombre no es un personaje");

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

  const extra = Object.keys(p).filter((k) => !CONOCIDOS.has(k));
  if (extra.length) avisos.push(`campos que este código no conoce y se conservan: ${extra.join(", ")}`);
  return { personaje: p, avisos };
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
