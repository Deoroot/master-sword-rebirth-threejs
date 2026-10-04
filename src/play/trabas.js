// LAS TRABAS DE LOS EFECTOS — el 97: lo que un efecto le hace al CUERPO del
// jugador, leído de las variables `game.effect.*` de sus guiones.
//
// Hasta el 96 los efectos corrían enteros —`debuff_stun` tiraba su dado y decía
// «You have been stunned!», `effect_slow` decía «You are being slowed.»— y
// nadie leía lo que dejaban escrito. Un efecto de Master Sword no TRABA nada
// por sí mismo: escribe variables, y el motor las lee cada fotograma.
//
// ── QUIÉN LAS LEE, EN EL MOTOR ──────────────────────────────────────────────
//
// Dos bucles distintos, con dos criterios distintos:
//
//   1. LAS BANDERAS — `CBasePlayer::PreThink`, player.cpp:4033-4054. Recorre
//      TODOS los guiones del jugador (`m_Scripts`, el suyo incluido) y por cada
//      `game.effect.canmove|canrun|canjump|canduck|canattack` que valga
//      EXACTAMENTE «0» (`!strcmp(..., "0")`) pone su `PLAYER_MOVE_NO*`. «If it
//      was never set at all, assume false» (:4039): un `GetVar` de una variable
//      que no existe devuelve su NOMBRE, que no es «0».
//
//   2. LA VELOCIDAD — `CMSMonster::SetSpeed`, msmonsterserver.cpp:2819-2857,
//      llamada en cada `PostThink` del jugador (player.cpp:2187). Sólo mira los
//      guiones que son EFECTOS (`VarExists("game.effect.id")`, :2828) y
//      multiplica sus `game.effect.movespeed` con `atof` (:2833-2834): «50%» es
//      50. Si el producto no es 100, `pev->maxspeed = SpeedPercent` (:2844-2845),
//      y si es 0, `PLAYER_MOVE_NOMOVE` (:2855-2856).
//
// ── EL FALLO DEL ORIGINAL, PORTADO: `maxspeed` ES DOS COSAS ─────────────────
//
// `pev->maxspeed` lo lee el cliente de Master Sword COMO PORCENTAJE:
//
//     if (player.pev->maxspeed) fSpeed *= (player.pev->maxspeed / 100.0f);
//                                                   clplayer.cpp:306-307
//
// y de ahí salen `cl_forwardspeed`, `cl_backspeed` y `cl_sidespeed` (:311-316).
// Pero el MOTOR lo lee como lo que es en Half-Life, una velocidad absoluta en
// unidades por segundo: viaja como `clientmaxspeed` (sv_pmove.c:561,
// cl_pmove.c:843) y `PM_CheckParamters` topa con él:
//
//     maxspeed = pmove->clientmaxspeed;
//     if (maxspeed != 0.0) pmove->maxspeed = V_min(maxspeed, pmove->maxspeed);
//                                                   pm_shared.cpp:3050-3053
//
// O sea que un `effect_slow 50%` no te deja al 50 %: te deja a
// `min(fSpeed × 0,5, 50)` unidades por segundo, y como andar son 160 o más,
// **siempre a 50 u/s, el 31 % o menos**. El aturdimiento (`movespeed 45`), a
// 45 u/s. Correr no ayuda: el trote dobla `fSpeed`, y el tope no se mueve.
// Para un MONSTRUO el mismo número sí es un porcentaje (`ScriptMultiplier =
// pev->maxspeed / 100.0f`, msmonsterserver.cpp:1197-1199): el fallo es sólo
// del jugador, porque sólo el jugador pasa por `pmove`.
//
// Este archivo no importa nada del DOM ni de Three, como todo `src/play/`.

// `numDe` es `atof` (guion.js). NO `src/bsp/script.js`: ése lee del disco con
// `node:fs` y en el navegador no carga (lo dijo la sonda en su primera pasada).
import { numDe as atof } from "./guion.js";

/** `sv_maxspeed`, que el mod fija a 600 en cada `Think` (multiplay_gamerules.cpp:169). */
export const SV_MAXSPEED = 600;

