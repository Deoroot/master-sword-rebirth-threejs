// SUBIR DE NIVEL: el cartel, los avisos, el sonido y los colores.
//
// La cuenta de la experiencia ya estaba —`aprender` en `src/juego/stats.js`,
// `entrenar` en `src/juego/personaje.js`, la curva de `GetExpNeeded`—, y lo que
// se apuntaba al subir era **una línea en la consola de sucesos**. En el juego
// pasan cinco cosas a la vez, repartidas entre el motor y el guion del jugador:
//
//   motor, `CBasePlayer::LearnSkill`, `server/player/playerstats.cpp:138-173`
//     1. un cartel en el centro-izquierda con «Swordsmanship Proficiency +1»,
//        que se escribe letra a letra y va del naranja al verde
//     2. `SendInfoMsg("You become more adept at %s.\n")`, a tu consola
//
//   guion, `game_learnskill`, `player/player_main.script:484-507`
//     3. `infomsg all` con «<nombre> has gained a level!», a TODOS
//     4. `playsound 0 10 magic/converted_EnchP01.wav`
//     5. `clientevent new all player/player_conartist levelup <índice>`, que es
//        la lluvia de colores de cuatro segundos alrededor del cuerpo
//
// Esto es la regla de las cinco. Lo que dibuja está en `src/juego/mensajes.js`
// (1 y 2) y en `src/render/chispas.js` (5).
//
// ── Una cosa que NO existe: el nivel del personaje ──────────────────────────
//
// «cuando sube de nivel». En Master Sword **no hay nivel**: hay nueve
// habilidades con tres propiedades cada una, y lo que sube es una propiedad.
// El guion del jugador sí dice «has gained a level!», así que la palabra es
// suya y se conserva tal cual — pero no hay ningún número al que se le pueda
// llamar nivel, y `resumen()` ya avisa de que su `sumaDeHabilidades` es nuestra
// y no del juego.

// La única importación que sale de `src/play/` hacia `src/juego/`, y va
// explicada porque rompe el orden de las capas: `stats.js` es la tabla de las
// nueve habilidades y sus nombres en inglés —`SkillStatList`, `SkillTypeList`,
// `SpellTypeList`—, no tiene DOM y ya corre en el servidor (`src/red/partida.js`
// la importa). Copiar aquí los catorce nombres para respetar el orden de las
// carpetas sería tener dos listas que se pueden desincronizar, que es peor.
import { HABILIDADES, PROPIEDADES, ESCUELAS } from "../juego/stats.js";

/**
 * Los parámetros del cartel, los catorce, tal como los pone el motor:
 *
 *     hudtextparms_t htp;  memset(&htp, 0, sizeof(hudtextparms_t));
 *     htp.x = 0.02;  htp.y = 0.6;  htp.effect = 2;
 *     htp.r1 = 0;    htp.g1 = 128; htp.b1 = 0;
 *     htp.r2 = 178;  htp.g2 = 119; htp.b2 = 0;
 *     htp.fadeinTime = 0.02;  htp.fadeoutTime = 3.0;
 *     htp.holdTime = 2.0;     htp.fxTime = 0.6;
 *                                                     playerstats.cpp:138-152
 *
 * `memset` a cero antes, que es lo que deja `channel = 0` y **los dos alfas a
 * cero** — que en un `hudtextparms_t` no significa transparente: el dibujante
 * de HL no mira `a1`/`a2` para nada en el efecto 2, sólo mezcla los dos RGB.
 *
 * El sitio, 0,02 y 0,6, es el 2 % del ancho y el 60 % del alto: pegado al borde
 * izquierdo, un poco por debajo de la mitad. No es el centro de la pantalla y
 * no se pisa con el anuncio de muerte, que sí lo es.
 */
export const CARTEL = {
  x: 0.02, y: 0.6,
  efecto: 2,
  color1: [0, 128, 0],     // verde, el color en el que se queda
  color2: [178, 119, 0],   // ámbar, el del fogonazo de cada letra
  entrada: 0.02,           // `fadein`: y también lo que tarda cada letra
  aguante: 2.0,            // `holdtime`
  salida: 3.0,             // `fadeout`
  fx: 0.6,                 // `fxtime`
};

