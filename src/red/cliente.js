// EL CLIENTE DE RED: predecir, reconciliar e interpolar.
//
// Tres trabajos, y cada uno resuelve un problema distinto que la gente suele
// confundir en uno:
//
//   PREDECIR      andas al pulsar la tecla, sin esperar al servidor. Si no, en
//                 una conexión de 80 ms el mando va 80 ms por detrás de la mano
//                 y el juego se siente roto aunque la red esté perfecta.
//   RECONCILIAR   cuando la respuesta llega y no coincide con lo que
//                 predijiste, mandas tú al servidor y **se vuelven a correr las
//                 órdenes que él todavía no ha visto**. Sin ese repaso, cada
//                 corrección te tira hacia atrás lo que hayas andado desde
//                 entonces, y eso es el tirón de goma.
//   INTERPOLAR    a los demás los dibujas 100 ms en el pasado (`ex_interp`)
//                 entre dos fotos que ya tienes. Es el único de los tres que
//                 empeora a propósito lo que ves, y el único que no se puede
//                 quitar sin que los demás den saltos.
//
// La predicción no es una copia del servidor: es LA MISMA. `src/play/player.js`
// y `src/play/movimiento.js` no importan Three.js desde el experimento 03, y
// eso, que entonces era «para poder comprobarlo en Node», es lo que hoy permite
// que el navegador y el servidor corran el mismo paso de física. Si aquí
// hubiera una segunda física «parecida», la reconciliación corregiría cada
// fotograma y no habría forma de distinguir un fallo de red de esa diferencia.
//
// Sin DOM: se comprueba entero en Node, con dos partidas de mentira y sin
// socket.

import {
  RED, MENSAJE, empaquetar, abrir, orden as normalizarOrden, interpolacion, BOTON,
} from "./protocolo.js";
import { vitalesDe, correrOrden } from "./andar.js";
import { trabasDelCable, trabarIntencion } from "../play/trabas.js";
import { MAX_LETRAS } from "../play/chat.js";

/**
 * Cuánto se puede equivocar la predicción antes de corregirla, en metros.
 *
 * Es NUESTRO y no del motor: GoldSrc corrige siempre y deja que el suavizado
 * de la vista disimule (`cl_smoothtime`). Un umbral pequeño y una corrección
 * seca es más honesto para medir —la sonda puede contar correcciones— y un
 * milímetro es menos que el paso de la rejilla de colisión.
 */
export const UMBRAL_DE_CORRECCION = 0.001;

export class ClienteDeRed {
  /**
   * @param {{
   *   enlace: { enviar(texto): void, al(evento, fn): Function },
   *   cuerpo?: object, ahora?: () => number, red?: object,
   *   updaterate?: number, cmdrate?: number, cmdbackup?: number, exInterp?: number,
   * }} opciones
   */
  constructor({
    enlace, cuerpo = null, ahora = () => Date.now() / 1000, red = RED,
    updaterate = RED.updaterate, cmdrate = RED.cmdrate,
    cmdbackup = RED.cmdbackup, exInterp = RED.exInterp,
    simular = null,
  } = {}) {
    this.enlace = enlace;
    this.cuerpo = cuerpo;
    /**
     * Cómo se corre una orden. Lo pone quien sepa más: `src/main.js` pasa su
     * propio paso —con el agua, la escalera y la velocidad del personaje— para
     * que rehacer una orden sea exactamente lo que el bucle habría hecho.
     * Sin él, el paso reducido de abajo.
     */
    this.simular = simular;
    this._ahora = ahora;
    this.red = red;

    this.updaterate = Math.min(Math.max(updaterate, red.updaterateMin), red.updaterateMax);
    this.cmdrate = Math.min(Math.max(cmdrate, red.cmdrateMin), red.cmdrateMax);
    this.cmdbackup = Math.min(Math.max(cmdbackup, 0), red.cmdbackupMax);
    /** La ventana de interpolación, ya pasada por los topes del motor. */
    this.interp = interpolacion(exInterp, this.updaterate, red);

    this.yo = null;
    this.mapa = null;
    /** Quien está esperando un menú del servidor, o `null`. El 62. */
    this._menuPendiente = null;
    this.partida = null;
    this.ticrate = red.ticrate;
    this.personajes = [];
    this.personaje = null;
    this.dentro = false;
    /** La memoria del trote: la misma estructura que lleva el servidor. */
    this._andar = { corriendo: false, aguante: 0, rapidezAnterior: 0 };
    /** El catálogo de objetos, si lo hay: hace falta para el peso que cargas. */
    this.porId = null;

    /** Las órdenes que el servidor todavía no ha acusado. */
    this.pendientes = [];
    /** Dónde creímos estar al acabar cada una. Para poder comparar. */
    this.predicho = new Map();
    /**
     * EL 99: con qué velocidad se corrió cada orden pendiente la primera vez,
     * `{maxima, tope}` por `seq`. Ver `_correr`: es lo que en el motor viaja
     * DENTRO del `usercmd` y por eso la predicción lo rehace igual.
     */
    this.velocidades = new Map();
    this.seq = 0;
    this._msecSobrante = 0;
    this._proximoEnvio = 0;
    this.ultimaFoto = 0;

    /** Las fotos de los demás, por jugador, para interpolar. */
    this.ajenos = new Map();
    /**
     * Y las de los BICHOS, por bicho, del 28. Exactamente la misma cola y la
     * misma interpolación: para el cliente un goblin y otro jugador son la misma
     * cosa —algo que el servidor mueve y él dibuja 100 ms en el pasado—, y eso es
     * lo que hace que la mudanza no traiga un segundo mecanismo.
     */
    this.fauna = new Map();
    /** La vida y el estado que dice el servidor, que es el que manda. */
    this.vida = null;
    /** EL 98: las trabas que manda el servidor en la foto, o `null`. */
    this.trabas = null;
    this.estado = null;
    /** El reloj del servidor, estimado desde las fotos. */
    this.tServidor = 0;
    this._tLocalDeLaFoto = 0;

    // Contadores, que son lo que la sonda mira.
    this.correcciones = 0;
    this.errorMaximo = 0;
    this.errorUltimo = 0;
    this.fotosRecibidas = 0;
    this.ordenesEnviadas = 0;
    this.paquetes = 0;
    this.latencia = 0;

    this._oyentes = new Map();
    this._quitar = enlace?.al?.("mensaje", (texto) => this.recibir(texto));
  }