/** Las cinco banderas de `PreThink`, con su variable (player.cpp:4041-4050). */
export const BANDERAS_DE_EFECTO = Object.freeze({
  noMover: "game.effect.canmove",      // PLAYER_MOVE_NOMOVE
  noCorrer: "game.effect.canrun",      // PLAYER_MOVE_NORUN — «Doesn't work :(», base_effect.script:33
  noSaltar: "game.effect.canjump",     // PLAYER_MOVE_NOJUMP
  noAgachar: "game.effect.canduck",    // PLAYER_MOVE_NODUCK
  noAtacar: "game.effect.canattack",   // PLAYER_MOVE_NOATTACK
});

/** `GetVar`: el valor, o el NOMBRE si no existe (script.cpp:4741). */
const leerVar = (guion, nombre) => String(guion?.resolver?.(nombre) ?? nombre);

/**
 * LAS TRABAS, de una lista de guiones (`m_Scripts`).
 *
 * @param guiones  `[{ guion, esEfecto }]`, en el orden de `m_Scripts`: el del
 *                 jugador primero y sus efectos detrás. `esEfecto` es
 *                 `VarExists("game.effect.id")`.
 * @returns `{ porcentaje, ritmoAnim, noMover, noCorrer, noSaltar, noAgachar,
 *            noAtacar, quien }`. `porcentaje` es `pev->maxspeed`: 0 si nada
 *            frena (`//Zero means normal speed`, :2821).
 */
export function trabasDe(guiones = []) {
  const t = {
    porcentaje: 0, ritmoAnim: 1,
    noMover: false, noCorrer: false, noSaltar: false, noAgachar: false, noAtacar: false,
    /** Qué guion puso cada cosa. Para medir: «se frenó» no dice quién (CLAUDE.md §4). */
    quien: [],
  };
  // 1. Las banderas, de TODOS los guiones (player.cpp:4033).
  for (const g of guiones) {
    for (const [campo, nombre] of Object.entries(BANDERAS_DE_EFECTO)) {
      if (leerVar(g.guion, nombre) === "0") { t[campo] = true; t.quien.push({ que: campo, ruta: g.ruta ?? null }); }
    }
  }
  // 2. La velocidad, de los EFECTOS (msmonsterserver.cpp:2826-2842).
  let pct = 100;
  for (const g of guiones) {
    if (!g.esEfecto) continue;
    if (g.guion?.existeVar?.("game.effect.movespeed")) {
      const v = atof(leerVar(g.guion, "game.effect.movespeed"));
      pct *= v / 100;
      t.quien.push({ que: "movespeed", ruta: g.ruta ?? null, valor: v });
    }
    if (g.guion?.existeVar?.("game.effect.anim.framerate")) {
      t.ritmoAnim *= atof(leerVar(g.guion, "game.effect.anim.framerate"));
    }
  }
  pct = Math.fround(pct);
  if (pct !== 100) t.porcentaje = pct;                       // :2844-2845
  if (!pct) t.noMover = true;                                // :2855-2856
  return t;
}

/**
 * Las trabas de un `GuionDelJugador` (src/play/guionjugador.js): su guion y
 * los efectos que lleva. Los marcados para borrar (`RemoveNextFrame`) no
 * cuentan: el barrido del siguiente `RunScriptEvents` los quita antes de que
 * el cuerpo los vuelva a leer — un fotograma de diferencia, dicho.
 */
export function trabasDelJugador(jugador) {
  if (!jugador?.guion) return trabasDe([]);
  const lista = [{ guion: jugador.guion, esEfecto: false, ruta: "player/player" }];
  for (const ef of jugador.efectos?.lista ?? []) {
    if (ef.quitar) continue;
    lista.push({ guion: ef.guion, esEfecto: ef.id !== null, ruta: ef.ruta });
  }
  return trabasDe(lista);
}

/**
 * LO QUE ANDA el jugador con las trabas puestas, en unidades por segundo.
 *
 * @param fSpeed      `CurrentSpeed()` ya pasado por `ParseSpeed` —lo que
 *                    `main.js` llama `maxima`—.
 * @param porcentaje  `pev->maxspeed` de `trabasDe`; 0 es «sin tocar».
 * @returns `{ maxima, tope }`: `maxima` es el `fSpeed` del cliente
 *          (clplayer.cpp:306-309), con el que se escalan los tres ejes y se
 *          topa la intención (input.cpp:829-841); `tope` es el
 *          `pmove->maxspeed` de `PM_CheckParamters` (pm_shared.cpp:3050-3053),
 *          `Infinity` si `sv_maxspeed` no llega a morder.
 */
