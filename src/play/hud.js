// EL HUD DE MASTER SWORD, la regla. Sin DOM, sin Three y sin Rapier.
//
// Aquí está lo que decide QUÉ se ve: qué cuadro de la barra toca, a qué
// velocidad persigue el número al valor de verdad, de qué color va la cifra, y
// cómo crece y se encoge la consola de sucesos. El dibujo va en
// `src/juego/hudms.js`, que es el que sabe de `div`.
//
// La separación no es manía: la consola de sucesos tiene un buffer circular,
// tres contadores y un reloj de decaimiento, y eso se comprueba en Node en
// milisegundos. Metido en el DOM haría falta un navegador para saber si la
// quinta línea desaparece cuando debe.
//
// ── Lo que hay que saber antes de tocar nada ────────────────────────────────
//
// Master Sword Rebirth tiene DOS HUD y elige con un cvar:
//
//     if (CVAR_GET_FLOAT("cl_retrohud") > 0) { retro } else { primario }
//                                                   vgui_hud.cpp:162-169
//     CVAR_CREATE("cl_retrohud", "0", FCVAR_ARCHIVE);        hudmisc.cpp:58
//
// El **retro** son los dos frascos redondos con las barritas de aguante y peso
// debajo — el de las capturas antiguas del juego. El **primario**, que es el que
// sale por defecto, son **cuatro barras** de 320×40 con un emblema en medio. Lo
// que está portado aquí es el primario, que es lo que ve quien instala el juego
// hoy. El retro está declarado como no hecho y sus dos `.spr` siguen en su sitio.
//
// Los números de pantalla salen todos de `vgui_health.h`. Los colores de suceso,
// de `playershared.cpp:1183`. Los cvars, de `clientlibrary.cpp:161-169`.

/**
 * Los cvars del HUD, con el valor que trae el juego recién instalado.
 *
 *     CVAR_CREATE("ms_evthud_decaytime", "5",  FCVAR_ARCHIVE);
 *     CVAR_CREATE("ms_evthud_history",   "10", FCVAR_ARCHIVE);
 *     CVAR_CREATE("ms_evthud_size",      "5",  FCVAR_ARCHIVE);
 *     CVAR_CREATE("ms_evthud_bgtrans",   "0",  FCVAR_CLIENTDLL);
 *                                                   clientlibrary.cpp:161-164
 *
 * `size` son las líneas que se ven a la vez y `history` las que se guardan: son
 * cosas distintas y por eso son dos números. La consola de sucesos enseña cinco
 * y recuerda diez; la del chat enseña ocho y recuerda cincuenta.
 */
export const CVARS = Object.freeze({
  ms_evthud_size: 5,
  ms_evthud_history: 10,
  ms_evthud_decaytime: 5,
  ms_evthud_bgtrans: 0,
  ms_txthud_size: 8,
  ms_txthud_history: 50,
  ms_txthud_decaytime: 9,
  ms_txthud_bgtrans: 0,
  ms_txthud_width: 640,
  cl_retrohud: 0,
});

/** El tope duro del motor: `#define EVENTCON_MAXLINES 128`. */
export const MAX_LINEAS = 128;

/**
 * Los SEIS colores de suceso, tal cual.
 *
 *     static COLOR HUDEventColor[] = {
 *         COLOR(220, 220, 220, 0),          //HUDEVENT_NORMAL
 *         COLOR(160, 160, 160, 0),          //HUDEVENT_UNABLE
 *         COLOR(255 * 0.7, 170 * 0.7, 0, 0),//HUDEVENT_ATTACK
 *         COLOR(240, 0, 0, 0),              //HUDEVENT_ATTACKED
 *         COLOR(0, 240, 0, 0),              //HUDEVENT_GREEN
 *         COLOR(0, 0, 240, 0),              //HUDEVENT_BLUE
 *     };                                          playershared.cpp:1183-1191
 *
 * El alfa es 0 en los seis y no significa «invisible»: VGUI lo usa al revés —
 * `setFgColor(r,g,b,a)` donde `a` es cuánto se DESTIÑE. Es la misma inversión
 * que hacía invisible el fondo del panel de personaje en el experimento 10.
 *
 * `ATTACK` es (178, 119, 0) porque está escrito como `255 * 0.7` y `170 * 0.7`
 * truncados a entero: un ámbar oscuro, no el naranja de 255,170,0.
 */
