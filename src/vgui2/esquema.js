// EL ESQUEMA DE VGUI2: de dónde saca una ventana de Valve su letra, sus colores
// y sus bordes.
//
// Lo hornea `npm run vgui2` a `build/gatecity/vgui2.json` desde el
// `resource/TrackerScheme.res` del mod. Aquí se consume.
//
// ── Por qué esto no está en `src/vgui/` ────────────────────────────────────
//
// Porque son dos sistemas distintos que salen a la vez en la misma pantalla. El
// 29 portó VGUI1 —los paneles del mod, letra Sitka, `*_textscheme.txt`—. Esto es
// VGUI2 —las ventanas de Valve: «Options», «Servers», «Create Server»—, con otra
// letra, otros colores y otro modelo de borde. Mezclarlos haría que un panel
// heredara el color del otro, que es exactamente el defecto que el 29 arregló en
// su propio terreno.
//
// ── El alfa va al DERECHO, y en el otro al revés ───────────────────────────
//
// En VGUI1 el cuarto número es la transparencia y 255 es invisible, por eso
// existe `deVgui()` en `src/juego/paleta.js`. En VGUI2 es el alfa normal: 255 es
// opaco. Está razonado en `tools/vgui2.mjs` y hay una prueba que lo fija, porque
// es el error que se comete al tener los dos a la vez.
//
// ── Sin el archivo esto tiene que funcionar igual ──────────────────────────
//
// Misma regla que el HUD, el menú y el esquema del 29: **un `.json` que falta no
// puede dejar al jugador sin interfaz.** Abajo está escrito lo justo para que
// las ventanas se vean y se puedan usar, con los valores del propio
// `TrackerScheme.res`, y lo que hace la ficha es completarlo, no habilitarlo.

/**
 * Lo mínimo para que una ventana se dibuje sin la ficha. No es un esquema
 * inventado: son los valores del archivo, copiados a mano.
 *                                     TrackerScheme.res:20-70, 186-240, 353-420
 */
export const POR_DEFECTO = {
  colores: {
    BaseText: [196, 220, 255, 220],
    BrightBaseText: [225, 225, 255, 255],
    SelectedText: [255, 255, 255, 255],
    DimBaseText: [196, 220, 255, 200],
    ControlText: [196, 220, 255, 200],
    BrightControlText: [225, 225, 255, 255],
    DisabledText1: [236, 236, 236, 155],
    DisabledText2: [148, 148, 148, 155],
    ControlBG: [0, 0, 0, 128],
    ControlDarkBG: [0, 0, 0, 128],
    WindowBG: [0, 0, 0, 150],
    SelectionBG: [26, 78, 137, 255],
    ListBG: [0, 0, 0, 200],
    TitleText: [255, 255, 255, 255],
    TitleDimText: [125, 125, 125, 255],
    TitleBG: [206, 206, 206, 0],
    BorderBright: [236, 236, 236, 255],
    BorderDark: [112, 112, 112, 255],
    BorderSelection: [0, 0, 0, 255],
    SliderTickColor: [206, 206, 206, 255],
    SliderTrackColor: [56, 56, 56, 255],
  },
  base: {},
  fuentes: {
    Default: [{ nombre: "Verdana Bold", alto: 13, grosor: 100 }],
    DefaultSmall: [{ nombre: "Tahoma", alto: 13, grosor: 0 }],
    DefaultVerySmall: [{ nombre: "Tahoma", alto: 12, grosor: 0 }],
  },
  bordes: {
    // El bisel de toda la interfaz de Windows de 1998: claro arriba-izquierda
    // para lo que sale, claro abajo-derecha para lo que está hundido.
    RaisedBorder: {
      inset: [0, 0, 1, 1],
      lados: {
        Left: [{ color: "BorderBright", offset: [0, 1], grosor: 1 }],
        Top: [{ color: "BorderBright", offset: [0, 1], grosor: 1 }],
        Right: [{ color: "BorderDark", offset: [0, 0], grosor: 1 }],
        Bottom: [{ color: "BorderDark", offset: [0, 0], grosor: 1 }],
      },
    },
    InsetBorder: {
      inset: [0, 0, 1, 1],
      lados: {
        Left: [{ color: "BorderDark", offset: [0, 1], grosor: 1 }],
        Top: [{ color: "BorderDark", offset: [0, 0], grosor: 1 }],
        Right: [{ color: "BorderBright", offset: [1, 0], grosor: 1 }],
        Bottom: [{ color: "BorderBright", offset: [0, 0], grosor: 1 }],
      },
    },
  },
  alias: {
    BaseBorder: "InsetBorder", ComboBoxBorder: "InsetBorder",
    BrowserBorder: "InsetBorder", ButtonBorder: "RaisedBorder",
    FrameBorder: "RaisedBorder", TabBorder: "RaisedBorder",
    MenuBorder: "RaisedBorder",
  },
  cadenas: {},
};

