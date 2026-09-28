// Las ESTADÍSTICAS de Master Sword, traducidas del motor y no inventadas.
//
// ── Por qué esto es una traducción y no un diseño ──────────────────────────
//
// Es la misma decisión que con `src/bsp/gamma.js`, y por la misma razón: la
// iluminación de Gate City se ajustó tres veces a ojo y las tres estaba mal,
// hasta que se copió `BuildGammaTable()` del motor. Aquí pasa igual. Los seis
// atributos, las nueve habilidades, cuántas propiedades tiene cada una y la
// curva de experiencia **están escritos** en 547 líneas de
// `MSC/.../src/game/shared/stats/`, y una cifra leída vale más que una elegida.
//
//     statdefs.h   los enum: qué hay y cuántos
//     stats.cpp    los nombres: NatStatList[6], SkillStatList[9],
//                  SkillTypeList[3], SpellTypeList[5]
//     msmonstershared.cpp:576   GetExpNeeded(), la curva
//     sv_character.cpp:22       CreateChar(), con qué empieza un personaje
//
// Lo que SÍ es nuestro —y va marcado donde toca— es lo que el original no
// tiene: de momento nada. Cuando lo haya, se dice.

// ── LO QUE CASI SE ME ESCAPA: los atributos NO se guardan ──────────────────
//
// Los seis atributos parecen lo de siempre —seis números que subes— y no lo
// son: **son una LECTURA de las nueve habilidades**, recalculada cada vez.
// `CMSMonster::GetStat()` los computa con una media ponderada distinta para
// cada uno (`msmonstershared.cpp:514`), y no hay ni un sitio donde se guarden.
//
// O sea que en Master Sword **no eliges atributos ni gastas puntos en ellos**.
// Subes espadas y te sube la fuerza. Eso es diseño, no una simplificación, y
// si se «mejora» a puntos repartibles se está cambiando el juego, no
// puliéndolo.
//
// Lo cazó una captura del HUD: 10/10 de maná en un personaje nuevo, y con mis
// atributos guardados a cero el maná salía 0. La captura era de Master Sword
// Continued —más antiguo— y sus cifras NO cuadran con éstas; lo que sirvió fue
// que no cuadraran, porque mandó a mirar el código.

/** Los seis atributos. `NatStatList[6]`, con los comentarios del autor. */
export const ATRIBUTOS = [
  { clave: "strength", nombre: "Strength", que: "cuánto cargas, y cómo regeneras aguante" },
  { clave: "agility", nombre: "Agility", que: "cuánto corres, y cuántas armas manejas" },
  { clave: "concentration", nombre: "Concentration", que: "cuánto te concentras" },
  { clave: "awareness", nombre: "Awareness", que: "cuánto te enteras del entorno" },
  { clave: "fitness", nombre: "Fitness", que: "cuánta vida tienes" },
  { clave: "wisdom", nombre: "Wisdom", que: "los hechizos cuestan menos" },
];

/** Las tres propiedades de una habilidad de arma. `SkillTypeList[3]`. */
export const PROPIEDADES = [
  { clave: "proficiency", nombre: "Proficiency", que: "velocidad" },
  { clave: "balance", nombre: "Balance", que: "puntería" },
  { clave: "power", nombre: "Power", que: "daño" },
];

/** Las cinco escuelas de magia. `SpellTypeList[5]`. */
export const ESCUELAS = [
  { clave: "fire", nombre: "Fire" },
  { clave: "ice", nombre: "Ice" },
  { clave: "lightning", nombre: "Lightning" },
  { clave: "divination", nombre: "Divination" },
  { clave: "affliction", nombre: "Affliction" },
];

/**
 * Las nueve habilidades. `SkillStatList[9]`.
 *
 * Y NO todas tienen tres propiedades, que es el detalle que se pierde si uno
 * asume una rejilla: `parry` tiene **una** y `spellcasting` tiene **cinco**, las
 * escuelas. Asumir tres deja a un mago con dos escuelas y una propiedad que no
 * existe, y eso no da error: da una hoja de personaje plausible y falsa.
 */
