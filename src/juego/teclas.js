// LAS TECLAS: qué acciones hay, con qué se hacen y cómo se cambian.
//
// ── Por qué esto existe ahora y no con el menú ────────────────────────────
//
// Porque es **dependencia del movimiento**, no adorno del menú. El modelo de
// Master Sword tiene más botones que WASD —agacharse, correr, usar, coger,
// dos ataques— y sin ellos con nombre, el código del paso 2 se escribe contra
// literales. Ya había dos `"KeyW"` sueltos en `src/main.js` y uno de ellos
// costó tres controles en rojo: «¿hay un botón pulsado?» contaba Escape, así
// que cerrar la pantalla de muerte te resucitaba.
//
// ── Los valores por defecto no son gusto: son el config.cfg del juego ─────
//
// Salen de `../MSC/assets/msr/config.cfg`, que es la configuración de la
// instalación de Master Sword Rebirth que hay al lado. Es la misma regla que
// trajo `gl_overbright "0"` y salvó la iluminación: **cuando exista el
// original, leerlo.** Un razonamiento sobre qué tecla «debería» ser saltar es
// una hipótesis; un `bind` es un hecho.
//
// Tres que no habría adivinado y que están ahí:
//
//   p    la hoja de personaje (`playerinfo`) — nosotros teníamos la C
//   q    usar de golpe, distinto de `e` que es `+use` mantenido
//   h    cambiar de mano, que además está en el botón CENTRAL del ratón

/** Cómo se llama cada tecla del `config.cfg` en un `KeyboardEvent.code`. */
const DEL_CFG = {
  SPACE: "Space", CTRL: "ControlLeft", SHIFT: "ShiftLeft", TAB: "Tab",
  ENTER: "Enter", ESCAPE: "Escape", BACKSPACE: "Backspace",
  MOUSE1: "Mouse0", MOUSE2: "Mouse2", MOUSE3: "Mouse1",
  PGUP: "PageUp", PGDN: "PageDown", HOME: "Home",
  ALT: "AltLeft", ALTGR: "AltRight",
};

/** De una letra o número del `config.cfg` al `code` del navegador. */
function codigoDe(cfg) {
  if (DEL_CFG[cfg]) return DEL_CFG[cfg];
  if (/^[a-z]$/.test(cfg)) return `Key${cfg.toUpperCase()}`;
  if (/^[0-9]$/.test(cfg)) return `Digit${cfg}`;
  if (/^F\d{1,2}$/.test(cfg)) return cfg;
  return cfg;
}

/**
 * Las acciones.
 *
 * `boton` marca las que cuentan como `pev->button` del motor: las de JUEGO.
 * El motor lo consulta como `pev->button & ~IN_SCORE` para decidir si un
 * muerto quiere levantarse, y meter ahí las de interfaz es el fallo de arriba.
 *
 * `cfg` es el `bind` del que sale el valor por defecto, para poder volver a
 * mirarlo.
 */
