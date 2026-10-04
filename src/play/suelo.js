// LOS OBJETOS EN EL SUELO — el 71.
//
// ── Qué faltaba, exactamente ───────────────────────────────────────────────
//
// Hasta hoy este puerto no tenía **ni un objeto en el suelo**, en ninguno de
// los dos mapas. No era que faltara un caso: faltaba la pieza entera. El 69
// portó el `msitem_spawn` —el aparecedor—, el 70 cerró la cadena que lo
// dispara, y los dos acabaron en el mismo sitio: una salida del bus que decía
// «aquí aparecería una manzana» y un contador de lo que no está.
//
// Esto es la manzana. Nace, cae, se tumba, se queda dos minutos y se puede
// coger.
//
// ── Las cuatro reglas, con su cita ─────────────────────────────────────────
//
//   NACER     `CGenericItem::Spawn` marca `GI_JUSTSPAWNED` y pide pensar a los
//             0,1 s (genericitem.cpp:595-612). Ese `Think` llama a `Fall()`,
//             que **si el objeto no tiene dueño llama a `FallInit()`**
//             (:1616-1628). O sea que un objeto que aparece en el mundo cae
//             siempre, y no porque el aparecedor se lo diga: porque nadie lo
//             ha cogido en el primer décimo de segundo.
//
//   CAER      `FallInit` lo pone en `MOVETYPE_TOSS`, **de tamaño PUNTO**
//             —`UTIL_SetSize(pev, Vector(0,0,0), Vector(0,0,0))`, con su
//             comentario: «pointsize until it lands on the ground»,
//             weapons.cpp:354-373— y dispara el evento `game_fall` del guion,
//             que es quien elige el submodelo de estar tirado. Que sea un
//             punto es lo que hace que aquí baste un rayo y no un barrido de
//             caja: el instrumento es el mismo que el de la flecha del 55.
//
//   TOCAR EL  `CGenericItem::FallThink` (genericitem.cpp:1395-1416): suena
//   SUELO     `items/weapondrop1.wav` con el tono `95 + RANDOM_LONG(0,29)`, se
//             **tumba** —`pev->angles.x = 0; pev->angles.z = 0`, o sea que
//             pierde el cabeceo y el alabeo y conserva el rumbo—, pasa a
//             `SOLID_TRIGGER` y **vuelve a poner el reloj de caducar**.
//
//   CADUCAR   `MSITEM_TIME_EXPIRE` son **120 segundos** (msitemdefs.h:10) y el
//             reloj lo mira `CGenericItem::Think` (:1459-1463) sólo mientras no
//             tenga dueño. Se pone en `FallInit` y se vuelve a poner al
//             aterrizar, así que son 120 s **desde que toca el suelo**.
//
// ── Y la recogida, que es la parte con sorpresa ────────────────────────────
//
// `CBasePlayer::GetAnyItems` (player.cpp:5080-5245), que es lo que hace la
// tecla `x` (`bind "x" "get"`, config.cfg:31 -> client.cpp:661-662):
//
//   1. `UTIL_FindEntityInSphere(pObject, EyePosition(), SEARCH_DISTANCE)` con
//      `SEARCH_DISTANCE 64.0` (:5069, :5090). Y la esfera **no se mide contra
//      el origen del objeto**: el motor la mide contra su CAJA, componente a
//      componente (`FindEntityInSphere`, pr_cmds.cpp:859-888). La caja de un
//      objeto es `origin + (-24,-24,0)` a `origin + (24,24,16)`
//      (`CBasePlayerItem::SetObjectCollisionBox`, weapons.cpp:345-349), así que
//      el alcance de verdad llega a **88 unidades en horizontal** y no a 64.
//      Medirlo contra el origen daría un juego en el que hay que pisar la
//      manzana para cogerla.
//   2. `FVisible`: una traza del ojo al origen del objeto que **ignora a los
//      monstruos** (combat.cpp:1277-1304). Un goblin delante no tapa una
//      manzana.
//   3. `FInViewCone`: el producto escalar **en 2D** —«making the view cone
//      infinitely tall», combat.cpp:1148-1174— entre el rumbo del jugador y la
//      línea que va de su ORIGEN (no del ojo) al del objeto, contra
//      `m_flFieldOfView`, que para el jugador es **0,5** y no 0,1: las dos
//      asignaciones están en `CBasePlayer::Spawn` y gana la última
//      (player.cpp:2627 y :2682). O sea ±60°, y mirar al suelo no te quita la
//      manzana de delante porque el cono no tiene techo.
//
// ── EL FALLO QUE SE PORTA, que es de los que no se adivinan ────────────────
//
// El motor junta hasta nueve objetos y tiene un menú entero para elegir («Gather
// items:»). Y entre la lista y el menú hay esta línea:
//
//     ItemCount = 1; //Thothie DEC2010_11 - trying to end item dup exploit
//                                                        player.cpp:5199
//
// a pelo, sin condición, justo antes del `if (ItemCount == 1)`. **El menú no
// sale nunca** y con dos cosas a los pies te llevas sólo la primera que el
// motor encuentra, que es la de índice de entidad más bajo. Es un parche contra
// un exploit de duplicación que se dejó puesto; se porta con el fallo, porque
// es el juego que hay.
//
// ── LO QUE NO SE PORTA, dicho aquí y con la cuenta de HOY ──────────────────
//
//   `ITEM_NOPICKUP`, `ITEM_PROJECTILE` y `PICKUP_ALLOW_LIST` (player.cpp:5111,
//   :5140, :5115-5137). Son tres filtros de la lista. Afectan a **0 de los 2
//   objetos** que un mapa portado puede dejar en el suelo: ni la manzana ni el
//   leño declaran ninguna de las tres. Cuando haya un trofeo reservado habrá
//   que portarlos, y el sitio es `aMano`.
//
//   `ITEM_GROUPABLE`, el agrupar varios iguales en uno (player.cpp:5158-5180).
//   Afecta a **0 de 2**: `health_apple` no es apilable.
//
//   Un CADÁVER con oro también entra en esta lista (player.cpp:5096-5109). Eso
//   no es un objeto en el suelo, es saquear, y va con el botín.
//
//   EL RUIDO DE CAER. `items/weapondrop1.wav` **no existe en `assets/msr`**, y
//   eso no quiere decir que el juego no lo tenga: es un sonido de `valve/`, y
//   el motor monta `valve/` detrás siempre (la nota del apartado 2 de
//   CLAUDE.md, la que ya mordió una vez). Falta en esta copia, no en el mod. La
//   salida `objeto_aterriza` lo pide igual, con su tono, para que el día que
//   esté suene sin tocar nada; hoy se apunta en `audio.fallos`. Afecta a los 2.
//
//   SOLTAR del inventario (`CGenericItem::Drop`, genericitem.cpp:1319-1383), que
//   es la OTRA manera de que algo acabe en el suelo. No está, y por eso la
//   tecla `c` —`bind "c" "drop"`, que está en la tabla de teclas desde el 24—
//   no hace nada. Afecta a todo lo que el jugador lleva encima; se cuenta aquí
//   en vez de dejarlo callado.
//
//   ── CORRECCIÓN DEL 75 ───────────────────────────────────────────────────
//   Ya está. Lo de abajo es la otra mitad, y el apartado de arriba se queda
//   como estaba porque era verdad cuando se escribió.
//
// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  SOLTAR DEL INVENTARIO — el 75                                           ║
// ╚══════════════════════════════════════════════════════════════════════════╝
//
// `bind "c" "drop"` (config.cfg:16) -> `ClientCommand2`, rama `"drop"`
// (client.cpp:931-957) -> `CBasePlayer::DropItem` (playershared.cpp:943-990) ->
// `CGenericItem::Drop` (genericitem.cpp:1319-1383). Sin argumento se suelta
// `ActiveItem()`, que aquí es lo que lleva la mano derecha.
//
// ── No se deja caer: SE TIRA ───────────────────────────────────────────────
//
//     pev->origin   = m_pOwner->EyePosition() + gpGlobals->v_forward * 10;
//     pev->velocity = pev->velocity + gpGlobals->v_forward * 175 + Vector(0,0,60);
//                                      genericitem.cpp:1336 y playershared.cpp:977
//
// O sea: sale del OJO diez unidades adelante, se lleva la velocidad del jugador
// —si corres, el objeto sale disparado contigo— y se le suman 175 de empuje
// hacia delante y 60 hacia arriba. Y a partir de ahí es el mismo `FallInit` del
// 71, que lo pone de tamaño punto: un objeto soltado vuela y luego cae.
//
// ── EL TERCIO: por qué soltar mirando al suelo lo tira hacia ARRIBA ────────
//
// El `v_forward` con el que se calculan las dos líneas de arriba sale de
//
//     UTIL_MakeVectorsPrivate(pev->angles, gpGlobals->v_forward, NULL, NULL);
//                                                   playershared.cpp:969
//
// y `pev->angles` **no es por donde mira el jugador**. Para un cliente lo
// escribe el motor:
//
//     sv_player->v.angles[0] = float(-pmove->angles[0] / 3.0);
//                                                   sv_user.cpp:993
//
// un TERCIO del cabeceo de la vista y con el signo dado la vuelta. Así que
// mirando 60° al suelo el objeto sale **20° hacia arriba**, y no hay manera de
// dejarlo a los pies: lo más abajo que se puede soltar algo es 30° por encima
// de donde se está mirando. Es un cálculo del motor para que el modelo del
// jugador no se doble, heredado por una línea del mod que pide una dirección y
// coge la que hay. Se porta tal cual; es lo que hace que soltar en Master Sword
// sea TIRAR.
//
// ── UN SUELO QUE NO ES SUELO ───────────────────────────────────────────────
//
// `FallThink` sólo se tumba, suena y vuelve a poner el reloj **si
// `FL_ONGROUND`** (genericitem.cpp:1397); si no, `flNextThink = time + 0.1` y
// lo vuelve a intentar para siempre (:1413-1414). Y quién pone `FL_ONGROUND` a
// un objeto de tamaño punto:
//
//     point[2] = mins[2] - 1.0f;        // las cuatro esquinas de la caja
//     if (SV_PointContents(point) == CONTENTS_SOLID) ent->v.flags |= FL_ONGROUND;
//                                                   sv_phys.cpp:1081-1109
//
// con la caja a cero las cuatro esquinas son **el mismo punto**: una unidad
// debajo del origen. Y `SV_PointContents` mira el **hull 0 del modelo del
// mundo** (world.cpp:695-709) y de las entidades sólo las que son `SOLID_NOT`
// (`if (touch->v.solid != SOLID_NOT) continue;`, world.cpp:625-626).
//
// Una `func_door` es `SOLID_BSP`. Así que **un objeto que se queda encima de la
// tapa de la cloaca de Edana no toca suelo nunca**: no se tumba, no suena, no
// pasa a `SOLID_TRIGGER` y caduca a los 120 s **de haberlo soltado** y no de
// haber aterrizado. Se queda inclinado un tercio de donde mirabas. Eso no es
// una simplificación de aquí: es el juego, y es el segundo caso que le faltaba
// a la pieza del 71 —donde todo caía al modelo 0 y la rama del `else` no se
// ejecutaba nunca—.
//
// ── Y DOS CANDADOS QUE NO CIERRAN NADA ─────────────────────────────────────
//
// `CGenericItem::CanDrop` (genericitem.cpp:1291-1308) tiene tres puertas y sólo
// una está conectada:
//
//   1. `if (CurrentAttack) return false;` — ésta sí: no se suelta a media
//      estocada. Portada.
//   2. `if (gpGlobals->time < fNextActionTime) return false;` — `fNextActionTime`
//      se **declara** (weapons.h:202) y se **lee** dos veces (:877 y :1297), y
//      no se asigna en NINGÚN sitio del mod. La memoria de una entidad de
//      GoldSrc viene a cero, así que la pregunta es `time < 0` y nunca es
//      cierta. Un candado sin llave y sin cerradura.
//   3. `if (m_PrefHand == HAND_PLAYERHANDS) return false;` — a eso se llega con
//      `sethand undroppable` (genericitem.cpp:2128-2129), y **`sethand
//      undroppable` no sale en ninguno de los 2 884 guiones**: los 43 `both`,
//      los 41 `any`, dos `right` y dos `left` no lo activan. O sea que en
//      Master Sword **todo lo que llevas encima se puede soltar**.
//
// Las dos muertas se portan igual, apagadas y nombradas, porque el día que un
// guion escriba `sethand undroppable` el sitio donde va la regla es éste.
//
// ── EL SEGUNDO FALLO QUE SE PORTA, y es el hermano del `ItemCount = 1` ─────
//
// `Drop` quiso tener un «pulsa otra vez para soltar» —hay un `bDropAttempted` y
// un `iDropTickCounter` en genericitem.h:431-432— y quedó así:
//
//     bDropAttempted = true;
//     if ((bDropAttempted && m_pOwner->IsPlayer()) || !m_pOwner->IsPlayer()) {
//                                                   genericitem.cpp:1323-1324
//
// La bandera se pone a `true` en la línea de antes, así que la condición es
// `(true && X) || !X`: **cierta siempre**. Las dos ramas del `else if` —la que
// hace que soltar un hechizo lo DESHAGA en vez de tirarlo al suelo (:1370-1376)
// y la que esperaba la segunda pulsación (:1377-1379)— no se ejecutan jamás. Y
// el contador de los 100 tics que las remataba está **comentado**
// (:1512-1524), igual que el «Press again to drop» del jugador
// (playershared.cpp:964). Un mecanismo entero, con sus dos variables, su
// temporizador y sus mensajes, al que una tautología deja sin entrada.
//
// ── LO QUE NO SE PORTA DE SOLTAR, con la cuenta de HOY ─────────────────────
//
//   RESBALAR. El motor mueve el objeto con `SV_FlyMove(ent, dt, 1.1)`
//   (sv_phys.cpp:1075), que RECORTA la velocidad contra la cara y lo deja
//   deslizarse; aquí un rayo que choca para el objeto en seco. Se nota al
//   tirar algo contra una pared en pendiente. Afecta a los **11** guiones que
//   el jugador puede llevar.
//
//   `game_drop`, el evento del guion, que lo dispara `Drop` antes de nada
//   (:1325). Sale en **16 de los 2 884** guiones y de los 11 que se pueden
//   soltar aquí lo tiene **1**: `base_weapon_new` hace `callexternal ent_owner
//   ext_set_hand_id RL_HAND 0`, que es vaciar la mano —y eso aquí lo hace quien
//   llama—. Los otros quince cuelgan de familias que este puerto todavía no
//   deja llevar; el de `item_log` enciende la antorcha con un `clientevent`
//   (item_log.script:21-26) y el de `base_miscitem` llama a `game_fall`
//   (base_miscitem.script:59-61), o sea el submodelo DOS veces, que da lo mismo.
//
//   Los HECHIZOS (`ITEM_SPELL`). Su rama está muerta por la tautología de
//   arriba, así que en el motor un hechizo soltado también sale volando; pero
//   este puerto no tiene hechizos («You know no spells yet»), así que afecta a
//   **0 de 11**.
//
//   Soltar algo de DENTRO de un contenedor. `Drop` empieza con un
//   `m_pOwner = Owner()` y un comentario que avisa de que los objetos de dentro
//   de una mochila cogen el dueño del contenedor (:1321). Aquí sólo se suelta
//   lo de la mano, que es lo que hace `drop` sin argumento. Afecta a lo que
//   haya en `pack_sack`, que son **0** objetos mientras nadie lo llene.

