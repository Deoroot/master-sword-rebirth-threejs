// ELEGIR UNA OPCIÓN DEL MENÚ DE UN NPC: `CMSMonster::UseMenuOption`.
//
//     void CMSMonster::UseMenuOption(CBasePlayer* pPlayer, int Option)
//                                          msmonsterserver.cpp:2914-3037
//
// Ciento veinte líneas, y son las que faltaban desde el experimento 29 para que
// la F delante del alcalde hiciera algo. El camino entero, con sus cifras:
//
//   el cliente manda `menuselect`         multiplay_gamerules.cpp:1576
//   el servidor lo despacha               client.cpp:702
//   `Option < 0` dispara game_menu_cancel msmonsterserver.cpp:2920-2926
//   MOT_SAY habla por el JUGADOR          :2935-2937
//   MOT_PAYMENT parte `Data` por espacios :2944
//   `gold:N` suma al total                :2953-2954
//   lo demás es `nombre:cantidad`         :2956-2966
//   busca el objeto EN CÍRCULO            :2968-2984
//   si falta un objeto: mensaje y CORTA   :2986-2994
//   el oro se mira DESPUÉS y NO corta     :3001-3007
//   sólo si puede pagar, cobra            :3009-3015
//   y al final la retrollamada, con Data  :3018-3034
//   y la lista de opciones SE BORRA       :3036
//
// ── Las tres cosas de aquí que no son obvias ──────────────────────────────
//
// 1. **EL ORDEN ES RARO Y SE VE.** Los objetos se comprueban dentro del bucle y
//    fallar hace `break` (:2993); el oro se comprueba **después del bucle** y
//    fallar **no corta** (:3006). Si te faltan las dos cosas, el mensaje que
//    ves es el del objeto y del oro no te enteras. Está portado así y lo
//    comprueba una prueba.
//
// 2. **`SUB_Remove()` Y NO `RemoveItem()`**, con la línea vieja comentada al
//    lado:
//
//        TotalFoundItems[i]->SUB_Remove(); //MIB JUN2010_14 (original line commented below)
//        //pPlayer->RemoveItem( TotalFoundItems[i] );
//                                          msmonsterserver.cpp:3013-3014
//
//    No son lo mismo. `CMSMonster::RemoveItem` (msmonstershared.cpp:364)
//    **enfunda el objeto si lo llevabas en la mano y cambia a la otra mano**:
//
//        if (IsActiveItem && pItem->CanHolster()) { m_Location = ITEMPOS_NONE; pItem->Holster(); }
//        pItem->RemoveFromOwner();
//        if (IsActiveItem) SwitchToBestHand();
//
//    `SUB_Remove` (genericitem.cpp:532) llama a `RemoveFromOwner()` y borra la
//    entidad, pero **se salta el `Holster()` y el `SwitchToBestHand()`**. O sea
//    que pagar con algo que llevabas EN LA MANO te deja la mano vacía sin
//    cambiar a la otra. Eso es lo que la pregunta del encargo quería saber: no
//    deja el objeto en la lista un instante —`RemoveFromOwner` sí lo quita de
//    `Gear` (genericitem.cpp:1573)— sino que deja la MANO a medias. Se porta
//    con el fallo: `vaciarMano` no busca la mejor mano siguiente.
//
// 3. **`Data` VIAJA COMO SEGUNDO PARÁMETRO** por un arreglo de Thothie que él
//    mismo documenta como que contradice los papeles del mod:
//
//        Params.add(MenuOption.Data); //Thothie - reg.mitem.data function wasn't
//        //returning as PARAM2 in type callback as described by docs, so I tried
//        //this, seems to work
//                                          msmonsterserver.cpp:3022
//
//    Las cuatro retrollamadas del alcalde reciben entonces PARAM1 = el jugador
//    y PARAM2 = los datos. Si se porta «según los docs» —sin esa línea—,
//    `say_axe` recibe PARAM1 vacío y su `if ( PARAM1 equals 'PARAM1' )` da
//    cierto, que es la rama de «me han hablado por el chat»: el alcalde se
//    queda callado. Lo comprueba una prueba.
//
// ── Y UN CUARTO, QUE SALE AL LEER EL BUCLE ────────────────────────────────
//
// La búsqueda es circular a propósito, porque `GetItemInInventory` da la vuelta
// cuando se acaba la lista («Item with StartID wasn't found, use the first valid
// item found», msmonstershared.cpp:293). El corte es `LastItem == FirstItem`
// (:2982), pero el objeto **ya se ha añadido** antes de mirarlo (:2975-2976).
// Con un solo objeto en la mochila y un pago de dos, el mismo objeto entra dos
// veces en `TotalFoundItems`, el pago se da por bueno y `SUB_Remove()` se llama
// dos veces sobre él. Ninguna opción de Gate City pide dos de nada, así que no
// se ve jugando — pero está, y va con su prueba.

import { misionesDe } from "./misiones.js";

/**
 * `HUDEVENT_UNABLE`: el gris de «no puedes hacer eso», el segundo de los seis
 * colores de suceso (playershared.cpp:1183-1191). La clave es la que usa
 * `src/play/hud.js`.
 */
