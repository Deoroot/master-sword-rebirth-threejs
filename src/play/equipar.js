// PONERSE, QUITARSE Y GUARDAR — el 97.
//
// Hasta el 96 el panel del inventario no movía nada: la armadura sólo se la
// ponía `probe.armadura.vestir`. Este archivo porta los TRES comandos de
// cliente con los que Master Sword mueve un objeto entre la mano, el cuerpo y
// los contenedores, cada uno con su regla del motor y en su orden:
//
//   `remove <id>`           client.cpp:999-1007    el botón «Remove» del panel,
//                                                  o doble clic en una pieza
//                                                  puesta (vgui_containerlist.cpp:
//                                                  170-175, 329-341)
//   `inv transfer <id> 0`   client.cpp:1303-1324   doble clic en un objeto de un
//                                                  contenedor (vgui_containerlist.cpp:
//                                                  199-221), o elegirlo y pulsar
//                                                  «Player Hands» (:288-327)
//   `inv transfer <id> <c>` client.cpp:1309-1316   elegirlo y pulsar un contenedor
//   `use`                   client.cpp:979-997     la tecla `q` (`bind "q" "use"`,
//                                                  config.cfg:25; «Sheath/store/wear
//                                                  weapon/item», kb_act.lst:40)
//
// **No hay un «ponerse» en el panel.** Es lo primero que no se adivina: para
// vestirte la armadura la sacas a la MANO (doble clic) y luego la USAS con la
// `q`, que es `UseItem`: si se puede vestir, se viste; si no, se guarda
// (genericitem.cpp:973-1003). Y quitártela es lo contrario: «Remove» la trae
// a la mano y desde ahí se guarda o se vuelve a poner.
//
// ── LA FORMA DEL DOCUMENTO, que decide todo lo de abajo ────────────────────
//
// En el motor cada objeto es UNA entidad con UN sitio (`m_Location`:
// `ITEMPOS_HANDS` o `ITEMPOS_BODY`, genericitem.h:24-28; `IsWorn()` es
// `m_Location > ITEMPOS_HANDS`, :261), y el fichero de personaje lo escribe UNA
// vez con su sitio y su mano (sv_character.cpp:615-623, `WriteItem` con
// `Location` y `Hand`, :413-419). Aquí eso es:
//
//   - `personaje.manos.derecha` / `.izquierda`: el id de lo que hay en cada mano,
//     y **eso NO está en `personaje.objetos`**;
//   - `personaje.objetos`: todo lo demás, con `puesto: true` lo que lleva en el
//     cuerpo (el campo del 96) y sin él lo que va en un contenedor.
//
// Ver `src/juego/personaje.js` (versión 2 del registro) para por qué antes no
// era así y cómo se abren los personajes viejos.
//
// ── LO QUE NO SE PORTA AQUÍ, dicho ─────────────────────────────────────────
//
//   - QUÉ CONTENEDOR. Este puerto no reparte objetos entre contenedores (lo
//     suelto se ve en el primero, src/main.js). `FindPackForItem` elige uno por
//     el nombre (genericitem.cpp:1154-1201) y aquí se elige igual, pero sólo
//     para el TEXTO del mensaje: el objeto va a la misma lista. Tampoco se mira
//     la capacidad (`Container_CanAcceptItem`): todo cabe.
//
//     ── CORRECCIÓN DEL 98 ──────────────────────────────────────────────────
//     Ya se reparte: src/play/contenedores.js, con el campo `en` de cada
//     entrada. Y el mensaje de arriba ERA FALSO en el caso que el 97 midió: la
//     Blood Drinker no cabe en el Heavy Weapon Holster (`axes;blunt`,
//     sheath_belt_holster.script:10), y `FindPackForItem` la lleva a la Back
//     Sword Sheath. Lo de arriba se queda como estaba.
//   - `game_equipped` del dueño (genericitem.cpp:680) y `game_switchhands`
//     (playershared.cpp:1273-1274): son eventos del JUGADOR y del arma de la
//     otra mano, no del objeto que se mueve.
//   - Los hechizos en la mano (`UseItem` los suelta, genericitem.cpp:983-986):
//     en este puerto no se empuñan.