/** `MSITEM_TIME_EXPIRE`, msitemdefs.h:10. Segundos tirado antes de irse. */
export const CADUCA = 120;
/** `SEARCH_DISTANCE`, player.cpp:5069. Unidades, desde el OJO. */
export const ALCANCE = 64;
/** `m_flFieldOfView` del jugador, player.cpp:2682. El coseno, no el ángulo. */
export const CONO = 0.5;
/**
 * `CBasePlayerItem::SetObjectCollisionBox`, weapons.cpp:345-349:
 *
 *     pev->absmin = pev->origin + Vector(-24, -24,  0);
 *     pev->absmax = pev->origin + Vector( 24,  24, 16);
 *
 * Escrita ya en los EJES DE LA ESCENA —(x, arriba, z)— porque es contra lo que
 * se compara aquí. La `z` del motor es la altura, así que el 16 va en medio.
 */
export const CAJA = { min: [-24, 0, -24], max: [24, 16, 24] };
/** `sv_gravity`. La misma que el resto del proyecto. */
export const GRAVEDAD = 800;
/** `pev->nextthink = gpGlobals->time + 0.1` de `CGenericItem::Spawn`. */
export const ANTES_DE_CAER = 0.1;
/** `v_forward * 175` de `DropItem`, playershared.cpp:977. Unidades por segundo. */
export const EMPUJE = 175;
/** El `Vector(0, 0, 60)` de la misma línea. Hacia arriba. */
export const ALZADO = 60;
/** `EyePosition() + v_forward * 10`, genericitem.cpp:1336. «move forward a bit». */
export const ADELANTE = 10;
/** El 3 de `v.angles[0] = -pmove->angles[0] / 3.0`, sv_user.cpp:993. */
export const TERCIO = 3;