export const COLORES_DE_SUCESO = Object.freeze({
  normal: Object.freeze({ rgb: [220, 220, 220], que: "lo corriente" }),
  nopuedes: Object.freeze({ rgb: [160, 160, 160], que: "no puedes hacer eso" }),
  ataque: Object.freeze({ rgb: [178, 119, 0], que: "el resultado de TU ataque" }),
  atacado: Object.freeze({ rgb: [240, 0, 0], que: "te han atacado" }),
  bueno: Object.freeze({ rgb: [0, 240, 0], que: "algo bueno" }),
  azul: Object.freeze({ rgb: [0, 0, 240], que: "algo azul (el motor no dice más)" }),
});

/** `rgb(r, g, b)` de un tipo de suceso, para CSS. */
export function colorDeSuceso(tipo) {
  const c = COLORES_DE_SUCESO[tipo] ?? COLORES_DE_SUCESO.normal;
  return `rgb(${c.rgb[0]}, ${c.rgb[1]}, ${c.rgb[2]})`;
}

/** `XRES(x)` y `YRES(y)` del motor: la pantalla de referencia es 640×480. */
export const XRES = (x, ancho) => Math.floor(x * (ancho / 640) + 0.5);
export const YRES = (y, alto) => Math.floor(y * (alto / 480) + 0.5);

/**
 * LA ESCALA DE LAS BARRAS, y es la rareza gorda de este HUD.
 *
 *     //Scales flasks down to only 40% wide of the screen if sprites are too big
 *     #define BAR_SCALE (1.0f - ((730 - (ScreenWidth * 0.40f)) / ScreenHeight))
 *     #define BAR_W (320 * BAR_SCALE)
 *     #define BAR_H (40 * BAR_SCALE)
 *     #define EMBLEM_SIZE (90 * BAR_SCALE)              vgui_health.h:9-13
 *
 * No es «escala = alto / 480», que es lo que hace `XRES`/`YRES` y lo que hace
 * todo lo demás del HUD. Es una resta contra 730 dividida por el ALTO, y mezclar
 * el ancho en el numerador con el alto en el denominador tiene una consecuencia
 * que se mide:
 *
 *     640×480    escala 0,013   barra de   4 px   → invisible
 *     1024×768   escala 0,583   barra de 187 px
 *     1280×720   escala 0,697   barra de 223 px
 *     1920×1080  escala 1,035   barra de 331 px   → más grande que el dibujo
 *
 * O sea que el HUD del juego **se hace grande en pantallas anchas y desaparece
 * en las estrechas**, y en ninguna resolución vale 1. El comentario dice que la
 * intención era limitar las barras al 40 % del ancho; lo que sale es otra cosa.
 *
 * Va portado tal cual y con un interruptor al lado (`AJUSTES.escalaDelMotor`),
 * porque en una ventana de navegador cualquiera esto se nota enseguida.
 */
export function LIENZO(ancho, alto) {
  const escala = 1 - (730 - ancho * 0.4) / alto;
  return {
    escala,
    anchoBarra: 320 * escala,
    altoBarra: 40 * escala,
    emblema: 90 * escala,
  };
}

/**
 * La escala NUESTRA, la que se usa si se apaga la del motor.
 *
 * Es la misma regla que el resto del HUD —`YRES`, o sea alto/480— con un tope
 * arriba para que en un monitor de 4K las barras no ocupen media pantalla. No
 * pretende ser del juego y por eso está en su propia función.
 */
export function LIENZO_NUESTRO(ancho, alto) {
  const escala = Math.min(alto / 480, 1.6);
  return { escala, anchoBarra: 320 * escala, altoBarra: 40 * escala, emblema: 90 * escala };
}

/**
 * Los interruptores, apagados = como el motor.
 *
 * Misma disciplina que `AJUSTES` de `src/play/proyectil.js`: lo que se porta es
 * lo que hace el juego, y lo que nos parece mejorable va detrás de un booleano
 * que arranca en la posición del motor.
 */
export const COMO_EL_MOTOR = Object.freeze({
  escalaDelMotor: true,       // el BAR_SCALE de la resta contra 730
  cargaSoloConCarga: true,    // GetHighestAttackCharge()==0 apaga la barra de carga
});
export const AJUSTES = { ...COMO_EL_MOTOR };

