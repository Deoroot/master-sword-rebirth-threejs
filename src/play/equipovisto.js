// LO QUE SE VE DE LO QUE LLEVAS — el 101.
//
// El muñeco del HUD (`ms_lildude`) y los tres personajes de la pantalla de
// elección salían con el cuerpo pelado. En Master Sword los dos son un
// `CRenderPlayer`, y lo que esa clase hace es dibujar el modelo y, encima,
// **un modelo por cada objeto del `Gear`**:
//
//     CRenderEntity::Render();
//     CItemList &Gear = GetGear();
//     for (int i = 0; i < Gear.size(); i++)
//         RenderGearItem(*Gear[i]);                    clrenderent.cpp:308-312
//
//     ItemEnt.AttachTo(Ent);          // sigue los huesos del cuerpo
//     ItemEnt.curstate.framerate = 0; // sin animación propia
//     if (!ItemEnt.model) return;                      clrenderent.cpp:321-331
//
// Así que la pregunta «¿qué armadura lleva?» no la contesta el cuerpo: la
// contesta CADA OBJETO, con el modelo y el `body` que su guion le haya puesto.
//
// ── DE DÓNDE SALE EL MODELO: DEL GUION, NO DE UNA TABLA ───────────────────
//
// `setmodel` y `setmodelbody` (genericitem.cpp:2199-2225). Una coraza:
//
//     game_deploy   setmodel MODEL_HANDS (misc/p_misc.mdl), body 16 + mano
//                                               items/armor_base.script:70-78
//     game_wear ->  barmor_update_vest:
//                   setmodel armor/p_armorvest_new.mdl
//                   setmodelbody 0 NEW_ARMOR_OFS            (:111-113)
//                   y si es mujer humana, NEW_ARMOR_OFS + 20 (:134-152)
//
// y un yelmo lo mismo con `armor/p_helmets.mdl` y `+ 14`
// (armor_base_helmet.script:29-70). Aquí no hay tabla de «qué armadura es qué
// submodelo»: se corre el guion horneado (`GuionDeObjeto`, el mismo que
// protege desde el 96) y se lee lo que dejó. Es la ÚNICA fuente.
//
// ── LO QUE NO HACE EL MUÑECO, Y ES DEL ORIGINAL ───────────────────────────
//
//   (CORRECCIÓN DEL 101b, al lado y sin reescribir: el punto 1 de abajo es
//   verdad para el MUÑECO y FALSO para la pantalla de elección. Ahí el modelo
//   lleva el `body` GUARDADO del jugador —el que deja `ext_setbodytype`, con
//   las piernas, el torso y los brazos en `blank` bajo una coraza de placas—,
//   y por eso en el juego no asoma el pantalón. Yo leí el `SetBody` del género
//   de `CRenderChar::Render` y di el dato por muerto; ver `cuerpoGuardado`.)
//
//   1. NO ESCONDE EL CUERPO. El jugador de verdad sí: `ext_setbodytype
//      platemail` deja piernas, torso y brazos en `blank`
//      (player/externals.script:1273-1317). Pero el muñeco se pisa el `body`
//      cada fotograma con el género —`m_Ent.SetBody(0..3, 1 ó 2)`,
//      clrenderent.cpp:397-412— y la pantalla de elección igual
//      (vgui_choosecharacter.cpp:1326-1335; lo que usaba `GearInfo.Flags` para
//      esconder está comentado, :1341-1346). La armadura va ENCIMA del cuerpo
//      entero. Se porta así.
//
//   2. EN LA PANTALLA DE ELECCIÓN UNA MUJER LLEVA LA CORAZA DE HOMBRE. Ahí el
//      servidor llama a `game_wear` con DOS parámetros —el género y
//      «char_menu»— (playershared.cpp:1540-1544), pero el guion espera tres
//      (raza, género, quién). Como el objeto no tiene dueño, `$get(ent_owner,
//      …)` da «0» (script.cpp:1198) y el guion cae a `PARAM2`
//      (armor_base.script:129-130), que es «char_menu» y no «female». Jugando
//      sí sale la de mujer, porque hay dueño. Fallo del original, portado: por
//      eso `enLaPantallaDeEleccion` corre el guion SIN dueño.
//
//   3. LO QUE SÓLO CUBRE LAS PIERNAS NO SALE EN EL MUÑECO
//      (clrenderent.cpp:460-465). En los datos del juego no hay ninguna pieza
//      así: todas piden `chest`. Se porta la regla y se dice.