/**
 * Cuántas veces se manda el MISMO cartel. **Dos.** Y es un fallo del motor.
 *
 *     UTIL_HudMessage(this, htp, "%s %s +1\n", ...SkillTypeList[best]);   // (A)
 *     if (!is_spell_stat) {
 *       SendInfoMsg("You become more adept at %s.\n", ...);
 *       UTIL_HudMessage(this, htp, "%s %s +1\n", ...SkillTypeList[best]); // (B)
 *     } else {
 *       SendInfoMsg("You become more adept at %s.\n", SkillStatList[i]);
 *       UTIL_HudMessage(this, htp, "%s %s +1\n", ...SpellTypeList[best]);
 *     }
 *                                                     playerstats.cpp:153-167
 *
 * Para una habilidad de armas (A) y (B) son **idénticos**: el mismo texto, el
 * mismo sitio, el mismo instante. `CHudMessage` tiene dieciséis ranuras y los
 * mete en dos, así que se dibujan uno encima de otro. En un texto opaco eso no
 * se nota; con el efecto 2, que mezcla, **se nota**: el cartel sale más
 * saturado de lo que saldría una vez. Va portado con el fallo.
 *
 * Y para la magia no son idénticos: (A) lleva la propiedad de armas —«Spell
 * Casting Balance +1»— y (B) la escuela —«Spell Casting Ice +1»—. O sea que al
 * subir magia salen **dos carteles distintos y uno de los dos miente**. El
 * primero, el que no tiene sentido, es el que manda el bucle: `iBestSubstatId`
 * ahí es el índice de la escuela (0-4) y se usa para indexar `SkillTypeList`,
 * que sólo tiene tres. Con la escuela 3 o 4 eso es **leer fuera del array**.
 */
export const VECES = 2;

/** Nombre legible de una habilidad. `SkillStatList[i].Name`. */
export function nombreDeHabilidad(clave) {
  return HABILIDADES.find((h) => h.clave === clave)?.nombre ?? clave;
}

/** Nombre legible de una propiedad o escuela. `SkillTypeList` / `SpellTypeList`. */
export function nombreDePropiedad(clave) {
  return PROPIEDADES.find((p) => p.clave === clave)?.nombre
    ?? ESCUELAS.find((e) => e.clave === clave)?.nombre
    ?? clave;
}

/**
 * Los textos que salen al subir una propiedad de `habilidad`.
 *
 * `donde` es lo que devuelve `entrenar`: `"swordsmanship.power"`.
 *
 * Devuelve las cinco piezas, y los carteles ya repetidos, para que quien
 * dibuje no tenga que saberse el fallo de arriba. `carteles` es una lista
 * porque en magia los dos no son iguales.
 */
export function subida(donde, nombreDelJugador = "Someone") {
  const [hab, prop] = String(donde ?? "").split(".");
  const esMagia = hab === "spellcasting";
  const nomHab = nombreDeHabilidad(hab);
  // (A): SIEMPRE con `SkillTypeList`, sea magia o no. Para la magia eso es la
  // propiedad de armas que caiga en el índice de la escuela — el fallo de
  // arriba —, y con `divination` (3) o `affliction` (4) el motor lee fuera del
  // array de tres. Aquí no se puede leer fuera de un array de JavaScript, así
  // que el índice desbordado da `undefined`; se escribe como lo que es.
  const iProp = esMagia
    ? ESCUELAS.findIndex((e) => e.clave === prop)
    : PROPIEDADES.findIndex((p) => p.clave === prop);
  const comoArmas = PROPIEDADES[iProp]?.nombre ?? "???";
  const carteles = esMagia
    ? [`${nomHab} ${comoArmas} +1`, `${nomHab} ${nombreDePropiedad(prop)} +1`]
    : Array.from({ length: VECES }, () => `${nomHab} ${nombreDePropiedad(prop)} +1`);
  return {
    habilidad: hab, propiedad: prop, esMagia,
    /** (1) El cartel, ya repetido las veces que lo repite el motor. */
    carteles,
    /** (2) `SendInfoMsg`, a tu consola y sólo a la tuya. */
    adepto: `You become more adept at ${nomHab}.`,
    /** (3) `infomsg all`: lo ve todo el servidor. */
    anuncio: {
      titulo: `${nombreDelJugador} has gained a level!`,
      // Sin sujeto, y así está en el guion: el título lleva el nombre y el
      // cuerpo empieza por el verbo. `stradd MESSAGE_STRING PARAM1`, y PARAM2
      // sólo se añade si la habilidad empieza por «Spell».
      cuerpo: `has gained experience in ${nomHab}` +
        (nomHab.startsWith("Spell") ? ` ${nombreDePropiedad(prop)}` : ""),
    },
    /** (4) El sonido. */
    sonido: SONIDO,
  };
}