export const AVISO_NO_PUEDES = "nopuedes";

/**
 * El inventario del jugador **en el orden en que el motor lo recorre**.
 *
 *     if (CheckHands) for (i < MAX_NPC_HANDS) ...Hand(i)...
 *     for (i < Gear.size()) ...cada bulto, y dentro cada objeto...
 *                                          msmonstershared.cpp:230-268
 *
 * Primero las manos, después la mochila. Aquí no hay contenedores dentro de la
 * mochila —el 31 dejó fuera los bultos— así que el tercer nivel no existe.
 *
 * ── Dónde esto NO es el motor, dicho aquí ─────────────────────────────────
 *
 * En Master Sword cada objeto es una ENTIDAD; aquí la mochila son montones
 * `{id, n}`. Un montón de tres se expande a tres entidades seguidas, que es lo
 * que serían tres objetos no apilables. Para los que sí se apilan —las flechas,
 * `m_MaxGroupable > 1`— el motor tendría **una** entidad con `iQuantity 3`, y
 * ahí esta expansión se separa del original. Ninguna opción de menú de Gate
 * City cobra en objetos apilables; cuando alguna lo haga, habrá que mirarlo.
 */
export function inventarioEnOrden(personaje) {
  const fuera = [];
  let id = 1;
  for (const mano of ["izquierda", "derecha"]) {
    const m = personaje?.manos?.[mano];
    if (!m) continue;
    fuera.push({ id: id++, clave: typeof m === "string" ? m : (m.clave ?? m.id), mano, monton: null });
  }
  for (const o of personaje?.objetos ?? []) {
    if (!o?.id) continue;
    for (let k = 0; k < Math.max(1, o.n ?? 1); k++) fuera.push({ id: id++, clave: o.id, mano: null, monton: o });
  }
  return fuera;
}

/**
 * `GetItemInInventory(StartID, ...)`: el siguiente DESPUÉS de `desde`, y si
 * `desde` era el último **da la vuelta al principio**. msmonstershared.cpp:281-296.
 */
export function siguienteEnInventario(lista, desde) {
  let usarElSiguiente = false;
  for (const it of lista) {
    if (!usarElSiguiente) { if (it.id === desde) usarElSiguiente = true; }
    else return it;
  }
  return lista.length ? lista[0] : null;
}

/** `TokenizeString(MenuOption.Data, Payments)`: por espacios. msmonsterserver.cpp:2944. */
export const trozosDelPago = (datos) => String(datos ?? "").split(/\s+/).filter(Boolean);

/**
 * Lo que un pago cuesta y si el jugador lo tiene, **con el orden del motor**.
 *
 * Devuelve `{ puede, oro, encontrados, falta }`. `falta` es el texto del primer
 * fallo, que es el que el jugador ve; los siguientes no llegan a mirarse si el
 * que falló era un objeto.
 */
export function comprobarPago(personaje, datos, { nombreVisible = null } = {}) {
  const lista = inventarioEnOrden(personaje);
  const trozos = trozosDelPago(datos);
  let oro = 0;
  const encontrados = [];
  let falta = null;

  for (const trozo of trozos) {
    // `if (Payment.starts_with("gold")) TotalGold += atoi(Payment.substr(5));`
    // — y es `starts_with`, no una comparación: un objeto llamado
    // `goldring` se leería como oro. msmonsterserver.cpp:2953-2954.
    if (trozo.startsWith("gold")) { oro += parseInt(trozo.slice(5), 10) || 0; continue; }

    let cantidad = 1;
    if (trozo.includes(":")) {
      cantidad = parseInt(trozo.slice(trozo.indexOf(":") + 1), 10) || 0;
      if (!cantidad) cantidad = 1;                 // `if (!Amount) Amount = 1;`  :2962
    }
    const clave = trozo.includes(":") ? trozo.slice(0, trozo.indexOf(":")) : trozo;

    // El bucle circular, tal cual. :2968-2984.
    let ultimo = 0, primero = 0;
    const hallados = [];
    let it;
    while ((it = siguienteEnInventario(lista, ultimo)) && hallados.length < cantidad) {
      if (it.clave === clave) hallados.push(it);
      ultimo = it.id;
      if (primero === 0) primero = ultimo;
      else if (ultimo === primero) break;          // la vuelta completa
    }

    if (hallados.length < cantidad) {
      const nombre = nombreVisible ? nombreVisible(clave, cantidad) : clave;
      falta = `You can't afford the payment of ${nombre}`;
      // `break`: los trozos que quedan NI SE MIRAN. :2993.
      return { puede: false, oro, encontrados, falta, faltaba: "objeto" };
    }
    encontrados.push(...hallados);
  }

  // Y AHORA el oro, fuera del bucle y sin `break`. :3001-3007.
  if ((personaje?.oro ?? 0) < oro) {
    return { puede: false, oro, encontrados, falta: `You can't afford the payment of ${oro} Gold`, faltaba: "oro" };
  }
  return { puede: true, oro, encontrados, falta: null, faltaba: null };
}