export const HABILIDADES = [
  { clave: "swordsmanship", nombre: "Swordsmanship", propiedades: "armas" },
  { clave: "martialarts", nombre: "Martial Arts", propiedades: "armas" },
  { clave: "smallarms", nombre: "Small Arms", propiedades: "armas" },
  { clave: "axehandling", nombre: "Axe Handling", propiedades: "armas" },
  { clave: "bluntarms", nombre: "Blunt Arms", propiedades: "armas" },
  { clave: "archery", nombre: "Archery", propiedades: "armas" },
  { clave: "spellcasting", nombre: "Spell Casting", propiedades: "magia" },
  { clave: "parry", nombre: "Parry", propiedades: "una" },
  { clave: "polearms", nombre: "Pole Arms", propiedades: "armas" },
];

/** Las propiedades concretas de una habilidad, por su clave. */
export function propiedadesDe(clave) {
  const h = HABILIDADES.find((x) => x.clave === clave);
  if (!h) return [];
  if (h.propiedades === "magia") return ESCUELAS.map((e) => e.clave);
  if (h.propiedades === "una") return ["proficiency"];
  return PROPIEDADES.map((p) => p.clave);
}

/** `STAT_MAX_VALUE` y `STATPROP_MAX_VALUE` de `statdefs.h`. */
export const TOPE_ATRIBUTO = 300;
export const TOPE_PROPIEDAD = 100;

/**
 * EL TOPE QUE DE VERDAD PARA, y no es el de arriba.
 *
 *     #define CHAR_LEVEL_CAP 45   // MiB JAN2010_15 Global Level Cap
 *                                            cbase.h:142
 *
 * `STATPROP_MAX_VALUE` (100) sólo recorta el valor al final de `LearnSkill`;
 * quien corta el aprendizaje es éste, cuarenta y cinco. O sea que los sesenta
 * y cinco puntos de en medio **no se alcanzan matando bichos**: el parry 60
 * del 19, que da el 7,05 %, no sale de entrenar. Son dos números distintos en
 * dos archivos distintos y se parecen lo justo para confundirse.
 */
export const TOPE_APRENDIZAJE = 45;

/**
 * La experiencia que hace falta para pasar de `valor` al siguiente.
 *
 *     long double GetExpNeeded(int StatValue) {
 *         return pow(1.248, StatValue) * (4.0 * StatValue);
 *     }
 *
 * Es una exponencial, no una tabla, así que no hay nada que copiar: se calcula.
 * Ojo con el cero — da 0, o sea que el primer punto es gratis.
 */
export function expNecesaria(valor) {
  return Math.pow(1.248, valor) * (4 * valor);
}

/**
 * Cómo empieza un personaje, de `CBasePlayer::CreateChar()`.
 *
 *   - un punto a la POTENCIA de cada habilidad de arma
 *   - un punto a la única propiedad de `parry`
 *   - un punto a CADA UNA de las cinco escuelas de magia
 *   - los atributos a cero
 *
 * Lo del punto en cada escuela es fácil de pasar por alto y cambia el arranque
 * de un mago por completo.
 */
export function habilidadesDePartida() {
  const out = {};
  for (const h of HABILIDADES) {
    const props = propiedadesDe(h.clave);
    out[h.clave] = {};
    for (const p of props) {
      const arranca = h.propiedades === "magia" || h.propiedades === "una" || p === "power";
      out[h.clave][p] = { valor: arranca ? 1 : 0, exp: 0 };
    }
  }
  return out;
}

/**
 * El VALOR de una habilidad: la media redondeada de sus propiedades, **con
 * suelo de uno**. `CStat::Value()`, `stats.cpp:145`.
 *
 *     int iVal = (Total + (iSubStats / 2)) / iSubStats;
 *     return (iVal == 0) ? 1 : iVal;
 *
 * El redondeo se hace sumando media unidad antes de dividir, con división
 * ENTERA en los dos sitios — `iSubStats / 2` también trunca. Con tres
 * propiedades a (0,0,1) da `(1+1)/3 = 0`, y el suelo lo sube a 1.
 *
 * El suelo importa: es lo que hace que un personaje recién creado tenga las
 * nueve habilidades a 1 aunque casi todas sus propiedades estén a cero.
 */