/**
 * Dónde va cada cosa, en píxeles de la ventana.
 *
 *     coords[0] = 10;                                        //x, literal
 *     coords[1] = ScreenHeight - 2*BAR_H - YRES(10);          //y
 *     m_Bar[0] = new VGUI_Bar(this, 0, coords[0], coords[1]);            //vida
 *     m_Bar[2] = new VGUI_Bar(this, 2, coords[0], coords[1] + BAR_H);    //peso
 *     m_Bar[1] = ... coords[0] + BAR_W + EMBLEM_SIZE - 1, coords[1]);    //maná
 *     m_Bar[3] = ... coords[0] + BAR_W + EMBLEM_SIZE - 1, +BAR_H);       //aguante
 *     m_HUDImage.setPos(coords[0] + BAR_W, coords[1] - (7 * BAR_SCALE));
 *                                                        vgui_health.h:157-179
 *
 * Dos detalles que parecen erratas y no lo son: la x es un **10 pelado**, no
 * `XRES(10)` —la única medida del panel que no escala— y el `- 1` de las barras
 * de la derecha es un píxel de solape para que el emblema no deje costura.
 *
 * El orden en pantalla no es el del `switch`: **vida arriba a la izquierda, peso
 * debajo, maná arriba a la derecha, aguante debajo**. Es la pareja que sorprende
 * — uno espera vida/maná juntos y son vida/peso.
 */
export function disposicionDelHud(ancho, alto, { ajustes = AJUSTES } = {}) {
  const L = ajustes.escalaDelMotor ? LIENZO(ancho, alto) : LIENZO_NUESTRO(ancho, alto);
  const { anchoBarra: w, altoBarra: h, emblema: e, escala } = L;
  const x = 10;
  const y = alto - 2 * h - YRES(10, alto);
  const xDerecha = x + w + e - 1;
  return {
    escala, anchoBarra: w, altoBarra: h, emblema: e,
    barras: {
      vida: { x, y, w, h },
      peso: { x, y: y + h, w, h },
      mana: { x: xDerecha, y, w, h },
      aguante: { x: xDerecha, y: y + h, w, h },
    },
    // El emblema pisa las barras a propósito: empieza donde acaba la de la
    // izquierda y las de la derecha empiezan un píxel antes de donde él acaba.
    emblemaEn: { x: x + w, y: y - 7 * escala, w: e, h: e },
    carga: cargaEn(ancho, alto),
    // La cifra «12/25» va centrada a un quinto de la altura de la barra:
    //     m_Label = new MSLabel(this, "0/0", 0, getTall()/5, getWide(), YRES(8), a_center);
    cifra: { arriba: h / 5, alto: YRES(8, alto) },
  };
}

/**
 * LAS DOS BARRAS DE CARGA, y traen una errata de precedencia de C.
 *
 *     int Multiplier = (i == 0) ? -1 : 1;
 *     float OffsetW = CHARGE_SPACER_W + (i == 0) ? CHARGE_W : 0;
 *     m_Charge[i] = new CStatusBar(this, XRES(304) + OffsetW * Multiplier,
 *                                  YRES(408), CHARGE_W, CHARGE_H);
 *                                                      vgui_health.h:184-186
 *
 * `+` liga más fuerte que `?:`, así que eso se lee
 * `(CHARGE_SPACER_W + (i==0)) ? CHARGE_W : 0`. El paréntesis de la izquierda
 * nunca es cero —`CHARGE_SPACER_W` es `XRES(2)`—, o sea que la condición es
 * **siempre verdadera** y `OffsetW` vale siempre `CHARGE_W`. El espaciador que
 * le da nombre a la variable no llega a sumarse nunca.
 *
 * Lo que sale: las dos barras a ±30 px del centro, con un hueco de 30 px entre
 * ellas. Lo que se quería, casi seguro, era `CHARGE_SPACER_W + (i==0 ? CHARGE_W : 0)`,
 * que las deja pegadas con dos píxeles en medio.
 *
 * Y tampoco están centradas: el ancla es `XRES(304)`, no `XRES(320)`. El HUD
 * retro sí usa 320 (vgui_healthretro.h:198), así que el 304 se quedó de algún
 * ajuste del primario.
 */
