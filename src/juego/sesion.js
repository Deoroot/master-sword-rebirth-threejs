// EL CICLO DE SESIÓN: llegas → ¿tienes personaje? → apareces → juegas → mueres
// → reapareces → al salir se guarda.
//
// ── Por qué esto es un módulo aparte, sin DOM y sin Three.js ───────────────
//
// Por la misma razón que `src/play/player.js` no importa Three.js: **esto
// tiene que correr igual en el navegador y en el servidor.** En Master Sword
// el servidor es la autoridad —los personajes viven en el servidor o en el
// maestro, nunca en el cliente— así que el día que haya servidor, el que
// decide si estás vivo es este mismo archivo, corriendo allí. Si aquí entra un
// `document` o un `THREE`, ese día hay que reescribirlo.
//
// Se comprueba entero en Node plano. Si eso deja de ser cierto, se ha perdido
// algo más que unas pruebas.
//
// ── El ciclo de MSR, leído y no supuesto ──────────────────────────────────
//
// Los estados son suyos y están en `server/player/player.h`:
//
//     charstate_e   CHARSTATE_UNLOADED / LOADING / LOADED
//     EMapStatus    UNDEFINED_MAP / FIRST_MAP / OLD_MAP / NEW_MAP / INVALID_MAP
//     m_JoinType    JN_STARTMAP / JN_TRAVEL / JN_VISITED / JN_ELITE
//
// Y la pieza que más cambia el diseño está en un comentario de `player.cpp`:
//
//     case JN_TRAVEL:  //Transitioned to new map OR DIED, and respawning at
//                      //last transition
//
// O sea que **al morir no vuelves a un punto de reaparición del mapa: vuelves
// a tu última transición.** Los once `ms_player_spawn` son el respaldo. En una
// demo de un solo mapa no hay transición a la que volver, así que la
// reaparición es el templo — pero el campo va aparte (`ultimaTransicion`) para
// que el día que haya un segundo mapa cambie un sitio y no diez.
//
// Y un personaje NUEVO no usa ninguno de los dos: usa `ms_player_begin`, y por
// eso hay mapas donde no se puede crear personaje —«Map must have a
// ms_player_begin in order for people to create characters there!»,
// `player.cpp:2558`—. Gate City y Edana son dos de ellos.

import { atributosDe, derivadas } from "./stats.js";
import { crearPersonaje, sellar } from "./personaje.js";

/** En qué punto del ciclo estamos. */
export const ESTADO = {
  /** Nada cargado. El estado con el que arranca la página. */
  FUERA: "fuera",
  /** Hay que elegir personaje o crear uno. `CHARSTATE_UNLOADED`. */
  ELIGIENDO: "eligiendo",
  /** Vivo y en el mapa. */
  JUGANDO: "jugando",
  /** `DEAD_DYING`: la animación de muerte. */
  MURIENDO: "muriendo",
  /** `DEAD_DEAD` / `DEAD_RESPAWNABLE`: esperando para volver. */
  MUERTO: "muerto",
};

/** Cómo se entra al mapa. `m_JoinType`. */
export const ENTRADA = {
  /** Personaje recién creado. Va a `ms_player_begin`. `JN_STARTMAP`. */
  NUEVO: "nuevo",
  /** Ya existía y vuelve. `JN_TRAVEL` sin transición. */
  VUELTA: "vuelta",
  /** Ha muerto. `JN_TRAVEL` con transición. */
  MUERTE: "muerte",
};

// ── Las constantes, todas con su sitio en el original ──────────────────────

/**
 * Lo que cuesta morir: el **1 %** del oro que llevas encima.
 *
 *     float DeathTax = 0.01;
 *     int TaxOut = m_Gold;  TaxOut *= DeathTax;  GiveGold(-TaxOut, false);
 *     — server/player/player.cpp, CBasePlayer::Killed()
 *
 * **Y el juego le dice al jugador que es el 5 %.** El aviso de primera muerte,
 * `scripts/help/first_death.script`, dice literalmente «When you die you lose
 * 5% of your gold!». El código cobra el 1 %. No es nuestro fallo y no se
 * «arregla» eligiendo uno: se copia el código, que es lo que de verdad pasa, y
 * se deja escrito que el texto del juego miente. Es el mismo tipo de hallazgo
 * que `gl_overbright 0` — no hay forma de deducirlo sin leer el original.
 */