import { puedeVestir, vestir, fichasPuestas } from "./armadura.js";
import {
  contenedoresDe, contenedorParaGuardar, buscarContenedor, puedeGuardarseEn, noCabeTexto, colocar, claveDe,
} from "./contenedores.js";

/** Las dos manos, en el orden en que el motor las recorre: `LEFT_HAND` es 0. */
export const MANOS = Object.freeze(["izquierda", "derecha"]);

/** `m_PrefHand = RIGHT_HAND; // Right handed (unsettable for now)` — player.cpp:2620. */
export const MANO_DEL_JUGADOR = "derecha";

const otra = (m) => (m === "izquierda" ? "derecha" : "izquierda");

/**
 * La mano que un objeto prefiere: `sethand` (genericitem.cpp:2117-2130), y si
 * el guion no lo dice, `ANY_HAND` (:600). El catálogo lo trae en `mano`.
 */
export function manoQuePide(ficha) {
  const m = String(ficha?.mano ?? "any").toLowerCase();
  if (m === "left") return "izquierda";
  if (m === "right") return "derecha";
  if (m === "both") return "ambas";
  if (m === "undroppable" || m === "playerhands") return "puños";
  return "cualquiera";
}

/** `SPEECH::ItemName` sin cantidad ni prefijo: el nombre que se ve (syntax.cpp:6-29). */
const nombreDe = (ficha, id) => ficha?.nombre ?? id;

/**
 * Lo que una mano lleva, y si lo que lleva va a DOS manos. Un arma a dos manos
 * ocupa UNA casilla —la de `m_PrefHand` del jugador— y llena las dos.
 */
function sostiene(manos, fichaDe) {
  const dos = MANOS.some((h) => manos?.[h] && manoQuePide(fichaDe(manos[h])) === "ambas");
  return { dos };
}

/**
 * EL 97, y desde el 98 SÓLO para la prueba vieja: el contenedor por el nombre,
 * SIN mirar si cabe. La regla entera —`CanPutInPack` en el pedido y la vuelta
 * por todos— es `buscarContenedor` de src/play/contenedores.js.
 *
 * Busca el contenedor al que iría un objeto, para decirlo.
 * `CGenericItem::FindPackForItem` (genericitem.cpp:1154-1201): por el NOMBRE
 * del objeto —`arrow` al carcaj, `swords` a la funda, `blunt`/`axes` a la
 * pistolera—, con `GetContainer(subcadena)` (msmonstershared.cpp:90-97), y si
 * no, el primer contenedor que lleve.
 */
export function contenedorPara(id, contenedores = []) {
  const busca = (sub) => contenedores.find((c) => String(c.id).includes(sub)) ?? null;
  let c = null;
  if (String(id).includes("arrow")) c = busca("quiver");
  else if (String(id).includes("swords")) c = busca("sheath");
  else if (String(id).includes("blunt") || String(id).includes("axes")) c = busca("holster");
  return c ?? contenedores[0] ?? null;
}

/**
 * EL MOTOR DE LAS TRES ÓRDENES. Guarda el personaje y sabe a quién llamar.
 *
 * @param {object}   personaje   el documento (se modifica)
 * @param {Function} fichaDe     id -> ficha del catálogo de objetos
 * @param {Function} objetoDe    id -> su `GuionDeObjeto` vivo, o null
 * @param {Function} decir       (tipo, texto): `nopuedes` es `HUDEVENT_UNABLE`,
 *                               `normal` es `SendInfoMsg`
 * @param {string}   activa      la mano activa (`m_CurrentHand`)
 * @param {boolean}  atacando    `CurrentAttack` del arma activa
 */