export function valorDeHabilidad(props) {
  const lista = Object.values(props ?? {});
  const n = lista.length;
  if (!n) return 0;
  const total = lista.reduce((s, p) => s + (p?.valor ?? 0), 0);
  const v = Math.trunc((total + Math.trunc(n / 2)) / n);
  return v === 0 ? 1 : v;
}

/**
 * Los seis atributos, DERIVADOS de las habilidades.
 *
 * Las siete medias ponderadas de `CMSMonster::GetStat()`, copiadas con sus
 * divisores —que no son el número de sumandos, y por eso no se pueden
 * «simplificar»—. El resultado es `int` en C++, así que trunca.
 */
export function atributosDe(habilidades) {
  const v = (clave) => valorDeHabilidad(habilidades?.[clave]);
  const out = {};
  for (const [atributo, { divisor, base = 0, pesos }] of Object.entries(GETSTAT)) {
    let suma = base;
    for (const [hab, peso] of Object.entries(pesos)) suma += v(hab) * peso;
    // `int` en C++, así que trunca. Y el divisor NO es el número de sumandos:
    // ver el comentario de `GETSTAT`.
    out[atributo] = Math.trunc(suma / divisor);
  }
  return out;
}

/**
 * Los pesos de `CMSMonster::GetStat()`, como TABLA y no dentro de la fórmula.
 *
 * Están así porque hacen falta en dos sitios: para calcular los atributos y
 * para contestar «¿qué le sube a este personaje si entrena espadas?», que es lo
 * que enseña la hoja. Escritos dos veces serían dos verdades, y la que envejece
 * es siempre la de la pantalla — que además nadie comprueba, porque una lista de
 * atributos plausible no se distingue de la correcta.
 *
 * **El divisor no es el número de sumandos** y por eso no se puede
 * «simplificar»: `strength` suma siete habilidades y divide entre 4, así que un
 * espadachín puro con Swordsmanship 100 saca 37 de fuerza y no 21. Es del motor
 * tal cual.
 *
 * `wisdom` es la rara: no es una media de nada, es `1 + spellcasting·1,8`. El
 * `1` va aquí como `base`.
 */
export const GETSTAT = {
  strength: { divisor: 4, pesos: {
    swordsmanship: 1.5, martialarts: 1.0, axehandling: 2.0, bluntarms: 1.9,
    polearms: 0.8, smallarms: 0.5, archery: 0.6 } },
  agility: { divisor: 6, pesos: {
    swordsmanship: 0.6, martialarts: 1.0, axehandling: 0.6, bluntarms: 0.6,
    smallarms: 0.6, polearms: 2.0, archery: 1.5 } },
  concentration: { divisor: 2, pesos: {
    archery: 1.5, polearms: 1.0, spellcasting: 2.0 } },
  awareness: { divisor: 7, pesos: {
    swordsmanship: 0.5, martialarts: 2.0, axehandling: 0.5, bluntarms: 0.5,
    smallarms: 1.5, archery: 2.0, polearms: 2.0 } },
  fitness: { divisor: 5, pesos: {
    swordsmanship: 1.0, martialarts: 1.0, axehandling: 1.5, bluntarms: 1.5,
    smallarms: 0.7, polearms: 0.7, archery: 0.6 } },
  wisdom: { divisor: 1, base: 1, pesos: { spellcasting: 1.8 } },
};

/**
 * A qué atributos aporta una habilidad, y cuánto, **calculado**.
 *
 * El mockup traía una tabla de ejemplo marcada honestamente como «sustituir por
 * la tabla real». No hace falta sustituirla a mano: es leer una columna de
 * `GETSTAT`. Para Swordsmanship sale Fuerza 1,5/4, Forma 1/5, Agilidad 0,6/6 y
 * Percepción 0,5/7 — ordenado por lo que de verdad rinde, que es `peso/divisor`
 * y no el peso a secas. Ahí está la diferencia entre la lista correcta y una
 * plausible: Percepción pesa 0,5 en Fuerza y 0,5 en Percepción, y sin embargo
 * rinde tres veces menos en la segunda.
 *
 * Y `parry` no aparece en ninguna: **no aporta a nada**, que es un dato del
 * motor y se puede decir en la hoja.
 */