export const IMPUESTO_DE_MUERTE = 0.01;

/**
 * Y lo que NO cuesta morir: los objetos.
 *
 *     //Lose all items
 *     m_fDropAllItems = false;
 *
 * El comentario dice una cosa y la línea hace la contraria. Alguien lo cambió
 * y dejó el comentario. Manda la línea: **no se suelta nada.**
 */
export const SUELTA_OBJETOS = false;

/**
 * Cada cuánto se guarda solo. `MSChar_Interface::AutoSave()`,
 * `server/sv_character.cpp:138`:
 *
 *     pPlayer->m_TimeNextSave = gpGlobals->time +
 *         (FNShared::IsEnabled() ? RANDOM_FLOAT(4.0f, 8.0f) : 3.0f);
 *
 * Tres segundos contra el disco del servidor; **entre cuatro y ocho, al azar,
 * cuando hay servidor maestro**. El azar no es pereza: si veinte jugadores
 * guardan con el mismo período, los veinte llaman al maestro en el mismo
 * instante para siempre. Es un desfase deliberado, y lo copiamos porque el día
 * que tengamos cuenta central tendremos el mismo problema.
 */
export const GUARDADO_LOCAL = 3.0;
export const GUARDADO_CENTRAL = [4.0, 8.0];

/**
 * Cuánto se espera muerto antes de volver solo.
 *
 *     !(g_pGameRules->IsMultiplayer() && forcerespawn.value > 0 &&
 *       (gpGlobals->time > (m_fDeadTime + 5)))
 *
 * Cinco segundos. Antes de eso se vuelve pulsando una tecla — pero sólo
 * después de SOLTARLAS todas (`if (fAnyButtonDown) return;`), que es lo que
 * impide reaparecer de golpe por venir apretando el ataque cuando te mataron.
 */
export const ESPERA_MUERTO = 5.0;

/** Lo que el juego anuncia a todo el mundo. `UTIL_ClientPrintAll(HUD_PRINTCENTER…)`. */
export const anuncioDeMuerte = (nombre) => `${nombre} has fallen!`;

/**
 * La sesión.
 *
 * Todo lo que depende del mundo exterior entra por el constructor —el reloj,
 * el azar, el almacén— para que las pruebas no necesiten ni tiempo real ni
 * suerte. `azar` existe sólo por el desfase del guardado central, y tener que
 * inyectarlo es lo que permite comprobar que el desfase está en su rango.
 */
export class Sesion {
  constructor({
    almacen,
    aparicion = null,
    catalogo = null,
    preparar = null,
    ahora = () => Date.now() / 1000,
    azar = Math.random,
    central = false,
  } = {}) {
    if (!almacen) throw new Error("una sesión necesita un almacén de personajes");
    this.almacen = almacen;
    this.aparicion = aparicion;
    this.catalogo = catalogo;
    /**
     * Lo que hay que tener listo ANTES de aparecer. Se espera en `entrar()`.
     *
     * Existe para poder hacer lo que hace el juego: **el mapa se carga
     * después de elegir personaje.** Hasta ahora cargábamos Gate City entero
     * y luego preguntábamos quién eres, que es al revés y además hace esperar
     * al jugador antes de poder tocar nada.
     *
     * Y no es sólo del cliente: el día que haya servidor, entrar a una
     * partida será exactamente esto — esperar a que el mapa esté cargado
     * antes de colocar a nadie en él.
     */
    this.preparar = preparar;
    this._ahora = ahora;
    this._azar = azar;
    this.central = central;

    this.estado = ESTADO.FUERA;
    this.personaje = null;
    this.entrada = null;
    /** Dónde reaparecerá. `m_SpawnTransition`: en MSR es la última transición. */
    this.ultimaTransicion = null;
    this.avisos = [];

    this._oyentes = new Map();
    this._proximoGuardado = 0;
    this._muertoDesde = 0;
    this._botonesSueltos = false;
    this._sucio = false;
    this._guardando = null;
  }

  // ── sucesos ──────────────────────────────────────────────────────────────

  /** Se suscribe a un suceso. Devuelve la función que lo quita. */
  al(evento, fn) {
    if (!this._oyentes.has(evento)) this._oyentes.set(evento, new Set());
    this._oyentes.get(evento).add(fn);
    return () => this._oyentes.get(evento)?.delete(fn);
  }