export class Equipo {
  constructor({ personaje, fichaDe = () => null, objetoDe = () => null, decir = () => {}, activa = MANO_DEL_JUGADOR,
    atacando = () => false, genero = null, raza = "human", azar = Math.random } = {}) {
    this.p = personaje;
    this.fichaDe = fichaDe;
    this.objetoDe = objetoDe;
    this.decir = decir;
    this.activa = activa;
    this.atacando = atacando;
    this.genero = genero;
    this.raza = raza;
    this.azar = azar;
    // EL 98: lo que llegó sin contenedor (un documento viejo, el suelo, la
    // tienda) se coloca ANTES de mover nada, con la regla de `PutInAnyPack`.
    this.sinSitio = colocar(this.p, this.fichaDe);
    /** Lo que cada orden ha llamado, en orden. Lo lee la prueba: es el ORDEN del motor. */
    this.diario = [];
  }

  _manos() {
    this.p.manos ??= { derecha: null, izquierda: null };
    return this.p.manos;
  }

  _llamar(id, evento, params = []) {
    this.diario.push(`${id}:${evento}`);
    this.objetoDe(id)?.llamar(evento, params);
  }

  /** Los contenedores, con su clave como `id` (lo que nombra el panel). */
  _contenedores() {
    return contenedoresDe(this.p, this.fichaDe).map((c) => ({ ...c, id: c.clave, guion: c.id }));
  }

  /** Saca UNA entrada de la lista (un montón de varios se parte). */
  _sacar(entrada) {
    const lista = this.p.objetos ?? [];
    if ((entrada.n ?? 1) > 1) { entrada.n -= 1; return { ...entrada, n: 1, puesto: undefined }; }
    const i = lista.indexOf(entrada);
    if (i >= 0) lista.splice(i, 1);
    return entrada;
  }

  _entradaDe(id) {
    return (this.p.objetos ?? []).find((o) => (o.uid ?? o.id) === id) ?? (this.p.objetos ?? []).find((o) => o.id === id) ?? null;
  }

  /**
   * `CBasePlayer::NewItemHand`, playershared.cpp:371-500. Devuelve la mano o
   * `{ error }`. `liberar` es `FreeHands`: guardar lo que estorbe, con
   * `PutAway` (genericitem.cpp:1013-1023, que es `UseItem`).
   */
  manoPara(id, { liberar = false } = {}) {
    const manos = this._manos();
    const ficha = this.fichaDe(id);
    const pide = manoQuePide(ficha);
    if (pide === "puños") return { mano: null, error: null, puños: true };
    const { dos } = sostiene(manos, this.fichaDe);
    let mano = null;
    if (!dos) {
      if (pide !== "ambas") {
        // «Check left hand first, so items set to ANY_HAND will go into it first» (:405-411)
        const vale = pide === "cualquiera" ? MANOS : [pide];
        for (const h of MANOS) if (vale.includes(h) && !manos[h]) { mano = h; break; }
      } else {
        mano = MANO_DEL_JUGADOR;
        if (MANOS.some((h) => manos[h])) mano = null;          // :421-430
      }
    }
    // `CheckWeight` es `!fRemovedFromPack`, falso para lo que ya llevas
    // (genericitem.cpp:907-911): ni peso ni volumen aquí.
    if (mano) return { mano, error: null };

    let exito = false;
    let porque;
    if (pide !== "ambas") {
      // «Can hold item, but in the non-preferred hand» (:444-445)
      if (!dos && (pide === "izquierda" || pide === "derecha") && !manos[otra(pide)]) return { mano: otra(pide), error: null };
      if (liberar) {
        const pref = (pide === "izquierda" || pide === "derecha") ? pide : MANO_DEL_JUGADOR;
        if (!manos[pref] || this._guardarLoDeLaMano(pref)) {
          const o = manos[otra(pref)];
          if (o && manoQuePide(this.fichaDe(o)) === "ambas") { if (this._guardarLoDeLaMano(otra(pref))) exito = true; }
          else exito = true;
        }
      }
      porque = "your hands are full";
    } else {
      if (liberar) {
        // El bucle de :474-480: para en la primera que no se puede guardar.
        for (const [i, h] of MANOS.entries()) {
          if (manos[h] && !this._guardarLoDeLaMano(h)) break;
          if (i === MANOS.length - 1) exito = true;
        }
      }
      porque = "you need both hands available";
    }
    // `iAddHand = 0`: con las manos liberadas va a la IZQUIERDA, sea cual sea
    // la que se liberó (:486-487).
    if (exito) return { mano: "izquierda", error: null };
    return { mano: null, error: `You can't get ${nombreDe(ficha, id)} because ${porque}!` };
  }

