// QUÉ OPCIONES TIENE UN NPC, que es una decisión del SERVIDOR y no del panel.
//
// En Master Sword el cliente no sabe qué poner en el menú de interacción: manda
// `getmenuoptions <ent>`, el servidor llama al evento `game_menu_getoptions` del
// script del NPC y le devuelve las que hayan quedado registradas.
//
//     CallScriptEvent("game_menu_getoptions", &Params);
//     for (i...) { if (MenuOption.Access != MOA_ALL) continue; ... }
//                                     msmonsterserver.cpp:2890-2911
//
// Así que esto vive en `src/play/`, sin DOM y sin Three: lo mismo que la manada
// de bichos del experimento 28. Corre en el servidor de Node y corre en el
// navegador cuando se juega solo, y en los dos sitios decide igual.
//
// ── Lo que sabe decidir, y lo que no ───────────────────────────────────────
//
// Las condiciones las extrae `tools/menus.mjs` y las juzga en cuatro formas —ver
// su cabecera—. Aquí se aplican:
//
//   `necesita.objeto`    se mira el inventario del jugador. Esto sí se puede.
//   `vale: false`        una variable de misión sin poner. **Aquí no hay
//                        misiones**, así que está sin poner de verdad, y la
//                        opción no aparece — igual que en el original.
//   `decidible: false`   no se sabe. La opción **aparece apagada** con su motivo.
//
// Esa última línea es la única diferencia con el juego y es a propósito: allí una
// condición que no se cumple hace que la opción no se registre, o sea que no
// existe. Aquí se manda con `disabled`, que es un tipo del propio motor
// (`MOT_DISABLED`, npcscript.cpp:966), y el jugador ve que hay algo ahí y por qué
// no puede. Es la misma decisión del menú principal con «Visit a Kingdom».

/** Los ocho tipos del motor. `npcscript.cpp:953-973`. */
export const TIPOS = ["callback", "say", "payment", "disabled", "itemdesc", "forgive", "green"];

/**
 * ¿El jugador lleva este objeto? `$item_exists(PARAM1, item_x)`.
 *
 * Los nombres de los scripts son los del catálogo (`item_letter_almund`), que es
 * la misma clave con la que este proyecto guarda el inventario.
 */
export function llevaObjeto(personaje, clave) {
  const dentro = (lista) => Array.isArray(lista) && lista.some((o) =>
    o === clave || o?.clave === clave || o?.id === clave);
  if (dentro(personaje?.inventario)) return true;
  // Las dos manos cuentan: en MSR un objeto en la mano sigue estando en el
  // inventario, pero aquí las manos son campos aparte y no mirarlas dejaría
  // fuera justo lo que el jugador acaba de coger.
  for (const m of Object.values(personaje?.manos ?? {})) if (m && (m === clave || m.clave === clave)) return true;
  return false;
}

/** El oro que pide un `reg.mitem.data` de tipo pago: `gold:10000;item_x`. */
export function costeDe(datos) {
  let oro = 0;
  const objetos = [];
  for (const trozo of String(datos ?? "").split(";").map((s) => s.trim()).filter(Boolean)) {
    if (/^gold:/i.test(trozo)) oro += parseInt(trozo.slice(5), 10) || 0;
    else objetos.push(trozo.includes(":") ? trozo.split(":")[0] : trozo);
  }
  return { oro, objetos };
}

/**
 * ¿Puede el jugador pagar esto? `MOT_PAYMENT`, `msmonsterserver.cpp:2937-2975`.
 *
 * Devuelve `{ puede, falta }`. `falta` es lo que le impide, en texto, porque es
 * lo que el juego enseña — salvo si la opción es `payment_silent`, que
 * precisamente calla («If you can't afford the payment, the game won't tell you
 * what you're missing», msmonster.h:158).
 */
export function puedePagar(personaje, datos) {
  const { oro, objetos } = costeDe(datos);
  const falta = [];
  if (oro && (personaje?.oro ?? 0) < oro) falta.push(`${oro} gold`);
  for (const o of objetos) if (!llevaObjeto(personaje, o)) falta.push(o);
  return { puede: !falta.length, falta };
}

/**
 * Las opciones que le tocan a este jugador delante de este NPC.
 *
 * @param ficha      `build/gatecity/menus.json`, o `null`.
 * @param script     la clave del script del NPC: `gatecity/kendra`.
 * @param personaje  el personaje del jugador, para el inventario y el oro.
 */
