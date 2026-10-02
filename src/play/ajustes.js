// LOS AJUSTES: qué hay en las siete pestañas de «Options», de dónde sale cada
// valor por defecto y cuáles de ellos hacen algo aquí.
//
// Sin DOM y sin Three, como todo lo de esta carpeta: la tabla es la regla y
// `src/vgui2/opciones.js` sólo la dibuja.
//
// ── Los valores por defecto no son gusto: son el `config.cfg` del juego ────
//
// La misma regla que trajo las teclas (`src/juego/teclas.js:14-20`) y que salvó
// la iluminación con `gl_overbright "0"`: **cuando exista el original, leerlo.**
// Todos los números de aquí salen de `../MSC/assets/msr/config.cfg`, con su
// línea al lado, y se comprueban con una prueba contra el archivo.
//
// El que lo demuestra es la sensibilidad: el `config.cfg` dice `sensitivity
// "10"` y en la captura de la pestaña Mouse pone exactamente `10.0`. No se ha
// adivinado ninguno.
//
// ── Lo que no se puede cumplir se enseña apagado, y dice por qué ───────────
//
// Es lo que ya hace el menú principal con «Visit a Kingdom» y «Quit»
// (`src/juego/menums.js:20-25`): la opción se ve, se puede señalar y explica que
// no. Esconder media ventana daría una imitación más limpia y menos parecida, y
// además escondería el trabajo que falta.
//
// Cada ajuste lleva `porQueNo` cuando no se puede cumplir. Que ese campo esté
// vacío es lo que significa «esto funciona».

/** Los tipos de control, que son los que hay en las capturas. */
export const TIPOS = {
  CASILLA: "casilla",
  DESLIZADOR: "deslizador",
  DESPLEGABLE: "desplegable",
  TEXTO: "texto",
  TECLAS: "teclas",        // la tabla entera de la pestaña Keyboard
  NOTA: "nota",            // texto suelto, como el aviso de Miles en Audio
  BOTON: "boton",
};

/**
 * Las siete pestañas, en el orden de la captura.
 *
 * El orden importa y no es alfabético: «Multiplayer» va primera porque es donde
 * está el nombre del jugador, y «Lock» última porque es el control parental.
 */
export const PESTANAS = ["Multiplayer", "Keyboard", "Mouse", "Audio", "Video", "Voice", "Lock"];

/**
 * Los ajustes.
 *
 *   `cvar`     cómo se llama en el motor. Es la clave de verdad: el `config.cfg`
 *              y la consola lo conocen por este nombre.
 *   `cfg`      la línea del `config.cfg` de la que sale el valor por defecto.
 *   `etiqueta` la clave de `gameui_english.txt`, o el texto si el juego lo
 *              escribe a pelo. Lo resuelve `texto()` de `src/vgui2/esquema.js`.
 *   `porQueNo` vacío si el ajuste hace algo; si no, por qué no puede.
 */