  /** `PutAway(false)`: `UseItem(false)` y «¿ha salido de la mano?» (genericitem.cpp:1013-1023). */
  _guardarLoDeLaMano(mano) {
    this.usar(mano, { verbose: false });
    return !this._manos()[mano];
  }

  /**
   * A LA MANO: `GiveTo(pPlayer, true, false[, true])`, genericitem.cpp:892-955,
   * y lo que el comando hace después.
   *
   * @param {string} id   lo que se quiere (uid o id de `objetos`)
   * @param {"remove"|"transfer"} orden   `remove <id>` o `inv transfer <id> 0`
   */
  aLaMano(id, orden = "transfer") {
    const entrada = this._entradaDe(id);
    if (!entrada) return { hecho: false, porque: "no lo lleva" };
    // `if (m_NotUseable) return false;` y los proyectiles en vuelo: no hay.
    // `inv transfer` libera las manos (`fPutItemsAway = true`, client.cpp:1320);
    // `remove` no (:1003).
    const r = this.manoPara(entrada.id, { liberar: orden === "transfer" });
    if (r.error) { this.decir("nopuedes", r.error); return { hecho: false, porque: r.error }; }
    if (!r.mano) return { hecho: false, porque: "puños" };
    const sacado = this._sacar(entrada);
    const clave = entrada.id;
    // `RemoveFromOwner()`: el evento, y `m_Location = ITEMPOS_HANDS` — o sea que
    // desde aquí la pieza ya NO está puesta (genericitem.cpp:1548, :1556).
    this._llamar(clave, "game_removefromowner");
    const ent = this.objetoDe(clave);
    if (ent) ent.puesto = false;
    delete sacado.puesto;
    this._manos()[r.mano] = sacado.uid ?? sacado.id;
    // `AddItem(this, true, true)`: `game_newowner` y `game_pickup`
    // (msmonstershared.cpp:351-355), y en el servidor `SwitchHands` a esa mano
    // (:357-360) -> `Deploy` -> `game_deploy` (playershared.cpp:1266-1272,
    // genericitem.cpp:683).
    this._llamar(clave, "game_newowner");
    this._llamar(clave, "game_pickup");
    this.activa = r.mano;
    this._llamar(clave, "game_deploy");
    if (orden === "remove") {
      this._llamar(clave, "game_removepack");                 // client.cpp:1006
    } else {
      this._llamar(clave, "removefrompack");                  // «old», client.cpp:1321
      this._llamar(clave, "game_removefrompack");             // :1322
    }
    return { hecho: true, mano: r.mano };
  }

