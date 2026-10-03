/**
 * LO QUE EL SERVIDOR DECLARA, Y LO QUE DE AHÍ SALE PARA LOS BICHOS.
 *
 * Hasta el 22 la experiencia de un monstruo era «lo que dice su script» y ya.
 * No lo es: entre `setvard NPC_GIVE_EXP 25` y lo que el jugador se apunta hay
 * una cadena de ajustes que mira **cuánta vida máxima suman los jugadores
 * conectados** y **si el servidor está atado a un servidor central**. Son dos
 * sistemas distintos y los dos viven aquí.
 *
 * ── 1. Lo que el motor sabe de la partida ─────────────────────────────────
 *
 * Tres funciones en `util.cpp`, y las tres acaban igual:
 *
 *     float UTIL_TotalHP() {
 *       for (...) if (pPlayer->IsActive()) total_hp += pPlayer->MaxHP();
 *       if (atoi(CVAR_GetString("ms_central_enabled")) == 0) {
 *         float fakehp = atof(CVAR_GetString("ms_fake_hp"));
 *         if (fakehp > 0) total_hp = fakehp;
 *       }
 *       ...
 *     }                                              util.cpp:911-944
 *
 * Fíjate en DÓNDE está la condición: `ms_fake_hp` y `ms_fake_players` **sólo
 * se leen con el central apagado**. O sea que el propio motor declara que
 * «central apagado» es el modo de pruebas, el que te deja fingir la partida.
 * Es la respuesta a si conviene encenderlo aquí: no. Ver `PARTIDA`.
 *
 * ── 2. Lo que eso le hace al bicho ────────────────────────────────────────
 *
 * `monsters/base_self_adjust.script`, dos mecanismos que no hay que confundir:
 *
 *   `npcatk_self_adjust`  sube al MONSTRUO de nivel por tramos de vida total.
 *                         Sólo si su script pide `set_self_adj`.
 *   `npcatk_set_skill`    ajusta la EXPERIENCIA que reparte, y lo hace
 *                         **siempre**, para todos.
 *
 * En Gate City lo primero no lo pide nadie —ni los 25 scripts del pueblo ni
 * las entidades del `.bsp` nombran `set_self_adj`— así que los tramos están
 * ahí y no se disparan. Lo segundo sí corre, y tiene una errata que cambia el
 * número: ver `experienciaDelBicho`.
 */

/**
 * LA PARTIDA. Los tres `cvar` que el motor mira, con los valores con los que
 * arranca esto.
 *
 * `central: false` es una decisión, no un descuido:
 *
 *   - no hay servidor central que consultar, y encenderlo sin uno no conecta
 *     con nada: sólo enciende los multiplicadores de su economía;
 *   - esos multiplicadores son ×2 de experiencia a todo, ×4 a los jefes y
 *     +50 % por cada jugador de más (`base_self_adjust.script:465-482`). Es la
 *     curva de FuzzNet, no la del juego base, y medir sobre ella daría unos
 *     umbrales que no son los de nadie;
 *   - y con él encendido el motor **deja de leer** `ms_fake_hp` y
 *     `ms_fake_players`, que es justo lo que hace falta para poder probar el
 *     escalado sin diez jugadores delante.
 *
 * Lo contrario —dejarlo encendido «por si acaso»— daría un goblin de 52 de
 * experiencia y la sensación de que la curva del juego es el triple de rápida
 * de lo que es.
 */
export const PARTIDA = {
  /** `ms_central_enabled`. Apagado: no hay FuzzNet al otro lado. */
  central: false,
  /** `ms_fake_players`. Sólo se lee con el central apagado. 0 = no fingir. */
  jugadoresFalsos: 0,
  /** `ms_fake_hp`. Igual. 0 = no fingir. */
  vidaFalsa: 0,
  /**
   * `G_EXP_MULTI`, el multiplicador global del mapa. Gate City no lo pone, y
   * va como TEXTO y no como número por la misma razón que todo lo demás aquí:
   * «2.0» multiplica y «2» suma, y un `Number` ya no sabe cuál era.
   */
  multiplicadorGlobal: null,
};

/**
 * `UTIL_TotalHP` — la vida MÁXIMA sumada de los jugadores activos.
 *
 * Máxima y no actual: un jugador a un punto de vida cuenta entero. Es lo que
 * la hace servir de medida del nivel del grupo y no de cómo va la pelea.
 */
export function vidaTotal(jugadores = [], srv = PARTIDA) {
  let total = 0;
  let algunoFuera = false;
  for (const j of jugadores) {
    if (!j) continue;
    if (j.activo === false) { algunoFuera = true; continue; }
    total += j.vidaMaxima ?? 0;
  }
  if (!srv.central && srv.vidaFalsa > 0) total = srv.vidaFalsa;
  // «por si marcamos a todos como inactivos, no queremos joder las apariciones
  // de bichos ni los cofres» — el motor prefiere un 1 a un 0.
  if (total <= 0 && algunoFuera) total = 1;
  return total;
}