  al(evento, fn) {
    if (!this._oyentes.has(evento)) this._oyentes.set(evento, new Set());
    this._oyentes.get(evento).add(fn);
    return () => this._oyentes.get(evento)?.delete(fn);
  }

  _avisar(evento, datos) {
    for (const fn of this._oyentes.get(evento) ?? []) {
      try { fn(datos); } catch (e) { console.error(`oyente de '${evento}':`, e); }
    }
  }

  _mandar(tipo, cuerpo) { this.enlace?.enviar?.(empaquetar(tipo, cuerpo)); }

  // ── lo que llega ──────────────────────────────────────────────────────────

  recibir(texto) {
    const m = abrir(texto);
    if (!m) return null;
    switch (m.t) {
      case MENSAJE.BIENVENIDA:
        this.yo = m.tu;
        this.mapa = m.mapa;
        this.partida = m.partida;
        this.ticrate = m.ticrate ?? this.ticrate;
        this.tServidor = m.tiempo ?? 0;
        this._avisar("bienvenida", m);
        return m;
      case MENSAJE.LISTA:
        this.personajes = m.personajes ?? [];
        this._avisar("lista", m);
        return this.personajes;
      case MENSAJE.APARECES:
        this.personaje = m.personaje ?? null;
        this.dentro = true;
        this._avisar("apareces", m);
        return m;
      case MENSAJE.FOTO:
        return this._foto(m);
      case MENSAJE.PING:
        // El pong se devuelve tal cual y en el acto. Cualquier cosa que se haga
        // antes —dibujar, cargar— se suma a la latencia medida y el servidor
        // rebobina de más.
        this._mandar(MENSAJE.PONG, { t0: m.t0 });
        return null;
      case MENSAJE.FUERA:
        this.dentro = false;
        this._avisar("fuera", m);
        return m;
      case MENSAJE.FALLO:
        this._avisar("fallo", m);
        return m;
      // LO QUE ALGUIEN HA DICHO. El 61.
      //
      // No se filtra nada aquí: si el mensaje ha llegado es que el servidor ya
      // ha decidido que lo oyes. Volver a mirar la distancia en el cliente
      // sería mirarla con una foto vieja y borrar frases que sí te tocaban.
      case MENSAJE.TEXTO:
        // EL 62: por aquí viajan también los recados de los guiones, que no
        // son chat. Se distinguen por el canal, que en el cable es un byte y
        // aquí un número: los negativos no existen en `saytext_e`.
        //   -1  un `suceso` -> consola de sucesos, con su color
        //   -2  un `infomsg` -> la ventana de arriba a la izquierda
        if (m.tipo === -1) { this._avisar("suceso", m); return m; }
        if (m.tipo === -2) { this._avisar("aviso", m); return m; }
        this._avisar("texto", m);
        return m;
      case MENSAJE.OPCIONES: {
        // La respuesta a la F. Se entrega al que esté esperando y se suelta:
        // hay un menú abierto a la vez, que es `m_pCurrentMenu` del motor.
        const pendiente = this._menuPendiente;
        this._menuPendiente = null;
        pendiente?.({ nombre: m.nombre ?? "", opciones: m.opciones ?? [] });
        this._avisar("opciones", m);
        return m;
      }
      case MENSAJE.TIENDA:
        this._avisar("tienda", m);
        return m;
      // EL 93: el fundido y los iconos de estado de un efecto que corre en el
      // servidor. Se entregan tal cual: el reloj lo pone quien los dibuja, que
      // es lo que hace el motor (`cl.time` al leer el mensaje).
      case MENSAJE.PANTALLA:
        this.pantallas = (this.pantallas ?? 0) + 1;
        this._avisar("pantalla", m);
        return m;
      // El 63: lo que ha cambiado del personaje. Se FUNDE, no se sustituye: el
      // servidor manda los campos que ha tocado y el resto de la ficha —el
      // nombre, las habilidades, las manos— es el mismo de siempre.
      case MENSAJE.FICHA:
        if (this.personaje) {
          if (m.oro !== undefined) this.personaje.oro = m.oro;
          if (m.objetos !== undefined) this.personaje.objetos = m.objetos;
        }
        this._avisar("ficha", m);
        return m;
      default:
        return null;
    }
  }