/**
 * EL `pev->angles` DEL JUGADOR, que no es por donde mira.
 *
 * Recibe el rumbo de la vista en ejes de escena —`(x, arriba, z)`, el que
 * devuelve `applyEuler` sobre la cámara— y devuelve los `angles` del motor en
 * GRADOS: `[cabeceo, rumbo, alabeo]`. Es lo que el objeto soltado hereda
 * (`pev->angles = m_pOwner->pev->angles`, genericitem.cpp:1335) y lo que decide
 * su dirección, porque de ahí sale el `v_forward`.
 *
 * El cabeceo es **un tercio y del revés** (sv_user.cpp:993). El del motor va
 * positivo mirando al suelo y en ejes de escena eso es `y` negativa, así que
 * `pitchMotor = -asin(y)` y `angles[0] = -pitchMotor/3 = asin(y)/3`.
 *
 * Mirando justo arriba o justo abajo el rumbo no está en este vector —las dos
 * componentes horizontales son cero—; entonces se queda en 0, que es el eje +X
 * del motor. No se puede sostener la vista ahí ni un fotograma andando, y
 * prefiero decirlo a tapar el caso con el rumbo de otro sitio.
 */
export function angulosDeSoltar(mirando) {
  const l = Math.hypot(mirando[0], mirando[1], mirando[2]);
  if (!(l > 0)) return [0, 0, 0];
  const y = Math.max(-1, Math.min(1, mirando[1] / l));
  const cabeceo = ((Math.asin(y) / TERCIO) * 180) / Math.PI;
  // El rumbo del motor: `forward.x = cos(yaw)`, `forward.y = sin(yaw)`, y la
  // `y` del motor es la `−z` de la escena.
  const rumbo = ((Math.atan2(-mirando[2], mirando[0]) * 180) / Math.PI);
  return [cabeceo, rumbo, 0];
}

