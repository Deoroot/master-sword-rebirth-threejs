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
  { clave: "adelante", nombre: "Andar adelante", cfg: "w", boton: true },
  { clave: "atras", nombre: "Andar atrás", cfg: "s", boton: true },
  { clave: "izquierda", nombre: "Ir a la izquierda", cfg: "a", boton: true },
  { clave: "derecha", nombre: "Ir a la derecha", cfg: "d", boton: true },
  { clave: "saltar", nombre: "Saltar", cfg: "SPACE", boton: true },
  { clave: "agachar", nombre: "Agacharse", cfg: "CTRL", boton: true },
  { clave: "correr", nombre: "Correr", cfg: "SHIFT", boton: true },
  { clave: "atacar", nombre: "Atacar", cfg: "MOUSE1", boton: true },
  { clave: "atacar2", nombre: "Ataque secundario", cfg: "MOUSE2", boton: true },
  { clave: "usar", nombre: "Usar (mantenido)", cfg: "e", boton: true },
  { clave: "usarYa", nombre: "Usar", cfg: "q", boton: true },
  { clave: "coger", nombre: "Coger", cfg: "x", boton: true },
  { clave: "soltar", nombre: "Soltar", cfg: "c", boton: true },
  { clave: "cambiarMano", nombre: "Cambiar de mano", cfg: "h", boton: true },
  // CICLAR. Un comando con argumento en el motor —`quickslot weapon|spell|arrow`
  // (hud.cpp:267)—, tres acciones aquí porque cada una lleva su tecla.
  //
  // Y el reparto por defecto NO es 1-2-3: la 3 abre el inventario y la munición
  // es la 4 (`gfx/shell/kb_def.lst`). Son `bind`, o sea que cualquiera los tiene
  // cambiados; lo que se porta es la acción.
  { clave: "ciclarArma", nombre: "Elegir arma", cfg: "1", boton: false },
  { clave: "ciclarHechizo", nombre: "Elegir hechizo", cfg: "2", boton: false },
  { clave: "ciclarMunicion", nombre: "Elegir munición", cfg: "4", boton: false },
  // LAS DOCE RANURAS. `+quickslot N`: pulsar usa, aguantar dos segundos graba.
  //
  // El `alias` es el SEGUNDO bind que el juego trae de fábrica para las cinco
  // primeras («6».."0"), y aquí hace además de red de seguridad: un navegador
  // se queda con algunas teclas de función —F11 es pantalla completa y F12 las
  // herramientas— y ésas no llegan nunca. Con las dos, las cinco primeras
  // ranuras se pueden usar siempre.
  ...Array.from({ length: 12 }, (_, i) => ({
    clave: `ranura${i + 1}`,
    nombre: `Ranura ${i + 1}${i === 0 ? " (aguantar para grabar)" : ""}`,
    cfg: `F${i + 1}`,
    alias: i < 5 ? String((6 + i) % 10) : null,
    boton: false,
  })),
  // Los dos desplazamientos que llevan de las 12 teclas a las 36 ranuras.
  // Existen en el juego —`kb_act.lst` los lista como «Shift Quickslots +12» y
  // «+24»— pero son ALIAS DE CONSOLA, no comandos del motor, y `kb_def.lst` no
  // les da ninguna tecla: quien los quiere se los asigna. Así que ALT y ALT GR
  // son **elección nuestra** y se dice; lo de arriba son hechos, esto no.
  { clave: "correrRanuras12", nombre: "Ranuras 13-24 (mantener)", cfg: "ALT", boton: false },
  { clave: "correrRanuras24", nombre: "Ranuras 25-36 (mantener)", cfg: "ALTGR", boton: false },
  // Y las de interfaz, que NO son botones de juego.
  { clave: "hoja", nombre: "Hoja de personaje", cfg: "p", boton: false },
  { clave: "inventario", nombre: "Inventario", cfg: "i", boton: false },
  { clave: "opciones", nombre: "Opciones", cfg: "g", boton: false },
  { clave: "menu", nombre: "Menú principal", cfg: "ESCAPE", boton: false },
  { clave: "marcador", nombre: "Lista de jugadores", cfg: "TAB", boton: false },
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
  pulsada(accion) {
    const c = this.mapa[accion];
    if (c && this.pulsadas.has(c)) return true;
    for (const [codigo, clave] of Object.entries(ALIAS)) {
      // Un alias no vale si esa tecla se la ha quedado otra acción.
      if (clave === accion && this.pulsadas.has(codigo) && !Object.values(this.mapa).includes(codigo)) return true;
    }
    return false;
  }

  abajo(codigo) { this.pulsadas.add(codigo); }
  arriba(codigo) { this.pulsadas.delete(codigo); }
  soltarTodo() { this.pulsadas.clear(); }

  /**
   * Si hay algún BOTÓN DE JUEGO pulsado. `pev->button & ~IN_SCORE`.
   *
   * Es lo que la sesión usa para saber si un muerto quiere levantarse, y por
   * eso las acciones de interfaz están fuera: con ellas dentro, abrir el
   * inventario mientras estás muerto te resucita.
   */
  hayBotonDeJuego() { return BOTONES_DE_JUEGO.some((b) => this.pulsada(b)); }

  /** La intención de movimiento, en [−1, 1]. */
  intencion() {
    return {
      adelante: (this.pulsada("adelante") ? 1 : 0) - (this.pulsada("atras") ? 1 : 0),
      lado: (this.pulsada("derecha") ? 1 : 0) - (this.pulsada("izquierda") ? 1 : 0),
      saltar: this.pulsada("saltar"),
      agachar: this.pulsada("agachar"),
      correr: this.pulsada("correr"),
      // Atacar es un BOTÓN aguantado y no un pulso, porque el arma lo lee así:
      // `+attack1` mientras esté abajo y `-attack1` al soltarlo son dos ataques
      // distintos del mismo arma. Mandar sólo el flanco perdería el cargado.
      atacar: this.pulsada("atacar"),
      // Cubrirse con el escudo es el MISMO botón aguantado, pero el otro: el
      // objeto de la mano activa usa `IN_ATTACK` y el de la otra `IN_ATTACK2`
      // (`attack1` en el combo se traduce a uno o a otro, giattack.cpp:118), y un
      // escudo va siempre en la otra mano.
      cubrir: this.pulsada("atacar2"),
    };
  }
}

/** Un nombre legible para una tecla, para poder enseñarla en las opciones. */
export function nombreDeTecla(codigo) {
  if (!codigo) return "—";
  const m = {
    Space: "Espacio", ControlLeft: "Ctrl izq", ControlRight: "Ctrl der",
    ShiftLeft: "Mayús izq", ShiftRight: "Mayús der", AltLeft: "Alt", AltRight: "Alt Gr",
    Tab: "Tab", Enter: "Intro", Escape: "Esc", Backspace: "Retroceso",
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Mouse0: "Ratón izq", Mouse1: "Ratón centro", Mouse2: "Ratón der",
    Mouse3: "Ratón 4", Mouse4: "Ratón 5",
  };
  if (m[codigo]) return m[codigo];
  if (codigo.startsWith("Key")) return codigo.slice(3);
  if (codigo.startsWith("Digit")) return codigo.slice(5);
  if (codigo.startsWith("Numpad")) return `Num ${codigo.slice(6)}`;
  return codigo;
}
