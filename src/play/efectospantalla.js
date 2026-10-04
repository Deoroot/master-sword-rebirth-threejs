// LO QUE UN EFECTO LE HACE A LA PANTALLA — experimento 93, pieza B.
//
// Tres comandos de guion que no tocan la vida ni el mundo y son, para quien
// juega, lo único que dice que algo le está pasando: el veneno pone un icono
// verde arriba a la izquierda con su barra de tiempo, tiñe la pantalla de
// verde un instante cada vez que muerde, y hace brillar al envenenado.
//
//     effect glow ent_me (75,215,0) 72 EFFECT_DURATION EFFECT_DURATION
//     hud.addstatusicon ent_me hud/status/alpha_dot_poison EFFECT_ID EFFECT_DURATION
//     effect screenfade ent_me 0.2 0 (75,215,0) 30 fadein
//                                         effects/dot_poison.script, `dot_start` y `dot_effect`
//
// Hasta el 93 los tres caían en el `default` del intérprete y se apuntaban como
// comandos que no se saben hacer (medido: `noSoportados` del guion del efecto
// trae `effect` y `hud.addstatusicon`). No era un `=> {}` callado; era un
// hueco declarado. Aquí está la REGLA, sin DOM ni Three, para que Node la
// pruebe: qué lee el servidor de la línea, qué viaja por el cable y qué hace
// el cliente con lo que le llega. El dibujo está en `src/juego/mensajes.js`.
//
// ── Quién ve qué, que es lo que decide la red ──────────────────────────────
//
//   fundido  `UTIL_ScreenFade` → `MESSAGE_BEGIN(MSG_ONE, gmsgFade, …)`
//            (hl/util.cpp:1146-1161): sólo el jugador al que se le aplica.
//   icono    `MESSAGE_BEGIN(MSG_ONE, g_netmsg[NETMSG_STATUSICONS], …)`
//            (scriptcmds.cpp:3727-3734): sólo él, o todos con `all`.
//   brillo   **NO es un mensaje**: `CEntGlow::SetGlow` le pone
//            `renderfx = kRenderFxGlowShell` a la ENTIDAD (mseffects.cpp:318-
//            344), y eso viaja en el estado de la entidad a todos los que la
//            tienen delante. O sea al revés que los otros dos: **el envenenado
//            no ve su propio brillo** —en primera persona no se dibuja su
//            modelo, y el arma no lo hereda: la línea que se lo copiaría al
//            arma está dentro de un `#if 0` (xash3d-fwgs engine/client/
//            cl_parse.c:323-331)— **y los demás sí**. Este puerto no dibuja el
//            brillo en el modelo de los otros jugadores todavía: se lee, se
//            cuenta y se dice pendiente (doc/EFECTOS_RED_93.md).
//            EL 95: ya se dibuja. Viaja en la foto del jugador y lo pinta
//            `src/render/otros.js`; la regla está en `src/play/brillo.js`
//            (doc/BRILLO_95.md).
//
// ── El fundido sí tiene cita entera, y contradice al 41 ─────────────────────
//
// `src/play/muerte.js` dice que la curva del fundido «no está en el SDK» porque
// la pinta el motor. **El motor está al lado**: `../MSC/xash3d-fwgs-sdk/engine/`.
// `CL_ParseScreenFade` (cl_parse.c:2067-2111) y `V_FadeAlpha` (cl_game.c:
// 472-503) son la curva, y no es la que escribió el 41: el AGUANTE va
// **antes** del desvanecido, no después. Con los números de la muerte
// —0,2 de duración y 15 de aguante— son quince segundos de rojo a medias y
// luego dos décimas de bajada, no «un fogonazo». Aquí se porta la del motor;
// la de `muerte.js` no se toca (no es de esta pieza) y queda dicho en el doc.
//
// EL 94: ya se tocó. `muerte.js` construye su mensaje con `UTIL_ScreenFadeBuild`
// y lo pasa por estas dos funciones; el velo de la muerte, el de reaparecer y el
// tinte de cada golpe entran por el mismo `clgame.fade` (doc/VELO_94.md).

