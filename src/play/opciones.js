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
      // Se conserva para poder decir en las pruebas de dónde viene cada una.
      guardaSoloElTitulo: o.guardaSoloElTitulo ?? null,
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
 * El del jugador trae la descripción del objeto que lleva en la mano
 * (`MOT_DESC` → `ShowWeaponDesc(player.ActiveItem())`,
 * vgui_menu_interact.h:183-188). Sin nada en la mano no hay nada que describir, y
 * el menú se queda con el Cancel — que es lo que hace el original.
 */
export function opcionesDelJugador(personaje) {
  const mano = personaje?.manos?.derecha ?? personaje?.manos?.izquierda ?? null;
  if (!mano) return [];
  const nombre = typeof mano === "string" ? mano : (mano.nombre ?? mano.clave ?? "item");
  return [{ titulo: `Describe ${nombre}`, tipo: "itemdesc", datos: "", porque: "" }];
}