export const ACCIONES = [
  { clave: "adelante", nombre: "Move Forward", cfg: "w", boton: true },
  { clave: "atras", nombre: "Move Back", cfg: "s", boton: true },
  { clave: "izquierda", nombre: "Move Left", cfg: "a", boton: true },
  { clave: "derecha", nombre: "Move Right", cfg: "d", boton: true },
  { clave: "saltar", nombre: "Jump", cfg: "SPACE", boton: true },
  { clave: "agachar", nombre: "Duck", cfg: "CTRL", boton: true },
  { clave: "correr", nombre: "Run", cfg: "SHIFT", boton: true },
  { clave: "atacar", nombre: "Attack", cfg: "MOUSE1", boton: true },
  { clave: "atacar2", nombre: "Secondary Attack", cfg: "MOUSE2", boton: true },
  { clave: "usar", nombre: "Use (hold)", cfg: "e", boton: true },
  { clave: "usarYa", nombre: "Use", cfg: "q", boton: true },
  { clave: "coger", nombre: "Pick Up", cfg: "x", boton: true },
  { clave: "soltar", nombre: "Drop", cfg: "c", boton: true },
  { clave: "cambiarMano", nombre: "Swap Hands", cfg: "h", boton: true },
  // CICLAR. Un comando con argumento en el motor —`quickslot weapon|spell|arrow`
  // (hud.cpp:267)—, tres acciones aquí porque cada una lleva su tecla.
  //
  // Y el reparto por defecto NO es 1-2-3: la 3 abre el inventario y la munición
  // es la 4 (`gfx/shell/kb_def.lst`). Son `bind`, o sea que cualquiera los tiene
  // cambiados; lo que se porta es la acción.
  { clave: "ciclarArma", nombre: "Select Weapon", cfg: "1", boton: false },
  { clave: "ciclarHechizo", nombre: "Select Spell", cfg: "2", boton: false },
  { clave: "ciclarMunicion", nombre: "Select Ammo", cfg: "4", boton: false },
  // LAS DOCE RANURAS. `+quickslot N`: pulsar usa, aguantar dos segundos graba.
  //
  // El `alias` es el SEGUNDO bind que el juego trae de fábrica para las cinco
  // primeras («6».."0"), y aquí hace además de red de seguridad: un navegador
  // se queda con algunas teclas de función —F11 es pantalla completa y F12 las
  // herramientas— y ésas no llegan nunca. Con las dos, las cinco primeras
  // ranuras se pueden usar siempre.
  ...Array.from({ length: 12 }, (_, i) => ({
    clave: `ranura${i + 1}`,
    nombre: `Quickslot ${i + 1}${i === 0 ? " (hold to assign)" : ""}`,
    cfg: `F${i + 1}`,
    alias: i < 5 ? String((6 + i) % 10) : null,
    boton: false,
  })),
  // Los dos desplazamientos que llevan de las 12 teclas a las 36 ranuras.
  // Existen en el juego —`kb_act.lst` los lista como «Shift Quickslots +12» y
  // «+24»— pero son ALIAS DE CONSOLA, no comandos del motor, y `kb_def.lst` no
  // les da ninguna tecla: quien los quiere se los asigna. Así que ALT y ALT GR
  // son **elección nuestra** y se dice; lo de arriba son hechos, esto no.
  { clave: "correrRanuras12", nombre: "Shift Quickslots +12 (hold)", cfg: "ALT", boton: false },
  { clave: "correrRanuras24", nombre: "Shift Quickslots +24 (hold)", cfg: "ALTGR", boton: false },
  // Y las de interfaz, que NO son botones de juego.
  { clave: "hoja", nombre: "Character Sheet", cfg: "p", boton: false },
  { clave: "inventario", nombre: "Inventory", cfg: "i", boton: false },
  // `bind "f" "menu interact"` (config.cfg:19, kb_def.lst:61), y su nombre sale
  // de `kb_act.lst:41`. Faltaba: los paneles que teníamos no pasaban por esta
  // tabla, así que la F no existía. Ver `src/vgui/interactuar.js`.
  { clave: "interactuar", nombre: "Interact with NPC", cfg: "f", boton: false },
  // ACEPTAR, el 89. `bind "ENTER" "accept"` (config.cfg:6) y su nombre de
  // `kb_act.lst:44`. Es lo que pulsa quien está en una `msarea_transition`
  // para viajar —el comando llega a `MSQuery`, multiplay_gamerules.cpp:1725-1732—
  // y en el motor también acepta a un miembro de grupo, que aquí no existe.
  // El chat no la pisa: sólo se queda el Enter mientras su cajetín está abierto
  // (src/juego/chat.js:220), y se abre con `y`/`u`/`j`, como en el juego.
  { clave: "aceptar", nombre: "Accept", cfg: "ENTER", boton: false },
  { clave: "opciones", nombre: "Options", cfg: "g", boton: false },
  { clave: "menu", nombre: "Main Menu", cfg: "ESCAPE", boton: false },
  { clave: "marcador", nombre: "Scoreboard", cfg: "TAB", boton: false },
  // PANTALLA COMPLETA, que **no existe en Master Sword** y no podría: un juego de
  // escritorio ya tiene la ventana entera y ya tiene el teclado entero. Ésta es
  // NUESTRA, como ALT y ALT GR de arriba, y se dice.
  //
  // No es un adorno. Es la única manera de que el navegador ceda Ctrl+W, o sea
  // la única manera de poder agacharse y avanzar a la vez —que es cómo se sube a
  // los sitios estrechos desde Half-Life— sin que se cierre la pestaña. El por
  // qué, con lo que se puede y lo que no, está en `src/juego/navegador.js`.
  //
  // La `b` es elección nuestra: no la usa ningún `bind` del `config.cfg` y no es
  // atajo de ningún navegador. La F11, que sería la obvia, no sirve —se la queda
  // el navegador y no llega nunca—, y ésa es justo la clase de cosa que hay que
  // escribir para que nadie la «arregle» poniéndola ahí.
  { clave: "pantallaCompleta", nombre: "Fullscreen (web port only)", cfg: "b", boton: false },
];

/** Las doce ranuras rápidas, en orden. */
export const RANURAS = ACCIONES.filter((a) => /^ranura\d+$/.test(a.clave)).map((a) => a.clave);