/** `public/engine/shake.h:40-43` y `engine/shake.h:39` (el LONGFADE de CZero). */
export const FFADE = Object.freeze({ IN: 0x0000, OUT: 0x0001, MODULATE: 0x0002, STAYOUT: 0x0004, LONGFADE: 0x0008 });

/** `atof`: lo que C lee de una cadena, o 0. */
const atof = (s) => {
  const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(String(s ?? "").trim());
  return m ? parseFloat(m[0]) : 0;
};
/** `atoi`. */
const atoi = (s) => {
  const m = /^[+-]?\d+/.exec(String(s ?? "").trim());
  return m ? parseInt(m[0], 10) : 0;
};

/**
 * `StringToVec` — sharedutil.cpp:115-124: `(%f,%f,%f)` y, si no, `(%f,%f)`; lo
 * demás es cero. Es la misma regla que `vectorDeTexto` de `guion.js`, copiada
 * en pequeño para que este módulo no dependa del intérprete; los colores de
 * los efectos son siempre tres enteros entre paréntesis.
 */
export function vectorDelMotor(texto) {
  const s = String(texto ?? "");
  const leer = (k) => {
    const v = [];
    if (s[0] !== "(") return v;
    let i = 1;
    for (let n = 0; n < k; n++) {
      while (i < s.length && /\s/.test(s[i])) i++;
      const m = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(s.slice(i));
      if (!m) break;
      v.push(Math.fround(parseFloat(m[0])));
      i += m[0].length;
      if (n < k - 1) { if (s[i] !== ",") break; i++; }
    }
    return v;
  };
  const tres = leer(3);
  if (tres.length >= 3) return tres;
  const dos = leer(2);
  if (dos.length >= 2) return [dos[0], dos[1], 0];
  return [0, 0, 0];
}

/** `WRITE_BYTE` de un `int`: se queda el byte bajo. */
const byte = (n) => (Math.trunc(n) & 0xff);

/**
 * `FixedUnsigned16` — hl/util.cpp:1033-1044. Un 4.12 sin signo: segundos por
 * 4096, truncado y topado a 0xFFFF. Por eso un fundido de MÁS de 16 segundos
 * dura 16 (65535/4096 = 15,9998): el `LONGFADE` que lo arreglaría es de CZero y
 * Master Sword no lo pone nunca.
 */
export function fijo16(valor, escala = 1 << 12) {
  let o = Math.trunc(Number(valor) * escala);
  if (!(o > 0)) o = 0;
  if (o > 0xffff) o = 0xffff;
  return o;
}

// ── LO QUE LEE EL SERVIDOR DE LA LÍNEA ─────────────────────────────────────

/**
 * `effect screenfade <objetivo|all> <duración> <aguante> <(r,g,b)> <alfa> <banderas>`
 * — mseffects.cpp:877-904, y `UTIL_ScreenFadeBuild` (hl/util.cpp:1135-1144).
 *
 * Devuelve `{ aQuien, todos, mensaje }`, donde `mensaje` es lo que lleva el
 * cable: los siete campos de `gmsgFade` en el orden de `UTIL_ScreenFadeWrite`
 * (hl/util.cpp:1146-1161), ya convertidos como los convierte el servidor.
 *
 * Rarezas que se portan porque deciden lo que se ve:
 *   - **no hay `REQPARAMS`**: el motor lee `Params[6]` aunque no exista. Aquí
 *     un parámetro que falta vale «», que no casa ninguna bandera;
 *   - las banderas se buscan con **contiene** (`find`), así que «fadeinout»
 *     son dos, y `FFADE_IN` es 0: «fadein» no añade nada;
 *   - `noblend` es `FFADE_MODULATE` (multiplicar), no «sin mezcla»;
 *   - el alfa pasa por `atoi` y luego por `WRITE_BYTE`: 256 es 0.
 */
