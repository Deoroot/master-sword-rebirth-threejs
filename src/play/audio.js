// EL MOTOR DE SONIDO. Web Audio, y aquí manda el navegador.
//
// Separado de `sonido.js` a propósito: allí está la REGLA de cuándo suena un
// paso, que se prueba en `node --test`; aquí está la reproducción, que necesita
// un navegador y se prueba mirando si el `AudioContext` está vivo y cuántas
// fuentes ha arrancado.
//
// ── Lo que impone el navegador y no el juego ───────────────────────────────
//
// 1. **Un `AudioContext` nace suspendido** y ningún navegador lo deja sonar sin
//    un gesto del usuario. No es un permiso que se pida: es que `resume()` sólo
//    funciona dentro del manejador de un clic o una tecla. Por eso hay
//    `despertar()` y por eso se llama desde el primer clic del menú. Sin esto
//    el sonido «no funciona» sin un solo error en la consola.
//
// 2. **Un `AudioBufferSourceNode` se usa UNA VEZ.** No hay `stop()` y volver a
//    `start()`: cada paso es un nodo nuevo. Reusar uno tira `InvalidStateError`
//    al segundo paso, o sea que sonaría el primero y ya.
//
// 3. Los `.wav` del mod son de 11 025 y 22 050 Hz y 8 bits. `decodeAudioData`
//    los remuestrea solo, pero **consume el ArrayBuffer**: hay que pasarle una
//    copia si se piensa volver a usarlo.
//
// ── Y lo que sí es del juego ───────────────────────────────────────────────
//
// La atenuación de GoldSrc no es la de Web Audio. `ATTN_NORM` es 0.8, y el
// motor apaga el sonido a `1000 / attn` unidades. Con el modelo `inverse` de
// un `PannerNode` y `refDistance` a un metro sale una curva parecida y el
// corte se pone con `maxDistance`, que es lo que hace que una antorcha no se
// oiga desde el otro lado del pueblo.

const ATTN_NORM = 0.8;
/** Unidades a las que se apaga un sonido normal, de `SND_RADIUS`. */
export const ALCANCE = 1000 / ATTN_NORM;

/** Segundos del fundido de la música. Un corte seco se oye como un fallo. */
export const FUNDIDO = 1.5;

export class Audio {
  constructor({ base = "build/gatecity", unidadesPorMetro = 39.37 } = {}) {
    this.base = base;
    this.U = unidadesPorMetro;
    this.ctx = null;
    this.buffers = new Map();
    this.catalogo = null;
    this.sonando = new Map();   // música por canal
    this.arrancadas = 0;        // para la sonda: cuántas fuentes se han lanzado
    this.fallos = [];
  }

  /** El catálogo se puede cargar sin gesto; sólo decodificar necesita contexto. */
  async cargar() {
    const r = await fetch(`${this.base}/sonido.json`);
    if (!r.ok) { this.fallos.push("sin sonido.json: ¿falta `npm run sonido`?"); return null; }
    this.catalogo = await r.json();
    return this.catalogo;
  }

  /**
   * Despierta el contexto. **Tiene que llamarse desde un gesto del usuario.**
   * Devuelve `true` si a partir de ahora puede sonar.
   */
  async despertar() {
    if (!this.ctx) {
      const C = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!C) { this.fallos.push("este navegador no trae Web Audio"); return false; }
      this.ctx = new C();
      this.maestro = this.ctx.createGain();
      this.maestro.connect(this.ctx.destination);
      this.canalMusica = this.ctx.createGain();
      this.canalMusica.connect(this.maestro);
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx.state === "running";
  }

  get despierto() { return this.ctx?.state === "running"; }