/** `[196,220,255,220]` → `rgba(196,220,255,0.863)`. El alfa va al derecho. */
export function css(color) {
  if (!Array.isArray(color)) return "transparent";
  const [r, g, b, a = 255] = color;
  return `rgba(${r},${g},${b},${(a / 255).toFixed(3)})`;
}

/**
 * Qué letra toca para una altura de pantalla.
 *
 * El propio archivo dice la regla, y son dos cosas distintas en el mismo sitio:
 *
 *     // fonts are used in order that they are listed
 *     // fonts listed later will only be used if they fulfill a range not
 *     //   already filled
 *     // if a font fails to load then the subsequent fonts will replace
 *                                     TrackerScheme.res:186-189
 *
 * 1. **El RANGO** (`yres "600 767"`) elige el TAMAÑO. `EngineFont` tiene cinco
 *    variantes por altura de pantalla: 12 px hasta 599, 13 hasta 767, 14 hasta
 *    1023, 20 hasta 1199 y 24 de ahí arriba. Es el mismo mecanismo que el
 *    `g_ResArray` de VGUI1 (`vgui_schememanager.cpp:108-128`), pero por rangos
 *    escritos en el archivo en vez de escalones escritos en el código.
 *
 * 2. **El ORDEN** es la CADENA DE REPUESTO, para cuando la letra no está
 *    instalada. Eso en un navegador se llama `font-family` con comas y lo hace
 *    solo: la lista de CSS es literalmente la misma regla.
 *
 * Las variantes sin `yres` valen para cualquier altura, y por eso son las de
 * repuesto: `EngineFont` acaba en Verdana y Arial sin rango.
 */
export function fuenteDe(ficha, nombre, altoPantalla = 480) {
  const lista = ficha?.fuentes?.[nombre] ?? POR_DEFECTO.fuentes[nombre] ?? POR_DEFECTO.fuentes.Default;
  if (!lista?.length) return { alto: 13, css: "13px sans-serif" };

  // El tamaño lo manda la primera variante cuyo rango incluya esta altura. Si
  // ninguna lo hace, la primera sin rango; y si tampoco, la primera de todas.
  const porRango = lista.find((f) => f.yres && altoPantalla >= f.yres[0] && altoPantalla <= f.yres[1]);
  const sinRango = lista.find((f) => !f.yres);
  const elegida = porRango ?? sinRango ?? lista[0];

  // La cadena de repuesto son TODAS en su orden, no sólo la elegida: es lo que
  // dice «if a font fails to load then the subsequent fonts will replace».
  const familias = [];
  for (const f of lista) {
    const limpio = quitarEstilo(f.nombre);
    if (limpio && !familias.includes(limpio)) familias.push(limpio);
  }
  familias.push("sans-serif");

  // «Verdana Bold» no es una familia: es Verdana con `weight` en negrita. Si se
  // pide tal cual, el navegador no la encuentra y cae al repuesto, que es cómo
  // se pierde la letra del juego sin que nadie vea un error.
  const negrita = /\bBold\b/i.test(elegida.nombre) || elegida.grosor >= 600;
  const cursiva = /\bItalic\b/i.test(elegida.nombre);
  const partes = [];
  if (cursiva) partes.push("italic");
  partes.push(negrita ? "700" : "400");
  partes.push(`${elegida.alto}px`);
  partes.push(familias.map((f) => (f.includes(" ") ? `'${f}'` : f)).join(", "));

  return {
    alto: elegida.alto,
    negrita, cursiva,
    sombra: !!elegida.sombra,
    subrayada: !!elegida.subrayada,
    css: partes.join(" "),
  };
}