  _avisar(evento, datos = {}) {
    for (const fn of this._oyentes.get(evento) ?? []) {
      // Un oyente que revienta no puede tumbar la sesión: si la pantalla de
      // muerte tiene un fallo, el jugador se queda muerto para siempre.
      try { fn({ evento, sesion: this, ...datos }); } catch (e) { console.error(`oyente de '${evento}':`, e); }
    }
  }

  _ir(estado, datos = {}) {
    if (this.estado === estado) return;
    const antes = this.estado;
    this.estado = estado;
    this._avisar("estado", { antes, ahora: estado, ...datos });
  }

  // ── llegar ───────────────────────────────────────────────────────────────

  /**
   * Arranca: mira si hay personajes y deja la sesión pidiendo elegir.
   *
   * No entra solo ni en el caso de que haya uno único, y es a propósito: en
   * MSR el servidor te enseña la lista aunque tengas un personaje, porque
   * borrar el equivocado es peor que un clic de más.
   */
  async arrancar() {
    const lista = await this.almacen.listar();
    this._ir(ESTADO.ELIGIENDO, { personajes: lista });
    return { personajes: lista, hay: lista.length > 0 };
  }

  /** Crea un personaje y lo deja guardado, sin entrar. */
  async crear(datos) {
    const nuevoPersonaje = this.catalogo?.nuevoPersonaje ?? undefined;
    const p = crearPersonaje({ ...datos, nuevoPersonaje });
    // **Lo que devuelve el almacén puede no ser lo que se le dio**, y eso es del
    // experimento 27: con partida, el que pone el identificador es el servidor,
    // porque el personaje es suyo. `AlmacenLocal` devuelve el mismo documento y
    // aquí no cambia nada; `AlmacenRemoto` devuelve el id de allí, y sin esto la
    // pantalla intentaría entrar con un id que el servidor no conoce.
    const guardado = await this.almacen.escribir(p);
    const personaje = guardado?.id ? { ...p, ...guardado } : p;
    this._avisar("creado", { personaje });
    return personaje;
  }

  /**
   * Entra al mapa con un personaje.
   *
   * `entrada` decide dónde apareces, y eso es `m_JoinType`: un personaje que
   * nunca ha pisado este mapa nace en el punto de nacimiento; uno que vuelve,
   * donde lo dejó.
   */
  async entrar(id, { entrada = null } = {}) {
    const leido = await this.almacen.leer(id);
    if (!leido) throw new Error(`no hay ningún personaje con id ${id}`);
    // El mapa PRIMERO, y el personaje después. Si `preparar` falla, no se
    // entra: colocar a alguien en un mapa a medio cargar es peor que un
    // mensaje de error, porque se cae por el suelo sin que nada lo diga.
    if (this.preparar) {
      this._avisar("preparando", { id });
      await this.preparar();
    }
    this.personaje = leido.personaje;
    this.avisos = leido.avisos ?? [];
    // Un personaje que ya visitó este mapa vuelve; uno que no, nace. Es
    // `m_MapStatus`: FIRST_MAP contra OLD_MAP.
    const mapa = this.aparicion?.mapa ?? null;
    const visitado = mapa ? (this.personaje.mapasVisitados ?? []).includes(mapa) : false;
    this.entrada = entrada ?? (visitado ? ENTRADA.VUELTA : ENTRADA.NUEVO);
    if (mapa && !visitado) {
      this.personaje.mapasVisitados = [...(this.personaje.mapasVisitados ?? []), mapa];
      this._sucio = true;
    }
    this.personaje.mapa = mapa;
    // La vida y el maná se recortan a lo que dan sus habilidades AHORA. Un
    // documento viejo puede traer 200 de vida de cuando la fórmula era otra, y
    // aceptarlo tal cual es dejar entrar un personaje imposible.
    this._recortarVitales();
    this._botonesSueltos = false;
    this._programarGuardado();
    this._ir(ESTADO.JUGANDO, { personaje: this.personaje, entrada: this.entrada });
    this._avisar("aparece", { donde: this.donde, entrada: this.entrada });
    return this.personaje;
  }

  /** Los máximos de ahora mismo, derivados de las habilidades. */
  get limites() {
    if (!this.personaje) return null;
    return derivadas(atributosDe(this.personaje.habilidades));
  }