export function leerFundido(params) {
  const p = (i) => String(params?.[i] ?? "");
  const todos = p(1) === "all";
  const color = vectorDelMotor(p(4));
  let banderas = FFADE.IN;
  const b = p(6);
  if (b.includes("fadein")) banderas |= FFADE.IN;
  if (b.includes("fadeout")) banderas |= FFADE.OUT;
  if (b.includes("noblend")) banderas |= FFADE.MODULATE;
  if (b.includes("perm")) banderas |= FFADE.STAYOUT;
  return {
    aQuien: todos ? "all" : p(1),
    todos,
    mensaje: {
      duracion: fijo16(atof(p(2))),
      aguante: fijo16(atof(p(3))),
      banderas,
      r: byte(color[0]), g: byte(color[1]), b: byte(color[2]),
      a: byte(atoi(p(5))),
    },
  };
}

/**
 * `effect glow <objetivo> <(r,g,b)> <cantidad> <duración> <desvanecido>` —
 * mseffects.cpp:906-926, con `REQPARAMS(6)` (:454-459): con menos de seis se
 * avisa y no se hace nada, y entonces devuelve `null`.
 *
 * Una duración negativa es «brilla para siempre» (`SUB_Remove` del
 * controlador, :925) y se deja tal cual.
 */
export function leerBrillo(params) {
  if (!params || params.length < 6) return null;
  const p = (i) => String(params[i] ?? "");
  return {
    aQuien: p(1),
    color: vectorDelMotor(p(2)),
    cantidad: Math.fround(atof(p(3))),
    duracion: Math.fround(atof(p(4))),
    desvanecido: Math.fround(atof(p(5))),
  };
}

/**
 * La cantidad del brillo `t` segundos después de ponerlo: `CEntGlow::Think`,
 * mseffects.cpp:361-389. Entera hasta `inicio + duración - desvanecido` y de
 * ahí baja en línea recta a cero. A los `duración` segundos se quita
 * (`renderfx = kRenderFxNone`), y también si el objetivo muere (MiB DEC2007a).
 * Devuelve `null` cuando ya no hay brillo.
 */
export function cantidadDelBrillo(b, t, { vivo = true } = {}) {
  if (!b) return null;
  if (b.duracion >= 0 && (t >= b.duracion || !vivo)) return null;
  const empieza = b.duracion - b.desvanecido;
  if (b.duracion < 0 || t < empieza) return b.cantidad;
  let f = (t - empieza) / b.desvanecido;
  if (!(f >= 0)) f = 0;
  if (f > 1) f = 1;
  return b.cantidad * (1 - f);
}

/** Los tipos del primer `WRITE_SHORT` de `NETMSG_STATUSICONS`: `HUD_IDS`, ui/vgui_status.h:20-29. */
export const ICONO = Object.freeze({ QUITA_IMG: -2, QUITA_ESTADO: -1, QUITA_TODO: 0, PON_ESTADO: 1, PON_IMG: 2 });

/** `WRITE_STRING_LIMIT(…, 85)` del icono y del nombre (scriptcmds.cpp:3730-3731). */
const LIMITE = 85;
/** EL 95. `WRITE_STRING_LIMIT(…, 80)` de la imagen y su nombre (scriptcmds.cpp:3778-3779). */
const LIMITE_IMG = 80;
/** `WRITE_SHORT` de un `int`: los 16 bits bajos, con signo al leerlos (`READ_SHORT`). */
const corto = (n) => ((Math.trunc(n) & 0xffff) << 16) >> 16;