/** `"Verdana Bold"` → `"Verdana"`, `"Times New Roman Italic"` → `"Times New Roman"`. */
function quitarEstilo(nombre) {
  return String(nombre ?? "").replace(/\s+(Bold|Italic|Bold Italic)$/i, "").trim();
}

/**
 * Un borde por su nombre, siguiendo los alias.
 *
 * `ButtonBorder` no es un borde: es otro nombre de `RaisedBorder`. El esquema
 * los declara así a propósito, para poder cambiar el aspecto de todos los
 * botones tocando una línea (`TrackerScheme.res:353-359`).
 */
export function bordeDe(ficha, nombre) {
  const bordes = ficha?.bordes ?? POR_DEFECTO.bordes;
  const alias = ficha?.alias ?? POR_DEFECTO.alias;
  let n = nombre;
  // Se sigue la cadena de alias con tope, por si el archivo se muerde la cola.
  for (let i = 0; i < 8 && !bordes[n] && alias[n]; i++) n = alias[n];
  return bordes[n] ?? POR_DEFECTO.bordes[n] ?? null;
}

/**
 * Un borde, en CSS.
 *
 * El modelo de VGUI2 es el de Windows: cuatro lados, cada uno una lista de
 * trazos con color y grosor. Se dibuja con `box-shadow: inset`, que es lo único
 * que pinta cuatro líneas de colores distintos por dentro del mismo caja sin
 * meterse en el tamaño —`border` cambiaría la caja y descolocaría el contenido
 * medido de las capturas—.
 *
 * **El `offset` no se usa para dibujar**, y se dice aquí en vez de callarlo: en
 * el motor decide dónde empieza el trazo a lo largo del lado, y sirve para que
 * las esquinas no se pisen. Con `box-shadow` las esquinas ya no se pisan, así
 * que el número está en la ficha y no se aplica. Si algún día un borde se ve
 * mal en una esquina, éste es el sitio.
 */
export function bordeCss(ficha, nombre, { sin = [] } = {}) {
  const b = bordeDe(ficha, nombre);
  if (!b) return "none";
  const colores = ficha?.colores ?? POR_DEFECTO.colores;
  const color = (n) => css(colores[n] ?? POR_DEFECTO.colores[n] ?? [0, 0, 0, 255]);
  const sombras = [];
  const ejes = {
    Left: (g) => `inset ${g}px 0 0`,
    Right: (g) => `inset -${g}px 0 0`,
    Top: (g) => `inset 0 ${g}px 0`,
    Bottom: (g) => `inset 0 -${g}px 0`,
  };
  for (const [lado, hacer] of Object.entries(ejes)) {
    // `sin` quita un lado. Lo pide la pestaña elegida, que en el juego NO lleva
    // raya abajo: se funde con la hoja y por eso el conjunto se lee como
    // carpetas y no como una fila de botones. Es la diferencia visible entre la
    // activa y las demás, porque el esquema les da a las dos el mismo fondo.
    if (sin.includes(lado)) continue;
    for (const linea of b.lados?.[lado] ?? []) {
      sombras.push(`${hacer(linea.grosor || 1)} ${color(linea.color)}`);
    }
  }
  return sombras.length ? sombras.join(", ") : "none";
}

/** Un color del esquema por su nombre, ya en CSS. */
export function colorDe(ficha, nombre, porSiFalta = [0, 0, 0, 255]) {
  const c = ficha?.colores?.[nombre] ?? POR_DEFECTO.colores[nombre] ?? porSiFalta;
  return css(c);
}

/**
 * Una cadena de la interfaz por su clave.
 *
 * Las etiquetas del juego son `#GameUI_*` y se resuelven contra
 * `gameui_english.txt`. Una clave que no está se devuelve tal cual, que es lo
 * que hace el motor: en la pantalla sale `#GameUI_LoQueSea` y se ve el fallo.
 * Y lo que no empieza por `#` ya es texto: `gamemenu.res` mezcla las dos cosas
 * («Visit a Kingdom» está escrito a pelo y «Quit» es una clave).
 */
export function texto(ficha, clave) {
  if (typeof clave !== "string") return "";
  if (!clave.startsWith("#")) return clave;
  return ficha?.cadenas?.[clave] ?? clave;
}
