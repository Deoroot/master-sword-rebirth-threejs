// LA PALETA DE MASTER SWORD, sacada del código de su cliente.
//
// ── Por qué no se saca de una captura ─────────────────────────────────────
//
// Porque está escrita. Es la misma regla que trajo `gl_overbright "0"` y
// salvó la iluminación, y la que sacó las teclas del `config.cfg`: **cuando
// exista el original, leerlo.** Un color pipeteado de un PNG lleva dentro la
// compresión, la gamma de la pantalla y el mapa que hubiera detrás.
//
// Los ficheros, y cada constante dice de cuál sale:
//
//     client/ui/ms/vgui_container.cpp        el inventario
//     client/ui/ms/vgui_stats.cpp            la hoja de personaje
//     client/ui/ms/vgui_choosecharacter.cpp  elegir y crear personaje
//
// ── EL ALFA DE VGUI ESTÁ AL REVÉS, y es lo que más confunde ───────────────
//
// `COLOR(r, g, b, a)` de VGUI usa el cuarto valor como **transparencia**, no
// como opacidad: **255 es invisible y 0 es opaco**. No hay que deducirlo —
// los propios nombres lo dicen:
//
//     Color_TransparentTextBG = COLOR(0, 0, 0, 255)
//     TransparentColor        = COLOR(0, 0, 0, 255)
//
// Leerlo como CSS da justo lo contrario: paneles negros macizos donde el
// juego tiene paneles invisibles. Por eso aquí se guarda el alfa **ya dado la
// vuelta**, en la convención de CSS, y se deja dicho.

/** De `COLOR(r,g,b,a)` de VGUI a CSS, invirtiendo el alfa. */
export const deVgui = (r, g, b, a = 0) =>
  a === 0 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${((255 - a) / 255).toFixed(3)})`;

/**
 * Los colores, tal cual están en el código, con su sitio al lado.
 *
 * Se guardan como tripletas y no como cadenas CSS para que sigan pareciéndose
 * a las líneas de las que salen y se puedan comparar de un vistazo.
 */
export const MSR = {
  // --- vgui_container.cpp (el inventario de tu captura) -------------------
  tituloPanel: [255, 100, 100],   // Color_TitleText — el salmón de «Back Sword Sheath»
  subtitulo: [160, 160, 160],     // Color_SubtitleText — la línea de instrucciones
  oro: [255, 255, 0],             // Color_GoldText — «Gold: 10»
  seleccionado: [255, 0, 0],      // Color_GearSelected
  normal: [255, 255, 255],        // Color_GearNormal
  noContenedor: [160, 160, 160],  // Color_GearNonContainer
  apagado: [100, 100, 100],       // Color_TextNormal — «Weight: 10.00»

  // --- vgui_stats.cpp (la hoja) -------------------------------------------
  tituloHoja: [255, 255, 255],    // Color_TitleText
  textoHoja: [190, 190, 190],     // Color_NormalText
  instruccion: [128, 128, 128],   // Color_InstructionText
  bonoBueno: [0, 240, 0],         // el modificador positivo
  bonoMalo: [255, 0, 0],          // y el negativo

  // --- vgui_choosecharacter.cpp -------------------------------------------
  disponible: [0, 255, 0],        // EnabledColor — el verde de «Zeth / At Edana»
  noDisponible: [128, 128, 128],  // DisabledColor
  nuevo: [255, 255, 255],         // NewCharColor
  info: [192, 192, 192],          // InfoColor
  resaltado: [255, 0, 0],         // HightlightColor (sic, así está escrito)

  // --- el fondo -----------------------------------------------------------
  //
  // `setBgColor(0, 0, 0, 255)`, que con el alfa al revés es **negro
  // completamente transparente**: en Master Sword los paneles no tienen
  // fondo, sólo texto flotando sobre el mapa. Ver abajo por qué eso es
  // justamente lo que hay que mejorar.
  fondoOriginal: [0, 0, 0, 255],
};

/**
 * DÓNDE MEJORAMOS, y por qué no es con bordes.
 *
 * La pregunta era cómo hacer que se note que es una mejora sin perder el
 * aspecto del original. Los bordes gruesos harían que pareciera un mod de
 * 2005 **con bordes**. El defecto de verdad se ve en la propia captura del
 * juego: el panel del inventario no tiene fondo —alfa 255— así que
 * «Heavy Weapon Holster» compite con la piedra de la cueva y apenas se lee.
 *
 * Así que la mejora es una y se puede MEDIR: **poner un fondo de verdad**.
 * Mismo negro que declara el juego, con opacidad suficiente para que el
 * contraste del texto no dependa de lo que haya detrás. El color no cambia;
 * cambia que se lea siempre igual.
 *
 * Lo demás es contención: una línea de un píxel en vez de un marco, y la
 * jerarquía de tres niveles que el juego ya tiene (255 / 190 / 128) usada de
 * verdad, en vez de dos tonos de crema.
 */
export const FONDO = "rgba(0, 0, 0, 0.88)";
export const FONDO_VELO = "rgba(0, 0, 0, 0.55)";
export const LINEA = "rgba(255, 100, 100, 0.30)";   // el salmón del título, al 30 %
export const LINEA_TENUE = "rgba(255, 255, 255, 0.12)";

/** El contraste de WCAG entre dos colores, para poder medir la mejora. */
export function contraste(a, b) {
  const lum = ([r, g, b2]) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b2);
  };
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Mezcla un color sobre otro con una opacidad, para simular el fondo. */
export function sobre(color, fondo, opacidad) {
  return color.map((c, i) => Math.round(c * opacidad + fondo[i] * (1 - opacidad)));
}

/** Un color de la paleta como CSS. */
export const css = (clave) => {
  const c = MSR[clave];
  if (!c) throw new Error(`no hay color '${clave}' en la paleta`);
  return c.length === 4 ? deVgui(...c) : `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
};

/**
 * Las variables CSS, para inyectarlas de una vez.
 *
 * Los nombres van en castellano como el resto del proyecto, y el valor lleva
 * al lado de dónde sale para que nadie lo cambie «porque quedaba mejor» sin
 * saber que estaba leído.
 */
export function variablesCss() {
  return [
    `--ms-fondo: ${FONDO};`,
    `--ms-velo: ${FONDO_VELO};`,
    `--ms-linea: ${LINEA};`,
    `--ms-linea-tenue: ${LINEA_TENUE};`,
    `--ms-titulo: ${css("tituloPanel")};`,
    `--ms-subtitulo: ${css("subtitulo")};`,
    `--ms-texto: ${css("textoHoja")};`,
    `--ms-claro: ${css("normal")};`,
    `--ms-apagado: ${css("instruccion")};`,
    `--ms-tenue: ${css("apagado")};`,
    `--ms-oro: ${css("oro")};`,
    `--ms-elegido: ${css("seleccionado")};`,
    `--ms-si: ${css("disponible")};`,
    `--ms-no: ${css("noDisponible")};`,
    `--ms-bueno: ${css("bonoBueno")};`,
    `--ms-malo: ${css("bonoMalo")};`,
  ].join("\n  ");
}
