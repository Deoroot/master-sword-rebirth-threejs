// A DÓNDE MANDA UN GUION — `setmovedest`, npcscript.cpp:1600-1740. El 81.
//
// Esto es la mitad que faltaba. La otra —ANDAR hasta el sitio y avisar al
// guion de que se ha llegado— está escrita desde el 77 y no hay que tocarla:
// `Manada.mandarA` y `pasoMandado` SON `CMSMonster::SetMoveDest`, con los tres
// avisos (`game_movingto_dest`, `game_stopmoving`, `game_reached_dest`) ya como
// retrollamadas y en su orden contraintuitivo.
//
// Lo que no existía es QUÉ PUNTO. Y no es «leer tres números»: el comando tiene
// cuatro formas y tres de ellas calculan el destino en vez de leerlo.
//
// ── POR QUÉ ESTO ERA EL PENDIENTE NÚMERO UNO ───────────────────────────────
//
// El gancho `irA` de `entornoDe` era un `=> {}` **desde el experimento 43**.
// O sea el `=> {}` de relleno del apartado 4 de CLAUDE.md, el mismo sitio en el
// que vivió `llamarExterno` hasta el 66: el comando estaba analizado, citado y
// con cuatro pruebas verdes **que le construían el gancho a mano**, y ningún
// NPC de este puerto se había movido nunca por su guion.
//
// ── LOS EJES, QUE ES DONDE ESTO SE ROMPE SIN DAR UN ERROR ──────────────────
//
// Un `setmovedest (1024 -320 48)` trae las tres cifras **en los ejes del
// `.bsp`**, donde la altura es la Z. En este puerto los puntos van en unidades
// pero con los ejes de Three: la altura es la Y y el suelo es el plano X-Z
// (`aEscena`, src/bsp/lector.js:402). Mezclarlos no da un error: da un NPC que
// se va a andar por donde debería estar el techo, y `haLlegado` tira la
// componente que no es, así que **se da por llegado a un sitio en el que no
// está**. Es la nota 3 de `haLlegado` en `src/play/escena.js`, y aquí hay que
// aplicarla en la entrada.
//
// Se cambia de ejes UNA vez, al leer el texto del guion (`puntoDeUnGuion`), y a
// partir de ahí todo el archivo está en el convenio del puerto.

import { adelante, grados } from "./paseo.js";

/**
 * `GetDefaultMoveProximity()` — msmonster.h:355, y es una línea entera:
 *
 *     virtual float GetDefaultMoveProximity() { return m_Width * 1.1; }
 *
 * O sea que la proximidad por omisión **sale del ancho del casco**, el mismo
 * `setsize` que el 80 trajo del guion. Para una rata de 32 son 35,2 unidades, y
 * de ahí viene el hallazgo del 77: Edrin nace a 32 unidades de su `edrinspot` y
 * su proximidad son 35,2, así que esa escena **ya estaba llegada antes de
 * empezar**. Quien mida un viaje con esto tiene que pedir más que una
 * proximidad entera, porque los dos viajes paran en el BORDE del círculo.
 */
export const proximidadPorOmision = (ancho) => Number(ancho ?? 0) * 1.1;

/**
 * `StringToVec(Params[0])` con el cambio de ejes puesto.
 *
 * El motor distingue un punto de una entidad mirando **si el primer carácter es
 * un paréntesis** (`Params[0].c_str()[0] == '('`, :1621), que es lo que ya hace
 * `guion.js` al partir el comando. Aquí sólo se leen las cifras.
 *
 * Devuelve `null` si no hay tres números, y eso NO es lo mismo que `[0,0,0]`:
 * el origen del mapa es un sitio al que se puede andar y la basura no.
 */
export function puntoDeUnGuion(texto) {
  const n = String(texto ?? "").replace(/[()]/g, "").split(/[\s,]+/).filter(Boolean).map(Number);
  if (n.length < 3 || !n.every((x) => Number.isFinite(x))) return null;
  // `[x, z, -y]`: el mismo cambio de `vectorAEscena`, sin dividir por `U`
  // porque los destinos de este puerto van en unidades.
  return [n[0], n[2], -n[1]];
}