export function aporteDe(habilidad) {
  const out = [];
  for (const [atributo, { divisor, pesos }] of Object.entries(GETSTAT)) {
    const peso = pesos[habilidad];
    if (!peso) continue;
    out.push({
      atributo,
      nombre: ATRIBUTOS.find((a) => a.clave === atributo)?.nombre ?? atributo,
      peso, divisor, rinde: peso / divisor,
    });
  }
  return out.sort((a, b) => b.rinde - a.rinde);
}

/**
 * Lo que sale de los atributos: vida, maná, aguante y cuánto cargas.
 * `playershared.cpp`, líneas 1057 a 1085.
 */
export function derivadas(atr) {
  const str = atr.strength ?? 0, fit = atr.fitness ?? 0, wis = atr.wisdom ?? 0;
  return {
    vidaMax: 5 + Math.max(str - 1, 0) * 7 + Math.max(fit - 1, 0) * 7 + Math.max(wis - 1, 0) * 3,
    manaMax: wis * 10,
    aguanteMax: 3 + fit * 2.5 + str * 1.0,
    // `Volume()`: cuánto peso puedes llevar encima.
    carga: Math.min(str * 25 + 25, 2000),
  };
}

/**
 * APRENDER: `CMSMonster::LearnSkill`, msmonsterserver.cpp:2713-2809.
 *
 * Esto sustituye al `darExperiencia` que había hasta el 20, que era una curva
 * de experiencia razonable y no la del juego. Se notaba jugando —matar un
 * goblin no subía nada— y la queja era exacta: «en Edana matar una rata sube
 * rápido el arma equipada». Sube rápido, y por un motivo que no se adivina.
 *
 * El motor entero es esto:
 *
 *     int iExpHandout = V_max(int(V_max(EnemySkillLevel, 0) * LearnMultiplier), 0);
 *     int OldVal = SubStat.Value;
 *     long double ExpNeeded = GetExpNeeded(OldVal);
 *     long double ExpLeft   = SubStat.Exp - ExpNeeded;
 *
 *     if (iExpHandout > (int)std::abs(ExpLeft) && (int)std::abs(ExpLeft) != 0)
 *       iExpHandout = std::abs(ExpLeft);
 *     else if ((int)std::abs(ExpLeft) == 0)
 *       iExpHandout = 1;
 *
 *     SubStat.Exp += iExpHandout;
 *     iExpRemaining -= iExpHandout;
 *     ...
 *     if (ExpLeft < 0) return std::make_tuple(false, iExpRemaining);
 *     SubStat.Value += 1;
 *     if (SubStat.Value > STATPROP_MAX_VALUE) SubStat.Value = STATPROP_MAX_VALUE;
 *     SubStat.Exp = 0;
 *
 * ── Las cuatro cosas que teníamos mal ─────────────────────────────────────
 *
 * 1. **`GetExpNeeded(OldVal)`, no `OldVal + 1`.** Para pasar de 1 a 2 el motor
 *    pide `1.248^1 · 4 = 4,99`; nosotros pedíamos `1.248^2 · 8 = 12,46`, dos
 *    veces y media de más, y la diferencia crece con el nivel. Es el fallo que
 *    se ve jugando.
 *
 * 2. **El reparto se recorta y el sobrante SE TIRA.** `iExpHandout` nunca puede
 *    pasar de lo que falta para el siguiente punto, y lo que sobra no se
 *    guarda en ningún sitio: la función sí devuelve `iExpRemaining`, pero
 *    **quien la llama no lo usa** (`pPlayer->LearnSkill(n, r, xp);`,
 *    msmonsterserver.cpp:2518). O sea que matar algo enorme vale casi lo mismo
 *    que matar una rata, y lo que cuenta de verdad son las MUERTES y no los
 *    puntos. Ahí está la rata de Edana.
 *
 * 3. **La subida se decide con el `ExpLeft` de ANTES de sumar.** Así que llegar
 *    al umbral no sube: sube la siguiente vez. Siempre cuesta una muerte extra,
 *    y no es un redondeo — es el orden de dos líneas.
 *
 * 4. **Hay un mínimo de uno.** Si lo que falta redondeado a entero es cero
 *    —o sea, si estás a menos de un punto del umbral— se entrega 1 pase lo que
 *    pase. Un bicho de nivel 0 también enseña, en ese hueco.
 *
 * Y de paso: **no se puede subir más de un punto por llamada.** Nuestro `while`
 * no podía ocurrir nunca en el juego.
 *
 * `prop` es `{ valor, exp }` y se modifica en el sitio, como el `CSubStat&` del
 * motor. Devuelve `{ subio, entregado, faltaba }` — `faltaba` es el `ExpLeft`
 * antes de sumar, que es lo que decide, y sin él una prueba no puede
 * distinguir «no llegó» de «llegó justo y le toca la vez que viene».
 */