import { GuionDeObjeto, EVENTOS_DEL_OBJETO, QUIEN_VISTE } from "./guionobjeto.js";
import { loQueLleva } from "../juego/personaje.js";
import { GuionDelJugador } from "./guionjugador.js";

/** El modelo del cuerpo (`MODEL_HUMAN_REF`, player/modeldefs.h:5) como clave. */
export const MODELO_DEL_CUERPO = "human/reference.mdl";

/** `hand_e`, genericitem.h:15-18. La IZQUIERDA es el cero. */
export const MANO = Object.freeze({ izquierda: 0, derecha: 1 });

/**
 * `cl_entity_s::SetBody`, clrenderent.cpp:102-117, plegado sobre una lista.
 *
 *     if (Value < pbodypart->nummodels) {
 *         int iCurrent = (curstate.body / pbodypart->base) % pbodypart->nummodels;
 *         curstate.body = (curstate.body - (iCurrent * base) + (Value * base));
 *
 * **Un valor que no existe se IGNORA**, no se recorta: el `body` se queda como
 * estaba. El grupo se comprueba con `<=` (:107), o sea que el motor lee una
 * parte más allá de la última; aquí un grupo que no existe no hace nada, que
 * es una elección nuestra para algo que en el motor es memoria cualquiera.
 *
 * @param {{n:number, base:number}[]} partes  las `bodyparts` del `.mdl`
 * @param {number[][]} cuerpos                los `[grupo, valor]`, en orden
 */
export function cuerpoDe(partes = [], cuerpos = [], desde = 0) {
  let body = desde;
  for (const [grupo, valor] of cuerpos) {
    const p = partes[grupo];
    if (!p || !(valor < p.n) || valor < 0) continue;
    const actual = Math.trunc(body / p.base) % p.n;
    body = body - actual * p.base + valor * p.base;
  }
  return body;
}

/** La ruta de un `setmodel`, como clave: sin `.mdl`, con `/` y en minúsculas. */
export const claveDeModelo = (ruta) => String(ruta ?? "").replace(/\\/g, "/").replace(/\.mdl$/i, "").toLowerCase();

/**
 * EL ASPECTO DE UN OBJETO: qué modelo y qué `[grupo, valor]` deja su guion.
 *
 * Se corre en una entidad DE USAR Y TIRAR, no en la viva de la partida: así
 * preguntar «¿cómo se ve?» no vuelve a sonar un `game_deploy` ni registra otra
 * vez una resistencia. El guion es el mismo.
 *
 *   `mano`    spawn + deploy, con `game.item.hand_index` (genericitem.cpp:683)
 *   `puesto`  spawn + deploy + `game_wear <raza> <género> <quién>` con dueño
 *             (WearItem, genericitem.cpp:1127-1135)
 *   `carga`   spawn + deploy + `game_wear <género> char_menu` SIN dueño: el
 *             bucle de `charinfo_t` (playershared.cpp:1524-1544)
 */
export function aspectoDe({ guiones, id, estado = "puesto", mano = MANO.derecha, genero = "male" } = {}) {
  if (!guiones?.tiene?.(id)) return null;
  const g = genero === "female" ? "female" : "male";
  // El dueño, reducido a lo que el guion le pregunta para vestirse. En `carga`
  // no lo hay, y ESO es el fallo 2 de la cabecera.
  const jugador = estado === "carga" ? null : { personaje: { genero: g }, llamar: () => false };
  const e = new GuionDeObjeto({ guiones, id, jugador });
  e.mano = mano;
  e.llamar(EVENTOS_DEL_OBJETO.NACE);
  e.llamar(EVENTOS_DEL_OBJETO.EMPUNA);
  if (estado === "puesto") e.llamar(EVENTOS_DEL_OBJETO.VISTE, ["human", g, QUIEN_VISTE.JUGANDO]);
  else if (estado === "carga") e.llamar(EVENTOS_DEL_OBJETO.VISTE, [g, QUIEN_VISTE.CARGA]);
  return {
    id, modelo: e.modelo, cuerpos: e.cuerpos.map((c) => [...c]),
    reemplaza: e.armadura?.reemplaza ?? [],
  };
}