  /**
   * Una foto. Dos cosas distintas: lo mío, que se reconcilia, y lo de los
   * demás, que se guarda para interpolar.
   */
  _foto(m) {
    this.fotosRecibidas++;
    this.ultimaFoto = m.seq;
    this.tServidor = m.tiempo;
    this._tLocalDeLaFoto = this._ahora();
    // EL 98: las trabas que el servidor le pone a ESTE jugador (su
    // `clientdata`: `iuser3` y `maxspeed`). Viajan en cada foto mientras las
    // hay, así que una foto sin ellas es «ya no hay». Ver src/play/trabas.js.
    this.trabas = m.trabas ?? null;

    for (const e of m.jugadores ?? []) {
      if (e.id === this.yo) { this._vitalesDe(e); this._reconciliar(m, e); continue; }
      let cola = this.ajenos.get(e.id);
      if (!cola) { cola = []; this.ajenos.set(e.id, cola); }
      cola.push({ t: m.tiempo, ...e });
      // Con `ex_interp` de 0,1 s y 20 fotos por segundo hacen falta tres para
      // poder interpolar; se guardan las de un segundo largo y se tira el
      // resto. Guardarlas todas es una fuga de memoria con forma de partida
      // larga.
      while (cola.length > 2 && m.tiempo - cola[0].t > 1) cola.shift();
    }
    for (const id of m.fuera ?? []) this.ajenos.delete(id);

    // LOS BICHOS, en su propia cola y con la misma regla. Los que no vienen es
    // que no han cambiado: la cola guarda su última muestra y la interpolación
    // se queda en ella, que es lo correcto para los 16 que están clavados.
    for (const e of m.bichos ?? []) {
      let cola = this.fauna.get(e.id);
      if (!cola) { cola = []; this.fauna.set(e.id, cola); }
      cola.push({ t: m.tiempo, ...e });
      while (cola.length > 2 && m.tiempo - cola[0].t > 1) cola.shift();
    }
    if (m.sucesos?.length) for (const s of m.sucesos) this._avisar("suceso", s);

    this._avisar("foto", m);
    return m;
  }

  /**
   * **LA VIDA LA DICE EL SERVIDOR**, y desde el 28 hace falta de verdad.
   *
   * Hasta ahora la vida bajaba en el navegador porque el monstruo que pegaba
   * también estaba en el navegador. Ahora el que pega es el del servidor, y el
   * que lleva la cuenta es su `Sesion` — la misma que se guarda en su disco.
   *
   * Así que aquí no se resta nada: se compara y se avisa. Restarla también en el
   * cliente sería contar el mismo golpe dos veces, y eso no daría error — daría
   * un personaje que muere el doble de rápido que el que el servidor guarda.
   */
  _vitalesDe(mio) {
    if (mio.vida === undefined && mio.estado === undefined) return null;
    const cambio = mio.vida !== this.vida || mio.estado !== this.estado;
    if (!cambio) return null;
    const antes = { vida: this.vida, estado: this.estado };
    this.vida = mio.vida ?? null;
    this.estado = mio.estado ?? null;
    // El primero no es un cambio: es enterarse de lo que hay. Sin esta guarda,
    // entrar al mapa dispararía un «te han hecho daño» de la vida entera.
    if (antes.vida === null && antes.estado === null) return null;
    this._avisar("vitales", { vida: this.vida, estado: this.estado, antes });
    return { vida: this.vida, estado: this.estado };
  }