/**
 * EL `v_forward` CON EL QUE SE TIRA, en ejes de escena y unitario.
 *
 * `UTIL_MakeVectorsPrivate(pev->angles, ...)` (playershared.cpp:969) sobre los
 * ángulos de arriba. Devolverlo aparte de `angulosDeSoltar` sería tener la
 * misma cuenta en dos sitios, así que sale de ella.
 */
export function rumboDeSoltar(mirando) {
  const [cabeceo, rumbo] = angulosDeSoltar(mirando);
  const p = (cabeceo * Math.PI) / 180;
  const r = (rumbo * Math.PI) / 180;
  // `AngleVectors`: `forward = (cos(yaw)cos(pitch), sin(yaw)cos(pitch), -sin(pitch))`.
  // La `z` del motor es la altura (índice 1 aquí) y su `y` es la `−z` de escena.
  const c = Math.cos(p);
  return [Math.cos(r) * c, -Math.sin(p), -Math.sin(r) * c];
}

/**
 * `CGenericItem::CanDrop` — genericitem.cpp:1291-1308.
 *
 * De sus tres puertas sólo la primera está conectada; las otras dos se
 * preguntan igual, apagadas y con su cuenta, porque el día que algo las use el
 * sitio es éste. La cabecera del archivo dice por qué están muertas.
 */