/** Los aspectos no cambian entre fotogramas: se guardan por objeto y estado. */
function conMemoria(guiones) {
  const m = (guiones._aspectos ??= new Map());
  return (o) => {
    const k = `${o.id}|${o.estado}|${o.mano}|${o.genero}`;
    if (!m.has(k)) m.set(k, aspectoDe({ guiones, ...o }));
    return m.get(k);
  };
}

/**
 * Lo que del `Gear` está FUERA de un contenedor: lo de las manos, lo puesto y
 * los contenedores, que en Master Sword se llevan puestos (`wearable 1 back`,
 * items/sheath_back.script). Lo demás de `objetos` va dentro de una bolsa y no
 * está en el `Gear` (genericitem.h:24-28).
 */
function aLaVista(personaje, fichaDe) {
  return loQueLleva(personaje).filter((o) =>
    o.mano || o.puesto || fichaDe(o.id)?.tipo === "contenedor");
}

/**
 * LO QUE ESTÁ A LA VISTA Y NO SE PUEDE DIBUJAR PORQUE SU GUION NO ESTÁ HORNEADO.
 *
 * `npm run objetos:guion` hornea lo alcanzable en los mapas portados, no los
 * 760 objetos del catálogo: medido el 101, **124 de las 178 armas no tienen
 * guion horneado**, y sin guion no hay `setmodel` que leer. Esas armas no salen
 * en la mano del muñeco. No es un error y no se puede dejar callado (el 63: «un
 * filtro que descarta en silencio es el sitio donde cabe un pueblo»): quien
 * dibuja lo pregunta aquí y lo dice. Los puños no cuentan: son
 * `HAND_PLAYERHANDS` y su modelo es `none`.
 */
export function aLaVistaSinGuion({ personaje, guiones, fichaDe = () => null } = {}) {
  if (!personaje || !guiones) return [];
  return aLaVista(personaje, fichaDe)
    .filter((o) => !guiones.tiene(o.id) && fichaDe(o.id)?.mano !== "undroppable")
    .map((o) => o.id);
}

/**
 * LAS PIEZAS DEL MUÑECO. `CRenderPlayerInset`, clrenderent.cpp:370-486.
 *
 * Devuelve, en el orden del `Gear`, `{ id, modelo, cuerpos, donde, mano }` de
 * lo que tiene modelo. El `body` entero no se calcula aquí: hace falta el
 * `.mdl` (ver `cuerpoDe` y `piezasConCuerpo`).
 */
export function equipoDelMuneco({ personaje, guiones, fichaDe = () => null } = {}) {
  if (!personaje || !guiones) return [];
  const ver = conMemoria(guiones);
  const genero = personaje.genero === "female" ? "female" : "male";
  const out = [];
  for (const o of aLaVista(personaje, fichaDe)) {
    const enMano = Boolean(o.mano);
    const a = ver({
      id: o.id, genero, estado: enMano ? "mano" : "puesto",
      mano: o.mano === "izquierda" ? MANO.izquierda : MANO.derecha,
    });
    if (!a?.modelo) continue;                                     // `if (!ItemEnt.model) return;`
    // «Item is only worn on the legs - don't show it at all», :460-465.
    if (!enMano && a.reemplaza.length === 1 && a.reemplaza[0] === "legs") continue;
    out.push({ id: o.id, modelo: a.modelo, cuerpos: a.cuerpos, donde: enMano ? "mano" : "cuerpo", mano: o.mano ?? null });
  }
  return out;
}

