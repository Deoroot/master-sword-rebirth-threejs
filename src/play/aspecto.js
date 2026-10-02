// EL ASPECTO DE UNA ENTIDAD: `rendermode`, `renderamt`, `renderfx`.
//
// Esto es la regla que decide si algo **se dibuja o no se dibuja**, y vive aquí
// —en `src/play/`, sin Three y sin DOM— porque la necesitan tres sitios: el
// extractor (para decir en qué estado nace cada adorno), el visor (para
// montarlo) y las pruebas. Cuando estaba repartida no existía en ninguno.
//
// ── DÓNDE SE DECIDE ─────────────────────────────────────────────────────────
//
//     qboolean R_AddEntity( struct cl_entity_s *clent, int type )
//     {
//       ...
//       if( FBitSet( clent->curstate.effects, EF_NODRAW ))
//               return false;
//       if( !R_ModelOpaque( clent->curstate.rendermode ) && CL_FxBlend( clent ) <= 0 )
//               return true;   // invisible
//
//                                               ref/gl/gl_rmain.c:242-253
//
// Las dos cosas que hay que leer de ahí:
//
//  1. **No es «se dibuja transparente»: no se añade a la lista.** Un adorno
//     invisible no cuesta un triángulo, no proyecta sombra y no entra en el
//     reparto por material.
//  2. **`R_ModelOpaque(rm)` es `rm == kRenderNormal`** (ref/gl/gl_local.h:87).
//     O sea que un `renderamt 0` sólo esconde si el modo NO es el 0. Con
//     `rendermode 0` el `renderamt` da igual: se dibuja entero. Eso importa
//     porque invita al error contrario —«amt 0 es invisible»— y los cuatro
//     platos de sopa de Edana pasan por aquí.
//
// ── `CL_FxBlend`, Y LO QUE DE ÉL SE PORTA ───────────────────────────────────
//
// `CL_FxBlend` (ref/gl/gl_rmain.c:1218-1333) es un `switch` de dieciséis ramas
// sobre `renderfx`: pulsos, parpadeos, desvanecidos, el holograma. Todas acaban
// en un `bound(0, blend, 255)`.
//
// **De las 229 colocaciones y entidades con aspecto de los dos mapas portados,
// `renderfx` vale 0 en las 229.** Así que la única rama que se ejecuta en este
// juego es la de abajo:
//
//     default:
//             blend = e->curstate.renderamt;
//             break;
//     ...
//     blend = bound( 0, blend, 255 );
//
// Y por eso aquí está portada ésa y nada más. Las otras quince **no se
// escriben**: un `switch` con quince ramas que no se ejecutan nunca es
// exactamente el sitio donde este proyecto ha metido seis reglas muertas
// (CLAUDE.md §4). Lo que sí se hace es NO TRAGARSE el caso: `mezcla` devuelve
// `fxSinPortar` cuando le llega un `renderfx` que no es 0, para que quien lo
// reciba lo cuente en vez de dibujarlo como si tal cosa. El día que un mapa
// traiga un farol que palpita, el contador lo dirá.
//
// Las ramas que faltan, por si hay que volver, y lo que necesitan:
//
// | ramas | qué piden |
// | --- | --- |
// | `PulseSlow/Fast(Wide)` ×4 | el reloj y `e->index * 363` para desfasarlas |
// | `FadeSlow/Fast`, `SolidSlow/Fast` ×4 | **escriben en `renderamt`** cada
//   fotograma: tienen estado, no son una función |
// | `StrobeSlow/Fast/Faster`, `FlickerSlow/Fast` ×5 | el reloj |
// | `Hologram`, `Distort` ×2 | la posición de la cámara y un aleatorio |
//
// ── EL MODO, Y LO QUE NO ES ─────────────────────────────────────────────────
//
// Los seis modos son `common/const.h:687-694`. Para un modelo de estudio el
// reparto lo hace `GL_StudioSetRenderMode` (ref/gl/gl_studio.c:2994-3019), y
// trae un detalle que no es el que se supone: el 4 —`kRenderTransAlpha`— **no
// cae en su propio `case`**, cae en el `default`, que es mezcla alfa de verdad
// con `pglDepthMask( GL_TRUE )`. O sea que un adorno a medio alfa escribe
// profundidad, que es lo contrario de lo que se hace normalmente con
// transparencias. Queda dicho y no se disimula.