  /**
   * LA `q`: `CBasePlayer::UseItem(m_CurrentHand)` -> `CGenericItem::UseItem`
   * (playershared.cpp:735-806, genericitem.cpp:973-1003).
   */
  usar(mano = this.activa, { verbose = true } = {}) {
    const manos = this._manos();
    const id = manos[mano];
    // `if (pUse && !pUse->UseItem(...))`: con la mano vacía no pasa nada y
    // devuelve `true` (:793-806).
    if (!id) return { hecho: false, porque: "mano vacía" };
    if (this.atacando()) return { hecho: false, porque: "atacando" };     // `if (CurrentAttack) return false;`
    const ficha = this.fichaDe(id);
    // `if (Verbose && !CanPutinInventory()) return false;` con
    // `CanPutinInventory = CanWearItem() || FindPackForItem(...)`
    // (genericitem.cpp:991-992, :1026-1033). `CanWearItem` es VERBOSO en el
    // servidor siempre (`#ifdef VALVE_DLL true`, :1040-1045), así que un chaleco
    // que no cabe dice «You have no more chest slots» AQUÍ y otra vez en
    // `WearItem` de abajo. Dos veces, como en el juego.
    if (verbose) {
      const cabe = ficha?.vestible ? this._puedeVestir(id, ficha, true) : false;
      // EL 98: `FindPackForItem(m_pPlayer, false)` DE VERDAD —con lo que cabe—,
      // y no «hay algún contenedor». Así que un chaleco que no se puede vestir
      // y no cabe en ninguno se calla aquí, con UN aviso y no dos: el segundo
      // `CanWearItem` es el de `WearItem`, y a ése ya no se llega.
      if (!cabe && !buscarContenedor(this.p, { id, n: 1 }, this.fichaDe)) {
        return { hecho: false, porque: "ni se viste ni cabe en ningún contenedor" };
      }
    }
    if (ficha?.vestible) {
      const r = this._vestirDeLaMano(mano, id, ficha);
      if (r.hecho) return r;
      // «MiB Jul2008a - If a wearable item can't be worn, try to put it in a pack» (:994-996)
    }
    return this._guardarEnAlguno(mano, id, ficha);
  }

  _puedeVestir(id, ficha, decir) {
    const c = puedeVestir({ ficha, puestas: fichasPuestas(this.p.objetos ?? [], this.fichaDe) });
    if (!c.puede && decir && c.mensaje) this.decir("normal", c.mensaje.trimEnd());
    return c.puede;
  }

  /**
   * `WearItem` (genericitem.cpp:1123-1145): `CanWearItem`, `game_wear` con raza,
   * género y «CGenericItem::WearItem», `m_Location = ITEMPOS_BODY`, y si era lo
   * activo, `SwitchToBestHand`. La regla y su orden ya están en `vestir` de
   * src/play/armadura.js; aquí se le da la entrada que la mano no tenía.
   */
  _vestirDeLaMano(mano, id, ficha) {
    const entrada = { id, n: 1 };
    const r = vestir({
      entrada, ficha, objeto: this.objetoDe(id),
      puestas: fichasPuestas(this.p.objetos ?? [], this.fichaDe),
      raza: this.raza, genero: this.genero ?? this.p.genero ?? "male",
    });
    this.diario.push(`${id}:${r.puesto ? "game_wear" : "no cabe"}`);
    if (r.mensaje) this.decir("normal", r.mensaje.trimEnd());
    if (!r.puesto) return { hecho: false, porque: r.porque };
    this._manos()[mano] = null;
    (this.p.objetos ??= []).push(entrada);
    if (this.activa === mano) this._mejorMano();
    return { hecho: true, que: "vestido", id };
  }

  /**
   * `CBasePlayer::PutInAnyPack` (playershared.cpp:706-733) -> `PutInPack`
   * (:673-699) -> `CGenericItem::PutInPack` (genericitem.cpp:1241-1275).
   */
  _guardarEnAlguno(mano, id, ficha) {
    // EL 98: con UN contenedor se intenta ése sin buscar; con más, el de
    // `FindPackForItem` con lo que cabe (src/play/contenedores.js).
    const { caja } = contenedorParaGuardar(this.p, { id, n: 1 }, this.fichaDe);
    if (!caja) {
      // `SendEventMsg(HUDEVENT_UNABLE, ... + " won't fit into any of your packs")`
      // (playershared.cpp:726-731). Los hechizos se callan.
      if (ficha?.tipo !== "hechizo") this.decir("nopuedes", `${nombreDe(ficha, id)} won't fit into any of your packs`);
      return { hecho: false, porque: "sin contenedor" };
    }
    return this.guardarEn(mano, caja.clave);
  }