/**
 * El sonido de subir.
 *
 *     const SOUND_LEVELUP1 magic/converted_EnchP01.wav
 *     playsound 0 10 SOUND_LEVELUP1 //SOUND_LEVELUP2
 *                             player/player_main.script:43 y 502
 *
 * El `//SOUND_LEVELUP2` comentado al lado no existe en ninguna parte del guion:
 * no hay `const SOUND_LEVELUP2`. Es un resto.
 */
export const SONIDO = "magic/converted_enchp01.wav";

// ── (1) El cartel, dibujado: el efecto 2 de `CHudMessage` ──────────────────
//
// El efecto 2 es «escribir a máquina»: las letras aparecen de una en una, cada
// una con un fogonazo del color 2 que se apaga hacia el color 1. Hay que
// portarlo entero porque es lo que se vio —«mensajes de lo que subió de nivel»—
// y porque sin él el cartel es texto verde sin más.

/**
 * Cuándo empieza a apagarse el cartel entero.
 *
 *     m_parms.fadeTime = (pMessage->fadein * m_parms.length) + pMessage->holdtime;
 *                                                        message.cpp:222-223
 *
 * **El aguante empieza cuando ha salido la última letra**, y `length` es el
 * texto entero contando los saltos de línea. Con 0,02 por letra y «Swordsmanship
 * Proficiency +1\n» —30 caracteres— eso son 0,6 + 2,0 = 2,6 s antes de empezar
 * a irse, y 3 s más para irse. El cartel dura **5,6 segundos**.
 */
export function finDelAguante(largo, c = CARTEL) {
  return c.entrada * largo + c.aguante;
}

/**
 * La mezcla global del final, de 0 (a la vista) a 255 (apagado).
 *
 *     if (m_parms.time > m_parms.fadeTime && pMessage->fadeout > 0)
 *       m_parms.fadeBlend = (((m_parms.time - m_parms.fadeTime) / pMessage->fadeout) * 255);
 *     else m_parms.fadeBlend = 0;
 *                                                        message.cpp:225-228
 *
 * Sin tope: pasados los 3 s de salida el valor se va por encima de 255 y lo
 * corta después `if (blend > 255) blend = 255` (message.cpp:179-182). Se copia
 * el desbordamiento y el corte donde están, no antes.
 *
 * Y se TRUNCA, porque `fadeBlend` es `int` (`hud.h:271`) y la cuenta de la
 * derecha es un `double`: la asignación en C tira los decimales hacia cero. No
 * es una sutileza de un píxel, es la diferencia entre este puerto y el motor en
 * cada fotograma del apagado.
 */
export function mezclaFinal(t, largo, c = CARTEL) {
  const fin = finDelAguante(largo, c);
  if (!(t > fin) || !(c.salida > 0)) return 0;
  return Math.trunc(((t - fin) / c.salida) * 255);
}

