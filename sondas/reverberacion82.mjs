// LA COLA DE LA REVERBERACIÓN — experimento 82.
//
//   npm run sonda:reverberacion82
//
// ── QUÉ MIDE ESTO, Y QUÉ NO ───────────────────────────────────────────────
//
// Mide **el efecto**: que después de que un sonido haya terminado siga saliendo
// señal. Eso es una cola, y es lo único que demuestra que la reverberación
// existe. Leer `audio.salaActual` sería leer el valor de la ventana, que es lo
// que el apartado 3 de CLAUDE.md prohíbe expresamente.
//
// **NO mide que el jugador la oiga en Edana**, pero ya no por lo que decía
// aquí. Esto llevaba escrito que «falta la línea de `src/main.js` que recorre
// los once `env_sound` y le pasa el `room_type` al audio», y **esa línea está**:
// `src/main.js:1789` hornea las fuentes y `:5444` llama a `audio.reverberacion`
// cada fotograma. La costura la mide `sondas/edana82.mjs`, que planta al jugador
// en dos `env_sound` de tipos distintos y comprueba que el número llega al
// audio.
//
// *Corregido en la segunda vuelta del 82. Era un diagnóstico correcto con fecha
// de caducidad y sin fecha, que es el `catchspeech` del 79: la primera mitad de
// la frase dejó de ser verdad y nadie volvió a leer la segunda.*
//
// Lo que sigue sin medir nadie es el nivel **en una partida de verdad**: aquí se
// rinde la cadena fuera de tiempo real, y lo que el jugador oye depende además
// de su volumen y de la mezcla. Eso no se cuenta entre los verdes.
//
// ── POR QUÉ ESTA SONDA NO ENTRA POR `menuselect` ──────────────────────────
//
// Porque no mide el juego: mide `src/play/audio.js` en un navegador de verdad.
// La regla del apartado 3 —«si su camino no pasa por `menuselect`, no cuenta»—
// es para las sondas que miden lo que hace el jugador, y ésta no dice nada
// sobre ninguna partida. La que medirá la reverberación de Edana sí tendrá que
// entrar por ahí, y todavía no se puede escribir.
//
// ── Y POR QUÉ HACE FALTA UN NAVEGADOR ────────────────────────────────────
//
// Porque `OfflineAudioContext` no existe en Node. Se rinde la cadena fuera de
// tiempo real, que además la hace determinista: dos pasadas dan la misma
// muestra, así que un umbral aquí no es un número que tiemble.
//
// ── EL INSTRUMENTO TIENE QUE PODER VER LA PRESENCIA ──────────────────────
//
// La lección del 69. Antes de medir una cola, se mide con el preset 0 —«off»—,
// que **no debe tener ninguna**. Si el silencio no sale silencio, el medidor
// está midiendo otra cosa y los verdes de abajo no valen nada.

import { spawn } from "node:child_process";
import { chromium } from "playwright";
import { liberarPuerto, arrancarVite } from "./mismo.mjs";

const PORT = 5619;   // el 98: era 5282, compartido con otra sonda (test/puertos98.test.mjs)
const liberados = liberarPuerto(PORT);
const dev = await arrancarVite(PORT);   // el 98: espera a que conteste
const matar = (p) => { try { spawn("taskkill", ["/F", "/T", "/PID", String(p.pid)], { shell: true, stdio: "ignore" }); } catch { /* ya no está */ } };

// ── EL MARCADOR SE DECLARA ANTES DE EMPEZAR ──────────────────────────────
//
// El fallo del 65: `sonda:arranque36` declaraba 30 controles, se caía en el 22
// y remataba con «22 de 22 en verde». Un «X de Y» donde Y se calcula al final
// **no puede bajar nunca**. Aquí Y está escrito, y lo que no llegue a correr
// cuenta como rojo con su motivo.
// El 82, segunda vuelta: +4 controles de NIVEL y de signo del paso bajo. Los
// doce primeros median «si hay cola» y ninguno «cuánta», que es lo que estaba
// roto. Ver el apartado 5.
const PREVISTOS = 20;
const controles = [];
const control = (que, bien, detalle = "") => controles.push({ que, bien, detalle });