/**
 * LAS PIEZAS DE UN PERSONAJE GUARDADO, en la pantalla de elección.
 * `charinfo_t` (playershared.cpp:1522-1558) y `CRenderChar::Render`
 * (vgui_choosecharacter.cpp:1247-1301, 1337).
 *
 * A TODO lo del personaje se le manda `game_wear`, también a lo que lleva en la
 * mano (`:1540-1544` no mira `Location`): por eso un escudo empuñado sale aquí
 * colgado a la espalda. No hay regla de las piernas: ésa es del muñeco. El
 * servidor manda como mucho 20 (`V_min(GearInfo.size(), 20)`, player.cpp:6630).
 */
export function equipoEnLaEleccion({ personaje, guiones, fichaDe = () => null } = {}) {
  if (!personaje || !guiones) return [];
  const ver = conMemoria(guiones);
  const genero = personaje.genero === "female" ? "female" : "male";
  const out = [];
  for (const o of aLaVista(personaje, fichaDe).slice(0, 20)) {
    // La mano es la GUARDADA: `pItem->m_Hand = Hand` al rehacer el objeto
    // (global.cpp:290-299). Lo que no va en una mano guarda la última en que
    // estuvo, que este puerto no apunta: se le da el 0, y no se nota porque su
    // `game_wear` le cambia el modelo entero.
    const a = ver({
      id: o.id, genero, estado: "carga",
      mano: o.mano === "derecha" ? MANO.derecha : MANO.izquierda,
    });
    if (!a?.modelo) continue;
    out.push({ id: o.id, modelo: a.modelo, cuerpos: a.cuerpos, donde: o.mano ? "mano" : "cuerpo", mano: o.mano ?? null });
  }
  return out;
}

/**
 * EL `body` QUE EL JUGADOR DEJÓ GUARDADO: qué partes de su cuerpo se ven.
 *
 * Una armadura no sólo trae su modelo: le dice a su dueño que ESCONDA lo que
 * tapa.
 *
 *     { hide_body_parts
 *         callexternal ent_owner ext_setbodytype BARMOR_TYPE $get(ent_me,id)
 *                                               items/armor_base.script:54-58
 *     if ( PLR_BODY_TYPE equals platemail ) {
 *         setmodelbody 0 0            //legs
 *         setmodelbody 1 GENDER_ADJ   //heads
 *         setmodelbody 2 0            //torso
 *         setmodelbody 3 0            //arms      player/externals.script:1311-1317
 *
 * (`leather` sólo quita el torso, :1304-1310.) El submodelo 0 de cada parte de
 * `reference.mdl` es `blank`. Y el motor GUARDA ese `body` para esta pantalla:
 *
 *     //MiB FEB2010a - Keep the player's quest flag updated with what body is in use
 *     //This is used so the character selection screen knows what body to use
 *     //for the mini-player.                          scriptcmds.cpp:6078-6110
 *     int body; //For sending what 'body' the char-selection model should use.
 *                                                     mscharacter.h:86
 *     body = atoi(CharData.m_Quests[i].Data)  ("BODY") playershared.cpp:1505-1514
 *     CharSlot.body = READ_SHORT();   if (CharSlot.body == 0) -> 40 u 80
 *         //Thothie FEB2011_02 - invisible new character fix
 *                                          vgui_choosecharacter.cpp:1141-1152
 *
 * OJO CON LA FUENTE: en el árbol que tenemos (el port a Xash3D) `Render` ya no
 * USA `CharSlot.body` —le pone el género entero, :1326-1335, con un comentario
 * del propio port diciendo que lo cambió (:1244-1245)—. Lo que el juego
 * original enseña lo dice la captura del usuario: bajo la coraza no hay
 * pantalón. Se porta lo que hace el juego, con el dato que el mod guarda para
 * eso.
 *
 * AQUÍ NO SE GUARDA: SE VUELVE A CALCULAR, corriendo el guion del jugador y el
 * de cada pieza PUESTA, en orden, que es lo que pasa al entrar a jugar. Da lo
 * mismo que lo guardado mientras lo puesto no cambie fuera del juego, y vale
 * también para un personaje fabricado que no ha jugado nunca.
 *
 * `ext_setheadtype` (el yelmo que esconde la cabeza) corre por el mismo camino;
 * en los 2 884 guiones ningún yelmo pone `HELM_HIDES_HEAD 1`.
 *
 * @returns {number[][]}  los `[grupo, valor]` sobre `human/reference.mdl`
 */