export const AJUSTES = [
  // ── Multiplayer ─────────────────────────────────────────────────────────
  {
    pestana: "Multiplayer", clave: "nombre", cvar: "name", tipo: TIPOS.TEXTO,
    etiqueta: "#GameUI_PlayerName", pordefecto: "Adventurer",
    cfg: 'name "Adventurer"',
    // AQUÍ HABÍA «Player» Y UN COMENTARIO DICIENDO QUE `config.cfg` NO TRAE
    // `name`. Lo trae, en la línea 160, y dice «Adventurer».
    //
    // Y no es una caja decorativa: la pantalla de crear personaje del mod
    // arranca con ella puesta —
    //
    //     Gender_Name = gEngfuncs.pfnGetCvarString("name");
    //                              vgui_choosecharacter.cpp:411
    //     Gender_NameTextPanel->SetText( Gender_Name );            :545
    //     m_NewChar.Name = m_pPanel->Gender_Name;                  :164
    //
    // — o sea que este cuadro es el nombre que te PROPONE el juego cuando creas
    // un personaje, y lo que escribas ahí es lo que sale escrito allí.
  },
  {
    pestana: "Multiplayer", clave: "spray", cvar: "cl_logofile", tipo: TIPOS.DESPLEGABLE,
    etiqueta: "#GameUI_SpraypaintImage", opciones: [], pordefecto: "",
    porQueNo: "there is no spray in this port: nothing paints decals on walls yet.",
  },
  {
    pestana: "Multiplayer", clave: "sprayColor", cvar: "cl_logocolor", tipo: TIPOS.DESPLEGABLE,
    etiqueta: "", opciones: ["Orange"], pordefecto: "Orange", cfg: "cl_logocolor",
    porQueNo: "the colour of a spray that does not exist.",
  },
  {
    pestana: "Multiplayer", clave: "avanzado", tipo: TIPOS.BOTON,
    etiqueta: "#GameUI_AdvancedEllipsis",
    porQueNo: "the advanced dialog sets model, crosshair and download options, none of which this port has.",
  },

  // ── Keyboard ────────────────────────────────────────────────────────────
  //
  // La única pestaña que ya estaba hecha, y la única que se mueve entera: las
  // teclas son `src/juego/teclas.js` desde el experimento 24 y salen del mismo
  // `config.cfg`.
  { pestana: "Keyboard", clave: "teclas", tipo: TIPOS.TECLAS, etiqueta: "Master Sword Commands" },

  // ── Mouse ───────────────────────────────────────────────────────────────
  {
    pestana: "Mouse", clave: "ratonInvertido", cvar: "m_pitch", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_ReverseMouse", descripcion: "#GameUI_ReverseMouseLabel",
    pordefecto: false, cfg: 'm_pitch "0.022000"',
    // En el motor no es una casilla: es el SIGNO de `m_pitch`. Negativo es
    // invertido. La casilla de la ventana escribe el signo, y por eso el valor
    // por defecto sale de que `m_pitch` es positivo en el `config.cfg`.
  },
  {
    pestana: "Mouse", clave: "mirarConRaton", cvar: "lookspring", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_MouseLook", descripcion: "#GameUI_MouseLookLabel", pordefecto: true,
    porQueNo: "the mouse always looks here: there is no keyboard-look mode to turn off.",
  },
  {
    pestana: "Mouse", clave: "filtro", cvar: "m_filter", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_MouseFilter", descripcion: "#GameUI_MouseFilterLabel",
    pordefecto: true, cfg: 'm_filter "1"',
  },
  {
    pestana: "Mouse", clave: "joystick", cvar: "joystick", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_Joystick", descripcion: "#GameUI_JoystickLabel", pordefecto: false,
    porQueNo: "no gamepad support in this port.",
  },
  {
    pestana: "Mouse", clave: "joystickMirar", cvar: "joyadvanced", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_JoystickLook", descripcion: "#GameUI_JoystickLookLabel", pordefecto: false,
    porQueNo: "no gamepad support in this port.",
  },
  {
    pestana: "Mouse", clave: "autoApuntado", cvar: "sv_aim", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_AutoAim", descripcion: "#GameUI_AutoaimLabel", pordefecto: false,
    cfg: 'sv_aim "0"',
    porQueNo: "auto-aim is a server cvar and Master Sword turns it off; melee does not use it.",
  },
  {
    pestana: "Mouse", clave: "ratonCrudo", cvar: "m_rawinput", tipo: TIPOS.CASILLA,
    etiqueta: "Raw mouse input", descripcion: "Directly access mouse data", pordefecto: false,
    porQueNo: "pointer lock gives movementX and nothing rawer.",
  },
  {
    pestana: "Mouse", clave: "sensibilidad", cvar: "sensitivity", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_MouseSensitivity", min: 0.2, max: 20, pordefecto: 10,
    decimales: 1, cfg: 'sensitivity "10"',
    // Las puntas 0.20 y 20.00 están medidas de la captura; el 10 sale del
    // archivo. Que coincidan es la comprobación de que la escala es ésta.
  },

  // ── Audio ───────────────────────────────────────────────────────────────
  {
    pestana: "Audio", clave: "volumen", cvar: "volume", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_SoundEffectVolume", min: 0, max: 1, pordefecto: 0.12,
    decimales: 2, cfg: 'volume "0.120000"',
  },
  {
    pestana: "Audio", clave: "volumenMp3", cvar: "MP3Volume", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_MP3Volume", min: 0, max: 1, pordefecto: 0.2, decimales: 2,
    cfg: 'MP3Volume "0.2"',
    // AQUÍ HABÍA «no hay música en este port». La hay: cuatro pistas en
    // `sonido.json` —`msgatecity.mp3` entre ellas— y `CAreaMusic::MusicTouch`
    // las cambia por zona (`src/main.js`, `audio.musica(zona.musica)`). El
    // ajuste estaba apagado por una frase que ya no era verdad, no por un
    // límite. Es el canal de música, aparte del de efectos, como en el motor.
  },
  {
    pestana: "Audio", clave: "calidad", cvar: "s_a3d", tipo: TIPOS.DESPLEGABLE,
    etiqueta: "#GameUI_SoundQuality", opciones: ["Low", "Medium", "High"], pordefecto: "High",
    porQueNo: "Web Audio decodes the WAVs at its own rate; there is nothing to lower.",
  },
  {
    pestana: "Audio", clave: "notaMiles", tipo: TIPOS.NOTA,
    // La nota legal de la captura, que se porta tal cual porque es una nota
    // legal: si el juego la enseña, la enseñamos. Sale de `gameui_english.txt`.
    etiqueta: "#GameUI_Miles_Audio",
  },

  // ── Video ───────────────────────────────────────────────────────────────
  {
    pestana: "Video", clave: "renderizador", cvar: "gl_renderer", tipo: TIPOS.DESPLEGABLE,
    etiqueta: "#GameUI_Renderer", opciones: ["OpenGL", "Software"], pordefecto: "OpenGL",
    porQueNo: "this port is WebGL through Three.js and there is no second renderer to choose.",
  },
  {
    pestana: "Video", clave: "resolucion", tipo: TIPOS.DESPLEGABLE,
    etiqueta: "#GameUI_Resolution", opciones: [], pordefecto: "",
    porQueNo: "the resolution follows the window size; nothing here resizes the window yet.",
  },
  {
    pestana: "Video", clave: "modo", tipo: TIPOS.DESPLEGABLE,
    etiqueta: "#GameUI_DisplayMode", opciones: ["Normal", "Widescreen"], pordefecto: "Widescreen",
    porQueNo: "same reason: the aspect ratio follows the window.",
  },
  {
    pestana: "Video", clave: "brillo", cvar: "brightness", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_Brightness", min: 1, max: 3, pordefecto: 2, decimales: 1,
    cfg: 'brightness "2"',
    // El brillo y la gamma de GoldSrc no son un filtro encima: entran en la
    // rampa con la que se decodifica el mapa de luz. Aquí eso es
    // `src/bsp/gamma.js`, que ya existe desde el experimento 08.
  },
  {
    pestana: "Video", clave: "gamma", cvar: "gamma", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_Gamma", min: 1.8, max: 3, pordefecto: 3, decimales: 1,
    cfg: 'gamma "3"',
  },
  {
    pestana: "Video", clave: "ventana", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_Windowed", pordefecto: true,
    porQueNo: "the game already runs in a window; toggling full screen is not wired to this box yet.",
  },
  {
    pestana: "Video", clave: "vsync", cvar: "gl_vsync", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_VSync", pordefecto: true,
    porQueNo: "requestAnimationFrame already waits for the refresh and cannot be told not to.",
  },
  {
    pestana: "Video", clave: "modelosHd", cvar: "cl_himodels", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_HDModels", pordefecto: true, cfg: 'cl_himodels "1"',
    porQueNo: "Master Sword ships one set of models: there is no HD pack to switch to.",
  },
  {
    pestana: "Video", clave: "contenidoPropio", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_AddonsFolder", pordefecto: false,
    porQueNo: "nothing downloads custom content here, and this port adds no assets.",
  },
  {
    pestana: "Video", clave: "texturasDetalle", cvar: "r_detailtextures", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_DetailTextures", pordefecto: true,
    porQueNo: "Gate City has no detail texture set.",
  },
  {
    pestana: "Video", clave: "notaReinicio", tipo: TIPOS.NOTA,
    etiqueta: "#GameUI_VideoRestart",
  },

  // ── Voice ───────────────────────────────────────────────────────────────
  {
    pestana: "Voice", clave: "vozActiva", cvar: "voice_modenable", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_EnableVoice", pordefecto: false,
    porQueNo: "there is no voice channel in this port's protocol.",
  },
  {
    pestana: "Voice", clave: "vozRecibir", cvar: "voice_scale", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_VoiceReceiveVolume", min: 0, max: 1, pordefecto: 1, decimales: 2,
    porQueNo: "there is no voice channel in this port's protocol.",
  },
  {
    pestana: "Voice", clave: "vozTransmitir", cvar: "voice_inputfromfile", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_VoiceTransmitVolume", min: 0, max: 1, pordefecto: 1, decimales: 2,
    porQueNo: "there is no voice channel in this port's protocol.",
  },

  // ── Lock ────────────────────────────────────────────────────────────────
  {
    pestana: "Lock", clave: "candado", tipo: TIPOS.NOTA,
    etiqueta: "#GameUI_ContentLockLabel",
  },
  {
    pestana: "Lock", clave: "candadoEstado", tipo: TIPOS.NOTA,
    etiqueta: "#GameUI_ContentStatusDisabled",
  },
  {
    pestana: "Lock", clave: "candadoBoton", tipo: TIPOS.BOTON, etiqueta: "#GameUI_Enable",
    porQueNo: "the parental lock hides gore and Half-Life's own violence cvars; this port draws neither.",
  },
];