export function puedeSoltar({ atacando = false, indroppable = false, hastaCuando = 0, ahora = 0 } = {}) {
  if (atacando) return { vale: false, por: "atacando" };
  // `fNextActionTime` no se asigna en ningún sitio del mod, así que vale 0 y
  // esto no es cierto nunca. Se deja preguntado con el valor del motor.
  if (ahora < hastaCuando) return { vale: false, por: "fNextActionTime" };
  // `sethand undroppable`: 0 de los 2 884 guiones.
  if (indroppable) return { vale: false, por: "undroppable" };
  return { vale: true, por: null };
}

/**
 * UNA COSA TIRADA EN EL MUNDO.
 *
 * Todo en UNIDADES del motor y segundos, como la flecha de `proyectil.js`. No
 * sabe dibujarse ni sabe de Rapier: sabe dónde está, si va cayendo y cuándo le
 * toca irse.
 */
export class ObjetoSuelto {
  /**
   * @param {object} o
   * @param {string} o.guion    el `scriptfile`: `health_apple`
   * @param {string?} o.nombre  el `targetname`, que es **el del aparecedor**
   * @param {number[]} o.donde  en unidades
   * @param {number[]} o.angulos  `pev->angles` (pitch, yaw, roll)
   */
  constructor({
    guion, nombre = null, donde = [0, 0, 0], angulos = [0, 0, 0], ficha = null, i = 0,
    velocidad = null, tirado = false,
  } = {}) {
    this.i = i;
    this.guion = guion;
    this.nombre = nombre;
    this.ficha = ficha;
    this.pos = [...donde];
    this.nacio = [...donde];
    this.angulos = [...angulos];
    this.vel = velocidad ? [...velocidad] : [0, 0, 0];
    /** `GI_JUSTSPAWNED`: todavía no ha corrido su primer `Think`. */
    this.reciente = true;
    /**
     * "naciendo" -> "cayendo" -> "suelo"; y `cogido` cuando se lo llevan.
     *
     * Hay un cuarto, del 75: **"posado"**, que es quedarse quieto encima de una
     * entidad de brush sin que el motor le dé `FL_ONGROUND` (sv_phys.cpp:1081-1109
     * contra world.cpp:625-626). No es un estado nuestro: es la rama del `else`
     * de `FallThink`, que reintenta cada 0,1 s para siempre.
     */
    this.estado = "naciendo";
    /** ¿Lo ha soltado alguien? Entonces no espera los 0,1 s: `Drop` llama a
     *  `FallInit` en el acto (genericitem.cpp:1357). */
    this.tirado = tirado;
    this.vida = 0;
    /** Cuándo caduca, en segundos de vida del objeto. −1 es «nunca». */
    this.caduca = -1;
    this.cogido = false;
    /** Para medir: cuántas veces ha tocado el suelo y con qué tono sonó. */
    this.aterrizajes = 0;
    this.tono = 0;
  }

  /** La caja de la esfera de recogida, en unidades. weapons.cpp:345-349. */
  get caja() {
    return {
      min: [0, 1, 2].map((k) => this.pos[k] + CAJA.min[k]),
      max: [0, 1, 2].map((k) => this.pos[k] + CAJA.max[k]),
    };
  }

  /**
   * `CGenericItem::Fall` -> `FallInit`. Pasa a `MOVETYPE_TOSS` y arranca el
   * reloj de caducar. Devuelve `true` la primera vez, que es cuando el guion
   * recibe su `game_fall`.
   */
  empezarACaer(azar = Math.random) {
    if (!this.reciente) return false;
    this.reciente = false;
    this.estado = "cayendo";
    this.caduca = this.vida + CADUCA;
    void azar;
    return true;
  }

  /**
   * Un paso. `traza(desde, hasta)` devuelve `{ punto }` o `null`, la misma del
   * proyectil: un objeto que cae es un PUNTO, así que un rayo basta.
   *
   * Devuelve `"aterriza"` el paso en que toca el suelo, y `null` el resto.
   */
  paso(dt, { traza = null, azar = Math.random } = {}) {
    this.vida += dt;
    if (this.estado === "naciendo") {
      // Soltado de la mano no espera: `Drop` llama a `FallInit` directamente.
      if (!this.tirado && this.vida < ANTES_DE_CAER) return null;
      this.empezarACaer(azar);
    }
    if (this.estado !== "cayendo") return null;
    // `SV_AddGravity` antes de mover, igual que la flecha: moverla después da
    // una caída un fotograma más plana.
    this.vel[1] -= GRAVEDAD * dt;
    const antes = [...this.pos];
    const siguiente = [0, 1, 2].map((k) => antes[k] + this.vel[k] * dt);
    const g = traza ? traza(antes, siguiente) : null;
    if (!g) { this.pos = siguiente; return null; }
    this.pos = g.punto ? [...g.punto] : antes;
    // Y aquí está la rama del `else` del 75: contra lo que ha chocado decide si
    // el motor le da `FL_ONGROUND`, y sin eso `FallThink` no hace NADA de lo
    // suyo. `deEntidad` lo dice quien traza, porque es quien sabe contra qué
    // colisionador ha dado.
    if (g.deEntidad) return this._posar();
    return this._aterrizar(azar);
  }