/**
 * `hud.addstatusicon`, `hud.killstatusicon` y `hud.killicons` —
 * `ScriptCmd_HudIcon`, scriptcmds.cpp:3706-3847. Devuelve
 * `{ aQuien, todos, mensaje }` o `null` si el comando no manda nada.
 *
 *   addstatusicon  `<obj|all> <icono> <nombre> <duración> [isTGA]`, con
 *                  `Params.size() >= 3` (:3713). La duración es
 *                  `atof(Params[3])`, que con tres parámetros lee fuera de la
 *                  lista: aquí «», o sea 0, y un icono de duración 0 se borra
 *                  en el primer `Update` del cliente.
 *   killstatusicon `<obj> [nombre]`: con UN parámetro manda «all» (:3838-3841).
 *                  **No admite `all` como objetivo** —no tiene la rama del
 *                  bucle que sí tienen `addstatusicon` y `killicons`—: un
 *                  `RetrieveEntity("all")` no encuentra a nadie.
 *   killicons      `<obj|all>`: tipo 0, borra iconos e imágenes.
 *
 * LECTURA VIEJA (93): «`hud.addimgicon` y `hud.killimgicon` no se portan:
 * ningún efecto los usa». EL 95 los porta (abajo): ningún EFECTO los usa, pero
 * el guion del jugador sí —`ext_hud_icon`, la epilepsia y el marcador del
 * fútbol, player/externals.script:2667-2913— y `monsters/gabe_newell`.
 *
 *   addimgicon     `<obj> <tga> <nombre> <x%> <y%> <ancho%> <alto%> <duración>`,
 *                  con `Params.size() >= 8` (:3768). **Sin rama `all`**: el
 *                  objetivo pasa por `RetrieveEntity` y, si no es un jugador,
 *                  no se manda nada. Cadenas a 80 (no a 85), las cuatro
 *                  medidas por `atoi` y `WRITE_SHORT` (:3776-3784).
 *   killimgicon    `<obj> [nombre]`: tipo −2, con UN parámetro manda «all»
 *                  (:3865-3869). Tampoco admite `all` de objetivo.
 */
export function leerIcono(nombre, params) {
  const p = (i) => String(params?.[i] ?? "");
  const n = String(nombre);
  if (n === "hud.addimgicon") {
    if (!params || params.length < 8) return null;          // ERROR_MISSING_PARMS
    return {
      aQuien: p(0), todos: false,
      mensaje: {
        tipo: ICONO.PON_IMG,
        icono: p(1).slice(0, LIMITE_IMG),
        nombre: p(2).slice(0, LIMITE_IMG),
        x: corto(atoi(p(3))), y: corto(atoi(p(4))),
        ancho: corto(atoi(p(5))), alto: corto(atoi(p(6))),
        duracion: Math.fround(atof(p(7))),                   // WRITE_FLOAT
      },
    };
  }
  if (n === "hud.killimgicon") {
    if (!params || params.length < 1) return null;
    return {
      aQuien: p(0), todos: false,
      mensaje: { tipo: ICONO.QUITA_IMG, nombre: params.length === 1 ? "all" : p(1) },
    };
  }
  if (n === "hud.addstatusicon") {
    if (!params || params.length < 3) return null;          // ERROR_MISSING_PARMS
    const todos = p(0) === "all";
    return {
      aQuien: p(0), todos,
      mensaje: {
        tipo: ICONO.PON_ESTADO,
        icono: p(1).slice(0, LIMITE),
        nombre: p(2).slice(0, LIMITE),
        duracion: Math.fround(atof(p(3))),                   // WRITE_FLOAT
        tga: params.length >= 5 ? p(4) === "1" : false,
      },
    };
  }
  if (n === "hud.killstatusicon") {
    if (!params || params.length < 1) return null;
    return {
      aQuien: p(0), todos: false,
      mensaje: { tipo: ICONO.QUITA_ESTADO, nombre: params.length === 1 ? "all" : p(1) },
    };
  }
  if (n === "hud.killicons") {
    if (!params || params.length < 1) return null;
    const todos = p(0) === "all";
    return { aQuien: p(0), todos, mensaje: { tipo: ICONO.QUITA_TODO } };
  }
  return null;
}