/** Los valores por defecto, derivados de los `bind` de arriba. */
export function porDefecto() {
  const m = {};
  for (const a of ACCIONES) m[a.clave] = codigoDe(a.cfg);
  return m;
}

/**
 * Las teclas de un SEGUNDO juego, que no se reasignan y no se guardan.
 *
 * El juego tiene acciones con dos `bind` a la vez —las cinco primeras ranuras
 * están en F1..F5 y también en el 6, 7, 8, 9 y 0— y nuestro mapa es de una
 * tecla por acción. En vez de complicar el mapa, el segundo juego va aparte:
 * siempre vale, nunca se pisa y no aparece en las opciones.
 */
export const ALIAS = Object.freeze(Object.fromEntries(
  ACCIONES.filter((a) => a.alias).map((a) => [codigoDe(a.alias), a.clave])
));

/** Las acciones que cuentan como `pev->button`. */
export const BOTONES_DE_JUEGO = ACCIONES.filter((a) => a.boton).map((a) => a.clave);

const GUARDADO = "mydra/teclas";

/**
 * Las teclas de una partida: qué está pulsado y qué significa.
 *
 * Guarda en `localStorage` y no en el almacén de personajes, a propósito: las
 * teclas son de **este equipo**, no de este personaje. Llevarlas en el
 * personaje significaría que importar una copia de seguridad te cambia los
 * controles, que es de las cosas que más molestan y menos se esperan.
 */
export class Teclas {
  constructor({ almacen = globalThis.localStorage } = {}) {
    this._almacen = almacen;
    this.mapa = porDefecto();
    this.pulsadas = new Set();
    /**
     * EL 98: LAS QUE SE HAN PULSADO DESDE LA ÚLTIMA `intencion()`, aunque ya
     * se hayan soltado. Es el «impulse down» de `kbutton_t`:
     *
     *     b->state |= 1 + 2; // down + impulse down        input.cpp:344
     *     if (in_jump.state & 3) bits |= IN_JUMP;           input.cpp:915
     *     in_jump.state &= ~2;   // (bResetState)           input.cpp:1001
     *
     * O sea que en GoldSrc un toque más corto que un fotograma SÍ cuenta, una
     * vez. Aquí `pulsadas` sólo decía lo que estaba abajo AL MIRAR, y con la
     * página a 7 fotogramas por segundo (Gate City con otras cinco sesiones
     * en la máquina) una barra de 150 ms caía entera entre dos fotogramas y
     * no saltabas: `sondas/aturdir98` midió 0,04 m en su control positivo.
     */
    this.impulsos = new Set();
    this._oyentes = new Set();
    this.cargar();
  }

  /** Se suscribe a los cambios de asignación. */
  al(fn) { this._oyentes.add(fn); return () => this._oyentes.delete(fn); }
  _avisar() { for (const f of this._oyentes) { try { f(this); } catch (e) { console.error(e); } } }

  cargar() {
    try {
      const crudo = this._almacen?.getItem(GUARDADO);
      if (!crudo) return;
      const leido = JSON.parse(crudo);
      // Se parte de los valores por defecto y se pisa lo que venga, en vez de
      // usar lo guardado tal cual: así una acción NUEVA aparece con su tecla
      // en vez de quedarse sin ninguna para quien ya tenía esto guardado.
      const m = porDefecto();
      for (const a of ACCIONES) if (typeof leido?.[a.clave] === "string") m[a.clave] = leido[a.clave];
      this.mapa = m;
    } catch {
      // `localStorage` puede no estar (una ventana privada) o traer basura.
      // Quedarse con los valores por defecto es mejor que una pantalla rota.
    }
  }

  guardar() {
    try { this._almacen?.setItem(GUARDADO, JSON.stringify(this.mapa)); } catch { /* da igual */ }
  }

  /** Vuelve a lo que dice el `config.cfg` del juego. */
  porDefecto() { this.mapa = porDefecto(); this.guardar(); this._avisar(); }

  /**
   * Asigna una tecla a una acción.
   *
   * Si la tecla ya estaba en otra acción, **se la quita** y lo dice. Dejar dos
   * acciones con la misma tecla no da error: da que saltar también suelte el
   * arma, y a saber cuál gana.
   */
  asignar(accion, codigo) {
    if (!ACCIONES.some((a) => a.clave === accion)) throw new Error(`no existe la acción '${accion}'`);
    if (!codigo) throw new Error("hace falta una tecla");
    const robadaA = Object.keys(this.mapa).filter((k) => k !== accion && this.mapa[k] === codigo);
    for (const k of robadaA) delete this.mapa[k];
    this.mapa[accion] = codigo;
    this.guardar();
    this._avisar();
    return { robadaA };
  }