/** `UTIL_NumActivePlayers`, con la misma trampa de los falsos. */
export function jugadoresActivos(jugadores = [], srv = PARTIDA) {
  let n = 0;
  let algunoFuera = false;
  for (const j of jugadores) {
    if (!j) continue;
    if (j.activo === false) { algunoFuera = true; continue; }
    n += 1;
  }
  if (!srv.central && srv.jugadoresFalsos > 0) n = srv.jugadoresFalsos;
  if (n <= 0 && algunoFuera) n = 1;
  return n;
}

// ── EL NIVEL DEL MONSTRUO ───────────────────────────────────────────────────

/**
 * Los tramos de vida total, tal cual:
 *
 *     const NPC_ADJ_TIERS          "0;500;1000;2000;3000;5000"
 *     const NPC_ADJ_DMG_MUTLI_TOKENS "1.0;2.0;3.0;3.5;4.0;5.0;"
 *     const NPC_ADJ_HP_MUTLI_TOKENS  "1.0;2.0;3.0;3.5;4.0;5.0;"
 *                                      base_self_adjust.script:7-9
 */
export const TRAMOS = [0, 500, 1000, 2000, 3000, 5000];
export const MULTI_DANO = [1.0, 2.0, 3.0, 3.5, 4.0, 5.0];
export const MULTI_VIDA = [1.0, 2.0, 3.0, 3.5, 4.0, 5.0];
/** El sufijo del nombre: «Goblin II». Nivel 0 no lleva. */
export const ROMANOS = ["", " II", " III", " IV", " V", " VI"];

/**
 * `npcatk_self_adjust` — qué nivel le toca a un bicho con esta vida total.
 *
 *     if ( L_TOTAL_HP > $get_token(NPC_ADJ_TIERS,1) ) setvard NPC_ADJ_LEVEL 1
 *     ...
 *     if ( L_TOTAL_HP > $get_token(NPC_ADJ_TIERS,5) ) setvard NPC_ADJ_LEVEL 5
 *                                      base_self_adjust.script:170-175
 *
 * Se compara desde el token **1**: el 0 del principio de la lista no se usa
 * nunca. Y es `>` estricto, así que 500 justos siguen siendo nivel 0.
 *
 * `baja` es `NPC_ADJ_DOWN`, el parámetro de `set_self_adj <n>`: «used to cap
 * out adjustment on higher level beasties».
 */
export function nivelDeAjuste(vidaTotalDelGrupo = 0, { baja = 0 } = {}) {
  let nivel = 0;
  for (let t = 1; t < TRAMOS.length; t++) if (vidaTotalDelGrupo > TRAMOS[t]) nivel = t;
  if (baja > 0) nivel = Math.max(0, nivel - baja);
  return nivel;
}

/**
 * El ajuste entero de un monstruo: nivel, multiplicadores y sufijo.
 *
 * El detalle que no se adivina es cómo se aplican los multiplicadores:
 *
 *     local ADD_NPC_HP_MULTI $get_token(NPC_ADJ_HP_MUTLI_TOKENS,NPC_ADJ_LEVEL)
 *     if ( NPC_HP_MULTI == 1 ) subtract ADD_NPC_HP_MULTI 1
 *     add NPC_HP_MULTI ADD_NPC_HP_MULTI
 *                                      base_self_adjust.script:186-188
 *
 * No es una multiplicación: es una SUMA con un descuento de 1 que sólo se
 * aplica si el bicho no traía multiplicador propio. Con el caso normal
 * (multi 1) sale exactamente el número del tramo — 1 + (3 − 1) = 3. Pero a un
 * bicho al que el mapa ya le había puesto ×2, el tramo 3 le deja en **5**, no
 * en 6 ni en 3. Multiplicar aquí daría otro monstruo.
 *
 * `seAjusta` es `NPC_SELF_ADJUST`, y hay que pedirlo: en Gate City no lo pide
 * nadie, así que esto devuelve el nivel 0 para los 69.
 */
export function autoajustar({
  vidaTotalDelGrupo = 0, seAjusta = false, baja = 0,
  multiVida = 1, multiDano = 1,
} = {}) {
  if (!seAjusta) return { nivel: 0, multiVida, multiDano, sufijo: "" };
  const nivel = nivelDeAjuste(vidaTotalDelGrupo, { baja });
  const sumaVida = MULTI_VIDA[nivel] - (multiVida === 1 ? 1 : 0);
  const sumaDano = MULTI_DANO[nivel] - (multiDano === 1 ? 1 : 0);
  return {
    nivel,
    multiVida: multiVida + sumaVida,
    multiDano: multiDano + sumaDano,
    sufijo: ROMANOS[nivel] ?? "",
  };
}