  /**
   * **La reconciliación**, que es el corazón de esto.
   *
   * Lo que llega es «al terminar tu orden número N estabas aquí». Nosotros
   * apuntamos dónde creíamos estar al terminar esa misma orden N. Si no
   * coinciden:
   *
   *   1. se tiran las órdenes que el servidor ya ha visto (hasta N);
   *   2. se pone el cuerpo donde dice el servidor — él manda;
   *   3. **se vuelven a correr las órdenes de N+1 en adelante**, que son las
   *      que él todavía no ha recibido.
   *
   * El paso 3 es el que casi todo el mundo se deja, y sin él la corrección no
   * se ve como una corrección: se ve como que el juego te arrastra hacia atrás
   * cada pocos fotogramas, porque cada foto te devuelve a un pasado del que ya
   * habías andado.
   */
  _reconciliar(foto, mio) {
    const ack = foto.ack ?? 0;
    const antes = this.pendientes.length;
    this.pendientes = this.pendientes.filter((o) => o.seq > ack);
    for (const [seq] of this.velocidades) if (seq <= ack) this.velocidades.delete(seq);
    for (const [seq] of this.predicho) if (seq <= ack - this.red.historia) this.predicho.delete(seq);

    const creido = this.predicho.get(ack);
    if (creido) {
      this.errorUltimo = distancia(creido, mio.pies);
      this.errorMaximo = Math.max(this.errorMaximo, this.errorUltimo);
    }
    if (!this.cuerpo?.colocar) return { ack, corregido: false, tiradas: antes - this.pendientes.length };
    if (creido && this.errorUltimo <= UMBRAL_DE_CORRECCION) {
      return { ack, corregido: false, tiradas: antes - this.pendientes.length };
    }

    this.correcciones++;
    // Y se restaura **la velocidad y el apoyo**, no sólo el sitio.
    //
    // Esto costó los 18 centímetros de deriva que la prueba cazó. `colocar` sin
    // más deja la velocidad que el cliente tenía AHORA y el `grounded` de
    // ahora, así que rehacer las órdenes desde el estado del servidor las
    // rehacía con otra velocidad: la posición se corregía y la deriva volvía a
    // crecer en el mismo fotograma. El motor manda las dos cosas en el
    // `clientdata_t` justo para esto, y no por curiosidad.
    this.cuerpo.colocar(mio.pies, { velocidad: mio.vel ?? null });
    if (typeof mio.suelo === "boolean") this.cuerpo.grounded = mio.suelo;
    // Y las que él no ha visto se vuelven a correr, en orden. El resultado es
    // el sitio donde estaríamos si el servidor ya las hubiera recibido todas.
    for (const o of this.pendientes) {
      this._correr(o, { rehacer: true });
      this.predicho.set(o.seq, [...this.cuerpo.feet]);
    }
    return { ack, corregido: true, rehechas: this.pendientes.length };
  }

  // ── lo que se manda ───────────────────────────────────────────────────────

  /**
   * Un fotograma: se convierte lo pulsado en una orden, se predice, y se manda
   * si toca.
   *
   * `dt` en segundos. El `msec` de la orden es un byte y va en milisegundos
   * ENTEROS, así que lo que se pierde al redondear se guarda para el siguiente
   * — sin eso, a 60 fotogramas por segundo se pierden 0,67 ms por fotograma, o
   * sea **un 4 % de velocidad** que nadie ve y que hace que el cliente y el
   * servidor se separen despacio para siempre.
   */
  paso(dt, entrada = {}) {
    if (!this.dentro) return null;
    const msec = this.msecDe(dt);
    if (msec <= 0) return null;
    return this.apuntar({ ...entrada, msec }, { correr: true });
  }

  /**
   * Los milisegundos ENTEROS que le tocan a este `dt`, guardando el resto.
   *
   * `msec` es un byte y va en milisegundos, así que a 60 fotogramas por segundo
   * cada paso son 16,67 y se redondea a 16. Sin guardar los 0,67 se pierde **un
   * 4 % del tiempo simulado**, que no da error y hace que el cliente y el
   * servidor se separen despacio para siempre.
   */
  msecDe(dt) {
    this._msecSobrante += Math.max(0, dt) * 1000;
    const msec = Math.floor(this._msecSobrante);
    this._msecSobrante -= msec;
    return msec;
  }