/**
 * El color de la letra número `i` en el instante `t`. Efecto 2, entero.
 *
 *     case 2:
 *       m_parms.charTime += m_parms.pMessage->fadein;
 *       if (m_parms.charTime > m_parms.time) { srcRed = srcGreen = srcBlue = 0; blend = 0; }
 *       else {
 *         float deltaTime = m_parms.time - m_parms.charTime;
 *         destRed = destGreen = destBlue = 0;
 *         if (m_parms.time > m_parms.fadeTime) blend = m_parms.fadeBlend;
 *         else if (deltaTime > m_parms.pMessage->fxtime) blend = 0;
 *         else {
 *           destRed = r2; destGreen = g2; destBlue = b2;
 *           blend = 255 - (deltaTime * (1.0 / fxtime) * 255.0 + 0.5);
 *         }
 *       }
 *                                                        message.cpp:151-176
 *     m_parms.r = ((srcRed * (255 - blend)) + (destRed * blend)) >> 8;
 *                                                        message.cpp:184-186
 *
 * Tres cosas que hay que copiar y que dan la gana de «arreglar»:
 *
 *   **`charTime += fadein` ANTES de comparar.** O sea que la primera letra sale
 *   en `t = 0,02`, no en `t = 0`: el índice que cuenta es `i + 1`.
 *
 *   **Una letra que todavía no ha salido se dibuja NEGRA, no se salta.** El
 *   `srcRed = srcGreen = srcBlue = 0` con `blend = 0` es negro puro sobre el
 *   fondo, y la letra se dibuja igual. En una pantalla oscura no se ve y por
 *   eso parece que aparecen; sobre algo claro, el cartel entero está ahí desde
 *   el primer fotograma, en negro.
 *
 *   **El `>> 8` en vez de `/ 255`.** Dividir por 256 donde la mezcla va de 0 a
 *   255: el resultado se queda siempre un pelo corto —verde 128 sale 127— y con
 *   mezcla 255 no se llega nunca del todo al color 2. Es de Valve y se copia.
 */
export function colorDeLetra(i, t, { largo = 0, c = CARTEL } = {}) {
  const salida = (i + 1) * c.entrada;          // `charTime += fadein`
  let src = c.color1, dest = [0, 0, 0], mezcla = 0;
  if (salida > t) {
    src = [0, 0, 0];
    mezcla = 0;
  } else {
    const delta = t - salida;
    if (t > finDelAguante(largo, c)) mezcla = mezclaFinal(t, largo, c);
    else if (delta > c.fx) mezcla = 0;
    else {
      dest = c.color2;
      // `int blend = 255 - (...)`: se trunca al asignar, igual que arriba. Con
      // `delta = 0` eso es 254 y no 255, así que **ni la primera letra recién
      // salida llega al color 2 del todo**.
      mezcla = Math.trunc(255 - (delta * (1 / c.fx) * 255 + 0.5));
    }
  }
  mezcla = Math.max(0, Math.min(255, mezcla));
  return [0, 1, 2].map((k) => (src[k] * (255 - mezcla) + dest[k] * mezcla) >> 8);
}

// ── (5) La lluvia de colores ───────────────────────────────────────────────
//
// `clientevent new all player/player_conartist levelup <índice>` arranca el
// guion de cliente `player/player_conartist.script:18-37`, que hace esto:
//
//     cleffect light new $getcl(MY_OWNER,origin) 200 (0,255,0) 3.0
//     setvard LEVELUP_SPRITES 1
//     setvard LIGHT_RAD 200
//     callevent sprite_spoog
//     callevent 4.0 end_fx_levelup
//
// y `sprite_spoog` (líneas 70-77) se llama a sí mismo cada 0,1 s hasta que
// `end_fx_levelup` borra el guion a los 4 s. Cada vuelta crea **cuatro**
// sprites (`levelup_createsprite`, líneas 84-119) y vuelve a poner la luz con
// un color al azar y 0,1 s de vida.
//
// Cuarenta vueltas por cuatro sprites: **160 sprites en cuatro segundos**. Eso
// es el «montón de efectos de colores alrededor del personaje».
//
// Y hay trece líneas muertas: `levelup_createsprite` calcula `RND_LEFT`,
// `RND_RIGHT`, `SPRITE_VEL` y los tres `COLOR_*` al empezar y **no usa ninguno**
// — `setup_levelup_sprite` los vuelve a calcular todos. También está muerto el
// `const LEVELUP_SCRIPT player/player_cl_effects_levelup` de
// `player_main.script:44`: el guion viejo existe, tiene el mismo efecto con un
// `repeatdelay 0.1` en vez de la recursión, y **nadie lo llama** — la línea 504
// nombra `player/player_conartist` a pelo.

