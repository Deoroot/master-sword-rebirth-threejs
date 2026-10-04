// EL BRILLO DE UNA ENTIDAD, VISTO POR LOS DEMÁS — experimento 95, pieza E.
//
//     effect glow ent_me (75,215,0) 72 EFFECT_DURATION EFFECT_DURATION
//                                              effects/dot_poison.script, `dot_start`
//
// El 93 lo leía (`leerBrillo`, `cantidadDelBrillo` en efectospantalla.js), lo
// contaba y no lo dibujaba, porque **no es un mensaje**: `CEntGlow::SetGlow`
// le escribe a la ENTIDAD tres campos (mseffects.cpp:340-344)
//
//     pEntity->pev->renderfx   = kRenderFxGlowShell;   // 19, const.h:706
//     pEntity->pev->rendercolor = m_Color;
//     pEntity->pev->renderamt   = m_CurentAmount;
//
// y esos tres viajan en el estado de la entidad (`AddToFullPack`,
// server/client.cpp:2313-2318) a TODOS los que la tienen delante. O sea que
// aquí no hay `MSG_ONE`: el brillo de Ana va en la foto de Ana, y quien lo ve
// es Beto. Ana no, porque en primera persona no se dibuja su modelo (el 93).
//
// Aquí está la regla sin Three: qué escribe el servidor en la foto y qué hace
// el cliente con lo que llega. El dibujo, en `src/render/otros.js`.
//
// ── Lo que viaja: los tres campos, con sus tipos del cable ──────────────────
//
// `entity_state_t` lleva `int renderamt` y `color24 rendercolor`
// (common/entity_state.h:53-55), y la delta del jugador de Master Sword los
// manda en 8 bits: `renderamt` y `renderfx` como `DT_INTEGER, 8` y cada canal
// del color como `DT_BYTE, 8` (assets/msr/delta.lst, `entity_state_player_t`,
// las líneas de `rendermode`… `rendercolor.b`). Así que:
//
//   - `renderamt` es un `float` del servidor que pasa por un `int` —TRUNCA— y
//     se queda con 8 bits. 72 es 72; 71,9 es 71.
//   - el color es un `Vector` de `float` que pasa a `byte`: también trunca.
//
// ── Lo que hace el cliente: una CÁSCARA, no un tinte ────────────────────────
//
// `R_StudioRenderModel` (xash3d-fwgs ref/gl/gl_studio.c:3147-3168) dibuja el
// modelo DOS veces si lleva `kRenderFxGlowShell`: la normal, y luego otra con
// `STUDIO_NF_CHROME` forzado y la textura `REF_CHROME_SPRITE`. El mod tiene su
// copia, que hace lo mismo (client/render/studiomodelrenderer.cpp:2351-2371).
// La segunda pasada:
//
//   - es ADITIVA: con caras forzadas `R_StudioRenderFinal` usa
//     `kRenderTransAdd` (gl_studio.c:3065), que es `GL_ONE, GL_ONE` (:3005-3008);
//   - va EMPUJADA hacia fuera por la normal: `shellscale = max(1/128,
//     renderamt/128)` unidades (gl_studio.c:2292-2293) y `VectorMA(av, scale,
//     lv, vert)` (:1990);
//   - con el color de la entidad a alfa 255: `pglColor4ub(clr->r, clr->g,
//     clr->b, 255)` (:1991).
//
// **La cantidad no apaga el color.** `renderamt` sólo decide cuánto se separa
// la cáscara del modelo: con 72 son 0,56 unidades y al final del desvanecido,
// con 0, sigue habiendo una cáscara de 1/128 del mismo verde. El brillo del
// veneno se ve entero hasta el último instante y se va de golpe cuando
// `CEntGlow::Think` pone `renderfx = kRenderFxNone` (mseffects.cpp:367-372).
// Que «fade» signifique «adelgazar» es una rareza del motor y se porta así.

import { cantidadDelBrillo } from "./efectospantalla.js";

/** `kRenderFxGlowShell` — const.h:706 (el vigésimo del `enum`, contando desde 0). */
export const FX_CASCARA = 19;

/** `(int)` de un `float` de C: trunca hacia cero. */
const entero = (x) => Math.trunc(Number(x) || 0);