/**
 * `Vector::Normalize()` — y hay que portar su caso raro, que el propio motor
 * marca con un comentario de cuatro interrogaciones:
 *
 *     float flLen = Length();
 *     if (flLen == 0) return Vector(0, 0, 1);   // ????
 *                                        src/game/server/hl/vector.h:109-116
 *
 * Un vector de longitud cero **no sale cero: sale «arriba»**. Importa dos veces
 * en este archivo: con los dos ojos en el mismo punto el destino acaba justo
 * encima del objetivo, y en la huida acaba valiendo cero porque después se le
 * tira la altura. Devolver `[0,0,0]` aquí sería más razonable y no sería MSR.
 */
function normalizar(v) {
  const L = Math.hypot(v[0], v[1], v[2]);
  if (L === 0) return [0, 1, 0];          // `Vector(0, 0, 1)`: la altura es la Y
  return [v[0] / L, v[1] / L, v[2] / L];
}

/**
 * `UTIL_VecToAngles(v).y`, que es el inverso exacto de `adelante`.
 *
 *     if (forward[1] == 0 && forward[0] == 0) { yaw = 0; ... }
 *     else { yaw = atan2(forward[1], forward[0]) * 180 / PI;
 *            if (yaw < 0) yaw += 360; }
 *                           ReHLDS, engine/mathlib.cpp:151-168
 *
 * Las DOS cosas que el motor hace y un `atan2` pelado no:
 *
 *   1. **Normaliza a [0, 360)**. Un `atan2` da (−180, 180], así que mirar al
 *      oeste sale −180 donde el motor dice 180. Para `adelante` da igual —son
 *      cos y sen— y para la fuerza bruta también, porque barre los mismos 359
 *      grados módulo 360. Pero el rumbo se APUNTA y se compara, y un −180 en un
 *      informe al lado de un 180 del motor es media hora de duda. Lo cazó una
 *      prueba que esperaba 180 y leía −180; el que estaba mal era este archivo.
 *   2. **El caso del vector nulo NO se porta, y eso hay que explicarlo** porque
 *      la primera versión de este archivo lo portaba.
 *
 *      Se escribió una guarda —`if (v[0] === 0 && v[2] === 0) return 0;`— y al
 *      romperla a propósito **las pruebas siguieron verdes**. No era un control
 *      flojo: la línea no tiene efecto. El vector de ceros llega aquí de verdad
 *      (con los dos centros en el mismo punto `normalizar` devuelve «arriba» y
 *      la línea de `FleeDir.z = 0` se la tira), y sin guarda `atan2(-0, 0)`
 *      devuelve **`-0`**, que es `=== 0`, que no es `< 0`, que se imprime «0» y
 *      que sumado o multiplicado da lo mismo. O sea indistinguible.
 *
 *      Y leyendo el motor otra vez, la razón de fondo: esa rama del `if` está
 *      **para el PITCH, no para el yaw** —pone 90 o 270 según el signo de la Z
 *      (mathlib.cpp:158-161)—, y el yaw que mete ahí es el mismo 0 que `atan2`
 *      daría solo. Aquí sólo se usa el yaw, así que la rama no aporta nada.
 *
 *      Se quita por la regla del 78: una pieza que no se puede romper en rojo
 *      sobra. Y **no se apunta un verde por este caso**.
 *
 * Se escribe como el inverso de `adelante` y no como una fórmula nueva para que
 * las dos no puedan irse cada una por su lado: el signo de la Z ya mordió una
 * vez en el paseo. En los ejes del puerto las dos horizontales son la 0 y la 2.
 */
function rumboDe(v) {
  const g = grados(Math.atan2(-v[2], v[0]));
  return g < 0 ? g + 360 : g;
}

/**
 * EL PUNTO AL QUE SE MANDA A UN BICHO A PERSEGUIR A ALGUIEN — :1650-1662.
 *
 *     float Size = pMonster->IsFlying()
 *         ? sqrt(pow(m_Width / 2, 2) + pow(m_Height / 2, 2))
 *         : m_Width / 2;
 *     Vector vRay = EyePosition() - pEntity->EyePosition();
 *     NewDest.Origin = pEntity->EyePosition() + vRay.Normalize() * Size;
 *
 * **No es el centro del objetivo: es un punto de su superficie, el de mi lado.**
 * Y los dos tamaños son DEL OBJETIVO, no míos — `pMonster` es a quien persigo.
 *
 * Lo que esto evita es que el perseguidor apunte al centro y se meta dentro;
 * con la proximidad encima, un bicho se planta a `ancho/2 + proximidad` de los
 * ojos del otro. Y sólo pasa cuando el objetivo **es un bicho**: contra
 * cualquier otra entidad el destino es su ojo pelado (`else`, :1660).
 *
 * El rayo es de tres componentes y la altura entra: perseguir a algo que está
 * en un tejado da un punto más alto que mi ojo, y la proximidad lo tira después
 * si quien persigue anda (`Length2D`) y no lo tira si vuela.
 */