// ── LA EXPERIENCIA QUE REPARTE ──────────────────────────────────────────────

/**
 * `expadj` — y su gramática, que es donde está la errata que importa.
 *
 *     if (Params[0].contains("."))
 *     {
 *       float oldxp = atof(GetFirstScriptVar("NPC_ORIG_EXP"));
 *       if (Params.size() > 1 && Params[1] == "scale")
 *            m_SkillLevel += (oldxp * atof(Params[0]));
 *       else m_SkillLevel *= atof(Params[0]);
 *     }
 *     else m_SkillLevel += atof(Params[0]);
 *                                            npcscript.cpp:445-465
 *
 * Lo que decide entre multiplicar y sumar **es el punto decimal del texto**.
 * No el valor: el texto. `expadj 2.0` multiplica por dos; `expadj 2` suma dos.
 *
 * Y el mod se pilla los dedos con eso una vez, en el sitio más transitado:
 *
 *     setvard NPC_ALL_XP_ADJ 1
 *     ... (nada que sumar, si el bicho no lleva multiplicadores) ...
 *     if ( !NO_EXP_MULTI ) expadj NPC_ALL_XP_ADJ noscale "apply external..."
 *                                      base_self_adjust.script:186, 444
 *
 * `NPC_ALL_XP_ADJ` vale la cadena «1», sin punto. Así que la línea que
 * pretendía «multiplicar por uno, o sea no tocar nada» **suma uno**. Todos los
 * monstruos del juego que no llevan multiplicadores valen un punto de
 * experiencia más de lo que dice su script: el goblin de Gate City no da 25,
 * da **26**.
 *
 * Se porta con la errata, como todo lo demás, y por eso esta función recibe el
 * ajuste como TEXTO y no como número.
 *
 * («noscale» no significa nada, dicho sea de paso: el motor sólo compara con
 * «scale», así que cualquier otra palabra ahí es un comentario.)
 */
export function expadj(exp, ajuste, { original = null } = {}) {
  const texto = String(ajuste);
  const v = Number.parseFloat(texto);
  if (!Number.isFinite(v)) return exp;
  if (!texto.includes(".")) return exp + v;              // suma plana
  if (original !== null) return exp + original * v;      // «scale»
  return exp * v;                                        // ratio
}

/**
 * La curva de los multiplicadores: +50 % de experiencia por cada 100 % de
 * daño o de vida por encima de 1, y el propio multiplicador topado en 5.
 *
 *     local L_ADJ NPC_DMG_MULTI
 *     if ( L_ADJ > 5 ) local L_ADJ 5
 *     subtract L_ADJ 1 ; multiply L_ADJ 0.5 ; add L_ADJ 1
 *     add NPC_ALL_XP_ADJ L_ADJ          base_self_adjust.script:312-320
 *
 * O sea que un ×2 de daño aporta 1,5 al ajuste, no 0,5: el `add 1` del final
 * está de más y hace que el ajuste se dispare. Un bicho con ×2 de daño y ×2 de
 * vida acaba en 1 + 1,5 + 1,5 = **4** veces la experiencia.
 */
function aportaMultiplicador(multi) {
  if (!(multi > 1)) return 0;
  // Cada paso pasa por `SetVar(..., "%.2f")`, así que se redondea a dos
  // decimales TRES veces y no una. Con los números de los tramos no cambia
  // nada; con un `dmgmulti 1.333` del mapa sí.
  const dosCifras = (x) => Number(x.toFixed(2));
  return dosCifras(dosCifras(dosCifras(Math.min(multi, 5) - 1) * 0.5) + 1);
}

/**
 * Cómo escribe el motor un número al guardarlo en una variable:
 *
 *     SetVar(Cmd.m_Params[1], UTIL_VarArgs("%.2f", flValue), Event);
 *                                        scriptcmds.cpp:4220-4221
 *
 * Dos decimales SIEMPRE, y por tanto un punto siempre. Es la otra mitad de la
 * errata del `expadj 1`: en cuanto algo toca la variable con `add`, deja de
 * ser el literal «1» y pasa a ser «2.50», y `expadj` cambia de sumar a
 * multiplicar sin que nadie lo escriba en ningún sitio.
 */
export const comoLoEscribe = (x) => x.toFixed(2);