/** `common/const.h:687-694`. */
export const MODO = {
  NORMAL: 0,    // kRenderNormal        src
  COLOR: 1,     // kRenderTransColor    c*a+dest*(1-a)
  TEXTURA: 2,   // kRenderTransTexture  src*a+dest*(1-a)
  BRILLO: 3,    // kRenderGlow          src*a+dest, sin prueba de Z
  ALFA: 4,      // kRenderTransAlpha    src*srca+dest*(1-srca)
  ADITIVO: 5,   // kRenderTransAdd      src*a+dest
};

/** `#define R_ModelOpaque( rm ) ( rm == kRenderNormal )`, ref/gl/gl_local.h:87. */
export function esOpaco(modo) {
  return (Number(modo) || 0) === MODO.NORMAL;
}

/**
 * `CL_FxBlend`, la rama que este juego ejecuta.
 *
 * Devuelve `{ mezcla, fxSinPortar }`. El segundo no es un error: es el aviso de
 * que el valor es el de reposo y no el que calcularía el motor.
 */
export function mezcla({ fx = 0, cantidad = 255 } = {}) {
  const f = Number(fx) || 0;
  const amt = Number(cantidad);
  // `blend = bound( 0, blend, 255 )`. Un `renderamt` ausente es 255 y no 0: el
  // valor de fábrica de `entvars_t` es 0, pero el extractor ya pone el 255 del
  // mapeador — y confundir los dos esconde adornos que el motor dibuja.
  const v = Math.max(0, Math.min(255, Number.isFinite(amt) ? amt : 255));
  return { mezcla: v, fxSinPortar: f !== 0 ? f : null };
}

/**
 * `R_AddEntity`: ¿entra en la lista de dibujo?
 *
 * `efectos` es `pev->effects`, por el `EF_NODRAW` de la línea de arriba: lo pone
 * un objeto soltado sin modelo del mundo (el 75), así que el mismo portero
 * sirve para los dos.
 */
export function seDibuja({ modo = 0, cantidad = 255, fx = 0, efectos = 0 } = {}) {
  if ((Number(efectos) || 0) & EF_NODRAW) return false;    // gl_rmain.c:249
  if (esOpaco(modo)) return true;                          // gl_local.h:87
  return mezcla({ fx, cantidad }).mezcla > 0;              // gl_rmain.c:252
}

/** `EF_NODRAW`, `common/const.h`. */
export const EF_NODRAW = 128;

/**
 * El alfa con el que se dibuja, de 0 a 1, para quien ya sabe que se dibuja.
 *
 * Con modo 0 es 1 y el `renderamt` no se mira — ésa es la mitad de la regla que
 * se olvida.
 */
export function alfa({ modo = 0, cantidad = 255, fx = 0 } = {}) {
  if (esOpaco(modo)) return 1;
  return mezcla({ fx, cantidad }).mezcla / 255;
}

/**
 * `CRenderFxManager::Use`, triggers.cpp:535-557: las cuatro banderas tapan cada
 * una un campo, y lo que no está tapado se copia a la víctima.
 *
 * Esto es la mitad de `env_render` que vive en el bus (`disparadores.js`); aquí
 * está sólo la parte de APLICARLO a un estado, que es lo que hace quien dibuja.
 * Un campo a `null` significa «ésta no se toca», no «ponla a cero».
 */
export function aplicar(estado, como = {}) {
  const r = { ...estado };
  if (como.modo !== null && como.modo !== undefined) r.modo = Number(como.modo) || 0;
  if (como.cantidad !== null && como.cantidad !== undefined) r.cantidad = Number(como.cantidad) || 0;
  if (como.fx !== null && como.fx !== undefined) r.fx = Number(como.fx) || 0;
  if (como.color !== null && como.color !== undefined) r.color = como.color;
  return r;
}