export const EFECTO = {
  /** `callevent 4.0 end_fx_levelup`. */
  duracion: 4.0,
  /** `callevent 0.1 sprite_spoog`, y la primera vuelta es inmediata. */
  periodo: 0.1,
  /** Cuatro `cleffect tempent sprite` por vuelta. */
  porVuelta: 4,
  /** La luz verde de la primera vuelta: `200 (0,255,0) 3.0`. */
  luz: { radio: 200, color: [0, 255, 0], vida: 3.0 },
  /** Y la de cada vuelta, que reusa el mismo id: radio 200, color al azar, 0,1 s. */
  luzPorVuelta: { radio: 200, vida: 0.1 },
  /**
   * Dónde nace cada sprite:
   *
   *     local RND_RAD $rand(0,359)
   *     vectoradd START_POS $relpos($vec(0,RND_RAD,0),$vec(0,DIST,-32))
   *
   * con `DIST = 32`. O sea un anillo de 32 unidades de radio —81 cm— a un giro
   * al azar, **32 unidades por debajo del origen**, que en un jugador de pie es
   * a la altura de los pies. No salen del cuerpo: salen del suelo alrededor.
   */
  anillo: { radio: 32, alto: -32 },
  /** `xflare1.spr`, y el sprite no está: ver `SUSTITUTOS` en `src/bsp/halo.js`. */
  sprite: "xflare1.spr",
};

/**
 * Las propiedades de un sprite recién creado. `setup_levelup_sprite`,
 * `player/player_conartist.script:122-155`.
 *
 *     death_delay 1.0   framerate 30   frames 20
 *     velocity ($randf(-20,20), $randf(-20,20), 0)
 *     scale 0.25   rendermode add   renderamt 255
 *     rendercolor ($rand(0,255), $rand(0,255), $rand(0,255))
 *     gravity -0.5   collide none
 *
 * **La gravedad es NEGATIVA y por eso suben.** El cliente hace
 * `gravity = -frametime · cl_gravity · curstate.gravity`
 * (`entity.cpp:1942,1951-1952`) y luego `baseline.origin[2] += gravity`
 * (`entity.cpp:2301-2302`), con la velocidad guardada en `baseline.origin`
 * —«Velocity is stored in entity.baseline.origin... why? ASK VALVE»,
 * `entity.cpp:1653`—. Con `cl_gravity` 800 y el `-0,5` del guion eso son
 * **+400 unidades por segundo al cuadrado hacia arriba**: en el segundo que
 * viven suben 200 unidades, cinco metros. Es una fuente, no un polvillo.
 *
 * Los 20 cuadros a 30 por segundo dan 0,67 s de animación en bucle
 * (`FTENT_SPRANIMATELOOP` es lo que ponen por defecto los sprites,
 * `entity.cpp:958`) dentro de un segundo de vida.
 */
export const CHISPA = {
  vida: 1.0,
  cuadros: 20,
  porSegundo: 30,
  velocidad: 20,          // `$randf(-20,20)` en X e Y; la Z arranca a cero
  escala: 0.25,
  mezcla: "aditivo",
  alfa: 255,
  gravedad: -0.5,
  choca: false,
};

/** `cl_gravity`, la de siempre de GoldSrc. */
export const CL_GRAVITY = 800;

/**
 * La lista entera de lo que hay que crear, sin azar ni reloj: se le dan los dos.
 *
 * `azar()` se llama en el mismo orden que el guion —giro, y luego las dos
 * velocidades y los tres colores de `setup_levelup_sprite`— para que una
 * semilla fija dé siempre lo mismo y las pruebas puedan mirar números.
 */
export function chispasDeUnaVuelta({ azar = Math.random, e = EFECTO } = {}) {
  const fuera = [];
  for (let i = 0; i < e.porVuelta; i++) {
    // `$rand(0,359)`: grados enteros, los dos extremos incluidos.
    const grados = Math.floor(azar() * 360);
    const a = (grados * Math.PI) / 180;
    fuera.push({
      grados,
      // En los ejes del port: el anillo es horizontal y `alto` va en Y.
      desplazamiento: [Math.cos(a) * e.anillo.radio, e.anillo.alto, -Math.sin(a) * e.anillo.radio],
      velocidad: [
        (azar() * 2 - 1) * CHISPA.velocidad,
        0,
        (azar() * 2 - 1) * CHISPA.velocidad,
      ],
      color: [Math.floor(azar() * 256), Math.floor(azar() * 256), Math.floor(azar() * 256)],
    });
  }
  return fuera;
}

/** Cuántas vueltas da el efecto entero. La primera es en `t = 0`. */
export function vueltas(e = EFECTO) {
  return Math.round(e.duracion / e.periodo);
}