export function cuerpoGuardado({ personaje, guiones, fichaDelJugador } = {}) {
  if (!personaje || !guiones || !fichaDelJugador) return null;
  const genero = personaje.genero === "female" ? "female" : "male";
  const puestos = (personaje.objetos ?? []).filter((o) => o.puesto && guiones.tiene(o.id)).map((o) => o.id);
  const m = (guiones._cuerpos ??= new Map());
  const k = `${genero}|${puestos.join(",")}`;
  if (m.has(k)) return m.get(k);
  const jugador = new GuionDelJugador({ ficha: fichaDelJugador, personaje: { genero } });
  // Lo que el guion hace al nacer el jugador: saber su género y poner el
  // cuerpo entero (player_main.script:1005-1007 y :233).
  jugador.llamar("ext_set_gender");
  jugador.llamar("ext_setbodytype", ["normal"]);
  for (const id of puestos) {
    const e = new GuionDeObjeto({ guiones, id, jugador });
    e.llamar(EVENTOS_DEL_OBJETO.NACE);
    e.llamar(EVENTOS_DEL_OBJETO.EMPUNA);
    e.llamar(EVENTOS_DEL_OBJETO.VISTE, ["human", genero, QUIEN_VISTE.JUGANDO]);
  }
  const cuerpos = jugador.cuerpos.map((c) => [...c]);
  m.set(k, cuerpos);
  return cuerpos;
}

/**
 * El cuerpo como UNA PIEZA MÁS, cuando no es el entero: el mismo `.mdl` con
 * otro `body`. Quien dibuja esconde la malla entera y cuelga ésta. `null` si
 * el cuerpo se ve entero (o si no se sabe: sin guion del jugador, se deja).
 */
export function piezaDelCuerpo({ cuerpos, genero = "male", manifiesto = null } = {}) {
  const partes = manifiesto?.modelos?.[claveDeModelo(MODELO_DEL_CUERPO)]?.partes;
  if (!cuerpos || !partes) return null;
  const d = genero === "female" ? 2 : 1;                  // `gv`, vgui_choosecharacter.cpp:1330
  const entero = cuerpoDe(partes, partes.map((_, i) => [i, d]));
  if (cuerpoDe(partes, cuerpos) === entero) return null;
  return { id: "(cuerpo)", modelo: MODELO_DEL_CUERPO, cuerpos, donde: "cuerpo", mano: null, esCuerpo: true };
}

/**
 * Las piezas con su `body` entero y la carpeta horneada que le toca.
 *
 * `manifiesto` es `build/msr/equipo.json` (`npm run equipo`): por modelo, sus
 * `partes` y los `cuerpos` horneados. Lo que no esté horneado NO se calla:
 * sale con `carpeta: null` y `porque`, para que quien dibuja lo pueda contar.
 */
export function piezasConCuerpo(piezas = [], manifiesto = null) {
  return piezas.map((p) => {
    const clave = claveDeModelo(p.modelo);
    const m = manifiesto?.modelos?.[clave] ?? null;
    if (!m) return { ...p, clave, cuerpo: null, carpeta: null, porque: `«${p.modelo}» no está horneado` };
    const cuerpo = cuerpoDe(m.partes, p.cuerpos);
    const carpeta = m.cuerpos?.[cuerpo]?.carpeta ?? null;
    return { ...p, clave, cuerpo, carpeta, porque: carpeta ? null : `«${p.modelo}» body ${cuerpo} no está horneado` };
  });
}

/** La firma de un conjunto de piezas: si no cambia, no hay que volver a montar. */
export const firmaDe = (piezas = []) => piezas.map((p) => `${p.clave ?? claveDeModelo(p.modelo)}#${p.cuerpo ?? JSON.stringify(p.cuerpos)}`).join("|");
