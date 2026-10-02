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

import { ganancia } from "./aplicar.js";
import { presetDe } from "./reverberacion.js";

import { MAPA_POR_DEFECTO, baseDe } from "./mapa.js";
import { BASE_COMUN } from "./recursos.js";
import { traerJson } from "./json.js";
const BASE_POR_DEFECTO = baseDe(MAPA_POR_DEFECTO);
const ATTN_NORM = 0.8;
/** Unidades a las que se apaga un sonido normal, de `SND_RADIUS`. */
export const ALCANCE = 1000 / ATTN_NORM;

/** Segundos del fundido de la música. Un corte seco se oye como un fallo. */
export const FUNDIDO = 1.5;

export class Audio {
  // EL 82: `contexto` es la COSTURA PARA MEDIR, y no es un adorno de pruebas.
  //
  // Una cola de reverberación no se puede leer de ninguna variable: lo único
  // que la demuestra es que suene algo DESPUÉS de que el sonido haya acabado, y
  // eso se mide rindiendo la cadena en un `OfflineAudioContext`. Pero una sonda
  // que se construya ella la cadena deja de ser un testigo y se convierte en
  // una copia —la lección del 65, donde `sonda.js` recalculaba la cámara y
  // habría dicho «no se mueve» con la cámara moviéndose—.
  //
  // Así que el contexto se inyecta y **el montaje es el del juego**: la sonda
  // llama a `despertar()` y a `reverberacion()`, las mismas dos de la partida.
  constructor({ base = BASE_POR_DEFECTO, baseArchivos = BASE_COMUN, unidadesPorMetro = 39.37,
    contexto = null } = {}) {
    this.contextoInyectado = contexto;
    this.base = base;
    this.baseArchivos = baseArchivos;
    this.U = unidadesPorMetro;
    this.ctx = null;
    this.buffers = new Map();
    this.catalogo = null;
    this.sonando = new Map();   // música por canal
    this.arrancadas = 0;        // para la sonda: cuántas fuentes se han lanzado
    this.fallos = [];
    // LOS DOS VOLÚMENES del motor, y son dos canales distintos: `volume` para
    // los efectos y `MP3Volume` para la música. Se guardan aquí porque el
    // `AudioContext` todavía no existe —nace con el primer gesto— y «Apply»
    // puede llegar antes. Ver `src/play/aplicar.js`.
    this.volumenEfectos = 1;
    this.volumenMusica = 1;
  }

  /**
   * Los dos volúmenes, de 0 a 1. Se puede llamar antes de que haya contexto:
   * se quedan puestos y `despertar()` los estrena.
   */
  volumenes({ efectos, musica } = {}) {
    if (efectos !== undefined) this.volumenEfectos = ganancia(efectos);
    if (musica !== undefined) this.volumenMusica = ganancia(musica);
    if (this.maestro) this.maestro.gain.value = this.volumenEfectos;
    if (this.canalMusica) this.canalMusica.gain.value = this.volumenMusica;
    return this;
  }

  /** El catálogo se puede cargar sin gesto; sólo decodificar necesita contexto. */
  async cargar() {
    // `traerJson` y no `r.ok`: el servidor de desarrollo contesta el
    // `index.html` a lo que no encuentra, y el `r.json()` de antes tiraba el
    // arranque entero de un mapa sin hornear. Ver src/play/json.js.
    const c = await traerJson(`${this.base}/sonido.json`, { avisar: () => {} });
    if (!c) { this.fallos.push("sin sonido.json: ¿falta `npm run sonido`?"); return null; }
    this.catalogo = c;
    return this.catalogo;
  }