// ── LO QUE HACE EL CLIENTE CON LO QUE LE LLEGA ─────────────────────────────

/**
 * `CL_ParseScreenFade` — xash3d-fwgs engine/client/cl_parse.c:2067-2111.
 * Convierte el mensaje en el `screenfade_t` (common/screenfade.h:14-22) con
 * los tiempos ya ABSOLUTOS en el reloj del cliente, `ahora`.
 *
 * **Uno solo**: el motor tiene un `clgame.fade` y cada mensaje lo pisa.
 */
export function fundidoAlLlegar(m, ahora) {
  const escala = (m.banderas & FFADE.LONGFADE) ? 1 / 256 : 1 / 4096;
  const sf = {
    fadeFlags: m.banderas | 0,
    fader: byte(m.r), fadeg: byte(m.g), fadeb: byte(m.b), fadealpha: byte(m.a),
    fadeSpeed: 0,
    fadeEnd: m.duracion * escala,
    fadeReset: m.aguante * escala,
    fadeTotalEnd: 0,
  };
  if (m.duracion > 0) {
    if (sf.fadeFlags & FFADE.OUT) {
      if (sf.fadeEnd) sf.fadeSpeed = -sf.fadealpha / sf.fadeEnd;
      sf.fadeEnd += ahora;
      sf.fadeTotalEnd = sf.fadeEnd;
      sf.fadeReset += sf.fadeEnd;
    } else {
      if (sf.fadeEnd) sf.fadeSpeed = sf.fadealpha / sf.fadeEnd;
      sf.fadeReset += ahora;
      sf.fadeEnd += sf.fadeReset;
    }
  }
  // Con duración 0 el motor no suma `cl.time` a nada: `fadeEnd` y `fadeReset`
  // se quedan en tiempos del pasado y el fundido no se ve nunca (salvo
  // `STAYOUT`). Se porta así.
  return sf;
}

/**
 * `V_FadeAlpha` — cl_game.c:472-503. El alfa (0-255) en el instante `ahora`.
 *
 * `alpha` es un `int` en el motor: cada asignación desde un `float` TRUNCA.
 * Y con `STAYOUT` la función **escribe** en el struct (`fadeEnd = cl.time +
 * 0.1`, :491) — se porta escribiendo, porque es lo que hace que un fundido
 * permanente no caduque nunca.
 */
export function alfaDelFundido(sf, ahora) {
  if (!sf) return 0;
  if (ahora > sf.fadeReset && ahora > sf.fadeEnd) {
    if (!(sf.fadeFlags & FFADE.STAYOUT)) return 0;
  }
  let alpha;
  if (sf.fadeFlags & FFADE.STAYOUT) {
    alpha = sf.fadealpha;
    if ((sf.fadeFlags & FFADE.OUT) && sf.fadeTotalEnd > ahora) {
      alpha = Math.trunc(alpha + sf.fadeSpeed * (sf.fadeTotalEnd - ahora));
    } else {
      sf.fadeEnd = ahora + 0.1;
    }
  } else {
    alpha = Math.trunc(sf.fadeSpeed * (sf.fadeEnd - ahora));
    if (sf.fadeFlags & FFADE.OUT) alpha += sf.fadealpha;
  }
  return Math.max(0, Math.min(sf.fadealpha, alpha));
}

/**
 * Cómo se pinta: `CL_DrawScreenFade`, cl_game.c:515-548.
 *
 *   normal    el color encima con su alfa (`kRenderTransTexture`);
 *   MODULATE  la pantalla MULTIPLICADA por `(c·α + (255−α)·255) >> 8`, opaco.
 *
 * Devuelve `{ modo: "mezcla"|"multiplica", rgba: [r,g,b,a 0..1] }` o `null`
 * si el alfa es 0 (`if (!alpha) return`).
 */