export function puntoDeSuperficie({ miOjo, suOjo, ancho = 0, alto = 0, vuela = false } = {}) {
  if (!Array.isArray(miOjo) || !Array.isArray(suOjo)) return null;
  const tamano = vuela
    ? Math.hypot(Number(ancho) / 2, Number(alto) / 2)
    : Number(ancho) / 2;
  const rayo = normalizar([miOjo[0] - suOjo[0], miOjo[1] - suOjo[1], miOjo[2] - suOjo[2]]);
  return [
    suOjo[0] + rayo[0] * tamano,
    suOjo[1] + rayo[1] * tamano,
    suOjo[2] + rayo[2] * tamano,
  ];
}

/**
 * HUIR — `setmovedest <quien> <distancia> flee`, :1664-1706.
 *
 * Es la rama más larga del comando y la que más fácil es portar de menos,
 * porque son DOS búsquedas y la segunda sólo corre si la primera falla:
 *
 *     for (int i = 0; i < 20; i++)        // al azar, ±90° del rumbo de huida
 *         newYaw = StartYaw + RANDOM_FLOAT(-90, 90);
 *         UTIL_TraceLine(Center(), Center() + fleeVec * 200, dont_ignore_monsters)
 *         if (tr.flFraction == 1.0) { fFoundVec = true; break; }
 *
 *     if (!fFoundVec)
 *         for (int i = 0; i < 359; i++)   // «brute force one»: grado a grado
 *             newYaw = StartYaw + i;
 *             UTIL_TraceLine(Center(), Center() + fleeVec * 128, ...)
 *
 * TRES COSAS QUE NO SE ADIVINAN:
 *
 *   1. **Las dos trazas miden distinto de lo que se anda.** La primera prueba
 *      200 unidades, la segunda 128, y el destino se pone a `flDistanceParm` —
 *      que en los guiones de Edana son 300 o más. O sea que «ese rumbo está
 *      despejado» se afirma sobre un tramo más corto que el viaje: el bicho
 *      huye hacia un hueco de 128 unidades y se estrella en el 129. Es del
 *      motor y se porta tal cual.
 *   2. **`dont_ignore_monsters`**, o sea que otro bicho en medio tapa el rumbo.
 *      Es lo contrario de lo que hace el paseo (`UTIL_TraceLine` normal), y es
 *      el mismo `dont_ignore_monsters` que el 80 encontró en el segundo intento
 *      de `DoDamage`.
 *   3. **Si no encuentra hueco, `fMove = false` y NO SE MUEVE** — ni se pone la
 *      condición, ni se cambia la animación, ni se avisa a nadie. Un bicho
 *      acorralado se queda quieto, y eso en pantalla se ve igual que un
 *      `setmovedest` que no llega a ejecutarse. Por eso esta función devuelve
 *      `null` y no un destino cualquiera, y por eso ese cero necesita control
 *      positivo: es exactamente la forma del apartado 4.
 *
 * `FleeDir.z = 0` va DESPUÉS de normalizar y el vector no se vuelve a
 * normalizar (:1668-1670). Da igual, porque de él sólo se usa el rumbo — pero
 * si algún día alguien usa su longitud, está dicho aquí.
 */
export function rumboDeHuida({ miCentro, suCentro, libre = () => true, azar = Math.random } = {}) {
  if (!Array.isArray(miCentro) || !Array.isArray(suCentro)) return null;
  const dir = normalizar([
    miCentro[0] - suCentro[0], miCentro[1] - suCentro[1], miCentro[2] - suCentro[2],
  ]);
  dir[1] = 0;                                   // `FleeDir.z = 0`
  const rumbo0 = rumboDe(dir);
  const prueba = (gradosYaw, largo) => {
    const v = adelante(gradosYaw);
    return libre(miCentro, [
      miCentro[0] + v[0] * largo, miCentro[1] + v[1] * largo, miCentro[2] + v[2] * largo,
    ]) ? v : null;
  };
  // Primera vuelta: veinte al azar a ±90°, con 200 unidades de traza.
  for (let k = 0; k < 20; k++) {
    const g = rumbo0 + (azar() * 180 - 90);     // `RANDOM_FLOAT(-90, 90)`
    const v = prueba(g, 200);
    if (v) return { rumbo: g, adelante: v, aLaBruta: false, intentos: k + 1 };
  }
  // «Couldn't pick a random flee angle, brute force one»: 359 grados a 128.
  for (let k = 0; k < 359; k++) {
    const g = rumbo0 + k;
    const v = prueba(g, 128);
    if (v) return { rumbo: g, adelante: v, aLaBruta: true, intentos: 20 + k + 1 };
  }
  return null;                                  // `fMove = false`
}