export function aprender(prop, nivelDelEnemigo, {
  tope = TOPE_APRENDIZAJE, topeDuro = TOPE_PROPIEDAD, multiplicador = 1.0,
} = {}) {
  const nada = (porque) => ({ subio: false, entregado: 0, faltaba: null, porque });
  if (!prop) return nada("no hay propiedad");
  // `if (SubStat.Value >= CHAR_LEVEL_CAP)`. El salto a la siguiente propiedad
  // que hace el motor aquí es cosa de quien reparte, no de esto: ver `entrenar`.
  if (prop.valor >= tope) return nada(`tope de aprendizaje (${tope})`);

  // `int(...)`: trunca. Un bicho de nivel 0,9 no enseña nada por esta vía.
  let entrega = Math.max(Math.trunc(Math.max(nivelDelEnemigo ?? 0, 0) * multiplicador), 0);
  const falta = expNecesaria(prop.valor);
  const restante = prop.exp - falta;
  const aEntero = Math.trunc(Math.abs(restante));

  // `iExpHandout` es un `int` y `SubStat.Exp` es un `ulong`: la experiencia del
  // motor es ENTERA de punta a punta, y sólo `GetExpNeeded` devuelve decimales
  // (`long double`). Así que el recorte trunca, y ese truncado es justo lo que
  // hace que llegar al umbral cueste **dos** muertes más y no una: se sube a
  // 4 cuando hacen falta 4,992, y luego el mínimo de 1 tiene que picar dos
  // veces. Sin truncar salen dos muertes por punto en vez de tres.
  if (entrega > aEntero && aEntero !== 0) entrega = Math.trunc(Math.abs(restante));
  else if (aEntero === 0) entrega = 1;

  prop.exp += entrega;
  // El orden importa: se mira `restante`, que se calculó ANTES de sumar.
  if (restante < 0) return { subio: false, entregado: entrega, faltaba: restante, porque: "aún no llega" };

  prop.valor = Math.min(prop.valor + 1, topeDuro);
  prop.exp = 0;
  return { subio: true, entregado: entrega, faltaba: restante, porque: "sube un punto" };
}

/**
 * La habilidad y la propiedad que nombra un arma.
 *
 * El catálogo trae `swordsmanship` a secas para un arma normal y
 * `spellcasting.affliction` para una vara de magia — el punto separa la
 * habilidad de su propiedad. Sin partirlo, seis armas del catálogo apuntan a
 * una habilidad que no existe.
 */
export function habilidadDeArma(texto) {
  if (!texto) return null;
  const [hab, prop] = String(texto).toLowerCase().split(".");
  if (!HABILIDADES.some((h) => h.clave === hab)) return null;
  const props = propiedadesDe(hab);
  return { habilidad: hab, propiedad: prop && props.includes(prop) ? prop : null };
}