export function pinturaDelFundido(sf, alfa) {
  if (!sf || !alfa) return null;
  if (!(sf.fadeFlags & FFADE.MODULATE)) {
    return { modo: "mezcla", rgba: [sf.fader, sf.fadeg, sf.fadeb, alfa / 255] };
  }
  const k = (c) => ((c * alfa + (255 - alfa) * 255) & 0xffff) >> 8;
  return { modo: "multiplica", rgba: [k(sf.fader), k(sf.fadeg), k(sf.fadeb), 1] };
}

/**
 * EL 95. `CHudScript::Effects_GetFade` — hudscript.cpp:250-282 — y quién la
 * llama: `V_CalcRefdef` (view.cpp:1747-1750), **cada vez que se calcula la
 * vista**:
 *
 *     screenfade_t sf;
 *     gEngfuncs.pfnGetScreenFade(&sf);           // copia de `clgame.fade`
 *     gHUD.m_HUDScript->Effects_GetFade(sf);     // ScreenFade.fadeFlags = 0;  (:253)
 *     gEngfuncs.pfnSetScreenFade(&sf);           // y se escribe de vuelta
 *
 * O sea que Master Sword **borra las banderas del único fundido del motor**
 * antes de mirar si algún guion de cliente quiere uno nuevo. Y no «al
 * fotograma siguiente»: el orden de un fotograma de Xash3D es leer los
 * mensajes (`CL_ReadPackets`, cl_main.c:3658), luego la vista
 * (`SCR_UpdateScreen`, :3686 → `V_RenderView`, cl_view.c:389) y DESPUÉS el
 * dibujo del fundido (`V_PostRender` → `CL_DrawHUD` → `CL_DrawScreenFade`,
 * cl_view.c:517 y cl_game.c:958). **Un fundido no se pinta nunca con sus
 * banderas.** Lo único que sobrevive de ellas es lo que `CL_ParseScreenFade`
 * ya hizo con `FFADE_OUT` al convertir los tiempos (`fundidoAlLlegar`):
 *
 *   fadeout   la velocidad sale NEGATIVA y `fadeEnd` = llegada + duración, pero
 *             se pinta con la fórmula de entrada: `fadeSpeed · (fadeEnd − t)`
 *             es negativo —0— durante toda la duración, y DESPUÉS sube desde 0
 *             con la misma pendiente hasta `fadeReset` (= fadeEnd + aguante).
 *             Un «sube en 2 s y aguanta 0,5» es «nada 2 s y luego sube 0,5 s»;
 *   perm      no se queda: se pinta y se va como uno normal;
 *   noblend   no multiplica: se mezcla con su color, como uno normal.
 *
 * `FFADE_IN` es 0, así que la muerte, el tinte de cada golpe y el veneno no
 * cambian. Es la MISMA línea para los dos caminos: el `gmsgFade` del servidor
 * y lo que pinta un guion de aquí acaban en el mismo `clgame.fade`.
 *
 * No se porta la otra mitad, la que lee `game.cleffect.screenfade.*` de los
 * guiones de CLIENTE (`sfx_drunk`, el único): este puerto no corre guiones de
 * cliente todavía. Tampoco el caso en que `V_RenderView` sale antes de llamar a
 * la vista (`!cl.video_prepped`, o el menú abierto sin `ui_renderworld`,
 * cl_view.c:377-378): ahí el fundido SÍ se pinta con sus banderas.
 */
export function fundidoTrasLaVista(sf) {
  if (sf) sf.fadeFlags = 0;
  return sf;
}

/** `ICON_W`, `ICON_H`, `ICONIMG_W/H` y `DurColor` — ui/vgui_status.h:8-13. */
export const ICONOS = Object.freeze({
  ancho: 64, alto: 75, anchoImagen: 64, altoImagen: 64,
  porColumna: 5, margen: 10,
  /** `COLOR DurColor(0, 255, 0, 128)`: el alfa de VGUI va al revés, 128 es medio transparente. */
  colorDeBarra: [0, 255, 0, 128],
});

