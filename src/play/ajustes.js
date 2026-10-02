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
//
// ── Y «esto funciona» NO PUEDE SER UN CAMPO VACÍO ─────────────────────────
//
// Es el apartado 5 de CLAUDE.md y es la vacuna contra el 4: **un ajuste no
// puede quedarse callado**. `crearpartida.js` lo aprendió a base de golpes —
// `mapa` y `nombre` estaban los dos sin `porQueNo` y ninguno de los dos llegaba
// al juego— y desde entonces esa tabla pide `porQueNo` o `aplica`. Esta otra
// tenía 21 filas con `porQueNo` y **ninguna** con `aplica`: o sea que el lado
// que dice «esto hace algo» era otra vez un campo vacío, aquí dentro.
//
// El fallo que obliga a que `aplica` sea más que un nombre de función es el del
// 84, que lo reportó el usuario jugando: `aplicarAjustes` nace `null` en
// `src/main.js:442` y lo escribe el armado del mundo, así que **antes de cargar
// un mapa el `?.` no llamaba a nadie** y mover el volumen en el menú principal
// no hacía nada. Un `aplica: "lo reparte aplicarAjustes"` habría estado en
// verde todo ese tiempo: la función existía, se llamaba y hacía su trabajo —
// en el único estado en el que el jugador no estaba.
//
// Así que `aplica` lleva tres cosas, y las tres se comprueban en
// `test/vgui2.test.mjs`:
//
//   `donde`      la prosa, con archivo y línea.
//   `codigo`     pares `[archivo, trozo literal]`. La prueba abre el archivo y
//                busca el trozo: si alguien renombra la línea que aplica el
//                ajuste, esto se pone rojo en vez de envejecer en silencio.
//   `llega`      pares `[archivo, texto del control]` del control que mide que
//                el valor LLEGA, y **en el estado en que el jugador lo mueve**.
//                Es lo único que distingue «la línea está escrita» de «el
//                número llega»: ver el volumen, que tiene dos caminos y por eso
//                dos controles.
//   `pendiente`  en vez de `llega`, cuando NADIE lo mide todavía. Dicho, no
//                tapado: el apartado 4 pide que un control que no existe se
//                declare pendiente en vez de contarse entre los verdes, y
//                cuatro de los nueve vivos de aquí están así.

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
 *   `aplica`   dónde se aplica y quién mide que llega. **Uno de los dos, nunca
 *              ninguno**: ver la cabecera.
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
    aplica: {
      donde: "src/main.js:1755, dentro de `aplicarAjustes`: se lo pasa al panel " +
        "`newchar` de VGUI, que es quien escribe el cuadro de crear personaje.",
      codigo: [["src/main.js", 'vgui?.buscar("newchar")?.proponerNombre']],
      // Y el control vale porque el valor de reposo NO es éste: el cuadro
      // arrancaba VACÍO, así que «dice Adventurer» no se cumple sin que el
      // ajuste haya viajado. Lo que este control no mide es un nombre
      // CAMBIADO —la sonda no escribe en la caja de «Player name»—, y eso se
      // dice aquí en vez de dejarlo entendido.
      llega: [["sondas/ajustes37.mjs", "la pantalla de personajes PROPONE el nombre del cvar"]],
    },
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
  {
    pestana: "Keyboard", clave: "teclas", tipo: TIPOS.TECLAS, etiqueta: "Master Sword Commands",
    aplica: {
      // Esta fila no pasa por `aplicarAjustes` ni por «Apply»: la tabla escribe
      // directamente en el `Teclas` vivo que le pasa `main.js`, así que una
      // reasignación entra en el acto. Por eso su `codigo` está en la ventana y
      // no en el reparto.
      donde: "src/vgui2/opciones.js:323, la tabla de teclas escribe en el `Teclas` " +
        "vivo (`src/juego/teclas.js`) sin pasar por «Apply»: entra en el acto.",
      codigo: [["src/vgui2/opciones.js", "this.teclas?.asignar(esperando, e.code)"]],
      // `sondas/fisica.mjs:181` reasigna y mide el efecto, pero llama a
      // `probe.teclas.asignar` A MANO: es el 59 —la prueba construye lo que el
      // llamador se equivoca al pasar—, así que mide que `Teclas` sabe
      // reasignar y no que la tabla de la ventana llegue hasta ella. Ninguna
      // sonda pulsa una fila de la pestaña Keyboard.
      pendiente: "ninguna sonda reasigna desde la VENTANA: `sondas/fisica.mjs:181` " +
        "llama a `probe.teclas.asignar` a mano, que es el camino de la API y no el " +
        "del jugador. Lo que falta es pulsar una fila de la pestaña Keyboard.",
    },
  },

  // ── Mouse ───────────────────────────────────────────────────────────────
  {
    pestana: "Mouse", clave: "ratonInvertido", cvar: "m_pitch", tipo: TIPOS.CASILLA,
    etiqueta: "#GameUI_ReverseMouse", descripcion: "#GameUI_ReverseMouseLabel",
    pordefecto: false, cfg: 'm_pitch "0.022000"',
    // En el motor no es una casilla: es el SIGNO de `m_pitch`. Negativo es
    // invertido. La casilla de la ventana escribe el signo, y por eso el valor
    // por defecto sale de que `m_pitch` es positivo en el `config.cfg`.
    aplica: {
      donde: "src/main.js:1752, `aplicarAjustes` → `raton.poner({ invertido })` " +
        "→ `Raton` de src/play/aplicar.js, que es quien pone el signo.",
      codigo: [["src/main.js", "raton.poner({ sensibilidad: v.sensibilidad, invertido: v.ratonInvertido"]],
      // El control mide los dos lados, que es lo que hace que no sea un «se
      // movió»: el cabeceo cambia de signo Y el giro no se entera.
      llega: [["sondas/ajustes37.mjs", "cambia el SIGNO del cabeceo y no toca el giro"]],
    },
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
    aplica: {
      donde: "src/main.js:1752, `aplicarAjustes` → `raton.poner({ filtro })`: la " +
        "media de dos muestras de `inputw32.cpp:527-535`, en src/play/aplicar.js:100.",
      codigo: [["src/main.js", "filtro: v.filtro"], ["src/play/aplicar.js", "if (this.filtro)"]],
      // El valor SE PUEDE leer —`probe.ajustes.gradosPorCuenta()` devuelve
      // `filtro` (src/dev/sonda.js:934)—, así que lo que falta no es el
      // instrumento: es que nadie pulse la casilla y lo lea. Y aquí el reposo
      // es `true`, o sea que un control que mirara sólo el estado inicial
      // estaría en verde con la casilla desconectada: el apartado 4 entero.
      pendiente: "ninguna sonda pulsa «Mouse filter». Las pruebas de Node miden la " +
        "fórmula del filtro (`test/juego_ajustes.test.mjs`) construyendo el `Raton` " +
        "ellas, que es el 59; y el reposo de la casilla es `true`, así que leer el " +
        "estado inicial pasaría igual con la casilla sin enchufar.",
    },
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
    aplica: {
      donde: "src/main.js:1752, `aplicarAjustes` → `raton.poner({ sensibilidad })`: " +
        "multiplica las dos cuentas en src/play/aplicar.js (`inputw32.cpp:452`).",
      codigo: [["src/main.js", "raton.poner({ sensibilidad: v.sensibilidad"]],
      // Y el control no dice «ya no vale 0,22»: dice que gira **lo que pide la
      // ventana × m_yaw**, que es lo único que no se cumple con un número
      // cualquiera. El deslizador se arrastra con el ratón, no se escribe.
      llega: [["sondas/ajustes37.mjs", "gira lo que dice la ventana"]],
    },
  },

  // ── Audio ───────────────────────────────────────────────────────────────
  {
    pestana: "Audio", clave: "volumen", cvar: "volume", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_SoundEffectVolume", min: 0, max: 1, pordefecto: 0.12,
    decimales: 2, cfg: 'volume "0.120000"',
    // ESTE ES EL AJUSTE QUE OBLIGA A QUE `aplica` SEA ASÍ, y el fallo es el 84.
    //
    // Tiene DOS caminos, y el que se había escrito no era el que el jugador
    // usa primero: el deslizador se mueve en el menú principal, donde no hay
    // mapa, y ahí `aplicarAjustes` todavía es `null`.
    aplica: {
      donde: "dos caminos, y hacen falta los dos. (1) src/main.js:690, en " +
        "`alAplicar` y DELANTE del `aplicarAjustes?.(…)`, porque el menú es " +
        "justo donde el otro no existe: `menuMs.ponVolumen` (src/juego/menums.js:333) " +
        "pone el `volume` de los tres `Audio` del DOM. (2) src/main.js:1753, " +
        "`audio.volumenes({ efectos })`, el nodo de ganancia de Web Audio, que no " +
        "existe hasta que hay mapa.",
      codigo: [
        ["src/main.js", "menuMs?.ponVolumen?.(valores.volumen)"],
        ["src/main.js", "audio.volumenes({ efectos: v.volumen"],
        ["src/juego/menums.js", "const ponVolumen = (v) =>"],
      ],
      // Tres controles y ninguno sobra: el primero mide el nodo de Web Audio
      // —que estaba en verde con el menú sonando a 1—, el segundo que llega a
      // los `Audio` del DOM, y el tercero es el único que lo mide **en el menú
      // y sin mapa cargado**, que es el estado del fallo.
      llega: [
        ["sondas/ajustes37.mjs", "lo sube en el nodo de Web Audio, no en un campo"],
        ["sondas/ajustes37.mjs", "LLEGA A LOS SONIDOS DEL MENÚ"],
        ["sondas/menu52.mjs", "movido EN EL MENÚ y sin mapa"],
      ],
    },
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
    aplica: {
      donde: "src/main.js:1753, `audio.volumenes({ musica })`: el canal de música, " +
        "aparte del de efectos, que es lo que hace el motor.",
      codigo: [["src/main.js", "musica: v.volumenMp3"]],
      // OJO CON LOS DOS CONTROLES QUE YA HAY: «la música va por su canal, con
      // su propio 0,2» y «la música NO se mueve con ella» miden los dos que
      // `musica` vale **0,2**, que es el valor por defecto del `config.cfg`.
      // O sea el valor de reposo: los dos siguen verdes con este deslizador
      // desconectado, porque ninguno lo toca. Son buenos controles de la
      // separación de canales y no son ninguna medida de que este ajuste
      // llegue; apuntarlos aquí como `llega` sería el apartado 4 escrito a
      // mano. Ningún camino arrastra el deslizador de «MP3 volume».
      pendiente: "ninguna sonda arrastra el deslizador de la música. Los dos " +
        "controles que la nombran en `sondas/ajustes37.mjs` comprueban que sigue " +
        "en el 0,2 del `config.cfg` —el valor de reposo— mientras se mueve el OTRO " +
        "deslizador: miden la separación de canales, no esta fila.",
    },
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
    aplica: {
      donde: "src/main.js:1757, `aplicarAjustes` → `rehacerMapaDeLuz`, que es lo " +
        "único que hace el motor al mover la gamma (`R_GammaChanged` → " +
        "`GL_RebuildLightmaps`). La gamma de partida la dice el MANIFIESTO del " +
        "horneado, no una constante.",
      codigo: [["src/main.js", "validarGamma({ gamma: v.gamma, brillo: v.brillo }"]],
      // Dos controles porque hacen falta dos: que los 25 atlas se rehagan, y
      // que el mapa se oscurezca DE VERDAD —el píxel medio baja—, porque
      // «rehizo el atlas» se cumple también dejándolo igual. Y al lado está el
      // control positivo: aplicar lo mismo no puede mover un byte.
      llega: [
        ["sondas/ajustes37.mjs", "rehace los 25 atlas del mapa de luz"],
        ["sondas/ajustes37.mjs", "el píxel medio del atlas baja"],
      ],
    },
  },
  {
    pestana: "Video", clave: "gamma", cvar: "gamma", tipo: TIPOS.DESLIZADOR,
    etiqueta: "#GameUI_Gamma", min: 1.8, max: 3, pordefecto: 3, decimales: 1,
    cfg: 'gamma "3"',
    aplica: {
      donde: "la misma línea que el brillo: src/main.js:1757-1758, dentro del " +
        "`validarGamma({ gamma, brillo })` que alimenta a `rehacerMapaDeLuz`.",
      codigo: [["src/main.js", "validarGamma({ gamma: v.gamma, brillo: v.brillo }"]],
      // Comparte línea con el brillo y aun así va aparte, por el 50: cuando
      // sólo se mide un caso, el valor correcto y el de reposo pueden ser el
      // mismo. El brillo se arrastra y se mide; la gamma no se arrastra nunca,
      // así que apoyarse en el control del brillo sería contar un verde de la
      // fila de al lado. Las pruebas de Node miden la TABLA con gammas
      // distintas, que es la regla, no el viaje del deslizador.
      pendiente: "ninguna sonda arrastra el deslizador de gamma: el de la pestaña " +
        "Video que se mueve es el del brillo. Comparte la línea de aplicación con " +
        "él, pero el 50 dice que un caso único no demuestra el otro.",
    },
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
    // Y la cuenta que el 84 obliga a tener separada: de los vivos, cuántos
    // tienen un control que mide que el valor LLEGA. «Vivo» y «medido» no son
    // lo mismo, y mientras fueran el mismo número nadie tendría que mirar cuál
    // de los dos está leyendo. Se calcula, como todo lo de aquí.
    medidos: vivos.filter((a) => a.aplica?.llega?.length).length,
    pendientes: vivos.filter((a) => !a.aplica?.llega?.length).map((a) => a.clave),
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