  /**
   * Apunta una orden que **el bucle del juego ya ha corrido**.
   *
   * Existe porque el bucle de `src/main.js` no es una tontería: pregunta el
   * nivel de agua y la escalera en cada paso, saca la velocidad máxima del
   * personaje y cobra aguante. Hacer que la red lo repita sería tener dos
   * verdades sobre cómo se anda, que es el fallo que este archivo entero viene
   * a evitar. Así que el bucle mueve, y esto apunta lo que se pulsó para
   * mandarlo y para poder rehacerlo si el servidor corrige.
   *
   * `correr: true` es el otro camino —el de las pruebas y el del cliente de
   * Node— donde no hay bucle y la red mueve ella.
   *
   * EL 99: `velocidad` es `{maxima, tope}`, con lo que el bucle CORRIÓ esta
   * orden. Se guarda para rehacerla igual si el servidor corrige (`_correr`).
   */
  apuntar(entrada = {}, { correr = false, velocidad = null } = {}) {
    if (!this.dentro) return null;
    const o = normalizarOrden({
      ...entrada,
      seq: ++this.seq,
      lerpMsec: Math.round(this.interp * 1000),
    });
    if (velocidad) this.velocidades.set(o.seq, { maxima: velocidad.maxima, tope: velocidad.tope ?? Infinity });
    if (correr) this._correr(o);
    this.pendientes.push(o);
    this.predicho.set(o.seq, this.cuerpo ? [...this.cuerpo.feet] : null);
    const t = this._ahora();
    if (t >= this._proximoEnvio) {
      this._proximoEnvio = t + 1 / this.cmdrate;
      this.enviar();
    }
    return o;
  }

  /**
   * Manda las últimas órdenes: la nueva y las `cl_cmdbackup` anteriores.
   *
   * Repetir lo ya mandado es el seguro contra la pérdida de paquetes, y es
   * barato: once órdenes son unos cientos de bytes. Lo que no se hace es pedir
   * retransmisión — para cuando llegara, ya no serviría.
   */
  enviar() {
    if (!this.pendientes.length) return 0;
    const cuantas = Math.min(this.pendientes.length, this.cmdbackup + 1);
    const lote = this.pendientes.slice(-cuantas);
    this._mandar(MENSAJE.ORDENES, {
      ordenes: lote,
      foto: this.ultimaFoto,          // `delta_sequence`: qué foto tengo
      lerpMsec: Math.round(this.interp * 1000),
    });
    this.paquetes++;
    this.ordenesEnviadas += lote.length;
    return lote.length;
  }

  /**
   * Correr una orden en el cuerpo que predice.
   *
   * ── EL 99: LA VELOCIDAD VA CON LA ORDEN ────────────────────────────────
   *
   * En el motor la velocidad del personaje viaja DENTRO del `usercmd`: el
   * cliente de Master Sword calcula `fSpeed` (`CheckSpeed`, clplayer.cpp:
   * 306-316) y lo escribe en `cl_forwardspeed`, y `CL_CreateMove` lo mete en
   * `cmd->forwardmove` (input.cpp:795-796). Así que cuando la predicción
   * rehace las órdenes que el servidor no ha visto, las rehace con la
   * velocidad con que se crearon, sin volver a preguntar nada.
   *
   * Aquí la orden lleva la intención en [-1, 1] (el servidor recalcula la
   * velocidad: es la autoridad, `orden()` en protocolo.js), y lo que se perdía
   * era eso: `src/main.js` rehacía con `o.maxima`, que ninguna orden trae, así
   * que caía en el `maxima` del cuerpo —160, la del perfil, la de alguien sin
   * nada—. Con un personaje que anda a 184 cada corrección rehacía a 160, eso
   * abría un error nuevo y la siguiente foto volvía a corregir: 73
   * correcciones en 3 s y la predicción a 160 (sonda red99). Ahora la
   * velocidad de cada orden se GUARDA al correrla (`velocidades`) y se
   * reutiliza al rehacerla (`rehacer`).
   *
   * Sin `simular` (el cliente de Node), la velocidad sale de `correrOrden`, la
   * misma cuenta que `Partida._simular`: el personaje, el aguante y las trabas
   * que trae la foto.
   */
  _correr(o, { rehacer = false } = {}) {
    if (!this.cuerpo) return;
    const guardada = this.velocidades.get(o.seq) ?? null;
    if (this.simular) { this.simular(this.cuerpo, o, guardada); return; }
    const dt = o.msec / 1000;
    this.cuerpo.yaw = o.yaw;
    this.cuerpo.pitch = o.cabeceo;
    const trabas = this.trabas ? trabasDelCable(this.trabas) : null;
    let q, v;
    if (rehacer && guardada) {
      // Rehacer no cobra aguante otra vez: la orden ya se cobró al crearse.
      q = trabarIntencion({
        adelante: o.adelante, lado: o.lado,
        saltar: (o.botones & BOTON.SALTAR) !== 0, agachar: (o.botones & BOTON.AGACHAR) !== 0,
      }, trabas);
      v = guardada;
    } else {
      const r = correrOrden(this._andar, o, {
        dt, vitales: vitalesDe(this.personaje, this.porId), rapidez: this.cuerpo.rapidez ?? 0, trabas,
      });
      q = r.q;
      v = { maxima: r.maxima, tope: r.tope };
      this.velocidades.set(o.seq, v);
    }
    this.maxima = v.maxima;
    this.cuerpo.step(dt, {
      forward: q.adelante,
      strafe: q.lado,
      jump: Boolean(q.saltar),
      agachar: Boolean(q.agachar),
      maxima: v.maxima,
      tope: v.tope,
    });
  }