  _recortarVitales() {
    const d = this.limites;
    const p = this.personaje;
    p.vida = Math.max(0, Math.min(Number.isFinite(p.vida) ? p.vida : d.vidaMax, d.vidaMax));
    p.mana = Math.max(0, Math.min(Number.isFinite(p.mana) ? p.mana : d.manaMax, d.manaMax));
  }

  /**
   * Dónde aparece, según cómo entre.
   *
   * Los tres casos de `m_JoinType`, y el del medio es el que casi se me
   * escapa: al morir se vuelve a la última transición, no a un punto del mapa.
   */
  get donde() {
    const a = this.aparicion;
    if (!a) return null;
    if (this.entrada === ENTRADA.MUERTE) return this.ultimaTransicion ?? a.reaparicion ?? a.nacimiento;
    if (this.entrada === ENTRADA.VUELTA) return this.ultimaTransicion ?? a.reaparicion ?? a.nacimiento;
    return a.nacimiento;
  }

  // ── el reloj ─────────────────────────────────────────────────────────────

  /**
   * Un paso de reloj. Se llama desde el bucle de dibujo, o desde el bucle del
   * servidor, y hace dos cosas: guardar cada tanto y llevar la cuenta de la
   * muerte.
   *
   * `botonPulsado` es lo que en el motor es `pev->button`: hace falta para la
   * regla de «suelta todas las teclas antes de reaparecer».
   */
  tic({ botonPulsado = false } = {}) {
    const t = this._ahora();
    if (this.estado === ESTADO.JUGANDO) {
      if (t >= this._proximoGuardado) this.guardar();
      return;
    }
    if (this.estado === ESTADO.MURIENDO) {
      // La animación de muerte. Hoy dura cero porque todavía no dibujamos
      // ninguna: los `.mdl` traen su secuencia de morir y no la tocamos aún.
      this._ir(ESTADO.MUERTO);
      this._muertoDesde = t;
      return;
    }
    if (this.estado === ESTADO.MUERTO) {
      if (!botonPulsado) this._botonesSueltos = true;
      const forzado = t - this._muertoDesde >= ESPERA_MUERTO;
      if (forzado || (this._botonesSueltos && botonPulsado)) this.reaparecer();
    }
  }

  // ── daño y muerte ────────────────────────────────────────────────────────

  /**
   * Quita vida. Devuelve lo que ha quitado de verdad y si ha matado.
   *
   * Lo que CAUSA el daño no está aquí y no debería: es el paso 3. Esto es la
   * puerta por la que entrará, y existe ahora para que el ciclo se pueda
   * comprobar entero sin esperar al combate.
   */
  danar(cantidad, { porQue = "desconocido", deQuien = null, tipo = "monstruo" } = {}) {
    if (this.estado !== ESTADO.JUGANDO) return { quitado: 0, muerto: false };
    if (!(cantidad > 0)) return { quitado: 0, muerto: false };
    const antes = this.personaje.vida;
    const vida = Math.max(0, antes - cantidad);
    this.personaje.vida = vida;
    this._sucio = true;
    this._avisar("dano", { cantidad: antes - vida, vida, porQue, deQuien });
    if (vida <= 0) { this.matar({ porQue, deQuien, tipo }); return { quitado: antes, muerto: true }; }
    return { quitado: antes - vida, muerto: false };
  }

  /**
   * Muere. Cobra el impuesto y pasa a la animación de muerte.
   *
   * `tipo` es el `DeathType` del motor, y NO es cosmético: el impuesto sólo lo
   * cobra `KILLED_BY_MONSTER`. Morir de una trampa o por tu propia mano sale
   * gratis —«Thothie - removing XP penalty for being killed by trigger»— y hay
   * NPCs marcados con `NPC_NO_XP_PENALTY` que tampoco cobran.
   */
  matar({ porQue = "desconocido", deQuien = null, tipo = "monstruo", sinCastigo = false } = {}) {
    if (this.estado !== ESTADO.JUGANDO && this.estado !== ESTADO.MURIENDO) return null;
    const p = this.personaje;
    p.vida = 0;
    let impuesto = 0;
    if (tipo === "monstruo" && !sinCastigo) {
      // Entero, como el `int TaxOut` del motor: con menos de 100 de oro el
      // impuesto es CERO. Redondear al alza aquí cambiaría el juego para todo
      // el que empieza, que arranca con diez monedas.
      impuesto = Math.trunc(p.oro * IMPUESTO_DE_MUERTE);
      p.oro = Math.max(0, p.oro - impuesto);
    }
    this._sucio = true;
    this._ir(ESTADO.MURIENDO);
    this._avisar("muerte", {
      porQue, deQuien, tipo, impuesto,
      anuncio: anuncioDeMuerte(p.nombre),
      sueltaObjetos: SUELTA_OBJETOS,
    });
    // Se guarda al morir y no al reaparecer: si el navegador se cierra entre
    // las dos cosas, el personaje tiene que estar muerto y pagado, no vivo con
    // el oro intacto.
    this.guardar();
    return { impuesto };
  }