  /** `CGenericItem::FallThink` con `FL_ONGROUND` puesto. genericitem.cpp:1397-1414. */
  _aterrizar(azar = Math.random) {
    this.estado = "suelo";
    this.vel = [0, 0, 0];
    this.aterrizajes++;
    // `95 + RANDOM_LONG(0, 29)`: el tono del golpe contra el suelo.
    this.tono = 95 + Math.floor(azar() * 30);
    // «lie flat»: cabeceo y alabeo a cero, el rumbo se queda.
    this.angulos = [0, this.angulos[1], 0];
    // Y el reloj se vuelve a poner. 120 s DESDE AQUÍ, no desde que nació.
    this.caduca = this.vida + CADUCA;
    return "aterriza";
  }

  /**
   * QUIETO ENCIMA DE UNA ENTIDAD, y por tanto sin `FL_ONGROUND`.
   *
   * `FallThink` se va por el `else` (genericitem.cpp:1413-1414) y lo único que
   * hace es volver a intentarlo dentro de 0,1 s. Así que: no suena, **no se
   * tumba** —se queda con el cabeceo de un tercio con el que salió—, no pasa a
   * `SOLID_TRIGGER` y el reloj de caducar es el que puso `FallInit`, o sea 120 s
   * desde que lo soltaron y no desde que se paró.
   *
   * Recoger sí funciona: `FindEntityInSphere` recorre las entidades sin mirar
   * su `solid` (pr_cmds.cpp:859-888).
   */
  _posar() {
    this.estado = "posado";
    this.vel = [0, 0, 0];
    this.posados = (this.posados ?? 0) + 1;
    return "posa";
  }

  /** ¿Toca quitarlo? Sólo caduca mientras no tenga dueño (:1459). */
  get caducado() { return !this.cogido && this.caduca >= 0 && this.vida >= this.caduca; }
}

/**
 * ¿Está este objeto al alcance de la mano?
 *
 * Las tres preguntas de `GetAnyItems`, en el orden del motor y con sus
 * unidades. `libre(desde, hasta)` es la traza que ignora monstruos: `true` si
 * el camino está despejado.
 */
export function aMano(objeto, { ojo, origen, mirando, libre = null, alcance = ALCANCE, cono = CONO } = {}) {
  if (!objeto || objeto.cogido) return { vale: false, por: "ya no está" };
  // 1. La esfera, contra la CAJA y no contra el origen (pr_cmds.cpp:871-882).
  const { min, max } = objeto.caja;
  let d2 = 0;
  for (let k = 0; k < 3; k++) {
    const e = ojo[k] >= min[k] ? (ojo[k] <= max[k] ? 0 : ojo[k] - max[k]) : ojo[k] - min[k];
    d2 += e * e;
  }
  if (d2 > alcance * alcance) return { vale: false, por: "lejos", distancia: Math.sqrt(d2) };
  // 2. `FVisible`, del ojo al origen del objeto.
  if (libre && !libre(ojo, objeto.pos)) return { vale: false, por: "tapado" };
  // 3. `FInViewCone`, en 2D y desde el ORIGEN del jugador.
  const dx = objeto.pos[0] - origen[0], dz = objeto.pos[2] - origen[2];
  const l = Math.hypot(dx, dz);
  if (!(l > 0)) return { vale: true, punto: 1, distancia: Math.sqrt(d2) };
  const mx = mirando[0], mz = mirando[2];
  const lm = Math.hypot(mx, mz);
  if (!(lm > 0)) return { vale: false, por: "sin rumbo" };
  const punto = (dx / l) * (mx / lm) + (dz / l) * (mz / lm);
  if (!(punto > cono)) return { vale: false, por: "fuera del cono", punto, distancia: Math.sqrt(d2) };
  return { vale: true, punto, distancia: Math.sqrt(d2) };
}

/**
 * LA LISTA DE OBJETOS TIRADOS de una partida, con su reloj.
 *
 * Es pura: no conoce Three, ni Rapier, ni el DOM. Quien la use le pasa la traza
 * y recoge lo que devuelve.
 */