  // ── los demás ─────────────────────────────────────────────────────────────

  /**
   * Dónde dibujar a los demás AHORA: `ex_interp` segundos en el pasado.
   *
   * El instante es el del servidor, estimado como «la última foto más lo que ha
   * pasado en mi reloj desde que llegó», menos la ventana. Estimarlo con el
   * reloj local y no con el del servidor es lo correcto: entre dos fotos hay
   * 50 ms y hay que dibujar tres fotogramas, así que el tiempo tiene que correr
   * también cuando no llega nada.
   *
   * Si la foto siguiente no ha llegado —un tirón—, **se queda en la última
   * conocida y no extrapola**. Extrapolar es adivinar, y cuando se falla el
   * otro jugador aparece dentro de una pared.
   */
  interpolados(ahora = this._ahora()) {
    const t = this.tServidor + (ahora - this._tLocalDeLaFoto) - this.interp;
    const fuera = new Map();
    for (const [id, cola] of this.ajenos) {
      if (!cola.length) continue;
      if (t <= cola[0].t) { fuera.set(id, { ...cola[0], interpolado: false }); continue; }
      const ultimo = cola[cola.length - 1];
      if (t >= ultimo.t) { fuera.set(id, { ...ultimo, interpolado: false }); continue; }
      let i = cola.length - 1;
      while (i > 0 && cola[i - 1].t > t) i--;
      const a = cola[i - 1];
      const b = cola[i];
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      fuera.set(id, {
        ...b,
        pies: [0, 1, 2].map((k) => a.pies[k] + (b.pies[k] - a.pies[k]) * f),
        yaw: anguloEntre(a.yaw, b.yaw, f),
        interpolado: true,
      });
    }
    return fuera;
  }

  /**
   * Y LOS BICHOS, dónde dibujarlos ahora. Del 28.
   *
   * Devuelve la lista tal y como la consume `Manada.aplicar`, o sea con los
   * nombres del cable. La posición se interpola; la ANIMACIÓN no, y se toma de
   * la muestra más nueva del par: interpolar una animación no significa nada
   * —entre `walk` y `die` no hay medio camino— y retrasarla otros 50 ms haría
   * que un goblin se cayera muerto medio segundo después de dejar de moverse.
   */
  bichosInterpolados(ahora = this._ahora()) {
    const t = this.tServidor + (ahora - this._tLocalDeLaFoto) - this.interp;
    const fuera = [];
    for (const [id, cola] of this.fauna) {
      if (!cola.length) continue;
      const ultimo = cola[cola.length - 1];
      if (t <= cola[0].t) { fuera.push(cola[0]); continue; }
      if (t >= ultimo.t) { fuera.push(ultimo); continue; }
      let i = cola.length - 1;
      while (i > 0 && cola[i - 1].t > t) i--;
      const a = cola[i - 1];
      const b = cola[i];
      const span = b.t - a.t;
      const f = span > 0 ? (t - a.t) / span : 0;
      fuera.push({
        ...b,
        id,
        p: [0, 1, 2].map((k) => a.p[k] + (b.p[k] - a.p[k]) * f),
        y: anguloEntre(a.y, b.y, f),
      });
    }
    return fuera;
  }

  /**
   * PEGARLE A UN BICHO: se pide, no se hace.
   *
   * El cliente dice a quién ha blandido y con qué; quien resta la vida, tira el
   * parry y decide si muere es el servidor. Lo que llega de vuelta viene en los
   * sucesos de la foto, y por eso el navegador no puede adelantarse a pintar la
   * muerte: la vería antes de que ocurriera, y a veces no ocurriría.
   */
  pegar({ id, dano, alcance = 0, cubo = null, tipo = "" }) {
    this._mandar(MENSAJE.PEGAR, { id, dano, alcance, cubo, tipo });
  }