  /**
   * Despierta el contexto. **Tiene que llamarse desde un gesto del usuario.**
   * Devuelve `true` si a partir de ahora puede sonar.
   */
  async despertar() {
    if (!this.ctx) {
      const C = globalThis.AudioContext ?? globalThis.webkitAudioContext;
      if (!this.contextoInyectado && !C) {
        this.fallos.push("este navegador no trae Web Audio"); return false;
      }
      this.ctx = this.contextoInyectado ?? new C();
      this.maestro = this.ctx.createGain();
      this.maestro.connect(this.ctx.destination);
      this.canalMusica = this.ctx.createGain();
      // LA MÚSICA NO CUELGA DEL MAESTRO, y eso es del motor: `volume` es el
      // volumen de los EFECTOS y `MP3Volume` el de la música, dos cvars
      // independientes. Colgándola del maestro, bajar los efectos bajaría
      // también la canción y los dos deslizadores se multiplicarían.
      this.canalMusica.connect(this.ctx.destination);
      this.volumenes();
    }
    // Un `OfflineAudioContext` no se «despierta»: nace suspendido y sigue
    // suspendido hasta `startRendering()`, que es su forma de correr. Si no se
    // distingue, el contexto de medir parece dormido y `unaVez` se niega a
    // sonar — o sea que el instrumento no podría ver la presencia (el 69).
    if (this.esDiferido) return true;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    return this.ctx.state === "running";
  }

  /** ¿Es un contexto de rendir y no de sonar? Lo delata `startRendering`. */
  get esDiferido() { return typeof this.ctx?.startRendering === "function"; }

  get despierto() { return this.esDiferido || this.ctx?.state === "running"; }

  // ── EL 82: LA REVERBERACIÓN DE LA SALA ────────────────────────────────────
  //
  // Quién decide el número está en `src/play/reverberacion.js`, con la regla de
  // los `env_sound` citada. Aquí sólo suena, y por eso está aquí: `reverberacion
  // .js` es puro y se prueba en Node, y esto necesita un `AudioContext`.
  //
  // ── La cadena del motor, que son DOS etapas y no un «reverb» ─────────────
  //
  // El DSP de GoldSrc no es un efecto de sala: son dos cosas distintas
  // encadenadas, y cada preset usa una, la otra o las dos (`s_dsp.c`):
  //
  //   1. **el ECO**: una línea de retardo con realimentación y un paso bajo
  //      opcional. `room_delay`, `room_feedback`, `room_dlylp`.
  //   2. **la REVERBERACIÓN**: **dos** líneas de peine, y la segunda a 0,71 de
  //      la primera —no es un número redondo y por eso se copia y no se
  //      inventa—, las dos con la misma realimentación:
  //
  //          RVB_SetUpDly( dly1, delay, 500 );
  //          RVB_SetUpDly( dly2, delay * 0.71f, 700 );
  //          dly1->lp = dly2->lp = sxrvb_lp.value;
  //          dly1->delayfeedback = dly2->delayfeedback
  //                              = (int)(255 * sxrvb_feedback.value);
  //                                                   s_dsp.c:582-604
  //
  // Y por encima, el paso bajo de toda la sala (`room_lp`), que sólo tienen los
  // tres presets de agua. Eso es lo que hace que debajo del agua todo suene
  // apagado y no sólo con eco.
  //
  // ── LO QUE NO SE PORTA, DICHO AQUÍ Y CONTADO ────────────────────────────
  //
  // 1. **La modulación** (`room_mod`, y los `500`/`700` de arriba, que son los
  //    `kmod` en muestras). La usa **un solo preset, el 26**, y en los 93 mapas
  //    hay **un solo `env_sound` de tipo 26**. Se dice el número para que sea un
  //    dato y no una excusa.
  // 2. **El retardo del canal izquierdo** (`room_left`, `sxste_delay`), que es
  //    el ensanchado estéreo. Lo traen **22 de los 29 presets** —la primera
  //    vuelta del 82 escribió 21 y son 22, contados con
  //    `PRESETS.filter((p) => p[8] !== 0).length`—, así que no es
  //    raro: lo que falta es la anchura, no la cola. Se declara porque un
  //    `ChannelSplitter` con su propio retardo es otra etapa y no se ha medido.
  // 3. **El filtro es de un polo en el motor** y aquí es un `biquad` de dos. La
  //    pendiente no es la misma; se dice en vez de decir «paso bajo» y dejarlo.
  //
  // ── Y POR QUÉ `seco` SIEMPRE SUENA ──────────────────────────────────────
  //
  // Porque el DSP del motor es un INSERTO sobre la mezcla, no un envío: con el
  // preset 0 la señal pasa entera y sin tocar (`if( idsp_room == room_typeprev
  // && idsp_room == 0 ) return;`, s_dsp.c:817). Colgando todo del mojado, el
  // preset «off» dejaría el juego mudo.