/** Los de una pestaña, en orden. */
export function deLaPestana(nombre) {
  return AJUSTES.filter((a) => a.pestana === nombre);
}

/** Un ajuste por su clave. */
export function ajuste(clave) {
  return AJUSTES.find((a) => a.clave === clave) ?? null;
}

/** El estado inicial: cada ajuste en su valor del `config.cfg`. */
export function porDefecto() {
  const v = {};
  for (const a of AJUSTES) {
    if (a.tipo === TIPOS.NOTA || a.tipo === TIPOS.BOTON || a.tipo === TIPOS.TECLAS) continue;
    v[a.clave] = a.pordefecto;
  }
  return v;
}

/**
 * Cuántos ajustes hacen algo de verdad.
 *
 * Es la cuenta que dice si la ventana es una ventana o un decorado, y va al
 * informe igual que el censo de NPCs del 33. Se calcula, no se escribe a mano:
 * así no se puede quedar vieja.
 */
export function cuenta() {
  const controles = AJUSTES.filter((a) => a.tipo !== TIPOS.NOTA);
  const vivos = controles.filter((a) => !a.porQueNo);
  return {
    total: controles.length,
    vivos: vivos.length,
    apagados: controles.length - vivos.length,
    porPestana: Object.fromEntries(PESTANAS.map((p) => {
      const c = controles.filter((a) => a.pestana === p);
      return [p, { total: c.length, vivos: c.filter((a) => !a.porQueNo).length }];
    })),
  };
}

/**
 * Guardar y leer.
 *
 * Un ajuste que no está en el guardado se queda en su valor del `config.cfg`, y
 * uno que sobra se tira. Es la misma regla que salvó las partidas en el 33: el
 * guardado cambia de forma y un personaje viejo tiene que poder leerse.
 */
export function leerAjustes(guardado) {
  const v = porDefecto();
  if (!guardado || typeof guardado !== "object") return v;
  for (const a of AJUSTES) {
    if (!(a.clave in v)) continue;
    const g = guardado[a.clave];
    if (g === undefined || g === null) continue;
    if (typeof v[a.clave] === "boolean") { v[a.clave] = !!g; continue; }
    if (typeof v[a.clave] === "number") {
      const n = Number(g);
      if (!Number.isFinite(n)) continue;
      // Un número fuera de rango se recorta en vez de tirarse: un guardado con
      // la sensibilidad a 900 tiene que dejar jugar, no volver a 10 en silencio.
      v[a.clave] = Math.max(a.min ?? -Infinity, Math.min(a.max ?? Infinity, n));
      continue;
    }
    v[a.clave] = g;
  }
  return v;
}