  /**
   * HABLAR: el canal y lo escrito, y nada más.
   *
   *     ServerCmd(UTIL_VarArgs("say_text %i %s", m_Type, ...));
   *                                              vgui_startsaytext.h:55
   *
   * Ni el nombre ni la frase montada: las pone el servidor. Aquí se corta a
   * `MAX_LETRAS` porque el cajetín también lo hace, y se manda igual aunque
   * esté vacío — quien decide que una frase vacía no se dice es `Speak`, y
   * ponerlo en dos sitios es cómo dejan de estar de acuerdo.
   */
  /**
   * LA F: pedirle el menú a un NPC, y esperar. El 62.
   *
   * Devuelve una promesa porque en el mod esto **es** una ida y vuelta: el
   * cliente no tiene el guion, lo tiene el servidor. Si el servidor no
   * contesta en dos segundos se devuelve un menú vacío en vez de dejar la F
   * colgada — un panel que no abre se ve; una promesa que no resuelve, no.
   */
  pedirMenu(id) {
    this._menuPendiente?.({ nombre: "", opciones: [] });   // el anterior, si quedaba
    return new Promise((ok) => {
      const reloj = setTimeout(() => {
        if (this._menuPendiente === resolver) this._menuPendiente = null;
        ok({ nombre: "", opciones: [] });
      }, 2000);
      const resolver = (r) => { clearTimeout(reloj); ok(r); };
      this._menuPendiente = resolver;
      this._mandar(MENSAJE.PEDIRMENU, { id });
    });
  }

  /** `menuselect N`. `indice` a `null` es cancelar. */
  elegirMenu(id, indice) { this._mandar(MENSAJE.ELIGEMENU, { id, indice }); }

  /** `trade buy|sell <id>`. Lo que cuesta y lo que queda lo sabe el servidor. */
  /** EL 96: `inv transfer <id> 0`. Ver `MENSAJE.EMPUNAR`. */
  empunar(id) { this._mandar(MENSAJE.EMPUNAR, { id: id ?? null }); }
  /**
   * EL 97: lo mismo a la mano IZQUIERDA, que es donde va un escudo
   * (`manos.izquierda`). El servidor lo necesita para la defensa: sin él no
   * sabe que llevas escudo y no bloquea nada. Ver `Partida._empunar`.
   */
  embrazar(id) { this._mandar(MENSAJE.EMPUNAR, { id: id ?? null, mano: "izquierda" }); }
  /** EL 97: se puso (`true`) o se quitó (`false`) una pieza. Ver `MENSAJE.VESTIR`. */
  vestir(id, puesto) { this._mandar(MENSAJE.VESTIR, { id: String(id ?? ""), puesto: Boolean(puesto) }); }
  /**
   * EL 97: la `c` con servidor. Ver `MENSAJE.SOLTAR`. Se llama `soltarArma` y no
   * `soltar` porque `soltar()` YA EXISTE más abajo y es otra cosa —desengancharse
   * del socket—: con el mismo nombre la segunda pisaba a la primera, y la `c` de
   * la primera pasada de la sonda del 97 DESCONECTABA al jugador en silencio.
   */
  soltarArma(id, desde = null) {
    // EL 98: `desde: "mochila"` es «Drop Selected» (`drop <id>` con el objeto en
    // un contenedor). Sin él, lo de la mano, como en el 97.
    this._mandar(MENSAJE.SOLTAR, desde ? { id: String(id ?? ""), desde: String(desde) } : { id: String(id ?? "") });
  }
  trade(que, { quien, tienda, id, flags = 0, vendedor = "" } = {}) {
    this._mandar(MENSAJE.TRADE, { que, quien, tienda, id, flags, vendedor });
  }

  decir(tipo, texto) {
    this._mandar(MENSAJE.DECIR, { tipo, texto: String(texto ?? "").slice(0, MAX_LETRAS) });
  }

  // ── el personaje, que vive allí ──────────────────────────────────────────

  hola({ nombre = null } = {}) {
    this._mandar(MENSAJE.HOLA, {
      nombre, updaterate: this.updaterate, cmdrate: this.cmdrate,
      cmdbackup: this.cmdbackup, exInterp: this.interp,
    });
  }