  /** Quita la tecla de una acción. */
  quitar(accion) { delete this.mapa[accion]; this.guardar(); this._avisar(); }

  /**
   * Qué acción hace esta tecla, o null.
   *
   * El mapa manda sobre el alias: quien se ponga el 6 para saltar, salta. Si
   * no, el 6 sigue siendo la ranura 1 como en el juego.
   */
  accionDe(codigo) {
    return Object.keys(this.mapa).find((k) => this.mapa[k] === codigo) ?? ALIAS[codigo] ?? null;
  }

  /** Si está pulsada la tecla de esta acción, por su tecla o por su alias. */
  pulsada(accion, { conImpulso = false } = {}) {
    const esta = (codigo) => this.pulsadas.has(codigo) || (conImpulso && this.impulsos.has(codigo));
    const c = this.mapa[accion];
    if (c && esta(c)) return true;
    for (const [codigo, clave] of Object.entries(ALIAS)) {
      // Un alias no vale si esa tecla se la ha quedado otra acción.
      if (clave === accion && esta(codigo) && !Object.values(this.mapa).includes(codigo)) return true;
    }
    return false;
  }

  // `if (b->state & 1) return; // still down` (input.cpp:342-343): la
  // repetición del teclado no es otro impulso.
  abajo(codigo) { if (!this.pulsadas.has(codigo)) this.impulsos.add(codigo); this.pulsadas.add(codigo); }
  arriba(codigo) { this.pulsadas.delete(codigo); }
  soltarTodo() { this.pulsadas.clear(); this.impulsos.clear(); }

  /**
   * Si hay algún BOTÓN DE JUEGO pulsado. `pev->button & ~IN_SCORE`.
   *
   * Es lo que la sesión usa para saber si un muerto quiere levantarse, y por
   * eso las acciones de interfaz están fuera: con ellas dentro, abrir el
   * inventario mientras estás muerto te resucita.
   */
  hayBotonDeJuego() { return BOTONES_DE_JUEGO.some((b) => this.pulsada(b)); }

  /**
   * La intención de movimiento, en [−1, 1]. Es `CL_ButtonBits(1)`: cada botón
   * vale si está abajo O se pulsó desde la vez anterior (`state & 3`), y al
   * acabar se borran los impulsos (input.cpp:895-1010). Una llamada por
   * fotograma, como el `usercmd`.
   */
  intencion() {
    const p = (a) => this.pulsada(a, { conImpulso: true });
    const q = {
      adelante: (p("adelante") ? 1 : 0) - (p("atras") ? 1 : 0),
      lado: (p("derecha") ? 1 : 0) - (p("izquierda") ? 1 : 0),
      saltar: p("saltar"),
      agachar: p("agachar"),
      correr: p("correr"),
      // Atacar es un BOTÓN aguantado y no un pulso, porque el arma lo lee así:
      // `+attack1` mientras esté abajo y `-attack1` al soltarlo son dos ataques
      // distintos del mismo arma. Mandar sólo el flanco perdería el cargado.
      atacar: p("atacar"),
      // Cubrirse con el escudo es el MISMO botón aguantado, pero el otro: el
      // objeto de la mano activa usa `IN_ATTACK` y el de la otra `IN_ATTACK2`
      // (`attack1` en el combo se traduce a uno o a otro, giattack.cpp:118), y un
      // escudo va siempre en la otra mano.
      cubrir: p("atacar2"),
    };
    this.impulsos.clear();
    return q;
  }
}

/** Un nombre legible para una tecla, para poder enseñarla en las opciones. */
export function nombreDeTecla(codigo) {
  if (!codigo) return "—";
  const m = {
    Space: "Space", ControlLeft: "Left Ctrl", ControlRight: "Right Ctrl",
    ShiftLeft: "Left Shift", ShiftRight: "Right Shift", AltLeft: "Alt", AltRight: "Alt Gr",
    Tab: "Tab", Enter: "Enter", Escape: "Esc", Backspace: "Backspace",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Mouse0: "Left Mouse", Mouse1: "Middle Mouse", Mouse2: "Right Mouse",
    Mouse3: "Mouse 4", Mouse4: "Mouse 5",
  };
  if (m[codigo]) return m[codigo];
  if (codigo.startsWith("Key")) return codigo.slice(3);
  if (codigo.startsWith("Digit")) return codigo.slice(5);
  if (codigo.startsWith("Numpad")) return `Numpad ${codigo.slice(6)}`;
  return codigo;
}