export class Suelo {
  constructor({ azar = Math.random, catalogo = null } = {}) {
    this.objetos = [];
    this.azar = azar;
    /** `Map` de guion -> ficha del horneado, para saber qué modelo poner. */
    this.catalogo = catalogo;
    this.siguiente = 1;
    /** Lo que ha pasado desde la última vez que alguien preguntó. */
    this.salidas = [];
    /** Para medir, y se CALCULAN: nacidos, aterrizados, cogidos, caducados. */
    this.cuentas = {
      nacidos: 0, aterrizados: 0, cogidos: 0, caducados: 0, intentos: 0,
      // El 75: cuántos se han tirado, cuántos se han quedado posados sobre una
      // entidad sin tocar suelo, y cuántas sueltas ha rechazado `CanDrop`.
      tirados: 0, posados: 0, sueltasNegadas: 0,
    };
  }

  /** Los que siguen en el mundo. Se calcula, no se escribe. */
  get vivos() { return this.objetos.filter((o) => !o.cogido); }

  /**
   * `CBaseGISpawn::SpawnItem` — gispawn.cpp:36-58.
   *
   * El objeto **se llama como el aparecedor** (`pItem->pev->targetname =
   * pev->targetname`, :40) y hereda su `origin` y sus `angles` (:55-57).
   * Devuelve `null` si el guion no está en el catálogo, que es lo que hace
   * `NewGenericItem` con un `scriptfile` que no existe (:38-39): no pone nada y
   * no da un error.
   */
  soltar({ guion, nombre = null, donde = [0, 0, 0], angulos = [0, 0, 0] } = {}) {
    const ficha = this.catalogo?.get?.(guion) ?? null;
    if (!ficha) {
      this.salidas.push({ tipo: "objeto_sin_guion", guion, nombre });
      return null;
    }
    const o = new ObjetoSuelto({ guion, nombre, donde, angulos, ficha, i: this.siguiente++ });
    this.objetos.push(o);
    this.cuentas.nacidos++;
    this.salidas.push({ tipo: "objeto_nace", i: o.i, guion, nombre, donde: [...o.pos] });
    return o;
  }

  /**
   * LA TECLA `c` — `CBasePlayer::DropItem` + `CGenericItem::Drop`.
   *
   * `ojo` es `EyePosition()` y `mirando` el rumbo de la vista, los dos en las
   * unidades y los ejes de `aMano`. `velocidad` es la del jugador, que el objeto
   * se lleva: soltar corriendo lo manda más lejos.
   *
   * Devuelve el objeto, o `null` con su motivo en la salida. Lo que NO hace es
   * quitarlo del inventario: eso es `RemoveItem` y lo hace quien llama, porque
   * el inventario no es de esta pieza.
   */
  tirar({
    guion, nombre = null, ojo = [0, 0, 0], mirando = [0, 0, -1], velocidad = [0, 0, 0],
    atacando = false, indroppable = false,
  } = {}) {
    const ficha = this.catalogo?.get?.(guion) ?? null;
    const comoSeLlama = ficha?.nombre ?? nombre ?? guion;
    const p = puedeSoltar({ atacando, indroppable });
    if (!p.vale) {
      this.cuentas.sueltasNegadas++;
      this.salidas.push({
        tipo: "objeto_no_se_suelta", guion, por: p.por,
        // `SendEventMsg(HUDEVENT_UNABLE, "You cannot drop " + ... + " right now")`,
        // playershared.cpp:976-977.
        mensaje: `You cannot drop ${comoSeLlama} right now`,
      });
      return null;
    }
    if (!ficha) {
      this.salidas.push({ tipo: "objeto_sin_guion", guion, nombre });
      return null;
    }
    // EL 97: `deleteme` en el `game_fall`. El orden del motor es: el aviso
    // «You drop …» de `DropItem` (playershared.cpp:962), `Drop` → `FallInit` →
    // `game_fall` (genericitem.cpp:1386-1389) y ahí `deleteme`: `game_deleted` y
    // `DelayedRemove()` (scriptcmds.cpp:2874-2884). Sale de la mano, el jugador
    // lee que lo ha soltado, y no llega a posarse ni a verse. Los guanteletes de
    // hierro (blunt_gauntlets_fe1.script:242-244). Devuelve una marca, no un
    // objeto del suelo: quien llama tiene que vaciar la mano igual.
    if (ficha.seBorraAlCaer) {
      this.cuentas.tirados++;
      this.cuentas.borrados = (this.cuentas.borrados ?? 0) + 1;
      // Un hechizo dice otra cosa —y en el motor ni llega a `FallInit`: «Dropping
      // spells fizzles them», genericitem.cpp:1371-1376—, con el aviso de
      // playershared.cpp:957-958. Los 31 hechizos también traen `deleteme`.
      const hechizo = ficha.tipo === "hechizo";
      this.salidas.push({ tipo: "objeto_soltado", i: null, guion, nombre: comoSeLlama,
        mensaje: hechizo ? `The ${comoSeLlama} spell is canceled` : `You drop ${comoSeLlama}`, borrado: true });
      this.salidas.push({ tipo: "objeto_borrado", guion, por: "deleteme" });
      return { guion, borrado: true, i: null };
    }
    const f = rumboDeSoltar(mirando);
    const o = new ObjetoSuelto({
      guion, nombre, ficha, i: this.siguiente++, tirado: true,
      // `pev->origin = EyePosition() + v_forward * 10`.
      donde: [0, 1, 2].map((k) => ojo[k] + f[k] * ADELANTE),
      // `pev->angles = m_pOwner->pev->angles`, con su tercio.
      angulos: angulosDeSoltar(mirando),
      // `pev->velocity = pev->velocity + v_forward * 175 + Vector(0, 0, 60)`.
      velocidad: [
        velocidad[0] + f[0] * EMPUJE,
        velocidad[1] + f[1] * EMPUJE + ALZADO,
        velocidad[2] + f[2] * EMPUJE,
      ],
    });
    this.objetos.push(o);
    this.cuentas.tirados++;
    this.salidas.push({
      tipo: "objeto_soltado", i: o.i, guion, nombre: comoSeLlama,
      donde: [...o.pos], velocidad: [...o.vel], angulos: [...o.angulos],
      // `SendEventMsg(HUDEVENT_NORMAL, "You drop " + ...)`, playershared.cpp:962.
      mensaje: `You drop ${comoSeLlama}`,
    });
    return o;
  }