export function cargaEn(ancho, alto) {
  const w = XRES(30, ancho), h = YRES(6, alto);
  const espaciador = XRES(2, ancho);
  // QUÉ MANO ES CADA ÍNDICE, que estuvo al revés desde el 24 y se veía jugando:
  // cargabas con la derecha y se encendía la barra de la izquierda.
  //
  //     enum hand_e { LEFT_HAND, RIGHT_HAND, HAND_PLAYERHANDS, ... };
  //                                                      genericitem.h:15-23
  //     int Bar = Item->m_Hand < 2 ? Item->m_Hand : 1;
  //                                                      vgui_health.h:234
  //
  // O sea `LEFT_HAND == 0` y `RIGHT_HAND == 1`: el índice 0 es la IZQUIERDA, y
  // con el multiplicador de abajo —que es −1 en el 0— sale a la izquierda del
  // ancla. Cada barra cae del lado de su mano, que es lo que uno espera. Y un
  // arma a dos manos (`BOTH_HANDS == 4`) cae en la 1 por el `< 2 ? : 1`, o sea
  // en la derecha.
  const manos = ["izquierda", "derecha"];
  return manos.map((mano, i) => {
    const multiplicador = i === 0 ? -1 : 1;
    // La errata, transcrita: el `+` liga antes que el `?:`, así que lo que se
    // evalúa es `(espaciador + (i==0))`, que nunca es cero.
    const offset = (espaciador + (i === 0 ? 1 : 0)) ? w : 0;
    return { mano, x: XRES(304, ancho) + offset * multiplicador, y: YRES(408, alto), w, h };
  });
}

// ── LAS BARRAS ──────────────────────────────────────────────────────────────

/**
 * A qué velocidad persigue el número al valor de verdad, en puntos por segundo.
 *
 *     int AccelFlasks = 10;
 *     AccelFlasks = 15 * (MaxAmt / 100);
 *     if (AccelFlasks < 40) AccelFlasks = 40;
 *     if (AccelFlasks > MaxAmt) AccelFlasks = MaxAmt - 1;
 *     if (fabs(m_CurrentAmt - Amt) > 200) AccelFlasks = 1000;
 *                                                       vgui_health.h:79-87
 *
 * Tres cosas de esas cinco líneas:
 *
 *   el `= 10` está MUERTO       se sobreescribe en la línea siguiente sin usarse.
 *   el suelo de 40 manda casi siempre  `15 * (max/100)` no llega a 40 hasta que
 *                               el máximo pasa de 267, o sea nunca para un
 *                               personaje normal.
 *   y entonces el techo lo baja  con 25 de vida, 40 > 25 y la velocidad acaba
 *                               siendo `MaxAmt - 1` = **24 puntos por segundo**.
 *                               El vaso de un novato tarda un segundo en llenarse
 *                               entero, y el de uno veterano tarda menos.
 *
 * El salto a 1000 cuando la diferencia pasa de 200 es lo que evita que al cambiar
 * de mapa la barra suba despacito desde cero durante diez segundos.
 */
export function velocidadDeRelleno(actual, objetivo, maximo) {
  let acel = 15 * (maximo / 100);
  if (acel < 40) acel = 40;
  if (acel > maximo) acel = maximo - 1;
  if (Math.abs(actual - objetivo) > 200) acel = 1000;
  return acel;
}

/**
 * Un paso del número que se ve hacia el número que es.
 *
 *     if (m_CurrentAmt < 0) m_CurrentAmt = 0.0;
 *     if (m_CurrentAmt > 3000) m_CurrentAmt = 3000.0;
 *     if (m_CurrentAmt < Amt)      m_CurrentAmt += V_min(MaxChange, Amt - m_CurrentAmt);
 *     else if (m_CurrentAmt > Amt) m_CurrentAmt -= V_min(MaxChange, m_CurrentAmt - Amt);
 *                                                       vgui_health.h:91-100
 *
 * El recorte a [0, 3000] va ANTES de moverse, así que un personaje con más de
 * 3000 de vida vería el vaso clavado — que es un tope que hoy no alcanza nadie,
 * pero está y se porta.
 */