/**
 * LOS ICONOS DE ESTADO DEL CLIENTE — `VGUI_Status`, ui/vgui_status.h:181-353,
 * y su `__MsgFunc_StatusIcons` (:356-428).
 *
 * El reloj es el del CLIENTE (`gpGlobals->time` en el cliente): el icono
 * cuenta desde que le llega, no desde que el servidor lo mandó.
 */
export class IconosDeEstado {
  constructor() {
    /** `m_Status`, en orden: la posición en pantalla sale del índice. */
    this.lista = [];
    /** EL 95. `m_Img`: las imágenes de `hud.addimgicon`, con su sitio propio. */
    this.imagenes = [];
  }

  /** Un mensaje de `NETMSG_STATUSICONS`, tal como lo deja `leerIcono`. */
  recibir(m, ahora) {
    switch (m?.tipo) {
      case ICONO.QUITA_ESTADO:
        if (m.nombre === "all") this.lista = [];          // KillAllStatus
        else {
          // KillStatus: el PRIMERO con ese nombre, y para (`break`, :317).
          const i = this.lista.findIndex((x) => x.nombre === m.nombre);
          if (i >= 0) this.lista.splice(i, 1);
        }
        return;
      case ICONO.QUITA_TODO:
        this.lista = [];                                   // KillAll = KillAllStatus
        this.imagenes = [];                                //         + KillAllImgs (:349-353)
        return;
      case ICONO.QUITA_IMG:
        // EL 95. `REMOVE_IMG` (:364-372): «all» las quita todas; si no, KillImg
        // quita la PRIMERA con ese nombre y para (`break`, :329).
        if (m.nombre === "all") this.imagenes = [];
        else {
          const i = this.imagenes.findIndex((x) => x.nombre === m.nombre);
          if (i >= 0) this.imagenes.splice(i, 1);
        }
        return;
      case ICONO.PON_IMG: {
        // EL 95. `ADD_IMG` (:404-417): un nombre «all» no se pone.
        if (m.nombre === "all") return;
        // AddImg (:279-307): con un nombre que ya está **NO HACE NADA** — ni
        // reinicia el reloj, que es lo que sí hace un icono de estado desde
        // MiB FEB2019_22. Así que la epilepsia, que vuelve a poner
        // `bepilepsy2` cada medio segundo con su mismo nombre, sólo lo pone de
        // verdad cuando el anterior ya caducó.
        if (this.imagenes.some((x) => x.nombre === m.nombre)) return;
        this.imagenes.push({
          icono: m.icono, nombre: m.nombre, desde: ahora, duracion: m.duracion,
          x: m.x | 0, y: m.y | 0, ancho: m.ancho | 0, alto: m.alto | 0,
        });
        return;
      }
      case ICONO.PON_ESTADO: {
        // `if (strcmp(Name, "all"))`: un icono llamado «all» no se pone (:400).
        if (m.nombre === "all") return;
        // AddStatus: con el mismo nombre NO se añade otro: se le reinicia el
        // reloj y la duración (MiB FEB2019_22, :263-277). El dibujo NO cambia:
        // un veneno que pisa a un ácido con el mismo nombre se queda con el
        // icono del ácido.
        const ya = this.lista.find((x) => x.nombre === m.nombre);
        if (ya) { ya.desde = ahora; ya.duracion = m.duracion; return; }
        this.lista.push({ icono: m.icono, nombre: m.nombre, desde: ahora, duracion: m.duracion, tga: Boolean(m.tga) });
        return;
      }
      default:
        return;                                           // FN_UP / FN_DW: no portados
    }
  }