/**
 * Cobra. `pPlayer->m_Gold -= TotalGold;` y un `SUB_Remove()` por objeto.
 * msmonsterserver.cpp:3009-3015.
 */
export function cobrar(personaje, { oro, encontrados }) {
  personaje.oro = (personaje.oro ?? 0) - oro;
  const quitados = [];
  for (const it of encontrados) {
    // `SUB_Remove()`: quita del dueño y borra la entidad. Lo que NO hace, y
    // `RemoveItem` sí, es enfundar y cambiar de mano. Ver la cabecera.
    if (it.mano) {
      personaje.manos[it.mano] = null;             // sin `SwitchToBestHand()`
    } else if (it.monton) {
      it.monton.n = (it.monton.n ?? 1) - 1;
      if (it.monton.n <= 0) {
        const i = personaje.objetos.indexOf(it.monton);
        if (i >= 0) personaje.objetos.splice(i, 1);
      }
    }
    quitados.push(it.clave);
  }
  return quitados;
}

/**
 * `CMSMonster::UseMenuOption(pPlayer, Option)` — msmonsterserver.cpp:2914-3037.
 *
 * @param opciones  la lista que el servidor guardó al abrir el menú
 *                  (`m_MenuOptions[pPlayer->entindex()]`, :2917). Se **vacía**
 *                  al final, que es la última línea de la función.
 * @param indice    el número que mandó el cliente. −1 es cancelar.
 * @param npc       `{ llamar(evento, params), hablarJugador(texto), avisar(tipo, texto) }`.
 * @param personaje el personaje del jugador, que es de donde sale el pago.
 */
export function usarOpcion({ opciones, indice, npc, personaje, refJugador = "player", nombreVisible = null }) {
  const bitacora = { cancelado: false, tipo: null, pago: null, cobrado: null, retrollamada: null };

  // «Thothie JAN2008a - need a way of dealing with canceled menus». Y es
  // `== -1` exacto, no `< 0`: un −2 no dispara nada. :2920.
  if (indice === -1) { npc.llamar("game_menu_cancel", [refJugador]); bitacora.cancelado = true; }

  // `if (Option < 0 || Option >= Menuoptions.size()) return;` — y ESTO NO
  // borra la lista, porque el `return` está antes del `clearitems()`. :2928.
  if (indice === null || indice === undefined || indice < 0 || indice >= opciones.length) return bitacora;

  const opcion = opciones[indice];
  let puedePagar = true;
  bitacora.tipo = opcion.tipo;

  if (opcion.tipo === "say") {
    // «pPlayer->Speak(MenuOption.Data, SPEECH_LOCAL)»: habla EL JUGADOR, no el
    // NPC. Es la opción de «di esto en voz alta». :2937.
    npc.hablarJugador?.(opcion.datos ?? "");
  } else if (opcion.tipo === "payment") {
    const p = comprobarPago(personaje, opcion.datos, { nombreVisible });
    bitacora.pago = p;
    if (!p.puede) {
      puedePagar = false;
      // `if (!MenuOption.SilentPayment)`: `payment_silent` no dice nada.
      // msmonster.h:158 — «If you can't afford the payment, the game won't
      // tell you what you're missing».
      if (!opcion.silencioso) npc.avisar?.(AVISO_NO_PUEDES, p.falta);
    } else {
      bitacora.cobrado = cobrar(personaje, p);
    }
  }

  // «Handle callback». PARAM1 el jugador, PARAM2 los datos. :3018-3022.
  const params = [refJugador, opcion.datos ?? ""];
  let evento = opcion.respuesta ?? "";
  if (opcion.tipo === "payment" && !puedePagar) evento = opcion.siFalla ?? "";

  if (evento && evento.length) { npc.llamar(evento, params); bitacora.retrollamada = evento; }

  // «Menuoptions.clearitems()» — :3036. La lista del servidor se vacía SIEMPRE
  // que se haya llegado hasta aquí, elijas lo que elijas: si el cliente manda
  // otro número sin volver a abrir el menú, no hay nada que elegir.
  opciones.length = 0;
  return bitacora;
}

/**
 * `CGenericItemMgr::GetItemDisplayName(name, false, true, Amt)` —
 * genericitem.cpp:299 y `SPEECH::ItemName`, syntax.cpp:6.
 *
 * Con cantidad mayor que uno el motor pega una **«s» a pelo** («3 Goblin
 * Chief's Heads»), sin mirar si la palabra la admite. Y un objeto que no está
 * en el catálogo se anuncia con su clave cruda, que es lo que se ve cuando un
 * script pide algo que no existe.
 */
export function nombreVisibleDe(catalogo, clave, cantidad = 1) {
  const f = catalogo?.get?.(clave) ?? null;
  if (!f) return clave;
  const nombre = f.nombre ?? clave;
  if (cantidad > 1) return `${cantidad} ${nombre}s`;
  return f.prefijo ? `${f.prefijo} ${nombre}` : nombre;
}

/** Cuántas misiones lleva puestas un personaje. Para el HUD y las sondas. */
export const cuantasMisiones = (p) => misionesDe(p).length;