export function seguir(actual, objetivo, maximo, dt) {
  let cur = actual;
  if (cur < 0) cur = 0;
  if (cur > 3000) cur = 3000;
  const paso = dt * velocidadDeRelleno(cur, objetivo, maximo);
  if (cur < objetivo) cur += Math.min(paso, objetivo - cur);
  else if (cur > objetivo) cur -= Math.min(paso, cur - objetivo);
  return cur;
}

/**
 * Qué cuadro del `.spr` toca.
 *
 *     float frame = (m_CurrentAmt / MaxAmt) * LastFrame;
 *     if (frame > 0 && frame < 1) frame = 1;   //Cap at 1, unless dead
 *     if (frame > LastFrame) frame = LastFrame;
 *     frame = V_max(frame, 0);                          vgui_health.h:102-107
 *
 * El «cap at 1 unless dead» es la decisión que hace legible la barra: con un
 * punto de vida de veinticinco, `(1/25)*42` da 1,68 y redondearía a 1 igual —
 * pero con 500 de máximo daría 0,08, y sin ese suelo un jugador a punto de morir
 * vería el vaso **vacío**, igual que uno muerto. Con el suelo, vacío del todo
 * significa muerto y nada más.
 *
 * Devuelve un float, como el motor: quien dibuja decide si redondea.
 */
export function cuadroDeBarra(actual, maximo, cuadros) {
  const ultimo = cuadros - 1;
  if (!(maximo > 0)) return 0;
  let f = (actual / maximo) * ultimo;
  if (f > 0 && f < 1) f = 1;
  if (f > ultimo) f = ultimo;
  return Math.max(f, 0);
}

/**
 * De qué color va la cifra de la barra.
 *
 *     m_Label->SetFGColorRGB(COLOR(255, 255, 255, 10));
 *     if (m_Type != 2) {
 *         if (m_CurrentAmt > MaxAmt / 4.0f) ...blanco
 *         else                              ...COLOR(250, 0, 0, 10)
 *     }                                                vgui_health.h:112-118
 *
 * Blanco, y rojo por debajo de un cuarto. **El peso no**: `m_Type != 2` lo
 * exceptúa, y tiene sentido — en las otras tres poco es malo y en el peso poco
 * es bueno, así que un peso bajo en rojo diría lo contrario de lo que pasa.
 */
export function colorDeCifra(clave, actual, maximo) {
  if (clave === "peso") return "rgb(255, 255, 255)";
  return actual > maximo / 4 ? "rgb(255, 255, 255)" : "rgb(250, 0, 0)";
}

/**
 * Si el HUD se ve.
 *
 *     bool ShowHUD() {
 *         if (MSCLGlobals::CharPanelActive) return false;
 *         if (!player.IsAlive())            return false;
 *         if (HIDEHUD_ALL)                  return false;
 *         if (ms_hidehud)                   return false;
 *     }
 *     bool ShowHealth() { return CHARSTATE_LOADED ? ShowHUD() : false; }
 *                                                     clplayer.cpp:1266-1280
 *
 * Con el panel de personaje abierto el HUD **se esconde**, y muerto también. Las
 * dos son del motor y las dos se notan: sin la primera, las barras se quedan
 * encima de la hoja de personaje.
 */
export function seVeElHud({ panelAbierto = false, vivo = true, cargado = true, escondido = false } = {}) {
  if (panelAbierto) return false;
  if (!vivo) return false;
  if (escondido) return false;
  return cargado;
}

/**
 * LA BARRA DE CARGA NO SALE NUNCA CON UN ARCO, y no es cosa nuestra.
 *
 *     bool CGenericItem::Attack_IsCharging()
 *     {
 *         //don't try charging if there's no charges.
 *         if (GetHighestAttackCharge() == 0)
 *             return false;
 *         if (CurrentAttack && (CurrentAttack->Type == ATT_CHARGE_THROW_PROJ
 *                               && !CurrentAttack->fCanCancel))
 *             return true;
 *         ...                                          giattack.cpp:1107-1120
 *
 * La guarda está ANTES de la rama del tiro, y `GetHighestAttackCharge()` recorre
 * `Attack.flChargeAmt` (giattack.cpp:617-625), que es el `reg.attack.charge` de
 * los ataques cargados de cuerpo a cuerpo. **Un arco no declara ninguno**, así
 * que su carga máxima es 0 y la función devuelve `false` antes de mirar si estás
 * tensando.
 *
 * O sea que la única indicación visual de cuánto llevas tensado el arco está
 * apagada por una guarda escrita para otra cosa. Y la rama del tiro existe y
 * está bien hecha: `Attack_Charge()` mide de `tStart + tProjMinHold` a `tMaxHold`
 * (giattack.cpp:1127-1132), que es exactamente el 15 % de fuerza que se midió en
 * el experimento 23.
 *
 * Se porta con la guarda puesta y con un interruptor,
 * `AJUSTES.cargaSoloConCarga`, porque apagarlo es lo que hace visible el tensado.
 */