let nav = null;
let codigo = 1;
try {
  nav = await chromium.launch();
  const pag = await nav.newPage();
  // ── SE CORTA EL HMR DE VITE, Y NO ES COMODIDAD ───────────────────────────
  //
  // Con varias sesiones guardando a la vez, vite recarga la página a mitad de
  // pasada. Una página que se recarga en medio **mide dos versiones del
  // código**, así que ni el verde ni el rojo valen nada; y el síntoma no es un
  // rojo honrado sino un `TypeError` a media medida, que es muy fácil leer
  // como «el juego está mal». Visto hoy en `sonda:mundo`, que no la lleva:
  // tres pasadas seguidas dieron 41, 43 y 43 de 44 con el código quieto.
  //
  // Se reconoce por el SUBPROTOCOLO y no por la URL, así que el WebSocket del
  // multijugador pasa igual. La receta es de `sondas/sidra81.mjs`.
  await pag.addInitScript(() => {
    const Real = window.WebSocket;
    window.WebSocket = function (url, protos) {
      const esHmr = protos === "vite-hmr" || (Array.isArray(protos) && protos.includes("vite-hmr"));
      if (!esHmr) return new Real(url, protos);
      return { close() {}, send() {}, addEventListener() {}, removeEventListener() {}, readyState: 3 };
    };
  });
  const errores = [];
  pag.on("pageerror", (e) => errores.push(String(e)));

  // Esperar a que vite conteste. Sin esto la primera pasada falla sola.
  for (let i = 0; i < 60; i++) {
    try { const r = await pag.goto(`http://localhost:${PORT}/`, { timeout: 2000 }); if (r) break; } catch { await new Promise((r) => setTimeout(r, 500)); }
  }

  /**
   * Rinde un golpe seco por la cadena del juego y devuelve la energía ANTES y
   * DESPUÉS de que el golpe acabe.
   *
   * El montaje lo hace `audio.despertar()` + `audio.reverberacion(tipo)`, que
   * son las dos llamadas de la partida: esta sonda **no construye la cadena**.
   * Ésa es la lección del 65 — una sonda que recalcula deja de ser testigo.
   */
  const medir = (tipo, { romperMojado = false } = {}) => pag.evaluate(async ({ tipo, romperMojado }) => {
    const { Audio } = await import("/src/play/audio.js");
    const FS = 22050;                 // los `.wav` del mod son de 11 y 22 kHz
    const SEG = 2;
    const off = new OfflineAudioContext(2, FS * SEG, FS);
    const audio = new Audio({ contexto: off });
    if (!await audio.despertar()) return { error: "no despertó" };
    audio.reverberacion(tipo);
    if (romperMojado) audio.bus.mojado.gain.value = 0;   // la rotura deliberada

    // El golpe: 50 ms de RUIDO BLANCO, metido por el MAESTRO, que es por donde
    // entra todo lo que suena en el juego.
    //
    // Ruido y no un seno, y esto costó una pasada: el primer golpe era
    // `Math.sin(i * 0.3)`, que a 22 050 Hz son **1 053 Hz**, o sea justo encima
    // del corte del filtro de sala (824 Hz). Con el tono sentado en el codo del
    // filtro, el agua le quitaba un 8 % de energía y el control pedía un 10 %:
    // **el instrumento no podía ver lo que iba a medir**. Un seno mide una
    // frecuencia; para un filtro hace falta un golpe que traiga todas.
    //
    // El dado es fijo a propósito —`OfflineAudioContext` ya es determinista, y
    // con `Math.random()` dejaría de serlo—, así que dos pasadas dan la misma
    // muestra y el umbral no tiembla.
    const golpe = off.createBuffer(1, Math.floor(FS * 0.05), FS);
    const d = golpe.getChannelData(0);
    let semilla = 12345;
    for (let i = 0; i < d.length; i++) {
      semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (semilla / 0x3fffffff - 1) * 0.8;
    }
    // ── EL GOLPE NO EMPIEZA EN 0, Y ESTO COSTÓ DOS PASADAS ───────────────
    //
    // `reverberacion()` rampea los parámetros en 50 ms al cambiar de sala (para
    // no hacer un clic en los lazos de realimentación). El golpe también dura
    // 50 ms. Arrancándolo en 0, **el golpe y la rampa ocupan la misma ventana**:
    // el filtro del agua todavía estaba abriéndose cuando se medía, así que el
    // control decía que el agua casi no apaga.
    //
    // Se arranca a los 300 ms, con la rampa ya asentada, y las ventanas van
    // relativas a ese cero. *Antes de culpar a la regla, comprueba que el que
    // mide está donde cree* — el 69, con el jugador cayéndose.
    const T0 = 0.3;
    const src = off.createBufferSource();
    src.buffer = golpe;
    src.connect(audio.maestro);
    src.start(T0);

    const buf = await off.startRendering();
    const ch = buf.getChannelData(0);
    const energia = (desde, hasta) => {
      let s = 0;
      for (let i = Math.floor((T0 + desde) * FS); i < Math.floor((T0 + hasta) * FS) && i < ch.length; i++) {
        s += ch[i] * ch[i];
      }
      return s;
    };
    // ── EL BRILLO DE LA COLA, para poder medir el PASO BAJO ────────────────
    //
    // La energía de la primera diferencia partida por la energía: sube con los
    // agudos y baja con ellos. No es un espectro, es un proxy monótono, y para
    // lo que hace falta —comparar dos presets, uno con `room_rvblp` y otro sin
    // él— basta con que sea monótono. Se dice que es un proxy en vez de
    // llamarlo «el corte».
    const brillo = (desde, hasta) => {
      let n = 0, s = 0;
      const i0 = Math.max(1, Math.floor((T0 + desde) * FS));
      for (let i = i0; i < Math.floor((T0 + hasta) * FS) && i < ch.length; i++) {
        const d = ch[i] - ch[i - 1];
        n += d * d; s += ch[i] * ch[i];
      }
      return s > 0 ? n / s : 0;
    };
    return {
      sala: audio.salaActual,
      // El golpe dura 50 ms. Lo de antes de 60 ms es el golpe; lo de después,
      // sólo puede venir de la cadena.
      golpe: energia(0, 0.06),
      cola: energia(0.06, SEG - 0.4),
      colaTarde: energia(0.5, SEG - 0.4),
      // Dos ventanas más, para poder comparar la FORMA y no sólo el total. Ver
      // el control del túnel contra el exterior.
      pronto: energia(0.06, 0.2),
      luego: energia(0.25, 0.6),
      brilloCola: brillo(0.06, SEG - 0.4),
    };
  }, { tipo, romperMojado });

  /**
   * El ENVÍO de una etapa, con un impulso y un rebote aislado.
   *
   * Dos pasadas de la misma cadena: una con el mojado a cero, que da el pico
   * SECO —la referencia—, y otra entera, en la que se busca el pico del rebote.
   * El cociente es `fb · envío`, que son dos constantes del motor; ver el
   * apartado 5 bis.
   *
   * Un pulso corto y no el golpe de ruido de `medir`: lo que se quiere es un
   * pico en un instante conocido, y 50 ms de ruido solapan el rebote de 0,02 s
   * con el golpe y con el otro peine.
   *
   * ── PERO NO DE UNA MUESTRA, Y ESTO SALIÓ ROJO CON EL CÓDIGO BIEN ────────
   *
   * La primera versión mandaba UN sample y leía **0,0000** de rebote con la
   * cadena perfecta. Dos cosas, las dos del `DelayNode`:
   *
   * 1. El retardo en muestras **no es entero** (0,05 s × 22 050 = 1 102,5), así
   *    que el nodo interpola entre dos muestras y un impulso de una sola se
   *    reparte: el pico baja a 0,1230 de los 0,1478 que toca. Con un pulso de
   *    diez el centro es una meseta y el pico sobrevive — medido 0,1473 y
   *    0,1475 en las dos líneas, contra 0,1478 de la cuenta.
   * 2. Un `DelayNode` dentro de un lazo arrastra **un bloque de render de más**,
   *    o sea 128 muestras, que a 22 050 Hz son **5,8 ms**. Los rebotes no caen
   *    en 0,0355 y 0,05 sino en 0,041 y 0,056, y una ventana de ±2 ms centrada
   *    en el instante teórico se los pierde enteros. (Esto es de Web Audio y no
   *    del motor: es 5,8 ms de más en la primera reflexión, 2,9 a 44 100 Hz.)
   *
   * *Antes de dar por roto lo que mides, comprueba que tu instrumento podía ver
   * la presencia* — el 69, con el rayo que no cruzaba el trimesh.
   */
  const medirEnvio = (tipo, tap) => pag.evaluate(async ({ tipo, tap }) => {
    const { Audio } = await import("/src/play/audio.js");
    const FS = 22050, SEG = 1.5, T0 = 0.3, PULSO = 10;
    const render = async (mudo) => {
      const off = new OfflineAudioContext(2, FS * SEG, FS);
      const audio = new Audio({ contexto: off });
      if (!await audio.despertar()) return null;
      audio.reverberacion(tipo);
      if (mudo) audio.bus.mojado.gain.value = 0;
      const b = off.createBuffer(1, PULSO, FS);
      b.getChannelData(0).fill(1);
      const src = off.createBufferSource();
      src.buffer = b;
      src.connect(audio.maestro);
      src.start(T0);
      return (await off.startRendering()).getChannelData(0);
    };
    // El pico desde el instante pedido hasta 10 ms después: tiene que caber el
    // bloque de render de más que mete el lazo (5,8 ms aquí) y no llegar al
    // rebote siguiente, que en los dos presets elegidos está a 15 ms o más.
    const pico = (ch, t) => {
      let m = 0;
      for (let i = Math.floor((T0 + t - 0.001) * FS); i < Math.floor((T0 + t + 0.010) * FS) && i < ch.length; i++) {
        m = Math.max(m, Math.abs(ch[i]));
      }
      return m;
    };
    const seco = await render(true);
    const todo = await render(false);
    if (!seco || !todo) return { error: "no despertó" };
    return { picoSeco: pico(seco, 0), picoTap: pico(todo, tap) };
  }, { tipo, tap });

  // ── 1. EL CONTROL NEGATIVO, PRIMERO ────────────────────────────────────
  const off0 = await medir(0);
  control("el preset 0 («off») tiene golpe", !off0.error && off0.golpe > 0,
    off0.error ?? `energía ${off0.golpe.toExponential(2)}`);
  control("y el preset 0 NO deja cola: el medidor sabe ver el silencio",
    !off0.error && off0.cola < off0.golpe * 1e-3,
    off0.error ?? `cola ${off0.cola.toExponential(2)} contra golpe ${off0.golpe.toExponential(2)}`);
  control("el preset 0 se apunta como sala 0", off0.sala === 0, String(off0.sala));

  // ── 2. LA CUEVA, que es la cola más larga de la tabla ──────────────────
  //
  // El 23 es el primero de «cavern»: `room_size 0.05`, `room_refl 0.9`,
  // `room_delay 0.2`, `room_feedback 0.28`. O sea las dos etapas a la vez.
  const cueva = await medir(23);
  control("la cueva (23) tiene cola", !cueva.error && cueva.cola > 0,
    cueva.error ?? `cola ${cueva.cola.toExponential(2)}`);
  control("y su cola es MUCHO mayor que la del silencio",
    !cueva.error && !off0.error && cueva.cola > off0.cola * 1000 + 1e-9,
    `${cueva.cola.toExponential(2)} contra ${off0.cola.toExponential(2)}`);
  control("la cueva sigue sonando medio segundo después del golpe",
    !cueva.error && cueva.colaTarde > 0 && cueva.colaTarde > off0.colaTarde * 1000 + 1e-9,
    `${cueva.colaTarde.toExponential(2)} contra ${off0.colaTarde.toExponential(2)}`);

  // ── 3. DOS PRESETS DISTINTOS SUENAN DISTINTO ──────────────────────────
  //
  // Sin esto, «hay cola» lo cumpliría igual una cadena que ignora el preset y
  // pone siempre la misma. Es la trampa del 50: un solo caso no distingue el
  // valor correcto del valor de reposo.
  //
  // ── Y AQUÍ LA PRIMERA VERSIÓN DE ESTE CONTROL NO MEDÍA NADA ───────────
  //
  // Comparaba la ENERGÍA TOTAL de la cámara (10) contra la del túnel (7), y
  // salieron **1,57e4 y 1,58e4**: un 0,6 % de diferencia, con el código bien.
  // Y es correcto que salgan iguales: los dos tienen `room_size 0.05` y
  // reflejos de 0,95 y 0,92, así que la reverberación domina y la energía total
  // no distingue nada. *Dos cosas pueden mover el mismo número* — el 66, con
  // la vida que subía +1.
  //
  // Lo que los distingue es la FORMA, y para eso hay que elegir dos presets que
  // la tengan distinta de verdad:
  //
  //   10 «chamber»  reverberación densa (0,05 / 0,95) y **sin eco**
  //                 -> energía enseguida, y poca después
  //   20 «outside»  **sin reverberación** y un eco de 0,3 s con realim. 0,42
  //                 -> casi nada enseguida, y un golpe a los 300 ms
  //
  // Así que la prueba es la RAZÓN entre las dos ventanas, no el total.
  const camara = await medir(10);          // «chamber»: reverberación sin eco
  const fuera = await medir(20);           // «outside»: eco de 300 ms sin reverberación
  control("la cámara (10) tiene cola", !camara.error && camara.cola > 0,
    `cola ${camara.cola.toExponential(2)}`);
  control("el exterior (20) tiene cola", !fuera.error && fuera.cola > 0,
    `cola ${fuera.cola.toExponential(2)}`);
  control("y su FORMA es distinta: la cámara suena pronto, el exterior a los 300 ms",
    !camara.error && !fuera.error
      && camara.pronto / Math.max(camara.luego, 1e-12) > 3 * (fuera.pronto / Math.max(fuera.luego, 1e-12)),
    `cámara pronto/luego ${(camara.pronto / Math.max(camara.luego, 1e-12)).toFixed(1)} · ` +
    `exterior ${(fuera.pronto / Math.max(fuera.luego, 1e-12)).toFixed(1)}`);

  // ── 4. EL AGUA APAGA, y eso es el paso bajo de la sala ─────────────────
  //
  // El 14 es el único grupo con `room_lp` a 1. Lo que hay que medir no es que
  // tenga cola —no tiene, no lleva reverberación— sino que **el golpe sale más
  // sordo**: menos energía que con el preset 0, con el mismo golpe de entrada.
  const agua = await medir(14);
  control("debajo del agua (14) el golpe pierde energía: el paso bajo corta",
    !agua.error && !off0.error && agua.golpe < off0.golpe * 0.9,
    `${agua.golpe.toExponential(2)} contra ${off0.golpe.toExponential(2)} sin agua`);

  // ── 5. CUÁNTA, Y NO SÓLO QUE HAYA ─────────────────────────────────────
  //
  // Los cuatro apartados de arriba preguntan todos lo mismo: **si existe una
  // cola**. Ninguno pregunta cuánta, y los dos que comparan dos presets lo
  // hacen con una RAZÓN, que se lleva por delante cualquier error de nivel
  // común a los dos. O sea que una cadena con el envío **siete veces** más alto
  // de lo que dice el motor pasa los nueve controles de arriba, y pasa mejor.
  //
  // Eso es lo que el usuario oyó —«todo suena a eco o como si estuviera bajo el
  // agua»— con la sonda en verde. Es el apartado 3 de CLAUDE.md por la puerta
  // de atrás: se medía el efecto y no el valor de la ventana, pero el efecto
  // que se medía era «pasa algo» y el fallo era «pasa siete veces».
  //
  // ── EL NÚMERO, QUE ES LA REGLA, VA ESCRITO A MANO CON SU CITA ─────────
  //
  // La lección del 75. El motor suma la reverberación a la mezcla **atenuada**,
  // y hay dos tablas:
  //
  //     if( dsp_coeff_table.value == 1.0f )
  //       voutm /= 6;                    // alpha
  //     else voutm = (11 * voutm) >> 6;
  //     paint->left = CLIP16( paint->left + voutm );      s_dsp.c:700-708
  //
  // El valor por omisión de `dsp_coeff_table` es **"0"** (s_dsp.c:148, «0 for
  // release or 1 for alpha 0.52»), así que la de serie es la segunda:
  // **11/64 = 0,171875**. Y el eco va por su lado:
  //
  //     val >>= 2;
  //     paint->left = CLIP16( paint->left + val );        s_dsp.c:525-528
  //
  // O sea **1/4**. Las dos etapas son `y[n] = x[n] + fb·y[n−D]`, con la copia
  // directa dentro (`val = vlr + ((delayfeedback * delay) >> 8)`, s_dsp.c:508).
  //
  // De ahí sale la horquilla del preset 13, que es el de Edana:
  //
  //   golpe  = |1 + 2·g|²            = 1,344² = 1,806   (las dos líneas de peine)
  //   cola   = 2·g²·fb²/(1−fb²)      = 0,1678           (g = 11/64, fb = 0,86)
  //   razón  = cola / golpe          ≈ **0,093**
  //
  // El tope se pone en 0,35 —casi cuatro veces la predicción, para que no sea
  // un número afinado sobre la medida— y el suelo en 0,01, porque un control de
  // nivel tiene que ser de DOS LADOS: sin el suelo lo pasaría una cadena muda.
  const edana13 = await medir(13);
  const razon13 = edana13.cola / Math.max(edana13.golpe, 1e-12);
  control("la 13 de Edana tiene cola (el suelo de la horquilla)",
    !edana13.error && razon13 > 0.01, `cola/golpe ${razon13.toFixed(3)}`);
  control("y NO se come el golpe: cola/golpe < 0,35 (el motor dice 0,093)",
    !edana13.error && razon13 < 0.35, `cola/golpe ${razon13.toFixed(3)}`);

  // Y lo mismo para el ECO, que es la otra etapa y el otro envío (1/4). El 20
  // es «outside»: eco de 0,3 s con realimentación 0,42 y SIN reverberación.
  //
  //   golpe = (1 + 1/4)²             = 1,5625
  //   cola  = (1/4)²·fb²/(1−fb²)     = 0,0134      (fb = 0,42)
  //   razón ≈ **0,0086**, y el paso bajo del eco la baja más
  const razon20 = fuera.cola / Math.max(fuera.golpe, 1e-12);
  control("el eco del 20 tampoco se come el golpe: cola/golpe < 0,20 (motor 0,009)",
    !fuera.error && razon20 < 0.20, `cola/golpe ${razon20.toFixed(3)}`);

  // ── Y EL MISMO CONTROL SOBRE UN PRESET QUE SÍ LLEVA PASO BAJO ─────────
  //
  // Hace falta aparte, y lo enseñó esta misma sonda. Los dos controles de
  // arriba miran el 13 y el 20, y **ninguno de los dos lleva el paso bajo de la
  // reverberación puesto** (el 13 porque es «brite» y el 20 porque no tiene
  // reverberación). O sea que el filtro dentro del lazo no lo tocaba ninguno.
  //
  // Y ahí había un fallo de verdad: con el `Q` por omisión del `biquad` —que es
  // 1, y resuena— la ganancia de vuelta del preset 10 pasaba de uno y la cola
  // **crecía sola**: 5,06e4 contra los 1,30e3 de antes, con el envío 5,8 veces
  // más bajo. Un lazo que crece se lee como «hay cola» en todos los controles
  // de un solo lado, que es por lo que pasó desapercibido una vuelta.
  //
  //   10 «chamber»  g = 11/64, fb = 0,95, dos líneas, **con paso bajo**
  //   golpe = 1,806 · cola ≤ 2·g²·fb²/(1−fb²) = 0,547  →  razón ≤ **0,30**
  //
  // El tope se pone en 0,9 (tres veces la cota, que ya es una cota y no una
  // predicción: el filtro del lazo la baja). Lo que no puede es salir mayor que
  // uno, porque eso es un oscilador y no una sala.
  const razon10 = camara.cola / Math.max(camara.golpe, 1e-12);
  control("la 10, que SÍ lleva paso bajo en el lazo, no se dispara: cola/golpe < 0,9 (cota 0,30)",
    !camara.error && razon10 < 0.9, `cola/golpe ${razon10.toFixed(3)}`);
  control("y la cola de la 10 no CRECE: lo de los últimos 100 ms es menos que lo de los primeros",
    !camara.error && camara.luego < camara.pronto,
    `pronto ${camara.pronto.toExponential(2)} · luego ${camara.luego.toExponential(2)}`);

  // ── 5 bis. EL ENVÍO, MEDIDO CONTRA UN NÚMERO EXACTO ───────────────────
  //
  // Los tres controles de arriba son de horquilla, y una horquilla ancha no
  // mide un nivel: **se comprobó rompiéndolo**. Con los dos envíos puestos a 1
  // —la rotura deliberada, con `grep` delante— la razón del preset 13 subió de
  // 0,037 a 0,243 y **el tope de 0,35 la dejó pasar**: 18 de 18 en verde con el
  // fallo puesto. El margen de «casi cuatro veces la predicción» parecía
  // prudente y lo que era es más ancho que el fallo.
  //
  // Lo que sirve es un número que se pueda calcular **exacto**, y para eso hace
  // falta cambiar el instrumento: un IMPULSO de una muestra en vez de 50 ms de
  // ruido, y el pico de UN rebote aislado medido contra el pico seco de una
  // pasada sin mojado. Entonces la cuenta no tiene ventanas ni solapes:
  //
  //     pico(primer rebote) / pico(seco)  =  fb · envío
  //
  // y los dos factores son constantes del motor. Se eligen dos presets en los
  // que el rebote esté LIMPIO —sin paso bajo que lo desparrame y sin la otra
  // etapa encima—, uno por envío:
  //
  //   13 «brite»    reverberación sola, `room_rvblp 0,0`, `room_refl 0,86`
  //                 línea 1 a 0,05 s (la 2 está en 0,0355 y 0,071: no estorba)
  //                 esperado = 0,86 · 11/64 = **0,1478**
  //
  //    2 «metalic»  eco solo (`room_size 0`), `room_dlylp 0,0`, `room_feedback
  //                 0,75`, retardo 0,02 s
  //                 esperado = 0,75 · 1/4  = **0,1875**
  //
  // Con los envíos a 1 saldrían 0,86 y 0,75, o sea 5,8 y 4 veces lo que toca.
  // La tolerancia es del 20 %, que cabe de sobra por debajo de esa distancia.
  const ENVIOS = [
    { tipo: 13, tap: 0.05, espera: 0.86 * (11 / 64), que: "la reverberación (13, línea de 0,05 s): fb · 11/64" },
    { tipo: 2, tap: 0.02, espera: 0.75 * 0.25, que: "el eco (2, retardo de 0,02 s): fb · 1/4" },
  ];
  for (const e of ENVIOS) {
    const m = await medirEnvio(e.tipo, e.tap);
    const razon = m.picoTap / Math.max(m.picoSeco, 1e-12);
    control(`el envío de ${e.que} = ${e.espera.toFixed(4)}`,
      !m.error && Math.abs(razon - e.espera) < e.espera * 0.2,
      m.error ?? `medido ${razon.toFixed(4)} (seco ${m.picoSeco.toFixed(3)}, rebote ${m.picoTap.toFixed(4)})`);
  }

  // ── 6. EL PASO BAJO DE LA REVERBERACIÓN, Y SU SIGNO ───────────────────
  //
  // `room_rvblp` NO es una frecuencia: es un interruptor, y lo que dice el
  // motor es que **con el valor a cero el filtro no se ejecuta**:
  //
  //     dly1->lp = dly2->lp = sxrvb_lp.value;             s_dsp.c:602
  //     ...
  //     if( dly->lp ) { valt = (dly->lp0 + val) >> 1; ... }
  //     else valt = val;                                  s_dsp.c:658-664
  //
  // O sea `lp` distinto de cero = **filtro PUESTO**. Y por eso la familia
  // «brite» (11, 12, 13) lo trae a 0,0: se llama brillante porque no lo lleva.
  //
  // Esto no lo puede ver ningún control de los de arriba, porque ninguno
  // compara dos presets que se diferencien en ese campo. Hacen falta dos, que
  // es la defensa del 50:
  //
  //   13 «brite»    `room_size 0,05`  `room_refl 0,86`  **`room_rvblp 0,0`**
  //   10 «chamber»  `room_size 0,05`  `room_refl 0,95`  **`room_rvblp 1,0`**
  //
  // Los dos tienen la misma reverberación y se diferencian justo en el campo.
  // Así que la cola del 13 tiene que salir **más brillante** que la del 10, y
  // el control cambia de signo si el interruptor está del revés.
  control("la cola de la 13 («brite», sin paso bajo) es MÁS brillante que la de la 10 («chamber», con él)",
    !edana13.error && !camara.error && edana13.brilloCola > camara.brilloCola * 1.5,
    `brillo 13 ${edana13.brilloCola.toFixed(4)} contra 10 ${camara.brilloCola.toFixed(4)}`);

  // ── 7. LA ROTURA DELIBERADA, DENTRO DE LA SONDA ───────────────────────
  //
  // Con el mojado a cero la cola tiene que desaparecer. Si no desaparece, lo
  // que mide el control 4 no es la cadena sino alguna otra cosa — y eso hay que
  // saberlo en la misma pasada, no en una sesión futura.
  const rota = await medir(23, { romperMojado: true });
  control("ROTURA: con el mojado a cero la cueva se queda SIN cola",
    !rota.error && rota.cola < off0.golpe * 1e-3,
    `cola ${rota.cola.toExponential(2)}`);
  control("y el golpe seco sigue oyéndose: es un inserto, no un envío",
    !rota.error && rota.golpe > 0, `golpe ${rota.golpe.toExponential(2)}`);

  control("ningún error de página", errores.length === 0, errores.slice(0, 2).join(" | "));
} catch (e) {
  // EL 65: una sonda que se va por un `catch` tiene que dejar una ROJA, no una
  // nota al pie. Lo que no llegó a correr se cuenta y se dice.
  control("la sonda llegó al final", false, `se cayó: ${e.message}`);
} finally {
  // El aviso de las sondas huérfanas: se cierra el navegador y el servidor
  // aunque la pasada se vaya por un `catch`, y se mata por PID y nunca por
  // nombre de proceso, que se llevaría por delante a otra sesión.
  if (nav) { try { await nav.close(); } catch { /* ya estaba cerrado */ } }
  matar(dev);
}