  /**
   * `inv transfer <id> <contenedor>` desde la mano, o el final de `UseItem`.
   * `game_putinpack` va ANTES de soltarlo («AUG2010_28 call BEFORE we actually
   * remove the item», genericitem.cpp:1249-1250), luego `RemoveItem` —que
   * llama a `game_removefromowner` (:1548) y, si era lo activo, cambia de mano
   * (msmonstershared.cpp:362-381)—, y el mensaje con su salto de línea.
   */
  guardarEn(mano, cajaId) {
    const manos = this._manos();
    const id = manos[mano];
    if (!id) return { hecho: false, porque: "mano vacía" };
    const caja = contenedoresDe(this.p, this.fichaDe).find((c) => c.clave === cajaId);
    if (!caja) return { hecho: false, porque: "no es un contenedor" };
    const ficha = this.fichaDe(id);
    const entrada = { id, n: 1 };
    // EL 98: `CGenericItem::PutInPack` empieza por `if (!CanPutInPack(pContainer))
    // return false;` (genericitem.cpp:1243-1244) —ANTES de `game_putinpack`— y
    // `CBasePlayer::PutInPack` lo dice con una de sus dos frases
    // (playershared.cpp:676-688).
    if (!puedeGuardarseEn(this.p, caja, entrada, this.fichaDe)) {
      if (ficha?.tipo !== "hechizo") this.decir("normal", noCabeTexto(nombreDe(ficha, id), caja.nombre, this.azar));
      this.diario.push(`${id}:no cabe en ${caja.id}`);
      return { hecho: false, porque: "no cabe", en: caja.clave };
    }
    this._llamar(id, "game_putinpack");
    const eraActiva = this.activa === mano;
    this._llamar(id, "game_removefromowner");
    manos[mano] = null;
    (this.p.objetos ??= []).push({ ...entrada, en: caja.clave });
    if (eraActiva) this._mejorMano();
    this.decir("normal", `You put ${nombreDe(ficha, id)} in ${caja.nombre}`);
    return { hecho: true, que: "guardado", id, en: caja.clave };
  }

  /**
   * DE UN CONTENEDOR A OTRO: `inv transfer <id> <contenedor>` con el objeto
   * dentro de un contenedor (client.cpp:1303-1316 -> `CBasePlayer::PutInPack`,
   * playershared.cpp:673-699). La misma regla que desde la mano: si no cabe,
   * una de las dos frases y no se mueve. Y al MISMO contenedor tampoco cabe
   * (`ItemExists`, genitemlist.cpp:9-11): el motor dice «can't fit». El 98.
   */
  moverA(claveObjeto, cajaId) {
    const entrada = (this.p.objetos ?? []).find((o) => claveDe(o) === claveObjeto && !o.puesto) ?? null;
    if (!entrada) return { hecho: false, porque: "no lo lleva" };
    const caja = contenedoresDe(this.p, this.fichaDe).find((c) => c.clave === cajaId);
    if (!caja) return { hecho: false, porque: "no es un contenedor" };
    const ficha = this.fichaDe(entrada.id);
    if (!puedeGuardarseEn(this.p, caja, entrada, this.fichaDe)) {
      if (ficha?.tipo !== "hechizo") this.decir("normal", noCabeTexto(nombreDe(ficha, entrada.id), caja.nombre, this.azar));
      this.diario.push(`${entrada.id}:no cabe en ${caja.id}`);
      return { hecho: false, porque: "no cabe", en: caja.clave };
    }
    this._llamar(entrada.id, "game_putinpack");
    this._llamar(entrada.id, "game_removefromowner");
    entrada.en = caja.clave;
    this.decir("normal", `You put ${nombreDe(ficha, entrada.id)} in ${caja.nombre}`);
    return { hecho: true, que: "movido", id: entrada.id, en: caja.clave };
  }

  /** `SwitchToBestHand` (playershared.cpp:1280-1293): la preferida, la otra, los puños. */
  _mejorMano() {
    const manos = this._manos();
    if (manos[MANO_DEL_JUGADOR]) this.activa = MANO_DEL_JUGADOR;
    else if (manos[otra(MANO_DEL_JUGADOR)]) this.activa = otra(MANO_DEL_JUGADOR);
    else this.activa = MANO_DEL_JUGADOR;
    if (manos[this.activa]) this._llamar(manos[this.activa], "game_deploy");
  }
}