  /** El bus de reverberación, montado una vez y reconfigurado al cambiar de sala. */
  montarReverberacion() {
    if (!this.ctx || this.bus) return this.bus ?? null;
    const c = this.ctx;
    // El maestro deja de ir al destino: ahora va al bus.
    try { this.maestro.disconnect(); } catch { /* nunca estuvo conectado */ }
    const seco = c.createGain();
    const mojado = c.createGain();
    // EL FILTRO DE LA SALA VA AL FINAL Y SOBRE TODO, no sobre el mojado.
    //
    // `RVB_DoAMod( paint, count )` corre sobre el búfer ya pintado y **después**
    // del eco y de la reverberación (`SX_RoomFX`, s_dsp.c:838-845): es lo último
    // de la cadena y lo coge todo. Puesto sólo en el camino mojado, meter la
    // cabeza en el agua dejaría los sonidos secos igual de brillantes, que es
    // justo lo contrario de lo que hace.
    // ── EL PASO BAJO ES UN INTERRUPTOR, Y SE MONTA COMO UN INTERRUPTOR ────
    //
    // El 82, segunda vuelta, y esto costó cuatro medidas. Los tres `lp` del DSP
    // son booleanos en el motor, y lo que hace con ellos es **meter o no meter
    // el filtro en el camino**:
    //
    //     if( dly->lp ) { valt = (dly->lp0 + val) >> 1; ... }
    //     else            valt = val;                       s_dsp.c:658-664
    //
    // Estaba portado como **un `BiquadFilterNode` al que se le mueve el corte**:
    // 824 Hz para apagar y 22 050 «para abrir del todo». Las dos mitades de eso
    // están mal, y cada una de una manera:
    //
    // 1. **Abrir del todo no existe.** Un `biquad` en `lowpass` con el corte en
    //    el Nyquist degenera a un polo doble sobre el círculo unidad: no es un
    //    filtro transparente, es un filtro al borde de no converger. Y en un
    //    contexto de 22 050 Hz —el de la sonda— 22 050 **es** el Nyquist.
    //
    // 2. **El `Q` de un `lowpass` de Web Audio está en DECIBELIOS**, no es la Q
    //    clásica: es «a resonance value in decibels». O sea que el valor por
    //    omisión, 1, es **+1 dB de resonancia**, y medido con
    //    `getFrequencyResponse` el módulo llega a **1,2532** a 2 205 Hz. Bajarlo
    //    a 1/√2 no lo arregla —sigue en 1,2209— porque 0,707 dB sigue siendo un
    //    pico.
    //
    // Y un filtro que en alguna frecuencia pasa de 1 **dentro de un lazo de
    // realimentación** no colorea: oscila. Con `room_refl 0,95` (preset 10) la
    // ganancia de vuelta era 0,95 · 1,22 = **1,16**, y la cola medida crecía sin
    // parar: 3,5e−1 · 8,4e−2 · 1,2e−1 · 1,6e−1 · … · 5,1e+0, cada ventana más
    // alta que la anterior. El motor no puede sufrirlo porque sus filtros son
    // **medias** —`(lp0 + val) >> 1`— y una media vale 1 en continua y baja
    // desde ahí; nunca pasa de uno.
    //
    // Así que aquí va lo mismo: **un polo**, que como la media del motor vale 1
    // en continua y decrece monótona, y por construcción no puede hacer crecer
    // un lazo. Y el interruptor es un interruptor de verdad, dos caminos en
    // paralelo, que es la forma exacta del `if/else` de arriba.
    //
    //     y[n] = a·x[n] + (1−a)·y[n−1]      a = 1 − e^(−2π·fc/fs)
    //
    // Se calcula con el muestreo DEL CONTEXTO, que es lo que hace que el corte
    // caiga donde dice el motor y no donde caería si se copiaran los
    // coeficientes: las medias del motor corren a 11 025 Hz (`idsp_dma_speed =
    // SOUND_11k`, s_dsp.c:223) y aquí el contexto es de 44 100 o 48 000, así que
    // copiar `(x[n]+x[n−1])/2` pondría el corte cuatro veces más arriba.
    //
    // **Lo que NO es igual**, y se dice en vez de dejarlo: la pendiente. El de
    // la sala es un FIR de seis tomas con nulos periódicos, el de la
    // reverberación una media de dos y el del eco un IIR de dos polos; los tres
    // se portan con un polo que les acierta el −3 dB. Coincide dónde empieza a
    // apagar, no cómo sigue.
    //
    // Durante el cruce los dos caminos están abiertos a la vez, y eso NO hace un
    // bulto: `setTargetAtTime` sube uno como `1−e^(−t/τ)` y baja el otro como
    // `e^(−t/τ)`, que suman 1 exactamente en todo momento.
    const pasoBajo = (fc) => {
      const entrada = c.createGain();
      const salida = c.createGain();
      const a = 1 - Math.exp((-2 * Math.PI * fc) / c.sampleRate);
      const filtro = c.createIIRFilter([a, 0], [1, -(1 - a)]);
      const puesto = c.createGain();   // el camino con filtro
      const quitado = c.createGain();  // el camino directo, el `else` del motor
      entrada.connect(filtro);
      filtro.connect(puesto);
      puesto.connect(salida);
      entrada.connect(quitado);
      quitado.connect(salida);
      return { entrada, salida, puesto, quitado };
    };
    const pasoSala = pasoBajo(824);
    const pasoGraves = c.createGain();
    // ── UNA COMPUERTA POR ETAPA, Y ESTO LO CAZÓ LA SONDA ─────────────────
    //
    // En el motor, una etapa con su parámetro a cero **no se ejecuta**: la
    // línea se LIBERA (`if( delay == 0 ) DLY_Free( dly );`, s_dsp.c:457-460, y
    // lo mismo la reverberación con `room_size` a 0, :588-593). En Web Audio no
    // hay nada que liberar: un `DelayNode` con el retardo a cero **pasa la
    // señal tal cual**, así que la etapa apagada no se callaba, sumaba una
    // copia.
    //
    // Lo enseñó el control del agua. El preset 14 no lleva ni eco ni
    // reverberación —sólo el paso bajo—, y con las etapas en modo «pasar» el
    // golpe salía con **tres veces** la energía del preset 0 en vez de con
    // menos: dry + eco + las dos de peine. El control pedía «pierde energía» y
    // sacó «gana el triple», que es el rojo que hacía falta.
    //
    // *Un nodo que no se puede liberar necesita una compuerta; «parámetro a
    // cero» no es «apagado».*
    const ecoSalida = c.createGain();
    const rvbSalida = c.createGain();

    // ── LA FORMA DEL LAZO ES `y = x + fb·y[n−D]`, Y NO `y = delay(x)` ──────
    //
    // El 82, segunda vuelta. Esto estaba escrito como «el maestro entra en la
    // línea y la línea realimenta», que suena igual y no lo es. Lo que el motor
    // calcula, en las dos etapas, es:
    //
    //     val = vlr + (( dly->delayfeedback * delay ) >> 8);   s_dsp.c:508
    //     ...                           // `delay` es la salida de la línea
    //     voutm = dly->lpdelayline[dly->idelayinput] = valt;   s_dsp.c:666
    //
    // O sea que **la suma incluye la muestra de AHORA** (`vlr`), y lo que se
    // guarda en la línea y lo que sale es esa suma. Puesto como estaba —la
    // línea primero y el grifo detrás— la salida era `x[n−D] + fb·y[n−D]`: el
    // mismo tren de ecos corrido un `D` entero y **sin la copia directa**, que
    // es el término que el motor suma con ganancia 1.
    //
    // Importa para el nivel, que es de lo que iba el fallo: sin la copia
    // directa el camino mojado del preset 13 llegaba al primer rebote con
    // ganancia 1 donde el motor llega con `fb · 11/64` = 0,148.
    //
    // En Web Audio eso es un nodo de suma (`suma`) dentro del lazo:
    //
    //     maestro ─→ suma ─→ paso ─→ linea ─→ realim ─┐
    //                  ↑                               │
    //                  └───────────────────────────────┘
    //                        paso ─→ (la salida)
    //
    // El lazo lleva un `DelayNode` dentro, que es lo que Web Audio exige para
    // no quedarse sin resolver.
    //
    // Y EL PASO BAJO VA DENTRO DEL LAZO, no en el grifo. En el motor lo que se
    // guarda en la línea es `valt`, o sea el valor **ya filtrado**
    // (s_dsp.c:666), así que cada vuelta se filtra otra vez y la cola se va
    // apagando. Colgado del grifo se filtraba una sola vez y todas las vueltas
    // salían igual de brillantes.
    const linea = (maxDelay, corte) => {
      const suma = c.createGain();
      const paso = pasoBajo(corte);
      const retardo = c.createDelay(maxDelay);
      const realim = c.createGain();
      this.maestro.connect(suma);
      suma.connect(paso.entrada);
      paso.salida.connect(retardo);
      retardo.connect(realim);
      realim.connect(suma);
      return { suma, paso, retardo, realim };
    };

    // El eco: una sola línea, hasta 0,4 s (`MAX_MONO_DELAY`, s_dsp.c:21). Su
    // paso bajo corta en **474 Hz**, que sale de su fórmula y no de la oreja:
    // `val = (lp0 + lp1 + val)/3` con `lp0`/`lp1` las dos SALIDAS anteriores
    // (s_dsp.c:513-517) es un IIR de dos polos, no una media móvil, y a 11 025
    // Hz su −3 dB cae ahí. Corta mucho más abajo de lo que parece.
    const eco = linea(1.0, 474);
    eco.paso.salida.connect(ecoSalida);
    ecoSalida.connect(mojado);
    // Las dos de peine, cada una con su lazo y **su propio paso bajo**: en el
    // motor cada `dly_t` lleva su `lp0` (s_dsp.c:659-662), así que son dos
    // filtros con dos estados y no uno compartido. `createDelay` necesita su
    // máximo de antemano y el `room_size` más grande de la tabla es 0,09 s
    // (preset 25); `MAX_REVERB_DELAY` es 0,1 (s_dsp.c:22).
    //
    // Cuelgan del MAESTRO y no del eco, porque en el motor son dos etapas
    // paralelas sobre la misma mezcla y no una detrás de la otra.
    // Su corte son **2 756 Hz**: `valt = (lp0 + val) >> 1` es la media de dos
    // tomas, o sea `y[n] = (x[n]+x[n−1])/2`, cuyo −3 dB a 11 025 Hz es fs/4.
    const rvb = [0, 1].map(() => linea(0.5, 2756));
    for (const r of rvb) r.paso.salida.connect(rvbSalida);
    rvbSalida.connect(mojado);
    mojado.connect(pasoSala.entrada);

    // El seco y el mojado se suman y **los dos pasan por el filtro de sala**,
    // que es lo último antes del destino.
    this.maestro.connect(seco);
    seco.connect(pasoSala.entrada);
    // Y el filtro de sala, al final y sobre la suma de los dos.
    pasoSala.salida.connect(pasoGraves);
    pasoGraves.connect(c.destination);

    this.bus = {
      seco, mojado, pasoSala, pasoGraves, eco, ecoSalida,
      rvb, rvbSalida, tipo: null,
    };
    this.reverberacion(0);
    return this.bus;
  }