/**
 * ── Y LA OTRA MITAD, que el 24 dejó sin poner ─────────────────────────────
 *
 * `tensando` es el arco, que es nuestro andamio. Lo que el motor pinta de
 * verdad es la carga de CUERPO A CUERPO: aguantar el botón con una espada que
 * declara un ataque cargado. Mientras aquí sólo se miró el tensado, la barra
 * no salía nunca con una espada — o sea que el caso real estaba apagado y el
 * caso de andamio, encendido.
 *
 * `cargando` es esa carga: `Attack_IsCharging()` sin la rama del tiro.
 */
export function cargaVisible({
  cargaMaxima = 0, tensando = false, cargando = false, carga = 0, ajustes = AJUSTES,
} = {}) {
  if (ajustes.cargaSoloConCarga && !(cargaMaxima > 0)) return false;
  // `Item->Attack_IsCharging() && (vCurChargeAmt = Item->Attack_Charge()) > 0`
  // — las dos condiciones, y la segunda esconde otro medio segundo de espera:
  // durante el mínimo de tensado la carga vale 0 y la barra tampoco sale.
  return (tensando || cargando) && carga > 0;
}

/**
 * Cuánto marca la barra de carga de un arco, de 0 a 1.
 *
 *     ChargeDuration = time - (tStart + tProjMinHold);
 *     ChargeDuration = ChargeDuration / ((tMaxHold - tProjMinHold) + 0.0001f);
 *     ChargeDuration = V_max(ChargeDuration, 0);
 *     ChargeDuration = V_min(ChargeDuration, 1.0f);      giattack.cpp:1127-1132
 *
 * Empieza a contar en el mínimo, no en cero: con `1.1;1.3` la barra está a cero
 * durante 1,1 s y recorre el 0-100 % en los 0,2 s siguientes.
 */
export function cargaDelTiro(sostenido, sostener) {
  const min = sostener?.[0] ?? 0, max = sostener?.[1] ?? 0;
  let c = (sostenido - min) / ((max - min) + 0.0001);
  return Math.min(Math.max(c, 0), 1);
}

// ── LA CONSOLA DE SUCESOS ───────────────────────────────────────────────────

/**
 * DÓNDE CAE LA CONSOLA: abajo a la derecha, y creciendo hacia arriba.
 *
 *     const int EVENTCON_SIZE_X = XRES(230);
 *     const int EVENTCON_X = XRES(640) - EVENTCON_SIZE_X - XRES(20);
 *     const int EVENTCON_Y = (YRES(480) - YRES(10));
 *                                                      vgui_hud.cpp:144-146
 *
 * `y` es el borde de ABAJO y no el de arriba: el panel se recoloca con
 * `setPos(x, m_StartY - LINE_SIZE * m_VisibleLines)` cada vez que crece, o sea
 * que la esquina de abajo no se mueve nunca.
 *
 * Esto estaba calculado a mano dentro de `src/juego/hudms.js` y no se podía
 * mirar sin un navegador. Sale aquí desde el experimento 60, que es cuando hizo
 * falta comparar esta esquina con la de la ventana de aviso —`src/play/aviso.js`,
 * arriba a la izquierda— para probar que son dos sitios distintos.
 */
export function esquinaDeLaConsola(ancho, alto) {
  const w = XRES(230, ancho);
  return { x: XRES(640, ancho) - w - XRES(20, ancho), y: YRES(480, alto) - YRES(10, alto), w };
}