/**
 * EL COMANDO ENTERO: de lo que el guion escribe al `{ origen, proximidad }` que
 * `Manada.mandarA` sabe andar.
 *
 * `destino` es lo que ya le pasa `guion.js:1265-1274` sin tocarlo: `null` para
 * `setmovedest none`, `{ punto }` si traía paréntesis y `{ entidad }` si no.
 *
 * `yo` es quien se mueve, en UNIDADES y ejes del puerto:
 * `{ ojo, centro, ancho }`. `buscar(nombre)` es `RetrieveEntity` y devuelve
 * `{ ojo, centro, ancho, alto, vuela, esBicho }` o `null`. `libre(a, b)` es la
 * traza con `dont_ignore_monsters`.
 *
 * Devuelve `null` cuando el motor **no mueve a nadie**, que son cuatro casos
 * distintos y conviene no fundirlos: sin parámetros, con una sola palabra que
 * no sea `none`, con una entidad que no existe, y acorralado al huir. `porQue`
 * dice cuál, porque los cuatro se ven igual en pantalla —un NPC quieto— y sin
 * eso no se puede medir ninguno.
 */
export function destinoDeSetmovedest({
  yo = null, destino = null, proximidad = 0, huir = false,
  buscar = null, libre = () => true, azar = Math.random,
} = {}) {
  if (!yo) return { porQue: "sin quien se mueva" };
  // `setmovedest none` → `StopWalking()` + `ClearConditions(MONSTER_HASMOVEDEST)`.
  // No es un destino: es soltarlo, y quien llama tiene que distinguirlo de los
  // fallos. De esto depende el `setmovedest none` que hace que una escena se
  // crea que el NPC ha llegado (`doc/AVISOS.md:820`).
  if (destino === null) return { parar: true };

  // ── UN PUNTO DEL MAPA ────────────────────────────────────────────────────
  if (destino.punto !== undefined) {
    const p = puntoDeUnGuion(destino.punto);
    if (!p) return { porQue: "el punto no son tres numeros" };
    return { origen: p, proximidad: Number(proximidad), huyendo: false, objetivo: null };
  }

  // ── UNA ENTIDAD ──────────────────────────────────────────────────────────
  if (destino.entidad === undefined) return { porQue: "sin destino" };
  const q = buscar?.(destino.entidad) ?? null;
  // `RetrieveEntity` devolviendo NULL: el motor **no hace nada y no avisa**, o
  // sea que un `setmovedest` a un nombre que no existe es un NPC quieto y una
  // escena esperando. Aquí se dice cuál de los cuatro ceros es.
  if (!q) return { porQue: `no hay ninguna entidad que se llame ${destino.entidad}` };

  if (!huir) {
    // `m_hEnemy = pEntity` (:1643) NO se porta como «tiene un enemigo»: es la
    // misma casilla que el 77 ya decidió no portar así, y por el mismo motivo —
    // haría que el NPC se defendiera de un `info_target` y que la guarda de
    // `Act` rechazara la escena siguiente. Lo que se porta es el punto.
    const origen = q.esBicho
      ? puntoDeSuperficie({ miOjo: yo.ojo, suOjo: q.ojo, ancho: q.ancho, alto: q.alto, vuela: q.vuela })
      : [...q.ojo];                            // `NewDest.Origin = pEntity->EyePosition()`
    return { origen, proximidad: Number(proximidad), huyendo: false, objetivo: destino.entidad };
  }

  const h = rumboDeHuida({ miCentro: yo.centro, suCentro: q.centro, libre, azar });
  if (!h) return { porQue: "acorralado: ningun rumbo de huida despejado" };
  const d = Number(proximidad);
  return {
    // `NewDest.Origin = Center() + fleeVec * flDistanceParm` — y el parámetro
    // que en la otra rama era la proximidad aquí es LA DISTANCIA a la que se
    // huye. El mismo número con dos oficios, y el motor lo llama
    // `flDistanceParm` justo por eso.
    origen: [
      yo.centro[0] + h.adelante[0] * d,
      yo.centro[1] + h.adelante[1] * d,
      yo.centro[2] + h.adelante[2] * d,
    ],
    // Huyendo la proximidad **no es el parámetro**: es la de por omisión
    // (:1704). Quien huye no se planta a 300 unidades del sitio al que huye.
    proximidad: proximidadPorOmision(yo.ancho),
    huyendo: true,
    objetivo: destino.entidad,
    aLaBruta: h.aLaBruta,
    // `m_NodeCancelTime = time + 5.0; m_NextNodeTime = 0;` (:1705-1706): huir
    // se cancela en cinco segundos y no en los siete de siempre.
    cancelarEn: 5.0,
  };
}