  /** Un paso de todos. Devuelve cuántos han cambiado de estado. */
  paso(dt, { traza = null } = {}) {
    let n = 0;
    for (let k = this.objetos.length - 1; k >= 0; k--) {
      const o = this.objetos[k];
      if (o.cogido) { this.objetos.splice(k, 1); continue; }
      const r = o.paso(dt, { traza, azar: this.azar });
      if (r === "aterriza") {
        n++;
        this.cuentas.aterrizados++;
        this.salidas.push({
          tipo: "objeto_aterriza", i: o.i, guion: o.guion, donde: [...o.pos],
          // El sonido va con su tono, porque el tono es del motor y no adorno.
          sonido: "items/weapondrop1.wav", tono: o.tono,
        });
      } else if (r === "posa") {
        n++;
        this.cuentas.posados++;
        // Sin sonido y sin tumbarse a propósito: no hay `FL_ONGROUND`.
        this.salidas.push({
          tipo: "objeto_posa", i: o.i, guion: o.guion, donde: [...o.pos],
          angulos: [...o.angulos],
        });
      }
      if (o.caducado) {
        n++;
        this.cuentas.caducados++;
        this.salidas.push({ tipo: "objeto_caduca", i: o.i, guion: o.guion });
        this.objetos.splice(k, 1);
      }
    }
    return n;
  }

  /** Todo lo que pasa el filtro de `GetAnyItems`, en orden de entidad. */
  candidatos(mirada) {
    const out = [];
    for (const o of this.objetos) {
      const r = aMano(o, mirada);
      if (r.vale) out.push({ objeto: o, ...r });
    }
    return out;
  }

  /**
   * LA TECLA `x`. Devuelve lo que se ha cogido, o `null`.
   *
   * Y aquí está el `ItemCount = 1` de player.cpp:5199: por muchos que haya
   * delante **sólo se coge el primero**. No es una simplificación nuestra; el
   * menú de «Gather items» existe en el motor y esa línea lo deja inalcanzable.
   */
  coger(mirada) {
    this.cuentas.intentos++;
    const lista = this.candidatos(mirada);
    if (!lista.length) return null;
    // `ItemCount = 1`, a pelo. Lo demás se queda en el suelo.
    const { objeto } = lista[0];
    objeto.cogido = true;
    // Y sale del mundo EN EL ACTO, no en el siguiente paso. `GiveTo` se lo
    // lleva dentro de la misma llamada (player.cpp:5221), así que dejarlo en la
    // lista hasta el próximo `paso()` daría una ventana en la que la manzana
    // está en la mochila y en el suelo a la vez — y lo que la mediría sería
    // nuestra contabilidad, no el juego.
    const k = this.objetos.indexOf(objeto);
    if (k >= 0) this.objetos.splice(k, 1);
    this.cuentas.cogidos++;
    this.salidas.push({
      tipo: "objeto_cogido", i: objeto.i, guion: objeto.guion,
      nombre: objeto.ficha?.nombre ?? objeto.guion,
      // `SendInfoMsg("You pick up %s", ...)`, player.cpp:5222.
      mensaje: `You pick up ${objeto.ficha?.nombre ?? objeto.guion}`,
      dejados: lista.length - 1,
    });
    return { objeto, dejados: lista.length - 1 };
  }

  /** Lo que ha pasado, y se vacía. Igual que el bus de disparadores. */
  recoger() { const s = this.salidas; this.salidas = []; return s; }

  /** El censo, para la sonda. Se calcula. */
  censo() {
    return this.objetos.map((o) => ({
      i: o.i, guion: o.guion, nombre: o.nombre, estado: o.estado,
      donde: [...o.pos], angulos: [...o.angulos], vida: o.vida,
      leQueda: o.caduca < 0 ? null : o.caduca - o.vida,
      aterrizajes: o.aterrizajes, tono: o.tono,
      tirado: o.tirado, posados: o.posados ?? 0, velocidad: [...o.vel],
    }));
  }
}