/**
 * La consola de sucesos de Master Sword, portada con su buffer circular.
 *
 * Es `VGUI_EventConsole` de `vgui_eventconsole.h`, y no es una lista de textos:
 * es un anillo de `min(ms_evthud_history, 128)` líneas con tres índices encima.
 *
 *   `cabeza`     dónde empieza la línea lógica 0 dentro del anillo
 *   `total`      cuántas líneas hay (deja de crecer al llenarse el anillo)
 *   `activa`     la última línea que se ve abajo — se mueve con RePág/AvPág
 *   `visibles`   cuántas se ven ahora mismo, de 0 a `ms_evthud_size`
 *
 * Lo que hace que se comporte como se comporta:
 *
 *   crece por abajo    cada línea nueva sube `visibles` en uno hasta el tope, y
 *                      el panel se re-coloca hacia arriba —`setPos(x, m_StartY -
 *                      LINE_SIZE * m_VisibleLines)`— o sea que **el borde de
 *                      abajo no se mueve nunca**.
 *   se encoge de una en una  cada `ms_evthud_decaytime` sin sucesos se quita
 *                      UNA línea, no todas. Cinco líneas tardan 25 segundos en
 *                      irse, y las últimas se van de una en una.
 *   salvo las partidas  si al encoger la línea de arriba es la continuación de
 *                      una que se partió, el reloj NO se rearma
 *                      (`if (!topLine->m_SpansFromPrevLine) m_ShrinkTime = 0;`)
 *                      y se va en el mismo tic. Una línea larga partida en tres
 *                      desaparece entera, no a tercios.
 */
export class ConsolaDeSucesos {
  /**
   * @param {object} o
   * @param {number} o.historial   `ms_evthud_history`
   * @param {number} o.tamano      `ms_evthud_size`
   * @param {number} o.decaimiento `ms_evthud_decaytime`
   * @param {number} o.ancho       ancho útil en píxeles, 0 = no se parte nada
   * @param {(t:string)=>number} o.medir  cuánto ocupa un texto. En Node se le
   *        pasa una regla falsa; en el navegador, un `canvas` 2D.
   */
  constructor({
    historial = CVARS.ms_evthud_history,
    tamano = CVARS.ms_evthud_size,
    decaimiento = CVARS.ms_evthud_decaytime,
    ancho = 0,
    medir = null,
  } = {}) {
    this.historial = historial;
    this.tamano = tamano;
    this.decaimiento = decaimiento;
    this.ancho = ancho;
    this.medir = medir;
    this.linea = new Array(this.maxLineas).fill(null);
    this.cabeza = 0;
    this.total = 0;
    this.activa = 0;
    this.visibles = 0;
    this.reloj = 0;
    this.encogeEn = 0;   // `m_ShrinkTime`: 0 = sin armar
  }

  /** `V_min((int)EVENTCON_PREF_MAXLINES, EVENTCON_MAXLINES)`. */
  get maxLineas() { return Math.min(this.historial, MAX_LINEAS); }

  /** `LogicalToPhysical`: el anillo. */
  fisica(logica) { return (this.cabeza + logica) % this.maxLineas; }
  enLinea(logica) { return this.linea[this.fisica(logica)] ?? null; }

  /**
   * Parte un texto en la línea que cabe y el resto, como hace `Print`.
   *
   * El motor busca el punto de desbordamiento con una búsqueda binaria y luego
   * recorre hasta él apuntando el último espacio. Aquí se hace el recorrido
   * directo: el resultado es el mismo —romper en el último espacio que quepa, y
   * si no hay ninguno, cortar a lo bruto— y son líneas de cincuenta caracteres.
   *
   * Tres detalles que SÍ se copian porque cambian lo que se ve:
   *   - un `\n` rompe antes que cualquier espacio y se come el salto;
   *   - `if (WrapPos > 0)`: romper en la posición 0 no cuenta como romper, así
   *     que un texto que empieza por espacio o por salto de línea no se parte;
   *   - la continuación se imprime como línea aparte marcada `vieneDeArriba`.
   */
  partir(texto) {
    const cabe = (t) => !this.medir || !this.ancho || this.medir(t) <= this.ancho;
    if (cabe(texto) && !texto.includes("\n")) return [texto, null];

    let corte = -1, comerse = false;
    let ultimoEspacio = -1;
    for (let c = 0; c < texto.length; c++) {
      if (texto[c] === "\n") { corte = c; comerse = true; break; }
      if (texto[c] === " ") ultimoEspacio = c;
      if (!cabe(texto.slice(0, c + 1))) {
        if (ultimoEspacio >= 0) { corte = ultimoEspacio; comerse = true; }
        else { corte = c; comerse = false; }
        break;
      }
    }
    if (!(corte > 0)) return [texto, null];
    return [texto.slice(0, corte), texto.slice(corte + (comerse ? 1 : 0))];
  }