  /**
   * EL 95. La parte de `VGUI_Status::Update` que mira las imágenes (:230-244):
   * quita las caducadas y devuelve las demás con su rectángulo en PÍXELES de
   * la pantalla `ancho`×`alto`.
   *
   * Los cuatro números del guion son PORCENTAJES de la pantalla y se
   * truncan a `int` (Thothie JAN2010_29, `AddImg`, :293-302). La imagen se
   * ESTIRA al rectángulo, sin guardar la proporción: `VGUI_Image3D::
   * paintBackground` le da al cuadro el ancho y el alto del panel
   * (render/clrender.cpp:650-651).
   *
   * `IsActive` (:162-165): **sólo −1 exacto** es «para siempre»; cualquier
   * otra duración negativa caduca en el primer `Update`.
   */
  pasoDeImagenes(ahora, ancho, alto) {
    this.imagenes = this.imagenes.filter((x) => x.duracion === -1 || ahora < x.desde + x.duracion);
    return this.imagenes.map((x) => ({
      icono: x.icono, nombre: x.nombre,
      x: Math.trunc(ancho * (x.x * 0.01)), y: Math.trunc(alto * (x.y * 0.01)),
      ancho: Math.trunc(ancho * (x.ancho * 0.01)), alto: Math.trunc(alto * (x.alto * 0.01)),
    }));
  }

  /**
   * `VGUI_Status::Update` (:210-228): quita los caducados y coloca los demás.
   * Devuelve lo que hay que dibujar: `{ icono, nombre, x, y, porcentaje,
   * anchoBarra }`, en píxeles de pantalla SIN escalar (el motor no pasa estas
   * posiciones por `XRES`).
   */
  paso(ahora) {
    // `IsActive`: `gpGlobals->time < m_Time + m_Dur` (:85-88).
    this.lista = this.lista.filter((x) => ahora < x.desde + x.duracion);
    return this.lista.map((x, i) => {
      // `flPercent = 1.0 - (time - m_Time) / m_Dur` (:73), y la barra mide
      // `_size[0] * (Percentage * 0.01)` en un `int` (vgui_mscontrols.h:235).
      const porcentaje = (1 - (ahora - x.desde) / x.duracion) * 100;
      return {
        icono: x.icono, nombre: x.nombre,
        x: ICONOS.ancho * Math.trunc(i / ICONOS.porColumna) + ICONOS.margen,
        y: ICONOS.alto * (i % ICONOS.porColumna) + ICONOS.margen,
        porcentaje,
        anchoBarra: Math.trunc(ICONOS.ancho * (porcentaje * 0.01)),
      };
    });
  }
}

/**
 * La ruta horneada de un icono: `hud/status/alpha_dot_poison` es
 * `sprites/hud/status/alpha_dot_poison.spr` (`LoadImg(Icon, bSprite=false)`,
 * vgui_status.h:57) y se hornea a `hud/estado/alpha_dot_poison.png`
 * (`npm run hud`). Sólo el nombre del archivo: lo que no está horneado no se
 * dibuja, y el nodo lo dice.
 */
export function archivoDeIcono(icono) {
  const base = String(icono ?? "").replace(/\\/g, "/").split("/").pop().replace(/\.spr$/i, "");
  return base ? `hud/estado/${base}.png` : null;
}

/**
 * EL 95. La ruta horneada de una imagen de `hud.addimgicon`: el guion da el
 * NOMBRE y el cliente le pone delante `gfx/vgui/` y detrás `.tga`
 * (`VGUI_Image3D::LoadImg`, render/clrender.cpp:595) — «NOTE: USES TGA FILES
 * ONLY!! Path Starts: msc/gfx/vgui/» (scriptcmds.cpp:3763). `npm run hud` las
 * hornea a `hud/imagen/<nombre>.png`.
 */
export function archivoDeImagen(icono) {
  const base = String(icono ?? "").replace(/\\/g, "/").split("/").pop().replace(/\.tga$/i, "");
  return base ? `hud/imagen/${base}.png` : null;
}