export function opcionesDe(ficha, script, personaje = null) {
  const crudas = ficha?.opciones?.[script] ?? [];
  const fuera = [];
  for (const o of crudas) {
    let sirve = true;
    let porque = "";

    for (const j of o.juicio ?? []) {
      if (!j.decidible) {
        // No se sabe: se manda apagada con el motivo. `porque` viaja para que el
        // panel lo pueda enseñar; el motor no manda nada parecido.
        sirve = false;
        porque = porque || `needs: ${j.porque}`;
        continue;
      }
      if (j.necesita?.objeto && !llevaObjeto(personaje, j.necesita.objeto)) {
        // Ésta sí se decide, y la opción NO APARECE, como en el original.
        sirve = null;
        break;
      }
      if (j.necesita?.sinObjeto && llevaObjeto(personaje, j.necesita.sinObjeto)) { sirve = null; break; }
      if (j.vale === false) { sirve = null; break; }
    }
    if (sirve === null) continue;                 // no se registra: no existe

    let tipo = o.tipo;
    if (!sirve) tipo = "disabled";
    // Un pago que no se puede pagar SÍ aparece, y se puede pulsar: el juego te
    // deja intentarlo y te dice qué te falta. Lo que cambia es que aquí se
    // adelanta el motivo, para que el panel no tenga que abrir otra ventana.
    if (tipo === "payment" && personaje) {
      const p = puedePagar(personaje, o.datos);
      if (!p.puede) porque = porque || `needs ${p.falta.join(", ")}`;
    }

    fuera.push({
      titulo: o.titulo,
      tipo,
      datos: o.datos,
      porque,
      // Cuántas de sus condiciones vienen de un `if` viejo, o sea cuántas, al
      // fallar, se llevan también por delante a las opciones de detrás
      // (`break`, script.cpp:5758). Se conserva para las pruebas.
      cortes: o.cortes ?? 0,
    });
  }

  // `Priority` ordena de mayor a menor, y se inserta ANTES del primero con
  // prioridad menor: o sea que con todas a cero se queda el orden de registro.
  // `npcscript.cpp:980-999`. Ninguno de los scripts de Gate City la usa, así que
  // aquí no se ordena nada — y decirlo vale más que un `sort` que no hace nada.
  return fuera;
}

/**
 * El menú del PROPIO JUGADOR, que es lo que contesta el servidor cuando la F se
 * pulsa sin nadie delante.
 *
 *     else pMonster = pPlayer;        client.cpp:679-682
 *
 * ── Esto estaba MAL, y el fallo tiene nombre ───────────────────────────────
 *
 * Aquí había una sola entrada, «Describe <lo que lleves en la mano>», deducida
 * de lo que hace `MOT_DESC` en el cliente (`ShowWeaponDesc(player.ActiveItem())`,
 * vgui_menu_interact.h:183-188). El razonamiento sobre el C++ era correcto y la
 * respuesta era falsa, porque **el menú del jugador no lo decide el C++**: lo
 * decide un script, igual que el de cualquier NPC.
 *
 *     { game_menu_getoptions
 *        if( $get(ent_me,id) equals PARAM1 ) callevent menu_self
 *        else callevent menu_other PARAM1 }
 *                                     player/player_sv_menu.script:11-15
 *
 * Es el mismo error del proyecto una vez más —leer el motor cuando la respuesta
 * está en los datos— y se ve en una captura del juego: seis opciones, no una.
 *
 * ── Las seis, y la condición que las gobierna ──────────────────────────────
 *
 * `menu_self` (player_sv_menu.script:17-64) registra, en este orden:
 *
 *     Sit Down (Rest) / Stand Up   callback  plr_menu_emote  player_sitstand
 *     Emote: Nod Yes               callback  plr_menu_emote  player_nodyes
 *     Emote: Nod No                callback  plr_menu_emote  player_nodno
 *     Emote: Stand At Attention    callback  plr_menu_emote  player_standidle
 *     Item Desc                    itemdesc
 *     Forgive Last PK              forgive
 *
 * Y **sentado el menú encoge**: el mismo `if ( !$get(ent_me,sitting) )` cambia
 * la primera por «Stand Up» y envuelve las tres emociones, así que de pie son
 * seis y sentado son tres. Es la única condición del menú y se porta.
 *
 * Lo que NO se registra: las mascotas, que van detrás de
 * `$get_quest_data(ent_me,pets)` y un personaje nuevo no tiene ninguna.
 *
 * @param personaje  el personaje, por si algún día decide algo. Hoy no: las
 *                   seis opciones no miran el inventario ni el oro.
 * @param estado     `{ sentado }`. `$get(ent_me,sitting)`.
 */
export function opcionesDelJugador(personaje, estado = {}) {
  const sentado = Boolean(estado.sentado);
  const emote = (titulo, datos) => ({ titulo, tipo: "callback", datos, porque: "", callback: "plr_menu_emote" });
  const fuera = [emote(sentado ? "Stand Up" : "Sit Down (Rest)", "player_sitstand")];
  if (!sentado) {
    fuera.push(emote("Emote: Nod Yes", "player_nodyes"));
    fuera.push(emote("Emote: Nod No", "player_nodno"));
    fuera.push(emote("Emote: Stand At Attention", "player_standidle"));
  }
  fuera.push({ titulo: "Item Desc", tipo: "itemdesc", datos: "", porque: "", id: "itemdesc" });
  fuera.push({ titulo: "Forgive Last PK", tipo: "forgive", datos: "", porque: "", id: "forgive" });
  return fuera;
}

/**
 * El menú de OTRO JUGADOR, que está vacío — y no por nuestra culpa.
 *
 * `menu_other` existe, recibe el id de quien mira y **no registra ni una
 * opción**: las cuatro que tenía —Give <arma>, Trade, Invite to Party,
 * Challenge to Duel— están comentadas en el propio archivo
 * (`player_sv_menu.script:74-91` y `:160-186`), con el cuerpo entero dentro de
 * los `//`. O sea que en Master Sword hoy, apuntar a otro jugador y pulsar la F
 * abre un menú con el Cancel y nada más.
 *
 * Se porta así, vacío, porque es lo que hace el juego. Y va en una función
 * propia en vez de un `return []` suelto para que el día que alguien descomente
 * aquello haya un sitio donde ponerlo.
 */
export function opcionesDeOtroJugador() {
  return [];
}