  /**
   * Imprime una línea. `tipo` es una de las seis claves de `COLORES_DE_SUCESO`.
   *
   *     if (!Text || !Text[0]) return;                 vgui_eventconsole.h:109
   */
  imprimir(tipo, texto, vieneDeArriba = false) {
    if (!texto) return this;
    const max = this.maxLineas;
    if (this.total >= max) this.cabeza = (this.cabeza + 1) % max;
    else this.total++;

    const nueva = this.total - 1;
    // Si la línea activa venía siguiendo al fondo, se queda en el fondo. Si el
    // jugador ha subido con RePág, NO se le mueve la vista bajo los pies.
    if (this.activa >= nueva - 1) this.activa = nueva;

    if (this.visibles < this.tamano) this.visibles++;
    this.encogeEn = 0;

    const [cabe, resto] = this.partir(texto);
    this.linea[this.fisica(nueva)] = { tipo, texto: cabe, vieneDeArriba };
    if (resto) this.imprimir(tipo, resto, true);
    return this;
  }

  /**
   * El paso del reloj. `Update()` del motor, con el tiempo en la mano.
   *
   *     if (!m_ShrinkTime) { if (m_VisibleLines) m_ShrinkTime = time + DECAY; }
   *     else if (time > m_ShrinkTime && m_VisibleLines > 0) {
   *         m_VisibleLines--;
   *         int TopLine = V_max(m_ActiveLine - (m_VisibleLines - 1), 0);
   *         if (topLine && !topLine->m_SpansFromPrevLine) m_ShrinkTime = 0;
   *     }                                             vgui_eventconsole.h:294-311
   *
   * Ojo al `m_ShrinkTime = 0` del final: **rearma** el reloj para otros cinco
   * segundos. Dejarlo sin poner es lo que hace que una continuación se vaya en
   * el mismo tic que su primera mitad.
   */
  paso(dt) {
    this.reloj += dt;
    if (!this.encogeEn) {
      if (this.visibles) this.encogeEn = this.reloj + this.decaimiento;
    } else if (this.reloj > this.encogeEn && this.visibles > 0) {
      this.visibles--;
      const arriba = Math.max(this.activa - (this.visibles - 1), 0);
      const l = this.enLinea(arriba);
      if (l && !l.vieneDeArriba) this.encogeEn = 0;
    }
    return this;
  }

  /** RePág / AvPág. `StepInput(fDown)`, vgui_eventconsole.h:319-330. */
  desplazar(haciaAbajo) {
    this.visibles = Math.min(this.tamano, this.total);
    this.encogeEn = 0;
    if (haciaAbajo) this.activa = Math.min(this.activa + 1, this.total - 1);
    else this.activa = Math.max(this.activa - 1, this.visibles - 1);
    return this;
  }

  /** Las líneas que se ven ahora, de arriba abajo. */
  get vistas() {
    const out = [];
    for (let i = this.visibles - 1; i >= 0; i--) {
      const l = this.enLinea(this.activa - i);
      if (l) out.push(l);
    }
    return out;
  }

  /**
   * El alfa del fondo.
   *
   *     int bgAlpha = 128 + V_max(V_min(m_BGTrans->value, 1), -1) * 127;
   *                                                  vgui_eventconsole.h:275
   *
   * Con `ms_evthud_bgtrans 0` —el valor de fábrica— sale 128 sobre 255, o sea
   * medio transparente. El color es `setBgColor(0, 0, 20, 128)`: negro con un
   * punto de azul.
   */
  get fondo() {
    const t = Math.max(Math.min(this.bgtrans ?? CVARS.ms_evthud_bgtrans, 1), -1);
    return `rgba(0, 0, 20, ${(128 + t * 127) / 255})`;
  }
}