/**
 * `FMVisible(pEntity)` — combat.cpp:1216-1250. LA REGLA DEL RAYO, UNA SOLA VEZ.
 *
 *     vecLookerOrigin = pev->origin + pev->view_ofs;   // «the caller's eyes»
 *     vecTargetOrigin = pEntity->EyePosition();
 *     UTIL_TraceLine(..., dont_ignore_monsters, dont_ignore_glass, ENT(pev), &tr);
 *     if (tr.flFraction != 1.0)
 *         return tr.pHit == pEntity->edict();   // chocar con ÉL es verle
 *     return TRUE;
 *
 * ── POR QUÉ ESTA FUNCIÓN EXISTE — el 81 ────────────────────────────────────
 *
 * Porque hay **dos mundos de Rapier**: el del navegador (`src/main.js`) y el del
 * servidor (`src/red/fauna.js`). El rayo hay que tirarlo dos veces por fuerza, y
 * eso no se puede evitar con una indirección — serían dos físicas fingiendo ser
 * una. Lo que sí se puede evitar es que la REGLA esté dos veces, que es lo que
 * de verdad se desincroniza.
 *
 * Así que esto se queda con las tres cosas que no se adivinan y que son la regla:
 *
 *   1. va de OJO a OJO, y el ojo de un bicho es su alto ENTERO (ver `ojoDe`);
 *   2. **chocar contra el propio objetivo cuenta como verle** — sin esto el rayo
 *      termina en el ojo y se topa con la cápsula del propio jugador medio metro
 *      antes, y entonces no se ve a nadie nunca (está medido: un goblin a tres
 *      metros no se enteraba de nada, y no daba ningún error);
 *   3. y sin objetivo con cuerpo **no se finge que se ve**: se devuelve `false`.
 *
 * `trazar(desde, hasta)` es lo único que pone cada mundo: devuelve el `handle`
 * del colisionador tocado, o `null` si el rayo llega entero. Los puntos van en
 * METROS, que es el convenio de las dos físicas.
 *
 * **Lo que esto NO hace, y está decidido así:** `$cansee(<objetivo>,<rango>)` es
 * este rayo MÁS cuatro reglas —el `atof` del rango con su `-1` de «sin límite»,
 * la distancia de CENTRO a centro y en 3D, la resta del medio ancho del objetivo
 * y el `StoreEntity(..., ENT_LASTSEEN)`—. Las cuatro viven en la capa del guion
 * (`src/play/npcguion.js`), pegadas a su cita, y **hay una sola copia de ellas**.
 * Si alguien va a «unificar» algo aquí dentro de diez experimentos, que lea esto
 * primero: *no son dos copias de una regla, son dos implementaciones de una
 * medida física en dos mundos distintos; la regla está en un solo sitio y éstas
 * sólo le contestan sí o no.*
 */