  pedirPersonajes() { this._mandar(MENSAJE.PERSONAJES, {}); }
  crear(personaje) { this._mandar(MENSAJE.CREAR, { personaje }); }
  elegir(id) { this._mandar(MENSAJE.ELEGIR, { id }); }
  borrar(id) { this._mandar(MENSAJE.BORRAR, { id }); }
  adios() { this._mandar(MENSAJE.ADIOS, {}); }

  soltar() { this._quitar?.(); }
}

/**
 * El almacén remoto: las mismas cuatro operaciones, al otro lado del cable.
 *
 * Esto es la frase del §5 de PROYECTO_10.md cumplida — «el almacén local pasa a
 * ser una CACHÉ, no la verdad; la interfaz de cuatro operaciones ya está
 * preparada: se escribe `AlmacenRemoto` y el juego no se entera»— y es verdad:
 * la pantalla de personajes del experimento 11 no cambia ni una línea.
 *
 * Con una diferencia que hay que decir en voz alta y no esconder:
 * **`escribir()` no escribe nada.** En una partida con servidor el que guarda
 * es el servidor, cada tres segundos y al desconectar. Si esta función mandara
 * el personaje, el cliente podría mandar uno con Swordsmanship a 100, que es
 * exactamente lo que el paso 4 viene a impedir. Devuelve el documento sellado
 * para que el código de arriba siga funcionando igual, y ahí se queda.
 */
export class AlmacenRemoto {
  constructor(cliente, { espera = 8000 } = {}) {
    this.cliente = cliente;
    this.espera = espera;
    /** Los que el servidor ya tiene. Lo que no está aquí hay que crearlo. */
    this.conocidos = new Set();
    cliente.al("lista", (m) => { for (const p of m.personajes ?? []) this.conocidos.add(p.id); });
  }

  _esperar(evento, comprueba = () => true) {
    return new Promise((ok, mal) => {
      const reloj = setTimeout(() => { quitar(); mal(new Error(`el servidor no contestó a '${evento}'`)); }, this.espera);
      const quitar = this.cliente.al(evento, (datos) => {
        if (!comprueba(datos)) return;
        clearTimeout(reloj);
        quitar();
        ok(datos);
      });
    });
  }

  constructorDeAyuda() { /* nada: está aquí para no confundir con `constructor` */ }

  async listar() {
    const espera = this._esperar("lista");
    this.cliente.pedirPersonajes();
    const m = await espera;
    for (const p of m.personajes ?? []) this.conocidos.add(p.id);
    return m.personajes ?? [];
  }

  /**
   * Leer es ENTRAR, y esto merece la nota.
   *
   * En el almacén local leer un personaje no tiene consecuencias. Aquí sí: el
   * servidor lo carga, le da un cuerpo y lo pone en el mapa, porque un
   * personaje leído por un cliente que no va a jugarlo no tiene sentido y
   * mandárselo «para mirar» es regalar los datos de la cuenta de otro.
   */
  async leer(id) {
    const p = this._esperar("apareces");
    this.cliente.elegir(id);
    const m = await p;
    return m?.personaje ? { personaje: m.personaje, avisos: [] } : null;
  }

  /**
   * Escribir, que son DOS cosas distintas y por eso no es un `no-op` a secas.
   *
   *   - **un personaje que el servidor no conoce** es una CREACIÓN, y se manda
   *     como lo que es: un nombre, un género y un arma. El servidor construye
   *     el personaje con `crearPersonaje()` y **le pone el id**, así que lo que
   *     se devuelve lleva el id de allí y no el que se había hecho aquí.
   *   - **uno que ya existe** es el autoguardado del bucle, y **no se manda**:
   *     el que guarda es el servidor, cada tres segundos y al desconectar. Si
   *     esto mandara el personaje, el cliente podría escribirse las
   *     estadísticas — que es justo lo que el paso 4 viene a cerrar.
   */
  async escribir(p) {
    if (!p?.id || this.conocidos.has(p.id)) return p;
    const espera = this._esperar("lista", (m) => Boolean(m.creado));
    this.cliente.crear({ nombre: p.nombre, genero: p.genero, arma: p.manos?.derecha ?? null });
    const m = await espera;
    this.conocidos.add(m.creado);
    // El mismo personaje con el id del servidor. Lo que valga de verdad vendrá
    // en `apareces`, que es cuando él lo carga de su disco.
    return { ...p, id: m.creado };
  }

  async borrar(id) {
    const p = this._esperar("lista");
    this.cliente.borrar(id);
    await p;
  }

  async pedirPermanencia() { return { soportado: false, concedido: false, remoto: true }; }
}

const distancia = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : 0);

/** Interpolar ángulos por el lado corto: sin esto, girar de 179° a −179° da una vuelta entera. */
function anguloEntre(a, b, f) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * f;
}