/**
 * Lo que la foto lleva de una entidad que brilla, o `null` si no brilla.
 *
 * `b` es lo que lee `leerBrillo` y `t` los segundos desde que se puso (el
 * `m_StartTime` de `CEntGlow::Create`, mseffects.cpp:312). La cantidad sale de
 * `cantidadDelBrillo` —`CEntGlow::Think`, :361-389, con su muerte del
 * objetivo— y pasa por los tipos del cable: `int` y 8 bits.
 *
 * Devuelve `{ fx, color: [r,g,b], cantidad }`.
 */
export function estadoDelBrillo(b, t, { vivo = true } = {}) {
  const c = cantidadDelBrillo(b, t, { vivo });
  if (c === null || c === undefined) return null;
  return {
    fx: FX_CASCARA,
    color: (b.color ?? [0, 0, 0]).slice(0, 3).map((x) => entero(x) & 0xff),
    cantidad: entero(c) & 0xff,
  };
}

/**
 * EL BRILLO DE UNA ENTIDAD CON VARIOS CONTROLADORES.
 *
 * Cada `effect glow` crea su propio `CEntGlow` (mseffects.cpp:923) y cada uno
 * escribe los tres campos de la MISMA entidad en su `Think`. Lo que queda en
 * `pev` es lo del último que escribió. Se toma el más NUEVO de los vivos, que
 * es el último en pensar dentro de un fotograma porque el motor recorre las
 * entidades por índice y la nueva tiene el mayor — un SUPUESTO, no medido.
 *
 * Lo que NO se porta, dicho aquí: cuando un controlador viejo caduca, su
 * `SetGlow(false)` apaga `renderfx` aunque otro siga vivo, y el otro no lo
 * vuelve a encender hasta su próximo `Think` —en el acto si está en su
 * desvanecido, hasta 6 s después si no (:386-389)—. Aquí el que sigue vivo
 * manda sin esa ventana apagada. En el veneno no se ve: desvanece desde el
 * primer instante (`EFFECT_DURATION EFFECT_DURATION`) y piensa cada fotograma.
 *
 * `lista` son `{ ...leerBrillo(...), desde }`, en el orden en que se pusieron.
 */
export function brilloDeLaEntidad(lista, ahora, { vivo = true } = {}) {
  for (let i = (lista?.length ?? 0) - 1; i >= 0; i--) {
    const b = lista[i];
    const e = estadoDelBrillo(b, ahora - b.desde, { vivo });
    if (e) return e;
  }
  return null;
}

/**
 * Los controladores que ya no hacen nada, fuera: caducados o con el objetivo
 * muerto (`SUB_Remove`, :370). Uno de duración negativa se borra al nacer
 * (:925-926) pero deja el brillo puesto PARA SIEMPRE; se conserva en la lista.
 */
export function podarBrillos(lista, ahora, { vivo = true } = {}) {
  return (lista ?? []).filter((b) => estadoDelBrillo(b, ahora - b.desde, { vivo }) !== null);
}

/**
 * Cuánto se separa la cáscara del modelo, en UNIDADES del motor —
 * gl_studio.c:2292-2293: `max(1/128, renderamt/128)`.
 */
export function separacionDeLaCascara(cantidad) {
  const f = 1 / 128;
  return Math.max(f, (Number(cantidad) || 0) * f);
}

/**
 * Lo que el cliente dibuja de un `estado` de la foto: `null` si no hay
 * cáscara, o `{ color: [0..1]×3, separacion }`. El color es el de
 * `pglColor4ub(r, g, b, 255)`, sumado a lo que haya detrás.
 */
export function cascaraDe(estado) {
  if (!estado || estado.fx !== FX_CASCARA) return null;
  return {
    color: estado.color.map((x) => (x & 0xff) / 255),
    separacion: separacionDeLaCascara(estado.cantidad),
  };
}

/**
 * Dos brillos de la foto son iguales si se dibujan igual. Para la compresión
 * delta de `src/red/partida.js` (`igual`): sin esto, un brillo que se pone a
 * un jugador quieto no viajaría nunca.
 */
export function mismoBrillo(a, b) {
  if (!a || !b) return !a && !b;
  return a.fx === b.fx && a.cantidad === b.cantidad &&
    a.color[0] === b.color[0] && a.color[1] === b.color[1] && a.color[2] === b.color[2];
}