  /**
   * Pone el `room_type` del jugador. Es el `SVC_ROOMTYPE` del motor.
   *
   * Idempotente a propósito: el motor sólo manda el mensaje cuando cambia
   * («this should be a rare event - once per change of room_type only!»,
   * sound.cpp:1009-1011), y volver a escribir los mismos valores en cada
   * fotograma haría clics en los lazos de realimentación.
   */
  reverberacion(tipo) {
    const bus = this.bus ?? this.montarReverberacion();
    if (!bus) return null;
    const p = presetDe(tipo);
    if (bus.tipo === p.tipo) return p;
    // LA PRIMERA VEZ NO SE RAMPEA, Y NO ES UN DETALLE.
    //
    // `setTargetAtTime` es una rampa exponencial: pedirle 0 desde el valor de
    // reposo de un `GainNode`, que es **1**, deja el camino mojado ABIERTO unos
    // 50 ms. O sea que con el preset 0 —el que no debe sonar a nada— el juego
    // arrancaba con un soplo de reverberación de 50 ms, y el motor no tiene
    // ninguna rampa: `Cvar_DirectSetValue` es inmediato (s_dsp.c:823-831).
    //
    // Lo cazó el control negativo de la sonda —«el preset 0 no deja cola»—
    // saliendo rojo con todo lo demás bien. En los cambios de sala sí se rampea,
    // porque ahí lo que se evita es un clic en los lazos de realimentación.
    const primera = bus.tipo === null;
    bus.tipo = p.tipo;
    const t = this.ctx.currentTime;
    const poner = (param, v) => {
      if (primera) param.value = v; else param.setTargetAtTime(v, t, 0.05);
    };
    // ── EL PASO BAJO DE LA SALA, Y SU FRECUENCIA NO ES INVENTADA ─────────
    //
    // `room_lp` es 0 o 1, no una frecuencia: el motor no tiene un corte, tiene
    // **una media móvil de seis tomas dividida entre cuatro**, corriendo al
    // ritmo del DSP, que es 11 025 Hz (`idsp_dma_speed = SOUND_11k`, :223):
    //
    //     res.left = rgsxlp[0] + rgsxlp[1] + rgsxlp[2] + rgsxlp[3]
    //              + rgsxlp[4] + res.left;
    //     res.left >>= 2;                              s_dsp.c:728-735
    //
    // Seis sumandos y un `>>2`, o sea **ganancia 1,5 en continua**: el filtro
    // del agua no sólo apaga los agudos, **sube los graves 3,5 dB**. Eso no es
    // un detalle de adorno: es por qué debajo del agua el juego suena más
    // gordo y no sólo más sordo.
    //
    // Su respuesta, calculada de esa fórmula y no elegida a ojo:
    //
    //     −3 dB respecto a continua  →   824 Hz
    //     primer nulo                →  1 838 Hz  (= 11025/6)
    //
    // Así que el corte del paso bajo es 824. Y apagado **no se abre el corte:
    // se quita el filtro de en medio**, que es lo que hace el motor —`if(
    // !sxmod_lowpass.value && !sxmod_mod.value ) return;`, s_dsp.c:720— y lo
    // que evita el `biquad` en el Nyquist. Ver `pasoBajo`.
    //
    // La pendiente no es la misma y se dice: el motor es un FIR de seis tomas
    // con nulos periódicos y esto es un polo. Coincide dónde empieza a apagar,
    // no cómo sigue.
    const interruptor = (paso, puesto) => {
      poner(paso.puesto.gain, puesto ? 1 : 0);
      poner(paso.quitado.gain, puesto ? 0 : 1);
    };
    interruptor(bus.pasoSala, Boolean(p.paso));
    // Y la ganancia de continua, que es la mitad del efecto y se olvidaría sola
    // si el filtro fuera «sólo un paso bajo».
    poner(bus.pasoGraves.gain, p.paso ? 1.5 : 1);
    // ── EL SIGNO DE `room_rvblp` Y `room_dlylp`: NO SON FRECUENCIAS ───────
    //
    // El 82, segunda vuelta, y esto es lo que el usuario oía. Los dos campos
    // estaban leídos **al revés**. No son un corte: son un interruptor, y el
    // motor lo mira así:
    //
    //     dly1->lp = dly2->lp = sxrvb_lp.value;             s_dsp.c:602
    //     dly->lp = sxdly_lp.value;                         s_dsp.c:485
    //     ...
    //     if( dly->lp ) { valt = (dly->lp0 + val) >> 1; ... }
    //     else            valt = val;                       s_dsp.c:658-664
    //
    // O sea **distinto de cero = filtro PUESTO**, y cero = la señal pasa sin
    // tocar. Estaba escrito `p.pasoRvb ? abierto : 2000`, que es justo lo
    // contrario, y el precio lo pagaba Edana entera: sus once `env_sound` son
    // de tipos 11 y 13, los dos de la familia **«brite»**, y esa familia trae
    // `room_rvblp 0,0` —se llama brillante porque **no** lleva paso bajo—. Con
    // el signo del revés, el pueblo sonaba con toda su reverberación metida por
    // un filtro de 2 kHz: eso es lo que se oye «como debajo del agua».
    //
    // *El nombre de la familia del preset era la pista: «brite» con un paso
    // bajo puesto no es un preset, es un error de signo.*
    //
    // Los dos cortes —2 756 Hz y 474 Hz— están donde se montan las líneas, con
    // su derivación al lado; aquí sólo se decide si el filtro está puesto, que
    // es lo único que el preset dice.
    //
    // El eco. Con `retardo` a 0 el `DelayNode` pasa la señal tal cual, así que
    // lo que lo apaga es la compuerta de salida.
    poner(bus.eco.retardo.delayTime, p.retardo);
    poner(bus.eco.realim.gain, Math.min(p.realim, 0.95));
    interruptor(bus.eco.paso, Boolean(p.pasoEco));
    // Las dos de peine: la segunda a 0,71 de la primera. Con `tamano` a 0 el
    // motor LIBERA las dos líneas (`DLY_Free`), así que aquí se callan.
    const vivo = p.tamano > 0;
    poner(bus.rvb[0].retardo.delayTime, vivo ? p.tamano : 0.01);
    poner(bus.rvb[1].retardo.delayTime, vivo ? p.tamano * 0.71 : 0.01);
    for (const r of bus.rvb) {
      poner(r.realim.gain, vivo ? Math.min(p.reflejo, 0.95) : 0);
      interruptor(r.paso, Boolean(p.pasoRvb));
    }
    // ── CUÁNTO SE SUMA, QUE ES LA MITAD DE LA REGLA Y FALTABA ─────────────
    //
    // El 82, segunda vuelta. Estas dos ganancias estaban a **1**, y el motor no
    // suma el efecto entero: lo suma atenuado, y con una constante distinta en
    // cada etapa.
    //
    //     if( dsp_coeff_table.value == 1.0f )
    //       voutm /= 6;                 // alpha
    //     else voutm = (11 * voutm) >> 6;
    //     paint->left = CLIP16( paint->left + voutm );      s_dsp.c:700-708
    //
    //     val >>= 2;
    //     paint->left = CLIP16( paint->left + val );        s_dsp.c:525-528
    //
    // `dsp_coeff_table` vale **"0"** de serie —«0 for release or 1 for alpha
    // 0.52», s_dsp.c:148—, así que la tabla de serie es la segunda rama:
    // **11/64** para la reverberación (las dos líneas ya sumadas) y **1/4**
    // para el eco. La de «alpha», 1/6, no se porta porque no es la de serie; se
    // deja escrita arriba para que se vea que son dos y cuál se eligió.
    //
    // Con las dos a 1 la cola salía **17,8 veces** la energía que le toca en el
    // preset 13 y **141 veces** en el 20, y las once sondas de esta misma
    // familia seguían verdes: ninguna preguntaba CUÁNTA cola, sólo si había.
    //
    // *Una etapa puede estar conectada, filtrada y citada y seguir estando mal:
    // el envío es un número de la regla, no un detalle de mezcla.*
    const ENVIO_RVB = 11 / 64;
    const ENVIO_ECO = 1 / 4;
    // Las dos compuertas: una etapa con su parámetro a cero se CALLA, no pasa.
    // En el motor su línea de retardo se libera y no se ejecuta. Ver arriba.
    poner(bus.rvbSalida.gain, p.tamano > 0 ? ENVIO_RVB : 0);
    poner(bus.ecoSalida.gain, p.retardo > 0 ? ENVIO_ECO : 0);
    // El seco siempre entero —es un inserto, no un envío— y el mojado se apaga
    // del todo en el preset 0, que es el único que no toca nada.
    poner(bus.seco.gain, 1);
    poner(bus.mojado.gain, p.tipo === 0 ? 0 : 1);
    return p;
  }

  /** Qué `room_type` tiene puesto ahora mismo. Para la sonda. */
  get salaActual() { return this.bus?.tipo ?? null; }

  /** Descarga y decodifica, una vez por archivo. */
  async pedir(archivo) {
    if (!archivo) return null;
    if (this.buffers.has(archivo)) return this.buffers.get(archivo);
    if (!this.ctx) return null;
    const p = (async () => {
      // EL 71: la descarga puede FALLAR, no sólo dar 404, y una petición que
      // revienta aquí sale por la ventana como una promesa sin recoger —un
      // `pageerror` que ninguna sonda sabe de quién es—. El primero que lo
      // enseñó fue `items/weapondrop1.wav`, el golpe de un objeto contra el
      // suelo: **no está en `assets/msr` porque es de `valve/`**, y el motor
      // monta `valve/` detrás siempre (la nota del apartado 2 de CLAUDE.md).
      // Falta en esta copia, no en el juego. Se apunta como lo que es.
      let r;
      try {
        r = await fetch(`${this.baseArchivos}/${archivo}`);
      } catch (e) {
        this.fallos.push(`no se ha podido pedir ${archivo}: ${e.message}`);
        return null;
      }
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