/**
 * `npcatk_set_skill` de principio a fin: de lo que dice el script a lo que el
 * jugador se encuentra al matarlo.
 *
 * El orden importa y es éste (`base_self_adjust.script:263-500`):
 *
 *   1. el ajuste propio, `NPC_ALL_XP_ADJ`, que empieza en «1» y se aplica
 *      SUMANDO por la errata de arriba;
 *   2. la reducción del propio bicho, `NPC_EXP_REDUCT`;
 *   3. el multiplicador global del mapa, `G_EXP_MULTI`;
 *   4. y al final, sólo con central, la economía de FuzzNet: ×2 a todo, ×4 más
 *      a los jefes, y +50 % por cada jugador activo por encima del primero.
 *
 * Los dos últimos multiplican de verdad, porque el script los escribe con
 * punto (`expadj 2.0`). Y el reparto entre jugadores no está aquí: eso es
 * `expDeLaMuerte` en `src/play/golpe.js`, que va por daño hecho.
 */
export function experienciaDelBicho({
  base = 0, multiVida = 1, multiDano = 1,
  reduccion = null, esJefe = false, jugadores = 1,
  srv = PARTIDA,
} = {}) {
  const pasos = [];
  let exp = base;
  // `if NPC_GIVE_EXP > 0` (base_self_adjust.script:284) SALE del evento, y lo
  // que sale no toca `m_SkillLevel`: se queda lo que puso `skilllevel`. Para
  // el aldeano de `NPCs/default_human` eso es **−10** (:50), y hasta el 94
  // aquí se devolvía 0. El resultado era el mismo —el negativo lo para el
  // reparto, `while (iRemainingExp > 0)`, playerstats.cpp:83—, pero el número
  // que cruzaba no era el del motor y la regla vivía en el sitio equivocado
  // (doc/EXPERIENCIA_94.md).
  if (!(exp > 0)) return { exp: Number.isFinite(exp) ? exp : 0, pasos };
  const apunta = (porque) => pasos.push({ porque, exp });

  // ── 1. el ajuste propio ───────────────────────────────────────────────────
  // `NPC_ALL_XP_ADJ` se lleva como TEXTO a propósito: es lo único que
  // distingue sumar de multiplicar, y con un número ya no se puede saber.
  let ajuste = 1;
  let tocado = false;
  for (const m of [multiDano, multiVida]) {
    const a = aportaMultiplicador(m);
    if (!a) continue;
    ajuste = Number(comoLoEscribe(ajuste + a));
    tocado = true;
  }
  // Si nada lo tocó sigue siendo el literal «1» y `expadj` SUMA uno. Si algo lo
  // tocó lo escribió con `%.2f`, lleva punto, y multiplica. Los dos caminos son
  // el mismo `expadj`, y lo único que los separa es el formato del texto.
  const textoDelAjuste = tocado ? comoLoEscribe(ajuste) : "1";
  exp = expadj(exp, textoDelAjuste);
  apunta(`ajuste propio (${textoDelAjuste})`);

  // ── 2. la reducción del bicho ─────────────────────────────────────────────
  if (reduccion !== null && reduccion !== undefined) {
    exp = expadj(exp, reduccion);
    apunta(`NPC_EXP_REDUCT (${reduccion})`);
  }

  // ── 3. el multiplicador global del mapa ───────────────────────────────────
  // `if ( G_EXP_MULTI isnot 'G_EXP_MULTI' ) { if G_EXP_MULTI != 1 ; expadj ... }`
  // — se salta si no está puesto Y si vale uno. Las dos condiciones.
  const global = srv.multiplicadorGlobal;
  if (global !== null && global !== undefined && Number.parseFloat(global) !== 1) {
    exp = expadj(exp, global);
    apunta(`G_EXP_MULTI (${global})`);
  }

  // ── 4. FuzzNet ────────────────────────────────────────────────────────────
  if (srv.central) {
    exp = expadj(exp, "2.0");
    apunta("central: ×2");
    if (esJefe) { exp = expadj(exp, "4.0"); apunta("central: jefe ×4"); }
    // +50 % por jugador **más allá del primero**. Ojo al orden del script: el
    // `if` de una línea se come sólo la línea siguiente, así que con un solo
    // jugador el `subtract` no corre pero los dos de después SÍ — y el ajuste
    // sale 1 × 0,5 + 1 = 1,5. Con un jugador. Se porta con la errata.
    let n = jugadores;
    if (n > 1) n = Number(comoLoEscribe(n - 1));
    n = Number(comoLoEscribe(n * 0.5));
    n = Number(comoLoEscribe(n + 1));
    exp = expadj(exp, comoLoEscribe(n));
    apunta(`central: ${jugadores} jugador${jugadores > 1 ? "es" : ""} (×${n})`);
  }

  if (exp < 0) exp = 0;
  return { exp, pasos };
}