  /** Vuelve a la vida en el sitio que toque. */
  reaparecer() {
    if (this.estado !== ESTADO.MUERTO && this.estado !== ESTADO.MURIENDO) return null;
    const d = this.limites;
    this.personaje.vida = d.vidaMax;
    this.personaje.mana = d.manaMax;
    this.entrada = ENTRADA.MUERTE;
    this._sucio = true;
    this._botonesSueltos = false;
    this._programarGuardado();
    this._ir(ESTADO.JUGANDO);
    this._avisar("aparece", { donde: this.donde, entrada: this.entrada });
    this.guardar();
    return this.donde;
  }

  // ── guardar ──────────────────────────────────────────────────────────────

  _periodo() {
    if (!this.central) return GUARDADO_LOCAL;
    const [a, b] = GUARDADO_CENTRAL;
    return a + this._azar() * (b - a);
  }

  _programarGuardado() {
    this._proximoGuardado = this._ahora() + this._periodo();
  }

  /**
   * Guarda, si hay algo que guardar.
   *
   * No espera a que termine: el bucle de dibujo no puede bloquearse contra
   * IndexedDB. Y no encadena dos: si la anterior sigue en marcha, ésta se
   * salta, porque el estado que quería guardar lo guardará la siguiente.
   */
  guardar({ forzar = false } = {}) {
    if (!this.personaje) return null;
    this._programarGuardado();
    if (!this._sucio && !forzar) return null;
    if (this._guardando) return this._guardando;
    this._sucio = false;
    const doc = sellar(this.personaje);
    this._guardando = Promise.resolve(this.almacen.escribir(doc))
      .then((g) => { this._avisar("guardado", { personaje: g ?? doc }); return g ?? doc; })
      .catch((e) => {
        // Un guardado que falla y nadie ve es cómo se pierde un personaje.
        this._sucio = true;
        this._avisar("fallo", { que: "guardar", error: e });
        console.error("no se ha podido guardar el personaje:", e);
        return null;
      })
      .finally(() => { this._guardando = null; });
    return this._guardando;
  }

  /** Marca que hay cambios sin guardar. Lo llama quien toque el personaje. */
  tocado() { this._sucio = true; }

  /**
   * Sale: guarda a la fuerza y suelta el personaje.
   *
   * Se espera al guardado, y aquí sí: es el único momento en el que da igual
   * bloquear, y no hacerlo es perder la última partida.
   */
  async salir() {
    if (this.personaje) await this.guardar({ forzar: true });
    const p = this.personaje;
    this.personaje = null;
    this.entrada = null;
    this._ir(ESTADO.ELIGIENDO);
    this._avisar("salida", { personaje: p });
    return p;
  }
}

/**
 * Engancha la sesión al cierre de la pestaña.
 *
 * **`beforeunload` no vale y ésta es la trampa.** En el móvil no se dispara
 * casi nunca: el navegador mata la pestaña sin avisar. Lo que sí se dispara es
 * `visibilitychange` a `hidden` y `pagehide`, y por eso se usan los dos. Y
 * `guardar()` tiene que ser síncrono hasta soltar la escritura: una promesa que
 * empieza después de que la página se congele no termina nunca.
 *
 * Devuelve la función que lo desengancha.
 */
export function guardarAlCerrar(sesion, objetivo = globalThis) {
  const guarda = () => { if (sesion.personaje) sesion.guardar({ forzar: true }); };
  const visible = () => { if (objetivo.document?.visibilityState === "hidden") guarda(); };
  objetivo.addEventListener?.("pagehide", guarda);
  objetivo.addEventListener?.("visibilitychange", visible);
  return () => {
    objetivo.removeEventListener?.("pagehide", guarda);
    objetivo.removeEventListener?.("visibilitychange", visible);
  };
}