export function loVe({ miOjo, suOjo, suColisionador = null, trazar = null } = {}) {
  if (!Array.isArray(miOjo) || !Array.isArray(suOjo)) return false;
  const d = [suOjo[0] - miOjo[0], suOjo[1] - miOjo[1], suOjo[2] - miOjo[2]];
  const L = Math.hypot(d[0], d[1], d[2]);
  // Encima de él: no hay rayo que tirar y se ve. `flFraction` sería 1.
  if (!(L > 0)) return true;
  const tocado = trazar?.(miOjo, [d[0] / L, d[1] / L, d[2] / L], L) ?? null;
  if (tocado === null || tocado === undefined) return true;   // `flFraction == 1.0`
  // Y SE COMPARA EL `handle`, NO EL OBJETO. `tr.pHit == pEntity->edict()` es una
  // comparación de punteros en C; aquí la tentación es `===` sobre el colisionador,
  // y con `castRay` **el envoltorio JS que devuelve Rapier no es el mismo objeto**
  // que guardó quien lo creó, así que la igualdad estricta es `false` siempre y el
  // rayo dice que no se ve a nadie. El `handle` es un entero y cruza el WASM sin
  // envoltorio — es lo que ya hacían `trazaLibre` y la traza del 80.
  return suColisionador !== null && suColisionador !== undefined && tocado === suColisionador;
}

/**
 * EL GANCHO QUE EL GUION LLAMA — lo que `entornoDe.irA` reenvía.
 *
 * Vive AQUÍ y no en quien monta los NPC por la razón del 59 y del 63: si el asa
 * la construye quien prueba, lo que se prueba es el asa. Así una prueba de Node
 * puede mover a un NPC por el mismo sitio por el que lo mueve el juego, y lo
 * único que hace falta fuera es una línea que pase esto.
 *
 * `avisar` es cómo el guion recibe los tres eventos del motor. Van en el orden
 * CONTRAINTUITIVO que `pasoMandado` ya documenta —`game_stopmoving` llega ANTES
 * que `game_reached_dest`, porque `SetMoveDest` llama primero a `StopWalking()`—
 * y eso lo resuelve `Manada`, no esto.
 *
 * ── LO QUE PASA AL SOLTAR EL DESTINO, QUE ES UN FALLO PORTADO ──────────────
 *
 * `setmovedest none` llama a `pararDeAndar`, y ése **no borra `ultimoDestino`**
 * a propósito: el motor no toca `m_MoveDest`, sólo apaga la condición. De eso
 * depende que una escena del mapa **se crea que el NPC ha llegado** cuando su
 * propio guion suelta el destino (`doc/AVISOS.md:820`, y en Edana lo dispara el
 * `check_home_loop` de Edrin). Si alguien «arregla» esto borrando la copia, el
 * fallo del original desaparece y con él la escena de Edrin.
 */
export function ganchoDeMovedest({
  manada = null, instancia = null, buscar = null, libre = () => true,
  azar = Math.random, avisar = null, animacionDeAndar = () => null, apuntar = null,
} = {}) {
  return (destino, opciones = {}) => {
    if (!manada || !instancia) return false;
    const alto = instancia.ficha?.ia?.alto ?? instancia.ficha?.alto ?? 60;
    const ancho = instancia.ficha?.ia?.ancho ?? instancia.ficha?.ancho ?? 0;
    const n = instancia.donde ?? [0, 0, 0];
    const U = manada.U ?? 39.37;
    // En UNIDADES, que es el convenio de los destinos; `donde` va en metros.
    const yo = {
      ojo: [n[0] * U, n[1] * U + alto, n[2] * U],          // `view_ofs = m_Height`
      centro: [n[0] * U, n[1] * U + alto / 2, n[2] * U],   // `Center()`
      ancho, alto,
    };
    const r = destinoDeSetmovedest({
      yo, destino, proximidad: opciones.proximidad, huir: Boolean(opciones.huir),
      buscar, libre, azar,
    });
    if (r?.parar) { manada.pararDeAndar(instancia); return true; }
    if (!r?.origen) {
      // Los cuatro ceros se apuntan donde se apunta lo que el guion pide y no
      // tenemos. Un NPC quieto sin una línea que diga por qué es el fallo del
      // 63: un filtro que descarta en silencio.
      apuntar?.("setmovedest", r?.porQue ?? "sin destino");
      return false;
    }
    return manada.mandarA(instancia, {
      origen: r.origen,
      proximidad: r.proximidad,
      // `m_MoveAnim`, que es lo que pone `setmoveanim`. `mandarA` cae a la de
      // andar del propio bicho si esto es `null`, que es lo que el motor tiene
      // puesto ya — nunca la de parado, que es el deslizamiento del 21.
      anim: animacionDeAndar() ?? null,
      dueño: "guion",
      alAndar: (rumbo) => avisar?.("game_movingto_dest", [String(rumbo)]),
      alParar: () => avisar?.("game_stopmoving", []),
      alLlegar: () => avisar?.("game_reached_dest", []),
    });
  };
}