console.log(`\nLA COLA DE LA REVERBERACIÓN — experimento 82`);
if (liberados) console.log(`  (puerto ${PORT} liberado antes de empezar)`);
for (const c of controles) console.log(`  ${c.bien ? "ok  " : "MAL "} ${c.que.padEnd(72)} ${c.detalle}`);

// El denominador es el DECLARADO, no `controles.length`.
const faltan = PREVISTOS - controles.length;
if (faltan > 0) console.log(`  MAL  ${String(`${faltan} control(es) no llegaron a correr`).padEnd(72)}`);
const mal = controles.filter((c) => !c.bien).length + Math.max(0, faltan);
console.log(`\n  ${PREVISTOS - mal} de ${PREVISTOS} en verde`);
console.log(`
  LO QUE ESTO NO MIDE, y se repite aquí para que no se lea como si lo midiera:
  el nivel en una partida de verdad. Aquí la cadena se rinde fuera de tiempo
  real; lo que el jugador oye lleva encima su volumen y la mezcla. El viaje
  mapa -> reverberacion.js -> audio.js SI tiene control, y no es este: es
  'sondas/edana82.mjs', que planta al jugador en dos 'env_sound' de tipos
  distintos y comprueba que el numero llega al audio.
`);
codigo = mal ? 1 : 0;
process.exit(codigo);