export function velocidadConTrabas(fSpeed, porcentaje = 0) {
  if (!porcentaje) return { maxima: fSpeed, tope: Infinity };
  return {
    maxima: Math.max(fSpeed * (porcentaje / 100), 0.001),    // `V_max(fSpeed, 0.001)`, :309
    tope: Math.min(porcentaje, SV_MAXSPEED),
  };
}

// ── EL 98: LAS MISMAS TRABAS CON SERVIDOR ───────────────────────────────────
//
// En el motor las banderas y la velocidad las calcula el SERVIDOR (`PreThink`
// y `SetSpeed` son de `CBasePlayer`, server/player.cpp) y viajan al cliente en
// su `clientdata`: las banderas como `iuser3` (client.cpp:2800,
// clplayer.cpp:598) y la velocidad como `maxspeed` (`clientmaxspeed`,
// sv_pmove.c:561). El cliente las obedece al construir la orden y al
// predecir. Este puerto tiene además efectos en los DOS lados —el anfitrión
// de efectos del servidor (`Partida._efectosDe`) y el guion del jugador del
// navegador—, así que el navegador junta las suyas con las que le llegan.

/**
 * LO QUE UNA TRABA LE QUITA A LA INTENCIÓN, en un solo sitio para los dos
 * lados (src/main.js y `Partida._simular`). Donde lo obedece el motor:
 * NOMOVE pone a cero los ejes (input.cpp:821), NOJUMP y NODUCK no dejan
 * pasar el botón (:911-919), NOATTACK no deja EMPEZAR un ataque
 * (giattack.cpp:252-254) —y levantar el escudo es uno—.
 *
 * @param q  `{ adelante, lado, correr, saltar, agachar, atacar, cubrir }`,
 *           que se modifica y se devuelve.
 */
export function trabarIntencion(q, t) {
  if (!t) return q;
  if (t.noMover) { q.adelante = 0; q.lado = 0; }
  if (t.noCorrer) q.correr = false;
  if (t.noSaltar) q.saltar = false;
  if (t.noAgachar) q.agachar = false;
  if (t.noAtacar) { q.atacar = false; q.cubrir = false; }
  return q;
}

/**
 * Dos juegos de trabas de LA MISMA ENTIDAD, como si sus guiones estuvieran en
 * una sola lista (`m_Scripts`): las banderas se suman (`SetBits`,
 * player.cpp:4052) y los porcentajes se multiplican (msmonsterserver.cpp:
 * 2833-2834). `porcentaje` 0 es «sin tocar» (:2821).
 */
export function juntarTrabas(a, b) {
  if (!b) return a;
  if (!a) return b;
  const t = { ...a, quien: [...(a.quien ?? []), ...(b.quien ?? [])] };
  for (const campo of Object.keys(BANDERAS_DE_EFECTO)) t[campo] = Boolean(a[campo] || b[campo]);
  t.ritmoAnim = (a.ritmoAnim ?? 1) * (b.ritmoAnim ?? 1);
  if (a.porcentaje || b.porcentaje) {
    const pct = Math.fround((a.porcentaje || 100) * (b.porcentaje || 100) / 100);
    t.porcentaje = pct === 100 ? 0 : pct;
    if (!pct) t.noMover = true;
  }
  return t;
}

/**
 * Las trabas, para el cable: sólo lo que el cliente obedece (el `iuser3` y
 * el `maxspeed`), o `null` si no hay ninguna — que es lo normal y no viaja.
 */
export function trabasParaElCable(t) {
  if (!t) return null;
  const c = {};
  if (t.porcentaje) c.porcentaje = t.porcentaje;
  for (const campo of Object.keys(BANDERAS_DE_EFECTO)) if (t[campo]) c[campo] = true;
  if (t.ritmoAnim !== undefined && t.ritmoAnim !== 1) c.ritmoAnim = t.ritmoAnim;
  return Object.keys(c).length ? c : null;
}

/** Y de vuelta: lo que llegó por el cable, con la forma de `trabasDe`. */
export function trabasDelCable(c) {
  const t = trabasDe([]);
  if (!c) return t;
  if (Number.isFinite(c.porcentaje)) t.porcentaje = c.porcentaje;
  if (Number.isFinite(c.ritmoAnim)) t.ritmoAnim = c.ritmoAnim;
  for (const campo of Object.keys(BANDERAS_DE_EFECTO)) t[campo] = Boolean(c[campo]);
  t.quien.push({ que: "servidor", ruta: null });
  return t;
}