  /** Descarga y decodifica, una vez por archivo. */
  async pedir(archivo) {
    if (!archivo) return null;
    if (this.buffers.has(archivo)) return this.buffers.get(archivo);
    if (!this.ctx) return null;
    const p = (async () => {
      const r = await fetch(`${this.base}/${archivo}`);
      if (!r.ok) { this.fallos.push(`no está ${archivo}`); return null; }
      // «¿Ha dado 200?» NO basta, y esto lo enseñó la sonda: el servidor de
      // desarrollo devuelve `index.html` con estado 200 para lo que no existe,
      // así que un archivo que falta llega como una página web y el único que
      // se entera es el decodificador. Mirar el tipo lo dice antes y lo dice
      // bien.
      const tipo = r.headers.get("content-type") ?? "";
      if (/html|json/i.test(tipo)) {
        this.fallos.push(`no está ${archivo} (el servidor devolvió ${tipo})`);
        return null;
      }
      try {
        return await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch (e) {
        // Un wav que no decodifica no se traga en silencio: se apunta. Los del
        // mod son PCM de 8 bits, que algún navegador viejo rechaza.
        this.fallos.push(`${archivo} no decodifica: ${e.message}`);
        return null;
      }
    })();
    this.buffers.set(archivo, p);
    return p;
  }

  /**
   * Suena una vez. `donde` en metros de escena, o `null` para que suene plano
   * (los pasos del propio jugador son suyos y no vienen de ningún sitio).
   */
  async unaVez(archivo, { volumen = 1, donde = null, tono = 1, radio = null } = {}) {
    const buf = await this.pedir(archivo);
    if (!buf || !this.despierto) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = tono;
    const g = this.ctx.createGain();
    g.gain.value = volumen;
    if (donde) {
      const p = this.ctx.createPanner();
      p.distanceModel = "inverse";
      p.refDistance = 1;
      p.maxDistance = radio ?? ALCANCE / this.U;
      p.positionX.value = donde[0]; p.positionY.value = donde[1]; p.positionZ.value = donde[2];
      src.connect(g); g.connect(p); p.connect(this.maestro);
    } else {
      src.connect(g); g.connect(this.maestro);
    }
    src.start();
    this.arrancadas++;
    return src;
  }

  /** Un sonido de ambiente: en bucle, en su sitio, y se queda. */
  async bucle(archivo, { volumen = 1, donde = null, tono = 1, radio = null } = {}) {
    const buf = await this.pedir(archivo);
    if (!buf || !this.despierto) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true; src.playbackRate.value = tono;
    const g = this.ctx.createGain(); g.gain.value = volumen;
    if (donde) {
      const p = this.ctx.createPanner();
      p.distanceModel = "inverse"; p.refDistance = 1;
      p.maxDistance = radio ?? ALCANCE / this.U;
      p.positionX.value = donde[0]; p.positionY.value = donde[1]; p.positionZ.value = donde[2];
      src.connect(g); g.connect(p); p.connect(this.maestro);
    } else { src.connect(g); g.connect(this.maestro); }
    src.start();
    this.arrancadas++;
    return src;
  }

  /** Dónde está el oyente. Sin esto, todo suena centrado. */
  oyente(posicion, mirada, arriba = [0, 1, 0]) {
    const l = this.ctx?.listener;
    if (!l) return;
    if (l.positionX) {
      l.positionX.value = posicion[0]; l.positionY.value = posicion[1]; l.positionZ.value = posicion[2];
      l.forwardX.value = mirada[0]; l.forwardY.value = mirada[1]; l.forwardZ.value = mirada[2];
      l.upX.value = arriba[0]; l.upY.value = arriba[1]; l.upZ.value = arriba[2];
    } else {
      // Safari viejo sigue con la forma de antes.
      l.setPosition(...posicion); l.setOrientation(...mirada, ...arriba);
    }
  }

  /**
   * LA MÚSICA. `CAreaMusic::MusicTouch` **para todo lo demás** al entrar
   * (`AllMusic.clear()`), así que esto es un canal único y no una mezcla.
   * `null` significa silencio, y es un caso real: 4 de las 11 zonas de Gate
   * City no traen canción.
   */
  async musica(archivo) {
    if (this.puesta === archivo) return;
    this.puesta = archivo;
    const ahora = this.ctx?.currentTime ?? 0;
    if (this.fuenteMusica) {
      const vieja = this.fuenteMusica, g = this.ganMusica;
      g.gain.cancelScheduledValues(ahora);
      g.gain.setValueAtTime(g.gain.value, ahora);
      g.gain.linearRampToValueAtTime(0, ahora + FUNDIDO);
      vieja.stop(ahora + FUNDIDO + 0.05);
      this.fuenteMusica = null;
    }
    if (!archivo) return;
    const entrada = this.catalogo?.musica?.[archivo];
    const buf = await this.pedir(entrada?.archivo ?? `snd/${archivo}`);
    if (!buf || !this.despierto || this.puesta !== archivo) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, this.ctx.currentTime);
    g.gain.linearRampToValueAtTime(1, this.ctx.currentTime + FUNDIDO);
    src.connect(g); g.connect(this.canalMusica);
    src.start();
    this.arrancadas++;
    this.fuenteMusica = src; this.ganMusica = g;
  }

  /** Un paso, con la muestra que eligió la regla. */
  paso({ material, muestra, volumen }) {
    const lista = this.catalogo?.pasos?.[material];
    // Que no haya archivo NO es un fallo que haya que tapar: `pl_step*.wav`
    // no está ni en el juego. Se cuenta y se sigue.
    if (!lista?.length) { this.sinArchivo = (this.sinArchivo ?? 0) + 1; return null; }
    const s = lista[muestra % lista.length];
    return this.unaVez(s.archivo, { volumen });
  }
}
